import {
  type AppearanceMode,
  type SeasonalTheme,
  APPEARANCE_MODES,
  SEASONAL_THEMES,
  ensureSanbaoTokens,
} from "./sanbao-tokens.js";
import {
  loadSavedAppearance,
  saveAppearance,
  resolveEffectiveMode,
  type SavedAppearance,
  type ThemeStudioStorage,
  browserThemeStudioStorage,
} from "./persistence.js";

export interface AppearanceState {
  mode: AppearanceMode;
  theme: SeasonalTheme;
  effectiveMode: "light" | "dark";
  fontScale: number;
  reducedMotion: boolean;
}

export type AppearanceListener = (state: AppearanceState) => void;

export class AppearanceController {
  private state: AppearanceState;
  private listeners: Set<AppearanceListener> = new Set();
  private doc?: Document;
  private storage?: ThemeStudioStorage;
  private mediaQuery?: MediaQueryList;
  private mediaListener?: (e: MediaQueryListEvent) => void;

  constructor(options: {
    doc?: Document;
    storage?: ThemeStudioStorage;
    initialState?: Partial<SavedAppearance>;
  } = {}) {
    this.doc = options.doc ?? (typeof document !== "undefined" ? document : undefined);
    this.storage = options.storage ?? browserThemeStudioStorage();

    const saved = loadSavedAppearance(this.storage);
    const mode = options.initialState?.mode ?? saved.mode;
    const theme = options.initialState?.theme ?? saved.theme;
    const fontScale = options.initialState?.fontScale ?? saved.fontScale;
    const reducedMotion = options.initialState?.reducedMotion ?? saved.reducedMotion;

    this.state = {
      mode,
      theme,
      effectiveMode: resolveEffectiveMode(mode),
      fontScale,
      reducedMotion,
    };

    this.setupSystemMediaListener();
    this.applyToDOM();
  }

  public getState(): AppearanceState {
    return { ...this.state };
  }

  public subscribe(listener: AppearanceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setMode(mode: AppearanceMode): void {
    if (!APPEARANCE_MODES.includes(mode)) return;
    if (this.state.mode === mode) return;

    this.state.mode = mode;
    this.state.effectiveMode = resolveEffectiveMode(mode);
    this.persist();
    this.applyToDOM();
    this.notify();
  }

  public setTheme(theme: SeasonalTheme): void {
    if (!SEASONAL_THEMES.includes(theme)) return;
    if (this.state.theme === theme) return;

    this.state.theme = theme;
    this.persist();
    this.applyToDOM();
    this.notify();
  }

  public setFontScale(scale: number): void {
    const clamped = Math.min(2.0, Math.max(0.5, Math.round(scale * 100) / 100));
    if (this.state.fontScale === clamped) return;

    this.state.fontScale = clamped;
    this.persist();
    this.applyToDOM();
    this.notify();
  }

  public setReducedMotion(reduced: boolean): void {
    if (this.state.reducedMotion === reduced) return;

    this.state.reducedMotion = reduced;
    this.persist();
    this.applyToDOM();
    this.notify();
  }

  public updateAppearance(patch: Partial<SavedAppearance>): void {
    let changed = false;

    if (patch.mode !== undefined && APPEARANCE_MODES.includes(patch.mode) && this.state.mode !== patch.mode) {
      this.state.mode = patch.mode;
      this.state.effectiveMode = resolveEffectiveMode(patch.mode);
      changed = true;
    }

    if (patch.theme !== undefined && SEASONAL_THEMES.includes(patch.theme) && this.state.theme !== patch.theme) {
      this.state.theme = patch.theme;
      changed = true;
    }

    if (patch.fontScale !== undefined) {
      const clamped = Math.min(2.0, Math.max(0.5, Math.round(patch.fontScale * 100) / 100));
      if (this.state.fontScale !== clamped) {
        this.state.fontScale = clamped;
        changed = true;
      }
    }

    if (patch.reducedMotion !== undefined && this.state.reducedMotion !== patch.reducedMotion) {
      this.state.reducedMotion = patch.reducedMotion;
      changed = true;
    }

    if (changed) {
      this.persist();
      this.applyToDOM();
      this.notify();
    }
  }

  public applyToDOM(): void {
    const doc = this.doc;
    if (!doc) return;

    ensureSanbaoTokens(doc);

    if (doc.documentElement) {
      doc.documentElement.setAttribute("data-sanbao-mode", this.state.effectiveMode);
      doc.documentElement.setAttribute("data-sanbao-theme", this.state.theme);
      doc.documentElement.style.setProperty("--sanbao-font-scale", String(this.state.fontScale));
    }

    if (doc.body) {
      doc.body.setAttribute("data-sanbao-mode", this.state.effectiveMode);
      doc.body.setAttribute("data-sanbao-theme", this.state.theme);
      if (this.state.reducedMotion) {
        doc.body.setAttribute("data-lute-reduce-motion", "reduce");
      } else {
        doc.body.removeAttribute("data-lute-reduce-motion");
      }
    }
  }

  private persist(): void {
    saveAppearance(
      {
        mode: this.state.mode,
        theme: this.state.theme,
        fontScale: this.state.fontScale,
        reducedMotion: this.state.reducedMotion,
      },
      this.storage,
    );
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Prevent listener error from breaking controller
      }
    }
  }

  private setupSystemMediaListener(): void {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    try {
      this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      this.mediaListener = (e: MediaQueryListEvent | MediaQueryList) => {
        if (this.state.mode === "system") {
          const nextEffective = e.matches ? "dark" : "light";
          if (this.state.effectiveMode !== nextEffective) {
            this.state.effectiveMode = nextEffective;
            this.applyToDOM();
            this.notify();
          }
        }
      };

      if (typeof this.mediaQuery.addEventListener === "function") {
        this.mediaQuery.addEventListener("change", this.mediaListener);
      } else if (typeof (this.mediaQuery as any).addListener === "function") {
        (this.mediaQuery as any).addListener(this.mediaListener);
      }
    } catch {
      // Ignore in environments without window.matchMedia
    }
  }

  public dispose(): void {
    if (this.mediaQuery && this.mediaListener) {
      if (typeof this.mediaQuery.removeEventListener === "function") {
        this.mediaQuery.removeEventListener("change", this.mediaListener);
      } else if (typeof (this.mediaQuery as any).removeListener === "function") {
        (this.mediaQuery as any).removeListener(this.mediaListener);
      }
    }
    this.listeners.clear();
  }
}
