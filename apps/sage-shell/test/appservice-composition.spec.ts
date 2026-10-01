import { describe, expect, it } from 'vitest'
import { createUnavailableFirstService } from '../src/appservice/composition.js'

const runtime = { status: 'ready' as const, message: 'dsh 2.0.10', retryable: true }

describe('unavailable-first composition', () => {
  it('state 返回 service.unavailable + identity-unavailable + 内嵌 runtime + no-store', async () => {
    const r = await createUnavailableFirstService(runtime).readState()
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    const body = await r.json() as Record<string, unknown>
    const service = body.service as Record<string, unknown>
    expect(service.status).toBe('unavailable')
    expect(service.reason).toBe('identity-unavailable')
    expect(typeof service.correlation).toBe('string')
    expect(body.runtime).toEqual(runtime)
  })
  it('runtime 缺席时内嵌 null（不伪造 P0-2 字段）', async () => {
    const body = await (await createUnavailableFirstService(null).readState()).json() as Record<string, unknown>
    expect(body.runtime).toBeNull()
  })
  it('dispatch 200 + typed denial（identity-unavailable，无 stack/message 键）', async () => {
    const r = await createUnavailableFirstService(runtime).dispatch()
    expect(r.status).toBe(200)
    const body = await r.json() as Record<string, unknown>
    expect(body).toMatchObject({ code: 'identity-unavailable', stage: 'identity-policy', retryable: true })
    expect(typeof body.correlation).toBe('string')
    expect('stack' in body).toBe(false)
    expect('message' in body).toBe(false)
  })
  it('两次 readState 的 correlation 不同（新鲜求值，无原地抬升）', async () => {
    const s = createUnavailableFirstService(runtime)
    const a = await (await s.readState()).json() as { service: { correlation: string } }
    const b = await (await s.readState()).json() as { service: { correlation: string } }
    expect(a.service.correlation).not.toBe(b.service.correlation)
  })
})

describe('dispatch via command pipeline', () => {
  it('always denies identity-unavailable with stage and fresh correlation', async () => {
    const service = createUnavailableFirstService(null)
    const response = await service.dispatch()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ code: 'identity-unavailable', stage: 'identity-policy', retryable: true })
    expect(typeof body.correlation).toBe('string')
    const secondBody = await (await createUnavailableFirstService(null).dispatch()).json() as Record<string, unknown>
    expect(secondBody.correlation).not.toBe(body.correlation)
  })
})
