import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createSessionChannel, foldSessionFrames, turnEndKind } from '../src/main/session-channel.js'
import { createSessionHistory } from '../src/main/session-history.js'

/**
 * Ticket 037 (US-188) at the module seams.
 *
 * The acceptance lines: the reply's action list is derived from projection facts — `retry` only
 * on a determinate failure (`turn/end.reason.kind === 'error'`), never while the state is
 * uncertain; and the base's turn/end reason is an OBJECT kind (older evidence: strings), which
 * the fold and the history read must normalize before anyone can judge failure.
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

describe('turn/end reason normalization (ticket 037)', () => {
  it('reads the base object kind, keeps string back-compat, and falls back honestly', () => {
    expect(turnEndKind({ reason: { kind: 'completed' } })).toBe('completed')
    expect(turnEndKind({ reason: { kind: 'error', error: { code: 'X' } } })).toBe('error')
    expect(turnEndKind({ reason: { kind: 'aborted', reason: 'user stop' } })).toBe('aborted')
    expect(turnEndKind({ reason: 'cancelled' })).toBe('cancelled')
    expect(turnEndKind({ reason: null })).toBe('ended')
    expect(turnEndKind(null)).toBe('ended')
    expect(turnEndKind({ reason: {} })).toBe('ended')
  })

  it('folds an object-reason error into the determinate failure fact', () => {
    const fold = foldSessionFrames([
      { type: 'snapshot', header: {}, cursor: 3, hasMore: false, projections: {}, records: [
        event(1, 'turn/start', { turn: 1 }),
        event(2, 'assistant/message', { message: { content: [{ type: 'text', text: '半截回复' }] } }),
        event(3, 'turn/end', { turn: 1, reason: { kind: 'error', error: { code: 'LLM_DOWN' } } }),
      ] },
    ])
    expect(fold.lastTurnEnd).toBe('error')
    expect(fold.executingTurn).toBeNull()
  })

  it('names the end kind in the history walk too (object reason)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sage-reason-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const { writeFile } = await import('node:fs/promises')
    const bindingsFile = join(dir, 'bindings.json')
    await writeFile(bindingsFile, JSON.stringify({ 'matter:1': 's-1' }), { mode: 0o600 })
    const history = createSessionHistory({
      callBridge: async () => ({ ok: true, result: { records: [
        event(0, 'turn/start', { turn: 1 }),
        event(4, 'turn/end', { turn: 1, reason: { kind: 'error' } }),
      ], hasMore: false } }),
      bindingsFile,
      now: () => '2026-10-03T12:00:00.000Z',
    })
    const detail = await history.detail({ matterRef: 'matter:1', runSeq: 0 })
    expect(detail).toMatchObject({ state: 'read', endReason: 'error' })
  })
})

describe('the reply action facts (ticket 037)', () => {
  async function channelWith(frames: readonly unknown[]) {
    const dir = await mkdtemp(join(tmpdir(), 'sage-reply-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const { writeFile, mkdir } = await import('node:fs/promises')
    const bindingsFile = join(dir, 'sessions', 'bindings.json')
    await mkdir(join(dir, 'sessions'), { recursive: true })
    await writeFile(bindingsFile, JSON.stringify({ 'matter:1': 'session-1' }), { mode: 0o600 })
    const instance = createSessionChannel(async (endpoint) => {
      if (endpoint === 'session/follow') return { ok: true }
      return { ok: true, result: { records: [], hasMore: false } }
    }, {
      bindingsFile,
      now: () => 't',
      nextId: () => 'id-1',
      streamCall: async (_endpoint, _payload, onFrame) => {
        for (const frame of frames) if (!onFrame(frame)) break
        return { ok: true }
      },
    })
    return instance
  }

  const snapshot = (records: readonly unknown[], cursor: number) => ({ type: 'snapshot', header: {}, cursor, records, hasMore: false, projections: {} })

  it('offers retry only on a determinate failure; a completed turn never does', async () => {
    const failed = await channelWith([snapshot([
      event(1, 'turn/start', { turn: 1 }),
      event(2, 'user/message', { message: { content: [{ type: 'text', text: '要求' }] }, source: { kind: 'user', rpcId: 'r-1' } }),
      event(3, 'assistant/message', { message: { content: [{ type: 'text', text: '半截回复' }] } }),
      event(4, 'turn/end', { turn: 1, reason: { kind: 'error' } }),
    ], 4)])
    const failedStatus = await failed.read({ matterRef: 'matter:1' })
    expect(failedStatus.state).toBe('read')
    if (failedStatus.state !== 'read') return
    expect(failedStatus.reply).toMatchObject({ text: '半截回复', endKind: 'error', failed: true, actions: ['copy', 'quote', 'retry'] })

    const completed = await channelWith([snapshot([
      event(1, 'turn/start', { turn: 1 }),
      event(3, 'assistant/message', { message: { content: [{ type: 'text', text: '完整回复' }] } }),
      event(4, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ], 4)])
    const completedStatus = await completed.read({ matterRef: 'matter:1' })
    if (completedStatus.state !== 'read') return
    expect(completedStatus.reply).toMatchObject({ failed: false, actions: ['copy', 'quote'] })

    const empty = await channelWith([snapshot([event(1, 'turn/start', { turn: 1 })], 1)])
    const emptyStatus = await empty.read({ matterRef: 'matter:1' })
    if (emptyStatus.state !== 'read') return
    // 没有回复文本就没有可复制的动作；执行中也一样。
    expect(emptyStatus.reply.actions).toEqual([])
  })

  it('an aborted turn (user stop) is not a determinate failure and never offers retry', async () => {
    const aborted = await channelWith([snapshot([
      event(1, 'turn/start', { turn: 1 }),
      event(3, 'assistant/message', { message: { content: [{ type: 'text', text: '被打断的回复' }] } }),
      event(4, 'turn/end', { turn: 1, reason: { kind: 'aborted', reason: 'stop' } }),
    ], 4)])
    const status = await aborted.read({ matterRef: 'matter:1' })
    if (status.state !== 'read') return
    expect(status.reply).toMatchObject({ endKind: 'aborted', failed: false, actions: ['copy', 'quote'] })
  })
})
