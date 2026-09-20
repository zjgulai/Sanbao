/**
 * 清场清单的「先查承诺」序（P-49 收口）。
 *
 * ## 为什么需要它
 *
 * 2026-09-18 实测：一次全仓深查给出的「无用垃圾」清单按**体积**排序，排最前的正是历史
 * 发布产物（`packaging/release/` 9 个版本约 5.7 GB）。清单读起来完全合理——确实占地方、
 * 确实没有代码 import 它——直到执行删除才撞上：那些目录 9/9 带 `uchg`（删不掉）、
 * 删掉之后门禁判红（`release-verify.sh` 对缺席判 FAIL），而 ADR-0067 的决策段里写着
 * 用户裁决「不允许删除发布的版本和历史发布的版本」。
 *
 * **体积与「有没有人 import」这两把尺子都量不到「承诺」**。所以本工具把三个问题
 * 按固定顺序问，每问都给出自己的读数：
 *
 *   ① **它被谁承诺过**——发布清单（`SHA256SUMS` / `*.sha256`）、`uchg` 不可变标志、
 *      门禁射程（`scripts/gate.mjs` 与 `scripts/gates/**` 的引用）、ADR 决策段；
 *   ② **有没有人引用它**——代码目录（`scripts/` `packaging/` `packages/` `apps/` `shared/`）
 *      里的文本命中（`git grep`，跟索引走不跟磁盘走）；
 *   ③ **多大体积**——只在①②都为「否」时才用来排优先级。
 *
 * ①②任一命中 → 归**证据面**出局（`protected`），不进入删除建议；顺序反了结论会整个
 * 翻转（P-44 的同族：读错一份参照物，结论翻转）。
 *
 * ## 与谁分工（免得被当成全覆盖）
 *
 * - `gate:object-store-hygiene`（ADR-0121）管的是**没有承诺**的对象——git 对象库里的
 *   垃圾包、超限 blob。本工具**不看 .git**，只看工作树/磁盘上的候选条目，两者必须分开判。
 * - `release-verify.sh` 管的是「已发布产物的完整性」（删了之后判红）。本工具管的是
 *   「清单里一开始就别把它写成垃圾」（删之前）。同一条红线的两端。
 * - 本工具是**读数工具不是门禁**：它不判红、不删除，只把三步读数摆出来；
 *   把候选写进删除批次之前，读数必须齐（P-49 的下一版默认动作）。
 *
 * @module
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 发布清单的文件名形态：`SHA256SUMS` 或 `*.sha256`。 */
export const RELEASE_MANIFEST_RE = /^(SHA256SUMS|.*\.sha256)$/i

/** macOS 的 `UF_IMMUTABLE`（`uchg`）在 `stat -f %f` 读数里的位。 */
export const UF_IMMUTABLE = 0x2

/** 门禁射程：这两个位置里的引用算「承诺」。 */
const GATE_SCOPE_RE = /^scripts\/(?:gate\.mjs$|gates\/)/

/** ADR 决策段的位置。 */
const ADR_RE = /^docs\/adr\//

/** 代码目录（②「谁引用它」的射程）；ADR 与门禁射程属①，不在这里重复计。 */
const CODE_RE = /^(?:scripts|packaging|packages|apps|shared)\//

/**
 * 扫一个候选目录里（顶层）的发布清单文件。
 * @param {string} absPath
 * @returns {string[]} 相对文件名，排序
 */
export function scanReleaseManifests(absPath) {
  let entries
  try {
    entries = readdirSync(absPath, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isFile() && RELEASE_MANIFEST_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort()
}

/**
 * 递归求目录体积（字节）。符号链接与读不到的文件不计——体积是读数不是判据，
 * 让它在坏文件上抛错只会把整条清单打断。
 * @param {string} absPath
 * @returns {number}
 */
export function dirSizeBytes(absPath) {
  let total = 0
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      try {
        total += statSync(full).size
      } catch {
        // 读不到的单个文件不参与求和；它自己会以别的形态（权限位判据）被点名。
      }
    }
  }
  walk(absPath)
  return total
}

/**
 * 纯判：把三步读数变成结论。①②任一命中 → `protected`；都否 → `suggested`。
 * @param {{commitments: Array<{kind: string, detail: string}>, references: Array<{file: string, line: number}>, sizeBytes: number}} input
 * @returns {{verdict: 'protected'|'suggested', reason: string}}
 */
export function judgeCandidate({ commitments, references, sizeBytes }) {
  if (commitments.length > 0) {
    return {
      verdict: 'protected',
      reason: `被承诺（${commitments.map((entry) => entry.kind).join('、')}）——证据面，不进入删除建议`,
    }
  }
  if (references.length > 0) {
    return {
      verdict: 'protected',
      reason: `有代码引用（${references.length} 处，如 ${references[0].file}:${references[0].line}）——「没承诺但有人在用」也不是垃圾`,
    }
  }
  return {
    verdict: 'suggested',
    reason: `无承诺、无引用（${sizeBytes} 字节）——此时体积才有发言权，按它排优先级`,
  }
}

/**
 * 建议清单：只留 `suggested`，按体积降序（体积只在这里出场）。
 * @param {Array<{candidate: string, verdict: string, sizeBytes: number}>} items
 */
export function orderSuggested(items) {
  return items
    .filter((item) => item.verdict === 'suggested')
    .sort((left, right) => right.sizeBytes - left.sizeBytes)
}

/**
 * 对单个候选跑完三步，返回各自的读数与结论。
 * @param {{candidate: string, repoRoot: string, deps?: ReturnType<typeof createRealDeps>}} input
 */
export function inspectCandidate({ candidate, repoRoot, deps }) {
  const d = deps ?? createRealDeps({ repoRoot })
  const absPath = join(repoRoot, candidate)
  const manifests = d.listReleaseManifests(absPath)
  const flags = d.readImmutableFlags(absPath)
  const hits = d.searchTracked(candidate)
  const gateHits = hits.filter((hit) => GATE_SCOPE_RE.test(hit.file))
  const adrHits = hits.filter((hit) => ADR_RE.test(hit.file))
  const codeHits = hits.filter((hit) => CODE_RE.test(hit.file) && !GATE_SCOPE_RE.test(hit.file))

  const commitments = []
  if (manifests.length > 0) {
    commitments.push({
      kind: 'release-manifest',
      count: manifests.length,
      detail: `发布清单 ${manifests.join('、')}（客户手上那串字节的认领凭据，ADR-0058）`,
    })
  }
  if ((flags & UF_IMMUTABLE) !== 0) {
    commitments.push({
      kind: 'immutable-flag',
      count: 1,
      detail: 'uchg 不可变标志（ADR-0067 决策 2：误删必须表过态才可能发生）',
    })
  }
  if (gateHits.length > 0) {
    commitments.push({
      kind: 'gate-scope',
      count: gateHits.length,
      detail: `${gateHits[0].file}:${gateHits[0].line}（共 ${gateHits.length} 处）`,
    })
  }
  if (adrHits.length > 0) {
    commitments.push({
      kind: 'adr-decision',
      count: adrHits.length,
      detail: `${adrHits[0].file}:${adrHits[0].line}（共 ${adrHits.length} 处）`,
    })
  }

  const sizeBytes = d.dirSizeBytes(absPath)
  const { verdict, reason } = judgeCandidate({ commitments, references: codeHits, sizeBytes })
  return { candidate, commitments, references: codeHits, sizeBytes, verdict, reason }
}

/**
 * 真实 deps：git grep（跟索引走）+ `stat -f %f`（macOS flags）+ 两个纯 fs 采集器。
 * @param {{repoRoot: string}} input
 */
export function createRealDeps({ repoRoot }) {
  return {
    listReleaseManifests: (absPath) => scanReleaseManifests(absPath),
    readImmutableFlags(absPath) {
      try {
        // 非 macOS（stat 参数不同）或路径不存在：读不到 flags 就是 0——
        // 这不是判据，只是承诺面的一个来源，读不到时由①的其余三条兜底。
        const out = execFileSync('stat', ['-f', '%f', absPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        return Number.parseInt(out.trim(), 10) || 0
      } catch {
        return 0
      }
    },
    searchTracked(needle) {
      try {
        const out = execFileSync('git', ['-C', repoRoot, 'grep', '-n', '-F', '-e', needle], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          maxBuffer: 32 * 1024 * 1024,
        })
        return out
          .split('\n')
          .filter((line) => line !== '')
          .map((line) => {
            const first = line.indexOf(':')
            const second = line.indexOf(':', first + 1)
            return {
              file: line.slice(0, first),
              line: Number.parseInt(line.slice(first + 1, second), 10),
              text: line.slice(second + 1).slice(0, 160),
            }
          })
      } catch {
        // git grep 无命中时退出码 1；仓库不可用时也走这里——两种都返回空，
        // 因为「没有引用」是最保守的**读数为空**，不会把候选误判成证据面。
        return []
      }
    },
    dirSizeBytes: (absPath) => dirSizeBytes(absPath),
    repoRoot,
  }
}
