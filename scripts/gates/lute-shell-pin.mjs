/**
 * 薄壳的版本 pin 与协议常量校验。
 * apps/ 不在 package collector 的射程内（package-layout.mjs 只下钻 packages/<五组>/），
 * 故这里独立守七件事：
 * 1. seed deps 与壳 devDependencies 两侧的 @deepseek-ai/* 都非空且都是精确版本（range 会静默落到 npm 旧 latest tag）；
 * 2. 两侧同名包版本一致（编译期类型与运行时是同一套包）；
 * 3. 两个 pnpm-workspace.yaml 都带 dsh-type-meta / dsh-user-interaction 的 override；
 * 4. protocol.ts 的 7 个帧协议常量不漂移于 submodule 参照 wire.ts；
 * 5. 壳 manifest 的治理三字段取 self / lute / false；
 * 6. seed cordis.patch.yml 用户层剥注释后恰为 []；
 * 7. 12 个 test fixture 保持被 git 跟踪。
 */

const UNPUBLISHED_OVERRIDES = [
  '@deepseek-ai/dsh-type-meta',
  '@deepseek-ai/dsh-user-interaction',
]

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/u

const PROTOCOL_CONSTANTS = [
  ['SHELL_HOST_PROTOCOL_VERSION', 'DESKTOP_HOST_PROTOCOL_VERSION'],
  ['SHELL_REQUEST_PIPE_FD', 'DESKTOP_REQUEST_PIPE_FD'],
  ['SHELL_RESPONSE_PIPE_FD', 'DESKTOP_RESPONSE_PIPE_FD'],
  ['SHELL_PIPE_CHUNK_BYTES', 'DESKTOP_PIPE_CHUNK_BYTES'],
  ['FRAME_MAGIC', 'FRAME_MAGIC'],
  ['FRAME_HEADER_BYTES', 'FRAME_HEADER_BYTES'],
  ['MAX_CONTROL_PAYLOAD_BYTES', 'MAX_CONTROL_PAYLOAD_BYTES'],
]

// apps/ 对仓库 package collector 结构性不可见，故治理三字段只能由本门禁守；三字段没有别的读者，值本身就是事实。
const GOVERNANCE_EXPECTED = { luteOrigin: 'self', luteOwner: 'lute', lutePublish: false }

// 与 `git ls-files apps/lute-shell/test/fixtures/` 逐字一致；新增 fixture 时本门禁会红，
// 那是**预期**的失败模式：干净克隆上 fixtures 缺失会让 test/ 跑不起来，必须有人显式更新清单。
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

function harnessSpecifiers(manifestText, field) {
  if (manifestText === null) return null
  const manifest = JSON.parse(manifestText)
  const deps = manifest[field] ?? {}
  return new Map(Object.entries(deps).filter(([name]) => name.startsWith('@deepseek-ai/')))
}

function constantValue(text, name) {
  const match = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*([^\\n]+?)\\s*(?:as\\s+const)?\\s*(?:\\n|$)`, 'u').exec(text)
  return match?.[1].trim()
}

/**
 * @param {object} input 八个输入（六个文件文本 + seed 用户层文本 + git 跟踪清单），缺失的为 null
 * @returns {{passed: boolean, violations: string[], note?: string}}
 */
export function checkLuteShellPin(input) {
  const violations = []
  const shell = harnessSpecifiers(input.shellManifestText, 'devDependencies')
  const seed = harnessSpecifiers(input.seedManifestText, 'dependencies')

  if (shell === null) violations.push('apps/lute-shell/package.json 不存在或不可读——薄壳没有版本事实源')
  if (seed === null) violations.push('apps/lute-shell/seed/package.json 不存在或不可读——profile seed 没有版本事实源')

  // 空 map 会让精确版本与两侧一致两条守卫同时失去对象而恒绿，故空射程本身即违规（gate-result.mjs 的 checked > 0 同理）。
  if (seed !== null && seed.size === 0) {
    violations.push('seed 里没有任何 @deepseek-ai/* 依赖——版本事实源空了，精确版本守卫与两侧一致守卫都无对象可守')
  }
  if (shell !== null && shell.size === 0) {
    violations.push('apps/lute-shell/package.json 的 devDependencies 里没有任何 @deepseek-ai/* 依赖——薄壳编译期类型的事实源空了，壳侧精确版本与两侧一致守卫都无对象可守')
  }

  if (seed !== null) {
    for (const [name, spec] of seed) {
      if (!EXACT_VERSION.test(spec)) {
        violations.push(`seed 依赖 ${name} 的 "${spec}" 不是精确版本——npm latest tag 指向旧线，必须显式锁版本`)
      }
    }
  }

  if (shell !== null) {
    for (const [name, spec] of shell) {
      if (!EXACT_VERSION.test(spec)) {
        violations.push(`壳 devDependencies 里 ${name} 的 "${spec}" 不是精确版本——编译期类型会随 npm latest tag 漂到旧线，与 seed 装出来的运行时不是同一套包`)
      }
    }
  }

  if (shell !== null && seed !== null) {
    for (const [name, spec] of seed) {
      const shellSpec = shell.get(name)
      if (shellSpec !== undefined && shellSpec !== spec) {
        violations.push(`${name} 在壳（${shellSpec}）与 seed（${spec}）两侧版本不一致——编译期类型与运行时会是两套包`)
      }
    }
  }

  for (const [label, text] of [['apps/lute-shell/pnpm-workspace.yaml', input.shellWorkspaceText], ['apps/lute-shell/seed/pnpm-workspace.yaml', input.seedWorkspaceText]]) {
    for (const name of UNPUBLISHED_OVERRIDES) {
      if (text === null || !text.includes(name)) {
        violations.push(`${label} 缺 ${name} 的 override——该包未发布到 npm，install 会 404`)
      }
    }
  }

  let referenceMissing = false
  let unpairedConstants = 0
  if (input.protocolText === null) {
    violations.push('apps/lute-shell/src/protocol.ts 不存在或不可读')
  } else if (input.referenceWireText === null) {
    referenceMissing = true
  } else {
    for (const [ours, theirs] of PROTOCOL_CONSTANTS) {
      const actual = constantValue(input.protocolText, ours)
      const expected = constantValue(input.referenceWireText, theirs)
      if (expected === undefined) {
        unpairedConstants += 1
        continue
      }
      if (actual !== expected) {
        violations.push(`protocol.ts 的 ${ours} = ${String(actual)}，与 submodule 参照 ${theirs} = ${String(expected)} 不一致`)
      }
    }
  }

  if (input.shellManifestText !== null) {
    const manifest = JSON.parse(input.shellManifestText)
    for (const [name, expected] of Object.entries(GOVERNANCE_EXPECTED)) {
      if (typeof manifest[name] !== 'string' && typeof manifest[name] !== 'boolean') {
        violations.push(`apps/lute-shell/package.json 缺治理字段 ${name}——apps/ 不在 package collector 射程内，此字段只能由本门禁守`)
      } else if (manifest[name] !== expected) {
        violations.push(`apps/lute-shell/package.json 的治理字段 ${name} = ${JSON.stringify(manifest[name])}，应为 ${JSON.stringify(expected)}——这三字段没有别的读者，值写错就等于治理归属静默改了`)
      }
    }
  }

  // seed 的用户层是「零 LUTE 插件」这条里程碑事实的证据家（smoke 只证 manifest 的 bundles）。
  // 剥掉注释与空白后必须恰为 []；P2 起要挂插件时本门禁会红，那是需要人显式确认的时刻。
  if (input.seedUserPatchText === null) {
    violations.push('apps/lute-shell/seed/cordis.patch.yml 不存在或不可读')
  } else {
    const body = input.seedUserPatchText
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('')
      .replace(/\s+/gu, '')
    if (body !== '[]') {
      violations.push(`seed/cordis.patch.yml 的用户层不是 []（剥注释后为 ${body}）——P1 的「零 LUTE 插件」以该文件为证据家，挂载插件属有意变更，须显式更新本门禁`)
    }
  }

  if (input.trackedFixturePaths === null) {
    violations.push('无法读取 git 跟踪清单——fixtures 是否入库不可判定')
  } else {
    const tracked = new Set(input.trackedFixturePaths)
    for (const path of TRACKED_FIXTURES) {
      if (!tracked.has(path)) {
        violations.push(`${path} 不再被 git 跟踪——干净克隆上 test/ 会因缺 fixture 而失败（.gitignore 是白名单式，删 negation 会静默丢文件）`)
      }
    }
  }

  // 比对被跳过不等于比对通过：把缩小的分母写进 note，让它在 gate 读数里可见。
  const degraded = []
  if (referenceMissing) degraded.push(`submodule 参照未初始化，${PROTOCOL_CONSTANTS.length} 项协议常量比对全部未跑`)
  if (unpairedConstants > 0) degraded.push(`${unpairedConstants}/${PROTOCOL_CONSTANTS.length} 项协议常量在参照里找不到同名常量，该几项比对未跑`)

  return {
    passed: violations.length === 0,
    violations,
    ...(degraded.length > 0 ? { note: degraded.join('；') } : {}),
  }
}
