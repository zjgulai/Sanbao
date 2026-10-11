import { SAGE_REQUEST_TIMEOUT_MS } from '../../contracts.js'

/** ADR-0311: the workspace file-candidate read — the real T03 chain (projection-read admitted;
 *  the same route the walkthrough policy already grants). Display facts only; refusals stay named. */
const SAGE_FILES_CANDIDATES_PATH = '/.sage/workspace/files/candidates'

export interface DesktopFileCandidate {
  readonly name: string
  readonly path: string
}

export type DesktopFileCandidates =
  | { readonly state: 'read'; readonly entries: readonly DesktopFileCandidate[]; readonly truncated: boolean }
  | { readonly state: 'refused'; readonly code: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const refused = (code: string): DesktopFileCandidates => ({ state: 'refused', code })

export async function listDesktopFileCandidates(workspaceRoot: string, path: string): Promise<DesktopFileCandidates> {
  try {
    const response = await fetch(SAGE_FILES_CANDIDATES_PATH, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceRoot, path }),
      cache: 'no-store', signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return refused('file-candidates-unavailable')
    const result: unknown = await response.json()
    if (!isRecord(result)) return refused('file-candidates-unavailable')
    if (result.state === 'refused') {
      return refused(typeof result.code === 'string' && result.code !== '' ? result.code : 'file-candidates-unavailable')
    }
    if (result.state !== 'read' || !Array.isArray(result.entries)) return refused('file-candidates-unavailable')
    const entries: DesktopFileCandidate[] = []
    for (const entry of result.entries) {
      if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name === ''
        || typeof entry.path !== 'string' || entry.path === '') continue
      entries.push({ name: entry.name, path: entry.path })
    }
    return { state: 'read', entries, truncated: result.truncated === true }
  } catch {
    return refused('file-candidates-unavailable')
  }
}
