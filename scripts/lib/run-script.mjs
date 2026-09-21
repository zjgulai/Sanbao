/**
 * 包脚本执行器：按**分流**保留 stdout / stderr 尾部，且不伪造退出码（ADR-0043）。
 *
 * 为什么独立成模块：这段逻辑的正确性只能被**真实子进程**证伪——「分流是否真的分流」
 * 「超限是否真的报超限」，用假数据喂函数是证不出来的（假数据本身就带上了我想要的形状）。
 * 而 `gate.mjs` 是带顶层副作用的脚本，import 即执行整轮门禁，测不了。抽到 `scripts/lib/`
 * 后由 `run-script.test.mjs` 起真子进程当场验证，与 `real-node.mjs`、`strip-comments.mjs`
 * 同处一层。
 */
import { execFileSync } from 'node:child_process'
import { cpus, loadavg } from 'node:os'
import { join } from 'node:path'

/**
 * 保留的输出尾部长度。实测校准（2026-09-11）：patch-anchors 依赖的
 * verify-patches-v2.sh 会打印 35 行锚点结果（约 1 KB），而 FAIL/MISSING 明细
 * 出现在输出**开头**——原先的 500 字符只留到 OK 行与汇总，导致门禁只能报
 * 「退出码 1」而指不出漂移项。4000 足以容纳该脚本全部输出，仍远小于异常堆栈。
 */
export const SCRIPT_OUTPUT_TAIL = 4000

/**
 * 子进程单流输出上限。默认 1 MiB 对测试运行器太紧，且一旦超限，
 * `execFileSync` 抛出的错误没有 `status`——旧代码把它折算成「退出码 1」，
 * 「输出超限」从此被读成「测试失败」（ADR-0043）。
 */
export const SCRIPT_MAX_BUFFER = 16 * 1024 * 1024

/**
 * 超时时附带一台**机器读数**（2026-09-14 加，总账 P-18 的同族处置：读数而不是放宽）。
 *
 * 为什么要它：`scripts-runnable` 的超时上限（180s）对机器负载敏感。实测过一次形态——
 * 平时 3 秒跑完的包测试在杀毒扫盘时顶到 180s 并报「退出码 124」，而这条红与「代码真的坏了」
 * 在输出上**完全同形**；本会话还有一次更糟：第一次 `gate:full` 有一项红，但输出没留档、
 * `tail` 把它截掉了，于是「红的是哪一项」不可知——那次读数丢失本身就是这条缺陷的形状。
 *
 * 所以超时时把**当时的机器状态**一起报出来（load 均值 + 占 CPU 最高的几个进程），
 * 让读的人一眼分得清「环境假红」与「代码红」。**放宽超时是错的方向**：那会把真缺陷也一起放过去。
 *
 * 诚实边界：`readMachineLoad()` 读不到时**必须说出来**——「读不到」不等于「机器空闲」，
 * 更不等于「代码没问题」（P-02 / P-10 的读数纪律）。
 * @returns {string} 例如 `load 5.90/4.10/3.20（10 核）；占 CPU 前 5：kavd 246%、node 88%`
 */
export function readMachineLoad() {
  const cores = cpus().length
  const [one, five, fifteen] = loadavg().map((v) => v.toFixed(2))
  const head = `load ${one}/${five}/${fifteen}（${cores} 核）`
  try {
    const out = execFileSync('ps', ['-Ao', 'pcpu=,pid=,comm='], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 4 * 1024 * 1024,
    })
    const top = out
      .split('\n')
      .map((line) => /^\s*([\d.]+)\s+(\d+)\s+(.+?)\s*$/.exec(line))
      .filter((m) => m !== null)
      .map((m) => ({ cpu: Number(m[1]), pid: m[2], comm: m[3] }))
      .filter((p) => Number.isFinite(p.cpu))
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 5)
      .map((p) => `${p.comm.split('/').slice(-1)[0]} ${p.cpu.toFixed(0)}%`)
    if (top.length === 0) return `${head}；进程读数取不到（ps 没有给出任何一行）——「读不到」不等于机器空闲`
    return `${head}；占 CPU 前 ${top.length}：${top.join('、')}`
  } catch (error) {
    const why = error.code === 'ETIMEDOUT' ? 'ps 超时 5000ms' : (error.message ?? String(error))
    return `${head}；进程读数取不到（${why}）——「读不到」不等于机器空闲`
  }
}

/**
 * 运行一个包脚本并返回退出码与**分流**输出尾部。
 *
 * 为什么分流（ADR-0043）：原先把 `error.stdout` 与 `error.stderr` 拼成一个 blob
 * 再取尾，等于假设「后拼的那个流更有信息」。实测 dsh-skill-center-local 跑一轮
 * vitest：stdout 只有 784 字节（`Test Files / Tests` 汇总全在此），stderr 有 5821
 * 字节的 React `act()` 警告。拼接后取最后 4000 字符，汇总被整段挤出——门禁报
 * 「退出码 1」，附上的却全是警告噪声，读过报告的人无从知道哪个测试挂了。
 * 分流保留后由调用方按流取证，谁的体量大都不再挤掉另一个。
 * @param {string} cwd 包目录
 * @param {string} script 脚本命令
 * @param {number} timeoutMs 超时毫秒
 * @param {Record<string, string>} [extraEnv] 追加的环境变量
 * @returns {{code: number|null, stdout: string, stderr: string, note?: string}}
 *   超时按 124 记（与 coreutils timeout 一致）；被信号终止或输出超限时 `code` 为
 *   `null` 并在 `note` 里说明原因——**不折算成 1**，否则「没有退出码」会被读成
 *   「退出码 1」，与真正的测试失败混为一谈。
 */
export function runScript(cwd, script, timeoutMs, extraEnv = {}) {
  const binDir = join(cwd, 'node_modules', '.bin')
  const env = { ...process.env, ...extraEnv, PATH: `${binDir}:${process.env.PATH ?? ''}` }
  try {
    const stdout = execFileSync('sh', ['-c', script], {
      cwd,
      env,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: SCRIPT_MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, stdout: String(stdout).slice(-SCRIPT_OUTPUT_TAIL), stderr: '' }
  } catch (error) {
    const stdout = String(error.stdout ?? '').slice(-SCRIPT_OUTPUT_TAIL)
    const stderr = String(error.stderr ?? '').slice(-SCRIPT_OUTPUT_TAIL)
    // 超时按 124 记（与 coreutils timeout 一致）。**两个字段都要查**：Node v26 实测
    // `execFileSync` 超时时 `error.killed` 是 `undefined`，判别字段是
    // `error.code === 'ETIMEDOUT'`（signal 为 SIGTERM、status 为 null）。旧代码只查
    // `error.killed`，超时于是掉进下面的 `?? 1` 被报成「退出码 1」——文档声明的 124
    // 从未生效，超时与测试失败在报告里长得一模一样（ADR-0043）。
    if (error.killed === true || error.code === 'ETIMEDOUT') {
      // 超时带上当时的机器读数：那是唯一能让人分清「环境假红」与「代码红」的东西。
      return { code: 124, stdout, stderr, note: `超时 ${timeoutMs}ms；当时读数：${readMachineLoad()}` }
    }
    const note =
      error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
        ? `输出超过 maxBuffer ${SCRIPT_MAX_BUFFER} 字节`
        : error.signal
          ? `被信号 ${error.signal} 终止`
          : undefined
    return {
      code: typeof error.status === 'number' ? error.status : null,
      stdout,
      stderr,
      ...(note ? { note } : {}),
    }
  }
}

/** 从超时的 `note` 里取出当场机器读数；取不到就说取不到，不编一个「机器很闲」。 */
function machineReadingOr(result) {
  const m = /当时读数：([\s\S]*)$/.exec(result.note ?? '')
  return m !== null ? m[1] : '（机器读数未给出——「未给出」不等于机器空闲）'
}

/**
 * 把一次 `node --test` 运行的结果翻译成门禁的判词。
 *
 * 为什么要分这一刀（2026-09-21 实测）：`repo-attest-selftest` 的墙钟预算 120s，
 * 用例集本机跑完要 139s 且 9/9 全绿，而旧实现把这件事报成
 * 「侧效应见证六条结束路径的反向自测失败（退出码 124）」——
 * 判词说「自测失败」，自测却没失败，是**预算**没读到结论。`runScript` 已经算出了
 * 超时的当场机器读数，旧实现在聚合处把它丢了，于是 P-21 的两种前提（环境事实 /
 * 数据缺陷）又报成了同一句话。
 *
 * @param {{result: {code: number|null, stdout?: string, stderr?: string, note?: string}, scriptPath: string, failureLabel: string}} args
 *   `result` 是 `runScript` 的返回；`scriptPath` 用于给出单独复跑的命令；
 *   `failureLabel` 只在**用例真的判红却没有可解析的失败行**时才用
 * @returns {string[]} 违规明细（空数组不代表通过，由调用方按退出码判）
 */
export function describeTestRunFailure({ result, scriptPath, failureLabel }) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  if (result.code === 124) {
    const budget = /超时 (\d+)ms/.exec(result.note ?? '')?.[1] ?? '未知'
    return [
      `「${scriptPath}」的墙钟预算 ${budget}ms 用尽（退出码 124）——未跑完不等于用例判红，`
      + `这条红不能按代码缺陷读。当时读数：${machineReadingOr(result)}。`
      + `先单独复跑 node --test ${scriptPath} 看真实读数，再判断该修的是用例还是预算`,
    ]
  }
  const lines = output
    .split('\n')
    .filter((line) => /^\s*✖/.test(line) || /AssertionError/.test(line))
    .map((line) => line.trim())
  if (lines.length > 0) return lines
  return [`${failureLabel}（${result.code === null ? '未给出退出码' : `退出码 ${result.code}`}）`]
}
