import { describe, expect, it, vi } from 'vitest'

import {
  USER_QUESTIONS_RELAY_SERVICE,
  createUserQuestionsRelay,
  installUserQuestionsRelay,
  type RelayQuestionRequest,
} from '../src/host/user-questions-relay.js'

/**
 * Ticket 034 at the relay core: the shell's answerer for `user-questions/request`.
 *
 * The acceptance lines: a question exists exactly while its waterfall is blocked on the relay
 * (the pending list is that truth, not a copy); answers validate against the asker's own
 * declaration before resolving; abort and teardown reject instead of leaving a tool blocked
 * forever; and only agent-bonded requests are claimed (agent id IS the session id).
 */

const request = (overrides: Partial<RelayQuestionRequest> = {}): RelayQuestionRequest => ({
  questions: [{ id: 'q1', question: '先收口哪部分？', options: [{ label: 'A' }, { label: 'B' }] }],
  agent: { id: 'session-1' },
  ...overrides,
})

function makeRelay() {
  let counter = 0
  return createUserQuestionsRelay({ now: () => '2026-10-03T12:00:00.000Z', mintId: () => `req-${String(++counter)}` })
}

describe('the user-questions relay (ticket 034)', () => {
  it('claims an agent-bonded request, lists it as pending, and resolves it with the validated answers', async () => {
    const relay = makeRelay()
    const claimed = relay.claim(request())
    expect(claimed).toBeDefined()
    expect(relay.list('session-1').pending).toEqual([
      expect.objectContaining({ requestId: 'req-1', sessionId: 'session-1', raisedAt: '2026-10-03T12:00:00.000Z' }),
    ])
    expect(relay.list('other-session').pending).toEqual([])

    expect(relay.answer('req-1', [{ id: 'q1', selected: ['B'], custom: '补充说明' }])).toEqual({ ok: true })
    await expect(claimed).resolves.toEqual({ answers: [{ id: 'q1', selected: ['B'], custom: '补充说明' }] })
    // A resolved question is no longer pending, and answering again is not-found — never a replay.
    expect(relay.list('session-1').pending).toEqual([])
    expect(relay.answer('req-1', [{ id: 'q1', selected: ['B'] }])).toEqual({ ok: false, code: 'question-not-found' })
  })

  it('delegates requests it cannot own: no agent id, or no usable question', () => {
    const relay = makeRelay()
    expect(relay.claim(request({ agent: undefined }))).toBeUndefined()
    expect(relay.claim(request({ agent: { id: undefined } }))).toBeUndefined()
    expect(relay.claim(request({ questions: [] }))).toBeUndefined()
    expect(relay.claim(request({ questions: [{ id: '', question: 'x' }] }))).toBeUndefined()
    expect(relay.claim(request({ questions: [{ id: 'q1', question: '' }] }))).toBeUndefined()
  })

  it('rejects on abort (before or during the wait) and drops the entry instead of leaving a tool blocked', async () => {
    const relay = makeRelay()
    const preAborted = new AbortController()
    preAborted.abort()
    await expect(relay.claim(request({ signal: preAborted.signal }))).rejects.toMatchObject({ code: 'ASK_ABORTED' })

    const controller = new AbortController()
    const claimed = relay.claim(request({ signal: controller.signal }))
    expect(relay.list('session-1').pending).toHaveLength(1)
    controller.abort()
    await expect(claimed).rejects.toMatchObject({ code: 'ASK_ABORTED' })
    expect(relay.list('session-1').pending).toEqual([])
    expect(relay.answer('req-1', [{ id: 'q1', selected: ['A'] }])).toEqual({ ok: false, code: 'question-not-found' })
  })

  it('refuses answers the asker never offered: unknown ids, undeclared labels, empty selections, drifting coverage', async () => {
    const relay = makeRelay()
    const claimed = relay.claim(request({
      questions: [
        { id: 'q1', question: '单选？', options: [{ label: 'A' }, { label: 'B' }] },
        { id: 'q2', question: '多选？', options: [{ label: 'C' }, { label: 'D' }], multiSelect: true },
      ],
    }))
    const bad: Array<[string, unknown]> = [
      ['unknown id', [{ id: 'q9', selected: ['A'] }, { id: 'q2', selected: ['C'] }]],
      ['undeclared label', [{ id: 'q1', selected: ['Z'] }, { id: 'q2', selected: ['C'] }]],
      ['empty selection without custom', [{ id: 'q1', selected: [] }, { id: 'q2', selected: ['C'] }]],
      ['blank custom', [{ id: 'q1', selected: [], custom: '   ' }, { id: 'q2', selected: ['C'] }]],
      ['drifted coverage', [{ id: 'q1', selected: ['A'] }]],
      ['duplicate id', [{ id: 'q1', selected: ['A'] }, { id: 'q1', selected: ['B'] }]],
    ]
    for (const [label, answers] of bad) {
      expect(relay.answer('req-1', answers), label).toEqual({ ok: false, code: 'question-answers-invalid' })
    }
    // The bad answers never settled anything: the original waterfall is still pending and answerable.
    expect(relay.list('session-1').pending).toHaveLength(1)
    expect(relay.answer('req-1', [{ id: 'q1', selected: ['A'], custom: '就这个' }, { id: 'q2', selected: ['C', 'D'] }])).toEqual({ ok: true })
    await expect(claimed).resolves.toEqual({
      answers: [
        { id: 'q1', selected: ['A'], custom: '就这个' },
        { id: 'q2', selected: ['C', 'D'] },
      ],
    })
  })

  it('keeps custom-only answers for option questions, and caps what a batch may carry', async () => {
    const relay = makeRelay()
    const claimed = relay.claim(request({ questions: [{ id: 'q1', question: '选一个？', options: [{ label: 'A' }] }] }))
    expect(relay.answer('req-1', [{ id: 'q1', selected: [], custom: '都不是，按第三种理解' }])).toEqual({ ok: true })
    await expect(claimed).resolves.toEqual({ answers: [{ id: 'q1', selected: [], custom: '都不是，按第三种理解' }] })

    const many = Array.from({ length: 12 }, (_, index) => ({ id: `q${String(index)}`, question: 'x' }))
    relay.claim(request({ questions: many }))
    // The sanitized record carries at most eight questions; answering the ninth is unknown, not accepted.
    expect(relay.list('session-1').pending[0]?.questions).toHaveLength(8)
    const nineAnswers = Array.from({ length: 9 }, (_, index) => ({ id: `q${String(index)}`, selected: ['x'] }))
    expect(relay.answer('req-2', nineAnswers)).toEqual({ ok: false, code: 'question-answers-invalid' })
  })

  it('rejects every pending waterfall on dispose', async () => {
    const relay = makeRelay()
    const first = relay.claim(request())
    const second = relay.claim(request({ agent: { id: 'session-2' } }))
    relay.dispose()
    await expect(first).rejects.toMatchObject({ code: 'ASK_ABORTED' })
    await expect(second).rejects.toMatchObject({ code: 'ASK_ABORTED' })
    expect(relay.list('session-1').pending).toEqual([])
    expect(relay.list('session-2').pending).toEqual([])
  })

  it('installs with prepend (a profile-composed remote listener must not swallow the question first) and delegates unclaimed requests', async () => {
    const listeners: Array<(request: RelayQuestionRequest, next: () => Promise<{ answers: never[] }>) => Promise<unknown>> = []
    const provide = vi.fn()
    const on = vi.fn((_name: string, listener: (typeof listeners)[number], options?: { prepend?: boolean }) => {
      expect(options).toEqual({ prepend: true })
      listeners.push(listener)
      return () => {}
    })
    const relay = makeRelay()
    installUserQuestionsRelay({ provide, on }, relay)
    expect(provide).toHaveBeenCalledWith(USER_QUESTIONS_RELAY_SERVICE, relay)
    expect(on).toHaveBeenCalledTimes(1)
    expect(on.mock.calls[0]?.[0]).toBe('user-questions/request')

    const listener = listeners[0]!
    const delegated = vi.fn(async () => ({ answers: [] as never[] }))
    await expect(listener(request({ agent: undefined }), delegated)).resolves.toEqual({ answers: [] })
    expect(delegated).toHaveBeenCalledTimes(1)

    const claimed = listener(request(), delegated)
    expect(relay.list('session-1').pending).toHaveLength(1)
    relay.answer(relay.list('session-1').pending[0]!.requestId, [{ id: 'q1', selected: ['A'] }])
    await expect(claimed).resolves.toEqual({ answers: [{ id: 'q1', selected: ['A'] }] })
    expect(delegated).toHaveBeenCalledTimes(1)
  })
})
