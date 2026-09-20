import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

const stylesheet = read("studio.css");
const studio = read("ThemeStudio.tsx");
const client = read("index.tsx");
const prefsCss = read("prefs-css.ts");

/**
 * Source-level contract for the settings section. Rendered behaviour
 * (focus order, picker interaction, live re-theming) is verified in the
 * browser, not here; these assertions only stop the markup contract from
 * drifting silently.
 */
describe("Theme Studio visual contract", () => {
  it("keeps shared semantic layers and control motion", () => {
    expect(stylesheet).toContain("--sanbao-panel");
    expect(stylesheet).toContain("--sanbao-inset");
    expect(stylesheet).toContain("--dsw-shadow-lv1");
    expect(stylesheet).toContain("border-color 180ms ease");
    expect(stylesheet).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps the section a two-card layout", () => {
    expect(studio).toContain('data-card="theme"');
    expect(studio).toContain('data-card="prefs"');
    expect(studio.match(/<section\s+data-appearance-card\b/g)).toHaveLength(2);
  });

  it("drives theme and motion choices from radio semantics without retired palette choices", () => {
    expect(studio).toContain('role="radiogroup"');
    expect(studio).toContain('name="appearance-mode"');
    expect(studio).toContain("THEME_IDS.map");
    expect(studio).not.toContain('name="appearance-preset"');
    expect(studio).not.toContain('name="appearance-accent"');
    expect(studio).toContain('name="appearance-reduce-motion"');
    expect(studio).toContain('role="switch"');
    expect(studio).not.toContain("aria-pressed");
  });

  it("retires contrast and arbitrary color controls while keeping font sizes", () => {
    expect(studio).not.toMatch(/ContrastSlider|ColorChip|ShareString|AdvancedDisclosure/);
    expect(stylesheet).not.toContain("--appearance-contrast-fill");
    expect(stylesheet).not.toContain("data-appearance-slider");
    expect(studio).toContain('setTypography("uiFontSize"');
    expect(studio).toContain('setTypography("codeFontSize"');
  });

  it("gates prefs behind body attributes instead of global CSS", () => {
    expect(prefsCss).toContain('body[data-lute-reduce-motion="reduce"]');
    expect(prefsCss).toContain('body[data-lute-font-smoothing="on"]');
    expect(prefsCss).toContain('"(prefers-reduced-motion: reduce)"');
    expect(client).toContain("prefsAttributes(");
    expect(client).toMatch(/delete (?:document\.)?body\.dataset\.luteReduceMotion/);
    expect(client).toMatch(/delete (?:document\.)?body\.dataset\.luteFontSmoothing/);
    expect(client).toContain("motionQuery?.removeEventListener");
  });

  it("keeps visible keyboard focus for theme, typography, and preference controls", () => {
    for (const selector of [
      "[data-appearance-button]:focus-visible",
      "[data-appearance-stepper-button]:focus-visible",
      "[data-appearance-stepper-value]:focus-visible",
      "[data-appearance-select]:focus-visible",
      "[data-appearance-switch]:focus-visible",
      "[data-appearance-mode]:has(input:focus-visible)",
      "[data-appearance-segment] label:has(input:focus-visible)",
    ]) {
      expect(stylesheet).toContain(selector);
    }
    expect(stylesheet).toContain("outline: 2px solid var(--appearance-accent)");
  });
});
