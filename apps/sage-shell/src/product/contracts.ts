/** Public, product-owned contract between the Sage renderer and its host adapter. */

/** The only state endpoint exposed to the Sage renderer in P0-2. */
export const SAGE_STATE_PATH = '/.sage/state' as const

/** The only action endpoint exposed to the Sage renderer in P0-2. */
export const SAGE_ACTIONS_PATH = '/.sage/actions' as const

/** The sole custom-scheme authority accepted by the Sage product surface. */
export const SAGE_APP_ORIGIN = 'dsh-app://app' as const

/** A stalled host request must resolve to the renderer's recoverable state rather than hang the page. */
export const SAGE_REQUEST_TIMEOUT_MS = 5_000

/**
 * Keep the custom-scheme contract exact: no alternate port, credentials, query, or fragment.
 * The product has no legitimate need for any of those variants in P0-2.
 */
export function isExactSageAppUrl(url: URL): boolean {
  return url.protocol === 'dsh-app:'
    && url.hostname === 'app'
    && url.port === ''
    && url.username === ''
    && url.password === ''
    && url.search === ''
    && url.hash === ''
}

/** Runtime availability states that are intentionally narrower than business workflow state. */
export const SAGE_RUNTIME_STATUSES = ['ready', 'unavailable', 'recovering'] as const

export type SageRuntimeStatus = (typeof SAGE_RUNTIME_STATUSES)[number]

/** Safe, renderer-facing projection of adapter availability. */
export interface SageViewState {
  readonly status: SageRuntimeStatus
  readonly message: string
  readonly retryable: boolean
}

/** P0-2 deliberately exposes one fail-closed action only. */
export interface SageRetryIntent {
  readonly type: 'retry'
}

export type SageActionIntent = SageRetryIntent
