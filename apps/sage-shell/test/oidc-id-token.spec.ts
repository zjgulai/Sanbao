import { describe, expect, it } from 'vitest'
import { generateOidcKeys, signJws } from './fixtures/oidc-keys.js'
import { verifyIdToken } from '../src/security/oidc/id-token.js'

const NOW = 1_800_000_000
const ISS = 'https://idp.example/'
const CLIENT = 'sage-desktop'

async function tokenWith(claims: Record<string, unknown>): Promise<{ keys: Awaited<ReturnType<typeof generateOidcKeys>>; token: string }> {
  const keys = await generateOidcKeys()
  const base = { iss: ISS, sub: 'user-1', aud: CLIENT, nonce: 'n-1', exp: NOW + 3600, iat: NOW }
  const payload = { ...base, ...claims }
  return { keys, token: signJws(keys, 'test-rsa', 'RS256', {}, payload) }
}

function verify(token: string, jwks: unknown) {
  return verifyIdToken({ untrustedToken: token, jwks, expectedIssuer: ISS, clientId: CLIENT, expectedNonce: 'n-1', now: NOW, clockSkewSeconds: 60 })
}

describe('verifyIdToken', () => {
  it('accepts a fully valid token (single aud string)', async () => {
    const { keys, token } = await tokenWith({})
    const result = verify(token, keys.jwks)
    expect(result).toEqual({ ok: true, claims: expect.objectContaining({ sub: 'user-1' }) })
  })

  it('accepts a multi-aud token when azp equals clientId', async () => {
    const { keys, token } = await tokenWith({ aud: ['other-client', CLIENT], azp: CLIENT })
    expect(verify(token, keys.jwks).ok).toBe(true)
  })

  it('rejects a multi-aud token with wrong or missing azp', async () => {
    const wrong = await tokenWith({ aud: ['other-client', CLIENT], azp: 'other-client' })
    expect(verify(wrong.token, wrong.keys.jwks)).toEqual({ ok: false, reason: 'azp-mismatch' })
    const missing = await tokenWith({ aud: ['other-client', CLIENT] })
    expect(verify(missing.token, missing.keys.jwks)).toEqual({ ok: false, reason: 'azp-mismatch' })
  })

  it('rejects wrong issuer (exact equality, no trailing-slash normalization)', async () => {
    const { keys, token } = await tokenWith({ iss: 'https://idp.example' })
    expect(verify(token, keys.jwks)).toEqual({ ok: false, reason: 'iss-mismatch' })
  })

  it('rejects aud without clientId and a non-string aud', async () => {
    const other = await tokenWith({ aud: 'other-client' })
    expect(verify(other.token, other.keys.jwks)).toEqual({ ok: false, reason: 'aud-mismatch' })
    const weird = await tokenWith({ aud: 42 })
    expect(verify(weird.token, weird.keys.jwks)).toEqual({ ok: false, reason: 'aud-missing' })
  })

  it('rejects an expired token beyond skew but accepts within skew', async () => {
    const expired = await tokenWith({ exp: NOW - 61 })
    expect(verify(expired.token, expired.keys.jwks)).toEqual({ ok: false, reason: 'expired' })
    const within = await tokenWith({ exp: NOW - 30 })
    expect(verify(within.token, within.keys.jwks).ok).toBe(true)
  })

  it('rejects a not-yet-valid token and a future iat', async () => {
    const nbf = await tokenWith({ nbf: NOW + 3600 })
    expect(verify(nbf.token, nbf.keys.jwks)).toEqual({ ok: false, reason: 'not-yet-valid' })
    const future = await tokenWith({ iat: NOW + 3600 })
    expect(verify(future.token, future.keys.jwks)).toEqual({ ok: false, reason: 'iat-unreasonable' })
  })

  it('rejects a nonce mismatch and missing exp', async () => {
    const nonce = await tokenWith({ nonce: 'other' })
    expect(verify(nonce.token, nonce.keys.jwks)).toEqual({ ok: false, reason: 'nonce-mismatch' })
    const noExp = await tokenWith({ exp: undefined })  // JSON.stringify drops undefined → claim missing
    expect(verify(noExp.token, noExp.keys.jwks)).toEqual({ ok: false, reason: 'missing-claim' })
  })

  it('rejects a mixed-type aud array as aud-missing', async () => {
    const { keys, token } = await tokenWith({ aud: ['sage-desktop', 42] })
    expect(verify(token, keys.jwks)).toEqual({ ok: false, reason: 'aud-missing' })
  })

  it('propagates a JWS-layer rejection', async () => {
    const keys = await generateOidcKeys()
    // brief 原文 sig 段是 'aa'（非 roundtrip 规范形，会被 strict decode 先拒成 not-compact-jws）；
    // 换成 roundtrip 规范段 'YWJj'，守住用例意图：结构合法、kid=ghost 不在 JWKS → kid-not-found
    const forged = 'eyJhbGciOiJSUzI1NiIsImtpZCI6Imdob3N0In0.e30.YWJj'
    expect(verify(forged, keys.jwks)).toEqual({ ok: false, reason: 'kid-not-found' })
  })
})
