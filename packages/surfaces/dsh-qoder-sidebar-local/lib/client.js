window.__ModuleLoader__.load({
	id: "dsh-qoder-sidebar-local",
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
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/rightbar-width.ts
		/**
		* 右栏宽度的**纯**契约层：区间、官方默认、存储编解码。
		*
		* ## 区间为什么是「镜像」而不是自创
		* 真正钳位的是外壳：`setRightbar(px)` 用 `columns.ts` 的
		* `clampWidth(px, RIGHTBAR_MIN, max(RIGHTBAR_MIN, viewportWidth × RIGHTBAR_MAX_RATIO))`
		* 再钳一次（`vendor/dsh-desktop/deepseek-harness/packages/client/ui-layout/src/client/stores.ts`）。
		* 我们镜像同一组数字，唯一的目的是让设置页显示的值**等于外壳真会给的值**——
		* 否则会出现「设置写 240、面板渲染 300」这种界面在说谎的状态。
		*
		* 镜像的代价是「上游改了数字而这里不知道」。抵消它的不是注释，是实机探针
		* （`scripts/acceptance/right-sidebar-width-live.mjs`）两端对钉：请求 200 实测 300、
		* 请求 9999 实测 `floor(视口 × 0.7)`。数字漂了，探针红。
		*
		* ## 为什么不在这里做 DOM
		* 这一层零 DOM、零外壳知识（除了上面那组常量），所以能在 node 里直接测；
		* 落地点在 `rightbar-width-writer.ts`，设置行在 `rightbar-width-row.tsx`。
		*/
		/** 偏好键：本包唯一持有者（设置行与落地点都读写它，不存在第二个家）。 */
		const RIGHTBAR_WIDTH_KEY = "dsh-qoder-sidebar:rightbar-width";
		/** 外壳的右栏上限比例（`columns.ts` RIGHTBAR_MAX_RATIO）：视口的 70%。 */
		const MAX_RIGHTBAR_WIDTH_RATIO = .7;
		/** 外壳首开右栏的比例（`columns.ts` RIGHTBAR_DEFAULT_RATIO）。 */
		const OFFICIAL_DEFAULT_RATIO = .45;
		/** 视口宽度读不到时的兜底帧宽（本机常见窗口宽；读得到时一律用实测）。 */
		const FALLBACK_FRAME_WIDTH = 1280;
		/**
		* 把视口宽规整成可用于钳位的帧宽。
		* @param frameWidth - 实测视口宽（可能未挂载、为 0 或 NaN）。
		* @returns 有限正数帧宽。
		*/
		function asFrameWidth(frameWidth) {
			return Number.isFinite(frameWidth) && frameWidth > 0 ? frameWidth : FALLBACK_FRAME_WIDTH;
		}
		/**
		* 本视口下允许的最宽右栏。
		* @param frameWidth - 视口宽。
		* @returns 上限（不低于下限，避免窄窗口里钳出负区间）。
		*/
		function rightbarWidthCeiling(frameWidth) {
			return Math.max(300, Math.floor(asFrameWidth(frameWidth) * MAX_RIGHTBAR_WIDTH_RATIO));
		}
		/**
		* 把任意输入钳成外壳会接受的值。
		* @param requested - 用户要的值（可能来自脏存储、步进、或 NaN）。
		* @param frameWidth - 视口宽。
		* @returns 钳后的整数宽度；非有限请求判 null（不写）。
		*/
		function clampRightbarWidth(requested, frameWidth) {
			if (!Number.isFinite(requested)) return null;
			return Math.min(rightbarWidthCeiling(frameWidth), Math.max(300, Math.round(requested)));
		}
		/**
		* 外壳的默认右栏宽：等于 `openRightbar` 里的 `max(RIGHTBAR_MIN, round(视口 × 0.45))`。
		* 「跟随默认」要写的就是这个值（外壳没有「把 rightbar 重置为 null」的动作）。
		* @param frameWidth - 视口宽。
		* @returns 官方默认宽度。
		*/
		function officialRightbarWidth(frameWidth) {
			const frame = asFrameWidth(frameWidth);
			return Math.max(300, Math.round(frame * OFFICIAL_DEFAULT_RATIO));
		}
		/**
		* 解析存储值。只接受**十进制整数字面量**——`"12.5"` / `"1e3"` / `""` / `"abc"`
		* 一律判脏（脏值不猜意图，直接回落到默认宽度）。
		* @param raw - localStorage 的原始读数，或 null。
		* @returns 请求宽度，或 null。
		*/
		function parseStoredWidth(raw) {
			if (raw === null) return null;
			if (!/^\d+$/.test(raw)) return null;
			const px = Number(raw);
			return Number.isSafeInteger(px) ? px : null;
		}
		/** 序列化（钳位由读取侧负责，这里只做字面量转换）。 */
		function formatStoredWidth(px) {
			return String(Math.round(px));
		}
		//#endregion
		//#region src/client/rightbar-width-writer.ts
		/**
		* 用**官方写入口**落实右栏宽度，而不是覆写外壳的样式。
		*
		* ## 为什么换掉覆写轨道这条路
		* 2026-09-20 实机量到的事实：frame 的 `grid-template-columns` 是外壳每次提交都重写的
		* 内联样式（折叠态声明值就是 `280px minmax(0px, 1fr) 0px`）。插件侧贴 `!important`
		* ——连内联 `!important` 都在 250ms 内被改回原值。要靠覆写赢，只能起一个「每帧跟宿主
		* 抢同一个属性」的观察器，那正是本仓库总账里 P-07 / P-52 的形状，不做。
		*
		* ## 官方那条路
		* 宽度真源是 layout store 的 `layoutInfo.rightbar`（`ui-layout/src/client/stores.ts`），
		* 拖把手走的就是 `setRightbar(px)`。`ILayout` 没发布它——动作集被 `LayoutController`
		* 收在 `private readonly panels` 里（service.ts:63），但 TS 的 private 运行时不设防。
		* 所以这里是**能力探测**：探到就用，探不到就彻底不写（交回官方默认宽度），并把结论
		* 钉在 `<html>` 的属性上，让实机验收拦住「上游改了、我们静默失效」。
		*
		* ## 为什么这一层不是第二个家
		* 外壳的 `rightbar` 只活在内存里（`init` 为 `null`，AppFrame 无任何持久化读写），
		* 重启即回到视口 45%。本层的偏好是**跨重启的那一份**，并且每次生效都是让外壳自己写
		* 自己的 store——宽度的真源始终只有一个。
		*/
		/** 探测结论落在 documentElement 上的属性名（验收按它点名，不靠日志）。 */
		const WRITER_PROBE_ATTR = "data-lute-rightbar-writer";
		/** 拖把手后采纳结果时的容差：小于 2px 的抖动不算用户改过宽度。 */
		const ADOPT_TOLERANCE = 2;
		/** 官方拖拽把手的 data 锚点（AppFrame.tsx:109，不含类名哈希）。 */
		const HANDLE_SELECTOR = "[data-side]";
		/** 右栏列的 data 锚点（AppFrame.tsx:51）；它的父元素就是那个三列 grid。 */
		const COLUMN_SELECTOR = "[data-rightbar-col]";
		/**
		* 从 layout 服务对象上探出官方宽度写入口。
		* @param layout - `ctx.get('layout')` 的返回值，形状由外壳决定。
		* @returns 可用的写入口；探不到时为 null。
		*/
		function findRightbarWriter(layout) {
			if (layout === null || typeof layout !== "object") return null;
			for (const holder of candidates(layout)) {
				if (typeof holder.setRightbar !== "function") continue;
				return { set: (px) => {
					try {
						holder.setRightbar(px);
						return true;
					} catch {
						return false;
					}
				} };
			}
			return null;
		}
		/**
		* 候选持有者：动作集挂在 `LayoutController` 的私有字段上，字段名属于实现细节。
		* 因此不猜字段名，而是把服务对象自身与它**一层**属性值都当候选，
		* 哪个对象上真有可调用的 `setRightbar` 就用它；一个都没有就判不可达。
		*/
		function candidates(layout) {
			const list = [layout];
			for (const value of Object.values(layout)) if (value !== null && typeof value === "object") list.push(value);
			return list;
		}
		/**
		* 落地点的核心判定：偏好存在、钳得过、且不是自己刚写过的那一值，才写。
		*
		* 「未设偏好就一个像素都不写」是这里最要紧的一条：外壳首开按视口 45% 自己算，
		* 抢先写一份就等于把一个没人点过的设置变成事实上的所有者。
		*/
		function planRightbarWrite(stored, innerWidth, lastApplied) {
			if (stored === null) return {
				kind: "skip",
				reason: "no-pref"
			};
			const clamped = clampRightbarWidth(stored, innerWidth);
			if (clamped === null) return {
				kind: "skip",
				reason: "clamped-to-null"
			};
			if (clamped === lastApplied) return {
				kind: "skip",
				reason: "already-applied"
			};
			return {
				kind: "write",
				px: clamped
			};
		}
		/**
		* 挂上宽度落地点：把偏好写进外壳的 store，并把外壳自己的改动（拖把手）采纳回偏好。
		* @param deps - layout 取用器、文档、窗口与偏好句柄。
		* @returns 卸载函数。
		*/
		function attachRightbarWidth({ getLayout, doc, win, pref }) {
			/** 最近一次由我们写进去的宽度：用来分辨「官方自己变了」与「我们刚写的」。 */
			let lastApplied = null;
			let dragging = false;
			/** 拖拽抬手后等待外壳提交终值：只认抬手后的第一次样式变更。 */
			let awaitingDragCommit = false;
			/** frame 由外壳异步挂载，第一次 attach 时可能还没有；每次 apply 再试一次。 */
			let observing = false;
			const apply = () => {
				if (!observing) observing = bindObserver(doc, observer);
				const writer = findRightbarWriter(getLayout());
				doc.documentElement.setAttribute(WRITER_PROBE_ATTR, writer === null ? "unreachable" : "official");
				if (writer === null) return;
				const plan = planRightbarWrite(pref.read(), win.innerWidth, lastApplied);
				if (plan.kind === "write" && writer.set(plan.px)) lastApplied = plan.px;
			};
			/** 「跟随默认」：清偏好，并把外壳当前宽度显式送回官方默认值（外壳没有重置动作）。 */
			const resetToOfficial = () => {
				const writer = findRightbarWriter(getLayout());
				if (writer === null) return;
				const fallback = officialRightbarWidth(win.innerWidth);
				if (writer.set(fallback)) lastApplied = fallback;
			};
			const adopt = () => {
				const measured = measuredRightbarWidth(doc, win);
				if (measured === null) return;
				const stored = pref.read();
				if (stored !== null && Math.abs(measured - stored) <= ADOPT_TOLERANCE) return;
				if (lastApplied !== null && Math.abs(measured - lastApplied) <= ADOPT_TOLERANCE) return;
				pref.write(measured);
			};
			const onPointerDown = (event) => {
				if (!(event.target instanceof Element)) return;
				if (event.target.closest(HANDLE_SELECTOR) === null) return;
				dragging = true;
			};
			const onPointerUp = () => {
				if (!dragging) return;
				dragging = false;
				awaitingDragCommit = true;
				win.requestAnimationFrame(() => win.requestAnimationFrame(() => {
					if (!awaitingDragCommit) return;
					awaitingDragCommit = false;
					adopt();
				}));
			};
			const observer = new MutationObserver(() => {
				if (dragging) return;
				if (!awaitingDragCommit) return;
				awaitingDragCommit = false;
				adopt();
			});
			win.addEventListener("pointerdown", onPointerDown, true);
			win.addEventListener("pointerup", onPointerUp, true);
			win.addEventListener("resize", apply);
			const unsubscribe = pref.subscribe((px) => {
				lastApplied = null;
				if (px === null) resetToOfficial();
				else apply();
			});
			apply();
			return () => {
				observer.disconnect();
				unsubscribe();
				win.removeEventListener("pointerdown", onPointerDown, true);
				win.removeEventListener("pointerup", onPointerUp, true);
				win.removeEventListener("resize", apply);
				doc.documentElement.removeAttribute(WRITER_PROBE_ATTR);
			};
		}
		/**
		* 观察 frame 的 style 以采纳拖拽结果。frame 由外壳异步挂载，没找到时返回 false，
		* 由 apply 下次再试：写偏好那条路不依赖它，只有「读回外壳自己改的宽度」要等它到位。
		*/
		function bindObserver(doc, observer) {
			const frame = frameOf(doc);
			if (frame === null) return false;
			observer.observe(frame, {
				attributes: true,
				attributeFilter: ["style"]
			});
			return true;
		}
		/** frame = 右栏列的父元素（三列所在的那个 grid 容器）。 */
		function frameOf(doc) {
			const parent = doc.querySelector(COLUMN_SELECTOR)?.parentElement ?? null;
			return parent instanceof HTMLElement ? parent : null;
		}
		/**
		* 实测右栏渲染宽度：读 frame 计算后的轨道末位（布局后一律是 px 用量值）。
		* 折叠态末轨为 0，判读不到——那不代表宽度是 0。
		*/
		function measuredRightbarWidth(doc, win) {
			const frame = frameOf(doc);
			if (frame === null) return null;
			const tracks = win.getComputedStyle(frame).gridTemplateColumns.trim().split(/\s+/);
			if (tracks.length < 3) return null;
			const last = Number.parseFloat(tracks[tracks.length - 1] ?? "");
			if (!Number.isFinite(last) || last < 300) return null;
			return Math.round(last);
		}
		//#endregion
		//#region src/client/rightbar-width-pref.ts
		/**
		* 右栏宽度的**偏好层**：localStorage 读写 + 变更广播。
		*
		* 单独一层的原因：设置行（写）与覆写层（读）必须共用同一个家，否则会出现
		* 「设置改了但界面不动」这种两处各存一份的漂移（总账 P-07）。这里只放
		* 「值怎么存、怎么通知」，区间与轨道计算全在 `rightbar-width.ts`。
		*
		* 依赖注入式（storage 与 queueMicrotask 可换）是为了能在 node 里直接测——
		* 不引 jsdom，也不把 DOM 拉进这一层。
		*/
		/**
		* 建一个偏好句柄。
		* @param storage - 存储后端（真机传 `window.localStorage`）。
		* @returns 读写 + 订阅面。
		*/
		function createRightbarPref(storage) {
			const listeners = /* @__PURE__ */ new Set();
			const notify = () => {
				const value = read();
				for (const listener of listeners) listener(value);
			};
			function read() {
				return parseStoredWidth(storage.getItem(RIGHTBAR_WIDTH_KEY));
			}
			function write(px) {
				const current = read();
				if (px === null) {
					if (current === null) return;
					storage.removeItem(RIGHTBAR_WIDTH_KEY);
					notify();
					return;
				}
				const next = formatStoredWidth(px);
				if (current === Number(next)) return;
				storage.setItem(RIGHTBAR_WIDTH_KEY, next);
				notify();
			}
			function subscribe(listener) {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			}
			return {
				read,
				write,
				subscribe
			};
		}
		//#endregion
		//#region src/client/native-rightbar.ts
		/**
		* 取标签类型注册表。
		* @param ctx - 客户端根上下文。
		* @returns 注册表；服务缺失（原生包未装载）时 undefined。
		*/
		function nativeTabRegistry(ctx) {
			return ctx.get("sidebarRightTabs");
		}
		/**
		* 取右栏导航面。
		* @param ctx - 客户端根上下文。
		* @returns 导航面；服务缺失时 undefined。
		*/
		function nativeRightbar(ctx) {
			return ctx.get("sidebarRight");
		}
		/**
		* 取座位登记面（`ctx.slots` 的窄化）。
		* @param ctx - 客户端根上下文。
		* @returns `sidebar.right.pane.tab` 这种带 key 的登记入口。
		*/
		function nativeSlots(ctx) {
			return ctx.slots;
		}
		//#endregion
		//#region src/client/rightbar-width-face.ts
		/**
		* 设置行**动作**的语义层：步进、跟随默认、显示值。
		*
		* 单独一层的理由与 `rightbar-width-pref.ts` 同源：设置行是渲染，落地点是副作用，
		* 而「步进从哪儿起步、钳到边界算不算变更」这两件事既不属于渲染也不属于 DOM，
		* 它们是**决定**。放在这里就能在 node 里逐条测（不引 jsdom），实机只负责把它渲染出来。
		*
		* 三条规矩：
		*   1. 步进的基准 = 用户**眼睛看到的宽度**（实测右栏宽），未设且实测读不到时才退到
		*      外壳首开口径。从区间中点起步是错的——那会让第一次点击把面板跳到别处。
		*   2. 写入前一定过一遍 {@link clampRightbarWidth}（镜像外壳的区间），所以设置页显示的
		*      值就是外壳会给的值。
		*   3. 「跟随默认」= 清掉偏好（外壳没有「重置 rightbar」的动作）。清空是一次**广播**，
		*      落地点听到后把外壳当前宽度显式送回官方默认值——不广播的话布局会停在旧宽度。
		*/
		/**
		* 建一个设置行动作面。
		* @param deps - 偏好句柄与两个实测读数。
		* @returns 动作面。
		*/
		function createRightbarWidthFace({ pref, frameWidth, current }) {
			return {
				read: () => pref.read(),
				effective: () => {
					const stored = pref.read();
					return stored === null ? null : clampRightbarWidth(stored, frameWidth());
				},
				nudge: (delta) => {
					const next = clampRightbarWidth((pref.read() ?? current() ?? officialRightbarWidth(frameWidth())) + delta, frameWidth());
					if (next !== null) pref.write(next);
				},
				useOfficial: () => {
					pref.write(null);
				},
				subscribe: (listener) => pref.subscribe(listener)
			};
		}
		//#endregion
		//#region \0dsh-css:styles/sidebar.module.css.mjs
		const css = "[data-sidebar-right-panel]{background:var(--dsw-specific-sidebar-right-fill,var(--dsw-specific-sidebar-fill))!important;border-left:1.5px solid var(--dsw-alias-border-l3)!important}.wEYwTW_sidebar{flex-direction:column;gap:10px;padding:12px 12px 16px;display:flex}.wEYwTW_section{border:1px solid var(--dsw-alias-border-l2);background:color-mix(in oklch, var(--dsw-alias-bg-layer-2) 55%, transparent);border-radius:12px;transition:border-color .16s;overflow:hidden}.wEYwTW_section:hover{border-color:var(--dsw-alias-border-l3)}.wEYwTW_sectionHeader{width:100%;color:var(--dsw-alias-label-secondary);text-align:left;cursor:pointer;background:0 0;border:none;align-items:center;gap:8px;padding:9px 10px;font-size:12px;font-weight:600;line-height:18px;display:flex}.wEYwTW_sectionHeader:hover{background:var(--dsw-alias-interactive-bg-hover)}.wEYwTW_sectionIcon{color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex}.wEYwTW_section[data-expanded=true] .wEYwTW_sectionIcon{color:var(--dsw-alias-state-business-primary)}.wEYwTW_sectionLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-primary);flex:1;overflow:hidden}.wEYwTW_sectionCount{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px}.wEYwTW_sectionChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .2s cubic-bezier(.22,1,.36,1);display:inline-flex}.wEYwTW_section[data-expanded=true] .wEYwTW_sectionChevron{transform:rotate(90deg)}.wEYwTW_sectionBody{opacity:0;grid-template-rows:0fr;transition:grid-template-rows .24s cubic-bezier(.22,1,.36,1),opacity .18s;display:grid}.wEYwTW_section[data-expanded=true] .wEYwTW_sectionBody{opacity:1;grid-template-rows:1fr}.wEYwTW_sectionBodyInner{min-height:0;overflow:hidden}.wEYwTW_rows{flex-direction:column;gap:4px;margin:0;padding:0 10px 10px;list-style:none;display:flex}.wEYwTW_row{align-items:baseline;gap:8px;font-size:12px;line-height:18px;display:flex}.wEYwTW_rowDot{background:var(--dsw-alias-label-tertiary);border-radius:50%;flex:none;width:6px;height:6px}.wEYwTW_row[data-state=running] .wEYwTW_rowDot{background:var(--dsw-alias-state-business-primary);animation:1.4s ease-in-out infinite wEYwTW_activityPulse}.wEYwTW_row[data-state=done] .wEYwTW_rowDot{background:var(--dsw-alias-state-success-primary)}.wEYwTW_row[data-state=error] .wEYwTW_rowDot{background:var(--dsw-alias-state-error-primary)}.wEYwTW_rowLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-primary);flex:1;overflow:hidden}.wEYwTW_rowMeta{color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px}@keyframes wEYwTW_activityPulse{0%,to{opacity:1}50%{opacity:.35}}@media (prefers-reduced-motion:reduce){.wEYwTW_sectionBody,.wEYwTW_sectionChevron,.wEYwTW_rowDot{transition:none;animation:none}}.wEYwTW_widthRow{justify-content:space-between;align-items:center;gap:12px;padding:8px 0;display:flex}.wEYwTW_widthCopy{flex-direction:column;gap:2px;min-width:0;display:flex}.wEYwTW_widthLabel{color:var(--dsw-alias-label-primary);font-size:13px}.wEYwTW_widthHint{color:var(--dsw-alias-label-tertiary);font-size:11px}.wEYwTW_widthControl{flex:none;align-items:center;gap:6px;display:flex}.wEYwTW_widthValue{min-width:56px;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;text-align:center;font-size:13px}.wEYwTW_widthButton{border:1px solid var(--dsw-alias-border-l2);min-width:28px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 8px;font-size:12px}.wEYwTW_widthButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.wEYwTW_widthButton:disabled{color:var(--dsw-alias-label-tertiary);cursor:default;opacity:.55}";
		const tagId = "dsh-qoder-sidebar-local/sidebar.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-qoder-sidebar-local";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var sidebar_module_css_default = {
			"activityPulse": "wEYwTW_activityPulse",
			"row": "wEYwTW_row",
			"rowDot": "wEYwTW_rowDot",
			"rowLabel": "wEYwTW_rowLabel",
			"rowMeta": "wEYwTW_rowMeta",
			"rows": "wEYwTW_rows",
			"section": "wEYwTW_section",
			"sectionBody": "wEYwTW_sectionBody",
			"sectionBodyInner": "wEYwTW_sectionBodyInner",
			"sectionChevron": "wEYwTW_sectionChevron",
			"sectionCount": "wEYwTW_sectionCount",
			"sectionHeader": "wEYwTW_sectionHeader",
			"sectionIcon": "wEYwTW_sectionIcon",
			"sectionLabel": "wEYwTW_sectionLabel",
			"sidebar": "wEYwTW_sidebar",
			"widthButton": "wEYwTW_widthButton",
			"widthControl": "wEYwTW_widthControl",
			"widthCopy": "wEYwTW_widthCopy",
			"widthHint": "wEYwTW_widthHint",
			"widthLabel": "wEYwTW_widthLabel",
			"widthRow": "wEYwTW_widthRow",
			"widthValue": "wEYwTW_widthValue"
		};
		//#endregion
		//#region src/client/rightbar-width-row.tsx
		/**
		* 设置页里的「右侧栏宽度」偏好行（官方 `settings.general.item` 座位）。
		*
		* 为什么是这一行而不是外观页内：外观页（`dsh-theme` section）是主题包的单体组件、
		* 没有可贡献的内层座位，而它正被另一会话在写（本仓库禁止同包双写）。官方契约里
		* `settings.general.item` 就是为「一个不需要整页的偏好」准备的加法座位
		* （先例：locale → Language、ui-conversation → Composer Enter），
		* 由拥有该偏好的包自己贡献——本包即所有者。
		*
		* 这一行只做渲染：步进从哪儿起步、钳到边界算不算变更、「跟随默认」写什么，
		* 全在 `rightbar-width-face.ts` 里决定并单测；真正落进布局的是 `rightbar-width-writer.ts`。
		*/
		/** 步进：一次 40px，够粗到不误触，又不至于跨过量级。 */
		const STEP = 40;
		const LABEL_ZH = "右侧栏宽度";
		const HINT_ZH = `300px 起，上限随窗口宽度 · 拖右栏边缘即时生效`;
		const FOLLOW_ZH = "跟随默认";
		function RightbarWidthRow({ face }) {
			const snapshotOf = () => ({
				stored: face.read(),
				shown: face.effective()
			});
			const [view, setView] = (0, react.useState)(snapshotOf);
			(0, react.useEffect)(() => face.subscribe(() => setView(snapshotOf())), [face]);
			const isDefault = view.stored === null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.widthRow,
				"data-lute-rightbar-setting": "",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sidebar_module_css_default.widthCopy,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sidebar_module_css_default.widthLabel,
						children: LABEL_ZH
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sidebar_module_css_default.widthHint,
						children: HINT_ZH
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sidebar_module_css_default.widthControl,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.widthButton,
							onClick: () => face.nudge(-40),
							"aria-label": "收窄右侧栏",
							children: "−"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.widthValue,
							"aria-live": "polite",
							children: isDefault ? "默认" : `${view.shown ?? 300}px`
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.widthButton,
							onClick: () => face.nudge(STEP),
							"aria-label": "加宽右侧栏",
							children: "+"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.widthButton,
							onClick: () => face.useOfficial(),
							disabled: isDefault,
							children: FOLLOW_ZH
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/rightbar-width-settings.ts
		/** 偏好行的稳定 id（诊断与验收按它点名）。 */
		const SETTINGS_ROW_ID = "qoder-sidebar-width";
		/**
		* 登记偏好行。
		* @param ctx - 客户端根上下文。
		* @param pref - 宽度偏好句柄（行写它、落地点读它，两处同一个家）。
		* @returns 卸载函数。
		*/
		function registerRightbarWidthSettings(ctx, pref) {
			const face = createRightbarWidthFace({
				pref,
				frameWidth: () => window.innerWidth,
				current: () => measuredRightbarWidth(document, window)
			});
			const slots = nativeSlots(ctx);
			return slots.inject("settings.general.item", () => slots.register({
				name: "settings.general.item",
				key: SETTINGS_ROW_ID,
				id: SETTINGS_ROW_ID,
				order: 40,
				label: () => "右侧栏宽度",
				inject: () => ({ face })
			}, RightbarWidthRow));
		}
		//#endregion
		//#region src/client/git-api.ts
		/**
		* Git 状态 API —— 客户端侧。
		*
		* 渲染进程不能开子进程：`node:child_process` 不在桌面端的模块表里，在这里 import
		* 会让整个插件启动失败。git 调用留在宿主半（`src/index.ts`）的 loopback 路由后面，
		* 本模块是它上面的薄封装。
		*/
		/** Route mirrored from the host half (`ROUTES.gitStatus`). */
		const GIT_STATUS_ROUTE = "/api/dsh-qoder-sidebar/git-status";
		/** 路由不可用（宿主半未装载）时返回「没有可说的环境信息」，视图层据此不显示这一栏。 */
		async function fetchGitStatus(cwd) {
			try {
				const url = cwd === void 0 ? GIT_STATUS_ROUTE : `${GIT_STATUS_ROUTE}?cwd=${encodeURIComponent(cwd)}`;
				const response = await fetch(url, { headers: { accept: "application/json" } });
				if (!response.ok) return void 0;
				return await response.json();
			} catch {
				return;
			}
		}
		//#endregion
		//#region src/client/session-activity.ts
		const ICON_ENV = "<svg viewBox=\"0 0 16 16\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"8\" cy=\"8\" r=\"3\"/><path d=\"M8 1v3M8 12v3M1 8h3M12 8h3\"/></svg>";
		const ICON_PROCS = "<svg viewBox=\"0 0 16 16\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M8 3v2M8 11v2M3 8h2M11 8h2M4.93 4.93l1.41 1.41M9.66 9.66l1.41 1.41M4.93 11.07l1.41-1.41M9.66 6.34l1.41-1.41\"/></svg>";
		const ICON_SKILLS = "<svg viewBox=\"0 0 16 16\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M8 2l-3 6h3l-2 6 3-6h-3z\"/></svg>";
		const ICON_OUTPUTS = "<svg viewBox=\"0 0 16 16\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3.5 4.5l4.5-2.5 4.5 2.5v5l-4.5 2.5-4.5-2.5v-5z\"/><path d=\"M8 7v5\"/></svg>";
		const ICON_WEB = "<svg viewBox=\"0 0 16 16\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"7\" cy=\"7\" r=\"4.4\"/><path d=\"M10.4 10.4L14 14\"/></svg>";
		const ICON_SOURCES = "<svg viewBox=\"0 0 16 16\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 3h8v10H4z\"/><path d=\"M4 3v10a2 2 0 002 2h6\"/></svg>";
		/** 栏的固定次序（与参照形态一致）。 */
		const SECTIONS = [
			{
				id: "env",
				icon: ICON_ENV,
				label: "环境信息"
			},
			{
				id: "background-procs",
				icon: ICON_PROCS,
				label: "后台进程"
			},
			{
				id: "skills-mcp",
				icon: ICON_SKILLS,
				label: "技能与 MCP"
			},
			{
				id: "outputs",
				icon: ICON_OUTPUTS,
				label: "产出"
			},
			{
				id: "web-search",
				icon: ICON_WEB,
				label: "网页查阅"
			},
			{
				id: "sources",
				icon: ICON_SOURCES,
				label: "来源"
			}
		];
		/** 写文件的工具名（产出栏）。 */
		const WRITE_TOOLS = /* @__PURE__ */ new Set([
			"write",
			"edit",
			"multi_edit",
			"str_replace_editor",
			"apply_patch",
			"create_file"
		]);
		/** 联网工具名（网页查阅栏）。 */
		const WEB_TOOLS = /* @__PURE__ */ new Set(["web_search", "web_fetch"]);
		/** 起进程的工具名（后台进程栏）。 */
		const SHELL_TOOLS = /* @__PURE__ */ new Set([
			"bash",
			"shell",
			"run_command",
			"exec"
		]);
		/** 任务的工具名（后台进程栏：它们操作的就是那些 job）。 */
		const JOB_TOOLS = /* @__PURE__ */ new Set([
			"job_list",
			"job_output",
			"job_kill",
			"job_wait"
		]);
		/** 单行标签的最长字符数。 */
		const MAX_LABEL = 72;
		/** 每栏最多列出的行数（多出的折成一行计数）。 */
		const MAX_ITEMS = 8;
		/** 截断长文案（命令行、URL）。 */
		function clip(text) {
			const oneLine = text.replace(/\s+/g, " ").trim();
			return oneLine.length > MAX_LABEL ? `${oneLine.slice(0, MAX_LABEL)}…` : oneLine;
		}
		/** 从模型给的原始 JSON 串里取一个字符串字段。 */
		function argString(argsRaw, keys) {
			try {
				const parsed = JSON.parse(argsRaw);
				if (parsed === null || typeof parsed !== "object") return void 0;
				for (const key of keys) {
					const value = parsed[key];
					if (typeof value === "string" && value !== "") return value;
				}
			} catch {}
		}
		/** `web_search` 的查询词（`queries[]` 或 `query`）。 */
		function searchQuery(argsRaw) {
			try {
				const parsed = JSON.parse(argsRaw);
				if (parsed === null || typeof parsed !== "object") return void 0;
				const record = parsed;
				if (Array.isArray(record["queries"])) {
					const joined = record["queries"].filter((q) => typeof q === "string").join("、");
					if (joined !== "") return joined;
				}
				if (typeof record["query"] === "string") return record["query"];
			} catch {}
		}
		/** 从标题、网址或路径里取一个短名（来源栏用）。 */
		function shortName(raw) {
			const parts = (raw.split("?")[0] ?? raw).split("/").filter((part) => part !== "");
			return parts.length === 0 ? raw : parts[parts.length - 1] ?? raw;
		}
		function add(bucket, item) {
			if (bucket.seen.has(item.label)) return;
			bucket.seen.add(item.label);
			if (bucket.items.length >= MAX_ITEMS) {
				bucket.overflow += 1;
				return;
			}
			bucket.items.push(item);
		}
		/**
		* 把一个会话的事件窗口折成「有内容的栏」。
		* @param entries - 事件窗口的条目（只读；`transient` 条目忽略）。
		* @returns 只有非空栏的活动视图；空白会话得到 `{ sections: [] }`。
		*/
		function foldSessionActivity(entries) {
			const buckets = /* @__PURE__ */ new Map();
			const bucket = (id) => {
				const existing = buckets.get(id);
				if (existing !== void 0) return existing;
				const created = {
					items: [],
					seen: /* @__PURE__ */ new Set(),
					overflow: 0
				};
				buckets.set(id, created);
				return created;
			};
			/** callId → 它在哪一栏的哪一行（结果回来时回填状态）。 */
			const pending = /* @__PURE__ */ new Map();
			for (const entry of entries) {
				if (entry.type !== "event" || entry.event === void 0) continue;
				const event = entry.event;
				const data = event["data"];
				if (data === void 0) continue;
				switch (event["type"]) {
					case "tool/call": {
						const callId = typeof data["callId"] === "string" ? data["callId"] : void 0;
						const name = typeof data["name"] === "string" ? data["name"] : "";
						const rawArgs = typeof data["arguments"] === "string" ? data["arguments"] : "{}";
						const placed = [];
						if (WEB_TOOLS.has(name)) {
							const item = {
								label: name === "web_fetch" ? `读取 ${clip(argString(rawArgs, ["url"]) ?? "网页")}` : `搜索 ${clip(searchQuery(rawArgs) ?? "关键词")}`,
								meta: name === "web_fetch" ? "抓取" : "搜索",
								state: "running"
							};
							add(bucket("web-search"), item);
							placed.push(item);
						} else if (WRITE_TOOLS.has(name)) {
							const item = {
								label: clip(argString(rawArgs, [
									"file_path",
									"path",
									"file",
									"target_file"
								]) ?? name),
								meta: "文件",
								state: "running"
							};
							add(bucket("outputs"), item);
							placed.push(item);
						} else if (SHELL_TOOLS.has(name) || JOB_TOOLS.has(name)) {
							const item = {
								label: clip((name === "bash" ? argString(rawArgs, ["command", "cmd"]) : void 0) ?? name),
								meta: "命令",
								state: "running"
							};
							add(bucket("background-procs"), item);
							placed.push(item);
						} else if (name === "skill" || name.startsWith("mcp__") || name.includes("__")) {
							const item = {
								label: clip(argString(rawArgs, [
									"name",
									"skill",
									"command"
								]) ?? name),
								meta: name.startsWith("mcp__") ? "MCP" : "技能",
								state: "running"
							};
							add(bucket("skills-mcp"), item);
							placed.push(item);
						}
						if (callId !== void 0 && placed.length > 0) pending.set(callId, placed);
						break;
					}
					case "tool/result": {
						const message = data["message"];
						const callId = typeof message?.source?.callId === "string" ? message.source.callId : void 0;
						if (callId === void 0) break;
						const items = pending.get(callId);
						if (items === void 0) break;
						pending.delete(callId);
						const block = message?.content?.[0];
						const failed = data["error"] !== void 0 || block?.isError === true;
						for (const item of items) {
							const next = {
								...item,
								state: failed ? "error" : "done"
							};
							const index = items.indexOf(item);
							items[index] = next;
							replaceItem(buckets, item.label, next);
						}
						break;
					}
					case "deliverables/presented": {
						const files = data["files"];
						if (!Array.isArray(files)) break;
						for (const file of files) {
							const path = file !== null && typeof file === "object" && typeof file.path === "string" ? file.path : void 0;
							if (path !== void 0) add(bucket("outputs"), {
								label: clip(path),
								meta: "交付",
								state: "done"
							});
						}
						break;
					}
					case "user/message": {
						const content = data["content"];
						if (!Array.isArray(content)) break;
						for (const block of content) {
							if (block === null || typeof block !== "object") continue;
							const kind = block.type;
							if (kind !== "image" && kind !== "file") continue;
							const record = block;
							const raw = [
								record.name,
								record.path,
								record.url
							].find((value) => typeof value === "string" && value !== "");
							add(bucket("sources"), {
								label: clip(raw === void 0 ? kind === "image" ? "图片" : "文件" : shortName(raw)),
								meta: kind === "image" ? "图片" : "文件"
							});
						}
						break;
					}
					default: break;
				}
			}
			const sections = [];
			for (const definition of SECTIONS) {
				if (definition.id === "env") continue;
				const filled = buckets.get(definition.id);
				if (filled === void 0 || filled.items.length === 0) continue;
				const items = filled.overflow > 0 ? [...filled.items, {
					label: `还有 ${filled.overflow} 条`,
					meta: ""
				}] : filled.items;
				sections.push({
					id: definition.id,
					icon: definition.icon,
					label: definition.label,
					items
				});
			}
			return { sections };
		}
		/** 结果回来时把同一行换成终态（按标签定位，标签在同一栏内唯一）。 */
		function replaceItem(buckets, label, next) {
			for (const filled of buckets.values()) {
				const index = filled.items.findIndex((item) => item.label === label);
				if (index >= 0) {
					filled.items[index] = next;
					return;
				}
			}
		}
		/** 栏的图标（视图层画表头用；`env` 不在折叠输出里，由视图层按 git 状态补）。 */
		const SECTION_ICONS = {
			env: ICON_ENV,
			"background-procs": ICON_PROCS,
			"skills-mcp": ICON_SKILLS,
			outputs: ICON_OUTPUTS,
			"web-search": ICON_WEB,
			sources: ICON_SOURCES
		};
		/**
		* 包一层带记忆的源：窗口没变（`revision` 相同）就不重算，快照引用保持稳定。
		* @param window - 原生的事件窗口源。
		* @returns 折叠后的活动源，可交给注册的 `hooks` 隔间。
		*/
		function activitySource(window) {
			let cache;
			return {
				getSnapshot() {
					const snapshot = window.getSnapshot();
					if (cache !== void 0 && cache.revision === snapshot.revision) return cache.value;
					const value = foldSessionActivity(snapshot.entries);
					cache = {
						revision: snapshot.revision,
						value
					};
					return value;
				},
				subscribe(listener) {
					return window.subscribe(listener);
				}
			};
		}
		//#endregion
		//#region src/client/sidebar-body.tsx
		/**
		* 右栏本页的标签体：**本会话实际做过什么**。
		*
		* 空白会话里这里是空的；AI 一开始调用工具、产出资源，对应的一栏才出现（参照
		* Qoder 的右侧栏）。数据来自会话事件流的折叠（`session-activity.ts`），经登记的
		* `hooks.sessionActivity` 隔间以 `useSessionActivity(selector)` 传进来——本组件
		* 不做订阅，也不读 session 对象。
		*
		* 环境信息一栏例外：它描述的是**工作区状态**（会话没动过它也可能有未提交改动），
		* 因此单独经宿主半的 loopback 路由取一次 git 状态；但**本会话什么都没做过时它也不出现**
		* （页面的主题是「本会话做过什么」，空白会话里连它也不该在）。
		*/
		/** 折叠记忆的落点（一页一份，不跨形态共享）。 */
		const COLLAPSED_KEY = "dsh-qoder-sidebar:collapsed";
		function readCollapsed() {
			try {
				const raw = window.localStorage.getItem(COLLAPSED_KEY);
				if (raw === null) return /* @__PURE__ */ new Set();
				const parsed = JSON.parse(raw);
				return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === "string")) : /* @__PURE__ */ new Set();
			} catch {
				return /* @__PURE__ */ new Set();
			}
		}
		function writeCollapsed(collapsed) {
			try {
				window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
			} catch {}
		}
		const EMPTY_ACTIVITY = { sections: [] };
		/** 没有注入面时的兜底选择器（形状与 `use<Name>` 一致，但恒定空）。 */
		function noActivity(selector) {
			return selector(EMPTY_ACTIVITY);
		}
		/** 环境信息栏：git 状态折出来的行（没有可说的就返回 null）。 */
		function envSectionFrom(status) {
			if (status === void 0) return null;
			const diverged = status.ahead > 0 || status.behind > 0;
			if (status.uncommittedFiles === 0 && !diverged) return null;
			const items = [];
			if (status.uncommittedFiles > 0) items.push({
				label: `${status.uncommittedFiles} 个未提交改动`,
				meta: "工作区"
			});
			items.push({
				label: status.branch,
				meta: "分支"
			});
			if (status.ahead > 0) items.push({
				label: `领先远端 ${status.ahead}`,
				meta: "待推送"
			});
			if (status.behind > 0) items.push({
				label: `落后远端 ${status.behind}`,
				meta: "待拉取"
			});
			if (status.lastCommit !== void 0) items.push({
				label: status.lastCommit.message,
				meta: status.lastCommit.hash.slice(0, 7)
			});
			return {
				id: "env",
				icon: SECTION_ICONS.env,
				label: "环境信息",
				items
			};
		}
		/** 一栏的表头 + 可折叠内容。 */
		function Section(props) {
			const { section, expanded, onToggle, children } = props;
			const bodyId = `dsh-qoder-sidebar-body-${section.id}`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: sidebar_module_css_default.section,
				"data-section": section.id,
				"data-expanded": expanded ? "true" : "false",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: sidebar_module_css_default.sectionHeader,
					"aria-expanded": expanded,
					"aria-controls": bodyId,
					onClick: onToggle,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.sectionIcon,
							"aria-hidden": "true",
							dangerouslySetInnerHTML: { __html: section.icon }
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.sectionLabel,
							children: section.label
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.sectionCount,
							children: section.items.length
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.sectionChevron,
							"aria-hidden": "true",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
								viewBox: "0 0 16 16",
								width: "14",
								height: "14",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "1.5",
								strokeLinecap: "round",
								strokeLinejoin: "round",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6 4l4 4-4 4" })
							})
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: sidebar_module_css_default.sectionBody,
					id: bodyId,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.sectionBodyInner,
						children
					})
				})]
			});
		}
		function SidebarBody({ useSessionActivity }) {
			const [collapsed, setCollapsed] = (0, react.useState)(readCollapsed);
			const [env, setEnv] = (0, react.useState)(null);
			const activity = (useSessionActivity ?? noActivity)((value) => value);
			(0, react.useEffect)(() => {
				let live = true;
				const load = async () => {
					const section = envSectionFrom(await fetchGitStatus());
					if (live) setEnv(section);
				};
				load();
				const timer = window.setInterval(() => {
					load();
				}, 1e4);
				return () => {
					live = false;
					window.clearInterval(timer);
				};
			}, []);
			const sections = (0, react.useMemo)(() => {
				if (env === null || activity.sections.length === 0) return activity.sections;
				return [env, ...activity.sections];
			}, [activity, env]);
			const toggle = (id) => {
				setCollapsed((prev) => {
					const next = new Set(prev);
					if (next.has(id)) next.delete(id);
					else next.add(id);
					writeCollapsed(next);
					return next;
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: sidebar_module_css_default.sidebar,
				"data-dsh-part": "qoder-sidebar",
				"data-section-count": sections.length,
				children: sections.map((section) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Section, {
					section,
					expanded: !collapsed.has(section.id),
					onToggle: () => toggle(section.id),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: sidebar_module_css_default.rows,
						children: section.items.map((item, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: sidebar_module_css_default.row,
							"data-state": item.state ?? "summary",
							children: [
								item.state === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sidebar_module_css_default.rowDot,
									"aria-hidden": "true"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sidebar_module_css_default.rowLabel,
									title: item.label,
									children: item.label
								}),
								item.meta !== void 0 && item.meta !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sidebar_module_css_default.rowMeta,
									children: item.meta
								}) : null
							]
						}, `${item.label}-${index}`))
					})
				}, section.id))
			});
		}
		//#endregion
		//#region src/client/sidebar-surface.ts
		/** 标签类型的身份：同时是标签体登记时的 key。 */
		const SIDEBAR_ID = "dsh-qoder-sidebar-local/activity";
		/** 标签类型判别符：`openTab` 用它点名。 */
		const SIDEBAR_KIND = "qoder-activity";
		/**
		* 登记本页为原生右栏的一个标签类型。
		* @param ctx - 客户端根上下文。
		* @returns 卸载函数（三个登记的复核器）。
		*/
		function registerSidebarSurface(ctx) {
			const tabs = nativeTabRegistry(ctx);
			if (tabs === void 0) {
				console.warn("[qoder-sidebar] sidebarRightTabs 服务缺失——原生右栏不在装配里，本页不登记");
				return () => {};
			}
			const disposeType = tabs.register({
				id: SIDEBAR_ID,
				kind: SIDEBAR_KIND,
				priority: "extension",
				title: () => "活动",
				guide: [{
					order: 10,
					title: () => "会话活动",
					description: () => "本会话做过的事：环境、进程、技能与 MCP、产出、网页、来源"
				}]
			});
			const slots = nativeSlots(ctx);
			const disposeBody = slots.inject("sidebar.right.pane.tab", () => slots.register({
				name: "sidebar.right.pane.tab",
				key: SIDEBAR_ID,
				inject: (sessionId) => ({ hooks: { sessionActivity: sessionActivityFor(ctx, sessionId) } })
			}, SidebarBody));
			const disposeFront = bringToFrontOnFirstExpand(ctx);
			return () => {
				disposeFront();
				disposeBody();
				disposeType();
			};
		}
		/**
		* 本会话的事件窗口 → 活动源（标签体 `useSessionActivity` 的背后数据）。
		*
		* `ctx.sessions` 是会话对象层服务（原生 `@deepseek-ai/dsh-api-session-controller/client`
		* 声明合并进 Context）；本包没引它的类型，所以窄化读 `binding`。绑定缺失
		* （会话未列出 / 正在新建 / 已销毁）时给恒定空的源——标签体照常渲染，只是没有栏。
		* @param ctx - 客户端根上下文。
		* @param sessionId - 原生调度器交给标签体的会话 id。
		* @returns 该会话的活动源。
		*/
		function sessionActivityFor(ctx, sessionId) {
			const binding = ctx.sessions?.binding?.(sessionId);
			if (binding?.eventSource === void 0) return EMPTY_SOURCE;
			return activitySource(binding.eventSource);
		}
		/** 会话不可用时的恒定空源（引用稳定，避免每次渲染都换快照）。 */
		const EMPTY_SOURCE = {
			getSnapshot: () => ({ sections: [] }),
			subscribe: () => () => {}
		};
		/**
		* 右栏第一次被展开时，把本页补到前台（每次启动只做一次）。
		*
		* 为什么不靠原生的默认页：原生 `defaultSeed()` 只在「全机只有一个 guide 条目」时把
		* 那个条目当默认页；本机还有别的类型贡献 guide 条目，所以右栏首次打开落在外壳的
		* 指南页上。这里退一步补一次「打开本页」。
		*
		* 为什么是轮询：`ctx.layout` 只有写动作（openRightbar/closeRightbar），
		* `ctx.sidebarRight` 只给 `isExpanded()` 这一个读法——没有「展开」事件的订阅面。
		* 代价是每秒一次布尔读，开关一旦翻上来（或插件卸载）就停表；翻上来之后不再干预
		* 用户自己的换页。
		* @param ctx - 客户端根上下文。
		* @returns 停表函数。
		*/
		function bringToFrontOnFirstExpand(ctx) {
			const right = nativeRightbar(ctx);
			if (right === void 0) return () => {};
			let done = false;
			const timer = window.setInterval(() => {
				if (done) return;
				let expanded = false;
				try {
					expanded = right.isExpanded();
				} catch {
					return;
				}
				if (!expanded) return;
				done = true;
				window.clearInterval(timer);
				try {
					if (right.active()?.kind !== "qoder-activity") right.openTab(SIDEBAR_KIND);
				} catch (error) {
					console.warn("[qoder-sidebar] 首次展开时打开本页失败", error);
				}
			}, 1e3);
			return () => {
				done = true;
				window.clearInterval(timer);
			};
		}
		//#endregion
		//#region src/client/index.ts
		const name = "qoder-sidebar-local";
		const inject = [
			"slots",
			"sidebarRightTabs",
			"sessions"
		];
		function apply(ctx) {
			const pref = createRightbarPref(window.localStorage);
			ctx.effect(() => registerSidebarSurface(ctx), "qoder-sidebar-local: activity tab");
			ctx.effect(() => registerRightbarWidthSettings(ctx, pref), "qoder-sidebar-local: rightbar width setting");
			ctx.effect(() => attachRightbarWidth({
				getLayout: () => lookupLayout(ctx),
				doc: document,
				win: window,
				pref
			}), "qoder-sidebar-local: rightbar width writer");
		}
		/** 可读可不可读的 layout 服务：探测式读取，不抛。 */
		function lookupLayout(ctx) {
			try {
				const get = ctx.get;
				return typeof get === "function" ? get.call(ctx, "layout") : void 0;
			} catch {
				return;
			}
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map