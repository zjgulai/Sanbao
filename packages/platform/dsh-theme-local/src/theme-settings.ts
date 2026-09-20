import { THEME_IDS, themeColorScheme, type ThemeId } from "./client/sanbao-tokens.js";
export { THEME_IDS, themeColorScheme, type ThemeId };

export const THEME_SETTINGS_NAMESPACE = "sanbao-appearance";
export const UI_FONT_IDS = ["system", "inter", "avenir", "rounded", "serif"] as const;
export const CODE_FONT_IDS = ["sf-mono", "jetbrains", "fira-code", "menlo", "cascadia"] as const;
export const UI_FONT_SIZES = [12, 13, 14, 15, 16] as const;
export const CODE_FONT_SIZES = [11, 12, 13, 14, 15] as const;
export const THEME_TYPOGRAPHY_FIELDS = ["uiFont", "codeFont", "uiFontSize", "codeFontSize"] as const;
export const THEME_STUDIO_FIELDS = ["themeId", ...THEME_TYPOGRAPHY_FIELDS] as const;
export type ThemeTypographyField = (typeof THEME_TYPOGRAPHY_FIELDS)[number];
export type ThemeStudioField = (typeof THEME_STUDIO_FIELDS)[number];
export type UiFontId = (typeof UI_FONT_IDS)[number];
export type CodeFontId = (typeof CODE_FONT_IDS)[number];
export type UiFontSize = (typeof UI_FONT_SIZES)[number];
export type CodeFontSize = (typeof CODE_FONT_SIZES)[number];
export interface ThemeStudioSettings {
  themeId: ThemeId;
  uiFont: UiFontId;
  codeFont: CodeFontId;
  uiFontSize: UiFontSize;
  codeFontSize: CodeFontSize;
}
export const DEFAULT_THEME_STUDIO_SETTINGS: ThemeStudioSettings = {
  themeId: "light", uiFont: "system", codeFont: "sf-mono", uiFontSize: 14, codeFontSize: 12,
};
function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function isOneOf<const T>(value: unknown, candidates: readonly T[]): value is T {
  return candidates.includes(value as T);
}
/** Decode v2; neither arbitrary colors nor unknown fields survive. */
export function decodeThemeStudioSettings(section: unknown): ThemeStudioSettings | undefined {
  const r = recordOf(section);
  if (!isOneOf(r.themeId, THEME_IDS) || !isOneOf(r.uiFont, UI_FONT_IDS) ||
    !isOneOf(r.codeFont, CODE_FONT_IDS) || !isOneOf(r.uiFontSize, UI_FONT_SIZES) ||
    !isOneOf(r.codeFontSize, CODE_FONT_SIZES)) return undefined;
  return { themeId: r.themeId, uiFont: r.uiFont, codeFont: r.codeFont, uiFontSize: r.uiFontSize, codeFontSize: r.codeFontSize };
}
/** Ignore legacy colors and independently preserve valid typography fields. */
export function migrateLegacyThemeSettings(section: unknown, initialScheme: "light" | "dark"): ThemeStudioSettings {
  const r = recordOf(section);
  const d = DEFAULT_THEME_STUDIO_SETTINGS;
  return {
    themeId: initialScheme,
    uiFont: isOneOf(r.uiFont, UI_FONT_IDS) ? r.uiFont : d.uiFont,
    codeFont: isOneOf(r.codeFont, CODE_FONT_IDS) ? r.codeFont : d.codeFont,
    uiFontSize: isOneOf(r.uiFontSize, UI_FONT_SIZES) ? r.uiFontSize : d.uiFontSize,
    codeFontSize: isOneOf(r.codeFontSize, CODE_FONT_SIZES) ? r.codeFontSize : d.codeFontSize,
  };
}
export function resetThemeColors(settings: ThemeStudioSettings): ThemeStudioSettings {
  return { ...settings, themeId: "light" };
}
/** Schema defaults in .value do not prove a user saved an identity. */
export function hasSavedThemeIdentity(user: unknown): boolean {
  return Object.hasOwn(recordOf(user), "themeId");
}
