/** Ticket 027 (US-140~145): matter edit drafts over adopted-workspace files.
 *
 * Three rules carry the ticket's acceptance:
 *
 * - **A draft is a snapshot, never a check-in.** Generating one stats the reference's version and
 *   reads one bounded page; the source file is not written, and the draft's view carries the
 *   workspace-relative path, the based version and no content at all.
 * - **The diff is content, not Git.** Sage compares the based snapshot with the proposed text by
 *   lines and labels both versions it compared; a source that moved on is a first-class state,
 *   never silently merged.
 * - **Writeback is one named action through one confirmation.** Preparing shows the target
 *   version and the impact; the one-time credential rides the shared confirmation store; the
 *   actual write only happens through the executor port — which production does not wire (the
 *   base has no write verb), so the honest answer there is not-ready, not "已回写". Sage main
 *   itself never writes the source file.
 */
import { createHash } from 'node:crypto'

import type { ActionConfirmationFacts, ActionConfirmationStore } from '../appservice/action-confirmations.js'
import type { SageActionIntentV2 } from '../appservice/command-contracts.js'
import type {
  EditDraftCreateOutcome,
  EditDraftDiff,
  EditDraftDiffLine,
  EditDraftDiffOutcome,
  EditDraftImpact,
  EditDraftPrepareWritebackOutcome,
  EditDraftStatus,
  EditDraftUpdateOutcome,
  EditDraftView,
  EditDraftWritebackCard,
  EditDraftWritebackOutcome,
  EditDraftWritebackState,
  FileReferenceRecord,
} from '../appservice/contracts.js'
import { asAnswer, readString } from './workspace-files.js'
import type { BridgeCaller } from './workspace-adoption.js'

/** One bounded page per draft: a file the read cannot finish is refused, never half-drafted. */
const EDIT_DRAFT_MAX_LINES = 400
const EDIT_DRAFT_MAX_CHARACTERS = 65_536
const EDIT_DRAFT_DIFF_MAX_LINES = 400
/** Above this cell count the line diff degrades to a whole-file replace, still honest. */
const EDIT_DRAFT_DIFF_CELL_BUDGET = 250_000

export interface EditDraftWritebackRequest {
  readonly matterRef: string
  readonly path: string
  readonly absolutePath: string
  readonly targetVersion: string
  readonly proposedText: string
}

export type EditDraftWritebackAnswer =
  | { readonly receiptRef: string }
  | { readonly outcome: 'unknown', readonly code: string }
  | { readonly denied: string }

export interface EditDraftsDeps {
  readonly now: () => string
  readonly nextId: () => string
  readonly references: () => readonly FileReferenceRecord[]
  readonly confirmations: {
    readonly store: ActionConfirmationStore
    readonly facts: (intent: SageActionIntentV2) => ActionConfirmationFacts
  }
  /** The only write path. Production leaves it unwired (the base exposes reads and one opaque
   *  version token, no write verb), so a confirmed writeback answers not-ready there. Read at
   *  call time so the port's presence is a per-dispatch fact, never burned into the store. */
  readonly executeWriteback?: (request: EditDraftWritebackRequest) => Promise<EditDraftWritebackAnswer>
}

export interface EditDraftsStore {
  readonly list: () => EditDraftStatus
  readonly create: (request: { readonly referenceId: string, readonly matterRef: string }) => Promise<EditDraftCreateOutcome>
  readonly update: (request: { readonly draftId: string, readonly proposedText: string }) => EditDraftUpdateOutcome
  readonly diff: (request: { readonly draftId: string }) => Promise<EditDraftDiffOutcome>
  readonly prepareWriteback: (request: { readonly draftId: string }) => Promise<EditDraftPrepareWritebackOutcome>
  readonly writeback: (request: { readonly draftId: string, readonly confirmationId?: string }) => Promise<EditDraftWritebackOutcome>
}

interface EditDraftRecord {
  readonly draftId: string
  readonly matterRef: string
  readonly workspaceRoot: string
  readonly path: string
  readonly name: string
  readonly absolutePath: string
  /** The version this draft was generated from; a later change never rewrites it. */
  readonly basedVersion: string
  readonly basedText: string
  proposedText: string
  readonly createdAt: string
  updatedAt: string
  sourceState: EditDraftView['sourceState']
  lastCurrentVersion: string | null
  confirmationId: string | null
  writeback: EditDraftWritebackState
}

const digestOf = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

/** Controlled view: path/version/state plus the user's own working copy — never the workspace
 *  root, never the source snapshot, never a payload shape. */
function view(record: EditDraftRecord): EditDraftView {
  return {
    draftId: record.draftId,
    matterRef: record.matterRef,
    path: record.path,
    name: record.name,
    proposedText: record.proposedText,
    basedVersion: record.basedVersion,
    generatedBy: 'file-observation',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    sourceCharacters: record.basedText.length,
    proposedCharacters: record.proposedText.length,
    sourceState: record.sourceState,
    writeback: record.writeback,
  }
}

/** The wire's own line rule ("a final \n terminates the last line"), applied to both sides of a
 *  comparison so a trailing newline in either text is never an invented empty line. */
function linesOf(text: string): string[] {
  const lines = text.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Line diff with the common prefix kept as context; bounded callers slice the result. */
function diffLines(based: readonly string[], proposed: readonly string[]): readonly EditDraftDiffLine[] {
  if (based.length * proposed.length > EDIT_DRAFT_DIFF_CELL_BUDGET) {
    return [
      ...based.map((text): EditDraftDiffLine => ({ kind: 'remove', text })),
      ...proposed.map((text): EditDraftDiffLine => ({ kind: 'add', text })),
    ]
  }
  const n = based.length
  const m = proposed.length
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] = based[i] === proposed[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const out: EditDraftDiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (based[i] === proposed[j]) {
      out.push({ kind: 'context', text: based[i]! })
      i += 1
      j += 1
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ kind: 'remove', text: based[i]! })
      i += 1
    } else {
      out.push({ kind: 'add', text: proposed[j]! })
      j += 1
    }
  }
  while (i < n) out.push({ kind: 'remove', text: based[i++]! })
  while (j < m) out.push({ kind: 'add', text: proposed[j++]! })
  return out
}

export function createEditDrafts(callBridge: BridgeCaller, deps: EditDraftsDeps): EditDraftsStore {
  const records: EditDraftRecord[] = []
  const indexOf = (draftId: string): number => records.findIndex((entry) => entry.draftId === draftId)

  const statOf = async (workspaceRoot: string, path: string): Promise<{ readonly ok: true, readonly version: string } | { readonly ok: false, readonly code: string }> => {
    const answer = asAnswer(await callBridge('workspaceFiles/stat', [{ workspaceRoot, path }]))
    if (!answer.ok) return { ok: false, code: answer.code ?? 'bridge-answer-unrecognised' }
    const version = readString(answer.result, 'version')
    return version === undefined ? { ok: false, code: 'bridge-answer-unrecognised' } : { ok: true, version }
  }

  /** The intent the writeback confirmation is bound to: the draft, its based version and the
   *  digest of exactly the proposed bytes the card previewed. */
  const intentOf = (record: EditDraftRecord): SageActionIntentV2 => ({
    matterId: record.matterRef,
    revisionId: `file:${record.path}@${record.basedVersion}`,
    actionType: 'writeback-source-file',
    actionScope: 'matter',
    payload: { path: record.path, basedVersion: record.basedVersion, proposedDigest: digestOf(record.proposedText) },
    origin: 'renderer-action',
  })

  const retirePrepared = (record: EditDraftRecord): void => {
    if (record.confirmationId !== null) {
      deps.confirmations.store.retire(record.confirmationId)
      record.confirmationId = null
    }
  }

  const impactOf = (record: EditDraftRecord): EditDraftImpact => {
    const lines = diffLines(linesOf(record.basedText), linesOf(record.proposedText))
    return {
      addedLines: lines.filter((line) => line.kind === 'add').length,
      removedLines: lines.filter((line) => line.kind === 'remove').length,
      proposedCharacters: record.proposedText.length,
    }
  }

  return {
    list: () => ({ state: 'read', drafts: records.map(view) }),

    async create(request) {
      const reference = deps.references().find((entry) => entry.referenceId === request.referenceId)
      if (reference === undefined) return { state: 'refused', code: 'reference-not-found' }
      // The reference's own version is the basis: a reference that already moved on refuses here
      // rather than silently re-basing the draft onto newer content.
      const stat = await statOf(reference.workspaceRoot, reference.path)
      if (!stat.ok) return { state: 'refused', code: stat.code }
      if (stat.version !== reference.version) return { state: 'refused', code: 'source-changed' }
      const answer = asAnswer(await callBridge('workspaceFiles/read', [{
        workspaceRoot: reference.workspaceRoot,
        path: reference.path,
        range: { offset: 1, limit: EDIT_DRAFT_MAX_LINES },
      }]))
      if (!answer.ok) return { state: 'refused', code: answer.code ?? 'bridge-answer-unrecognised' }
      const text = (answer.result as { text?: unknown } | null | undefined)?.text
      const readVersion = readString(answer.result, 'version')
      const eof = (answer.result as { eof?: unknown } | null | undefined)?.eof
      if (typeof text !== 'string' || readVersion === undefined || typeof eof !== 'boolean') {
        return { state: 'refused', code: 'bridge-answer-unrecognised' }
      }
      // A file the bounded page cannot finish is refused whole: a half-file draft would diff a lie.
      if (!eof) return { state: 'refused', code: 'draft-source-too-large' }
      if (readVersion !== reference.version) return { state: 'refused', code: 'source-changed' }
      const record: EditDraftRecord = {
        draftId: deps.nextId(),
        matterRef: request.matterRef,
        workspaceRoot: reference.workspaceRoot,
        path: reference.path,
        name: reference.path.split('/').pop() ?? reference.path,
        absolutePath: reference.absolutePath,
        basedVersion: reference.version,
        basedText: text,
        proposedText: text,
        createdAt: deps.now(),
        updatedAt: deps.now(),
        sourceState: 'unchanged',
        lastCurrentVersion: reference.version,
        confirmationId: null,
        writeback: { state: 'none' },
      }
      records.push(record)
      return { state: 'created', draft: view(record) }
    },

    update(request) {
      const index = indexOf(request.draftId)
      if (index === -1) return { state: 'refused', code: 'draft-not-found' }
      if (request.proposedText.length > EDIT_DRAFT_MAX_CHARACTERS) return { state: 'refused', code: 'draft-proposed-too-large' }
      const record = records[index]!
      // A new proposal is a new action identity: any prepared card for the old bytes is retired.
      retirePrepared(record)
      record.proposedText = request.proposedText
      record.updatedAt = deps.now()
      record.writeback = { state: 'none' }
      return { state: 'updated', draft: view(record) }
    },

    async diff(request) {
      const index = indexOf(request.draftId)
      if (index === -1) return { state: 'refused', code: 'draft-not-found' }
      const record = records[index]!
      const stat = await statOf(record.workspaceRoot, record.path)
      if (!stat.ok) {
        record.sourceState = 'not-readable'
        record.lastCurrentVersion = null
      } else if (stat.version === record.basedVersion) {
        record.sourceState = 'unchanged'
        record.lastCurrentVersion = stat.version
      } else {
        record.sourceState = 'changed'
        record.lastCurrentVersion = stat.version
      }
      const lines = diffLines(linesOf(record.basedText), linesOf(record.proposedText))
      const diff: EditDraftDiff = {
        draftId: record.draftId,
        basedVersion: record.basedVersion,
        currentVersion: record.lastCurrentVersion,
        sourceChanged: record.sourceState === 'changed',
        addedLines: lines.filter((line) => line.kind === 'add').length,
        removedLines: lines.filter((line) => line.kind === 'remove').length,
        lines: lines.slice(0, EDIT_DRAFT_DIFF_MAX_LINES),
        truncated: lines.length > EDIT_DRAFT_DIFF_MAX_LINES,
      }
      return { state: 'read', diff }
    },

    async prepareWriteback(request) {
      const index = indexOf(request.draftId)
      if (index === -1) return { state: 'refused', draftId: request.draftId, code: 'draft-not-found' }
      const record = records[index]!
      if (record.basedText === record.proposedText) {
        return { state: 'refused', draftId: request.draftId, code: 'draft-unchanged' }
      }
      const stat = await statOf(record.workspaceRoot, record.path)
      if (!stat.ok) {
        record.sourceState = 'not-readable'
        record.lastCurrentVersion = null
        return { state: 'refused', draftId: request.draftId, code: 'source-unreadable' }
      }
      if (stat.version !== record.basedVersion) {
        record.sourceState = 'changed'
        record.lastCurrentVersion = stat.version
        retirePrepared(record)
        record.writeback = { state: 'refused', code: 'writeback-source-changed' }
        return { state: 'refused', draftId: request.draftId, code: 'writeback-source-changed' }
      }
      record.sourceState = 'unchanged'
      record.lastCurrentVersion = stat.version
      // Card and record come from the shared store, so the credential the confirm gate consumes
      // is exactly the one this preview minted — bound to the based version and proposed bytes.
      const intent = intentOf(record)
      const stored = deps.confirmations.store.prepare(intent, deps.confirmations.facts(intent))
      const card: EditDraftWritebackCard = {
        confirmationId: stored.confirmationId,
        preparedAt: deps.now(),
        target: { matterRef: record.matterRef, draftId: record.draftId, path: record.path },
        action: 'writeback-source-file',
        targetVersion: record.basedVersion,
        currentVersion: stat.version,
        impact: impactOf(record),
        costEstimate: { state: 'unavailable', note: 'estimate-unavailable' },
        effect: 'not-yet-happened',
      }
      record.confirmationId = stored.confirmationId
      record.writeback = {
        state: 'prepared',
        confirmationId: stored.confirmationId,
        preparedAt: card.preparedAt,
        targetVersion: card.targetVersion,
        currentVersion: stat.version,
        impact: card.impact,
      }
      return { state: 'prepared', draftId: record.draftId, card }
    },

    async writeback(request) {
      const index = indexOf(request.draftId)
      if (index === -1) return { state: 'refused', draftId: request.draftId, code: 'draft-not-found' }
      const record = records[index]!
      const stat = await statOf(record.workspaceRoot, record.path)
      if (!stat.ok) {
        record.sourceState = 'not-readable'
        record.lastCurrentVersion = null
        return { state: 'refused', draftId: request.draftId, code: 'source-unreadable' }
      }
      if (stat.version !== record.basedVersion) {
        // The source moved on: the prepared card dies here and never comes back (US-126).
        record.sourceState = 'changed'
        record.lastCurrentVersion = stat.version
        retirePrepared(record)
        record.writeback = { state: 'refused', code: 'writeback-source-changed' }
        return { state: 'refused', draftId: request.draftId, code: 'writeback-source-changed' }
      }
      // The write port is checked before the confirmation is spent: an unwired port answers
      // not-ready and the prepared card stays unconsumed for the day the port exists.
      const execute = deps.executeWriteback
      if (execute === undefined) {
        record.writeback = { state: 'not-ready', code: 'writeback-unavailable' }
        return { state: 'not-ready', draftId: request.draftId, code: 'writeback-unavailable' }
      }
      const intent = intentOf(record)
      const verdict = deps.confirmations.store.consume(intent, request.confirmationId, deps.confirmations.facts(intent))
      if (!verdict.ok) {
        record.writeback = { state: 'refused', code: verdict.code }
        return { state: 'refused', draftId: request.draftId, code: verdict.code }
      }
      record.confirmationId = null
      let answer: EditDraftWritebackAnswer | { readonly failed: true }
      try {
        answer = await execute({
          matterRef: record.matterRef,
          path: record.path,
          absolutePath: record.absolutePath,
          targetVersion: record.basedVersion,
          proposedText: record.proposedText,
        })
      } catch {
        // A throwing executor says nothing about what landed: unknown, never failed.
        answer = { failed: true }
      }
      if ('receiptRef' in answer) {
        record.writeback = { state: 'written', receiptRef: answer.receiptRef }
        return { state: 'written', draftId: record.draftId, receiptRef: answer.receiptRef }
      }
      if ('outcome' in answer) {
        record.writeback = { state: 'unknown', code: answer.code }
        return { state: 'unknown', draftId: record.draftId, code: answer.code }
      }
      if ('denied' in answer) {
        record.writeback = { state: 'refused', code: answer.denied }
        return { state: 'refused', draftId: record.draftId, code: answer.denied }
      }
      record.writeback = { state: 'unknown', code: 'writeback-executor-failed' }
      return { state: 'unknown', draftId: record.draftId, code: 'writeback-executor-failed' }
    },
  }
}
