/** Real-window probe (WT-02D.1): exercises the main-owned /.sage/* chain — real protocol
 * handler, real route kernel, the production provider assembly from lib/main/app-service.js —
 * under the fixture switch, and asserts the designated Sage root stays untouched.
 *
 * Env: SAGE_ELECTRON_FIXTURE_PROBE_ROOT (required), SAGE_FIXTURE_PROJECTION (fixture switch),
 * SAGE_FIXTURE_STAGE (exact fixture selector), SAGE_FIXTURE_PROBE_EXPECTATION=unavailable
 * (fail-closed negative modes), SAGE_FIXTURE_PROBE_MUTATE=1 (writes a canary into the asserted
 * root), and optional SAGE_FIXTURE_PROBE_SCREENSHOT_DIR (preserves captured PNGs). */
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { app, nativeTheme, protocol } from 'electron'
import { SAGE_APP_ORIGIN } from '../../lib/product/contracts.js'
import { FramePolicy } from '../../lib/main/frame-policy.js'
import { createSageWindow, loadTrustedUrl } from '../../lib/main/window.js'
import { verifySageServiceCaller } from '../../lib/main/appservice-binding.js'
import { handleSageServiceRequest, isSageServicePath } from '../../lib/appservice/route-skeleton.js'
import { createSageAppServiceProviders, resolveFixtureProjection } from '../../lib/main/app-service.js'
import { createDisplayThemeAdapter } from '../../lib/main/display-theme.js'
import { createPreferences } from '../../lib/main/preferences.js'
import { createTokenVault } from '../../lib/main/token-vault.js'
import { createAssetHandler } from '../../lib/host/assets.js'

const RESULT_PREFIX = 'SAGE_FIXTURE_PROJECTION_RESULT '
const PROBE_TIMEOUT_MS = 40_000
const STEP_TIMEOUT_MS = 5_000
const PROBE_VIEW_STATE = { status: 'ready', message: 'dsh probe', retryable: true }
const FIXTURE_STAGES = ['created', 'evidence', 'clarification', 'running', 'artifact-receipt', 'failed-retry']
const REQUESTED_THEMES = ['system', 'light', 'dark']
const REQUESTED_DENSITIES = ['comfortable', 'compact']
const BATCH10_THEME_SEQUENCE = ['light', 'dark']
const BATCH11_DENSITY_SEQUENCE = ['comfortable', 'compact', 'comfortable']
const TAB_ACCESSIBLE_NAMES = ['经营事项', '搜索', '自动化', '知识', '能力', '设置']
const HORIZONTAL_OVERFLOW_ALLOWLIST = ['.sage-file-preview', '.sage-plan-preview']

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
const screenshotDir = process.env.SAGE_FIXTURE_PROBE_SCREENSHOT_DIR
const expectedProjection = process.env.SAGE_FIXTURE_PROBE_EXPECTATION ?? 'fixture'
if (expectedProjection !== 'fixture' && expectedProjection !== 'unavailable') {
  throw new Error('SAGE_FIXTURE_PROBE_EXPECTATION must be fixture or unavailable')
}
const requestedStage = process.env.SAGE_FIXTURE_STAGE ?? 'clarification'
const queryStage = requestedStage === 'failed-retry' ? 'created' : 'failed-retry'
const batch10Assertions = process.env.SAGE_FIXTURE_PROBE_BATCH10 === '1'
const batch11Assertions = process.env.SAGE_FIXTURE_PROBE_BATCH11 === '1'
const seedTheme = process.env.SAGE_FIXTURE_PROBE_SEED_THEME
const seedDensity = process.env.SAGE_FIXTURE_PROBE_SEED_DENSITY
const includeSystemTheme = process.env.SAGE_FIXTURE_PROBE_INCLUDE_SYSTEM === '1'
if (seedTheme !== undefined && !REQUESTED_THEMES.includes(seedTheme)) {
  throw new Error('SAGE_FIXTURE_PROBE_SEED_THEME must be system, light, or dark')
}
if (seedDensity !== undefined && !REQUESTED_DENSITIES.includes(seedDensity)) {
  throw new Error('SAGE_FIXTURE_PROBE_SEED_DENSITY must be comfortable or compact')
}
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
const evidence = { pixelEvidence: [] }

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

async function captureWindow(window, name) {
  const image = await window.capturePage()
  const png = image.toPNG()
  const size = image.getSize()
  const saved = screenshotDir !== undefined && screenshotDir.length > 0
  if (saved) {
    mkdirSync(screenshotDir, { recursive: true })
    writeFileSync(join(screenshotDir, name), png)
  }
  evidence.pixelEvidence.push({
    name,
    width: size.width,
    height: size.height,
    byteLength: png.byteLength,
    sha256: createHash('sha256').update(png).digest('hex'),
    saved,
  })
}

function observedSystemDark() {
  return typeof nativeTheme.shouldUseDarkColors === 'boolean' ? nativeTheme.shouldUseDarkColors : null
}

async function sendKey(window, keyCode, modifiers = []) {
  const definitions = {
    Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
    Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  }
  const definition = definitions[keyCode]
  if (definition === undefined) throw new Error(`unsupported probe key ${keyCode}`)
  const modifierMask = modifiers.includes('shift') ? 8 : 0
  window.show()
  window.focus()
  window.webContents.focus()
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: modifierMask, ...definition })
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: modifierMask, ...definition })
  await delay(50)
}

async function readAxTabNames(window) {
  const tree = await window.webContents.debugger.sendCommand('Accessibility.getFullAXTree')
  return tree.nodes
    .filter((node) => node.ignored !== true && node.role?.value === 'tab')
    .map((node) => String(node.name?.value ?? ''))
}

async function waitForThemeProjection(window, requestedTheme, timeoutMs = 1_500) {
  return await evaluate(window, `(async () => {
    const requested = ${JSON.stringify(requestedTheme)}
    const snapshot = async () => {
      const response = await fetch('/.sage/state', { cache: 'no-store' })
      const payload = await response.json()
      return {
        projectedRequested: payload?.preferences?.requested?.theme ?? null,
        projectedEffective: payload?.preferences?.effectiveTheme ?? null,
        rootRequested: document.documentElement.getAttribute('data-sage-theme-requested'),
        rootEffective: document.documentElement.getAttribute('data-sage-theme-effective'),
      }
    }
    const deadline = Date.now() + ${timeoutMs}
    while (Date.now() < deadline) {
      const facts = await snapshot()
      if (facts.projectedRequested === requested && facts.rootRequested === requested) return facts
      await new Promise((resolve) => { setTimeout(resolve, 20) })
    }
    return await snapshot()
  })()`)
}

async function readThemeFacts(window, label) {
  const dom = await evaluate(window, `(async () => {
    const response = await fetch('/.sage/state', { cache: 'no-store' })
    const payload = await response.json()
    const root = document.documentElement
    const rootStyle = getComputedStyle(root)
    const bodyStyle = getComputedStyle(document.body)
    return {
      projectedRequested: payload?.preferences?.requested?.theme ?? null,
      projectedEffective: payload?.preferences?.effectiveTheme ?? null,
      projectedSystemDark: payload?.preferences?.systemDark ?? null,
      rootRequested: root.getAttribute('data-sage-theme-requested'),
      rootEffective: root.getAttribute('data-sage-theme-effective'),
      rootPalette: root.getAttribute('data-sage-theme'),
      prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      colorScheme: rootStyle.colorScheme,
      canvasToken: rootStyle.getPropertyValue('--sage-canvas').trim(),
      inkToken: rootStyle.getPropertyValue('--sage-ink').trim(),
      focusToken: rootStyle.getPropertyValue('--sage-focus').trim(),
      bodyBackground: bodyStyle.backgroundColor,
      bodyColor: bodyStyle.color,
    }
  })()`)
  return {
    label,
    ...dom,
    nativeThemeSource: nativeTheme.themeSource,
    nativeShouldUseDarkColors: observedSystemDark(),
  }
}

function requireThemeFacts(facts, requestedTheme) {
  const expectedEffective = facts.projectedEffective === null ? 'unknown' : facts.projectedEffective
  requireCondition(facts.projectedRequested === requestedTheme, `theme projection did not preserve requested ${requestedTheme}`)
  requireCondition(facts.rootRequested === requestedTheme, `theme root did not expose requested ${requestedTheme}`)
  requireCondition(facts.rootEffective === expectedEffective, `theme root did not expose effective ${expectedEffective}`)
  requireCondition(facts.nativeThemeSource === requestedTheme, `nativeTheme.themeSource did not apply ${requestedTheme}`)
  if (facts.projectedEffective === 'dark' || facts.projectedEffective === 'light') {
    requireCondition(facts.nativeShouldUseDarkColors === (facts.projectedEffective === 'dark'), `nativeTheme dark observation disagreed with effective ${facts.projectedEffective}`)
    requireCondition(facts.prefersDark === (facts.projectedEffective === 'dark'), `prefers-color-scheme disagreed with effective ${facts.projectedEffective}`)
  }
  requireCondition(facts.canvasToken !== '' && facts.inkToken !== '' && facts.focusToken !== '', `computed semantic palette did not resolve for ${requestedTheme}`)
}

async function waitForDensityProjection(window, requestedDensity, timeoutMs = 1_500) {
  return await evaluate(window, `(async () => {
    const requested = ${JSON.stringify(requestedDensity)}
    const snapshot = async () => {
      const response = await fetch('/.sage/state', { cache: 'no-store' })
      const payload = await response.json()
      return {
        projectedRequested: payload?.preferences?.requested?.density ?? null,
        rootDensity: document.documentElement.getAttribute('data-sage-density'),
        menuValue: document.querySelector('#menu-density')?.value ?? null,
        settingsValue: document.querySelector('#pref-density')?.value ?? null,
      }
    }
    const deadline = Date.now() + ${timeoutMs}
    while (Date.now() < deadline) {
      const facts = await snapshot()
      if (facts.projectedRequested === requested
        && facts.rootDensity === requested
        && facts.menuValue === requested
        && facts.settingsValue === requested) return facts
      await new Promise((resolve) => { setTimeout(resolve, 20) })
    }
    return await snapshot()
  })()`)
}

async function readDensityFacts(window, label) {
  return await evaluate(window, `(async () => {
    const response = await fetch('/.sage/state', { cache: 'no-store' })
    const payload = await response.json()
    const round = (value) => Math.round(value * 1_000) / 1_000
    const px = (value) => {
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : 0
    }
    const geometry = (selector, metricKind) => {
      const node = document.querySelector(selector)
      if (node === null) {
        return {
          selector,
          present: false,
          metric: -1,
          width: 0,
          height: 0,
          paddingTop: '0px',
          paddingRight: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          rowGap: '0px',
          columnGap: '0px',
          minHeight: '0px',
          fontSize: '',
          lineHeight: '',
        }
      }
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      const padding = px(style.paddingTop) + px(style.paddingRight) + px(style.paddingBottom) + px(style.paddingLeft)
      const gap = Math.max(px(style.rowGap), px(style.columnGap))
      const controlHeight = px(style.minHeight) > 0 ? px(style.minHeight) : rect.height
      const metric = metricKind === 'padding' ? padding : metricKind === 'gap' ? gap : controlHeight
      return {
        selector,
        present: true,
        metric: round(metric),
        width: round(rect.width),
        height: round(rect.height),
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        rowGap: style.rowGap,
        columnGap: style.columnGap,
        minHeight: style.minHeight,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      }
    }
    return {
      label: ${JSON.stringify(label)},
      projectedRequested: payload?.preferences?.requested?.density ?? null,
      rootDensity: document.documentElement.getAttribute('data-sage-density'),
      rootTheme: document.documentElement.getAttribute('data-sage-theme-effective'),
      menuValue: document.querySelector('#menu-density')?.value ?? null,
      settingsValue: document.querySelector('#pref-density')?.value ?? null,
      viewportWidth: window.innerWidth,
      geometry: {
        nav: geometry('#view-matter', 'padding'),
        main: geometry('.sage-main', 'padding'),
        card: geometry('#matter-current-work', 'padding'),
        row: geometry('#matter-current-work .sage-state-row', 'gap'),
        control: geometry('#user-menu', 'control'),
      },
    }
  })()`)
}

function requireDensityFacts(facts, requestedDensity) {
  requireCondition(facts.projectedRequested === requestedDensity, `density projection did not preserve requested ${requestedDensity}`)
  requireCondition(facts.rootDensity === requestedDensity, `density root did not expose requested ${requestedDensity}`)
  requireCondition(facts.menuValue === requestedDensity, `density menu did not reflect requested ${requestedDensity}`)
  requireCondition(facts.settingsValue === requestedDensity, `density settings control did not reflect requested ${requestedDensity}`)
  for (const [surface, geometry] of Object.entries(facts.geometry)) {
    requireCondition(geometry.present === true, `density geometry sentinel is absent for ${surface}`)
  }
}

function requireDensityCycle(facts, theme) {
  requireCondition(
    JSON.stringify(facts.map(({ projectedRequested }) => projectedRequested)) === JSON.stringify(BATCH11_DENSITY_SEQUENCE),
    `${theme} density sequence did not project comfortable -> compact -> comfortable`,
  )
  const [comfortable, compact, restored] = facts
  for (const surface of ['nav', 'main', 'card', 'row', 'control']) {
    const comfortableGeometry = comfortable.geometry[surface]
    const compactGeometry = compact.geometry[surface]
    const restoredGeometry = restored.geometry[surface]
    requireCondition(
      compactGeometry.metric < comfortableGeometry.metric,
      `compact density did not reduce ${surface} computed geometry under ${theme}: ${compactGeometry.metric} >= ${comfortableGeometry.metric}`,
    )
    requireCondition(
      Math.abs(restoredGeometry.metric - comfortableGeometry.metric) < 0.01,
      `comfortable density did not restore ${surface} computed geometry under ${theme}`,
    )
    requireCondition(
      compactGeometry.fontSize === comfortableGeometry.fontSize && restoredGeometry.fontSize === comfortableGeometry.fontSize,
      `density changed ${surface} font size under ${theme}`,
    )
    requireCondition(
      compactGeometry.lineHeight === comfortableGeometry.lineHeight && restoredGeometry.lineHeight === comfortableGeometry.lineHeight,
      `density changed ${surface} line height under ${theme}`,
    )
  }
}

async function run() {
  await app.whenReady()

  const policy = new FramePolicy({})
  const vault = createTokenVault({ mintSessionRef: () => 'session-ref-probe' })
  const fixtureProjection = resolveFixtureProjection(process.env)
  const stubAdapter = { startLogin: async () => ({ ok: false, code: 'idp-unreachable' }) }
  const displayTheme = createDisplayThemeAdapter(nativeTheme)
  const preferences = createPreferences({
    file: join(sageRoot, 'preferences', 'display.prefs'),
    now: () => '2026-10-04T10:00:00.000Z',
    randomKey: () => randomBytes(32),
  })
  if (seedTheme !== undefined) {
    const seeded = preferences.save({ theme: seedTheme }, observedSystemDark())
    requireCondition(seeded !== undefined, `failed to seed persisted ${seedTheme} theme`)
  }
  if (seedDensity !== undefined) {
    const seeded = preferences.save({ density: seedDensity }, observedSystemDark())
    requireCondition(seeded !== undefined, `failed to seed persisted ${seedDensity} density`)
  }
  const startupPreferences = preferences.snapshot(observedSystemDark())
  const startupThemeApply = displayTheme.apply(startupPreferences.requested.theme)
  evidence.startupThemeApply = startupThemeApply
  requireCondition(startupThemeApply.state === 'applied', 'persisted theme was refused before BrowserWindow creation')
  const preferenceWiring = {
    preferences: () => preferences.snapshot(observedSystemDark()),
    preferencesSave: (request) => {
      const saved = preferences.save(request, observedSystemDark())
      if (saved === undefined) return undefined
      const applied = displayTheme.apply(saved.requested.theme)
      if (applied.state !== 'applied') return undefined
      return preferences.snapshot(observedSystemDark())
    },
  }

  protocol.handle('dsh-app', (request) => {
    const url = new URL(request.url)
    if (isSageServicePath(url.pathname)) {
      const callerBinding = verifySageServiceCaller(url, request, policy)
      const providers = createSageAppServiceProviders({
        viewState: PROBE_VIEW_STATE,
        vault,
        adapter: stubAdapter,
        ...(fixtureProjection === undefined ? {} : { fixtureProjection }),
        ...preferenceWiring,
        // WT-02D.2A: same production assembly as main; the probe root has no policy file, so
        // retry stays identity-unavailable (shape assertion below is unchanged).
        authority: {
          policyPath: join(sageRoot, 'organization-policy.json'),
          readFileBytes: (path) => readFileSync(path),
          now: () => new Date().toISOString(),
        },
      })
      return handleSageServiceRequest(request, { callerBinding, providers })
    }
    return createAssetHandler().fetch(request)
  })

  const window = createSageWindow(policy)
  window.setContentSize(1440, 900)
  const loadedUrl = `${SAGE_APP_ORIGIN}/index.html`
  await loadTrustedUrl(window, policy, loadedUrl)
  if (!window.webContents.debugger.isAttached()) window.webContents.debugger.attach('1.3')
  await window.webContents.debugger.sendCommand('Accessibility.enable')
  const queryNavigation = await evaluate(window, `(async () => {
    const queryUrl = ${JSON.stringify(`${SAGE_APP_ORIGIN}/index.html`)} + '?stage=' + encodeURIComponent(${JSON.stringify(queryStage)})
    const queryDocumentStatus = await fetch(queryUrl, { cache: 'no-store' }).then((response) => response.status)
    history.replaceState(null, '', '/index.html?stage=' + encodeURIComponent(${JSON.stringify(queryStage)}) + '#stage=' + encodeURIComponent(${JSON.stringify(queryStage)}))
    return { queryDocumentStatus, visibleSearch: location.search, visibleHash: location.hash }
  })()`)
  evidence.navigationFacts = { requestedStage, queryStage, loadedUrl, ...queryNavigation }
  requireCondition(queryNavigation.queryDocumentStatus === 403, 'custom-scheme document accepted a query-bearing product URL')

  // 1. The strict-CSP document starts unavailable, then the real state read must drive the
  // expected projection state into the DOM. Waiting for the runtime title prevents the initial
  // unavailable shell from making either the fixture or fail-closed assertions pass early.
  // ADR-0261 P2: the React matter region must have applied the same projection the legacy
  // script published (fixture -> 'fixture'; unavailable runs -> 'unavailable').
  const expectedMatterRegionState = expectedProjection
  const documentFacts = await evaluate(window, `(async () => {
    const snapshot = () => {
      const workspace = document.querySelector('[data-sage-workspace]')
      const sectionHeading = document.querySelector('#panel-matter .sage-section-heading h1')
      const matterGoalHeading = document.querySelector('#matter-detail-goal')
      return {
        activeTabId: document.querySelector('.sage-nav-item.is-active')?.id ?? null,
        matterVisible: !document.querySelector('[data-panel="matter"]').hidden,
        title: document.querySelector('#state-title').textContent,
        workspaceProjectionSource: workspace?.getAttribute('data-projection-source') ?? null,
        matterRenderState: workspace?.getAttribute('data-matter-render-state') ?? null,
        matterId: document.querySelector('#matter-detail-id')?.textContent ?? null,
        matterGoal: document.querySelector('#matter-detail-goal')?.textContent ?? null,
        matterRevision: document.querySelector('#matter-detail-revision')?.textContent ?? null,
        sectionHeadingFontPx: sectionHeading === null ? null : Number.parseFloat(getComputedStyle(sectionHeading).fontSize),
        matterGoalFontPx: matterGoalHeading === null ? null : Number.parseFloat(getComputedStyle(matterGoalHeading).fontSize),
        displayChromeNodeCount: document.querySelectorAll('.sage-hero, .sage-network-card').length,
        navItemCount: document.querySelectorAll('.sage-nav-item').length,
        navItemIds: Array.from(document.querySelectorAll('.sage-nav-item')).map((item) => item.id),
        reactAppMounted: window.__SAGE_APP_MOUNTED__ === true,
        matterRegionState: document.querySelector('#sage-matter-region')?.getAttribute('data-matter-region-state') ?? null,
      }
    }
    const deadline = Date.now() + 4000
    while (Date.now() < deadline) {
      const facts = snapshot()
      if (facts.title !== '正在检查' && facts.workspaceProjectionSource === ${JSON.stringify(expectedProjection)} && facts.reactAppMounted === true && facts.matterRegionState === ${JSON.stringify(expectedMatterRegionState)}) return facts
      await new Promise((resolve) => { setTimeout(resolve, 10) })
    }
    return snapshot()
  })()`)
  evidence.documentFacts = documentFacts
  requireCondition(documentFacts.matterVisible === true && documentFacts.activeTabId === 'view-matter', 'BusinessMatter did not become the default panel under the strict CSP')
  requireCondition(documentFacts.workspaceProjectionSource === expectedProjection, `workspace projection source is not ${expectedProjection}`)
  requireCondition(documentFacts.matterRenderState === expectedProjection, `matter render state is not ${expectedProjection}`)
  if (expectedProjection === 'fixture') {
    requireCondition(documentFacts.matterGoal === fixtureProjection?.().matter.goal, 'fixture wire goal did not drive the renderer')
  } else {
    requireCondition(documentFacts.matterId === '—', 'unavailable projection leaked a matter id')
    requireCondition(documentFacts.matterGoal === '当前没有可用的事项投影', 'unavailable projection leaked a matter goal')
  }
  // Batch 12 / UI-01A: dense operational scale, no display-scale chrome in the real document.
  requireCondition(documentFacts.displayChromeNodeCount === 0, 'display-scale hero/network chrome is still present in the real document')
  requireCondition(documentFacts.navItemCount === 6 && JSON.stringify(documentFacts.navItemIds) === JSON.stringify(['view-matter', 'view-search', 'view-automation', 'view-knowledge', 'view-capabilities', 'view-settings']), 'navigation is not the six-item target set')
  // ADR-0261 P1: the React root must mount under the strict CSP document before any region moves over.
  requireCondition(documentFacts.reactAppMounted === true, 'React app did not mount under the strict CSP document')
  requireCondition(documentFacts.matterRegionState === expectedMatterRegionState, `React matter region did not reach the expected state (${documentFacts.matterRegionState})`)
  requireCondition(documentFacts.sectionHeadingFontPx !== null && documentFacts.sectionHeadingFontPx <= 24 && documentFacts.sectionHeadingFontPx >= 16, `matter section heading is not on the operational scale (${documentFacts.sectionHeadingFontPx}px)`)
  requireCondition(documentFacts.matterGoalFontPx !== null && documentFacts.matterGoalFontPx <= 24 && documentFacts.matterGoalFontPx >= 16, `matter goal heading is not on the operational scale (${documentFacts.matterGoalFontPx}px)`)

  await waitForThemeProjection(window, startupPreferences.requested.theme)
  const startupThemeFacts = await readThemeFacts(window, 'startup')
  evidence.themeFacts = { startup: startupThemeFacts, transitions: [] }
  if (batch10Assertions || batch11Assertions) requireThemeFacts(startupThemeFacts, startupPreferences.requested.theme)

  if (batch11Assertions) {
    await waitForDensityProjection(window, startupPreferences.requested.density)
    const startupDensityFacts = await readDensityFacts(window, 'startup')
    evidence.densityFacts = { startup: startupDensityFacts, transitions: [], compactA11y: null }
    requireDensityFacts(startupDensityFacts, startupPreferences.requested.density)
  }

  if (batch10Assertions || batch11Assertions) {
    const sequence = includeSystemTheme ? [...BATCH10_THEME_SEQUENCE, 'system'] : BATCH10_THEME_SEQUENCE
    for (const requestedTheme of sequence) {
      const transition = await evaluate(window, `(async () => {
        const control = document.querySelector('#menu-theme')
        control.value = ${JSON.stringify(requestedTheme)}
        control.dispatchEvent(new Event('change', { bubbles: true }))
        return { controlValue: control.value }
      })()`)
      await waitForThemeProjection(window, requestedTheme)
      const facts = await readThemeFacts(window, requestedTheme)
      evidence.themeFacts.transitions.push({ ...transition, ...facts })
      requireThemeFacts(facts, requestedTheme)
      await delay(100)
      await captureWindow(window, `sage-ui-fixture-${expectedProjection === 'fixture' ? requestedStage : 'unavailable'}-${requestedTheme}-1440.png`)
      if (requestedTheme === 'light' || requestedTheme === 'dark') {
        window.setMinimumSize(320, 400)
        window.setContentSize(760, 900)
        await delay(100)
        await evaluate(window, `document.querySelector('#matter-trace-toggle').click()`)
        await delay(100)
        await captureWindow(window, `sage-ui-fixture-${expectedProjection === 'fixture' ? requestedStage : 'unavailable'}-${requestedTheme}-760-drawer.png`)
        await evaluate(window, `document.querySelector('#matter-trace-close').click()`)
        window.setContentSize(1440, 900)
        await delay(100)
      }
      if (batch11Assertions && (requestedTheme === 'light' || requestedTheme === 'dark')) {
        const cycle = []
        for (const [densityIndex, requestedDensity] of BATCH11_DENSITY_SEQUENCE.entries()) {
          await evaluate(window, `(() => {
            const control = document.querySelector('#menu-density')
            control.value = ${JSON.stringify(requestedDensity)}
            control.dispatchEvent(new Event('change', { bubbles: true }))
            return control.value
          })()`)
          await waitForDensityProjection(window, requestedDensity)
          const densityFacts = await readDensityFacts(window, `${requestedTheme}:${densityIndex}:${requestedDensity}`)
          requireDensityFacts(densityFacts, requestedDensity)
          cycle.push(densityFacts)
          evidence.densityFacts.transitions.push(densityFacts)
          await delay(100)
          await captureWindow(window, `sage-ui-fixture-${expectedProjection === 'fixture' ? requestedStage : 'unavailable'}-${requestedTheme}-${densityIndex}-${requestedDensity}-1440.png`)
          if (requestedDensity === 'compact') {
            window.setMinimumSize(320, 400)
            window.setContentSize(760, 900)
            await delay(100)
            await evaluate(window, `document.querySelector('#matter-trace-toggle').click()`)
            await delay(100)
            await captureWindow(window, `sage-ui-fixture-${expectedProjection === 'fixture' ? requestedStage : 'unavailable'}-${requestedTheme}-compact-760-drawer.png`)
            await evaluate(window, `document.querySelector('#matter-trace-close').click()`)
            window.setContentSize(1440, 900)
            await delay(100)
          }
        }
        requireDensityCycle(cycle, requestedTheme)
      }
    }
  }

  if (batch11Assertions) {
    await evaluate(window, `(() => {
      const control = document.querySelector('#menu-density')
      control.value = 'compact'
      control.dispatchEvent(new Event('change', { bubbles: true }))
      return control.value
    })()`)
    await waitForDensityProjection(window, 'compact')
    evidence.densityFacts.compactA11y = await readDensityFacts(window, 'compact-a11y')
    requireDensityFacts(evidence.densityFacts.compactA11y, 'compact')
  }

  // 1b. Exercise the semantic and keyboard contract in Chromium rather than only in the Fake DOM.
  const uiContractFacts = await evaluate(window, `(() => {
    const pairs = [
      ['matter', 'view-matter', 'panel-matter'],
      ['search', 'view-search', 'panel-search'],
      ['automation', 'view-automation', 'panel-automation'],
      ['knowledge', 'view-knowledge', 'panel-knowledge'],
      ['capabilities', 'view-capabilities', 'panel-capabilities'],
      ['settings', 'view-settings', 'panel-settings'],
    ]
    const tabPairsValid = pairs.every(([view, tabId, panelId]) => {
      const tab = document.querySelector('[data-view="' + view + '"]')
      const panel = document.querySelector('[data-panel="' + view + '"]')
      return tab?.id === tabId
        && tab.getAttribute('aria-controls') === panelId
        && panel?.id === panelId
        && panel.getAttribute('aria-labelledby') === tabId
    })
    const trigger = document.querySelector('#user-menu')
    const panel = document.querySelector('#user-menu-panel')
    trigger.click()
    const opened = panel.hidden === false && trigger.getAttribute('aria-expanded') === 'true'
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    panel.dispatchEvent(escape)
    const escaped = escape.defaultPrevented
      && panel.hidden === true
      && trigger.getAttribute('aria-expanded') === 'false'
      && document.activeElement === trigger
    const css = document.querySelector('style')?.textContent ?? ''
    const matterTab = document.querySelector('[data-view="matter"]')
    const matterPanel = document.querySelector('[data-panel="matter"]')
    const searchTab = document.querySelector('[data-view="search"]')
    const searchPanel = document.querySelector('[data-panel="search"]')
    return {
      tabPairsValid,
      matterDefault: matterTab?.getAttribute('aria-selected') === 'true'
        && matterPanel?.hidden === false
        && searchTab?.getAttribute('aria-selected') === 'false'
        && searchPanel?.hidden === true,
      opened,
      escaped,
      reducedMotionRule: css.includes('@media (prefers-reduced-motion: reduce)'),
      allControlFocusRule: css.includes(':where(button, select, input, textarea):focus-visible'),
    }
  })()`)
  evidence.uiContractFacts = uiContractFacts
  requireCondition(uiContractFacts.tabPairsValid === true, 'tab and panel ARIA references are not reciprocal')
  requireCondition(uiContractFacts.matterDefault === true, 'BusinessMatter tab and panel are not the default view')
  requireCondition(uiContractFacts.opened === true, 'user menu did not open in the real renderer')
  requireCondition(uiContractFacts.escaped === true, 'Escape did not close the user menu and return focus')
  requireCondition(uiContractFacts.reducedMotionRule === true, 'reduced-motion rule is absent from the served document')
  requireCondition(uiContractFacts.allControlFocusRule === true, 'focus-visible rule does not cover all interactive control families')

  // Batch 10 negative control: Escape must originate from the real active element. Dispatching
  // directly to the expected handler node (the legacy assertion above) can make a broken path green.
  const userMenuBeforeEscape = await evaluate(window, `(() => {
    const trigger = document.querySelector('#user-menu')
    const panel = document.querySelector('#user-menu-panel')
    trigger.focus()
    trigger.click()
    return {
      opened: panel.hidden === false && trigger.getAttribute('aria-expanded') === 'true',
      activeElementId: document.activeElement?.id ?? null,
    }
  })()`)
  await sendKey(window, 'Escape')
  const userMenuAfterEscape = await evaluate(window, `(() => {
    const trigger = document.querySelector('#user-menu')
    const panel = document.querySelector('#user-menu-panel')
    return {
      closed: panel.hidden === true && trigger.getAttribute('aria-expanded') === 'false',
      activeElementId: document.activeElement?.id ?? null,
    }
  })()`)
  evidence.realUserMenuEscape = { before: userMenuBeforeEscape, after: userMenuAfterEscape }
  if (batch10Assertions) {
    requireCondition(userMenuBeforeEscape.opened === true && userMenuBeforeEscape.activeElementId === 'user-menu', 'user menu did not open from its real focused trigger')
    requireCondition(userMenuAfterEscape.closed === true && userMenuAfterEscape.activeElementId === 'user-menu', 'real activeElement Escape did not close the user menu and return focus')
  }
  if (!userMenuAfterEscape.closed) {
    await evaluate(window, `document.querySelector('#user-menu').click()`)
  }

  const navStart = await evaluate(window, `(() => {
    const tab = document.querySelector('#view-matter')
    tab.focus()
    return { activeElementId: document.activeElement?.id ?? null }
  })()`)
  await sendKey(window, 'ArrowDown')
  const navKeyboardFacts = await evaluate(window, `(() => {
    const active = document.activeElement
    const style = getComputedStyle(active)
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'))
    return {
      startActiveElementId: ${JSON.stringify(null)},
      activeElementId: active?.id ?? null,
      selectedId: tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.id ?? null,
      tabStops: tabs.filter((tab) => tab.tabIndex === 0).map((tab) => tab.id),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
    }
  })()`)
  navKeyboardFacts.startActiveElementId = navStart.activeElementId
  evidence.navKeyboardFacts = navKeyboardFacts
  if (batch10Assertions) {
    requireCondition(navStart.activeElementId === 'view-matter', 'keyboard navigation did not start on the selected Matter tab')
    requireCondition(navKeyboardFacts.activeElementId === 'view-search' && navKeyboardFacts.selectedId === 'view-search', 'ArrowDown did not move focus and selection to the next vertical tab')
    requireCondition(JSON.stringify(navKeyboardFacts.tabStops) === JSON.stringify(['view-search']), 'vertical tablist did not retain exactly one tab stop after ArrowDown')
    requireCondition(navKeyboardFacts.outlineStyle !== 'none' && Number.parseFloat(navKeyboardFacts.outlineWidth) >= 2 && navKeyboardFacts.outlineColor !== 'rgba(0, 0, 0, 0)', 'keyboard focus did not expose a computed visible outline')
  }
  await evaluate(window, `document.querySelector('#view-matter').click()`)

  // 1c. Read the six-state semantic track and trace rows from the real Chromium DOM. IDs are
  // compared with the wire below so a previous fixture's rows cannot survive a re-render.
  const stageFacts = await evaluate(window, `(() => {
    const stages = ${JSON.stringify(FIXTURE_STAGES)}
    const track = document.querySelector('#matter-stage-track')
    const traceIds = (selector) => Array.from(document.querySelectorAll(selector + ' .sage-trace-entry:not(.is-empty) strong'))
      .map((node) => node.textContent ?? '')
    const previews = Array.from(document.querySelectorAll('#matter-action-previews [data-action-preview]'))
    return {
      trackCurrentStage: track?.getAttribute('data-current-stage') ?? null,
      trackVisible: track !== null && getComputedStyle(track).display !== 'none' && track.getBoundingClientRect().width > 0,
      stageLabel: document.querySelector('#matter-detail-stage')?.textContent ?? null,
      contextStageLabel: document.querySelector('#matter-context-stage')?.textContent ?? null,
      stageItems: stages.map((token) => {
        const item = document.querySelector('#matter-stage-' + token)
        return {
          token,
          state: item?.getAttribute('data-stage-state') ?? null,
          ariaCurrent: item?.getAttribute('aria-current') ?? null,
        }
      }),
      currentTokens: stages.filter((token) => document.querySelector('#matter-stage-' + token)?.getAttribute('data-stage-state') === 'current'),
      fixtureBadges: [
        document.querySelector('#matter-panel-source')?.textContent ?? '',
        document.querySelector('#matter-projection-pill')?.textContent ?? '',
      ],
      metrics: {
        evidence: document.querySelector('#matter-metric-evidence')?.textContent ?? null,
        unknown: document.querySelector('#matter-metric-unknown')?.textContent ?? null,
        dependency: document.querySelector('#matter-metric-dependency')?.textContent ?? null,
      },
      clarification: document.querySelector('#matter-clarification')?.textContent ?? null,
      decisionIds: traceIds('#matter-decision-rows'),
      attemptIds: traceIds('#matter-attempt-rows'),
      artifactIds: traceIds('#matter-artifact-rows'),
      receiptIds: traceIds('#matter-receipt-rows'),
      actionPreviewCount: previews.length,
      allActionPreviewsBlocked: previews.every((preview) => preview.getAttribute('data-submission-state') === 'not-submitted'
        && preview.querySelector('.sage-action-preview-state')?.classList.contains('is-blocked') === true),
    }
  })()`)
  evidence.stageFacts = stageFacts
  const expectedTrackStage = expectedProjection === 'fixture' ? requestedStage : 'unavailable'
  requireCondition(stageFacts.trackVisible === true, 'six-stage track is not visible in the current matter workbench')
  requireCondition(stageFacts.trackCurrentStage === expectedTrackStage, `stage track did not select ${expectedTrackStage}`)
  requireCondition(stageFacts.currentTokens.length === (expectedProjection === 'fixture' ? 1 : 0), 'stage track has an invalid number of current markers')
  if (expectedProjection === 'fixture') {
    requireCondition(stageFacts.currentTokens[0] === requestedStage, 'stage track current marker disagrees with the env-selected fixture')
    requireCondition(stageFacts.fixtureBadges.every((badge) => badge.includes('fixture projection')), 'fixture provenance badges are absent')
  } else {
    requireCondition(stageFacts.fixtureBadges.every((badge) => !badge.includes('fixture')), 'unavailable projection retained a fixture badge')
  }
  requireCondition(stageFacts.stageItems.every((item) => item.state === (item.token === expectedTrackStage ? 'current' : 'idle')), 'stage item state markers disagree with the current stage')
  requireCondition(stageFacts.stageItems.every((item) => item.ariaCurrent === (item.token === expectedTrackStage ? 'step' : 'false')), 'stage item aria-current markers disagree with the current stage')
  requireCondition(stageFacts.allActionPreviewsBlocked === true, 'fixture or unavailable surface exposed a writable action preview')

  // 1d. Prove the built document's wide three-region order before exercising the narrow drawer.
  const wideLayout = await evaluate(window, `(() => {
    const context = document.querySelector('[data-workbench-region="current-context"]')
    const current = document.querySelector('[data-workbench-region="matter-focus"]')
    const trace = document.querySelector('[data-workbench-region="matter-trace"]')
    const contextRect = context.getBoundingClientRect()
    const currentRect = current.getBoundingClientRect()
    const traceRect = trace.getBoundingClientRect()
    const composer = document.querySelector('#matter-readonly-composer')
    return {
      innerWidth: window.innerWidth,
      contextVisible: getComputedStyle(context).display !== 'none' && contextRect.width > 0,
      currentVisible: getComputedStyle(current).display !== 'none' && currentRect.width > 0,
      traceVisible: getComputedStyle(trace).visibility !== 'hidden' && traceRect.width > 0,
      ordered: contextRect.left < currentRect.left && currentRect.right <= traceRect.left,
      composerControlCount: composer.querySelectorAll('form, input, textarea, button').length,
      tracePosition: getComputedStyle(trace).position,
    }
  })()`)
  evidence.wideLayout = wideLayout
  requireCondition(wideLayout.innerWidth >= 1400, 'real window did not enter the requested wide viewport')
  requireCondition(wideLayout.contextVisible && wideLayout.currentVisible && wideLayout.traceVisible, 'wide workbench did not expose all three regions')
  requireCondition(wideLayout.ordered === true, 'wide workbench regions are not ordered left-context, current-matter, right-trace')
  requireCondition(wideLayout.composerControlCount === 0, 'read-only composer contains an interactive control')
  requireCondition(wideLayout.tracePosition === 'sticky', 'wide trace rail is not sticky')
  await delay(250)
  await captureWindow(window, 'sage-uiia-1440-fixture.png')
  await captureWindow(window, `sage-ui-fixture-${expectedTrackStage}-1440.png`)

  // 1e. Reflow the same built document at approximately 760 CSS px and at 200% zoom. The drawer
  // assertions use real Chromium layout/focus; Fake DOM only covers the local event contract.
  window.setMinimumSize(320, 400)
  window.setContentSize(760, 900)
  await delay(50)
  const narrowLayout = await evaluate(window, `(async () => {
    const trigger = document.querySelector('#matter-trace-toggle')
    const trace = document.querySelector('#matter-trace-rail')
    const current = document.querySelector('[data-workbench-region="matter-focus"]')
    const before = {
      drawerOpen: trace.dataset.drawerOpen,
      drawerHidden: trace.getAttribute('aria-hidden'),
      triggerVisible: getComputedStyle(trigger).display !== 'none',
      currentVisible: getComputedStyle(current).display !== 'none' && current.getBoundingClientRect().width > 0,
    }
    trigger.click()
    await new Promise((resolve) => { setTimeout(resolve, 250) })
    const openRect = trace.getBoundingClientRect()
    const opened = trace.dataset.drawerOpen === 'true'
      && trace.getAttribute('aria-hidden') === 'false'
      && openRect.left >= 0
      && openRect.right <= window.innerWidth + 1
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    trace.dispatchEvent(escape)
    return {
      innerWidth: window.innerWidth,
      rootDensity: document.documentElement.getAttribute('data-sage-density'),
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      before,
      opened,
      escaped: escape.defaultPrevented
        && trace.dataset.drawerOpen === 'false'
        && trace.getAttribute('aria-hidden') === 'true'
        && document.activeElement === trigger,
      escapeParts: {
        defaultPrevented: escape.defaultPrevented,
        drawerOpen: trace.dataset.drawerOpen,
        ariaHidden: trace.getAttribute('aria-hidden'),
        activeElementId: document.activeElement?.id ?? null,
      },
    }
  })()`)
  evidence.narrowLayout = narrowLayout
  requireCondition(narrowLayout.innerWidth <= 760, 'real window did not enter the requested narrow viewport')
  requireCondition(narrowLayout.noHorizontalOverflow === true, 'narrow viewport has horizontal overflow')
  requireCondition(narrowLayout.before.drawerOpen === 'false' && narrowLayout.before.drawerHidden === 'true', 'narrow trace rail did not start closed')
  requireCondition(narrowLayout.before.triggerVisible === true && narrowLayout.before.currentVisible === true, 'narrow layout hid the drawer trigger or current matter')
  requireCondition(narrowLayout.opened === true, 'narrow trace drawer did not open within the viewport')
  requireCondition(narrowLayout.escaped === true, 'Escape did not close the narrow trace drawer and restore focus')
  if (batch11Assertions) requireCondition(narrowLayout.rootDensity === 'compact', '760 drawer checks did not run under compact density')
  if (screenshotDir !== undefined && screenshotDir.length > 0) {
    await evaluate(window, `document.querySelector('#matter-trace-toggle').click()`)
    await delay(250)
    await captureWindow(window, 'sage-uiia-760-drawer.png')
    await evaluate(window, `document.querySelector('#matter-trace-close').click()`)
  }

  const narrowTabNames = await readAxTabNames(window)
  evidence.axTabNames = { expected: TAB_ACCESSIBLE_NAMES, actual: narrowTabNames }
  if (batch10Assertions) {
    requireCondition(JSON.stringify(narrowTabNames) === JSON.stringify(TAB_ACCESSIBLE_NAMES), `narrow tab accessible names drifted: ${JSON.stringify(narrowTabNames)}`)
  }

  const drawerBeforeKeyboard = await evaluate(window, `(() => {
    const trigger = document.querySelector('#matter-trace-toggle')
    const trace = document.querySelector('#matter-trace-rail')
    trigger.focus()
    return {
      triggerVisible: getComputedStyle(trigger).display !== 'none',
      activeElementId: document.activeElement?.id ?? null,
      role: trace.getAttribute('role'),
      ariaModal: trace.getAttribute('aria-modal'),
      ariaHidden: trace.getAttribute('aria-hidden'),
    }
  })()`)
  await evaluate(window, `document.querySelector('#matter-trace-toggle').click()`)
  const drawerOpenedKeyboard = await evaluate(window, `(() => {
    const trigger = document.querySelector('#matter-trace-toggle')
    const trace = document.querySelector('#matter-trace-rail')
    return {
      drawerOpen: trace.dataset.drawerOpen,
      triggerExpanded: trigger.getAttribute('aria-expanded'),
      role: trace.getAttribute('role'),
      ariaModal: trace.getAttribute('aria-modal'),
      ariaHidden: trace.getAttribute('aria-hidden'),
      activeElementId: document.activeElement?.id ?? null,
      activeInside: trace.contains(document.activeElement),
    }
  })()`)
  await sendKey(window, 'Tab')
  const drawerTabContainment = await evaluate(window, `(() => {
    const trace = document.querySelector('#matter-trace-rail')
    return {
      activeElementId: document.activeElement?.id ?? null,
      activeInside: trace.contains(document.activeElement),
    }
  })()`)
  await sendKey(window, 'Escape')
  const drawerEscape = await evaluate(window, `(() => {
    const trigger = document.querySelector('#matter-trace-toggle')
    const trace = document.querySelector('#matter-trace-rail')
    return {
      drawerOpen: trace.dataset.drawerOpen,
      triggerExpanded: trigger.getAttribute('aria-expanded'),
      ariaHidden: trace.getAttribute('aria-hidden'),
      activeElementId: document.activeElement?.id ?? null,
    }
  })()`)
  if (drawerEscape.drawerOpen !== 'false') {
    await evaluate(window, `document.querySelector('#matter-trace-close').click()`)
  }

  await evaluate(window, `document.querySelector('#matter-trace-toggle').focus()`)
  await evaluate(window, `document.querySelector('#matter-trace-toggle').click()`)
  await evaluate(window, `document.querySelector('#matter-trace-close').focus()`)
  await evaluate(window, `document.querySelector('#matter-trace-close').click()`)
  const drawerCloseButton = await evaluate(window, `(() => {
    const trigger = document.querySelector('#matter-trace-toggle')
    const trace = document.querySelector('#matter-trace-rail')
    return {
      drawerOpen: trace.dataset.drawerOpen,
      ariaHidden: trace.getAttribute('aria-hidden'),
      activeElementId: document.activeElement?.id ?? null,
    }
  })()`)

  window.setContentSize(1440, 900)
  await delay(100)
  const drawerWideReturn = await evaluate(window, `(() => {
    const trigger = document.querySelector('#matter-trace-toggle')
    const trace = document.querySelector('#matter-trace-rail')
    return {
      innerWidth: window.innerWidth,
      drawerOpen: trace.dataset.drawerOpen,
      triggerExpanded: trigger.getAttribute('aria-expanded'),
      role: trace.getAttribute('role'),
      ariaModal: trace.getAttribute('aria-modal'),
      ariaHidden: trace.getAttribute('aria-hidden'),
      traceVisible: getComputedStyle(trace).visibility !== 'hidden' && trace.getBoundingClientRect().width > 0,
    }
  })()`)
  window.setContentSize(760, 900)
  await delay(100)
  const drawerNarrowReturn = await evaluate(window, `(() => {
    const trigger = document.querySelector('#matter-trace-toggle')
    const trace = document.querySelector('#matter-trace-rail')
    return {
      innerWidth: window.innerWidth,
      drawerOpen: trace.dataset.drawerOpen,
      triggerExpanded: trigger.getAttribute('aria-expanded'),
      role: trace.getAttribute('role'),
      ariaModal: trace.getAttribute('aria-modal'),
      ariaHidden: trace.getAttribute('aria-hidden'),
      triggerVisible: getComputedStyle(trigger).display !== 'none',
    }
  })()`)
  evidence.drawerKeyboardFacts = {
    before: drawerBeforeKeyboard,
    opened: drawerOpenedKeyboard,
    tabContainment: drawerTabContainment,
    escape: drawerEscape,
    closeButton: drawerCloseButton,
    wideReturn: drawerWideReturn,
    narrowReturn: drawerNarrowReturn,
  }
  if (batch10Assertions) {
    requireCondition(drawerBeforeKeyboard.triggerVisible === true && drawerBeforeKeyboard.activeElementId === 'matter-trace-toggle', 'narrow drawer trigger was not keyboard reachable')
    requireCondition(drawerOpenedKeyboard.drawerOpen === 'true' && drawerOpenedKeyboard.triggerExpanded === 'true' && drawerOpenedKeyboard.role === 'dialog' && drawerOpenedKeyboard.ariaModal === 'true' && drawerOpenedKeyboard.ariaHidden === 'false' && drawerOpenedKeyboard.activeInside === true, 'narrow trace rail did not open as a focused modal dialog')
    requireCondition(drawerTabContainment.activeInside === true, 'Tab escaped the open modal trace drawer')
    requireCondition(drawerEscape.drawerOpen === 'false' && drawerEscape.triggerExpanded === 'false' && drawerEscape.ariaHidden === 'true' && drawerEscape.activeElementId === 'matter-trace-toggle', 'real Escape did not close the modal drawer and restore focus')
    requireCondition(drawerCloseButton.drawerOpen === 'false' && drawerCloseButton.ariaHidden === 'true' && drawerCloseButton.activeElementId === 'matter-trace-toggle', 'drawer close button did not close and restore focus')
    requireCondition(drawerWideReturn.innerWidth >= 1400 && drawerWideReturn.drawerOpen === 'true' && drawerWideReturn.ariaHidden === 'false' && drawerWideReturn.ariaModal !== 'true' && drawerWideReturn.traceVisible === true, '760 to 1440 transition left stale modal or hidden drawer state')
    requireCondition(drawerNarrowReturn.innerWidth <= 760 && drawerNarrowReturn.drawerOpen === 'false' && drawerNarrowReturn.triggerExpanded === 'false' && drawerNarrowReturn.ariaHidden === 'true' && drawerNarrowReturn.triggerVisible === true, '1440 to 760 transition did not restore a closed narrow drawer')
  }

  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  const reducedMotion = await evaluate(window, `(() => {
    const panel = document.querySelector('.sage-panel.is-visible')
    const drawer = document.querySelector('#matter-trace-rail')
    const panelStyle = getComputedStyle(panel)
    const drawerStyle = getComputedStyle(drawer)
    const durations = (value) => value.split(',').map((part) => part.trim()).map((part) => part.endsWith('ms') ? Number.parseFloat(part) / 1000 : Number.parseFloat(part))
    return {
      mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      panelAnimationDuration: panelStyle.animationDuration,
      panelAnimationSeconds: durations(panelStyle.animationDuration),
      drawerTransitionDuration: drawerStyle.transitionDuration,
      drawerTransitionSeconds: durations(drawerStyle.transitionDuration),
    }
  })()`)
  evidence.reducedMotion = reducedMotion
  if (batch10Assertions) {
    requireCondition(reducedMotion.mediaMatches === true, 'CDP did not emulate prefers-reduced-motion: reduce')
    requireCondition(reducedMotion.panelAnimationSeconds.every((value) => Number.isFinite(value) && value <= 0.001), 'computed panel animation duration ignored reduced motion')
    requireCondition(reducedMotion.drawerTransitionSeconds.every((value) => Number.isFinite(value) && value <= 0.001), 'computed drawer transition duration ignored reduced motion')
  }
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  })

  window.setContentSize(640, 900)
  window.webContents.setZoomFactor(2)
  await delay(50)
  const zoomLayout = await evaluate(window, `(() => {
    const allowlist = ${JSON.stringify(HORIZONTAL_OVERFLOW_ALLOWLIST)}
    const visible = (node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    }
    const identity = (node) => node.id !== '' ? '#' + node.id : node.classList.length > 0 ? '.' + Array.from(node.classList).join('.') : node.tagName.toLowerCase()
    const overflow = Array.from(document.querySelectorAll('body *'))
      .filter((node) => visible(node) && node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1)
      .map((node) => ({
        identity: identity(node),
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        allowed: allowlist.some((selector) => node.matches(selector)),
      }))
    const critical = ['#view-matter', '#user-menu', '#matter-detail-goal', '#matter-stage-track', '#matter-trace-toggle'].map((selector) => {
      const node = document.querySelector(selector)
      return { selector, visible: node !== null && visible(node) }
    })
    return {
      zoomFactor: 2,
      innerWidth: window.innerWidth,
      rootDensity: document.documentElement.getAttribute('data-sage-density'),
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      horizontalOverflow: overflow,
      unexpectedHorizontalOverflow: overflow.filter((entry) => !entry.allowed),
      critical,
    }
  })()`)
  evidence.zoomLayout = zoomLayout
  requireCondition(zoomLayout.noHorizontalOverflow === true, '200% zoom has horizontal overflow')
  if (batch10Assertions) {
    requireCondition(zoomLayout.innerWidth >= 300 && zoomLayout.innerWidth <= 340, `200% reflow did not produce approximately 320 CSS px: ${zoomLayout.innerWidth}`)
    requireCondition(zoomLayout.unexpectedHorizontalOverflow.length === 0, `200% reflow has non-allowlisted internal overflow: ${JSON.stringify(zoomLayout.unexpectedHorizontalOverflow)}`)
    requireCondition(zoomLayout.critical.every((entry) => entry.visible), `200% reflow lost a critical matter control: ${JSON.stringify(zoomLayout.critical)}`)
  }
  if (batch11Assertions) requireCondition(zoomLayout.rootDensity === 'compact', 'approximately 320 CSS px checks did not run under compact density')
  await captureWindow(window, `sage-ui-fixture-${expectedProjection === 'fixture' ? requestedStage : 'unavailable'}-200pct.png`)
  if (batch11Assertions) {
    await captureWindow(window, `sage-ui-fixture-${expectedProjection === 'fixture' ? requestedStage : 'unavailable'}-compact-200pct.png`)
  }
  window.webContents.setZoomFactor(1)
  window.setContentSize(1440, 900)
  await delay(50)

  // 2. The real protocol wire carries the fixture matter projection.
  const stateProbe = await evaluate(window, `fetch('/.sage/state', {cache: 'no-store'})
    .then(async (response) => ({ status: response.status, body: await response.json() }))
    .catch((error) => ({ status: 'rejected:' + error.name }))`)
  const wireMatter = stateProbe.body?.matter ?? null
  evidence.stateProbe = stateProbe.status === 200
    ? {
        status: stateProbe.status,
        matterPresent: wireMatter !== null,
        matterId: wireMatter?.matter?.matterId ?? null,
        matterGoal: wireMatter?.matter?.goal ?? null,
        matterStage: wireMatter?.matter?.stage ?? null,
        matterConclusion: wireMatter?.matter?.conclusion ?? null,
        matterRevision: wireMatter?.matter?.currentRevisionId ?? null,
        revisionCount: wireMatter?.matter?.revisionCount ?? null,
        evidenceCount: wireMatter?.matter?.evidenceCount ?? null,
        unknownCount: wireMatter?.matter?.unknownCount ?? null,
        dependencyCount: wireMatter?.matter?.dependencyCount ?? null,
        pendingClarification: wireMatter?.matter?.pendingClarification !== undefined,
        decisionIds: Array.isArray(wireMatter?.decisions) ? wireMatter.decisions.map((decision) => decision.decisionId) : [],
        attempts: Array.isArray(wireMatter?.attempts) ? wireMatter.attempts.map((attempt) => ({ attemptId: attempt.attemptId, status: attempt.status })) : [],
        artifactIds: Array.isArray(wireMatter?.artifacts) ? wireMatter.artifacts.map((artifact) => artifact.artifactId) : [],
        receiptIds: Array.isArray(wireMatter?.receipts) ? wireMatter.receipts.map((receipt) => receipt.receiptId) : [],
        actionsBlocked: Array.isArray(wireMatter?.actions) && wireMatter.actions.every((action) => action.actionability === 'blocked'),
        routeCode: stateProbe.body?.code ?? null,
        routeStage: stateProbe.body?.stage ?? null,
        routeRetryable: stateProbe.body?.retryable ?? null,
        matterProjectionSource: wireMatter?.projectionSource ?? null,
        matterActionability: wireMatter?.actionability ?? null,
        matterDenialReason: wireMatter?.denialReason ?? null,
        serviceStatus: stateProbe.body?.service?.status ?? null,
        runtimeStatus: stateProbe.body?.runtime?.status ?? null,
        authStatus: stateProbe.body?.service?.auth?.status ?? null,
      }
    : stateProbe
  requireCondition(stateProbe.status === 200, `/.sage/state over the wire returned ${JSON.stringify(stateProbe.status)}`)

  // Batch 16 / P3 (ADR-0261): the two React support-card regions must reflect the same payload
  // mapping the legacy script would have applied (artifacts known -> cards; read tool results ->
  // results), and both region roots must carry their machine state for the real-window read.
  const expectedSitesState = stateProbe.status === 200 && stateProbe.body?.artifacts !== null && stateProbe.body?.artifacts !== undefined && typeof stateProbe.body?.artifacts === 'object' ? 'cards' : 'unavailable'
  const expectedToolResultsState = stateProbe.status === 200 && stateProbe.body?.toolResults !== null && stateProbe.body?.toolResults !== undefined && typeof stateProbe.body?.toolResults === 'object' && stateProbe.body.toolResults.state === 'read' ? 'results' : 'unavailable'
  const regionFacts = await evaluate(window, `(async () => {
    const snapshot = () => ({
      sites: document.querySelector('#sage-region-sites')?.getAttribute('data-region-state') ?? null,
      toolResults: document.querySelector('#sage-region-tool-results')?.getAttribute('data-region-state') ?? null,
    })
    const deadline = Date.now() + 4000
    while (Date.now() < deadline) {
      const facts = snapshot()
      if (facts.sites !== null && facts.toolResults !== null) return facts
      await new Promise((resolve) => { setTimeout(resolve, 10) })
    }
    return snapshot()
  })()`)
  evidence.regionFacts = { expectedSitesState, expectedToolResultsState, ...regionFacts }
  requireCondition(regionFacts.sites === expectedSitesState, `sites region state is ${regionFacts.sites}, expected ${expectedSitesState}`)
  requireCondition(regionFacts.toolResults === expectedToolResultsState, `tool-results region state is ${regionFacts.toolResults}, expected ${expectedToolResultsState}`)
  const wire = evidence.stateProbe
  if (expectedProjection === 'fixture') {
    requireCondition(wire.matterPresent === true, 'fixture matter is absent on the wire')
    requireCondition(wire.matterStage === requestedStage, 'URL query or fallback overrode the env-selected fixture stage')
    requireCondition(wire.matterProjectionSource === 'fixture', 'matter projection source is not fixture on the wire')
    requireCondition(documentFacts.matterId === wire.matterId, 'rendered matterId did not come from the same wire projection')
    requireCondition(documentFacts.matterGoal === wire.matterGoal, 'rendered goal did not come from the same wire projection')
    requireCondition(documentFacts.matterRevision === (wire.matterRevision ?? 'revision pending'), 'rendered revision did not come from the same wire projection')
    requireCondition(documentFacts.workspaceProjectionSource === wire.matterProjectionSource, 'rendered projectionSource did not come from the same wire projection')
    requireCondition(wire.matterActionability === 'blocked', 'fixture matter is not blocked')
    requireCondition(wire.matterDenialReason === 'fixture-only', 'fixture matter denial reason is not fixture-only')
    requireCondition(wire.actionsBlocked === true, 'fixture wire contains a non-blocked action')
  } else {
    requireCondition(wire.matterPresent === false, 'fail-closed route returned a matter projection')
    requireCondition(wire.matterProjectionSource === null, 'fail-closed route returned projection provenance')
    requireCondition(wire.routeCode === 'projection-read-unavailable', 'fail-closed route did not return the projection-read-unavailable code')
    requireCondition(wire.routeStage === 'read-policy', 'fail-closed route denial stage drifted')
    requireCondition(wire.routeRetryable === true, 'fail-closed route denial lost its retryable flag')
  }
  requireCondition(JSON.stringify(stageFacts.decisionIds) === JSON.stringify(wire.decisionIds), 'decision DOM retained rows outside the current wire state')
  requireCondition(JSON.stringify(stageFacts.attemptIds) === JSON.stringify(wire.attempts.map((attempt) => attempt.attemptId)), 'attempt DOM retained rows outside the current wire state')
  requireCondition(JSON.stringify(stageFacts.artifactIds) === JSON.stringify(wire.artifactIds), 'artifact DOM retained rows outside the current wire state')
  requireCondition(JSON.stringify(stageFacts.receiptIds) === JSON.stringify(wire.receiptIds), 'receipt DOM retained rows outside the current wire state')
  if (expectedProjection === 'fixture') {
    requireCondition(wire.serviceStatus === 'unavailable', 'service status drifted from unavailable-first')
    requireCondition(wire.runtimeStatus === 'ready', 'runtime projection missing on the wire')
    requireCondition(wire.authStatus === 'signed-out', 'fresh vault did not report signed-out')
  }

  // 3. The blocked write path stays typed under the fixture switch (read-only surface).
  const actionsProbe = await evaluate(window, `fetch('/.sage/actions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'retry' }),
  }).then(async (response) => ({ status: response.status, body: await response.json() }))`)
  evidence.actionsProbe = { status: actionsProbe.status, code: actionsProbe.body?.code ?? null, stage: actionsProbe.body?.stage ?? null }
  requireCondition(actionsProbe.status === 200 && actionsProbe.body?.code === 'identity-unavailable', 'actions denial is not the typed identity-unavailable shape')
  requireCondition(actionsProbe.body?.stage === 'identity-policy', 'actions denial stage drifted')

  // 4. No write landed in the designated Sage root while the fixture reads were served.
  const entries = snapshotEntries(sageRoot)
  const allowedPreferenceEntries = new Set(['preferences/.device-key', 'preferences/display.prefs'])
  const unexpectedBusinessEntries = entries.filter((entry) => !allowedPreferenceEntries.has(entry))
  evidence.sageRootEntries = entries
  evidence.sageRootClean = entries.length === 0
  evidence.localPreferenceEntries = entries.filter((entry) => allowedPreferenceEntries.has(entry))
  evidence.businessRootClean = unexpectedBusinessEntries.length === 0
  evidence.unexpectedBusinessEntries = unexpectedBusinessEntries
  if (batch10Assertions || batch11Assertions) {
    requireCondition(unexpectedBusinessEntries.length === 0, `theme/A11Y probe produced a business write: ${JSON.stringify(unexpectedBusinessEntries)}`)
  } else {
    requireCondition(entries.length === 0, `the designated Sage root gained entries: ${JSON.stringify(entries)}`)
  }

  if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach()
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
