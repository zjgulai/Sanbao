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
  'bubble',
  'ink',
  'muted',
  'faint',
  'divider',
  'divider-hairline',
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

// VF-1 (ADR-0336): values re-based onto Qoder 0.4.4 mint-light/dark live readings
// (assets/qoder-reference/re-0.4.4/ + screenshots/base-2026101{2,3}). The sidebar/overlay
// greens are Qoder's accent-mix derivation flattened to literals (mix(accent 18%/28%, white));
// the derivation is recorded in the ADR. WCAG deviations are Qoder's own values, deliberately
// preserved for fidelity — see the ADR deviation list. divider-hairline is the VF-2 card-row
// separator sampled from the live settings screenshots (#f0f7f4 light / #262624 dark).
const LIGHT_THEME_TOKENS: SageThemeTokens = Object.freeze({
  canvas: '#f9f9f9',
  sidebar: '#dff1ea',
  surface: '#ffffff',
  raised: '#ffffff',
  overlay: '#cfe0d9',
  bubble: '#e6f5f0',
  ink: '#141414',
  muted: '#636261',
  faint: '#838280',
  divider: '#eeeae5',
  'divider-hairline': '#f0f7f4',
  border: '#ddd8d2',
  brand: '#4fa98f',
  focus: '#3b81e9',
  success: '#579b6e',
  warning: '#efb041',
  danger: '#e04b53',
  radius: '12px',
  shadow: '0 0 0 1px rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04)',
  spacing: '8px',
  motion: '160ms cubic-bezier(0.2, 0, 0, 1)',
})

const DARK_THEME_TOKENS: SageThemeTokens = Object.freeze({
  canvas: '#111110',
  sidebar: '#1a251c',
  surface: '#22221f',
  raised: '#1c1b19',
  overlay: '#1e2f21',
  bubble: '#1c281d',
  ink: '#eeeeeb',
  muted: '#b4b4ac',
  faint: '#7b7b74',
  divider: '#20201e',
  'divider-hairline': '#262624',
  border: '#31312d',
  brand: '#5cb870',
  focus: '#0b83f1',
  success: '#73cd94',
  warning: '#faad14',
  danger: '#ff8a8e',
  radius: '12px',
  shadow: '0 0 0 1px rgba(255, 255, 255, 0.08)',
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
