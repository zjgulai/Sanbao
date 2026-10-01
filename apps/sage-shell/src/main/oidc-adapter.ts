/** WT-02B.2B login adapter: system-browser auth-code + PKCE, kernel-verified, in-memory only.
 * Fully injected transports (fetch / openExternal / clock / loopback listener / randomness):
 * no Electron import here — production deps (shell.openExternal, node:http server) are assembled
 * by the main wiring task, keeping this module testable without a running Electron app. */
import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { verifyAuthorizationCallback, verifyIdToken, verifyProviderMetadata } from '../security/oidc/index.js'
import { OIDC_CLIENT_ID, OIDC_DISCOVERY_URL, OIDC_ISSUER, OIDC_LOGIN_TIMEOUT_MS, OIDC_LOOPBACK_PORT, OIDC_REDIRECT_URI, OIDC_SCOPES } from './oidc-config.js'
import type { TokenVault } from './token-vault.js'

/** Deployment inputs re-exported for Task 5 consumers (canonical home: oidc-config.ts). */
export { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_REDIRECT_URI, OIDC_SCOPES } from './oidc-config.js'

export type LoginErrorCode = 'idp-unreachable' | 'callback-invalid' | 'token-verification-failed' | 'login-timeout' | 'login-in-progress' | 'login-superseded'
export type LoginOutcome = { readonly ok: true; readonly displayName: string | null } | { readonly ok: false; readonly code: LoginErrorCode }

export interface OidcAdapterDeps {
  readonly fetchImpl: typeof fetch
  readonly openExternal: (url: string) => Promise<void>
  readonly now: () => number
  readonly listen: (port: number, handler: (req: IncomingMessage) => void) => Promise<void>
  readonly closeListen: () => Promise<void>
  readonly randomBytes: (n: number) => Buffer
  readonly loginTimeoutMs?: number
  /** WT-02B.2C: resolve the Sage-internal identity handle for the verified (issuer, subject).
   * WT-02B.2F: candidate org refs from the verified organization claim ride along as non-authoritative lookup hints. */
  readonly resolveIdentity: (input: {
    readonly issuer: string
    readonly subject: string
    readonly candidateOrgRefs: readonly string[]
  }) => { readonly identityHandle: string }
}

const MAX_DISCOVERY_BYTES = 64 * 1024
const MAX_JWKS_BYTES = 256 * 1024
const MAX_TOKEN_RESPONSE_BYTES = 64 * 1024
const MAX_JWKS_KEYS = 16
const MAX_CANDIDATE_ORG_REFS = 64
const MAX_CANDIDATE_ORG_REF_LENGTH = 128

/** WT-02B.2F: candidate organization refs from the verified `organization_data` claim (Logto,
 * requested via the `urn:logto:scope:organizations` scope). Lookup hints only — never membership
 * authority. Strict-whole: any malformed shape drops the entire claim (hints must not be
 * partially trusted), and nothing here ever fails a login. */
export function extractCandidateOrgRefs(claims: Record<string, unknown>): readonly string[] {
  const raw = claims.organization_data
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > MAX_CANDIDATE_ORG_REFS) return []
  const refs: string[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    const id = (item as Record<string, unknown>).id
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      id !== id.trim() ||
      id.length > MAX_CANDIDATE_ORG_REF_LENGTH
    ) {
      return []
    }
    if (!refs.includes(id)) refs.push(id)
  }
  return refs
}

async function fetchJsonWithLimit(fetchImpl: typeof fetch, url: string, limit: number): Promise<unknown | undefined> {
  const response = await fetchImpl(url)
  if (!response.ok) return undefined
  const text = await response.text()
  if (text.length > limit) return undefined
  try { return JSON.parse(text) } catch { return undefined }
}

export function createOidcAdapter(deps: OidcAdapterDeps) {
  const consumedStates = new Set<string>()
  return {
    async startLogin(vault: TokenVault): Promise<LoginOutcome> {
      if (!vault.beginPending()) return { ok: false, code: 'login-in-progress' }
      try {
        const state = deps.randomBytes(32).toString('base64url')
        const nonce = deps.randomBytes(32).toString('base64url')
        const verifier = deps.randomBytes(48).toString('base64url')
        const challenge = createHash('sha256').update(verifier).digest('base64url')
        consumedStates.add(state)

        const discovery = await fetchJsonWithLimit(deps.fetchImpl, OIDC_DISCOVERY_URL, MAX_DISCOVERY_BYTES)
        if (discovery === undefined) return { ok: false, code: 'idp-unreachable' }
        const metadataOk = verifyProviderMetadata({
          untrusted: discovery,
          expected: {
            issuer: OIDC_ISSUER,
            authorizationEndpoint: `${OIDC_ISSUER}/auth`,
            tokenEndpoint: `${OIDC_ISSUER}/token`,
            jwksUri: `${OIDC_ISSUER}/jwks`,
          },
        })
        if (!metadataOk.ok) return { ok: false, code: 'idp-unreachable' }

        let callbackResolve: (query: Record<string, string> | null) => void
        const callbackPromise = new Promise<Record<string, string> | null>((resolve) => { callbackResolve = resolve })
        const timeoutMs = deps.loginTimeoutMs ?? OIDC_LOGIN_TIMEOUT_MS
        const timer = setTimeout(() => callbackResolve(null), timeoutMs)
        timer.unref?.()

        await deps.listen(OIDC_LOOPBACK_PORT, (req: IncomingMessage) => {
          const url = new URL(req.url ?? '/callback', `http://127.0.0.1:${OIDC_LOOPBACK_PORT}`)
          const query: Record<string, string> = {}
          for (const [k, v] of url.searchParams) query[k] = v
          callbackResolve(query)
        })

        const authUrl = new URL(`${OIDC_ISSUER}/auth`)
        authUrl.searchParams.set('client_id', OIDC_CLIENT_ID)
        authUrl.searchParams.set('redirect_uri', OIDC_REDIRECT_URI)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('scope', OIDC_SCOPES)
        authUrl.searchParams.set('state', state)
        authUrl.searchParams.set('nonce', nonce)
        authUrl.searchParams.set('code_challenge', challenge)
        authUrl.searchParams.set('code_challenge_method', 'S256')
        await deps.openExternal(authUrl.toString())

        const query = await callbackPromise
        clearTimeout(timer)
        await deps.closeListen()

        const callback = verifyAuthorizationCallback({
          untrustedQuery: query ?? {},
          expectedState: state,
          consumeState: (s) => consumedStates.delete(s),
          codeVerifier: verifier,
        })
        if (!callback.ok) return { ok: false, code: query === null ? 'login-timeout' : 'callback-invalid' }

        const tokenResponse = await deps.fetchImpl(`${OIDC_ISSUER}/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: callback.authorizationCode,
            redirect_uri: OIDC_REDIRECT_URI,
            client_id: OIDC_CLIENT_ID,
            code_verifier: verifier,
          }).toString(),
        })
        if (!tokenResponse.ok) return { ok: false, code: 'token-verification-failed' }
        const tokenText = await tokenResponse.text()
        if (tokenText.length > MAX_TOKEN_RESPONSE_BYTES) return { ok: false, code: 'token-verification-failed' }
        let tokenJson: unknown
        try { tokenJson = JSON.parse(tokenText) } catch { return { ok: false, code: 'token-verification-failed' } }
        const record = tokenJson as Record<string, unknown>
        if (typeof record.id_token !== 'string') return { ok: false, code: 'token-verification-failed' }

        const jwks = await fetchJsonWithLimit(deps.fetchImpl, `${OIDC_ISSUER}/jwks`, MAX_JWKS_BYTES)
        if (jwks === undefined) return { ok: false, code: 'idp-unreachable' }
        const keys = (jwks as { keys?: unknown[] }).keys
        if (!Array.isArray(keys) || keys.length > MAX_JWKS_KEYS) return { ok: false, code: 'idp-unreachable' }

        const verified = verifyIdToken({
          untrustedToken: record.id_token,
          jwks,
          expectedIssuer: OIDC_ISSUER,
          clientId: OIDC_CLIENT_ID,
          expectedNonce: nonce,
          now: deps.now(),
          clockSkewSeconds: 60,
        })
        if (!verified.ok) return { ok: false, code: 'token-verification-failed' }

        const claims = verified.claims
        // WT-02B.2C: identity mapping needs the exact verified (issuer, subject); the kernel only
        // forces `iss`, so `sub` is guarded here — a token without both cannot mint a handle.
        // WT-02B.2E: `exp` passed the kernel's finite-number guard; re-narrowed here for the session record.
        if (typeof claims.iss !== 'string' || typeof claims.sub !== 'string' || typeof claims.exp !== 'number') {
          return { ok: false, code: 'token-verification-failed' }
        }
        const displayName = typeof claims.name === 'string' ? claims.name
          : typeof claims.username === 'string' ? claims.username : null
        const candidateOrgRefs = extractCandidateOrgRefs(claims)
        const { identityHandle } = deps.resolveIdentity({ issuer: claims.iss, subject: claims.sub, candidateOrgRefs })
        const applied = vault.signIn({
          accessToken: typeof record.access_token === 'string' ? record.access_token : '',
          idToken: record.id_token,
          displayName,
          identityHandle,
          issuer: claims.iss,
          authenticatedAt: new Date(deps.now() * 1000).toISOString(),
          expiresAt: new Date(claims.exp * 1000).toISOString(),
        })
        if (!applied) return { ok: false, code: 'login-superseded' }
        return { ok: true, displayName }
      } catch {
        return { ok: false, code: 'idp-unreachable' }
      } finally {
        if (vault.status() === 'pending') vault.signOut()
      }
    },
  }
}

export type OidcAdapter = ReturnType<typeof createOidcAdapter>
