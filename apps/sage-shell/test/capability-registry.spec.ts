import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  canonicalizeCapabilityRegistryEntry,
  canonicalizeCapabilityRegistrySnapshot,
  computeCapabilityRegistryEntryDigest,
  computeCapabilityRegistrySnapshotId,
  createCapabilityRegistryKernel,
  parseCapabilityRegistrySnapshot,
  sealCapabilityRegistrySnapshot,
  transitionCapabilityRegistry,
  type CapabilityRegistryApprovalV1,
  type CapabilityRegistryDescriptorRefV1,
  type CapabilityRegistryEntryBodyV1,
  type CapabilityRegistryOperationMappingV1,
  type CapabilityRegistrySnapshotBodyV1,
  type CapabilityRegistrySnapshotV1,
} from '../src/security/capability-registry.js'

const CANDIDATE_DESCRIPTOR: CapabilityRegistryDescriptorRefV1 = {
  descriptorDigest: 'urn:sage:external-capability-descriptor:sha256:1111111111111111111111111111111111111111111111111111111111111111',
  artifactSubjectDigest: 'urn:sage:external-capability-artifact:sha256:2222222222222222222222222222222222222222222222222222222222222222',
  launchContractDigest: 'urn:sage:external-capability-launch:sha256:3333333333333333333333333333333333333333333333333333333333333333',
  toolContractDigest: 'urn:sage:external-capability-tool-contract:sha256:4444444444444444444444444444444444444444444444444444444444444444',
  verification: 'candidate',
  source: 'candidate',
}

const VERIFIED_DESCRIPTOR: CapabilityRegistryDescriptorRefV1 = {
  ...CANDIDATE_DESCRIPTOR,
  verification: 'verified',
  source: 'c2c5',
  evidenceDigest: 'urn:sage:external-capability-evidence:sha256:5555555555555555555555555555555555555555555555555555555555555555',
}

const OPERATION: CapabilityRegistryOperationMappingV1 = {
  operationId: 'read-orders',
  adapter: {
    identity: 'adapter:sage.shopify',
    version: '1.0.0',
    digest: 'sha256:6666666666666666666666666666666666666666666666666666666666666666',
  },
  effectClass: 'external-read',
  dataBoundary: 'shopify.orders.read',
  inputContractDigest: 'sha256:7777777777777777777777777777777777777777777777777777777777777777',
  outputContractDigest: 'sha256:8888888888888888888888888888888888888888888888888888888888888888',
  preflight: 'read-only',
  revokeBehavior: 'deny-new-actions',
}

const APPROVAL: CapabilityRegistryApprovalV1 = {
  decisionId: 'decision:sage.shopify.read',
  ownerId: 'owner:sage.product-security',
  decidedAt: '2026-09-28T18:00:00.000Z',
  reason: 'Approved for the bounded read-only Shopify orders operation.',
}

function candidateEntry(capabilityId = 'capability:sage.shopify'): CapabilityRegistryEntryBodyV1 {
  return {
    schemaVersion: 'sage.capability-registry-entry.v1',
    canonicalizationVersion: 'sage.capability-registry-canonical-json.v1',
    capabilityId,
    capabilityVersion: '1.0.0',
    state: 'candidate',
    descriptor: CANDIDATE_DESCRIPTOR,
    operations: [],
    approvals: [],
    effectiveAt: '2026-09-28T18:00:00.000Z',
  }
}

function verifiedCandidateEntry(capabilityId = 'capability:sage.shopify'): CapabilityRegistryEntryBodyV1 {
  return {
    ...candidateEntry(capabilityId),
    descriptor: VERIFIED_DESCRIPTOR,
    operations: [OPERATION],
  }
}

function approvedEntry(capabilityId = 'capability:sage.shopify'): CapabilityRegistryEntryBodyV1 {
  return {
    ...verifiedCandidateEntry(capabilityId),
    state: 'approved',
    approvals: [APPROVAL],
  }
}

function snapshotBody(entries: readonly CapabilityRegistryEntryBodyV1[]): CapabilityRegistrySnapshotBodyV1 {
  return {
    schemaVersion: 'sage.capability-registry.v1',
    canonicalizationVersion: 'sage.capability-registry-canonical-json.v1',
    createdAt: '2026-09-28T18:00:00.000Z',
    entries,
  }
}

function unwrap<T>(result: { readonly ok: boolean; readonly value?: T }): T {
  if (!result.ok || result.value === undefined) throw new Error('Expected a successful registry result.')
  return result.value
}

function transition(
  current: CapabilityRegistrySnapshotV1,
  capabilityId: string,
  toState: 'approved' | 'disabled' | 'revoked',
  effectiveAt = '2026-09-28T19:00:00.000Z',
  approval?: CapabilityRegistryApprovalV1,
) {
  return transitionCapabilityRegistry({
    schemaVersion: 'sage.capability-registry-transition.v1',
    canonicalizationVersion: 'sage.capability-registry-canonical-json.v1',
    current,
    capabilityId,
    toState,
    effectiveAt,
    reason: `Move ${capabilityId} to ${toState}.`,
    ...(approval === undefined ? {} : { approval }),
  })
}

describe('Capability Registry pure kernel', () => {
  it('seals normalized, immutable snapshots without mutating caller input', () => {
    const first = candidateEntry('capability:sage.zeta')
    const second = candidateEntry('capability:sage.alpha')
    const input = snapshotBody([first, second])

    const result = sealCapabilityRegistrySnapshot(input)
    const snapshot = unwrap(result)

    expect(snapshot.entries.map((entry) => entry.capabilityId)).toEqual([
      'capability:sage.alpha',
      'capability:sage.zeta',
    ])
    expect(snapshot.snapshotId).toMatch(/^urn:sage:capability-registry:sha256:[0-9a-f]{64}$/u)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.entries)).toBe(true)
    expect(Object.isFrozen(snapshot.entries[0])).toBe(true)
    expect(input.entries).toEqual([first, second])
    expect(computeCapabilityRegistrySnapshotId(input)).toBe(snapshot.snapshotId)
  })

  it('canonicalizes equivalent entry and snapshot order deterministically', () => {
    const secondOperation: CapabilityRegistryOperationMappingV1 = {
      ...OPERATION,
      operationId: 'list-orders',
      dataBoundary: 'shopify.orders.list',
    }
    const secondApproval: CapabilityRegistryApprovalV1 = {
      ...APPROVAL,
      decisionId: 'decision:sage.shopify.list',
    }
    const left: CapabilityRegistryEntryBodyV1 = {
      ...verifiedCandidateEntry(),
      operations: [secondOperation, OPERATION],
      approvals: [secondApproval, APPROVAL],
    }
    const right: CapabilityRegistryEntryBodyV1 = {
      ...left,
      operations: [OPERATION, secondOperation],
      approvals: [APPROVAL, secondApproval],
    }
    expect(canonicalizeCapabilityRegistryEntry(left)).toBe(canonicalizeCapabilityRegistryEntry(right))
    expect(computeCapabilityRegistryEntryDigest(left)).toBe(computeCapabilityRegistryEntryDigest(right))
    expect(canonicalizeCapabilityRegistrySnapshot(snapshotBody([left]))).toBe(
      canonicalizeCapabilityRegistrySnapshot(snapshotBody([right])),
    )
  })

  it('rejects duplicate entries, duplicate operations, and duplicate approvals', () => {
    expect(sealCapabilityRegistrySnapshot(snapshotBody([candidateEntry(), candidateEntry()]))).toMatchObject({
      ok: false,
      code: 'registry-entry-duplicate',
    })
    expect(sealCapabilityRegistrySnapshot(snapshotBody([{
      ...verifiedCandidateEntry(),
      operations: [OPERATION, OPERATION],
    }]))).toMatchObject({ ok: false, code: 'registry-operation-mapping-invalid' })
    expect(sealCapabilityRegistrySnapshot(snapshotBody([{
      ...approvedEntry(),
      approvals: [APPROVAL, APPROVAL],
    }]))).toMatchObject({ ok: false, code: 'registry-entry-conflict' })
  })

  it('fails closed for approved entries that lack verified provenance, operations, or approval', () => {
    expect(sealCapabilityRegistrySnapshot(snapshotBody([{
      ...candidateEntry(),
      state: 'approved',
      operations: [OPERATION],
      approvals: [APPROVAL],
    }]))).toMatchObject({ ok: false, code: 'registry-descriptor-unverified' })
    expect(sealCapabilityRegistrySnapshot(snapshotBody([{
      ...verifiedCandidateEntry(),
      state: 'approved',
      operations: [],
      approvals: [APPROVAL],
    }]))).toMatchObject({ ok: false, code: 'registry-operation-mapping-invalid' })
    expect(sealCapabilityRegistrySnapshot(snapshotBody([{
      ...verifiedCandidateEntry(),
      state: 'approved',
    }]))).toMatchObject({ ok: false, code: 'registry-approval-required' })
  })

  it('transitions a verified candidate to approved with a new superseding snapshot', () => {
    const current = unwrap(sealCapabilityRegistrySnapshot(snapshotBody([verifiedCandidateEntry()])))
    const result = transition(current, 'capability:sage.shopify', 'approved', undefined, APPROVAL)
    const next = unwrap(result)

    expect(next.snapshotId).not.toBe(current.snapshotId)
    expect(next.supersedesSnapshotId).toBe(current.snapshotId)
    expect(next.entries[0]?.state).toBe('approved')
    expect(next.entries[0]?.approvals).toEqual([APPROVAL])
    expect(Object.isFrozen(next)).toBe(true)
    expect(current.entries[0]?.state).toBe('candidate')
  })

  it('supports disable and revoke as terminal lifecycle transitions', () => {
    const approved = unwrap(sealCapabilityRegistrySnapshot(snapshotBody([approvedEntry()])))
    const disabled = unwrap(transition(approved, 'capability:sage.shopify', 'disabled'))
    const revoked = unwrap(transition(disabled, 'capability:sage.shopify', 'revoked'))

    expect(disabled.entries[0]?.state).toBe('disabled')
    expect(revoked.entries[0]?.state).toBe('revoked')
    expect(transition(revoked, 'capability:sage.shopify', 'approved', undefined, APPROVAL)).toMatchObject({
      ok: false,
      code: 'registry-revoked',
    })
  })

  it('rejects malformed, tampered, expired, and hostile values', () => {
    const sealed = unwrap(sealCapabilityRegistrySnapshot(snapshotBody([candidateEntry()])))
    const tampered = { ...sealed, snapshotId: sealed.snapshotId.replace(/.$/u, '0') }
    expect(parseCapabilityRegistrySnapshot(tampered)).toMatchObject({
      ok: false,
      code: 'registry-snapshot-digest-mismatch',
    })

    const withUnknownKey = { ...snapshotBody([candidateEntry()]), unexpected: true }
    expect(sealCapabilityRegistrySnapshot(withUnknownKey as never)).toMatchObject({
      ok: false,
      code: 'registry-snapshot-invalid',
    })
    const accessor = Object.defineProperty({ ...candidateEntry() }, 'capabilityId', {
      enumerable: true,
      get: () => 'capability:sage.accessor',
    })
    expect(sealCapabilityRegistrySnapshot(snapshotBody([accessor as never]))).toMatchObject({
      ok: false,
      code: 'registry-entry-invalid',
    })
    const proxy = new Proxy(candidateEntry(), {})
    expect(sealCapabilityRegistrySnapshot(snapshotBody([proxy]))).toMatchObject({
      ok: false,
      code: 'registry-entry-invalid',
    })
    expect(sealCapabilityRegistrySnapshot(snapshotBody([{
      ...candidateEntry(),
      effectiveAt: '2026-02-29T00:00:00Z',
    }]))).toMatchObject({ ok: false, code: 'registry-entry-invalid' })

    const expiring = {
      ...verifiedCandidateEntry(),
      expiresAt: '2026-09-28T18:30:00Z',
    }
    const expiringSnapshot = unwrap(sealCapabilityRegistrySnapshot(snapshotBody([expiring])))
    expect(transition(expiringSnapshot, 'capability:sage.shopify', 'approved', '2026-09-28T19:00:00Z', APPROVAL)).toMatchObject({
      ok: false,
      code: 'registry-transition-invalid',
    })
  })

  it('rejects non-allowlisted operation fields and malformed arrays', () => {
    expect(sealCapabilityRegistrySnapshot(snapshotBody([{
      ...verifiedCandidateEntry(),
      operations: [{ ...OPERATION, preflight: 'write' } as never],
    }]))).toMatchObject({ ok: false, code: 'registry-operation-mapping-invalid' })
    expect(sealCapabilityRegistrySnapshot(snapshotBody([{
      ...verifiedCandidateEntry(),
      operations: Object.assign([OPERATION], { extra: true }),
    }]))).toMatchObject({ ok: false, code: 'registry-entry-invalid' })
    expect(sealCapabilityRegistrySnapshot(snapshotBody([{
      ...verifiedCandidateEntry(),
      operations: [Object.create(null)],
    }]))).toMatchObject({ ok: false, code: 'registry-operation-mapping-invalid' })
  })

  it('keeps the public kernel surface frozen and free of runtime I/O', () => {
    const kernel = createCapabilityRegistryKernel()
    expect(Object.isFrozen(kernel)).toBe(true)
    expect(Object.keys(kernel).sort()).toEqual([
      'canonicalizeEntry',
      'canonicalizeSnapshot',
      'computeEntryDigest',
      'computeSnapshotId',
      'parseSnapshot',
      'sealSnapshot',
      'transition',
    ])

    const source = readFileSync(resolve(import.meta.dirname, '../src/security/capability-registry.ts'), 'utf8')
    expect(source).not.toMatch(/node:(?:fs|path|net|http|child_process)/u)
    expect(source).not.toMatch(/\b(?:fetch|globalThis|process)\b/u)
    expect(source).not.toMatch(/\b(?:Date\.now|new Date)\b/u)
  })
})

const FIRST_PARTY_DESCRIPTOR: CapabilityRegistryDescriptorRefV1 = {
  descriptorDigest: 'urn:sage:runtime-descriptor:sha256:9999999999999999999999999999999999999999999999999999999999999999',
  artifactSubjectDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  launchContractDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  toolContractDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  verification: 'verified',
  source: 'first-party',
  evidenceDigest: 'urn:sage:first-party-capability-evidence:sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
}

describe('first-party provenance (ADR-0285)', () => {
  it('seals an approved first-party entry and never interchanges source namespaces', () => {
    const entry: CapabilityRegistryEntryBodyV1 = {
      ...approvedEntry('capability:sage.session-prompt'),
      descriptor: FIRST_PARTY_DESCRIPTOR,
    }
    const sealed = sealCapabilityRegistrySnapshot(snapshotBody([entry]))
    expect(sealed.ok).toBe(true)
    if (sealed.ok) expect(sealed.value.entries[0]?.descriptor.source).toBe('first-party')

    // A first-party source with an external evidence URN breaks its namespace set; parseEntry
    // folds descriptor-level failures into registry-entry-invalid (established kernel semantics).
    expect(sealCapabilityRegistrySnapshot(snapshotBody([{
      ...entry,
      descriptor: { ...FIRST_PARTY_DESCRIPTOR, evidenceDigest: VERIFIED_DESCRIPTOR.evidenceDigest },
    }]))).toMatchObject({ ok: false, code: 'registry-entry-invalid' })

    // A c2c5 source with first-party content digests breaks the external namespaces.
    expect(sealCapabilityRegistrySnapshot(snapshotBody([{
      ...entry,
      descriptor: { ...FIRST_PARTY_DESCRIPTOR, source: 'c2c5' },
    }]))).toMatchObject({ ok: false, code: 'registry-entry-invalid' })

    // An unknown source is not a provenance path at all.
    expect(sealCapabilityRegistrySnapshot(snapshotBody([{
      ...entry,
      descriptor: { ...FIRST_PARTY_DESCRIPTOR, source: 'self-attested' } as never,
    }]))).toMatchObject({ ok: false, code: 'registry-entry-invalid' })
  })
})
