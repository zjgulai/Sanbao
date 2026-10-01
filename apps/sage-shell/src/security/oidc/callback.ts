/** WT-02B.2B-pre authorization callback kernel: one-shot state + PKCE S256, fail closed. */
import { createHash, timingSafeEqual } from 'node:crypto'

/** Constant-time string equality: length check first (timingSafeEqual throws on mismatched lengths). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export type CallbackRejection =
  | 'missing-code' | 'error-response' | 'state-mismatch' | 'state-replayed'
  | 'code-verifier-invalid' | 'pkce-mismatch'

const B64U_CHARS = /^[A-Za-z0-9_-]+$/u

function queryValue(query: Record<string, unknown> | URLSearchParams, key: string): unknown {
  if (query instanceof URLSearchParams) return query.get(key)
  const value = (query as Record<string, unknown>)[key]
  return value
}

function isValidVerifier(verifier: string): boolean {
  return verifier.length >= 43 && verifier.length <= 128 && B64U_CHARS.test(verifier)
}

export function verifyAuthorizationCallback(input: {
  readonly untrustedQuery: Record<string, unknown> | URLSearchParams
  readonly expectedState: string
  readonly consumeState: (state: string) => boolean
  readonly codeVerifier: string
}): { readonly ok: true; authorizationCode: string } | { readonly ok: false; readonly reason: CallbackRejection } {
  const error = queryValue(input.untrustedQuery, 'error')
  if (error !== undefined && error !== null && error !== '') return { ok: false, reason: 'error-response' }

  const state = queryValue(input.untrustedQuery, 'state')
  if (typeof state !== 'string' || !safeEqual(state, input.expectedState)) return { ok: false, reason: 'state-mismatch' }
  if (!input.consumeState(state)) return { ok: false, reason: 'state-replayed' }

  const code = queryValue(input.untrustedQuery, 'code')
  if (typeof code !== 'string' || code.length === 0) return { ok: false, reason: 'missing-code' }

  if (typeof input.codeVerifier !== 'string' || !isValidVerifier(input.codeVerifier)) {
    return { ok: false, reason: 'code-verifier-invalid' }
  }

  return { ok: true, authorizationCode: code }
}

export function verifyPkceS256(input: { readonly codeVerifier: string; readonly challenge: string }): boolean {
  if (typeof input.codeVerifier !== 'string' || typeof input.challenge !== 'string') return false
  const computed = createHash('sha256').update(input.codeVerifier).digest('base64url')
  return safeEqual(computed, input.challenge)
}
