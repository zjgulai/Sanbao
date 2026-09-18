/**
 * 门禁 `resource-path-reachability` 的判据（纯函数）。
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────────────
 *
 * 2026-09-17 实测：2.5.0 DMG 装完，应用进恢复模式，日志
 *
 *   Cannot find module '<Resources>/app.asar.unpacked/node_modules/@earendil-works/pi-ai/
 *    dist/api/anthropic-messages.lazy.js' imported from .../dsh-llm-pi-ai/lib/index.js
 *
 * 根因不是「补丁没打上」，恰恰相反——**补丁打上了，而且门禁为它亮着绿灯**：
 *
 *   verify-patches-v2.sh:  ck "P0-8 pi-ai 磁盘化" "$NM/dsh-llm-pi-ai/lib/index.js" "PI_AI_API_DIR"
 *
 * 这条判据量的是**补丁的身份标记**（那个常量名在不在文件里），不是**那条路径在出货产物上
 * 能不能解析**。于是「补丁在」与「能力能跑」被当成同一件事。
 *
 * 而这条路径本身是**一条被时间作废的环境常量**：
 *
 *   const PI_AI_API_DIR = `${process.resourcesPath}/app.asar.unpacked/node_modules/...
 *
 * 它写于 2.0.5/asar 基座（当时 unpacked 目录真实存在）；基座迁到 2.0.10 的 **no-ASAR**
 * 布局（`Resources/app/` 是普通目录，没有 `app.asar`，也没有 `app.asar.unpacked`）之后，
 * 这行字面量没有任何东西提醒它已经悬空——**锚门绿、装配绿、装到机器上才炸**。
 * 这是总账 P-06（把平台行为当常量）叠在 P-02（判据量错了对象）上。
 *
 * ── 判据 ────────────────────────────────────────────────────────────────────
 *
 * 对每个被扫描的 `.js`，抽出**路径形态**的资源根字面量（含 `app.asar` / `app.asar.unpacked`
 * 的字符串或模板），再按产物真实形态判定：把 `app.asar.unpacked/...` 当**路径**用、
 * 而该路径在产物上不存在 = 红。no-ASAR 与 ASAR 两种形态**对称**判定。
 *
 * ── 为什么必须区分「路径」与「正则/replace」──────────────────────────────────
 *
 * `main.js` 里有一处**合法**的 `"app.asar.unpacked"` 替换串：
 *
 *   fileURLToPath(new URL("./native-ui/recovery.html", import.meta.url))
 *     .replace(/app\.asar(?!\.unpacked)/g, "app.asar.unpacked")
 *
 * 它是 `String.replace` 的替换值，在 no-ASAR 下是语义 no-op（`import.meta.url` 已直指
 * `Resources/app/lib/...`），且**不参与路径解析**。若判据把它一起判红，就是把一条已验收的
 * 正确产物判成缺陷——总账 P-02 的另一半：仪器假红同样贵，它的长相与真缺陷一模一样。
 * 因此提取器先做**代码/非代码掩码**：字符串与模板内容之外的一切（含正则字面量与
 * `.replace(` 的替换值位）都不参与路径判定。
 *
 * 残留缺口诚实写明：把替换值先存进变量再传、或把路径两段拼接后使用，能绕过本判据。
 * 本项不假装守住全称——它钉的是**已经发生过一次的那个形状**。
 *
 * ── 射程为空时的输出 ────────────────────────────────────────────────────────
 *
 * 没有可扫文件、或形态探测落空时返回 `skipped: true`，与 `passed: true` 在读数上分开。
 * 「没量到东西」被读成「都合格」是本类判据最便宜的失效路径（ADR-0075 / P-02）。
 *
 * @typedef {object} ResourcePathVerdict
 * @property {boolean}  passed       是否无违规
 * @property {boolean}  skipped      射程为空（没量到任何可判候选或形态未知）
 * @property {string}   form         产物资源形态：`no-asar` | `asar` | `unknown`
 * @property {number}   scanned      实际扫描的 `.js` 文件数
 * @property {number}   checked      其中被判据真正判过的候选数（0 = 本条树**未被核实**）
 * @property {object[]} violations   每条 = { file, literal, reason }
 * @property {string}   note         读数：量了哪棵树、什么形态、抽到几条候选
 */

/**
 * 候选字面量必须含 `app.asar` 且**后随路径分隔符**——「带分隔符」这一条把
 * `"app.asar"` 这类非路径提及（错误消息、文件名判断）排除在外。
 */
const LITERAL_NEEDLE_RE = /app\.asar(?:\.unpacked)?\//

/**
 * 掩掉源码里「非字符串内容」，并**记录每个字符串/模板字面量的内容范围**。
 *
 * 逐个字符走：正则字面量（`/…/flags`）与注释整体掩掉；字符串/模板的内容原样保留，
 * 并把内容在原串中的 `[start, end)` 记进 `spans`。候选的提取随后在**原串**上按范围切片，
 * 因此不依赖掩码串里还能不能看见引号。这样 `/app\.asar(?!\.unpacked)/g` 里的路径片段
 * **不会**被当成候选——它是正则字面量，不是路径。
 *
 * @param {string} source 源码
 * @returns {{ masked: string, spans: Array<{ start: number, end: number, quote: string }> }}
 */
export function maskNonStringSpans(source) {
  const out = new Array(source.length).fill(' ')
  /** 每个字符串/模板字面量的**内容**范围（原串下标，`[start, end)`，不含引号）。 */
  const spans = []
  let i = 0
  let prev = ''
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    // 行注释
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }
    // 块注释
    if (ch === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    // 正则字面量：仅在「值位」（前一有效字符不是标识符/右括号/右方括号）时成立
    if (ch === '/' && !/[\w$)\]'"`]/.test(prev)) {
      let j = i + 1
      let inClass = false
      while (j < source.length) {
        const c = source[j]
        if (c === '\\') { j += 2; continue }
        if (c === '[') inClass = true
        else if (c === ']') inClass = false
        else if (c === '/' && !inClass) break
        else if (c === '\n') { j = -1; break }
        j += 1
      }
      if (j > 0) {
        i = j + 1
        while (i < source.length && /[a-z]/.test(source[i])) i += 1
        prev = '/'
        continue
      }
    }
    // 字符串与模板：内容保留，并记录内容范围
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      const contentStart = i + 1
      let contentEnd = contentStart
      i += 1
      while (i < source.length) {
        const c = source[i]
        if (c === '\\') {
          out[i] = source[i]
          out[i + 1] = source[i + 1]
          i += 2
          continue
        }
        if (c === quote) break
        if (quote === '`' && c === '$' && source[i + 1] === '{') {
          // 模板插值：整体原样保留，便于后续识别 `${…}`
          let depth = 1
          out[i] = source[i]
          out[i + 1] = source[i + 1]
          i += 2
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth += 1
            else if (source[i] === '}') depth -= 1
            out[i] = source[i]
            i += 1
          }
          continue
        }
        if (c === '\n' && quote !== '`') break
        out[i] = c
        i += 1
      }
      contentEnd = Math.min(i, source.length)
      spans.push({ start: contentStart, end: contentEnd, quote })
      i += 1
      prev = quote
      continue
    }
    if (!/\s/.test(ch)) prev = ch
    i += 1
  }
  return { masked: out.join(''), spans }
}

/**
 * 从一段源码里抽出「路径形态」的资源根字面量。
 *
 * @param {string} source 源码文本
 * @returns {string[]} 候选字面量（保留 `${...}` 插值原样）
 */
export function extractResourcePathLiterals(source) {
  const { spans } = maskNonStringSpans(source)
  const found = []
  for (const { start, end } of spans) {
    const literal = source.slice(start, end)
    if (!LITERAL_NEEDLE_RE.test(literal)) continue
    if (!found.includes(literal)) found.push(literal)
  }
  return found
}

/**
 * 判定产物资源根的形态。
 *
 * @param {{ hasApp: boolean, hasAsar: boolean, hasUnpacked: boolean, ok: boolean }} probe 探测读数
 * @returns {'no-asar' | 'asar' | 'unknown'}
 */
export function detectForm({ hasApp, hasAsar, hasUnpacked, ok }) {
  if (!ok) return 'unknown'
  if (hasApp && !hasAsar && !hasUnpacked) return 'no-asar'
  if (hasAsar || hasUnpacked) return 'asar'
  return 'unknown'
}

/**
 * 取字面量里**最长的静态路径段**（供存在性判定）。插值 `${…}` 段被剔除；
 * 没有任何路径段的字面量不可判。
 *
 * @param {string} literal 候选字面量
 * @returns {string | undefined} 静态路径段（已去前导斜杠），不可判时为 undefined
 */
export function staticPathSegment(literal) {
  const segments = literal
    .split(/\$\{[^}]*\}/)
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter((part) => part.includes('/'))
  if (segments.length === 0) return undefined
  return segments.sort((a, b) => b.length - a.length)[0]
}

/**
 * 判定一批候选字面量在给定形态下是否可达。
 *
 * @param {object} input
 * @param {'no-asar' | 'asar' | 'unknown'} input.form 产物形态
 * @param {Array<{ file: string, literal: string }>} input.candidates 候选
 * @param {(relPath: string) => boolean} input.exists 资源根相对路径 → 是否存在
 * @returns {{ violations: object[], checked: number, unchecked: number }}
 */
export function judgeResourcePaths({ form, candidates, exists }) {
  const violations = []
  let checked = 0
  let unchecked = 0
  for (const { file, literal } of candidates) {
    const segment = staticPathSegment(literal)
    if (segment === undefined) {
      unchecked += 1
      continue
    }
    checked += 1
    const dir = segment.replace(/\/[^/]*$/, '')
    if (dir === '' || !exists(dir)) {
      violations.push({
        file,
        literal,
        reason: `资源根下的目录不存在：${dir === '' ? '(空)' : dir}`,
      })
    }
  }
  return { violations, checked, unchecked }
}

/**
 * 汇总成门禁裁决。
 *
 * @param {object} input
 * @param {string}   input.tree        被扫描的 app 树（用于读数）
 * @param {object}   input.probe       资源根探测读数
 * @param {string[]} input.jsFiles     树的 `.js` 文件（资源根相对路径）
 * @param {(rel: string) => string} input.read 读文件内容
 * @param {(rel: string) => boolean} input.exists 判断资源根相对路径存在
 * @returns {ResourcePathVerdict}
 */
export function checkResourcePathReachability({ tree, probe, jsFiles, read, exists }) {
  const form = detectForm(probe)
  const candidates = []
  for (const rel of jsFiles) {
    let source
    try {
      source = read(rel)
    } catch {
      continue
    }
    for (const literal of extractResourcePathLiterals(source)) candidates.push({ file: rel, literal })
  }
  const { violations, checked, unchecked } = judgeResourcePaths({ form, candidates, exists })
  const scanned = jsFiles.length
  const note =
    `tree=${tree} form=${form} 扫描 ${scanned} 个 .js，命中 ${candidates.length} 条路径候选` +
    `（可判 ${checked} / 不可判 ${unchecked}）`
  // 射程为空 = **这条树本次没被量**。它有两种情形，必须分开报：
  //   · 形态探测落空 / 一个文件都没扫到 → 判据根本没跑起来（装配出错、目录搬走了）；
  //   · 扫到了文件但**一条路径候选都没有** → 很可能是**正确修复后的产物**（补丁里那把
  //     悬空的路径常量已被删掉，例如 P0-8 删掉后 `dsh-llm-pi-ai` 里不再有资源根字面量）。
  // 把后者判红就是**仪器假红**：它会把一条已验收的正确产物读成缺陷（P-02 的另一半）。
  // 但也不能悄悄算作「验证过」——调用方要把 checked=0 的树按**未核实**计数，
  // 让读数里「没量到东西」与「量了都合格」不同形。
  const vacuous = form === 'unknown' || scanned === 0 || checked === 0
  const reason =
    form === 'unknown'
      ? '无法判定产物资源形态'
      : scanned === 0
        ? '扫描面里一个 .js 都没有'
        : '扫描到的文件里没有任何资源根路径候选（通常=该补丁的悬空常量已被删除）'
  return {
    passed: violations.length === 0,
    skipped: vacuous,
    form,
    scanned,
    checked,
    violations,
    note: vacuous ? `${note} —— 射程为空（${reason}），报跳过而非通过` : note,
  }
}
