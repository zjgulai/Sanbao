import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 035 on the shipped page (US-183/184): the anchor rail renders turn jump points with a
 * bounded preview; clicking preview shows it locally (zero requests), locating sends exactly one
 * pure-history read; an unreadable target shows its reason and keeps the scene — never a blank.
 */

const anchor = (runSeq: number, turn: number, promptPreview: string | null) => ({ runSeq, turn, promptPreview })

const anchors = (overrides: Record<string, unknown> = {}) => ({
  state: 'read',
  anchors: [
    anchor(12, 2, '把《增长复盘》按渠道拆分再讲一遍'),
    anchor(0, 1, '第一轮的要求'),
  ],
  located: null,
  code: null,
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
  sessionHistory: { state: 'read', runs: [], hasMore: false, nextBeforeSeq: null, detail: null, at: null },
  sessionAnchors: anchors(),
  ...extra,
})

describe('the message anchor rail (ticket 035)', () => {
  it('shows jump points with bounded previews; preview is local (zero requests) and locate is exactly one pure-history read', async () => {
    const harness = await bootSagePage(payload(), {
      '/.sage/session/anchors': { state: 'located', runSeq: 12, turn: 2, promptPreview: '把《增长复盘》按渠道拆分再讲一遍' },
    })
    await harness.refresh()

    const rows = harness.node('anchor-rows').children
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('运行 @12·第 2 轮')
    expect(rows[0]?.textContent).toContain('预览：把《增长复盘》按渠道拆分再讲一遍')
    expect(rows[1]?.textContent).toContain('运行 @0·第 1 轮')
    expect(harness.node('anchor-preview').hidden).toBe(true)

    // hover 不发命令：没有监听，dispatch 之后仍然零请求。
    harness.node('anchor-rows').dispatch('mouseenter', {})
    expect(harness.requests).toEqual([])

    // 点击锚点＝本地短预览（零桥调用）。
    const previewButton = rows[0]?.querySelector('[data-anchor-preview="12"]')
    harness.node('anchor-rows').dispatch('click', { target: previewButton })
    await harness.settle()
    expect(harness.node('anchor-preview').hidden).toBe(false)
    expect(harness.node('anchor-preview-text').textContent).toContain('把《增长复盘》按渠道拆分再讲一遍')
    expect(harness.node('anchor-note').textContent).toContain('有界短预览，未载入整段正文')
    expect(harness.requests).toEqual([])

    // 显式定位＝恰一条纯历史读（无 prompt/follow/其它路径）。
    harness.node('anchor-locate').dispatch('click', {})
    await harness.settle()
    expect(harness.requests).toEqual([
      { path: '/.sage/session/anchors', body: { action: 'locate', runSeq: 12 } },
    ])
    expect(harness.node('anchor-note').textContent).toContain('已定位到运行 @12 的该轮消息')
    expect(harness.node('anchor-preview-text').textContent).toContain('已定位：运行 @12')
  })

  it('keeps an unreadable target missing with its reason and preserves the scene (US-184)', async () => {
    const harness = await bootSagePage(payload(), {
      '/.sage/session/anchors': { state: 'missing', runSeq: 12, code: 'history-run-not-in-page' },
    })
    await harness.refresh()
    const rows = harness.node('anchor-rows').children
    const previewButton = rows[0]?.querySelector('[data-anchor-preview="12"]')
    harness.node('anchor-rows').dispatch('click', { target: previewButton })
    await harness.settle()
    harness.node('anchor-locate').dispatch('click', {})
    await harness.settle()

    expect(harness.node('anchor-note').textContent).toContain('运行 @12 不可读（history-run-not-in-page）')
    expect(harness.node('anchor-note').textContent).toContain('保持缺失（不显示空白成功）')
    // 保持现场：锚点行与短预览都还在，不回落为空白。
    expect(harness.node('anchor-rows').children).toHaveLength(2)
    expect(harness.node('anchor-preview').hidden).toBe(false)
    expect(harness.node('anchor-preview-text').textContent).toContain('把《增长复盘》按渠道拆分再讲一遍')
    // 定位失败也只动了一条读请求，没有别的路径。
    expect(harness.requests.map((request) => request.path)).toEqual(['/.sage/session/anchors'])
  })

  it('reads the rail on the explicit click and marks a located target from the projection', async () => {
    const harness = await bootSagePage(payload({
      sessionAnchors: anchors({ located: { runSeq: 12, promptPreview: '把《增长复盘》按渠道拆分再讲一遍' } }),
    }), {
      '/.sage/session/anchors': { state: 'read', anchors: [] },
    })
    await harness.refresh()
    expect(harness.node('anchor-rows').children[0]?.dataset.anchorLocated).toBe('true')

    harness.node('anchor-read').dispatch('click', {})
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/session/anchors', body: { action: 'read' } }])
  })

  it('keeps the unreadable projection honest instead of pretending an empty list', async () => {
    const harness = await bootSagePage(payload({
      sessionAnchors: anchors({ state: 'unavailable', anchors: [], code: 'session-anchors-unavailable' }),
    }))
    await harness.refresh()
    expect(harness.node('anchor-rows').children).toHaveLength(0)
    expect(harness.node('anchor-note').textContent).toContain('未核验：锚点读取端口未接线（不以空列表冒充能力）。')
  })
})
