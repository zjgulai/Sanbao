import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 041 on the shipped page (US-197~199): a live wait renders as WAITING with its scope
 * (tool) and source (asker's reason) — never as failed, never as approved; 批准 submits the
 * one-shot grant word and the receipt still does not read 已批准 until the log confirms it;
 * 撤回 is a named request; a lapsed wait says 需重新申请 and never converts into a grant.
 */

const card = (overrides: Record<string, unknown> = {}) => ({
  requestId: 'appr-1',
  toolName: 'mcp__shell__run',
  callId: 'call-1',
  reason: '该工具将执行受控命令',
  withdrawable: true,
  raisedAt: '2026-10-02T11:59:00.000Z',
  ...overrides,
})

const approvals = (overrides: Record<string, unknown> = {}) => ({
  state: 'read', pending: [card()], lapsed: [], receipts: [], code: null, at: null,
  ...overrides,
})

const payload = (sessionApprovals: unknown, extra: Record<string, unknown> = {}) => statePayload({
  draft: { state: 'unlocked', drafts: [] },
  matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
  workspaces: {
    source: 'workspace-follow', state: 'read', reason: null,
    entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
    order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
  },
  sessionChannel: {
    state: 'read', sessionId: 'sess-1', execution: 'idle', lastTurnEnd: null, transcript: [], reconciled: false,
    streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [],
    queue: { state: 'read', occurrences: [] },
    reply: null,
  },
  sessionClarifications: { state: 'read', pending: [], deferred: [], receipts: [], code: null, at: null },
  sessionApprovals,
  ...extra,
})

const setContext = (harness: Awaited<ReturnType<typeof bootSagePage>>) => {
  harness.node('link-matter').value = 'matter:1'
  harness.node('link-workspace').value = 'ws-1'
}

describe('the approval wait panel (ticket 041)', () => {
  it('renders a live wait with scope and source; 批准 submits exactly one decision and never reads 已批准 yet', async () => {
    const harness = await bootSagePage(payload(approvals()), {
      '/.sage/session/approval-answer': {
        state: 'recorded',
        receipt: { requestId: 'appr-1', state: 'accepted', outcome: 'allowed-once', submittedAt: 't', code: null, verifyOnly: true },
      },
    })
    await harness.refresh()
    setContext(harness)
    const rows = harness.node('approval-cards').children
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).toContain('等待授权：mcp__shell__run')
    expect(rows[0]?.textContent).toContain('来源：该工具将执行受控命令')
    expect(rows[0]?.textContent).toContain('调用：call-1')
    expect(rows[0]?.querySelector('[data-approval-answer="allowed-once"]')).not.toBeNull()
    expect(rows[0]?.querySelector('[data-approval-answer="rejected"]')).not.toBeNull()
    expect(rows[0]?.querySelector('[data-approval-withdraw="appr-1"]')).not.toBeNull()
    expect(harness.node('approval-note').textContent).toContain('等待授权 1 项：未批准前依赖动作保持阻断（等待≠失败，也≠已批准）。')

    harness.node('approval-cards').dispatch('click', { target: rows[0]?.querySelector('[data-approval-answer="allowed-once"]') })
    await harness.settle()
    expect(harness.requests).toEqual([
      { path: '/.sage/session/approval-answer', body: { matterRef: 'matter:1', requestId: 'appr-1', outcome: 'allowed-once' } },
    ])
    const note = harness.node('approval-note').textContent
    expect(note).toContain('批准已提交（仅此一次）——等待生效证据；未生效前不显示为已批准。')
    expect(note).not.toContain('已批准（仅此一次，有日志证据）')
  })

  it('撤回 is one named request and its receipt says the wait will not become an execution condition', async () => {
    const harness = await bootSagePage(payload(approvals()), {
      '/.sage/session/approval-withdraw': {
        state: 'recorded',
        receipt: { requestId: 'appr-1', state: 'accepted', outcome: 'withdrawn', submittedAt: 't', code: null, verifyOnly: true },
      },
    })
    await harness.refresh()
    setContext(harness)
    const rows = harness.node('approval-cards').children
    harness.node('approval-cards').dispatch('click', { target: rows[0]?.querySelector('[data-approval-withdraw]') })
    await harness.settle()
    expect(harness.requests).toEqual([
      { path: '/.sage/session/approval-withdraw', body: { matterRef: 'matter:1', requestId: 'appr-1' } },
    ])
    expect(harness.node('approval-note').textContent).toContain('撤回已提交——等待不会兑现为执行条件（这不是失败，也不是批准）。')
  })

  it('a wait without cancellation capability shows 不可撤回 instead of a lying button', async () => {
    const harness = await bootSagePage(payload(approvals({ pending: [card({ withdrawable: false })] })))
    await harness.refresh()
    const rows = harness.node('approval-cards').children
    expect(rows[0]?.querySelector('[data-approval-withdraw]')).toBeNull()
    expect(rows[0]?.textContent).toContain('不可撤回（请求方未提供取消能力）')
  })

  it('a lapsed wait says 需重新申请 and never converts into a grant', async () => {
    const harness = await bootSagePage(payload(approvals({
      pending: [],
      lapsed: [{ ...card(), lapse: 'gone' }],
      receipts: [{ requestId: 'appr-1', state: 'lapsed', outcome: null, submittedAt: 't', code: 'approval-wait-cancelled', verifyOnly: false }],
    })))
    await harness.refresh()
    expect(harness.node('approval-lapsed').children[0]?.textContent).toContain('已失效：mcp__shell__run（等待已消失）——需重新申请；旧等待不会自动兑现为执行条件。')
    const receipt = harness.node('approval-receipts').children[0]?.textContent ?? ''
    expect(receipt).toContain('已失效：approval-wait-cancelled——需重新申请；不代表已批准。')
    expect(receipt).not.toContain('已批准（仅此一次')
  })

  it('an unknown receipt offers only verification (zero requests) and keeps the effective one as the log says', async () => {
    const harness = await bootSagePage(payload(approvals({
      pending: [],
      receipts: [
        { requestId: 'appr-1', state: 'unknown', outcome: null, submittedAt: 't', code: 'bridge-host-not-ready', verifyOnly: true },
        { requestId: 'appr-2', state: 'effective', outcome: 'allowed-once', submittedAt: 't', code: null, verifyOnly: false },
      ],
    })))
    await harness.refresh()
    const rows = harness.node('approval-receipts').children
    expect(rows[0]?.textContent).toContain('结果未知：只给核对，不自动重试；未确认前不显示为已批准。')
    expect(rows[0]?.querySelector('[data-approval-verify]')).not.toBeNull()
    expect(rows[1]?.textContent).toContain('已批准（仅此一次，有日志证据）。')
    expect(rows[1]?.querySelector('[data-approval-verify]')).toBeNull()

    harness.node('approval-receipts').dispatch('click', { target: rows[0]?.querySelector('[data-approval-verify]') })
    await harness.settle()
    expect(harness.requests).toEqual([])
    expect(harness.node('approval-note').textContent).toContain('已重新读取该等待的状态（核对=只读，不重试同一提交）。')
  })

  it('keeps an unwired panel honest instead of an empty waiting list', async () => {
    const harness = await bootSagePage(payload({ state: 'unavailable', pending: [], lapsed: [], receipts: [], code: 'approval-relay-unavailable', at: null }))
    await harness.refresh()
    expect(harness.node('approval-cards').children).toHaveLength(0)
    expect(harness.node('approval-note').textContent).toContain('未核验：授权等待端口未接线（approval-relay-unavailable）；不以空列表冒充。')
  })
})
