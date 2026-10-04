/** Electron main-process theme application without importing Electron into the pure test seam. */

export type RequestedDisplayTheme = 'system' | 'light' | 'dark'

export interface NativeThemePort {
  themeSource: RequestedDisplayTheme
}

export type DisplayThemeApplyResult =
  | Readonly<{
      state: 'applied'
      requestedTheme: RequestedDisplayTheme
      themeSource: RequestedDisplayTheme
    }>
  | Readonly<{
      state: 'refused'
      code: 'invalid-requested-theme' | 'native-theme-unavailable' | 'native-theme-apply-failed'
      requestedTheme: RequestedDisplayTheme | null
    }>

export interface DisplayThemeAdapter {
  readonly apply: (requestedTheme: unknown) => DisplayThemeApplyResult
}

function isRequestedDisplayTheme(value: unknown): value is RequestedDisplayTheme {
  return value === 'system' || value === 'light' || value === 'dark'
}

function refusal(
  code: Extract<DisplayThemeApplyResult, { state: 'refused' }>['code'],
  requestedTheme: RequestedDisplayTheme | null,
): DisplayThemeApplyResult {
  return Object.freeze({ state: 'refused', code, requestedTheme })
}

/**
 * Adapt Electron's `nativeTheme` behind an injectable port.
 *
 * Applying a requested source never derives an effective light/dark value. That observation stays
 * with the existing main-owned preference snapshot; an unavailable, throwing, or mismatched port
 * is a refusal rather than a guessed success.
 */
export function createDisplayThemeAdapter(port: NativeThemePort | null | undefined): DisplayThemeAdapter {
  return Object.freeze({
    apply(requestedTheme: unknown): DisplayThemeApplyResult {
      if (!isRequestedDisplayTheme(requestedTheme)) return refusal('invalid-requested-theme', null)
      if (port === null || port === undefined) return refusal('native-theme-unavailable', requestedTheme)

      try {
        port.themeSource = requestedTheme
        if (port.themeSource !== requestedTheme) return refusal('native-theme-apply-failed', requestedTheme)
      } catch {
        return refusal('native-theme-apply-failed', requestedTheme)
      }

      return Object.freeze({ state: 'applied', requestedTheme, themeSource: requestedTheme })
    },
  })
}
