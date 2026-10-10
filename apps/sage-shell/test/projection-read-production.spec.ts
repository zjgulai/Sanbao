import { describe, expect, it, vi } from 'vitest'

import { createActionConfirmationStore } from '../src/appservice/action-confirmations.js'
import type { FileReferenceRecord, ProjectionReadCandidate } from '../src/appservice/contracts.js'
import type { ProjectionReadIntent, ProjectionReadScope } from '../src/appservice/projection-read-admission.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createSageAppServiceProviders, type SageAppServiceOptions } from '../src/main/app-service.js'
import { createActiveMatterContext, type ActiveMatterContext } from '../src/main/active-matter-context.js'
import { createEditDrafts } from '../src/main/edit-drafts.js'
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

function bridgeBackedEditDrafts(references: readonly FileReferenceRecord[]) {
  const calls = { stat: 0, read: 0 }
  let nextDraftId = 0
  const callBridge = async (endpoint: string): Promise<unknown> => {
    if (endpoint === 'workspaceFiles/stat') {
      calls.stat += 1
      return { ok: true, result: { version: 'v1', bytes: 11 } }
    }
    if (endpoint === 'workspaceFiles/read') {
      calls.read += 1
      return { ok: true, result: { version: 'v1', text: 'source text', lines: 1, eof: true } }
    }
    return { ok: false, code: 'bridge-answer-unrecognised' }
  }
  const store = createEditDrafts(callBridge, {
    now: () => '2026-10-03T00:00:00.000Z',
    nextId: () => `draft:production-${nextDraftId += 1}`,
    references: () => references,
    confirmations: {
      store: createActionConfirmationStore({
        now: () => '2026-10-03T00:00:00.000Z',
        nextId: () => `confirmation:production-${nextDraftId += 1}`,
      }),
      facts: () => ({ environmentRef: null }),
    },
  })
  return { calls, store }
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

  // T03/A (user decision, ADR-0268): the device `state` aggregate rides the same active-matter
  // grant the rest of the read surface uses — the fresh scope already binds exact session, matter,
  // revision, workspace and generations. This supersedes the earlier conservative default that
  // kept every collection at candidate-match unavailable. Search still spans multiple matters and
  // global sessions, so its collection stays blocked until a main-owned object resolver exists.
  it('widens the granted matter scope to the device state aggregate only (T03/A)', async () => {
    const { options } = productionOptions()
    const raw = vi.fn(async () => Response.json({ raw: true }))

    const result = await run(options, {
      operation: 'state.read',
      candidate: { kind: 'collection', collection: 'state' },
    }, raw)

    expect(result.state).toBe('read')
    expect(raw).toHaveBeenCalledTimes(1)
  })

  it('still keeps the multi-matter search collection at candidate-match unavailable', async () => {
    const { options } = productionOptions()
    const raw = vi.fn(async () => Response.json({ raw: true }))

    const result = await run(options, {
      operation: 'search.query',
      candidate: { kind: 'collection', collection: 'search' },
    }, raw)

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

  it.each([
    { label: 'unknown', reference: undefined },
    {
      label: 'another matter',
      reference: {
        referenceId: 'ref:other-matter',
        matterRef: 'matter:other',
        workspaceRoot: ACTIVE_SCOPE.trustedWorkspaceRoot,
      },
    },
    {
      label: 'another workspace',
      reference: {
        referenceId: 'ref:other-workspace',
        matterRef: ACTIVE_SCOPE.matterId,
        workspaceRoot: '/trusted/other-workspace',
      },
    },
  ])('keeps a $label file reference out of the raw provider', async ({ reference }) => {
    const { options } = productionOptions(reference === undefined ? {} : {
      fileReferences: () => [{
        ...reference,
        absolutePath: `${reference.workspaceRoot}/notes.md`,
        path: 'notes.md',
        version: 'v1',
        createdAt: '2026-10-03T00:00:00.000Z',
        lastUse: 'unused' as const,
      }],
    })
    const raw = vi.fn(async () => Response.json({ raw: true }))

    const result = await run(options, {
      operation: 'workspace.files.use-reference',
      candidate: { kind: 'opaque', resource: 'file-reference', id: reference?.referenceId ?? 'ref:unknown' },
    }, raw)

    expect(result).toMatchObject({ state: 'unavailable', stage: 'candidate-match' })
    expect(raw).not.toHaveBeenCalled()
  })

  it('admits one file reference only when its main-owned binding matches the fresh scope', async () => {
    const record = {
      referenceId: 'ref:one',
      matterRef: ACTIVE_SCOPE.matterId,
      workspaceRoot: ACTIVE_SCOPE.trustedWorkspaceRoot,
      path: 'notes.md',
      absolutePath: `${ACTIVE_SCOPE.trustedWorkspaceRoot}/notes.md`,
      version: 'v1',
      createdAt: '2026-10-03T00:00:00.000Z',
      lastUse: 'unused' as const,
    }
    const { options } = productionOptions({ fileReferences: () => [record] })
    let callbackScope: ProjectionReadScope | undefined
    const raw = vi.fn(async (scope: ProjectionReadScope) => {
      callbackScope = projectionReadScope.current()
      expect(callbackScope).toEqual(scope)
      return Response.json({ text: 'read after admission' })
    })

    const result = await run(options, {
      operation: 'workspace.files.use-reference',
      candidate: { kind: 'opaque', resource: 'file-reference', id: record.referenceId },
    }, raw)

    expect(result.state).toBe('read')
    expect(raw).toHaveBeenCalledTimes(1)
    expect(callbackScope).toMatchObject({
      matterRef: ACTIVE_SCOPE.matterId,
      trustedWorkspaceRoot: ACTIVE_SCOPE.trustedWorkspaceRoot,
    })
  })

  it('admits edit-draft creation only for a matching file-reference scope', async () => {
    const record: FileReferenceRecord = {
      referenceId: 'ref:edit-draft',
      matterRef: ACTIVE_SCOPE.matterId,
      workspaceRoot: ACTIVE_SCOPE.trustedWorkspaceRoot,
      path: 'notes.md',
      absolutePath: `${ACTIVE_SCOPE.trustedWorkspaceRoot}/notes.md`,
      version: 'v1',
      createdAt: '2026-10-03T00:00:00.000Z',
      lastUse: 'unused',
    }
    const { calls, store } = bridgeBackedEditDrafts([record])
    const { options } = productionOptions({
      fileReferences: () => [record],
      editDraftCreate: store.create,
    })
    const providers = createSageAppServiceProviders(options)
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/edit-drafts/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ referenceId: record.referenceId }),
    }), { callerBinding: { correlation: 'caller:one' }, providers })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      state: 'created',
      draft: { matterRef: ACTIVE_SCOPE.matterId, proposedText: 'source text' },
    })
    expect(calls).toEqual({ stat: 1, read: 1 })
    expect(store.list()).toMatchObject({ state: 'read', drafts: [{ matterRef: ACTIVE_SCOPE.matterId }] })
  })

  it.each([
    { label: 'unknown', references: [] },
    {
      label: 'another matter',
      references: [{
        referenceId: 'ref:other-matter', matterRef: 'matter:other', workspaceRoot: ACTIVE_SCOPE.trustedWorkspaceRoot,
      }],
    },
    {
      label: 'another workspace',
      references: [{
        referenceId: 'ref:other-workspace', matterRef: ACTIVE_SCOPE.matterId, workspaceRoot: '/trusted/other-workspace',
      }],
    },
  ])('blocks $label edit-draft creation before any provider read', async ({ references }) => {
    const records: FileReferenceRecord[] = references.map((reference) => ({
      ...reference,
      path: 'notes.md',
      absolutePath: `${reference.workspaceRoot}/notes.md`,
      version: 'v1',
      createdAt: '2026-10-03T00:00:00.000Z',
      lastUse: 'unused' as const,
    }))
    const { calls, store } = bridgeBackedEditDrafts(records)
    const { options } = productionOptions({
      fileReferences: () => records,
      editDraftCreate: store.create,
    })
    const providers = createSageAppServiceProviders(options)
    const referenceId = records[0]?.referenceId ?? 'ref:unknown'
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/edit-drafts/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ referenceId }),
    }), { callerBinding: { correlation: 'caller:one' }, providers })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ state: 'refused', code: 'edit-draft-unavailable' })
    expect(calls).toEqual({ stat: 0, read: 0 })
    expect(store.list()).toEqual({ state: 'read', drafts: [] })
  })

  it('rejects a renderer-supplied matterRef before edit-draft admission', async () => {
    const createEditDraft = vi.fn(async () => Response.json({ state: 'created' }))
    const { options } = productionOptions({ editDraftCreate: createEditDraft })
    const providers = createSageAppServiceProviders(options)
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/edit-drafts/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ referenceId: 'ref:one', matterRef: ACTIVE_SCOPE.matterId }),
    }), { callerBinding: { correlation: 'caller:one' }, providers })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'invalid-edit-draft-request', stage: 'intent' })
    expect(createEditDraft).not.toHaveBeenCalled()
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
