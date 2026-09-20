export interface AppearanceState {
  mode: "light" | "dark" | "system";
  theme: "parchment" | "warm-pink" | "forest-green";
  fontScale?: number;
  monoFont?: string;
  reduceMotion?: boolean;
}

export type AppearanceListener = (state: AppearanceState) => void;

export interface CordisContextLike {
  emit(event: string, ...args: unknown[]): void;
}

export interface ElectronLike {
  nativeTheme?: {
    themeSource: "light" | "dark" | "system";
  };
}

export interface AppearanceHostServiceOptions {
  ctx?: CordisContextLike;
  electron?: ElectronLike;
  initialState?: Partial<AppearanceState>;
}

export const DEFAULT_APPEARANCE_STATE: AppearanceState = {
  mode: "system",
  theme: "forest-green",
  fontScale: 1.0,
  monoFont: "sf-mono",
  reduceMotion: false,
};

export class AppearanceHostService {
  private state: AppearanceState;
  private listeners: Set<AppearanceListener> = new Set();
  private ctx?: CordisContextLike;
  private electron?: ElectronLike;

  constructor(options: AppearanceHostServiceOptions = {}) {
    this.ctx = options.ctx;
    const proc = typeof globalThis !== "undefined" ? (globalThis as any).process : undefined;
    this.electron = options.electron ?? (proc?.versions?.electron ? this.resolveElectron() : undefined);
    this.state = {
      ...DEFAULT_APPEARANCE_STATE,
      ...options.initialState,
    };

    this.syncNativeTheme(this.state.mode);
  }

  private resolveElectron(): ElectronLike | undefined {
    try {
      // Lazy-load electron if present in electron runtime
      const req = (globalThis as any).require;
      return typeof req === "function" ? req("electron") : undefined;
    } catch {
      return undefined;
    }
  }

  public getAppearance(): AppearanceState {
    return { ...this.state };
  }

  public subscribe(listener: AppearanceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public updateAppearance(partial: Partial<AppearanceState>): AppearanceState {
    let changed = false;
    const next: AppearanceState = { ...this.state };

    if (partial.mode !== undefined && partial.mode !== next.mode) {
      next.mode = partial.mode;
      changed = true;
    }
    if (partial.theme !== undefined && partial.theme !== next.theme) {
      next.theme = partial.theme;
      changed = true;
    }
    if (partial.fontScale !== undefined && partial.fontScale !== next.fontScale) {
      next.fontScale = partial.fontScale;
      changed = true;
    }
    if (partial.monoFont !== undefined && partial.monoFont !== next.monoFont) {
      next.monoFont = partial.monoFont;
      changed = true;
    }
    if (partial.reduceMotion !== undefined && partial.reduceMotion !== next.reduceMotion) {
      next.reduceMotion = partial.reduceMotion;
      changed = true;
    }

    if (!changed) {
      return this.getAppearance();
    }

    this.state = next;
    this.syncNativeTheme(this.state.mode);
    this.notifySubscribers();
    this.broadcastCordis();

    return this.getAppearance();
  }

  private syncNativeTheme(mode: AppearanceState["mode"]): void {
    if (this.electron?.nativeTheme) {
      this.electron.nativeTheme.themeSource = mode;
    }
  }

  private notifySubscribers(): void {
    const snapshot = this.getAppearance();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Prevent subscriber errors from throwing
      }
    }
  }

  private broadcastCordis(): void {
    if (this.ctx && typeof this.ctx.emit === "function") {
      try {
        this.ctx.emit("appearance/change", this.getAppearance());
      } catch {
        // Prevent emit errors from failing update
      }
    }
  }
}
