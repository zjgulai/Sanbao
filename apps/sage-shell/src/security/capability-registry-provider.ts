/** T05 mid-authorities (ADR-0277): C2D.2A — the app-bundled Capability Registry provider.
 *
 *  The runtime descriptor producer (WT-02C.2E) fails closed while its registry port is absent
 *  ("absence is unavailable, never empty capabilities"): without this provider, production can
 *  never release the descriptor stage. The provider supplies the first published snapshot — the
 *  internal-stage EMPTY registry (no external capability is approved in the internal build) —
 *  sealed and validated through the C2D.1 kernel on every read.
 *
 *  Non-empty entries do NOT ship here. A real entry must follow the governance chain
 *  `candidate → verified C2C descriptor → owner approval → MatrixV2 rule → Adapter mapping`
 *  (ADR-0171) and arrives as a new published snapshot, never by editing the constant below.
 *
 *  Fail-closed: an unsealable body throws on read (the consumer maps the throw to its stable
 *  `registry-unavailable` stage result); construction never throws, so a broken bundle cannot
 *  crash startup. The error message carries no paths and no payload bytes.
 */
import {
  sealCapabilityRegistrySnapshot,
  type CapabilityRegistryEntryBodyV1,
  type CapabilityRegistrySnapshotBodyV1,
} from './capability-registry.js'

/** The first published snapshot body: internal stage, zero approved external capabilities.
 *  `createdAt` is fixed on purpose — publication is a release act, never a runtime clock read —
 *  and the empty entry set is the honest statement "nothing external is approved yet". */
export const EMPTY_INTERNAL_REGISTRY_SNAPSHOT_BODY: CapabilityRegistrySnapshotBodyV1 = Object.freeze({
  schemaVersion: 'sage.capability-registry.v1',
  canonicalizationVersion: 'sage.capability-registry-canonical-json.v1',
  createdAt: '2026-10-10T00:00:00Z',
  entries: Object.freeze([] as CapabilityRegistryEntryBodyV1[]),
})

export interface BundledCapabilityRegistryProvider {
  /** Raw C2D snapshot reader for the runtime-inventory port. Returns the sealed, deep-frozen
   *  snapshot; throws when the bundled body cannot be sealed. */
  readonly read: () => unknown
}

export function createBundledCapabilityRegistryProvider(
  snapshotBody: CapabilityRegistrySnapshotBodyV1 = EMPTY_INTERNAL_REGISTRY_SNAPSHOT_BODY,
): BundledCapabilityRegistryProvider {
  return Object.freeze({
    read: () => {
      const sealed = sealCapabilityRegistrySnapshot(snapshotBody)
      if (!sealed.ok) throw new Error(`sage capability registry provider: bundled snapshot invalid (${sealed.code})`)
      return sealed.value
    },
  })
}
