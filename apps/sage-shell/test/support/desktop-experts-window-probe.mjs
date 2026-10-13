import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, protocol } from 'electron'
import { FramePolicy } from '../../lib/main/frame-policy.js'
import { createSageWindow, loadTrustedUrl } from '../../lib/main/window.js'
import { serveDesktopDocument } from '../../lib/main/desktop-document.js'
import { SAGE_APP_ORIGIN } from '../../lib/product/contracts.js'

const root = process.env.SAGE_EXPERTS_PROBE_ROOT
if (!root) throw new Error('SAGE_EXPERTS_PROBE_ROOT is required')
for (const name of ['user-data', 'session-data', 'crash-dumps', 'logs']) mkdirSync(join(root, name), { recursive: true })
app.setPath('userData', join(root, 'user-data'))
app.setPath('sessionData', join(root, 'session-data'))
app.setPath('crashDumps', join(root, 'crash-dumps'))
app.setAppLogsPath(join(root, 'logs'))
protocol.registerSchemesAsPrivileged([{ scheme: 'dsh-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false, stream: true, codeCache: true } }])
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})

const evidence = { processType: process.type, avatars: 0, categories: {}, keyboard: false, search: false, navigation: false, geometry: [], postRequests: [], assetFailures: [], failures: [], fatal: null }
const policy = new FramePolicy()
let window
let finished = false
const timeout = setTimeout(() => finish(new Error('Expert window probe exceeded 55 seconds')), 55_000)

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function evaluate(source) { return window.webContents.executeJavaScript(source) }
async function waitFor(source, label) {
  const end = Date.now() + 6000
  while (Date.now() < end) {
    if (await evaluate(source)) return
    await delay(40)
  }
  throw new Error(`Timed out: ${label}`)
}
async function command(method, params = {}) { return window.webContents.debugger.sendCommand(method, params) }
async function click(selector) {
  const point = await evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) throw new Error('Missing target: ' + ${JSON.stringify(selector)});
    node.scrollIntoView({block:'center'});
    const r = node.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2};
  })()`)
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
  await delay(40)
}
async function key(name, modifiers = 0) {
  const definitions = { Tab: 9, Enter: 13 }
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: definitions[name], modifiers, ...(name === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) })
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: definitions[name], modifiers })
  await delay(40)
}
async function screenshot(name) {
  const out = process.env.SAGE_EXPERTS_PROBE_EVIDENCE
  if (!out) return
  mkdirSync(out, { recursive: true })
  const { data } = await command('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(out, name), Buffer.from(data, 'base64'))
}

async function run() {
  await app.whenReady()
  protocol.handle('dsh-app', request => {
    if (request.method !== 'GET' && request.method !== 'HEAD') evidence.postRequests.push({ path: new URL(request.url).pathname, method: request.method })
    const document = serveDesktopDocument(request)
    if (document !== null) {
      if (new URL(request.url).pathname.startsWith('/assets/') && document.status !== 200) evidence.assetFailures.push(new URL(request.url).pathname)
      return document
    }
    // No Host, login, model or business data is connected by this display-only probe.
    return Response.json({ code: 'projection-read-unavailable', stage: 'initial-context', retryable: true, correlation: 'ep1-display-probe' })
  })
  window = createSageWindow(policy)
  window.setMinimumSize(320, 400)
  window.setContentSize(1280, 900)
  await loadTrustedUrl(window, policy, `${SAGE_APP_ORIGIN}/index.html`)
  window.show()
  window.webContents.debugger.attach('1.3')
  await command('Page.enable')
  await command('Accessibility.enable')
  await evaluate(`globalThis.__expertCspViolations = []; document.addEventListener('securitypolicyviolation', event => __expertCspViolations.push(event.violatedDirective))`)
  await waitFor('document.querySelector(\'[data-sage-desktop-mounted="true"]\') !== null', 'desktop mount')
  await click('button[aria-label="专家"]')
  await waitFor('document.querySelectorAll(".expert-card").length === 53', 'expert catalogue')
  await waitFor('[...document.querySelectorAll(".expert-avatar")].every(img => img.complete && img.naturalWidth === 64)', 'all avatar decodes')
  const avatars = await evaluate('[...document.querySelectorAll(".expert-avatar")].map(img => ({src:img.currentSrc,width:img.naturalWidth,height:img.naturalHeight}))')
  assert.equal(avatars.length, 53)
  assert.ok(avatars.every(img => img.width === 64 && img.height === 64 && img.src.startsWith(`${SAGE_APP_ORIGIN}/assets/experts/`)))
  evidence.avatars = avatars.length

  const filter = index => `.experts-filters button:nth-child(${index})`
  await click(filter(2))
  await waitFor('document.querySelectorAll(".expert-card").length === 3', 'management filter')
  evidence.categories.management = 3
  await click(filter(3))
  await waitFor('document.querySelectorAll(".expert-card").length === 50', 'job filter')
  evidence.categories.jobs = 50
  await click(filter(1))
  await waitFor('document.querySelectorAll(".expert-card").length === 53', 'all filter')
  evidence.categories.all = 53

  await click(filter(1))
  await key('Tab')
  assert.equal(await evaluate('document.activeElement.textContent'), '管理身份 3')
  await key('Tab')
  assert.equal(await evaluate('document.activeElement.textContent'), '岗位专家 50')
  await key('Tab')
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), '搜索专家')
  const outline = await evaluate('getComputedStyle(document.activeElement).outlineStyle')
  assert.equal(outline, 'solid')
  await key('Tab', 8)
  assert.equal(await evaluate('document.activeElement.textContent'), '岗位专家 50')
  await key('Tab')
  await command('Input.insertText', { text: '衡远' })
  await waitFor('document.querySelectorAll(".expert-card").length === 1', 'Chinese search')
  assert.equal(await evaluate('document.querySelector(".expert-card").dataset.expertId'), 'AGT-001')
  await command('Input.insertText', { text: '-missing' })
  await waitFor('document.querySelectorAll(".expert-card").length === 0', 'search miss')
  await key('Tab')
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), '清空搜索')
  await key('Enter')
  await waitFor('document.querySelectorAll(".expert-card").length === 53', 'clear search')
  evidence.keyboard = true
  evidence.search = true

  const ax = await command('Accessibility.getFullAXTree')
  assert.ok(ax.nodes.some(node => node.ignored !== true && node.name?.value === '搜索专家'))
  assert.ok(ax.nodes.some(node => node.ignored !== true && node.name?.value === '新建专家'))
  assert.equal(await evaluate('[...document.querySelectorAll(".expert-card button, .expert-create-button")].every(button => button.disabled)'), true)

  for (const theme of ['light', 'dark']) {
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] })
    for (const width of [1280, 320]) {
      // Keep the product root unknown. Media emulation verifies its honest CSS fallback.
      window.setContentSize(width === 320 ? 640 : 1280, 900)
      window.webContents.setZoomFactor(width === 320 ? 2 : 1)
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
      await click('input[aria-label="搜索专家"]')
      const geometry = await evaluate(`(() => {
        const page = document.querySelector('.experts-page');
        const search = document.querySelector('input[aria-label="搜索专家"]');
        const rect = node => { const r=node.getBoundingClientRect(); return {left:r.left,right:r.right,width:r.width}; };
        return {width:innerWidth,rootScroll:document.documentElement.scrollWidth,page:rect(page),search:rect(search),cards:[...document.querySelectorAll('.expert-card')].map(rect),background:getComputedStyle(document.querySelector('.expert-card')).backgroundColor};
      })()`)
      assert.ok(Math.abs(geometry.width - width) <= 1, `viewport ${width}`)
      assert.ok(geometry.rootScroll <= geometry.width + 1, `root overflow at ${theme}/${width}: ${geometry.rootScroll}`)
      for (const rect of [geometry.page, geometry.search, ...geometry.cards]) {
        assert.ok(rect.width > 0 && rect.left >= -1 && rect.right <= geometry.width + 1, `expert reflow at ${theme}/${width}: ${JSON.stringify(rect)}`)
      }
      evidence.geometry.push({ theme, ...geometry })
      await screenshot(`experts-${theme}-${width}.png`)
    }
  }
  assert.notEqual(evidence.geometry[0].background, evidence.geometry[2].background)
  await click('button[aria-label="新任务"]')
  await waitFor('document.querySelector(".experts-page") === null', 'back to home')
  await click('button[aria-label="专家"]')
  await waitFor('document.querySelectorAll(".expert-card").length === 53', 'return to catalogue')
  evidence.navigation = true
  assert.deepEqual(await evaluate('globalThis.__expertCspViolations'), [])
  assert.deepEqual(evidence.postRequests, [])
  assert.deepEqual(evidence.assetFailures, [])
  assert.equal(policy.isTrustedGeneration(), true)
}

function finish(error) {
  if (finished) return
  finished = true
  clearTimeout(timeout)
  evidence.policy = policy.snapshot()
  if (error) evidence.fatal = `${error.name}: ${error.message}`
  const out = process.env.SAGE_EXPERTS_PROBE_EVIDENCE
  if (out) {
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'experts-window-result.json'), JSON.stringify(evidence, null, 2) + '\n')
  }
  writeFileSync(1, `SAGE_EXPERTS_WINDOW_RESULT ${JSON.stringify(evidence)}\n`)
  if (window && !window.isDestroyed()) window.destroy()
  app.exit(error ? 1 : 0)
}
run().then(() => finish(), finish)
