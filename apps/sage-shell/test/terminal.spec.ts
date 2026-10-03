import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createTerminal } from '../src/main/terminal.js'
import { withProjectionReadTestAdmission } from './support/projection-read-test-runner.js'

/**
 * Ticket 043 (US-203/204) at the module and route seams.
 *
 * The acceptance lines: no capability is a named 未就绪 with its missing item (never an empty
 * terminal); only listed sessions can be paged (a vanished id refuses by name); the output is a
 * bounded observation page; and the whole surface is READ-ONLY — the call table carries exactly
 * the two read endpoints, so the panel can never cancel a run or leak output into the
 * conversation or the artifact list.
 */

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function harness(options: { readonly sessions?: Record<string, string> } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sage-terminal-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const bindingsFile = join(dir, 'sessions', 'bindings.json')
  const sessions = options.sessions ?? { 'matter:1': 'session-1' }
  if (Object.keys(sessions).length > 0) {
    await mkdir(join(dir, 'sessions'), { recursive: true })
    await writeFile(bindingsFile, JSON.stringify(sessions), { mode: 0o600 })
  }
  const calls: Array<{ endpoint: string, payload: unknown }> = []
  const listResponses: unknown[] = []
  const readResponses: unknown[] = []
  const store = createTerminal({
    callBridge: async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      if (endpoint === 'session/terminals') return listResponses.shift() ?? { ok: true, result: { terminals: [] } }
      if (endpoint === 'session/terminal-read') return readResponses.shift() ?? { ok: true, result: { text: '', totalLines: 0, lineBegin: 0, lineEnd: 0, truncated: false } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    },
    bindingsFile,
    now: () => '2026-10-03T12:00:00.000Z',
  })
  return { store, calls, listResponses, readResponses }
}

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  terminalId: 't-1', name: '构建', type: 'bash', status: { kind: 'running' },
  ...overrides,
})

describe('the terminal store (ticket 043)', () => {
  it('lists bounded sessions with identity/type/status; a missing capability is a named 未就绪', async () => {
    const h = await harness()
    const bare = await h.store.status({ matterRef: 'matter:never-sent' })
    expect(bare.state).toBe('no-session')
    expect(h.calls).toEqual([])

    h.listResponses.push({ ok: false, code: 'bridge-provider-unavailable' })
    expect(await h.store.status({ matterRef: 'matter:1' })).toEqual({ state: 'unavailable', reason: 'bridge-provider-unavailable', terminals: [] })

    h.listResponses.push({
      ok: true,
      result: {
        terminals: [
          snapshot(),
          snapshot({ terminalId: 't-2', type: 'bash', status: { kind: 'exited', exitCode: 1, signal: null }, pid: 4242 }),
          { terminalId: '', type: 'bash', status: { kind: 'running' } },
          snapshot({ terminalId: 't-3', status: { kind: 'weird' } }),
        ],
      },
    })
    const read = await h.store.status({ matterRef: 'matter:1' })
    expect(read.state).toBe('read')
    expect(read.terminals).toEqual([
      { terminalId: 't-1', name: '构建', type: 'bash', status: { kind: 'running' } },
      { terminalId: 't-2', name: '构建', type: 'bash', status: { kind: 'exited', exitCode: 1, signal: null } },
    ])
    // Never a pid or a path in the projection.
    expect(JSON.stringify(read.terminals)).not.toContain('4242')
  })

  it('pages only listed sessions: an unlisted id refuses by name, a listed one returns the bounded page', async () => {
    const h = await harness()
    expect(await h.store.read({ matterRef: 'matter:1', terminalId: 't-1' })).toEqual({ state: 'refused', code: 'terminal-not-listed' })
    expect(h.calls).toEqual([])

    h.listResponses.push({ ok: true, result: { terminals: [snapshot()] } })
    await h.store.status({ matterRef: 'matter:1' })
    h.readResponses.push({ ok: true, result: { text: '$ ls\nsrc\n', totalLines: 2, lineBegin: 0, lineEnd: 2, truncated: false } })
    const page = await h.store.read({ matterRef: 'matter:1', terminalId: 't-1', offset: 0, lines: 50 })
    expect(page).toMatchObject({ state: 'read', text: '$ ls\nsrc\n', totalLines: 2, lineBegin: 0, lineEnd: 2, truncated: false })
    expect(h.calls.at(-1)).toEqual({ endpoint: 'session/terminal-read', payload: [{ sessionId: 'session-1', terminalId: 't-1', offset: 0, count: 50 }] })

    expect(await h.store.read({ matterRef: 'matter:1', terminalId: 't-1', offset: -1 })).toEqual({ state: 'refused', code: 'terminal-range-invalid' })
    expect(await h.store.read({ matterRef: 'matter:1', terminalId: 't-1', lines: 0 })).toEqual({ state: 'refused', code: 'terminal-range-invalid' })
    expect(await h.store.read({ matterRef: 'matter:1', terminalId: 't-1', lines: 501 })).toEqual({ state: 'refused', code: 'terminal-range-invalid' })
    expect(await h.store.read({ matterRef: 'matter:never-sent', terminalId: 't-1' })).toEqual({ state: 'refused', code: 'terminal-no-session' })
  })

  it('is read-only end to end: the call table carries exactly the two read endpoints', async () => {
    const h = await harness()
    h.listResponses.push({ ok: true, result: { terminals: [snapshot()] } })
    await h.store.status({ matterRef: 'matter:1' })
    h.readResponses.push({ ok: true, result: { text: 'x', totalLines: 1, lineBegin: 0, lineEnd: 1, truncated: true } })
    await h.store.read({ matterRef: 'matter:1', terminalId: 't-1' })
    await h.store.status({ matterRef: 'matter:1' })
    expect(h.calls.map((call) => call.endpoint)).toEqual(['session/terminals', 'session/terminal-read', 'session/terminals'])
    // No spawn/kill/signal/send/cancel — the write half of the terminal seam is deliberately absent.
    expect(h.calls.every((call) => call.endpoint === 'session/terminals' || call.endpoint === 'session/terminal-read')).toBe(true)
  })
})

describe('the terminal route (ticket 043)', () => {
  it('parses exactly, forwards, and keeps an unwired provider honest', async () => {
    const seen: unknown[] = []
    const providers = withProjectionReadTestAdmission(createUnavailableFirstService(null, {
      terminalRead: async (request) => {
        seen.push(request)
        return { state: 'read', text: 'm-page', totalLines: 9, lineBegin: 0, lineEnd: 9, truncated: false }
      },
    }))
    const post = (body: unknown, service = providers) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/terminal-read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-043' }, providers: service } as never,
    )
    expect(await (await post({ terminalId: 't-1' })).json()).toMatchObject({ state: 'read', text: 'm-page' })
    expect(await (await post({ terminalId: 't-1', offset: 10, lines: 50 })).json()).toMatchObject({ state: 'read' })
    expect(seen).toEqual([{ terminalId: 't-1' }, { terminalId: 't-1', offset: 10, lines: 50 }])

    // Exactly the declared members and ranges; nothing else rides along.
    expect((await post({ terminalId: '' })).status).toBe(400)
    expect((await post({ terminalId: 't-1', offset: -1 })).status).toBe(400)
    expect((await post({ terminalId: 't-1', lines: 0 })).status).toBe(400)
    expect((await post({ terminalId: 't-1', lines: 501 })).status).toBe(400)
    expect((await post({ terminalId: 't-1', matterRef: 'matter:9' })).status).toBe(400)
    expect((await post({})).status).toBe(400)

    const unwired = withProjectionReadTestAdmission(createUnavailableFirstService(null, {}))
    expect(await (await post({ terminalId: 't-1' }, unwired)).json()).toMatchObject({ code: 'terminals-provider-unavailable' })
  })
})
