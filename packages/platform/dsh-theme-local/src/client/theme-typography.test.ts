import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildThemeTypography, type ThemeTypographySettings } from "./theme-typography.js";

const preferences: ThemeTypographySettings = {
  uiFont: "system", codeFont: "sf-mono", uiFontSize: 14, codeFontSize: 12,
};

describe("theme-independent typography", () => {
  it("connects the appearance editor to page, section and body roles", () => {
    const css = readFileSync(new URL("./studio.css", import.meta.url), "utf8");
    expect(css).toMatch(/\[data-appearance-header\] h2\s*\{[^}]*font:\s*var\(--sanbao-font-page\)/);
    expect(css).toMatch(/\[data-appearance-card-header\] h3\s*\{[^}]*font:\s*var\(--sanbao-font-section\)/);
    expect(css).toMatch(/\[data-appearance-subheading\] h4\s*\{[^}]*font:\s*var\(--sanbao-font-panel\)/);
    expect(css).toContain("font: var(--sanbao-font-body)");
    expect(css).not.toMatch(/(?:^|[;{\n])\s*height: (?:26|30)px;/);
  });

  it("builds headings and body from font preferences alone", () => {
    const tokens = buildThemeTypography(preferences);
    const expected = {
      "--sanbao-font-hero": "600 36px/44px var(--dsw-font-family)",
      "--sanbao-font-hero-compact": "600 28px/36px var(--dsw-font-family)",
      "--sanbao-font-page": "600 28px/36px var(--dsw-font-family)",
      "--sanbao-font-section": "600 20px/28px var(--dsw-font-family)",
      "--sanbao-font-panel": "600 16px/24px var(--dsw-font-family)",
      "--sanbao-font-body": "400 14px/22px var(--dsw-font-family)",
      "--sanbao-font-control": "400 14px/20px var(--dsw-font-family)",
      "--sanbao-font-meta": "400 13px/18px var(--dsw-font-family)",
      "--dsw-font-markdown-base": "16px/28px var(--dsw-font-family)",
      "--dsw-font-markdown-h2": "600 20px/28px var(--dsw-font-family)",
      "--dsw-font-markdown-code-block": "14px/22px var(--ds-font-family-code)",
    };
    for (const [name, value] of Object.entries(expected)) {
      expect(tokens[name], name).toEqual({ light: value, dark: value });
    }
    expect(Object.keys(tokens).every(name => name.includes("font"))).toBe(true);
  });

  it("scales UI sizes and line heights proportionally without changing code preferences", () => {
    const tokens = buildThemeTypography({ ...preferences, uiFontSize: 16 });
    expect(tokens["--sanbao-font-page"]?.light).toBe("600 32px/41.143px var(--dsw-font-family)");
    expect(tokens["--sanbao-font-control"]?.light).toBe("400 16px/22.857px var(--dsw-font-family)");
    expect(tokens["--dsw-font-markdown-code-block"]).toEqual(buildThemeTypography(preferences)["--dsw-font-markdown-code-block"]);
  });

  it("keeps code font selection and size independent of the interface font", () => {
    const tokens = buildThemeTypography({ ...preferences, uiFont: "serif", codeFont: "jetbrains", codeFontSize: 14 });
    expect(tokens["--dsw-font-family"]?.light).toContain("Songti SC");
    expect(tokens["--ds-font-family-code"]?.light).toMatch(/^"JetBrains Mono"/);
    expect(tokens["--dsw-font-markdown-code-block-small"]?.light).toBe("14px/20px var(--ds-font-family-code)");
    expect(tokens["--sanbao-font-control"]?.light).toBe("400 14px/20px var(--dsw-font-family)");
  });
});
