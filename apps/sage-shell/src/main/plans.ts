/** Ticket 032 (US-165~167): the plan as a deliverable — the Sage-owned plan record, its step
 *  readiness, and the two-stage step dispatch that rides the shared confirmation store.
 *
 * The rules the ticket names:
 *
 * - **Accepting a plan is a receipt of the deliverable, nothing more.** `accept` records the
 *   acceptance; it never dispatches, never mints a confirmation, never touches the session. The
 *   only way a step runs is its own prepared card, consumed exactly once (the US-124 machinery).
 * - **Readiness is judged per action premise, and unknown blocks.** A premise that cannot be
 *   read is `unknown` → blocked (安全或权限未知呈现为阻断而非失败); a not-ready or unknown step
 *   refuses `prepare` before any card exists, so 不就绪项不被派发 is structural.
 * - **Execution re-checks freshness.** `execute` re-derives readiness and rebuilds the exact
 *   intent before consuming the credential; the production executor is unwired (fail-closed),
 *   answering not-ready instead of pretending a run.
 */
import type {
  ActionConfirmationCard,
  ActionConfirmationFacts,
  ActionConfirmationStore,
} from '../appservice/action-confirmations.js'
import type { SageActionIntentV2 } from '../appservice/command-contracts.js'
import type {
  PlanOutcome,
  PlanStepExecuteOutcome,
  PlanStepOutcome,
  PlanStepRunView,
  PlanStepView,
  PlanView,
  PlansStatus,
} from '../appservice/contracts.js'

const MAX_STEPS = 12
const MAX_TITLE = 200
const MAX_PLANS = 64

export interface PlanPremiseReading {
  readonly state: 'read' | 'unavailable'
  /** The matter's chosen execution environment now; null = none chosen (not "unknown"). */
  readonly environmentRef: string | null
  /** Whether the chosen environment still exists in the latest successful fold; null = not read. */
  readonly environmentPresent: boolean | null
  readonly reason: string | null
}

export interface PlanStepExecution {
  readonly receiptRef: string
}

export interface PlansDeps {
  readonly now: () => string
  readonly nextId: () => string
  /** The readiness facts, read fresh from the 011 home (matter links + the live workspace fold). */
  readonly premises: (matterRef: string) => PlanPremiseReading
  readonly confirmations: {
    readonly store: ActionConfirmationStore
    readonly facts: (intent: SageActionIntentV2) => ActionConfirmationFacts
  }
  /** The only step-execution path. Production leaves it unwired: a confirmed step answers
   *  not-ready (the fail-closed pipeline owns real execution). */
  readonly executeStep?: (intent: SageActionIntentV2) => Promise<PlanStepExecution | { readonly outcome: 'unknown', readonly code: string } | { readonly denied: string }>
}

export interface PlansStore {
  readonly list: () => PlansStatus
  readonly create: (request: { readonly matterRef: string, readonly title: string, readonly steps: readonly string[] }) => PlanOutcome
  readonly accept: (request: { readonly planId: string }) => PlanOutcome
  readonly prepareStep: (request: { readonly planId: string, readonly stepNo: number }) => PlanStepOutcome
  readonly executeStep: (request: { readonly planId: string, readonly stepNo: number, readonly confirmationId?: string }) => Promise<PlanStepExecuteOutcome>
}

interface PlanRecord {
  readonly planId: string
  readonly matterRef: string
  readonly title: string
  readonly steps: readonly { readonly stepNo: number, readonly title: string }[]
  state: 'draft' | 'accepted'
  acceptedAt: string | null
  readonly createdAt: string
}

interface PendingStepRecord {
  readonly planId: string
  readonly stepNo: number
  readonly intent: SageActionIntentV2
  readonly confirmationId: string
}

export function createPlans(deps: PlansDeps): PlansStore {
  const plans: PlanRecord[] = []
  const pending = new Map<string, PendingStepRecord>()
  let lastStepRun: PlanStepRunView | null = null

  const readinessOf = (plan: PlanRecord): readonly PlanStepView[] => {
    const premises = deps.premises(plan.matterRef)
    // 前提规则：读不出来或未核验 = 未知 → 阻断；环境在折叠里已不存在 = 未就绪；都不是默默放行。
    let readiness: PlanStepView['readiness'] = 'ready'
    let note = '执行环境未选定（不阻断：逐次核验沿 011 合同）'
    if (premises.state !== 'read') {
      readiness = 'unknown'
      note = `前提未知（${premises.reason ?? 'premises-unreadable'}）——按阻断处理，不派发`
    } else if (premises.environmentRef !== null) {
      if (premises.environmentPresent === true) {
        note = `执行环境 ${premises.environmentRef} 存在（逐次核验）`
      } else if (premises.environmentPresent === false) {
        readiness = 'not-ready'
        note = `执行环境 ${premises.environmentRef} 在最近折叠中不存在——重新选择或核验后再试`
      } else {
        readiness = 'unknown'
        note = `执行环境存在性未核验（${premises.reason ?? 'fold-not-read'}）——按阻断处理，不派发`
      }
    }
    return plan.steps.map((step): PlanStepView => ({
      stepNo: step.stepNo,
      title: step.title,
      readiness,
      readinessNote: note,
    }))
  }

  const viewOf = (plan: PlanRecord): PlanView => ({
    planId: plan.planId,
    matterRef: plan.matterRef,
    title: plan.title,
    steps: readinessOf(plan),
    state: plan.state,
    acceptedAt: plan.acceptedAt,
    createdAt: plan.createdAt,
  })

  const status = (): PlansStatus => ({ state: 'read', plans: plans.map(viewOf), lastStepRun })

  const stepIntent = (plan: PlanRecord, stepNo: number, title: string): SageActionIntentV2 => ({
    matterId: plan.matterRef,
    revisionId: `plan:${plan.planId}:step:${String(stepNo)}`,
    actionType: 'plan-step',
    actionScope: 'matter',
    payload: { planId: plan.planId, stepNo, title },
    origin: 'renderer-action',
  })

  const findStep = (planId: string, stepNo: number): { readonly plan: PlanRecord, readonly step: { readonly stepNo: number, readonly title: string } } | undefined => {
    const plan = plans.find((entry) => entry.planId === planId)
    if (plan === undefined) return undefined
    const step = plan.steps.find((entry) => entry.stepNo === stepNo)
    return step === undefined ? undefined : { plan, step }
  }

  const retirePending = (planId: string, stepNo: number): void => {
    const key = `${planId}:${String(stepNo)}`
    const record = pending.get(key)
    if (record !== undefined) {
      deps.confirmations.store.retire(record.confirmationId)
      pending.delete(key)
    }
  }

  return {
    list: status,

    create(request) {
      const title = request.title.trim()
      if (title === '' || title.length > MAX_TITLE) return { state: 'refused', code: 'plan-title-invalid' }
      const steps = request.steps.map((step) => step.trim()).filter((step) => step !== '')
      if (steps.length === 0 || steps.length > MAX_STEPS || steps.some((step) => step.length > MAX_TITLE)) {
        return { state: 'refused', code: 'plan-steps-invalid' }
      }
      if (plans.length >= MAX_PLANS) return { state: 'refused', code: 'plans-full' }
      const plan: PlanRecord = {
        planId: deps.nextId(),
        matterRef: request.matterRef,
        title,
        steps: steps.map((step, index) => ({ stepNo: index + 1, title: step })),
        state: 'draft',
        acceptedAt: null,
        createdAt: deps.now(),
      }
      plans.push(plan)
      return { state: 'ok', plans: status(), planId: plan.planId }
    },

    accept(request) {
      const plan = plans.find((entry) => entry.planId === request.planId)
      if (plan === undefined) return { state: 'refused', code: 'plan-not-found' }
      // 接受=对这份交付的确认回执：不派发、不铸卡、不碰会话（US-165/166 的结构保证）。
      if (plan.state !== 'accepted') {
        plan.state = 'accepted'
        plan.acceptedAt = deps.now()
      }
      return { state: 'ok', plans: status(), planId: plan.planId }
    },

    prepareStep(request) {
      const found = findStep(request.planId, request.stepNo)
      if (found === undefined) return { state: 'refused', planId: request.planId, stepNo: request.stepNo, code: 'plan-step-not-found' }
      const readiness = readinessOf(found.plan).find((step) => step.stepNo === request.stepNo)
      if (readiness === undefined || readiness.readiness === 'unknown') {
        // 未知即阻断：不铸卡，不派发（US-167）。
        return { state: 'refused', planId: request.planId, stepNo: request.stepNo, code: 'step-premise-unknown' }
      }
      if (readiness.readiness === 'not-ready') {
        return { state: 'refused', planId: request.planId, stepNo: request.stepNo, code: 'step-not-ready' }
      }
      const intent = stepIntent(found.plan, found.step.stepNo, found.step.title)
      // A fresh preparation retires the previous unconsumed card for this exact step.
      retirePending(request.planId, request.stepNo)
      const card = deps.confirmations.store.prepare(intent, deps.confirmations.facts(intent))
      pending.set(`${request.planId}:${String(request.stepNo)}`, { planId: request.planId, stepNo: request.stepNo, intent, confirmationId: card.confirmationId })
      return { state: 'prepared', planId: request.planId, stepNo: request.stepNo, card: card as ActionConfirmationCard }
    },

    async executeStep(request) {
      const found = findStep(request.planId, request.stepNo)
      if (found === undefined) {
        lastStepRun = { planId: request.planId, stepNo: request.stepNo, state: 'refused', code: 'plan-step-not-found', at: deps.now() }
        return { state: 'refused', plans: status(), code: 'plan-step-not-found' }
      }
      // 新鲜度重验：前提变了，旧卡作废（沿 027 的纪律）。
      const readiness = readinessOf(found.plan).find((step) => step.stepNo === request.stepNo)
      if (readiness === undefined || readiness.readiness !== 'ready') {
        retirePending(request.planId, request.stepNo)
        const code = readiness?.readiness === 'not-ready' ? 'step-not-ready' : 'step-premise-unknown'
        lastStepRun = { planId: request.planId, stepNo: request.stepNo, state: 'refused', code, at: deps.now() }
        return { state: 'refused', plans: status(), code }
      }
      const execute = deps.executeStep
      if (execute === undefined) {
        lastStepRun = { planId: request.planId, stepNo: request.stepNo, state: 'not-ready', code: 'step-execution-unavailable', at: deps.now() }
        return { state: 'not-ready', plans: status(), code: 'step-execution-unavailable' }
      }
      const intent = stepIntent(found.plan, found.step.stepNo, found.step.title)
      const verdict = deps.confirmations.store.consume(intent, request.confirmationId, deps.confirmations.facts(intent))
      if (!verdict.ok) {
        lastStepRun = { planId: request.planId, stepNo: request.stepNo, state: 'refused', code: verdict.code, at: deps.now() }
        return { state: 'refused', plans: status(), code: verdict.code }
      }
      pending.delete(`${request.planId}:${String(request.stepNo)}`)
      let outcome: Awaited<ReturnType<NonNullable<PlansDeps['executeStep']>>> | { readonly failed: true }
      try {
        outcome = await execute(intent)
      } catch {
        outcome = { failed: true }
      }
      if ('receiptRef' in outcome) {
        lastStepRun = { planId: request.planId, stepNo: request.stepNo, state: 'settled', code: null, at: deps.now() }
        return { state: 'settled', plans: status(), receiptRef: outcome.receiptRef }
      }
      if ('outcome' in outcome) {
        lastStepRun = { planId: request.planId, stepNo: request.stepNo, state: 'unknown', code: outcome.code, at: deps.now() }
        return { state: 'unknown', plans: status(), code: outcome.code }
      }
      if ('denied' in outcome) {
        lastStepRun = { planId: request.planId, stepNo: request.stepNo, state: 'refused', code: outcome.denied, at: deps.now() }
        return { state: 'refused', plans: status(), code: outcome.denied }
      }
      lastStepRun = { planId: request.planId, stepNo: request.stepNo, state: 'unknown', code: 'step-execution-failed', at: deps.now() }
      return { state: 'unknown', plans: status(), code: 'step-execution-failed' }
    },
  }
}
