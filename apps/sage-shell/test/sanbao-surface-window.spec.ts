/**
 * Sanbao 承载面 spec（206 页接线程序未闭项 1）。
 *
 * 通过真实 Electron 探针（test/support/sanbao-surface-probe.mjs）验证：
 * - live 组：`sage-sanbao://` 承载真实的 sanbao_ui 产物，`window.__SANBAO_HOST__`（protocolVersion 1）
 *   经 sandboxed preload → contextBridge → main 白名单通道回真值（工作区摘要、设置命名空间、
 *   会话消息），形状校验与未接线方法保持 honest；
 * - honest 组：空 facts 下页面如实显示「未接线」，fixture 文案不被冒充替换；
 * - 负控：把 live 组期望工作区名突变后，具名断言必须红（exit 2），其余读数不受累。
 *
 * 承载面 root 由 src/main/sanbao-surface-root.ts（唯一家）动态发现（SAGE_SANBAO_SURFACE_ROOT 或
 * Sage 仓同级快照仓）；找不到产物时显式跳过（第三态），不伪装通过。
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { buildProductionLibrary } from './support/build-production-library.js'
import { resolveSanbaoSurfaceRoot } from '../src/main/sanbao-surface-root.js'

const PROBE_PATH = fileURLToPath(new URL('./support/sanbao-surface-probe.mjs', import.meta.url))
const RESULT_PREFIX = 'SAGE_SANBAO_SURFACE_RESULT '
const CHILD_TIMEOUT_MS = 90_000
const MAX_OUTPUT_BYTES = 1024 * 1024
const activeChildren = new Set<ChildProcessWithoutNullStreams>()
const SURFACE_ROOT = resolveSanbaoSurfaceRoot()
if (SURFACE_ROOT === null) {
  console.warn('[sanbao-surface] sanbao 产物根未找到：设置 SAGE_SANBAO_SURFACE_ROOT 或把快照仓放在 Sage 仓同级')
}

interface ProbeRead {
  readonly name: string
  readonly ok: boolean
  readonly detail: unknown
}

interface PixelEvidence {
  readonly name: string
  readonly width: number
  readonly height: number
  readonly byteLength: number
  readonly sha256: string
  readonly saved: boolean
}

interface ProbeResult {
  readonly schemaVersion: 1
  readonly outcome: 'pass' | 'no-go' | 'harness-fatal'
  readonly electron: string | null
  readonly chromium: string | null
  readonly processType: string | null
  readonly evidence: {
    readonly mode: 'live' | 'honest'
    readonly negativeControl: boolean
    readonly resolvedRoot: { readonly servedRoot: string; readonly source: string } | null
    readonly reads: readonly ProbeRead[]
    readonly pixelEvidence: readonly PixelEvidence[]
    readonly pageFacts: Readonly<Record<string, unknown>>
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

async function runProbe(extraEnv: Record<string, string>): Promise<ProbeRun> {
  buildProductionLibrary()
  const root = await mkdtemp(join(tmpdir(), 'sage-sanbao-surface-'))
  try {
    return await new Promise((resolve, reject) => {
      const env: Record<string, string | undefined> = { ...process.env, ...extraEnv }
      delete env.ELECTRON_RUN_AS_NODE
      env.SAGE_SANBAO_PROBE_ROOT = root
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
          finish(() => reject(new Error('Sage sanbao-surface probe exceeded its output budget.')))
        }
      }
      child.stdout.on('data', (chunk: string) => { append('stdout', chunk) })
      child.stderr.on('data', (chunk: string) => { append('stderr', chunk) })
      child.once('error', (error) => { finish(() => reject(error)) })
      child.once('close', (code, signal) => {
        finish(() => {
          const resultLines = stdout.split(/\r?\n/u).filter((line) => line.startsWith(RESULT_PREFIX))
          if (resultLines.length !== 1) {
            reject(new Error(`Sage sanbao-surface probe emitted ${resultLines.length} result records.\n${stderr.trim()}`))
            return
          }
          try {
            resolve({
              exitCode: code,
              signal,
              result: JSON.parse(resultLines[0]!.slice(RESULT_PREFIX.length)) as ProbeResult,
            })
          } catch (error) {
            reject(new Error(`Sage sanbao-surface probe emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`))
          }
        })
      })
      timeout = setTimeout(() => {
        child.kill('SIGKILL')
        finish(() => reject(new Error(`Sage sanbao-surface probe exceeded ${CHILD_TIMEOUT_MS}ms.\n${stderr.trim()}`)))
      }, CHILD_TIMEOUT_MS)
    })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

function readByName(result: ProbeResult, name: string): ProbeRead {
  const entry = result.evidence.reads.find((candidate) => candidate.name === name)
  expect(entry, `missing read ${name} in probe evidence`).toBeDefined()
  return entry!
}

function detailOf(read: ProbeRead): Record<string, unknown> {
  return (read.detail ?? {}) as Record<string, unknown>
}

function expectPixel(result: ProbeResult, name: string): void {
  const pixel = result.evidence.pixelEvidence.find((candidate) => candidate.name === name)
  expect(pixel, `missing screenshot ${name}`).toBeDefined()
  expect(pixel!.saved).toBe(true)
  expect(pixel!.width).toBeGreaterThanOrEqual(1200)
  expect(pixel!.height).toBeGreaterThan(0)
  expect(pixel!.byteLength).toBeGreaterThan(1_000)
  expect(pixel!.sha256).toMatch(/^[a-f0-9]{64}$/u)
}

function expectAllReadsGreen(result: ProbeResult): void {
  for (const read of result.evidence.reads) {
    expect(read.ok, `probe read ${read.name} is red: ${JSON.stringify(read.detail)}`).toBe(true)
  }
}

function expectCommonSecurityReads(result: ProbeResult): void {
  expect(detailOf(readByName(result, 'path-guard'))).toEqual({
    acceptsEntry: true,
    rejectsEncodedTraversal: true,
    rejectsDecodedTraversal: true,
    rejectsMissing: true,
    rejectsForeignHost: true,
    rejectsForeignScheme: true,
  })
  expect(detailOf(readByName(result, 'asset-served'))).toMatchObject({ loaded: true })
  expect(detailOf(readByName(result, 'window-open-denied'))).toEqual({ opened: 'null' })
  expect(detailOf(readByName(result, 'external-navigation-blocked'))).toMatchObject({ stayed: true })
  expect(readByName(result, 'mount-marker-live').detail).toMatchObject({ marker: 'live', appRootPresent: true })
  expect(readByName(result, 'preload-bridge').detail).toMatchObject({
    present: true,
    protocolVersion: 1,
    functionMethodCount: 13,
    methodCount: 13,
    hasReadWorkspace: true,
    hasStartRequirement: true,
  })
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

describe.skipIf(SURFACE_ROOT === null)('Sage sanbao surface over real Electron (未闭项 1)', () => {
  it('carries the real sanbao UI and answers the host port with injected facts', async () => {
    const run = await runProbe({ SAGE_SANBAO_PROBE_FACTS: 'live' })
    expectPassingProbe(run)

    const { result } = run
    expect(result.evidence.mode).toBe('live')
    expect(result.evidence.negativeControl).toBe(false)
    expect(result.evidence.resolvedRoot).toMatchObject({ servedRoot: expect.any(String), source: expect.any(String) })
    expectAllReadsGreen(result)
    expectCommonSecurityReads(result)

    expect(result.evidence.reads.map(({ name }) => name)).toEqual([
      'mount-marker-live',
      'preload-bridge',
      'path-guard',
      'asset-served',
      'window-open-denied',
      'external-navigation-blocked',
      'workspace-live-summary',
      'session-port-round-trip',
      'shape-validation',
      'honest-default-per-method',
      'settings-live-surface',
      'renderer-traversal-blocked',
    ])

    // 工作区摘要：注入名与「壳已接线」由 main 注入事实驱动，不是页面本地 fixture。
    expect(readByName(result, 'workspace-live-summary').detail).toMatchObject({
      wiring: 'live',
      name: 'sanbao-e2e-workspace',
    })
    expect(String(detailOf(readByName(result, 'workspace-live-summary')).text)).toContain('壳已接线')

    // 会话消息经 contextBridge → IPC → port 往返，一条真消息可读。
    expect(readByName(result, 'session-port-round-trip').detail).toMatchObject({
      state: 'read',
      sessionRef: 'session-sanbao-e2e',
      messages: [{ role: 'assistant', text: '壳侧真消息：sanbao-e2e' }],
      streaming: false,
    })
    // 形状校验与未接线方法保持 honest 形状。
    expect(detailOf(readByName(result, 'shape-validation'))).toEqual({
      zeroArgs: { state: 'unavailable', reason: '参数无效' },
      wrongType: { state: 'unavailable', reason: '参数无效' },
    })
    expect(detailOf(readByName(result, 'honest-default-per-method'))).toEqual({
      usage: { state: 'unavailable', reason: '壳尚未提供该类事实' },
      automations: { state: 'unavailable', reason: '壳尚未提供该类事实' },
    })
    // 设置页在 readSettings 上渲染壳侧命名空间结构（不含值/密钥/路径）。
    expect(readByName(result, 'settings-live-surface').detail).toMatchObject({
      marker: 'live',
      wiring: 'read',
    })
    expect(String(detailOf(readByName(result, 'settings-live-surface')).rowText)).toContain('revision 7')
    // renderer 导航到穿越 URL 拿不到 root 外文件。
    expect(readByName(result, 'renderer-traversal-blocked').detail).toMatchObject({
      leakedPackageName: false,
      packageJsonOutsideRoot: true,
    })

    expectPixel(result, 'sanbao-surface-live.png')
  }, 120_000)

  it('keeps unwired facts honest and does not replace the fixture copy', async () => {
    const run = await runProbe({ SAGE_SANBAO_PROBE_FACTS: 'honest' })
    expectPassingProbe(run)

    const { result } = run
    expect(result.evidence.mode).toBe('honest')
    expectAllReadsGreen(result)
    expectCommonSecurityReads(result)

    // 壳在（装线 live），但读不到事实：如实「未接线」，不用 fixture 冒充成功。
    expect(String(detailOf(readByName(result, 'honest-toast')).toast)).toContain('壳已连接但工作区读取未接线')
    expect(String(detailOf(readByName(result, 'honest-toast')).toast)).toContain('壳尚未提供该类事实')
    expect(String(detailOf(readByName(result, 'honest-toast')).toast)).toContain('仍显示本地示例绑定')
    // fixture 文案原样保留（摘要区仍是本地演示，不得出现「壳已接线」）。
    expect(readByName(result, 'fixture-copy-preserved').detail).toMatchObject({ wiring: 'fixture' })
    const fixtureText = String(detailOf(readByName(result, 'fixture-copy-preserved')).text)
    expect(fixtureText).toContain('SanBao 本地演示')
    expect(fixtureText).toContain('未连接业务系统')
    expect(fixtureText).not.toContain('壳已接线')

    expectPixel(result, 'sanbao-surface-honest.png')
  }, 120_000)

  it('negative control: a mutated expected workspace name turns exactly that named assertion red', async () => {
    const run = await runProbe({
      SAGE_SANBAO_PROBE_FACTS: 'live',
      SAGE_SANBAO_PROBE_NEGATIVE_CONTROL: '1',
    })
    const { result } = run

    expect(run).toMatchObject({ exitCode: 2, signal: null })
    expect(result).toMatchObject({ outcome: 'no-go', passed: false })
    expect(result.evidence.negativeControl).toBe(true)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('workspace-live-summary')
    expect(result.harnessErrors).toEqual([])
    expect(readByName(result, 'workspace-live-summary').ok).toBe(false)
    // 只有被突变的那条红：承载、桥与其余读数不受累。
    expect(readByName(result, 'mount-marker-live').ok).toBe(true)
    expect(readByName(result, 'preload-bridge').ok).toBe(true)
    expect(readByName(result, 'session-port-round-trip').ok).toBe(true)
  }, 120_000)
})
