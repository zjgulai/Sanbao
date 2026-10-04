import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SAGE_DENSITY_TOKEN_NAMES,
  SAGE_DENSITY_TOKENS,
  SAGE_THEME_TOKEN_NAMES,
  SAGE_THEME_TOKENS,
  renderSageDensityTokenCss,
  renderSageThemeTokenCss,
  type SageDensityTokens,
  type SageThemeTokens,
} from '../src/product/theme-tokens.js'

const COLOR_ROLES = [
  'canvas',
  'sidebar',
  'surface',
  'raised',
  'overlay',
  'ink',
  'muted',
  'faint',
  'divider',
  'border',
  'brand',
  'focus',
  'success',
  'warning',
  'danger',
] as const

const SURFACE_ROLES = ['canvas', 'sidebar', 'surface', 'raised', 'overlay'] as const
const TEXT_ROLES = ['ink', 'muted', 'faint'] as const
const NON_TEXT_ROLES = ['divider', 'border', 'brand', 'focus', 'success', 'warning', 'danger'] as const
const DENSITY_ROLES = [
  'nav-item-padding',
  'main-padding',
  'card-padding',
  'row-gap',
  'control-min-height',
] as const
const PRODUCT_SOURCE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'product')

function channel(value: string): number {
  const normalized = Number.parseInt(value, 16) / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

function luminance(value: string): number {
  const channels = value.slice(1).match(/.{2}/g)
  if (channels === null || channels.length !== 3) throw new Error(`Expected #RRGGBB, received ${value}`)
  return (0.2126 * channel(channels[0]!)) + (0.7152 * channel(channels[1]!)) + (0.0722 * channel(channels[2]!))
}

function contrast(foreground: string, background: string): number {
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function contrastFailures(tokens: SageThemeTokens): string[] {
  const failures: string[] = []
  for (const surface of SURFACE_ROLES) {
    for (const text of TEXT_ROLES) {
      if (contrast(tokens[text], tokens[surface]) < 4.5) failures.push(`${text} on ${surface}`)
    }
    for (const role of NON_TEXT_ROLES) {
      if (contrast(tokens[role], tokens[surface]) < 3) failures.push(`${role} on ${surface}`)
    }
  }
  return failures
}

describe('the Sage semantic theme token owner (UI-TOKEN-01)', () => {
  it('owns the exact semantic roles for both palettes and no Sanbao token namespace', () => {
    expect(SAGE_THEME_TOKEN_NAMES).toEqual([
      ...COLOR_ROLES,
      'radius',
      'shadow',
      'spacing',
      'motion',
    ])

    for (const theme of ['light', 'dark'] as const) {
      const tokens = SAGE_THEME_TOKENS[theme]
      expect(Object.keys(tokens)).toEqual(SAGE_THEME_TOKEN_NAMES)
      expect(Object.isFrozen(tokens)).toBe(true)
      for (const role of COLOR_ROLES) expect(tokens[role], `${theme}.${role}`).toMatch(/^#[0-9a-f]{6}$/i)
    }

    const serialized = JSON.stringify(SAGE_THEME_TOKENS)
    expect(serialized).not.toContain('--sb-')
    expect(serialized).not.toContain('Sanbao')
  })

  it('keeps normal text at 4.5:1 and non-text/focus roles at 3:1 across canonical surfaces', () => {
    for (const theme of ['light', 'dark'] as const) {
      const tokens = SAGE_THEME_TOKENS[theme]
      expect(contrastFailures(tokens), theme).toEqual([])
      expect(new Set([tokens.brand, tokens.success, tokens.warning, tokens.danger]).size).toBe(4)
    }
  })

  it('proves the contrast instrument rejects a palette mutation', () => {
    const light = SAGE_THEME_TOKENS.light
    const mutated: SageThemeTokens = Object.freeze({ ...light, faint: light.surface })

    expect(contrastFailures(mutated)).toContain('faint on surface')
    expect(contrastFailures(light)).not.toContain('faint on surface')
  })

  it('renders explicit effective-theme selectors and an honest system visual fallback', () => {
    const css = renderSageThemeTokenCss()
    expect(css).toContain(':root[data-sage-theme-effective="light"]')
    expect(css).toContain(':root[data-sage-theme-effective="dark"]')
    expect(css).toContain(':root[data-sage-theme-effective="unknown"]')
    expect(css).toContain('@media (prefers-color-scheme: light)')
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain('--sage-canvas:')
    expect(css).toContain('--sage-motion:')
    expect(css).not.toContain('--sb-')
    expect(css).not.toContain('data-sage-theme-effective="system"')
  })

  it('keeps palette literals and token declarations in the sole token owner', () => {
    const renderer = readFileSync(join(PRODUCT_SOURCE, 'renderer.ts'), 'utf8')
    const components = readFileSync(join(PRODUCT_SOURCE, 'component-renderer.ts'), 'utf8')
    const consumers = `${renderer}\n${components}`
    const declaredTheme = new Set<string>(SAGE_THEME_TOKEN_NAMES)
    const declaredDensity = new Set<string>(SAGE_DENSITY_TOKEN_NAMES)
    const usedTheme = [...consumers.matchAll(/var\(--sage-(?!density-)([a-z-]+)\)/gu)].map((match) => match[1]!)
    const usedDensity = [...consumers.matchAll(/var\(--sage-density-([a-z-]+)\)/gu)].map((match) => match[1]!)

    expect(renderer).toContain('renderSageThemeTokenCss()')
    expect(consumers).not.toMatch(/#[0-9a-f]{3,8}(?![0-9a-z_-])/iu)
    expect(consumers).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/iu)
    expect(consumers).not.toMatch(/(?:linear|radial)-gradient\(/iu)
    expect(consumers).not.toMatch(/--sage-[a-z-]+\s*:/u)
    expect(consumers).not.toMatch(/var\(--sage-[a-z-]+\s*,/u)
    expect(consumers).not.toMatch(/--(?:sb|sanbao)-/u)
    expect([...new Set(usedTheme)].filter((name) => !declaredTheme.has(name))).toEqual([])
    expect([...new Set(usedDensity)].filter((name) => !declaredDensity.has(name))).toEqual([])
  })
})

describe('the Sage semantic density token owner (RUNTIME-03B)', () => {
  it('owns exact geometry-only roles without changing the theme role set', () => {
    expect(SAGE_DENSITY_TOKEN_NAMES).toEqual(DENSITY_ROLES)
    expect(SAGE_THEME_TOKEN_NAMES).toEqual([
      ...COLOR_ROLES,
      'radius',
      'shadow',
      'spacing',
      'motion',
    ])
    expect(SAGE_DENSITY_TOKEN_NAMES.some((name) => SAGE_THEME_TOKEN_NAMES.includes(name as never))).toBe(false)

    for (const density of ['comfortable', 'compact'] as const) {
      const tokens = SAGE_DENSITY_TOKENS[density]
      expect(Object.keys(tokens)).toEqual(SAGE_DENSITY_TOKEN_NAMES)
      expect(Object.isFrozen(tokens)).toBe(true)
      expect(JSON.stringify(tokens)).not.toMatch(/font|color|#[0-9a-f]{3,8}|\b(?:rgb|hsl)a?\(/iu)
    }
  })

  it('preserves the existing comfortable geometry and makes every compact metric denser', () => {
    expect(SAGE_DENSITY_TOKENS.comfortable).toEqual<SageDensityTokens>({
      'nav-item-padding': '.72rem .75rem',
      'main-padding': '1.5rem clamp(1.25rem, 4vw, 4rem) 2rem',
      'card-padding': '1.35rem',
      'row-gap': '.55rem',
      'control-min-height': '1.85rem',
    })
    expect(SAGE_DENSITY_TOKENS.compact).toEqual<SageDensityTokens>({
      'nav-item-padding': '.5rem .6rem',
      'main-padding': '1rem clamp(.9rem, 3vw, 2.5rem) 1.25rem',
      'card-padding': '1rem',
      'row-gap': '.4rem',
      'control-min-height': '1.6rem',
    })
    for (const name of SAGE_DENSITY_TOKEN_NAMES) {
      expect(SAGE_DENSITY_TOKENS.compact[name], name).not.toBe(SAGE_DENSITY_TOKENS.comfortable[name])
    }
  })

  it('renders explicit densities plus an honest comfortable visual fallback for unknown state', () => {
    const css = renderSageDensityTokenCss()
    expect(css).toContain(':root[data-sage-density="comfortable"]')
    expect(css).toContain(':root[data-sage-density="compact"]')
    expect(css).toContain(':root[data-sage-density="unknown"]')
    expect(css).toContain(':root:not([data-sage-density])')
    expect(css).toContain('--sage-density-nav-item-padding:')
    expect(css).toContain('--sage-density-control-min-height:')
    expect(css).not.toContain('data-sage-density-effective')
    expect(css).not.toContain('data-sage-density="system"')
    expect(css).not.toContain('font-size')
    expect(css).not.toContain('color-scheme')
    expect(css).not.toMatch(/--sage-(?:canvas|ink|brand|success|warning|danger):/u)
  })

  it('keeps palette rendering independent from density selectors and declarations', () => {
    const themeCss = renderSageThemeTokenCss()
    expect(themeCss).not.toContain('data-sage-density')
    expect(themeCss).not.toContain('--sage-density-')
  })
})
