import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nodeCommand } from './lib/real-node.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const gate = join(repoRoot, 'scripts', 'gate.mjs')
const { command: NODE, env: NODE_ENV } = nodeCommand()

const REQUIRED_SAGE_CHECKS = [
  'gate-result-selftest',
  'sage-gate-scope-selftest',
  'node-interpreter',
  'pin-consistency',
  'sage-shell-quality',
  'sage-shell-pin',
  'sage-shell-pin-selftest',
  'sage-product-boundary',
  'sage-product-boundary-selftest',
  'sage-data-isolation',
  'sage-data-isolation-selftest',
  'sage-base-path-hygiene',
  'sage-base-path-hygiene-selftest',
  'sage-assets-generated',
  'gitignore-whitelist',
  'adr-index',
  'adr-note-links',
  'sage-service-consumption',
  'sage-service-consumption-selftest',
  'sage-appservice-import-firewall',
  'sage-appservice-import-firewall-selftest',
  'adr-agent-records',
  'adr-agent-records-selftest',
  'docs-link-integrity',
  'docs-link-integrity-selftest',
]

const FORBIDDEN_IN_SAGE = [
  'repo-attest-selftest',
  'gate-concurrency-selftest',
  'profile-bundle-sync',
  'live-presets',
  'release-published',
  'dmg-layout-doc',
  'jev-egress-boundary',
  'agent-fullstack',
  'object-store-hygiene',
]

function runGate(args) {
  return spawnSync(NODE, [gate, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: NODE_ENV,
  })
}

test('Sage scope 是固定 BASE allowlist，且不含 legacy / release / live 检查', () => {
  const result = runGate(['--scope', 'sage', '--list', '--json'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.scope, 'sage')
  assert.deepEqual(report.checks.map((check) => check.name), REQUIRED_SAGE_CHECKS)
  for (const name of FORBIDDEN_IN_SAGE) {
    assert.equal(report.checks.some((check) => check.name === name), false, name)
  }
})

test('裸 gate CLI 默认进入 Sage，不得静默回落 legacy', () => {
  const result = runGate(['--list', '--json'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.scope, 'sage')
  assert.deepEqual(report.checks.map((check) => check.name), REQUIRED_SAGE_CHECKS)
})

test('legacy scope 仍保留全量历史门禁', () => {
  const result = runGate(['--scope', 'legacy', '--list', '--json'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.scope, 'legacy')
  assert.ok(report.checks.length > REQUIRED_SAGE_CHECKS.length)
  for (const name of FORBIDDEN_IN_SAGE) {
    assert.ok(report.checks.some((check) => check.name === name), name)
  }
})

test('未知 scope 被拒绝，不得静默回落到 legacy', () => {
  const result = runGate(['--scope', 'unknown', '--list'])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /未知 scope/u)
})

test('根命令默认走 Sage，legacy 只能显式调用', () => {
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
  assert.match(manifest.scripts.gate, /--scope sage --mode quick/u)
  assert.match(manifest.scripts['gate:full'], /--scope sage --mode full/u)
  assert.match(manifest.scripts['gate:legacy'], /--scope legacy --mode quick/u)
  assert.match(manifest.scripts['gate:legacy:full'], /--scope legacy --mode full/u)

  const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'gate.yml'), 'utf8')
  const workflowGateLines = workflow.split('\n').filter((line) => line.includes('node scripts/gate.mjs'))
  assert.equal(workflowGateLines.length, 4)
  for (const line of workflowGateLines) assert.match(line, /--scope sage/u)
})
