import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import type { SessionChannelStatus } from '../src/appservice/contracts.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createRunLogs } from '../src/main/run-logs.js'
import { shapeRunMonitor } from '../src/main/run-monitor.js'
import { withProjectionReadTestAdmission } from './support/projection-read-test-runner.js'

/**
 * Ticket 031 at the S1 routes (US-159~163): the monitor slot mirrors the session channel's own
 * projection (no second derivation, no synthesized status), and the run-log route reads real
 * bytes through the content port.
 */

const channel = (overrides: Partial<SessionChannelStatus> = {}): SessionChannelStatus => ({
  state: 'read', sessionId: 's1', execution: 'idle', lastTurnEnd: null, transcript: [],
  reconciled: false, streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [],
  ...overrides,
})

const roots: string[] = []
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

function harness(options: { readonly wired?: boolean, readonly channel?: SessionChannelStatus } = {}) {
  const status = options.channel ?? channel({ execution: 'executing', records: 4, lastTurnEnd: 't-1' })
  const root = mkdtempSync(join(tmpdir(), 'sage-run-log-route-'))
  roots.push(root)
  mkdirSync(join(root, 'logs'), { recursive: true })
  writeFileSync(join(root, 'logs/run.log'), '第 1 行\n第 2 行\n')
  const bridge = async (endpoint: string, payload: readonly unknown[] = []): Promise<unknown> => {
    const request = (payload[0] ?? {}) as Record<string, unknown>
    const absolutePath = join(String(request.workspaceRoot), String(request.path))
    if (endpoint === 'workspaceFiles/stat') {
      try {
        const { statSync } = await import('node:fs')
        return { ok: true, result: { absolutePath, version: `v:${String(statSync(absolutePath).size)}`, bytes: statSync(absolutePath).size } }
      } catch {
        return { ok: false, code: 'bridge-file-not-found' }
      }
    }
    if (endpoint === 'workspaceFiles/read') {
      const { readFileSync } = await import('node:fs')
      const text = readFileSync(absolutePath, 'utf8').replace(/\n$/u, '')
      const lines = text.split('\n')
      return { ok: true, result: { absolutePath, version: `v:${String(readFileSync(absolutePath).length)}`, text, lines: lines.length, eof: true } }
    }
    return { ok: false, code: 'bridge-answer-unknown' }
  }
  const providers = withProjectionReadTestAdmission(createUnavailableFirstService(null, options.wired === false ? {} : {
    // Production wires both slots from the same read — the monitor can never disagree with the card.
    sessionChannel: async () => status,
    runMonitor: async () => shapeRunMonitor('matter:1', status),
    runLogRead: createRunLogs(bridge),
  }))
  const post = (path: string, body: unknown) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    { callerBinding: { correlation: 'c-031' }, providers } as never,
  )
  const readState = async () => (await (await providers.readState()).json()) as Record<string, unknown>
  return { post, readState, root }
}

describe('the run monitor slot (ticket 031)', () => {
  it('mirrors the session channel: one projection, no synthesized status (US-159/160)', async () => {
    const h = harness()
    const state = await h.readState()
    const channelSlot = state.sessionChannel as { execution: string, records: number, lastTurnEnd: string | null }
    const monitor = state.runMonitor as { steps: { state: string, observedRecords: number, lastTurnEnd: string | null } }
    expect(monitor.steps).toMatchObject({ state: 'running', observedRecords: channelSlot.records, lastTurnEnd: channelSlot.lastTurnEnd })

    const text = JSON.stringify(monitor)
    for (const banned of ['overall', 'runStatus', 'run-state', '总状态']) expect(text, banned).not.toContain(banned)
    // 未知≠零：the budget axes carry states, not numbers.
    expect(text).not.toMatch(/"reserved":\s*0/u)
  })

  it('a different session fact moves both reads together (no local copy)', async () => {
    const h = harness({ channel: channel({ execution: 'idle', records: 9, lastTurnEnd: 't-end' }) })
    const state = await h.readState()
    expect((state.runMonitor as { steps: { state: string } }).steps.state).toBe('idle')
    expect((state.sessionChannel as { execution: string }).execution).toBe('idle')
    expect((state.runMonitor as { steps: { observedRecords: number } }).steps.observedRecords).toBe(9)
  })

  it('stays honest while unwired: the slot says unavailable and the log route refuses with its own code', async () => {
    const h = harness({ wired: false })
    const state = await h.readState()
    expect((state.runMonitor as { state: string }).state).toBe('unavailable')
    expect(await (await h.post('/.sage/run-log', { workspaceRoot: '/w', path: 'logs/run.log' })).json())
      .toMatchObject({ state: 'refused', code: 'run-log-unavailable' })
  })

  it('reads a real log page over the route and refuses missing files with the bridge code', async () => {
    const h = harness()
    const read = await (await h.post('/.sage/run-log', { workspaceRoot: h.root, path: 'logs/run.log' })).json() as { state: string, lines: Array<{ no: number, text: string }>, nextLine: number, eof: boolean }
    expect(read.state).toBe('read')
    expect(read.lines).toEqual([{ no: 1, text: '第 1 行' }, { no: 2, text: '第 2 行' }])
    expect(read.nextLine).toBe(3)
    expect(read.eof).toBe(true)
    expect(await (await h.post('/.sage/run-log', { workspaceRoot: h.root, path: 'logs/gone.log' })).json())
      .toMatchObject({ state: 'refused', code: 'bridge-file-not-found' })

    const bad: unknown[] = [
      { workspaceRoot: h.root },
      { workspaceRoot: h.root, path: 'logs/run.log', fromLine: 0 },
      { workspaceRoot: h.root, path: 'logs/run.log', extra: 1 },
      { workspaceRoot: '', path: 'logs/run.log' },
    ]
    for (const body of bad) expect((await h.post('/.sage/run-log', body)).status, JSON.stringify(body)).toBe(400)
  })
})
