/** L1-A (ADR-0320): the matter-governance dispatch step — the only place the admitted matter
 *  chain may call the real admin providers.
 *
 *  Mirrors the session dispatch discipline on the family's five-step profile: cheap per-op
 *  guards first (every answer there is not-dispatched — the effect provably did not run), then
 *  the live re-verification subset (active context equality, identity session, frame readiness)
 *  against fresh reads at this instant, then the provider call. Outcomes normalize to: a
 *  determinate provider receipt -> receipt with the family detail (identity fields + the
 *  provider's own read-back status), a determinate refusal -> refused with the provider's own
 *  code, everything uncertain -> outcome-unknown. No retry happens here.
 */
import type { MatterAdminOutcome, MatterBatchResult, MatterRenameResult } from '../appservice/contracts.js'
import type { MatterGovernanceAdmissionPorts } from '../appservice/matter-governance-admission.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'

export interface MatterAdminDispatchOptions {
  readonly archive: (request: { readonly matterRef: string, readonly ground: 'completed' | 'stopped' }) => MatterAdminOutcome
  readonly restore: (request: { readonly matterRef: string }) => MatterAdminOutcome
  readonly batch: (request: {
    readonly operation: 'archive' | 'restore'
    readonly targets: readonly string[]
    readonly ground?: 'completed' | 'stopped'
  }) => MatterBatchResult
  readonly rename: (request: { readonly matterRef: string, readonly title: string }) => MatterRenameResult
  /** Live reads for the pre-call re-verification; missing facts fail closed. */
  readonly readContext: () => {
    readonly sessionRef: string
    readonly matterRef: string
    readonly revisionRef: string
    readonly contextGeneration: number
    readonly frameGeneration: number
  } | null
  readonly readIdentitySession: () => { readonly sessionRef: string } | null
  readonly readFrame: () => { readonly generation: number, readonly ready: boolean, readonly contaminated: boolean } | undefined
}

function isRef(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096
}

const MAX_TITLE = 500
const MAX_BATCH_TARGETS = 100

export function createMatterAdminDispatchPort(
  options: MatterAdminDispatchOptions,
): NonNullable<MatterGovernanceAdmissionPorts['dispatch']> {
  return async ({ intent, context, identityPolicy }) => {
    if (ACTION_AUTHORITY_TABLE[intent.operation] === undefined) return { state: 'not-dispatched' }
    void identityPolicy

    const payload = intent.payload
    const prepared = prepare(intent.operation, payload)
    if (prepared === undefined) return { state: 'not-dispatched' }

    // The cheap live re-verification: the admitted context facts must still hold at this instant.
    const live = options.readContext()
    if (live === null) return { state: 'not-dispatched' }
    if (live.sessionRef !== context.sessionRef
      || live.matterRef !== context.matterRef
      || live.revisionRef !== context.revisionRef
      || live.contextGeneration !== Number(context.generation)) {
      return { state: 'not-dispatched' }
    }
    const identitySession = options.readIdentitySession()
    if (identitySession === null || identitySession.sessionRef !== context.sessionRef) return { state: 'not-dispatched' }
    const frame = options.readFrame()
    if (frame === undefined || !frame.ready || frame.contaminated) return { state: 'not-dispatched' }
    if (frame.generation !== live.frameGeneration) return { state: 'not-dispatched' }

    try {
      if (prepared.op === 'matter.admin.archive') {
        const outcome = options.archive({ matterRef: context.matterRef, ground: prepared.ground })
        if (outcome.state !== 'ok') return { state: 'refused', code: outcome.code }
        return {
          state: 'receipt',
          receiptRef: `receipt:matter-archive:${context.matterRef}`,
          detail: { kind: 'matter-archived', matterRef: context.matterRef, ground: prepared.ground, status: outcome.status },
        }
      }
      if (prepared.op === 'matter.admin.restore') {
        const outcome = options.restore({ matterRef: context.matterRef })
        if (outcome.state !== 'ok') return { state: 'refused', code: outcome.code }
        return {
          state: 'receipt',
          receiptRef: `receipt:matter-restore:${context.matterRef}`,
          detail: { kind: 'matter-restored', matterRef: context.matterRef, status: outcome.status },
        }
      }
      if (prepared.op === 'matter.admin.batch') {
        const outcome = options.batch({
          operation: prepared.operation,
          targets: prepared.targets,
          ...(prepared.ground === undefined ? {} : { ground: prepared.ground }),
        })
        if (outcome.state !== 'batch') return { state: 'refused', code: outcome.code }
        return {
          state: 'receipt',
          receiptRef: `receipt:matter-batch:${prepared.operation}`,
          detail: { kind: 'matter-batch', operation: prepared.operation, status: outcome.status },
        }
      }
      const outcome = options.rename({ matterRef: context.matterRef, title: prepared.title })
      if (outcome.state !== 'renamed') return { state: 'refused', code: outcome.code }
      return {
        state: 'receipt',
        receiptRef: `receipt:matter-rename:${context.matterRef}`,
        detail: { kind: 'matter-renamed', matterRef: context.matterRef, title: prepared.title, status: outcome.status },
      }
    } catch {
      return { state: 'outcome-unknown' }
    }
  }
}

type PreparedDispatch =
  | { readonly op: 'matter.admin.archive', readonly ground: 'completed' | 'stopped' }
  | { readonly op: 'matter.admin.restore' }
  | { readonly op: 'matter.admin.batch', readonly operation: 'archive' | 'restore', readonly targets: readonly string[], readonly ground: 'completed' | 'stopped' | undefined }
  | { readonly op: 'matter.admin.rename', readonly title: string }

function prepare(operation: string, payload: Readonly<Record<string, unknown>>): PreparedDispatch | undefined {
  if (operation === 'matter.admin.archive') {
    const ground = payload.ground
    if (ground !== 'completed' && ground !== 'stopped') return undefined
    return { op: 'matter.admin.archive', ground }
  }
  if (operation === 'matter.admin.restore') {
    return { op: 'matter.admin.restore' }
  }
  if (operation === 'matter.admin.batch') {
    const batchOperation = payload.operation
    if (batchOperation !== 'archive' && batchOperation !== 'restore') return undefined
    const targets = payload.targets
    if (!Array.isArray(targets) || targets.length === 0 || targets.length > MAX_BATCH_TARGETS) return undefined
    if (!targets.every((target) => isRef(target))) return undefined
    const ground = payload.ground
    if (ground !== undefined && ground !== 'completed' && ground !== 'stopped') return undefined
    return { op: 'matter.admin.batch', operation: batchOperation, targets: targets as readonly string[], ground }
  }
  if (operation === 'matter.admin.rename') {
    const title = payload.title
    if (typeof title !== 'string' || title.trim().length === 0 || title.length > MAX_TITLE) return undefined
    return { op: 'matter.admin.rename', title }
  }
  return undefined
}
