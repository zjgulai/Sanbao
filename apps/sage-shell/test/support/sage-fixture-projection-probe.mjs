/** Real-window probe (WT-02D.1): exercises the main-owned /.sage/* chain — real protocol
 * handler, real route kernel, the production provider assembly from lib/main/app-service.js —
 * under the fixture switch, and asserts the designated Sage root stays untouched.
 *
 * Env: SAGE_ELECTRON_FIXTURE_PROBE_ROOT (required), SAGE_FIXTURE_PROJECTION (fixture switch),
 * SAGE_FIXTURE_PROBE_MUTATE=1 (negative control: writes a canary into the asserted root). */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { app, protocol } from 'electron'
import { SAGE_APP_ORIGIN } from '../../lib/product/contracts.js'
import { FramePolicy } from '../../lib/main/frame-policy.js'
import { createSageWindow, loadTrustedUrl } from '../../lib/main/window.js'
import { verifySageServiceCaller } from '../../lib/main/appservice-binding.js'
import { handleSageServiceRequest, isSageServicePath } from '../../lib/appservice/route-skeleton.js'
import { createSageAppServiceProviders, resolveFixtureProjection } from '../../lib/main/app-service.js'
import { createTokenVault } from '../../lib/main/token-vault.js'
import { createAssetHandler } from '../../lib/host/assets.js'

const RESULT_PREFIX = 'SAGE_FIXTURE_PROJECTION_RESULT '
const PROBE_TIMEOUT_MS = 40_000
const STEP_TIMEOUT_MS = 5_000
const PROBE_VIEW_STATE = { status: 'ready', message: 'dsh probe', retryable: true }

const probeRoot = process.env.SAGE_ELECTRON_FIXTURE_PROBE_ROOT
if (probeRoot === undefined || probeRoot.length === 0) {
  throw new Error('SAGE_ELECTRON_FIXTURE_PROBE_ROOT is required')
}
for (const name of ['user-data', 'session-data', 'crash-dumps', 'logs']) {
  mkdirSync(join(probeRoot, 'electron', name), { recursive: true })
}
// The asserted root: everything the Sage product could write would derive from here in production.
const sageRoot = join(probeRoot, 'sage-root')
mkdirSync(sageRoot, { recursive: true })
const mutate = process.env.SAGE_FIXTURE_PROBE_MUTATE === '1'
if (mutate) writeFileSync(join(sageRoot, 'canary.txt'), 'negative-control')

app.setPath('userData', join(probeRoot, 'electron', 'user-data'))
app.setPath('sessionData', join(probeRoot, 'electron', 'session-data'))
app.setPath('crashDumps', join(probeRoot, 'electron', 'crash-dumps'))
app.setAppLogsPath(join(probeRoot, 'electron', 'logs'))

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
const evidence = {}

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

function snapshotEntries(root) {
  const out = []
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) visit(full)
      else out.push(relative(root, full))
    }
  }
  visit(root)
  return out.sort()
}

async function run() {
  await app.whenReady()

  const policy = new FramePolicy({})
  const vault = createTokenVault({ mintSessionRef: () => 'session-ref-probe' })
  const fixtureProjection = resolveFixtureProjection(process.env)
  const stubAdapter = { startLogin: async () => ({ ok: false, code: 'idp-unreachable' }) }

  protocol.handle('dsh-app', (request) => {
    const url = new URL(request.url)
    if (isSageServicePath(url.pathname)) {
      const callerBinding = verifySageServiceCaller(url, request, policy)
      const providers = createSageAppServiceProviders({
        viewState: PROBE_VIEW_STATE,
        vault,
        adapter: stubAdapter,
        ...(fixtureProjection === undefined ? {} : { fixtureProjection }),
      })
      return handleSageServiceRequest(request, { callerBinding, providers })
    }
    return createAssetHandler().fetch(request)
  })

  const window = createSageWindow(policy)
  await loadTrustedUrl(window, policy, `${SAGE_APP_ORIGIN}/index.html`)

  // 1. The Sage document runs under the strict CSP and keeps the fixture marker visible.
  const documentFacts = await evaluate(window, `(() => ({
    overviewVisible: !document.querySelector('[data-panel="overview"]').hidden,
    title: document.querySelector('#state-title').textContent,
    workspaceProjectionSource: document.querySelector('[data-sage-workspace]')?.getAttribute('data-projection-source') ?? null,
  }))()`)
  evidence.documentFacts = documentFacts
  requireCondition(documentFacts.overviewVisible === true, 'inline script did not run under the strict CSP')
  requireCondition(documentFacts.workspaceProjectionSource === 'fixture', 'fixture marker is not visible in the workspace document')

  // 2. The real protocol wire carries the fixture matter projection.
  const stateProbe = await evaluate(window, `fetch('/.sage/state', {cache: 'no-store'})
    .then(async (response) => ({ status: response.status, body: await response.json() }))
    .catch((error) => ({ status: 'rejected:' + error.name }))`)
  evidence.stateProbe = stateProbe.status === 200
    ? {
        status: stateProbe.status,
        matterProjectionSource: stateProbe.body?.matter?.projectionSource ?? null,
        matterActionability: stateProbe.body?.matter?.actionability ?? null,
        matterDenialReason: stateProbe.body?.matter?.denialReason ?? null,
        serviceStatus: stateProbe.body?.service?.status ?? null,
        runtimeStatus: stateProbe.body?.runtime?.status ?? null,
        authStatus: stateProbe.body?.service?.auth?.status ?? null,
      }
    : stateProbe
  requireCondition(stateProbe.status === 200, `/.sage/state over the wire returned ${JSON.stringify(stateProbe.status)}`)
  const wire = evidence.stateProbe
  requireCondition(wire.matterProjectionSource === 'fixture', 'matter projection source is not fixture on the wire')
  requireCondition(wire.matterActionability === 'blocked', 'fixture matter is not blocked')
  requireCondition(wire.matterDenialReason === 'fixture-only', 'fixture matter denial reason is not fixture-only')
  requireCondition(wire.serviceStatus === 'unavailable', 'service status drifted from unavailable-first')
  requireCondition(wire.runtimeStatus === 'ready', 'runtime projection missing on the wire')
  requireCondition(wire.authStatus === 'signed-out', 'fresh vault did not report signed-out')

  // 3. The blocked write path stays typed under the fixture switch (read-only surface).
  const actionsProbe = await evaluate(window, `fetch('/.sage/actions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'retry' }),
  }).then(async (response) => ({ status: response.status, body: await response.json() }))`)
  evidence.actionsProbe = { status: actionsProbe.status, code: actionsProbe.body?.code ?? null, stage: actionsProbe.body?.stage ?? null }
  requireCondition(actionsProbe.status === 200 && actionsProbe.body?.code === 'identity-unavailable', 'actions denial is not the typed identity-unavailable shape')
  requireCondition(actionsProbe.body?.stage === 'identity-policy', 'actions denial stage drifted')

  // 4. No write landed in the designated Sage root while the fixture reads were served.
  const entries = snapshotEntries(sageRoot)
  evidence.sageRootEntries = entries
  evidence.sageRootClean = entries.length === 0
  requireCondition(entries.length === 0, `the designated Sage root gained entries: ${JSON.stringify(entries)}`)

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
    failures,
    harnessErrors,
    passed: outcome === 'pass',
    ...(fatal === null ? {} : { fatal }),
  }
  process.stdout.write(RESULT_PREFIX + JSON.stringify(result) + '\n')
  app.exit(exitCode)
}

if (mutate) {
  // The negative-control run must still record the write and report a captured snapshot.
  evidence.mutateMode = true
}
run().then(finish).catch((error) => {
  harnessErrors.push(error instanceof Error ? error.message : String(error))
  void finish()
})
