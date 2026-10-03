import { describe, expect, it } from 'vitest'

import { applyWorkspaceFrame, readWorkspaceList } from '../src/main/workspace-list.js'
import { resolveBridgeStreamCall } from '../src/host/bridge-endpoints.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { withProjectionReadTestAdmission } from './support/projection-read-test-runner.js'
import { MAX_BRIDGE_STREAM_FRAMES } from '../src/protocol.js'

/**
 * Ticket 012 (US-063/064): the workspace list is folded from the base's follow stream. A reconnect
 * folds from nothing (so the fresh baseline reconciles exactly), an `order` hint may not invent a
 * row, and a frame that does not parse is counted rather than silently treated as "no change".
 */

const entry = (workspaceId: string, overrides: Record<string, unknown> = {}) => ({
  workspaceId,
  path: `/Users/someone/${workspaceId}`,
  title: workspaceId,
  sessionIds: ['s1', 's2'],
  createdAt: '2026-10-02T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  ...overrides,
})

const baseline = (ids: string[], archived = 0) => ({
  type: 'baseline',
  value: { items: ids.map((id) => entry(id)), archivedSessionIds: Array.from({ length: archived }, (_, i) => `a${i}`) },
})

function fold(frames: unknown[]) {
  let state: Parameters<typeof applyWorkspaceFrame>[0] = { entries: [], order: [], archivedSessions: 0 }
  let unapplied = 0
  for (const frame of frames) {
    const folded = applyWorkspaceFrame(state, frame)
    state = folded.state
    if (!folded.applied) unapplied += 1
  }
  return { state, unapplied }
}

describe('folding the follow stream', () => {
  it('applies the four increment kinds', () => {
    const { state, unapplied } = fold([
      baseline(['a', 'b']),
      { type: 'upsert', workspace: entry('c') },
      { type: 'upsert', workspace: entry('a', { title: 'renamed' }) },
      { type: 'remove', workspaceId: 'b' },
      { type: 'order', workspaceIds: ['c', 'a'] },
      { type: 'archived', archivedSessionIds: ['x'] },
    ])
    expect(unapplied).toBe(0)
    expect(state.order).toEqual(['c', 'a'])
    expect(state.entries.map((item) => `${item.workspaceId}:${item.title}`)).toEqual(['a:renamed', 'c:c'])
    expect(state.archivedSessions).toBe(1)
  })

  it('never invents a row from an order hint or a remove', () => {
    const { state } = fold([
      baseline(['a']),
      { type: 'order', workspaceIds: ['ghost', 'a'] },
      { type: 'remove', workspaceId: 'never-existed' },
    ])
    expect(state.order).toEqual(['a'])
    expect(state.entries).toHaveLength(1)
  })

  it('replaces everything on a baseline — including one that arrives mid-stream', () => {
    const first = fold([baseline(['a', 'b']), { type: 'upsert', workspace: entry('c') }])
    expect(first.state.order).toEqual(['a', 'b', 'c'])
    // A second baseline inside the same fold must still *replace*: folding it into the existing
    // rows would leave rows the base no longer reports, which is the drift this rule forbids.
    const replaced = fold([baseline(['a', 'b']), { type: 'upsert', workspace: entry('c') }, baseline(['b'])])
    expect(replaced.state.order).toEqual(['b'])
    expect(replaced.state.entries.map((item) => item.workspaceId)).toEqual(['b'])
  })

  it('counts a frame it cannot parse instead of pretending nothing changed', () => {
    const { state, unapplied } = fold([baseline(['a']), { type: 'upsert', workspace: { workspaceId: 'x' } }, 'nonsense', { type: 'mystery' }])
    expect(unapplied).toBe(3)
    expect(state.order).toEqual(['a'])
  })
})

describe('reading the list through the bridge', () => {
  it('folds a real subscription and reports the frame ledger', async () => {
    const frames = [baseline(['a']), { type: 'upsert', workspace: entry('b') }]
    const status = await readWorkspaceList(async (_endpoint, _payload, onFrame) => {
      for (const frame of frames) onFrame(frame)
      return { ok: true, result: { frames: frames.length } }
    })
    expect(status).toMatchObject({ state: 'read', reason: null, frames: 2, unapplied: 0, archivedSessions: 0 })
    expect(status.entries.map((item) => item.workspaceId)).toEqual(['a', 'b'])
  })

  it('counts frames it cannot parse on the real read path, not just in the helper', async () => {
    const frames = [baseline(['a']), { type: 'upsert', workspace: { workspaceId: 'broken' } }, { type: 'mystery' }]
    const status = await readWorkspaceList(async (_endpoint, _payload, onFrame) => {
      for (const frame of frames) onFrame(frame)
      return { ok: true, result: { frames: frames.length } }
    })
    expect(status).toMatchObject({ state: 'read', frames: 3, unapplied: 2 })
    expect(status.entries.map((item) => item.workspaceId)).toEqual(['a'])
  })

  it('reports the bridge refusal as its own reason and shows no rows', async () => {
    const status = await readWorkspaceList(async () => ({ ok: false, code: 'bridge-stream-overflow' }))
    expect(status).toMatchObject({ state: 'unavailable', reason: 'bridge-stream-overflow', entries: [] })
  })

  it('turns a thrown bridge error into that error’s code', async () => {
    const status = await readWorkspaceList(async () => { throw Object.assign(new Error('x'), { code: 'bridge-host-not-ready' }) })
    expect(status).toMatchObject({ state: 'unavailable', reason: 'bridge-host-not-ready' })
  })
})

describe('the host-side stream resolver', () => {
  const registryWith = (frames: unknown[]) => ({ get: () => ({ follow: () => (async function* () { for (const frame of frames) yield frame })() }) })

  it('emits every plain frame in order and reports the count', async () => {
    const seen: unknown[] = []
    const outcome = await resolveBridgeStreamCall(registryWith([baseline(['a']), { type: 'remove', workspaceId: 'a' }]), 'workspace/follow', [], (frame) => { seen.push(frame); return true })
    expect(outcome).toEqual({ ok: true, result: { frames: 2 } })
    expect(seen).toHaveLength(2)
  })

  it('refuses a non-stream endpoint, a payload, a missing provider, and an unparsable frame', async () => {
    const registry = registryWith([{ type: 'baseline', value: { items: [{}], archivedSessionIds: [] } }])
    expect(await resolveBridgeStreamCall(registry, 'settings/describe', [], () => true)).toMatchObject({ ok: false, code: 'bridge-endpoint-unsupported' })
    expect(await resolveBridgeStreamCall(registry, 'workspace/follow', ['extra'], () => true)).toMatchObject({ ok: false, code: 'bridge-payload-invalid' })
    expect(await resolveBridgeStreamCall({ get: () => undefined }, 'workspace/follow', [], () => true)).toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })

    const hostile = { get: () => ({ follow: () => (async function* () { yield new (class Frame { readonly type = 'baseline' })() })() }) }
    expect(await resolveBridgeStreamCall(hostile, 'workspace/follow', [], () => true)).toMatchObject({ ok: false, code: 'bridge-result-not-plain-data' })
  })

  it('stops at the frame bound instead of letting one subscription grow without limit', async () => {
    const frames = Array.from({ length: MAX_BRIDGE_STREAM_FRAMES + 5 }, () => ({ type: 'archived', archivedSessionIds: [] }))
    const outcome = await resolveBridgeStreamCall(registryWith(frames), 'workspace/follow', [], () => true)
    expect(outcome).toMatchObject({ ok: false, code: 'bridge-stream-overflow' })
  })

  it('honours a consumer that closes the stream early', async () => {
    const outcome = await resolveBridgeStreamCall(registryWith([baseline(['a']), baseline(['a'])]), 'workspace/follow', [], () => false)
    expect(outcome).toMatchObject({ ok: false, code: 'bridge-stream-closed' })
  })

  it('ends a never-ending generation after the quiet window and aborts its signal (ADR-0206)', async () => {
    // The base's follow generation ends only when its signal aborts. Without the quiet window the
    // read would never answer, and the call would die on its caller's timeout instead.
    let signal: AbortSignal | undefined
    let released = false
    const asked: string[] = []
    const hanging = {
      get: (name: string) => {
        asked.push(name)
        return {
          follow: (given: AbortSignal) => {
            signal = given
            return (async function* () {
              yield baseline(['a'])
              await new Promise<void>((resolve) => { given.addEventListener('abort', () => { released = true; resolve() }) })
            })()
          },
        }
      },
    }
    const seen: unknown[] = []
    const started = Date.now()
    const outcome = await resolveBridgeStreamCall(hanging, 'workspace/follow', [], (frame) => { seen.push(frame); return true })
    expect(outcome).toEqual({ ok: true, result: { frames: 1 } })
    expect(seen).toHaveLength(1)
    // The stream consumes the base's own Remote owner — the near-miss name must never be asked for.
    expect(asked).toEqual(['workspaceController'])
    // Long enough to prove the window is real, short enough that the default is not minutes.
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(signal?.aborted).toBe(true)
    expect(released).toBe(true)

    const wrongName = { get: (name: string) => (name === 'workspaceRegistry' ? { follow: () => (async function* () {})() } : undefined) }
    expect(await resolveBridgeStreamCall(wrongName, 'workspace/follow', [], () => true))
      .toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })
  })

  it('keeps reading while frames keep arriving, without waiting for the window between them', async () => {
    const frames = [baseline(['a']), { type: 'upsert', workspace: {} }, { type: 'archived', archivedSessionIds: [] }]
    let signal: AbortSignal | undefined
    const steady = {
      get: () => ({
        follow: (given: AbortSignal) => {
          signal = given
          return (async function* () {
            for (const frame of frames) {
              await new Promise((resolve) => { setTimeout(resolve, 5) })
              yield frame
            }
            await new Promise<void>((resolve) => { given.addEventListener('abort', () => { resolve() }) })
          })()
        },
      }),
    }
    const outcome = await resolveBridgeStreamCall(steady, 'workspace/follow', [], () => true)
    expect(outcome).toEqual({ ok: true, result: { frames: 3 } })
    expect(signal?.aborted).toBe(true)
  })
})

describe('the projection', () => {
  it('keeps unread distinct from empty', async () => {
    const providers = withProjectionReadTestAdmission(createUnavailableFirstService(null, {}))
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/state', { method: 'GET' }), {
      callerBinding: { correlation: 'c-012' },
      providers,
    } as never)
    const state = await response.json() as { workspaces: Record<string, unknown> }
    expect(state.workspaces).toMatchObject({ state: 'unavailable', reason: 'not-read', entries: [] })
  })
})
