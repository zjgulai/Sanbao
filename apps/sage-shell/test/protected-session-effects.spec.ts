import { describe, expect, it, vi } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createSageAppServiceProviders } from '../src/main/app-service.js'
import { createActiveMatterContext } from '../src/main/active-matter-context.js'
import type { ServiceProviders } from '../src/appservice/contracts.js'
import type { SessionCoreProtectedEffectIntent } from '../src/appservice/protected-effect-admission.js'

const vault = {
  status: () => 'signed-out' as const,
  snapshot: () => ({ status: 'signed-out' as const, displayName: null }),
  signOut: () => undefined,
  identitySession: () => null,
}
const adapter = { startLogin: async () => ({ ok: false as const, code: 'probe' }) }
const callerBinding = { correlation: 'caller:session-core' }

const thirdBatchCases = [
  {
    path: '/.sage/session/pending',
    body: { action: 'edit', itemId: 'pending-1', text: 'new pending text' },
    operation: 'session.pending.edit',
    candidate: { kind: 'active-session' },
    payload: { itemId: 'pending-1', text: 'new pending text' },
    envelope: 'pending',
  },
  {
    path: '/.sage/session/pending',
    body: { action: 'remove', itemId: 'pending-2' },
    operation: 'session.pending.remove',
    candidate: { kind: 'active-session' },
    payload: { itemId: 'pending-2' },
    envelope: 'pending',
  },
  {
    path: '/.sage/session/queue',
    body: { action: 'edit', itemId: 'queue-1', text: 'new queue text' },
    operation: 'session.queue.edit',
    candidate: { kind: 'active-session' },
    payload: { itemId: 'queue-1', text: 'new queue text' },
    envelope: 'refused',
  },
  {
    path: '/.sage/session/queue',
    body: { action: 'remove', itemId: 'queue-2' },
    operation: 'session.queue.remove',
    candidate: { kind: 'active-session' },
    payload: { itemId: 'queue-2' },
    envelope: 'refused',
  },
  {
    path: '/.sage/session/clarification-answer',
    body: {
      matterRef: 'matter:active',
      requestId: 'clarification-1',
      answers: [{ questionId: 'question-1', selected: ['answer-1'] }],
    },
    operation: 'session.clarification.answer',
    candidate: { kind: 'matter', matterRef: 'matter:active' },
    payload: {
      requestId: 'clarification-1',
      answers: [{ questionId: 'question-1', selected: ['answer-1'] }],
    },
    envelope: 'refused',
  },
  {
    path: '/.sage/session/edits',
    body: { action: 'save', messageRef: 'message-1', text: 'edited text' },
    operation: 'session.edits.save',
    candidate: { kind: 'active-session' },
    payload: { messageRef: 'message-1', text: 'edited text' },
    envelope: 'refused',
  },
  {
    path: '/.sage/session/edits',
    body: { action: 'resend', editId: 'edit-1', workspaceRoot: '/renderer/must-not-be-authority' },
    operation: 'session.edits.resend',
    candidate: { kind: 'active-session' },
    payload: { editId: 'edit-1' },
    envelope: 'refused',
  },
  {
    path: '/.sage/session/edits',
    body: { action: 'verify', editId: 'edit-2' },
    operation: 'session.edits.verify',
    candidate: { kind: 'active-session' },
    payload: { editId: 'edit-2' },
    envelope: 'refused',
  },
  {
    path: '/.sage/session/plan-mode',
    body: { active: true },
    operation: 'session.plan-mode.switch',
    candidate: { kind: 'active-session' },
    payload: { active: true },
    envelope: 'refused',
  },
  {
    path: '/.sage/session/approval-answer',
    body: { matterRef: 'matter:active', requestId: 'approval-1', outcome: 'allowed-once' },
    operation: 'session.approval.answer',
    candidate: { kind: 'matter', matterRef: 'matter:active' },
    payload: { requestId: 'approval-1', outcome: 'allowed-once' },
    envelope: 'refused',
  },
  {
    path: '/.sage/session/approval-withdraw',
    body: { matterRef: 'matter:active', requestId: 'approval-2' },
    operation: 'session.approval.withdraw',
    candidate: { kind: 'matter', matterRef: 'matter:active' },
    payload: { requestId: 'approval-2' },
    envelope: 'refused',
  },
  {
    path: '/.sage/corrections',
    body: {
      matterRef: 'matter:active',
      workspaceRoot: '/renderer/correction-must-not-be-authority',
      originalText: 'original requirement',
      originalAt: '2026-10-03T00:00:00.000Z',
      text: 'corrected requirement',
    },
    operation: 'session.correction.submit',
    candidate: { kind: 'matter', matterRef: 'matter:active' },
    payload: {
      originalText: 'original requirement',
      originalAt: '2026-10-03T00:00:00.000Z',
      text: 'corrected requirement',
    },
    envelope: 'refused',
  },
] as const

const attachmentUploadCase = {
  path: '/.sage/attachments/upload',
  body: {
    itemId: 'attachment-1',
    matterRef: 'matter:active',
    workspaceRoot: '/renderer/attachment-must-not-be-authority',
  },
  operation: 'session.attachment.upload',
  candidate: { kind: 'matter', matterRef: 'matter:active' },
  payload: { itemId: 'attachment-1' },
} as const

const attachmentCancelCase = {
  path: '/.sage/attachments/cancel',
  body: { itemId: 'attachment-1' },
  operation: 'session.attachment.cancel',
  candidate: { kind: 'active-session' },
  payload: { itemId: 'attachment-1' },
} as const

function rawSessionEffectSpies() {
  return {
    pendingUpdate: vi.fn(() => ({ ok: true as const })),
    queueItemUpdate: vi.fn(async () => ({ state: 'ok' as const })),
    sessionClarificationAnswer: vi.fn(async () => ({ state: 'refused' as const, code: 'raw-provider-called' })),
    sessionEditsSave: vi.fn(() => ({ state: 'refused' as const, code: 'raw-provider-called' })),
    sessionEditsResend: vi.fn(async () => ({ state: 'refused' as const, code: 'raw-provider-called' })),
    sessionEditsVerify: vi.fn(async () => ({ state: 'refused' as const, code: 'raw-provider-called' })),
    sessionPlanModeSwitch: vi.fn(async () => ({ state: 'refused' as const, code: 'raw-provider-called' })),
    sessionApprovalAnswer: vi.fn(async () => ({ state: 'refused' as const, code: 'raw-provider-called' })),
    sessionApprovalWithdraw: vi.fn(async () => ({ state: 'refused' as const, code: 'raw-provider-called' })),
    correctionCreate: vi.fn(async () => ({ state: 'refused' as const, code: 'raw-provider-called' })),
    attachmentsUpload: vi.fn(async () => ({ state: 'refused' as const, code: 'raw-provider-called' })),
    attachmentsCancel: vi.fn(async () => ({ state: 'refused' as const, code: 'raw-provider-called' })),
  }
}

function activeContext() {
  const context = createActiveMatterContext()
  expect(context.activate({
    expectedContextGeneration: 0,
    next: {
      actorScopeRef: 'actor:local',
      matterId: 'matter:active',
      revisionId: 'revision:active.1',
      workspaceRef: 'workspace:active',
      trustedWorkspaceRoot: '/trusted/workspace',
      sessionRef: 'session:active',
      frameGeneration: 7,
    },
  }).ok).toBe(true)
  return context
}

function assemble(options: {
  readonly active: boolean
  readonly frameGeneration?: number
  readonly frameSequence?: readonly number[]
  readonly identity?: 'matching' | 'missing' | 'drift'
  readonly revision?: 'current' | 'stale' | 'unavailable'
  readonly defaultWorkspace?: 'matching' | 'drift' | 'unavailable'
  readonly workspace?: 'matching' | 'drift' | 'unavailable'
}) {
  let frameRead = 0
  const sessionSend = vi.fn(async () => ({ state: 'accepted' as const, sessionId: 's', requestId: 'r', mode: 'queue' as const }))
  const sessionStop = vi.fn(async () => ({ state: 'stopped' as const, paused: true, drained: [], consumed: [], dispatched: [], code: null }))
  const sessionResume = vi.fn(async () => ({ state: 'resumed' as const, paused: false, drained: [], consumed: [], dispatched: [], code: null }))
  const rawEffects = rawSessionEffectSpies()
  const activeVault = {
    ...vault,
    identitySession: () => options.identity === 'missing'
      ? null
      : {
          sessionRef: options.identity === 'drift' ? 'session:other' : 'session:active',
          identityHandle: 'actor:local',
          issuer: 'https://issuer.invalid',
          authenticatedAt: '2026-10-03T00:00:00.000Z',
          expiresAt: '2026-10-03T01:00:00.000Z',
        },
  }
  const providers = createSageAppServiceProviders({
    viewState: null,
    vault: activeVault as never,
    adapter: adapter as never,
    callerBinding,
    activeMatterContext: options.active ? activeContext() : createActiveMatterContext(),
    framePolicySnapshot: () => ({
      generation: options.frameSequence?.[Math.min(frameRead++, options.frameSequence.length - 1)]
        ?? options.frameGeneration
        ?? 7,
      ready: true,
      contaminated: false,
      contaminationReasons: [],
    }),
    matterRehydrate: (() => options.revision === 'unavailable'
      ? undefined
      : options.revision === 'stale'
        ? { denied: 'stale-revision' as const }
        : { matter: {} as never, current: true }) as never,
    matterLinks: () => options.defaultWorkspace === 'unavailable'
      ? { state: 'unavailable', links: [], trail: [] }
      : {
          state: 'read',
          links: [{
            matterRef: 'matter:active',
            workspaceRef: options.defaultWorkspace === 'drift' ? 'workspace:other' : 'workspace:active',
            workspacePath: '/trusted/workspace',
            linkedAt: '2026-10-03T00:00:00.000Z',
            isDefault: true,
          }],
          trail: [],
        },
    workspaceList: async () => options.workspace === 'unavailable'
      ? {
          source: 'workspace-follow', state: 'unavailable', reason: 'not-read', entries: [], order: [],
          archivedSessions: 0, frames: 0, unapplied: 0,
        }
      : {
          source: 'workspace-follow', state: 'read', reason: null,
          entries: [{
            workspaceId: 'workspace:active',
            path: options.workspace === 'drift' ? '/trusted/other' : '/trusted/workspace',
            title: 'Workspace', sessionCount: 0,
            createdAt: '2026-10-03T00:00:00.000Z',
            updatedAt: '2026-10-03T00:00:00.000Z',
          }],
          order: ['workspace:active'], archivedSessions: 0, frames: 1, unapplied: 0,
        },
    sessionSend,
    sessionStop,
    sessionResume,
    ...rawEffects,
  })
  return { providers, sessionSend, sessionStop, sessionResume, rawEffects }
}

function expectRawEffectsUntouched(rawEffects: ReturnType<typeof rawSessionEffectSpies>) {
  for (const provider of Object.values(rawEffects)) expect(provider).not.toHaveBeenCalled()
}

function assembleOperationRecorder() {
  const observed: SessionCoreProtectedEffectIntent[] = []
  const rawEffects = rawSessionEffectSpies()
  const providers = createUnavailableFirstService(null, {
    ...rawEffects,
    protectedEffectCorrelation: () => 'correlation:recorded',
    protectedEffectPorts: {
      verifyCaller: async () => ({ state: 'allowed', value: { bindingRef: callerBinding.correlation } }),
      resolveActiveContext: async () => ({
        state: 'allowed',
        value: {
          scope: 'request',
          callerBindingRef: callerBinding.correlation,
          sessionRef: 'session:active',
          matterRef: 'matter:active',
          revisionRef: 'revision:active.1',
          generation: '1',
        },
      }),
      matchCandidate: async () => ({ state: 'allowed', value: { candidateRef: 'candidate:active' } }),
      resolveIdentityPolicy: async ({ intent }) => {
        observed.push(intent)
        return { state: 'unavailable' }
      },
    },
  })
  return { providers, observed, rawEffects }
}

async function post(providers: ServiceProviders, path: string, body: unknown) {
  return handleSageServiceRequest(new Request(`dsh-app://app${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), { callerBinding, providers })
}

describe('AUTH-02A session-core route admission', () => {
  it('blocks send, stop and resume before the raw provider when there is no active context', async () => {
    const harness = assemble({ active: false })

    expect(await (await post(harness.providers, '/.sage/session/send', {
      matterRef: 'matter:active', workspaceRoot: '/renderer/path', text: 'run',
    })).json()).toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(await (await post(harness.providers, '/.sage/session/stop', {
      matterRef: 'matter:active',
    })).json()).toMatchObject({ state: 'refused', code: 'protected-effect-unavailable', paused: false })
    expect(await (await post(harness.providers, '/.sage/session/resume', {
      matterRef: 'matter:active', workspaceRoot: '/renderer/path',
    })).json()).toMatchObject({ state: 'refused', code: 'protected-effect-unavailable', paused: false })

    expect(harness.sessionSend).not.toHaveBeenCalled()
    expect(harness.sessionStop).not.toHaveBeenCalled()
    expect(harness.sessionResume).not.toHaveBeenCalled()
  })

  it('matches the main-owned context, then remains unavailable at the missing authority ports', async () => {
    const harness = assemble({ active: true })
    const response = await post(harness.providers, '/.sage/session/send', {
      matterRef: 'matter:active', workspaceRoot: '/renderer/path', text: 'run', mode: 'steer',
    })

    expect(await response.json()).toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(harness.sessionSend).not.toHaveBeenCalled()
  })

  it('names candidate and frame drift as stale and still performs zero dispatch', async () => {
    const matterDrift = assemble({ active: true })
    expect(await (await post(matterDrift.providers, '/.sage/session/stop', {
      matterRef: 'matter:other',
    })).json()).toMatchObject({ state: 'refused', code: 'protected-effect-stale' })
    expect(matterDrift.sessionStop).not.toHaveBeenCalled()

    const frameDrift = assemble({ active: true, frameGeneration: 8 })
    expect(await (await post(frameDrift.providers, '/.sage/session/resume', {
      matterRef: 'matter:active', workspaceRoot: '/renderer/path',
    })).json()).toMatchObject({ state: 'refused', code: 'protected-effect-stale' })
    expect(frameDrift.sessionResume).not.toHaveBeenCalled()
  })

  it('rechecks identity, current revision, default link and fresh workspace before admission', async () => {
    const cases = [
      [assemble({ active: true, identity: 'drift' }), 'protected-effect-stale'],
      [assemble({ active: true, identity: 'missing' }), 'protected-effect-unavailable'],
      [assemble({ active: true, revision: 'stale' }), 'protected-effect-stale'],
      [assemble({ active: true, revision: 'unavailable' }), 'protected-effect-unavailable'],
      [assemble({ active: true, defaultWorkspace: 'drift' }), 'protected-effect-stale'],
      [assemble({ active: true, defaultWorkspace: 'unavailable' }), 'protected-effect-unavailable'],
      [assemble({ active: true, workspace: 'drift' }), 'protected-effect-stale'],
      [assemble({ active: true, workspace: 'unavailable' }), 'protected-effect-unavailable'],
    ] as const

    for (const [harness, code] of cases) {
      expect(await (await post(harness.providers, '/.sage/session/send', {
        matterRef: 'matter:active', workspaceRoot: '/renderer/path', text: 'run',
      })).json()).toEqual({ state: 'refused', code })
      expect(harness.sessionSend).not.toHaveBeenCalled()
      expectRawEffectsUntouched(harness.rawEffects)
    }
  })
})

describe('AUTH-02B session-family admission', () => {
  it('uses stable operation names, active/matter candidates and authority-free payloads', async () => {
    const harness = assembleOperationRecorder()

    for (const item of thirdBatchCases) {
      const response = await post(harness.providers, item.path, item.body)
      expect(await response.json()).toMatchObject(item.envelope === 'pending'
        ? { ok: false, code: 'protected-effect-unavailable' }
        : { state: 'refused', code: 'protected-effect-unavailable' })
    }

    expect(harness.observed).toEqual(thirdBatchCases.map((item) => ({
      family: 'session-core',
      requestId: 'correlation:recorded',
      operation: item.operation,
      candidate: item.candidate,
      payload: item.payload,
    })))
    expect(JSON.stringify(harness.observed)).not.toContain('/renderer/must-not-be-authority')
    expect(JSON.stringify(harness.observed)).not.toContain('/renderer/correction-must-not-be-authority')
    expectRawEffectsUntouched(harness.rawEffects)
  })

  it('keeps every raw provider at zero calls without an active context or later authority', async () => {
    for (const active of [false, true]) {
      const harness = assemble({ active })
      for (const item of thirdBatchCases) {
        const response = await post(harness.providers, item.path, item.body)
        expect(await response.json()).toMatchObject(item.envelope === 'pending'
          ? { ok: false, code: 'protected-effect-unavailable' }
          : { state: 'refused', code: 'protected-effect-unavailable' })
      }
      expectRawEffectsUntouched(harness.rawEffects)
    }
  })

  it('reports matter candidate and frame drift as stale before every affected raw provider', async () => {
    const candidateDrift = assemble({ active: true })
    for (const item of thirdBatchCases.filter((entry) => entry.candidate.kind === 'matter')) {
      const body = { ...item.body, matterRef: 'matter:other' }
      expect(await (await post(candidateDrift.providers, item.path, body)).json()).toMatchObject({
        state: 'refused',
        code: 'protected-effect-stale',
      })
    }
    expectRawEffectsUntouched(candidateDrift.rawEffects)

    const frameDrift = assemble({ active: true, frameGeneration: 8 })
    for (const item of thirdBatchCases.filter((entry) => entry.candidate.kind === 'active-session')) {
      const response = await post(frameDrift.providers, item.path, item.body)
      expect(await response.json()).toMatchObject(item.envelope === 'pending'
        ? { ok: false, code: 'protected-effect-stale' }
        : { state: 'refused', code: 'protected-effect-stale' })
    }
    expectRawEffectsUntouched(frameDrift.rawEffects)
  })
})

describe('AUTH-02C correction admission', () => {
  it('keeps the correction raw owner and downstream send at zero even when every pre-dispatch port is allowed', async () => {
    const downstreamSend = vi.fn(async () => ({ state: 'accepted' as const, requestId: 'raw-request' }))
    const correctionCreate = vi.fn(async (request: {
      readonly matterRef: string
      readonly workspaceRoot: string
      readonly originalText: string
      readonly originalAt?: string
      readonly text: string
    }) => {
      await downstreamSend(request)
      return { state: 'refused' as const, code: 'raw-provider-called' }
    })
    const providers = createUnavailableFirstService(null, {
      correctionCreate,
      protectedEffectCorrelation: () => 'correlation:correction',
      protectedEffectPorts: {
        verifyCaller: async () => ({ state: 'allowed', value: { bindingRef: callerBinding.correlation } }),
        resolveActiveContext: async () => ({
          state: 'allowed',
          value: {
            scope: 'request',
            callerBindingRef: callerBinding.correlation,
            sessionRef: 'session:active',
            matterRef: 'matter:active',
            revisionRef: 'revision:active.1',
            generation: '1',
          },
        }),
        matchCandidate: async () => ({ state: 'allowed', value: { candidateRef: 'candidate:active' } }),
        resolveIdentityPolicy: async () => ({ state: 'allowed', value: { decisionRef: 'decision:1', actorScopeRef: 'actor:1' } }),
        resolveTarget: async () => ({ state: 'allowed', value: { targetRef: 'target:1' } }),
        resolveCompatibility: async () => ({ state: 'allowed', value: { evaluationRef: 'evaluation:1', outcome: 'equivalent' } }),
        resolveRegistry: async () => ({ state: 'allowed', value: { mappingRef: 'mapping:1' } }),
        preflight: async () => ({ state: 'allowed', value: { preflightRef: 'preflight:1' } }),
        persist: async () => ({ state: 'allowed', value: { operationRef: 'operation:1', dispatchRef: 'dispatch:1' } }),
      },
    })

    expect(await (await post(providers, '/.sage/corrections', {
      matterRef: 'matter:active',
      workspaceRoot: '/renderer/path',
      originalText: 'before',
      text: 'after',
    })).json()).toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(correctionCreate).not.toHaveBeenCalled()
    expect(downstreamSend).not.toHaveBeenCalled()
  })

  it('rechecks frame freshness after context resolution and before correction dispatch', async () => {
    const harness = assemble({ active: true, frameSequence: [7, 8] })

    expect(await (await post(harness.providers, '/.sage/corrections', {
      matterRef: 'matter:active',
      workspaceRoot: '/renderer/path',
      originalText: 'before',
      text: 'after',
    })).json()).toEqual({ state: 'refused', code: 'protected-effect-stale' })
    expect(harness.rawEffects.correctionCreate).not.toHaveBeenCalled()
    expect(harness.sessionSend).not.toHaveBeenCalled()
  })
})

describe('AUTH-02D attachment upload admission', () => {
  it('uses one stable operation and carries only the opaque item clue in its payload', async () => {
    const harness = assembleOperationRecorder()

    expect(await (await post(harness.providers, attachmentUploadCase.path, attachmentUploadCase.body)).json())
      .toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(harness.observed).toEqual([{
      family: 'session-core',
      requestId: 'correlation:recorded',
      operation: attachmentUploadCase.operation,
      candidate: attachmentUploadCase.candidate,
      payload: attachmentUploadCase.payload,
    }])
    expect(JSON.stringify(harness.observed)).not.toContain(attachmentUploadCase.body.workspaceRoot)
    expect(harness.rawEffects.attachmentsUpload).not.toHaveBeenCalled()
  })

  it('blocks missing context and later missing authority before the raw upload provider', async () => {
    for (const active of [false, true]) {
      const harness = assemble({ active })

      expect(await (await post(harness.providers, attachmentUploadCase.path, attachmentUploadCase.body)).json())
        .toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
      expect(harness.rawEffects.attachmentsUpload).not.toHaveBeenCalled()
    }
  })

  it('reports matter, revision and frame drift as stale without reaching the raw upload provider', async () => {
    const cases = [
      [assemble({ active: true }), { ...attachmentUploadCase.body, matterRef: 'matter:other' }],
      [assemble({ active: true, revision: 'stale' }), attachmentUploadCase.body],
      [assemble({ active: true, frameSequence: [7, 8] }), attachmentUploadCase.body],
    ] as const

    for (const [harness, body] of cases) {
      expect(await (await post(harness.providers, attachmentUploadCase.path, body)).json())
        .toEqual({ state: 'refused', code: 'protected-effect-stale' })
      expect(harness.rawEffects.attachmentsUpload).not.toHaveBeenCalled()
    }
  })

  it('still performs zero upload dispatch when every pre-dispatch port is allowed', async () => {
    const attachmentsUpload = vi.fn(async () => ({ state: 'refused' as const, code: 'raw-provider-called' }))
    const providers = createUnavailableFirstService(null, {
      attachmentsUpload,
      protectedEffectCorrelation: () => 'correlation:attachment-upload',
      protectedEffectPorts: {
        verifyCaller: async () => ({ state: 'allowed', value: { bindingRef: callerBinding.correlation } }),
        resolveActiveContext: async () => ({
          state: 'allowed',
          value: {
            scope: 'request',
            callerBindingRef: callerBinding.correlation,
            sessionRef: 'session:active',
            matterRef: 'matter:active',
            revisionRef: 'revision:active.1',
            generation: '1',
          },
        }),
        matchCandidate: async () => ({ state: 'allowed', value: { candidateRef: 'candidate:active' } }),
        resolveIdentityPolicy: async () => ({ state: 'allowed', value: { decisionRef: 'decision:1', actorScopeRef: 'actor:1' } }),
        resolveTarget: async () => ({ state: 'allowed', value: { targetRef: 'target:1' } }),
        resolveCompatibility: async () => ({ state: 'allowed', value: { evaluationRef: 'evaluation:1', outcome: 'equivalent' } }),
        resolveRegistry: async () => ({ state: 'allowed', value: { mappingRef: 'mapping:1' } }),
        preflight: async () => ({ state: 'allowed', value: { preflightRef: 'preflight:1' } }),
        persist: async () => ({ state: 'allowed', value: { operationRef: 'operation:1', dispatchRef: 'dispatch:1' } }),
      },
    })

    expect(await (await post(providers, attachmentUploadCase.path, attachmentUploadCase.body)).json())
      .toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(attachmentsUpload).not.toHaveBeenCalled()
  })
})

describe('AUTH-02E attachment cancel admission', () => {
  it('uses one stable operation, the active session candidate and only the opaque item clue', async () => {
    const harness = assembleOperationRecorder()

    expect(await (await post(harness.providers, attachmentCancelCase.path, attachmentCancelCase.body)).json())
      .toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(harness.observed).toEqual([{
      family: 'session-core',
      requestId: 'correlation:recorded',
      operation: attachmentCancelCase.operation,
      candidate: attachmentCancelCase.candidate,
      payload: attachmentCancelCase.payload,
    }])
    expect(Object.keys(harness.observed[0]?.payload ?? {})).toEqual(['itemId'])
    expect(harness.rawEffects.attachmentsCancel).not.toHaveBeenCalled()
  })

  it('blocks missing context and later missing authority before the raw cancel provider', async () => {
    for (const active of [false, true]) {
      const harness = assemble({ active })

      expect(await (await post(harness.providers, attachmentCancelCase.path, attachmentCancelCase.body)).json())
        .toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
      expect(harness.rawEffects.attachmentsCancel).not.toHaveBeenCalled()
    }
  })

  it('reports revision and frame drift as stale without reaching the raw cancel provider', async () => {
    const cases = [
      assemble({ active: true, revision: 'stale' }),
      assemble({ active: true, frameSequence: [7, 8] }),
    ] as const

    for (const harness of cases) {
      expect(await (await post(harness.providers, attachmentCancelCase.path, attachmentCancelCase.body)).json())
        .toEqual({ state: 'refused', code: 'protected-effect-stale' })
      expect(harness.rawEffects.attachmentsCancel).not.toHaveBeenCalled()
    }
  })

  it('still performs zero cancel dispatch when every pre-dispatch port is allowed', async () => {
    const attachmentsCancel = vi.fn(async () => ({ state: 'refused' as const, code: 'raw-provider-called' }))
    const providers = createUnavailableFirstService(null, {
      attachmentsCancel,
      protectedEffectCorrelation: () => 'correlation:attachment-cancel',
      protectedEffectPorts: {
        verifyCaller: async () => ({ state: 'allowed', value: { bindingRef: callerBinding.correlation } }),
        resolveActiveContext: async () => ({
          state: 'allowed',
          value: {
            scope: 'request',
            callerBindingRef: callerBinding.correlation,
            sessionRef: 'session:active',
            matterRef: 'matter:active',
            revisionRef: 'revision:active.1',
            generation: '1',
          },
        }),
        matchCandidate: async () => ({ state: 'allowed', value: { candidateRef: 'candidate:active' } }),
        resolveIdentityPolicy: async () => ({ state: 'allowed', value: { decisionRef: 'decision:1', actorScopeRef: 'actor:1' } }),
        resolveTarget: async () => ({ state: 'allowed', value: { targetRef: 'target:1' } }),
        resolveCompatibility: async () => ({ state: 'allowed', value: { evaluationRef: 'evaluation:1', outcome: 'equivalent' } }),
        resolveRegistry: async () => ({ state: 'allowed', value: { mappingRef: 'mapping:1' } }),
        preflight: async () => ({ state: 'allowed', value: { preflightRef: 'preflight:1' } }),
        persist: async () => ({ state: 'allowed', value: { operationRef: 'operation:1', dispatchRef: 'dispatch:1' } }),
      },
    })

    expect(await (await post(providers, attachmentCancelCase.path, attachmentCancelCase.body)).json())
      .toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(attachmentsCancel).not.toHaveBeenCalled()
  })
})
