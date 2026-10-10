/** T05-mid step 6 (ADR-0284): the real compatibility step over the shipped matrix publication.
 *
 *  The port composes the exact V2 resolve input from main-owned facts only:
 *  the published requirement (semantic rebuild), the startup-loaded matrix/revocation publication,
 *  the last trusted runtime observation and the store-validated revision digest. It then asks the
 *  C2 kernel — the kernel's own digest recomputation and binding checks are the sole validation
 *  gate; this module adds nothing and hides nothing.
 *
 *  Evaluation instant: the kernel requires `evaluatedAt` inside the inventory evidence window
 *  `[observedAt, expiresAt)` (30 seconds). Re-observing per request is 50-200s of work and cannot
 *  sit on the request path, so this port evaluates AT the evidence's own observedAt — the last
 *  trusted observation. Wall-clock freshness of runtime observations is a separate mechanism
 *  (host-lifecycle invalidation) registered as the follow-up in ADR-0284; until it lands,
 *  compatibility asserts against the boot-time observation.
 *
 *  Outcome mapping: `equivalent` -> allowed (an opaque evaluation ref); `requires-new-revision`
 *  -> denied (the published rule itself refuses this pairing); everything else -> unavailable.
 *  Every derived digest is domain-separated and deterministic; none of them mints authority.
 */
import { createHash } from 'node:crypto'

import type { ProtectedEffectAdmissionPorts } from '../appservice/protected-effect-admission.js'
import {
  computeTargetEvidenceDigestV2,
  resolveCompatibilityV2,
  type CompatibilityTargetEvidenceBodyV2,
  type RuntimeDescriptorV2,
  type RuntimeInventoryEvidenceV2,
} from '../security/compatibility.js'
import { toCompatibilityMatrixV2ProviderResult } from '../security/compatibility-matrix-provider.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'
import { loadOrganizationPolicy } from './organization-policy.js'
import type { CompatibilityMatrixPublicationLoad, RequirementBundleLoad } from './publication-bundle.js'
import { computeTargetSemanticFromRequirement } from './target-requirement-candidate.js'

export interface RuntimeInventoryObservation {
  readonly descriptor: RuntimeDescriptorV2
  readonly evidence: RuntimeInventoryEvidenceV2
}

export interface SessionPromptCompatibilityOptions {
  readonly authority: {
    readonly policyPath: string
    readonly readFileBytes: (absolutePath: string) => Buffer
  }
  readonly requirementBundle: RequirementBundleLoad
  readonly matrixPublication: CompatibilityMatrixPublicationLoad
  /** The last trusted runtime observation (startup composition result), or undefined while absent. */
  readonly runtimeObservation: () => RuntimeInventoryObservation | undefined
  /** The store-validated committed digest of one revision, or undefined when unknown. */
  readonly revisionDigest: (matterId: string, revisionId: string) => string | undefined
  readonly now: () => string
}

/** The evidence fields demand `sha256:<hex>`; the domain only enters the hash preimage. */
function evidenceDigest(domain: string, parts: readonly string[]): string {
  return `sha256:${createHash('sha256').update([domain, ...parts].join('\0'), 'utf8').digest('hex')}`
}

/** Opaque refs keep their urn shape with the domain-separated hash appended. */
function urnDigest(domain: string, parts: readonly string[]): string {
  return domain + createHash('sha256').update([domain, ...parts].join('\0'), 'utf8').digest('hex')
}

export function createSessionPromptCompatibilityPort(
  options: SessionPromptCompatibilityOptions,
): NonNullable<ProtectedEffectAdmissionPorts['resolveCompatibility']> {
  // Bound at construction so an unwired or failed publication is visible at assembly time (and
  // the wiring probe in tests can observe it) instead of only per request.
  const bundleOk = options.requirementBundle.ok
  const publicationOk = options.matrixPublication.ok
  return async ({ intent, context, identityPolicy }) => {
    const bundle = options.requirementBundle
    const publication = options.matrixPublication
    const observation = options.runtimeObservation()
    if (!bundleOk || !publicationOk || !bundle.ok || !publication.ok || observation === undefined) return { state: 'unavailable' }

    const entry = ACTION_AUTHORITY_TABLE[intent.operation]
    if (entry === undefined) return { state: 'unavailable' }
    const declaring = bundle.snapshot.entries.filter(candidate => candidate.actionRequirements
      .some(action => action.actionScope === entry.actionScope))
    const requirement = declaring.length === 1 ? declaring[0] : undefined
    if (requirement === undefined) return { state: 'unavailable' }

    const rebuilt = computeTargetSemanticFromRequirement(requirement, observation.descriptor)
    if (!rebuilt.ok) return { state: 'unavailable' }
    const targetSemantic = rebuilt.semantic

    const revisionDigest = options.revisionDigest(context.matterRef, context.revisionRef)
    if (revisionDigest === undefined) return { state: 'unavailable' }

    const policy = loadOrganizationPolicy({ policyPath: options.authority.policyPath, readFileBytes: options.authority.readFileBytes })
    if (policy.kind !== 'loaded') return { state: 'unavailable' }

    // Evaluation instant = the evidence's own observedAt (see the module header). The evidence is
    // observation-stamped, so the kernel window check stays meaningful and never tautological
    // against wall-clock drift.
    const evaluatedAt = observation.evidence.observedAt

    const matrix = publication.provider.resolve({
      schemaVersion: 'sage.compatibility-matrix-provider-request.v2',
      targetSemanticDigest: targetSemantic.targetSemanticDigest,
      runtimeDescriptorDigest: observation.descriptor.runtimeDescriptorDigest,
      evaluatedAt,
      matrixId: publication.matrixId,
    })
    if (matrix.kind !== 'available') return { state: 'unavailable' }

    const issuedAt = options.now()
    const actionIntent = evidenceDigest('urn:sage:action-intent:v1:', [
      intent.operation,
      JSON.stringify(intent.candidate),
      JSON.stringify(intent.payload),
    ])
    const targetEvidenceBody: CompatibilityTargetEvidenceBodyV2 = {
      schemaVersion: 'sage.compatibility-target-evidence.v2',
      canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
      targetSemanticDigest: targetSemantic.targetSemanticDigest,
      matterId: context.matterRef,
      revisionId: context.revisionRef,
      revisionDigest,
      actionScope: entry.actionScope,
      actionIntentDigest: actionIntent,
      organizationBoundaryDigest: evidenceDigest('urn:sage:compatibility-boundary.organization:v1:', [policy.policy.policy.digest]),
      accountBoundaryDigest: evidenceDigest('urn:sage:compatibility-boundary.account:v1:', [identityPolicy.actorScopeRef]),
      resourceBoundaryDigest: evidenceDigest('urn:sage:compatibility-boundary.resource:v1:', [context.matterRef, context.revisionRef]),
      decisionDigest: evidenceDigest('urn:sage:compatibility-decision:v1:', [identityPolicy.decisionRef]),
      attemptId: `attempt:sage.${intent.requestId}`,
      issuedAt,
      targetProviderProvenanceDigest: evidenceDigest('urn:sage:compatibility-target-provenance:v1:', [
        bundle.snapshotId,
        requirement.requirementDigest,
      ]),
    }
    const resolved = resolveCompatibilityV2({
      evaluatedAt,
      currentRevision: {
        matterId: context.matterRef,
        revisionId: context.revisionRef,
        digest: revisionDigest,
      },
      targetSemantic,
      targetEvidence: {
        ...targetEvidenceBody,
        targetEvidenceDigest: computeTargetEvidenceDigestV2(targetEvidenceBody),
      },
      runtimeDescriptor: observation.descriptor,
      inventoryEvidence: observation.evidence,
      matrix: toCompatibilityMatrixV2ProviderResult(matrix),
    })

    if (resolved.outcome === 'equivalent') {
      return {
        state: 'allowed',
        value: {
          evaluationRef: urnDigest('urn:sage:compatibility-evaluation:v1:', [
            resolved.binding.matrixId,
            resolved.binding.matchedRuleId,
            resolved.binding.targetEvidenceDigest,
            resolved.binding.inventoryEvidenceDigest,
            resolved.binding.evaluatedAt,
          ]),
          outcome: 'equivalent',
        },
      }
    }
    if (resolved.outcome === 'requires-new-revision') return { state: 'denied' }
    return { state: 'unavailable' }
  }
}
