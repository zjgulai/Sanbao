import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 043 on the shipped page (US-203/204): the terminal block lists live sessions read-only;
 * opening the output is one bounded page read (a run observation) while closing is purely local —
 * a run is never affected; the output never lands in the conversation transcript; an unavailable
 * capability shows its missing item instead of an empty terminal; and the block accepts no input.
 */

const session = (overrides: Record<string, unknown> = {}) => ({
  terminalId: 't-1', name: '构建', type: 'bash', status: { kind: 'running' },
  ...overrides,
})

const terminal = (overrides: Record<string, unknown> = {}) => ({
  state: 'read', reason: null, terminals: [session(), session({ terminalId: 't-2', name: '服务', status: { kind: 'exited', exitCode: 1, signal: null } })],
  ...overrides,
})

const payload = (term: unknown) => statePayload({
  matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
  workspaces: {
    source: 'workspace-follow', state: 'read', reason: null,
    entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
    order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
  },
  sessionChannel: {
    state: 'read', sessionId: 'sess-1', execution: 'executing', lastTurnEnd: null,
    transcript: [{ role: 'user', text: '把《增长复盘》按渠道拆分再讲一遍', source: 'echo', at: 't', attachments: [], messageRef: 'req-1' }],
    reconciled: true, streamBroken: false, code: null, records: 3, unapplied: 0, paused: false, pending: [],
    queue: { state: 'read', occurrences: [] },
    reply: null,
  },
  sessionClarifications: { state: 'read', pending: [], deferred: [], receipts: [], code: null, at: null },
  terminal: term,
})

describe('the terminal block (ticket 043)', () => {
  it('lists sessions read-only; opening the output is exactly one bounded page read', async () => {
    const harness = await bootSagePage(payload(terminal()), {
      '/.sage/session/terminal-read': { state: 'read', text: '构建输出文本x\n第二行', totalLines: 2, lineBegin: 0, lineEnd: 2, truncated: false },
    })
    await harness.refresh()
    const rows = harness.node('terminal-rows').children
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('构建 · bash')
    expect(rows[0]?.textContent).toContain('运行中')
    expect(rows[1]?.textContent).toContain('已退出（exitCode 1）')
    expect(harness.node('terminal-note').textContent).toContain('终端 2 项（只读运行观察；打开/关闭面板不影响执行）。')

    harness.node('terminal-rows').dispatch('click', { target: rows[0]?.querySelector('[data-terminal-open]') })
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/session/terminal-read', body: { terminalId: 't-1' } }])
    expect(harness.node('terminal-output').hidden).toBe(false)
    expect(harness.node('terminal-output').textContent).toContain('构建输出文本x')
    expect(harness.node('terminal-output-note').textContent).toContain('只读运行观察（第 0–2 行 / 共 2 行）')
    expect(harness.node('terminal-output-note').textContent).toContain('不进对话历史、不作交付产物，也不接收操作输入')
  })

  it('closing is purely local — no further request, and the session row (the run state) is unchanged', async () => {
    const harness = await bootSagePage(payload(terminal()), {
      '/.sage/session/terminal-read': { state: 'read', text: 'x', totalLines: 1, lineBegin: 0, lineEnd: 1, truncated: false },
    })
    await harness.refresh()
    const rows = harness.node('terminal-rows').children
    const rowTextBefore = rows[0]?.textContent ?? ''
    harness.node('terminal-rows').dispatch('click', { target: rows[0]?.querySelector('[data-terminal-open]') })
    await harness.settle()
    expect(harness.requests).toHaveLength(1)
    // Re-open state shows 关闭输出; click again to close — zero new requests, output hidden.
    const toggled = harness.node('terminal-rows').children[0]?.querySelector('[data-terminal-open]')
    expect(toggled?.textContent).toContain('关闭输出')
    harness.node('terminal-rows').dispatch('click', { target: toggled })
    await harness.settle()
    expect(harness.requests).toHaveLength(1)
    expect(harness.node('terminal-output').hidden).toBe(true)
    expect(harness.node('terminal-output-note').textContent).toContain('已关闭输出面板（纯本地；运行不受影响）。')
    expect(harness.node('terminal-rows').children[0]?.textContent).toContain('运行中')
    expect(harness.node('terminal-rows').children[0]?.textContent?.replace('关闭输出', '打开输出（只读）')).toContain(rowTextBefore.replace('关闭输出', '打开输出（只读）'))
  })

  it('terminal output never lands in the conversation transcript', async () => {
    const harness = await bootSagePage(payload(terminal()), {
      '/.sage/session/terminal-read': { state: 'read', text: 'SECRET-TERMINAL-输出', totalLines: 1, lineBegin: 0, lineEnd: 1, truncated: false },
    })
    await harness.refresh()
    const transcriptBefore = harness.node('session-transcript').children.length
    harness.node('terminal-rows').dispatch('click', { target: harness.node('terminal-rows').children[0]?.querySelector('[data-terminal-open]') })
    await harness.settle()
    expect(harness.node('terminal-output').textContent).toContain('SECRET-TERMINAL-输出')
    expect(harness.node('session-transcript').children.length).toBe(transcriptBefore)
    expect(harness.node('session-transcript').textContent).not.toContain('SECRET-TERMINAL-输出')
  })

  it('an unavailable capability shows its missing item instead of an empty terminal — and the block takes no input', async () => {
    const harness = await bootSagePage(payload({ state: 'unavailable', reason: 'terminals-provider-unavailable', terminals: [] }))
    await harness.refresh()
    expect(harness.node('terminal-note').textContent).toContain('未就绪：终端能力不可用（terminals-provider-unavailable）——缺项未满足，不显示空终端。')
    expect(harness.node('terminal-rows').children).toHaveLength(0)

    // 不接收权威动作输入：the block's static markup carries no input/textarea/select at all.
    const doc = renderSageDocument()
    const start = doc.indexOf('集成终端')
    expect(start).toBeGreaterThan(0)
    // The block runs from its label to the next control tag (the session input that follows it).
    const end = doc.indexOf('<textarea', start)
    expect(end).toBeGreaterThan(start)
    const slice = doc.slice(start, end)
    expect(slice).not.toContain('<input')
    expect(slice).not.toContain('<textarea')
    expect(slice).not.toContain('<select')
  })
})
