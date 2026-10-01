/** WT-02B.2B-pre ID token claims kernel: exact equality, injected clock, fail closed. */
import { timingSafeEqual } from 'node:crypto'
import { verifyCompactJws, type JwsRejection } from './jws.js'

/** Constant-time string equality: length check first (timingSafeEqual throws on mismatched lengths). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export type IdTokenRejection =
  | JwsRejection | 'iss-mismatch' | 'aud-missing' | 'aud-mismatch' | 'azp-mismatch'
  | 'expired' | 'not-yet-valid' | 'iat-unreasonable' | 'nonce-mismatch' | 'missing-claim'

export function verifyIdToken(input: {
  readonly untrustedToken: string
  readonly jwks: unknown
  readonly expectedIssuer: string
  readonly clientId: string
  readonly expectedNonce: string
  readonly now: number
  readonly clockSkewSeconds: number
}): { readonly ok: true; readonly claims: Record<string, unknown> } | { readonly ok: false; readonly reason: IdTokenRejection } {
  const jws = verifyCompactJws({ untrustedToken: input.untrustedToken, jwks: input.jwks, acceptedAlgs: ['RS256', 'ES256', 'ES384'] })
  if (!jws.ok) return { ok: false, reason: jws.reason }

  const claims = jws.payload as Record<string, unknown>
  if (claims === null || typeof claims !== 'object' || Array.isArray(claims)) return { ok: false, reason: 'missing-claim' }

  if (typeof claims.iss !== 'string' || !safeEqual(claims.iss, input.expectedIssuer)) return { ok: false, reason: 'iss-mismatch' }

  const aud = claims.aud
  const audiences = typeof aud === 'string' ? [aud] : Array.isArray(aud) && aud.every((a) => typeof a === 'string') ? aud : undefined
  if (audiences === undefined) return { ok: false, reason: 'aud-missing' }
  if (!audiences.includes(input.clientId)) return { ok: false, reason: 'aud-mismatch' }
  if (audiences.length > 1 && claims.azp !== input.clientId) return { ok: false, reason: 'azp-mismatch' }

  const skew = input.clockSkewSeconds
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) return { ok: false, reason: 'missing-claim' }
  if (input.now - claims.exp > skew) return { ok: false, reason: 'expired' }
  if (typeof claims.nbf === 'number' && Number.isFinite(claims.nbf) && claims.nbf - input.now > skew) {
    return { ok: false, reason: 'not-yet-valid' }
  }
  if (typeof claims.iat !== 'number' || !Number.isFinite(claims.iat)) return { ok: false, reason: 'missing-claim' }
  if (claims.iat - input.now > skew) return { ok: false, reason: 'iat-unreasonable' }
  if (typeof claims.nonce !== 'string' || !safeEqual(claims.nonce, input.expectedNonce)) {
    return typeof claims.nonce === 'string' ? { ok: false, reason: 'nonce-mismatch' } : { ok: false, reason: 'missing-claim' }
  }

  return { ok: true, claims }
}
