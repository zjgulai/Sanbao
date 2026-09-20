import z from "@deepseek-ai/schemastery";
import { CODE_FONT_IDS, CODE_FONT_SIZES, DEFAULT_THEME_STUDIO_SETTINGS, UI_FONT_IDS, UI_FONT_SIZES, THEME_IDS, THEME_TYPOGRAPHY_FIELDS, decodeThemeStudioSettings, hasSavedThemeIdentity, type ThemeStudioSettings } from "./theme-settings.js";
import { SANBAO_TOKEN_CSS } from "./client/sanbao-tokens.js";
import { buildThemeTokenOverrides } from "./client/theme-tokens.js";
import { CODE_FONT_STACKS, UI_FONT_STACKS } from "./client/theme-typography.js";

export const AppearanceSchema = z.object({
  themeId: z.union([...THEME_IDS]).default("light"),
  uiFont: z.union([...UI_FONT_IDS]).default("system"),
  codeFont: z.union([...CODE_FONT_IDS]).default("sf-mono"),
  uiFontSize: z.union([...UI_FONT_SIZES]).default(14),
  codeFontSize: z.union([...CODE_FONT_SIZES]).default(12),
});
/** Stronger than body declarations and normal presenter inline overrides, without DOM observers. */
export function appearanceOverrideCss(settings: ThemeStudioSettings): string {
  return `body[data-sanbao-theme] { ${Object.entries(buildThemeTokenOverrides(settings)).map(([key, pair]) => `${key}: ${pair.light} !important;`).join(" ")} }`;
}
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** Generate each request from the current Host value. Only allowed identities/fonts/numbers reach CSS. */
export function themeBootRows(section: unknown, user: unknown, official: unknown) {
  const saved = hasSavedThemeIdentity(user) ? decodeThemeStudioSettings(section) : undefined;
  const partial: Partial<ThemeStudioSettings> = {};
  if (!saved && user !== null && typeof user === "object" && !Array.isArray(user)) {
    for (const field of THEME_TYPOGRAPHY_FIELDS) {
      if (!Object.hasOwn(user, field)) continue;
      const value = (user as Record<string, unknown>)[field];
      if (decodeThemeStudioSettings({ ...DEFAULT_THEME_STUDIO_SETTINGS, [field]: value })) {
        Object.assign(partial, { [field]: value });
      }
    }
  }
  const preference = official && typeof official === "object" && "preference" in official ? official.preference : "system";
  const fallback = preference === "light" || preference === "dark" ? preference : "system";
  const data = {
    saved, partial, fallback, defaults: DEFAULT_THEME_STUDIO_SETTINGS,
    ids: THEME_IDS, uiFonts: UI_FONT_STACKS, codeFonts: CODE_FONT_STACKS,
    uiSizeValues: UI_FONT_SIZES, codeSizeValues: CODE_FONT_SIZES,
    uiSizes: Object.fromEntries(UI_FONT_SIZES.map(uiFontSize => [uiFontSize, buildThemeTokenOverrides({ ...DEFAULT_THEME_STUDIO_SETTINGS, uiFontSize })])),
    codeSizes: Object.fromEntries(CODE_FONT_SIZES.map(codeFontSize => [codeFontSize, Object.fromEntries(Object.entries(buildThemeTokenOverrides({ ...DEFAULT_THEME_STUDIO_SETTINGS, codeFontSize })).filter(([key]) => key.includes("markdown-code")))])),
  };
  return [
    { kind: "style" as const, text: SANBAO_TOKEN_CSS },
    { kind: "script" as const, placement: "body" as const, text: `(() => {
      const d = ${safeJson(data)};
      const scheme = d.fallback === 'system' ? (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : d.fallback;
      const fonts = [['uiFont', Object.keys(d.uiFonts)], ['codeFont', Object.keys(d.codeFonts)], ['uiFontSize', d.uiSizeValues], ['codeFontSize', d.codeSizeValues]];
      let settings = d.saved;
      if (!settings) {
        let cached, legacy;
        try { cached = JSON.parse(localStorage.getItem('dsh-theme/settings/v2')); } catch {}
        const valid = cached && d.ids.includes(cached.themeId) && fonts.every(([field, allowed]) => allowed.includes(cached[field]));
        if (valid) settings = cached;
        else {
          try { legacy = JSON.parse(localStorage.getItem('dsh-theme/settings/v1')); } catch {}
          settings = {...d.defaults, themeId: scheme};
          if (legacy) for (const [field, allowed] of fonts) {
            if (allowed.includes(legacy[field])) settings[field] = legacy[field];
          }
        }
        settings = {...settings, ...d.partial};
      }
      document.body.dataset.sanbaoTheme = settings.themeId;
      document.body.dataset.sanbaoInitialScheme = scheme;
      document.body.style.setProperty('color-scheme', settings.themeId === 'dark' ? 'dark' : 'light');
      const tokens = {...d.uiSizes[settings.uiFontSize], ...d.codeSizes[settings.codeFontSize]};
      for (const [key,pair] of Object.entries(tokens)) document.body.style.setProperty(key,pair.light,'important');
      document.body.style.setProperty('--dsw-font-family',d.uiFonts[settings.uiFont],'important');
      document.body.style.setProperty('--ds-font-family-code',d.codeFonts[settings.codeFont],'important');
      document.body.style.setProperty('--dsw-font-mono',d.codeFonts[settings.codeFont],'important');
      document.body.dataset.sanbaoBootTokens = JSON.stringify({
        ...Object.fromEntries(Object.entries(tokens).map(([key,pair]) => [key,pair.light])),
        '--dsw-font-family': d.uiFonts[settings.uiFont],
        '--ds-font-family-code': d.codeFonts[settings.codeFont],
        '--dsw-font-mono': d.codeFonts[settings.codeFont],
        'color-scheme': settings.themeId === 'dark' ? 'dark' : 'light'
      });
    })()` },
  ];
}
