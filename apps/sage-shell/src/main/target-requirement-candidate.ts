/** T05 mid-authorities, first cut (ADR-0276): the publication-candidate line for the first
 *  session-prompt compatibility target.
 *
 *  The runtime half of the stable pair already exists (the WT-02C.2E descriptor producer emits a
 *  sealed descriptor with real component pins). The target half needs governance-owned data: an
 *  immutable requirement snapshot and the matrix rule that pairs its `targetSemanticDigest` with
 *  the observed `runtimeDescriptorDigest`. This module mechanically derives the CANDIDATE bytes
 *  for owner review; it decides nothing:
 *
 *  - the four component pins and the capabilities copy the observed descriptor verbatim
 *    (`CompatibilityComponentRequirementV2` and `RuntimeComponentDescriptorV2` are the same shape
 *    by construction — approving the candidate equals approving exactly what ships);
 *  - the protocol / launch / overlay policy digests come from the observed descriptor (product
 *    line constants, not matter-instance facts);
 *  - the permission / data-destination policy digests are computed over the caller-supplied
 *    requirement policy lists (domain-separated canonical JSON, order preserved);
 *  - the target semantic body is completed with the caller-supplied action requirements
 *    converted to their `ActionPolicy` shape (the revision must declare the same tuple at
 *    evaluation time — the resolver re-checks it).
 *
 *  The candidate carries NO owner-decision fields. Sealing happens only after the owner
 *  adjudicates: `sealCandidateTargetRequirement` applies the decision triple and runs the C2.2T
 *  kernel's own seal, which is the sole validation gate.
 */
import { createHash } from 'node:crypto'

import {
  computeTargetSemanticDigestV2,
  type CompatibilityTargetSemanticBodyV2,
  type CompatibilityTargetSemanticV2,
  type RuntimeDescriptorV2,
} from '../security/compatibility.js'
import {
  sealCompatibilityTargetRequirement,
  type CompatibilityTargetActionRequirementV1,
  type CompatibilityTargetPolicyRequirementV1,
  type CompatibilityTargetRequirementBodyV1,
  type CompatibilityTargetRequirementResultV1,
  type CompatibilityTargetRequirementV1,
} from '../security/compatibility-target-requirement.js'

export interface TargetRequirementProposalInput {
  readonly requirementId: string
  readonly requirementVersion: string
  readonly effectiveAt: string
  readonly expiresAt?: string
  readonly actionRequirements: readonly CompatibilityTargetActionRequirementV1[]
  readonly permissionRequirements: readonly CompatibilityTargetPolicyRequirementV1[]
  readonly dataBoundaryRequirements: readonly CompatibilityTargetPolicyRequirementV1[]
}

export interface ProposedMatrixRuleV1 {
  readonly ruleId: string
  /** The owner's proposed outcome; the publication step seals it into the matrix artifact. */
  readonly outcome: 'equivalent' | 'requires-new-revision'
  readonly reasonCode: string
  readonly reason: string
}

export interface TargetRequirementCandidateInput {
  readonly createdAt: string
  readonly requirement: TargetRequirementProposalInput
  /** The observed, sealed descriptor (WT-02C.2E producer output). */
  readonly descriptor: RuntimeDescriptorV2
  readonly proposedRule: ProposedMatrixRuleV1
}

export interface TargetRequirementCandidateV1 {
  readonly schemaVersion: 'sage.target-requirement-candidate.v1'
  readonly createdAt: string
  /** The generation of runtime facts this candidate was derived from (the other half of the
   *  stable pair); publication must re-observe and refuse if the descriptor digest has moved. */
  readonly observedRuntimeDescriptorDigest: string
  readonly requirement: Omit<CompatibilityTargetRequirementBodyV1, 'ownerDecision'>
  readonly targetSemantic: CompatibilityTargetSemanticV2
  readonly proposedMatrixRule: ProposedMatrixRuleV1 & {
    readonly targetSemanticDigest: string
    readonly runtimeDescriptorDigest: string
  }
}

export interface OwnerDecisionInput {
  readonly decisionId: string
  readonly ownerId: string
  readonly decidedAt: string
  readonly reason: string
}

/** Domain-separated digest over one requirement policy list (identity/version/digest triples in
 *  the order they were proposed — order is part of the declared boundary). */
function policyListDigest(domain: string, entries: readonly CompatibilityTargetPolicyRequirementV1[]): string {
  const canonical = JSON.stringify(entries.map((entry) => [entry.identity, entry.version, entry.digest]))
  return `sha256:${createHash('sha256').update(`${domain}\0${canonical}`, 'utf8').digest('hex')}`
}

export function buildTargetRequirementCandidate(input: TargetRequirementCandidateInput): TargetRequirementCandidateV1 {
  const { descriptor, requirement } = input
  const provider = { ...descriptor.provider }
  const model = { ...descriptor.model }
  const agent = { ...descriptor.agent }
  const preset = { ...descriptor.preset }
  const capabilities = descriptor.capabilities.map((capability) => ({ ...capability }))

  const semanticBody: CompatibilityTargetSemanticBodyV2 = {
    schemaVersion: 'sage.compatibility-target-semantic.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    actionPolicies: requirement.actionRequirements.map((action) => ({
      actionScope: action.actionScope,
      effectClass: action.effectClass,
      requiresDecision: action.requiresDecision,
    })),
    permissionPolicyDigest: policyListDigest('urn:sage:target-requirement.permission-policy.v1:', requirement.permissionRequirements),
    dataDestinationPolicyDigest: policyListDigest('urn:sage:target-requirement.data-destination-policy.v1:', requirement.dataBoundaryRequirements),
    provider,
    model,
    agent,
    preset,
    capabilities,
    protocolContractDigest: descriptor.protocolContractDigest,
    launchPolicyDigest: descriptor.launchPolicyDigest,
    overlayPolicyDigest: descriptor.overlayPolicyDigest,
  }
  const targetSemantic: CompatibilityTargetSemanticV2 = {
    ...semanticBody,
    targetSemanticDigest: computeTargetSemanticDigestV2(semanticBody),
  }

  return {
    schemaVersion: 'sage.target-requirement-candidate.v1',
    createdAt: input.createdAt,
    observedRuntimeDescriptorDigest: descriptor.runtimeDescriptorDigest,
    requirement: {
      schemaVersion: 'sage.compatibility-target-requirement-entry.v1',
      canonicalizationVersion: 'sage.compatibility-target-requirement-canonical-json.v1',
      requirementId: requirement.requirementId,
      requirementVersion: requirement.requirementVersion,
      state: 'active',
      actionRequirements: requirement.actionRequirements.map((action) => ({ ...action })),
      permissionRequirements: requirement.permissionRequirements.map((entry) => ({ ...entry })),
      dataBoundaryRequirements: requirement.dataBoundaryRequirements.map((entry) => ({ ...entry })),
      provider,
      model,
      agent,
      preset,
      capabilities,
      effectiveAt: requirement.effectiveAt,
      ...(requirement.expiresAt === undefined ? {} : { expiresAt: requirement.expiresAt }),
    },
    targetSemantic,
    proposedMatrixRule: {
      ruleId: input.proposedRule.ruleId,
      outcome: input.proposedRule.outcome,
      reasonCode: input.proposedRule.reasonCode,
      reason: input.proposedRule.reason,
      targetSemanticDigest: targetSemantic.targetSemanticDigest,
      runtimeDescriptorDigest: descriptor.runtimeDescriptorDigest,
    },
  }
}

/** Apply the owner decision and seal through the C2.2T kernel. The kernel's own parse/digest
 *  checks are the validation gate; this function adds nothing and hides nothing. */
export function sealCandidateTargetRequirement(
  candidate: TargetRequirementCandidateV1,
  decision: OwnerDecisionInput,
): CompatibilityTargetRequirementResultV1<CompatibilityTargetRequirementV1> {
  return sealCompatibilityTargetRequirement({
    ...candidate.requirement,
    ownerDecision: {
      decisionId: decision.decisionId,
      ownerId: decision.ownerId,
      decidedAt: decision.decidedAt,
      reason: decision.reason,
    },
  })
}

export type TargetSemanticRebuild =
  | { readonly ok: true; readonly semantic: CompatibilityTargetSemanticV2 }
  | { readonly ok: false; readonly reason: string }

/** The requirement-half inverse of {@link buildTargetRequirementCandidate}: rebuild the target
 *  semantic face from a published requirement entry plus the OBSERVED descriptor's product-line
 *  policy digests. Publishing and resolving must agree byte for byte — the rebuilt digest is only
 *  admitted when it recomputes the exact value the matrix rule pairs (ADR-0284).
 *
 *  Fail-closed gap: a requirement whose capabilities are non-empty cannot be rebuilt, because the
 *  semantic capability face additionally carries registry/adapter digests that the C2.2T
 *  requirement entry does not publish (empty in the current first publication). */
export function computeTargetSemanticFromRequirement(
  requirement: CompatibilityTargetRequirementV1,
  descriptor: RuntimeDescriptorV2,
): TargetSemanticRebuild {
  if (requirement.capabilities.length > 0) {
    return {
      ok: false,
      reason: 'published requirement declares capabilities; the semantic face needs registry/adapter digests this carrier does not publish',
    }
  }
  const semanticBody: CompatibilityTargetSemanticBodyV2 = {
    schemaVersion: 'sage.compatibility-target-semantic.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    actionPolicies: requirement.actionRequirements.map((action) => ({
      actionScope: action.actionScope,
      effectClass: action.effectClass,
      requiresDecision: action.requiresDecision,
    })),
    permissionPolicyDigest: policyListDigest('urn:sage:target-requirement.permission-policy.v1:', requirement.permissionRequirements),
    dataDestinationPolicyDigest: policyListDigest('urn:sage:target-requirement.data-destination-policy.v1:', requirement.dataBoundaryRequirements),
    provider: { ...requirement.provider },
    model: { ...requirement.model },
    agent: { ...requirement.agent },
    preset: { ...requirement.preset },
    capabilities: [],
    protocolContractDigest: descriptor.protocolContractDigest,
    launchPolicyDigest: descriptor.launchPolicyDigest,
    overlayPolicyDigest: descriptor.overlayPolicyDigest,
  }
  return {
    ok: true,
    semantic: { ...semanticBody, targetSemanticDigest: computeTargetSemanticDigestV2(semanticBody) },
  }
}
