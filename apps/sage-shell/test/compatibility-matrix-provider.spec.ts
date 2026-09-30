import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  canonicalizeCompatibilityMatrixV2,
  computeCompatibilityMatrixIdV2,
  type CompatibilityMatrixV2,
} from '../src/security/compatibility.js'
import {
  canonicalizeCompatibilityMatrixBundleV2,
  canonicalizeCompatibilityMatrixRevocationSourceV2,
  computeCompatibilityMatrixBundleIdV2,
  computeCompatibilityMatrixRevocationSourceIdV2,
  createBundledCompatibilityMatrixProviderV2,
  parseCompatibilityMatrixBundleV2,
  parseCompatibilityMatrixRevocationSourceV2,
  sealCompatibilityMatrixBundleV2,
  sealCompatibilityMatrixRevocationSourceV2,
  toCompatibilityMatrixV2ProviderResult,
  type CompatibilityMatrixBundleBodyV2,
  type CompatibilityMatrixBundleArtifactV2,
  type CompatibilityMatrixRevocationSourceBodyV2,
} from '../src/security/compatibility-matrix-provider.js'

const TARGET_DIGEST = `urn:sage:target-semantic:sha256:${'1'.repeat(64)}`
const RUNTIME_DIGEST = `urn:sage:runtime-descriptor:sha256:${'2'.repeat(64)}`
const SECOND_TARGET_DIGEST = `urn:sage:target-semantic:sha256:${'3'.repeat(64)}`
const SECOND_RUNTIME_DIGEST = `urn:sage:runtime-descriptor:sha256:${'4'.repeat(64)}`
const NOW = '2026-09-29T12:00:00Z'
const CONTENT_ONE = `sha256:${'a'.repeat(64)}`
const CONTENT_TWO = `sha256:${'b'.repeat(64)}`

function matrix(
  targetSemanticDigest = TARGET_DIGEST,
  runtimeDescriptorDigest = RUNTIME_DIGEST,
  validFrom = '2026-09-29T00:00:00Z',
  expiresAt = '2026-09-30T00:00:00Z',
  ruleId = 'rule:sage-current',
): CompatibilityMatrixV2 {
  return {
    schemaVersion: 'sage.compatibility-matrix.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    semanticVersion: '2.0.0',
    targetContractVersion: 'sage.compatibility-target-semantic.v2',
    runtimeContractVersion: 'sage.runtime-descriptor.v2',
    issuer: {
      identity: 'authority:sage-compatibility',
      version: '2.0.0',
      digest: CONTENT_ONE,
    },
    validFrom,
    expiresAt,
    rules: [
      {
        ruleId,
        targetSemanticDigest,
        runtimeDescriptorDigest,
        outcome: 'equivalent',
        reasonCode: 'approved-exact-stable-pair',
        reason: 'The bundled stable pair is explicitly approved.',
      },
    ],
  }
}

function artifact(value: CompatibilityMatrixV2): CompatibilityMatrixBundleArtifactV2 {
  const canonicalMatrix = canonicalizeCompatibilityMatrixV2(value)
  return {
    matrixId: computeCompatibilityMatrixIdV2(canonicalMatrix),
    canonicalMatrix,
  }
}

function matrixArtifact(value: CompatibilityMatrixV2): CompatibilityMatrixBundleArtifactV2 {
  return artifact(value)
}

function revocationSource(
  entries: CompatibilityMatrixRevocationSourceBodyV2['entries'] = [],
): CompatibilityMatrixRevocationSourceBodyV2 {
  return {
    schemaVersion: 'sage.compatibility-matrix-revocation-source.v2',
    canonicalizationVersion: 'sage.compatibility-matrix-revocation-canonical-json.v2',
    createdAt: '2026-09-29T00:00:00Z',
    sourceProvenanceDigest: CONTENT_TWO,
    entries,
  }
}

describe('WT-02C.2M app-bundled MatrixV2 provider', () => {
  it('seals historical matrix bytes and an independent revocation source', () => {
    const current = matrixArtifact(matrix())
    const historical = matrixArtifact(
      matrix(
        SECOND_TARGET_DIGEST,
        SECOND_RUNTIME_DIGEST,
        '2026-09-01T00:00:00Z',
        '2026-09-02T00:00:00Z',
        'rule:sage-historical',
      ),
    )
    const bundleBody: CompatibilityMatrixBundleBodyV2 = {
      schemaVersion: 'sage.compatibility-matrix-bundle.v2',
      canonicalizationVersion: 'sage.compatibility-matrix-bundle-canonical-json.v2',
      providerProvenanceDigest: CONTENT_ONE,
      artifacts: [current, historical],
    }
    const sourceBody = revocationSource()
    const bundle = sealCompatibilityMatrixBundleV2(bundleBody)
    const source = sealCompatibilityMatrixRevocationSourceV2(sourceBody)

    expect(bundle.ok).toBe(true)
    expect(source.ok).toBe(true)
    if (!bundle.ok || !source.ok) throw new Error('Expected sealed bundle and source.')
    expect(bundle.value.bundleId).toBe(computeCompatibilityMatrixBundleIdV2(bundleBody))
    expect(source.value.sourceId).toBe(computeCompatibilityMatrixRevocationSourceIdV2(sourceBody))
    expect(canonicalizeCompatibilityMatrixBundleV2(bundle.value)).toBe(
      canonicalizeCompatibilityMatrixBundleV2(bundleBody),
    )
    expect(canonicalizeCompatibilityMatrixRevocationSourceV2(source.value)).toBe(
      canonicalizeCompatibilityMatrixRevocationSourceV2(sourceBody),
    )
    expect(Object.isFrozen(bundle.value)).toBe(true)
    expect(Object.isFrozen(bundle.value.artifacts)).toBe(true)
    expect(Object.isFrozen(source.value.entries)).toBe(true)
    expect(parseCompatibilityMatrixBundleV2(bundle.value).ok).toBe(true)
    expect(parseCompatibilityMatrixRevocationSourceV2(source.value).ok).toBe(true)
  })

  it('selects one active stable pair and retains explicit historical lookup', () => {
    const current = matrixArtifact(matrix())
    const historical = matrixArtifact(
      matrix(
        TARGET_DIGEST,
        RUNTIME_DIGEST,
        '2026-08-01T00:00:00Z',
        '2026-08-02T00:00:00Z',
        'rule:sage-old',
      ),
    )
    const provider = createBundledCompatibilityMatrixProviderV2(
      {
        schemaVersion: 'sage.compatibility-matrix-bundle.v2',
        canonicalizationVersion: 'sage.compatibility-matrix-bundle-canonical-json.v2',
        providerProvenanceDigest: CONTENT_ONE,
        artifacts: [historical, current],
      },
      revocationSource(),
    )
    const request = {
      schemaVersion: 'sage.compatibility-matrix-provider-request.v2',
      targetSemanticDigest: TARGET_DIGEST,
      runtimeDescriptorDigest: RUNTIME_DIGEST,
      evaluatedAt: NOW,
    }
    const resolved = provider.resolve(request)
    expect(resolved.kind).toBe('available')
    if (resolved.kind !== 'available') throw new Error('Expected current matrix.')
    expect(resolved.canonicalMatrix).toBe(current.canonicalMatrix)
    expect(resolved.revocationSourceId).toMatch(
      /^urn:sage:compatibility-matrix-revocation-source:sha256:[0-9a-f]{64}$/u,
    )

    const replayed = provider.resolve({
      ...request,
      matrixId: historical.matrixId,
    })
    expect(replayed.kind).toBe('available')
    if (replayed.kind !== 'available') throw new Error('Expected historical matrix.')
    expect(replayed.canonicalMatrix).toBe(historical.canonicalMatrix)
    expect(Object.isFrozen(replayed)).toBe(true)
  })

  it('does not choose overlapping artifacts and rejects a pair mismatch', () => {
    const first = matrixArtifact(matrix())
    const second = matrixArtifact(matrix(TARGET_DIGEST, RUNTIME_DIGEST, '2026-09-29T06:00:00Z'))
    const provider = createBundledCompatibilityMatrixProviderV2(
      {
        schemaVersion: 'sage.compatibility-matrix-bundle.v2',
        canonicalizationVersion: 'sage.compatibility-matrix-bundle-canonical-json.v2',
        providerProvenanceDigest: CONTENT_ONE,
        artifacts: [first, second],
      },
      revocationSource(),
    )
    const result = provider.resolve({
      schemaVersion: 'sage.compatibility-matrix-provider-request.v2',
      targetSemanticDigest: TARGET_DIGEST,
      runtimeDescriptorDigest: RUNTIME_DIGEST,
      evaluatedAt: NOW,
    })
    expect(result).toMatchObject({ kind: 'unavailable', code: 'matrix-ambiguous' })

    const mismatch = provider.resolve({
      schemaVersion: 'sage.compatibility-matrix-provider-request.v2',
      targetSemanticDigest: SECOND_TARGET_DIGEST,
      runtimeDescriptorDigest: SECOND_RUNTIME_DIGEST,
      evaluatedAt: NOW,
      matrixId: first.matrixId,
    })
    expect(mismatch).toMatchObject({ kind: 'unavailable', code: 'matrix-pair-not-found' })
  })

  it('returns revocations from the independent source and exposes a deliberate resolver adapter', () => {
    const current = matrixArtifact(matrix())
    const sourceBody = revocationSource([
      {
        matrixId: current.matrixId,
        revokedAt: '2026-09-29T12:30:00Z',
        reasonCode: 'owner-withdrawn',
        provenanceDigest: CONTENT_TWO,
      },
    ])
    const provider = createBundledCompatibilityMatrixProviderV2(
      {
        schemaVersion: 'sage.compatibility-matrix-bundle.v2',
        canonicalizationVersion: 'sage.compatibility-matrix-bundle-canonical-json.v2',
        providerProvenanceDigest: CONTENT_ONE,
        artifacts: [current],
      },
      sourceBody,
    )
    const result = provider.resolve({
      schemaVersion: 'sage.compatibility-matrix-provider-request.v2',
      targetSemanticDigest: TARGET_DIGEST,
      runtimeDescriptorDigest: RUNTIME_DIGEST,
      evaluatedAt: NOW,
    })
    expect(result).toMatchObject({
      kind: 'available',
      revocationSourceProvenanceDigest: CONTENT_TWO,
    })
    if (result.kind !== 'available') throw new Error('Expected available matrix.')
    expect(result.revocations).toEqual(sourceBody.entries)
    const resolverResult = toCompatibilityMatrixV2ProviderResult(result)
    expect(Object.keys(resolverResult).sort()).toEqual([
      'canonicalMatrix',
      'kind',
      'matrixId',
      'providerProvenanceDigest',
      'revocations',
    ])
    expect(Object.keys(resolverResult)).not.toContain('revocationSourceId')
  })

  it('fails closed for tampered, duplicate, invalid, and hostile bundle/source inputs', () => {
    const current = matrixArtifact(matrix())
    const validBundle = {
      schemaVersion: 'sage.compatibility-matrix-bundle.v2',
      canonicalizationVersion: 'sage.compatibility-matrix-bundle-canonical-json.v2',
      providerProvenanceDigest: CONTENT_ONE,
      artifacts: [current],
    }
    const validSource = revocationSource()

    const tamperedBundle = { ...validBundle, artifacts: [{ ...current, canonicalMatrix: `${current.canonicalMatrix} ` }] }
    expect(parseCompatibilityMatrixBundleV2(tamperedBundle)).toMatchObject({
      ok: false,
      code: 'matrix-bundle-artifact-invalid',
    })

    expect(parseCompatibilityMatrixBundleV2({ ...validBundle, artifacts: [current, current] })).toMatchObject({
      ok: false,
      code: 'matrix-bundle-artifact-duplicate',
    })

    const tamperedSource = {
      ...validSource,
      sourceId: 'urn:sage:compatibility-matrix-revocation-source:sha256:'.concat('0'.repeat(64)),
    }
    expect(parseCompatibilityMatrixRevocationSourceV2(tamperedSource)).toMatchObject({
      ok: false,
      code: 'matrix-revocation-source-id-mismatch',
    })

    const proxy = new Proxy(validBundle, { get() { throw new Error('probe') } })
    const provider = createBundledCompatibilityMatrixProviderV2(proxy, validSource)
    expect(provider.resolve({ kind: 'invalid' })).toMatchObject({
      kind: 'unavailable',
      code: 'matrix-provider-unavailable',
    })

    const validProvider = createBundledCompatibilityMatrixProviderV2(validBundle, validSource)
    expect(validProvider.resolve({ kind: 'invalid' })).toMatchObject({
      kind: 'unavailable',
      code: 'matrix-request-invalid',
    })
  })

  it('does not perform I/O, read fixture data, or consult ambient time', () => {
    const source = readFileSync(
      new URL('../src/security/compatibility-matrix-provider.ts', import.meta.url),
      'utf8',
    )
    expect(source).not.toMatch(/\b(?:fs|readFile|writeFile|fetch|process\.env|Date\.now)\b/u)
    expect(source).not.toMatch(/(?:fixture|test-data|\.json)/iu)
  })
})
