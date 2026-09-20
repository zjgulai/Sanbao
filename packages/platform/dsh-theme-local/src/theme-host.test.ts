import { describe, test, expect, vi, beforeEach } from "vitest";
import { AppearanceHostService, type AppearanceState } from "./theme-host.js";

describe("AppearanceHostService", () => {
  let mockElectron: any;

  beforeEach(() => {
    mockElectron = {
      nativeTheme: {
        themeSource: "system",
      },
    };
  });

  test("AppearanceHostService syncs mode changes to subscribers", () => {
    const service = new AppearanceHostService({ electron: mockElectron });
    const listener = vi.fn();
    service.subscribe(listener);

    service.updateAppearance({ mode: "dark", theme: "parchment" });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "dark", theme: "parchment" }),
    );
  });

  test("AppearanceHostService initializes with default appearance state", () => {
    const service = new AppearanceHostService({ electron: mockElectron });
    const state = service.getAppearance();

    expect(state).toEqual({
      mode: "system",
      theme: "forest-green",
      fontScale: 1.0,
      monoFont: "sf-mono",
      reduceMotion: false,
    });
    expect(mockElectron.nativeTheme.themeSource).toBe("system");
  });

  test("AppearanceHostService syncs nativeTheme.themeSource with Electron", () => {
    const service = new AppearanceHostService({ electron: mockElectron });

    service.updateAppearance({ mode: "dark" });
    expect(mockElectron.nativeTheme.themeSource).toBe("dark");

    service.updateAppearance({ mode: "light" });
    expect(mockElectron.nativeTheme.themeSource).toBe("light");

    service.updateAppearance({ mode: "system" });
    expect(mockElectron.nativeTheme.themeSource).toBe("system");
  });

  test("AppearanceHostService emits appearance/change on Cordis context if provided", () => {
    const mockCtx = {
      emit: vi.fn(),
    };
    const service = new AppearanceHostService({
      ctx: mockCtx,
      electron: mockElectron,
    });

    service.updateAppearance({
      mode: "dark",
      theme: "warm-pink",
      fontScale: 1.1,
      monoFont: "jetbrains",
      reduceMotion: true,
    });

    expect(mockCtx.emit).toHaveBeenCalledWith("appearance/change", {
      mode: "dark",
      theme: "warm-pink",
      fontScale: 1.1,
      monoFont: "jetbrains",
      reduceMotion: true,
    });
  });

  test("AppearanceHostService handles unsubscribe properly", () => {
    const service = new AppearanceHostService({ electron: mockElectron });
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    service.updateAppearance({ mode: "light" });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    service.updateAppearance({ mode: "dark" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("AppearanceHostService ignores updates with identical values", () => {
    const service = new AppearanceHostService({ electron: mockElectron });
    const listener = vi.fn();
    service.subscribe(listener);

    service.updateAppearance({ mode: "system" });
    expect(listener).not.toHaveBeenCalled();
  });
});
