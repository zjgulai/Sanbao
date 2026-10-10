/** ADR-0300: the desktop artifact actions — thin wrappers over the existing artifact routes.
 *  Each returns whether the service answered with a determinate result; the caller re-reads the
 *  projection via the ordinary refresh. No local state is invented here. */
import { SAGE_REQUEST_TIMEOUT_MS } from '../../contracts.js'

const PATHS = {
  open: '/.sage/artifacts/open',
  close: '/.sage/artifacts/close',
  retry: '/.sage/artifacts/retry',
  fullscreen: '/.sage/artifacts/fullscreen',
  window: '/.sage/artifacts/window',
} as const

async function post(path: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch(path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      cache: 'no-store', signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return false
    const result: unknown = await response.json()
    return typeof result === 'object' && result !== null
  } catch {
    return false
  }
}

export const openDesktopArtifact = (artifactId: string): Promise<boolean> => post(PATHS.open, { artifactId })
export const retryDesktopArtifact = (): Promise<boolean> => post(PATHS.retry, {})
export const closeDesktopArtifact = (): Promise<boolean> => post(PATHS.close, {})
export const setDesktopArtifactFullscreen = (on: boolean): Promise<boolean> => post(PATHS.fullscreen, { on })
export const setDesktopArtifactWindow = (action: 'open' | 'close'): Promise<boolean> => post(PATHS.window, { action })
