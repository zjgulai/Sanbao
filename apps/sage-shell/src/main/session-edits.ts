/** Ticket 036 (US-185~187): editing a sent message and resending the edited content.
 *
 * The rules the ticket names, and the base facts they stand on:
 *
 * - **Editing creates a version; the original is never rewritten** (US-185). The original text is
 *   captured once from the channel transcript (the durable `user/message` row) at first save and
 *   is immutable afterwards — history keeps showing what was actually sent.
 * - **Resend rides the same command entry** (US-186): the version is dispatched through the very
 *   `sessionSend` the composer uses (`session/prompt`), carrying a request identity minted once
 *   per version. The base dedupes prompts by `source.rpcId` (`hasPromptRequest`: live inbox +
 *   durable `user/message` events), so a repeated click of the same version can never be
 *   dispatched twice; this store additionally refuses while one resend is still in flight, so no
 *   parallel dispatch happens even before the base sees it. The ORIGINAL message's identity is
 *   never re-sent — only the edited text, under the version identity.
 * - **Unknown stays unknown** (US-187): a resend without an ack records `unknown`; from there the
 *   only entry is verification of the same operation — no auto retry, and the version is not put
 *   back into the resendable queue. Verification either finds the version's identity in the
 *   durable log (`effective`), keeps it `accepted` (admitted but not yet visible), or confirms it
 *   never landed (`not-delivered` — only that explicit check re-opens an explicit resend).
 */
import { readFileSync } from 'node:fs'

import type {
  SessionEditRecordView,
  SessionEditResendOutcome,
  SessionEditSaveOutcome,
  SessionEditSubmission,
  SessionEditVerifyOutcome,
  SessionEditVersionView,
  SessionEditsStatus,
} from '../appservice/contracts.js'
import type { BridgeCaller } from './workspace-adoption.js'

const MAX_EDIT_TEXT = 16_384
const MAX_TEXT_CHARS = 16_384
const MAX_RECORDS = 16
const MAX_VERSIONS = 16
const MAX_MATTERS = 8
const PAGE_MESSAGES = 200

/** Refusal codes that prove the prompt never left this process — everything else is `unknown`. */
const NOT_ADMITTED_CODES = new Set(['session-text-invalid', 'session-request-id-invalid', 'edit-paused', 'edit-inflight'])

export interface SessionEditsTranscriptRow {
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly source: 'echo' | 'history'
  readonly messageRef?: string
}

export interface SessionEditsSendOutcome {
  readonly state: string
  readonly code?: string
}

export interface SessionEditsDeps {
  readonly now: () => string
  readonly nextId: () => string
  /** The channel's last transcript for one matter (echo + history rows) — the original's home. */
  readonly transcriptOf: (matterRef: string) => readonly SessionEditsTranscriptRow[]
  /** The SAME command entry the composer uses (the channel's send; `session/prompt` inside). */
  readonly send: (input: { readonly matterRef: string, readonly workspaceRoot: string, readonly text: string, readonly requestId: string }) => Promise<SessionEditsSendOutcome>
  /** Verification's bounded read of the durable log. */
  readonly callBridge: BridgeCaller
  readonly bindingsFile: string
}

export interface SessionEditsStore {
  readonly save: (input: { readonly matterRef: string, readonly messageRef: string, readonly text: string }) => SessionEditSaveOutcome
  readonly resend: (input: { readonly matterRef: string, readonly editId: string, readonly workspaceRoot: string }) => Promise<SessionEditResendOutcome>
  readonly verify: (input: { readonly matterRef: string, readonly editId: string }) => Promise<SessionEditVerifyOutcome>
  readonly status: (matterRef: string) => SessionEditsStatus
}

interface VersionRecord {
  readonly version: number
  readonly text: string
  readonly savedAt: string
  readonly requestId: string
  submission: SessionEditSubmission
  submittedAt: string | null
  code: string | null
  inFlight: boolean
}

interface EditRecord {
  readonly editId: string
  readonly messageRef: string
  readonly originalText: string
  activeVersion: number
  readonly versions: VersionRecord[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function createSessionEdits(deps: SessionEditsDeps): SessionEditsStore {
  const readBindings = (): Record<string, string> => {
    try {
      const value = JSON.parse(readFileSync(deps.bindingsFile, 'utf8')) as unknown
      if (!isRecord(value)) return {}
      const out: Record<string, string> = {}
      for (const [key, entry] of Object.entries(value)) if (typeof entry === 'string' && entry !== '') out[key] = entry
      return out
    } catch {
      return {}
    }
  }

  const matters = new Map<string, EditRecord[]>()

  const recordsOf = (matterRef: string): EditRecord[] => {
    let records = matters.get(matterRef)
    if (records === undefined) {
      records = []
      matters.set(matterRef, records)
      while (matters.size > MAX_MATTERS) {
        const oldest = matters.keys().next().value as string
        matters.delete(oldest)
      }
    }
    return records
  }

  const versionViewOf = (version: VersionRecord): SessionEditVersionView => ({
    version: version.version,
    text: version.text,
    savedAt: version.savedAt,
    submission: version.submission,
    submittedAt: version.submittedAt,
    code: version.code,
  })

  const recordViewOf = (record: EditRecord): SessionEditRecordView => ({
    editId: record.editId,
    messageRef: record.messageRef,
    originalText: record.originalText,
    activeVersion: record.activeVersion,
    versions: record.versions.map(versionViewOf),
  })

  return {
    save(input) {
      const text = input.text.trim()
      if (text === '' || text.length > MAX_EDIT_TEXT) return { state: 'refused', code: 'edit-text-invalid' }
      if (input.messageRef === '' || input.messageRef.length > 160) return { state: 'refused', code: 'edit-message-invalid' }
      const records = recordsOf(input.matterRef)
      let record = records.find((entry) => entry.messageRef === input.messageRef)
      if (record === undefined) {
        // US-185: the original text comes from the durable transcript row, once, and is immutable.
        const row = deps.transcriptOf(input.matterRef).find((entry) => entry.role === 'user' && entry.messageRef === input.messageRef)
        if (row === undefined) return { state: 'refused', code: 'edit-message-not-found' }
        if (records.length >= MAX_RECORDS) records.shift()
        record = {
          editId: `edit-${deps.nextId()}`,
          messageRef: input.messageRef,
          originalText: row.text.slice(0, MAX_TEXT_CHARS),
          activeVersion: 0,
          versions: [],
        }
        records.push(record)
      }
      const version = record.versions.length + 1
      if (record.versions.length >= MAX_VERSIONS) record.versions.shift()
      record.versions.push({
        version,
        text,
        savedAt: deps.now(),
        // One identity per version, minted once: repeat clicks of this version reuse it, and the
        // base's rpcId dedupe makes a second dispatch of the same version impossible.
        requestId: `${record.editId}-v${version}`,
        submission: 'unsent',
        submittedAt: null,
        code: null,
        inFlight: false,
      })
      record.activeVersion = version
      return { state: 'saved', record: recordViewOf(record) }
    },

    async resend(input) {
      const record = recordsOf(input.matterRef).find((entry) => entry.editId === input.editId)
      if (record === undefined) return { state: 'refused', code: 'edit-not-found' }
      const version = record.versions.find((entry) => entry.version === record.activeVersion)
      if (version === undefined) return { state: 'refused', code: 'edit-not-found' }
      if (version.inFlight) return { state: 'refused', code: 'edit-inflight' }
      if (version.submission === 'accepted' || version.submission === 'effective') {
        // Same receipt, zero calls — a repeat click is a re-read of the recorded outcome.
        return { state: 'recorded', version: versionViewOf(version) }
      }
      if (version.submission === 'unknown') {
        // US-187: no retry and no way back into the resendable queue — verify the same operation.
        return { state: 'refused', code: 'edit-verify-required' }
      }
      if (input.workspaceRoot === '') return { state: 'refused', code: 'edit-workspace-missing' }
      version.inFlight = true
      let outcome: SessionEditsSendOutcome
      try {
        outcome = await deps.send({ matterRef: input.matterRef, workspaceRoot: input.workspaceRoot, text: version.text, requestId: version.requestId })
      } catch (error) {
        outcome = { state: 'refused', code: isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready' }
      } finally {
        version.inFlight = false
      }
      version.submittedAt = deps.now()
      if (outcome.state === 'accepted') {
        version.submission = 'accepted'
        version.code = null
      } else if (outcome.state === 'deferred') {
        // The channel parked it as a paused input; that record carries no identity, so the resend
        // is refused outright rather than half-kept (the pause truth stays with the channel).
        version.submission = 'unsent'
        version.submittedAt = null
        version.code = 'edit-paused'
        return { state: 'refused', code: 'edit-paused' }
      } else {
        const code = outcome.code ?? 'bridge-answer-unrecognised'
        if (NOT_ADMITTED_CODES.has(code)) {
          version.submission = 'unsent'
          version.submittedAt = null
          version.code = code
          return { state: 'refused', code }
        }
        version.submission = 'unknown'
        version.code = code
      }
      return { state: 'recorded', version: versionViewOf(version) }
    },

    async verify(input) {
      const record = recordsOf(input.matterRef).find((entry) => entry.editId === input.editId)
      if (record === undefined) return { state: 'refused', code: 'edit-not-found' }
      const version = record.versions.find((entry) => entry.version === record.activeVersion)
      if (version === undefined) return { state: 'refused', code: 'edit-not-found' }
      if (version.submission !== 'accepted' && version.submission !== 'unknown') {
        return { state: 'refused', code: 'edit-nothing-to-verify' }
      }
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return { state: 'refused', code: 'edit-no-session' }
      let page: unknown
      try {
        page = await deps.callBridge('session/page', [{ sessionId, throughSeq: -1, maxMessages: PAGE_MESSAGES }])
      } catch (error) {
        const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
        version.code = code
        return { state: 'checked', version: versionViewOf(version), code }
      }
      const pageRecord = isRecord(page) ? page : null
      const records = pageRecord !== null && pageRecord.ok === true && isRecord(pageRecord.result) && Array.isArray(pageRecord.result.records)
        ? pageRecord.result.records
        : null
      if (records === null) {
        version.code = 'history-answer-unrecognised'
        return { state: 'checked', version: versionViewOf(version), code: version.code }
      }
      const landed = records.some((candidate) => {
        if (!isRecord(candidate) || candidate.type !== 'event' || !isRecord(candidate.event)) return false
        const event = candidate.event
        if (event.type !== 'user/message' || !isRecord(event.data) || !isRecord(event.data.source)) return false
        return event.data.source.rpcId === version.requestId
      })
      if (landed) {
        version.submission = 'effective'
        version.code = null
        return { state: 'checked', version: versionViewOf(version), code: null }
      }
      if (version.submission === 'accepted') {
        // Admitted by the base but not yet visible in the log — stays accepted, never a guess.
        version.code = 'edit-version-not-visible'
        return { state: 'checked', version: versionViewOf(version), code: version.code }
      }
      // Unknown + a bounded window without the identity: verification confirms it never landed.
      version.submission = 'not-delivered'
      version.code = 'edit-not-delivered'
      return { state: 'checked', version: versionViewOf(version), code: version.code }
    },

    status(matterRef) {
      return { state: 'read', records: recordsOf(matterRef).map(recordViewOf), code: null, at: deps.now() }
    },
  }
}
