import { describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createInputSelections } from '../src/main/input-selections.js'

/**
 * Ticket 038 (US-189~191) at the module and route seams.
 *
 * The acceptance lines: the lists are projections of what is actually mounted (unavailable-first
 * before any read; incomplete discovery never claims a skill is gone); a selection is validated
 * against the current projection, carried with one request as a bounded prefix, consumed by it,
 * and never writes enablement state or bleeds into another matter.
 */

function harness(options: { readonly skills?: unknown, readonly plugins?: unknown } = {}) {
  const calls: Array<{ endpoint: string, payload: unknown }> = []
  const store = createInputSelections({
    callBridge: async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      return options.skills ?? { ok: true, result: { skills: [], complete: true } }
    },
    now: () => '2026-10-03T12:00:00.000Z',
    plugins: () => (options.plugins ?? { state: 'read', rows: [{ identity: 'component:harness', version: '1.0.0', digestShort: 'abc123…' }] }) as never,
  })
  return { store, calls }
}

const skillsAnswer = (rows: readonly unknown[], complete = true) => ({
  ok: true,
  result: {
    skills: rows,
    complete,
  },
})

const skill = (name: string, overrides: Record<string, unknown> = {}) => ({
  name,
  description: '说明',
  source: 'user',
  provider: 'filesystem',
  userInvocable: true,
  modelInvocable: true,
  ...overrides,
})

describe('the input-area selections store (ticket 038)', () => {
  it('is unavailable-first before any read and maps the mounted catalog with its completeness flag', async () => {
    const bare = harness({ skills: { ok: false, code: 'skills-unavailable' } })
    const unavailable = await bare.store.read({ matterRef: 'matter:1' })
    expect(unavailable).toMatchObject({ state: 'unavailable', code: 'skills-unavailable', skills: [], pluginsNote: null })
    // 未核验时不可选择（不是"未挂载"，是清单都还没读到）。
    expect(bare.store.select({ matterRef: 'matter:1', kind: 'skill', ref: 'a' })).toEqual({ state: 'refused', code: 'selection-skills-unread' })

    const h = harness({ skills: skillsAnswer([
      skill('alpha'),
      skill('beta', { userInvocable: false }),
      skill('gamma', { source: 'project', provider: 'repo' }),
    ], false) })
    const status = await h.store.read({ matterRef: 'matter:1' })
    expect(status.state).toBe('read')
    expect(status.skills.map((entry) => [entry.name, entry.userInvocable])).toEqual([['alpha', true], ['beta', false], ['gamma', true]])
    // 发现未完成≠已失效：显式带句，不得当作停用。
    expect(status.skillsNote).toContain('不得当作"已失效"')
    expect(h.calls.map((call) => call.endpoint)).toEqual(['skills/snapshot'])
  })

  it('validates selections against the current projection: not-listed / model-only / not-mounted keep their own names', async () => {
    const h = harness({ skills: skillsAnswer([skill('alpha'), skill('beta', { userInvocable: false })]) })
    await h.store.read({ matterRef: 'matter:1' })
    expect(h.store.select({ matterRef: 'matter:1', kind: 'skill', ref: 'unknown' })).toEqual({ state: 'refused', code: 'selection-skill-not-listed' })
    expect(h.store.select({ matterRef: 'matter:1', kind: 'skill', ref: 'beta' })).toEqual({ state: 'refused', code: 'selection-skill-model-only' })
    expect(h.store.select({ matterRef: 'matter:1', kind: 'plugin', ref: 'component:missing' })).toEqual({ state: 'refused', code: 'selection-plugin-not-mounted' })
    expect(h.store.select({ matterRef: 'matter:1', kind: 'skill', ref: 'alpha' })).toMatchObject({ state: 'selected', selected: [{ kind: 'skill', ref: 'alpha' }] })
    expect(h.store.select({ matterRef: 'matter:1', kind: 'plugin', ref: 'component:harness' })).toMatchObject({ state: 'selected' })
    // 选择与清除都是纯本地动作：除已发生的读之外零桥调用（不改启用状态、无任何写面）。
    expect(h.calls.map((call) => call.endpoint)).toEqual(['skills/snapshot'])

    const unreadPlugins = harness({ skills: skillsAnswer([]), plugins: { state: 'unavailable', code: 'inventory-not-read' } })
    await unreadPlugins.store.read({ matterRef: 'matter:1' })
    expect(unreadPlugins.store.select({ matterRef: 'matter:1', kind: 'plugin', ref: 'component:harness' })).toEqual({ state: 'refused', code: 'selection-plugins-unread' })
  })

  it('carries the selections as one bounded prefix, consumes them with the request, and never bleeds across matters', async () => {
    const h = harness({ skills: skillsAnswer([skill('alpha'), skill('gamma')]) })
    await h.store.read({ matterRef: 'matter:1' })
    h.store.select({ matterRef: 'matter:1', kind: 'skill', ref: 'alpha' })
    h.store.select({ matterRef: 'matter:1', kind: 'plugin', ref: 'component:harness' })
    expect(h.store.carryPrefix('matter:1')).toBe('[/skill:alpha] [/plugin:component:harness] ')
    // 另一个事项不受影响：它的下一次请求不带任何引用。
    expect(h.store.carryPrefix('matter:2')).toBe('')
    expect(h.store.selectedOf('matter:2')).toEqual([])

    // 本次请求被受理 → 选择被消费；下一次请求不再携带（只对本次请求生效）。
    h.store.consume('matter:1')
    expect(h.store.carryPrefix('matter:1')).toBe('')
    expect(h.store.selectedOf('matter:2')).toEqual([])

    // 上限与去重：同一引用重复选择只记一次；第 5 个被拒。
    h.store.select({ matterRef: 'matter:3', kind: 'skill', ref: 'alpha' })
    h.store.select({ matterRef: 'matter:3', kind: 'skill', ref: 'alpha' })
    expect(h.store.selectedOf('matter:3')).toHaveLength(1)
    h.store.select({ matterRef: 'matter:3', kind: 'skill', ref: 'gamma' })
    h.store.clear({ matterRef: 'matter:3', kind: 'skill', ref: 'alpha' })
    expect(h.store.selectedOf('matter:3')).toEqual([{ kind: 'skill', ref: 'gamma' }])
    h.store.clear({ matterRef: 'matter:3', kind: 'skill' })
    expect(h.store.selectedOf('matter:3')).toEqual([])
  })
})

describe('the input-selections route (ticket 038)', () => {
  it('parses exactly, forwards, and keeps an unwired family honest', async () => {
    const seen: unknown[] = []
    const providers = createUnavailableFirstService(null, {
      inputSelectionsSelect: (request) => { seen.push({ select: request }); return { state: 'selected', selected: [{ kind: 'skill', ref: 'marker' }] } },
      inputSelectionsClear: (request) => { seen.push({ clear: request }); return { state: 'cleared', selected: [] } },
    })
    const post = (body: unknown) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/selections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-038' }, providers } as never,
    )
    expect(await (await post({ action: 'select', kind: 'skill', ref: 'alpha' })).json()).toMatchObject({ state: 'selected' })
    expect(await (await post({ action: 'clear', kind: 'plugin' })).json()).toEqual({ state: 'cleared', selected: [] })
    expect(await (await post({ action: 'clear', kind: 'skill', ref: 'alpha' })).json()).toEqual({ state: 'cleared', selected: [] })
    expect(seen).toEqual([
      { select: { action: 'select', kind: 'skill', ref: 'alpha' } },
      { clear: { action: 'clear', kind: 'plugin' } },
      { clear: { action: 'clear', kind: 'skill', ref: 'alpha' } },
    ])
    expect((await post({ action: 'select', kind: 'skill' })).status).toBe(400)
    expect((await post({ action: 'select', kind: 'nope', ref: 'x' })).status).toBe(400)
    expect((await post({ action: 'select', kind: 'skill', ref: 'x', extra: 1 })).status).toBe(400)
    expect((await post({ action: 'clear' })).status).toBe(400)

    const unwired = createUnavailableFirstService(null, {})
    const postUnwired = (body: unknown) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/selections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-038' }, providers: unwired } as never,
    )
    expect(await (await postUnwired({ action: 'select', kind: 'skill', ref: 'alpha' })).json()).toMatchObject({ code: 'input-selections-unavailable' })
    expect(await (await postUnwired({ action: 'clear', kind: 'skill' })).json()).toMatchObject({ code: 'input-selections-unavailable' })
  })
})
