/** T05-mid step 8 (ADR-0287): the preflight step — fresh availability of the live runtime epoch.
 *
 *  `approved` (registry) does not imply `available`: the approved operation rides the live dsh
 *  runtime epoch, and the effect instant needs a fresh, side-effect-free confirmation that the
 *  epoch is still there and effective. The port re-reads the main-owned runtime-effective
 *  observation (protocol v5, live per call — undefined once the Host epoch is gone) and answers
 *  the same three-step reading the runtime-inventory producer established at boot:
 *  shape-valid, `observed`, and nothing else. Every non-observed outcome — absent, invalid,
 *  registry-service-absent, observation-failed — is `unavailable`: a runtime that is not there
 *  is not a refusal.
 *
 *  What this v1 does NOT claim: the boot-time static coherence (`default ∈ preset members`) was
 *  proved by the inventory producer, not here; neither does availability prove execution
 *  authority (dispatch stays absent). The preflightRef binds the admitted chain facts and the
 *  live observation, so a moved roster moves the ref by construction.
 *
 *  No writes, no clock reads, no decisions: pure reads plus one deterministic domain-separated
 *  digest. `denied` / `stale` never appear at this step (adjudicated 2026-10-10).
 */
import { createHash } from 'node:crypto'

import type { ProtectedEffectAdmissionPorts } from '../appservice/protected-effect-admission.js'
import { isRuntimeEffectiveObservation, type RuntimeEffectiveObservation } from '../protocol.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'
import type { RequirementBundleLoad } from './publication-bundle.js'

export interface SessionPromptPreflightOptions {
  readonly requirementBundle: RequirementBundleLoad
  /** Live read of the runtime-effective observation of the Host epoch; undefined once it is gone. */
  readonly runtimeEffective: () => RuntimeEffectiveObservation | undefined
}

/** Opaque ref keeps the urn shape with the domain-separated hash appended. */
function preflightRef(parts: readonly string[]): string {
  const domain = 'urn:sage:preflight:v1:'
  return domain + createHash('sha256').update([domain, ...parts].join('\0'), 'utf8').digest('hex')
}

export function createSessionPromptPreflightPort(
  options: SessionPromptPreflightOptions,
): NonNullable<ProtectedEffectAdmissionPorts['preflight']> {
  // Bound at construction so an unwired or failed publication is visible at assembly time (and
  // the wiring probe in tests can observe it) instead of only per request.
  const bundleOk = options.requirementBundle.ok
  return async ({ intent, target, registry }) => {
    const bundle = options.requirementBundle
    if (!bundleOk || !bundle.ok) return { state: 'unavailable' }
    if (!registry.mappingRef.startsWith('mapping:')) return { state: 'unavailable' }

    const table = ACTION_AUTHORITY_TABLE[intent.operation]
    if (table === undefined) return { state: 'unavailable' }
    const declaring = bundle.snapshot.entries.filter((candidate) => candidate.actionRequirements
      .some((action) => action.actionScope === table.actionScope))
    const requirement = declaring.length === 1 ? declaring[0] : undefined
    if (requirement === undefined) return { state: 'unavailable' }

    // Fresh availability: the live epoch read happens at the effect instant, after every serial
    // guard above — never earlier, so an unusable chain never touches the Host.
    let live: unknown
    try {
      live = options.runtimeEffective()
    } catch {
      return { state: 'unavailable' }
    }
    if (live === undefined || !isRuntimeEffectiveObservation(live)) return { state: 'unavailable' }
    if (live.kind !== 'observed') return { state: 'unavailable' }

    return {
      state: 'allowed',
      value: {
        preflightRef: preflightRef([
          target.targetRef,
          registry.mappingRef,
          requirement.requirementDigest,
          JSON.stringify(live),
        ]),
      },
    }
  }
}
