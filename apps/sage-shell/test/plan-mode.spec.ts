import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createPlanMode } from '../src/main/plan-mode.js'

/**
 * Ticket 039 (US-192~194) at the module and route seams.
 *
 * The acceptance lines: the mode state is the service projection's cropped view (never a guess);
 * the switch is one named request whose receipt distinguishes applied / pending / unchanged and
 * keeps showing the actual mode while a change is still queued; switching inside one matter
 * never writes or leaks into any default another matter would start from; and an unreadable
 * provider is a named refusal, never a fabricated settled outcome.
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
  const dir = await mkdtemp(join(tmpdir(), 'sage-plan-mode-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const bindingsFile = join(dir, 'sessions', 'bindings.json')
  const sessions = options.sessions ?? { 'matter:1': 'session-1', 'matter:2': 'session-2' }
  if (Object.keys(sessions).length > 0) {
    await mkdir(join(dir, 'sessions'), { recursive: true })
    await writeFile(bindingsFile, JSON.stringify(sessions), { mode: 0o600 })
  }
  const calls: Array<{ endpoint: string, payload: unknown }> = []
  const modeResponses: unknown[] = []
  const switchResponses: unknown[] = []
  const store = createPlanMode({
    callBridge: async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      if (endpoint === 'session/plan-mode') return modeResponses.shift() ?? { ok: true, result: { active: false, pending: false } }
      if (endpoint === 'session/plan-mode-switch') return switchResponses.shift() ?? { ok: true, result: { outcome: 'noop' } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    },
    bindingsFile,
    now: () => '2026-10-03T12:00:00.000Z',
  })
  return { store, calls, modeResponses, switchResponses }
}

describe('the plan-mode store (ticket 039)', () => {
  it('reads the projection for the matter\'s own session; a matter with no session reads no-session with zero bridge calls', async () => {
    const h = await harness()
    const read = await h.store.read({ matterRef: 'matter:1' })
    expect(read).toEqual({ state: 'read', reason: null, active: false, pending: false })
    expect(h.calls).toEqual([{ endpoint: 'session/plan-mode', payload: [{ sessionId: 'session-1' }] }])

    h.calls.length = 0
    const bare = await h.store.read({ matterRef: 'matter:never-sent' })
    expect(bare).toEqual({ state: 'no-session', reason: null, active: null, pending: false })
    expect(h.calls).toEqual([])
  })

  it('surfaces the queued-selection flag and refuses to guess when the projection is unreadable', async () => {
    const h = await harness()
    h.modeResponses.push({ ok: true, result: { active: false, pending: true } })
    expect(await h.store.read({ matterRef: 'matter:1' })).toEqual({ state: 'read', reason: null, active: false, pending: true })

    h.modeResponses.push({ ok: false, code: 'bridge-session-not-live' })
    expect(await h.store.read({ matterRef: 'matter:1' })).toEqual({ state: 'unavailable', reason: 'bridge-session-not-live', active: null, pending: false })

    h.modeResponses.push({ ok: true, result: { active: 'yes' } })
    expect(await h.store.read({ matterRef: 'matter:1' })).toEqual({ state: 'unavailable', reason: 'plan-mode-unreadable', active: null, pending: false })
  })

  it('switches through one named request, re-reads the actual mode, and maps the base outcomes to the three families', async () => {
    const h = await harness()
    h.switchResponses.push({ ok: true, result: { outcome: 'committed' } })
    h.modeResponses.push({ ok: true, result: { active: true, pending: false } })
    const committed = await h.store.switch({ matterRef: 'matter:1', active: true })
    expect(committed).toEqual({
      state: 'settled',
      outcome: 'committed',
      family: 'applied',
      view: { active: true, pending: false },
      viewCode: null,
      at: '2026-10-03T12:00:00.000Z',
    })
    expect(h.calls).toEqual([
      { endpoint: 'session/plan-mode-switch', payload: [{ sessionId: 'session-1', active: true }] },
      { endpoint: 'session/plan-mode', payload: [{ sessionId: 'session-1' }] },
    ])

    // Queued: the change is NOT in force yet — the fresh view still shows the actual mode.
    h.switchResponses.push({ ok: true, result: { outcome: 'queued' } })
    h.modeResponses.push({ ok: true, result: { active: false, pending: true } })
    const queued = await h.store.switch({ matterRef: 'matter:1', active: true })
    expect(queued).toMatchObject({ state: 'settled', outcome: 'queued', family: 'pending', view: { active: false, pending: true } })

    h.switchResponses.push({ ok: true, result: { outcome: 'cancelled' } })
    h.modeResponses.push({ ok: true, result: { active: false, pending: false } })
    expect(await h.store.switch({ matterRef: 'matter:1', active: false })).toMatchObject({ family: 'unchanged', outcome: 'cancelled' })

    h.switchResponses.push({ ok: true, result: { outcome: 'noop' } })
    h.modeResponses.push({ ok: true, result: { active: false, pending: false } })
    expect(await h.store.switch({ matterRef: 'matter:1', active: false })).toMatchObject({ family: 'unchanged', outcome: 'noop' })
  })

  it('never fabricates a settled outcome: no session refuses, a provider refusal crosses, an unreadable outcome refuses', async () => {
    const h = await harness()
    expect(await h.store.switch({ matterRef: 'matter:never-sent', active: true })).toEqual({ state: 'refused', code: 'plan-mode-no-session' })
    expect(h.calls).toEqual([])

    h.switchResponses.push({ ok: false, code: 'bridge-provider-unavailable' })
    expect(await h.store.switch({ matterRef: 'matter:1', active: true })).toEqual({ state: 'refused', code: 'bridge-provider-unavailable' })
    // A refusal dispatches nothing else — no follow-up read may manufacture a view.
    expect(h.calls).toEqual([{ endpoint: 'session/plan-mode-switch', payload: [{ sessionId: 'session-1', active: true }] }])

    h.calls.length = 0
    h.switchResponses.push({ ok: true, result: { outcome: 'applied' } })
    expect(await h.store.switch({ matterRef: 'matter:1', active: true })).toEqual({ state: 'refused', code: 'plan-mode-unreadable' })
    expect(h.calls).toHaveLength(1)

    // Settled but the follow-up read failed: the receipt stays honest — settled, view null, code.
    h.calls.length = 0
    h.switchResponses.push({ ok: true, result: { outcome: 'committed' } })
    h.modeResponses.push({ ok: false, code: 'bridge-provider-failed' })
    const settledWithoutView = await h.store.switch({ matterRef: 'matter:1', active: true })
    expect(settledWithoutView).toMatchObject({ state: 'settled', outcome: 'committed', family: 'applied', view: null, viewCode: 'bridge-provider-failed' })
  })

  it('switching one matter touches neither the other matter nor any default: the endpoints are the whole surface', async () => {
    const h = await harness()
    h.switchResponses.push({ ok: true, result: { outcome: 'committed' } })
    h.modeResponses.push({ ok: true, result: { active: true, pending: false } })
    await h.store.switch({ matterRef: 'matter:1', active: true })
    // Every call named matter:1's own session, and only the two declared endpoints ever appear.
    expect(h.calls.map((call) => call.endpoint)).toEqual(['session/plan-mode-switch', 'session/plan-mode'])
    expect(h.calls.every((call) => JSON.stringify(call.payload).includes('session-1') && !JSON.stringify(call.payload).includes('session-2'))).toBe(true)
    expect(h.calls.every((call) => call.endpoint === 'session/plan-mode' || call.endpoint === 'session/plan-mode-switch')).toBe(true)

    // The other matter reads its own session fresh — the switch left nothing behind to inherit.
    h.modeResponses.push({ ok: true, result: { active: false, pending: false } })
    expect(await h.store.read({ matterRef: 'matter:2' })).toEqual({ state: 'read', reason: null, active: false, pending: false })
    expect(h.calls.at(-1)).toEqual({ endpoint: 'session/plan-mode', payload: [{ sessionId: 'session-2' }] })
    // A matter with no session still reads no-session after the switch (nothing global was written).
    expect(await h.store.read({ matterRef: 'matter:new' })).toEqual({ state: 'no-session', reason: null, active: null, pending: false })
  })
})

describe('the plan-mode route (ticket 039)', () => {
  it('parses exactly and enters admission without calling the raw switch provider', async () => {
    const seen: Array<{ readonly active: boolean }> = []
    const providers = createUnavailableFirstService(null, {
      sessionPlanModeSwitch: async (request) => {
        seen.push(request)
        return {
          state: 'settled', outcome: 'committed', family: 'applied',
          view: { active: request.active, pending: false }, viewCode: null, at: '2026-10-03T12:00:00.000Z',
        }
      },
    })
    const post = (body: unknown, service = providers) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/plan-mode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-039' }, providers: service } as never,
    )
    expect(await (await post({ active: true })).json()).toMatchObject({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(await (await post({ active: false })).json()).toMatchObject({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(seen).toEqual([])

    // Exactly the one declared member; nothing else may ride along.
    expect((await post({ active: 'on' })).status).toBe(400)
    expect((await post({ action: 'switch', active: true })).status).toBe(400)
    expect((await post({})).status).toBe(400)
    expect((await post({ active: true, matterRef: 'matter:9' })).status).toBe(400)

    const unwired = createUnavailableFirstService(null, {})
    expect(await (await post({ active: true }, unwired)).json()).toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
  })
})
