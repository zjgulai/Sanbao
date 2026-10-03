/** Ticket 024 (FW-019, US-102~106): side chats — child sessions forked from a matter's main chat.
 *
 * The evidenced semantics (ADR-0205): `sessionController.fork({sessionId, atSeq?})` derives a child
 * from a **completed-turn prefix** — with no anchor it cuts at the last `turn/end`; an anchor inside
 * an unfinished turn is refused with `session/fork-unavailable`; the child is seeded with those
 * events and inherits cwd/preset, and nothing of it is written back into the parent log.
 *
 * What this module adds on top, and deliberately does not:
 *
 * - prompts in a side chat go to the CHILD session only — the main chat's history is untouched by
 *   opening, reading, or talking in a side chat (US-102/104);
 * - the matter still binds one main session; side chats are records next to it (US-103), persisted
 *   so a reopen lists and rereads them without forking again;
 * - bringing text back to the main chat is an explicit act that rides the ONE main send path
 *   (ack ≠ execution and all) — there is no automatic merge anywhere (US-105).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
  SessionChannelEntry,
  SessionChannelStatus,
  SideChatCreateOutcome,
  SideChatReadOutcome,
  SideChatRecord,
  SideChatReturnOutcome,
  SideChatSendOutcome,
  SideChatsStatus,
} from '../appservice/contracts.js'
import { foldSessionFrames } from './session-channel.js'
import type { BridgeCaller } from './workspace-adoption.js'

const MAX_TEXT = 16_384
const MAX_SIDE_CHATS = 16

function asAnswer(value: unknown): { readonly ok: true, readonly result: unknown } | { readonly ok: false, readonly code: string } {
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === true) {
    return { ok: true, result: (value as { result?: unknown }).result }
  }
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === false
    && typeof (value as { code?: unknown }).code === 'string') {
    return { ok: false, code: (value as { code: string }).code }
  }
  return { ok: false, code: 'bridge-answer-unrecognised' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

interface PersistedSideChat {
  readonly sideChatId: string
  readonly sessionId: string
  readonly atSeq: number | null
  readonly createdAt: string
}

interface LiveRecord extends PersistedSideChat {
  readonly matterRef: string
  execution: 'idle' | 'executing' | 'not-read'
  lastTurnEnd: string | null
}

export interface SideChatsDeps {
  readonly callBridge: BridgeCaller
  readonly streamCall: (endpoint: string, payload: readonly unknown[], onFrame: (frame: unknown) => boolean) => Promise<unknown>
  /** The matter's main session — created through the same explicit path everything else uses. */
  readonly ensureMainSession: (matterRef: string) => Promise<{ readonly ok: true, readonly sessionId: string } | { readonly ok: false, readonly code: string }>
  /** Sends carried-back text through the ONE main send path (echoes and pause semantics follow it). */
  readonly sendToMain: (matterRef: string, text: string) => Promise<{ readonly state: 'accepted' | 'deferred' | 'refused', readonly code?: string }>
  readonly isPaused: (matterRef: string) => boolean
  readonly now: () => string
  readonly nextId: () => string
  readonly file: string
}

export interface SideChats {
  readonly create: (matterRef: string) => Promise<SideChatCreateOutcome>
  readonly send: (input: { readonly sideChatId: string, readonly text: string }) => Promise<SideChatSendOutcome>
  readonly read: (input: { readonly sideChatId: string }) => Promise<SideChatReadOutcome>
  readonly returnToMain: (input: { readonly sideChatId: string, readonly text: string }) => Promise<SideChatReturnOutcome>
  readonly list: (matterRef: string) => SideChatsStatus
  /** Test seam for the projection: the store never merges side content anywhere by itself. */
}

export function createSideChats(deps: SideChatsDeps): SideChats {
  const records: LiveRecord[] = []
  const echoes = new Map<string, Array<{ readonly requestId: string, readonly text: string, readonly at: string }>>()

  const readPersisted = (): { readonly ok: boolean, readonly entries: readonly (PersistedSideChat & { readonly matterRef: string })[] } => {
    try {
      if (!existsSync(deps.file)) return { ok: true, entries: [] }
      const value = JSON.parse(readFileSync(deps.file, 'utf8')) as unknown
      if (!isRecord(value)) return { ok: false, entries: [] }
      const entries: Array<PersistedSideChat & { matterRef: string }> = []
      for (const [matterRef, list] of Object.entries(value)) {
        if (!Array.isArray(list)) return { ok: false, entries: [] }
        for (const item of list) {
          if (!isRecord(item)
            || typeof item.sideChatId !== 'string' || item.sideChatId === ''
            || typeof item.sessionId !== 'string' || item.sessionId === ''
            || (item.atSeq !== null && (typeof item.atSeq !== 'number' || !Number.isSafeInteger(item.atSeq)))
            || typeof item.createdAt !== 'string') {
            return { ok: false, entries: [] }
          }
          entries.push({ matterRef, sideChatId: item.sideChatId, sessionId: item.sessionId, atSeq: item.atSeq as number | null, createdAt: item.createdAt })
        }
      }
      return { ok: true, entries }
    } catch {
      return { ok: false, entries: [] }
    }
  }

  const load = (): boolean => {
    if (records.length > 0) return true
    const persisted = readPersisted()
    if (!persisted.ok) return false
    for (const entry of persisted.entries) {
      records.push({ ...entry, execution: 'not-read', lastTurnEnd: null })
    }
    return true
  }

  const persist = (): boolean => {
    try {
      const grouped: Record<string, PersistedSideChat[]> = {}
      for (const record of records) {
        ;(grouped[record.matterRef] ??= []).push({
          sideChatId: record.sideChatId,
          sessionId: record.sessionId,
          atSeq: record.atSeq,
          createdAt: record.createdAt,
        })
      }
      mkdirSync(join(deps.file, '..'), { recursive: true, mode: 0o700 })
      writeFileSync(deps.file, JSON.stringify(grouped, null, 2), { mode: 0o600 })
      return true
    } catch {
      return false
    }
  }

  const find = (sideChatId: string): LiveRecord | undefined => records.find((record) => record.sideChatId === sideChatId)

  const project = (record: LiveRecord): SideChatRecord => ({
    sideChatId: record.sideChatId,
    sessionId: record.sessionId,
    atSeq: record.atSeq,
    createdAt: record.createdAt,
    execution: record.execution,
    lastTurnEnd: record.lastTurnEnd,
  })

  const refreshFold = async (record: LiveRecord): Promise<SessionChannelStatus | { readonly code: string }> => {
    const frames: unknown[] = []
    let streamBroken = false
    let code: string | null = null
    try {
      const answer = asAnswer(await deps.streamCall('session/follow', [{ sessionId: record.sessionId }], (frame) => { frames.push(frame); return frames.length < 512 }))
      if (!answer.ok) {
        streamBroken = true
        code = answer.code
      }
    } catch (error) {
      streamBroken = true
      code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
    }
    let fold = foldSessionFrames(frames)
    let reconciled = false
    if (streamBroken || fold.assistantText === null) {
      const page = asAnswer(await deps.callBridge('session/page', [{
        sessionId: record.sessionId,
        throughSeq: fold.cursor < 0 ? 0 : fold.cursor,
        maxMessages: 200,
      }]))
      if (page.ok && isRecord(page.result) && Array.isArray(page.result.records)) {
        const pageFold = foldSessionFrames(page.result.records.map((entry) => entry))
        fold = {
          ...fold,
          assistantText: pageFold.assistantText ?? fold.assistantText,
          executingTurn: pageFold.executingTurn,
          lastTurnEnd: pageFold.lastTurnEnd,
          unapplied: fold.unapplied + pageFold.unapplied,
          records: fold.records + page.result.records.length,
        }
        reconciled = true
        if (streamBroken && pageFold.assistantText !== null) streamBroken = false
        if (streamBroken) code = code ?? 'reconcile-empty'
      } else if (streamBroken) {
        code = code ?? (page.ok ? 'reconcile-unrecognised' : page.code)
      }
    }
    record.execution = fold.executingTurn === null ? 'idle' : 'executing'
    record.lastTurnEnd = fold.lastTurnEnd
    const transcript: SessionChannelEntry[] = []
    for (const echo of echoes.get(record.sideChatId) ?? []) {
      transcript.push({ role: 'user', text: echo.text, source: 'echo', at: echo.at, attachments: [] })
    }
    if (fold.assistantText !== null && fold.assistantText !== '') {
      transcript.push({ role: 'assistant', text: fold.assistantText, source: 'history', at: null, attachments: [] })
    }
    const reply = {
      text: fold.assistantText,
      endKind: fold.lastTurnEnd,
      failed: fold.lastTurnEnd === 'error',
      actions: (fold.assistantText === null || fold.assistantText === ''
        ? []
        : fold.lastTurnEnd === 'error' ? ['copy', 'quote', 'retry'] : ['copy', 'quote']) as readonly ('copy' | 'quote' | 'retry')[],
    }
    return {
      state: 'read',
      sessionId: record.sessionId,
      execution: fold.executingTurn === null ? 'idle' : 'executing',
      lastTurnEnd: fold.lastTurnEnd,
      reply,
      transcript,
      reconciled,
      streamBroken,
      code,
      records: fold.records,
      unapplied: fold.unapplied,
      paused: false,
      queue: { state: 'unavailable' as const, occurrences: [] },
      pending: [],
    }
  }

  return {
    async create(matterRef) {
      if (!load()) return { state: 'refused', code: 'side-chat-store-unreadable' }
      if (records.filter((record) => record.matterRef === matterRef).length >= MAX_SIDE_CHATS) {
        return { state: 'refused', code: 'side-chat-limit' }
      }
      const main = await deps.ensureMainSession(matterRef)
      if (!main.ok) return { state: 'refused', code: main.code }
      const forked = asAnswer(await deps.callBridge('session/fork', [{ sessionId: main.sessionId }]))
      if (!forked.ok) return { state: 'refused', code: forked.code }
      const childId = isRecord(forked.result) && typeof forked.result.sessionId === 'string' && forked.result.sessionId !== ''
        ? forked.result.sessionId
        : undefined
      if (childId === undefined) return { state: 'refused', code: 'bridge-answer-unrecognised' }
      const record: LiveRecord = {
        sideChatId: `side-${deps.nextId()}`,
        matterRef,
        sessionId: childId,
        atSeq: null,
        createdAt: deps.now(),
        execution: 'not-read',
        lastTurnEnd: null,
      }
      records.push(record)
      if (!persist()) {
        records.pop()
        return { state: 'refused', code: 'side-chat-store-unreadable' }
      }
      return { state: 'created', item: project(record) }
    },

    async send(input) {
      if (!load()) return { state: 'refused', code: 'side-chat-store-unreadable' }
      const record = find(input.sideChatId)
      if (record === undefined) return { state: 'refused', code: 'side-chat-unknown' }
      // Pause is the matter's main-chat contract; a side chat refuses instead of quietly deferring.
      if (deps.isPaused(record.matterRef)) return { state: 'refused', code: 'side-chat-paused' }
      const text = input.text.trim()
      if (text === '' || text.length > MAX_TEXT) return { state: 'refused', code: 'side-chat-text-invalid' }
      const requestId = `side-${deps.nextId()}`
      const answer = asAnswer(await deps.callBridge('session/prompt', [{
        requestId,
        sessionId: record.sessionId,
        mode: 'queue',
        text,
      }]))
      if (!answer.ok) return { state: 'refused', code: answer.code }
      if (!(isRecord(answer.result) && answer.result.accepted === true)) {
        return { state: 'refused', code: 'bridge-answer-unrecognised' }
      }
      const list = echoes.get(record.sideChatId) ?? []
      list.push({ requestId, text, at: deps.now() })
      echoes.set(record.sideChatId, list)
      return { state: 'accepted', requestId }
    },

    async read(input) {
      if (!load()) return { state: 'refused', code: 'side-chat-store-unreadable' }
      const record = find(input.sideChatId)
      if (record === undefined) return { state: 'refused', code: 'side-chat-unknown' }
      const channel = await refreshFold(record)
      if ('code' in channel && !('state' in channel)) return { state: 'refused', code: channel.code }
      return { state: 'read', item: project(record), channel: channel as SessionChannelStatus }
    },

    async returnToMain(input) {
      if (!load()) return { state: 'refused', code: 'side-chat-store-unreadable' }
      const record = find(input.sideChatId)
      if (record === undefined) return { state: 'refused', code: 'side-chat-unknown' }
      const text = input.text.trim()
      if (text === '' || text.length > MAX_TEXT) return { state: 'refused', code: 'side-chat-text-invalid' }
      // The explicit act: the text enters the MAIN chat as a normal prompt through the one send
      // path. The side chat's own history is not touched, and nothing merges on its own (US-105).
      const sent = await deps.sendToMain(record.matterRef, text)
      if (sent.state !== 'accepted') return { state: 'refused', code: sent.code ?? 'side-return-failed' }
      return { state: 'accepted', mainRequestId: `side-${record.sideChatId}` }
    },

    list(matterRef) {
      if (!load()) return { state: 'unavailable', code: 'side-chat-store-unreadable', items: [] }
      return {
        state: 'read',
        code: null,
        items: records.filter((record) => record.matterRef === matterRef).map(project),
      }
    },
  }
}
