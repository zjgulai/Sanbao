import { beforeEach, describe, expect, it } from "vitest";

import {
  CONTRAST_DEFAULT,
  DEFAULT_THEME_STUDIO_SETTINGS,
  type ThemeStudioSettings,
} from "../theme-settings.js";
import { getThemePreset } from "./presets.js";
import {
  loadSavedAppearance,
  saveAppearance,
  initAppearancePreboot,
  DEFAULT_SAVED_APPEARANCE,
  APPEARANCE_STORAGE_KEY,
  loadThemeStudioPrefs,
  loadThemeStudioSettings,
  saveThemeStudioPrefs,
  saveThemeStudioSettings,
  THEME_PREFS_STORAGE_KEY,
  THEME_STUDIO_STORAGE_KEY,
  type ThemeStudioStorage,
} from "./persistence.js";

function memoryStorage(initial?: Record<string, string>): ThemeStudioStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  if (initial) {
    for (const [k, v] of Object.entries(initial)) {
      values.set(k, v);
    }
  }
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function createMockDocument() {
  const htmlAttrs = new Map<string, string>();
  const htmlStyles = new Map<string, string>();
  const bodyAttrs = new Map<string, string>();
  const headElements: any[] = [];

  const documentElement = {
    getAttribute: (name: string) => htmlAttrs.get(name) ?? null,
    setAttribute: (name: string, val: string) => { htmlAttrs.set(name, String(val)); },
    removeAttribute: (name: string) => { htmlAttrs.delete(name); },
    style: {
      getPropertyValue: (name: string) => htmlStyles.get(name) ?? "",
      setProperty: (name: string, val: string) => { htmlStyles.set(name, String(val)); },
      removeProperty: (name: string) => { htmlStyles.delete(name); },
    },
  };

  const body = {
    getAttribute: (name: string) => bodyAttrs.get(name) ?? null,
    setAttribute: (name: string, val: string) => { bodyAttrs.set(name, String(val)); },
    removeAttribute: (name: string) => { bodyAttrs.delete(name); },
  };

  const head = {
    append: (el: any) => headElements.push(el),
    prepend: (el: any) => headElements.unshift(el),
    appendChild: (el: any) => headElements.push(el),
    querySelector: (selector: string) => {
      const parts = selector.split(",").map((s) => s.trim());
      for (const part of parts) {
        for (const el of headElements) {
          if (part.startsWith("style#") && el.id === part.slice("style#".length)) return el;
          if (part.includes("data-sanbao-preboot") && el.dataset?.sanbaoPreboot) return el;
          if (part.includes("data-sanbao-tokens") && el.dataset?.sanbaoTokens) return el;
        }
      }
      return null;
    },
  };

  const doc = {
    documentElement,
    body,
    head,
    createElement: (tag: string) => {
      const el: any = {
        tagName: tag.toUpperCase(),
        dataset: {},
        textContent: "",
        id: "",
      };
      return el;
    },
    querySelector: (selector: string) => {
      return head.querySelector(selector);
    },
  };

  (doc as any).head.ownerDocument = doc;

  return doc as unknown as Document;
}

describe("appearance persistence & preboot", () => {
  it("loads default appearance when storage is empty or undefined", () => {
    expect(loadSavedAppearance(undefined)).toEqual(DEFAULT_SAVED_APPEARANCE);
    const storage = memoryStorage();
    expect(loadSavedAppearance(storage)).toEqual(DEFAULT_SAVED_APPEARANCE);
  });

  it("round-trips appearance state correctly", () => {
    const storage = memoryStorage();
    const app = {
      mode: "dark" as const,
      theme: "parchment" as const,
      fontScale: 1.1,
      reducedMotion: true,
    };
    expect(saveAppearance(app, storage)).toBe(true);
    expect(loadSavedAppearance(storage)).toEqual(app);
  });

  it("handles malformed JSON or partial values gracefully", () => {
    const storage = memoryStorage({ [APPEARANCE_STORAGE_KEY]: "invalid-json" });
    expect(loadSavedAppearance(storage)).toEqual(DEFAULT_SAVED_APPEARANCE);

    const storagePartial = memoryStorage({
      [APPEARANCE_STORAGE_KEY]: JSON.stringify({ mode: "light", theme: "unknown" }),
    });
    expect(loadSavedAppearance(storagePartial)).toEqual({
      mode: "light",
      theme: "forest-green",
      fontScale: 1.0,
      reducedMotion: false,
    });
  });

  it("reports false on storage set failure", () => {
    const brokenStorage: ThemeStudioStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("fail");
      },
    };
    expect(saveAppearance(DEFAULT_SAVED_APPEARANCE, brokenStorage)).toBe(false);
  });

  it("initAppearancePreboot mounts data attributes and styles before DOM render", () => {
    const storage = memoryStorage();
    saveAppearance(
      {
        mode: "dark",
        theme: "parchment",
        fontScale: 1.1,
        reducedMotion: true,
      },
      storage,
    );

    const mockDoc = createMockDocument();
    initAppearancePreboot(mockDoc, storage);

    expect(mockDoc.documentElement.getAttribute("data-sanbao-mode")).toBe("dark");
    expect(mockDoc.documentElement.getAttribute("data-sanbao-theme")).toBe("parchment");
    expect(mockDoc.documentElement.style.getPropertyValue("--sanbao-font-scale")).toBe("1.1");

    expect(mockDoc.body.getAttribute("data-sanbao-mode")).toBe("dark");
    expect(mockDoc.body.getAttribute("data-sanbao-theme")).toBe("parchment");
    expect(mockDoc.body.getAttribute("data-lute-reduce-motion")).toBe("reduce");

    const prebootTag = mockDoc.head.querySelector("style[data-sanbao-preboot]");
    expect(prebootTag).not.toBeNull();
    expect(prebootTag?.textContent).toContain("--sanbao-font-scale: 1.1");

    const tokensTag = mockDoc.head.querySelector("style[data-sanbao-tokens]");
    expect(tokensTag).not.toBeNull();
  });
});

describe("theme persistence (legacy compatibility)", () => {
  it("round-trips a complete theme", () => {
    const storage = memoryStorage();
    const settings: ThemeStudioSettings = {
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      lightAccent: "#123456",
      uiFontSize: 16,
    };

    expect(saveThemeStudioSettings(storage, settings)).toBe(true);
    expect(loadThemeStudioSettings(storage)).toEqual(settings);
  });

  it("uses defaults for missing, malformed, or unavailable storage", () => {
    expect(loadThemeStudioSettings(undefined)).toEqual(
      DEFAULT_THEME_STUDIO_SETTINGS,
    );
    expect(loadThemeStudioSettings(memoryStorage({ [THEME_STUDIO_STORAGE_KEY]: "not-json" }))).toEqual(
      DEFAULT_THEME_STUDIO_SETTINGS,
    );
    expect(loadThemeStudioSettings(memoryStorage({ [THEME_STUDIO_STORAGE_KEY]: "{}" }))).toEqual(
      DEFAULT_THEME_STUDIO_SETTINGS,
    );
  });

  it("adds inline-code colors to themes saved before the field existed", () => {
    const proof = getThemePreset("proof").palette;
    const {
      lightInlineCode: _lightInlineCode,
      darkInlineCode: _darkInlineCode,
      ...legacySettings
    } = {
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      ...proof,
    };

    expect(
      loadThemeStudioSettings(memoryStorage({ [THEME_STUDIO_STORAGE_KEY]: JSON.stringify(legacySettings) })),
    ).toEqual({
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      ...proof,
    });
  });

  it("migrates the reddish legacy editorial foreground", () => {
    const legacyEditorial = {
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      ...getThemePreset("editorial").palette,
      lightForeground: "#1F0909",
      lightSidebar: "#F3F2EE",
      darkSidebar: "#211C1A",
      uiFont: "system",
      codeFont: "sf-mono",
      uiFontSize: 14,
      codeFontSize: 14,
    };
    const storage = memoryStorage({ [THEME_STUDIO_STORAGE_KEY]: JSON.stringify(legacyEditorial) });

    expect(loadThemeStudioSettings(storage)).toEqual({
      ...legacyEditorial,
      lightForeground: "#2F2C29",
    });
    expect(
      JSON.parse(storage.values.get(THEME_STUDIO_STORAGE_KEY)!),
    ).toMatchObject({ lightForeground: "#2F2C29" });
  });

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

  it("round-trips contrast values", () => {
    const storage = memoryStorage();
    const settings: ThemeStudioSettings = {
      ...DEFAULT_THEME_STUDIO_SETTINGS,
      lightContrast: 100,
      darkContrast: 0,
    };

    expect(saveThemeStudioSettings(storage, settings)).toBe(true);
    expect(loadThemeStudioSettings(storage)).toEqual(settings);
  });

  it("defaults contrast for themes saved before the field existed and migrates storage", () => {
    const {
      lightContrast: _lightContrast,
      darkContrast: _darkContrast,
      ...legacySettings
    } = DEFAULT_THEME_STUDIO_SETTINGS;
    const storage = memoryStorage({ [THEME_STUDIO_STORAGE_KEY]: JSON.stringify(legacySettings) });

    expect(loadThemeStudioSettings(storage)).toEqual(
      DEFAULT_THEME_STUDIO_SETTINGS,
    );
    expect(
      JSON.parse(storage.values.get(THEME_STUDIO_STORAGE_KEY)!),
    ).toMatchObject({
      lightContrast: CONTRAST_DEFAULT,
      darkContrast: CONTRAST_DEFAULT,
    });
  });

  it("falls back to the default contrast for out-of-range or malformed values", () => {
    for (const bad of [-1, 101, 50.5, "60", null, {}]) {
      const raw = JSON.stringify({
        ...DEFAULT_THEME_STUDIO_SETTINGS,
        lightContrast: bad,
        darkContrast: bad,
      });

      expect(loadThemeStudioSettings(memoryStorage({ [THEME_STUDIO_STORAGE_KEY]: raw }))).toEqual(
        DEFAULT_THEME_STUDIO_SETTINGS,
      );
    }
  });
});

describe("theme prefs (legacy compatibility)", () => {
  it("defaults to system motion and zero-intervention smoothing", () => {
    expect(loadThemeStudioPrefs(undefined)).toEqual({
      reduceMotion: "system",
      fontSmoothing: false,
    });
    expect(loadThemeStudioPrefs(memoryStorage())).toEqual({
      reduceMotion: "system",
      fontSmoothing: false,
    });
    expect(loadThemeStudioPrefs(memoryStorage({ [THEME_PREFS_STORAGE_KEY]: "not-json" }))).toEqual({
      reduceMotion: "system",
      fontSmoothing: false,
    });
  });

  it("round-trips prefs independently of the theme settings key", () => {
    const storage = memoryStorage();
    saveThemeStudioSettings(storage, DEFAULT_THEME_STUDIO_SETTINGS);

    loadThemeStudioPrefs(storage);
    expect(storage.values.has(THEME_PREFS_STORAGE_KEY)).toBe(false);

    const prefs = { reduceMotion: "on" as const, fontSmoothing: true };
    expect(saveThemeStudioPrefs(storage, prefs)).toBe(true);
    expect(loadThemeStudioPrefs(storage)).toEqual(prefs);
    expect(
      loadThemeStudioSettings(storage).lightContrast,
    ).toBe(CONTRAST_DEFAULT);
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
