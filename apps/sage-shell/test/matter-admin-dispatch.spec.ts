/** L1-A (ADR-0320): the matter-governance dispatch step — per-op payload guards, the live
 *  re-verification subset, and the provider-result mapping over the family detail. */
import { describe, expect, it, vi } from 'vitest'

import { createMatterAdminDispatchPort } from '../src/main/matter-admin-dispatch.js'
import type { MatterGovernanceIntent } from '../src/appservice/matter-governance-admission.js'

const MATTER = 'matter:sage.matter-admin-dispatch-1'
const CONTEXT = {
  scope: 'request' as const,
  callerBindingRef: 'caller:1',
  sessionRef: 'session:1',
  matterRef: MATTER,
  revisionRef: 'revision:1',
  generation: '1',
}
const STATUS = { state: 'read' as const, entries: [], trail: [], rename: null, batch: null }

function harness(options: {
  readonly readContext?: () => unknown
  readonly readFrame?: () => unknown
  readonly readIdentitySession?: () => unknown
  readonly archive?: unknown
  readonly batch?: unknown
  readonly rename?: unknown
} = {}) {
  const archive = (options.archive ?? vi.fn(() => ({ state: 'ok' as const, status: STATUS }))) as never
  const restore = vi.fn(() => ({ state: 'ok' as const, status: STATUS })) as never
  const batch = (options.batch ?? vi.fn(() => ({ state: 'batch' as const, status: STATUS }))) as never
  const rename = (options.rename ?? vi.fn(() => ({ state: 'renamed' as const, status: STATUS }))) as never
  const port = createMatterAdminDispatchPort({
    archive: archive as never,
    restore: restore as never,
    batch: batch as never,
    rename: rename as never,
    readContext: (options.readContext ?? (() => ({
      sessionRef: 'session:1',
      matterRef: MATTER,
      revisionRef: 'revision:1',
      contextGeneration: 1,
      frameGeneration: 7,
    }))) as never,
    readIdentitySession: (options.readIdentitySession ?? (() => ({ sessionRef: 'session:1' }))) as never,
    readFrame: (options.readFrame ?? (() => ({ generation: 7, ready: true, contaminated: false }))) as never,
  })
  const request = (intent: MatterGovernanceIntent) => ({
    intent,
    correlation: 'caller:1',
    caller: { bindingRef: 'caller:1' },
    context: CONTEXT,
    candidate: { candidateRef: MATTER },
    identityPolicy: { decisionRef: 'decision:1', actorScopeRef: 'actor:1' },
  })
  return {
    port,
    request,
    archive: archive as unknown as ReturnType<typeof vi.fn>,
    batch: batch as unknown as ReturnType<typeof vi.fn>,
    rename: rename as unknown as ReturnType<typeof vi.fn>,
  }
}

const intent = (operation: string, payload: Readonly<Record<string, unknown>>): MatterGovernanceIntent =>
  ({ family: 'matter-governance', requestId: 'fixture-1', operation, candidate: { kind: 'matter', matterRef: MATTER }, payload }) as MatterGovernanceIntent

describe('the matter-admin dispatch step (ADR-0320)', () => {
  it('maps each provider receipt to its family detail and passes refusals through', async () => {
    const h = harness()
    expect(await h.port(h.request(intent('matter.admin.archive', { ground: 'completed' })) as never)).toEqual({
      state: 'receipt',
      receiptRef: `receipt:matter-archive:${MATTER}`,
      detail: { kind: 'matter-archived', matterRef: MATTER, ground: 'completed', status: STATUS },
    })
    expect(h.archive).toHaveBeenCalledWith({ matterRef: MATTER, ground: 'completed' })

    expect(await h.port(h.request(intent('matter.admin.batch', { operation: 'restore', targets: [MATTER] })) as never))
      .toMatchObject({ state: 'receipt', receiptRef: 'receipt:matter-batch:restore', detail: { kind: 'matter-batch', operation: 'restore' } })
    expect(h.batch).toHaveBeenCalledWith({ operation: 'restore', targets: [MATTER] })

    expect(await h.port(h.request(intent('matter.admin.rename', { title: '新标题' })) as never))
      .toMatchObject({ state: 'receipt', detail: { kind: 'matter-renamed', matterRef: MATTER, title: '新标题' } })
    expect(h.rename).toHaveBeenCalledWith({ matterRef: MATTER, title: '新标题' })

    const refused = harness({ rename: vi.fn(() => ({ state: 'refused' as const, code: 'matter-rename-unavailable' })) })
    expect(await refused.port(refused.request(intent('matter.admin.rename', { title: 'x' })) as never))
      .toEqual({ state: 'refused', code: 'matter-rename-unavailable' })
  })

  it('answers not-dispatched for every malformed payload and an unregistered operation', async () => {
    const h = harness()
    const bad: readonly [string, Readonly<Record<string, unknown>>][] = [
      ['matter.admin.archive', { ground: 'maybe' }],
      ['matter.admin.archive', {}],
      ['matter.admin.batch', { operation: 'delete', targets: [MATTER] }],
      ['matter.admin.batch', { operation: 'archive', targets: [] }],
      ['matter.admin.batch', { operation: 'archive', targets: [7] }],
      ['matter.admin.batch', { operation: 'archive', targets: Array.from({ length: 101 }, (_, index) => `matter:${index}`) }],
      ['matter.admin.rename', { title: '' }],
      ['matter.admin.rename', { title: 'x'.repeat(501) }],
      ['matter.admin.unknown', {}],
    ]
    for (const [operation, payload] of bad) {
      expect(await h.port(h.request(intent(operation, payload)) as never), operation).toEqual({ state: 'not-dispatched' })
    }
    expect(h.archive).not.toHaveBeenCalled()
    expect(h.batch).not.toHaveBeenCalled()
    expect(h.rename).not.toHaveBeenCalled()
  })

  it('re-verifies the live facts and answers not-dispatched before the provider on any drift', async () => {
    const cases = [
      { name: 'context moved', harness: () => harness({ readContext: () => ({ sessionRef: 'session:1', matterRef: 'matter:other', revisionRef: 'revision:1', contextGeneration: 1, frameGeneration: 7 }) }) },
      { name: 'context gone', harness: () => harness({ readContext: () => null }) },
      { name: 'session missing', harness: () => harness({ readIdentitySession: () => null }) },
      { name: 'frame moved', harness: () => harness({ readFrame: () => ({ generation: 8, ready: true, contaminated: false }) }) },
      { name: 'frame not ready', harness: () => harness({ readFrame: () => ({ generation: 7, ready: false, contaminated: false }) }) },
    ]
    for (const item of cases) {
      const h = item.harness()
      expect(await h.port(h.request(intent('matter.admin.archive', { ground: 'completed' })) as never), item.name)
        .toEqual({ state: 'not-dispatched' })
      expect(h.archive, item.name).not.toHaveBeenCalled()
    }
  })

  it('normalizes a thrown provider to the conservative unknown', async () => {
    const h = harness({ archive: vi.fn(() => { throw new Error('probe') }) })
    expect(await h.port(h.request(intent('matter.admin.archive', { ground: 'completed' })) as never))
      .toEqual({ state: 'outcome-unknown' })
  })
})
