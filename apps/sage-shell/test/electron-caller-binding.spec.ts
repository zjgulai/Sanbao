import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const PROBE_PATH = fileURLToPath(new URL('./support/electron-caller-binding-probe.mjs', import.meta.url))
const RESULT_PREFIX = 'SAGE_CALLER_BINDING_RESULT '
const CHILD_TIMEOUT_MS = 35_000
const MAX_OUTPUT_BYTES = 256 * 1024
const activeChildren = new Set<ChildProcessWithoutNullStreams>()

interface ProbeAttempt {
  readonly caseId: string
  readonly channel: string
  readonly outcome: string
  readonly status?: number
  readonly body?: string
}

interface ProbeGateEvent {
  readonly sequence: number
  readonly caseId: string
  readonly sessionLabel: 'trusted' | 'different'
  readonly callbackCount: number
  readonly decision: 'allow' | 'cancel'
  readonly webContentsId: number | null
  readonly hasWebContents: boolean
  readonly webContentsSessionMatchesListener: boolean
  readonly webContentsDestroyed: boolean | null
  readonly isExpectedWebContents: boolean
  readonly hasFrame: boolean
  readonly frameIsExpectedMain: boolean
  readonly frameOrigin: string | null
  readonly frameDetached: boolean | null
  readonly frameDestroyed: boolean | null
  readonly frameParentIsNull: boolean
  readonly frameTopIsSelf: boolean
  readonly resourceType: string
}

interface ProbeHandlerEvent {
  readonly sequence: number
  readonly caseId: string
  readonly sessionLabel: 'trusted' | 'different'
}

interface ProbeAbortEvent {
  readonly sequence: number
  readonly caseId: string
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
  readonly partition: string
  readonly otherPartition: string
  readonly attempts: readonly ProbeAttempt[]
  readonly gateEvents: readonly ProbeGateEvent[]
  readonly handlerEvents: readonly ProbeHandlerEvent[]
  readonly abortEvents: readonly ProbeAbortEvent[]
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
  const root = await mkdtemp(join(tmpdir(), 'sage-electron-caller-binding-'))
  try {
    return await new Promise((resolve, reject) => {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      env.SAGE_ELECTRON_CALLER_PROBE_ROOT = root
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
          finish(() => reject(new Error('Electron caller-binding probe exceeded its output budget.')))
        }
      }
      child.stdout.on('data', (chunk: string) => { append('stdout', chunk) })
      child.stderr.on('data', (chunk: string) => { append('stderr', chunk) })
      child.once('error', (error) => {
        finish(() => reject(error))
      })
      child.once('close', (code, signal) => {
        finish(() => {
          const resultLines = stdout.split(/\r?\n/u).filter((line) => line.startsWith(RESULT_PREFIX))
          if (resultLines.length !== 1) {
            reject(new Error(`Electron caller-binding probe emitted ${resultLines.length} result records.\n${stderr.trim()}`))
            return
          }
          let result: ProbeResult
          try {
            result = JSON.parse(resultLines[0]!.slice(RESULT_PREFIX.length)) as ProbeResult
          } catch (error) {
            reject(new Error(`Electron caller-binding probe emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`))
            return
          }
          resolve({ exitCode: code, signal, result })
        })
      })
      timeout = setTimeout(() => {
        child.kill('SIGKILL')
        finish(() => reject(new Error(`Electron caller-binding probe exceeded ${CHILD_TIMEOUT_MS}ms.\n${stderr.trim()}`)))
      }, CHILD_TIMEOUT_MS)
    })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

function eventsFor<T extends { readonly caseId: string }>(events: readonly T[], caseId: string): readonly T[] {
  return events.filter((event) => event.caseId === caseId)
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

describe('Electron 43.3 caller-binding preflight', () => {
  it('records NO-GO when accepted protocol requests survive caller navigation and destruction', async () => {
    const run = await runProbe()
    const { result } = run

    expect(process.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(process.versions.electron).toBe('43.3.0')
    expect(run).toMatchObject({ exitCode: 2, signal: null })
    expect(result.schemaVersion).toBe(1)
    expect(result.outcome).toBe('no-go')
    expect(result.fatal).toBeUndefined()
    expect(result.versions.electron).toBe('43.3.0')
    expect(result.versions.chromium).toMatch(/^150\./u)
    expect(result.versions.processType).toBe('browser')
    expect(result.versions.electronRunAsNodePresent).toBe(false)
    expect(result.partition).not.toBe(result.otherPartition)
    expect(result.failures).toEqual([
      'trusted-navigation-abort: protocol Request.signal did not abort',
      'trusted-destroy-abort: protocol Request.signal did not abort',
      'trusted-explicit-abort: protocol Request.signal did not observe explicit abort',
    ])
    expect(result.passed).toBe(false)

    const expectedCases = [
      'different-partition-fetch',
      'same-session-opaque-origin-image',
      'same-session-same-origin-other-window',
      'same-session-session-fetch-spoofed-origin',
      'trusted-destroy-abort',
      'trusted-explicit-abort',
      'trusted-main-frame-fetch',
      'trusted-main-frame-navigation',
      'trusted-navigation-abort',
      'trusted-subframe-fetch',
    ]
    expect(result.attempts.map((attempt) => attempt.caseId).sort()).toEqual(expectedCases)

    for (const caseId of ['trusted-main-frame-fetch', 'trusted-navigation-abort', 'trusted-destroy-abort', 'trusted-explicit-abort']) {
      const gates = eventsFor(result.gateEvents, caseId)
      const handlers = eventsFor(result.handlerEvents, caseId)
      expect(gates).toHaveLength(1)
      expect(gates[0]).toMatchObject({
        callbackCount: 1,
        decision: 'allow',
        hasWebContents: true,
        webContentsSessionMatchesListener: true,
        webContentsDestroyed: false,
        isExpectedWebContents: true,
        hasFrame: true,
        frameIsExpectedMain: true,
        frameOrigin: 'dsh-app://app',
        frameDetached: false,
        frameDestroyed: false,
        frameParentIsNull: true,
        frameTopIsSelf: true,
        resourceType: 'xhr',
      })
      expect(handlers).toHaveLength(1)
      expect(gates[0]!.sequence).toBeLessThan(handlers[0]!.sequence)
    }

    for (const caseId of [
      'trusted-subframe-fetch',
      'same-session-same-origin-other-window',
      'same-session-opaque-origin-image',
      'same-session-session-fetch-spoofed-origin',
      'trusted-main-frame-navigation',
    ]) {
      expect(eventsFor(result.gateEvents, caseId)).toMatchObject([{
        callbackCount: 1,
        decision: 'cancel',
      }])
      expect(eventsFor(result.handlerEvents, caseId)).toEqual([])
    }

    expect(eventsFor(result.gateEvents, 'trusted-subframe-fetch')[0]).toMatchObject({
      isExpectedWebContents: true,
      hasFrame: true,
      frameIsExpectedMain: false,
      frameOrigin: 'dsh-app://app',
    })
    expect(eventsFor(result.gateEvents, 'same-session-same-origin-other-window')[0]).toMatchObject({
      hasWebContents: true,
      isExpectedWebContents: false,
      frameOrigin: 'dsh-app://app',
    })
    expect(eventsFor(result.gateEvents, 'same-session-session-fetch-spoofed-origin')[0]).toMatchObject({
      hasWebContents: false,
      isExpectedWebContents: false,
      hasFrame: false,
      frameIsExpectedMain: false,
    })
    expect(eventsFor(result.gateEvents, 'trusted-main-frame-navigation')[0]).toMatchObject({
      isExpectedWebContents: true,
      frameIsExpectedMain: true,
      resourceType: 'mainFrame',
    })

    expect(eventsFor(result.gateEvents, 'different-partition-fetch')).toMatchObject([{
      callbackCount: 1,
      decision: 'cancel',
      sessionLabel: 'different',
      webContentsSessionMatchesListener: true,
    }])
    expect(eventsFor(result.handlerEvents, 'different-partition-fetch')).toEqual([])
    expect(eventsFor(result.abortEvents, 'trusted-navigation-abort')).toMatchObject([{ aborted: false }])
    expect(eventsFor(result.abortEvents, 'trusted-destroy-abort')).toMatchObject([{ aborted: false }])
    expect(eventsFor(result.abortEvents, 'trusted-explicit-abort')).toMatchObject([{ aborted: false }])
    expect(result.attempts.find(({ caseId }) => caseId === 'trusted-navigation-abort')).toMatchObject({ outcome: 'timeout' })
    expect(result.attempts.find(({ caseId }) => caseId === 'trusted-destroy-abort')).toMatchObject({ outcome: 'timeout' })
    expect(result.attempts.find(({ caseId }) => caseId === 'trusted-explicit-abort')).toMatchObject({ outcome: 'rejected', errorName: 'AbortError' })
  }, 50_000)
})
