#!/usr/bin/env node
/**
 * 浅色主题色彩审计：把 ADR-0115 的五组取证落成**可复跑的仪器**。
 *
 * ## 为什么需要它
 *
 * ADR-0115 的每条判据都来自一次一次性扫描（原稿在 `/tmp/theme-audit/*.mjs`）。一次性扫描的
 * 问题是：**数字进了文档，方法留在了 /tmp**。下一次有人说「这个 315 是怎么来的」，只能重写一遍，
 * 而重写出来的口径一定和上次不同——于是同一个事实就有了两个家（ADR-0009 禁止的正是这个）。
 *
 * 本探针因此把五组取证连同**每组的扫描口径**一起写死在同一处：
 *
 *   1. 覆盖：官方浅色 alias 总数 / 官方前端真实消费数 / 本仓接管数 / 未接管清单。
 *   2. 中性双轨：官方浅色 alias 解析到哪一套 static 尺度（真中性 vs 蓝味），近白值有多少个不同值。
 *   3. 硬编码：全仓 hex 字面量、色相直方图、蓝色族占比。
 *   4. 兜底：同一 token 带多少种互不相同的字面兜底（**这是「同屏多种蓝色」的直接来源**）。
 *   5. 深浅不对称：深色专用整改层条数 vs 浅色对应层条数。
 *
 * 外加一项**真实引擎解析**：运行 settings/shared/主题生成器取得四个背景层表达式，
 * 携带真实 SANBAO_TOKEN_CSS，交给 Chromium 在 light/dark/warm-pink 三身份下求值。
 * 不在验收脚本中重写调色板或 color-mix 算法。
 *
 * ## 仪器自检（没有它这片输出不可信）
 *
 * 「数字是 0」必须能和「我的扫描本身就不成立」区分开，所以每次运行都先过一组对照：
 *
 *   - 切分：官方主题包里必须**同时**找到「浅色 alias 块」与「深色 alias 块」（按选择器锚点定位、
 *     括号配平读块），两侧各含 ≥50 个 alias，且至少 20 个 alias 取值不同。切错会让「浅色」
 *     实际上是另一块，而输出依旧一片数字——实测用「第一个 `data-ds-dark-theme` 位置」切会得到
 *     80 个而不是 90 个浅色定义，且不报任何错。
 *   - 正控：`--dsw-alias-link` 必须在浅色集合里、且必须被判为蓝（它是本次故障的主角，判不出来
 *     说明蓝色判据坏了）。`--dsw-static-deepseek-500` 必须解析成 `#4176e6`。
 *   - 负控：一个不存在的 token 名必须在集合外。
 *   - 颜色数学：`#000`/`#fff` 对比度必须是 21:1（不是 21 就说明亮度公式写错了）。
 *   - 扫描：仓库源码文件数与 hex 命中数都必须 > 0。
 *
 * 任何一条不成立即 **exit 2**，绝不在仪器坏掉的情况下产出一片看似正常的数字。
 * 用 `--break <split|blue|scan>` 可以**故意打断**某件仪器，用于验证这些对照不是恒真桩：
 * 带上它必须 exit 2（见文件末尾的用法示例）。
 *
 * ## 边界（诚实地写清楚）
 *
 * - 本探针**不打开** `127.0.0.1:43120` 的实况 GUI（那条路要配对凭证），所以它证明的是
 *   「仓库与产物里的颜色事实」，不是「此刻页面长什么样」。后者属 ADR-0115 的 B4。
 * - 真实引擎使用默认排版设置，颜色由三身份决定；旧版 contrast 调色器已退役。
 * - 各组的扫描口径写在各 `SECTION` 常量旁；改动口径就是改动判据，必须同时改 ADR-0115。
 *
 * 用法：`node scripts/acceptance/theme-palette-audit.mjs [--out <dir>] [--no-browser] [--break <split|blue|scan|layer>]`
 * 工具借用：THEME_BROWSER_PACKAGE / --browser-package 指向已有工具包 package.json。
 * 退出码：0 = 五组均已测量且仪器自检全过；2 = 前置条件缺失或仪器自检不成立。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appNodeModules } from '../lib/app-resources.mjs'
import { loadThemeSources } from '../lib/theme-source-loader.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const APP_DIR = process.env.DSH_APP ?? '/Applications/DSH Desktop.app'

const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}
const OUT_DIR = resolve(argValue('--out', join(REPO_ROOT, '.scratch/dsh-worktable-fusion/acceptance')))
const USE_BROWSER = !args.includes('--no-browser')
const BREAK = argValue('--break', null)
const BROKEN = (name) => BREAK === name

/** 前置条件缺失时响亮退出，绝不降级成「跳过 = 通过」。 */
function require_(condition, message) {
  if (!condition) {
    console.error(`[palette-audit] 前置条件缺失：${message}`)
    process.exit(2)
  }
}

const APP_NM = appNodeModules(APP_DIR)
require_(APP_NM && existsSync(APP_NM), `探测不到应用内的 node_modules（${APP_DIR} 是否已安装？）`)

const THEME_BUNDLE = join(APP_NM, '@deepseek-ai', 'dsh-client-ui-theme', 'lib', 'client.js')
const FRONTEND_ASSETS = join(APP_NM, '@deepseek-ai', 'dsh-web-frontend', 'dist', 'assets')
const THEME_TOKENS_TS = join(REPO_ROOT, 'packages/platform/dsh-theme-local/src/client/theme-tokens.ts')

for (const [label, path] of [
  ['官方主题包', THEME_BUNDLE],
  ['官方前端产物', FRONTEND_ASSETS],
  ['theme-local 的 theme-tokens.ts', THEME_TOKENS_TS],
]) {
  require_(existsSync(path), `读不到${label}：${path}`)
}
let themeSource
try {
  themeSource = await loadThemeSources(REPO_ROOT)
} catch (error) {
  require_(false, `真实主题模块图加载失败：${error.message}`)
}
const identities = themeSource.identities.map(({ id }) => id)
const themeCss = themeSource.shared.SANBAO_TOKEN_CSS

// ── 颜色数学 ────────────────────────────────────────────────────────────────
// 只用 WCAG 2.x 的定义，不做近似：对比度必须能和浏览器 DevTools 对上，否则数字没有裁判价值。

function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '')
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('')
  if (h.length === 6 || h.length === 8) h = h.slice(0, 6)
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHsl(rgb) {
  // alias 的取值不一定是 solid hex（实测有 `color-mix(...)`、`rgba(...)`、渐变）。
  // 判不出颜色必须**显式返回 null**（归入 unparsable），而不是抛错中断整片审计。
  if (!rgb) return null
  let [r, g, b] = rgb
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return [h, s, l]
}

function relativeLuminance([r, g, b]) {
  const channel = (c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(a, b) {
  const la = relativeLuminance(hexToRgb(a))
  const lb = relativeLuminance(hexToRgb(b))
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * 「蓝味」判据。历史上有过两个版本（`s > 0.08` 与 `s > 0.10`），本文件**统一为 0.10**：
 * 0.08 会把若干近乎中性的灰判成蓝，而本审计的结论恰恰依赖「真中性算不算蓝」。
 */
const BLUE = { hueMin: 185, hueMax: 275, satMin: 0.1, lightMin: 0.05, lightMax: 0.96 }
function isBlueish(hsl) {
  if (!hsl) return false
  if (BROKEN('blue')) return false
  const [h, s, l] = hsl
  return h >= BLUE.hueMin && h <= BLUE.hueMax && s > BLUE.satMin && l > BLUE.lightMin && l < BLUE.lightMax
}
const isNeutral = (hsl) => Boolean(hsl) && hsl[1] <= 0.03
const classify = (hsl) => {
  if (!hsl) return 'unparsable'
  if (isNeutral(hsl)) return 'neutral'
  if (isBlueish(hsl)) return 'BLUE'
  const [h] = hsl
  if (h >= 60 && h < 185) return 'green/teal'
  return h < 60 || h >= 300 ? 'warm' : 'other'
}

// ── 仪器自检 ────────────────────────────────────────────────────────────────
const SELF_TEST = []
const check = (name, ok, detail) => {
  SELF_TEST.push({ name, ok: Boolean(ok), detail })
  return Boolean(ok)
}

check('颜色数学：#000/#fff 对比度 = 21:1', Math.abs(contrastRatio('#000000', '#FFFFFF') - 21) < 0.01,
  `${contrastRatio('#000000', '#FFFFFF').toFixed(2)}:1`)
check('颜色数学：#4176e6 判为蓝', isBlueish(rgbToHsl(hexToRgb('#4176e6'))), 'DeepSeek 蓝的负控/正控')
check('颜色数学：#f7f7f7 判为中性', isNeutral(rgbToHsl(hexToRgb('#f7f7f7'))), '真中性灰')

// ── 官方主题包：浅/深两态切分 ──────────────────────────────────────────────
const themeSrc = readFileSync(THEME_BUNDLE, 'utf8')

/**
 * 浅色 alias 块 / 深色 alias 块的提取。
 *
 * **不能**用「第一个 `data-ds-dark-theme` 出现位置」当深浅切分点：实测该串在同一文件里出现
 * **4 次**（浅/深各一个静态尺度块、浅/深各一个 alias 块），而第一处只是**静态尺度**的深色块。
 * 切在那里会得到 80 个浅色定义而不是 90 个——输出依旧是一堆看起来正常的数字，这正是本探针
 * 要求「切分必须被对照验证」的原因。改为：按选择器锚点定位 alias 块的起始 `{`，再用**括号配平**
 * 读完整块（`indexOf('}')` 会被块内任何字面 `}` 截断，实测截断后只剩 81 个）。
 *
 * `--break split` 会让它返回空集合，用于验证下面的切分对照不是恒真桩。
 */
function extractAliasBlocks(src) {
  if (BROKEN('split')) return { light: new Map(), dark: new Map(), anchors: [] }
  const anchor = /(^|[}\n;])(body(?:\[[^\]]*\])?)\{(?=--dsw-alias-[a-z0-9-]+\s*:)/g
  const light = new Map()
  const dark = new Map()
  const anchors = []
  let m
  while ((m = anchor.exec(src)) !== null) {
    const brace = src.indexOf('{', m.index)
    let depth = 1
    let j = brace + 1
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth += 1
      else if (src[j] === '}') depth -= 1
      j += 1
    }
    const body = src.slice(brace + 1, j - 1)
    const declarations = [...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)]
    const isLight = m[2] === 'body'
    anchors.push({
      selector: m[2],
      side: isLight ? 'light' : 'dark',
      at: m.index,
      bytes: body.length,
      declarations: declarations.length,
    })
    const target = isLight || /^body\[/.test(m[2]) ? (isLight ? light : dark) : null
    if (!target) continue
    for (const d of declarations) if (!target.has(d[1])) target.set(d[1], d[2].trim())
  }
  return { light, dark, anchors }
}

const aliasBlocks = extractAliasBlocks(themeSrc)
const lightAlias = new Map([...aliasBlocks.light].filter(([n]) => n.startsWith('--dsw-alias-')))
const darkAlias = new Map([...aliasBlocks.dark].filter(([n]) => n.startsWith('--dsw-alias-')))

// 切分对照：锚点必须找到两块、两侧都必须真的有成规模的 alias、两块内容必须真的不同。
const differentlyValued = [...lightAlias].filter(([n, v]) => darkAlias.has(n) && darkAlias.get(n) !== v).length
check('切分#1：锚点同时找到浅色块与深色块',
  aliasBlocks.anchors.some((a) => a.side === 'light') && aliasBlocks.anchors.some((a) => a.side === 'dark'),
  aliasBlocks.anchors.map((a) => `${a.selector}@${a.at}(${a.declarations})`).join(' '))
check('切分#2：浅侧 alias ≥ 50', lightAlias.size >= 50, `${lightAlias.size} 个`)
check('切分#3：深侧 alias ≥ 50', darkAlias.size >= 50, `${darkAlias.size} 个`)
check('切分#4：浅深两侧确有差异（≥20 个 alias 取值不同）', differentlyValued >= 20, `${differentlyValued} 个不同`)
check('切分#5：浅色块里没有混进静态尺度定义',
  ![...aliasBlocks.light.keys()].some((n) => n.startsWith('--dsw-static-')),
  '混进静态尺度说明括号配平读到了错误的块')

// 官方 static 尺度（alias 大多指向它，必须先解析到 hex 才能判色相）
const STATIC_SCALE = new Map()
for (const m of themeSrc.matchAll(/(--dsw-static-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
  if (!STATIC_SCALE.has(m[1])) STATIC_SCALE.set(m[1], m[2])
}
function resolveStatic(value) {
  const inner = String(value).match(/var\((--dsw-static-[a-z0-9-]+)\)/)
  return inner ? (STATIC_SCALE.get(inner[1]) ?? value) : value
}
const staticFamily = (value) => {
  if (/--dsw-static-neutral-bluish-/.test(value)) return 'neutral-bluish'
  if (/var\(--dsw-static-neutral-\d/.test(value)) return 'neutral(true)'
  if (/--dsw-static-deepseek-/.test(value)) return 'deepseek(blue)'
  if (/--dsw-static-/.test(value)) return 'other-static'
  return 'literal'
}

check('正控：--dsw-alias-link 在浅色集合内', lightAlias.has('--dsw-alias-link'), lightAlias.get('--dsw-alias-link'))
check('正控：--dsw-alias-link 判为蓝',
  isBlueish(rgbToHsl(hexToRgb(resolveStatic(lightAlias.get('--dsw-alias-link'))))),
  `${lightAlias.get('--dsw-alias-link')} → ${resolveStatic(lightAlias.get('--dsw-alias-link'))}`)
check('正控：--dsw-static-deepseek-500 = #4176e6',
  String(STATIC_SCALE.get('--dsw-static-deepseek-500')).toLowerCase() === '#4176e6',
  String(STATIC_SCALE.get('--dsw-static-deepseek-500')))
check('负控：不存在的 token 不在集合内', !lightAlias.has('--dsw-alias-zzz-does-not-exist'), '不得恒真')

// ── 官方前端真实消费量 ──────────────────────────────────────────────────────
require_(existsSync(FRONTEND_ASSETS), `读不到官方前端产物目录：${FRONTEND_ASSETS}`)
let frontendCss = ''
for (const f of readdirSync(FRONTEND_ASSETS)) {
  if (f.endsWith('.css')) frontendCss += readFileSync(join(FRONTEND_ASSETS, f), 'utf8')
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
const consumptionCache = new Map()
function consumedByFrontend(token) {
  if (!consumptionCache.has(token)) {
    consumptionCache.set(token, (frontendCss.match(new RegExp(`var\\(${escapeRe(token)}[,)]`, 'g')) ?? []).length)
  }
  return consumptionCache.get(token)
}
check('正控：官方前端 CSS 里有 var(--dsw-alias-*) 引用',
  /var\(--dsw-alias-[a-z0-9-]+[,)]/.test(frontendCss), `${frontendCss.length} 字节`)

// ── 本仓接管集合 ────────────────────────────────────────────────────────────
const themeTokensSrc = readFileSync(THEME_TOKENS_TS, 'utf8')
const DECLARED = new Set([...themeTokensSrc.matchAll(/["'](--dsw-[a-z0-9-]+)["']\s*:/g)].map((m) => m[1]))
const OWNED = new Set(Object.keys(themeSource.identities[0].overrides)
  .filter((token) => themeSource.identities.every(({ overrides }) => Object.hasOwn(overrides, token))))
check('声明的接管项在每个身份均实际供给', [...DECLARED].every((token) => OWNED.has(token)), `${DECLARED.size} 个声明 / ${OWNED.size} 个供给`)
check('正控：theme-local 接管集合非空且含 bg-layer-1', OWNED.has('--dsw-alias-bg-layer-1'), `${OWNED.size} 个 token`)

// ── 仓库扫描 ────────────────────────────────────────────────────────────────
// 口径 A（§3 硬编码/色相）：packages + shared + dsh-patches，css/ts/tsx/js/mjs。
// 口径 B（§2 近白值/§4 兜底）：packages + shared，css/ts/tsx，且排除调色板源文件与测试。
const EXCLUDE_COMMON = [/node_modules/, /\/dist\//, /\/lib\//, /\/build\//, /\/coverage\//, /\/staging\//, /\.patched$/, /\.min\./]
const SCOPE_EXT_A = new Set(['.css', '.ts', '.tsx', '.js', '.mjs'])
const SCOPE_EXT_B = new Set(['.css', '.ts', '.tsx'])

function walkRepo(roots, exts, extraExclude = []) {
  if (BROKEN('scan')) return []
  const out = []
  const visit = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if ([...EXCLUDE_COMMON, ...extraExclude].some((re) => re.test(p))) continue
      if (e.isDirectory()) visit(p)
      else if (exts.has(extname(e.name))) out.push(p)
    }
  }
  for (const r of roots) {
    const abs = join(REPO_ROOT, r)
    if (existsSync(abs) && statSync(abs).isDirectory()) visit(abs)
  }
  return out
}

const filesA = walkRepo(['packages', 'shared', 'dsh-patches'], SCOPE_EXT_A)
const filesB = walkRepo(['packages', 'shared'], SCOPE_EXT_B, [/presets\.ts$/, /\.test\./, /\.spec\./])
check('扫描#1：口径 A 扫到源码文件', filesA.length > 0, `${filesA.length} 个文件`)

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
const hexRecords = []
for (const f of filesA) {
  const text = readFileSync(f, 'utf8')
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(HEX_RE)) {
      const rgb = hexToRgb(m[0])
      if (!rgb) continue
      hexRecords.push({ hex: m[0].toLowerCase(), hsl: rgbToHsl(rgb), site: `${relative(REPO_ROOT, f)}:${i + 1}` })
    }
  })
}
check('扫描#2：口径 A 抓到 hex 字面量', hexRecords.length > 0, `${hexRecords.length} 处`)

// ── §1 覆盖：官方消费 ⊆ 本仓接管 ────────────────────────────────────────────
function buildCoverage() {
  const consumed = [...lightAlias].filter(([n]) => consumedByFrontend(n) > 0)
  const notOwned = consumed.filter(([n]) => !OWNED.has(n))
  return {
    officialLightAlias: lightAlias.size,
    // 官方浅色块里声明的**全部**自定义属性（= alias + --dsw-specific-*）。一次性脚本把这块的
    // 90 个声明整体当成了「alias 总数」，落仓时纠正：90 不是 alias 数，alias 只有 79 个。
    officialLightCustomProperties: aliasBlocks.light.size,
    consumed: consumed.length,
    // 把 --dsw-specific-* 也算上时的消费数（一次性脚本的 45 就是这个数，其中 --dsw-specific-menu
    // 不是 alias，ADR-0115 已写明它由既有别名自动跟随、不单独接管）。
    consumedIncludingSpecific: [...aliasBlocks.light].filter(([n]) => consumedByFrontend(n) > 0).length,
    owned: consumed.length - notOwned.length,
    notOwned: notOwned
      .map(([name, value]) => ({
        name,
        declared: value,
        resolved: resolveStatic(value),
        family: staticFamily(value),
        uses: consumedByFrontend(name),
        blue: isBlueish(rgbToHsl(hexToRgb(resolveStatic(value)))),
      }))
      .sort((a, b) => b.uses - a.uses),
  }
}
const coverage = buildCoverage()

// ── §2 中性双轨 + 近白值 ────────────────────────────────────────────────────
function buildNeutralTracks() {
  const families = new Map()
  for (const [, value] of lightAlias) {
    const key = staticFamily(value)
    families.set(key, (families.get(key) ?? 0) + 1)
  }
  const nearWhite = new Map()
  for (const f of filesB) {
    const text = readFileSync(f, 'utf8')
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(HEX_RE)) {
        const rgb = hexToRgb(m[0])
        if (!rgb) continue
        const hsl = rgbToHsl(rgb)
        // 与 ADR-0115 记录的判据逐字一致：L >= 0.88，**含**纯白。纯白个数单独报告——
        // 「#fff 与 #ffffff 并存」是写法不一致，不是色值不一致，混在一起会夸大结论。
        if (hsl[2] < 0.88) continue
        const key = m[0].toLowerCase()
        if (!nearWhite.has(key)) nearWhite.set(key, { hsl, sites: [] })
        if (nearWhite.get(key).sites.length < 3) nearWhite.get(key).sites.push(`${relative(REPO_ROOT, f)}:${i + 1}`)
      }
    })
  }
  return {
    families: [...families].sort((a, b) => b[1] - a[1]),
    nearWhite: [...nearWhite].sort((a, b) => a[1].hsl[2] - b[1].hsl[2]),
    pureWhite: [...nearWhite.keys()].filter((k) => nearWhite.get(k).hsl[2] >= 1).length,
  }
}
const neutralTracks = buildNeutralTracks()

// ── §3 硬编码与色相直方图 ──────────────────────────────────────────────────
function buildHueHistogram() {
  const distinct = new Map()
  for (const r of hexRecords) if (!distinct.has(r.hex)) distinct.set(r.hex, r.hsl)
  const buckets = new Map()
  for (const [, hsl] of distinct) {
    if (hsl[1] <= 0.08) continue
    const b = Math.floor(hsl[0] / 30) * 30
    buckets.set(b, (buckets.get(b) ?? 0) + 1)
  }
  const byFamily = { BLUE: 0, neutral: 0, 'green/teal': 0, warm: 0, other: 0, unparsable: 0 }
  for (const [, hsl] of distinct) byFamily[classify(hsl)] += 1
  return {
    occurrences: hexRecords.length,
    distinct: distinct.size,
    buckets: [...buckets].sort((a, b) => a[0] - b[0]),
    byFamily,
  }
}
const hue = buildHueHistogram()

/**
 * §3 的第二个数：「硬编码 hex」在本审计里指**没有被 token 定义吸收的 hex 出现数**
 * （hex 出现数 − 同一文件里 token 定义数）。这个口径来自一次性脚本 hardcoded.mjs，
 * 为的是能与 ADR-0115 记录的 315 对上。落仓时实测 335；把 26 个未跟踪文件排除后回到
 * 319（≈审计当时的树），差 20 由并发写入 theme-local 的新组件解释。
 */
function buildHardcodedScopeB() {
  let hex = 0
  let tokenDefs = 0
  let varRefs = 0
  for (const f of filesB) {
    const text = readFileSync(f, 'utf8')
    hex += [...text.matchAll(HEX_RE)].length
    tokenDefs += [...text.matchAll(/["']--(?:dsw|ds|dsh)-[a-z0-9-]+["']\s*:/g)].length
    varRefs += [...text.matchAll(/var\(--(?:dsw|ds|dsh)-[a-z0-9-]+/g)].length
  }
  return {
    hexOccurrences: hex,
    tokenDefs,
    varRefs,
    hardcoded: hex - tokenDefs,
    // 「token 化率」= 走 token 的引用数 / (走 token 的引用数 + 硬编码数)。Note 里引的就是这个数。
    tokenizationRate: Number(((varRefs / (varRefs + (hex - tokenDefs))) * 100).toFixed(1)),
  }
}
const hardcoded = buildHardcodedScopeB()

// ── §4 同一 token 的多种字面兜底 ────────────────────────────────────────────
function buildFallbacks() {
  const byToken = new Map()
  for (const f of filesB) {
    const text = readFileSync(f, 'utf8')
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/var\(\s*(--[a-z0-9-]+)\s*,\s*([^()]*(?:\([^()]*\))?[^()]*)\)/g)) {
        const token = m[1]
        const fallback = m[2].trim().toLowerCase()
        if (!/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/.test(fallback)) continue
        if (!byToken.has(token)) byToken.set(token, new Map())
        const variants = byToken.get(token)
        if (!variants.has(fallback)) variants.set(fallback, [])
        variants.get(fallback).push(`${relative(REPO_ROOT, f)}:${i + 1}`)
      }
    })
  }
  const conflicting = [...byToken]
    .map(([token, variants]) => ({
      token,
      variants: [...variants].map(([value, sites]) => ({ value, count: sites.length, sample: sites.slice(0, 2) })),
    }))
    .filter((r) => r.variants.length > 1)
    .sort((a, b) => b.variants.length - a.variants.length)
  return {
    tokensWithLiteralFallback: byToken.size,
    conflicting,
    totalVariants: conflicting.reduce((sum, r) => sum + r.variants.length, 0),
  }
}
const fallbacks = buildFallbacks()

// ── §5 深浅不对称：深色专用整改层 vs 浅色对应层 ─────────────────────────────
function buildAsymmetry() {
  const darkScoped = /body\[data-ds-dark-theme\]:not\(\[data-dsh-skin\]\)/g
  const lightScoped = /body:not\(\[data-ds-dark-theme\]\):not\(\[data-dsh-skin\]\)/g
  const perFile = new Map()
  let dark = 0
  let light = 0
  for (const f of filesB.filter((p) => p.endsWith('.css'))) {
    const text = readFileSync(f, 'utf8')
    const d = (text.match(darkScoped) ?? []).length
    const l = (text.match(lightScoped) ?? []).length
    const any = (text.match(/data-ds-dark-theme/g) ?? []).length
    if (any === 0) continue
    perFile.set(relative(REPO_ROOT, f), { darkScoped: d, lightScoped: l, any })
    dark += d
    light += l
  }
  const darkMentions = [...perFile.values()].reduce((s, v) => s + v.any, 0)
  return {
    darkScoped: dark,
    darkMentions,
    lightScoped: light,
    perFile: [...perFile].sort((a, b) => b[1].any - a[1].any),
  }
}
const asymmetry = buildAsymmetry()

// ── §6 真实引擎：四层 × 三身份，不解析/重抄主题生成算法 ─────────────────────
const LAYER_TOKENS = ['--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3']
function extractLayerExpressions() {
  const expressions = new Map()
  for (const token of LAYER_TOKENS) {
    const byIdentity = {}
    for (const { id, scheme, overrides } of themeSource.identities) {
      const expr = overrides[token]?.[scheme]
      if (typeof expr !== 'string' || !expr.trim()) throw new Error(`Missing layer expression: ${id}/${token}`)
      byIdentity[id] = expr
    }
    expressions.set(token, byIdentity)
  }
  return { expressions }
}

/**
 * 求值内核：给一批 {key, expr}，返回 `{engine, values}`，values 是 key → sRGB 字节。§6 与 §7 共用。
 *
 * 返回值里带**引擎自报版本**：本探针默认跑 Google Chrome（`channel: 'chrome'`），而产品跑在
 * Electron 自带的 Chromium 上，两者不是同一个东西。一条「在真实引擎里求过值」的结论必须能
 * 回答是**哪个**引擎——否则「引擎结论只测了 A、产品跑在 B」这件事只会留在口头。
 * 跨引擎对照见 `scripts/acceptance/theme-engine-crosscheck.mjs`。
 */
async function evaluateEntries(entries) {
  if (entries.length === 0) throw new Error('No expressions to measure')
  const requireFromBrowserPkg = createRequire(resolve(argValue('--browser-package',
    process.env.THEME_BROWSER_PACKAGE ?? join(REPO_ROOT, 'packages/capabilities/dsh-browser-local/package.json'))))
  const { chromium } = requireFromBrowserPkg('playwright-core')
  const browser = await chromium.launch({ channel: 'chrome' }).catch((error) => {
    console.warn(`[palette-audit] channel=chrome 起不来（${error.message.split('\n')[0]}），退回自带 chromium`)
    return chromium.launch()
  })
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } })
    await page.setContent('<!doctype html><html><body></body></html>', { waitUntil: 'load' })
    await page.addStyleTag({ content: themeCss })
    const controls = themeSource.identities.flatMap(({ id, scheme }) => [
      { key: `${id}:positive`, id, scheme, expr: 'var(--sanbao-canvas)', expectValid: true },
      { key: `${id}:negative`, id, scheme, expr: 'var(--sanbao-zzz-not-a-real-token)', expectValid: false },
    ])
    const probes = [...entries, ...controls]
    // 自定义属性先经真实 background-color 解析；canvas 只读其计算色，不能直接填 var()。
    const measured = await page.evaluate((probeList) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const probe = document.createElement('div')
      document.body.append(probe)
      const values = probeList.map((p) => {
        document.body.dataset.sanbaoTheme = p.id
        document.body.toggleAttribute('data-ds-dark-theme', p.scheme === 'dark')
        probe.style.setProperty('--audit-value', p.expr)
        probe.style.backgroundColor = ''
        probe.style.backgroundColor = p.expr
        const computed = getComputedStyle(probe)
        const resolvedExpression = computed.getPropertyValue('--audit-value').trim()
        const cssComputed = computed.backgroundColor
        const valid = resolvedExpression !== '' && CSS.supports('background-color', resolvedExpression)
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = cssComputed
        ctx.fillRect(0, 0, 1, 1)
        const d = ctx.getImageData(0, 0, 1, 1).data
        return { resolvedExpression, cssComputed, valid, rgb: [d[0], d[1], d[2]], alpha: d[3] }
      })
      probe.remove()
      return values
    }, probes)
    const values = Object.fromEntries(entries.map((p, k) => [p.key, { ...p, ...measured[k] }]))
    const controlResults = controls.map((p, k) => {
      const result = measured[entries.length + k]
      return { ...p, ...result, ok: result.valid === p.expectValid && result.alpha === (p.expectValid ? 255 : 0) }
    })
    return { engine: browser.version(), values, controls: controlResults }
  } finally {
    await browser.close()
  }
}

/** Four required layers for every declared identity; missing expressions never shrink the denominator. */
async function evaluateInRealEngine(expressions) {
  const entries = []
  for (const [token, byIdentity] of expressions) {
    for (const { id, scheme } of themeSource.identities) {
      entries.push({ key: `${id}:${token}`, id, scheme, expr: byIdentity[id] })
    }
  }
  if (BROKEN('layer')) entries[0].expr = 'var(--sanbao-zzz-not-a-real-token)'
  return evaluateEntries(entries)
}

let layerEngine = { available: false, reason: 'explicit --no-browser', engine: null, values: {}, direction: {}, expressions: {} }
if (USE_BROWSER) {
  try {
    const { expressions } = extractLayerExpressions()
    const { engine, values, controls } = await evaluateInRealEngine(expressions)
    const order = LAYER_TOKENS
    const expected = order.length * identities.length
    const failed = Object.entries(values).filter(([, row]) => !row.valid || row.alpha !== 255)
    check('引擎：四层 × 三身份完整解析', Object.keys(values).length === expected && failed.length === 0,
      `${Object.keys(values).length}/${expected}，无效 ${failed.map(([key]) => key).join(', ') || 0}`)
    for (const control of controls) check(`引擎对照：${control.key}`, control.ok, control.cssComputed)
    const direction = {}
    for (const mode of identities) {
      const series = order.map((token) => {
        const entry = values[`${mode}:${token}`]
        return {
          token,
          expr: entry?.expr ?? null,
          cssComputed: entry?.cssComputed ?? null,
          rgb: entry?.rgb ?? null,
          // 与 §3/§4 用的是同一个 WCAG 相对亮度函数，量纲一致才能和别处比较。
          luminance: entry && entry.alpha === 255 ? relativeLuminance(entry.rgb) : null,
        }
      })
      let monotonic = true
      for (let k = 1; k < series.length; k += 1) {
        if (series[k].luminance === null || series[k - 1].luminance === null) { monotonic = null; break }
        if (series[k].luminance <= series[k - 1].luminance) { monotonic = false; break }
      }
      direction[mode] = { series, monotonicIncreasingFromBase: monotonic }
    }
    layerEngine = {
      available: true,
      reason: 'ok',
      engine,
      expected,
      checked: Object.keys(values).length,
      failed: failed.map(([key]) => key),
      identities: themeSource.identities.map(({ id, scheme }) => ({ id, scheme })),
      themeCss,
      sourceFiles: themeSource.sourceFiles,
      controls,
      expressions: Object.fromEntries(expressions),
      values,
      direction,
    }
  } catch (error) {
    require_(false, `真实引擎求值失败（要跳过请显式传 --no-browser）：${error.message}`)
  }
}

// ── §7 派生层是否保住基色的冷暖方向（本次落仓时新发现）──────────────────────
/**
 * 历史故障：旧版 `theme-tokens.ts` 的「向白提亮」写成 `mix("#FFFFFF", n, base)`，即
 * `color-mix(in oklch, #FFFFFF n%, base)`。当时实测（Chrome 153）：
 *
 *   color-mix(in oklch, #FFFFFF 6%, #202420) → rgb(50, 44, 45)   R>G（暖）
 *   color-mix(in srgb,  #FFFFFF 6%, #202420) → rgb(45, 49, 45)   R<G（冷，= 基色方向）
 *   基色 #202420                             → rgb(32, 36, 32)   R<G（冷）
 *
 * 机制：白在 OKLCH 里色相是 `none`，Chrome 把 `none` 带进结果（计算值序列化为
 * `oklch(0.299442 0.00884613 none)`），上色时把缺失色相当 0，于是派生层的冷暖方向
 * **翻转**成暖调，与基色无关。换成 `in srgb` 即保住基色方向。
 *
 * ## 判据为什么不是「色相角之差」
 *
 * 第一版判据是「派生层色相与基色色相之差 ≤ 30°」，实测直接判红 4/4。但那些色相角站不住：
 * 这些中性色的彩度极低（基色 8 位通道差仅 3–4 级），色相角由舍入决定——浅色 layer-2 的
 * 「Δ80°」就是这么来的，是量化噪声而不是缺陷。**低彩度下色相角不是一个可测的量。**
 * 改为问一个在这种彩度下依然稳定的问题：**R−G 的符号（冷暖方向）是否与基色一致**，
 * 并同时给出与 `in srgb` 对照的分级差，让幅度可见。
 *
 * 幅度要如实说：翻转是真的（可复现、方向相反），但当前调色板彩度极低，通道差只有 5–6 级，
 * 视觉上很轻微。它不是本轮「多种蓝色」的主因，是一个独立的小缺陷；真中性调色板
 * （chroma=0）会顺带消掉它，但那是副作用，不是 ADR-0115 的决策理由。
 */
function buildHueIntegrityCases() {
  const cases = []
  for (const [token, pair] of Object.entries(layerEngine.expressions ?? {})) {
    if (!/layer-[23]$/.test(token)) continue
    for (const mode of identities) {
      const expr = layerEngine.values[`${mode}:${token}`]?.resolvedExpression ?? pair[mode]
      if (!expr || !/color-mix\(\s*in oklch\b/.test(expr)) continue
      const operands = expr.match(/#[0-9a-fA-F]{3,8}/g) ?? []
      const reference = operands.find((hex) => !/^#(fff|ffffff)$/i.test(hex))
      require_(reference, `存在 oklch 层级表达式却无法提取参照色：${mode}/${token}；不得当成空射程`)
      cases.push({ token, mode, reference, oklch: expr, srgb: expr.replace('in oklch', 'in srgb') })
    }
  }
  return cases
}

const hueIntegrity = []
// 提升到块外：块内 `const` 在报告组装处不可见（写成块内 `const` 会 ReferenceError）。
let hueIntegrityEngine = null
const hueIntegrityScope = { status: 'skipped', expected: 0, checked: 0, reason: 'explicit --no-browser' }
if (USE_BROWSER && layerEngine.available) {
  const cases = buildHueIntegrityCases()
  Object.assign(hueIntegrityScope, { status: cases.length ? 'measured' : 'no-scope', expected: cases.length,
    reason: cases.length ? 'real layer oklch expressions' : '当前四层 × 三身份无可比较的 oklch 混合项；不合成案例' })
  const entries = []
  for (const c of cases) {
    const identity = themeSource.identities.find(({ id }) => id === c.mode)
    const context = { id: identity.id, scheme: identity.scheme }
    entries.push({ ...context, key: `${c.mode}|${c.token}|ref`, expr: c.reference })
    entries.push({ ...context, key: `${c.mode}|${c.token}|oklch`, expr: c.oklch })
    entries.push({ ...context, key: `${c.mode}|${c.token}|srgb`, expr: c.srgb })
  }
  const { engine: hueEngine, values: rgbByKey, controls = [] } = entries.length
    ? await evaluateEntries(entries) : { engine: null, values: {} }
  hueIntegrityEngine = hueEngine
  if (entries.length) check('色相引擎：全部表达式与对照可用', controls.every((c) => c.ok)
    && Object.values(rgbByKey).every((v) => v.valid && v.alpha === 255), `${Object.keys(rgbByKey).length}/${entries.length}`)
  hueIntegrityScope.checked = cases.length
  const tint = (rgb) => (rgb ? Math.sign(rgb[0] - rgb[1]) : null)
  const spread = (rgb) => (rgb ? Math.max(...rgb) - Math.min(...rgb) : null)
  const channelDelta = (a, b) => (a && b ? Math.max(...a.map((v, k) => Math.abs(v - b[k]))) : null)
  for (const c of cases) {
    const base = `${c.mode}|${c.token}`
    const refRgb = rgbByKey[`${base}|ref`]?.rgb ?? null
    const oklchRgb = rgbByKey[`${base}|oklch`]?.rgb ?? null
    const srgbRgb = rgbByKey[`${base}|srgb`]?.rgb ?? null
    const baseTint = tint(refRgb)
    const oklchTint = tint(oklchRgb)
    const delta = channelDelta(oklchRgb, srgbRgb)
    const tintFlipped = baseTint === null || oklchTint === null ? null : baseTint !== oklchTint
    hueIntegrity.push({
      token: c.token,
      mode: c.mode,
      reference: c.reference,
      expressions: { ref: c.reference, oklch: c.oklch, srgb: c.srgb },
      referenceRgb: refRgb,
      referenceChannelSpread: spread(refRgb),
      oklchRgb,
      oklchChannelSpread: spread(oklchRgb),
      srgbRgb,
      tintFlipped,
      oklchVsSrgbChannelDelta: delta,
      verdict: tintFlipped === null ? 'n/a' : tintFlipped ? `冷暖方向翻转（与 srgb 对照差 ${delta} 级）` : 'ok',
    })
  }
}

// ── 漂移对照 ────────────────────────────────────────────────────────────────
// 基线是**本探针落仓时的实测快照**（不是审计当时的数字）：代码会变，所以漂移只报告不判红。
// 判红的是 `theme-alias-coverage` 门禁。基线的意义是「后来动了多少」，不是「当时是多少」。
//
// 审计当时的一次性数字与落仓实测的差异已逐条归因，写在 ADR-0115 与 Note 里：
//   90 → 79（90 是浅色块的**全部**自定义属性，其中 11 个是 --dsw-specific-*）
//   45 → 44（45 里含 --dsw-specific-menu）
//  315 → 335（硬编码 hex；把未跟踪文件排除后 319，≈审计当时的树）
//   88 → 90（210–239° 桶，并发写入带来 +2）；33 → 34（口径：探针接受 4 位 #rgba）
//  20+ → 18（严格形态；提及总数 24）
const AUDIT_BASELINE = {
  officialLightAlias: 79,
  officialLightCustomProperties: 90,
  consumed: 44,
  consumedIncludingSpecific: 45,
  owned: 19,
  notOwned: 25,
  nearWhiteDistinct: 29,
  hardcodedHexScopeB: 335,
  hexOccurrencesScopeA: 948,
  hexDistinctScopeA: 364,
  blueFamilyDistinct: 90,
  // 原记 33，本探针实测 34：差 1 来自口径——探针接受 4 位 `#rgba`（colors.mjs 只认 3/6/8 位），
  // 桶 120–149° 里恰好多出一个 4 位色值。这是**方法差**不是漂移，所以基线取 34。
  greenFamilyDistinct: 34,
  conflictingFallbackTokens: 18,
  darkScopedSkinLayers: 18,
  darkMentions: 24,
  lightScopedSkinLayers: 0,
}
function buildDrift() {
  const measured = {
    officialLightAlias: coverage.officialLightAlias,
    officialLightCustomProperties: coverage.officialLightCustomProperties,
    consumed: coverage.consumed,
    consumedIncludingSpecific: coverage.consumedIncludingSpecific,
    owned: coverage.owned,
    notOwned: coverage.notOwned.length,
    nearWhiteDistinct: neutralTracks.nearWhite.length,
    hardcodedHexScopeB: hardcoded.hardcoded,
    hexOccurrencesScopeA: hue.occurrences,
    hexDistinctScopeA: hue.distinct,
    // 色相桶宽 30°，起点为 30 的倍数：ADR-0115 记录的「210–239°」即桶 210，
    // 「90–149°」（品牌绿所在）即桶 90 与 120。
    blueFamilyDistinct: hue.buckets.filter(([b]) => b === 210).reduce((s, [, n]) => s + n, 0),
    greenFamilyDistinct: hue.buckets.filter(([b]) => b === 90 || b === 120).reduce((s, [, n]) => s + n, 0),
    conflictingFallbackTokens: fallbacks.conflicting.length,
    darkScopedSkinLayers: asymmetry.darkScoped,
    darkMentions: asymmetry.darkMentions,
    lightScopedSkinLayers: asymmetry.lightScoped,
  }
  return Object.entries(AUDIT_BASELINE)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => ({ metric: k, recorded: v, measured: measured[k], delta: measured[k] - v }))
}

// ── 对比度：本次故障的两个主角色 ────────────────────────────────────────────
const CONTRAST_PROBES = ['--dsw-alias-link', '--dsw-alias-brand-primary']
const contrastTable = []
for (const token of CONTRAST_PROBES) {
  const officialDeclared = lightAlias.get(token)
  if (officialDeclared === undefined) continue
  const officialResolved = resolveStatic(officialDeclared)
  const skinGreen = '#347A2F'
  const skinBaseLight = '#F6F7F4'
  const row = { token, officialDeclared, officialResolved, officialFamily: staticFamily(officialDeclared) }
  for (const [bgName, bg] of [['#FFFFFF', '#FFFFFF'], ['皮肤浅色底 #F6F7F4', skinBaseLight]]) {
    row[`official on ${bgName}`] = contrastRatio(officialResolved, bg)
    row[`品牌绿 on ${bgName}`] = contrastRatio(skinGreen, bg)
  }
  contrastTable.push(row)
}

// ── 报告 ────────────────────────────────────────────────────────────────────
const report = {
  generatedAt: new Date().toISOString(),
  appDir: APP_DIR,
  scope: {
    hexScope: 'packages + shared + dsh-patches，扩展名 css/ts/tsx/js/mjs，排除 node_modules/dist/lib/build/coverage/staging/*.patched/*.min.*。与一次性脚本 colors.mjs 的唯一差别：本探针接受 4 位 #rgba（7 个不同值），colors.mjs 只认 3/6/8 位',
    hardcodedScope: 'packages + shared，扩展名 css/ts/tsx，额外排除 presets.ts 与 *.test.*/*.spec.*；硬编码 = hex 出现数 − token 定义数',
    fallbackScope: 'packages + shared，扩展名 css/ts/tsx，额外排除 presets.ts 与 *.test.*/*.spec.*',
    bluePredicate: BLUE,
  },
  selfTest: SELF_TEST,
  coverage,
  neutralTracks: {
    families: neutralTracks.families,
    nearWhiteDistinct: neutralTracks.nearWhite.length,
    pureWhite: neutralTracks.pureWhite,
    nearWhite: neutralTracks.nearWhite.slice(0, 40),
  },
  hue,
  hardcoded,
  fallbacks: { tokensWithLiteralFallback: fallbacks.tokensWithLiteralFallback, totalVariants: fallbacks.totalVariants, conflicting: fallbacks.conflicting.slice(0, 15), conflictingCount: fallbacks.conflicting.length },
  asymmetry,
  hueIntegrity,
  hueIntegrityEngine,
  hueIntegrityScope,
  contrast: contrastTable,
  layerEngine,
  drift: buildDrift(),
}

mkdirSync(OUT_DIR, { recursive: true })
const reportPath = join(OUT_DIR, 'theme-palette-audit.json')
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

const failed = SELF_TEST.filter((t) => !t.ok)
const line = (s = '') => console.log(s)
line('=== 仪器自检 ===')
for (const t of SELF_TEST) line(`  ${t.ok ? 'ok  ' : 'FAIL'} ${t.name}${t.detail ? `  [${t.detail}]` : ''}`)
if (failed.length > 0) {
  line('')
  console.error(`[palette-audit] 仪器自检未通过 ${failed.length} 项，输出不可信：${failed.map((t) => t.name).join(' / ')}`)
  process.exit(2)
}

line('')
line('=== §1 覆盖（官方消费 vs 本仓接管）===')
line(`官方浅色块自定义属性 ${coverage.officialLightCustomProperties} = alias ${coverage.officialLightAlias} + 非 alias ${coverage.officialLightCustomProperties - coverage.officialLightAlias}`)
line(`官方前端真实消费 ${coverage.consumed} 个 alias（把 --dsw-specific-* 也算上是 ${coverage.consumedIncludingSpecific}）· 本仓接管 ${coverage.owned} · 未接管 ${coverage.notOwned.length}`)
for (const t of coverage.notOwned.slice(0, 12)) line(`  ${String(t.uses).padStart(4)}×  ${t.name.padEnd(50)} ${t.resolved}  [${t.family}]${t.blue ? ' ★蓝' : ''}`)

line('')
line('=== §2 中性双轨（官方浅色 alias 指向哪套尺度）===')
for (const [k, v] of neutralTracks.families) line(`  ${k.padEnd(18)} ${v}`)
line(`本仓近白值（L≥0.88）不同值：${neutralTracks.nearWhite.length} 个（其中纯白 L=1 的 ${neutralTracks.pureWhite} 个——写法不一致，不是色值不一致）`)

line('')
line('=== §3 硬编码 hex 与色相 ===')
line(`口径 A：出现 ${hue.occurrences} 处 · 不同值 ${hue.distinct} 个 · ${JSON.stringify(hue.byFamily)}`)
line(`口径 B（对齐 hardcoded.mjs）：hex 出现 ${hardcoded.hexOccurrences} 处 · token 定义 ${hardcoded.tokenDefs} 个 · **硬编码 ${hardcoded.hardcoded} 处** · token 引用 ${hardcoded.varRefs} 处 · token 化率 ${hardcoded.tokenizationRate}%`)
line('色相直方图（仅彩色）：')
for (const [b, n] of hue.buckets) line(`  ${String(b).padStart(3)}-${b + 29}°  ${'#'.repeat(Math.min(n, 60))} ${n}`)

line('')
line('=== §4 同一 token 的多种字面兜底 ===')
line(`带字面兜底的 token ${fallbacks.tokensWithLiteralFallback} 个 · 有冲突的 ${fallbacks.conflicting.length} 个 · 冲突变体合计 ${fallbacks.totalVariants} 种`)
for (const c of fallbacks.conflicting.slice(0, 8)) line(`  ${c.token.padEnd(48)} ${c.variants.length} 种  ${c.variants.map((v) => v.value).join(' ')}`)

line('')
line('=== §5 深浅不对称 ===')
line(`深色专用整改层（body[data-ds-dark-theme]:not([data-dsh-skin])）${asymmetry.darkScoped} 条 · 浅色对应形态 ${asymmetry.lightScoped} 条 · 非 node_modules 的 CSS 里 data-ds-dark-theme 提及 ${asymmetry.darkMentions} 处`)
for (const [f, c] of asymmetry.perFile) line(`  ${f}  深=${c.darkScoped} 浅=${c.lightScoped} 总提及=${c.any}`)

line('')
line('=== §6 层级方向（真实引擎求值 color-mix）===')
line(`  求值引擎：${layerEngine.engine ?? '<未记录>'}（产品跑在 Electron 自带 Chromium 上，跨引擎对照见 theme-engine-crosscheck.mjs）`)
if (!layerEngine.available) {
  line(`  未测量：${layerEngine.reason}`)
} else {
  for (const mode of identities) {
    const d = layerEngine.direction[mode]
    line(`  ${mode}：从 base 起单调递增 = ${d.monotonicIncreasingFromBase}`)
    for (const s of d.series) {
      line(`    ${s.token.padEnd(26)} ${s.expr ?? '<n/a>'}`)
      line(`      ${' '.repeat(24)}→ ${s.rgb ? `rgb(${s.rgb.join(', ')})` : '<unresolved>'}  相对亮度 ${s.luminance === null ? '<n/a>' : s.luminance.toFixed(4)}`)
    }
  }
  const l = layerEngine.direction.light.monotonicIncreasingFromBase
  const d = layerEngine.direction.dark.monotonicIncreasingFromBase
  line(`  → 结论：浅色单调递增 = ${l}，深色 = ${d}；两态方向${l === d ? '**一致**' : '**相反**'}`)
}

line('')
line('=== §7 派生层冷暖方向（color-mix 是否保住基色方向）===')
if (hueIntegrity.length === 0) {
  line(`  ${hueIntegrityScope.status}：${hueIntegrityScope.reason}（${hueIntegrityScope.checked}/${hueIntegrityScope.expected}）`)
} else {
  for (const r of hueIntegrity) {
    const fmt = (rgb) => (rgb ? `rgb(${rgb.join(', ')})` : '<unresolved>')
    line(`  ${r.mode}:${r.token}`)
    line(`      基色 ${r.reference.padEnd(9)} ${fmt(r.referenceRgb).padEnd(20)} 通道差 ${r.referenceChannelSpread}`)
    line(`      in oklch          ${fmt(r.oklchRgb).padEnd(20)} 通道差 ${r.oklchChannelSpread}  ← ${r.verdict}`)
    line(`      in srgb（对照）    ${fmt(r.srgbRgb).padEnd(20)} 与 oklch 最大通道差 ${r.oklchVsSrgbChannelDelta}`)
  }
}

line('=== 对比度（WCAG 2.x）===')
for (const row of contrastTable) {
  line(`  ${row.token}：官方 ${row.officialResolved} [${row.officialFamily}]`)
  for (const [k, v] of Object.entries(row)) if (k.includes(' on ')) line(`    ${k.padEnd(34)} ${v.toFixed(2)}:1`)
}

line('')
line('=== 与 ADR-0115 记录值的偏移 ===')
for (const d of report.drift) {
  const flag = d.delta === 0 ? '  ' : d.delta > 0 ? '↑ ' : '↓ '
  line(`  ${flag}${d.metric.padEnd(24)} 记录 ${String(d.recorded).padStart(5)}  实测 ${String(d.measured).padStart(5)}`)
}

line('')
line(`[palette-audit] 报告已写入 ${reportPath}`)
line('[palette-audit] 五组取证均已完成（退出码 0 只表示「测量成立」，不表示「颜色合格」——合格判据在 ADR-0115 的 theme-alias-coverage 门禁）')
process.exit(0)
