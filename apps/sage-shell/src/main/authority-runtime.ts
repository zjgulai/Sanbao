/** WT-02B.2E Authority Runtime: assembles the production Identity / Policy resolver in main.
 * Identity sessions come from the in-memory vault (verified issuer, timing, session ref);
 * organization policy comes from the instance-local policy file. Not wired into the command
 * pipeline yet — the intent→request assembly belongs to WT-02D.2. */
import { createHash } from 'node:crypto'
import { createIdentityPolicyResolver } from '../security/identity-policy.js'
import type { IdentityPolicyResolution } from '../security/identity-policy.js'
import { createLocalOrganizationPolicyProvider } from './organization-policy.js'
import type { TokenVault } from './token-vault.js'

export const SAGE_DESKTOP_AUDIENCE = 'sage-desktop' as const

export interface SageAuthorityRuntime {
  /** Kernel accessor: untrusted request in, frozen resolution out. */
  readonly resolve: (request: unknown) => IdentityPolicyResolution
}

export interface SageAuthorityRuntimeInput {
  readonly vault: TokenVault
  readonly policyPath: string
  readonly readFileBytes: (absolutePath: string) => Buffer
  /** Trusted clock (ISO UTC); production injects the system clock. */
  readonly now: () => string
}

export function createSageAuthorityRuntime(input: SageAuthorityRuntimeInput): SageAuthorityRuntime {
  const policy = createLocalOrganizationPolicyProvider({
    policyPath: input.policyPath,
    readFileBytes: input.readFileBytes,
  })
  const resolver = createIdentityPolicyResolver({
    audience: SAGE_DESKTOP_AUDIENCE,
    resolveIdentity: () => {
      const session = input.vault.identitySession()
      if (session === null) {
        // No active session: the kernel maps this throw to identity-provider-unavailable.
        throw new Error('sage-authority: no active identity session')
      }
      return {
        issuer: {
          identity: session.issuer,
          // v1 issuer-identity record version; the digest binds the exact issuer value.
          version: '1',
          digest: 'urn:sage:issuer-identity:sha256:'
            + createHash('sha256').update(Buffer.from(session.issuer, 'utf8')).digest('hex'),
        },
        identityHandle: session.identityHandle,
        audience: SAGE_DESKTOP_AUDIENCE,
        // The active session's own ref: a caller holding a stale ref gets identity-session-mismatch.
        sessionId: session.sessionRef,
        authenticatedAt: session.authenticatedAt,
        expiresAt: session.expiresAt,
      }
    },
    resolvePolicy: (request) => policy.resolve(request),
    now: () => input.now(),
  })
  return Object.freeze({
    resolve: (request: unknown) => resolver.resolve(request),
  })
}
