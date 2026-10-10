/** T05 mid-authorities (ADR-0278): the first session-prompt target publication.
 *
 *  Two owner rulings (2026-10-10) give this module its content:
 *  - the model face is pinned STRICTLY to the re-observed exact row at publication time; any
 *    model or behavior-configuration change is a matrix-key event and requires a republish
 *    before session.prompt can resolve again (the schema carries no ranges — exact or nothing);
 *  - the two policy documents ship as MINIMAL canonical statements (permission: the instance
 *    operator may invoke session.prompt; data boundary: message text may egress to the
 *    user-configured model provider while artifacts and records stay in the local Sage root).
 *
 *  The descriptor is an INPUT: publication must re-observe the runtime line (ADR-0276 D3) and
 *  pass the freshly derived descriptor here. The module then composes the sealed requirement
 *  through the candidate line and the C2.2T kernel — it decides nothing by itself.
 */
import { createHash } from 'node:crypto'

import {
  type CompatibilityTargetPolicyRequirementV1,
  type CompatibilityTargetRequirementResultV1,
  type CompatibilityTargetRequirementV1,
} from '../security/compatibility-target-requirement.js'
import type { RuntimeDescriptorV2 } from '../security/compatibility.js'
import {
  buildTargetRequirementCandidate,
  sealCandidateTargetRequirement,
  type OwnerDecisionInput,
  type ProposedMatrixRuleV1,
  type TargetRequirementCandidateV1,
} from './target-requirement-candidate.js'

export interface TargetPolicyDocumentV1 {
  readonly schemaVersion: 'sage.target-policy-document.v1'
  readonly kind: 'permission' | 'data-boundary'
  readonly identity: string
  readonly version: string
  /** The canonical statement; the digest below binds exactly these bytes. */
  readonly statement: string
}

export interface SealedTargetPolicyDocumentV1 extends TargetPolicyDocumentV1 {
  readonly documentDigest: string
}

/** Fixed key order; the digest namespace is the schema version itself. */
export function canonicalTargetPolicyDocument(document: TargetPolicyDocumentV1): string {
  return JSON.stringify({
    schemaVersion: document.schemaVersion,
    kind: document.kind,
    identity: document.identity,
    version: document.version,
    statement: document.statement,
  })
}

export function computeTargetPolicyDocumentDigest(document: TargetPolicyDocumentV1): string {
  return `sha256:${createHash('sha256')
    .update(`urn:sage:target-policy-document:v1:\0${canonicalTargetPolicyDocument(document)}`, 'utf8')
    .digest('hex')}`
}

export function sealTargetPolicyDocument(document: TargetPolicyDocumentV1): SealedTargetPolicyDocumentV1 {
  return Object.freeze({ ...document, documentDigest: computeTargetPolicyDocumentDigest(document) })
}

/** The first two published policy documents — the owner's minimal statements, verbatim. */
export const SESSION_PROMPT_PERMISSION_POLICY: SealedTargetPolicyDocumentV1 = sealTargetPolicyDocument({
  schemaVersion: 'sage.target-policy-document.v1',
  kind: 'permission',
  identity: 'permission:sage.session-prompt',
  version: '1.0.0',
  statement: '实例操作员（role:owner）可发起 session.prompt。',
})

export const MODEL_EGRESS_DATA_BOUNDARY_POLICY: SealedTargetPolicyDocumentV1 = sealTargetPolicyDocument({
  schemaVersion: 'sage.target-policy-document.v1',
  kind: 'data-boundary',
  identity: 'data-boundary:sage.model-egress',
  version: '1.0.0',
  statement: '消息文本可发送至用户配置的模型提供方；产物与记录留存本机 Sage 数据根。',
})

function policyRef(document: SealedTargetPolicyDocumentV1): CompatibilityTargetPolicyRequirementV1 {
  return { identity: document.identity, version: document.version, digest: document.documentDigest }
}

/** The owner's first-publication plan (ruling of 2026-10-10); the decision timestamp precedes
 *  the effective window by construction (the kernel enforces decision <= effectiveAt). */
export const SESSION_PROMPT_PUBLICATION_PLAN = Object.freeze({
  requirementId: 'requirement:sage-session-prompt',
  requirementVersion: '1.0.0',
  effectiveAt: '2026-10-11T00:00:00Z',
  expiresAt: '2027-10-11T00:00:00Z',
  actionRequirements: Object.freeze([
    Object.freeze({ actionScope: 'session.prompt', effectClass: 'external-write' as const, requiresDecision: false }),
  ]),
})

export const SESSION_PROMPT_PUBLICATION_DECISION: OwnerDecisionInput = Object.freeze({
  decisionId: 'decision:sage-t05-first-session-prompt',
  ownerId: 'owner:sage-product',
  decidedAt: '2026-10-10T09:00:00Z',
  reason: '用户裁决：模型面严格精确钉（发布时重观测）；策略文档按最小声明发布。',
})

export const SESSION_PROMPT_PROPOSED_RULE: ProposedMatrixRuleV1 = Object.freeze({
  ruleId: 'rule:sage-session-prompt-v1',
  outcome: 'equivalent' as const,
  reasonCode: 'owner-approved-exact-pair',
  reason: '用户裁决的首发精确稳定对。',
})

export interface SessionPromptPublication {
  readonly candidate: TargetRequirementCandidateV1
  /** The kernel's own seal result: the publication step checks `ok` and refuses otherwise. */
  readonly requirement: CompatibilityTargetRequirementResultV1<CompatibilityTargetRequirementV1>
}

/** Compose the first publication from a freshly re-observed descriptor. */
export function buildSessionPromptPublication(descriptor: RuntimeDescriptorV2): SessionPromptPublication {
  const candidate = buildTargetRequirementCandidate({
    createdAt: SESSION_PROMPT_PUBLICATION_DECISION.decidedAt,
    requirement: {
      requirementId: SESSION_PROMPT_PUBLICATION_PLAN.requirementId,
      requirementVersion: SESSION_PROMPT_PUBLICATION_PLAN.requirementVersion,
      effectiveAt: SESSION_PROMPT_PUBLICATION_PLAN.effectiveAt,
      expiresAt: SESSION_PROMPT_PUBLICATION_PLAN.expiresAt,
      actionRequirements: SESSION_PROMPT_PUBLICATION_PLAN.actionRequirements,
      permissionRequirements: [policyRef(SESSION_PROMPT_PERMISSION_POLICY)],
      dataBoundaryRequirements: [policyRef(MODEL_EGRESS_DATA_BOUNDARY_POLICY)],
    },
    descriptor,
    proposedRule: SESSION_PROMPT_PROPOSED_RULE,
  })
  return { candidate, requirement: sealCandidateTargetRequirement(candidate, SESSION_PROMPT_PUBLICATION_DECISION) }
}
