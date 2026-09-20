import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_STUDIO_SETTINGS,
  type ThemeId,
  type ThemeStudioSettings,
  type ThemeTypographyField,
} from "../theme-settings.js";
import {
  LEGACY_THEME_STUDIO_STORAGE_KEY,
  loadThemeStudioPrefs,
  loadThemeStudioSettings,
  saveThemeStudioPrefs,
  saveThemeStudioSettings,
  THEME_PREFS_STORAGE_KEY,
  THEME_STUDIO_STORAGE_KEY,
  type ThemeStudioStorage,
} from "./persistence.js";

function memoryStorage(initial?: string): ThemeStudioStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(THEME_STUDIO_STORAGE_KEY, initial);
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("theme persistence", () => {
  it.each(["light", "dark", "warm-pink"] as const)("round-trips %s and typography in v2", (themeId: ThemeId) => {
    const storage = memoryStorage();
    const settings: ThemeStudioSettings = {
      themeId,
      uiFont: "avenir",
      codeFont: "menlo",
      uiFontSize: 16,
      codeFontSize: 13,
    };

    expect(saveThemeStudioSettings(storage, settings)).toBe(true);
    expect(loadThemeStudioSettings(storage)).toEqual(settings);
    expect(JSON.parse(storage.values.get(THEME_STUDIO_STORAGE_KEY)!)).toEqual(settings);
    expect(storage.values.has(LEGACY_THEME_STUDIO_STORAGE_KEY)).toBe(false);
  });

  it("uses defaults for missing, malformed, or unavailable storage", () => {
    expect(loadThemeStudioSettings(undefined)).toEqual(
      DEFAULT_THEME_STUDIO_SETTINGS,
    );
    expect(loadThemeStudioSettings(memoryStorage("not-json"))).toEqual(
      DEFAULT_THEME_STUDIO_SETTINGS,
    );
    expect(loadThemeStudioSettings(memoryStorage("{}"))).toEqual(
      DEFAULT_THEME_STUDIO_SETTINGS,
    );
  });

  it("prefers valid v2 over legacy colors, typography, and the initial scheme", () => {
    const settings: ThemeStudioSettings = {
      themeId: "warm-pink",
      uiFont: "inter",
      codeFont: "jetbrains",
      uiFontSize: 15,
      codeFontSize: 13,
    };
    const storage = memoryStorage(JSON.stringify(settings));
    storage.setItem(LEGACY_THEME_STUDIO_STORAGE_KEY, JSON.stringify({
      uiFont: "serif", codeFont: "menlo", uiFontSize: 16, codeFontSize: 15,
      lightAccent: "broken",
    }));
    const reads: string[] = [];

    expect(loadThemeStudioSettings({
      getItem: (key) => {
        reads.push(key);
        return storage.getItem(key);
      },
      setItem: storage.setItem,
    }, "dark")).toEqual(settings);
    expect(reads).toEqual([THEME_STUDIO_STORAGE_KEY]);
  });

  it.each([undefined, "{", "{}", "null", "[]"])(
    "preserves legacy typography despite invalid colors when v2 is %s",
    (cached: string | undefined) => {
      const storage = memoryStorage(cached);
      storage.setItem(LEGACY_THEME_STUDIO_STORAGE_KEY, JSON.stringify({
        lightAccent: "broken", darkAccent: null, lightBackground: {}, darkBackground: 42,
        lightContrast: -1, darkContrast: "100",
        uiFont: "avenir", codeFont: "menlo", uiFontSize: 15, codeFontSize: 13,
      }));

      expect(loadThemeStudioSettings(storage, "dark")).toEqual({
        themeId: "dark", uiFont: "avenir", codeFont: "menlo", uiFontSize: 15, codeFontSize: 13,
      });
    },
  );

  it("reports a rejected write without changing the preview source", () => {
    const storage: ThemeStudioStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(
      saveThemeStudioSettings(storage, DEFAULT_THEME_STUDIO_SETTINGS),
    ).toBe(false);
  });

  it("leaves legacy, prefs, and unrelated caches byte-for-byte unchanged", () => {
    const storage = memoryStorage("{");
    storage.setItem(LEGACY_THEME_STUDIO_STORAGE_KEY, JSON.stringify({ uiFont: "serif" }));
    storage.setItem(THEME_PREFS_STORAGE_KEY, '{ "reduceMotion": "off", "fontSmoothing": true }');
    storage.setItem("other-plugin/cache", "untouched");
    const before = new Map(storage.values);

    const settings = loadThemeStudioSettings(storage, "dark");
    expect(settings).toEqual({ ...DEFAULT_THEME_STUDIO_SETTINGS, themeId: "dark", uiFont: "serif" });
    expect(storage.values).toEqual(before);
    expect(saveThemeStudioSettings(storage, settings)).toBe(true);
    expect(storage.values).toEqual(new Map([
      ...before,
      [THEME_STUDIO_STORAGE_KEY, JSON.stringify(settings)],
    ]));
  });

  it("uses the initial scheme when storage reads are blocked and rejects unavailable writes", () => {
    const storage: ThemeStudioStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(loadThemeStudioSettings(storage, "dark")).toEqual({
      ...DEFAULT_THEME_STUDIO_SETTINGS, themeId: "dark",
    });
    expect(saveThemeStudioSettings(undefined, DEFAULT_THEME_STUDIO_SETTINGS)).toBe(false);
    expect(saveThemeStudioSettings(storage, DEFAULT_THEME_STUDIO_SETTINGS)).toBe(false);
  });

  it.each(["uiFont", "codeFont", "uiFontSize", "codeFontSize"] as const)(
    "defaults only the malformed legacy typography field %s",
    (field: ThemeTypographyField) => {
      const typography = { uiFont: "avenir", codeFont: "menlo", uiFontSize: 15, codeFontSize: 13 } as const;
      for (const bad of [-1, 101, 50.5, "60", null, {}]) {
        const storage = memoryStorage();
        storage.setItem(LEGACY_THEME_STUDIO_STORAGE_KEY, JSON.stringify({
          ...typography, [field]: bad, lightAccent: "broken",
        }));

        expect(loadThemeStudioSettings(storage), `${field}: ${JSON.stringify(bad)}`).toEqual({
          themeId: "light", ...typography, [field]: DEFAULT_THEME_STUDIO_SETTINGS[field],
        });
      }
    },
  );
});

describe("theme prefs", () => {
  it("defaults to system motion and zero-intervention smoothing", () => {
    expect(loadThemeStudioPrefs(undefined)).toEqual({
      reduceMotion: "system",
      fontSmoothing: false,
    });
    expect(loadThemeStudioPrefs(memoryStorage())).toEqual({
      reduceMotion: "system",
      fontSmoothing: false,
    });
    expect(loadThemeStudioPrefs(memoryStorage("not-json"))).toEqual({
      reduceMotion: "system",
      fontSmoothing: false,
    });
  });

  it("round-trips prefs independently of the theme settings key", () => {
    const storage = memoryStorage();
    saveThemeStudioSettings(storage, DEFAULT_THEME_STUDIO_SETTINGS);

    // Reading prefs never materializes the key; theme settings never read
    // or write prefs.
    loadThemeStudioPrefs(storage);
    expect(storage.values.has(THEME_PREFS_STORAGE_KEY)).toBe(false);

    const prefs = { reduceMotion: "on" as const, fontSmoothing: true };
    expect(saveThemeStudioPrefs(storage, prefs)).toBe(true);
    expect(loadThemeStudioPrefs(storage)).toEqual(prefs);
    expect(loadThemeStudioSettings(storage)).toEqual(DEFAULT_THEME_STUDIO_SETTINGS);
    expect(storage.values.get(THEME_STUDIO_STORAGE_KEY)).toBe(
      JSON.stringify(DEFAULT_THEME_STUDIO_SETTINGS),
    );
  });

  it("falls back to defaults per field for malformed prefs", () => {
    const storage = memoryStorage();
    storage.setItem(
      THEME_PREFS_STORAGE_KEY,
      JSON.stringify({ reduceMotion: "sometimes", fontSmoothing: "yes" }),
    );
    expect(loadThemeStudioPrefs(storage)).toEqual({
      reduceMotion: "system",
      fontSmoothing: false,
    });
  });
});
