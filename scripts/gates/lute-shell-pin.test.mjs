import test from 'node:test'
import assert from 'node:assert/strict'
import { checkLuteShellPin } from './lute-shell-pin.mjs'

const shellManifest = JSON.stringify({
  luteOrigin: 'self',
  luteOwner: 'lute',
  lutePublish: false,
  devDependencies: {
    '@deepseek-ai/dsh-app-boot': '0.1.5-rc.2',
    '@deepseek-ai/cordis': '4.0.2',
    electron: '43.3.0',
  },
})
const seedManifest = JSON.stringify({
  dependencies: {
    '@deepseek-ai/dsh-app-boot': '0.1.5-rc.2',
    '@deepseek-ai/cordis': '4.0.2',
    '@deepseek-ai/dsh-base': '0.1.5-rc.2',
  },
})
const workspace = 'overrides:\n  "@deepseek-ai/dsh-type-meta": "npm:empty-npm-package@1.0.0"\n  "@deepseek-ai/dsh-user-interaction": "npm:empty-npm-package@1.0.0"\n'
const protocol = `export const SHELL_HOST_PROTOCOL_VERSION = 3 as const
export const SHELL_REQUEST_PIPE_FD = 3
export const SHELL_RESPONSE_PIPE_FD = 4
export const SHELL_CONTROL_IPC_FD = 5
export const SHELL_PIPE_CHUNK_BYTES = 64 * 1024
const FRAME_MAGIC = 0x44534833
const FRAME_HEADER_BYTES = 13
const MAX_CONTROL_PAYLOAD_BYTES = 1024 * 1024
`
const referenceWire = `export const DESKTOP_HOST_PROTOCOL_VERSION = 3 as const
export const DESKTOP_REQUEST_PIPE_FD = 3
export const DESKTOP_RESPONSE_PIPE_FD = 4
export const DESKTOP_PIPE_CHUNK_BYTES = 64 * 1024
const FRAME_MAGIC = 0x44534833
const FRAME_HEADER_BYTES = 13
const MAX_CONTROL_PAYLOAD_BYTES = 1024 * 1024
`

// 与 `git ls-files apps/lute-shell/test/fixtures/` 逐字一致（12 个，仓库相对路径）。
// 这份清单是门禁的期望值：干净克隆上 fixtures 必须全在，否则 test/ 跑不起来。
const TRACKED_FIXTURES = [
  'apps/lute-shell/test/fixtures/frontend/dist/assets/app.css',
  'apps/lute-shell/test/fixtures/frontend/dist/index.html',
  'apps/lute-shell/test/fixtures/frontend/package.json',
  'apps/lute-shell/test/fixtures/profile-broken-bundle/node_modules/@deepseek-ai/dsh/package.json',
  'apps/lute-shell/test/fixtures/profile-broken-bundle/node_modules/lute-broken-bundle/package.json',
  'apps/lute-shell/test/fixtures/profile-broken-bundle/package.json',
  'apps/lute-shell/test/fixtures/profile/cordis.patch.yml',
  'apps/lute-shell/test/fixtures/profile/cordis.yml',
  'apps/lute-shell/test/fixtures/profile/node_modules/@deepseek-ai/dsh/package.json',
  'apps/lute-shell/test/fixtures/profile/node_modules/lute-fixture-bundle/cordis.patch.yml',
  'apps/lute-shell/test/fixtures/profile/node_modules/lute-fixture-bundle/package.json',
  'apps/lute-shell/test/fixtures/profile/package.json',
]

const good = {
  shellManifestText: shellManifest,
  seedManifestText: seedManifest,
  shellWorkspaceText: workspace,
  seedWorkspaceText: workspace,
  protocolText: protocol,
  referenceWireText: referenceWire,
  seedUserPatchText: '# 用户层：P1 留空。P2 起在这里声明 LUTE 插件的 id / config / disabled。\n[]\n',
  trackedFixturePaths: TRACKED_FIXTURES,
}

test('passes on a consistent pin', () => {
  assert.deepEqual(checkLuteShellPin(good), { passed: true, violations: [] })
})

test('rejects a ranged harness specifier in the seed', () => {
  const result = checkLuteShellPin({
    ...good,
    seedManifestText: JSON.stringify({ dependencies: { '@deepseek-ai/dsh-base': '^0.1.5-rc.2' } }),
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /dsh-base.*精确版本/u)
})

test('rejects a ranged harness specifier present only in the shell devDependencies', () => {
  const result = checkLuteShellPin({
    ...good,
    shellManifestText: JSON.stringify({
      luteOrigin: 'self',
      luteOwner: 'lute',
      lutePublish: false,
      devDependencies: {
        '@deepseek-ai/dsh-typert': '^0.1.5-rc.2',
        '@deepseek-ai/cordis': '4.0.2',
      },
    }),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /壳 devDependencies 里 @deepseek-ai\/dsh-typert.*不是精确版本/u)
})

test('rejects a version that differs between shell devDeps and seed deps', () => {
  const result = checkLuteShellPin({
    ...good,
    shellManifestText: JSON.stringify({ devDependencies: { '@deepseek-ai/dsh-app-boot': '0.1.6-alpha.1' } }),
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /dsh-app-boot/)
})

test('rejects a seed manifest that declares no harness dependency', () => {
  const renamed = checkLuteShellPin({
    ...good,
    seedManifestText: JSON.stringify({ devDependencies: { '@deepseek-ai/dsh-base': '0.1.5-rc.2' } }),
  })
  assert.equal(renamed.passed, false)
  assert.equal(renamed.violations.length, 1)
  assert.match(renamed.violations[0], /seed 里没有任何 @deepseek-ai\/\* 依赖/u)

  const emptied = checkLuteShellPin({ ...good, seedManifestText: '{}' })
  assert.equal(emptied.passed, false)
  assert.equal(emptied.violations.length, 1)
  assert.match(emptied.violations[0], /seed 里没有任何/u)
})

test('rejects a shell manifest whose devDependencies hold no harness package', () => {
  const result = checkLuteShellPin({
    ...good,
    shellManifestText: JSON.stringify({
      luteOrigin: 'self',
      luteOwner: 'lute',
      lutePublish: false,
      devDependencies: { electron: '43.3.0' },
    }),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /devDependencies 里没有任何 @deepseek-ai/u)
})

test('rejects a missing override for the two unpublished internal packages', () => {
  const result = checkLuteShellPin({ ...good, seedWorkspaceText: 'packages:\n  - .\n' })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 2)
  assert.match(result.violations[0], /dsh-type-meta/u)
})

test('rejects protocol constants that drift from the submodule reference', () => {
  const result = checkLuteShellPin({
    ...good,
    protocolText: protocol.replace('0x44534833', '0x44534834'),
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /FRAME_MAGIC/u)
})

test('skips the reference comparison when the submodule is not initialized', () => {
  const result = checkLuteShellPin({ ...good, referenceWireText: null })
  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
  assert.match(result.note, /7 项协议常量比对全部未跑/u)
})

test('notes the per-pair skip count when the reference renamed a constant', () => {
  const result = checkLuteShellPin({
    ...good,
    referenceWireText: referenceWire.replace('DESKTOP_PIPE_CHUNK_BYTES', 'DESKTOP_CHUNK_BYTES'),
  })
  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
  assert.match(result.note, /1\/7 项协议常量在参照里找不到同名常量/u)
})

test('fails loud when the shell package is absent', () => {
  const result = checkLuteShellPin({ ...good, shellManifestText: null })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /apps\/lute-shell\/package\.json/u)
})

test('rejects a shell manifest missing the governance fields', () => {
  const result = checkLuteShellPin({
    ...good,
    shellManifestText: JSON.stringify({ devDependencies: { '@deepseek-ai/cordis': '4.0.2' } }),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 3)
  assert.match(result.violations[0], /luteOrigin/u)
})

test('rejects governance fields whose values are not self/lute/false', () => {
  const result = checkLuteShellPin({
    ...good,
    shellManifestText: JSON.stringify({
      luteOrigin: '',
      luteOwner: 'someone-else',
      lutePublish: true,
      devDependencies: { '@deepseek-ai/cordis': '4.0.2' },
    }),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 3)
  assert.match(result.violations[0], /luteOrigin = ""，应为 "self"/u)
  assert.match(result.violations[1], /luteOwner = "someone-else"，应为 "lute"/u)
  assert.match(result.violations[2], /lutePublish = true，应为 false/u)
})

test('rejects a seed user patch that declares a LUTE plugin layer', () => {
  const result = checkLuteShellPin({
    ...good,
    seedUserPatchText: '# 用户层\n- id: lute-something\n',
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /cordis\.patch\.yaml|cordis\.patch\.yml|用户层/u)
})

test('rejects an untracked fixture', () => {
  const result = checkLuteShellPin({
    ...good,
    trackedFixturePaths: TRACKED_FIXTURES.slice(0, -1),
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /test\/fixtures\/profile\/package\.json/u)
})
