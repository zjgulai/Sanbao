import { describe, expect, it } from "vitest";
import { createThemeController, type AppearanceScope, type AppearanceSnapshot } from "./theme-controller.js";
import { DEFAULT_THEME_STUDIO_SETTINGS as defaults, type ThemeStudioSettings } from "../theme-settings.js";

const fonts = { uiFont: "avenir", codeFont: "menlo", uiFontSize: 15, codeFontSize: 13 } as const;
class Scope implements AppearanceScope {
  snapshot: AppearanceSnapshot = { status: "loading", value: undefined, base: undefined, user: undefined, revision: undefined, writable: false, mode: "host" };
  listeners = new Set<() => void>();
  requests: { ops: Parameters<AppearanceScope["mutate"]>[0]; expectedRevision: number | undefined; resolve: () => void; reject: () => void }[] = [];
  getSnapshot = () => this.snapshot;
  subscribe = (cb: () => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; };
  mutate: AppearanceScope["mutate"] = (ops, expectedRevision) => new Promise<void>((resolve, reject) => { this.requests.push({ ops, expectedRevision, resolve, reject: () => reject(Error("denied")) }); });
  publish(value: ThemeStudioSettings, user: unknown = value, revision = 1) {
    this.snapshot = { status: "ready", value, base: defaults, user, revision, writable: true, mode: "host" };
    this.listeners.forEach(cb => cb());
  }
  accept(index: number) {
    const r = this.requests[index]!;
    // A refused official mutation recovers the Host snapshot and can still resolve.
    if (r.expectedRevision !== undefined && r.expectedRevision !== this.snapshot.revision) { r.resolve(); return; }
    const value = { ...(this.snapshot.value ?? defaults) };
    const user = { ...(this.snapshot.user as Record<string, unknown> ?? {}) };
    for (const op of r.ops) {
      Object.assign(value, { [op.path[0]!]: op.value });
      Object.assign(user, { [op.path[0]!]: op.value });
    }
    this.publish(value, user, (this.snapshot.revision ?? 0) + 1);
    r.resolve();
  }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup(scope = new Scope()) {
  const values = new Map([["dsh-theme/settings/v1", JSON.stringify({ ...fonts, lightAccent: "bad" })]]);
  const rendered: ThemeStudioSettings[] = [];
  const controller = createThemeController({ scope, initialScheme: "dark", storage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); } }, render: s => { rendered.push(s); } });
  return { scope, controller, rendered, values };
}

describe("theme Host synchronization", () => {
  it("previews legacy typography while loading; migrates once only after Host readiness", async () => {
    const { controller: c, scope } = setup();
    expect(c.getSnapshot()).toMatchObject({ settings: { themeId: "dark", ...fonts }, saveStatus: "loading" });
    expect(scope.requests).toHaveLength(0);
    scope.publish(defaults, {});
    expect(scope.requests).toHaveLength(1);
    expect(c.getSnapshot().saveStatus).toBe("saving");
    scope.accept(0); await flush();
    expect(c.getSnapshot()).toMatchObject({ settings: { themeId: "dark", ...fonts }, saveStatus: "saved" });
    expect(scope.requests).toHaveLength(1);
  });
  it("migrates valid partial Host typography without invalid sibling fields discarding it", async () => {
    const { controller: c, scope } = setup();
    scope.publish(defaults, { uiFont: "inter", uiFontSize: 16, codeFont: "invalid", codeFontSize: "15" });
    scope.accept(0); await flush();
    expect(c.getSnapshot()).toEqual({
      settings: { ...defaults, ...fonts, themeId: "dark", uiFont: "inter", uiFontSize: 16 },
      saveStatus: "saved",
    });
  });
  it("fences first migration at the observed revision instead of overwriting a later Host edit", async () => {
    const { controller: c, scope, values } = setup();
    scope.publish(defaults, {}, 7);
    const newer = { ...defaults, themeId: "warm-pink" as const, uiFont: "inter" as const };
    scope.publish(newer, newer, 8);
    scope.accept(0); await flush();
    expect(scope.getSnapshot().value).toEqual(newer);
    expect(scope.requests[0]!.expectedRevision).toBe(7);
    expect(scope.requests[0]!.ops).toEqual([
      { op: "set", path: ["themeId"], value: "dark" },
      { op: "set", path: ["uiFont"], value: "avenir" },
      { op: "set", path: ["codeFont"], value: "menlo" },
      { op: "set", path: ["uiFontSize"], value: 15 },
      { op: "set", path: ["codeFontSize"], value: 13 },
    ]);
    expect(c.getSnapshot().saveStatus).toBe("error");
    expect(values.has("dsh-theme/settings/v2")).toBe(false);
    expect(scope.requests).toHaveLength(1);
  });
  it("saved Host light identity beats dark cache even when equal to schema defaults", () => {
    const { controller: c, scope } = setup();
    scope.publish(defaults);
    expect(c.getSnapshot().settings).toEqual(defaults);
    expect(scope.requests).toHaveLength(0);
  });
  it.each([false, true])("keeps loading-time intent without overwriting Host typography (saved identity: %s)", async (saved: boolean) => {
    const { controller: c, scope } = setup();
    c.set("themeId", "warm-pink"); c.set("uiFontSize", 16);
    const partial = { uiFont: "inter" as const };
    scope.publish({ ...defaults, ...partial }, saved ? { themeId: "light", ...partial } : partial, 4);
    scope.accept(0); await flush();
    const expected = saved
      ? { ...defaults, ...partial, themeId: "warm-pink", uiFontSize: 16 }
      : { ...defaults, ...fonts, ...partial, themeId: "warm-pink", uiFontSize: 16 };
    expect(scope.getSnapshot().value).toEqual(expected);
    expect(c.getSnapshot()).toEqual({ settings: expected, saveStatus: "saved" });
    expect(scope.requests[0]!.expectedRevision).toBe(saved ? undefined : 4);
    expect(scope.requests[0]!.ops.map(op => op.path[0])).toEqual(saved
      ? ["themeId", "uiFontSize"]
      : ["themeId", "uiFont", "codeFont", "uiFontSize", "codeFontSize"]);
  });
  it("does not call a resolved-but-rejected write saved or drop migrated fonts", async () => {
    const { controller: c, scope } = setup();
    scope.publish(defaults, {});
    scope.requests[0]!.resolve(); await flush();
    expect(c.getSnapshot()).toMatchObject({ settings: { themeId: "dark", ...fonts }, saveStatus: "error" });
  });
  it.each([
    { themeId: "light" },
    { themeId: "light", uiFontSize: 15 },
  ])("requires the requested raw user field, not just a matching resolved default: %j", async (user: Record<string, unknown>) => {
    const { controller: c, scope, values } = setup();
    scope.publish({ ...defaults, uiFontSize: 15 });
    const cache = values.get("dsh-theme/settings/v2");
    c.set("uiFontSize", 14);
    scope.publish(defaults, user, 2);
    scope.requests[0]!.resolve(); await flush();
    expect(c.getSnapshot().saveStatus).toBe("error");
    expect(values.get("dsh-theme/settings/v2")).toBe(cache);
  });
  it("ignores late earlier packets during rapid switches and confirms only the last request", async () => {
    const { controller: c, scope } = setup();
    scope.publish({ ...defaults, ...fonts });
    c.set("themeId", "dark"); c.set("themeId", "warm-pink");
    scope.accept(0); await flush();
    expect(c.getSnapshot()).toMatchObject({ settings: { themeId: "warm-pink", ...fonts }, saveStatus: "saving" });
    scope.accept(1); await flush();
    expect(c.getSnapshot()).toMatchObject({ settings: { themeId: "warm-pink", ...fonts }, saveStatus: "saved" });
    scope.publish(defaults, defaults, 1);
    expect(c.getSnapshot().settings.themeId).toBe("warm-pink");
  });
  it("handles thrown refusal and unavailable Host without pretending persistence", async () => {
    const { controller: c, scope } = setup();
    scope.publish({ ...defaults, ...fonts });
    c.set("themeId", "warm-pink"); scope.requests[0]!.reject(); await flush();
    expect(c.getSnapshot().saveStatus).toBe("error");
    scope.snapshot = { ...scope.snapshot, mode: "memory", writable: false, status: "unavailable" };
    scope.listeners.forEach(cb => cb()); c.set("themeId", "dark");
    expect(c.getSnapshot().saveStatus).toBe("error");
    expect(scope.requests).toHaveLength(1);
  });
  it("does not let an earlier reply replace a newer edit made while Host is unavailable", async () => {
    const { controller: c, scope, values } = setup();
    scope.publish(defaults);
    const cache = values.get("dsh-theme/settings/v2");
    c.set("themeId", "dark");
    scope.snapshot = { ...scope.snapshot, status: "unavailable", writable: false };
    scope.listeners.forEach(cb => cb());
    c.set("themeId", "warm-pink");
    scope.requests[0]!.resolve(); await flush();
    expect(c.getSnapshot()).toEqual({ settings: { ...defaults, themeId: "warm-pink" }, saveStatus: "error" });
    expect(values.get("dsh-theme/settings/v2")).toBe(cache);
    expect(scope.requests).toHaveLength(1);
  });
  it("shares Host updates across clients and preserves typography on color reset", async () => {
    const scope = new Scope(); const a = setup(scope); const b = setup(scope);
    scope.publish({ ...defaults, ...fonts });
    a.controller.set("themeId", "warm-pink"); scope.accept(0); await flush();
    expect(b.controller.getSnapshot().settings).toEqual({ ...defaults, ...fonts, themeId: "warm-pink" });
    b.controller.resetColors(); scope.accept(1); await flush();
    expect(a.controller.getSnapshot().settings).toEqual({ ...defaults, ...fonts });
  });
  it.each([[0, 1], [1, 0]])("preserves concurrent theme and font edits across two controllers (accept %i then %i)", async (first: number, second: number) => {
    const scope = new Scope(); const a = setup(scope); const b = setup(scope);
    scope.publish(defaults);
    a.controller.set("themeId", "warm-pink");
    b.controller.set("uiFont", "avenir");
    scope.accept(first); scope.accept(second); await flush();
    const expected = { ...defaults, themeId: "warm-pink", uiFont: "avenir" };
    expect(scope.getSnapshot().value).toEqual(expected);
    expect(scope.getSnapshot().user).toEqual(expected);
    for (const client of [a, b]) {
      expect(client.controller.getSnapshot()).toEqual({ settings: expected, saveStatus: "saved" });
      expect(JSON.parse(client.values.get("dsh-theme/settings/v2")!)).toEqual(expected);
    }
    expect(scope.requests.map(r => r.ops)).toEqual([
      [{ op: "set", path: ["themeId"], value: "warm-pink" }],
      [{ op: "set", path: ["uiFont"], value: "avenir" }],
    ]);
  });
  it("retains an unconfirmed theme when a later font edit succeeds after an earlier refusal", async () => {
    const { controller: c, scope } = setup();
    scope.publish(defaults);
    c.set("themeId", "warm-pink");
    c.set("uiFont", "avenir");
    scope.requests[0]!.reject();
    await flush();
    scope.accept(1);
    await flush();
    expect(c.getSnapshot()).toEqual({ settings: { ...defaults, themeId: "warm-pink", uiFont: "avenir" }, saveStatus: "saved" });
    expect(scope.getSnapshot().value).toEqual(c.getSnapshot().settings);
  });

  it("does not render or write after disposal, including late request settlement", async () => {
    const { controller: c, scope, rendered } = setup();
    scope.publish(defaults); c.set("themeId", "warm-pink"); c.dispose();
    const count = rendered.length;
    scope.accept(0); await flush(); c.set("themeId", "dark");
    expect(rendered).toHaveLength(count);
    expect(scope.requests).toHaveLength(1);
    expect(scope.listeners.size).toBe(0);
  });
});
