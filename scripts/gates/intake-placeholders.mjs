/**
 * 入库面占位化校验项（P-48 收口）。
 *
 * ## 为什么需要它
 *
 * P-48 的实测（2026-09-18）：跑一次**受认可**的入库命令，`manifest/intake-provenance.json`
 * 的 `_meta.from` 就从 `__SKILL_INTAKE_SOURCE__` 被还原成构建机绝对路径
 * （`/Users/lute/…/Downloads/skills`），`sourceUnit` 与 `runtime-deps.json` 的 `venvPython`
 * 同样——退出码 0、输出全绿、diff 里只像「新增了一条技能」。当时的处置是记账 + 手工占位化，
 * 而**写入者仍然会把它写回去**：本条判据读的正是这个面，让「还原」在提交前就被点名。
 *
 * ## 判据
 *
 * 1. **只读两份已提交的入库面清单**（`manifest/intake-provenance.json` 与
 *    `manifest/runtime-deps.json`）——射程刻意窄：它们是 P-48 实测被写脏的两份，
 *    别把「有没有机器路径」扩成全仓扫描（噪声会把校验变成被关掉的校验，P-07）。
 * 2. 出现构建机路径（`/Users/…` 的绝对路径、或字面 `$HOME`）**逐行判红并点名**。
 *    环境值只在运行期读取处解析；写进已提交文件的必须是占位符
 *    （`__SKILL_INTAKE_SOURCE__` / `__DSH_HOME__`）。
 * 3. **读不到 ≠ 干净**（P-15）：清单缺失或不可读判红；射程为空判红。
 * 4. 与出货链的 `packaging/scripts/rewrite-build-paths.mjs`（ADR-0073）划清射程：
 *    那条改的是**出货副本**，本条守的是**仓库里的入库面**，两者不双写同一处。
 *
 * @module
 */

/** 入库面两份清单（仓库相对路径）——射程是常量，防止有人把其中一份摘掉。 */
export const INTAKE_SURFACE_FILES = Object.freeze([
  'packages/capabilities/dsh-overseas-skills/manifest/intake-provenance.json',
  'packages/capabilities/dsh-overseas-skills/manifest/runtime-deps.json',
])

/** 构建机路径签名：绝对家目录路径或字面 `$HOME`。 */
export const MACHINE_PATH_RE = /\/Users\/[^"'\s]*|\$HOME(?![A-Za-z_])/g

/**
 * 扫入库面。
 * @param {{files: Array<{relPath: string, text: string|null}>}} input
 *   `text` 为 null 表示读不到（缺失/不可读）——判红，不当作「没有违规」。
 * @returns {{passed: boolean, violations: string[], note: string}}
 */
export function scanIntakeSurface({ files }) {
  const violations = []
  if (!Array.isArray(files) || files.length === 0) {
    return {
      passed: false,
      violations: ['射程为空：一个入库面文件都没扫——「一个都没比」与「都比过且干净」必须分开（P-15）'],
      note: '射程 0 个文件',
    }
  }

  let placeholders = { source: 0, dshHome: 0 }
  let scanned = 0
  for (const { relPath, text } of files) {
    if (typeof text !== 'string') {
      violations.push(`${relPath}: 读不到内容——「读不到」不等于「干净」（P-15）：文件缺失或不可读时本项无法判定，判红而不是放行`)
      continue
    }
    scanned += 1
    placeholders.source += (text.match(/__SKILL_INTAKE_SOURCE__/g) ?? []).length
    placeholders.dshHome += (text.match(/__DSH_HOME__/g) ?? []).length
    text.split('\n').forEach((line, index) => {
      MACHINE_PATH_RE.lastIndex = 0
      const hits = [...line.matchAll(MACHINE_PATH_RE)].map((match) => match[0])
      if (hits.length === 0) return
      violations.push(
        `${relPath}:${index + 1}: 出现构建机路径 ${hits.map((hit) => JSON.stringify(hit)).join('、')}`
          + '——写入者应直接写占位符（`__SKILL_INTAKE_SOURCE__` / `__DSH_HOME__`），'
          + '环境值只在运行期读取处解析；被一次「受认可的命令」写回来的路径在 diff 里只像新增了一条技能（P-48）',
      )
    })
  }

  return {
    passed: violations.length === 0,
    violations,
    note: `扫描 ${scanned} 个入库面文件；占位符 __SKILL_INTAKE_SOURCE__ ×${placeholders.source}、`
      + `__DSH_HOME__ ×${placeholders.dshHome}；构建机路径命中 ${violations.length} 处`,
  }
}
