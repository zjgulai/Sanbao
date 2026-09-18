/**
 * Real-layout geometry probe for the stacked sidebar entry.
 *
 * ## Why this file exists
 *
 * The package's vitest suite runs in jsdom, which **performs no layout**: every
 * `getBoundingClientRect()` returns zeros, so those tests can only check which
 * marker attribute the core writes in which shell state. The claims that
 * actually matter to the user — 「新建会话」and「新应用」read as two rows of one
 * nav column, both sitting on the nav row axis, the launch band taking exactly
 * two row advances, and unmounting restoring the shell — are claims about the
 * browser's layout engine, and only a browser can settle them.
 *
 * So this probe drives **real Google Chrome** over the DevTools protocol and
 * measures real boxes. Two things keep it honest:
 *
 *  1. **The shell's CSS is extracted from the shipped bundle, never retyped.**
 *     A hand-written replica of the stylesheet would drift from the shell
 *     silently and turn this probe into a test of my own assumptions.
 *  2. **Missing preconditions fail loudly.** No Chrome, or no DSH app to read
 *     the stylesheet from, exits non-zero with the reason — it never skips to a
 *     green result (the failure mode A5 was opened for).
 *
 * It is deliberately NOT part of `pnpm test`: it needs a real browser and the
 * installed app, so it runs on demand as the acceptance artifact for the
 * sidebar-row contract.
 *
 * Usage: `node scripts/geometry-probe.mjs`
 * @module dsh-newapp-local/scripts/geometry-probe
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP_DIR = '/Applications/DSH Desktop.app'
/**
 * Where the shipped sidebar stylesheet may live.
 *
 * Two layouts are in the wild and both must be tried: the app used to ship the
 * package **unpacked** beside `app.asar` (`Contents/Resources/app.asar.unpacked/
 * node_modules/…`), the 2.0 build ships it under `Contents/Resources/app/
 * node_modules/…`. Hard-coding one path made this probe un-runnable the moment
 * the app was upgraded — it exited 2 with "找不到官方侧边栏 bundle", which is the
 * honest failure, but a probe that cannot run is not an instrument.
 */
const SIDEBAR_BUNDLE_CANDIDATES = [
  join(APP_DIR, 'Contents', 'Resources', 'app', 'node_modules', '@deepseek-ai',
    'dsh-client-ui-sidebar', 'lib', 'client.js'),
  join(APP_DIR, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules',
    '@deepseek-ai', 'dsh-client-ui-sidebar', 'lib', 'client.js'),
]

/** Fail with a reason instead of reporting a green result on a missing precondition. */
function require_(condition, message) {
  if (!condition) {
    console.error(`geometry-probe: ${message}`)
    process.exit(2)
  }
}

const SIDEBAR_BUNDLE = SIDEBAR_BUNDLE_CANDIDATES.find((candidate) => existsSync(candidate))
require_(SIDEBAR_BUNDLE !== undefined,
  `找不到官方侧边栏 bundle，已试：${SIDEBAR_BUNDLE_CANDIDATES.join('、')}（DSH Desktop 未安装，或包布局又变了）`)

/** Pull the shell's own CSS-module text and class map out of the shipped bundle. */
function readShellStyles() {
  const source = readFileSync(SIDEBAR_BUNDLE, 'utf8')
  // The bundle embeds the compiled CSS module as `{ "hash_local": "hash_local", … }`
  // next to the stylesheet string. The stylesheet is the long string containing
  // the `_root{` rule; find it rather than guessing an offset.
  // Class-hash prefixes ship in both `x-xxxx` and bare `xxxx` shapes (2.0
  // rebuild dropped the `x-`); take either rather than pinning one.
  const match = /"(\.(?:x-)?[A-Za-z0-9_-]+_root\{[^"]*)"/.exec(source)
  require_(match !== null, '在官方 bundle 里定位不到侧边栏样式表（提取方式已失效）')
  const css = match[1].replace(/\\"/g, '"')
  const prefixMatch = /((?:x-)?[A-Za-z0-9_-]+)_root\s*\{/.exec(css)
  require_(prefixMatch !== null, '解析不出类名前缀（样式表形状已变，提取方式需更新）')
  const prefix = prefixMatch[1]
  // The row form leans on the shell's token layer for its type; a fixture that
  // leaves `--dsw-font-xs-13` undefined would silently measure the browser's
  // default font instead of the row's own and report a passing "looks fine".
  // The token's home is the **theme** bundle (Law 1: only names the official
  // theme bundle declares are safe); the 2.0 sidebar bundle no longer carries
  // the font layer at all, so checking `source` here would be checking the
  // wrong file.
  const themeCandidates = [
    join(APP_DIR, 'Contents', 'Resources', 'app', 'node_modules', '@deepseek-ai',
      'dsh-client-ui-theme', 'lib', 'client.js'),
    join(APP_DIR, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules',
      '@deepseek-ai', 'dsh-client-ui-theme', 'lib', 'client.js'),
  ].find((candidate) => existsSync(candidate))
  require_(themeCandidates !== undefined, '找不到官方主题 bundle（DSH Desktop 未安装，或包布局又变了）')
  const themeSource = readFileSync(themeCandidates, 'utf8')
  require_(themeSource.includes('--dsw-font-xs-13'),
    '官方主题 bundle 里没有 --dsw-font-xs-13 —— 行高/字号这套 token 已改名，夹具会量到错字号')
  return { css, prefix }
}

/**
 * Transpile the shared entry core to a plain browser script exposing `__entryCore`.
 *
 * Compiled with the package's own declared `typescript` rather than a bundler:
 * the core is a single dependency-free module, so `transpileModule` is the whole
 * job, and reaching for esbuild would have added a devDependency that exists in
 * the tree only transitively (a phantom dependency, which is its own bug class).
 * @returns {string} script text assigning `window.__entryCore`
 */
function buildCore() {
  const tsPath = join(PACKAGE_ROOT, 'node_modules', 'typescript')
  require_(existsSync(tsPath), '找不到 typescript（先在该包内跑 pnpm install）')
  const ts = createRequire(import.meta.url)(tsPath)
  const source = readFileSync(join(PACKAGE_ROOT, 'src', 'client', 'sidebar-entry-core.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: 'sidebar-entry-core.ts',
  })
  return `window.__entryCore = (function(){ const exports = {};\n${outputText}\nreturn exports })();`
}

const { css: shellCss, prefix: P } = readShellStyles()
const coreScript = buildCore()
// The package's own module CSS: used verbatim (local class names intact) so no
// CSS-modules transform is needed for the probe.
const entryCss = readFileSync(join(PACKAGE_ROOT, 'src', 'client', 'newapp.module.css'), 'utf8')

/**
 * The fixture reproduces the shell's sidebar skeleton from the real bundle's
 * class names: column > root > [logoRow, newSession, regionArea].
 *
 * The official button carries an icon like the real shell does (`IconNewChat
 * Outline16`, rendered at 14px when expanded) — the row rule widens it to the
 * sibling rows' 24px icon box, and that only becomes measurable if the icon is
 * actually there.
 * @returns {string} the fixture HTML
 */
function fixture() {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%}
  body{display:flex;height:100vh;--dsw-font-family:system-ui;--dsw-font-xs-13:13px/20px system-ui;
       --lute-brand:#58b848;--lute-brand-deep:#3e9b33;--lute-brand-tint:rgba(88,184,72,.08);
       --lute-brand-line:rgba(88,184,72,.45);--lute-brand-line-strong:rgba(88,184,72,.7);
       --dsw-alias-label-primary:#111;--dsw-alias-label-secondary:#666;
       --dsw-alias-border-l3:rgba(0,0,0,.14);--dsw-alias-button-elevated-fill:rgba(0,0,0,.03);
       --dsw-alias-button-floating-hover:rgba(0,0,0,.06);--dsw-alias-interactive-bg-hover:rgba(0,0,0,.05);
       --dsw-alias-state-business-primary:#3e9b33;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f4f4f4;
       --dsw-alias-bg-base:#fff;--dsw-alias-label-caption:#8a8a8a;--dsw-alias-border-l1:rgba(0,0,0,.07);
       --dsw-alias-border-l2:rgba(0,0,0,.12);--dsw-alias-state-error-primary:#c0392b}
  /* ── the shell's own stylesheet, extracted verbatim from the shipped bundle ── */
  ${shellCss}
  /* ── this package's entry styles ── */
  ${entryCss}
  /* Motion is not under test here — and transition:background 180ms on the
     row rules would make the *computed* background at measurement time a
     mid-flight interpolation of the pre-mount fill, i.e. a race against 180ms.
     Freeze it so the probe measures the settled style, not a stopwatch.
     (No backticks in this comment: it lives inside a template literal.) */
  *,*::before,*::after{transition:none !important;animation:none !important}
  #column{width:280px;display:flex;flex-direction:column}
</style></head>
<body>
  <div id="column" data-pane="sidebar">
    <div class="${P}_root">
      <div class="${P}_logoRow"></div>
      <button type="button" class="${P}_newSession">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M8 3v10M3 8h10"/></svg>
        <span class="${P}_newSessionLabel">新建会话</span>
      </button>
      <div class="${P}_regionArea"><div style="height:400px">工作区</div></div>
      <div class="${P}_footArea"></div>
    </div>
  </div>
  <script>${coreScript}</script>
</body></html>`
}

/** Locate a Playwright install (npx cache) without adding it as a dependency. */
async function loadPlaywright() {
  const { stdout } = await import('node:child_process').then((m) => new Promise((resolve, reject) => {
    m.execFile('bash', ['-lc', 'ls -d ~/.npm/_npx/*/node_modules/playwright 2>/dev/null | head -5'],
      (error, out) => (error ? reject(error) : resolve({ stdout: out })))
  }))
  const candidates = stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  require_(candidates.length > 0, '找不到 playwright（本探针只借用 npx 缓存里的安装，不作为依赖）')
  for (const dir of candidates) {
    try {
      return await import(join(dir, 'index.mjs'))
    } catch { /* try the next candidate */ }
  }
  require_(false, `playwright 存在于 ${candidates.join('、')} 但都导入失败`)
}

/** Measure one element's box and the style facts the row contract names. */
const BOX = `(sel) => { const el = document.querySelector(sel); if (!el) return null;
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom,
           radius:cs.borderRadius, fontSize:cs.fontSize, fontWeight:cs.fontWeight,
           marginTop:parseFloat(cs.marginTop)||0, marginBottom:parseFloat(cs.marginBottom)||0,
           marginLeft:parseFloat(cs.marginLeft)||0, paddingLeft:parseFloat(cs.paddingLeft)||0,
           borderStyle:cs.borderTopStyle, borderWidth:parseFloat(cs.borderTopWidth)||0,
           background:cs.backgroundColor, justifyContent:cs.justifyContent } }`

const results = []
/** Record one assertion. */
function check(name, ok, detail) {
  results.push({ name, ok, detail })
}

const pw = await loadPlaywright()
const browser = await pw.chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
require_(await page.setContent(fixture(), { waitUntil: 'load' }).then(() => true).catch(() => false),
  '夹具未能载入 Chrome')

const OFFICIAL = `button[class*="newSession"]`
const ENTRY = `[data-dsh-newapp-entry]`
const OFFICIAL_LABEL = `[class*="newSessionLabel"]`
const ENTRY_LABEL = `[class*="entryLabel"]`

// ── Baseline: the shell's own launch button, before we touch it ───────────────
const before = await page.evaluate(({ box, official }) => {
  const root = document.querySelector('[class*="_root"]')
  const region = document.querySelector('[class*="_regionArea"]')
  const rs = getComputedStyle(root)
  const rootRect = root.getBoundingClientRect()
  return {
    rootH: rootRect.height,
    rootContentLeft: rootRect.left + parseFloat(rs.paddingLeft),
    rootContentW: rootRect.width - parseFloat(rs.paddingLeft) - parseFloat(rs.paddingRight),
    regionTop: region.getBoundingClientRect().top,
    regionH: region.getBoundingClientRect().height,
    official: eval(box)(official),
  }
}, { box: BOX, official: OFFICIAL })

// ── Mount through the real core ───────────────────────────────────────────────
const mounted = await page.evaluate(({ official, entry }) => {
  const dispose = window.__entryCore.mountSidebarEntry({
    rowAttribute: 'data-dsh-newapp-entry',
    rowSelector: '[data-dsh-newapp-entry]',
    plugin: 'newapp-local',
    icon: '<svg viewBox="0 0 16 16" width="18" height="18"><rect x="2" y="2" width="12" height="12" fill="currentColor"/></svg>',
    css: { entry: 'entry', entryIcon: 'entryIcon', entryLabel: 'entryLabel' },
    label: () => '新应用',
    onToggle: () => {},
    position: 'stacked',
    familySelectors: ['[data-dsh-newapp-entry]'],
  })
  window.__dispose = dispose
  return document.querySelector(entry) !== null
}, { official: OFFICIAL, entry: ENTRY })

check('入口已挂载', mounted, mounted ? '' : '核心未插入入口行')

const after = await page.evaluate(({ box, official, entry, officialLabel, entryLabel }) => {
  const root = document.querySelector('[class*="_root"]')
  const region = document.querySelector('[class*="_regionArea"]')
  const entryEl = document.querySelector(entry)
  const officialEl = document.querySelector(official)
  const rs = getComputedStyle(root)
  const rootRect = root.getBoundingClientRect()
  return {
    rootH: rootRect.height,
    rootContentLeft: rootRect.left + parseFloat(rs.paddingLeft),
    rootContentW: rootRect.width - parseFloat(rs.paddingLeft) - parseFloat(rs.paddingRight),
    regionTop: region.getBoundingClientRect().top,
    regionH: region.getBoundingClientRect().height,
    official: eval(box)(official),
    entry: eval(box)(entry),
    officialIcon: eval(box)(`${official} svg`),
    prevIsOfficial: entryEl.previousElementSibling === officialEl,
    marker: officialEl.hasAttribute('data-lute-navrow'),
    split: entryEl.dataset.split,
    plugin: entryEl.getAttribute('data-dsh-plugin'),
    text: entryEl.textContent,
    officialLabelX: document.querySelector(officialLabel).getBoundingClientRect().x,
    entryLabelX: document.querySelector(entryLabel).getBoundingClientRect().x,
  }
}, { box: BOX, official: OFFICIAL, entry: ENTRY, officialLabel: OFFICIAL_LABEL, entryLabel: ENTRY_LABEL })

// ── The contract the user actually asked for ──────────────────────────────────
// D2 (locked 2026-09-19): 「新建会话」and「新应用」are two plain nav rows of one
// column, not two capsules sharing a band.

check('入口是官方按钮的紧邻下一兄弟（同一列，中间无别人）', after.prevIsOfficial,
  after.prevIsOfficial ? '' : '中间夹了别的节点')

check('官方按钮被标记为 nav 行（data-lute-navrow 是行样式表的唯一锚）', after.marker,
  after.marker ? '' : '核心没写标记，行样式表一条也不会生效')

const stacked = after.entry.y >= after.official.bottom - 0.6 && after.entry.y > after.official.y + 1
check('两行上下堆叠（官方在上，自建在下）', stacked,
  `官方 top=${after.official.y.toFixed(1)} bottom=${after.official.bottom.toFixed(1)}，自建 top=${after.entry.y.toFixed(1)}`)

// The two rows are adjacent: the 4px between the boxes is the rows' own 2px+2px
// vertical margins (the native nav row rhythm), not leftover button chrome.
const rowGap = after.entry.y - after.official.bottom
check('两行相邻间距 = 两行各自 2px 上下边距（原生行节奏）', Math.abs(rowGap - 4) < 0.6,
  `实测 ${rowGap.toFixed(2)}px（期望 4px）`)

check('两行等高 36px（与岗位矩阵 / 技能中心同一行高）',
  Math.abs(after.official.height - 36) < 0.6 && Math.abs(after.entry.height - 36) < 0.6,
  `官方 ${after.official.height.toFixed(1)}px 自建 ${after.entry.height.toFixed(1)}px`)

// The nav row axis (ADR-0079, gate sidebar-row-axis): every row in the nav column
// spans the root's content box — margin-inline 0, width 100%, border-box.
check('两行同宽 = root 内容宽（行轴：margin-inline 0 + width 100%）',
  Math.abs(after.official.width - after.rootContentW) < 0.6
  && Math.abs(after.entry.width - after.rootContentW) < 0.6,
  `官方 ${after.official.width.toFixed(2)}px 自建 ${after.entry.width.toFixed(2)}px vs root 内容宽 ${after.rootContentW.toFixed(2)}px`)

check('两行左缘对齐 root 内容左缘',
  Math.abs(after.official.x - after.rootContentLeft) < 0.6
  && Math.abs(after.entry.x - after.rootContentLeft) < 0.6,
  `官方 x=${after.official.x.toFixed(2)} 自建 x=${after.entry.x.toFixed(2)} vs ${after.rootContentLeft.toFixed(2)}`)

// De-button-ification (D2): the launch row must stop looking like a filled control.
check('官方按钮已去外壳：无边框 / 透明底 / 8px 圆角',
  after.official.borderStyle === 'none' && after.official.background === 'rgba(0, 0, 0, 0)'
  && after.official.radius === '8px',
  `border=${after.official.borderStyle} bg=${after.official.background} radius=${after.official.radius}`)

check('官方按钮改为左对齐文本行（justify-content: flex-start）',
  after.official.justifyContent === 'flex-start', `justify-content=${after.official.justifyContent}`)

check('自建行同样是去壳文本行',
  after.entry.borderStyle === 'none' && after.entry.background === 'rgba(0, 0, 0, 0)'
  && after.entry.radius === '8px',
  `border=${after.entry.borderStyle} bg=${after.entry.background} radius=${after.entry.radius}`)

check('两行字号一致（同一 token：13px）',
  after.official.fontSize === '13px' && after.entry.fontSize === '13px',
  `官方 ${after.official.fontSize} 自建 ${after.entry.fontSize}`)

check('官方图标被规范到 24px 图标盒（否则标签与自建行错位）',
  Math.abs(after.officialIcon.width - 24) < 0.6 && Math.abs(after.officialIcon.height - 24) < 0.6,
  `图标 ${after.officialIcon.width.toFixed(1)}×${after.officialIcon.height.toFixed(1)}`)

const labelDelta = Math.abs((after.officialLabelX - after.official.x) - (after.entryLabelX - after.entry.x))
check('两行标签同一 x（padding 10 + 图标盒 24 + gap 8）', labelDelta < 0.6,
  `官方标签偏 ${(after.officialLabelX - after.official.x).toFixed(2)}px，自建 ${(after.entryLabelX - after.entry.x).toFixed(2)}px`)

// ── The band's vertical cost, derived rather than hard-coded ──────────────────
// Before mounting, the shell's own button advances the column by height 38 +
// margin-bottom 8. After mounting, the band advances by two nav rows (h 36 +
// marg 2+2 each). The region below must therefore move down by exactly the
// difference — the number is computed from the two measurements, so a change in
// the shell's own metrics shows up here instead of being absorbed.
const advance = (b) => b.height + b.marginTop + b.marginBottom
const bandAfter = advance(after.official) + advance(after.entry)
const bandBefore = advance(before.official)
const shift = after.regionTop - before.regionTop
check('启动带 = 两行各自的行进量（36+2+2 各一）', Math.abs(bandAfter - 80) < 0.6,
  `${advance(after.official).toFixed(1)} + ${advance(after.entry).toFixed(1)} = ${bandAfter.toFixed(1)}px`)
check('下方工作区正好下移「启动带 − 原按钮行进量」',
  Math.abs(shift - (bandAfter - bandBefore)) < 0.6,
  `下移 ${shift.toFixed(2)}px（期望 ${(bandAfter - bandBefore).toFixed(2)}px = ${bandAfter.toFixed(1)} − ${bandBefore.toFixed(1)}）`)
// The 2.0 shell pins the sidebar root to `height: 100%`, so the band can no
// longer grow the column — the shift is absorbed by the flexible region
// (`regionArea { flex: 1; min-height: 0 }` shrinks by exactly the shift).
// Asserting root growth here would be asserting against a stylesheet premise
// that no longer exists.
check('工作区正好吸收下移量（root 固定高，flex:1 的 region 等高收缩）',
  Math.abs((before.regionH - after.regionH) - shift) < 0.6,
  `region 高 ${before.regionH.toFixed(1)} → ${after.regionH.toFixed(1)}（吸收 ${(before.regionH - after.regionH).toFixed(2)}px，应 ${shift.toFixed(2)}px）`)

// ── Collapsed rail: the row form must yield to the shell's icon rail ──────────
const collapsed = await page.evaluate(({ box, official, entry, rootCls, collapsedCls }) => {
  const root = document.querySelector('.' + rootCls)
  if (root === null) throw new Error('找不到侧边栏 root：' + rootCls)
  // A real collapse narrows the sidebar column; that width change is exactly
  // what the core's ResizeObserver keys on. Toggling the class alone changes no
  // box, so it would never fire — which is what the first draft of this probe
  // did, and it reported a false failure for every collapsed assertion.
  document.getElementById('column').style.width = '60px'
  root.classList.add(collapsedCls)
  // Two frames: one for the ResizeObserver callback, one for the resulting layout.
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const entryEl = document.querySelector(entry)
    const officialEl = document.querySelector(official)
    const icon = entryEl.querySelector('[class*="entryIcon"]')
    resolve({
      official: eval(box)(official), entry: eval(box)(entry),
      icon: icon === null ? null : eval(box)('[data-dsh-newapp-entry] [class*="entryIcon"]'),
      split: entryEl.dataset.split,
      marker: officialEl.hasAttribute('data-lute-navrow'),
      labelVisible: getComputedStyle(entryEl.querySelector('[class*="entryLabel"]')).display !== 'none',
    })
  })))
}, { box: BOX, official: OFFICIAL, entry: ENTRY, rootCls: `${P}_root`, collapsedCls: `${P}_collapsed` })

check('收起态转 data-split="collapsed"', collapsed.split === 'collapsed', `dataset.split=${collapsed.split}`)
check('收起态撤掉官方按钮的 nav 行标记（行样式表整体让位）', !collapsed.marker,
  collapsed.marker ? '标记还在，官方 rail 图标键会被行样式表改坏' : '')
check('收起态官方按钮回到自己的 rail 形态（36×36，边框由官方样式表管）',
  Math.abs(collapsed.official.width - 36) < 0.6 && Math.abs(collapsed.official.height - 36) < 0.6,
  `${collapsed.official.width.toFixed(1)}×${collapsed.official.height.toFixed(1)}`)
check('收起态自建行 36×36（沿用官方 rail 度量）',
  Math.abs(collapsed.entry.width - 36) < 0.6 && Math.abs(collapsed.entry.height - 36) < 0.6,
  `${collapsed.entry.width.toFixed(1)}×${collapsed.entry.height.toFixed(1)}`)
check('收起态自建行在官方按钮下方（rail 里两个图标上下排列）',
  collapsed.entry.y > collapsed.official.y + 1,
  `官方 top=${collapsed.official.y.toFixed(1)} 自建 top=${collapsed.entry.y.toFixed(1)}`)
const iconFits = collapsed.icon === null ? false
  : collapsed.icon.width <= collapsed.entry.width + 0.6 && collapsed.icon.height <= collapsed.entry.height + 0.6
check('收起态图标不被切', iconFits,
  collapsed.icon === null ? '找不到图标' : `图标 ${collapsed.icon.width.toFixed(1)}×${collapsed.icon.height.toFixed(1)} ⊂ 行 ${collapsed.entry.width.toFixed(1)}×${collapsed.entry.height.toFixed(1)}`)
check('收起态隐藏文案（36px 放不下「新应用」）', !collapsed.labelVisible, '')

// ── Unmount restores the shell exactly ────────────────────────────────────────
const restored = await page.evaluate(({ box, official, rootCls, collapsedCls }) => {
  // Return the shell to its expanded layout first: measuring the disposer while
  // the shell is still collapsed would report the collapsed box as a failure of
  // unmounting.
  document.getElementById('column').style.width = '280px'
  document.querySelector('.' + rootCls).classList.remove(collapsedCls)
  window.__dispose()
  const officialEl = document.querySelector(official)
  return { official: eval(box)(official), marker: officialEl.hasAttribute('data-lute-navrow'),
           entry: document.querySelector('[data-dsh-newapp-entry]') }
}, { box: BOX, official: OFFICIAL, rootCls: `${P}_root`, collapsedCls: `${P}_collapsed` })

check('卸载后官方按钮的 nav 行标记已删除', !restored.marker, '')
check('卸载后官方按钮尺寸/边框/底色/圆角全部还原',
  Math.abs(restored.official.height - before.official.height) < 0.6
  && Math.abs(restored.official.borderWidth - before.official.borderWidth) < 0.01
  && restored.official.background === before.official.background
  && restored.official.radius === before.official.radius,
  `高 ${before.official.height} → ${restored.official.height}，边框 ${before.official.borderWidth} → ${restored.official.borderWidth}，底 ${before.official.background} → ${restored.official.background}，圆角 ${before.official.radius} → ${restored.official.radius}`)
check('卸载后入口行已移除', restored.entry === null, '')

/* ── The product matrix: the grid's real column count (M3) ────────────────────
 *
 * Why this is measured here and not in `pnpm test`: the claim is 「大卡片的矩阵
 * 形式」, which is a statement about how many cards fit on a line. jsdom performs no
 * layout, so a unit test there would compare zero against zero and pass forever.
 *
 * Why a **synthetic fixture** rather than the real page: this machine declares
 * exactly one product, so the live page can only ever show one column. A grid
 * assertion against real data would be unfalsifiable — it would hold for a flex
 * column too. So the fixture declares four, and NC3 below declares one and
 * requires the same assertion to FAIL.
 *
 * The stylesheet is extracted verbatim from the built bundle, exactly as the
 * sidebar section does: retyping it here would turn this probe into a test of my
 * own transcription.
 */

const CLIENT_BUNDLE = join(PACKAGE_ROOT, 'lib', 'client.js')
require_(existsSync(CLIENT_BUNDLE), `找不到构建产物 ${CLIENT_BUNDLE}——先跑 pnpm run build`)

const clientSource = readFileSync(CLIENT_BUNDLE, 'utf8')
const gridPrefixMatch = /\.([A-Za-z0-9_]+)_grid\{/.exec(clientSource)
require_(gridPrefixMatch !== null, '在 lib/client.js 里定位不到 .grid 规则（样式表已不再内联？提取方式失效）')
const M = gridPrefixMatch[1]

/**
 * The compiled stylesheet, decoded out of the bundle's JS string literal.
 *
 * **Do not "simplify" this to `indexOf('"')`.** The first draft did, and it
 * silently truncated the sheet at 1.4 KB — because the CSS contains
 * `content:\"\"` for the header's decorative rule, i.e. an *escaped* quote inside
 * the literal. The truncated sheet then failed to parse as CSS, so **every** rule
 * was dropped, the grid fell back to `display:block`, and the probe reported
 * "1 column". That is a green-looking number produced by a broken instrument.
 *
 * So: scan for the first *unescaped* `"`, decode the literal with `JSON.parse`
 * (JS string escaping is JSON-compatible for everything a CSS sheet contains),
 * and then assert the two things that prove the sheet arrived whole.
 * @param source - the bundle text.
 * @param prefix - the CSS-module class prefix.
 * @returns the decoded stylesheet.
 */
function embeddedStylesheet(source, prefix) {
  const firstClass = `.${prefix}_root`
  const at = source.indexOf(firstClass)
  require_(at >= 0, `bundle 里找不到 ${firstClass}`)
  const start = source.lastIndexOf('"', at) + 1
  require_(start > 0, '定位不到样式表字符串的起点（提取方式失效）')
  let end = -1
  for (let i = at; i < source.length; i += 1) {
    if (source[i] === '\\') { i += 1; continue }
    if (source[i] === '"') { end = i; break }
  }
  require_(end > start, '定位不到样式表字符串的终点（提取方式失效）')
  try {
    return JSON.parse(`"${source.slice(start, end)}"`)
  } catch (error) {
    require_(false, `样式表字符串解码失败：${String(error)}`)
  }
}

const matrixCss = embeddedStylesheet(clientSource, M)

// 完整性自检：截断的样式表会被浏览器整块丢弃，于是**每条规则都不生效**，
// 而量出来的列数还是 1 —— 一个由坏仪器产出的、看起来合理的数字。
require_(matrixCss.includes(`.${M}_grid{`), '提取到的样式表里没有 .grid 规则——截断了')
require_(matrixCss.includes('display:grid') || matrixCss.includes('display: grid'),
  '提取到的样式表里没有 display:grid——截断了，M3 会量出一个假的 1 列')
require_(matrixCss.length > 8000, `提取到的样式表只有 ${matrixCss.length} 字符，明显不完整`)

/** One card's markup, mirroring what the component emits. */
function card(i) {
  return `<li class="${M}_card" data-dsh-part="product-card">
    <div class="${M}_cardHead"><h4 class="${M}_cardLabel">产品 ${i}</h4><span class="${M}_cardDir">/Users/lute/project/P${i}</span></div>
    <p class="${M}_cardSummary">第 ${i} 个产品的说明</p>
    <div class="${M}_cardMeta"><span class="${M}_chipMuted">草案</span><span class="${M}_chip">岗位 agt-00${i}</span></div>
    <div class="${M}_action"><button class="${M}_primary">打开</button></div>
  </li>`
}

/** A panel body of a given width holding `n` cards. */
function matrixFixture(n) {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%}
  body{--dsw-alias-label-primary:#0f1115;--dsw-alias-label-secondary:#61666b;--dsw-alias-label-caption:#adb2b8;
       --dsw-alias-border-l1:rgba(0,0,0,.04);--dsw-alias-border-l2:rgba(0,0,0,.1);--dsw-alias-bg-base:#fff;
       --dsw-alias-bg-module-platform:#f5f6f7;--dsw-alias-button-primary-fill:#0f1115;
       --dsw-alias-label-primary-foreground:#fff;--dsw-alias-state-success-primary:#22c55e;
       --dsw-alias-state-success-tertiary:#e6faed;--dsw-font-xxxs-11:400 11px/14px system-ui;
       --dsw-font-xxs-12:400 12px/16px system-ui;--dsw-font-base-strong-16:600 16px/24px system-ui}
  ${matrixCss}
  #matrixBody{box-sizing:border-box;padding:20px;width:100%}
  </style></head><body>
  <div id="matrixBody"><ul class="${M}_grid" data-dsh-part="product-cards">${Array.from({ length: n }, (_, i) => card(i + 1)).join('')}</ul></div>
  </body></html>`
}

/*
 * What gets measured, and why it is **cards per row** rather than track count.
 *
 * The first draft of NC3 compared `grid-template-columns` track counts and
 * demanded that a one-card fixture report a single track. It reported four — and
 * it was right to. `repeat(auto-fill, minmax(280px, 1fr))` creates as many tracks
 * as *fit*, empty ones included, so the track count is a property of the
 * **viewport**, not of the card count. The assertion was measuring the wrong
 * thing and would have been satisfied by any grid at any card count.
 *
 * "How many cards share the first row" is the property the user actually asked
 * for (「矩阵形式」), it varies with the card count, and it is therefore
 * falsifiable in both directions.
 */
const MEASURE = `() => {
  const grid = document.querySelector('[data-dsh-part="product-cards"]')
  const tracks = getComputedStyle(grid).gridTemplateColumns.split(' ').filter((t) => t !== '').length
  const cards = [...grid.querySelectorAll('[data-dsh-part="product-card"]')]
  const boxes = cards.map((el) => el.getBoundingClientRect())
  const firstTop = boxes[0].top
  const perRow = boxes.filter((b) => Math.abs(b.top - firstTop) < 0.6).length
  const rows = new Set(boxes.map((b) => Math.round(b.top))).size
  const g = grid.getBoundingClientRect()
  return { tracks, perRow, rows, cardCount: cards.length,
           gridW: g.width, cardW: boxes[0].width, cardH: boxes[0].height }
}`

async function measureMatrix(n, viewportWidth) {
  const page2 = await browser.newPage({ viewport: { width: viewportWidth, height: 900 } })
  await page2.setContent(matrixFixture(n), { waitUntil: 'load' })
  const m = await page2.evaluate(eval(`(${MEASURE})`))
  await page2.close()
  return m
}

const four = await measureMatrix(4, 1280)
check('M3 宽屏（1280px）每行排 ≥ 2 张卡', four.perRow >= 2,
  `实测每行 ${four.perRow} 张（共 ${four.cardCount} 张 / ${four.rows} 行；grid 宽 ${four.gridW.toFixed(0)}px，卡宽 ${four.cardW.toFixed(0)}px）`)
check('M3 卡片是网格项而不是整行（卡宽 < 网格宽）', four.cardW < four.gridW - 1,
  `卡 ${four.cardW.toFixed(0)}px < 网格 ${four.gridW.toFixed(0)}px`)
check('M3 卡片确实「大」：单卡高度 ≥ 180px', four.cardH >= 180,
  `实测卡高 ${four.cardH.toFixed(0)}px（min-height 184px 生效）`)
check('M3 样式表确实装的是网格（auto-fill 铺满可用轨道）', four.tracks >= 2,
  `实测 ${four.tracks} 条轨道 @1280px`)

// NC3 — 反向对照，且它必须是**会失败的那一半**。
// 「每行 ≥ 2 张」若恒真（比如写成了 `>= 1`，或夹具根本没起作用），下面这条就会绿，
// 那上面那条也就什么都没证明。一张卡的夹具必须让同一条断言不成立。
const one = await measureMatrix(1, 1280)
check('NC3 一张卡时「每行 ≥ 2 张」必须不成立（证明上面那条不是恒真）', one.perRow < 2,
  `实测每行 ${one.perRow} 张——若这里也 ≥ 2，说明夹具或断言有一个没在工作`)

// 窄屏时每行张数必须收缩：这才是 auto-fill 而不是固定列数的证据。
const narrow = await measureMatrix(4, 640)
check('M3 窄屏（640px）每行张数随之收缩', narrow.perRow < four.perRow,
  `1280px → 每行 ${four.perRow} 张，640px → 每行 ${narrow.perRow} 张`)

await browser.close()

// ── Report ────────────────────────────────────────────────────────────────────
const width = Math.max(...results.map((r) => r.name.length))
for (const r of results) {
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name.padEnd(width)}  ${r.detail}`)
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 项通过（真实 Chrome 布局，官方样式表提取自 shipped bundle：类名前缀 ${P}）`)
process.exit(failed.length === 0 ? 0 : 1)
