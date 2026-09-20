//#region src/theme-host.ts
const DEFAULT_APPEARANCE_STATE = {
	mode: "system",
	theme: "forest-green",
	fontScale: 1,
	monoFont: "sf-mono",
	reduceMotion: false
};
var AppearanceHostService = class {
	state;
	listeners = /* @__PURE__ */ new Set();
	ctx;
	electron;
	constructor(options = {}) {
		this.ctx = options.ctx;
		const proc = typeof globalThis !== "undefined" ? globalThis.process : void 0;
		this.electron = options.electron ?? (proc?.versions?.electron ? this.resolveElectron() : void 0);
		this.state = {
			...DEFAULT_APPEARANCE_STATE,
			...options.initialState
		};
		this.syncNativeTheme(this.state.mode);
	}
	resolveElectron() {
		try {
			const req = globalThis.require;
			return typeof req === "function" ? req("electron") : void 0;
		} catch {
			return;
		}
	}
	getAppearance() {
		return { ...this.state };
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}
	updateAppearance(partial) {
		let changed = false;
		const next = { ...this.state };
		if (partial.mode !== void 0 && partial.mode !== next.mode) {
			next.mode = partial.mode;
			changed = true;
		}
		if (partial.theme !== void 0 && partial.theme !== next.theme) {
			next.theme = partial.theme;
			changed = true;
		}
		if (partial.fontScale !== void 0 && partial.fontScale !== next.fontScale) {
			next.fontScale = partial.fontScale;
			changed = true;
		}
		if (partial.monoFont !== void 0 && partial.monoFont !== next.monoFont) {
			next.monoFont = partial.monoFont;
			changed = true;
		}
		if (partial.reduceMotion !== void 0 && partial.reduceMotion !== next.reduceMotion) {
			next.reduceMotion = partial.reduceMotion;
			changed = true;
		}
		if (!changed) return this.getAppearance();
		this.state = next;
		this.syncNativeTheme(this.state.mode);
		this.notifySubscribers();
		this.broadcastCordis();
		return this.getAppearance();
	}
	syncNativeTheme(mode) {
		if (this.electron?.nativeTheme) this.electron.nativeTheme.themeSource = mode;
	}
	notifySubscribers() {
		const snapshot = this.getAppearance();
		for (const listener of this.listeners) try {
			listener(snapshot);
		} catch {}
	}
	broadcastCordis() {
		if (this.ctx && typeof this.ctx.emit === "function") try {
			this.ctx.emit("appearance/change", this.getAppearance());
		} catch {}
	}
};
//#endregion
//#region src/index.ts
const name = "dsh-theme";
function apply(ctx) {
	if (ctx) {
		const appearanceService = new AppearanceHostService({ ctx });
		if (typeof ctx.provide === "function") ctx.provide("appearance");
		ctx.appearance = appearanceService;
	}
}
//#endregion
export { AppearanceHostService, apply, name };
