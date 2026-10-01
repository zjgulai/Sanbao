import { describe, expect, it } from 'vitest'
import { generateOidcKeys, signEs256Der, signEs256RawWithLength, signEs384Der, signEs384RawWithLength, signJws, signRawSegments, signWithUnknownKey } from './fixtures/oidc-keys.js'
import { verifyCompactJws } from '../src/security/oidc/jws.js'

describe('verifyCompactJws', () => {
  it('accepts a correctly signed RS256 token', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-rsa', 'RS256', {}, { sub: 'user-1' })
    const result = verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['RS256'] })
    expect(result).toEqual({ ok: true, protectedHeader: expect.objectContaining({ alg: 'RS256', kid: 'test-rsa' }), payload: { sub: 'user-1' } })
  })

  it('accepts a correctly signed ES256 token (raw P-1363 signature)', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-ec', 'ES256', {}, { sub: 'user-1' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['ES256'] }).ok).toBe(true)
  })

  it('rejects a non-compact / malformed token', async () => {
    const keys = await generateOidcKeys()
    expect(verifyCompactJws({ untrustedToken: 'not-a-jws', jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'not-compact-jws' })
    expect(verifyCompactJws({ untrustedToken: 'a.b', jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'not-compact-jws' })
    expect(verifyCompactJws({ untrustedToken: 'a.b.c.d', jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'not-compact-jws' })
  })

  it('rejects a base64url segment that silently truncates (strict decode)', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-rsa', 'RS256', {}, { sub: 'x' })
    const [h, , s] = token.split('.')
    // 'bXwwe' decodes to the same 3 bytes as 'bXww' (Node silently drops the 5th char), so strict re-encode equality rejects it.
    expect(verifyCompactJws({ untrustedToken: `${h}.bXwwe.${s}`, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'not-compact-jws' })
    expect(verifyCompactJws({ untrustedToken: `a!b@c.bm90.c2ln`, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'not-compact-jws' })
  })

  it('rejects a non-JSON header', async () => {
    const keys = await generateOidcKeys()
    const token = signRawSegments(keys, 'test-rsa', 'RS256', 'not json', { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'header-not-json' })
  })

  it('rejects a non-JSON payload', async () => {
    const keys = await generateOidcKeys()
    const token = signRawSegments(keys, 'test-rsa', 'RS256', JSON.stringify({ alg: 'RS256', kid: 'test-rsa' }), 'not json')
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'payload-not-json' })
  })

  it('rejects alg none and unsupported algs', async () => {
    const keys = await generateOidcKeys()
    const noneTok = signJws(keys, 'test-rsa', 'RS256', { alg: 'none' }, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: noneTok, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'alg-none' })
    const hsTok = signJws(keys, 'test-rsa', 'RS256', { alg: 'HS256' }, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: hsTok, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'unsupported-alg' })
  })

  it('rejects a header carrying RFC 7715 crit/b64 extensions instead of silently ignoring them', async () => {
    const keys = await generateOidcKeys()
    const critTok = signJws(keys, 'test-rsa', 'RS256', { crit: ['b64'], b64: false }, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: critTok, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'crit-present' })
  })

  it('rejects missing kid and kid not present in JWKS', async () => {
    const keys = await generateOidcKeys()
    const noKid = signJws(keys, 'test-rsa', 'RS256', { kid: undefined }, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: noKid, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'missing-kid' })
    const ghost = signJws(keys, 'test-rsa', 'RS256', { kid: 'ghost' }, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: ghost, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'kid-not-found' })
  })

  it('rejects key-type mismatch (RS256 alg with EC key kid)', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-ec', 'ES256', { alg: 'RS256' }, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'key-type-mismatch' })
  })

  it('rejects a tampered signature and a signature from an unknown key', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-rsa', 'RS256', {}, { sub: 'x' })
    const [h, p, s] = token.split('.')
    const tamperedSig = Buffer.from(s, 'base64url'); tamperedSig[10] ^= 1
    const tampered = `${h}.${p}.${tamperedSig.toString('base64url')}`
    expect(verifyCompactJws({ untrustedToken: tampered, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'signature-invalid' })
    const forged = await signWithUnknownKey('test-rsa')
    expect(verifyCompactJws({ untrustedToken: forged, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'signature-invalid' })
  })

  it('rejects an ES256 signature in DER form and a wrong-length raw signature', async () => {
    const keys = await generateOidcKeys()
    expect(verifyCompactJws({ untrustedToken: signEs256Der(keys), jwks: keys.jwks, acceptedAlgs: ['ES256'] })).toEqual({ ok: false, reason: 'signature-invalid' })
    expect(verifyCompactJws({ untrustedToken: signEs256RawWithLength(keys, 63), jwks: keys.jwks, acceptedAlgs: ['ES256'] })).toEqual({ ok: false, reason: 'signature-invalid' })
  })
})

describe('ES384 support', () => {
  it('accepts a correctly signed ES384 token (raw P-1363, 96 bytes)', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-es384', 'ES384', {}, { sub: 'user-1' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['ES384'] }))
      .toEqual({ ok: true, protectedHeader: expect.objectContaining({ alg: 'ES384', kid: 'test-es384' }), payload: { sub: 'user-1' } })
  })

  it('rejects an ES384 signature in DER form and a wrong-length raw signature', async () => {
    const keys = await generateOidcKeys()
    expect(verifyCompactJws({ untrustedToken: signEs384Der(keys), jwks: keys.jwks, acceptedAlgs: ['ES384'] })).toEqual({ ok: false, reason: 'signature-invalid' })
    expect(verifyCompactJws({ untrustedToken: signEs384RawWithLength(keys, 95), jwks: keys.jwks, acceptedAlgs: ['ES384'] })).toEqual({ ok: false, reason: 'signature-invalid' })
  })

  it('rejects ES384 alg matched with a P-256 key (crv confusion)', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-ec', 'ES256', { alg: 'ES384' }, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['ES384'] })).toEqual({ ok: false, reason: 'key-type-mismatch' })
  })
})

describe('seam negative cases promoted (ADR-0182)', () => {
  it('rejects JWKS with duplicate kid entries', async () => {
    const keys = await generateOidcKeys()
    const dupJwks = { keys: [...keys.jwks.keys, { ...keys.jwks.keys[0] }] }
    const token = signJws(keys, 'test-rsa', 'RS256', {}, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: dupJwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'kid-not-found' })
  })

  it('rejects a non-string kid in the header', async () => {
    const keys = await generateOidcKeys()
    const token = signRawSegments(keys, 'test-rsa', 'RS256', JSON.stringify({ alg: 'RS256', kid: 42 }), { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'missing-kid' })
  })
})
