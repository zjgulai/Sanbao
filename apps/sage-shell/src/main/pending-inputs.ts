/** Ticket 006 (US-014~019): Sage-side pending inputs while execution is paused.
 *
 * The coordination rule this store exists to enforce: **while paused, an input never reaches the
 * agent inbox.** The base's `prompt` admits a prompt to the inbox, and an inbox item can be
 * consumed by a later turn — so a paused Sage keeps the text here, in a device-local record, and
 * only `resume()` dispatches. That is also why the store keeps the item's state explicit:
 *
 * - `pending`   — never submitted; editable and removable;
 * - `submitted` — a prompt was acknowledged and the occurrence is still in the Session queue;
 * - `consumed`  — the occurrence left the queue: the base took it. **Frozen**: editing it is
 *                 refused rather than rewriting what was already accepted.
 *
 * Records are sealed with the same device sealer drafts use (0600 key file), so this family cannot
 * silently get a weaker at-rest scheme.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createDeviceSealer } from './draft-store.js'

export type PendingInputState = 'pending' | 'dispatching' | 'submitted' | 'consumed'

export interface PendingInput {
  readonly itemId: string
  readonly text: string
  readonly state: PendingInputState
  readonly createdAt: string
  readonly updatedAt: string
  /** Present once a prompt was acknowledged; the key that ties it to the base's queue. */
  readonly requestId?: string
  /** The queue occurrence id observed for this request (from the queue snapshot). */
  readonly queueItemId?: string
  /** Why the item stopped being `pending` while paused: drained at stop, or already taken. */
  readonly note?: 'drained-at-stop' | 'consumed-by-race'
}

export interface PendingInputsSnapshot {
  readonly paused: boolean
  readonly items: readonly PendingInput[]
  /** The state the UI offers: editing is only meaningful for `pending` items. */
  readonly editable: readonly string[]
  /** Ticket 007: monotonic revision — bumped by every mutation; the version the queue accounting
   *  reports under (a concurrent edit/enqueue during a dispatch loop moves it, and the loop is
   *  bound to re-read the live list rather than a stale snapshot). */
  readonly revision: number
}

export interface PendingInputsStore {
  readonly snapshot: (matterRef: string) => PendingInputsSnapshot
  readonly isPaused: (matterRef: string) => boolean
  readonly pause: (matterRef: string) => PendingInputsSnapshot
  readonly resume: (matterRef: string) => PendingInputsSnapshot
  readonly enqueue: (matterRef: string, text: string) => PendingInput
  /** Refuses a non-pending item: an already-accepted input is not rewritten. */
  readonly edit: (matterRef: string, itemId: string, text: string) => { readonly ok: true, readonly item: PendingInput } | { readonly ok: false, readonly code: 'item-frozen' | 'item-unknown' }
  readonly remove: (matterRef: string, itemId: string) => { readonly ok: true } | { readonly ok: false, readonly code: 'item-frozen' | 'item-unknown' }
  /** Ticket 007: freeze one item while its prompt is in flight — dispatched text == recorded text. */
  readonly beginDispatch: (matterRef: string, itemId: string) => PendingInputsSnapshot
  /** The prompt never left (refused): the item goes back to pending to be resumed again. */
  readonly revertDispatch: (matterRef: string, itemId: string) => PendingInputsSnapshot
  readonly markSubmitted: (matterRef: string, itemId: string, requestId: string) => PendingInputsSnapshot
  /** Bring one submitted item back to `pending` (its occurrence was drained at stop). */
  readonly returnToPending: (matterRef: string, itemId: string, note: 'drained-at-stop') => PendingInputsSnapshot
  /** Fold the base's queue snapshot into the local states. Absent occurrences are consumed only
   *  when `absent:'consumed'` (the stop-drain semantics); resume accounting passes `'keep'` — a
   *  just-admitted prompt may not have materialised in the snapshot yet, and mistaking that for
   *  "taken" would freeze an input the user is still waiting on. */
  readonly foldQueue: (matterRef: string, occurrences: readonly { readonly queueItemId: string, readonly requestId?: string }[], note?: PendingInput['note'], options?: { readonly absent?: 'consumed' | 'keep' }) => PendingInputsSnapshot
}

export interface PendingInputsDeps {
  readonly pendingDir: string
  readonly now: () => string
  readonly nextId: () => string
  readonly randomKey: () => Buffer
}

const FILE_VERSION = 'sage.pending-inputs.v1'
const MAX_ITEMS = 128
const MAX_TEXT = 16_384

function slug(matterRef: string): string {
  return matterRef.replace(/[^A-Za-z0-9_-]/gu, '_').slice(0, 96)
}

function parseState(value: unknown): PendingInputState | undefined {
  return value === 'pending' || value === 'dispatching' || value === 'submitted' || value === 'consumed' ? value : undefined
}

function parseItem(value: unknown): PendingInput | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const state = parseState(record.state)
  if (typeof record.itemId !== 'string' || record.itemId === '' || typeof record.text !== 'string') return undefined
  if (state === undefined || typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') return undefined
  if (record.requestId !== undefined && typeof record.requestId !== 'string') return undefined
  if (record.queueItemId !== undefined && typeof record.queueItemId !== 'string') return undefined
  if (record.note !== undefined && record.note !== 'drained-at-stop' && record.note !== 'consumed-by-race') return undefined
  return {
    itemId: record.itemId,
    text: record.text,
    state,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.requestId === undefined ? {} : { requestId: record.requestId }),
    ...(record.queueItemId === undefined ? {} : { queueItemId: record.queueItemId }),
    ...(record.note === undefined ? {} : { note: record.note }),
  }
}

interface RecordShape {
  readonly schemaVersion: string
  readonly paused: boolean
  readonly revision: number
  readonly items: readonly PendingInput[]
}

function parseRecord(value: unknown): RecordShape | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== FILE_VERSION || typeof record.paused !== 'boolean' || !Array.isArray(record.items)) return undefined
  const revision = typeof record.revision === 'number' && Number.isSafeInteger(record.revision) && record.revision >= 0 ? record.revision : 0
  const items: PendingInput[] = []
  for (const raw of record.items) {
    const item = parseItem(raw)
    if (item === undefined) return undefined
    items.push(item)
  }
  return { schemaVersion: FILE_VERSION, paused: record.paused, revision, items }
}

export function createPendingInputs(deps: PendingInputsDeps): PendingInputsStore {
  const fileOf = (matterRef: string): string => join(deps.pendingDir, `${slug(matterRef)}.pending`)
  const sealer = createDeviceSealer({
    keyFile: join(deps.pendingDir, '.device-key'),
    directory: deps.pendingDir,
    randomKey: deps.randomKey,
  })

  const read = (matterRef: string): RecordShape => {
    const path = fileOf(matterRef)
    if (!existsSync(path)) return { schemaVersion: FILE_VERSION, paused: false, revision: 0, items: [] }
    try {
      if (statSync(path).size > 4 * 1024 * 1024) return { schemaVersion: FILE_VERSION, paused: false, revision: 0, items: [] }
      // A record we cannot open is treated as absent: a half-read pending list could silently
      // drop an item the user is still waiting to resume.
      return parseRecord(sealer.open(readFileSync(path))) ?? { schemaVersion: FILE_VERSION, paused: false, revision: 0, items: [] }
    } catch {
      return { schemaVersion: FILE_VERSION, paused: false, revision: 0, items: [] }
    }
  }

  const write = (matterRef: string, record: RecordShape): void => {
    mkdirSync(deps.pendingDir, { recursive: true, mode: 0o700 })
    const path = fileOf(matterRef)
    const temporary = `${path}.tmp`
    writeFileSync(temporary, sealer.seal(record), { mode: 0o600 })
    renameSync(temporary, path)
  }

  const snapshotOf = (record: RecordShape): PendingInputsSnapshot => ({
    paused: record.paused,
    items: record.items,
    editable: record.items.filter((item) => item.state === 'pending').map((item) => item.itemId),
    revision: record.revision,
  })

  const replace = (record: RecordShape, itemId: string, mutate: (item: PendingInput) => PendingInput): RecordShape => ({
    ...record,
    items: record.items.map((item) => (item.itemId === itemId ? mutate(item) : item)),
  })

  return {
    snapshot: (matterRef) => snapshotOf(read(matterRef)),
    isPaused: (matterRef) => read(matterRef).paused,
    pause(matterRef) {
      const record = read(matterRef)
      const next = { ...record, paused: true, revision: record.revision + 1 }
      write(matterRef, next)
      return snapshotOf(next)
    },
    resume(matterRef) {
      const record = read(matterRef)
      const next = { ...record, paused: false, revision: record.revision + 1 }
      write(matterRef, next)
      return snapshotOf(next)
    },
    enqueue(matterRef, text) {
      const record = read(matterRef)
      const timestamp = deps.now()
      const item: PendingInput = {
        itemId: `pending-${deps.nextId()}`,
        text: text.slice(0, MAX_TEXT),
        state: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      const items = [...record.items, item].slice(-MAX_ITEMS)
      write(matterRef, { ...record, items, revision: record.revision + 1 })
      return item
    },
    edit(matterRef, itemId, text) {
      const record = read(matterRef)
      const item = record.items.find((entry) => entry.itemId === itemId)
      if (item === undefined) return { ok: false, code: 'item-unknown' }
      // US-018: an input the base already accepted is frozen — editing it would rewrite what was
      // executed, not what will be.
      if (item.state !== 'pending') return { ok: false, code: 'item-frozen' }
      const updated: PendingInput = { ...item, text: text.slice(0, MAX_TEXT), updatedAt: deps.now() }
      write(matterRef, { ...replace(record, itemId, () => updated), revision: record.revision + 1 })
      return { ok: true, item: updated }
    },
    remove(matterRef, itemId) {
      const record = read(matterRef)
      const item = record.items.find((entry) => entry.itemId === itemId)
      if (item === undefined) return { ok: false, code: 'item-unknown' }
      if (item.state !== 'pending') return { ok: false, code: 'item-frozen' }
      write(matterRef, { ...record, items: record.items.filter((entry) => entry.itemId !== itemId), revision: record.revision + 1 })
      return { ok: true }
    },
    returnToPending(matterRef, itemId, note) {
      const record = read(matterRef)
      const next = replace(record, itemId, (item) => ({ ...item, state: 'pending', note, updatedAt: deps.now() }))
      write(matterRef, { ...next, revision: record.revision + 1 })
      return snapshotOf(next)
    },
    beginDispatch(matterRef, itemId) {
      const record = read(matterRef)
      const next = replace(record, itemId, (item) => (item.state !== 'pending' ? item : { ...item, state: 'dispatching', updatedAt: deps.now() }))
      write(matterRef, { ...next, revision: record.revision + 1 })
      return snapshotOf({ ...next, revision: record.revision + 1 })
    },
    revertDispatch(matterRef, itemId) {
      const record = read(matterRef)
      const next = replace(record, itemId, (item) => (item.state !== 'dispatching' ? item : { ...item, state: 'pending', updatedAt: deps.now() }))
      write(matterRef, { ...next, revision: record.revision + 1 })
      return snapshotOf({ ...next, revision: record.revision + 1 })
    },
    markSubmitted(matterRef, itemId, requestId) {
      const record = read(matterRef)
      const next = replace(record, itemId, (item) => ({ ...item, state: 'submitted', requestId, updatedAt: deps.now() }))
      write(matterRef, { ...next, revision: record.revision + 1 })
      return snapshotOf(next)
    },
    foldQueue(matterRef, occurrences, note, options) {
      const record = read(matterRef)
      const byRequest = new Map<string, { queueItemId: string, requestId?: string }>()
      for (const occurrence of occurrences) {
        if (occurrence.requestId !== undefined) byRequest.set(occurrence.requestId, occurrence)
      }
      const absentBecomesConsumed = options?.absent !== 'keep'
      const next: RecordShape = {
        ...record,
        revision: record.revision + 1,
        items: record.items.map((item) => {
          if (item.state !== 'submitted' || item.requestId === undefined) return item
          const occurrence = byRequest.get(item.requestId)
          if (occurrence !== undefined) {
            return { ...item, queueItemId: occurrence.queueItemId, updatedAt: deps.now() }
          }
          if (!absentBecomesConsumed) return item
          // The occurrence left the queue while we were paused: the base took it, and no local
          // record may pretend otherwise (this is the race's honest outcome).
          return { ...item, state: 'consumed', note: note ?? 'consumed-by-race', updatedAt: deps.now() }
        }),
      }
      write(matterRef, next)
      return snapshotOf(next)
    },
  }
}

/** Every matter that currently has a pending-input record (used by the restart check). */
export function listPendingMatters(deps: { readonly pendingDir: string }): readonly string[] {
  if (!existsSync(deps.pendingDir)) return []
  return readdirSync(deps.pendingDir).filter((name) => name.endsWith('.pending'))
}
