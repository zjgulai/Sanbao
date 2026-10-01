import { describe, expect, it } from 'vitest'
import { verifyProviderMetadata } from '../src/security/oidc/metadata.js'

const expected = {
  issuer: 'https://idp.example/',
  authorizationEndpoint: 'https://idp.example/authorize',
  tokenEndpoint: 'https://idp.example/token',
  jwksUri: 'https://idp.example/jwks',
}
const valid = {
  issuer: 'https://idp.example/',
  authorization_endpoint: 'https://idp.example/authorize',
  token_endpoint: 'https://idp.example/token',
  jwks_uri: 'https://idp.example/jwks',
}

describe('verifyProviderMetadata', () => {
  it('accepts exact-matching metadata', () => {
    expect(verifyProviderMetadata({ untrusted: valid, expected })).toEqual({ ok: true })
  })

  it('rejects non-object input', () => {
    expect(verifyProviderMetadata({ untrusted: 'x', expected })).toEqual({ ok: false, reason: 'not-json-object' })
    expect(verifyProviderMetadata({ untrusted: null, expected })).toEqual({ ok: false, reason: 'not-json-object' })
    expect(verifyProviderMetadata({ untrusted: [valid], expected })).toEqual({ ok: false, reason: 'not-json-object' })
  })

  it('rejects missing required fields', () => {
    expect(verifyProviderMetadata({ untrusted: { ...valid, jwks_uri: undefined }, expected })).toEqual({ ok: false, reason: 'missing-required-field' })
  })

  it('rejects each field mismatch independently (exact equality, no normalization)', () => {
    expect(verifyProviderMetadata({ untrusted: { ...valid, issuer: 'https://idp.example' }, expected })).toEqual({ ok: false, reason: 'issuer-mismatch' })
    expect(verifyProviderMetadata({ untrusted: { ...valid, authorization_endpoint: 'https://idp.example/authorize/' }, expected })).toEqual({ ok: false, reason: 'authorization-endpoint-mismatch' })
    expect(verifyProviderMetadata({ untrusted: { ...valid, token_endpoint: 'https://evil.example/token' }, expected })).toEqual({ ok: false, reason: 'token-endpoint-mismatch' })
    expect(verifyProviderMetadata({ untrusted: { ...valid, jwks_uri: 'https://evil.example/jwks' }, expected })).toEqual({ ok: false, reason: 'jwks-uri-mismatch' })
  })

  it('rejects non-string field types as missing', () => {
    expect(verifyProviderMetadata({ untrusted: { ...valid, issuer: 42 }, expected })).toEqual({ ok: false, reason: 'missing-required-field' })
  })
})
