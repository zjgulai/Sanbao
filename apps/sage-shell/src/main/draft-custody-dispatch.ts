/** L1-C (ADR-0323): the draft-custody dispatch step — the only place the admitted draft chain
 *  may call the real custody store.
 *
 *  Per-op guards first (every answer there is not-dispatched), then the live re-verification
 *  subset (active context equality, identity session, frame readiness), then the store call.
 *  Reconcile is the custodian's own verdict: settled commits the conversion receipt, failed
 *  notes the attempt — both ride the receipt detail as determinate answers. Everything uncertain
 *  -> outcome-unknown. No retry happens here.
 */
import type { DraftStatus } from '../appservice/contracts.js'
import type { DraftCustodyAdmissionPorts } from '../appservice/draft-custody-admission.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'

export interface DraftCustodyDispatchOptions {
  readonly create: (request: { readonly rawInput: string }) => DraftStatus | undefined
  readonly update: (request: {
    readonly draftId: string
    readonly fields?: { readonly goal?: string, readonly deliverable?: string, readonly responsibility?: string, readonly projectRef?: string }
    readonly clarification?: string
    readonly selectedEntryIds?: readonly string[]
  }) => DraftStatus | undefined
  readonly cancel: (request: { readonly draftId: string }) => DraftStatus | undefined
  readonly reconcile: (request: { readonly draftId: string }) => Promise<
    | { readonly state: 'settled', readonly matterRef: string }
    | { readonly state: 'failed', readonly code: string }
    | { readonly state: 'unknown', readonly code: string }
    | undefined
  >
  /** The settled conversion's durable receipt and the failed attempt's note (same store). */
  readonly commitConversion: (request: { readonly draftId: string, readonly matterRef: string }) => void
  readonly noteAttempt: (request: { readonly draftId: string, readonly state: 'failed' }) => void
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

const MAX_RAW_INPUT = 16_384
const MAX_CLARIFICATION = 16_384
const MAX_FIELD = 4_096
const MAX_SELECTED = 128
const FIELD_KEYS = ['goal', 'deliverable', 'responsibility', 'projectRef'] as const

type DraftFields = { readonly goal?: string, readonly deliverable?: string, readonly responsibility?: string, readonly projectRef?: string }

type PreparedDispatch =
  | { readonly op: 'draft.create', readonly rawInput: string }
  | {
      readonly op: 'draft.update'
      readonly draftId: string
      readonly fields: DraftFields | undefined
      readonly clarification: string | undefined
      readonly selectedEntryIds: readonly string[] | undefined
    }
  | { readonly op: 'draft.cancel', readonly draftId: string }
  | { readonly op: 'draft.reconcile', readonly draftId: string }

function prepare(operation: string, payload: Readonly<Record<string, unknown>>): PreparedDispatch | undefined {
  if (operation === 'draft.create') {
    const rawInput = payload.rawInput
    if (typeof rawInput !== 'string' || rawInput.trim() === '' || rawInput.length > MAX_RAW_INPUT) return undefined
    return { op: 'draft.create', rawInput }
  }
  if (operation === 'draft.update') {
    const draftId = payload.draftId
    if (!isRef(draftId)) return undefined
    const fields = payload.fields
    if (fields !== undefined) {
      if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return undefined
      const record = fields as Record<string, unknown>
      const keys = Object.keys(record)
      if (keys.length === 0 || !keys.every((key) => (FIELD_KEYS as readonly string[]).includes(key))) return undefined
      if (!Object.values(record).every((entry) => typeof entry === 'string' && entry.length <= MAX_FIELD)) return undefined
    }
    const clarification = payload.clarification
    if (clarification !== undefined && (typeof clarification !== 'string' || clarification.length > MAX_CLARIFICATION)) return undefined
    const selectedEntryIds = payload.selectedEntryIds
    if (selectedEntryIds !== undefined) {
      if (!Array.isArray(selectedEntryIds) || selectedEntryIds.length > MAX_SELECTED) return undefined
      if (!selectedEntryIds.every((entry) => isRef(entry))) return undefined
    }
    return {
      op: 'draft.update',
      draftId,
      fields: fields as DraftFields | undefined,
      clarification: clarification as string | undefined,
      selectedEntryIds: selectedEntryIds as readonly string[] | undefined,
    }
  }
  if (operation === 'draft.cancel' || operation === 'draft.reconcile') {
    const draftId = payload.draftId
    if (!isRef(draftId)) return undefined
    return operation === 'draft.cancel' ? { op: 'draft.cancel', draftId } : { op: 'draft.reconcile', draftId }
  }
  return undefined
}

export function createDraftCustodyDispatchPort(
  options: DraftCustodyDispatchOptions,
): NonNullable<DraftCustodyAdmissionPorts['dispatch']> {
  return async ({ intent, context }) => {
    if (ACTION_AUTHORITY_TABLE[intent.operation] === undefined) return { state: 'not-dispatched' }

    const prepared = prepare(intent.operation, intent.payload)
    if (prepared === undefined) return { state: 'not-dispatched' }

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
      if (prepared.op === 'draft.create') {
        const status = options.create({ rawInput: prepared.rawInput })
        if (status === undefined) return { state: 'refused', code: 'draft-create-refused' }
        return {
          state: 'receipt',
          receiptRef: 'receipt:draft-create',
          detail: { kind: 'draft-created', status },
        }
      }
      if (prepared.op === 'draft.update') {
        const status = options.update({
          draftId: prepared.draftId,
          ...(prepared.fields === undefined ? {} : { fields: prepared.fields }),
          ...(prepared.clarification === undefined ? {} : { clarification: prepared.clarification }),
          ...(prepared.selectedEntryIds === undefined ? {} : { selectedEntryIds: prepared.selectedEntryIds }),
        })
        if (status === undefined) return { state: 'refused', code: 'draft-update-refused' }
        return {
          state: 'receipt',
          receiptRef: `receipt:draft-update:${prepared.draftId}`,
          detail: { kind: 'draft-updated', draftId: prepared.draftId, status },
        }
      }
      if (prepared.op === 'draft.cancel') {
        const status = options.cancel({ draftId: prepared.draftId })
        if (status === undefined) return { state: 'refused', code: 'draft-cancel-refused' }
        return {
          state: 'receipt',
          receiptRef: `receipt:draft-cancel:${prepared.draftId}`,
          detail: { kind: 'draft-canceled', draftId: prepared.draftId, status },
        }
      }
      const answer = await options.reconcile({ draftId: prepared.draftId })
      if (answer === undefined) return { state: 'refused', code: 'reconcile-unavailable' }
      if (answer.state === 'settled') {
        options.commitConversion({ draftId: prepared.draftId, matterRef: answer.matterRef })
      } else if (answer.state === 'failed') {
        options.noteAttempt({ draftId: prepared.draftId, state: 'failed' })
      }
      return {
        state: 'receipt',
        receiptRef: `receipt:draft-reconcile:${prepared.draftId}`,
        detail: { kind: 'draft-reconciled', draftId: prepared.draftId, outcome: { ...answer, draftId: prepared.draftId } },
      }
    } catch {
      return { state: 'outcome-unknown' }
    }
  }
}
