import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const PROBE_PATH = fileURLToPath(new URL('./support/sage-frame-policy-window-probe.mjs', import.meta.url))
const RESULT_PREFIX = 'SAGE_FRAME_POLICY_WINDOW_RESULT '
const CHILD_TIMEOUT_MS = 50_000
const MAX_OUTPUT_BYTES = 512 * 1024
const activeChildren = new Set<ChildProcessWithoutNullStreams>()

interface ProbeResult {
  readonly schemaVersion: 1
  readonly outcome: 'pass' | 'no-go' | 'harness-fatal'
  readonly electron: string | null
  readonly chromium: string | null
  readonly processType: string | null
  readonly evidence: {
    readonly documentFacts: {
      readonly overviewVisible: boolean
      readonly bodyBackground: string
      readonly title: string
    }
    readonly connectStatus: number | string
    readonly frameViolations: readonly string[]
    readonly windowOpenDenied: boolean
    readonly webviewResult: { readonly getWebContentsIdType: string }
    readonly urlAfterSelfNavigation: string
  }
  readonly contaminationEvents: ReadonlyArray<{ readonly reason: string; readonly generation: number }>
  readonly finalPolicySnapshot: {
    readonly generation: number
    readonly ready: boolean
    readonly contaminated: boolean
    readonly contaminationReasons: readonly string[]
  } | null
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

const require_ = createRequire(import.meta.url)

/** The window probe exercises production code, so compile `src/` to `lib/` first. */
function buildProductionLibrary(): void {
  const tscPath = join(dirname(require_.resolve('typescript/package.json')), 'bin', 'tsc')
  const build = spawnSync(process.execPath, [tscPath, '--build', 'tsconfig.json'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 120_000,
  })
  if (build.status !== 0) {
    throw new Error(`tsc build failed before the frame-policy window probe:\n${build.stdout}\n${build.stderr}`)
  }
}

function outputBytes(stdout: string, stderr: string): number {
  return Buffer.byteLength(stdout) + Buffer.byteLength(stderr)
}

async function runProbe(): Promise<ProbeRun> {
  buildProductionLibrary()
  const root = await mkdtemp(join(tmpdir(), 'sage-frame-policy-window-'))
  try {
    return await new Promise((resolve, reject) => {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      env.SAGE_ELECTRON_FRAME_POLICY_PROBE_ROOT = root
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
          finish(() => reject(new Error('Sage frame-policy window probe exceeded its output budget.')))
        }
      }
      child.stdout.on('data', (chunk: string) => { append('stdout', chunk) })
      child.stderr.on('data', (chunk: string) => { append('stderr', chunk) })
      child.once('error', (error) => { finish(() => reject(error)) })
      child.once('close', (code, signal) => {
        finish(() => {
          const resultLines = stdout.split(/\r?\n/u).filter((line) => line.startsWith(RESULT_PREFIX))
          if (resultLines.length !== 1) {
            reject(new Error(`Sage frame-policy window probe emitted ${resultLines.length} result records.\n${stderr.trim()}`))
            return
          }
          try {
            resolve({
              exitCode: code,
              signal,
              result: JSON.parse(resultLines[0]!.slice(RESULT_PREFIX.length)) as ProbeResult,
            })
          } catch (error) {
            reject(new Error(`Sage frame-policy window probe emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`))
          }
        })
      })
      timeout = setTimeout(() => {
        child.kill('SIGKILL')
        finish(() => reject(new Error(`Sage frame-policy window probe exceeded ${CHILD_TIMEOUT_MS}ms.\n${stderr.trim()}`)))
      }, CHILD_TIMEOUT_MS)
    })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
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

describe('Sage privileged window frame policy (production wiring)', () => {
  it('keeps the invariant on the real production window: child frames contaminate, only a clean main-owned reload recovers', async () => {
    const run = await runProbe()
    const { result } = run

    expect(process.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(process.versions.electron).toBe('43.3.0')
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

    // The Sage document stays fully functional under the strict CSP.
    expect(result.evidence.documentFacts.overviewVisible).toBe(true)
    expect(result.evidence.documentFacts.bodyBackground).not.toBe('rgba(0, 0, 0, 0)')
    expect(result.evidence.connectStatus).toBe(404)

    // A child frame contaminates the generation even though the CSP blocks its load.
    expect(result.evidence.frameViolations).toContain('frame-src')
    expect(result.contaminationEvents).toEqual([{ reason: 'non-main-frame-created', generation: 1 }])

    // window.open is denied and webview stays inert.
    expect(result.evidence.windowOpenDenied).toBe(true)
    expect(result.evidence.webviewResult.getWebContentsIdType).toBe('undefined')

    // A renderer-initiated top navigation is denied in place.
    expect(result.evidence.urlAfterSelfNavigation).toBe('dsh-app://app/index.html')

    // The clean main-owned reload recovered a trusted fresh generation.
    expect(result.finalPolicySnapshot).toEqual({
      generation: 2,
      ready: true,
      contaminated: false,
      contaminationReasons: [],
    })
  }, 70_000)
})
