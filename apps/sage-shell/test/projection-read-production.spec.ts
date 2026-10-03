import { describe, expect, it, vi } from 'vitest'

import type { ProjectionReadCandidate } from '../src/appservice/contracts.js'
import type { ProjectionReadIntent, ProjectionReadScope } from '../src/appservice/projection-read-admission.js'
import { createSageAppServiceProviders, type SageAppServiceOptions } from '../src/main/app-service.js'
import { createActiveMatterContext, type ActiveMatterContext } from '../src/main/active-matter-context.js'
import { projectionReadScope } from '../src/main/projection-read-scope.js'
import { createTokenVault, type TokenVault } from '../src/main/token-vault.js'

const ACTIVE_SCOPE = {
  actorScopeRef: 'actor:policy',
  matterId: 'matter:one',
  revisionId: 'revision:one.1',
  workspaceRef: 'workspace:one',
  trustedWorkspaceRoot: '/trusted/workspace',
  sessionRef: 'session:one',
  frameGeneration: 7,
} as const

function signedInVault(): TokenVault {
  const vault = createTokenVault({ mintSessionRef: () => ACTIVE_SCOPE.sessionRef })
  expect(vault.beginPending()).toBe(true)
  expect(vault.signIn({
    accessToken: 'test-access-token',
    idToken: 'test-id-token',
    displayName: 'Reader',
    // Deliberately not actorScopeRef: authentication identity is not read-policy authority.
    identityHandle: 'identity:not-an-actor-scope',
    issuer: 'https://idp.example.test',
    authenticatedAt: '2026-10-03T00:00:00.000Z',
    expiresAt: '2026-10-03T01:00:00.000Z',
  })).toBe(true)
  return vault
}

function activeContext(): ActiveMatterContext {
  const context = createActiveMatterContext()
  expect(context.activate({ expectedContextGeneration: 0, next: ACTIVE_SCOPE }).ok).toBe(true)
  return context
}

function productionOptions(overrides: Partial<SageAppServiceOptions> = {}): {
  readonly options: SageAppServiceOptions
  readonly context: ActiveMatterContext
  readonly matterRehydrate: ReturnType<typeof vi.fn>
  readonly workspaceList: ReturnType<typeof vi.fn>
} {
  const context = activeContext()
  const matterRehydrate = vi.fn(() => ({ matter: {} as never, current: true as const }))
  const workspaceList = vi.fn(async () => ({
    source: 'workspace-follow' as const,
    state: 'read' as const,
    reason: null,
    entries: [{
      workspaceId: ACTIVE_SCOPE.workspaceRef,
      path: ACTIVE_SCOPE.trustedWorkspaceRoot,
      title: 'Workspace',
      sessionCount: 1,
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
    }],
    order: [ACTIVE_SCOPE.workspaceRef],
    archivedSessions: 0,
    frames: 1,
    unapplied: 0,
  }))
  const options: SageAppServiceOptions = {
    viewState: null,
    vault: signedInVault(),
    adapter: { startLogin: async () => ({ ok: false as const, code: 'not-used' }) } as never,
    callerBinding: { correlation: 'caller:one' },
    activeMatterContext: context,
    framePolicySnapshot: () => ({ generation: 7, ready: true, contaminated: false, contaminationReasons: [] }),
    authorizeProjectionRead: () => ({ state: 'allowed', actorScopeRef: ACTIVE_SCOPE.actorScopeRef, decisionRef: 'decision:read' }),
    matterRehydrate,
    matterLinks: () => ({
      state: 'read',
      links: [{
        matterRef: ACTIVE_SCOPE.matterId,
        workspaceRef: ACTIVE_SCOPE.workspaceRef,
        workspacePath: ACTIVE_SCOPE.trustedWorkspaceRoot,
        linkedAt: '2026-10-03T00:00:00.000Z',
        isDefault: true,
      }],
      trail: [],
    }),
    workspaceList,
    ...overrides,
  }
  return { options, context, matterRehydrate, workspaceList }
}

function run(
  options: SageAppServiceOptions,
  intent: ProjectionReadIntent<ProjectionReadCandidate>,
  read: (scope: ProjectionReadScope) => Promise<Response>,
) {
  const runner = createSageAppServiceProviders(options).runProjectionRead
  expect(runner).toBeDefined()
  return runner!(intent, read)
}

describe('production projection-read assembly', () => {
  it('stops at the independent read-policy port before store, workspace or raw reads', async () => {
    const { options, matterRehydrate, workspaceList } = productionOptions({ authorizeProjectionRead: undefined })
    const raw = vi.fn(async () => Response.json({ raw: true }))

    const result = await run(options, {
      operation: 'session.history.list',
      candidate: { kind: 'active-matter' },
    }, raw)

    expect(result).toMatchObject({
      state: 'unavailable',
      code: 'projection-read-unavailable',
      stage: 'read-policy',
    })
    expect(matterRehydrate).not.toHaveBeenCalled()
    expect(workspaceList).not.toHaveBeenCalled()
    expect(raw).not.toHaveBeenCalled()
  })

  it('runs an admitted active-matter read inside one immutable request scope', async () => {
    const { options } = productionOptions()
    let callbackScope: ProjectionReadScope | undefined

    const result = await run(options, {
      operation: 'session.history.list',
      candidate: { kind: 'active-matter' },
    }, async (scope) => {
      callbackScope = projectionReadScope.current()
      expect(callbackScope).toEqual(scope)
      expect(callbackScope).not.toBe(scope)
      expect(Object.isFrozen(callbackScope)).toBe(true)
      return Response.json({ ok: true })
    })

    expect(result.state).toBe('read')
    expect(callbackScope).toMatchObject({
      matterRef: ACTIVE_SCOPE.matterId,
      actorScopeRef: ACTIVE_SCOPE.actorScopeRef,
      sessionRef: ACTIVE_SCOPE.sessionRef,
    })
    expect(projectionReadScope.current()).toBeUndefined()
  })

  it.each([
    ['state.read', { kind: 'collection', collection: 'state' }],
    ['search.query', { kind: 'collection', collection: 'search' }],
  ] as const)('does not widen one matter grant to the %s collection', async (operation, candidate) => {
    const { options } = productionOptions()
    const raw = vi.fn(async () => Response.json({ raw: true }))

    const result = await run(options, { operation, candidate }, raw)

    expect(result).toMatchObject({ state: 'unavailable', stage: 'candidate-match' })
    expect(raw).not.toHaveBeenCalled()
  })

  it('keeps opaque object reads blocked until a main-owned object-to-scope resolver exists', async () => {
    const { options } = productionOptions()
    const raw = vi.fn(async () => Response.json({ raw: true }))

    const result = await run(options, {
      operation: 'artifacts.open',
      candidate: { kind: 'opaque', resource: 'artifact', id: 'artifact:one' },
    }, raw)

    expect(result).toMatchObject({ state: 'unavailable', stage: 'candidate-match' })
    expect(raw).not.toHaveBeenCalled()
  })

  it('drops a value when ActiveContext changes during the raw read', async () => {
    const { options, context } = productionOptions()
    const snapshot = context.snapshot()
    expect(snapshot).not.toBeNull()

    const result = await run(options, {
      operation: 'session.history.detail',
      candidate: { kind: 'active-matter' },
    }, async () => {
      context.invalidate({ expected: snapshot! })
      return Response.json({ stale: true })
    })

    expect(result).toMatchObject({ state: 'unavailable', stage: 'post-read-freshness' })
    expect(result).not.toHaveProperty('value')
  })

  it('permits only the explicit state fixture without production authority', async () => {
    const raw = vi.fn(async () => {
      expect(projectionReadScope.current()?.matterRef).toBe('matter:fixture')
      return Response.json({ fixture: true })
    })
    const options: SageAppServiceOptions = {
      viewState: null,
      vault: createTokenVault({ mintSessionRef: () => 'unused' }),
      adapter: { startLogin: async () => ({ ok: false as const, code: 'not-used' }) } as never,
      fixtureProjection: () => ({
        schemaVersion: 'sage.matter-view-state.v1',
        projectionSource: 'fixture',
        matter: {
          matterId: 'matter:fixture', goal: 'Fixture', responsiblePartyRoleRef: 'role:fixture',
          stage: 'clarifying', conclusion: undefined, currentRevisionId: 'revision:fixture.1',
          revisionCount: 1, evidenceCount: 0, unknownCount: 0, dependencyCount: 0,
          pendingClarification: undefined,
        },
        compatibilityOutcome: 'unknown', authorizationState: 'unknown', availabilityState: 'unknown',
        actionability: 'blocked', denialReason: 'fixture-only', actions: [], decisions: [], attempts: [],
        artifacts: [], receipts: [],
      }),
    }

    const fixture = await run(options, {
      operation: 'state.read',
      candidate: { kind: 'collection', collection: 'state' },
    }, raw)
    const nonFixture = await run(options, {
      operation: 'search.query',
      candidate: { kind: 'collection', collection: 'search' },
    }, raw)

    expect(fixture.state).toBe('read')
    expect(nonFixture).toMatchObject({ state: 'unavailable', stage: 'caller' })
    expect(raw).toHaveBeenCalledTimes(1)
    expect(projectionReadScope.current()).toBeUndefined()
  })
})
