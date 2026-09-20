import { describe, expect, it } from "vitest";
import { SANBAO_PALETTES, THEME_IDS } from "./sanbao-tokens.js";
import { DEFAULT_THEME_STUDIO_SETTINGS } from "../theme-settings.js";
import { buildThemeTokenOverrides } from "./theme-tokens.js";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(i => {
    const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("fixed theme token overrides", () => {
  it("keeps text readable on default and interactive surfaces in all three themes", () => {
    const failures: string[] = [];
    for (const id of THEME_IDS) {
      const palette = SANBAO_PALETTES[id];
      for (const background of ["canvas", "sidebar", "rightSidebar", "panel", "inset", "overlay", "hover", "pressed", "selected"] as const) {
        for (const foreground of ["foreground", "secondary", "accent", "success", "warning", "error"] as const) {
          const ratio = contrast(palette[foreground], palette[background]);
          if (ratio < (foreground === "foreground" ? 7 : 4.5)) failures.push(`${id} ${foreground}/${background}: ${ratio.toFixed(2)}`);
        }
      }
      expect(contrast(palette.onAccent, palette.accentFill), `${id} primary button`).toBeGreaterThanOrEqual(4.5);
    }
    expect(failures).toEqual([]);
  });

  it("pairs the official primary button fill with its readable foreground", () => {
    const tokens = buildThemeTokenOverrides(DEFAULT_THEME_STUDIO_SETTINGS);
    expect(tokens["--dsw-alias-button-primary-fill"]).toEqual({ light: "var(--sanbao-accent-fill)", dark: "var(--sanbao-accent-fill)" });
    expect(tokens["--dsw-alias-label-primary-foreground"]).toEqual({ light: "var(--sanbao-on-accent)", dark: "var(--sanbao-on-accent)" });
  });

  it("separates panel, nested and overlay layers without changing theme identity", () => {
    const tokens = buildThemeTokenOverrides(DEFAULT_THEME_STUDIO_SETTINGS);
    expect(tokens["--dsw-alias-bg-layer-1"]?.light).toBe("var(--sanbao-panel)");
    expect(tokens["--dsw-alias-bg-layer-2"]?.light).toBe("var(--sanbao-inset)");
    expect(tokens["--dsw-alias-bg-layer-3"]?.light).toBe("var(--sanbao-overlay)");
    expect(tokens["--dsw-alias-bg-overlay"]?.light).toBe("var(--sanbao-overlay)");
  });

  it("uses a semantic error surface for destructive hover states", () => {
    const tokens = buildThemeTokenOverrides(DEFAULT_THEME_STUDIO_SETTINGS);
    expect(tokens["--dsw-alias-interactive-bg-hover-danger"]?.light).toBe("var(--sanbao-error-surface)");
  });

  it("keeps control boundaries distinguishable on interactive backgrounds", () => {
    for (const id of THEME_IDS) {
      const palette = SANBAO_PALETTES[id];
      for (const background of ["canvas", "panel", "inset", "hover", "pressed", "selected"] as const) {
        expect(contrast(palette.controlBorder, palette[background]), `${id} control/${background}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("maps interface and code font families through Harness theme tokens", () => {
    const settings = {
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      uiFont: "serif" as const,
      codeFont: "jetbrains" as const,
    };
    const tokens = buildThemeTokenOverrides(settings);

    expect(tokens["--dsw-font-family"]).toEqual({
      light: expect.stringContaining("Songti SC"),
      dark: expect.stringContaining("Songti SC"),
    });
    expect(tokens["--ds-font-family-code"]).toEqual({
      light: expect.stringContaining("JetBrains Mono"),
      dark: expect.stringContaining("JetBrains Mono"),
    });
    expect(tokens["--dsw-font-mono"]).toEqual(tokens["--ds-font-family-code"]);
  });

  it("keeps heading, reading and control roles distinct while scaling them together", () => {
    const normal = buildThemeTokenOverrides(DEFAULT_THEME_STUDIO_SETTINGS);
    const larger = buildThemeTokenOverrides({ ...DEFAULT_THEME_STUDIO_SETTINGS, uiFontSize: 16 });
    const expected = {
      "--sanbao-font-hero": [36, 44, 600],
      "--sanbao-font-page": [28, 36, 600],
      "--sanbao-font-section": [20, 28, 600],
      "--sanbao-font-panel": [16, 24, 600],
      "--sanbao-font-body": [14, 22, 400],
      "--sanbao-font-control": [14, 20, 400],
      "--sanbao-font-meta": [13, 18, 400],
    };
    for (const [name, [size, lineHeight, weight]] of Object.entries(expected)) {
      expect(normal[name]?.light, name).toBe(`${weight} ${size}px/${lineHeight}px var(--dsw-font-family)`);
      expect(normal[name]?.dark, name).toBe(normal[name]?.light);
      const scaled = larger[name]?.light.match(/([\d.]+)px\/([\d.]+)px/);
      expect(scaled, name).not.toBeNull();
      expect(Number(scaled?.[1]), name).toBeCloseTo(size! * 16 / 14, 2);
      expect(Number(scaled?.[2]), name).toBeCloseTo(lineHeight! * 16 / 14, 2);
    }
    expect(normal["--dsw-font-markdown-base"]?.light).toBe("16px/28px var(--dsw-font-family)");
    expect(normal["--dsw-font-m-18"]?.light).toBe("600 18px/28px var(--dsw-font-family)");
  });

  it("scales semantic interface and code type tokens from stable defaults", () => {
    const tokens = buildThemeTokenOverrides({
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      uiFontSize: 16,
      codeFontSize: 14,
    });

    expect(tokens["--dsw-font-s-14"]).toEqual({
      light: "16px/25.143px var(--dsw-font-family)",
      dark: "16px/25.143px var(--dsw-font-family)",
    });
    expect(tokens["--dsw-font-markdown-code-block-small"]).toEqual({
      light: "14px/20px var(--ds-font-family-code)",
      dark: "14px/20px var(--ds-font-family-code)",
    });
  });
});
