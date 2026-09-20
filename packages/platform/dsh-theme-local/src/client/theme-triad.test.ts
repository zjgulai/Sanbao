import { describe, expect, it } from "vitest";
import * as model from "../theme-settings.js";
import { buildThemeTokenOverrides } from "./theme-tokens.js";
import { SANBAO_TOKEN_CSS } from "./sanbao-tokens.js";
import { loadThemeStudioSettings, saveThemeStudioSettings, type ThemeStudioStorage } from "./persistence.js";

const fonts = { uiFont: "avenir", codeFont: "menlo", uiFontSize: 15, codeFontSize: 13 } as const;
const old = { ...fonts, lightAccent: "broken", darkBackground: "#123456" };
function storage(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  const reads: string[] = [];
  return { values, reads, getItem: (key: string) => { reads.push(key); return values.get(key) ?? null; }, setItem: (key: string, value: string) => { values.set(key, value); } } satisfies ThemeStudioStorage & { values: Map<string, string>; reads: string[] };
}

describe("fixed theme identity and migration", () => {
  it("keeps warm-pink distinct while adapting to the light scheme", () => {
    expect(model.THEME_IDS).toEqual(["light", "dark", "warm-pink"]);
    expect(model.themeColorScheme("warm-pink")).toBe("light");
    expect(model.decodeThemeStudioSettings({ themeId: "warm-pink", ...fonts, lightAccent: "#123456" })).toEqual({ themeId: "warm-pink", ...fonts });
    expect(model.decodeThemeStudioSettings({ themeId: "system", ...fonts })).toBeUndefined();
    expect(model.decodeThemeStudioSettings({ themeId: "dark", ...fonts, uiFontSize: 99 })).toBeUndefined();
  });
  it("migrates typography even when every old color is invalid", () => {
    expect(model.migrateLegacyThemeSettings(old, "dark")).toEqual({ themeId: "dark", ...fonts });
    expect(model.migrateLegacyThemeSettings({ ...old, codeFont: "bad" }, "light")).toEqual({ themeId: "light", ...fonts, codeFont: "sf-mono" });
  });
  it("reads v2 before v1 and only uses v1 as a one-time source", () => {
    const s = storage({ "dsh-theme/settings/v1": JSON.stringify(old), "dsh-theme/prefs/v1": "keep", other: "untouched" });
    const migrated = loadThemeStudioSettings(s, "dark");
    expect(migrated).toEqual({ themeId: "dark", ...fonts });
    expect(saveThemeStudioSettings(s, { ...migrated, themeId: "warm-pink" })).toBe(true);
    s.reads.length = 0;
    expect(loadThemeStudioSettings(s, "dark").themeId).toBe("warm-pink");
    expect(s.reads).not.toContain("dsh-theme/settings/v1");
    expect(s.values.get("dsh-theme/settings/v1")).toBe(JSON.stringify(old));
    expect(s.values.get("dsh-theme/prefs/v1")).toBe("keep");
    expect(s.values.get("other")).toBe("untouched");
  });
  it("recovers broken v2 from legacy fonts and never reports failed cache writes as saved", () => {
    expect(loadThemeStudioSettings(storage({ "dsh-theme/settings/v2": "{", "dsh-theme/settings/v1": JSON.stringify(old) }), "dark")).toEqual({ themeId: "dark", ...fonts });
    expect(saveThemeStudioSettings({ getItem: () => null, setItem: () => { throw Error("denied"); } }, { themeId: "light", ...fonts })).toBe(false);
  });
  it("resets only theme identity, not the reader's typography", () => {
    expect(model.resetThemeColors({ themeId: "warm-pink", ...fonts })).toEqual({ themeId: "light", ...fonts });
  });
  it("never lets retired colors enter generated variables", () => {
    const tokens = buildThemeTokenOverrides({ ...old, themeId: "warm-pink" });
    expect(tokens["--dsw-alias-bg-base"]).toEqual({ light: "var(--sanbao-canvas)", dark: "var(--sanbao-canvas)" });
    expect(JSON.stringify(tokens)).not.toContain("#123456");
    expect(JSON.stringify(tokens)).not.toContain("broken");
    expect(SANBAO_TOKEN_CSS).toContain('body[data-sanbao-theme="warm-pink"]');
    expect(SANBAO_TOKEN_CSS).not.toMatch(/var\(--dsw-/);
  });
});
