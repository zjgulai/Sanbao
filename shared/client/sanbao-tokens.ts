/**
 * 品牌 token 源 `--sanbao-*`（单一事实源 Single Source of Truth）。
 *
 * 矩阵结构：2 模式（light / dark）× 3 季节主题（parchment / warm-pink / forest-green）共 6 态调色板。
 * 遵循 ADR-0144 / ADR-0145 与设计规格书 Section 2.3 定义。
 *
 * 经 `scripts/sync-shared.mjs` 分发（副本首行带生成标记）；改这里后跑
 * `node scripts/sync-shared.mjs --write`。
 */

export const APPEARANCE_MODES = ["light", "dark", "system"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

export const MODE_IDS = ["light", "dark"] as const;
export type ModeId = (typeof MODE_IDS)[number];

export const SEASONAL_THEMES = ["parchment", "warm-pink", "forest-green"] as const;
export type SeasonalTheme = (typeof SEASONAL_THEMES)[number];
export const THEME_IDS = SEASONAL_THEMES;
export type ThemeId = SeasonalTheme;

export interface PaletteTokens {
  canvas: string;
  sidebar: string;
  rightSidebar: string;
  panel: string;
  inset: string;
  overlay: string;
  foreground: string;
  secondary: string;
  accent: string;
  accentFill: string;
  onAccent: string;
  hover: string;
  pressed: string;
  selected: string;
  disabled: string;
  border: string;
  controlBorder: string;
  success: string;
  warning: string;
  error: string;
}

export type PaletteKey = keyof PaletteTokens;

export const SANBAO_PALETTES = Object.freeze({
  // ① 羊皮纸（Parchment · 秋季）—— Qoder CN 经典沉浸暖纸风
  "parchment-light": Object.freeze({
    canvas: "#FBF7EE", sidebar: "#F3EEE3", rightSidebar: "#F3EEE3", panel: "#FFFFFF",
    inset: "#EFE9DC", overlay: "#FFFFFF", foreground: "#2A2723", secondary: "#6B595B",
    accent: "#8C6534", accentFill: "#8C6534", onAccent: "#FFFFFF", hover: "#EFE6D5",
    pressed: "#E5DAC4", selected: "#EFE6D5", disabled: "#A09A8F", border: "#E2DAC9",
    controlBorder: "#8D8474", success: "#356B42", warning: "#8C6014", error: "#A83B3B",
  }),
  "parchment-dark": Object.freeze({
    canvas: "#1F1E1B", sidebar: "#1A1917", rightSidebar: "#161513", panel: "#161513",
    inset: "#121110", overlay: "#121110", foreground: "#EAE5DB", secondary: "#A8A195",
    accent: "#D19F5B", accentFill: "#B88542", onAccent: "#1A150D", hover: "#292723",
    pressed: "#302E29", selected: "#2D2922", disabled: "#787267", border: "#33302B",
    controlBorder: "#787163", success: "#7EA885", warning: "#D6A865", error: "#DF8282",
  }),

  // ② 暖白粉（Warm Pink White · 春季）—— 三宝品牌原生活力风
  "warm-pink-light": Object.freeze({
    canvas: "#FFF8F7", sidebar: "#F7EEEC", rightSidebar: "#F7EEEC", panel: "#FFFDFC",
    inset: "#F3E6E4", overlay: "#FFFDFC", foreground: "#382E30", secondary: "#6B595E",
    accent: "#8F5361", accentFill: "#8F5361", onAccent: "#FFFFFF", hover: "#EFE1DF",
    pressed: "#E9D8D6", selected: "#EDDBDE", disabled: "#A48F94", border: "#DCC8CD",
    controlBorder: "#A2838B", success: "#406748", warning: "#80501F", error: "#A53945",
  }),
  "warm-pink-dark": Object.freeze({
    canvas: "#211C1D", sidebar: "#1C1819", rightSidebar: "#181415", panel: "#181415",
    inset: "#120E0F", overlay: "#120E0F", foreground: "#F0E5E7", secondary: "#B8A4A8",
    accent: "#E28D9E", accentFill: "#C46D80", onAccent: "#1F0F13", hover: "#2A2325",
    pressed: "#332B2D", selected: "#332328", disabled: "#7D6B70", border: "#382A2E",
    controlBorder: "#7F676D", success: "#87B58E", warning: "#DDA675", error: "#DE7A88",
  }),

  // ③ 森林绿（Forest Green · 夏季）—— Qoder CN 极客灰绿风
  "forest-green-light": Object.freeze({
    canvas: "#F7F9F7", sidebar: "#EEF2EE", rightSidebar: "#EEF2EE", panel: "#FFFFFF",
    inset: "#E6EDE6", overlay: "#FFFFFF", foreground: "#1E241F", secondary: "#5A665C",
    accent: "#386940", accentFill: "#386940", onAccent: "#FFFFFF", hover: "#E3ECE3",
    pressed: "#D7E3D7", selected: "#E2EFE3", disabled: "#939E94", border: "#D1DDD2",
    controlBorder: "#78877A", success: "#2F6B3D", warning: "#855D18", error: "#A94040",
  }),
  "forest-green-dark": Object.freeze({
    canvas: "#232523", sidebar: "#242624", rightSidebar: "#191B1A", panel: "#191B1A",
    inset: "#131413", overlay: "#131413", foreground: "#ECEDEB", secondary: "#AFB5AF",
    accent: "#8FBC99", accentFill: "#5C9363", onAccent: "#101C12", hover: "#2E332F",
    pressed: "#343C35", selected: "#293A2D", disabled: "#737D75", border: "#3E463F",
    controlBorder: "#818E84", success: "#8FBC99", warning: "#DAB879", error: "#E49393",
  }),
}) as Record<string, PaletteTokens>;

const kebab = (key: string) => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

/**
 * 根据主题与模式构建 CSS 变量字典。
 * 支持 buildSanbaoVariables(theme, mode) 与向后兼容单入参 buildSanbaoVariables(themeKey)。
 */
export function buildSanbaoVariables(
  themeOrCombined: SeasonalTheme | `${SeasonalTheme}-${ModeId}`,
  mode?: ModeId
): Record<string, string> {
  let key: string;
  if (mode !== undefined) {
    key = `${themeOrCombined}-${mode}`;
  } else if (themeOrCombined.includes("-light") || themeOrCombined.includes("-dark")) {
    key = themeOrCombined;
  } else {
    // 兼容默认单参数：默认 light
    key = `${themeOrCombined}-light`;
  }
  const palette = SANBAO_PALETTES[key] ?? SANBAO_PALETTES["forest-green-light"];
  return Object.fromEntries(
    Object.entries(palette).map(([k, value]) => [`--sanbao-${kebab(k)}`, value])
  );
}

/** 供体契约十键 + 材质七项向后兼容映射表 */
export const COMPATIBILITY_VARIABLES = {
  bg: "canvas",
  surface: "panel",
  surface2: "inset",
  ink: "foreground",
  muted: "secondary",
  line: "border",
  good: "success",
  "metal-ink": "foreground",
  "metal-border": "border",
  "metal-fill": "panel",
  "metal-line": "border",
  "metal-highlight": "hover",
  "metal-pressed": "pressed",
} as const;

function formatDeclarations(theme: SeasonalTheme, mode: ModeId): string {
  const vars = buildSanbaoVariables(theme, mode);
  return Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join("\n    ");
}

export const SANBAO_TOKEN_CSS = `:root {
  ${Object.entries(COMPATIBILITY_VARIABLES).map(([key, value]) => `--sanbao-${key}: var(--sanbao-${value});`).join("\n  ")}
  --sanbao-on-accent: #FFFFFF;
  --sanbao-radius: var(--lute-radius-row, 8px);
  --sanbao-metal-shadow: transparent;
  --sanbao-success-surface: color-mix(in srgb, var(--sanbao-success) 10%, var(--sanbao-canvas));
  --sanbao-warning-surface: color-mix(in srgb, var(--sanbao-warning) 10%, var(--sanbao-canvas));
  --sanbao-error-surface: color-mix(in srgb, var(--sanbao-error) 10%, var(--sanbao-canvas));
  --sanbao-fast: 160ms;
  --sanbao-base: 260ms;
  --sanbao-slow: 520ms;
  --sanbao-ease: cubic-bezier(.22,1,.36,1);

  /* 默认兜底：森林绿 light */
  ${formatDeclarations("forest-green", "light")}
}

body[data-ds-dark-theme] {
  /* 默认暗色兜底：森林绿 dark */
  ${formatDeclarations("forest-green", "dark")}
}

/* 6 态选择器矩阵 [data-sanbao-theme][data-sanbao-mode] */
${SEASONAL_THEMES.map(theme => `
html[data-sanbao-theme="${theme}"][data-sanbao-mode="light"],
body[data-sanbao-theme="${theme}"][data-sanbao-mode="light"] {
  color-scheme: light;
  ${formatDeclarations(theme, "light")}
}

html[data-sanbao-theme="${theme}"][data-sanbao-mode="dark"],
body[data-sanbao-theme="${theme}"][data-sanbao-mode="dark"] {
  color-scheme: dark;
  ${formatDeclarations(theme, "dark")}
}
`).join("\n")}
`;

/** 注入 style 标签的 data 锚（幂等判据，也是浏览器探针可观察的自报面）。 */
const STYLE_ANCHOR = "sanbaoTokens";

/**
 * 幂等注入 `--sanbao-*` token（与 ensureLuteTokens 同一形状）。
 * @returns 注入的标签（本次未注入时返回既有标签；无 document 时返回 undefined）。
 */
export function ensureSanbaoTokens(doc: Document = (typeof document !== "undefined" ? document : undefined as any)): HTMLStyleElement | undefined {
  if (!doc) return undefined;
  const existing = doc.querySelector<HTMLStyleElement>(`style[data-sanbao-tokens="${STYLE_ANCHOR}"]`);
  if (existing !== null) return existing;
  const style = doc.createElement("style");
  style.dataset.sanbaoTokens = STYLE_ANCHOR;
  style.textContent = SANBAO_TOKEN_CSS;
  doc.head.append(style);
  return style;
}
