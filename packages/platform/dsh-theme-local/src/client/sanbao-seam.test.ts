import { describe, expect, it } from 'vitest'
import { SANBAO_BRAND_SOURCE } from '../../../../../shared/client/sanbao-brand-source'
import { SANBAO_TOKEN_CSS } from './sanbao-tokens'

const BRAND_FIELDS = [
  'nameLatin',
  'nameZh',
  'shortName',
  'sloganZh',
  'sloganEn',
  'signingIdentity',
  'bundleDisplayName',
] as const

describe('S-A 品牌名源（002 骨架：形状齐全，值 = 现状）', () => {
  it('七个字段齐全、无 undefined、无空串', () => {
    expect(Object.keys(SANBAO_BRAND_SOURCE).sort()).toEqual([...BRAND_FIELDS].sort())
    for (const field of BRAND_FIELDS) {
      expect(typeof SANBAO_BRAND_SOURCE[field], field).toBe('string')
      expect((SANBAO_BRAND_SOURCE[field] as string).length, field).toBeGreaterThan(0)
    }
  })

  it('品牌显示值迁入 Sanbao，签名和 bundle 身份保持不变', () => {
    expect(SANBAO_BRAND_SOURCE.nameLatin).toBe('Sanbao')
    expect(SANBAO_BRAND_SOURCE.nameZh).toBe('三宝')
    expect(SANBAO_BRAND_SOURCE.shortName).toBe('SB')
    expect(SANBAO_BRAND_SOURCE.sloganZh).toBe('三宝出海，货通四方')
    expect(SANBAO_BRAND_SOURCE.sloganEn).toBe('Sanbao — Your AI Fleet to Global Markets')
    expect(SANBAO_BRAND_SOURCE.signingIdentity).toBe('LUTE Code Signing')
    expect(SANBAO_BRAND_SOURCE.bundleDisplayName).toBe('LUTE Agentic System')
  })
})

const EXPECTED_KEYS = [
  // 色板十键（供体 body.v1 契约：bg/surface/surface2/ink/muted/line/good/accent/on-accent/radius）
  '--sanbao-bg',
  '--sanbao-surface',
  '--sanbao-surface2',
  '--sanbao-ink',
  '--sanbao-muted',
  '--sanbao-line',
  '--sanbao-good',
  '--sanbao-accent',
  '--sanbao-on-accent',
  '--sanbao-radius',
  // 材质七项（供体 --metal-*：ink/border/shadow/fill/line/highlight/pressed）
  '--sanbao-metal-ink',
  '--sanbao-metal-border',
  '--sanbao-metal-shadow',
  '--sanbao-metal-fill',
  '--sanbao-metal-line',
  '--sanbao-metal-highlight',
  '--sanbao-metal-pressed',
  // 动效四项（供体 --ux-*：fast/base/slow/ease）
  '--sanbao-fast',
  '--sanbao-base',
  '--sanbao-slow',
  '--sanbao-ease',
] as const

function collectDeclarations(css: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of css.matchAll(/(--sanbao-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const key = m[1]
    const value = m[2]
    if (key === undefined || value === undefined) continue
    out[key] = value.trim()
  }
  return out
}

describe('S-B token 源（002 骨架：键名齐全，值 = 现状）', () => {
  const declarations = collectDeclarations(SANBAO_TOKEN_CSS)

  it('供体契约 21 个键全部声明，且没有多余键', () => {
    for (const key of EXPECTED_KEYS) {
      expect(declarations[key], key).toBeDefined()
    }
    expect(Object.keys(declarations).sort()).toEqual([...EXPECTED_KEYS].sort())
  })

  it('没有 undefined / 空值', () => {
    for (const [key, value] of Object.entries(declarations)) {
      expect(value.length, key).toBeGreaterThan(0)
      expect(value, key).not.toMatch(/undefined/)
    }
  })

  it('只声明 --sanbao-* 命名空间；对 --dsw-* / --lute-* 只允许 var() 引用', () => {
    const declaredNames = SANBAO_TOKEN_CSS.match(/--[a-z0-9-]+\s*:/g) ?? []
    expect(declaredNames.length, '应至少声明 21 个键').toBeGreaterThanOrEqual(EXPECTED_KEYS.length)
    for (const raw of declaredNames) {
      expect(raw.trim().replace(/\s*:$/, ''), raw).toMatch(/^--sanbao-/)
    }
  })

  it('现状锚：accent 是 LUTE 绿（亮 #347A2F / 暗 #58B848）', () => {
    expect(SANBAO_TOKEN_CSS).toContain('--sanbao-accent: #347A2F')
    expect(SANBAO_TOKEN_CSS).toContain('--sanbao-accent: #58B848')
  })

  it('亮暗两态用本仓既有约定（:root 亮 / body[data-ds-dark-theme] 暗）', () => {
    expect(SANBAO_TOKEN_CSS).toMatch(/:root\s*\{/)
    expect(SANBAO_TOKEN_CSS).toMatch(/body\[data-ds-dark-theme\]\s*\{/)
  })
})
