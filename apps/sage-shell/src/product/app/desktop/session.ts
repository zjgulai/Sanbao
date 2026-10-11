import { SAGE_REQUEST_TIMEOUT_MS } from '../../contracts.js'

export interface DesktopSessionContext {
  readonly matterRef: string
  readonly revisionRef: string
  readonly workspaceRef: string
  readonly workspaceRoot: string
  readonly contextGeneration: number
  readonly frameGeneration: number
  readonly sessionId: string | null
}

export interface DesktopSession {
  readonly context: DesktopSessionContext
  readonly title: string
  readonly messages: readonly { readonly role: 'user' | 'assistant'; readonly text: string }[]
  readonly execution: 'idle' | 'executing'
  readonly lastTurnEnd: string | null
  /** ADR-0301: the last turn's process facts (display-only; tolerant parse below). */
  readonly turnProcess: DesktopTurnProcess
  /** ADR-0303: the host's context-pressure projection, or null when absent. */
  readonly contextUsage: { readonly pressureTokens: number | null, readonly contextWindow: number | null } | null
  /** ADR-0313 (S03): the external-authorization waits (Ticket 041), read-only display facts. */
  readonly approvals: DesktopApprovals | null
  /** ADR-0313 (S05): the model-queue verdict (Ticket 042) — the service's own facts. */
  readonly modelQueue: DesktopModelQueue | null
  /** ADR-0313 (S06): the plans roster (read-only; carries no prepare/execute entry). */
  readonly plans: DesktopPlans | null
  /** ADR-0313 (S07): the paused-input list (Ticket 006) — edit/remove ride existing routes. */
  readonly pending: readonly DesktopPendingItem[]
  /** ADR-0313 (S07): the live queue snapshot (Ticket 008) — occurrences plus their readability. */
  readonly queue: DesktopQueue
  readonly paused: boolean
  readonly streamBroken: boolean
  readonly canSubmit: boolean
}

/** ADR-0301: the last turn's process facts — durations from the log's own stamps when present,
 *  basenames only. A malformed piece degrades to null/absent; it never invents a value. */
export interface DesktopTurnProcess {
  readonly durationMs: number | null
  readonly endedAt: number | null
  readonly iterations: number | null
  readonly fileWrites: readonly {
    readonly name: string
    readonly file: string | null
    readonly state: 'running' | 'done' | 'failed'
    readonly durationMs: number | null
    readonly added: number | null
    readonly removed: number | null
    readonly hunks: readonly {
      readonly old: string | null
      readonly new: string | null
    }[]
  }[]
}

export interface DesktopApprovalCard {
  readonly requestId: string
  readonly toolName: string
  readonly reason: string | null
  readonly withdrawable: boolean
}
export interface DesktopApprovals {
  readonly state: 'read' | 'no-session' | 'unavailable'
  readonly pending: readonly DesktopApprovalCard[]
  readonly code: string | null
}
export interface DesktopModelQueueRetry {
  readonly retryId: string
  readonly provider: string
  readonly failureCode: string
  readonly attempt: number
  readonly maxAttempts: number | null
  readonly delayMs: number
  readonly started: boolean
}
export interface DesktopModelQueue {
  readonly state: 'read' | 'no-session' | 'unavailable'
  readonly verdict: 'idle' | 'waiting' | 'retrying' | 'ready' | 'unknown'
  readonly retries: readonly DesktopModelQueueRetry[]
  readonly verifyOnly: boolean
  readonly reason: string | null
}
export interface DesktopPlanStep {
  readonly stepNo: number
  readonly title: string
  readonly readiness: 'ready' | 'not-ready' | 'unknown'
  readonly readinessNote: string
}
export interface DesktopPlan {
  readonly planId: string
  readonly title: string
  readonly state: 'draft' | 'accepted'
  readonly steps: readonly DesktopPlanStep[]
}
export interface DesktopPlans {
  readonly state: 'read' | 'unavailable'
  readonly plans: readonly DesktopPlan[]
}
export interface DesktopPendingItem {
  readonly itemId: string
  readonly text: string
  readonly state: 'pending' | 'dispatching' | 'submitted' | 'consumed'
  readonly editable: boolean
}
export interface DesktopQueueOccurrence {
  readonly queueItemId: string
  readonly position: 'queued' | 'steering' | 'context'
  readonly preview: string
}
/** The queue slot keeps its own readability fact: an unavailable snapshot never renders as
 *  "no queued items" (ADR-0313 review). */
export interface DesktopQueue {
  readonly state: 'read' | 'unavailable'
  readonly occurrences: readonly DesktopQueueOccurrence[]
}

export type DesktopSessionAction = { readonly kind: 'send'; readonly text: string } | { readonly kind: 'stop' | 'resume' }
export type DesktopSessionOutcome =
  | { readonly kind: 'accepted'; readonly sessionId: string; readonly requestId: string }
  | { readonly kind: 'deferred'; readonly itemId: string }
  | { readonly kind: 'settled'; readonly action: 'stop' | 'resume'; readonly interrupted: boolean }
  | { readonly kind: 'refused'; readonly code: string }
  | { readonly kind: 'unknown' }

/** ADR-0297: the reconciliation answer for an outcome-unknown send. `read` carries the facts the
 *  uncertainty gate may settle on; anything else keeps the conservative block. */
export type DesktopAttemptStatus =
  | {
      readonly kind: 'read'
      readonly matterRef: string
      readonly active: {
        readonly attemptId: string
        readonly requestId: string
        readonly dispatchUnknown: boolean
        readonly evidence: 'turn-running' | 'turn-ended' | 'awaiting-evidence'
      } | null
      readonly last: { readonly attemptId: string; readonly status: 'succeeded' | 'failed' | 'blocked' } | null
    }
  | { readonly kind: 'unavailable' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function reference(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 256
}

function generation(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** ADR-0301: tolerant display-only parse — each invalid piece degrades, never fails the session. */
function parseTurnProcess(input: unknown): DesktopTurnProcess {
  const record = isRecord(input) ? input : {}
  const duration = record.durationMs
  const iterations = record.iterations
  const fileWrites = Array.isArray(record.fileWrites)
    ? (record.fileWrites as unknown[]).flatMap((item) => {
      if (!isRecord(item) || typeof item.name !== 'string' || item.name === '') return []
      if (item.file !== null && typeof item.file !== 'string') return []
      if (item.state !== 'running' && item.state !== 'done' && item.state !== 'failed') return []
      const itemDuration = item.durationMs
      const countOf = (value: unknown): number | null =>
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
      const hunks = Array.isArray(item.hunks)
        ? (item.hunks as unknown[]).flatMap((hunk) => {
          if (!isRecord(hunk)) return []
          const oldText = hunk.old
          const newText = hunk.new
          if ((oldText !== null && typeof oldText !== 'string') || (newText !== null && typeof newText !== 'string')) return []
          if (oldText === null && newText === null) return []
          return [{ old: oldText as string | null, new: newText as string | null }]
        })
        : []
      return [{
        name: item.name,
        file: item.file as string | null,
        state: item.state as 'running' | 'done' | 'failed',
        durationMs: typeof itemDuration === 'number' && Number.isSafeInteger(itemDuration) && itemDuration >= 0 ? itemDuration : null,
        added: countOf(item.added),
        removed: countOf(item.removed),
        hunks,
      }]
    })
    : []
  const endedAt = record.endedAt
  return {
    durationMs: typeof duration === 'number' && Number.isSafeInteger(duration) && duration >= 0 ? duration : null,
    endedAt: typeof endedAt === 'number' && Number.isSafeInteger(endedAt) && endedAt >= 0 ? endedAt : null,
    iterations: typeof iterations === 'number' && Number.isSafeInteger(iterations) && iterations >= 0 ? iterations : null,
    fileWrites,
  }
}

/** ADR-0303: display-only, tolerant — absent or malformed pieces stay null. */
function parseContextUsage(input: unknown): { readonly pressureTokens: number | null, readonly contextWindow: number | null } | null {
  if (!isRecord(input)) return null
  const countOf = (value: unknown): number | null =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
  const pressureTokens = countOf(input.pressureTokens)
  const contextWindow = typeof input.contextWindow === 'number' && Number.isSafeInteger(input.contextWindow) && input.contextWindow > 0
    ? input.contextWindow : null
  if (pressureTokens === null && contextWindow === null) return null
  return { pressureTokens, contextWindow }
}

// ADR-0313: display-only tolerant parses. Malformed pieces degrade to null/[]. These are facts
// the panels render verbatim; no panel turns absence into a claim.

function parseApprovals(input: unknown): DesktopApprovals | null {
  if (!isRecord(input) || (input.state !== 'read' && input.state !== 'no-session' && input.state !== 'unavailable')) return null
  if (!Array.isArray(input.pending)) return null
  const pending: DesktopApprovalCard[] = []
  for (const card of input.pending) {
    if (!isRecord(card) || !reference(card.requestId) || !reference(card.toolName)
      || (card.reason !== null && card.reason !== undefined && typeof card.reason !== 'string')
      || typeof card.withdrawable !== 'boolean') return null
    pending.push({
      requestId: card.requestId, toolName: card.toolName,
      reason: typeof card.reason === 'string' ? card.reason : null, withdrawable: card.withdrawable,
    })
  }
  return { state: input.state, pending, code: typeof input.code === 'string' ? input.code : null }
}

function parseModelQueue(input: unknown): DesktopModelQueue | null {
  if (!isRecord(input) || (input.state !== 'read' && input.state !== 'no-session' && input.state !== 'unavailable')) return null
  const verdict = input.verdict
  if (verdict !== 'idle' && verdict !== 'waiting' && verdict !== 'retrying' && verdict !== 'ready' && verdict !== 'unknown') return null
  if (!Array.isArray(input.retries)) return null
  const retries: DesktopModelQueueRetry[] = []
  for (const retry of input.retries) {
    if (!isRecord(retry) || !reference(retry.retryId) || typeof retry.provider !== 'string' || typeof retry.failureCode !== 'string'
      || typeof retry.attempt !== 'number' || typeof retry.delayMs !== 'number' || typeof retry.started !== 'boolean'
      || (retry.maxAttempts !== null && retry.maxAttempts !== undefined && typeof retry.maxAttempts !== 'number')) return null
    retries.push({
      retryId: retry.retryId, provider: retry.provider, failureCode: retry.failureCode,
      attempt: retry.attempt, maxAttempts: typeof retry.maxAttempts === 'number' ? retry.maxAttempts : null,
      delayMs: retry.delayMs, started: retry.started,
    })
  }
  return {
    state: input.state, verdict, retries,
    verifyOnly: input.verifyOnly === true,
    reason: typeof input.reason === 'string' ? input.reason : null,
  }
}

function parsePlans(input: unknown): DesktopPlans | null {
  if (!isRecord(input) || (input.state !== 'read' && input.state !== 'unavailable') || !Array.isArray(input.plans)) return null
  const plans: DesktopPlan[] = []
  for (const plan of input.plans) {
    if (!isRecord(plan) || !reference(plan.planId) || typeof plan.title !== 'string' || !Array.isArray(plan.steps)
      || (plan.state !== 'draft' && plan.state !== 'accepted')) return null
    const steps: DesktopPlanStep[] = []
    for (const step of plan.steps) {
      if (!isRecord(step) || typeof step.stepNo !== 'number' || typeof step.title !== 'string'
        || (step.readiness !== 'ready' && step.readiness !== 'not-ready' && step.readiness !== 'unknown')
        || typeof step.readinessNote !== 'string') return null
      steps.push({ stepNo: step.stepNo, title: step.title, readiness: step.readiness, readinessNote: step.readinessNote })
    }
    plans.push({ planId: plan.planId, title: plan.title, state: plan.state, steps })
  }
  return { state: input.state, plans }
}

function parsePending(input: unknown): readonly DesktopPendingItem[] {
  if (!Array.isArray(input)) return []
  const items: DesktopPendingItem[] = []
  for (const item of input) {
    if (!isRecord(item) || !reference(item.itemId) || typeof item.text !== 'string'
      || (item.state !== 'pending' && item.state !== 'dispatching' && item.state !== 'submitted' && item.state !== 'consumed')
      || typeof item.editable !== 'boolean') continue
    items.push({ itemId: item.itemId, text: item.text, state: item.state, editable: item.editable })
  }
  return items
}

function parseQueue(input: unknown): DesktopQueue | null {
  if (!isRecord(input) || (input.state !== 'read' && input.state !== 'unavailable')) return null
  if (!Array.isArray(input.occurrences)) return null
  const occurrences: DesktopQueueOccurrence[] = []
  for (const occurrence of input.occurrences) {
    if (!isRecord(occurrence) || !reference(occurrence.queueItemId)
      || (occurrence.position !== 'queued' && occurrence.position !== 'steering' && occurrence.position !== 'context')
      || typeof occurrence.preview !== 'string') continue
    occurrences.push({ queueItemId: occurrence.queueItemId, position: occurrence.position, preview: occurrence.preview })
  }
  return { state: input.state, occurrences }
}

export function parseDesktopSession(input: unknown): DesktopSession | null {
  if (!isRecord(input)) return null
  const { service, activeContext: active, matter, workspaces, matterLinks, sessionChannel: channel } = input
  if (!isRecord(service) || service.reason !== 'authenticated'
    || !isRecord(service.auth) || service.auth.status !== 'signed-in'
    || !isRecord(active) || active.state !== 'active'
    || !reference(active.matterId) || !reference(active.revisionId) || !reference(active.workspaceRef)
    || !generation(active.contextGeneration) || !generation(active.frameGeneration)
    || !isRecord(matter) || matter.schemaVersion !== 'sage.matter-view.v1' || matter.projectionSource !== 'live'
    || !isRecord(matter.matter) || matter.matter.matterId !== active.matterId
    || matter.matter.currentRevisionId !== active.revisionId || typeof matter.matter.goal !== 'string'
    || !isRecord(workspaces) || workspaces.source !== 'workspace-follow' || workspaces.state !== 'read'
    || !Array.isArray(workspaces.entries) || !isRecord(matterLinks) || matterLinks.state !== 'read'
    || !Array.isArray(matterLinks.links) || !isRecord(channel)) return null

  const matches = workspaces.entries.filter((entry: unknown) => isRecord(entry) && entry.workspaceId === active.workspaceRef)
  const workspace: unknown = matches[0]
  const defaults = matterLinks.links.filter((entry: unknown) => isRecord(entry) && entry.matterRef === active.matterId && entry.isDefault === true)
  const link: unknown = defaults[0]
  if (matches.length !== 1 || !isRecord(workspace) || typeof workspace.path !== 'string'
    || workspace.path.trim().length === 0 || workspace.path.length > 4096
    || defaults.length !== 1 || !isRecord(link) || link.workspaceRef !== active.workspaceRef
    || link.workspacePath !== workspace.path
    || (channel.state !== 'read' && channel.state !== 'no-session')
    || (channel.execution !== 'idle' && channel.execution !== 'executing')
    || typeof channel.paused !== 'boolean' || typeof channel.streamBroken !== 'boolean'
    || (channel.lastTurnEnd !== null && typeof channel.lastTurnEnd !== 'string')
    || !Array.isArray(channel.transcript)) return null
  if (channel.state === 'read' ? !reference(channel.sessionId)
    : channel.sessionId !== null || channel.transcript.length !== 0 || channel.execution !== 'idle' || channel.lastTurnEnd !== null) return null

  const messages: Array<{ role: 'user' | 'assistant'; text: string }> = []
  for (const entry of channel.transcript as unknown[]) {
    if (!isRecord(entry) || (entry.role !== 'user' && entry.role !== 'assistant') || typeof entry.text !== 'string'
      || (entry.source !== 'echo' && entry.source !== 'history')
      || (entry.at !== null && typeof entry.at !== 'string') || !Array.isArray(entry.attachments)) return null
    messages.push({ role: entry.role, text: entry.text })
  }
  return {
    context: {
      matterRef: active.matterId, revisionRef: active.revisionId, workspaceRef: active.workspaceRef,
      workspaceRoot: workspace.path, contextGeneration: active.contextGeneration, frameGeneration: active.frameGeneration,
      sessionId: channel.sessionId as string | null,
    },
    title: matter.matter.goal, messages, execution: channel.execution, lastTurnEnd: channel.lastTurnEnd,
    turnProcess: parseTurnProcess(channel.turnProcess),
    contextUsage: parseContextUsage(channel.contextUsage),
    approvals: parseApprovals(input.sessionApprovals),
    modelQueue: parseModelQueue(input.modelQueue),
    plans: parsePlans(input.plans),
    pending: parsePending(channel.pending),
    // A malformed queue slot degrades to unavailable — absence must not read as "empty queue".
    queue: parseQueue(channel.queue) ?? { state: 'unavailable', occurrences: [] },
    paused: channel.paused, streamBroken: channel.streamBroken,
    canSubmit: matter.actionability === 'allowed' && matter.authorizationState === 'authorized'
      && matter.compatibilityOutcome === 'equivalent' && matter.availabilityState === 'available' && !channel.streamBroken,
  }
}

// A refused receipt is the service asserting "not accepted" — a determinate verdict the caller may
// retry safely, whatever the specific code says. Only one code is genuinely indeterminate: when the
// service itself could not confirm the protected effect's outcome it refuses with
// protected-effect-outcome-unknown, and re-sending could duplicate the effect.
const OUTCOME_UNKNOWN_REFUSAL = 'protected-effect-outcome-unknown'
const TRANSPORT_REFUSALS: Readonly<Record<number, string>> = {
  400: 'invalid-session-request', 403: 'caller-denied', 405: 'method-not-allowed',
  413: 'request-too-large', 415: 'content-type-rejected',
}
const PATHS = { send: '/.sage/session/send', stop: '/.sage/session/stop', resume: '/.sage/session/resume', attemptStatus: '/.sage/session/attempt-status', stream: '/.sage/session/stream' } as const
const references = (value: unknown): boolean => Array.isArray(value) && value.every(reference)

export async function submitDesktopSession(session: DesktopSession | null, action: DesktopSessionAction): Promise<DesktopSessionOutcome> {
  if (session === null || !session.canSubmit
    || (action.kind === 'stop' && (session.context.sessionId === null || session.execution !== 'executing'))
    || (action.kind === 'resume' && !session.paused)) return { kind: 'refused', code: 'session-context-unavailable' }
  if (action.kind === 'send' && (action.text.trim().length === 0 || action.text.length > 16_384)) {
    return { kind: 'refused', code: 'invalid-session-request' }
  }
  const body = JSON.stringify({
    matterRef: session.context.matterRef,
    ...(action.kind === 'stop' ? {} : { workspaceRoot: session.context.workspaceRoot }),
    ...(action.kind === 'send' ? { text: action.text, mode: 'queue' } : {}),
  })
  // The existing route's 4096-byte body limit is smaller than its character limit.
  if (new TextEncoder().encode(body).byteLength > 4096) return { kind: 'refused', code: 'request-too-large' }
  try {
    const response = await fetch(PATHS[action.kind], {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
      cache: 'no-store', signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
    })
    const transportRefusal = TRANSPORT_REFUSALS[response.status]
    if (transportRefusal !== undefined) return { kind: 'refused', code: transportRefusal }
    if (!response.ok) return { kind: 'unknown' }
    const result: unknown = await response.json()
    if (!isRecord(result)) return { kind: 'unknown' }
    if (result.state === 'refused') {
      if (result.code === OUTCOME_UNKNOWN_REFUSAL) return { kind: 'unknown' }
      return typeof result.code === 'string'
        ? { kind: 'refused', code: result.code } : { kind: 'unknown' }
    }
    if (action.kind === 'send') {
      if (result.state === 'deferred' && reference(result.itemId)) return { kind: 'deferred', itemId: result.itemId }
      if (result.state === 'accepted' && reference(result.sessionId) && reference(result.requestId)
        && result.mode === 'queue' && (session.context.sessionId === null || result.sessionId === session.context.sessionId)) {
        return { kind: 'accepted', sessionId: result.sessionId, requestId: result.requestId }
      }
      return { kind: 'unknown' }
    }
    // A stop/resume receipt can carry a non-null reconciliation code while the queue snapshot was
    // unavailable (session-channel.ts). The state itself is still determinate, so it settles; the
    // follow-up projection remains the authority for the queue facts it could not reconcile.
    if (!references(result.drained) || !references(result.consumed)
      || (result.dispatched !== undefined && !references(result.dispatched))
      || (result.code !== null && typeof result.code !== 'string')
      || (result.revision !== undefined && !generation(result.revision))) return { kind: 'unknown' }
    const settled = action.kind === 'stop' ? result.state === 'stopped' && result.paused === true
      : (result.state === 'resumed' && result.paused === false) || (result.state === 'interrupted' && result.paused === true)
    return settled ? { kind: 'settled', action: action.kind, interrupted: result.state === 'interrupted' } : { kind: 'unknown' }
  } catch {
    return { kind: 'unknown' }
  }
}

/** ADR-0298: consume the live session stream (SSE) while a turn runs. Deltas are pushed to the
 *  caller as they arrive; the stream ends at the turn end or when the caller aborts (the durable
 *  read remains the final word — this adds live presentation only). Transport failures are
 *  silent: the durable fold still renders. */
export async function consumeSessionStream(
  signal: AbortSignal,
  onDelta: (text: string) => void,
): Promise<void> {
  try {
    const response = await fetch(PATHS.stream, { method: 'GET', cache: 'no-store', signal })
    if (!response.ok || response.body === null) return
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const payload: unknown = JSON.parse(line.slice(6))
            if (isRecord(payload) && typeof payload.text === 'string') onDelta(payload.text)
          } catch {
            // A malformed frame is skipped, never guessed at.
          }
        }
        boundary = buffer.indexOf('\n\n')
      }
    }
  } catch {
    // Abort or transport failure: the durable read stays the authority.
  }
}

/** ADR-0297: one read-only attempt-status query — the reconciliation entry an unknown send's
 *  uncertainty gate uses. It asks; it never sends, retries or closes anything. */
export async function queryDesktopAttemptStatus(): Promise<DesktopAttemptStatus> {
  try {
    const response = await fetch(PATHS.attemptStatus, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      cache: 'no-store', signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return { kind: 'unavailable' }
    const result: unknown = await response.json()
    if (!isRecord(result)) return { kind: 'unavailable' }
    if (result.state === 'unavailable') return { kind: 'unavailable' }
    if (result.state !== 'read' || !reference(result.matterRef)) return { kind: 'unavailable' }
    const active = result.active
    type ActiveView = { readonly attemptId: string; readonly requestId: string; readonly dispatchUnknown: boolean; readonly evidence: 'turn-running' | 'turn-ended' | 'awaiting-evidence' } | null
    let activeView: ActiveView
    if (active === null) {
      activeView = null
    } else if (isRecord(active) && reference(active.attemptId) && reference(active.requestId)
      && typeof active.dispatchUnknown === 'boolean'
      && (active.evidence === 'turn-running' || active.evidence === 'turn-ended' || active.evidence === 'awaiting-evidence')) {
      activeView = {
        attemptId: active.attemptId as string,
        requestId: active.requestId as string,
        dispatchUnknown: active.dispatchUnknown,
        evidence: active.evidence,
      }
    } else {
      return { kind: 'unavailable' }
    }
    const last = result.last
    let lastView: { readonly attemptId: string; readonly status: 'succeeded' | 'failed' | 'blocked' } | null
    if (last === null) {
      lastView = null
    } else if (isRecord(last) && reference(last.attemptId)
      && (last.status === 'succeeded' || last.status === 'failed' || last.status === 'blocked')) {
      lastView = { attemptId: last.attemptId as string, status: last.status }
    } else {
      return { kind: 'unavailable' }
    }
    return { kind: 'read', matterRef: result.matterRef, active: activeView, last: lastView }
  } catch {
    return { kind: 'unavailable' }
  }
}
