import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createSideChats } from '../src/main/side-chats.js'

/**
 * Ticket 024 (US-102~106): the side-chat store.
 *
 * The load-bearing separation: every prompt a side chat issues targets the CHILD session; the main
 * session appears only as the fork source and the explicit carry-back target; a corrupt record
 * file refuses rather than fabricating history.
 */

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

function store(bridge: (endpoint: string, payload?: readonly unknown[]) => Promise<unknown>, over: Record<string, unknown> = {}) {
  const calls: Array<{ readonly endpoint: string, readonly payload: readonly unknown[] }> = []
  let counter = 0
  const instance = createSideChats({
    callBridge: async (endpoint, payload = []) => { calls.push({ endpoint, payload }); return bridge(endpoint, payload) },
    streamCall: async (endpoint, payload, onFrame) => {
      calls.push({ endpoint, payload })
      onFrame({ type: 'event', event: { type: 'assistant/message', seq: 1, time: 1, data: { message: { content: [{ type: 'text', text: '侧聊答复' }] } } } })
      return { ok: true, result: { frames: 1 } }
    },
    ensureMainSession: async () => ({ ok: true as const, sessionId: 'session-main' }),
    sendToMain: async (matterRef, text) => { calls.push({ endpoint: 'sendToMain', payload: [matterRef, text] }); return { state: 'accepted' as const } },
    isPaused: () => false,
    now: () => '2026-10-02T12:00:00.000Z',
    nextId: () => String(++counter),
    file: join('/tmp', `side-${String(Math.random()).slice(2)}`, 'side-chats.json'),
    ...over,
  } as never)
  return { instance, calls }
}

async function tempStore(bridge: (endpoint: string, payload?: readonly unknown[]) => Promise<unknown>, over: Record<string, unknown> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sage-side-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return store(bridge, { file: join(dir, 'sessions', 'side-chats.json'), ...over })
}

const forkOk = async (endpoint: string) => {
  if (endpoint === 'session/fork') return { ok: true, result: { sessionId: 'session-child-1' } }
  if (endpoint === 'session/prompt') return { ok: true, result: { accepted: true } }
  return { ok: false, code: 'bridge-endpoint-unsupported' }
}

describe('side chats fork the main session and stay separate (US-102~104)', () => {
  it('creates a child from the main session, persists the record, and lists it', async () => {
    const { instance, calls } = await tempStore(forkOk)
    const created = await instance.create('receipt:1')
    expect(created).toMatchObject({ state: 'created', item: { sessionId: 'session-child-1', atSeq: null, execution: 'not-read' } })
    expect(calls[0]).toEqual({ endpoint: 'session/fork', payload: [{ sessionId: 'session-main' }] })
    expect(instance.list('receipt:1').items).toHaveLength(1)
    expect(instance.list('receipt:2').items).toHaveLength(0)
  })

  it('sends only to the child; reads fold the child log; the main session is never prompted', async () => {
    const { instance, calls } = await tempStore(forkOk)
    await instance.create('receipt:1')
    const sideChatId = instance.list('receipt:1').items[0]!.sideChatId
    await expect(instance.send({ sideChatId, text: '侧聊问一句' })).resolves.toMatchObject({ state: 'accepted' })
    const read = await instance.read({ sideChatId })
    expect(read).toMatchObject({ state: 'read' })
    if (read.state !== 'read') throw new Error('read refused')
    expect(read.channel.transcript.map((entry) => [entry.role, entry.text])).toEqual([['user', '侧聊问一句'], ['assistant', '侧聊答复']])
    // Every prompt/read since the fork addressed the child; the main session id only ever appears
    // as the fork source (US-104: no side content enters the main chat on its own).
    const productiveCalls = calls.filter((call) => call.endpoint !== 'sendToMain')
    for (const call of productiveCalls) {
      if (call.endpoint === 'session/fork') continue
      expect((call.payload[0] as { sessionId?: string }).sessionId).toBe('session-child-1')
    }
  })

  it('refuses a paused matter before any call, and propagates the fork refusal honestly', async () => {
    const paused = await tempStore(forkOk, { isPaused: () => true })
    await paused.instance.create('receipt:1')
    const sideChatId = paused.instance.list('receipt:1').items[0]!.sideChatId
    const before = paused.calls.length
    await expect(paused.instance.send({ sideChatId, text: 'x' })).resolves.toEqual({ state: 'refused', code: 'side-chat-paused' })
    expect(paused.calls.length).toBe(before)

    const noTurn = await tempStore(async (endpoint) => (endpoint === 'session/fork' ? { ok: false, code: 'bridge-fork-unavailable' } : { ok: false, code: 'x' }))
    await expect(noTurn.instance.create('receipt:1')).resolves.toEqual({ state: 'refused', code: 'bridge-fork-unavailable' })
  })

  it('carries text back only through the explicit act, via the one main send path (US-105)', async () => {
    const { instance, calls } = await tempStore(forkOk)
    await instance.create('receipt:1')
    const sideChatId = instance.list('receipt:1').items[0]!.sideChatId
    const outcome = await instance.returnToMain({ sideChatId, text: '把这段结论带回' })
    expect(outcome).toMatchObject({ state: 'accepted' })
    expect(calls.find((call) => call.endpoint === 'sendToMain')).toEqual({ endpoint: 'sendToMain', payload: ['receipt:1', '把这段结论带回'] })
    // Nothing about the side chat changed: no side prompt, no fork, no merge.
    expect(calls.some((call) => call.endpoint === 'session/prompt')).toBe(false)
  })

  it('refuses to fabricate anything from a corrupt record file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sage-side-bad-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const file = join(dir, 'side-chats.json')
    const { instance } = store(forkOk, { file })
    await instance.create('receipt:1')
    renameSync(file, `${file}.keep`)
    writeFileSync(file, '{not json')
    const corrupt = store(forkOk, { file })
    expect(corrupt.instance.list('receipt:1')).toMatchObject({ state: 'unavailable', code: 'side-chat-store-unreadable', items: [] })
    await expect(corrupt.instance.create('receipt:1')).resolves.toEqual({ state: 'refused', code: 'side-chat-store-unreadable' })
  })

  it('reloads persisted records after a restart, marked not-read until looked at', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sage-side-reopen-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const file = join(dir, 'side-chats.json')
    const first = store(forkOk, { file })
    await first.instance.create('receipt:1')
    const second = store(forkOk, { file })
    expect(second.instance.list('receipt:1').items[0]).toMatchObject({ sessionId: 'session-child-1', execution: 'not-read' })
    expect(readFileSync(file, 'utf8')).toContain('session-child-1')
  })
})
