import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  MODEL_EGRESS_DATA_BOUNDARY_POLICY,
  SESSION_PROMPT_PERMISSION_POLICY,
  SESSION_PROMPT_PUBLICATION_DECISION,
  buildSessionPromptPublication,
  canonicalTargetPolicyDocument,
} from '../src/main/session-prompt-publication.js'
import {
  computeRuntimeDescriptorDigestV2,
  type RuntimeDescriptorBodyV2,
  type RuntimeDescriptorV2,
} from '../src/security/compatibility.js'
import { parseCompatibilityTargetRequirement } from '../src/security/compatibility-target-requirement.js'

/**
 * T05 mid-authorities (ADR-0278): the first session-prompt publication. The cases re-derive the
 * policy digests by hand, pin the sealed requirement against the owner's plan, prove the strict
 * exact model face (a changed model moves the semantic digest — republish, never a range), and
 * keep the composition deterministic.
 */

const inner = (char: string): string => `sha256:${char.repeat(64)}`

function descriptorFixture(): RuntimeDescriptorV2 {
  const body: RuntimeDescriptorBodyV2 = {
    schemaVersion: 'sage.runtime-descriptor.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    host: {
      identity: 'host:sage-desktop',
      version: '0.1.0',
      artifactDigest: inner('1'),
      contractDigest: inner('2'),
      behaviorConfigurationDigest: inner('3'),
    },
    harness: {
      identity: 'harness:sage-runtime',
      version: '0.2.0-rc.2',
      artifactDigest: inner('4'),
      contractDigest: inner('5'),
      behaviorConfigurationDigest: inner('6'),
    },
    provider: {
      identity: 'provider:sage-fixture',
      version: '0.2.0',
      artifactDigest: inner('7'),
      contractDigest: inner('8'),
      behaviorConfigurationDigest: inner('9'),
    },
    model: {
      identity: 'model:sage-fixture',
      version: '2026-09-01',
      artifactDigest: inner('a'),
      contractDigest: inner('b'),
      behaviorConfigurationDigest: inner('c'),
    },
    agent: {
      identity: 'agent:sage-catalog',
      version: '1.2.0',
      artifactDigest: inner('d'),
      contractDigest: inner('e'),
      behaviorConfigurationDigest: inner('f'),
    },
    preset: {
      identity: 'preset:sage-catalog',
      version: '3.0.0',
      artifactDigest: inner('1'),
      contractDigest: inner('2'),
      behaviorConfigurationDigest: inner('3'),
    },
    capabilities: [],
    protocolContractDigest: inner('4'),
    launchPolicyDigest: inner('5'),
    overlayPolicyDigest: inner('6'),
  }
  return { ...body, runtimeDescriptorDigest: computeRuntimeDescriptorDigestV2(body) }
}

describe('the first session-prompt publication (ADR-0278)', () => {
  it('binds each policy digest to its canonical statement, independently re-derived', () => {
    const permissionCanonical = '{"schemaVersion":"sage.target-policy-document.v1","kind":"permission","identity":"permission:sage.session-prompt","version":"1.0.0","statement":"实例操作员（role:owner）可发起 session.prompt。"}'
    expect(canonicalTargetPolicyDocument(SESSION_PROMPT_PERMISSION_POLICY)).toBe(permissionCanonical)
    expect(SESSION_PROMPT_PERMISSION_POLICY.documentDigest).toBe(`sha256:${createHash('sha256')
      .update(`urn:sage:target-policy-document:v1:\0${permissionCanonical}`, 'utf8')
      .digest('hex')}`)

    const boundaryCanonical = '{"schemaVersion":"sage.target-policy-document.v1","kind":"data-boundary","identity":"data-boundary:sage.model-egress","version":"1.0.0","statement":"消息文本可发送至用户配置的模型提供方；产物与记录留存本机 Sage 数据根。"}'
    expect(canonicalTargetPolicyDocument(MODEL_EGRESS_DATA_BOUNDARY_POLICY)).toBe(boundaryCanonical)
    expect(MODEL_EGRESS_DATA_BOUNDARY_POLICY.documentDigest).toBe(`sha256:${createHash('sha256')
      .update(`urn:sage:target-policy-document:v1:\0${boundaryCanonical}`, 'utf8')
      .digest('hex')}`)

    expect(Object.isFrozen(SESSION_PROMPT_PERMISSION_POLICY)).toBe(true)
    expect(Object.isFrozen(MODEL_EGRESS_DATA_BOUNDARY_POLICY)).toBe(true)
  })

  it('seals the first requirement against the owner plan and parses through the kernel', () => {
    const descriptor = descriptorFixture()
    const publication = buildSessionPromptPublication(descriptor)

    expect(publication.requirement.ok, JSON.stringify(publication.requirement)).toBe(true)
    if (!publication.requirement.ok) return
    const sealed = publication.requirement.value
    expect(sealed).toMatchObject({
      requirementId: 'requirement:sage-session-prompt',
      requirementVersion: '1.0.0',
      state: 'active',
      effectiveAt: '2026-10-11T00:00:00Z',
      expiresAt: '2027-10-11T00:00:00Z',
      actionRequirements: [{ actionScope: 'session.prompt', effectClass: 'external-write', requiresDecision: false }],
      permissionRequirements: [{
        identity: 'permission:sage.session-prompt',
        version: '1.0.0',
        digest: SESSION_PROMPT_PERMISSION_POLICY.documentDigest,
      }],
      dataBoundaryRequirements: [{
        identity: 'data-boundary:sage.model-egress',
        version: '1.0.0',
        digest: MODEL_EGRESS_DATA_BOUNDARY_POLICY.documentDigest,
      }],
      ownerDecision: {
        decisionId: SESSION_PROMPT_PUBLICATION_DECISION.decisionId,
        ownerId: SESSION_PROMPT_PUBLICATION_DECISION.ownerId,
        decidedAt: SESSION_PROMPT_PUBLICATION_DECISION.decidedAt,
      },
    })
    // The strict exact model face: the pins ARE the observed row.
    expect(sealed.model).toEqual(descriptor.model)
    expect(sealed.provider).toEqual(descriptor.provider)

    const reparsed = parseCompatibilityTargetRequirement(sealed)
    expect(reparsed.ok).toBe(true)
    if (!reparsed.ok) return
    expect(reparsed.value).toEqual(sealed)

    // Deterministic: the same descriptor publishes the same bytes and the same pair half.
    const again = buildSessionPromptPublication(descriptor)
    if (!again.requirement.ok) throw new Error('expected the sealed requirement')
    expect(again.requirement.value).toEqual(sealed)
    expect(again.candidate.targetSemantic.targetSemanticDigest).toBe(publication.candidate.targetSemantic.targetSemanticDigest)
    expect(again.candidate.proposedMatrixRule.runtimeDescriptorDigest).toBe(descriptor.runtimeDescriptorDigest)
  })

  it('moves the semantic digest when the model face moves: republish, never a range', () => {
    const descriptor = descriptorFixture()
    const publication = buildSessionPromptPublication(descriptor)

    const { runtimeDescriptorDigest: _current, ...body } = descriptor
    const movedBody = { ...body, model: { ...body.model, behaviorConfigurationDigest: inner('d') } }
    const moved: RuntimeDescriptorV2 = { ...movedBody, runtimeDescriptorDigest: computeRuntimeDescriptorDigestV2(movedBody) }
    const movedPublication = buildSessionPromptPublication(moved)

    expect(movedPublication.candidate.targetSemantic.targetSemanticDigest)
      .not.toBe(publication.candidate.targetSemantic.targetSemanticDigest)
    expect(movedPublication.candidate.proposedMatrixRule.runtimeDescriptorDigest)
      .not.toBe(publication.candidate.proposedMatrixRule.runtimeDescriptorDigest)
  })
})
