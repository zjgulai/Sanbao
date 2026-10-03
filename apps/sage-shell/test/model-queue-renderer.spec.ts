import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 042 on the shipped page (US-200~202): the model-queue block shows the three service-fact
 * states (排队等待 / 重试进行中 / 已恢复) in their own vocabulary — never merged with the error
 * three-state, never counting down a UI timer; an unresolved wait is 结果未知 with a re-read entry
 * only; and every path is a zero-request read (排队与重试不重复提交).
 */

const retry = (overrides: Record<string, unknown> = {}) => ({
  retryId: 'r-1', turn: 2, attempt: 1, maxAttempts: 3, delayMs: 2000,
  provider: 'deepseek', failureCode: 'rate_limited', started: false,
  ...overrides,
})

const queue = (overrides: Record<string, unknown> = {}) => ({
  state: 'read', verdict: 'waiting', retries: [retry()], verifyOnly: false, reason: null, at: null,
  ...overrides,
})

const payload = (modelQueue: unknown) => statePayload({
  matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
  workspaces: {
    source: 'workspace-follow', state: 'read', reason: null,
    entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
    order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
  },
  sessionChannel: {
    state: 'read', sessionId: 'sess-1', execution: 'executing', lastTurnEnd: null, transcript: [], reconciled: false,
    streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [],
    queue: { state: 'read', occurrences: [] },
    reply: null,
  },
  sessionClarifications: { state: 'read', pending: [], deferred: [], receipts: [], code: null, at: null },
  modelQueue,
})

describe('the model-queue block (ticket 042)', () => {
  it('shows the waiting state from service facts — the delay is the service schedule, not a countdown', async () => {
    const harness = await bootSagePage(payload(queue()))
    await harness.refresh()
    const note = harness.node('model-queue-note').textContent
    expect(note).toContain('排队等待恢复（第 1/3 次，全部为服务事实）')
    expect(note).toContain('服务端安排 2000 ms 后继续')
    expect(note).toContain('原因 rate_limited')
    expect(note).toContain('不用界面倒计时')
    // The error three-state vocabulary must not leak into the queue states.
    expect(note).not.toContain('请重试')
    expect(note).not.toContain('确定失败')
    const rows = harness.node('model-queue-rows').children
    expect(rows[0]?.textContent).toContain('第 1/3 次 · 服务端延迟 2000 ms')
    expect(rows[0]?.textContent).toContain('提供方：deepseek · 原因：rate_limited')
    expect(rows[0]?.textContent).toContain('等待中（服务端安排）')
    expect(harness.requests).toEqual([])
  })

  it('shows retrying and ready with their own sentences — no повторная submission affordance anywhere', async () => {
    const retrying = await bootSagePage(payload(queue({ verdict: 'retrying', retries: [retry({ started: true })] })))
    await retrying.refresh()
    expect(retrying.node('model-queue-note').textContent).toContain('重试进行中（第 1/3 次 尝试已开始）')
    expect(retrying.node('model-queue-note').textContent).toContain('不是失败，也不是需要重复提交')
    expect(retrying.node('model-queue-rows').children[0]?.textContent).toContain('尝试已开始')

    const ready = await bootSagePage(payload(queue({ verdict: 'ready', retries: [retry({ started: true })] })))
    await ready.refresh()
    expect(ready.node('model-queue-note').textContent).toContain('已恢复（就绪）：重试等待成功后本轮已有输出（服务事实：llm/retry-started + 消息）')
    expect(ready.requests).toEqual([])
  })

  it('an unresolved wait is 结果未知 with only the re-read entry — zero requests, no retry', async () => {
    const harness = await bootSagePage(payload(queue({ verdict: 'unknown', verifyOnly: true, reason: 'model-queue-unresolved' })))
    await harness.refresh()
    const note = harness.node('model-queue-note').textContent
    expect(note).toContain('结果未知：该等待所在轮次已结束且未见恢复证据——只给核对（重新读取），不给重试。')
    expect(note).not.toContain('请重试')
    const rows = harness.node('model-queue-rows').children
    const verify = rows[rows.length - 1]?.querySelector('[data-model-queue-verify]')
    expect(verify).not.toBeNull()
    harness.node('model-queue-rows').dispatch('click', { target: verify })
    await harness.settle()
    expect(harness.requests).toEqual([])
    expect(harness.node('model-queue-note').textContent).toContain('核对=只读，不会重复提交任何请求')
  })

  it('keeps an unwired block honest instead of an empty idle claim', async () => {
    const harness = await bootSagePage(payload({ state: 'unavailable', verdict: 'idle', retries: [], verifyOnly: false, reason: 'model-queue-provider-unavailable', at: null }))
    await harness.refresh()
    expect(harness.node('model-queue-note').textContent).toContain('未核验：模型排队读取端口未接线（model-queue-provider-unavailable）；不以空状态冒充。')
    expect(harness.node('model-queue-rows').children).toHaveLength(0)
  })
})
