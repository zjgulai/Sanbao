import { describe, expect, it, vi } from 'vitest'
import { createSageCapabilityHandler, MAX_SAGE_ACTION_BYTES } from '../src/adapter/handler.js'
import type { SageCapabilityAdapter } from '../src/adapter/contracts.js'
import type { SageViewState } from '../src/product/contracts.js'

const unavailable: SageViewState = {
  status: 'unavailable',
  message: 'Sage 暂时未检测到能力运行时服务，可重新检查。',
  retryable: true,
}

function adapter(): SageCapabilityAdapter & { readonly readState: ReturnType<typeof vi.fn>; readonly retry: ReturnType<typeof vi.fn> } {
  return {
    readState: vi.fn(() => unavailable),
    retry: vi.fn(() => ({ ...unavailable, status: 'recovering', retryable: false })),
  }
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`dsh-app://app${path}`, init)
}

function streamedRequest(path: string, chunks: readonly Uint8Array[]): { readonly request: Request; readonly pulls: () => number } {
  let index = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index++]
      if (chunk === undefined) throw new Error('action body was read after its byte limit')
      controller.enqueue(chunk)
    },
  }, { highWaterMark: 0 })
  return {
    request: new Request(`dsh-app://app${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    duplex: 'half',
    } as RequestInit),
    pulls: () => index,
  }
}

describe('Sage capability handler', () => {
  it('serves only the current typed state without cache', async () => {
    const port = adapter()
    const response = await createSageCapabilityHandler(port).fetch(request('/.sage/state'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual(unavailable)
    expect(port.readState).toHaveBeenCalledOnce()
  })

  it('fences Sage routes to the desktop origin', async () => {
    const port = adapter()
    const handler = createSageCapabilityHandler(port)
    expect((await handler.fetch(new Request('https://untrusted.example/.sage/state'))).status).toBe(403)
    expect((await handler.fetch(request('/.sage/state', { headers: { origin: 'https://untrusted.example' } }))).status).toBe(403)
    expect((await handler.fetch(new Request('dsh-app://app:123/.sage/state'))).status).toBe(403)
    expect((await handler.fetch(new Request('dsh-app://app/.sage/state?unexpected=true'))).status).toBe(403)
    expect(port.readState).not.toHaveBeenCalled()
  })

  it('accepts only the exact retry action', async () => {
    const port = adapter()
    const handler = createSageCapabilityHandler(port)
    const response = await handler.fetch(request('/.sage/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'retry' }),
    }))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toMatchObject({ status: 'recovering' })
    expect(port.retry).toHaveBeenCalledOnce()
  })

  it('rejects unsupported methods, bodies, origins, oversized inputs, and unknown paths', async () => {
    const port = adapter()
    const handler = createSageCapabilityHandler(port)
    expect((await handler.fetch(request('/.sage/state', { method: 'POST' }))).status).toBe(405)
    expect((await handler.fetch(request('/.sage/actions', { method: 'GET' }))).status).toBe(405)
    expect((await handler.fetch(request('/.sage/actions', { method: 'POST', body: '{}' }))).status).toBe(415)
    expect((await handler.fetch(request('/.sage/actions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
    }))).status).toBe(400)
    expect((await handler.fetch(request('/.sage/actions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'retry', extra: true }),
    }))).status).toBe(400)
    expect((await handler.fetch(request('/.sage/actions', {
      method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(MAX_SAGE_ACTION_BYTES + 1) }, body: '{}',
    }))).status).toBe(413)
    const chunked = streamedRequest('/.sage/actions', [
      new TextEncoder().encode('x'.repeat(MAX_SAGE_ACTION_BYTES)),
      new TextEncoder().encode('x'),
    ])
    expect(chunked.request.headers.get('content-length')).toBeNull()
    expect((await handler.fetch(chunked.request)).status).toBe(413)
    expect(chunked.pulls()).toBe(2)
    expect((await handler.fetch(request('/.sage/unknown'))).status).toBe(404)
    expect(port.retry).not.toHaveBeenCalled()
  })
})
