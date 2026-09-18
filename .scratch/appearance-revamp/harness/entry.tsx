/**
 * 一次性渲染 harness（用完即删，不属于交付物）。
 *
 * 目的：让 **真实** 的插件客户端路径在真实 Chromium 里跑起来 ——
 * 真的 `apply(ctx)`、真的 store、真的 `ThemeStudio`、真的 `studio.css`，
 * 只有 host 服务（slots/locale/theme）是桩。这样「外观页长什么样、点下去发生什么」
 * 就有可复核的读数，而不是靠读代码推断。
 */
import * as React from "react";
import { createRoot } from "react-dom/client";

import type {} from "@deepseek-ai/dsh-client-ui-slots";

import { en, NS, zh } from "../src/client/locales.js";
import { apply } from "../src/client/index.js";

declare global {
  interface Window {
    __harness: {
      registered: boolean;
      themeCalls: string[];
      tokens: Record<string, { light: string; dark: string }>;
      cssTags: string[];
      cleanup(): void;
    };
  }
}

const themeCalls: string[] = [];
const tokenSink: Record<string, { light: string; dark: string }> = {};
let dictionaries: Record<string, string> = { ...zh };
let boundKey = "";

function effect(callback: () => (() => void) | void): void {
  const cleanup = callback();
  if (typeof cleanup === "function") cleanups.push(cleanup);
}
const cleanups: Array<() => void> = [];

const ctx = {
  theme: {
    overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>) {
      for (const [name, pair] of Object.entries(tokens)) tokenSink[name] = pair;
      // 真实 host 把 contract token 落成样式；桩里同样落，否则画布缺这一半 token。
      const light = Object.entries(tokens).map(([name, pair]) => `${name}: ${pair.light};`).join(" ");
      const dark = Object.entries(tokens).map(([name, pair]) => `${name}: ${pair.dark};`).join(" ");
      const tag = document.createElement("style");
      tag.dataset.plugin = source;
      tag.dataset.pluginCss = "dsh-theme/contract-tokens";
      tag.textContent = `:root { ${light} } body[data-ds-dark-theme] { ${dark} }`;
      document.head.appendChild(tag);
      return () => {
        for (const name of Object.keys(tokens)) delete tokenSink[name];
        tag.remove();
      };
    },
    getTheme() {
      return {
        preference: "system",
        active: { colorScheme: "light" as const },
      } as never;
    },
    setTheme(preference: string) {
      themeCalls.push(preference);
    },
  },
  slots: {
    inject(_key: string, callback: () => unknown) {
      callback();
    },
    register(options: Record<string, unknown>, component: unknown) {
      (window as never as { __registered?: unknown }).__registered = {
        options,
        component,
      };
      return options;
    },
  },
  locale: {
    register(_ns: string, dicts: { zh: Record<string, string>; en: Record<string, string> }) {
      dictionaries = { ...dicts.zh };
      return () => {};
    },
    bind(ns: string) {
      boundKey = ns;
      return (key: string) => dictionaries[key] ?? key;
    },
  },
  on() {
    return () => {};
  },
  effect,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
apply(ctx as any);

const registered = (
  window as unknown as {
    __registered?: {
      options: {
        store: { create(): { actions: unknown; getSnapshot(): unknown; subscribe(fn: () => void): () => void } };
        inject: (actions: unknown) => Record<string, unknown>;
      };
      component: React.ComponentType<Record<string, unknown>>;
    };
  }
).__registered;

if (registered === undefined) throw new Error("harness: slots.register 没有被调用");

const instance = registered.options.store.create();
const injected = registered.options.inject(instance.actions);

function useStore<S>(
  selector: (state: never) => S,
  equals?: (a: S, b: S) => boolean,
): S {
  const snapshot = React.useSyncExternalStore(
    (callback) => instance.subscribe(callback),
    () => instance.getSnapshot(),
    () => instance.getSnapshot(),
  );
  const [state] = React.useState(() => ({ value: selector(snapshot as never) }));
  const next = selector(snapshot as never);
  const same = equals === undefined ? Object.is(state.value, next) : equals(state.value, next);
  if (!same) state.value = next;
  return state.value;
}

const Component = registered.component;
const t = (key: string) => dictionaries[key] ?? key;

window.__harness = {
  registered: true,
  themeCalls,
  tokens: tokenSink,
  cssTags: boundKey === NS ? [...document.querySelectorAll("style[data-plugin-css]")].map((tag) => (tag as HTMLStyleElement).dataset.pluginCss ?? "") : [],
  cleanup() {
    for (const fn of cleanups) fn();
  },
};

createRoot(document.getElementById("root")!).render(
  React.createElement(Component, {
    ...injected,
    locale: NS,
    t,
    useStore,
  }),
);
