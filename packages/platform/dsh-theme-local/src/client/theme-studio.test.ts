import { createRequire } from "node:module";
import * as React from "react";
import { expect, it } from "vitest";
import { ThemeStudio } from "./ThemeStudio.js";
import { zh } from "./locales.js";
import { DEFAULT_THEME_STUDIO_SETTINGS } from "../theme-settings.js";

// The runtime provides react-dom/server; keep its untyped JS boundary local.
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup: (node: React.ReactNode) => string;
};

it("renders three fixed color choices, no arbitrary palette controls, and honest save status", () => {
  const state = { settings: { ...DEFAULT_THEME_STUDIO_SETTINGS, themeId: "warm-pink" }, prefs: { reduceMotion: "system", fontSmoothing: false }, saveStatus: "loading" };
  const html = renderToStaticMarkup(React.createElement(ThemeStudio, {
    useStore: (select: (value: typeof state) => unknown) => select(state), t: (key: keyof typeof zh) => zh[key],
    setTheme: () => {}, setTypography: () => {}, setPrefs: () => {}, resetTheme: () => {},
  } as unknown as React.ComponentProps<typeof ThemeStudio>));
  expect(html.match(/name="appearance-mode"/g)).toHaveLength(3);
  expect(html).toContain("暖粉白");
  expect(html).toMatch(/checked=""[^>]*value="warm-pink"/);
  expect(html).not.toContain('type="color"');
  expect(html).not.toContain('name="appearance-preset"');
  expect(html).not.toContain("导入");
  expect(html).toContain("恢复配色");
  expect(html).toContain("正在读取");
  expect(html).not.toContain("已保存");
  expect(html).toContain("界面字体");
  expect(html).toContain("减弱动效");
});
