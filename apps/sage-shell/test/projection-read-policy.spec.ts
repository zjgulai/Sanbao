// T03: main-owned read authority. Selection-time matter reads and projection reads share one
// policy evaluation over the instance-local organization policy; a granted selection mints a
// high-entropy actor scope that the later projection read must return unchanged. Fail closed:
// an unanswerable policy question is `undefined` (unavailable), a negative answer is `denied`,
// and a matter with no bound scope is denied with the same surface answer as an explicit refusal.
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProjectionReadPolicy } from '../src/main/projection-read-policy.js'
import type { VaultIdentitySession } from '../src/main/token-vault.js'

const NOW = '2026-10-05T12:00:00.000Z'

const SESSION: VaultIdentitySession = {
  sessionRef: 'session:one',
  identityHandle: 'handle:operator-001',
  issuer: 'https://issuer.example/oidc',
  authenticatedAt: '2026-10-05T11:00:00.000Z',
  expiresAt: '2026-10-05T13:00:00.000Z',
}

function policyFile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 'sage.organization-policy.v1',
    organizationId: 'organization:sage',
    policy: { identity: 'policy:local', version: '1' },
    validFrom: '2026-10-01T00:00:00Z',
    expiresAt: '2027-10-01T00:00:00Z',
    membership: { mode: 'instance-operator', roleRefs: ['role:owner'] },
    grants: [
      { roleRef: 'role:owner', operation: 'matter.read', actionScope: 'matter.read', effectClass: 'local-read', requiresDecision: false },
      { roleRef: 'role:owner', operation: 'state.read', actionScope: 'projection.read', effectClass: 'local-read', requiresDecision: false },
    ],
    ...overrides,
  }
}

describe('main-owned projection read policy', () => {
  let root = ''
  let policyPath = ''

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sage-read-policy-'))
    policyPath = join(root, 'organization-policy.json')
  })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  function makePolicy(session: VaultIdentitySession | null, clock: () => string = () => NOW) {
    return createProjectionReadPolicy({
      vault: { identitySession: () => session },
      policyPath,
      readFileBytes: readFileSync,
      now: clock,
    })
  }

  async function writePolicy(value: unknown): Promise<void> {
    await mkdir(root, { recursive: true })
    await writeFile(policyPath, JSON.stringify(value))
  }

  it('answers unavailable while the identity session is absent or the policy file is missing', async () => {
    await writePolicy(policyFile())
    const withoutSession = makePolicy(null)
    expect(await withoutSession.authorizeMatterRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one' })).toBeUndefined()
    expect(await withoutSession.authorizeProjectionRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one', operation: 'state.read' })).toBeUndefined()

    // Session present but the policy file itself is missing: the question cannot be answered.
    await rm(policyPath)
    const withSession = makePolicy(SESSION)
    expect(withSession.authorizeMatterRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one' })).toBeUndefined()
    expect(await withSession.authorizeProjectionRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one', operation: 'state.read' })).toBeUndefined()

    // With both present, selection is decidable (allow), but a projection read for a matter
    // with no bound selection is a denial — never an inheritance from the grant alone.
    await writePolicy(policyFile())
    expect(withSession.authorizeMatterRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one' })?.state).toBe('allowed')
    expect(await withSession.authorizeProjectionRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:two', operation: 'state.read' }))
      .toEqual({ state: 'denied' })
  })

  it('denies a stale session ref, an expired session or an expired policy window', async () => {
    await writePolicy(policyFile())
    const policy = makePolicy(SESSION)
    expect(await policy.authorizeProjectionRead({ sessionRef: 'session:other', matterId: 'matter:one', operation: 'state.read' }))
      .toEqual({ state: 'denied' })

    const expiredSession: VaultIdentitySession = { ...SESSION, expiresAt: '2026-10-05T11:30:00.000Z' }
    const expired = makePolicy(expiredSession)
    expect(await expired.authorizeProjectionRead({ sessionRef: expiredSession.sessionRef, matterId: 'matter:one', operation: 'state.read' }))
      .toEqual({ state: 'denied' })

    const stalePolicy = makePolicy(SESSION, () => '2027-11-01T00:00:00.000Z')
    expect(await stalePolicy.authorizeProjectionRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one', operation: 'state.read' }))
      .toEqual({ state: 'denied' })
  })

  it('denies a malformed policy file instead of answering unavailable', async () => {
    await writePolicy({ schemaVersion: 'sage.organization-policy.v1' })
    const policy = makePolicy(SESSION)
    expect(await policy.authorizeProjectionRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one', operation: 'state.read' }))
      .toEqual({ state: 'denied' })
  })

  it('denies operations the policy does not grant for the membership role, and never stretches one grant across scopes or effect classes', async () => {
    await writePolicy(policyFile({
      grants: [
        { roleRef: 'role:owner', operation: 'matter.read', actionScope: 'matter.read', effectClass: 'external-write', requiresDecision: false },
      ],
    }))
    const policy = makePolicy(SESSION)
    // The selection grant requires local-read; an external-write grant is not a read authority.
    expect(await policy.authorizeMatterRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one' })).toEqual({ state: 'denied' })
    // And a projection operation that no grant names is denied, not unavailable.
    expect(await policy.authorizeProjectionRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one', operation: 'search.query' }))
      .toEqual({ state: 'denied' })
  })

  it('binds a fresh high-entropy actor scope at selection and returns the same scope with a decision ref at read time', async () => {
    await writePolicy(policyFile())
    const policy = makePolicy(SESSION)
    const first = await policy.authorizeMatterRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one' })
    if (first === undefined || first.state !== 'allowed') throw new Error('expected selection allow')
    expect(first.actorScopeRef.startsWith('scope:')).toBe(true)
    expect(first.actorScopeRef.length).toBeGreaterThanOrEqual(24)
    const second = await policy.authorizeMatterRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one' })
    if (second === undefined || second.state !== 'allowed') throw new Error('expected second allow')
    // Each selection binds its own scope; the ledger keeps the latest per (session, matter).
    expect(second.actorScopeRef).not.toBe(first.actorScopeRef)

    const read = await policy.authorizeProjectionRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one', operation: 'state.read' })
    if (read === undefined || read.state !== 'allowed') throw new Error('expected projection allow')
    expect(read.actorScopeRef).toBe(second.actorScopeRef)
    expect(read.decisionRef).toContain('state.read')

    // A different matter never inherits another matter's bound scope.
    expect(await policy.authorizeProjectionRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:two', operation: 'state.read' }))
      .toEqual({ state: 'denied' })
  })

  it('denies a projection read whose bound scope was minted under a different policy version', async () => {
    await writePolicy(policyFile())
    const policy = makePolicy(SESSION)
    const selection = await policy.authorizeMatterRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one' })
    if (selection === undefined || selection.state !== 'allowed') throw new Error('expected selection allow')

    await writePolicy(policyFile({ policy: { identity: 'policy:local', version: '2' } }))
    expect(await policy.authorizeProjectionRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one', operation: 'state.read' }))
      .toEqual({ state: 'denied' })
  })

  it('drops bound scopes when the identity session changes', async () => {
    await writePolicy(policyFile())
    let session: VaultIdentitySession | null = SESSION
    const policy = createProjectionReadPolicy({
      vault: { identitySession: () => session },
      policyPath,
      readFileBytes: readFileSync,
      now: () => NOW,
    })
    const selection = await policy.authorizeMatterRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one' })
    if (selection === undefined || selection.state !== 'allowed') throw new Error('expected selection allow')

    session = { ...SESSION, sessionRef: 'session:two' }
    expect(await policy.authorizeProjectionRead({ sessionRef: SESSION.sessionRef, matterId: 'matter:one', operation: 'state.read' }))
      .toEqual({ state: 'denied' })
  })
})
