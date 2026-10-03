/** Ticket 031 (US-164, S5): the run log — a bounded, cursor-based, read-only read of one
 *  workspace file. This is the content-read port reused for logs: stat for the version, `read`
 *  for one line page, the same path and scope discipline as the edit drafts — no watcher, no
 *  tail daemon, no writer. Nothing here touches the session or the transcript: reading a log is
 *  never conversation sync, and there is no export path at all (D-033/034/059 stays a separate
 *  authorization).
 */
import type { RunLogLine, RunLogOutcome } from '../appservice/contracts.js'
import { asAnswer, isWorkspaceRelativePath, readString } from './workspace-files.js'
import type { BridgeCaller } from './workspace-adoption.js'

/** One page per read; the caller continues with the returned cursor. */
const RUN_LOG_PAGE_LINES = 200
/** One line beyond this is cut with an explicit marker — a silently shortened line reads as whole. */
const RUN_LOG_MAX_LINE_CHARACTERS = 2000

export type RunLogReader = (request: {
  readonly workspaceRoot: string
  readonly path: string
  readonly fromLine?: number
  /** The cursor's file version and size as the caller last saw them. A live log grows — that is
   *  normal and keeps the cursor; only a SHRUNK file voids it (rotation/truncation). A same-size
   *  rewrite is undetectable through this port and stays a known limitation. */
  readonly expectVersion?: string
  readonly expectBytes?: number
}) => Promise<RunLogOutcome>

export function createRunLogs(callBridge: BridgeCaller): RunLogReader {
  return async (request) => {
    if (!isWorkspaceRelativePath(request.path)) return { state: 'refused', code: 'log-path-outside-workspace' }
    const fromLine = request.fromLine ?? 1
    if (!Number.isSafeInteger(fromLine) || fromLine < 1) return { state: 'refused', code: 'log-cursor-invalid' }
    const stat = asAnswer(await callBridge('workspaceFiles/stat', [{ workspaceRoot: request.workspaceRoot, path: request.path }]))
    if (!stat.ok) return { state: 'refused', code: stat.code ?? 'bridge-answer-unrecognised' }
    const version = readString(stat.result, 'version')
    if (version === undefined) return { state: 'refused', code: 'bridge-answer-unrecognised' }
    const bytes = (stat.result as { bytes?: unknown } | null | undefined)?.bytes
    const statBytes = typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : undefined
    // A live log grows on every append — that must keep the cursor, so a mere version change is
    // not a rotation. Only a file that SHRANK below what the caller last saw voids the cursor,
    // with a marked restart instruction instead of a guess.
    if (request.expectVersion !== undefined && request.expectVersion !== version
      && request.expectBytes !== undefined && statBytes !== undefined && statBytes < request.expectBytes) {
      return { state: 'read', path: request.path, version, fromLine, nextLine: fromLine, lines: [], eof: false, truncatedLines: 0, rotation: 'file-rotated' }
    }
    const answer = asAnswer(await callBridge('workspaceFiles/read', [{
      workspaceRoot: request.workspaceRoot,
      path: request.path,
      range: { offset: fromLine, limit: RUN_LOG_PAGE_LINES },
    }]))
    if (!answer.ok) return { state: 'refused', code: answer.code ?? 'bridge-answer-unrecognised' }
    const text = (answer.result as { text?: unknown } | null | undefined)?.text
    const lines = (answer.result as { lines?: unknown } | null | undefined)?.lines
    const eof = (answer.result as { eof?: unknown } | null | undefined)?.eof
    if (typeof text !== 'string' || typeof lines !== 'number' || typeof eof !== 'boolean') {
      return { state: 'refused', code: 'bridge-answer-unrecognised' }
    }
    let truncatedLines = 0
    const page: RunLogLine[] = (text === '' ? [] : text.split('\n')).map((line, index) => {
      if (line.length > RUN_LOG_MAX_LINE_CHARACTERS) {
        truncatedLines += 1
        return { no: fromLine + index, text: `${line.slice(0, RUN_LOG_MAX_LINE_CHARACTERS)}…（本行超长，已截断）` }
      }
      return { no: fromLine + index, text: line }
    })
    return {
      state: 'read',
      path: request.path,
      version,
      fromLine,
      nextLine: fromLine + page.length,
      lines: page,
      eof,
      truncatedLines,
      rotation: null,
    }
  }
}
