/** WT-02B.2B-pre provider metadata kernel: exact string equality, no URL normalization. */
export interface ExpectedProviderMetadata {
  readonly issuer: string
  readonly authorizationEndpoint: string
  readonly tokenEndpoint: string
  readonly jwksUri: string
}

export type MetadataRejection =
  | 'not-json-object' | 'issuer-mismatch' | 'authorization-endpoint-mismatch'
  | 'token-endpoint-mismatch' | 'jwks-uri-mismatch' | 'missing-required-field'

function expectField(untrusted: Record<string, unknown>, key: string): string | undefined {
  const value = untrusted[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function verifyProviderMetadata(input: {
  readonly untrusted: unknown
  readonly expected: ExpectedProviderMetadata
}): { readonly ok: true } | { readonly ok: false; readonly reason: MetadataRejection } {
  const untrusted = input.untrusted
  if (untrusted === null || typeof untrusted !== 'object' || Array.isArray(untrusted)) {
    return { ok: false, reason: 'not-json-object' }
  }
  const record = untrusted as Record<string, unknown>

  const issuer = expectField(record, 'issuer')
  const authorizationEndpoint = expectField(record, 'authorization_endpoint')
  const tokenEndpoint = expectField(record, 'token_endpoint')
  const jwksUri = expectField(record, 'jwks_uri')
  if (issuer === undefined || authorizationEndpoint === undefined || tokenEndpoint === undefined || jwksUri === undefined) {
    return { ok: false, reason: 'missing-required-field' }
  }

  if (issuer !== input.expected.issuer) return { ok: false, reason: 'issuer-mismatch' }
  if (authorizationEndpoint !== input.expected.authorizationEndpoint) return { ok: false, reason: 'authorization-endpoint-mismatch' }
  if (tokenEndpoint !== input.expected.tokenEndpoint) return { ok: false, reason: 'token-endpoint-mismatch' }
  if (jwksUri !== input.expected.jwksUri) return { ok: false, reason: 'jwks-uri-mismatch' }
  return { ok: true }
}
