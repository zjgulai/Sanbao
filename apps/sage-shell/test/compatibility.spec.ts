import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  canonicalizeCompatibilityMatrix,
  canonicalizeCompatibilityMatrixV2,
  computeCompatibilityMatrixId,
  computeCompatibilityMatrixIdV2,
  computeCompatibilityTargetDigest,
  computeInventoryEvidenceDigestV2,
  computeRuntimeDescriptorDigestV2,
  computeRuntimeInventoryDigest,
  computeTargetEvidenceDigestV2,
  computeTargetSemanticDigestV2,
  createCompatibilityResolver,
  createCompatibilityResolverV2,
  resolveCompatibilityV2,
  type CompatibilityMatrix,
  type CompatibilityMatrixAvailable,
  type CompatibilityMatrixRule,
  type CompatibilityMatrixRuleV2,
  type CompatibilityMatrixV2,
  type CompatibilityMatrixV2Available,
  type CompatibilityResolveInput,
  type CompatibilityResolveInputV2,
  type CompatibilityResolution,
  type CompatibilityResolutionV2,
  type CompatibilityTargetEvidenceBodyV2,
  type CompatibilityTargetEvidenceV2,
  type CompatibilityTargetSemanticBodyV2,
  type CompatibilityTargetSemanticV2,
  type CompatibilityTarget,
  type CompatibilityTargetBody,
  type CompatibilityUnknownCode,
  type CompatibilityUnknownCodeV2,
  type RuntimeDescriptorBodyV2,
  type RuntimeDescriptorV2,
  type RuntimeInventory,
  type RuntimeInventoryBody,
  type RuntimeInventoryEvidenceBodyV2,
  type RuntimeInventoryEvidenceV2,
} from '../src/security/compatibility.js'

const NOW = '2026-09-28T12:00:00Z'
const GOLDEN_TARGET_DIGEST = 'urn:sage:compatibility-target:sha256:c258f0c049124e408eba9e9e54bf3eabd0fb71c6187e129f83d2b64d12ce09a5'
const GOLDEN_INVENTORY_DIGEST = 'urn:sage:runtime-inventory:sha256:b25eedb4a58167986b8f21649a10a53a163dc7450f56335ab46b2d2a916cb831'
const GOLDEN_CANONICAL_MATRIX = '{"schemaVersion":"sage.compatibility-matrix.v1","canonicalizationVersion":"sage.compatibility-canonical-json.v1","semanticVersion":"1.0.0","targetContractVersion":"sage.compatibility-target.v1","inventoryContractVersion":"sage.runtime-inventory.v1","issuer":{"identity":"authority:sage-compatibility","version":"1.0.0","digest":"sha256:sage-compatibility-authority-1"},"validFrom":"2026-09-28T00:00:00Z","expiresAt":"2026-09-29T00:00:00Z","rules":[{"ruleId":"rule:fixture-equivalent","targetDigest":"urn:sage:compatibility-target:sha256:c258f0c049124e408eba9e9e54bf3eabd0fb71c6187e129f83d2b64d12ce09a5","inventoryDigest":"urn:sage:runtime-inventory:sha256:b25eedb4a58167986b8f21649a10a53a163dc7450f56335ab46b2d2a916cb831","outcome":"equivalent","reasonCode":"fixture-exact-match","reason":"The fixed fixture target and inventory are an approved exact pair."}]}'
const GOLDEN_MATRIX_ID = 'urn:sage:compatibility-matrix:sha256:d2bc282cd8d88815887627a8b82f4e5a5dbe6658216f98c4b58917853c292268'

const TARGET_BODY: CompatibilityTargetBody = {
  schemaVersion: 'sage.compatibility-target.v1',
  canonicalizationVersion: 'sage.compatibility-canonical-json.v1',
  matterId: 'matter:catalog-001',
  revisionId: 'revision:catalog-002',
  revisionDigest: 'sha256:revision-catalog-002',
  actionPolicies: [
    {
      actionScope: 'catalog.publish',
      effectClass: 'external-write',
      requiresDecision: true,
    },
    {
      actionScope: 'catalog.prepare-draft',
      effectClass: 'local-write',
      requiresDecision: false,
    },
  ],
  permissionBoundaryDigest: 'sha256:permission-boundary-v2',
  dataDestinationDigest: 'sha256:data-destination-v3',
  provider: {
    identity: 'provider:sage-fixture',
    version: '1.0.0',
    digest: 'sha256:provider-sage-fixture-1',
  },
  model: {
    identity: 'model:sage-fixture',
    version: '2026-09-01',
    digest: 'sha256:model-sage-fixture-2026-09-01',
  },
  agent: {
    identity: 'agent:sage-catalog',
    version: '1.2.0',
    digest: 'sha256:agent-sage-catalog-1-2-0',
  },
  preset: {
    identity: 'preset:sage-catalog',
    version: '3.0.0',
    digest: 'sha256:preset-sage-catalog-3-0-0',
  },
  capabilities: [
    {
      identity: 'capability:shopify-write',
      version: '2.0.0',
      digest: 'sha256:capability-shopify-write-2',
      contractDigest: 'sha256:contract-shopify-write-2',
    },
    {
      identity: 'capability:catalog-read',
      version: '1.0.0',
      digest: 'sha256:capability-catalog-read-1',
      contractDigest: 'sha256:contract-catalog-read-1',
    },
  ],
}

const INVENTORY_BODY: RuntimeInventoryBody = {
  schemaVersion: 'sage.runtime-inventory.v1',
  canonicalizationVersion: 'sage.compatibility-canonical-json.v1',
  activeGeneration: 17,
  receiptDigest: 'sha256:materialization-receipt-17',
  materializationDigest: 'sha256:materialized-runtime-17',
  host: {
    identity: 'host:sage-desktop',
    version: '0.1.0',
    digest: 'sha256:host-sage-desktop-0-1-0',
  },
  harness: {
    identity: 'harness:sage-runtime',
    version: '0.1.5-rc.2',
    digest: 'sha256:harness-sage-runtime-0-1-5-rc-2',
  },
  provider: TARGET_BODY.provider,
  model: TARGET_BODY.model,
  agent: TARGET_BODY.agent,
  preset: TARGET_BODY.preset,
  capabilities: [
    {
      identity: 'capability:shopify-write',
      version: '2.0.0',
      digest: 'sha256:capability-shopify-write-2',
      configurationDigest: 'sha256:configuration-shopify-write-2',
      contractDigest: 'sha256:contract-shopify-write-2',
    },
    {
      identity: 'capability:catalog-read',
      version: '1.0.0',
      digest: 'sha256:capability-catalog-read-1',
      configurationDigest: 'sha256:configuration-catalog-read-1',
      contractDigest: 'sha256:contract-catalog-read-1',
    },
  ],
  bootId: 'boot:sage-fixture-001',
  runtimeGeneration: 23,
  observedAt: '2026-09-28T11:59:00Z',
  expiresAt: '2026-09-28T12:05:00Z',
}

function sealTarget(body: CompatibilityTargetBody): CompatibilityTarget {
  return {
    ...body,
    targetDigest: computeCompatibilityTargetDigest(body),
  }
}

function sealInventory(body: RuntimeInventoryBody): RuntimeInventory {
  return {
    ...body,
    inventoryDigest: computeRuntimeInventoryDigest(body),
  }
}

function rule(
  target: CompatibilityTarget,
  inventory: RuntimeInventory,
  overrides: Partial<CompatibilityMatrixRule> = {},
): CompatibilityMatrixRule {
  return {
    ruleId: 'rule:fixture-equivalent',
    targetDigest: target.targetDigest,
    inventoryDigest: inventory.inventoryDigest,
    outcome: 'equivalent',
    reasonCode: 'fixture-exact-match',
    reason: 'The fixed fixture target and inventory are an approved exact pair.',
    ...overrides,
  }
}

function matrix(rules: readonly CompatibilityMatrixRule[]): CompatibilityMatrix {
  return {
    schemaVersion: 'sage.compatibility-matrix.v1',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v1',
    semanticVersion: '1.0.0',
    targetContractVersion: 'sage.compatibility-target.v1',
    inventoryContractVersion: 'sage.runtime-inventory.v1',
    issuer: {
      identity: 'authority:sage-compatibility',
      version: '1.0.0',
      digest: 'sha256:sage-compatibility-authority-1',
    },
    validFrom: '2026-09-28T00:00:00Z',
    expiresAt: '2026-09-29T00:00:00Z',
    rules,
  }
}

function available(
  artifact: CompatibilityMatrix,
  revocations: CompatibilityMatrixAvailable['revocations'] = [],
): CompatibilityMatrixAvailable {
  const canonicalMatrix = canonicalizeCompatibilityMatrix(artifact)
  return {
    kind: 'available',
    matrixId: computeCompatibilityMatrixId(canonicalMatrix),
    canonicalMatrix,
    revocations,
  }
}

function fixture(): CompatibilityResolveInput {
  const target = sealTarget(structuredClone(TARGET_BODY))
  const inventory = sealInventory(structuredClone(INVENTORY_BODY))
  return {
    evaluatedAt: NOW,
    currentRevision: {
      matterId: target.matterId,
      revisionId: target.revisionId,
      digest: target.revisionDigest,
    },
    target,
    inventory,
    matrix: available(matrix([rule(target, inventory)])),
  }
}

function expectUnknown(
  resolution: CompatibilityResolution,
  code: CompatibilityUnknownCode,
): void {
  expect(resolution.outcome).toBe('unknown')
  if (resolution.outcome !== 'unknown') throw new Error(`Expected ${code}.`)
  expect(resolution.code).toBe(code)
  expect(resolution.reason.length).toBeGreaterThan(0)
  expect(Object.isFrozen(resolution)).toBe(true)
}

function withRawMatrix(
  input: CompatibilityResolveInput,
  mutate: (artifact: Record<string, unknown>) => void,
): CompatibilityResolveInput {
  if (input.matrix.kind !== 'available') throw new Error('Expected available matrix.')
  const parsed = JSON.parse(input.matrix.canonicalMatrix) as Record<string, unknown>
  mutate(parsed)
  const canonicalMatrix = JSON.stringify(parsed)
  return {
    ...input,
    matrix: {
      kind: 'available',
      matrixId: computeCompatibilityMatrixId(canonicalMatrix),
      canonicalMatrix,
      revocations: [],
    },
  }
}

describe('WT-02C.1 compatibility resolver kernel', () => {
  it('uses the frozen UTF-8 SHA-256 matrix ID contract and canonical set ordering', () => {
    expect(computeCompatibilityMatrixId('{"schemaVersion":"sage.compatibility-matrix.v1"}')).toBe(
      'urn:sage:compatibility-matrix:sha256:b6eab22e11d066142bcd61b793ceef8759fad182ec5c9e62443cab00048348e0',
    )

    const targetA = structuredClone(TARGET_BODY)
    const targetB: CompatibilityTargetBody = {
      ...structuredClone(TARGET_BODY),
      actionPolicies: [...structuredClone(TARGET_BODY.actionPolicies)].reverse(),
      capabilities: [...structuredClone(TARGET_BODY.capabilities)].reverse(),
    }
    expect(computeCompatibilityTargetDigest(targetA)).toBe(
      computeCompatibilityTargetDigest(targetB),
    )

    const inventoryA = structuredClone(INVENTORY_BODY)
    const inventoryB: RuntimeInventoryBody = {
      ...structuredClone(INVENTORY_BODY),
      capabilities: [...structuredClone(INVENTORY_BODY.capabilities)].reverse(),
    }
    expect(computeRuntimeInventoryDigest(inventoryA)).toBe(
      computeRuntimeInventoryDigest(inventoryB),
    )

    const target = sealTarget(targetA)
    const inventory = sealInventory(inventoryA)
    expect(target.targetDigest).toBe(GOLDEN_TARGET_DIGEST)
    expect(inventory.inventoryDigest).toBe(GOLDEN_INVENTORY_DIGEST)
    const goldenCanonicalMatrix = canonicalizeCompatibilityMatrix(
      matrix([rule(target, inventory)]),
    )
    expect(goldenCanonicalMatrix).toBe(GOLDEN_CANONICAL_MATRIX)
    expect(computeCompatibilityMatrixId(goldenCanonicalMatrix)).toBe(GOLDEN_MATRIX_ID)

    const first = rule(target, inventory, { ruleId: 'rule:a' })
    const second = rule(target, inventory, { ruleId: 'rule:b' })
    expect(canonicalizeCompatibilityMatrix(matrix([second, first]))).toBe(
      canonicalizeCompatibilityMatrix(matrix([first, second])),
    )

    const unicodeRuleIds = ['rule:\u{1f600}', 'rule:\u00e9', 'rule:e\u0301', 'rule:a']
    const unicodeRules = unicodeRuleIds.map((ruleId, index) => ({
      ...rule(target, inventory),
      ruleId,
      targetDigest: `urn:sage:compatibility-target:sha256:${String(index + 1).repeat(64).slice(0, 64)}`,
    }))
    const unicodeCanonical = JSON.parse(
      canonicalizeCompatibilityMatrix(matrix(unicodeRules)),
    ) as { rules: Array<{ ruleId: string }> }
    expect(unicodeCanonical.rules.map(({ ruleId }) => ruleId)).toEqual([
      'rule:a',
      'rule:e\u0301',
      'rule:\u00e9',
      'rule:\u{1f600}',
    ])
  })

  it('returns a frozen equivalent result only for one exact digest-pair rule', () => {
    const resolution = createCompatibilityResolver().resolve(fixture())

    expect(resolution).toMatchObject({
      outcome: 'equivalent',
      code: 'exact-match',
      reason: 'One exact compatibility rule authorizes this target and inventory pair.',
    })
    expect(resolution.matrixId).toMatch(
      /^urn:sage:compatibility-matrix:sha256:[0-9a-f]{64}$/u,
    )
    expect(Object.isFrozen(resolution)).toBe(true)
  })

  it('returns requires-new-revision only for one explicit semantic-change rule', () => {
    const input = fixture()
    const changedInventory = sealInventory({
      ...structuredClone(INVENTORY_BODY),
      model: {
        ...INVENTORY_BODY.model,
        version: '2026-09-02',
        digest: 'sha256:model-sage-fixture-2026-09-02',
      },
    })
    const semanticChange = rule(input.target, changedInventory, {
      ruleId: 'rule:semantic-change',
      outcome: 'requires-new-revision',
      reasonCode: 'model-behavior-changed',
      reason: 'The model change requires a new BusinessMatter revision.',
    })
    const resolution = createCompatibilityResolver().resolve({
      ...input,
      inventory: changedInventory,
      matrix: available(matrix([semanticChange])),
    })

    expect(resolution).toMatchObject({
      outcome: 'requires-new-revision',
      code: 'semantic-change',
      reason: 'One exact compatibility rule requires a new revision for this pair.',
    })
  })

  it('fails closed for zero matches and does not infer semantic change from version or capability drift', () => {
    const resolver = createCompatibilityResolver()
    const input = fixture()
    const originalMatrix = input.matrix

    const versionDrift = sealInventory({
      ...structuredClone(INVENTORY_BODY),
      provider: {
        ...INVENTORY_BODY.provider,
        version: '1.0.1',
      },
    })
    expectUnknown(
      resolver.resolve({ ...input, inventory: versionDrift, matrix: originalMatrix }),
      'no-matching-rule',
    )

    const missingCapabilityBody: RuntimeInventoryBody = {
      ...structuredClone(INVENTORY_BODY),
      capabilities: structuredClone(INVENTORY_BODY.capabilities).slice(0, -1),
    }
    expectUnknown(
      resolver.resolve({
        ...input,
        inventory: sealInventory(missingCapabilityBody),
        matrix: originalMatrix,
      }),
      'no-matching-rule',
    )

    const extraCapabilityBody: RuntimeInventoryBody = {
      ...structuredClone(INVENTORY_BODY),
      capabilities: [
        ...structuredClone(INVENTORY_BODY.capabilities),
        {
          identity: 'capability:unapproved-extra',
          version: '1.0.0',
          digest: 'sha256:unapproved-extra-1',
          configurationDigest: 'sha256:unapproved-extra-configuration-1',
          contractDigest: 'sha256:unapproved-extra-contract-1',
        },
      ],
    }
    expectUnknown(
      resolver.resolve({
        ...input,
        inventory: sealInventory(extraCapabilityBody),
        matrix: originalMatrix,
      }),
      'no-matching-rule',
    )

    const nextRevision = sealTarget({
      ...structuredClone(TARGET_BODY),
      revisionId: 'revision:catalog-003',
      revisionDigest: 'sha256:revision-catalog-003',
    })
    expectUnknown(
      resolver.resolve({
        ...input,
        currentRevision: {
          matterId: nextRevision.matterId,
          revisionId: nextRevision.revisionId,
          digest: nextRevision.revisionDigest,
        },
        target: nextRevision,
        matrix: originalMatrix,
      }),
      'no-matching-rule',
    )

    const nextBoot = sealInventory({
      ...structuredClone(INVENTORY_BODY),
      bootId: 'boot:sage-fixture-002',
      runtimeGeneration: 24,
    })
    expectUnknown(
      resolver.resolve({ ...input, inventory: nextBoot, matrix: originalMatrix }),
      'no-matching-rule',
    )
  })

  it('rejects duplicate, conflicting, and ambiguous matrix rules without first-match behavior', () => {
    const resolver = createCompatibilityResolver()
    const input = fixture()
    const exact = rule(input.target, input.inventory)

    expectUnknown(
      resolver.resolve({
        ...input,
        matrix: available(matrix([
          exact,
          { ...exact },
        ])),
      }),
      'matrix-rule-duplicate',
    )

    const conflict = {
      ...exact,
      ruleId: 'rule:conflict',
      outcome: 'requires-new-revision' as const,
    }
    expectUnknown(
      resolver.resolve({ ...input, matrix: available(matrix([exact, conflict])) }),
      'matrix-rule-conflict',
    )

    const ambiguity = { ...exact, ruleId: 'rule:ambiguous' }
    for (const rules of [[exact, ambiguity], [ambiguity, exact]]) {
      expectUnknown(
        resolver.resolve({ ...input, matrix: available(matrix(rules)) }),
        'matrix-rule-ambiguous',
      )
    }

    const offPath = {
      ...exact,
      ruleId: 'rule:off-path-a',
      targetDigest: `urn:sage:compatibility-target:sha256:${'a'.repeat(64)}`,
      inventoryDigest: `urn:sage:runtime-inventory:sha256:${'b'.repeat(64)}`,
    }
    const offPathConflict = {
      ...offPath,
      ruleId: 'rule:off-path-conflict',
      outcome: 'requires-new-revision' as const,
    }
    expectUnknown(
      resolver.resolve({
        ...input,
        matrix: available(matrix([exact, offPath, offPathConflict])),
      }),
      'matrix-rule-conflict',
    )
    const offPathAmbiguity = { ...offPath, ruleId: 'rule:off-path-ambiguous' }
    expectUnknown(
      resolver.resolve({
        ...input,
        matrix: available(matrix([offPathAmbiguity, exact, offPath])),
      }),
      'matrix-rule-ambiguous',
    )
  })

  it('rejects invalid target and inventory shapes, duplicate identities, and digest tampering', () => {
    const resolver = createCompatibilityResolver()
    const input = fixture()

    expectUnknown(
      resolver.resolve({
        ...input,
        currentRevision: { ...input.currentRevision, revisionId: 'revision:other' },
      }),
      'target-invalid',
    )
    expectUnknown(
      resolver.resolve({
        ...input,
        target: { ...input.target, targetDigest: 'sha256:tampered-target' },
      }),
      'target-digest-mismatch',
    )
    expectUnknown(
      resolver.resolve({
        ...input,
        inventory: { ...input.inventory, inventoryDigest: 'sha256:tampered-inventory' },
      }),
      'inventory-digest-mismatch',
    )

    const duplicateTarget = structuredClone(input.target) as unknown as {
      capabilities: CompatibilityTarget['capabilities'] extends readonly (infer T)[] ? T[] : never
    }
    duplicateTarget.capabilities.push(structuredClone(duplicateTarget.capabilities[0]!))
    expectUnknown(resolver.resolve({ ...input, target: duplicateTarget }), 'target-invalid')

    const duplicateInventory = structuredClone(input.inventory) as unknown as {
      capabilities: RuntimeInventory['capabilities'] extends readonly (infer T)[] ? T[] : never
    }
    duplicateInventory.capabilities.push(structuredClone(duplicateInventory.capabilities[0]!))
    expectUnknown(
      resolver.resolve({ ...input, inventory: duplicateInventory }),
      'inventory-invalid',
    )

    const duplicatePolicy = structuredClone(input.target) as unknown as {
      actionPolicies: CompatibilityTarget['actionPolicies'] extends readonly (infer T)[] ? T[] : never
    }
    duplicatePolicy.actionPolicies.push(structuredClone(duplicatePolicy.actionPolicies[0]!))
    expectUnknown(resolver.resolve({ ...input, target: duplicatePolicy }), 'target-invalid')
  })

  it('enforces the declared inventory observation window as a half-open interval', () => {
    const resolver = createCompatibilityResolver()
    const input = fixture()

    expectUnknown(
      resolver.resolve({ ...input, evaluatedAt: '2026-09-28T11:58:59Z' }),
      'inventory-not-active',
    )
    expect(resolver.resolve({
      ...input,
      evaluatedAt: '2026-09-28T11:59:00Z',
    }).outcome).toBe('equivalent')
    expectUnknown(
      resolver.resolve({ ...input, evaluatedAt: '2026-09-28T12:05:00Z' }),
      'inventory-not-active',
    )
  })

  it('validates canonical matrix bytes, identity, contract versions, lifecycle, and revocation', () => {
    const resolver = createCompatibilityResolver()
    const input = fixture()
    if (input.matrix.kind !== 'available') throw new Error('Expected available matrix.')

    expectUnknown(
      resolver.resolve({
        ...input,
        matrix: { ...input.matrix, matrixId: 'urn:sage:compatibility-matrix:sha256:deadbeef' },
      }),
      'matrix-id-mismatch',
    )

    const nonCanonical = ` ${input.matrix.canonicalMatrix}`
    expectUnknown(
      resolver.resolve({
        ...input,
        matrix: {
          ...input.matrix,
          canonicalMatrix: nonCanonical,
          matrixId: computeCompatibilityMatrixId(nonCanonical),
        },
      }),
      'matrix-artifact-invalid',
    )

    expectUnknown(
      resolver.resolve(withRawMatrix(input, (artifact) => {
        artifact.schemaVersion = 'sage.compatibility-matrix.v2'
      })),
      'matrix-artifact-invalid',
    )
    expectUnknown(
      resolver.resolve(withRawMatrix(input, (artifact) => {
        artifact.semanticVersion = '1.0.1'
      })),
      'matrix-artifact-invalid',
    )
    expectUnknown(
      resolver.resolve(withRawMatrix(input, (artifact) => {
        const issuer = artifact.issuer as Record<string, unknown>
        issuer.identity = 'authority:caller-controlled'
      })),
      'matrix-artifact-invalid',
    )
    expectUnknown(
      resolver.resolve(withRawMatrix(input, (artifact) => {
        artifact.targetContractVersion = 'sage.compatibility-target.v2'
      })),
      'matrix-artifact-invalid',
    )
    expectUnknown(
      resolver.resolve(withRawMatrix(input, (artifact) => {
        const rules = artifact.rules as Record<string, unknown>[]
        rules.push({
          ...rules[0],
          ruleId: 'rule:malformed-off-path',
          targetDigest: 'not-a-target-digest',
          inventoryDigest: 'not-an-inventory-digest',
        })
      })),
      'matrix-artifact-invalid',
    )

    expectUnknown(
      resolver.resolve(withRawMatrix(input, (artifact) => {
        artifact.validFrom = '2026-09-28T12:01:00Z'
      })),
      'matrix-not-active',
    )
    expectUnknown(
      resolver.resolve(withRawMatrix(input, (artifact) => {
        artifact.expiresAt = NOW
      })),
      'matrix-not-active',
    )
    expect(createCompatibilityResolver().resolve(
      withRawMatrix(input, (artifact) => {
        artifact.validFrom = NOW
      }),
    ).outcome).toBe('equivalent')

    expectUnknown(
      resolver.resolve({
        ...input,
        matrix: {
          ...input.matrix,
          revocations: [{
            matrixId: input.matrix.matrixId,
            revokedAt: '2026-09-28T11:00:00Z',
            reasonCode: 'publisher-revoked',
          }],
        },
      }),
      'matrix-revoked',
    )
    expectUnknown(
      resolver.resolve({
        ...input,
        matrix: {
          ...input.matrix,
          revocations: [{
            matrixId: input.matrix.matrixId,
            revokedAt: NOW,
            reasonCode: 'publisher-revoked-at-evaluation',
          }],
        },
      }),
      'matrix-revoked',
    )
    expect(resolver.resolve({
      ...input,
      matrix: {
        ...input.matrix,
        revocations: [{
          matrixId: input.matrix.matrixId,
          revokedAt: '2026-09-28T12:00:01Z',
          reasonCode: 'publisher-revoked-after-evaluation',
        }],
      },
    }).outcome).toBe('equivalent')
    expect(resolver.resolve({
      ...input,
      matrix: {
        ...input.matrix,
        revocations: [{
          matrixId: `urn:sage:compatibility-matrix:sha256:${'c'.repeat(64)}`,
          revokedAt: '2026-09-28T11:00:00Z',
          reasonCode: 'another-matrix-revoked',
        }],
      },
    }).outcome).toBe('equivalent')
  })

  it('maps materialized provider unavailability and malformed envelopes to stable safe unknown results', () => {
    const resolver = createCompatibilityResolver()
    const input = fixture()

    expectUnknown(
      resolver.resolve({ ...input, matrix: { kind: 'unavailable' } }),
      'matrix-provider-unavailable',
    )
    const malformed = {
      kind: 'unavailable',
      backendError: 'secret://credential@backend.internal',
    }
    const resolution = resolver.resolve({ ...input, matrix: malformed })
    expectUnknown(resolution, 'matrix-artifact-invalid')
    expect(JSON.stringify(resolution)).not.toContain('credential')

    expectUnknown(
      resolver.resolve({ ...input, matrix: Promise.resolve(input.matrix) }),
      'matrix-artifact-invalid',
    )

    if (input.matrix.kind !== 'available') throw new Error('Expected available matrix.')
    const invalidRevocation = resolver.resolve({
      ...input,
      matrix: {
        ...input.matrix,
        revocations: [{
          matrixId: 'secret://credential@revocation.internal',
          revokedAt: '2026-09-28T11:00:00Z',
          reasonCode: 'publisher-revoked',
        }],
      },
    })
    expectUnknown(invalidRevocation, 'matrix-artifact-invalid')
    expect(JSON.stringify(invalidRevocation)).not.toContain('credential')

    const untrustedId = resolver.resolve({
      ...input,
      matrix: {
        kind: 'available',
        matrixId: 'secret://credential@backend.internal',
        canonicalMatrix: 'not-json',
        revocations: [],
      },
    })
    expectUnknown(untrustedId, 'matrix-id-mismatch')
    expect(JSON.stringify(untrustedId)).not.toContain('credential')

    const invalidCanonical = resolver.resolve({
      ...input,
      matrix: {
        kind: 'available',
        matrixId: `urn:sage:compatibility-matrix:sha256:${'0'.repeat(64)}`,
        canonicalMatrix: 'not-json',
        revocations: [],
      },
    })
    expectUnknown(invalidCanonical, 'matrix-artifact-invalid')
    expect(invalidCanonical).not.toHaveProperty('matrixId')
  })

  it('rejects hostile records and arrays without invoking getters or Proxy traps', () => {
    const resolver = createCompatibilityResolver()
    const input = fixture()
    let getterCalls = 0
    const accessorRequest = { ...input } as Record<string, unknown>
    Object.defineProperty(accessorRequest, 'evaluatedAt', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        return NOW
      },
    })
    expectUnknown(resolver.resolve(accessorRequest), 'invalid-request')
    expect(getterCalls).toBe(0)

    const accessorRevision = structuredClone(input.currentRevision) as Record<string, unknown>
    Object.defineProperty(accessorRevision, 'digest', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        return input.currentRevision.digest
      },
    })
    expectUnknown(
      resolver.resolve({ ...input, currentRevision: accessorRevision }),
      'invalid-request',
    )
    expect(getterCalls).toBe(0)

    let trapCalls = 0
    const requestProxy = new Proxy({ ...input }, {
      get() {
        trapCalls += 1
        throw new Error('request proxy trap must not run')
      },
    })
    expectUnknown(resolver.resolve(requestProxy), 'invalid-request')
    expect(trapCalls).toBe(0)

    const policyArrayProxy = new Proxy([...input.target.actionPolicies], {
      get() {
        trapCalls += 1
        throw new Error('array proxy trap must not run')
      },
    })
    expectUnknown(
      resolver.resolve({
        ...input,
        target: { ...input.target, actionPolicies: policyArrayProxy },
      }),
      'target-invalid',
    )
    expect(trapCalls).toBe(0)

    const nestedProxy = new Proxy(structuredClone(input.target.provider), {
      ownKeys() {
        trapCalls += 1
        throw new Error('nested proxy trap must not run')
      },
    })
    expectUnknown(
      resolver.resolve({ ...input, target: { ...input.target, provider: nestedProxy } }),
      'target-invalid',
    )
    expect(trapCalls).toBe(0)

    const withSymbol = { ...input, [Symbol('hidden')]: true }
    expectUnknown(resolver.resolve(withSymbol), 'invalid-request')

    const withHidden = { ...input }
    Object.defineProperty(withHidden, 'hidden', { value: true, enumerable: false })
    expectUnknown(resolver.resolve(withHidden), 'invalid-request')

    const sparseTarget = structuredClone(input.target) as unknown as {
      actionPolicies: unknown[]
    }
    sparseTarget.actionPolicies = new Array(1)
    expectUnknown(resolver.resolve({ ...input, target: sparseTarget }), 'target-invalid')

    const indexAccessorTarget = structuredClone(input.target)
    const indexAccessorPolicies = [...indexAccessorTarget.actionPolicies]
    Object.defineProperty(indexAccessorPolicies, '0', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        return input.target.actionPolicies[0]
      },
    })
    Reflect.set(indexAccessorTarget, 'actionPolicies', indexAccessorPolicies)
    expectUnknown(
      resolver.resolve({ ...input, target: indexAccessorTarget }),
      'target-invalid',
    )
    expect(getterCalls).toBe(0)

    if (input.matrix.kind !== 'available') throw new Error('Expected available matrix.')
    const matrixAccessor = structuredClone(input.matrix) as unknown as Record<string, unknown>
    Object.defineProperty(matrixAccessor, 'matrixId', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        return input.matrix.kind === 'available' ? input.matrix.matrixId : ''
      },
    })
    expectUnknown(
      resolver.resolve({ ...input, matrix: matrixAccessor }),
      'matrix-artifact-invalid',
    )
    expect(getterCalls).toBe(0)

    const revocationAccessor = {
      matrixId: input.matrix.matrixId,
      revokedAt: '2026-09-28T11:00:00Z',
      reasonCode: 'publisher-revoked',
    }
    Object.defineProperty(revocationAccessor, 'reasonCode', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        return 'publisher-revoked'
      },
    })
    expectUnknown(
      resolver.resolve({
        ...input,
        matrix: { ...input.matrix, revocations: [revocationAccessor] },
      }),
      'matrix-artifact-invalid',
    )
    expect(getterCalls).toBe(0)

    const revoked = Proxy.revocable(structuredClone(input.inventory), {})
    revoked.revoke()
    expectUnknown(resolver.resolve({ ...input, inventory: revoked.proxy }), 'inventory-invalid')
  })

  it('is deterministic, leaves inputs mutable, and detaches returned results from later mutation', () => {
    const resolver = createCompatibilityResolver()
    const input = structuredClone(fixture())
    const before = structuredClone(input)

    const first = resolver.resolve(input)
    const second = resolver.resolve(input)

    expect(first).toEqual(second)
    expect(input).toEqual(before)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(input.target)).toBe(false)
    expect(Object.isFrozen(input.matrix)).toBe(false)

    if (input.matrix.kind !== 'available') throw new Error('Expected available matrix.')
    Reflect.set(input.target.provider, 'identity', 'provider:caller-mutated')
    Reflect.set(input.inventory.capabilities[0]!, 'version', 'caller-mutated')
    Reflect.set(input.matrix, 'matrixId', 'caller-mutated')

    expect(first).toEqual(second)
    expect(Object.isFrozen(first)).toBe(true)
  })

  it('keeps the kernel free from runtime, product, persistence, clock, and network imports', () => {
    const source = readFileSync(
      new URL('../src/security/compatibility.ts', import.meta.url),
      'utf8',
    )

    const importSpecifiers = [...source.matchAll(
      /(?:from\s+|import\s*)['"]([^'"]+)['"]/gu,
    )].map((match) => match[1])
    expect(importSpecifiers).toEqual([
      'node:crypto',
      'node:util',
      '../domain/business-matter.js',
    ])
    expect(source).toMatch(/import type \{[\s\S]*?from '\.\.\/domain\/business-matter\.js'/u)
    expect(source).not.toMatch(/\bimport\s*\(|\brequire\s*\(|process\.env|Date\.now|\bfetch\s*\(/u)
  })
})

const V2_NOW = '2026-09-28T12:00:00Z'
const GOLDEN_V2_TARGET_SEMANTIC_DIGEST = 'urn:sage:target-semantic:sha256:ea9bc227ce516654d0a149092db55a34cd32131351419662715a7d61cbac188d'
const GOLDEN_V2_CHANGED_TARGET_SEMANTIC_DIGEST = 'urn:sage:target-semantic:sha256:48711397170e0895cb43c95c6fb74210c636eda7282276ee60fbb24b5b3108b8'
const GOLDEN_V2_TARGET_EVIDENCE_DIGEST = 'urn:sage:target-evidence:sha256:fc1bd3d121af4f373d6a28276aafd374f438382879bffa6764f09f8b07b24a9a'
const GOLDEN_V2_CHANGED_TARGET_EVIDENCE_DIGEST = 'urn:sage:target-evidence:sha256:6ec6040d72023b8a14926589b13ccd038fc05f79bd02c33f158b9227b90e5d86'
const GOLDEN_V2_RUNTIME_DESCRIPTOR_DIGEST = 'urn:sage:runtime-descriptor:sha256:82fcb655664963cb1f78c0e0ec11b0dae167cf7e24d9d48fff5bc6b4407485e2'
const GOLDEN_V2_CHANGED_RUNTIME_DESCRIPTOR_DIGEST = 'urn:sage:runtime-descriptor:sha256:74e170f649c44e394a7a839d4488d2b0d4ecf91248c6f0aa2359f6cfe439f5e8'
const GOLDEN_V2_INVENTORY_EVIDENCE_DIGEST = 'urn:sage:inventory-evidence:sha256:bd5caa8055926f78cad8a2657591069f0ba5565271698dbffbd1ceda26a2fb9f'
const GOLDEN_V2_CHANGED_INVENTORY_EVIDENCE_DIGEST = 'urn:sage:inventory-evidence:sha256:6fc1b7264b32f7e3adc9963d93f170c0f3ce4ac649f6deda9c3a6a46d9958d46'
const GOLDEN_V2_CANONICAL_MATRIX = '{"schemaVersion":"sage.compatibility-matrix.v2","canonicalizationVersion":"sage.compatibility-canonical-json.v2","semanticVersion":"2.0.0","targetContractVersion":"sage.compatibility-target-semantic.v2","runtimeContractVersion":"sage.runtime-descriptor.v2","issuer":{"identity":"authority:sage-compatibility","version":"2.0.0","digest":"sha256:1111111111111111111111111111111111111111111111111111111111111111"},"validFrom":"2026-09-28T00:00:00Z","expiresAt":"2026-09-29T00:00:00Z","rules":[{"ruleId":"rule:fixture-equivalent-v2","targetSemanticDigest":"urn:sage:target-semantic:sha256:ea9bc227ce516654d0a149092db55a34cd32131351419662715a7d61cbac188d","runtimeDescriptorDigest":"urn:sage:runtime-descriptor:sha256:82fcb655664963cb1f78c0e0ec11b0dae167cf7e24d9d48fff5bc6b4407485e2","outcome":"equivalent","reasonCode":"fixture-exact-stable-pair","reason":"The reviewed stable target and runtime descriptor are an approved exact pair."}]}'
const GOLDEN_V2_MATRIX_ID = 'urn:sage:compatibility-matrix:sha256:e7e5b7239018b535574e78461ffc94146a0654959428485154edb64459347e52'

function innerDigestV2(hexDigit: string): string {
  return `sha256:${hexDigit.repeat(64)}`
}

function differentDigestV2(digest: string): string {
  return `${digest.slice(0, -1)}${digest.endsWith('0') ? '1' : '0'}`
}

const TARGET_SEMANTIC_BODY_V2: CompatibilityTargetSemanticBodyV2 = {
  schemaVersion: 'sage.compatibility-target-semantic.v2',
  canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
  actionPolicies: [
    {
      actionScope: 'catalog.publish',
      effectClass: 'external-write',
      requiresDecision: true,
    },
    {
      actionScope: 'catalog.prepare-draft',
      effectClass: 'local-write',
      requiresDecision: false,
    },
  ],
  permissionPolicyDigest: innerDigestV2('1'),
  dataDestinationPolicyDigest: innerDigestV2('2'),
  provider: {
    identity: 'provider:sage-fixture',
    version: '1.0.0',
    artifactDigest: innerDigestV2('3'),
    contractDigest: innerDigestV2('4'),
    behaviorConfigurationDigest: innerDigestV2('5'),
  },
  model: {
    identity: 'model:sage-fixture',
    version: '2026-09-01',
    artifactDigest: innerDigestV2('6'),
    contractDigest: innerDigestV2('7'),
    behaviorConfigurationDigest: innerDigestV2('8'),
  },
  agent: {
    identity: 'agent:sage-catalog',
    version: '1.2.0',
    artifactDigest: innerDigestV2('9'),
    contractDigest: innerDigestV2('a'),
    behaviorConfigurationDigest: innerDigestV2('b'),
  },
  preset: {
    identity: 'preset:sage-catalog',
    version: '3.0.0',
    artifactDigest: innerDigestV2('c'),
    contractDigest: innerDigestV2('d'),
    behaviorConfigurationDigest: innerDigestV2('e'),
  },
  capabilities: [
    {
      identity: 'capability:shopify-write',
      version: '2.0.0',
      artifactDigest: innerDigestV2('f'),
      contractDigest: innerDigestV2('0'),
      behaviorConfigurationDigest: innerDigestV2('1'),
      registryDescriptorDigest: innerDigestV2('2'),
      adapterMappingDigest: innerDigestV2('3'),
    },
    {
      identity: 'capability:catalog-read',
      version: '1.0.0',
      artifactDigest: innerDigestV2('4'),
      contractDigest: innerDigestV2('5'),
      behaviorConfigurationDigest: innerDigestV2('6'),
      registryDescriptorDigest: innerDigestV2('7'),
      adapterMappingDigest: innerDigestV2('8'),
    },
  ],
  protocolContractDigest: innerDigestV2('9'),
  launchPolicyDigest: innerDigestV2('a'),
  overlayPolicyDigest: innerDigestV2('b'),
}

const RUNTIME_DESCRIPTOR_BODY_V2: RuntimeDescriptorBodyV2 = {
  schemaVersion: 'sage.runtime-descriptor.v2',
  canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
  host: {
    identity: 'host:sage-desktop',
    version: '0.1.0',
    artifactDigest: innerDigestV2('c'),
    contractDigest: innerDigestV2('d'),
    behaviorConfigurationDigest: innerDigestV2('e'),
  },
  harness: {
    identity: 'harness:sage-runtime',
    version: '0.1.5-rc.2',
    artifactDigest: innerDigestV2('f'),
    contractDigest: innerDigestV2('0'),
    behaviorConfigurationDigest: innerDigestV2('1'),
  },
  provider: TARGET_SEMANTIC_BODY_V2.provider,
  model: TARGET_SEMANTIC_BODY_V2.model,
  agent: TARGET_SEMANTIC_BODY_V2.agent,
  preset: TARGET_SEMANTIC_BODY_V2.preset,
  capabilities: TARGET_SEMANTIC_BODY_V2.capabilities,
  protocolContractDigest: TARGET_SEMANTIC_BODY_V2.protocolContractDigest,
  launchPolicyDigest: TARGET_SEMANTIC_BODY_V2.launchPolicyDigest,
  overlayPolicyDigest: TARGET_SEMANTIC_BODY_V2.overlayPolicyDigest,
}

function sealTargetSemanticV2(
  body: CompatibilityTargetSemanticBodyV2,
): CompatibilityTargetSemanticV2 {
  return {
    ...body,
    targetSemanticDigest: computeTargetSemanticDigestV2(body),
  }
}

function targetEvidenceBodyV2(
  targetSemantic: CompatibilityTargetSemanticV2,
): CompatibilityTargetEvidenceBodyV2 {
  return {
    schemaVersion: 'sage.compatibility-target-evidence.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    targetSemanticDigest: targetSemantic.targetSemanticDigest,
    matterId: 'matter:catalog-001',
    revisionId: 'revision:catalog-002',
    revisionDigest: innerDigestV2('2'),
    actionScope: 'catalog.publish',
    actionIntentDigest: innerDigestV2('3'),
    organizationBoundaryDigest: innerDigestV2('4'),
    accountBoundaryDigest: innerDigestV2('5'),
    resourceBoundaryDigest: innerDigestV2('6'),
    decisionDigest: innerDigestV2('7'),
    attemptId: 'attempt:catalog-001',
    issuedAt: '2026-09-28T11:58:00Z',
    targetProviderProvenanceDigest: innerDigestV2('8'),
  }
}

function sealTargetEvidenceV2(
  body: CompatibilityTargetEvidenceBodyV2,
): CompatibilityTargetEvidenceV2 {
  return {
    ...body,
    targetEvidenceDigest: computeTargetEvidenceDigestV2(body),
  }
}

function sealRuntimeDescriptorV2(body: RuntimeDescriptorBodyV2): RuntimeDescriptorV2 {
  return {
    ...body,
    runtimeDescriptorDigest: computeRuntimeDescriptorDigestV2(body),
  }
}

function inventoryEvidenceBodyV2(
  runtimeDescriptor: RuntimeDescriptorV2,
): RuntimeInventoryEvidenceBodyV2 {
  return {
    schemaVersion: 'sage.runtime-inventory-evidence.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    runtimeDescriptorDigest: runtimeDescriptor.runtimeDescriptorDigest,
    activeGeneration: 'fixture-generation-17',
    receiptDigest: innerDigestV2('9'),
    materializationInstanceDigest: innerDigestV2('a'),
    artifactAttestationDigest: innerDigestV2('b'),
    registrySnapshotDigest: innerDigestV2('c'),
    bootId: 'boot:sage-fixture-001',
    runtimeGeneration: 23,
    observedAt: '2026-09-28T11:59:00Z',
    expiresAt: '2026-09-28T12:05:00Z',
    healthObservationDigest: innerDigestV2('d'),
    livenessObservationDigest: innerDigestV2('e'),
    instanceAuthorityDigest: innerDigestV2('f'),
    mainObservationProvenanceDigest: innerDigestV2('0'),
  }
}

function sealInventoryEvidenceV2(
  body: RuntimeInventoryEvidenceBodyV2,
): RuntimeInventoryEvidenceV2 {
  return {
    ...body,
    inventoryEvidenceDigest: computeInventoryEvidenceDigestV2(body),
  }
}

function ruleV2(
  targetSemantic: CompatibilityTargetSemanticV2,
  runtimeDescriptor: RuntimeDescriptorV2,
  overrides: Partial<CompatibilityMatrixRuleV2> = {},
): CompatibilityMatrixRuleV2 {
  return {
    ruleId: 'rule:fixture-equivalent-v2',
    targetSemanticDigest: targetSemantic.targetSemanticDigest,
    runtimeDescriptorDigest: runtimeDescriptor.runtimeDescriptorDigest,
    outcome: 'equivalent',
    reasonCode: 'fixture-exact-stable-pair',
    reason: 'The reviewed stable target and runtime descriptor are an approved exact pair.',
    ...overrides,
  }
}

function matrixV2(rules: readonly CompatibilityMatrixRuleV2[]): CompatibilityMatrixV2 {
  return {
    schemaVersion: 'sage.compatibility-matrix.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    semanticVersion: '2.0.0',
    targetContractVersion: 'sage.compatibility-target-semantic.v2',
    runtimeContractVersion: 'sage.runtime-descriptor.v2',
    issuer: {
      identity: 'authority:sage-compatibility',
      version: '2.0.0',
      digest: innerDigestV2('1'),
    },
    validFrom: '2026-09-28T00:00:00Z',
    expiresAt: '2026-09-29T00:00:00Z',
    rules,
  }
}

function availableV2(
  artifact: CompatibilityMatrixV2,
  revocations: CompatibilityMatrixV2Available['revocations'] = [],
): CompatibilityMatrixV2Available {
  const canonicalMatrix = canonicalizeCompatibilityMatrixV2(artifact)
  return {
    kind: 'available',
    matrixId: computeCompatibilityMatrixIdV2(canonicalMatrix),
    canonicalMatrix,
    providerProvenanceDigest: innerDigestV2('2'),
    revocations,
  }
}

function fixtureV2(): CompatibilityResolveInputV2 {
  const targetSemantic = sealTargetSemanticV2(structuredClone(TARGET_SEMANTIC_BODY_V2))
  const targetEvidence = sealTargetEvidenceV2(targetEvidenceBodyV2(targetSemantic))
  const runtimeDescriptor = sealRuntimeDescriptorV2(structuredClone(RUNTIME_DESCRIPTOR_BODY_V2))
  const inventoryEvidence = sealInventoryEvidenceV2(
    inventoryEvidenceBodyV2(runtimeDescriptor),
  )
  return {
    evaluatedAt: V2_NOW,
    currentRevision: {
      matterId: targetEvidence.matterId,
      revisionId: targetEvidence.revisionId,
      digest: targetEvidence.revisionDigest,
    },
    targetSemantic,
    targetEvidence,
    runtimeDescriptor,
    inventoryEvidence,
    matrix: availableV2(matrixV2([ruleV2(targetSemantic, runtimeDescriptor)])),
  }
}

function expectUnknownV2(
  resolution: CompatibilityResolutionV2,
  code: CompatibilityUnknownCodeV2,
): void {
  expect(resolution.outcome).toBe('unknown')
  if (resolution.outcome !== 'unknown') throw new Error('Expected an unknown V2 resolution.')
  expect(resolution.code).toBe(code)
  expect(Object.isFrozen(resolution)).toBe(true)
}

function withRawMatrixV2(
  input: CompatibilityResolveInputV2,
  artifact: CompatibilityMatrixV2,
  revocations: CompatibilityMatrixV2Available['revocations'] = [],
): CompatibilityResolveInputV2 {
  return {
    ...input,
    matrix: availableV2(artifact, revocations),
  }
}

describe('WT-02C.1B compatibility resolver v2', () => {
  it('pins ten V2 canonical and digest golden observations without changing the V1 vectors', () => {
    const input = fixtureV2()
    const changedTargetSemanticBody: CompatibilityTargetSemanticBodyV2 = {
      ...TARGET_SEMANTIC_BODY_V2,
      permissionPolicyDigest: innerDigestV2('0'),
    }
    const changedTargetSemantic = sealTargetSemanticV2(changedTargetSemanticBody)
    const changedTargetEvidence = sealTargetEvidenceV2({
      ...targetEvidenceBodyV2(input.targetSemantic),
      matterId: 'matter:catalog-002',
      revisionId: 'revision:catalog-003',
      revisionDigest: innerDigestV2('1'),
    })
    const changedRuntimeDescriptor = sealRuntimeDescriptorV2({
      ...RUNTIME_DESCRIPTOR_BODY_V2,
      launchPolicyDigest: innerDigestV2('2'),
    })
    const changedInventoryEvidence = sealInventoryEvidenceV2({
      ...inventoryEvidenceBodyV2(input.runtimeDescriptor),
      bootId: 'boot:sage-fixture-002',
      runtimeGeneration: 24,
      observedAt: '2026-09-28T11:59:30Z',
    })
    if (input.matrix.kind !== 'available') throw new Error('Expected available V2 matrix.')

    expect(input.targetSemantic.targetSemanticDigest).toBe(GOLDEN_V2_TARGET_SEMANTIC_DIGEST)
    expect(changedTargetSemantic.targetSemanticDigest).toBe(
      GOLDEN_V2_CHANGED_TARGET_SEMANTIC_DIGEST,
    )
    expect(input.targetEvidence.targetEvidenceDigest).toBe(GOLDEN_V2_TARGET_EVIDENCE_DIGEST)
    expect(changedTargetEvidence.targetEvidenceDigest).toBe(
      GOLDEN_V2_CHANGED_TARGET_EVIDENCE_DIGEST,
    )
    expect(input.runtimeDescriptor.runtimeDescriptorDigest).toBe(
      GOLDEN_V2_RUNTIME_DESCRIPTOR_DIGEST,
    )
    expect(changedRuntimeDescriptor.runtimeDescriptorDigest).toBe(
      GOLDEN_V2_CHANGED_RUNTIME_DESCRIPTOR_DIGEST,
    )
    expect(input.inventoryEvidence.inventoryEvidenceDigest).toBe(
      GOLDEN_V2_INVENTORY_EVIDENCE_DIGEST,
    )
    expect(changedInventoryEvidence.inventoryEvidenceDigest).toBe(
      GOLDEN_V2_CHANGED_INVENTORY_EVIDENCE_DIGEST,
    )
    expect(input.matrix.canonicalMatrix).toBe(GOLDEN_V2_CANONICAL_MATRIX)
    expect(input.matrix.matrixId).toBe(GOLDEN_V2_MATRIX_ID)
  })

  it('accepts a profile-generation string in V2 inventory evidence', () => {
    const input = fixtureV2()
    const body = inventoryEvidenceBodyV2(input.runtimeDescriptor)
    Reflect.set(body, 'activeGeneration', 'fixture-generation-17')

    expect(() => computeInventoryEvidenceDigestV2(body)).not.toThrow()
  })

  it('rejects a numeric active generation in V2 inventory evidence', () => {
    const input = fixtureV2()
    const body = inventoryEvidenceBodyV2(input.runtimeDescriptor)
    Reflect.set(body, 'activeGeneration', 17)

    expect(() => computeInventoryEvidenceDigestV2(body)).toThrowError(TypeError)
  })

  it.each([
    '',
    '-fixture-generation-17',
    'Fixture-generation-17',
    'fixture_generation-17',
    'fixture/generation-17',
    `g${'a'.repeat(64)}`,
  ])('rejects unsafe V2 active generation %j', (activeGeneration) => {
    const input = fixtureV2()
    const body = inventoryEvidenceBodyV2(input.runtimeDescriptor)
    Reflect.set(body, 'activeGeneration', activeGeneration)

    expect(() => computeInventoryEvidenceDigestV2(body)).toThrowError(TypeError)
  })

  it('rejects runtimeGeneration zero in V2 inventory evidence', () => {
    const input = fixtureV2()
    const body = inventoryEvidenceBodyV2(input.runtimeDescriptor)
    Reflect.set(body, 'activeGeneration', 'fixture-generation-17')
    Reflect.set(body, 'runtimeGeneration', 0)

    expect(() => computeInventoryEvidenceDigestV2(body)).toThrowError(TypeError)
  })

  it('separates reusable stable descriptors from revision, action, boot, and observation evidence', () => {
    const input = fixtureV2()
    const movedTarget = sealTargetEvidenceV2({
      ...targetEvidenceBodyV2(input.targetSemantic),
      matterId: 'matter:catalog-099',
      revisionId: 'revision:catalog-100',
      revisionDigest: innerDigestV2('3'),
      actionIntentDigest: innerDigestV2('4'),
      attemptId: 'attempt:catalog-099',
      issuedAt: '2026-09-28T11:59:00Z',
    })
    const movedInventory = sealInventoryEvidenceV2({
      ...inventoryEvidenceBodyV2(input.runtimeDescriptor),
      activeGeneration: 'fixture-generation-18',
      receiptDigest: innerDigestV2('5'),
      materializationInstanceDigest: innerDigestV2('6'),
      bootId: 'boot:sage-fixture-099',
      runtimeGeneration: 99,
      observedAt: '2026-09-28T11:59:30Z',
      expiresAt: '2026-09-28T12:06:00Z',
    })

    expect(movedTarget.targetSemanticDigest).toBe(input.targetSemantic.targetSemanticDigest)
    expect(movedTarget.targetEvidenceDigest).not.toBe(input.targetEvidence.targetEvidenceDigest)
    expect(movedInventory.runtimeDescriptorDigest).toBe(
      input.runtimeDescriptor.runtimeDescriptorDigest,
    )
    expect(movedInventory.inventoryEvidenceDigest).not.toBe(
      input.inventoryEvidence.inventoryEvidenceDigest,
    )

    const movedResolution = createCompatibilityResolverV2().resolve({
      ...input,
      currentRevision: {
        matterId: movedTarget.matterId,
        revisionId: movedTarget.revisionId,
        digest: movedTarget.revisionDigest,
      },
      targetEvidence: movedTarget,
      inventoryEvidence: movedInventory,
    })
    expect(movedResolution.outcome).toBe('equivalent')
    if (movedResolution.outcome !== 'equivalent') {
      throw new Error('Expected the same reviewed stable pair to remain equivalent.')
    }
    expect(movedResolution.binding.targetEvidenceDigest).toBe(movedTarget.targetEvidenceDigest)
    expect(movedResolution.binding.inventoryEvidenceDigest).toBe(
      movedInventory.inventoryEvidenceDigest,
    )
  })

  it('changes stable digests for every security-relevant target and runtime semantic class', () => {
    const targetDigest = computeTargetSemanticDigestV2(TARGET_SEMANTIC_BODY_V2)
    const targetMutations: readonly CompatibilityTargetSemanticBodyV2[] = [
      {
        ...TARGET_SEMANTIC_BODY_V2,
        actionPolicies: TARGET_SEMANTIC_BODY_V2.actionPolicies.map((policy, index) =>
          index === 0 ? { ...policy, effectClass: 'privileged' } : policy,
        ),
      },
      {
        ...TARGET_SEMANTIC_BODY_V2,
        actionPolicies: TARGET_SEMANTIC_BODY_V2.actionPolicies.map((policy, index) =>
          index === 0 ? { ...policy, requiresDecision: false } : policy,
        ),
      },
      { ...TARGET_SEMANTIC_BODY_V2, permissionPolicyDigest: innerDigestV2('0') },
      { ...TARGET_SEMANTIC_BODY_V2, dataDestinationPolicyDigest: innerDigestV2('1') },
      {
        ...TARGET_SEMANTIC_BODY_V2,
        provider: { ...TARGET_SEMANTIC_BODY_V2.provider, version: '1.0.1' },
      },
      {
        ...TARGET_SEMANTIC_BODY_V2,
        model: { ...TARGET_SEMANTIC_BODY_V2.model, artifactDigest: innerDigestV2('2') },
      },
      {
        ...TARGET_SEMANTIC_BODY_V2,
        agent: { ...TARGET_SEMANTIC_BODY_V2.agent, contractDigest: innerDigestV2('3') },
      },
      {
        ...TARGET_SEMANTIC_BODY_V2,
        preset: {
          ...TARGET_SEMANTIC_BODY_V2.preset,
          behaviorConfigurationDigest: innerDigestV2('4'),
        },
      },
      {
        ...TARGET_SEMANTIC_BODY_V2,
        capabilities: TARGET_SEMANTIC_BODY_V2.capabilities.map((capability, index) =>
          index === 0
            ? { ...capability, registryDescriptorDigest: innerDigestV2('5') }
            : capability,
        ),
      },
      {
        ...TARGET_SEMANTIC_BODY_V2,
        capabilities: TARGET_SEMANTIC_BODY_V2.capabilities.map((capability, index) =>
          index === 0
            ? { ...capability, adapterMappingDigest: innerDigestV2('6') }
            : capability,
        ),
      },
      { ...TARGET_SEMANTIC_BODY_V2, protocolContractDigest: innerDigestV2('7') },
      { ...TARGET_SEMANTIC_BODY_V2, launchPolicyDigest: innerDigestV2('8') },
      { ...TARGET_SEMANTIC_BODY_V2, overlayPolicyDigest: innerDigestV2('9') },
    ]
    for (const mutation of targetMutations) {
      expect(computeTargetSemanticDigestV2(mutation)).not.toBe(targetDigest)
    }

    const runtimeDigest = computeRuntimeDescriptorDigestV2(RUNTIME_DESCRIPTOR_BODY_V2)
    const runtimeMutations: readonly RuntimeDescriptorBodyV2[] = [
      {
        ...RUNTIME_DESCRIPTOR_BODY_V2,
        host: { ...RUNTIME_DESCRIPTOR_BODY_V2.host, version: '0.1.1' },
      },
      {
        ...RUNTIME_DESCRIPTOR_BODY_V2,
        harness: {
          ...RUNTIME_DESCRIPTOR_BODY_V2.harness,
          artifactDigest: innerDigestV2('a'),
        },
      },
      {
        ...RUNTIME_DESCRIPTOR_BODY_V2,
        provider: {
          ...RUNTIME_DESCRIPTOR_BODY_V2.provider,
          behaviorConfigurationDigest: innerDigestV2('b'),
        },
      },
      {
        ...RUNTIME_DESCRIPTOR_BODY_V2,
        capabilities: RUNTIME_DESCRIPTOR_BODY_V2.capabilities.map((capability, index) =>
          index === 0
            ? { ...capability, registryDescriptorDigest: innerDigestV2('c') }
            : capability,
        ),
      },
      { ...RUNTIME_DESCRIPTOR_BODY_V2, protocolContractDigest: innerDigestV2('d') },
      { ...RUNTIME_DESCRIPTOR_BODY_V2, launchPolicyDigest: innerDigestV2('e') },
      { ...RUNTIME_DESCRIPTOR_BODY_V2, overlayPolicyDigest: innerDigestV2('f') },
    ]
    for (const mutation of runtimeMutations) {
      expect(computeRuntimeDescriptorDigestV2(mutation)).not.toBe(runtimeDigest)
    }

    const baseTarget = sealTargetSemanticV2(structuredClone(TARGET_SEMANTIC_BODY_V2))
    const changedTarget = sealTargetSemanticV2(targetMutations[0]!)
    expect(changedTarget.targetSemanticDigest).not.toBe(baseTarget.targetSemanticDigest)
    expect(
      sealTargetEvidenceV2(targetEvidenceBodyV2(changedTarget)).targetEvidenceDigest,
    ).not.toBe(
      sealTargetEvidenceV2(targetEvidenceBodyV2(baseTarget)).targetEvidenceDigest,
    )

    const baseRuntime = sealRuntimeDescriptorV2(structuredClone(RUNTIME_DESCRIPTOR_BODY_V2))
    const changedRuntime = sealRuntimeDescriptorV2(runtimeMutations[0]!)
    expect(changedRuntime.runtimeDescriptorDigest).not.toBe(
      baseRuntime.runtimeDescriptorDigest,
    )
    expect(
      sealInventoryEvidenceV2(inventoryEvidenceBodyV2(changedRuntime))
        .inventoryEvidenceDigest,
    ).not.toBe(
      sealInventoryEvidenceV2(inventoryEvidenceBodyV2(baseRuntime))
        .inventoryEvidenceDigest,
    )
  })

  it('canonicalizes set-like policy, capability, and rule arrays without mutating callers', () => {
    const target = structuredClone(TARGET_SEMANTIC_BODY_V2)
    const targetBefore = structuredClone(target)
    const targetReordered: CompatibilityTargetSemanticBodyV2 = {
      ...target,
      actionPolicies: [...target.actionPolicies].reverse(),
      capabilities: [...target.capabilities].reverse(),
    }
    expect(computeTargetSemanticDigestV2(targetReordered)).toBe(
      computeTargetSemanticDigestV2(target),
    )
    expect(target).toEqual(targetBefore)

    const runtime = structuredClone(RUNTIME_DESCRIPTOR_BODY_V2)
    const runtimeBefore = structuredClone(runtime)
    expect(computeRuntimeDescriptorDigestV2({
      ...runtime,
      capabilities: [...runtime.capabilities].reverse(),
    })).toBe(computeRuntimeDescriptorDigestV2(runtime))
    expect(runtime).toEqual(runtimeBefore)

    const input = fixtureV2()
    const secondRule = ruleV2(input.targetSemantic, input.runtimeDescriptor, {
      ruleId: 'rule:fixture-new-revision-v2',
      targetSemanticDigest: differentDigestV2(input.targetSemantic.targetSemanticDigest),
      outcome: 'requires-new-revision',
      reasonCode: 'reviewed-semantic-change',
      reason: 'The alternate stable target requires a new revision.',
    })
    const firstRule = ruleV2(input.targetSemantic, input.runtimeDescriptor)
    const forward = matrixV2([firstRule, secondRule])
    const reverse = matrixV2([secondRule, firstRule])
    expect(canonicalizeCompatibilityMatrixV2(forward)).toBe(
      canonicalizeCompatibilityMatrixV2(reverse),
    )
    expect(computeCompatibilityMatrixIdV2(canonicalizeCompatibilityMatrixV2(forward))).toBe(
      computeCompatibilityMatrixIdV2(canonicalizeCompatibilityMatrixV2(reverse)),
    )
  })

  it('returns a frozen equivalent result with the exact full and stable evaluation binding', () => {
    const input = fixtureV2()
    const resolution = createCompatibilityResolverV2().resolve(input)
    if (input.matrix.kind !== 'available') throw new Error('Expected available V2 matrix.')

    expect(resolution).toEqual({
      outcome: 'equivalent',
      code: 'exact-match',
      reasonCode: 'fixture-exact-stable-pair',
      reason: 'The reviewed stable target and runtime descriptor are an approved exact pair.',
      binding: {
        evaluatedAt: input.evaluatedAt,
        actionScope: input.targetEvidence.actionScope,
        matrixId: input.matrix.matrixId,
        matchedRuleId: 'rule:fixture-equivalent-v2',
        targetSemanticDigest: input.targetSemantic.targetSemanticDigest,
        targetEvidenceDigest: input.targetEvidence.targetEvidenceDigest,
        runtimeDescriptorDigest: input.runtimeDescriptor.runtimeDescriptorDigest,
        inventoryEvidenceDigest: input.inventoryEvidence.inventoryEvidenceDigest,
        matrixProviderProvenanceDigest: input.matrix.providerProvenanceDigest,
      },
    })
    expect(resolveCompatibilityV2(input)).toEqual(resolution)
    expect(Object.isFrozen(resolution)).toBe(true)
    if (resolution.outcome !== 'equivalent') throw new Error('Expected equivalent V2 result.')
    expect(Object.isFrozen(resolution.binding)).toBe(true)
  })

  it('returns requires-new-revision only for one explicit exact stable-pair rule', () => {
    const input = fixtureV2()
    const changedMatrix = matrixV2([
      ruleV2(input.targetSemantic, input.runtimeDescriptor, {
        ruleId: 'rule:fixture-revision-v2',
        outcome: 'requires-new-revision',
        reasonCode: 'reviewed-semantic-change',
        reason: 'The reviewed pair requires a new BusinessMatter revision.',
      }),
    ])
    const resolution = createCompatibilityResolverV2().resolve(withRawMatrixV2(input, changedMatrix))
    expect(resolution.outcome).toBe('requires-new-revision')
    if (resolution.outcome !== 'requires-new-revision') {
      throw new Error('Expected requires-new-revision V2 result.')
    }
    expect(resolution.code).toBe('semantic-change')
    expect(resolution.reasonCode).toBe('reviewed-semantic-change')
    expect(resolution.binding.matchedRuleId).toBe('rule:fixture-revision-v2')
  })

  it('fails closed on zero matches and never falls back across the V1/V2 boundary', () => {
    const resolverV2 = createCompatibilityResolverV2()
    const input = fixtureV2()
    const offPairMatrix = matrixV2([
      ruleV2(input.targetSemantic, input.runtimeDescriptor, {
        targetSemanticDigest: differentDigestV2(input.targetSemantic.targetSemanticDigest),
      }),
    ])
    expectUnknownV2(
      resolverV2.resolve(withRawMatrixV2(input, offPairMatrix)),
      'no-matching-rule',
    )

    const v1Resolution = createCompatibilityResolver().resolve(input)
    expect(v1Resolution.outcome).toBe('unknown')
    if (v1Resolution.outcome !== 'unknown') throw new Error('V1 must reject V2 input.')
    expect(v1Resolution.code).toBe('invalid-request')

    expectUnknownV2(resolverV2.resolve(fixture()), 'invalid-request')

    const mixed = structuredClone(input) as unknown as Record<string, unknown>
    Reflect.set(mixed, 'fallbackMatrix', fixture().matrix)
    expectUnknownV2(resolverV2.resolve(mixed), 'invalid-request')
  })

  it('detects independently forged stable and full digests before matrix lookup', () => {
    const resolver = createCompatibilityResolverV2()
    const input = fixtureV2()

    expectUnknownV2(
      resolver.resolve({
        ...input,
        targetSemantic: {
          ...input.targetSemantic,
          targetSemanticDigest: differentDigestV2(input.targetSemantic.targetSemanticDigest),
        },
      }),
      'target-semantic-digest-mismatch',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        targetEvidence: {
          ...input.targetEvidence,
          targetEvidenceDigest: differentDigestV2(input.targetEvidence.targetEvidenceDigest),
        },
      }),
      'target-evidence-digest-mismatch',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        runtimeDescriptor: {
          ...input.runtimeDescriptor,
          runtimeDescriptorDigest: differentDigestV2(
            input.runtimeDescriptor.runtimeDescriptorDigest,
          ),
        },
      }),
      'runtime-descriptor-digest-mismatch',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        inventoryEvidence: {
          ...input.inventoryEvidence,
          inventoryEvidenceDigest: differentDigestV2(
            input.inventoryEvidence.inventoryEvidenceDigest,
          ),
        },
      }),
      'inventory-evidence-digest-mismatch',
    )

    const forgedTargetLink = sealTargetEvidenceV2({
      ...targetEvidenceBodyV2(input.targetSemantic),
      targetSemanticDigest: differentDigestV2(input.targetSemantic.targetSemanticDigest),
    })
    expectUnknownV2(
      resolver.resolve({ ...input, targetEvidence: forgedTargetLink }),
      'target-stable-binding-mismatch',
    )

    const forgedRuntimeLink = sealInventoryEvidenceV2({
      ...inventoryEvidenceBodyV2(input.runtimeDescriptor),
      runtimeDescriptorDigest: differentDigestV2(input.runtimeDescriptor.runtimeDescriptorDigest),
    })
    expectUnknownV2(
      resolver.resolve({ ...input, inventoryEvidence: forgedRuntimeLink }),
      'runtime-stable-binding-mismatch',
    )

    expectUnknownV2(
      resolver.resolve({
        ...input,
        currentRevision: {
          ...input.currentRevision,
          revisionId: 'revision:stale',
        },
      }),
      'target-not-current',
    )
  })

  it('accepts only exact SemVer or valid calendar versions at every V2 version entry point', () => {
    const resolver = createCompatibilityResolverV2()
    const input = fixtureV2()
    const invalidVersions = [
      '1.x',
      '*',
      '^1.2.3',
      '~1.2.0',
      '>=1.2.0',
      '1 || 2',
      'latest',
      'main',
      'production',
      'release',
      '2026-02-30',
    ] as const

    for (const version of invalidVersions) {
      const target = structuredClone(input.targetSemantic)
      Reflect.set(target.provider, 'version', version)
      expectUnknownV2(
        resolver.resolve({ ...input, targetSemantic: target }),
        'target-semantic-invalid',
      )
      expect(() =>
        computeTargetSemanticDigestV2({
          ...TARGET_SEMANTIC_BODY_V2,
          provider: { ...TARGET_SEMANTIC_BODY_V2.provider, version },
        }),
      ).toThrow(TypeError)
    }

    const runtime = structuredClone(input.runtimeDescriptor)
    Reflect.set(runtime.host, 'version', '^0.1.0')
    expectUnknownV2(
      resolver.resolve({ ...input, runtimeDescriptor: runtime }),
      'runtime-descriptor-invalid',
    )

    if (input.matrix.kind !== 'available') throw new Error('Expected available V2 matrix.')
    const artifact = JSON.parse(input.matrix.canonicalMatrix) as CompatibilityMatrixV2
    const invalidIssuerArtifact = {
      ...artifact,
      issuer: { ...artifact.issuer, version: 'release' },
    }
    const canonicalMatrix = JSON.stringify(invalidIssuerArtifact)
    expectUnknownV2(
      resolver.resolve({
        ...input,
        matrix: {
          ...input.matrix,
          canonicalMatrix,
          matrixId: computeCompatibilityMatrixIdV2(canonicalMatrix),
        },
      }),
      'matrix-artifact-invalid',
    )
  })

  it('rejects unknown contract versions, wrong namespaces, undeclared actions, and extra fields', () => {
    const resolver = createCompatibilityResolverV2()
    const input = fixtureV2()

    expectUnknownV2(
      resolver.resolve({
        ...input,
        targetSemantic: {
          ...input.targetSemantic,
          schemaVersion: 'sage.compatibility-target-semantic.v3',
        },
      }),
      'target-semantic-invalid',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        runtimeDescriptor: {
          ...input.runtimeDescriptor,
          canonicalizationVersion: 'sage.compatibility-canonical-json.v3',
        },
      }),
      'runtime-descriptor-invalid',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        targetEvidence: {
          ...input.targetEvidence,
          schemaVersion: 'sage.compatibility-target-evidence.v3',
        },
      }),
      'target-evidence-invalid',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        inventoryEvidence: {
          ...input.inventoryEvidence,
          canonicalizationVersion: 'sage.compatibility-canonical-json.v3',
        },
      }),
      'inventory-evidence-invalid',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        targetSemantic: {
          ...input.targetSemantic,
          targetSemanticDigest: input.runtimeDescriptor.runtimeDescriptorDigest,
        },
      }),
      'target-semantic-invalid',
    )

    const undeclaredAction = sealTargetEvidenceV2({
      ...targetEvidenceBodyV2(input.targetSemantic),
      actionScope: 'catalog.delete-everything',
    })
    expectUnknownV2(
      resolver.resolve({ ...input, targetEvidence: undeclaredAction }),
      'target-action-not-declared',
    )

    const extraFieldTarget = structuredClone(input.targetSemantic) as unknown as Record<
      string,
      unknown
    >
    Reflect.set(extraFieldTarget, 'token', 'secret-must-not-be-classified')
    const extraFieldResult = resolver.resolve({ ...input, targetSemantic: extraFieldTarget })
    expectUnknownV2(extraFieldResult, 'target-semantic-invalid')
    expect(JSON.stringify(extraFieldResult)).not.toContain('secret-must-not-be-classified')

    if (input.matrix.kind !== 'available') throw new Error('Expected available V2 matrix.')
    const artifact = JSON.parse(input.matrix.canonicalMatrix) as CompatibilityMatrixV2
    for (const invalidArtifact of [
      { ...artifact, schemaVersion: 'sage.compatibility-matrix.v3' },
      { ...artifact, semanticVersion: '3.0.0' },
      { ...artifact, targetContractVersion: 'sage.compatibility-target-semantic.v3' },
      { ...artifact, runtimeContractVersion: 'sage.runtime-descriptor.v3' },
    ]) {
      const canonicalMatrix = JSON.stringify(invalidArtifact)
      expectUnknownV2(
        resolver.resolve({
          ...input,
          matrix: {
            ...input.matrix,
            canonicalMatrix,
            matrixId: computeCompatibilityMatrixIdV2(canonicalMatrix),
          },
        }),
        'matrix-artifact-invalid',
      )
    }

    const v1Input = fixture()
    if (v1Input.matrix.kind !== 'available') throw new Error('Expected available V1 matrix.')
    const v1MatrixEnvelope = {
      ...input.matrix,
      matrixId: v1Input.matrix.matrixId,
      canonicalMatrix: v1Input.matrix.canonicalMatrix,
    }
    expectUnknownV2(
      resolver.resolve({ ...input, matrix: v1MatrixEnvelope }),
      'matrix-artifact-invalid',
    )
  })

  it('keeps compound failures in parse, digest, cross-link, current, action, then provider order', () => {
    const resolver = createCompatibilityResolverV2()
    const input = fixtureV2()
    const staleCurrentRevision = { ...input.currentRevision, revisionId: 'revision:stale' }
    const forgedTargetDigest = {
      ...input.targetSemantic,
      targetSemanticDigest: differentDigestV2(input.targetSemantic.targetSemanticDigest),
    }
    const invalidTargetEvidence = structuredClone(input.targetEvidence) as unknown as Record<
      string,
      unknown
    >
    Reflect.set(invalidTargetEvidence, 'unexpected', true)
    const invalidRuntimeDescriptor = structuredClone(input.runtimeDescriptor)
    Reflect.set(invalidRuntimeDescriptor.host, 'version', 'release')
    const invalidInventoryEvidence = structuredClone(input.inventoryEvidence) as unknown as Record<
      string,
      unknown
    >
    Reflect.set(invalidInventoryEvidence, 'unexpected', true)
    const forgedTargetEvidenceDigest = {
      ...input.targetEvidence,
      targetEvidenceDigest: differentDigestV2(input.targetEvidence.targetEvidenceDigest),
    }
    const undeclaredAction = sealTargetEvidenceV2({
      ...targetEvidenceBodyV2(input.targetSemantic),
      actionScope: 'catalog.delete-everything',
    })
    const forgedRuntimeDigest = {
      ...input.runtimeDescriptor,
      runtimeDescriptorDigest: differentDigestV2(
        input.runtimeDescriptor.runtimeDescriptorDigest,
      ),
    }
    const forgedInventoryDigest = {
      ...input.inventoryEvidence,
      inventoryEvidenceDigest: differentDigestV2(
        input.inventoryEvidence.inventoryEvidenceDigest,
      ),
    }
    const forgedRuntimeLink = sealInventoryEvidenceV2({
      ...inventoryEvidenceBodyV2(input.runtimeDescriptor),
      runtimeDescriptorDigest: differentDigestV2(
        input.runtimeDescriptor.runtimeDescriptorDigest,
      ),
    })
    const forgedTargetLink = sealTargetEvidenceV2({
      ...targetEvidenceBodyV2(input.targetSemantic),
      targetSemanticDigest: differentDigestV2(input.targetSemantic.targetSemanticDigest),
    })

    expectUnknownV2(
      resolver.resolve({
        ...input,
        targetSemantic: forgedTargetDigest,
        targetEvidence: invalidTargetEvidence,
      }),
      'target-evidence-invalid',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        targetSemantic: forgedTargetDigest,
        runtimeDescriptor: invalidRuntimeDescriptor,
      }),
      'runtime-descriptor-invalid',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        targetEvidence: forgedTargetEvidenceDigest,
        inventoryEvidence: invalidInventoryEvidence,
      }),
      'inventory-evidence-invalid',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        targetSemantic: forgedTargetDigest,
        inventoryEvidence: invalidInventoryEvidence,
      }),
      'inventory-evidence-invalid',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        currentRevision: staleCurrentRevision,
        runtimeDescriptor: forgedRuntimeDigest,
      }),
      'runtime-descriptor-digest-mismatch',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        targetEvidence: undeclaredAction,
        inventoryEvidence: forgedInventoryDigest,
      }),
      'inventory-evidence-digest-mismatch',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        currentRevision: staleCurrentRevision,
        inventoryEvidence: forgedRuntimeLink,
      }),
      'runtime-stable-binding-mismatch',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        currentRevision: staleCurrentRevision,
        targetEvidence: forgedTargetLink,
      }),
      'target-stable-binding-mismatch',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        runtimeDescriptor: forgedRuntimeDigest,
        matrix: { kind: 'unavailable' },
      }),
      'runtime-descriptor-digest-mismatch',
    )
  })

  it('rejects duplicate identities and action scopes instead of canonicalizing them away', () => {
    const resolver = createCompatibilityResolverV2()
    const input = fixtureV2()
    const duplicateTarget = structuredClone(input.targetSemantic)
    Reflect.set(duplicateTarget, 'capabilities', [
      ...duplicateTarget.capabilities,
      structuredClone(duplicateTarget.capabilities[0]),
    ])
    expectUnknownV2(
      resolver.resolve({ ...input, targetSemantic: duplicateTarget }),
      'target-semantic-invalid',
    )

    const duplicateAction = structuredClone(input.targetSemantic)
    Reflect.set(duplicateAction, 'actionPolicies', [
      ...duplicateAction.actionPolicies,
      structuredClone(duplicateAction.actionPolicies[0]),
    ])
    expectUnknownV2(
      resolver.resolve({ ...input, targetSemantic: duplicateAction }),
      'target-semantic-invalid',
    )

    const duplicateRuntime = structuredClone(input.runtimeDescriptor)
    Reflect.set(duplicateRuntime, 'capabilities', [
      ...duplicateRuntime.capabilities,
      structuredClone(duplicateRuntime.capabilities[0]),
    ])
    expectUnknownV2(
      resolver.resolve({ ...input, runtimeDescriptor: duplicateRuntime }),
      'runtime-descriptor-invalid',
    )
  })

  it('rejects duplicate rule IDs, conflicts, and ambiguities globally without first-match behavior', () => {
    const resolver = createCompatibilityResolverV2()
    const input = fixtureV2()
    const current = ruleV2(input.targetSemantic, input.runtimeDescriptor)
    const offTarget = differentDigestV2(input.targetSemantic.targetSemanticDigest)
    const offRuntime = differentDigestV2(input.runtimeDescriptor.runtimeDescriptorDigest)

    const duplicateRuleId = matrixV2([
      current,
      {
        ...current,
        targetSemanticDigest: offTarget,
        runtimeDescriptorDigest: offRuntime,
      },
    ])
    expectUnknownV2(
      resolver.resolve(withRawMatrixV2(input, duplicateRuleId)),
      'matrix-rule-duplicate',
    )

    const offPathConflict = matrixV2([
      current,
      {
        ...current,
        ruleId: 'rule:off-path-equivalent-v2',
        targetSemanticDigest: offTarget,
        runtimeDescriptorDigest: offRuntime,
      },
      {
        ...current,
        ruleId: 'rule:off-path-new-revision-v2',
        targetSemanticDigest: offTarget,
        runtimeDescriptorDigest: offRuntime,
        outcome: 'requires-new-revision',
        reasonCode: 'off-path-conflict',
      },
    ])
    expectUnknownV2(
      resolver.resolve(withRawMatrixV2(input, offPathConflict)),
      'matrix-rule-conflict',
    )

    const offPathAmbiguity = matrixV2([
      current,
      {
        ...current,
        ruleId: 'rule:off-path-equivalent-a-v2',
        targetSemanticDigest: offTarget,
        runtimeDescriptorDigest: offRuntime,
      },
      {
        ...current,
        ruleId: 'rule:off-path-equivalent-b-v2',
        targetSemanticDigest: offTarget,
        runtimeDescriptorDigest: offRuntime,
      },
    ])
    expectUnknownV2(
      resolver.resolve(withRawMatrixV2(input, offPathAmbiguity)),
      'matrix-rule-ambiguous',
    )
  })

  it('enforces materialized provider, matrix, inventory lifecycle, and revocation evidence', () => {
    const resolver = createCompatibilityResolverV2()
    const input = fixtureV2()
    expectUnknownV2(
      resolver.resolve({ ...input, matrix: { kind: 'unavailable' } }),
      'matrix-provider-unavailable',
    )

    if (input.matrix.kind !== 'available') throw new Error('Expected available V2 matrix.')
    expectUnknownV2(
      resolver.resolve({
        ...input,
        matrix: { ...input.matrix, providerProvenanceDigest: `sha256:${'a'.repeat(63)}` },
      }),
      'matrix-artifact-invalid',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        matrix: { ...input.matrix, canonicalMatrix: `${input.matrix.canonicalMatrix} ` },
      }),
      'matrix-artifact-invalid',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        matrix: { ...input.matrix, matrixId: differentDigestV2(input.matrix.matrixId) },
      }),
      'matrix-id-mismatch',
    )

    const artifact = JSON.parse(input.matrix.canonicalMatrix) as CompatibilityMatrixV2
    expectUnknownV2(
      resolver.resolve(withRawMatrixV2(input, { ...artifact, validFrom: '2026-09-28T12:00:01Z' })),
      'matrix-not-active',
    )
    expectUnknownV2(
      resolver.resolve(withRawMatrixV2(input, { ...artifact, expiresAt: V2_NOW })),
      'matrix-not-active',
    )

    expectUnknownV2(
      resolver.resolve(withRawMatrixV2(input, artifact, [{
        matrixId: input.matrix.matrixId,
        revokedAt: V2_NOW,
        reasonCode: 'publisher-revoked',
        provenanceDigest: innerDigestV2('3'),
      }])),
      'matrix-revoked',
    )
    expect(resolver.resolve(withRawMatrixV2(input, artifact, [{
      matrixId: input.matrix.matrixId,
      revokedAt: '2026-09-28T12:00:01Z',
      reasonCode: 'future-revocation',
      provenanceDigest: innerDigestV2('4'),
    }])).outcome).toBe('equivalent')

    expectUnknownV2(
      resolver.resolve({
        ...input,
        inventoryEvidence: sealInventoryEvidenceV2({
          ...inventoryEvidenceBodyV2(input.runtimeDescriptor),
          observedAt: '2026-09-28T12:00:01Z',
        }),
      }),
      'inventory-not-active',
    )
    expectUnknownV2(
      resolver.resolve({
        ...input,
        inventoryEvidence: sealInventoryEvidenceV2({
          ...inventoryEvidenceBodyV2(input.runtimeDescriptor),
          expiresAt: V2_NOW,
        }),
      }),
      'inventory-not-active',
    )

    const secretRevocation = {
      matrixId: 'urn:sage:compatibility-matrix:sha256:not-a-digest-secret-987',
      revokedAt: V2_NOW,
      reasonCode: 'malformed-secret-revocation',
      provenanceDigest: innerDigestV2('5'),
    }
    const secretResult = resolver.resolve({
      ...input,
      matrix: { ...input.matrix, revocations: [secretRevocation] },
    })
    expectUnknownV2(secretResult, 'matrix-artifact-invalid')
    expect(JSON.stringify(secretResult)).not.toContain('not-a-digest-secret-987')

    expectUnknownV2(
      resolver.resolve({
        ...input,
        matrix: {
          ...input.matrix,
          revocations: [{
            matrixId: input.matrix.matrixId,
            revokedAt: V2_NOW,
            reasonCode: 'malformed-provenance',
            provenanceDigest: `sha256:${'a'.repeat(63)}`,
          }],
        },
      }),
      'matrix-artifact-invalid',
    )
  })

  it('rejects accessors and proxies without invoking hostile getters or traps', () => {
    const resolver = createCompatibilityResolverV2()
    const input = fixtureV2()
    let getterCalls = 0
    let trapCalls = 0

    const targetAccessor = structuredClone(input.targetSemantic) as unknown as Record<
      string,
      unknown
    >
    Object.defineProperty(targetAccessor, 'schemaVersion', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        return 'sage.compatibility-target-semantic.v2'
      },
    })
    expectUnknownV2(
      resolver.resolve({ ...input, targetSemantic: targetAccessor }),
      'target-semantic-invalid',
    )
    expect(getterCalls).toBe(0)

    const policyAccessorTarget = structuredClone(input.targetSemantic)
    const policyArray = [...policyAccessorTarget.actionPolicies]
    Object.defineProperty(policyArray, '0', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        return input.targetSemantic.actionPolicies[0]
      },
    })
    Reflect.set(policyAccessorTarget, 'actionPolicies', policyArray)
    expectUnknownV2(
      resolver.resolve({ ...input, targetSemantic: policyAccessorTarget }),
      'target-semantic-invalid',
    )
    expect(getterCalls).toBe(0)

    const descriptorProxy = new Proxy(structuredClone(input.runtimeDescriptor), {
      get(target, property, receiver) {
        trapCalls += 1
        return Reflect.get(target, property, receiver)
      },
      ownKeys(target) {
        trapCalls += 1
        return Reflect.ownKeys(target)
      },
    })
    expectUnknownV2(
      resolver.resolve({ ...input, runtimeDescriptor: descriptorProxy }),
      'runtime-descriptor-invalid',
    )
    expect(trapCalls).toBe(0)

    if (input.matrix.kind !== 'available') throw new Error('Expected available V2 matrix.')
    const matrixAccessor = structuredClone(input.matrix) as unknown as Record<string, unknown>
    Object.defineProperty(matrixAccessor, 'providerProvenanceDigest', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1
        return input.matrix.kind === 'available'
          ? input.matrix.providerProvenanceDigest
          : innerDigestV2('0')
      },
    })
    expectUnknownV2(
      resolver.resolve({ ...input, matrix: matrixAccessor }),
      'matrix-artifact-invalid',
    )
    expect(getterCalls).toBe(0)

    const revoked = Proxy.revocable(structuredClone(input.inventoryEvidence), {})
    revoked.revoke()
    expectUnknownV2(
      resolver.resolve({ ...input, inventoryEvidence: revoked.proxy }),
      'inventory-evidence-invalid',
    )
  })

  it('is deterministic, preserves mutable caller inputs, and deeply freezes detached results', () => {
    const resolver = createCompatibilityResolverV2()
    const input = structuredClone(fixtureV2())
    const before = structuredClone(input)

    const first = resolver.resolve(input)
    const second = resolver.resolve(input)
    expect(first).toEqual(second)
    expect(input).toEqual(before)
    expect(Object.isFrozen(input)).toBe(false)
    expect(Object.isFrozen(input.targetSemantic)).toBe(false)
    expect(Object.isFrozen(input.inventoryEvidence)).toBe(false)
    expect(Object.isFrozen(input.matrix)).toBe(false)

    if (input.matrix.kind !== 'available') throw new Error('Expected available V2 matrix.')
    Reflect.set(input.targetSemantic.provider, 'identity', 'provider:caller-mutated')
    Reflect.set(input.inventoryEvidence, 'bootId', 'boot:caller-mutated')
    Reflect.set(input.matrix, 'matrixId', 'matrix:caller-mutated')

    expect(first).toEqual(second)
    expect(Object.isFrozen(first)).toBe(true)
    if (first.outcome === 'equivalent' || first.outcome === 'requires-new-revision') {
      expect(Object.isFrozen(first.binding)).toBe(true)
    }
  })

  it('keeps V2 synchronous, materialized-input-only, and behind the existing import firewall', () => {
    const source = readFileSync(
      new URL('../src/security/compatibility.ts', import.meta.url),
      'utf8',
    )
    const importSpecifiers = [...source.matchAll(
      /(?:from\s+|import\s*)['"]([^'"]+)['"]/gu,
    )].map((match) => match[1])
    expect(importSpecifiers).toEqual([
      'node:crypto',
      'node:util',
      '../domain/business-matter.js',
    ])
    expect(source).not.toMatch(
      /\bimport\s*\(|\brequire\s*\(|process\.env|Date\.now|\bfetch\s*\(/u,
    )

    const missingEvaluationTime = structuredClone(fixtureV2()) as unknown as Record<
      string,
      unknown
    >
    Reflect.deleteProperty(missingEvaluationTime, 'evaluatedAt')
    expectUnknownV2(
      createCompatibilityResolverV2().resolve(missingEvaluationTime),
      'invalid-request',
    )
  })
})
