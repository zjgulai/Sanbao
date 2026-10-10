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
  // Creation is custody-side (ADR-0005: every formal matter is hosted; a client must never mint
  // one locally and merge later), so it carries its own scope and an external-write effect class.
  // Registering it is what lets a create request reach the creation branch instead of dying as
  // an unregistered action type; whether it then succeeds depends on a real custodian port.
  'create-matter': Object.freeze({
    requiredRoleRef: 'role:owner',
    operation: 'create-matter',
    actionScope: 'matter.create',
    effectClass: 'external-write',
    requiresDecision: false,
  } satisfies ActionAuthorityEntry),
  // T05 first cut (ADR-0275): the session-family prompt is the matter's baseline work, so it is
  // registered with its own scope and an external-write effect class (user content leaves the
  // machine for the model). Chat continuation is not a per-message governed decision; a later
  // policy generation can tighten this without changing the consumers.
  'session.send': Object.freeze({
    requiredRoleRef: 'role:owner',
    operation: 'session.send',
    actionScope: 'session.prompt',
    effectClass: 'external-write',
    requiresDecision: false,
  } satisfies ActionAuthorityEntry),
  // T05 prepare (ADR-0290): entering the first working revision is a local audit write. It
  // touches only the Sage-owned store, so it registers with a local-write class of its own —
  // a distinct grant from the external-write send it prepares for.
  'session.prepare': Object.freeze({
    requiredRoleRef: 'role:owner',
    operation: 'session.prepare',
    actionScope: 'session.prepare',
    effectClass: 'local-write',
    requiresDecision: false,
  } satisfies ActionAuthorityEntry),
})
