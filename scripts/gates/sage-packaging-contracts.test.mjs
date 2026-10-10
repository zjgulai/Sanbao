import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import {
  SAGE_PACKAGING_CONTRACT_TESTS,
  SAGE_PACKAGING_EXPECTED_TEST_COUNT,
  checkSagePackagingContractManifest,
  inspectSagePackagingTestManifest,
  validateSagePackagingTestManifest,
} from './sage-packaging-contracts.mjs'
import { nodeCommand } from '../lib/real-node.mjs'

const repoRoot = join(dirname(new URL(import.meta.url).pathname), '..', '..')

test('filesystem packaging test manifest covers exactly fourteen layered entrypoints', () => {
  const result = checkSagePackagingContractManifest(repoRoot)
  assert.equal(result.status, 'pass', result.violations.join('\n'))
  assert.equal(result.expected, 14)
  assert.equal(result.discovered, 14)
  assert.deepEqual(inspectSagePackagingTestManifest(repoRoot).layers, {
    pure: 9,
    platform: 4,
    input: 1,
    live: 0,
  })
})

test('root package exposes the pure contract runner as the default packaging test command', () => {
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.scripts?.['test:packaging-sage'], 'node packaging-sage/tests/run-contract-tests.mjs')
})

test('a filesystem test added without registration fails closed', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'sage-packaging-manifest.'))
  try {
    for (const entry of SAGE_PACKAGING_CONTRACT_TESTS) {
      const path = join(temporary, entry.path)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, '')
    }
    const unregistered = join(temporary, 'packaging-sage', 'tests', 'unregistered-test.mjs')
    writeFileSync(unregistered, '')
    const inspection = inspectSagePackagingTestManifest(temporary)
    assert.ok(inspection.issues.includes('discovered-count: expected 14, got 15'))
    assert.ok(inspection.issues.includes('unregistered-test: packaging-sage/tests/unregistered-test.mjs'))
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

test('missing registration, duplicate registration and unknown layer fail closed', () => {
  const discovered = SAGE_PACKAGING_CONTRACT_TESTS.map(entry => entry.path)
  const missing = validateSagePackagingTestManifest({
    repoRoot,
    entries: SAGE_PACKAGING_CONTRACT_TESTS.slice(1),
    discovered,
  })
  assert.ok(missing.some(issue => issue.startsWith('unregistered-test: ')))

  const duplicate = validateSagePackagingTestManifest({
    repoRoot,
    entries: [...SAGE_PACKAGING_CONTRACT_TESTS.slice(0, -1), SAGE_PACKAGING_CONTRACT_TESTS[0]],
    discovered,
  })
  assert.ok(duplicate.some(issue => issue.startsWith('duplicate-entry: ')))

  const unknownLayer = SAGE_PACKAGING_CONTRACT_TESTS.map((entry, index) => (
    index === 0 ? { ...entry, layer: 'unknown' } : entry
  ))
  assert.ok(validateSagePackagingTestManifest({ repoRoot, entries: unknownLayer, discovered })
    .some(issue => issue.startsWith('invalid-layer: ')))
})

test('input and platform tests cannot be relabeled as quick pure tests', () => {
  const discovered = SAGE_PACKAGING_CONTRACT_TESTS.map(entry => entry.path)
  const relabeled = SAGE_PACKAGING_CONTRACT_TESTS.map(entry => (
    entry.path.endsWith('/producer-contract-test.mjs') ? { ...entry, layer: 'pure' } : entry
  ))
  const issues = validateSagePackagingTestManifest({ repoRoot, entries: relabeled, discovered })
  assert.ok(issues.includes('unsafe-layer: packaging-sage/tests/producer-contract-test.mjs must be input, got pure'))
})

test('quick runner lists only pure tests and never selects input, platform or live layers', () => {
  const runner = join(repoRoot, 'packaging-sage', 'tests', 'run-contract-tests.mjs')
  const { command, env } = nodeCommand()
  const result = spawnSync(command, [runner, '--list'], { cwd: repoRoot, encoding: 'utf8', env })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.registered, SAGE_PACKAGING_EXPECTED_TEST_COUNT)
  assert.deepEqual(report.layers, { pure: 9, platform: 4, input: 1, live: 0 })
  assert.deepEqual(report.selected, [
    'packaging-sage/scripts/accept-dmg.test.mjs',
    'packaging-sage/tests/dmg-contract-test.mjs',
    'packaging-sage/tests/input-lock-contract-test.mjs',
    'packaging-sage/tests/local-signing-recovery-test.mjs',
    'packaging-sage/tests/native-inventory-test.mjs',
    'packaging-sage/tests/pnpm-install-artifacts-test.mjs',
    'packaging-sage/tests/runtime-graph-builtins-test.mjs',
    'packaging-sage/tests/shell-scripts-bash32-safety-test.mjs',
    'packaging-sage/tests/signing-plan-test.mjs',
  ])
})
