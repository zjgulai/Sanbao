import { SAGE_REQUEST_TIMEOUT_MS } from '../../contracts.js'

/** L1-B (ADR-0321): the matter-groups action posts — thin wrappers over the admitted
 *  `/.sage/matter-groups` route. Membership stays a named follow-up (selection state). */
const MATTER_GROUPS_PATH = '/.sage/matter-groups'

export interface MatterGroupsActionResult {
  readonly ok: boolean
  readonly code: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const TRANSPORT_REFUSALS: Readonly<Record<number, string>> = {
  400: 'invalid-matter-groups-request', 403: 'caller-denied', 405: 'method-not-allowed',
  413: 'request-too-large', 415: 'content-type-rejected',
}

async function post(body: Record<string, unknown>): Promise<MatterGroupsActionResult> {
  try {
    const response = await fetch(MATTER_GROUPS_PATH, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store', signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
    })
    const transportRefusal = TRANSPORT_REFUSALS[response.status]
    if (transportRefusal !== undefined) return { ok: false, code: transportRefusal }
    if (!response.ok) return { ok: false, code: 'matter-groups-failed' }
    const result: unknown = await response.json()
    if (!isRecord(result)) return { ok: false, code: 'matter-groups-failed' }
    const code = typeof result.code === 'string' && result.code !== '' ? result.code : null
    return { ok: result.state === 'created' || result.state === 'renamed' || result.state === 'removed', code }
  } catch {
    return { ok: false, code: 'matter-groups-failed' }
  }
}

export const createDesktopMatterGroup = (name: string): Promise<MatterGroupsActionResult> =>
  post({ action: 'create', name })

export const renameDesktopMatterGroup = (groupId: string, name: string): Promise<MatterGroupsActionResult> =>
  post({ action: 'rename', groupId, name })

export const removeDesktopMatterGroup = (groupId: string): Promise<MatterGroupsActionResult> =>
  post({ action: 'remove', groupId })
