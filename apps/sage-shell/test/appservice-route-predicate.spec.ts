import { describe, expect, it } from 'vitest'
import { isSageServicePath } from '../src/appservice/route-skeleton.js'

describe('main 分流（WT-02D.1 收口：单 owner，无开关）', () => {
  it('/.sage/* 恒走 appservice', () => {
    expect(isSageServicePath('/.sage/state')).toBe(true)
    expect(isSageServicePath('/.sage/actions')).toBe(true)
    expect(isSageServicePath('/.sage/other')).toBe(true)
  })

  it('其余 pathname 不走 appservice', () => {
    expect(isSageServicePath('/index.html')).toBe(false)
    expect(isSageServicePath('/api')).toBe(false)
    expect(isSageServicePath('/.dsh/x')).toBe(false)
    expect(isSageServicePath('/.sagex')).toBe(false)
  })
})
