/**
 * 「交付卷形态」的文档判据：`docs/sop/dmg-release.md` × `packaging/INSTALL-GUIDE.md`。
 *
 * ## 为什么需要它
 *
 * 2026-09-13 复核 2.3.3 实物时发现：`docs/sop/dmg-release.md` §5.2 写的是
 *
 * > `# 应看到 DSH Desktop.app 与 Applications 快捷方式`
 *
 * 而 2.3.3 的交付卷里**既没有** `DSH Desktop.app`（只有 `DSH Desktop.app.tar.gz`），
 * **也没有** `Applications` 快捷方式——2.3.3 的交付形态是**离线安装器载荷**：
 * 卷根是 `install.sh` + `LUTE Setup.app` + 四个 tarball + `tools/` + 清单文件。
 * 照着 SOP 复核的人会得出「DMG 做错了」的结论，而实物是对的。
 *
 * 根因不是「写错了一句话」，而是**形态是产物的属性，却被当成文档的属性来维护**：
 * 那句话是**上一版形态**的快照，产物形态换了它不会自己报错；所有门禁都绿，因为
 * 没有任何判据把「文档断言的清单」与「产物真实的清单」比过一次。
 * 同一版里 `packaging/INSTALL-GUIDE.md` §2 的入口表是**对的**——于是一条事实有了两个家，
 * 改一个漏一个（P-07）；而漏掉的那个正好是复核者会读的那个（P-01）。
 *
 * ## 判据分两半，射程不同（诚实写清楚，免得被当成全覆盖）
 *
 * **静态半（永远可判，不依赖任何产物在场）**：
 * - `R1 单一家`：SOP 必须把「卷里有什么」这件事指向 `packaging/INSTALL-GUIDE.md`，
 *   而不是就地复述一份清单。复述出来的那份迟早会旧。
 * - `R2 形态断言`：SOP 不得断言**拖拽式交付形态**（卷根有 `.app`、有 `Applications`
 *   快捷方式、「把 app 拖到 /Applications」）。这一条是**廉价但精确**的——它拦的是一种
 *   **已经发生过**的写法，不是全称保证；全称保证由动态半在产物在场时给出。
 *   **判定前先剥掉直角引号 `「…」` 里的内容**：本仓库的书写约定是直角引号表示**引用**，
 *   而 ADR-0077 的修复方案**要求** §5.1/§5.2/§5.4 就地保留「原来写的是什么、为什么会错」，
 *   那句原文必然命中黑名单。不剥，本项就会把**它自己要求的修复**判成缺陷——2026-09-13
 *   实测正是如此：SOP 已改成「**不要**试图把某个 `.app` 拖进 `/Applications`」，
 *   同一段里引用旧措辞做说明，本项持续判红（判据与它守的修复自相矛盾）。
 *   **残留缺口**：写在 `「」` 里的**活断言**会被漏掉。这一条不假装守得住——
 *   它把「引用」与「断言」分开，代价是「把断言伪装成引用」需要人来撒谎，
 *   而不是像原来那样由**正确的写法**触发。
 *
 * **动态半（需要产物在场，否则整项报 `skip`——不是 `ok`）**：
 * - `R3 未登记条目`：卷上每个顶层条目都必须在入口表里出现（用户不该看到表里没有的文件）。
 * - `R4 幽灵条目`：入口表里每个条目都必须真实存在于卷上（表里写了、实物没有 = 骗人）。
 * - `R5 入口可点`：入口表里标为「✅ 可点」的每一行必须真实存在——一行都不在时，
 *   用户拿到的是一个**打不开的安装包**，而手册还在教他双击。
 * - `R6 正文链接可达`：手册**正文里**指向随包文件的相对链接，必须在卷上真的存在。
 *   R3/R4 只量第 2 节那张**表**，正文里的链接此前没人守——2026-09-14 实测：手册开头写着
 *   「一页速查见 [安装卡](INSTALL-CARD.md)」，而 `INSTALL-CARD.md` **自 2.2.0 起从未进过
 *   任何一版载荷**（六版全无），v2.x 的 Release 也没附它。客户在卷上点那个链接是死路，
 *   而所有门禁都绿：链接在**仓库里**是可达的（两个文件都在 `packaging/`），
 *   只有把它当成**卷内**的相对路径量才会红。**残留缺口（不假装守住）**：嵌套路径
 *   （如 `tools/x.sh`）要求调用方给出递归文件清单；只给顶层条目时本项把它计入「未核」，
 *   不以「顶层目录存在」冒充可达。
 *
 * 射程为空（既没挂载交付卷、也没有未打 tag 的 payload）时返回 `skipped: true`：
 * 「没量到任何东西」与「量了都合格」必须分开报（ADR-0075 / P-02）。
 * **射程由 `selectLayoutTargets` 从 git 里的 tag 推导**，不由磁盘上碰巧存在什么决定——
 * 已打 tag 的版本的形态由产物自己冻结（ADR-0067），拿今天的入口表去量它必是永久红（P-11）。
 *
 * ## 本项**不**覆盖什么（诚实写清楚，免得被当成全覆盖）
 *
 * 本次同源缺陷里还有**第三处**：§5.1 曾把签名复核的路径写成
 * `packaging/release/$VERSION/DSH Desktop.app`——那个目录下只有 DMG 与三件清单，
 * **没有解开的 app**，那条命令当场失败。这一类「SOP 里写着一个不存在的路径」，
 * 本项**判不出**：`$VERSION` 展开成哪一版取决于人，而 `packaging/release/.staging.XXXXXX`
 * 这类**故意**不存在的路径会让一条通用路径判据满是误报——会误报的校验很快会被关掉（P-02）。
 * 第三处由人工修正（见 `docs/sop/dmg-release.md` §5.1 的原址说明），不假装它被拦住了。
 *
 * 纯函数：所有输入由调用方读取后传入，便于用固定文本做正反例与恒真桩突变自测。
 *
 * @module
 */

/** SOP 的仓库根相对路径（被校验的文档）。 */
export const SOP_REL_PATH = 'docs/sop/dmg-release.md'

/** 交付卷形态的**唯一事实之家**：安装手册第 2 节的入口表。 */
export const GUIDE_REL_PATH = 'packaging/INSTALL-GUIDE.md'

/** 安装手册里入口表所在的章节标题（`## 2. …`）。 */
const GUIDE_SECTION_RE = /^## 2\.[^\n]*$/m

/**
 * SOP 里禁止出现的**拖拽式交付形态**断言。
 *
 * 每一条都写清楚它为什么会在这里，以及为什么不会误报——把上一个版本的形态
 * 钉成一张黑名单是坏做法（P-11：拿今天的尺子量历史产物），这里钉的不是「上一版的形态」，
 * 而是「**卷根有一个可直接拖走的 .app**」这一种已经被取代的**交付方式**本身：
 * `sign-and-dmg.sh` 对 payload 断言 `[ -f "$PAYLOAD/install.sh" ]`，
 * 所以「卷里有 install.sh」与「卷根有可拖拽的 app」在本仓库里互斥。
 */
const DRAG_FORM_PATTERNS = [
  {
    re: /Applications\s*快捷方式/,
    why: '交付形态是离线安装器载荷，卷上没有任何 Applications 快捷方式——这是上一版可拖拽安装盘的形态',
  },
  {
    re: /拖到\s*`?\/Applications/,
    why: '交付形态是离线安装器载荷，没有可拖拽的 app；安装入口是 LUTE Setup.app 或 install.sh',
  },
  {
    re: /应看到\s*`?\*{0,2}DSH Desktop\.app/,
    why: '卷根是 DSH Desktop.app.tar.gz（压缩载荷），不是解开的 DSH Desktop.app',
  },
]

/** 直角引号（本仓库的**引用**书写约定）包裹的片段。 */
const QUOTED_SPAN_RE = /「[^「」]*」/g

/**
 * 把 `「…」` 引用的内容剥成占位符，只留下**文档自己的断言**。
 *
 * 为什么需要它：R2 的黑名单里那三句，正是 ADR-0077 要求**原址保留**的旧措辞。
 * 一个分不清「引用」与「断言」的判据会把正确的修复判红，而**会误报的校验很快会被关掉**
 * （P-02）——那时这条判据就真的没了。剥引用是让判据只对它该管的东西说话。
 *
 * 不使用 `text.replace` 的就地副作用；返回新串，调用方显式持有两个版本。
 *
 * @param {string} text
 * @returns {string} 引用片段被替换为 `「…」` 的副本
 */
export function stripQuotedSpans(text) {
  return text.replace(QUOTED_SPAN_RE, '「…」')
}

/** 顶层条目里天然存在、不必登记进入口表的东西（Finder/文件系统留下的噪声）。 */
const LISTING_NOISE = new Set(['.DS_Store', '.background', '.VolumeIcon.icns', '.fseventsd', '.Trashes'])

/**
 * 选出本次要量的产物，并说清谁退出了、为什么。
 *
 * **射程必须跟着 git 走，不跟着磁盘走**（P-11 / ADR-0075）。已打 tag 的版本，其交付形态由
 * 产物本身冻结（ADR-0067：已发布产物不可删除、不可修改），不该用**今天的**入口表去量它——
 * 下一版往载荷里加一个文件、手册随之更新，所有还挂载着的旧卷就会**永久**判红，
 * 而这条红与「手册和当前载荷对不上」在输出上不可区分，清理挂载于是成了让它变绿的唯一手段。
 *
 * 默认错误方向选**多量**：读不到 tag（浅克隆 / git 不可用）时全部纳入；卷名解析不出
 * 版本号时也纳入——放行是这条判据最贵的失效方向。
 *
 * @param {{
 *   volumes?: Array<{label: string, version: string|undefined}>,
 *   payloadVersions?: string[],
 *   taggedVersions?: string[],
 * }} input 本机扫到的挂载卷、staging payload 版本与 git 里的 tag
 * @returns {{scanVolumes: Array, scanPayloads: string[], retired: string[], vacuous: boolean, note: string}}
 */
export function selectLayoutTargets({ volumes = [], payloadVersions = [], taggedVersions = [] }) {
  const tagged = new Set(taggedVersions)
  const isRetired = (version) => typeof version === 'string' && tagged.has(version)

  const scanVolumes = volumes.filter((volume) => !isRetired(volume.version))
  const scanPayloads = payloadVersions.filter((version) => !isRetired(version))
  const retiredVersions = [
    ...new Set([
      ...volumes.map((volume) => volume.version).filter(isRetired),
      ...payloadVersions.filter(isRetired),
    ]),
  ].sort()

  const vacuous = scanVolumes.length === 0 && scanPayloads.length === 0
  const parts = []
  if (scanVolumes.length > 0) parts.push(`挂载卷 ${scanVolumes.map((v) => v.label).join(' ')}`)
  if (scanPayloads.length > 0) parts.push(`待发布 payload ${scanPayloads.join(' ')}`)
  const scanned = parts.length > 0 ? `扫描 ${parts.join('；')}` : '扫描面为空'
  const note =
    retiredVersions.length > 0
      ? `${scanned}；已发布（有 tag，由 ADR-0067 归档负责）不参与：${retiredVersions.join(' ')}`
      : scanned

  return { scanVolumes, scanPayloads, retired: retiredVersions, vacuous, note }
}

/**
 * 把 Markdown 表格的首个单元格拆成若干条目名。
 *
 * 入口表里有一行是「一行列多个名字」的形态（`INSTALL-GUIDE.md / README.md / VERSION / …`），
 * 所以按**两侧带空格的斜杠**切分；`tools/` 这种目录名尾斜杠只有一侧，不会被切开。
 * @param {string} cell 首单元格原文
 * @returns {string[]} 归一化后的条目名（已去反引号、粗体标记与尾斜杠）
 */
function splitGuideCell(cell) {
  return cell
    .replace(/\*\*/g, '')
    .split(/\s+\/\s+/)
    .map((part) => part.replace(/`/g, '').trim())
    .map((part) => part.replace(/\/$/, '').trim())
    .filter(Boolean)
}

/**
 * 从安装手册正文里解析指向**随包文件**的相对链接（R6 的输入）。
 *
 * 跳过三类：外链（含协议，如 `https://…`）、纯锚点（`#9-对照表`）、绝对路径（`/…`）
 * ——它们不由交付卷负责，对它们报错就是误报，而**会误报的校验很快会被关掉**（P-02）。
 *
 * `#锚点` 与 `?query` 会被剥掉：卷内是文件系统，锚点由 Markdown 阅读器处理。
 * @param {string} guideText 安装手册正文
 * @returns {Array<{raw: string, target: string}>} 原文与归一化后的卷内相对路径
 */
export function parseGuideLinks(guideText) {
  const links = []
  for (const match of guideText.matchAll(/\]\(([^)\s]+)\)/g)) {
    const raw = match[1]
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#') || raw.startsWith('/')) continue
    const target = raw.split('#')[0].split('?')[0]
    if (!target) continue
    links.push({ raw, target })
  }
  return links
}

/**
 * 从安装手册里解析「DMG 里哪个文件才是安装入口」那张表。
 * @param {string} guideText 安装手册正文
 * @returns {Array<{name: string, clickable: boolean}>} 表格登记的条目；表读不到时为空数组
 */
export function parseGuideEntries(guideText) {
  const sectionStart = GUIDE_SECTION_RE.exec(guideText)
  if (!sectionStart) return []
  const afterHead = guideText.slice(sectionStart.index + sectionStart[0].length)
  const nextHeading = /^## /m.exec(afterHead)
  const section = nextHeading ? afterHead.slice(0, nextHeading.index) : afterHead

  const entries = []
  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|')
    if (cells.length < 2) continue
    const names = splitGuideCell(cells[0])
    // 表头与分隔行：首格是「你看到的」/ 全是横线。
    if (names.length === 0 || /^-+$/.test(cells[0].trim()) || cells[0].includes('你看到的')) continue
    // 「可点入口」的标记在**用法列**（✅ vs ⛔ vs 👀），不另立一列——少一列就少一处要同步的家。
    const clickable = cells.slice(1).join('|').includes('✅')
    for (const name of names) entries.push({ name, clickable })
  }
  return entries
}

/**
 * 校验「交付卷形态」这条事实的文档面。
 *
 * @param {{
 *   sopText: string,
 *   guideText: string,
 *   artifacts?: Array<{label: string, entries: string[]}>,
 * }} input
 *   `sopText` / `guideText` 读不到时传空串（判红，不静默跳过）；
 *   `artifacts` 是本次量到的产物清单（挂载的交付卷 ∪ 未打 tag 的 staging payload），
 *   每一项形如 `{label: '/Volumes/DSH Desktop LUTE 2.3.3', entries: [...], files?: [...]}`；
 *   `entries` 是顶层条目（R3/R4/R5 量的是它——用户看到的就这一层），
 *   `files` 是可选的**递归**文件清单（R6 用来判嵌套链接；不给时嵌套链接计入「未核」）。
 * @returns {{passed: boolean, skipped?: boolean, violations: string[], note?: string}}
 */
export function checkDmgLayout({ sopText, guideText, artifacts = [] }) {
  if (sopText.trim() === '') {
    return {
      passed: false,
      violations: [`${SOP_REL_PATH}: 读不到 SOP 正文——交付形态这条事实的复核入口没了`],
    }
  }
  if (guideText.trim() === '') {
    return {
      passed: false,
      violations: [
        `${GUIDE_REL_PATH}: 读不到安装手册——交付卷形态就只剩 SOP 里那份会过期的复述了`
          + '（本项存在的理由就是这条：一份事实两个家，改一个漏一个，P-07）',
      ],
    }
  }

  const violations = []

  // ── R1 单一家：SOP 不得就地复述清单，必须指向安装手册 ────────────────────────
  if (!sopText.includes('INSTALL-GUIDE.md')) {
    violations.push(
      `${SOP_REL_PATH}: 没有指向 ${GUIDE_REL_PATH}——卷里有什么这件事必须只有一个家；`
        + '在 SOP 里另写一份清单，就是给同一条事实再造一个会过期的家（P-07）',
    )
  }

  // ── R2 形态断言：不得把卷描述成可拖拽的安装盘（本项要拦的那次回归的原文） ──────
  // 只在**文档自己的断言**上匹配：`「…」` 里的内容按仓库约定是**引用**，而 ADR-0077
  // 的修复方案要求原址保留旧措辞——不剥引用，本项会把自己要求的修复判成缺陷。
  const sopAssertions = stripQuotedSpans(sopText)
  for (const { re, why } of DRAG_FORM_PATTERNS) {
    const hit = re.exec(sopAssertions)
    if (hit) {
      violations.push(
        `${SOP_REL_PATH}: 断言了拖拽式交付形态（命中 ${JSON.stringify(hit[0])}）——${why}；`
          + `正确的入口表在 ${GUIDE_REL_PATH}`,
      )
    }
  }

  // ── 动态半：量产物 ──────────────────────────────────────────────────────────
  const inScope = artifacts.filter((artifact) => artifact.entries.length > 0)
  if (inScope.length === 0) {
    const note =
      '本机既没有挂载的交付卷，也没有未打 tag 的 payload——**未校验任何卷内清单**'
      + '（不是「卷与手册一致」）'
    // 静态半仍然有效：即便没有产物，R1/R2 也已经把「SOP 描述的是不是当前交付形态」量过了。
    return { passed: violations.length === 0, skipped: violations.length === 0, violations, note }
  }

  const guideEntries = parseGuideEntries(guideText)
  if (guideEntries.length === 0) {
    violations.push(
      `${GUIDE_REL_PATH}: 第 2 节的入口表解析不出任何条目——`
        + '表的形态变了而判据没跟着变，此时**不能**当作「没什么可比的」放行（P-02：空读数不是合格读数）',
    )
    return { passed: false, violations }
  }
  const guideNames = new Set(guideEntries.map((entry) => entry.name))
  // R6 的输入：手册正文里的相对链接。它是**文档**的属性，所以只解析一次；
  // 是否可达要逐份产物量（同一个手册要放进每一版的卷里）。
  const guideLinks = parseGuideLinks(guideText)
  let unmeasuredLinks = 0

  for (const { label, entries, files } of inScope) {
    const real = new Set(entries.filter((name) => !LISTING_NOISE.has(name)))

    // R3 未登记条目：用户会在卷里看到一个手册从未解释的文件
    for (const name of [...real].sort()) {
      if (!guideNames.has(name)) {
        violations.push(
          `${label}: 卷上有未登记条目 ${JSON.stringify(name)}——`
            + `${GUIDE_REL_PATH} 第 2 节的入口表没有它；用户会看到一个手册说不清是什么的文件`,
        )
      }
    }

    // R4 幽灵条目：表里写了、实物没有
    for (const name of [...guideNames].sort()) {
      if (!real.has(name)) {
        violations.push(
          `${label}: 入口表登记了 ${JSON.stringify(name)}，实物没有——`
            + '表里写着一个不存在的文件，读者会以为包做坏了（P-01）',
        )
      }
    }

    // R5 入口可点：一行都没有时，用户拿到的是打不开的安装包
    const clickable = guideEntries.filter((entry) => entry.clickable)
    if (clickable.length === 0) {
      violations.push(`${GUIDE_REL_PATH}: 入口表里一个「✅ 可点入口」都没标——安装手册失去了它存在的意义`)
    }
    for (const entry of clickable) {
      if (!real.has(entry.name)) {
        violations.push(`${label}: 标为「✅ 可点入口」的 ${JSON.stringify(entry.name)} 在卷上不存在`)
      }
    }

    // R6 正文链接可达：手册里指向随包文件的链接必须在**卷上**存在。
    // 这一条与 R3/R4 量的是同一个事实的两半：那张表对了，不等于正文里的话都落地了
    // （2026-09-14：表的每一行都在卷上，而正文里的 [安装卡](INSTALL-CARD.md) 是死路）。
    const knownFiles = new Set(files ?? entries)
    for (const link of guideLinks) {
      // 嵌套路径需要调用方的递归清单：只给顶层条目时如实计入「未核」，
      // 不用「顶层目录存在」冒充可达（那正是 P-02 的假绿形态）。
      if (files === undefined && link.target.includes('/')) {
        unmeasuredLinks += 1
        continue
      }
      if (!knownFiles.has(link.target)) {
        violations.push(
          `${label}: 手册正文链接的 ${JSON.stringify(link.target)} 在卷上不存在——`
            + '客户点开是死路；链接在仓库里可达不等于随包可达（P-10：守卫看不见打包后的载荷）',
        )
      }
    }
  }

  const linkNote =
    guideLinks.length === 0
      ? '手册正文里没有任何指向随包文件的相对链接（本项这一半**没量到东西**）'
      : `手册正文链接 ${guideLinks.length} 条，核了 ${guideLinks.length - unmeasuredLinks} 条`
        + (unmeasuredLinks > 0 ? `（${unmeasuredLinks} 条因未给递归文件清单而未核）` : '')

  return {
    passed: violations.length === 0,
    violations,
    note: `已比对 ${inScope.length} 份卷内清单（${inScope.map((a) => a.label).join('；')}）；${linkNote}`,
  }
}
