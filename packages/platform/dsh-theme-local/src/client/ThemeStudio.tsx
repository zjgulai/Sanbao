import type {
  PropsLocale,
  PropsRuntime,
  PropsStore,
} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import * as React from "react";

import {
  CODE_FONT_IDS,
  CODE_FONT_SIZES,
  UI_FONT_IDS,
  UI_FONT_SIZES,
  type CodeFontId,
  type CodeFontSize,
  THEME_IDS,
  type ThemeId,
  type ThemeStudioSettings,
  type ThemeTypographyField,
  type UiFontId,
  type UiFontSize,
} from "../theme-settings.js";
import { SizeStepper } from "./SizeStepper.js";
import { buildSanbaoVariables, type ThemeId as PaletteThemeId } from "./sanbao-tokens.js";
import type { ThemeStudioPrefs } from "./persistence.js";
import type { createThemeStudioStore } from "./store.js";
import { CODE_FONT_STACKS, UI_FONT_STACKS } from "./theme-typography.js";

export interface ThemeStudioInjected {
  resetTheme: () => void;
  setPrefs: (patch: Partial<ThemeStudioPrefs>) => void;
  setTheme: (themeId: ThemeId) => void;
  setTypography: <Field extends ThemeTypographyField>(
    field: Field,
    value: ThemeStudioSettings[Field],
  ) => void;
}

type ThemeStudioProps = PropsRuntime<"settings.section"> &
  PropsStore<ReturnType<typeof createThemeStudioStore>> &
  PropsLocale<"dsh.theme"> &
  ThemeStudioInjected;

interface SettingSelectProps {
  label: string;
  onChange: (value: string) => void;
  options: readonly { fontFamily?: string; label: string; value: string }[];
  value: string;
}

const REDUCE_MOTION_OPTIONS = ["system", "on", "off"] as const;

function SettingSelect({ label, onChange, options, value }: SettingSelectProps) {
  return (
    <label data-appearance-setting-row>
      <span>{label}</span>
      <select
        data-appearance-select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option
            key={option.value}
            style={
              option.fontFamily === undefined
                ? undefined
                : { fontFamily: option.fontFamily }
            }
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ModePreview({ mode }: { mode: PaletteThemeId }) {
  return (
    <span aria-hidden="true" data-appearance-preview data-mode={mode}
      style={buildSanbaoVariables(mode) as React.CSSProperties}>
      <span data-appearance-preview-sidebar />
      <span data-appearance-preview-surface><i /><i /><i /></span>
    </span>
  );
}

export function ThemeStudio({
  resetTheme,
  setPrefs,
  setTheme,
  setTypography,
  t,
  useStore,
}: ThemeStudioProps) {
  const prefs = useStore((state) => state.prefs);
  const saveStatus = useStore((state) => state.saveStatus);
  const settings = useStore((state) => state.settings);

  const uiFontOptions = UI_FONT_IDS.map((value) => ({
    value,
    label: t(`font.${value}`),
    fontFamily: UI_FONT_STACKS[value],
  }));
  const codeFontOptions = CODE_FONT_IDS.map((value) => ({
    value,
    label: t(`font.${value}`),
    fontFamily: CODE_FONT_STACKS[value],
  }));

  const statusText = t(`status.${saveStatus}`);

  return (
    <div data-appearance-studio>
      <header data-appearance-header>
        <div>
          <h2>{t("title")}</h2>
          <p>{t("description")}</p>
        </div>
        <button
          data-appearance-button
          data-variant="secondary"
          type="button"
          onClick={resetTheme}
        >
          {t("action.reset")}
        </button>
      </header>

      <div data-appearance-content>
        <section data-appearance-card data-card="theme">
          <div data-appearance-card-header>
            <h3>{t("preset.title")}</h3>
            <p>{t("preset.description")}</p>
          </div>

          <div
            aria-label={t("mode.title")}
            data-appearance-mode-grid
            role="radiogroup"
          >
            {THEME_IDS.map((mode) => (
              <label
                key={mode}
                data-appearance-mode
                data-selected={settings.themeId === mode ? "true" : "false"}
              >
                <input
                  checked={settings.themeId === mode}
                  data-appearance-sr
                  name="appearance-mode"
                  type="radio"
                  value={mode}
                  onChange={() => setTheme(mode)}
                />
                <ModePreview mode={mode} />
                <span>{t(`mode.${mode}`)}</span>
              </label>
            ))}
          </div>

        </section>

        <section data-appearance-card data-card="prefs">
          <div data-appearance-card-header>
            <h3>{t("prefs.title")}</h3>
          </div>
          <div data-appearance-subheading>
            <h4>{t("typography.title")}</h4>
            <p>{t("typography.description")}</p>
          </div>
          <div data-appearance-setting-list>
            <SettingSelect
              label={t("typography.uiFont")}
              options={uiFontOptions}
              value={settings.uiFont}
              onChange={(value) => setTypography("uiFont", value as UiFontId)}
            />
            <SettingSelect
              label={t("typography.codeFont")}
              options={codeFontOptions}
              value={settings.codeFont}
              onChange={(value) =>
                setTypography("codeFont", value as CodeFontId)
              }
            />
            <SizeStepper
              decreaseLabel={t("size.decrease")}
              increaseLabel={t("size.increase")}
              label={t("typography.uiFontSize")}
              value={settings.uiFontSize}
              values={UI_FONT_SIZES}
              onChange={(value) =>
                setTypography("uiFontSize", value as UiFontSize)
              }
            />
            <SizeStepper
              decreaseLabel={t("size.decrease")}
              increaseLabel={t("size.increase")}
              label={t("typography.codeFontSize")}
              value={settings.codeFontSize}
              values={CODE_FONT_SIZES}
              onChange={(value) =>
                setTypography("codeFontSize", value as CodeFontSize)
              }
            />
          </div>

          <div data-appearance-subheading>
            <h4>{t("prefs.render.title")}</h4>
          </div>
          <div data-appearance-setting-list>
            <div data-appearance-setting-row>
              <div data-appearance-setting-copy>
                <span>{t("prefs.reduceMotion")}</span>
                <p>{t("prefs.reduceMotion.description")}</p>
              </div>
              <div
                aria-label={t("prefs.reduceMotion")}
                data-appearance-segment
                role="radiogroup"
              >
                {REDUCE_MOTION_OPTIONS.map((option) => (
                  <label
                    key={option}
                    data-selected={prefs.reduceMotion === option ? "true" : "false"}
                  >
                    <input
                      checked={prefs.reduceMotion === option}
                      data-appearance-sr
                      name="appearance-reduce-motion"
                      type="radio"
                      value={option}
                      onChange={() => setPrefs({ reduceMotion: option })}
                    />
                    <span>{t(`segment.${option}`)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div data-appearance-setting-row>
              <div data-appearance-setting-copy>
                <span>{t("prefs.fontSmoothing")}</span>
                <p>{t("prefs.fontSmoothing.description")}</p>
              </div>
              <button
                aria-checked={prefs.fontSmoothing}
                aria-label={t("prefs.fontSmoothing")}
                data-appearance-switch
                role="switch"
                type="button"
                onClick={() => setPrefs({ fontSmoothing: !prefs.fontSmoothing })}
              >
                <span aria-hidden="true" data-appearance-switch-thumb />
              </button>
            </div>
          </div>
        </section>

        <p aria-live="polite" data-appearance-status data-status={saveStatus}>
          {statusText}
        </p>
      </div>
    </div>
  );
}
