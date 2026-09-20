import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThemeSnapshot, ThemeTokenOverrides } from "@deepseek-ai/dsh-client-ui-theme/client";
import { apply, inject } from "./index.js";
import { DEFAULT_THEME_STUDIO_SETTINGS as defaults, type ThemeStudioSettings } from "../theme-settings.js";
import { themeBootRows } from "../theme-host.js";
import type { AppearanceScope, AppearanceSnapshot } from "./theme-controller.js";
import type { createThemeStudioStore } from "./store.js";
import type { ThemeStudioInjected } from "./ThemeStudio.js";
import { zh } from "./locales.js";

// Reuse an installed DOM implementation; no dependency install or production import.
const require = createRequire(import.meta.url);
const domRequire = createRequire(process.env.DSH_THEME_DOM_PACKAGE ?? new URL("../../../dsh-root-brand-local/package.json", import.meta.url));
const { Window } = domRequire("happy-dom") as { Window: new (options: { url: string }) => {
  document: Document;
  localStorage: Storage;
  getComputedStyle(element: Element): CSSStyleDeclaration;
  close(): void;
} };
const { renderToStaticMarkup } = require("react-dom/server") as { renderToStaticMarkup(element: React.ReactElement): string };
type Context = Parameters<typeof apply>[0];
type Store = ReturnType<ReturnType<typeof createThemeStudioStore>["create"]>;
const fonts = { uiFont: "avenir", codeFont: "menlo", uiFontSize: 15, codeFontSize: 13 } as const;
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

class Scope implements AppearanceScope {
  snapshot: AppearanceSnapshot = { status: "loading", value: undefined, base: undefined, user: undefined, revision: undefined, writable: false, mode: "host" };
  listeners = new Set<() => void>();
  requests: { ops: Parameters<AppearanceScope["mutate"]>[0]; resolve(): void }[] = [];
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  mutate: AppearanceScope["mutate"] = ops => new Promise<void>(resolve => { this.requests.push({ ops, resolve }); });
  publish(value: ThemeStudioSettings, user: unknown = value) {
    this.snapshot = { status: "ready", value, base: defaults, user, revision: (this.snapshot.revision ?? 0) + 1, writable: true, mode: "host" };
    this.listeners.forEach(listener => listener());
  }
  accept(index: number) {
    const request = this.requests[index]!;
    const value = { ...(this.snapshot.value ?? defaults) };
    for (const op of request.ops) Object.assign(value, { [op.path[0]!]: op.value });
    this.publish(value);
    request.resolve();
  }
}

let browser: InstanceType<typeof Window>;
let cleanups: (() => void)[];
beforeEach(() => {
  browser = new Window({ url: "http://localhost/" });
  cleanups = [];
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", browser.document);
  vi.stubGlobal("localStorage", browser.localStorage);
});
afterEach(() => {
  cleanups.reverse().forEach(cleanup => cleanup());
  browser.close();
  vi.unstubAllGlobals();
});

function setup(preference: ThemeSnapshot["preference"] = "dark", scheme: "light" | "dark" = "dark") {
  const scope = new Scope();
  const disposers: (() => void)[] = [];
  const listeners = new Set<(snapshot: ThemeSnapshot) => void>();
  const layers = new Map<string, ThemeTokenOverrides>();
  const themeWrites: ThemeSnapshot["preference"][] = [];
  const motionListeners = new Set<() => void>();
  Object.assign(browser, { matchMedia: () => ({
    matches: false,
    addEventListener: (_event: string, fn: () => void) => motionListeners.add(fn),
    removeEventListener: (_event: string, fn: () => void) => motionListeners.delete(fn),
  }) });
  let snapshot: ThemeSnapshot = { preference, active: { id: scheme, colorScheme: scheme, tokens: {} }, fontSize: 14, themes: [], revision: 0 };
  const emit = () => {
    const tokens = Object.assign({}, ...[...layers.values()].map(layer => Object.fromEntries(Object.entries(layer).map(([key, pair]) => [key, pair[snapshot.active.colorScheme]]))));
    snapshot = { ...snapshot, active: { ...snapshot.active, tokens }, revision: snapshot.revision + 1 };
    // The official presenter writes normal inline tokens and the dark attribute.
    document.body.toggleAttribute("data-ds-dark-theme", snapshot.active.colorScheme === "dark");
    for (const [key, value] of Object.entries(tokens)) document.body.style.setProperty(key, String(value));
    listeners.forEach(listener => listener(snapshot));
  };
  let registration: Record<string, unknown> | undefined;
  let component: unknown;
  let dictionaries = 0;
  const ctx = {
    settingsScope: {
      bind: (options: { namespace: string; decode(value: unknown): unknown }) => {
        expect(options.namespace).toBe("sanbao-appearance");
        expect(options.decode({ ...defaults, lightAccent: "discard" })).toEqual(defaults);
        return scope;
      },
    },
    theme: {
      getTheme: () => snapshot,
      setTheme: (next: ThemeSnapshot["preference"]) => {
        themeWrites.push(next);
        if (themeWrites.length > 12) throw new Error("recursive theme/change");
        snapshot = { ...snapshot, preference: next, active: { ...snapshot.active, id: next, colorScheme: next === "dark" ? "dark" : "light" } };
        emit();
      },
      overrideTokens: (source: string, tokens: ThemeTokenOverrides) => {
        expect(Object.keys(tokens)).toHaveLength(13);
        layers.set(source, tokens);
        emit();
        return () => {
          if (layers.get(source) !== tokens) return;
          layers.delete(source);
          Object.keys(tokens).forEach(key => document.body.style.removeProperty(key));
          emit();
        };
      },
    },
    locale: {
      register: () => { dictionaries++; return () => { dictionaries--; }; },
      bind: () => (key: string) => zh[key as keyof typeof zh],
    },
    slots: {
      inject: (key: string, callback: () => unknown) => { expect(key).toBe("settings.section"); callback(); },
      register: (options: Record<string, unknown>, view: unknown) => {
        registration = options; component = view;
        const release = () => { registration = undefined; };
        disposers.push(release);
        return release;
      },
    },
    effect: (callback: () => (() => void) | void) => { const release = callback(); if (release) disposers.push(release); },
    on: (event: string, listener: (snapshot: ThemeSnapshot) => void) => {
      expect(event).toBe("theme/change");
      listeners.add(listener);
      const release = () => { listeners.delete(listener); };
      disposers.push(release);
      return release;
    },
  };
  let disposed = false;
  const dispose = () => { if (!disposed) { disposed = true; disposers.reverse().forEach(fn => fn()); } };
  cleanups.push(dispose);
  return {
    scope, themeWrites, listeners, layers, motionListeners, dispose,
    get dictionaries() { return dictionaries; },
    get registration() { return registration; },
    start: () => apply(ctx as Context),
    echo: (next: ThemeSnapshot["preference"]) => ctx.theme.setTheme(next),
    mount: () => {
      const store = (registration!.store as ReturnType<typeof createThemeStudioStore>).create();
      const actions = (registration!.inject as (bound: Store["actions"]) => ThemeStudioInjected)(store.actions);
      return { store, actions, html: () => renderToStaticMarkup(React.createElement(component as React.ComponentType<Record<string, unknown>>, {
        ...actions, useStore: (select: (value: ReturnType<Store["getSnapshot"]>) => unknown) => select(store.getSnapshot()),
        t: (key: keyof typeof zh) => zh[key],
      })) };
    },
  };
}

function boot(settings: ThemeStudioSettings) {
  const script = themeBootRows(settings, settings, { preference: "dark" }).find(row => row.kind === "script")!;
  runInNewContext(script.text, { document, localStorage, matchMedia: () => ({ matches: false }) });
}
const computed = (key: string) => browser.getComputedStyle(document.body).getPropertyValue(key).trim();

describe("actual client apply", () => {
  it("routes document selections through the controller and publishes honest save status", async () => {
    const changes: unknown[] = [];
    document.addEventListener("sanbao:appearance-change", event => changes.push((event as CustomEvent).detail));
    const app = setup(); app.scope.publish(defaults); app.start();
    const ui = app.mount();
    const select = (detail: unknown) => {
      const event = document.createEvent("CustomEvent");
      event.initCustomEvent("sanbao:select-theme", false, false, detail);
      document.dispatchEvent(event);
    };
    expect(changes.at(-1)).toEqual({ themeId: "light", saveStatus: "saved" });
    for (const themeId of ["dark", "warm-pink", "light"] as const) {
      const index = app.scope.requests.length;
      select({ themeId });
      expect(app.scope.requests[index]!.ops).toEqual([{ op: "set", path: ["themeId"], value: themeId }]);
      expect(ui.store.getSnapshot().settings.themeId).toBe(themeId);
      expect(document.body.dataset.sanbaoTheme).toBe(themeId);
      expect(changes.at(-1)).toEqual({ themeId, saveStatus: "saving" });
      app.scope.accept(index); await flush();
      expect(changes.at(-1)).toEqual({ themeId, saveStatus: "saved" });
      expect(JSON.parse(localStorage.getItem("dsh-theme/settings/v2")!).themeId).toBe(themeId);
    }
    select({ themeId: "warm-pink" });
    app.scope.requests.at(-1)!.resolve(); await flush();
    expect(changes.at(-1)).toEqual({ themeId: "warm-pink", saveStatus: "error" });
    expect(JSON.parse(localStorage.getItem("dsh-theme/settings/v2")!).themeId).toBe("light");
    app.echo("light");
    expect(document.body.dataset.sanbaoTheme).toBe("warm-pink");
    expect(ui.store.getSnapshot().settings.themeId).toBe("warm-pink");
    const count = changes.length;
    app.dispose();
    select({ themeId: "dark" });
    expect(app.scope.requests).toHaveLength(4);
    expect(changes).toHaveLength(count);
  });

  it("rejects raw invalid event payloads without any controller or storage write", () => {
    const app = setup(); app.scope.publish(defaults); app.start();
    const ui = app.mount();
    const before = localStorage.getItem("dsh-theme/settings/v2");
    const changes: unknown[] = [];
    document.addEventListener("sanbao:appearance-change", event => changes.push((event as CustomEvent).detail));
    for (const detail of [null, undefined, "dark", [], {}, { themeId: "system" }, { themeId: "foreign" },
      { themeId: "dark", uiFont: "serif" }, { themeId: "dark", [Symbol("extra")]: true },
      Object.create({ themeId: "dark" }), { get themeId() { throw new Error("must not read accessor"); } }]) {
      const event = document.createEvent("CustomEvent");
      event.initCustomEvent("sanbao:select-theme", false, false, detail);
      document.dispatchEvent(event);
    }
    const raw = document.createEvent("Event");
    raw.initEvent("sanbao:select-theme", false, false);
    Object.assign(raw, { detail: { themeId: "dark" } });
    document.dispatchEvent(raw);
    expect(app.scope.requests).toHaveLength(0);
    expect(ui.store.getSnapshot().settings).toEqual(defaults);
    expect(localStorage.getItem("dsh-theme/settings/v2")).toBe(before);
    expect(changes).toHaveLength(0);
  });

  it("declares and binds settingsScope; controller migrates only when Host is ready", async () => {
    expect(inject).toContain("settingsScope");
    localStorage.setItem("dsh-theme/settings/v1", JSON.stringify({ ...fonts, lightAccent: "bad" }));
    const app = setup(); app.start();
    const ui = app.mount();
    expect(document.body.dataset.sanbaoTheme).toBe("dark");
    expect(ui.store.getSnapshot()).toMatchObject({ settings: { ...fonts, themeId: "dark" }, saveStatus: "loading" });
    expect(app.scope.requests).toHaveLength(0);
    app.scope.publish(defaults, {});
    expect(ui.store.getSnapshot().saveStatus).toBe("saving");
    app.scope.accept(0); await flush();
    expect(ui.store.getSnapshot().saveStatus).toBe("saved");
    expect(JSON.parse(localStorage.getItem("dsh-theme/settings/v2")!)).toEqual({ ...fonts, themeId: "dark" });
  });

  it("uses the boot initial scheme before a later official snapshot, or the resolved official scheme without boot", () => {
    document.body.dataset.sanbaoInitialScheme = "dark";
    const app = setup("light", "light"); app.start();
    expect(document.body.dataset.sanbaoTheme).toBe("dark");
    expect(app.themeWrites).toEqual(["dark"]);
    app.dispose();
    delete document.body.dataset.sanbaoInitialScheme;
    const next = setup("system", "dark"); next.start();
    expect(document.body.dataset.sanbaoTheme).toBe("dark");
    expect(next.themeWrites).toEqual(["dark"]);
  });

  it("keeps warm-pink through synchronous override and light echoes; only writes changed official preferences", async () => {
    const app = setup(); app.start();
    app.scope.publish({ ...defaults, ...fonts, themeId: "warm-pink" });
    const ui = app.mount();
    expect(app.themeWrites).toEqual(["light"]);
    const tokenTag = document.querySelector('[data-plugin-css="dsh-theme/token-vars"]');
    app.echo("light");
    expect(document.body.dataset.sanbaoTheme).toBe("warm-pink");
    expect(ui.store.getSnapshot().settings.themeId).toBe("warm-pink");
    expect(computed("--sanbao-canvas")).toBe("#FFF8F7");
    expect(app.scope.requests).toHaveLength(0);
    ui.actions.setTheme("dark");
    ui.actions.setTheme("warm-pink");
    app.scope.accept(0); await flush();
    expect(ui.store.getSnapshot()).toMatchObject({ settings: { themeId: "warm-pink" }, saveStatus: "saving" });
    app.scope.accept(1); await flush();
    expect(ui.store.getSnapshot().saveStatus).toBe("saved");
    expect(app.themeWrites).toEqual(["light", "light", "dark", "light"]);
    expect(document.querySelector('[data-plugin-css="dsh-theme/token-vars"]')).toBe(tokenTag);
  });

  it("takes over marked boot tokens so typography changes and color reset preserve fonts and unrelated inline styles", async () => {
    const saved = { ...defaults, ...fonts, themeId: "warm-pink" as const };
    boot(saved);
    expect(document.body.dataset.sanbaoBootTokens).toBeDefined();
    document.body.style.setProperty("--unrelated", "keep", "important");
    document.body.style.setProperty("padding-left", "7px");
    document.body.style.setProperty("--dsw-alias-tooltip-bg", "replaced-by-another-owner", "important");
    const app = setup(); app.scope.publish(saved); app.start();
    const ui = app.mount();
    expect(document.body.style.getPropertyValue("--dsw-font-family")).toBe("");
    expect(document.body.dataset.sanbaoBootTokens).toBeUndefined();
    expect(computed("--dsw-font-family")).toContain("Avenir Next");
    ui.actions.setTypography("uiFont", "serif");
    app.scope.accept(0); await flush();
    ui.actions.setTypography("codeFont", "cascadia");
    app.scope.accept(1); await flush();
    ui.actions.setTypography("uiFontSize", 16);
    app.scope.accept(2); await flush();
    expect(computed("--dsw-font-family")).toContain("Iowan Old Style");
    expect(computed("--ds-font-family-code")).toContain("Cascadia Code");
    expect(computed("--sanbao-font-body")).toContain("16px/");
    ui.actions.resetTheme();
    app.scope.accept(3); await flush();
    expect(ui.store.getSnapshot().settings).toEqual({ ...fonts, themeId: "light", uiFont: "serif", codeFont: "cascadia", uiFontSize: 16 });
    expect(document.body.style.getPropertyValue("--unrelated")).toBe("keep");
    expect(document.body.style.paddingLeft).toBe("7px");
    expect(document.body.style.getPropertyValue("--dsw-alias-tooltip-bg")).toBe("replaced-by-another-owner");
  });

  it.each(["before", "after"])("beats official body defaults loaded %s and normal presenter inline tokens", (order: string) => {
    const style = document.createElement("style");
    style.textContent = 'body { --dsw-font-family: default-font; --dsw-specific-sidebar-right-fill: wrong; } body[data-ds-dark-theme] { --dsw-font-family: dark-default; }';
    if (order === "before") document.head.append(style);
    const app = setup(); app.start();
    app.scope.publish({ ...defaults, ...fonts, themeId: "warm-pink" });
    if (order === "after") document.head.append(style);
    document.body.style.setProperty("--dsw-font-family", "presenter-font");
    document.body.style.setProperty("--dsw-specific-sidebar-right-fill", "presenter-fill");
    document.body.setAttribute("data-ds-dark-theme", "");
    expect(computed("--dsw-font-family")).toContain("Avenir Next");
    expect(computed("--dsw-specific-sidebar-right-fill")).toBe("#F7EEEC");
    expect(computed("--dsw-alias-bg-base")).toBe("#FFF8F7");
    expect(computed("color-scheme")).toBe("light");
  });

  it("publishes a rejected Host write as error while local prefs retain their separate persistence path", async () => {
    const app = setup(); app.start(); app.scope.publish(defaults);
    const ui = app.mount();
    expect(Object.keys(ui.actions).sort()).toEqual(["resetTheme", "setPrefs", "setTheme", "setTypography"]);
    ui.actions.setTheme("warm-pink");
    app.scope.requests[0]!.resolve(); await flush();
    expect(ui.store.getSnapshot().saveStatus).toBe("error");
    ui.actions.setPrefs({ reduceMotion: "on", fontSmoothing: true });
    expect(document.body.dataset.luteReduceMotion).toBe("reduce");
    expect(document.body.dataset.luteFontSmoothing).toBe("on");
    expect(JSON.parse(localStorage.getItem("dsh-theme/prefs/v1")!)).toEqual({ reduceMotion: "on", fontSmoothing: true });
    expect(app.scope.requests).toHaveLength(1);
    expect(ui.store.getSnapshot().saveStatus).toBe("error");
  });

  it("releases listeners, styles, overrides and registrations; late Host replies cannot render after dispose", async () => {
    const app = setup(); app.start(); app.scope.publish(defaults);
    const ui = app.mount(); ui.actions.setTheme("warm-pink");
    expect(document.querySelector("style[data-sanbao-tokens]")).not.toBeNull();
    expect(app.scope.listeners.size).toBe(1);
    expect(app.motionListeners.size).toBe(1);
    app.dispose();
    const html = document.documentElement.outerHTML;
    app.scope.accept(0); await flush();
    ui.actions.setTheme("dark"); ui.actions.setTypography("uiFont", "serif"); ui.actions.setPrefs({ reduceMotion: "on" });
    expect(document.documentElement.outerHTML).toBe(html);
    expect(app.scope.requests).toHaveLength(1);
    expect(app.scope.listeners.size).toBe(0);
    expect(app.listeners.size).toBe(0);
    expect(app.motionListeners.size).toBe(0);
    expect(app.layers.size).toBe(0);
    expect(app.dictionaries).toBe(0);
    expect(app.registration).toBeUndefined();
    expect(document.querySelector("style[data-sanbao-tokens], style[data-plugin='dsh-theme']")).toBeNull();
    expect(document.body.dataset.sanbaoTheme).toBeUndefined();
  });

  it("the registered ThemeStudio previews consume each card's semantic tokens, independent of active theme", () => {
    const app = setup(); app.start(); app.scope.publish({ ...defaults, themeId: "dark" });
    const ui = app.mount();
    const sheet = document.createElement("style");
    sheet.textContent = readFileSync(new URL("./studio.css", import.meta.url), "utf8");
    document.head.append(sheet);
    document.body.innerHTML = ui.html();
    // Happy DOM preserves hex notation when resolving custom properties.
    const expected = [
      ["light", "#FDFDFD", "#F1F1F0", "#FFFFFF"],
      ["dark", "#232523", "#242624", "#191B1A"],
      ["warm-pink", "#FFF8F7", "#F7EEEC", "#FFFDFC"],
    ];
    for (const [mode, canvas, sidebar, panel] of expected) {
      const preview = document.querySelector(`[data-appearance-preview][data-mode="${mode}"]`)!;
      expect(browser.getComputedStyle(preview).backgroundColor).toBe(canvas);
      expect(browser.getComputedStyle(preview.querySelector("[data-appearance-preview-sidebar]")!).backgroundColor).toBe(sidebar);
      expect(browser.getComputedStyle(preview.querySelector("[data-appearance-preview-surface]")!).backgroundColor).toBe(panel);
    }
    expect(document.querySelectorAll('input[name="appearance-mode"]')).toHaveLength(3);
    expect(document.querySelector('input[name="appearance-mode"]:checked')?.getAttribute("value")).toBe("dark");
  });
});
