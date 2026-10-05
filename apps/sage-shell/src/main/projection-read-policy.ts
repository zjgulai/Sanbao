/** T03: main-owned read authority for matter selection and projection reads.
 *
 * One decision core evaluates the instance-local organization policy (ADR-0188: the file is
 * truth, re-read on every call, zero fs import) for both authorization points:
 *  - selection time (`authorizeMatterRead`) decides whether the current identity may read a
 *    matter at all, and on allow mints a fresh high-entropy actor scope bound to
 *    (session, matter, policy digest) in a main-owned in-memory ledger;
 *  - read time (`authorizeProjectionRead`) answers the admission kernel's read-policy step for
 *    one exact projection operation, returning the same bound actor scope — a scope minted
 *    under a different policy version, for another matter, or without a bound selection is a
 *    denial, never an inheritance.
 *
 * Fail-closed taxonomy mirrors the identity-policy kernel: a question that cannot be answered
 * (no session, unreadable policy) is `undefined` → the admission kernel reports unavailable;
 * a negative answer (wrong session, expired windows, malformed policy, missing grant, no bound
 * scope) is `denied`. Grants only authorize `local-read` effects without a decision requirement;
 * nothing here can ever authorize a write. */
import { randomUUID } from 'node:crypto'
import { loadOrganizationPolicy } from './organization-policy.js'
import type { LocalOrganizationPolicyProviderInput } from './organization-policy.js'
import type { VaultIdentitySession } from './token-vault.js'
import { isProjectionReadOperation, type ProjectionReadOperation } from '../appservice/projection-read-admission.js'

/** Selection-time read authority: one operation/scope pair the policy file must grant. */
const SELECTION_READ = { operation: 'matter.read', actionScope: 'matter.read' } as const
/** Every projection read rides one canonical action scope; the operation stays the file's word. */
const PROJECTION_ACTION_SCOPE = 'projection.read' as const

export interface ProjectionReadPolicyPorts {
  readonly vault: { readonly identitySession: () => VaultIdentitySession | null }
  readonly policyPath: string
  readonly readFileBytes: (absolutePath: string) => Buffer
  readonly now: () => string
}

export interface ProjectionReadPolicy {
  readonly authorizeMatterRead: (request: {
    readonly sessionRef: string
    readonly matterId: string
  }) => { readonly state: 'allowed'; readonly actorScopeRef: string } | { readonly state: 'denied' } | undefined
  readonly authorizeProjectionRead: (request: {
    readonly sessionRef: string
    readonly matterId: string
    readonly operation: ProjectionReadOperation
  }) =>
    | { readonly state: 'allowed'; readonly actorScopeRef: string; readonly decisionRef: string }
    | { readonly state: 'denied' }
    | undefined
}

interface BoundScope {
  readonly sessionRef: string
  readonly matterId: string
  readonly actorScopeRef: string
  readonly policyDigest: string
}

function windowActive(validFrom: string, expiresAt: string, evaluatedAt: string): boolean {
  const evaluated = Date.parse(evaluatedAt)
  return Date.parse(validFrom) <= evaluated && evaluated < Date.parse(expiresAt)
}

function isDenied(value: { readonly state: 'allowed' } | { readonly state: 'denied' } | undefined):
  value is { readonly state: 'denied' } {
  return value !== undefined && value.state === 'denied'
}

export function createProjectionReadPolicy(ports: ProjectionReadPolicyPorts): ProjectionReadPolicy {
  const input: LocalOrganizationPolicyProviderInput = { policyPath: ports.policyPath, readFileBytes: ports.readFileBytes }
  // Latest bound scope per (session, matter). Session changes prune everything: a scope never
  // outlives the identity session that minted it.
  const ledger = new Map<string, BoundScope>()
  const key = (sessionRef: string, matterId: string): string => `${sessionRef}\u0000${matterId}`

  function currentSession(): VaultIdentitySession | null {
    const session = ports.vault.identitySession()
    if (session === null) return null
    for (const [existingKey, bound] of ledger) {
      if (bound.sessionRef !== session.sessionRef) ledger.delete(existingKey)
    }
    return session
  }

  /** Shared grant evaluation. `undefined` = unanswerable (caller maps to unavailable). */
  function evaluateGrant(wanted: { readonly operation: string; readonly actionScope: string }):
    | { readonly state: 'allowed'; readonly policyDigest: string }
    | { readonly state: 'denied' }
    | undefined {
    const session = ports.vault.identitySession()
    if (session === null) return undefined
    if (!windowActive(session.authenticatedAt, session.expiresAt, ports.now())) return { state: 'denied' }
    const load = loadOrganizationPolicy(input)
    if (load.kind === 'unavailable') return undefined
    if (load.kind === 'invalid') return { state: 'denied' }
    const { policy } = load
    if (!windowActive(policy.validFrom, policy.expiresAt, ports.now())) return { state: 'denied' }
    const grant = policy.grants.find((candidate) =>
      policy.roleRefs.includes(candidate.roleRef)
      && candidate.operation === wanted.operation
      && candidate.actionScope === wanted.actionScope
      && candidate.effectClass === 'local-read'
      && candidate.requiresDecision === false)
    if (grant === undefined) return { state: 'denied' }
    return { state: 'allowed', policyDigest: policy.policy.digest }
  }

  return {
    authorizeMatterRead(request) {
      const session = currentSession()
      if (session === null) return undefined
      if (session.sessionRef !== request.sessionRef) return { state: 'denied' }
      const decision = evaluateGrant(SELECTION_READ)
      if (decision === undefined) return undefined
      if (isDenied(decision)) return { state: 'denied' }
      // Each granted selection binds its own scope; the ledger keeps the latest per (session, matter).
      const actorScopeRef = `scope:${randomUUID()}`
      ledger.set(key(request.sessionRef, request.matterId), {
        sessionRef: request.sessionRef, matterId: request.matterId, actorScopeRef, policyDigest: decision.policyDigest,
      })
      return { state: 'allowed', actorScopeRef }
    },

    authorizeProjectionRead(request) {
      const session = currentSession()
      if (session === null) return undefined
      if (session.sessionRef !== request.sessionRef) return { state: 'denied' }
      if (!isProjectionReadOperation(request.operation)) return { state: 'denied' }
      // Evaluate the policy before consulting the ledger: an unreadable policy leaves the whole
      // question unanswerable (unavailable), while a readable policy with no bound scope is a
      // definite denial — never an inheritance from the grant alone.
      const decision = evaluateGrant({ operation: request.operation, actionScope: PROJECTION_ACTION_SCOPE })
      if (decision === undefined) return undefined
      if (isDenied(decision)) return { state: 'denied' }
      const bound = ledger.get(key(request.sessionRef, request.matterId))
      if (bound === undefined) return { state: 'denied' }
      if (decision.policyDigest !== bound.policyDigest) return { state: 'denied' }
      return {
        state: 'allowed',
        actorScopeRef: bound.actorScopeRef,
        decisionRef: `projection-read:${decision.policyDigest}:${request.operation}`,
      }
    },
  }
}
