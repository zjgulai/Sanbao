/** T04: the home-page durable matter custody provider over the Sage-owned authoritative event
 *  store (ADR-0161 "Sage 拥有权威库"; the new ADR revises ADR-0201's custody-location clause —
 *  the branch, the typed codes and the receipt-only success of that decision all stay).
 *
 * Doctrine, same as ADR-0200's rehydrate port: every uncertain path (store unopenable, closed,
 * `blocked`, thrown load) answers "provider unavailable" (`undefined`), never a settled guess and
 * never an empty-history stand-in. The one committed-uncertainty is the store's own
 * `commit-unknown` result, which maps to `{unknown:true}` (outcome-unknown, never retryable).
 *
 * Identity discipline: the formal identities are derived from the service-issued correlation —
 * `matter:<correlation>` is minted once per confirmed attempt, `revision:1` is the creation
 * revision, and the appendId `draft-conversion:<correlation>` makes a repeated call for the same
 * attempt idempotent by construction (no second local record of the request). The renderer's
 * candidate ids (`draft:<draftId>`) never become formal identities.
 */
import type { SageDispatchIntent } from '../appservice/command-contracts.js'
import { createBusinessMatter, enterEvidence } from '../domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../domain/business-matter-codec.js'
import {
  openBusinessMatterEventStore,
  type BusinessMatterEventStore,
  type EncodedNewBusinessMatterEvent,
} from '../persistence/business-matter-event-store.js'
import type { SagePaths } from '../profile/paths.js'
import {
  MATTER_STORE_BUSY_TIMEOUT_MS,
  MATTER_STORE_MAX_PAYLOAD_BYTES,
  MATTER_STORE_MAX_STREAM_EVENTS,
} from './matter-rehydrate-port.js'

/** The pipeline's creation-branch answer, byte-for-byte the `CommandPipelinePorts.createMatter`
 *  shape so the assembly point merges it without translation. */
export type MatterCreationAnswer =
  | { readonly receiptRef: string }
  | { readonly unknown: true }
  | { readonly denied: 'custody-unavailable' }
  | undefined

export type MatterReconcileAnswer =
  | { readonly state: 'settled', readonly matterRef: string }
  | { readonly state: 'unknown', readonly code: string }
  | { readonly state: 'failed', readonly code: string }

export interface MatterCustody {
  readonly createMatter: (request: { readonly intent: SageDispatchIntent, readonly correlation: string }) => MatterCreationAnswer
  /** ADR-0211 D3: ask the same request what happened. Only a proven creation settles; a stream we
   *  cannot observe stays unknown, and an unopenable/closed store answers "no query port". */
  readonly reconcileCreation: (request: { readonly draftId: string, readonly correlation: string }) => MatterReconcileAnswer
  /** Stop answering; later calls fail closed (provider unavailable / still unknown). */
  readonly close: () => void
}

export interface MatterCustodyOptions {
  readonly sagePaths: SagePaths
  readonly clock?: () => string
}

const CREATION_CHANGE_REASON = '首页草案确认创建'
const CREATION_PERMISSION_BOUNDARY = '创建时未声明额外权限边界'
const CREATION_DATA_DESTINATION = '本机 Sage 数据根'
const MAX_FIELD_CHARS = 4096
const MAX_FRAGMENTS = 64

interface CreationInput {
  readonly draftId: string
  readonly goal: string
  readonly deliverable: string
  readonly responsibleParty: string
  readonly projectRef: string | undefined
  readonly fragments: readonly string[]
}

function boundedText(value: unknown, max = MAX_FIELD_CHARS): string | undefined {
  return typeof value === 'string' && value !== '' && value.length <= max ? value : undefined
}

/** Exact-shape read of the conversion intent. Anything unexpected is a caller bug, and a bug is a
 *  provable non-attempt: it refuses (`denied`) — never `unknown`, which would claim a possible
 *  effect that was never started. */
function readCreationInput(intent: SageDispatchIntent, correlation: string): CreationInput | undefined {
  if ('type' in intent) return undefined
  if (intent.actionType !== 'create-matter') return undefined
  if (typeof intent.matterId !== 'string' || !intent.matterId.startsWith('draft:')) return undefined
  const draftId = intent.matterId.slice('draft:'.length)
  if (draftId === '') return undefined
  if (correlation === '') return undefined
  const payload = intent.payload
  const goal = boundedText(payload.goal)
  const deliverable = boundedText(payload.deliverable)
  const responsibleParty = boundedText(payload.responsibleParty)
  if (goal === undefined || deliverable === undefined || responsibleParty === undefined) return undefined
  const projectRef = payload.projectRef === undefined ? undefined : boundedText(payload.projectRef)
  if (payload.projectRef !== undefined && projectRef === undefined) return undefined
  let fragments: readonly string[] = []
  if (payload.attachedFragments !== undefined) {
    if (typeof payload.attachedFragments !== 'string' || payload.attachedFragments.length > MAX_FIELD_CHARS * MAX_FRAGMENTS) return undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(payload.attachedFragments) as unknown
    } catch {
      return undefined
    }
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_FRAGMENTS) return undefined
    if (!parsed.every((item): item is string => boundedText(item) !== undefined)) return undefined
    fragments = parsed
  }
  return { draftId, goal, deliverable, responsibleParty, projectRef, fragments }
}

/** What the created revision declares: the deliverable (and project, and the user's selected
 *  context) are the declared scope; `insufficient` evidence records the draft confirmation
 *  itself — no supported evidence exists yet, so the matter honestly cannot run until a later
 *  revision says otherwise. */
function creationScope(input: CreationInput): string {
  const parts = [`交付物：${input.deliverable}`]
  if (input.projectRef !== undefined) parts.push(`项目：${input.projectRef}`)
  if (input.fragments.length > 0) parts.push(`附带上文：\n${input.fragments.join('\n')}`)
  return parts.join('\n')
}

export function createMatterCustody(options: MatterCustodyOptions): MatterCustody {
  const clock = options.clock ?? (() => new Date().toISOString())
  let store: BusinessMatterEventStore | undefined
  let closed = false

  const opened = (): BusinessMatterEventStore | undefined => {
    if (closed) return undefined
    if (store !== undefined) return store
    try {
      store = openBusinessMatterEventStore({
        sagePaths: options.sagePaths,
        maxStreamEvents: MATTER_STORE_MAX_STREAM_EVENTS,
        maxPayloadBytes: MATTER_STORE_MAX_PAYLOAD_BYTES,
        busyTimeoutMs: MATTER_STORE_BUSY_TIMEOUT_MS,
        clock,
      })
      return store
    } catch {
      // An unopenable store is a missing provider, never a refused request.
      return undefined
    }
  }

  /** Proof by the stream itself: a conflict result still settles exactly when the committed
   *  stream carries this attempt's creation event and the same goal. Anything else means the
   *  request's fate is genuinely unproven and must stay unknown. */
  const provenReceipt = (database: BusinessMatterEventStore, matterId: string, input: CreationInput): string | undefined => {
    let loaded
    try {
      loaded = database.load(matterId)
    } catch {
      return undefined
    }
    if (loaded.kind !== 'loaded') return undefined
    const first = loaded.matter.events[0]
    return first?.type === 'matter-created' && first.eventId === `${matterId}:created` && first.goal === input.goal
      ? matterId
      : undefined
  }

  return {
    createMatter(request) {
      const database = opened()
      if (database === undefined) return undefined
      const input = readCreationInput(request.intent, request.correlation)
      if (input === undefined) return { denied: 'custody-unavailable' }
      const matterId = `matter:${request.correlation}`
      const occurredAt = clock()
      let events: readonly EncodedNewBusinessMatterEvent[]
      try {
        const matter = enterEvidence(createBusinessMatter({
          matterId,
          eventId: `${matterId}:created`,
          occurredAt,
          goal: input.goal,
          responsibleParty: { kind: 'human', roleRef: input.responsibleParty },
        }), {
          eventId: `${matterId}:revision-1`,
          occurredAt,
          revisionId: 'revision:1',
          changeReason: CREATION_CHANGE_REASON,
          scope: creationScope(input),
          permissionBoundary: CREATION_PERMISSION_BOUNDARY,
          dataDestination: CREATION_DATA_DESTINATION,
          evidence: [{
            evidenceId: 'evidence:draft-confirmation',
            source: `draft:${input.draftId}`,
            observedAt: occurredAt,
            status: 'insufficient',
          }],
          unknowns: [],
          options: [],
          dependencies: [],
          experienceRefs: [],
          // No action is declared at creation; a later revision declares what may run.
          actionPolicies: [],
        })
        events = encodeBusinessMatterEvents(matter).map((event) => ({
          matterId: event.matterId,
          eventId: event.eventId,
          eventType: event.eventType,
          eventSchemaVersion: event.eventSchemaVersion,
          occurredAt: event.occurredAt,
          payloadBytes: event.payloadBytes.slice(),
        }))
      } catch {
        // The domain kernel refused the assembled stream: a provable non-attempt.
        return { denied: 'custody-unavailable' }
      }
      let result
      try {
        result = database.append({
          matterId,
          expectedVersion: { kind: 'not-exists' },
          appendId: `draft-conversion:${request.correlation}`,
          events,
        })
      } catch {
        return undefined
      }
      switch (result.kind) {
        case 'appended':
        case 'replayed':
          return { receiptRef: matterId }
        case 'commit-unknown':
          // The one honest unknown: the store could not confirm whether the commit landed.
          return { unknown: true }
        case 'storage-busy':
          // The transaction rolled back: nothing committed, safe to answer not-ready.
          return { denied: 'custody-unavailable' }
        case 'version-conflict':
        case 'idempotency-conflict':
        case 'duplicate-event-id': {
          const receiptRef = provenReceipt(database, matterId, input)
          return receiptRef === undefined ? { unknown: true } : { receiptRef }
        }
        case 'invalid-request':
          // A malformed append is our bug, and provably nothing was written.
          return { denied: 'custody-unavailable' }
        case 'blocked':
          return undefined
      }
    },
    reconcileCreation(request) {
      const database = opened()
      if (database === undefined) return { state: 'unknown', code: 'custodian-query-unavailable' }
      const matterId = `matter:${request.correlation}`
      let loaded
      try {
        loaded = database.load(matterId)
      } catch {
        return { state: 'unknown', code: 'custodian-query-unavailable' }
      }
      if (loaded.kind === 'blocked') return { state: 'unknown', code: 'custodian-query-unavailable' }
      if (loaded.kind === 'not-found') {
        // ADR-0211 D3: 查不到仍未知 — an unobserved request never settles itself.
        return { state: 'unknown', code: 'creation-not-observed' }
      }
      const first = loaded.matter.events[0]
      return first?.type === 'matter-created' && first.eventId === `${matterId}:created`
        ? { state: 'settled', matterRef: matterId }
        : { state: 'unknown', code: 'creation-not-observed' }
    },
    close: () => {
      closed = true
      store?.close()
      store = undefined
    },
  }
}
