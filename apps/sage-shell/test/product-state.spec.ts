import { describe, expect, it } from 'vitest'
import { SAGE_REQUEST_TIMEOUT_MS, SAGE_RUNTIME_STATUSES } from '../src/product/contracts.js'
import { renderSageDocument } from '../src/product/renderer.js'
import { MemoryProductStore, createSageViewState } from '../src/product/state.js'

describe('Sage product state', () => {
  it('keeps the P0-2 renderer vocabulary deliberately small', () => {
    expect(SAGE_RUNTIME_STATUSES).toEqual(['ready', 'unavailable', 'recovering'])
  })

  it('creates safe copy for every status without exposing host data', () => {
    expect(createSageViewState('ready')).toEqual({
      status: 'ready',
      message: 'Sage 已检测到能力运行时服务。',
      retryable: false,
    })
    expect(createSageViewState('unavailable')).toMatchObject({ status: 'unavailable', retryable: true })
    expect(createSageViewState('recovering')).toMatchObject({ status: 'recovering', retryable: false })
  })

  it('keeps state only in a fresh in-memory store', () => {
    const first = new MemoryProductStore()
    expect(first.read().status).toBe('unavailable')
    expect(first.set('recovering').status).toBe('recovering')
    expect(first.set('ready').status).toBe('ready')

    const second = new MemoryProductStore()
    expect(second.read().status).toBe('unavailable')
  })

  it('turns a stalled controlled request into the renderer fallback state', () => {
    const document = renderSageDocument()
    expect(document).toContain('data-sage-workspace')
    expect(document).toContain('data-projection-source="fixture"')
    expect(document).toContain('data-view="overview"')
    expect(document).toContain('data-view="matter"')
    expect(document).toContain('data-view="capabilities"')
    expect(document).toContain('data-view="governance"')
    expect(document).toContain('SHARED OPERATING MATTER')
    expect(document).toContain('/.sage/state')
    expect(document).toContain('/.sage/actions')
    expect(document).toContain('fixture projection')
    expect(document).toContain('在现金约束下稳定订单增长')
    expect(document).toContain('fixture-only')
    expect(document).toContain('data-action-preview="answer-clarification"')
    expect(document).toContain('data-submission-state="not-submitted"')
    expect(document).toContain('预览，不提交')
    expect(document).toContain('prefers-reduced-motion')
    expect(document).not.toContain('Sanbao')
    expect(document).not.toContain('DeepSeek')
    expect(document).not.toContain('Harness')
    expect(document).not.toContain('__DSH_TRANSPORT__')
    expect(document).not.toContain('data-sanbao-composer')
    expect(document).toContain(`const requestTimeoutMs = ${String(SAGE_REQUEST_TIMEOUT_MS)};`)
    expect(document).toContain('new AbortController()')
    expect(document).toContain('signal: controller.signal')
    expect(document).toContain('} finally {')
    expect(document).toContain('clearTimeout(timer);')
  })
})
