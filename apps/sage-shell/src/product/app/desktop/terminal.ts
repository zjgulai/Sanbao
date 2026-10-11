import { SAGE_REQUEST_TIMEOUT_MS } from '../../contracts.js'

/** ADR-0314 (M03): the terminal page read — the existing compliant route (Ticket 043). Read-only:
 *  the body carries exactly the listed terminalId; nothing here writes, and the page never enters
 *  the conversation or the artifact list. Refusals keep their named code. */
const SAGE_SESSION_TERMINAL_READ_PATH = '/.sage/session/terminal-read'

export type DesktopTerminalRead =
  | {
    readonly state: 'read'
    readonly text: string
    readonly totalLines: number
    readonly lineBegin: number
    readonly lineEnd: number
    readonly truncated: boolean
  }
  | { readonly state: 'refused'; readonly code: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export async function readDesktopTerminal(terminalId: string): Promise<DesktopTerminalRead> {
  try {
    const response = await fetch(SAGE_SESSION_TERMINAL_READ_PATH, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ terminalId }),
      cache: 'no-store', signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return { state: 'refused', code: 'terminal-read-unavailable' }
    const result: unknown = await response.json()
    if (!isRecord(result)) return { state: 'refused', code: 'terminal-read-unavailable' }
    if (result.state === 'refused' || result.state === 'unavailable') {
      // Review fix: the route's own named code (terminal-no-session / terminal-not-listed /
      // terminal-range-invalid / bridge codes) passes through — it is never flattened away.
      return { state: 'refused', code: typeof result.code === 'string' && result.code !== '' ? result.code : 'terminal-read-unavailable' }
    }
    if (result.state !== 'read' || typeof result.text !== 'string') return { state: 'refused', code: 'terminal-read-unavailable' }
    return {
      state: 'read', text: result.text,
      totalLines: safeCount(result.totalLines), lineBegin: safeCount(result.lineBegin), lineEnd: safeCount(result.lineEnd),
      truncated: result.truncated === true,
    }
  } catch {
    return { state: 'refused', code: 'terminal-read-unavailable' }
  }
}
