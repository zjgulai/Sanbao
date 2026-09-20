#!/usr/bin/env node
/**
 * 「关键单例元素计数」实机 CDP 探针（P-52 的最小机制）。
 *
 * ## 它回答的问题（静态判据答不了的）
 *
 * 黑屏事故的复盘里最刺眼的一条：同名单例元素在 DOM 里出现了**两次**（挂载竞态），
 * 而 40 小时的诊断里没有任何一方去数过它——`document.querySelectorAll(...).length === 2`
 * 一个读数就能暴露整个事故（`docs/notes/implemented/process/2026-09-19-boot-blackout-triage-retrospective.md`）。
 * 「数单例」这件事此前只活在复盘文字与人的记忆里；本探针把它变成可执行读数。
 *
 * 运行时竞态**无法静态判出**（observer 的行为只在真实 DOM 上发生），所以本探针是
 * 运行时读数、不是门禁判据——它住 `scripts/acceptance/` 家族，与 `theme-live-gui.mjs`
 * 共用同一根 CDP harness（`scripts/acceptance/relaunch-dsh-cdp.sh` 起的 `--remote-debugging-port`），
 * 实况验收轮里一并跑。
 *
 * ## 判据
 *
 * 每个单例一条读数，全部读**渲染后的 DOM**，不读任何声明：
 *   - `workbench-container`  `[data-dsh-workbench-container]`：**恰好 1**。数到 2 即
 *     「两个实例同时存活」——共享层按插入时单例强制（`shared/client/sidebar-entry-core.ts`），
 *     这个读数就是那条强制在实机上的对照面。
 *   - `workbench-group`      `[data-dsh-workbench-group]`：**恰好 1**。同上。
 *   - `settings-shell-root`  `[data-dsh-settings-shell-root]`：**至多 1**（条件单例）。
 *     设置壳只在设置页打开时挂载，未挂载时 0 是正常值；数到 2 仍是重复挂载。
 *
 * ## 读数与「读不到」的分界（P-15）
 *
 * 必需单例数到 0 = **仪器面缺失**（本包未装载 / 当前视图不适用），报 exit 2 并点名，
 * **不是**「通过」；选择器求值失败、CDP 连不上、页面没就绪同理。只有拿到读数之后
 * 才有判决（0/1 之外都是红，且 2 会被单独点名为「重复挂载」）。
 *
 * ## 退出码（与仓内其它 live 探针同口径）
 *   exit 2  仪器不可用：CDP 连不上 / 没有 SPA target / 必需单例读数为 0 / 读数缺失或非法
 *   exit 1  量到了、有单例计数 != 期望（含 count === 2 的重复挂载）
 *   exit 0  全部单例按期望（note 里带全部读数）
 *
 * 用法：node scripts/acceptance/singleton-count-live.mjs [--port 9333] [--self-test]
 *   `--self-test` 跑纯函数 `judgeSingletonCounts()` 的射程自检（不需要应用在跑）：
 *   每个判据都要有**一对**读数（该绿的 + 该红的），恒真桩突变必须让用例失效。
 */
import { setTimeout as sleep } from 'node:timers/promises'

const argv = process.argv.slice(2)
const PORT = Number(
  argv.includes('--port') ? argv[argv.indexOf('--port') + 1] : (process.env.DSH_CDP_PORT ?? 9333),
)

/**
 * 单例清单。`expected` = 精确值；`atMost` = 允许 0 的条件单例（上限）。
 * `why` 进报告——读数必须自带它为什么存在，否则下一个人只会看到一句「数到 2」。
 */
export const SINGLETONS = Object.freeze([
  {
    id: 'workbench-container',
    selector: '[data-dsh-workbench-container]',
    expected: 1,
    why: '黑屏事故的关键读数：挂载竞态会留下两个同名容器（P-52）；共享层按插入时单例强制，这里是它在实机上的对照面',
  },
  {
    id: 'workbench-group',
    selector: '[data-dsh-workbench-group]',
    expected: 1,
    why: '组行同样按插入时单例强制；数到 2 即两个实例同时存活（observer 会互相搬运成员，见 sidebar-entry-core.ts 的 ping-pong 不变量）',
  },
  {
    id: 'settings-shell-root',
    selector: '[data-dsh-settings-shell-root]',
    atMost: 1,
    why: '条件单例：设置壳只在设置页打开时挂载，0 是正常值；数到 2 仍是重复挂载',
  },
])

/** 仪器不可用（typed）：带稳定 code，报给调用方而不是产出一个判决。 */
export class ProbeUnavailableError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ProbeUnavailableError'
    this.code = code
  }
}

/**
 * 纯判决：把页面读到的计数变成逐条判决。
 *
 * 扔 `ProbeUnavailableError` 的两类情形（都**不**产出判决）：
 *   · `reading-missing` / `reading-invalid`：读数没有或不是非负整数——「没读到」不得静默；
 *   · `not-mounted`：**必需**单例读到 0——本包没装载或当前视图不适用。0 既不是
 *     「通过」也不是「重复挂载」，把它读成前者就是 P-02 的假绿（空射程与真通过同形）。
 *
 * @param {{readings: Record<string, number>}} input
 * @returns {Array<{id: string, selector: string, count: number, pass: boolean, detail: string}>}
 */
export function judgeSingletonCounts({ readings }) {
  const results = []
  for (const spec of SINGLETONS) {
    if (!Object.hasOwn(readings, spec.id)) {
      throw new ProbeUnavailableError(
        'reading-missing',
        `单例 ${spec.id}（${spec.selector}）没有读数——选择器没被求值或页面没就绪，「没读到」不得当结论`,
      )
    }
    const count = readings[spec.id]
    if (!Number.isInteger(count) || count < 0) {
      throw new ProbeUnavailableError(
        'reading-invalid',
        `单例 ${spec.id} 的读数 ${JSON.stringify(count)} 不是非负整数——仪器坏了，不是「没问题」`,
      )
    }
    if (spec.expected !== undefined && count === 0) {
      throw new ProbeUnavailableError(
        'not-mounted',
        `必需单例 ${spec.id}（${spec.selector}）数到 0——本包未装载或当前视图不适用；`
          + '0 不是「通过」（空射程与真通过必须长得不一样，P-15），也不是「重复挂载」',
      )
    }
    const limit = spec.expected ?? spec.atMost
    const pass = spec.expected !== undefined ? count === spec.expected : count <= limit
    const expectation = spec.expected !== undefined ? `期望 ${spec.expected}` : `至多 ${limit}`
    const detail = count === 2 && spec.expected === 1
      ? `数到 2——**重复挂载**（同名单例出现两次；挂载竞态的签名，P-52）`
      : count === 0
        ? `数到 0——未挂载（条件单例，正常）`
        : `数到 ${count}（${expectation}）`
    results.push({ id: spec.id, selector: spec.selector, count, pass, detail })
  }
  return results
}

/** 判决 → 退出码：有红即 1；全绿即 0。unavailable 的 2 由调用方在 catch 里给。 */
export function verdictExitCode(results) {
  return results.every((entry) => entry.pass) ? 0 : 1
}

// ── 射程自检（不需要应用在跑） ────────────────────────────────────────────────
//
// 每条判据至少一对读数（该绿的 + 该红的）+ 三类 typed unavailable。
// 没有这段自检，探针绿过一次之后就没人知道它还能不能红（P-02 / P-03）。
function selfTest() {
  const cases = [
    {
      name: '正常态：容器 1 / 组 1 / 设置壳未挂载',
      readings: { 'workbench-container': 1, 'workbench-group': 1, 'settings-shell-root': 0 },
      wantPass: { 'workbench-container': true, 'workbench-group': true, 'settings-shell-root': true },
      wantExit: 0,
    },
    {
      name: '重复挂载：容器数到 2（黑屏事故的签名）',
      readings: { 'workbench-container': 2, 'workbench-group': 1, 'settings-shell-root': 0 },
      wantPass: { 'workbench-container': false, 'workbench-group': true },
      wantDetail: { 'workbench-container': /重复挂载/ },
      wantExit: 1,
    },
    {
      name: '组行重复：数到 3',
      readings: { 'workbench-container': 1, 'workbench-group': 3, 'settings-shell-root': 0 },
      wantPass: { 'workbench-group': false },
      wantExit: 1,
    },
    {
      name: '设置壳重复：条件单例数到 2 也红',
      readings: { 'workbench-container': 1, 'workbench-group': 1, 'settings-shell-root': 2 },
      wantPass: { 'settings-shell-root': false },
      wantExit: 1,
    },
    {
      name: '设置壳已挂载且唯一',
      readings: { 'workbench-container': 1, 'workbench-group': 1, 'settings-shell-root': 1 },
      wantPass: { 'settings-shell-root': true },
      wantExit: 0,
    },
    {
      name: '必需单例数到 0（本包未装载）→ typed unavailable，不是通过',
      readings: { 'workbench-container': 0, 'workbench-group': 1, 'settings-shell-root': 0 },
      wantUnavailable: 'not-mounted',
    },
    {
      name: '读数缺失（页面没就绪）→ typed unavailable',
      readings: { 'workbench-container': 1, 'workbench-group': 1 },
      wantUnavailable: 'reading-missing',
    },
    {
      name: '读数非法（NaN）→ typed unavailable',
      readings: { 'workbench-container': Number.NaN, 'workbench-group': 1, 'settings-shell-root': 0 },
      wantUnavailable: 'reading-invalid',
    },
    {
      name: '读数非法（负数）→ typed unavailable',
      readings: { 'workbench-container': -1, 'workbench-group': 1, 'settings-shell-root': 0 },
      wantUnavailable: 'reading-invalid',
    },
  ]

  const problems = []
  let assertions = 0
  for (const testCase of cases) {
    try {
      const results = judgeSingletonCounts({ readings: testCase.readings })
      if (testCase.wantUnavailable !== undefined) {
        problems.push(`「${testCase.name}」应 typed unavailable(${testCase.wantUnavailable})，却给出了判决`)
        continue
      }
      for (const [id, want] of Object.entries(testCase.wantPass)) {
        assertions += 1
        const got = results.find((entry) => entry.id === id)
        if (got === undefined) {
          problems.push(`「${testCase.name}」缺 ${id} 的判决行`)
        } else if (got.pass !== want) {
          problems.push(`「${testCase.name}」判据 ${id}：期望 pass=${want}，实得 ${got.pass} —— 该判据没有射程`)
        }
      }
      for (const [id, pattern] of Object.entries(testCase.wantDetail ?? {})) {
        assertions += 1
        const got = results.find((entry) => entry.id === id)
        if (got === undefined || !pattern.test(got.detail)) {
          problems.push(`「${testCase.name}」判据 ${id} 的文案缺「${pattern}」：${got?.detail}`)
        }
      }
      assertions += 1
      const exitCode = verdictExitCode(results)
      if (exitCode !== testCase.wantExit) {
        problems.push(`「${testCase.name}」退出码期望 ${testCase.wantExit}、实得 ${exitCode}`)
      }
    } catch (error) {
      if (testCase.wantUnavailable !== undefined && error instanceof ProbeUnavailableError) {
        assertions += 1
        if (error.code !== testCase.wantUnavailable) {
          problems.push(`「${testCase.name}」期望 typed unavailable=${testCase.wantUnavailable}，实得 ${error.code}`)
        }
      } else {
        problems.push(`「${testCase.name}」judgeSingletonCounts() 异常：${error.message}`)
      }
    }
  }

  if (problems.length > 0) {
    console.error('✗ 单例计数探针射程自检未通过：')
    for (const problem of problems) console.error(`  ✗ ${problem}`)
    return 1
  }
  console.log(`✓ 单例计数探针射程自检：${cases.length} 个状态、${assertions} 条断言，全部按预期红/绿/typed unavailable。`)
  console.log('  （覆盖：正常态 / 容器重复 / 组重复 / 条件单例重复与挂载 / 未装载 / 读数缺失 / 读数非法 ×2）')
  return 0
}

// ── 实机读数（CDP） ──────────────────────────────────────────────────────────
async function main() {
  if (argv.includes('--self-test')) {
    process.exitCode = selfTest()
    return
  }

  const die2 = (message, candidates = []) => {
    console.error(`[exit 2 · 仪器不可用] ${message}`)
    if (candidates.length > 0) console.error('候选：\n' + candidates.join('\n'))
    process.exit(2)
  }

  let targets
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  } catch (error) {
    die2(`CDP 端口 ${PORT} 连不上（${error.message}）。应用需带 --remote-debugging-port=${PORT} 启动（scripts/acceptance/relaunch-dsh-cdp.sh）。`)
  }
  const page = targets
    .filter((t) => t.type === 'page' && /127\.0\.0\.1:\d+/.test(String(t.url ?? '')))
    .pop()
  if (page === undefined) {
    die2('没有 SPA 页面 target', targets.map((t) => `${t.type}: ${String(t.url).slice(0, 90)}`))
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await Promise.race([
    new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', () => reject(new Error('ws error')), { once: true })
    }),
    sleep(10000).then(() => { throw new Error('ws open 超时') }),
  ])
  let seq = 0
  const waiting = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.id !== undefined && waiting.has(message.id)) {
      waiting.get(message.id)(message)
      waiting.delete(message.id)
    }
  })
  const send = (method, params = {}, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const id = ++seq
    waiting.set(id, (message) => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)))
    ws.send(JSON.stringify({ id, method, params }))
    sleep(timeoutMs).then(() => {
      if (waiting.has(id)) {
        waiting.delete(id)
        reject(new Error(`${method} 超时`))
      }
    })
  })
  await send('Runtime.enable')

  // 一条表达式数完所有单例：逐条独立求值会让「页面中途被换掉」产生混批读数。
  const expression = `(() => {
    const out = {};
    ${SINGLETONS.map((spec) => `out[${JSON.stringify(spec.id)}] = document.querySelectorAll(${JSON.stringify(spec.selector)}).length;`).join('\n    ')}
    return out;
  })()`
  let readings
  try {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true }, 30000)
    if (response.exceptionDetails !== undefined) {
      die2(`页面内求值抛错：${JSON.stringify(response.exceptionDetails).slice(0, 300)}`)
    }
    readings = response.result?.value
    if (readings === undefined || readings === null) {
      die2('页面内求值没有返回值——页面没就绪或 target 选错了（「读不到」不得静默）')
    }
  } catch (error) {
    die2(`单例计数求值失败：${error.message}`)
  }

  let results
  try {
    results = judgeSingletonCounts({ readings })
  } catch (error) {
    if (error instanceof ProbeUnavailableError) {
      die2(`[${error.code}] ${error.message}`)
    }
    throw error
  }

  console.log(`CDP port=${PORT} target=${String(page.url).slice(0, 80)}`)
  for (const entry of results) {
    const spec = SINGLETONS.find((candidate) => candidate.id === entry.id)
    console.log(`${entry.pass ? 'PASS' : 'FAIL'}  ${entry.id}  ${entry.detail}`)
    if (spec !== undefined) console.log(`      └ ${spec.why}`)
  }
  const failed = results.filter((entry) => !entry.pass)
  console.log(`单例判据 ${results.length - failed.length}/${results.length} 过`)
  ws.close()
  process.exitCode = verdictExitCode(results)
}

await main()
