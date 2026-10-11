import { SAGE_REQUEST_TIMEOUT_MS } from '../../contracts.js'

/** L1-A.2 (ADR-0320): the matter-admin action posts — thin wrappers over the admitted
 *  `/.sage/matter-admin` route. The route maps the admitted receipt 1:1; the wrappers pass the
 *  code through and never invent an outcome. */
const MATTER_ADMIN_PATH = '/.sage/matter-admin'

export interface MatterAdminActionResult {
  readonly ok: boolean
  readonly code: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const TRANSPORT_REFUSALS: Readonly<Record<number, string>> = {
  400: 'invalid-matter-admin-request', 403: 'caller-denied', 405: 'method-not-allowed',
  413: 'request-too-large', 415: 'content-type-rejected',
}

async function post(body: Record<string, unknown>): Promise<MatterAdminActionResult> {
  try {
    const response = await fetch(MATTER_ADMIN_PATH, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store', signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
    })
    const transportRefusal = TRANSPORT_REFUSALS[response.status]
    if (transportRefusal !== undefined) return { ok: false, code: transportRefusal }
    if (!response.ok) return { ok: false, code: 'matter-admin-failed' }
    const result: unknown = await response.json()
    if (!isRecord(result)) return { ok: false, code: 'matter-admin-failed' }
    const code = typeof result.code === 'string' && result.code !== '' ? result.code : null
    return { ok: result.state === 'ok' || result.state === 'renamed', code }
  } catch {
    return { ok: false, code: 'matter-admin-failed' }
  }
}

export const archiveDesktopMatter = (matterRef: string, ground: 'completed' | 'stopped'): Promise<MatterAdminActionResult> =>
  post({ action: 'archive', matterRef, ground })

export const restoreDesktopMatter = (matterRef: string): Promise<MatterAdminActionResult> =>
  post({ action: 'restore', matterRef })

export const renameDesktopMatter = (matterRef: string, title: string): Promise<MatterAdminActionResult> =>
  post({ action: 'rename', matterRef, title })
