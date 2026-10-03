import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createPendingInputs } from '../src/main/pending-inputs.js'
import { createSessionChannel } from '../src/main/session-channel.js'

/**
 * Ticket 006 (US-014~019, 022/023).
 *
 * The acceptance lines that live here: nothing enters the inbox while paused, the race between
 * cancel and a consumed occurrence is reported honestly (never re-queued), a resume dispatches in
 * order, and a restart does not resume anything by itself.
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
  const dir = await mkdtemp(join(tmpdir(), 'sage-pending-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  let counter = 0
  const store = createPendingInputs({
    pendingDir: dir,
    now: () => '2026-10-02T12:00:00.000Z',
    nextId: () => `id-${String(++counter)}`,
    randomKey: () => randomBytes(32),
  })
  return { store, dir }
}

describe('the pending store', () => {
  it('keeps items per matter, sealed at rest, with only pending ones editable', async () => {
    const { store, dir } = await fresh()
    const item = store.enqueue('receipt:1', '待继续的第一句')
    store.pause('receipt:1')
    let snapshot = store.snapshot('receipt:1')
    expect(snapshot.paused).toBe(true)
    expect(snapshot.editable).toEqual([item.itemId])

    // The text is not on disk in the clear.
    const { readdirSync } = await import('node:fs')
    const files = readdirSync(dir).filter((name) => name.endsWith('.pending'))
    expect(files).toHaveLength(1)
    expect(readFileSync(join(dir, files[0]!), 'utf8')).not.toContain('待继续的第一句')

    store.markSubmitted('receipt:1', item.itemId, 'req-1')
    snapshot = store.snapshot('receipt:1')
    expect(snapshot.editable).toEqual([])
    expect(store.edit('receipt:1', item.itemId, '改写')).toEqual({ ok: false, code: 'item-frozen' })
    expect(store.remove('receipt:1', item.itemId)).toEqual({ ok: false, code: 'item-frozen' })
    // The frozen item's text is untouched by a refused edit.
    expect(store.snapshot('receipt:1').items[0]?.text).toBe('待继续的第一句')
  })

  it('folds a queue snapshot: present stays submitted, absent becomes consumed', async () => {
    const { store } = await fresh()
    const kept = store.enqueue('m', 'A')
    const taken = store.enqueue('m', 'B')
    store.markSubmitted('m', kept.itemId, 'req-A')
    store.markSubmitted('m', taken.itemId, 'req-B')
    const snapshot = store.foldQueue('m', [{ queueItemId: 'qi-A', requestId: 'req-A' }])
    expect(snapshot.items.map((item) => item.state)).toEqual(['submitted', 'consumed'])
    expect(snapshot.items[1]?.note).toBe('consumed-by-race')
  })

  it('returns a drained item to pending with its provenance, and keeps the text', async () => {
    const { store } = await fresh()
    const item = store.enqueue('m', '会回来的')
    store.markSubmitted('m', item.itemId, 'req-1')
    const snapshot = store.returnToPending('m', item.itemId, 'drained-at-stop')
    expect(snapshot.items[0]).toMatchObject({ state: 'pending', note: 'drained-at-stop', text: '会回来的' })
    expect(snapshot.editable).toEqual([item.itemId])
  })
})

describe('stop: cancel, drain, and report the race honestly', () => {
  async function channelWith(answers: Record<string, unknown>, controlQueues: readonly unknown[][] = []) {
    const { store, dir } = await fresh()
    const calls: string[] = []
    let controlIndex = 0
    let ids = 0
    const channel = createSessionChannel(
      async (endpoint, payload = []) => {
        calls.push(`${endpoint}:${JSON.stringify(payload)}`)
        return answers[endpoint]
      },
      {
        bindingsFile: join(dir, 'sessions', 'bindings.json'),
        now: () => '2026-10-02T12:00:00.000Z',
        nextId: () => `id-${String(++ids)}`,
        pending: store,
        streamCall: async (endpoint, payload, onFrame) => {
          calls.push(endpoint)
          if (endpoint === 'session/control') {
            const queues = controlQueues[Math.min(controlIndex, controlQueues.length - 1)] ?? []
            controlIndex += 1
            onFrame({ type: 'baseline', value: { queues: { 'session-1': queues }, jobs: {}, projections: {} } })
            return { ok: true, result: { frames: 1 } }
          }
          return answers[endpoint]
        },
      },
    )
    return { channel, store, calls }
  }

  it('never lets a paused send reach the inbox: it is stored as a pending item', async () => {
    const { channel, store, calls } = await channelWith({})
    store.pause('receipt:1')
    const outcome = await channel.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '暂停期间的输入' })
    expect(outcome).toMatchObject({ state: 'deferred' })
    expect(calls).toEqual([])
    expect(store.snapshot('receipt:1').items[0]).toMatchObject({ text: '暂停期间的输入', state: 'pending' })
  })

  it('refuses an attachment-bearing send while paused instead of splitting text and receipt (014)', async () => {
    const { channel, store, calls } = await channelWith({})
    store.pause('receipt:1')
    const outcome = await channel.send({
      matterRef: 'receipt:1',
      workspaceRoot: '/a',
      text: '带附件的一条',
      attachments: [{ receiptId: 'receipt-u-1', attachmentId: 'sha-1', name: 'a.bin', bytes: 1 }],
    })
    // The receipt lives exactly as long as this run; a pending text item outlives it. Splitting
    // them apart would promise a pairing the record cannot keep — so the send is refused whole.
    expect(outcome).toEqual({ state: 'refused', code: 'session-paused-attachments' })
    expect(calls).toEqual([])
    expect(store.snapshot('receipt:1').items).toEqual([])
  })

  it('drains what the queue still holds, and freezes what the race already consumed', async () => {
    // The race, made visible: A was still queued at cancel time; B was already taken by a turn
    // that started between cancel and our snapshot.
    const queues: unknown[][] = [[]]
    const { channel, store, calls } = await channelWith(
      { 'session/create': { ok: true, result: { sessionId: 'session-1' } }, 'session/prompt': { ok: true, result: { accepted: true } }, 'session/cancel': { ok: true, result: { accepted: true } }, 'session/queue-remove': { ok: true, result: { accepted: true } } },
      queues,
    )
    // A previous resume dispatched both; the queue still held A when the race took B.
    store.pause('receipt:1')
    await channel.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: 'A' })
    await channel.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: 'B' })
    const resumed = await channel.resume({ matterRef: 'receipt:1', workspaceRoot: '/a' })
    expect(resumed.state).toBe('resumed')
    const items = store.snapshot('receipt:1').items
    // Both sends must have become pending items and both must have been dispatched by the resume;
    // a missing one fails here by name instead of crashing on the next line.
    expect(items.map((item) => item.text)).toEqual(['A', 'B'])
    expect(items.every((item) => item.state === 'submitted')).toBe(true)
    const a = items.find((item) => item.text === 'A')
    const b = items.find((item) => item.text === 'B')
    expect(a?.requestId).toBeDefined()
    expect(b?.requestId).toBeDefined()
    if (a === undefined || b === undefined) return
    // Only A is still in the base's queue at stop time.
    queues[0] = [{ id: 'qi-A', rpcId: a.requestId }]

    const outcome = await channel.stop({ matterRef: 'receipt:1' })
    expect(outcome.state).toBe('stopped')
    expect(outcome.paused).toBe(true)
    expect(outcome.drained).toEqual([a.itemId])
    expect(outcome.consumed).toEqual([b.itemId])
    const after = store.snapshot('receipt:1')
    expect(after.items.find((item) => item.itemId === a.itemId)).toMatchObject({ state: 'pending', note: 'drained-at-stop' })
    // The consumed one is frozen — it is not offered back as something to resend.
    expect(after.items.find((item) => item.itemId === b.itemId)).toMatchObject({ state: 'consumed', note: 'consumed-by-race' })
    expect(after.editable).toEqual([a.itemId])
    expect(calls.some((call) => call.startsWith('session/queue-remove'))).toBe(true)
    // And nothing was re-sent while stopping: the two prompts are the ones resume made.
    expect(calls.filter((call) => call.startsWith('session/prompt'))).toHaveLength(2)
    // And nothing was re-sent while stopping.
    expect(calls.filter((call) => call.startsWith('session/prompt'))).toHaveLength(2)
  })

  it('says it could not drain when no queue snapshot is available, instead of pretending', async () => {
    const { store } = await fresh()
    const channel = createSessionChannel(async () => ({ ok: false, code: 'bridge-provider-failed' }), {
      bindingsFile: join(dirOf(store), 'sessions', 'bindings.json'),
      now: () => 'x',
      nextId: () => 'id',
      pending: store,
      streamCall: async () => ({ ok: false, code: 'bridge-stream-closed' }),
    })
    store.pause('receipt:1')
    const outcome = await channel.stop({ matterRef: 'receipt:1' })
    expect(outcome).toMatchObject({ state: 'stopped', paused: true, drained: [], consumed: [] })
  })

  function dirOf(_store: unknown): string {
    // The channel above never reaches the bindings file: it answers every call with a refusal.
    return join(tmpdir(), `sage-pending-unused-${String(Date.now())}`)
  }
})

describe('resume: the only path that dispatches, and it goes in order', () => {
  it('dispatches pending items in order and marks them submitted', async () => {
    const { store, dir } = await fresh()
    const calls: string[] = []
    const channel = createSessionChannel(async (endpoint, payload = []) => {
      calls.push(`${endpoint}:${JSON.stringify(payload)}`)
      if (endpoint === 'session/create') return { ok: true, result: { sessionId: 'session-1' } }
      return { ok: true, result: { accepted: true } }
    }, {
      bindingsFile: join(dir, 'sessions', 'bindings.json'),
      now: () => '2026-10-02T12:00:00.000Z',
      nextId: () => `id-${String(calls.length)}`,
      pending: store,
      streamCall: async () => ({ ok: true, result: { frames: 0 } }),
    })
    store.pause('receipt:1')
    await channel.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '第一句' })
    await channel.send({ matterRef: 'receipt:1', workspaceRoot: '/a', text: '第二句' })
    expect(store.snapshot('receipt:1').items).toHaveLength(2)

    const outcome = await channel.resume({ matterRef: 'receipt:1', workspaceRoot: '/a' })
    expect(outcome).toMatchObject({ state: 'resumed', paused: false })
    expect(outcome.dispatched).toHaveLength(2)
    const prompts = calls.filter((call) => call.startsWith('session/prompt'))
    expect(prompts[0]).toContain('第一句')
    expect(prompts[1]).toContain('第二句')
    expect(store.snapshot('receipt:1').items.every((item) => item.state === 'submitted')).toBe(true)
  })

  it('does not resume anything by itself after a restart', async () => {
    const { store, dir } = await fresh()
    store.pause('receipt:1')
    store.enqueue('receipt:1', '重启前留下的')
    const calls: string[] = []
    // A brand-new process (fresh channel over the same files) must not dispatch merely by existing.
    const restarted = createSessionChannel(async (endpoint) => {
      calls.push(endpoint)
      return { ok: true, result: {} }
    }, {
      bindingsFile: join(dir, 'sessions', 'bindings.json'),
      now: () => 'x',
      nextId: () => 'id',
      pending: store,
      streamCall: async () => ({ ok: true, result: { frames: 0 } }),
    })
    await restarted.read({ matterRef: 'receipt:1' })
    expect(calls).toEqual([])
    expect(store.isPaused('receipt:1')).toBe(true)
    expect(store.snapshot('receipt:1').items[0]?.state).toBe('pending')
  })
})
