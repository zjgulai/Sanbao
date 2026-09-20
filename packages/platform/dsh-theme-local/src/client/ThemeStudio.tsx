import type {
  PropsLocale,
  PropsRuntime,
  PropsStore,
} from "@deepseek-ai/dsh-client-ui-slots";
import * as React from "react";

import {
  APPEARANCE_MODES,
  SEASONAL_THEMES,
  SANBAO_PALETTES,
  type AppearanceMode,
  type SeasonalTheme,
} from "./sanbao-tokens.js";
import {
  AppearanceController,
  type AppearanceState,
} from "./theme-controller.js";

export interface ThemeStudioProps {
  controller?: AppearanceController;
  t?: (key: string) => string;
}

export const THEME_METADATA: Record<
  SeasonalTheme,
  { title: string; season: string; description: string }
> = {
  parchment: {
    title: "羊皮纸",
    season: "秋 · 羊皮纸",
    description: "经典沉浸暖纸风，复古温暖",
  },
  "warm-pink": {
    title: "暖白粉",
    season: "春 · 暖白粉",
    description: "三宝品牌原生活力风，温柔晨曦",
  },
  "forest-green": {
    title: "森林绿",
    season: "夏 · 森林绿",
    description: "Qoder CN 极客灰绿风，清凉自然",
  },
};

export const MODE_LABELS: Record<AppearanceMode, string> = {
  light: "浅色",
  dark: "深色",
  system: "跟随系统",
};

export const FONT_SCALE_STEPS = [0.9, 1.0, 1.1, 1.2, 1.3] as const;

export function ThemeStudio({
  controller: customController,
  t = (k: string) => k,
}: ThemeStudioProps) {
  const [controller] = React.useState(
    () => customController ?? new AppearanceController()
  );
  const [state, setState] = React.useState<AppearanceState>(() =>
    controller.getState()
  );

  React.useEffect(() => {
    return controller.subscribe((next) => {
      setState(next);
    });
  }, [controller]);

  const effectiveMode = state.effectiveMode;

  const currentScalePercent = Math.round(state.fontScale * 100);
  const scaleIndex = FONT_SCALE_STEPS.findIndex(
    (s) => Math.abs(Math.round(s * 100) - currentScalePercent) < 2
  );

  const canDecrease = scaleIndex > 0;
  const canIncrease =
    scaleIndex >= 0 && scaleIndex < FONT_SCALE_STEPS.length - 1;

  const handleDecreaseScale = () => {
    if (scaleIndex > 0) {
      const nextScale = FONT_SCALE_STEPS[scaleIndex - 1];
      if (nextScale !== undefined) {
        controller.setFontScale(nextScale);
      }
    }
  };

  const handleIncreaseScale = () => {
    if (scaleIndex >= 0 && scaleIndex < FONT_SCALE_STEPS.length - 1) {
      const nextScale = FONT_SCALE_STEPS[scaleIndex + 1];
      if (nextScale !== undefined) {
        controller.setFontScale(nextScale);
      }
    }
  };

  return (
    <div data-appearance-studio>
      <header data-appearance-header>
        <div>
          <h2>外观</h2>
          <p>自定义界面配色模式、季节主题与阅读排版</p>
        </div>
      </header>

      <div data-appearance-content>
        {/* 1. Mode Segmented Control */}
        <section data-appearance-card data-card="mode">
          <div data-appearance-card-header>
            <h3>外观模式</h3>
            <p>选择浅色、深色或根据操作系统外观自动切换</p>
          </div>
          <div
            aria-label="外观模式"
            data-appearance-mode-segment
            role="radiogroup"
          >
            {APPEARANCE_MODES.map((mode) => {
              const selected = state.mode === mode;
              return (
                <label
                  key={mode}
                  data-appearance-mode-option
                  data-selected={selected ? "true" : "false"}
                >
                  <input
                    checked={selected}
                    data-appearance-sr
                    name="appearance-mode"
                    type="radio"
                    value={mode}
                    onChange={() => controller.setMode(mode)}
                  />
                  <span>{MODE_LABELS[mode]}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* 2. Seasonal Theme Card Grid */}
        <section data-appearance-card data-card="themes">
          <div data-appearance-card-header>
            <h3>季节主题</h3>
            <p>选择 3 套自然季节主题调色板（羊皮纸·秋 / 暖白粉·春 / 森林绿·夏）</p>
          </div>
          <div
            aria-label="季节主题"
            data-appearance-seasonal-grid
            role="radiogroup"
          >
            {SEASONAL_THEMES.map((themeKey) => {
              const selected = state.theme === themeKey;
              const meta = THEME_METADATA[themeKey];
              const paletteKey = `${themeKey}-${effectiveMode}`;
              const palette = SANBAO_PALETTES[paletteKey] ?? SANBAO_PALETTES["forest-green-light"];
              // 4 chips: canvas, panel, accent, foreground
              const chips = [
                palette.canvas,
                palette.panel,
                palette.accent,
                palette.foreground,
              ];

              return (
                <label
                  key={themeKey}
                  data-appearance-theme-card
                  data-theme={themeKey}
                  data-selected={selected ? "true" : "false"}
                >
                  <input
                    checked={selected}
                    data-appearance-sr
                    name="seasonal-theme"
                    type="radio"
                    value={themeKey}
                    onChange={() => controller.setTheme(themeKey)}
                  />
                  <div data-appearance-theme-card-body>
                    <div data-appearance-theme-card-header>
                      <span data-appearance-theme-title>{meta.title}</span>
                      <span data-appearance-theme-season>{meta.season}</span>
                    </div>
                    <div data-appearance-swatch-strip aria-hidden="true">
                      {chips.map((c, i) => (
                        <span
                          key={i}
                          data-appearance-swatch-chip
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <span data-appearance-theme-desc>{meta.description}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        {/* 3. Typography & Accessibility */}
        <section data-appearance-card data-card="typography">
          <div data-appearance-card-header>
            <h3>字体与排版</h3>
            <p>调整界面显示缩放比例与动效偏好</p>
          </div>
          <div data-appearance-typography data-appearance-setting-list>
            <div data-appearance-setting-row>
              <div data-appearance-setting-copy>
                <span>字号缩放</span>
                <p>调整正文、界面与代码字号比例（90% ~ 130%）</p>
              </div>
              <div data-appearance-stepper-control>
                <button
                  aria-label="减小字号"
                  data-appearance-stepper-button
                  disabled={!canDecrease}
                  type="button"
                  onClick={handleDecreaseScale}
                >
                  −
                </button>
                <span data-appearance-stepper-value>
                  {currentScalePercent}%
                </span>
                <button
                  aria-label="增大字号"
                  data-appearance-stepper-button
                  disabled={!canIncrease}
                  type="button"
                  onClick={handleIncreaseScale}
                >
                  +
                </button>
              </div>
            </div>

            <div data-appearance-setting-row>
              <div data-appearance-setting-copy>
                <span>减弱动态效果</span>
                <p>关闭或减少界面过渡动效与动画</p>
              </div>
              <button
                aria-checked={state.reducedMotion}
                aria-label="减弱动态效果"
                data-appearance-switch
                role="switch"
                type="button"
                onClick={() =>
                  controller.setReducedMotion(!state.reducedMotion)
                }
              >
                <span aria-hidden="true" data-appearance-switch-thumb />
              </button>
            </div>
          </div>
        </section>

        {/* 4. Live Preview Card */}
        <section data-appearance-card data-card="preview">
          <div data-appearance-card-header>
            <h3>实时预览</h3>
            <p>即时感知当前外观模式、季节色彩与排版呈现</p>
          </div>
          <div data-appearance-live-preview>
            <div data-appearance-preview-card>
              <div data-appearance-preview-banner>
                <h4 data-appearance-preview-title>LUTE Agentic System</h4>
                <span data-appearance-preview-badge>已就绪</span>
              </div>
              <p data-appearance-preview-desc>
                当前激活主题：
                <strong>{THEME_METADATA[state.theme].season}</strong>
                （{effectiveMode === "dark" ? "暗色模式" : "浅色模式"}）· 缩放比例 {currentScalePercent}%
              </p>
              <div data-appearance-preview-actions>
                <button
                  data-appearance-button
                  data-variant="primary"
                  type="button"
                >
                  主要操作
                </button>
                <button
                  data-appearance-button
                  data-variant="secondary"
                  type="button"
                >
                  次要操作
                </button>
                <code data-appearance-preview-code>pnpm run gate</code>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
