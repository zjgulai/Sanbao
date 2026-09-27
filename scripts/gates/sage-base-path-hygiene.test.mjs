import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SAGE_BASE_PATH_FILES,
  checkSageBasePathHygiene,
} from './sage-base-path-hygiene.mjs'

const good = new Map([
  ['scripts/gate.mjs', 'fileURLToPath(import.meta.url)'],
  ['scripts/gates/profile-coverage.test.mjs', 'fileURLToPath(import.meta.url)'],
  ['scripts/jev/egress-boundary.test.mjs', 'fileURLToPath(import.meta.url)'],
  ['packaging/assemble.sh', [
    'REPO_ROOT="$(cd "$PKG_ROOT/.." && pwd)"',
    'DSH_VENDOR="${DSH_VENDOR:-$REPO_ROOT}"',
  ].join('\n')],
  ['packaging/scripts/rewrite-file-deps.mjs', [
    'fileURLToPath(import.meta.url)',
    "const repoRoot = path.resolve(scriptDir, '..', '..');",
    '`file:${repoRoot}/`',
    "'file:/Users/lute/project/Magpie-Horch/'",
  ].join('\n')],
])

function files(overrides = {}) {
  return SAGE_BASE_PATH_FILES.map((path) => ({
    path,
    text: overrides[path] ?? good.get(path),
  }))
}

test('接受动态仓根并保留已登记的 legacy packaging 兼容输入', () => {
  const result = checkSageBasePathHygiene({ files: files() })
  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('拒绝当前 Sage、iCloud、恢复集和 worktree 绝对路径', () => {
  for (const forbidden of [
    '/Users/lute/project/Sage',
    '/Users/lute/Library/Mobile Documents/com~apple~CloudDocs/Sage_hub/Sage',
    '/Users/lute/project/Sage-recovery-20260927-base01',
    '/Users/lute/.codex/worktrees/example/Sage',
  ]) {
    const result = checkSageBasePathHygiene({
      files: files({ 'scripts/gate.mjs': `fileURLToPath(import.meta.url)\n${forbidden}` }),
    })
    assert.equal(result.passed, false, forbidden)
    assert.ok(result.violations.some((violation) => violation.includes('写死活动路径')), forbidden)
  }
})

test('缺文件或动态根锚点时判红', () => {
  const missing = checkSageBasePathHygiene({
    files: files().filter((file) => file.path !== 'packaging/assemble.sh'),
  })
  assert.equal(missing.passed, false)
  assert.ok(missing.violations.some((violation) => violation.includes('assemble.sh 不存在')))

  const fixedRoot = checkSageBasePathHygiene({
    files: files({ 'scripts/jev/egress-boundary.test.mjs': 'const REPO_ROOT = "/repo"' }),
  })
  assert.equal(fixedRoot.passed, false)
  assert.ok(fixedRoot.violations.some((violation) => violation.includes('egress-boundary.test.mjs 必须')))
})
