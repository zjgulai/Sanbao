import type { ThemeTokenOverrides } from "@deepseek-ai/dsh-client-ui-theme/client";
import type { CodeFontId, ThemeStudioSettings, UiFontId } from "../theme-settings.js";

export type ThemeTypographySettings = Pick<
  ThemeStudioSettings,
  "uiFont" | "codeFont" | "uiFontSize" | "codeFontSize"
>;

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

function font(
  size: number,
  lineHeight: number,
  family: string,
  weight?: number,
  style?: "italic",
): string {
  return [style, weight, `${size}px/${lineHeight}px`, family]
    .filter((part) => part !== undefined)
    .join(" ");
}

export function buildThemeTypography(settings: ThemeTypographySettings): ThemeTokenOverrides {
  const scale = (size: number) => Math.round(size * settings.uiFontSize / 14 * 1000) / 1000;
  const ui = (size: number, lineHeight: number, weight?: number, style?: "italic") =>
    same(font(scale(size), scale(lineHeight), "var(--dsw-font-family)", weight, style));
  const code = (size: number, lineHeight: number) =>
    same(font(
      Math.max(9, size + settings.codeFontSize - 12),
      Math.max(9, lineHeight + settings.codeFontSize - 12),
      "var(--ds-font-family-code)",
    ));

  return {
    "--dsw-font-family": same(UI_FONT_STACKS[settings.uiFont]),
    "--ds-font-family-code": same(CODE_FONT_STACKS[settings.codeFont]),
    "--dsw-font-mono": same(CODE_FONT_STACKS[settings.codeFont]),
    "--sanbao-font-hero": ui(36, 44, 600),
    "--sanbao-font-hero-compact": ui(28, 36, 600),
    "--sanbao-font-page": ui(28, 36, 600),
    "--sanbao-font-section": ui(20, 28, 600),
    "--sanbao-font-panel": ui(16, 24, 600),
    "--sanbao-font-body": ui(14, 22, 400),
    "--sanbao-font-control": ui(14, 20, 400),
    "--sanbao-font-meta": ui(13, 18, 400),

    "--dsw-font-xl-24": ui(24, 32, 600),
    "--dsw-font-l-20": ui(20, 28, 600),
    "--dsw-font-m-18": ui(18, 28, 600),
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
    "--dsw-font-markdown-h2": ui(20, 28, 600),
    "--dsw-font-markdown-h3": ui(18, 28, 600),
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
    "--dsw-font-markdown-code-block": code(14, 22),
    "--dsw-font-markdown-code-block-small": code(12, 18),
  };
}
