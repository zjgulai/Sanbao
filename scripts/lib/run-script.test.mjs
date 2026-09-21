/**
 * `run-script.mjs` 的验收：全部起**真实子进程**。
 *
 * 为什么不用假数据喂函数：ADR-0043 的失效模式恰恰是「假数据本身就带上了我想要的形状」。
 * 旧代码在纸面上完全正确——`stdout` 与 `stderr` 都拿到了、都拼进去了、都截了尾；
 * 只有让一个真进程吐出真实比例的 784 字节 stdout 与 5821 字节 stderr，
 * 「体量大的流挤掉小的」才暴露出来。所以本文件每一例都 spawn 真进程。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, loadavg, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describeTestRunFailure, readMachineLoad, runScript, SCRIPT_OUTPUT_TAIL } from './run-script.mjs'

const CWD = process.cwd()
const TIMEOUT_MS = 30000

/**
 * 造一个「stdout 一小段汇总 + stderr 一大片警告 + 退出码 1」的子进程，
 * 比例照抄 dsh-skill-center-local 跑 vitest 的实测值。
 * @param {number} warnLines 警告行数（700 行 ≈ 45 KB，远超 4000 字节尾部预算）
 * @returns {string} 交给 `sh -c` 的脚本
 */
function noisyFailure(warnLines) {
  return `printf 'Test Files  1 failed (11)\\n  x panel.spec.tsx > forwards the displayed skill path\\n'; i=0; while [ $i -lt ${warnLines} ]; do printf 'Warning: An update to Root inside a test was not wrapped in act(...).\\n' >&2; i=$((i+1)); done; exit 1`
}

test('分流：stdout 里的失败汇总不被体量更大的 stderr 警告挤掉（ADR-0043 实测比例）', () => {
  const result = runScript(CWD, noisyFailure(700), TIMEOUT_MS)

  assert.equal(result.code, 1)
  // stdout 必须完整保住——它是「哪个测试挂了」的唯一来源
  assert.match(result.stdout, /Test Files {2}1 failed \(11\)/)
  assert.match(result.stdout, /forwards the displayed skill path/)
  // stderr 也必须留有痕迹，且确实大到足以在旧实现里独占截尾窗口
  assert.match(result.stderr, /not wrapped in act/)
  assert.equal(
    result.stderr.length,
    SCRIPT_OUTPUT_TAIL,
    'stderr 必须把尾部预算撑满（证明原始输出远超预算），否则本项复现不出旧的挤占条件',
  )
})

test('分流：旧的「拼接后截尾」在同样输入下会丢掉汇总（负向对照，钉住回归）', () => {
  const result = runScript(CWD, noisyFailure(700), TIMEOUT_MS)

  // 复刻旧实现：stdout 全在前、stderr 全在后拼成一个 blob 再取尾
  const legacyBlob = `${result.stdout}${result.stderr}`.slice(-SCRIPT_OUTPUT_TAIL)

  assert.equal(
    legacyBlob.includes('Test Files'),
    false,
    '旧实现应当丢掉汇总——若不丢，说明本测试的体量比例已失效，需按实测重新校准',
  )
  assert.match(legacyBlob, /not wrapped in act/, '旧实现剩下的只有警告噪声，与那次门禁报告完全一致')
})

test('退出码：成功返回 0 与 stdout', () => {
  const result = runScript(CWD, "printf 'all good\\n'", TIMEOUT_MS)

  assert.equal(result.code, 0)
  assert.match(result.stdout, /all good/)
})

test('退出码：被信号终止时报 null 并说明信号，不折算成「退出码 1」', () => {
  const result = runScript(CWD, 'kill -TERM $$', TIMEOUT_MS)

  assert.equal(result.code, null, '没有退出码就不能编一个出来——否则与真正的测试失败混为一谈')
  assert.match(result.note ?? '', /被信号 SIGTERM 终止/)
})

test('超时：按 124 记，并说明是超时而非失败（Node v26 不置 error.killed，须查 ETIMEDOUT）', () => {
  const result = runScript(CWD, 'sleep 5', 300)

  // 旧代码只查 `error.killed`——Node v26 下它是 undefined，超时于是掉进 `?? 1`，
  // 被报成「退出码 1」。本项钉住的正是「文档写 124、实际永远是 1」这个裂缝。
  assert.equal(result.code, 124)
  assert.match(result.note ?? '', /超时 300ms/)
})

test('超时：区分得开「超时」与「被信号杀」——两者都是 code null/signal，但不能同报', () => {
  const timedOut = runScript(CWD, 'sleep 5', 300)
  const signaled = runScript(CWD, 'kill -TERM $$', TIMEOUT_MS)

  assert.notEqual(timedOut.code, signaled.code, '超时记 124、被信号记 null，报告里必须分得开')
  assert.match(timedOut.note ?? '', /超时/)
  assert.doesNotMatch(signaled.note ?? '', /超时/)
})

// ── 超时读数（2026-09-14 加）：让「环境假红」与「代码红」在输出上分得开 ─────────────
// 动机是实测过的两次：① 平时 3 秒跑完的包测试在杀毒扫盘时顶到 180s 并报「退出码 124」，
// 与「代码真的坏了」在输出上完全同形；② 有一次 `gate:full` 有一项红，但输出没留档、
// 被 `tail` 截掉，于是「红的是哪一项」不可知——那次读数丢失本身就是这条缺陷的形状。
// 处置是**加读数、不放宽超时**：放宽会把真缺陷一起放过去。

test('超时读数：load 是当场读的（与独立读数一致），不是常量', () => {
  const result = runScript(CWD, 'sleep 5', 300)
  const note = result.note ?? ''

  const m = /load (\d+\.\d{2})\/(\d+\.\d{2})\/(\d+\.\d{2})（(\d+) 核）/.exec(note)
  assert.ok(m !== null, `note 里必须有 load 读数（1/5/15 分钟 + 核数）：${note}`)
  const [one] = loadavg()
  assert.ok(
    Math.abs(Number(m[1]) - one) < 1,
    `note 里的 1 分钟 load（${m[1]}）必须与独立读数（${one.toFixed(2)}）对得上——差太多说明它是编的`,
  )
  assert.equal(Number(m[4]), cpus().length, '核数必须来自这台机器')
})

test('超时读数：进程表按 pcpu 降序取前 5，且那份表是当场从 ps 读的', () => {
  // 为什么换成受控的 `ps` 替身（2026-09-21）：这一例原先是「真起一个烧 CPU 的进程，
  // 断言它出现在前 5 名里」。那等于让判据去抢一个**全局排名**——本机挂着五个 96% CPU 的
  // 孤儿 vitest worker 时，烧 CPU 的替身再怎么忙也挤不进前 5，判据就在**负载**上翻脸。
  // 排名本身不是本项要证的东西；要证的是「调用了 ps、按 pcpu 排、截到 5、名字取对了」，
  // 这些用一份受控表证得更严（乱序输入 + 7 行 + 落榜的两行点名不许出现）。
  const tmp = mkdtempSync(join(tmpdir(), 'run-script-ps-'))
  const marker = join(tmp, 'ps-invoked')
  const fakePs = join(tmp, 'ps')
  writeFileSync(
    fakePs,
    [
      '#!/bin/sh',
      `printf 'called\\n' > ${JSON.stringify(marker)}`,
      `printf '%s\\n' ' 12.0  1001 alpha' ' 88.4  1002 dshpshello-hi' '  3.1  1003 beta' \\
        ' 71.2  1004 dshpshello-mid' ' 45.0  1005 dshpshello-low' '  9.9  1006 gamma' \\
        '  1.0  1007 delta'`,
    ].join('\n'),
  )
  chmodSync(fakePs, 0o755)
  const saved = process.env.PATH
  process.env.PATH = `${tmp}:${saved}`
  let note
  try {
    note = runScript(CWD, 'sleep 5', 300).note ?? ''
  } finally {
    process.env.PATH = saved
  }

  assert.equal(existsSync(marker), true, '读数必须真的来自一次 ps 调用，不是写死的表')
  const m = /占 CPU 前 (\d+)：([^\n]*)/.exec(note)
  assert.ok(m !== null, `note 必须列出占 CPU 的进程：${note}`)
  assert.equal(m[1], '5', `七行输入必须截到前 5，实际 ${m[1]}`)
  assert.equal(
    m[2],
    'dshpshello-hi 88%、dshpshello-mid 71%、dshpshello-low 45%、alpha 12%、gamma 10%',
    `必须按 pcpu 降序取前 5（乱序输入是这条用例的牙）：${m[2]}`,
  )
  assert.equal(/beta|delta/.test(m[2]), false, `第 6、7 名不得混进读数：${m[2]}`)
  rmSync(tmp, { recursive: true, force: true })
})

test('超时读数：进程读不到时必须说出来，且不许把 load 一起吞掉', () => {
  // 把 PATH 指到一个空目录 → `ps` 找不到。这是**真实的**读不到，不是喂假数据。
  const saved = process.env.PATH
  const empty = mkdtempSync(join(tmpdir(), 'run-script-nopath-'))
  process.env.PATH = empty
  try {
    const note = readMachineLoad()
    assert.match(note, /load \d+\.\d{2}\/\d+\.\d{2}\/\d+\.\d{2}/, 'load 来自 os 模块，读不到 ps 也必须还在')
    assert.match(note, /进程读数取不到/, `读不到必须自己说出来，不能长得像「机器很闲」：${note}`)
    assert.match(note, /不等于机器空闲/, '要把「读不到 ≠ 空闲」写进读数本身，否则读的人会当成客观读数')
  } finally {
    process.env.PATH = saved
    rmSync(empty, { recursive: true, force: true })
  }
})

// ── 判词分类（2026-09-21 加）：超时不得被写成「用例判红」 ─────────────────────────
// 实测形状：`repo-attest-selftest` 的墙钟预算是 120s，而用例集本机要跑 139s（9/9 全绿）。
// 门禁报出的却是「侧效应见证六条结束路径的反向自测失败（退出码 124）」——
// 判词说「自测失败」，而自测根本没失败：是**预算**读不到结论。读的人据此去改代码，方向就错了。

test('判词分类：超时报的是预算，不谎称「反向自测失败」', () => {
  const result = runScript(CWD, 'sleep 5', 300)
  assert.equal(result.code, 124)

  const violations = describeTestRunFailure({
    result,
    scriptPath: 'scripts/lib/example.test.mjs',
    failureLabel: '示例判据的反向自测失败',
  })

  assert.equal(violations.length, 1, `超时必须给一条判词，实际 ${JSON.stringify(violations)}`)
  assert.match(violations[0], /墙钟预算 300ms 用尽/, `必须点名耗尽的预算：${violations[0]}`)
  assert.match(violations[0], /退出码 124/, `必须带上原始退出码：${violations[0]}`)
  assert.match(violations[0], /未跑完不等于用例判红/, '必须说明这条红不能当代码缺陷读')
  assert.doesNotMatch(
    violations[0],
    /示例判据的反向自测失败/,
    `超时判词不得复用「自测失败」这句——那正是把人推向错方向的话：${violations[0]}`,
  )
})

test('判词分类：超时时把当场机器读数一起带进判词', () => {
  const result = runScript(CWD, 'sleep 5', 300)
  const violations = describeTestRunFailure({
    result,
    scriptPath: 'scripts/lib/example.test.mjs',
    failureLabel: '示例判据的反向自测失败',
  })

  assert.match(
    violations[0],
    /load \d+\.\d{2}\/\d+\.\d{2}\/\d+\.\d{2}（\d+ 核）/,
    `必须带上当场读的 load，否则读的人无法判断是不是环境慢：${violations[0]}`,
  )
  assert.match(
    violations[0],
    /node --test scripts\/lib\/example\.test\.mjs/,
    `必须给出单独复跑的命令：${violations[0]}`,
  )
})

test('判词分类：用例真的判红时才用 failureLabel，且逐条带出失败的用例行', () => {
  const result = runScript(
    CWD,
    "printf '✖ 会挂的那条用例\\n✖ AssertionError: 期望 1 实际 2\\n'; exit 1",
    TIMEOUT_MS,
  )
  assert.equal(result.code, 1)

  const violations = describeTestRunFailure({
    result,
    scriptPath: 'scripts/lib/example.test.mjs',
    failureLabel: '示例判据的反向自测失败',
  })

  assert.deepEqual(
    violations,
    ['✖ 会挂的那条用例', '✖ AssertionError: 期望 1 实际 2'],
    '真判红必须逐条点名失败的用例，而不是只说「失败了」',
  )
})

test('判词分类：非零但没有可解析的失败行时，报退出码而不编造用例名', () => {
  const result = runScript(CWD, "printf 'boom\\n' >&2; exit 3", TIMEOUT_MS)

  const violations = describeTestRunFailure({
    result,
    scriptPath: 'scripts/lib/example.test.mjs',
    failureLabel: '示例判据的反向自测失败',
  })

  assert.deepEqual(violations, ['示例判据的反向自测失败（退出码 3）'])
})

test('判词分类：读不到退出码时报「未给出退出码」，不折算成 1', () => {
  const violations = describeTestRunFailure({
    result: { code: null, stdout: 'partial', stderr: '' },
    scriptPath: 'scripts/lib/example.test.mjs',
    failureLabel: '示例判据的反向自测失败',
  })

  assert.deepEqual(violations, ['示例判据的反向自测失败（未给出退出码）'])
})
