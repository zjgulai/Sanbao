import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createPendingInputs } from '../src/main/pending-inputs.js'
import { createSessionChannel } from '../src/main/session-channel.js'

/**
 * Ticket 007 (US-020/021): the paused-send deferral and the send/resume race.
 *
 * The acceptance lines: a paused send only registers (no Agent wake-up call exists on that path —
 * asserted as zero bridge traffic); view/edit/remove never wake anything (they touch no bridge);
 * and a resume that races edits / new sends / a re-pause reconciles against the LIVE pending list
 * and the authoritative queue — it never silently sends content that was not the frozen record,
 * and it never sends anything past a re-pause.
 */

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function fresh() {
  const dir = await mkdtemp(join(tmpdir(), 'sage-deferral-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  let counter = 0
  const store = createPendingInputs({
    pendingDir: dir,
    now: () => '2026-10-03T12:00:00.000Z',
    nextId: () => `id-${String(++counter)}`,
    randomKey: () => randomBytes(32),
  })
  return { store, dir }
}

interface ChannelHooks {
  readonly onPrompt?: (text: string) => void | Promise<void>
}

async function channelWith(store: Awaited<ReturnType<typeof fresh>>['store'], dir: string, hooks: ChannelHooks = {}, queue: unknown[] = []) {
  const calls: string[] = []
  let ids = 0
  const channel = createSessionChannel(
    async (endpoint, payload = []) => {
      calls.push(`${endpoint}:${JSON.stringify(payload)}`)
      if (endpoint === 'session/prompt') {
        const text = Array.isArray(payload) && payload[0] !== null && typeof payload[0] === 'object' ? String((payload[0] as { text?: unknown }).text ?? '') : ''
        await hooks.onPrompt?.(text)
      }
      if (endpoint === 'session/create') return { ok: true, result: { sessionId: 'session-1' } }
      if (endpoint === 'session/prompt' || endpoint === 'session/cancel' || endpoint === 'session/queue-remove') return { ok: true, result: { accepted: true } }
      return { ok: false, code: 'bridge-provider-failed' }
    },
    {
      bindingsFile: join(dir, 'sessions', 'bindings.json'),
      now: () => '2026-10-03T12:00:00.000Z',
      nextId: () => `id-${String(++ids)}`,
      pending: store,
      streamCall: async (endpoint, _payload, onFrame) => {
        calls.push(endpoint)
        if (endpoint === 'session/control') {
          onFrame({ type: 'baseline', value: { queues: { 'session-1': queue }, jobs: {}, projections: {} } })
          return { ok: true, result: { frames: 1 } }
        }
        return { ok: false, code: 'bridge-stream-closed' }
      },
    },
  )
  return { channel, calls }
}

describe('paused sends only register (US-020)', () => {
  it('keeps the whole path offline: deferred outcome, zero bridge calls, text readable in the list', async () => {
    const { store, dir } = await fresh()
    const { channel, calls } = await channelWith(store, dir)
    store.pause('matter:1')
    const outcome = await channel.send({ matterRef: 'matter:1', workspaceRoot: '/w', text: '暂停期间写下的要求' })
    expect(outcome.state).toBe('deferred')
    // No create, no prompt, no stream: an Agent wake-up call structurally cannot happen here.
    expect(calls).toEqual([])
    const snapshot = store.snapshot('matter:1')
    expect(snapshot.items[0]).toMatchObject({ text: '暂停期间写下的要求', state: 'pending' })
    expect(snapshot.editable).toEqual([snapshot.items[0]!.itemId])
  })

  it('view/edit/remove never wake anything: the store acts alone and the projection stays readable', async () => {
    const { store, dir } = await fresh()
    const { channel, calls } = await channelWith(store, dir)
    store.pause('matter:1')
    const item = store.enqueue('matter:1', '第一版')
    expect(store.edit('matter:1', item.itemId, '改好的一版')).toMatchObject({ ok: true, item: { text: '改好的一版', state: 'pending' } })
    // 查看：the channel's read shows the item verbatim (no bridge call, no execution).
    const read = await channel.read({ matterRef: 'matter:1' })
    expect(read.pending?.[0]).toMatchObject({ text: '改好的一版', editable: true })
    expect(calls).toEqual([])
    expect(store.remove('matter:1', item.itemId)).toEqual({ ok: true })
    expect(store.snapshot('matter:1').items).toEqual([])
    expect(calls).toEqual([])
  })
})

describe('resume reconciles against the live list and the queue (US-021)', () => {
  it('freezes the dispatched text: an edit racing the prompt is refused, nothing is rewritten', async () => {
    const { store, dir } = await fresh()
    store.pause('matter:1')
    const item = store.enqueue('matter:1', '派发时的原文')
    let editOutcome: unknown = null
    const { channel } = await channelWith(store, dir, {
      onPrompt: async (text) => {
        expect(text).toBe('派发时的原文')
        // The edit lands while the prompt is in flight: it must be refused, or the record would
        // claim text that was never sent.
        editOutcome = store.edit('matter:1', item.itemId, '偷偷换掉的一版')
      },
    })
    const outcome = await channel.resume({ matterRef: 'matter:1', workspaceRoot: '/w' })
    expect(outcome).toMatchObject({ state: 'resumed', dispatched: [item.itemId] })
    expect(editOutcome).toEqual({ ok: false, code: 'item-frozen' })
    const snapshot = store.snapshot('matter:1')
    expect(snapshot.items[0]).toMatchObject({ text: '派发时的原文', state: 'submitted' })
  })

  it('re-reads the live list between dispatches: an edit of the next item dispatches the NEW text', async () => {
    const { store, dir } = await fresh()
    store.pause('matter:1')
    const first = store.enqueue('matter:1', 'A')
    const second = store.enqueue('matter:1', 'B 草稿')
    const sent: string[] = []
    const { channel } = await channelWith(store, dir, {
      onPrompt: async (text) => {
        sent.push(text)
        if (text === 'A') store.edit('matter:1', second.itemId, 'B 修正稿')
      },
    })
    const outcome = await channel.resume({ matterRef: 'matter:1', workspaceRoot: '/w' })
    expect(outcome.state).toBe('resumed')
    expect(sent).toEqual(['A', 'B 修正稿'])
    expect(store.snapshot('matter:1').items.every((entry) => entry.state === 'submitted')).toBe(true)
    void first
  })

  it('halts on a re-pause landing mid-resume: interrupted, the rest stay pending, nothing past it is sent', async () => {
    const { store, dir } = await fresh()
    store.pause('matter:1')
    store.enqueue('matter:1', 'A')
    store.enqueue('matter:1', 'B')
    const sent: string[] = []
    const { channel } = await channelWith(store, dir, {
      onPrompt: async (text) => {
        sent.push(text)
        if (text === 'A') store.pause('matter:1') // a stop races the resume between two dispatches
      },
    })
    const outcome = await channel.resume({ matterRef: 'matter:1', workspaceRoot: '/w' })
    expect(outcome).toMatchObject({ state: 'interrupted', paused: true })
    if (outcome.dispatched !== undefined) expect(outcome.dispatched).toHaveLength(1)
    // B was never sent: the loop re-checks the pause before every prompt.
    expect(sent).toEqual(['A'])
    const snapshot = store.snapshot('matter:1')
    expect(snapshot.items.find((entry) => entry.text === 'B')).toMatchObject({ state: 'pending' })
  })

  it('accounts against the authoritative queue snapshot after dispatch, and reports the revision', async () => {
    const { store, dir } = await fresh()
    store.pause('matter:1')
    const item = store.enqueue('matter:1', '唯一一条')
    const queue: unknown[] = []
    const { channel, calls } = await channelWith(store, dir, {}, queue)
    // The queue snapshot (read at resume end) holds the occurrence: requestId + queueItemId land.
    // The channel's id counter mints `req-id-1` for this resume's single prompt.
    queue.push({ id: 'qi-1', rpcId: 'req-id-1' })
    const outcome = await channel.resume({ matterRef: 'matter:1', workspaceRoot: '/w' })
    expect(outcome.state).toBe('resumed')
    expect(typeof outcome.revision).toBe('number')
    expect(calls.some((call) => call === 'session/control')).toBe(true)
    const after = store.snapshot('matter:1')
    expect(after.items[0]).toMatchObject({ state: 'submitted', queueItemId: 'qi-1' })
    void item

    // Without a queue snapshot the resume still reports honestly (code present, no pretend accounting).
    const empty = await fresh()
    empty.store.pause('matter:1')
    empty.store.enqueue('matter:1', 'X')
    const broken = createSessionChannel(async (endpoint) => endpoint === 'session/create'
      ? { ok: true, result: { sessionId: 's1' } }
      : { ok: true, result: { accepted: true } }, {
      bindingsFile: join(empty.dir, 'sessions', 'bindings.json'),
      now: () => 't',
      nextId: () => 'id',
      pending: empty.store,
      streamCall: async () => ({ ok: false, code: 'bridge-stream-closed' }),
    })
    const outcome2 = await broken.resume({ matterRef: 'matter:1', workspaceRoot: '/w' })
    expect(outcome2).toMatchObject({ state: 'resumed', code: 'bridge-stream-closed' })
  })

  it('reverts a refused prompt back to pending so a later resume can try again', async () => {
    const { store, dir } = await fresh()
    store.pause('matter:1')
    const item = store.enqueue('matter:1', '会回来的')
    let failNext = true
    const channel = createSessionChannel(
      async (endpoint) => {
        if (endpoint === 'session/create') return { ok: true, result: { sessionId: 'session-1' } }
        if (endpoint === 'session/prompt') return failNext ? { ok: false, code: 'bridge-prompt-refused' } : { ok: true, result: { accepted: true } }
        return { ok: true, result: { accepted: true } }
      },
      {
        bindingsFile: join(dir, 'sessions', 'bindings.json'),
        now: () => 't', nextId: () => 'id', pending: store,
        streamCall: async () => ({ ok: false, code: 'no-queue' }),
      },
    )
    const first = await channel.resume({ matterRef: 'matter:1', workspaceRoot: '/w' })
    expect(first).toMatchObject({ state: 'refused', code: 'bridge-prompt-refused' })
    // The prompt never left: the item is back to pending (not stuck dispatching, not submitted).
    expect(store.snapshot('matter:1').items[0]).toMatchObject({ state: 'pending', text: '会回来的' })
    failNext = false
    const second = await channel.resume({ matterRef: 'matter:1', workspaceRoot: '/w' })
    expect(second).toMatchObject({ state: 'resumed', dispatched: [item.itemId] })
  })

  it('versions every mutation monotonically (the queue-accounting revision)', async () => {
    const { store } = await fresh()
    const start = store.snapshot('m').revision
    const item = store.enqueue('m', 'A')
    const afterEnqueue = store.snapshot('m').revision
    expect(afterEnqueue).toBeGreaterThan(start)
    store.pause('m')
    store.resume('m')
    store.beginDispatch('m', item.itemId)
    expect(store.snapshot('m').items[0]?.state).toBe('dispatching')
    expect(store.edit('m', item.itemId, 'x')).toEqual({ ok: false, code: 'item-frozen' })
    store.revertDispatch('m', item.itemId)
    expect(store.snapshot('m').items[0]?.state).toBe('pending')
    store.markSubmitted('m', item.itemId, 'req-1')
    store.foldQueue('m', [{ queueItemId: 'q1', requestId: 'req-1' }])
    const final = store.snapshot('m')
    expect(final.revision).toBeGreaterThan(afterEnqueue + 4)
    expect(final.items[0]).toMatchObject({ state: 'submitted', queueItemId: 'q1' })
  })
})
