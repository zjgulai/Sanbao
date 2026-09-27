import { describe, expect, it, vi } from 'vitest'
import { createSageCapabilityAdapter } from '../src/adapter/capability-adapter.js'

function asContext(get: ReturnType<typeof vi.fn>): never {
  return { get } as never
}

describe('Sage Capability Adapter', () => {
  it('projects a resolvable connection service as ready', () => {
    const get = vi.fn(() => ({ publicService: true }))
    const adapter = createSageCapabilityAdapter(asContext(get))

    expect(adapter.readState()).toMatchObject({ status: 'ready', retryable: false })
    expect(get).toHaveBeenLastCalledWith('connection')
  })

  it('maps an absent or failed service probe to unavailable without leaking the failure', () => {
    const missing = createSageCapabilityAdapter(asContext(vi.fn(() => undefined)))
    expect(missing.readState()).toMatchObject({ status: 'unavailable', retryable: true })

    const failing = createSageCapabilityAdapter(asContext(vi.fn(() => { throw new Error('private transport detail') })))
    expect(failing.readState()).toEqual({
      status: 'unavailable',
      message: 'Sage 暂时未检测到能力运行时服务，可重新检查。',
      retryable: true,
    })
  })

  it('uses retry only to queue one fresh availability inspection', async () => {
    const get = vi.fn(() => ({ publicService: true }))
    const adapter = createSageCapabilityAdapter(asContext(get))
    expect(get).toHaveBeenCalledTimes(1)

    expect(adapter.retry()).toMatchObject({ status: 'recovering', retryable: false })
    expect(adapter.retry()).toMatchObject({ status: 'recovering', retryable: false })
    expect(get).toHaveBeenCalledTimes(1)

    await new Promise<void>(resolve => queueMicrotask(resolve))
    expect(get).toHaveBeenCalledTimes(2)
    expect(adapter.readState()).toMatchObject({ status: 'ready', retryable: false })
  })
})
