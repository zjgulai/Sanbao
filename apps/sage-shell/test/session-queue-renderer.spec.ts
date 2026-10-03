import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 008 on the shipped page (US-025~030): the send-mode choice, the authoritative queue
 * rows with their per-item edit/remove, the consumption race's honest sentence, the paused view
 * (待继续 only) and the negative space (no timer/automation entries, no "已打断" wording).
 */

const queue = [
  { queueItemId: 'q-1', position: 'queued', requestId: 'req-1', preview: '排队的这条' },
  { queueItemId: 'q-2', position: 'steering', requestId: null, preview: '转向的这条' },
  { queueItemId: 'q-3', position: 'context', requestId: null, preview: '上下文的提示' },
]

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
    streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [],
    queue: { state: 'read', occurrences: queue },
    ...channel,
  },
})

const setContext = (harness: Awaited<ReturnType<typeof bootSagePage>>) => {
  harness.node('link-matter').value = 'matter:1'
  harness.node('link-workspace').value = 'ws-1'
}

describe('the send-mode choice (ticket 008)', () => {
  it('defaults to queue (three-key body) and carries steer only when chosen', async () => {
    const harness = await bootSagePage(payload())
    setContext(harness)
    harness.node('session-input').value = '第一条'
    harness.node('session-send').dispatch('click')
    await harness.settle()
    expect(harness.requests[0]).toEqual({ path: '/.sage/session/send', body: { matterRef: 'matter:1', workspaceRoot: '/Users/someone/project', text: '第一条' } })

    // Every poll re-derives the matter/workspace selects — re-pick right before the steer click.
    setContext(harness)
    harness.node('session-mode').value = 'steer'
    harness.node('session-input').value = '转向的这条'
    harness.node('session-send').dispatch('click')
    await harness.settle()
    expect(harness.requests[1]).toEqual({ path: '/.sage/session/send', body: { matterRef: 'matter:1', workspaceRoot: '/Users/someone/project', text: '转向的这条', mode: 'steer' } })
  })

  it('never words steer as interrupting the current step', async () => {
    const document = renderSageDocument()
    const slice = document.slice(document.indexOf('id="session-mode"'), document.indexOf('id="queue-rows"'))
    expect(slice).toContain('步骤边界转向（不打断当前步骤）')
    expect(slice).toContain('本版没有定时或循环自动化入口')
    expect(slice).not.toContain('已打断当前步骤')
    // The dynamic note states the same boundary discipline (from the authoritative snapshot).
    const harness = await bootSagePage(payload())
    expect(harness.node('queue-note').textContent).toContain('steer 只在步骤边界消费')
  })
})

describe('the queue rows (ticket 008)', () => {
  it('renders the three placements from the snapshot with per-item edit/remove over exact bodies', async () => {
    const harness = await bootSagePage(payload(), {
      '/.sage/session/queue': { state: 'ok' },
    })
    const rows = harness.node('queue-rows').children
    expect(rows).toHaveLength(3)
    expect(rows[0]?.textContent).toContain('排队中（本轮结束后处理）')
    expect(rows[1]?.textContent).toContain('步骤边界（steer）')
    expect(rows[2]?.textContent).toContain('上下文（context）')
    expect(rows[0]?.querySelector('[data-queue-input]')?.value).toBe('排队的这条')
    // Nothing is posted until an explicit click.
    expect(harness.requests).toEqual([])

    const input = rows[0]?.querySelector('[data-queue-input]')!
    input.value = '改后的这条'
    const edit = rows[0]?.querySelector('[data-queue-action="edit"]')!
    harness.node('queue-rows').dispatch('click', { target: edit })
    await harness.settle()
    expect(harness.requests[0]).toEqual({ path: '/.sage/session/queue', body: { action: 'edit', itemId: 'q-1', text: '改后的这条' } })
    expect(harness.node('queue-note').textContent).toContain('按新文本更新')

    const remove = rows[1]?.querySelector('[data-queue-action="remove"]')!
    harness.node('queue-rows').dispatch('click', { target: remove })
    await harness.settle()
    expect(harness.requests[1]).toEqual({ path: '/.sage/session/queue', body: { action: 'remove', itemId: 'q-2' } })
  })

  it('names the consumption race honestly: 已开始处理, no silent drop, no resubmit', async () => {
    const harness = await bootSagePage(payload(), {
      '/.sage/session/queue': { state: 'refused', code: 'queue-item-not-found' },
    })
    const remove = harness.node('queue-rows').children[0]?.querySelector('[data-queue-action="remove"]')!
    harness.node('queue-rows').dispatch('click', { target: remove })
    await harness.settle()
    expect(harness.node('queue-note').textContent).toContain('已开始处理')
    expect(harness.node('queue-note').textContent).toContain('不静默丢弃、不重复提交')
    // One click, one request — the refusal never triggers an automatic re-send.
    expect(harness.requests).toHaveLength(1)
  })

  it('shows 待继续 only while paused, and says 未核验 instead of an empty list when the snapshot is missing', async () => {
    const paused = await bootSagePage(payload({
      paused: true,
      pending: [{ itemId: 'p-1', text: '待继续的一条', state: 'pending', note: null, editable: true }],
    }))
    expect(paused.node('queue-rows').children).toHaveLength(0)
    expect(paused.node('pending-rows').children).toHaveLength(1)
    expect(paused.node('queue-note').textContent).toContain('队列面板只显示待继续')

    const missing = await bootSagePage(payload({ queue: { state: 'unavailable', occurrences: [] } }))
    expect(missing.node('queue-rows').children).toHaveLength(0)
    expect(missing.node('queue-note').textContent).toContain('没有读到队列快照')
    expect(missing.node('queue-note').textContent).toContain('不以空列表冒充')
  })

  it('keeps the negative space: no timer/automation entries anywhere in the queue area', async () => {
    const harness = await bootSagePage(payload())
    const labels = (node: unknown): string[] => {
      const out: string[] = []
      const walk = (n: { tagName: string, textContent: string, children: readonly unknown[] }): void => {
        if (n.tagName === 'button') out.push(n.textContent)
        for (const child of n.children) walk(child as typeof n)
      }
      walk(node as { tagName: string, textContent: string, children: readonly unknown[] })
      return out
    }
    const queueLabels = labels(harness.node('queue-rows'))
    expect(queueLabels).toEqual(['保存修改', '移除', '保存修改', '移除', '保存修改', '移除'])
    for (const word of ['定时', '循环', '自动化', '计划任务']) {
      expect(queueLabels.join('|')).not.toContain(word)
    }
  })
})
