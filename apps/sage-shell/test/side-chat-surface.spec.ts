import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 024: the side-chat card. The four acts post their own named payloads; the transcript is
 * the child's; and the page offers no "merge" affordance — carrying text back is the explicit
 * button that rides the main send path.
 */

const record = (over: Record<string, unknown> = {}) => ({
  sideChatId: 'side-1', sessionId: 'session-child-1', atSeq: null, createdAt: '2026-10-02T12:00:00.000Z',
  execution: 'idle', lastTurnEnd: 'completed', ...over,
})

const payload = (items: readonly unknown[] = [record()]) => statePayload({
  sideChats: { state: 'read', code: null, items },
  workspaces: { source: 'workspace-follow', state: 'read', reason: null, entries: [{ workspaceId: 'ws-1', path: '/work', title: 'work' }], order: [], archivedSessions: 0, frames: 0, unapplied: 0 },
})

describe('the side-chat card (024)', () => {
  it('lists derived records and posts the four named acts', async () => {
    const harness = await bootSagePage(payload())
    const row = harness.node('side-chat-rows').children[0]!
    expect(row.textContent).toContain('侧聊')
    expect(row.textContent).toContain('派生自')
    // create
    harness.node('link-matter').value = 'receipt:1'
    harness.node('link-workspace').value = 'ws-1'
    harness.node('side-chat-create').dispatch('click')
    await harness.refresh()
    expect(harness.requests[0]).toEqual({ path: '/.sage/side-chats', body: { action: 'create', matterRef: 'receipt:1' } })
    // view — the stub answers every fetch with the current payload; make it read-shaped first.
    harness.setPayload({ ...payload(), state: 'read', channel: { state: 'read', sessionId: 'session-child-1', execution: 'idle', lastTurnEnd: null, transcript: [{ role: 'assistant', text: '侧聊答复', source: 'history', at: null, attachments: [] }], reconciled: false, streamBroken: false, code: null, records: 1, unapplied: 0, paused: false, pending: [] } })
    const view = row.children.find((child) => child.tagName === 'button')!
    harness.node('side-chat-rows').dispatch('click', { target: view })
    await harness.refresh()
    expect(harness.requests[1]).toEqual({ path: '/.sage/side-chats', body: { action: 'read', sideChatId: 'side-1' } })
    // send + return
    harness.node('side-chat-input').value = '侧聊里问一句'
    harness.node('side-chat-send').dispatch('click')
    await harness.refresh()
    expect(harness.requests[2]).toEqual({ path: '/.sage/side-chats', body: { action: 'send', sideChatId: 'side-1', text: '侧聊里问一句' } })
    // The send chain refreshes the transcript with a follow-up read before returning to the test.
    expect(harness.requests[3]).toEqual({ path: '/.sage/side-chats', body: { action: 'read', sideChatId: 'side-1' } })
    harness.node('side-chat-return').dispatch('click')
    await harness.refresh()
    expect(harness.requests[4]).toEqual({ path: '/.sage/side-chats', body: { action: 'return', sideChatId: 'side-1', text: '侧聊里问一句' } })
    // No automatic merge affordance exists anywhere in the document.
    const document = renderSageDocument()
    expect(document).not.toContain('自动合并</button>')
    expect(document).toContain('带回主对话（显式）')
  })

  it('renders 未核验 without rows when the records cannot be read', async () => {
    const harness = await bootSagePage(statePayload({ sideChats: { state: 'unavailable', code: 'side-chat-store-unreadable', items: [] } }))
    expect(harness.node('side-chat-note').textContent).toContain('侧聊未核验：side-chat-store-unreadable。')
    expect(harness.node('side-chat-rows').children).toHaveLength(0)
  })
})
