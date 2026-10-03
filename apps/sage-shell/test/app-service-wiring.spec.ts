import { describe, expect, it, vi } from 'vitest'

import { createSageAppServiceProviders } from '../src/main/app-service.js'
import { createActiveMatterContext } from '../src/main/active-matter-context.js'

/**
 * Loop repair (ticket 033): the assembly point in `main/app-service.ts` was silently dropping
 * whole option families — the spreads in `main/index.ts` passed them, TypeScript's spread rules
 * let them through untyped, and the routes answered `unavailable` under the real window while
 * every function-level test (which wires `createUnavailableFirstService` directly) stayed green.
 *
 * This spec drives the PRODUCTION assembly function: each wired family must carry a distinctive
 * fake all the way to its port. If a family stops being declared/forwarded here again, exactly
 * these assertions go red — 知道 ⇒ 拦住.
 */

const vault = { status: () => 'signed-out', snapshot: () => ({ status: 'signed-out', displayName: null }), signOut: () => undefined, identitySession: () => null }
const adapter = { startLogin: async () => ({ ok: false as const, code: 'probe' }) }

function assemble(overrides: Record<string, unknown>) {
  return createSageAppServiceProviders({
    viewState: null,
    vault: vault as never,
    adapter: adapter as never,
    ...overrides,
  })
}

const marker = (code: string) => async () => ({ state: 'refused' as const, code })

describe('the production assembly forwards every wired family (ticket 033 repair)', () => {
  it('CTX-01B projects and forwards only the explicit main-owned active-context selection', async () => {
    const context = createActiveMatterContext()
    const selectActiveMatter = vi.fn(async (request: { readonly matterId: string; readonly expectedContextGeneration: number }) => ({
      state: 'refused' as const,
      code: 'active-context-unavailable' as const,
      retryable: true,
    }))
    const signOut = vi.fn()
    const service = assemble({
      activeMatterContext: context,
      selectActiveMatter,
      vault: { ...vault, signOut },
    })

    expect((await (await service.readState()).json() as { activeContext: unknown }).activeContext)
      .toEqual({ state: 'inactive', contextGeneration: 0 })
    expect(await (await service.selectActiveMatter({
      matterId: 'matter:chosen',
      expectedContextGeneration: 0,
    })).json()).toMatchObject({
      state: 'refused',
      code: 'active-context-unavailable',
    })
    expect(selectActiveMatter).toHaveBeenCalledTimes(1)
    expect(selectActiveMatter).toHaveBeenCalledWith({ matterId: 'matter:chosen', expectedContextGeneration: 0 })

    expect(context.activate({
      expectedContextGeneration: 0,
      next: {
        actorScopeRef: 'actor:local',
        matterId: 'matter:chosen',
        revisionId: 'revision:1',
        workspaceRef: 'workspace:1',
        trustedWorkspaceRoot: '/trusted/workspace',
        sessionRef: 'session:1',
        frameGeneration: 4,
      },
    }).ok).toBe(true)
    await service.logout()
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(context.snapshot()).toBeNull()
    expect(context.contextGeneration()).toBe(2)
  })

  it('artifacts: status, observe, open, close, retry and fullscreen reach their ports', async () => {
    const service = assemble({
      artifacts: () => ({ state: 'read', cards: [], preview: { state: 'closed' } }),
      artifactsObserve: marker('m-artifacts-observe'),
      artifactOpen: marker('m-artifact-open'),
      artifactClose: marker('m-artifact-close'),
      artifactRetry: marker('m-artifact-retry'),
      artifactFullscreen: () => ({ state: 'refused', code: 'm-artifact-fullscreen' }),
    })
    const state = await (await service.readState()).json() as { artifacts: { state: string } }
    expect(state.artifacts.state).toBe('read')
    expect(await (await service.observeArtifacts({ matterRef: 'm', workspaceRoot: '/w' })).json()).toMatchObject({ code: 'm-artifacts-observe' })
    expect(await (await service.openArtifact({ artifactId: 'a' })).json()).toMatchObject({ code: 'm-artifact-open' })
    expect(await (await service.closeArtifact()).json()).toMatchObject({ code: 'm-artifact-close' })
    expect(await (await service.retryArtifact()).json()).toMatchObject({ code: 'm-artifact-retry' })
    expect(await (await service.fullscreenArtifact({ on: true })).json()).toMatchObject({ code: 'm-artifact-fullscreen' })
  })

  it('attachments: status, pick and cancel remain wired while upload cannot bypass admission', async () => {
    const upload = vi.fn(marker('m-attach-upload'))
    const service = assemble({
      attachments: () => ({ state: 'read', items: [] }),
      attachmentsPick: async () => ({ state: 'picked', item: { itemId: 'm-attach-pick', name: 'f', path: '/p', bytes: 1 } }),
      attachmentsUpload: upload,
      attachmentsCancel: async () => ({ state: 'cancelled', itemId: 'm-attach-cancel' }),
    })
    const state = await (await service.readState()).json() as { attachments: { state: string } }
    expect(state.attachments.state).toBe('read')
    expect(await (await service.pickAttachments()).json()).toMatchObject({ item: { itemId: 'm-attach-pick' } })
    expect(await (await service.uploadAttachment({ itemId: 'i', matterRef: 'm', workspaceRoot: '/w' })).json())
      .toMatchObject({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(upload).not.toHaveBeenCalled()
    expect(await (await service.cancelAttachment({ itemId: 'i' })).json()).toMatchObject({ itemId: 'm-attach-cancel' })
  })

  it('search, matterList and side chats reach their ports (the other dropped families)', async () => {
    const service = assemble({
      search: marker('m-search'),
      matterList: () => ({ state: 'read', code: null, items: [], counts: { action: 0, inProgress: 0, acceptance: 0 } }),
      sideChats: () => ({ state: 'read', code: null, items: [] }),
      sideChatCreate: marker('m-side-create'),
      sideChatSend: marker('m-side-send'),
      sideChatRead: marker('m-side-read'),
      sideChatReturn: marker('m-side-return'),
    })
    expect(await (await service.search({ query: 'q' })).json()).toMatchObject({ code: 'm-search' })
    const state = await (await service.readState()).json() as { matterList: { state: string }, sideChats: { state: string } }
    expect(state.matterList.state).toBe('read')
    expect(state.sideChats.state).toBe('read')
    expect(await (await service.createSideChat({ matterRef: 'm' })).json()).toMatchObject({ code: 'm-side-create' })
    expect(await (await service.sendSideChat({ sideChatId: 's', text: 't' })).json()).toMatchObject({ code: 'm-side-send' })
    expect(await (await service.readSideChat({ sideChatId: 's' })).json()).toMatchObject({ code: 'm-side-read' })
    expect(await (await service.returnSideChat({ sideChatId: 's', text: 't' })).json()).toMatchObject({ code: 'm-side-return' })
  })

  it('ticket 033 entries: the external-link port and the tool-results slot reach the service', async () => {
    const service = assemble({
      externalLinkOpen: async () => ({ state: 'opened', target: { scheme: 'https', host: 'example.com' } }),
      toolResults: () => ({ state: 'read', results: [] }),
    })
    expect(await (await service.openExternalLink({ url: 'https://example.com/x' })).json()).toMatchObject({ state: 'opened', target: { host: 'example.com' } })
    const state = await (await service.readState()).json() as { toolResults: { state: string } }
    expect(state.toolResults.state).toBe('read')
    // Unwired stays honest: the fallbacks are explicit, never pretend data.
    const bare = assemble({})
    expect(await (await bare.openArtifact({ artifactId: 'a' })).json()).toMatchObject({ code: 'artifact-preview-unavailable' })
    expect((await (await bare.readState()).json() as { toolResults: { state: string, reason: string } }).toolResults)
      .toMatchObject({ state: 'unavailable', reason: 'tool-results-provider-unavailable' })
  })

  it('ticket 038: the input-selections slot and its select/clear reach the service', async () => {
    const service = assemble({
      inputSelections: async () => ({ state: 'read', skills: [{ name: 'm-skill', description: null, source: 'user', provider: 'p', userInvocable: true, modelInvocable: true }], skillsNote: null, plugins: [], pluginsNote: null, selected: [], code: null, at: 't' }),
      inputSelectionsSelect: () => ({ state: 'selected', selected: [{ kind: 'skill', ref: 'm-select' }] }),
      inputSelectionsClear: () => ({ state: 'cleared', selected: [] }),
    })
    const state = await (await service.readState()).json() as { inputSelections: { skills: Array<{ name: string }> } }
    expect(state.inputSelections.skills[0]?.name).toBe('m-skill')
    expect(await (await service.inputSelectionsSelect({ action: 'select', kind: 'skill', ref: 'x' })).json()).toMatchObject({ selected: [{ kind: 'skill', ref: 'm-select' }] })
    expect(await (await service.inputSelectionsClear({ action: 'clear', kind: 'skill' })).json()).toEqual({ state: 'cleared', selected: [] })
    const bare = assemble({})
    expect(await (await bare.inputSelectionsSelect({ action: 'select', kind: 'skill', ref: 'x' })).json()).toMatchObject({ code: 'input-selections-unavailable' })
    expect(await (await bare.inputSelectionsClear({ action: 'clear', kind: 'skill' })).json()).toMatchObject({ code: 'input-selections-unavailable' })
  })

  it('ticket 036/AUTH-02B: the edits read reaches the service while writes cannot bypass admission', async () => {
    const save = vi.fn(() => ({ state: 'refused' as const, code: 'raw-edit-save' }))
    const resend = vi.fn(async () => ({ state: 'refused' as const, code: 'raw-edit-resend' }))
    const verify = vi.fn(async () => ({ state: 'refused' as const, code: 'raw-edit-verify' }))
    const service = assemble({
      sessionEdits: () => ({ state: 'read', records: [{ editId: 'e-1', messageRef: 'r-1', originalText: 'm-edit', activeVersion: 1, versions: [] }], code: null, at: 't' }),
      sessionEditsSave: save,
      sessionEditsResend: resend,
      sessionEditsVerify: verify,
    })
    const state = await (await service.readState()).json() as { sessionEdits: { records: Array<{ originalText: string }> } }
    expect(state.sessionEdits.records[0]?.originalText).toBe('m-edit')
    expect(await (await service.sessionEditsSave({ action: 'save', messageRef: 'r-1', text: 't' })).json()).toMatchObject({ code: 'protected-effect-unavailable' })
    expect(await (await service.sessionEditsResend({ action: 'resend', editId: 'e-1' })).json()).toMatchObject({ code: 'protected-effect-unavailable' })
    expect(await (await service.sessionEditsVerify({ action: 'verify', editId: 'e-1' })).json()).toMatchObject({ code: 'protected-effect-unavailable' })
    expect(save).not.toHaveBeenCalled()
    expect(resend).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
    const bare = assemble({})
    expect(await (await bare.sessionEditsSave({ action: 'save', messageRef: 'r-1', text: 't' })).json()).toMatchObject({ code: 'protected-effect-unavailable' })
    expect(await (await bare.sessionEditsResend({ action: 'resend', editId: 'e-1' })).json()).toMatchObject({ code: 'protected-effect-unavailable' })
    expect(await (await bare.sessionEditsVerify({ action: 'verify', editId: 'e-1' })).json()).toMatchObject({ code: 'protected-effect-unavailable' })
  })

  it('ticket 035: the anchors slot and its two reads reach the service', async () => {
    const service = assemble({
      sessionAnchors: () => ({ state: 'read', anchors: [{ runSeq: 10, turn: 2, promptPreview: 'm-anchor' }], located: null, code: null, at: 't' }),
      sessionAnchorsRead: async () => ({ state: 'read', anchors: [] }),
      sessionAnchorLocate: async () => ({ state: 'missing', runSeq: 9, code: 'm-anchor-locate' }),
    })
    const state = await (await service.readState()).json() as { sessionAnchors: { anchors: Array<{ promptPreview: string }> } }
    expect(state.sessionAnchors.anchors[0]?.promptPreview).toBe('m-anchor')
    expect(await (await service.sessionAnchorsRead({ action: 'read' })).json()).toEqual({ state: 'read', anchors: [] })
    expect(await (await service.sessionAnchorLocate({ action: 'locate', runSeq: 9 })).json()).toMatchObject({ code: 'm-anchor-locate' })
    const bare = assemble({})
    expect(await (await bare.sessionAnchorsRead({ action: 'read' })).json()).toMatchObject({ code: 'session-anchors-unavailable' })
    expect(await (await bare.sessionAnchorLocate({ action: 'locate', runSeq: 9 })).json()).toMatchObject({ code: 'session-anchors-unavailable' })
  })

  it('ticket 034/AUTH-02B: clarification reads remain wired while answers cannot bypass admission', async () => {
    const answer = vi.fn(async () => ({ state: 'refused' as const, code: 'raw-clarification-answer' }))
    const service = assemble({
      sessionClarifications: async () => ({ state: 'read', pending: [], deferred: [], receipts: [], code: null, at: 't' }),
      sessionClarificationAnswer: answer,
    })
    const state = await (await service.readState()).json() as { sessionClarifications: { state: string } }
    expect(state.sessionClarifications.state).toBe('read')
    expect(await (await service.sessionClarificationAnswer({ matterRef: 'm', requestId: 'q-1', answers: [] })).json())
      .toMatchObject({ code: 'protected-effect-unavailable' })
    expect(answer).not.toHaveBeenCalled()
    const bare = assemble({})
    expect(await (await bare.sessionClarificationAnswer({ matterRef: 'm', requestId: 'q-1', answers: [] })).json())
      .toMatchObject({ code: 'protected-effect-unavailable' })
  })

  it('ticket 039/AUTH-02B: plan-mode reads remain wired while switching cannot bypass admission', async () => {
    const switchMode = vi.fn(async () => ({
      state: 'settled' as const, outcome: 'queued' as const, family: 'pending' as const,
      view: { active: false, pending: true }, viewCode: null, at: 'raw-switch',
    }))
    const service = assemble({
      sessionPlanMode: async () => ({ state: 'read', reason: null, active: false, pending: true }),
      sessionPlanModeSwitch: switchMode,
    })
    const state = await (await service.readState()).json() as { sessionPlanMode: { state: string, pending: boolean } }
    expect(state.sessionPlanMode).toMatchObject({ state: 'read', pending: true })
    expect(await (await service.sessionPlanModeSwitch({ active: true })).json())
      .toMatchObject({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(switchMode).not.toHaveBeenCalled()
    const bare = assemble({})
    expect(await (await bare.sessionPlanModeSwitch({ active: true })).json())
      .toMatchObject({ code: 'protected-effect-unavailable' })
  })

  it('ticket 041/AUTH-02B: approval reads remain wired while decisions cannot bypass admission', async () => {
    const answer = vi.fn(async () => ({ state: 'recorded' as const, receipt: { requestId: 'r-1', state: 'accepted' as const, outcome: 'allowed-once' as const, submittedAt: 't', code: null } }))
    const withdraw = vi.fn(async () => ({ state: 'refused' as const, code: 'raw-withdraw' }))
    const service = assemble({
      sessionApprovals: async () => ({ state: 'read', pending: [{ requestId: 'r-1', toolName: 'm-tool', callId: null, reason: null, withdrawable: true, raisedAt: 't' }], lapsed: [], receipts: [], code: null, at: null }),
      sessionApprovalAnswer: answer,
      sessionApprovalWithdraw: withdraw,
    })
    const state = await (await service.readState()).json() as { sessionApprovals: { state: string, pending: Array<{ toolName: string }> } }
    expect(state.sessionApprovals).toMatchObject({ state: 'read', pending: [{ toolName: 'm-tool' }] })
    expect(await (await service.sessionApprovalAnswer({ matterRef: 'm', requestId: 'r-1', outcome: 'allowed-once' })).json())
      .toMatchObject({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(await (await service.sessionApprovalWithdraw({ matterRef: 'm', requestId: 'r-1' })).json())
      .toMatchObject({ code: 'protected-effect-unavailable' })
    expect(answer).not.toHaveBeenCalled()
    expect(withdraw).not.toHaveBeenCalled()
    const bare = assemble({})
    expect(await (await bare.sessionApprovalAnswer({ matterRef: 'm', requestId: 'r-1', outcome: 'rejected' })).json())
      .toMatchObject({ code: 'protected-effect-unavailable' })
    expect(await (await bare.sessionApprovalWithdraw({ matterRef: 'm', requestId: 'r-1' })).json())
      .toMatchObject({ code: 'protected-effect-unavailable' })
  })

  it('ticket 048: the feedback ports reach the service, unwired stays honest', async () => {
    const service = assemble({
      feedback: () => ({ state: 'read', receipts: [{ state: 'accepted', requestId: 'fb-1', at: 't', code: null }] }),
      feedbackSubmit: async () => ({ state: 'accepted', requestId: 'fb-2', at: 't', code: null }),
      feedbackVerify: async () => ({ state: 'unknown', requestId: 'fb-2', at: 't', code: 'x' }),
    })
    const state = await (await service.readState()).json() as { feedback: { receipts: Array<{ requestId: string }> } }
    expect(state.feedback.receipts[0]?.requestId).toBe('fb-1')
    expect(await (await service.feedbackSubmit({ action: 'submit', text: 'x' })).json()).toMatchObject({ state: 'accepted', requestId: 'fb-2' })
    expect(await (await service.feedbackVerify({ action: 'verify', requestId: 'fb-2' })).json()).toMatchObject({ state: 'unknown' })
    const bare = assemble({})
    expect(await (await bare.feedbackSubmit({ action: 'submit', text: 'x' })).json()).toMatchObject({ code: 'feedback-sink-unavailable' })
    expect(await (await bare.feedbackVerify({ action: 'verify', requestId: 'fb-2' })).json()).toMatchObject({ code: 'feedback-sink-unavailable' })
  })

  it('ticket 049: the group ports reach the service; a group change moves nothing else and infers no permission', async () => {
    const authoritySpy = vi.fn(async () => ({ state: 'refused' as const, code: 'must-not-fire' }))
    const listSlot = () => ({
      state: 'read' as const,
      code: null,
      items: [{ itemId: 'm-1', matterRef: 'm-1', title: '事项一', partition: 'in-progress' as const, triggers: [], acceptanceCandidateCount: 0, lifecycle: 'active' as const, updatedAt: 't' }],
      counts: { action: 0, inProgress: 1, acceptance: 0 },
    })
    const groups = {
      state: 'read' as const,
      code: null,
      groups: [{ groupId: 'g-1', name: '组', memberIds: ['m-1'], createdAt: 't', updatedAt: 't' }],
      trail: [],
      rename: null,
      batch: null,
    }
    const service = assemble({
      matterList: listSlot,
      matterGroups: () => groups,
      // The group family is synchronous by contract (like 029's) — an async provider would hand
      // `serviceJson` a Promise and serialize `{}`; the spec pins the sync shape.
      matterGroupsCreate: () => ({ state: 'created' as const, status: groups }),
      matterGroupsRename: () => ({ state: 'renamed' as const, status: groups }),
      matterGroupsRemove: () => ({ state: 'removed' as const, status: groups }),
      matterGroupsAssign: () => ({ state: 'batch' as const, status: groups }),
      // Authority-adjacent ports a group change must never reach (US-226, 不触发权限推断).
      matterAdminArchive: authoritySpy,
      matterAdminBatch: authoritySpy,
    })
    const before = await (await service.readState()).json() as { matterList: unknown, matterGroups: { groups: Array<{ groupId: string }> } }
    expect(before.matterGroups.groups[0]?.groupId).toBe('g-1')
    expect(await (await service.createMatterGroup({ name: '组' })).json()).toMatchObject({ state: 'created' })
    expect(await (await service.renameMatterGroup({ groupId: 'g-1', name: '新名' })).json()).toMatchObject({ state: 'renamed' })
    expect(await (await service.removeMatterGroup({ groupId: 'g-1' })).json()).toMatchObject({ state: 'removed' })
    expect(await (await service.assignMatterGroup({ groupId: 'g-1', operation: 'add', targets: ['m-1'] })).json()).toMatchObject({ state: 'batch' })
    expect(authoritySpy).not.toHaveBeenCalled()
    const after = await (await service.readState()).json() as { matterList: unknown }
    expect(after.matterList).toEqual(before.matterList)
    // The unwired family answers a named 缺项, never a fabricated group.
    const bare = assemble({})
    expect(await (await bare.createMatterGroup({ name: 'x' })).json()).toMatchObject({ code: 'matter-groups-unavailable' })
    expect(await (await bare.assignMatterGroup({ groupId: 'g', operation: 'add', targets: ['m'] })).json()).toMatchObject({ code: 'matter-groups-unavailable' })
  })

  it('ticket 044: the artifact-window ports reach the service, unwired stays honest', async () => {
    const service = assemble({
      artifactWindowOpen: async () => ({ state: 'opened', preview: { state: 'ready', artifactId: 'a-1', name: 'n', kind: 'text' as const, version: 'v1', expanded: false, window: true } }),
      artifactWindowClose: () => ({ state: 'closed', preview: { state: 'ready', artifactId: 'a-1', name: 'n', kind: 'text' as const, version: 'v1', expanded: false, window: false } }),
    })
    expect(await (await service.artifactWindowOpen()).json()).toMatchObject({ state: 'opened', preview: { window: true } })
    expect(await (await service.artifactWindowClose()).json()).toMatchObject({ state: 'closed', preview: { window: false } })
    const bare = assemble({})
    expect(await (await bare.artifactWindowOpen()).json()).toMatchObject({ code: 'artifact-window-unavailable' })
    expect(await (await bare.artifactWindowClose()).json()).toMatchObject({ code: 'artifact-window-unavailable' })
  })

  it('ticket 043: the terminal slot and its bounded page read reach the service', async () => {
    const service = assemble({
      terminal: async () => ({ state: 'read', reason: null, terminals: [{ terminalId: 't-marker', name: null, type: 'bash', status: { kind: 'running' } }] }),
      terminalRead: async () => ({ state: 'read', text: 'out', totalLines: 1, lineBegin: 0, lineEnd: 1, truncated: false }),
    })
    const state = await (await service.readState()).json() as { terminal: { state: string, terminals: Array<{ terminalId: string }> } }
    expect(state.terminal.state).toBe('read')
    expect(state.terminal.terminals[0]?.terminalId).toBe('t-marker')
    expect(await (await service.terminalRead({ terminalId: 't-marker' })).json()).toMatchObject({ state: 'read', text: 'out' })
    // The unwired family answers a named 未就绪 with its missing item — never an empty terminal.
    const bare = assemble({})
    const bareState = await (await bare.readState()).json() as { terminal: { state: string, reason: string | null } }
    expect(bareState.terminal).toMatchObject({ state: 'unavailable', reason: 'terminals-provider-unavailable' })
    expect(await (await bare.terminalRead({ terminalId: 't-marker' })).json()).toMatchObject({ code: 'terminals-provider-unavailable' })
  })

  it('ticket 042: the model-queue slot reaches the service, with the honest default', async () => {
    const service = assemble({
      modelQueue: async () => ({ state: 'read', verdict: 'waiting', retries: [{ retryId: 'r-marker', turn: 1, attempt: 1, maxAttempts: 2, delayMs: 500, provider: 'p', failureCode: 'c', started: false }], verifyOnly: false, reason: null, at: null }),
    })
    const state = await (await service.readState()).json() as { modelQueue: { verdict: string, retries: Array<{ retryId: string }> } }
    expect(state.modelQueue.verdict).toBe('waiting')
    expect(state.modelQueue.retries[0]?.retryId).toBe('r-marker')
    // The unwired default is honest and never a fabricated verdict.
    const bare = assemble({})
    const bareState = await (await bare.readState()).json() as { modelQueue: { state: string, verdict: string, reason: string | null } }
    expect(bareState.modelQueue).toMatchObject({ state: 'unavailable', verdict: 'idle', reason: 'model-queue-provider-unavailable' })
  })

  it('ticket 040: the site-templates slot reaches the service, with the honest default', async () => {
    const service = assemble({
      siteTemplates: async () => ({
        state: 'read', reason: null,
        entries: [{ templateId: 't-marker', name: 'm', source: 's', version: '1', prompt: 'p' }],
      }),
    })
    const state = await (await service.readState()).json() as { siteTemplates: { state: string, entries: Array<{ templateId: string }> } }
    expect(state.siteTemplates.state).toBe('read')
    expect(state.siteTemplates.entries[0]?.templateId).toBe('t-marker')
    // The unwired default is the same honest unavailable the production wiring answers — no fake list.
    const bare = assemble({})
    const bareState = await (await bare.readState()).json() as { siteTemplates: { state: string, reason: string | null } }
    expect(bareState.siteTemplates).toMatchObject({ state: 'unavailable', reason: 'site-templates-provider-unavailable' })
  })
})
