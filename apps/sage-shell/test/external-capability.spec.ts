import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  canonicalizeExternalCapabilityArtifactSubject,
  canonicalizeExternalCapabilityBridgeContract,
  canonicalizeExternalCapabilityDescriptor,
  canonicalizeExternalCapabilityLaunchContract,
  canonicalizeExternalCapabilityToolContract,
  computeExternalCapabilityArtifactSubjectDigest,
  computeExternalCapabilityBridgeContractDigest,
  computeExternalCapabilityDescriptorDigest,
  computeExternalCapabilityLaunchContractDigest,
  computeExternalCapabilityToolContractDigest,
  normalizeExternalCapabilityToolContract,
  parseExternalCapabilityDescriptor,
  sealExternalCapabilityArtifactSubject,
  sealExternalCapabilityBridgeContract,
  sealExternalCapabilityDescriptor,
  sealExternalCapabilityLaunchContract,
  type ExternalCapabilityArtifactSubjectBodyV1,
  type ExternalCapabilityArtifactSubjectV1,
  type ExternalCapabilityBridgeContractBodyV1,
  type ExternalCapabilityBridgeContractV1,
  type ExternalCapabilityDescriptorBodyV1,
  type ExternalCapabilityDescriptorV1,
  type ExternalCapabilityKernelFailureCode,
  type ExternalCapabilityKernelResult,
  type ExternalCapabilityLaunchContractBodyV1,
  type ExternalCapabilityLaunchContractV1,
  type ExternalCapabilityToolContractBodyV1,
  type ExternalCapabilityToolContractCandidateV1,
  type ExternalCapabilityToolContractV1,
} from '../src/security/external-capability.js'

const CONTENT_DIGESTS = {
  bridge: `sha256:${'1'.repeat(64)}`,
  sdk: `sha256:${'2'.repeat(64)}`,
  launcher: `sha256:${'3'.repeat(64)}`,
  interpreter: `sha256:${'4'.repeat(64)}`,
  server: `sha256:${'5'.repeat(64)}`,
  dependencies: `sha256:${'6'.repeat(64)}`,
  packageInputs: `sha256:${'7'.repeat(64)}`,
  lockInputs: `sha256:${'8'.repeat(64)}`,
  executablePolicy: `sha256:${'9'.repeat(64)}`,
  linkTopology: `sha256:${'a'.repeat(64)}`,
  argumentPolicy:
    `urn:sage:external-capability-argument-policy:sha256:${'b'.repeat(64)}`,
  environmentPolicy:
    `urn:sage:external-capability-environment-policy:sha256:${'c'.repeat(64)}`,
  protocolOverlay:
    `urn:sage:external-capability-protocol-overlay:sha256:${'d'.repeat(64)}`,
} as const

const GOLDEN_ARTIFACT_DIGEST =
  'urn:sage:external-capability-artifact:sha256:4a696dd08505fdc84ea4efeb0ed827c075f076fc7a5597436c7fc8105962a827'
const GOLDEN_LAUNCH_DIGEST =
  'urn:sage:external-capability-launch:sha256:3a8aeb8fae5d0ccdc3eeaa2947d452e58fc7fbcabb13d73da2f6642c2146ec04'
const GOLDEN_BRIDGE_DIGEST =
  'urn:sage:external-capability-bridge-contract:sha256:c6fec6bb02d6fb74f572ac90b8874231a72d4172b82db801f4793e7763771a4f'
const GOLDEN_TOOL_DIGEST =
  'urn:sage:external-capability-tool-contract:sha256:78e47fafbecba7ade7b2df7f46bf40adc4f49b435b2b7518ab661974e91a7589'
const GOLDEN_DESCRIPTOR_DIGEST =
  'urn:sage:external-capability-descriptor:sha256:6d4cdbed9074c07c105d0f484c3efacfdb3d4b5658f365cb2ec6e7b4cd6fb174'

const ARTIFACT_BODY: ExternalCapabilityArtifactSubjectBodyV1 = {
  schemaVersion: 'sage.external-capability-artifact-subject.v1',
  canonicalizationVersion: 'sage.external-capability-canonical-json.v1',
  transportKind: 'local-stdio',
  components: [
    {
      logicalRole: 'server-entrypoint',
      identity: 'server:sage-fixture',
      version: '2026-09-28',
      artifactDigest: CONTENT_DIGESTS.server,
    },
    {
      logicalRole: 'launcher',
      identity: 'launcher:node',
      version: '24.8.0',
      artifactDigest: CONTENT_DIGESTS.launcher,
    },
    {
      logicalRole: 'bridge',
      identity: '@deepseek-ai/dsh-mcp-client',
      version: '0.1.5-rc.2',
      artifactDigest: CONTENT_DIGESTS.bridge,
    },
    {
      logicalRole: 'sdk',
      identity: '@modelcontextprotocol/sdk',
      version: '1.30.0',
      artifactDigest: CONTENT_DIGESTS.sdk,
    },
    {
      logicalRole: 'interpreter',
      identity: 'runtime:node',
      version: '24.8.0',
      artifactDigest: CONTENT_DIGESTS.interpreter,
    },
  ],
  dependencyClosureDigest: CONTENT_DIGESTS.dependencies,
  packageInputsDigest: CONTENT_DIGESTS.packageInputs,
  lockInputsDigest: CONTENT_DIGESTS.lockInputs,
  executablePolicyDigest: CONTENT_DIGESTS.executablePolicy,
  linkTopologyDigest: CONTENT_DIGESTS.linkTopology,
}

const LAUNCH_BODY: ExternalCapabilityLaunchContractBodyV1 = {
  schemaVersion: 'sage.external-capability-launch-contract.v1',
  canonicalizationVersion: 'sage.external-capability-canonical-json.v1',
  transportKind: 'local-stdio',
  processMode: 'interpreter-entrypoint',
  argumentPolicyDigest: CONTENT_DIGESTS.argumentPolicy,
  environmentPolicyDigest: CONTENT_DIGESTS.environmentPolicy,
  workingDirectoryPolicy: 'artifact-root',
  protocolOverlayDigest: CONTENT_DIGESTS.protocolOverlay,
}

const BRIDGE_BODY: ExternalCapabilityBridgeContractBodyV1 = {
  schemaVersion: 'sage.external-capability-bridge-contract.v1',
  canonicalizationVersion: 'sage.external-capability-canonical-json.v1',
  identity: '@deepseek-ai/dsh-mcp-client',
  version: '0.1.5-rc.2',
  nameProjectionContract: 'dsh-mcp-client-public-tool-name.v1',
  descriptionProjectionContract: 'dsh-mcp-client-absent-description-to-empty.v1',
  outputSchemaEnforcementContract: 'dsh-mcp-client-supported-output-schema.v1',
  taskExecutionContract: 'dsh-mcp-client-required-task-only.v1',
}

const EXPECTED_ARTIFACT_BODY: ExternalCapabilityArtifactSubjectBodyV1 = {
  schemaVersion: 'sage.external-capability-artifact-subject.v1',
  canonicalizationVersion: 'sage.external-capability-canonical-json.v1',
  transportKind: 'local-stdio',
  components: [
    {
      logicalRole: 'bridge',
      identity: '@deepseek-ai/dsh-mcp-client',
      version: '0.1.5-rc.2',
      artifactDigest: CONTENT_DIGESTS.bridge,
    },
    {
      logicalRole: 'interpreter',
      identity: 'runtime:node',
      version: '24.8.0',
      artifactDigest: CONTENT_DIGESTS.interpreter,
    },
    {
      logicalRole: 'launcher',
      identity: 'launcher:node',
      version: '24.8.0',
      artifactDigest: CONTENT_DIGESTS.launcher,
    },
    {
      logicalRole: 'sdk',
      identity: '@modelcontextprotocol/sdk',
      version: '1.30.0',
      artifactDigest: CONTENT_DIGESTS.sdk,
    },
    {
      logicalRole: 'server-entrypoint',
      identity: 'server:sage-fixture',
      version: '2026-09-28',
      artifactDigest: CONTENT_DIGESTS.server,
    },
  ],
  dependencyClosureDigest: CONTENT_DIGESTS.dependencies,
  packageInputsDigest: CONTENT_DIGESTS.packageInputs,
  lockInputsDigest: CONTENT_DIGESTS.lockInputs,
  executablePolicyDigest: CONTENT_DIGESTS.executablePolicy,
  linkTopologyDigest: CONTENT_DIGESTS.linkTopology,
}

const EXPECTED_TOOL_BODY: ExternalCapabilityToolContractBodyV1 = {
  schemaVersion: 'sage.external-capability-tool-contract.v1',
  canonicalizationVersion: 'sage.external-capability-canonical-json.v1',
  negotiatedProtocolRevision: '2025-11-25',
  bridgeContractDigest: GOLDEN_BRIDGE_DIGEST,
  tools: [
    {
      rawName: 'alpha.read',
      descriptionSource: { state: 'present', value: '' },
      modelDescription: '',
      inputSchema: {
        type: 'object',
        properties: {
          values: {
            type: 'array',
            items: {
              oneOf: [{ type: 'string' }, { type: 'number' }],
            },
          },
        },
      },
      outputSchema: {
        presence: 'present',
        enforcement: 'fallback-unstructured',
        schema: {
          type: 'object',
          patternProperties: {
            '^x-': { type: 'string' },
          },
        },
      },
      effectiveTaskSupport: 'forbidden',
    },
    {
      rawName: 'zeta.inspect',
      descriptionSource: { state: 'absent' },
      modelDescription: '',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'A token label or /abs/path example is ordinary schema text.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
      outputSchema: {
        presence: 'present',
        enforcement: 'enforced',
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'integer' },
          },
          required: ['answer'],
          additionalProperties: false,
        },
      },
      effectiveTaskSupport: 'optional',
    },
  ],
}

const EXPECTED_DESCRIPTOR_BODY: ExternalCapabilityDescriptorBodyV1 = {
  schemaVersion: 'sage.external-capability-descriptor.v1',
  canonicalizationVersion: 'sage.external-capability-canonical-json.v1',
  capabilityId: 'capability:sage.fixture-insights',
  capabilityVersion: '1.0.0',
  artifactSubject: {
    ...EXPECTED_ARTIFACT_BODY,
    artifactSubjectDigest: GOLDEN_ARTIFACT_DIGEST,
  },
  launchContract: {
    ...LAUNCH_BODY,
    launchContractDigest: GOLDEN_LAUNCH_DIGEST,
  },
  bridgeContract: {
    ...BRIDGE_BODY,
    bridgeContractDigest: GOLDEN_BRIDGE_DIGEST,
  },
  toolContract: {
    ...EXPECTED_TOOL_BODY,
    toolContractDigest: GOLDEN_TOOL_DIGEST,
  },
}

function toolCandidate(
  bridgeContractDigest: ExternalCapabilityBridgeContractV1['bridgeContractDigest'],
): ExternalCapabilityToolContractCandidateV1 {
  return {
    schemaVersion: 'sage.external-capability-tool-contract-candidate.v1',
    canonicalizationVersion: 'sage.external-capability-canonical-json.v1',
    negotiatedProtocolRevision: '2025-11-25',
    bridgeContractDigest,
    tools: [
      {
        name: 'zeta.inspect',
        title: 'Inspect',
        icons: [{ src: 'data:image/svg+xml,fixture', mimeType: 'image/svg+xml' }],
        annotations: { readOnlyHint: true },
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'A token label or /abs/path example is ordinary schema text.',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
        outputSchema: {
          type: 'object',
          properties: {
            answer: { type: 'integer' },
          },
          required: ['answer'],
          additionalProperties: false,
        },
        execution: { taskSupport: 'optional' },
      },
      {
        name: 'alpha.read',
        description: '',
        inputSchema: {
          type: 'object',
          properties: {
            values: {
              type: 'array',
              items: {
                oneOf: [
                  { type: 'string' },
                  { type: 'number' },
                ],
              },
            },
          },
        },
        outputSchema: {
          type: 'object',
          patternProperties: {
            '^x-': { type: 'string' },
          },
        },
        execution: { taskSupport: 'forbidden' },
      },
    ],
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function referenceCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((member) => referenceCanonicalJson(member)).join(',')}]`
  }
  if (typeof value !== 'object' || value === null) return JSON.stringify(value)

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort(compareCodeUnits)
    .map((key) => `${JSON.stringify(key)}:${referenceCanonicalJson(record[key])}`)
    .join(',')}}`
}

function referenceDigest(namespace: string, canonical: string): string {
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex')
  return `urn:sage:${namespace}:sha256:${digest}`
}

function stripArtifactDigest(
  artifact: ExternalCapabilityArtifactSubjectV1,
): ExternalCapabilityArtifactSubjectBodyV1 {
  const { artifactSubjectDigest: _artifactSubjectDigest, ...body } = artifact
  return body
}

function stripLaunchDigest(
  launch: ExternalCapabilityLaunchContractV1,
): ExternalCapabilityLaunchContractBodyV1 {
  const { launchContractDigest: _launchContractDigest, ...body } = launch
  return body
}

function stripBridgeDigest(
  bridge: ExternalCapabilityBridgeContractV1,
): ExternalCapabilityBridgeContractBodyV1 {
  const { bridgeContractDigest: _bridgeContractDigest, ...body } = bridge
  return body
}

function stripToolDigest(
  toolContract: ExternalCapabilityToolContractV1,
): ExternalCapabilityToolContractBodyV1 {
  const { toolContractDigest: _toolContractDigest, ...body } = toolContract
  return body
}

function stripDescriptorDigest(
  descriptor: ExternalCapabilityDescriptorV1,
): ExternalCapabilityDescriptorBodyV1 {
  const { descriptorDigest: _descriptorDigest, ...body } = descriptor
  return body
}

function expectSuccess<T>(
  result: ExternalCapabilityKernelResult<T>,
): T {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`Expected success, received ${result.code}.`)
  return result.value
}

function expectFailure(
  result: ExternalCapabilityKernelResult<unknown>,
  code: ExternalCapabilityKernelFailureCode,
): void {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`Expected ${code}.`)
  expect(result.code).toBe(code)
  expect(result.reason.length).toBeGreaterThan(0)
  expect(Object.isFrozen(result)).toBe(true)
}

function fixture(): ExternalCapabilityDescriptorV1 {
  const artifactSubject = sealExternalCapabilityArtifactSubject(
    structuredClone(ARTIFACT_BODY),
  )
  const launchContract = sealExternalCapabilityLaunchContract(
    structuredClone(LAUNCH_BODY),
  )
  const bridgeContract = sealExternalCapabilityBridgeContract(
    structuredClone(BRIDGE_BODY),
  )
  const toolContract = expectSuccess(
    normalizeExternalCapabilityToolContract(
      structuredClone(toolCandidate(bridgeContract.bridgeContractDigest)),
    ),
  )
  return sealExternalCapabilityDescriptor({
    schemaVersion: 'sage.external-capability-descriptor.v1',
    canonicalizationVersion: 'sage.external-capability-canonical-json.v1',
    capabilityId: 'capability:sage.fixture-insights',
    capabilityVersion: '1.0.0',
    artifactSubject,
    launchContract,
    bridgeContract,
    toolContract,
  })
}

describe('WT-02C.2C.1 external capability descriptor kernel', () => {
  it('matches an independent canonical encoder and five isolated digest namespaces', () => {
    const descriptor = fixture()
    expect(stripArtifactDigest(descriptor.artifactSubject))
      .toEqual(EXPECTED_ARTIFACT_BODY)
    expect(stripLaunchDigest(descriptor.launchContract)).toEqual(LAUNCH_BODY)
    expect(stripBridgeDigest(descriptor.bridgeContract)).toEqual(BRIDGE_BODY)
    expect(stripToolDigest(descriptor.toolContract)).toEqual(EXPECTED_TOOL_BODY)
    expect(stripDescriptorDigest(descriptor)).toEqual(EXPECTED_DESCRIPTOR_BODY)

    const artifactCanonical = referenceCanonicalJson(EXPECTED_ARTIFACT_BODY)
    const launchCanonical = referenceCanonicalJson(LAUNCH_BODY)
    const bridgeCanonical = referenceCanonicalJson(BRIDGE_BODY)
    const toolCanonical = referenceCanonicalJson(EXPECTED_TOOL_BODY)
    const descriptorCanonical = referenceCanonicalJson(EXPECTED_DESCRIPTOR_BODY)

    expect(canonicalizeExternalCapabilityArtifactSubject(EXPECTED_ARTIFACT_BODY))
      .toBe(artifactCanonical)
    expect(canonicalizeExternalCapabilityLaunchContract(LAUNCH_BODY))
      .toBe(launchCanonical)
    expect(canonicalizeExternalCapabilityBridgeContract(BRIDGE_BODY))
      .toBe(bridgeCanonical)
    expect(canonicalizeExternalCapabilityToolContract(EXPECTED_TOOL_BODY))
      .toBe(toolCanonical)
    expect(canonicalizeExternalCapabilityDescriptor(EXPECTED_DESCRIPTOR_BODY))
      .toBe(descriptorCanonical)

    expect(computeExternalCapabilityArtifactSubjectDigest(EXPECTED_ARTIFACT_BODY))
      .toBe(referenceDigest('external-capability-artifact', artifactCanonical))
    expect(computeExternalCapabilityLaunchContractDigest(LAUNCH_BODY))
      .toBe(referenceDigest('external-capability-launch', launchCanonical))
    expect(computeExternalCapabilityBridgeContractDigest(BRIDGE_BODY))
      .toBe(referenceDigest('external-capability-bridge-contract', bridgeCanonical))
    expect(computeExternalCapabilityToolContractDigest(EXPECTED_TOOL_BODY))
      .toBe(referenceDigest('external-capability-tool-contract', toolCanonical))
    expect(computeExternalCapabilityDescriptorDigest(EXPECTED_DESCRIPTOR_BODY))
      .toBe(referenceDigest('external-capability-descriptor', descriptorCanonical))

    expect(descriptor.artifactSubject.artifactSubjectDigest).toBe(GOLDEN_ARTIFACT_DIGEST)
    expect(descriptor.launchContract.launchContractDigest).toBe(GOLDEN_LAUNCH_DIGEST)
    expect(descriptor.bridgeContract.bridgeContractDigest).toBe(GOLDEN_BRIDGE_DIGEST)
    expect(descriptor.toolContract.toolContractDigest).toBe(GOLDEN_TOOL_DIGEST)
    expect(descriptor.descriptorDigest).toBe(GOLDEN_DESCRIPTOR_DIGEST)
  })

  it('normalizes set-like component/tool order while preserving schema array order', () => {
    const bridge = sealExternalCapabilityBridgeContract(BRIDGE_BODY)
    const normal = expectSuccess(
      normalizeExternalCapabilityToolContract(toolCandidate(bridge.bridgeContractDigest)),
    )
    const reversedCandidate = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    reversedCandidate.tools.reverse()
    const reversed = expectSuccess(
      normalizeExternalCapabilityToolContract(reversedCandidate),
    )
    expect(reversed).toEqual(normal)

    const artifact = sealExternalCapabilityArtifactSubject(ARTIFACT_BODY)
    const reversedArtifact = sealExternalCapabilityArtifactSubject({
      ...ARTIFACT_BODY,
      components: [...ARTIFACT_BODY.components].reverse(),
    })
    expect(reversedArtifact).toEqual(artifact)

    const changedArray = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    const values = changedArray.tools[1]?.inputSchema.properties?.values
    if (
      typeof values !== 'object' ||
      values === null ||
      !('items' in values) ||
      typeof values.items !== 'object' ||
      values.items === null ||
      !('oneOf' in values.items) ||
      !Array.isArray(values.items.oneOf)
    ) {
      throw new Error('Expected oneOf fixture.')
    }
    values.items.oneOf.reverse()
    const changed = expectSuccess(normalizeExternalCapabilityToolContract(changedArray))
    expect(changed.toolContractDigest).not.toBe(normal.toolContractDigest)
  })

  it('uses code-unit object-key order while preserving required and enum array order', () => {
    const bridge = sealExternalCapabilityBridgeContract(BRIDGE_BODY)
    const candidate = toolCandidate(bridge.bridgeContractDigest)
    candidate.tools[0]!.inputSchema = {
      type: 'object',
      properties: {
        'ä': { type: 'string' },
        z: { type: 'string' },
      },
      required: ['ä', 'z'],
    }
    const baseline = expectSuccess(
      normalizeExternalCapabilityToolContract(candidate),
    )

    const reorderedKeys = structuredClone(candidate)
    reorderedKeys.tools[0]!.inputSchema.properties = {
      z: { type: 'string' },
      'ä': { type: 'string' },
    }
    expect(expectSuccess(
      normalizeExternalCapabilityToolContract(reorderedKeys),
    )).toEqual(baseline)

    const numericKeys = toolCandidate(bridge.bridgeContractDigest)
    numericKeys.tools[0]!.inputSchema = {
      type: 'object',
      properties: {
        '2': { type: 'string' },
        '10': { type: 'string' },
      },
    }
    const numericBody = stripToolDigest(expectSuccess(
      normalizeExternalCapabilityToolContract(numericKeys),
    ))
    const numericCanonical = canonicalizeExternalCapabilityToolContract(
      numericBody,
    )
    expect(numericCanonical.indexOf('"10"')).toBeGreaterThanOrEqual(0)
    expect(numericCanonical.indexOf('"10"'))
      .toBeLessThan(numericCanonical.indexOf('"2"'))
    expect(numericCanonical).toBe(referenceCanonicalJson(numericBody))

    const reorderedRequired = structuredClone(candidate)
    reorderedRequired.tools[0]!.inputSchema.required = ['z', 'ä']
    expect(expectSuccess(
      normalizeExternalCapabilityToolContract(reorderedRequired),
    ).toolContractDigest).not.toBe(baseline.toolContractDigest)

    const enumCandidate = structuredClone(candidate)
    enumCandidate.tools[0]!.inputSchema.properties = {
      choice: { type: 'string', enum: ['ä', 'z'] },
    }
    enumCandidate.tools[0]!.inputSchema.required = ['choice']
    const enumBaseline = expectSuccess(
      normalizeExternalCapabilityToolContract(enumCandidate),
    )
    const reorderedEnum = structuredClone(enumCandidate)
    const choice = reorderedEnum.tools[0]!.inputSchema.properties?.choice
    if (typeof choice !== 'object' || choice === null) {
      throw new Error('Expected enum fixture.')
    }
    Reflect.set(choice, 'enum', ['z', 'ä'])
    expect(expectSuccess(
      normalizeExternalCapabilityToolContract(reorderedEnum),
    ).toolContractDigest).not.toBe(enumBaseline.toolContractDigest)
  })

  it('drops recognized presentation hints without weakening stable tool semantics', () => {
    const bridge = sealExternalCapabilityBridgeContract(BRIDGE_BODY)
    const candidate = toolCandidate(bridge.bridgeContractDigest)
    const baseline = expectSuccess(normalizeExternalCapabilityToolContract(candidate))

    const presentationChanged = structuredClone(candidate)
    const first = presentationChanged.tools[0]
    if (first === undefined) throw new Error('Expected first tool.')
    first.title = 'A different title'
    first.icons = [{ src: 'data:image/png,other', sizes: ['32x32'] }]
    first.annotations = {
      title: 'A different annotation title',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    }
    const changed = expectSuccess(
      normalizeExternalCapabilityToolContract(presentationChanged),
    )
    expect(changed).toEqual(baseline)

    const normalized = baseline.tools.find((tool) => tool.rawName === 'zeta.inspect')
    expect(normalized?.modelDescription).toBe('')
    expect(normalized?.effectiveTaskSupport).toBe('optional')
    expect(normalized?.outputSchema).toMatchObject({
      presence: 'present',
      enforcement: 'enforced',
    })

    const unsupported = baseline.tools.find((tool) => tool.rawName === 'alpha.read')
    expect(unsupported?.outputSchema).toMatchObject({
      presence: 'present',
      enforcement: 'fallback-unstructured',
    })
  })

  it('derives output enforcement from the exact pinned bridge subset', () => {
    const bridge = sealExternalCapabilityBridgeContract(BRIDGE_BODY)
    const enforcementFor = (schema: Record<string, unknown>): string => {
      const candidate = toolCandidate(bridge.bridgeContractDigest)
      const tool = candidate.tools.find((entry) => entry.name === 'zeta.inspect')
      if (tool === undefined) throw new Error('Expected zeta fixture.')
      tool.outputSchema = schema
      const normalized = expectSuccess(
        normalizeExternalCapabilityToolContract(candidate),
      ).tools.find((entry) => entry.rawName === 'zeta.inspect')
      if (normalized?.outputSchema.presence !== 'present') {
        throw new Error('Expected present output schema.')
      }
      return normalized.outputSchema.enforcement
    }

    for (const schema of [
      {
        type: 'object',
        properties: {
          value: { type: 'string', enum: ['a', 'b'], const: 'a' },
        },
        required: ['value'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          value: {
            oneOf: [{ type: 'string' }, { type: 'null' }],
          },
          payload: {
            title: 'Payload',
            description: 'Annotation-only unconstrained JSON.',
            default: { nested: true },
            examples: [{ nested: false }],
          },
        },
      },
    ]) {
      expect(enforcementFor(schema)).toBe('enforced')
    }

    for (const schema of [
      {
        type: 'object',
        properties: { value: { type: 'object', const: {} } },
      },
      {
        type: 'object',
        properties: { value: { type: 'array', enum: [[]] } },
      },
      {
        type: 'object',
        properties: { value: { type: 'array', const: [] } },
      },
      {
        type: 'object',
        properties: { value: { oneOf: [{ type: 'string' }] } },
      },
      {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['missing'],
      },
      {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
      {
        type: 'object',
        $schema: 'https://json-schema.org/draft/2020-12/schema',
      },
    ]) {
      expect(enforcementFor(schema)).toBe('fallback-unstructured')
    }
  })

  it('preserves raw description presence while matching the pinned bridge projection', () => {
    const bridge = sealExternalCapabilityBridgeContract(BRIDGE_BODY)
    const absentCandidate = toolCandidate(bridge.bridgeContractDigest)
    const absent = expectSuccess(
      normalizeExternalCapabilityToolContract(absentCandidate),
    ).tools.find((tool) => tool.rawName === 'zeta.inspect')

    const emptyCandidate = structuredClone(absentCandidate)
    const rawTool = emptyCandidate.tools.find((tool) => tool.name === 'zeta.inspect')
    if (rawTool === undefined) throw new Error('Expected zeta fixture.')
    rawTool.description = ''
    const empty = expectSuccess(
      normalizeExternalCapabilityToolContract(emptyCandidate),
    ).tools.find((tool) => tool.rawName === 'zeta.inspect')

    expect(absent).toMatchObject({
      descriptionSource: { state: 'absent' },
      modelDescription: '',
    })
    expect(empty).toMatchObject({
      descriptionSource: { state: 'present', value: '' },
      modelDescription: '',
    })
    expect(empty?.rawName).toBe(absent?.rawName)
    expect(empty?.inputSchema).toEqual(absent?.inputSchema)
    expect(empty?.modelDescription).toBe(absent?.modelDescription)
    expect(empty?.descriptionSource).not.toEqual(absent?.descriptionSource)
  })

  it('treats stable semantic changes as descriptor changes', () => {
    const baseline = fixture()

    const artifactBody = {
      ...stripArtifactDigest(baseline.artifactSubject),
      dependencyClosureDigest: `sha256:${'e'.repeat(64)}`,
    }
    const artifactChanged = sealExternalCapabilityDescriptor({
      ...stripDescriptorDigest(baseline),
      artifactSubject: sealExternalCapabilityArtifactSubject(artifactBody),
    })

    const executablePolicyChanged = sealExternalCapabilityDescriptor({
      ...stripDescriptorDigest(baseline),
      artifactSubject: sealExternalCapabilityArtifactSubject({
        ...stripArtifactDigest(baseline.artifactSubject),
        executablePolicyDigest: `sha256:${'b'.repeat(64)}`,
      }),
    })

    const linkTopologyChanged = sealExternalCapabilityDescriptor({
      ...stripDescriptorDigest(baseline),
      artifactSubject: sealExternalCapabilityArtifactSubject({
        ...stripArtifactDigest(baseline.artifactSubject),
        linkTopologyDigest: `sha256:${'c'.repeat(64)}`,
      }),
    })

    const launchBody = {
      ...stripLaunchDigest(baseline.launchContract),
      argumentPolicyDigest:
        `urn:sage:external-capability-argument-policy:sha256:${'f'.repeat(64)}`,
    }
    const launchChanged = sealExternalCapabilityDescriptor({
      ...stripDescriptorDigest(baseline),
      launchContract: sealExternalCapabilityLaunchContract(launchBody),
    })

    const toolCandidateChanged = toolCandidate(
      baseline.bridgeContract.bridgeContractDigest,
    )
    const firstTool = toolCandidateChanged.tools[0]
    if (firstTool === undefined) throw new Error('Expected first tool.')
    firstTool.description = 'Changed model-visible description.'
    const toolChanged = sealExternalCapabilityDescriptor({
      ...stripDescriptorDigest(baseline),
      toolContract: expectSuccess(
        normalizeExternalCapabilityToolContract(toolCandidateChanged),
      ),
    })

    const descriptorFromCandidate = (
      candidate: ExternalCapabilityToolContractCandidateV1,
    ): ExternalCapabilityDescriptorV1 => sealExternalCapabilityDescriptor({
      ...stripDescriptorDigest(baseline),
      toolContract: expectSuccess(
        normalizeExternalCapabilityToolContract(candidate),
      ),
    })

    const rawNameCandidate = toolCandidate(
      baseline.bridgeContract.bridgeContractDigest,
    )
    rawNameCandidate.tools[0]!.name = 'zeta.inspect-v2'
    const rawNameChanged = descriptorFromCandidate(rawNameCandidate)

    const inputCandidate = toolCandidate(
      baseline.bridgeContract.bridgeContractDigest,
    )
    Reflect.set(inputCandidate.tools[0]!.inputSchema.properties!, 'scope', {
      type: 'string',
    })
    const inputChanged = descriptorFromCandidate(inputCandidate)

    const outputCandidate = toolCandidate(
      baseline.bridgeContract.bridgeContractDigest,
    )
    Reflect.set(outputCandidate.tools[0]!.outputSchema!.properties!, 'source', {
      type: 'string',
    })
    const outputChanged = descriptorFromCandidate(outputCandidate)

    const taskCandidate = toolCandidate(
      baseline.bridgeContract.bridgeContractDigest,
    )
    taskCandidate.tools[0]!.execution = { taskSupport: 'required' }
    const taskChanged = descriptorFromCandidate(taskCandidate)

    const protocolCandidate = toolCandidate(
      baseline.bridgeContract.bridgeContractDigest,
    )
    protocolCandidate.negotiatedProtocolRevision = '2025-06-18'
    const protocolChanged = sealExternalCapabilityDescriptor({
      ...stripDescriptorDigest(baseline),
      toolContract: expectSuccess(
        normalizeExternalCapabilityToolContract(protocolCandidate),
      ),
    })

    const versionChanged = sealExternalCapabilityDescriptor({
      ...stripDescriptorDigest(baseline),
      capabilityVersion: '1.0.1',
    })

    const capabilityIdChanged = sealExternalCapabilityDescriptor({
      ...stripDescriptorDigest(baseline),
      capabilityId: 'capability:sage.fixture-insights-v2',
    })

    expect(new Set([
      baseline.descriptorDigest,
      artifactChanged.descriptorDigest,
      executablePolicyChanged.descriptorDigest,
      linkTopologyChanged.descriptorDigest,
      launchChanged.descriptorDigest,
      toolChanged.descriptorDigest,
      rawNameChanged.descriptorDigest,
      inputChanged.descriptorDigest,
      outputChanged.descriptorDigest,
      taskChanged.descriptorDigest,
      protocolChanged.descriptorDigest,
      versionChanged.descriptorDigest,
      capabilityIdChanged.descriptorDigest,
    ]).size).toBe(13)
  })

  it('rejects empty/duplicate tool sets and unsupported extensions', () => {
    const bridge = sealExternalCapabilityBridgeContract(BRIDGE_BODY)
    const empty = toolCandidate(bridge.bridgeContractDigest)
    empty.tools = []
    expectFailure(
      normalizeExternalCapabilityToolContract(empty),
      'tool-contract-invalid',
    )

    const duplicate = toolCandidate(bridge.bridgeContractDigest)
    duplicate.tools = [duplicate.tools[0]!, structuredClone(duplicate.tools[0]!)]
    expectFailure(
      normalizeExternalCapabilityToolContract(duplicate),
      'tool-contract-invalid',
    )

    const withMeta = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    Reflect.set(withMeta.tools[0]!, '_meta', { secret: 'must-not-leak' })
    const metaResult = normalizeExternalCapabilityToolContract(withMeta)
    expectFailure(metaResult, 'tool-contract-extension-unsupported')
    expect(JSON.stringify(metaResult)).not.toContain('must-not-leak')

    const unknown = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    Reflect.set(unknown.tools[0]!, 'futureExtension', { value: true })
    expectFailure(
      normalizeExternalCapabilityToolContract(unknown),
      'tool-contract-extension-unsupported',
    )
  })

  it('rejects duplicate artifact roles, invalid immutable versions, and forged digests', () => {
    expect(() => sealExternalCapabilityArtifactSubject({
      ...ARTIFACT_BODY,
      components: [
        ...ARTIFACT_BODY.components,
        structuredClone(ARTIFACT_BODY.components[0]!),
      ],
    })).toThrow(TypeError)

    expect(() => sealExternalCapabilityArtifactSubject({
      ...ARTIFACT_BODY,
      components: ARTIFACT_BODY.components.map((component, index) =>
        index === 0 ? { ...component, version: '01.0.0' } : component),
    })).toThrow(TypeError)

    expect(() => sealExternalCapabilityArtifactSubject({
      ...ARTIFACT_BODY,
      components: ARTIFACT_BODY.components.map((component, index) =>
        index === 0 ? { ...component, version: '2026-02-31' } : component),
    })).toThrow(TypeError)

    expect(() => sealExternalCapabilityArtifactSubject({
      ...ARTIFACT_BODY,
      components: [
        {
          logicalRole: 'anything',
          identity: 'anything',
          version: '1.0.0',
          artifactDigest: CONTENT_DIGESTS.server,
        },
      ],
    })).toThrow(TypeError)

    expect(() => sealExternalCapabilityArtifactSubject({
      ...ARTIFACT_BODY,
      components: ARTIFACT_BODY.components.filter(
        (component) => component.logicalRole !== 'sdk',
      ),
    })).toThrow(TypeError)

    expect(() => sealExternalCapabilityArtifactSubject({
      ...ARTIFACT_BODY,
      components: ARTIFACT_BODY.components.map((component) =>
        component.logicalRole === 'launcher'
          ? { ...component, identity: '/Users/private/secret' }
          : component),
    })).toThrow(TypeError)

    const descriptor = structuredClone(fixture())
    descriptor.artifactSubject.artifactSubjectDigest =
      `urn:sage:external-capability-artifact:sha256:${'0'.repeat(64)}`
    expectFailure(
      parseExternalCapabilityDescriptor(descriptor),
      'capability-artifact-unclassifiable',
    )

    const wrongNamespace = structuredClone(fixture())
    wrongNamespace.descriptorDigest =
      `urn:sage:runtime-descriptor:sha256:${'0'.repeat(64)}`
    expectFailure(
      parseExternalCapabilityDescriptor(wrongNamespace),
      'capability-descriptor-invalid',
    )
  })

  it('pins bridge and SDK identities and rejects digest type confusion', () => {
    for (const [field, value] of [
      ['identity', '@example/other-bridge'],
      ['version', '0.1.5'],
      ['nameProjectionContract', 'future-name-projection.v2'],
      ['descriptionProjectionContract', 'future-description-projection.v2'],
      ['outputSchemaEnforcementContract', 'future-output-contract.v2'],
      ['taskExecutionContract', 'future-task-contract.v2'],
    ] as const) {
      expect(() => sealExternalCapabilityBridgeContract({
        ...BRIDGE_BODY,
        [field]: value,
      })).toThrow(TypeError)
    }

    for (const [role, field, value] of [
      ['bridge', 'identity', '@example/other-bridge'],
      ['bridge', 'version', '0.1.5'],
      ['sdk', 'identity', '@example/other-sdk'],
      ['sdk', 'version', '1.31.0'],
    ] as const) {
      expect(() => sealExternalCapabilityArtifactSubject({
        ...ARTIFACT_BODY,
        components: ARTIFACT_BODY.components.map((component) =>
          component.logicalRole === role
            ? { ...component, [field]: value }
            : component),
      })).toThrow(TypeError)
    }

    expect(() => sealExternalCapabilityLaunchContract({
      ...LAUNCH_BODY,
      argumentPolicyDigest: CONTENT_DIGESTS.environmentPolicy,
    })).toThrow(TypeError)
    expect(() => sealExternalCapabilityLaunchContract({
      ...LAUNCH_BODY,
      environmentPolicyDigest: CONTENT_DIGESTS.protocolOverlay,
    })).toThrow(TypeError)
    expect(() => sealExternalCapabilityLaunchContract({
      ...LAUNCH_BODY,
      protocolOverlayDigest: CONTENT_DIGESTS.argumentPolicy,
    })).toThrow(TypeError)

    const mutations: Array<(value: ExternalCapabilityDescriptorV1) => void> = [
      (value) => {
        value.artifactSubject.artifactSubjectDigest =
          value.launchContract.launchContractDigest
      },
      (value) => {
        value.launchContract.launchContractDigest =
          value.bridgeContract.bridgeContractDigest
      },
      (value) => {
        value.bridgeContract.bridgeContractDigest =
          value.toolContract.toolContractDigest
      },
      (value) => {
        value.toolContract.toolContractDigest = value.descriptorDigest
      },
      (value) => {
        value.descriptorDigest = value.artifactSubject.artifactSubjectDigest
      },
    ]
    for (const mutate of mutations) {
      const value = structuredClone(fixture())
      mutate(value)
      expect(parseExternalCapabilityDescriptor(value).ok).toBe(false)
    }

    for (const malformed of [
      `urn:sage:external-capability-descriptor:sha256:${'A'.repeat(64)}`,
      `urn:sage:external-capability-descriptor:sha256:${'0'.repeat(63)}`,
      `urn:sage:external-capability-descriptor:sha256:${'0'.repeat(65)}`,
    ]) {
      const value = structuredClone(fixture())
      value.descriptorDigest = malformed
      expectFailure(
        parseExternalCapabilityDescriptor(value),
        'capability-descriptor-invalid',
      )
    }
  })

  it('rejects __proto__ and other unknown keys on every sealed wrapper', () => {
    for (const [select, code] of [
      [(value: ExternalCapabilityDescriptorV1) => value,
        'capability-descriptor-invalid'],
      [(value: ExternalCapabilityDescriptorV1) => value.artifactSubject,
        'capability-artifact-unclassifiable'],
      [(value: ExternalCapabilityDescriptorV1) => value.launchContract,
        'launch-contract-unclassifiable'],
      [(value: ExternalCapabilityDescriptorV1) => value.bridgeContract,
        'bridge-contract-invalid'],
      [(value: ExternalCapabilityDescriptorV1) => value.toolContract,
        'tool-contract-invalid'],
    ] as const) {
      const value = structuredClone(fixture())
      Object.defineProperty(select(value), '__proto__', {
        value: 'must-not-be-ignored',
        enumerable: true,
        configurable: true,
      })
      expectFailure(
        parseExternalCapabilityDescriptor(value),
        code,
      )
    }
  })

  it('rejects structural command/env/path inputs without scanning ordinary schema text', () => {
    const bridge = sealExternalCapabilityBridgeContract(BRIDGE_BODY)
    const valid = expectSuccess(
      normalizeExternalCapabilityToolContract(toolCandidate(bridge.bridgeContractDigest)),
    )
    expect(valid.tools[1]?.inputSchema).toEqual(
      toolCandidate(bridge.bridgeContractDigest).tools[0]?.inputSchema,
    )

    for (const forbidden of [
      ['command', '/bin/zsh -c source /secret'],
      ['args', ['--token', 'secret']],
      ['env', { API_KEY: 'secret' }],
      ['cwd', '/Users/example/private'],
      ['path', '/absolute/server.js'],
      ['url', 'https://example.invalid/?token=secret'],
      ['headers', { Authorization: 'Bearer secret' }],
    ] as const) {
      const launch = structuredClone(LAUNCH_BODY) as unknown as Record<string, unknown>
      launch[forbidden[0]] = forbidden[1]
      let message = ''
      try {
        sealExternalCapabilityLaunchContract(launch)
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      expect(message.length).toBeGreaterThan(0)
      expect(message).not.toContain('secret')
      expect(message).not.toContain('/Users/example/private')
    }

    expect(() => sealExternalCapabilityLaunchContract({
      ...LAUNCH_BODY,
      argumentPolicyDigest: `sha256:${'b'.repeat(64)}`,
    })).toThrow(TypeError)

    const hostileName = toolCandidate(bridge.bridgeContractDigest)
    hostileName.tools[0]!.name = '/Users/private/token=secret'
    const hostileNameResult = normalizeExternalCapabilityToolContract(hostileName)
    expectFailure(hostileNameResult, 'tool-contract-invalid')
    expect(JSON.stringify(hostileNameResult)).not.toContain('token=secret')

    const normalizedHostileName = structuredClone(EXPECTED_TOOL_BODY)
    normalizedHostileName.tools[0]!.rawName = '/Users/private/token=secret'
    expect(() => canonicalizeExternalCapabilityToolContract(
      normalizedHostileName,
    )).toThrow(TypeError)
  })

  it('validates the pinned raw Tool base shape before projection', () => {
    const bridge = sealExternalCapabilityBridgeContract(BRIDGE_BODY)
    const invalidCandidates: ExternalCapabilityToolContractCandidateV1[] = []

    const invalidInputProperties = toolCandidate(bridge.bridgeContractDigest)
    Reflect.set(invalidInputProperties.tools[0]!.inputSchema, 'properties', 42)
    invalidCandidates.push(invalidInputProperties)

    const invalidInputRequired = toolCandidate(bridge.bridgeContractDigest)
    Reflect.set(invalidInputRequired.tools[0]!.inputSchema, 'required', 'query')
    invalidCandidates.push(invalidInputRequired)

    const invalidOutputProperties = toolCandidate(bridge.bridgeContractDigest)
    Reflect.set(invalidOutputProperties.tools[0]!.outputSchema!, 'properties', 42)
    invalidCandidates.push(invalidOutputProperties)

    const invalidTitle = toolCandidate(bridge.bridgeContractDigest)
    Reflect.set(invalidTitle.tools[0]!, 'title', 42)
    invalidCandidates.push(invalidTitle)

    const invalidIcons = toolCandidate(bridge.bridgeContractDigest)
    Reflect.set(invalidIcons.tools[0]!, 'icons', 'not-an-array')
    invalidCandidates.push(invalidIcons)

    const invalidAnnotations = toolCandidate(bridge.bridgeContractDigest)
    Reflect.set(invalidAnnotations.tools[0]!, 'annotations', 7)
    invalidCandidates.push(invalidAnnotations)

    const unknownAnnotation = toolCandidate(bridge.bridgeContractDigest)
    Reflect.set(unknownAnnotation.tools[0]!, 'annotations', {
      readOnlyHint: true,
      authorityHint: 'must-not-be-trusted',
    })
    invalidCandidates.push(unknownAnnotation)

    for (const candidate of invalidCandidates) {
      expectFailure(
        normalizeExternalCapabilityToolContract(candidate),
        'tool-contract-invalid',
      )
    }
  })

  it('pins protocol, task-support defaults, and the absent output state', () => {
    const bridge = sealExternalCapabilityBridgeContract(BRIDGE_BODY)
    const candidate = toolCandidate(bridge.bridgeContractDigest)
    const tool = candidate.tools.find((entry) => entry.name === 'zeta.inspect')
    if (tool === undefined) throw new Error('Expected zeta fixture.')
    delete tool.execution
    delete tool.outputSchema

    const normalized = expectSuccess(
      normalizeExternalCapabilityToolContract(candidate),
    ).tools.find((entry) => entry.rawName === 'zeta.inspect')
    expect(normalized).toMatchObject({
      effectiveTaskSupport: 'forbidden',
      outputSchema: {
        presence: 'absent',
        enforcement: 'not-advertised',
      },
    })

    const required = toolCandidate(bridge.bridgeContractDigest)
    const requiredTool = required.tools.find((entry) => entry.name === 'zeta.inspect')
    if (requiredTool === undefined) throw new Error('Expected zeta fixture.')
    requiredTool.execution = { taskSupport: 'required' }
    expect(expectSuccess(
      normalizeExternalCapabilityToolContract(required),
    ).tools.find((entry) => entry.rawName === 'zeta.inspect'))
      .toMatchObject({ effectiveTaskSupport: 'required' })

    const invalidTask = toolCandidate(bridge.bridgeContractDigest)
    Reflect.set(invalidTask.tools[0]!, 'execution', { taskSupport: 'future' })
    expectFailure(
      normalizeExternalCapabilityToolContract(invalidTask),
      'tool-contract-invalid',
    )

    const invalidProtocol = toolCandidate(bridge.bridgeContractDigest)
    Reflect.set(invalidProtocol, 'negotiatedProtocolRevision', '2026-01-01')
    expectFailure(
      normalizeExternalCapabilityToolContract(invalidProtocol),
      'tool-contract-invalid',
    )
  })

  it('rejects non-lossless JSON and keeps schema arrays as ordered data', () => {
    const bridge = sealExternalCapabilityBridgeContract(BRIDGE_BODY)
    for (const invalid of [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -0,
      1n,
      Symbol('invalid'),
      () => undefined,
    ]) {
      const candidate = structuredClone(toolCandidate(bridge.bridgeContractDigest))
      Reflect.set(candidate.tools[0]!.inputSchema, 'invalid', invalid)
      expectFailure(
        normalizeExternalCapabilityToolContract(candidate),
        'tool-contract-invalid',
      )
    }

    const cyclic = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    Reflect.set(cyclic.tools[0]!.inputSchema, 'cycle', cyclic.tools[0]!.inputSchema)
    expectFailure(
      normalizeExternalCapabilityToolContract(cyclic),
      'tool-contract-invalid',
    )

    const sparse = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    const array = new Array<unknown>(2)
    array[1] = { type: 'string' }
    Reflect.set(sparse.tools[0]!.inputSchema, 'examples', array)
    expectFailure(
      normalizeExternalCapabilityToolContract(sparse),
      'tool-contract-invalid',
    )
  })

  it('rejects accessors and proxies without invoking getters or traps', () => {
    const bridge = sealExternalCapabilityBridgeContract(BRIDGE_BODY)
    let getterCalls = 0
    let trapCalls = 0

    const accessor = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    Object.defineProperty(accessor.tools[0]!, 'name', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        return 'hostile'
      },
    })
    expectFailure(
      normalizeExternalCapabilityToolContract(accessor),
      'tool-contract-invalid',
    )
    expect(getterCalls).toBe(0)

    const nestedAccessor = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    Object.defineProperty(nestedAccessor.tools[0]!.inputSchema, 'type', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        return 'object'
      },
    })
    expectFailure(
      normalizeExternalCapabilityToolContract(nestedAccessor),
      'tool-contract-invalid',
    )
    expect(getterCalls).toBe(0)

    const arrayAccessor = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    const examples = [{ stable: true }]
    Object.defineProperty(examples, '0', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        return { hostile: true }
      },
    })
    Reflect.set(arrayAccessor.tools[0]!.inputSchema, 'examples', examples)
    expectFailure(
      normalizeExternalCapabilityToolContract(arrayAccessor),
      'tool-contract-invalid',
    )
    expect(getterCalls).toBe(0)

    const nestedProxy = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    const proxiedExample = new Proxy({ stable: true }, {
      get(target, property, receiver) {
        trapCalls += 1
        return Reflect.get(target, property, receiver)
      },
      ownKeys(target) {
        trapCalls += 1
        return Reflect.ownKeys(target)
      },
    })
    Reflect.set(nestedProxy.tools[0]!.inputSchema, 'examples', [proxiedExample])
    expectFailure(
      normalizeExternalCapabilityToolContract(nestedProxy),
      'tool-contract-invalid',
    )
    expect(trapCalls).toBe(0)

    const proxy = new Proxy(toolCandidate(bridge.bridgeContractDigest), {
      get(target, property, receiver) {
        trapCalls += 1
        return Reflect.get(target, property, receiver)
      },
      ownKeys(target) {
        trapCalls += 1
        return Reflect.ownKeys(target)
      },
    })
    expectFailure(
      normalizeExternalCapabilityToolContract(proxy),
      'tool-contract-invalid',
    )
    expect(trapCalls).toBe(0)

    const revoked = Proxy.revocable(toolCandidate(bridge.bridgeContractDigest), {})
    revoked.revoke()
    expectFailure(
      normalizeExternalCapabilityToolContract(revoked.proxy),
      'tool-contract-invalid',
    )
  })

  it('rejects exotic objects, symbol/non-enumerable keys, and decorated arrays', () => {
    const bridge = sealExternalCapabilityBridgeContract(BRIDGE_BODY)
    const cases: unknown[] = []

    const symbolKey = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    Reflect.set(symbolKey.tools[0]!, Symbol('hidden'), true)
    cases.push(symbolKey)

    const nonEnumerable = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    Object.defineProperty(nonEnumerable.tools[0]!, 'hidden', {
      value: true,
      enumerable: false,
    })
    cases.push(nonEnumerable)

    const decoratedArray = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    Reflect.set(decoratedArray.tools, 'extra', true)
    cases.push(decoratedArray)

    const exotic = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    Reflect.set(exotic.tools[0]!, 'inputSchema', new Date())
    cases.push(exotic)

    const classInstance = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    class SchemaFixture {
      readonly type = 'object'
    }
    Reflect.set(classInstance.tools[0]!, 'inputSchema', new SchemaFixture())
    cases.push(classInstance)

    const nullPrototype = structuredClone(toolCandidate(bridge.bridgeContractDigest))
    Reflect.set(nullPrototype.tools[0]!, 'inputSchema', Object.create(null))
    cases.push(nullPrototype)

    for (const candidate of cases) {
      expectFailure(
        normalizeExternalCapabilityToolContract(candidate),
        'tool-contract-invalid',
      )
    }
  })

  it('does not mutate inputs and returns detached, deeply frozen values', () => {
    const input = structuredClone(fixture())
    const before = structuredClone(input)
    const first = expectSuccess(parseExternalCapabilityDescriptor(input))
    const second = expectSuccess(parseExternalCapabilityDescriptor(input))

    expect(input).toEqual(before)
    expect(first).toEqual(second)
    expect(first).not.toBe(input)
    expect(first.artifactSubject).not.toBe(input.artifactSubject)
    expect(first.toolContract.tools).not.toBe(input.toolContract.tools)

    Reflect.set(input, 'capabilityId', 'capability:caller-mutated')
    Reflect.set(input.artifactSubject.components[0]!, 'identity', 'caller-mutated')
    Reflect.set(input.toolContract.tools[0]!, 'modelDescription', 'caller-mutated')
    expect(first).toEqual(second)

    const stack: unknown[] = [first]
    while (stack.length > 0) {
      const value = stack.pop()
      if (typeof value !== 'object' || value === null) continue
      expect(Object.isFrozen(value)).toBe(true)
      stack.push(...Object.values(value))
    }
  })

  it('keeps the kernel synchronous, materialized-input-only, and behind a strict import firewall', () => {
    const source = readFileSync(
      new URL('../src/security/external-capability.ts', import.meta.url),
      'utf8',
    )
    const importSpecifiers = [...source.matchAll(
      /(?:from\s+|import\s*)['"]([^'"]+)['"]/gu,
    )].map((match) => match[1])
    expect(importSpecifiers).toEqual([
      'node:crypto',
      'node:util',
    ])
    expect(source).not.toMatch(
      /\bimport\s*\(|\brequire\s*\(|\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s*['"]|process\.(?:env|cwd)\b|Date\.now|new Date|\bglobalThis\b|performance\.now|\bfetch\s*\(|\bset(?:Timeout|Interval)\s*\(|node:fs|node:path|host-process|runtime-inventory|capability-registry/iu,
    )
  })
})
