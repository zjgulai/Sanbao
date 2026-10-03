/** WT-02D.0.2 command pipeline: strict sequential orchestration of steps 2-10 (spec §4). */
import type { CommandDenied, CommandPipelinePorts, CommandResult, SageActionIntentV2 } from './command-contracts.js'

function denied(correlation: string, stage: string, code: CommandDenied['code'], extra: Partial<CommandDenied> = {}): CommandDenied {
  return { code, stage, retryable: false, correlation, ...extra }
}

/**
 * Run the command order. Any non-success at a step returns immediately; later ports are never
 * called. Each step re-evaluates against fresh inputs — nothing here is standing authority.
 */
export function runCommand(input: {
  readonly intent: SageActionIntentV2 | { readonly type: 'retry' }
  readonly correlation: string
  readonly ports: CommandPipelinePorts
}): CommandResult {
  const { correlation, ports } = input
  const intent = input.intent

  // Retry (WT-02D.2A): a minimal availability probe (active session + healthy policy), never
  // the action-scoped identity step. Unavailable fails closed with the same stable denial the
  // fail-closed pipeline always produced.
  if ('type' in intent) {
    const availability = ports.checkAuthorizationAvailability()
    if (availability === undefined) {
      return denied(correlation, 'identity-policy', 'identity-unavailable', { retryable: true })
    }
    return { correlation, availability: 'available' }
  }

  // Step 2: action-scoped Identity / Policy.
  const identity = ports.resolveIdentityPolicy({ intent, correlation })
  if (identity === undefined) return denied(correlation, 'identity-policy', 'identity-unavailable', { retryable: true })
  if (identity.kind === 'denied') return denied(correlation, 'identity-policy', 'policy-denied')

  // Creation branch (ADR-0005): a formal matter belongs to the custody side, so a create request
  // never walks the existing-matter steps and must never become a local write. Without a real
  // custodian the honest answer is "not ready yet", not a locally minted matter.
  if (intent.actionType === 'create-matter') {
    const created = ports.createMatter?.({ intent, correlation })
    if (created === undefined || 'denied' in created) {
      return denied(correlation, 'create', 'persistence-unavailable', { retryable: true })
    }
    // US-119: an unconfirmed creation is `outcome-unknown`, and unknown is never retryable — the
    // surface offers 核对 for the same request instead of replaying it.
    if ('unknown' in created) return denied(correlation, 'create', 'outcome-unknown', { retryable: false })
    return { correlation, receiptRef: created.receiptRef }
  }

  // Step 3: strict rehydrate of the current BusinessMatter.
  const rehydrated = ports.strictRehydrate({ matterId: intent.matterId, revisionId: intent.revisionId })
  if (rehydrated === undefined) return denied(correlation, 'rehydrate', 'identity-unavailable', { retryable: true })
  if ('denied' in rehydrated) {
    if (rehydrated.denied === 'stale-revision') {
      return denied(correlation, 'rehydrate', 'stale-revision', { requiresNewRevision: true })
    }
    // not-found maps onto the policy-denied code family: no existence leak to the renderer.
    return denied(correlation, 'rehydrate', 'policy-denied')
  }
  if (!rehydrated.current) return denied(correlation, 'rehydrate', 'stale-revision', { requiresNewRevision: true })

  // Step 4: trusted target requirement for the current revision.
  const target = ports.resolveTarget({ matter: rehydrated.matter })
  if (target === undefined || 'denied' in target) {
    return denied(correlation, 'target', 'compatibility-unknown', { retryable: true })
  }

  // Step 5: domain re-validation rides the target/compat ports in 0.2 (no domain port yet).
  // Step 6: Compatibility Resolver — only an exact unique equivalent may proceed.
  const compat = ports.resolveCompatibility({ targetRequirement: target.targetRequirement })
  if (compat === undefined) return denied(correlation, 'compatibility', 'compatibility-unknown', { retryable: true })
  if ('denied' in compat) {
    return compat.denied === 'requires-new-revision'
      ? denied(correlation, 'compatibility', 'requires-new-revision', { requiresNewRevision: true })
      : denied(correlation, 'compatibility', 'compatibility-unknown', { retryable: true })
  }

  // Step 7: Registry mapping for this action type.
  const registry = ports.resolveRegistry({ actionType: intent.actionType })
  if (registry === undefined || 'denied' in registry) {
    return denied(correlation, 'registry', 'registry-unavailable', { retryable: true })
  }

  // Step 8: no-side-effect availability preflight.
  const preflight = ports.preflightAvailability({ mapping: registry.mapping })
  if (preflight === undefined || 'denied' in preflight) {
    return denied(correlation, 'preflight', 'capability-unavailable', { retryable: true })
  }

  // Step 9: persist preparation facts (service-issued operation identity) before dispatch.
  const persisted = ports.persistPreparation({ mapping: registry.mapping, correlation })
  if (persisted === undefined || 'denied' in persisted) {
    return denied(correlation, 'persist', 'persistence-unavailable', { retryable: true })
  }

  // Step 10: real Adapter dispatch; results normalize to receipt or outcome-unknown.
  const dispatched = ports.dispatchOperation({ mapping: registry.mapping })
  if (dispatched === undefined) return denied(correlation, 'dispatch', 'registry-unavailable', { retryable: true })
  if ('outcome' in dispatched) return denied(correlation, 'dispatch', 'outcome-unknown')
  if ('denied' in dispatched) return denied(correlation, 'dispatch', 'cancelled-before-dispatch')
  return { correlation, receiptRef: dispatched.receipt.receiptRef }
}
