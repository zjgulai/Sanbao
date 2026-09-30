import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  canonicalizeCompatibilityTargetRequirement,
  canonicalizeCompatibilityTargetRequirementSnapshot,
  computeCompatibilityTargetRequirementDigest,
  computeCompatibilityTargetRequirementSnapshotId,
  createBundledCompatibilityTargetProvider,
  createCompatibilityTargetRequirementKernel,
  parseCompatibilityTargetRequirement,
  parseCompatibilityTargetRequirementSnapshot,
  sealCompatibilityTargetRequirement,
  sealCompatibilityTargetRequirementSnapshot,
  type CompatibilityTargetComponentRequirementV1,
  type CompatibilityTargetRequirementBodyV1,
  type CompatibilityTargetRequirementSnapshotBodyV1,
} from '../src/security/compatibility-target-requirement.js'

const CONTENT = (hex: string): string => `sha256:${hex.repeat(64)}`

function component(kind: string, suffix: string, version = '1.0.0'): CompatibilityTargetComponentRequirementV1 {
  return {
    identity: `${kind}:sage.${suffix}`,
    version,
    artifactDigest: CONTENT('1'),
    contractDigest: CONTENT('2'),
    behaviorConfigurationDigest: CONTENT('3'),
  }
}

const BASE_BODY: CompatibilityTargetRequirementBodyV1 = {
  schemaVersion: 'sage.compatibility-target-requirement-entry.v1',
  canonicalizationVersion: 'sage.compatibility-target-requirement-canonical-json.v1',
  requirementId: 'requirement:sage.catalog',
  requirementVersion: '1.0.0',
  state: 'active',
  actionRequirements: [
    { actionScope: 'catalog.publish', effectClass: 'external-write', requiresDecision: true },
    { actionScope: 'catalog.prepare', effectClass: 'local-write', requiresDecision: false },
  ],
  permissionRequirements: [
    { identity: 'permission:sage.catalog', version: '1.0.0', digest: CONTENT('4') },
  ],
  dataBoundaryRequirements: [
    { identity: 'data-boundary:sage.catalog', version: '2026-09-29', digest: CONTENT('5') },
  ],
  provider: component('provider', 'catalog'),
  model: component('model', 'catalog', '2026-09-01'),
  agent: component('agent', 'catalog'),
  preset: component('preset', 'catalog'),
  capabilities: [component('capability', 'catalog-read')],
  ownerDecision: {
    decisionId: 'decision:sage.catalog',
    ownerId: 'owner:sage.product-security',
    decidedAt: '2026-09-28T18:00:00.000Z',
    reason: 'Approved exact catalog policy for the bounded Sage capability.',
  },
  effectiveAt: '2026-09-29T00:00:00.000Z',
  expiresAt: '2026-09-30T00:00:00.000Z',
}

function snapshotBody(
  entries: readonly CompatibilityTargetRequirementBodyV1[] = [BASE_BODY],
): CompatibilityTargetRequirementSnapshotBodyV1 {
  return {
    schemaVersion: 'sage.compatibility-target-requirement.v1',
    canonicalizationVersion: 'sage.compatibility-target-requirement-canonical-json.v1',
    createdAt: '2026-09-28T19:00:00.000Z',
    publicationDecision: {
      decisionId: 'decision:sage.catalog-publish',
      ownerId: 'owner:sage.product-security',
      decidedAt: '2026-09-28T19:00:00.000Z',
      reason: 'Publish the immutable catalog requirement snapshot.',
    },
    entries,
  }
}

function unwrap<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: string }): T {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`Expected success, received ${result.code}.`)
  return result.value
}

function expectFailure(result: { readonly ok: true } | { readonly ok: false; readonly code: string }, code: string): void {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`Expected ${code}.`)
  expect(result.code).toBe(code)
}

describe('WT-02C.2T compatibility target requirement kernel', () => {
  it('canonicalizes exact requirements, seals content digests and freezes the result', () => {
    const input = structuredClone(BASE_BODY)
    const reversed: CompatibilityTargetRequirementBodyV1 = {
      ...input,
      actionRequirements: [...input.actionRequirements].reverse(),
      capabilities: [...input.capabilities].reverse(),
    }
    const sealed = unwrap(sealCompatibilityTargetRequirement(reversed))

    expect(input).toEqual(BASE_BODY)
    expect(sealed.requirementDigest).toMatch(
      /^urn:sage:compatibility-target-requirement:sha256:[0-9a-f]{64}$/u,
    )
    expect(sealed.requirementDigest).toBe(computeCompatibilityTargetRequirementDigest(BASE_BODY))
    expect(canonicalizeCompatibilityTargetRequirement(reversed)).toBe(
      canonicalizeCompatibilityTargetRequirement(BASE_BODY),
    )
    expect(parseCompatibilityTargetRequirement(sealed)).toEqual({ ok: true, value: sealed })
    expect(Object.isFrozen(sealed)).toBe(true)
    expect(Object.isFrozen(sealed.actionRequirements)).toBe(true)
    expect(Object.isFrozen(sealed.provider)).toBe(true)
  })

  it('rejects ranges, aliases, unknown fields, revision leakage and duplicate semantics', () => {
    expectFailure(
      sealCompatibilityTargetRequirement({ ...BASE_BODY, requirementVersion: '^1.0.0' } as never),
      'requirement-entry-invalid',
    )
    expectFailure(
      sealCompatibilityTargetRequirement({ ...BASE_BODY, provider: { ...BASE_BODY.provider, version: 'latest' } } as never),
      'requirement-entry-invalid',
    )
    expectFailure(
      sealCompatibilityTargetRequirement({ ...BASE_BODY, effectiveAt: '2026-02-30T00:00:00.000Z' }),
      'requirement-entry-invalid',
    )
    expectFailure(
      sealCompatibilityTargetRequirement({ ...BASE_BODY, matterId: 'matter:secret' } as never),
      'requirement-entry-invalid',
    )
    expectFailure(
      sealCompatibilityTargetRequirement({
        ...BASE_BODY,
        actionRequirements: [...BASE_BODY.actionRequirements, BASE_BODY.actionRequirements[0]],
      }),
      'requirement-action-duplicate',
    )
    expectFailure(
      sealCompatibilityTargetRequirement({
        ...BASE_BODY,
        permissionRequirements: [...BASE_BODY.permissionRequirements, BASE_BODY.permissionRequirements[0]],
      }),
      'requirement-policy-duplicate',
    )
    expectFailure(
      sealCompatibilityTargetRequirement({
        ...BASE_BODY,
        capabilities: [{ ...BASE_BODY.capabilities[0], identity: 'capability:sage.catalog-read' }, BASE_BODY.capabilities[0]],
      }),
      'requirement-entry-duplicate',
    )
  })

  it('creates and verifies an immutable append-only snapshot without v1 event fields', () => {
    const second: CompatibilityTargetRequirementBodyV1 = {
      ...BASE_BODY,
      requirementId: 'requirement:sage.orders',
      actionRequirements: [{ actionScope: 'orders.read', effectClass: 'external-read', requiresDecision: false }],
      permissionRequirements: [{ identity: 'permission:sage.orders', version: '1.0.0', digest: CONTENT('6') }],
      dataBoundaryRequirements: [{ identity: 'data-boundary:sage.orders', version: '1.0.0', digest: CONTENT('7') }],
      capabilities: [component('capability', 'orders-read')],
    }
    const body = snapshotBody([second, BASE_BODY])
    const snapshot = unwrap(sealCompatibilityTargetRequirementSnapshot(body))

    expect(snapshot.entries.map((entry) => entry.requirementId)).toEqual([
      'requirement:sage.catalog',
      'requirement:sage.orders',
    ])
    expect(snapshot.snapshotId).toMatch(
      /^urn:sage:compatibility-target-requirement-snapshot:sha256:[0-9a-f]{64}$/u,
    )
    expect(snapshot.snapshotId).toBe(computeCompatibilityTargetRequirementSnapshotId(body))
    expect(parseCompatibilityTargetRequirementSnapshot(snapshot)).toEqual({ ok: true, value: snapshot })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.entries)).toBe(true)
    expect(canonicalizeCompatibilityTargetRequirementSnapshot(body)).toContain(
      'sage.compatibility-target-requirement.v1',
    )
    expect(
      canonicalizeCompatibilityTargetRequirementSnapshot(snapshotBody([BASE_BODY, second])),
    ).toBe(canonicalizeCompatibilityTargetRequirementSnapshot(body))
    expectFailure(
      sealCompatibilityTargetRequirementSnapshot(snapshotBody([BASE_BODY, BASE_BODY])),
      'requirement-entry-duplicate',
    )
    expectFailure(
      parseCompatibilityTargetRequirementSnapshot({ ...snapshot, snapshotId: snapshot.snapshotId.replace(/.$/u, '0') }),
      'requirement-snapshot-digest-mismatch',
    )
    const lineage = unwrap(sealCompatibilityTargetRequirementSnapshot({
      ...body,
      supersedesSnapshotId: snapshot.snapshotId,
    }))
    expect(lineage.supersedesSnapshotId).toBe(snapshot.snapshotId)
    expect(parseCompatibilityTargetRequirementSnapshot(lineage)).toEqual({ ok: true, value: lineage })
  })

  it('serves only active exact actions from the app-bundled snapshot and never falls back', () => {
    const snapshot = unwrap(sealCompatibilityTargetRequirementSnapshot(snapshotBody()))
    const provider = createBundledCompatibilityTargetProvider(snapshot)
    expect(Object.isFrozen(provider)).toBe(true)

    const available = provider.resolve({
      requirementId: 'requirement:sage.catalog',
      actionScope: 'catalog.publish',
      evaluatedAt: '2026-09-29T12:00:00.000Z',
    })
    expect(available.kind).toBe('available')
    if (available.kind === 'available') {
      expect(available.snapshotId).toBe(snapshot.snapshotId)
      expect(Object.isFrozen(available.requirement)).toBe(true)
    }
    expect(provider.resolve({
      requirementId: 'requirement:sage.catalog',
      actionScope: 'catalog.delete',
      evaluatedAt: '2026-09-29T12:00:00.000Z',
    })).toMatchObject({ kind: 'unavailable', code: 'requirement-action-not-declared' })
    expect(provider.resolve({
      requirementId: 'requirement:sage.catalog',
      actionScope: 'catalog.publish',
      evaluatedAt: '2026-09-28T23:59:59.999Z',
    })).toMatchObject({ kind: 'unavailable', code: 'requirement-not-effective' })
    expect(provider.resolve({
      requirementId: 'requirement:sage.catalog',
      actionScope: 'catalog.publish',
      evaluatedAt: '2026-09-30T00:00:00.000Z',
    })).toMatchObject({ kind: 'unavailable', code: 'requirement-expired' })
    expect(provider.resolve({
      requirementId: 'requirement:sage.unknown',
      actionScope: 'catalog.publish',
      evaluatedAt: '2026-09-29T12:00:00.000Z',
    })).toMatchObject({ kind: 'unavailable', code: 'requirement-not-found' })
    expect(provider.resolve({
      requirementId: 'requirement:sage.catalog',
      actionScope: 'catalog.publish',
      evaluatedAt: '2026-09-29T12:00:00.000Z',
      fallback: 'latest',
    } as never)).toMatchObject({ kind: 'unavailable', code: 'requirement-request-invalid' })

    const revokedBody: CompatibilityTargetRequirementBodyV1 = {
      ...BASE_BODY,
      state: 'revoked',
      revokedAt: '2026-09-29T06:00:00.000Z',
      revocationReason: 'Owner revoked the candidate requirement.',
    }
    const revokedSnapshot = unwrap(sealCompatibilityTargetRequirementSnapshot(snapshotBody([revokedBody])))
    expect(createBundledCompatibilityTargetProvider(revokedSnapshot).resolve({
      requirementId: 'requirement:sage.catalog',
      actionScope: 'catalog.publish',
      evaluatedAt: '2026-09-29T12:00:00.000Z',
    })).toMatchObject({ kind: 'unavailable', code: 'requirement-revoked' })
  })

  it('keeps invalid bundled snapshots unavailable and stays free of I/O, clocks and network', () => {
    const provider = createBundledCompatibilityTargetProvider({})
    expect(provider.resolve({
      requirementId: 'requirement:sage.catalog',
      actionScope: 'catalog.publish',
      evaluatedAt: '2026-09-29T12:00:00.000Z',
    })).toMatchObject({ kind: 'unavailable', code: 'requirement-provider-unavailable' })

    const kernel = createCompatibilityTargetRequirementKernel()
    expect(Object.isFrozen(kernel)).toBe(true)
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/security/compatibility-target-requirement.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/from ['"]node:(fs|net|child_process|http|https)['"]/u)
    expect(source).not.toMatch(/\b(?:fetch|process|globalThis|new Date\s*\(|Date\.now\s*\()/u)
  })
})
