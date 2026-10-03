import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload, type FakeElement } from './support/sage-page.js'

/**
 * Ticket 032 on the shipped page (US-165~171).
 *
 * The plan card keeps acceptance and dispatch apart; blocked steps render without any execution
 * entry; the exit checklist composes real projection facts with the page's true unsaved edits;
 * and the guide/environment cards stay read-only with nothing to write.
 */

const workspaces = {
  source: 'workspace-follow', state: 'read', reason: null,
  entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
  order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
}

const draft = (overrides: Record<string, unknown> = {}) => ({
  draftId: 'draft-1',
  fields: { goal: '', deliverable: '', responsibility: '', projectRef: '' },
  clarification: '', history: [], status: 'editing', matterRef: null, attempt: null, complete: true,
  createdAt: 'x', updatedAt: 'x', ...overrides,
})

const plan = (overrides: Record<string, unknown> = {}) => ({
  planId: 'plan-1', matterRef: 'matter:1', title: '上架方案',
  steps: [
    { stepNo: 1, title: '备料', readiness: 'ready', readinessNote: '执行环境 ws-1 存在（逐次核验）' },
    { stepNo: 2, title: '试产', readiness: 'not-ready', readinessNote: '执行环境 ws-9 在最近折叠中不存在——重新选择或核验后再试' },
    { stepNo: 3, title: '投放', readiness: 'unknown', readinessNote: '前提未知（workspace-fold-unreadable）——按阻断处理，不派发' },
  ],
  state: 'draft', acceptedAt: null, createdAt: 'x', ...overrides,
})

const payload = (plans: unknown, channel: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => statePayload({
  workspaces,
  matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
  draft: { state: 'unlocked', drafts: [draft()] },
  runtime: { status: 'ready', message: 'dsh 0.2.0-rc.2', retryable: true },
  sessionChannel: {
    state: 'read', sessionId: 'sess-1', execution: 'idle', lastTurnEnd: null, transcript: [], reconciled: false,
    streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [], ...channel,
  },
  plans,
  ...extra,
})

const setContext = (harness: Awaited<ReturnType<typeof bootSagePage>>) => {
  harness.node('link-matter').value = 'matter:1'
  harness.node('link-workspace').value = 'ws-1'
}

describe('the plan card (ticket 032)', () => {
  it('states the discipline in its own words', () => {
    const document = renderSageDocument()
    const card = document.slice(
      document.indexOf('class="sage-card sage-plan-card"'),
      // 033 inserted D10 between the plan card and the matter layout — keep the slice exact.
      document.indexOf('class="sage-card sage-tool-results-card"'),
    )
    expect(card).toContain('接受方案不等于执行方案')
    expect(card).toContain('不派发、不铸确认卡、不碰会话')
    expect(card).toContain('安全或权限未知呈现为阻断而非失败')
    expect(card).toContain('不就绪项不被派发')
    expect(card).toContain('确认执行才携带一次性凭据派发')
  })

  it('creates a plan from the chosen matter and posts acceptance as a receipt only', async () => {
    const harness = await bootSagePage(payload({ state: 'read', plans: [plan()], lastStepRun: null }))
    // The create reads the chosen matter from the 011 select; every poll re-derives it, so pick it
    // right before the click.
    setContext(harness)
    harness.node('plan-title').value = '上架方案'
    harness.node('plan-steps').value = '备料\n试产\n投放'
    harness.node('plan-create').dispatch('click')
    await harness.settle()
    expect(harness.requests[0]).toEqual({
      path: '/.sage/plans',
      body: { action: 'create', matterRef: 'matter:1', title: '上架方案', steps: ['备料', '试产', '投放'] },
    })

    const row = harness.node('plan-rows').children[0]!
    const acceptButton = row.querySelector('[data-plan-action="accept"]')!
    harness.node('plan-rows').dispatch('click', { target: acceptButton })
    await harness.settle()
    // Acceptance is exactly one request and nothing else — no prepare, no execute.
    expect(harness.requests[1]).toEqual({ path: '/.sage/plans', body: { action: 'accept', planId: 'plan-1' } })
    expect(harness.requests).toHaveLength(2)
  })

  it('renders readiness honestly and gives blocked steps no execution entry', async () => {
    const harness = await bootSagePage(payload({ state: 'read', plans: [plan()], lastStepRun: null }))
    const steps = harness.node('plan-step-rows').children
    expect(steps).toHaveLength(3)
    expect(steps[0]?.textContent).toContain('就绪')
    expect(steps[1]?.textContent).toContain('未就绪（阻断——不派发）')
    expect(steps[2]?.textContent).toContain('未知（阻断——不派发）')
    // Only the ready step has a prepare entry — a blocked step cannot be dispatched at all.
    expect(steps[0]?.querySelector('[data-plan-action="prepare-step"]')).not.toBeNull()
    expect(steps[1]?.querySelector('[data-plan-action="prepare-step"]')).toBeNull()
    expect(steps[2]?.querySelector('[data-plan-action="prepare-step"]')).toBeNull()
  })

  it('prepares the single card, executes with the credential, and reads the result from the projection', async () => {
    const card = {
      confirmationId: 'cf-7', preparedAt: 't', target: { matterRef: 'matter:1', revisionRef: 'plan:plan-1:step:1' },
      action: { type: 'plan-step', scope: 'matter' },
      resources: [{ kind: 'execution-environment', ref: 'ws-1', state: 'selected' }],
      prerequisites: [{ name: 'execution-environment', state: 'met', note: 'environment-chosen' }],
      costEstimate: { state: 'unavailable', note: 'estimate-unavailable' }, effect: 'not-yet-happened',
    }
    const executedRun = { planId: 'plan-1', stepNo: 1, state: 'not-ready', code: 'step-execution-unavailable', at: 't' }
    const harness = await bootSagePage(payload({ state: 'read', plans: [plan()], lastStepRun: null }), {
      // One route, two actions: prepare mints the card; execute answers the production shape —
      // the refusal with the run carried in the same projection the poll serves.
      '/.sage/plans': (request: unknown) => (request as { action?: string }).action === 'prepare-step'
        ? { state: 'prepared', planId: 'plan-1', stepNo: 1, card }
        : { state: 'not-ready', plans: { state: 'read', plans: [plan()], lastStepRun: executedRun }, code: 'step-execution-unavailable' },
    })
    const stepRow = harness.node('plan-step-rows').children[0]!
    const prepare = stepRow.querySelector('[data-plan-action="prepare-step"]')!
    harness.node('plan-step-rows').dispatch('click', { target: prepare })
    await harness.settle()
    expect(harness.requests[0]).toEqual({ path: '/.sage/plans', body: { action: 'prepare-step', planId: 'plan-1', stepNo: 1 } })
    expect(harness.node('plan-step-card').hidden).toBe(false)
    expect(harness.node('plan-step-target').textContent).toContain('plan:plan-1:step:1')
    expect(harness.node('plan-step-prereq').textContent).toContain('已满足')

    harness.node('plan-step-execute').dispatch('click')
    await harness.settle()
    expect(harness.requests[1]).toEqual({
      path: '/.sage/plans',
      body: { action: 'execute-step', planId: 'plan-1', stepNo: 1, confirmationId: 'cf-7' },
    })
    expect(harness.node('plan-step-card').hidden).toBe(true)

    // The durable run lives in the projection: the next poll carries it and the page reads the
    // sentence from there — no local notice masking it, no fabricated completion.
    harness.setPayload(payload({
      state: 'read',
      plans: [plan({ state: 'accepted', acceptedAt: 't-accept' })],
      lastStepRun: executedRun,
    }))
    await harness.refresh()
    expect(harness.node('plan-step-result').textContent).toContain('未接线')
    expect(harness.node('plan-step-result').textContent).toContain('不消耗确认')
    expect(harness.node('plan-step-result').textContent).not.toContain('已结算')
  })
})

describe('the exit checklist, guide and environment cards (ticket 032)', () => {
  it('lists real impact facts including true unsaved edits, and cancel posts nothing', async () => {
    const harness = await bootSagePage(payload(
      { state: 'read', plans: [], lastStepRun: null },
      { execution: 'executing', pending: [{ itemId: 'p-1', text: '补充要求', state: 'pending', note: null, editable: true }] },
    ))
    // A true unsaved edit: the typed goal differs from the projection.
    harness.node('draft-goal').value = '还没保存的新目标'
    harness.node('exit-check-open').dispatch('click')
    await harness.settle()
    const rows = harness.node('exit-impact-rows').children.map((row) => row.textContent)
    expect(rows.join('\n')).toContain('进行中任务')
    expect(rows.join('\n')).toContain('待继续输入 1 条')
    expect(rows.join('\n')).toContain('未保存的改动（目标）')

    harness.node('exit-cancel').dispatch('click')
    await harness.settle()
    expect(harness.node('exit-dialog').hidden).toBe(true)
    expect(harness.requests).toEqual([])
  })

  it('stop requests the session stop and never claims the remote outcome is known', async () => {
    const harness = await bootSagePage(payload({ state: 'read', plans: [], lastStepRun: null }, { execution: 'executing' }))
    harness.node('exit-check-open').dispatch('click')
    await harness.settle()
    // The 011 select is re-derived by every poll; pick the matter right before the stop click.
    setContext(harness)
    harness.node('exit-stop').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/session/stop', body: { matterRef: 'matter:1' } }])
    expect(harness.node('exit-note').textContent).toContain('不能承诺撤回')
    expect(harness.node('exit-note').textContent).toContain('不等于远端效果已知')
  })

  it('the guide toggles locally with zero requests and the environment card stays read-only', async () => {
    const document = renderSageDocument()
    const slice = document.slice(document.indexOf('class="sage-card sage-exit-card"'), document.indexOf('id="panel-settings"'))
    const labels = (slice.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</g, ''))
    expect(labels).toEqual(['退出 Sage…（先看影响清单）', '取消（保持后台运行）', '停止进行中的任务并标记可退出', '展开要点'])
    for (const word of ['装配', '远端执行', '接管']) expect(labels.join('|'), word).not.toContain(word)
    expect(slice).toContain('引导不替代登录与授权、不自动修改任何配置')
    expect(slice).toContain('实验不直通生产')

    const harness = await bootSagePage(payload({ state: 'read', plans: [], lastStepRun: null }))
    const guideHidden = harness.node('guide-rows').hidden
    harness.node('guide-toggle').dispatch('click')
    await harness.settle()
    expect(harness.node('guide-rows').hidden).toBe(!guideHidden)
    expect(harness.requests).toEqual([])
    expect(harness.node('env-runtime').textContent).toContain('dsh 0.2.0-rc.2')
    expect(harness.node('env-matter-ref').textContent).toContain('ws-1')
    expect(harness.node('env-fold').textContent).toContain('已读取')
  })
})
