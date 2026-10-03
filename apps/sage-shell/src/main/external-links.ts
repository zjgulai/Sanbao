/** Ticket 033 (US-172, D-036): the controlled external-link entry — validate, then hand off.
 *
 * The rules the ticket names:
 *
 * - **External links never open by themselves.** This module has no read path and no timer; the
 *   only way in is the named `open` action, which the renderer posts from exactly one explicit
 *   user click. Nothing here fetches, resolves, previews or probes the target — Sage never talks
 *   to the website.
 * - **Sage validates the target and the opening mode.** Only `http`/`https` cross; every other
 *   scheme (`javascript:`, `file:`, `data:`, custom app links) is refused by its own code, as are
 *   embedded credentials and over-long URLs. The projection echoes scheme + host only — path,
 *   query, fragment and credentials never come back out.
 * - **The opener is injected.** Production hands the validated URL to the system browser
 *   (`shell.openExternal`, wired in `main/index.ts`); tests drive a fake. An unwired opener is an
 *   honest `external-open-unavailable` — never a pretend success.
 */
import type { ExternalLinkOutcome } from '../appservice/contracts.js'

const MAX_URL_LENGTH = 2048

export type ExternalUrlReading =
  | { readonly ok: true, readonly scheme: 'http' | 'https', readonly host: string, readonly url: string }
  | { readonly ok: false, readonly code: 'link-invalid' | 'link-scheme-refused' | 'link-credentials-refused' | 'link-too-long' }

/** The one validator: scheme allowlist, credentials refusal, bounded length. */
export function readExternalUrl(raw: string): ExternalUrlReading {
  if (raw.length > MAX_URL_LENGTH) return { ok: false, code: 'link-too-long' }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, code: 'link-invalid' }
  }
  const scheme = parsed.protocol.replace(/:$/u, '').toLowerCase()
  if (scheme !== 'http' && scheme !== 'https') return { ok: false, code: 'link-scheme-refused' }
  if (parsed.hostname === '') return { ok: false, code: 'link-invalid' }
  if (parsed.username !== '' || parsed.password !== '') return { ok: false, code: 'link-credentials-refused' }
  return { ok: true, scheme, host: parsed.host, url: parsed.toString() }
}

export interface ExternalLinksDeps {
  /** The only opening path. Production wires the system browser; absence is fail-closed. */
  readonly openExternal?: (url: string) => Promise<void>
  readonly now: () => string
}

export interface ExternalLinks {
  readonly open: (raw: string) => Promise<ExternalLinkOutcome>
  readonly lastOpen: () => { readonly scheme: 'http' | 'https', readonly host: string, readonly at: string } | null
}

export function createExternalLinks(deps: ExternalLinksDeps): ExternalLinks {
  let last: { scheme: 'http' | 'https', host: string, at: string } | null = null

  return {
    async open(raw) {
      const reading = readExternalUrl(raw)
      if (!reading.ok) return { state: 'refused', code: reading.code }
      const opener = deps.openExternal
      if (opener === undefined) return { state: 'refused', code: 'external-open-unavailable' }
      try {
        await opener(reading.url)
      } catch {
        // The handoff itself threw: nothing was (provably) handed to the system — but Sage also
        // cannot prove the browser did not receive it, so this stays a refusal, not a success.
        return { state: 'refused', code: 'external-open-failed' }
      }
      last = { scheme: reading.scheme, host: reading.host, at: deps.now() }
      // Scheme + host only: the full URL (query, fragment, path) never crosses back.
      return { state: 'opened', target: { scheme: reading.scheme, host: reading.host } }
    },
    lastOpen: () => last,
  }
}
