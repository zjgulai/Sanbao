// shared/client/sanbao-tokens.test.ts
import { test, expect } from "vitest";
import { THEME_IDS, MODE_IDS, SANBAO_PALETTES, buildSanbaoVariables } from "./sanbao-tokens.ts";

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hexToRgb(hex1));
  const l2 = luminance(hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test("SANBAO_PALETTES contains all 6 combinations", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODE_IDS) {
      const palette = (SANBAO_PALETTES as any)[`${theme}-${mode}`];
      expect(palette).toBeDefined();
      expect(palette.canvas).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(palette.foreground).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(palette.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      
      // WCAG contrast check: text on canvas >= 7 (AAA) or >= 4.5
      const textContrast = contrastRatio(palette.foreground, palette.canvas);
      expect(textContrast).toBeGreaterThanOrEqual(4.5);

      // Accent on canvas contrast
      const accentContrast = contrastRatio(palette.accent, palette.canvas);
      expect(accentContrast).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("buildSanbaoVariables produces CSS variables mapping", () => {
  const vars = buildSanbaoVariables("parchment", "light");
  expect(vars["--sanbao-canvas"]).toBe("#FBF7EE");
  expect(vars["--sanbao-foreground"]).toBe("#2A2723");
  expect(vars["--sanbao-accent"]).toBe("#8C6534");
  expect(vars["--sanbao-right-sidebar"]).toBe("#F3EEE3");
});
