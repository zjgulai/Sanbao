/**
 * 门禁 `plugin-ui-anchor-drift` 的判据：**插件对官方类名的依赖，必须在出货产物里解析得出**。
 *
 * ── 为什么需要这一层 ────────────────────────────────────────────────────────
 *
 * profile 侧的插件（`dsh-root-brand` 这类）要改写官方 UI，而官方**没有**给这些位置公开席位，
 * 所以只能按「官方自己注入的样式标签里的类名」做运行时定位。这套定位天生依赖上游的三件事：
 * 模块文件名、局部名、类名可解析。三件事任一变化，插件的规则就**静默失效**——
 * 而失效的表现是「官方那句标题又出现了」，不是崩溃。
 *
 * 2026-09-17 实测：基座 2.0.10 把 hero 的独立文本元素去掉了（局部名 `headlineText` 消失，
 * 标题变成 `titleGroup` 里一个无类名的 span），插件的隐藏规则因此根本没生成；
 * 装机里的插件产物本身没坏、Console 里也一直在 warn（`degraded:heroHeadlineText,statsLineRoot`），
 * **但没有任何判据会因此变红**——打包层的品牌重放有 `verify-patches` 逐锚核对，
 * 运行时插件层则一条核对都没有。
 *
 * ── 判据与射程 ──────────────────────────────────────────────────────────────
 *
 * 量的是「**声明**（`ui-anchors.json`，插件代码与门禁共用的唯一家）× **产物**（装机 app 与
 * 未打 tag 的 staging 树）」。射程选择复用 `patch-anchor-scope.mjs`（同一份「射程跟着 git 走」
 * 的决定，不另写一遍）。
 *
 * ── 这一层为什么不调用插件自己的解析器 ──────────────────────────────────────
 *
 * 「读得出类名」这件事必须由**独立实现**来判：拿被测代码去验被测代码，
 * 它算错的时候两边一起错，读数恒绿（本仓库已登记的形态：自证式断言）。
 * 所以这里按同一套 CSS-module 规则另写一遍，真值取自**产物字节**而不是任何常量。
 *
 * @typedef {object} DeclaredAnchor
 * @property {string} id        插件内部语义键（与 `LiveAnchors` 的键同名）
 * @property {string} moduleId  官方模块 id，形如 `<包路径>/<模块>.module.css`
 * @property {string} localName CSS-module 的局部名（不含哈希前缀）
 * @property {string} purpose   这个依赖用来干什么（可选，供读的人判断该不该留）
 * @property {string} origin    声明来自哪份清单（报错时要指得出家）
 */

/** 官方产物把模块 CSS 内联成 `const css$N = "…";`，紧跟其后才是使用它的模块代码。 */
const CSS_CONST = /const css\$[0-9]+ = ("(?:[^"\\]|\\.)*");/g

/** 声明清单的文件名（插件包根）。约定而非登记：任何包都可以有，没有就不进射程。 */
export const ANCHOR_MANIFEST_FILENAME = 'ui-anchors.json'

/** 正则里要转义的字符（局部名本就是 CSS 标识符，转义只是不让判据自己有洞）。 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 从官方产物源码里取出某个模块的 CSS 文本。
 *
 * 定位锚是模块 id 字面量本身（`"@deepseek-ai/dsh-client-ui-conversation/HeroShell.module.css"`）：
 * 这是**包路径级**的结构锚，官方自己用它去重注入的样式标签，比类名哈希稳定得多。
 * 取它**之前最近的一条** `const css$N = …` 就是该模块的样式文本。
 *
 * 找不到模块 id、或找不到它前面的 CSS 常量，都返回 `null`——调用方按**判红**处理，
 * 不按「没有这个锚」处理（`null` 与「解析出 0 个候选」是两件事，见 judgeDeclaredAnchors）。
 *
 * @param {string} source
 * @param {string} moduleId
 * @returns {string | null}
 */
export function extractModuleCss(source, moduleId) {
  const anchor = source.indexOf(JSON.stringify(moduleId))
  if (anchor < 0) return null
  let last = null
  for (const match of source.slice(0, anchor).matchAll(CSS_CONST)) last = match
  if (last === null || last[1] === undefined) return null
  try {
    const css = JSON.parse(last[1])
    return typeof css === 'string' ? css : null
  } catch {
    // 转义坏了：当作读不出，而不是当作「CSS 里没有这个类」。
    return null
  }
}

/**
 * 判据认识的类名前缀字符集。
 *
 * **故意与插件运行时同一套规则**（`live-selectors.ts`）：判据若比插件更宽，就会出现
 * 「判据绿、插件找不到」的假绿——那比判红危险得多。
 */
const PREFIX_CHARS = '[A-Za-z0-9_]+'

/**
 * 诊断用的**更宽**前缀（含连字符与点）。只用来解释失败，不参与判定。
 *
 * 为什么需要它：2026-09-18 实测归档的 2.0.4 产物里存在 `U-8p4G_root` 这类**含连字符**的前缀，
 * 而现行规则匹配不到。没有这条诊断，读数会把「前缀形态不认识」报成「上游没有这个局部名」，
 * 读的人会去改名重锚（改错方向）。
 */
const DIAGNOSTIC_PREFIX_CHARS = '[A-Za-z0-9_.-]+'

/**
 * 某个局部名在这份 CSS 里的候选类名。
 *
 * 与插件运行时同一套规则：`.<前缀>_<局部名>`，且局部名后不得紧跟标识符字符
 * （否则 `headline` 会误配到 `headlineText`）。候选数 0 与 >1 都判为不可用——
 * 上游同时存在两个前缀时，「猜一个」比报红危险得多。
 *
 * @param {string} css
 * @param {string} localName
 * @returns {string[]} 去重后的完整类名
 */
export function classNameCandidates(css, localName) {
  const pattern = new RegExp(`\\.(${PREFIX_CHARS})_${escapeRegExp(localName)}(?![A-Za-z0-9_-])`, 'g')
  return [...new Set([...css.matchAll(pattern)].map((match) => `${match[1]}_${localName}`))]
}

/**
 * 0 个候选时的**区分诊断**：是「上游改了名字」还是「前缀形态超出认识的字符集」。
 *
 * 两种原因的修法完全不同——前者改锚，后者要把**插件与判据的前缀规则一起**放宽。
 * 把它们压成同一句话，等于把定位工作丢给下一个读报错的人。
 *
 * @param {string} css
 * @param {string} localName
 * @param {string} moduleId
 * @returns {string}
 */
export function describeMiss(css, localName, moduleId) {
  const wider = new RegExp(`\\.(${DIAGNOSTIC_PREFIX_CHARS})_${escapeRegExp(localName)}(?![A-Za-z0-9_-])`, 'g')
  const seen = [...new Set([...css.matchAll(wider)].map((match) => match[1]))]
  if (seen.length > 0) {
    return `${moduleId} 里 ${localName} 存在，但前缀形态（${seen.join('、')}）超出判据与插件共同认识的字符集 ${PREFIX_CHARS}——先把**插件与判据的前缀规则一起**放宽，再收窄断言（只改判据会变成「判据绿而插件找不到」）`
  }
  return `${moduleId} 里没有 ${localName} 这个局部名（上游改了名字或搬走了这个元素）`
}

/**
 * 结构校验：清单是**声明**，不认识的形态一律判红。
 *
 * 「宽松解析」在这里是错的方向——把 `{ module: … }`（写错键名）读成「没有这个锚」，
 * 会让一份根本没被量到的声明看起来像通过。这与 `plugin-entry-contract` 的选择一致。
 *
 * @param {unknown} raw 已 JSON.parse 的内容
 * @param {string} origin 清单的仓库相对路径（报错指得出家）
 * @returns {{anchors: DeclaredAnchor[], errors: string[]}}
 */
export function parseAnchorManifest(raw, origin) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { anchors: [], errors: [`${origin}：清单根必须是对象`] }
  }
  const list = /** @type {{anchors?: unknown}} */ (raw).anchors
  if (!Array.isArray(list)) {
    return { anchors: [], errors: [`${origin}：anchors 必须是数组`] }
  }
  /** @type {DeclaredAnchor[]} */
  const anchors = []
  /** @type {string[]} */
  const errors = []
  /** @type {Set<string>} */
  const seen = new Set()
  list.forEach((entry, index) => {
    const where = `${origin}#/anchors/${index}`
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${where}：每一项都必须是对象`)
      return
    }
    const record = /** @type {Record<string, unknown>} */ (entry)
    const missing = ['id', 'moduleId', 'localName'].filter(
      (field) => typeof record[field] !== 'string' || String(record[field]).trim() === '',
    )
    if (missing.length > 0) {
      errors.push(`${where}：字段 ${missing.join('、')} 缺失或不是非空字符串`)
      return
    }
    const id = String(record.id)
    if (seen.has(id)) {
      errors.push(`${where}：id 重复（${id}）——同一个语义键只能声明一次`)
      return
    }
    seen.add(id)
    anchors.push({
      id,
      moduleId: String(record.moduleId),
      localName: String(record.localName),
      purpose: typeof record.purpose === 'string' ? record.purpose : '',
      origin,
    })
  })
  return { anchors, errors }
}

/**
 * 逐个声明锚对着产物判：能解析出**唯一**类名才算通过。
 *
 * @param {ReadonlyArray<DeclaredAnchor>} declared
 * @param {(moduleId: string) => {css: string} | {reason: string}} loadCss
 *   按模块 id 取官方 CSS 文本；取不到时要给出**原因**（包不在 / 模块 id 不在 / CSS 常量读不出），
 *   因为这三种原因的修法完全不同。
 * @returns {{checked: number, resolved: Array<{id: string, className: string}>, failures: Array<DeclaredAnchor & {reason: string}>}}
 */
export function judgeDeclaredAnchors(declared, loadCss) {
  /** @type {Array<{id: string, className: string}>} */
  const resolved = []
  /** @type {Array<DeclaredAnchor & {reason: string}>} */
  const failures = []
  for (const anchor of declared) {
    const loaded = loadCss(anchor.moduleId)
    if (!('css' in loaded)) {
      failures.push({ ...anchor, reason: loaded.reason })
      continue
    }
    const candidates = classNameCandidates(loaded.css, anchor.localName)
    if (candidates.length === 1) {
      resolved.push({ id: anchor.id, className: /** @type {string} */ (candidates[0]) })
      continue
    }
    failures.push({
      ...anchor,
      reason:
        candidates.length === 0
          ? describeMiss(loaded.css, anchor.localName, anchor.moduleId)
          : `${anchor.moduleId} 里 ${anchor.localName} 的前缀不唯一（${candidates.length} 个：${candidates.join('、')}）`,
    })
  }
  return { checked: resolved.length, resolved, failures }
}
