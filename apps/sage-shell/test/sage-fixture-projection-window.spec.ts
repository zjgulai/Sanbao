import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const PROBE_PATH = fileURLToPath(new URL('./support/sage-fixture-projection-probe.mjs', import.meta.url))
const RESULT_PREFIX = 'SAGE_FIXTURE_PROJECTION_RESULT '
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
    readonly documentFacts?: {
      readonly overviewVisible: boolean
      readonly title: string
      readonly workspaceProjectionSource: string | null
      readonly matterId: string | null
      readonly matterGoal: string | null
      readonly matterRevision: string | null
    }
    readonly uiContractFacts?: {
      readonly tabPairsValid: boolean
      readonly opened: boolean
      readonly escaped: boolean
      readonly reducedMotionRule: boolean
      readonly allControlFocusRule: boolean
    }
    readonly narrowLayout?: {
      readonly innerWidth: number
      readonly clientWidth: number
      readonly scrollWidth: number
      readonly noHorizontalOverflow: boolean
    }
    readonly zoomLayout?: {
      readonly zoomFactor: number
      readonly innerWidth: number
      readonly clientWidth: number
      readonly scrollWidth: number
      readonly noHorizontalOverflow: boolean
    }
    readonly stateProbe?: Record<string, unknown>
    readonly actionsProbe?: { readonly status: number; readonly code: string | null; readonly stage: string | null }
    readonly sageRootEntries?: readonly string[]
    readonly sageRootClean?: boolean
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
    throw new Error(`tsc build failed before the fixture-projection window probe:\n${build.stdout}\n${build.stderr}`)
  }
}

function outputBytes(stdout: string, stderr: string): number {
  return Buffer.byteLength(stdout) + Buffer.byteLength(stderr)
}

async function runProbe(extraEnv: Record<string, string>): Promise<ProbeRun> {
  buildProductionLibrary()
  const root = await mkdtemp(join(tmpdir(), 'sage-fixture-projection-'))
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

describe('Sage fixture projection over the real window (WT-02D.1)', () => {
  it('serves the fixture matter slot over the real protocol wire and leaves the Sage root untouched', async () => {
    const run = await runProbe({ SAGE_FIXTURE_PROJECTION: '1' })
    const { result } = run

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
    expect(result.evidence.documentFacts?.overviewVisible).toBe(true)
    expect(result.evidence.documentFacts?.workspaceProjectionSource).toBe('fixture')

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
      opened: true,
      escaped: true,
      reducedMotionRule: true,
      allControlFocusRule: true,
    })
    expect(result.evidence.narrowLayout).toMatchObject({
      noHorizontalOverflow: true,
    })
    expect(result.evidence.narrowLayout?.innerWidth).toBeLessThanOrEqual(657)
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
