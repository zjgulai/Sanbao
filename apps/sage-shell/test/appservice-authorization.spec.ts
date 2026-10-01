import { readFileSync, readdirSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createSageAppServiceProviders } from '../src/main/app-service.js'
import { createTokenVault } from '../src/main/token-vault.js'
import type { TokenVault, VaultSession } from '../src/main/token-vault.js'
import { resolveSagePaths } from '../src/profile/paths.js'
import type { ServiceProviders } from '../src/appservice/contracts.js'

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

const GRANT = {
  roleRef: 'role:owner',
  operation: 'start-attempt',
  actionScope: 'shopify.orders.read',
  effectClass: 'external-read',
  requiresDecision: true,
}

function policy(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'sage.organization-policy.v1',
    organizationId: 'organization:sage',
    policy: { identity: 'policy:local', version: '1' },
    validFrom: '2026-10-01T00:00:00Z',
    expiresAt: '2027-10-01T00:00:00Z',
    membership: { mode: 'instance-operator', roleRefs: ['role:owner'] },
    grants: [GRANT],
    ...overrides,
  }
}

const BUSINESS_INTENT = {
  matterId: 'matter:demo',
  revisionId: 'revision:demo.1',
  actionType: 'start-attempt',
  actionScope: 'revision',
  payload: {},
  origin: 'renderer-action',
}

describe('authorization path end to end through the production assembly (WT-02D.2A)', () => {
  let home: string
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'sage-d2a-'))
  })
  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  function harness(options: { now?: string } = {}) {
    const paths = resolveSagePaths({ home, root: join(home, 'root') })
    const vault = createTokenVault({ mintSessionRef: () => 'session-ref-1' })
    const providers = createSageAppServiceProviders({
      viewState: { status: 'ready', message: 'probe', retryable: true },
      vault,
      adapter: { startLogin: async () => ({ ok: false as const, code: 'idp-unreachable' as const }) },
      authority: {
        policyPath: paths.organizationPolicyFile,
        readFileBytes: (path) => readFileSync(path),
        now: () => options.now ?? NOW,
      },
    })
    return { paths, vault, providers }
  }

  async function provision(paths: { readonly organizationPolicyFile: string; readonly root: string }, value: unknown): Promise<void> {
    await mkdir(paths.root, { recursive: true })
    await writeFile(paths.organizationPolicyFile, JSON.stringify(value), 'utf8')
  }

  function signIn(vault: TokenVault, session: VaultSession = SESSION): string {
    vault.beginPending()
    expect(vault.signIn(session)).toBe(true)
    const ref = vault.identitySession()?.sessionRef
    if (ref === undefined) throw new Error('Expected an active session ref.')
    return ref
  }

  async function post(providers: ServiceProviders, body: unknown) {
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }), { callerBinding: { correlation: 'c-e2e' }, providers })
    return { status: response.status, body: await response.json() as Record<string, unknown> }
  }

  it('retry is identity-unavailable while signed out and available for a healthy session+policy', async () => {
    const { paths, vault, providers } = harness()
    await provision(paths, policy())

    const signedOut = await post(providers, { type: 'retry' })
    expect(signedOut.status).toBe(200)
    expect(signedOut.body).toMatchObject({ code: 'identity-unavailable', stage: 'identity-policy', retryable: true })

    signIn(vault)
    const available = await post(providers, { type: 'retry' })
    expect(available.status).toBe(200)
    expect(available.body).toMatchObject({ availability: 'available' })
    expect(typeof available.body.correlation).toBe('string')
  })

  it('retry is identity-unavailable when the policy window is expired at the trusted instant', async () => {
    const { paths, vault, providers } = harness({ now: '2027-06-01T00:00:00.000Z' })
    await provision(paths, policy({ expiresAt: '2027-01-01T00:00:00Z' }))
    signIn(vault, {
      ...SESSION,
      authenticatedAt: '2027-05-31T20:00:00.000Z',
      expiresAt: '2027-06-01T04:00:00.000Z',
    })
    const body = await post(providers, { type: 'retry' })
    expect(body.body).toMatchObject({ code: 'identity-unavailable', stage: 'identity-policy', retryable: true })
  })

  it('business intent fails closed with identity-unavailable when signed out', async () => {
    const { paths, providers } = harness()
    await provision(paths, policy())
    const result = await post(providers, BUSINESS_INTENT)
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ code: 'identity-unavailable', stage: 'identity-policy', retryable: true })
  })

  it('business intent with an unregistered action type is policy-denied before evaluation', async () => {
    const { paths, vault, providers } = harness()
    await provision(paths, policy())
    signIn(vault)
    const result = await post(providers, { ...BUSINESS_INTENT, actionType: 'answer-clarification' })
    expect(result.body).toMatchObject({ code: 'policy-denied', stage: 'identity-policy' })
  })

  it('business intent denied by the real policy when no grant matches', async () => {
    const { paths, vault, providers } = harness()
    await provision(paths, policy({ grants: [] }))
    signIn(vault)
    const result = await post(providers, BUSINESS_INTENT)
    expect(result.body).toMatchObject({ code: 'policy-denied', stage: 'identity-policy' })
  })

  it('business intent passes step 2 and fails closed at rehydrate (the advance this ticket buys)', async () => {
    const { paths, vault, providers } = harness()
    await provision(paths, policy())
    signIn(vault)
    const result = await post(providers, BUSINESS_INTENT)
    expect(result.body).toMatchObject({ code: 'identity-unavailable', stage: 'rehydrate', retryable: true })
  })

  it('business intent is identity-unavailable when the policy file is missing (no clue)', async () => {
    const { vault, providers } = harness()
    signIn(vault)
    const result = await post(providers, BUSINESS_INTENT)
    expect(result.body).toMatchObject({ code: 'identity-unavailable', stage: 'identity-policy' })
  })

  it('the organization clue follows the policy file instead of a hardcoded org', async () => {
    const { paths, vault, providers } = harness()
    await provision(paths, policy({ organizationId: 'organization:alt' }))
    signIn(vault)
    const result = await post(providers, BUSINESS_INTENT)
    // A hardcoded 'organization:sage' clue would trip the kernel honesty check into
    // policy-organization-mismatch; reaching rehydrate proves the clue came from the file.
    expect(result.body).toMatchObject({ code: 'identity-unavailable', stage: 'rehydrate' })
  })

  it('rejects malformed intents with 400 and leaves the policy file untouched', async () => {
    const { paths, vault, providers } = harness()
    await provision(paths, policy())
    signIn(vault)
    const before = readFileSync(paths.organizationPolicyFile)

    const malformed = await post(providers, { matterId: 'matter:demo', actionType: 'start-attempt' })
    expect(malformed.status).toBe(400)
    expect(malformed.body).toMatchObject({ code: 'invalid-intent', stage: 'intent' })

    await post(providers, BUSINESS_INTENT)
    expect(readFileSync(paths.organizationPolicyFile)).toEqual(before)
    expect(readdirSync(paths.root).sort()).toEqual(['organization-policy.json'])
  })
})
