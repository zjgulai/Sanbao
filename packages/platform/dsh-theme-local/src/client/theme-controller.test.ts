import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  AppearanceController,
  type AppearanceState,
} from "./theme-controller.js";
import { type ThemeStudioStorage } from "./persistence.js";

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
    setAttribute: (name: string, val: string) => {
      htmlAttrs.set(name, String(val));
    },
    removeAttribute: (name: string) => {
      htmlAttrs.delete(name);
    },
    style: {
      getPropertyValue: (name: string) => htmlStyles.get(name) ?? "",
      setProperty: (name: string, val: string) => {
        htmlStyles.set(name, String(val));
      },
      removeProperty: (name: string) => {
        htmlStyles.delete(name);
      },
    },
  };

  const body = {
    getAttribute: (name: string) => bodyAttrs.get(name) ?? null,
    setAttribute: (name: string, val: string) => {
      bodyAttrs.set(name, String(val));
    },
    removeAttribute: (name: string) => {
      bodyAttrs.delete(name);
    },
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

describe("AppearanceController", () => {
  it("initializes with default state when storage is empty", () => {
    const storage = memoryStorage();
    const mockDoc = createMockDocument();
    const controller = new AppearanceController({ storage, doc: mockDoc });

    const state = controller.getState();
    expect(state.mode).toBe("system");
    expect(state.theme).toBe("forest-green");
    expect(state.effectiveMode).toBe("light");
    expect(state.fontScale).toBe(1.0);
    expect(state.reducedMotion).toBe(false);

    expect(mockDoc.documentElement.getAttribute("data-sanbao-mode")).toBe("light");
    expect(mockDoc.documentElement.getAttribute("data-sanbao-theme")).toBe("forest-green");
    expect(mockDoc.documentElement.style.getPropertyValue("--sanbao-font-scale")).toBe("1");
    expect(mockDoc.body.getAttribute("data-sanbao-mode")).toBe("light");
    expect(mockDoc.body.getAttribute("data-sanbao-theme")).toBe("forest-green");
    expect(mockDoc.body.getAttribute("data-lute-reduce-motion")).toBeNull();
  });

  it("initializes with partial initialState overrides and applies to DOM", () => {
    const storage = memoryStorage();
    const mockDoc = createMockDocument();
    const controller = new AppearanceController({
      storage,
      doc: mockDoc,
      initialState: {
        mode: "dark",
        theme: "warm-pink",
        fontScale: 1.25,
        reducedMotion: true,
      },
    });

    const state = controller.getState();
    expect(state.mode).toBe("dark");
    expect(state.theme).toBe("warm-pink");
    expect(state.effectiveMode).toBe("dark");
    expect(state.fontScale).toBe(1.25);
    expect(state.reducedMotion).toBe(true);

    expect(mockDoc.documentElement.getAttribute("data-sanbao-mode")).toBe("dark");
    expect(mockDoc.documentElement.getAttribute("data-sanbao-theme")).toBe("warm-pink");
    expect(mockDoc.documentElement.style.getPropertyValue("--sanbao-font-scale")).toBe("1.25");
    expect(mockDoc.body.getAttribute("data-lute-reduce-motion")).toBe("reduce");
  });

  it("updates mode and recalculates effectiveMode", () => {
    const storage = memoryStorage();
    const mockDoc = createMockDocument();
    const controller = new AppearanceController({ storage, doc: mockDoc });

    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.setMode("dark");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "dark",
        effectiveMode: "dark",
      }),
    );

    expect(mockDoc.documentElement.getAttribute("data-sanbao-mode")).toBe("dark");
    expect(mockDoc.body.getAttribute("data-sanbao-mode")).toBe("dark");

    unsubscribe();
    controller.setMode("light");
    expect(listener).toHaveBeenCalledTimes(1); // not called again
  });

  it("updates theme across 3 seasonal themes matrix", () => {
    const storage = memoryStorage();
    const mockDoc = createMockDocument();
    const controller = new AppearanceController({ storage, doc: mockDoc });

    controller.setTheme("parchment");
    expect(controller.getState().theme).toBe("parchment");
    expect(mockDoc.documentElement.getAttribute("data-sanbao-theme")).toBe("parchment");

    controller.setTheme("warm-pink");
    expect(controller.getState().theme).toBe("warm-pink");
    expect(mockDoc.documentElement.getAttribute("data-sanbao-theme")).toBe("warm-pink");

    controller.setTheme("forest-green");
    expect(controller.getState().theme).toBe("forest-green");
    expect(mockDoc.documentElement.getAttribute("data-sanbao-theme")).toBe("forest-green");

    // Invalid theme should be ignored
    controller.setTheme("invalid-theme" as any);
    expect(controller.getState().theme).toBe("forest-green");
  });

  it("clamps fontScale between 0.5 and 2.0", () => {
    const storage = memoryStorage();
    const mockDoc = createMockDocument();
    const controller = new AppearanceController({ storage, doc: mockDoc });

    controller.setFontScale(0.2);
    expect(controller.getState().fontScale).toBe(0.5);

    controller.setFontScale(2.5);
    expect(controller.getState().fontScale).toBe(2.0);

    controller.setFontScale(1.155);
    expect(controller.getState().fontScale).toBe(1.16);
  });

  it("toggles reducedMotion and updates data-lute-reduce-motion attribute", () => {
    const storage = memoryStorage();
    const mockDoc = createMockDocument();
    const controller = new AppearanceController({ storage, doc: mockDoc });

    expect(mockDoc.body.getAttribute("data-lute-reduce-motion")).toBeNull();

    controller.setReducedMotion(true);
    expect(controller.getState().reducedMotion).toBe(true);
    expect(mockDoc.body.getAttribute("data-lute-reduce-motion")).toBe("reduce");

    controller.setReducedMotion(false);
    expect(controller.getState().reducedMotion).toBe(false);
    expect(mockDoc.body.getAttribute("data-lute-reduce-motion")).toBeNull();
  });

  it("updates appearance in batch via updateAppearance", () => {
    const storage = memoryStorage();
    const mockDoc = createMockDocument();
    const controller = new AppearanceController({ storage, doc: mockDoc });

    const listener = vi.fn();
    controller.subscribe(listener);

    controller.updateAppearance({
      mode: "dark",
      theme: "parchment",
      fontScale: 1.2,
      reducedMotion: true,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({
      mode: "dark",
      theme: "parchment",
      effectiveMode: "dark",
      fontScale: 1.2,
      reducedMotion: true,
    });
    expect(mockDoc.documentElement.getAttribute("data-sanbao-mode")).toBe("dark");
    expect(mockDoc.documentElement.getAttribute("data-sanbao-theme")).toBe("parchment");
    expect(mockDoc.body.getAttribute("data-lute-reduce-motion")).toBe("reduce");
  });

  it("listens to system media query changes when mode is system", () => {
    let changeHandler: ((e: any) => void) | undefined;
    const mediaQueryList = {
      matches: false,
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === "change") changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
    };

    const originalWindow = globalThis.window;
    (globalThis as any).window = {
      matchMedia: vi.fn().mockReturnValue(mediaQueryList),
    };

    const storage = memoryStorage();
    const mockDoc = createMockDocument();
    const controller = new AppearanceController({ storage, doc: mockDoc });

    expect(controller.getState().effectiveMode).toBe("light");

    // Simulate system switching to dark
    if (changeHandler) {
      changeHandler({ matches: true } as any);
    }

    expect(controller.getState().effectiveMode).toBe("dark");
    expect(mockDoc.documentElement.getAttribute("data-sanbao-mode")).toBe("dark");

    controller.dispose();
    expect(mediaQueryList.removeEventListener).toHaveBeenCalledWith("change", changeHandler);

    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      globalThis.window = originalWindow;
    }
  });
});
