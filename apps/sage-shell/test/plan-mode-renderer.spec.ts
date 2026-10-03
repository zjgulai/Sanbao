import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 039 on the shipped page (US-192~194): the mode bar shows the projection's ACTUAL mode
 * (a queued selection is marked "next step", never rendered as already switched); the switch is
 * one named POST; receipts distinguish applied / pending / unchanged; leaving plan mode never
 * implies the plan was executed; and a plan-review question renders its plan as a preview while
 * the acceptance note says it is not execution.
 */

const planMode = (overrides: Record<string, unknown> = {}) => ({
  state: 'read', reason: null, active: false, pending: false,
  ...overrides,
})

const payload = (extra: Record<string, unknown> = {}) => statePayload({
  sessionChannel: {
    state: 'read', sessionId: 'sess-1', execution: 'idle', lastTurnEnd: null, transcript: [], reconciled: false,
    streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [],
    queue: { state: 'read', occurrences: [] },
    reply: null,
  },
  sessionClarifications: { state: 'read', pending: [], deferred: [], receipts: [], code: null, at: null },
  inputSelections: { state: 'read', skills: [], skillsNote: null, plugins: [], pluginsNote: null, selected: [], code: null, at: null },
  sessionPlanMode: planMode(),
  ...extra,
})

const planReviewCard = () => ({
  requestId: 'req-plan-1',
  questions: [{
    questionId: 'plan-review',
    question: '审阅这份方案：是否通过？',
    header: '方案审阅',
    detail: '# 增长复盘方案\n1. 按渠道拆分\n2. 对照基线给出结论',
    options: [{ label: 'Approve', description: null }, { label: '继续完善', description: null }],
    multiSelect: false,
    intentKind: 'plan-review',
    approveLabel: 'Approve',
  }],
  run: { runSeq: 7, turn: 3 },
  raisedAt: 't',
})

describe('the plan/goal mode bar (ticket 039)', () => {
  it('shows the actual mode, switches with one named POST, and only then shows the new mode', async () => {
    const harness = await bootSagePage(payload(), {
      '/.sage/session/plan-mode': {
        state: 'settled', outcome: 'committed', family: 'applied',
        view: { active: true, pending: false }, viewCode: null, at: 't',
      },
    })
    await harness.refresh()
    // Actual mode = 目标：目标按钮标"当前"，计划按钮既不当前也不待生效。
    expect(harness.node('plan-mode-goal').textContent).toContain('目标模式（当前）')
    expect(harness.node('plan-mode-goal').dataset.planModeState).toBe('active')
    expect(harness.node('plan-mode-plan').textContent).toBe('计划模式')
    expect(harness.node('plan-mode-plan').dataset.planModeState).toBe('idle')
    expect(harness.node('plan-mode-note').textContent).toContain('当前：目标模式。')

    harness.node('plan-mode-bar').dispatch('click', { target: harness.node('plan-mode-plan') })
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/session/plan-mode', body: { active: true } }])
    // 回执三态之一：已生效。
    expect(harness.node('plan-mode-note').textContent).toContain('已切换：计划模式已生效')

    // 投影随后跟到：实际模式切到计划。
    harness.setPayload(payload({ sessionPlanMode: planMode({ active: true }) }))
    await harness.refresh()
    expect(harness.node('plan-mode-plan').textContent).toContain('计划模式（当前）')
    expect(harness.node('plan-mode-goal').textContent).toBe('目标模式')
  })

  it('a queued selection is never shown as switched: the actual mode stays marked and the target says next-step', async () => {
    const harness = await bootSagePage(payload(), {
      '/.sage/session/plan-mode': {
        state: 'settled', outcome: 'queued', family: 'pending',
        view: { active: false, pending: true }, viewCode: null, at: 't',
      },
    })
    await harness.refresh()
    harness.node('plan-mode-bar').dispatch('click', { target: harness.node('plan-mode-plan') })
    await harness.settle()
    expect(harness.node('plan-mode-note').textContent).toContain('切换已登记：将在下一步生效；当前实际模式不变')

    harness.setPayload(payload({ sessionPlanMode: planMode({ active: false, pending: true }) }))
    await harness.refresh()
    // 实际仍为目标（当前）；计划只标"下一步生效"——绝不显示为已切换。
    expect(harness.node('plan-mode-goal').textContent).toContain('目标模式（当前）')
    expect(harness.node('plan-mode-plan').textContent).toContain('计划模式（下一步生效）')
    expect(harness.node('plan-mode-plan').textContent).not.toContain('（当前）')
  })

  it('leaving plan mode never implies the plan was executed, and unchanged receipts say so plainly', async () => {
    const harness = await bootSagePage(payload({ sessionPlanMode: planMode({ active: true }) }), {
      '/.sage/session/plan-mode': {
        state: 'settled', outcome: 'committed', family: 'applied',
        view: { active: false, pending: false }, viewCode: null, at: 't',
      },
    })
    await harness.refresh()
    expect(harness.node('plan-mode-plan').textContent).toContain('计划模式（当前）')
    harness.node('plan-mode-bar').dispatch('click', { target: harness.node('plan-mode-goal') })
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/session/plan-mode', body: { active: false } }])
    const note = harness.node('plan-mode-note').textContent
    expect(note).toContain('退出不等于方案已执行')
    expect(note).not.toContain('已执行：')
  })

  it('keeps unreadable and sessionless states honest, and a refusal never reads as settled', async () => {
    const unwired = await bootSagePage(payload({ sessionPlanMode: planMode({ state: 'unavailable', reason: 'plan-mode-provider-unavailable', active: null }) }))
    await unwired.refresh()
    expect(unwired.node('plan-mode-note').textContent).toContain('未核验：模式状态未接线（plan-mode-provider-unavailable）')
    expect(unwired.node('plan-mode-goal').disabled).toBe(true)
    expect(unwired.node('plan-mode-plan').disabled).toBe(true)
    expect(unwired.requests).toEqual([])

    const noSession = await bootSagePage(payload({ sessionPlanMode: planMode({ state: 'no-session', active: null }) }))
    await noSession.refresh()
    expect(noSession.node('plan-mode-note').textContent).toContain('还没有会话：没有可切换的模式状态')

    const refused = await bootSagePage(payload(), {
      '/.sage/session/plan-mode': { state: 'refused', code: 'bridge-session-not-live' },
    })
    await refused.refresh()
    refused.node('plan-mode-bar').dispatch('click', { target: refused.node('plan-mode-plan') })
    await refused.settle()
    expect(refused.node('plan-mode-note').textContent).toContain('切换未生效（bridge-session-not-live）：不重复提交。')
    expect(refused.node('plan-mode-note').textContent).not.toContain('已切换')
  })

  it('renders a plan-review question as a plan preview whose acceptance note is not execution', async () => {
    const harness = await bootSagePage(payload({
      sessionClarifications: { state: 'read', pending: [planReviewCard()], deferred: [], receipts: [], code: null, at: 't' },
    }))
    await harness.refresh()
    const cards = harness.node('clarification-cards').children
    expect(cards).toHaveLength(1)
    const preview = cards[0]?.querySelector('[data-plan-review-preview]')
    expect(preview).not.toBeNull()
    expect(preview?.textContent).toContain('# 增长复盘方案')
    expect(preview?.textContent).toContain('按渠道拆分')
    expect(cards[0]?.textContent).toContain('方案预览：接受方案不等于执行其中动作')
    expect(cards[0]?.textContent).toContain('确认意图：plan-review（通过=Approve）')
    // 回答机制不变：仍是同一张卡的提交入口（不因方案预览另开旁路）。
    expect(cards[0]?.querySelector('[data-clarification-submit="req-plan-1"]')).not.toBeNull()
  })
})
