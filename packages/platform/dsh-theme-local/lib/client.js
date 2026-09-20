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
		//#region \0dsh-theme-css:/Users/lute/project/Magpie-Horch/packages/platform/dsh-theme-local/src/client/studio.css.mjs
		const css = "[data-appearance-studio],\n[data-appearance-studio] * {\n  box-sizing: border-box;\n}\n\n[data-appearance-studio] {\n  --appearance-accent: var(--sanbao-accent, var(--dsw-alias-state-business-primary));\n  --appearance-background: var(--sanbao-canvas, var(--dsw-alias-bg-base));\n  --appearance-surface: var(--sanbao-panel, var(--dsw-alias-bg-layer-1));\n  --appearance-surface-raised: var(--sanbao-inset, var(--dsw-alias-bg-layer-2));\n  --appearance-hover: var(--sanbao-hover, var(--dsw-alias-interactive-bg-hover));\n  --appearance-border: var(--sanbao-border, var(--dsw-alias-border-l2));\n  --appearance-border-strong: var(--sanbao-control-border, var(--dsw-alias-border-l3));\n  --appearance-text: var(--sanbao-foreground, var(--dsw-alias-label-primary));\n  --appearance-text-muted: var(--sanbao-secondary, var(--dsw-alias-label-tertiary));\n  display: flex;\n  width: 100%;\n  max-width: 760px;\n  flex-direction: column;\n  gap: 20px;\n  padding-bottom: 24px;\n  color: var(--appearance-text);\n  font-family: var(--dsw-font-family, system-ui, -apple-system, sans-serif);\n}\n\n[data-appearance-studio] button,\n[data-appearance-studio] input,\n[data-appearance-studio] select,\n[data-appearance-studio] textarea {\n  font: inherit;\n}\n\n[data-appearance-sr] {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  overflow: hidden;\n  border: 0;\n  margin: -1px;\n  clip-path: inset(50%);\n  white-space: nowrap;\n}\n\n[data-appearance-header] {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 16px;\n  padding-bottom: 16px;\n  border-bottom: 0.5px solid var(--appearance-border);\n}\n\n[data-appearance-header] > div {\n  min-width: 0;\n}\n\n[data-appearance-header] h2 {\n  margin: 0;\n  color: var(--appearance-text);\n  font-size: 18px;\n  font-weight: 600;\n  line-height: 26px;\n}\n\n[data-appearance-header] p,\n[data-appearance-card-header] p {\n  margin: 4px 0 0;\n  color: var(--appearance-text-muted);\n  font-size: 13px;\n  line-height: 18px;\n}\n\n[data-appearance-content] {\n  display: flex;\n  min-width: 0;\n  flex-direction: column;\n  gap: 20px;\n}\n\n/* Cards */\n[data-appearance-card] {\n  display: flex;\n  min-width: 0;\n  flex-direction: column;\n  gap: 14px;\n  padding: 16px;\n  border: 0.5px solid var(--appearance-border);\n  border-radius: var(--sanbao-radius, 10px);\n  background: var(--appearance-surface);\n}\n\n[data-appearance-card-header] h3 {\n  margin: 0;\n  color: var(--appearance-text);\n  font-size: 15px;\n  font-weight: 600;\n  line-height: 22px;\n}\n\n/* 1. Mode Segmented Control */\n[data-appearance-mode-segment] {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 6px;\n  padding: 4px;\n  border-radius: var(--sanbao-radius, 8px);\n  background: var(--appearance-surface-raised);\n}\n\n[data-appearance-mode-option] {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 34px;\n  padding: 6px 14px;\n  border-radius: calc(var(--sanbao-radius, 8px) - 2px);\n  color: var(--appearance-text-muted);\n  cursor: pointer;\n  font-size: 13px;\n  font-weight: 500;\n  user-select: none;\n  transition: all 160ms ease;\n}\n\n[data-appearance-mode-option]:hover {\n  color: var(--appearance-text);\n}\n\n[data-appearance-mode-option][data-selected=\"true\"] {\n  color: var(--appearance-text);\n  background: var(--appearance-surface);\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);\n}\n\n[data-appearance-mode-option]:has(input:focus-visible) {\n  outline: 2px solid var(--appearance-accent);\n  outline-offset: 1px;\n}\n\n/* 2. Seasonal Theme Card Grid */\n[data-appearance-seasonal-grid] {\n  display: grid;\n  grid-template-columns: repeat(3, 1fr);\n  gap: 12px;\n}\n\n[data-appearance-theme-card] {\n  display: flex;\n  flex-direction: column;\n  border: 1px solid var(--appearance-border);\n  border-radius: var(--sanbao-radius, 10px);\n  background: var(--appearance-surface);\n  cursor: pointer;\n  overflow: hidden;\n  transition: border-color 180ms ease, box-shadow 180ms ease;\n}\n\n[data-appearance-theme-card]:hover {\n  border-color: var(--appearance-border-strong);\n}\n\n[data-appearance-theme-card][data-selected=\"true\"] {\n  border-color: var(--appearance-accent);\n  box-shadow: 0 0 0 2px color-mix(in srgb, var(--appearance-accent) 25%, transparent);\n}\n\n[data-appearance-theme-card]:has(input:focus-visible) {\n  outline: 2px solid var(--appearance-accent);\n  outline-offset: 2px;\n}\n\n[data-appearance-theme-card-body] {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  padding: 14px;\n}\n\n[data-appearance-theme-card-header] {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n}\n\n[data-appearance-theme-title] {\n  font-size: 14px;\n  font-weight: 600;\n  color: var(--appearance-text);\n}\n\n[data-appearance-theme-season] {\n  font-size: 12px;\n  color: var(--appearance-text-muted);\n}\n\n[data-appearance-swatch-strip] {\n  display: grid;\n  grid-template-columns: repeat(4, 1fr);\n  height: 24px;\n  border-radius: 6px;\n  overflow: hidden;\n  border: 0.5px solid var(--appearance-border);\n}\n\n[data-appearance-swatch-chip] {\n  display: block;\n  width: 100%;\n  height: 100%;\n}\n\n[data-appearance-theme-desc] {\n  font-size: 12px;\n  line-height: 16px;\n  color: var(--appearance-text-muted);\n}\n\n/* 3. Typography & Setting Rows */\n[data-appearance-setting-list] {\n  display: flex;\n  flex-direction: column;\n  border: 0.5px solid var(--appearance-border);\n  border-radius: var(--sanbao-radius, 10px);\n  background: var(--appearance-surface);\n  overflow: hidden;\n}\n\n[data-appearance-setting-row] {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  min-height: 54px;\n  gap: 16px;\n  padding: 10px 16px;\n  border-bottom: 0.5px solid var(--appearance-border);\n}\n\n[data-appearance-setting-row]:last-child {\n  border-bottom: 0;\n}\n\n[data-appearance-setting-copy] {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n\n[data-appearance-setting-copy] > span {\n  font-size: 13px;\n  font-weight: 500;\n  color: var(--appearance-text);\n}\n\n[data-appearance-setting-copy] p {\n  margin: 0;\n  font-size: 12px;\n  color: var(--appearance-text-muted);\n}\n\n/* Stepper */\n[data-appearance-stepper-control] {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  padding: 3px;\n  border: 0.5px solid var(--appearance-border);\n  border-radius: var(--sanbao-radius, 8px);\n  background: var(--appearance-surface-raised);\n}\n\n[data-appearance-stepper-button] {\n  width: 28px;\n  height: 28px;\n  border: 0;\n  border-radius: calc(var(--sanbao-radius, 8px) - 2px);\n  color: var(--appearance-text);\n  background: transparent;\n  cursor: pointer;\n  font-size: 16px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n[data-appearance-stepper-button]:hover:not(:disabled) {\n  background: var(--appearance-hover);\n}\n\n[data-appearance-stepper-button]:disabled {\n  opacity: 0.4;\n  cursor: not-allowed;\n}\n\n[data-appearance-stepper-value] {\n  min-width: 48px;\n  text-align: center;\n  font-size: 13px;\n  font-weight: 500;\n  color: var(--appearance-text);\n}\n\n/* Switch Toggle */\n[data-appearance-switch] {\n  position: relative;\n  width: 42px;\n  height: 24px;\n  flex: none;\n  padding: 0;\n  border: 0.5px solid var(--appearance-border);\n  border-radius: 999px;\n  background: var(--appearance-surface-raised);\n  cursor: pointer;\n  transition: background-color 180ms ease, border-color 180ms ease;\n}\n\n[data-appearance-switch][aria-checked=\"true\"] {\n  border-color: transparent;\n  background: var(--appearance-accent);\n}\n\n[data-appearance-switch-thumb] {\n  position: absolute;\n  top: 2px;\n  left: 2px;\n  width: 18px;\n  height: 18px;\n  border-radius: 999px;\n  background: #ffffff;\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);\n  transition: transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1);\n}\n\n[data-appearance-switch][aria-checked=\"true\"] [data-appearance-switch-thumb] {\n  transform: translateX(18px);\n}\n\n/* 4. Live Preview Card */\n[data-appearance-live-preview] {\n  border: 0.5px solid var(--appearance-border);\n  border-radius: var(--sanbao-radius, 10px);\n  background: var(--sanbao-canvas, var(--appearance-background));\n  padding: 16px;\n}\n\n[data-appearance-preview-card] {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding: 16px;\n  border: 0.5px solid var(--appearance-border);\n  border-radius: var(--sanbao-radius, 8px);\n  background: var(--sanbao-panel, var(--appearance-surface));\n}\n\n[data-appearance-preview-banner] {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n}\n\n[data-appearance-preview-title] {\n  margin: 0;\n  font-size: 15px;\n  font-weight: 600;\n  color: var(--sanbao-foreground, var(--appearance-text));\n}\n\n[data-appearance-preview-badge] {\n  font-size: 11px;\n  padding: 2px 8px;\n  border-radius: 999px;\n  background: var(--sanbao-success, #356b42);\n  color: #ffffff;\n  font-weight: 500;\n}\n\n[data-appearance-preview-desc] {\n  margin: 0;\n  font-size: 13px;\n  line-height: 20px;\n  color: var(--sanbao-secondary, var(--appearance-text-muted));\n}\n\n[data-appearance-preview-actions] {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  flex-wrap: wrap;\n}\n\n[data-appearance-button] {\n  min-height: 32px;\n  padding: 4px 14px;\n  border: 0.5px solid var(--appearance-border);\n  border-radius: var(--sanbao-radius, 6px);\n  color: var(--sanbao-foreground, var(--appearance-text));\n  background: var(--sanbao-panel, var(--appearance-surface));\n  cursor: pointer;\n  font-size: 13px;\n  font-weight: 500;\n  transition: background-color 160ms ease;\n}\n\n[data-appearance-button]:hover {\n  background: var(--sanbao-hover, var(--appearance-hover));\n}\n\n[data-appearance-button][data-variant=\"primary\"] {\n  border-color: transparent;\n  color: var(--sanbao-on-accent, #ffffff);\n  background: var(--sanbao-accent, var(--appearance-accent));\n}\n\n[data-appearance-preview-code] {\n  padding: 4px 8px;\n  border-radius: 4px;\n  font-size: 12px;\n  font-family: var(--sanbao-font-mono, monospace);\n  background: var(--sanbao-inset, var(--appearance-surface-raised));\n  color: var(--sanbao-foreground, var(--appearance-text));\n}\n\n/* Reduced motion media rules */\n@media (prefers-reduced-motion: reduce) {\n  [data-appearance-mode-option],\n  [data-appearance-theme-card],\n  [data-appearance-switch],\n  [data-appearance-switch-thumb],\n  [data-appearance-button] {\n    transition: none !important;\n  }\n}\n\n@media (max-width: 640px) {\n  [data-appearance-seasonal-grid] {\n    grid-template-columns: 1fr;\n  }\n}\n";
		const tagId = "dsh-theme/studio.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-theme";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/theme-settings.ts
		const THEME_COLOR_FIELDS = [
			"lightAccent",
			"lightBackground",
			"lightForeground",
			"lightSurface",
			"lightInlineCode",
			"lightSidebar",
			"darkAccent",
			"darkBackground",
			"darkForeground",
			"darkSurface",
			"darkInlineCode",
			"darkSidebar"
		];
		const LEGACY_THEME_COLOR_FIELDS = [
			"lightAccent",
			"lightBackground",
			"lightForeground",
			"lightSurface",
			"lightSidebar",
			"darkAccent",
			"darkBackground",
			"darkForeground",
			"darkSurface",
			"darkSidebar"
		];
		const THEME_CONTRAST_FIELDS = ["lightContrast", "darkContrast"];
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
		[
			...THEME_COLOR_FIELDS,
			...THEME_CONTRAST_FIELDS,
			...THEME_TYPOGRAPHY_FIELDS
		];
		const DEFAULT_THEME_STUDIO_SETTINGS = {
			lightAccent: "#347A2F",
			lightBackground: "#F6F7F4",
			lightForeground: "#1E221F",
			lightSurface: "#FFFFFF",
			lightInlineCode: "#EEF1EC",
			lightSidebar: "#F1F4EF",
			darkAccent: "#58B848",
			darkBackground: "#171A17",
			darkForeground: "#F1F4F0",
			darkSurface: "#202420",
			darkInlineCode: "#292D29",
			darkSidebar: "#191C1A",
			lightContrast: 50,
			darkContrast: 50,
			uiFont: "system",
			codeFont: "sf-mono",
			uiFontSize: 14,
			codeFontSize: 12
		};
		const HEX_COLOR = /^#[\dA-F]{6}$/i;
		const LEGACY_EDITORIAL_SIGNATURE = {
			lightAccent: "#065588",
			lightBackground: "#F3F2EE",
			lightForeground: "#1F0909",
			lightSurface: "#E8E7DF"
		};
		function isHexColor(value) {
			return typeof value === "string" && HEX_COLOR.test(value);
		}
		function isContrast(value) {
			return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
		}
		function isOneOf(value, candidates) {
			return candidates.includes(value);
		}
		function mixHex(foreground, foregroundWeight, background) {
			const channels = (value) => [
				1,
				3,
				5
			].map((start) => Number.parseInt(value.slice(start, start + 2), 16));
			const foregroundChannels = channels(foreground);
			const backgroundChannels = channels(background);
			return `#${foregroundChannels.map((channel, index) => Math.round(channel * foregroundWeight + backgroundChannels[index] * (1 - foregroundWeight)).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
		}
		function decodeThemeStudioSettings(section) {
			if (section === null || typeof section !== "object") return void 0;
			const sourceRecord = section;
			const record = Object.entries(LEGACY_EDITORIAL_SIGNATURE).every(([field, value]) => typeof sourceRecord[field] === "string" && sourceRecord[field].toUpperCase() === value) ? {
				...sourceRecord,
				lightForeground: "#2F2C29"
			} : sourceRecord;
			for (const field of LEGACY_THEME_COLOR_FIELDS) if (!isHexColor(record[field])) return void 0;
			for (const field of THEME_COLOR_FIELDS) if (record[field] !== void 0 && !isHexColor(record[field])) return;
			const legacyInlineCode = {
				lightInlineCode: mixHex(record.lightForeground, .06, record.lightBackground),
				darkInlineCode: mixHex(record.darkForeground, .1, record.darkBackground)
			};
			return {
				...Object.fromEntries(THEME_COLOR_FIELDS.map((field) => {
					const fallback = field === "lightInlineCode" || field === "darkInlineCode" ? legacyInlineCode[field] : DEFAULT_THEME_STUDIO_SETTINGS[field];
					return [field, isHexColor(record[field]) ? record[field] : fallback];
				})),
				lightContrast: isContrast(record.lightContrast) ? record.lightContrast : 50,
				darkContrast: isContrast(record.darkContrast) ? record.darkContrast : 50,
				uiFont: isOneOf(record.uiFont, UI_FONT_IDS) ? record.uiFont : DEFAULT_THEME_STUDIO_SETTINGS.uiFont,
				codeFont: isOneOf(record.codeFont, CODE_FONT_IDS) ? record.codeFont : DEFAULT_THEME_STUDIO_SETTINGS.codeFont,
				uiFontSize: isOneOf(record.uiFontSize, UI_FONT_SIZES) ? record.uiFontSize : DEFAULT_THEME_STUDIO_SETTINGS.uiFontSize,
				codeFontSize: isOneOf(record.codeFontSize, CODE_FONT_SIZES) ? record.codeFontSize : DEFAULT_THEME_STUDIO_SETTINGS.codeFontSize
			};
		}
		//#endregion
		//#region src/client/locales.ts
		const NS = "dsh.theme";
		const zh = {
			nav: "外观",
			title: "外观",
			description: "实时调整界面配色、字体与字号",
			"mode.title": "外观模式",
			"mode.system": "跟随系统",
			"mode.light": "浅色",
			"mode.dark": "深色",
			"preset.title": "主题",
			"preset.description": "主题会同步应用配色、字体与字号，之后仍可继续微调",
			"preset.custom": "自定义",
			"preset.codex": "清醒",
			"preset.proof": "草稿",
			"preset.everforest": "林地",
			"preset.github": "源码",
			"preset.gruvbox": "炉火",
			"preset.linear": "轨道",
			"preset.notion": "宁静",
			"preset.raycast": "聚焦",
			"preset.rosePine": "绽放",
			"preset.graphite": "现代派",
			"preset.editorial": "印刷",
			"preset.midnight": "午夜",
			"preset.folio": "文集",
			"preset.porcelain": "画布",
			"preset.carbon": "碳夜代码",
			"variant.light": "浅色主题",
			"variant.dark": "深色主题",
			"accent.label": "强调色",
			"accent.custom": "自定义",
			"accent.lute": "青竹",
			"accent.blue": "靛蓝",
			"accent.teal": "松绿",
			"accent.violet": "紫罗兰",
			"accent.amber": "琥珀",
			"accent.rose": "绛红",
			"accent.slate": "石墨",
			"accent.red": "朱砂",
			"contrast.label": "对比度",
			"contrast.description": "调整边框、表面与次级文字的深浅",
			"contrast.low": "较低",
			"contrast.standard": "标准",
			"contrast.high": "较高",
			"advanced.title": "高级",
			"advanced.description": "微调表面、行内代码与侧栏色",
			"share.copy": "复制主题",
			"share.copied": "已复制",
			"share.import": "导入",
			"share.paste": "粘贴主题串",
			"share.submit": "导入主题",
			"share.cancel": "取消",
			"share.invalid": "主题串无法识别",
			"share.copyFallback": "无法访问剪贴板，请手动复制",
			"color.accent": "强调色",
			"color.background": "背景色",
			"color.foreground": "文字色",
			"color.surface": "表面色",
			"color.inlineCode": "行内代码背景",
			"color.sidebar": "侧栏色",
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
			"status.saving": "正在保存…",
			"status.saved": "已实时应用",
			"status.error": "浏览器无法保存，当前预览仍有效",
			"action.reset": "恢复默认",
			"input.invalid": "请输入 6 位十六进制色值"
		};
		const en = {
			nav: "Appearance",
			title: "Appearance",
			description: "Tune interface colors, fonts, and type sizes live",
			"mode.title": "Appearance mode",
			"mode.system": "System",
			"mode.light": "Light",
			"mode.dark": "Dark",
			"preset.title": "Themes",
			"preset.description": "Themes apply colors, fonts, and sizes together; tune anything after",
			"preset.custom": "Custom",
			"preset.codex": "Lucid",
			"preset.proof": "Draft",
			"preset.everforest": "Grove",
			"preset.github": "Source",
			"preset.gruvbox": "Hearth",
			"preset.linear": "Orbit",
			"preset.notion": "Calm",
			"preset.raycast": "Focus",
			"preset.rosePine": "Bloom",
			"preset.graphite": "Modernist",
			"preset.editorial": "Press",
			"preset.midnight": "Midnight",
			"preset.folio": "Folio",
			"preset.porcelain": "Canvas",
			"preset.carbon": "Carbon Code",
			"variant.light": "Light theme",
			"variant.dark": "Dark theme",
			"accent.label": "Accent",
			"accent.custom": "Custom",
			"accent.lute": "Bamboo",
			"accent.blue": "Indigo",
			"accent.teal": "Pine",
			"accent.violet": "Violet",
			"accent.amber": "Amber",
			"accent.rose": "Rosewood",
			"accent.slate": "Slate",
			"accent.red": "Vermilion",
			"contrast.label": "Contrast",
			"contrast.description": "Adjusts borders, surfaces, and secondary text",
			"contrast.low": "Lower",
			"contrast.standard": "Standard",
			"contrast.high": "Higher",
			"advanced.title": "Advanced",
			"advanced.description": "Fine-tune surface, inline code, and sidebar colors",
			"share.copy": "Copy theme",
			"share.copied": "Copied",
			"share.import": "Import",
			"share.paste": "Paste a theme string",
			"share.submit": "Import theme",
			"share.cancel": "Cancel",
			"share.invalid": "That theme string is not readable",
			"share.copyFallback": "Clipboard unavailable — copy the string manually",
			"color.accent": "Accent",
			"color.background": "Background",
			"color.foreground": "Foreground",
			"color.surface": "Surface",
			"color.inlineCode": "Inline code background",
			"color.sidebar": "Sidebar",
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
			"status.saving": "Saving…",
			"status.saved": "Applied live",
			"status.error": "Browser storage is unavailable; preview remains active",
			"action.reset": "Reset",
			"input.invalid": "Enter a six-digit hex color"
		};
		//#endregion
		//#region src/client/sanbao-tokens.ts
		/**
		* 品牌 token 源 `--sanbao-*`（单一事实源 Single Source of Truth）。
		*
		* 矩阵结构：2 模式（light / dark）× 3 季节主题（parchment / warm-pink / forest-green）共 6 态调色板。
		* 遵循 ADR-0144 / ADR-0145 与设计规格书 Section 2.3 定义。
		*
		* 经 `scripts/sync-shared.mjs` 分发（副本首行带生成标记）；改这里后跑
		* `node scripts/sync-shared.mjs --write`。
		*/
		const APPEARANCE_MODES = [
			"light",
			"dark",
			"system"
		];
		const SEASONAL_THEMES = [
			"parchment",
			"warm-pink",
			"forest-green"
		];
		const SANBAO_PALETTES = Object.freeze({
			"parchment-light": Object.freeze({
				canvas: "#FBF7EE",
				sidebar: "#F3EEE3",
				rightSidebar: "#F3EEE3",
				panel: "#FFFFFF",
				inset: "#EFE9DC",
				overlay: "#FFFFFF",
				foreground: "#2A2723",
				secondary: "#6B595B",
				accent: "#8C6534",
				accentFill: "#8C6534",
				onAccent: "#FFFFFF",
				hover: "#EFE6D5",
				pressed: "#E5DAC4",
				selected: "#EFE6D5",
				disabled: "#A09A8F",
				border: "#E2DAC9",
				controlBorder: "#8D8474",
				success: "#356B42",
				warning: "#8C6014",
				error: "#A83B3B"
			}),
			"parchment-dark": Object.freeze({
				canvas: "#1F1E1B",
				sidebar: "#1A1917",
				rightSidebar: "#161513",
				panel: "#161513",
				inset: "#121110",
				overlay: "#121110",
				foreground: "#EAE5DB",
				secondary: "#A8A195",
				accent: "#D19F5B",
				accentFill: "#B88542",
				onAccent: "#1A150D",
				hover: "#292723",
				pressed: "#302E29",
				selected: "#2D2922",
				disabled: "#787267",
				border: "#33302B",
				controlBorder: "#787163",
				success: "#7EA885",
				warning: "#D6A865",
				error: "#DF8282"
			}),
			"warm-pink-light": Object.freeze({
				canvas: "#FFF8F7",
				sidebar: "#F7EEEC",
				rightSidebar: "#F7EEEC",
				panel: "#FFFDFC",
				inset: "#F3E6E4",
				overlay: "#FFFDFC",
				foreground: "#382E30",
				secondary: "#6B595E",
				accent: "#8F5361",
				accentFill: "#8F5361",
				onAccent: "#FFFFFF",
				hover: "#EFE1DF",
				pressed: "#E9D8D6",
				selected: "#EDDBDE",
				disabled: "#A48F94",
				border: "#DCC8CD",
				controlBorder: "#A2838B",
				success: "#406748",
				warning: "#80501F",
				error: "#A53945"
			}),
			"warm-pink-dark": Object.freeze({
				canvas: "#211C1D",
				sidebar: "#1C1819",
				rightSidebar: "#181415",
				panel: "#181415",
				inset: "#120E0F",
				overlay: "#120E0F",
				foreground: "#F0E5E7",
				secondary: "#B8A4A8",
				accent: "#E28D9E",
				accentFill: "#C46D80",
				onAccent: "#1F0F13",
				hover: "#2A2325",
				pressed: "#332B2D",
				selected: "#332328",
				disabled: "#7D6B70",
				border: "#382A2E",
				controlBorder: "#7F676D",
				success: "#87B58E",
				warning: "#DDA675",
				error: "#DE7A88"
			}),
			"forest-green-light": Object.freeze({
				canvas: "#F7F9F7",
				sidebar: "#EEF2EE",
				rightSidebar: "#EEF2EE",
				panel: "#FFFFFF",
				inset: "#E6EDE6",
				overlay: "#FFFFFF",
				foreground: "#1E241F",
				secondary: "#5A665C",
				accent: "#386940",
				accentFill: "#386940",
				onAccent: "#FFFFFF",
				hover: "#E3ECE3",
				pressed: "#D7E3D7",
				selected: "#E2EFE3",
				disabled: "#939E94",
				border: "#D1DDD2",
				controlBorder: "#78877A",
				success: "#2F6B3D",
				warning: "#855D18",
				error: "#A94040"
			}),
			"forest-green-dark": Object.freeze({
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
			})
		});
		const kebab = (key) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
		/**
		* 根据主题与模式构建 CSS 变量字典。
		* 支持 buildSanbaoVariables(theme, mode) 与向后兼容单入参 buildSanbaoVariables(themeKey)。
		*/
		function buildSanbaoVariables(themeOrCombined, mode) {
			let key;
			if (mode !== void 0) key = `${themeOrCombined}-${mode}`;
			else if (themeOrCombined.includes("-light") || themeOrCombined.includes("-dark")) key = themeOrCombined;
			else key = `${themeOrCombined}-light`;
			const palette = SANBAO_PALETTES[key] ?? SANBAO_PALETTES["forest-green-light"];
			return Object.fromEntries(Object.entries(palette).map(([k, value]) => [`--sanbao-${kebab(k)}`, value]));
		}
		/** 供体契约十键 + 材质七项向后兼容映射表 */
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
		function formatDeclarations(theme, mode) {
			const vars = buildSanbaoVariables(theme, mode);
			return Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join("\n    ");
		}
		const SANBAO_TOKEN_CSS = `:root {
  ${Object.entries(COMPATIBILITY_VARIABLES).map(([key, value]) => `--sanbao-${key}: var(--sanbao-${value});`).join("\n  ")}
  --sanbao-on-accent: #FFFFFF;
  --sanbao-radius: var(--lute-radius-row, 8px);
  --sanbao-metal-shadow: transparent;
  --sanbao-success-surface: color-mix(in srgb, var(--sanbao-success) 10%, var(--sanbao-canvas));
  --sanbao-warning-surface: color-mix(in srgb, var(--sanbao-warning) 10%, var(--sanbao-canvas));
  --sanbao-error-surface: color-mix(in srgb, var(--sanbao-error) 10%, var(--sanbao-canvas));
  --sanbao-fast: 160ms;
  --sanbao-base: 260ms;
  --sanbao-slow: 520ms;
  --sanbao-ease: cubic-bezier(.22,1,.36,1);

  /* 默认兜底：森林绿 light */
  ${formatDeclarations("forest-green", "light")}
}

body[data-ds-dark-theme] {
  /* 默认暗色兜底：森林绿 dark */
  ${formatDeclarations("forest-green", "dark")}
}

/* 6 态选择器矩阵 [data-sanbao-theme][data-sanbao-mode] */
${SEASONAL_THEMES.map((theme) => `
html[data-sanbao-theme="${theme}"][data-sanbao-mode="light"],
body[data-sanbao-theme="${theme}"][data-sanbao-mode="light"] {
  color-scheme: light;
  ${formatDeclarations(theme, "light")}
}

html[data-sanbao-theme="${theme}"][data-sanbao-mode="dark"],
body[data-sanbao-theme="${theme}"][data-sanbao-mode="dark"] {
  color-scheme: dark;
  ${formatDeclarations(theme, "dark")}
}
`).join("\n")}
`;
		/** 注入 style 标签的 data 锚（幂等判据，也是浏览器探针可观察的自报面）。 */
		const STYLE_ANCHOR = "sanbaoTokens";
		/**
		* 幂等注入 `--sanbao-*` token（与 ensureLuteTokens 同一形状）。
		* @returns 注入的标签（本次未注入时返回既有标签；无 document 时返回 undefined）。
		*/
		function ensureSanbaoTokens(doc = typeof document !== "undefined" ? document : void 0) {
			if (!doc) return void 0;
			const existing = doc.querySelector(`style[data-sanbao-tokens="${STYLE_ANCHOR}"]`);
			if (existing !== null) return existing;
			const style = doc.createElement("style");
			style.dataset.sanbaoTokens = STYLE_ANCHOR;
			style.textContent = SANBAO_TOKEN_CSS;
			doc.head.append(style);
			return style;
		}
		//#endregion
		//#region src/client/persistence.ts
		const THEME_STUDIO_STORAGE_KEY = "dsh-theme/settings/v1";
		const THEME_PREFS_STORAGE_KEY = "dsh-theme/prefs/v1";
		const APPEARANCE_STORAGE_KEY = "dsh-theme/appearance/v1";
		const DEFAULT_THEME_STUDIO_PREFS = {
			reduceMotion: "system",
			fontSmoothing: false
		};
		const DEFAULT_SAVED_APPEARANCE = {
			mode: "system",
			theme: "forest-green",
			fontScale: 1,
			reducedMotion: false
		};
		function browserThemeStudioStorage() {
			try {
				return globalThis.localStorage;
			} catch {
				return;
			}
		}
		function loadSavedAppearance(storage = browserThemeStudioStorage()) {
			const fallback = { ...DEFAULT_SAVED_APPEARANCE };
			if (storage === void 0) return fallback;
			try {
				const raw = storage.getItem(APPEARANCE_STORAGE_KEY);
				if (raw === null) return fallback;
				const parsed = JSON.parse(raw);
				if (parsed === null || typeof parsed !== "object") return fallback;
				const record = parsed;
				return {
					mode: record.mode === "light" || record.mode === "dark" || record.mode === "system" ? record.mode : fallback.mode,
					theme: record.theme === "parchment" || record.theme === "warm-pink" || record.theme === "forest-green" ? record.theme : fallback.theme,
					fontScale: typeof record.fontScale === "number" && !Number.isNaN(record.fontScale) && record.fontScale >= .5 && record.fontScale <= 2 ? record.fontScale : fallback.fontScale,
					reducedMotion: typeof record.reducedMotion === "boolean" ? record.reducedMotion : fallback.reducedMotion
				};
			} catch {
				return fallback;
			}
		}
		function saveAppearance(appearance, storage = browserThemeStudioStorage()) {
			if (storage === void 0) return false;
			try {
				storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
				return true;
			} catch {
				return false;
			}
		}
		function resolveSystemMode() {
			try {
				if (typeof window !== "undefined" && typeof window.matchMedia === "function") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
			} catch {}
			return "light";
		}
		function resolveEffectiveMode(mode) {
			if (mode === "light") return "light";
			if (mode === "dark") return "dark";
			return resolveSystemMode();
		}
		function loadThemeStudioSettings(storage) {
			if (storage === void 0) return { ...DEFAULT_THEME_STUDIO_SETTINGS };
			try {
				const raw = storage.getItem(THEME_STUDIO_STORAGE_KEY);
				if (raw === null) return { ...DEFAULT_THEME_STUDIO_SETTINGS };
				const parsed = JSON.parse(raw);
				const decoded = decodeThemeStudioSettings(parsed);
				if (decoded === void 0) return { ...DEFAULT_THEME_STUDIO_SETTINGS };
				if (JSON.stringify(decoded) !== JSON.stringify(parsed)) saveThemeStudioSettings(storage, decoded);
				return decoded;
			} catch {
				return { ...DEFAULT_THEME_STUDIO_SETTINGS };
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
		//#region src/client/presets.ts
		const THEME_PRESETS = [
			{
				id: "codex",
				palette: {
					lightAccent: "#347A2F",
					lightBackground: "#F6F7F4",
					lightForeground: "#1E221F",
					lightSurface: "#FFFFFF",
					lightInlineCode: "#EEF1EC",
					lightSidebar: "#F1F4EF",
					darkAccent: "#58B848",
					darkBackground: "#171A17",
					darkForeground: "#F1F4F0",
					darkSurface: "#202420",
					darkInlineCode: "#292D29",
					darkSidebar: "#191C1A"
				},
				typography: {
					uiFont: "system",
					codeFont: "sf-mono",
					uiFontSize: 14,
					codeFontSize: 12
				}
			},
			{
				id: "proof",
				palette: {
					lightAccent: "#3D755D",
					lightBackground: "#FAF9F6",
					lightForeground: "#292D29",
					lightSurface: "#FFFFFF",
					lightInlineCode: "#EDEDEA",
					lightSidebar: "#FAF9F6",
					darkAccent: "#83B69D",
					darkBackground: "#171A17",
					darkForeground: "#E8EBE6",
					darkSurface: "#222622",
					darkInlineCode: "#2C2F2C",
					darkSidebar: "#171A17"
				},
				typography: {
					uiFont: "serif",
					codeFont: "menlo",
					uiFontSize: 15,
					codeFontSize: 13
				}
			},
			{
				id: "everforest",
				palette: {
					lightAccent: "#4E713F",
					lightBackground: "#F8FAF6",
					lightForeground: "#303A32",
					lightSurface: "#FFFFFF",
					lightInlineCode: "#ECEEEA",
					lightSidebar: "#F8FAF6",
					darkAccent: "#A7C080",
					darkBackground: "#181C1A",
					darkForeground: "#E1E5DC",
					darkSurface: "#222724",
					darkInlineCode: "#2C302D",
					darkSidebar: "#181C1A"
				},
				typography: {
					uiFont: "rounded",
					codeFont: "jetbrains",
					uiFontSize: 14,
					codeFontSize: 13
				}
			},
			{
				id: "github",
				palette: {
					lightAccent: "#0969DA",
					lightBackground: "#FFFFFF",
					lightForeground: "#1F2328",
					lightSurface: "#F6F8FA",
					lightInlineCode: "#F2F2F2",
					lightSidebar: "#FFFFFF",
					darkAccent: "#58A6FF",
					darkBackground: "#0D1117",
					darkForeground: "#E6EDF3",
					darkSurface: "#161B22",
					darkInlineCode: "#23272D",
					darkSidebar: "#0D1117"
				},
				typography: {
					uiFont: "system",
					codeFont: "sf-mono",
					uiFontSize: 14,
					codeFontSize: 12
				}
			},
			{
				id: "gruvbox",
				palette: {
					lightAccent: "#8F4F18",
					lightBackground: "#FAF8F1",
					lightForeground: "#352F2B",
					lightSurface: "#FFFFFF",
					lightInlineCode: "#EEECE5",
					lightSidebar: "#FAF8F1",
					darkAccent: "#D7995B",
					darkBackground: "#1F1F1D",
					darkForeground: "#F2E6C9",
					darkSurface: "#2A2926",
					darkInlineCode: "#34332E",
					darkSidebar: "#1F1F1D"
				},
				typography: {
					uiFont: "avenir",
					codeFont: "menlo",
					uiFontSize: 15,
					codeFontSize: 13
				}
			},
			{
				id: "linear",
				palette: {
					lightAccent: "#5864C7",
					lightBackground: "#FFFFFF",
					lightForeground: "#252A35",
					lightSurface: "#F6F7FA",
					lightInlineCode: "#F2F2F3",
					lightSidebar: "#FFFFFF",
					darkAccent: "#8C97FF",
					darkBackground: "#15161B",
					darkForeground: "#E6E9EF",
					darkSurface: "#202127",
					darkInlineCode: "#2A2B30",
					darkSidebar: "#15161B"
				},
				typography: {
					uiFont: "inter",
					codeFont: "jetbrains",
					uiFontSize: 14,
					codeFontSize: 13
				}
			},
			{
				id: "notion",
				palette: {
					lightAccent: "#1969AA",
					lightBackground: "#FFFFFF",
					lightForeground: "#37352F",
					lightSurface: "#F7F7F5",
					lightInlineCode: "#F3F3F3",
					lightSidebar: "#FFFFFF",
					darkAccent: "#5A9DDE",
					darkBackground: "#191919",
					darkForeground: "#E5E5E4",
					darkSurface: "#242424",
					darkInlineCode: "#2D2D2D",
					darkSidebar: "#191919"
				},
				typography: {
					uiFont: "system",
					codeFont: "sf-mono",
					uiFontSize: 14,
					codeFontSize: 12
				}
			},
			{
				id: "raycast",
				palette: {
					lightAccent: "#0A6BC0",
					lightBackground: "#FFFFFF",
					lightForeground: "#181818",
					lightSurface: "#F7F7F7",
					lightInlineCode: "#F1F1F1",
					lightSidebar: "#FFFFFF",
					darkAccent: "#4FA3F8",
					darkBackground: "#141414",
					darkForeground: "#F2F2F2",
					darkSurface: "#1F1F1F",
					darkInlineCode: "#2A2A2A",
					darkSidebar: "#141414"
				},
				typography: {
					uiFont: "system",
					codeFont: "sf-mono",
					uiFontSize: 14,
					codeFontSize: 12
				}
			},
			{
				id: "rosePine",
				palette: {
					lightAccent: "#A14F5D",
					lightBackground: "#FAF8F7",
					lightForeground: "#433E5D",
					lightSurface: "#FFFFFF",
					lightInlineCode: "#EFEDEE",
					lightSidebar: "#FAF8F7",
					darkAccent: "#EA9A97",
					darkBackground: "#201E2C",
					darkForeground: "#E0DEF4",
					darkSurface: "#2A2738",
					darkInlineCode: "#333140",
					darkSidebar: "#201E2C"
				},
				typography: {
					uiFont: "avenir",
					codeFont: "fira-code",
					uiFontSize: 15,
					codeFontSize: 13
				}
			},
			{
				id: "graphite",
				palette: {
					lightAccent: "#8A1C1C",
					lightBackground: "#FCFCFC",
					lightForeground: "#111111",
					lightSurface: "#F3F3F3",
					lightInlineCode: "#EDEDED",
					lightSidebar: "#F3F3F3",
					darkAccent: "#E08A8A",
					darkBackground: "#171717",
					darkForeground: "#F1F1F1",
					darkSurface: "#222222",
					darkInlineCode: "#2C2C2C",
					darkSidebar: "#222222"
				},
				typography: {
					uiFont: "avenir",
					codeFont: "menlo",
					uiFontSize: 15,
					codeFontSize: 13
				}
			},
			{
				id: "editorial",
				palette: {
					lightAccent: "#065588",
					lightBackground: "#F3F2EE",
					lightForeground: "#2F2C29",
					lightSurface: "#E8E7DF",
					lightInlineCode: "#DAD8D0",
					lightSidebar: "#E8E7DF",
					darkAccent: "#7CC4E4",
					darkBackground: "#211C1A",
					darkForeground: "#F1E8DF",
					darkSurface: "#2C2522",
					darkInlineCode: "#352D29",
					darkSidebar: "#2C2522"
				},
				typography: {
					uiFont: "serif",
					codeFont: "menlo",
					uiFontSize: 16,
					codeFontSize: 13
				}
			},
			{
				id: "midnight",
				palette: {
					lightAccent: "#216A8A",
					lightBackground: "#F7F9FA",
					lightForeground: "#202B33",
					lightSurface: "#EDF1F3",
					lightInlineCode: "#E3E8EB",
					lightSidebar: "#EDF1F3",
					darkAccent: "#6DC1E7",
					darkBackground: "#363B40",
					darkForeground: "#F2F5F7",
					darkSurface: "#474D54",
					darkInlineCode: "#2E3033",
					darkSidebar: "#2E3033"
				},
				typography: {
					uiFont: "system",
					codeFont: "sf-mono",
					uiFontSize: 15,
					codeFontSize: 13
				}
			},
			{
				id: "folio",
				palette: {
					lightAccent: "#36598A",
					lightBackground: "#FFFFFF",
					lightForeground: "#2E2E33",
					lightSurface: "#F8F8F8",
					lightInlineCode: "#EDEDED",
					lightSidebar: "#F8F8F8",
					darkAccent: "#8CB4E8",
					darkBackground: "#1E2025",
					darkForeground: "#F1F2F4",
					darkSurface: "#292C32",
					darkInlineCode: "#333740",
					darkSidebar: "#292C32"
				},
				typography: {
					uiFont: "serif",
					codeFont: "menlo",
					uiFontSize: 16,
					codeFontSize: 13
				}
			},
			{
				id: "porcelain",
				palette: {
					lightAccent: "#176895",
					lightBackground: "#FEFEFE",
					lightForeground: "#2F2F2F",
					lightSurface: "#F8F8F8",
					lightInlineCode: "#EEEEEE",
					lightSidebar: "#F8F8F8",
					darkAccent: "#71B7E3",
					darkBackground: "#18191B",
					darkForeground: "#F2F2F2",
					darkSurface: "#242629",
					darkInlineCode: "#2E3033",
					darkSidebar: "#242629"
				},
				typography: {
					uiFont: "serif",
					codeFont: "menlo",
					uiFontSize: 16,
					codeFontSize: 13
				}
			},
			{
				id: "carbon",
				palette: {
					lightAccent: "#2D65A3",
					lightBackground: "#FAFBFC",
					lightForeground: "#252932",
					lightSurface: "#F0F2F5",
					lightInlineCode: "#E7EAF0",
					lightSidebar: "#ECEFF3",
					darkAccent: "#61AFEF",
					darkBackground: "#282C34",
					darkForeground: "#D7DAE0",
					darkSurface: "#2C313C",
					darkInlineCode: "#1D1F23",
					darkSidebar: "#21252B"
				},
				typography: {
					uiFont: "system",
					codeFont: "fira-code",
					uiFontSize: 14,
					codeFontSize: 13
				}
			}
		];
		function getThemePreset(id) {
			const preset = THEME_PRESETS.find((candidate) => candidate.id === id);
			if (preset === void 0) throw new Error(`Unknown theme preset: ${id}`);
			return preset;
		}
		function themePresetSettings(id) {
			const preset = getThemePreset(id);
			return {
				lightContrast: 50,
				darkContrast: 50,
				...preset.palette,
				...preset.typography
			};
		}
		//#endregion
		//#region src/client/store.ts
		function createThemeStudioStore(initialSettings = DEFAULT_THEME_STUDIO_SETTINGS, initialPrefs = DEFAULT_THEME_STUDIO_PREFS) {
			return (0, _deepseek_ai_dsh_client_store.defineStore)({
				init: () => ({
					activeScheme: "light",
					preference: "system",
					prefs: { ...initialPrefs },
					saveStatus: "idle",
					settings: { ...initialSettings }
				}),
				actions: {
					syncSettings: (draft, settings) => {
						draft.settings = { ...settings };
					},
					syncPrefs: (draft, prefs) => {
						draft.prefs = { ...prefs };
					},
					syncTheme: (draft, preference, activeScheme) => {
						draft.preference = preference;
						draft.activeScheme = activeScheme;
					},
					setSaveStatus: (draft, status) => {
						draft.saveStatus = status;
					}
				}
			});
		}
		//#endregion
		//#region src/client/theme-controller.ts
		var AppearanceController = class {
			state;
			listeners = /* @__PURE__ */ new Set();
			doc;
			storage;
			mediaQuery;
			mediaListener;
			constructor(options = {}) {
				this.doc = options.doc ?? (typeof document !== "undefined" ? document : void 0);
				this.storage = options.storage ?? browserThemeStudioStorage();
				const saved = loadSavedAppearance(this.storage);
				const mode = options.initialState?.mode ?? saved.mode;
				const theme = options.initialState?.theme ?? saved.theme;
				const fontScale = options.initialState?.fontScale ?? saved.fontScale;
				const reducedMotion = options.initialState?.reducedMotion ?? saved.reducedMotion;
				this.state = {
					mode,
					theme,
					effectiveMode: resolveEffectiveMode(mode),
					fontScale,
					reducedMotion
				};
				this.setupSystemMediaListener();
				this.applyToDOM();
			}
			getState() {
				return { ...this.state };
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			setMode(mode) {
				if (!APPEARANCE_MODES.includes(mode)) return;
				if (this.state.mode === mode) return;
				this.state.mode = mode;
				this.state.effectiveMode = resolveEffectiveMode(mode);
				this.persist();
				this.applyToDOM();
				this.notify();
			}
			setTheme(theme) {
				if (!SEASONAL_THEMES.includes(theme)) return;
				if (this.state.theme === theme) return;
				this.state.theme = theme;
				this.persist();
				this.applyToDOM();
				this.notify();
			}
			setFontScale(scale) {
				const clamped = Math.min(2, Math.max(.5, Math.round(scale * 100) / 100));
				if (this.state.fontScale === clamped) return;
				this.state.fontScale = clamped;
				this.persist();
				this.applyToDOM();
				this.notify();
			}
			setReducedMotion(reduced) {
				if (this.state.reducedMotion === reduced) return;
				this.state.reducedMotion = reduced;
				this.persist();
				this.applyToDOM();
				this.notify();
			}
			updateAppearance(patch) {
				let changed = false;
				if (patch.mode !== void 0 && APPEARANCE_MODES.includes(patch.mode) && this.state.mode !== patch.mode) {
					this.state.mode = patch.mode;
					this.state.effectiveMode = resolveEffectiveMode(patch.mode);
					changed = true;
				}
				if (patch.theme !== void 0 && SEASONAL_THEMES.includes(patch.theme) && this.state.theme !== patch.theme) {
					this.state.theme = patch.theme;
					changed = true;
				}
				if (patch.fontScale !== void 0) {
					const clamped = Math.min(2, Math.max(.5, Math.round(patch.fontScale * 100) / 100));
					if (this.state.fontScale !== clamped) {
						this.state.fontScale = clamped;
						changed = true;
					}
				}
				if (patch.reducedMotion !== void 0 && this.state.reducedMotion !== patch.reducedMotion) {
					this.state.reducedMotion = patch.reducedMotion;
					changed = true;
				}
				if (changed) {
					this.persist();
					this.applyToDOM();
					this.notify();
				}
			}
			applyToDOM() {
				const doc = this.doc;
				if (!doc) return;
				ensureSanbaoTokens(doc);
				if (doc.documentElement) {
					doc.documentElement.setAttribute("data-sanbao-mode", this.state.effectiveMode);
					doc.documentElement.setAttribute("data-sanbao-theme", this.state.theme);
					doc.documentElement.style.setProperty("--sanbao-font-scale", String(this.state.fontScale));
				}
				if (doc.body) {
					doc.body.setAttribute("data-sanbao-mode", this.state.effectiveMode);
					doc.body.setAttribute("data-sanbao-theme", this.state.theme);
					if (this.state.reducedMotion) doc.body.setAttribute("data-lute-reduce-motion", "reduce");
					else doc.body.removeAttribute("data-lute-reduce-motion");
				}
			}
			persist() {
				saveAppearance({
					mode: this.state.mode,
					theme: this.state.theme,
					fontScale: this.state.fontScale,
					reducedMotion: this.state.reducedMotion
				}, this.storage);
			}
			notify() {
				const snapshot = this.getState();
				for (const listener of this.listeners) try {
					listener(snapshot);
				} catch {}
			}
			setupSystemMediaListener() {
				if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
				try {
					this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
					this.mediaListener = (e) => {
						if (this.state.mode === "system") {
							const nextEffective = e.matches ? "dark" : "light";
							if (this.state.effectiveMode !== nextEffective) {
								this.state.effectiveMode = nextEffective;
								this.applyToDOM();
								this.notify();
							}
						}
					};
					if (typeof this.mediaQuery.addEventListener === "function") this.mediaQuery.addEventListener("change", this.mediaListener);
					else if (typeof this.mediaQuery.addListener === "function") this.mediaQuery.addListener(this.mediaListener);
				} catch {}
			}
			dispose() {
				if (this.mediaQuery && this.mediaListener) {
					if (typeof this.mediaQuery.removeEventListener === "function") this.mediaQuery.removeEventListener("change", this.mediaListener);
					else if (typeof this.mediaQuery.removeListener === "function") this.mediaQuery.removeListener(this.mediaListener);
				}
				this.listeners.clear();
			}
		};
		//#endregion
		//#region src/client/ThemeStudio.tsx
		const THEME_METADATA = {
			parchment: {
				title: "羊皮纸",
				season: "秋 · 羊皮纸",
				description: "经典沉浸暖纸风，复古温暖"
			},
			"warm-pink": {
				title: "暖白粉",
				season: "春 · 暖白粉",
				description: "三宝品牌原生活力风，温柔晨曦"
			},
			"forest-green": {
				title: "森林绿",
				season: "夏 · 森林绿",
				description: "Qoder CN 极客灰绿风，清凉自然"
			}
		};
		const MODE_LABELS = {
			light: "浅色",
			dark: "深色",
			system: "跟随系统"
		};
		const FONT_SCALE_STEPS = [
			.9,
			1,
			1.1,
			1.2,
			1.3
		];
		function ThemeStudio({ controller: customController, t = (k) => k }) {
			const [controller] = react.useState(() => customController ?? new AppearanceController());
			const [state, setState] = react.useState(() => controller.getState());
			react.useEffect(() => {
				return controller.subscribe((next) => {
					setState(next);
				});
			}, [controller]);
			const effectiveMode = state.effectiveMode;
			const currentScalePercent = Math.round(state.fontScale * 100);
			const scaleIndex = FONT_SCALE_STEPS.findIndex((s) => Math.abs(Math.round(s * 100) - currentScalePercent) < 2);
			const canDecrease = scaleIndex > 0;
			const canIncrease = scaleIndex >= 0 && scaleIndex < FONT_SCALE_STEPS.length - 1;
			const handleDecreaseScale = () => {
				if (scaleIndex > 0) {
					const nextScale = FONT_SCALE_STEPS[scaleIndex - 1];
					if (nextScale !== void 0) controller.setFontScale(nextScale);
				}
			};
			const handleIncreaseScale = () => {
				if (scaleIndex >= 0 && scaleIndex < FONT_SCALE_STEPS.length - 1) {
					const nextScale = FONT_SCALE_STEPS[scaleIndex + 1];
					if (nextScale !== void 0) controller.setFontScale(nextScale);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-appearance-studio": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("header", {
					"data-appearance-header": true,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "外观" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "自定义界面配色模式、季节主题与阅读排版" })] })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					"data-appearance-content": true,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							"data-appearance-card": true,
							"data-card": "mode",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								"data-appearance-card-header": true,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "外观模式" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "选择浅色、深色或根据操作系统外观自动切换" })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								"aria-label": "外观模式",
								"data-appearance-mode-segment": true,
								role: "radiogroup",
								children: APPEARANCE_MODES.map((mode) => {
									const selected = state.mode === mode;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										"data-appearance-mode-option": true,
										"data-selected": selected ? "true" : "false",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											checked: selected,
											"data-appearance-sr": true,
											name: "appearance-mode",
											type: "radio",
											value: mode,
											onChange: () => controller.setMode(mode)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: MODE_LABELS[mode] })]
									}, mode);
								})
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							"data-appearance-card": true,
							"data-card": "themes",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								"data-appearance-card-header": true,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "季节主题" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "选择 3 套自然季节主题调色板（羊皮纸·秋 / 暖白粉·春 / 森林绿·夏）" })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								"aria-label": "季节主题",
								"data-appearance-seasonal-grid": true,
								role: "radiogroup",
								children: SEASONAL_THEMES.map((themeKey) => {
									const selected = state.theme === themeKey;
									const meta = THEME_METADATA[themeKey];
									const paletteKey = `${themeKey}-${effectiveMode}`;
									const palette = SANBAO_PALETTES[paletteKey] ?? SANBAO_PALETTES["forest-green-light"];
									const chips = [
										palette.canvas,
										palette.panel,
										palette.accent,
										palette.foreground
									];
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										"data-appearance-theme-card": true,
										"data-theme": themeKey,
										"data-selected": selected ? "true" : "false",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											checked: selected,
											"data-appearance-sr": true,
											name: "seasonal-theme",
											type: "radio",
											value: themeKey,
											onChange: () => controller.setTheme(themeKey)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											"data-appearance-theme-card-body": true,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													"data-appearance-theme-card-header": true,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														"data-appearance-theme-title": true,
														children: meta.title
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														"data-appearance-theme-season": true,
														children: meta.season
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													"data-appearance-swatch-strip": true,
													"aria-hidden": "true",
													children: chips.map((c, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														"data-appearance-swatch-chip": true,
														style: { backgroundColor: c }
													}, i))
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													"data-appearance-theme-desc": true,
													children: meta.description
												})
											]
										})]
									}, themeKey);
								})
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							"data-appearance-card": true,
							"data-card": "typography",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								"data-appearance-card-header": true,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "字体与排版" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "调整界面显示缩放比例与动效偏好" })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								"data-appearance-typography": true,
								"data-appearance-setting-list": true,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"data-appearance-setting-row": true,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										"data-appearance-setting-copy": true,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "字号缩放" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "调整正文、界面与代码字号比例（90% ~ 130%）" })]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										"data-appearance-stepper-control": true,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												"aria-label": "减小字号",
												"data-appearance-stepper-button": true,
												disabled: !canDecrease,
												type: "button",
												onClick: handleDecreaseScale,
												children: "−"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												"data-appearance-stepper-value": true,
												children: [currentScalePercent, "%"]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												"aria-label": "增大字号",
												"data-appearance-stepper-button": true,
												disabled: !canIncrease,
												type: "button",
												onClick: handleIncreaseScale,
												children: "+"
											})
										]
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"data-appearance-setting-row": true,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										"data-appearance-setting-copy": true,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "减弱动态效果" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "关闭或减少界面过渡动效与动画" })]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										"aria-checked": state.reducedMotion,
										"aria-label": "减弱动态效果",
										"data-appearance-switch": true,
										role: "switch",
										type: "button",
										onClick: () => controller.setReducedMotion(!state.reducedMotion),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											"aria-hidden": "true",
											"data-appearance-switch-thumb": true
										})
									})]
								})]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							"data-appearance-card": true,
							"data-card": "preview",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								"data-appearance-card-header": true,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "实时预览" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "即时感知当前外观模式、季节色彩与排版呈现" })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								"data-appearance-live-preview": true,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									"data-appearance-preview-card": true,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											"data-appearance-preview-banner": true,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
												"data-appearance-preview-title": true,
												children: "LUTE Agentic System"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												"data-appearance-preview-badge": true,
												children: "已就绪"
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
											"data-appearance-preview-desc": true,
											children: [
												"当前激活主题：",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: THEME_METADATA[state.theme].season }),
												"（",
												effectiveMode === "dark" ? "暗色模式" : "浅色模式",
												"）· 缩放比例 ",
												currentScalePercent,
												"%"
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											"data-appearance-preview-actions": true,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													"data-appearance-button": true,
													"data-variant": "primary",
													type: "button",
													children: "主要操作"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													"data-appearance-button": true,
													"data-variant": "secondary",
													type: "button",
													children: "次要操作"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
													"data-appearance-preview-code": true,
													children: "pnpm run gate"
												})
											]
										})
									]
								})
							})]
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/theme-tokens.ts
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
		function same(value) {
			return {
				light: value,
				dark: value
			};
		}
		function scaled(value, delta) {
			return Math.max(9, value + delta);
		}
		function font(size, lineHeight, delta, family, weight, style) {
			return [
				style,
				weight,
				`${scaled(size, delta)}px/${scaled(lineHeight, delta)}px`,
				family
			].filter((part) => part !== void 0).join(" ");
		}
		function typography(settings) {
			const uiDelta = settings.uiFontSize - 14;
			const codeDelta = settings.codeFontSize - 12;
			const uiFamily = UI_FONT_STACKS[settings.uiFont];
			const codeFamily = CODE_FONT_STACKS[settings.codeFont];
			const ui = (size, lineHeight, weight, style) => same(font(size, lineHeight, uiDelta, "var(--dsw-font-family)", weight, style));
			const code = (size, lineHeight) => same(font(size, lineHeight, codeDelta, "var(--ds-font-family-code)"));
			return {
				"--dsw-font-family": same(uiFamily),
				"--ds-font-family-code": same(codeFamily),
				"--dsw-font-mono": same(codeFamily),
				"--dsw-font-xl-24": ui(24, 32, 600),
				"--dsw-font-l-20": ui(20, 28, 500),
				"--dsw-font-m-18": ui(16, 28, 500),
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
				"--dsw-font-markdown-h2": ui(22, 32, 700),
				"--dsw-font-markdown-h3": ui(20, 30, 700),
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
				"--dsw-font-markdown-code-block": code(13, 22),
				"--dsw-font-markdown-code-block-small": code(12, 18)
			};
		}
		function palette(settings, mode) {
			const prefix = mode === "light" ? "light" : "dark";
			const factor = .6 + .8 * (settings[`${prefix}Contrast`] / 100);
			const borderFactor = .75 + .5 * (settings[`${prefix}Contrast`] / 100);
			return {
				accent: settings[`${prefix}Accent`],
				background: settings[`${prefix}Background`],
				foreground: settings[`${prefix}Foreground`],
				surface: settings[`${prefix}Surface`],
				inlineCode: settings[`${prefix}InlineCode`],
				sidebar: settings[`${prefix}Sidebar`],
				scale: (amount) => Math.round(amount * factor),
				borderFactor
			};
		}
		function mix(first, amount, second) {
			return `color-mix(in oklch, ${first} ${amount}%, ${second})`;
		}
		/**
		* The four border levels exactly as Harness ships them, verbatim from
		* `@deepseek-ai/dsh-client-ui-theme` (`--dsw-alias-border-l{1..4}` on `body`
		* and `body[data-ds-dark-theme]`). Kept as hex so the next edit has to argue
		* with the source rather than with a hand-typed percentage.
		*/
		const HARNESS_BORDER_OVERLAYS = {
			light: [
				"#0000000a",
				"#0000001a",
				"#0000001f",
				"#00000029"
			],
			dark: [
				"#ffffff0f",
				"#ffffff1f",
				"#ffffff29",
				"#ffffff33"
			]
		};
		/**
		* A border level as a **translucent overlay** at `factor` times the Harness
		* baseline alpha.
		*
		* Overlay rather than an opaque blend is the point, and it was measured: an
		* opaque `color-mix(in oklch, #FFF n%, <background>)` moves perceptual
		* lightness n% of the way to white, which lands 1.18–1.59x heavier than
		* Harness intends — worst on l1, which carries 60% of the app's borders
		* (172 of 285 in the audited window). Alpha also keeps a stroke correct on
		* layer-1/layer-2 surfaces instead of only on the base background, which is
		* why every border token in the systems surveyed is an alpha step.
		*/
		function borderOverlay(mode, level, factor) {
			const rgb = mode === "light" ? "0 0 0" : "255 255 255";
			const base = parseInt(HARNESS_BORDER_OVERLAYS[mode][level].slice(7, 9), 16) / 255;
			return `rgb(${rgb} / ${Math.round(base * factor * 1e3) / 1e3})`;
		}
		function buildThemeTokenOverrides(settings) {
			const light = palette(settings, "light");
			const dark = palette(settings, "dark");
			const pair = (getValue) => ({
				light: getValue(light),
				dark: getValue(dark)
			});
			const border = (level) => ({
				light: borderOverlay("light", level, light.borderFactor),
				dark: borderOverlay("dark", level, dark.borderFactor)
			});
			return {
				...typography(settings),
				"--dsw-alias-bg-base": pair((colors) => colors.background),
				"--dsw-alias-bg-layer-1": pair((colors) => colors.surface),
				"--dsw-alias-bg-layer-2": {
					light: mix(light.background, light.scale(30), "#FFFFFF"),
					dark: mix("#FFFFFF", dark.scale(6), dark.surface)
				},
				"--dsw-alias-bg-layer-3": {
					light: mix(light.background, light.scale(15), "#FFFFFF"),
					dark: mix("#FFFFFF", dark.scale(10), dark.surface)
				},
				"--dsw-alias-bg-module-platform": {
					light: mix("#000000", light.scale(4), light.surface),
					dark: mix("#FFFFFF", dark.scale(6), dark.surface)
				},
				"--dsw-alias-bg-overlay": {
					light: mix(light.background, light.scale(10), "#FFFFFF"),
					dark: mix("#FFFFFF", dark.scale(12), dark.surface)
				},
				"--dsw-alias-border-l1": border(0),
				"--dsw-alias-border-l2": border(1),
				"--dsw-alias-border-l3": border(2),
				"--dsw-alias-border-l4": border(3),
				"--dsw-alias-brand-primary": pair((colors) => colors.accent),
				"--dsw-alias-button-info-fill": pair((colors) => colors.accent),
				"--dsw-alias-button-info-hover": {
					light: mix(light.accent, 86, light.foreground),
					dark: mix(dark.accent, 82, dark.background)
				},
				"--dsw-alias-label-primary": pair((colors) => colors.foreground),
				"--dsw-alias-label-secondary": pair((colors) => mix(colors.foreground, colors.scale(62), colors.background)),
				"--dsw-alias-label-tertiary": pair((colors) => mix(colors.foreground, colors.scale(50), colors.background)),
				"--dsw-alias-label-caption": pair((colors) => mix(colors.foreground, colors.scale(40), colors.background)),
				"--dsw-alias-label-dimmed": pair((colors) => mix(colors.foreground, colors.scale(28), colors.background)),
				"--dsw-alias-markdown-inline-code": pair((colors) => colors.inlineCode),
				"--dsw-alias-state-business-primary": pair((colors) => colors.accent),
				"--dsw-alias-state-business-tertiary": pair((colors) => mix(colors.accent, 12, colors.background)),
				"--dsw-alias-interactive-bg-hover": {
					light: mix("#000000", light.scale(5), light.background),
					dark: mix("#FFFFFF", dark.scale(7), dark.background)
				},
				"--dsw-alias-interactive-bg-hover-solid": {
					light: mix("#000000", light.scale(5), light.surface),
					dark: mix("#FFFFFF", dark.scale(7), dark.surface)
				},
				"--dsw-alias-interactive-bg-hover-accent": pair((colors) => mix(colors.accent, 10, colors.background)),
				"--dsw-alias-interactive-bg-active": {
					light: mix("#000000", light.scale(9), light.background),
					dark: mix("#FFFFFF", dark.scale(11), dark.background)
				},
				"--dsw-specific-sidebar-fill": pair((colors) => colors.sidebar),
				"--dsw-specific-sidebar-nav-item-active-accent": pair((colors) => mix(colors.accent, 12, colors.sidebar)),
				"--dsw-specific-sidebar-nav-item-active": {
					light: mix("#000000", light.scale(9), light.sidebar),
					dark: mix("#FFFFFF", dark.scale(11), dark.sidebar)
				},
				"--dsw-specific-sidebar-nav-item-hover": {
					light: mix("#000000", light.scale(5), light.sidebar),
					dark: mix("#FFFFFF", dark.scale(7), dark.sidebar)
				},
				"--dsw-specific-bubble": pair((colors) => mix(colors.accent, 10, colors.background)),
				"--dsw-specific-bubble-highlight": pair((colors) => mix(colors.accent, 20, colors.background)),
				"--dsw-static-deepseek-500": pair((colors) => colors.accent),
				"--dsw-static-deepseek-450": pair((colors) => colors.accent),
				"--dsw-static-deepseek-200": pair((colors) => mix(colors.accent, 36, colors.background))
			};
		}
		//#endregion
		//#region src/client/index.tsx
		const THEME_SOURCE = "dsh-theme";
		/**
		* LOCAL ADAPTATION: tokens inside the Desktop's `overrideTokens` contract
		* (verified against the live Theme Inspect token directory) keep using the
		* official stacking API. Every other token the plugin models is applied as
		* a plain CSS custom property through one injected stylesheet, because the
		* 0.1.2-alpha.1 runtime defines the full `--dsw-*` variable surface on
		* `:root` and `body[data-ds-dark-theme]` and the components consume the
		* variables directly.
		*/
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
		const inject = [
			"slots",
			"locale",
			"theme"
		];
		function apply(ctx) {
			const storage = browserThemeStudioStorage();
			let currentSettings = loadThemeStudioSettings(storage);
			let currentPrefs = loadThemeStudioPrefs(storage);
			const store = createThemeStudioStore(currentSettings, currentPrefs);
			let actions;
			let releaseOverride = () => {};
			let cssTag;
			let prefsTag;
			let motionQuery;
			const applyCssVars = (tokens) => {
				if (cssTag !== void 0) {
					cssTag.remove();
					cssTag = void 0;
				}
				const names = Object.keys(tokens);
				if (names.length === 0) return;
				const light = [];
				const dark = [];
				for (const name of names) {
					const pair = tokens[name];
					if (pair === void 0) continue;
					light.push(`${name}: ${pair.light};`);
					dark.push(`${name}: ${pair.dark};`);
				}
				const css = `:root { ${light.join(" ")} }body[data-ds-dark-theme] { ${dark.join(" ")} }`;
				cssTag = document.createElement("style");
				cssTag.dataset.plugin = THEME_SOURCE;
				cssTag.dataset.pluginCss = `${THEME_SOURCE}/token-vars`;
				cssTag.textContent = css;
				document.head.appendChild(cssTag);
			};
			const applyPrefs = () => {
				const body = document.body;
				const attributes = prefsAttributes(currentPrefs, motionQuery?.matches ?? false);
				if (attributes.reduceMotion) body.dataset.luteReduceMotion = "reduce";
				else delete body.dataset.luteReduceMotion;
				if (attributes.fontSmoothing) body.dataset.luteFontSmoothing = "on";
				else delete body.dataset.luteFontSmoothing;
			};
			const syncStore = () => {
				actions?.syncSettings(currentSettings);
				actions?.syncPrefs(currentPrefs);
			};
			const applyPreview = () => {
				const overrides = buildThemeTokenOverrides(currentSettings);
				const contract = {};
				const cssVars = {};
				for (const [token, pair] of Object.entries(overrides)) if (CONTRACT_TOKEN_NAMES.has(token)) contract[token] = pair;
				else cssVars[token] = pair;
				const nextRelease = ctx.theme.overrideTokens(THEME_SOURCE, contract);
				releaseOverride();
				releaseOverride = nextRelease;
				applyCssVars(cssVars);
			};
			const persist = () => {
				actions?.setSaveStatus("saving");
				actions?.setSaveStatus(saveThemeStudioSettings(storage, currentSettings) ? "idle" : "error");
			};
			const setSetting = (field, value) => {
				currentSettings = {
					...currentSettings,
					[field]: value
				};
				syncStore();
				applyPreview();
				persist();
			};
			const setColor = (field, value) => {
				setSetting(field, value);
			};
			const setContrast = (field, value) => {
				setSetting(field, value);
			};
			const setTypography = (field, value) => {
				setSetting(field, value);
			};
			const applySettings = (settings) => {
				currentSettings = { ...settings };
				syncStore();
				applyPreview();
				persist();
			};
			const setPrefs = (patch) => {
				currentPrefs = {
					...currentPrefs,
					...patch
				};
				syncStore();
				applyPrefs();
				saveThemeStudioPrefs(storage, currentPrefs);
			};
			const applyPreset = (id) => {
				applySettings(themePresetSettings(id));
			};
			const resetTheme = () => {
				applySettings(DEFAULT_THEME_STUDIO_SETTINGS);
			};
			const syncTheme = (snapshot) => {
				const scheme = snapshot.active?.colorScheme ?? "light";
				actions?.syncTheme(snapshot.preference, scheme);
			};
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-theme: dictionaries");
			ctx.on("theme/change", syncTheme);
			ctx.effect(() => {
				applyPreview();
				return () => {
					releaseOverride();
					if (cssTag !== void 0) cssTag.remove();
					cssTag = void 0;
				};
			}, "dsh-theme: live theme override");
			ctx.effect(() => {
				prefsTag = document.createElement("style");
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
					delete document.body.dataset.luteReduceMotion;
					delete document.body.dataset.luteFontSmoothing;
					if (prefsTag !== void 0) prefsTag.remove();
					prefsTag = void 0;
					motionQuery = void 0;
				};
			}, "dsh-theme: presentation prefs");
			const injectProps = (bound) => {
				actions = bound;
				syncStore();
				const snapshot = ctx.theme.getTheme();
				syncTheme(snapshot);
				return {
					applyPreset,
					applySettings,
					resetTheme,
					setColor,
					setContrast,
					setPrefs,
					setTheme: (preference) => ctx.theme.setTheme(preference),
					setTypography
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