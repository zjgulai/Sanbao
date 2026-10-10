/** T05-mid step 7 (ADR-0286): the real registry step over the shipped first-party publication.
 *
 *  Resolves the operation's approved capability from the SAME main-owned registry provider the
 *  runtime inventory observed (the boot-fixed published snapshot), then binds three facts before
 *  answering:
 *  1. snapshot generation — the inventory evidence's registrySnapshotDigest equals the sealed
 *     snapshot id (the chain admitted this exact snapshot, not a later or earlier one);
 *  2. declared agreement — the requirement's declared registryDescriptorDigest and
 *     adapterMappingDigest equal the digests re-derived from the snapshot entry through the
 *     shared derivation module (one forma, both consumers);
 *  3. approval state — approved + verified, effective inside the evidence-instant window.
 *
 *  Failure taxonomy (adjudicated 2026-10-10): no mapping, ambiguity, candidate, generation /
 *  window / declaration mismatch all answer `unavailable` — "not provisioned" is never dressed
 *  up as a refusal; only an explicitly disabled / revoked entry answers `denied`.
 *
 *  The mappingRef is deterministic from the snapshot: re-publishing moves it by construction.
 */
import type { ProtectedEffectAdmissionPorts } from '../appservice/protected-effect-admission.js'
import { parseCapabilityRegistrySnapshot } from '../security/capability-registry.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'
import { capabilityAdapterMappingDigest, capabilityRegistryDescriptorDigest, contentDigestOf } from './capability-entry-derivation.js'
import type { RequirementBundleLoad } from './publication-bundle.js'
import type { RuntimeInventoryObservation } from './session-prompt-compatibility.js'
import type { RegistrySnapshotPort } from './runtime-inventory-provider.js'

export interface SessionPromptRegistryOptions {
  readonly requirementBundle: RequirementBundleLoad
  /** The same provider instance that fed the observed inventory (published snapshot, boot-fixed). */
  readonly registryProvider: RegistrySnapshotPort
  /** The last trusted runtime observation (startup composition result), or undefined while absent. */
  readonly runtimeObservation: () => RuntimeInventoryObservation | undefined
}

export function createSessionPromptRegistryPort(
  options: SessionPromptRegistryOptions,
): NonNullable<ProtectedEffectAdmissionPorts['resolveRegistry']> {
  // Bound at construction so an unwired or failed publication is visible at assembly time (and
  // the wiring probe in tests can observe it) instead of only per request.
  const bundleOk = options.requirementBundle.ok
  return async ({ intent }) => {
    const bundle = options.requirementBundle
    const observation = options.runtimeObservation()
    if (!bundleOk || !bundle.ok || observation === undefined) return { state: 'unavailable' }

    let sealed: unknown
    try {
      sealed = options.registryProvider.read()
    } catch {
      return { state: 'unavailable' }
    }
    const parsed = parseCapabilityRegistrySnapshot(sealed)
    if (!parsed.ok) return { state: 'unavailable' }
    const snapshot = parsed.value

    // (1) Generation binding: the admitted chain observed exactly this snapshot.
    if (contentDigestOf(snapshot.snapshotId) !== observation.evidence.registrySnapshotDigest) {
      return { state: 'unavailable' }
    }

    // (2) The operation's entries — exactly one may claim it; ambiguity invents no authority.
    const claiming = snapshot.entries.filter((entry) =>
      entry.operations.some((operation) => operation.operationId === intent.operation))
    if (claiming.length !== 1) return { state: 'unavailable' }
    const entry = claiming[0]!

    // (3) Approval state at the evidence instant. Disabled / revoked are deliberate governance
    // acts — the only states that answer a refusal; everything else is "not provisioned yet".
    if (entry.state === 'disabled' || entry.state === 'revoked') return { state: 'denied' }
    if (entry.state !== 'approved') return { state: 'unavailable' }
    if (entry.descriptor.verification !== 'verified') return { state: 'unavailable' }
    const evaluated = Date.parse(observation.evidence.observedAt)
    if (!(Date.parse(entry.effectiveAt) <= evaluated)
      || (entry.expiresAt !== undefined && !(evaluated < Date.parse(entry.expiresAt)))) {
      return { state: 'unavailable' }
    }

    // (4) Declared agreement with the requirement, via the same table the other steps read.
    const table = ACTION_AUTHORITY_TABLE[intent.operation]
    if (table === undefined) return { state: 'unavailable' }
    const declaring = bundle.snapshot.entries.filter((candidate) => candidate.actionRequirements
      .some((action) => action.actionScope === table.actionScope))
    const requirement = declaring.length === 1 ? declaring[0] : undefined
    if (requirement === undefined) return { state: 'unavailable' }
    const declared = requirement.capabilities.filter((capability) => capability.identity === entry.capabilityId)
    if (declared.length !== 1) return { state: 'unavailable' }
    const capability = declared[0]!
    const mappingDigest = capabilityAdapterMappingDigest(entry)
    if (capability.version !== entry.capabilityVersion
      || capability.registryDescriptorDigest !== capabilityRegistryDescriptorDigest(entry)
      || capability.adapterMappingDigest !== mappingDigest) {
      return { state: 'unavailable' }
    }

    return {
      state: 'allowed',
      value: { mappingRef: `mapping:${snapshot.snapshotId}:${mappingDigest}` },
    }
  }
}
