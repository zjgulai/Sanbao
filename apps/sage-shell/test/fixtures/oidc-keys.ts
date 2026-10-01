import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto'

export interface OidcKeySet {
  readonly jwks: { readonly keys: readonly Record<string, unknown>[] }
  readonly privateKey: Readonly<Record<string, KeyObject>>   // keyed by kid
}

/** Fresh keys per run: never persisted, never printed. */
export async function generateOidcKeys(): Promise<OidcKeySet> {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const rsaJwk = rsa.publicKey.export({ format: 'jwk' }) as Record<string, unknown>
  const ecJwk = ec.publicKey.export({ format: 'jwk' }) as Record<string, unknown>
  return {
    jwks: { keys: [{ ...rsaJwk, kid: 'test-rsa', use: 'sig' }, { ...ecJwk, kid: 'test-ec', use: 'sig' }] },
    privateKey: { 'test-rsa': rsa.privateKey, 'test-ec': ec.privateKey },
  }
}

function b64u(value: Buffer): string { return value.toString('base64url') }

export function signJws(keys: OidcKeySet, kid: string, alg: 'RS256' | 'ES256', headerExtra: Record<string, unknown>, payload: unknown): string {
  const header = Object.fromEntries(Object.entries({ alg, kid, ...headerExtra }).filter(([, v]) => v !== undefined))
  return signRawHeader(keys, kid, alg, JSON.stringify(header), payload)
}

function signRawHeader(keys: OidcKeySet, kid: string, alg: 'RS256' | 'ES256', rawHeader: string, payload: unknown): string {
  const headerB = b64u(Buffer.from(rawHeader))
  const payloadB = b64u(Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)))
  const signingInput = `${headerB}.${payloadB}`
  const key = alg === 'ES256'
    ? { key: keys.privateKey[kid]!, dsaEncoding: 'ieee-p1363' as const }
    : keys.privateKey[kid]!
  const sig = createSign(alg === 'RS256' ? 'RSA-SHA256' : 'SHA256').update(Buffer.from(signingInput)).sign(key)
  return `${signingInput}.${b64u(sig)}`
}

/** Sign with an arbitrary (possibly invalid) header/payload string, for negative cases. */
export function signRawSegments(keys: OidcKeySet, kid: string, alg: 'RS256' | 'ES256', rawHeader: string, payload: unknown): string {
  return signRawHeader(keys, kid, alg, rawHeader, payload)
}

/** Token whose header claims test-rsa but is signed by a throwaway key. */
export async function signWithUnknownKey(kidToClaim: string): Promise<string> {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const header = b64u(Buffer.from(JSON.stringify({ alg: 'RS256', kid: kidToClaim })))
  const payload = b64u(Buffer.from(JSON.stringify({ sub: 'attacker' })))
  const sig = createSign('RSA-SHA256').update(Buffer.from(`${header}.${payload}`)).sign(privateKey)
  return `${header}.${payload}.${b64u(sig)}`
}

/** ES256 token carrying the DER-encoded signature instead of raw r||s. */
export function signEs256Der(keys: OidcKeySet): string {
  const header = b64u(Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'test-ec' })))
  const payload = b64u(Buffer.from(JSON.stringify({ sub: 'x' })))
  const sig = createSign('SHA256').update(Buffer.from(`${header}.${payload}`)).sign(keys.privateKey['test-ec']!) // default DER
  return `${header}.${payload}.${b64u(sig)}`
}

/** ES256 token whose raw signature is truncated to a wrong length. */
export function signEs256RawWithLength(keys: OidcKeySet, length: number): string {
  const header = b64u(Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'test-ec' })))
  const payload = b64u(Buffer.from(JSON.stringify({ sub: 'x' })))
  const sig = createSign('SHA256').update(Buffer.from(`${header}.${payload}`)).sign({ key: keys.privateKey['test-ec']!, dsaEncoding: 'ieee-p1363' })
  return `${header}.${payload}.${b64u(sig.subarray(0, length))}`
}
