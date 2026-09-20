import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

const stylesheet = read("studio.css");
const studio = read("ThemeStudio.tsx");
const client = read("index.tsx");
const prefsCss = read("prefs-css.ts");

/**
 * Source-level contract for the appearance settings section.
 */
describe("Theme Studio visual contract", () => {
  it("keeps shared semantic layers and control motion", () => {
    expect(stylesheet).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps the section layout with mode, themes, typography and preview", () => {
    expect(studio).toContain('data-appearance-mode-segment');
    expect(studio).toContain('data-appearance-seasonal-grid');
    expect(studio).toContain('data-appearance-typography');
    expect(studio).toContain('data-appearance-live-preview');
  });

  it("drives mode and theme controls from radio semantics", () => {
    expect(studio).toContain('role="radiogroup"');
    expect(studio).toContain('name="appearance-mode"');
    expect(studio).toContain('name="seasonal-theme"');
    expect(studio).toContain('role="switch"');
  });

  it("gates prefs behind body attributes instead of global CSS", () => {
    expect(prefsCss).toContain('body[data-lute-reduce-motion="reduce"]');
    expect(prefsCss).toContain('body[data-lute-font-smoothing="on"]');
    expect(prefsCss).toContain('"(prefers-reduced-motion: reduce)"');
    expect(client).toContain("prefsAttributes(");
    expect(client).toContain('delete document.body.dataset.luteReduceMotion');
    expect(client).toContain('delete document.body.dataset.luteFontSmoothing');
    expect(client).toContain("motionQuery?.removeEventListener");
  });
});
