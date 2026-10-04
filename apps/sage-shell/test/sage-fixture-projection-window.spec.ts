import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { buildProductionLibrary } from './support/build-production-library.js'

const PROBE_PATH = fileURLToPath(new URL('./support/sage-fixture-projection-probe.mjs', import.meta.url))
const RESULT_PREFIX = 'SAGE_FIXTURE_PROJECTION_RESULT '
const CHILD_TIMEOUT_MS = 50_000
const MAX_OUTPUT_BYTES = 512 * 1024
const activeChildren = new Set<ChildProcessWithoutNullStreams>()

const FIXTURE_STAGES = [
  'created',
  'evidence',
  'clarification',
  'running',
  'artifact-receipt',
  'failed-retry',
] as const
type FixtureStage = (typeof FIXTURE_STAGES)[number]

interface StageExpectation {
  readonly revisionCount: number
  readonly evidenceCount: number
  readonly unknownCount: number
  readonly dependencyCount: number
  readonly pendingClarification: boolean
  readonly decisionIds: readonly string[]
  readonly attempts: readonly { readonly attemptId: string; readonly status: string }[]
  readonly artifactIds: readonly string[]
  readonly receiptIds: readonly string[]
}

interface WireStateEvidence {
  readonly status: number | string
  readonly matterPresent: boolean
  readonly matterId: string | null
  readonly matterGoal: string | null
  readonly matterStage: string | null
  readonly matterConclusion: string | null
  readonly matterRevision: string | null
  readonly revisionCount: number | null
  readonly evidenceCount: number | null
  readonly unknownCount: number | null
  readonly dependencyCount: number | null
  readonly pendingClarification: boolean
  readonly decisionIds: readonly string[]
  readonly attempts: readonly { readonly attemptId: string; readonly status: string }[]
  readonly artifactIds: readonly string[]
  readonly receiptIds: readonly string[]
  readonly actionsBlocked: boolean
  readonly routeCode: string | null
  readonly routeStage: string | null
  readonly routeRetryable: boolean | null
  readonly matterProjectionSource: string | null
  readonly matterActionability: string | null
  readonly matterDenialReason: string | null
  readonly serviceStatus: string | null
  readonly runtimeStatus: string | null
  readonly authStatus: string | null
}

interface ThemeEvidence {
  readonly label: string
  readonly projectedRequested: 'system' | 'light' | 'dark' | null
  readonly projectedEffective: 'light' | 'dark' | null
  readonly projectedSystemDark: boolean | null
  readonly rootRequested: string | null
  readonly rootEffective: string | null
  readonly rootPalette: string | null
  readonly prefersDark: boolean
  readonly colorScheme: string
  readonly canvasToken: string
  readonly inkToken: string
  readonly focusToken: string
  readonly bodyBackground: string
  readonly bodyColor: string
  readonly nativeThemeSource: 'system' | 'light' | 'dark'
  readonly nativeShouldUseDarkColors: boolean | null
}

const DENSITY_SURFACES = ['nav', 'main', 'card', 'row', 'control'] as const
type DensitySurface = (typeof DENSITY_SURFACES)[number]
type RequestedDensity = 'comfortable' | 'compact'

interface DensityGeometryEvidence {
  readonly selector: string
  readonly present: boolean
  readonly metric: number
  readonly width: number
  readonly height: number
  readonly paddingTop: string
  readonly paddingRight: string
  readonly paddingBottom: string
  readonly paddingLeft: string
  readonly rowGap: string
  readonly columnGap: string
  readonly minHeight: string
  readonly fontSize: string
  readonly lineHeight: string
}

interface DensityEvidence {
  readonly label: string
  readonly projectedRequested: RequestedDensity | null
  readonly rootDensity: string | null
  readonly rootTheme: string | null
  readonly menuValue: string | null
  readonly settingsValue: string | null
  readonly viewportWidth: number
  readonly geometry: Readonly<Record<DensitySurface, DensityGeometryEvidence>>
}

const STAGE_EXPECTATIONS: Readonly<Record<FixtureStage, StageExpectation>> = {
  created: {
    revisionCount: 0,
    evidenceCount: 0,
    unknownCount: 0,
    dependencyCount: 0,
    pendingClarification: false,
    decisionIds: [],
    attempts: [],
    artifactIds: [],
    receiptIds: [],
  },
  evidence: {
    revisionCount: 1,
    evidenceCount: 1,
    unknownCount: 1,
    dependencyCount: 1,
    pendingClarification: false,
    decisionIds: [],
    attempts: [],
    artifactIds: [],
    receiptIds: [],
  },
  clarification: {
    revisionCount: 1,
    evidenceCount: 1,
    unknownCount: 1,
    dependencyCount: 1,
    pendingClarification: true,
    decisionIds: [],
    attempts: [],
    artifactIds: [],
    receiptIds: [],
  },
  running: {
    revisionCount: 1,
    evidenceCount: 1,
    unknownCount: 0,
    dependencyCount: 1,
    pendingClarification: false,
    decisionIds: ['decision:sage.shopify-abi.fixture.approved'],
    attempts: [{ attemptId: 'attempt:sage.shopify-abi.fixture.running', status: 'running' }],
    artifactIds: [],
    receiptIds: [],
  },
  'artifact-receipt': {
    revisionCount: 1,
    evidenceCount: 1,
    unknownCount: 0,
    dependencyCount: 1,
    pendingClarification: false,
    decisionIds: ['decision:sage.shopify-abi.fixture.approved'],
    attempts: [{ attemptId: 'attempt:sage.shopify-abi.fixture.artifact', status: 'succeeded' }],
    artifactIds: ['artifact:sage.shopify-abi.fixture.report'],
    receiptIds: [],
  },
  'failed-retry': {
    revisionCount: 1,
    evidenceCount: 1,
    unknownCount: 0,
    dependencyCount: 1,
    pendingClarification: false,
    decisionIds: ['decision:sage.shopify-abi.fixture.approved'],
    attempts: [
      { attemptId: 'attempt:sage.shopify-abi.fixture.failed', status: 'failed' },
      { attemptId: 'attempt:sage.shopify-abi.fixture.retry', status: 'failed' },
    ],
    artifactIds: [],
    receiptIds: [],
  },
}

interface ProbeResult {
  readonly schemaVersion: 1
  readonly outcome: 'pass' | 'no-go' | 'harness-fatal'
  readonly electron: string | null
  readonly chromium: string | null
  readonly processType: string | null
  readonly evidence: {
    readonly startupThemeApply?: {
      readonly state: 'applied' | 'refused'
      readonly requestedTheme: 'system' | 'light' | 'dark' | null
      readonly themeSource?: 'system' | 'light' | 'dark'
      readonly code?: string
    }
    readonly themeFacts?: {
      readonly startup: ThemeEvidence
      readonly transitions: readonly (ThemeEvidence & { readonly controlValue: string })[]
    }
    readonly densityFacts?: {
      readonly startup: DensityEvidence
      readonly transitions: readonly DensityEvidence[]
      readonly compactA11y: DensityEvidence | null
    }
    readonly documentFacts?: {
      readonly activeTabId: string | null
      readonly matterVisible: boolean
      readonly title: string
      readonly workspaceProjectionSource: string | null
      readonly matterId: string | null
      readonly matterGoal: string | null
      readonly matterRevision: string | null
      readonly sectionHeadingFontPx: number | null
      readonly matterGoalFontPx: number | null
      readonly displayChromeNodeCount: number
      readonly navItemCount: number
      readonly navItemIds: readonly string[]
      readonly reactAppMounted: boolean
      readonly matterRegionState: string | null
    }
    readonly navigationFacts?: {
      readonly requestedStage: string
      readonly queryStage: string
      readonly loadedUrl: string
      readonly queryDocumentStatus: number
      readonly visibleSearch: string
      readonly visibleHash: string
    }
    readonly stageFacts?: {
      readonly trackCurrentStage: string | null
      readonly trackVisible: boolean
      readonly stageLabel: string | null
      readonly contextStageLabel: string | null
      readonly stageItems: readonly {
        readonly token: string
        readonly state: string | null
        readonly ariaCurrent: string | null
      }[]
      readonly currentTokens: readonly string[]
      readonly fixtureBadges: readonly string[]
      readonly metrics: {
        readonly evidence: string | null
        readonly unknown: string | null
        readonly dependency: string | null
      }
      readonly clarification: string | null
      readonly decisionIds: readonly string[]
      readonly attemptIds: readonly string[]
      readonly artifactIds: readonly string[]
      readonly receiptIds: readonly string[]
      readonly actionPreviewCount: number
      readonly allActionPreviewsBlocked: boolean
    }
    readonly uiContractFacts?: {
      readonly tabPairsValid: boolean
      readonly matterDefault: boolean
      readonly opened: boolean
      readonly escaped: boolean
      readonly reducedMotionRule: boolean
      readonly allControlFocusRule: boolean
    }
    readonly realUserMenuEscape?: {
      readonly before: { readonly opened: boolean, readonly activeElementId: string | null }
      readonly after: { readonly closed: boolean, readonly activeElementId: string | null }
    }
    readonly navKeyboardFacts?: {
      readonly startActiveElementId: string | null
      readonly activeElementId: string | null
      readonly selectedId: string | null
      readonly tabStops: readonly string[]
      readonly outlineStyle: string
      readonly outlineWidth: string
      readonly outlineColor: string
    }
    readonly axTabNames?: {
      readonly expected: readonly string[]
      readonly actual: readonly string[]
    }
    readonly drawerKeyboardFacts?: {
      readonly before: Readonly<Record<string, unknown>>
      readonly opened: Readonly<Record<string, unknown>>
      readonly tabContainment: Readonly<Record<string, unknown>>
      readonly escape: Readonly<Record<string, unknown>>
      readonly closeButton: Readonly<Record<string, unknown>>
      readonly wideReturn: Readonly<Record<string, unknown>>
      readonly narrowReturn: Readonly<Record<string, unknown>>
    }
    readonly reducedMotion?: {
      readonly mediaMatches: boolean
      readonly panelAnimationDuration: string
      readonly panelAnimationSeconds: readonly number[]
      readonly drawerTransitionDuration: string
      readonly drawerTransitionSeconds: readonly number[]
    }
    readonly wideLayout?: {
      readonly innerWidth: number
      readonly contextVisible: boolean
      readonly currentVisible: boolean
      readonly traceVisible: boolean
      readonly ordered: boolean
      readonly composerControlCount: number
      readonly tracePosition: string
    }
    readonly narrowLayout?: {
      readonly innerWidth: number
      readonly rootDensity?: string | null
      readonly clientWidth: number
      readonly scrollWidth: number
      readonly noHorizontalOverflow: boolean
      readonly before: {
        readonly drawerOpen: string
        readonly drawerHidden: string
        readonly triggerVisible: boolean
        readonly currentVisible: boolean
      }
      readonly opened: boolean
      readonly escaped: boolean
    }
    readonly zoomLayout?: {
      readonly zoomFactor: number
      readonly innerWidth: number
      readonly rootDensity?: string | null
      readonly clientWidth: number
      readonly scrollWidth: number
      readonly noHorizontalOverflow: boolean
      readonly horizontalOverflow: readonly { readonly identity: string, readonly clientWidth: number, readonly scrollWidth: number, readonly allowed: boolean }[]
      readonly unexpectedHorizontalOverflow: readonly { readonly identity: string, readonly clientWidth: number, readonly scrollWidth: number, readonly allowed: boolean }[]
      readonly critical: readonly { readonly selector: string, readonly visible: boolean }[]
    }
    readonly pixelEvidence?: readonly {
      readonly name: string
      readonly width: number
      readonly height: number
      readonly byteLength: number
      readonly sha256: string
      readonly saved: boolean
    }[]
    readonly stateProbe?: WireStateEvidence
    readonly actionsProbe?: { readonly status: number; readonly code: string | null; readonly stage: string | null }
    readonly sageRootEntries?: readonly string[]
    readonly sageRootClean?: boolean
    readonly localPreferenceEntries?: readonly string[]
    readonly businessRootClean?: boolean
    readonly unexpectedBusinessEntries?: readonly string[]
    readonly mutateMode?: boolean
  }
  readonly failures: readonly string[]
  readonly harnessErrors: readonly string[]
  readonly passed: boolean
  readonly fatal?: string
}

interface ProbeRun {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly result: ProbeResult
}

function outputBytes(stdout: string, stderr: string): number {
  return Buffer.byteLength(stdout) + Buffer.byteLength(stderr)
}

async function runProbe(extraEnv: Record<string, string>, existingRoot?: string): Promise<ProbeRun> {
  buildProductionLibrary()
  const root = existingRoot ?? await mkdtemp(join(tmpdir(), 'sage-fixture-projection-'))
  try {
    return await new Promise((resolve, reject) => {
      const env: Record<string, string | undefined> = { ...process.env, ...extraEnv }
      delete env.ELECTRON_RUN_AS_NODE
      env.SAGE_ELECTRON_FIXTURE_PROBE_ROOT = root
      const child = spawn(process.execPath, [PROBE_PATH], {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      activeChildren.add(child)
      child.stdin.end()
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')

      let stdout = ''
      let stderr = ''
      let settled = false
      let timeout: NodeJS.Timeout
      const finish = (action: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        activeChildren.delete(child)
        action()
      }
      const append = (target: 'stdout' | 'stderr', chunk: string) => {
        if (target === 'stdout') stdout += chunk
        else stderr += chunk
        if (outputBytes(stdout, stderr) > MAX_OUTPUT_BYTES) {
          child.kill('SIGKILL')
          finish(() => reject(new Error('Sage fixture-projection window probe exceeded its output budget.')))
        }
      }
      child.stdout.on('data', (chunk: string) => { append('stdout', chunk) })
      child.stderr.on('data', (chunk: string) => { append('stderr', chunk) })
      child.once('error', (error) => { finish(() => reject(error)) })
      child.once('close', (code, signal) => {
        finish(() => {
          const resultLines = stdout.split(/\r?\n/u).filter((line) => line.startsWith(RESULT_PREFIX))
          if (resultLines.length !== 1) {
            reject(new Error(`Sage fixture-projection window probe emitted ${resultLines.length} result records.\n${stderr.trim()}`))
            return
          }
          try {
            resolve({
              exitCode: code,
              signal,
              result: JSON.parse(resultLines[0]!.slice(RESULT_PREFIX.length)) as ProbeResult,
            })
          } catch (error) {
            reject(new Error(`Sage fixture-projection window probe emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`))
          }
        })
      })
      timeout = setTimeout(() => {
        child.kill('SIGKILL')
        finish(() => reject(new Error(`Sage fixture-projection window probe exceeded ${CHILD_TIMEOUT_MS}ms.\n${stderr.trim()}`)))
      }, CHILD_TIMEOUT_MS)
    })
  } finally {
    if (existingRoot === undefined) await rm(root, { force: true, recursive: true })
  }
}

function expectPassingProbe(run: ProbeRun): void {
  expect(run, JSON.stringify(run.result, null, 2)).toMatchObject({ exitCode: 0, signal: null })
  expect(run.result).toMatchObject({
    schemaVersion: 1,
    outcome: 'pass',
    passed: true,
    electron: '43.3.0',
    processType: 'browser',
  })
  expect(run.result.fatal).toBeUndefined()
  expect(run.result.failures).toEqual([])
  expect(run.result.harnessErrors).toEqual([])
}

function expectFixtureStage(run: ProbeRun, stage: FixtureStage): void {
  expectPassingProbe(run)
  const { result } = run
  const expected = STAGE_EXPECTATIONS[stage]

  expect(result.evidence.navigationFacts).toMatchObject({
    requestedStage: stage,
    loadedUrl: 'dsh-app://app/index.html',
    queryDocumentStatus: 403,
  })
  expect(result.evidence.navigationFacts?.queryStage).not.toBe(stage)
  expect(result.evidence.navigationFacts?.visibleSearch).toBe(`?stage=${result.evidence.navigationFacts?.queryStage}`)
  expect(result.evidence.navigationFacts?.visibleHash).toBe(`#stage=${result.evidence.navigationFacts?.queryStage}`)
  expect(result.evidence.stateProbe).toMatchObject({
    status: 200,
    matterPresent: true,
    matterId: 'matter:sage.shopify-abi.fixture',
    matterStage: stage,
    matterConclusion: null,
    revisionCount: expected.revisionCount,
    evidenceCount: expected.evidenceCount,
    unknownCount: expected.unknownCount,
    dependencyCount: expected.dependencyCount,
    pendingClarification: expected.pendingClarification,
    decisionIds: expected.decisionIds,
    attempts: expected.attempts,
    artifactIds: expected.artifactIds,
    receiptIds: expected.receiptIds,
    actionsBlocked: true,
    matterProjectionSource: 'fixture',
    matterActionability: 'blocked',
    matterDenialReason: 'fixture-only',
  })
  expect(result.evidence.stateProbe?.matterRevision).toBe(stage === 'created'
    ? null
    : 'revision:sage.shopify-abi.fixture.1')

  expect(result.evidence.documentFacts).toMatchObject({
    activeTabId: 'view-matter',
    matterVisible: true,
    workspaceProjectionSource: 'fixture',
    matterId: 'matter:sage.shopify-abi.fixture',
    reactAppMounted: true,
    matterRegionState: 'fixture',
  })
  expect(result.evidence.stageFacts).toMatchObject({
    trackCurrentStage: stage,
    currentTokens: [stage],
    fixtureBadges: ['fixture projection', 'fixture projection · 不执行外部动作'],
    metrics: {
      evidence: String(expected.evidenceCount),
      unknown: String(expected.unknownCount),
      dependency: String(expected.dependencyCount),
    },
    decisionIds: expected.decisionIds,
    attemptIds: expected.attempts.map(({ attemptId }) => attemptId),
    artifactIds: expected.artifactIds,
    receiptIds: expected.receiptIds,
    allActionPreviewsBlocked: true,
  })
  expect(result.evidence.stageFacts?.stageItems).toHaveLength(FIXTURE_STAGES.length)
  expect(result.evidence.stageFacts?.stageItems).toEqual(FIXTURE_STAGES.map((token) => ({
    token,
    state: token === stage ? 'current' : 'idle',
    ariaCurrent: token === stage ? 'step' : 'false',
  })))
  expect(result.evidence.stageFacts?.actionPreviewCount).toBeGreaterThan(0)
  expect(result.evidence.stageFacts?.clarification).toContain(expected.pendingClarification
    ? '需要补充市场信号与现金约束证据。'
    : '当前没有待回答澄清。')

  const pixel = result.evidence.pixelEvidence?.find(({ name }) => name === `sage-ui-fixture-${stage}-1440.png`)
  expect(pixel).toMatchObject({ name: `sage-ui-fixture-${stage}-1440.png` })
  expect(pixel?.width).toBeGreaterThanOrEqual(1400)
  expect(pixel?.height).toBeGreaterThan(0)
  expect(pixel?.byteLength).toBeGreaterThan(1_000)
  expect(pixel?.sha256).toMatch(/^[a-f0-9]{64}$/u)

  // Every rendered trace ID is exactly the current wire set: no previous fixture can linger.
  expect(result.evidence.stageFacts?.decisionIds).toEqual(result.evidence.stateProbe?.decisionIds)
  expect(result.evidence.stageFacts?.attemptIds).toEqual(result.evidence.stateProbe?.attempts.map(({ attemptId }) => attemptId))
  expect(result.evidence.stageFacts?.artifactIds).toEqual(result.evidence.stateProbe?.artifactIds)
  expect(result.evidence.stageFacts?.receiptIds).toEqual(result.evidence.stateProbe?.receiptIds)
}

function expectUnavailableProjection(run: ProbeRun): void {
  expectPassingProbe(run)
  expect(run.result.evidence.navigationFacts).toMatchObject({
    loadedUrl: 'dsh-app://app/index.html',
    queryDocumentStatus: 403,
  })
  expect(run.result.evidence.navigationFacts?.visibleSearch).toBe(`?stage=${run.result.evidence.navigationFacts?.queryStage}`)
  expect(run.result.evidence.navigationFacts?.visibleHash).toBe(`#stage=${run.result.evidence.navigationFacts?.queryStage}`)
  expect(run.result.evidence.stateProbe).toMatchObject({
    status: 200,
    matterPresent: false,
    matterStage: null,
    matterProjectionSource: null,
    routeCode: 'projection-read-unavailable',
    routeStage: 'read-policy',
    routeRetryable: true,
    serviceStatus: null,
    runtimeStatus: null,
    authStatus: null,
  })
  expect(run.result.evidence.documentFacts).toMatchObject({
    workspaceProjectionSource: 'unavailable',
    matterId: '—',
    matterGoal: '当前没有可用的事项投影',
    reactAppMounted: true,
    matterRegionState: 'unavailable',
  })
  expect(run.result.evidence.stageFacts).toMatchObject({
    trackCurrentStage: 'unavailable',
    currentTokens: [],
    fixtureBadges: ['projection unavailable', 'projection unavailable · 不执行外部动作'],
    decisionIds: [],
    attemptIds: [],
    artifactIds: [],
    receiptIds: [],
    actionPreviewCount: 0,
    allActionPreviewsBlocked: true,
  })
  expect(run.result.evidence.stageFacts?.stageItems).toEqual(FIXTURE_STAGES.map((token) => ({
    token,
    state: 'idle',
    ariaCurrent: 'false',
  })))
  expect(run.result.evidence.sageRootClean).toBe(true)
  expect(run.result.evidence.sageRootEntries).toEqual([])
}

function expectThemeEvidence(facts: ThemeEvidence, requested: 'system' | 'light' | 'dark'): void {
  expect(facts.projectedRequested).toBe(requested)
  expect(facts.rootRequested).toBe(requested)
  expect(facts.rootEffective).toBe(facts.projectedEffective ?? 'unknown')
  expect(facts.nativeThemeSource).toBe(requested)
  if (facts.projectedEffective !== null) {
    expect(facts.nativeShouldUseDarkColors).toBe(facts.projectedEffective === 'dark')
    expect(facts.prefersDark).toBe(facts.projectedEffective === 'dark')
  }
  expect(facts.canvasToken).not.toBe('')
  expect(facts.inkToken).not.toBe('')
  expect(facts.focusToken).not.toBe('')
  expect(facts.bodyBackground).not.toBe('rgba(0, 0, 0, 0)')
}

function expectBatch10ThemeAndA11y(run: ProbeRun, stage: FixtureStage, includeSystem: boolean): void {
  expectFixtureStage(run, stage)
  const { evidence } = run.result

  expect(evidence.startupThemeApply).toEqual({ state: 'applied', requestedTheme: 'light', themeSource: 'light' })
  expect(evidence.themeFacts).toBeDefined()
  expectThemeEvidence(evidence.themeFacts!.startup, 'light')
  const expectedThemes = includeSystem ? ['light', 'dark', 'system'] as const : ['light', 'dark'] as const
  expect(evidence.themeFacts!.transitions.map(({ label }) => label)).toEqual(expectedThemes)
  for (const requested of expectedThemes) {
    const facts = evidence.themeFacts!.transitions.find(({ label }) => label === requested)
    expect(facts, requested).toBeDefined()
    expectThemeEvidence(facts!, requested)
    expect(facts!.controlValue).toBe(requested)
    const wide = evidence.pixelEvidence?.find(({ name }) => name === `sage-ui-fixture-${stage}-${requested}-1440.png`)
    expect(wide, `${stage}/${requested}/1440`).toMatchObject({ width: expect.any(Number), height: expect.any(Number) })
    expect(wide?.width).toBeGreaterThanOrEqual(1400)
    expect(wide?.byteLength).toBeGreaterThan(1_000)
    if (requested !== 'system') {
      const drawer = evidence.pixelEvidence?.find(({ name }) => name === `sage-ui-fixture-${stage}-${requested}-760-drawer.png`)
      expect(drawer, `${stage}/${requested}/760`).toMatchObject({ width: expect.any(Number), height: expect.any(Number) })
      expect(drawer?.width).toBeGreaterThanOrEqual(700)
      expect(drawer?.byteLength).toBeGreaterThan(1_000)
    }
  }

  expect(evidence.realUserMenuEscape).toEqual({
    before: { opened: true, activeElementId: 'user-menu' },
    after: { closed: true, activeElementId: 'user-menu' },
  })
  expect(evidence.navKeyboardFacts).toMatchObject({
    startActiveElementId: 'view-matter',
    activeElementId: 'view-search',
    selectedId: 'view-search',
    tabStops: ['view-search'],
  })
  expect(evidence.navKeyboardFacts?.outlineStyle).not.toBe('none')
  expect(Number.parseFloat(evidence.navKeyboardFacts?.outlineWidth ?? '0')).toBeGreaterThanOrEqual(2)
  expect(evidence.axTabNames).toEqual({
    expected: ['经营事项', '搜索', '自动化', '知识', '能力', '设置'],
    actual: ['经营事项', '搜索', '自动化', '知识', '能力', '设置'],
  })
  expect(evidence.drawerKeyboardFacts).toMatchObject({
    before: { triggerVisible: true, activeElementId: 'matter-trace-toggle' },
    opened: { drawerOpen: 'true', triggerExpanded: 'true', role: 'dialog', ariaModal: 'true', ariaHidden: 'false', activeInside: true },
    tabContainment: { activeInside: true },
    escape: { drawerOpen: 'false', triggerExpanded: 'false', ariaHidden: 'true', activeElementId: 'matter-trace-toggle' },
    closeButton: { drawerOpen: 'false', ariaHidden: 'true', activeElementId: 'matter-trace-toggle' },
    wideReturn: { drawerOpen: 'true', ariaHidden: 'false', traceVisible: true },
    narrowReturn: { drawerOpen: 'false', triggerExpanded: 'false', ariaHidden: 'true', triggerVisible: true },
  })
  expect(evidence.reducedMotion).toMatchObject({ mediaMatches: true })
  expect(evidence.reducedMotion?.panelAnimationSeconds.every((value) => value <= 0.001)).toBe(true)
  expect(evidence.reducedMotion?.drawerTransitionSeconds.every((value) => value <= 0.001)).toBe(true)
  expect(evidence.zoomLayout).toMatchObject({
    zoomFactor: 2,
    noHorizontalOverflow: true,
    unexpectedHorizontalOverflow: [],
  })
  expect(evidence.zoomLayout?.innerWidth).toBeGreaterThanOrEqual(300)
  expect(evidence.zoomLayout?.innerWidth).toBeLessThanOrEqual(340)
  expect(evidence.zoomLayout?.critical.every(({ visible }) => visible)).toBe(true)
  expect(evidence.businessRootClean).toBe(true)
  expect(evidence.unexpectedBusinessEntries).toEqual([])
  expect(evidence.localPreferenceEntries).toEqual(['preferences/.device-key', 'preferences/display.prefs'])
}

function expectDensityState(facts: DensityEvidence, requested: RequestedDensity): void {
  expect(facts.projectedRequested).toBe(requested)
  expect(facts.rootDensity).toBe(requested)
  expect(facts.menuValue).toBe(requested)
  expect(facts.settingsValue).toBe(requested)
  expect(facts.viewportWidth).toBeGreaterThanOrEqual(1_400)
  const selectors: Readonly<Record<DensitySurface, string>> = {
    nav: '#view-matter',
    main: '.sage-main',
    card: '#matter-current-work',
    row: '#matter-current-work .sage-state-row',
    control: '#user-menu',
  }
  for (const surface of DENSITY_SURFACES) {
    expect(facts.geometry[surface], surface).toMatchObject({
      selector: selectors[surface],
      present: true,
    })
    expect(facts.geometry[surface].metric, `${surface} computed density metric`).toBeGreaterThan(0)
    expect(facts.geometry[surface].fontSize, `${surface} computed font size`).not.toBe('')
    expect(facts.geometry[surface].lineHeight, `${surface} computed line height`).not.toBe('')
  }
}

function expectDensityGeometryCycle(cycle: readonly DensityEvidence[], theme: 'light' | 'dark'): void {
  expect(cycle.map(({ projectedRequested }) => projectedRequested)).toEqual(['comfortable', 'compact', 'comfortable'])
  expect(cycle.map(({ rootDensity }) => rootDensity)).toEqual(['comfortable', 'compact', 'comfortable'])
  expect(cycle.map(({ rootTheme }) => rootTheme)).toEqual([theme, theme, theme])
  const [comfortable, compact, restored] = cycle
  expectDensityState(comfortable!, 'comfortable')
  expectDensityState(compact!, 'compact')
  expectDensityState(restored!, 'comfortable')
  for (const surface of DENSITY_SURFACES) {
    const comfortableGeometry = comfortable!.geometry[surface]
    const compactGeometry = compact!.geometry[surface]
    const restoredGeometry = restored!.geometry[surface]
    expect(compactGeometry.metric, `${theme}/${surface} compact metric`).toBeLessThan(comfortableGeometry.metric)
    expect(restoredGeometry.metric, `${theme}/${surface} restored comfortable metric`).toBeCloseTo(comfortableGeometry.metric, 2)
    expect(compactGeometry.fontSize, `${theme}/${surface} compact font size`).toBe(comfortableGeometry.fontSize)
    expect(restoredGeometry.fontSize, `${theme}/${surface} restored font size`).toBe(comfortableGeometry.fontSize)
    expect(compactGeometry.lineHeight, `${theme}/${surface} compact line height`).toBe(comfortableGeometry.lineHeight)
    expect(restoredGeometry.lineHeight, `${theme}/${surface} restored line height`).toBe(comfortableGeometry.lineHeight)
  }
}

function expectBatch11DensityAndA11y(run: ProbeRun, stage: FixtureStage, startupDensity: RequestedDensity): void {
  expectBatch10ThemeAndA11y(run, stage, false)
  const { evidence } = run.result
  expect(evidence.densityFacts).toBeDefined()
  expectDensityState(evidence.densityFacts!.startup, startupDensity)
  expect(evidence.densityFacts!.startup.rootTheme).toBe('light')
  expect(evidence.densityFacts!.transitions).toHaveLength(6)

  for (const theme of ['light', 'dark'] as const) {
    const cycle = evidence.densityFacts!.transitions.filter(({ label }) => label.startsWith(`${theme}:`))
    expect(cycle.map(({ label }) => label)).toEqual([
      `${theme}:0:comfortable`,
      `${theme}:1:compact`,
      `${theme}:2:comfortable`,
    ])
    expectDensityGeometryCycle(cycle, theme)
    for (const [densityIndex, density] of ['comfortable', 'compact', 'comfortable'].entries()) {
      const wide = evidence.pixelEvidence?.find(({ name }) => name === `sage-ui-fixture-${stage}-${theme}-${densityIndex}-${density}-1440.png`)
      expect(wide, `${stage}/${theme}/${densityIndex}/${density}/1440`).toMatchObject({ width: expect.any(Number), height: expect.any(Number) })
      expect(wide?.width).toBeGreaterThanOrEqual(1_400)
      expect(wide?.byteLength).toBeGreaterThan(1_000)
      expect(wide?.sha256).toMatch(/^[a-f0-9]{64}$/u)
    }
    const drawer = evidence.pixelEvidence?.find(({ name }) => name === `sage-ui-fixture-${stage}-${theme}-compact-760-drawer.png`)
    expect(drawer, `${stage}/${theme}/compact/760`).toMatchObject({ width: expect.any(Number), height: expect.any(Number) })
    expect(drawer?.width).toBeGreaterThanOrEqual(700)
    expect(drawer?.byteLength).toBeGreaterThan(1_000)
  }

  expect(evidence.densityFacts!.compactA11y).not.toBeNull()
  expectDensityState(evidence.densityFacts!.compactA11y!, 'compact')
  expect(evidence.narrowLayout?.rootDensity).toBe('compact')
  expect(evidence.zoomLayout?.rootDensity).toBe('compact')
  const zoom = evidence.pixelEvidence?.find(({ name }) => name === `sage-ui-fixture-${stage}-compact-200pct.png`)
  expect(zoom, `${stage}/compact/200pct`).toMatchObject({ width: expect.any(Number), height: expect.any(Number) })
  expect(zoom?.byteLength).toBeGreaterThan(1_000)
  expect(evidence.businessRootClean).toBe(true)
  expect(evidence.unexpectedBusinessEntries).toEqual([])
}

afterEach(async () => {
  const exits = [...activeChildren].map(async (child) => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve()
      else child.once('close', () => resolve())
    })
  })
  await Promise.all(exits)
  activeChildren.clear()
})

describe('Sage fixture projection over the real window (WT-02D.1)', () => {
  it('serves the fixture matter slot over the real protocol wire and leaves the Sage root untouched', async () => {
    const run = await runProbe({ SAGE_FIXTURE_PROJECTION: '1' })
    const { result } = run

    expectFixtureStage(run, 'clarification')

    expect(run).toMatchObject({ exitCode: 0, signal: null })
    expect(result).toMatchObject({
      schemaVersion: 1,
      outcome: 'pass',
      passed: true,
      electron: '43.3.0',
      processType: 'browser',
    })
    expect(result.fatal).toBeUndefined()
    expect(result.failures).toEqual([])
    expect(result.harnessErrors).toEqual([])

    // The fixture marker stays visible in the served workspace document.
    expect(result.evidence.documentFacts).toMatchObject({ matterVisible: true, activeTabId: 'view-matter' })
    expect(result.evidence.documentFacts?.workspaceProjectionSource).toBe('fixture')

    // Batch 12 / UI-01A: the real document keeps the dense operational scale and no display chrome.
    expect(result.evidence.documentFacts?.displayChromeNodeCount).toBe(0)
    // Batch 13 / UI-01B: the real navigation ships exactly the six target tabs in order.
    expect(result.evidence.documentFacts?.navItemIds).toEqual([
      'view-matter', 'view-search', 'view-automation', 'view-knowledge', 'view-capabilities', 'view-settings',
    ])
    expect(result.evidence.documentFacts?.sectionHeadingFontPx).toBeGreaterThanOrEqual(16)
    expect(result.evidence.documentFacts?.sectionHeadingFontPx).toBeLessThanOrEqual(24)
    expect(result.evidence.documentFacts?.matterGoalFontPx).toBeGreaterThanOrEqual(16)
    expect(result.evidence.documentFacts?.matterGoalFontPx).toBeLessThanOrEqual(24)

    // The real wire carries the fixture matter slot; 0.2 service semantics are unchanged.
    expect(result.evidence.stateProbe).toMatchObject({
      status: 200,
      matterProjectionSource: 'fixture',
      matterActionability: 'blocked',
      matterDenialReason: 'fixture-only',
      serviceStatus: 'unavailable',
      runtimeStatus: 'ready',
      authStatus: 'signed-out',
    })
    expect({
      matterId: result.evidence.documentFacts?.matterId,
      matterGoal: result.evidence.documentFacts?.matterGoal,
      matterRevision: result.evidence.documentFacts?.matterRevision,
      projectionSource: result.evidence.documentFacts?.workspaceProjectionSource,
    }).toEqual({
      matterId: result.evidence.stateProbe?.matterId,
      matterGoal: result.evidence.stateProbe?.matterGoal,
      matterRevision: result.evidence.stateProbe?.matterRevision,
      projectionSource: result.evidence.stateProbe?.matterProjectionSource,
    })

    expect(result.evidence.uiContractFacts).toEqual({
      tabPairsValid: true,
      matterDefault: true,
      opened: true,
      escaped: true,
      reducedMotionRule: true,
      allControlFocusRule: true,
    })
    expect(result.evidence.wideLayout).toMatchObject({
      contextVisible: true,
      currentVisible: true,
      traceVisible: true,
      ordered: true,
      composerControlCount: 0,
      tracePosition: 'sticky',
    })
    expect(result.evidence.narrowLayout).toMatchObject({
      noHorizontalOverflow: true,
      opened: true,
      escaped: true,
      before: {
        drawerOpen: 'false',
        drawerHidden: 'true',
        triggerVisible: true,
        currentVisible: true,
      },
    })
    expect(result.evidence.narrowLayout?.innerWidth).toBeLessThanOrEqual(760)
    expect(result.evidence.zoomLayout).toMatchObject({
      zoomFactor: 2,
      noHorizontalOverflow: true,
    })

    // The blocked write path stays typed.
    expect(result.evidence.actionsProbe).toEqual({ status: 200, code: 'identity-unavailable', stage: 'identity-policy' })

    // Zero side effects: the designated Sage root gained nothing while reads were served.
    expect(result.evidence.sageRootClean).toBe(true)
    expect(result.evidence.sageRootEntries).toEqual([])
  }, 70_000)

  for (const stage of FIXTURE_STAGES.filter((candidate) => candidate !== 'clarification')) {
    it(`drives the ${stage} fixture through the production wire into the current-stage and trace DOM`, async () => {
      const run = await runProbe({
        SAGE_FIXTURE_PROJECTION: '1',
        SAGE_FIXTURE_STAGE: stage,
      })

      expectFixtureStage(run, stage)
      expect(run.result.evidence.wideLayout).toMatchObject({
        contextVisible: true,
        currentVisible: true,
        traceVisible: true,
        ordered: true,
        composerControlCount: 0,
        tracePosition: 'sticky',
      })
      expect(run.result.evidence.narrowLayout).toMatchObject({
        noHorizontalOverflow: true,
        opened: true,
        escaped: true,
      })
      expect(run.result.evidence.zoomLayout).toMatchObject({
        zoomFactor: 2,
        noHorizontalOverflow: true,
      })
      expect(run.result.evidence.sageRootClean).toBe(true)
      expect(run.result.evidence.sageRootEntries).toEqual([])
    }, 70_000)
  }

  for (const stage of FIXTURE_STAGES) {
    it(`renders the ${stage} fixture in light and dark with real theme and accessibility evidence`, async () => {
      const includeSystem = stage === 'clarification'
      const run = await runProbe({
        SAGE_FIXTURE_PROJECTION: '1',
        SAGE_FIXTURE_STAGE: stage,
        SAGE_FIXTURE_PROBE_BATCH10: '1',
        SAGE_FIXTURE_PROBE_SEED_THEME: 'light',
        ...(includeSystem ? { SAGE_FIXTURE_PROBE_INCLUDE_SYSTEM: '1' } : {}),
      })

      expectBatch10ThemeAndA11y(run, stage, includeSystem)
    }, 90_000)
  }

  it('restores the persisted requested theme in a second real Electron process over the same isolated data root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sage-fixture-projection-restart-'))
    try {
      const first = await runProbe({
        SAGE_FIXTURE_PROJECTION: '1',
        SAGE_FIXTURE_STAGE: 'clarification',
        SAGE_FIXTURE_PROBE_BATCH10: '1',
        SAGE_FIXTURE_PROBE_SEED_THEME: 'dark',
      }, root)
      expectFixtureStage(first, 'clarification')
      expect(first.result.evidence.themeFacts?.startup.projectedRequested).toBe('dark')
      expect(first.result.evidence.themeFacts?.startup.rootRequested).toBe('dark')
      expect(first.result.evidence.themeFacts?.startup.nativeThemeSource).toBe('dark')

      const restarted = await runProbe({
        SAGE_FIXTURE_PROJECTION: '1',
        SAGE_FIXTURE_STAGE: 'clarification',
        SAGE_FIXTURE_PROBE_BATCH10: '1',
      }, root)
      expectFixtureStage(restarted, 'clarification')
      expect(restarted.result.evidence.themeFacts?.startup).toMatchObject({
        projectedRequested: 'dark',
        rootRequested: 'dark',
        rootEffective: 'dark',
        nativeThemeSource: 'dark',
      })
      expect(restarted.result.evidence.businessRootClean).toBe(true)
      expect(restarted.result.evidence.localPreferenceEntries).toEqual(['preferences/.device-key', 'preferences/display.prefs'])
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  }, 150_000)

  it('applies comfortable -> compact -> comfortable density across light/dark, 1440, 760 drawer, and approximately 320 CSS px', async () => {
    const run = await runProbe({
      SAGE_FIXTURE_PROJECTION: '1',
      SAGE_FIXTURE_STAGE: 'clarification',
      SAGE_FIXTURE_PROBE_BATCH10: '1',
      SAGE_FIXTURE_PROBE_BATCH11: '1',
      SAGE_FIXTURE_PROBE_SEED_THEME: 'light',
      SAGE_FIXTURE_PROBE_SEED_DENSITY: 'comfortable',
    })

    expectBatch11DensityAndA11y(run, 'clarification', 'comfortable')
  }, 120_000)

  it('restores compact density in a second real Electron process over the same isolated data root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sage-fixture-density-restart-'))
    try {
      const first = await runProbe({
        SAGE_FIXTURE_PROJECTION: '1',
        SAGE_FIXTURE_STAGE: 'clarification',
        SAGE_FIXTURE_PROBE_BATCH10: '1',
        SAGE_FIXTURE_PROBE_BATCH11: '1',
        SAGE_FIXTURE_PROBE_SEED_THEME: 'light',
        SAGE_FIXTURE_PROBE_SEED_DENSITY: 'compact',
      }, root)
      const restarted = await runProbe({
        SAGE_FIXTURE_PROJECTION: '1',
        SAGE_FIXTURE_STAGE: 'clarification',
        SAGE_FIXTURE_PROBE_BATCH10: '1',
        SAGE_FIXTURE_PROBE_BATCH11: '1',
        SAGE_FIXTURE_PROBE_SEED_THEME: 'light',
      }, root)

      expectBatch11DensityAndA11y(first, 'clarification', 'compact')
      expectBatch11DensityAndA11y(restarted, 'clarification', 'compact')
      expect(restarted.result.evidence.densityFacts?.startup).toMatchObject({
        projectedRequested: 'compact',
        rootDensity: 'compact',
        menuValue: 'compact',
        settingsValue: 'compact',
      })
      expect(restarted.result.evidence.businessRootClean).toBe(true)
      expect(restarted.result.evidence.localPreferenceEntries).toEqual(['preferences/.device-key', 'preferences/display.prefs'])
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  }, 210_000)

  it('fails closed for an unknown fixture stage even when the URL asks for a valid stage', async () => {
    const run = await runProbe({
      SAGE_FIXTURE_PROJECTION: '1',
      SAGE_FIXTURE_STAGE: 'unknown-stage',
      SAGE_FIXTURE_PROBE_EXPECTATION: 'unavailable',
    })

    expectUnavailableProjection(run)
    expect(run.result.evidence.navigationFacts?.queryStage).toBe('failed-retry')
  }, 70_000)

  it('keeps production matter null when a stage token and conflicting URL query are supplied without the fixture switch', async () => {
    const run = await runProbe({
      SAGE_FIXTURE_STAGE: 'running',
      SAGE_FIXTURE_PROBE_EXPECTATION: 'unavailable',
    })

    expectUnavailableProjection(run)
    expect(run.result.evidence.navigationFacts).toMatchObject({
      requestedStage: 'running',
      queryStage: 'failed-retry',
    })
  }, 70_000)

  it('negative control: a write into the Sage root turns the zero-write assertion red', async () => {
    const run = await runProbe({ SAGE_FIXTURE_PROJECTION: '1', SAGE_FIXTURE_PROBE_MUTATE: '1' })
    const { result } = run

    expect(run.exitCode).toBe(2)
    expect(result.outcome).toBe('no-go')
    expect(result.evidence.mutateMode).toBe(true)
    expect(result.evidence.sageRootClean).toBe(false)
    expect(result.evidence.sageRootEntries).toEqual(['canary.txt'])
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('the designated Sage root gained entries')

    // Only the instrument fired: all wire assertions stayed green.
    expect(result.evidence.stateProbe).toMatchObject({ matterProjectionSource: 'fixture' })
  }, 70_000)
})
