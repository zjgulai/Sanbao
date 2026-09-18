#!/usr/bin/env node
/**
 * 外观页的**真实渲染**验收（一次性，用完即删）。
 *
 * 与 theme-tokens-live.mjs 的分工：那台仪器证明「token 在真实 CSS 引擎里解析成什么」，
 * 这台仪器证明「真实组件渲染出的外观页长什么样、点下去发生什么」。两者都不是
 * 「跑着的那个 app 里是什么样」——后者要 live GUI 读数。
 *
 * 页面加载的是真的 `apply(ctx)` → 真 store → 真 ThemeStudio → 真 studio.css，
 * 画布用官方主题样式表（从 app 包逐字取出，不手抄）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const PKG = join(REPO_ROOT, 'packages', 'platform', 'dsh-theme-local')
const BUNDLE = join(PKG, '.harness', 'dist', 'harness.iife.js')
const OUT_DIR = join(REPO_ROOT, '.scratch', 'appearance-revamp', 'render')
const SETTINGS_KEY = 'dsh-theme/settings/v1'
const PREFS_KEY = 'dsh-theme/prefs/v1'

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

if (!existsSync(BUNDLE)) {
  console.error(`[render] 前置缺失：${BUNDLE}（先跑 node_modules/.bin/tsdown --config .harness/tsdown.config.ts）`)
  process.exit(2)
}
mkdirSync(OUT_DIR, { recursive: true })

// 官方主题样式表：从 app 产物里逐字取出（与 theme-tokens-live.mjs 同一手法）。
function officialThemeCss() {
  const appDir = '/Applications/DSH Desktop.app'
  const candidates = [
    join(appDir, 'Contents/Resources/app/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js'),
  ]
  const bundle = candidates.find((path) => existsSync(path))
  if (bundle === undefined) return ''
  const blobs = []
  for (const match of readFileSync(bundle, 'utf8').matchAll(/"(?:[^"\\]|\\.)*"/g)) {
    let value
    try {
      value = JSON.parse(match[0])
    } catch {
      continue
    }
    if (value.includes('--dsw-') && value.includes('{')) blobs.push(value)
  }
  return blobs.join('\n')
}

const themeCss = officialThemeCss()
if (themeCss === '') {
  console.error('[render] 前置缺失：取不到官方主题样式表（画布会失真，不做渲染判决）')
  process.exit(2)
}

const harnessJs = readFileSync(BUNDLE, 'utf8')
const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>appearance render check</title>
<style>${themeCss}</style>
<style>html,body{margin:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
font-family:var(--dsw-font-family)} #root{padding:24px;max-width:760px}</style>
</head><body><div id="root"></div><script>${harnessJs}</script></body></html>`

const requireFromBrowserPkg = createRequire(
  join(REPO_ROOT, 'packages/capabilities/dsh-browser-local/package.json'),
)
const { chromium } = requireFromBrowserPkg('playwright-core')

const server = createServer((_req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(html)
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const port = server.address().port

let usedChannel = 'chrome'
const browser = await chromium.launch({ channel: 'chrome' }).catch(async (error) => {
  usedChannel = 'bundled'
  console.warn(`[render] channel=chrome 起不来（${String(error.message).split('\n')[0]}），退回 playwright 自带 chromium`)
  return chromium.launch()
})

const context = await browser.newContext({ viewport: { width: 900, height: 1400 } })
await context.grantPermissions(['clipboard-read', 'clipboard-write'])
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`)
})

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
await page.waitForSelector('[data-appearance-studio]', { timeout: 10000 })

const settings = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SETTINGS_KEY)
const prefs = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), PREFS_KEY)
const tokenVars = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('style[data-plugin-css^="dsh-theme/"]')]
      .map((tag) => tag.textContent ?? '')
      .join('\n'),
  )

// ── A 结构 ────────────────────────────────────────────────────────────────────
check(
  'A1 两张卡（主题 / 偏好）',
  (await page.locator('[data-appearance-card][data-card="theme"]').count()) === 1 &&
    (await page.locator('[data-appearance-card][data-card="prefs"]').count()) === 1,
)
check(
  'A2 模式三卡是真单选组',
  (await page.locator('[role="radiogroup"] input[name="appearance-mode"]').count()) === 3,
  `radiogroup=${await page.locator('[data-appearance-mode-grid][role="radiogroup"]').count()}`,
)
check(
  'A3 预设网格 15 张卡',
  (await page.locator('input[name="appearance-preset"]').count()) === 15,
)
check(
  'A4 强调色是卡级单组 8 对（不随变体重复）',
  (await page.locator('input[name="appearance-accent"]').count()) === 8 &&
    (await page.locator('[data-appearance-accent-group]').count()) === 1,
  `radios=${await page.locator('input[name="appearance-accent"]').count()} groups=${await page.locator('[data-appearance-accent-group]').count()}`,
)
check(
  'A5 深浅双区堆叠（各 1 组字段）',
  (await page.locator('[data-appearance-variant]').count()) === 2 &&
    (await page.locator('[data-appearance-fields]').count()) === 2,
)
check('A6 对比度滑杆存在', (await page.locator('input[type="range"][data-appearance-slider]').count()) === 2)
check(
  'A7 高级区默认折叠',
  await page.locator('[data-appearance-advanced-panel]').first().isHidden(),
)
check(
  'A8 减弱动效三态 + 字体平滑开关',
  (await page.locator('input[name="appearance-reduce-motion"]').count()) === 3 &&
    (await page.locator('[role="switch"]').count()) === 1,
)
check('A9 无 aria-pressed 残留', (await page.locator('[aria-pressed]').count()) === 0)
await page.screenshot({ path: join(OUT_DIR, '01-default-light.png'), fullPage: true })

// ── B 模式切换走真实 setTheme ─────────────────────────────────────────────────
await page.locator('label:has(input[name="appearance-mode"][value="dark"])').click()
check(
  'B1 模式单选调用 ctx.theme.setTheme',
  (await page.evaluate(() => window.__harness.themeCalls.join(','))) === 'dark',
)
await page.locator('label:has(input[name="appearance-mode"][value="system"])').click()

// ── C 预设应用 + 色卡活跃判定 ─────────────────────────────────────────────────
const secondPreset = page.locator('label:has(input[name="appearance-preset"])').nth(1)
const secondPresetId = await page
  .locator('input[name="appearance-preset"]')
  .nth(1)
  .getAttribute('value')
await secondPreset.click()
const afterPreset = await settings()
check(
  'C1 选预设写入存储（含 contrast=50 基线）',
  afterPreset !== null && afterPreset.lightContrast === 50 && afterPreset.darkContrast === 50,
  `${secondPresetId} → lightAccent=${afterPreset?.lightAccent}`,
)
const cardAccent = await secondPreset
  .locator('[data-appearance-theme-colors] i')
  .first()
  .evaluate((node) => {
    const [r, g, b] = getComputedStyle(node).backgroundColor.match(/\d+/g).map(Number)
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
  })
check(
  'C2 预设卡显示的色值 == 落盘的强调色',
  cardAccent === afterPreset?.lightAccent,
  `card=${cardAccent} stored=${afterPreset?.lightAccent}`,
)
check(
  'C3 自定义色值后出现「自定义」卡',
  (await page.evaluate(async () => {
    const input = document.querySelector('input[data-appearance-chip-hex]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, '#123456')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    return document.querySelectorAll('[data-appearance-preset][data-custom="true"]').length
  })) === 1,
)

// ── D 对比度派生真的进了 token ────────────────────────────────────────────────
await page.locator('label:has(input[name="appearance-accent"])').nth(1).click()
check(
  'D1 色卡写入双变体强调色',
  (await settings())?.lightAccent === '#2D65A3' && (await settings())?.darkAccent === '#6FB3E8',
)
const borderL1 = (css) => /--dsw-alias-border-l1: color-mix\(in oklch, (#[0-9A-F]{6}) (\d+)%/.exec(css)
const beforeContrast = await tokenVars()
await page.locator('input[type="range"][data-appearance-slider]').first().fill('100')
const afterContrast = await tokenVars()
check(
  'D2 对比度 100 缩放中性混合（border-l1 8→11）',
  borderL1(beforeContrast)?.[2] === '8' && borderL1(afterContrast)?.[2] === '11',
  `light border-l1 ${borderL1(beforeContrast)?.[2]}% → ${borderL1(afterContrast)?.[2]}%`,
)
check('D3 contrast 落盘', (await settings())?.lightContrast === 100)
check(
  'D4 accent 派生不随对比度变化（bubble 仍 10%）',
  /--dsw-specific-bubble: color-mix\(in oklch, #2D65A3 10%/.test(afterContrast),
)
await page.locator('input[type="range"][data-appearance-slider]').first().fill('50')
check(
  'D5 回到 50 = 基线恒等（border-l1 11→8）',
  borderL1(await tokenVars())?.[2] === '8',
)

// ── E 呈现偏好 ────────────────────────────────────────────────────────────────
await page.locator('label:has(input[name="appearance-reduce-motion"][value="on"])').click()
check(
  'E1 减弱动效=开 → body 属性 + prefs 落盘',
  (await page.evaluate(() => document.body.dataset.luteReduceMotion)) === 'reduce' &&
    (await prefs())?.reduceMotion === 'on',
)
await page.locator('label:has(input[name="appearance-reduce-motion"][value="off"])').click()
check(
  'E2 减弱动效=关 → 属性移除',
  (await page.evaluate(() => document.body.dataset.luteReduceMotion)) === undefined,
)
await page.locator('[role="switch"]').click()
check(
  'E3 字体平滑 → body 属性 + prefs 落盘',
  (await page.evaluate(() => document.body.dataset.luteFontSmoothing)) === 'on' &&
    (await prefs())?.fontSmoothing === true,
)
check(
  'E4 偏好门控样式表已注入',
  await page.evaluate(
    () =>
      document.querySelector('style[data-plugin-css="dsh-theme/prefs"]')?.textContent?.includes(
        'data-lute-reduce-motion',
      ) === true,
  ),
)

// ── F 主题分享 ────────────────────────────────────────────────────────────────
const copyButton = page.getByRole('button', { name: '复制主题', exact: true })
const importButton = page.getByRole('button', { name: '导入', exact: true })
const submitButton = page.getByRole('button', { name: '导入主题', exact: true })
const cancelButton = page.getByRole('button', { name: '取消', exact: true })
const shareInput = page.locator('[data-appearance-share-input]')

await copyButton.click()
await page.waitForTimeout(200)
const clipboard = await page.evaluate(async () => {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return ''
  }
})
const panelPayload = (await shareInput.count()) === 1 ? await shareInput.inputValue() : ''
const payload = clipboard !== '' ? clipboard : panelPayload
let parsed = null
try {
  parsed = JSON.parse(payload)
} catch {
  parsed = null
}
check(
  'F1 复制产出可解析的主题串',
  parsed !== null && typeof parsed.lightAccent === 'string',
  `${clipboard !== '' ? 'clipboard' : 'fallback-panel'} len=${payload.length}`,
)
check(
  'F2 分享串不含 prefs',
  payload.includes('fontSmoothing') === false && payload.includes('reduceMotion') === false,
)
check('F3 分享串含 contrast 字段', parsed?.lightContrast === 50 && parsed?.darkContrast === 50)

// 导入：改一个色值再导回，验证 applySettings 真的生效
const mutated = { ...parsed, lightAccent: '#7A2F5B' }
if ((await shareInput.count()) === 0) await importButton.click()
await shareInput.fill(JSON.stringify(mutated))
await submitButton.click()
await page.waitForTimeout(200)
check('F4 导入应用到存储', (await settings())?.lightAccent === '#7A2F5B', `stored=${(await settings())?.lightAccent}`)

await importButton.click()
await shareInput.fill('{ 坏掉的串 }')
await submitButton.click()
await page.waitForTimeout(150)
check(
  'F5 坏串报错且不改主题',
  (await page.locator('[data-appearance-share-error]').count()) === 1 &&
    (await settings())?.lightAccent === '#7A2F5B',
)
await page.screenshot({ path: join(OUT_DIR, '02-import-panel.png'), fullPage: true })
await cancelButton.click()

// ── G 高级区 + 深色实拍 ───────────────────────────────────────────────────────
await page.locator('[data-appearance-advanced-toggle]').first().click()
check(
  'G1 高级区展开出现 3 行次级色',
  (await page.locator('[data-appearance-advanced-panel]:not([hidden]) [data-appearance-chip]').count()) === 3,
)
await page.screenshot({ path: join(OUT_DIR, '03-advanced-open.png'), fullPage: true })
await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
await page.waitForTimeout(100)
await page.screenshot({ path: join(OUT_DIR, '04-dark-canvas.png'), fullPage: true })
await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))

// ── 溢出与重叠（真实几何，不是文本） ──────────────────────────────────────────
const overflow = await page.evaluate(() => {
  const studio = document.querySelector('[data-appearance-studio]')
  const box = studio.getBoundingClientRect()
  const offenders = []
  for (const node of studio.querySelectorAll('*')) {
    const r = node.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    if (r.right > box.right + 1 || r.left < box.left - 1) {
      offenders.push(`${node.tagName.toLowerCase()}${node.className === '' ? '' : `.${node.className}`} [${Math.round(r.left)}..${Math.round(r.right)}]`)
    }
  }
  return { offenders: offenders.slice(0, 5), width: Math.round(box.width) }
})
check('H1 无横向溢出', overflow.offenders.length === 0, `w=${overflow.width} ${overflow.offenders.join(' | ')}`)
check('H2 无页面错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))

const geometry = await page.evaluate(() => {
  const studio = document.querySelector('[data-appearance-studio]')
  const overlaps = []
  // 同一容器里的相邻行不得重叠（横向溢出查不到这类碰撞）
  for (const group of studio.querySelectorAll('[data-appearance-fields], [data-appearance-setting-list], [data-appearance-preset-grid], [data-appearance-mode-grid]')) {
    const rows = [...group.children].map((n) => n.getBoundingClientRect())
    for (let i = 1; i < rows.length; i += 1) {
      // 只有「同一列」的相邻元素才谈得上竖向碰撞；多列网格里同行的兄弟共享竖带是正常的。
      const sameColumn = Math.abs(rows[i].left - rows[i - 1].left) < 2
      if (sameColumn && rows[i].top < rows[i - 1].bottom - 0.5) {
        overlaps.push(`${group.getAttribute('data-appearance-fields') !== null ? 'fields' : group.getAttribute('data-appearance-setting-list') !== null ? 'settings' : 'grid'}#${i}`)
      }
    }
  }
  const small = []
  for (const node of studio.querySelectorAll('button, [data-appearance-swatch-chip], [data-appearance-preset], [data-appearance-mode]')) {
    const r = node.getBoundingClientRect()
    if (r.width > 0 && (r.width < 20 || r.height < 20)) small.push(`${node.tagName.toLowerCase()}:${Math.round(r.width)}x${Math.round(r.height)}`)
  }
  return { overlaps, small }
})
check('H3 组内相邻行无重叠', geometry.overlaps.length === 0, geometry.overlaps.slice(0, 4).join(' | '))
check('H4 交互目标不小于 20px', geometry.small.length === 0, geometry.small.slice(0, 4).join(' | '))

const report = {
  instrument: `playwright ${usedChannel}`,
  scope: 'render-level（真实 apply/组件/CSS + 官方主题画布），非 live GUI',
  results,
  failed: results.filter((r) => !r.ok).map((r) => r.name),
}
writeFileSync(join(OUT_DIR, 'render-check.json'), `${JSON.stringify(report, null, 2)}\n`)
await browser.close()
server.close()

console.log(`[render] 截图与报告：${OUT_DIR}`)
console.log(`[render] ${results.length - report.failed.length}/${results.length} 项通过`)
process.exit(report.failed.length === 0 ? 0 : 1)
