import { describe, expect, it } from 'vitest'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { allowProjectionReadForTest } from './support/projection-read-test-runner.js'

const providers = {
  runProjectionRead: allowProjectionReadForTest,
  readState: async () => Response.json({ service: { status: 'unavailable' }, runtime: null }),
  dispatch: async () => new Response(null, { status: 503 }),
  login: async () => new Response('{}'),
  logout: async () => new Response('{}'),
}
const deps = { callerBinding: { correlation: 'c-1' }, providers }

function req(url: string, init?: RequestInit): Request { return new Request(url, init) }

describe('route-skeleton', () => {
  it('缺 caller binding 一律 403', async () => {
    const r = await handleSageServiceRequest(req('dsh-app://app/.sage/state'), { callerBinding: null, providers })
    expect(r.status).toBe(403)
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('state 非 GET 405 + allow GET', async () => {
    const r = await handleSageServiceRequest(req('dsh-app://app/.sage/state', { method: 'POST' }), deps)
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe('GET')
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('actions 非 POST 405 + allow POST', async () => {
    const r = await handleSageServiceRequest(req('dsh-app://app/.sage/actions'), { ...deps, providers })
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe('POST')
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('actions 非 JSON content-type 415', async () => {
    const r = await handleSageServiceRequest(
      req('dsh-app://app/.sage/actions', { method: 'POST', headers: { 'content-type': 'text/plain' } }),
      deps,
    )
    expect(r.status).toBe(415)
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('未知 /.sage/ 子路径 404', async () => {
    const r = await handleSageServiceRequest(req('dsh-app://app/.sage/other'), deps)
    expect(r.status).toBe(404)
    expect(r.headers.get('cache-control')).toBe('no-store')
  })
  it('actions body 超预算 413（流式截断）', async () => {
    const big = 'x'.repeat(5 * 1024)
    const r = await handleSageServiceRequest(
      req('dsh-app://app/.sage/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: `{"type":"retry","pad":"${big}"}` }),
      deps,
    )
    expect(r.status).toBe(413)
  })
  it('actions 未知 intent 400 invalid-intent', async () => {
    const r = await handleSageServiceRequest(
      req('dsh-app://app/.sage/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"type":"nuke"}' }),
      deps,
    )
    expect(r.status).toBe(400)
    const body = await r.json() as Record<string, unknown>
    expect(body.code).toBe('invalid-intent')
  })
  it('GET state 只在显式允许的 read runner 内调用 providers.readState', async () => {
    const r = await handleSageServiceRequest(req('dsh-app://app/.sage/state'), deps)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ service: { status: 'unavailable' }, runtime: null })
  })
})

describe('auth routes', () => {
  const providers = {
    readState: async () => new Response('{}'),
    dispatch: async () => new Response('{}'),
    login: async () => Response.json({ auth: 'pending' }, { status: 202, headers: { 'cache-control': 'no-store' } }),
    logout: async () => Response.json({ auth: 'signed-out' }, { status: 200, headers: { 'cache-control': 'no-store' } }),
  }

  it('GET /.sage/login routes to the login provider', async () => {
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/login'), { callerBinding: { correlation: 'c' }, providers })
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ auth: 'pending' })
  })

  it('POST /.sage/logout routes to the logout provider', async () => {
    const response = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), { callerBinding: { correlation: 'c' }, providers })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ auth: 'signed-out' })
  })

  it('login with wrong method is rejected 405', async () => {
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), { callerBinding: { correlation: 'c' }, providers })
    expect(response.status).toBe(405)
  })
})

describe('dispatch response shape', () => {
  it('invalid-intent transport body matches CommandDenied shape', async () => {
    const providers = {
      readState: async () => new Response('{}'),
      dispatch: async () => new Response('{}'),
      login: async () => new Response('{}'),
      logout: async () => new Response('{}'),
    }
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/actions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'bogus' }),
    }), { callerBinding: { correlation: 'c' }, providers })
    expect(response.status).toBe(400)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ code: 'invalid-intent', stage: 'intent', retryable: false })
    expect(body.correlation).toBe('c')
  })
})
