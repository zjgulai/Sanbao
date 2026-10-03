import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 009 on the shipped page (US-097~100): the runs list renders newest-first from the
 * projection, the read goes through the pure-history route only, the newest run auto-expands its
 * detail, the actual model is shown apart from the current selection, and an unreadable run stays
 * missing — never a blank success.
 */

const run = (overrides: Record<string, unknown> = {}) => ({
  runSeq: 0, turn: 1, provider: 'zhipu', model: 'glm-4.6', endSeq: 4, endReason: 'completed', messages: 2, ...overrides,
})

const history = (overrides: Record<string, unknown> = {}) => ({
  state: 'read',
  runs: [run({ runSeq: 12, turn: 2, provider: 'deepseek', model: 'deepseek-chat', endSeq: null, endReason: null, messages: 1 }), run()],
  hasMore: true,
  nextBeforeSeq: 0,
  detail: null,
  at: 't',
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
  sessionChannel: {
    state: 'read', sessionId: 'sess-1', execution: 'idle', lastTurnEnd: null, transcript: [], reconciled: false,
    streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [],
    queue: { state: 'read', occurrences: [] },
  },
  sessionHistory: history(),
  ...extra,
})

const setContext = (harness: Awaited<ReturnType<typeof bootSagePage>>) => {
  harness.node('link-matter').value = 'matter:1'
  harness.node('link-workspace').value = 'ws-1'
}

describe('the historic runs list (ticket 009)', () => {
  it('renders newest first with per-run actual models; reading goes through the history route only', async () => {
    const harness = await bootSagePage(payload(), {
      '/.sage/session/history': { state: 'read', runs: [{ runSeq: 12 }, { runSeq: 0 }], hasMore: false, nextBeforeSeq: 0 },
    })
    const rows = harness.node('history-rows').children
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('运行 @12')
    expect(rows[0]?.textContent).toContain('当时模型 deepseek/deepseek-chat')
    expect(rows[0]?.textContent).toContain('进行中（未结束）')
    expect(rows[1]?.textContent).toContain('当时模型 zhipu/glm-4.6')
    expect(rows[1]?.textContent).toContain('已结束（completed）')
    expect(harness.node('history-more').hidden).toBe(false)

    // Nothing is read until the explicit click; the read is one list + the auto-detail of newest.
    expect(harness.requests).toEqual([])
    harness.node('history-read').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([
      { path: '/.sage/session/history', body: { action: 'list' } },
      { path: '/.sage/session/history', body: { action: 'detail', runSeq: 12 } },
    ])
    // US-024: opening history never touches prompt/upload/follow.
    for (const request of harness.requests) expect(request.path).toBe('/.sage/session/history')
  })

  it('expands an older run on demand and keeps an unreadable run missing', async () => {
    const harness = await bootSagePage(payload({
      sessionHistory: history({ detail: { state: 'missing', runSeq: 12, code: 'bridge-page-failed' } }),
    }), {
      '/.sage/session/history': { state: 'missing', runSeq: 0, code: 'history-run-not-in-page' },
    })
    expect(harness.node('history-detail').hidden).toBe(false)
    expect(harness.node('history-detail-note').textContent).toContain('不可读（bridge-page-failed）')
    expect(harness.node('history-detail-note').textContent).toContain('保持缺失（不显示空白成功）')

    const open = harness.node('history-rows').children[1]?.querySelector('[data-history-action="detail"]')!
    harness.node('history-rows').dispatch('click', { target: open })
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/session/history', body: { action: 'detail', runSeq: 0 } }])
  })

  it('shows the run detail apart from the current selection and honours the truncated preview', async () => {
    const harness = await bootSagePage(payload({
      sessionHistory: history({
        detail: {
          state: 'read', runSeq: 12, provider: 'deepseek', model: 'deepseek-chat', endSeq: null, endReason: null,
          outputPreview: '（有界预览）', outputTruncated: true, userTexts: ['第二轮的要求'],
        },
      }),
    }))
    expect(harness.node('history-detail-model').textContent).toContain('当时实际模型（本运行请求头快照）：deepseek/deepseek-chat')
    expect(harness.node('history-detail-model').textContent).toContain('与本事项当前选择分开显示')
    expect(harness.node('history-detail-note').textContent).toContain('有截断')
    expect(harness.node('history-detail-users').children[0]?.textContent).toBe('第二轮的要求')
    expect(harness.node('history-detail-output').textContent).toBe('（有界预览）')
  })

  it('shows a run\'s clarifications read-only in the history detail — no control, no request (US-180)', async () => {
    const harness = await bootSagePage(payload({
      sessionHistory: history({
        detail: {
          state: 'read', runSeq: 12, provider: 'deepseek', model: 'deepseek-chat', endSeq: null, endReason: null,
          outputPreview: '（有界预览）', outputTruncated: false, userTexts: [],
          clarifications: [
            { question: '先收口哪部分？', selected: ['保持当前范围'], custom: null, answered: true },
            { question: '预算上限？', selected: [], custom: null, answered: false },
          ],
        },
      }),
    }))
    await harness.refresh()
    const rows = harness.node('history-detail-clarifications').children
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toBe('问：先收口哪部分？ —— 回答：保持当前范围')
    expect(rows[1]?.textContent).toContain('未回答（提问中止或仍在等待）')
    // Read-only: no submit control anywhere in the block, and looking dispatched nothing.
    expect(rows[0]?.querySelector('[data-clarification-submit]')).toBeNull()
    expect(harness.requests).toEqual([])
  })

  it('keeps the never-read empty state honest and reports a refusal instead of pretending', async () => {
    const fresh = await bootSagePage(payload({ sessionHistory: { state: 'read', runs: [], hasMore: false, nextBeforeSeq: null, detail: null, at: null } }))
    expect(fresh.node('history-rows').children).toHaveLength(0)
    expect(fresh.node('history-note').textContent).toContain('还没有读取历史运行')
    expect(fresh.node('history-note').textContent).toContain('不会激活执行')

    const failing = await bootSagePage(payload({ sessionHistory: { state: 'read', runs: [], hasMore: false, nextBeforeSeq: null, detail: null, at: null } }), {
      '/.sage/session/history': { state: 'refused', code: 'session-history-unavailable' },
    })
    failing.node('history-read').dispatch('click')
    await failing.settle()
    expect(failing.node('history-note').textContent).toContain('历史读取失败（session-history-unavailable）')
    expect(failing.node('history-note').textContent).toContain('没读到就不装作读过')
    expect(failing.requests).toEqual([{ path: '/.sage/session/history', body: { action: 'list' } }])
  })
})
