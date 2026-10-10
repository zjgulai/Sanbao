import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSessionCoreIdentityPort } from '../src/main/session-core-identity.js'
import { createTokenVault } from '../src/main/token-vault.js'
import type { TokenVault, VaultSession } from '../src/main/token-vault.js'
import { resolveSagePaths } from '../src/profile/paths.js'

/**
 * T05 first cut (ADR-0275): the session-family Identity / Policy step. The cases pin the port's
 * observable contract — unregistered operations never cost a policy read; missing session or
 * policy stays unavailable; a policy without the exact grant denies; an exact grant authorizes
 * with opaque, stable facts. Whether the later steps exist is not this port's question.
 */

const NOW = '2026-10-10T12:00:00.000Z'

const SESSION: VaultSession = {
  accessToken: 'at',
  idToken: 'it',
  displayName: 'Alice',
  identityHandle: 'handle:operator-001',
  issuer: 'https://issuer.example/oidc',
  authenticatedAt: '2026-10-10T11:00:00.000Z',
  expiresAt: '2026-10-10T13:00:00.000Z',
}

const SESSION_SEND_GRANT = {
  roleRef: 'role:owner',
  operation: 'session.send',
  actionScope: 'session.prompt',
  effectClass: 'external-write',
  requiresDecision: false,
}

function policy(grants: readonly unknown[]): Record<string, unknown> {
  return {
    schemaVersion: 'sage.organization-policy.v1',
    organizationId: 'organization:sage',
    policy: { identity: 'policy:local', version: '1' },
    validFrom: '2026-10-01T00:00:00Z',
    expiresAt: '2027-10-01T00:00:00Z',
    membership: { mode: 'instance-operator', roleRefs: ['role:owner'] },
    grants,
  }
}

describe('the session-family identity port (ADR-0275)', () => {
  let home: string
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'sage-session-identity-'))
  })
  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  function harness(overrides: { readonly now?: string } = {}) {
    const paths = resolveSagePaths({ home, root: join(home, 'root') })
    let minted = 0
    const vault = createTokenVault({ mintSessionRef: () => `session-ref-${String(++minted)}` })
    const readFileBytes = vi.fn((path: string) => readFileSync(path))
    const port = createSessionCoreIdentityPort({
      vault,
      authority: { policyPath: paths.organizationPolicyFile, readFileBytes, now: () => overrides.now ?? NOW },
    })
    return { paths, vault, port, readFileBytes }
  }

  async function provision(paths: { readonly organizationPolicyFile: string; readonly root: string }, value: unknown): Promise<void> {
    await mkdir(paths.root, { recursive: true })
    await writeFile(paths.organizationPolicyFile, JSON.stringify(value), 'utf8')
  }

  function signIn(vault: TokenVault): void {
    vault.beginPending()
    expect(vault.signIn(SESSION)).toBe(true)
  }

  function requestFor(operation: string) {
    return {
      intent: {
        family: 'session-core' as const,
        requestId: 'request-0001',
        operation,
        candidate: { kind: 'active-session' as const },
        payload: {},
      },
      correlation: 'corr-t05',
      caller: { bindingRef: 'caller:one' },
      context: {
        scope: 'request' as const,
        callerBindingRef: 'caller:one',
        sessionRef: 'session-ref-1',
        matterRef: 'matter:one',
        revisionRef: 'revision:one',
        generation: '1',
      },
      candidateMatch: { candidateRef: 'candidate:one' },
    }
  }

  it('answers unavailable for an unregistered operation without costing a policy read', async () => {
    const { paths, vault, port, readFileBytes } = harness()
    await provision(paths, policy([SESSION_SEND_GRANT]))
    signIn(vault)

    expect(await port(requestFor('session.stop'))).toEqual({ state: 'unavailable' })
    expect(readFileBytes).not.toHaveBeenCalled()
  })

  it('stays unavailable without a session or without a loadable policy', async () => {
    const bare = harness()
    // No session and no policy file at all.
    expect(await bare.port(requestFor('session.send'))).toEqual({ state: 'unavailable' })
    // A session without a loadable policy is still unavailable, never denied.
    signIn(bare.vault)
    expect(await bare.port(requestFor('session.send'))).toEqual({ state: 'unavailable' })
  })

  it('stays unavailable with a loadable policy but no session', async () => {
    const { paths, port } = harness()
    await provision(paths, policy([SESSION_SEND_GRANT]))
    expect(await port(requestFor('session.send'))).toEqual({ state: 'unavailable' })
  })

  it('denies the request when the policy carries no exact grant', async () => {
    const { paths, vault, port } = harness()
    await provision(paths, policy([{ ...SESSION_SEND_GRANT, actionScope: 'session.other' }]))
    signIn(vault)
    expect(await port(requestFor('session.send'))).toEqual({ state: 'denied' })

    const empty = harness()
    await provision(empty.paths, policy([]))
    signIn(empty.vault)
    expect(await empty.port(requestFor('session.send'))).toEqual({ state: 'denied' })
  })

  it('authorizes with opaque facts: stable for the actor, fresh per evaluation', async () => {
    const first = harness()
    await provision(first.paths, policy([SESSION_SEND_GRANT]))
    signIn(first.vault)

    const one = await first.port(requestFor('session.send'))
    expect(one.state).toBe('allowed')
    if (one.state !== 'allowed') return
    expect(Object.keys(one.value).sort()).toEqual(['actorScopeRef', 'decisionRef'])

    const second = harness({ now: '2026-10-10T12:00:05.000Z' })
    await provision(second.paths, policy([SESSION_SEND_GRANT]))
    signIn(second.vault)
    const two = await second.port(requestFor('session.send'))
    if (two.state !== 'allowed') throw new Error('expected authorization')

    // The actor scope is stable across evaluations and sessions; the decision ref is not.
    expect(two.value.actorScopeRef).toBe(one.value.actorScopeRef)
    expect(two.value.decisionRef).not.toBe(one.value.decisionRef)

    // Facts are opaque: no raw issuer, handle or organization appears in them.
    const serialized = `${one.value.actorScopeRef} ${one.value.decisionRef}`
    expect(serialized).not.toContain('handle:operator-001')
    expect(serialized).not.toContain('issuer.example')
    expect(serialized).not.toContain('organization:sage')
  })
})
