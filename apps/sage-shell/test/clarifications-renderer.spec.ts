import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 034 on the shipped page (US-177~182): the live clarification card renders the question
 * with its options, custom input (same authority) and its run; one click sends exactly one named
 * write; receipts are three-plus-one states with verification (never retry); a stopped wait shows
 * up as 待继续; nothing about the answer is drawn from anything but the projection.
 */

const option = (label: string, description: string | null = null) => ({ label, description })

const question = (overrides: Record<string, unknown> = {}) => ({
  questionId: 'q1',
  question: '先收口哪部分？',
  header: '确认范围',
  detail: null,
  options: [option('保持当前范围', '最小变更'), option('先处理可恢复错误')],
  multiSelect: false,
  intentKind: null,
  approveLabel: null,
  ...overrides,
})

const card = (overrides: Record<string, unknown> = {}) => ({
  requestId: 'req-1',
  questions: [question()],
  run: { runSeq: 10, turn: 2 },
  raisedAt: 't',
  ...overrides,
})

const clarifications = (overrides: Record<string, unknown> = {}) => ({
  state: 'read', pending: [card()], deferred: [], receipts: [], code: null, at: 't',
  ...overrides,
})

const payload = (extra: Record<string, unknown> = {}) => statePayload({
  workspaces: {
    source: 'workspace-follow', state: 'read', reason: null,
    entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
    order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
  },
  matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
  draft: { state: 'unlocked', drafts: [] },
  sessionChannel: {
    state: 'read', sessionId: 'sess-1', execution: 'idle', lastTurnEnd: null, transcript: [], reconciled: false,
    streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [],
    queue: { state: 'read', occurrences: [] },
  },
  sessionHistory: { state: 'read', runs: [], hasMore: false, nextBeforeSeq: null, detail: null, at: null },
  sessionClarifications: clarifications(),
  ...extra,
})

const setContext = (harness: Awaited<ReturnType<typeof bootSagePage>>) => {
  harness.node('link-matter').value = 'matter:1'
  harness.node('link-workspace').value = 'ws-1'
}

describe('the clarification card (ticket 034)', () => {
  it('renders the question, its options, the custom input and its run; one click sends exactly one named write', async () => {
    const harness = await bootSagePage(payload(), {
      '/.sage/session/clarification-answer': { state: 'recorded', receipt: { requestId: 'req-1', state: 'accepted', submittedAt: 't', code: null, verifyOnly: false } },
    })
    setContext(harness)
    await harness.refresh()

    const row = harness.node('clarification-cards').children[0]
    expect(row?.textContent).toContain('问：先收口哪部分？')
    expect(row?.textContent).toContain('确认范围')
    expect(row?.textContent).toContain('所属运行 @10')
    const radios = row?.querySelectorAll('[data-clarification-option="q1"]') ?? []
    expect(radios).toHaveLength(2)
    expect(row?.querySelector('[data-clarification-custom="q1"]')).not.toBeNull()
    expect(harness.node('clarification-note').textContent).toContain('共 1 个待回答的澄清提问')

    // Nothing leaves before the explicit submit.
    expect(harness.requests).toEqual([])
    radios[0]!.checked = true
    const submit = row?.querySelector('[data-clarification-submit="req-1"]')
    expect(submit).not.toBeNull()
    setContext(harness)
    harness.node('clarification-cards').dispatch('click', { target: submit })
    await harness.settle()
    expect(harness.requests).toEqual([
      {
        path: '/.sage/session/clarification-answer',
        body: { matterRef: 'matter:1', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['保持当前范围'] }] },
      },
    ])
  })

  it('carries a custom answer with the same weight and honours multi-select', async () => {
    const harness = await bootSagePage(payload({
      sessionClarifications: clarifications({
        pending: [card({
          questions: [
            question({ questionId: 'q1', question: '单选？' }),
            question({ questionId: 'q2', question: '多选？', options: [option('甲'), option('乙')], multiSelect: true }),
          ],
        })],
        receipts: [{ requestId: 'req-old', state: 'unknown', submittedAt: 't', code: 'bridge-host-not-ready', verifyOnly: true }],
      }),
    }), {
      '/.sage/session/clarification-answer': { state: 'recorded', receipt: { requestId: 'req-1', state: 'accepted', submittedAt: 't', code: null, verifyOnly: false } },
    })
    setContext(harness)
    await harness.refresh()

    const row = harness.node('clarification-cards').children[0]!
    const checks = row.querySelectorAll('[data-clarification-option="q2"]')
    expect(checks).toHaveLength(2)
    checks[0]!.checked = true
    checks[1]!.checked = true
    const custom = row.querySelector('[data-clarification-custom="q1"]')!
    custom.value = '都不是，按第三种理解'
    const submit = row.querySelector('[data-clarification-submit="req-1"]')!
    setContext(harness)
    harness.node('clarification-cards').dispatch('click', { target: submit })
    await harness.settle()
    expect(harness.requests).toEqual([
      {
        path: '/.sage/session/clarification-answer',
        body: {
          matterRef: 'matter:1',
          requestId: 'req-1',
          answers: [
            { questionId: 'q1', selected: [], custom: '都不是，按第三种理解' },
            { questionId: 'q2', selected: ['甲', '乙'] },
          ],
        },
      },
    ])

    // The unknown receipt is visible, distinguishable and offers verification only — no retry.
    const receipts = harness.node('clarification-receipts').children
    expect(receipts[0]?.textContent).toContain('结果未知：请核对同一操作（不给重试）')
    expect(receipts[0]?.querySelector('[data-clarification-verify="req-old"]')).not.toBeNull()
    expect(receipts[0]?.textContent).not.toContain('重试[')
    const before = harness.requests.length
    harness.node('clarification-receipts').dispatch('click', { target: receipts[0]?.querySelector('[data-clarification-verify="req-old"]') })
    await harness.settle()
    // Verification re-reads the projection; it never dispatches an answer.
    expect(harness.requests.length).toBe(before)
  })

  it('keeps a refused submission honest on the note and sends nothing else', async () => {
    const harness = await bootSagePage(payload(), {
      '/.sage/session/clarification-answer': { state: 'refused', code: 'clarification-paused' },
    })
    setContext(harness)
    await harness.refresh()
    const row = harness.node('clarification-cards').children[0]!
    const submit = row.querySelector('[data-clarification-submit="req-1"]')!
    setContext(harness)
    harness.node('clarification-cards').dispatch('click', { target: submit })
    await harness.settle()
    expect(harness.requests.map((request) => request.path)).toEqual(['/.sage/session/clarification-answer'])
    expect(harness.node('clarification-note').textContent).toContain('会话已暂停：停止可能已中止该提问——回答不会送达')
  })

  it('shows a stopped wait as 待继续 without any submit control', async () => {
    const harness = await bootSagePage(payload({
      sessionClarifications: clarifications({
        pending: [],
        deferred: [{ ...card(), reason: 'stopped' }],
      }),
    }))
    setContext(harness)
    await harness.refresh()
    const row = harness.node('clarification-deferred').children[0]
    expect(row?.textContent).toContain('待继续：先收口哪部分？')
    expect(row?.textContent).toContain('停止已中止该提问（未回答）')
    expect(row?.querySelector('[data-clarification-submit]')).toBeNull()
    expect(harness.node('clarification-note').textContent).toContain('当前没有待回答的澄清提问')
  })

  it('keeps the unreadable projection honest instead of pretending an empty list', async () => {
    const harness = await bootSagePage(payload({
      sessionClarifications: clarifications({ state: 'unavailable', pending: [], code: 'question-relay-unavailable' }),
    }))
    setContext(harness)
    await harness.refresh()
    expect(harness.node('clarification-cards').children).toHaveLength(0)
    expect(harness.node('clarification-note').textContent).toContain('未核验：澄清读取端口未接线（不以空列表冒充能力）。')
  })
})
