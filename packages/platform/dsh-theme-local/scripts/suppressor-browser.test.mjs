#!/usr/bin/env node
/**
 * 官方外观行遮蔽器的**真实浏览器**判据。
 *
 * 为什么不用 vitest：本包没有 jsdom（`require.resolve('jsdom')` 实测失败），而这段逻辑的全部
 * 内容就是 inline style、MutationObserver 与 getComputedStyle 三者如何互相压住——用自造 DOM 桩
 * 跑它等于测自己的假设（总账 P-02「测不出来的判据等于没有判据」）。所以这里装载的是真 Chromium，
 * 跑的是产物级别的同一份 TS 源。
 *
 * 用法：THEME_BROWSER_PACKAGE=<带 playwright-core 的 package.json> node dsh-patches/.../ 或
 *      node packages/platform/dsh-theme-local/scripts/suppressor-browser.test.mjs
 * 退出码：0 全过；1 判据不过；2 前置缺失或仪器坏（绝不当作通过）。
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')
const browserPkg = process.env.THEME_BROWSER_PACKAGE
if (!browserPkg) {
  console.error('[suppressor] 前置缺失：THEME_BROWSER_PACKAGE 要指向已装 playwright-core 的 package.json')
  process.exit(2)
}
const toolRequire = createRequire(join(pkgRoot, 'package.json'))
const { chromium } = createRequire(browserPkg)('playwright-core')

// 官方行的真实结构：从已装产物读得 —— div.group > (div.title + div.cubeRow > 三个 cube)，
// 系统项文案在 zh/en 字典里分别是「跟随系统」/「System」。
const OFFICIAL = `<div data-role="official"><div>外观</div><div role="radiogroup">
  <label><input type="radio" name="o" value="light">浅色</label>
  <label><input type="radio" name="o" value="dark">深色</label>
  <label><input type="radio" name="o" value="system">SYSTEM_LABEL</label></div></div>`
const STUDIO = `<div data-role="studio"><div>主题</div><div role="radiogroup">
  <label><input type="radio" name="s" value="light">亮色</label>
  <label><input type="radio" name="s" value="dark">暗色</label>
  <label><input type="radio" name="s" value="warm-pink">暖粉白</label></div></div>`

const work = mkdtempSync(join(here, '.suppressor-'))
let browser
let bundle
const servers = []
async function serve(body) {
  const server = createServer((_, res) => {
    res.setHeader('content-type', 'text/html')
    res.setHeader('cache-control', 'no-store')
    res.end(`<!doctype html><html><head><style>[data-role="official"]{display:flex;flex-direction:column}</style></head><body>${body}<script>${bundle}</script></body></html>`)
  })
  servers.push(server)
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${server.address().port}/`
}

try {
  // rolldown 不直接挂在包上：走构建工具自带的解析（与 dsh-patches/theme-office 同一手法）。
  const buildRequire = createRequire(toolRequire.resolve('tsdown'))
  const { rolldown } = await import(pathToFileURL(buildRequire.resolve('rolldown')).href)
  const built = await rolldown({
    input: join(pkgRoot, 'src/client/official-appearance-suppressor.ts'),
    platform: 'browser',
    output: { format: 'iife', name: '__suppressor' },
  })
  const { output } = await built.generate({ format: 'iife', name: '__suppressor', codeSplitting: false })
  await built.close()
  // 页面里不写任何期望值：断言全在 Node 侧，浏览器只负责把 DOM 真实跑出来。
  bundle = `${output[0].code}\nwindow.__make = (root) => __suppressor.createOfficialAppearanceSuppressor(root);\nwindow.__ATTR = __suppressor.OFFICIAL_ROW_ATTR;`

  browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e.message)))

  // 正控：遮蔽器必须真的能改写 display，否则后面每一条绿都无意义。
  const control = await (async () => {
    const url = await serve(`<div id="mount">${OFFICIAL.replace('SYSTEM_LABEL', '跟随系统')}</div>`)
    await page.goto(url)
    return page.evaluate(() => {
      const row = document.querySelector('[data-role="official"]')
      const before = getComputedStyle(row).display
      const s = window.__make(document.getElementById('mount'))
      const after = getComputedStyle(row).display
      s.release()
      return { before, after, restored: getComputedStyle(row).display, marked: row.hasAttribute(window.__ATTR) }
    })
  })()
  assert.equal(control.before, 'flex', '正控失败：官方行进场时不是可见的 flex，页面本身就没搭对')
  assert.equal(control.after, 'none', '遮蔽失败：display 没被改成 none')
  assert.equal(control.restored, 'flex', '还原失败：release 没把原 inline display 还回去')
  assert.equal(control.marked, false, '还原失败：release 后仍留着已遮蔽标记')

  // 三身份 studio 同页时不得被误伤。
  const coexist = await (async () => {
    const url = await serve(`<div id="mount">${OFFICIAL.replace('SYSTEM_LABEL', 'System')}${STUDIO}</div>`)
    await page.goto(url)
    return page.evaluate(() => {
      const s = window.__make(document.getElementById('mount'))
      const official = document.querySelector('[data-role="official"]')
      const studio = document.querySelector('[data-role="studio"]')
      return { hidden: getComputedStyle(official).display, studioShown: getComputedStyle(studio).display,
        studioRadios: studio.querySelectorAll('input[type="radio"]').length, count: s.hiddenCount() }
    })
  })()
  assert.equal(coexist.hidden, 'none', '遮蔽失败（中英字典同页）')
  assert.equal(coexist.studioShown, 'block', '误伤：三身份 studio 被一起藏了')
  assert.equal(coexist.studioRadios, 3, '误伤：三身份控件不完整')
  assert.equal(coexist.count, 1, `只该遮蔽一行，实际 ${coexist.count}`)

  // 迟挂载 + 收敛：被观察子树里的一次写入，不得让同一元素再次满足写入条件。
  const late = await (async () => {
    const url = await serve('<div id="mount"></div>')
    await page.goto(url)
    return page.evaluate(async () => {
      const root = document.getElementById('mount')
      const s = window.__make(root)
      const idle = () => new Promise(r => setTimeout(r, 60))
      root.insertAdjacentHTML('beforeend', String.raw`<div data-role="official"><div>外观</div><div role="radiogroup"><label><input type="radio" value="light">浅色</label><label><input type="radio" value="system">跟随系统</label></div></div>`)
      await idle()
      const first = { display: getComputedStyle(root.querySelector('[data-role="official"]')).display, count: s.hiddenCount() }
      root.insertAdjacentHTML('beforeend', '<span>无关变更</span>')
      await idle()
      return { first, countAfterUnrelated: s.hiddenCount() }
    })
  })()
  assert.equal(late.first.display, 'none', '迟挂载的官方行没被遮蔽（观察器射程不足）')
  assert.equal(late.first.count, 1)
  assert.equal(late.countAfterUnrelated, 1, '观察器对同一元素重复命中，不收敛')

  // 负控：页面里没有官方行时必须一台都不藏，且不报错——「扫到 0」不能报通过。
  const empty = await (async () => {
    const url = await serve(`<div id="mount">${STUDIO}</div>`)
    await page.goto(url)
    return page.evaluate(() => {
      const s = window.__make(document.getElementById('mount'))
      return { count: s.hiddenCount(), studioShown: getComputedStyle(document.querySelector('[data-role="studio"]')).display }
    })
  })()
  assert.equal(empty.count, 0, '无官方行却报遮蔽数，说明锚点在乱匹配')
  assert.equal(empty.studioShown, 'block')

  if (errors.length > 0) {
    console.error('[suppressor] 页面异常：', errors.join(' | '))
    process.exit(1)
  }
  console.log(JSON.stringify({
    status: 'passed',
    browser: `${browser.browserType().name()} ${browser.version()}`,
    controls: ['正控 display flex→none→还原', '中英两版锚点', '同页不误伤 studio', '迟挂载收敛', '无官方行不判绿'],
    pending: ['真机：设置「外观」页上官方行不再出现（需 DSH 运行时读数）'],
  }, null, 1))
} finally {
  await browser?.close()
  for (const s of servers) s.close()
  rmSync(work, { recursive: true, force: true })
}
