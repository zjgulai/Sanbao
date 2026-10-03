/** Ticket 043 (US-203/204): the read-only integrated terminal over the base's PTY registry.
 *
 * The rules the ticket names:
 *
 * - **The panel lives in the workspace's side surface and only OBSERVES**: the session list and
 *   the scrollback pages come from `ctx.terminals` (owner-scoped to the live agent); there is NO
 *   write face at all — no spawn, no kill, no signal, no send — so the panel cannot cancel a run
 *   and terminal output can never re-enter the conversation or the artifact list. The whole store
 *   touches exactly two read endpoints, and its call table is asserted.
 * - **No capability is a named 未就绪 with its missing item** (acceptance 1): a profile without the
 *   terminals service answers `bridge-provider-unavailable`, which the store maps to
 *   `unavailable` + reason — the surface shows the gap, never an empty terminal.
 * - **Only listed sessions can be paged** (the same discipline as 038's selectors): a page read
 *   validates the id against the last list projection, so a vanished session refuses by name
 *   (`terminal-not-listed` — "不是已失效") instead of scraping an id from nowhere.
 * - **Output is a bounded observation page**: `{text ≤ 64KiB, totalLines, lineBegin, lineEnd,
 *   truncated}` exactly as the base reports; offsets/counts validate at the route.
 */
import { readFileSync } from 'node:fs'

import type { TerminalReadOutcome, TerminalSessionView, TerminalStatus } from '../appservice/contracts.js'
import type { BridgeCaller } from './workspace-adoption.js'

const MAX_TERMINALS = 16
const MAX_OFFSET = 1_000_000
const MAX_LINES = 500

export interface TerminalDeps {
  readonly callBridge: BridgeCaller
  readonly bindingsFile: string
  readonly now: () => string
}

export interface TerminalStore {
  readonly status: (input: { readonly matterRef: string }) => Promise<TerminalStatus>
  readonly read: (input: { readonly matterRef: string, readonly terminalId: string, readonly offset?: number, readonly lines?: number }) => Promise<TerminalReadOutcome>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function bounded(value: unknown, max: number): string | null {
  return typeof value === 'string' && value !== '' && value === value.trim() && value.length <= max
    ? value
    : null
}

export function createTerminal(deps: TerminalDeps): TerminalStore {
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

  const cache = new Map<string, readonly TerminalSessionView[]>()

  const viewOf = (value: unknown): TerminalSessionView | null => {
    if (!isRecord(value)) return null
    const terminalId = bounded(value.terminalId, 128)
    const type = bounded(value.type, 64)
    const status = isRecord(value.status) ? value.status : null
    if (terminalId === null || type === null || status === null) return null
    const name = value.name === undefined || value.name === null ? null : bounded(value.name, 128)
    if (status.kind === 'running') return { terminalId, name, type, status: { kind: 'running' } }
    if (status.kind !== 'exited') return null
    const exitCode = typeof status.exitCode === 'number' && Number.isSafeInteger(status.exitCode) ? status.exitCode : null
    const signal = status.signal === undefined || status.signal === null ? null : bounded(status.signal, 32)
    return { terminalId, name, type, status: { kind: 'exited', exitCode, signal } }
  }

  return {
    async status(input) {
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return { state: 'no-session', reason: null, terminals: [] }
      let answer: unknown
      try {
        answer = await deps.callBridge('session/terminals', [{ sessionId }])
      } catch (error) {
        const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
        return { state: 'unavailable', reason: code, terminals: [] }
      }
      const record = isRecord(answer) ? answer : null
      if (record === null || record.ok !== true) {
        const code = record !== null && record.ok === false && typeof record.code === 'string' ? record.code : 'terminal-unrecognised'
        return { state: 'unavailable', reason: code, terminals: [] }
      }
      const result = record.result
      const rawRows = isRecord(result) && Array.isArray(result.terminals) ? result.terminals : null
      if (rawRows === null) return { state: 'unavailable', reason: 'terminal-unrecognised', terminals: [] }
      const terminals = rawRows.slice(0, MAX_TERMINALS).map(viewOf)
        .filter((row): row is TerminalSessionView => row !== null)
      cache.set(sessionId, terminals)
      return { state: 'read', reason: null, terminals }
    },

    async read(input) {
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return { state: 'refused', code: 'terminal-no-session' }
      if (input.offset !== undefined && (!Number.isSafeInteger(input.offset) || input.offset < 0 || input.offset > MAX_OFFSET)) {
        return { state: 'refused', code: 'terminal-range-invalid' }
      }
      if (input.lines !== undefined && (!Number.isSafeInteger(input.lines) || input.lines < 1 || input.lines > MAX_LINES)) {
        return { state: 'refused', code: 'terminal-range-invalid' }
      }
      const listed = cache.get(sessionId)
      if (listed === undefined || !listed.some((entry) => entry.terminalId === input.terminalId)) {
        // Same discipline as the input-area selectors: an id that is not in the current list is
        // refused by name ("不是已失效"), never paged from nowhere.
        return { state: 'refused', code: 'terminal-not-listed' }
      }
      let answer: unknown
      try {
        answer = await deps.callBridge('session/terminal-read', [{
          sessionId,
          terminalId: input.terminalId,
          ...(input.offset === undefined ? {} : { offset: input.offset }),
          ...(input.lines === undefined ? {} : { count: input.lines }),
        }])
      } catch (error) {
        const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
        return { state: 'unavailable', code }
      }
      const record = isRecord(answer) ? answer : null
      if (record === null || record.ok !== true) {
        const code = record !== null && record.ok === false && typeof record.code === 'string' ? record.code : 'terminal-unrecognised'
        return { state: 'unavailable', code }
      }
      const result = record.result
      if (!isRecord(result) || typeof result.text !== 'string') return { state: 'unavailable', code: 'terminal-unrecognised' }
      return {
        state: 'read',
        text: result.text,
        totalLines: typeof result.totalLines === 'number' ? result.totalLines : 0,
        lineBegin: typeof result.lineBegin === 'number' ? result.lineBegin : 0,
        lineEnd: typeof result.lineEnd === 'number' ? result.lineEnd : 0,
        truncated: result.truncated === true,
      }
    },
  }
}
