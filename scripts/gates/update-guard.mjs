/**
 * 门禁 `update-guard` 的判据：装机 / 待发布 app 里的**更新安装闸必须是「闸」，不是一句文案**
 * （T-08a，见 [13 号计划 §4](../../docs/research/13-upgrade-2.0.10-execution-plan.md)）。
 *
 * ── 这条闸在拦什么 ──────────────────────────────────────────────────────────
 *
 * 官方更新通道对 LUTE 是关闭的，而关闭它的是 **P0-1v2**：`downloadAndOpenUpdate()` 的**第一句**
 * 就是 `if (process.env.DSH_DISABLE_UPDATE_INSTALL !== "0") throw …`，之后才轮到
 * `downloadDesktopUpdate()`（网络下载）与 `shell.openPath()`（把 DMG 交给系统安装器）。
 * 一旦这条语句被上游改写、挪位或在重锚时丢失，**未签名的官方载荷会被直接执行**——
 * 这正是「unsigned payload risk」那句文案说的事。
 *
 * ── 为什么要单独一条判据（而不是复用 patch-anchors）────────────────────────
 *
 * `packaging/verify-patches-v2.sh:66` 已经在查这条补丁，但查的是**消息串出现在文件里**
 * （`ck "P0-1v2 更新守卫" "$LIB_ER" "Update installation is disabled for security"`）。
 * 串在 ≠ 闸在，两者可以同时成立而又完全不设防：
 *
 *   - 闸被挪到 `downloadDesktopUpdate()` **之后** —— 下载已经发生，串还在文件里；
 *   - 闸的条件被写成恒真/恒假的别种形态 —— 串还是那句话；
 *   - 方法改名、更新流程搬走，那句文案作为历史残渣留在原处 —— 串仍然命中。
 *
 * 本项的断言因此**不是**「有没有这句话」，而是四条**结构关系**：
 * ① 闸用 `DSH_DISABLE_UPDATE_INSTALL` 判；② 判完**紧跟着 throw**；
 * ③ 闸排在**副作用之前**（`downloadDesktopUpdate(` / `shell.openPath(` 都在它后面）；
 * ④ `downloadAndOpenUpdate` **仍有调用点**（否则闸是死代码，真正的安装路径在别处）。
 *
 * 与 `patch-anchors` 的分工（免得被读成重复造噪声）：那边管**补丁在不在**（含消息串），
 * 这边只管**它在行为上还成不成立**。两条都绿才算这条闸真的在。
 *
 * ── 诚实划界：本项判不出什么 ────────────────────────────────────────────────
 *
 * 1. 这是**静态文本**断言，不做控制流分析。它拦的是「闸被搬走/被挪到效果之后/方法被孤立」
 *    这三类**结构性**退化，拦不住「闸还在原位、但上游在别处新开了一条未受保护的下载路径」。
 * 2. 只认 `downloadAndOpenUpdate` 这一个方法名。上游改名会让本项**响亮判红**（不是静默通过），
 *    此时按报错重锚，不要为了让门禁变绿而放过。
 *
 * @module
 */

/** 闸用的环境变量：`!== "0"` 即拦（默认拦，显式设 0 才放行）。 */
export const GUARD_ENV = 'DSH_DISABLE_UPDATE_INSTALL'

/** 闸所在的 bundle 名（上游构建带内容哈希，故用 glob；勿钉哈希——P-02 的死法）。 */
export const GUARD_BUNDLE_GLOB = 'electron-runtime-*.js'

/** 闸之后的**副作用**：出现这些调用即代表「后果已经发生」。 */
const EFFECTS = ['downloadDesktopUpdate(', 'shell.openPath(']

/** 闸与它的 `throw` 之间允许的最大距离：这段就是 `if (…) throw new Error(…)` 本身。 */
const THROW_WINDOW = 240

/** 受保护的入口方法：更新安装只能从这里走。 */
const GUARDED_ENTRY = 'downloadAndOpenUpdate'

/**
 * 定义式的正则：`async downloadAndOpenUpdate(`。
 * 刻意带上 `async `——调用点是 `this.downloadAndOpenUpdate(`，两者必须分得开，
 * 否则「找到了定义」会把调用点算进去，方法体提取随即落在一段不存在的括号上。
 */
const DEF_RE = /async\s+downloadAndOpenUpdate\s*\(/g

/**
 * 从 `(` 起做**字符串感知**的配对，找到参数表之后的方法体 `{`。
 *
 * @param {string} source
 * @param {number} from 形参表左括号的下标
 * @returns {number|null} 方法体左花括号下标；读不出返回 null
 */
function findBodyBrace(source, from) {
  let depth = 0
  for (let i = from; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) {
        const next = source.indexOf('{', i + 1)
        // 正常形态是 `) {`；中间若隔了别的 `{`（解构默认值等）也不至于跑太远，
        // 但隔了整段代码说明这不是定义，交给调用方报 unverifiable。
        return next !== -1 && next - i < 200 ? next : null
      }
    }
  }
  return null
}

/**
 * 字符串感知的花括号配对，取出方法体。
 *
 * 朴素的 `count('{')` 会被字符串里的花括号带错位，而错位的后果是**读到一截截断的方法体**：
 * 那是假红（闸明明在，报告说不在）与假绿（把后面的方法算进来）共用的入口。读不出闭合时
 * 返回 null，由调用方报 `unverifiable`——**不猜**。
 *
 * @param {string} source
 * @param {number} openBrace 方法体左花括号下标
 * @returns {string|null}
 */
function extractBody(source, openBrace) {
  let depth = 0
  let quote = null
  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i]
    if (quote !== null) {
      if (ch === '\\') { i += 1; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i)
      if (nl === -1) return null
      i = nl
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      if (end === -1) return null
      i = end + 1
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(openBrace, i + 1)
    }
  }
  return null
}

/**
 * 校验一段 `electron-runtime-*.js` 里更新安装闸的行为结构。
 *
 * 纯函数：输入是文本，不读磁盘、不跑 git，因此可以被反向自测（含恒真桩突变）。
 *
 * @param {string} text bundle 正文；读不到时传空串（**判红**，空文件不得判绿）
 * @returns {{passed: boolean, unverifiable: boolean, violations: string[], note: string}}
 *   `unverifiable` 为真表示**判定失败**（读不出方法体），调用方必须单独计数：
 *   它与「闸不在」不是同一件事，与「通过」更不是（ADR-0075 / P-02）。
 */
export function checkUpdateGuard(text) {
  const source = String(text ?? '')

  if (source.trim() === '') {
    return {
      passed: false,
      unverifiable: false,
      violations: [`读不到正文——${GUARD_BUNDLE_GLOB} 为空或被移走（空文件不得判绿）`],
      note: '未读到任何字节',
    }
  }

  DEF_RE.lastIndex = 0
  const definitions = [...source.matchAll(DEF_RE)].map((match) => match.index)

  if (definitions.length === 0) {
    return {
      passed: false,
      unverifiable: false,
      violations: [
        `找不到 \`${GUARDED_ENTRY}\` 的定义（\`async ${GUARDED_ENTRY}(\`）——`
          + '上游可能改了名或把更新安装搬去了别处。闸所在的保护面已不可定位，'
          + '**按缺失判红**（不静默通过）：重锚到新的承载面之后再改判据。',
      ],
      note: '定义缺失',
    }
  }

  const violations = []
  const bodyBrace = findBodyBrace(source, source.indexOf('(', definitions[0]))
  const body = bodyBrace === null ? null : extractBody(source, bodyBrace)

  if (body === null) {
    return {
      passed: false,
      unverifiable: true,
      violations: [
        `读不出 \`${GUARDED_ENTRY}\` 的方法体（花括号配对未闭合）——`
          + '这是**判定失败**，不是「闸不在」，也不是通过。bundle 形态可能已变（压缩/转译），'
          + '需人工确认后再决定是修判据还是改锚。',
      ],
      note: '方法体不可解析，本项**未判定任何内容**',
    }
  }

  // ① ② 闸存在，且判完紧跟着 throw。
  const guardIndex = body.indexOf(GUARD_ENV)
  if (guardIndex === -1) {
    violations.push(
      `\`${GUARDED_ENTRY}\` 里找不到 \`${GUARD_ENV}\` 判据——更新安装闸不见了。`
        + '官方载荷未签名，失去这条闸等于允许未签名字节被执行。',
    )
  } else {
    const tail = body.slice(guardIndex, guardIndex + THROW_WINDOW)
    if (!/\bthrow\b/.test(tail)) {
      violations.push(
        `\`${GUARD_ENV}\` 之后 ${THROW_WINDOW} 字符内没有 \`throw\`——`
          + '闸只判了却没拦（判而不断等于没判）。',
      )
    }
    // ②′ 条件本身必须还在比较 `0`。
    //
    // 少了这一条，**条件被抽走**的形态会静默通过：2026-09-18 对装机真实字节做突变 M3
    // （`process.env.DSH_DISABLE_UPDATE_INSTALL !== "0"` → `false`）实测判绿——因为 env 只剩
    // 消息串里那一次出现，而紧跟的 platform 检查也带 `throw`，落在 THROW_WINDOW 内，
    // 「判后有 throw」照样成立。加上本条后 M3 判红。
    //
    // 只认「env 紧跟着与 `0` 比较」，不钉比较方向（`!==` / `!=` / `===` 都收）：
    // 判据要拦的是「条件不见了」，不是「上游换了引号或方向」。
    const conditionWindow = body.slice(guardIndex, guardIndex + 48)
    if (!/[!=]==?\s*["'`]?0["'`]?/.test(conditionWindow)) {
      violations.push(
        `\`${GUARD_ENV}\` 后面没有紧跟与 \`0\` 的比较——`
          + '闸的条件被抽走或换了形态（如 `if (false) throw …`），此时它**永不拦**，'
          + '而消息串与 `throw` 都还在，按串判的判据看不见。',
      )
    }
  }

  // ③ 闸必须排在副作用之前。
  const effectHits = EFFECTS
    .map((needle) => ({ needle, at: body.indexOf(needle) }))
    .filter((hit) => hit.at !== -1)

  if (effectHits.length === 0) {
    violations.push(
      `\`${GUARDED_ENTRY}\` 里找不到任何已知副作用（${EFFECTS.map((e) => `\`${e}\``).join('、')}）——`
        + '要么上游改了下载/安装的调用形态（需重锚），要么方法体已被抽空。两种情况都要人看。',
    )
  } else if (guardIndex !== -1) {
    const earliest = effectHits.reduce((min, hit) => (hit.at < min.at ? hit : min))
    if (guardIndex > earliest.at) {
      violations.push(
        `闸排在副作用之后：\`${GUARD_ENV}\` 在 ${guardIndex}，`
          + `而 \`${earliest.needle}\` 在 ${earliest.at}——下载/安装已经发生才判，`
          + '此时拦不拦都没有意义（消息串仍在文件里，所以按串判的判据看不见这一形态）。',
      )
    }
  }

  // ④ 闸不能是死代码：方法必须仍有调用点。
  const allRefs = source.split(`${GUARDED_ENTRY}(`).length - 1
  if (allRefs <= definitions.length) {
    violations.push(
      `\`${GUARDED_ENTRY}\` 只有定义、没有调用点——闸是死代码，真正的更新安装路径在别处。`,
    )
  }

  const note = violations.length === 0
    ? `闸在位：\`${GUARD_ENV}\` 判后即 throw，且排在 ${effectHits.map((h) => h.needle).join('、')} 之前；调用点 ${allRefs - definitions.length} 处`
    : `${violations.length} 条结构断言不成立`

  return { passed: violations.length === 0, unverifiable: false, violations, note }
}
