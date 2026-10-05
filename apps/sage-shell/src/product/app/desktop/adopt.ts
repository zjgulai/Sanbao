import { SAGE_REQUEST_TIMEOUT_MS } from '../../contracts.js'

/** T03-C: the three honest ends of one adopt attempt, mirroring the service's
 *  `WorkspaceAdoptOutcome` (appservice/contracts.ts). The client never invents a fourth state. */
export type DesktopWorkspaceAdoptOutcome =
  | { readonly state: 'adopted'; readonly workspaceId: string; readonly path: string; readonly title: string }
  | { readonly state: 'cancelled' }
  | { readonly state: 'refused'; readonly code: string }

/** The adopt route is a module constant in route-skeleton.ts (not exported); session.ts already
 *  follows the same local-constant precedent for its own paths. */
const SAGE_WORKSPACE_ADOPT_PATH = '/.sage/workspace/adopt'
const UNRECOGNISED = 'adopt-result-unrecognised'

const TRANSPORT_REFUSALS: Readonly<Record<number, string>> = {
  403: 'caller-denied', 405: 'method-not-allowed', 413: 'request-too-large', 415: 'content-type-rejected',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Validate the response field by field against the three outcome states; any deviation resolves
 *  to a fixed honest refusal instead of being displayed as a success. */
function classifyAdoptOutcome(input: unknown): DesktopWorkspaceAdoptOutcome {
  if (!isRecord(input)) return { state: 'refused', code: UNRECOGNISED }
  if (input.state === 'cancelled' && Object.keys(input).length === 1) return { state: 'cancelled' }
  if (input.state === 'refused' && nonEmpty(input.code)) return { state: 'refused', code: input.code }
  if (input.state === 'adopted' && nonEmpty(input.workspaceId) && nonEmpty(input.path) && nonEmpty(input.title)) {
    return { state: 'adopted', workspaceId: input.workspaceId, path: input.path, title: input.title }
  }
  return { state: 'refused', code: UNRECOGNISED }
}

/** POST the adopt route. The handler reads no body and no content-type (route-skeleton.ts:
 *  `SAGE_WORKSPACE_ADOPT_PATH` branch), so the request carries none and the 4096-byte cap is
 *  trivially respected. Transport failures and malformed outcomes resolve to a refusal — never a
 *  synthesized success. */
export async function adoptDesktopWorkspace(): Promise<DesktopWorkspaceAdoptOutcome> {
  try {
    const response = await fetch(SAGE_WORKSPACE_ADOPT_PATH, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
    })
    const transportRefusal = TRANSPORT_REFUSALS[response.status]
    if (transportRefusal !== undefined) return { state: 'refused', code: transportRefusal }
    if (!response.ok) return { state: 'refused', code: UNRECOGNISED }
    return classifyAdoptOutcome(await response.json())
  } catch {
    return { state: 'refused', code: UNRECOGNISED }
  }
}
