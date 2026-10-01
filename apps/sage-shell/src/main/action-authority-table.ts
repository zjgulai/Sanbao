/** WT-02D.2A v1 action authority table: the product-owned mapping from an intent actionType to
 * the kernel authorization dimensions (role / operation / action policy). Anchored to the
 * fixture revision's declared actionPolicies (`shopify.orders.read` / external-read /
 * requiresDecision) and the WT-02B.2E instance-operator role. Code constant by ruling; the
 * entry shape already separates actionType from operation so a future config / Registry form
 * can take over without changing consumers. */
import type { EffectClass } from '../domain/business-matter.js'

export interface ActionAuthorityEntry {
  readonly requiredRoleRef: string
  readonly operation: string
  /** Kernel-level canonical action scope (distinct from the intent's matter|revision transport axis). */
  readonly actionScope: string
  readonly effectClass: EffectClass
  readonly requiresDecision: boolean
}

export const ACTION_AUTHORITY_TABLE: Readonly<Record<string, ActionAuthorityEntry>> = Object.freeze({
  'start-attempt': Object.freeze({
    requiredRoleRef: 'role:owner',
    operation: 'start-attempt',
    actionScope: 'shopify.orders.read',
    effectClass: 'external-read',
    requiresDecision: true,
  } satisfies ActionAuthorityEntry),
})
