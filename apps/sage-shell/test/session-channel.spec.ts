import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createSessionChannel, foldSessionFrames, turnProcessView } from '../src/main/session-channel.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'

/**
 * Ticket 005 (US-012/013).
 *
 * The acceptance lines that live here: an accepted prompt never reads as "started working", a
 * broken stream reconciles against the durable history, and reopening reads the session without
 * ever sending again.
 */

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

interface Call {
  readonly endpoint: string
  readonly payload: readonly unknown[]
}

async function channel(answers: Record<string, unknown>, frames: readonly unknown[] = []) {
  const dir = await mkdtemp(join(tmpdir(), 'sage-session-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const calls: Call[] = []
  let counter = 0
  const instance = createSessionChannel(
    async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      return answers[endpoint]
    },
    {
      bindingsFile: join(dir, 'sessions', 'bindings.json'),
      now: () => '2026-10-02T12:00:00.000Z',
      nextId: () => `id-${String(++counter)}`,
      streamCall: async (endpoint, payload, onFrame) => {
        calls.push({ endpoint, payload })
        for (const frame of frames) {
          if (!onFrame(frame)) break
        }
        return answers[endpoint]
      },
    },
  )
  return { channel: instance, calls, dir }
}

const assistantEvent = (seq: number, text: string) => ({
  type: 'event',
  event: { type: 'assistant/message', seq, time: 1, data: { turn: 1, step: 1, message: { content: [{ type: 'text', text }] }, stream: [] } },
})
const turnStart = (seq: number) => ({ type: 'event', event: { type: 'turn/start', seq, time: 1, data: { turn: 1 } } })
const turnEnd = (seq: number, reason: string) => ({ type: 'event', event: { type: 'turn/end', seq, time: 1, data: { turn: 1, reason } } })
const snapshot = (records: readonly unknown[], cursor: number) => ({ type: 'snapshot', header: {}, cursor, records, hasMore: false, projections: {} })
const toolCall = (seq: number, name: string, callId: string, args?: Record<string, unknown>) => ({
  type: 'event',
  event: {
    type: 'tool/call', seq, time: 2, data: { name, callId, turn: 1, step: 1, ...(args === undefined ? {} : { arguments: args }) },
  },
})
const toolResult = (seq: number, callId: string, text: string) => ({
  type: 'event',
  event: { type: 'tool/result', seq, time: 3, data: { message: { callId, isError: false, content: [{ type: 'text', text }] }, meta: {} } },
})

describe('the turn process fold (ADR-0301)', () => {
  it('folds duration, iterations and write/edit items with basenames only', () => {
    const fold = foldSessionFrames([
      snapshot([], 0),
      { type: 'event', event: { type: 'turn/start', seq: 1, time: 1000, data: { turn: 1 } } },
      { type: 'event', event: { type: 'step/start', seq: 2, time: 1100, data: { turn: 1, step: 1 } } },
      { type: 'event', event: { type: 'step/start', seq: 3, time: 1500, data: { turn: 1, step: 2 } } },
      { type: 'event', event: { type: 'tool/call', seq: 4, time: 1600, data: { turn: 1, step: 2, callId: 'call-1', name: 'write', arguments: { file_path: '/Users/somebody/work/demo.html' } } } },
      { type: 'event', event: { type: 'tool/result', seq: 5, time: 3500, data: { turn: 1, step: 2, message: { callId: 'call-1', content: [], isError: false } } } },
      { type: 'event', event: { type: 'tool/call', seq: 6, time: 3600, data: { turn: 1, step: 2, callId: 'call-2', name: 'read', arguments: { file_path: '/w/x.md' } } } },
      { type: 'event', event: { type: 'turn/end', seq: 7, time: 8000, data: { turn: 1, reason: 'completed' } } },
    ])
    const view = turnProcessView(fold.turnProcess)
    expect(view.durationMs).toBe(7000)
    expect(view.iterations).toBe(2)
    // The read tool never enters the file list; only the basename crosses the projection.
    expect(view.fileWrites).toEqual([{ name: 'write', file: 'demo.html', state: 'done', durationMs: 1900, added: null, removed: null, hunks: [] }])
    expect(JSON.stringify(view)).not.toContain('/Users/')
  })

  it('extracts bounded diff facts from the tool result meta, with the create fallback (ADR-0302)', () => {
    const edited = foldSessionFrames([
      { type: 'event', event: { type: 'turn/start', seq: 1, time: 0, data: { turn: 1 } } },
      { type: 'event', event: { type: 'tool/call', seq: 2, time: 10, data: { turn: 1, step: 1, callId: 'e1', name: 'edit', arguments: { file_path: '/w/demo.html', old_string: 'a', new_string: 'b' } } } },
      { type: 'event', event: { type: 'tool/result', seq: 3, time: 20, data: { turn: 1, step: 1, message: { callId: 'e1', content: [], isError: false }, meta: { diffs: [{ path: '/w/demo.html', oldText: 'line-a\nline-b', newText: 'line-a\nline-c' }] } } } },
    ])
    const viewed = turnProcessView(edited.turnProcess)
    expect(viewed.fileWrites[0]).toMatchObject({ name: 'edit', file: 'demo.html', added: 2, removed: 2 })
    expect(viewed.fileWrites[0]?.hunks).toEqual([{ old: 'line-a\nline-b', new: 'line-a\nline-c' }])

    // A created file's result meta carries no hunks: the call's own content is the insertion.
    const created = foldSessionFrames([
      { type: 'event', event: { type: 'turn/start', seq: 1, time: 0, data: { turn: 1 } } },
      { type: 'event', event: { type: 'tool/call', seq: 2, time: 10, data: { turn: 1, step: 1, callId: 'c1', name: 'write', arguments: { file_path: '/w/new.html', content: 'l1\nl2\nl3' } } } },
      { type: 'event', event: { type: 'tool/result', seq: 3, time: 40, data: { turn: 1, step: 1, message: { callId: 'c1', content: [], isError: false }, meta: { operation: 'create', diffs: [] } } } },
    ])
    const createdView = turnProcessView(created.turnProcess)
    expect(createdView.fileWrites[0]).toMatchObject({ file: 'new.html', added: 3, removed: 0, state: 'done' })
    expect(createdView.fileWrites[0]?.hunks).toEqual([{ old: null, new: 'l1\nl2\nl3' }])
    expect(JSON.stringify(createdView)).not.toContain('/w/')
  })

  it('folds the snapshot context-pressure projection when the host carries one (ADR-0303)', () => {
    const withPressure = foldSessionFrames([
      { type: 'snapshot', header: {}, cursor: 3, records: [], hasMore: false, projections: { contextPressure: { pressureTokens: 12000, contextWindow: 80000 } } },
    ])
    expect(withPressure.contextPressure).toEqual({ pressureTokens: 12000, contextWindow: 80000 })

    // Absent or malformed projections leave the surface without a figure (null, never a guess).
    const absent = foldSessionFrames([{ type: 'snapshot', header: {}, cursor: 0, records: [], hasMore: false, projections: {} }])
    expect(absent.contextPressure).toBeNull()
    const malformed = foldSessionFrames([
      { type: 'snapshot', header: {}, cursor: 0, records: [], hasMore: false, projections: { contextPressure: { pressureTokens: -5, contextWindow: 0 } } },
    ])
    expect(malformed.contextPressure).toBeNull()
    // Partial projections survive with their valid half.
    const partial = foldSessionFrames([
      { type: 'snapshot', header: {}, cursor: 0, records: [], hasMore: false, projections: { contextPressure: { contextWindow: 80000 } } },
    ])
    expect(partial.contextPressure).toEqual({ pressureTokens: null, contextWindow: 80000 })
  })

  it('marks a failed tool result and resets the process on the next turn start', () => {
    const failed = foldSessionFrames([
      { type: 'event', event: { type: 'turn/start', seq: 1, time: 0, data: { turn: 1 } } },
      { type: 'event', event: { type: 'tool/call', seq: 2, time: 10, data: { turn: 1, step: 1, callId: 'c', name: 'edit', arguments: { path: 'demo.html' } } } },
      { type: 'event', event: { type: 'tool/result', seq: 3, time: 20, data: { turn: 1, step: 1, message: { callId: 'c', content: [], isError: true } } } },
    ])
    expect(turnProcessView(failed.turnProcess).fileWrites[0]?.state).toBe('failed')

    const next = foldSessionFrames([
      { type: 'event', event: { type: 'turn/start', seq: 1, time: 0, data: { turn: 1 } } },
      { type: 'event', event: { type: 'tool/call', seq: 2, time: 10, data: { turn: 1, step: 1, callId: 'c', name: 'write', arguments: { path: 'a.html' } } } },
      { type: 'event', event: { type: 'turn/start', seq: 3, time: 30, data: { turn: 2 } } },
    ])
    expect(turnProcessView(next.turnProcess).fileWrites).toEqual([])
    expect(turnProcessView(next.turnProcess).iterations).toBeNull()
  })
})

describe('ADR-0314: non-write tool results become the typed view declarations (M05)', () => {
  it('retains a non-write result text once and excludes the write family', async () => {
    const { channel: instance } = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: { accepted: true } },
      'session/follow': { ok: true, result: { frames: 1 } },
    }, [snapshot([
      turnStart(1),
      toolCall(2, 'bash', 'c1', { command: 'ls' }),
      toolResult(3, 'c1', 'file-a\nfile-b'),
      toolCall(4, 'write', 'c2', { file_path: '/w/a.txt' }),
      toolResult(5, 'c2', 'Wrote file'),
    ], 5)])
    await instance.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '开始吧' })
    const status = await instance.read({ matterRef: 'receipt:1' })
    expect(status).toMatchObject({ state: 'read' })
    expect(status.turnProcess.fileWrites.map((item) => [item.name, item.file])).toEqual([['write', 'a.txt']])
    expect(instance.toolResultDeclarations('receipt:1')).toEqual([
      { resultId: 'c1', tool: 'bash', title: 'bash', at: '3', type: 'text', text: 'file-a\nfile-b' },
    ])
    // Nothing is invented for a matter with no read of its own.
    expect(instance.toolResultDeclarations('receipt:other')).toEqual([])
  })

  it('claims nothing from a still-broken stream (ADR-0314 review)', async () => {
    const { channel: instance } = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: { accepted: true } },
      'session/follow': { ok: false, code: 'bridge-stream-overflow' },
    }, [snapshot([turnStart(1), toolCall(2, 'bash', 'c1'), toolResult(3, 'c1', 'partial text')], 3)])
    await instance.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '开始吧' })
    const status = await instance.read({ matterRef: 'receipt:1' })
    expect(status).toMatchObject({ state: 'read', streamBroken: true })
    // The partial fold is not claimable — the declarations go empty, never unverified partial text.
    expect(instance.toolResultDeclarations('receipt:1')).toEqual([])
  })

  it('cuts a long text with a kept marker at the kernel bound, and drops empty texts', async () => {
    const long = 'x'.repeat(9000)
    const { channel: instance } = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: { accepted: true } },
      'session/follow': { ok: true, result: { frames: 1 } },
    }, [snapshot([
      turnStart(1),
      toolCall(2, 'WebFetch', 'c1'),
      toolResult(3, 'c1', long),
      toolCall(4, 'bash', 'c2'),
      toolResult(5, 'c2', ''),
      toolResult(6, 'never-called', 'orphan text'),
    ], 6)])
    await instance.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '开始吧' })
    await instance.read({ matterRef: 'receipt:1' })
    const declarations = instance.toolResultDeclarations('receipt:1') as Array<{ readonly resultId: string, readonly text: string }>
    expect(declarations).toHaveLength(1)
    expect(declarations[0]!.resultId).toBe('c1')
    expect(declarations[0]!.text.length).toBeLessThanOrEqual(8192)
    expect(declarations[0]!.text.endsWith('…（已截断）')).toBe(true)
  })
})

describe('followLive: the live half of the follow seam (ADR-0298)', () => {
  async function liveChannel(matterRef: string, script: readonly (readonly unknown[])[]) {
    const dir = await mkdtemp(join(tmpdir(), 'sage-follow-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const bindingsFile = join(dir, 'sessions', 'bindings.json')
    await mkdir(join(dir, 'sessions'), { recursive: true })
    await writeFile(bindingsFile, JSON.stringify({ [matterRef]: 'session:live' }))
    const calls: Call[] = []
    let callIndex = 0
    const instance = createSessionChannel(
      async () => ({ ok: true, result: {} }),
      {
        bindingsFile,
        now: () => '2026-10-12T12:00:00.000Z',
        nextId: () => 'id-1',
        streamCall: async (endpoint, payload, onFrame) => {
          calls.push({ endpoint, payload })
          const frames = script[Math.min(callIndex, script.length - 1)] ?? []
          callIndex += 1
          for (const frame of frames) {
            if (!onFrame(frame)) break
          }
          return { ok: true, result: { frames: frames.length } }
        },
      },
    )
    return { channel: instance, calls }
  }

  const chunk = (index: number, text: string) => ({ type: 'assistant-stream', frame: { type: 'chunk', index, data: { text } } })

  it('pushes ordered chunks, dedupes a re-subscribe replay, and stops at the turn end', async () => {
    const { channel, calls } = await liveChannel('matter:live', [
      [chunk(0, '半句'), chunk(1, '话')],
      [chunk(0, '半句'), chunk(1, '话'), chunk(2, '，完'), turnEnd(9, 'completed')],
    ])
    const deltas: string[] = []
    await channel.followLive({ matterRef: 'matter:live', signal: new AbortController().signal, onDelta: (text) => deltas.push(text) })
    // The replayed chunks 0/1 are dropped by index; the turn end ends the loop (no third call).
    expect(deltas).toEqual(['半句', '话', '，完'])
    expect(calls).toHaveLength(2)
    expect(calls.every((call) => call.endpoint === 'session/follow')).toBe(true)
  })

  it('stops without re-subscribing when the caller aborts', async () => {
    const { channel, calls } = await liveChannel('matter:abort', [[chunk(0, '甲')]])
    const abort = new AbortController()
    const deltas: string[] = []
    await channel.followLive({ matterRef: 'matter:abort', signal: abort.signal, onDelta: (text) => { deltas.push(text); abort.abort() } })
    expect(deltas).toEqual(['甲'])
    expect(calls).toHaveLength(1)
  })

  it('exits at once when the snapshot already carries the finished turn', async () => {
    const { channel, calls } = await liveChannel('matter:late', [[snapshot([turnEnd(4, 'completed')], 4)]])
    const deltas: string[] = []
    await channel.followLive({ matterRef: 'matter:late', signal: new AbortController().signal, onDelta: (text) => deltas.push(text) })
    expect(deltas).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('does nothing without a bound session, and never creates one', async () => {
    const { channel, calls } = await liveChannel('matter:other', [[]])
    const deltas: string[] = []
    await channel.followLive({ matterRef: 'matter:none', signal: new AbortController().signal, onDelta: (text) => deltas.push(text) })
    expect(deltas).toEqual([])
    expect(calls).toHaveLength(0)
  })
})

describe('the fold: an open turn is the only "executing" evidence', () => {
  it('reads a snapshot with an open turn as executing, and a closed turn as ended', () => {
    const open = foldSessionFrames([snapshot([turnStart(1)], 1)])
    expect(open.executingTurn).toBe(1)
    expect(open.lastTurnEnd).toBeNull()
    const closed = foldSessionFrames([snapshot([turnStart(1), assistantEvent(2, '答复'), turnEnd(3, 'completed')], 3)])
    expect(closed.executingTurn).toBeNull()
    expect(closed.lastTurnEnd).toBe('completed')
    expect(closed.assistantText).toBe('答复')
  })

  it('never lets a live assistant frame become the final text, and counts what it cannot parse', () => {
    const live = foldSessionFrames([
      snapshot([], 0),
      { type: 'assistant-stream', frame: { type: 'chunk', index: 0, data: { text: '半句话' } } },
      { type: 'mystery' },
    ])
    expect(live.assistantText).toBeNull()
    expect(live.unapplied).toBe(1)
  })

  it('takes only the newest assistant message as the final text', () => {
    const merged = foldSessionFrames([snapshot([assistantEvent(1, '第一轮'), assistantEvent(2, '第二轮')], 2)])
    expect(merged.assistantText).toBe('第二轮')
  })
})

describe('send: the ack admits the prompt and claims nothing else', () => {
  it('creates the session once, persists the binding, and reports accepted', async () => {
    const { channel: instance, calls } = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: { accepted: true } },
    })
    const outcome = await instance.send({ matterRef: 'receipt:1', workspaceRoot: '/Users/someone/project', text: '开始吧' })
    // 008: the ack echoes the send mode it carried (default queue).
    expect(outcome).toEqual({ state: 'accepted', sessionId: 'session-1', requestId: 'req-id-1', mode: 'queue' })
    expect(calls.map((call) => call.endpoint)).toEqual(['session/create', 'session/prompt'])
    expect(calls[1]?.payload).toEqual([{ requestId: 'req-id-1', sessionId: 'session-1', mode: 'queue', text: '开始吧' }])
  })

  it('refuses a prompt the base did not acknowledge, and refuses empty text without any call', async () => {
    const rejected = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: {} },
    })
    expect(await rejected.channel.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: 'x' }))
      .toEqual({ state: 'refused', code: 'bridge-answer-unrecognised' })

    const empty = await channel({})
    expect(await empty.channel.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '   ' }))
      .toEqual({ state: 'refused', code: 'session-text-invalid' })
    expect(empty.calls).toEqual([])
  })
})

describe('036: the caller-minted request identity rides the same send', () => {
  it('sends the caller requestId verbatim and refuses a malformed one before any bridge call', async () => {
    const { channel: instance, calls } = await channel({ 'session/create': { ok: true, result: { sessionId: 's1' } }, 'session/prompt': { ok: true, result: { accepted: true } } })
    const outcome = await instance.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '改后内容', requestId: 'edit-1-v1' })
    expect(outcome.state).toBe('accepted')
    const prompt = calls.find((call) => call.endpoint === 'session/prompt')
    expect(prompt?.payload).toEqual([expect.objectContaining({ requestId: 'edit-1-v1', text: '改后内容' })])
    const before = calls.length
    expect(await instance.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: 'x', requestId: ' bad ' })).toEqual({ state: 'refused', code: 'session-request-id-invalid' })
    expect(calls.length).toBe(before)
  })
})

describe('read: reopening reads, never re-sends; a broken stream reconciles from history', () => {
  it('does not create a session just because someone looked', async () => {
    const { channel: instance, calls } = await channel({})
    const status = await instance.read({ matterRef: 'receipt:1' })
    expect(status).toMatchObject({ state: 'no-session', sessionId: null, transcript: [] })
    expect(calls).toEqual([])
  })

  it('creates the session once for the matter: a second send reuses the binding', async () => {
    const { channel: instance, calls } = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: { accepted: true } },
    })
    await instance.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '第一句' })
    await instance.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '第二句' })
    expect(calls.filter((call) => call.endpoint === 'session/create')).toHaveLength(1)
    expect(calls.filter((call) => call.endpoint === 'session/prompt')).toHaveLength(2)
  })

  it('reuses the persisted session on a later read and only opens the stream', async () => {
    const { channel: instance, calls, dir } = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: { accepted: true } },
      'session/follow': { ok: true, result: { frames: 1 } },
    }, [snapshot([turnStart(1)], 1)])
    await instance.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '开始吧' })
    const first = await instance.read({ matterRef: 'receipt:1' })
    expect(first).toMatchObject({ state: 'read', sessionId: 'session-1', execution: 'executing' })
    expect(first.transcript[0]).toMatchObject({ role: 'user', text: '开始吧', source: 'echo' })

    // A fresh channel over the same bindings file (the restart case) reuses the session and only
    // reads: no second create, no second prompt.
    const reopened = createSessionChannel(async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      return { ok: true, result: { frames: 0 } }
    }, {
      bindingsFile: join(dir, 'sessions', 'bindings.json'),
      now: () => '2026-10-02T13:00:00.000Z',
      nextId: () => 'id-99',
      streamCall: async (endpoint, payload) => { calls.push({ endpoint, payload }); return { ok: true, result: { frames: 0 } } },
    })
    const after = await reopened.read({ matterRef: 'receipt:1' })
    expect(after.sessionId).toBe('session-1')
    expect(calls.filter((call) => call.endpoint === 'session/prompt')).toHaveLength(1)
    expect(calls.filter((call) => call.endpoint === 'session/create')).toHaveLength(1)
  })

  it('reconciles a broken stream against the history page and hands back the historical text', async () => {
    const { channel: instance, calls } = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: { accepted: true } },
      'session/follow': { ok: false, code: 'bridge-stream-closed' },
      'session/page': { ok: true, result: { records: [turnStart(1), assistantEvent(2, '历史里的最终答复'), turnEnd(3, 'completed')], hasMore: false } },
    })
    await instance.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '问题' })
    const status = await instance.read({ matterRef: 'receipt:1' })
    expect(status).toMatchObject({ state: 'read', reconciled: true, streamBroken: false, execution: 'idle', lastTurnEnd: 'completed' })
    expect(status.transcript).toEqual([
      // 036 deliberate：echo 行带上 messageRef（消息身份；编辑/重发以此引用）。
      { role: 'user', text: '问题', source: 'echo', at: '2026-10-02T12:00:00.000Z', attachments: [], messageRef: 'req-id-1' },
      { role: 'assistant', text: '历史里的最终答复', source: 'history', at: null, attachments: [] },
    ])
    // 008: the read also pulls one bounded queue snapshot (session/control) for the projection.
    expect(calls.map((call) => call.endpoint)).toEqual(['session/create', 'session/prompt', 'session/follow', 'session/page', 'session/control'])
  })

  it('stays honest when the reconcile itself fails: broken stream with its code, no invented text', async () => {
    const { channel: instance } = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: { accepted: true } },
      'session/follow': { ok: false, code: 'bridge-provider-failed' },
      'session/page': { ok: false, code: 'bridge-session-unknown' },
    })
    await instance.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '问题' })
    const status = await instance.read({ matterRef: 'receipt:1' })
    expect(status).toMatchObject({ streamBroken: true, reconciled: false, code: 'bridge-provider-failed' })
    expect(status.transcript.filter((entry) => entry.role === 'assistant')).toEqual([])
  })

  it('reconciles even when the stream was fine but produced no assistant text yet', async () => {
    const { channel: instance, calls } = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: { accepted: true } },
      'session/follow': { ok: true, result: { frames: 0 } },
      'session/page': { ok: true, result: { records: [assistantEvent(2, '只存在于历史')], hasMore: false } },
    })
    await instance.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '问题' })
    const status = await instance.read({ matterRef: 'receipt:1' })
    expect(status.transcript.some((entry) => entry.source === 'history' && entry.text === '只存在于历史')).toBe(true)
    expect(calls.some((call) => call.endpoint === 'session/page')).toBe(true)
  })
})

describe('the send route', () => {
  it('parses exactly {matterRef, workspaceRoot, text} and blocks the raw provider before authority', async () => {
    const seen: string[] = []
    const providers = createUnavailableFirstService(null, {
      sessionSend: (request) => {
        seen.push(`${request.matterRef}:${request.workspaceRoot}:${request.text}`)
        return Promise.resolve({ state: 'accepted', sessionId: 's-1', requestId: 'r-1' })
      },
    })
    const post = (body: string, target = providers) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
      { callerBinding: { correlation: 'c-005' }, providers: target } as never,
    )
    expect(await (await post(JSON.stringify({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '开始' }))).json())
      .toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(seen).toEqual([])

    for (const body of [
      'not json',
      JSON.stringify({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '   ' }),
      JSON.stringify({ matterRef: '', workspaceRoot: '/a', text: 'x' }),
      JSON.stringify({ matterRef: 'receipt:1', workspaceRoot: '/a', text: 'x', extra: 1 }),
    ]) {
      expect((await post(body)).status, body).toBe(400)
    }
    const unwired = createUnavailableFirstService(null, {})
    expect(await (await post(JSON.stringify({ matterRef: 'm', workspaceRoot: '/a', text: 'x' }), unwired)).json())
      .toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
  })
})

describe('attachments ride the one send path (014)', () => {
  const file = { attachmentId: 'sha-1', name: 'report.bin', bytes: 10 }
  const userAttachmentEvent = (seq: number, text: string, files: readonly typeof file[], rpcId?: string) => ({
    type: 'event',
    event: {
      type: 'user/message',
      seq,
      time: 1,
      data: {
        message: {
          content: [
            ...(text === '' ? [] : [{ type: 'text', text }]),
            ...files.map((entry) => ({ type: 'file', attachment: entry })),
          ],
          source: { kind: 'user', ...(rpcId === undefined ? {} : { rpcId }) },
        },
      },
    },
  })

  it('carries receipts into the one prompt and shows the durable refs on the echo row', async () => {
    const { channel: instance, calls } = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: { accepted: true } },
    })
    const outcome = await instance.send({
      matterRef: 'receipt:1',
      workspaceRoot: '/a',
      text: '看这个',
      attachments: [{ receiptId: 'receipt-u-1', ...file }],
    })
    expect(outcome).toMatchObject({ state: 'accepted' })
    // The receipt travels as the base's own file part; the attachment's file ref never does.
    expect(calls[1]?.payload).toEqual([{
      requestId: 'req-id-1',
      sessionId: 'session-1',
      mode: 'queue',
      text: '看这个',
      receipts: ['receipt-u-1'],
    }])
    const status = await instance.read({ matterRef: 'receipt:1' })
    const echo = status.transcript.find((entry) => entry.source === 'echo')
    expect(echo?.attachments).toEqual([file])
    expect(JSON.stringify(calls)).not.toContain('report.bin')
  })

  it('allows an attachments-only send — the base needs text or an attachment, not both', async () => {
    const { channel: instance, calls } = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: { accepted: true } },
    })
    const outcome = await instance.send({
      matterRef: 'receipt:1',
      workspaceRoot: '/a',
      text: '',
      attachments: [{ receiptId: 'receipt-u-1', ...file }],
    })
    expect(outcome).toMatchObject({ state: 'accepted' })
    expect(calls[1]?.payload).toEqual([{
      requestId: 'req-id-1',
      sessionId: 'session-1',
      mode: 'queue',
      text: '',
      receipts: ['receipt-u-1'],
    }])
  })

  it('reappears from durable history on reopen — the attachment row comes from the log, not from any re-upload', async () => {
    const frames = [
      snapshot([turnStart(1), userAttachmentEvent(2, '看这个', [file]), assistantEvent(3, '收到')], 3),
    ]
    const { channel: instance, calls } = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: { accepted: true } },
    }, frames)
    await instance.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: 'x' })
    // The historical message has no request id of this run: it must surface from the log itself.
    const status = await instance.read({ matterRef: 'receipt:1' })
    const historyRow = status.transcript.find((entry) => entry.source === 'history' && entry.role === 'user')
    expect(historyRow).toMatchObject({ text: '看这个', at: null, attachments: [file] })
    // Reopening never re-sent: only the explicit send ever touched session/prompt.
    expect(calls.filter((call) => call.endpoint === 'session/prompt')).toHaveLength(1)
  })

  it('dedupes: an echoed attachment message is not repeated as a history row', async () => {
    const frames = [
      snapshot([userAttachmentEvent(2, '看这个', [file], 'req-id-1'), assistantEvent(3, '收到')], 3),
    ]
    const { channel: instance } = await channel({
      'session/create': { ok: true, result: { sessionId: 'session-1' } },
      'session/prompt': { ok: true, result: { accepted: true } },
    }, frames)
    await instance.send({
      matterRef: 'receipt:1',
      workspaceRoot: '/a',
      text: '看这个',
      attachments: [{ receiptId: 'receipt-u-1', ...file }],
    })
    const status = await instance.read({ matterRef: 'receipt:1' })
    const userRows = status.transcript.filter((entry) => entry.role === 'user')
    // Same request id on both sides: one message, one row — and it is the echo (this run's own act).
    expect(userRows).toHaveLength(1)
    expect(userRows[0]).toMatchObject({ source: 'echo', attachments: [file] })
  })
})
