import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createPendingInputs } from '../src/main/pending-inputs.js'
import { createSessionChannel } from '../src/main/session-channel.js'

/**
 * Ticket 008 (US-025~030): the in-session queue.
 *
 * Send mode (queue vs steer) rides the declared prompt contract; the queue projection is the
 * base's authoritative snapshot (placements + bounded previews, never local echoes); item
 * edit/remove keep `queue-item-not-found` as the consumption race's honest name; and a paused
 * session dispatches nothing (the steer send defers like any other).
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
  const dir = await mkdtemp(join(tmpdir(), 'sage-queue-'))
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

function channelWith(store: Awaited<ReturnType<typeof fresh>>['store'], dir: string, options: {
  readonly answers?: Record<string, unknown>
  readonly queue?: unknown[]
  readonly queueFails?: boolean
} = {}) {
  const calls: Array<{ endpoint: string, payload: unknown }> = []
  let ids = 0
  const channel = createSessionChannel(
    async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      const canned = options.answers?.[endpoint]
      if (canned !== undefined) return canned
      if (endpoint === 'session/create') return { ok: true, result: { sessionId: 'session-1' } }
      if (endpoint === 'session/prompt') return { ok: true, result: { accepted: true } }
      return { ok: true, result: { accepted: true } }
    },
    {
      bindingsFile: join(dir, 'sessions', 'bindings.json'),
      now: () => '2026-10-03T12:00:00.000Z',
      nextId: () => `id-${String(++ids)}`,
      pending: store,
      streamCall: async (endpoint, _payload, onFrame) => {
        calls.push({ endpoint, payload: [] })
        if (endpoint === 'session/control') {
          if (options.queueFails === true) return { ok: false, code: 'bridge-stream-closed' }
          onFrame({ type: 'baseline', value: { queues: { 'session-1': options.queue ?? [] }, jobs: {}, projections: {} } })
          return { ok: true, result: { frames: 1 } }
        }
        return { ok: false, code: 'bridge-stream-closed' }
      },
    },
  )
  return { channel, calls }
}

describe('send modes (US-025/026)', () => {
  it('carries steer exactly when chosen and keeps the ack wording ack-only', async () => {
    const { store, dir } = await fresh()
    const { channel, calls } = channelWith(store, dir)
    const accepted = await channel.send({ matterRef: 'm', workspaceRoot: '/w', text: '插一步', mode: 'steer' })
    expect(accepted).toMatchObject({ state: 'accepted', mode: 'steer' })
    const prompt = calls.find((call) => call.endpoint === 'session/prompt')
    expect(prompt?.payload).toEqual([{ requestId: expect.any(String), sessionId: 'session-1', mode: 'steer', text: '插一步' }])

    const queued = await channel.send({ matterRef: 'm', workspaceRoot: '/w', text: '排队一条' })
    expect(queued).toMatchObject({ state: 'accepted', mode: 'queue' })
    const prompts = calls.filter((call) => call.endpoint === 'session/prompt')
    expect((prompts[1]?.payload as Array<Record<string, unknown>>)[0]?.mode).toBe('queue')
  })

  it('a steer send during pause still only registers (no bridge traffic at all)', async () => {
    const { store, dir } = await fresh()
    const { channel, calls } = channelWith(store, dir)
    store.pause('m')
    const outcome = await channel.send({ matterRef: 'm', workspaceRoot: '/w', text: '暂停时的转向', mode: 'steer' })
    expect(outcome.state).toBe('deferred')
    expect(calls).toEqual([])
  })
})

describe('the authoritative queue projection (US-028)', () => {
  it('projects placements and bounded previews straight from the snapshot, never from local echoes', async () => {
    const { store, dir } = await fresh()
    const queue = [
      { id: 'q-1', placement: 'queued', rpcId: 'req-1', message: { id: 'q-1', content: [{ type: 'text', text: '排队的这条' }] } },
      { id: 'q-2', placement: 'steering', message: { id: 'q-2', content: [{ type: 'text', text: 'x'.repeat(300) }] } },
      { id: 'q-3', placement: 'context', message: { id: 'q-3', content: [{ type: 'text', text: '上下文提示' }] } },
    ]
    const { channel } = channelWith(store, dir, { queue })
    await channel.send({ matterRef: 'm', workspaceRoot: '/w', text: '先建会话' })
    const read = await channel.read({ matterRef: 'm' })
    expect(read.queue.state).toBe('read')
    expect(read.queue.occurrences.map((entry) => entry.position)).toEqual(['queued', 'steering', 'context'])
    expect(read.queue.occurrences[0]).toMatchObject({ queueItemId: 'q-1', requestId: 'req-1', preview: '排队的这条' })
    // Preview is bounded; the whole message never crosses the projection.
    expect(read.queue.occurrences[1]?.preview.length).toBe(140)

    const broken = channelWith(store, dir, { queueFails: true })
    const readBroken = await broken.channel.read({ matterRef: 'm' })
    expect(readBroken.queue).toEqual({ state: 'unavailable', occurrences: [] })
  })
})

describe('queue item edit/remove (US-027)', () => {
  it('edits and removes over the declared payloads, mapping the consumption race honestly', async () => {
    const { store, dir } = await fresh()
    const { channel, calls } = channelWith(store, dir)
    await channel.send({ matterRef: 'm', workspaceRoot: '/w', text: '先建会话' })
    expect(await channel.queueItem({ matterRef: 'm', itemId: 'q-1', action: 'edit', text: '  改后的文本  ' })).toEqual({ state: 'ok' })
    expect(calls.filter((call) => call.endpoint === 'session/queue-edit').map((call) => call.payload)).toEqual([
      [{ sessionId: 'session-1', itemId: 'q-1', text: '改后的文本' }],
    ])
    expect(await channel.queueItem({ matterRef: 'm', itemId: 'q-1', action: 'remove' })).toEqual({ state: 'ok' })
    expect(calls.filter((call) => call.endpoint === 'session/queue-remove').map((call) => call.payload)).toEqual([
      [{ sessionId: 'session-1', itemId: 'q-1' }],
    ])

    // The base's own name for "already taken": `session/queue-item-not-found` → the surface code.
    const gone = channelWith(store, dir, { answers: { 'session/queue-remove': { ok: false, code: 'bridge-queue-item-not-found' } } })
    expect(await gone.channel.queueItem({ matterRef: 'm', itemId: 'q-9', action: 'remove' })).toEqual({ state: 'refused', code: 'queue-item-not-found' })

    // Guards: no session and empty edit are their own refusals.
    const bare = await fresh()
    const bareChannel = channelWith(bare.store, bare.dir)
    expect(await bareChannel.channel.queueItem({ matterRef: 'm', itemId: 'q-1', action: 'remove' })).toEqual({ state: 'refused', code: 'queue-no-session' })
    await bareChannel.channel.send({ matterRef: 'm', workspaceRoot: '/w', text: 'x' })
    expect(await bareChannel.channel.queueItem({ matterRef: 'm', itemId: 'q-1', action: 'edit', text: '   ' })).toEqual({ state: 'refused', code: 'queue-edit-invalid' })
  })
})

describe('the queue route (US-025/027/030)', () => {
  const routeHarness = (overrides: Record<string, unknown> = {}) => {
    const seen: unknown[] = []
    const providers = createUnavailableFirstService(null, {
      queueItemUpdate: (request) => { seen.push(request); return { state: 'ok' } },
      ...overrides,
    })
    const post = (path: string, body: unknown) => handleSageServiceRequest(
      new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-008' }, providers } as never,
    )
    return { post, seen }
  }

  it('parses exactly and forwards edit/remove; bad bodies are 400 and a missing port stays honest', async () => {
    const h = routeHarness()
    expect(await (await h.post('/.sage/session/queue', { action: 'edit', itemId: 'q-1', text: '新文本' })).json()).toEqual({ state: 'ok' })
    expect(await (await h.post('/.sage/session/queue', { action: 'remove', itemId: 'q-1' })).json()).toEqual({ state: 'ok' })
    expect(h.seen).toEqual([
      { action: 'edit', itemId: 'q-1', text: '新文本' },
      { action: 'remove', itemId: 'q-1' },
    ])
    expect((await h.post('/.sage/session/queue', { action: 'edit', itemId: 'q-1', text: '' })).status).toBe(400)
    expect((await h.post('/.sage/session/queue', { action: 'remove', itemId: 'q-1', extra: 1 })).status).toBe(400)
    expect((await h.post('/.sage/session/queue', { action: 'steer', itemId: 'q-1' })).status).toBe(400)

    const unwired = routeHarness({ queueItemUpdate: undefined })
    expect(await (await unwired.post('/.sage/session/queue', { action: 'remove', itemId: 'q-1' })).json())
      .toEqual({ state: 'refused', code: 'queue-store-unavailable' })
  })

  it('accepts the steer send body and rejects an unknown mode', async () => {
    const providers = createUnavailableFirstService(null, {
      sessionSend: async (request: { readonly mode?: string }) => ({ state: 'accepted', sessionId: 's', requestId: 'r', mode: request.mode === 'steer' ? 'steer' as const : 'queue' as const }),
    })
    const post = (body: unknown) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-008' }, providers } as never,
    )
    expect(await (await post({ matterRef: 'm', workspaceRoot: '/w', text: 't', mode: 'steer' })).json())
      .toMatchObject({ state: 'accepted', mode: 'steer' })
    expect((await post({ matterRef: 'm', workspaceRoot: '/w', text: 't', mode: 'sprint' })).status).toBe(400)
    expect((await post({ matterRef: 'm', workspaceRoot: '/w', text: 't', mode: 'steer', extra: 1 })).status).toBe(400)
  })
})
