/** WT-02B.2B-pre JWS verification kernel: strict parse, exact kid match, real signature checks. */
import { createPublicKey, createVerify, type KeyObject } from 'node:crypto'

export type JwsRejection =
  | 'not-compact-jws' | 'header-not-json' | 'unsupported-alg' | 'alg-none'
  | 'crit-present' | 'missing-kid' | 'kid-not-found' | 'key-type-mismatch' | 'signature-invalid'
  | 'payload-not-json'

const B64U_RE = /^[A-Za-z0-9_-]+$/u

/** Strict base64url decode: charset check plus re-encode equality (Buffer.from silently truncates). */
function strictB64uDecode(segment: string): Buffer | undefined {
  if (!B64U_RE.test(segment)) return undefined
  const bytes = Buffer.from(segment, 'base64url')
  return bytes.toString('base64url') === segment ? bytes : undefined
}

function algMatchesKeyType(alg: 'RS256' | 'ES256', jwk: Record<string, unknown>): boolean {
  if (alg === 'RS256') return jwk.kty === 'RSA'
  return jwk.kty === 'EC' && jwk.crv === 'P-256'
}

function verifySignature(alg: 'RS256' | 'ES256', key: KeyObject, signingInput: Buffer, signature: Buffer): boolean {
  if (alg === 'RS256') {
    try { return createVerify('RSA-SHA256').update(signingInput).verify(key, signature) } catch { return false }
  }
  if (signature.length !== 64) return false // raw r||s, exactly 32+32
  try { return createVerify('SHA256').update(signingInput).verify({ key, dsaEncoding: 'ieee-p1363' }, signature) } catch { return false }
}

export function verifyCompactJws(input: {
  readonly untrustedToken: string
  readonly jwks: unknown
  readonly acceptedAlgs: readonly ('RS256' | 'ES256')[]
}): { readonly ok: true; readonly protectedHeader: Record<string, unknown>; readonly payload: unknown } | { readonly ok: false; readonly reason: JwsRejection } {
  if (typeof input.untrustedToken !== 'string') return { ok: false, reason: 'not-compact-jws' }
  const parts = input.untrustedToken.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'not-compact-jws' }
  const [headerSeg, payloadSeg, sigSeg] = parts as [string, string, string]

  const headerBytes = strictB64uDecode(headerSeg)
  const payloadBytes = strictB64uDecode(payloadSeg)
  const sigBytes = strictB64uDecode(sigSeg)
  if (headerBytes === undefined || payloadBytes === undefined || sigBytes === undefined) {
    return { ok: false, reason: 'not-compact-jws' }
  }

  let header: unknown
  try { header = JSON.parse(headerBytes.toString('utf8')) } catch { return { ok: false, reason: 'header-not-json' } }
  if (header === null || typeof header !== 'object' || Array.isArray(header)) return { ok: false, reason: 'header-not-json' }
  const headerRecord = header as Record<string, unknown>

  const alg = headerRecord.alg
  if (alg === 'none') return { ok: false, reason: 'alg-none' }
  if (alg !== 'RS256' && alg !== 'ES256') return { ok: false, reason: 'unsupported-alg' }
  if (!input.acceptedAlgs.includes(alg)) return { ok: false, reason: 'unsupported-alg' }

  // RFC 7715 §4 strict: an unrecognized extension (e.g. crit/b64, which alters payload encoding)
  // must be rejected, not silently ignored. The kernel supports no crit extensions, so the mere
  // presence of the `crit` header key is a rejection.
  if ('crit' in headerRecord) return { ok: false, reason: 'crit-present' }

  if (typeof headerRecord.kid !== 'string' || headerRecord.kid.length === 0) return { ok: false, reason: 'missing-kid' }

  const jwks = input.jwks as { keys?: unknown } | null
  const keysArray = jwks !== null && typeof jwks === 'object' && !Array.isArray(jwks) && Array.isArray(jwks.keys) ? jwks.keys : []
  const matches = keysArray.filter(
    (k): k is Record<string, unknown> => k !== null && typeof k === 'object' && !Array.isArray(k) && (k as Record<string, unknown>).kid === headerRecord.kid,
  )
  if (matches.length !== 1) return { ok: false, reason: 'kid-not-found' }
  const jwk = matches[0]!
  if (!algMatchesKeyType(alg, jwk)) return { ok: false, reason: 'key-type-mismatch' }

  let key: KeyObject
  try { key = createPublicKey({ key: jwk as Record<string, unknown>, format: 'jwk' }) } catch { return { ok: false, reason: 'key-type-mismatch' } }

  const signingInput = Buffer.from(`${headerSeg}.${payloadSeg}`)
  if (!verifySignature(alg, key, signingInput, sigBytes)) return { ok: false, reason: 'signature-invalid' }

  let payload: unknown
  try { payload = JSON.parse(payloadBytes.toString('utf8')) } catch { return { ok: false, reason: 'payload-not-json' } }

  return { ok: true, protectedHeader: headerRecord, payload }
}
