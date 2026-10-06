import { describe, expect, it } from 'vitest'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { createSageFixtureViewState, SAGE_FIXTURE_STAGES } from '../src/product/view-state.js'

const runtime = { status: 'ready' as const, message: 'dsh 2.0.10', retryable: true }

describe('unavailable-first composition', () => {
  it('state 返回 service.unavailable + identity-unavailable + 内嵌 runtime + no-store', async () => {
    const r = await createUnavailableFirstService(runtime).readState()
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    const body = await r.json() as Record<string, unknown>
    const service = body.service as Record<string, unknown>
    expect(service.status).toBe('unavailable')
    expect(service.reason).toBe('identity-unavailable')
    expect(typeof service.correlation).toBe('string')
    expect(body.runtime).toEqual(runtime)
  })
  it('runtime 缺席时内嵌 null（不伪造 P0-2 字段）', async () => {
    const body = await (await createUnavailableFirstService(null).readState()).json() as Record<string, unknown>
    expect(body.runtime).toBeNull()
  })
  it('dispatch 200 + typed denial（identity-unavailable，无 stack/message 键）', async () => {
    const r = await createUnavailableFirstService(runtime).dispatch({ type: 'retry' })
    expect(r.status).toBe(200)
    const body = await r.json() as Record<string, unknown>
    expect(body).toMatchObject({ code: 'identity-unavailable', stage: 'identity-policy', retryable: true })
    expect(typeof body.correlation).toBe('string')
    expect('stack' in body).toBe(false)
    expect('message' in body).toBe(false)
  })
  it('两次 readState 的 correlation 不同（新鲜求值，无原地抬升）', async () => {
    const s = createUnavailableFirstService(runtime)
    const a = await (await s.readState()).json() as { service: { correlation: string } }
    const b = await (await s.readState()).json() as { service: { correlation: string } }
    expect(a.service.correlation).not.toBe(b.service.correlation)
  })
})

describe('auth in state', () => {
  it('readState carries the auth sub-object from the injected snapshot', async () => {
    const service = createUnavailableFirstService(null, { authSnapshot: () => ({ status: 'signed-in', displayName: 'Alice' }) })
    const body = await (await service.readState()).json() as Record<string, unknown>
    expect(body.service).toMatchObject({ auth: { status: 'signed-in', displayName: 'Alice' } })
  })

  it('default auth snapshot is signed-out (no provider injected)', async () => {
    const service = createUnavailableFirstService(null)
    const body = await (await service.readState()).json() as Record<string, unknown>
    expect(body.service).toMatchObject({ auth: { status: 'signed-out', displayName: null } })
  })

  it('signed-in upgrades the service reason to authenticated (spec §6)', async () => {
    const service = createUnavailableFirstService(null, { authSnapshot: () => ({ status: 'signed-in', displayName: 'Alice' }) })
    const body = await (await service.readState()).json() as Record<string, unknown>
    expect(body.service).toMatchObject({ reason: 'authenticated', auth: { status: 'signed-in', displayName: 'Alice' } })
  })

  it('pending auth passes through with the authenticated reason (login in flight)', async () => {
    const service = createUnavailableFirstService(null, { authSnapshot: () => ({ status: 'pending', displayName: null }) })
    const body = await (await service.readState()).json() as Record<string, unknown>
    expect(body.service).toMatchObject({ reason: 'authenticated', auth: { status: 'pending', displayName: null } })
  })

  it('login provider returns typed denial for a failing login', async () => {
    const service = createUnavailableFirstService(null, { login: async () => Response.json({ code: 'idp-unreachable', stage: 'login', retryable: true, correlation: 'x' }, { status: 200, headers: { 'cache-control': 'no-store' } }) })
    const response = await service.login()
    expect(await response.json()).toMatchObject({ code: 'idp-unreachable' })
  })
})

describe('matter projection slot (WT-02D.1)', () => {
  it('fills the slot with the injected fixture projection, fixture markers visible', async () => {
    const service = createUnavailableFirstService(null, { fixtureProjection: createSageFixtureViewState })
    const body = await (await service.readState()).json() as Record<string, unknown>
    expect(body.matter).toEqual(createSageFixtureViewState())
    const matter = body.matter as {
      projectionSource: string
      actionability: string
      denialReason: string
      actions: Array<{ actionability: string }>
    }
    expect(matter.projectionSource).toBe('fixture')
    expect(matter.actionability).toBe('blocked')
    expect(matter.denialReason).toBe('fixture-only')
    expect(matter.actions.length).toBeGreaterThan(0)
    for (const action of matter.actions) expect(action.actionability).toBe('blocked')
  })

  it('leaves the slot null without an explicit fixture mode (never a placeholder)', async () => {
    const service = createUnavailableFirstService(null)
    const body = await (await service.readState()).json() as Record<string, unknown>
    expect(body.matter).toBeNull()
    expect(body.service).toMatchObject({ status: 'unavailable', reason: 'identity-unavailable' })
  })

  it.each(SAGE_FIXTURE_STAGES)('preserves the injected %s fixture through the public matter slot', async (stage) => {
    const service = createUnavailableFirstService(null, {
      fixtureProjection: () => createSageFixtureViewState(stage),
    })
    const body = await (await service.readState()).json() as {
      matter: ReturnType<typeof createSageFixtureViewState>
    }
    expect(body.matter).toEqual(createSageFixtureViewState(stage))
    expect(body.matter.matter.stage).toBe(stage)
    expect(body.matter.projectionSource).toBe('fixture')
    expect(body.matter.actionability).toBe('blocked')
  })

  it('keeps 0.2 service semantics unchanged while the fixture slot is on', async () => {
    const service = createUnavailableFirstService(null, {
      fixtureProjection: createSageFixtureViewState,
      authSnapshot: () => ({ status: 'signed-in', displayName: 'Alice' }),
    })
    const body = await (await service.readState()).json() as Record<string, unknown>
    expect(body.service).toMatchObject({ reason: 'authenticated', auth: { status: 'signed-in', displayName: 'Alice' } })
    const denial = await (await service.dispatch({ type: 'retry' })).json() as Record<string, unknown>
    expect(denial).toMatchObject({ code: 'identity-unavailable', stage: 'identity-policy' })
  })

  it('exposes only the named service ports (no store/adapter surface)', () => {
    const service = createUnavailableFirstService(null, { fixtureProjection: createSageFixtureViewState })
    // The set is closed and explicit: ticket 010 added adoption as its own named port, ticket 012
    // added workspace mutation, ticket 013 the three file-reference verbs, ticket 002 the three
    // draft verbs, ticket 011 the link verb, ticket 003 reconcile + cancel, ticket 005 the send
    // verb, ticket 006 the stop/resume/pending trio, ticket 020 the preferences save, ticket 014
    // the attachment pick/upload/cancel trio, ticket 015 the artifact observe/open/close/retry
    // quartet, ticket 021 the search read, ticket 024 the side-chat quartet, ticket 025 the two
    // confirmation-prepare verbs, ticket 027 the five edit-draft verbs, ticket 028 the five
    // action-item verbs + the project trio, ticket 029 the four matter-admin verbs, ticket 031 the
    // monitor read, ticket 032 the plan create/accept + step prepare/execute quartet, ticket 033
    // the external-link open + preview fullscreen, ticket 008 the queue-item edit/remove, ticket 009 the cold-history
    // list/detail pair, T02 the local-system bootstrap read, and the independent device-preferences
    // read; any further
    // port must be a deliberate edit here rather than something that rides in silently.
    expect(Object.keys(service).sort()).toEqual([
      'acceptPlan',
      'adoptWorkspace',
      'archiveMatter',
      'artifactWindowClose',
      'artifactWindowOpen',
      'assignMatterGroup',
      'assignProject',
      'batchMatters',
      'bootstrapRead',
      'cancelAttachment',
      'cancelDraftConfirm',
      'closeArtifact',
      'completeActionItem',
      'convertDraft',
      'createActionItem',
      'createDraft',
      'createEditDraft',
      'createFileReference',
      'createMatterGroup',
      'createPlan',
      'createProject',
      'createSideChat',
      'devicePreferencesRead',
      'diffEditDraft',
      'dispatch',
      'executePlanStep',
      'feedbackSubmit',
      'feedbackVerify',
      'fullscreenArtifact',
      'inputSelectionsClear',
      'inputSelectionsSelect',
      'linkWorkspace',
      'listFileCandidates',
      'login',
      'logout',
      'mutateWorkspace',
      'observeArtifacts',
      'openArtifact',
      'openExternalLink',
      'pickAttachments',
      'prepareActionConfirmation',
      'prepareDraftConfirmation',
      'prepareEditDraftWriteback',
      'preparePlanStep',
      'readBlockedState',
      'readRunLog',
      'readSideChat',
      'readState',
      'reconcileDraft',
      'removeMatterGroup',
      'renameMatter',
      'renameMatterGroup',
      'restoreMatter',
      'resumeSession',
      'retryArtifact',
      'returnSideChat',
      'savePreferences',
      'search',
      'selectActiveMatter',
      'sendSessionPrompt',
      'sendSideChat',
      'sessionAnchorLocate',
      'sessionAnchorsRead',
      'sessionApprovalAnswer',
      'sessionApprovalWithdraw',
      'sessionClarificationAnswer',
      'sessionEditsResend',
      'sessionEditsSave',
      'sessionEditsVerify',
      'sessionHistoryDetail',
      'sessionHistoryList',
      'sessionPlanModeSwitch',
      'startActionItem',
      'stopSession',
      'submitCorrection',
      'terminalRead',
      'unassignProject',
      'updateActionItem',
      'updateDraft',
      'updateEditDraft',
      'updatePendingInput',
      'updateQueueItem',
      'uploadAttachment',
      'useFileReference',
      'writebackEditDraft',
    ])
  })
})

describe('dispatch via command pipeline', () => {
  it('always denies identity-unavailable with stage and fresh correlation', async () => {
    const service = createUnavailableFirstService(null)
    const response = await service.dispatch({ type: 'retry' })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ code: 'identity-unavailable', stage: 'identity-policy', retryable: true })
    expect(typeof body.correlation).toBe('string')
    const secondBody = await (await createUnavailableFirstService(null).dispatch({ type: 'retry' })).json() as Record<string, unknown>
    expect(secondBody.correlation).not.toBe(body.correlation)
  })
})
