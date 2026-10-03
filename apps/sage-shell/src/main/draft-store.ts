/** Ticket 002 (US-004/007/009/010/011): the device-local draft store.
 *
 * A draft is **not** a matter. It lives on this device only, is never synced, and every record is
 * written as AES-256-GCM ciphertext under a device key file that its own directory holds; while
 * signed out the store refuses to read or write anything (the product's "locked" state).
 *
 * What this protects and what it does not is written down in ADR-0209: the ciphertext keeps draft
 * text out of plain disk inspection, and the session gate keeps the product from projecting drafts
 * while signed out. A local attacker who can read the device key file is out of scope of this
 * slice, and the ADR says so instead of implying otherwise.
 *
 * Nothing here mints a formal matter: a conversion carries the confirmed fields and the user's
 * selected fragments into the custody action (ADR-0201), and the draft only records the receipt
 * the custody side returned.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const FILE_VERSION = 1
const KEY_BYTES = 32
const IV_BYTES = 12
const MAX_DRAFT_BYTES = 256 * 1024
const DEVICE_KEY_FILE = '.device-key'

/** The three required fields plus the optional single project (US-007/009). */
export interface DraftFields {
  readonly goal: string
  readonly deliverable: string
  readonly responsibility: string
  readonly projectRef: string
}

/** One "前史" entry: an input the user sent, kept in the draft and attached only when selected. */
export interface DraftHistoryEntry {
  readonly entryId: string
  readonly text: string
  readonly selected: boolean
}

/** Ticket 003 (US-005/119): the creation request this draft last started, and how it ended.
 *  A request whose result never came back stays `unknown` — the surface then offers 核对 only. */
export interface DraftAttempt {
  readonly correlation: string
  readonly at: string
  readonly state: 'pending' | 'unknown' | 'failed'
}

export interface DraftRecord {
  readonly draftId: string
  /** Absent until a confirmation was started; cleared by an explicit cancel or a settled creation. */
  readonly attempt?: DraftAttempt
  /** The confirmed, organized result: filled by the user's own update, never by an organizer. */
  readonly fields: DraftFields
  readonly clarification: string
  readonly history: readonly DraftHistoryEntry[]
  readonly status: 'editing' | 'converted'
  /** Set only from the custody receipt; a local id is never written here (ADR-0201). */
  readonly matterRef: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface DraftConversionRequest {
  readonly draftId: string
  readonly matterId: string
  readonly revisionId: string
  readonly payload: Readonly<Record<string, string>>
}

export type DraftGate =
  | { readonly state: 'locked' }
  | { readonly state: 'ready', readonly drafts: readonly DraftRecord[] }

export interface DraftStore {
  /** Every draft on this device, oldest first; locked says locked, never "no drafts". */
  readonly list: (allowed: boolean) => DraftGate
  readonly create: (rawInput: string, allowed: boolean) => DraftGate | undefined
  readonly update: (draftId: string, patch: { readonly fields?: Partial<DraftFields>, readonly clarification?: string, readonly selectedEntryIds?: readonly string[] }, allowed: boolean) => DraftGate | undefined
  /** Validate the draft and build the custody action; refuses without touching the custody side. */
  readonly prepareConversion: (draftId: string, allowed: boolean) => { readonly state: 'locked' | 'missing' | 'incomplete' | 'already-converted' } | { readonly state: 'ready', readonly request: DraftConversionRequest }
  /** Record the custody receipt; the only place a matterRef is written. */
  readonly commitConversion: (draftId: string, matterRef: string) => DraftRecord | undefined
  /** Ticket 003: open the attempt for one confirmation (the request's identity is its correlation). */
  readonly beginAttempt: (draftId: string, correlation: string) => DraftRecord | undefined
  /** Ticket 003: how that attempt ended — unknown stays unknown until a reconcile says otherwise. */
  readonly noteAttempt: (draftId: string, correlation: string, state: 'unknown' | 'failed') => DraftRecord | undefined
  /** Ticket 003 (US-006): cancel an unsubmitted confirmation; the content is untouched. */
  readonly cancelAttempt: (draftId: string) => DraftRecord | undefined
}

export interface DraftStoreDeps {
  readonly draftsDir: string
  readonly now: () => string
  readonly nextId: () => string
  /** 32 fresh random bytes for a new device key. */
  readonly randomKey: () => Buffer
}

function emptyFields(): DraftFields {
  return { goal: '', deliverable: '', responsibility: '', projectRef: '' }
}

/** Guard the shape: a record that does not parse is refused, never partially adopted. */
function parseRecord(value: unknown): DraftRecord | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const fields = record.fields
  if (fields === null || typeof fields !== 'object') return undefined
  const fieldRecord = fields as Record<string, unknown>
  const strings = ['goal', 'deliverable', 'responsibility', 'projectRef'] as const
  if (!strings.every((key) => typeof fieldRecord[key] === 'string')) return undefined
  if (typeof record.draftId !== 'string' || record.draftId === '') return undefined
  if (typeof record.clarification !== 'string') return undefined
  if (typeof record.status !== 'string' || (record.status !== 'editing' && record.status !== 'converted')) return undefined
  if (record.matterRef !== null && typeof record.matterRef !== 'string') return undefined
  if (typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') return undefined
  if (!Array.isArray(record.history)) return undefined
  const history: DraftHistoryEntry[] = []
  for (const entry of record.history) {
    if (entry === null || typeof entry !== 'object') return undefined
    const item = entry as Record<string, unknown>
    if (typeof item.entryId !== 'string' || item.entryId === '' || typeof item.text !== 'string' || typeof item.selected !== 'boolean') return undefined
    history.push({ entryId: item.entryId, text: item.text, selected: item.selected })
  }
  let attempt: DraftAttempt | undefined
  if (record.attempt !== undefined) {
    const raw = record.attempt
    if (raw === null || typeof raw !== 'object') return undefined
    const item = raw as Record<string, unknown>
    if (typeof item.correlation !== 'string' || item.correlation === '' || typeof item.at !== 'string') return undefined
    if (item.state !== 'pending' && item.state !== 'unknown' && item.state !== 'failed') return undefined
    attempt = { correlation: item.correlation, at: item.at, state: item.state }
  }
  return {
    draftId: record.draftId,
    ...(attempt === undefined ? {} : { attempt }),
    fields: {
      goal: fieldRecord.goal as string,
      deliverable: fieldRecord.deliverable as string,
      responsibility: fieldRecord.responsibility as string,
      projectRef: fieldRecord.projectRef as string,
    },
    clarification: record.clarification,
    history,
    status: record.status,
    matterRef: record.matterRef as string | null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function isComplete(fields: DraftFields): boolean {
  return fields.goal.trim() !== '' && fields.deliverable.trim() !== '' && fields.responsibility.trim() !== ''
}

/**
 * The one at-rest sealing used by every device-local record (drafts, pending inputs): AES-256-GCM
 * under a 0600 device key. One home, so a record family cannot silently get a weaker scheme.
 */
export interface DeviceSealer {
  readonly seal: (value: unknown) => Buffer
  readonly open: (bytes: Buffer) => unknown
}

export function createDeviceSealer(input: { readonly keyFile: string, readonly directory: string, readonly randomKey: () => Buffer }): DeviceSealer {
  let cachedKey: Buffer | undefined
  const deviceKey = (): Buffer => {
    if (cachedKey !== undefined) return cachedKey
    if (existsSync(input.keyFile)) {
      const key = readFileSync(input.keyFile)
      if (key.byteLength !== KEY_BYTES) throw new Error('sage shell: device key has an unexpected length')
      cachedKey = key
      return key
    }
    mkdirSync(input.directory, { recursive: true, mode: 0o700 })
    const key = input.randomKey()
    if (key.byteLength !== KEY_BYTES) throw new Error('sage shell: device key must be 32 bytes')
    writeFileSync(input.keyFile, key, { mode: 0o600, flag: 'wx' })
    cachedKey = key
    return key
  }
  return {
    seal(value) {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv('aes-256-gcm', deviceKey(), iv)
      const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
      return Buffer.from(JSON.stringify({
        v: FILE_VERSION,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: body.toString('base64'),
      }), 'utf8')
    },
    open(bytes) {
      let envelope: unknown
      try {
        envelope = JSON.parse(bytes.toString('utf8')) as unknown
      } catch {
        return undefined
      }
      if (envelope === null || typeof envelope !== 'object') return undefined
      const record = envelope as Record<string, unknown>
      if (record.v !== FILE_VERSION || typeof record.iv !== 'string' || typeof record.tag !== 'string' || typeof record.data !== 'string') return undefined
      try {
        const decipher = createDecipheriv('aes-256-gcm', deviceKey(), Buffer.from(record.iv, 'base64'))
        decipher.setAuthTag(Buffer.from(record.tag, 'base64'))
        const plain = Buffer.concat([decipher.update(Buffer.from(record.data, 'base64')), decipher.final()])
        return JSON.parse(plain.toString('utf8')) as unknown
      } catch {
        // An unreadable or tampered record is absent, never partially adopted.
        return undefined
      }
    },
  }
}

export function createDraftStore(deps: DraftStoreDeps): DraftStore {
  const fileOf = (draftId: string): string => join(deps.draftsDir, `${draftId}.draft`)
  const sealer = createDeviceSealer({ keyFile: join(deps.draftsDir, DEVICE_KEY_FILE), directory: deps.draftsDir, randomKey: deps.randomKey })

  const seal = (record: DraftRecord): Buffer => sealer.seal(record)

  const open = (draftId: string): DraftRecord | undefined => {
    const path = fileOf(draftId)
    if (!existsSync(path)) return undefined
    if (statSync(path).size > MAX_DRAFT_BYTES) return undefined
    return parseRecord(sealer.open(readFileSync(path)))
  }

  /** Enumerated only on the unlocked path: the locked gate never even lists the directory. */
  const listIds = (): string[] => {
    if (!existsSync(deps.draftsDir)) return []
    return readdirSync(deps.draftsDir).filter((name) => name.endsWith('.draft')).map((name) => name.slice(0, -'.draft'.length)).sort()
  }

  const write = (record: DraftRecord): void => {
    mkdirSync(deps.draftsDir, { recursive: true, mode: 0o700 })
    const path = fileOf(record.draftId)
    const temporary = `${path}.tmp`
    writeFileSync(temporary, seal(record), { mode: 0o600 })
    renameSync(temporary, path)
  }

  const snapshot = (allowed: boolean): DraftGate => {
    if (!allowed) return { state: 'locked' }
    const drafts: DraftRecord[] = []
    for (const id of listIds()) {
      const record = open(id)
      if (record !== undefined) drafts.push(record)
    }
    drafts.sort((left, right) => left.createdAt === right.createdAt ? left.draftId.localeCompare(right.draftId) : left.createdAt.localeCompare(right.createdAt))
    return { state: 'ready', drafts }
  }

  return {
    list: snapshot,
    create(rawInput, allowed) {
      if (!allowed) return { state: 'locked' }
      const timestamp = deps.now()
      const record: DraftRecord = {
        draftId: `draft-${deps.nextId()}`,
        // US-010: the organized result never lands in the fields. Only the user's own update fills
        // them, so a fresh draft carries the raw input as history and nothing else.
        fields: emptyFields(),
        clarification: '',
        history: [{ entryId: `entry-${deps.nextId()}`, text: rawInput, selected: false }],
        status: 'editing',
        matterRef: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      write(record)
      return { state: 'ready', drafts: [record] }
    },
    update(draftId, patch, allowed) {
      if (!allowed) return { state: 'locked' }
      const existing = open(draftId)
      if (existing === undefined) return undefined
      if (existing.status === 'converted') return { state: 'ready', drafts: [existing] }
      const next: DraftRecord = {
        ...existing,
        fields: patch.fields === undefined ? existing.fields : { ...existing.fields, ...patch.fields },
        clarification: patch.clarification ?? existing.clarification,
        history: patch.selectedEntryIds === undefined
          ? existing.history
          : existing.history.map((entry) => ({ ...entry, selected: patch.selectedEntryIds?.includes(entry.entryId) ?? entry.selected })),
        updatedAt: deps.now(),
      }
      write(next)
      return { state: 'ready', drafts: [next] }
    },
    prepareConversion(draftId, allowed) {
      if (!allowed) return { state: 'locked' }
      const draft = open(draftId)
      if (draft === undefined) return { state: 'missing' }
      // "重开不重复创建": a converted draft never reaches the custody side a second time.
      if (draft.status === 'converted') return { state: 'already-converted' }
      if (!isComplete(draft.fields)) return { state: 'incomplete' }
      const attached = draft.history.filter((entry) => entry.selected).map((entry) => entry.text)
      return {
        state: 'ready',
        request: {
          draftId,
          matterId: `draft:${draftId}`,
          // The revision counter is the draft's own conversion attempt count in identity form; the
          // custody side owns the formal revision identity (ADR-0201).
          revisionId: 'draft-revision:1',
          payload: {
            goal: draft.fields.goal,
            deliverable: draft.fields.deliverable,
            responsibleParty: draft.fields.responsibility,
            ...(draft.fields.projectRef === '' ? {} : { projectRef: draft.fields.projectRef }),
            // US-004: only the user's selected fragments travel; the rest of the history stays here.
            ...(attached.length === 0 ? {} : { attachedFragments: JSON.stringify(attached) }),
          },
        },
      }
    },
    commitConversion(draftId, matterRef) {
      const existing = open(draftId)
      if (existing === undefined) return undefined
      // A settled creation closes the attempt: there is nothing left to reconcile.
      const next: DraftRecord = { ...existing, status: 'converted', matterRef, updatedAt: deps.now() }
      delete (next as { attempt?: DraftAttempt }).attempt
      write(next)
      return next
    },
    beginAttempt(draftId, correlation) {
      const existing = open(draftId)
      if (existing === undefined) return undefined
      if (existing.status === 'converted') return existing
      const next: DraftRecord = { ...existing, attempt: { correlation, at: deps.now(), state: 'pending' }, updatedAt: deps.now() }
      write(next)
      return next
    },
    noteAttempt(draftId, correlation, state) {
      const existing = open(draftId)
      if (existing === undefined) return undefined
      // Only the attempt that is actually open may be updated: a stale answer never rewrites a
      // newer request's state.
      if (existing.attempt === undefined || existing.attempt.correlation !== correlation) return existing
      const next: DraftRecord = { ...existing, attempt: { ...existing.attempt, state }, updatedAt: deps.now() }
      write(next)
      return next
    },
    cancelAttempt(draftId) {
      const existing = open(draftId)
      if (existing === undefined) return undefined
      if (existing.attempt === undefined || existing.attempt.state !== 'pending') return existing
      const next: DraftRecord = { ...existing, updatedAt: deps.now() }
      delete (next as { attempt?: DraftAttempt }).attempt
      write(next)
      return next
    },
  }
}
