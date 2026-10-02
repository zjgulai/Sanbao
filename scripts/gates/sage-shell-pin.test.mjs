import test from 'node:test'
import assert from 'node:assert/strict'
import { checkSageShellPin } from './sage-shell-pin.mjs'

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
const vendorDesktopManifest = JSON.stringify({ devDependencies: { electron: '43.3.0' } })
const workspace = 'overrides:\n  "@deepseek-ai/dsh-type-meta": "npm:empty-npm-package@1.0.0"\n  "@deepseek-ai/dsh-user-interaction": "npm:empty-npm-package@1.0.0"\n'
const protocol = `export const SHELL_HOST_PROTOCOL_VERSION = 5 as const
export const SHELL_REQUEST_PIPE_FD = 3
export const SHELL_RESPONSE_PIPE_FD = 4
export const SHELL_CONTROL_IPC_FD = 5
export const SHELL_PIPE_CHUNK_BYTES = 64 * 1024
const FRAME_MAGIC = 0x44534833
const FRAME_HEADER_BYTES = 13
const MAX_CONTROL_PAYLOAD_BYTES = 1024 * 1024
export const SHELL_REQUEST_FRAME_KINDS = ['start', 'data', 'end', 'cancel'] as const
export const SHELL_RESPONSE_FRAME_KINDS = ['start', 'data', 'end', 'error'] as const
`

// 与 `git ls-files apps/sage-shell/test/fixtures/` 逐字一致（9 个，仓库相对路径）。
// 这份清单是门禁的期望值：干净克隆上 fixtures 必须全在，否则 test/ 跑不起来。
const TRACKED_FIXTURES = [
  'apps/sage-shell/test/fixtures/profile-broken-bundle/node_modules/@deepseek-ai/dsh/package.json',
  'apps/sage-shell/test/fixtures/profile-broken-bundle/node_modules/lute-broken-bundle/package.json',
  'apps/sage-shell/test/fixtures/profile-broken-bundle/package.json',
  'apps/sage-shell/test/fixtures/profile/cordis.patch.yml',
  'apps/sage-shell/test/fixtures/profile/cordis.yml',
  'apps/sage-shell/test/fixtures/profile/node_modules/@deepseek-ai/dsh/package.json',
  'apps/sage-shell/test/fixtures/profile/node_modules/lute-fixture-bundle/cordis.patch.yml',
  'apps/sage-shell/test/fixtures/profile/node_modules/lute-fixture-bundle/package.json',
  'apps/sage-shell/test/fixtures/profile/package.json',
]

const good = {
  shellManifestText: shellManifest,
  seedManifestText: seedManifest,
  shellWorkspaceText: workspace,
  seedWorkspaceText: workspace,
  protocolText: protocol,
  vendorDesktopManifestText: vendorDesktopManifest,
  seedUserPatchText: '# 用户层：P1 留空。P2 起在这里声明 Sage 插件的 id / config / disabled。\n[]\n',
  trackedFixturePaths: TRACKED_FIXTURES,
}

test('passes an aligned Sage pin whose frozen framing constants match', () => {
  assert.deepEqual(checkSageShellPin(good), { passed: true, violations: [] })
})

test('rejects a ranged harness specifier in the seed', () => {
  const result = checkSageShellPin({
    ...good,
    seedManifestText: JSON.stringify({ dependencies: { '@deepseek-ai/dsh-base': '^0.1.5-rc.2' } }),
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /dsh-base.*精确版本/u)
})

test('rejects a ranged harness specifier present only in the shell devDependencies', () => {
  const result = checkSageShellPin({
    ...good,
    shellManifestText: JSON.stringify({
      luteOrigin: 'self',
      luteOwner: 'lute',
      lutePublish: false,
      devDependencies: {
        '@deepseek-ai/dsh-typert': '^0.1.5-rc.2',
        '@deepseek-ai/cordis': '4.0.2',
        electron: '43.3.0',
      },
    }),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /壳 devDependencies 里 @deepseek-ai\/dsh-typert.*不是精确版本/u)
})

test('rejects a version that differs between shell devDeps and seed deps', () => {
  const result = checkSageShellPin({
    ...good,
    shellManifestText: JSON.stringify({ devDependencies: { '@deepseek-ai/dsh-app-boot': '0.1.6-alpha.1' } }),
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /dsh-app-boot/)
})

test('rejects a seed manifest that declares no harness dependency', () => {
  const renamed = checkSageShellPin({
    ...good,
    seedManifestText: JSON.stringify({ devDependencies: { '@deepseek-ai/dsh-base': '0.1.5-rc.2' } }),
  })
  assert.equal(renamed.passed, false)
  assert.equal(renamed.violations.length, 1)
  assert.match(renamed.violations[0], /seed 里没有任何 @deepseek-ai\/\* 依赖/u)

  const emptied = checkSageShellPin({ ...good, seedManifestText: '{}' })
  assert.equal(emptied.passed, false)
  assert.equal(emptied.violations.length, 1)
  assert.match(emptied.violations[0], /seed 里没有任何/u)
})

test('rejects a shell manifest whose devDependencies hold no harness package', () => {
  const result = checkSageShellPin({
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
  const result = checkSageShellPin({ ...good, seedWorkspaceText: 'packages:\n  - .\n' })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 2)
  assert.match(result.violations[0], /dsh-type-meta/u)
})

test('rejects Sage lifecycle protocol v3 independently of the vendor reference', () => {
  const result = checkSageShellPin({
    ...good,
    protocolText: protocol.replace('SHELL_HOST_PROTOCOL_VERSION = 5', 'SHELL_HOST_PROTOCOL_VERSION = 3'),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /SHELL_HOST_PROTOCOL_VERSION.*Sage lifecycle protocol v5/u)
})

test('rejects a frozen framing constant whose value changed', () => {
  const result = checkSageShellPin({
    ...good,
    protocolText: protocol.replace('0x44534833', '0x44534834'),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /冻结帧常量 FRAME_MAGIC/u)
})

test('accepts a whitespace-only reformat of a frozen expression', () => {
  const result = checkSageShellPin({
    ...good,
    protocolText: protocol.replace('64 * 1024', '64  *  1024').replace('1024 * 1024', '1024*1024'),
  })
  assert.deepEqual(result, { passed: true, violations: [] })
})

test('rejects a missing Sage framing constant', () => {
  const result = checkSageShellPin({
    ...good,
    protocolText: protocol.replace('export const SHELL_RESPONSE_PIPE_FD = 4\n', ''),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /SHELL_RESPONSE_PIPE_FD = undefined/u)
})

test('rejects a frozen constant re-written as a different expression', () => {
  const result = checkSageShellPin({
    ...good,
    protocolText: protocol.replace('1024 * 1024', '1048576'),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /冻结帧常量 MAX_CONTROL_PAYLOAD_BYTES/u)
})

test('rejects a renamed frame kind in the frozen name table', () => {
  const result = checkSageShellPin({
    ...good,
    protocolText: protocol.replace("'cancel'", "'abort'"),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /冻结帧常量 SHELL_REQUEST_FRAME_KINDS/u)
})

test('rejects a missing frame kind table export', () => {
  const result = checkSageShellPin({
    ...good,
    protocolText: protocol.replace("export const SHELL_RESPONSE_FRAME_KINDS = ['start', 'data', 'end', 'error'] as const\n", ''),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /SHELL_RESPONSE_FRAME_KINDS = undefined/u)
})

test('accepts a whitespace-only reformat of the frame kind tables', () => {
  const result = checkSageShellPin({
    ...good,
    protocolText: protocol
      .replace("['start', 'data', 'end', 'cancel']", "[ 'start' , 'data' , 'end' , 'cancel' ]")
      .replace("['start', 'data', 'end', 'error']", "[ 'start' , 'data' , 'end' , 'error' ]"),
  })
  assert.deepEqual(result, { passed: true, violations: [] })
})

test('fails loud when the shell package is absent', () => {
  const result = checkSageShellPin({ ...good, shellManifestText: null })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /apps\/sage-shell\/package\.json/u)
})

test('rejects a shell manifest missing the governance fields', () => {
  const result = checkSageShellPin({
    ...good,
    shellManifestText: JSON.stringify({ devDependencies: { '@deepseek-ai/cordis': '4.0.2', electron: '43.3.0' } }),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 3)
  assert.match(result.violations[0], /luteOrigin/u)
})

test('rejects governance fields whose values are not self/lute/false', () => {
  const result = checkSageShellPin({
    ...good,
    shellManifestText: JSON.stringify({
      luteOrigin: '',
      luteOwner: 'someone-else',
      lutePublish: true,
      devDependencies: { '@deepseek-ai/cordis': '4.0.2', electron: '43.3.0' },
    }),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 3)
  assert.match(result.violations[0], /luteOrigin = ""，应为 "self"/u)
  assert.match(result.violations[1], /luteOwner = "someone-else"，应为 "lute"/u)
  assert.match(result.violations[2], /lutePublish = true，应为 false/u)
})

test('rejects a ranged shell electron pin', () => {
  const result = checkSageShellPin({
    ...good,
    shellManifestText: JSON.stringify({
      luteOrigin: 'self',
      luteOwner: 'lute',
      lutePublish: false,
      devDependencies: {
        '@deepseek-ai/dsh-app-boot': '0.1.5-rc.2',
        '@deepseek-ai/cordis': '4.0.2',
        electron: '^43.3.0',
      },
    }),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /devDependencies\.electron = "\^43\.3\.0" 不是精确版本/u)
})

test('rejects a missing shell electron pin', () => {
  const result = checkSageShellPin({
    ...good,
    shellManifestText: JSON.stringify({
      luteOrigin: 'self',
      luteOwner: 'lute',
      lutePublish: false,
      devDependencies: {
        '@deepseek-ai/dsh-app-boot': '0.1.5-rc.2',
        '@deepseek-ai/cordis': '4.0.2',
      },
    }),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /devDependencies 缺 electron pin/u)
})

test('rejects a shell electron pin that diverges from the vendor desktop plugin', () => {
  const result = checkSageShellPin({
    ...good,
    vendorDesktopManifestText: JSON.stringify({ devDependencies: { electron: '44.0.0' } }),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], /electron（43\.3\.0）.*dsh-plugin-desktop 的 devDependencies\.electron（44\.0\.0）不一致/u)
})

test('skips the electron equality check with a note when the vendor manifest is absent', () => {
  const skipped = checkSageShellPin({ ...good, vendorDesktopManifestText: null })
  assert.equal(skipped.passed, true)
  assert.deepEqual(skipped.violations, [])
  assert.match(skipped.note, /electron 版本一致性比对未跑/u)

  const stillEnforced = checkSageShellPin({
    ...good,
    vendorDesktopManifestText: null,
    shellManifestText: JSON.stringify({
      luteOrigin: 'self',
      luteOwner: 'lute',
      lutePublish: false,
      devDependencies: { '@deepseek-ai/cordis': '4.0.2', electron: 'latest' },
    }),
  })
  assert.equal(stillEnforced.passed, false)
  assert.equal(stillEnforced.violations.length, 1)
  assert.match(stillEnforced.violations[0], /devDependencies\.electron = "latest" 不是精确版本/u)
})

test('rejects a seed user patch that declares a Sage plugin layer', () => {
  const result = checkSageShellPin({
    ...good,
    seedUserPatchText: '# 用户层\n- id: sage-something\n',
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /cordis\.patch\.yaml|cordis\.patch\.yml|用户层/u)
})

test('rejects an untracked fixture', () => {
  const result = checkSageShellPin({
    ...good,
    trackedFixturePaths: TRACKED_FIXTURES.slice(0, -1),
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /test\/fixtures\/profile\/package\.json/u)
})
