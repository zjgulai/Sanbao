import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, protocol, session } from 'electron'

const SCHEME = 'dsh-app'
const ORIGIN = `${SCHEME}://app`
const READ_CHANNEL = 'sage-ipc-caller-binding:read-projection'
const BEGIN_CHANNEL = 'sage-ipc-caller-binding:begin-operation'
const CANCEL_CHANNEL = 'sage-ipc-caller-binding:cancel-operation'
const RESULT_PREFIX = 'SAGE_IPC_CALLER_BINDING_RESULT '
const PROBE_TIMEOUT_MS = 40_000
const STEP_TIMEOUT_MS = 3_000
const PRELOAD_PATH = join(dirname(fileURLToPath(import.meta.url)), 'electron-ipc-caller-binding-preload.cjs')
const CASE_ID = /^[a-z][a-z0-9-]{0,95}$/u
const OPERATION_REF = /^probe-operation-[1-9][0-9]*$/u
const probeRoot = process.env.SAGE_ELECTRON_IPC_CALLER_PROBE_ROOT

if (probeRoot === undefined || probeRoot.length === 0) {
  throw new Error('SAGE_ELECTRON_IPC_CALLER_PROBE_ROOT is required')
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
let trustedWindow
let trustedSession
let differentSession
const windows = new Set()
const windowStates = new Map()
const operations = new Map()
const installedIpcHandlers = new Set()
const installedProtocolSessions = new Set()
const activeTimers = new Set()
const attempts = []
const bindingEvents = []
const lifecycleEvents = []
const operationEvents = []
const syntheticEffects = []
const windowSecurityProfiles = []
const harnessErrors = []
let preloadSurface = null
let subframeBridge = null
let subframeTopBridgeEvidence = null
let cleanupEvidence = null

function nextSequence() {
  sequence += 1
  return sequence
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

function safeErrorName(error) {
  return error instanceof Error && error.name.length > 0 ? error.name : 'Error'
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message.slice(0, 240) : 'unknown error'
}

function isExplicitSecurityDenial(error) {
  const name = safeErrorName(error)
  const message = safeErrorMessage(error)
  return name === 'SecurityError' || /blocked a frame|cross-origin|permission denied/iu.test(message)
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

function operationEvent(operation, event, detail = {}) {
  operationEvents.push({
    sequence: nextSequence(),
    caseId: operation.caseId,
    operationRef: operation.operationRef,
    event,
    phase: operation.phase,
    aborted: operation.controller.signal.aborted,
    terminalReason: operation.terminalReason,
    syntheticEffectCounter,
    ...detail,
  })
}

function cancelOwnedOperations(contents, reason) {
  for (const operation of operations.values()) {
    if (operation.ownerContents !== contents) continue
    if (operation.phase === 'accepted') {
      operation.controller.abort(reason)
      operation.phase = 'cancelled'
      operation.terminalReason = reason
      operationEvent(operation, 'cancelled', { reason })
      continue
    }
    if (operation.phase === 'dispatched') {
      operation.controller.abort(reason)
      operation.phase = 'outcome-unknown'
      operation.terminalReason = reason
      operationEvent(operation, 'outcome-unknown', { reason })
    }
  }
}

function invalidateWindow(contents, event, detail = {}) {
  const state = windowStates.get(contents)
  if (state === undefined) return
  state.generation += 1
  const affectedCaseIds = [...operations.values()]
    .filter((operation) => operation.ownerContents === contents && (operation.phase === 'accepted' || operation.phase === 'dispatched'))
    .map((operation) => operation.caseId)
  lifecycleEvents.push({
    sequence: nextSequence(),
    windowLabel: state.label,
    webContentsId: state.id,
    event,
    generation: state.generation,
    affectedCaseIds,
    ...detail,
  })
  cancelOwnedOperations(contents, event)
}

function createWindow(targetSession, label, options = {}) {
  const probeSubframeIpc = options.probeSubframeIpc === true
  const window = new BrowserWindow({
    show: false,
    width: 640,
    height: 480,
    paintWhenInitiallyHidden: false,
    webPreferences: {
      session: targetSession,
      preload: PRELOAD_PATH,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      nodeIntegrationInSubFrames: probeSubframeIpc,
      backgroundThrottling: false,
      devTools: false,
    },
  })
  windowSecurityProfiles.push({
    label,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    nodeIntegrationInSubFrames: probeSubframeIpc,
    adversarialTestOnly: probeSubframeIpc,
  })
  const contents = window.webContents
  windows.add(window)
  windowStates.set(contents, { id: contents.id, label, generation: 0 })
  window.once('closed', () => { windows.delete(window) })
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('preload-error', (_event, _path, error) => {
    harnessErrors.push(`preload-error:${safeErrorName(error)}`)
  })
  contents.on('did-start-navigation', (details) => {
    if (!details.isMainFrame) return
    invalidateWindow(contents, 'navigation', {
      isSameDocument: details.isSameDocument,
      targetOrigin: safeRead(() => new URL(details.url).origin, null),
    })
  })
  contents.on('render-process-gone', (_event, details) => {
    invalidateWindow(contents, 'render-process-gone', { reason: details.reason })
  })
  contents.on('destroyed', () => {
    invalidateWindow(contents, 'destroyed')
  })
  return window
}

async function createTrustedWindow(path = '/index.html') {
  const window = createWindow(trustedSession, `trusted-${windowStates.size + 1}`)
  trustedWindow = window
  await window.loadURL(`${ORIGIN}${path}`)
  return window
}

function destroyWindow(window) {
  try {
    if (window === undefined || window.isDestroyed()) return false
    window.destroy()
    if (!window.isDestroyed()) {
      harnessErrors.push('window destroy returned without destroying its target')
      return false
    }
    return true
  } catch (error) {
    harnessErrors.push(`window-destroy-error:${safeErrorName(error)}`)
    return false
  }
}

function page(body = '') {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function installProtocolHandler(targetSession) {
  targetSession.protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'app' && url.hostname !== 'other') return new Response(null, { status: 404 })
    if (url.pathname === '/subframe-probe.html') {
      return page(`<iframe name="probe-subframe" src="${ORIGIN}/frame.html"></iframe>`)
    }
    if (url.pathname === '/index.html') {
      return page(`<iframe name="same-origin-child" src="${ORIGIN}/frame.html"></iframe>`)
    }
    return page()
  })
  installedProtocolSessions.add(targetSession)
}

function inspectBinding(event) {
  const sender = event.sender
  const expectedContents = trustedWindow !== undefined && !trustedWindow.isDestroyed()
    ? trustedWindow.webContents
    : null
  const frame = safeRead(() => event.senderFrame, null)
  const senderDestroyed = safeRead(() => sender.isDestroyed(), true)
  const senderSessionMatches = safeRead(() => sender.session === trustedSession, false)
  const currentMainFrame = senderDestroyed ? null : safeRead(() => sender.mainFrame, null)
  const frameDestroyed = frame === null ? null : safeRead(() => frame.isDestroyed(), true)
  const frameDetached = frame === null ? null : safeRead(() => frame.detached, true)
  const frameOrigin = frame === null ? null : safeRead(() => frame.origin, null)
  const senderFrameProcessId = frame === null ? null : safeRead(() => frame.processId, null)
  const senderFrameRoutingId = frame === null ? null : safeRead(() => frame.routingId, null)
  const eventProcessId = safeRead(() => event.processId, null)
  const eventFrameId = safeRead(() => event.frameId, null)
  const state = windowStates.get(sender)
  const facts = {
    senderId: safeRead(() => sender.id, null),
    expectedSenderId: expectedContents === null ? null : safeRead(() => expectedContents.id, null),
    senderIsExpected: expectedContents !== null && sender === expectedContents,
    senderSessionMatches,
    senderDestroyed,
    hasSenderFrame: frame !== null,
    senderFrameIsCurrentMain: frame !== null && frame === currentMainFrame,
    senderFrameOrigin: frameOrigin,
    senderFrameDetached: frameDetached,
    senderFrameDestroyed: frameDestroyed,
    senderFrameParentIsNull: frame !== null && safeRead(() => frame.parent === null, false),
    senderFrameTopIsSelf: frame !== null && safeRead(() => frame.top === frame, false),
    eventProcessId,
    eventFrameId,
    senderFrameProcessId,
    senderFrameRoutingId,
    eventProcessMatchesSenderFrame: frame !== null && eventProcessId === senderFrameProcessId,
    eventFrameMatchesSenderFrame: frame !== null && eventFrameId === senderFrameRoutingId,
    navigationGeneration: state?.generation ?? null,
    windowLabel: state?.label ?? null,
  }
  const allowed = expectedContents !== null
    && sender === expectedContents
    && senderSessionMatches
    && !senderDestroyed
    && frame !== null
    && frame === currentMainFrame
    && frameOrigin === ORIGIN
    && frameDetached === false
    && frameDestroyed === false
    && safeRead(() => frame.parent === null, false)
    && safeRead(() => frame.top === frame, false)
    && eventProcessId === senderFrameProcessId
    && eventFrameId === senderFrameRoutingId
  return { allowed, facts, frame, state }
}

function recordBinding(channel, caseId, binding, decision) {
  const entry = {
    sequence: nextSequence(),
    channel,
    caseId,
    decision,
    ...binding.facts,
  }
  bindingEvents.push(entry)
  return entry
}

function denied() {
  return { ok: false, code: 'unavailable' }
}

function installIpcHandlers() {
  ipcMain.handle(READ_CHANNEL, (event, input) => {
    const binding = inspectBinding(event)
    const caseId = input !== null
      && typeof input === 'object'
      && typeof input.caseId === 'string'
      && CASE_ID.test(input.caseId)
      ? input.caseId
      : 'invalid-read-input'
    const validInput = exactPlainObject(input, ['caseId']) && caseId !== 'invalid-read-input'
    const allowed = binding.allowed && validInput
    recordBinding('read', caseId, binding, allowed ? 'allow' : 'deny')
    if (!allowed) return denied()
    return {
      ok: true,
      status: 'available',
      projection: {
        kind: 'caller-binding-probe',
        revision: 39,
      },
    }
  })
  installedIpcHandlers.add(READ_CHANNEL)

  ipcMain.handle(BEGIN_CHANNEL, (event, input) => {
    const binding = inspectBinding(event)
    const caseId = input !== null
      && typeof input === 'object'
      && typeof input.caseId === 'string'
      && CASE_ID.test(input.caseId)
      ? input.caseId
      : 'invalid-begin-input'
    const validInput = exactPlainObject(input, ['caseId']) && caseId !== 'invalid-begin-input'
    const allowed = binding.allowed && validInput
    recordBinding('begin', caseId, binding, allowed ? 'allow' : 'deny')
    if (!allowed || binding.frame === null || binding.state === undefined) {
      const result = denied()
      if (caseId === 'subframe-internal-attempt') {
        attempts.push({
          sequence: nextSequence(),
          caseId,
          action: 'begin-internal',
          windowLabel: binding.facts.windowLabel,
          outcome: 'response',
          result,
        })
      }
      return result
    }

    operationCounter += 1
    const operationRef = `probe-operation-${operationCounter}`
    const operation = {
      operationRef,
      caseId,
      ownerContents: event.sender,
      ownerContentsId: event.sender.id,
      ownerFrame: binding.frame,
      ownerProcessId: binding.facts.eventProcessId,
      ownerFrameId: binding.facts.eventFrameId,
      ownerGeneration: binding.state.generation,
      controller: new AbortController(),
      phase: 'accepted',
      effectCommitted: false,
      terminalReason: null,
    }
    operations.set(operationRef, operation)
    operationEvent(operation, 'accepted')
    return { ok: true, operationRef }
  })
  installedIpcHandlers.add(BEGIN_CHANNEL)

  ipcMain.handle(CANCEL_CHANNEL, (event, input) => {
    const binding = inspectBinding(event)
    const validInput = exactPlainObject(input, ['operationRef'])
      && typeof input.operationRef === 'string'
      && OPERATION_REF.test(input.operationRef)
    const operation = validInput ? operations.get(input.operationRef) : undefined
    if (!binding.allowed || !validInput) {
      recordBinding('cancel', operation?.caseId ?? 'unbound-cancel', binding, 'deny')
      return denied()
    }

    const ownerMatches = operation !== undefined
      && operation.ownerContents === event.sender
      && operation.ownerFrame === binding.frame
      && operation.ownerGeneration === binding.state?.generation
    recordBinding('cancel', operation?.caseId ?? 'unknown-operation', binding, ownerMatches ? 'allow' : 'deny')
    if (!ownerMatches) return denied()

    if (operation.phase === 'accepted') {
      operation.controller.abort('explicit-cancel')
      operation.phase = 'cancelled'
      operation.terminalReason = 'explicit-cancel'
      operationEvent(operation, 'cancelled', { reason: 'explicit-cancel' })
      return { ok: true, status: 'cancelled' }
    }
    if (operation.phase === 'dispatched') {
      operation.controller.abort('explicit-cancel-after-dispatch')
      operation.phase = 'outcome-unknown'
      operation.terminalReason = 'explicit-cancel-after-dispatch'
      operationEvent(operation, 'outcome-unknown', { reason: 'explicit-cancel-after-dispatch' })
      return { ok: true, status: 'outcome-unknown' }
    }
    return { ok: true, status: operation.phase }
  })
  installedIpcHandlers.add(CANCEL_CHANNEL)
}

function inspectOperationOwner(operation) {
  const contents = operation.ownerContents
  const contentsDestroyed = safeRead(() => contents.isDestroyed(), true)
  const state = windowStates.get(contents)
  const currentMainFrame = contentsDestroyed ? null : safeRead(() => contents.mainFrame, null)
  const frame = operation.ownerFrame
  const frameDestroyed = safeRead(() => frame.isDestroyed(), true)
  const frameDetached = safeRead(() => frame.detached, true)
  const frameOrigin = safeRead(() => frame.origin, null)
  const facts = {
    contentsDestroyed,
    ownerIsCurrentTrustedContents: trustedWindow !== undefined
      && !trustedWindow.isDestroyed()
      && trustedWindow.webContents === contents,
    sessionMatches: !contentsDestroyed && safeRead(() => contents.session === trustedSession, false),
    generationMatches: state !== undefined && state.generation === operation.ownerGeneration,
    frameIsCurrentMain: !contentsDestroyed && frame === currentMainFrame,
    frameOrigin,
    frameDestroyed,
    frameDetached,
    frameParentIsNull: safeRead(() => frame.parent === null, false),
    frameTopIsSelf: safeRead(() => frame.top === frame, false),
    frameProcessMatchesAccepted: safeRead(() => frame.processId === operation.ownerProcessId, false),
    frameRoutingMatchesAccepted: safeRead(() => frame.routingId === operation.ownerFrameId, false),
    aborted: operation.controller.signal.aborted,
  }
  const allowed = !facts.contentsDestroyed
    && facts.ownerIsCurrentTrustedContents
    && facts.sessionMatches
    && facts.generationMatches
    && facts.frameIsCurrentMain
    && facts.frameOrigin === ORIGIN
    && facts.frameDestroyed === false
    && facts.frameDetached === false
    && facts.frameParentIsNull
    && facts.frameTopIsSelf
    && facts.frameProcessMatchesAccepted
    && facts.frameRoutingMatchesAccepted
    && !facts.aborted
  return { allowed, facts }
}

function dispatchOperation(operationRef) {
  const operation = operations.get(operationRef)
  if (operation === undefined) return false
  const owner = inspectOperationOwner(operation)
  operationEvent(operation, 'dispatch-check', owner.facts)
  if (operation.phase !== 'accepted' || !owner.allowed) {
    if (operation.phase === 'accepted') {
      operation.controller.abort('fresh-binding-failed')
      operation.phase = 'cancelled'
      operation.terminalReason = 'fresh-binding-failed'
      operationEvent(operation, 'cancelled', { reason: 'fresh-binding-failed' })
    }
    operationEvent(operation, 'dispatch-blocked')
    return false
  }

  operation.phase = 'dispatched'
  operation.effectCommitted = true
  syntheticEffectCounter += 1
  syntheticEffects.push({
    sequence: nextSequence(),
    caseId: operation.caseId,
    operationRef,
    count: syntheticEffectCounter,
  })
  operationEvent(operation, 'dispatched')
  return true
}

function completeOperation(operationRef) {
  const operation = operations.get(operationRef)
  if (operation === undefined) return false
  if (operation.phase !== 'dispatched') {
    operationEvent(operation, 'completion-ignored')
    return false
  }
  operation.phase = 'completed'
  operationEvent(operation, 'completed')
  return true
}

async function waitFor(predicate, timeoutMs = STEP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) return false
    await trackedDelay(10)
  }
  return true
}

async function execute(frame, source) {
  return await withTimeout(frame.executeJavaScript(source), STEP_TIMEOUT_MS, 'renderer execution timeout')
}

async function readFrom(frame, caseId, windowLabel) {
  try {
    const result = await execute(frame, `globalThis.sageIpcProbe.readProjection(${JSON.stringify(caseId)})`)
    attempts.push({ sequence: nextSequence(), caseId, action: 'read', windowLabel, outcome: 'response', result })
    return result
  } catch (error) {
    attempts.push({ sequence: nextSequence(), caseId, action: 'read', windowLabel, outcome: 'rejected', errorName: safeErrorName(error) })
    harnessErrors.push(`${caseId}: required read attempt rejected:${safeErrorName(error)}`)
    return null
  }
}

async function beginFrom(frame, caseId, windowLabel) {
  try {
    const result = await execute(frame, `globalThis.sageIpcProbe.beginOperation(${JSON.stringify(caseId)})`)
    attempts.push({ sequence: nextSequence(), caseId, action: 'begin', windowLabel, outcome: 'response', result })
    return result
  } catch (error) {
    attempts.push({ sequence: nextSequence(), caseId, action: 'begin', windowLabel, outcome: 'rejected', errorName: safeErrorName(error) })
    harnessErrors.push(`${caseId}: required begin attempt rejected:${safeErrorName(error)}`)
    return null
  }
}

async function beginThroughTopBridgeFrom(frame, caseId, windowLabel) {
  try {
    const result = await execute(frame, `top.sageIpcProbe.beginOperation(${JSON.stringify(caseId)})`)
    attempts.push({ sequence: nextSequence(), caseId, action: 'top-bridge-begin', windowLabel, outcome: 'response', result })
    return result
  } catch (error) {
    const securityDenied = isExplicitSecurityDenial(error)
    attempts.push({ sequence: nextSequence(), caseId, action: 'top-bridge-begin', windowLabel, outcome: 'rejected', errorName: safeErrorName(error), errorMessage: safeErrorMessage(error), securityDenied })
    if (!securityDenied) harnessErrors.push(`${caseId}: top-bridge attempt failed without an explicit security denial:${safeErrorName(error)}`)
    return null
  }
}

async function cancelFrom(frame, caseId, operationRef, windowLabel) {
  try {
    const result = await execute(frame, `globalThis.sageIpcProbe.cancelOperation(${JSON.stringify(operationRef)})`)
    attempts.push({ sequence: nextSequence(), caseId, action: 'cancel', windowLabel, outcome: 'response', result })
    return result
  } catch (error) {
    attempts.push({ sequence: nextSequence(), caseId, action: 'cancel', windowLabel, outcome: 'rejected', errorName: safeErrorName(error) })
    harnessErrors.push(`${caseId}: required cancel attempt rejected:${safeErrorName(error)}`)
    return null
  }
}

function operationRefFrom(result) {
  return result !== null && result.ok === true && typeof result.operationRef === 'string'
    ? result.operationRef
    : null
}

function operationByCase(caseId) {
  return [...operations.values()].find((operation) => operation.caseId === caseId)
}

function eventsFor(events, caseId) {
  return events.filter((event) => event.caseId === caseId)
}

function evaluate() {
  const failures = []
  const requireFact = (condition, message) => { if (!condition) failures.push(message) }
  const attemptFor = (caseId, action = 'begin') => attempts.find((attempt) => attempt.caseId === caseId && attempt.action === action)
  const bindingFor = (caseId, channel = 'begin') => bindingEvents.filter((event) => event.channel === channel && event.caseId === caseId)
  const operationEventFor = (caseId, event) => operationEvents.find((entry) => entry.caseId === caseId && entry.event === event)
  const lifecycleFor = (caseId, event) => lifecycleEvents.find((entry) => entry.event === event && entry.affectedCaseIds.includes(caseId))
  const requireOrder = (caseId, entries) => {
    requireFact(entries.every((entry) => entry !== undefined), `${caseId}: missing causal event`)
    for (let index = 1; index < entries.length; index += 1) {
      requireFact(entries[index - 1]?.sequence < entries[index]?.sequence, `${caseId}: causal order violated at step ${index}`)
    }
  }
  const requireExactBinding = (binding, caseId) => {
    requireFact(binding?.eventProcessMatchesSenderFrame === true, `${caseId}: event processId did not match senderFrame.processId`)
    requireFact(binding?.eventFrameMatchesSenderFrame === true, `${caseId}: event frameId did not match senderFrame.routingId`)
  }
  const requireAllowedBegin = (caseId) => {
    const attempt = attemptFor(caseId)
    const bindings = bindingFor(caseId)
    requireFact(attempt?.outcome === 'response' && attempt.result?.ok === true, `${caseId}: trusted begin was not accepted`)
    requireFact(bindings.length === 1 && bindings[0]?.decision === 'allow', `${caseId}: expected one allow binding`)
    requireFact(bindings[0]?.senderIsExpected === true, `${caseId}: expected trusted WebContents`)
    requireFact(bindings[0]?.senderSessionMatches === true, `${caseId}: expected trusted Session`)
    requireFact(bindings[0]?.senderFrameIsCurrentMain === true, `${caseId}: expected current main frame`)
    requireFact(bindings[0]?.senderFrameOrigin === ORIGIN, `${caseId}: expected exact origin`)
    requireExactBinding(bindings[0], caseId)
  }
  const requireDeniedBegin = (caseId) => {
    const attempt = attemptFor(caseId)
    const bindings = bindingFor(caseId)
    requireFact(attempt?.outcome === 'response' && attempt.result?.ok === false && attempt.result?.code === 'unavailable', `${caseId}: denial was not stable unavailable`)
    requireFact(bindings.length === 1 && bindings[0]?.decision === 'deny', `${caseId}: expected one deny binding`)
    requireFact(operationByCase(caseId) === undefined, `${caseId}: denied caller created an operation`)
  }

  requireFact(process.versions.electron === '43.3.0', `unexpected Electron ${process.versions.electron ?? 'missing'}`)
  requireFact(process.type === 'browser', `unexpected process type ${process.type ?? 'missing'}`)
  requireFact(!Object.hasOwn(process.env, 'ELECTRON_RUN_AS_NODE'), 'ELECTRON_RUN_AS_NODE leaked into the real Electron child')
  requireFact(preloadSurface !== null, 'preload surface was not observed')
  requireFact(JSON.stringify(preloadSurface?.keys) === JSON.stringify(['beginOperation', 'cancelOperation', 'readProjection']), 'preload surface exposed unexpected keys')
  requireFact(preloadSurface?.frozen === true, 'preload surface was not frozen')
  requireFact(preloadSurface?.hasGenericIpc === false, 'preload surface exposed generic IPC')
  requireFact(preloadSurface?.requireType === 'undefined', 'renderer main world exposed require')
  requireFact(preloadSurface?.processType === 'undefined', 'renderer main world exposed process')

  const adversarialProfiles = windowSecurityProfiles.filter((profile) => profile.nodeIntegrationInSubFrames)
  requireFact(adversarialProfiles.length === 1, `expected one adversarial subframe profile, received ${adversarialProfiles.length}`)
  requireFact(adversarialProfiles[0]?.label === 'trusted-subframe-probe' && adversarialProfiles[0]?.adversarialTestOnly === true, 'subframe integration was not isolated to the adversarial fixture')
  requireFact(windowSecurityProfiles.filter((profile) => profile.label !== 'trusted-subframe-probe').every((profile) => !profile.nodeIntegrationInSubFrames && !profile.adversarialTestOnly), 'a normal probe window enabled subframe Node integration')

  requireFact(subframeBridge?.hasBridge === false, 'subframe received the preload bridge')
  const subframeBinding = bindingFor('subframe-internal-attempt')
  requireFact(subframeBinding.length === 1 && subframeBinding[0]?.decision === 'deny', 'subframe did not reach the main senderFrame guard and fail closed')
  requireFact(subframeBinding[0]?.senderIsExpected === true, 'subframe attempt did not originate in the expected WebContents')
  requireFact(subframeBinding[0]?.senderFrameIsCurrentMain === false, 'subframe attempt was not identified as a child frame')
  requireExactBinding(subframeBinding[0], 'subframe-internal-attempt')
  requireFact(operationByCase('subframe-internal-attempt') === undefined, 'subframe attempt created an operation')

  const trustedRead = attemptFor('trusted-read-projection', 'read')
  const trustedReadBinding = bindingFor('trusted-read-projection', 'read')
  requireFact(trustedRead?.result?.ok === true
    && trustedRead.result.status === 'available'
    && trustedRead.result.projection?.kind === 'caller-binding-probe'
    && trustedRead.result.projection?.revision === 39
    && Object.keys(trustedRead.result).length === 3
    && Object.keys(trustedRead.result.projection).length === 2, 'trusted read did not return the typed projection sentinel')
  requireFact(trustedReadBinding.length === 1 && trustedReadBinding[0]?.decision === 'allow', 'trusted read binding was not allowed')
  requireExactBinding(trustedReadBinding[0], 'trusted-read-projection')
  const hostileRead = attemptFor('hostile-read-projection', 'read')
  const hostileReadBinding = bindingFor('hostile-read-projection', 'read')
  requireFact(hostileRead?.result?.ok === false && hostileRead.result.code === 'unavailable', 'hostile read did not fail unavailable-first')
  requireFact(hostileReadBinding.length === 1 && hostileReadBinding[0]?.decision === 'deny' && hostileReadBinding[0]?.senderIsExpected === false, 'hostile read did not use the common caller guard')
  requireExactBinding(hostileReadBinding[0], 'hostile-read-projection')

  for (const caseId of [
    'trusted-success',
    'navigation-before-effect',
    'same-document-navigation-before-effect',
    'destroy-before-effect',
    'same-caller-explicit-cancel',
    'cross-caller-explicit-cancel',
    'post-dispatch-explicit-cancel',
    'post-dispatch-disconnect',
    'render-process-gone-before-effect',
  ]) requireAllowedBegin(caseId)

  for (const caseId of [
    'forged-extra-field',
    'same-origin-other-webcontents',
    'different-partition',
    'other-origin',
    'opaque-origin',
  ]) requireDeniedBegin(caseId)

  for (const caseId of ['same-origin-subframe-top-bridge']) {
    const attempt = attemptFor(caseId, 'top-bridge-begin')
    const bindings = bindingFor(caseId)
    const rendererRejected = attempt?.outcome === 'rejected' && attempt.securityDenied === true
    const mainDenied = attempt?.outcome === 'response'
      && attempt.result?.ok === false
      && attempt.result?.code === 'unavailable'
      && bindings.length === 1
      && bindings[0]?.decision === 'deny'
    requireFact(rendererRejected || mainDenied, `${caseId}: child access to the top bridge did not fail closed`)
    requireFact(bindings.every((binding) => binding.decision === 'deny'), `${caseId}: child top-bridge call was allowed by main`)
    requireFact(operationByCase(caseId) === undefined, `${caseId}: child top-bridge call created an operation`)
  }
  requireFact(subframeTopBridgeEvidence?.childOrigin === ORIGIN, 'same-origin top-bridge fixture did not have the trusted child origin')
  requireFact(subframeTopBridgeEvidence?.topOrigin === ORIGIN, 'same-origin top-bridge fixture did not have the trusted top origin')
  requireFact(subframeTopBridgeEvidence?.bridgeType === 'object' && subframeTopBridgeEvidence?.beginType === 'function', 'same-origin child could not reach the top bridge method')

  const expectedPhases = new Map([
    ['trusted-success', 'completed'],
    ['navigation-before-effect', 'cancelled'],
    ['same-document-navigation-before-effect', 'cancelled'],
    ['destroy-before-effect', 'cancelled'],
    ['same-caller-explicit-cancel', 'cancelled'],
    ['cross-caller-explicit-cancel', 'completed'],
    ['post-dispatch-explicit-cancel', 'outcome-unknown'],
    ['post-dispatch-disconnect', 'outcome-unknown'],
    ['render-process-gone-before-effect', 'cancelled'],
  ])
  for (const [caseId, phase] of expectedPhases) {
    const operation = operationByCase(caseId)
    requireFact(operation?.phase === phase, `${caseId}: expected phase ${phase}, received ${operation?.phase ?? 'missing'}`)
  }

  const effectCases = syntheticEffects.map((effect) => effect.caseId)
  requireFact(JSON.stringify(effectCases) === JSON.stringify([
    'trusted-success',
    'cross-caller-explicit-cancel',
    'post-dispatch-explicit-cancel',
    'post-dispatch-disconnect',
  ]), `unexpected synthetic effects: ${effectCases.join(',')}`)
  requireFact(syntheticEffectCounter === 4, `expected four synthetic effects, received ${syntheticEffectCounter}`)
  requireFact(syntheticEffects.every((effect, index) => effect.count === index + 1), 'synthetic effect counter was not monotonic and gap-free')

  for (const [caseId, lifecycleName, reason, sameDocument] of [
    ['navigation-before-effect', 'navigation', 'navigation', false],
    ['same-document-navigation-before-effect', 'navigation', 'navigation', true],
    ['destroy-before-effect', 'destroyed', 'destroyed', undefined],
    ['render-process-gone-before-effect', 'render-process-gone', 'render-process-gone', undefined],
  ]) {
    const lifecycle = lifecycleFor(caseId, lifecycleName)
    const cancelled = operationEventFor(caseId, 'cancelled')
    const dispatchCheck = operationEventFor(caseId, 'dispatch-check')
    const blocked = operationEventFor(caseId, 'dispatch-blocked')
    requireFact(lifecycle !== undefined, `${caseId}: missing ${lifecycleName} lifecycle event`)
    if (sameDocument !== undefined) requireFact(lifecycle?.isSameDocument === sameDocument, `${caseId}: unexpected same-document classification`)
    requireFact(cancelled?.terminalReason === reason && cancelled?.aborted === true, `${caseId}: lifecycle did not set terminal reason and abort state`)
    requireFact(dispatchCheck?.aborted === true, `${caseId}: fresh dispatch check did not observe abort state`)
    requireFact(eventsFor(syntheticEffects, caseId).length === 0, `${caseId}: cancelled operation reached the synthetic effect`)
    requireOrder(caseId, [lifecycle, cancelled, dispatchCheck, blocked])
  }

  const sameCancelAttempt = attemptFor('same-caller-explicit-cancel', 'cancel')
  const sameCancelBinding = bindingFor('same-caller-explicit-cancel', 'cancel')[0]
  const sameCancelEvent = operationEventFor('same-caller-explicit-cancel', 'cancelled')
  const sameCancelCheck = operationEventFor('same-caller-explicit-cancel', 'dispatch-check')
  const sameCancelBlocked = operationEventFor('same-caller-explicit-cancel', 'dispatch-blocked')
  requireFact(sameCancelAttempt?.result?.ok === true && sameCancelAttempt.result.status === 'cancelled', 'same-caller explicit cancel did not cancel')
  requireFact(sameCancelBinding?.decision === 'allow', 'same-caller cancel binding was not allowed')
  requireFact(sameCancelEvent?.terminalReason === 'explicit-cancel' && sameCancelEvent?.aborted === true, 'same-caller cancellation did not set abort evidence')
  requireFact(eventsFor(syntheticEffects, 'same-caller-explicit-cancel').length === 0, 'same-caller cancelled operation reached the synthetic effect')
  requireOrder('same-caller-explicit-cancel', [sameCancelBinding, sameCancelEvent, sameCancelCheck, sameCancelBlocked])

  const crossCancel = attemptFor('cross-caller-explicit-cancel', 'cancel')
  const crossCancelBinding = bindingFor('cross-caller-explicit-cancel', 'cancel')
  requireFact(crossCancel?.result?.ok === false && crossCancel.result.code === 'unavailable', 'cross-caller cancel did not fail closed')
  requireFact(crossCancelBinding.length === 1
    && crossCancelBinding[0]?.decision === 'deny'
    && crossCancelBinding[0]?.senderIsExpected === true
    && crossCancelBinding[0]?.senderSessionMatches === true
    && crossCancelBinding[0]?.senderFrameIsCurrentMain === true,
  'cross-caller cancel did not pass the public binding and fail the operation-owner check')

  const postDispatchCancel = attemptFor('post-dispatch-explicit-cancel', 'cancel')
  requireFact(postDispatchCancel?.result?.status === 'outcome-unknown', 'post-dispatch cancel was not outcome-unknown')
  for (const caseId of ['post-dispatch-explicit-cancel', 'post-dispatch-disconnect']) {
    const operation = operationByCase(caseId)
    requireFact(operation?.effectCommitted === true && operation?.phase === 'outcome-unknown', `${caseId}: post-dispatch loss was misreported`)
    requireFact(eventsFor(syntheticEffects, caseId).length === 1, `${caseId}: expected exactly one committed effect`)
  }

  const crashLifecycle = lifecycleEvents.filter((event) => event.event === 'render-process-gone')
  requireFact(crashLifecycle.length === 1, `expected one render-process-gone event, received ${crashLifecycle.length}`)
  requireFact(crashLifecycle[0]?.reason === 'killed' || crashLifecycle[0]?.reason === 'crashed', `unexpected renderer-gone reason ${crashLifecycle[0]?.reason ?? 'missing'}`)
  return failures
}

function validateHarnessCompleteness() {
  const requiredAttempts = [
    ['subframe-bridge-guard', 'bridge'],
    ['subframe-internal-attempt', 'begin-internal'],
    ['trusted-read-projection', 'read'],
    ['hostile-read-projection', 'read'],
    ['same-origin-subframe-top-bridge', 'top-bridge-begin'],
    ['forged-extra-field', 'begin'],
    ['trusted-success', 'begin'],
    ['same-origin-other-webcontents', 'begin'],
    ['different-partition', 'begin'],
    ['other-origin', 'begin'],
    ['opaque-origin', 'begin'],
    ['navigation-before-effect', 'begin'],
    ['same-document-navigation-before-effect', 'begin'],
    ['destroy-before-effect', 'begin'],
    ['same-caller-explicit-cancel', 'begin'],
    ['same-caller-explicit-cancel', 'cancel'],
    ['cross-caller-explicit-cancel', 'begin'],
    ['cross-caller-explicit-cancel', 'cancel'],
    ['post-dispatch-explicit-cancel', 'begin'],
    ['post-dispatch-explicit-cancel', 'cancel'],
    ['post-dispatch-disconnect', 'begin'],
    ['render-process-gone-before-effect', 'begin'],
  ]
  for (const [caseId, action] of requiredAttempts) {
    const matching = attempts.filter((attempt) => attempt.caseId === caseId && attempt.action === action)
    if (matching.length !== 1) harnessErrors.push(`${caseId}: expected one ${action} attempt, received ${matching.length}`)
  }

  const requiredBindings = [
    ['subframe-internal-attempt', 'begin'],
    ['trusted-read-projection', 'read'],
    ['hostile-read-projection', 'read'],
    ['forged-extra-field', 'begin'],
    ['trusted-success', 'begin'],
    ['same-origin-other-webcontents', 'begin'],
    ['different-partition', 'begin'],
    ['other-origin', 'begin'],
    ['opaque-origin', 'begin'],
    ['navigation-before-effect', 'begin'],
    ['same-document-navigation-before-effect', 'begin'],
    ['destroy-before-effect', 'begin'],
    ['same-caller-explicit-cancel', 'begin'],
    ['same-caller-explicit-cancel', 'cancel'],
    ['cross-caller-explicit-cancel', 'begin'],
    ['cross-caller-explicit-cancel', 'cancel'],
    ['post-dispatch-explicit-cancel', 'begin'],
    ['post-dispatch-explicit-cancel', 'cancel'],
    ['post-dispatch-disconnect', 'begin'],
    ['render-process-gone-before-effect', 'begin'],
  ]
  for (const [caseId, channel] of requiredBindings) {
    const matching = bindingEvents.filter((event) => event.caseId === caseId && event.channel === channel)
    if (matching.length !== 1) harnessErrors.push(`${caseId}: expected one ${channel} binding, received ${matching.length}`)
  }

  const sequenced = [attempts, bindingEvents, lifecycleEvents, operationEvents, syntheticEffects]
    .flat()
    .map((entry) => entry.sequence)
  if (new Set(sequenced).size !== sequenced.length) harnessErrors.push('main-process event sequence contained duplicates')
}

function operationSnapshots() {
  return [...operations.values()].map((operation) => ({
    caseId: operation.caseId,
    operationRef: operation.operationRef,
    ownerContentsId: operation.ownerContentsId,
    ownerProcessId: operation.ownerProcessId,
    ownerFrameId: operation.ownerFrameId,
    ownerGeneration: operation.ownerGeneration,
    phase: operation.phase,
    effectCommitted: operation.effectCommitted,
    terminalReason: operation.terminalReason,
    aborted: operation.controller.signal.aborted,
  }))
}

async function run() {
  await app.whenReady()
  const partition = `sage-ipc-caller-probe-${process.pid}-${Date.now()}`
  const otherPartition = `${partition}-other`
  trustedSession = session.fromPartition(partition, { cache: false })
  differentSession = session.fromPartition(otherPartition, { cache: false })
  installProtocolHandler(trustedSession)
  installProtocolHandler(differentSession)
  installIpcHandlers()

  let window = createWindow(trustedSession, 'trusted-subframe-probe', { probeSubframeIpc: true })
  trustedWindow = window
  await window.loadURL(`${ORIGIN}/subframe-probe.html`)
  preloadSurface = await execute(window.webContents.mainFrame, `(() => {
    const api = globalThis.sageIpcProbe
    return {
      keys: api === undefined ? [] : Object.keys(api).sort(),
      frozen: api !== undefined && Object.isFrozen(api),
      hasGenericIpc: api !== undefined && ['send', 'invoke', 'on', 'ipcRenderer'].some((key) => key in api),
      requireType: typeof globalThis.require,
      processType: typeof globalThis.process,
    }
  })()`)
  if (preloadSurface.keys.length === 0) throw new Error('trusted main frame did not receive the preload bridge')
  const hasSubframe = await waitFor(() => window.webContents.mainFrame.frames.length === 1)
  if (!hasSubframe) throw new Error('probe subframe was not created')
  const subframe = window.webContents.mainFrame.frames[0]
  subframeBridge = await execute(subframe, `({ hasBridge: Object.hasOwn(globalThis, 'sageIpcProbe'), type: typeof globalThis.sageIpcProbe })`)
  attempts.push({ sequence: nextSequence(), caseId: 'subframe-bridge-guard', action: 'bridge', windowLabel: 'trusted-subframe', outcome: 'observed', result: subframeBridge })
  const subframeAttemptObserved = await waitFor(() => bindingEvents.some((event) => event.caseId === 'subframe-internal-attempt'))
  if (!subframeAttemptObserved) harnessErrors.push('subframe internal IPC attempt did not reach main')

  destroyWindow(window)
  window = await createTrustedWindow('/index.html')

  await readFrom(window.webContents.mainFrame, 'trusted-read-projection', 'trusted')
  const normalChildrenReady = await waitFor(() => window.webContents.mainFrame.frames.length === 1)
  if (!normalChildrenReady) harnessErrors.push('normal trusted page did not create its same-origin attack subframe')
  const sameOriginChild = window.webContents.mainFrame.frames.find((frame) => safeRead(() => frame.origin, null) === ORIGIN)
  if (sameOriginChild === undefined) harnessErrors.push('same-origin child frame was not found')
  else {
    subframeTopBridgeEvidence = await execute(sameOriginChild, `({
      childOrigin: globalThis.location.origin,
      topOrigin: globalThis.top.location.origin,
      bridgeType: typeof globalThis.top.sageIpcProbe,
      beginType: typeof globalThis.top.sageIpcProbe?.beginOperation,
    })`)
    await beginThroughTopBridgeFrom(sameOriginChild, 'same-origin-subframe-top-bridge', 'trusted-same-origin-child')
  }
  await beginFrom(window.webContents.mainFrame, 'forged-extra-field', 'trusted')

  let result = await beginFrom(window.webContents.mainFrame, 'trusted-success', 'trusted')
  let ref = operationRefFrom(result)
  if (ref !== null) {
    dispatchOperation(ref)
    completeOperation(ref)
  }

  const otherWindow = createWindow(trustedSession, 'same-origin-other-webcontents')
  await otherWindow.loadURL(`${ORIGIN}/attacker.html`)
  await readFrom(otherWindow.webContents.mainFrame, 'hostile-read-projection', 'same-origin-other-webcontents')
  await beginFrom(otherWindow.webContents.mainFrame, 'same-origin-other-webcontents', 'same-origin-other-webcontents')
  destroyWindow(otherWindow)

  const differentWindow = createWindow(differentSession, 'different-partition')
  await differentWindow.loadURL(`${ORIGIN}/attacker.html`)
  await beginFrom(differentWindow.webContents.mainFrame, 'different-partition', 'different-partition')
  destroyWindow(differentWindow)

  await window.loadURL(`${SCHEME}://other/index.html`)
  await beginFrom(window.webContents.mainFrame, 'other-origin', 'trusted-other-origin')
  destroyWindow(window)
  window = await createTrustedWindow('/index.html')

  await window.loadURL('data:text/html;charset=utf-8,%3C!doctype%20html%3E%3Ctitle%3Eopaque%3C%2Ftitle%3E')
  await beginFrom(window.webContents.mainFrame, 'opaque-origin', 'trusted-opaque-origin')
  destroyWindow(window)
  window = await createTrustedWindow('/after-navigation.html')

  result = await beginFrom(window.webContents.mainFrame, 'navigation-before-effect', 'trusted')
  ref = operationRefFrom(result)
  await window.loadURL(`${ORIGIN}/after-navigation-2.html`)
  if (ref !== null) {
    await waitFor(() => operationByCase('navigation-before-effect')?.phase === 'cancelled', 1_000)
    dispatchOperation(ref)
  }

  result = await beginFrom(window.webContents.mainFrame, 'same-document-navigation-before-effect', 'trusted')
  ref = operationRefFrom(result)
  await execute(window.webContents.mainFrame, `history.pushState({}, '', '#revision-39')`)
  if (ref !== null) {
    await waitFor(() => operationByCase('same-document-navigation-before-effect')?.phase === 'cancelled', 1_000)
    dispatchOperation(ref)
  }
  destroyWindow(window)
  window = await createTrustedWindow('/after-navigation.html')

  result = await beginFrom(window.webContents.mainFrame, 'destroy-before-effect', 'trusted')
  ref = operationRefFrom(result)
  destroyWindow(window)
  if (ref !== null) {
    await waitFor(() => operationByCase('destroy-before-effect')?.phase === 'cancelled', 1_000)
    dispatchOperation(ref)
  }
  window = await createTrustedWindow('/after-navigation.html')

  result = await beginFrom(window.webContents.mainFrame, 'same-caller-explicit-cancel', 'trusted')
  ref = operationRefFrom(result)
  if (ref !== null) {
    await cancelFrom(window.webContents.mainFrame, 'same-caller-explicit-cancel', ref, 'trusted')
    dispatchOperation(ref)
  }

  result = await beginFrom(window.webContents.mainFrame, 'cross-caller-explicit-cancel', 'trusted')
  ref = operationRefFrom(result)
  if (ref !== null) {
    const cancelAttacker = createWindow(trustedSession, 'cross-caller-cancel-attacker')
    await cancelAttacker.loadURL(`${ORIGIN}/attacker.html`)
    trustedWindow = cancelAttacker
    try {
      await cancelFrom(cancelAttacker.webContents.mainFrame, 'cross-caller-explicit-cancel', ref, 'cross-caller-cancel-attacker')
    } finally {
      trustedWindow = window
    }
    destroyWindow(cancelAttacker)
    dispatchOperation(ref)
    completeOperation(ref)
  }

  result = await beginFrom(window.webContents.mainFrame, 'post-dispatch-explicit-cancel', 'trusted')
  ref = operationRefFrom(result)
  if (ref !== null) {
    dispatchOperation(ref)
    await cancelFrom(window.webContents.mainFrame, 'post-dispatch-explicit-cancel', ref, 'trusted')
    completeOperation(ref)
  }

  result = await beginFrom(window.webContents.mainFrame, 'post-dispatch-disconnect', 'trusted')
  ref = operationRefFrom(result)
  if (ref !== null) {
    dispatchOperation(ref)
    destroyWindow(window)
    await waitFor(() => operationByCase('post-dispatch-disconnect')?.phase === 'outcome-unknown', 1_000)
    completeOperation(ref)
  }

  // Renderer crash is deliberately last and has one live BrowserWindow, so a shared
  // renderer process cannot contaminate later scenarios.
  for (const candidate of [...windows]) destroyWindow(candidate)
  window = await createTrustedWindow('/after-navigation.html')
  result = await beginFrom(window.webContents.mainFrame, 'render-process-gone-before-effect', 'trusted')
  ref = operationRefFrom(result)
  window.webContents.forcefullyCrashRenderer()
  await waitFor(() => lifecycleEvents.some((event) => event.event === 'render-process-gone'), 2_000)
  if (ref !== null) dispatchOperation(ref)

  validateHarnessCompleteness()
  const evaluationFailures = evaluate()
  return {
    schemaVersion: 1,
    versions: {
      electron: process.versions.electron ?? null,
      chromium: process.versions.chrome ?? null,
      node: process.versions.node,
      processType: process.type ?? null,
      electronRunAsNodePresent: Object.hasOwn(process.env, 'ELECTRON_RUN_AS_NODE'),
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
    windowSecurityProfiles,
    partition,
    otherPartition,
    preloadSurface,
    subframeBridge,
    subframeTopBridgeEvidence,
    attempts,
    bindingEvents,
    lifecycleEvents,
    operationEvents,
    syntheticEffects,
    syntheticEffectCounter,
    operations: operationSnapshots(),
    evaluationFailures,
  }
}

function cleanup() {
  const evidence = {
    handlersExpected: 3,
    handlersRemoved: 0,
    protocolsExpected: 2,
    protocolsRemoved: 0,
    operationsAborted: 0,
    windowsBefore: [...windows].filter((window) => !window.isDestroyed()).length,
    windowsDestroyed: 0,
    windowsRemaining: null,
    pendingTimersBefore: activeTimers.size,
    timersCleared: 0,
    errors: [],
  }
  const recordError = (scope, error) => {
    evidence.errors.push(`${scope}:${safeErrorName(error)}`)
  }

  for (const channel of [...installedIpcHandlers]) {
    try {
      ipcMain.removeHandler(channel)
      installedIpcHandlers.delete(channel)
      evidence.handlersRemoved += 1
    } catch (error) {
      recordError(`remove-handler:${channel}`, error)
    }
  }
  for (const operation of operations.values()) {
    try {
      if (!operation.controller.signal.aborted) {
        operation.controller.abort('probe-cleanup')
        evidence.operationsAborted += 1
      }
      if (!operation.controller.signal.aborted) evidence.errors.push(`operation-not-aborted:${operation.caseId}`)
    } catch (error) {
      recordError(`abort-operation:${operation.caseId}`, error)
    }
  }
  for (const targetSession of [...installedProtocolSessions]) {
    try {
      if (!targetSession.protocol.isProtocolHandled(SCHEME)) {
        evidence.errors.push('protocol-missing-before-cleanup')
        continue
      }
      targetSession.protocol.unhandle(SCHEME)
      if (targetSession.protocol.isProtocolHandled(SCHEME)) {
        evidence.errors.push('protocol-still-handled-after-cleanup')
        continue
      }
      installedProtocolSessions.delete(targetSession)
      evidence.protocolsRemoved += 1
    } catch (error) {
      recordError('remove-protocol', error)
    }
  }
  for (const window of [...windows]) {
    try {
      if (window.isDestroyed()) continue
      window.destroy()
      if (window.isDestroyed()) evidence.windowsDestroyed += 1
      else evidence.errors.push('window-remained-live-after-cleanup')
    } catch (error) {
      recordError('destroy-window', error)
    }
  }
  evidence.windowsRemaining = [...windows].filter((window) => !window.isDestroyed()).length
  for (const timer of [...activeTimers]) {
    clearTimeout(timer)
    activeTimers.delete(timer)
    evidence.timersCleared += 1
  }
  if (evidence.pendingTimersBefore !== 0) evidence.errors.push(`pending-step-timers:${evidence.pendingTimersBefore}`)
  if (installedIpcHandlers.size !== 0) evidence.errors.push(`handlers-remaining:${installedIpcHandlers.size}`)
  if (installedProtocolSessions.size !== 0) evidence.errors.push(`protocols-remaining:${installedProtocolSessions.size}`)
  if (evidence.windowsRemaining !== 0) evidence.errors.push(`windows-remaining:${evidence.windowsRemaining}`)
  if (evidence.handlersRemoved !== evidence.handlersExpected) evidence.errors.push(`handlers-removed:${evidence.handlersRemoved}`)
  if (evidence.protocolsRemoved !== evidence.protocolsExpected) evidence.errors.push(`protocols-removed:${evidence.protocolsRemoved}`)
  cleanupEvidence = evidence
  for (const error of evidence.errors) harnessErrors.push(`cleanup:${error}`)
  return evidence
}

function emitResultAndExit(result, exitCode) {
  process.exitCode = exitCode
  writeFileSync(1, `${RESULT_PREFIX}${JSON.stringify(result)}\n`)
  app.exit(exitCode)
}

let finished = false
const watchdog = setTimeout(() => {
  if (finished) return
  finished = true
  const cleanupResult = cleanup()
  emitResultAndExit({
    schemaVersion: 1,
    outcome: 'harness-fatal',
    passed: false,
    fatal: 'probe-timeout',
    failures: [`probe exceeded ${PROBE_TIMEOUT_MS}ms`],
    cleanup: cleanupResult,
  }, 1)
}, PROBE_TIMEOUT_MS)

void run().then((result) => {
  if (finished) return
  finished = true
  clearTimeout(watchdog)
  const cleanupResult = cleanup()
  const outcome = harnessErrors.length > 0
    ? 'harness-fatal'
    : result.evaluationFailures.length === 0
      ? 'pass'
      : 'no-go'
  const finalResult = {
    ...result,
    outcome,
    cleanup: cleanupResult,
    failures: outcome === 'harness-fatal' ? [...harnessErrors] : result.evaluationFailures,
    passed: outcome === 'pass',
    ...(outcome === 'harness-fatal' ? { fatal: 'probe instrumentation invariant failed' } : {}),
  }
  delete finalResult.evaluationFailures
  const exitCode = outcome === 'pass' ? 0 : outcome === 'no-go' ? 2 : 1
  emitResultAndExit(finalResult, exitCode)
}).catch((error) => {
  if (finished) return
  finished = true
  clearTimeout(watchdog)
  const cleanupResult = cleanup()
  emitResultAndExit({
    schemaVersion: 1,
    outcome: 'harness-fatal',
    passed: false,
    fatal: safeErrorName(error),
    failures: [error instanceof Error ? error.message : 'unknown probe error'],
    cleanup: cleanupResult,
  }, 1)
})
