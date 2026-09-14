/**
 * 门禁 `changelog-release-sections` 的判据：**已发布版本必须在 CHANGELOG 里有自己的段**
 * （P-08：用纪律守只有机制能守住的东西）。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 *
 * 2026-09-14 修另一处缺陷时顺手对账，发现**两份 changelog 都停在 `[Unreleased]`**：
 * 仓库根 `CHANGELOG.md` 的最新段还叫「Unreleased - 2026-09-13」，而那段描述的正是**已经随
 * 2.3.3 出货**的工作；`packaging/CHANGELOG.md` 更直接——三段并列都顶着 `[Unreleased]`。
 * **2.3.3 与 2.4.0 两个已发布版本在 CHANGELOG 里没有版本段**。
 *
 * 这条缺口谁都不报：SOP 里 grep 不到 CHANGELOG（发布流程没有这一步），没有任何门禁读它，
 * 而 `release-published` 只问「客户能不能下载到」，不问「文档里有没有它」。于是「发了版就把
 * Unreleased 改成版本号」这件事**只靠人记得**——正是 P-08 的形状：凡是只有纪律守着的动作，
 * 迟早会在某一次赶时间的发布里被跳过，而且跳过之后**没有任何读数会变**。
 *
 * ── 射程：与 `release-published` 同一把尺 ──────────────────────────────────
 *
 * 一个版本进入射程，当且仅当它**既有入库清单（`release/<版本>.sha256`）、又有 tag**。
 * 这里刻意**复用** `selectPublishTargets` 而不是另写一份：射程若有第二个家，改一处漏一处
 * 就是 P-07 本身（被判据自己记着的那条故障）。
 *
 * ── 本项**不**管什么（诚实划界，免得被当成全覆盖） ───────────────────────────
 *
 * 1. **不判内容质量**：段里写了什么、写得对不对，静态文本判不出。
 * 2. `packaging/CHANGELOG.md` **只查「Unreleased 至多一个」**，不要求每个发布版都有段——
 *    它是流水线细节的账，某一版打包面没变化时**合法地**没有段（2.3.0 / 2.3.1 正是如此）。
 *    对它也要求逐版成段会造出一条噪声规则，而噪声规则的结局是被关掉（P-02 的死法）。
 * 3. **不判 `[Unreleased]` 里写的东西是否已经出货**——那需要语义理解。
 *
 * @module
 */

/** 必须逐版成段的账：客户在仓库里读「这版改了什么」的家。 */
export const ROOT_CHANGELOG_REL_PATH = 'CHANGELOG.md'

/** 流水线细节的账：只查「Unreleased 至多一个」这一条结构规则。 */
export const PACKAGING_CHANGELOG_REL_PATH = 'packaging/CHANGELOG.md'

/**
 * 二级标题里的方括号标签：`## [2.4.0] - 2026-09-14（…）` / `## [Unreleased] - …`。
 * 只认行首的二级标题——正文里引用「2.4.0」不算成段（这条正是本判据最容易退化的地方：
 * 用 `includes(version)` 实现会放过它，见反向自测里的对应用例）。
 */
const H2_LABEL_RE = /^##[ \t]+\[([^\]]+)\]/gm

/**
 * 归一化：去掉首尾空白与 `v` 前缀。
 * 归一化是必须的——`git tag` 给的是 `v2.4.0`，清单文件名给的是 `2.4.0`，
 * 两边格式不同，只 strip 一处就会出现「一条永远为真的假红」。
 * @param {unknown} value
 * @returns {string}
 */
function normalizeLabel(value) {
  return String(value ?? '')
    .trim()
    .replace(/^v/, '')
}

/**
 * 版本序：按数字段比较，`2.10.0` 排在 `2.9.0` 之后（默认字典序会排反）。
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function byVersion(a, b) {
  return a.localeCompare(b, 'en', { numeric: true })
}

/**
 * 校验各 changelog 是否给每个已发布版本留了段。
 *
 * 纯函数：输入是文本与版本号列表，不读磁盘、不跑 git，因此可以被反向自测
 * （含「判据退化成恒真桩」的突变用例）。
 *
 * @param {object} input
 * @param {string[]} [input.publishedVersions] 射程内的版本号（不带 `v` 前缀）
 * @param {{path: string, text: string, requireVersionSections?: boolean}[]} [input.documents]
 *   要校验的文档；`text` 读不到时传空串（**判红**，不静默跳过——changelog 被删空不该是绿的）
 * @returns {{passed: boolean, violations: string[], note: string, vacuous: boolean}}
 *   `vacuous` 为真表示射程为空：调用方必须报**跳过**而不是通过（ADR-0075 / P-02）
 */
export function checkChangelogSections({ publishedVersions = [], documents = [] } = {}) {
  const violations = []
  const versions = [...new Set(publishedVersions.map(normalizeLabel).filter(Boolean))].sort(byVersion)

  for (const document of documents) {
    const path = document?.path ?? '(未命名文档)'
    const text = String(document?.text ?? '')

    // 读不到正文 = 红，不是跳过：删空这份账是最省事的「通过」方式，而它正是本条要防的。
    if (text.trim() === '') {
      violations.push(`${path}: 读不到正文——这份账被删空或移走了（空账不得判绿）`)
      continue
    }

    const labels = [...text.matchAll(H2_LABEL_RE)].map((match) => normalizeLabel(match[1]))
    const headings = new Set(labels)

    // 结构规则（两份账都适用）：`## [Unreleased]` 至多一个。
    // 多个并列的 Unreleased 是「发了版却没把标题改成版本号」留下的痕迹——
    // 2026-09-14 修复前 packaging/CHANGELOG.md 正是三段并列。
    const unreleasedCount = labels.filter((label) => label.toLowerCase() === 'unreleased').length
    if (unreleasedCount > 1) {
      violations.push(
        `${path}: 有 ${unreleasedCount} 个 \`## [Unreleased]\` 段——同一份账里至多一个；`
          + '并列的多个 Unreleased 是「发过版但没把标题改成版本号」留下的痕迹，'
          + '每个已发布版本应该有它自己的一行 `## [<版本>]`',
      )
    }

    // 版本覆盖规则（只有根账要求）：每个已发布版本必须有它自己的段。
    if (document?.requireVersionSections === true) {
      const missing = versions.filter((version) => !headings.has(version))
      for (const version of missing) {
        violations.push(
          `${path}: 已发布版本 ${version} 没有 \`## [${version}]\` 段——`
            + '它有入库清单也有 tag，客户在仓库里却读不到「这版改了什么」',
        )
      }
    }
  }

  const covered = documents.filter((document) => document?.requireVersionSections === true).map((document) => document.path)
  const note =
    versions.length === 0
      ? '射程内没有任何版本'
      : `核对 ${versions.length} 个已发布版本的版本段（${versions.join(' ')}）；`
        + `要求逐版成段：${covered.join(' ') || '（无）'}`

  return { passed: violations.length === 0, violations, note, vacuous: versions.length === 0 }
}
