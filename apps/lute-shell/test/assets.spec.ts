import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SHELL_TRANSPORT_SCRIPT, createAssetHandler, resolveFrontendDistRoot } from '../src/host/assets.js'

const distRoot = join(import.meta.dirname, 'fixtures', 'frontend', 'dist')

interface FakeContext {
  emit(event: string, payload: unknown): void
  clientModules: { fetchBundle(request: Request): Response }
}

function fakeContext(): { ctx: FakeContext; emitted: [string, unknown][]; fetchBundle: ReturnType<typeof vi.fn> } {
  const emitted: [string, unknown][] = []
  const fetchBundle = vi.fn(() => new Response('bundle-bytes', { status: 200 }))
  return {
    emitted,
    fetchBundle,
    ctx: {
      emit: (event: string, payload: unknown) => { emitted.push([event, payload]) },
      clientModules: { fetchBundle },
    },
  }
}

function asContext(ctx: FakeContext): never {
  // cordis Context 只需结构子集；资产处理器只用 emit 与 clientModules.fetchBundle。
  return ctx as never
}

function request(path: string, method = 'GET'): Request {
  return new Request(`dsh-app://app${path}`, { method })
}

describe('asset handler', () => {
  it('serves index.html with the transport script injected', async () => {
    const { ctx, emitted } = fakeContext()
    const response = await createAssetHandler(asContext(ctx), distRoot).fetch(request('/index.html'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const body = await response.text()
    expect(body).toContain('globalThis.__DSH_TRANSPORT__')
    expect(body).toContain('<div id="app"></div>')
    expect(emitted.map(([event]) => event)).toEqual(['webserver/index-inject'])
  })

  it('keeps ownsHost true so the client treats the shell as loopback', () => {
    expect(SHELL_TRANSPORT_SCRIPT).toContain('ownsHost:true')
  })

  it('serves the root path as index.html and a nested asset with its MIME type', async () => {
    const { ctx } = fakeContext()
    const handler = createAssetHandler(asContext(ctx), distRoot)
    expect((await handler.fetch(request('/'))).status).toBe(200)
    const css = await handler.fetch(request('/assets/app.css'))
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8')
    expect(await css.text()).toContain('rebeccapurple')
  })

  it('falls back to index.html for an unknown SPA route', async () => {
    const { ctx } = fakeContext()
    const response = await createAssetHandler(asContext(ctx), distRoot).fetch(request('/sessions/42'))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('__DSH_TRANSPORT__')
  })

  it('rejects path traversal with 403 and non-read methods with 405', async () => {
    const { ctx } = fakeContext()
    const handler = createAssetHandler(asContext(ctx), distRoot)
    expect((await handler.fetch(request('/%2e%2e%2fpackage.json'))).status).toBe(403)
    expect((await handler.fetch(request('/index.html', 'POST'))).status).toBe(405)
  })

  it('forwards /plugins/ to the client module bundle fetcher', async () => {
    const { ctx, fetchBundle } = fakeContext()
    const response = await createAssetHandler(asContext(ctx), distRoot)
      .fetch(request('/plugins/dsh-client-ui-chat.js'))
    expect(fetchBundle).toHaveBeenCalledOnce()
    expect(await response.text()).toBe('bundle-bytes')
  })

  it('declares a buffered request body mode', () => {
    const { ctx } = fakeContext()
    expect(createAssetHandler(asContext(ctx), distRoot).requestBodyMode()).toBe('buffered')
  })
})

describe('resolveFrontendDistRoot', () => {
  it('fails loud when the frontend package is not installed in the profile', () => {
    expect(() => resolveFrontendDistRoot(join(import.meta.dirname, 'fixtures', 'profile')))
      .toThrow(/^lute shell: profile .* has no installed @deepseek-ai\/dsh-web-frontend/u)
  })
})
