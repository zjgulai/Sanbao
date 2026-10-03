import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createBusinessMatter, enterEvidence, type BusinessMatter } from '../src/domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../src/domain/business-matter-codec.js'
import { openBusinessMatterEventStore } from '../src/persistence/business-matter-event-store.js'
import { resolveSagePaths, type SagePaths } from '../src/profile/paths.js'
import { PRODUCTION_FAIL_CLOSED_PORTS } from '../src/appservice/composition.js'
import { runCommand } from '../src/appservice/command-pipeline.js'
import { createMatterRehydratePort } from '../src/main/matter-rehydrate-port.js'
import type { SageIntentV2 } from '../src/appservice/command-contracts.js'
import { createSageAppServiceProviders } from '../src/main/app-service.js'
import { createTokenVault } from '../src/main/token-vault.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'

/**
 * Step-3 wiring: the rehydrate port reads the Sage-owned matter store instead of answering
 * "no provider". These cases pin both directions — a stored stream is really read, and every
 * uncertain path (unopenable / closed / blocked) still fails closed.
 */

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function temporaryPaths(label: string): Promise<SagePaths> {
  const physical = await realpath(tmpdir())
  const container = await mkdtemp(join(physical, `sage-rehydrate-${label}-`))
  const home = join(container, 'home')
  const root = join(container, 'Sage')
  mkdirSync(home, { mode: 0o700 })
  mkdirSync(root, { mode: 0o700 })
  cleanups.push(() => rm(container, { recursive: true, force: true }))
  return resolveSagePaths({ home, platform: 'darwin', root })
}

function matterWithEvidence(matterId: string): BusinessMatter {
  return enterEvidence(createBusinessMatter({
    matterId,
    eventId: `${matterId}:created`,
    occurredAt: '2026-10-02T00:00:00Z',
    goal: 'Prepare a reviewable draft.',
    responsibleParty: { kind: 'human', roleRef: 'role:owner' },
  }), {
    eventId: `${matterId}:revision-1`,
    occurredAt: '2026-10-02T00:01:00Z',
    revisionId: 'revision:1',
    changeReason: 'Initial evidence.',
    scope: 'Draft only.',
    permissionBoundary: 'No publication.',
    dataDestination: 'Temporary test database.',
    evidence: [{ evidenceId: 'evidence:brief', source: 'fixture:brief', observedAt: '2026-10-02T00:00:30Z', status: 'supported' }],
    unknowns: [],
    options: [],
    dependencies: [],
    experienceRefs: [],
    actionPolicies: [{ actionScope: 'draft.prepare', effectClass: 'local-write', requiresDecision: false }],
  })
}

async function storeWithMatter(matterId: string, paths: SagePaths): Promise<void> {
  const store = openBusinessMatterEventStore({
    sagePaths: paths,
    maxStreamEvents: 32,
    maxPayloadBytes: 64 * 1024,
    busyTimeoutMs: 75,
    clock: () => '2026-10-02T00:02:00Z',
  })
  cleanups.push(() => store.close())
  const matter = matterWithEvidence(matterId)
  const result = store.append({
    matterId,
    expectedVersion: { kind: 'not-exists' },
    appendId: 'append:create',
    events: encodeBusinessMatterEvents(matter).map((event) => ({
      matterId: event.matterId,
      eventId: event.eventId,
      eventType: event.eventType,
      eventSchemaVersion: event.eventSchemaVersion,
      occurredAt: event.occurredAt,
      payloadBytes: event.payloadBytes.slice(),
    })),
  })
  expect(result.kind, JSON.stringify(result)).toBe('appended')
}

const intent = {
  matterId: 'matter:stored',
  revisionId: 'revision:1',
  actionType: 'start-attempt',
  actionScope: 'revision',
  payload: {},
  origin: 'renderer-action',
} as unknown as SageIntentV2

describe('the rehydrate port reads the real store and fails closed on everything else', () => {
  it('answers not-found for an empty store instead of claiming a missing provider', async () => {
    const paths = await temporaryPaths('empty')
    const port = createMatterRehydratePort({ sagePaths: paths })
    cleanups.push(() => port.close())
    expect(port.strictRehydrate({ matterId: 'matter:absent', revisionId: 'revision:1' })).toEqual({ denied: 'not-found' })
  })

  it('returns the stored stream and marks the requested revision current only when it matches', async () => {
    const paths = await temporaryPaths('stored')
    await storeWithMatter('matter:stored', paths)
    const port = createMatterRehydratePort({ sagePaths: paths })
    cleanups.push(() => port.close())

    const current = port.strictRehydrate({ matterId: 'matter:stored', revisionId: 'revision:1' })
    expect(current).toMatchObject({ current: true })
    expect('matter' in (current as object)).toBe(true)

    const stale = port.strictRehydrate({ matterId: 'matter:stored', revisionId: 'revision:9' })
    expect(stale).toMatchObject({ current: false })
  })

  it('fails closed when the store cannot be opened or has been closed', async () => {
    const paths = await temporaryPaths('broken')
    // A file where the store expects its data directory: opening must throw, and the port must
    // report "unavailable" rather than an empty history.
    writeFileSync(join(paths.root, 'data'), 'not a directory')
    const broken = createMatterRehydratePort({ sagePaths: paths })
    cleanups.push(() => broken.close())
    expect(broken.strictRehydrate({ matterId: 'matter:x', revisionId: 'revision:1' })).toBeUndefined()

    const paths2 = await temporaryPaths('closed')
    const port = createMatterRehydratePort({ sagePaths: paths2 })
    port.close()
    expect(port.strictRehydrate({ matterId: 'matter:x', revisionId: 'revision:1' })).toBeUndefined()
  })
})

describe('the wired step 3 changes the denial, not the guard', () => {
  /** Step 2 as the real authority port answers when the policy allows: the point of these cases is
   *  what happens *after* it, so the earlier stage is held open explicitly. */
  const authorityAllows = {
    resolveIdentityPolicy: () => ({ kind: 'authorized' as const, actor: {}, authoritySnapshot: {} }),
  } as const

  it('denies a missing matter at the rehydrate stage without leaking existence', async () => {
    const paths = await temporaryPaths('missing-stage')
    const port = createMatterRehydratePort({ sagePaths: paths })
    cleanups.push(() => port.close())
    const result = runCommand({
      intent,
      correlation: 'c-rehydrate',
      ports: { ...PRODUCTION_FAIL_CLOSED_PORTS, ...authorityAllows, strictRehydrate: port.strictRehydrate },
    })
    expect(result).toMatchObject({ code: 'policy-denied', stage: 'rehydrate', retryable: false })
  })

  it('lets a stored matter past step 3 and still stops at the next fail-closed step', async () => {
    const paths = await temporaryPaths('stored-stage')
    await storeWithMatter('matter:stored', paths)
    const port = createMatterRehydratePort({ sagePaths: paths })
    cleanups.push(() => port.close())
    const result = runCommand({
      intent,
      correlation: 'c-target',
      ports: { ...PRODUCTION_FAIL_CLOSED_PORTS, ...authorityAllows, strictRehydrate: port.strictRehydrate },
    })
    // Steps 4-10 are untouched by this wiring: the pipeline must stop at the target step.
    expect(result).toMatchObject({ code: 'compatibility-unknown', stage: 'target', retryable: true })
  })
})

describe('the production assembly really merges the port (option → step 3)', () => {
  const NOW = '2026-10-02T12:00:00.000Z'

  it('turns the step-3 denial from "no provider" into the store’s own answer', async () => {
    const paths = await temporaryPaths('assembly')
    // A local instance-operator policy that grants start-attempt, so step 2 may pass.
    const policy = {
      schemaVersion: 'sage.organization-policy.v1',
      organizationId: 'organization:sage',
      policy: { identity: 'policy:local', version: '1' },
      validFrom: '2026-10-01T00:00:00Z',
      expiresAt: '2027-10-01T00:00:00Z',
      membership: { mode: 'instance-operator', roleRefs: ['role:owner'] },
      grants: [{
        roleRef: 'role:owner',
        operation: 'start-attempt',
        actionScope: 'shopify.orders.read',
        effectClass: 'external-read',
        requiresDecision: true,
      }],
    }
    mkdirSync(dirname(paths.organizationPolicyFile), { recursive: true })
    writeFileSync(paths.organizationPolicyFile, JSON.stringify(policy))

    const vault = createTokenVault({ mintSessionRef: () => 'session-ref-1' })
    vault.beginPending()
    vault.signIn({
      accessToken: 'at',
      idToken: 'it',
      displayName: 'Alice',
      identityHandle: 'handle:operator-001',
      issuer: 'https://issuer.example/oidc',
      authenticatedAt: '2026-10-02T11:00:00.000Z',
      expiresAt: '2026-10-02T13:00:00.000Z',
    })

    const port = createMatterRehydratePort({ sagePaths: paths })
    cleanups.push(() => port.close())
    const providers = createSageAppServiceProviders({
      viewState: { status: 'ready', message: 'probe', retryable: true },
      vault,
      adapter: { startLogin: async () => ({ ok: false as const, code: 'idp-unreachable' as const }) },
      authority: {
        policyPath: paths.organizationPolicyFile,
        readFileBytes: (path) => readFileSync(path),
        now: () => NOW,
      },
      matterRehydrate: port.strictRehydrate,
    })
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(intent),
    }), { callerBinding: { correlation: 'c-assembly' }, providers } as never)
    const body = await response.json() as Record<string, unknown>
    // Without the merge this would still be identity-unavailable@rehydrate; the store answers now.
    expect(body).toMatchObject({ code: 'policy-denied', stage: 'rehydrate', retryable: false })
  })
})
