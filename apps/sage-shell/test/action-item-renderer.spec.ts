import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 028 on the shipped page (US-146~149).
 *
 * The card carries the discipline in its own words; the four acts post their exact bodies with
 * the page's send context; and every receipt badge is rendered from the projection — the page
 * never upgrades a receipt by itself.
 */

const workspaces = {
  source: 'workspace-follow', state: 'read', reason: null,
  entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
  order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
}
const matterLinks = {
  state: 'read',
  links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }],
  trail: [],
}
const channel = {
  state: 'read', sessionId: 's1', execution: 'idle', lastTurnEnd: null, reconciled: false, streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [],
  transcript: [{ role: 'user', text: '先出季度对账单', source: 'echo', at: '2026-10-03T08:00:00.000Z', attachments: [] }],
}

const item = (overrides: Record<string, unknown> = {}) => ({
  actionId: 'ai-1', matterRef: 'matter:1', title: '补齐季度数据', note: '先对账', state: 'open',
  revision: 1, createdAt: 't', updatedAt: 't', records: [], ...overrides,
})
const correction = (overrides: Record<string, unknown> = {}) => ({
  correctionId: 'c-1', matterRef: 'matter:1',
  original: { text: '先出季度对账单', at: '2026-10-03T08:00:00.000Z' },
  text: '更正副本：财务口径', submittedAt: 't',
  receipt: { state: 'pending-application', reason: 'queued' }, ...overrides,
})
const project = (overrides: Record<string, unknown> = {}) => ({
  // A ref that can never equal a hardcoded constant: the mutation battery proved the point.
  projectRef: 'p-7', name: '增长项目', createdAt: 't', matterRefs: ['matter:1'], ...overrides,
})

const payload = (actionItems: unknown, projects: unknown) =>
  statePayload({ workspaces, matterLinks, sessionChannel: channel, actionItems, projects })

const base = () => payload(
  { state: 'read', items: [item()], corrections: [correction()] },
  { state: 'read', projects: [project()], trail: [] },
)

const withSendContext = (harness: Awaited<ReturnType<typeof bootSagePage>>) => {
  harness.node('link-matter').value = 'matter:1'
  harness.node('link-workspace').value = 'ws-1'
}

describe('the action-item card (ticket 028)', () => {
  it('states the discipline in its own words and pins its static controls', () => {
    const document = renderSageDocument()
    const card = document.slice(
      document.indexOf('class="sage-card sage-action-items-card"'),
      document.indexOf('class="sage-matter-admin-section"'),
    )
    expect(card).toContain('不等同交付项、待办请求、工具调用或一次运行')
    expect(card).toContain('不构成交付验收')
    expect(card).toContain('只有队列的消费读数才显示已生效')
    expect(card).toContain('不改变主责、可见范围或事项事实')
    expect(card).toContain('本版不做分派给他人、跨项目批量改属或项目级权限继承')
    const labels = (card.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</gu, ''))
    expect(labels).toEqual([
      '新建行动项（归属所选事项）',
      '提交更正（关联原要求的新消息）',
      '新建项目',
      '把所选事项归属到该项目',
      '解除所选事项的项目归属',
    ])
    for (const word of ['分派给', '权限继承', '审批']) {
      expect(labels.join('|'), word).not.toContain(word)
    }
  })

  it('renders the items, their records, the receipts and the project summary', async () => {
    const harness = await bootSagePage(payload({
      state: 'read',
      items: [item({ state: 'in-progress', revision: 2, records: [{ recordNo: 1, at: 't1', basis: { revision: 1, title: '补齐季度数据', note: '先对账' } }] })],
      corrections: [correction(), correction({ correctionId: 'c-2', receipt: { state: 'received', requestId: 'rq-1' } })],
    }, { state: 'read', projects: [project()], trail: [] }))
    const rows = harness.node('action-item-rows').children
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).toContain('进行中')
    expect(rows[0]?.textContent).toContain('第 2 版 · 记录 1 次')
    expect(harness.node('action-record-rows').children[0]?.textContent).toContain('依据 第 1 版：「补齐季度数据」 · 先对账')

    const corrections = harness.node('correction-rows').children
    expect(corrections).toHaveLength(2)
    expect(corrections[0]?.textContent).toContain('待应用（在队列中')
    expect(corrections[0]?.textContent).toContain('关联原要求：「先出季度对账单」')
    expect(corrections[1]?.textContent).toContain('已接收（受理回执；受理不等于生效）')

    expect(harness.node('project-rows').children[0]?.textContent).toContain('1 个事项')
    expect(harness.node('project-rows').children[0]?.textContent).toContain('matter:1')
  })

  it('creates an item with the chosen matter; refuses locally without one', async () => {
    const harness = await bootSagePage(base())
    harness.node('action-item-title').value = '补齐季度数据'
    harness.node('action-item-create').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([])
    expect(harness.node('action-item-note').textContent).toContain('选好事项')

    harness.node('link-matter').value = 'matter:1'
    harness.node('action-item-body').value = '先对账'
    harness.node('action-item-create').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([{
      path: '/.sage/action-items',
      body: { action: 'create', matterRef: 'matter:1', title: '补齐季度数据', note: '先对账' },
    }])
  })

  it('posts the named row actions exactly', async () => {
    const harness = await bootSagePage(base())
    const row = harness.node('action-item-rows').children[0]!
    const startButton = row.querySelector('[data-action-item-action="start"]')!
    harness.node('action-item-rows').dispatch('click', { target: startButton })
    await harness.settle()
    expect(harness.requests[0]).toEqual({ path: '/.sage/action-items', body: { action: 'start', actionId: 'ai-1' } })

    const doneButton = row.querySelector('[data-action-item-action="complete"]')!
    harness.node('action-item-rows').dispatch('click', { target: doneButton })
    await harness.settle()
    expect(harness.requests[1]).toEqual({ path: '/.sage/action-items', body: { action: 'complete', actionId: 'ai-1' } })
  })

  it('lists sent messages as originals, prefills the copy, and submits the new linked message', async () => {
    const harness = await bootSagePage(base())
    const select = harness.node('correction-original')
    expect(select.children).toHaveLength(1)
    expect(select.children[0]?.value).toBe('0')
    expect(select.children[0]?.textContent).toContain('先出季度对账单')

    withSendContext(harness)
    select.dispatch('change')
    expect(harness.node('correction-text').value).toBe('先出季度对账单')
    harness.node('correction-text').value = '先出季度对账单（对账口径按财务版）'
    harness.node('correction-submit').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([{
      path: '/.sage/corrections',
      body: {
        matterRef: 'matter:1',
        workspaceRoot: '/Users/someone/project',
        originalText: '先出季度对账单',
        originalAt: '2026-10-03T08:00:00.000Z',
        text: '先出季度对账单（对账口径按财务版）',
      },
    }])
  })

  it('creates projects and posts assign/unassign with the chosen refs', async () => {
    const harness = await bootSagePage(base())
    harness.node('project-name').value = '增长项目'
    harness.node('project-create').dispatch('click')
    await harness.settle()
    expect(harness.requests[0]).toEqual({ path: '/.sage/projects', body: { action: 'create', name: '增长项目' } })

    harness.node('link-matter').value = 'matter:1'
    harness.node('project-select').value = 'p-7'
    harness.node('project-assign').dispatch('click')
    await harness.settle()
    expect(harness.requests[1]).toEqual({ path: '/.sage/projects', body: { action: 'assign', matterRef: 'matter:1', projectRef: 'p-7' } })

    // The 2s poll refills the selects; the page's own idiom is to pick again before each act.
    harness.node('link-matter').value = 'matter:1'
    harness.node('project-unassign').dispatch('click')
    await harness.settle()
    expect(harness.requests[2]).toEqual({ path: '/.sage/projects', body: { action: 'unassign', matterRef: 'matter:1' } })
  })

  it('keeps the unavailable shelf honest', async () => {
    const harness = await bootSagePage(payload({ state: 'unavailable', items: [], corrections: [] }, { state: 'unavailable', projects: [], trail: [] }))
    expect(harness.node('action-item-note').textContent).toContain('未核验')
    expect(harness.node('project-note').textContent).toContain('未核验')
    expect(harness.node('action-item-rows').children).toHaveLength(0)
  })
})
