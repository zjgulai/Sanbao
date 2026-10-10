/** Ticket 026: the four rear read-only families, classified once in main.
 *
 * Rules this module exists to keep (US-129~139):
 *
 * - **Only facts that were observed.** Every field either names a value main actually holds
 *   (identity projection, organization policy, matter projection, the runtime inventory, the Host
 *   snapshot, the data root) or reports why it is absent. Nothing is inferred, and nothing an
 *   actor *reports about itself* is promoted into a conclusion.
 * - **Installation evidence is not a running observation, and neither is compatibility.**
 *   The plugin rows carry installation-time identities/digests; the single boot observation is its
 *   own block. The surface prints both and composes neither.
 * - **Version identity comes from a verifiable source.** The diagnostics block reads the Host
 *   snapshot — relayed from the pinned host, which was accepted only after its manifest matched
 *   the pin — and never a value the renderer supplied.
 */
import type { ReadoutDiagnostics, ReadoutPlugins, ReadoutVisibility } from '../appservice/contracts.js'
import type { RuntimeInventoryResult } from './runtime-inventory-provider.js'
import { isInventoryObservationCurrent } from './runtime-inventory-currency.js'

const SHORT_DIGEST_LENGTH = 12

/** A digest prefix for display. The value stays a prefix: the full digest is never needed on screen. */
export function shortenDigest(value: string): string {
  return value.length > SHORT_DIGEST_LENGTH ? `${value.slice(0, SHORT_DIGEST_LENGTH)}…` : value
}

export interface VisibilityInput {
  /** `loaded` carries the instance policy's organization id; anything else is its own note. */
  readonly policy: { readonly kind: 'loaded', readonly organizationId: string } | { readonly kind: 'unavailable' | 'invalid' }
  /** The one matter projection slot, or undefined when it is absent (never a placeholder). */
  readonly matterProjection: { readonly matter: { readonly responsiblePartyRoleRef: string } } | undefined
}

export function classifyVisibility(input: VisibilityInput): ReadoutVisibility {
  return {
    organizationRef: input.policy.kind === 'loaded' ? input.policy.organizationId : null,
    organizationNote: input.policy.kind === 'loaded' ? 'read' : 'policy-unreadable',
    responsiblePartyRoleRef: input.matterProjection?.matter.responsiblePartyRoleRef ?? null,
    matterNote: input.matterProjection === undefined ? 'projection-absent' : 'read',
  }
}

export interface HostObservationInput {
  readonly kind: 'active' | 'unavailable'
  readonly bootId?: string
  readonly runtimeGeneration?: number
  readonly loaderPhase?: 'active'
}

/** ADR-0295: an available inventory may be listed only for the epoch it was observed in —
 *  a dead or moved Host epoch makes the rows unavailable, never a mixed-epoch claim. */
/** The plugin/extension family: installation evidence rows plus the one boot observation. */
export function classifyPlugins(inventory: RuntimeInventoryResult | undefined, observation: HostObservationInput): ReadoutPlugins {
  const observed = observation.kind === 'active'
    ? {
        loaderPhase: observation.loaderPhase ?? null,
        runtimeGeneration: observation.runtimeGeneration ?? null,
        bootIdShort: observation.bootId === undefined ? null : shortenDigest(observation.bootId),
      }
    : { loaderPhase: null, runtimeGeneration: null, bootIdShort: null }
  if (inventory === undefined) {
    return { state: 'unavailable', code: 'inventory-not-read', components: [], observation: observed }
  }
  if (inventory.kind === 'unavailable') {
    return { state: 'unavailable', code: inventory.code, components: [], observation: observed }
  }
  // ADR-0295: the rows belong to the observed epoch — a gone or moved epoch claims nothing.
  if (observation.kind !== 'active') {
    return { state: 'unavailable', code: 'host-epoch-unavailable', components: [], observation: observed }
  }
  if (!isInventoryObservationCurrent(inventory.evidence, observation)) {
    return { state: 'unavailable', code: 'inventory-epoch-stale', components: [], observation: observed }
  }
  const { descriptor } = inventory
  const rows = [descriptor.host, descriptor.harness, descriptor.provider, descriptor.model, descriptor.agent, descriptor.preset]
    .map((component) => ({
      identity: component.identity,
      version: component.version,
      artifactDigestShort: shortenDigest(component.artifactDigest),
    }))
  return { state: 'read', code: null, components: rows, observation: observed }
}

export interface DiagnosticsInput {
  readonly snapshot: {
    readonly kind: 'active' | 'unavailable'
    readonly harnessVersion?: string
    readonly hostProtocolVersion?: string
    readonly activeGeneration?: string
    readonly manifestSha256?: string
    readonly bootId?: string
    readonly runtimeGeneration?: number
  }
  /** Sage's own data root, as resolved at boot; never a value the renderer supplies. */
  readonly dataRoot: string
  readonly lastCommand: { readonly code: string | null, readonly correlation: string } | null
}

export function classifyDiagnostics(input: DiagnosticsInput): ReadoutDiagnostics {
  const active = input.snapshot.kind === 'active'
  // The snapshot only exists after the ready event was accepted against the pin, so an active
  // snapshot *is* the verification; an unavailable one claims nothing about identity.
  const lastError = input.lastCommand !== null && input.lastCommand.code !== null
    ? { code: input.lastCommand.code, correlation: input.lastCommand.correlation }
    : null
  return {
    harnessVersion: active ? (input.snapshot.harnessVersion ?? null) : null,
    protocolVersion: active ? (input.snapshot.hostProtocolVersion ?? null) : null,
    profileGeneration: active ? (input.snapshot.activeGeneration ?? null) : null,
    manifestSha256Short: active && input.snapshot.manifestSha256 !== undefined ? shortenDigest(input.snapshot.manifestSha256) : null,
    manifestVerified: active,
    dataRoot: input.dataRoot,
    lastError,
  }
}
