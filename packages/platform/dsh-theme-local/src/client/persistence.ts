import {
  type AppearanceMode,
  type SeasonalTheme,
  ensureSanbaoTokens,
} from "./sanbao-tokens.js";
import {
  decodeThemeStudioSettings,
  DEFAULT_THEME_STUDIO_SETTINGS,
  type ThemeStudioSettings,
} from "../theme-settings.js";

export const THEME_STUDIO_STORAGE_KEY = "dsh-theme/settings/v1";
export const THEME_PREFS_STORAGE_KEY = "dsh-theme/prefs/v1";
export const APPEARANCE_STORAGE_KEY = "dsh-theme/appearance/v1";

export interface ThemeStudioStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export type ReduceMotionPref = "system" | "on" | "off";

export interface ThemeStudioPrefs {
  /** "system" mirrors prefers-reduced-motion; "on"/"off" are explicit. */
  reduceMotion: ReduceMotionPref;
  /** false leaves font rendering completely untouched. */
  fontSmoothing: boolean;
}

export const DEFAULT_THEME_STUDIO_PREFS: ThemeStudioPrefs = {
  reduceMotion: "system",
  fontSmoothing: false,
};

export interface SavedAppearance {
  mode: AppearanceMode;
  theme: SeasonalTheme;
  fontScale: number;
  reducedMotion: boolean;
}

export const DEFAULT_SAVED_APPEARANCE: SavedAppearance = {
  mode: "system",
  theme: "forest-green",
  fontScale: 1.0,
  reducedMotion: false,
};

export function browserThemeStudioStorage(): ThemeStudioStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadSavedAppearance(
  storage: ThemeStudioStorage | undefined = browserThemeStudioStorage(),
): SavedAppearance {
  const fallback: SavedAppearance = { ...DEFAULT_SAVED_APPEARANCE };
  if (storage === undefined) return fallback;

  try {
    const raw = storage.getItem(APPEARANCE_STORAGE_KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return fallback;
    const record = parsed as Record<string, unknown>;

    const mode: AppearanceMode =
      record.mode === "light" || record.mode === "dark" || record.mode === "system"
        ? record.mode
        : fallback.mode;

    const theme: SeasonalTheme =
      record.theme === "parchment" ||
      record.theme === "warm-pink" ||
      record.theme === "forest-green"
        ? record.theme
        : fallback.theme;

    const fontScale =
      typeof record.fontScale === "number" &&
      !Number.isNaN(record.fontScale) &&
      record.fontScale >= 0.5 &&
      record.fontScale <= 2.0
        ? record.fontScale
        : fallback.fontScale;

    const reducedMotion =
      typeof record.reducedMotion === "boolean"
        ? record.reducedMotion
        : fallback.reducedMotion;

    return { mode, theme, fontScale, reducedMotion };
  } catch {
    return fallback;
  }
}

export function saveAppearance(
  appearance: SavedAppearance,
  storage: ThemeStudioStorage | undefined = browserThemeStudioStorage(),
): boolean {
  if (storage === undefined) return false;

  try {
    storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
    return true;
  } catch {
    return false;
  }
}

export function resolveSystemMode(): "light" | "dark" {
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
  } catch {
    // fallback
  }
  return "light";
}

export function resolveEffectiveMode(
  mode: AppearanceMode,
): "light" | "dark" {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return resolveSystemMode();
}

/**
 * Synchronous preboot injection to eliminate FOUC before DOM render.
 * Mounts data-sanbao-mode and data-sanbao-theme on documentElement and body (if present),
 * sets root font-scale style, and injects early root style tokens.
 */
export function initAppearancePreboot(
  doc: Document = (typeof document !== "undefined" ? document : (undefined as unknown as Document)),
  storage: ThemeStudioStorage | undefined = browserThemeStudioStorage(),
): void {
  if (!doc) return;

  const appearance = loadSavedAppearance(storage);
  const effectiveMode = resolveEffectiveMode(appearance.mode);

  if (doc.documentElement) {
    doc.documentElement.setAttribute("data-sanbao-mode", effectiveMode);
    doc.documentElement.setAttribute("data-sanbao-theme", appearance.theme);
    doc.documentElement.style.setProperty(
      "--sanbao-font-scale",
      String(appearance.fontScale),
    );
  }

  if (doc.body) {
    doc.body.setAttribute("data-sanbao-mode", effectiveMode);
    doc.body.setAttribute("data-sanbao-theme", appearance.theme);
    if (appearance.reducedMotion) {
      doc.body.setAttribute("data-lute-reduce-motion", "reduce");
    }
  }

  // Inject token declarations style element if not already present
  ensureSanbaoTokens(doc);

  // Inject dedicated preboot style tag ensuring immediate CSS variable availability
  const prebootId = "sanbao-theme-preboot";
  if (!doc.head.querySelector(`style#${prebootId}, style[data-sanbao-preboot]`)) {
    const style = doc.createElement("style");
    style.id = prebootId;
    style.dataset.sanbaoPreboot = "true";
    style.textContent = `
      :root {
        --sanbao-font-scale: ${appearance.fontScale};
      }
    `;
    if (doc.head) {
      doc.head.prepend(style);
    }
  }
}

// ---------------------------------------------------------
// Legacy ThemeStudio helpers preserved for backwards compatibility
// ---------------------------------------------------------

export function loadThemeStudioSettings(
  storage: ThemeStudioStorage | undefined,
): ThemeStudioSettings {
  if (storage === undefined) return { ...DEFAULT_THEME_STUDIO_SETTINGS };

  try {
    const raw = storage.getItem(THEME_STUDIO_STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_THEME_STUDIO_SETTINGS };
    const parsed = JSON.parse(raw);
    const decoded = decodeThemeStudioSettings(parsed);
    if (decoded === undefined) return { ...DEFAULT_THEME_STUDIO_SETTINGS };
    if (JSON.stringify(decoded) !== JSON.stringify(parsed)) {
      saveThemeStudioSettings(storage, decoded);
    }
    return decoded;
  } catch {
    return { ...DEFAULT_THEME_STUDIO_SETTINGS };
  }
}

export function saveThemeStudioSettings(
  storage: ThemeStudioStorage | undefined,
  settings: ThemeStudioSettings,
): boolean {
  if (storage === undefined) return false;

  try {
    storage.setItem(THEME_STUDIO_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

export function loadThemeStudioPrefs(
  storage: ThemeStudioStorage | undefined,
): ThemeStudioPrefs {
  const fallback: ThemeStudioPrefs = { ...DEFAULT_THEME_STUDIO_PREFS };
  if (storage === undefined) return fallback;

  try {
    const raw = storage.getItem(THEME_PREFS_STORAGE_KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return fallback;
    const record = parsed as Record<string, unknown>;
    return {
      reduceMotion:
        record.reduceMotion === "on" || record.reduceMotion === "off"
          ? record.reduceMotion
          : DEFAULT_THEME_STUDIO_PREFS.reduceMotion,
      fontSmoothing:
        record.fontSmoothing === true
          ? true
          : DEFAULT_THEME_STUDIO_PREFS.fontSmoothing,
    };
  } catch {
    return fallback;
  }
}

export function saveThemeStudioPrefs(
  storage: ThemeStudioStorage | undefined,
  prefs: ThemeStudioPrefs,
): boolean {
  if (storage === undefined) return false;

  try {
    storage.setItem(THEME_PREFS_STORAGE_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}
