import type { IdentityPolicyResolution } from '../../src/security/identity-policy.js'

export function identityResolutionDenied(code: import('../../src/security/identity-policy.js').IdentityPolicyDenialCode): IdentityPolicyResolution {
  return { kind: 'denied', code, reason: 'redacted' }
}
