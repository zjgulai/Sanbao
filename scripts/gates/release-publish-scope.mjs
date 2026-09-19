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
 * ── 第二条判据：Latest 徽标落在哪（2026-09-20 补）─────────────────────────────
 *
 * `gh release create` 不写 `--latest=false` 时，GitHub 会把**按创建时间最新**的那条标成
 * Latest——补发历史版本时（本仓 2026-09-19 换远端后就补发过一批）新创建的旧版本会被顶上去，
 * 于是客户点进 Releases 默认看到的是一份旧包。上面那三条差集判据全都看不见它：
 * 那个版本确实发了、不在 draft 里、也在射程内。**它不是「缺」，是「指错了」。**
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

/** `x.y.z` 逐段比大小；非数字段按 0 处理（本仓版本号全是三段数字，不引 semver 依赖）。 */
function compareVersions(a, b) {
  const parse = (value) => String(value).replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const [left, right] = [parse(a), parse(b)]
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Latest 徽标必须落在**最新已发布版本**上（不是任意一版，也不是缺了就算）。
 *
 * 违反形态有三：徽标指向旧版（补发历史版本时漏 `--latest=false`）、一个都没标
 * （Releases 页没有默认指向）、多于一条被标（GitHub 只应有一个）。
 * draft 不参与——它对客户不存在，即便被标了 Latest 也不作数。
 *
 * @param {object} input
 * @param {{tag?: string, isDraft?: boolean, isLatest?: boolean}[]} [input.releases] `gh release list` 的读数
 * @returns {string[]} 违规描述；无违规时空数组
 */
export function judgeLatestPointer({ releases = [] } = {}) {
  const published = releases
    .map((release) => ({
      version: String(release?.tag ?? '').replace(/^v/, ''),
      isDraft: Boolean(release?.isDraft),
      isLatest: Boolean(release?.isLatest),
    }))
    .filter((release) => release.version !== '' && !release.isDraft)
  if (published.length === 0) return []

  const newest = published.reduce((best, release) => (compareVersions(release.version, best) > 0 ? release.version : best), published[0].version)
  const flagged = published.filter((release) => release.isLatest).map((release) => release.version)

  if (flagged.length === 0) {
    return [`没有任何 Release 被标为 Latest——Releases 页没有默认指向（最高已发布版本 v${newest} 应持有它）`]
  }
  if (flagged.length > 1) {
    return [`有 ${flagged.length} 条 Release 同时被标为 Latest（${flagged.map((v) => `v${v}`).join(' ')}）——GitHub 只应有一条`]
  }
  if (flagged[0] !== newest) {
    return [
      `Latest 徽标指向 v${flagged[0]}，而最新已发布版本是 v${newest}——客户在 Releases 页默认看到的是一份旧包`
      + `（补发历史版本时漏了 --latest=false 就会这样）`,
    ]
  }
  return []
}
