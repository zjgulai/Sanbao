/**
 * 门禁 `release-published` 的**射程与差集判据**（ADR-0076）。
 *
 * 纯函数：输入是名字列表，不是网络或磁盘状态，所以可以被反向自测（含恒真桩突变）。
 *
 * ── 为什么需要这一层 ────────────────────────────────────────────────────────
 *
 * 2026-09-13 收尾时对账发现，发布链**前四环全齐、第五环从来没有过**：
 *
 *   产物（packaging/release/ + 仓库外归档 + uchg）  → 齐（ADR-0057 / ADR-0067）
 *   入库清单（release/<版本>.sha256，进 git）        → 齐（ADR-0058）
 *   tag（v<版本>）                                   → 齐
 *   代码（origin + codeup）                          → 齐
 *   **分发面（GitHub Releases）**                    → **缺**
 *
 * 实测读数：`gh release list` 最新是 v2.0.0，而仓库根 `README.md` 正告诉客户「从 Releases 下载」
 * ——客户按文档操作拿到的是一份早三个版本的包。这条缺口**没有任何一环会发现**：清单机制只保证
 * 「字节能找回」，tag 只保证「这串字节对应哪份源码」，两者都不会问「有没有把它送到客户拿得到的地方」。
 *
 * ── 射程：两个家都在 git 里的交集 ───────────────────────────────────────────
 *
 * 一个版本进入本项射程，当且仅当它**既有入库清单、又有 tag**。取交集是刻意的：
 *
 *   · 只有清单、没有 tag（如 v2.3.2：切出后发现载荷授权说法是错的，通过判据之前就被取代）
 *     → 按 ADR-0058「没有 tag 就不是发布版」自动出局，**不需要再维护一张「已评审不发」的表**
 *     （那会是一份会腐烂的清单，且是同一事实的第二个家，ADR-0009）。
 *   · 只有 tag、没有清单（如 v2.0.1：早于清单机制）→ 出局，且不构成永久红。
 *     若射程取「所有 v* tag」，v0.1.0 这类早期实验会永远判红——与 ADR-0075 修掉的
 *     `patch-anchors` 永久红同形（判据单调增长 × 历史堆积）。
 *
 * ── 与 ADR-0075 同一条口径 ──────────────────────────────────────────────────
 *
 * 射程为空 → `vacuous`，调用方必须报**跳过**而不是通过；`gh` 读不到时的处置同理
 * （那不是「都发了」，而是「本项没量到任何东西」）。
 *
 * @typedef {object} PublishScope
 * @property {string[]} inScope           要核对的版本号（有清单且有 tag，升序）
 * @property {string[]} missing           在射程内、但分发面上没有对应 Release 的版本
 * @property {string[]} drafts            在射程内、Release 存在但仍是 draft（对客户不存在）的版本
 * @property {string[]} untaggedManifests 有清单但无 tag——**不是发布版**，只进读数不进违规
 * @property {boolean}  vacuous           射程为空：本项**没量任何东西**
 * @property {string}   note              读数：量了谁、谁被排除、为什么
 */

/**
 * 选出本项要核对的版本，并算出与 GitHub Releases 的差集。
 *
 * @param {object} input
 * @param {string[]} [input.manifestVersions] `release/*.sha256` 的版本号（不含 `v` 前缀）
 * @param {string[]} [input.taggedVersions]   已打 tag 的版本号（不含 `v` 前缀）；读不到 tag 时传空数组
 * @param {{tag?: string, isDraft?: boolean}[]} [input.releases] `gh release list` 的读数
 * @returns {PublishScope}
 */
export function selectPublishTargets({ manifestVersions = [], taggedVersions = [], releases = [] } = {}) {
  const tagged = new Set(taggedVersions)
  const manifests = [...new Set(manifestVersions)].sort()

  /** @type {Map<string, boolean>} 版本号 → 是否 draft */
  const published = new Map()
  for (const release of releases) {
    const version = String(release?.tag ?? '').replace(/^v/, '')
    if (!version) continue
    // 同一 tag 出现多次时，只要有一次是正式发布就算已发布（draft 与正式不会并存，
    // 但真并存时选「已发布」——本项默认错误方向选「少报违规」，避免噪声把门禁关掉）。
    const isDraft = Boolean(release?.isDraft)
    published.set(version, published.has(version) ? published.get(version) && isDraft : isDraft)
  }

  const inScope = manifests.filter((version) => tagged.has(version))
  const untaggedManifests = manifests.filter((version) => !tagged.has(version))
  const missing = inScope.filter((version) => !published.has(version))
  const drafts = inScope.filter((version) => published.get(version) === true)
  const vacuous = inScope.length === 0

  const note = [
    inScope.length > 0
      ? `核对发布面 ${inScope.length} 个版本：${inScope.join(' ')}`
      : '无可核对对象（没有任何版本同时具备入库清单与 tag）',
    untaggedManifests.length > 0
      ? `有清单但无 tag，按 ADR-0058 不算发布版、不参与：${untaggedManifests.join(' ')}`
      : '',
  ]
    .filter(Boolean)
    .join('；')

  return { inScope, missing, drafts, untaggedManifests, vacuous, note }
}
