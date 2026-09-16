/**
 * 「设置页呈现层探针的判据有射程」反向自测（P-02 / P-08）。
 *
 * ## 为什么需要它
 *
 * `scripts/acceptance/settings-shell-live.mjs` 的判据至今写错过**三条**，全是射程为零——
 * 无论被测状态修好没修好都返回同一个值：
 *
 * 1. `curl /plugins/…/client.js` 拿 404 当「实例里没有这个包」（该 HTTP 面整体 401 守卫）；
 * 2. 「AXScrollToVisible 调用成功」（基线里它同样成功）；
 * 3. 「AX 树里出现滚动区域」（nav 落成 landmark role，Chromium 每节点只给一个 role，恒为空）。
 *
 * 三次的病根相同：**判据写了，但没有任何东西拿一个「应该判红」的状态去试它**。
 * 「记得试一下」是纪律；纪律守不住的东西要用机制守（P-08）。所以本用例把它变成机制：
 * 探针自带 `--self-test`（把已知状态读数喂进 `judge()`），而本文件进一步做**突变控制**
 * ——把判据改成恒真桩，`--self-test` **必须**当场判红。突变不红，就说明拦住缺陷的不是
 * 判据本身（P-02）。
 *
 * ## 它**不**需要什么（这就是它能进门禁的原因）
 *
 * 不碰 GUI、不需要 DSH Desktop 在跑、不需要重启、不读任何磁盘状态之外的输入。
 * 跑的是纯函数 `judge()` 与一组写死的读数。要**真的**量那台跑着的实例，跑
 * `pnpm run accept:settings-shell`（那条需要应用在前台，见该文件头部）。
 *
 * ## 边界（诚实写清楚）
 *
 * 本用例证明的是「**判据对已知读数会红会绿**」，不是「那些读数在真机上会出现」。
 * 后半句只有实况探针能回答。两者谁也冒充不了谁。
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import test from 'node:test'

import { nodeCommand } from '../lib/real-node.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROBE_REL = 'scripts/acceptance/settings-shell-live.mjs'
const PROBE_ABS = join(repoRoot, PROBE_REL)
/** 突变副本必须落在**同一个目录**：探针 import 的是相对路径 `../lib/real-node.mjs`。 */
const MUTANT_ABS = join(repoRoot, 'scripts/acceptance/.criteria-range-mutant.mjs')

/** 跑一次探针，返回退出码与合并输出。 */
function runProbe(file, args = []) {
  const { command, env } = nodeCommand()
  const r = spawnSync(command, [file, ...args], { cwd: repoRoot, env, encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** 造一份「判据被改成恒真桩」的副本，跑完必删。 */
function withMutant(from, to, fn) {
  const src = readFileSync(PROBE_ABS, 'utf8')
  assert.ok(src.includes(from), `突变锚点没找到（探针改过？）：${from}`)
  writeFileSync(MUTANT_ABS, src.replace(from, to))
  try {
    return fn()
  } finally {
    rmSync(MUTANT_ABS, { force: true })
  }
}

test('自检本身必须是绿的：现存判据对 5 个已知状态都给出预期红/绿', () => {
  const { code, out } = runProbe(PROBE_ABS, ['--self-test'])
  assert.equal(code, 0, `--self-test 应当通过，实得退出码 ${code}：\n${out}`)
  assert.match(out, /判据射程自检：\d+ 个状态、\d+ 条断言/, `没看到自检汇总行：\n${out}`)
  // 自检**不能**顺手去碰 GUI：它必须能在没有任何 app、任何权限的机器上跑。
  assert.doesNotMatch(out, /macos-harness|AXWindow|window-off-screen/, '自检碰了实况仪器，就不再是纯函数用例')
})

test('突变控制：l1Ok 改成恒真桩，自检必须判红并点名 l1Ok', () => {
  const { code, out } = withMutant(
    'const l1Ok = railIndependent && lastReachable',
    'const l1Ok = true',
    () => runProbe(MUTANT_ABS, ['--self-test']),
  )
  assert.notEqual(code, 0, `恒真桩竟然通过——自检没有牙（P-02）：\n${out}`)
  assert.match(out, /l1Ok/, `判红但没点名是哪条判据：\n${out}`)
  assert.match(out, /没有射程/, `判红的原因不对：\n${out}`)
})

test('突变控制：l2Ok 改成恒真桩，自检必须判红', () => {
  const { code, out } = withMutant(
    'l2Ok: panelCss !== null && panelCss >= PANEL_CSS_APPLIED_MIN,',
    'l2Ok: true,',
    () => runProbe(MUTANT_ABS, ['--self-test']),
  )
  assert.notEqual(code, 0, `恒真桩竟然通过——自检没有牙（P-02）：\n${out}`)
  assert.match(out, /l2Ok/, `判红但没点名是哪条判据：\n${out}`)
})

test('突变控制：pluginLoaded 恒真桩会让「未生效」那一档失去射程', () => {
  const { code, out } = withMutant(
    'pluginLoaded: headings.length >= 2,',
    'pluginLoaded: true,',
    () => runProbe(MUTANT_ABS, ['--self-test']),
  )
  assert.notEqual(code, 0, `恒真桩竟然通过——「未生效」状态就再也判不出来了：\n${out}`)
  assert.match(out, /pluginLoaded/, `判红但没点名是哪条判据：\n${out}`)
})

test('已证伪的仪器不得被捡回探针里（dead-instrument 的射程不含 .mjs）', () => {
  // dead-instrument 门禁的射程是 `*.md` / `*.sh` / `*.bash`——`.mjs` 不在里面。
  // 而 2026-09-15 删掉的那条零射程判据正是住在一个 `.mjs` 里。这里补上那个洞：
  // 探针源码里不许再出现已登记死仪器的**使用**形态（注释里写明来龙去脉是允许的，
  // 所以只禁代码行）。
  const src = readFileSync(PROBE_ABS, 'utf8')
  const code = src
    .split('\n')
    .filter((line) => !/^\s*(#|\/\/|\*|\/\*)/.test(line))
    .join('\n')
  for (const forbidden of ['AXScrollArea', 'scrollRoles']) {
    assert.ok(
      !code.includes(forbidden),
      `探针代码行里又出现了已证伪的仪器 ${forbidden}（射程为零，见 scripts/gates/dead-instruments.json）`,
    )
  }
})
