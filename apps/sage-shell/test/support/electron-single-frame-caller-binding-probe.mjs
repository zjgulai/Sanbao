import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, protocol, session } from 'electron'

const SCHEME = 'dsh-app'
const ORIGIN = `${SCHEME}://app`
const OTHER_ORIGIN = `${SCHEME}://other`
const READ_CHANNEL = 'sage-single-frame:read-projection'
const BEGIN_CHANNEL = 'sage-single-frame:begin-operation'
const RESULT_PREFIX = 'SAGE_SINGLE_FRAME_CALLER_BINDING_RESULT '
const PRELOAD_PATH = join(dirname(fileURLToPath(import.meta.url)), 'electron-single-frame-caller-binding-preload.cjs')
const PROBE_TIMEOUT_MS = 55_000
const STEP_TIMEOUT_MS = 4_000
const EFFECT_DELAY_MS = 80
const PENDING_EFFECT_DELAY_MS = 700
const CONTROL_EFFECT_DELAY_MS = 15_000
const EARLY_RACE_ROUNDS = 8
const CASE_ID = /^[a-z][a-z0-9-]{0,95}$/u
const STRICT_CSP = "default-src 'none'; script-src 'unsafe-inline'; frame-src 'none'; child-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
const ADVERSARIAL_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; frame-src 'self' dsh-app: data: blob:; child-src 'self' dsh-app: data: blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
// frame-ancestors 'none' on an embeddable page would block the very child load the
// counterfactual and contamination cases rely on (ERR_BLOCKED_BY_RESPONSE); only top
// documents are forbidden from being embedded.
const EMBEDDABLE_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; frame-src 'self' dsh-app: data: blob:; child-src 'self' dsh-app: data: blob:; frame-ancestors 'self' dsh-app:; object-src 'none'; base-uri 'none'; form-action 'none'"
const probeRoot = process.env.SAGE_ELECTRON_SINGLE_FRAME_PROBE_ROOT

if (probeRoot === undefined || probeRoot.length === 0) {
  throw new Error('SAGE_ELECTRON_SINGLE_FRAME_PROBE_ROOT is required')
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
app.on('window-all-closed', () => {})

let sequence = 0
let operationCounter = 0
let syntheticEffectCounter = 0
let navigationTokenCounter = 0
const windows = new Set()
const windowStates = new Map()
const expectedWindowByCase = new Map()
const operations = new Map()
const operationTasks = new Set()
const activeTimers = new Set()
const installedIpcHandlers = new Set()
const installedProtocolSessions = new Set()
const attempts = []
const bindingEvents = []
const barrierEvents = []
const generationEvents = []
const frameEvents = []
const operationEvents = []
const syntheticEffects = []
const securityProfiles = []
const cspResponses = []
const harnessErrors = []
const failures = []
const prevention = {
  windowOpenAttempts: 0,
  windowOpenDenied: 0,
  webviewAttachAttempts: 0,
  webviewAttachDenied: 0,
  strictSubframeNavigationsDenied: 0,
  unownedTopNavigationsDenied: 0,
}
let trustedSession
let protocolHandlerCount = 0
let preloadSurface = null
let cleanupEvidence = null

function nextSequence() {
  sequence += 1
  return sequence
}

function safeErrorName(error) {
  return error instanceof Error && error.name.length > 0 ? error.name : 'Error'
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)
}

function safeRead(read, fallback) {
  try {
    return read()
  } catch {
    return fallback
  }
}

function exactPlainObject(value, keys) {
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isCaseId(value) {
  return typeof value === 'string' && CASE_ID.test(value)
}

function trackedDelay(delayMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      activeTimers.delete(timer)
      resolve()
    }, delayMs)
    activeTimers.add(timer)
  })
}

async function withTimeout(promise, timeoutMs, message) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          activeTimers.delete(timer)
          reject(new Error(message))
        }, timeoutMs)
        activeTimers.add(timer)
      }),
    ])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
      activeTimers.delete(timer)
    }
  }
}

async function waitUntil(predicate, message, timeoutMs = STEP_TIMEOUT_MS) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const value = predicate()
    if (value) return value
    await trackedDelay(10)
  }
  throw new Error(message)
}

function abortableDelay(signal, delayMs) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve('aborted')
      return
    }
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      if (timer !== undefined) {
        clearTimeout(timer)
        activeTimers.delete(timer)
      }
      resolve(value)
    }
    const onAbort = () => { finish('aborted') }
    const timer = setTimeout(() => {
      activeTimers.delete(timer)
      finish('elapsed')
    }, delayMs)
    activeTimers.add(timer)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function activeCaseId(state) {
  return state?.activeCaseId ?? 'unassigned'
}

function frameFacts(frame, mainFrame) {
  return {
    present: frame !== null,
    isCurrentMain: frame !== null && frame === mainFrame,
    origin: frame === null ? null : safeRead(() => frame.origin, null),
    url: frame === null ? null : safeRead(() => frame.url, null),
    detached: frame === null ? null : safeRead(() => frame.detached, true),
    destroyed: frame === null ? null : safeRead(() => frame.isDestroyed(), true),
    parentIsNull: frame !== null && safeRead(() => frame.parent === null, false),
    topIsSelf: frame !== null && safeRead(() => frame.top === frame, false),
    frameTreeNodeId: frame === null ? null : safeRead(() => frame.frameTreeNodeId, null),
    processId: frame === null ? null : safeRead(() => frame.processId, null),
    routingId: frame === null ? null : safeRead(() => frame.routingId, null),
  }
}

function frameTreeFacts(contents) {
  if (contents.isDestroyed()) {
    return { readable: false, count: null, onlyCurrentMain: false, ids: [] }
  }
  try {
    const main = contents.mainFrame
    const frames = main.framesInSubtree
    return {
      readable: true,
      count: frames.length,
      onlyCurrentMain: frames.length === 1 && frames[0] === main,
      ids: frames.map((frame) => safeRead(() => frame.frameTreeNodeId, null)),
    }
  } catch {
    return { readable: false, count: null, onlyCurrentMain: false, ids: [] }
  }
}

function operationEvent(operation, event, detail = {}) {
  operationEvents.push({
    sequence: nextSequence(),
    caseId: operation.caseId,
    operationRef: operation.operationRef,
    generation: operation.generation,
    event,
    phase: operation.phase,
    aborted: operation.controller.signal.aborted,
    terminalReason: operation.terminalReason,
    syntheticEffectCounter,
    ...detail,
  })
}

function cancelOperationsForContents(contents, reason) {
  for (const operation of operations.values()) {
    if (operation.ownerContents !== contents) continue
    if (operation.phase !== 'accepted') continue
    operation.controller.abort(reason)
    operation.phase = 'cancelled'
    operation.terminalReason = reason
    operationEvent(operation, 'cancelled', { reason })
  }
}

function markContaminated(contents, reason, eventName, detail = {}) {
  const state = windowStates.get(contents)
  if (state === undefined) return
  if (state.mode === 'control' && eventName === 'child-contamination') {
    generationEvents.push({
      sequence: nextSequence(),
      caseId: activeCaseId(state),
      windowLabel: state.label,
      event: 'control-child-observed',
      generation: state.generation,
      reason,
      ready: state.ready,
      contaminated: state.contaminated,
      ...detail,
    })
    return
  }
  if (state.pendingNavigation !== null) {
    state.pendingNavigation.sawChild = true
    state.pendingNavigation.contaminationReasons.push(reason)
  }
  const firstForGeneration = !state.contaminated
  state.contaminated = true
  state.ready = false
  if (!state.contaminationReasons.includes(reason)) state.contaminationReasons.push(reason)
  generationEvents.push({
    sequence: nextSequence(),
    caseId: activeCaseId(state),
    windowLabel: state.label,
    event: eventName,
    generation: state.generation,
    reason,
    firstForGeneration,
    ready: state.ready,
    contaminated: state.contaminated,
    ...detail,
  })
  cancelOperationsForContents(contents, reason)
}

function startOwnedNavigation(contents, state, url) {
  const pending = state.pendingNavigation
  if (pending === null || pending.expectedUrl !== url) return false
  pending.started = true
  pending.nextGeneration = state.generation + 1
  state.ready = false
  cancelOperationsForContents(contents, 'top-cross-document-navigation')
  generationEvents.push({
    sequence: nextSequence(),
    caseId: pending.caseId,
    windowLabel: state.label,
    event: 'owned-top-navigation-started',
    generation: state.generation,
    nextGeneration: pending.nextGeneration,
    ready: state.ready,
    contaminated: state.contaminated,
    navigationToken: pending.token,
    url,
  })
  return true
}

function commitOwnedNavigation(contents, state) {
  const pending = state.pendingNavigation
  if (pending === null || !pending.started || !pending.committed) return
  const main = safeRead(() => contents.mainFrame, null)
  const tree = frameTreeFacts(contents)
  const mainFacts = frameFacts(main, main)
  const exactOrigin = mainFacts.origin === ORIGIN
  const clean = state.mode === 'control'
    ? exactOrigin
    : tree.readable && tree.onlyCurrentMain && !pending.sawChild && exactOrigin
  state.generation = pending.nextGeneration
  state.mainFrame = main
  state.activeCaseId = pending.caseId
  state.ready = clean
  state.contaminated = !clean
  state.contaminationReasons = clean ? [] : [...new Set(pending.contaminationReasons)]
  generationEvents.push({
    sequence: nextSequence(),
    caseId: pending.caseId,
    windowLabel: state.label,
    event: clean ? 'clean-generation-committed' : 'contaminated-generation-committed',
    generation: state.generation,
    navigationToken: pending.token,
    ready: state.ready,
    contaminated: state.contaminated,
    frameTreeReadable: tree.readable,
    frameCount: tree.count,
    onlyCurrentMain: tree.onlyCurrentMain,
    mainOrigin: mainFacts.origin,
    reasons: [...state.contaminationReasons],
  })
  state.pendingNavigation = null
}

function createWindow(label, mode, preventionMode = 'adversarial') {
  const window = new BrowserWindow({
    show: false,
    width: 720,
    height: 540,
    paintWhenInitiallyHidden: false,
    webPreferences: {
      session: trustedSession,
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      backgroundThrottling: false,
      devTools: false,
    },
  })
  securityProfiles.push({
    label,
    mode,
    preventionMode,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    nodeIntegrationInSubFrames: false,
    webviewTag: false,
  })
  const contents = window.webContents
  const state = {
    label,
    mode,
    preventionMode,
    generation: 0,
    ready: false,
    contaminated: false,
    contaminationReasons: [],
    mainFrame: null,
    activeCaseId: 'window-created',
    pendingNavigation: null,
  }
  windows.add(window)
  windowStates.set(contents, state)
  window.once('closed', () => { windows.delete(window) })
  contents.on('preload-error', (_event, _path, error) => {
    harnessErrors.push(`preload-error:${label}:${safeErrorName(error)}`)
  })
  contents.setWindowOpenHandler((details) => {
    prevention.windowOpenAttempts += 1
    prevention.windowOpenDenied += 1
    frameEvents.push({
      sequence: nextSequence(),
      caseId: activeCaseId(state),
      windowLabel: label,
      event: 'window-open-denied',
      url: details.url,
      isMainFrame: false,
    })
    return { action: 'deny' }
  })
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    prevention.webviewAttachAttempts += 1
    prevention.webviewAttachDenied += 1
    event.preventDefault()
    frameEvents.push({
      sequence: nextSequence(),
      caseId: activeCaseId(state),
      windowLabel: label,
      event: 'webview-attach-denied',
      url: params.src ?? null,
      isMainFrame: false,
      nodeIntegration: webPreferences.nodeIntegration ?? null,
    })
    markContaminated(contents, 'webview-attach-attempt', 'child-contamination')
  })
  contents.on('frame-created', (_event, details) => {
    const main = safeRead(() => contents.mainFrame, null)
    const frame = details.frame ?? null
    const facts = frameFacts(frame, main)
    const isMainFrame = facts.present && facts.parentIsNull && facts.topIsSelf
    frameEvents.push({
      sequence: nextSequence(),
      caseId: activeCaseId(state),
      windowLabel: label,
      event: 'frame-created',
      isMainFrame,
      ...facts,
    })
    if (!isMainFrame) {
      markContaminated(contents, 'non-main-frame-created', 'child-contamination', {
        frameTreeNodeId: facts.frameTreeNodeId,
      })
    }
  })
  contents.on('will-frame-navigate', (details) => {
    const facts = frameFacts(details.frame ?? null, safeRead(() => contents.mainFrame, null))
    frameEvents.push({
      sequence: nextSequence(),
      caseId: activeCaseId(state),
      windowLabel: label,
      event: 'will-frame-navigate',
      isMainFrame: details.isMainFrame,
      isSameDocument: details.isSameDocument,
      targetUrl: details.url,
      ...facts,
    })
    if (!details.isMainFrame) {
      markContaminated(contents, 'non-main-frame-navigation', 'child-contamination', {
        targetUrl: details.url,
      })
      if (state.preventionMode === 'strict') {
        details.preventDefault()
        prevention.strictSubframeNavigationsDenied += 1
      }
      return
    }
    const pending = state.pendingNavigation
    if (pending === null || pending.expectedUrl !== details.url) {
      details.preventDefault()
      prevention.unownedTopNavigationsDenied += 1
      markContaminated(contents, 'unowned-top-navigation', 'top-navigation-denied', {
        targetUrl: details.url,
      })
    }
  })
  contents.on('did-start-navigation', (details) => {
    const facts = frameFacts(details.frame ?? null, safeRead(() => contents.mainFrame, null))
    frameEvents.push({
      sequence: nextSequence(),
      caseId: activeCaseId(state),
      windowLabel: label,
      event: 'did-start-navigation',
      isMainFrame: details.isMainFrame,
      isSameDocument: details.isSameDocument,
      targetUrl: details.url,
      ...facts,
    })
    if (!details.isMainFrame) {
      markContaminated(contents, 'non-main-frame-navigation-started', 'child-contamination', {
        targetUrl: details.url,
      })
      return
    }
    if (details.isSameDocument) {
      generationEvents.push({
        sequence: nextSequence(),
        caseId: activeCaseId(state),
        windowLabel: label,
        event: 'same-document-navigation-observed',
        generation: state.generation,
        ready: state.ready,
        contaminated: state.contaminated,
        url: details.url,
      })
      return
    }
    if (!startOwnedNavigation(contents, state, details.url)) {
      markContaminated(contents, 'unowned-top-navigation-started', 'top-navigation-invalidated', {
        targetUrl: details.url,
      })
    }
  })
  contents.on('did-frame-navigate', (_event, url, _code, _text, isMainFrame, processId, routingId) => {
    frameEvents.push({
      sequence: nextSequence(),
      caseId: activeCaseId(state),
      windowLabel: label,
      event: 'did-frame-navigate',
      isMainFrame,
      targetUrl: url,
      processId,
      routingId,
    })
    if (!isMainFrame) {
      markContaminated(contents, 'non-main-frame-navigation-committed', 'child-contamination', {
        targetUrl: url,
      })
      return
    }
    const pending = state.pendingNavigation
    if (pending !== null && pending.started && pending.expectedUrl === url) {
      pending.committed = true
      generationEvents.push({
        sequence: nextSequence(),
        caseId: pending.caseId,
        windowLabel: label,
        event: 'owned-top-navigation-committed',
        generation: state.generation,
        nextGeneration: pending.nextGeneration,
        navigationToken: pending.token,
        url,
      })
      return
    }
    markContaminated(contents, 'unowned-top-navigation-committed', 'top-navigation-invalidated', {
      targetUrl: url,
    })
  })
  contents.on('did-frame-finish-load', (_event, isMainFrame) => {
    if (isMainFrame) commitOwnedNavigation(contents, state)
  })
  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    frameEvents.push({
      sequence: nextSequence(),
      caseId: activeCaseId(state),
      windowLabel: label,
      event: 'did-fail-load',
      isMainFrame,
      targetUrl: validatedURL,
      errorCode,
      errorDescription,
    })
    if (isMainFrame) {
      harnessErrors.push(`main-load-failed:${label}:${errorCode}:${errorDescription}`)
      markContaminated(contents, 'main-load-failed', 'top-navigation-invalidated')
      state.pendingNavigation = null
    }
  })
  contents.on('render-process-gone', (_event, details) => {
    markContaminated(contents, `render-process-gone:${details.reason}`, 'renderer-invalidated')
  })
  contents.on('destroyed', () => {
    markContaminated(contents, 'web-contents-destroyed', 'renderer-invalidated')
  })
  return window
}

function topHarnessScript() {
  return `<script>
    globalThis.__sageProbeMessages = [];
    globalThis.__sageCspViolations = [];
    addEventListener('message', (event) => {
      const value = event.data;
      if (value && typeof value === 'object' && value.source === 'sage-single-frame-child') {
        globalThis.__sageProbeMessages.push(value);
      }
    });
    addEventListener('securitypolicyviolation', (event) => {
      globalThis.__sageCspViolations.push({
        blockedURI: event.blockedURI,
        effectiveDirective: event.effectiveDirective,
        violatedDirective: event.violatedDirective,
      });
    });
  </script>`
}

function html(body = '') {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`
}

function responsePage(body, csp, path) {
  cspResponses.push({ sequence: nextSequence(), path, csp })
  return new Response(html(body), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': csp,
    },
  })
}

function installProtocolHandler(targetSession) {
  targetSession.protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'app' && url.hostname !== 'other') return new Response(null, { status: 404 })
    const path = url.pathname
    if (path === '/clean-strict.html') {
      return responsePage(topHarnessScript(), STRICT_CSP, path)
    }
    if (path === '/clean-adversarial.html') {
      return responsePage(topHarnessScript(), ADVERSARIAL_CSP, path)
    }
    if (path === '/parser-same-origin.html') {
      return responsePage(`${topHarnessScript()}<iframe id="parser-child" src="${ORIGIN}/frame.html"></iframe>`, ADVERSARIAL_CSP, path)
    }
    if (path === '/frame.html') {
      return responsePage('', EMBEDDABLE_CSP, path)
    }
    if (path === '/nested-parent.html') {
      return responsePage('<iframe id="nested-child" src="dsh-app://app/frame.html"></iframe>', EMBEDDABLE_CSP, path)
    }
    return new Response(null, { status: 404 })
  })
  installedProtocolSessions.add(targetSession)
  protocolHandlerCount += 1
}

function denied() {
  return { ok: false, code: 'unavailable' }
}

function inspectWindowBinding(event, caseId, phase) {
  const expectedWindow = expectedWindowByCase.get(caseId)
  const expectedContents = expectedWindow !== undefined && !expectedWindow.isDestroyed()
    ? expectedWindow.webContents
    : null
  const sender = event.sender
  const state = expectedContents === null ? undefined : windowStates.get(expectedContents)
  const frame = safeRead(() => event.senderFrame, null)
  const currentMain = sender.isDestroyed() ? null : safeRead(() => sender.mainFrame, null)
  const facts = frameFacts(frame, currentMain)
  const tree = frameTreeFacts(sender)
  if (state?.mode === 'candidate' && (!tree.readable || !tree.onlyCurrentMain)) {
    markContaminated(sender, tree.readable ? 'live-frame-tree-not-single' : 'live-frame-tree-unreadable', `${phase}-frame-tree-rejected`, {
      frameCount: tree.count,
    })
  }
  const refreshedState = expectedContents === null ? undefined : windowStates.get(expectedContents)
  const eventProcessId = safeRead(() => event.processId, null)
  const eventFrameId = safeRead(() => event.frameId, null)
  const platformAllowed = expectedContents !== null
    && sender === expectedContents
    && !sender.isDestroyed()
    && sender.session === trustedSession
    && frame !== null
    && frame === currentMain
    && facts.origin === ORIGIN
    && facts.detached === false
    && facts.destroyed === false
    && facts.parentIsNull
    && facts.topIsSelf
    && eventProcessId === facts.processId
    && eventFrameId === facts.routingId
  const lifecycleAllowed = refreshedState !== undefined
    && refreshedState.ready
    && refreshedState.mainFrame === currentMain
    && refreshedState.pendingNavigation === null
  const singleFrameAllowed = refreshedState?.mode === 'control'
    || (refreshedState !== undefined && !refreshedState.contaminated && tree.readable && tree.onlyCurrentMain)
  return {
    allowed: platformAllowed && lifecycleAllowed && singleFrameAllowed,
    state: refreshedState,
    facts: {
      senderIsExpected: expectedContents !== null && sender === expectedContents,
      senderSessionMatches: sender.session === trustedSession,
      senderDestroyed: sender.isDestroyed(),
      senderFrameIsCurrentMain: frame !== null && frame === currentMain,
      senderFrameOrigin: facts.origin,
      senderFrameDetached: facts.detached,
      senderFrameDestroyed: facts.destroyed,
      senderFrameParentIsNull: facts.parentIsNull,
      senderFrameTopIsSelf: facts.topIsSelf,
      eventProcessMatchesSenderFrame: frame !== null && eventProcessId === facts.processId,
      eventFrameMatchesSenderFrame: frame !== null && eventFrameId === facts.routingId,
      frameTreeReadable: tree.readable,
      frameCount: tree.count,
      frameTreeOnlyCurrentMain: tree.onlyCurrentMain,
      generation: refreshedState?.generation ?? null,
      ready: refreshedState?.ready ?? false,
      contaminated: refreshedState?.contaminated ?? true,
      mode: refreshedState?.mode ?? null,
    },
  }
}

function recordBinding(channel, caseId, binding, decision) {
  const entry = {
    sequence: nextSequence(),
    caseId,
    channel,
    decision,
    ...binding.facts,
  }
  bindingEvents.push(entry)
  return entry
}

function inspectBarrier(operation) {
  const contents = operation.ownerContents
  const state = windowStates.get(contents)
  const currentMain = !contents.isDestroyed() ? safeRead(() => contents.mainFrame, null) : null
  const tree = frameTreeFacts(contents)
  if (state?.mode === 'candidate' && (!tree.readable || !tree.onlyCurrentMain)) {
    markContaminated(contents, tree.readable ? 'barrier-frame-tree-not-single' : 'barrier-frame-tree-unreadable', 'barrier-frame-tree-rejected', {
      frameCount: tree.count,
    })
  }
  const refreshed = windowStates.get(contents)
  const mainFacts = frameFacts(currentMain, currentMain)
  const allowed = refreshed !== undefined
    && !contents.isDestroyed()
    && contents.session === trustedSession
    && refreshed.ready
    && refreshed.pendingNavigation === null
    && refreshed.mainFrame === currentMain
    && refreshed.generation === operation.generation
    && mainFacts.origin === ORIGIN
    && mainFacts.detached === false
    && mainFacts.destroyed === false
    && mainFacts.parentIsNull
    && mainFacts.topIsSelf
    && (refreshed.mode === 'control' || (!refreshed.contaminated && tree.readable && tree.onlyCurrentMain))
  const entry = {
    sequence: nextSequence(),
    caseId: operation.caseId,
    operationRef: operation.operationRef,
    decision: allowed ? 'allow' : 'deny',
    operationGeneration: operation.generation,
    currentGeneration: refreshed?.generation ?? null,
    ready: refreshed?.ready ?? false,
    contaminated: refreshed?.contaminated ?? true,
    mainOrigin: mainFacts.origin,
    frameTreeReadable: tree.readable,
    frameCount: tree.count,
    frameTreeOnlyCurrentMain: tree.onlyCurrentMain,
  }
  barrierEvents.push(entry)
  return { allowed, entry }
}

function effectDelayFor(caseId) {
  if (caseId === 'counterfactual-top-bridge') return CONTROL_EFFECT_DELAY_MS
  if (caseId === 'pending-before-contamination') return PENDING_EFFECT_DELAY_MS
  return EFFECT_DELAY_MS
}

async function runOperation(operation) {
  const waitResult = await abortableDelay(operation.controller.signal, effectDelayFor(operation.caseId))
  if (waitResult === 'aborted' || operation.phase !== 'accepted') return
  const barrier = inspectBarrier(operation)
  operationEvent(operation, 'barrier-checked', { decision: barrier.allowed ? 'allow' : 'deny' })
  if (!barrier.allowed) {
    operation.phase = 'cancelled'
    operation.terminalReason = 'freshness-denied'
    operation.controller.abort('freshness-denied')
    operationEvent(operation, 'cancelled', { reason: 'freshness-denied' })
    return
  }
  operation.phase = 'dispatched'
  operationEvent(operation, 'dispatched')
  syntheticEffectCounter += 1
  operation.effectCommitted = true
  syntheticEffects.push({
    sequence: nextSequence(),
    caseId: operation.caseId,
    operationRef: operation.operationRef,
    count: syntheticEffectCounter,
  })
  operation.phase = 'completed'
  operation.terminalReason = 'completed'
  operationEvent(operation, 'completed')
}

function createOperation(caseId, contents, state) {
  operationCounter += 1
  const operation = {
    caseId,
    operationRef: `single-frame-operation-${operationCounter}`,
    ownerContents: contents,
    generation: state.generation,
    controller: new AbortController(),
    phase: 'accepted',
    terminalReason: null,
    effectCommitted: false,
  }
  operations.set(operation.operationRef, operation)
  operationEvent(operation, 'accepted')
  const task = runOperation(operation)
    .catch((error) => {
      harnessErrors.push(`operation-task:${caseId}:${safeErrorName(error)}:${safeErrorMessage(error)}`)
    })
    .finally(() => { operationTasks.delete(task) })
  operationTasks.add(task)
  return operation
}

function installIpcHandlers() {
  ipcMain.handle(READ_CHANNEL, (event, input) => {
    const caseId = exactPlainObject(input, ['caseId']) && isCaseId(input.caseId) ? input.caseId : 'invalid-read-input'
    const binding = inspectWindowBinding(event, caseId, 'entry')
    const validInput = exactPlainObject(input, ['caseId']) && isCaseId(input.caseId)
    recordBinding('read', caseId, binding, binding.allowed && validInput ? 'allow' : 'deny')
    if (!binding.allowed || !validInput) return denied()
    return {
      ok: true,
      value: `projection:${caseId}:generation-${binding.state.generation}`,
    }
  })
  installedIpcHandlers.add(READ_CHANNEL)
  ipcMain.handle(BEGIN_CHANNEL, (event, input) => {
    const caseId = exactPlainObject(input, ['caseId']) && isCaseId(input.caseId) ? input.caseId : 'invalid-begin-input'
    const binding = inspectWindowBinding(event, caseId, 'entry')
    const validInput = exactPlainObject(input, ['caseId']) && isCaseId(input.caseId)
    recordBinding('begin', caseId, binding, binding.allowed && validInput ? 'allow' : 'deny')
    if (!binding.allowed || !validInput || binding.state === undefined) return denied()
    const operation = createOperation(caseId, event.sender, binding.state)
    return { ok: true, operationRef: operation.operationRef }
  })
  installedIpcHandlers.add(BEGIN_CHANNEL)
}

async function loadOwned(window, path, caseId) {
  if (!isCaseId(caseId)) throw new Error(`invalid load case id ${caseId}`)
  const contents = window.webContents
  const state = windowStates.get(contents)
  if (state === undefined) throw new Error('window state missing')
  const url = `${ORIGIN}${path}`
  navigationTokenCounter += 1
  state.activeCaseId = caseId
  state.pendingNavigation = {
    token: navigationTokenCounter,
    caseId,
    expectedUrl: url,
    started: false,
    committed: false,
    nextGeneration: state.generation + 1,
    sawChild: false,
    contaminationReasons: [],
  }
  expectedWindowByCase.set(caseId, window)
  generationEvents.push({
    sequence: nextSequence(),
    caseId,
    windowLabel: state.label,
    event: 'owned-top-navigation-intent',
    generation: state.generation,
    nextGeneration: state.generation + 1,
    navigationToken: navigationTokenCounter,
    url,
  })
  try {
    await withTimeout(window.loadURL(url), STEP_TIMEOUT_MS, `top navigation timed out for ${caseId}`)
    await waitUntil(
      () => state.pendingNavigation === null,
      `top navigation did not commit a generation for ${caseId}`,
    )
  } catch (error) {
    state.ready = false
    state.contaminated = true
    state.contaminationReasons.push('owned-top-navigation-failed')
    state.pendingNavigation = null
    throw error
  }
  return state
}

async function executeTop(window, caseId, source) {
  expectedWindowByCase.set(caseId, window)
  const state = windowStates.get(window.webContents)
  if (state !== undefined) state.activeCaseId = caseId
  const result = await withTimeout(
    window.webContents.executeJavaScript(source),
    STEP_TIMEOUT_MS,
    `top execution timed out for ${caseId}`,
  )
  attempts.push({ sequence: nextSequence(), caseId, action: 'top-execute', result })
  return result
}

function liveChildFrames(window) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return []
  const main = window.webContents.mainFrame
  return main.framesInSubtree.filter((frame) => frame !== main && !safeRead(() => frame.isDestroyed(), true))
}

async function waitForChildFrames(window, count, caseId) {
  return await waitUntil(
    () => {
      const frames = liveChildFrames(window)
      return frames.length >= count ? frames : null
    },
    `missing ${count} live child frame(s) for ${caseId}`,
  )
}

function childInvocationSource(caseId, removeSelf = false) {
  return `(async () => {
    try {
      const bridge = top.sageSingleFrameProbe;
      const bridgeType = typeof bridge;
      const beginType = bridge === undefined ? 'undefined' : typeof bridge.beginOperation;
      const pending = beginType === 'function'
        ? bridge.beginOperation(${JSON.stringify(caseId)})
        : Promise.resolve({ ok: false, code: 'bridge-missing' });
      ${removeSelf ? 'if (frameElement) frameElement.remove();' : ''}
      const result = await pending;
      return { outcome: 'resolved', bridgeType, beginType, result, selfIsTop: self === top, origin: location.origin };
    } catch (error) {
      return { outcome: 'rejected', errorName: error instanceof Error ? error.name : 'Error', selfIsTop: self === top, origin: location.origin };
    }
  })()`
}

async function invokeFromFrame(frame, caseId, removeSelf = false) {
  const result = await withTimeout(
    frame.executeJavaScript(childInvocationSource(caseId, removeSelf)),
    STEP_TIMEOUT_MS,
    `child invocation timed out for ${caseId}`,
  )
  attempts.push({ sequence: nextSequence(), caseId, action: 'child-top-bridge', result })
  return result
}

async function immediateAboutBlankRace(window, caseId) {
  const childSource = childInvocationSource(caseId, true)
  const source = `(async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    return await frame.contentWindow.eval(${JSON.stringify(childSource)});
  })()`
  return await executeTop(window, caseId, source)
}

async function beginFromTop(window, caseId) {
  return await executeTop(window, caseId, `(async () => {
    return await globalThis.sageSingleFrameProbe.beginOperation(${JSON.stringify(caseId)});
  })()`)
}

async function readFromTop(window, caseId) {
  return await executeTop(window, caseId, `(async () => {
    return await globalThis.sageSingleFrameProbe.readProjection(${JSON.stringify(caseId)});
  })()`)
}

function bindingsFor(caseId, channel = undefined) {
  return bindingEvents.filter((event) => event.caseId === caseId && (channel === undefined || event.channel === channel))
}

function operationsFor(caseId) {
  return [...operations.values()].filter((operation) => operation.caseId === caseId)
}

function effectsFor(caseId) {
  return syntheticEffects.filter((effect) => effect.caseId === caseId)
}

function frameEventsFor(caseId, eventName = undefined) {
  return frameEvents.filter((event) => event.caseId === caseId && (eventName === undefined || event.event === eventName))
}

async function waitForBinding(caseId, channel = 'begin') {
  return await waitUntil(
    () => bindingsFor(caseId, channel)[0] ?? null,
    `missing ${channel} binding event for ${caseId}`,
  )
}

async function waitForOperationTerminal(caseId) {
  return await waitUntil(
    () => {
      const operation = operationsFor(caseId)[0]
      return operation !== undefined && ['completed', 'cancelled'].includes(operation.phase) ? operation : null
    },
    `operation did not reach a terminal state for ${caseId}`,
    STEP_TIMEOUT_MS + PENDING_EFFECT_DELAY_MS,
  )
}

function requireHarness(condition, message) {
  if (!condition) harnessErrors.push(message)
}

function requireCandidate(condition, message) {
  if (!condition) failures.push(message)
}

function bridgeSurfaceSource() {
  return `(() => {
    const bridge = globalThis.sageSingleFrameProbe;
    return {
      keys: Object.keys(bridge).sort(),
      frozen: Object.isFrozen(bridge),
      hasGenericIpc: ['send', 'invoke', 'on', 'once', 'ipcRenderer'].some((key) => key in bridge),
      requireType: typeof globalThis.require,
      processType: typeof globalThis.process,
    };
  })()`
}

async function runCounterfactual() {
  const caseId = 'counterfactual-top-bridge'
  const window = createWindow('counterfactual', 'control', 'adversarial')
  await loadOwned(window, '/parser-same-origin.html', caseId)
  const frames = await waitForChildFrames(window, 1, caseId)
  const result = await invokeFromFrame(frames[0], caseId)
  await waitForBinding(caseId)
  requireHarness(result?.result?.ok === true, 'counterfactual did not reproduce the revision 39 top-bridge allow')
  requireHarness(bindingsFor(caseId, 'begin').length === 1, 'counterfactual did not emit exactly one begin binding')
  requireHarness(bindingsFor(caseId, 'begin')[0]?.decision === 'allow', 'counterfactual main binding was not allowed')
  requireHarness(operationsFor(caseId).length === 1, 'counterfactual did not create exactly one operation')
  requireHarness(effectsFor(caseId).length === 0, 'counterfactual committed an effect before cleanup')
  window.destroy()
  await waitUntil(() => window.isDestroyed(), 'counterfactual window did not destroy')
  await waitForOperationTerminal(caseId)
}

async function assertCleanPositiveControl(window) {
  const caseId = 'trusted-clean-baseline'
  const state = await loadOwned(window, '/clean-adversarial.html', caseId)
  requireHarness(state.ready && !state.contaminated, 'trusted clean baseline did not commit a clean generation')
  preloadSurface = await executeTop(window, caseId, bridgeSurfaceSource())
  const read = await readFromTop(window, caseId)
  requireCandidate(read?.ok === true, 'trusted clean baseline projection read was denied')
  const begin = await beginFromTop(window, caseId)
  requireCandidate(begin?.ok === true, 'trusted clean baseline operation was denied')
  await waitForOperationTerminal(caseId)
  requireCandidate(operationsFor(caseId).length === 1, 'trusted clean baseline did not create exactly one operation')
  requireCandidate(effectsFor(caseId).length === 1, 'trusted clean baseline did not commit exactly one effect')
  requireCandidate(operationsFor(caseId)[0]?.phase === 'completed', 'trusted clean baseline operation did not complete')
}

async function parserSameOriginCase(window) {
  const caseId = 'parser-same-origin-frame'
  expectedWindowByCase.set(caseId, window)
  const state = await loadOwned(window, '/parser-same-origin.html', caseId)
  const frames = await waitForChildFrames(window, 1, caseId)
  const result = await invokeFromFrame(frames[0], caseId)
  await waitForBinding(caseId)
  requireCandidate(result?.result?.ok === false, `${caseId}: child top-bridge call was not denied`)
  requireCandidate(state.contaminated && !state.ready, `${caseId}: generation was not contaminated`)
}

async function dynamicSameOriginCase(window) {
  const caseId = 'dynamic-same-origin-frame'
  await loadOwned(window, '/clean-adversarial.html', caseId)
  await executeTop(window, caseId, `(() => {
    const frame = document.createElement('iframe');
    frame.id = 'dynamic-same-origin';
    frame.src = ${JSON.stringify(`${ORIGIN}/frame.html`)};
    document.body.append(frame);
    return { appended: true };
  })()`)
  const frames = await waitForChildFrames(window, 1, caseId)
  const result = await invokeFromFrame(frames[0], caseId)
  await waitForBinding(caseId)
  requireCandidate(result?.result?.ok === false, `${caseId}: child top-bridge call was not denied`)
}

async function aboutBlankCase(window) {
  const caseId = 'about-blank-frame'
  await loadOwned(window, '/clean-adversarial.html', caseId)
  await executeTop(window, caseId, `(() => {
    const frame = document.createElement('iframe');
    frame.id = 'about-blank';
    document.body.append(frame);
    return { appended: true, childOrigin: frame.contentWindow.location.origin };
  })()`)
  const frames = await waitForChildFrames(window, 1, caseId)
  const result = await invokeFromFrame(frames[0], caseId)
  await waitForBinding(caseId)
  requireCandidate(result?.result?.ok === false, `${caseId}: child top-bridge call was not denied`)
}

async function srcdocCase(window) {
  const caseId = 'srcdoc-frame'
  await loadOwned(window, '/clean-adversarial.html', caseId)
  await executeTop(window, caseId, `(() => {
    const frame = document.createElement('iframe');
    frame.id = 'srcdoc-frame';
    frame.srcdoc = '<!doctype html><meta charset="utf-8"><p>srcdoc</p>';
    document.body.append(frame);
    return { appended: true };
  })()`)
  const frames = await waitForChildFrames(window, 1, caseId)
  await waitUntil(() => safeRead(() => frames[0].url === 'about:srcdoc', false), `srcdoc frame did not commit for ${caseId}`)
  const result = await invokeFromFrame(frames[0], caseId)
  await waitForBinding(caseId)
  requireCandidate(result?.result?.ok === false, `${caseId}: child top-bridge call was not denied`)
}

async function dataFrameCase(window) {
  const caseId = 'data-opaque-frame'
  await loadOwned(window, '/clean-adversarial.html', caseId)
  await executeTop(window, caseId, `(() => {
    const frame = document.createElement('iframe');
    frame.id = 'data-frame';
    frame.src = 'data:text/html;charset=utf-8,<meta charset="utf-8"><p>data</p>';
    document.body.append(frame);
    return { appended: true };
  })()`)
  const frames = await waitForChildFrames(window, 1, caseId)
  await waitUntil(() => safeRead(() => frames[0].url.startsWith('data:'), false), `data frame did not commit for ${caseId}`)
  const result = await invokeFromFrame(frames[0], caseId)
  requireCandidate(result?.outcome === 'rejected', `${caseId}: opaque child unexpectedly reached top bridge`)
  requireHarness(bindingsFor(caseId).length === 0, `${caseId}: opaque child unexpectedly emitted IPC`)
}

async function blobFrameCase(window) {
  const caseId = 'blob-frame'
  await loadOwned(window, '/clean-adversarial.html', caseId)
  await executeTop(window, caseId, `(() => {
    const frame = document.createElement('iframe');
    frame.id = 'blob-frame';
    frame.src = URL.createObjectURL(new Blob(['<!doctype html><meta charset="utf-8"><p>blob</p>'], { type: 'text/html' }));
    document.body.append(frame);
    return { appended: true };
  })()`)
  const frames = await waitForChildFrames(window, 1, caseId)
  await waitUntil(() => safeRead(() => frames[0].url.startsWith('blob:'), false), `blob frame did not commit for ${caseId}`)
  const result = await invokeFromFrame(frames[0], caseId)
  await waitForBinding(caseId)
  requireCandidate(result?.result?.ok === false, `${caseId}: child top-bridge call was not denied`)
}

async function sandboxOpaqueCase(window) {
  const caseId = 'sandbox-opaque-frame'
  await loadOwned(window, '/clean-adversarial.html', caseId)
  await executeTop(window, caseId, `(() => {
    const frame = document.createElement('iframe');
    frame.id = 'sandbox-opaque';
    frame.sandbox = 'allow-scripts';
    frame.srcdoc = '<!doctype html><meta charset="utf-8"><p>opaque</p>';
    document.body.append(frame);
    return { appended: true };
  })()`)
  const frames = await waitForChildFrames(window, 1, caseId)
  const result = await invokeFromFrame(frames[0], caseId)
  requireCandidate(result?.outcome === 'rejected', `${caseId}: opaque child unexpectedly reached top bridge`)
  requireHarness(bindingsFor(caseId).length === 0, `${caseId}: opaque child unexpectedly emitted IPC`)
}

async function nestedFrameCase(window) {
  const caseId = 'nested-frame'
  await loadOwned(window, '/clean-adversarial.html', caseId)
  await executeTop(window, caseId, `(() => {
    const outer = document.createElement('iframe');
    outer.id = 'nested-outer';
    outer.src = ${JSON.stringify(`${ORIGIN}/nested-parent.html`)};
    document.body.append(outer);
    return { appended: true };
  })()`)
  const frames = await waitForChildFrames(window, 2, caseId)
  const deepest = frames.find((frame) => safeRead(() => frame.parent !== window.webContents.mainFrame, false)) ?? frames.at(-1)
  const result = await invokeFromFrame(deepest, caseId)
  await waitForBinding(caseId)
  requireCandidate(result?.result?.ok === false, `${caseId}: nested child top-bridge call was not denied`)
}

async function earlyCallRemoveCases(window) {
  for (let round = 1; round <= EARLY_RACE_ROUNDS; round += 1) {
    const caseId = `early-call-remove-${round}`
    await loadOwned(window, '/clean-adversarial.html', caseId)
    const result = await immediateAboutBlankRace(window, caseId)
    await waitForBinding(caseId)
    requireCandidate(result?.result?.ok === false, `${caseId}: early top-bridge call was not denied`)
    requireCandidate(liveChildFrames(window).length === 0, `${caseId}: child was not removed`)
    const state = windowStates.get(window.webContents)
    requireCandidate(state?.contaminated === true && state.ready === false, `${caseId}: removal washed the contaminated generation`)
  }
}

async function pendingContaminationCase(window) {
  const pendingCase = 'pending-before-contamination'
  const attackCase = 'pending-contamination-child'
  await loadOwned(window, '/clean-adversarial.html', pendingCase)
  const begin = await beginFromTop(window, pendingCase)
  requireCandidate(begin?.ok === true, `${pendingCase}: clean operation was not accepted`)
  await waitUntil(() => operationsFor(pendingCase).length === 1, `${pendingCase}: operation was not created`)
  expectedWindowByCase.set(attackCase, window)
  const state = windowStates.get(window.webContents)
  if (state !== undefined) state.activeCaseId = attackCase
  const childResult = await immediateAboutBlankRace(window, attackCase)
  await waitForBinding(attackCase)
  requireCandidate(childResult?.result?.ok === false, `${attackCase}: contaminated child call was not denied`)
  const operation = await waitForOperationTerminal(pendingCase)
  requireCandidate(operation.phase === 'cancelled', `${pendingCase}: operation was not cancelled`)
  requireCandidate(operation.effectCommitted === false && effectsFor(pendingCase).length === 0, `${pendingCase}: cancelled operation committed an effect`)
}

async function stickyContaminationAndRecoveryCase(window) {
  const removedCase = 'removed-frame-still-denied'
  expectedWindowByCase.set(removedCase, window)
  const state = windowStates.get(window.webContents)
  if (state !== undefined) state.activeCaseId = removedCase
  const removedCall = await beginFromTop(window, removedCase)
  requireCandidate(removedCall?.ok === false, `${removedCase}: removed child washed contamination`)
  const sameDocumentCase = 'same-document-still-denied'
  expectedWindowByCase.set(sameDocumentCase, window)
  if (state !== undefined) state.activeCaseId = sameDocumentCase
  await executeTop(window, sameDocumentCase, `(() => {
    history.pushState({ probe: true }, '', '#same-document');
    return { hash: location.hash };
  })()`)
  await waitUntil(
    () => generationEvents.some((event) => event.caseId === sameDocumentCase && event.event === 'same-document-navigation-observed'),
    `${sameDocumentCase}: same-document navigation event missing`,
  )
  const sameDocumentCall = await beginFromTop(window, sameDocumentCase)
  requireCandidate(sameDocumentCall?.ok === false, `${sameDocumentCase}: same-document navigation washed contamination`)

  const recoveryCase = 'clean-top-reload-recovery'
  const recoveryState = await loadOwned(window, '/clean-strict.html', recoveryCase)
  requireCandidate(recoveryState.ready && !recoveryState.contaminated, `${recoveryCase}: clean cross-document reload did not recover`)
  const recoveryRead = await readFromTop(window, recoveryCase)
  requireCandidate(recoveryRead?.ok === true, `${recoveryCase}: projection read remained denied`)
  const recoveryBegin = await beginFromTop(window, recoveryCase)
  requireCandidate(recoveryBegin?.ok === true, `${recoveryCase}: operation remained denied`)
  await waitForOperationTerminal(recoveryCase)
  requireCandidate(operationsFor(recoveryCase).length === 1, `${recoveryCase}: expected exactly one operation`)
  requireCandidate(effectsFor(recoveryCase).length === 1, `${recoveryCase}: expected exactly one effect`)
  const oldPending = operationsFor('pending-before-contamination')[0]
  requireCandidate(oldPending?.phase === 'cancelled' && !oldPending.effectCommitted, `${recoveryCase}: old generation operation revived`)
}

async function strictPreventionCase(window) {
  const caseId = 'strict-prevention-layer'
  await loadOwned(window, '/clean-strict.html', caseId)
  const result = await executeTop(window, caseId, `(async () => {
    const iframe = document.createElement('iframe');
    iframe.src = ${JSON.stringify(`${ORIGIN}/frame.html`)};
    document.body.append(iframe);
    const object = document.createElement('object');
    object.data = ${JSON.stringify(`${ORIGIN}/frame.html`)};
    document.body.append(object);
    const embed = document.createElement('embed');
    embed.src = ${JSON.stringify(`${ORIGIN}/frame.html`)};
    document.body.append(embed);
    const webview = document.createElement('webview');
    webview.src = ${JSON.stringify(`${ORIGIN}/frame.html`)};
    document.body.append(webview);
    const popup = window.open(${JSON.stringify(`${ORIGIN}/frame.html`)}, '_blank');
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {
      popupWasNull: popup === null,
      webviewGetWebContentsIdType: typeof webview.getWebContentsId,
      iframeUrl: (() => { try { return iframe.contentWindow.location.href } catch { return 'inaccessible' } })(),
      violations: globalThis.__sageCspViolations,
    };
  })()`)
  requireHarness(result?.popupWasNull === true, `${caseId}: window.open was not denied`)
  requireHarness(result?.webviewGetWebContentsIdType === 'undefined', `${caseId}: webviewTag=false did not keep webview inert`)
  const directives = new Set((result?.violations ?? []).flatMap((entry) => [entry.effectiveDirective, entry.violatedDirective]))
  requireHarness(directives.has('frame-src') || directives.has('child-src'), `${caseId}: frame CSP violation was not observed`)
  requireHarness(directives.has('object-src'), `${caseId}: object CSP violation was not observed`)
  requireHarness(prevention.windowOpenDenied >= 1, `${caseId}: main window-open deny handler did not run`)
  requireHarness(prevention.strictSubframeNavigationsDenied >= 1 || frameEventsFor(caseId, 'frame-created').length >= 1, `${caseId}: no subframe prevention/tripwire evidence was observed`)
  requireCandidate(operationsFor(caseId).length === 0, `${caseId}: prevention attempts created an operation`)
  requireCandidate(effectsFor(caseId).length === 0, `${caseId}: prevention attempts committed an effect`)
}

function validateCandidateMatrix(forbiddenCases) {
  requireHarness(process.versions.electron === '43.3.0', `unexpected Electron ${String(process.versions.electron)}`)
  requireHarness(process.type === 'browser', `unexpected process type ${String(process.type)}`)
  requireHarness(process.env.ELECTRON_RUN_AS_NODE === undefined, 'ELECTRON_RUN_AS_NODE leaked into the browser-process probe')
  requireHarness(securityProfiles.length === 2, `expected 2 security profiles, got ${securityProfiles.length}`)
  for (const profile of securityProfiles) {
    requireHarness(profile.nodeIntegration === false, `${profile.label}: nodeIntegration changed`)
    requireHarness(profile.contextIsolation === true, `${profile.label}: contextIsolation changed`)
    requireHarness(profile.sandbox === true, `${profile.label}: sandbox changed`)
    requireHarness(profile.webSecurity === true, `${profile.label}: webSecurity changed`)
    requireHarness(profile.nodeIntegrationInSubFrames === false, `${profile.label}: nodeIntegrationInSubFrames changed`)
    requireHarness(profile.webviewTag === false, `${profile.label}: webviewTag changed`)
  }
  requireHarness(preloadSurface !== null, 'preload surface was not inspected')
  requireHarness(JSON.stringify(preloadSurface?.keys) === JSON.stringify(['beginOperation', 'readProjection']), 'preload surface keys changed')
  requireHarness(preloadSurface?.frozen === true, 'preload surface was not frozen')
  requireHarness(preloadSurface?.hasGenericIpc === false, 'preload surface exposed generic IPC')
  requireHarness(preloadSurface?.requireType === 'undefined' && preloadSurface?.processType === 'undefined', 'renderer main world exposed Node globals')
  requireHarness(cspResponses.some((entry) => entry.csp === STRICT_CSP), 'strict CSP response was not served')
  requireHarness(cspResponses.some((entry) => entry.csp === ADVERSARIAL_CSP), 'adversarial probe CSP response was not served')
  requireHarness(cspResponses.some((entry) => entry.csp === EMBEDDABLE_CSP), 'embeddable child CSP response was not served')

  for (const caseId of forbiddenCases) {
    requireCandidate(operationsFor(caseId).length === 0, `${caseId}: privileged operation count was not zero`)
    requireCandidate(effectsFor(caseId).length === 0, `${caseId}: durable effect count was not zero`)
    // Sticky-contamination cases reuse a window whose child already appeared under an
    // earlier case id; no new frame is created there, so no fresh tripwire is expected.
    const expectedTripwire = !['data-opaque-frame', 'sandbox-opaque-frame', 'strict-prevention-layer', 'removed-frame-still-denied', 'same-document-still-denied'].includes(caseId)
    if (expectedTripwire) {
      requireHarness(frameEventsFor(caseId, 'frame-created').some((event) => event.isMainFrame === false), `${caseId}: non-main frame-created evidence missing`)
    }
  }
  for (const caseId of [
    'parser-same-origin-frame',
    'dynamic-same-origin-frame',
    'about-blank-frame',
    'srcdoc-frame',
    'blob-frame',
    'nested-frame',
    'pending-contamination-child',
    'removed-frame-still-denied',
    'same-document-still-denied',
    ...Array.from({ length: EARLY_RACE_ROUNDS }, (_, index) => `early-call-remove-${index + 1}`),
  ]) {
    requireHarness(bindingsFor(caseId, 'begin').length === 1, `${caseId}: exact begin binding evidence missing`)
    requireCandidate(bindingsFor(caseId, 'begin')[0]?.decision === 'deny', `${caseId}: privileged begin binding was allowed`)
  }
  requireHarness(frameEventsFor('nested-frame', 'frame-created').filter((event) => event.isMainFrame === false).length >= 2, 'nested-frame: two descendant frame-created events were not observed')
  requireHarness(generationEvents.some((event) => event.caseId === 'clean-top-reload-recovery' && event.event === 'clean-generation-committed'), 'clean reload recovery generation event missing')
  requireHarness(barrierEvents.some((event) => event.caseId === 'trusted-clean-baseline' && event.decision === 'allow'), 'trusted baseline durable barrier allow missing')
  requireHarness(operationsFor('pending-before-contamination')[0]?.phase === 'cancelled', 'pending contamination operation cancellation evidence missing')
}

async function cleanup() {
  const errors = []
  for (const operation of operations.values()) {
    if (operation.phase === 'accepted') {
      operation.controller.abort('probe-cleanup')
      operation.phase = 'cancelled'
      operation.terminalReason = 'probe-cleanup'
      operationEvent(operation, 'cancelled', { reason: 'probe-cleanup' })
    }
  }
  await Promise.allSettled([...operationTasks])
  const handlersExpected = installedIpcHandlers.size
  let handlersRemoved = 0
  for (const channel of installedIpcHandlers) {
    try {
      ipcMain.removeHandler(channel)
      handlersRemoved += 1
    } catch (error) {
      errors.push(`ipc-remove:${channel}:${safeErrorName(error)}`)
    }
  }
  installedIpcHandlers.clear()
  const protocolsExpected = installedProtocolSessions.size
  let protocolsRemoved = 0
  for (const targetSession of installedProtocolSessions) {
    try {
      targetSession.protocol.unhandle(SCHEME)
      protocolsRemoved += 1
    } catch (error) {
      errors.push(`protocol-remove:${safeErrorName(error)}`)
    }
  }
  installedProtocolSessions.clear()
  const windowsBefore = windows.size
  let windowsDestroyed = 0
  for (const window of [...windows]) {
    try {
      if (!window.isDestroyed()) {
        window.destroy()
        windowsDestroyed += 1
      }
    } catch (error) {
      errors.push(`window-destroy:${safeErrorName(error)}`)
    }
  }
  await trackedDelay(20)
  for (const timer of activeTimers) clearTimeout(timer)
  const timersCleared = activeTimers.size
  activeTimers.clear()
  cleanupEvidence = {
    handlersExpected,
    handlersRemoved,
    protocolsExpected,
    protocolsRemoved,
    protocolHandlerCount,
    windowsBefore,
    windowsDestroyed,
    windowsRemaining: BrowserWindow.getAllWindows().length,
    timersCleared,
    errors,
  }
  if (handlersRemoved !== handlersExpected) errors.push('ipc-handler-cleanup-mismatch')
  if (protocolsRemoved !== protocolsExpected) errors.push('protocol-cleanup-mismatch')
  if (BrowserWindow.getAllWindows().length !== 0) errors.push('window-cleanup-mismatch')
  if (errors.length > 0) harnessErrors.push(...errors.map((error) => `cleanup:${error}`))
}

function operationSnapshots() {
  return [...operations.values()].map((operation) => ({
    caseId: operation.caseId,
    operationRef: operation.operationRef,
    generation: operation.generation,
    phase: operation.phase,
    terminalReason: operation.terminalReason,
    effectCommitted: operation.effectCommitted,
    aborted: operation.controller.signal.aborted,
  }))
}

async function run() {
  await app.whenReady()
  trustedSession = session.fromPartition(`sage-single-frame-${process.pid}-${Date.now()}`, { cache: false })
  installProtocolHandler(trustedSession)
  installIpcHandlers()

  await runCounterfactual()

  const candidate = createWindow('candidate', 'candidate', 'adversarial')
  await assertCleanPositiveControl(candidate)
  await parserSameOriginCase(candidate)
  await dynamicSameOriginCase(candidate)
  await aboutBlankCase(candidate)
  await srcdocCase(candidate)
  await dataFrameCase(candidate)
  await blobFrameCase(candidate)
  await sandboxOpaqueCase(candidate)
  await nestedFrameCase(candidate)
  await earlyCallRemoveCases(candidate)
  await pendingContaminationCase(candidate)
  await stickyContaminationAndRecoveryCase(candidate)
  windowStates.get(candidate.webContents).preventionMode = 'strict'
  await strictPreventionCase(candidate)

  const forbiddenCases = [
    'parser-same-origin-frame',
    'dynamic-same-origin-frame',
    'about-blank-frame',
    'srcdoc-frame',
    'data-opaque-frame',
    'blob-frame',
    'sandbox-opaque-frame',
    'nested-frame',
    ...Array.from({ length: EARLY_RACE_ROUNDS }, (_, index) => `early-call-remove-${index + 1}`),
    'pending-contamination-child',
    'removed-frame-still-denied',
    'same-document-still-denied',
    'strict-prevention-layer',
  ]
  validateCandidateMatrix(forbiddenCases)
}

let fatal = null
const globalTimeout = setTimeout(() => {
  fatal = `probe timed out after ${PROBE_TIMEOUT_MS}ms`
  void finish()
}, PROBE_TIMEOUT_MS)

let finished = false
async function finish() {
  if (finished) return
  finished = true
  clearTimeout(globalTimeout)
  try {
    await cleanup()
  } catch (error) {
    harnessErrors.push(`cleanup-threw:${safeErrorName(error)}:${safeErrorMessage(error)}`)
  }
  if (fatal !== null) harnessErrors.push(fatal)
  const outcome = harnessErrors.length > 0 ? 'harness-fatal' : failures.length > 0 ? 'no-go' : 'pass'
  const exitCode = outcome === 'pass' ? 0 : outcome === 'no-go' ? 2 : 1
  const result = {
    schemaVersion: 1,
    outcome,
    versions: {
      electron: process.versions.electron ?? null,
      chromium: process.versions.chrome ?? null,
      node: process.versions.node,
      processType: process.type ?? null,
      electronRunAsNodePresent: process.env.ELECTRON_RUN_AS_NODE !== undefined,
    },
    partition: trustedSession?.getStoragePath?.() ?? null,
    securityProfiles,
    preloadSurface,
    csp: {
      strict: STRICT_CSP,
      adversarial: ADVERSARIAL_CSP,
      embeddable: EMBEDDABLE_CSP,
      responses: cspResponses,
    },
    attempts,
    bindingEvents,
    barrierEvents,
    generationEvents,
    frameEvents,
    operationEvents,
    syntheticEffects,
    syntheticEffectCounter,
    operations: operationSnapshots(),
    prevention,
    cleanup: cleanupEvidence,
    failures,
    harnessErrors,
    passed: outcome === 'pass',
    ...(fatal === null ? {} : { fatal }),
  }
  writeFileSync(1, `${RESULT_PREFIX}${JSON.stringify(result)}\n`)
  app.exit(exitCode)
}

run()
  .catch((error) => {
    fatal = `${safeErrorName(error)}:${safeErrorMessage(error)}`
  })
  .finally(() => { void finish() })
