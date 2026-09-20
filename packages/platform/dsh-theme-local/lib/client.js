window.__ModuleLoader__.load({
	id: "dsh-theme",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		let react = require("react");
		react = __toESM(react, 1);
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-theme-css:/Users/lute/project/Magpie-Horch/.worktrees/theme-triad-a60b3a9f/packages/platform/dsh-theme-local/src/client/studio.css.mjs
		const css = "[data-appearance-studio],\n[data-appearance-studio] * {\n  box-sizing: border-box;\n}\n\n[data-appearance-studio] {\n  --appearance-accent: var(--sanbao-accent);\n  --appearance-background: var(--sanbao-canvas);\n  --appearance-surface: var(--sanbao-panel);\n  --appearance-surface-raised: var(--sanbao-inset);\n  --appearance-hover: var(--sanbao-hover);\n  --appearance-border: var(--sanbao-border);\n  --appearance-border-strong: var(--sanbao-control-border);\n  --appearance-text: var(--sanbao-foreground);\n  --appearance-text-muted: var(--sanbao-secondary);\n  display: flex;\n  width: 100%;\n  max-width: 720px;\n  flex-direction: column;\n  gap: 20px;\n  padding-bottom: 24px;\n  color: var(--appearance-text);\n  font: var(--sanbao-font-body);\n  overflow-wrap: anywhere;\n}\n\n[data-appearance-studio] button,\n[data-appearance-studio] input,\n[data-appearance-studio] select {\n  font: var(--sanbao-font-control);\n}\n\n[data-appearance-sr] {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  overflow: hidden;\n  border: 0;\n  margin: -1px;\n  clip-path: inset(50%);\n  white-space: nowrap;\n}\n\n[data-appearance-header] {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 16px;\n  padding-bottom: 16px;\n  border-bottom: 0.5px solid var(--appearance-border);\n}\n\n[data-appearance-header] > div {\n  min-width: 0;\n}\n\n[data-appearance-header] h2 {\n  margin: 0;\n  color: var(--appearance-text);\n  font: var(--sanbao-font-page);\n}\n\n[data-appearance-header] p,\n[data-appearance-subheading] p,\n[data-appearance-card-header] p {\n  margin: 3px 0 0;\n  color: var(--appearance-text-muted);\n  font: var(--sanbao-font-body);\n}\n\n[data-appearance-header] p {\n  font: var(--sanbao-font-body);\n}\n\n[data-appearance-button] {\n  min-height: 34px;\n  padding: 5px 12px;\n  border: 0.5px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-md, 8px);\n  color: var(--appearance-text);\n  background: var(--appearance-surface);\n  cursor: pointer;\n}\n\n[data-appearance-button]:hover {\n  background: var(--appearance-hover);\n}\n\n[data-appearance-button]:disabled,\n[data-appearance-stepper-button]:disabled {\n  opacity: 0.45;\n  cursor: default;\n}\n\n[data-appearance-button]:focus-visible,\n[data-appearance-stepper-button]:focus-visible,\n[data-appearance-stepper-value]:focus-visible,\n[data-appearance-select]:focus-visible,\n[data-appearance-switch]:focus-visible {\n  outline: 2px solid var(--appearance-accent);\n  outline-offset: 2px;\n}\n\n[data-appearance-content] {\n  display: flex;\n  min-width: 0;\n  flex-direction: column;\n  gap: 18px;\n}\n\n/* Cards keep the two decisions apart: the theme itself, then reader prefs. */\n[data-appearance-card] {\n  display: flex;\n  min-width: 0;\n  flex-direction: column;\n  gap: 12px;\n  padding: 14px;\n  border: 0.5px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-lg, 12px);\n  background: var(--appearance-surface);\n}\n\n[data-appearance-card-header] h3 {\n  margin: 0;\n  color: var(--appearance-text);\n  font: var(--sanbao-font-section);\n}\n\n[data-appearance-subheading] h4 {\n  margin: 0;\n  color: var(--appearance-text);\n  font: var(--sanbao-font-panel);\n}\n\n[data-appearance-subheading] {\n  display: flex;\n  flex-direction: column;\n  gap: 0;\n}\n\n/* Theme cards --------------------------------------------------------- */\n\n[data-appearance-mode-grid] {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 10px;\n}\n\n[data-appearance-mode] {\n  display: flex;\n  min-width: 0;\n  height: auto;\n  flex-direction: column;\n  gap: 8px;\n  padding: 7px;\n  border: 0.5px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-md, 10px);\n  color: var(--appearance-text-muted);\n  background: var(--appearance-surface);\n  cursor: pointer;\n}\n\n[data-appearance-mode]:hover {\n  border-color: var(--appearance-border-strong);\n  background: var(--appearance-hover);\n}\n\n[data-appearance-mode]:has(input:focus-visible) {\n  outline: 2px solid var(--appearance-accent);\n  outline-offset: 2px;\n}\n\n[data-appearance-mode][data-selected=\"true\"] {\n  border-color: var(--appearance-accent);\n  color: var(--appearance-text);\n  background: var(--appearance-surface-raised);\n  box-shadow: 0 0 0 1px var(--appearance-accent);\n}\n\n[data-appearance-mode] > span:last-child {\n  color: inherit;\n  font: var(--sanbao-font-control);\n  font-weight: 500;\n}\n\n[data-appearance-preview] {\n  position: relative;\n  display: flex;\n  width: 100%;\n  aspect-ratio: 1.8;\n  overflow: hidden;\n  border: 0.5px solid var(--sanbao-border);\n  border-radius: var(--dsw-alias-radius-md, 8px);\n  background: var(--sanbao-canvas);\n}\n\n[data-appearance-preview-sidebar] {\n  width: 28%;\n  background: var(--sanbao-sidebar);\n}\n\n[data-appearance-preview-surface] {\n  position: absolute;\n  right: 8%;\n  bottom: 12%;\n  display: grid;\n  width: 56%;\n  gap: 5px;\n  padding: 8px;\n  border: 0.5px solid var(--sanbao-border);\n  border-radius: var(--dsw-alias-radius-sm, 6px);\n  background: var(--sanbao-panel);\n}\n\n[data-appearance-preview-surface] i {\n  height: 4px;\n  border-radius: 999px;\n  background: var(--sanbao-secondary);\n}\n\n[data-appearance-preview-surface] i:nth-child(2) {\n  width: 78%;\n}\n\n[data-appearance-preview-surface] i:nth-child(3) {\n  width: 48%;\n}\n\n/* Typography and non-color preferences -------------------------------- */\n\n[data-appearance-setting-list] {\n  display: grid;\n  min-width: 0;\n  overflow: hidden;\n  border: 0.5px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-md, 10px);\n  background: var(--appearance-surface);\n}\n\n[data-appearance-setting-row] {\n  display: grid;\n  grid-template-columns: minmax(7rem, 1fr) minmax(10rem, 15rem);\n  align-items: center;\n  min-height: 52px;\n  gap: 12px;\n  padding: 8px 12px;\n  border-bottom: 0.5px solid var(--appearance-border);\n}\n\n[data-appearance-setting-row]:last-child {\n  border-bottom: 0;\n}\n\n[data-appearance-setting-row] > span,\n[data-appearance-setting-copy] > span {\n  font: var(--sanbao-font-control);\n  font-weight: 500;\n}\n\n[data-appearance-setting-copy] p {\n  margin: 0;\n  color: var(--appearance-text-muted);\n  font: var(--sanbao-font-body);\n}\n\n/* Prefs rows ---------------------------------------------------------- */\n\n[data-appearance-setting-copy] {\n  display: flex;\n  min-width: 0;\n  flex-direction: column;\n}\n\n[data-appearance-select] {\n  width: 100%;\n  min-width: 0;\n  min-height: 34px;\n  height: auto;\n  padding: 4px 26px 4px 9px;\n  border: 0.5px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-sm, 8px);\n  color: var(--appearance-text);\n  background: var(--appearance-background);\n  cursor: pointer;\n}\n\n[data-appearance-stepper] {\n  display: grid;\n  grid-template-columns: minmax(7rem, 1fr) minmax(10rem, 15rem);\n  align-items: center;\n  min-height: 52px;\n  gap: 12px;\n  padding: 8px 12px;\n  border-bottom: 0.5px solid var(--appearance-border);\n}\n\n[data-appearance-stepper]:last-child {\n  border-bottom: 0;\n}\n\n[data-appearance-stepper-control] {\n  display: inline-flex;\n  align-items: center;\n  justify-self: start;\n  gap: 2px;\n  padding: 2px;\n  border: 0.5px solid var(--appearance-border);\n  border-radius: var(--dsw-alias-radius-sm, 8px);\n  background: var(--appearance-background);\n}\n\n[data-appearance-stepper-button] {\n  width: 26px;\n  min-height: 30px;\n  height: auto;\n  border: 0;\n  border-radius: var(--dsw-alias-radius-sm, 6px);\n  color: var(--appearance-text);\n  background: transparent;\n  cursor: pointer;\n}\n\n[data-appearance-stepper-button]:hover:not(:disabled) {\n  background: var(--appearance-hover);\n}\n\n[data-appearance-stepper-value] {\n  width: 2.6rem;\n  min-height: 30px;\n  height: auto;\n  border: 0;\n  color: var(--appearance-text);\n  background: transparent;\n  font-family: var(--ds-font-family-code);\n  font-size: inherit;\n  text-align: center;\n}\n\n[data-appearance-segment] {\n  display: inline-flex;\n  padding: 3px;\n  border-radius: var(--dsw-alias-radius-md, 8px);\n  background: var(--appearance-surface-raised);\n}\n\n[data-appearance-segment] label {\n  display: inline-flex;\n  align-items: center;\n  min-height: 26px;\n  padding: 3px 10px;\n  border-radius: var(--dsw-alias-radius-sm, 6px);\n  color: var(--appearance-text-muted);\n  cursor: pointer;\n  font-size: inherit;\n}\n\n[data-appearance-segment] label[data-selected=\"true\"] {\n  color: var(--appearance-text);\n  background: var(--appearance-surface);\n  box-shadow: var(--dsw-shadow-lv1, none);\n}\n\n[data-appearance-segment] label:has(input:focus-visible) {\n  outline: 2px solid var(--appearance-accent);\n  outline-offset: 2px;\n}\n\n[data-appearance-switch] {\n  position: relative;\n  width: 40px;\n  height: 24px;\n  flex: none;\n  justify-self: start;\n  padding: 0;\n  border: 0.5px solid var(--appearance-border);\n  border-radius: 999px;\n  background: var(--appearance-surface-raised);\n  cursor: pointer;\n}\n\n[data-appearance-switch][aria-checked=\"true\"] {\n  border-color: transparent;\n  background: var(--sanbao-accent-fill);\n}\n\n[data-appearance-switch-thumb] {\n  position: absolute;\n  top: 2px;\n  left: 2px;\n  width: 18px;\n  height: 18px;\n  border-radius: 999px;\n  background: var(--appearance-surface);\n  box-shadow: var(--dsw-shadow-lv1, none);\n}\n\n[data-appearance-switch][aria-checked=\"true\"] [data-appearance-switch-thumb] {\n  background: var(--sanbao-on-accent);\n  left: 19px;\n}\n\n[data-appearance-status] {\n  min-height: 18px;\n  margin: -7px 2px 0;\n  color: var(--appearance-text-muted);\n  font: var(--sanbao-font-body);\n}\n\n[data-appearance-status][data-status=\"error\"] {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n@media (prefers-reduced-motion: no-preference) {\n  [data-appearance-button],\n  [data-appearance-mode],\n  [data-appearance-switch-thumb],\n  [data-appearance-segment] label,\n  [data-appearance-select] {\n    transition:\n      border-color 180ms ease,\n      background-color 180ms ease,\n      color 180ms ease,\n      box-shadow 180ms ease,\n      left 180ms ease;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  [data-appearance-button],\n  [data-appearance-mode],\n  [data-appearance-switch-thumb],\n  [data-appearance-segment] label,\n  [data-appearance-select] {\n    transition: none;\n  }\n}\n\n@media (max-width: 620px) {\n  [data-appearance-header] {\n    flex-wrap: wrap;\n  }\n\n  [data-appearance-mode-grid] {\n    grid-template-columns: 1fr;\n  }\n\n  [data-appearance-mode] {\n    display: grid;\n    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\n    align-items: center;\n  }\n\n  [data-appearance-setting-row],\n  [data-appearance-stepper] {\n    grid-template-columns: 1fr;\n  }\n}\n";
		const tagId = "dsh-theme/studio.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-theme";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/sanbao-tokens.ts
		/** Fixed semantic palette. All product color literals live here; dsw is a projection only. */
		const THEME_IDS = [
			"light",
			"dark",
			"warm-pink"
		];
		function themeColorScheme(id) {
			return id === "dark" ? "dark" : "light";
		}
		const SANBAO_PALETTES = Object.freeze({
			light: Object.freeze({
				canvas: "#FDFDFD",
				sidebar: "#F1F1F0",
				rightSidebar: "#F6F6F6",
				panel: "#FFFFFF",
				inset: "#F6F6F6",
				overlay: "#FFFFFF",
				foreground: "#202120",
				secondary: "#60635E",
				accent: "#386940",
				accentFill: "#386940",
				onAccent: "#FFFFFF",
				hover: "#E9EBE7",
				pressed: "#DDE3DC",
				selected: "#E4ECE4",
				disabled: "#959A93",
				border: "#D7DBD4",
				controlBorder: "#788076",
				success: "#2F6B3D",
				warning: "#855D18",
				error: "#A94040"
			}),
			dark: Object.freeze({
				canvas: "#232523",
				sidebar: "#242624",
				rightSidebar: "#191B1A",
				panel: "#191B1A",
				inset: "#131413",
				overlay: "#131413",
				foreground: "#ECEDEB",
				secondary: "#AFB5AF",
				accent: "#8FBC99",
				accentFill: "#5C9363",
				onAccent: "#101C12",
				hover: "#2E332F",
				pressed: "#343C35",
				selected: "#293A2D",
				disabled: "#737D75",
				border: "#3E463F",
				controlBorder: "#818E84",
				success: "#8FBC99",
				warning: "#DAB879",
				error: "#E49393"
			}),
			"warm-pink": Object.freeze({
				canvas: "#FFF8F7",
				sidebar: "#F7EEEC",
				rightSidebar: "#F7EEEC",
				panel: "#FFFDFC",
				inset: "#F3E6E4",
				overlay: "#FFFDFC",
				foreground: "#382E30",
				secondary: "#6B595E",
				accent: "#874958",
				accentFill: "#8F5361",
				onAccent: "#FFFFFF",
				hover: "#EFE1DF",
				pressed: "#E9D8D6",
				selected: "#EDDBDE",
				disabled: "#A48F94",
				border: "#DCC8CD",
				controlBorder: "#91717B",
				success: "#406748",
				warning: "#80501F",
				error: "#A53945"
			})
		});
		const kebab = (key) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
		/** Body-scoped variables are also consumed by the real settings-card previews. */
		function buildSanbaoVariables(id) {
			return Object.fromEntries(Object.entries(SANBAO_PALETTES[id]).map(([key, value]) => [`--sanbao-${kebab(key)}`, value]));
		}
		const COMPATIBILITY_VARIABLES = {
			bg: "canvas",
			surface: "panel",
			surface2: "inset",
			ink: "foreground",
			muted: "secondary",
			line: "border",
			good: "success",
			"metal-ink": "foreground",
			"metal-border": "border",
			"metal-fill": "panel",
			"metal-line": "border",
			"metal-highlight": "hover",
			"metal-pressed": "pressed"
		};
		function declarations(id) {
			return Object.entries(buildSanbaoVariables(id)).map(([key, value]) => `${key}: ${value};`).join("\n  ");
		}
		const SANBAO_TOKEN_CSS = `body {
  ${Object.entries(COMPATIBILITY_VARIABLES).map(([key, value]) => `--sanbao-${key}: var(--sanbao-${value});`).join("\n  ")}
  --sanbao-radius: var(--lute-radius-row, 8px);
  --sanbao-metal-shadow: transparent;
  --sanbao-success-surface: color-mix(in srgb, var(--sanbao-success) 10%, var(--sanbao-canvas));
  --sanbao-warning-surface: color-mix(in srgb, var(--sanbao-warning) 10%, var(--sanbao-canvas));
  --sanbao-error-surface: color-mix(in srgb, var(--sanbao-error) 10%, var(--sanbao-canvas));
  --sanbao-fast: 160ms;
  --sanbao-base: 260ms;
  --sanbao-slow: 520ms;
  --sanbao-ease: cubic-bezier(.22,1,.36,1);
}
body:not([data-sanbao-theme]) { ${declarations("light")} }
body[data-ds-dark-theme]:not([data-sanbao-theme]) { ${declarations("dark")} }
${THEME_IDS.map((id) => `body[data-sanbao-theme="${id}"] {\n  color-scheme: ${themeColorScheme(id)};\n  ${declarations(id)}\n}`).join("\n")}`;
		/** Acquire the shared sheet; release only removes a sheet created by this module. */
		const sheets = /* @__PURE__ */ new WeakMap();
		function ensureSanbaoTokens(doc = document) {
			let sheet = sheets.get(doc);
			if (!sheet) {
				const existing = doc.querySelector("style[data-sanbao-tokens]");
				const tag = existing ?? doc.createElement("style");
				tag.dataset.sanbaoTokens = "sanbaoTokens";
				tag.textContent = SANBAO_TOKEN_CSS;
				if (!existing) doc.head.append(tag);
				sheet = {
					tag,
					users: 0,
					owned: !existing
				};
				sheets.set(doc, sheet);
			}
			sheet.users++;
			let released = false;
			return () => {
				if (released) return;
				released = true;
				if (--sheet.users === 0) {
					if (sheet.owned) sheet.tag.remove();
					sheets.delete(doc);
				}
			};
		}
		//#endregion
		//#region src/theme-settings.ts
		const THEME_SETTINGS_NAMESPACE = "sanbao-appearance";
		const UI_FONT_IDS = [
			"system",
			"inter",
			"avenir",
			"rounded",
			"serif"
		];
		const CODE_FONT_IDS = [
			"sf-mono",
			"jetbrains",
			"fira-code",
			"menlo",
			"cascadia"
		];
		const UI_FONT_SIZES = [
			12,
			13,
			14,
			15,
			16
		];
		const CODE_FONT_SIZES = [
			11,
			12,
			13,
			14,
			15
		];
		const THEME_TYPOGRAPHY_FIELDS = [
			"uiFont",
			"codeFont",
			"uiFontSize",
			"codeFontSize"
		];
		const THEME_STUDIO_FIELDS = ["themeId", ...THEME_TYPOGRAPHY_FIELDS];
		const DEFAULT_THEME_STUDIO_SETTINGS = {
			themeId: "light",
			uiFont: "system",
			codeFont: "sf-mono",
			uiFontSize: 14,
			codeFontSize: 12
		};
		function recordOf(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
		}
		function isOneOf(value, candidates) {
			return candidates.includes(value);
		}
		/** Decode v2; neither arbitrary colors nor unknown fields survive. */
		function decodeThemeStudioSettings(section) {
			const r = recordOf(section);
			if (!isOneOf(r.themeId, THEME_IDS) || !isOneOf(r.uiFont, UI_FONT_IDS) || !isOneOf(r.codeFont, CODE_FONT_IDS) || !isOneOf(r.uiFontSize, UI_FONT_SIZES) || !isOneOf(r.codeFontSize, CODE_FONT_SIZES)) return void 0;
			return {
				themeId: r.themeId,
				uiFont: r.uiFont,
				codeFont: r.codeFont,
				uiFontSize: r.uiFontSize,
				codeFontSize: r.codeFontSize
			};
		}
		/** Ignore legacy colors and independently preserve valid typography fields. */
		function migrateLegacyThemeSettings(section, initialScheme) {
			const r = recordOf(section);
			const d = DEFAULT_THEME_STUDIO_SETTINGS;
			return {
				themeId: initialScheme,
				uiFont: isOneOf(r.uiFont, UI_FONT_IDS) ? r.uiFont : d.uiFont,
				codeFont: isOneOf(r.codeFont, CODE_FONT_IDS) ? r.codeFont : d.codeFont,
				uiFontSize: isOneOf(r.uiFontSize, UI_FONT_SIZES) ? r.uiFontSize : d.uiFontSize,
				codeFontSize: isOneOf(r.codeFontSize, CODE_FONT_SIZES) ? r.codeFontSize : d.codeFontSize
			};
		}
		/** Schema defaults in .value do not prove a user saved an identity. */
		function hasSavedThemeIdentity(user) {
			return Object.hasOwn(recordOf(user), "themeId");
		}
		//#endregion
		//#region src/client/locales.ts
		const NS = "dsh.theme";
		const zh = {
			nav: "外观",
			title: "外观",
			description: "选择配色，保留你的字体与字号",
			"mode.title": "外观模式",
			"mode.warm-pink": "暖粉白",
			"mode.light": "亮色",
			"mode.dark": "暗色",
			"preset.title": "主题",
			"preset.description": "三种固定配色，切换不会改变字体与字号",
			"prefs.title": "偏好",
			"prefs.render.title": "动效与渲染",
			"prefs.reduceMotion": "减弱动效",
			"prefs.reduceMotion.description": "减少界面过渡与动画",
			"prefs.fontSmoothing": "字体平滑",
			"prefs.fontSmoothing.description": "使用 macOS 原生抗锯齿",
			"segment.system": "跟随系统",
			"segment.on": "开",
			"segment.off": "关",
			"typography.title": "字体与字号",
			"typography.description": "未安装的字体会自动使用后备字体",
			"typography.uiFont": "界面字体",
			"typography.codeFont": "代码字体",
			"typography.uiFontSize": "界面字号",
			"typography.codeFontSize": "代码字号",
			"size.decrease": "减小",
			"size.increase": "增大",
			"font.system": "系统默认",
			"font.inter": "Inter",
			"font.avenir": "Avenir Next",
			"font.rounded": "圆体",
			"font.serif": "衬线体",
			"font.sf-mono": "SF Mono",
			"font.jetbrains": "JetBrains Mono",
			"font.fira-code": "Fira Code",
			"font.menlo": "Menlo",
			"font.cascadia": "Cascadia Code",
			"status.loading": "正在读取外观设置…",
			"status.saving": "正在保存…",
			"status.saved": "已保存",
			"status.error": "尚未保存到 Host，当前预览仍有效",
			"action.reset": "恢复配色"
		};
		const en = {
			nav: "Appearance",
			title: "Appearance",
			description: "Choose a color theme without changing your fonts or sizes",
			"mode.title": "Appearance mode",
			"mode.warm-pink": "Warm pink",
			"mode.light": "Light",
			"mode.dark": "Dark",
			"preset.title": "Themes",
			"preset.description": "Three fixed palettes; switching keeps your typography",
			"prefs.title": "Preferences",
			"prefs.render.title": "Motion and rendering",
			"prefs.reduceMotion": "Reduce motion",
			"prefs.reduceMotion.description": "Fewer interface transitions and animations",
			"prefs.fontSmoothing": "Font smoothing",
			"prefs.fontSmoothing.description": "Use native macOS antialiasing",
			"segment.system": "System",
			"segment.on": "On",
			"segment.off": "Off",
			"typography.title": "Fonts and sizes",
			"typography.description": "Unavailable fonts automatically use fallbacks",
			"typography.uiFont": "Interface font",
			"typography.codeFont": "Code font",
			"typography.uiFontSize": "Interface size",
			"typography.codeFontSize": "Code size",
			"size.decrease": "Decrease",
			"size.increase": "Increase",
			"font.system": "System default",
			"font.inter": "Inter",
			"font.avenir": "Avenir Next",
			"font.rounded": "Rounded",
			"font.serif": "Serif",
			"font.sf-mono": "SF Mono",
			"font.jetbrains": "JetBrains Mono",
			"font.fira-code": "Fira Code",
			"font.menlo": "Menlo",
			"font.cascadia": "Cascadia Code",
			"status.loading": "Reading appearance settings…",
			"status.saving": "Saving…",
			"status.saved": "Saved",
			"status.error": "Not saved to Host; the preview remains active",
			"action.reset": "Reset colors"
		};
		//#endregion
		//#region src/client/persistence.ts
		const THEME_STUDIO_STORAGE_KEY = "dsh-theme/settings/v2";
		const LEGACY_THEME_STUDIO_STORAGE_KEY = "dsh-theme/settings/v1";
		const THEME_PREFS_STORAGE_KEY = "dsh-theme/prefs/v1";
		const DEFAULT_THEME_STUDIO_PREFS = {
			reduceMotion: "system",
			fontSmoothing: false
		};
		function browserThemeStudioStorage() {
			try {
				return globalThis.localStorage;
			} catch {
				return;
			}
		}
		function loadThemeStudioSettings(storage, initialScheme = "light") {
			const decoded = decodeThemeStudioSettings(readSettingsCache(storage, THEME_STUDIO_STORAGE_KEY));
			if (decoded !== void 0) return decoded;
			return migrateLegacyThemeSettings(readSettingsCache(storage, LEGACY_THEME_STUDIO_STORAGE_KEY), initialScheme);
		}
		function readSettingsCache(storage, key) {
			try {
				const raw = storage?.getItem(key);
				return raw == null ? void 0 : JSON.parse(raw);
			} catch {
				return;
			}
		}
		function saveThemeStudioSettings(storage, settings) {
			if (storage === void 0) return false;
			try {
				storage.setItem(THEME_STUDIO_STORAGE_KEY, JSON.stringify(settings));
				return true;
			} catch {
				return false;
			}
		}
		function loadThemeStudioPrefs(storage) {
			const fallback = { ...DEFAULT_THEME_STUDIO_PREFS };
			if (storage === void 0) return fallback;
			try {
				const raw = storage.getItem(THEME_PREFS_STORAGE_KEY);
				if (raw === null) return fallback;
				const parsed = JSON.parse(raw);
				if (parsed === null || typeof parsed !== "object") return fallback;
				const record = parsed;
				return {
					reduceMotion: record.reduceMotion === "on" || record.reduceMotion === "off" ? record.reduceMotion : DEFAULT_THEME_STUDIO_PREFS.reduceMotion,
					fontSmoothing: record.fontSmoothing === true ? true : DEFAULT_THEME_STUDIO_PREFS.fontSmoothing
				};
			} catch {
				return fallback;
			}
		}
		function saveThemeStudioPrefs(storage, prefs) {
			if (storage === void 0) return false;
			try {
				storage.setItem(THEME_PREFS_STORAGE_KEY, JSON.stringify(prefs));
				return true;
			} catch {
				return false;
			}
		}
		//#endregion
		//#region src/client/prefs-css.ts
		const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
		/**
		* "system" mirrors the platform; "on"/"off" are explicit overrides that win
		* over the media query in both directions — that is the whole reason the
		* three-way choice exists instead of a single toggle.
		*/
		function shouldReduceMotion(pref, prefersReduce) {
			if (pref === "on") return true;
			if (pref === "off") return false;
			return prefersReduce;
		}
		/**
		* Presentation prefs ride on body attributes so the sheet stays inert until a
		* reader opts in: with no attribute set, not a single rule below matches and
		* the official app renders exactly as shipped. The app's own stylesheet never
		* consults prefers-reduced-motion, so "system" mirrors the media query here
		* instead of pretending the platform already did it.
		*/
		const PREFS_CSS = `
body[data-lute-reduce-motion="reduce"] *,
body[data-lute-reduce-motion="reduce"] *::before,
body[data-lute-reduce-motion="reduce"] *::after {
  animation-delay: 0s !important;
  animation-duration: 0.001ms !important;
  animation-iteration-count: 1 !important;
  transition-delay: 0s !important;
  transition-duration: 0.001ms !important;
  scroll-behavior: auto !important;
}
body[data-lute-font-smoothing="on"] {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`;
		/** The single decision the client uses to set or clear both body attributes. */
		function prefsAttributes(prefs, prefersReduce) {
			return {
				fontSmoothing: prefs.fontSmoothing,
				reduceMotion: shouldReduceMotion(prefs.reduceMotion, prefersReduce)
			};
		}
		//#endregion
		//#region src/client/store.ts
		function createThemeStudioStore(initialSettings = DEFAULT_THEME_STUDIO_SETTINGS, initialPrefs = DEFAULT_THEME_STUDIO_PREFS) {
			return (0, _deepseek_ai_dsh_client_store.defineStore)({
				init: () => ({
					prefs: { ...initialPrefs },
					saveStatus: "loading",
					settings: { ...initialSettings }
				}),
				actions: {
					syncSettings: (draft, settings) => {
						draft.settings = { ...settings };
					},
					syncPrefs: (draft, prefs) => {
						draft.prefs = { ...prefs };
					},
					setSaveStatus: (draft, status) => {
						draft.saveStatus = status;
					}
				}
			});
		}
		//#endregion
		//#region src/client/SizeStepper.tsx
		/**
		* Steps only through the curated size list, so the control can never commit a
		* value the token layer does not model. Typed input commits on Enter or blur
		* and snaps to the nearest allowed size.
		*/
		function SizeStepper({ decreaseLabel, increaseLabel, label, onChange, value, values }) {
			const [draft, setDraft] = react.useState(String(value));
			react.useEffect(() => setDraft(String(value)), [value]);
			const index = values.indexOf(value);
			const first = values[0];
			const last = values[values.length - 1];
			const step = (delta) => {
				if (index < 0) return;
				const next = values[index + delta];
				if (next !== void 0) onChange(next);
			};
			const commit = (raw) => {
				const parsed = Number.parseInt(raw, 10);
				if (!Number.isFinite(parsed)) {
					setDraft(String(value));
					return;
				}
				const nearest = values.reduce((best, candidate) => Math.abs(candidate - parsed) < Math.abs(best - parsed) ? candidate : best, value);
				setDraft(String(nearest));
				if (nearest !== value) onChange(nearest);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-appearance-stepper": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"data-appearance-chip-label": true,
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-appearance-stepper-control": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							"aria-label": `${decreaseLabel} ${label}`,
							"data-appearance-stepper-button": true,
							disabled: first !== void 0 && value <= first,
							type: "button",
							onClick: () => step(-1),
							children: "−"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							"aria-label": label,
							autoComplete: "off",
							"data-appearance-stepper-value": true,
							inputMode: "numeric",
							value: draft,
							onBlur: (event) => commit(event.currentTarget.value),
							onChange: (event) => setDraft(event.currentTarget.value),
							onKeyDown: (event) => {
								if (event.key === "Enter") {
									commit(event.currentTarget.value);
									event.currentTarget.blur();
								}
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							"aria-label": `${increaseLabel} ${label}`,
							"data-appearance-stepper-button": true,
							disabled: last !== void 0 && value >= last,
							type: "button",
							onClick: () => step(1),
							children: "+"
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/theme-typography.ts
		const UI_FONT_STACKS = {
			system: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", Arial, sans-serif",
			inter: "Inter, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", Arial, sans-serif",
			avenir: "\"Avenir Next\", Avenir, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
			rounded: "\"SF Pro Rounded\", \"Nunito Sans\", -apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
			serif: "\"Iowan Old Style\", \"Songti SC\", \"Noto Serif CJK SC\", Georgia, serif"
		};
		const CODE_FONT_STACKS = {
			"sf-mono": "\"SF Mono\", \"JetBrains Mono\", \"Fira Code\", Consolas, \"Liberation Mono\", monospace",
			jetbrains: "\"JetBrains Mono\", \"SF Mono\", \"Fira Code\", Consolas, \"Liberation Mono\", monospace",
			"fira-code": "\"Fira Code\", \"SF Mono\", \"JetBrains Mono\", Consolas, \"Liberation Mono\", monospace",
			menlo: "Menlo, Monaco, \"SF Mono\", Consolas, \"Liberation Mono\", monospace",
			cascadia: "\"Cascadia Code\", \"SF Mono\", \"JetBrains Mono\", Consolas, \"Liberation Mono\", monospace"
		};
		function same$1(value) {
			return {
				light: value,
				dark: value
			};
		}
		function font(size, lineHeight, family, weight, style) {
			return [
				style,
				weight,
				`${size}px/${lineHeight}px`,
				family
			].filter((part) => part !== void 0).join(" ");
		}
		function buildThemeTypography(settings) {
			const scale = (size) => Math.round(size * settings.uiFontSize / 14 * 1e3) / 1e3;
			const ui = (size, lineHeight, weight, style) => same$1(font(scale(size), scale(lineHeight), "var(--dsw-font-family)", weight, style));
			const code = (size, lineHeight) => same$1(font(Math.max(9, size + settings.codeFontSize - 12), Math.max(9, lineHeight + settings.codeFontSize - 12), "var(--ds-font-family-code)"));
			return {
				"--dsw-font-family": same$1(UI_FONT_STACKS[settings.uiFont]),
				"--ds-font-family-code": same$1(CODE_FONT_STACKS[settings.codeFont]),
				"--dsw-font-mono": same$1(CODE_FONT_STACKS[settings.codeFont]),
				"--sanbao-font-hero": ui(36, 44, 600),
				"--sanbao-font-hero-compact": ui(28, 36, 600),
				"--sanbao-font-page": ui(28, 36, 600),
				"--sanbao-font-section": ui(20, 28, 600),
				"--sanbao-font-panel": ui(16, 24, 600),
				"--sanbao-font-body": ui(14, 22, 400),
				"--sanbao-font-control": ui(14, 20, 400),
				"--sanbao-font-meta": ui(13, 18, 400),
				"--dsw-font-xl-24": ui(24, 32, 600),
				"--dsw-font-l-20": ui(20, 28, 600),
				"--dsw-font-m-18": ui(18, 28, 600),
				"--dsw-font-base-16": ui(16, 24),
				"--dsw-font-base-strong-16": ui(16, 24, 500),
				"--dsw-font-s-14": ui(14, 22),
				"--dsw-font-s-strong-14": ui(14, 22, 500),
				"--dsw-font-xs-13": ui(13, 20),
				"--dsw-font-xs-strong-13": ui(13, 20, 500),
				"--dsw-font-xxs-12": ui(12, 18),
				"--dsw-font-xxs-strong-12": ui(12, 18, 500),
				"--dsw-font-xxxs-11": ui(11, 14),
				"--dsw-font-xxxs-strong-11": ui(11, 14, 500),
				"--dsw-font-markdown-h1": ui(24, 34, 700),
				"--dsw-font-markdown-h2": ui(20, 28, 600),
				"--dsw-font-markdown-h3": ui(18, 28, 600),
				"--dsw-font-markdown-h4": ui(16, 28, 600),
				"--dsw-font-markdown-base": ui(16, 28),
				"--dsw-font-markdown-base-strong": ui(16, 28, 600),
				"--dsw-font-markdown-base-italic": ui(16, 28, void 0, "italic"),
				"--dsw-font-markdown-base-strong-italic": ui(16, 28, 600, "italic"),
				"--dsw-font-markdown-table": ui(15, 25),
				"--dsw-font-markdown-table-head": ui(15, 25, 500),
				"--dsw-font-markdown-small": ui(14, 24),
				"--dsw-font-markdown-small-strong": ui(14, 24, 600),
				"--dsw-font-markdown-small-italic": ui(14, 24, void 0, "italic"),
				"--dsw-font-markdown-small-strong-italic": ui(14, 24, 600, "italic"),
				"--dsw-font-markdown-code": code(14, 22),
				"--dsw-font-markdown-code-block": code(14, 22),
				"--dsw-font-markdown-code-block-small": code(12, 18)
			};
		}
		//#endregion
		//#region src/client/ThemeStudio.tsx
		const REDUCE_MOTION_OPTIONS = [
			"system",
			"on",
			"off"
		];
		function SettingSelect({ label, onChange, options, value }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				"data-appearance-setting-row": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
					"data-appearance-select": true,
					value,
					onChange: (event) => onChange(event.currentTarget.value),
					children: options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
						style: option.fontFamily === void 0 ? void 0 : { fontFamily: option.fontFamily },
						value: option.value,
						children: option.label
					}, option.value))
				})]
			});
		}
		function ModePreview({ mode }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				"aria-hidden": "true",
				"data-appearance-preview": true,
				"data-mode": mode,
				style: buildSanbaoVariables(mode),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { "data-appearance-preview-sidebar": true }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					"data-appearance-preview-surface": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {})
					]
				})]
			});
		}
		function ThemeStudio({ resetTheme, setPrefs, setTheme, setTypography, t, useStore }) {
			const prefs = useStore((state) => state.prefs);
			const saveStatus = useStore((state) => state.saveStatus);
			const settings = useStore((state) => state.settings);
			const uiFontOptions = UI_FONT_IDS.map((value) => ({
				value,
				label: t(`font.${value}`),
				fontFamily: UI_FONT_STACKS[value]
			}));
			const codeFontOptions = CODE_FONT_IDS.map((value) => ({
				value,
				label: t(`font.${value}`),
				fontFamily: CODE_FONT_STACKS[value]
			}));
			const statusText = t(`status.${saveStatus}`);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-appearance-studio": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					"data-appearance-header": true,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("description") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						"data-appearance-button": true,
						"data-variant": "secondary",
						type: "button",
						onClick: resetTheme,
						children: t("action.reset")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-appearance-content": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							"data-appearance-card": true,
							"data-card": "theme",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								"data-appearance-card-header": true,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("preset.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("preset.description") })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								"aria-label": t("mode.title"),
								"data-appearance-mode-grid": true,
								role: "radiogroup",
								children: THEME_IDS.map((mode) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									"data-appearance-mode": true,
									"data-selected": settings.themeId === mode ? "true" : "false",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											checked: settings.themeId === mode,
											"data-appearance-sr": true,
											name: "appearance-mode",
											type: "radio",
											value: mode,
											onChange: () => setTheme(mode)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModePreview, { mode }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`mode.${mode}`) })
									]
								}, mode))
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							"data-appearance-card": true,
							"data-card": "prefs",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									"data-appearance-card-header": true,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("prefs.title") })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"data-appearance-subheading": true,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("typography.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("typography.description") })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"data-appearance-setting-list": true,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingSelect, {
											label: t("typography.uiFont"),
											options: uiFontOptions,
											value: settings.uiFont,
											onChange: (value) => setTypography("uiFont", value)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingSelect, {
											label: t("typography.codeFont"),
											options: codeFontOptions,
											value: settings.codeFont,
											onChange: (value) => setTypography("codeFont", value)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SizeStepper, {
											decreaseLabel: t("size.decrease"),
											increaseLabel: t("size.increase"),
											label: t("typography.uiFontSize"),
											value: settings.uiFontSize,
											values: UI_FONT_SIZES,
											onChange: (value) => setTypography("uiFontSize", value)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SizeStepper, {
											decreaseLabel: t("size.decrease"),
											increaseLabel: t("size.increase"),
											label: t("typography.codeFontSize"),
											value: settings.codeFontSize,
											values: CODE_FONT_SIZES,
											onChange: (value) => setTypography("codeFontSize", value)
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									"data-appearance-subheading": true,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: t("prefs.render.title") })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"data-appearance-setting-list": true,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										"data-appearance-setting-row": true,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											"data-appearance-setting-copy": true,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("prefs.reduceMotion") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("prefs.reduceMotion.description") })]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											"aria-label": t("prefs.reduceMotion"),
											"data-appearance-segment": true,
											role: "radiogroup",
											children: REDUCE_MOTION_OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												"data-selected": prefs.reduceMotion === option ? "true" : "false",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													checked: prefs.reduceMotion === option,
													"data-appearance-sr": true,
													name: "appearance-reduce-motion",
													type: "radio",
													value: option,
													onChange: () => setPrefs({ reduceMotion: option })
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`segment.${option}`) })]
											}, option))
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										"data-appearance-setting-row": true,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											"data-appearance-setting-copy": true,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("prefs.fontSmoothing") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("prefs.fontSmoothing.description") })]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											"aria-checked": prefs.fontSmoothing,
											"aria-label": t("prefs.fontSmoothing"),
											"data-appearance-switch": true,
											role: "switch",
											type: "button",
											onClick: () => setPrefs({ fontSmoothing: !prefs.fontSmoothing }),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												"aria-hidden": "true",
												"data-appearance-switch-thumb": true
											})
										})]
									})]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							"aria-live": "polite",
							"data-appearance-status": true,
							"data-status": saveStatus,
							children: statusText
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/theme-controller.ts
		const equal = (a, b) => a !== void 0 && THEME_STUDIO_FIELDS.every((field) => a[field] === b[field]);
		const writable = (s) => s.status === "ready" && s.mode === "host" && s.writable;
		/** Owns migration and latest-intent confirmation, not the SDK's wire queue. */
		function createThemeController(options) {
			const { scope, storage, render } = options;
			let state = {
				settings: loadThemeStudioSettings(storage, options.initialScheme),
				saveStatus: "loading"
			};
			let disposed = false;
			let initialized = false;
			let pending = false;
			const initialEdits = /* @__PURE__ */ new Set();
			const unconfirmedFields = /* @__PURE__ */ new Set();
			let generation = 0;
			let revision = -1;
			const listeners = /* @__PURE__ */ new Set();
			const publish = (settings, saveStatus) => {
				if (disposed) return;
				const changed = !equal(state.settings, settings);
				state = {
					settings,
					saveStatus
				};
				if (changed) render(settings);
				listeners.forEach((listener) => listener());
			};
			const write = (fields, expectedRevision) => {
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
				const settle = (failed) => {
					if (disposed || ownGeneration !== generation) return;
					pending = false;
					const accepted = scope.getSnapshot();
					revision = Math.max(revision, accepted.revision ?? -1);
					const value = decodeThemeStudioSettings(accepted.value);
					const user = accepted.user !== null && typeof accepted.user === "object" && !Array.isArray(accepted.user) ? accepted.user : {};
					const saved = !failed && writable(accepted) && hasSavedThemeIdentity(user) && value !== void 0 && fields.every((field) => Object.hasOwn(user, field) && user[field] === requested[field] && value[field] === requested[field]);
					if (saved) {
						fields.forEach((field) => unconfirmedFields.delete(field));
						saveThemeStudioSettings(storage, value);
					}
					publish(saved ? value : requested, saved ? "saved" : "error");
				};
				scope.mutate(fields.map((field) => ({
					op: "set",
					path: [field],
					value: requested[field]
				})), expectedRevision).then(() => settle(false), () => settle(true));
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
					const edits = Object.fromEntries(fields.map((field) => [field, state.settings[field]]));
					initialEdits.clear();
					if (!hasSavedThemeIdentity(s.user)) {
						const user = s.user !== null && typeof s.user === "object" && !Array.isArray(s.user) ? s.user : {};
						let merged = state.settings;
						for (const field of THEME_TYPOGRAPHY_FIELDS) if (Object.hasOwn(user, field)) merged = decodeThemeStudioSettings({
							...merged,
							[field]: user[field]
						}) ?? merged;
						publish(decodeThemeStudioSettings({
							...merged,
							...edits
						}) ?? merged, "loading");
						write(THEME_STUDIO_FIELDS, s.revision);
						return;
					}
					if (fields.length) {
						const merged = decodeThemeStudioSettings({
							...s.value,
							...edits
						});
						if (merged) publish(merged, "loading");
						write(fields);
						return;
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
			const set = (field, value) => {
				if (disposed) return;
				const next = decodeThemeStudioSettings({
					...state.settings,
					[field]: value
				});
				if (!next) return;
				if (!initialized) initialEdits.add(field);
				unconfirmedFields.add(field);
				publish(next, "saving");
				write([...unconfirmedFields]);
			};
			return {
				getSnapshot: () => state,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				set,
				resetColors: () => set("themeId", "light"),
				dispose: () => {
					disposed = true;
					generation++;
					unsubscribe();
					listeners.clear();
				}
			};
		}
		//#endregion
		//#region src/client/theme-tokens.ts
		function same(value) {
			return {
				light: value,
				dark: value
			};
		}
		function buildThemeTokenOverrides(settings) {
			return {
				...buildThemeTypography(settings),
				"--dsw-alias-bg-base": same("var(--sanbao-canvas)"),
				"--dsw-alias-bg-layer-1": same("var(--sanbao-panel)"),
				"--dsw-alias-button-elevated-fill": same("var(--sanbao-panel)"),
				"--dsw-alias-button-floating-fill": same("var(--sanbao-panel)"),
				"--dsw-alias-button-tool-bar-fill": same("var(--sanbao-panel)"),
				"--dsw-specific-menu": same("var(--sanbao-panel)"),
				"--dsw-specific-selector": same("var(--sanbao-panel)"),
				"--dsw-alias-bg-layer-3": same("var(--sanbao-overlay)"),
				"--dsw-alias-bg-overlay": same("var(--sanbao-overlay)"),
				"--dsw-alias-toast-bg": same("var(--sanbao-overlay)"),
				"--dsw-alias-tooltip-bg": same("var(--sanbao-overlay)"),
				"--dsw-specific-tip": same("var(--sanbao-overlay)"),
				"--dsw-alias-bg-layer-2": same("var(--sanbao-inset)"),
				"--dsw-alias-bg-module-platform": same("var(--sanbao-inset)"),
				"--dsw-alias-markdown-inline-code": same("var(--sanbao-inset)"),
				"--dsw-alias-markdown-code-block": same("var(--sanbao-inset)"),
				"--dsw-alias-markdown-code-block-banner": same("var(--sanbao-inset)"),
				"--dsw-alias-markdown-code-segment-unselected": same("var(--sanbao-inset)"),
				"--dsw-specific-input-major": same("var(--sanbao-inset)"),
				"--dsw-specific-login-input": same("var(--sanbao-inset)"),
				"--dsw-specific-sidebar-fill": same("var(--sanbao-sidebar)"),
				"--dsw-specific-sidebar-right-fill": same("var(--sanbao-right-sidebar)"),
				"--dsw-alias-label-primary": same("var(--sanbao-foreground)"),
				"--dsw-alias-label-primary-bluish": same("var(--sanbao-foreground)"),
				"--dsw-alias-label-secondary": same("var(--sanbao-secondary)"),
				"--dsw-alias-label-tertiary": same("var(--sanbao-secondary)"),
				"--dsw-alias-label-caption": same("var(--sanbao-secondary)"),
				"--dsw-alias-markdown-placeholder": same("var(--sanbao-secondary)"),
				"--dsw-alias-label-dimmed": same("var(--sanbao-disabled)"),
				"--dsw-alias-label-primary-dimmed": same("var(--sanbao-disabled)"),
				"--dsw-alias-button-primary-dimmed": same("var(--sanbao-disabled)"),
				"--dsw-alias-bg-skeleton": same("var(--sanbao-disabled)"),
				"--dsw-alias-scrollbar-bg-l1": same("var(--sanbao-disabled)"),
				"--dsw-alias-scrollbar-bg-l2": same("var(--sanbao-disabled)"),
				"--dsw-alias-brand-primary": same("var(--sanbao-accent)"),
				"--dsw-alias-brand-text": same("var(--sanbao-accent)"),
				"--dsw-alias-brand-primary-invert": same("var(--sanbao-accent)"),
				"--dsw-alias-brand-primary-new-colorprimary-new-color": same("var(--sanbao-accent)"),
				"--dsw-alias-state-business-primary": same("var(--sanbao-accent)"),
				"--dsw-alias-link": same("var(--sanbao-accent)"),
				"--dsw-static-deepseek-500": same("var(--sanbao-accent)"),
				"--dsw-static-deepseek-450": same("var(--sanbao-accent)"),
				"--dsw-static-deepseek-200": same("var(--sanbao-accent)"),
				"--dsw-alias-button-info-fill": same("var(--sanbao-accent-fill)"),
				"--dsw-alias-button-info-hover": same("var(--sanbao-accent-fill)"),
				"--dsw-alias-button-primary-fill": same("var(--sanbao-accent-fill)"),
				"--dsw-alias-button-primary-hover": same("var(--sanbao-accent-fill)"),
				"--dsw-alias-button-contrast-fill": same("var(--sanbao-accent-fill)"),
				"--dsw-alias-label-primary-inverted": same("var(--sanbao-on-accent)"),
				"--dsw-alias-label-primary-foreground": same("var(--sanbao-on-accent)"),
				"--dsw-alias-interactive-bg-hover": same("var(--sanbao-hover)"),
				"--dsw-alias-interactive-bg-hover-solid": same("var(--sanbao-hover)"),
				"--dsw-alias-interactive-bg-hover-accent": same("var(--sanbao-hover)"),
				"--dsw-specific-sidebar-nav-item-hover": same("var(--sanbao-hover)"),
				"--dsw-alias-button-floating-hover": same("var(--sanbao-hover)"),
				"--dsw-alias-button-tool-bar-hover": same("var(--sanbao-hover)"),
				"--dsw-alias-button-ghost-active-hover": same("var(--sanbao-hover)"),
				"--dsw-alias-interactive-bg-active": same("var(--sanbao-pressed)"),
				"--dsw-specific-sidebar-nav-item-active": same("var(--sanbao-pressed)"),
				"--dsw-specific-bubble-highlight": same("var(--sanbao-pressed)"),
				"--dsw-alias-bg-multi-select": same("var(--sanbao-selected)"),
				"--dsw-specific-bubble": same("var(--sanbao-selected)"),
				"--dsw-specific-sidebar-nav-item-active-accent": same("var(--sanbao-selected)"),
				"--dsw-alias-state-business-tertiary": same("var(--sanbao-selected)"),
				"--dsw-alias-markdown-code-segment-selected": same("var(--sanbao-selected)"),
				"--dsw-alias-markdown-citation": same("var(--sanbao-selected)"),
				"--dsw-alias-markdown-tag": same("var(--sanbao-selected)"),
				"--dsw-alias-button-ghost-active-fill": same("var(--sanbao-selected)"),
				"--dsw-alias-border-l1": same("var(--sanbao-border)"),
				"--dsw-alias-border-l2": same("var(--sanbao-border)"),
				"--dsw-alias-border-l2-darkmode-thin": same("var(--sanbao-border)"),
				"--dsw-alias-border-inverted": same("var(--sanbao-border)"),
				"--dsw-alias-border-inverted2": same("var(--sanbao-border)"),
				"--dsw-alias-border-l3": same("var(--sanbao-control-border)"),
				"--dsw-alias-border-l4": same("var(--sanbao-control-border)"),
				"--dsw-alias-button-ghost-active-border": same("var(--sanbao-control-border)"),
				"--dsw-alias-scrollbar-hover-l1": same("var(--sanbao-control-border)"),
				"--dsw-alias-scrollbar-hover-l2": same("var(--sanbao-control-border)"),
				"--dsw-alias-state-success-primary": same("var(--sanbao-success)"),
				"--dsw-alias-state-warn-primary": same("var(--sanbao-warning)"),
				"--dsw-alias-state-warn-label": same("var(--sanbao-warning)"),
				"--dsw-alias-state-error-primary": same("var(--sanbao-error)"),
				"--dsw-alias-state-success-secondary": same("var(--sanbao-success-surface)"),
				"--dsw-alias-state-success-tertiary": same("var(--sanbao-success-surface)"),
				"--dsw-alias-state-warn-secondary": same("var(--sanbao-warning-surface)"),
				"--dsw-alias-state-warn-tertiary": same("var(--sanbao-warning-surface)"),
				"--dsw-alias-state-error-secondary": same("var(--sanbao-error-surface)"),
				"--dsw-alias-interactive-bg-hover-danger": same("var(--sanbao-error-surface)")
			};
		}
		//#endregion
		//#region src/client/appearance-events.ts
		/** Document-only selection input; notifications report controller state, not persistence guesses. */
		function bindAppearanceEvents(doc, controller) {
			const select = (event) => {
				const CustomEventClass = doc.defaultView?.CustomEvent;
				if (!CustomEventClass || !(event instanceof CustomEventClass)) return;
				const detail = event.detail;
				if (detail === null || typeof detail !== "object" || Array.isArray(detail)) return;
				if (Reflect.ownKeys(detail).length !== 1) return;
				const property = Object.getOwnPropertyDescriptor(detail, "themeId");
				if (!property || !("value" in property) || !THEME_IDS.includes(property.value)) return;
				controller.set("themeId", property.value);
			};
			const publish = () => {
				const { settings, saveStatus } = controller.getSnapshot();
				const event = doc.createEvent("CustomEvent");
				event.initCustomEvent("sanbao:appearance-change", false, false, Object.freeze({
					themeId: settings.themeId,
					saveStatus
				}));
				doc.dispatchEvent(event);
			};
			doc.addEventListener("sanbao:select-theme", select);
			const unsubscribe = controller.subscribe(publish);
			publish();
			return () => {
				doc.removeEventListener("sanbao:select-theme", select);
				unsubscribe();
			};
		}
		//#endregion
		//#region src/client/index.tsx
		const THEME_SOURCE = "dsh-theme";
		/** Only these tokens belong to the official override contract. */
		const CONTRACT_TOKEN_NAMES = /* @__PURE__ */ new Set([
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
			"--dsw-specific-sidebar-fill"
		]);
		/** Remove only boot-owned properties still carrying the value and priority boot wrote. */
		function takeOverBootTokens(body, tokens) {
			const marker = body.dataset.sanbaoBootTokens;
			if (marker === void 0) return;
			let owned;
			try {
				owned = JSON.parse(marker);
			} catch {
				return;
			}
			if (owned === null || typeof owned !== "object" || Array.isArray(owned)) return;
			for (const [key, value] of Object.entries(owned)) {
				if (key !== "color-scheme" && !Object.hasOwn(tokens, key)) continue;
				const priority = key === "color-scheme" ? "" : "important";
				if (typeof value === "string" && body.style.getPropertyValue(key) === value && body.style.getPropertyPriority(key) === priority) body.style.removeProperty(key);
			}
			delete body.dataset.sanbaoBootTokens;
		}
		const inject = [
			"slots",
			"locale",
			"theme",
			"settingsScope"
		];
		function apply(ctx) {
			const storage = browserThemeStudioStorage();
			const body = document.body;
			const bootScheme = body.dataset.sanbaoInitialScheme;
			const initialScheme = bootScheme === "light" || bootScheme === "dark" ? bootScheme : ctx.theme.getTheme().active.colorScheme;
			const scope = ctx.settingsScope.bind({
				namespace: THEME_SETTINGS_NAMESPACE,
				decode: decodeThemeStudioSettings
			});
			let currentPrefs = loadThemeStudioPrefs(storage);
			let actions;
			let controller;
			let disposed = false;
			let motionQuery;
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
			const setPrefs = (patch) => {
				if (disposed) return;
				currentPrefs = {
					...currentPrefs,
					...patch
				};
				syncStore();
				applyPrefs();
				saveThemeStudioPrefs(storage, currentPrefs);
			};
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-theme: dictionaries");
			ctx.effect(() => ensureSanbaoTokens(document), "dsh-theme: semantic tokens");
			ctx.effect(() => {
				const cssTag = document.createElement("style");
				cssTag.dataset.plugin = THEME_SOURCE;
				cssTag.dataset.pluginCss = `${THEME_SOURCE}/token-vars`;
				document.head.appendChild(cssTag);
				let currentScheme = initialScheme;
				let renderedTheme;
				let contractKey;
				let releaseOverride;
				let firstRender = true;
				const syncScheme = () => {
					if (!disposed && ctx.theme.getTheme().preference !== currentScheme) ctx.theme.setTheme(currentScheme);
				};
				const releaseThemeChange = ctx.on("theme/change", syncScheme);
				controller = createThemeController({
					scope,
					storage,
					initialScheme,
					render(settings) {
						const tokens = buildThemeTokenOverrides(settings);
						if (firstRender) {
							takeOverBootTokens(body, tokens);
							firstRender = false;
						}
						renderedTheme = settings.themeId;
						currentScheme = themeColorScheme(settings.themeId);
						if (body.dataset.sanbaoTheme !== settings.themeId) body.dataset.sanbaoTheme = settings.themeId;
						const contract = {};
						const declarations = [`color-scheme: ${currentScheme} !important;`];
						for (const [key, pair] of Object.entries(tokens)) if (CONTRACT_TOKEN_NAMES.has(key)) contract[key] = pair;
						else declarations.push(`${key}: ${pair[currentScheme]} !important;`);
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
					}
				});
				const unsubscribe = controller.subscribe(syncStore);
				return () => {
					disposed = true;
					releaseThemeChange();
					unsubscribe();
					controller.dispose();
					actions = void 0;
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
				motionQuery = typeof window.matchMedia === "function" ? window.matchMedia(REDUCE_MOTION_QUERY) : void 0;
				const onMotionChange = () => applyPrefs();
				motionQuery?.addEventListener("change", onMotionChange);
				applyPrefs();
				return () => {
					motionQuery?.removeEventListener("change", onMotionChange);
					delete body.dataset.luteReduceMotion;
					delete body.dataset.luteFontSmoothing;
					prefsTag.remove();
					motionQuery = void 0;
				};
			}, "dsh-theme: presentation prefs");
			const store = createThemeStudioStore(controller.getSnapshot().settings, currentPrefs);
			const injectProps = (bound) => {
				actions = bound;
				syncStore();
				return {
					resetTheme: () => controller.resetColors(),
					setPrefs,
					setTheme: (themeId) => controller.set("themeId", themeId),
					setTypography: (field, value) => controller.set(field, value)
				};
			};
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-theme",
				order: 5,
				label: () => ctx.locale.bind(NS)("nav"),
				store,
				locale: NS,
				inject: injectProps
			}, ThemeStudio));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map