/** WT-02D.2A authorization assembly: maps a parsed business intent plus main's session and
 * organization context onto the kernel's ActionAuthorizationRequest. Pure — no I/O, no clock,
 * no mutation. An unreregistered action type is a definitive `invalid` (it must not reach
 * evaluation); a missing session ref or organization clue is `unavailable` (fail closed). */
import type { SageActionIntentV2 } from '../appservice/command-contracts.js'
import type { ActionAuthorizationRequest } from '../security/identity-policy.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'
import type { ActionAuthorityEntry } from './action-authority-table.js'

export type AuthorizationAssembly =
  | { readonly kind: 'request'; readonly request: ActionAuthorizationRequest }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'invalid' }

export interface AuthorizationAssemblyInput {
  readonly intent: SageActionIntentV2
  readonly sessionRef: string | null
  /** Non-authoritative organization lookup clue (the instance's configured org); see the plan's §3. */
  readonly organizationRef: string | null
  readonly table?: Readonly<Record<string, ActionAuthorityEntry>>
}

export function assembleAuthorizationRequest(input: AuthorizationAssemblyInput): AuthorizationAssembly {
  return assembleSessionCoreAuthorizationRequest({
    operation: input.intent.actionType,
    sessionRef: input.sessionRef,
    organizationRef: input.organizationRef,
    ...(input.table === undefined ? {} : { table: input.table }),
  })
}

export interface SessionCoreAuthorizationAssemblyInput {
  /** A session-family operation name (also the table key: `session.send`, `session.stop`, …). */
  readonly operation: string
  readonly sessionRef: string | null
  readonly organizationRef: string | null
  readonly table?: Readonly<Record<string, ActionAuthorityEntry>>
}

/** T05 first cut: the same table and shape, keyed by a session-family operation name instead of
 *  a business actionType. Both entry points share this core so the table cannot split in two. */
export function assembleSessionCoreAuthorizationRequest(input: SessionCoreAuthorizationAssemblyInput): AuthorizationAssembly {
  const entry = (input.table ?? ACTION_AUTHORITY_TABLE)[input.operation]
  if (entry === undefined) return { kind: 'invalid' }
  if (input.sessionRef === null || input.organizationRef === null) return { kind: 'unavailable' }
  return {
    kind: 'request',
    request: {
      sessionId: input.sessionRef,
      requiredRoleRef: entry.requiredRoleRef,
      operation: entry.operation,
      actionPolicy: {
        actionScope: entry.actionScope,
        effectClass: entry.effectClass,
        requiresDecision: entry.requiresDecision,
      },
      requestedOrganizationRef: input.organizationRef,
    },
  }
}
