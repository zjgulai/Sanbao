import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyDesktopState, readDesktopState } from '../src/product/app/desktop/client.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'

const denial = { code: 'projection-read-unavailable', stage: 'read-policy', retryable: true, correlation: 'request-1' }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('desktop service response classification', () => {
  it('treats a successful HTTP denial as blocked, not an empty or ready projection', () => {
    expect(classifyDesktopState(denial)).toEqual({ kind: 'blocked', code: 'projection-read-unavailable' })
  })

  it('does not forward unknown codes, exception messages or paths to the page', () => {
    for (const input of [null, [], {}, { code: '/private/config' }, { code: 'projection-read-unavailable' }]) {
      expect(classifyDesktopState(input)).toEqual({ kind: 'unavailable' })
    }
  })

  it('does not promote a fixture or loose runtime object to live service facts', () => {
    expect(classifyDesktopState({ runtime: { status: 'ready', message: 'secret', retryable: false } })).toEqual({ kind: 'unavailable' })
    expect(classifyDesktopState({ service: { status: 'unavailable' }, matter: { source: 'fixture' }, runtime: { status: 'ready', message: 'secret', retryable: false } })).toEqual({ kind: 'unavailable' })
  })

  it('reads sanitized runtime facts from the actual service envelope, without claiming task availability', async () => {
    const providers = createUnavailableFirstService({ status: 'ready', message: 'private-runtime-canary', retryable: true })
    const payload = await providers.readState().then(response => response.json())
    const result = classifyDesktopState(payload)
    expect(result).toEqual({ kind: 'read', runtime: { status: 'ready', message: '运行时已连接；不代表任务执行已获授权。', retryable: true } })
    expect(JSON.stringify(result)).not.toContain('private-runtime-canary')
  })

  it('consumes the production route denial without reading protected projection providers', async () => {
    const workspaceList = vi.fn()
    const providers = createUnavailableFirstService(null, { workspaceList })
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => handleSageServiceRequest(
      new Request(`dsh-app://app${url}`, init),
      { callerBinding: { correlation: 'desktop-read' }, providers },
    ))
    expect(await readDesktopState()).toEqual({ kind: 'blocked', code: 'projection-read-unavailable' })
    expect(workspaceList).not.toHaveBeenCalled()
  })

  it('rejects malformed runtime data even when the service envelope exists', async () => {
    const providers = createUnavailableFirstService({ status: 'ready', message: 'ready', retryable: true })
    const payload = await providers.readState().then(response => response.json())
    expect(classifyDesktopState({ ...payload, runtime: { status: 'ready', message: 42, retryable: true } })).toEqual({ kind: 'unavailable' })
    expect(classifyDesktopState({ ...payload, runtime: { status: 'invented', message: 'ready', retryable: true } })).toEqual({ kind: 'unavailable' })
    expect(classifyDesktopState({ ...payload, matter: { projectionSource: 'fixture' } })).toEqual({ kind: 'unavailable' })
  })

  it('performs only the same-origin state read and returns its real denial', async () => {
    const requests: Array<{ url: string; method: string; cache: RequestCache | undefined }> = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      requests.push({ url, method: init.method ?? 'GET', cache: init.cache })
      return Response.json(denial)
    })
    expect(await readDesktopState()).toEqual({ kind: 'blocked', code: 'projection-read-unavailable' })
    expect(requests).toEqual([{ url: '/.sage/state', method: 'GET', cache: 'no-store' }])
  })

  it('does not parse a denied transport body or display its content', async () => {
    vi.stubGlobal('fetch', async () => new Response('private data', { status: 403 }))
    expect(await readDesktopState()).toEqual({ kind: 'unavailable' })
  })

  it('receives successful runtime facts through the actual fetch consumer', async () => {
    const providers = createUnavailableFirstService({ status: 'recovering', message: 'private-canary', retryable: true })
    vi.stubGlobal('fetch', () => providers.readState())
    expect(await readDesktopState()).toEqual({ kind: 'read', runtime: { status: 'recovering', message: '运行时正在恢复。', retryable: true } })
  })

  it.each(['headers', 'body'] as const)('settles a stalled %s read at the request deadline without retrying', async phase => {
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    let attempts = 0
    let bodyStarted = false
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      attempts += 1
      const signal = init.signal!
      if (phase === 'headers') {
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      }
      return new Response(new ReadableStream({
        start(stream) {
          bodyStarted = true
          signal.addEventListener('abort', () => stream.error(signal.reason), { once: true })
        },
      }), { headers: { 'content-type': 'application/json' } })
    })
    const pending = readDesktopState()
    await Promise.resolve()
    expect(timeout).toHaveBeenCalledWith(5000)
    if (phase === 'body') expect(bodyStarted).toBe(true)
    controller.abort(new DOMException('private timeout context', 'TimeoutError'))
    expect(await pending).toEqual({ kind: 'unavailable' })
    expect(attempts).toBe(1)
  })

  it('keeps invalid JSON and connection failures unavailable without retries', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html>error</html>', { status: 200 }))
    expect(await readDesktopState()).toEqual({ kind: 'unavailable' })
    let calls = 0
    vi.stubGlobal('fetch', async () => { calls += 1; throw new Error('private connection detail') })
    expect(await readDesktopState()).toEqual({ kind: 'unavailable' })
    expect(calls).toBe(1)
  })
})
