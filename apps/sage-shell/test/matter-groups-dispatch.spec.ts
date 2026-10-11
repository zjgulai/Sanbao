/** L1-B (ADR-0321): the matter-groups dispatch step — per-op payload guards, the live
 *  re-verification subset, and the provider-result mapping over the family detail. */
import { describe, expect, it, vi } from 'vitest'

import { createMatterGroupsDispatchPort } from '../src/main/matter-groups-dispatch.js'
import type { MatterGovernanceIntent } from '../src/appservice/matter-governance-admission.js'

const MATTER = 'matter:sage.matter-groups-dispatch-1'
const CONTEXT = {
  scope: 'request' as const,
  callerBindingRef: 'caller:1',
  sessionRef: 'session:1',
  matterRef: MATTER,
  revisionRef: 'revision:1',
  generation: '1',
}
const STATUS = { state: 'read' as const, code: null, groups: [], trail: [], rename: null, batch: null }

function harness(options: { readonly readContext?: () => unknown } = {}) {
  const create = vi.fn(() => ({ state: 'created' as const, status: STATUS }))
  const rename = vi.fn(() => ({ state: 'renamed' as const, status: STATUS }))
  const remove = vi.fn(() => ({ state: 'removed' as const, status: STATUS }))
  const membership = vi.fn(() => ({ state: 'batch' as const, status: STATUS }))
  const port = createMatterGroupsDispatchPort({
    create: create as never,
    rename: rename as never,
    remove: remove as never,
    membership: membership as never,
    readContext: (options.readContext ?? (() => ({
      sessionRef: 'session:1',
      matterRef: MATTER,
      revisionRef: 'revision:1',
      contextGeneration: 1,
      frameGeneration: 7,
    }))) as never,
    readIdentitySession: (() => ({ sessionRef: 'session:1' })) as never,
    readFrame: (() => ({ generation: 7, ready: true, contaminated: false })) as never,
  })
  const request = (intent: MatterGovernanceIntent) => ({
    intent,
    correlation: 'caller:1',
    caller: { bindingRef: 'caller:1' },
    context: CONTEXT,
    candidate: { candidateRef: MATTER },
    identityPolicy: { decisionRef: 'decision:1', actorScopeRef: 'actor:1' },
  })
  return { port, request, create, rename, remove, membership }
}

const intent = (operation: string, payload: Readonly<Record<string, unknown>>): MatterGovernanceIntent =>
  ({ family: 'matter-governance', requestId: 'fixture-1', operation, candidate: { kind: 'active-session' }, payload }) as MatterGovernanceIntent

describe('the matter-groups dispatch step (ADR-0321)', () => {
  it('maps each command receipt to its family detail and passes refusals through', async () => {
    const h = harness()
    expect(await h.port(h.request(intent('matter.groups.create', { name: '交付跟进' })) as never)).toEqual({
      state: 'receipt',
      receiptRef: 'receipt:matter-group-create:交付跟进',
      detail: { kind: 'matter-group-created', name: '交付跟进', status: STATUS },
    })
    expect(h.create).toHaveBeenCalledWith({ name: '交付跟进' })

    expect(await h.port(h.request(intent('matter.groups.rename', { groupId: 'grp-1', name: '新名' })) as never))
      .toMatchObject({ state: 'receipt', detail: { kind: 'matter-group-renamed', groupId: 'grp-1', name: '新名' } })
    expect(await h.port(h.request(intent('matter.groups.remove', { groupId: 'grp-1' })) as never))
      .toMatchObject({ state: 'receipt', detail: { kind: 'matter-group-removed', groupId: 'grp-1' } })
    expect(await h.port(h.request(intent('matter.groups.membership', { groupId: 'grp-1', operation: 'add', targets: ['m-1'] })) as never))
      .toMatchObject({ state: 'receipt', detail: { kind: 'matter-group-membership', groupId: 'grp-1', operation: 'add' } })
    expect(h.membership).toHaveBeenCalledWith({ groupId: 'grp-1', operation: 'add', targets: ['m-1'] })

    const refused = harness()
    refused.rename.mockReturnValueOnce({ state: 'refused' as never, code: 'group-unknown' } as never)
    expect(await refused.port(refused.request(intent('matter.groups.rename', { groupId: 'grp-1', name: '新名' })) as never))
      .toEqual({ state: 'refused', code: 'group-unknown' })
  })

  it('answers not-dispatched for every malformed payload and an unregistered operation', async () => {
    const h = harness()
    const bad: readonly [string, Readonly<Record<string, unknown>>][] = [
      ['matter.groups.create', { name: '   ' }],
      ['matter.groups.create', { name: 'x'.repeat(201) }],
      ['matter.groups.create', { name: 'x', targets: [7] }],
      ['matter.groups.rename', { groupId: 'grp-1', name: '' }],
      ['matter.groups.rename', { name: 'x' }],
      ['matter.groups.remove', { groupId: '' }],
      ['matter.groups.membership', { groupId: 'grp-1', operation: 'delete', targets: ['m'] }],
      ['matter.groups.membership', { groupId: 'grp-1', operation: 'add', targets: [] }],
      ['matter.groups.unknown', {}],
    ]
    for (const [operation, payload] of bad) {
      expect(await h.port(h.request(intent(operation, payload)) as never), operation).toEqual({ state: 'not-dispatched' })
    }
    expect(h.create).not.toHaveBeenCalled()
    expect(h.rename).not.toHaveBeenCalled()
    expect(h.remove).not.toHaveBeenCalled()
    expect(h.membership).not.toHaveBeenCalled()
  })

  it('re-verifies the live facts and answers not-dispatched before the provider on drift', async () => {
    const h = harness({ readContext: () => ({ sessionRef: 'session:1', matterRef: 'matter:other', revisionRef: 'revision:1', contextGeneration: 1, frameGeneration: 7 }) })
    expect(await h.port(h.request(intent('matter.groups.create', { name: 'x' })) as never)).toEqual({ state: 'not-dispatched' })
    expect(h.create).not.toHaveBeenCalled()
  })
})
