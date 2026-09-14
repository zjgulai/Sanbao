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
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { cpus, loadavg, tmpdir } from 'node:os'
import { join } from 'node:path'
import { readMachineLoad, runScript, SCRIPT_OUTPUT_TAIL } from './run-script.mjs'

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

test('超时读数：正在烧 CPU 的进程必须出现在读数里（真起一个烧 CPU 的进程）', () => {
  // 用 /bin/cat 的副本当烧 CPU 的进程：**名字是独特的**，所以「它出现在前 5 名里」
  // 只能是当场读出来的——写死的读数、缓存的读数、或只打印 load 的实现都混不过这一条。
  const tmp = mkdtempSync(join(tmpdir(), 'run-script-load-'))
  const burner = join(tmp, 'dshgateload-burner')
  copyFileSync('/bin/cat', burner)
  chmodSync(burner, 0o755)
  const child = spawn(burner, ['/dev/zero'], { stdio: ['ignore', 'ignore', 'ignore'], detached: true })
  try {
    execFileSync('sleep', ['0.4']) // 让它真的跑起来并积累 CPU 时间，再触发超时
    const note = runScript(CWD, 'sleep 5', 300).note ?? ''
    assert.match(note, /占 CPU 前 \d+：/, `note 必须列出占 CPU 的进程：${note}`)
    assert.match(
      note,
      /dshgateload-burner \d+%/,
      `正在烧 CPU 的进程必须出现在读数里（否则这个读数不是当场读的）：${note}`,
    )
  } finally {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
    rmSync(tmp, { recursive: true, force: true })
  }
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
