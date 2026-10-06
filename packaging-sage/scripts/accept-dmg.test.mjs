import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  assertDmgReceipt,
  buildLaunchEnvironment,
  classifyLaunchLog,
  devicesForImage,
  parseArgs,
  parseAttachResult,
  parseProcessRows,
  waitForOwnedProcessGroup,
} from './accept-dmg.mjs'
import { loadConfig } from './lib.mjs'

const scriptsRoot = fileURLToPath(new URL('.', import.meta.url))

test('parses the bounded acceptance CLI', () => {
  assert.deepEqual(parseArgs(['--dmg', '/release/Sage.dmg', '--evidence', '/staging/evidence']), {
    dmg: '/release/Sage.dmg',
    evidence: '/staging/evidence',
    timeoutMs: 90_000,
  })
  assert.deepEqual(parseArgs(['--help']), { help: true })
  assert.throws(() => parseArgs(['--dmg', '/release/Sage.dmg']), /usage/u)
  assert.throws(() => parseArgs(['--dmg', '/release/Sage.dmg', '--evidence', '/staging/evidence', '--timeout-ms', '12']), /10000/u)
  assert.throws(() => parseArgs(['--unknown']), /unknown argument/u)
})

test('selects the unique mounted slice instead of the first plist entity', () => {
  const value = {
    'system-entities': [
      { 'dev-entry': '/dev/disk9' },
      { 'dev-entry': '/dev/disk9s1', 'content-hint': 'GUID_partition_scheme' },
      { 'dev-entry': '/dev/disk9s2', 'mount-point': '/tmp/sage-accept' },
    ],
  }
  assert.deepEqual(parseAttachResult(value, '/tmp/sage-accept'), {
    device: '/dev/disk9s2',
    mountpoint: '/tmp/sage-accept',
  })
  assert.throws(() => parseAttachResult(value, '/tmp/sage-accept-2'), /unexpected path/u)
})

test('rejects malformed or ambiguous hdiutil attachment ownership', () => {
  assert.throws(() => parseAttachResult({}, '/tmp/sage-accept'), /system-entities/u)
  assert.throws(() => parseAttachResult({ 'system-entities': [
    { 'dev-entry': '/dev/disk1s1', 'mount-point': '/tmp/one' },
    { 'dev-entry': '/dev/disk2s1', 'mount-point': '/tmp/two' },
  ] }, '/tmp/one'), /exactly one/u)
  assert.throws(() => parseAttachResult({ 'system-entities': [
    { 'dev-entry': '/tmp/not-a-device', 'mount-point': '/tmp/sage-accept' },
  ] }, '/tmp/sage-accept'), /exact disk device/u)
})

test('finds only devices owned by the exact image path', () => {
  const info = {
    images: [
      { 'image-path': '/release/Sage.dmg', 'system-entities': [{ 'dev-entry': '/dev/disk7' }, { 'dev-entry': '/dev/disk7s1' }] },
      { 'image-path': '/release/Sage-copy.dmg', 'system-entities': [{ 'dev-entry': '/dev/disk8' }] },
    ],
  }
  assert.deepEqual(devicesForImage(info, '/release/Sage.dmg'), ['/dev/disk7', '/dev/disk7s1'])
  assert.deepEqual(devicesForImage(info, '/release/Sage'), [])
  assert.deepEqual(devicesForImage({}, '/release/Sage.dmg'), [])
})

test('validates the exact DMG receipt including signing and volume closure', () => {
  const config = loadConfig()
  const appTreeSha256 = 'c'.repeat(64)
  const entries = [
    { path: 'Applications', type: 'symlink', mode: '777', target: '/Applications' },
    { path: 'Sage.app', type: 'directory', mode: '755', treeSha256: appTreeSha256 },
  ]
  const artifact = { name: config.dmg.fileName, bytes: 123, sha256: 'd'.repeat(64) }
  const receipt = {
    schemaVersion: 'sage.dmg-receipt.v1',
    phase: 'dmg',
    product: config.productName,
    bundleId: config.bundleId,
    version: config.version,
    build: config.build,
    architecture: config.arch,
    distribution: config.distribution,
    artifact: { type: 'file', ...artifact },
    app: { name: 'Sage.app', treeSha256: appTreeSha256 },
    signing: {
      mode: config.signing.mode,
      identityCommonName: config.signing.identityCommonName,
      certificateSha256: 'a'.repeat(64),
      certificateSha1: 'b'.repeat(40),
      timestamp: 'none',
      hardenedRuntime: config.signing.hardenedRuntime,
      appSandbox: config.signing.appSandbox,
      notarized: config.signing.notarized,
    },
    volume: {
      format: config.dmg.format,
      name: config.dmg.volumeName,
      readOnly: true,
      entries,
      treeSha256: createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
    },
  }
  assert.equal(assertDmgReceipt(receipt, config, artifact), receipt)
  assert.throws(() => assertDmgReceipt({ ...receipt, extra: true }, config, artifact), /receipt keys/u)
  assert.throws(() => assertDmgReceipt({ ...receipt, app: { ...receipt.app, treeSha256: 'e'.repeat(64) } }, config, artifact), /app and volume/u)
  assert.throws(() => assertDmgReceipt({ ...receipt, signing: { ...receipt.signing, certificateSha1: 'bad' } }, config, artifact), /SHA-1/u)
  assert.throws(() => assertDmgReceipt({ ...receipt, volume: { ...receipt.volume, readOnly: false } }, config, artifact), /read-only/u)
})

test('filters exact process-group members without claiming unrelated processes', () => {
  const rows = [
    '  101   101 /Applications/Sage.app/Contents/MacOS/Sage',
    '  102   101 Sage Helper',
    '  201   201 unrelated',
    '',
  ].join('\n')
  assert.deepEqual(parseProcessRows(rows, 101), [
    { pid: 101, pgid: 101, command: '/Applications/Sage.app/Contents/MacOS/Sage' },
    { pid: 102, pgid: 101, command: 'Sage Helper' },
  ])
  assert.deepEqual(parseProcessRows(rows, 999), [])
})

test('requires one phase-correct profile state before one Host ready marker', () => {
  assert.deepEqual(classifyLaunchLog('', 'installed'), { ready: false })
  assert.deepEqual(classifyLaunchLog('sage shell: bundled profile installed\n', 'installed'), { ready: false })
  assert.deepEqual(
    classifyLaunchLog('sage shell: bundled profile installed\nsage shell: host ready, dsh 1.0.0\n', 'installed'),
    { ready: true, profileMarker: 'sage shell: bundled profile installed', hostReady: true },
  )
  assert.deepEqual(
    classifyLaunchLog('sage shell: bundled profile existing\nsage shell: host ready, dsh 1.0.0\n', 'existing'),
    { ready: true, profileMarker: 'sage shell: bundled profile existing', hostReady: true },
  )
  assert.throws(() => classifyLaunchLog('sage shell: host ready, dsh 1.0.0\n', 'installed'), /before/u)
  assert.throws(() => classifyLaunchLog('sage shell: bundled profile existing\nsage shell: host ready, dsh 1.0.0\n', 'installed'), /unexpected/u)
  assert.throws(() => classifyLaunchLog('sage shell: bundled profile installed\nsage shell: bundled profile installed\n', 'installed'), /more than once/u)
})

test('waits for the detached child PGID and scrubs injected launch variables', () => {
  const observations = [999, 999, 101]
  let pauses = 0
  assert.equal(waitForOwnedProcessGroup(101, () => observations.shift(), () => { pauses += 1 }, 4), 101)
  assert.equal(pauses, 2)
  assert.throws(() => waitForOwnedProcessGroup(101, () => 999, () => {}, 2), /did not settle/u)
  assert.deepEqual(buildLaunchEnvironment({
    HOME: '/Users/test',
    TMPDIR: '/tmp/test',
    LANG: 'zh_CN.UTF-8',
    NODE_OPTIONS: '--require attacker.js',
    ELECTRON_RUN_AS_NODE: '1',
    SAGE_FIXTURE_PROJECTION: '1',
    DYLD_INSERT_LIBRARIES: '/tmp/attack.dylib',
  }, '/tmp/fresh-sage-root'), {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    SAGE_ROOT: '/tmp/fresh-sage-root',
    HOME: '/Users/test',
    TMPDIR: '/tmp/test',
    LANG: 'zh_CN.UTF-8',
  })
})

test('orchestrator contains no broad process-name cleanup', () => {
  const source = readFileSync(join(scriptsRoot, 'accept-dmg.mjs'), 'utf8')
  assert.doesNotMatch(source, /\b(?:pkill|killall)\b/u)
  assert.match(source, /process\.kill\(-pgid,/u)
  assert.match(source, /detached: true/u)
  assert.doesNotMatch(source, /\bopen\s+-a\b/u)
})

test('packaged live phases make renderer console errors blocking', () => {
  const source = readFileSync(join(scriptsRoot, '..', '..', 'apps', 'sage-shell', 'test', 'support', 'desktop-live-check.mjs'), 'utf8')
  assert.match(source, /assert\.deepEqual\(consoleErrors, \[\]\)/u)
})
