import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyBootstrapState, classifyDesktopState, readDesktopBootstrapState, readDesktopState } from '../src/product/app/desktop/client.js'
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
    expect(result).toEqual({
      kind: 'read',
      runtime: { status: 'ready', message: '运行时已连接；不代表任务执行已获授权。', retryable: true },
      activeContext: { state: 'unavailable', contextGeneration: null },
      workspaces: { state: 'unavailable', reason: 'not-read', entries: [], order: [], archivedSessions: 0, frames: 0, unapplied: 0 },
      matterLinks: { state: 'unavailable', links: [] },
    })
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
    expect(await readDesktopState()).toEqual({
      kind: 'read',
      runtime: { status: 'recovering', message: '运行时正在恢复。', retryable: true },
      activeContext: { state: 'unavailable', contextGeneration: null },
      workspaces: { state: 'unavailable', reason: 'not-read', entries: [], order: [], archivedSessions: 0, frames: 0, unapplied: 0 },
      matterLinks: { state: 'unavailable', links: [] },
    })
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

describe('T03 workspace projection slot parsing', () => {
  const entry = { workspaceId: 'w1', path: '/controlled/w1', title: '一号工作区', sessionCount: 2, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }
  const validWorkspaces = {
    source: 'workspace-follow', state: 'read', reason: null, entries: [entry], order: ['w1'],
    archivedSessions: 1, frames: 3, unapplied: 0,
  }
  const validMatterLinks = {
    state: 'read',
    links: [{ matterRef: 'm1', workspaceRef: 'w1', workspacePath: '/controlled/w1', linkedAt: '2026-01-01T00:00:00Z', isDefault: true }],
    trail: [{ linkId: 'l1', at: '2026-01-01T00:00:00Z', action: 'linked', matterRef: 'm1', workspaceRef: 'w1', actorRef: 'actor:one' }],
  }
  const validActiveContext = { state: 'active', contextGeneration: 1, matterId: 'm1', revisionId: 'r1', workspaceRef: 'w1', frameGeneration: 2 }
  const readPayload = (slots: Record<string, unknown> = {}): unknown => ({
    service: { status: 'unavailable', reason: 'authenticated', correlation: 'c1', auth: { status: 'signed-in', displayName: null }, command: null },
    matter: null,
    runtime: { status: 'ready', message: 'ready', retryable: false },
    ...slots,
  })

  it('carries the three optional slots only after strict per-slot validation', () => {
    expect(classifyDesktopState(readPayload({
      workspaces: validWorkspaces, matterLinks: validMatterLinks, activeContext: validActiveContext,
    }))).toEqual({
      kind: 'read',
      runtime: { status: 'ready', message: '运行时已连接；不代表任务执行已获授权。', retryable: false },
      workspaces: { state: 'read', reason: null, entries: [entry], order: ['w1'], archivedSessions: 1, frames: 3, unapplied: 0 },
      matterLinks: { state: 'read', links: [validMatterLinks.links[0]] },
      activeContext: validActiveContext,
    })
  })

  it.each([
    ['workspaces wrong source', 'workspaces', { ...validWorkspaces, source: 'other' }],
    ['workspaces wrong state enum', 'workspaces', { ...validWorkspaces, state: 'invented' }],
    ['workspaces unknown reason', 'workspaces', { ...validWorkspaces, reason: 'made-up' }],
    ['workspaces entry field type', 'workspaces', { ...validWorkspaces, entries: [{ ...entry, sessionCount: '2' }] }],
    ['workspaces order type', 'workspaces', { ...validWorkspaces, order: 'w1' }],
    ['workspaces counter type', 'workspaces', { ...validWorkspaces, frames: 1.5 }],
    ['matterLinks wrong state enum', 'matterLinks', { ...validMatterLinks, state: 'pending' }],
    ['matterLinks links type', 'matterLinks', { ...validMatterLinks, links: {} }],
    ['matterLinks link field type', 'matterLinks', { ...validMatterLinks, links: [{ ...validMatterLinks.links[0], isDefault: 'yes' }] }],
    ['matterLinks trail action', 'matterLinks', { ...validMatterLinks, trail: [{ ...validMatterLinks.trail[0], action: 'invented' }] }],
    ['activeContext missing active field', 'activeContext', { ...validActiveContext, matterId: '' }],
    ['activeContext active with null generation', 'activeContext', { ...validActiveContext, contextGeneration: null }],
    ['activeContext unavailable with number', 'activeContext', { state: 'unavailable', contextGeneration: 4 }],
    ['activeContext inactive with null', 'activeContext', { state: 'inactive', contextGeneration: null }],
  ])('omits a malformed %s slot without failing the whole read', (_label, key, slot) => {
    const result = classifyDesktopState(readPayload({
      workspaces: validWorkspaces, matterLinks: validMatterLinks, activeContext: validActiveContext, [key]: slot,
    }))
    expect(result.kind).toBe('read')
    expect(result.kind === 'read' && key in result).toBe(false)
  })

  it('keeps the blocked classification ahead of any slot content', () => {
    expect(classifyDesktopState({ ...denial, workspaces: validWorkspaces, matterLinks: validMatterLinks, activeContext: validActiveContext }))
      .toEqual({ kind: 'blocked', code: 'projection-read-unavailable' })
  })
})

describe('T02 local-system bootstrap classification', () => {
  it('classifies the assembled bootstrap DTO into the closed desktop shape', async () => {
    const providers = createUnavailableFirstService(null, {
      bootstrapRead: async () => Response.json({ runtime: { status: 'ready' }, auth: { status: 'signed-out' }, display: { theme: 'system', density: 'comfortable' } }),
    })
    const payload = await providers.bootstrapRead().then(response => response.json())
    expect(classifyBootstrapState(payload)).toEqual({
      kind: 'read',
      state: { runtime: 'ready', auth: 'signed-out', theme: 'system', density: 'comfortable' },
    })
  })

  it('fails to unavailable for the stable denial, unknown keys and malformed enums', () => {
    expect(classifyBootstrapState({ code: 'bootstrap-unavailable', stage: 'local-system', retryable: true, correlation: 'x' }))
      .toEqual({ kind: 'unavailable', code: 'bootstrap-unavailable' })
    const valid = { runtime: { status: 'ready' }, auth: { status: 'signed-in' }, display: { theme: 'light', density: 'compact' } }
    expect(classifyBootstrapState(valid)).toMatchObject({ kind: 'read' })
    expect(classifyBootstrapState({ ...valid, extra: 1 })).toEqual({ kind: 'unavailable', code: null })
    expect(classifyBootstrapState({ ...valid, auth: { status: 'signed-in', displayName: 'canary-name' } })).toEqual({ kind: 'unavailable', code: null })
    expect(classifyBootstrapState({ ...valid, display: { theme: 'neon', density: 'compact' } })).toEqual({ kind: 'unavailable', code: null })
    expect(classifyBootstrapState(null)).toEqual({ kind: 'unavailable', code: null })
  })

  it('reads the bootstrap path with GET and stays unavailable on transport failure', async () => {
    const fetcher = vi.fn(async () => Response.json({ runtime: { status: 'recovering' }, auth: { status: 'pending' }, display: { theme: 'dark', density: 'comfortable' } }))
    vi.stubGlobal('fetch', fetcher)
    expect(await readDesktopBootstrapState()).toEqual({
      kind: 'read',
      state: { runtime: 'recovering', auth: 'pending', theme: 'dark', density: 'comfortable' },
    })
    expect(fetcher.mock.calls[0]?.[0]).toBe('/.sage/bootstrap')
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).method).toBe('GET')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('private bootstrap path') }))
    const failed = await readDesktopBootstrapState()
    expect(failed).toEqual({ kind: 'unavailable', code: null })
    expect(JSON.stringify(failed)).not.toContain('private bootstrap path')
  })
})
