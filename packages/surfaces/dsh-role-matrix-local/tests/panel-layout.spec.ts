// @vitest-environment node
/**
 * Layout guards for the role matrix surface.
 *
 * These assert the *shape* of the stylesheet and the panel source, because the
 * failures they describe are invisible to a DOM test and invisible at runtime:
 * nothing throws when a drawer loses a stacking race, when a reset rule keeps a
 * closed dialog on screen, or when the close button is squeezed to a few pixels
 * by a long title. Each one is a real defect this surface shipped with once.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/client/role-matrix.module.css', import.meta.url), 'utf8')
const heroCss = readFileSync(new URL('../src/client/hero-entry.module.css', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/client/RoleMatrixPanel.tsx', import.meta.url), 'utf8')

describe('role matrix drawer stacking', () => {
  it('enters the top layer instead of betting on a z-index', () => {
    expect(panel).toContain('<dialog')
    expect(panel).toContain('showModal()')
    // Any z-index here would put the drawer back into the race it left: the
    // plugins installed alongside it reach 2500 / 99999 / 2147483000.
    expect(css).not.toMatch(/\.root\s*\{[^}]*z-index/s)
  })

  it('keeps a closed dialog hidden despite the full-viewport reset', () => {
    // `display: flex` on .root overrides the UA's `dialog:not([open])` rule, so
    // without this the panel stays painted after being closed and unmounted.
    expect(css).toMatch(/\.root:not\(\[open\]\)\s*\{[^}]*display:\s*none/s)
  })

  it('carries the dim on ::backdrop and never on the panel box', () => {
    expect(css).toMatch(/\.root::backdrop\s*\{[^}]*background:/s)
    expect(css).toMatch(/\.panel\s*\{[^}]*background:\s*var\(--dsw-alias-bg-layer-1/s)
  })
})

describe('role matrix close affordance', () => {
  it('gives the close button an unsqueezable 32px box', () => {
    const close = css.match(/\.close\s*\{([^}]*)\}/s)?.[1] ?? ''
    expect(close).toContain('width: 32px')
    expect(close).toContain('height: 32px')
    expect(close).toContain('flex: none')
    expect(close).toContain('padding: 0')
  })

  it('draws the ✕ as a glyph, not as a font character', () => {
    // A text "✕" renders in whatever font the shell resolved and can shift or
    // fall back to tofu; the drawn path cannot.
    expect(panel).not.toMatch(/>\s*✕\s*</)
    expect(panel).toContain('<IconClose />')
    expect(panel).toContain('aria-label={tt(\'panel.close\')}')
  })
})

describe('role matrix sidebar entry row', () => {
  it('uses semantic hover borders and selected fills without white highlights or green glow', () => {
    const hover = css.match(/\.entry:hover,\s*\.entryActive\s*\{([^}]*)\}/)?.[1]
    const active = [...css.matchAll(/\n\.entryActive\s*\{([^}]*)\}/g)].at(-1)?.[1]
    const icon = css.match(/\.entry\[data-active\] \.entryIcon\s*\{([^}]*)\}/)?.[1]
    expect(hover).toContain('border-color: var(--sanbao-border)')
    expect(hover).toContain('inset 0 1px 0 var(--sanbao-border)')
    expect(active).toContain('background: var(--sanbao-selected)')
    expect(active).toContain('color: var(--sanbao-accent)')
    expect(icon).toContain('color: var(--sanbao-accent)')
    expect(css.match(/88,\s*184,\s*72|rgba\(255,\s*255,\s*255|drop-shadow/g)).toBeNull()
  })

  it('uses the shared navigation icon dimensions', () => {
    // Same 24px box + 18px glyph ratio the shell's own nav rows use, so the
    // injected row lines up with them instead of drifting by its icon.
    expect(css).toMatch(/\.entryIcon\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s)
    expect(css).toMatch(/\.entryIcon svg\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;/s)
  })
})

describe('role matrix brand treatment', () => {
  it('carries the business green on the strip, mark and selected state without gradients', () => {
    expect(css).toContain('--dsw-alias-state-business-primary')
    expect(css).not.toContain('linear-gradient')
    expect(css).toMatch(/\.header::before\s*\{[^}]*background:\s*var\(--dsw-alias-state-business-primary/s)
    expect(css).toMatch(/\.mark\s*\{[^}]*background:\s*var\(--dsw-alias-state-business-tertiary/s)
    expect(css).toMatch(/\.totalAccent\s*\{[^}]*background:\s*var\(--dsw-alias-state-business-tertiary/s)
    expect(css).toMatch(/\.totalAccent::before\s*\{[^}]*background:\s*var\(--dsw-alias-state-business-primary/s)
  })

  it('rides harness semantic tokens for every theme-dependent colour', () => {
    expect(css).toContain('var(--dsw-alias-bg-layer-1')
    expect(css).toContain('var(--dsw-alias-label-primary')
    expect(css).toContain('var(--dsw-alias-label-secondary')
    expect(css).toContain('var(--dsw-alias-border-l1')
    expect(css).toContain('var(--dsw-alias-state-error-primary')
  })
})

describe('role matrix visual contract', () => {
  it('keeps ordinary cards flat and reserves fill for selected or stateful content', () => {
    expect(css).toMatch(/\.card\s*\{[^}]*background:\s*transparent/s)
    expect(heroCss).toMatch(/\.dsh-hero-entry__card\s*\{[^}]*background:\s*transparent/s)
    expect(css).not.toContain('linear-gradient')
    expect(heroCss).not.toContain('linear-gradient')
  })

  it('covers focus-visible and disabled control states', () => {
    expect(css).toMatch(/\.search:focus-visible\s*\{[^}]*outline:/s)
    expect(css).toMatch(/\.card:focus-visible\s*\{[^}]*outline:/s)
    expect(css).toMatch(/\.card:disabled[\s\S]*cursor:\s*not-allowed/s)
    expect(css).toMatch(/\.retry:disabled[\s\S]*opacity:/s)
    expect(heroCss).toMatch(/\.dsh-hero-entry__card:focus-visible\s*\{[^}]*outline:/s)
    expect(heroCss).toMatch(/\.dsh-hero-entry__card:disabled[\s\S]*cursor:\s*not-allowed/s)
  })

  it('keeps error surfaces on semantic state tokens', () => {
    expect(css).toContain('color-mix(in srgb, var(--dsw-alias-state-error-primary)')
    expect(css).not.toContain('#c0392b')
    expect(css).not.toContain('rgba(192, 57, 43')
  })

  it('pins the business-card grid: 340px floor column and a 96px portrait', () => {
    // 用户裁决的版式（2026-09-20）：标准窗口一行三张名片、头像要大。
    // 判据钉的是**这两条几何事实**——列宽下限决定 3/2/1 列（窄窗口降列），
    // 头像 96px 是「大头像」的可测量形式；只钉「看起来变大了」不是判据。
    expect(css).toMatch(/\.cards\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(340px,\s*1fr\)\)/s)
    expect(css).toMatch(/\.cardAvatar\s*\{[^}]*width:\s*96px;[^}]*height:\s*96px;/s)
    expect(css).toMatch(/\.cardEmpNo\s*\{[^}]*font-family:\s*var\(--dsw-font-mono\)/s)
  })

  it.each([
    ['page', '--dsw-font-xl-24', ['title']],
    ['section', '--dsw-font-l-20', ['planeName']],
    ['panel', '--dsw-font-base-strong-16', ['domainName', 'cardName']],
    ['body', '--dsw-font-s-14', ['subtitle', 'search', 'state', 'planePurpose', 'cardRole', 'cardBrief', 'detail']],
    ['control', '--dsw-font-s-14', ['retry']],
    ['meta', '--dsw-font-xs-13', ['total', 'planeCount', 'domainCount', 'cardEmpNo', 'badge', 'detailLabel', 'chip', 'footer']],
  ] as const)('assigns %s typography by content role without local size overrides', (role: string, fallback: string, selectors: readonly string[]) => {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const selector of selectors) {
      const block = code.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1]
      expect(block, `missing .${selector}`).toBeDefined()
      expect(block?.match(/\bfont:\s*([^;]+);/)?.[1], `.${selector} typography`).toBe(
        `var(--sanbao-font-${role}, var(${fallback}))`,
      )
      expect(block, `.${selector} must follow central font preferences`).not.toMatch(/\b(?:font-size|font-weight|line-height)\s*:/)
    }
  })

  it('keeps detail values inherited, code identity monospaced and briefs clamped', () => {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const value = code.match(/\.detailValue\s*\{([^}]*)\}/)?.[1]
    expect(value).toBeDefined()
    expect(value).not.toMatch(/\bfont(?:-size|-family|-weight)?\s*:|\bline-height\s*:/)
    expect(code).toMatch(/\.cardEmpNo\s*\{[^}]*font:[^;]+;\s*font-family:\s*var\(--dsw-font-mono\)/)
    expect(code).toMatch(/\.cardBrief\s*\{[^}]*-webkit-line-clamp:\s*2/)
    for (const selector of ['entry', 'entryBadge']) {
      const block = code.match(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`))?.[1]
      expect(block).toBeDefined()
      expect(block).not.toContain('--sanbao-font-')
    }
  })

  it('pins the 180ms motion and reduced-motion fallback', () => {
    expect(css).toContain('180ms')
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/)
    expect(heroCss).toContain('180ms')
    expect(heroCss).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/)
    expect(heroCss).toMatch(/@container \(max-width:\s*620px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s)
  })
})
