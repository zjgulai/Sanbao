import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLocalOrganizationPolicyProvider } from '../src/main/organization-policy.js'
import type { OrganizationPolicySnapshot, PolicyProviderRequest } from '../src/security/identity-policy.js'

const SAMPLE = {
  schemaVersion: 'sage.organization-policy.v1',
  organizationId: 'organization:sage',
  policy: { identity: 'policy:local', version: '1' },
  validFrom: '2026-10-01T00:00:00Z',
  expiresAt: '2027-10-01T00:00:00Z',
  membership: { mode: 'instance-operator', roleRefs: ['role:owner'] },
  grants: [
    {
      roleRef: 'role:owner',
      operation: 'business-matter.start-attempt',
      actionScope: 'catalog.prepare-draft',
      effectClass: 'local-write',
      requiresDecision: false,
    },
  ],
}

// Hand-written golden: sha256 over the canonical projection of SAMPLE (spec §2.4 key order).
const GOLDEN_DIGEST = 'urn:sage:organization-policy:sha256:7d8a2ee170f40af191eb3b1908ef97663b24afb579734c91dd12153d390393dd'

const REQUEST: PolicyProviderRequest = {
  requestedOrganizationRef: 'organization:sage',
  identityHandle: 'handle:operator-001',
  requiredRoleRef: 'role:owner',
  operation: 'business-matter.start-attempt',
  actionPolicy: { actionScope: 'catalog.prepare-draft', effectClass: 'local-write', requiresDecision: false },
  evaluatedAt: '2026-10-02T00:00:00.000Z',
}

const asSnapshot = (value: unknown): OrganizationPolicySnapshot => value as OrganizationPolicySnapshot

describe('local organization policy provider (WT-02B.2E)', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sage-org-policy-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const policyPath = () => join(dir, 'organization-policy.json')
  const writePolicy = (value: unknown) =>
    writeFile(policyPath(), typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
  const provider = (spy?: (path: string) => void) =>
    createLocalOrganizationPolicyProvider({
      policyPath: policyPath(),
      readFileBytes: (path) => {
        spy?.(path)
        return readFileSync(path)
      },
    })

  it('builds the snapshot bound to the requesting handle with the computed golden digest', async () => {
    await writePolicy(SAMPLE)
    const resolved = asSnapshot(provider().resolve(REQUEST))
    expect(resolved).toEqual({
      policy: { identity: 'policy:local', version: '1', digest: GOLDEN_DIGEST },
      organizationId: 'organization:sage',
      validFrom: '2026-10-01T00:00:00Z',
      expiresAt: '2027-10-01T00:00:00Z',
      roleAssignments: [{ identityHandle: 'handle:operator-001', roleRef: 'role:owner' }],
      grants: [SAMPLE.grants[0]],
    })

    const other = asSnapshot(provider().resolve({ ...REQUEST, identityHandle: 'handle:operator-002' }))
    expect(other.roleAssignments).toEqual([
      { identityHandle: 'handle:operator-002', roleRef: 'role:owner' },
    ])
  })

  it('is insensitive to role and grant order (digest covers the sorted canonical form)', async () => {
    const twoRoles = {
      ...SAMPLE,
      membership: { mode: 'instance-operator', roleRefs: ['role:owner', 'role:auditor'] },
      grants: [
        { roleRef: 'role:owner', operation: 'business-matter.start-attempt', actionScope: 'catalog.prepare-draft', effectClass: 'local-write', requiresDecision: false },
        { roleRef: 'role:auditor', operation: 'business-matter.record-receipt', actionScope: 'catalog.record', effectClass: 'local-read', requiresDecision: false },
      ],
    }
    await writePolicy(twoRoles)
    const a = asSnapshot(provider().resolve(REQUEST))
    await writePolicy({
      ...twoRoles,
      membership: { mode: 'instance-operator', roleRefs: ['role:auditor', 'role:owner'] },
      grants: [twoRoles.grants[1], twoRoles.grants[0]],
    })
    const b = asSnapshot(provider().resolve(REQUEST))

    expect(a.policy.digest).toBe(b.policy.digest)
    expect(a.roleAssignments).toEqual([
      { identityHandle: 'handle:operator-001', roleRef: 'role:auditor' },
      { identityHandle: 'handle:operator-001', roleRef: 'role:owner' },
    ])
    expect(a.grants).toEqual(b.grants)
    expect((a.grants as readonly { roleRef: string }[]).map((grant) => grant.roleRef)).toEqual(['role:auditor', 'role:owner'])
  })

  it('treats an empty grant list as a valid explicit lockdown', async () => {
    await writePolicy({ ...SAMPLE, grants: [] })
    const snapshot = asSnapshot(provider().resolve(REQUEST))
    expect(snapshot.grants).toEqual([])
    expect(snapshot.policy.digest).not.toBe(GOLDEN_DIGEST)
  })

  it('throws when the policy file is missing or unreadable (provider unavailable)', async () => {
    expect(() => provider().resolve(REQUEST)).toThrow()
    const failing = createLocalOrganizationPolicyProvider({
      policyPath: policyPath(),
      readFileBytes: () => {
        throw new Error('EACCES')
      },
    })
    expect(() => failing.resolve(REQUEST)).toThrow()
  })

  it('returns null for unparseable or oversized content (snapshot invalid)', async () => {
    await writePolicy('{not-json\n')
    expect(provider().resolve(REQUEST)).toBeNull()
    await writePolicy(`{"padding":"${'x'.repeat(257 * 1024)}"}`)
    expect(provider().resolve(REQUEST)).toBeNull()
  })

  it('returns null for every schema violation class', async () => {
    const cases: readonly unknown[] = [
      { ...SAMPLE, unexpected: true },
      { ...SAMPLE, membership: { mode: 'instance-operator', roleRefs: ['role:owner'], unexpected: true } },
      { ...SAMPLE, schemaVersion: 'sage.organization-policy.v2' },
      { ...SAMPLE, organizationId: '' },
      { ...SAMPLE, organizationId: ' organization:sage ' },
      { ...SAMPLE, policy: null },
      { ...SAMPLE, policy: { identity: 'policy:local', version: '' } },
      { ...SAMPLE, policy: { identity: 'policy:local', version: '1', digest: 'urn:forged' } },
      { ...SAMPLE, validFrom: '2026-02-31T00:00:00Z' },
      { ...SAMPLE, expiresAt: '2026-10-01 00:00:00' },
      { ...SAMPLE, membership: null },
      { ...SAMPLE, membership: { mode: 'multi-member', roleRefs: ['role:owner'] } },
      { ...SAMPLE, membership: { mode: 'instance-operator', roleRefs: [] } },
      { ...SAMPLE, membership: { mode: 'instance-operator', roleRefs: ['role:owner', 'role:owner'] } },
      { ...SAMPLE, membership: { mode: 'instance-operator', roleRefs: [42] } },
      { ...SAMPLE, grants: 'not-an-array' },
      { ...SAMPLE, grants: [null] },
      { ...SAMPLE, grants: [{ ...SAMPLE.grants[0], unexpected: true }] },
      { ...SAMPLE, grants: [{ ...SAMPLE.grants[0], effectClass: 'network-write' }] },
      { ...SAMPLE, grants: [{ ...SAMPLE.grants[0], requiresDecision: 'no' }] },
      { ...SAMPLE, grants: [SAMPLE.grants[0], { ...SAMPLE.grants[0] }] },
    ]
    for (const value of cases) {
      await writePolicy(value)
      expect(provider().resolve(REQUEST), JSON.stringify(value)).toBeNull()
    }
  })

  it('re-reads the file on every resolve (no caching; file is truth)', async () => {
    await writePolicy(SAMPLE)
    const p = provider()
    expect(asSnapshot(p.resolve(REQUEST)).policy.digest).toBe(GOLDEN_DIGEST)
    await writePolicy({ ...SAMPLE, policy: { identity: 'policy:local', version: '2' } })
    const second = asSnapshot(p.resolve(REQUEST))
    expect(second.policy.version).toBe('2')
    expect(second.policy.digest).not.toBe(GOLDEN_DIGEST)
  })

  it('reads exactly the configured policy path and nothing else', async () => {
    await writePolicy(SAMPLE)
    const seen: string[] = []
    provider((path) => seen.push(path)).resolve(REQUEST)
    expect(seen).toEqual([policyPath()])
  })
})
