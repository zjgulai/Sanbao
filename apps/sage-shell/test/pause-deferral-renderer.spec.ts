import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 007 on the shipped page (US-020/021): the paused-send receipt says "registered, not yet
 * executed"; a resume interrupted by a re-pause says so without pretending; and an item frozen
 * mid-dispatch renders read-only with its own label.
 */

const payload = (channel: Record<string, unknown> = {}) => statePayload({
  workspaces: {
    source: 'workspace-follow', state: 'read', reason: null,
    entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
    order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
  },
  matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
  draft: { state: 'unlocked', drafts: [] },
  sessionChannel: {
    state: 'read', sessionId: 'sess-1', execution: 'idle', lastTurnEnd: null, transcript: [], reconciled: false,
    streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [], ...channel,
  },
})

const setContext = (harness: Awaited<ReturnType<typeof bootSagePage>>) => {
  harness.node('link-matter').value = 'matter:1'
  harness.node('link-workspace').value = 'ws-1'
}

describe('the paused-send receipt (ticket 007)', () => {
  it('a deferred send says 已收到，尚未执行 and points at the independent resume entry', async () => {
    const harness = await bootSagePage(payload({ paused: true }), {
      '/.sage/session/send': { state: 'deferred', itemId: 'pending-1' },
    })
    setContext(harness)
    harness.node('session-input').value = '暂停期间的要求'
    harness.node('session-send').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/session/send', body: { matterRef: 'matter:1', workspaceRoot: '/Users/someone/project', text: '暂停期间的要求' } }])
    expect(harness.node('session-note').textContent).toContain('已收到，尚未执行')
    expect(harness.node('session-note').textContent).toContain('不会自动派发')
    expect(harness.node('session-note').textContent).toContain('继续')
  })

  it('an interrupted resume names the re-pause and states that un-included content was not sent', async () => {
    const harness = await bootSagePage(payload({
      paused: true,
      pending: [{ itemId: 'p-1', text: 'A', state: 'pending', note: null, editable: true }],
    }), {
      '/.sage/session/resume': { state: 'interrupted', paused: true, drained: [], consumed: [], dispatched: ['p-1'], revision: 5, code: null },
    })
    setContext(harness)
    harness.node('session-resume').dispatch('click')
    await harness.settle()
    expect(harness.requests[0]?.path).toBe('/.sage/session/resume')
    expect(harness.node('session-note').textContent).toContain('继续被新的暂停打断')
    expect(harness.node('session-note').textContent).toContain('未含内容没有被送出')

    const resumed = await bootSagePage(payload({
      paused: true,
      pending: [
        { itemId: 'p-1', text: 'A', state: 'pending', note: null, editable: true },
        { itemId: 'p-2', text: 'B', state: 'pending', note: null, editable: true },
      ],
    }), {
      '/.sage/session/resume': { state: 'resumed', paused: false, drained: [], consumed: [], dispatched: ['p-1', 'p-2'], revision: 6, code: null },
    })
    setContext(resumed)
    resumed.node('session-resume').dispatch('click')
    await resumed.settle()
    expect(resumed.node('session-note').textContent).toContain('按顺序派发 2 条待继续')
    expect(resumed.node('session-note').textContent).toContain('受理≠执行')
  })
})

describe('the dispatching state on the pending list (ticket 007)', () => {
  it('renders frozen and read-only: label, disabled input, no edit/remove entries', async () => {
    const harness = await bootSagePage(payload({
      paused: true,
      pending: [
        { itemId: 'p-1', text: '派发中的一条', state: 'dispatching', note: null, editable: false },
        { itemId: 'p-2', text: '还能改的一条', state: 'pending', note: null, editable: true },
      ],
    }))
    const rows = harness.node('pending-rows').children
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('派发中（已冻结，不可编辑）')
    const frozenInput = rows[0]?.querySelector('[data-pending-input]')!
    expect(frozenInput.disabled).toBe(true)
    expect(rows[0]?.querySelector('[data-pending-action="edit"]')).toBeNull()
    expect(rows[0]?.querySelector('[data-pending-action="remove"]')).toBeNull()
    expect(rows[1]?.textContent).toContain('待继续（尚未派发）')
    expect(rows[1]?.querySelector('[data-pending-action="edit"]')).not.toBeNull()
    expect(rows[1]?.querySelector('[data-pending-action="remove"]')).not.toBeNull()
  })
})
