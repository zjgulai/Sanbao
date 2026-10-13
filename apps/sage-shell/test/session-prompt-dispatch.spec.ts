/** T05-mid step 10 (ADR-0289): the dispatch step — re-verification, the cheap port re-runs, the
 *  sole channel call, and the caller-facing outcome mapping of the whole ten-step chain. */
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { admitProtectedEffect } from '../src/appservice/protected-effect-admission.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createSageAppServiceProviders } from '../src/main/app-service.js'
import { createActiveMatterContext } from '../src/main/active-matter-context.js'
import { createSessionPromptAttemptStore } from '../src/main/session-prompt-attempt-store.js'
import { createSessionPromptDispatchPort } from '../src/main/session-prompt-dispatch.js'
import { loadSessionPromptRequirementBundle } from '../src/main/publication-bundle.js'
import { createBundledCapabilityRegistryProvider } from '../src/security/capability-registry-provider.js'
import { createBusinessMatter, enterEvidence } from '../src/domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../src/domain/business-matter-codec.js'
import { openBusinessMatterEventStore } from '../src/persistence/business-matter-event-store.js'
import {
  createBundledCompatibilityMatrixProviderV2,
  sealCompatibilityMatrixBundleV2,
  sealCompatibilityMatrixRevocationSourceV2,
} from '../src/security/compatibility-matrix-provider.js'
import {
  canonicalizeCompatibilityMatrixV2,
  computeCompatibilityMatrixIdV2,
  type CompatibilityMatrixV2,
  type RuntimeDescriptorV2,
  type RuntimeInventoryEvidenceV2,
} from '../src/security/compatibility.js'
import { resolveSagePaths } from '../src/profile/paths.js'
import type { RuntimeEffectiveObservation } from '../src/protocol.js'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const MATTER_ID = 'matter:sage.dispatch-1'
const REVISION_ID = 'revision:sage.dispatch-1'
const TARGET_SEMANTIC_DIGEST = 'urn:sage:target-semantic:sha256:ad9537216c01119ebc2527e52d29c664744f282f1bf513f30797e0b17ed5fdb7'

const reobs = JSON.parse(readFileSync(join(APP_ROOT, 'test/support/reobs-runtime-inventory.json'), 'utf8')) as {
  kind: string
  descriptor: RuntimeDescriptorV2
  evidence: RuntimeInventoryEvidenceV2
}
const observation = { descriptor: reobs.descriptor, evidence: reobs.evidence }

const OBSERVED: RuntimeEffectiveObservation = {
  kind: 'observed',
  defaultPresetId: 'preset:sage-default',
  presets: [{ id: 'preset:sage-default', isDefault: true }],
}

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

const CONTEXT = {
  scope: 'request' as const,
  callerBindingRef: 'caller:session-core',
  sessionRef: 'session:active',
  matterRef: MATTER_ID,
  revisionRef: REVISION_ID,
  generation: '7',
}
const EVIDENCE = { revisionDigest: `sha256:${'d'.repeat(64)}`, attemptId: 'attempt:sage.dispatch-fixture-1' }

function dispatchHarness(options: {
  readonly text?: unknown
  readonly sessionSend?: unknown
  readonly recordDispatchUnknown?: unknown
  readonly readContext?: () => unknown
  readonly readWorkspaceRoot?: (matterRef: string) => string | undefined
  readonly targetRef?: string
  readonly registryRef?: string
  readonly preflightRef?: string
  readonly operation?: string
  readonly payload?: Readonly<Record<string, unknown>>
  readonly approvalAnswer?: unknown
  readonly approvalWithdraw?: unknown
  readonly pendingUpdate?: unknown
  readonly queueItemUpdate?: unknown
  readonly recordControlClosed?: unknown
}) {
  const sessionSend = (options.sessionSend ?? vi.fn(async () => ({
    state: 'accepted' as const,
    sessionId: 'session:sage.e2e',
    requestId: 'channel:request-1',
    mode: 'queue' as const,
  }))) as never
  const recordDispatchUnknown = (options.recordDispatchUnknown ?? vi.fn(async () => undefined)) as never
  // The control handlers default to spies; a test that omits one exercises the unwired path.
  const approvalAnswer = (options.approvalAnswer ?? vi.fn(async () => ({ state: 'refused' as const, code: 'not-configured' }))) as never
  const approvalWithdraw = (options.approvalWithdraw ?? vi.fn(async () => ({ state: 'refused' as const, code: 'not-configured' }))) as never
  const pendingUpdate = (options.pendingUpdate ?? vi.fn(() => ({ ok: false as const, code: 'not-configured' }))) as never
  const queueItemUpdate = (options.queueItemUpdate ?? vi.fn(async () => ({ state: 'refused' as const, code: 'not-configured' }))) as never
  const port = createSessionPromptDispatchPort({
    sessionSend: sessionSend as never,
    recordDispatchUnknown: recordDispatchUnknown as never,
    resolveTarget: vi.fn(async () => ({ state: 'allowed' as const, value: { targetRef: options.targetRef ?? 'target:admitted' } })) as never,
    resolveRegistry: vi.fn(async () => ({ state: 'allowed' as const, value: { mappingRef: options.registryRef ?? 'mapping:admitted' } })) as never,
    preflight: vi.fn(async () => ({ state: 'allowed' as const, value: { preflightRef: options.preflightRef ?? 'urn:sage:preflight:v1:admitted' } })) as never,
    readWorkspaceRoot: options.readWorkspaceRoot ?? (() => '/trusted/workspace'),
    readContext: (options.readContext ?? (() => ({
      sessionRef: 'session:active',
      matterRef: MATTER_ID,
      revisionRef: REVISION_ID,
      contextGeneration: 7,
      frameGeneration: 7,
    }))) as never,
    readIdentitySession: (() => ({ sessionRef: 'session:active' })) as never,
    readFrame: (() => ({ generation: 7, ready: true, contaminated: false })) as never,
    runtimeEffective: (() => OBSERVED) as never,
    attempts: {
      strictRehydrate: () => ({ matter: {} as never, current: true, version: 3 }),
      revisionDigest: () => EVIDENCE.revisionDigest,
    } as never,
    ...(options.approvalAnswer === undefined ? {} : { approvalAnswer: approvalAnswer as never }),
    ...(options.approvalWithdraw === undefined ? {} : { approvalWithdraw: approvalWithdraw as never }),
    ...(options.pendingUpdate === undefined ? {} : { pendingUpdate: pendingUpdate as never }),
    ...(options.queueItemUpdate === undefined ? {} : { queueItemUpdate: queueItemUpdate as never }),
    ...(options.recordControlClosed === undefined ? {} : { recordControlClosed: options.recordControlClosed as never }),
  })
  const request = {
    intent: {
      family: 'session-core',
      requestId: 'dispatch-fixture-1',
      operation: options.operation ?? 'session.send',
      candidate: { kind: 'matter', matterRef: MATTER_ID },
      payload: options.payload ?? { text: options.text ?? 'run', mode: 'queue' },
    },
    correlation: 'caller:session-core',
    context: CONTEXT,
    target: { targetRef: 'target:admitted' },
    compatibility: { evaluationRef: 'urn:sage:compatibility-evaluation:v1:fixture', outcome: 'equivalent', evidence: EVIDENCE },
    registry: { mappingRef: 'mapping:admitted' },
    preflight: { preflightRef: 'urn:sage:preflight:v1:admitted' },
    operationRef: 'operation:sage.dispatch-fixture-1',
    dispatchRef: 'dispatch:sage.dispatch-fixture-1',
  } as never
  return {
    port,
    sessionSend: sessionSend as unknown as ReturnType<typeof vi.fn>,
    recordDispatchUnknown: recordDispatchUnknown as unknown as ReturnType<typeof vi.fn>,
    approvalAnswer: approvalAnswer as unknown as ReturnType<typeof vi.fn>,
    approvalWithdraw: approvalWithdraw as unknown as ReturnType<typeof vi.fn>,
    pendingUpdate: pendingUpdate as unknown as ReturnType<typeof vi.fn>,
    queueItemUpdate: queueItemUpdate as unknown as ReturnType<typeof vi.fn>,
    recordControlClosed: options.recordControlClosed as unknown as ReturnType<typeof vi.fn>,
    request,
  }
}

describe('the real dispatch step (ADR-0289)', () => {
  it('calls the channel only after every guard and normalizes accepted and deferred outcomes', async () => {
    const accepted = dispatchHarness({})
    expect(await accepted.port(accepted.request)).toEqual({
      state: 'receipt',
      receiptRef: 'receipt:session-send:channel:request-1',
      detail: {
        kind: 'session-send-accepted',
        sessionId: 'session:sage.e2e',
        requestId: 'channel:request-1',
        mode: 'queue',
      },
    })
    expect(accepted.sessionSend).toHaveBeenCalledTimes(1)
    expect(accepted.sessionSend).toHaveBeenCalledWith({
      matterRef: MATTER_ID,
      workspaceRoot: '/trusted/workspace',
      text: 'run',
      mode: 'queue',
      // ADR-0296 D5: the channel request id derives from the attempt identity, not a second mint.
      requestId: 'req-sage.dispatch-fixture-1',
    })

    const deferred = dispatchHarness({
      sessionSend: vi.fn(async () => ({ state: 'deferred' as const, itemId: 'queue-item:1' })),
    })
    expect(await deferred.port(deferred.request)).toEqual({
      state: 'receipt',
      receiptRef: 'receipt:session-send-deferred:queue-item:1',
      detail: { kind: 'session-send-deferred', itemId: 'queue-item:1' },
    })
  })

  it('normalizes a determinate channel refusal and everything uncertain honestly', async () => {
    const refused = dispatchHarness({
      sessionSend: vi.fn(async () => ({ state: 'refused' as const, code: 'session-channel-closed' })),
    })
    expect(await refused.port(refused.request)).toEqual({ state: 'refused', code: 'session-channel-closed' })

    const thrown = dispatchHarness({
      sessionSend: vi.fn(async () => { throw new Error('probe') }),
    })
    expect(await thrown.port(thrown.request)).toEqual({ state: 'outcome-unknown' })
    // ADR-0296 D4: the unknown is durable before it is answered — the marker recorder saw the
    // attempt; the determinate and accepted cases above recorded nothing.
    expect(thrown.recordDispatchUnknown).toHaveBeenCalledWith({
      matterRef: MATTER_ID,
      attemptId: 'attempt:sage.dispatch-fixture-1',
    })
    expect(thrown.recordDispatchUnknown).toHaveBeenCalledTimes(1)
    expect(refused.recordDispatchUnknown).not.toHaveBeenCalled()
  })

  it('answers not-dispatched when the admitted evidence carries no attempt identity', async () => {
    const harness = dispatchHarness({})
    const request = {
      ...(harness.request as Record<string, unknown>),
      compatibility: { evaluationRef: 'urn:sage:compatibility-evaluation:v1:fixture', outcome: 'equivalent', evidence: { revisionDigest: EVIDENCE.revisionDigest } },
    } as never
    expect(await harness.port(request)).toEqual({ state: 'not-dispatched' })
    expect(harness.sessionSend).not.toHaveBeenCalled()
    expect(harness.recordDispatchUnknown).not.toHaveBeenCalled()
  })

  it('answers not-dispatched before the channel when any guard or re-run drifts', async () => {
    const cases = [
      { name: 'context moved', harness: () => dispatchHarness({ readContext: () => ({ sessionRef: 'session:active', matterRef: MATTER_ID, revisionRef: REVISION_ID, contextGeneration: 8, frameGeneration: 7 }) }) },
      { name: 'target moved', harness: () => dispatchHarness({ targetRef: 'target:other' }) },
      { name: 'registry moved', harness: () => dispatchHarness({ registryRef: 'mapping:other' }) },
      { name: 'roster moved', harness: () => dispatchHarness({ preflightRef: 'urn:sage:preflight:v1:other' }) },
      { name: 'workspace unresolvable', harness: () => dispatchHarness({ readWorkspaceRoot: () => undefined }) },
      { name: 'payload invalid', harness: () => dispatchHarness({ text: '' }) },
    ]
    for (const item of cases) {
      const harness = item.harness()
      expect(await harness.port(harness.request), item.name).toEqual({ state: 'not-dispatched' })
      expect(harness.sessionSend, item.name).not.toHaveBeenCalled()
    }
  })
})

describe('the session-control operations dispatch through their own handlers (ADR-0317 stage 3)', () => {
  const receipt = {
    requestId: 'approval:9',
    state: 'accepted' as const,
    outcome: 'allowed-once' as const,
    submittedAt: '2026-10-11T12:00:00Z',
    code: null,
    verifyOnly: false,
  }

  it('dispatches the approval answer and withdraw with the handler receipt inside the detail', async () => {
    const answerClosure = vi.fn(async () => undefined)
    const answer = dispatchHarness({
      operation: 'session.approval.answer',
      payload: { requestId: 'approval:9', outcome: 'allowed-once' },
      approvalAnswer: vi.fn(async () => ({ state: 'recorded' as const, receipt })),
      recordControlClosed: answerClosure,
    })
    expect(await answer.port(answer.request)).toEqual({
      state: 'receipt',
      receiptRef: 'receipt:session-approval-answer:approval:9',
      detail: { kind: 'approval-answer-recorded', requestId: 'approval:9', receipt },
    })
    expect(answer.approvalAnswer).toHaveBeenCalledWith({ matterRef: MATTER_ID, requestId: 'approval:9', outcome: 'allowed-once' })
    // Stage 4: the control attempt closes synchronously with the proven outcome.
    expect(answerClosure).toHaveBeenCalledWith({
      matterRef: MATTER_ID,
      attemptId: 'attempt:sage.dispatch-fixture-1',
      outcome: { state: 'succeeded' },
    })
    // The channel port and the send-only durable note are never touched by a control op.
    expect(answer.sessionSend).not.toHaveBeenCalled()
    expect(answer.recordDispatchUnknown).not.toHaveBeenCalled()

    const withdraw = dispatchHarness({
      operation: 'session.approval.withdraw',
      payload: { requestId: 'approval:9' },
      approvalWithdraw: vi.fn(async () => ({ state: 'recorded' as const, receipt: { ...receipt, outcome: 'withdrawn' as const } })),
    })
    expect(await withdraw.port(withdraw.request)).toEqual({
      state: 'receipt',
      receiptRef: 'receipt:session-approval-withdraw:approval:9',
      detail: { kind: 'approval-withdraw-recorded', requestId: 'approval:9', receipt: { ...receipt, outcome: 'withdrawn' } },
    })
    expect(withdraw.approvalWithdraw).toHaveBeenCalledWith({ matterRef: MATTER_ID, requestId: 'approval:9' })

    // A determinate handler refusal passes its own code and closes the attempt as failed; a
    // throw is the conservative unknown — the attempt stays open fail-closed with the note.
    const refusedClosure = vi.fn(async () => undefined)
    const refused = dispatchHarness({
      operation: 'session.approval.answer',
      payload: { requestId: 'approval:9', outcome: 'rejected' },
      approvalAnswer: vi.fn(async () => ({ state: 'refused' as const, code: 'approval-not-pending' })),
      recordControlClosed: refusedClosure,
    })
    expect(await refused.port(refused.request)).toEqual({ state: 'refused', code: 'approval-not-pending' })
    expect(refusedClosure).toHaveBeenCalledWith({
      matterRef: MATTER_ID,
      attemptId: 'attempt:sage.dispatch-fixture-1',
      outcome: { state: 'failed', code: 'approval-not-pending' },
    })

    const thrown = dispatchHarness({
      operation: 'session.approval.withdraw',
      payload: { requestId: 'approval:9' },
      approvalWithdraw: vi.fn(async () => { throw new Error('probe') }),
    })
    expect(await thrown.port(thrown.request)).toEqual({ state: 'outcome-unknown' })
    expect(thrown.recordDispatchUnknown).toHaveBeenCalledWith({
      matterRef: MATTER_ID,
      attemptId: 'attempt:sage.dispatch-fixture-1',
    })
  })

  it('dispatches the pending and queue edits/removals with named receipts', async () => {
    const edit = dispatchHarness({
      operation: 'session.pending.edit',
      payload: { itemId: 'pending:1', text: 'new text' },
      pendingUpdate: vi.fn(() => ({ ok: true as const })),
    })
    expect(await edit.port(edit.request)).toEqual({
      state: 'receipt',
      receiptRef: 'receipt:session-pending-edit:pending:1',
      detail: { kind: 'pending-edited', itemId: 'pending:1' },
    })
    // The handler receives the trusted matter ref, never the renderer's.
    expect(edit.pendingUpdate).toHaveBeenCalledWith({ action: 'edit', itemId: 'pending:1', text: 'new text' }, MATTER_ID)

    const remove = dispatchHarness({
      operation: 'session.pending.remove',
      payload: { itemId: 'pending:2' },
      pendingUpdate: vi.fn(() => ({ ok: true as const })),
    })
    expect(await remove.port(remove.request)).toEqual({
      state: 'receipt',
      receiptRef: 'receipt:session-pending-remove:pending:2',
      detail: { kind: 'pending-removed', itemId: 'pending:2' },
    })

    // A frozen item is a determinate refusal; a code-less refusal keeps its own stable name.
    const frozen = dispatchHarness({
      operation: 'session.pending.edit',
      payload: { itemId: 'pending:1', text: 'new text' },
      pendingUpdate: vi.fn(() => ({ ok: false as const, code: 'item-frozen' })),
    })
    expect(await frozen.port(frozen.request)).toEqual({ state: 'refused', code: 'item-frozen' })
    const codelessClosure = vi.fn(async () => undefined)
    const codeless = dispatchHarness({
      operation: 'session.pending.remove',
      payload: { itemId: 'pending:1' },
      pendingUpdate: vi.fn(() => ({ ok: false as const })),
      recordControlClosed: codelessClosure,
    })
    expect(await codeless.port(codeless.request)).toEqual({ state: 'refused', code: 'session-pending-update-refused' })
    expect(codelessClosure).toHaveBeenCalledWith({
      matterRef: MATTER_ID,
      attemptId: 'attempt:sage.dispatch-fixture-1',
      outcome: { state: 'failed', code: 'session-pending-update-refused' },
    })

    const queueEdit = dispatchHarness({
      operation: 'session.queue.edit',
      payload: { itemId: 'queue:1', text: 'new text' },
      queueItemUpdate: vi.fn(async () => ({ state: 'ok' as const })),
    })
    expect(await queueEdit.port(queueEdit.request)).toEqual({
      state: 'receipt',
      receiptRef: 'receipt:session-queue-edit:queue:1',
      detail: { kind: 'queue-edited', itemId: 'queue:1' },
    })
    expect(queueEdit.queueItemUpdate).toHaveBeenCalledWith({ action: 'edit', itemId: 'queue:1', text: 'new text' })

    const queueRemove = dispatchHarness({
      operation: 'session.queue.remove',
      payload: { itemId: 'queue:2' },
      queueItemUpdate: vi.fn(async () => ({ state: 'ok' as const })),
    })
    expect(await queueRemove.port(queueRemove.request)).toEqual({
      state: 'receipt',
      receiptRef: 'receipt:session-queue-remove:queue:2',
      detail: { kind: 'queue-removed', itemId: 'queue:2' },
    })

    const gone = dispatchHarness({
      operation: 'session.queue.remove',
      payload: { itemId: 'queue:2' },
      queueItemUpdate: vi.fn(async () => ({ state: 'refused' as const, code: 'queue-item-not-found' })),
    })
    expect(await gone.port(gone.request)).toEqual({ state: 'refused', code: 'queue-item-not-found' })
  })

  it('keeps an unwired handler and every malformed payload not-dispatched', async () => {
    const unwired = [
      dispatchHarness({ operation: 'session.approval.answer', payload: { requestId: 'approval:9', outcome: 'allowed-once' } }),
      dispatchHarness({ operation: 'session.approval.withdraw', payload: { requestId: 'approval:9' } }),
      dispatchHarness({ operation: 'session.pending.edit', payload: { itemId: 'pending:1', text: 'x' } }),
      dispatchHarness({ operation: 'session.queue.remove', payload: { itemId: 'queue:1' } }),
    ]
    for (const harness of unwired) {
      expect(await harness.port(harness.request)).toEqual({ state: 'not-dispatched' })
    }

    const malformed = [
      dispatchHarness({ operation: 'session.approval.answer', payload: { requestId: '', outcome: 'allowed-once' }, approvalAnswer: vi.fn() }),
      dispatchHarness({ operation: 'session.approval.answer', payload: { requestId: 'approval:9', outcome: 'maybe' }, approvalAnswer: vi.fn() }),
      dispatchHarness({ operation: 'session.approval.withdraw', payload: {}, approvalWithdraw: vi.fn() }),
      dispatchHarness({ operation: 'session.pending.edit', payload: { itemId: 'pending:1', text: '' }, pendingUpdate: vi.fn() }),
      dispatchHarness({ operation: 'session.pending.remove', payload: { itemId: 7 }, pendingUpdate: vi.fn() }),
      dispatchHarness({ operation: 'session.queue.edit', payload: { itemId: 'queue:1', text: 'x'.repeat(16_385) }, queueItemUpdate: vi.fn() }),
      dispatchHarness({ operation: 'session.unknown.op', payload: {}, approvalAnswer: vi.fn() }),
    ]
    for (const harness of malformed) {
      expect(await harness.port(harness.request)).toEqual({ state: 'not-dispatched' })
    }
    for (const harness of malformed) {
      expect(harness.approvalAnswer).not.toHaveBeenCalled()
      expect(harness.approvalWithdraw).not.toHaveBeenCalled()
      expect(harness.pendingUpdate).not.toHaveBeenCalled()
      expect(harness.queueItemUpdate).not.toHaveBeenCalled()
    }
  })

  it('keeps the drift re-checks in force for the control operations', async () => {
    const targetMoved = dispatchHarness({
      operation: 'session.pending.edit',
      payload: { itemId: 'pending:1', text: 'new text' },
      pendingUpdate: vi.fn(() => ({ ok: true as const })),
      targetRef: 'target:other',
    })
    expect(await targetMoved.port(targetMoved.request)).toEqual({ state: 'not-dispatched' })
    expect(targetMoved.pendingUpdate).not.toHaveBeenCalled()

    const contextMoved = dispatchHarness({
      operation: 'session.queue.remove',
      payload: { itemId: 'queue:1' },
      queueItemUpdate: vi.fn(async () => ({ state: 'ok' as const })),
      readContext: () => ({ sessionRef: 'session:active', matterRef: MATTER_ID, revisionRef: REVISION_ID, contextGeneration: 8, frameGeneration: 7 }),
    })
    expect(await contextMoved.port(contextMoved.request)).toEqual({ state: 'not-dispatched' })
    expect(contextMoved.queueItemUpdate).not.toHaveBeenCalled()
  })
})

describe('the kernel passes the receipt detail and the determinate refusal through', () => {
  const persistSaw: unknown[] = []
  afterEach(() => { persistSaw.length = 0 })
  function chain(dispatch: unknown) {
    return {
      verifyCaller: async () => ({ state: 'allowed' as const, value: { bindingRef: 'caller:session-core' } }),
      resolveActiveContext: async () => ({
        state: 'allowed' as const,
        value: { ...CONTEXT, callerBindingRef: 'caller:session-core' },
      }),
      matchCandidate: async () => ({ state: 'allowed' as const, value: { candidateRef: 'matter:active' } }),
      resolveIdentityPolicy: async () => ({ state: 'allowed' as const, value: { decisionRef: 'decision:fixture', actorScopeRef: 'actor:local' } }),
      resolveTarget: async () => ({ state: 'allowed' as const, value: { targetRef: 'target:admitted' } }),
      resolveCompatibility: async () => ({
        state: 'allowed' as const,
        value: { evaluationRef: 'urn:sage:compatibility-evaluation:v1:fixture', outcome: 'equivalent' as const, evidence: EVIDENCE },
      }),
      resolveRegistry: async () => ({ state: 'allowed' as const, value: { mappingRef: 'mapping:admitted' } }),
      preflight: async () => ({ state: 'allowed' as const, value: { preflightRef: 'urn:sage:preflight:v1:admitted' } }),
      persist: async (request: { readonly compatibility: { readonly evidence?: unknown } }) => {
        persistSaw.push(request.compatibility.evidence)
        return { state: 'allowed' as const, value: { operationRef: 'operation:1', dispatchRef: 'dispatch:1' } }
      },
      dispatch,
    } as never
  }
  const call = (dispatch: unknown) => admitProtectedEffect({
    intent: {
      family: 'session-core',
      requestId: 'kernel-fixture-1',
      operation: 'session.send',
      candidate: { kind: 'matter', matterRef: MATTER_ID },
      payload: { text: 'run' },
    },
    correlation: 'caller:session-core',
    ports: chain(dispatch),
  })

  it('keeps receipt + detail, refused-by-code, not-dispatched and unknown distinct', async () => {
    expect(await call(async () => ({
      state: 'receipt',
      receiptRef: 'receipt:session-send:channel:1',
      detail: { kind: 'session-send-accepted', sessionId: 'session:sage.e2e', requestId: 'channel:1', mode: 'queue' },
    }))).toMatchObject({
      state: 'dispatched',
      receiptRef: 'receipt:session-send:channel:1',
      detail: { kind: 'session-send-accepted', sessionId: 'session:sage.e2e' },
    })

    // The admitted evidence must survive the seam (ADR-0288): the persist step writes it.
    expect(persistSaw.at(-1)).toMatchObject({ revisionDigest: EVIDENCE.revisionDigest })

    expect(await call(async () => ({ state: 'refused', code: 'session-channel-closed' })))
      .toMatchObject({ state: 'refused', code: 'session-channel-closed' })

    expect(await call(async () => ({ state: 'not-dispatched' })))
      .toMatchObject({ state: 'unavailable', code: 'protected-effect-unavailable', retryable: true, stage: 'dispatch' })

    expect(await call(async () => ({ state: 'outcome-unknown' })))
      .toMatchObject({ state: 'outcome-unknown', code: 'protected-effect-outcome-unknown' })

    // A malformed detail is the conservative unknown, never a partial receipt.
    expect(await call(async () => ({
      state: 'receipt',
      receiptRef: 'receipt:session-send:channel:1',
      detail: { kind: 'session-send-accepted', sessionId: 'session:sage.e2e' },
    }))).toMatchObject({ state: 'outcome-unknown' })
  })
})

describe('the ten-step chain answers real operations end to end', () => {
  const callerBinding = { correlation: 'caller:session-core' }

  function testPublication() {
    const matrix: CompatibilityMatrixV2 = {
      schemaVersion: 'sage.compatibility-matrix.v2',
      canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
      semanticVersion: '2.0.0',
      targetContractVersion: 'sage.compatibility-target-semantic.v2',
      runtimeContractVersion: 'sage.runtime-descriptor.v2',
      issuer: { identity: 'authority:sage-compatibility', version: '2.0.0', digest: `sha256:${'a'.repeat(64)}` },
      // ADR-0326: mirrors the shipped window and always covers the recorded evidence instant.
      validFrom: '2026-10-11T00:00:00.000Z',
      expiresAt: '2027-10-11T00:00:00.000Z',
      rules: [
        {
          ruleId: 'rule:sage-session-prompt-v1',
          targetSemanticDigest: TARGET_SEMANTIC_DIGEST,
          runtimeDescriptorDigest: reobs.descriptor.runtimeDescriptorDigest,
          outcome: 'equivalent',
          reasonCode: 'owner-approved-exact-pair',
          reason: 'test window covering the observed evidence instant',
        },
        // The three control scopes (ADR-0317 stage 2): same pairing, their own shipped semantics.
        {
          ruleId: 'rule:sage-session-approval-v1',
          targetSemanticDigest: 'urn:sage:target-semantic:sha256:d42d1c2c07cc75d51007d3632b7e392e23946f15b6b3ef1f37bb5a7147488c07',
          runtimeDescriptorDigest: reobs.descriptor.runtimeDescriptorDigest,
          outcome: 'equivalent',
          reasonCode: 'owner-approved-exact-pair',
          reason: 'test window covering the observed evidence instant',
        },
        {
          ruleId: 'rule:sage-session-pending-v1',
          targetSemanticDigest: 'urn:sage:target-semantic:sha256:19cf214233a2071855ace1f7dfdbfde79ab973b5337e25a6afb01183c6352ca6',
          runtimeDescriptorDigest: reobs.descriptor.runtimeDescriptorDigest,
          outcome: 'equivalent',
          reasonCode: 'owner-approved-exact-pair',
          reason: 'test window covering the observed evidence instant',
        },
        {
          ruleId: 'rule:sage-session-queue-v1',
          targetSemanticDigest: 'urn:sage:target-semantic:sha256:a05402882656c1b894c8687c9978e011ee08de3861cb7b2fc392c6703597f16f',
          runtimeDescriptorDigest: reobs.descriptor.runtimeDescriptorDigest,
          outcome: 'equivalent',
          reasonCode: 'owner-approved-exact-pair',
          reason: 'test window covering the observed evidence instant',
        },
      ],
    }
    const canonicalMatrix = canonicalizeCompatibilityMatrixV2(matrix)
    const sealed = sealCompatibilityMatrixBundleV2({
      schemaVersion: 'sage.compatibility-matrix-bundle.v2',
      canonicalizationVersion: 'sage.compatibility-matrix-bundle-canonical-json.v2',
      providerProvenanceDigest: `sha256:${'b'.repeat(64)}`,
      artifacts: [{ matrixId: computeCompatibilityMatrixIdV2(canonicalMatrix), canonicalMatrix }],
    })
    if (!sealed.ok) throw new Error(sealed.reason)
    const revocation = sealCompatibilityMatrixRevocationSourceV2({
      schemaVersion: 'sage.compatibility-matrix-revocation-source.v2',
      canonicalizationVersion: 'sage.compatibility-matrix-revocation-canonical-json.v2',
      createdAt: '2026-10-10T00:00:00.000Z',
      sourceProvenanceDigest: `sha256:${'c'.repeat(64)}`,
      entries: [],
    })
    if (!revocation.ok) throw new Error(revocation.reason)
    return {
      ok: true as const,
      provider: createBundledCompatibilityMatrixProviderV2(sealed.value, revocation.value),
      bundleId: sealed.value.bundleId,
      matrixId: sealed.value.artifacts[0]!.matrixId,
      revocationSourceId: revocation.value.sourceId,
      bundle: sealed.value,
      revocationSource: revocation.value,
    }
  }

  it('POST /.sage/session/send answers accepted with the channel identity, and a second send stays blocked by the open attempt', async () => {
    const container = await mkdtemp(join(await realpath(tmpdir()), 'sage-dispatch-e2e-'))
    cleanups.push(() => rm(container, { recursive: true, force: true }))
    const root = join(container, 'Sage')
    const home = join(container, 'home')
    await mkdir(home, { mode: 0o700 })
    await mkdir(join(root, 'data', 'business-matter'), { mode: 0o700, recursive: true })
    const paths = resolveSagePaths({ home, root, platform: process.platform })
    await writeFile(paths.organizationPolicyFile, JSON.stringify({
      schemaVersion: 'sage.organization-policy.v1',
      organizationId: 'organization:sage',
      policy: { identity: 'policy:local', version: '1' },
      validFrom: '2026-10-01T00:00:00Z',
      expiresAt: '2027-10-01T00:00:00Z',
      membership: { mode: 'instance-operator', roleRefs: ['role:owner'] },
      grants: [{
        roleRef: 'role:owner',
        operation: 'session.send',
        actionScope: 'session.prompt',
        effectClass: 'external-write',
        requiresDecision: false,
      }],
    }), 'utf8')

    // Seed the domain state the chain requires: create → revision entered with the policy.
    const seedStore = openBusinessMatterEventStore({
      sagePaths: paths,
      maxStreamEvents: 32,
      maxPayloadBytes: 64 * 1024,
      busyTimeoutMs: 75,
      clock: () => '2026-10-10T15:00:00.000Z',
    })
    cleanups.push(() => seedStore.close())
    const created = createBusinessMatter({
      matterId: MATTER_ID,
      eventId: `${MATTER_ID}:created`,
      occurredAt: '2026-10-10T10:00:00Z',
      goal: 'Dispatch the first admitted send.',
      responsibleParty: { kind: 'human', roleRef: 'role:owner' },
    })
    const withRevision = enterEvidence(created, {
      eventId: `${MATTER_ID}:revision-1`,
      occurredAt: '2026-10-10T10:01:00Z',
      revisionId: REVISION_ID,
      changeReason: 'Declare the bounded session.prompt action.',
      scope: 'One prompt send under the admitted chain.',
      permissionBoundary: 'No external mutation beyond the session channel.',
      dataDestination: 'Sage session channel.',
      evidence: [{
        evidenceId: 'evidence:dispatch-1',
        source: 'fixture:dispatch',
        observedAt: '2026-10-10T10:00:30Z',
        status: 'supported',
      }],
      unknowns: [],
      options: [],
      dependencies: [],
      experienceRefs: [],
      actionPolicies: [{
        actionScope: 'session.prompt',
        effectClass: 'external-write',
        requiresDecision: false,
      }],
    })
    const seedEvents = encodeBusinessMatterEvents(withRevision).map((event) => ({
      matterId: event.matterId,
      eventId: event.eventId,
      eventType: event.eventType,
      eventSchemaVersion: event.eventSchemaVersion,
      occurredAt: event.occurredAt,
      payloadBytes: event.payloadBytes.slice(),
    }))
    const seeded = seedStore.append({
      matterId: MATTER_ID,
      expectedVersion: { kind: 'not-exists' },
      appendId: 'seed:dispatch-1',
      events: seedEvents,
    })
    expect(seeded.kind).toBe('appended')

    const attempts = createSessionPromptAttemptStore({ sagePaths: paths })
    cleanups.push(() => attempts.close())
    const sessionSend = vi.fn(async () => ({
      state: 'accepted' as const,
      sessionId: 'session:sage.e2e',
      requestId: 'channel:request-1',
      mode: 'queue' as const,
    }))

    const activeMatterContext = createActiveMatterContext()
    expect(activeMatterContext.activate({
      expectedContextGeneration: 0,
      next: {
        actorScopeRef: 'actor:local',
        matterId: MATTER_ID,
        revisionId: REVISION_ID,
        workspaceRef: 'workspace:active',
        trustedWorkspaceRoot: '/trusted/workspace',
        sessionRef: 'session:active',
        frameGeneration: 7,
      },
    }).ok).toBe(true)

    const registryLoad = JSON.parse(readFileSync(join(APP_ROOT, 'publications', 'session-prompt.capability-registry.json'), 'utf8')) as {
      snapshotId: string
    } & Record<string, unknown>
    const { snapshotId: _ignored, ...registryBody } = registryLoad
    void _ignored

    const providers = createSageAppServiceProviders({
      viewState: null,
      vault: {
        status: () => 'signed-out' as const,
        snapshot: () => ({ status: 'signed-out' as const, displayName: null }),
        signOut: () => undefined,
        identitySession: () => ({
          sessionRef: 'session:active',
          identityHandle: 'actor:local',
          issuer: 'https://issuer.invalid',
          authenticatedAt: '2026-10-01T00:00:00.000Z',
          expiresAt: '2027-01-01T00:00:00.000Z',
        }),
      } as never,
      adapter: { startLogin: async () => ({ ok: false as const, code: 'probe' }) } as never,
      callerBinding,
      activeMatterContext,
      framePolicySnapshot: () => ({ generation: 7, ready: true, contaminated: false, contaminationReasons: [] }),
      matterRehydrate: (() => ({ matter: {} as never, current: true })) as never,
      matterLinks: () => ({
        state: 'read',
        links: [{
          matterRef: MATTER_ID,
          workspaceRef: 'workspace:active',
          workspacePath: '/trusted/workspace',
          linkedAt: '2026-10-01T00:00:00.000Z',
          isDefault: true,
        }],
        trail: [],
      }),
      workspaceList: async () => ({
        source: 'workspace-follow', state: 'read', reason: null,
        entries: [{
          workspaceId: 'workspace:active',
          path: '/trusted/workspace',
          title: 'Workspace', sessionCount: 0,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        }],
        order: ['workspace:active'], archivedSessions: 0, frames: 1, unapplied: 0,
      }),
      sessionSend,
      authority: {
        policyPath: paths.organizationPolicyFile,
        readFileBytes: (path: string) => readFileSync(path),
        now: () => '2026-10-12T00:00:00.000Z',
      },
      requirementBundle: loadSessionPromptRequirementBundle(),
      compatibilityPublication: testPublication(),
      runtimeInventoryObservation: () => observation,
      capabilityRegistry: createBundledCapabilityRegistryProvider(registryBody as never),
      runtimeEffective: () => OBSERVED,
      sessionPromptAttempts: attempts,
      // ADR-0296: no prior turn end in the fixture fold.
      readObservedTurnEndEdge: async () => null,
      revisionDigest: (matterId: string, revisionId: string) => attempts.revisionDigest(matterId, revisionId),
    })

    const post = () => handleSageServiceRequest(new Request('dsh-app://app/.sage/session/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matterRef: MATTER_ID, workspaceRoot: '/renderer/path', text: 'run' }),
    }), { callerBinding, providers })

    const first = await (await post()).json()
    expect(first).toEqual({
      state: 'accepted',
      sessionId: 'session:sage.e2e',
      requestId: 'channel:request-1',
      mode: 'queue',
    })
    expect(sessionSend).toHaveBeenCalledTimes(1)

    // The attempt stays open until the turn-close flow lands (registered follow-up): a second
    // send fails closed at persist and never reaches the channel.
    const second = await (await post()).json()
    expect(second).toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(sessionSend).toHaveBeenCalledTimes(1)
  })

  it('answers a real approval end to end over the admitted chain (ADR-0317 stage 3)', async () => {
    const container = await mkdtemp(join(await realpath(tmpdir()), 'sage-dispatch-approval-e2e-'))
    cleanups.push(() => rm(container, { recursive: true, force: true }))
    const root = join(container, 'Sage')
    const home = join(container, 'home')
    await mkdir(home, { mode: 0o700 })
    await mkdir(join(root, 'data', 'business-matter'), { mode: 0o700, recursive: true })
    const paths = resolveSagePaths({ home, root, platform: process.platform })
    await writeFile(paths.organizationPolicyFile, JSON.stringify({
      schemaVersion: 'sage.organization-policy.v1',
      organizationId: 'organization:sage',
      policy: { identity: 'policy:local', version: '1' },
      validFrom: '2026-10-01T00:00:00Z',
      expiresAt: '2027-10-01T00:00:00Z',
      membership: { mode: 'instance-operator', roleRefs: ['role:owner'] },
      // The strictest grant shape: the answer op IS a decision, so requiresDecision must match.
      grants: [{
        roleRef: 'role:owner',
        operation: 'session.approval.answer',
        actionScope: 'session.approval',
        effectClass: 'external-write',
        requiresDecision: true,
      }],
    }), 'utf8')

    const seedStore = openBusinessMatterEventStore({
      sagePaths: paths,
      maxStreamEvents: 32,
      maxPayloadBytes: 64 * 1024,
      busyTimeoutMs: 75,
      clock: () => '2026-10-10T15:00:00.000Z',
    })
    cleanups.push(() => seedStore.close())
    const created = createBusinessMatter({
      matterId: MATTER_ID,
      eventId: `${MATTER_ID}:created`,
      occurredAt: '2026-10-10T10:00:00Z',
      goal: 'Answer the first admitted approval.',
      responsibleParty: { kind: 'human', roleRef: 'role:owner' },
    })
    const withRevision = enterEvidence(created, {
      eventId: `${MATTER_ID}:revision-1`,
      occurredAt: '2026-10-10T10:01:00Z',
      revisionId: REVISION_ID,
      changeReason: 'Declare the bounded session-control scopes.',
      scope: 'One approval answer under the admitted chain.',
      permissionBoundary: 'No external mutation beyond the approval answer.',
      dataDestination: 'Sage approval store.',
      evidence: [{
        evidenceId: 'evidence:approval-1',
        source: 'fixture:dispatch',
        observedAt: '2026-10-10T10:00:30Z',
        status: 'supported',
      }],
      unknowns: [],
      options: [],
      dependencies: [],
      experienceRefs: [],
      actionPolicies: [
        { actionScope: 'session.prompt', effectClass: 'external-write', requiresDecision: false },
        // The revision declares the scope EXECUTABLE: the domain's requiresDecision (a recorded
        // matter decision before an attempt) must not gate an answer that IS the live decision —
        // the decision-capability requirement lives in the identity grant below, not here.
        { actionScope: 'session.approval', effectClass: 'external-write', requiresDecision: false },
      ],
    })
    const seedEvents = encodeBusinessMatterEvents(withRevision).map((event) => ({
      matterId: event.matterId,
      eventId: event.eventId,
      eventType: event.eventType,
      eventSchemaVersion: event.eventSchemaVersion,
      occurredAt: event.occurredAt,
      payloadBytes: event.payloadBytes.slice(),
    }))
    expect(seedStore.append({
      matterId: MATTER_ID,
      expectedVersion: { kind: 'not-exists' },
      appendId: 'seed:approval-1',
      events: seedEvents,
    }).kind).toBe('appended')

    const attempts = createSessionPromptAttemptStore({ sagePaths: paths })
    cleanups.push(() => attempts.close())
    const receipt = {
      requestId: 'approval:1',
      state: 'accepted' as const,
      outcome: 'allowed-once' as const,
      submittedAt: '2026-10-12T00:00:00.000Z',
      code: null,
      verifyOnly: false,
    }
    const sessionApprovalAnswer = vi.fn(async () => ({ state: 'recorded' as const, receipt }))

    const activeMatterContext = createActiveMatterContext()
    expect(activeMatterContext.activate({
      expectedContextGeneration: 0,
      next: {
        actorScopeRef: 'actor:local',
        matterId: MATTER_ID,
        revisionId: REVISION_ID,
        workspaceRef: 'workspace:active',
        trustedWorkspaceRoot: '/trusted/workspace',
        sessionRef: 'session:active',
        frameGeneration: 7,
      },
    }).ok).toBe(true)

    const providers = createSageAppServiceProviders({
      viewState: null,
      vault: {
        status: () => 'signed-out' as const,
        snapshot: () => ({ status: 'signed-out' as const, displayName: null }),
        signOut: () => undefined,
        identitySession: () => ({
          sessionRef: 'session:active',
          identityHandle: 'actor:local',
          issuer: 'https://issuer.invalid',
          authenticatedAt: '2026-10-01T00:00:00.000Z',
          expiresAt: '2027-01-01T00:00:00.000Z',
        }),
      } as never,
      adapter: { startLogin: async () => ({ ok: false as const, code: 'probe' }) } as never,
      callerBinding,
      activeMatterContext,
      framePolicySnapshot: () => ({ generation: 7, ready: true, contaminated: false, contaminationReasons: [] }),
      matterRehydrate: (() => ({ matter: {} as never, current: true })) as never,
      matterLinks: () => ({
        state: 'read',
        links: [{
          matterRef: MATTER_ID,
          workspaceRef: 'workspace:active',
          workspacePath: '/trusted/workspace',
          linkedAt: '2026-10-01T00:00:00.000Z',
          isDefault: true,
        }],
        trail: [],
      }),
      workspaceList: async () => ({
        source: 'workspace-follow', state: 'read', reason: null,
        entries: [{
          workspaceId: 'workspace:active',
          path: '/trusted/workspace',
          title: 'Workspace', sessionCount: 0,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        }],
        order: ['workspace:active'], archivedSessions: 0, frames: 1, unapplied: 0,
      }),
      // The dispatch wiring requires the send port; this chain never reaches it.
      sessionSend: vi.fn(),
      sessionApprovalAnswer,
      authority: {
        policyPath: paths.organizationPolicyFile,
        readFileBytes: (path: string) => readFileSync(path),
        now: () => '2026-10-12T00:00:00.000Z',
      },
      requirementBundle: loadSessionPromptRequirementBundle(),
      compatibilityPublication: testPublication(),
      runtimeInventoryObservation: () => observation,
      capabilityRegistry: createBundledCapabilityRegistryProvider((() => {
        const registryLoad = JSON.parse(readFileSync(join(APP_ROOT, 'publications', 'session-prompt.capability-registry.json'), 'utf8')) as { snapshotId: string } & Record<string, unknown>
        const { snapshotId: _ignored, ...body } = registryLoad
        void _ignored
        return body
      })() as never),
      runtimeEffective: () => OBSERVED,
      sessionPromptAttempts: attempts,
      readObservedTurnEndEdge: async () => null,
      revisionDigest: (matterId: string, revisionId: string) => attempts.revisionDigest(matterId, revisionId),
    })

    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/session/approval-answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matterRef: MATTER_ID, requestId: 'approval:1', outcome: 'allowed-once' }),
    }), { callerBinding, providers })

    expect(await response.json()).toEqual({ state: 'recorded', receipt })
    expect(sessionApprovalAnswer).toHaveBeenCalledTimes(1)
    expect(sessionApprovalAnswer).toHaveBeenCalledWith({ matterRef: MATTER_ID, requestId: 'approval:1', outcome: 'allowed-once' })

    // Stage 4: the answer closed its attempt synchronously — no turn ever runs for a control op,
    // so without the closure the open attempt would lock the matter for every later attempt.
    const read = attempts.readMatter(MATTER_ID)
    if (read === undefined || 'denied' in read) throw new Error('matter must read')
    expect(read.matter.events.some((event) => event.type === 'attempt-succeeded')).toBe(true)

    const second = await handleSageServiceRequest(new Request('dsh-app://app/.sage/session/approval-answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matterRef: MATTER_ID, requestId: 'approval:1', outcome: 'allowed-once' }),
    }), { callerBinding, providers })
    expect(await second.json()).toEqual({ state: 'recorded', receipt })
    expect(sessionApprovalAnswer).toHaveBeenCalledTimes(2)
  })
})
