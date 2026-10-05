import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [out, port = '9232'] = process.argv.slice(2)
if (!out) throw new Error('Usage: node desktop-live-check.mjs <evidence-dir> [cdp-port]')
mkdirSync(out, { recursive: true })
const pages = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) }).then(response => response.json())
const productPages = pages.filter(page => page.type === 'page' && !page.url.startsWith('devtools:'))
assert.equal(productPages.length, 1, 'exactly one product window')
assert.equal(productPages[0].url, 'dsh-app://app/index.html')
const socket = new WebSocket(productPages[0].webSocketDebuggerUrl)
const pending = new Map()
const requests = []
const exceptions = []
let nextId = 0
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === 'Network.requestWillBeSent') requests.push({ url: message.params.request.url, method: message.params.request.method })
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text)
  const waiter = pending.get(message.id)
  if (!waiter) return
  pending.delete(message.id)
  clearTimeout(waiter.timer)
  if (message.error) waiter.reject(new Error(message.error.message))
  else waiter.resolve(message.result)
})
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 5000)
  socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
  socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')) }, { once: true })
})
function send(method, params = {}) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 10000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
  return response.result.value
}
async function waitFor(expression) {
  const end = Date.now() + 8000
  while (Date.now() < end) {
    if (await evaluate(expression)) return
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  throw new Error(`Condition not reached: ${expression}`)
}
async function click(selector) {
  const point = await evaluate(`(() => { const n = document.querySelector(${JSON.stringify(selector)}); if (!n) throw new Error('Missing control'); n.scrollIntoView({block:'nearest'}); const r = n.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2} })()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
}
async function key(keyValue, virtualKey, modifiers = 0) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyValue, windowsVirtualKeyCode: virtualKey, modifiers })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyValue, windowsVirtualKeyCode: virtualKey, modifiers })
}
async function viewport(width, theme = 'light') {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] })
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
}
async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(out, name), Buffer.from(data, 'base64'))
}
const evidence = { productWindows: productPages.map(({ url, title }) => ({ url, title })), reads: {}, requests, exceptions }
try {
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  await waitFor("document.querySelector('#sage-desktop-root')?.dataset.sageDesktopMounted === 'true'")
  await waitFor("document.querySelector('[data-desktop-read]')?.dataset.desktopRead === 'blocked'")
  evidence.reads.initial = await evaluate(`({title:document.title, heading:document.querySelector('h1')?.textContent, catalog:!!document.querySelector('.state-directory,.review-bar'), sidebar:document.querySelector('aside')?.innerText, input:!!document.querySelector('textarea[aria-label="任务输入"]'), state:document.querySelector('[data-desktop-read]')?.dataset.desktopRead})`)
  assert.equal(evidence.reads.initial.heading, '不止于编程')
  assert.equal(evidence.reads.initial.catalog, false)
  assert.equal(evidence.reads.initial.input, true)
  evidence.reads.service = await evaluate(`fetch('/.sage/state',{cache:'no-store'}).then(async r=>({status:r.status,body:await r.json()}))`)
  assert.equal(evidence.reads.service.status, 200)
  assert.equal(evidence.reads.service.body.code, 'projection-read-unavailable')
  evidence.reads.csp = await evaluate("fetch('/index.html',{method:'HEAD'}).then(r=>r.headers.get('content-security-policy'))")
  assert.match(evidence.reads.csp, /frame-src 'none'/)
  evidence.reads.bootstrap = await evaluate(`fetch('/.sage/bootstrap',{cache:'no-store'}).then(async r=>({status:r.status,body:await r.json()}))`)
  assert.equal(evidence.reads.bootstrap.status, 200)
  assert.deepEqual(Object.keys(evidence.reads.bootstrap.body).sort(), ['auth', 'display', 'runtime'])
  assert.ok(['ready', 'recovering', 'unavailable'].includes(evidence.reads.bootstrap.body.runtime?.status))
  assert.ok(['signed-in', 'signed-out', 'pending'].includes(evidence.reads.bootstrap.body.auth?.status))
  assert.equal('displayName' in evidence.reads.bootstrap.body.auth, false)
  assert.ok(['light', 'dark', 'system'].includes(evidence.reads.bootstrap.body.display?.theme))
  assert.ok(['comfortable', 'compact'].includes(evidence.reads.bootstrap.body.display?.density))
  assert.equal(await evaluate("document.querySelector('.account-row small')?.textContent"), '未登录')
  await viewport(1440)
  await screenshot('desktop-home-1440-light.png')
  // Deterministic precondition: the tool may re-run against the same live page, so the draft
  // flow starts from an explicitly emptied composer instead of assuming a fresh window.
  await evaluate(`(() => { const t = document.querySelector('textarea[aria-label="任务输入"]'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await click('textarea[aria-label="任务输入"]')
  await send('Input.insertText', { text: '请保留这份未发送的草稿' })
  await waitFor("document.querySelector('textarea').value === '请保留这份未发送的草稿'")
  // Both send triggers share one submit path; the notice text is unique to each trigger moment so
  // a silent no-op cannot pass: button first, then reset the notice through the context menu,
  // then Enter with focus back in the textarea.
  await click('button[aria-label="发送任务"]')
  await waitFor("document.querySelector('.composer-local-note')?.textContent.includes('发送尚未接通')")
  assert.equal(await evaluate("document.querySelector('textarea').value"), '请保留这份未发送的草稿')
  await click('button[aria-label="添加上下文"]')
  await waitFor("!!document.querySelector('[role=menu]')")
  await click('button[aria-label="工作区文件：不可用"]')
  await waitFor("document.querySelector('.composer-local-note')?.textContent.includes('工作区文件尚未接通')")
  await click('textarea[aria-label="任务输入"]')
  await key('Enter', 13)
  await waitFor("document.querySelector('.composer-local-note')?.textContent.includes('发送尚未接通')")
  assert.equal(await evaluate("document.querySelector('textarea').value"), '请保留这份未发送的草稿')
  await click('button[aria-label="搜索"]')
  assert.equal(await evaluate("document.querySelector('h1').textContent"), '搜索')
  await click('button[aria-label="新任务"]')
  assert.equal(await evaluate("document.querySelector('textarea').value"), '请保留这份未发送的草稿')
  await click('button[aria-label="添加上下文"]')
  await waitFor("!!document.querySelector('[role=menu]')")
  await key('ArrowDown', 40)
  await key('Escape', 27)
  await waitFor("!document.querySelector('[role=menu]')")
  assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), '添加上下文')
  const before = requests.filter(request => request.url.endsWith('/.sage/state')).length
  await click('#desktop-read-retry')
  await waitFor("document.querySelector('[data-desktop-read]')?.dataset.desktopRead === 'blocked'")
  assert.equal(requests.filter(request => request.url.endsWith('/.sage/state')).length, before + 1)
  assert.equal(await evaluate("document.querySelector('textarea').value"), '请保留这份未发送的草稿')
  assert.equal(requests.filter(request => request.method !== 'GET' && request.method !== 'HEAD').length, 0)
  evidence.reads.interactions = { draftRetained: true, enterDidNotDispatch: true, navigationRetained: true, escapeReturnedFocus: true, retryReadObserved: true, writes: 0 }
  evidence.reads.geometry = []
  for (const [width, theme] of [[1440, 'dark'], [660, 'light'], [320, 'light']]) {
    await viewport(width, theme)
    const geometry = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,inputWidth:document.querySelector('textarea').getBoundingClientRect().width,ink:getComputedStyle(document.body).color,theme:document.documentElement.dataset.sageThemeEffective})`)
    evidence.reads.geometry.push({ ...geometry, themeSimulation: theme })
    assert.ok(geometry.scroll <= geometry.width + 1, `horizontal reflow at ${width}`)
    assert.ok(geometry.inputWidth > 80, `readable input width at ${width}`)
    await screenshot(`desktop-${width}-${theme}.png`)
  }
  assert.deepEqual(exceptions, [])
  evidence.passed = true
} catch (error) {
  evidence.passed = false
  evidence.error = error.message
  process.exitCode = 1
} finally {
  await send('Emulation.clearDeviceMetricsOverride').catch(() => {})
  await send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {})
  writeFileSync(join(out, 'desktop-live-result.json'), JSON.stringify(evidence, null, 2) + '\n')
  socket.close()
}
console.log(JSON.stringify(evidence, null, 2))
