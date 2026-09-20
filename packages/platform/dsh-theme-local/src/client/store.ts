import { defineStore, type EngineStoreHandle } from "@deepseek-ai/dsh-client-store";
import type { SaveStatus } from "./theme-controller.js";

import {
  DEFAULT_THEME_STUDIO_SETTINGS,
  type ThemeStudioSettings,
} from "../theme-settings.js";
import {
  DEFAULT_THEME_STUDIO_PREFS,
  type ThemeStudioPrefs,
} from "./persistence.js";

export interface ThemeStudioState {
  prefs: ThemeStudioPrefs;
  saveStatus: SaveStatus;
  settings: ThemeStudioSettings;
}

/** 声明动作面，使工厂的返回类型稳定（PropsStore 的约束依赖它，见上游 ui-theme 同型写法）。 */
type ThemeStudioActions = {
  syncSettings: (draft: ThemeStudioState, settings: ThemeStudioSettings) => void;
  syncPrefs: (draft: ThemeStudioState, prefs: ThemeStudioPrefs) => void;
  setSaveStatus: (draft: ThemeStudioState, status: SaveStatus) => void;
};

export function createThemeStudioStore(
  initialSettings = DEFAULT_THEME_STUDIO_SETTINGS,
  initialPrefs = DEFAULT_THEME_STUDIO_PREFS,
): EngineStoreHandle<ThemeStudioState, ThemeStudioActions> {
  return defineStore({
    init: (): ThemeStudioState => ({
      prefs: { ...initialPrefs },
      saveStatus: "loading",
      settings: { ...initialSettings },
    }),
    actions: {
      syncSettings: (
        draft,
        settings: ThemeStudioSettings,
      ) => {
        draft.settings = { ...settings };
      },
      syncPrefs: (draft, prefs: ThemeStudioPrefs) => {
        draft.prefs = { ...prefs };
      },
      setSaveStatus: (draft, status: SaveStatus) => {
        draft.saveStatus = status;
      },
    },
  });
}
