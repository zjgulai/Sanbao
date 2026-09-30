import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, protocol } from 'electron'
import { FramePolicy } from '../../lib/main/frame-policy.js'
import { createSageWindow, loadTrustedUrl } from '../../lib/main/window.js'
import { createAssetHandler } from '../../lib/host/assets.js'
import { SAGE_APP_ORIGIN } from '../../lib/product/contracts.js'

const RESULT_PREFIX = 'SAGE_FRAME_POLICY_WINDOW_RESULT '
const PROBE_TIMEOUT_MS = 45_000
const STEP_TIMEOUT_MS = 4_000
const probeRoot = process.env.SAGE_ELECTRON_FRAME_POLICY_PROBE_ROOT

if (probeRoot === undefined || probeRoot.length === 0) {
  throw new Error('SAGE_ELECTRON_FRAME_POLICY_PROBE_ROOT is required')
}
for (const name of ['user-data', 'session-data', 'crash-dumps', 'logs']) {
  mkdirSync(join(probeRoot, name), { recursive: true })
}
app.setPath('userData', join(probeRoot, 'user-data'))
app.setPath('sessionData', join(probeRoot, 'session-data'))
app.setPath('crashDumps', join(probeRoot, 'crash-dumps'))
app.setAppLogsPath(join(probeRoot, 'logs'))

protocol.registerSchemesAsPrivileged([{
  scheme: 'dsh-app',
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

const harnessErrors = []
const failures = []
const contaminationEvents = []
const evidence = {}
let policy = null

function requireCondition(condition, message) {
  if (!condition) failures.push(message)
}

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

async function waitUntil(predicate, message, timeoutMs = STEP_TIMEOUT_MS) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return
    await delay(10)
  }
  throw new Error(message)
}

async function evaluate(window, source) {
  return await Promise.race([
    window.webContents.executeJavaScript(source),
    delay(STEP_TIMEOUT_MS).then(() => { throw new Error('page evaluation timed out') }),
  ])
}

async function run() {
  await app.whenReady()
  protocol.handle('dsh-app', (request) => createAssetHandler().fetch(request))

  policy = new FramePolicy({
    onContamination: (reason, generation) => {
      contaminationEvents.push({ reason, generation })
    },
  })
  const window = createSageWindow(policy)
  await loadTrustedUrl(window, policy, `${SAGE_APP_ORIGIN}/index.html`)

  // 1. The initial main-owned load commits a clean trusted generation.
  requireCondition(policy.isTrustedGeneration(), 'initial owned load did not commit a trusted generation')
  requireCondition(policy.snapshot().generation === 1, `unexpected initial generation ${policy.snapshot().generation}`)
  requireCondition(contaminationEvents.length === 0, 'initial owned load produced contamination events')

  // 2. The Sage document stays functional under the strict CSP.
  const documentFacts = await evaluate(window, `(() => ({
    overviewVisible: !document.querySelector('[data-panel="overview"]').hidden,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    title: document.querySelector('#state-title').textContent,
  }))()`)
  evidence.documentFacts = documentFacts
  requireCondition(documentFacts.overviewVisible === true, 'inline script did not run under the strict CSP')
  requireCondition(documentFacts.bodyBackground !== 'rgba(0, 0, 0, 0)', 'inline style did not apply under the strict CSP')
  const connectStatus = await evaluate(window, `fetch('/.sage/state').then((response) => response.status).catch((error) => 'rejected:' + error.name)`)
  evidence.connectStatus = connectStatus
  requireCondition(connectStatus === 404, `same-origin fetch was not allowed by the CSP (got ${JSON.stringify(connectStatus)})`)

  // 3. Injecting a child frame contaminates the generation even though the CSP blocks its load.
  const frameProbe = await evaluate(window, `(async () => {
    globalThis.__sageViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      globalThis.__sageViolations.push(event.violatedDirective);
    });
    const frame = document.createElement('iframe');
    frame.id = 'probe-child';
    frame.src = '/index.html';
    document.body.append(frame);
    await new Promise((resolve) => { setTimeout(resolve, 400); });
    return { violations: [...new Set(globalThis.__sageViolations)] };
  })()`)
  evidence.frameViolations = frameProbe.violations
  await waitUntil(() => policy.snapshot().contaminated, 'child iframe did not contaminate the generation')
  requireCondition(policy.snapshot().contaminationReasons.includes('non-main-frame-created'), 'child contamination reason missing')
  requireCondition(!policy.isTrustedGeneration(), 'contaminated generation remained trusted')
  requireCondition(frameProbe.violations.includes('frame-src'), 'frame CSP violation was not observed')
  requireCondition(contaminationEvents.some((entry) => entry.reason === 'non-main-frame-created' && entry.generation === 1), 'contamination listener did not fire for generation 1')

  // 4. Removing the child does not wash the contamination.
  await evaluate(window, `document.getElementById('probe-child').remove()`)
  await delay(300)
  requireCondition(policy.snapshot().contaminated === true && policy.snapshot().ready === false, 'child removal washed the contamination')

  // 5. window.open is denied and webview stays inert.
  const openResult = await evaluate(window, `window.open(${JSON.stringify(`${SAGE_APP_ORIGIN}/index.html`)}) === null`)
  evidence.windowOpenDenied = openResult
  requireCondition(openResult === true, 'window.open was not denied')
  const webviewResult = await evaluate(window, `(() => {
    const webview = document.createElement('webview');
    webview.src = ${JSON.stringify(`${SAGE_APP_ORIGIN}/index.html`)};
    document.body.append(webview);
    return { getWebContentsIdType: typeof webview.getWebContentsId };
  })()`)
  evidence.webviewResult = webviewResult
  requireCondition(webviewResult.getWebContentsIdType === 'undefined', 'webview was not inert under webviewTag=false')

  // 6. A renderer-initiated top navigation is denied and contaminates the generation.
  const urlBefore = window.webContents.getURL()
  await evaluate(window, `(() => { location.href = ${JSON.stringify(`${SAGE_APP_ORIGIN}/`)}; return true; })()`)
  await delay(600)
  evidence.urlAfterSelfNavigation = window.webContents.getURL()
  requireCondition(policy.snapshot().contaminationReasons.includes('unowned-top-navigation'), 'renderer self-navigation did not contaminate the generation')
  requireCondition(window.webContents.getURL() === urlBefore, `renderer self-navigation was not denied (url ${evidence.urlAfterSelfNavigation})`)
  requireCondition(window.webContents.getURL().endsWith('/index.html'), 'window navigated away from the Sage document')

  // 7. Only a main-owned clean reload recovers a trusted generation.
  await loadTrustedUrl(window, policy, `${SAGE_APP_ORIGIN}/index.html`)
  requireCondition(policy.isTrustedGeneration(), 'clean main-owned reload did not recover a trusted generation')
  requireCondition(policy.snapshot().generation === 2, `unexpected recovery generation ${policy.snapshot().generation}`)
  requireCondition(policy.snapshot().contaminationReasons.length === 0, 'recovered generation kept contamination reasons')

  window.destroy()
  await waitUntil(() => window.isDestroyed(), 'window did not destroy')
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
  if (fatal !== null) harnessErrors.push(fatal)
  const outcome = harnessErrors.length > 0 ? 'harness-fatal' : failures.length > 0 ? 'no-go' : 'pass'
  const exitCode = outcome === 'pass' ? 0 : outcome === 'no-go' ? 2 : 1
  const result = {
    schemaVersion: 1,
    outcome,
    electron: process.versions.electron ?? null,
    chromium: process.versions.chrome ?? null,
    processType: process.type ?? null,
    evidence,
    contaminationEvents,
    finalPolicySnapshot: policy === null ? null : policy.snapshot(),
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
    fatal = `${error instanceof Error ? error.name : 'Error'}:${error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)}`
  })
  .finally(() => { void finish() })
