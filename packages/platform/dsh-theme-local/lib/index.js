import z from "@deepseek-ai/schemastery";
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
[...THEME_TYPOGRAPHY_FIELDS];
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
/** Schema defaults in .value do not prove a user saved an identity. */
function hasSavedThemeIdentity(user) {
	return Object.hasOwn(recordOf(user), "themeId");
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
//#region src/theme-host.ts
const AppearanceSchema = z.object({
	themeId: z.union([...THEME_IDS]).default("light"),
	uiFont: z.union([...UI_FONT_IDS]).default("system"),
	codeFont: z.union([...CODE_FONT_IDS]).default("sf-mono"),
	uiFontSize: z.union([...UI_FONT_SIZES]).default(14),
	codeFontSize: z.union([...CODE_FONT_SIZES]).default(12)
});
const safeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
/** Generate each request from the current Host value. Only allowed identities/fonts/numbers reach CSS. */
function themeBootRows(section, user, official) {
	const saved = hasSavedThemeIdentity(user) ? decodeThemeStudioSettings(section) : void 0;
	const partial = {};
	if (!saved && user !== null && typeof user === "object" && !Array.isArray(user)) for (const field of THEME_TYPOGRAPHY_FIELDS) {
		if (!Object.hasOwn(user, field)) continue;
		const value = user[field];
		if (decodeThemeStudioSettings({
			...DEFAULT_THEME_STUDIO_SETTINGS,
			[field]: value
		})) Object.assign(partial, { [field]: value });
	}
	const preference = official && typeof official === "object" && "preference" in official ? official.preference : "system";
	const data = {
		saved,
		partial,
		fallback: preference === "light" || preference === "dark" ? preference : "system",
		defaults: DEFAULT_THEME_STUDIO_SETTINGS,
		ids: THEME_IDS,
		uiFonts: UI_FONT_STACKS,
		codeFonts: CODE_FONT_STACKS,
		uiSizeValues: UI_FONT_SIZES,
		codeSizeValues: CODE_FONT_SIZES,
		uiSizes: Object.fromEntries(UI_FONT_SIZES.map((uiFontSize) => [uiFontSize, buildThemeTokenOverrides({
			...DEFAULT_THEME_STUDIO_SETTINGS,
			uiFontSize
		})])),
		codeSizes: Object.fromEntries(CODE_FONT_SIZES.map((codeFontSize) => [codeFontSize, Object.fromEntries(Object.entries(buildThemeTokenOverrides({
			...DEFAULT_THEME_STUDIO_SETTINGS,
			codeFontSize
		})).filter(([key]) => key.includes("markdown-code")))]))
	};
	return [{
		kind: "style",
		text: SANBAO_TOKEN_CSS
	}, {
		kind: "script",
		placement: "body",
		text: `(() => {
      const d = ${safeJson(data)};
      const scheme = d.fallback === 'system' ? (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : d.fallback;
      const fonts = [['uiFont', Object.keys(d.uiFonts)], ['codeFont', Object.keys(d.codeFonts)], ['uiFontSize', d.uiSizeValues], ['codeFontSize', d.codeSizeValues]];
      let settings = d.saved;
      if (!settings) {
        let cached, legacy;
        try { cached = JSON.parse(localStorage.getItem('dsh-theme/settings/v2')); } catch {}
        const valid = cached && d.ids.includes(cached.themeId) && fonts.every(([field, allowed]) => allowed.includes(cached[field]));
        if (valid) settings = cached;
        else {
          try { legacy = JSON.parse(localStorage.getItem('dsh-theme/settings/v1')); } catch {}
          settings = {...d.defaults, themeId: scheme};
          if (legacy) for (const [field, allowed] of fonts) {
            if (allowed.includes(legacy[field])) settings[field] = legacy[field];
          }
        }
        settings = {...settings, ...d.partial};
      }
      document.body.dataset.sanbaoTheme = settings.themeId;
      document.body.dataset.sanbaoInitialScheme = scheme;
      document.body.style.setProperty('color-scheme', settings.themeId === 'dark' ? 'dark' : 'light');
      const tokens = {...d.uiSizes[settings.uiFontSize], ...d.codeSizes[settings.codeFontSize]};
      for (const [key,pair] of Object.entries(tokens)) document.body.style.setProperty(key,pair.light,'important');
      document.body.style.setProperty('--dsw-font-family',d.uiFonts[settings.uiFont],'important');
      document.body.style.setProperty('--ds-font-family-code',d.codeFonts[settings.codeFont],'important');
      document.body.style.setProperty('--dsw-font-mono',d.codeFonts[settings.codeFont],'important');
      document.body.dataset.sanbaoBootTokens = JSON.stringify({
        ...Object.fromEntries(Object.entries(tokens).map(([key,pair]) => [key,pair.light])),
        '--dsw-font-family': d.uiFonts[settings.uiFont],
        '--ds-font-family-code': d.codeFonts[settings.codeFont],
        '--dsw-font-mono': d.codeFonts[settings.codeFont],
        'color-scheme': settings.themeId === 'dark' ? 'dark' : 'light'
      });
    })()`
	}];
}
//#endregion
//#region src/index.ts
const name = "dsh-theme";
function apply(ctx) {
	ctx.inject(["settings"], (scoped) => {
		scoped.settings.register(THEME_SETTINGS_NAMESPACE, AppearanceSchema);
	});
	ctx.on("webserver/index-inject", (table) => {
		const settings = ctx.get("settings");
		const user = settings?.describe({ redactSecrets: true }).find((row) => row.ns === THEME_SETTINGS_NAMESPACE)?.user;
		table.push(...themeBootRows(settings?.get(THEME_SETTINGS_NAMESPACE), user, settings?.get("ui-theme")));
	});
	ctx.on("settings/updated", (namespace, next) => {
		if (namespace !== "sanbao-appearance") return;
		const themeId = next?.themeId;
		if (themeId && THEME_IDS.includes(themeId)) {
			let runtime;
			try {
				runtime = ctx.get("desktopRuntime") ?? ctx.desktopRuntime;
			} catch {
				runtime = void 0;
			}
			try {
				runtime?.setSanbaoTheme?.(themeId);
			} catch (cause) {
				ctx.logger.error(`dsh-theme: native window theme sync failed: ${cause instanceof Error ? cause.message : String(cause)}`);
			}
		}
	});
}
//#endregion
export { apply, name };
