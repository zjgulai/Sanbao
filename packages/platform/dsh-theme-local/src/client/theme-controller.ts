import {
  decodeThemeStudioSettings, hasSavedThemeIdentity, THEME_STUDIO_FIELDS, THEME_TYPOGRAPHY_FIELDS,
  type ThemeStudioField, type ThemeStudioSettings,
} from "../theme-settings.js";
import { loadThemeStudioSettings, saveThemeStudioSettings, type ThemeStudioStorage } from "./persistence.js";

export interface AppearanceSnapshot {
  status: "loading" | "ready" | "unavailable";
  value: ThemeStudioSettings | undefined;
  base: unknown;
  user: unknown;
  revision: number | undefined;
  writable: boolean;
  mode: "host" | "memory";
}
export interface AppearanceScope {
  getSnapshot(): AppearanceSnapshot;
  subscribe(listener: () => void): () => void;
  mutate(ops: readonly { op: "set"; path: string[]; value: unknown }[], expectedRevision?: number): Promise<void>;
}
export type SaveStatus = "loading" | "saving" | "saved" | "error";
export interface AppearanceState { settings: ThemeStudioSettings; saveStatus: SaveStatus }
const equal = (a: ThemeStudioSettings | undefined, b: ThemeStudioSettings) =>
  a !== undefined && THEME_STUDIO_FIELDS.every(field => a[field] === b[field]);
const writable = (s: AppearanceSnapshot) => s.status === "ready" && s.mode === "host" && s.writable;

/** Owns migration and latest-intent confirmation, not the SDK's wire queue. */
export function createThemeController(options: {
  scope: AppearanceScope;
  initialScheme: "light" | "dark";
  storage: ThemeStudioStorage | undefined;
  render(settings: ThemeStudioSettings): void;
}) {
  const { scope, storage, render } = options;
  let state: AppearanceState = { settings: loadThemeStudioSettings(storage, options.initialScheme), saveStatus: "loading" };
  let disposed = false;
  let initialized = false;
  let pending = false;
  const initialEdits = new Set<ThemeStudioField>();
  const unconfirmedFields = new Set<ThemeStudioField>();
  let generation = 0;
  let revision = -1;
  const listeners = new Set<() => void>();
  const publish = (settings: ThemeStudioSettings, saveStatus: SaveStatus) => {
    if (disposed) return;
    const changed = !equal(state.settings, settings);
    state = { settings, saveStatus };
    if (changed) render(settings);
    listeners.forEach(listener => listener());
  };
  const write = (fields: readonly ThemeStudioField[], expectedRevision?: number) => {
    const ownGeneration = ++generation;
    const snapshot = scope.getSnapshot();
    if (!writable(snapshot)) {
      pending = false;
      publish(state.settings, snapshot.status === "loading" ? "loading" : "error");
      return;
    }
    pending = true;
    const requested = state.settings;
    publish(requested, "saving");
    const settle = (failed: boolean) => {
      if (disposed || ownGeneration !== generation) return;
      pending = false;
      const accepted = scope.getSnapshot();
      revision = Math.max(revision, accepted.revision ?? -1);
      const value = decodeThemeStudioSettings(accepted.value);
      const user = accepted.user !== null && typeof accepted.user === "object" && !Array.isArray(accepted.user)
        ? accepted.user as Record<string, unknown> : {};
      const saved = !failed && writable(accepted) && hasSavedThemeIdentity(user) && value !== undefined &&
        fields.every(field => Object.hasOwn(user, field) && user[field] === requested[field] && value[field] === requested[field]);
      if (saved) {
        fields.forEach(field => unconfirmedFields.delete(field));
        saveThemeStudioSettings(storage, value);
      }
      publish(saved ? value : requested, saved ? "saved" : "error");
    };
    // The official scope can resolve after recovering a rejected write. Read back, never infer acceptance.
    void scope.mutate(fields.map(field => ({ op: "set" as const, path: [field], value: requested[field] })), expectedRevision)
      .then(() => settle(false), () => settle(true));
  };
  const sync = () => {
    if (disposed) return;
    const s = scope.getSnapshot();
    if (s.status !== "ready" || s.mode !== "host") {
      publish(state.settings, s.status === "loading" ? "loading" : "error");
      return;
    }
    if ((s.revision ?? -1) < revision) return;
    if (pending) return;
    const fresh = (s.revision ?? -1) > revision;
    revision = Math.max(revision, s.revision ?? -1);
    if (!initialized) {
      initialized = true;
      const fields = [...initialEdits];
      const edits = Object.fromEntries(fields.map(field => [field, state.settings[field]]));
      initialEdits.clear();
      if (!hasSavedThemeIdentity(s.user)) {
        // Preserve each valid Host typography override without losing cached siblings.
        const user = s.user !== null && typeof s.user === "object" && !Array.isArray(s.user)
          ? s.user as Record<string, unknown> : {};
        let merged = state.settings;
        for (const field of THEME_TYPOGRAPHY_FIELDS) {
          if (Object.hasOwn(user, field)) merged = decodeThemeStudioSettings({ ...merged, [field]: user[field] }) ?? merged;
        }
        publish(decodeThemeStudioSettings({ ...merged, ...edits }) ?? merged, "loading");
        write(THEME_STUDIO_FIELDS, s.revision); return;
      }
      if (fields.length) {
        const merged = decodeThemeStudioSettings({ ...s.value, ...edits });
        if (merged) publish(merged, "loading");
        write(fields); return;
      }
    }
    if (!fresh && state.saveStatus === "error") return;
    const accepted = decodeThemeStudioSettings(s.value);
    if (accepted && hasSavedThemeIdentity(s.user)) {
      if (s.writable) saveThemeStudioSettings(storage, accepted);
      publish(accepted, s.writable ? "saved" : "error");
    } else publish(state.settings, "error");
  };
  render(state.settings);
  const unsubscribe = scope.subscribe(sync);
  sync();
  const set = <Field extends ThemeStudioField>(field: Field, value: ThemeStudioSettings[Field]) => {
    if (disposed) return;
    const next = decodeThemeStudioSettings({ ...state.settings, [field]: value });
    if (!next) return;
    if (!initialized) initialEdits.add(field);
    unconfirmedFields.add(field);
    publish(next, "saving");
    write([...unconfirmedFields]);
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set,
    resetColors: () => set("themeId", "light"),
    dispose: () => { disposed = true; generation++; unsubscribe(); listeners.clear(); },
  };
}
