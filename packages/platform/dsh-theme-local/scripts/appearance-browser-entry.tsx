import * as React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { apply } from "../src/client/index.js";
import { DEFAULT_THEME_STUDIO_SETTINGS, decodeThemeStudioSettings, THEME_SETTINGS_NAMESPACE } from "../src/theme-settings.js";

// Only host boundaries are adapted. apply, registered component, store actions,
// controller, model, typography, palettes and CSS come from the production source.
const clone = <T,>(value: T): T => structuredClone(value);
const params = new URLSearchParams(location.search);
const cleanups: (() => void)[] = [];
const scopeListeners = new Set<() => void>();
const themeListeners = new Set<(snapshot: any) => void>();
const dictionaries = new Map<string, any>();
const layers = new Map<string, any>();
const requests: any[] = [];
let behavior = "accept";
let disposed = false;
let registration: any;
let store: any;
let injected: any;
let renderCount = 0;
let injectionCount = 0;
let registerCount = 0;
let preference = "light";
let themeRevision = 0;
let themeWrites = 0;
let snapshot: any = {
  status: "ready", value: clone(DEFAULT_THEME_STUDIO_SETTINGS),
  base: clone(DEFAULT_THEME_STUDIO_SETTINGS), user: clone(DEFAULT_THEME_STUDIO_SETTINGS),
  revision: 1, writable: true, mode: "host",
};

// Read the real installed host defaults, including identical body variable names.
function readDefaults(dark: boolean) {
  document.body.toggleAttribute("data-ds-dark-theme", dark);
  const css = getComputedStyle(document.body);
  return Object.fromEntries(Array.from(css)
    .filter(key => key.startsWith("--dsw-") || key.startsWith("--ds-font-"))
    .map(key => [key, css.getPropertyValue(key)]));
}
const defaults = { light: readDefaults(false), dark: readDefaults(true) };
document.body.removeAttribute("data-ds-dark-theme");
const baselineInline = document.body.style.cssText;
function getTheme() {
  return { preference, active: { id: preference, colorScheme: preference === "dark" ? "dark" : "light", tokens: {} }, revision: themeRevision, themes: [], fontSize: 14 };
}
function present() {
  const scheme = preference === "dark" ? "dark" : "light";
  const tokens = Object.assign({}, defaults[scheme], ...Array.from(layers.values()).map(layer =>
    Object.fromEntries(Object.entries(layer).map(([key, pair]: [string, any]) => [key, pair[scheme]]))));
  document.body.toggleAttribute("data-ds-dark-theme", scheme === "dark");
  for (const [key, value] of Object.entries(tokens)) document.body.style.setProperty(key, String(value));
  document.body.style.colorScheme = scheme;
  themeRevision++;
  themeListeners.forEach(listener => listener(getTheme()));
}
present();
function publish(value: any, user = value) {
  const decoded = decodeThemeStudioSettings(value);
  if (!decoded) throw new Error("Invalid Host fixture settings");
  snapshot = { ...snapshot, value: decoded, user: clone(user), revision: snapshot.revision + 1 };
  scopeListeners.forEach(listener => listener());
}
function settle(request: any, mode: string) {
  if (request.settled) throw new Error("Host request settled twice");
  request.settled = true;
  if (mode === "reject") { request.reject(new Error("Intentional test Host rejection")); return; }
  if (mode === "accept") {
    const value = clone(snapshot.value);
    for (const op of request.ops) {
      if (op.op !== "set" || op.path.length !== 1) throw new Error("Unexpected Scope operation");
      value[op.path[0]] = op.value;
    }
    publish(value);
  }
  // recover-without-write models an SDK promise that resolves after rejection recovery.
  request.resolve();
}
const scope = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) { scopeListeners.add(listener); return () => { scopeListeners.delete(listener); }; },
  mutate(ops: any[], revision?: number) {
    return new Promise<void>((resolve, reject) => {
      const request = { ops: clone(ops), revision, resolve, reject, settled: false };
      requests.push(request);
      if (behavior !== "defer") queueMicrotask(() => settle(request, behavior));
    });
  },
};
const root = createRoot(document.getElementById("appearance-root")!);
const ctx = {
  settingsScope: { bind(spec: any) {
    if (spec.namespace !== THEME_SETTINGS_NAMESPACE || !spec.decode(snapshot.value)) throw new Error("Scope binding contract mismatch");
    return scope;
  } },
  theme: {
    getTheme,
    setTheme(next: string) {
      if (next !== "light" && next !== "dark") throw new Error(`Unexpected official preference: ${next}`);
      if (++themeWrites > 300) throw new Error("Recursive theme/change echo");
      preference = next;
      present();
    },
    overrideTokens(source: string, tokens: any) {
      layers.set(source, tokens);
      present();
      return () => { if (layers.get(source) === tokens) { layers.delete(source); present(); } };
    },
  },
  locale: {
    register(ns: string, dicts: any) { dictionaries.set(ns, dicts); return () => { dictionaries.delete(ns); }; },
    bind(ns: string) { return (key: string) => {
      const value = dictionaries.get(ns)?.[params.get("locale") === "en" ? "en" : "zh"]?.[key];
      if (typeof value !== "string") throw new Error(`Missing real locale key: ${key}`);
      return value;
    }; },
  },
  on(event: string, listener: (value: any) => void) {
    if (event !== "theme/change") throw new Error(`Unexpected host event: ${event}`);
    themeListeners.add(listener);
    return () => { themeListeners.delete(listener); };
  },
  effect(callback: () => void | (() => void)) { const release = callback(); if (release) cleanups.push(release); },
  slots: {
    inject(key: string, callback: () => unknown) {
      if (key !== "settings.section") throw new Error(`Unexpected slot: ${key}`);
      injectionCount++;
      return callback();
    },
    register(options: any, Component: React.ComponentType<any>) {
      if (registration || options.id !== "dsh-theme") throw new Error("Unexpected component registration");
      registerCount++;
      registration = options;
      store = options.store.create();
      injected = options.inject(store.actions);
      function RegisteredSlot() {
        renderCount++;
        return <Component {...injected} t={ctx.locale.bind(options.locale)} useStore={(select: (state: any) => any) => {
          const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
          return select(state);
        }} />;
      }
      flushSync(() => root.render(<RegisteredSlot />));
      const release = () => { flushSync(() => root.unmount()); registration = undefined; };
      cleanups.push(release);
      return release;
    },
  },
};
apply(ctx as Parameters<typeof apply>[0]);
if (params.get("cssOrder") === "after") {
  // Move unmodified installed sheets after apply's sheets; assert cascade in both orders.
  document.querySelectorAll("style[data-official-css]").forEach(tag => document.head.append(tag));
}

(window as any).__appearance = {
  ready: true,
  info: () => ({
    injectionCount, registerCount, renderCount, registeredId: registration?.id,
    injectedActions: Object.keys(injected ?? {}).sort(), state: clone(store.getSnapshot()),
    host: clone(snapshot), requests: requests.map(({ ops, revision, settled }) => ({ ops, revision, settled })),
    scopeListeners: scopeListeners.size, themeListeners: themeListeners.size,
    layers: layers.size, dictionaries: dictionaries.size, themeWrites, preference,
    officialDefaultCount: Object.keys(defaults.light).length,
    contractTokenNames: Array.from(layers.values()).flatMap(layer => Object.keys(layer)),
    disposed,
  }),
  behavior(mode: string) {
    if (!["accept", "reject", "recover-without-write", "defer"].includes(mode)) throw new Error("Unknown Host behavior");
    behavior = mode;
  },
  publish,
  echo: (next: string) => ctx.theme.setTheme(next),
  settlePending: (mode = "accept") => requests.filter(request => !request.settled).forEach(request => settle(request, mode)),
  dispose() {
    if (disposed) return;
    disposed = true;
    cleanups.reverse().forEach(release => release());
  },
  lateActions() {
    injected.setTheme("dark");
    injected.setTypography("uiFont", "serif");
    injected.setPrefs({ reduceMotion: "on" });
  },
  baselineInline,
};
