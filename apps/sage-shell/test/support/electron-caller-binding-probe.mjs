import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, protocol, session } from 'electron'

const SCHEME = 'dsh-app'
const ORIGIN = `${SCHEME}://app`
const ROUTE_PREFIX = '/.sage/probe/'
const RESULT_PREFIX = 'SAGE_CALLER_BINDING_RESULT '
const SENTINEL = 'sage-caller-binding-sentinel'
const PROBE_TIMEOUT_MS = 30_000
const ABORT_TIMEOUT_MS = 2_000
const ATTEMPT_TIMEOUT_MS = 3_000
const probeRoot = process.env.SAGE_ELECTRON_CALLER_PROBE_ROOT

if (probeRoot === undefined || probeRoot.length === 0) {
  throw new Error('SAGE_ELECTRON_CALLER_PROBE_ROOT is required')
}
for (const name of ['user-data', 'session-data', 'crash-dumps', 'logs']) {
  mkdirSync(join(probeRoot, name), { recursive: true })
}
app.setPath('userData', join(probeRoot, 'user-data'))
app.setPath('sessionData', join(probeRoot, 'session-data'))
app.setPath('crashDumps', join(probeRoot, 'crash-dumps'))
app.setAppLogsPath(join(probeRoot, 'logs'))

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: false,
    stream: true,
    codeCache: true,
  },
}])
app.disableHardwareAcceleration()

let sequence = 0
let trustedWindow
let trustedSession
let differentSession
const windows = new Set()
const attempts = []
const gateEvents = []
const handlerEvents = []
const abortEvents = []
const harnessErrors = []

function nextSequence() {
  sequence += 1
  return sequence
}

function safeErrorName(error) {
  return error instanceof Error && error.name.length > 0 ? error.name : 'Error'
}

function caseIdFromUrl(rawUrl) {
  const url = new URL(rawUrl)
  if (url.protocol !== `${SCHEME}:` || url.hostname !== 'app' || !url.pathname.startsWith(ROUTE_PREFIX)) {
    return null
  }
  const caseId = url.pathname.slice(ROUTE_PREFIX.length)
  return caseId.length === 0 ? null : caseId
}

function createWindow(targetSession) {
  const window = new BrowserWindow({
    show: false,
    width: 640,
    height: 480,
    webPreferences: {
      session: targetSession,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  })
  windows.add(window)
  window.once('closed', () => { windows.delete(window) })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return window
}

function page(body = '') {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function waitForAbort(signal) {
  if (signal.aborted) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve(false)
    }, ABORT_TIMEOUT_MS)
    const onAbort = () => {
      clearTimeout(timer)
      resolve(true)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function installGate(targetSession, sessionLabel) {
  targetSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const caseId = caseIdFromUrl(details.url)
    if (caseId === null) {
      callback({})
      return
    }

    let callbackCalled = false
    const finish = (cancel, entry) => {
      if (callbackCalled) {
        harnessErrors.push(`gate callback repeated for ${caseId}`)
        return
      }
      callbackCalled = true
      gateEvents.push({ ...entry, callbackCount: 1, decision: cancel ? 'cancel' : 'allow' })
      callback({ cancel })
    }

    try {
      const expectedContents = trustedWindow !== undefined && !trustedWindow.isDestroyed()
        ? trustedWindow.webContents
        : null
      const frame = details.frame ?? null
      const entry = {
        sequence: nextSequence(),
        caseId,
        sessionLabel,
        webContentsId: details.webContentsId ?? null,
        hasWebContents: details.webContents !== undefined,
        webContentsSessionMatchesListener: details.webContents?.session === targetSession,
        webContentsDestroyed: details.webContents === undefined ? null : details.webContents.isDestroyed(),
        isExpectedWebContents: expectedContents !== null && details.webContents === expectedContents,
        hasFrame: frame !== null,
        frameIsExpectedMain: expectedContents !== null && frame === expectedContents.mainFrame,
        frameOrigin: frame?.origin ?? null,
        frameDetached: frame?.detached ?? null,
        frameDestroyed: frame === null ? null : frame.isDestroyed(),
        frameParentIsNull: frame !== null && frame.parent === null,
        frameTopIsSelf: frame !== null && frame.top === frame,
        resourceType: details.resourceType,
      }
      const allowed = expectedContents !== null
        && targetSession === trustedSession
        && details.webContentsId === expectedContents.id
        && details.webContents === expectedContents
        && details.webContents.session === targetSession
        && !details.webContents.isDestroyed()
        && frame === expectedContents.mainFrame
        && frame.origin === ORIGIN
        && frame.detached === false
        && !frame.isDestroyed()
        && frame.parent === null
        && frame.top === frame
        && details.resourceType === 'xhr'
      finish(!allowed, entry)
    } catch (error) {
      harnessErrors.push(`gate threw for ${caseId}: ${safeErrorName(error)}`)
      finish(true, {
        sequence: nextSequence(),
        caseId,
        sessionLabel,
        webContentsId: null,
        hasWebContents: false,
        webContentsSessionMatchesListener: false,
        webContentsDestroyed: null,
        isExpectedWebContents: false,
        hasFrame: false,
        frameIsExpectedMain: false,
        frameOrigin: null,
        frameDetached: null,
        frameDestroyed: null,
        frameParentIsNull: false,
        frameTopIsSelf: false,
        resourceType: details.resourceType,
      })
    }
  })
}

function installProtocolHandler(targetSession, sessionLabel) {
  targetSession.protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'app') return new Response(null, { status: 404 })
    if (url.pathname === '/index.html') {
      return page(`<iframe name="probe-subframe" src="${ORIGIN}/frame.html"></iframe><iframe name="probe-opaque" sandbox="allow-scripts" srcdoc="<meta charset='utf-8'><title>opaque</title>"></iframe>`)
    }
    if (url.pathname === '/frame.html' || url.pathname === '/attacker.html' || url.pathname === '/after-navigation.html') {
      return page()
    }

    const caseId = caseIdFromUrl(request.url)
    if (caseId === null) return new Response(null, { status: 404 })
    handlerEvents.push({ sequence: nextSequence(), caseId, sessionLabel })
    if (caseId === 'trusted-navigation-abort' || caseId === 'trusted-destroy-abort' || caseId === 'trusted-explicit-abort') {
      const aborted = await waitForAbort(request.signal)
      abortEvents.push({ sequence: nextSequence(), caseId, aborted })
    }
    return new Response(`${SENTINEL}:${caseId}`, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  })
}

async function rendererFetch(frame, caseId) {
  try {
    const execution = frame.executeJavaScript(`(async () => {
      const controller = new AbortController()
      if (${JSON.stringify(caseId)} === 'trusted-explicit-abort') globalThis.__sageCallerBindingAbortController = controller
      const timer = ${caseId === 'trusted-navigation-abort' || caseId === 'trusted-destroy-abort' || caseId === 'trusted-explicit-abort' ? 'null' : 'setTimeout(() => controller.abort(), 2000)'}
      try {
        const response = await fetch(${JSON.stringify(`${ORIGIN}${ROUTE_PREFIX}${caseId}`)}, { signal: controller.signal })
        return { outcome: 'response', status: response.status, body: await response.text() }
      } catch (error) {
        return { outcome: 'rejected', errorName: error instanceof Error ? error.name : 'Error' }
      } finally {
        if (globalThis.__sageCallerBindingAbortController === controller) delete globalThis.__sageCallerBindingAbortController
        if (timer !== null) clearTimeout(timer)
      }
    })()`)
    const result = await Promise.race([
      execution,
      new Promise((resolve) => setTimeout(() => resolve({ outcome: 'timeout' }), ATTEMPT_TIMEOUT_MS)),
    ])
    attempts.push({ caseId, channel: 'renderer-fetch', ...result })
  } catch (error) {
    attempts.push({ caseId, channel: 'renderer-fetch', outcome: 'execution-rejected', errorName: safeErrorName(error) })
  }
}

async function imageRequest(frame, caseId) {
  try {
    const result = await frame.executeJavaScript(`new Promise((resolve) => {
      const image = new Image()
      const timer = setTimeout(() => resolve({ outcome: 'timeout' }), 2000)
      image.onload = () => { clearTimeout(timer); resolve({ outcome: 'loaded' }) }
      image.onerror = () => { clearTimeout(timer); resolve({ outcome: 'rejected' }) }
      image.src = ${JSON.stringify(`${ORIGIN}${ROUTE_PREFIX}${caseId}`)}
    })`)
    attempts.push({ caseId, channel: 'renderer-image', ...result })
  } catch (error) {
    attempts.push({ caseId, channel: 'renderer-image', outcome: 'execution-rejected', errorName: safeErrorName(error) })
  }
}

async function sessionFetch(caseId) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS)
  try {
    const response = await trustedSession.fetch(`${ORIGIN}${ROUTE_PREFIX}${caseId}`, {
      headers: { origin: ORIGIN },
      signal: controller.signal,
    })
    attempts.push({ caseId, channel: 'session-fetch', outcome: 'response', status: response.status, body: await response.text() })
  } catch (error) {
    attempts.push({ caseId, channel: 'session-fetch', outcome: 'rejected', errorName: safeErrorName(error) })
  } finally {
    clearTimeout(timer)
  }
}

async function navigationRequest(window, caseId) {
  try {
    const outcome = await Promise.race([
      window.loadURL(`${ORIGIN}${ROUTE_PREFIX}${caseId}`).then(() => 'loaded', () => 'rejected'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), ATTEMPT_TIMEOUT_MS)),
    ])
    if (outcome === 'timeout') window.webContents.stop()
    attempts.push({ caseId, channel: 'navigation', outcome })
  } catch (error) {
    attempts.push({ caseId, channel: 'navigation', outcome: 'rejected', errorName: safeErrorName(error) })
  }
}

async function waitFor(predicate, description, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${description}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function eventsFor(events, caseId) {
  return events.filter((event) => event.caseId === caseId)
}

function evaluate() {
  const failures = []
  const attemptFor = (caseId) => attempts.find((attempt) => attempt.caseId === caseId)
  const requireFact = (condition, message) => { if (!condition) failures.push(message) }
  const requireAllowed = (caseId, requireResponse = true) => {
    const gate = eventsFor(gateEvents, caseId)
    const handler = eventsFor(handlerEvents, caseId)
    const attempt = attemptFor(caseId)
    requireFact(gate.length === 1 && gate[0]?.decision === 'allow', `${caseId}: expected exactly one allow gate`)
    requireFact(gate[0]?.callbackCount === 1, `${caseId}: gate callback was not exactly once`)
    requireFact(gate[0]?.isExpectedWebContents === true, `${caseId}: expected trusted WebContents`)
    requireFact(gate[0]?.webContentsSessionMatchesListener === true, `${caseId}: expected WebContents on listener Session`)
    requireFact(gate[0]?.webContentsDestroyed === false, `${caseId}: expected live WebContents`)
    requireFact(gate[0]?.frameIsExpectedMain === true, `${caseId}: expected trusted main frame`)
    requireFact(gate[0]?.frameOrigin === ORIGIN, `${caseId}: expected exact frame origin`)
    requireFact(gate[0]?.frameDetached === false, `${caseId}: expected attached frame`)
    requireFact(gate[0]?.frameDestroyed === false, `${caseId}: expected live frame`)
    requireFact(gate[0]?.frameParentIsNull === true, `${caseId}: expected top-level frame parent`)
    requireFact(gate[0]?.frameTopIsSelf === true, `${caseId}: expected self top frame`)
    requireFact(gate[0]?.resourceType === 'xhr', `${caseId}: expected xhr resource type`)
    requireFact(handler.length === 1, `${caseId}: expected exactly one protocol handler hit`)
    requireFact((gate[0]?.sequence ?? Number.MAX_SAFE_INTEGER) < (handler[0]?.sequence ?? 0), `${caseId}: gate did not precede handler`)
    if (requireResponse) {
      requireFact(attempt?.outcome === 'response' && attempt.status === 200 && attempt.body === `${SENTINEL}:${caseId}`, `${caseId}: renderer did not receive exact sentinel`)
    }
  }
  const requireCancelled = (caseId) => {
    const gate = eventsFor(gateEvents, caseId)
    const handler = eventsFor(handlerEvents, caseId)
    const attempt = attemptFor(caseId)
    requireFact(gate.length === 1 && gate[0]?.decision === 'cancel', `${caseId}: expected exactly one cancel gate`)
    requireFact(gate[0]?.callbackCount === 1, `${caseId}: gate callback was not exactly once`)
    requireFact(handler.length === 0, `${caseId}: cancelled request reached protocol handler`)
    requireFact(attempt !== undefined && attempt.outcome !== 'response' && attempt.outcome !== 'loaded', `${caseId}: caller unexpectedly received a response`)
  }

  requireAllowed('trusted-main-frame-fetch')
  requireCancelled('trusted-subframe-fetch')
  requireCancelled('same-session-same-origin-other-window')
  requireCancelled('same-session-opaque-origin-image')
  requireCancelled('same-session-session-fetch-spoofed-origin')
  requireCancelled('trusted-main-frame-navigation')

  const differentPartition = attemptFor('different-partition-fetch')
  requireFact(differentPartition !== undefined && differentPartition.outcome !== 'response', 'different-partition-fetch: request unexpectedly succeeded')
  requireFact(eventsFor(gateEvents, 'different-partition-fetch').length === 1 && eventsFor(gateEvents, 'different-partition-fetch')[0]?.decision === 'cancel', 'different-partition-fetch: expected an explicit cancel gate')
  requireFact(eventsFor(handlerEvents, 'different-partition-fetch').length === 0, 'different-partition-fetch: request entered trusted Session handler')

  for (const caseId of ['trusted-navigation-abort', 'trusted-destroy-abort']) {
    requireAllowed(caseId, false)
    const abort = eventsFor(abortEvents, caseId)
    requireFact(abort.length === 1 && abort[0]?.aborted === true, `${caseId}: protocol Request.signal did not abort`)
  }
  requireAllowed('trusted-explicit-abort', false)
  const explicitAbort = eventsFor(abortEvents, 'trusted-explicit-abort')
  const explicitAttempt = attemptFor('trusted-explicit-abort')
  requireFact(explicitAbort.length === 1 && explicitAbort[0]?.aborted === true, 'trusted-explicit-abort: protocol Request.signal did not observe explicit abort')
  requireFact(explicitAttempt?.outcome === 'rejected' && explicitAttempt.errorName === 'AbortError', 'trusted-explicit-abort: renderer did not receive AbortError')
  return failures
}

async function run() {
  await app.whenReady()
  const partition = `sage-caller-binding-probe-${process.pid}-${Date.now()}`
  const otherPartition = `${partition}-other`
  trustedSession = session.fromPartition(partition, { cache: false })
  differentSession = session.fromPartition(otherPartition, { cache: false })
  trustedWindow = createWindow(trustedSession)
  installGate(trustedSession, 'trusted')
  installProtocolHandler(trustedSession, 'trusted')
  installGate(differentSession, 'different')
  installProtocolHandler(differentSession, 'different')
  if (!trustedSession.protocol.isProtocolHandled(SCHEME) || !differentSession.protocol.isProtocolHandled(SCHEME)) {
    throw new Error('probe protocol handler was not registered on both Sessions')
  }

  await trustedWindow.loadURL(`${ORIGIN}/index.html`)
  await waitFor(() => trustedWindow.webContents.mainFrame.frames.length === 2, 'trusted subframes')
  const subframe = trustedWindow.webContents.mainFrame.frames.find((frame) => frame.name === 'probe-subframe')
  const opaqueFrame = trustedWindow.webContents.mainFrame.frames.find((frame) => frame.name === 'probe-opaque')
  if (subframe === undefined) throw new Error('trusted subframe was not created')
  if (opaqueFrame === undefined) throw new Error('opaque subframe was not created')

  await rendererFetch(trustedWindow.webContents.mainFrame, 'trusted-main-frame-fetch')
  await rendererFetch(subframe, 'trusted-subframe-fetch')

  const otherWindow = createWindow(trustedSession)
  await otherWindow.loadURL(`${ORIGIN}/attacker.html`)
  await rendererFetch(otherWindow.webContents.mainFrame, 'same-session-same-origin-other-window')

  await imageRequest(opaqueFrame, 'same-session-opaque-origin-image')

  await sessionFetch('same-session-session-fetch-spoofed-origin')
  await navigationRequest(trustedWindow, 'trusted-main-frame-navigation')
  if (trustedWindow.webContents.getURL() !== `${ORIGIN}/index.html`) {
    await trustedWindow.loadURL(`${ORIGIN}/index.html`)
  }

  const differentWindow = createWindow(differentSession)
  await differentWindow.loadURL(`${ORIGIN}/attacker.html`)
  await rendererFetch(differentWindow.webContents.mainFrame, 'different-partition-fetch')

  const navigationPromise = rendererFetch(trustedWindow.webContents.mainFrame, 'trusted-navigation-abort')
  await waitFor(() => eventsFor(handlerEvents, 'trusted-navigation-abort').length === 1, 'navigation-abort handler')
  await trustedWindow.loadURL(`${ORIGIN}/after-navigation.html`)
  await navigationPromise
  await waitFor(() => eventsFor(abortEvents, 'trusted-navigation-abort').length === 1, 'navigation-abort signal', ABORT_TIMEOUT_MS + 1_000)

  const destroyPromise = rendererFetch(trustedWindow.webContents.mainFrame, 'trusted-destroy-abort')
  await waitFor(() => eventsFor(handlerEvents, 'trusted-destroy-abort').length === 1, 'destroy-abort handler')
  trustedWindow.destroy()
  await destroyPromise
  await waitFor(() => eventsFor(abortEvents, 'trusted-destroy-abort').length === 1, 'destroy-abort signal', ABORT_TIMEOUT_MS + 1_000)

  trustedWindow = createWindow(trustedSession)
  await trustedWindow.loadURL(`${ORIGIN}/after-navigation.html`)
  const explicitAbortPromise = rendererFetch(trustedWindow.webContents.mainFrame, 'trusted-explicit-abort')
  await waitFor(() => eventsFor(handlerEvents, 'trusted-explicit-abort').length === 1, 'explicit-abort handler')
  const controllerFound = await trustedWindow.webContents.mainFrame.executeJavaScript(`(() => {
    const controller = globalThis.__sageCallerBindingAbortController
    if (controller === undefined) return false
    controller.abort()
    return true
  })()`)
  if (!controllerFound) throw new Error('explicit AbortController was not available')
  await explicitAbortPromise
  await waitFor(() => eventsFor(abortEvents, 'trusted-explicit-abort').length === 1, 'explicit-abort signal', ABORT_TIMEOUT_MS + 1_000)

  const failures = evaluate()
  const outcome = harnessErrors.length > 0
    ? 'harness-fatal'
    : failures.length === 0
      ? 'pass'
      : 'no-go'
  return {
    schemaVersion: 1,
    outcome,
    versions: {
      electron: process.versions.electron ?? null,
      chromium: process.versions.chrome ?? null,
      node: process.versions.node,
      processType: process.type ?? null,
      electronRunAsNodePresent: Object.hasOwn(process.env, 'ELECTRON_RUN_AS_NODE'),
    },
    partition,
    otherPartition,
    attempts,
    gateEvents,
    handlerEvents,
    abortEvents,
    failures: outcome === 'harness-fatal' ? [...harnessErrors] : failures,
    passed: outcome === 'pass',
    ...(outcome === 'harness-fatal' ? { fatal: 'probe instrumentation invariant failed' } : {}),
  }
}

function cleanup() {
  try { trustedSession?.webRequest.onBeforeRequest(null) } catch {}
  try { differentSession?.webRequest.onBeforeRequest(null) } catch {}
  try {
    if (trustedSession?.protocol.isProtocolHandled(SCHEME)) trustedSession.protocol.unhandle(SCHEME)
  } catch {}
  try {
    if (differentSession?.protocol.isProtocolHandled(SCHEME)) differentSession.protocol.unhandle(SCHEME)
  } catch {}
  for (const window of windows) {
    try { if (!window.isDestroyed()) window.destroy() } catch {}
  }
}

let finished = false
const watchdog = setTimeout(() => {
  if (finished) return
  finished = true
  cleanup()
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify({
    schemaVersion: 1,
    outcome: 'harness-fatal',
    passed: false,
    fatal: 'probe-timeout',
    failures: [`probe exceeded ${PROBE_TIMEOUT_MS}ms`],
  })}\n`, () => app.exit(1))
}, PROBE_TIMEOUT_MS)

void run().then((result) => {
  if (finished) return
  finished = true
  clearTimeout(watchdog)
  cleanup()
  const exitCode = result.outcome === 'pass' ? 0 : result.outcome === 'no-go' ? 2 : 1
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(result)}\n`, () => app.exit(exitCode))
}).catch((error) => {
  if (finished) return
  finished = true
  clearTimeout(watchdog)
  cleanup()
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify({
    schemaVersion: 1,
    outcome: 'harness-fatal',
    passed: false,
    fatal: safeErrorName(error),
    failures: [error instanceof Error ? error.message : 'unknown probe error'],
  })}\n`, () => app.exit(1))
})
