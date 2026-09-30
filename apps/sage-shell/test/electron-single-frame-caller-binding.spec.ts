import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const PROBE_PATH = fileURLToPath(new URL('./support/electron-single-frame-caller-binding-probe.mjs', import.meta.url))
const RESULT_PREFIX = 'SAGE_SINGLE_FRAME_CALLER_BINDING_RESULT '
const CHILD_TIMEOUT_MS = 60_000
const MAX_OUTPUT_BYTES = 512 * 1024
const activeChildren = new Set<ChildProcessWithoutNullStreams>()

interface Sequenced {
  readonly sequence: number
  readonly caseId: string
}

interface Attempt extends Sequenced {
  readonly action: string
  readonly result?: Record<string, any>
}

interface BindingEvent extends Sequenced {
  readonly channel: 'read' | 'begin'
  readonly decision: 'allow' | 'deny'
  readonly senderIsExpected: boolean
  readonly senderSessionMatches: boolean
  readonly senderDestroyed: boolean
  readonly senderFrameIsCurrentMain: boolean
  readonly senderFrameOrigin: string | null
  readonly senderFrameDetached: boolean | null
  readonly senderFrameDestroyed: boolean | null
  readonly senderFrameParentIsNull: boolean
  readonly senderFrameTopIsSelf: boolean
  readonly eventProcessMatchesSenderFrame: boolean
  readonly eventFrameMatchesSenderFrame: boolean
  readonly frameTreeReadable: boolean
  readonly frameCount: number | null
  readonly frameTreeOnlyCurrentMain: boolean
  readonly generation: number | null
  readonly ready: boolean
  readonly contaminated: boolean
  readonly mode: string | null
}

interface BarrierEvent extends Sequenced {
  readonly operationRef: string
  readonly decision: 'allow' | 'deny'
  readonly operationGeneration: number
  readonly currentGeneration: number | null
  readonly ready: boolean
  readonly contaminated: boolean
  readonly mainOrigin: string | null
  readonly frameTreeReadable: boolean
  readonly frameCount: number | null
  readonly frameTreeOnlyCurrentMain: boolean
}

interface GenerationEvent extends Sequenced {
  readonly windowLabel: string
  readonly event: string
  readonly generation: number
  readonly ready?: boolean
  readonly contaminated?: boolean
  readonly reason?: string
  readonly url?: string
}

interface FrameEvent extends Sequenced {
  readonly windowLabel: string
  readonly event: string
  readonly isMainFrame: boolean
  readonly isSameDocument?: boolean
  readonly targetUrl?: string | null
  readonly frameTreeNodeId?: number | null
}

interface OperationEvent extends Sequenced {
  readonly operationRef: string
  readonly event: string
  readonly phase: string
  readonly generation: number
  readonly aborted: boolean
  readonly terminalReason: string | null
  readonly reason?: string
  readonly decision?: string
}

interface SyntheticEffect extends Sequenced {
  readonly operationRef: string
  readonly count: number
}

interface OperationSnapshot {
  readonly caseId: string
  readonly operationRef: string
  readonly generation: number
  readonly phase: string
  readonly terminalReason: string | null
  readonly effectCommitted: boolean
  readonly aborted: boolean
}

interface SecurityProfile {
  readonly label: string
  readonly mode: string
  readonly preventionMode: string
  readonly nodeIntegration: boolean
  readonly contextIsolation: boolean
  readonly sandbox: boolean
  readonly webSecurity: boolean
  readonly nodeIntegrationInSubFrames: boolean
  readonly webviewTag: boolean
}

interface ProbeResult {
  readonly schemaVersion: 1
  readonly outcome: 'pass' | 'no-go' | 'harness-fatal'
  readonly versions: {
    readonly electron: string | null
    readonly chromium: string | null
    readonly node: string
    readonly processType: string | null
    readonly electronRunAsNodePresent: boolean
  }
  readonly partition: string | null
  readonly securityProfiles: readonly SecurityProfile[]
  readonly preloadSurface: {
    readonly keys: readonly string[]
    readonly frozen: boolean
    readonly hasGenericIpc: boolean
    readonly requireType: string
    readonly processType: string
  }
  readonly csp: {
    readonly strict: string
    readonly adversarial: string
    readonly embeddable: string
    readonly responses: ReadonlyArray<{ readonly path: string; readonly csp: string }>
  }
  readonly attempts: readonly Attempt[]
  readonly bindingEvents: readonly BindingEvent[]
  readonly barrierEvents: readonly BarrierEvent[]
  readonly generationEvents: readonly GenerationEvent[]
  readonly frameEvents: readonly FrameEvent[]
  readonly operationEvents: readonly OperationEvent[]
  readonly syntheticEffects: readonly SyntheticEffect[]
  readonly syntheticEffectCounter: number
  readonly operations: readonly OperationSnapshot[]
  readonly prevention: {
    readonly windowOpenAttempts: number
    readonly windowOpenDenied: number
    readonly webviewAttachAttempts: number
    readonly webviewAttachDenied: number
    readonly strictSubframeNavigationsDenied: number
    readonly unownedTopNavigationsDenied: number
  }
  readonly cleanup: {
    readonly handlersExpected: number
    readonly handlersRemoved: number
    readonly protocolsExpected: number
    readonly protocolsRemoved: number
    readonly protocolHandlerCount: number
    readonly windowsBefore: number
    readonly windowsDestroyed: number
    readonly windowsRemaining: number
    readonly timersCleared: number
    readonly errors: readonly string[]
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

async function runProbe(): Promise<ProbeRun> {
  const root = await mkdtemp(join(tmpdir(), 'sage-electron-single-frame-caller-binding-'))
  try {
    return await new Promise((resolve, reject) => {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      env.SAGE_ELECTRON_SINGLE_FRAME_PROBE_ROOT = root
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
          finish(() => reject(new Error('Electron single-frame caller-binding probe exceeded its output budget.')))
        }
      }
      child.stdout.on('data', (chunk: string) => { append('stdout', chunk) })
      child.stderr.on('data', (chunk: string) => { append('stderr', chunk) })
      child.once('error', (error) => { finish(() => reject(error)) })
      child.once('close', (code, signal) => {
        finish(() => {
          const resultLines = stdout.split(/\r?\n/u).filter((line) => line.startsWith(RESULT_PREFIX))
          if (resultLines.length !== 1) {
            reject(new Error(`Electron single-frame caller-binding probe emitted ${resultLines.length} result records.\n${stderr.trim()}`))
            return
          }
          try {
            resolve({
              exitCode: code,
              signal,
              result: JSON.parse(resultLines[0]!.slice(RESULT_PREFIX.length)) as ProbeResult,
            })
          } catch (error) {
            reject(new Error(`Electron single-frame caller-binding probe emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`))
          }
        })
      })
      timeout = setTimeout(() => {
        child.kill('SIGKILL')
        finish(() => reject(new Error(`Electron single-frame caller-binding probe exceeded ${CHILD_TIMEOUT_MS}ms.\n${stderr.trim()}`)))
      }, CHILD_TIMEOUT_MS)
    })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

function one<T>(items: readonly T[], predicate: (item: T) => boolean): T {
  const matches = items.filter(predicate)
  expect(matches).toHaveLength(1)
  return matches[0]!
}

function expectOrder(...events: ReadonlyArray<{ readonly sequence: number }>): void {
  for (let index = 1; index < events.length; index += 1) {
    expect(events[index - 1]!.sequence).toBeLessThan(events[index]!.sequence)
  }
}

function attempt(result: ProbeResult, caseId: string, action: string): Attempt {
  return one(result.attempts, (entry) => entry.caseId === caseId && entry.action === action)
}

function binding(result: ProbeResult, caseId: string, channel: BindingEvent['channel']): BindingEvent {
  return one(result.bindingEvents, (entry) => entry.caseId === caseId && entry.channel === channel)
}

function generation(result: ProbeResult, caseId: string, event: string): GenerationEvent {
  return one(result.generationEvents, (entry) => entry.caseId === caseId && entry.event === event)
}

function operationEvent(result: ProbeResult, caseId: string, event: string): OperationEvent {
  return one(result.operationEvents, (entry) => entry.caseId === caseId && entry.event === event)
}

function operation(result: ProbeResult, caseId: string): OperationSnapshot {
  return one(result.operations, (entry) => entry.caseId === caseId)
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

const CHILD_FRAME_CASES = [
  'parser-same-origin-frame',
  'dynamic-same-origin-frame',
  'about-blank-frame',
  'srcdoc-frame',
  'blob-frame',
  'nested-frame',
  'pending-contamination-child',
  'removed-frame-still-denied',
  'same-document-still-denied',
  ...Array.from({ length: 8 }, (_, index) => `early-call-remove-${index + 1}`),
] as const

const OPAQUE_CHILD_CASES = ['data-opaque-frame', 'sandbox-opaque-frame'] as const

describe('Electron 43.3 single-frame caller-binding preflight', () => {
  it('records a pass when every nested browsing context contaminates the generation until a clean top cross-document reload', async () => {
    const run = await runProbe()
    const { result } = run

    expect(process.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(process.versions.electron).toBe('43.3.0')
    expect(run).toMatchObject({ exitCode: 0, signal: null })
    expect(result).toMatchObject({
      schemaVersion: 1,
      outcome: 'pass',
      passed: true,
      versions: {
        electron: '43.3.0',
        processType: 'browser',
        electronRunAsNodePresent: false,
      },
    })
    expect(result.fatal).toBeUndefined()
    expect(result.versions.chromium).toMatch(/^150\./u)
    expect(result.failures).toEqual([])
    expect(result.harnessErrors).toEqual([])

    expect(result.securityProfiles).toHaveLength(2)
    for (const profile of result.securityProfiles) {
      expect(profile).toMatchObject({
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        nodeIntegrationInSubFrames: false,
        webviewTag: false,
      })
    }
    expect(one(result.securityProfiles, ({ label }) => label === 'counterfactual')).toMatchObject({ mode: 'control' })
    expect(one(result.securityProfiles, ({ label }) => label === 'candidate')).toMatchObject({ mode: 'candidate' })

    expect(result.preloadSurface).toEqual({
      keys: ['beginOperation', 'readProjection'],
      frozen: true,
      hasGenericIpc: false,
      requireType: 'undefined',
      processType: 'undefined',
    })
    for (const csp of [result.csp.strict, result.csp.adversarial, result.csp.embeddable]) {
      expect(result.csp.responses.some((entry) => entry.csp === csp)).toBe(true)
    }
    expect(result.csp.strict).toContain("frame-src 'none'")
    expect(result.csp.adversarial).toContain("frame-ancestors 'none'")
    expect(result.csp.embeddable).toContain("frame-ancestors 'self'")

    // Control window: without the single-frame rule the revision 39 bypass still reproduces.
    const counterfactualAttempt = attempt(result, 'counterfactual-top-bridge', 'child-top-bridge')
    const counterfactualBinding = binding(result, 'counterfactual-top-bridge', 'begin')
    expect(counterfactualAttempt.result).toMatchObject({
      outcome: 'resolved',
      bridgeType: 'object',
      beginType: 'function',
      selfIsTop: false,
      origin: 'dsh-app://app',
      result: { ok: true, operationRef: 'single-frame-operation-1' },
    })
    expect(counterfactualBinding).toMatchObject({
      decision: 'allow',
      mode: 'control',
      senderIsExpected: true,
      senderSessionMatches: true,
      senderFrameIsCurrentMain: true,
      senderFrameOrigin: 'dsh-app://app',
      senderFrameParentIsNull: true,
      senderFrameTopIsSelf: true,
      eventProcessMatchesSenderFrame: true,
      eventFrameMatchesSenderFrame: true,
      frameTreeOnlyCurrentMain: false,
      frameCount: 2,
    })
    expect(operation(result, 'counterfactual-top-bridge')).toMatchObject({
      phase: 'cancelled',
      terminalReason: 'web-contents-destroyed',
      effectCommitted: false,
      aborted: true,
    })
    expect(result.syntheticEffects.filter(({ caseId }) => caseId === 'counterfactual-top-bridge')).toEqual([])
    expect(generation(result, 'counterfactual-top-bridge', 'clean-generation-committed')).toMatchObject({ generation: 1 })

    // Clean single-frame baseline: read and action both allowed, one effect through the barrier.
    expect(binding(result, 'trusted-clean-baseline', 'read')).toMatchObject({ decision: 'allow', mode: 'candidate', frameCount: 1, frameTreeOnlyCurrentMain: true })
    expect(binding(result, 'trusted-clean-baseline', 'begin')).toMatchObject({ decision: 'allow', mode: 'candidate', frameCount: 1, frameTreeOnlyCurrentMain: true })
    expect(one(result.attempts, (entry) => entry.caseId === 'trusted-clean-baseline' && entry.action === 'top-execute' && entry.result?.value === 'projection:trusted-clean-baseline:generation-1')).toBeTruthy()
    expect(operation(result, 'trusted-clean-baseline')).toMatchObject({ phase: 'completed', effectCommitted: true, terminalReason: 'completed', aborted: false })
    const baselineAccepted = operationEvent(result, 'trusted-clean-baseline', 'accepted')
    const baselineBarrier = operationEvent(result, 'trusted-clean-baseline', 'barrier-checked')
    const baselineDispatched = operationEvent(result, 'trusted-clean-baseline', 'dispatched')
    const baselineCompleted = operationEvent(result, 'trusted-clean-baseline', 'completed')
    expectOrder(baselineAccepted, baselineBarrier, baselineDispatched, baselineCompleted)
    expect(one(result.barrierEvents, (entry) => entry.caseId === 'trusted-clean-baseline')).toMatchObject({
      decision: 'allow',
      frameCount: 1,
      frameTreeOnlyCurrentMain: true,
      contaminated: false,
      mainOrigin: 'dsh-app://app',
    })

    // Every same-origin child shape is denied at the entry binding and commits nothing.
    for (const caseId of CHILD_FRAME_CASES) {
      expect(binding(result, caseId, 'begin')).toMatchObject({
        decision: 'deny',
        senderIsExpected: true,
        senderFrameIsCurrentMain: true,
        senderFrameOrigin: 'dsh-app://app',
        eventProcessMatchesSenderFrame: true,
        eventFrameMatchesSenderFrame: true,
      })
      expect(result.operations.some((entry) => entry.caseId === caseId)).toBe(false)
      expect(result.syntheticEffects.some((entry) => entry.caseId === caseId)).toBe(false)
    }
    for (const caseId of CHILD_FRAME_CASES.filter((entry) => entry !== 'removed-frame-still-denied' && entry !== 'same-document-still-denied')) {
      expect(binding(result, caseId, 'begin')).toMatchObject({ contaminated: true, ready: false, frameTreeOnlyCurrentMain: false })
    }

    // The parser-inserted same-origin child never yields a clean generation.
    expect(generation(result, 'parser-same-origin-frame', 'contaminated-generation-committed')).toMatchObject({ generation: 2, ready: false, contaminated: true })
    expect(result.generationEvents.filter(({ caseId, event }) => caseId === 'nested-frame' && event === 'child-contamination')).not.toHaveLength(0)
    expect(result.frameEvents.filter(({ caseId, event, isMainFrame }) => caseId === 'nested-frame' && event === 'frame-created' && isMainFrame === false).length).toBeGreaterThanOrEqual(2)

    // Sticky contamination: a removed child and a same-document navigation do not wash it.
    expect(binding(result, 'removed-frame-still-denied', 'begin')).toMatchObject({
      decision: 'deny',
      frameTreeOnlyCurrentMain: true,
      frameCount: 1,
      contaminated: true,
      ready: false,
    })
    expect(attempt(result, 'removed-frame-still-denied', 'top-execute').result).toEqual({ ok: false, code: 'unavailable' })
    expect(generation(result, 'same-document-still-denied', 'same-document-navigation-observed')).toMatchObject({ contaminated: true, ready: false })
    expect(one(result.attempts, (entry) => entry.caseId === 'same-document-still-denied' && entry.action === 'top-execute' && entry.result?.ok === false).result).toEqual({ ok: false, code: 'unavailable' })

    // Opaque-origin children never even reach the bridge.
    for (const caseId of OPAQUE_CHILD_CASES) {
      expect(attempt(result, caseId, 'child-top-bridge').result).toMatchObject({
        outcome: 'rejected',
        errorName: 'SecurityError',
        selfIsTop: false,
        origin: 'null',
      })
      expect(result.bindingEvents.some((entry) => entry.caseId === caseId)).toBe(false)
      expect(result.operations.some((entry) => entry.caseId === caseId)).toBe(false)
    }

    // A pending operation is cancelled by contamination before its durable barrier.
    expect(attempt(result, 'pending-before-contamination', 'top-execute').result).toMatchObject({ ok: true, operationRef: 'single-frame-operation-3' })
    expect(operation(result, 'pending-before-contamination')).toMatchObject({
      phase: 'cancelled',
      terminalReason: 'non-main-frame-created',
      effectCommitted: false,
      aborted: true,
    })
    expectOrder(
      operationEvent(result, 'pending-before-contamination', 'accepted'),
      operationEvent(result, 'pending-before-contamination', 'cancelled'),
    )
    expect(result.syntheticEffects.filter(({ caseId }) => caseId === 'pending-before-contamination')).toEqual([])

    // Only a clean top cross-document reload recovers a fresh trusted generation.
    expect(generation(result, 'clean-top-reload-recovery', 'clean-generation-committed')).toMatchObject({ generation: 19, ready: true, contaminated: false })
    expect(one(result.attempts, (entry) => entry.caseId === 'clean-top-reload-recovery' && entry.action === 'top-execute' && entry.result?.value === 'projection:clean-top-reload-recovery:generation-19')).toBeTruthy()
    expect(binding(result, 'clean-top-reload-recovery', 'read')).toMatchObject({ decision: 'allow', generation: 19 })
    expect(binding(result, 'clean-top-reload-recovery', 'begin')).toMatchObject({ decision: 'allow', generation: 19 })
    expect(operation(result, 'clean-top-reload-recovery')).toMatchObject({ phase: 'completed', effectCommitted: true, generation: 19 })
    expect(operation(result, 'pending-before-contamination')).toMatchObject({ phase: 'cancelled', effectCommitted: false })

    // Prevention layer keeps window.open / webview / object / embed out while CSP violations are observable.
    const strictAttempt = attempt(result, 'strict-prevention-layer', 'top-execute')
    expect(strictAttempt.result).toMatchObject({ popupWasNull: true, webviewGetWebContentsIdType: 'undefined' })
    const directives = new Set((strictAttempt.result?.violations ?? []).flatMap((entry: Record<string, string>) => [entry.effectiveDirective, entry.violatedDirective]))
    expect(directives.has('frame-src') || directives.has('child-src')).toBe(true)
    expect(directives.has('object-src')).toBe(true)
    expect(result.prevention).toMatchObject({ windowOpenAttempts: 1, windowOpenDenied: 1 })
    expect(result.operations.some((entry) => entry.caseId === 'strict-prevention-layer')).toBe(false)
    expect(result.syntheticEffects.some((entry) => entry.caseId === 'strict-prevention-layer')).toBe(false)
    expect(result.generationEvents.filter(({ caseId, event }) => caseId === 'strict-prevention-layer' && event === 'child-contamination')).not.toHaveLength(0)

    expect(result.syntheticEffects).toMatchObject([
      { caseId: 'trusted-clean-baseline', count: 1 },
      { caseId: 'clean-top-reload-recovery', count: 2 },
    ])
    expect(result.syntheticEffectCounter).toBe(2)
    expect(result.operations).toHaveLength(4)

    const sequenced = [
      ...result.attempts,
      ...result.bindingEvents,
      ...result.barrierEvents,
      ...result.generationEvents,
      ...result.frameEvents,
      ...result.operationEvents,
      ...result.syntheticEffects,
    ]
    expect(new Set(sequenced.map(({ sequence }) => sequence)).size).toBe(sequenced.length)
    expect(sequenced.every(({ sequence }) => Number.isInteger(sequence) && sequence > 0)).toBe(true)

    expect(result.cleanup).toEqual({
      handlersExpected: 2,
      handlersRemoved: 2,
      protocolsExpected: 1,
      protocolsRemoved: 1,
      protocolHandlerCount: 1,
      windowsBefore: 1,
      windowsDestroyed: 1,
      windowsRemaining: 0,
      timersCleared: 0,
      errors: [],
    })
  }, 75_000)
})
