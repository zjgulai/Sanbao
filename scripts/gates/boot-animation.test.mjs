import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { judgeBootAnimation } from './boot-animation.mjs'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, mkdirSync, mkdtempSync, cpSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { appResourcesRoot } from '../lib/app-resources.mjs'
import { extractBootPreview } from '../lib/boot-preview.mjs'
import { loadThemeSources } from '../lib/theme-source-loader.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const { settings, tokens, shared } = await loadThemeSources(repoRoot)
const { DEFAULT_THEME_STUDIO_SETTINGS } = settings
const { buildThemeTokenOverrides } = tokens
const { SANBAO_TOKEN_CSS } = shared
const browserPackagePath = process.env.THEME_BROWSER_PACKAGE ?? (
  existsSync(join(repoRoot, 'packages/capabilities/dsh-browser-local/node_modules/playwright-core'))
    ? join(repoRoot, 'packages/capabilities/dsh-browser-local/package.json')
    : existsSync(join(repoRoot, '../../packages/capabilities/dsh-browser-local/package.json'))
      ? join(repoRoot, '../../packages/capabilities/dsh-browser-local/package.json')
      : join(repoRoot, 'packages/capabilities/dsh-browser-local/package.json')
)
const requireBrowser = createRequire(browserPackagePath)
const { chromium } = requireBrowser('playwright-core')

test('真实 BootPage 与 CSS：双色道旋转保留，三类浏览器突变必须判红', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'boot-animation-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const appRoot = appResourcesRoot()
  assert.ok(appRoot, '真机资源根不可缺失，不能用空 fixture 假绿')
  const liveAssets = join(appRoot, 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets')
  const candidates = readdirSync(liveAssets).filter((name) => name.endsWith('.js')).map((name) => ({ name, source: readFileSync(join(liveAssets, name), 'utf8') })).filter(({ source }) => source.includes('this.wordmark=') && source.includes('dshBootSpinner'))
  assert.equal(candidates.length, 1)
  const app = join(root, 'DSH Desktop.app')
  const assets = join(app, 'Contents/Resources/app/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets')
  mkdirSync(assets, { recursive: true })
  cpSync(join(liveAssets, candidates[0].name), join(assets, candidates[0].name))
  const styles = readdirSync(liveAssets).filter((name) => name.endsWith('.css'))
  for (const name of styles) cpSync(join(liveAssets, name), join(assets, name))
  const replay = spawnSync('bash', [join(repoRoot, 'dsh-patches/brand-replay.sh'), '--apply'], { encoding: 'utf8', env: { ...process.env, DSH_APP: app } })
  assert.match(replay.stdout, /(?:APPLY|OK)   ?wordmark|APPLY wordmark/)
  const preview = extractBootPreview(readFileSync(join(assets, candidates[0].name), 'utf8'))
  const css = styles.map((name) => readFileSync(join(assets, name), 'utf8')).join('\n')
  const overrides = buildThemeTokenOverrides(DEFAULT_THEME_STUDIO_SETTINGS)
  const toCss = (scheme) => Object.entries(overrides).map(([name, value]) => `${name}:${typeof value === 'string' ? value : value[scheme]};`).join('')
  const theme = `:root, body {${toCss('light')}}body[data-ds-dark-theme]{${toCss('dark')}}${SANBAO_TOKEN_CSS}`
  const html = `<html><head><style>${css}\n${theme}\nhtml,body,#host{height:100%;margin:0}</style></head><body><main id="host"></main><script>${preview}</script></body></html>`
  const server = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const browser = await chromium.launch({ channel: 'chrome' })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  const errors = []
  const readings = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const measure = () => page.evaluate(() => {
    const spinner = document.querySelector('[data-dsh-boot-spinner]')
    const computed = getComputedStyle(spinner)
    const background = getComputedStyle(spinner, '::after').backgroundImage
    const probe = document.createElement('i')
    probe.style.color = 'var(--sanbao-accent)'
    document.body.append(probe)
    const accent = getComputedStyle(probe).color
    probe.remove()
    return { name: computed.animationName, duration: computed.animationDuration, running: spinner.getAnimations().some((animation) => animation.playState === 'running'), background, arcColor: background.match(/rgba?\([^)]+\)/)?.[0], accent }
  })
  for (const dark of [false, true]) {
    await page.evaluate((dark) => {
      document.body.toggleAttribute('data-ds-dark-theme', dark)
      const BootPage = window.__bootPage.constructor
      window.__bootPage.dispose()
      window.__bootPage = new BootPage(document.getElementById('host'))
    }, dark)
    const reading = await measure()
    readings.push({ scheme: dark ? 'dark' : 'light', ...reading })
    assert.deepEqual(judgeBootAnimation(reading), [], JSON.stringify(reading))
    assert.equal(await page.locator('[data-brand-wordmark="stacked"]').count(), 1)
    if (process.env.BOOT_ACCEPT_OUT) {
      mkdirSync(process.env.BOOT_ACCEPT_OUT, { recursive: true })
      await page.screenshot({ path: join(process.env.BOOT_ACCEPT_OUT, dark ? 'boot-dark.png' : 'boot-light.png') })
    }
    const spinner = page.locator('[data-dsh-boot-spinner]')
    await page.evaluate(() => window.__bootPage.setTotal(2))
    assert.match((await measure()).background, /72deg/)
    await page.evaluate(() => window.__bootPage.setState('first', 'active'))
    assert.match((await measure()).background, /180deg/)
    await page.evaluate(() => window.__bootPage.setState('second', 'active'))
    assert.match((await measure()).background, /288deg/)
    // 「圆环在转」必须可证伪，但**不能靠单次 100ms 采样**：机器被并发门禁压满时，
    // 渲染主线程两帧之间动画时钟可能整段不推进，两次采样都读到初始相位（实测假红：
    // 两次都是 matrix(1,0,0,1,0,0)）。判据改成**带截止时间的轮询**——真的冻结永不移动，
    // 3 秒内必然判红；被挤住的时钟等它恢复即可。
    const before = await spinner.evaluate((node) => getComputedStyle(node).transform)
    const deadline = Date.now() + 3000
    let moved = false
    while (!moved && Date.now() < deadline) {
      await page.waitForTimeout(100)
      moved = (await spinner.evaluate((node) => getComputedStyle(node).transform)) !== before
    }
    assert.ok(moved, `启动圆环必须在 3 秒内可观测到旋转（采样到的 transform 始终是 ${before}）`)
  }
  for (const [rule, expected] of [
    ['[data-dsh-boot-spinner]{animation-name:none!important}', 'spin'],
    ['[data-dsh-boot-spinner]{animation-duration:.8s!important}', '2s'],
    ['[data-dsh-boot-spinner]::after{background:conic-gradient(red 72deg,transparent 0)!important}', '弧色'],
    ['[data-dsh-boot-spinner]::after{background:linear-gradient(var(--dsw-alias-brand-primary),transparent)!important}', 'conic'],
    ['[data-dsh-boot-spinner]::after{background:conic-gradient(var(--dsw-alias-brand-primary) 0deg,transparent 0)!important}', '角度'],
  ]) {
    const style = await page.addStyleTag({ content: rule })
    assert.ok(judgeBootAnimation(await measure()).some((line) => line.includes(expected)))
    await style.evaluate((node) => node.remove())
    assert.deepEqual(judgeBootAnimation(await measure()), [])
  }
  assert.deepEqual(errors, [])
  if (process.env.BOOT_ACCEPT_OUT) writeFileSync(join(process.env.BOOT_ACCEPT_OUT, 'readings.json'), JSON.stringify({ source: candidates[0].name, readings, errors }, null, 2) + '\n')
})

test('启动圆环只接受 spin、2s 与名源 accent 解析同色', () => {
  const reading = { name: '_spin_generated_47', duration: '2s', running: true, background: 'conic-gradient(rgb(88, 184, 72) 72deg, rgba(0, 0, 0, 0) 0deg)', arcColor: 'rgb(88, 184, 72)', accent: 'rgb(88, 184, 72)' }
  assert.deepEqual(judgeBootAnimation(reading), [])
  assert.ok(judgeBootAnimation({ ...reading, duration: '1s' }).some((line) => line.includes('2s')))
})
