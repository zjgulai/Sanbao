import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arguments_ = process.argv.slice(2)
const out = arguments_.shift()
const port = arguments_[0]?.startsWith('--') === false ? arguments_.shift() : '9232'
let phase = 'baseline'
let expectedPath
while (arguments_.length > 0) {
  const argument = arguments_.shift()
  if (argument === '--phase') phase = arguments_.shift()
  else if (argument === '--expected') expectedPath = arguments_.shift()
  else throw new Error(`Unknown argument: ${argument}`)
}
if (!out || !['baseline', 'first-save', 'restart'].includes(phase)) {
  throw new Error('Usage: node desktop-live-check.mjs <evidence-dir> [cdp-port] [--phase baseline|first-save|restart] [--expected <first-save-result.json>]')
}
if (phase === 'restart' && expectedPath === undefined) throw new Error('--expected is required for restart')
if (phase !== 'restart' && expectedPath !== undefined) throw new Error('--expected is only valid for restart')
const expectedResult = expectedPath === undefined ? undefined : JSON.parse(readFileSync(expectedPath, 'utf8'))
const settingsControlIds = {
  theme: 'device-preferences-theme',
  language: 'device-preferences-language',
  density: 'device-preferences-density',
  fontStyle: 'device-preferences-font-style',
  contentWidth: 'device-preferences-content-width',
  terminalTheme: 'device-preferences-terminal-theme',
  fileIcons: 'device-preferences-file-icons',
  iconAppearance: 'device-preferences-icon-appearance',
}
mkdirSync(out, { recursive: true })
const pages = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) }).then(response => response.json())
const productPages = pages.filter(page => page.type === 'page' && !page.url.startsWith('devtools:'))
assert.equal(productPages.length, 1, 'exactly one product window')
assert.equal(productPages[0].url, 'dsh-app://app/index.html')
const socket = new WebSocket(productPages[0].webSocketDebuggerUrl)
const pending = new Map()
const requests = []
const requestsById = new Map()
const exceptions = []
const consoleErrors = []
let nextId = 0
let requestSequence = 0
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === 'Network.requestWillBeSent') {
    const request = {
      requestId: message.params.requestId,
      sequence: ++requestSequence,
      url: message.params.request.url,
      pathname: new URL(message.params.request.url).pathname,
      method: message.params.request.method,
      ...(message.params.request.postData === undefined ? {} : { postData: message.params.request.postData }),
      status: null,
      finished: false,
    }
    requests.push(request)
    requestsById.set(message.params.requestId, request)
  }
  if (message.method === 'Network.responseReceived') {
    const request = requestsById.get(message.params.requestId)
    if (request !== undefined) request.status = message.params.response.status
  }
  if (message.method === 'Network.loadingFinished') {
    const request = requestsById.get(message.params.requestId)
    if (request !== undefined) request.finished = true
  }
  if (message.method === 'Network.loadingFailed') {
    const request = requestsById.get(message.params.requestId)
    if (request !== undefined) {
      request.finished = true
      request.failure = message.params.errorText
    }
  }
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text)
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(message.params.type)) {
    consoleErrors.push(message.params.args.map(argument => argument.value ?? argument.description ?? '').join(' '))
  }
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
async function waitUntil(predicate, label) {
  const end = Date.now() + 8000
  while (Date.now() < end) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 40))
  }
  throw new Error(`Condition not reached: ${label}`)
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
async function screenshot(name, fullPage = false) {
  const parameters = { format: 'png', captureBeyondViewport: fullPage }
  if (fullPage) {
    const { cssContentSize } = await send('Page.getLayoutMetrics')
    parameters.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 }
  }
  const { data } = await send('Page.captureScreenshot', parameters)
  writeFileSync(join(out, name), Buffer.from(data, 'base64'))
}
async function chooseNativeSelect(selector, value) {
  const optionIndex = await evaluate(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)})
    if (!(control instanceof HTMLSelectElement)) throw new Error('Missing native select')
    const index = [...control.options].findIndex(option => option.value === ${JSON.stringify(value)})
    if (index < 0) throw new Error('Missing target option')
    control.focus()
    return index
  })()`)
  await key('Home', 36)
  for (let index = 0; index < optionIndex; index += 1) await key('ArrowDown', 40)
  await waitFor(`document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`)
}
function assertDevicePreferences(value) {
  assert.deepEqual(Object.keys(value).sort(), ['effectiveTheme', 'requested', 'savedAt'])
  assert.deepEqual(Object.keys(value.requested).sort(), ['contentWidth', 'density', 'fileIcons', 'fontStyle', 'iconAppearance', 'language', 'terminalTheme', 'theme'])
  assert.ok(['light', 'dark', 'system'].includes(value.requested.theme))
  assert.ok(['zh', 'en'].includes(value.requested.language))
  assert.ok(['comfortable', 'compact'].includes(value.requested.density))
  assert.ok(['sans', 'serif'].includes(value.requested.fontStyle))
  assert.ok(['standard', 'wide'].includes(value.requested.contentWidth))
  assert.ok(['follow', 'manual'].includes(value.requested.terminalTheme))
  assert.ok(['product', 'material'].includes(value.requested.fileIcons))
  assert.ok(['system', 'light', 'dark'].includes(value.requested.iconAppearance))
  assert.ok(value.savedAt === null || (typeof value.savedAt === 'string' && new Date(value.savedAt).toISOString() === value.savedAt))
  assert.ok(value.effectiveTheme === null || value.effectiveTheme === 'light' || value.effectiveTheme === 'dark')
  assert.equal('systemDark' in value, false)
  assert.equal('applies' in value, false)
}
async function settingsValues() {
  return evaluate(`Object.fromEntries([...document.querySelectorAll('.settings-appearance select')].map(control => [control.name, control.value]))`)
}
async function captureSettingsGeometry(prefix, expected) {
  const rows = []
  for (const width of [1440, 660, 320]) {
    await viewport(width, 'dark')
    const geometry = await evaluate(`(() => {
      const section = document.querySelector('.settings-appearance')
      const fieldset = section?.querySelector('fieldset')
      const button = section?.querySelector('button[type="submit"]')
      const status = section?.querySelector('[role="status"]')
      const rect = node => { const value = node?.getBoundingClientRect(); return value === undefined ? null : { left:value.left, right:value.right, top:value.top, bottom:value.bottom, width:value.width, height:value.height } }
      return {
        width: innerWidth,
        htmlScroll: document.documentElement.scrollWidth,
        bodyScroll: document.body.scrollWidth,
        section: rect(section),
        fieldset: rect(fieldset),
        controls: [...section.querySelectorAll('select')].map(control => ({ name:control.name, value:control.value, disabled:control.disabled, visible:control.getClientRects().length > 0, rect:rect(control) })),
        button: { disabled:button?.disabled, visible:button?.getClientRects().length > 0, rect:rect(button) },
        status: { visible:status?.getClientRects().length > 0, rect:rect(status) },
      }
    })()`)
    rows.push(geometry)
    assert.equal(geometry.width, width, `settings viewport width at ${width}`)
    assert.ok(geometry.htmlScroll <= width + 1, `settings html horizontal reflow at ${width}`)
    assert.ok(geometry.bodyScroll <= width + 1, `settings body horizontal reflow at ${width}`)
    assert.ok(geometry.section.left >= -1 && geometry.section.right <= width + 1, `settings section remains inside viewport at ${width}`)
    assert.ok(geometry.fieldset.width > 120, `settings fieldset remains readable at ${width}`)
    assert.equal(geometry.controls.length, 8, `settings control count at ${width}`)
    assert.ok(geometry.controls.every(control => control.visible && !control.disabled && control.rect.width > 80 && control.rect.left >= -1 && control.rect.right <= width + 1), `settings controls remain usable at ${width}`)
    assert.deepEqual(Object.fromEntries(geometry.controls.map(control => [control.name, control.value])), expected, `settings values remain authoritative at ${width}`)
    assert.ok(geometry.button.visible && !geometry.button.disabled && geometry.button.rect.left >= -1 && geometry.button.rect.right <= width + 1, `settings save remains usable at ${width}`)
    assert.ok(geometry.status.visible && geometry.status.rect.left >= -1 && geometry.status.rect.right <= width + 1, `settings status remains visible at ${width}`)
    await screenshot(`desktop-settings-${prefix}-${width}-dark-compact.png`, true)
  }
  return rows
}
const evidence = { phase, productWindows: productPages.map(({ url, title }) => ({ url, title })), reads: {}, requests, exceptions, consoleErrors }
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
  evidence.reads.devicePreferences = await evaluate(`fetch('/.sage/device-preferences',{cache:'no-store'}).then(async r=>({status:r.status,body:await r.json()}))`)
  assert.equal(evidence.reads.devicePreferences.status, 200)
  assertDevicePreferences(evidence.reads.devicePreferences.body)
  const requestedPreferences = evidence.reads.devicePreferences.body.requested
  await waitFor(`document.documentElement.dataset.sageThemeRequested === ${JSON.stringify(requestedPreferences.theme)}`)
  await waitFor(`document.documentElement.dataset.sageDensity === ${JSON.stringify(requestedPreferences.density)}`)
  assert.equal(await evaluate('document.documentElement.dataset.sageThemeEffective'), evidence.reads.devicePreferences.body.effectiveTheme ?? 'unknown')
  await viewport(1440)
  await screenshot('desktop-home-1440-light.png')
  await click('button[aria-label="账号与设置"]')
  await waitFor("!!document.querySelector('[role=menu][aria-label=\"账号菜单\"]')")
  await click('button[aria-label="账号与设置页"]')
  await waitFor("document.querySelectorAll('.settings-appearance select').length === 8")
  await waitFor(`[...document.querySelectorAll('.settings-appearance select')].every(control => ${JSON.stringify(requestedPreferences)}[control.name] === control.value)`)
  evidence.reads.settings = await evaluate(`({
    heading: document.querySelector('.settings-appearance h2')?.textContent,
    selects: [...document.querySelectorAll('.settings-appearance select')].map(control => ({ id: control.id, name: control.name, value: control.value, disabled: control.disabled })),
    copy: document.querySelector('.settings-appearance header p')?.textContent,
  })`)
  assert.equal(evidence.reads.settings.heading, '外观与显示')
  assert.deepEqual(evidence.reads.settings.selects.map(({ name }) => name).sort(), ['contentWidth', 'density', 'fileIcons', 'fontStyle', 'iconAppearance', 'language', 'terminalTheme', 'theme'])
  assert.deepEqual(Object.fromEntries(evidence.reads.settings.selects.map(({ name, id }) => [name, id])), settingsControlIds)
  assert.ok(evidence.reads.settings.selects.every(({ disabled }) => !disabled), 'all eight settings controls must be enabled')
  assert.deepEqual(Object.fromEntries(evidence.reads.settings.selects.map(({ name, value }) => [name, value])), requestedPreferences)
  assert.match(evidence.reads.settings.copy, /其余六项仅保存/)

  if (phase === 'first-save') {
    const freshDefaults = {
      theme: 'system',
      language: 'zh',
      density: 'comfortable',
      fontStyle: 'sans',
      contentWidth: 'standard',
      terminalTheme: 'follow',
      fileIcons: 'product',
      iconAppearance: 'system',
    }
    const savedValues = {
      theme: 'dark',
      language: 'en',
      density: 'compact',
      fontStyle: 'serif',
      contentWidth: 'wide',
      terminalTheme: 'manual',
      fileIcons: 'material',
      iconAppearance: 'dark',
    }
    assert.deepEqual(evidence.reads.devicePreferences.body.requested, freshDefaults)
    assert.equal(evidence.reads.devicePreferences.body.savedAt, null)
    await evaluate(`(() => {
      window.__sagePreferenceAcceptance = []
      const form = document.querySelector('.settings-appearance form')
      const status = document.querySelector('.settings-appearance [role="status"]')
      const record = () => window.__sagePreferenceAcceptance.push({ busy:form?.getAttribute('aria-busy'), status:status?.textContent })
      new MutationObserver(record).observe(form, { attributes:true, childList:true, subtree:true, characterData:true })
      record()
    })()`)
    for (const [name, value] of Object.entries(savedValues)) {
      await chooseNativeSelect(`#${settingsControlIds[name]}`, value)
    }
    assert.deepEqual(await settingsValues(), savedValues)
    const transactionMarker = requestSequence
    await click('.settings-appearance button[type="submit"]')
    await waitFor("document.querySelector('.settings-appearance [role=status]')?.textContent.includes('已保存到本设备：')")
    await waitUntil(() => {
      const transaction = requests.filter(request => request.sequence > transactionMarker
        && (request.pathname === '/.sage/preferences' || request.pathname === '/.sage/device-preferences'))
      return transaction.length >= 2 && transaction.every(request => request.finished)
    }, 'preferences POST followed by authoritative GET')
    const transaction = requests.filter(request => request.sequence > transactionMarker
      && (request.pathname === '/.sage/preferences' || request.pathname === '/.sage/device-preferences'))
    assert.equal(transaction.length, 2, 'save must issue exactly one POST and one authoritative GET')
    const [post, read] = transaction
    assert.equal(post.method, 'POST')
    assert.equal(post.pathname, '/.sage/preferences')
    assert.equal(post.status, 200)
    assert.deepEqual(JSON.parse(post.postData), savedValues)
    assert.equal(read.method, 'GET')
    assert.equal(read.pathname, '/.sage/device-preferences')
    assert.equal(read.status, 200)
    assert.ok(read.sequence > post.sequence, 'authoritative GET must follow preference POST')
    const response = await send('Network.getResponseBody', { requestId: read.requestId })
    assert.equal(response.base64Encoded, false, 'device preferences response must be JSON text')
    const authoritative = JSON.parse(response.body)
    read.responseBody = authoritative
    assertDevicePreferences(authoritative)
    assert.deepEqual(authoritative.requested, savedValues)
    assert.equal(typeof authoritative.savedAt, 'string')
    assert.equal(authoritative.effectiveTheme, 'dark')
    assert.deepEqual(await settingsValues(), authoritative.requested)
    assert.equal(await evaluate('document.documentElement.dataset.sageThemeRequested'), 'dark')
    assert.equal(await evaluate('document.documentElement.dataset.sageThemeEffective'), 'dark')
    assert.equal(await evaluate('document.documentElement.dataset.sageDensity'), 'compact')
    assert.match(await evaluate("document.querySelector('.settings-appearance [role=status]')?.textContent"), new RegExp(authoritative.savedAt.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')))
    const history = await evaluate('window.__sagePreferenceAcceptance')
    assert.ok(history.some(item => item.busy === 'true' || item.status?.includes('正在保存')), 'settings must expose an observed saving state')
    evidence.reads.preferenceTransaction = { marker: transactionMarker, postSequence: post.sequence, getSequence: read.sequence }
    evidence.reads.authoritativeDevicePreferences = authoritative
    evidence.reads.settingsGeometry = await captureSettingsGeometry('first-save', authoritative.requested)
  } else if (phase === 'restart') {
    const expected = expectedResult?.reads?.authoritativeDevicePreferences
    assertDevicePreferences(expected)
    assert.deepEqual(evidence.reads.devicePreferences.body, expected, 'restart GET must preserve requested values and savedAt')
    assert.deepEqual(await settingsValues(), expected.requested)
    assert.equal(await evaluate('document.documentElement.dataset.sageThemeRequested'), expected.requested.theme)
    assert.equal(await evaluate('document.documentElement.dataset.sageThemeEffective'), expected.effectiveTheme ?? 'unknown')
    assert.equal(await evaluate('document.documentElement.dataset.sageDensity'), expected.requested.density)
    evidence.reads.authoritativeDevicePreferences = evidence.reads.devicePreferences.body
    evidence.reads.settingsGeometry = await captureSettingsGeometry('restart', expected.requested)
    assert.equal(requests.filter(request => request.method === 'POST' && request.pathname === '/.sage/preferences').length, 0, 'restart must not POST device preferences')
  }

  if (phase === 'baseline') {
  evidence.reads.settingsGeometry = []
  for (const width of [1440, 660, 320]) {
    await viewport(width)
    const geometry = await evaluate(`({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      fieldsetWidth: document.querySelector('.settings-appearance fieldset')?.getBoundingClientRect().width,
      selectWidths: [...document.querySelectorAll('.settings-appearance select')].map(control => control.getBoundingClientRect().width),
    })`)
    evidence.reads.settingsGeometry.push(geometry)
    assert.ok(geometry.scroll <= geometry.width + 1, `settings horizontal reflow at ${width}`)
    assert.ok(geometry.fieldsetWidth > 120, `settings fieldset remains readable at ${width}`)
    assert.ok(geometry.selectWidths.every(value => value > 80), `settings controls remain readable at ${width}`)
    await screenshot(`desktop-settings-${width}.png`)
  }
  await viewport(1440)
  await click('button[aria-label="新任务"]')
  await waitFor("document.querySelector('h1')?.textContent === '不止于编程'")
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
  // T03-D: the search page posts the real read-only route. Production refuses it with
  // search-unavailable (ADR-0268: search still needs its own object resolver), so the page must
  // show that refusal verbatim and render no result rows — never an invented hit list.
  await waitFor(`!!document.querySelector('textarea[aria-label="搜索查询"]')`)
  await evaluate(`(() => { const t = document.querySelector('textarea[aria-label="搜索查询"]'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await click('textarea[aria-label="搜索查询"]')
  await send('Input.insertText', { text: '运行时状态' })
  await waitFor(`document.querySelector('textarea[aria-label="搜索查询"]').value === '运行时状态'`)
  await click('button[aria-label="执行搜索"]')
  await waitFor(`document.querySelector('.search-note')?.textContent.includes('搜索不可用')`)
  assert.equal(await evaluate("document.querySelectorAll('.search-hit').length"), 0)
  assert.equal(await evaluate("document.querySelectorAll('.search-section').length"), 0)
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
  // T03-D: the search POST is the one expected write-shaped request of this phase; every other
  // non-GET/HEAD request would still be an unplanned business write.
  const searchPosts = requests.filter(request => request.method === 'POST' && request.url.endsWith('/.sage/search'))
  assert.equal(searchPosts.length, 1)
  assert.equal(requests.filter(request => request.method !== 'GET' && request.method !== 'HEAD' && !request.url.endsWith('/.sage/search')).length, 0)
  evidence.reads.interactions = { settingsMounted: true, draftRetained: true, enterDidNotDispatch: true, navigationRetained: true, escapeReturnedFocus: true, retryReadObserved: true, searchRefused: true, searchPosts: searchPosts.length }
  evidence.reads.geometry = []
  for (const [width, theme] of [[1440, 'dark'], [660, 'light'], [320, 'light']]) {
    await viewport(width, theme)
    const geometry = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,inputWidth:document.querySelector('textarea').getBoundingClientRect().width,ink:getComputedStyle(document.body).color,theme:document.documentElement.dataset.sageThemeEffective})`)
    evidence.reads.geometry.push({ ...geometry, themeSimulation: theme })
    assert.ok(geometry.scroll <= geometry.width + 1, `horizontal reflow at ${width}`)
    assert.ok(geometry.inputWidth > 80, `readable input width at ${width}`)
    await screenshot(`desktop-${width}-${theme}.png`)
  }
  }
  assert.deepEqual(exceptions, [])
  assert.deepEqual(consoleErrors, [])
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
