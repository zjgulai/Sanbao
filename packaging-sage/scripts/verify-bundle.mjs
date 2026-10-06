import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertDirectory, assertRegularFile, loadConfig, sha256File } from './lib.mjs'
import { signingNormalizedTreeDigest } from './signing-normalized-tree.mjs'

const app = process.argv[2]
if (app === undefined) {
  process.stderr.write('usage: node verify-bundle.mjs <Sage.app>\n')
  process.exit(2)
}

function plistValue(plist, key) {
  return execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim()
}

function plistHas(plist, key) {
  return spawnSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist], { stdio: 'ignore' }).status === 0
}

function expect(value, expected, label) {
  if (value !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, observed ${JSON.stringify(value)}`)
}

try {
  const config = loadConfig()
  const root = assertDirectory(app, 'Sage app')
  if (!root.endsWith('/Sage.app')) throw new Error('assembled bundle must be named Sage.app')
  const contents = join(root, 'Contents')
  const outerPlist = assertRegularFile(join(contents, 'Info.plist'), 'outer Info.plist')
  const outerExpected = {
    CFBundleName: config.productName,
    CFBundleDisplayName: config.productName,
    CFBundleExecutable: config.productName,
    CFBundleIdentifier: config.bundleId,
    CFBundleIconFile: 'Sage.icns',
    CFBundleShortVersionString: config.version,
    CFBundleVersion: config.build,
    LSApplicationCategoryType: 'public.app-category.productivity',
  }
  for (const [key, value] of Object.entries(outerExpected)) expect(plistValue(outerPlist, key), value, `outer ${key}`)
  for (const key of [
    'NSAppTransportSecurity',
    'NSCameraUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSAudioCaptureUsageDescription',
    'NSBluetoothAlwaysUsageDescription',
    'NSBluetoothPeripheralUsageDescription',
    'ElectronAsarIntegrity',
  ]) {
    if (plistHas(outerPlist, key)) throw new Error(`outer Info.plist must not inherit ${key}`)
  }

  assertRegularFile(join(contents, 'MacOS', 'Sage'), 'Sage executable')
  if (existsSync(join(contents, 'MacOS', 'Electron'))) throw new Error('legacy Electron executable name remains in outer bundle')
  assertRegularFile(join(contents, 'Resources', 'Sage.icns'), 'Sage icon')
  assertDirectory(join(contents, 'Resources', 'app'), 'Sage app runtime')
  assertDirectory(join(contents, 'Resources', 'sage-profile-template'), 'Sage profile template')
  assertRegularFile(join(contents, 'Resources', 'sage-build.json'), 'Sage build metadata')
  if (existsSync(join(contents, 'Resources', 'electron.icns'))) throw new Error('legacy Electron icon remains in bundle')
  if (existsSync(join(contents, 'Resources', 'default_app.asar'))) throw new Error('Electron default app fallback remains in bundle')

  const helperRows = [
    ['Sage Helper', `${config.bundleId}.helper`, 'Sage Helper'],
    ['Sage Helper (Renderer)', `${config.bundleId}.helper.renderer`, 'Sage Helper (Renderer)'],
    ['Sage Helper (GPU)', `${config.bundleId}.helper.gpu`, 'Sage Helper (GPU)'],
    ['Sage Helper (Plugin)', `${config.bundleId}.helper.plugin`, 'Sage Helper (Plugin)'],
  ]
  for (const [name, identifier, executable] of helperRows) {
    const helper = join(contents, 'Frameworks', `${name}.app`)
    const plist = assertRegularFile(join(helper, 'Contents', 'Info.plist'), `${name} Info.plist`)
    assertRegularFile(join(helper, 'Contents', 'MacOS', executable), `${name} executable`)
    expect(plistValue(plist, 'CFBundleName'), name, `${name} CFBundleName`)
    expect(plistValue(plist, 'CFBundleExecutable'), executable, `${name} CFBundleExecutable`)
    expect(plistValue(plist, 'CFBundleIdentifier'), identifier, `${name} CFBundleIdentifier`)
  }
  for (const oldName of ['Electron Helper.app', 'Electron Helper (Renderer).app', 'Electron Helper (GPU).app', 'Electron Helper (Plugin).app']) {
    if (existsSync(join(contents, 'Frameworks', oldName))) throw new Error(`legacy helper bundle remains: ${oldName}`)
  }

  const metadata = JSON.parse(readFileSync(join(contents, 'Resources', 'sage-build.json'), 'utf8'))
  expect(metadata.schemaVersion, 4, 'build metadata schemaVersion')
  expect(metadata.product?.bundleId, config.bundleId, 'build metadata bundleId')
  expect(metadata.product?.version, config.version, 'build metadata version')
  expect(metadata.product?.architecture, config.arch, 'build metadata architecture')
  expect(metadata.product?.distribution, config.distribution, 'build metadata distribution')
  expect(metadata.signing?.identityCommonName, config.signing.identityCommonName, 'build metadata signing identity')
  if (typeof metadata.runtime?.profileGeneration !== 'string'
    || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(metadata.runtime.profileGeneration)
    || typeof metadata.runtime?.profileManifestSha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(metadata.runtime.profileManifestSha256)
    || typeof metadata.runtime?.artifactAttestationDigest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/u.test(metadata.runtime.artifactAttestationDigest)) {
    throw new Error('build metadata does not bind a valid bundled profile template')
  }
  for (const key of [
    'sourceAppRuntimeTreeSha256',
    'sourceProfileTemplateTreeSha256',
    'sourceElectronBaseAppTreeSha256',
    'iconSha256',
    'packagingDefinitionTreeSha256',
  ]) {
    if (typeof metadata.inputs?.[key] !== 'string' || !/^[a-f0-9]{64}$/u.test(metadata.inputs[key])) {
      throw new Error(`build metadata does not bind ${key}`)
    }
  }
  for (const key of [
    'appRuntimeSigningNormalizedTreeSha256',
    'profileTemplateSigningNormalizedTreeSha256',
  ]) {
    if (typeof metadata.assembly?.[key] !== 'string' || !/^[a-f0-9]{64}$/u.test(metadata.assembly[key])) {
      throw new Error(`build metadata does not bind ${key}`)
    }
  }
  expect(
    signingNormalizedTreeDigest(join(contents, 'Resources', 'app')),
    metadata.assembly.appRuntimeSigningNormalizedTreeSha256,
    'embedded app runtime signing-normalized tree digest',
  )
  expect(
    signingNormalizedTreeDigest(join(contents, 'Resources', 'sage-profile-template')),
    metadata.assembly.profileTemplateSigningNormalizedTreeSha256,
    'embedded profile template signing-normalized tree digest',
  )
  expect(
    sha256File(join(contents, 'Resources', 'Sage.icns')),
    metadata.inputs.iconSha256,
    'embedded icon digest',
  )
  if (typeof metadata.source?.commit !== 'string' || !/^[a-f0-9]{40}$/u.test(metadata.source.commit)
    || typeof metadata.source?.relevantTrackedWorktreeClean !== 'boolean'
    || metadata.source.provenance !== 'source-context-plus-input-byte-digests') {
    throw new Error('build metadata source provenance has an unsupported shape')
  }
  process.stdout.write('[sage-packaging] bundle identity verified\n')
} catch (error) {
  process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
