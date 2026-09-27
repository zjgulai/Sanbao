/** Hostname routing for the shell-owned custom scheme. */

import { isExactSageAppUrl } from '../product/contracts.js'

/** Where one `dsh-app://` request goes. */
export type SchemeRoute = { readonly target: 'app' } | { readonly target: 'reject' }

/**
 * Route one custom-scheme request by hostname.
 * @param url - parsed request URL under the `dsh-app:` scheme.
 * @returns `app` for the harness UI hostname, `reject` for everything else.
 */
export function routeSchemeRequest(url: URL): SchemeRoute {
  return isExactSageAppUrl(url) ? { target: 'app' } : { target: 'reject' }
}
