import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { apply } from "./index.js";
import { themeBootRows } from "./theme-host.js";
import { DEFAULT_THEME_STUDIO_SETTINGS as defaults, type ThemeId } from "./theme-settings.js";

function runBoot(text: string, systemDark = false, cache: Record<string, unknown> = {}) {
  const props = new Map<string, string>();
  const body = { dataset: {} as Record<string, string>, style: { setProperty: (k: string, v: string) => props.set(k, v) } };
  runInNewContext(text, { document: { body }, matchMedia: () => ({ matches: systemDark }), localStorage: { getItem: (key: string) => key in cache ? JSON.stringify(cache[key]) : null } });
  return { body, props };
}

describe("boot cache validation", () => {
  it.each(["uiFontSize", "codeFontSize"])("rejects v2 string-number %s rather than using a coerced token-map key", (field: string) => {
    const rows = themeBootRows(defaults, {}, { preference: "dark" });
    const { body, props } = runBoot(rows.find(row => row.kind === "script")!.text, false, {
      "dsh-theme/settings/v2": { ...defaults, themeId: "warm-pink", uiFontSize: 16, codeFontSize: 15, [field]: "15" },
    });
    expect(body.dataset.sanbaoTheme).toBe("dark");
    expect(props.get("--dsw-font-s-14")).toBe("14px/22px var(--dsw-font-family)");
    expect(props.get("--dsw-font-markdown-code-block-small")).toBe("12px/18px var(--ds-font-family-code)");
  });
  it.each([
    { uiFontSize: "16", codeFontSize: 15, ui: "14px/22px var(--dsw-font-family)", code: "15px/21px var(--ds-font-family-code)" },
    { uiFontSize: 16, codeFontSize: "15", ui: "16px/25.143px var(--dsw-font-family)", code: "12px/18px var(--ds-font-family-code)" },
  ])("migrates valid legacy typography independently and rejects string sizes: %j", (sample: { uiFontSize: string | number; codeFontSize: string | number; ui: string; code: string }) => {
    const rows = themeBootRows(defaults, {}, { preference: "system" });
    const { body, props } = runBoot(rows.find(row => row.kind === "script")!.text, true, {
      "dsh-theme/settings/v1": { themeId: "warm-pink", uiFont: "avenir", codeFont: "menlo", uiFontSize: sample.uiFontSize, codeFontSize: sample.codeFontSize, lightAccent: "bad" },
    });
    expect(body.dataset.sanbaoTheme).toBe("dark");
    expect(props.get("--dsw-font-family")).toMatch(/^"Avenir Next",/);
    expect(props.get("--ds-font-family-code")).toMatch(/^Menlo,/);
    expect(props.get("--dsw-font-s-14")).toBe(sample.ui);
    expect(props.get("--dsw-font-markdown-code-block-small")).toBe(sample.code);
  });
  it.each(["dsh-theme/settings/v1", "dsh-theme/settings/v2"])("preserves valid partial Host typography over %s without a saved identity", (key: string) => {
    const partial = { uiFont: "inter", uiFontSize: 16, codeFont: "invalid", codeFontSize: "15", secret: "must-not-reach-boot" };
    const rows = themeBootRows({ ...defaults, ...partial }, partial, { preference: "dark" });
    const text = rows.find(row => row.kind === "script")!.text;
    const { body, props } = runBoot(text, false, {
      [key]: { ...defaults, themeId: "warm-pink", uiFont: "avenir", codeFont: "menlo", uiFontSize: 15, codeFontSize: 13 },
    });
    expect(body.dataset.sanbaoTheme).toBe(key.endsWith("v2") ? "warm-pink" : "dark");
    expect(props.get("--dsw-font-family")).toMatch(/^Inter,/);
    expect(props.get("--ds-font-family-code")).toMatch(/^Menlo,/);
    expect(props.get("--dsw-font-s-14")).toBe("16px/25.143px var(--dsw-font-family)");
    expect(props.get("--dsw-font-markdown-code-block-small")).toBe("13px/19px var(--ds-font-family-code)");
    expect(text).not.toContain("must-not-reach-boot");
  });
  it.each(["light", "dark", "warm-pink"] as const)("keeps saved Host %s authoritative over cache and retains boot ownership", (themeId: ThemeId) => {
    const rows = themeBootRows({ ...defaults, themeId }, { themeId }, { preference: "dark" });
    const { body, props } = runBoot(rows.find(row => row.kind === "script")!.text, true, {
      "dsh-theme/settings/v2": { ...defaults, themeId: themeId === "dark" ? "light" : "dark", uiFont: "avenir", uiFontSize: 16 },
    });
    expect(body.dataset.sanbaoTheme).toBe(themeId);
    expect(body.dataset.sanbaoInitialScheme).toBe("dark");
    expect(props.get("--dsw-font-family")).toMatch(/^-apple-system,/);
    expect(props.get("--dsw-font-s-14")).toBe("14px/22px var(--dsw-font-family)");
    expect(JSON.parse(body.dataset.sanbaoBootTokens!)).toEqual(Object.fromEntries(props));
    expect(props.get("color-scheme")).toBe(themeId === "dark" ? "dark" : "light");
  });
});

it("requests redacted descriptions and keeps unrelated settings out of boot rows", () => {
  const descriptions: unknown[] = [];
  let handler: (table: { kind: string; text: string }[]) => void = () => {};
  const settings = {
    register: () => {},
    get: (ns: string) => ns === "ui-theme"
      ? { preference: "dark", extra: "official-extra-must-stay-host" }
      : { ...defaults, extra: "section-extra-must-stay-host" },
    describe: (options?: { redactSecrets?: boolean }) => {
      descriptions.push(options);
      return [
        { ns: "unrelated", user: { token: "unrelated-token-must-stay-host" } },
        { ns: "sanbao-appearance", user: { themeId: "light", extra: "user-extra-must-stay-host" } },
      ];
    },
  };
  apply({ inject: (_keys, cb) => cb({ settings }), get: () => settings, on: (event, cb) => { if (event === "webserver/index-inject") handler = cb; }, logger: { error: () => {} } });
  const rows: { kind: string; text: string }[] = []; handler(rows);
  expect(descriptions).toEqual([{ redactSecrets: true }]);
  expect(rows.map(row => row.text).join("\n")).not.toContain("must-stay-host");
  expect(runBoot(rows.find(row => row.kind === "script")!.text).body.dataset.sanbaoTheme).toBe("light");
});

it("registers a validated Host schema and reads authoritative state for every index request", () => {
  let value = { ...defaults, themeId: "warm-pink" as const, uiFont: "avenir" as const };
  let saved = true;
  let handler: (table: { kind: string; text: string }[]) => void = () => {};
  let schema: ((input: unknown) => unknown) | undefined;
  const settings = {
    register: (_ns: string, s: unknown) => { schema = s as typeof schema; },
    get: (ns: string) => ns === "ui-theme" ? { preference: "dark" } : value,
    describe: () => [{ ns: "sanbao-appearance", user: saved ? value : {} }],
  };
  apply({ inject: (_keys, cb) => cb({ settings }), get: () => settings, on: (event, cb) => { if (event === "webserver/index-inject") handler = cb; }, logger: { error: () => {} } });
  expect(schema?.({})).toEqual(defaults);
  expect(() => schema?.({ themeId: "custom" })).toThrow();
  expect(() => schema?.({ uiFontSize: 99 })).toThrow();
  let rows: { kind: string; text: string }[] = []; handler(rows);
  expect(rows.some(r => r.kind === "style" && r.text.includes('body[data-sanbao-theme="warm-pink"]'))).toBe(true);
  expect(runBoot(rows.find(r => r.kind === "script")!.text).body.dataset.sanbaoTheme).toBe("warm-pink");
  saved = false; rows = []; handler(rows);
  expect(runBoot(rows.find(r => r.kind === "script")!.text).body.dataset.sanbaoTheme).toBe("dark");
});

it("dispatches setSanbaoTheme to desktopRuntime when sanbao-appearance settings update", () => {
  const events = new Map<string, (...args: any[]) => void>();
  const calls: string[] = [];
  const desktopRuntime = {
    setSanbaoTheme: (themeId: string) => {
      calls.push(themeId);
    },
  };
  const settings = {
    register: () => {},
    get: () => defaults,
    describe: () => [],
  };
  apply({
    inject: (_keys, cb) => cb({ settings, desktopRuntime }),
    get: (key: string) => (key === "desktopRuntime" ? desktopRuntime : settings),
    on: (event, cb) => {
      events.set(event, cb);
    },
    logger: { error: () => {} },
  });

  const updateHandler = events.get("settings/updated");
  expect(updateHandler).toBeDefined();

  // Ignored namespace
  updateHandler!("unrelated", { themeId: "warm-pink" });
  expect(calls).toEqual([]);

  // Valid theme update
  updateHandler!("sanbao-appearance", { themeId: "warm-pink" });
  expect(calls).toEqual(["warm-pink"]);

  // Invalid theme rejected
  updateHandler!("sanbao-appearance", { themeId: "neon-blue" });
  expect(calls).toEqual(["warm-pink"]);

  // Another valid theme update
  updateHandler!("sanbao-appearance", { themeId: "dark" });
  expect(calls).toEqual(["warm-pink", "dark"]);
});

it("names the failure when native theme sync throws, instead of reporting a quiet success", () => {
  const events = new Map<string, (...args: any[]) => void>();
  const logged: string[] = [];
  const settings = { register: () => {}, get: () => defaults, describe: () => [] };
  const desktopRuntime = {
    setSanbaoTheme: () => {
      throw new Error("webContents gone");
    },
  };
  apply({
    inject: (_keys, cb) => cb({ settings, desktopRuntime }),
    get: (key: string) => (key === "desktopRuntime" ? desktopRuntime : settings),
    on: (event, cb) => { events.set(event, cb); },
    logger: { error: (message: string) => { logged.push(message); } },
  });
  events.get("settings/updated")!("sanbao-appearance", { themeId: "warm-pink" });
  expect(logged).toHaveLength(1);
  expect(logged[0]).toContain("webContents gone");
});
