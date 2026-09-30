import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  normalizeExternalCapabilityToolContract,
  sealExternalCapabilityArtifactSubject,
  sealExternalCapabilityBridgeContract,
  sealExternalCapabilityDescriptor,
  sealExternalCapabilityLaunchContract,
  type ExternalCapabilityDescriptorV1,
} from '../src/security/external-capability.js'
import {
  canonicalizeExternalCapabilityEvidence,
  computeExternalCapabilityEvidenceDigest,
  createExternalCapabilityEvidenceKernel,
  parseExternalCapabilityEvidence,
  sealExternalCapabilityEvidence,
  verifyExternalCapabilityEvidenceFreshness,
  type ExternalCapabilityEvidenceBodyV1,
  type ExternalCapabilityEvidenceConnectionBindingV1,
  type ExternalCapabilityEvidenceHostBindingV1,
  type ExternalCapabilityEvidenceProvenanceV1,
} from '../src/security/external-capability-evidence.js'

const CONTENT_DIGEST = `sha256:${'1'.repeat(64)}`
const HOST: ExternalCapabilityEvidenceHostBindingV1 = {
  schemaVersion: 'sage.external-capability-host-binding.v1',
  canonicalizationVersion: 'sage.external-capability-evidence-canonical-json.v1',
  projectionDigest: `sha256:${'2'.repeat(64)}`,
  bootId: 'sage-host:11111111-1111-4111-8111-111111111111',
  runtimeGeneration: 3,
  activeGeneration: 'gen-3',
}
const CONNECTION: ExternalCapabilityEvidenceConnectionBindingV1 = {
  schemaVersion: 'sage.external-capability-connection-binding.v1',
  canonicalizationVersion: 'sage.external-capability-evidence-canonical-json.v1',
  connectionGeneration: 'connection:sage.shopify-read',
  bootId: HOST.bootId,
  runtimeGeneration: HOST.runtimeGeneration,
  activeGeneration: HOST.activeGeneration,
  negotiatedProtocolRevision: '2025-11-25',
  transportState: 'connected',
  discoveryState: 'complete',
  contractState: 'valid',
  toolsObservationDigest: `urn:sage:external-capability-tools-observation:sha256:${'3'.repeat(64)}`,
}

function fixtureDescriptor(): ExternalCapabilityDescriptorV1 {
  const artifact = sealExternalCapabilityArtifactSubject({
    schemaVersion: 'sage.external-capability-artifact-subject.v1',
    canonicalizationVersion: 'sage.external-capability-canonical-json.v1',
    transportKind: 'local-stdio',
    components: [
      { logicalRole: 'bridge', identity: '@deepseek-ai/dsh-mcp-client', version: '0.1.5-rc.2', artifactDigest: CONTENT_DIGEST },
      { logicalRole: 'sdk', identity: '@modelcontextprotocol/sdk', version: '1.30.0', artifactDigest: CONTENT_DIGEST },
      { logicalRole: 'launcher', identity: 'launcher:node', version: '24.8.0', artifactDigest: CONTENT_DIGEST },
      { logicalRole: 'interpreter', identity: 'runtime:node', version: '24.8.0', artifactDigest: CONTENT_DIGEST },
      { logicalRole: 'server-entrypoint', identity: 'server:sage-fixture', version: '2026-09-29', artifactDigest: CONTENT_DIGEST },
    ],
    dependencyClosureDigest: CONTENT_DIGEST,
    packageInputsDigest: CONTENT_DIGEST,
    lockInputsDigest: CONTENT_DIGEST,
    executablePolicyDigest: CONTENT_DIGEST,
    linkTopologyDigest: CONTENT_DIGEST,
  })
  const launch = sealExternalCapabilityLaunchContract({
    schemaVersion: 'sage.external-capability-launch-contract.v1',
    canonicalizationVersion: 'sage.external-capability-canonical-json.v1',
    transportKind: 'local-stdio',
    processMode: 'interpreter-entrypoint',
    argumentPolicyDigest: `urn:sage:external-capability-argument-policy:sha256:${'4'.repeat(64)}`,
    environmentPolicyDigest: `urn:sage:external-capability-environment-policy:sha256:${'5'.repeat(64)}`,
    workingDirectoryPolicy: 'artifact-root',
    protocolOverlayDigest: `urn:sage:external-capability-protocol-overlay:sha256:${'6'.repeat(64)}`,
  })
  const bridge = sealExternalCapabilityBridgeContract({
    schemaVersion: 'sage.external-capability-bridge-contract.v1',
    canonicalizationVersion: 'sage.external-capability-canonical-json.v1',
    identity: '@deepseek-ai/dsh-mcp-client',
    version: '0.1.5-rc.2',
    nameProjectionContract: 'dsh-mcp-client-public-tool-name.v1',
    descriptionProjectionContract: 'dsh-mcp-client-absent-description-to-empty.v1',
    outputSchemaEnforcementContract: 'dsh-mcp-client-supported-output-schema.v1',
    taskExecutionContract: 'dsh-mcp-client-required-task-only.v1',
  })
  const toolCandidate = {
    schemaVersion: 'sage.external-capability-tool-contract-candidate.v1' as const,
    canonicalizationVersion: 'sage.external-capability-canonical-json.v1' as const,
    negotiatedProtocolRevision: '2025-11-25' as const,
    bridgeContractDigest: bridge.bridgeContractDigest,
    tools: [{
      name: 'shopify.orders.read',
      description: 'Read orders for the current store.',
      inputSchema: { type: 'object', additionalProperties: false },
      outputSchema: { type: 'object' },
      execution: { taskSupport: 'optional' as const },
    }],
  }
  const normalized = normalizeExternalCapabilityToolContract(toolCandidate)
  if (!normalized.ok) throw new Error(`Fixture tool contract failed: ${normalized.code}`)
  return sealExternalCapabilityDescriptor({
    schemaVersion: 'sage.external-capability-descriptor.v1',
    canonicalizationVersion: 'sage.external-capability-canonical-json.v1',
    capabilityId: 'capability:sage.shopify-orders',
    capabilityVersion: '1.0.0',
    artifactSubject: artifact,
    launchContract: launch,
    bridgeContract: bridge,
    toolContract: normalized.value,
  })
}

function fixtureBody(): ExternalCapabilityEvidenceBodyV1 {
  const descriptor = fixtureDescriptor()
  const provenance: ExternalCapabilityEvidenceProvenanceV1 = {
    schemaVersion: 'sage.external-capability-provenance.v1',
    canonicalizationVersion: 'sage.external-capability-evidence-canonical-json.v1',
    source: 'c2c5',
    descriptorDigest: descriptor.descriptorDigest,
    artifactEvidenceDigest: `urn:sage:external-capability-artifact-evidence:sha256:${'7'.repeat(64)}`,
    launchEvidenceDigest: `urn:sage:external-capability-launch-evidence:sha256:${'8'.repeat(64)}`,
    toolEvidenceDigest: `urn:sage:external-capability-tool-evidence:sha256:${'9'.repeat(64)}`,
  }
  return {
    schemaVersion: 'sage.external-capability-evidence.v1',
    canonicalizationVersion: 'sage.external-capability-evidence-canonical-json.v1',
    descriptor,
    provenance,
    host: HOST,
    connection: CONNECTION,
    observedAt: '2026-09-29T03:00:00.000Z',
    expiresAt: '2026-09-29T03:00:30.000Z',
  }
}

function expectSuccess<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: string }): T {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`Expected success, received ${result.code}.`)
  return result.value
}

function expectFailure(result: { readonly ok: true } | { readonly ok: false; readonly code: string }, code: string): void {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`Expected ${code}.`)
  expect(result.code).toBe(code)
}

describe('WT-02C.2C.5 external capability evidence aggregate kernel', () => {
  it('seals, parses and canonicalizes caller-supplied evidence without mutating it', () => {
    const body = fixtureBody()
    const before = structuredClone(body)
    const sealed = expectSuccess(sealExternalCapabilityEvidence(body))
    expect(body).toEqual(before)
    expect(Object.isFrozen(sealed)).toBe(true)
    expect(Object.isFrozen(sealed.host)).toBe(true)
    expect(parseExternalCapabilityEvidence(sealed)).toEqual({ ok: true, value: sealed })
    expect(computeExternalCapabilityEvidenceDigest(body)).toBe(sealed.evidenceDigest)
    expect(canonicalizeExternalCapabilityEvidence(body)).toContain('sage.external-capability-evidence.v1')
  })

  it('fails closed on tampering, generation drift and incomplete connection state', () => {
    const sealed = expectSuccess(sealExternalCapabilityEvidence(fixtureBody()))
    const tampered = { ...sealed, observedAt: '2026-09-29T03:00:01.000Z' }
    expectFailure(parseExternalCapabilityEvidence(tampered), 'evidence-digest-mismatch')

    const drifted = structuredClone(fixtureBody())
    drifted.connection = { ...drifted.connection, runtimeGeneration: 4 }
    expectFailure(sealExternalCapabilityEvidence(drifted), 'evidence-generation-mismatch')

    const incomplete = structuredClone(fixtureBody())
    incomplete.connection = { ...incomplete.connection, discoveryState: 'partial' as never }
    expectFailure(sealExternalCapabilityEvidence(incomplete), 'evidence-connection-binding-invalid')
  })

  it('uses an explicit half-open freshness interval and rejects invalid provenance', () => {
    const sealed = expectSuccess(sealExternalCapabilityEvidence(fixtureBody()))
    expect(verifyExternalCapabilityEvidenceFreshness({ evidence: sealed, evaluatedAt: sealed.observedAt }).ok).toBe(true)
    expectFailure(
      verifyExternalCapabilityEvidenceFreshness({ evidence: sealed, evaluatedAt: sealed.expiresAt }),
      'evidence-expired',
    )
    expectFailure(
      verifyExternalCapabilityEvidenceFreshness({ evidence: sealed, evaluatedAt: '2026-09-29T02:59:59.999Z' }),
      'evidence-expired',
    )

    const invalid = structuredClone(fixtureBody())
    invalid.provenance = { ...invalid.provenance, source: 'candidate' as never }
    expectFailure(sealExternalCapabilityEvidence(invalid), 'evidence-provenance-missing')
  })

  it('keeps the public kernel pure and rejects hostile record shapes', () => {
    const kernel = createExternalCapabilityEvidenceKernel()
    expect(Object.isFrozen(kernel)).toBe(true)
    expectFailure(kernel.seal({ ...fixtureBody(), descriptor: [] }), 'evidence-descriptor-unverified')
    const source = readFileSync(resolve(import.meta.dirname, '../src/security/external-capability-evidence.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"]node:(fs|net|child_process|http|https)['"]/u)
    expect(source).not.toMatch(/\b(?:fetch|process|globalThis|new Date\s*\(|Date\.now\s*\()/u)
  })
})
