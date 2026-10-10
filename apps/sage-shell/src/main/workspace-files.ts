/** Ticket 013: local file references — candidates, one stat at creation, live reads at use.
 *
 * Three rules carry the ticket's acceptance:
 *
 * - **Creating a reference reads no content.** A reference is a stat (identity + opaque version
 *   token) plus the path it came from; `read` is never called on this path.
 * - **Use is a fresh stat first.** The stored version token is compared with the file's current
 *   token; unequal means the source changed, and the use is blocked *before* any content read —
 *   the surface gets `source-changed` and the reference keeps the version it was created with.
 * - **References come from candidates only.** A candidate is a workspace-relative path produced by
 *   the base's own `list` (which refuses anything outside the workspace root); the main side
 *   refuses an absolute path or a `..` segment one hop earlier, so an outside path can never be
 *   named as a reference even if a caller asks for it directly.
 */
import type {
  FileCandidate,
  FileCandidateStatus,
  FileReferenceOutcome,
  FileReferenceRecord,
  FileReferenceUse,
} from '../appservice/contracts.js'
import type { BridgeCaller } from './workspace-adoption.js'

interface BridgeAnswer {
  readonly ok: boolean
  readonly result?: unknown
  readonly code?: string
}

export function asAnswer(value: unknown): BridgeAnswer {
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === true) {
    return { ok: true, result: (value as { result?: unknown }).result }
  }
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === false
    && typeof (value as { code?: unknown }).code === 'string') {
    return { ok: false, code: (value as { code: string }).code }
  }
  return { ok: false, code: 'bridge-answer-unrecognised' }
}

export function readString(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'string' && candidate !== '' ? candidate : undefined
}

/** A reference may only name a path inside its workspace root: every segment is an ordinary name,
 *  which rejects absolute paths (their leading segment is empty) and `.`/`..` in one rule. */
export function isWorkspaceRelativePath(path: string): boolean {
  if (path === '' || path.length > 4096 || path.includes('\u0000')) return false
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

function isEligibleFileCandidate(value: unknown): value is { name: string, size?: number } {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.name === 'string' && record.name !== '' && record.type === 'file'
}

/** One directory listing, strictly: a listing that does not parse is a refusal, not an empty folder. */
export function createFileCandidates(callBridge: BridgeCaller) {
  return async (request: { readonly workspaceRoot: string, readonly path: string }): Promise<FileCandidateStatus> => {
    const { workspaceRoot, path } = request
    if (path !== '' && !isWorkspaceRelativePath(path)) {
      return { state: 'refused', code: 'file-path-outside-workspace', entries: [], truncated: false, path: '' }
    }
    const answer = asAnswer(await callBridge('workspaceFiles/list', [{ workspaceRoot, path }]))
    if (!answer.ok) {
      return { state: 'refused', code: answer.code ?? 'bridge-answer-unrecognised', entries: [], truncated: false, path: '' }
    }
    const listing = answer.result
    const rawEntries = (listing as { entries?: unknown } | null | undefined)?.entries
    // The listed directory's own path may be '' (the workspace root itself), so it is read as a
    // string, not as a non-empty literal.
    const listedPath = (listing as { path?: unknown } | null | undefined)?.path
    if (typeof listedPath !== 'string' || !Array.isArray(rawEntries)) {
      return { state: 'refused', code: 'bridge-answer-unrecognised', entries: [], truncated: false, path: '' }
    }
    const entries = rawEntries.filter(isEligibleFileCandidate).map((entry): FileCandidate => ({
      name: entry.name,
      // The candidate's own workspace-relative path: root-relative, joined by `/`.
      path: listedPath === '' ? entry.name : `${listedPath}/${entry.name}`,
      ...(typeof entry.size === 'number' ? { bytes: entry.size } : {}),
    }))
    const truncated = (listing as { truncated?: unknown }).truncated === true
    return { state: 'read', code: null, entries, truncated, path: listedPath }
  }
}

export interface FileReferenceStore {
  readonly list: () => readonly FileReferenceRecord[]
  readonly create: (request: { readonly matterRef: string, readonly workspaceRoot: string, readonly path: string }) => Promise<FileReferenceOutcome>
  readonly use: (request: { readonly referenceId: string }) => Promise<FileReferenceUse>
}

/** In-process reference records: this run only, and the surface says so. */
export function createFileReferences(callBridge: BridgeCaller, options: {
  readonly now: () => string
  readonly nextId: () => string
}): FileReferenceStore {
  const references: FileReferenceRecord[] = []

  const statOf = async (workspaceRoot: string, path: string): Promise<{ ok: true, absolutePath: string, version: string, bytes?: number } | { ok: false, code: string }> => {
    const answer = asAnswer(await callBridge('workspaceFiles/stat', [{ workspaceRoot, path }]))
    if (!answer.ok) return { ok: false, code: answer.code ?? 'bridge-answer-unrecognised' }
    const absolutePath = readString(answer.result, 'absolutePath')
    const version = readString(answer.result, 'version')
    if (absolutePath === undefined || version === undefined) return { ok: false, code: 'bridge-answer-unrecognised' }
    const bytes = (answer.result as { bytes?: unknown }).bytes
    return typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 0
      ? { ok: true, absolutePath, version, bytes }
      : { ok: true, absolutePath, version }
  }

  return {
    list: () => references,
    async create(request) {
      if (!isWorkspaceRelativePath(request.path)) {
        return { state: 'refused', code: 'file-path-outside-workspace', reference: null }
      }
      // A reference is a stat and nothing else: no `read`, no directory walk.
      const stat = await statOf(request.workspaceRoot, request.path)
      if (!stat.ok) return { state: 'refused', code: stat.code, reference: null }
      const reference: FileReferenceRecord = {
        referenceId: options.nextId(),
        matterRef: request.matterRef,
        workspaceRoot: request.workspaceRoot,
        path: request.path,
        absolutePath: stat.absolutePath,
        // The version token as of creation; "history points at the version of that moment" *is*
        // this field — a later change to the file never rewrites it.
        version: stat.version,
        ...(stat.bytes === undefined ? {} : { bytes: stat.bytes }),
        createdAt: options.now(),
        lastUse: 'unused',
      }
      references.push(reference)
      return { state: 'created', code: null, reference }
    },
    async use(request) {
      const referenceId = request.referenceId
      const index = references.findIndex((entry) => entry.referenceId === referenceId)
      const reference = references[index]
      if (reference === undefined) return { state: 'unknown', code: 'reference-not-found', reference: null, text: null }
      // Re-stat first: the version token decides whether the content may be read at all.
      const stat = await statOf(reference.workspaceRoot, reference.path)
      if (!stat.ok) {
        const stale = { ...reference, lastUse: 'stale' as const }
        references[index] = stale
        // Not readable now is not the same fact as "the file was deleted", and the sentence the
        // surface shows is built from this code — never from a claim about the file's fate.
        return { state: 'stale', code: stat.code === 'bridge-file-not-found' ? 'source-not-readable' : stat.code, reference: stale, text: null }
      }
      if (stat.version !== reference.version) {
        const stale = { ...reference, lastUse: 'stale' as const }
        references[index] = stale
        // Blocked before any content read: the answer carries the version the file has *now* so the
        // surface can say what changed, but not a byte of the changed file.
        return { state: 'stale', code: 'source-changed', reference: stale, text: null }
      }
      const answer = asAnswer(await callBridge('workspaceFiles/read', [{ workspaceRoot: reference.workspaceRoot, path: reference.path, range: { offset: 1, limit: 200 } }]))
      if (!answer.ok) {
        const stale = { ...reference, lastUse: 'stale' as const }
        references[index] = stale
        return { state: 'stale', code: answer.code ?? 'bridge-answer-unrecognised', reference: stale, text: null }
      }
      const text = (answer.result as { text?: unknown } | null | undefined)?.text
      const readVersion = readString(answer.result, 'version')
      if (typeof text !== 'string' || readVersion === undefined) {
        return { state: 'stale', code: 'bridge-answer-unrecognised', reference, text: null }
      }
      // A read whose own stat already moved on is not the content the reference promised.
      if (readVersion !== reference.version) {
        const stale = { ...reference, lastUse: 'stale' as const }
        references[index] = stale
        return { state: 'stale', code: 'source-changed', reference: stale, text: null }
      }
      const used = { ...reference, lastUse: 'live' as const }
      references[index] = used
      return { state: 'live', code: null, reference: used, text }
    },
  }
}
