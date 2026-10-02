/**
 * Sage 薄壳的版本 pin 与协议常量校验。
 * apps/ 不在 package collector 的射程内（package-layout.mjs 只下钻 packages/<五组>/），
 * 故这里独立守八件事：
 * 1. seed deps 与壳 devDependencies 两侧的 @deepseek-ai/* 都非空且都是精确版本（range 会静默落到 npm 旧 latest tag）；
 * 2. 两侧同名包版本一致（编译期类型与运行时是同一套包）；
 * 3. 两个 pnpm-workspace.yaml 都带 dsh-type-meta / dsh-user-interaction 的 override；
 * 4. protocol.ts 的 Sage Host IPC lifecycle protocol 独立固定为 v4，FD3/FD4 的 6 个 framing 常量冻结为既定值（上游 0.2.0 起已删除 wire 参照；改值/改写法须显式同步本表，ADR-0192）；
 * 5. 壳 manifest 的治理三字段取 self / lute / false；
 * 6. seed cordis.patch.yml 用户层剥注释后恰为 []；
 * 7. 9 个 profile / composition test fixture 保持被 git 跟踪；
 * 8. 壳 devDependencies.electron 是精确版本，且与 vendor/dsh-desktop/dsh-plugin-desktop 的同名 pin 一致（参照缺失时一致性比对跳过并进 note）。
 */

const UNPUBLISHED_OVERRIDES = [
  '@deepseek-ai/dsh-type-meta',
  '@deepseek-ai/dsh-user-interaction',
]

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/u

const SAGE_HOST_LIFECYCLE_PROTOCOL_VERSION = '4'

// 帧面（数值 + 名称表）冻结于 2026-10-02（Sage 内核升级：上游 0.2.0-rc.2 已删除 FD3/FD4 wire
// 参照，对齐对象消失，所有权归 Sage；名称表扩展见 ADR-0195——E.2 policy 文档把它发布进
// stable 协议摘要，评审守不够，必须机制守）。文本按空白归一后比较；改值/改名/改写表达式都
// 必须显式更新本表（伴随 ADR-0192/ADR-0195 的决策记录），不得静默漂移。
const FROZEN_FRAMING_CONSTANTS = [
  ['SHELL_REQUEST_PIPE_FD', '3'],
  ['SHELL_RESPONSE_PIPE_FD', '4'],
  ['SHELL_PIPE_CHUNK_BYTES', '64*1024'],
  ['FRAME_MAGIC', '0x44534833'],
  ['FRAME_HEADER_BYTES', '13'],
  ['MAX_CONTROL_PAYLOAD_BYTES', '1024*1024'],
  ['SHELL_REQUEST_FRAME_KINDS', "['start','data','end','cancel']"],
  ['SHELL_RESPONSE_FRAME_KINDS', "['start','data','end','error']"],
]

// apps/ 对仓库 package collector 结构性不可见，故治理三字段只能由本门禁守；三字段没有别的读者，值本身就是事实。
const GOVERNANCE_EXPECTED = { luteOrigin: 'self', luteOwner: 'lute', lutePublish: false }

// 与 `git ls-files apps/sage-shell/test/fixtures/` 逐字一致；新增 fixture 时本门禁会红，
// 那是**预期**的失败模式：干净克隆上 fixtures 缺失会让 test/ 跑不起来，必须有人显式更新清单。
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

function normalizedConstantValue(text, name) {
  const value = constantValue(text, name)
  return value === undefined ? undefined : value.replace(/\s+/gu, '')
}

/**
 * @param {object} input 八个输入（六个文件文本 + seed 用户层文本 + git 跟踪清单），缺失的为 null
 * @returns {{passed: boolean, violations: string[], note?: string}}
 */
export function checkSageShellPin(input) {
  const violations = []
  const shell = harnessSpecifiers(input.shellManifestText, 'devDependencies')
  const seed = harnessSpecifiers(input.seedManifestText, 'dependencies')

  if (shell === null) violations.push('apps/sage-shell/package.json 不存在或不可读——薄壳没有版本事实源')
  if (seed === null) violations.push('apps/sage-shell/seed/package.json 不存在或不可读——profile seed 没有版本事实源')

  // 空 map 会让精确版本与两侧一致两条守卫同时失去对象而恒绿，故空射程本身即违规（gate-result.mjs 的 checked > 0 同理）。
  if (seed !== null && seed.size === 0) {
    violations.push('seed 里没有任何 @deepseek-ai/* 依赖——版本事实源空了，精确版本守卫与两侧一致守卫都无对象可守')
  }
  if (shell !== null && shell.size === 0) {
    violations.push('apps/sage-shell/package.json 的 devDependencies 里没有任何 @deepseek-ai/* 依赖——薄壳编译期类型的事实源空了，壳侧精确版本与两侧一致守卫都无对象可守')
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

  for (const [label, text] of [['apps/sage-shell/pnpm-workspace.yaml', input.shellWorkspaceText], ['apps/sage-shell/seed/pnpm-workspace.yaml', input.seedWorkspaceText]]) {
    for (const name of UNPUBLISHED_OVERRIDES) {
      if (text === null || !text.includes(name)) {
        violations.push(`${label} 缺 ${name} 的 override——该包未发布到 npm，install 会 404`)
      }
    }
  }

  if (input.protocolText === null) {
    violations.push('apps/sage-shell/src/protocol.ts 不存在或不可读')
  } else {
    const lifecycleVersion = constantValue(input.protocolText, 'SHELL_HOST_PROTOCOL_VERSION')
    if (lifecycleVersion !== SAGE_HOST_LIFECYCLE_PROTOCOL_VERSION) {
      violations.push(
        `protocol.ts 的 SHELL_HOST_PROTOCOL_VERSION = ${String(lifecycleVersion)}，应为 Sage lifecycle protocol v${SAGE_HOST_LIFECYCLE_PROTOCOL_VERSION}`
        + '——该版本由 Sage↔Host IPC lifecycle contract 独立拥有，不跟随 vendor DESKTOP_HOST_PROTOCOL_VERSION',
      )
    }

    for (const [ours, frozen] of FROZEN_FRAMING_CONSTANTS) {
      const actual = normalizedConstantValue(input.protocolText, ours)
      if (actual !== frozen) {
        violations.push(
          `protocol.ts 的冻结帧常量 ${ours} = ${String(actual)}，应为 ${frozen}`
          + '——FD3/FD4 framing 数值与帧名称表已冻结归 Sage 所有（上游参照已删除），改值/改名/改写法须显式更新本表（ADR-0192/ADR-0195），不得静默漂移',
        )
      }
    }
  }

  if (input.shellManifestText !== null) {
    const manifest = JSON.parse(input.shellManifestText)
    for (const [name, expected] of Object.entries(GOVERNANCE_EXPECTED)) {
      if (typeof manifest[name] !== 'string' && typeof manifest[name] !== 'boolean') {
        violations.push(`apps/sage-shell/package.json 缺治理字段 ${name}——apps/ 不在 package collector 射程内，此字段只能由本门禁守`)
      } else if (manifest[name] !== expected) {
        violations.push(`apps/sage-shell/package.json 的治理字段 ${name} = ${JSON.stringify(manifest[name])}，应为 ${JSON.stringify(expected)}——这三字段没有别的读者，值写错就等于治理归属静默改了`)
      }
    }

    // electron 的事实是「与 vendor 桌面插件同版本」（减少 renderer 分歧）：断言相等而非硬编码 43.3.0，参照 bump 后本门禁才有对象可跟。
    const electronSpec = manifest.devDependencies?.electron
    if (electronSpec === undefined) {
      violations.push('apps/sage-shell/package.json 的 devDependencies 缺 electron pin——薄壳的 Electron 版本没有事实源，与参照的一致性无从判定')
    } else if (!EXACT_VERSION.test(electronSpec)) {
      violations.push(`apps/sage-shell/package.json 的 devDependencies.electron = "${electronSpec}" 不是精确版本——range/latest 会随 npm tag 漂移，锁版本的意图落空`)
    } else if (input.vendorDesktopManifestText !== null) {
      const vendorElectron = JSON.parse(input.vendorDesktopManifestText).devDependencies?.electron
      if (electronSpec !== vendorElectron) {
        violations.push(`壳 devDependencies.electron（${electronSpec}）与 vendor/dsh-desktop/dsh-plugin-desktop 的 devDependencies.electron（${String(vendorElectron)}）不一致——锁同版本是为减少 renderer 分歧，参照 bump 后壳 pin 必须显式跟进`)
      }
    }
  }

  // seed 的用户层是「零 Sage 插件」这条里程碑事实的证据家（smoke 只证 manifest 的 bundles）。
  // 剥掉注释与空白后必须恰为 []；P2 起要挂插件时本门禁会红，那是需要人显式确认的时刻。
  if (input.seedUserPatchText === null) {
    violations.push('apps/sage-shell/seed/cordis.patch.yml 不存在或不可读')
  } else {
    const body = input.seedUserPatchText
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('')
      .replace(/\s+/gu, '')
    if (body !== '[]') {
      violations.push(`seed/cordis.patch.yml 的用户层不是 []（剥注释后为 ${body}）——P1 的「零 Sage 插件」以该文件为证据家，挂载插件属有意变更，须显式更新本门禁`)
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
  if (input.vendorDesktopManifestText === null) degraded.push('vendor/dsh-desktop/dsh-plugin-desktop/package.json 不可读，electron 版本一致性比对未跑')

  return {
    passed: violations.length === 0,
    violations,
    ...(degraded.length > 0 ? { note: degraded.join('；') } : {}),
  }
}
