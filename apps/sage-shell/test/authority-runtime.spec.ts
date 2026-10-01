import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SAGE_DESKTOP_AUDIENCE, createSageAuthorityRuntime } from '../src/main/authority-runtime.js'
import { createTokenVault } from '../src/main/token-vault.js'
import type { TokenVault, VaultSession } from '../src/main/token-vault.js'
import { resolveSagePaths } from '../src/profile/paths.js'
import type { IdentityPolicyDenialCode, IdentityPolicyResolution } from '../src/security/identity-policy.js'

const NOW = '2026-10-02T12:00:00.000Z'

const SESSION: VaultSession = {
  accessToken: 'at',
  idToken: 'it',
  displayName: 'Alice',
  identityHandle: 'handle:operator-001',
  issuer: 'https://issuer.example/oidc',
  authenticatedAt: '2026-10-02T11:00:00.000Z',
  expiresAt: '2026-10-02T13:00:00.000Z',
}

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

const GOLDEN_POLICY_DIGEST = 'urn:sage:organization-policy:sha256:7d8a2ee170f40af191eb3b1908ef97663b24afb579734c91dd12153d390393dd'
const GOLDEN_ISSUER_DIGEST = 'urn:sage:issuer-identity:sha256:482be97ea6fe9b97641a3ef401aee896e4cf3a7db0af730752da056d0bcdf81d'

function request(sessionId: string, overrides: Record<string, unknown> = {}) {
  return {
    sessionId,
    requiredRoleRef: 'role:owner',
    operation: 'business-matter.start-attempt',
    actionPolicy: { actionScope: 'catalog.prepare-draft', effectClass: 'local-write', requiresDecision: false },
    requestedOrganizationRef: 'organization:sage',
    ...overrides,
  }
}

function expectDenied(resolution: IdentityPolicyResolution, code: IdentityPolicyDenialCode): void {
  expect(resolution.kind).toBe('denied')
  if (resolution.kind !== 'denied') throw new Error(`Expected denial ${code}.`)
  expect(resolution.code).toBe(code)
  expect(resolution.reason.length).toBeGreaterThan(0)
}

describe('Sage Authority Runtime (WT-02B.2E integration)', () => {
  let home: string
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'sage-authority-'))
  })
  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  function harness(options: { now?: string } = {}) {
    const paths = resolveSagePaths({ home, root: join(home, 'root') })
    let minted = 0
    const vault = createTokenVault({
      mintSessionRef: () => {
        minted += 1
        return `session-ref-${String(minted)}`
      },
    })
    const seenPaths: string[] = []
    const runtime = createSageAuthorityRuntime({
      vault,
      policyPath: paths.organizationPolicyFile,
      readFileBytes: (path) => {
        seenPaths.push(path)
        return readFileSync(path)
      },
      now: () => options.now ?? NOW,
    })
    return { paths, vault, runtime, seenPaths }
  }

  async function provision(paths: { readonly organizationPolicyFile: string; readonly root: string }, value: unknown = SAMPLE): Promise<void> {
    await mkdir(paths.root, { recursive: true })
    await writeFile(paths.organizationPolicyFile, JSON.stringify(value), 'utf8')
  }

  function signIn(vault: TokenVault): string {
    vault.beginPending()
    expect(vault.signIn(SESSION)).toBe(true)
    const ref = vault.identitySession()?.sessionRef
    if (ref === undefined) throw new Error('Expected an active session ref.')
    return ref
  }

  it('denies with identity-provider-unavailable when no session exists', async () => {
    const { paths, runtime } = harness()
    await provision(paths)
    expectDenied(runtime.resolve(request('session-ref-1')), 'identity-provider-unavailable')
  })

  it('resolves a signed-in session end to end against the file policy', async () => {
    const { paths, vault, runtime } = harness()
    await provision(paths)
    const ref = signIn(vault)

    const resolution = runtime.resolve(request(ref))
    expect(resolution).toEqual({
      kind: 'authorized',
      actor: { kind: 'human', roleRef: 'role:owner' },
      authoritySnapshot: {
        issuer: {
          identity: 'https://issuer.example/oidc',
          version: '1',
          digest: GOLDEN_ISSUER_DIGEST,
        },
        identityHandle: 'handle:operator-001',
        audience: SAGE_DESKTOP_AUDIENCE,
        sessionId: 'session-ref-1',
        organizationId: 'organization:sage',
        roleRef: 'role:owner',
        operation: 'business-matter.start-attempt',
        actionPolicy: { actionScope: 'catalog.prepare-draft', effectClass: 'local-write', requiresDecision: false },
        policy: { identity: 'policy:local', version: '1', digest: GOLDEN_POLICY_DIGEST },
        authenticatedAt: '2026-10-02T11:00:00.000Z',
        identityExpiresAt: '2026-10-02T13:00:00.000Z',
        policyValidFrom: '2026-10-01T00:00:00Z',
        policyExpiresAt: '2027-10-01T00:00:00Z',
        evaluatedAt: NOW,
      },
    })
    if (resolution.kind !== 'authorized') throw new Error('Expected authorization.')
    expect(Object.isFrozen(resolution)).toBe(true)
    expect(Object.isFrozen(resolution.authoritySnapshot)).toBe(true)
  })

  it('denies a policy that answers for another organization (honesty check)', async () => {
    const { paths, vault, runtime } = harness()
    await provision(paths)
    const ref = signIn(vault)
    expectDenied(
      runtime.resolve(request(ref, { requestedOrganizationRef: 'organization:other' })),
      'policy-organization-mismatch',
    )
  })

  it('denies a stale session ref and authorizes the fresh one after re-login', async () => {
    const { paths, vault, runtime } = harness()
    await provision(paths)
    const firstRef = signIn(vault)
    vault.signOut()
    vault.beginPending()
    expect(vault.signIn(SESSION)).toBe(true)

    expectDenied(runtime.resolve(request(firstRef)), 'identity-session-mismatch')
    const freshRef = vault.identitySession()?.sessionRef
    if (freshRef === undefined) throw new Error('Expected an active session ref.')
    expect(runtime.resolve(request(freshRef)).kind).toBe('authorized')
  })

  it('denies an expired id_token window', async () => {
    const { paths, vault, runtime } = harness({ now: '2026-10-02T13:00:00.000Z' })
    await provision(paths)
    const ref = signIn(vault)
    expectDenied(runtime.resolve(request(ref)), 'identity-not-active')
  })

  it('denies with policy-provider-unavailable when the file is missing', async () => {
    const { vault, runtime } = harness()
    const ref = signIn(vault)
    expectDenied(runtime.resolve(request(ref)), 'policy-provider-unavailable')
  })

  it('re-reads the policy between resolves and denies after sign-out', async () => {
    const { paths, vault, runtime } = harness()
    await provision(paths)
    const ref = signIn(vault)

    const first = runtime.resolve(request(ref))
    if (first.kind !== 'authorized') throw new Error('Expected authorization.')

    await provision(paths, { ...SAMPLE, policy: { identity: 'policy:local', version: '2' } })
    const second = runtime.resolve(request(ref))
    if (second.kind !== 'authorized') throw new Error('Expected authorization.')
    expect(second.authoritySnapshot.policy.version).toBe('2')
    expect(second.authoritySnapshot.policy.digest).not.toBe(first.authoritySnapshot.policy.digest)

    vault.signOut()
    expectDenied(runtime.resolve(request(ref)), 'identity-provider-unavailable')
  })

  it('reads exactly the policy path and keeps the renderer snapshot leak-free', async () => {
    const { paths, vault, runtime, seenPaths } = harness()
    await provision(paths)
    const ref = signIn(vault)
    runtime.resolve(request(ref))
    expect(seenPaths).toEqual([paths.organizationPolicyFile])
    expect(Object.keys(vault.snapshot()).sort()).toEqual(['displayName', 'status'])
  })
})
