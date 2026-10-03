import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 005, the conversation surface (US-012/013).
 *
 * The card is where "ack 与执行分开显示" and "最终态以历史为准" become visible: the ack sentence names
 * admission only, execution follows the log's open turn, and the reconciled text says where it came from.
 */

const workspaces = {
  source: 'workspace-follow', state: 'read', reason: null,
  entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
  order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
}
const draft = { draftId: 'draft-1', fields: { goal: 'g', deliverable: 'd', responsibility: 'r', projectRef: '' }, clarification: '', history: [], status: 'converted', matterRef: 'receipt:42', attempt: null, complete: true, createdAt: 'x', updatedAt: 'x' }

const channel = (overrides: Record<string, unknown> = {}) => ({
  state: 'read', sessionId: 'session-1', execution: 'idle', lastTurnEnd: null,
  transcript: [], reconciled: false, streamBroken: false, code: null, records: 0, unapplied: 0, ...overrides,
})
const payload = (channelState: unknown) => statePayload({
  draft: { state: 'unlocked', drafts: [draft] },
  workspaces,
  matterLinks: { state: 'read', links: [{ matterRef: 'receipt:42', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
  sessionChannel: channelState,
})

describe('the conversation card', () => {
  it('says the ack only means admission, and never that the model started working', async () => {
    const harness = await bootSagePage(payload(channel({
      transcript: [{ role: 'user', text: '开始吧', source: 'echo', at: '2026-10-02T12:00:00.000Z' }],
    })))
    const ack = harness.node('session-send-state').textContent
    expect(ack).toContain('已受理')
    expect(ack).toContain('执行与否看下一行')
    // The whole card: the ack never reads as "started working".
    const card = renderSageDocument().slice(renderSageDocument().indexOf('class="sage-card sage-session-card"'), renderSageDocument().indexOf('class="sage-link-section"'))
    expect(ack).not.toMatch(/已开始工作|模型已开始/u)
    expect(harness.node('session-execution').textContent).toBe('空闲（没有未结束的一轮）')
    expect(card).toContain('回执只表示进了队列，不表示模型已开始工作')
  })

  it('marks execution only from the log, and the ended reason when the turn closed', async () => {
    const running = await bootSagePage(payload(channel({ execution: 'executing' })))
    expect(running.node('session-execution').textContent).toContain('执行中')
    expect(running.node('session-execution').textContent).toContain('日志里有一轮未结束')

    const ended = await bootSagePage(payload(channel({ execution: 'idle', lastTurnEnd: 'completed' })))
    expect(ended.node('session-execution').textContent).toContain('本轮已结束（completed）')
  })

  it('shows the reconciled history text as its own row and says where it came from', async () => {
    const harness = await bootSagePage(payload(channel({
      reconciled: true,
      transcript: [
        { role: 'user', text: '问题', source: 'echo', at: '2026-10-02T12:00:00.000Z' },
        { role: 'assistant', text: '历史里的最终答复', source: 'history', at: null },
      ],
    })))
    const rows = harness.node('session-transcript').children
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('我（本机回显）')
    expect(rows[1]?.textContent).toContain('助手 · 历史')
    expect(rows[1]?.textContent).toContain('历史里的最终答复')
    expect(harness.node('session-note').textContent).toContain('已按历史对账')
  })

  it('names a broken stream with its code instead of keeping a partial text as final', async () => {
    const harness = await bootSagePage(payload(channel({ streamBroken: true, code: 'bridge-stream-closed' })))
    expect(harness.node('session-note').textContent).toContain('流已断开')
    expect(harness.node('session-note').textContent).toContain('bridge-stream-closed')
    expect(harness.node('session-transcript').children).toHaveLength(0)
  })

  it('says no session exists before the first send, and refuses a send without a chosen matter', async () => {
    const harness = await bootSagePage(statePayload({
      workspaces: null,
      draft: { state: 'unlocked', drafts: [] },
      matterLinks: { state: 'read', links: [], trail: [] },
      sessionChannel: channel({ state: 'no-session', sessionId: null }),
    }))
    expect(harness.node('session-id').textContent).toContain('还没有会话')
    expect(harness.node('session-send-state').textContent).toBe('尚未发送')

    harness.node('session-input').value = '开始吧'
    harness.node('session-send').dispatch('click')
    await harness.refresh()
    expect(harness.requests).toEqual([])
    expect(harness.node('session-note').textContent).toContain('先在上面选好事项与工作区')
  })

  it('posts the matter, its workspace root and the text when everything is chosen', async () => {
    const harness = await bootSagePage(payload(channel()))
    harness.node('session-input').value = '开始吧'
    harness.node('session-send').dispatch('click')
    await harness.refresh()
    expect(harness.requests).toEqual([
      { path: '/.sage/session/send', body: { matterRef: 'receipt:42', workspaceRoot: '/Users/someone/project', text: '开始吧' } },
    ])
  })
})
