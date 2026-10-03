/** Ticket 028 (US-146~149): Sage-owned action items, their execution records, and the
 *  supplementary corrections (D-060 / D-057).
 *
 * Three rules carry the ticket's acceptance:
 *
 * - **An action item is work under a matter — nothing else.** It is never a delivery item, a
 *  pending request, a tool call or a run: the state machine is local, `done` is a state change
 *  (not acceptance), and nothing here sends, receipts, or touches another store.
 * - **A record freezes its basis.** Opening an execution record snapshots the item revision it
 *  was registered against; later edits bump the revision and never rewrite old records.
 * - **A correction links, never overwrites or replays.** It is submitted as a NEW message through
 *  the same session-send path (ack ≠ effective), the original requirement is left untouched and
 *  never re-sent, and its receipt is read from real evidence: the send's acknowledgement, the
 *  base queue's item state (still queued = 待应用), and the queue's consumption reading (已生效).
 */
import type {
  ActionItemOutcome,
  ActionItemView,
  ActionItemsStatus,
  CorrectionOutcome,
  CorrectionReceipt,
  CorrectionView,
} from '../appservice/contracts.js'

const MAX_TITLE = 200
const MAX_NOTE = 2000
const MAX_TEXT = 16_384
const MAX_ITEMS = 128
const MAX_CORRECTIONS = 128

export interface ActionItemSendOutcome {
  readonly state: 'accepted' | 'deferred' | 'refused'
  readonly requestId?: string
  readonly itemId?: string
  readonly code?: string
}

export interface ActionItemsDeps {
  readonly now: () => string
  readonly nextId: () => string
  /** The one send path a correction may use — the session channel's own (ack ≠ effective). */
  readonly send: (request: { readonly matterRef: string, readonly workspaceRoot: string, readonly text: string }) => Promise<ActionItemSendOutcome>
  /** The queue's own item state: the only evidence that upgrades a receipt from 待应用 to 已生效. */
  readonly pendingStateOf: (matterRef: string, itemId: string) => 'pending' | 'dispatching' | 'submitted' | 'consumed' | undefined
}

export interface ActionItemsStore {
  readonly list: () => ActionItemsStatus
  readonly createItem: (request: { readonly matterRef: string, readonly title: string, readonly note?: string }) => ActionItemOutcome
  readonly updateItem: (request: { readonly actionId: string, readonly title?: string, readonly note?: string }) => ActionItemOutcome
  readonly start: (request: { readonly actionId: string }) => ActionItemOutcome
  readonly complete: (request: { readonly actionId: string }) => ActionItemOutcome
  readonly submitCorrection: (request: {
    readonly matterRef: string
    readonly workspaceRoot: string
    readonly originalText: string
    readonly originalAt?: string
    readonly text: string
  }) => Promise<CorrectionOutcome>
}

interface ActionItemRecord {
  readonly actionId: string
  readonly matterRef: string
  title: string
  note: string
  state: 'open' | 'in-progress' | 'done'
  revision: number
  readonly createdAt: string
  updatedAt: string
  readonly records: ActionItemView['records'][number][]
}

interface CorrectionRecord {
  readonly correctionId: string
  readonly matterRef: string
  readonly originalText: string
  readonly originalAt: string | null
  readonly text: string
  readonly submittedAt: string
  readonly send: { readonly kind: 'received', readonly requestId: string }
    | { readonly kind: 'deferred', readonly itemId: string }
    | { readonly kind: 'refused', readonly code: string }
}

function viewOf(record: ActionItemRecord): ActionItemView {
  return {
    actionId: record.actionId,
    matterRef: record.matterRef,
    title: record.title,
    note: record.note,
    state: record.state,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    records: record.records,
  }
}

export function createActionItems(deps: ActionItemsDeps): ActionItemsStore {
  const items: ActionItemRecord[] = []
  const corrections: CorrectionRecord[] = []
  const itemIndex = (actionId: string): number => items.findIndex((entry) => entry.actionId === actionId)

  const receiptOf = (record: CorrectionRecord): CorrectionReceipt => {
    if (record.send.kind === 'refused') return { state: 'refused', code: record.send.code }
    if (record.send.kind === 'received') {
      // 受理回执在手；本版没有把 requestId 追到消费的读数，永不把它冒充生效（D-012）。
      return { state: 'received', requestId: record.send.requestId }
    }
    const state = deps.pendingStateOf(record.matterRef, record.send.itemId)
    if (state === 'consumed') return { state: 'effective' }
    // 007：派发中与在队同义 —— 受理发生但消费读数未到，仍按"待应用（在队列中）"呈现。
    if (state === 'submitted' || state === 'dispatching') return { state: 'pending-application', reason: 'queued' }
    if (state === 'pending') return { state: 'pending-application', reason: 'deferred' }
    // No consumption reading: the honest answer stays 待应用（等一次可核对的派发）。
    return { state: 'pending-application', reason: 'unobserved' }
  }

  const correctionView = (record: CorrectionRecord): CorrectionView => ({
    correctionId: record.correctionId,
    matterRef: record.matterRef,
    original: { text: record.originalText, at: record.originalAt },
    text: record.text,
    submittedAt: record.submittedAt,
    receipt: receiptOf(record),
  })

  return {
    list: () => ({
      state: 'read',
      items: items.map(viewOf),
      corrections: corrections.slice(-MAX_CORRECTIONS).map(correctionView),
    }),

    createItem(request) {
      const title = request.title.trim()
      const note = (request.note ?? '').trim()
      if (title === '' || title.length > MAX_TITLE) return { state: 'refused', code: 'item-title-invalid' }
      if (note.length > MAX_NOTE) return { state: 'refused', code: 'item-note-too-large' }
      if (items.length >= MAX_ITEMS) return { state: 'refused', code: 'action-items-full' }
      const record: ActionItemRecord = {
        actionId: deps.nextId(),
        matterRef: request.matterRef,
        title,
        note,
        state: 'open',
        revision: 1,
        createdAt: deps.now(),
        updatedAt: deps.now(),
        records: [],
      }
      items.push(record)
      return { state: 'ok', item: viewOf(record) }
    },

    updateItem(request) {
      const index = itemIndex(request.actionId)
      if (index === -1) return { state: 'refused', code: 'action-not-found' }
      const record = items[index]!
      if (request.title === undefined && request.note === undefined) return { state: 'refused', code: 'item-update-empty' }
      if (request.title !== undefined) {
        const title = request.title.trim()
        if (title === '' || title.length > MAX_TITLE) return { state: 'refused', code: 'item-title-invalid' }
        record.title = title
      }
      if (request.note !== undefined) {
        const note = request.note.trim()
        if (note.length > MAX_NOTE) return { state: 'refused', code: 'item-note-too-large' }
        record.note = note
      }
      // An edit is a new revision: later records will freeze against it, old ones keep theirs.
      record.revision += 1
      record.updatedAt = deps.now()
      return { state: 'ok', item: viewOf(record) }
    },

    start(request) {
      const index = itemIndex(request.actionId)
      if (index === -1) return { state: 'refused', code: 'action-not-found' }
      const record = items[index]!
      // A finished item is a state fact; v1 has no reopen, and a record must not pretend
      // otherwise. (完成≠交付验收, and reopening would need its own decision.)
      if (record.state === 'done') return { state: 'refused', code: 'action-done' }
      record.records.push({
        recordNo: record.records.length + 1,
        at: deps.now(),
        basis: { revision: record.revision, title: record.title, note: record.note },
      })
      record.state = 'in-progress'
      record.updatedAt = deps.now()
      return { state: 'ok', item: viewOf(record) }
    },

    complete(request) {
      const index = itemIndex(request.actionId)
      if (index === -1) return { state: 'refused', code: 'action-not-found' }
      const record = items[index]!
      // 完成只是一次状态变更：不追加执行记录、不写任何回执、不触达任何其他存储（US-146/147）。
      record.state = 'done'
      record.updatedAt = deps.now()
      return { state: 'ok', item: viewOf(record) }
    },

    async submitCorrection(request) {
      const originalText = request.originalText.trim()
      const text = request.text.trim()
      if (originalText === '' || originalText.length > MAX_TEXT) return { state: 'refused', code: 'correction-original-invalid' }
      if (text === '' || text.length > MAX_TEXT) return { state: 'refused', code: 'correction-text-invalid' }
      // One correction, one send of the NEW text through the channel's own path. The original is
      // never re-sent and never retried: an unknown or refused outcome stays what it is (D-057).
      const outcome = await deps.send({ matterRef: request.matterRef, workspaceRoot: request.workspaceRoot, text })
      const send: CorrectionRecord['send'] = outcome.state === 'accepted' && outcome.requestId !== undefined
        ? { kind: 'received', requestId: outcome.requestId }
        : outcome.state === 'deferred' && outcome.itemId !== undefined
          ? { kind: 'deferred', itemId: outcome.itemId }
          : { kind: 'refused', code: outcome.code ?? 'correction-send-failed' }
      const record: CorrectionRecord = {
        correctionId: deps.nextId(),
        matterRef: request.matterRef,
        originalText,
        originalAt: typeof request.originalAt === 'string' && request.originalAt !== '' ? request.originalAt : null,
        text,
        submittedAt: deps.now(),
        send,
      }
      corrections.push(record)
      if (corrections.length > MAX_CORRECTIONS) corrections.shift()
      return { state: 'created', correction: correctionView(record) }
    },
  }
}
