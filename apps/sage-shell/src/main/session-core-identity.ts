/** T05 first cut (ADR-0275): the session-family protected effects evaluate the real Identity /
 *  Policy step. The same kernel, table and policy file the command pipeline already uses; only
 *  the assembly key differs (a session-family operation name instead of a business actionType).
 *
 *  Doctrine (protected-effect kernel): provider failures collapse to stable product states, and
 *  authority objects never reach callers. The two fact refs are opaque, non-reversible refs:
 *  `actorScopeRef` is stable for one actor (issuer + identity handle + organization) and
 *  `decisionRef` binds this exact evaluation (policy digest, role, operation, action policy and
 *  evaluation time), so a later re-evaluation is never mistaken for standing authority.
 *
 *  An operation with no registered entry answers `unavailable` — the honest "this dimension is
 *  not declared yet", which the surface reads as not-ready, never as a policy denial.
 */
import { createHash } from 'node:crypto'

import type { FreshIdentityPolicyFact, ProtectedEffectStepResult } from '../appservice/protected-effect-admission.js'
import type { ProtectedEffectAdmissionPorts } from '../appservice/protected-effect-admission.js'
import type { AuthorizedIdentityPolicyResolution } from '../security/identity-policy.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'
import { assembleSessionCoreAuthorizationRequest } from './authorization-assembly.js'
import { createSageAuthorityRuntime } from './authority-runtime.js'
import { loadOrganizationPolicy } from './organization-policy.js'
import type { TokenVault } from './token-vault.js'

export interface SessionCoreIdentityOptions {
  readonly vault: TokenVault
  readonly authority: {
    readonly policyPath: string
    readonly readFileBytes: (absolutePath: string) => Buffer
    readonly now: () => string
  }
}

function digestOf(domain: string, fields: readonly string[]): string {
  return domain + createHash('sha256').update([domain, ...fields].join('\0'), 'utf8').digest('hex')
}

/** Opaque, non-reversible facts of one authorized decision (see the module header for the
 *  stability properties; raw subject, token and session never leave this function in raw form —
 *  the handle participates only through the hash). */
export function sessionCoreIdentityFacts(resolution: AuthorizedIdentityPolicyResolution): FreshIdentityPolicyFact {
  const snapshot = resolution.authoritySnapshot
  const actorScopeRef = digestOf('urn:sage:actor-scope:v1:', [
    snapshot.issuer.identity,
    snapshot.identityHandle,
    snapshot.organizationId,
  ])
  const decisionRef = digestOf('urn:sage:identity-decision:v1:', [
    snapshot.issuer.digest,
    snapshot.identityHandle,
    snapshot.organizationId,
    snapshot.roleRef,
    snapshot.operation,
    snapshot.actionPolicy.actionScope,
    snapshot.actionPolicy.effectClass,
    String(snapshot.actionPolicy.requiresDecision),
    snapshot.policy.digest,
    snapshot.identityExpiresAt,
    snapshot.evaluatedAt,
  ])
  return { decisionRef, actorScopeRef }
}

export function createSessionCoreIdentityPort(
  options: SessionCoreIdentityOptions,
): NonNullable<ProtectedEffectAdmissionPorts['resolveIdentityPolicy']> {
  const policyInput = { policyPath: options.authority.policyPath, readFileBytes: options.authority.readFileBytes }
  const runtime = createSageAuthorityRuntime({
    vault: options.vault,
    policyPath: options.authority.policyPath,
    readFileBytes: options.authority.readFileBytes,
    now: options.authority.now,
  })
  return async ({ intent }): Promise<ProtectedEffectStepResult<FreshIdentityPolicyFact>> => {
    // Checked before any file read: an unregistered operation is "not declared yet", not a
    // policy question, and it must not cost a policy read.
    if (ACTION_AUTHORITY_TABLE[intent.operation] === undefined) return { state: 'unavailable' }
    const session = options.vault.identitySession()
    const load = loadOrganizationPolicy(policyInput)
    const assembled = assembleSessionCoreAuthorizationRequest({
      operation: intent.operation,
      sessionRef: session?.sessionRef ?? null,
      organizationRef: load.kind === 'loaded' ? load.policy.organizationId : null,
    })
    if (assembled.kind !== 'request') return { state: 'unavailable' }
    const resolution = runtime.resolve(assembled.request)
    if (resolution.kind !== 'authorized') return { state: 'denied' }
    return { state: 'allowed', value: sessionCoreIdentityFacts(resolution) }
  }
}
