/**
 * Stylesheet discipline — the three token laws, asserted instead of trusted.
 *
 * Why a test rather than a review habit: every failure this file guards against
 * is **silent**. A hallucinated token name is valid CSS, so the declaration
 * quietly falls back to its literal. A `font-size` without its paired
 * `line-height` renders fine until the text wraps. A brand literal outside the
 * brand block still paints — it just stops following the theme. None of these
 * produce an error, a warning, or a visible defect in the theme they were
 * written in. The measured cost of that silence is on record: eight
 * hallucinated tokens accumulated in
 * `scripts/gates/theme-tokens-baseline.json`, and the previous revision of this
 * very stylesheet shipped `--dsw-font-mono` — a name our own theme plugin
 * defines on a path that never reaches the page, so it resolved to nothing in
 * both themes while a static gate called it "defined".
 *
 * The rules:
 *
 *  A. **Literals live in the brand block only.** Every `#hex` / `rgb()` /
 *     `rgba()` / `hsl()` outside a `var(…, <literal>)` fallback must sit inside
 *     the single `.root, .entry` declaration block, or be a colour named in a
 *     comment. Brand colour is fixed by brand, so it is the one thing that may
 *     not be a token; everything else must be.
 *  B. **Fallbacks are the truth, not a guess** — shape-checked here (never a
 *     named colour like `black`, which is a different colour per theme engine);
 *     the values themselves are verified against the live engine by
 *     `pnpm run accept:theme-tokens`, which is the only instrument that can.
 *  C. **Type rides semantic shorthands with official fallbacks.** No bare
 *     `font-size`/`line-height` pairs: the theme owns the pairing and scaling.
 *     Where a shorthand is deliberately followed by a family/variant override,
 *     the order is asserted — `font:` resets both, so a reversed pair silently
 *     undoes the override.
 *  D. **Token names are well formed**, so a typo fails here rather than in a
 *     theme nobody is currently looking at.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// vitest runs with cwd pinned to the package root (the established convention in
// this repo's sibling plugin tests).
const CSS_PATH = join(process.cwd(), 'src/client/newapp.module.css')
const css = readFileSync(CSS_PATH, 'utf8')

/** Strip block comments, so prose about colours is not read as colour. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

const code = stripComments(css)
const lines = code.split('\n')

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g

describe('stylesheet tokens', () => {
  it('uses global accent, selected and hover colours instead of a private palette', () => {
    const block = (selector: string) => code.slice(code.indexOf(`${selector} {`)).split('}')[0]
    expect(block('.sysRole')).toContain('color: var(--sanbao-accent)')
    expect(block('.sysRole')).toContain('background: var(--sanbao-selected)')
    expect(block('.sysCard:hover:not(:disabled)')).toContain('background: var(--sanbao-hover)')
    expect(block('.sysCard:hover:not(:disabled) .sysIcon')).toContain('color: var(--sanbao-accent)')
    expect(block('.sysCard:hover:not(:disabled) .sysIcon')).toContain('background: var(--sanbao-selected)')
    expect(code.match(/--lute-(?:brand[\w-]*|on-brand)/g)).toBeNull()
    expect(code.match(/#58b848|#3e9b33|#8fd48a|#2a722e|88,\s*184,\s*72|drop-shadow/gi)).toBeNull()
  })

  it('keeps every colour literal inside a token fallback (Law A)', () => {
    const outside: string[] = []
    lines.forEach((line, i) => {
      const hits = line.match(COLOR_LITERAL)
      if (hits === null) return
      // A literal inside a `var()` fallback is Law B, checked separately.
      const inFallback = /var\(\s*--[a-z0-9-]+\s*,[^)]*(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/.test(line)
      if (inFallback) return
      outside.push(`${String(i + 1)}: ${line.trim()}`)
    })
    expect(outside, 'colour literals outside token fallbacks').toEqual([])
  })

  it('uses no named colours as fallbacks (Law B)', () => {
    // A named colour is a different colour in different engines, and it is the
    // shape a "just make it work" edit takes.
    for (const line of lines) {
      const named = /var\(\s*--[a-z0-9-]+\s*,\s*(black|white|red|green|blue|gray|grey|silver)\s*\)/.exec(line)
      expect(named, `named colour fallback on: ${line.trim()}`).toBeNull()
    }
  })

  it('never pairs a bare font-size with a line-height (Law C)', () => {
    // The official ladder (`--dsw-font-*`) carries the pair. A bare size is how
    // a line-height drifts away from the design system one rule at a time.
    const bareSizes = lines
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /^\s*font-size\s*:/.test(line))
    expect(bareSizes, 'bare font-size declarations — use `font: var(--dsw-font-…)`').toEqual([])
  })

  it('always takes type from semantic shorthands with official fallbacks (Law C)', () => {
    for (const line of lines) {
      const shorthand = /^\s*font\s*:/.exec(line)
      if (shorthand === null) continue
      expect(line, `font shorthand must use a supported token: ${line.trim()}`).toMatch(
        /font:\s*(?:var\(--dsw-font-[a-z0-9-]+\)|var\(--sanbao-font-(?:page|section|panel|body|control|meta),\s*var\(--dsw-font-[a-z0-9-]+\)\));/,
      )
    }
  })

  it.each([
    ['page', '--dsw-font-xl-24', ['title']],
    ['section', '--dsw-font-l-20', ['sectionTitle']],
    ['panel', '--dsw-font-base-strong-16', ['noticeTitle', 'cardLabel', 'roleTitle', 'sysName']],
    ['body', '--dsw-font-s-14', ['subtitle', 'state', 'stateError', 'noticeList', 'cardSummary', 'productFeatures', 'outcome', 'sysDesc']],
    ['control', '--dsw-font-s-14', ['ghost', 'search', 'backButton', 'primary', 'sysCard', 'sysAction']],
    ['meta', '--dsw-font-xs-13', ['total', 'cardDir', 'cardMeta', 'cardNote', 'blocked', 'footer', 'systemsMeta', 'rolePath', 'roleUnknown', 'roleCount', 'sysNameEn', 'sysKind', 'sysTag', 'sysRole', 'sysRoleMore', 'sysFlag', 'sysNote']],
  ] as const)('assigns %s typography by content role without local size overrides', (role: string, fallback: string, selectors: readonly string[]) => {
    for (const selector of selectors) {
      // The selector also occurs in grouped hit-target rules; read its font block.
      const blocks = [...code.matchAll(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`, 'g'))]
      const block = blocks.map((match) => match[1]).find((value) => /\bfont\s*:/.test(value ?? ''))
      expect(block, `missing .${selector} font block`).toBeDefined()
      expect(block?.match(/\bfont:\s*([^;]+);/)?.[1], `.${selector} typography`).toBe(
        `var(--sanbao-font-${role}, var(${fallback}))`,
      )
      expect(block, `.${selector} must follow central font preferences`).not.toMatch(/\b(?:font-size|font-weight|line-height)\s*:/)
    }
  })

  it('keeps navigation and the icon-only close glyph outside the page ladder', () => {
    for (const selector of ['.entry', 'button[class*="newSession"][data-lute-navrow]', '.close']) {
      const start = code.indexOf(`${selector} {`)
      expect(start, `missing ${selector}`).toBeGreaterThanOrEqual(0)
      const block = code.slice(start, code.indexOf('}', start))
      expect(block).not.toContain('--sanbao-font-')
    }
  })

  it('orders family/numeric overrides after the font shorthand they override (Law C)', () => {
    // `font:` is a shorthand and resets font-family *and* font-variant. A
    // reversed pair is valid CSS that silently does nothing.
    const declarations = code.split('}')
    for (const block of declarations) {
      const fontIndex = block.search(/^\s*font\s*:/m)
      if (fontIndex < 0) continue
      for (const prop of ['font-family', 'font-variant-numeric']) {
        const overrideIndex = block.search(new RegExp(`^\\s*${prop}\\s*:`, 'm'))
        if (overrideIndex < 0) continue
        expect(
          overrideIndex,
          `${prop} must come after the shorthand that resets it:\n${block.trim()}`,
        ).toBeGreaterThan(fontIndex)
      }
    }
  })

  it('names only well-formed dsw tokens (Law D)', () => {
    const tokens = new Set(code.match(/var\(\s*(--[a-z0-9-]+)/g)?.map((m) => m.replace(/var\(\s*/, '')) ?? [])
    const vendor = [...tokens].filter((token) => /^--(dsw|ds)-/.test(token))
    expect(vendor.length).toBeGreaterThan(10)
    for (const token of vendor) {
      // At least two non-empty segments after the vendor prefix: `--dsw-` and
      // `--dsw-alias-` are prefix fragments, not token names.
      expect(token, `ill-formed token name: ${token}`).toMatch(/^--(dsw|ds)-[a-z0-9]+(-[a-z0-9]+)+$/)
    }
    // Drawer typography also consumes the shared Sanbao semantic ladder.
    for (const token of tokens) {
      const isOurs = token.startsWith('--lute-')
      const isVendor = /^--(dsw|ds)-/.test(token)
      const isTypography = /^--sanbao-font-(page|section|panel|body|control|meta)$/.test(token)
      const isColor = /^--sanbao-(accent|accent-fill|on-accent|selected|hover|border)$/.test(token)
      expect(isOurs || isVendor || isTypography || isColor, `un-namespaced custom property: ${token}`).toBe(true)
    }
  })

  it('no longer claims the theme plugin token that never reaches the page', () => {
    // `--dsw-font-mono` is declared by dsh-theme-local's override map but lands
    // on a path that never reaches the rendered page (measured: resolves to
    // `rgba(0, 0, 0, 0)` in both themes under `pnpm run accept:theme-tokens`).
    // Referencing it looks themed and is not.
    expect(code).not.toContain('--dsw-font-mono')
    expect(code).toContain('--ds-font-family-code')
  })

  it('pairs primary launch fills with the global on-accent foreground', () => {
    expect(code).toMatch(/\.primary\s*\{[^}]*color:\s*var\(--sanbao-on-accent\);[^}]*background:\s*var\(--sanbao-accent-fill\)/)
    expect(code).toMatch(/\.primary:hover:not\(:disabled\)\s*\{[^}]*border-color:\s*var\(--sanbao-accent-fill\);[^}]*background:\s*var\(--sanbao-accent-fill\)/)
  })

  it('keeps reduced-motion and focus-visible coverage', () => {
    // Both are shell-wide expectations; a drawer that animates under
    // `prefers-reduced-motion` is the accessibility regression that ships
    // silently because nobody runs the OS setting during review.
    expect(code).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    for (const selector of ['.ghost:focus-visible', '.close:focus-visible', '.search:focus-visible', '.primary:focus-visible', '.entry:focus-visible', '.sysCard:focus-visible']) {
      expect(code, `missing ${selector}`).toContain(selector)
    }
  })
})

/**
 * Every class name the components ask this stylesheet for, and every class name
 * the stylesheet defines — so the two sets can be compared.
 *
 * Why this exists: `css['x'] ?? ''` is the idiom every component here uses, so a
 * class name that does not resolve renders as an *empty class attribute* — a
 * perfectly valid, perfectly unstyled card, with nothing logged. The same
 * silence runs the other way: a rule left behind after its component stopped
 * rendering is dead CSS that reads like live UI to the next person.
 */
function askersAndDefinitions(): { asked: Set<string>; defined: Set<string> } {
  const asked = new Set<string>()
  // Every file that renders against this stylesheet. The section files joined
  // the list when the drawer gained its second section: a class defined but
  // never asked for is dead CSS, and the check is only worth running if it
  // covers the components that exist.
  for (const file of ['NewAppPanel.tsx', 'SystemsSection.tsx', 'sidebar-entry-core.ts']) {
    const text = stripComments(readFileSync(join(process.cwd(), 'src/client', file), 'utf8'))
    for (const match of text.matchAll(/css\['([A-Za-z0-9_-]+)'\]/g)) asked.add(match[1]!)
  }
  const defined = new Set<string>()
  for (const match of code.matchAll(/^\.([A-Za-z][A-Za-z0-9_-]*)/gm)) defined.add(match[1]!)
  return { asked, defined }
}

describe('matrix layout (M3)', () => {
  it('lays the product cards out as a wrapping grid, not a column', () => {
    // M3: 「大卡片的矩阵形式」. The complaint this answers is concrete — the old
    // shape was a flex column, so 25 cards stacked one per row and every one of
    // them was as short as a list item.
    expect(code).toMatch(/\.grid\s*\{[^}]*display:\s*grid/)
    expect(code).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(/)
  })

  it('keeps the card a card at every width, so the count is the only thing that moves', () => {
    // `auto-fill` + `minmax` is what makes the column count follow the viewport.
    // A hard `repeat(3, 1fr)` would be three cards on a phone; a percentage
    // would be one, always.
    const gridStart = code.indexOf('.grid {')
    expect(gridStart).toBeGreaterThanOrEqual(0)
    const block = code.slice(gridStart, code.indexOf('}', gridStart))
    expect(block).toContain('auto-fill')
    expect(block).not.toMatch(/repeat\(\s*\d/)
    // The cell is a card, not a row: it must be allowed to be tall.
    expect(code).toMatch(/\.card\s*\{[^}]*align-items:\s*stretch/)
  })

  it('defines every class the components ask for, and asks for every class it defines', () => {
    const { asked, defined } = askersAndDefinitions()
    expect(asked.size).toBeGreaterThan(20)
    // A rule for a class nothing renders is how a retired UI keeps looking alive.
    const orphaned = [...defined].filter((name) => !asked.has(name)).sort()
    expect(orphaned, 'stylesheet rules no component asks for').toEqual([])
    // A class asked for but never defined is an empty class attribute: valid
    // HTML, no styling, no error.
    const missing = [...asked].filter((name) => !defined.has(name)).sort()
    expect(missing, 'class names the components ask for but the stylesheet lacks').toEqual([])
  })
})

describe('Codex drawer visual contract (B4-UI-405A)', () => {
  function block(selector: string): string {
    const start = code.indexOf(`${selector} {`)
    expect(start, `missing ${selector} block`).toBeGreaterThanOrEqual(0)
    return code.slice(start, code.indexOf('}', start) + 1)
  }

  it('keeps drawer actions on one 32px hit-target baseline with a shared focus ring', () => {
    const controls = block('.ghost,\n.close,\n.primary')
    expect(controls).toContain('box-sizing: border-box')
    expect(controls).toContain('min-height: 32px')
    expect(block('.close')).toMatch(/width:\s*32px[\s\S]*height:\s*32px/)
    expect(code).toMatch(
      /\.ghost:focus-visible,\s*\.close:focus-visible,\s*\.primary:focus-visible\s*\{[\s\S]*outline:\s*2px solid var\(--sanbao-accent\)[\s\S]*outline-offset:\s*2px/,
    )
  })

  it('keeps product and system cards quiet, while retaining semantic state styling', () => {
    expect(block('.card')).not.toContain('box-shadow')
    expect(block('.sysCard')).not.toContain('box-shadow')
    expect(block('.sysIcon')).not.toContain('box-shadow')
    expect(block('.sysKind')).not.toContain('box-shadow')
    expect(block('.sysRole')).not.toContain('box-shadow')
    expect(block('.sysCard')).toContain('border-radius: 10px')
    expect(block('.state')).toContain('label-secondary')
    expect(block('.stateError')).toContain('state-error-primary')
    expect(block('.primary:disabled')).toContain('cursor: not-allowed')
    expect(block('.sysCard:disabled')).toContain('opacity: 0.6')
  })

  it('allows status copy and both grids to reflow on narrow drawers', () => {
    expect(block('.panel')).toContain('box-sizing: border-box')
    const mobile = code.slice(code.indexOf('@media (max-width: 700px)'))
    expect(mobile).toMatch(/\.panel\s*\{[\s\S]*width:\s*100vw[\s\S]*max-width:\s*100vw/)
    expect(mobile).toMatch(/\.titleRow\s*\{[\s\S]*flex-wrap:\s*wrap/)
    expect(mobile).toMatch(/\.sectionHead\s*\{[\s\S]*flex-wrap:\s*wrap/)
    expect(mobile).toMatch(/\.grid,\s*\.sysGrid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(block('.stateError')).toContain('flex-wrap: wrap')
  })
})
