import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 037 on the shipped page (US-188): the reply action row shows ONLY projection-backed
 * actions — copy/quote always (with text), retry only on a determinate failure, and a broken
 * stream swaps retry for the audit entry; suggestion chips fill the composer without sending.
 */

const reply = (overrides: Record<string, unknown> = {}) => ({
  text: '完整回复文本',
  endKind: 'completed',
  failed: false,
  actions: ['copy', 'quote'],
  ...overrides,
})

const channel = (overrides: Record<string, unknown> = {}) => ({
  state: 'read', sessionId: 'sess-1', execution: 'idle', lastTurnEnd: 'completed',
  reply: reply(), transcript: [{ role: 'user', text: '原来的要求', source: 'echo', at: 't', attachments: [], messageRef: 'req-1' }],
  reconciled: false, streamBroken: false, code: null, records: 1, unapplied: 0, paused: false, pending: [],
  queue: { state: 'read', occurrences: [] },
  ...overrides,
})

const payload = (extra: Record<string, unknown> = {}) => statePayload({
  workspaces: {
    source: 'workspace-follow', state: 'read', reason: null,
    entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
    order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
  },
  matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
  draft: { state: 'unlocked', drafts: [] },
  sessionChannel: channel(),
  sessionClarifications: { state: 'read', pending: [], deferred: [], receipts: [], code: null, at: null },
  sessionAnchors: { state: 'read', anchors: [], located: null, code: null, at: null },
  sessionEdits: { state: 'read', records: [], code: null, at: null },
  sessionHistory: { state: 'read', runs: [], hasMore: false, nextBeforeSeq: null, detail: null, at: null },
  plans: { state: 'read', plans: [], lastStepRun: null },
  ...extra,
})

const plan = (steps: readonly unknown[]) => ({ planId: 'p-1', matterRef: 'matter:1', title: '渠道复盘', steps, state: 'accepted', acceptedAt: 't', createdAt: 't' })
const step = (stepNo: number, title: string, readiness: string) => ({ stepNo, title, readiness, readinessNote: '' })

describe('the reply action row (ticket 037)', () => {
  it('offers copy/quote always; retry only on a determinate failure; copy is honest about a missing clipboard', async () => {
    const harness = await bootSagePage(payload({
      sessionChannel: channel({ reply: reply({ endKind: 'error', failed: true, actions: ['copy', 'quote', 'retry'] }), lastTurnEnd: 'error' }),
    }))
    await harness.refresh()
    const buttons = harness.node('reply-actions').children.map((child) => child.dataset.replyAction)
    expect(buttons).toEqual(['copy', 'quote', 'retry'])
    expect(harness.node('reply-note').textContent).toContain('上一轮以确定失败结束（error）')

    // 复制：能写才写，不能写如实说；零桥调用。
    harness.node('reply-actions').dispatch('click', { target: harness.node('reply-actions').children[0] })
    await harness.settle()
    expect(harness.requests).toEqual([])
    expect(harness.node('reply-note').textContent).toContain('本机剪贴板不可用：复制未执行（不伪造成功）。')

    // 引用：只填输入区，不发。
    harness.node('reply-actions').dispatch('click', { target: harness.node('reply-actions').children[1] })
    await harness.settle()
    expect(harness.node('session-input').value).toBe('> 完整回复文本\n')
    expect(harness.requests).toEqual([])
    expect(harness.node('reply-note').textContent).toContain('引用已填入输入区（未发送）')
    // 本地反馈经轮询守护：下一轮投影不把它冲掉（真页面 2s 轮询的复发坑）。
    await harness.refresh()
    expect(harness.node('reply-note').textContent).toContain('引用已填入输入区（未发送）')
  })

  it('retry rides the same send entry with the last user text — exactly one request', async () => {
    const harness = await bootSagePage(payload({
      sessionChannel: channel({ lastTurnEnd: 'error', reply: reply({ endKind: 'error', failed: true, actions: ['copy', 'quote', 'retry'] }) }),
    }), {
      '/.sage/session/send': { state: 'accepted', accepted: true },
    })
    await harness.refresh()
    const retry = harness.node('reply-actions').querySelector('[data-reply-action="retry"]')
    expect(retry).not.toBeNull()
    // 发送入口需要事项/工作区在上下文里（与普通发送同一前置）。
    harness.node('link-matter').value = 'matter:1'
    harness.node('link-workspace').value = 'ws-1'
    harness.node('reply-actions').dispatch('click', { target: retry })
    await harness.settle()
    expect(harness.requests).toEqual([
      { path: '/.sage/session/send', body: { matterRef: 'matter:1', workspaceRoot: 'ws-1', text: '原来的要求' } },
    ])
    expect(harness.node('reply-note').textContent).toContain('重试已受理（与普通发送同一入口）')
  })

  it('an uncertain stream shows the audit entry and never a retry button', async () => {
    const harness = await bootSagePage(payload({
      sessionChannel: channel({ streamBroken: true, reply: reply({ endKind: 'error', failed: true, actions: ['copy', 'quote', 'retry'] }) }),
    }))
    await harness.refresh()
    const container = harness.node('reply-actions')
    expect(container.querySelector('[data-reply-action="retry"]')).toBeNull()
    const audit = container.querySelector('[data-reply-audit="true"]')
    expect(audit?.textContent).toBe('核对（重新读取会话）')
    expect(harness.node('reply-note').textContent).toContain('会话流已断：状态未知——只给核对入口，不给重试。')

    // 核对＝只重读（零写调用）。
    container.dispatch('click', { target: audit })
    await harness.settle()
    expect(harness.requests).toEqual([])
    expect(harness.node('reply-note').textContent).toContain('已重新读取会话（核对）：未触发任何重发。')
  })

  it('suggestion chips come from the plan projection and only fill the composer', async () => {
    const harness = await bootSagePage(payload({
      plans: { state: 'read', plans: [plan([step(1, '按计划创建页面', 'ready'), step(2, '等待数据就绪', 'not-ready'), step(3, '查看示例产物', 'ready')])], lastStepRun: null },
    }))
    await harness.refresh()
    const chips = harness.node('suggestion-chips').children
    expect(chips).toHaveLength(2)
    expect(chips[0]?.textContent).toContain('建议：按计划创建页面')
    expect(harness.node('suggestion-note').textContent).toContain('共 2 条后续建议（点击只填入输入区）')

    const button = chips[0]?.querySelector('[data-suggestion-text]')
    harness.node('suggestion-chips').dispatch('click', { target: button })
    await harness.settle()
    // 填入但未发送：零请求。
    expect(harness.node('session-input').value).toBe('按计划创建页面')
    expect(harness.requests).toEqual([])
    expect(harness.node('suggestion-note').textContent).toContain('建议已填入输入区（未发送）')
  })

  it('keeps the suggestion area honest without a wired plan projection', async () => {
    const harness = await bootSagePage(payload({ plans: { state: 'unavailable' } }))
    await harness.refresh()
    expect(harness.node('suggestion-chips').children).toHaveLength(0)
    expect(harness.node('suggestion-note').textContent).toContain('后续建议未核验：方案投影未接线')
  })
})
