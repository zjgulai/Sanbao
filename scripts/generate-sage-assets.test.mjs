import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { nodeCommand } from './lib/real-node.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(repoRoot, 'scripts', 'generate-sage-assets.mjs')
const source = process.env.SAGE_TEST_SOURCE
const sourceUnavailable = !source || !existsSync(source)
const { command: NODE, env: NODE_ENV } = nodeCommand()

function run(args) {
  return spawnSync(NODE, [script, ...args], { cwd: repoRoot, encoding: 'utf8', env: NODE_ENV })
}

function refreshManifestHash(manifestPath, changedPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const output = manifest.outputs.find((entry) => entry.path === changedPath)
  output.sha256 = createHash('sha256').update(readFileSync(join(dirname(manifestPath), changedPath))).digest('hex')
  const { manifestCanonicalSha256, ...unsigned } = manifest
  manifest.manifestCanonicalSha256 = createHash('sha256').update(`${JSON.stringify(unsigned, null, 2)}\n`).digest('hex')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

function hashes(root) {
  return execFileSync('shasum', ['-a', '256', ...[
    'manifest.json', 'sage-symbol-plain.svg', 'sage-symbol-dark.svg', 'sage-symbol-light.svg', 'Sage-lockup.svg', 'Sage.icns',
    ...[
      'icon_16x16.png', 'icon_16x16@2x.png', 'icon_32x32.png', 'icon_32x32@2x.png', 'icon_128x128.png',
      'icon_128x128@2x.png', 'icon_256x256.png', 'icon_256x256@2x.png', 'icon_512x512.png', 'icon_512x512@2x.png',
    ].map((name) => `AppIcon.iconset/${name}`),
  ].map((path) => join(root, path))], { encoding: 'utf8' })
    .trim().split('\n').map((line) => line.split(/\s+/)[0])
}

test('Sage 资产从锁定来源重复生成，manifest 与目录双向一致', { skip: sourceUnavailable && 'UNVERIFIABLE: set SAGE_TEST_SOURCE to the audited upstream SVG' }, (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sage-assets-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const copiedSource = join(root, 'source.svg')
  cpSync(source, copiedSource)
  const first = join(root, 'first')
  const second = join(root, 'second')
  for (const out of [first, second]) {
    const result = run(['--source', copiedSource, '--out', out])
    assert.equal(result.status, 0, result.stderr)
    const checked = run(['--source', copiedSource, '--out', out, '--check'])
    assert.equal(checked.status, 0, checked.stderr)
  }
  assert.deepEqual(hashes(first), hashes(second), 'two temporary builds must have identical artifact hashes')
  const manifest = JSON.parse(readFileSync(join(first, 'manifest.json'), 'utf8'))
  assert.equal(manifest.releaseGate.status, 'blocked')
  assert.equal(manifest.releaseGate.phase, 'P1 public release')
  assert.equal(manifest.approval.rights, 'unapproved')
  assert.equal(manifest.outputs.length, 15)
})

test('Sage asset verifier rejects source hash, Sage metadata, and asset-list drift', { skip: sourceUnavailable && 'UNVERIFIABLE: set SAGE_TEST_SOURCE to the audited upstream SVG' }, (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sage-assets-negative-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const copiedSource = join(root, 'source.svg')
  cpSync(source, copiedSource)
  const output = join(root, 'output')
  assert.equal(run(['--source', copiedSource, '--out', output]).status, 0)
  assert.notEqual(run(['--source', copiedSource, '--out', output]).status, 0, 'canonical output must refuse in-place replacement')

  writeFileSync(copiedSource, `${readFileSync(copiedSource, 'utf8')}\n`)
  assert.notEqual(run(['--source', copiedSource, '--out', join(root, 'must-not-generate')]).status, 0, 'source SHA-256 drift must stop generation')
  cpSync(source, copiedSource)

  const plain = join(output, 'sage-symbol-plain.svg')
  writeFileSync(plain, readFileSync(plain, 'utf8').replace('aria-label="Sage"', 'aria-label="SanBao"'))
  assert.notEqual(run(['--source', copiedSource, '--out', output, '--check']).status, 0, 'prohibited metadata must fail closed')
  const output2 = join(root, 'output2')
  assert.equal(run(['--source', copiedSource, '--out', output2]).status, 0)

  const manifestPath = join(output2, 'manifest.json')
  const pathMutated = join(output2, 'sage-symbol-plain.svg')
  writeFileSync(pathMutated, readFileSync(pathMutated, 'utf8').replace('M0 0 C3.22', 'M0.1 0 C3.22'))
  refreshManifestHash(manifestPath, 'sage-symbol-plain.svg')
  assert.notEqual(run(['--out', output2, '--check']).status, 0, 'SVG path plus synchronized manifest hash must fail the geometry-anchor rebuild')

  const output3 = join(root, 'output3')
  assert.equal(run(['--source', copiedSource, '--out', output3]).status, 0)
  const icns = join(output3, 'Sage.icns')
  writeFileSync(icns, Buffer.concat([readFileSync(icns), Buffer.from([0])]))
  refreshManifestHash(join(output3, 'manifest.json'), 'Sage.icns')
  assert.notEqual(run(['--out', output3, '--check']).status, 0, 'ICNS plus synchronized manifest hash must fail the anchor rebuild')

  const output4 = join(root, 'output4')
  assert.equal(run(['--source', copiedSource, '--out', output4]).status, 0)
  const listManifest = join(output4, 'manifest.json')
  const manifest = JSON.parse(readFileSync(listManifest, 'utf8'))
  manifest.outputs.pop()
  writeFileSync(listManifest, `${JSON.stringify(manifest, null, 2)}\n`)
  assert.notEqual(run(['--out', output4, '--check']).status, 0, 'manifest asset-list drift must fail closed')
})
