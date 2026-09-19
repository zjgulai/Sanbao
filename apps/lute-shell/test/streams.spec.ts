import { describe, expect, it, vi } from 'vitest'
import { REMOTE_STREAM_PATH, createRemoteStreamHandler } from '../src/host/streams.js'

function contextWith(gateway: unknown): never {
  return { get: (name: string) => (name === 'typertGateway' ? gateway : undefined) } as never
}

function post(body: unknown): Request {
  return new Request(`dsh-app://app${REMOTE_STREAM_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('remote stream handler', () => {
  it('bridges gateway wire values into NDJSON', async () => {
    const open = vi.fn(async function* () {
      yield { seq: 1 }
      yield { seq: 2 }
    })
    const response = await createRemoteStreamHandler(contextWith({ wireStream: { open } }))
      .fetch(post({ endpoint: 'session.events', payload: { id: 's1' } }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/x-ndjson')
    expect(await response.text()).toBe('{"seq":1}\n{"seq":2}\n')
    expect(open).toHaveBeenCalledWith('session.events', { id: 's1' }, expect.any(AbortSignal))
  })

  it('returns 503 without a gateway', async () => {
    const response = await createRemoteStreamHandler(contextWith(undefined)).fetch(post({ endpoint: 'x' }))
    expect(response.status).toBe(503)
  })

  it('returns 405 on GET and 400 on a malformed body', async () => {
    const handler = createRemoteStreamHandler(contextWith({ wireStream: { open: vi.fn() } }))
    expect((await handler.fetch(new Request(`dsh-app://app${REMOTE_STREAM_PATH}`))).status).toBe(405)
    expect((await handler.fetch(post({ payload: 1 }))).status).toBe(400)
    expect((await handler.fetch(new Request(`dsh-app://app${REMOTE_STREAM_PATH}`, {
      method: 'POST',
      body: 'not json',
    }))).status).toBe(400)
  })

  it('surfaces a gateway failure as a stream error', async () => {
    const open = vi.fn(async function* () {
      yield { seq: 1 }
      throw new Error('gateway exploded')
    })
    const response = await createRemoteStreamHandler(contextWith({ wireStream: { open } }))
      .fetch(post({ endpoint: 'session.events', payload: {} }))
    await expect(response.text()).rejects.toThrow(/gateway exploded/u)
  })

  it('declares a buffered request body mode', () => {
    expect(createRemoteStreamHandler(contextWith(undefined)).requestBodyMode()).toBe('buffered')
  })
})
