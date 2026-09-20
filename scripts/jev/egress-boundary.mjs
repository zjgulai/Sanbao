/**
 * 出网边界闸门（ADR-0138 D2）。
 *
 * D2 的上限一句话：**只有仓库内被 git 跟踪的文本**可以进入 Jev 请求的 `state`；
 * `~/.dsh/scratch/attrib/**`（实测 62MB 完整会话转录、含 `danger-full-access`、前 300KB
 * 命中密钥形态）永久禁止出境。ADR-0138 后果 1 当时把这条登记成「仍是纪律，没有门禁」——
 * 理由是「来源」属运行期数据流、静态扫不出来。本模块把它换成**运行期闸门**：
 * 装载函数（`loadCorpus` / `loadSamples`）在读任何来源之前先过 `assertEgressSourceTracked`，
 * 不存在、不在任何仓库内、未被跟踪的来源一律大声拒绝。
 *
 * 判据为什么是「被 git 跟踪」而不是「在仓内」：仓库树里同样会有从未打算出境的未跟踪文件
 * （草稿、抓取物、临时 dump），而跟踪集是唯一一份经过评审、可 diff、可追溯的文本集合——
 * 与 T3 拍板「只评仓内 git 跟踪 corpus」是同一条判据。
 *
 * 残余（不假装已消除）：文件被跟踪 ≠ 内容清白。被跟踪的文件仍可能被写入敏感文本，
 * 那一段只能靠人复核——corpus 292 条与样本 9 条都在仓内、可 diff、可评审。
 */
import { execFileSync } from 'node:child_process'
import { realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export class JevEgressBoundaryError extends Error {
  constructor(message) {
    super(message)
    this.name = 'JevEgressBoundaryError'
  }
}

/** 每条拒绝都必须点名 D2：读的人要能顺着这句回到决策，而不是只看到「读不到文件」。 */
const REMEDIATION =
  '（ADR-0138 D2：进入 Jev state 的文本只能是仓库内被 git 跟踪的文件）'

/** git 退出码非 0 或 git 本身不可用都归为 null——两种情形都由调用方给出自己的判词。 */
function gitOrNull(args, cwd) {
  try {
    const stdout = execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return stdout.trim()
  } catch {
    return null
  }
}

/**
 * 断言某个来源可以出境，返回 `{realPath, repoRoot, relPath}`。
 * 不满足时抛 {@link JevEgressBoundaryError}——调用方**不得**吞掉它去降级装载。
 * @param {string | URL} source 待装载的文件（CLI 传入的路径或常量默认路径）
 */
export function assertEgressSourceTracked(source) {
  const absolute = source instanceof URL ? fileURLToPath(source) : resolve(String(source))

  let realPath
  try {
    realPath = realpathSync(absolute)
  } catch {
    throw new JevEgressBoundaryError(`待审来源不存在，拒绝装载：${absolute}${REMEDIATION}`)
  }

  if (!statSync(realPath).isFile()) {
    throw new JevEgressBoundaryError(`待审来源不是文件，拒绝装载：${realPath}${REMEDIATION}`)
  }

  const repoRoot = gitOrNull(['rev-parse', '--show-toplevel'], dirname(realPath))
  if (repoRoot === null || repoRoot === '') {
    throw new JevEgressBoundaryError(
      `待审来源不在任何 git 仓库内，拒绝装载：${realPath}（git 不可用也走本条）${REMEDIATION}`,
    )
  }

  const relPath = relative(repoRoot, realPath)
  if (relPath === '' || relPath.startsWith('..') || isAbsolute(relPath)) {
    throw new JevEgressBoundaryError(
      `待审来源落在仓库根之外，拒绝装载：${realPath}（仓库根 ${repoRoot}）${REMEDIATION}`,
    )
  }

  if (gitOrNull(['ls-files', '--error-unmatch', '--', relPath], repoRoot) === null) {
    throw new JevEgressBoundaryError(
      `待审来源未被 git 跟踪，拒绝装载：${realPath}（仓库 ${repoRoot}）${REMEDIATION}`,
    )
  }

  return { realPath, repoRoot, relPath }
}
