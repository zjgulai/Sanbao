import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 048 on the shipped page (US-223/224): submit sends exactly the typed text plus the
 * structured diagnostics (with the service's correlation), the receipt distinguishes 已接收 from
 * 结果未知, an unknown offers ONLY 核对同一提交 (which submits nothing), and an unwired
 * destination says 缺项 instead of pretending a submission.
 */

const payload = (feedback: unknown, correlation = 'corr-048') => statePayload({
  service: { status: 'unavailable', reason: 'authenticated', correlation, auth: { status: 'signed-out', displayName: null }, command: null },
  feedback,
})

describe('the feedback entry (ticket 048)', () => {
  it('submits exactly text + code/stage + the service correlation — one named request, no attachments', async () => {
    const harness = await bootSagePage(payload({ state: 'read', receipts: [] }), {
      '/.sage/feedback': { state: 'accepted', requestId: 'fb-1', at: 't', code: null },
    })
    await harness.refresh()
    expect(harness.node('feedback-note').textContent).toContain('不自动附日志、原始堆栈、机器路径或凭据')
    harness.node('feedback-text').value = '保存按钮点了没反应'
    harness.node('feedback-code').value = 'E-102'
    harness.node('feedback-stage').value = 'draft-save'
    harness.node('feedback-submit').dispatch('click', { target: harness.node('feedback-submit') })
    await harness.settle()
    expect(harness.requests).toEqual([{
      path: '/.sage/feedback',
      body: { action: 'submit', text: '保存按钮点了没反应', code: 'E-102', stage: 'draft-save', correlation: 'corr-048' },
    }])
    expect(harness.node('feedback-note').textContent).toContain('已接收：反馈只含你写的文本与结构化诊断（不含日志、堆栈、机器路径或凭据）。')
  })

  it('结果未知 offers ONLY 核对同一提交 — verify submits nothing, and no repeat submission exists', async () => {
    const harness = await bootSagePage(payload({ state: 'read', receipts: [] }), {
      '/.sage/feedback': (body: unknown) => (
        (body as { action?: string }).action === 'submit'
          ? { state: 'unknown', requestId: 'fb-9', at: 't', code: 'feedback-transport-failed' }
          : { state: 'unknown', requestId: 'fb-9', at: 't', code: 'feedback-transport-failed' }
      ),
    })
    await harness.refresh()
    harness.node('feedback-text').value = '一次未知提交'
    harness.node('feedback-submit').dispatch('click', { target: harness.node('feedback-submit') })
    await harness.settle()
    expect(harness.node('feedback-note').textContent).toContain('结果未知：本次提交已记录待核对——请用[核对同一提交]，不要重复提交。')

    // The recorded receipt row carries the verify entry; the projection also renders it.
    harness.setPayload(payload({ state: 'read', receipts: [{ state: 'unknown', requestId: 'fb-9', at: 't', code: 'feedback-transport-failed' }] }))
    await harness.refresh()
    const rows = harness.node('feedback-receipts').children
    const verify = rows[0]?.querySelector('[data-feedback-verify]')
    expect(verify).not.toBeNull()
    expect(rows[0]?.textContent).toContain('结果未知：fb-9——只给核对，不重复提交。')

    harness.node('feedback-receipts').dispatch('click', { target: verify })
    await harness.settle()
    // Exactly two requests: the one submit and the one verify — never a second submit.
    expect(harness.requests).toEqual([
      { path: '/.sage/feedback', body: { action: 'submit', text: '一次未知提交', correlation: 'corr-048' } },
      { path: '/.sage/feedback', body: { action: 'verify', requestId: 'fb-9' } },
    ])
    expect(harness.node('feedback-note').textContent).toContain('已核对：同一提交的回执仍为「结果未知」（没有重复提交）。')
  })

  it('an unwired destination says 缺项 by name instead of pretending a submission', async () => {
    const harness = await bootSagePage(payload({ state: 'read', receipts: [] }), {
      '/.sage/feedback': { state: 'unavailable', requestId: null, at: null, code: 'feedback-sink-unavailable' },
    })
    await harness.refresh()
    harness.node('feedback-text').value = 'x'
    harness.node('feedback-submit').dispatch('click', { target: harness.node('feedback-submit') })
    await harness.settle()
    expect(harness.node('feedback-note').textContent).toContain('未接线：反馈接收端口缺项（feedback-sink-unavailable）；未提交。')
  })
})
