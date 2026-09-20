/**
 * 「本轮改动面没有不可读文件」判据（P-45 收口）。
 *
 * ## 为什么需要它
 *
 * 2026-09-18 实测：编辑工具改写路径把一个文件的权限位留成 `----------`——同一次
 * 事故里这样的文件有三个（含门禁入口 `scripts/gate.mjs`）。该形态会**冒充另一个
 * 更贵的结论**（「并发写入污染」），而 `git` 只记可执行位，会把这个文件当普通
 * 文件静默提交。已有的信号（`scripts/gate.mjs` 不可读时整体 `EACCES` 失败）
 * 是响亮的，但它只在**下一个人踩上去时**才响；在它之前，没有任何判据在读
 * 文件的权限位（P-45 原文：「尚无——约定，无强制」）。
 *
 * ## 判据
 *
 * 1. **射程只取本轮改动面**（`changed-packages` 同一套 `resolveChangedScope` 的
 *    四类来源并集），刻意**不**全仓扫描：把日常权限差异全变成噪声，判据就会
 *    因为「太吵」被关掉（P-07 的教训）。
 * 2. 判的是「**谁都读不了**」（三个读位全空，`chmod 000` 及其变体 020/040/060），
 *    而不是字面量 `000`：写-only 的文件与 000 同样会挡住下一次读取。
 * 3. 读位齐备但当前用户仍读不到（R_OK 被拒）同样判红——那通常意味着属主或
 *    ACL 出了问题，与权限位是同一条线索。
 * 4. **记账单位是「可判文件」**：已删除路径与目录/符号链接是**读数**（进 note
 *    的分母），不进 skipped、不判红——删除是正常 git 动作，非普通文件没有
 *    可判的权限位。射程里一个可判文件都没有时给 **skip** 而不是 pass：
 *    「没得判」与「判过且合格」必须长得不一样（P-15）。
 *
 * ## 判红文案的取向
 *
 * 点名「文件 + 当前权限位 + 修复指引」，并且把**先 stat 再怀疑任何人**写进
 * 文案：这条事故的第一反应是「谁在并发写」，而真实原因可能只是编辑工具的
 * 手滑——先看权限位和 mtime，比先怀疑邻居便宜得多。
 *
 * @module
 */
import { accessSync, constants, lstatSync } from 'node:fs'
import { join } from 'node:path'

/** 三个读位（owner/group/other）的掩码：全空 = 谁都读不了。 */
export const READ_BITS = 0o444

/** @param {number} mode @returns {string} 三位八进制 */
function octal(mode) {
  return (mode & 0o777).toString(8).padStart(3, '0')
}

/**
 * 跑一次权限位校验。
 *
 * @param {{
 *   root: string,
 *   paths: string[],
 *   lstat?: (path: string) => {isFile(): boolean, mode: number},
 *   canRead?: (path: string) => void,
 * }} input `lstat` / `canRead` 可注入（测试用）；默认走真实文件系统。
 * @returns {{
 *   status: 'pass'|'fail'|'skip', expected: number, discovered: number, checked: number,
 *   skipped: number, failed: number, typedSkips: Array<{type: string, count: number, reason: string, objects?: string[]}>,
 *   reason: string, note: string, violations: string[],
 * }}
 */
export function checkPermissionBits({ root, paths, lstat = lstatSync, canRead } = {}) {
  const list = Array.isArray(paths) ? paths.filter((path) => typeof path === 'string' && path !== '') : []
  const readCheck = canRead ?? ((path) => { accessSync(path, constants.R_OK) })
  const violations = []
  let checked = 0
  let missing = 0
  let nonFile = 0

  for (const relPath of list) {
    const absolute = join(root, relPath)
    let stat
    try {
      stat = lstat(absolute)
    } catch {
      missing += 1
      continue
    }
    if (!stat.isFile()) {
      nonFile += 1
      continue
    }
    const mode = stat.mode & 0o777
    if ((mode & READ_BITS) === 0) {
      violations.push(
        `${relPath}：权限位 ${octal(mode)}（三个读位全空）——git 只记可执行位，这个形态会被静默提交，`
          + '且会冒充「并发写入污染」这个更贵的结论（2026-09-18 实测：编辑工具改写路径把含 scripts/gate.mjs 的'
          + `三个文件留成 000）。先 stat 再怀疑任何人。误留时的修法：chmod 644 '${relPath}'`,
      )
      continue
    }
    try {
      readCheck(absolute)
    } catch {
      violations.push(
        `${relPath}：权限位 ${octal(mode)} 但当前用户读不到（R_OK 被拒）——先 stat 看属主与 mtime 再决定：`
          + `误留就 chmod 644 '${relPath}'，属主异常才去查并发写者`,
      )
      continue
    }
    checked += 1
  }

  const failed = violations.length
  const note = `改动面 ${list.length} 个路径：可判文件 ${checked} / 已不存在 ${missing} / 非普通文件 ${nonFile}`

  if (failed > 0) {
    // typedSkips 不在这里出场：已删除 / 非普通文件是**读数**（在 note 的分母里），
    // 不是跳过单元——canonical 合同要求 typedSkips 总数等于 skipped，把读数塞进
    // typedSkips 会当场守恒失配（实测：这版第一稿就是这么被本判据自己的 schema 拦下的）。
    return {
      status: 'fail',
      expected: checked + failed,
      discovered: checked + failed,
      checked,
      skipped: 0,
      failed,
      typedSkips: [],
      reason: `${failed} 个改动面文件不可读`,
      note,
      violations,
    }
  }

  if (checked === 0) {
    return {
      status: 'skip',
      expected: 1,
      discovered: 0,
      checked: 0,
      skipped: 1,
      failed: 0,
      typedSkips: [{
        type: list.length === 0 ? 'no-changed-paths' : 'no-judgeable-files',
        count: 1,
        reason: list.length === 0
          ? '改动射程为空——本项**未核对任何文件**（不是「都合格」）'
          : `射程里 ${list.length} 个路径全部不可判（已删除 ${missing} / 非普通文件 ${nonFile}），未核对任何文件`,
      }],
      reason: '射程里没有可判的普通文件',
      note,
      violations: [],
    }
  }

  return {
    status: 'pass',
    expected: checked,
    discovered: checked,
    checked,
    skipped: 0,
    failed: 0,
    typedSkips: [],
    reason: `${checked} 个改动面文件可读`,
    note,
    violations: [],
  }
}
