import type { ThemeTokenOverrides } from "@deepseek-ai/dsh-client-ui-theme/client";

import type {
  CodeFontId,
  ThemeStudioSettings,
  UiFontId,
} from "../theme-settings.js";

interface Palette {
  accent: string;
  background: string;
  foreground: string;
  surface: string;
  inlineCode: string;
  sidebar: string;
  /**
   * Scales neutral blend amounts for this scheme's contrast setting.
   * k(50) = 1, so the preset baseline stays byte-identical (frozen by the
   * golden assertions in theme-tokens.test.ts). Raised surfaces, secondary
   * labels and hover/active veils ride on k; accent-derived blends keep their
   * tuned ratios at every contrast, and the four border levels ride on the
   * narrower `borderFactor` instead — see its note.
   */
  scale: (amount: number) => number;
  /**
   * Contrast factor for the border levels only, deliberately narrower than
   * `scale`'s 0.6–1.4 band: a border is structure, not content, so the slider
   * must not be able to turn a hairline into a drawn box. 0.75 at contrast 0,
   * 1.25 at 100, exactly 1 at the 50 baseline.
   */
  borderFactor: number;
}

export const UI_FONT_STACKS: Record<UiFontId, string> = {
  system:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
  inter:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
  avenir:
    '"Avenir Next", Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  rounded:
    '"SF Pro Rounded", "Nunito Sans", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: '"Iowan Old Style", "Songti SC", "Noto Serif CJK SC", Georgia, serif',
};

export const CODE_FONT_STACKS: Record<CodeFontId, string> = {
  "sf-mono":
    '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", monospace',
  jetbrains:
    '"JetBrains Mono", "SF Mono", "Fira Code", Consolas, "Liberation Mono", monospace',
  "fira-code":
    '"Fira Code", "SF Mono", "JetBrains Mono", Consolas, "Liberation Mono", monospace',
  menlo: 'Menlo, Monaco, "SF Mono", Consolas, "Liberation Mono", monospace',
  cascadia:
    '"Cascadia Code", "SF Mono", "JetBrains Mono", Consolas, "Liberation Mono", monospace',
};

function same(value: string) {
  return { light: value, dark: value };
}

function scaled(value: number, delta: number): number {
  return Math.max(9, value + delta);
}

function font(
  size: number,
  lineHeight: number,
  delta: number,
  family: string,
  weight?: number,
  style?: "italic",
): string {
  return [
    style,
    weight,
    `${scaled(size, delta)}px/${scaled(lineHeight, delta)}px`,
    family,
  ]
    .filter((part) => part !== undefined)
    .join(" ");
}

function typography(settings: ThemeStudioSettings): ThemeTokenOverrides {
  const uiDelta = settings.uiFontSize - 14;
  const codeDelta = settings.codeFontSize - 12;
  const uiFamily = UI_FONT_STACKS[settings.uiFont];
  const codeFamily = CODE_FONT_STACKS[settings.codeFont];
  const ui = (
    size: number,
    lineHeight: number,
    weight?: number,
    style?: "italic",
  ) =>
    same(
      font(size, lineHeight, uiDelta, "var(--dsw-font-family)", weight, style),
    );
  const code = (size: number, lineHeight: number) =>
    same(font(size, lineHeight, codeDelta, "var(--ds-font-family-code)"));

  return {
    "--dsw-font-family": same(uiFamily),
    "--ds-font-family-code": same(codeFamily),
    "--dsw-font-mono": same(codeFamily),

    "--dsw-font-xl-24": ui(24, 32, 600),
    "--dsw-font-l-20": ui(20, 28, 500),
    "--dsw-font-m-18": ui(16, 28, 500),
    "--dsw-font-base-16": ui(16, 24),
    "--dsw-font-base-strong-16": ui(16, 24, 500),
    "--dsw-font-s-14": ui(14, 22),
    "--dsw-font-s-strong-14": ui(14, 22, 500),
    "--dsw-font-xs-13": ui(13, 20),
    "--dsw-font-xs-strong-13": ui(13, 20, 500),
    "--dsw-font-xxs-12": ui(12, 18),
    "--dsw-font-xxs-strong-12": ui(12, 18, 500),
    "--dsw-font-xxxs-11": ui(11, 14),
    "--dsw-font-xxxs-strong-11": ui(11, 14, 500),

    "--dsw-font-markdown-h1": ui(24, 34, 700),
    "--dsw-font-markdown-h2": ui(22, 32, 700),
    "--dsw-font-markdown-h3": ui(20, 30, 700),
    "--dsw-font-markdown-h4": ui(16, 28, 600),
    "--dsw-font-markdown-base": ui(16, 28),
    "--dsw-font-markdown-base-strong": ui(16, 28, 600),
    "--dsw-font-markdown-base-italic": ui(16, 28, undefined, "italic"),
    "--dsw-font-markdown-base-strong-italic": ui(16, 28, 600, "italic"),
    "--dsw-font-markdown-table": ui(15, 25),
    "--dsw-font-markdown-table-head": ui(15, 25, 500),
    "--dsw-font-markdown-small": ui(14, 24),
    "--dsw-font-markdown-small-strong": ui(14, 24, 600),
    "--dsw-font-markdown-small-italic": ui(14, 24, undefined, "italic"),
    "--dsw-font-markdown-small-strong-italic": ui(14, 24, 600, "italic"),
    "--dsw-font-markdown-code": code(14, 22),
    "--dsw-font-markdown-code-block": code(13, 22),
    "--dsw-font-markdown-code-block-small": code(12, 18),
  };
}

function palette(
  settings: ThemeStudioSettings,
  mode: "light" | "dark",
): Palette {
  const prefix = mode === "light" ? "light" : "dark";
  // 0.6 at contrast 0, 1.4 at contrast 100, exactly 1 at the 50 baseline —
  // see Palette.scale for what does and does not ride on this factor.
  const factor = 0.6 + 0.8 * (settings[`${prefix}Contrast`] / 100);
  const borderFactor = 0.75 + 0.5 * (settings[`${prefix}Contrast`] / 100);
  return {
    accent: settings[`${prefix}Accent`],
    background: settings[`${prefix}Background`],
    foreground: settings[`${prefix}Foreground`],
    surface: settings[`${prefix}Surface`],
    inlineCode: settings[`${prefix}InlineCode`],
    sidebar: settings[`${prefix}Sidebar`],
    scale: (amount: number) => Math.round(amount * factor),
    borderFactor,
  };
}

function mix(first: string, amount: number, second: string): string {
  return `color-mix(in oklch, ${first} ${amount}%, ${second})`;
}

/**
 * The four border levels exactly as Harness ships them, verbatim from
 * `@deepseek-ai/dsh-client-ui-theme` (`--dsw-alias-border-l{1..4}` on `body`
 * and `body[data-ds-dark-theme]`). Kept as hex so the next edit has to argue
 * with the source rather than with a hand-typed percentage.
 */
const HARNESS_BORDER_OVERLAYS = {
  light: ["#0000000a", "#0000001a", "#0000001f", "#00000029"],
  dark: ["#ffffff0f", "#ffffff1f", "#ffffff29", "#ffffff33"],
} as const;

/**
 * A border level as a **translucent overlay** at `factor` times the Harness
 * baseline alpha.
 *
 * Overlay rather than an opaque blend is the point, and it was measured: an
 * opaque `color-mix(in oklch, #FFF n%, <background>)` moves perceptual
 * lightness n% of the way to white, which lands 1.18–1.59x heavier than
 * Harness intends — worst on l1, which carries 60% of the app's borders
 * (172 of 285 in the audited window). Alpha also keeps a stroke correct on
 * layer-1/layer-2 surfaces instead of only on the base background, which is
 * why every border token in the systems surveyed is an alpha step.
 */
function borderOverlay(
  mode: "light" | "dark",
  level: 0 | 1 | 2 | 3,
  factor: number,
): string {
  const rgb = mode === "light" ? "0 0 0" : "255 255 255";
  const base = parseInt(HARNESS_BORDER_OVERLAYS[mode][level].slice(7, 9), 16) / 255;
  const alpha = Math.round(base * factor * 1000) / 1000;
  return `rgb(${rgb} / ${alpha})`;
}

export function buildThemeTokenOverrides(
  settings: ThemeStudioSettings,
): ThemeTokenOverrides {
  const light = palette(settings, "light");
  const dark = palette(settings, "dark");
  const pair = (getValue: (colors: Palette) => string) => ({
    light: getValue(light),
    dark: getValue(dark),
  });
  const border = (level: 0 | 1 | 2 | 3) => ({
    light: borderOverlay("light", level, light.borderFactor),
    dark: borderOverlay("dark", level, dark.borderFactor),
  });

  return {
    ...typography(settings),
    "--dsw-alias-bg-base": pair((colors) => colors.background),
    "--dsw-alias-bg-layer-1": pair((colors) => colors.surface),
    "--dsw-alias-bg-layer-2": {
      light: mix(light.background, light.scale(30), "#FFFFFF"),
      dark: mix("#FFFFFF", dark.scale(6), dark.surface),
    },
    "--dsw-alias-bg-layer-3": {
      light: mix(light.background, light.scale(15), "#FFFFFF"),
      dark: mix("#FFFFFF", dark.scale(10), dark.surface),
    },
    "--dsw-alias-bg-module-platform": {
      light: mix("#000000", light.scale(4), light.surface),
      dark: mix("#FFFFFF", dark.scale(6), dark.surface),
    },
    "--dsw-alias-bg-overlay": {
      light: mix(light.background, light.scale(10), "#FFFFFF"),
      dark: mix("#FFFFFF", dark.scale(12), dark.surface),
    },
    "--dsw-alias-border-l1": border(0),
    "--dsw-alias-border-l2": border(1),
    "--dsw-alias-border-l3": border(2),
    "--dsw-alias-border-l4": border(3),
    "--dsw-alias-brand-primary": pair((colors) => colors.accent),
    "--dsw-alias-button-info-fill": pair((colors) => colors.accent),
    "--dsw-alias-button-info-hover": {
      light: mix(light.accent, 86, light.foreground),
      dark: mix(dark.accent, 82, dark.background),
    },
    "--dsw-alias-label-primary": pair((colors) => colors.foreground),
    "--dsw-alias-label-secondary": pair((colors) =>
      mix(colors.foreground, colors.scale(62), colors.background),
    ),
    "--dsw-alias-label-tertiary": pair((colors) =>
      mix(colors.foreground, colors.scale(50), colors.background),
    ),
    "--dsw-alias-label-caption": pair((colors) =>
      mix(colors.foreground, colors.scale(40), colors.background),
    ),
    "--dsw-alias-label-dimmed": pair((colors) =>
      mix(colors.foreground, colors.scale(28), colors.background),
    ),
    "--dsw-alias-markdown-inline-code": pair(
      (colors) => colors.inlineCode,
    ),
    "--dsw-alias-state-business-primary": pair((colors) => colors.accent),
    "--dsw-alias-state-business-tertiary": pair((colors) =>
      mix(colors.accent, 12, colors.background),
    ),
    "--dsw-alias-interactive-bg-hover": {
      light: mix("#000000", light.scale(5), light.background),
      dark: mix("#FFFFFF", dark.scale(7), dark.background),
    },
    "--dsw-alias-interactive-bg-hover-solid": {
      light: mix("#000000", light.scale(5), light.surface),
      dark: mix("#FFFFFF", dark.scale(7), dark.surface),
    },
    "--dsw-alias-interactive-bg-hover-accent": pair((colors) =>
      mix(colors.accent, 10, colors.background),
    ),
    "--dsw-alias-interactive-bg-active": {
      light: mix("#000000", light.scale(9), light.background),
      dark: mix("#FFFFFF", dark.scale(11), dark.background),
    },
    "--dsw-specific-sidebar-fill": pair((colors) => colors.sidebar),
    "--dsw-specific-sidebar-nav-item-active-accent": pair((colors) =>
      mix(colors.accent, 12, colors.sidebar),
    ),
    "--dsw-specific-sidebar-nav-item-active": {
      light: mix("#000000", light.scale(9), light.sidebar),
      dark: mix("#FFFFFF", dark.scale(11), dark.sidebar),
    },
    "--dsw-specific-sidebar-nav-item-hover": {
      light: mix("#000000", light.scale(5), light.sidebar),
      dark: mix("#FFFFFF", dark.scale(7), dark.sidebar),
    },
    "--dsw-specific-bubble": pair((colors) =>
      mix(colors.accent, 10, colors.background),
    ),
    "--dsw-specific-bubble-highlight": pair((colors) =>
      mix(colors.accent, 20, colors.background),
    ),

    // TurnStatus and the StateDot "ongoing" step currently consume the static
    // DeepSeek scale directly instead of a semantic alias. Keep the exceptions
    // centralized until Harness exposes a dedicated status token: 500/200 carry
    // the TurnStatus shimmer, 450 carries the ongoing (loading) status dot.
    "--dsw-static-deepseek-500": pair((colors) => colors.accent),
    "--dsw-static-deepseek-450": pair((colors) => colors.accent),
    "--dsw-static-deepseek-200": pair((colors) =>
      mix(colors.accent, 36, colors.background),
    ),
  };
}
