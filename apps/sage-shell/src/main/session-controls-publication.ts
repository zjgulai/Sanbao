/** B batch stage 2 (ADR-0317 D4): the session-control publication set — the governance seal that
 *  lets the six session-control operations (approval answer/withdraw, pending edit/remove, queue
 *  edit/remove) resolve end-to-end through the C2.2T chain.
 *
 *  Everything here is mechanical composition of caller-supplied inputs:
 *  - the owner decision texts are the user-approved statements of 2026-10-11 (recorded verbatim
 *    below — never paraphrased);
 *  - the runtime half is the recorded re-observation (the runner passes its descriptor); the new
 *    capability face is derived from the extended registry entry through the SAME derivation
 *    module the runtime inventory producer and the registry admission step share (ADR-0286), so
 *    the next boot's observation reproduces these bytes by construction;
 *  - the adapter mappings / contract digests are governance constants of THIS module, canonical
 *    JSON with the literal key order written here; the registry entry approval carries the
 *    user's 2026-10-11 ruling on the first-party self-proving route (ADR-0283 D4 precedent).
 *
 *  The module decides nothing: it composes candidates and lets the C2.2T / C2D / C2 matrix
 *  kernels seal and reject.
 */
import { createHash } from 'node:crypto'

import { computeRuntimeDescriptorDigestV2, type RuntimeCapabilityDescriptorV2, type RuntimeDescriptorV2 } from '../security/compatibility.js'
import {
  canonicalizeCompatibilityMatrixV2,
  computeCompatibilityMatrixIdV2,
  type CompatibilityMatrixV2,
} from '../security/compatibility.js'
import {
  sealCompatibilityMatrixBundleV2,
  type CompatibilityMatrixBundleV2,
} from '../security/compatibility-matrix-provider.js'
import {
  sealCompatibilityTargetRequirementSnapshot,
  type CompatibilityTargetOwnerDecisionV1,
  type CompatibilityTargetRequirementSnapshotV1,
} from '../security/compatibility-target-requirement.js'
import {
  capabilityAdapterMappingDigest,
  capabilityOperationsProjection,
  capabilityRegistryDescriptorDigest,
  contentDigestOf,
  sha256ContentDigest,
} from './capability-entry-derivation.js'
import {
  sealCapabilityRegistrySnapshot,
  type CapabilityRegistryEntryBodyV1,
  type CapabilityRegistrySnapshotV1,
} from '../security/capability-registry.js'
import {
  MODEL_EGRESS_DATA_BOUNDARY_POLICY,
  sealTargetPolicyDocument,
  type SealedTargetPolicyDocumentV1,
} from './session-prompt-publication.js'
import {
  buildTargetRequirementCandidate,
  sealCandidateTargetRequirement,
  type OwnerDecisionInput,
  type ProposedMatrixRuleV1,
  type TargetRequirementCandidateV1,
} from './target-requirement-candidate.js'

/** The governance act instant (single constant — every new sealed byte binds it). */
export const SESSION_CONTROLS_DECIDED_AT = '2026-10-11T12:00:00Z'

/** Owner decisions of 2026-10-11 — the user-approved statements, verbatim (never paraphrased). */
export const SESSION_APPROVAL_PERMISSION_POLICY: SealedTargetPolicyDocumentV1 = sealTargetPolicyDocument({
  schemaVersion: 'sage.target-policy-document.v1',
  kind: 'permission',
  identity: 'permission:sage.session-approval',
  version: '1.0.0',
  statement: '实例操作员（role:owner）可应答或撤回外部授权等待；应答即放行一次外部效应的决策。',
})

export const SESSION_PENDING_PERMISSION_POLICY: SealedTargetPolicyDocumentV1 = sealTargetPolicyDocument({
  schemaVersion: 'sage.target-policy-document.v1',
  kind: 'permission',
  identity: 'permission:sage.session-pending',
  version: '1.0.0',
  statement: '实例操作员可编辑或移除待继续输入（仅 Sage 本机记录，不外发）。',
})

export const SESSION_QUEUE_PERMISSION_POLICY: SealedTargetPolicyDocumentV1 = sealTargetPolicyDocument({
  schemaVersion: 'sage.target-policy-document.v1',
  kind: 'permission',
  identity: 'permission:sage.session-queue',
  version: '1.0.0',
  statement: '实例操作员可编辑或移除尚未处理的队列条目（修改内容将随队列发送至模型）。',
})

const SESSION_CONTROLS_PUBLICATION_DECISION: CompatibilityTargetOwnerDecisionV1 = Object.freeze({
  decisionId: 'decision:sage-session-controls-publication',
  ownerId: 'owner:sage-product',
  decidedAt: SESSION_CONTROLS_DECIDED_AT,
  reason: '用户核准（2026-10-11）：会话控制六操作随批入册；registry 走 first-party 自证等价路线（ADR-0283 D4 先例）；三条 permission 声明逐字采用所请文本。',
})

const SESSION_CONTROLS_REGISTRY_APPROVAL = Object.freeze({
  decisionId: 'decision:sage.session-controls.registry',
  ownerId: 'owner:sage.product',
  decidedAt: SESSION_CONTROLS_DECIDED_AT,
  reason: '用户核准（2026-10-11）：六操作以 first-party 自证等价路线入册（adapter=approval relay / pending store / queue adapter）。',
})

/** Registry boundary tag for operations that keep their content on this machine. */
export const LOCAL_ONLY_BOUNDARY = 'sage.local-only'

/** Canonical JSON with the literal key order written at each call site (governance constants). */
function canonicalBytes(value: unknown): string {
  return JSON.stringify(value)
}

function digestWithDomain(domain: string, value: string): string {
  return `sha256:${createHash('sha256').update(`${domain}\0${value}`, 'utf8').digest('hex')}`
}

/** One adapter mapping declaration; its digest binds exactly these fields in this key order. */
function adapterMappingDigest(declaration: {
  readonly identity: string
  readonly version: string
  readonly operationId: string
  readonly effectClass: string
  readonly dataBoundary: string
  readonly inputContractDigest: string
  readonly outputContractDigest: string
}): string {
  return digestWithDomain('urn:sage:adapter-mapping:v1:', canonicalBytes(declaration))
}

interface OperationDeclaration {
  readonly operationId: string
  readonly adapter: { readonly identity: string, readonly version: string }
  readonly effectClass: 'external-write' | 'local-write'
  readonly dataBoundary: string
  /** Canonical request shape (governance constant; key order literal). */
  readonly input: Record<string, string>
  /** Canonical response shape (governance constant; key order literal). */
  readonly output: Record<string, string>
}

const APPROVAL_RELAY = { identity: 'adapter:sage.approval-relay', version: '1.0.0' } as const
const PENDING_INPUTS = { identity: 'adapter:sage.pending-inputs', version: '1.0.0' } as const
const SESSION_QUEUE = { identity: 'adapter:sage.session-queue', version: '1.0.0' } as const

/** The six operations, in alphabetical order (deterministic entry bytes). */
export const SESSION_CONTROL_OPERATIONS: readonly OperationDeclaration[] = Object.freeze([
  Object.freeze({
    operationId: 'session.approval.answer', adapter: APPROVAL_RELAY, effectClass: 'external-write', dataBoundary: LOCAL_ONLY_BOUNDARY,
    input: { matterRef: 'string', requestId: 'string', outcome: 'allowed-once|rejected' },
    output: { state: 'recorded|refused', code: 'string|null' },
  }),
  Object.freeze({
    operationId: 'session.approval.withdraw', adapter: APPROVAL_RELAY, effectClass: 'external-write', dataBoundary: LOCAL_ONLY_BOUNDARY,
    input: { matterRef: 'string', requestId: 'string' },
    output: { state: 'recorded|refused', code: 'string|null' },
  }),
  Object.freeze({
    operationId: 'session.pending.edit', adapter: PENDING_INPUTS, effectClass: 'local-write', dataBoundary: LOCAL_ONLY_BOUNDARY,
    input: { action: 'edit', itemId: 'string', text: 'string' },
    output: { state: 'ok|refused', code: 'string|null' },
  }),
  Object.freeze({
    operationId: 'session.pending.remove', adapter: PENDING_INPUTS, effectClass: 'local-write', dataBoundary: LOCAL_ONLY_BOUNDARY,
    input: { action: 'remove', itemId: 'string' },
    output: { state: 'ok|refused', code: 'string|null' },
  }),
  Object.freeze({
    operationId: 'session.queue.edit', adapter: SESSION_QUEUE, effectClass: 'external-write', dataBoundary: 'sage.model-egress',
    input: { action: 'edit', itemId: 'string', text: 'string' },
    output: { state: 'ok|refused', code: 'string|null' },
  }),
  Object.freeze({
    operationId: 'session.queue.remove', adapter: SESSION_QUEUE, effectClass: 'external-write', dataBoundary: 'sage.model-egress',
    input: { action: 'remove', itemId: 'string' },
    output: { state: 'ok|refused', code: 'string|null' },
  }),
])

function registryOperationOf(declaration: OperationDeclaration): CapabilityRegistryEntryBodyV1['operations'][number] {
  const inputContractDigest = digestWithDomain('urn:sage:input-contract:v1:', canonicalBytes(declaration.input))
  const outputContractDigest = digestWithDomain('urn:sage:output-contract:v1:', canonicalBytes(declaration.output))
  return Object.freeze({
    operationId: declaration.operationId,
    adapter: Object.freeze({
      identity: declaration.adapter.identity,
      version: declaration.adapter.version,
      digest: adapterMappingDigest({
        identity: declaration.adapter.identity,
        version: declaration.adapter.version,
        operationId: declaration.operationId,
        effectClass: declaration.effectClass,
        dataBoundary: declaration.dataBoundary,
        inputContractDigest,
        outputContractDigest,
      }),
    }),
    effectClass: declaration.effectClass,
    dataBoundary: declaration.dataBoundary,
    inputContractDigest,
    outputContractDigest,
    preflight: 'read-only',
    revokeBehavior: 'deny-new-actions',
  })
}

/** The capability face as the runtime inventory producer derives it (one forma, both consumers). */
export function capabilityFaceOf(entry: CapabilityRegistryEntryBodyV1): RuntimeCapabilityDescriptorV2 {
  const source = entry.descriptor.source
  const asContentDigest = (value: string): string => (source === 'first-party' ? value : contentDigestOf(value))
  return Object.freeze({
    identity: entry.capabilityId,
    version: entry.capabilityVersion,
    artifactDigest: asContentDigest(entry.descriptor.artifactSubjectDigest),
    contractDigest: asContentDigest(entry.descriptor.toolContractDigest),
    behaviorConfigurationDigest: sha256ContentDigest(JSON.stringify({
      launchContractDigest: asContentDigest(entry.descriptor.launchContractDigest),
      operations: capabilityOperationsProjection(entry),
    })),
    registryDescriptorDigest: capabilityRegistryDescriptorDigest(entry),
    adapterMappingDigest: capabilityAdapterMappingDigest(entry),
  })
}

export interface SessionControlsBase {
  readonly registrySnapshot: CapabilityRegistrySnapshotV1
  readonly requirementSnapshot: CompatibilityTargetRequirementSnapshotV1
  readonly matrixBundle: CompatibilityMatrixBundleV2
}

export interface SessionControlsPublicationSet {
  readonly registry: CapabilityRegistrySnapshotV1
  readonly requirement: CompatibilityTargetRequirementSnapshotV1
  readonly matrixBundle: CompatibilityMatrixBundleV2
  readonly capability: RuntimeCapabilityDescriptorV2
  /** The rebuilt session-prompt candidate (for the base round-trip self-check). */
  readonly sessionPromptCandidate: TargetRequirementCandidateV1
}

const SCOPE_PLANS = [
  {
    scope: 'session.approval',
    requirementId: 'requirement:sage-session-approval',
    permissions: [SESSION_APPROVAL_PERMISSION_POLICY],
    dataBoundaries: [] as readonly SealedTargetPolicyDocumentV1[],
    // One tuple per scope (the kernel bans duplicates): approval declares the conservative
    // requiresDecision:true for the whole scope — the per-operation nuance (withdraw without a
    // decision) stays in ACTION_AUTHORITY_TABLE, which the identity step evaluates per op.
    actions: [
      { actionScope: 'session.approval', effectClass: 'external-write' as const, requiresDecision: true },
    ],
    rule: { ruleId: 'rule:sage-session-approval-v1', outcome: 'equivalent' as const, reasonCode: 'owner-approved-exact-pair', reason: '用户裁决（2026-10-11）：授权等待应答/撤回的精确稳定对。' },
    decisionReason: '用户核准（2026-10-11）：授权等待应答/撤回入册（应答=放行决策；撤回=关闭等待）。',
  },
  {
    scope: 'session.pending',
    requirementId: 'requirement:sage-session-pending',
    permissions: [SESSION_PENDING_PERMISSION_POLICY],
    dataBoundaries: [] as readonly SealedTargetPolicyDocumentV1[],
    actions: [
      { actionScope: 'session.pending', effectClass: 'local-write' as const, requiresDecision: false },
    ],
    rule: { ruleId: 'rule:sage-session-pending-v1', outcome: 'equivalent' as const, reasonCode: 'owner-approved-exact-pair', reason: '用户裁决（2026-10-11）：待继续输入编辑/移除的精确稳定对（本机记录）。' },
    decisionReason: '用户核准（2026-10-11）：待继续输入编辑/移除入册（仅 Sage 本机记录）。',
  },
  {
    scope: 'session.queue',
    requirementId: 'requirement:sage-session-queue',
    permissions: [SESSION_QUEUE_PERMISSION_POLICY],
    dataBoundaries: [MODEL_EGRESS_DATA_BOUNDARY_POLICY] as readonly SealedTargetPolicyDocumentV1[],
    actions: [
      { actionScope: 'session.queue', effectClass: 'external-write' as const, requiresDecision: false },
    ],
    rule: { ruleId: 'rule:sage-session-queue-v1', outcome: 'equivalent' as const, reasonCode: 'owner-approved-exact-pair', reason: '用户裁决（2026-10-11）：队列条目编辑/移除的精确稳定对（内容随队列外发）。' },
    decisionReason: '用户核准（2026-10-11）：队列条目编辑/移除入册（修改内容将随队列发送至模型）。',
  },
] as const

function proposeRule(rule: ProposedMatrixRuleV1): ProposedMatrixRuleV1 {
  return Object.freeze({ ...rule })
}

export function buildSessionControlsPublicationSet(input: {
  readonly descriptor: RuntimeDescriptorV2
  readonly base: SessionControlsBase
}): SessionControlsPublicationSet {
  const { descriptor, base } = input

  // 1) The extended registry snapshot (one entry; six operations appended; one new approval).
  const baseEntry = base.registrySnapshot.entries[0]
  if (baseEntry === undefined || base.registrySnapshot.entries.length !== 1) {
    throw new TypeError('the base registry publication must carry exactly the one shipped entry')
  }
  const extendedEntry: CapabilityRegistryEntryBodyV1 = Object.freeze({
    ...baseEntry,
    operations: Object.freeze(
      [...baseEntry.operations.map((operation) => ({ ...operation })), ...SESSION_CONTROL_OPERATIONS.map(registryOperationOf)]
        .sort((left, right) => (left.operationId < right.operationId ? -1 : left.operationId > right.operationId ? 1 : 0)),
    ),
    approvals: Object.freeze([...baseEntry.approvals.map((approval) => ({ ...approval })), SESSION_CONTROLS_REGISTRY_APPROVAL]),
  })
  const registrySealed = sealCapabilityRegistrySnapshot({
    schemaVersion: base.registrySnapshot.schemaVersion,
    canonicalizationVersion: base.registrySnapshot.canonicalizationVersion,
    createdAt: SESSION_CONTROLS_DECIDED_AT,
    entries: [extendedEntry],
    supersedesSnapshotId: base.registrySnapshot.snapshotId,
  })
  if (!registrySealed.ok) throw new TypeError(`registry re-seal refused: ${registrySealed.code}: ${registrySealed.reason}`)
  const registry = registrySealed.value
  const capability = capabilityFaceOf(extendedEntry)

  // 2) The descriptor with the freshly derived capability face — and its digest recomputed over
  //    the changed body (the rules must pair the digest the NEXT boot will observe; carrying the
  //    old digest field would make every new-scope rule unresolvable at evaluation time).
  const { runtimeDescriptorDigest: _oldDigest, ...descriptorBody } = descriptor
  const nextBody = { ...descriptorBody, capabilities: [capability] }
  const descriptorWithFace: RuntimeDescriptorV2 = {
    ...nextBody,
    runtimeDescriptorDigest: computeRuntimeDescriptorDigestV2(nextBody),
  }

  // 3) The session-prompt entry, rebuilt verbatim except the capability face (registry grew).
  const baseSessionPrompt = base.requirementSnapshot.entries.find((entry) => entry.requirementId === 'requirement:sage-session-prompt')
  if (baseSessionPrompt === undefined) throw new TypeError('the base requirement publication must carry the session-prompt entry')
  const sessionPromptCandidate = buildTargetRequirementCandidate({
    createdAt: baseSessionPrompt.ownerDecision.decidedAt,
    requirement: {
      requirementId: baseSessionPrompt.requirementId,
      requirementVersion: baseSessionPrompt.requirementVersion,
      effectiveAt: baseSessionPrompt.effectiveAt,
      ...(baseSessionPrompt.expiresAt === undefined ? {} : { expiresAt: baseSessionPrompt.expiresAt }),
      actionRequirements: baseSessionPrompt.actionRequirements.map((action) => ({ ...action })),
      permissionRequirements: baseSessionPrompt.permissionRequirements.map((entry) => ({ ...entry })),
      dataBoundaryRequirements: baseSessionPrompt.dataBoundaryRequirements.map((entry) => ({ ...entry })),
    },
    descriptor: descriptorWithFace,
    proposedRule: proposeRule({
      ruleId: 'rule:sage-session-prompt-v1',
      outcome: 'equivalent',
      reasonCode: 'owner-approved-exact-pair',
      reason: '用户裁决的首发精确稳定对。',
    }),
  })
  const sessionPromptSealed = sealCandidateTargetRequirement(sessionPromptCandidate, {
    decisionId: baseSessionPrompt.ownerDecision.decisionId,
    ownerId: baseSessionPrompt.ownerDecision.ownerId,
    decidedAt: baseSessionPrompt.ownerDecision.decidedAt,
    reason: baseSessionPrompt.ownerDecision.reason,
  })
  if (!sessionPromptSealed.ok) throw new TypeError(`session-prompt re-seal refused: ${sessionPromptSealed.code}: ${sessionPromptSealed.reason}`)

  // 4) One entry per new scope, sealed with the user-approved decisions.
  const newEntries = SCOPE_PLANS.map((plan) => {
    const decision: OwnerDecisionInput = {
      decisionId: `decision:${plan.requirementId.slice('requirement:'.length)}`,
      ownerId: 'owner:sage-product',
      decidedAt: SESSION_CONTROLS_DECIDED_AT,
      reason: plan.decisionReason,
    }
    const candidate = buildTargetRequirementCandidate({
      createdAt: SESSION_CONTROLS_DECIDED_AT,
      requirement: {
        requirementId: plan.requirementId,
        requirementVersion: '1.0.0',
        effectiveAt: '2026-10-11T12:00:00Z',
        expiresAt: '2027-10-11T00:00:00Z',
        actionRequirements: plan.actions.map((action) => ({ ...action })),
        permissionRequirements: plan.permissions.map((document) => ({ identity: document.identity, version: document.version, digest: document.documentDigest })),
        dataBoundaryRequirements: plan.dataBoundaries.map((document) => ({ identity: document.identity, version: document.version, digest: document.documentDigest })),
      },
      descriptor: descriptorWithFace,
      proposedRule: proposeRule(plan.rule),
    })
    const sealed = sealCandidateTargetRequirement(candidate, decision)
    if (!sealed.ok) throw new TypeError(`${plan.requirementId} seal refused: ${sealed.code}: ${sealed.reason}`)
    return { candidate, sealed: sealed.value }
  })

  // 5) The requirement snapshot v2 (supersedes the shipped one). The snapshot body carries
  //    DIGEST-LESS entry bodies (the kernel re-derives each requirementDigest while sealing —
  //    passing the sealed entries verbatim is rejected as requirement-entry-invalid).
  const stripDigest = <T extends { readonly requirementDigest: string }>(entry: T): Omit<T, 'requirementDigest'> => {
    const { requirementDigest: _digest, ...body } = entry
    return body
  }
  const snapshotSealed = sealCompatibilityTargetRequirementSnapshot({
    schemaVersion: base.requirementSnapshot.schemaVersion,
    canonicalizationVersion: base.requirementSnapshot.canonicalizationVersion,
    createdAt: SESSION_CONTROLS_DECIDED_AT,
    publicationDecision: SESSION_CONTROLS_PUBLICATION_DECISION,
    entries: [sessionPromptSealed.value, ...newEntries.map((entry) => entry.sealed)].map(stripDigest),
    supersedesSnapshotId: base.requirementSnapshot.snapshotId,
  })
  if (!snapshotSealed.ok) throw new TypeError(`requirement snapshot re-seal refused: ${snapshotSealed.code}: ${snapshotSealed.reason}`)

  // 6) The matrix: rules = rebuilt session-prompt pair + one exact pair per new scope.
  const baseMatrix: CompatibilityMatrixV2 = JSON.parse(base.matrixBundle.artifacts[0]!.canonicalMatrix) as CompatibilityMatrixV2
  const ruleOf = (candidate: TargetRequirementCandidateV1): CompatibilityMatrixV2['rules'][number] => ({
    ruleId: candidate.proposedMatrixRule.ruleId,
    // targetSemantic.targetSemanticDigest is already the urn form (kernel convention); no re-wrap.
    targetSemanticDigest: candidate.targetSemantic.targetSemanticDigest,
    runtimeDescriptorDigest: candidate.proposedMatrixRule.runtimeDescriptorDigest,
    outcome: candidate.proposedMatrixRule.outcome,
    reasonCode: candidate.proposedMatrixRule.reasonCode,
    reason: candidate.proposedMatrixRule.reason,
  })
  const nextMatrix: CompatibilityMatrixV2 = {
    ...baseMatrix,
    rules: [
      ruleOf(sessionPromptCandidate),
      ...newEntries.map((entry) => ruleOf(entry.candidate)),
    ],
  }
  const canonicalMatrix = canonicalizeCompatibilityMatrixV2(nextMatrix)
  const bundleSealed = sealCompatibilityMatrixBundleV2({
    schemaVersion: base.matrixBundle.schemaVersion,
    canonicalizationVersion: base.matrixBundle.canonicalizationVersion,
    providerProvenanceDigest: base.matrixBundle.providerProvenanceDigest,
    artifacts: [{ matrixId: computeCompatibilityMatrixIdV2(canonicalMatrix), canonicalMatrix }],
  })
  if (!bundleSealed.ok) throw new TypeError(`matrix bundle re-seal refused: ${bundleSealed.code}: ${bundleSealed.reason}`)

  return {
    registry,
    requirement: snapshotSealed.value,
    matrixBundle: bundleSealed.value,
    capability,
    sessionPromptCandidate,
  }
}
