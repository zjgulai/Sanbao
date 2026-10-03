import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 031 on the shipped page (US-159~164).
 *
 * The four axes render as four facts; collapsing the panel is local view state that posts
 * nothing (so it cannot cancel a run); and the run-log read walks the bounded cursor, appending
 * on continue and resetting on rotation — all through the one route.
 */

const monitorPayload = (steps: Record<string, unknown>, extra: Record<string, unknown> = {}) => statePayload({
  linkMatter: undefined,
  workspaces: {
    source: 'workspace-follow', state: 'read', reason: null,
    entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
    order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
  },
  matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
  sessionChannel: { state: 'read', sessionId: 's1', execution: 'executing', lastTurnEnd: null, transcript: [], reconciled: false, streamBroken: false, code: null, records: 4, unapplied: 0, paused: false, pending: [] },
  runMonitor: {
    state: 'read', matterRef: 'matter:1', steps,
    budget: {
      reserved: { state: 'unknown', reason: 'usage-provider-unavailable' },
      consumed: { state: 'unknown', reason: 'usage-provider-unavailable' },
      billed: { state: 'unknown', reason: 'usage-provider-unavailable' },
    },
    device: { state: 'unknown', reason: 'device-binding-unavailable' },
    background: { state: 'unknown', reason: 'background-host-unavailable' },
    context: { state: 'unknown', reason: 'context-usage-unavailable', compaction: 'unknown' },
  },
  ...extra,
})

describe('the run-monitor card (ticket 031)', () => {
  it('pins its own words and controls — four axes, no status word, no export entry', () => {
    const document = renderSageDocument()
    const card = document.slice(
      document.indexOf('class="sage-card sage-run-monitor-card"'),
      document.indexOf('class="sage-plan-section"'),
    )
    expect(card).toContain('四轴')
    expect(card).toContain('各自独立')
    expect(card).toContain('不以零代替未知')
    expect(card).toContain('离线不等于运行取消、也不等于被其他设备接管')
    expect(card).toContain('折叠或关闭这个面板不会取消运行')
    expect(card).toContain('不进入普通对话同步')
    expect(card).toContain('本版无导出入口')
    const labels = (card.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</g, ''))
    expect(labels).toEqual(['收起面板', '读取运行日志', '继续读取（游标）'])
  })

  it('renders each axis on its own — steps from the projection, the rest unknown with reasons', async () => {
    const harness = await bootSagePage(monitorPayload({ state: 'running', lastTurnEnd: null, observedRecords: 4, reason: null }))
    expect(harness.node('monitor-steps').textContent).toContain('执行中')
    expect(harness.node('monitor-budget-reserved').textContent).toContain('未知≠零')
    expect(harness.node('monitor-budget-consumed').textContent).toContain('未知')
    expect(harness.node('monitor-budget-billed').textContent).toContain('未知')
    expect(harness.node('monitor-device').textContent).toContain('离线≠运行取消')
    expect(harness.node('monitor-background').textContent).toContain('面板开合不影响运行')
    expect(harness.node('monitor-context').textContent).toContain('压缩不得泄漏私有侧聊')

    harness.setPayload(monitorPayload({ state: 'idle', lastTurnEnd: 't-end', observedRecords: 6, reason: null }))
    await harness.refresh()
    expect(harness.node('monitor-steps').textContent).toContain('空闲')
  })

  it('collapsing the panel is local view state: it posts nothing and survives the poll', async () => {
    const harness = await bootSagePage(monitorPayload({ state: 'running', lastTurnEnd: null, observedRecords: 4, reason: null }))
    harness.node('monitor-toggle').dispatch('click')
    await harness.settle()
    expect(harness.node('monitor-body').hidden).toBe(true)
    expect(harness.node('monitor-toggle').textContent).toBe('展开面板')
    expect(harness.requests).toEqual([])
    await harness.refresh()
    expect(harness.node('monitor-body').hidden).toBe(true)

    harness.node('monitor-toggle').dispatch('click')
    await harness.settle()
    expect(harness.node('monitor-body').hidden).toBe(false)
    expect(harness.requests).toEqual([])
  })

  it('reads the log with a bounded cursor, appends on continue, and resets on rotation', async () => {
    const route: Record<string, unknown> = {
      state: 'read', path: 'logs/run.log', version: 'v:30', fromLine: 1, nextLine: 3,
      lines: [{ no: 1, text: '第 1 行' }, { no: 2, text: '第 2 行' }], eof: true, truncatedLines: 0, rotation: null,
    }
    const harness = await bootSagePage(monitorPayload({ state: 'idle', lastTurnEnd: null, observedRecords: 1, reason: null }), {
      '/.sage/run-log': route,
    })
    harness.node('link-matter').value = 'matter:1'
    harness.node('link-workspace').value = 'ws-1'
    harness.node('run-log-path').value = 'logs/run.log'
    harness.node('run-log-open').dispatch('click')
    await harness.settle()
    expect(harness.requests[0]).toEqual({ path: '/.sage/run-log', body: { workspaceRoot: '/Users/someone/project', path: 'logs/run.log' } })
    expect(harness.node('run-log-rows').children).toHaveLength(2)
    expect(harness.node('run-log-note').textContent).toContain('已读到第 2 行')

    // The log grew before the continue: same route object, a new page.
    Object.assign(route, { fromLine: 3, nextLine: 4, lines: [{ no: 3, text: '第 3 行' }], eof: true })
    harness.node('run-log-continue').dispatch('click')
    await harness.settle()
    expect(harness.requests[1]).toEqual({
      path: '/.sage/run-log',
      body: { workspaceRoot: '/Users/someone/project', path: 'logs/run.log', fromLine: 3, expectVersion: 'v:30' },
    })
    expect(harness.node('run-log-rows').children).toHaveLength(3)
    expect(harness.node('run-log-note').textContent).toContain('已读到第 3 行')

    // The log rotates: the route answers the marked restart, the cursor resets, nothing is guessed.
    Object.assign(route, { version: 'v:9', fromLine: 4, nextLine: 4, lines: [], rotation: 'file-rotated' })
    harness.node('run-log-continue').dispatch('click')
    await harness.settle()
    expect(harness.node('run-log-note').textContent).toContain('轮转或截断')
    expect(harness.node('run-log-note').textContent).toContain('不重复、不漏标')
    // Cursor gone: the next continue asks for a fresh open instead of reusing the void cursor.
    harness.node('run-log-continue').dispatch('click')
    await harness.settle()
    expect(harness.node('run-log-note').textContent).toContain('先「读取运行日志」')
    expect(harness.requests).toHaveLength(3)
  })
})
