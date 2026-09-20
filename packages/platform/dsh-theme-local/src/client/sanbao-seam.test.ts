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

const REQUIRED_ALIAS_KEYS = [
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
  // 三态官方语义投影还消费状态背景 alias。
  '--sanbao-success-surface',
  '--sanbao-warning-surface',
  '--sanbao-error-surface',
] as const

const REQUIRED_COLOR_KEYS = [
  '--sanbao-canvas', '--sanbao-sidebar', '--sanbao-right-sidebar', '--sanbao-panel',
  '--sanbao-inset', '--sanbao-overlay', '--sanbao-foreground', '--sanbao-secondary',
  '--sanbao-accent', '--sanbao-accent-fill', '--sanbao-on-accent', '--sanbao-hover',
  '--sanbao-pressed', '--sanbao-selected', '--sanbao-disabled', '--sanbao-border',
  '--sanbao-control-border', '--sanbao-success', '--sanbao-warning', '--sanbao-error',
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

const rules = new Map(
  Array.from(SANBAO_TOKEN_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g), match => [
    match[1]!.trim(), match[2]!,
  ] as const),
)

function rule(selector: string): string {
  const css = rules.get(selector)
  expect(css, selector).toBeDefined()
  return css!
}

function themeDeclarations(id: string): Record<string, string> {
  return {
    ...collectDeclarations(rule('body')),
    ...collectDeclarations(rule(`body[data-sanbao-theme="${id}"]`)),
  }
}

describe('S-B token 源（三主题及兼容 alias 契约）', () => {
  it.each(['light', 'dark', 'warm-pink'])('%s 保留必要 alias 并独立声明完整色板', (id: string) => {
    const palette = collectDeclarations(rule(`body[data-sanbao-theme="${id}"]`))
    for (const key of REQUIRED_COLOR_KEYS) {
      expect(palette[key], `${id} ${key}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
    const declarations = themeDeclarations(id)
    for (const key of REQUIRED_ALIAS_KEYS) {
      expect(declarations[key], `${id} ${key}`).toBeDefined()
    }
    for (const [key, value] of Object.entries(declarations)) {
      expect(value.length, `${id} ${key}`).toBeGreaterThan(0)
      expect(value, `${id} ${key}`).not.toMatch(/undefined/)
    }
  })

  it('只声明 --sanbao-* 命名空间', () => {
    const declaredNames = SANBAO_TOKEN_CSS.match(/--[a-z0-9-]+\s*:/g) ?? []
    expect(declaredNames.length).toBeGreaterThanOrEqual(REQUIRED_ALIAS_KEYS.length)
    for (const raw of declaredNames) {
      expect(raw.trim().replace(/\s*:$/, ''), raw).toMatch(/^--sanbao-/)
    }
  })

  it.each(['light', 'dark', 'warm-pink'])('%s 的 alias 图无环、无悬空引用，也不反向依赖 dsw', (id: string) => {
    const declarations = themeDeclarations(id)
    const visit = (key: string, path: string[]) => {
      expect(path, `${id}: ${[...path, key].join(' -> ')}`).not.toContain(key)
      const value = declarations[key]
      expect(value, `${id} ${key}`).toBeDefined()
      for (const match of value!.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
        const dependency = match[1]!
        if (dependency.startsWith('--sanbao-')) {
          visit(dependency, [...path, key])
        } else {
          // The only external alias is optional geometry, never a color dependency.
          expect(key).toBe('--sanbao-radius')
          expect(dependency).toBe('--lute-radius-row')
          expect(value).toMatch(/var\(--lute-radius-row,\s*8px\)/)
        }
      }
    }
    for (const key of Object.keys(declarations)) visit(key, [])
    expect(SANBAO_TOKEN_CSS).not.toMatch(/var\(\s*--dsw-/)
  })

  it('三种身份独立选中，暖粉使用 light scheme；仅无身份时兼容旧亮暗标记', () => {
    expect([...rules.keys()].filter(selector => selector.startsWith('body[data-sanbao-theme='))).toEqual([
      'body[data-sanbao-theme="light"]',
      'body[data-sanbao-theme="dark"]',
      'body[data-sanbao-theme="warm-pink"]',
    ])
    for (const [id, scheme] of [['light', 'light'], ['dark', 'dark'], ['warm-pink', 'light']]) {
      expect(rule(`body[data-sanbao-theme="${id}"]`)).toContain(`color-scheme: ${scheme};`)
    }
    expect(collectDeclarations(rule('body:not([data-sanbao-theme])'))).toEqual(
      collectDeclarations(rule('body[data-sanbao-theme="light"]')),
    )
    expect(collectDeclarations(rule('body[data-ds-dark-theme]:not([data-sanbao-theme])'))).toEqual(
      collectDeclarations(rule('body[data-sanbao-theme="dark"]')),
    )
    const canvases = ['light', 'dark', 'warm-pink'].map(id => themeDeclarations(id)['--sanbao-canvas'])
    expect(new Set(canvases).size).toBe(3)
  })
})
