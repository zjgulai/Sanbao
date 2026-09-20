import type {} from "@deepseek-ai/dsh-client-locale/client";
import type { SettingsScope, SettingsScopeSpec } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { BoundActions } from "@deepseek-ai/dsh-client-ui-slots";
import type {
  ThemePreference,
  ThemeSnapshot,
  ThemeTokenOverrides,
} from "@deepseek-ai/dsh-client-ui-theme/client";

/** The service methods consumed by this client, without a runtime plugin import. */
interface ClientContext {
  settingsScope: {
    bind<T>(spec: SettingsScopeSpec<T>): Pick<SettingsScope<T>, "getSnapshot" | "subscribe" | "mutate">;
  };
  theme: {
    overrideTokens(source: string, tokens: ThemeTokenOverrides): () => void;
    getTheme(): ThemeSnapshot;
    setTheme(preference: ThemePreference): void;
  };
  slots: {
    inject(key: string, callback: () => unknown): void;
    register(options: Record<string, unknown>, component: unknown): unknown;
  };
  locale: {
    register(ns: string, dicts: unknown): () => void;
    bind(ns: string): (key: string) => string;
  };
  on(
    event: string,
    listener: (snapshot: ThemeSnapshot) => void,
  ): () => void;
  effect(
    callback: () => (() => void) | void,
    label?: string,
  ): void;
}

import "./studio.css";
import {
  decodeThemeStudioSettings,
  THEME_SETTINGS_NAMESPACE,
  themeColorScheme,
  type ThemeStudioSettings,
} from "../theme-settings.js";
import { en, NS, type ThemeStudioKey, zh } from "./locales.js";
import {
  browserThemeStudioStorage,
  loadThemeStudioPrefs,
  saveThemeStudioPrefs,
  type ThemeStudioPrefs,
} from "./persistence.js";
import { PREFS_CSS, REDUCE_MOTION_QUERY, prefsAttributes } from "./prefs-css.js";
import { ensureSanbaoTokens } from "./sanbao-tokens.js";
import { createThemeStudioStore } from "./store.js";
import { ThemeStudio, type ThemeStudioInjected } from "./ThemeStudio.js";
import { createThemeController } from "./theme-controller.js";
import { buildThemeTokenOverrides } from "./theme-tokens.js";
import { bindAppearanceEvents } from "./appearance-events.js";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "dsh.theme": ThemeStudioKey;
  }
}

const THEME_SOURCE = "dsh-theme";

/** Only these tokens belong to the official override contract. */
const CONTRACT_TOKEN_NAMES = new Set([
  "--dsw-alias-bg-base",
  "--dsw-alias-bg-layer-1",
  "--dsw-alias-bg-layer-2",
  "--dsw-alias-bg-overlay",
  "--dsw-alias-border-l1",
  "--dsw-alias-border-l2",
  "--dsw-alias-brand-primary",
  "--dsw-alias-label-primary",
  "--dsw-alias-label-secondary",
  "--dsw-alias-state-error-primary",
  "--dsw-alias-state-success-primary",
  "--dsw-alias-state-warn-primary",
  "--dsw-specific-sidebar-fill",
]);

type ThemeStudioActions = BoundActions<ReturnType<typeof createThemeStudioStore>>;

/** Remove only boot-owned properties still carrying the value and priority boot wrote. */
function takeOverBootTokens(body: HTMLElement, tokens: ThemeTokenOverrides): void {
  const marker = body.dataset.sanbaoBootTokens;
  if (marker === undefined) return;
  let owned: unknown;
  try {
    owned = JSON.parse(marker);
  } catch {
    // A malformed ownership marker cannot authorize removal of inline styles.
    return;
  }
  if (owned === null || typeof owned !== "object" || Array.isArray(owned)) return;
  for (const [key, value] of Object.entries(owned)) {
    if (key !== "color-scheme" && !Object.hasOwn(tokens, key)) continue;
    const priority = key === "color-scheme" ? "" : "important";
    if (typeof value === "string" && body.style.getPropertyValue(key) === value && body.style.getPropertyPriority(key) === priority) {
      body.style.removeProperty(key);
    }
  }
  delete body.dataset.sanbaoBootTokens;
}

export const inject = ["slots", "locale", "theme", "settingsScope"];

export function apply(ctx: ClientContext): void {
  const storage = browserThemeStudioStorage();
  const body = document.body;
  const bootScheme = body.dataset.sanbaoInitialScheme;
  const initialScheme = bootScheme === "light" || bootScheme === "dark"
    ? bootScheme
    : ctx.theme.getTheme().active.colorScheme;
  const scope = ctx.settingsScope.bind<ThemeStudioSettings>({
    namespace: THEME_SETTINGS_NAMESPACE,
    decode: decodeThemeStudioSettings,
  });
  let currentPrefs = loadThemeStudioPrefs(storage);
  let actions: ThemeStudioActions | undefined;
  let controller: ReturnType<typeof createThemeController>;
  let disposed = false;
  let motionQuery: MediaQueryList | undefined;

  const syncStore = () => {
    const state = controller.getSnapshot();
    actions?.syncSettings(state.settings);
    actions?.setSaveStatus(state.saveStatus);
    actions?.syncPrefs(currentPrefs);
  };
  const applyPrefs = () => {
    const attributes = prefsAttributes(currentPrefs, motionQuery?.matches ?? false);
    if (attributes.reduceMotion) body.dataset.luteReduceMotion = "reduce";
    else delete body.dataset.luteReduceMotion;
    if (attributes.fontSmoothing) body.dataset.luteFontSmoothing = "on";
    else delete body.dataset.luteFontSmoothing;
  };
  const setPrefs = (patch: Partial<ThemeStudioPrefs>) => {
    if (disposed) return;
    currentPrefs = { ...currentPrefs, ...patch };
    syncStore();
    applyPrefs();
    saveThemeStudioPrefs(storage, currentPrefs);
  };

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-theme: dictionaries");
  ctx.effect(() => ensureSanbaoTokens(document), "dsh-theme: semantic tokens");
  ctx.effect(() => {
    const cssTag = document.createElement("style");
    cssTag.dataset.plugin = THEME_SOURCE;
    cssTag.dataset.pluginCss = `${THEME_SOURCE}/token-vars`;
    document.head.appendChild(cssTag);
    let currentScheme = initialScheme;
    let renderedTheme: ThemeStudioSettings["themeId"] | undefined;
    let contractKey: string | undefined;
    let releaseOverride: (() => void) | undefined;
    let firstRender = true;

    // Official echoes adapt the presenter only; they never select a product identity.
    const syncScheme = () => {
      if (!disposed && ctx.theme.getTheme().preference !== currentScheme) {
        ctx.theme.setTheme(currentScheme);
      }
    };
    const releaseThemeChange = ctx.on("theme/change", syncScheme);
    controller = createThemeController({
      scope, storage, initialScheme,
      render(settings) {
        const tokens = buildThemeTokenOverrides(settings);
        if (firstRender) {
          takeOverBootTokens(body, tokens);
          firstRender = false;
        }
        renderedTheme = settings.themeId;
        currentScheme = themeColorScheme(settings.themeId);
        if (body.dataset.sanbaoTheme !== settings.themeId) body.dataset.sanbaoTheme = settings.themeId;
        const contract: ThemeTokenOverrides = {};
        const declarations = [`color-scheme: ${currentScheme} !important;`];
        for (const [key, pair] of Object.entries(tokens)) {
          if (CONTRACT_TOKEN_NAMES.has(key)) contract[key] = pair;
          else declarations.push(`${key}: ${pair[currentScheme]} !important;`);
        }
        // Body specificity beats defaults; important beats normal presenter inline values.
        const css = `body[data-sanbao-theme] { ${declarations.join(" ")} }`;
        if (cssTag.textContent !== css) cssTag.textContent = css;
        syncScheme();
        const nextKey = JSON.stringify(contract);
        if (nextKey !== contractKey) {
          contractKey = nextKey;
          const nextRelease = ctx.theme.overrideTokens(THEME_SOURCE, contract);
          releaseOverride?.();
          releaseOverride = nextRelease;
        }
      },
    });
    const unsubscribe = controller.subscribe(syncStore);
    return () => {
      disposed = true;
      releaseThemeChange();
      unsubscribe();
      controller.dispose();
      actions = undefined;
      releaseOverride?.();
      cssTag.remove();
      if (body.dataset.sanbaoTheme === renderedTheme) delete body.dataset.sanbaoTheme;
    };
  }, "dsh-theme: Host settings and live override");

  ctx.effect(() => bindAppearanceEvents(document, controller), "dsh-theme: document appearance entrypoints");

  ctx.effect(() => {
    const prefsTag = document.createElement("style");
    prefsTag.dataset.plugin = THEME_SOURCE;
    prefsTag.dataset.pluginCss = `${THEME_SOURCE}/prefs`;
    prefsTag.textContent = PREFS_CSS;
    document.head.appendChild(prefsTag);
    motionQuery = typeof window.matchMedia === "function" ? window.matchMedia(REDUCE_MOTION_QUERY) : undefined;
    const onMotionChange = () => applyPrefs();
    motionQuery?.addEventListener("change", onMotionChange);
    applyPrefs();
    return () => {
      motionQuery?.removeEventListener("change", onMotionChange);
      delete body.dataset.luteReduceMotion;
      delete body.dataset.luteFontSmoothing;
      prefsTag.remove();
      motionQuery = undefined;
    };
  }, "dsh-theme: presentation prefs");

  const store = createThemeStudioStore(controller!.getSnapshot().settings, currentPrefs);
  const injectProps = (bound: ThemeStudioActions): ThemeStudioInjected => {
    actions = bound;
    syncStore();
    return {
      resetTheme: () => controller.resetColors(),
      setPrefs,
      setTheme: themeId => controller.set("themeId", themeId),
      setTypography: (field, value) => controller.set(field, value),
    };
  };
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "dsh-theme",
    order: 5,
    label: () => ctx.locale.bind(NS)("nav"),
    store,
    locale: NS,
    inject: injectProps,
  }, ThemeStudio));
}
