import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createApprovals } from '../src/main/approvals.js'

/**
 * Ticket 041 (US-197~199) at the module and route seams.
 *
 * The acceptance lines: the pending list is the live relay registry; the decision submitted is
 * exactly the two user words (the one-shot grant or rejection) and a failure never reads as
 * approved; the wait card shows scope + source and is withdrawn by one named request; an expired
 * or vanished wait is 失效 needing a fresh request — old waits never become execution conditions,
 * and nothing here ever converts a lapse into a grant.
 */

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function harness(options: { readonly sessions?: Record<string, string>, readonly paused?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sage-approvals-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const bindingsFile = join(dir, 'sessions', 'bindings.json')
  const sessions = options.sessions ?? { 'matter:1': 'session-1' }
  if (Object.keys(sessions).length > 0) {
    await mkdir(join(dir, 'sessions'), { recursive: true })
    await writeFile(bindingsFile, JSON.stringify(sessions), { mode: 0o600 })
  }
  const calls: Array<{ endpoint: string, payload: unknown }> = []
  const approvalsResponses: unknown[] = []
  const pageResponses: unknown[] = []
  const approveResponses: unknown[] = []
  const withdrawResponses: unknown[] = []
  const paused = { value: options.paused === true }
  const store = createApprovals({
    callBridge: async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      if (endpoint === 'session/approvals') return approvalsResponses.shift() ?? { ok: true, result: { pending: [] } }
      if (endpoint === 'session/page') return pageResponses.shift() ?? { ok: true, result: { records: [], hasMore: false } }
      if (endpoint === 'session/approve') return approveResponses.shift() ?? { ok: true, result: { accepted: true } }
      if (endpoint === 'session/approval-withdraw') return withdrawResponses.shift() ?? { ok: true, result: { withdrawn: true } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    },
    bindingsFile,
    now: () => '2026-10-03T12:00:00.000Z',
    pending: { isPaused: () => paused.value },
  })
  return { store, calls, approvalsResponses, pageResponses, approveResponses, withdrawResponses, paused }
}

const card = (overrides: Record<string, unknown> = {}) => ({
  requestId: 'appr-1',
  sessionId: 'session-1',
  toolName: 'mcp__shell__run',
  callId: 'call-1',
  reason: '该工具将执行受控命令',
  withdrawable: true,
  raisedAt: '2026-10-03T11:59:00.000Z',
  ...overrides,
})

const pending = (...cards: readonly Record<string, unknown>[]) => ({ ok: true, result: { pending: cards } })
const decided = (id: string, outcome: string) => ({ type: 'event', event: { seq: 9, type: 'approval/decided', data: { id, outcome } } })

describe('the approvals store (ticket 041)', () => {
  it('reads the live waits with scope and source; a matter with no session reads no-session', async () => {
    const h = await harness()
    const bare = await h.store.read({ matterRef: 'matter:never-sent' })
    expect(bare.state).toBe('no-session')
    expect(bare.pending).toEqual([])
    expect(h.calls).toEqual([])

    h.approvalsResponses.push(pending(card()))
    const read = await h.store.read({ matterRef: 'matter:1' })
    expect(read.state).toBe('read')
    expect(read.pending).toEqual([{
      requestId: 'appr-1', toolName: 'mcp__shell__run', callId: 'call-1',
      reason: '该工具将执行受控命令', withdrawable: true, raisedAt: '2026-10-03T11:59:00.000Z',
    }])
    expect(h.calls).toEqual([{ endpoint: 'session/approvals', payload: [{ sessionId: 'session-1' }] }])

    h.approvalsResponses.push({ ok: false, code: 'approval-relay-unavailable' })
    expect((await h.store.read({ matterRef: 'matter:1' })).state).toBe('unavailable')
  })

  it('answers one live wait with exactly the decision word; a repeat click dispatches nothing', async () => {
    const h = await harness()
    h.approvalsResponses.push(pending(card()))
    await h.store.read({ matterRef: 'matter:1' })

    const recorded = await h.store.answer({ matterRef: 'matter:1', requestId: 'appr-1', outcome: 'allowed-once' })
    expect(recorded).toMatchObject({ state: 'recorded', receipt: { requestId: 'appr-1', state: 'accepted', outcome: 'allowed-once', verifyOnly: true } })
    expect(h.calls.map((call) => call.endpoint)).toEqual(['session/approvals', 'session/approve'])
    expect(h.calls.at(-1)?.payload).toEqual([{ requestId: 'appr-1', outcome: 'allowed-once' }])

    // One submission per wait, ever — a repeat returns the same receipt and dispatches nothing.
    const again = await h.store.answer({ matterRef: 'matter:1', requestId: 'appr-1', outcome: 'rejected' })
    expect(again).toEqual(recorded)
    expect(h.calls).toHaveLength(2)

    // A wait that was never pending cannot be answered, and no session refuses by name.
    expect(await h.store.answer({ matterRef: 'matter:1', requestId: 'nope', outcome: 'rejected' })).toEqual({ state: 'refused', code: 'approval-not-pending' })
    expect(await h.store.answer({ matterRef: 'matter:never-sent', requestId: 'appr-1', outcome: 'rejected' })).toEqual({ state: 'refused', code: 'approval-no-session' })
  })

  it('an unconfirmed answer is unknown (verify only) — never a fabricated approval', async () => {
    const h = await harness()
    h.approvalsResponses.push(pending(card()))
    await h.store.read({ matterRef: 'matter:1' })
    h.approveResponses.push({ ok: false, code: 'bridge-host-not-ready' })
    const recorded = await h.store.answer({ matterRef: 'matter:1', requestId: 'appr-1', outcome: 'allowed-once' })
    expect(recorded).toMatchObject({ state: 'recorded', receipt: { state: 'unknown', outcome: null, verifyOnly: true, code: 'bridge-host-not-ready' } })
    // And the projection keeps reading it as unknown — there is no path from here to "approved".
    h.approvalsResponses.push(pending())
    const read = await h.store.read({ matterRef: 'matter:1' })
    expect(read.receipts[0]).toMatchObject({ state: 'unknown', outcome: null })
  })

  it('settles effective/lapsed only on durable evidence; a wait gone under the pause lapses without a grant', async () => {
    const h = await harness()
    h.approvalsResponses.push(pending(card()))
    await h.store.read({ matterRef: 'matter:1' })
    await h.store.answer({ matterRef: 'matter:1', requestId: 'appr-1', outcome: 'allowed-once' })

    // The wait left the list: one bounded page supplies the decision evidence.
    h.approvalsResponses.push(pending())
    h.pageResponses.push({ ok: true, result: { records: [decided('appr-1', 'allowed-once')], hasMore: false } })
    let read = await h.store.read({ matterRef: 'matter:1' })
    expect(read.receipts[0]).toMatchObject({ state: 'effective', outcome: 'allowed-once', verifyOnly: false })

    // A cancelled decision in the log is 失效 — need a fresh request; it is NOT an approval.
    const h2 = await harness()
    h2.approvalsResponses.push(pending(card()))
    await h2.store.read({ matterRef: 'matter:1' })
    await h2.store.answer({ matterRef: 'matter:1', requestId: 'appr-1', outcome: 'allowed-once' })
    h2.approvalsResponses.push(pending())
    h2.pageResponses.push({ ok: true, result: { records: [decided('appr-1', 'cancelled')], hasMore: false } })
    read = await h2.store.read({ matterRef: 'matter:1' })
    expect(read.receipts[0]).toMatchObject({ state: 'lapsed', code: 'approval-wait-cancelled' })
    expect(read.receipts[0]?.outcome).not.toBe('allowed-once')

    // Gone while paused, no decision evidence: lapsed as stopped — never effective, never approved.
    const h3 = await harness()
    h3.approvalsResponses.push(pending(card()))
    await h3.store.read({ matterRef: 'matter:1' })
    await h3.store.answer({ matterRef: 'matter:1', requestId: 'appr-1', outcome: 'rejected' })
    h3.paused.value = true
    h3.approvalsResponses.push(pending())
    read = await h3.store.read({ matterRef: 'matter:1' })
    expect(read.receipts[0]).toMatchObject({ state: 'lapsed', code: 'approval-session-paused' })
  })

  it('preserves a vanished wait as 失效 instead of dropping it, and refuses answers while paused', async () => {
    const h = await harness()
    h.approvalsResponses.push(pending(card()))
    await h.store.read({ matterRef: 'matter:1' })
    h.approvalsResponses.push(pending())
    const read = await h.store.read({ matterRef: 'matter:1' })
    expect(read.pending).toEqual([])
    const { sessionId: _sessionId, ...cardView } = card()
    expect(read.lapsed).toEqual([{ ...cardView, lapse: 'gone' }])

    // While paused, an answer cannot be dispatched and nothing is recorded (resume stays possible).
    const h2 = await harness({ paused: true })
    h2.approvalsResponses.push(pending(card()))
    await h2.store.read({ matterRef: 'matter:1' })
    expect(await h2.store.answer({ matterRef: 'matter:1', requestId: 'appr-1', outcome: 'allowed-once' })).toEqual({ state: 'refused', code: 'approval-paused' })
    expect(h2.calls.map((call) => call.endpoint)).toEqual(['session/approvals'])
  })

  it('withdraws by one named request with a receipt; a non-withdrawable wait is refused by name', async () => {
    const h = await harness()
    h.approvalsResponses.push(pending(card()))
    await h.store.read({ matterRef: 'matter:1' })
    const recorded = await h.store.withdraw({ matterRef: 'matter:1', requestId: 'appr-1' })
    expect(recorded).toMatchObject({ state: 'recorded', receipt: { requestId: 'appr-1', state: 'accepted', outcome: 'withdrawn', verifyOnly: true } })
    expect(h.calls.at(-1)).toEqual({ endpoint: 'session/approval-withdraw', payload: [{ requestId: 'appr-1' }] })

    const h2 = await harness()
    h2.approvalsResponses.push(pending(card({ withdrawable: false })))
    await h2.store.read({ matterRef: 'matter:1' })
    expect(await h2.store.withdraw({ matterRef: 'matter:1', requestId: 'appr-1' })).toEqual({ state: 'refused', code: 'approval-not-withdrawable' })
  })
})

describe('the approval routes (ticket 041)', () => {
  it('parses exactly and enters admission without calling raw approval providers', async () => {
    const seen: unknown[] = []
    const providers = createUnavailableFirstService(null, {
      sessionApprovalAnswer: async (request) => {
        seen.push({ answer: request })
        return { state: 'recorded', receipt: { requestId: request.requestId, state: 'accepted', outcome: request.outcome, submittedAt: 't', code: null, verifyOnly: true } }
      },
      sessionApprovalWithdraw: async (request) => {
        seen.push({ withdraw: request })
        return { state: 'recorded', receipt: { requestId: request.requestId, state: 'accepted', outcome: 'withdrawn', submittedAt: 't', code: null, verifyOnly: true } }
      },
    })
    const post = (path: string, body: unknown, service = providers) => handleSageServiceRequest(
      new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-041' }, providers: service } as never,
    )
    expect(await (await post('/.sage/session/approval-answer', { matterRef: 'matter:1', requestId: 'appr-1', outcome: 'allowed-once' })).json())
      .toMatchObject({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(await (await post('/.sage/session/approval-withdraw', { matterRef: 'matter:1', requestId: 'appr-1' })).json())
      .toMatchObject({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(seen).toEqual([])

    // Exactly the declared members; the outcome is one of the two decision words.
    expect((await post('/.sage/session/approval-answer', { matterRef: 'matter:1', requestId: 'appr-1', outcome: 'approved' })).status).toBe(400)
    expect((await post('/.sage/session/approval-answer', { requestId: 'appr-1', outcome: 'rejected' })).status).toBe(400)
    expect((await post('/.sage/session/approval-answer', { matterRef: 'matter:1', requestId: 'appr-1', outcome: 'rejected', extra: 1 })).status).toBe(400)
    expect((await post('/.sage/session/approval-withdraw', { matterRef: 'matter:1' })).status).toBe(400)
    expect((await post('/.sage/session/approval-withdraw', { matterRef: 'matter:1', requestId: 'appr-1', outcome: 'allowed-once' })).status).toBe(400)

    const unwired = createUnavailableFirstService(null, {})
    expect(await (await post('/.sage/session/approval-answer', { matterRef: 'matter:1', requestId: 'appr-1', outcome: 'rejected' }, unwired)).json())
      .toMatchObject({ code: 'protected-effect-unavailable' })
    expect(await (await post('/.sage/session/approval-withdraw', { matterRef: 'matter:1', requestId: 'appr-1' }, unwired)).json())
      .toMatchObject({ code: 'protected-effect-unavailable' })
  })
})
