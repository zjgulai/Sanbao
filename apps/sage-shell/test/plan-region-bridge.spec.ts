import { afterEach, describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload, setLinkSelection } from './support/sage-page.js'

/**
 * Batch 19 / P3 (ADR-0261 strangler): the plan card (`#plan-*`, candidate rows, step readiness
 * and the single step-execution confirmation card) is owned by the React app. The legacy script
 * publishes its region slice through `__SAGE_APP_SET_REGION__` and exposes the wire acts through
 * `__SAGE_LEGACY_ACTIONS__` (create/accept read the link-card selection here; prepare/execute
 * keep exact bodies, refusal codes and notice texts); it must not write the card's DOM anymore.
 * Rendering is pinned in `test/product-app/plan-region.spec.tsx`.
 */

interface RegionMessage {
  readonly kind: string
  readonly [key: string]: unknown
}

interface RegionSink {
  readonly byRegion: Array<{ region: string, message: RegionMessage }>
  readonly restore: () => void
}

interface LegacyActionsShape {
  createPlan?: (title: string, stepsText: string) => Promise<string | null>
  acceptPlan?: (planId: string) => Promise<void>
  prepareStep?: (planId: string, stepNo: number) => Promise<{ kind: string, card?: unknown, notice?: string }>
  executeStep?: (planId: string, stepNo: number, confirmationId: string) => Promise<{ kind: string, run?: unknown, notice?: string }>
}

let sink: RegionSink | undefined
let restoreActions: (() => void) | undefined

afterEach(() => {
  sink?.restore()
  sink = undefined
  restoreActions?.()
  restoreActions = undefined
})

function installRegionSink(): void {
  const byRegion: Array<{ region: string, message: RegionMessage }> = []
  const target = globalThis as { __SAGE_APP_SET_REGION__?: unknown }
  const previous = target.__SAGE_APP_SET_REGION__
  target.__SAGE_APP_SET_REGION__ = (region: string, message: RegionMessage): void => { byRegion.push({ region, message }) }
  sink = {
    byRegion,
    restore: () => {
      if (previous === undefined) delete target.__SAGE_APP_SET_REGION__
      else target.__SAGE_APP_SET_REGION__ = previous
    },
  }
}

function lastFor(region: string): RegionMessage | undefined {
  return sink?.byRegion.filter((entry) => entry.region === region).at(-1)?.message
}

function legacyActions(): LegacyActionsShape {
  const bridge = (globalThis as unknown as { __SAGE_LEGACY_ACTIONS__?: LegacyActionsShape }).__SAGE_LEGACY_ACTIONS__
  expect(bridge, 'legacy down-bridge must be installed at boot').toBeDefined()
  return bridge!
}

const workspaces = {
  source: 'workspace-follow', state: 'read', reason: null,
  entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
  order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
}

const plan = (overrides: Record<string, unknown> = {}) => ({
  planId: 'plan-1', matterRef: 'matter:1', title: '上架方案',
  steps: [
    { stepNo: 1, title: '备料', readiness: 'ready', readinessNote: '执行环境 ws-1 存在（逐次核验）' },
    { stepNo: 2, title: '试产', readiness: 'not-ready', readinessNote: '执行环境 ws-9 在最近折叠中不存在——重新选择或核验后再试' },
    { stepNo: 3, title: '投放', readiness: 'unknown', readinessNote: '前提未知（workspace-fold-unreadable）——按阻断处理，不派发' },
  ],
  state: 'draft', acceptedAt: null, createdAt: 'x', ...overrides,
})

const plansRead = { state: 'read', plans: [plan()], lastStepRun: null }

describe('plan region bridge (batch 19)', () => {
  it('publishes the plans slice and leaves the card DOM untouched', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({ plans: plansRead }))
    expect(lastFor('plans')).toEqual({ kind: 'read', slot: { plans: plansRead.plans, lastStepRun: null } })
    expect(page.node('plan-rows').children).toHaveLength(0)
    expect(page.node('plan-note').textContent).toBe('')
    expect(page.node('plan-step-rows').children).toHaveLength(0)
    // The fake DOM does not parse the static `hidden` attribute; the untouched field is the sentinel.
    expect(page.node('plan-step-target').textContent).toBe('')

    const down = await bootSagePage(statePayload({}))
    expect(lastFor('plans')).toEqual({ kind: 'unavailable' })
    expect(down.node('plan-rows').children).toHaveLength(0)
    expect(down.node('plan-note').textContent).toBe('')
  })

  it('keeps the ticket-032 discipline words and control roster pinned on the static first frame', () => {
    const document = renderSageDocument()
    const slice = document.slice(
      document.indexOf('class="sage-card sage-plan-card"'),
      document.indexOf('class="sage-card sage-tool-results-card"'),
    )
    expect(slice).toContain('接受方案不等于执行方案')
    expect(slice).toContain('不派发、不铸确认卡、不碰会话')
    expect(slice).toContain('安全或权限未知呈现为阻断而非失败')
    expect(slice).toContain('不就绪项不被派发')
    expect(slice).toContain('确认执行才携带一次性凭据派发')
    const labels = (slice.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</g, ''))
    expect(labels).toEqual(['形成方案（归属所选事项）', '确认执行（携带凭据）', '取消确认'])
    expect(document).toContain('id="sage-region-plans"')
  })

  it('creates a plan from the chosen matter and posts acceptance as a receipt only', async () => {
    const page = await bootSagePage(statePayload({
      workspaces,
      plans: plansRead,
      matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
    }))
    const actions = legacyActions()

    expect(await actions.createPlan!('上架方案', '备料\n试产\n投放')).toContain('先在「事项 ↔ 工作区关联」里选好事项')
    expect(page.requests).toHaveLength(0)
    setLinkSelection('matter:1', 'ws-1')
    expect(await actions.createPlan!('   ', '备料')).toContain('方案要有一个标题和至少一条步骤（每行一条）。')
    expect(await actions.createPlan!('上架方案', '   \n  ')).toContain('方案要有一个标题和至少一条步骤（每行一条）。')
    expect(page.requests).toHaveLength(0)

    expect(await actions.createPlan!('  上架方案  ', '备料\n\n 试产 \n投放\n')).toBeNull()
    await page.settle()
    expect(page.requests[0]).toEqual({
      path: '/.sage/plans',
      body: { action: 'create', matterRef: 'matter:1', title: '上架方案', steps: ['备料', '试产', '投放'] },
    })
    expect(page.node('plan-rows').children).toHaveLength(0)

    await actions.acceptPlan!('plan-1')
    await page.settle()
    expect(page.requests[1]).toEqual({ path: '/.sage/plans', body: { action: 'accept', planId: 'plan-1' } })
    expect(page.requests).toHaveLength(2)
  })

  it('prepares the single card and executes with the credential through exact bodies', async () => {
    const card = {
      confirmationId: 'cf-7', preparedAt: 't', target: { matterRef: 'matter:1', revisionRef: 'plan:plan-1:step:1' },
      action: { type: 'plan-step', scope: 'matter' },
      resources: [{ kind: 'execution-environment', ref: 'ws-1', state: 'selected' }],
      prerequisites: [{ name: 'execution-environment', state: 'met', note: 'environment-chosen' }],
      costEstimate: { state: 'unavailable', note: 'estimate-unavailable' }, effect: 'not-yet-happened',
    }
    const executedRun = { planId: 'plan-1', stepNo: 1, state: 'not-ready', code: 'step-execution-unavailable', at: 't' }
    const page = await bootSagePage(statePayload({ plans: plansRead }), {
      '/.sage/plans': (request: unknown) => (request as { action?: string }).action === 'prepare-step'
        ? { state: 'prepared', planId: 'plan-1', stepNo: 1, card }
        : { state: 'not-ready', plans: { state: 'read', plans: [plan()], lastStepRun: executedRun }, code: 'step-execution-unavailable' },
    })
    const actions = legacyActions()

    const prepared = await actions.prepareStep!('plan-1', 1)
    await page.settle()
    expect(page.requests[0]).toEqual({ path: '/.sage/plans', body: { action: 'prepare-step', planId: 'plan-1', stepNo: 1 } })
    expect(prepared.kind).toBe('prepared')
    expect(prepared.card).toEqual(card)

    const executed = await actions.executeStep!('plan-1', 1, 'cf-7')
    await page.settle()
    expect(page.requests[1]).toEqual({
      path: '/.sage/plans',
      body: { action: 'execute-step', planId: 'plan-1', stepNo: 1, confirmationId: 'cf-7' },
    })
    // The response carries the same projection the poll serves: the run comes from there.
    expect(executed.kind).toBe('run')
    expect(executed.run).toEqual(executedRun)
  })

  it('keeps blocked steps and unwired stores honest through the down-bridge', async () => {
    const page = await bootSagePage(statePayload({ plans: plansRead }), {
      '/.sage/plans': (request: unknown) => {
        const body = request as { action?: string }
        if (body.action === 'prepare-step') return { state: 'refused', code: 'step-premise-unknown' }
        return { state: 'refused', code: 'plans-unavailable' }
      },
    })
    const actions = legacyActions()

    const refused = await actions.prepareStep!('plan-1', 2)
    expect(refused.kind).toBe('notice')
    expect(refused.notice).toBe('这一步的前提未知：按阻断处理，不派发（不铸卡）。')

    const unwired = await actions.executeStep!('plan-1', 1, 'cf-7')
    expect(unwired.kind).toBe('notice')
    expect(unwired.notice).toBe('这一版还没有接上方案存储：没有派发，也不消耗确认。')
  })
})
