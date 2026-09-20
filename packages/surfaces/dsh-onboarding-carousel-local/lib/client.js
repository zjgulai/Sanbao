window.__ModuleLoader__.load({
	id: "dsh-onboarding-carousel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/onboarding-copy.ts
		/**
		* First-run carousel facts shared by the host entry and the client step:
		* the durable acknowledgement, the upstream notice this product replaces,
		* and the page copy.
		*/
		/** Durable settings namespace owning Sanbao first-run facts. */
		const INTRO_SETTINGS_NAMESPACE = "sanbao-onboarding";
		/** Field storing the intro version this install has already seen. */
		const INTRO_ACK_FIELD = "introVersion";
		/**
		* Bump only when the carousel copy changes materially and every install should
		* see it again; the acknowledgement is compared for exact equality.
		*/
		const INTRO_VERSION = "2026-09-20.1";
		/**
		* Upstream product-wide notice (`welcome-notice` step) that this carousel
		* replaces. Sanbao acknowledges it on the user's behalf when the carousel
		* finishes, so the DeepSeek internal-testing card never surfaces.
		*/
		const UPSTREAM_NOTICE_NAMESPACE = "ui-onboarding";
		/** Field the upstream notice stores its acknowledged version in. */
		const UPSTREAM_NOTICE_ACK_FIELD = "welcomeNoticeVersion";
		/**
		* Copy of `WELCOME_NOTICE_VERSION` from the upstream
		* `@deepseek-ai/dsh-client-ui-settings-models` package. `src/onboarding-copy.test.ts`
		* compares it against the vendor reference so an upstream bump fails a test
		* instead of silently resurrecting the notice.
		*/
		const UPSTREAM_NOTICE_VERSION = "2026-08-13.1";
		/**
		* The three intro pages. Copy stays inside what the product does today —
		* cloud execution and invitation-only accounts land later and must not be
		* promised here before they exist.
		*/
		const INTRO_PAGES = [
			{
				id: "brand",
				titleKey: "page.brand.title",
				bodyKey: "page.brand.body"
			},
			{
				id: "ability",
				titleKey: "page.ability.title",
				bodyKey: "page.ability.body"
			},
			{
				id: "start",
				titleKey: "page.start.title",
				bodyKey: "page.start.body"
			}
		];
		/** Locale dictionaries for the carousel, registered under {@link INTRO_LOCALE_NS}. */
		const INTRO_LOCALE_NS = "sanbao-onboarding";
		const INTRO_COPY = {
			zh: {
				"page.brand.title": "三宝出海，货通四方",
				"page.brand.body": "把想做的事说出来，剩下的交给它。",
				"page.ability.title": "一个输入框，装着全部",
				"page.ability.body": "写作、分析、编码、自动化——同一处起步，过程可见，结果可留。",
				"page.start.title": "从第一个任务开始",
				"page.start.body": "选一个项目，或直接开聊。",
				"action.skip": "跳过",
				"action.next": "下一步",
				"action.start": "开始使用"
			},
			en: {
				"page.brand.title": "Sanbao: ship everywhere",
				"page.brand.body": "Say what you want done; the rest is handled.",
				"page.ability.title": "One box, every ability",
				"page.ability.body": "Writing, analysis, code, automation — start here, watch it work, keep the result.",
				"page.start.title": "Start with one task",
				"page.start.body": "Pick a project, or just start typing.",
				"action.skip": "Skip",
				"action.next": "Next",
				"action.start": "Start"
			}
		};
		//#endregion
		//#region src/client/step.ts
		/** Pure decision and paging rules for the first-run carousel. */
		/**
		* Decide the step's visible branch.
		* @param input - scope answer plus the process-local fallback for memory mode.
		* @returns `waiting` while the scope is still loading, `done` once this exact
		* intro version is acknowledged, otherwise `show`.
		*/
		function introDecision(input) {
			const { scope, seenLocally } = input;
			if (scope.mode === "memory") return seenLocally ? "done" : "show";
			if (scope.status === "loading") return "waiting";
			if (scope.status === "unavailable") return "show";
			return scope.value?.["introVersion"] === "2026-09-20.1" ? "done" : "show";
		}
		/** Total page count. */
		function pageCount() {
			return INTRO_PAGES.length;
		}
		/** Advance one page, clamped at the end so the primary button becomes 开始使用. */
		function nextPage(current, count = pageCount()) {
			return Math.min(current + 1, count - 1);
		}
		/** Go back one page, clamped at the start. */
		function previousPage(current, count = pageCount()) {
			return Math.max(current - 1, 0);
		}
		/** Whether the primary button finishes the carousel instead of paging on. */
		function isLastPage(current, count = pageCount()) {
			return current >= count - 1;
		}
		//#endregion
		//#region src/client/Carousel.tsx
		/**
		* The carousel itself. The step owns its whole chrome — the settings shell
		* paints none — so this component is the backdrop, the card, the paging and
		* the two exits.
		*/
		function Carousel({ complete, store, t }) {
			const subscribe = (0, react.useCallback)((listener) => store.subscribe(listener), [store]);
			const read = (0, react.useCallback)(() => store.getSnapshot(), [store]);
			const snapshot = (0, react.useSyncExternalStore)(subscribe, read, read);
			const [page, setPage] = (0, react.useState)(0);
			const finish = (0, react.useCallback)(() => {
				store.finish();
				complete();
			}, [complete, store]);
			const showing = snapshot.decision === "show";
			(0, react.useEffect)(() => {
				if (!showing) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") finish();
					else if (event.key === "ArrowRight") setPage((current) => nextPage(current));
					else if (event.key === "ArrowLeft") setPage((current) => previousPage(current));
				};
				window.addEventListener("keydown", onKeyDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
				};
			}, [finish, showing]);
			if (!showing) return null;
			const current = INTRO_PAGES[Math.min(page, INTRO_PAGES.length - 1)];
			if (current === void 0) return null;
			const last = isLastPage(page);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "soc-backdrop",
				"data-sanbao-intro": "v1",
				"data-page": current.id,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "soc-card",
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": "soc-intro-title",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "soc-kicker",
							children: `${page + 1} / ${INTRO_PAGES.length}`
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: "soc-title",
							id: "soc-intro-title",
							children: t(current.titleKey)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "soc-body",
							children: t(current.bodyKey)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "soc-dots",
							"aria-hidden": "true",
							children: INTRO_PAGES.map((entry, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "soc-dot",
								"data-current": index === page ? "true" : "false"
							}, entry.id))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "soc-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "soc-skip",
								onClick: finish,
								children: t("action.skip")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "soc-primary",
								onClick: last ? finish : () => {
									setPage((current) => nextPage(current));
								},
								children: t(last ? "action.start" : "action.next")
							})]
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/store.ts
		/**
		* Carousel state over the settings scopes: the intro acknowledgement this
		* package owns, plus the upstream internal-testing notice it retires.
		*
		* The scope is the transport. A loopback browser follows the durable host
		* section; a remote browser's memory-mode scope never persists, so the
		* acknowledgement stays process-local there.
		*/
		/** Coordinates the durable acknowledgements for one page session. */
		var IntroCarouselStore = class {
			intro;
			notice;
			snapshot = {
				decision: "waiting",
				error: null
			};
			listeners = /* @__PURE__ */ new Set();
			seenLocally = false;
			following = [];
			pending;
			/**
			* @param intro - this package's namespace scope.
			* @param notice - the upstream notice's namespace scope, acknowledged in the
			* same breath so the two steps never queue behind each other.
			*/
			constructor(intro, notice) {
				this.intro = intro;
				this.notice = notice;
			}
			/** Begin following both scopes (idempotent) and publish the current answer. */
			load() {
				if (this.following.length === 0) for (const scope of [this.intro, this.notice]) this.following.push(scope.subscribe(() => {
					this.derive();
				}));
				this.derive();
			}
			/** Stop following the scopes. */
			dispose() {
				for (const unsubscribe of this.following) unsubscribe();
				this.following = [];
			}
			/** uSES-compatible read. */
			getSnapshot() {
				return this.snapshot;
			}
			/** uSES-compatible subscribe. */
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			/**
			* Acknowledge the intro and retire the upstream notice. Repeated calls share
			* one settlement, so a double click cannot write twice.
			* @returns settlement after both writes have been attempted.
			*/
			finish() {
				this.seenLocally = true;
				this.publish({
					decision: "done",
					error: this.snapshot.error
				});
				this.pending ??= this.persist();
				return this.pending;
			}
			async persist() {
				let error = null;
				if (this.intro.getSnapshot().mode !== "memory") try {
					await this.intro.set(INTRO_ACK_FIELD, INTRO_VERSION);
				} catch (cause) {
					error = String(cause?.message ?? cause);
				}
				if (this.notice.getSnapshot().mode !== "memory") try {
					await this.notice.set(UPSTREAM_NOTICE_ACK_FIELD, UPSTREAM_NOTICE_VERSION);
				} catch (cause) {
					error ??= String(cause?.message ?? cause);
				}
				this.publish({
					decision: "done",
					error
				});
			}
			derive() {
				if (this.seenLocally) return;
				const decision = introDecision({
					scope: this.intro.getSnapshot(),
					seenLocally: false
				});
				this.publish({
					decision,
					error: this.snapshot.error
				});
			}
			publish(next) {
				if (next.decision === this.snapshot.decision && next.error === this.snapshot.error) return;
				this.snapshot = next;
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region \0dsh-onboarding-carousel-css:/Users/lute/project/Magpie-Horch-composer-e136/packages/surfaces/dsh-onboarding-carousel-local/src/client/carousel.css.mjs
		const css = ".soc-backdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:24px;background:color-mix(in srgb, var(--dsw-alias-bg-base) 62%, transparent);backdrop-filter:blur(6px);font-family:var(--dsw-font-family)}\n.soc-card{box-sizing:border-box;width:min(420px,100%);display:flex;flex-direction:column;gap:10px;padding:28px 28px 18px;border:1px solid var(--dsw-alias-border-l2);border-radius:20px;background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-prominent,0 18px 60px rgb(0 0 0 / 18%))}\n.soc-kicker{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}\n.soc-title{margin:0;font-size:20px;line-height:28px;font-weight:600}\n.soc-body{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary)}\n.soc-dots{display:flex;gap:6px;margin-top:6px}\n.soc-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-border-l2);transition:background-color 120ms ease}\n.soc-dot[data-current=true]{background:var(--dsw-alias-label-primary)}\n.soc-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px}\n.soc-actions button{font:inherit;font-size:14px;line-height:20px;border-radius:10px;padding:6px 14px;cursor:pointer}\n.soc-skip{border:0;background:transparent;color:var(--dsw-alias-label-secondary)}\n.soc-skip:hover{background:var(--dsw-alias-interactive-bg-hover)}\n.soc-primary{border:0;background:var(--dsw-alias-label-primary);color:var(--dsw-specific-input-major)}\n.soc-primary:hover{background:var(--dsw-alias-label-secondary)}\n.soc-actions button:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:2px}\n@media (prefers-reduced-motion:reduce){.soc-dot{transition:none}}\n";
		const tagId = "dsh-onboarding-carousel/carousel.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-onboarding-carousel";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/index.tsx
		/**
		* Client entry: register the Sanbao first-run carousel as the first
		* `settings.onboarding` step and retire the upstream internal-testing notice
		* the moment the user finishes it.
		*
		* The settings shell mounts one ordered step at a time, so a lower `order`
		* takes over from the shipped steps without patching any upstream bundle.
		*/
		const inject = [
			"slots",
			"locale",
			"settingsScope"
		];
		/** A malformed durable section reads as empty, so the step treats it as unseen. */
		function decodeSection(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
		}
		function apply(ctx) {
			const store = new IntroCarouselStore(ctx.settingsScope.bind({
				namespace: INTRO_SETTINGS_NAMESPACE,
				decode: decodeSection
			}), ctx.settingsScope.bind({
				namespace: UPSTREAM_NOTICE_NAMESPACE,
				decode: decodeSection
			}));
			store.load();
			ctx.locale.register(INTRO_LOCALE_NS, INTRO_COPY);
			const t = ctx.locale.bind(INTRO_LOCALE_NS);
			ctx.slots.inject("settings.onboarding", () => ctx.slots.register({
				name: "settings.onboarding",
				id: "sanbao-intro",
				order: -1e3,
				inject: () => ({
					store,
					t
				})
			}, Carousel));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map