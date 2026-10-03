import { describe, expect, it, vi } from 'vitest'

import { PRODUCTION_FAIL_CLOSED_PORTS } from '../src/appservice/composition.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import type { CommandPipelinePorts } from '../src/appservice/command-contracts.js'

/**
 * Ticket 004 (US-008) at the route and wiring seams.
 *
 * The two acceptance lines: the responsibility default is filled from the REAL authenticated
 * identity (main-owned projection — the renderer spec covers the filled form), and editing the
 * responsibility value does not move any permission judgement. At this seam that is asserted
 * structurally and by read-back: the draft route cannot even carry an identity claim (exact
 * keys), an edit reaches exactly one port (the draft update), the command/authority pipeline
 * ports receive ZERO calls, and the identity projection plus the last-command record read back
 * byte-identical.
 */

const draftRecord = (responsibility: string) => ({
  draftId: 'draft-1',
  fields: { goal: '季度复盘', deliverable: '对外说明', responsibility, projectRef: '' },
  clarification: '',
  history: [],
  status: 'editing' as const,
  matterRef: null,
  createdAt: 't',
  updatedAt: 't2',
})

describe('the responsibility value never feeds a permission judgement (ticket 004)', () => {
  it('the draft route carries no identity claim — extra keys are refused at both levels', async () => {
    const seen: unknown[] = []
    const providers = createUnavailableFirstService(null, {
      draftUpdate: (request) => {
        seen.push(request)
        return { state: 'unlocked' as const, drafts: [draftRecord('张三（代填）')] }
      },
    })
    const post = (body: unknown) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/draft/update', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-004' }, providers } as never,
    )
    expect(await (await post({ draftId: 'draft-1', fields: { responsibility: '张三（代填）' } })).json()).toMatchObject({ state: 'unlocked' })
    // 恰好转发这些成员；改责任值只是草案字段更新。
    expect(seen).toEqual([{ draftId: 'draft-1', fields: { responsibility: '张三（代填）' } }])
    // UI 自报身份不作为授权依据的入口面：草案路由根本不接受任何 identity 形状的成员。
    expect((await post({ draftId: 'draft-1', fields: { responsibility: 'x' }, identityHandle: 'h-1' })).status).toBe(400)
    expect((await post({ draftId: 'draft-1', identity: { handle: 'h-1' } })).status).toBe(400)
    expect((await post({ draftId: 'draft-1', fields: { identityHandle: 'h-1' } })).status).toBe(400)
    expect((await post({ draftId: 'draft-1', fields: { responsibility: 'x', roleRef: 'r-1' } })).status).toBe(400)
    expect(seen).toHaveLength(1)
  })

  it('an edit reaches exactly the draft port and moves no permission surface', async () => {
    const commandSpies: Record<string, ReturnType<typeof vi.fn>> = {}
    const ports: CommandPipelinePorts = Object.fromEntries(
      Object.keys(PRODUCTION_FAIL_CLOSED_PORTS).map((key) => {
        const spy = vi.fn((...args: unknown[]) => {
          void args
          return undefined
        })
        commandSpies[key] = spy
        return [key, spy]
      }),
    ) as unknown as CommandPipelinePorts
    const updates: unknown[] = []
    let draftState = { state: 'unlocked' as const, drafts: [draftRecord('')] }
    const service = createUnavailableFirstService(null, {
      authSnapshot: () => ({ status: 'signed-in', displayName: '林一' }),
      draftList: () => draftState,
      draftUpdate: (request) => {
        updates.push(request)
        draftState = { state: 'unlocked', drafts: [draftRecord('张三（代填）')] }
        return draftState
      },
      commandPorts: ports,
    })
    const before = await (await service.readState()).json() as { service: { auth: unknown, reason: string, command: unknown }, draft: unknown }
    expect(await (await service.updateDraft({ draftId: 'draft-1', fields: { responsibility: '张三（代填）' } })).json()).toMatchObject({ state: 'unlocked' })
    // 恰好一路调用；命令/授权管线（权限判定的必经之路）零调用。
    expect(updates).toEqual([{ draftId: 'draft-1', fields: { responsibility: '张三（代填）' } }])
    for (const [key, spy] of Object.entries(commandSpies)) {
      expect(spy, key).not.toHaveBeenCalled()
    }
    // 身份投影与最近命令读数逐字节不变：改责任值不改变任何权限判定。
    const after = await (await service.readState()).json() as { service: { auth: unknown, reason: string, command: unknown }, draft: { drafts: Array<{ fields: { responsibility: string } }> } }
    expect(after.service.auth).toEqual(before.service.auth)
    expect(after.service.reason).toBe(before.service.reason)
    expect(after.service.command).toEqual(before.service.command)
    expect(after.draft.drafts[0]?.fields.responsibility).toBe('张三（代填）')
  })
})
