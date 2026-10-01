import { describe, expect, it } from 'vitest'
import { shouldUseAppService } from '../src/appservice/route-skeleton.js'

describe('main 分流（D1）', () => {
  it('on 态：/.sage/* 走 appservice', () => {
    expect(shouldUseAppService('/.sage/state', true)).toBe(true)
    expect(shouldUseAppService('/.sage/actions', true)).toBe(true)
    expect(shouldUseAppService('/.sage/other', true)).toBe(true)
  })
  it('on 态：其余 pathname 不走 appservice', () => {
    expect(shouldUseAppService('/index.html', true)).toBe(false)
    expect(shouldUseAppService('/api', true)).toBe(false)
    expect(shouldUseAppService('/.dsh/x', true)).toBe(false)
    expect(shouldUseAppService('/.sagex', true)).toBe(false)
  })
  it('off 态：任何 pathname 都不走 appservice（回退 Host）', () => {
    expect(shouldUseAppService('/.sage/state', false)).toBe(false)
    expect(shouldUseAppService('/.sage/other', false)).toBe(false)
  })
})
