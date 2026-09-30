import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const PROBE_PATH = fileURLToPath(new URL('./support/electron-ipc-caller-binding-probe.mjs', import.meta.url))
const RESULT_PREFIX = 'SAGE_IPC_CALLER_BINDING_RESULT '
const CHILD_TIMEOUT_MS = 50_000
const MAX_OUTPUT_BYTES = 512 * 1024
const activeChildren = new Set<ChildProcessWithoutNullStreams>()

interface Sequenced {
  readonly sequence: number
  readonly caseId: string
}

interface Attempt extends Sequenced {
  readonly action: string
  readonly outcome: string
  readonly result?: Record<string, any>
  readonly securityDenied?: boolean
}

interface BindingEvent extends Sequenced {
  readonly channel: 'read' | 'begin' | 'cancel'
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
}

interface LifecycleEvent {
  readonly sequence: number
  readonly event: string
  readonly affectedCaseIds: readonly string[]
  readonly isSameDocument?: boolean
  readonly reason?: string
}

interface OperationEvent extends Sequenced {
  readonly event: string
  readonly phase: string
  readonly aborted: boolean
  readonly terminalReason: string | null
}

interface SyntheticEffect extends Sequenced {
  readonly count: number
}

interface OperationSnapshot {
  readonly caseId: string
  readonly phase: string
  readonly effectCommitted: boolean
  readonly terminalReason: string | null
  readonly aborted: boolean
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
  readonly webPreferences: {
    readonly nodeIntegration: boolean
    readonly contextIsolation: boolean
    readonly sandbox: boolean
    readonly webSecurity: boolean
  }
  readonly windowSecurityProfiles: ReadonlyArray<{
    readonly label: string
    readonly nodeIntegration: boolean
    readonly contextIsolation: boolean
    readonly sandbox: boolean
    readonly webSecurity: boolean
    readonly nodeIntegrationInSubFrames: boolean
    readonly adversarialTestOnly: boolean
  }>
  readonly partition: string
  readonly otherPartition: string
  readonly preloadSurface: {
    readonly keys: readonly string[]
    readonly frozen: boolean
    readonly hasGenericIpc: boolean
    readonly requireType: string
    readonly processType: string
  }
  readonly subframeBridge: { readonly hasBridge: boolean; readonly type: string }
  readonly subframeTopBridgeEvidence: {
    readonly childOrigin: string
    readonly topOrigin: string
    readonly bridgeType: string
    readonly beginType: string
  }
  readonly attempts: readonly Attempt[]
  readonly bindingEvents: readonly BindingEvent[]
  readonly lifecycleEvents: readonly LifecycleEvent[]
  readonly operationEvents: readonly OperationEvent[]
  readonly syntheticEffects: readonly SyntheticEffect[]
  readonly syntheticEffectCounter: number
  readonly operations: readonly OperationSnapshot[]
  readonly cleanup: {
    readonly handlersExpected: number
    readonly handlersRemoved: number
    readonly protocolsExpected: number
    readonly protocolsRemoved: number
    readonly operationsAborted: number
    readonly windowsBefore: number
    readonly windowsDestroyed: number
    readonly windowsRemaining: number
    readonly pendingTimersBefore: number
    readonly timersCleared: number
    readonly errors: readonly string[]
  }
  readonly failures: readonly string[]
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
  const root = await mkdtemp(join(tmpdir(), 'sage-electron-ipc-caller-binding-'))
  try {
    return await new Promise((resolve, reject) => {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      env.SAGE_ELECTRON_IPC_CALLER_PROBE_ROOT = root
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
          finish(() => reject(new Error('Electron IPC caller-binding probe exceeded its output budget.')))
        }
      }
      child.stdout.on('data', (chunk: string) => { append('stdout', chunk) })
      child.stderr.on('data', (chunk: string) => { append('stderr', chunk) })
      child.once('error', (error) => { finish(() => reject(error)) })
      child.once('close', (code, signal) => {
        finish(() => {
          const resultLines = stdout.split(/\r?\n/u).filter((line) => line.startsWith(RESULT_PREFIX))
          if (resultLines.length !== 1) {
            reject(new Error(`Electron IPC caller-binding probe emitted ${resultLines.length} result records.\n${stderr.trim()}`))
            return
          }
          try {
            resolve({
              exitCode: code,
              signal,
              result: JSON.parse(resultLines[0]!.slice(RESULT_PREFIX.length)) as ProbeResult,
            })
          } catch (error) {
            reject(new Error(`Electron IPC caller-binding probe emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`))
          }
        })
      })
      timeout = setTimeout(() => {
        child.kill('SIGKILL')
        finish(() => reject(new Error(`Electron IPC caller-binding probe exceeded ${CHILD_TIMEOUT_MS}ms.\n${stderr.trim()}`)))
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

function operationEvent(result: ProbeResult, caseId: string, event: string): OperationEvent {
  return one(result.operationEvents, (entry) => entry.caseId === caseId && entry.event === event)
}

function lifecycle(result: ProbeResult, caseId: string, event: string): LifecycleEvent {
  return one(result.lifecycleEvents, (entry) => entry.event === event && entry.affectedCaseIds.includes(caseId))
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

describe('Electron 43.3 IPC caller-binding preflight', () => {
  it('records exact NO-GO when a same-origin child can borrow the top-frame bridge', async () => {
    const run = await runProbe()
    const { result } = run

    expect(process.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(process.versions.electron).toBe('43.3.0')
    expect(run).toMatchObject({ exitCode: 2, signal: null })
    expect(result).toMatchObject({
      schemaVersion: 1,
      outcome: 'no-go',
      passed: false,
      versions: {
        electron: '43.3.0',
        processType: 'browser',
        electronRunAsNodePresent: false,
      },
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    })
    expect(result.fatal).toBeUndefined()
    expect(result.versions.chromium).toMatch(/^150\./u)
    expect(result.partition).not.toBe(result.otherPartition)
    expect(result.failures).toEqual([
      'same-origin-subframe-top-bridge: child access to the top bridge did not fail closed',
      'same-origin-subframe-top-bridge: child top-bridge call was allowed by main',
      'same-origin-subframe-top-bridge: child top-bridge call created an operation',
    ])

    expect(result.preloadSurface).toEqual({
      frozen: true,
      hasGenericIpc: false,
      keys: ['beginOperation', 'cancelOperation', 'readProjection'],
      processType: 'undefined',
      requireType: 'undefined',
    })
    expect(result.subframeBridge).toEqual({ hasBridge: false, type: 'undefined' })
    expect(result.subframeTopBridgeEvidence).toEqual({
      childOrigin: 'dsh-app://app',
      topOrigin: 'dsh-app://app',
      bridgeType: 'object',
      beginType: 'function',
    })
    expect(result.windowSecurityProfiles.filter(({ nodeIntegrationInSubFrames }) => nodeIntegrationInSubFrames)).toEqual([{
      label: 'trusted-subframe-probe',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      nodeIntegrationInSubFrames: true,
      adversarialTestOnly: true,
    }])
    expect(result.windowSecurityProfiles.filter(({ label }) => label !== 'trusted-subframe-probe')).not.toHaveLength(0)
    for (const profile of result.windowSecurityProfiles.filter(({ label }) => label !== 'trusted-subframe-probe')) {
      expect(profile).toMatchObject({
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        nodeIntegrationInSubFrames: false,
        adversarialTestOnly: false,
      })
    }

    const subframeBinding = binding(result, 'subframe-internal-attempt', 'begin')
    expect(attempt(result, 'subframe-internal-attempt', 'begin-internal').result).toEqual({ ok: false, code: 'unavailable' })
    expect(subframeBinding).toMatchObject({
      decision: 'deny',
      senderIsExpected: true,
      senderSessionMatches: true,
      senderFrameIsCurrentMain: false,
      senderFrameOrigin: 'dsh-app://app',
      eventProcessMatchesSenderFrame: true,
      eventFrameMatchesSenderFrame: true,
    })

    const trustedRead = attempt(result, 'trusted-read-projection', 'read')
    expect(trustedRead.result).toEqual({
      ok: true,
      projection: { kind: 'caller-binding-probe', revision: 39 },
      status: 'available',
    })
    expect(binding(result, 'trusted-read-projection', 'read')).toMatchObject({ decision: 'allow', senderIsExpected: true })
    expect(attempt(result, 'hostile-read-projection', 'read').result).toEqual({ code: 'unavailable', ok: false })
    expect(binding(result, 'hostile-read-projection', 'read')).toMatchObject({ decision: 'deny', senderIsExpected: false })

    const topAttempt = attempt(result, 'same-origin-subframe-top-bridge', 'top-bridge-begin')
    const topBinding = binding(result, 'same-origin-subframe-top-bridge', 'begin')
    const topAccepted = operationEvent(result, 'same-origin-subframe-top-bridge', 'accepted')
    expect(topAttempt).toMatchObject({ outcome: 'response', result: { ok: true } })
    expect(topBinding).toMatchObject({
      decision: 'allow',
      senderIsExpected: true,
      senderSessionMatches: true,
      senderFrameIsCurrentMain: true,
      senderFrameOrigin: 'dsh-app://app',
      eventProcessMatchesSenderFrame: true,
      eventFrameMatchesSenderFrame: true,
    })
    expect(operation(result, 'same-origin-subframe-top-bridge')).toMatchObject({ effectCommitted: false, phase: 'cancelled' })
    expect(result.syntheticEffects.filter(({ caseId }) => caseId === 'same-origin-subframe-top-bridge')).toEqual([])
    expectOrder(topBinding, topAccepted, topAttempt)

    expect(attempt(result, 'forged-extra-field', 'begin').result).toEqual({ code: 'unavailable', ok: false })
    expect(binding(result, 'forged-extra-field', 'begin')).toMatchObject({
      decision: 'deny',
      senderIsExpected: true,
      senderSessionMatches: true,
      senderFrameIsCurrentMain: true,
      senderFrameOrigin: 'dsh-app://app',
    })
    expect(result.operations.some(({ caseId }) => caseId === 'forged-extra-field')).toBe(false)

    expect(binding(result, 'same-origin-other-webcontents', 'begin')).toMatchObject({
      decision: 'deny', senderIsExpected: false, senderSessionMatches: true, senderFrameOrigin: 'dsh-app://app',
    })
    expect(binding(result, 'different-partition', 'begin')).toMatchObject({
      decision: 'deny', senderIsExpected: false, senderSessionMatches: false, senderFrameOrigin: 'dsh-app://app',
    })
    expect(binding(result, 'other-origin', 'begin')).toMatchObject({
      decision: 'deny', senderIsExpected: true, senderSessionMatches: true, senderFrameOrigin: 'dsh-app://other',
    })
    expect(binding(result, 'opaque-origin', 'begin')).toMatchObject({
      decision: 'deny', senderIsExpected: true, senderSessionMatches: true, senderFrameOrigin: 'null',
    })
    for (const caseId of ['same-origin-other-webcontents', 'different-partition', 'other-origin', 'opaque-origin']) {
      expect(attempt(result, caseId, 'begin').result).toEqual({ code: 'unavailable', ok: false })
      expect(result.operations.some((entry) => entry.caseId === caseId)).toBe(false)
    }

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
    for (const [caseId, phase] of expectedPhases) expect(operation(result, caseId).phase).toBe(phase)

    for (const [caseId, lifecycleName, reason, sameDocument] of [
      ['navigation-before-effect', 'navigation', 'navigation', false],
      ['same-document-navigation-before-effect', 'navigation', 'navigation', true],
      ['destroy-before-effect', 'destroyed', 'destroyed', undefined],
      ['render-process-gone-before-effect', 'render-process-gone', 'render-process-gone', undefined],
    ] as const) {
      const lifecycleEvent = lifecycle(result, caseId, lifecycleName)
      const cancelled = operationEvent(result, caseId, 'cancelled')
      const dispatchCheck = operationEvent(result, caseId, 'dispatch-check')
      const blocked = operationEvent(result, caseId, 'dispatch-blocked')
      if (sameDocument !== undefined) expect(lifecycleEvent.isSameDocument).toBe(sameDocument)
      expect(cancelled).toMatchObject({ aborted: true, terminalReason: reason })
      expect(dispatchCheck.aborted).toBe(true)
      expect(result.syntheticEffects.filter((entry) => entry.caseId === caseId)).toEqual([])
      expectOrder(lifecycleEvent, cancelled, dispatchCheck, blocked)
    }

    const sameCancelBinding = binding(result, 'same-caller-explicit-cancel', 'cancel')
    const sameCancelled = operationEvent(result, 'same-caller-explicit-cancel', 'cancelled')
    const sameCancelCheck = operationEvent(result, 'same-caller-explicit-cancel', 'dispatch-check')
    const sameCancelBlocked = operationEvent(result, 'same-caller-explicit-cancel', 'dispatch-blocked')
    expect(attempt(result, 'same-caller-explicit-cancel', 'cancel').result).toEqual({ ok: true, status: 'cancelled' })
    expect(sameCancelBinding.decision).toBe('allow')
    expect(sameCancelled).toMatchObject({ aborted: true, terminalReason: 'explicit-cancel' })
    expectOrder(sameCancelBinding, sameCancelled, sameCancelCheck, sameCancelBlocked)

    const crossCancelBinding = binding(result, 'cross-caller-explicit-cancel', 'cancel')
    expect(attempt(result, 'cross-caller-explicit-cancel', 'cancel').result).toEqual({ code: 'unavailable', ok: false })
    expect(crossCancelBinding).toMatchObject({
      decision: 'deny',
      senderIsExpected: true,
      senderSessionMatches: true,
      senderFrameIsCurrentMain: true,
      senderFrameOrigin: 'dsh-app://app',
      eventProcessMatchesSenderFrame: true,
      eventFrameMatchesSenderFrame: true,
    })
    expect(result.operationEvents.filter(({ caseId, event }) => caseId === 'cross-caller-explicit-cancel' && event === 'cancelled')).toEqual([])

    expect(result.syntheticEffects).toMatchObject([
      { caseId: 'trusted-success', count: 1 },
      { caseId: 'cross-caller-explicit-cancel', count: 2 },
      { caseId: 'post-dispatch-explicit-cancel', count: 3 },
      { caseId: 'post-dispatch-disconnect', count: 4 },
    ])
    expect(result.syntheticEffectCounter).toBe(4)

    const successAccepted = operationEvent(result, 'trusted-success', 'accepted')
    const successCheck = operationEvent(result, 'trusted-success', 'dispatch-check')
    const successEffect = one(result.syntheticEffects, ({ caseId }) => caseId === 'trusted-success')
    const successDispatched = operationEvent(result, 'trusted-success', 'dispatched')
    const successCompleted = operationEvent(result, 'trusted-success', 'completed')
    expectOrder(successAccepted, successCheck, successEffect, successDispatched, successCompleted)

    const crossAccepted = operationEvent(result, 'cross-caller-explicit-cancel', 'accepted')
    const crossCheck = operationEvent(result, 'cross-caller-explicit-cancel', 'dispatch-check')
    const crossEffect = one(result.syntheticEffects, ({ caseId }) => caseId === 'cross-caller-explicit-cancel')
    const crossDispatched = operationEvent(result, 'cross-caller-explicit-cancel', 'dispatched')
    const crossCompleted = operationEvent(result, 'cross-caller-explicit-cancel', 'completed')
    expectOrder(crossAccepted, crossCancelBinding, crossCheck, crossEffect, crossDispatched, crossCompleted)

    const postCancelCheck = operationEvent(result, 'post-dispatch-explicit-cancel', 'dispatch-check')
    const postCancelEffect = one(result.syntheticEffects, ({ caseId }) => caseId === 'post-dispatch-explicit-cancel')
    const postCancelDispatched = operationEvent(result, 'post-dispatch-explicit-cancel', 'dispatched')
    const postCancelBinding = binding(result, 'post-dispatch-explicit-cancel', 'cancel')
    const postCancelUnknown = operationEvent(result, 'post-dispatch-explicit-cancel', 'outcome-unknown')
    const postCancelIgnored = operationEvent(result, 'post-dispatch-explicit-cancel', 'completion-ignored')
    expect(attempt(result, 'post-dispatch-explicit-cancel', 'cancel').result).toEqual({ ok: true, status: 'outcome-unknown' })
    expectOrder(postCancelCheck, postCancelEffect, postCancelDispatched, postCancelBinding, postCancelUnknown, postCancelIgnored)

    const postDisconnectCheck = operationEvent(result, 'post-dispatch-disconnect', 'dispatch-check')
    const postDisconnectEffect = one(result.syntheticEffects, ({ caseId }) => caseId === 'post-dispatch-disconnect')
    const postDisconnectDispatched = operationEvent(result, 'post-dispatch-disconnect', 'dispatched')
    const disconnectLifecycle = lifecycle(result, 'post-dispatch-disconnect', 'destroyed')
    const disconnectUnknown = operationEvent(result, 'post-dispatch-disconnect', 'outcome-unknown')
    const disconnectIgnored = operationEvent(result, 'post-dispatch-disconnect', 'completion-ignored')
    expect(operation(result, 'post-dispatch-disconnect')).toMatchObject({ effectCommitted: true, phase: 'outcome-unknown' })
    expectOrder(postDisconnectCheck, postDisconnectEffect, postDisconnectDispatched, disconnectLifecycle, disconnectUnknown, disconnectIgnored)

    const crash = lifecycle(result, 'render-process-gone-before-effect', 'render-process-gone')
    expect(['killed', 'crashed']).toContain(crash.reason)
    expect(result.lifecycleEvents.filter(({ event }) => event === 'render-process-gone')).toHaveLength(1)
    expect(result.attempts.at(-1)).toMatchObject({ caseId: 'render-process-gone-before-effect', action: 'begin' })

    const sequenced = [
      ...result.attempts,
      ...result.bindingEvents,
      ...result.lifecycleEvents,
      ...result.operationEvents,
      ...result.syntheticEffects,
    ]
    expect(new Set(sequenced.map(({ sequence }) => sequence)).size).toBe(sequenced.length)
    expect(sequenced.every(({ sequence }) => Number.isInteger(sequence) && sequence > 0)).toBe(true)

    expect(result.cleanup).toEqual({
      handlersExpected: 3,
      handlersRemoved: 3,
      protocolsExpected: 2,
      protocolsRemoved: 2,
      operationsAborted: 2,
      windowsBefore: 1,
      windowsDestroyed: 1,
      windowsRemaining: 0,
      pendingTimersBefore: 0,
      timersCleared: 0,
      errors: [],
    })
  }, 60_000)
})
