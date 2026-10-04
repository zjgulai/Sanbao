/**
 * Sage-owned semantic theme tokens.
 *
 * Literal palette values live here so renderer styles can consume semantic CSS variables without
 * creating a second palette. The `unknown` selector is intentionally only a visual fallback: it
 * follows the browser's system color-scheme media query without changing the authoritative
 * `data-sage-theme-effective="unknown"` observation.
 */

export const SAGE_THEME_TOKEN_NAMES = Object.freeze([
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
  'radius',
  'shadow',
  'spacing',
  'motion',
] as const)

export type SageThemeTokenName = (typeof SAGE_THEME_TOKEN_NAMES)[number]
export type SageResolvedTheme = 'light' | 'dark'
export type SageThemeTokens = Readonly<Record<SageThemeTokenName, string>>

const LIGHT_THEME_TOKENS: SageThemeTokens = Object.freeze({
  canvas: '#f5f7f5',
  sidebar: '#eef2ef',
  surface: '#ffffff',
  raised: '#f7faf8',
  overlay: '#e7eee9',
  ink: '#17201d',
  muted: '#48574f',
  faint: '#5d6c64',
  divider: '#687970',
  border: '#53645b',
  brand: '#166642',
  focus: '#7a4b00',
  success: '#1b6b45',
  warning: '#815500',
  danger: '#a52f32',
  radius: '12px',
  shadow: '0 24px 64px rgba(22, 36, 29, 0.18)',
  spacing: '8px',
  motion: '160ms cubic-bezier(0.2, 0, 0, 1)',
})

const DARK_THEME_TOKENS: SageThemeTokens = Object.freeze({
  canvas: '#0c1211',
  sidebar: '#101816',
  surface: '#141e1b',
  raised: '#1a2723',
  overlay: '#22322d',
  ink: '#f4f7f5',
  muted: '#b6c1bc',
  faint: '#94a29c',
  divider: '#7a8b83',
  border: '#82948b',
  brand: '#8ed9b4',
  focus: '#f0c97c',
  success: '#75d6a2',
  warning: '#f0c36e',
  danger: '#ff9b8f',
  radius: '12px',
  shadow: '0 24px 64px rgba(0, 0, 0, 0.38)',
  spacing: '8px',
  motion: '160ms cubic-bezier(0.2, 0, 0, 1)',
})

export const SAGE_THEME_TOKENS: Readonly<Record<SageResolvedTheme, SageThemeTokens>> = Object.freeze({
  light: LIGHT_THEME_TOKENS,
  dark: DARK_THEME_TOKENS,
})

/** Geometry-only density roles stay independent from the light/dark palette. */
export const SAGE_DENSITY_TOKEN_NAMES = Object.freeze([
  'nav-item-padding',
  'main-padding',
  'card-padding',
  'row-gap',
  'control-min-height',
] as const)

export type SageDensityTokenName = (typeof SAGE_DENSITY_TOKEN_NAMES)[number]
export type SageResolvedDensity = 'comfortable' | 'compact'
export type SageDensityTokens = Readonly<Record<SageDensityTokenName, string>>

const COMFORTABLE_DENSITY_TOKENS: SageDensityTokens = Object.freeze({
  'nav-item-padding': '.72rem .75rem',
  'main-padding': '1.5rem clamp(1.25rem, 4vw, 4rem) 2rem',
  'card-padding': '1.35rem',
  'row-gap': '.55rem',
  'control-min-height': '1.85rem',
})

const COMPACT_DENSITY_TOKENS: SageDensityTokens = Object.freeze({
  'nav-item-padding': '.5rem .6rem',
  'main-padding': '1rem clamp(.9rem, 3vw, 2.5rem) 1.25rem',
  'card-padding': '1rem',
  'row-gap': '.4rem',
  'control-min-height': '1.6rem',
})

export const SAGE_DENSITY_TOKENS: Readonly<Record<SageResolvedDensity, SageDensityTokens>> = Object.freeze({
  comfortable: COMFORTABLE_DENSITY_TOKENS,
  compact: COMPACT_DENSITY_TOKENS,
})

function renderDeclarations(theme: SageResolvedTheme, indentation = '  '): string {
  const tokens = SAGE_THEME_TOKENS[theme]
  return [
    `${indentation}color-scheme: ${theme};`,
    ...SAGE_THEME_TOKEN_NAMES.map((name) => `${indentation}--sage-${name}: ${tokens[name]};`),
  ].join('\n')
}

function renderExplicitTheme(theme: SageResolvedTheme): string {
  return `:root[data-sage-theme-effective="${theme}"] {\n${renderDeclarations(theme)}\n}`
}

function renderSystemFallback(theme: SageResolvedTheme): string {
  return [
    `@media (prefers-color-scheme: ${theme}) {`,
    '  :root[data-sage-theme-effective="unknown"],',
    '  :root:not([data-sage-theme-effective]) {',
    renderDeclarations(theme, '    '),
    '  }',
    '}',
  ].join('\n')
}

/** Render the complete token sheet for the Sage product document. */
export function renderSageThemeTokenCss(): string {
  return [
    renderExplicitTheme('light'),
    renderExplicitTheme('dark'),
    renderSystemFallback('light'),
    renderSystemFallback('dark'),
  ].join('\n\n')
}

function renderDensityDeclarations(density: SageResolvedDensity, indentation = '  '): string {
  const tokens = SAGE_DENSITY_TOKENS[density]
  return SAGE_DENSITY_TOKEN_NAMES
    .map((name) => `${indentation}--sage-density-${name}: ${tokens[name]};`)
    .join('\n')
}

function renderExplicitDensity(density: SageResolvedDensity): string {
  return `:root[data-sage-density="${density}"] {\n${renderDensityDeclarations(density)}\n}`
}

function renderUnknownDensityFallback(): string {
  return [
    ':root[data-sage-density="unknown"],',
    ':root:not([data-sage-density]) {',
    renderDensityDeclarations('comfortable'),
    '}',
  ].join('\n')
}

/** Render density geometry without changing theme, typography, or business state. */
export function renderSageDensityTokenCss(): string {
  return [
    renderExplicitDensity('comfortable'),
    renderExplicitDensity('compact'),
    renderUnknownDensityFallback(),
  ].join('\n\n')
}
