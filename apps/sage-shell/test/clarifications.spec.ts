import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createClarifications } from '../src/main/clarifications.js'

/**
 * Ticket 034 (US-177~182) at the module and route seams.
 *
 * The acceptance lines: the pending list is the live relay registry (cards bind to their run);
 * one answer rides one named write and its receipt never claims "answered" before the durable
 * result shows it; a repeat click or refresh dispatches nothing; stop mid-wait turns the card
 * into 待继续 without auto-continuing; and every answer path touches nothing but the answer.
 */

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

const event = (seq: number, type: string, data?: unknown) => ({ type: 'event', event: { seq, type, ...(data === undefined ? {} : { data }) } })

const question = (overrides: Record<string, unknown> = {}) => ({
  id: 'q1',
  question: '先收口哪部分？',
  header: '确认范围',
  options: [{ label: '保持当前范围', description: '最小变更' }, { label: '先处理可恢复错误' }],
  ...overrides,
})

async function harness(options: { readonly session?: boolean, readonly paused?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sage-clarify-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const bindingsFile = join(dir, 'sessions', 'bindings.json')
  if (options.session !== false) {
    await writeFile(bindingsFile, JSON.stringify({ 'matter:1': 'session-1', 'matter:2': 'session-2' }), { mode: 0o600 }).catch(async () => {
      const { mkdir } = await import('node:fs/promises')
      await mkdir(join(dir, 'sessions'), { recursive: true })
      await writeFile(bindingsFile, JSON.stringify({ 'matter:1': 'session-1', 'matter:2': 'session-2' }), { mode: 0o600 })
    })
  }
  const calls: Array<{ endpoint: string, payload: unknown }> = []
  const questionsResponses: unknown[] = []
  const pageResponses: unknown[] = []
  const answerResponses: unknown[] = []
  const paused = { value: options.paused === true }
  const store = createClarifications({
    callBridge: async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      if (endpoint === 'session/questions') return questionsResponses.shift() ?? { ok: true, result: { pending: [] } }
      if (endpoint === 'session/page') return pageResponses.shift() ?? { ok: true, result: { records: [], hasMore: false } }
      if (endpoint === 'session/answer') return answerResponses.shift() ?? { ok: true, result: { accepted: true } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    },
    bindingsFile,
    now: () => '2026-10-03T12:00:00.000Z',
    pending: { isPaused: () => paused.value },
  })
  return { store, calls, questionsResponses, pageResponses, answerResponses, paused }
}

const pendingAnswer = (requestId: string, questions: readonly unknown[]) => ({ ok: true, result: { pending: [{ requestId, sessionId: 'session-1', raisedAt: '2026-10-03T11:59:00.000Z', questions }] } })

describe('the clarifications store (ticket 034)', () => {
  it('reads the live pending cards with their run binding — questions plus one bounded page, nothing else', async () => {
    const h = await harness()
    h.questionsResponses.push(pendingAnswer('req-1', [question(), question({ id: 'q2', question: '多选？', multiSelect: true })]))
    h.pageResponses.push({ ok: true, result: { records: [event(10, 'turn/start', { turn: 2 }), event(11, 'request/header', { header: { config: { provider: 'deepseek', model: 'deepseek-chat' } } })], hasMore: false } })
    const outcome = await h.store.read({ matterRef: 'matter:1' })
    expect(outcome.state).toBe('read')
    expect(outcome.pending).toHaveLength(1)
    expect(outcome.pending[0]).toMatchObject({
      requestId: 'req-1',
      run: { runSeq: 10, turn: 2 },
      questions: [
        { questionId: 'q1', question: '先收口哪部分？', header: '确认范围', multiSelect: false, approveLabel: null, options: [{ label: '保持当前范围' }, { label: '先处理可恢复错误' }] },
        { questionId: 'q2', question: '多选？', multiSelect: true },
      ],
    })
    expect(h.calls.map((call) => call.endpoint)).toEqual(['session/questions', 'session/page'])
    expect(h.calls[0]?.payload).toEqual([{ sessionId: 'session-1' }])
    expect(h.calls[1]?.payload).toEqual([{ sessionId: 'session-1', throughSeq: -1, maxMessages: 200 }])
    // US-179: the card carries no options → the selection surface stays empty, never invented.
    expect(outcome.deferred).toEqual([])
    expect(outcome.receipts).toEqual([])
  })

  it('no session means no-session with zero bridge calls; failures stay named, never empty', async () => {
    const bare = await harness({ session: false })
    expect(await bare.store.read({ matterRef: 'matter:1' })).toMatchObject({ state: 'no-session', pending: [], code: null })
    expect(bare.calls).toEqual([])

    const failing = await harness()
    failing.questionsResponses.push({ ok: false, code: 'question-relay-unavailable' })
    expect(await failing.store.read({ matterRef: 'matter:1' })).toMatchObject({ state: 'unavailable', code: 'question-relay-unavailable' })

    const broken = await harness()
    broken.questionsResponses.push({ ok: true, result: { nope: true } })
    expect(await broken.store.read({ matterRef: 'matter:1' })).toMatchObject({ state: 'unavailable', code: 'clarification-answer-unrecognised' })
  })

  it('answers with one named write and freezes the receipt: a repeat click or a refresh dispatches nothing', async () => {
    const h = await harness()
    h.questionsResponses.push(pendingAnswer('req-1', [question()]))
    h.pageResponses.push({ ok: true, result: { records: [], hasMore: false } })
    await h.store.read({ matterRef: 'matter:1' })

    const first = await h.store.answer({ matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['保持当前范围'] }] })
    expect(first).toMatchObject({ state: 'recorded', receipt: { requestId: 'req-1', state: 'accepted', verifyOnly: false, code: null } })
    const answerCalls = h.calls.filter((call) => call.endpoint === 'session/answer')
    expect(answerCalls).toHaveLength(1)
    expect(answerCalls[0]?.payload).toEqual([{ requestId: 'req-1', answers: [{ id: 'q1', selected: ['保持当前范围'] }] }])

    // US-178: the same submission again (or after a refresh) returns the receipt, not a second write.
    const again = await h.store.answer({ matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['保持当前范围'] }] })
    expect(again).toEqual(first)
    expect(h.calls.filter((call) => call.endpoint === 'session/answer')).toHaveLength(1)

    h.questionsResponses.push(pendingAnswer('req-1', [question()]))
    h.pageResponses.push({ ok: true, result: { records: [], hasMore: false } })
    const afterRefresh = await h.store.read({ matterRef: 'matter:1' })
    // The card no longer renders live (the receipt owns it) and no write was dispatched by the read.
    expect(afterRefresh.pending).toEqual([])
    expect(afterRefresh.receipts).toMatchObject([{ requestId: 'req-1', state: 'accepted' }])
    expect(h.calls.filter((call) => call.endpoint === 'session/answer')).toHaveLength(1)
  })

  it('settles accepted → effective only on the durable tool result, and accepted → aborted on stop', async () => {
    const h = await harness()
    h.questionsResponses.push(pendingAnswer('req-1', [question()]))
    h.pageResponses.push({ ok: true, result: { records: [], hasMore: false } })
    await h.store.read({ matterRef: 'matter:1' })
    await h.store.answer({ matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['保持当前范围'] }] })

    // Still pending at the relay: the receipt stays accepted (never a guessed "answered").
    h.questionsResponses.push(pendingAnswer('req-1', [question()]))
    h.pageResponses.push({ ok: true, result: { records: [event(10, 'turn/start', { turn: 2 }), event(12, 'tool/call', { turn: 2, step: 1, callId: 'call-9', name: 'ask_user_question', arguments: { questions: [question()] } })], hasMore: false } })
    const waiting = await h.store.read({ matterRef: 'matter:1' })
    expect(waiting.receipts).toMatchObject([{ requestId: 'req-1', state: 'accepted' }])

    // The question is gone and the tool result is in the durable log: effective.
    h.questionsResponses.push({ ok: true, result: { pending: [] } })
    h.pageResponses.push({ ok: true, result: { records: [event(10, 'turn/start', { turn: 2 }), event(12, 'tool/call', { turn: 2, step: 1, callId: 'call-9', name: 'ask_user_question', arguments: { questions: [question()] } }), event(13, 'tool/result', { turn: 2, step: 1, message: { callId: 'call-9', content: [{ type: 'text', text: '{"answers":[]}' }], isError: false } })], hasMore: false } })
    const settled = await h.store.read({ matterRef: 'matter:1' })
    expect(settled.receipts).toMatchObject([{ requestId: 'req-1', state: 'effective', verifyOnly: false }])
    expect(settled.deferred).toEqual([])

    // A second matter answers, then stops: gone + paused with no result → aborted (not failed, not retried).
    h.questionsResponses.push(pendingAnswer('req-2', [question()]))
    h.pageResponses.push({ ok: true, result: { records: [], hasMore: false } })
    await h.store.read({ matterRef: 'matter:2' })
    await h.store.answer({ matterRef: 'matter:2', requestId: 'req-2', answers: [{ questionId: 'q1', selected: [], custom: '都不是' }] })
    h.paused.value = true
    h.questionsResponses.push({ ok: true, result: { pending: [] } })
    h.pageResponses.push({ ok: true, result: { records: [], hasMore: false } })
    const aborted = await h.store.read({ matterRef: 'matter:2' })
    expect(aborted.receipts).toMatchObject([{ requestId: 'req-2', state: 'aborted', verifyOnly: true }])
  })

  it('keeps accepted until the durable result actually appears: an ask without a result never flips to effective', async () => {
    const h = await harness()
    h.questionsResponses.push(pendingAnswer('req-1', [question()]))
    h.pageResponses.push({ ok: true, result: { records: [], hasMore: false } })
    await h.store.read({ matterRef: 'matter:1' })
    await h.store.answer({ matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['保持当前范围'] }] })

    // The question left the wait, the log shows the ask, but no tool/result yet: the receipt
    // must stay accepted — a call alone is not proof the run took the answer (US-178).
    h.questionsResponses.push({ ok: true, result: { pending: [] } })
    h.pageResponses.push({ ok: true, result: { records: [event(10, 'turn/start', { turn: 2 }), event(12, 'tool/call', { turn: 2, step: 1, callId: 'call-9', name: 'ask_user_question', arguments: { questions: [question()] } })], hasMore: false } })
    const waiting = await h.store.read({ matterRef: 'matter:1' })
    expect(waiting.receipts).toMatchObject([{ requestId: 'req-1', state: 'accepted', verifyOnly: false }])
    expect(waiting.deferred).toEqual([])
  })

  it('keeps a failed submission as an unknown receipt: verify-only, and the repeat click never replays it', async () => {
    const h = await harness()
    h.questionsResponses.push(pendingAnswer('req-1', [question()]))
    h.pageResponses.push({ ok: true, result: { records: [], hasMore: false } })
    await h.store.read({ matterRef: 'matter:1' })
    h.answerResponses.push({ ok: false, code: 'bridge-host-not-ready' })
    const outcome = await h.store.answer({ matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['保持当前范围'] }] })
    expect(outcome).toMatchObject({ state: 'recorded', receipt: { state: 'unknown', code: 'bridge-host-not-ready', verifyOnly: true } })
    const repeat = await h.store.answer({ matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['保持当前范围'] }] })
    expect(repeat).toEqual(outcome)
    expect(h.calls.filter((call) => call.endpoint === 'session/answer')).toHaveLength(1)

    // The relay refusing `question-not-found` is the honest "no longer waiting" — aborted, no retry.
    const h2 = await harness()
    h2.questionsResponses.push(pendingAnswer('req-1', [question()]))
    h2.pageResponses.push({ ok: true, result: { records: [], hasMore: false } })
    await h2.store.read({ matterRef: 'matter:1' })
    h2.answerResponses.push({ ok: false, code: 'question-not-found' })
    expect(await h2.store.answer({ matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['保持当前范围'] }] }))
      .toMatchObject({ state: 'recorded', receipt: { state: 'aborted', code: 'question-not-found', verifyOnly: true } })
  })

  it('stop mid-wait turns the card into 待继续 and never auto-continues; an answer while paused dispatches nothing', async () => {
    const h = await harness()
    h.questionsResponses.push(pendingAnswer('req-1', [question()]))
    h.pageResponses.push({ ok: true, result: { records: [event(10, 'turn/start', { turn: 2 })], hasMore: false } })
    const live = await h.store.read({ matterRef: 'matter:1' })
    expect(live.pending).toHaveLength(1)

    // The stop ran: cancel aborted the wait at the runtime, the relay has nothing pending, pause holds.
    h.paused.value = true
    h.questionsResponses.push({ ok: true, result: { pending: [] } })
    h.pageResponses.push({ ok: true, result: { records: [event(10, 'turn/start', { turn: 2 }), event(14, 'turn/end', { reason: 'cancelled' })], hasMore: false } })
    const stopped = await h.store.read({ matterRef: 'matter:1' })
    expect(stopped.pending).toEqual([])
    expect(stopped.deferred).toMatchObject([{ requestId: 'req-1', reason: 'stopped', questions: [{ questionId: 'q1' }] }])
    // US-182: nothing auto-continued — no prompt, no answer, no resume rode along.
    expect(h.calls.map((call) => call.endpoint)).toEqual(['session/questions', 'session/page', 'session/questions'])

    const refused = await h.store.answer({ matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['保持当前范围'] }] })
    expect(refused).toEqual({ state: 'refused', code: 'clarification-paused' })
    expect(h.calls.filter((call) => call.endpoint === 'session/answer')).toEqual([])
    expect(h.calls.filter((call) => call.endpoint !== 'session/questions' && call.endpoint !== 'session/page')).toEqual([])
  })

  it('a question that vanishes without a pause is deferred as gone, not dropped', async () => {
    const h = await harness()
    h.questionsResponses.push(pendingAnswer('req-1', [question()]))
    h.pageResponses.push({ ok: true, result: { records: [], hasMore: false } })
    await h.store.read({ matterRef: 'matter:1' })
    h.questionsResponses.push({ ok: true, result: { pending: [] } })
    const outcome = await h.store.read({ matterRef: 'matter:1' })
    expect(outcome.deferred).toMatchObject([{ requestId: 'req-1', reason: 'gone' }])
  })

  it('refuses bad answers before any bridge call: unknown request, drifted coverage, undeclared labels, empty signals', async () => {
    const h = await harness()
    h.questionsResponses.push(pendingAnswer('req-1', [question()]))
    h.pageResponses.push({ ok: true, result: { records: [], hasMore: false } })
    await h.store.read({ matterRef: 'matter:1' })

    const bad = [
      ['unknown request', { requestId: 'req-9', answers: [{ questionId: 'q1', selected: ['保持当前范围'] }] }],
      ['coverage drift', { requestId: 'req-1', answers: [] }],
      ['undeclared label', { requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['没有这个选项'] }] }],
      ['empty signal', { requestId: 'req-1', answers: [{ questionId: 'q1', selected: [] }] }],
      ['blank custom', { requestId: 'req-1', answers: [{ questionId: 'q1', selected: [], custom: '   ' }] }],
    ] as const
    for (const [label, payload] of bad) {
      const outcome = await h.store.answer({ matterRef: 'matter:1', requestId: payload.requestId, answers: payload.answers })
      expect(outcome.state, label).toBe('refused')
      expect((outcome as { code: string }).code).toMatch(/^clarification-/)
    }
    expect(h.calls.filter((call) => call.endpoint === 'session/answer')).toEqual([])
  })

  it('US-179: the answer write is the only call — custom text rides with the same authority and no matter field is touched', async () => {
    const h = await harness()
    h.questionsResponses.push(pendingAnswer('req-1', [question()]))
    h.pageResponses.push({ ok: true, result: { records: [], hasMore: false } })
    await h.store.read({ matterRef: 'matter:1' })
    const outcome = await h.store.answer({ matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: [], custom: '都不是，按第三种理解' }] })
    expect(outcome).toMatchObject({ state: 'recorded', receipt: { state: 'accepted' } })
    const answerCall = h.calls.find((call) => call.endpoint === 'session/answer')
    expect(answerCall?.payload).toEqual([{ requestId: 'req-1', answers: [{ id: 'q1', selected: [], custom: '都不是，按第三种理解' }] }])
    expect(h.calls.every((call) => ['session/questions', 'session/page', 'session/answer'].includes(call.endpoint))).toBe(true)
  })
})

describe('the clarification answer route (ticket 034)', () => {
  it('parses exactly and enters admission without calling the raw port; exact bodies and caps are 400s', async () => {
    const seen: unknown[] = []
    const providers = createUnavailableFirstService(null, {
      sessionClarificationAnswer: async (request) => { seen.push({ answer: request }); return { state: 'refused', code: 'marker' } },
    })
    const post = (body: unknown) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/clarification-answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-034' }, providers } as never,
    )
    expect(await (await post({ matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['A'], custom: '补充' }] })).json())
      .toMatchObject({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(seen).toEqual([])

    const answerBad = [
      { matterRef: 'matter:1', requestId: 'req-1' },
      { matterRef: 'matter:1', requestId: 'req-1', answers: [], extra: 1 },
      { matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['A'] }], extra: 1 },
      { matterRef: 'matter:1', requestId: 'req-1', answers: [] },
      { matterRef: 'matter:1', requestId: 'req-1', answers: 'yes' },
      { matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1' }] },
      { matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: 'A' }] },
      { matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['A'], custom: 'x', extra: 1 }] },
      { matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: Array.from({ length: 17 }, () => 'A') }] },
      { matterRef: 'matter:1', requestId: '', answers: [{ questionId: 'q1', selected: [] }] },
    ]
    for (const body of answerBad) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400)
    }

    const unwired = createUnavailableFirstService(null, {})
    const postUnwired = (body: unknown) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/clarification-answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-034' }, providers: unwired } as never,
    )
    expect(await (await postUnwired({ matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['A'] }] })).json())
      .toMatchObject({ state: 'refused', code: 'protected-effect-unavailable' })
  })
})
