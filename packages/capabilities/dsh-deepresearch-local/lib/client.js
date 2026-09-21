window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-deepresearch",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/util.js
		function getEnumValues(entries) {
			const numericValues = Object.values(entries).filter((v) => typeof v === "number");
			return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
		}
		function joinValues(array, separator = "|") {
			return array.map((val) => stringifyPrimitive(val)).join(separator);
		}
		function jsonStringifyReplacer(_, value) {
			if (typeof value === "bigint") return value.toString();
			return value;
		}
		var Cached = class {
			constructor(getter) {
				this._getter = getter;
				this._value = void 0;
			}
			get value() {
				const getter = this._getter;
				if (getter !== void 0) {
					this._value = getter();
					this._getter = void 0;
				}
				return this._value;
			}
		};
		function cached(getter) {
			return new Cached(getter);
		}
		function nullish(input) {
			return input === null || input === void 0;
		}
		function cleanRegex(source) {
			const start = source.startsWith("^") ? 1 : 0;
			const end = source.endsWith("$") ? source.length - 1 : source.length;
			return source.slice(start, end);
		}
		function floatSafeRemainder(val, step) {
			const ratio = val / step;
			const roundedRatio = Math.round(ratio);
			const tolerance = 4 * Number.EPSILON * Math.max(Math.abs(ratio), 1);
			if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
			return ratio - roundedRatio;
		}
		function assignProp(target, prop, value) {
			Object.defineProperty(target, prop, {
				value,
				writable: true,
				enumerable: true,
				configurable: true
			});
		}
		/**
		* Whichever object a def's `shape` currently answers from: the one the caller passed until the first read, the frozen copy after it.
		*
		* Its keys and descriptors read without invoking anything, which is what lets a discriminated union check its discriminator, and the cycle walk read a shape, without resolving a getter that references the schema being constructed. A def that answers `shape` from an accessor of its own has none.
		*/
		function rawShape(def) {
			const desc = Object.getOwnPropertyDescriptor(def, "shape");
			return desc?.get ? desc.get.raw : desc?.value;
		}
		function sourceShape(schema) {
			return rawShape(schema._zod.def) ?? schema._zod.def.shape;
		}
		function deferProp(target, key, getter) {
			Object.defineProperty(target, key, {
				get() {
					const value = getter();
					assignProp(this, key, value);
					return value;
				},
				enumerable: true,
				configurable: true
			});
		}
		function putProp(target, key, value) {
			if (key in target) assignProp(target, key, value);
			else target[key] = value;
		}
		/**
		* Copies `keys` of `source`'s shape onto `target`, each value passed through `wrap`.
		*
		* A key the source has resolved is copied through now, so the derived shape states it outright and nothing has to resolve it to learn what it holds. A key the source still defers stays deferred, and reads back through the source's own `shape`, so it resolves once and both shapes get that one schema.
		*/
		function mirrorShape(target, source, keys, wrap) {
			const raw = sourceShape(source);
			for (const key of keys) {
				const desc = Object.getOwnPropertyDescriptor(raw, key);
				if (!desc.enumerable) continue;
				if (desc.get) deferProp(target, key, () => {
					const value = source._zod.def.shape[key];
					return wrap ? wrap(value, key) : value;
				});
				else putProp(target, key, wrap ? wrap(desc.value, key) : desc.value);
			}
		}
		function mirrorProps(target, source) {
			for (const key of Reflect.ownKeys(source)) {
				const desc = Object.getOwnPropertyDescriptor(source, key);
				if (!desc.enumerable) continue;
				if (desc.get) deferProp(target, key, () => source[key]);
				else putProp(target, key, desc.value);
			}
		}
		function mergeDefs(...defs) {
			const mergedDescriptors = {};
			for (const def of defs) {
				const descriptors = Object.getOwnPropertyDescriptors(def);
				Object.assign(mergedDescriptors, descriptors);
			}
			return Object.defineProperties({}, mergedDescriptors);
		}
		function esc(str) {
			return JSON.stringify(str);
		}
		function slugify(input) {
			return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
		}
		const captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
		function isObject(data) {
			return typeof data === "object" && data !== null && !Array.isArray(data);
		}
		const allowsEval = /* @__PURE__*/ cached(() => {
			if (globalConfig.jitless) return false;
			if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) return false;
			try {
				new Function("");
				return true;
			} catch (_) {
				return false;
			}
		});
		function isPlainObject(o) {
			if (isObject(o) === false) return false;
			const ctor = o.constructor;
			if (ctor === void 0) return true;
			if (typeof ctor !== "function") return true;
			const prot = ctor.prototype;
			if (isObject(prot) === false) return false;
			if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
			return true;
		}
		function shallowClone(o) {
			if (isPlainObject(o)) return { ...o };
			if (Array.isArray(o)) return [...o];
			if (o instanceof Map) return new Map(o);
			if (o instanceof Set) return new Set(o);
			return o;
		}
		const propertyKeyTypes = /* @__PURE__*/ new Set([
			"string",
			"number",
			"symbol"
		]);
		function escapeRegex(str) {
			return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		function clone(inst, def, params) {
			const cl = new inst._zod.constr(def ?? inst._zod.def);
			if (!def || params?.parent) cl._zod.parent = inst;
			return cl;
		}
		function normalizeParams(_params) {
			const params = _params;
			if (!params) return {};
			if (typeof params === "string") return { error: () => params };
			if (params?.message !== void 0) {
				if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
				params.error = params.message;
			}
			delete params.message;
			if (typeof params.error === "string") return {
				...params,
				error: () => params.error
			};
			return params;
		}
		function stringifyPrimitive(value) {
			if (typeof value === "bigint") return value.toString() + "n";
			if (typeof value === "string") return `"${value}"`;
			return `${value}`;
		}
		function optionalKeys(shape) {
			return Object.keys(shape).filter((k) => {
				return shape[k]._zod.optin !== void 0 && shape[k]._zod.optout === "optional";
			});
		}
		const NUMBER_FORMAT_RANGES = /*@__PURE__*/ (() => ({
			safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
			int32: [-2147483648, 2147483647],
			uint32: [0, 4294967295],
			float32: [-34028234663852886e22, 34028234663852886e22],
			float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
		}))();
		const BIGINT_FORMAT_RANGES = {
			int64: [/* @__PURE__*/ BigInt("-9223372036854775808"), /* @__PURE__*/ BigInt("9223372036854775807")],
			uint64: [/* @__PURE__*/ BigInt(0), /* @__PURE__*/ BigInt("18446744073709551615")]
		};
		function pick(schema, mask) {
			const currDef = schema._zod.def;
			const checks = currDef.checks;
			if (checks && checks.length > 0) throw new Error(".pick() cannot be used on object schemas containing refinements");
			const newShape = {};
			mirrorShape(newShape, schema, maskedKeys(schema, mask));
			return clone(schema, mergeDefs(currDef, {
				shape: newShape,
				checks: []
			}));
		}
		function maskedKeys(schema, mask) {
			const raw = sourceShape(schema);
			const keys = [];
			for (const key of Reflect.ownKeys(mask)) {
				if (!Object.getOwnPropertyDescriptor(raw, key)?.enumerable) throw new Error(`Unrecognized key: "${String(key)}"`);
				if (mask[key]) keys.push(key);
			}
			return keys;
		}
		function omit(schema, mask) {
			const currDef = schema._zod.def;
			const checks = currDef.checks;
			if (checks && checks.length > 0) throw new Error(".omit() cannot be used on object schemas containing refinements");
			const omitted = new Set(maskedKeys(schema, mask));
			const newShape = {};
			mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)).filter((key) => !omitted.has(key)));
			return clone(schema, mergeDefs(currDef, {
				shape: newShape,
				checks: []
			}));
		}
		function extend(schema, shape) {
			if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
			const checks = schema._zod.def.checks;
			if (checks && checks.length > 0) {
				const existingShape = sourceShape(schema);
				for (const key of Reflect.ownKeys(shape)) if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
			}
			return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
		}
		function extended(schema, shape) {
			const newShape = {};
			mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)));
			mirrorProps(newShape, shape);
			return newShape;
		}
		function safeExtend(schema, shape) {
			if (!isPlainObject(shape)) throw new Error("Invalid input to safeExtend: expected a plain object");
			return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
		}
		function merge(a, b) {
			if (!b?._zod?.def) throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
			if (a._zod.def.checks?.length) throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
			const newShape = {};
			mirrorShape(newShape, a, Reflect.ownKeys(sourceShape(a)));
			mirrorShape(newShape, b, Reflect.ownKeys(sourceShape(b)));
			return clone(a, mergeDefs(a._zod.def, {
				shape: newShape,
				get catchall() {
					return b._zod.def.catchall;
				},
				checks: b._zod.def.checks ?? []
			}));
		}
		function partial(Class, schema, mask, name = "partial") {
			const checks = schema._zod.def.checks;
			if (checks && checks.length > 0) throw new Error(`.${name}() cannot be used on object schemas containing refinements`);
			const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
			const newShape = {};
			mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), Class && ((value, key) => selected && !selected.has(key) ? value : new Class({
				type: "optional",
				innerType: value
			})));
			return clone(schema, mergeDefs(schema._zod.def, {
				shape: newShape,
				checks: []
			}));
		}
		function required(Class, schema, mask) {
			const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
			const newShape = {};
			mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), (value, key) => selected && !selected.has(key) ? value : new Class({
				type: "nonoptional",
				innerType: value
			}));
			return clone(schema, mergeDefs(schema._zod.def, { shape: newShape }));
		}
		function aborted(x, startIndex = 0) {
			if (x.aborted === true) return true;
			for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
			return false;
		}
		function explicitlyAborted(x, startIndex = 0) {
			if (x.aborted === true) return true;
			for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue === false) return true;
			return false;
		}
		function prefixIssues(path, issues) {
			return issues.map((iss) => {
				var _a;
				(_a = iss).path ?? (_a.path = []);
				iss.path.unshift(path);
				return iss;
			});
		}
		function unwrapMessage(message) {
			return typeof message === "string" ? message : message?.message;
		}
		function attachSchema(issues, start, inst) {
			var _a;
			for (let i = start; i < issues.length; i++) (_a = issues[i]).schema ?? (_a.schema = inst);
		}
		function finalizeIssue(iss, ctx, config) {
			var _a;
			const traits = iss.inst?._zod?.traits;
			if (traits?.has("$ZodType")) if (traits.has("$ZodCheck")) (_a = iss).schema ?? (_a.schema = iss.inst);
			else iss.schema = iss.inst;
			const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : void 0;
			const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
			const full = {};
			for (const k of Object.keys(iss)) {
				if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__") continue;
				full[k] = iss[k];
			}
			full.path ?? (full.path = []);
			full.message = message;
			if (ctx?.reportInput) full.input = iss.input;
			return full;
		}
		const highSurrogate = /[\uD800-\uDBFF]/;
		function codePointLength(str) {
			const units = str.length;
			if (!highSurrogate.test(str)) return units;
			let count = units;
			for (let i = 0; i < units - 1; i++) if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
				count--;
				i++;
			}
			return count;
		}
		function getLengthableOrigin(input) {
			if (Array.isArray(input)) return "array";
			if (typeof input === "string") return "string";
			return "unknown";
		}
		function parsedType(data) {
			const t = typeof data;
			switch (t) {
				case "number": return Number.isNaN(data) ? "nan" : "number";
				case "object": {
					if (data === null) return "null";
					if (Array.isArray(data)) return "array";
					const obj = data;
					if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) return obj.constructor.name;
				}
			}
			return t;
		}
		function issue(...args) {
			const [iss, input, inst] = args;
			if (typeof iss === "string") return {
				message: iss,
				code: "custom",
				input,
				inst
			};
			return { ...iss };
		}
		/**
		* Installs a trait's members on its prototype. Each value builds that member for the instance on first read; the built value shadows the accessor as an own property, so a detached `const { parse } = schema` keeps working.
		*
		* Call this from a `proto` initializer, which runs once per prototype — never per instance.
		*/
		function members(proto, table) {
			for (const key in table) {
				const desc = Object.getOwnPropertyDescriptor(table, key);
				if (desc.get) Object.defineProperty(proto, key, {
					...desc,
					enumerable: false
				});
				else defineBound(proto, key, desc.value);
			}
			for (const sym of Object.getOwnPropertySymbols(table)) defineBound(proto, sym, table[sym]);
		}
		/** Shadows a prototype member with an own value, so a getter that builds from the instance runs once. */
		function own(inst, key, value, enumerable = true) {
			Object.defineProperty(inst, key, {
				configurable: true,
				writable: true,
				enumerable,
				value
			});
			return value;
		}
		/** Like {@link own}, for a member that was never an own data property and has to stay out of `Object.keys`. */
		function hide(inst, key, value) {
			return own(inst, key, value, false);
		}
		/** Adds members a table derives from the instance: each builds on first read and shadows as own data, and assignment shadows the same way, as when these were own properties. */
		function derived(computes, table) {
			for (const key in computes) {
				const compute = computes[key];
				Object.defineProperty(table, key, {
					configurable: true,
					enumerable: true,
					get() {
						return own(this, key, compute(this));
					},
					set(value) {
						own(this, key, value);
					}
				});
			}
			return table;
		}
		function defineBound(proto, key, fn) {
			Object.defineProperty(proto, key, {
				configurable: true,
				get() {
					return this == null ? fn : own(this, key, fn.bind(this));
				},
				set(value) {
					own(this, key, value);
				}
			});
		}
		/** Returns the prototype to install on, or `undefined` if this group is already installed on it. */
		function claim(inst, sentinel) {
			const proto = Object.getPrototypeOf(inst);
			return sentinel in proto ? void 0 : proto;
		}
		let installing;
		let broke = false;
		const breaker = {
			configurable: true,
			get() {
				broke = true;
			}
		};
		/**
		* Installs a lazily-derived internal on the `_zod` prototype of `inst`'s
		* constructor, computed from the internals object itself and cached there on
		* first read. One accessor per constructor rather than one per instance.
		*/
		function defineLazyInternal(inst, key, compute) {
			const proto = Object.getPrototypeOf(inst._zod);
			if (key in proto && installing !== inst._zod) {
				installing = void 0;
				return;
			}
			installing = inst._zod;
			Object.defineProperty(proto, key, {
				configurable: true,
				get() {
					Object.defineProperty(this, key, breaker);
					const outer = broke;
					broke = false;
					try {
						const value = compute(this);
						if (broke) delete this[key];
						else Object.defineProperty(this, key, {
							configurable: true,
							writable: true,
							value
						});
						broke = broke || outer;
						return value;
					} catch (err) {
						delete this[key];
						broke = broke || outer;
						throw err;
					}
				},
				set(value) {
					Object.defineProperty(this, key, {
						configurable: true,
						writable: true,
						value
					});
				}
			});
		}
		/**
		* Installs `key` on `inst`'s prototype, computed by `make` on first read and cached there as an own
		* data property. One accessor per constructor rather than one per instance, because an own accessor
		* puts every instance after the first into v8 dictionary mode. The key doubles as the sentinel.
		*/
		function installLazyProp(inst, key, make, enumerable) {
			const proto = claim(inst, key);
			if (!proto) return;
			Object.defineProperty(proto, key, {
				configurable: true,
				get() {
					const desc = {
						configurable: true,
						writable: true,
						enumerable,
						value: void 0
					};
					Object.defineProperty(this, key, desc);
					desc.value = make(this);
					Object.defineProperty(this, key, desc);
					return desc.value;
				},
				set(value) {
					Object.defineProperty(this, key, {
						configurable: true,
						writable: true,
						enumerable,
						value
					});
				}
			});
		}
		/** Marks the thunk `_catch` synthesises for a constant catch value. `Function.length` cannot tell that thunk from a user callback — rest and defaulted parameters both report arity 0 — and a user callback reads `ctx.error`, whose issues only finalize correctly against the caller's per-parse error map. Provenance can say what arity cannot. A plain string key rather than `Symbol.for`, whose call at module scope no bundler can prove pure — the same shape that anchored `urlCanParse` into every build. */
		const CONSTANT_CATCH = "~constantCatch";
		/** Wraps a constant catch value in a thunk tagged with {@link CONSTANT_CATCH}. */
		function constantCatch(value) {
			const fn = () => value;
			fn[CONSTANT_CATCH] = true;
			return fn;
		}
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/core.js
		var _a$1;
		const _zodDesc = {
			value: void 0,
			enumerable: false
		};
		let _E = "captureStackTrace" in Error ? Error : null;
		function newError(Definition) {
			const E = _E;
			if (E) {
				const saved = E.stackTraceLimit;
				if (typeof saved === "number") {
					try {
						E.stackTraceLimit = 0;
					} catch {
						_E = null;
						return new Definition();
					}
					try {
						return new Definition();
					} finally {
						E.stackTraceLimit = saved;
					}
				}
			}
			return new Definition();
		}
		function $constructor(name, initializer, proto, params) {
			const zodProto = {};
			function Internals(def) {
				this.def = def;
				this.constr = _;
				this.traits = /* @__PURE__ */ new Set();
			}
			Internals.prototype = zodProto;
			const protoMembers = proto;
			const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
			function init(inst, def) {
				if (!inst._zod) {
					_zodDesc.value = new Internals(def);
					try {
						Object.defineProperty(inst, "_zod", _zodDesc);
					} finally {
						_zodDesc.value = void 0;
					}
				}
				if (inst._zod.traits.has(name)) return;
				inst._zod.traits.add(name);
				initializer(inst, def);
				if (initialized) {
					const own = Object.getPrototypeOf(inst);
					const ctorProto = inst._zod.constr.prototype;
					let up = own;
					while (up && up !== ctorProto) up = Object.getPrototypeOf(up);
					const target = up ?? own;
					if (!initialized.has(target)) {
						initialized.add(target);
						members(target, protoMembers);
					}
				}
				const proto = _.prototype;
				for (const k in proto) {
					if (!Object.prototype.hasOwnProperty.call(proto, k)) continue;
					if (!(k in inst)) inst[k] = proto[k].bind(inst);
				}
			}
			const Parent = params?.Parent ?? Object;
			class Definition extends Parent {}
			Object.defineProperty(Definition, "name", { value: name });
			function _(def) {
				const inst = params?.Parent ? newError(Definition) : this;
				init(inst, def);
				const deferred = inst._zod.deferred;
				if (deferred) {
					for (const fn of deferred) fn();
					inst._zod.deferred = void 0;
				}
				const pp = globalThis.__zod_globalConfig?.postProcessor;
				if (pp) pp(inst);
				return inst;
			}
			Object.defineProperty(_, "init", { value: init });
			Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
				if (params?.Parent && inst instanceof params.Parent) return true;
				return inst?._zod?.traits?.has(name);
			} });
			Object.defineProperty(_, "name", { value: name });
			return _;
		}
		var $ZodAsyncError = class extends Error {
			constructor() {
				super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
			}
		};
		var $ZodEncodeError = class extends Error {
			constructor(name) {
				super(`Encountered unidirectional transform during encode: ${name}`);
				this.name = "ZodEncodeError";
			}
		};
		(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
		const globalConfig = globalThis.__zod_globalConfig;
		function config(newConfig) {
			if (newConfig) Object.assign(globalConfig, newConfig);
			return globalConfig;
		}
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/errors.js
		function _getMessage() {
			const internals = this._zod;
			internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
			return internals.message;
		}
		function _setMessage(value) {
			this._zod.message = value;
		}
		const _messageDesc = {
			get: _getMessage,
			set: _setMessage,
			enumerable: true,
			configurable: true
		};
		const _issuesDesc = {
			value: void 0,
			enumerable: false
		};
		const _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
		const initializer$1 = (inst, def) => {
			inst.name = "$ZodError";
			_issuesDesc.value = def;
			Object.defineProperty(inst, "issues", _issuesDesc);
			_issuesDesc.value = void 0;
			Object.defineProperty(inst, "message", _messageDesc);
			const proto = Object.getPrototypeOf(inst);
			if (!_installedToString.has(proto)) {
				_installedToString.add(proto);
				Object.defineProperty(proto, "toString", {
					configurable: true,
					enumerable: false,
					get() {
						const value = () => this.message;
						Object.defineProperty(this, "toString", {
							value,
							configurable: true,
							writable: true
						});
						return value;
					},
					set(value) {
						Object.defineProperty(this, "toString", {
							value,
							configurable: true,
							writable: true
						});
					}
				});
			}
		};
		const $ZodError = $constructor("$ZodError", initializer$1);
		$constructor("$ZodError", initializer$1, void 0, { Parent: Error });
		/** Get-or-create `obj[key]` as an own data property. A path segment naming an inherited member
		* ("toString", "constructor") would otherwise read through to the prototype, and assigning
		* "__proto__" would hit the setter instead of creating a key. */
		function node(obj, key, make) {
			if (!Object.prototype.hasOwnProperty.call(obj, key)) if (key === "__proto__") Object.defineProperty(obj, key, {
				value: make(),
				writable: true,
				enumerable: true,
				configurable: true
			});
			else obj[key] = make();
			return obj[key];
		}
		function flattenError(error, mapper = (issue) => issue.message) {
			const fieldErrors = {};
			const formErrors = [];
			for (const sub of error.issues) if (sub.path.length > 0) node(fieldErrors, sub.path[0], () => []).push(mapper(sub));
			else formErrors.push(mapper(sub));
			return {
				formErrors,
				fieldErrors
			};
		}
		function formatError(error, mapper = (issue) => issue.message) {
			const fieldErrors = { _errors: [] };
			const processError = (error, path = []) => {
				for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
				else if (issue.code === "invalid_key") processError({ issues: issue.issues }, [...path, ...issue.path]);
				else if (issue.code === "invalid_element") processError({ issues: issue.issues }, [...path, ...issue.path]);
				else {
					const fullpath = [...path, ...issue.path];
					if (fullpath.length === 0) fieldErrors._errors.push(mapper(issue));
					else {
						let curr = fieldErrors;
						let i = 0;
						while (i < fullpath.length) {
							const el = fullpath[i];
							const terminal = i === fullpath.length - 1;
							if (el === "_errors") {
								if (terminal) curr._errors.push(mapper(issue));
								i++;
								continue;
							}
							if (!Object.prototype.hasOwnProperty.call(curr, el)) Object.defineProperty(curr, el, {
								value: { _errors: [] },
								enumerable: true,
								writable: true,
								configurable: true
							});
							const node = curr[el];
							if (terminal) node._errors.push(mapper(issue));
							curr = node;
							i++;
						}
					}
				}
			};
			processError(error);
			return fieldErrors;
		}
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/parse.js
		function finalizeParams(callee, params) {
			return {
				callee: params?.callee ?? callee,
				Err: params?.Err
			};
		}
		const _parse = (_Err) => {
			const fn = (schema, value, _ctx, _params) => {
				const ctx = _ctx ? {
					..._ctx,
					async: false
				} : { async: false };
				const result = schema._zod.run({
					value,
					issues: []
				}, ctx);
				if (result instanceof Promise) throw new $ZodAsyncError();
				if (result.issues.length) {
					const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
					captureStackTrace(e, _params?.callee ?? fn);
					throw e;
				}
				return result.value;
			};
			return fn;
		};
		const _parseAsync = (_Err) => {
			const fn = async (schema, value, _ctx, params) => {
				const ctx = _ctx ? {
					..._ctx,
					async: true
				} : { async: true };
				let result = schema._zod.run({
					value,
					issues: []
				}, ctx);
				if (result instanceof Promise) result = await result;
				if (result.issues.length) {
					const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
					captureStackTrace(e, params?.callee ?? fn);
					throw e;
				}
				return result.value;
			};
			return fn;
		};
		const _safeParse = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				async: false
			} : { async: false };
			const result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) throw new $ZodAsyncError();
			return result.issues.length ? failure(_Err, result.issues, ctx) : {
				success: true,
				data: result.value
			};
		};
		function failure(Err, issues, ctx) {
			let error;
			return {
				success: false,
				get error() {
					if (!error) {
						error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
						issues = void 0;
						ctx = void 0;
					}
					return error;
				},
				set error(e) {
					error = e;
					issues = void 0;
					ctx = void 0;
				}
			};
		}
		const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				async: true
			} : { async: true };
			let result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) result = await result;
			return result.issues.length ? failure(_Err, result.issues, ctx) : {
				success: true,
				data: result.value
			};
		};
		const COMPILE_INVALID = /* @__PURE__ */ Symbol.for("zod.compile.invalid");
		const COMPILE_FALLBACK = /* @__PURE__ */ Symbol.for("zod.compile.fallback");
		const validate = ((schema, value, _ctx) => {
			const validator = schema._zod.bag.validator;
			if (validator !== void 0) {
				if (validator(value) !== COMPILE_INVALID) return true;
				if (validator.definite === true && _ctx === void 0) return false;
			}
			return validateFallback(schema, value, _ctx);
		});
		function validateFallback(schema, value, _ctx) {
			const ctx = _ctx ? {
				..._ctx,
				async: false,
				abortEarly: true
			} : {
				async: false,
				abortEarly: true
			};
			const fallbackRun = schema._zod.bag.fallbackRun;
			let result;
			if (fallbackRun) {
				ctx[COMPILE_FALLBACK] = true;
				result = fallbackRun({
					value,
					issues: []
				}, ctx);
			} else result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) throw new $ZodAsyncError();
			return result.issues.length === 0;
		}
		const validateAsync$1 = async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				async: true,
				abortEarly: true
			} : {
				async: true,
				abortEarly: true
			};
			let result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) result = await result;
			return result.issues.length === 0;
		};
		const _encode = (_Err) => {
			const parse = _parse(_Err);
			const fn = (schema, value, _ctx, _params) => {
				const ctx = _ctx ? {
					..._ctx,
					direction: "backward"
				} : { direction: "backward" };
				return parse(schema, value, ctx, finalizeParams(fn, _params));
			};
			return fn;
		};
		const _decode = (_Err) => {
			const parse = _parse(_Err);
			const fn = (schema, value, _ctx, _params) => {
				return parse(schema, value, _ctx, finalizeParams(fn, _params));
			};
			return fn;
		};
		const _encodeAsync = (_Err) => {
			const parseAsync = _parseAsync(_Err);
			const fn = async (schema, value, _ctx, _params) => {
				const ctx = _ctx ? {
					..._ctx,
					direction: "backward"
				} : { direction: "backward" };
				return await parseAsync(schema, value, ctx, finalizeParams(fn, _params));
			};
			return fn;
		};
		const _decodeAsync = (_Err) => {
			const parseAsync = _parseAsync(_Err);
			const fn = async (schema, value, _ctx, _params) => {
				return await parseAsync(schema, value, _ctx, finalizeParams(fn, _params));
			};
			return fn;
		};
		const _safeEncode = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _safeParse(_Err)(schema, value, ctx);
		};
		const _safeDecode = (_Err) => (schema, value, _ctx) => {
			return _safeParse(_Err)(schema, value, _ctx);
		};
		const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _safeParseAsync(_Err)(schema, value, ctx);
		};
		const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
			return _safeParseAsync(_Err)(schema, value, _ctx);
		};
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/regexes.js
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link cuid2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const cuid = /^[cC][0-9a-z]{6,}$/;
		const cuid2 = /^[0-9a-z]+$/;
		const ulid = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;
		const xid = /^[0-9a-vA-V]{20}$/;
		const ksuid = /^[A-Za-z0-9]{27}$/;
		const nanoid = /^[a-zA-Z0-9_-]{21}$/;
		function nanoidOfLength(length) {
			return new RegExp(`^[a-zA-Z0-9_-]{${length}}$`);
		}
		/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
		const duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
		/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
		const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
		/** Returns a regex for validating an RFC 9562/4122 UUID.
		*
		* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
		const uuid = (version) => {
			if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
			return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
		};
		/** Practical email validation */
		const email = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
		const _emoji$1 = `^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`;
		function emoji() {
			return new RegExp(_emoji$1, "u");
		}
		const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
		const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
		const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
		const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
		const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
		const base64url = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/;
		const httpProtocol = /^https?$/;
		const e164 = /^\+[1-9]\d{6,14}$/;
		const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
		/** Anchors a pattern source. The interpolation lives here rather than at the call site because
		* esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
		* will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */
		function anchor(source) {
			return new RegExp(`^${source}$`);
		}
		const date = /*@__PURE__*/ anchor(dateSource);
		function timeSource(args) {
			const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
			return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : args.seconds ? `${hhmm}:[0-5]\\d(?:\\.\\d+)?` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
		}
		function time(args) {
			return new RegExp(`^${timeSource(args)}$`);
		}
		function datetime(args) {
			const opts = ["Z"];
			if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
			const qualified = `${timeSource({
				precision: args.precision,
				seconds: true
			})}(?:${opts.join("|")})`;
			const timeRegex = args.local ? `${qualified}|${timeSource({ precision: args.precision })}` : qualified;
			return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
		}
		const anyString = /^[\s\S]{0,}$/;
		const number$1 = /^-?\d+(?:\.\d+)?$/;
		const boolean$1 = /^(?:true|false)$/i;
		const _undefined$2 = /^undefined$/i;
		const lowercase = /^[^A-Z]*$/;
		const uppercase = /^[^a-z]*$/;
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/checks.js
		const $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
			var _a;
			inst._zod ?? (inst._zod = {});
			inst._zod.def = def;
			(_a = inst._zod).onattach ?? (_a.onattach = []);
		});
		/** Default `when` for length-based checks: run only on non-nullish values with a `length`. */
		const _whenHasLength = (payload) => {
			const val = payload.value;
			return !nullish(val) && val.length !== void 0;
		};
		const numericOriginMap = {
			number: "number",
			bigint: "bigint",
			object: "date"
		};
		const $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
			$ZodCheck.init(inst, def);
			const origin = numericOriginMap[typeof def.value];
			inst._zod.check = (payload) => {
				if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
				payload.issues.push({
					origin: numericOriginMap[typeof payload.value] ?? origin,
					code: "too_big",
					maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
					input: payload.value,
					inclusive: def.inclusive,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
			$ZodCheck.init(inst, def);
			const origin = numericOriginMap[typeof def.value];
			inst._zod.check = (payload) => {
				if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
				payload.issues.push({
					origin: numericOriginMap[typeof payload.value] ?? origin,
					code: "too_small",
					minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
					input: payload.value,
					inclusive: def.inclusive,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMultipleOf = /*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
			$ZodCheck.init(inst, def);
			inst._zod.check = (payload) => {
				if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
				if (typeof payload.value === "bigint" ? def.value !== BigInt(0) && payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
				payload.issues.push({
					origin: typeof payload.value,
					code: "not_multiple_of",
					divisor: def.value,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
			$ZodCheck.init(inst, def);
			def.format = def.format || "float64";
			const isInt = def.format?.includes("int");
			const origin = isInt ? "int" : "number";
			const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
			inst._zod.check = (payload) => {
				const input = payload.value;
				if (isInt) {
					if (!Number.isInteger(input)) {
						payload.issues.push({
							expected: origin,
							format: def.format,
							code: "invalid_type",
							continue: false,
							input,
							inst
						});
						return;
					}
					if (!Number.isSafeInteger(input)) {
						if (input > 0) payload.issues.push({
							input,
							code: "too_big",
							maximum: Number.MAX_SAFE_INTEGER,
							note: "Integers must be within the safe integer range.",
							inst,
							origin,
							inclusive: true,
							continue: !def.abort
						});
						else payload.issues.push({
							input,
							code: "too_small",
							minimum: Number.MIN_SAFE_INTEGER,
							note: "Integers must be within the safe integer range.",
							inst,
							origin,
							inclusive: true,
							continue: !def.abort
						});
						return;
					}
				}
				if (input < minimum) payload.issues.push({
					origin: "number",
					input,
					code: "too_small",
					minimum,
					inclusive: true,
					inst,
					continue: !def.abort
				});
				if (input > maximum) payload.issues.push({
					origin: "number",
					input,
					code: "too_big",
					maximum,
					inclusive: true,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
			inst._zod.check = (payload) => {
				const input = payload.value;
				const units = input.length;
				if ((typeof input === "string" && units > def.maximum ? codePointLength(input) : units) <= def.maximum) return;
				const origin = getLengthableOrigin(input);
				payload.issues.push({
					origin,
					code: "too_big",
					maximum: def.maximum,
					inclusive: true,
					input,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
			inst._zod.check = (payload) => {
				const input = payload.value;
				const units = input.length;
				if ((typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units) >= def.minimum) return;
				const origin = getLengthableOrigin(input);
				payload.issues.push({
					origin,
					code: "too_small",
					minimum: def.minimum,
					inclusive: true,
					input,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
			inst._zod.check = (payload) => {
				const input = payload.value;
				const units = input.length;
				const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
				if (length === def.length) return;
				const origin = getLengthableOrigin(input);
				const tooBig = length > def.length;
				payload.issues.push({
					origin,
					...tooBig ? {
						code: "too_big",
						maximum: def.length
					} : {
						code: "too_small",
						minimum: def.length
					},
					inclusive: true,
					exact: true,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
			var _a, _b;
			$ZodCheck.init(inst, def);
			if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
				def.pattern.lastIndex = 0;
				if (def.pattern.test(payload.value)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: def.format,
					input: payload.value,
					...def.pattern ? { pattern: def.pattern.toString() } : {},
					inst,
					continue: !def.abort
				});
			});
			else (_b = inst._zod).check ?? (_b.check = () => {});
		});
		const $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
			$ZodCheckStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				def.pattern.lastIndex = 0;
				if (def.pattern.test(payload.value)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "regex",
					input: payload.value,
					pattern: def.pattern.toString(),
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
			def.pattern ?? (def.pattern = lowercase);
			$ZodCheckStringFormat.init(inst, def);
		});
		const $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
			def.pattern ?? (def.pattern = uppercase);
			$ZodCheckStringFormat.init(inst, def);
		});
		const $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
			$ZodCheck.init(inst, def);
			const escapedRegex = escapeRegex(def.includes);
			def.pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position},}${escapedRegex}` : escapedRegex);
			inst._zod.check = (payload) => {
				if (payload.value.includes(def.includes, def.position)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "includes",
					includes: def.includes,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
			$ZodCheck.init(inst, def);
			const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
			def.pattern ?? (def.pattern = pattern);
			inst._zod.check = (payload) => {
				if (payload.value.startsWith(def.prefix)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "starts_with",
					prefix: def.prefix,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
			$ZodCheck.init(inst, def);
			const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
			def.pattern ?? (def.pattern = pattern);
			inst._zod.check = (payload) => {
				if (payload.value.endsWith(def.suffix)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "ends_with",
					suffix: def.suffix,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
			$ZodCheck.init(inst, def);
			inst._zod.check = (payload) => {
				payload.value = def.tx(payload.value);
			};
		});
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/doc.js
		var Doc = class {
			constructor(args = [], closed = {}) {
				this.content = [];
				this.indent = 0;
				this.args = args;
				this.closed = closed;
			}
			indented(fn) {
				this.indent += 1;
				try {
					fn(this);
				} finally {
					this.indent -= 1;
				}
			}
			write(arg) {
				if (typeof arg === "function") {
					arg(this, { execution: "sync" });
					arg(this, { execution: "async" });
					return;
				}
				const lines = arg.split("\n").filter((x) => x);
				const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
				const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
				for (const line of dedented) this.content.push(line);
			}
			compile() {
				const F = Function;
				const content = this?.content ?? [``];
				return new F(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {\n${content.join("\n")}\n};`)(...Object.values(this.closed));
			}
		};
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/versions.js
		const version = {
			major: 4,
			minor: 6,
			patch: 1
		};
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/schemas.js
		const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
			var _a;
			inst ?? (inst = {});
			inst._zod.def = def;
			inst._zod.bag = inst._zod.bag || {};
			inst._zod.version = version;
			const defChecks = inst._zod.def.checks;
			const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
			for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
			if (checks.length === 0) {
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				inst._zod.deferred?.push(() => {
					inst._zod.run = inst._zod.parse;
				});
			} else {
				const runChecks = (payload, checks, ctx) => {
					if (payload.memo) return payload;
					let isAborted = aborted(payload);
					let asyncResult;
					for (const ch of checks) {
						if (ch._zod.def.when) {
							if (explicitlyAborted(payload)) continue;
							if (!ch._zod.def.when(payload)) continue;
						} else if (isAborted) continue;
						const currLen = payload.issues.length;
						const _ = ch._zod.check(payload);
						if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
						if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
							await _;
							if (payload.issues.length === currLen) return;
							attachSchema(payload.issues, currLen, inst);
							if (!isAborted) isAborted = aborted(payload, currLen);
						});
						else {
							if (payload.issues.length === currLen) continue;
							attachSchema(payload.issues, currLen, inst);
							if (!isAborted) isAborted = aborted(payload, currLen);
						}
					}
					if (asyncResult) return asyncResult.then(() => {
						return payload;
					});
					return payload;
				};
				const handleCanaryResult = (canary, payload, ctx) => {
					if (aborted(canary)) {
						canary.aborted = true;
						return canary;
					}
					const checkResult = runChecks(payload, checks, ctx);
					if (checkResult instanceof Promise) {
						if (ctx.async === false) throw new $ZodAsyncError();
						return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
					}
					return inst._zod.parse(checkResult, ctx);
				};
				inst._zod.run = (payload, ctx) => {
					if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
					if (ctx.direction === "backward") {
						const canary = inst._zod.parse({
							value: payload.value,
							issues: []
						}, {
							...ctx,
							skipChecks: true
						});
						if (canary instanceof Promise) return canary.then((canary) => {
							return handleCanaryResult(canary, payload, ctx);
						});
						return handleCanaryResult(canary, payload, ctx);
					}
					const result = inst._zod.parse(payload, ctx);
					if (result instanceof Promise) {
						if (ctx.async === false) throw new $ZodAsyncError();
						return result.then((result) => runChecks(result, checks, ctx));
					}
					return runChecks(result, checks, ctx);
				};
			}
		}, {
			get "~standard"() {
				return hide(this, "~standard", standardProps(this));
			},
			set "~standard"(value) {
				own(this, "~standard", value);
			}
		});
		/** The Standard Schema surface for `inst`. Shared so wrappers can extend it without forcing it. */
		const toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
		async function validateAsync(inst, value) {
			const ctx = { async: true };
			return toStandardResult(await inst._zod.run({
				value,
				issues: []
			}, ctx), ctx);
		}
		function standardProps(inst) {
			return {
				validate: (value) => {
					const ctx = { async: false };
					try {
						const r = inst._zod.run({
							value,
							issues: []
						}, ctx);
						if (!(r instanceof Promise)) return toStandardResult(r, ctx);
					} catch (_) {}
					return validateAsync(inst, value);
				},
				vendor: "zod",
				version: 1
			};
		}
		const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = def.pattern ?? anyString;
			inst._zod.parse = (payload, _) => {
				if (def.coerce) try {
					payload.value = String(payload.value);
				} catch (_) {}
				if (typeof payload.value === "string") return payload;
				payload.issues.push({
					expected: "string",
					code: "invalid_type",
					input: payload.value,
					inst
				});
				return payload;
			};
		});
		const $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
			$ZodCheckStringFormat.init(inst, def);
			$ZodString.init(inst, def);
		});
		const $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
			def.pattern ?? (def.pattern = guid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
			if (def.version) {
				const v = {
					v1: 1,
					v2: 2,
					v3: 3,
					v4: 4,
					v5: 5,
					v6: 6,
					v7: 7,
					v8: 8
				}[def.version];
				if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
				def.pattern ?? (def.pattern = uuid(v));
			} else def.pattern ?? (def.pattern = uuid());
			$ZodStringFormat.init(inst, def);
		});
		const $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
			def.pattern ?? (def.pattern = email);
			$ZodStringFormat.init(inst, def);
		});
		/** Parses a URL for `$ZodURL`, applying the one guard the URL constructor cannot express. Returns the parsed URL, or a code naming the stage that rejected it — the runtime needs that distinction to pick an issue note, and compiled code only needs to know it is not a URL. */
		function parseURLObject(trimmed, def) {
			if (!def.normalize && def.protocol?.source === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) return 1;
			try {
				return new URL(trimmed);
			} catch {
				return 2;
			}
		}
		const asciiTabOrNewline = /[\t\n\r]/g;
		/** The URL parser deletes every ASCII tab, LF and CR from its input before it parses, so `new URL("https://exa\nmple.com")` reports on `example.com`. Applying the same deletion to the returned value closes the half of that divergence which can move the host; the parser's other rewrite, stripping C0 controls at the edges, cannot. */
		function stripTabAndNewline(value) {
			return value.replace(asciiTabOrNewline, "");
		}
		function urlHostnameOk(url, hostname) {
			hostname.lastIndex = 0;
			return hostname.test(url.hostname);
		}
		function urlProtocolOk(url, protocol) {
			protocol.lastIndex = 0;
			return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
		}
		const $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				try {
					const trimmed = payload.value.trim();
					const url = parseURLObject(trimmed, def);
					if (url === 1) {
						payload.issues.push({
							code: "invalid_format",
							format: "url",
							note: "Invalid URL format",
							input: payload.value,
							inst,
							continue: !def.abort
						});
						return;
					}
					if (url === 2) {
						payload.issues.push({
							code: "invalid_format",
							format: "url",
							input: payload.value,
							inst,
							continue: !def.abort
						});
						return;
					}
					if (def.hostname && !urlHostnameOk(url, def.hostname)) payload.issues.push({
						code: "invalid_format",
						format: "url",
						note: "Invalid hostname",
						pattern: def.hostname.source,
						input: payload.value,
						inst,
						continue: !def.abort
					});
					if (def.protocol && !urlProtocolOk(url, def.protocol)) payload.issues.push({
						code: "invalid_format",
						format: "url",
						note: "Invalid protocol",
						pattern: def.protocol.source,
						input: payload.value,
						inst,
						continue: !def.abort
					});
					payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
					return;
				} catch (_) {
					payload.issues.push({
						code: "invalid_format",
						format: "url",
						input: payload.value,
						inst,
						continue: !def.abort
					});
				}
			};
		});
		const $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
			def.pattern ?? (def.pattern = emoji());
			$ZodStringFormat.init(inst, def);
		});
		const $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
			if (def.length !== void 0 && (!Number.isInteger(def.length) || def.length < 1)) throw new Error(`Invalid nanoid length: ${def.length}`);
			def.pattern ?? (def.pattern = def.length === void 0 ? nanoid : nanoidOfLength(def.length));
			$ZodStringFormat.init(inst, def);
		});
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
			def.pattern ?? (def.pattern = cuid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
			def.pattern ?? (def.pattern = cuid2);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
			def.pattern ?? (def.pattern = ulid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
			def.pattern ?? (def.pattern = xid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
			def.pattern ?? (def.pattern = ksuid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
			def.pattern ?? (def.pattern = datetime(def));
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
			def.pattern ?? (def.pattern = date);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
			def.pattern ?? (def.pattern = time(def));
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
			def.pattern ?? (def.pattern = duration);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
			def.pattern ?? (def.pattern = ipv4);
			$ZodStringFormat.init(inst, def);
		});
		/** An IPv6 address is written with hex digits, colons and dots, and nothing else. The guard is what makes the check below an IPv6 check: `new URL("http://[...]")` parses an authority, not an address, so `@` and `\` re-delimit it and `"::@1\\"` validates against the host `0.0.0.1`. The URL parser also deletes ASCII tab, LF and CR rather than failing, which is how `"::1\n"` validated as `::1`. */
		const ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
		function isValidIPv6(value) {
			if (!ipv6Alphabet.test(value)) return false;
			try {
				new URL(`http://[${value}]`);
				return true;
			} catch {
				return false;
			}
		}
		const $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
			def.pattern ?? (def.pattern = ipv6);
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				if (!isValidIPv6(payload.value)) payload.issues.push({
					code: "invalid_format",
					format: "ipv6",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
			def.pattern ?? (def.pattern = cidrv4);
			$ZodStringFormat.init(inst, def);
		});
		function isValidCIDRv6(value) {
			const parts = value.split("/");
			if (parts.length !== 2) return false;
			const [address, prefix] = parts;
			if (!prefix) return false;
			const prefixNum = Number(prefix);
			if (`${prefixNum}` !== prefix) return false;
			if (prefixNum < 0 || prefixNum > 128) return false;
			return isValidIPv6(address);
		}
		const $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
			def.pattern ?? (def.pattern = cidrv6);
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				if (!isValidCIDRv6(payload.value)) payload.issues.push({
					code: "invalid_format",
					format: "cidrv6",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		function isValidBase64(data) {
			if (data === "") return true;
			if (/\s/.test(data)) return false;
			if (data.length % 4 !== 0) return false;
			try {
				atob(data);
				return true;
			} catch {
				return false;
			}
		}
		const base64Charset = /^[0-9a-zA-Z+/]*={0,2}$/;
		const $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
			def.pattern ?? (def.pattern = base64Charset);
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				if (isValidBase64(payload.value)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "base64",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const base64urlCharset = /^[A-Za-z0-9_-]*$/;
		function isValidBase64URL(data) {
			if (!base64urlCharset.test(data)) return false;
			const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
			return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
		}
		const $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
			def.pattern ?? (def.pattern = base64urlCharset);
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				if (isValidBase64URL(payload.value)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "base64url",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
			def.pattern ?? (def.pattern = e164);
			$ZodStringFormat.init(inst, def);
		});
		function isValidJWT(token, algorithm = null) {
			try {
				const tokensParts = token.split(".");
				if (tokensParts.length !== 3) return false;
				const [header] = tokensParts;
				if (!header) return false;
				const parsedHeader = JSON.parse(atob(header));
				if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
				if (!parsedHeader.alg) return false;
				if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
				return true;
			} catch {
				return false;
			}
		}
		const $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				if (isValidJWT(payload.value, def.alg)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "jwt",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = number$1;
			inst._zod.parse = (payload, _ctx) => {
				if (def.coerce) try {
					payload.value = Number(payload.value);
				} catch (_) {}
				const input = payload.value;
				if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
				const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : void 0 : void 0;
				payload.issues.push({
					expected: "number",
					code: "invalid_type",
					input,
					inst,
					...received ? { received } : {}
				});
				return payload;
			};
		});
		const $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
			$ZodCheckNumberFormat.init(inst, def);
			$ZodNumber.init(inst, def);
		});
		const $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = boolean$1;
			inst._zod.parse = (payload, _ctx) => {
				if (def.coerce) try {
					payload.value = Boolean(payload.value);
				} catch (_) {}
				const input = payload.value;
				if (typeof input === "boolean") return payload;
				payload.issues.push({
					expected: "boolean",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodUndefined = /*@__PURE__*/ $constructor("$ZodUndefined", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = _undefined$2;
			inst._zod.values = /* @__PURE__ */ new Set([void 0]);
			inst._zod.parse = (payload, _ctx) => {
				const input = payload.value;
				if (typeof input === "undefined") return payload;
				payload.issues.push({
					expected: "undefined",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload) => payload;
		});
		const $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, _ctx) => {
				payload.issues.push({
					expected: "never",
					code: "invalid_type",
					input: payload.value,
					inst
				});
				return payload;
			};
		});
		function handleArrayResult(result, final, index) {
			if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
			final.value[index] = result.value;
		}
		const $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
			$ZodType.init(inst, def);
			const memo = globalConfig.memoizer;
			memo?.attach(inst);
			inst._zod.parse = (payload, ctx) => {
				const input = payload.value;
				if (!Array.isArray(input)) {
					payload.issues.push({
						expected: "array",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
				const proms = [];
				const abortEarly = ctx?.abortEarly;
				for (let i = 0; i < input.length; i++) {
					const item = input[i];
					const result = def.element._zod.run({
						value: item,
						issues: []
					}, ctx);
					if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
					else {
						handleArrayResult(result, payload, i);
						if (abortEarly && result.issues.length !== 0 && aborted(result)) break;
					}
				}
				if (proms.length) return Promise.all(proms).then(() => payload);
				return payload;
			};
		});
		function handlePropertyResult(result, final, key, input, optin, optout) {
			const isPresent = key in input;
			const isOptionalOut = optout === "optional";
			if (!isPresent && isOptionalOut && optin === "optional") return;
			if (result.issues.length) {
				if (optin !== void 0 && isOptionalOut && !isPresent) return;
				final.issues.push(...prefixIssues(key, result.issues));
			}
			if (!isPresent && optin === void 0) {
				if (!result.issues.length) final.issues.push({
					code: "invalid_type",
					expected: "nonoptional",
					input: void 0,
					path: [key]
				});
				return;
			}
			if (result.value === void 0) {
				if (isPresent) final.value[key] = void 0;
			} else final.value[key] = result.value;
		}
		const NO_SYMBOL_KEYS = [];
		function normalizeDef(def) {
			const keys = Object.keys(def.shape);
			const ownSymbols = Object.getOwnPropertySymbols(def.shape);
			const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
			const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
			for (const k of allKeys) if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
			const okeys = optionalKeys(def.shape);
			return {
				...def,
				allKeys,
				symbolKeys,
				keySet: new Set(keys),
				numKeys: keys.length,
				optionalKeys: new Set(okeys)
			};
		}
		function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
			const unrecognized = [];
			const keySet = def.keySet;
			const _catchall = def.catchall._zod;
			const t = _catchall.def.type;
			const optin = _catchall.optin;
			const optout = _catchall.optout;
			let seen = 0;
			for (const key in input) {
				if (abortEarly && payload.issues.length !== seen) {
					if (aborted(payload, seen)) break;
					seen = payload.issues.length;
				}
				if (keySet.has(key)) continue;
				if (key === "__proto__") {
					if (t === "never") unrecognized.push(key);
					continue;
				}
				if (t === "never") {
					unrecognized.push(key);
					continue;
				}
				const r = _catchall.run({
					value: input[key],
					issues: []
				}, ctx);
				if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
				else handlePropertyResult(r, payload, key, input, optin, optout);
			}
			if (unrecognized.length) payload.issues.push({
				code: "unrecognized_keys",
				keys: unrecognized,
				input,
				inst,
				continue: true
			});
			if (!proms.length) return payload;
			return Promise.all(proms).then(() => {
				return payload;
			});
		}
		const $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
			$ZodType.init(inst, def);
			const desc = Object.getOwnPropertyDescriptor(def, "shape");
			const sh = desc?.get ? desc.get.raw : def.shape ?? {};
			if (sh) {
				const get = () => {
					const newSh = { ...sh };
					Object.defineProperty(def, "shape", { value: newSh });
					get.raw = newSh;
					return newSh;
				};
				get.raw = sh;
				Object.defineProperty(def, "shape", { get });
			}
			const _normalized = cached(() => normalizeDef(def));
			defineLazyInternal(inst, "propValues", (zod) => {
				const shape = zod.def.shape;
				const propValues = {};
				for (const key in shape) {
					const field = shape[key]._zod;
					if (field.values) {
						if (!Object.prototype.hasOwnProperty.call(propValues, key)) assignProp(propValues, key, /* @__PURE__ */ new Set());
						for (const v of field.values) propValues[key].add(v);
						if (field.optin !== void 0) propValues[key].add(void 0);
					}
				}
				return propValues;
			});
			const isObject$1 = isObject;
			const catchall = def.catchall;
			let value;
			const memo = globalConfig.memoizer;
			memo?.attach(inst);
			inst._zod.parse = (payload, ctx) => {
				value ?? (value = _normalized.value);
				const input = payload.value;
				if (!isObject$1(input)) {
					payload.issues.push({
						expected: "object",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
				const proms = [];
				const shape = value.shape;
				const abortEarly = ctx?.abortEarly;
				let seen = payload.issues.length;
				for (const key of value.allKeys) {
					if (abortEarly && payload.issues.length !== seen) {
						if (aborted(payload, seen)) break;
						seen = payload.issues.length;
					}
					if (key === "__proto__") continue;
					const el = shape[key];
					const optin = el._zod.optin;
					const optout = el._zod.optout;
					const r = el._zod.run({
						value: input[key],
						issues: []
					}, ctx);
					if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
					else handlePropertyResult(r, payload, key, input, optin, optout);
				}
				if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
				return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
			};
		});
		const $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
			$ZodObject.init(inst, def);
			const superParse = inst._zod.parse;
			const _normalized = cached(() => normalizeDef(def));
			const memo = globalConfig.memoizer;
			const generateFastpass = (shape) => {
				const normalized = _normalized.value;
				const syms = normalized.symbolKeys;
				const doc = new Doc(["payload", "ctx"], {
					shape,
					inst,
					memo,
					syms
				});
				const parseStr = (k) => `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
				const prefixStr = (id, k) => `
          let ${id}_ab = false;
          for (let i = 0; i < ${id}.issues.length; i++) {
            const iss = ${id}.issues[i];
            iss.path = iss.path ? [${k}, ...iss.path] : [${k}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${id}_ab = true;
          }
          if (${id}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
				doc.write(`const input = payload.value;`);
				const ids = Object.create(null);
				let counter = 0;
				for (const key of normalized.allKeys) ids[key] = `key_${counter++}`;
				doc.write(memo ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`);
				for (const key of normalized.allKeys) {
					if (key === "__proto__") continue;
					const id = ids[key];
					const k = typeof key === "symbol" ? `syms[${syms.indexOf(key)}]` : esc(key);
					const isPresent = `${k} in input`;
					const schema = shape[key];
					const optin = schema?._zod?.optin;
					const isOptionalIn = optin !== void 0;
					const isOptionalOut = schema?._zod?.optout === "optional";
					doc.write(`const ${id} = ${parseStr(k)};`);
					if (isOptionalIn && isOptionalOut) {
						const assign = optin === "optional" ? `${id}_present` : `${id}.value !== undefined || ${id}_present`;
						doc.write(`
        const ${id}_present = ${isPresent};
        if (!${id}.issues.length || ${id}_present) {
          if (${id}.issues.length) {${prefixStr(id, k)}
          }

          if (${assign}) {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
					} else if (!isOptionalIn) doc.write(`
        const ${id}_present = ${isPresent};
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${id}_present) {
          newResult[${k}] = ${id}.value;
        }

      `);
					else doc.write(`
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        
        if (${id}.value === undefined) {
          if (${isPresent}) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }

      `);
				}
				doc.write(`payload.value = newResult;`);
				doc.write(`return payload;`);
				return doc.compile();
			};
			let fastpass;
			const isObject$2 = isObject;
			const jit = !globalConfig.jitless;
			const fastEnabled = jit && allowsEval.value;
			const catchall = def.catchall;
			let value;
			inst._zod.parse = (payload, ctx) => {
				value ?? (value = _normalized.value);
				const input = payload.value;
				if (!isObject$2(input)) {
					payload.issues.push({
						expected: "object",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
					if (!fastpass) fastpass = generateFastpass(def.shape);
					payload = fastpass(payload, ctx);
					if (!catchall) return payload;
					return handleCatchall([], input, payload, ctx, value, inst, ctx?.abortEarly === true);
				}
				return superParse(payload, ctx);
			};
		});
		function handleUnionResults(results, final, inst, ctx) {
			for (const result of results) if (result.issues.length === 0) {
				final.value = result.value;
				return final;
			}
			const nonaborted = results.filter((r) => !aborted(r));
			if (nonaborted.length === 1) {
				final.value = nonaborted[0].value;
				return nonaborted[0];
			}
			final.issues.push({
				code: "invalid_union",
				input: final.value,
				inst,
				errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
			});
			return final;
		}
		const $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== void 0) ? "optional" : void 0);
			defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
			defineLazyInternal(inst, "values", (zod) => {
				if (zod.def.options.every((o) => o._zod.values)) return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
			});
			defineLazyInternal(inst, "pattern", (zod) => {
				if (zod.def.options.every((o) => o._zod.pattern)) {
					const patterns = zod.def.options.map((o) => o._zod.pattern);
					return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
				}
			});
			const first = def.options.length === 1 ? def.options[0]._zod.run : null;
			inst._zod.parse = (payload, ctx) => {
				if (first) return first(payload, ctx);
				let async = false;
				const results = [];
				for (const option of def.options) {
					const result = option._zod.run({
						value: payload.value,
						issues: []
					}, ctx);
					if (result instanceof Promise) {
						results.push(result);
						async = true;
					} else {
						if (result.issues.length === 0) return result;
						results.push(result);
					}
				}
				if (!async) return handleUnionResults(results, payload, inst, ctx);
				return Promise.all(results).then((results) => {
					return handleUnionResults(results, payload, inst, ctx);
				});
			};
		});
		const $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, ctx) => {
				const input = payload.value;
				const left = def.left._zod.run({
					value: input,
					issues: []
				}, ctx);
				const right = def.right._zod.run({
					value: input,
					issues: []
				}, ctx);
				if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
					return handleIntersectionResults(payload, left, right);
				});
				return handleIntersectionResults(payload, left, right);
			};
		});
		function mergeValues(a, b) {
			if (a === b) return {
				valid: true,
				data: a
			};
			if (a instanceof Date && b instanceof Date && +a === +b) return {
				valid: true,
				data: a
			};
			if (isPlainObject(a) && isPlainObject(b)) {
				const bKeys = Object.keys(b);
				const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
				const newObj = {
					...a,
					...b
				};
				if (Object.prototype.hasOwnProperty.call(newObj, "__proto__")) delete newObj.__proto__;
				for (const key of sharedKeys) {
					if (key === "__proto__") continue;
					const sharedValue = mergeValues(a[key], b[key]);
					if (!sharedValue.valid) return {
						valid: false,
						mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
					};
					newObj[key] = sharedValue.data;
				}
				return {
					valid: true,
					data: newObj
				};
			}
			if (Array.isArray(a) && Array.isArray(b)) {
				if (a.length !== b.length) return {
					valid: false,
					mergeErrorPath: []
				};
				const newArray = [];
				for (let index = 0; index < a.length; index++) {
					const itemA = a[index];
					const itemB = b[index];
					const sharedValue = mergeValues(itemA, itemB);
					if (!sharedValue.valid) return {
						valid: false,
						mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
					};
					newArray.push(sharedValue.data);
				}
				return {
					valid: true,
					data: newArray
				};
			}
			return {
				valid: false,
				mergeErrorPath: []
			};
		}
		function handleIntersectionResults(result, left, right) {
			const unrecKeys = /* @__PURE__ */ new Map();
			let unrecIssue;
			const keyIssues = /* @__PURE__ */ new Map();
			const collect = (iss, side) => {
				let keys;
				if (iss.code === "unrecognized_keys" && !iss.path?.length) {
					unrecIssue ?? (unrecIssue = iss);
					keys = iss.keys;
				} else if (iss.code === "invalid_key" && iss.origin === "record" && iss.path?.length === 1) {
					const k = String(iss.path[0]);
					if (!keyIssues.has(k)) keyIssues.set(k, iss);
					keys = [k];
				} else return false;
				for (const k of keys) {
					if (!unrecKeys.has(k)) unrecKeys.set(k, {});
					unrecKeys.get(k)[side] = true;
				}
				return true;
			};
			for (const iss of left.issues) if (!collect(iss, "l")) result.issues.push(iss);
			for (const iss of right.issues) if (!collect(iss, "r")) result.issues.push(iss);
			const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
			if (bothKeys.length) {
				const aggregated = unrecIssue ? bothKeys.filter((k) => unrecIssue.keys.includes(k)) : [];
				if (aggregated.length) result.issues.push({
					...unrecIssue,
					keys: aggregated
				});
				for (const k of bothKeys) if (!aggregated.includes(k) && keyIssues.has(k)) result.issues.push(keyIssues.get(k));
			}
			const merged = mergeValues(left.value, right.value);
			if (!merged.valid) {
				if (aborted(result)) return result;
				throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
			}
			result.value = merged.data;
			return result;
		}
		const $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
			$ZodType.init(inst, def);
			const values = getEnumValues(def.entries);
			const valuesSet = new Set(values);
			inst._zod.values = valuesSet;
			defineLazyInternal(inst, "pattern", (zod) => {
				const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
				return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
			});
			inst._zod.parse = (payload, _ctx) => {
				const input = payload.value;
				if (valuesSet.has(input)) return payload;
				payload.issues.push({
					code: "invalid_value",
					values,
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
			$ZodType.init(inst, def);
			const values = new Set(def.values);
			inst._zod.values = values;
			defineLazyInternal(inst, "pattern", (zod) => {
				const vals = zod.def.values;
				return new RegExp(vals.length ? `^(${vals.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$` : "^[^\\s\\S]$");
			});
			inst._zod.parse = (payload, _ctx) => {
				const input = payload.value;
				if (values.has(input)) return payload;
				payload.issues.push({
					code: "invalid_value",
					values: def.values,
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			globalConfig.memoizer?.guard(inst);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
				const _out = def.transform(payload.value, payload);
				if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
					payload.value = output;
					return payload;
				});
				if (_out instanceof Promise) throw new $ZodAsyncError();
				payload.value = _out;
				return payload;
			};
		});
		function handleOptionalResult(payload, result) {
			payload.value = result.issues.length ? void 0 : result.value;
			return payload;
		}
		const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
			inst._zod.optout = "optional";
			defineLazyInternal(inst, "values", (zod) => {
				const values = zod.def.innerType._zod.values;
				return values ? /* @__PURE__ */ new Set([...values, void 0]) : void 0;
			});
			defineLazyInternal(inst, "pattern", (zod) => {
				const pattern = zod.def.innerType._zod.pattern;
				return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				if (payload.value === void 0) {
					if (def.innerType._zod.optin !== "defaulted") return payload;
					const result = def.innerType._zod.run({
						value: payload.value,
						issues: []
					}, ctx);
					if (result instanceof Promise) return result.then((result) => handleOptionalResult(payload, result));
					return handleOptionalResult(payload, result);
				}
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
			$ZodOptional.init(inst, def);
			defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
			defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
			inst._zod.parse = (payload, ctx) => {
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
			defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
			defineLazyInternal(inst, "pattern", (zod) => {
				const pattern = zod.def.innerType._zod.pattern;
				return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
			});
			defineLazyInternal(inst, "values", (zod) => {
				return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				if (payload.value === null) return payload;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "defaulted";
			defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				if (payload.value === void 0) {
					payload.value = def.defaultValue;
					/**
					* $ZodDefault returns the default value immediately in forward direction.
					* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
					return payload;
				}
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
				return handleDefaultResult(result, def);
			};
		});
		function handleDefaultResult(payload, def) {
			if (payload.value === void 0) payload.value = def.defaultValue;
			return payload;
		}
		const $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "defaulted";
			defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				if (payload.value === void 0) payload.value = def.defaultValue;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazyInternal(inst, "values", (zod) => {
				const v = zod.def.innerType._zod.values;
				return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
				return handleNonOptionalResult(result, inst);
			};
		});
		function handleNonOptionalResult(payload, inst) {
			if (!payload.issues.length && payload.value === void 0) payload.issues.push({
				code: "invalid_type",
				expected: "nonoptional",
				input: payload.value,
				inst
			});
			return payload;
		}
		function handleCatchResult(payload, result, def, ctx) {
			if (!result.issues.length) {
				payload.value = result.value;
				if (result.memo) payload.memo = true;
				return payload;
			}
			payload.value = def.catchValue({
				...result,
				value: payload.value,
				error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
				input: payload.value
			});
			return payload;
		}
		const $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
			defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
			defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				const result = def.innerType._zod.run({
					value: payload.value,
					issues: []
				}, ctx);
				if (result instanceof Promise) return result.then((result) => handleCatchResult(payload, result, def, ctx));
				return handleCatchResult(payload, result, def, ctx);
			};
		});
		const $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
			defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
			defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
			defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") {
					const right = def.out._zod.run(payload, ctx);
					if (right instanceof Promise) return right.then((right) => handlePipeResult(right, def.in, ctx));
					return handlePipeResult(right, def.in, ctx);
				}
				const left = def.in._zod.run(payload, ctx);
				if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def.out, ctx));
				return handlePipeResult(left, def.out, ctx);
			};
		});
		function handlePipeResult(left, next, ctx) {
			if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
				left.aborted = true;
				return left;
			}
			return next._zod.run({
				value: left.value,
				issues: left.issues
			}, ctx);
		}
		const $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
			defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
			defineLazyInternal(inst, "optin", (zod) => zod.def.innerType?._zod?.optin);
			defineLazyInternal(inst, "optout", (zod) => zod.def.innerType?._zod?.optout);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then(handleReadonlyResult);
				return handleReadonlyResult(result);
			};
		});
		function handleReadonlyResult(payload) {
			if (!payload.memo) payload.value = Object.freeze(payload.value);
			return payload;
		}
		const $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
			$ZodCheck.init(inst, def);
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, _) => {
				return payload;
			};
			inst._zod.check = (payload) => {
				const input = payload.value;
				const r = def.fn(input);
				if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
				handleRefineResult(r, payload, input, inst);
			};
		});
		function handleRefineResult(result, payload, input, inst) {
			if (!result) {
				const _iss = {
					code: "custom",
					input,
					inst,
					path: [...inst._zod.def.path ?? []],
					continue: !inst._zod.def.abort
				};
				if (inst._zod.def.params) _iss.params = inst._zod.def.params;
				payload.issues.push(issue(_iss));
			}
		}
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/memoizer.js
		var $ZodCyclicError = class extends Error {
			constructor() {
				super(`Cannot parse a reference cycle that closes through a transform`);
				this.name = "ZodCyclicError";
			}
		};
		/** Keyed off the context object every schema in one parse call already shares. */
		const STATE = "~memo";
		const NO_ISSUES = [];
		function isRef(value) {
			return value !== null && (typeof value === "object" || typeof value === "function");
		}
		function cloneIssues(issues) {
			return issues.map((iss) => iss.path ? {
				...iss,
				path: iss.path.slice()
			} : { ...iss });
		}
		const recursive = /*@__PURE__*/ new WeakMap();
		/** What the walk established, in order of certainty: ordered so the strongest answer among children wins. */
		const NONE = 0;
		const ASSUMED = 1;
		const PROVEN = 2;
		/** Whether this schema's subtree contains a cycle, so one parse can re-enter it. */
		function isRecursive(inst, stack, resolve) {
			const cached = recursive.get(inst);
			if (cached !== void 0) return cached ? PROVEN : NONE;
			if (stack.has(inst)) return PROVEN;
			stack.add(inst);
			let result = NONE;
			const check = (child) => {
				if (result !== PROVEN && child?._zod) {
					const answer = isRecursive(child, stack, resolve);
					if (answer > result) result = answer;
				}
			};
			const shape = (sh, spread) => {
				let answer = NONE;
				for (const key of Reflect.ownKeys(sh)) {
					const desc = Object.getOwnPropertyDescriptor(sh, key);
					if (spread && !desc.enumerable) continue;
					const child = desc.get ? ASSUMED : desc.value?._zod ? isRecursive(desc.value, stack, resolve) : NONE;
					if (child > answer) answer = child;
				}
				return answer;
			};
			const merge = (answer) => {
				if (answer > result) result = answer;
			};
			const def = inst._zod.def;
			switch (def.type) {
				case "object": {
					const raw = rawShape(def);
					merge(raw ? shape(raw, true) : ASSUMED);
					check(def.catchall);
					break;
				}
				case "properties":
					merge(shape(def.shape, false));
					break;
				case "array":
					check(def.element);
					break;
				case "tuple":
					for (const el of def.items) check(el);
					check(def.rest);
					break;
				case "record":
				case "map":
					check(def.keyType);
					check(def.valueType);
					break;
				case "set":
					check(def.valueType);
					break;
				case "union":
					for (const el of def.options) check(el);
					break;
				case "intersection":
					check(def.left);
					check(def.right);
					break;
				case "optional":
				case "nullable":
				case "default":
				case "prefault":
				case "catch":
				case "readonly":
				case "nonoptional":
				case "promise":
				case "success":
					check(def.innerType);
					break;
				case "pipe":
					check(def.in);
					check(def.out);
					break;
				case "function":
					check(def.input);
					check(def.output);
					break;
				case "lazy": {
					const inner = def._cachedInner ?? (resolve ? inst._zod.innerType : void 0);
					merge(inner ? isRecursive(inner, stack, false) : ASSUMED);
					break;
				}
				case "template_literal":
				case "string":
				case "number":
				case "int":
				case "boolean":
				case "bigint":
				case "symbol":
				case "undefined":
				case "null":
				case "void":
				case "never":
				case "any":
				case "unknown":
				case "date":
				case "nan":
				case "enum":
				case "literal":
				case "file":
				case "transform":
				case "custom": break;
				default: for (const key in def) {
					const desc = Object.getOwnPropertyDescriptor(def, key);
					if (!desc || desc.get) continue;
					const value = desc.value;
					if (!value || typeof value !== "object") continue;
					if (value._zod) check(value);
					else if (Array.isArray(value)) for (const el of value) check(el);
				}
			}
			stack.delete(inst);
			return settle(inst, result);
		}
		/** An assumed answer must not outlive the resolution that settles it, so only a certain one is cached. */
		function settle(inst, answer) {
			if (answer !== ASSUMED) recursive.set(inst, answer === PROVEN);
			return answer;
		}
		function bucketFor(state, inst) {
			let bucket = state.buckets.get(inst);
			if (!bucket) {
				bucket = /* @__PURE__ */ new WeakMap();
				state.buckets.set(inst, bucket);
			}
			return bucket;
		}
		let handoff;
		const open = [];
		const memo = {
			alloc(_inst, payload, empty) {
				const bucket = handoff;
				if (!bucket) return empty;
				handoff = void 0;
				const entry = {
					value: empty,
					issues: null
				};
				bucket.set(payload.value, entry);
				open.push(entry);
				return empty;
			},
			guard(inst) {
				var _a;
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				inst._zod.deferred.push(() => {
					const base = inst._zod.parse;
					const wrapped = (payload, ctx) => {
						if (ctx.direction !== "backward" && isBackEdge(ctx, payload.value)) throw new $ZodCyclicError();
						return base(payload, ctx);
					};
					inst._zod.parse = wrapped;
					if (inst._zod.run === base) inst._zod.run = wrapped;
				});
			},
			attach(inst) {
				var _a;
				let isRecursiveInst;
				let rechecked = false;
				let lastCtx;
				let lastBucket;
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				inst._zod.deferred.push(() => {
					const base = inst._zod.parse;
					const wrapped = (payload, ctx) => {
						if (isRecursiveInst === void 0) {
							const walked = isRecursive(inst, /* @__PURE__ */ new Set(), false);
							if (walked === NONE) {
								inst._zod.parse = base;
								if (inst._zod.run === wrapped) inst._zod.run = base;
								return base(payload, ctx);
							}
							if (walked === PROVEN || rechecked) isRecursiveInst = true;
							else rechecked = true;
						}
						const input = payload.value;
						if (!isRef(input)) return base(payload, ctx);
						let state = ctx[STATE];
						if (!state) {
							state = {
								buckets: /* @__PURE__ */ new WeakMap(),
								backEdges: void 0
							};
							ctx[STATE] = state;
						}
						let bucket;
						if (lastCtx === ctx) bucket = lastBucket;
						else {
							bucket = bucketFor(state, inst);
							lastCtx = ctx;
							lastBucket = bucket;
						}
						const hit = bucket.get(input);
						if (hit) {
							payload.value = hit.value;
							if (hit.issues) {
								if (hit.issues.length) payload.issues.push(...cloneIssues(hit.issues));
							} else {
								payload.memo = true;
								state.backEdges ?? (state.backEdges = /* @__PURE__ */ new WeakSet());
								state.backEdges.add(hit.value);
							}
							return payload;
						}
						handoff = bucket;
						const depth = open.length;
						const result = base(payload, ctx);
						handoff = void 0;
						const entry = open.length > depth ? open.pop() : void 0;
						if (result instanceof Promise) return result.then((r) => {
							if (entry) entry.issues = r.issues.length ? cloneIssues(r.issues) : NO_ISSUES;
							return r;
						});
						if (entry) entry.issues = result.issues.length ? cloneIssues(result.issues) : NO_ISSUES;
						return result;
					};
					inst._zod.parse = wrapped;
					if (inst._zod.run === base) inst._zod.run = wrapped;
				});
			}
		};
		/** The memoizer that gives containers cycle support. `zod` installs it by default; `zod/mini` opts in with `config({ memoizer: memoizer() })`. */
		function memoizer() {
			return memo;
		}
		/** Whether this value is a node a back-edge resolved to before it finished. */
		function isBackEdge(ctx, value) {
			const backEdges = ctx[STATE]?.backEdges;
			return backEdges !== void 0 && isRef(value) && backEdges.has(value);
		}
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/locales/en.js
		const error = () => {
			const Sizable = {
				string: {
					unit: "characters",
					verb: "to have"
				},
				file: {
					unit: "bytes",
					verb: "to have"
				},
				array: {
					unit: "items",
					verb: "to have"
				},
				set: {
					unit: "items",
					verb: "to have"
				},
				map: {
					unit: "entries",
					verb: "to have"
				}
			};
			function getSizing(origin) {
				return Sizable[origin] ?? null;
			}
			const FormatDictionary = {
				regex: "input",
				email: "email address",
				url: "URL",
				emoji: "emoji",
				uuid: "UUID",
				uuidv4: "UUIDv4",
				uuidv6: "UUIDv6",
				nanoid: "nanoid",
				guid: "GUID",
				cuid: "cuid",
				cuid2: "cuid2",
				ulid: "ULID",
				xid: "XID",
				ksuid: "KSUID",
				datetime: "ISO datetime",
				date: "ISO date",
				time: "ISO time",
				duration: "ISO duration",
				ipv4: "IPv4 address",
				ipv6: "IPv6 address",
				mac: "MAC address",
				cidrv4: "IPv4 range",
				cidrv6: "IPv6 range",
				base64: "base64-encoded string",
				base64url: "base64url-encoded string",
				json_string: "JSON string",
				e164: "E.164 number",
				credit_card: "credit card number",
				iban: "IBAN",
				jwt: "JWT",
				template_literal: "input"
			};
			const TypeDictionary = { nan: "NaN" };
			function getTypeName(type, input) {
				if (type === "number" && typeof input === "number" && !Number.isFinite(input)) return String(input);
				return TypeDictionary[type] ?? type;
			}
			return (issue) => {
				switch (issue.code) {
					case "invalid_type": return `Invalid input: expected ${getTypeName(issue.expected)}, received ${getTypeName(parsedType(issue.input), issue.input)}`;
					case "invalid_value":
						if (issue.values.length === 1) return `Invalid input: expected ${stringifyPrimitive(issue.values[0])}`;
						return `Invalid option: expected one of ${joinValues(issue.values, "|")}`;
					case "too_big": {
						const adj = issue.exact ? "exactly " : issue.inclusive ? "<=" : "<";
						const sizing = getSizing(issue.origin);
						if (sizing) return `Too big: expected ${issue.origin ?? "value"} to have ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
						return `Too big: expected ${issue.origin ?? "value"} to be ${adj}${issue.maximum.toString()}`;
					}
					case "too_small": {
						const adj = issue.exact ? "exactly " : issue.inclusive ? ">=" : ">";
						const sizing = getSizing(issue.origin);
						if (sizing) return `Too small: expected ${issue.origin} to have ${adj}${issue.minimum.toString()} ${sizing.unit}`;
						return `Too small: expected ${issue.origin} to be ${adj}${issue.minimum.toString()}`;
					}
					case "invalid_format": {
						const _issue = issue;
						if (_issue.format === "starts_with") return `Invalid string: must start with "${_issue.prefix}"`;
						if (_issue.format === "ends_with") return `Invalid string: must end with "${_issue.suffix}"`;
						if (_issue.format === "includes") return `Invalid string: must include "${_issue.includes}"`;
						if (_issue.format === "regex") return `Invalid string: must match pattern ${_issue.pattern}`;
						return `Invalid ${FormatDictionary[_issue.format] ?? issue.format}`;
					}
					case "not_multiple_of": return `Invalid number: must be a multiple of ${issue.divisor}`;
					case "unrecognized_keys": return `Unrecognized key${issue.keys.length > 1 ? "s" : ""}: ${joinValues(issue.keys, ", ")}`;
					case "invalid_key": return `Invalid key in ${issue.origin}`;
					case "invalid_union":
						if (issue.options && Array.isArray(issue.options) && issue.options.length > 0) return `Invalid discriminator value. Expected ${issue.options.map((o) => `'${o}'`).join(" | ")}`;
						if (issue.inclusive === false) return "Invalid input: more than one option matched";
						return "Invalid input";
					case "invalid_element": return `Invalid value in ${issue.origin}`;
					default: return `Invalid input`;
				}
			};
		};
		function en_default() {
			return { localeError: error() };
		}
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/registries.js
		var _a;
		var $ZodRegistry = class {
			constructor() {
				this._map = /* @__PURE__ */ new WeakMap();
				this._idmap = /* @__PURE__ */ new Map();
			}
			add(schema, ..._meta) {
				const meta = _meta[0];
				this._map.set(schema, meta);
				if (meta && typeof meta === "object" && "id" in meta) this._idmap.set(meta.id, schema);
				return this;
			}
			clear() {
				this._map = /* @__PURE__ */ new WeakMap();
				this._idmap = /* @__PURE__ */ new Map();
				return this;
			}
			remove(schema) {
				const meta = this._map.get(schema);
				if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
				this._map.delete(schema);
				return this;
			}
			get(schema) {
				const p = schema._zod.parent;
				if (p) {
					const pm = { ...this.get(p) ?? {} };
					delete pm.id;
					const f = {
						...pm,
						...this._map.get(schema)
					};
					return Object.keys(f).length ? f : void 0;
				}
				return this._map.get(schema);
			}
			has(schema) {
				return this._map.has(schema);
			}
		};
		function registry() {
			return new $ZodRegistry();
		}
		(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
		const globalRegistry = globalThis.__zod_globalRegistry;
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/api.js
		// @__NO_SIDE_EFFECTS__
		function _string(Class, params) {
			return new Class({
				type: "string",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _email(Class, params) {
			return new Class({
				type: "string",
				format: "email",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _guid(Class, params) {
			return new Class({
				type: "string",
				format: "guid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuid(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv4(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v4",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv6(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v6",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv7(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v7",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _url(Class, params) {
			return new Class({
				type: "string",
				format: "url",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _emoji(Class, params) {
			return new Class({
				type: "string",
				format: "emoji",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _nanoid(Class, params) {
			return new Class({
				type: "string",
				format: "nanoid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link _cuid2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		// @__NO_SIDE_EFFECTS__
		function _cuid(Class, params) {
			return new Class({
				type: "string",
				format: "cuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cuid2(Class, params) {
			return new Class({
				type: "string",
				format: "cuid2",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ulid(Class, params) {
			return new Class({
				type: "string",
				format: "ulid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _xid(Class, params) {
			return new Class({
				type: "string",
				format: "xid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ksuid(Class, params) {
			return new Class({
				type: "string",
				format: "ksuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ipv4(Class, params) {
			return new Class({
				type: "string",
				format: "ipv4",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ipv6(Class, params) {
			return new Class({
				type: "string",
				format: "ipv6",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cidrv4(Class, params) {
			return new Class({
				type: "string",
				format: "cidrv4",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cidrv6(Class, params) {
			return new Class({
				type: "string",
				format: "cidrv6",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _base64(Class, params) {
			return new Class({
				type: "string",
				format: "base64",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _base64url(Class, params) {
			return new Class({
				type: "string",
				format: "base64url",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _e164(Class, params) {
			return new Class({
				type: "string",
				format: "e164",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _jwt(Class, params) {
			return new Class({
				type: "string",
				format: "jwt",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDateTime(Class, params) {
			return new Class({
				type: "string",
				format: "datetime",
				check: "string_format",
				offset: false,
				local: false,
				precision: null,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDate(Class, params) {
			return new Class({
				type: "string",
				format: "date",
				check: "string_format",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoTime(Class, params) {
			return new Class({
				type: "string",
				format: "time",
				check: "string_format",
				precision: null,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDuration(Class, params) {
			return new Class({
				type: "string",
				format: "duration",
				check: "string_format",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _number(Class, params) {
			return new Class({
				type: "number",
				checks: [],
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _int(Class, params) {
			return new Class({
				type: "number",
				check: "number_format",
				abort: false,
				format: "safeint",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _boolean(Class, params) {
			return new Class({
				type: "boolean",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _undefined$1(Class, params) {
			return new Class({
				type: "undefined",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _unknown(Class) {
			return new Class({ type: "unknown" });
		}
		// @__NO_SIDE_EFFECTS__
		function _never(Class, params) {
			return new Class({
				type: "never",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lt(value, params) {
			return new $ZodCheckLessThan({
				check: "less_than",
				...normalizeParams(params),
				value,
				inclusive: false
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lte(value, params) {
			return new $ZodCheckLessThan({
				check: "less_than",
				...normalizeParams(params),
				value,
				inclusive: true
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _gt(value, params) {
			return new $ZodCheckGreaterThan({
				check: "greater_than",
				...normalizeParams(params),
				value,
				inclusive: false
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _gte(value, params) {
			return new $ZodCheckGreaterThan({
				check: "greater_than",
				...normalizeParams(params),
				value,
				inclusive: true
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _multipleOf(value, params) {
			return new $ZodCheckMultipleOf({
				check: "multiple_of",
				...normalizeParams(params),
				value
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _maxLength(maximum, params) {
			return new $ZodCheckMaxLength({
				check: "max_length",
				...normalizeParams(params),
				maximum
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _minLength(minimum, params) {
			return new $ZodCheckMinLength({
				check: "min_length",
				...normalizeParams(params),
				minimum
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _length(length, params) {
			return new $ZodCheckLengthEquals({
				check: "length_equals",
				...normalizeParams(params),
				length
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _regex(pattern, params) {
			return new $ZodCheckRegex({
				check: "string_format",
				format: "regex",
				...normalizeParams(params),
				pattern
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lowercase(params) {
			return new $ZodCheckLowerCase({
				check: "string_format",
				format: "lowercase",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uppercase(params) {
			return new $ZodCheckUpperCase({
				check: "string_format",
				format: "uppercase",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _includes(includes, params) {
			return new $ZodCheckIncludes({
				check: "string_format",
				format: "includes",
				...normalizeParams(params),
				includes
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _startsWith(prefix, params) {
			return new $ZodCheckStartsWith({
				check: "string_format",
				format: "starts_with",
				...normalizeParams(params),
				prefix
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _endsWith(suffix, params) {
			return new $ZodCheckEndsWith({
				check: "string_format",
				format: "ends_with",
				...normalizeParams(params),
				suffix
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _overwrite(tx) {
			return new $ZodCheckOverwrite({
				check: "overwrite",
				tx
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _normalize(form) {
			return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
		}
		// @__NO_SIDE_EFFECTS__
		function _trim() {
			return /* @__PURE__ */ _overwrite((input) => input.trim());
		}
		// @__NO_SIDE_EFFECTS__
		function _toLowerCase() {
			return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
		}
		// @__NO_SIDE_EFFECTS__
		function _toUpperCase() {
			return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
		}
		// @__NO_SIDE_EFFECTS__
		function _slugify() {
			return /* @__PURE__ */ _overwrite((input) => slugify(input));
		}
		// @__NO_SIDE_EFFECTS__
		function _array(Class, element, params) {
			return new Class({
				type: "array",
				element,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _refine(Class, fn, _params) {
			return new Class({
				type: "custom",
				check: "custom",
				fn,
				...normalizeParams(_params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _superRefine(fn, params) {
			const ch = /* @__PURE__ */ _check((payload) => {
				payload.addIssue = (issue$2) => {
					if (typeof issue$2 === "string") payload.issues.push(issue(issue$2, payload.value, ch._zod.def));
					else {
						const _issue = issue$2;
						if (_issue.fatal) _issue.continue = false;
						_issue.code ?? (_issue.code = "custom");
						if (!("input" in _issue)) _issue.input = payload.value;
						_issue.inst ?? (_issue.inst = ch);
						_issue.continue ?? (_issue.continue = !ch._zod.def.abort);
						payload.issues.push(issue(_issue));
					}
				};
				return fn(payload.value, payload);
			}, params);
			return ch;
		}
		// @__NO_SIDE_EFFECTS__
		function _check(fn, params) {
			const ch = new $ZodCheck({
				check: "custom",
				...normalizeParams(params)
			});
			ch._zod.check = fn;
			return ch;
		}
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/to-json-schema.js
		function assignProps(target, ...sources) {
			for (const source of sources) for (const key of Reflect.ownKeys(source)) if (Object.prototype.propertyIsEnumerable.call(source, key)) assignProp(target, key, source[key]);
			return target;
		}
		function initializeContext(params) {
			let target = params?.target ?? "draft-2020-12";
			if (target === "draft-4") target = "draft-04";
			if (target === "draft-7") target = "draft-07";
			return {
				processors: params.processors ?? {},
				metadataRegistry: params?.metadata ?? globalRegistry,
				target,
				unrepresentable: params?.unrepresentable ?? "throw",
				override: params?.override ?? (() => {}),
				io: params?.io ?? "output",
				counter: 0,
				seen: /* @__PURE__ */ new Map(),
				sharedDefsExtractedFor: void 0,
				sharedEmitDoneFor: void 0,
				cycles: params?.cycles ?? "ref",
				reused: params?.reused ?? "inline",
				intersections: [],
				deferred: [],
				external: params?.external ?? void 0
			};
		}
		/**
		* Applies the `unrepresentable` setting at a site that has no JSON Schema equivalent. Throws
		* `message` unless the setting (or the handler's return value) says otherwise. Returns `true` if a
		* custom JSON Schema was written into `json`, in which case the caller must not write its own.
		*/
		function handleUnrepresentable(schema, ctx, json, params, message) {
			const result = typeof ctx.unrepresentable === "function" ? ctx.unrepresentable({
				zodSchema: schema,
				path: params.path,
				message
			}) : ctx.unrepresentable;
			if (result === "any") return false;
			if (result === void 0 || result === "throw") throw new Error(message);
			Object.assign(json, result);
			return true;
		}
		function processSchema(schema, ctx, _params = {
			path: [],
			schemaPath: []
		}) {
			var _a;
			const def = schema._zod.def;
			const seen = ctx.seen.get(schema);
			if (seen) {
				seen.count++;
				if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
				return seen.schema;
			}
			const result = {
				schema: {},
				count: 1,
				cycle: void 0,
				path: _params.path
			};
			ctx.seen.set(schema, result);
			ctx.sharedDefsExtractedFor = void 0;
			ctx.sharedEmitDoneFor = void 0;
			const overrideSchema = schema._zod.toJSONSchema?.();
			if (overrideSchema) result.schema = overrideSchema;
			else {
				const params = {
					..._params,
					schemaPath: [..._params.schemaPath, schema],
					path: _params.path
				};
				if (schema._zod.processJSONSchema) schema._zod.processJSONSchema(ctx, result.schema, params);
				else {
					const _json = result.schema;
					const processor = ctx.processors[def.type];
					if (!processor) throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
					processor(schema, ctx, _json, params);
				}
				const parent = schema._zod.parent;
				if (parent) {
					if (!result.ref) result.ref = parent;
					processSchema(parent, ctx, params);
					ctx.seen.get(parent).isParent = true;
				}
			}
			const meta = ctx.metadataRegistry.get(schema);
			if (meta) assignProps(result.schema, meta);
			if (ctx.io === "input" && isTransforming(schema)) {
				delete result.schema.examples;
				delete result.schema.default;
			}
			if (ctx.io === "input" && "_prefault" in result.schema) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
			delete result.schema._prefault;
			return ctx.seen.get(schema).schema;
		}
		function encodeJSONPointerSegment(segment) {
			return segment.replace(/~/g, "~0").replace(/\//g, "~1");
		}
		function extractDefs(ctx, schema) {
			const root = ctx.seen.get(schema);
			if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
			if (ctx.external && ctx.sharedDefsExtractedFor === ctx.external) return;
			const idToSchema = /* @__PURE__ */ new Map();
			for (const entry of ctx.seen.entries()) {
				const id = ctx.metadataRegistry.get(entry[0])?.id;
				if (id) {
					const existing = idToSchema.get(id);
					if (existing && existing !== entry[0]) throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
					idToSchema.set(id, entry[0]);
				}
			}
			const makeURI = (entry) => {
				const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
				if (ctx.external) {
					const externalId = ctx.external.registry.get(entry[0])?.id;
					const uriGenerator = ctx.external.uri ?? ((id) => id);
					if (externalId) return { ref: uriGenerator(externalId) };
					const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
					entry[1].defId = id;
					return {
						defId: id,
						ref: `${uriGenerator("__shared")}#/${defsSegment}/${encodeJSONPointerSegment(id)}`
					};
				}
				const uriPrefix = `#`;
				const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
				if (entry[1] === root && !entry[1].schema.id) return { ref: uriPrefix };
				const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
				return {
					defId,
					ref: defUriPrefix + encodeJSONPointerSegment(defId)
				};
			};
			const extractToDef = (entry) => {
				if (entry[1].schema.$ref) return;
				const seen = entry[1];
				const { ref, defId } = makeURI(entry);
				seen.def = { ...seen.schema };
				if (defId) seen.defId = defId;
				const schema = seen.schema;
				for (const key in schema) delete schema[key];
				schema.$ref = ref;
			};
			if (ctx.cycles === "throw") for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (seen.cycle) throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
			}
			for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (schema === entry[0]) {
					extractToDef(entry);
					continue;
				}
				if (ctx.external) {
					const ext = ctx.external.registry.get(entry[0])?.id;
					if (schema !== entry[0] && ext) {
						extractToDef(entry);
						continue;
					}
				}
				if (ctx.metadataRegistry.get(entry[0])?.id) {
					extractToDef(entry);
					continue;
				}
				if (seen.cycle) {
					extractToDef(entry);
					continue;
				}
				if (seen.count > 1) {
					if (ctx.reused === "ref") extractToDef(entry);
				}
			}
			if (ctx.external) ctx.sharedDefsExtractedFor = ctx.external;
		}
		/** Rewrites `anyOf: [{type: "a"}, {type: "b"}]` to `type: ["a", "b"]`, which every JSON Schema draft treats as equivalent and most consumers render far better for the nullable case. Only branches that are a bare type assertion qualify — anything carrying a constraint, `$ref`, `const` or metadata is left alone. Runs after `flattenRef`, so a branch an override decorated or `$defs` extraction turned into a `$ref` is no longer bare and correctly stays in `anyOf`. `oneOf` is excluded: `integer` and `number` overlap, so "exactly one" and "at least one" are not the same there. OpenAPI 3.0 is excluded: its `type` must be a single string. */
		function compactTypeUnion(schema) {
			const options = schema.anyOf;
			if (!Array.isArray(options) || options.length === 0 || schema.type !== void 0) return;
			const types = [];
			for (const option of options) {
				if (!option || typeof option !== "object") return;
				compactTypeUnion(option);
				const keys = Object.keys(option);
				if (keys.length !== 1 || keys[0] !== "type") return;
				const type = option.type;
				for (const member of Array.isArray(type) ? type : [type]) {
					if (typeof member !== "string") return;
					if (!types.includes(member)) types.push(member);
				}
			}
			delete schema.anyOf;
			schema.type = types.length === 1 ? types[0] : types;
		}
		/** Keywords `foldIntersection` knows how to combine. Anything else — `$ref`, `patternProperties`,
		* an annotation like `description` — makes a member unfoldable, so a constraint this does not
		* understand leaves the `allOf` alone instead of being silently dropped or misattributed. */
		const FOLDABLE_KEYS = /* @__PURE__ */ new Set([
			"type",
			"properties",
			"required",
			"additionalProperties"
		]);
		const UNION_KEYS = ["oneOf", "anyOf"];
		/** A member's constraint on a key it does not declare itself. A `catchall` states one; `false`, an absent `additionalProperties`, and the empty schema a loose object emits state nothing. */
		function undeclaredConstraint(member) {
			const extra = member.additionalProperties;
			if (extra === void 0 || extra === false || typeof extra !== "object" || extra === null) return null;
			return Object.keys(extra).length ? extra : null;
		}
		/** Combines object members into the single object they describe together, or returns `null` if any of them carries a keyword outside {@link FOLDABLE_KEYS}. */
		function foldObjects(members) {
			const objects = [];
			for (const member of members) {
				if (typeof member !== "object" || member.type !== "object") return null;
				for (const key in member) if (!FOLDABLE_KEYS.has(key)) return null;
				objects.push(member);
			}
			const properties = {};
			const required = /* @__PURE__ */ new Set();
			for (const object of objects) {
				for (const key in object.properties) {
					if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
					const parts = [];
					for (const other of objects) {
						const part = other.properties?.[key] ?? undeclaredConstraint(other);
						if (part === null || part === void 0) continue;
						if (!parts.some((seen) => JSON.stringify(seen) === JSON.stringify(part))) parts.push(part);
					}
					assignProp(properties, key, parts.length === 1 ? parts[0] : foldObjects(parts) ?? { allOf: parts });
				}
				for (const key of object.required ?? []) required.add(key);
			}
			const folded = {
				type: "object",
				properties
			};
			if (required.size) folded.required = [...required];
			if (objects.every((object) => object.additionalProperties === false)) folded.additionalProperties = false;
			else {
				const constraints = [];
				for (const object of objects) {
					const constraint = undeclaredConstraint(object);
					if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint))) constraints.push(constraint);
				}
				if (constraints.length === 1) folded.additionalProperties = constraints[0];
				else if (constraints.length > 1) folded.additionalProperties = { allOf: constraints };
			}
			return folded;
		}
		/** `additionalProperties` in an `allOf` member sees only that member's own `properties`, so two
		* closed object members reject each other's keys and the schema validates nothing. Zod's parser
		* pools the key sets instead — `handleIntersectionResults` reports a key as unrecognized only when
		* *every* side rejects it — so the emitted schema has to pool them too, and folding the members
		* into one object is the encoding that says so on every target.
		*
		* This runs from `finalize`, after `extractDefs`, which is what keeps it clear of the `$ref`
		* machinery: a member extracted into `$defs` is already a `$ref` by now and declines to fold, so it
		* keeps its reference and its own closedness rather than being inlined as a stale copy. */
		function foldIntersection(json) {
			const allOf = json.allOf;
			if (!Array.isArray(allOf) || allOf.length < 2) return;
			for (const key of FOLDABLE_KEYS) if (key in json) return;
			const unions = allOf.filter((m) => UNION_KEYS.some((k) => Array.isArray(m[k])));
			let folded = null;
			if (!unions.length) folded = foldObjects(allOf);
			else {
				const union = unions[0];
				const keyword = UNION_KEYS.find((k) => Array.isArray(union[k]));
				if (Object.keys(union).length !== 1) return;
				const rest = allOf.filter((m) => m !== union);
				const branches = union[keyword].map((branch) => foldObjects([...rest, branch]));
				if (branches.some((b) => !b)) return;
				folded = { [keyword]: branches };
			}
			if (!folded) return;
			delete json.allOf;
			assignProps(json, folded);
		}
		function finalize(ctx, schema) {
			const root = ctx.seen.get(schema);
			if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
			const flattenRef = (zodSchema) => {
				const seen = ctx.seen.get(zodSchema);
				if (seen.ref === null) return;
				const schema = seen.def ?? seen.schema;
				const _cached = { ...schema };
				const ref = seen.ref;
				seen.ref = null;
				if (ref) {
					flattenRef(ref);
					const refSeen = ctx.seen.get(ref);
					const refSchema = refSeen.schema;
					if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
						schema.allOf = schema.allOf ?? [];
						schema.allOf.push(refSchema);
					} else assignProps(schema, refSchema);
					assignProps(schema, _cached);
					if (zodSchema._zod.parent === ref) for (const key in schema) {
						if (key === "$ref" || key === "allOf") continue;
						if (!(key in _cached)) delete schema[key];
					}
					if (refSchema.$ref && refSeen.def) for (const key in schema) {
						if (key === "$ref" || key === "allOf") continue;
						if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) delete schema[key];
					}
				}
				const parent = zodSchema._zod.parent;
				if (parent && parent !== ref) {
					flattenRef(parent);
					const parentSeen = ctx.seen.get(parent);
					if (parentSeen?.schema.$ref) {
						schema.$ref = parentSeen.schema.$ref;
						if (parentSeen.def) for (const key in schema) {
							if (key === "$ref" || key === "allOf") continue;
							if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) delete schema[key];
						}
					}
				}
				ctx.override({
					zodSchema,
					jsonSchema: schema,
					path: seen.path ?? []
				});
			};
			if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
				for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
				if (ctx.target !== "openapi-3.0") for (const entry of ctx.seen.entries()) compactTypeUnion(entry[1].def ?? entry[1].schema);
				for (const rewrite of ctx.deferred) rewrite();
				if (ctx.intersections.length) {
					const carriers = /* @__PURE__ */ new Map();
					for (const seen of ctx.seen.values()) for (const json of [seen.schema, seen.def]) {
						const allOf = json?.allOf;
						if (!Array.isArray(allOf)) continue;
						const existing = carriers.get(allOf);
						if (existing) existing.push(json);
						else carriers.set(allOf, [json]);
					}
					for (const allOf of ctx.intersections) for (const json of carriers.get(allOf) ?? []) foldIntersection(json);
				}
			}
			const result = {};
			if (ctx.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
			else if (ctx.target === "draft-07") result.$schema = "http://json-schema.org/draft-07/schema#";
			else if (ctx.target === "draft-04") result.$schema = "http://json-schema.org/draft-04/schema#";
			else if (ctx.target === "openapi-3.0") {}
			if (ctx.external?.uri) {
				const id = ctx.external.registry.get(schema)?.id;
				if (!id) throw new Error("Schema is missing an `id` property");
				result.$id = ctx.external.uri(id);
			}
			assignProps(result, root.defId ? root.schema : root.def ?? root.schema);
			const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
			if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
			const defs = ctx.external?.defs ?? {};
			if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (seen.def && seen.defId) {
					if (seen.def.id === seen.defId) delete seen.def.id;
					assignProp(defs, seen.defId, seen.def);
				}
			}
			if (ctx.external) ctx.sharedEmitDoneFor = ctx.external;
			if (ctx.external) {} else if (Object.keys(defs).length > 0) if (ctx.target === "draft-2020-12") result.$defs = defs;
			else result.definitions = defs;
			try {
				const finalized = JSON.parse(JSON.stringify(result));
				Object.defineProperty(finalized, "~standard", {
					value: {
						...schema["~standard"],
						jsonSchema: {
							input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
							output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
						}
					},
					enumerable: false,
					writable: false
				});
				return finalized;
			} catch (_err) {
				throw new Error("Error converting schema to JSON.");
			}
		}
		function isTransforming(_schema, _ctx) {
			const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
			if (ctx.seen.has(_schema)) return false;
			ctx.seen.add(_schema);
			const def = _schema._zod.def;
			if (def.type === "transform") return true;
			if (def.type === "array") return isTransforming(def.element, ctx);
			if (def.type === "set") return isTransforming(def.valueType, ctx);
			if (def.type === "lazy") return isTransforming(def.getter(), ctx);
			if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault" || def.type === "catch") return isTransforming(def.innerType, ctx);
			if (def.type === "intersection") return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
			if (def.type === "record" || def.type === "map") return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
			if (def.type === "pipe") {
				if (_schema._zod.traits.has("$ZodCodec")) return true;
				return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
			}
			if (def.type === "object") {
				for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
				return false;
			}
			if (def.type === "union") {
				for (const option of def.options) if (isTransforming(option, ctx)) return true;
				return false;
			}
			if (def.type === "tuple") {
				for (const item of def.items) if (isTransforming(item, ctx)) return true;
				if (def.rest && isTransforming(def.rest, ctx)) return true;
				return false;
			}
			return false;
		}
		/**
		* Creates a toJSONSchema method for a schema instance.
		* This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
		*/
		const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
			const ctx = initializeContext({
				...params,
				processors
			});
			processSchema(schema, ctx);
			extractDefs(ctx, schema);
			return finalize(ctx, schema);
		};
		const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
			const { libraryOptions, target } = params ?? {};
			const ctx = initializeContext({
				...libraryOptions ?? {},
				target,
				io,
				processors
			});
			processSchema(schema, ctx);
			extractDefs(ctx, schema);
			return finalize(ctx, schema);
		};
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/core/json-schema-processors.js
		const narrowMin = (agg, key, value) => {
			if (agg[key] === void 0 || value > agg[key]) agg[key] = value;
		};
		const narrowMax = (agg, key, value) => {
			if (agg[key] === void 0 || value < agg[key]) agg[key] = value;
		};
		const narrowBoth = (agg, value) => {
			narrowMin(agg, "minimum", value);
			narrowMax(agg, "maximum", value);
		};
		const addDivisor = (agg, value) => {
			agg.multipleOf ?? (agg.multipleOf = []);
			if (!agg.multipleOf.includes(value)) agg.multipleOf.push(value);
		};
		const addPattern = (agg, pattern) => {
			agg.patterns ?? (agg.patterns = /* @__PURE__ */ new Set());
			agg.patterns.add(pattern);
		};
		const intersectMime = (agg, mime) => {
			agg.mime = agg.mime ? agg.mime.filter((m) => mime.includes(m)) : [...mime];
		};
		const setFormat = (agg, format) => {
			agg.format = format;
			if (format.includes("int")) agg.isInt = true;
		};
		const minContributor = (agg, def) => narrowMin(agg, "minimum", def.minimum);
		const maxContributor = (agg, def) => narrowMax(agg, "maximum", def.maximum);
		const formatContributor = (ranges) => (agg, def) => {
			setFormat(agg, def.format);
			const [minimum, maximum] = ranges[def.format];
			narrowMin(agg, "minimum", minimum);
			narrowMax(agg, "maximum", maximum);
		};
		const contributors = {
			greater_than: (agg, def) => narrowMin(agg, def.inclusive ? "minimum" : "exclusiveMinimum", def.value),
			less_than: (agg, def) => narrowMax(agg, def.inclusive ? "maximum" : "exclusiveMaximum", def.value),
			multiple_of: (agg, def) => addDivisor(agg, def.value),
			number_format: formatContributor(NUMBER_FORMAT_RANGES),
			bigint_format: formatContributor(BIGINT_FORMAT_RANGES),
			min_length: minContributor,
			max_length: maxContributor,
			length_equals: (agg, def) => narrowBoth(agg, def.length),
			min_size: minContributor,
			max_size: maxContributor,
			size_equals: (agg, def) => narrowBoth(agg, def.size),
			string_format: (agg, def) => {
				setFormat(agg, def.format);
				if (def.pattern) addPattern(agg, def.pattern);
				if (def.format === "base64" || def.format === "base64url") agg.contentEncoding = def.format;
				if (def.local || def.precision === -1) agg.laxFormat = true;
			},
			mime_type: (agg, def) => intersectMime(agg, def.mime)
		};
		function aggregateChecks(schema) {
			const agg = {};
			const def = schema._zod.def;
			const list = schema._zod.traits.has("$ZodCheck") ? [schema, ...def.checks ?? []] : def.checks ?? [];
			for (const ch of list) contributors[ch._zod.def.check]?.(agg, ch._zod.def);
			const bag = schema._zod.bag;
			if (bag.minimum !== void 0) narrowMin(agg, "minimum", bag.minimum);
			if (bag.exclusiveMinimum !== void 0) narrowMin(agg, "exclusiveMinimum", bag.exclusiveMinimum);
			if (bag.maximum !== void 0) narrowMax(agg, "maximum", bag.maximum);
			if (bag.exclusiveMaximum !== void 0) narrowMax(agg, "exclusiveMaximum", bag.exclusiveMaximum);
			if (bag.multipleOf !== void 0) addDivisor(agg, bag.multipleOf);
			if (bag.format !== void 0) {
				agg.format ?? (agg.format = bag.format);
				if (bag.format.includes("int")) agg.isInt = true;
			}
			if (bag.mime) intersectMime(agg, bag.mime);
			for (const pattern of bag.patterns ?? []) addPattern(agg, pattern);
			return agg;
		}
		const formatMap = {
			guid: "uuid",
			url: "uri",
			datetime: "date-time",
			json_string: "json-string",
			regex: ""
		};
		const exactPatterns = /* @__PURE__ */ new Map([[base64Charset, base64], [base64urlCharset, base64url]]);
		const exactPattern = (p) => exactPatterns.get(p) ?? p;
		const stringProcessor = (schema, ctx, _json, _params) => {
			const json = _json;
			json.type = "string";
			const { minimum, maximum, format, patterns, contentEncoding, laxFormat } = aggregateChecks(schema);
			if (typeof minimum === "number") json.minLength = minimum;
			if (typeof maximum === "number") json.maxLength = maximum;
			if (format) {
				json.format = formatMap[format] ?? format;
				if (json.format === "") delete json.format;
				if (format === "time" || laxFormat) delete json.format;
			}
			if (contentEncoding) json.contentEncoding = contentEncoding;
			if (patterns && patterns.size > 0) {
				const patternList = [...patterns].map(exactPattern);
				if (patternList.length === 1) json.pattern = patternList[0].source;
				else if (patternList.length > 1) json.allOf = [...patternList.map((regex) => ({
					...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
					pattern: regex.source
				}))];
			}
		};
		const numberProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const { minimum, maximum, multipleOf, exclusiveMaximum, exclusiveMinimum, isInt } = aggregateChecks(schema);
			json.type = isInt ? "integer" : "number";
			const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
			const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
			const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
			if (exMin) if (legacy) {
				json.minimum = exclusiveMinimum;
				json.exclusiveMinimum = true;
			} else json.exclusiveMinimum = exclusiveMinimum;
			else if (typeof minimum === "number") json.minimum = minimum;
			if (exMax) if (legacy) {
				json.maximum = exclusiveMaximum;
				json.exclusiveMaximum = true;
			} else json.exclusiveMaximum = exclusiveMaximum;
			else if (typeof maximum === "number") json.maximum = maximum;
			if (multipleOf) {
				const divisors = /* @__PURE__ */ new Set();
				for (const divisor of multipleOf) if (Number.isFinite(divisor) && divisor !== 0) divisors.add(Math.abs(divisor));
				else handleUnrepresentable(schema, ctx, json, params, `A multipleOf divisor of ${divisor} cannot be represented in JSON Schema`);
				const [first, ...rest] = divisors;
				if (first !== void 0) json.multipleOf = first;
				if (rest.length) json.allOf = [...json.allOf ?? [], ...rest.map((m) => ({ multipleOf: m }))];
			}
		};
		const booleanProcessor = (_schema, _ctx, json, _params) => {
			json.type = "boolean";
		};
		const undefinedProcessor = (schema, ctx, json, params) => {
			handleUnrepresentable(schema, ctx, json, params, "Undefined cannot be represented in JSON Schema");
		};
		const neverProcessor = (_schema, _ctx, json, _params) => {
			json.not = {};
		};
		const enumProcessor = (schema, _ctx, json, _params) => {
			const def = schema._zod.def;
			const values = getEnumValues(def.entries);
			if (values.length === 0) {
				json.not = {};
				return;
			}
			if (values.every((v) => typeof v === "number")) json.type = "number";
			if (values.every((v) => typeof v === "string")) json.type = "string";
			json.enum = values;
		};
		const literalProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			if (def.values.length === 0) {
				json.not = {};
				return;
			}
			const vals = [];
			for (const val of def.values) if (val === void 0) {
				if (handleUnrepresentable(schema, ctx, json, params, "Literal `undefined` cannot be represented in JSON Schema")) return;
			} else if (typeof val === "bigint") {
				if (handleUnrepresentable(schema, ctx, json, params, "BigInt literals cannot be represented in JSON Schema")) return;
				vals.push(Number(val));
			} else vals.push(val);
			if (vals.length === 0) {} else if (vals.length === 1) {
				const val = vals[0];
				json.type = val === null ? "null" : typeof val;
				if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") json.enum = [val];
				else json.const = val;
			} else {
				if (vals.every((v) => typeof v === "number")) json.type = "number";
				if (vals.every((v) => typeof v === "string")) json.type = "string";
				if (vals.every((v) => typeof v === "boolean")) json.type = "boolean";
				if (vals.every((v) => v === null)) json.type = "null";
				json.enum = vals;
			}
		};
		const customProcessor = (schema, ctx, json, params) => {
			handleUnrepresentable(schema, ctx, json, params, "Custom types cannot be represented in JSON Schema");
		};
		const transformProcessor = (schema, ctx, json, params) => {
			handleUnrepresentable(schema, ctx, json, params, "Transforms cannot be represented in JSON Schema");
		};
		const arrayProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			const { minimum, maximum } = aggregateChecks(schema);
			if (typeof minimum === "number") json.minItems = minimum;
			if (typeof maximum === "number") json.maxItems = maximum;
			json.type = "array";
			json.items = processSchema(def.element, ctx, {
				...params,
				path: [...params.path, "items"]
			});
		};
		function inputOptin(schema) {
			const def = schema._zod.def;
			if (def.type === "pipe" && def.in._zod.traits.has("$ZodTransform")) return inputOptin(def.out);
			if (def.type === "catch") return inputOptin(def.innerType);
			return schema._zod.optin;
		}
		const objectProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			const shape = def.shape;
			if (Object.getOwnPropertySymbols(shape).length && handleUnrepresentable(schema, ctx, json, params, "Symbol keys cannot be represented in JSON Schema")) return;
			json.type = "object";
			json.properties = {};
			for (const key in shape) assignProp(json.properties, key, processSchema(shape[key], ctx, {
				...params,
				path: [
					...params.path,
					"properties",
					key
				]
			}));
			const allKeys = new Set(Object.keys(shape));
			const requiredKeys = new Set([...allKeys].filter((key) => {
				const field = def.shape[key];
				if (ctx.io === "input") return inputOptin(field) === void 0;
				else return field._zod.optout === void 0;
			}));
			if (requiredKeys.size > 0) json.required = Array.from(requiredKeys);
			if (def.catchall?._zod.def.type === "never") json.additionalProperties = false;
			else if (!def.catchall) {
				if (ctx.io === "output") json.additionalProperties = false;
			} else if (def.catchall) json.additionalProperties = processSchema(def.catchall, ctx, {
				...params,
				path: [...params.path, "additionalProperties"]
			});
		};
		const unionProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const isExclusive = def.inclusive === false;
			const options = def.options.map((x, i) => processSchema(x, ctx, {
				...params,
				path: [
					...params.path,
					isExclusive ? "oneOf" : "anyOf",
					i
				]
			}));
			if (isExclusive) json.oneOf = options;
			else json.anyOf = options;
		};
		const intersectionProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const a = processSchema(def.left, ctx, {
				...params,
				path: [
					...params.path,
					"allOf",
					0
				]
			});
			const b = processSchema(def.right, ctx, {
				...params,
				path: [
					...params.path,
					"allOf",
					1
				]
			});
			const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
			const allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
			json.allOf = allOf;
			ctx.intersections.push(allOf);
		};
		const nullableProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const inner = processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			if (ctx.target === "openapi-3.0") {
				seen.ref = def.innerType;
				json.nullable = true;
			} else json.anyOf = [inner, { type: "null" }];
		};
		const nonoptionalProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
		};
		/** Round-trips a default value through JSON so the emitted schema is guaranteed to be valid JSON.
		* A BigInt has no reliable encoding, so it goes through `unrepresentable` like any other
		* unrepresentable value. Returns a sentinel when the caller must not write a default of its own. */
		const UNREPRESENTABLE_DEFAULT = Symbol();
		function serializeDefaultValue(value, schema, ctx, json, params) {
			let unrepresentable = false;
			const serialized = JSON.stringify(value, (_, val) => {
				if (typeof val !== "bigint") return val;
				unrepresentable = true;
				return null;
			});
			if (!unrepresentable) return JSON.parse(serialized);
			handleUnrepresentable(schema, ctx, json, params, "BigInt defaults cannot be represented in JSON Schema");
			return UNREPRESENTABLE_DEFAULT;
		}
		const defaultProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
			if (value !== UNREPRESENTABLE_DEFAULT) json.default = value;
		};
		const prefaultProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			if (ctx.io !== "input") return;
			const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
			if (value !== UNREPRESENTABLE_DEFAULT) json._prefault = value;
		};
		const catchProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			let catchValue;
			try {
				catchValue = def.catchValue(void 0);
			} catch {
				handleUnrepresentable(schema, ctx, json, params, "Dynamic catch values are not supported in JSON Schema");
				return;
			}
			json.default = catchValue;
		};
		const pipeProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			const inIsTransform = def.in._zod.traits.has("$ZodTransform");
			const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
			processSchema(innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = innerType;
		};
		const readonlyProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			json.readOnly = true;
		};
		const optionalProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			processSchema(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
		};
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/classic/errors.js
		const _installedErrorProtos = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
		function _lazyMethod(proto, key, make) {
			Object.defineProperty(proto, key, {
				configurable: true,
				enumerable: false,
				get() {
					const value = make(this);
					Object.defineProperty(this, key, {
						value,
						configurable: true,
						writable: true
					});
					return value;
				},
				set(value) {
					Object.defineProperty(this, key, {
						value,
						configurable: true,
						writable: true
					});
				}
			});
		}
		const initializer = (inst, issues) => {
			$ZodError.init(inst, issues);
			inst.name = "ZodError";
			const proto = Object.getPrototypeOf(inst);
			if (_installedErrorProtos.has(proto)) return;
			_installedErrorProtos.add(proto);
			_lazyMethod(proto, "format", (self) => (mapper) => formatError(self, mapper));
			_lazyMethod(proto, "flatten", (self) => (mapper) => flattenError(self, mapper));
			_lazyMethod(proto, "addIssue", (self) => (issue) => {
				self.issues.push(issue);
				self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
			});
			_lazyMethod(proto, "addIssues", (self) => (issues) => {
				self.issues.push(...issues);
				self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
			});
			Object.defineProperty(proto, "isEmpty", {
				configurable: true,
				enumerable: false,
				get() {
					return this.issues.length === 0;
				}
			});
		};
		const ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, void 0, { Parent: Error });
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/classic/parse.js
		const parse = /* @__PURE__ */ _parse(ZodRealError);
		const parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
		const safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
		const safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
		const encode = /* @__PURE__ */ _encode(ZodRealError);
		const decode = /* @__PURE__ */ _decode(ZodRealError);
		const encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
		const decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
		const safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
		const safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
		const safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
		const safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
		//#endregion
		//#region node_modules/.pnpm/zod@4.6.1/node_modules/zod/v4/classic/schemas.js
		function _ensureDefaultLocale() {
			if (!globalConfig.localeError) config(en_default());
		}
		function _ensureDefaultMemoizer() {
			if (!globalConfig.memoizer) config({ memoizer: memoizer() });
		}
		const ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
			_ensureDefaultLocale();
			$ZodType.init(inst, def);
			inst.def = def;
			inst.type = def.type;
			return inst;
		}, {
			check(...chks) {
				const def = this.def;
				return this.clone(mergeDefs(def, { checks: [...def.checks ?? [], ...chks.map((ch) => typeof ch === "function" ? { _zod: {
					check: ch,
					def: { check: "custom" },
					onattach: []
				} } : ch)] }), { parent: true });
			},
			with(...chks) {
				return this.check(...chks);
			},
			clone(def, params) {
				return clone(this, def, params);
			},
			brand() {
				return this;
			},
			register(reg, meta) {
				reg.add(this, meta);
				return this;
			},
			refine(check, params) {
				return this.check(refine(check, params));
			},
			superRefine(refinement, params) {
				return this.check(superRefine(refinement, params));
			},
			overwrite(fn) {
				return this.check(/* @__PURE__ */ _overwrite(fn));
			},
			optional() {
				return optional(this);
			},
			exactOptional() {
				return exactOptional(this);
			},
			nullable() {
				return nullable(this);
			},
			nullish() {
				return optional(nullable(this));
			},
			nonoptional(params) {
				return nonoptional(this, params);
			},
			array() {
				return array(this);
			},
			or(arg) {
				return union([this, arg]);
			},
			and(arg) {
				return intersection(this, arg);
			},
			transform(tx) {
				return pipe(this, transform(tx));
			},
			default(d) {
				return _default(this, d);
			},
			prefault(d) {
				return prefault(this, d);
			},
			catch(params) {
				return _catch(this, params);
			},
			pipe(target) {
				return pipe(this, target);
			},
			readonly() {
				return readonly(this);
			},
			describe(description) {
				const cl = this.clone();
				globalRegistry.add(cl, { description });
				return cl;
			},
			meta(...args) {
				if (args.length === 0) return globalRegistry.get(this);
				const cl = this.clone();
				globalRegistry.add(cl, args[0]);
				return cl;
			},
			isOptional() {
				return this.safeParse(void 0).success;
			},
			isNullable() {
				return this.safeParse(null).success;
			},
			apply(fn, ...args) {
				return args.length === 0 ? fn(this) : fn(this, ...args);
			},
			get "~standard"() {
				return hide(this, "~standard", {
					...standardProps(this),
					jsonSchema: {
						input: createStandardJSONSchemaMethod(this, "input"),
						output: createStandardJSONSchemaMethod(this, "output")
					}
				});
			},
			set "~standard"(value) {
				own(this, "~standard", value);
			},
			parse: function _parse(data, params) {
				return parse(this, data, params, { callee: _parse });
			},
			parseAsync: async function _parseAsync(data, params) {
				return await parseAsync(this, data, params, { callee: _parseAsync });
			},
			safeParse(data, params) {
				return safeParse(this, data, params);
			},
			async safeParseAsync(data, params) {
				return safeParseAsync(this, data, params);
			},
			get spa() {
				return this?.safeParseAsync;
			},
			set spa(value) {
				own(this, "spa", value);
			},
			validate(data, params) {
				return validate(this, data, params);
			},
			validateAsync(data, params) {
				return validateAsync$1(this, data, params);
			},
			encode: function _encode(data, params) {
				return encode(this, data, params, { callee: _encode });
			},
			decode: function _decode(data, params) {
				return decode(this, data, params, { callee: _decode });
			},
			encodeAsync: async function _encodeAsync(data, params) {
				return await encodeAsync(this, data, params, { callee: _encodeAsync });
			},
			decodeAsync: async function _decodeAsync(data, params) {
				return await decodeAsync(this, data, params, { callee: _decodeAsync });
			},
			safeEncode(data, params) {
				return safeEncode(this, data, params);
			},
			safeDecode(data, params) {
				return safeDecode(this, data, params);
			},
			async safeEncodeAsync(data, params) {
				return safeEncodeAsync(this, data, params);
			},
			async safeDecodeAsync(data, params) {
				return safeDecodeAsync(this, data, params);
			},
			toJSONSchema(params) {
				return createToJSONSchemaMethod(this, {})(params);
			},
			get description() {
				return globalRegistry.get(this)?.description;
			},
			get _def() {
				return this._zod.def;
			}
		});
		/** @internal */
		const _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
			$ZodString.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
		}, /*@__PURE__*/ derived({
			format: (inst) => aggregateChecks(inst).format ?? null,
			minLength: (inst) => aggregateChecks(inst).minimum ?? null,
			maxLength: (inst) => aggregateChecks(inst).maximum ?? null
		}, {
			regex(...args) {
				return this.check(/* @__PURE__ */ _regex(...args));
			},
			includes(...args) {
				return this.check(/* @__PURE__ */ _includes(...args));
			},
			startsWith(...args) {
				return this.check(/* @__PURE__ */ _startsWith(...args));
			},
			endsWith(...args) {
				return this.check(/* @__PURE__ */ _endsWith(...args));
			},
			min(...args) {
				return this.check(/* @__PURE__ */ _minLength(...args));
			},
			max(...args) {
				return this.check(/* @__PURE__ */ _maxLength(...args));
			},
			length(...args) {
				return this.check(/* @__PURE__ */ _length(...args));
			},
			nonempty(...args) {
				return this.check(/* @__PURE__ */ _minLength(1, ...args));
			},
			lowercase(params) {
				return this.check(/* @__PURE__ */ _lowercase(params));
			},
			uppercase(params) {
				return this.check(/* @__PURE__ */ _uppercase(params));
			},
			trim() {
				return this.check(/* @__PURE__ */ _trim());
			},
			normalize(...args) {
				return this.check(/* @__PURE__ */ _normalize(...args));
			},
			toLowerCase() {
				return this.check(/* @__PURE__ */ _toLowerCase());
			},
			toUpperCase() {
				return this.check(/* @__PURE__ */ _toUpperCase());
			},
			slugify() {
				return this.check(/* @__PURE__ */ _slugify());
			}
		}));
		const ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
			$ZodString.init(inst, def);
			_ZodString.init(inst, def);
		}, {
			email(params) {
				return this.check(/* @__PURE__ */ _email(ZodEmail, params));
			},
			url(params) {
				return this.check(/* @__PURE__ */ _url(ZodURL, params));
			},
			jwt(params) {
				return this.check(/* @__PURE__ */ _jwt(ZodJWT, params));
			},
			emoji(params) {
				return this.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
			},
			guid(params) {
				return this.check(/* @__PURE__ */ _guid(ZodGUID, params));
			},
			uuid(params) {
				return this.check(/* @__PURE__ */ _uuid(ZodUUID, params));
			},
			uuidv4(params) {
				return this.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
			},
			uuidv6(params) {
				return this.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
			},
			uuidv7(params) {
				return this.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
			},
			nanoid(params) {
				return this.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
			},
			cuid(params) {
				return this.check(/* @__PURE__ */ _cuid(ZodCUID, params));
			},
			cuid2(params) {
				return this.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
			},
			ulid(params) {
				return this.check(/* @__PURE__ */ _ulid(ZodULID, params));
			},
			base64(params) {
				return this.check(/* @__PURE__ */ _base64(ZodBase64, params));
			},
			base64url(params) {
				return this.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
			},
			xid(params) {
				return this.check(/* @__PURE__ */ _xid(ZodXID, params));
			},
			ksuid(params) {
				return this.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
			},
			ipv4(params) {
				return this.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
			},
			ipv6(params) {
				return this.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
			},
			cidrv4(params) {
				return this.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
			},
			cidrv6(params) {
				return this.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
			},
			e164(params) {
				return this.check(/* @__PURE__ */ _e164(ZodE164, params));
			},
			datetime(params) {
				return this.check(/* @__PURE__ */ _isoDateTime(ZodISODateTime, params));
			},
			date(params) {
				return this.check(/* @__PURE__ */ _isoDate(ZodISODate, params));
			},
			time(params) {
				return this.check(/* @__PURE__ */ _isoTime(ZodISOTime, params));
			},
			duration(params) {
				return this.check(/* @__PURE__ */ _isoDuration(ZodISODuration, params));
			}
		});
		function string(params) {
			return /* @__PURE__ */ _string(ZodString, params);
		}
		const ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			_ZodString.init(inst, def);
		});
		const ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
			$ZodISODateTime.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
			$ZodISODate.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
			$ZodISOTime.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
			$ZodISODuration.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
			$ZodEmail.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
			$ZodGUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
			$ZodUUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
			$ZodURL.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
			$ZodEmoji.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
			$ZodNanoID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link ZodCUID2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
			$ZodCUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
			$ZodCUID2.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
			$ZodULID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
			$ZodXID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
			$ZodKSUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
			$ZodIPv4.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
			$ZodIPv6.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
			$ZodCIDRv4.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
			$ZodCIDRv6.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
			$ZodBase64.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
			$ZodBase64URL.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
			$ZodE164.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
			$ZodJWT.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
			$ZodNumber.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
			inst.isFinite = true;
		}, /*@__PURE__*/ derived({
			minValue: (inst) => {
				const { minimum, exclusiveMinimum } = aggregateChecks(inst);
				return Math.max(minimum ?? Number.NEGATIVE_INFINITY, exclusiveMinimum ?? Number.NEGATIVE_INFINITY);
			},
			maxValue: (inst) => {
				const { maximum, exclusiveMaximum } = aggregateChecks(inst);
				return Math.min(maximum ?? Number.POSITIVE_INFINITY, exclusiveMaximum ?? Number.POSITIVE_INFINITY);
			},
			isInt: (inst) => {
				const { isInt, multipleOf } = aggregateChecks(inst);
				return !!isInt || !!multipleOf?.some(Number.isSafeInteger);
			},
			format: (inst) => aggregateChecks(inst).format ?? null
		}, {
			gt(value, params) {
				return this.check(/* @__PURE__ */ _gt(value, params));
			},
			gte(value, params) {
				return this.check(/* @__PURE__ */ _gte(value, params));
			},
			min(value, params) {
				return this.check(/* @__PURE__ */ _gte(value, params));
			},
			lt(value, params) {
				return this.check(/* @__PURE__ */ _lt(value, params));
			},
			lte(value, params) {
				return this.check(/* @__PURE__ */ _lte(value, params));
			},
			max(value, params) {
				return this.check(/* @__PURE__ */ _lte(value, params));
			},
			int(params) {
				return this.check(int(params));
			},
			safe(params) {
				return this.check(int(params));
			},
			positive(params) {
				return this.check(/* @__PURE__ */ _gt(0, params));
			},
			nonnegative(params) {
				return this.check(/* @__PURE__ */ _gte(0, params));
			},
			negative(params) {
				return this.check(/* @__PURE__ */ _lt(0, params));
			},
			nonpositive(params) {
				return this.check(/* @__PURE__ */ _lte(0, params));
			},
			multipleOf(value, params) {
				return this.check(/* @__PURE__ */ _multipleOf(value, params));
			},
			step(value, params) {
				return this.check(/* @__PURE__ */ _multipleOf(value, params));
			},
			finite() {
				return this;
			}
		}));
		function number(params) {
			return /* @__PURE__ */ _number(ZodNumber, params);
		}
		const ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
			$ZodNumberFormat.init(inst, def);
			ZodNumber.init(inst, def);
		});
		function int(params) {
			return /* @__PURE__ */ _int(ZodNumberFormat, params);
		}
		const ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
			$ZodBoolean.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
		});
		function boolean(params) {
			return /* @__PURE__ */ _boolean(ZodBoolean, params);
		}
		const ZodUndefined = /*@__PURE__*/ $constructor("ZodUndefined", (inst, def) => {
			$ZodUndefined.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => undefinedProcessor(inst, ctx, json, params);
		});
		function _undefined(params) {
			return /* @__PURE__ */ _undefined$1(ZodUndefined, params);
		}
		const ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
			$ZodUnknown.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => void 0;
		});
		function unknown() {
			return /* @__PURE__ */ _unknown(ZodUnknown);
		}
		const ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
			$ZodNever.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
		});
		function never(params) {
			return /* @__PURE__ */ _never(ZodNever, params);
		}
		const ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
			_ensureDefaultMemoizer();
			$ZodArray.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
			inst.element = def.element;
		}, {
			min(n, params) {
				return this.check(/* @__PURE__ */ _minLength(n, params));
			},
			nonempty(params) {
				return this.check(/* @__PURE__ */ _minLength(1, params));
			},
			max(n, params) {
				return this.check(/* @__PURE__ */ _maxLength(n, params));
			},
			length(n, params) {
				return this.check(/* @__PURE__ */ _length(n, params));
			},
			unwrap() {
				return this.element;
			}
		});
		function array(element, params) {
			return /* @__PURE__ */ _array(ZodArray, element, params);
		}
		const ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
			_ensureDefaultMemoizer();
			$ZodObjectJIT.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
			installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
		}, {
			keyof() {
				return _enum(Object.keys(this._zod.def.shape));
			},
			catchall(catchall) {
				return this.clone(mergeDefs(this._zod.def, { catchall }));
			},
			passthrough() {
				return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
			},
			loose() {
				return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
			},
			strict() {
				return this.clone(mergeDefs(this._zod.def, { catchall: never() }));
			},
			strip() {
				return this.clone(mergeDefs(this._zod.def, { catchall: void 0 }));
			},
			extend(incoming) {
				return extend(this, incoming);
			},
			safeExtend(incoming) {
				return safeExtend(this, incoming);
			},
			merge(other) {
				return merge(this, other);
			},
			pick(mask) {
				return pick(this, mask);
			},
			omit(mask) {
				return omit(this, mask);
			},
			partial(...args) {
				return partial(ZodOptional, this, args[0]);
			},
			exactPartial(...args) {
				return partial(ZodExactOptional, this, args[0], "exactPartial");
			},
			required(...args) {
				return required(ZodNonOptional, this, args[0]);
			}
		});
		function object(shape, params) {
			const def = {
				type: "object",
				shape: shape ?? {},
				...normalizeParams(params)
			};
			return new ZodObject(def);
		}
		const ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
			$ZodUnion.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
			inst.options = def.options;
		});
		function union(options, params) {
			return new ZodUnion({
				type: "union",
				options,
				...normalizeParams(params)
			});
		}
		const ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
			$ZodIntersection.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
		});
		function intersection(left, right) {
			return new ZodIntersection({
				type: "intersection",
				left,
				right
			});
		}
		const ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
			$ZodEnum.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
			inst.enum = def.entries;
			inst.options = [...inst._zod.values];
			const keys = new Set(Object.keys(def.entries));
			inst.extract = (values, params) => {
				const newEntries = {};
				for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
				else throw new Error(`Key ${value} not found in enum`);
				return new ZodEnum({
					...def,
					checks: [],
					...normalizeParams(params),
					entries: newEntries
				});
			};
			inst.exclude = (values, params) => {
				const newEntries = { ...def.entries };
				for (const value of values) if (keys.has(value)) delete newEntries[value];
				else throw new Error(`Key ${value} not found in enum`);
				return new ZodEnum({
					...def,
					checks: [],
					...normalizeParams(params),
					entries: newEntries
				});
			};
		});
		function _enum(values, params) {
			const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
			return new ZodEnum({
				type: "enum",
				entries,
				...normalizeParams(params)
			});
		}
		const ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
			$ZodLiteral.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
			inst.values = new Set(def.values);
			Object.defineProperty(inst, "value", { get() {
				if (def.values.length > 1) throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
				return def.values[0];
			} });
		});
		function literal(value, params) {
			return new ZodLiteral({
				type: "literal",
				values: Array.isArray(value) ? value : [value],
				...normalizeParams(params)
			});
		}
		const ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
			_ensureDefaultMemoizer();
			$ZodTransform.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
			inst._zod.parse = (payload, _ctx) => {
				if (_ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
				payload.addIssue = (issue$1) => {
					if (typeof issue$1 === "string") payload.issues.push(issue(issue$1, payload.value, def));
					else {
						const _issue = issue$1;
						if (_issue.fatal) _issue.continue = false;
						_issue.code ?? (_issue.code = "custom");
						if (!("input" in _issue)) _issue.input = payload.value;
						_issue.inst ?? (_issue.inst = inst);
						payload.issues.push(issue(_issue));
					}
				};
				const output = def.transform(payload.value, payload);
				if (output instanceof Promise) return output.then((output) => {
					payload.value = output;
					return payload;
				});
				payload.value = output;
				return payload;
			};
		});
		function transform(fn) {
			return new ZodTransform({
				type: "transform",
				transform: fn
			});
		}
		const ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
			$ZodOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function optional(innerType) {
			return new ZodOptional({
				type: "optional",
				innerType
			});
		}
		const ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
			$ZodExactOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function exactOptional(innerType) {
			return new ZodExactOptional({
				type: "optional",
				innerType
			});
		}
		const ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
			$ZodNullable.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function nullable(innerType) {
			return new ZodNullable({
				type: "nullable",
				innerType
			});
		}
		const ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
			$ZodDefault.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
			inst.removeDefault = inst.unwrap;
		});
		function _default(innerType, defaultValue) {
			return new ZodDefault({
				type: "default",
				innerType,
				get defaultValue() {
					return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
				}
			});
		}
		const ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
			$ZodPrefault.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function prefault(innerType, defaultValue) {
			return new ZodPrefault({
				type: "prefault",
				innerType,
				get defaultValue() {
					return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
				}
			});
		}
		const ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
			$ZodNonOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function nonoptional(innerType, params) {
			return new ZodNonOptional({
				type: "nonoptional",
				innerType,
				...normalizeParams(params)
			});
		}
		const ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
			$ZodCatch.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
			inst.removeCatch = inst.unwrap;
		});
		function _catch(innerType, catchValue) {
			return new ZodCatch({
				type: "catch",
				innerType,
				catchValue: typeof catchValue === "function" ? catchValue : constantCatch(catchValue)
			});
		}
		const ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
			$ZodPipe.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
			inst.in = def.in;
			inst.out = def.out;
		});
		function pipe(in_, out) {
			return new ZodPipe({
				type: "pipe",
				in: in_,
				out
			});
		}
		const ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
			$ZodReadonly.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function readonly(innerType) {
			return new ZodReadonly({
				type: "readonly",
				innerType
			});
		}
		const ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
			$ZodCustom.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
		});
		function refine(fn, _params = {}) {
			return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
		}
		function superRefine(fn, params) {
			return /* @__PURE__ */ _superRefine(fn, params);
		}
		//#endregion
		//#region lib/typert.remote-client.js
		const _deepseek_ai_dsh_deepresearch_deepResearch_addEvidence_parameter_0$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"questionId": intersection(string(), unknown()).readonly(),
			"criterionIds": union([_undefined(), array(string())]).readonly().optional(),
			"source": string().readonly(),
			"url": union([_undefined(), string()]).readonly().optional(),
			"snippet": union([_undefined(), string()]).readonly().optional(),
			"sources": union([_undefined(), array(object({
				"url": string().readonly(),
				"snippet": string().readonly(),
				"artifactId": union([_undefined(), string()]).readonly().optional()
			}))]).readonly().optional(),
			"claim": string().readonly(),
			"confidence": union([
				literal("low"),
				literal("medium"),
				literal("high")
			]).readonly(),
			"status": union([
				_undefined(),
				literal("rejected"),
				literal("candidate"),
				literal("accepted")
			]).readonly().optional()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_addEvidence_result$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"title": string().readonly(),
			"question": string().readonly(),
			"goal": string().readonly(),
			"constraints": string().readonly(),
			"seedText": string().readonly(),
			"depth": union([
				literal("quick"),
				literal("standard"),
				literal("deep")
			]).readonly(),
			"phase": union([
				literal("failed"),
				literal("planning"),
				literal("awaiting_plan_confirm"),
				literal("investigating"),
				literal("ready_for_report"),
				literal("incomplete"),
				literal("writing"),
				literal("done"),
				literal("aborted")
			]).readonly(),
			"runState": union([
				literal("running"),
				literal("idle"),
				literal("paused")
			]).readonly(),
			"planConfirmed": boolean().readonly(),
			"questions": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"text": string().readonly(),
				"dependsOn": array(intersection(string(), unknown())).readonly(),
				"status": union([
					literal("running"),
					literal("failed"),
					literal("pending"),
					literal("covered"),
					literal("partial"),
					literal("blocked")
				]).readonly(),
				"criteria": array(object({
					"id": string().readonly(),
					"text": string().readonly(),
					"status": union([
						literal("covered"),
						literal("partial"),
						literal("blocked"),
						literal("missing"),
						literal("conflicted")
					]).readonly(),
					"summary": string().readonly(),
					"gap": string().readonly(),
					"warning": string().readonly(),
					"verification": union([
						literal(""),
						literal("PASS"),
						literal("WARNING"),
						literal("FAIL")
					]).readonly(),
					"toolCount": number().readonly()
				})).readonly(),
				"gaps": array(string()).readonly(),
				"handoff": string().readonly()
			})).readonly(),
			"evidence": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"questionId": intersection(string(), unknown()).readonly(),
				"criterionIds": array(string()).readonly(),
				"source": string().readonly(),
				"url": union([literal(null), string()]).readonly(),
				"snippet": string().readonly(),
				"sources": array(object({
					"url": string().readonly(),
					"snippet": string().readonly(),
					"artifactId": union([_undefined(), string()]).readonly().optional()
				})).readonly(),
				"claim": string().readonly(),
				"confidence": union([
					literal("low"),
					literal("medium"),
					literal("high")
				]).readonly(),
				"status": union([
					literal("rejected"),
					literal("candidate"),
					literal("accepted")
				]).readonly(),
				"createdAt": number().readonly()
			})).readonly(),
			"conclusions": array(string()).readonly(),
			"limitations": array(string()).readonly(),
			"report": union([literal(null), string()]).readonly(),
			"budget": object({
				"maxSearches": number().readonly(),
				"maxFetches": number().readonly(),
				"searchesUsed": number().readonly(),
				"fetchesUsed": number().readonly()
			}).readonly(),
			"progress": object({
				"running": number().readonly(),
				"waiting": number().readonly(),
				"scouts": array(object({
					"questionId": intersection(string(), unknown()).readonly(),
					"role": union([
						literal("waiting"),
						literal("writing"),
						literal("scout"),
						literal("evaluator")
					]).readonly(),
					"status": union([
						literal("running"),
						literal("waiting"),
						literal("done"),
						literal("partial"),
						literal("blocked"),
						literal("verifying")
					]).readonly(),
					"waitingOn": array(intersection(string(), unknown())).readonly(),
					"toolsUsed": number().readonly(),
					"toolsCap": number().readonly(),
					"activity": string().readonly(),
					"tools": array(object({
						"name": string().readonly(),
						"detail": string().readonly(),
						"status": union([literal("running"), literal("done")]).readonly()
					})).readonly(),
					"scoutDraft": string().readonly(),
					"evaluatorDraft": string().readonly(),
					"activeCriterionId": string().readonly(),
					"activeCriterionText": string().readonly(),
					"dependencySummary": string().readonly(),
					"handoff": string().readonly()
				})).readonly()
			}).readonly(),
			"createdAt": number().readonly(),
			"updatedAt": number().readonly()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_complete_parameter_0$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"report": string().readonly(),
			"conclusions": union([_undefined(), array(string())]).readonly().optional(),
			"limitations": union([_undefined(), array(string())]).readonly().optional(),
			"partial": union([
				_undefined(),
				literal(false),
				literal(true)
			]).readonly().optional()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_complete_result$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"title": string().readonly(),
			"question": string().readonly(),
			"goal": string().readonly(),
			"constraints": string().readonly(),
			"seedText": string().readonly(),
			"depth": union([
				literal("quick"),
				literal("standard"),
				literal("deep")
			]).readonly(),
			"phase": union([
				literal("failed"),
				literal("planning"),
				literal("awaiting_plan_confirm"),
				literal("investigating"),
				literal("ready_for_report"),
				literal("incomplete"),
				literal("writing"),
				literal("done"),
				literal("aborted")
			]).readonly(),
			"runState": union([
				literal("running"),
				literal("idle"),
				literal("paused")
			]).readonly(),
			"planConfirmed": boolean().readonly(),
			"questions": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"text": string().readonly(),
				"dependsOn": array(intersection(string(), unknown())).readonly(),
				"status": union([
					literal("running"),
					literal("failed"),
					literal("pending"),
					literal("covered"),
					literal("partial"),
					literal("blocked")
				]).readonly(),
				"criteria": array(object({
					"id": string().readonly(),
					"text": string().readonly(),
					"status": union([
						literal("covered"),
						literal("partial"),
						literal("blocked"),
						literal("missing"),
						literal("conflicted")
					]).readonly(),
					"summary": string().readonly(),
					"gap": string().readonly(),
					"warning": string().readonly(),
					"verification": union([
						literal(""),
						literal("PASS"),
						literal("WARNING"),
						literal("FAIL")
					]).readonly(),
					"toolCount": number().readonly()
				})).readonly(),
				"gaps": array(string()).readonly(),
				"handoff": string().readonly()
			})).readonly(),
			"evidence": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"questionId": intersection(string(), unknown()).readonly(),
				"criterionIds": array(string()).readonly(),
				"source": string().readonly(),
				"url": union([literal(null), string()]).readonly(),
				"snippet": string().readonly(),
				"sources": array(object({
					"url": string().readonly(),
					"snippet": string().readonly(),
					"artifactId": union([_undefined(), string()]).readonly().optional()
				})).readonly(),
				"claim": string().readonly(),
				"confidence": union([
					literal("low"),
					literal("medium"),
					literal("high")
				]).readonly(),
				"status": union([
					literal("rejected"),
					literal("candidate"),
					literal("accepted")
				]).readonly(),
				"createdAt": number().readonly()
			})).readonly(),
			"conclusions": array(string()).readonly(),
			"limitations": array(string()).readonly(),
			"report": union([literal(null), string()]).readonly(),
			"budget": object({
				"maxSearches": number().readonly(),
				"maxFetches": number().readonly(),
				"searchesUsed": number().readonly(),
				"fetchesUsed": number().readonly()
			}).readonly(),
			"progress": object({
				"running": number().readonly(),
				"waiting": number().readonly(),
				"scouts": array(object({
					"questionId": intersection(string(), unknown()).readonly(),
					"role": union([
						literal("waiting"),
						literal("writing"),
						literal("scout"),
						literal("evaluator")
					]).readonly(),
					"status": union([
						literal("running"),
						literal("waiting"),
						literal("done"),
						literal("partial"),
						literal("blocked"),
						literal("verifying")
					]).readonly(),
					"waitingOn": array(intersection(string(), unknown())).readonly(),
					"toolsUsed": number().readonly(),
					"toolsCap": number().readonly(),
					"activity": string().readonly(),
					"tools": array(object({
						"name": string().readonly(),
						"detail": string().readonly(),
						"status": union([literal("running"), literal("done")]).readonly()
					})).readonly(),
					"scoutDraft": string().readonly(),
					"evaluatorDraft": string().readonly(),
					"activeCriterionId": string().readonly(),
					"activeCriterionText": string().readonly(),
					"dependencySummary": string().readonly(),
					"handoff": string().readonly()
				})).readonly()
			}).readonly(),
			"createdAt": number().readonly(),
			"updatedAt": number().readonly()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_confirmPlan_parameter_0$schema = object({ "id": intersection(string(), unknown()).readonly() });
		const _deepseek_ai_dsh_deepresearch_deepResearch_confirmPlan_result$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"title": string().readonly(),
			"question": string().readonly(),
			"goal": string().readonly(),
			"constraints": string().readonly(),
			"seedText": string().readonly(),
			"depth": union([
				literal("quick"),
				literal("standard"),
				literal("deep")
			]).readonly(),
			"phase": union([
				literal("failed"),
				literal("planning"),
				literal("awaiting_plan_confirm"),
				literal("investigating"),
				literal("ready_for_report"),
				literal("incomplete"),
				literal("writing"),
				literal("done"),
				literal("aborted")
			]).readonly(),
			"runState": union([
				literal("running"),
				literal("idle"),
				literal("paused")
			]).readonly(),
			"planConfirmed": boolean().readonly(),
			"questions": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"text": string().readonly(),
				"dependsOn": array(intersection(string(), unknown())).readonly(),
				"status": union([
					literal("running"),
					literal("failed"),
					literal("pending"),
					literal("covered"),
					literal("partial"),
					literal("blocked")
				]).readonly(),
				"criteria": array(object({
					"id": string().readonly(),
					"text": string().readonly(),
					"status": union([
						literal("covered"),
						literal("partial"),
						literal("blocked"),
						literal("missing"),
						literal("conflicted")
					]).readonly(),
					"summary": string().readonly(),
					"gap": string().readonly(),
					"warning": string().readonly(),
					"verification": union([
						literal(""),
						literal("PASS"),
						literal("WARNING"),
						literal("FAIL")
					]).readonly(),
					"toolCount": number().readonly()
				})).readonly(),
				"gaps": array(string()).readonly(),
				"handoff": string().readonly()
			})).readonly(),
			"evidence": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"questionId": intersection(string(), unknown()).readonly(),
				"criterionIds": array(string()).readonly(),
				"source": string().readonly(),
				"url": union([literal(null), string()]).readonly(),
				"snippet": string().readonly(),
				"sources": array(object({
					"url": string().readonly(),
					"snippet": string().readonly(),
					"artifactId": union([_undefined(), string()]).readonly().optional()
				})).readonly(),
				"claim": string().readonly(),
				"confidence": union([
					literal("low"),
					literal("medium"),
					literal("high")
				]).readonly(),
				"status": union([
					literal("rejected"),
					literal("candidate"),
					literal("accepted")
				]).readonly(),
				"createdAt": number().readonly()
			})).readonly(),
			"conclusions": array(string()).readonly(),
			"limitations": array(string()).readonly(),
			"report": union([literal(null), string()]).readonly(),
			"budget": object({
				"maxSearches": number().readonly(),
				"maxFetches": number().readonly(),
				"searchesUsed": number().readonly(),
				"fetchesUsed": number().readonly()
			}).readonly(),
			"progress": object({
				"running": number().readonly(),
				"waiting": number().readonly(),
				"scouts": array(object({
					"questionId": intersection(string(), unknown()).readonly(),
					"role": union([
						literal("waiting"),
						literal("writing"),
						literal("scout"),
						literal("evaluator")
					]).readonly(),
					"status": union([
						literal("running"),
						literal("waiting"),
						literal("done"),
						literal("partial"),
						literal("blocked"),
						literal("verifying")
					]).readonly(),
					"waitingOn": array(intersection(string(), unknown())).readonly(),
					"toolsUsed": number().readonly(),
					"toolsCap": number().readonly(),
					"activity": string().readonly(),
					"tools": array(object({
						"name": string().readonly(),
						"detail": string().readonly(),
						"status": union([literal("running"), literal("done")]).readonly()
					})).readonly(),
					"scoutDraft": string().readonly(),
					"evaluatorDraft": string().readonly(),
					"activeCriterionId": string().readonly(),
					"activeCriterionText": string().readonly(),
					"dependencySummary": string().readonly(),
					"handoff": string().readonly()
				})).readonly()
			}).readonly(),
			"createdAt": number().readonly(),
			"updatedAt": number().readonly()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_delete_parameter_0$schema = object({ "id": intersection(string(), unknown()).readonly() });
		const _deepseek_ai_dsh_deepresearch_deepResearch_delete_result$schema = object({ "deleted": boolean().readonly() });
		const _deepseek_ai_dsh_deepresearch_deepResearch_fail_parameter_0$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"reason": string().readonly(),
			"aborted": boolean().readonly().optional()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_fail_result$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"title": string().readonly(),
			"question": string().readonly(),
			"goal": string().readonly(),
			"constraints": string().readonly(),
			"seedText": string().readonly(),
			"depth": union([
				literal("quick"),
				literal("standard"),
				literal("deep")
			]).readonly(),
			"phase": union([
				literal("failed"),
				literal("planning"),
				literal("awaiting_plan_confirm"),
				literal("investigating"),
				literal("ready_for_report"),
				literal("incomplete"),
				literal("writing"),
				literal("done"),
				literal("aborted")
			]).readonly(),
			"runState": union([
				literal("running"),
				literal("idle"),
				literal("paused")
			]).readonly(),
			"planConfirmed": boolean().readonly(),
			"questions": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"text": string().readonly(),
				"dependsOn": array(intersection(string(), unknown())).readonly(),
				"status": union([
					literal("running"),
					literal("failed"),
					literal("pending"),
					literal("covered"),
					literal("partial"),
					literal("blocked")
				]).readonly(),
				"criteria": array(object({
					"id": string().readonly(),
					"text": string().readonly(),
					"status": union([
						literal("covered"),
						literal("partial"),
						literal("blocked"),
						literal("missing"),
						literal("conflicted")
					]).readonly(),
					"summary": string().readonly(),
					"gap": string().readonly(),
					"warning": string().readonly(),
					"verification": union([
						literal(""),
						literal("PASS"),
						literal("WARNING"),
						literal("FAIL")
					]).readonly(),
					"toolCount": number().readonly()
				})).readonly(),
				"gaps": array(string()).readonly(),
				"handoff": string().readonly()
			})).readonly(),
			"evidence": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"questionId": intersection(string(), unknown()).readonly(),
				"criterionIds": array(string()).readonly(),
				"source": string().readonly(),
				"url": union([literal(null), string()]).readonly(),
				"snippet": string().readonly(),
				"sources": array(object({
					"url": string().readonly(),
					"snippet": string().readonly(),
					"artifactId": union([_undefined(), string()]).readonly().optional()
				})).readonly(),
				"claim": string().readonly(),
				"confidence": union([
					literal("low"),
					literal("medium"),
					literal("high")
				]).readonly(),
				"status": union([
					literal("rejected"),
					literal("candidate"),
					literal("accepted")
				]).readonly(),
				"createdAt": number().readonly()
			})).readonly(),
			"conclusions": array(string()).readonly(),
			"limitations": array(string()).readonly(),
			"report": union([literal(null), string()]).readonly(),
			"budget": object({
				"maxSearches": number().readonly(),
				"maxFetches": number().readonly(),
				"searchesUsed": number().readonly(),
				"fetchesUsed": number().readonly()
			}).readonly(),
			"progress": object({
				"running": number().readonly(),
				"waiting": number().readonly(),
				"scouts": array(object({
					"questionId": intersection(string(), unknown()).readonly(),
					"role": union([
						literal("waiting"),
						literal("writing"),
						literal("scout"),
						literal("evaluator")
					]).readonly(),
					"status": union([
						literal("running"),
						literal("waiting"),
						literal("done"),
						literal("partial"),
						literal("blocked"),
						literal("verifying")
					]).readonly(),
					"waitingOn": array(intersection(string(), unknown())).readonly(),
					"toolsUsed": number().readonly(),
					"toolsCap": number().readonly(),
					"activity": string().readonly(),
					"tools": array(object({
						"name": string().readonly(),
						"detail": string().readonly(),
						"status": union([literal("running"), literal("done")]).readonly()
					})).readonly(),
					"scoutDraft": string().readonly(),
					"evaluatorDraft": string().readonly(),
					"activeCriterionId": string().readonly(),
					"activeCriterionText": string().readonly(),
					"dependencySummary": string().readonly(),
					"handoff": string().readonly()
				})).readonly()
			}).readonly(),
			"createdAt": number().readonly(),
			"updatedAt": number().readonly()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_get_parameter_0$schema = object({ "id": intersection(string(), unknown()).readonly() });
		const _deepseek_ai_dsh_deepresearch_deepResearch_get_result$schema = union([literal(null), object({
			"id": intersection(string(), unknown()).readonly(),
			"title": string().readonly(),
			"question": string().readonly(),
			"goal": string().readonly(),
			"constraints": string().readonly(),
			"seedText": string().readonly(),
			"depth": union([
				literal("quick"),
				literal("standard"),
				literal("deep")
			]).readonly(),
			"phase": union([
				literal("failed"),
				literal("planning"),
				literal("awaiting_plan_confirm"),
				literal("investigating"),
				literal("ready_for_report"),
				literal("incomplete"),
				literal("writing"),
				literal("done"),
				literal("aborted")
			]).readonly(),
			"runState": union([
				literal("running"),
				literal("idle"),
				literal("paused")
			]).readonly(),
			"planConfirmed": boolean().readonly(),
			"questions": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"text": string().readonly(),
				"dependsOn": array(intersection(string(), unknown())).readonly(),
				"status": union([
					literal("running"),
					literal("failed"),
					literal("pending"),
					literal("covered"),
					literal("partial"),
					literal("blocked")
				]).readonly(),
				"criteria": array(object({
					"id": string().readonly(),
					"text": string().readonly(),
					"status": union([
						literal("covered"),
						literal("partial"),
						literal("blocked"),
						literal("missing"),
						literal("conflicted")
					]).readonly(),
					"summary": string().readonly(),
					"gap": string().readonly(),
					"warning": string().readonly(),
					"verification": union([
						literal(""),
						literal("PASS"),
						literal("WARNING"),
						literal("FAIL")
					]).readonly(),
					"toolCount": number().readonly()
				})).readonly(),
				"gaps": array(string()).readonly(),
				"handoff": string().readonly()
			})).readonly(),
			"evidence": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"questionId": intersection(string(), unknown()).readonly(),
				"criterionIds": array(string()).readonly(),
				"source": string().readonly(),
				"url": union([literal(null), string()]).readonly(),
				"snippet": string().readonly(),
				"sources": array(object({
					"url": string().readonly(),
					"snippet": string().readonly(),
					"artifactId": union([_undefined(), string()]).readonly().optional()
				})).readonly(),
				"claim": string().readonly(),
				"confidence": union([
					literal("low"),
					literal("medium"),
					literal("high")
				]).readonly(),
				"status": union([
					literal("rejected"),
					literal("candidate"),
					literal("accepted")
				]).readonly(),
				"createdAt": number().readonly()
			})).readonly(),
			"conclusions": array(string()).readonly(),
			"limitations": array(string()).readonly(),
			"report": union([literal(null), string()]).readonly(),
			"budget": object({
				"maxSearches": number().readonly(),
				"maxFetches": number().readonly(),
				"searchesUsed": number().readonly(),
				"fetchesUsed": number().readonly()
			}).readonly(),
			"progress": object({
				"running": number().readonly(),
				"waiting": number().readonly(),
				"scouts": array(object({
					"questionId": intersection(string(), unknown()).readonly(),
					"role": union([
						literal("waiting"),
						literal("writing"),
						literal("scout"),
						literal("evaluator")
					]).readonly(),
					"status": union([
						literal("running"),
						literal("waiting"),
						literal("done"),
						literal("partial"),
						literal("blocked"),
						literal("verifying")
					]).readonly(),
					"waitingOn": array(intersection(string(), unknown())).readonly(),
					"toolsUsed": number().readonly(),
					"toolsCap": number().readonly(),
					"activity": string().readonly(),
					"tools": array(object({
						"name": string().readonly(),
						"detail": string().readonly(),
						"status": union([literal("running"), literal("done")]).readonly()
					})).readonly(),
					"scoutDraft": string().readonly(),
					"evaluatorDraft": string().readonly(),
					"activeCriterionId": string().readonly(),
					"activeCriterionText": string().readonly(),
					"dependencySummary": string().readonly(),
					"handoff": string().readonly()
				})).readonly()
			}).readonly(),
			"createdAt": number().readonly(),
			"updatedAt": number().readonly()
		})]);
		const _deepseek_ai_dsh_deepresearch_deepResearch_list_parameter_0$schema = object({
			"query": string().readonly().optional(),
			"phase": union([
				literal("failed"),
				literal("planning"),
				literal("awaiting_plan_confirm"),
				literal("investigating"),
				literal("ready_for_report"),
				literal("incomplete"),
				literal("writing"),
				literal("done"),
				literal("aborted")
			]).readonly().optional()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_list_result$schema = object({ "projects": array(object({
			"id": intersection(string(), unknown()).readonly(),
			"title": string().readonly(),
			"question": string().readonly(),
			"goal": string().readonly(),
			"constraints": string().readonly(),
			"seedText": string().readonly(),
			"depth": union([
				literal("quick"),
				literal("standard"),
				literal("deep")
			]).readonly(),
			"phase": union([
				literal("failed"),
				literal("planning"),
				literal("awaiting_plan_confirm"),
				literal("investigating"),
				literal("ready_for_report"),
				literal("incomplete"),
				literal("writing"),
				literal("done"),
				literal("aborted")
			]).readonly(),
			"runState": union([
				literal("running"),
				literal("idle"),
				literal("paused")
			]).readonly(),
			"planConfirmed": boolean().readonly(),
			"questions": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"text": string().readonly(),
				"dependsOn": array(intersection(string(), unknown())).readonly(),
				"status": union([
					literal("running"),
					literal("failed"),
					literal("pending"),
					literal("covered"),
					literal("partial"),
					literal("blocked")
				]).readonly(),
				"criteria": array(object({
					"id": string().readonly(),
					"text": string().readonly(),
					"status": union([
						literal("covered"),
						literal("partial"),
						literal("blocked"),
						literal("missing"),
						literal("conflicted")
					]).readonly(),
					"summary": string().readonly(),
					"gap": string().readonly(),
					"warning": string().readonly(),
					"verification": union([
						literal(""),
						literal("PASS"),
						literal("WARNING"),
						literal("FAIL")
					]).readonly(),
					"toolCount": number().readonly()
				})).readonly(),
				"gaps": array(string()).readonly(),
				"handoff": string().readonly()
			})).readonly(),
			"evidence": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"questionId": intersection(string(), unknown()).readonly(),
				"criterionIds": array(string()).readonly(),
				"source": string().readonly(),
				"url": union([literal(null), string()]).readonly(),
				"snippet": string().readonly(),
				"sources": array(object({
					"url": string().readonly(),
					"snippet": string().readonly(),
					"artifactId": union([_undefined(), string()]).readonly().optional()
				})).readonly(),
				"claim": string().readonly(),
				"confidence": union([
					literal("low"),
					literal("medium"),
					literal("high")
				]).readonly(),
				"status": union([
					literal("rejected"),
					literal("candidate"),
					literal("accepted")
				]).readonly(),
				"createdAt": number().readonly()
			})).readonly(),
			"conclusions": array(string()).readonly(),
			"limitations": array(string()).readonly(),
			"report": union([literal(null), string()]).readonly(),
			"budget": object({
				"maxSearches": number().readonly(),
				"maxFetches": number().readonly(),
				"searchesUsed": number().readonly(),
				"fetchesUsed": number().readonly()
			}).readonly(),
			"progress": object({
				"running": number().readonly(),
				"waiting": number().readonly(),
				"scouts": array(object({
					"questionId": intersection(string(), unknown()).readonly(),
					"role": union([
						literal("waiting"),
						literal("writing"),
						literal("scout"),
						literal("evaluator")
					]).readonly(),
					"status": union([
						literal("running"),
						literal("waiting"),
						literal("done"),
						literal("partial"),
						literal("blocked"),
						literal("verifying")
					]).readonly(),
					"waitingOn": array(intersection(string(), unknown())).readonly(),
					"toolsUsed": number().readonly(),
					"toolsCap": number().readonly(),
					"activity": string().readonly(),
					"tools": array(object({
						"name": string().readonly(),
						"detail": string().readonly(),
						"status": union([literal("running"), literal("done")]).readonly()
					})).readonly(),
					"scoutDraft": string().readonly(),
					"evaluatorDraft": string().readonly(),
					"activeCriterionId": string().readonly(),
					"activeCriterionText": string().readonly(),
					"dependencySummary": string().readonly(),
					"handoff": string().readonly()
				})).readonly()
			}).readonly(),
			"createdAt": number().readonly(),
			"updatedAt": number().readonly()
		})).readonly() });
		const _deepseek_ai_dsh_deepresearch_deepResearch_resume_parameter_0$schema = object({ "id": intersection(string(), unknown()).readonly() });
		const _deepseek_ai_dsh_deepresearch_deepResearch_resume_result$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"title": string().readonly(),
			"question": string().readonly(),
			"goal": string().readonly(),
			"constraints": string().readonly(),
			"seedText": string().readonly(),
			"depth": union([
				literal("quick"),
				literal("standard"),
				literal("deep")
			]).readonly(),
			"phase": union([
				literal("failed"),
				literal("planning"),
				literal("awaiting_plan_confirm"),
				literal("investigating"),
				literal("ready_for_report"),
				literal("incomplete"),
				literal("writing"),
				literal("done"),
				literal("aborted")
			]).readonly(),
			"runState": union([
				literal("running"),
				literal("idle"),
				literal("paused")
			]).readonly(),
			"planConfirmed": boolean().readonly(),
			"questions": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"text": string().readonly(),
				"dependsOn": array(intersection(string(), unknown())).readonly(),
				"status": union([
					literal("running"),
					literal("failed"),
					literal("pending"),
					literal("covered"),
					literal("partial"),
					literal("blocked")
				]).readonly(),
				"criteria": array(object({
					"id": string().readonly(),
					"text": string().readonly(),
					"status": union([
						literal("covered"),
						literal("partial"),
						literal("blocked"),
						literal("missing"),
						literal("conflicted")
					]).readonly(),
					"summary": string().readonly(),
					"gap": string().readonly(),
					"warning": string().readonly(),
					"verification": union([
						literal(""),
						literal("PASS"),
						literal("WARNING"),
						literal("FAIL")
					]).readonly(),
					"toolCount": number().readonly()
				})).readonly(),
				"gaps": array(string()).readonly(),
				"handoff": string().readonly()
			})).readonly(),
			"evidence": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"questionId": intersection(string(), unknown()).readonly(),
				"criterionIds": array(string()).readonly(),
				"source": string().readonly(),
				"url": union([literal(null), string()]).readonly(),
				"snippet": string().readonly(),
				"sources": array(object({
					"url": string().readonly(),
					"snippet": string().readonly(),
					"artifactId": union([_undefined(), string()]).readonly().optional()
				})).readonly(),
				"claim": string().readonly(),
				"confidence": union([
					literal("low"),
					literal("medium"),
					literal("high")
				]).readonly(),
				"status": union([
					literal("rejected"),
					literal("candidate"),
					literal("accepted")
				]).readonly(),
				"createdAt": number().readonly()
			})).readonly(),
			"conclusions": array(string()).readonly(),
			"limitations": array(string()).readonly(),
			"report": union([literal(null), string()]).readonly(),
			"budget": object({
				"maxSearches": number().readonly(),
				"maxFetches": number().readonly(),
				"searchesUsed": number().readonly(),
				"fetchesUsed": number().readonly()
			}).readonly(),
			"progress": object({
				"running": number().readonly(),
				"waiting": number().readonly(),
				"scouts": array(object({
					"questionId": intersection(string(), unknown()).readonly(),
					"role": union([
						literal("waiting"),
						literal("writing"),
						literal("scout"),
						literal("evaluator")
					]).readonly(),
					"status": union([
						literal("running"),
						literal("waiting"),
						literal("done"),
						literal("partial"),
						literal("blocked"),
						literal("verifying")
					]).readonly(),
					"waitingOn": array(intersection(string(), unknown())).readonly(),
					"toolsUsed": number().readonly(),
					"toolsCap": number().readonly(),
					"activity": string().readonly(),
					"tools": array(object({
						"name": string().readonly(),
						"detail": string().readonly(),
						"status": union([literal("running"), literal("done")]).readonly()
					})).readonly(),
					"scoutDraft": string().readonly(),
					"evaluatorDraft": string().readonly(),
					"activeCriterionId": string().readonly(),
					"activeCriterionText": string().readonly(),
					"dependencySummary": string().readonly(),
					"handoff": string().readonly()
				})).readonly()
			}).readonly(),
			"createdAt": number().readonly(),
			"updatedAt": number().readonly()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_start_parameter_0$schema = object({
			"title": string().readonly().optional(),
			"question": string().readonly(),
			"goal": string().readonly().optional(),
			"constraints": string().readonly().optional(),
			"seedText": string().readonly().optional(),
			"depth": union([
				literal("quick"),
				literal("standard"),
				literal("deep")
			]).readonly(),
			"questions": array(object({
				"text": string().readonly(),
				"criteria": array(string()).readonly(),
				"dependsOn": array(number()).readonly().optional()
			})).readonly()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_start_result$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"title": string().readonly(),
			"question": string().readonly(),
			"goal": string().readonly(),
			"constraints": string().readonly(),
			"seedText": string().readonly(),
			"depth": union([
				literal("quick"),
				literal("standard"),
				literal("deep")
			]).readonly(),
			"phase": union([
				literal("failed"),
				literal("planning"),
				literal("awaiting_plan_confirm"),
				literal("investigating"),
				literal("ready_for_report"),
				literal("incomplete"),
				literal("writing"),
				literal("done"),
				literal("aborted")
			]).readonly(),
			"runState": union([
				literal("running"),
				literal("idle"),
				literal("paused")
			]).readonly(),
			"planConfirmed": boolean().readonly(),
			"questions": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"text": string().readonly(),
				"dependsOn": array(intersection(string(), unknown())).readonly(),
				"status": union([
					literal("running"),
					literal("failed"),
					literal("pending"),
					literal("covered"),
					literal("partial"),
					literal("blocked")
				]).readonly(),
				"criteria": array(object({
					"id": string().readonly(),
					"text": string().readonly(),
					"status": union([
						literal("covered"),
						literal("partial"),
						literal("blocked"),
						literal("missing"),
						literal("conflicted")
					]).readonly(),
					"summary": string().readonly(),
					"gap": string().readonly(),
					"warning": string().readonly(),
					"verification": union([
						literal(""),
						literal("PASS"),
						literal("WARNING"),
						literal("FAIL")
					]).readonly(),
					"toolCount": number().readonly()
				})).readonly(),
				"gaps": array(string()).readonly(),
				"handoff": string().readonly()
			})).readonly(),
			"evidence": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"questionId": intersection(string(), unknown()).readonly(),
				"criterionIds": array(string()).readonly(),
				"source": string().readonly(),
				"url": union([literal(null), string()]).readonly(),
				"snippet": string().readonly(),
				"sources": array(object({
					"url": string().readonly(),
					"snippet": string().readonly(),
					"artifactId": union([_undefined(), string()]).readonly().optional()
				})).readonly(),
				"claim": string().readonly(),
				"confidence": union([
					literal("low"),
					literal("medium"),
					literal("high")
				]).readonly(),
				"status": union([
					literal("rejected"),
					literal("candidate"),
					literal("accepted")
				]).readonly(),
				"createdAt": number().readonly()
			})).readonly(),
			"conclusions": array(string()).readonly(),
			"limitations": array(string()).readonly(),
			"report": union([literal(null), string()]).readonly(),
			"budget": object({
				"maxSearches": number().readonly(),
				"maxFetches": number().readonly(),
				"searchesUsed": number().readonly(),
				"fetchesUsed": number().readonly()
			}).readonly(),
			"progress": object({
				"running": number().readonly(),
				"waiting": number().readonly(),
				"scouts": array(object({
					"questionId": intersection(string(), unknown()).readonly(),
					"role": union([
						literal("waiting"),
						literal("writing"),
						literal("scout"),
						literal("evaluator")
					]).readonly(),
					"status": union([
						literal("running"),
						literal("waiting"),
						literal("done"),
						literal("partial"),
						literal("blocked"),
						literal("verifying")
					]).readonly(),
					"waitingOn": array(intersection(string(), unknown())).readonly(),
					"toolsUsed": number().readonly(),
					"toolsCap": number().readonly(),
					"activity": string().readonly(),
					"tools": array(object({
						"name": string().readonly(),
						"detail": string().readonly(),
						"status": union([literal("running"), literal("done")]).readonly()
					})).readonly(),
					"scoutDraft": string().readonly(),
					"evaluatorDraft": string().readonly(),
					"activeCriterionId": string().readonly(),
					"activeCriterionText": string().readonly(),
					"dependencySummary": string().readonly(),
					"handoff": string().readonly()
				})).readonly()
			}).readonly(),
			"createdAt": number().readonly(),
			"updatedAt": number().readonly()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_updatePlan_parameter_0$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"goal": string().readonly(),
			"constraints": string().readonly(),
			"depth": union([
				literal("quick"),
				literal("standard"),
				literal("deep")
			]).readonly(),
			"questions": array(object({
				"text": string().readonly(),
				"criteria": array(string()).readonly(),
				"dependsOn": array(number()).readonly().optional()
			})).readonly()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_updatePlan_result$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"title": string().readonly(),
			"question": string().readonly(),
			"goal": string().readonly(),
			"constraints": string().readonly(),
			"seedText": string().readonly(),
			"depth": union([
				literal("quick"),
				literal("standard"),
				literal("deep")
			]).readonly(),
			"phase": union([
				literal("failed"),
				literal("planning"),
				literal("awaiting_plan_confirm"),
				literal("investigating"),
				literal("ready_for_report"),
				literal("incomplete"),
				literal("writing"),
				literal("done"),
				literal("aborted")
			]).readonly(),
			"runState": union([
				literal("running"),
				literal("idle"),
				literal("paused")
			]).readonly(),
			"planConfirmed": boolean().readonly(),
			"questions": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"text": string().readonly(),
				"dependsOn": array(intersection(string(), unknown())).readonly(),
				"status": union([
					literal("running"),
					literal("failed"),
					literal("pending"),
					literal("covered"),
					literal("partial"),
					literal("blocked")
				]).readonly(),
				"criteria": array(object({
					"id": string().readonly(),
					"text": string().readonly(),
					"status": union([
						literal("covered"),
						literal("partial"),
						literal("blocked"),
						literal("missing"),
						literal("conflicted")
					]).readonly(),
					"summary": string().readonly(),
					"gap": string().readonly(),
					"warning": string().readonly(),
					"verification": union([
						literal(""),
						literal("PASS"),
						literal("WARNING"),
						literal("FAIL")
					]).readonly(),
					"toolCount": number().readonly()
				})).readonly(),
				"gaps": array(string()).readonly(),
				"handoff": string().readonly()
			})).readonly(),
			"evidence": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"questionId": intersection(string(), unknown()).readonly(),
				"criterionIds": array(string()).readonly(),
				"source": string().readonly(),
				"url": union([literal(null), string()]).readonly(),
				"snippet": string().readonly(),
				"sources": array(object({
					"url": string().readonly(),
					"snippet": string().readonly(),
					"artifactId": union([_undefined(), string()]).readonly().optional()
				})).readonly(),
				"claim": string().readonly(),
				"confidence": union([
					literal("low"),
					literal("medium"),
					literal("high")
				]).readonly(),
				"status": union([
					literal("rejected"),
					literal("candidate"),
					literal("accepted")
				]).readonly(),
				"createdAt": number().readonly()
			})).readonly(),
			"conclusions": array(string()).readonly(),
			"limitations": array(string()).readonly(),
			"report": union([literal(null), string()]).readonly(),
			"budget": object({
				"maxSearches": number().readonly(),
				"maxFetches": number().readonly(),
				"searchesUsed": number().readonly(),
				"fetchesUsed": number().readonly()
			}).readonly(),
			"progress": object({
				"running": number().readonly(),
				"waiting": number().readonly(),
				"scouts": array(object({
					"questionId": intersection(string(), unknown()).readonly(),
					"role": union([
						literal("waiting"),
						literal("writing"),
						literal("scout"),
						literal("evaluator")
					]).readonly(),
					"status": union([
						literal("running"),
						literal("waiting"),
						literal("done"),
						literal("partial"),
						literal("blocked"),
						literal("verifying")
					]).readonly(),
					"waitingOn": array(intersection(string(), unknown())).readonly(),
					"toolsUsed": number().readonly(),
					"toolsCap": number().readonly(),
					"activity": string().readonly(),
					"tools": array(object({
						"name": string().readonly(),
						"detail": string().readonly(),
						"status": union([literal("running"), literal("done")]).readonly()
					})).readonly(),
					"scoutDraft": string().readonly(),
					"evaluatorDraft": string().readonly(),
					"activeCriterionId": string().readonly(),
					"activeCriterionText": string().readonly(),
					"dependencySummary": string().readonly(),
					"handoff": string().readonly()
				})).readonly()
			}).readonly(),
			"createdAt": number().readonly(),
			"updatedAt": number().readonly()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_updateQuestion_parameter_0$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"questionId": intersection(string(), unknown()).readonly(),
			"status": union([
				literal("running"),
				literal("failed"),
				literal("pending"),
				literal("covered"),
				literal("partial"),
				literal("blocked")
			]).readonly(),
			"criteria": array(object({
				"id": string().readonly(),
				"text": string().readonly(),
				"status": union([
					literal("covered"),
					literal("partial"),
					literal("blocked"),
					literal("missing"),
					literal("conflicted")
				]).readonly(),
				"summary": string().readonly(),
				"gap": string().readonly(),
				"warning": string().readonly(),
				"verification": union([
					literal(""),
					literal("PASS"),
					literal("WARNING"),
					literal("FAIL")
				]).readonly(),
				"toolCount": number().readonly()
			})).readonly().optional()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_updateQuestion_result$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"title": string().readonly(),
			"question": string().readonly(),
			"goal": string().readonly(),
			"constraints": string().readonly(),
			"seedText": string().readonly(),
			"depth": union([
				literal("quick"),
				literal("standard"),
				literal("deep")
			]).readonly(),
			"phase": union([
				literal("failed"),
				literal("planning"),
				literal("awaiting_plan_confirm"),
				literal("investigating"),
				literal("ready_for_report"),
				literal("incomplete"),
				literal("writing"),
				literal("done"),
				literal("aborted")
			]).readonly(),
			"runState": union([
				literal("running"),
				literal("idle"),
				literal("paused")
			]).readonly(),
			"planConfirmed": boolean().readonly(),
			"questions": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"text": string().readonly(),
				"dependsOn": array(intersection(string(), unknown())).readonly(),
				"status": union([
					literal("running"),
					literal("failed"),
					literal("pending"),
					literal("covered"),
					literal("partial"),
					literal("blocked")
				]).readonly(),
				"criteria": array(object({
					"id": string().readonly(),
					"text": string().readonly(),
					"status": union([
						literal("covered"),
						literal("partial"),
						literal("blocked"),
						literal("missing"),
						literal("conflicted")
					]).readonly(),
					"summary": string().readonly(),
					"gap": string().readonly(),
					"warning": string().readonly(),
					"verification": union([
						literal(""),
						literal("PASS"),
						literal("WARNING"),
						literal("FAIL")
					]).readonly(),
					"toolCount": number().readonly()
				})).readonly(),
				"gaps": array(string()).readonly(),
				"handoff": string().readonly()
			})).readonly(),
			"evidence": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"questionId": intersection(string(), unknown()).readonly(),
				"criterionIds": array(string()).readonly(),
				"source": string().readonly(),
				"url": union([literal(null), string()]).readonly(),
				"snippet": string().readonly(),
				"sources": array(object({
					"url": string().readonly(),
					"snippet": string().readonly(),
					"artifactId": union([_undefined(), string()]).readonly().optional()
				})).readonly(),
				"claim": string().readonly(),
				"confidence": union([
					literal("low"),
					literal("medium"),
					literal("high")
				]).readonly(),
				"status": union([
					literal("rejected"),
					literal("candidate"),
					literal("accepted")
				]).readonly(),
				"createdAt": number().readonly()
			})).readonly(),
			"conclusions": array(string()).readonly(),
			"limitations": array(string()).readonly(),
			"report": union([literal(null), string()]).readonly(),
			"budget": object({
				"maxSearches": number().readonly(),
				"maxFetches": number().readonly(),
				"searchesUsed": number().readonly(),
				"fetchesUsed": number().readonly()
			}).readonly(),
			"progress": object({
				"running": number().readonly(),
				"waiting": number().readonly(),
				"scouts": array(object({
					"questionId": intersection(string(), unknown()).readonly(),
					"role": union([
						literal("waiting"),
						literal("writing"),
						literal("scout"),
						literal("evaluator")
					]).readonly(),
					"status": union([
						literal("running"),
						literal("waiting"),
						literal("done"),
						literal("partial"),
						literal("blocked"),
						literal("verifying")
					]).readonly(),
					"waitingOn": array(intersection(string(), unknown())).readonly(),
					"toolsUsed": number().readonly(),
					"toolsCap": number().readonly(),
					"activity": string().readonly(),
					"tools": array(object({
						"name": string().readonly(),
						"detail": string().readonly(),
						"status": union([literal("running"), literal("done")]).readonly()
					})).readonly(),
					"scoutDraft": string().readonly(),
					"evaluatorDraft": string().readonly(),
					"activeCriterionId": string().readonly(),
					"activeCriterionText": string().readonly(),
					"dependencySummary": string().readonly(),
					"handoff": string().readonly()
				})).readonly()
			}).readonly(),
			"createdAt": number().readonly(),
			"updatedAt": number().readonly()
		});
		const _deepseek_ai_dsh_deepresearch_deepResearch_writeReport_parameter_0$schema = object({ "id": intersection(string(), unknown()).readonly() });
		const _deepseek_ai_dsh_deepresearch_deepResearch_writeReport_result$schema = object({
			"id": intersection(string(), unknown()).readonly(),
			"title": string().readonly(),
			"question": string().readonly(),
			"goal": string().readonly(),
			"constraints": string().readonly(),
			"seedText": string().readonly(),
			"depth": union([
				literal("quick"),
				literal("standard"),
				literal("deep")
			]).readonly(),
			"phase": union([
				literal("failed"),
				literal("planning"),
				literal("awaiting_plan_confirm"),
				literal("investigating"),
				literal("ready_for_report"),
				literal("incomplete"),
				literal("writing"),
				literal("done"),
				literal("aborted")
			]).readonly(),
			"runState": union([
				literal("running"),
				literal("idle"),
				literal("paused")
			]).readonly(),
			"planConfirmed": boolean().readonly(),
			"questions": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"text": string().readonly(),
				"dependsOn": array(intersection(string(), unknown())).readonly(),
				"status": union([
					literal("running"),
					literal("failed"),
					literal("pending"),
					literal("covered"),
					literal("partial"),
					literal("blocked")
				]).readonly(),
				"criteria": array(object({
					"id": string().readonly(),
					"text": string().readonly(),
					"status": union([
						literal("covered"),
						literal("partial"),
						literal("blocked"),
						literal("missing"),
						literal("conflicted")
					]).readonly(),
					"summary": string().readonly(),
					"gap": string().readonly(),
					"warning": string().readonly(),
					"verification": union([
						literal(""),
						literal("PASS"),
						literal("WARNING"),
						literal("FAIL")
					]).readonly(),
					"toolCount": number().readonly()
				})).readonly(),
				"gaps": array(string()).readonly(),
				"handoff": string().readonly()
			})).readonly(),
			"evidence": array(object({
				"id": intersection(string(), unknown()).readonly(),
				"questionId": intersection(string(), unknown()).readonly(),
				"criterionIds": array(string()).readonly(),
				"source": string().readonly(),
				"url": union([literal(null), string()]).readonly(),
				"snippet": string().readonly(),
				"sources": array(object({
					"url": string().readonly(),
					"snippet": string().readonly(),
					"artifactId": union([_undefined(), string()]).readonly().optional()
				})).readonly(),
				"claim": string().readonly(),
				"confidence": union([
					literal("low"),
					literal("medium"),
					literal("high")
				]).readonly(),
				"status": union([
					literal("rejected"),
					literal("candidate"),
					literal("accepted")
				]).readonly(),
				"createdAt": number().readonly()
			})).readonly(),
			"conclusions": array(string()).readonly(),
			"limitations": array(string()).readonly(),
			"report": union([literal(null), string()]).readonly(),
			"budget": object({
				"maxSearches": number().readonly(),
				"maxFetches": number().readonly(),
				"searchesUsed": number().readonly(),
				"fetchesUsed": number().readonly()
			}).readonly(),
			"progress": object({
				"running": number().readonly(),
				"waiting": number().readonly(),
				"scouts": array(object({
					"questionId": intersection(string(), unknown()).readonly(),
					"role": union([
						literal("waiting"),
						literal("writing"),
						literal("scout"),
						literal("evaluator")
					]).readonly(),
					"status": union([
						literal("running"),
						literal("waiting"),
						literal("done"),
						literal("partial"),
						literal("blocked"),
						literal("verifying")
					]).readonly(),
					"waitingOn": array(intersection(string(), unknown())).readonly(),
					"toolsUsed": number().readonly(),
					"toolsCap": number().readonly(),
					"activity": string().readonly(),
					"tools": array(object({
						"name": string().readonly(),
						"detail": string().readonly(),
						"status": union([literal("running"), literal("done")]).readonly()
					})).readonly(),
					"scoutDraft": string().readonly(),
					"evaluatorDraft": string().readonly(),
					"activeCriterionId": string().readonly(),
					"activeCriterionText": string().readonly(),
					"dependencySummary": string().readonly(),
					"handoff": string().readonly()
				})).readonly()
			}).readonly(),
			"createdAt": number().readonly(),
			"updatedAt": number().readonly()
		});
		const TYPERT_REMOTE = {
			package: "@deepseek-ai/dsh-deepresearch",
			descriptors: [
				{
					id: "@deepseek-ai/dsh-deepresearch#deepResearch/addEvidence",
					service: "deepResearch",
					namespace: "deepResearch",
					method: "addEvidence",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchEvidenceRequest",
							schema: _deepseek_ai_dsh_deepresearch_deepResearch_addEvidence_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchProject",
						schema: _deepseek_ai_dsh_deepresearch_deepResearch_addEvidence_result$schema
					},
					sourceLocation: {
						"file": "packages/extensions/deepresearch/src/index.ts",
						"line": 174,
						"column": 3
					}
				},
				{
					id: "@deepseek-ai/dsh-deepresearch#deepResearch/complete",
					service: "deepResearch",
					namespace: "deepResearch",
					method: "complete",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchCompleteRequest",
							schema: _deepseek_ai_dsh_deepresearch_deepResearch_complete_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchProject",
						schema: _deepseek_ai_dsh_deepresearch_deepResearch_complete_result$schema
					},
					sourceLocation: {
						"file": "packages/extensions/deepresearch/src/index.ts",
						"line": 208,
						"column": 3
					}
				},
				{
					id: "@deepseek-ai/dsh-deepresearch#deepResearch/confirmPlan",
					service: "deepResearch",
					namespace: "deepResearch",
					method: "confirmPlan",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchConfirmRequest",
							schema: _deepseek_ai_dsh_deepresearch_deepResearch_confirmPlan_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchProject",
						schema: _deepseek_ai_dsh_deepresearch_deepResearch_confirmPlan_result$schema
					},
					sourceLocation: {
						"file": "packages/extensions/deepresearch/src/index.ts",
						"line": 164,
						"column": 9
					}
				},
				{
					id: "@deepseek-ai/dsh-deepresearch#deepResearch/delete",
					service: "deepResearch",
					namespace: "deepResearch",
					method: "delete",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchDeleteRequest",
							schema: _deepseek_ai_dsh_deepresearch_deepResearch_delete_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchDeleteResult",
						schema: _deepseek_ai_dsh_deepresearch_deepResearch_delete_result$schema
					},
					sourceLocation: {
						"file": "packages/extensions/deepresearch/src/index.ts",
						"line": 254,
						"column": 3
					}
				},
				{
					id: "@deepseek-ai/dsh-deepresearch#deepResearch/fail",
					service: "deepResearch",
					namespace: "deepResearch",
					method: "fail",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchFailRequest",
							schema: _deepseek_ai_dsh_deepresearch_deepResearch_fail_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchProject",
						schema: _deepseek_ai_dsh_deepresearch_deepResearch_fail_result$schema
					},
					sourceLocation: {
						"file": "packages/extensions/deepresearch/src/index.ts",
						"line": 220,
						"column": 3
					}
				},
				{
					id: "@deepseek-ai/dsh-deepresearch#deepResearch/get",
					service: "deepResearch",
					namespace: "deepResearch",
					method: "get",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchGetRequest",
							schema: _deepseek_ai_dsh_deepresearch_deepResearch_get_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-deepresearch#deepResearch/get:result",
						schema: _deepseek_ai_dsh_deepresearch_deepResearch_get_result$schema
					},
					sourceLocation: {
						"file": "packages/extensions/deepresearch/src/index.ts",
						"line": 127,
						"column": 3
					}
				},
				{
					id: "@deepseek-ai/dsh-deepresearch#deepResearch/list",
					service: "deepResearch",
					namespace: "deepResearch",
					method: "list",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchListRequest",
							schema: _deepseek_ai_dsh_deepresearch_deepResearch_list_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchListResult",
						schema: _deepseek_ai_dsh_deepresearch_deepResearch_list_result$schema
					},
					sourceLocation: {
						"file": "packages/extensions/deepresearch/src/index.ts",
						"line": 121,
						"column": 3
					}
				},
				{
					id: "@deepseek-ai/dsh-deepresearch#deepResearch/resume",
					service: "deepResearch",
					namespace: "deepResearch",
					method: "resume",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchResumeRequest",
							schema: _deepseek_ai_dsh_deepresearch_deepResearch_resume_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchProject",
						schema: _deepseek_ai_dsh_deepresearch_deepResearch_resume_result$schema
					},
					sourceLocation: {
						"file": "packages/extensions/deepresearch/src/index.ts",
						"line": 228,
						"column": 9
					}
				},
				{
					id: "@deepseek-ai/dsh-deepresearch#deepResearch/start",
					service: "deepResearch",
					namespace: "deepResearch",
					method: "start",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchStartRequest",
							schema: _deepseek_ai_dsh_deepresearch_deepResearch_start_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchProject",
						schema: _deepseek_ai_dsh_deepresearch_deepResearch_start_result$schema
					},
					sourceLocation: {
						"file": "packages/extensions/deepresearch/src/index.ts",
						"line": 130,
						"column": 3
					}
				},
				{
					id: "@deepseek-ai/dsh-deepresearch#deepResearch/updatePlan",
					service: "deepResearch",
					namespace: "deepResearch",
					method: "updatePlan",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchPlanUpdateRequest",
							schema: _deepseek_ai_dsh_deepresearch_deepResearch_updatePlan_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchProject",
						schema: _deepseek_ai_dsh_deepresearch_deepResearch_updatePlan_result$schema
					},
					sourceLocation: {
						"file": "packages/extensions/deepresearch/src/index.ts",
						"line": 154,
						"column": 3
					}
				},
				{
					id: "@deepseek-ai/dsh-deepresearch#deepResearch/updateQuestion",
					service: "deepResearch",
					namespace: "deepResearch",
					method: "updateQuestion",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchQuestionUpdateRequest",
							schema: _deepseek_ai_dsh_deepresearch_deepResearch_updateQuestion_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchProject",
						schema: _deepseek_ai_dsh_deepresearch_deepResearch_updateQuestion_result$schema
					},
					sourceLocation: {
						"file": "packages/extensions/deepresearch/src/index.ts",
						"line": 195,
						"column": 3
					}
				},
				{
					id: "@deepseek-ai/dsh-deepresearch#deepResearch/writeReport",
					service: "deepResearch",
					namespace: "deepResearch",
					method: "writeReport",
					invocation: { kind: "direct" },
					parameters: [{
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchWriteReportRequest",
							schema: _deepseek_ai_dsh_deepresearch_deepResearch_writeReport_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "@deepseek-ai/dsh-deepresearch/types#ResearchProject",
						schema: _deepseek_ai_dsh_deepresearch_deepResearch_writeReport_result$schema
					},
					sourceLocation: {
						"file": "packages/extensions/deepresearch/src/index.ts",
						"line": 240,
						"column": 9
					}
				}
			]
		};
		//#endregion
		//#region src/client/project-hydrate.ts
		const emptyProgress = {
			running: 0,
			waiting: 0,
			scouts: []
		};
		/** Normalize one wire project after Remote parse. */
		function hydrateResearchProject(project) {
			const progress = project.progress;
			return {
				...project,
				runState: project.runState ?? ([
					"planning",
					"investigating",
					"writing"
				].includes(project.phase) ? "running" : "idle"),
				questions: (project.questions ?? []).map((question) => ({
					...question,
					dependsOn: question.dependsOn ?? [],
					gaps: question.gaps ?? [],
					handoff: question.handoff ?? "",
					criteria: (question.criteria ?? []).map((criterion) => ({
						...criterion,
						warning: criterion.warning ?? "",
						verification: criterion.verification ?? "",
						toolCount: criterion.toolCount ?? 0
					}))
				})),
				evidence: (project.evidence ?? []).map((item) => ({
					...item,
					criterionIds: item.criterionIds ?? [],
					sources: item.sources ?? [],
					status: item.status ?? "accepted"
				})),
				conclusions: project.conclusions ?? [],
				limitations: project.limitations ?? [],
				progress: {
					running: progress?.running ?? 0,
					waiting: progress?.waiting ?? 0,
					scouts: (progress?.scouts ?? emptyProgress.scouts).map((scout) => ({
						questionId: scout.questionId,
						role: scout.role ?? "waiting",
						status: scout.status ?? "waiting",
						waitingOn: scout.waitingOn ?? [],
						toolsUsed: scout.toolsUsed ?? 0,
						toolsCap: scout.toolsCap ?? 0,
						activity: scout.activity ?? "",
						tools: scout.tools ?? [],
						scoutDraft: scout.scoutDraft ?? "",
						evaluatorDraft: scout.evaluatorDraft ?? "",
						activeCriterionId: scout.activeCriterionId ?? "",
						activeCriterionText: scout.activeCriterionText ?? "",
						dependencySummary: scout.dependencySummary ?? "",
						handoff: scout.handoff ?? ""
					}))
				}
			};
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* `deepresearch` namespace dictionaries (view copy + slot tab label).
		*
		* Mirrors the locale pattern of `@deepseek-ai/dsh-client-ui-trajectory`
		* (`src/client/locales.ts`): the key set is declared once as
		* `DeepResearchKey`, both dictionaries are typed `Record<DeepResearchKey,
		* string>`, and the namespace is merged into `LocaleNamespaceMap` so
		* registering `locale: NS` puts the typed `t` seat on the component props.
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "deepresearch";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"view.deepResearch": "Deep Research Anything",
			"library.title": "研究资料库",
			"library.back": "对话",
			"library.backAria": "返回对话",
			"library.projectCount": "{count} 个研究项目",
			"library.filterAria": "研究状态筛选",
			"filter.all": "全部",
			"filter.planning": "计划中",
			"filter.investigating": "调查中",
			"filter.done": "已完成",
			"toolbar.search": "搜索研究",
			"toolbar.searchAria": "搜索研究",
			"toolbar.sortAria": "研究排序",
			"toolbar.sortRecent": "最近更新",
			"toolbar.sortTitle": "按标题",
			"toolbar.gridView": "网格视图",
			"toolbar.listView": "列表视图",
			"action.start": "发起研究",
			"action.startShort": "发起研究",
			"action.cancel": "取消",
			"action.creating": "创建中…",
			"action.createPlan": "创建研究计划",
			"action.saveChanges": "保存修改",
			"action.confirmStart": "确认并开始",
			"action.savePartial": "保存为部分完成",
			"action.complete": "完成研究",
			"empty.none": "还没有研究项目",
			"empty.noMatch": "没有匹配的研究项目",
			"empty.hintStart": "从一个值得深入的问题开始。",
			"empty.hintNoMatch": "试试其他关键词或清除搜索条件。",
			"card.openAria": "打开研究：{title}",
			"card.evidence": "{count} 条证据 · {date}",
			"composer.title": "发起深度研究",
			"composer.subtitle": "描述问题，先生成一份可审查、可修改的研究计划。",
			"composer.closeAria": "关闭",
			"composer.question": "研究问题",
			"composer.required": "必填",
			"composer.questionPlaceholder": "你想深入研究什么？",
			"composer.context": "添加研究背景",
			"composer.contextCount": " · {count}",
			"composer.contextHint": "目标、深度、限制和已有材料",
			"composer.goal": "研究目标",
			"composer.goalPlaceholder": "希望最终得到什么",
			"composer.depth": "研究深度",
			"depth.quick": "快速",
			"depth.standard": "标准",
			"depth.deep": "深入",
			"composer.sources": "定向检索源",
			"sources.web": "全网公开信源",
			"sources.academic": "学术与研究论文",
			"sources.news": "行业资讯与快讯",
			"sources.docs": "官方文档与规范",
			"composer.budgetPreset": "算力与Token预算",
			"budget.conservative": "轻量节约 (约 10 次调用)",
			"budget.balanced": "标准均衡 (约 30 次调用)",
			"budget.exhaustive": "深度研判 (约 80+ 次调用)",
			"composer.constraints": "限制与要求",
			"composer.constraintsPlaceholder": "时间、地域、来源或输出约束",
			"composer.seed": "已有材料",
			"composer.seedPlaceholder": "粘贴已有笔记或摘录（可选）",
			"composer.footer": "计划 → 调查 → 报告",
			"workspace.back": "深度研究",
			"workspace.delete": "删除",
			"delete.title": "删除研究",
			"delete.body": "「{title}」会从资料库里永久移除，包括计划和证据。",
			"delete.confirm": "删除",
			"overlay.crashTitle": "深度研究界面加载失败",
			"overlay.crashHint": "这通常是旧数据字段不完整导致的。你可以返回资料库重试，或删除该项目后重新创建。",
			"overlay.crashBack": "返回资料库",
			"stepper.plan": "1 计划",
			"stepper.investigate": "2 调查",
			"stepper.report": "3 报告",
			"plan.title": "研究计划",
			"plan.subtitle": "确认后，编排器按子问题和验收标准派出 Scout / Evaluator，再用写作包撰写报告。",
			"plan.confirmed": "已确认",
			"plan.goal": "研究目标",
			"plan.constraints": "约束",
			"plan.criteria": "子问题与验收标准",
			"plan.dependsOn": "依赖",
			"plan.dependsOnChip": "需先完成 {label}",
			"plan.dependsOnHint": "上游子问题完成后才会执行；开始时会带上前面题的简要结论，避免重复搜索。",
			"plan.failedTitle": "研究计划生成失败",
			"plan.failedHint": "后台规划 Agent 未能提交计划。查看下方错误后删除该项目并重新创建。",
			"plan.retry": "重新生成计划",
			"plan.stopped": "计划已停止",
			"plan.stoppedHint": "运行已安全停止，可以继续生成计划。",
			"metric.subQuestions": "子问题",
			"metric.evidence": "证据",
			"metric.searchBudget": "检索预算",
			"metric.fetchBudget": "抓取预算",
			"metric.running": "进行中",
			"metric.waiting": "等待依赖",
			"investigate.title": "调查看板",
			"investigate.subtitle": "Scout 检索原文，Evaluator 过审后才写入证据。此页自动刷新过程。",
			"investigate.running": "调查进行中：Scout 检索 / Evaluator 核验。",
			"investigate.readyTitle": "调查已收束",
			"investigate.readyHint": "子问题已落地。部分覆盖和未通过的标准记在限制里，报告会接着写。",
			"investigate.incompleteTitle": "调查未完成",
			"investigate.incompleteHint": "部分标准只部分覆盖或被拒绝，已记入限制。",
			"investigate.stop": "停止调查",
			"investigate.stopReason": "用户停止了调查。",
			"investigate.continue": "继续调查",
			"investigate.pausedHint": "运行已安全停止，计划、证据和检查点均已保留。",
			"investigate.writeReport": "撰写报告",
			"investigate.dependsOn": "依赖 {count} 个上游问题",
			"investigate.waitingOn": "等待上游：{list}",
			"investigate.waitingStatus": "等待依赖",
			"investigate.questions": "子问题",
			"investigate.scouts": "Scout",
			"investigate.verifying": "核验中",
			"investigate.tools": "工具",
			"investigate.handoff": "交接摘要",
			"investigate.dependencySummary": "上游线索",
			"investigate.summary": "摘要",
			"investigate.warning": "警告",
			"investigate.gaps": "缺口",
			"investigate.draft": "草稿",
			"investigate.scoutDraft": "Scout 草稿",
			"investigate.evaluatorDraft": "Evaluator 草稿",
			"investigate.queued": "排队中",
			"investigate.queuedHint": "编排器按依赖和并行上限派出 Scout，检索和核验过程会写在这张卡片上。",
			"investigate.evaluating": "Evaluator 正在核验候选人",
			"investigate.evidenceCount": "{count} 条证据",
			"investigate.coverage": "验收标准",
			"investigate.toolsUsed": "{used}/{cap} 工具",
			"investigate.capReached": "已达上限",
			"investigate.activeNow": "进行中",
			"investigate.toolSearch": "搜索",
			"investigate.toolFetch": "抓取",
			"investigate.toolRead": "读原文",
			"coverage.missing": "未覆盖",
			"coverage.partial": "部分覆盖",
			"coverage.covered": "已覆盖",
			"coverage.conflicted": "有冲突",
			"coverage.blocked": "受阻",
			"verify.pass": "通过",
			"verify.warning": "警告",
			"verify.fail": "未通过",
			"evidence.title": "来源证据",
			"evidence.sourcesTitle": "来源",
			"evidence.empty": "后台研究 Agent 正在检索来源；保存证据后会自动显示在这里。",
			"evidence.open": "打开来源",
			"confidence.high": "高",
			"confidence.medium": "中",
			"confidence.low": "低",
			"report.title": "综合报告",
			"report.subtitle": "根据已核验证据撰写综合报告，并在正文中引用来源。",
			"report.placeholder": "Markdown 研究报告…",
			"report.limitations": "限制与未解决问题",
			"report.limitationsPlaceholder": "每行一项限制",
			"report.limitationsEmpty": "目前没有部分覆盖或被拒绝的标准。",
			"limitation.partialFallback": "证据不足，该标准只部分满足。",
			"limitation.blockedFallback": "核验未通过，该标准被拒绝。",
			"limitation.conflictedFallback": "来源结论冲突，尚未形成一致判断。",
			"limitation.missingFallback": "该标准仍未覆盖。",
			"report.writing": "后台研究 Agent 正在整理证据并撰写报告…",
			"report.empty": "报告尚未生成。",
			"report.retry": "重新撰写报告",
			"report.exportMarkdown": "导出 Markdown",
			"report.exportHtml": "导出 HTML 研报",
			"report.exportMindmap": "思维导图大纲",
			"report.exportSuccess": "导出成功！已复制到剪贴板",
			"report.executiveSummary": "执行摘要 (Executive Summary)",
			"report.keyTakeaways": "核心洞见与结论 (Key Takeaways)",
			"plan.addQuestion": "添加子问题",
			"plan.removeQuestion": "删除",
			"plan.addCriterion": "添加验收标准",
			"plan.removeCriterion": "移除标准",
			"markdown.codeCopy": "复制代码",
			"markdown.codeCopied": "已复制",
			"markdown.footnotes": "脚注",
			"planTemplate.define": "界定核心问题：{question}",
			"planTemplate.defineCriteria": "明确回答范围、关键概念和判定标准",
			"planTemplate.search": "检索并筛选权威来源",
			"planTemplate.searchCriteria": "至少获得两个相互独立且可追溯的来源",
			"planTemplate.crossValidate": "交叉验证关键结论",
			"planTemplate.crossValidateCriteria": "识别一致结论、冲突信息和证据缺口",
			"planTemplate.synthesize": "综合证据并形成报告",
			"planTemplate.synthesizeCriteria": "引用来源并说明限制与不确定性",
			"phase.planning": "计划中",
			"phase.awaitingPlanConfirm": "待确认",
			"phase.investigating": "调查中",
			"phase.readyForReport": "可写报告",
			"phase.incomplete": "部分完成",
			"phase.writing": "撰写中",
			"phase.done": "已完成",
			"phase.failed": "失败",
			"phase.aborted": "已停止",
			"status.pending": "待处理",
			"status.running": "调查中",
			"status.covered": "已覆盖",
			"status.partial": "部分覆盖",
			"status.blocked": "受阻",
			"status.failed": "失败"
		};
		/** English dictionary. */
		const en = {
			"view.deepResearch": "Deep Research Anything",
			"library.title": "Research Library",
			"library.back": "Chat",
			"library.backAria": "Back to chat",
			"library.projectCount": "{count} research projects",
			"library.filterAria": "Filter by research status",
			"filter.all": "All",
			"filter.planning": "Planning",
			"filter.investigating": "Investigating",
			"filter.done": "Done",
			"toolbar.search": "Search research",
			"toolbar.searchAria": "Search research",
			"toolbar.sortAria": "Sort research",
			"toolbar.sortRecent": "Recently updated",
			"toolbar.sortTitle": "By title",
			"toolbar.gridView": "Grid view",
			"toolbar.listView": "List view",
			"action.start": "Start research",
			"action.startShort": "Start research",
			"action.cancel": "Cancel",
			"action.creating": "Creating…",
			"action.createPlan": "Create research plan",
			"action.saveChanges": "Save changes",
			"action.confirmStart": "Confirm & start",
			"action.savePartial": "Save as partially complete",
			"action.complete": "Complete research",
			"empty.none": "No research projects yet",
			"empty.noMatch": "No matching research projects",
			"empty.hintStart": "Start with a question worth digging into.",
			"empty.hintNoMatch": "Try different keywords or clear the search.",
			"card.openAria": "Open research: {title}",
			"card.evidence": "{count} evidence · {date}",
			"composer.title": "Start Deep Research",
			"composer.subtitle": "Describe the question; a reviewable, editable research plan is generated first.",
			"composer.closeAria": "Close",
			"composer.question": "Research question",
			"composer.required": "required",
			"composer.questionPlaceholder": "What would you like to research in depth?",
			"composer.context": "Add research context",
			"composer.contextCount": " · {count}",
			"composer.contextHint": "Goal, depth, constraints, and existing material",
			"composer.goal": "Research goal",
			"composer.goalPlaceholder": "What you want to end up with",
			"composer.depth": "Research depth",
			"depth.quick": "Quick (Fast overview)",
			"depth.standard": "Standard (Balanced speed & depth)",
			"depth.deep": "Exhaustive (Deep cross-verification)",
			"composer.sources": "Target Sources",
			"sources.web": "Open Web",
			"sources.academic": "Academic & Papers",
			"sources.news": "Industry News",
			"sources.docs": "Official Specs & Docs",
			"composer.budgetPreset": "Compute & Budget",
			"budget.conservative": "Conservative (~10 calls)",
			"budget.balanced": "Balanced (~30 calls)",
			"budget.exhaustive": "Exhaustive (~80+ calls)",
			"composer.constraints": "Constraints & requirements",
			"composer.constraintsPlaceholder": "Time, region, source, or output constraints",
			"composer.seed": "Existing material",
			"composer.seedPlaceholder": "Paste existing notes or excerpts (optional)",
			"composer.footer": "Plan → Investigate → Report",
			"workspace.back": "Deep Research",
			"workspace.delete": "Delete",
			"delete.title": "Delete research",
			"delete.body": "“{title}” will be removed from the library, including its plan and evidence.",
			"delete.confirm": "Delete",
			"overlay.crashTitle": "Deep Research failed to load",
			"overlay.crashHint": "This is usually caused by incomplete stored fields. Go back to the library and retry, or delete the project and start again.",
			"overlay.crashBack": "Back to library",
			"stepper.plan": "1 Plan",
			"stepper.investigate": "2 Investigate",
			"stepper.report": "3 Report",
			"plan.title": "Research plan",
			"plan.subtitle": "Once confirmed, the orchestrator runs Scout / Evaluator per criterion, then writes the report from the verified pack.",
			"plan.confirmed": "Confirmed",
			"plan.goal": "Research goal",
			"plan.constraints": "Constraints",
			"plan.criteria": "Sub-questions & acceptance criteria",
			"plan.dependsOn": "Depends on",
			"plan.dependsOnChip": "Needs {label} first",
			"plan.dependsOnHint": "Runs only after the listed upstream sub-questions finish. When it starts, it gets a short summary of their confirmed findings.",
			"plan.failedTitle": "Research plan generation failed",
			"plan.failedHint": "The background planning agent did not submit a plan. Review the error below, then delete this project and create it again.",
			"plan.retry": "Retry planning",
			"plan.stopped": "Planning stopped",
			"plan.stoppedHint": "The run stopped safely. You can retry planning.",
			"metric.subQuestions": "Sub-questions",
			"metric.evidence": "Evidence",
			"metric.searchBudget": "Search budget",
			"metric.fetchBudget": "Fetch budget",
			"metric.running": "Running",
			"metric.waiting": "Waiting on deps",
			"investigate.title": "Investigation board",
			"investigate.subtitle": "Scouts fetch sources; the Evaluator accepts evidence. This page refreshes the live process.",
			"investigate.running": "Investigation in progress: Scout search / Evaluator review.",
			"investigate.readyTitle": "Investigation settled",
			"investigate.readyHint": "Sub-questions have landed. Partial and rejected criteria are recorded as limitations; the report comes next.",
			"investigate.incompleteTitle": "Investigation incomplete",
			"investigate.incompleteHint": "Some criteria are only partial or were rejected, and are recorded as limitations.",
			"investigate.stop": "Stop investigation",
			"investigate.stopReason": "The user stopped the investigation.",
			"investigate.continue": "Continue investigation",
			"investigate.pausedHint": "The run stopped safely. Completed plans, evidence, and checkpoints were preserved.",
			"investigate.writeReport": "Write report",
			"investigate.dependsOn": "Depends on {count} upstream question(s)",
			"investigate.waitingOn": "Waiting on: {list}",
			"investigate.waitingStatus": "Waiting on deps",
			"investigate.questions": "Sub-questions",
			"investigate.scouts": "Scouts",
			"investigate.verifying": "Verifying",
			"investigate.tools": "tools",
			"investigate.handoff": "Handoff",
			"investigate.dependencySummary": "Upstream clues",
			"investigate.summary": "Summary",
			"investigate.warning": "Warning",
			"investigate.gaps": "Gaps",
			"investigate.draft": "Draft",
			"investigate.scoutDraft": "Scout draft",
			"investigate.evaluatorDraft": "Evaluator draft",
			"investigate.queued": "Queued",
			"investigate.queuedHint": "The orchestrator dispatches Scouts by dependency and parallelism. Search and review appear on this card.",
			"investigate.evaluating": "Evaluator is reviewing candidates",
			"investigate.evidenceCount": "{count} evidence",
			"investigate.coverage": "Coverage",
			"investigate.toolsUsed": "{used}/{cap} tools",
			"investigate.capReached": "cap reached",
			"investigate.activeNow": "In progress",
			"investigate.toolSearch": "Search",
			"investigate.toolFetch": "Fetch",
			"investigate.toolRead": "Read source",
			"coverage.missing": "Missing",
			"coverage.partial": "Partial",
			"coverage.covered": "Covered",
			"coverage.conflicted": "Conflicted",
			"coverage.blocked": "Blocked",
			"verify.pass": "PASS",
			"verify.warning": "WARNING",
			"verify.fail": "FAIL",
			"evidence.title": "Source evidence",
			"evidence.sourcesTitle": "Sources",
			"evidence.empty": "The background research agent is finding sources. Saved evidence appears here automatically.",
			"evidence.open": "Open source",
			"confidence.high": "High",
			"confidence.medium": "Medium",
			"confidence.low": "Low",
			"report.title": "Synthesis report",
			"report.subtitle": "Write from verified evidence and cite sources in the report.",
			"report.placeholder": "Markdown research report…",
			"report.limitations": "Limitations & open questions",
			"report.limitationsPlaceholder": "One limitation per line",
			"report.limitationsEmpty": "No partially covered or rejected criteria.",
			"limitation.partialFallback": "Evidence is incomplete, so this criterion is only partially met.",
			"limitation.blockedFallback": "Verification rejected this criterion.",
			"limitation.conflictedFallback": "Sources disagree, so this criterion is still unresolved.",
			"limitation.missingFallback": "This criterion is still uncovered.",
			"report.writing": "The background research agent is synthesizing evidence and writing the report…",
			"report.empty": "No report has been generated yet.",
			"report.retry": "Retry report writing",
			"report.exportMarkdown": "Export Markdown",
			"report.exportHtml": "Export HTML Report",
			"report.exportMindmap": "Mindmap Outline",
			"report.exportSuccess": "Exported successfully! Copied to clipboard",
			"report.executiveSummary": "Executive Summary",
			"report.keyTakeaways": "Key Takeaways & Strategic Insights",
			"plan.addQuestion": "Add Sub-Question",
			"plan.removeQuestion": "Delete",
			"plan.addCriterion": "Add Criterion",
			"plan.removeCriterion": "Remove Criterion",
			"markdown.codeCopy": "Copy code",
			"markdown.codeCopied": "Copied",
			"markdown.footnotes": "Footnotes",
			"planTemplate.define": "Define the core question: {question}",
			"planTemplate.defineCriteria": "Clarify the answer scope, key concepts, and success criteria",
			"planTemplate.search": "Search and filter authoritative sources",
			"planTemplate.searchCriteria": "Obtain at least two independent, traceable sources",
			"planTemplate.crossValidate": "Cross-validate key conclusions",
			"planTemplate.crossValidateCriteria": "Identify consistent conclusions, conflicting information, and evidence gaps",
			"planTemplate.synthesize": "Synthesize evidence and produce a report",
			"planTemplate.synthesizeCriteria": "Cite sources and state limitations and uncertainty",
			"phase.planning": "Planning",
			"phase.awaitingPlanConfirm": "Awaiting confirmation",
			"phase.investigating": "Investigating",
			"phase.readyForReport": "Report ready",
			"phase.incomplete": "Partially complete",
			"phase.writing": "Writing",
			"phase.done": "Done",
			"phase.failed": "Failed",
			"phase.aborted": "Stopped",
			"status.pending": "Pending",
			"status.running": "Investigating",
			"status.covered": "Covered",
			"status.partial": "Partially covered",
			"status.blocked": "Blocked",
			"status.failed": "Failed"
		};
		//#endregion
		//#region src/client/ui-store.ts
		const HASH_ROOT = "#deepresearch";
		/** Parse `#deepresearch` and `#deepresearch/<id>` from the current location. */
		function readDeepResearchRoute(hash = typeof window === "undefined" ? "" : window.location.hash) {
			if (hash === HASH_ROOT || hash === `${HASH_ROOT}/`) return {
				open: true,
				projectId: null
			};
			if (hash.startsWith(`${HASH_ROOT}/`)) {
				const projectId = decodeURIComponent(hash.slice(14));
				return {
					open: true,
					projectId: projectId === "" ? null : projectId
				};
			}
			return {
				open: false,
				projectId: null
			};
		}
		function hashFor(route) {
			if (!route.open) return "";
			return route.projectId === null ? HASH_ROOT : `${HASH_ROOT}/${encodeURIComponent(route.projectId)}`;
		}
		function writeHash(route, mode) {
			if (typeof window === "undefined") return;
			const next = hashFor(route);
			if (window.location.hash === next) return;
			const url = `${window.location.pathname}${window.location.search}${next}`;
			if (mode === "push") window.history.pushState(null, "", url);
			else window.history.replaceState(null, "", url);
		}
		/** Prefer the project id encoded in the current hash when the overlay is being opened. */
		function projectIdFromHashOrCurrent(current) {
			const routed = readDeepResearchRoute();
			return routed.open ? routed.projectId : current;
		}
		/** Create one overlay store shared by the sidebar entry and shell overlay. */
		function createDeepResearchUiStore() {
			const initial = readDeepResearchRoute();
			let open = initial.open;
			let projectId = initial.projectId;
			const listeners = /* @__PURE__ */ new Set();
			let writing = false;
			const emit = () => {
				for (const listener of listeners) listener();
			};
			const applyRoute = (next, mode) => {
				const changed = open !== next.open || projectId !== next.projectId;
				open = next.open;
				projectId = next.open ? next.projectId : null;
				if (mode !== "silent") {
					writing = true;
					writeHash({
						open,
						projectId
					}, mode);
					writing = false;
				}
				if (changed) emit();
			};
			if (typeof window !== "undefined") {
				const syncFromLocation = () => {
					if (writing) return;
					applyRoute(readDeepResearchRoute(), "silent");
				};
				window.addEventListener("popstate", syncFromLocation);
				window.addEventListener("hashchange", syncFromLocation);
			}
			return {
				getOpen: () => open,
				getProjectId: () => projectId,
				setOpen: (next) => {
					if (!next) {
						if (!open) return;
						applyRoute({
							open: false,
							projectId: null
						}, "push");
						return;
					}
					const nextProjectId = projectIdFromHashOrCurrent(projectId);
					if (open && nextProjectId === projectId) return;
					applyRoute({
						open: true,
						projectId: nextProjectId
					}, open ? "replace" : "push");
				},
				setProjectId: (id) => {
					if (open && id === projectId) return;
					applyRoute({
						open: true,
						projectId: id
					}, "push");
				},
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				}
			};
		}
		//#endregion
		//#region \0dsh-css:src/client/sidebar-entry.module.css.mjs
		const css$2 = ".-i2Iuq_layer{flex:none;align-items:center;width:100%;height:42px;margin:8px 0 0;display:flex;position:relative}.-i2Iuq_badge{width:calc(100% + 4px);height:42px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:none;border-radius:8px;align-items:center;gap:8px;margin:0 -2px;padding:0 10px 0 8px;font-family:inherit;font-size:14px;transition:background-color .18s,color .18s;display:inline-flex;overflow:hidden}.-i2Iuq_badge:hover,.-i2Iuq_badge[data-active]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.-i2Iuq_badge:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.-i2Iuq_badgeLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.-i2Iuq_layer.-i2Iuq_rail{width:36px;height:36px;margin:0}.-i2Iuq_rail .-i2Iuq_badge{border-radius:8px;justify-content:center;gap:0;width:36px;height:36px;padding:0}@media (prefers-reduced-motion:reduce){.-i2Iuq_badge{transition:none}}";
		const tagId$2 = "@deepseek-ai/dsh-deepresearch/sidebar-entry.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-deepresearch";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/DeepResearchSidebarEntry.tsx
		/** Sidebar foot control that opens the global Deep Research workspace. */
		//#endregion
		//#region src/client/research-view-model.ts
		/** Render a dependency reference as `01 · question text`, clipped to `max` characters. */
		function formatDepLabel(index, text, max = 42) {
			const number = ordinal(index);
			const clipped = clipLabel(text, max);
			return clipped === "" ? number : `${number} · ${clipped}`;
		}
		function clipLabel(text, max) {
			const characters = Array.from(text.trim());
			if (characters.length === 0) return "";
			return characters.length > max ? `${characters.slice(0, max - 1).join("")}…` : characters.join("");
		}
		function readableDraft(text) {
			const value = text.trim();
			if (value === "") return "";
			if (/^(Search|Fetch|Read artifact|Evaluator read)\b/i.test(value)) return "";
			if (value.startsWith("{") || value.startsWith("[")) return "";
			return value;
		}
		function toolLabel(name, t) {
			if (name === "research_web_search") return t("investigate.toolSearch");
			if (name === "research_web_fetch") return t("investigate.toolFetch");
			if (name === "read_artifact") return t("investigate.toolRead");
			return name;
		}
		function isSettledQuestion(status) {
			return status === "covered" || status === "partial" || status === "blocked";
		}
		function limitationFallback(status, t) {
			if (status === "partial") return t("limitation.partialFallback");
			if (status === "blocked") return t("limitation.blockedFallback");
			if (status === "conflicted") return t("limitation.conflictedFallback");
			return t("limitation.missingFallback");
		}
		function boardLimitations(project, t, live) {
			const rows = [];
			for (const [index, question] of project.questions.entries()) for (const criterion of question.criteria) {
				if (criterion.status === "covered") continue;
				const note = [criterion.gap, criterion.warning].map((item) => item.trim()).filter(Boolean).join(" ");
				if (criterion.status === "missing" && live && note === "") continue;
				const text = note || limitationFallback(criterion.status, t);
				rows.push({
					key: `${question.id}:${criterion.id}`,
					status: criterion.status,
					ref: `${formatDepLabel(index, question.text, 36)} · ${clipLabel(criterion.text, 28)}`,
					text
				});
			}
			for (const [index, item] of project.limitations.entries()) {
				const text = item.trim();
				if (!text || rows.some((row) => row.text === text || text.endsWith(row.text))) continue;
				rows.push({
					key: `note:${index}:${text}`,
					status: "",
					ref: "",
					text
				});
			}
			return rows;
		}
		function boardScouts(project) {
			const live = new Map((project.progress?.scouts ?? []).map((scout) => [scout.questionId, scout]));
			return project.questions.map((question) => {
				const existing = live.get(question.id);
				if (existing !== void 0) return existing;
				return {
					questionId: question.id,
					role: question.status === "running" ? "scout" : "waiting",
					status: question.status === "running" ? "running" : question.status === "covered" ? "done" : question.status === "partial" ? "partial" : question.status === "blocked" || question.status === "failed" ? "blocked" : "waiting",
					waitingOn: question.dependsOn ?? [],
					toolsUsed: 0,
					toolsCap: 10,
					activity: "",
					tools: [],
					scoutDraft: "",
					evaluatorDraft: "",
					activeCriterionId: "",
					activeCriterionText: "",
					dependencySummary: "",
					handoff: question.handoff ?? ""
				};
			});
		}
		/** Remove one question without changing the targets of surviving index-based dependencies. */
		function removePlanQuestion(questions, removedIndex) {
			return questions.filter((_, index) => index !== removedIndex).map((question) => ({
				...question,
				dependsOn: question.dependsOn?.filter((index) => index !== removedIndex).map((index) => index > removedIndex ? index - 1 : index)
			}));
		}
		function ordinal(index) {
			return String(index + 1).padStart(2, "0");
		}
		function resolveIndexes(ids, indexOf) {
			return ids.flatMap((id) => {
				const at = indexOf.get(id);
				return at === void 0 ? [] : [at];
			});
		}
		function editablePlan(project) {
			return project.questions.map((question) => ({
				text: question.text,
				criteria: question.criteria.map((item) => item.text),
				dependsOn: question.dependsOn.map((id) => project.questions.findIndex((candidate) => candidate.id === id)).filter((index) => index >= 0)
			}));
		}
		function stepFor(project) {
			return ["planning", "awaiting_plan_confirm"].includes(project.phase) || ["failed", "aborted"].includes(project.phase) && !project.planConfirmed ? "plan" : ["writing", "done"].includes(project.phase) ? "report" : "investigate";
		}
		function reachableStep(project, step) {
			if (project.planConfirmed && [
				"done",
				"incomplete",
				"failed",
				"aborted",
				"writing",
				"ready_for_report"
			].includes(project.phase)) return true;
			const order = [
				"plan",
				"investigate",
				"report"
			];
			const unlocked = project.phase === "ready_for_report" ? "investigate" : stepFor(project);
			return order.indexOf(step) <= order.indexOf(unlocked);
		}
		function depthLabel(depth, t) {
			return t({
				quick: "depth.quick",
				standard: "depth.standard",
				deep: "depth.deep"
			}[depth]);
		}
		function phaseLabel(project, t) {
			if (project.runState === "paused") return t("phase.aborted");
			return t({
				planning: "phase.planning",
				awaiting_plan_confirm: "phase.awaitingPlanConfirm",
				investigating: "phase.investigating",
				ready_for_report: "phase.readyForReport",
				incomplete: "phase.incomplete",
				writing: "phase.writing",
				done: "phase.done",
				failed: "phase.failed",
				aborted: "phase.aborted"
			}[project.phase]);
		}
		function statusLabel(status, t) {
			return t({
				pending: "status.pending",
				running: "status.running",
				covered: "status.covered",
				partial: "status.partial",
				blocked: "status.blocked",
				failed: "status.failed"
			}[status]);
		}
		function scoutStatusLabel(scout, t) {
			if (scout.status === "waiting" && scout.waitingOn.length === 0) return t("investigate.queued");
			return t({
				waiting: "investigate.waitingStatus",
				running: "status.running",
				verifying: "investigate.verifying",
				done: "status.covered",
				partial: "status.partial",
				blocked: "status.blocked"
			}[scout.status]);
		}
		function coverageLabel(status, t) {
			return t(`coverage.${status}`);
		}
		function confidenceLabel(value, t) {
			return t(value === "high" ? "confidence.high" : value === "low" ? "confidence.low" : "confidence.medium");
		}
		function primaryEvidenceUrl(evidence) {
			const seen = /* @__PURE__ */ new Set();
			for (const source of evidence.sources ?? []) {
				const url = source.url.trim();
				if (url === "" || seen.has(url)) continue;
				seen.add(url);
				return url;
			}
			return evidence.url?.trim() ?? "";
		}
		function sourceHostname(url) {
			try {
				return new URL(url).hostname.replace(/^www\./, "");
			} catch {
				return url.replace(/^https?:\/\//, "").split("/")[0] ?? "";
			}
		}
		function verificationLabel(value, t) {
			return value === "PASS" ? t("verify.pass") : value === "WARNING" ? t("verify.warning") : value === "FAIL" ? t("verify.fail") : "";
		}
		function splitEmoji(value) {
			const first = Array.from(value.trim())[0] ?? "";
			return /\p{Extended_Pictographic}/u.test(first) ? [first, value.trim().slice(first.length).trim() || value] : ["", value];
		}
		function formatDate(value) {
			return new Intl.DateTimeFormat(void 0, {
				month: "short",
				day: "numeric"
			}).format(value);
		}
		function messageOf(value) {
			return value instanceof Error ? value.message : String(value);
		}
		/** Escape text for both the HTML title and report body, never markup. */
		function escapeHtml(text) {
			return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
		}
		/** HTML exports render literal text; Markdown and mindmap retain their source formats. */
		function reportExportContent(project, accepted, format) {
			if (!project.report) return "";
			let content = "";
			if (format === "md") content = `# ${project.title}\n\n${project.report}\n\n## 引用来源与证据链\n` + accepted.map((a) => `- [${a.confidence.toUpperCase()}] ${a.claim} (${primaryEvidenceUrl(a)})`).join("\n");
			else if (format === "html") {
				const title = escapeHtml(project.title);
				content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:860px;margin:40px auto;line-height:1.7;padding:0 20px;}blockquote{border-left:4px solid currentColor;margin:0;padding-left:16px;}code{padding:2px 6px;border-radius:4px;}</style></head><body><h1>${title}</h1><div>${escapeHtml(project.report).replace(/\n/g, "<br/>")}</div></body></html>`;
			} else if (format === "mindmap") content = `# ${project.title}\n## 核心目标\n- ${project.goal || project.question}\n## 调研子课题\n` + project.questions.map((q) => `- ${q.text}`).join("\n");
			return content;
		}
		//#endregion
		//#region \0dsh-css:src/client/views.module.css.mjs
		const css$1 = ".b2QN0a_shell{box-sizing:border-box;height:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);flex:1;overflow:auto}.b2QN0a_shell,.b2QN0a_modalBackdrop,.b2QN0a_confirmBackdrop{--deepresearch-control-height:36px;--deepresearch-control-radius:8px;--deepresearch-panel-radius:10px;--dsh-deepresearch-modal-layer:calc(2147480000 + 1000);--dsh-deepresearch-confirm-layer:calc(2147480000 + 1100)}.b2QN0a_content,.b2QN0a_workspace{width:min(1540px,100%);margin-inline:auto}.b2QN0a_libraryTopBar{justify-content:flex-start;margin-bottom:8px;display:flex}.b2QN0a_content{box-sizing:border-box;padding:24px clamp(18px,3vw,40px) 48px}.b2QN0a_toolbar,.b2QN0a_toolbarActions,.b2QN0a_filters,.b2QN0a_viewToggle,.b2QN0a_libraryTitle,.b2QN0a_workspaceHeader,.b2QN0a_modalHeader,.b2QN0a_modalHeading,.b2QN0a_modalFooter,.b2QN0a_modalFooter>div,.b2QN0a_sectionHeader,.b2QN0a_headerActions{align-items:center;display:flex}.b2QN0a_toolbar{justify-content:space-between;gap:20px}.b2QN0a_filters,.b2QN0a_toolbarActions,.b2QN0a_viewToggle,.b2QN0a_headerActions,.b2QN0a_modalFooter>div{gap:7px}.b2QN0a_filters{min-width:0;overflow-x:auto}.b2QN0a_primaryButton,.b2QN0a_secondaryButton,.b2QN0a_iconButton,.b2QN0a_modalCloseButton,.b2QN0a_modalCancelButton,.b2QN0a_modalSubmitButton,.b2QN0a_backButton,.b2QN0a_deleteButton,.b2QN0a_deleteText,.b2QN0a_stopButton,.b2QN0a_chip,.b2QN0a_activeChip,.b2QN0a_createCard,.b2QN0a_contextCard>button,.b2QN0a_stepper button{color:inherit;font:inherit;cursor:pointer;border:0}.b2QN0a_primaryButton{min-height:var(--deepresearch-control-height);border-radius:var(--deepresearch-control-radius);background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);align-items:center;gap:6px;padding:0 14px;font-size:12px;font-weight:600;transition:opacity .18s,background-color .18s,transform .18s;display:inline-flex}.b2QN0a_backButton,.b2QN0a_confirmed,.b2QN0a_evidenceCard a{align-items:center;gap:6px;display:inline-flex}.b2QN0a_primaryButton:hover{opacity:.86}.b2QN0a_primaryButton:active{transform:scale(.98)}.b2QN0a_backButton:hover,.b2QN0a_secondaryButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.b2QN0a_primaryButton:disabled,.b2QN0a_secondaryButton:disabled,.b2QN0a_iconButton:disabled,.b2QN0a_modalCloseButton:disabled,.b2QN0a_modalCancelButton:disabled,.b2QN0a_modalSubmitButton:disabled,.b2QN0a_stopButton:disabled{cursor:default;opacity:.4;pointer-events:none}.b2QN0a_secondaryButton,.b2QN0a_backButton{min-height:var(--deepresearch-control-height);border-radius:var(--deepresearch-control-radius);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);padding:0 13px;font-size:12px;transition:background-color .18s,color .18s}.b2QN0a_chip,.b2QN0a_activeChip{min-height:var(--deepresearch-control-height);color:var(--dsw-alias-label-tertiary);background:0 0;border:1px solid #0000;border-radius:6px;flex:none;padding:0 12px;font-size:12px;transition:background-color .18s,border-color .18s,color .18s}.b2QN0a_chip:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.b2QN0a_activeChip{border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 36%, var(--dsw-alias-border-l1));background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-label-primary)}.b2QN0a_search,.b2QN0a_select,.b2QN0a_input,.b2QN0a_questionInput,.b2QN0a_textareaSmall,.b2QN0a_planEditorLarge,.b2QN0a_reportEditor,.b2QN0a_limitationsEditor,.b2QN0a_planPane textarea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;outline:none;transition:border-color .18s,background-color .18s,box-shadow .18s}.b2QN0a_search,.b2QN0a_select{height:var(--deepresearch-control-height);border-radius:var(--deepresearch-control-radius)}.b2QN0a_search{width:min(230px,25vw);padding:0 14px}.b2QN0a_select{color:var(--dsw-alias-label-secondary);padding:0 13px}.b2QN0a_viewToggle{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--deepresearch-control-radius);background:var(--dsw-alias-bg-layer-1);gap:0;overflow:hidden}.b2QN0a_iconButton{width:32px;height:32px;color:var(--dsw-alias-label-tertiary);background:0 0;border-radius:6px;place-items:center;padding:0;transition:background-color .18s,color .18s,transform .18s;display:inline-grid}.b2QN0a_viewToggle .b2QN0a_iconButton{border-radius:0;width:38px;height:38px}.b2QN0a_viewToggle .b2QN0a_iconButton+.b2QN0a_iconButton{border-left:1px solid var(--dsw-alias-border-l1)}.b2QN0a_iconButton:hover,.b2QN0a_iconButton[data-active=true]{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-state-business-primary)}.b2QN0a_search:focus-visible,.b2QN0a_select:focus-visible,.b2QN0a_input:focus-visible,.b2QN0a_questionInput:focus-visible,.b2QN0a_textareaSmall:focus-visible,.b2QN0a_planEditorLarge:focus-visible,.b2QN0a_reportEditor:focus-visible,.b2QN0a_limitationsEditor:focus-visible,.b2QN0a_planPane textarea:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent);outline:none}:where(button,input,select,textarea,a):focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.b2QN0a_library{margin-top:34px}.b2QN0a_libraryTitle{justify-content:space-between}.b2QN0a_libraryTitle h2{letter-spacing:-.025em;margin:0;font-size:24px;font-weight:600}.b2QN0a_libraryTitle p{color:var(--dsw-alias-label-caption);margin:6px 0 0;font-size:12px}.b2QN0a_projectGrid{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-top:22px;display:grid}.b2QN0a_projectList{flex-direction:column;gap:10px;margin-top:22px;display:flex}.b2QN0a_createCard{border:1px dashed var(--dsw-alias-border-l1);border-radius:var(--deepresearch-panel-radius);min-height:208px;color:var(--dsw-alias-label-secondary);background:0 0;flex-direction:column;justify-content:center;align-items:center;transition:background-color .18s,border-color .18s,color .18s;display:flex}.b2QN0a_createCard:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.b2QN0a_createCard span{background:var(--dsw-alias-state-business-tertiary);width:40px;height:40px;color:var(--dsw-alias-state-business-primary);border-radius:8px;place-items:center;margin-bottom:12px;font-size:20px;display:grid}.b2QN0a_createCard strong{font-size:14px}.b2QN0a_projectCard{isolation:isolate;box-sizing:border-box;border:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 24%, var(--dsw-alias-border-l1));border-radius:var(--deepresearch-panel-radius);background:var(--dsw-alias-bg-layer-1);flex-direction:column;min-height:208px;padding:18px;transition:background-color .18s,border-color .18s;display:flex;position:relative;overflow:hidden}.b2QN0a_projectCard:hover{border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 52%, var(--dsw-alias-border-l2));background:var(--dsw-alias-bg-layer-2)}.b2QN0a_projectCard[data-list]{flex-direction:row;align-items:center;gap:14px;min-height:86px}.b2QN0a_cardOpen{z-index:0;cursor:pointer;background:0 0;border:0;position:absolute;inset:0}.b2QN0a_cardEmoji{z-index:1;background:var(--dsw-alias-state-business-tertiary);width:40px;height:40px;color:var(--dsw-alias-state-business-primary);pointer-events:none;border-radius:8px;flex:none;place-items:center;font-size:24px;display:grid}.b2QN0a_cardInfo{z-index:1;pointer-events:none;min-width:0;margin-top:auto}.b2QN0a_projectCard[data-list] .b2QN0a_cardInfo{flex:1;margin-top:0}.b2QN0a_cardInfo h3{letter-spacing:-.02em;text-overflow:ellipsis;white-space:nowrap;margin:12px 0 6px;font-size:16px;font-weight:600;overflow:hidden}.b2QN0a_projectCard[data-list] .b2QN0a_cardInfo h3{margin-top:0}.b2QN0a_cardInfo p{color:var(--dsw-alias-label-tertiary);-webkit-line-clamp:2;-webkit-box-orient:vertical;margin:0;font-size:12px;line-height:1.5;display:-webkit-box;overflow:hidden}.b2QN0a_cardInfo>div{color:var(--dsw-alias-label-caption);align-items:center;gap:7px;margin-top:12px;font-size:10px;display:flex}.b2QN0a_phase,.b2QN0a_confirmed{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);width:fit-content;color:var(--dsw-alias-label-tertiary);border-radius:5px;align-items:center;padding:0 7px;font-size:10px;line-height:20px;display:inline-flex}.b2QN0a_confirmed{color:var(--dsw-alias-state-success-primary)}.b2QN0a_phase[data-phase=done],.b2QN0a_phase[data-phase=ready_for_report]{border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 34%, var(--dsw-alias-border-l1));color:var(--dsw-alias-state-success-primary)}.b2QN0a_phase[data-phase=failed]{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 34%, var(--dsw-alias-border-l1));color:var(--dsw-alias-state-error-primary)}.b2QN0a_phase[data-phase=aborted],.b2QN0a_phase[data-phase=incomplete]{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 34%, var(--dsw-alias-border-l1));color:var(--dsw-alias-state-warn-primary)}.b2QN0a_deleteButton{z-index:2;width:28px;height:28px;color:var(--dsw-alias-label-caption);background:0 0;border-radius:6px;transition:background-color .18s,color .18s;position:absolute;top:10px;right:10px}.b2QN0a_deleteButton:hover,.b2QN0a_deleteText:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);color:var(--dsw-alias-state-error-primary)}.b2QN0a_emptyState{border:1px dashed var(--dsw-alias-border-l1);border-radius:var(--deepresearch-panel-radius);background:var(--dsw-alias-bg-layer-1);text-align:center;flex-direction:column;justify-content:center;align-items:center;min-height:260px;margin-top:22px;padding:28px;display:flex}.b2QN0a_emptyState>span{background:var(--dsw-alias-bg-layer-2);width:40px;height:40px;color:var(--dsw-alias-label-caption);border-radius:8px;place-items:center;font-size:20px;display:grid}.b2QN0a_emptyState strong{margin-top:14px;font-size:13px}.b2QN0a_emptyState p{color:var(--dsw-alias-label-caption);margin:6px 0 16px;font-size:12px}.b2QN0a_emptyText{color:var(--dsw-alias-label-caption);text-align:center;font-size:12px}.b2QN0a_error,.b2QN0a_modalError{border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 24%, var(--dsw-alias-border-l1));background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-error-primary);border-radius:8px;padding:10px 12px;font-size:12px}.b2QN0a_error{margin-top:16px}.b2QN0a_modalBackdrop{z-index:var(--dsh-deepresearch-modal-layer);box-sizing:border-box;background:var(--dsw-alias-bg-overlay);place-items:center;padding:8px;animation:.18s ease-out both b2QN0a_modal-backdrop-in;display:grid;position:fixed;inset:0}.b2QN0a_modal{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:min(660px,100vw - 16px);max-height:min(760px,100dvh - 16px);box-shadow:var(--dsw-alias-shadow-md);transform-origin:50%;border-radius:12px;flex-direction:column;animation:.18s cubic-bezier(.2,.8,.2,1) both b2QN0a_modal-content-in;display:flex;overflow:hidden}.b2QN0a_modalHeader{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;justify-content:space-between;padding:16px 20px}.b2QN0a_modalHeading{gap:12px;min-width:0}.b2QN0a_modalHeading>span{background:var(--dsw-alias-state-business-tertiary);width:32px;height:32px;color:var(--dsw-alias-state-business-primary);border-radius:8px;flex:none;place-items:center;display:grid}.b2QN0a_modalHeading h3{letter-spacing:-.012em;margin:0;font-size:17px;font-weight:600;line-height:24px}.b2QN0a_modalHeading p{color:var(--dsw-alias-label-caption);margin:2px 0 0;font-size:12px;line-height:20px}.b2QN0a_modalCloseButton{width:32px;height:32px;color:var(--dsw-alias-label-tertiary);background:0 0;border-radius:6px;flex:none;place-items:center;padding:0;transition:background-color .18s,color .18s,transform .18s;display:inline-grid}.b2QN0a_modalCloseButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.b2QN0a_modalCloseButton:active{transform:scale(.95)}.b2QN0a_modalBody{min-height:0;padding:20px;overflow-y:auto}.b2QN0a_fieldLabel{color:var(--dsw-alias-label-secondary);flex-direction:column;gap:8px;font-size:11px;display:flex}.b2QN0a_fieldLabel>span{letter-spacing:.08em;text-transform:uppercase;justify-content:space-between;font-weight:650;display:flex}.b2QN0a_fieldLabel b{color:var(--dsw-alias-label-caption);letter-spacing:normal;text-transform:none;font-weight:400}.b2QN0a_questionInput,.b2QN0a_textareaSmall,.b2QN0a_planEditorLarge,.b2QN0a_reportEditor,.b2QN0a_limitationsEditor,.b2QN0a_planPane textarea{resize:vertical;border-radius:12px;width:100%;padding:11px 13px;line-height:1.55}.b2QN0a_questionInput{resize:none;border-radius:8px;min-height:124px;padding:13px 15px;font-size:15px;line-height:24px}.b2QN0a_input{width:100%;height:var(--deepresearch-control-height);border-radius:8px;padding:0 11px}.b2QN0a_textareaSmall{min-height:82px}.b2QN0a_contextCard{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--deepresearch-panel-radius);background:var(--dsw-alias-bg-layer-2);margin-top:16px;overflow:hidden}.b2QN0a_contextCard>button{text-align:left;background:0 0;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:11px;width:100%;padding:12px 14px;display:grid}.b2QN0a_contextCard>button:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}.b2QN0a_contextCard>button>span:first-child{background:var(--dsw-alias-bg-layer-1);width:28px;height:28px;color:var(--dsw-alias-label-tertiary);border-radius:6px;place-items:center;display:grid}.b2QN0a_contextCard>button>span:nth-child(2){flex-direction:column;gap:3px;min-width:0;display:flex}.b2QN0a_contextCard strong{font-size:12px}.b2QN0a_contextCard small{color:var(--dsw-alias-label-caption);font-size:10px}.b2QN0a_contextFields{border-top:1px solid var(--dsw-alias-border-l1);grid-template-columns:1fr 1fr;gap:14px;padding:14px;display:grid}.b2QN0a_contextFields label{color:var(--dsw-alias-label-secondary);flex-direction:column;gap:6px;font-size:11px;display:flex}.b2QN0a_modalError{margin-top:14px}.b2QN0a_modalFooter{border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-caption);flex:none;justify-content:space-between;gap:14px;padding:12px 20px;font-size:10px}.b2QN0a_modalCancelButton,.b2QN0a_modalSubmitButton{height:var(--deepresearch-control-height);border-radius:var(--deepresearch-control-radius);justify-content:center;align-items:center;gap:8px;padding:0 16px;font-size:12px;transition:background-color .18s,color .18s,opacity .18s,transform .18s;display:inline-flex}.b2QN0a_modalCancelButton{color:var(--dsw-alias-label-secondary);background:0 0;font-weight:500}.b2QN0a_modalCancelButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}.b2QN0a_modalSubmitButton{background:var(--dsw-alias-label-primary);min-width:112px;color:var(--dsw-alias-bg-base);font-weight:650}.b2QN0a_modalSubmitButton:hover{opacity:.9}.b2QN0a_modalSubmitButton:active{transform:scale(.98)}.b2QN0a_modalDangerButton{background:var(--dsw-alias-state-error-primary);min-width:112px;color:var(--dsw-alias-bg-base);font-weight:650}.b2QN0a_modalDangerButton:hover{opacity:.9}.b2QN0a_modalDangerButton:active{transform:scale(.98)}.b2QN0a_projectLoading{min-height:220px;color:var(--dsw-alias-label-caption);justify-content:center;align-items:center;gap:10px;font-size:12px;display:flex}.b2QN0a_confirmBackdrop{z-index:var(--dsh-deepresearch-confirm-layer);background:var(--dsw-alias-bg-overlay);place-items:center;padding:24px;animation:.18s ease-out both b2QN0a_modal-backdrop-in;display:grid;position:fixed;inset:0}.b2QN0a_confirmCard{border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 18%, var(--dsw-alias-border-l1));background:var(--dsw-alias-bg-layer-1);width:min(380px,100vw - 32px);box-shadow:var(--dsw-alias-shadow-md);border-radius:10px;gap:10px;padding:22px 22px 18px;animation:.18s cubic-bezier(.2,.8,.2,1) both b2QN0a_modal-content-in;display:grid;position:relative;overflow:hidden}.b2QN0a_confirmCard:before{background:var(--dsw-alias-state-error-primary);content:\"\";width:3px;position:absolute;inset:0 auto 0 0}.b2QN0a_confirmMark{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, var(--dsw-alias-bg-layer-2));width:36px;height:36px;color:var(--dsw-alias-state-error-primary);border-radius:8px;place-items:center;display:grid}.b2QN0a_confirmMark:after{content:\"!\";font-size:16px;font-weight:700;line-height:1}.b2QN0a_confirmCard h3{letter-spacing:-.02em;margin:2px 0 0;font-size:16px;font-weight:620}.b2QN0a_confirmCard p{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;line-height:1.55}.b2QN0a_confirmActions{justify-content:flex-end;gap:8px;margin-top:8px;display:flex}.b2QN0a_confirmCancel,.b2QN0a_confirmDelete{border-radius:8px;justify-content:center;align-items:center;gap:6px;height:34px;padding:0 14px;font-size:12px;font-weight:600;transition:background-color .18s,color .18s,opacity .18s,transform .18s;display:inline-flex}.b2QN0a_confirmCancel{color:var(--dsw-alias-label-secondary);background:0 0}.b2QN0a_confirmCancel:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}.b2QN0a_confirmDelete{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-bg-base)}.b2QN0a_confirmDelete:hover{opacity:.9}.b2QN0a_confirmDelete:active{transform:scale(.98)}.b2QN0a_confirmCancel:disabled,.b2QN0a_confirmDelete:disabled{opacity:.55}@keyframes b2QN0a_modal-backdrop-in{0%{opacity:0}to{opacity:1}}@keyframes b2QN0a_modal-content-in{0%{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}.b2QN0a_workspace{box-sizing:border-box;background:var(--dsw-alias-bg-base);flex-direction:column;width:100%;height:100%;min-height:0;display:flex;overflow:hidden}.b2QN0a_workspaceHeader{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;justify-content:space-between;align-items:center;gap:18px;padding:14px 24px}.b2QN0a_projectHeading{text-align:center;flex:1;min-width:0}.b2QN0a_workspaceHeader h2{letter-spacing:-.02em;text-overflow:ellipsis;white-space:nowrap;margin:3px 0 0;font-size:17px;font-weight:620;overflow:hidden}.b2QN0a_workspaceHeader p,.b2QN0a_sectionHeader p{color:var(--dsw-alias-label-caption);margin:5px 0 0;font-size:11px}.b2QN0a_eyebrow{color:var(--dsw-alias-state-business-primary);letter-spacing:.12em;margin:0;font-size:10px;font-weight:700}.b2QN0a_backButton{background:0 0}.b2QN0a_deleteText,.b2QN0a_stopButton{color:var(--dsw-alias-state-error-primary);background:0 0;border-radius:6px;padding:8px 10px;transition:background-color .18s,color .18s}.b2QN0a_deleteText:hover,.b2QN0a_stopButton:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent)}.b2QN0a_progressBar{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;padding:10px 24px}.b2QN0a_stepper{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:8px;gap:4px;max-width:100%;padding:4px;display:inline-flex;overflow-x:auto}.b2QN0a_stepper button{color:var(--dsw-alias-label-caption);background:0 0;border-radius:6px;padding:7px 12px;font-size:11px;transition:background-color .18s,color .18s}.b2QN0a_stepper button[data-active=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l1)}.b2QN0a_stepper button:disabled{cursor:default;opacity:.48}.b2QN0a_detailBody{overscroll-behavior:contain;min-height:0;padding:24px clamp(18px,3vw,32px) 32px;overflow:hidden auto}.b2QN0a_planPane,.b2QN0a_reportPane{gap:18px;max-width:1120px;margin:0 auto;display:grid}.b2QN0a_planningState{border:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 24%, var(--dsw-alias-border-l1));border-radius:var(--deepresearch-panel-radius);background:var(--dsw-alias-bg-layer-1);align-items:flex-start;gap:16px;min-height:180px;padding:28px 20px;display:flex}.b2QN0a_planningIcon{background:var(--dsw-alias-state-business-tertiary);width:40px;height:40px;color:var(--dsw-alias-state-business-primary);border-radius:8px;flex:none;place-items:center;display:grid}.b2QN0a_planningState h3{margin:1px 0 6px;font-size:14px}.b2QN0a_planningState p{color:var(--dsw-alias-label-caption);margin:0;font-size:11px;line-height:1.65}.b2QN0a_planFailure{border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 24%, var(--dsw-alias-border-l1));border-radius:var(--deepresearch-panel-radius);background:var(--dsw-alias-bg-layer-1);gap:8px;padding:20px;display:grid}.b2QN0a_planFailure h3,.b2QN0a_planFailure p{margin:0}.b2QN0a_planFailure h3{color:var(--dsw-alias-state-error-primary);font-size:14px}.b2QN0a_planFailure p{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}.b2QN0a_planFailure code{overflow-wrap:anywhere;color:var(--dsw-alias-label-caption);font:11px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}.b2QN0a_spinner{flex:none;animation:.8s linear infinite b2QN0a_research-spin}.b2QN0a_runningBanner{color:var(--dsw-alias-label-secondary);align-items:center;gap:9px;font-size:11px;display:flex}.b2QN0a_pausedBanner,.b2QN0a_readyBanner,.b2QN0a_incompleteBanner{border-bottom:1px solid var(--dsw-alias-border-l1);align-items:flex-start;gap:10px;padding-bottom:18px;display:flex}.b2QN0a_bannerActions{flex-wrap:wrap;gap:8px;margin-left:auto;display:flex}.b2QN0a_pausedBanner>:first-child{color:var(--dsw-alias-state-warn-primary);margin-top:1px}.b2QN0a_pausedBanner strong{font-size:12px;font-weight:620;display:block}.b2QN0a_pausedBanner p{color:var(--dsw-alias-label-caption);margin:3px 0 0;font-size:10px;line-height:1.55}.b2QN0a_planningState .b2QN0a_primaryButton{margin-top:14px}.b2QN0a_readyBanner>:first-child{color:var(--dsw-alias-label-secondary);margin-top:1px}.b2QN0a_incompleteBanner>:first-child{color:var(--dsw-alias-state-error-primary);margin-top:1px}.b2QN0a_runningBanner .b2QN0a_stopButton{margin-left:auto}.b2QN0a_readyBanner,.b2QN0a_incompleteBanner{color:var(--dsw-alias-label-secondary);align-items:flex-start;gap:10px;padding-bottom:4px;display:flex}.b2QN0a_readyBanner strong,.b2QN0a_incompleteBanner strong{font-size:12px;font-weight:620;display:block}.b2QN0a_readyBanner p,.b2QN0a_incompleteBanner p{color:var(--dsw-alias-label-caption);margin:3px 0 0;font-size:10px;line-height:1.55}.b2QN0a_readyBanner svg{color:var(--dsw-alias-label-secondary);flex:none;margin-top:1px}.b2QN0a_incompleteBanner svg{color:var(--dsw-alias-state-warn-primary);flex:none;margin-top:1px}@keyframes b2QN0a_research-spin{to{transform:rotate(360deg)}}.b2QN0a_sectionHeader{justify-content:space-between;gap:16px}.b2QN0a_sectionHeader h3{margin:0;font-size:15px}.b2QN0a_headerActions .b2QN0a_primaryButton,.b2QN0a_headerActions .b2QN0a_secondaryButton{border-radius:8px;height:36px}.b2QN0a_headerActions .b2QN0a_secondaryButton{border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:0 0}.b2QN0a_headerActions .b2QN0a_secondaryButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}.b2QN0a_formGrid{grid-template-columns:1fr 1fr;gap:12px;display:grid}.b2QN0a_formGrid label{color:var(--dsw-alias-label-secondary);gap:6px;font-size:11px;display:grid}.b2QN0a_planEditorLarge{min-height:210px}.b2QN0a_planEyebrow{color:var(--dsw-alias-label-caption);letter-spacing:.08em;text-transform:uppercase;margin:0 0 6px;font-size:10px;font-weight:650}.b2QN0a_planQuestionTitle{letter-spacing:-.02em;max-width:780px;margin:0;font-size:18px;font-weight:620;line-height:1.5}.b2QN0a_planDepth{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);white-space:nowrap;border-radius:5px;flex:none;align-items:center;padding:0 9px;font-size:10px;line-height:20px;display:inline-flex}.b2QN0a_goalBlock{gap:6px;display:grid}.b2QN0a_goalBlock>span{color:var(--dsw-alias-label-caption);letter-spacing:.08em;text-transform:uppercase;font-size:10px;font-weight:650}.b2QN0a_goalBlock textarea{min-height:72px}.b2QN0a_criteriaList{color:var(--dsw-alias-label-tertiary);gap:6px;margin:0;padding-left:18px;font-size:11px;line-height:1.65;display:grid}.b2QN0a_depBlock{gap:5px;display:grid}.b2QN0a_depLabel{color:var(--dsw-alias-label-caption);letter-spacing:.08em;text-transform:uppercase;font-size:10px;font-weight:650}.b2QN0a_depChips{flex-wrap:wrap;gap:6px;margin:0;display:flex}.b2QN0a_questionCard .b2QN0a_depChips{margin:6px 0 0}.b2QN0a_depChip{border:1px solid var(--dsw-alias-border-l1);max-width:100%;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;border-radius:5px;padding:0 9px;font-size:10px;line-height:20px;overflow:hidden}.b2QN0a_depHint{color:var(--dsw-alias-label-caption);font-size:10px}.b2QN0a_planList{border-top:1px solid var(--dsw-alias-border-l1)}.b2QN0a_planListLabel{color:var(--dsw-alias-label-caption);letter-spacing:.08em;text-transform:uppercase;padding:18px 0 6px;font-size:10px;font-weight:650;display:block}.b2QN0a_planQuestion{border-bottom:1px solid var(--dsw-alias-border-l1);grid-template-columns:38px minmax(0,1fr);gap:10px;padding:18px 0;display:grid}.b2QN0a_planQuestion>span{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;padding-top:8px;font-size:11px}.b2QN0a_planQuestion>div{gap:10px;display:grid}.b2QN0a_planQuestion textarea{resize:vertical;width:100%;min-height:62px}.b2QN0a_planQuestion label{color:var(--dsw-alias-label-caption);gap:6px;font-size:10px;display:grid}.b2QN0a_planQuestion label textarea{min-height:76px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.65}.b2QN0a_planQuestion small{color:var(--dsw-alias-label-caption);font-size:10px}.b2QN0a_investigatePane{gap:22px;width:100%;min-width:0;max-width:1152px;margin:0 auto;display:grid;overflow-x:hidden}.b2QN0a_questionHeader{border-bottom:1px solid var(--dsw-alias-border-l1);min-width:0;padding-bottom:18px}.b2QN0a_questionHeader>span{color:var(--dsw-alias-label-caption);text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-weight:600}.b2QN0a_questionHeader h3{letter-spacing:-.02em;overflow-wrap:anywhere;max-width:850px;margin:5px 0 0;font-size:18px;line-height:1.55}.b2QN0a_questionHeader p{max-width:780px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere;margin:7px 0 0;font-size:11px;line-height:1.65}.b2QN0a_metrics{border-block:1px solid var(--dsw-alias-border-l1);grid-template-columns:repeat(3,minmax(0,1fr));display:grid}.b2QN0a_metrics div{flex-direction:column-reverse;gap:3px;min-width:0;padding:12px 16px;display:flex}.b2QN0a_metrics div+div{border-left:1px solid var(--dsw-alias-border-l1)}.b2QN0a_metrics strong{font-variant-numeric:tabular-nums;font-size:15px}.b2QN0a_metrics span{color:var(--dsw-alias-label-caption);text-overflow:ellipsis;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;font-size:9px;overflow:hidden}.b2QN0a_boardGrid{border-top:1px solid var(--dsw-alias-border-l1);grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start;gap:28px;padding-top:6px;display:grid}.b2QN0a_questions,.b2QN0a_evidencePane,.b2QN0a_scoutPane,.b2QN0a_timeline{min-width:0}.b2QN0a_timeline{gap:0;display:grid}.b2QN0a_evidenceGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:0 28px;display:grid}.b2QN0a_boardHeading{color:var(--dsw-alias-label-secondary);margin:0 0 10px;font-size:12px;font-weight:620}.b2QN0a_boardHeading span{color:var(--dsw-alias-label-caption);font-weight:500}.b2QN0a_waitingLine,.b2QN0a_gapLine{color:var(--dsw-alias-label-caption);margin:6px 0 0;font-size:10px;line-height:1.55}.b2QN0a_gapLine{color:var(--dsw-alias-state-warn-primary)}.b2QN0a_scoutPane{max-height:min(720px,100dvh - 260px);padding-right:4px;position:sticky;top:0;overflow:auto}.b2QN0a_scoutCard{border-bottom:1px solid var(--dsw-alias-border-l1);background:0 0;min-width:0;margin:0;overflow:hidden}.b2QN0a_scoutCard[data-status=waiting]{opacity:.94}.b2QN0a_scoutCard[data-live=true]{border-left:2px solid color-mix(in srgb, var(--dsw-alias-label-primary) 55%, transparent);margin-left:-12px;padding-left:10px}.b2QN0a_scoutSummary{cursor:pointer;align-items:flex-start;gap:10px;min-width:0;padding:14px 2px;list-style:none;display:flex}.b2QN0a_scoutSummary::-webkit-details-marker{display:none}.b2QN0a_scoutIcon{width:20px;height:20px;color:var(--dsw-alias-label-caption);flex:none;place-items:center;margin-top:1px;display:grid}.b2QN0a_scoutIcon[data-status=running]{color:var(--dsw-alias-label-primary)}.b2QN0a_scoutIcon[data-status=waiting],.b2QN0a_scoutIcon[data-status=partial]{color:var(--dsw-alias-state-warn-primary)}.b2QN0a_scoutIcon[data-status=blocked]{color:var(--dsw-alias-state-error-primary)}.b2QN0a_scoutIcon[data-status=done]{color:var(--dsw-alias-label-secondary)}.b2QN0a_scoutSummaryBody{flex:1;min-width:0}.b2QN0a_scoutSummaryBody strong{text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:620;display:block;overflow:hidden}.b2QN0a_scoutMetaRow{flex-wrap:wrap;gap:6px;min-width:0;margin-top:6px;display:flex}.b2QN0a_scoutChip{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);max-width:100%;color:var(--dsw-alias-label-caption);text-overflow:ellipsis;white-space:nowrap;border-radius:5px;padding:1px 8px;font-size:10px;line-height:18px;overflow:hidden}.b2QN0a_scoutChip[data-kind=verify],.b2QN0a_scoutChip[data-kind=criterion]{background:color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);color:var(--dsw-alias-label-secondary)}.b2QN0a_scoutStatus{color:var(--dsw-alias-label-caption);flex:none;margin-top:4px;font-size:10px;font-weight:560}.b2QN0a_scoutStatus[data-live=true]{color:var(--dsw-alias-label-primary)}.b2QN0a_scoutSummary>svg{color:var(--dsw-alias-label-caption);flex:none;margin-top:3px;transition:transform .18s}.b2QN0a_scoutCard[open] .b2QN0a_scoutSummary>svg{transform:rotate(180deg)}.b2QN0a_scoutBody{border-top:1px solid var(--dsw-alias-border-l1);gap:10px;min-width:0;padding:0 4px 16px 32px;display:grid}.b2QN0a_scoutEvidence{gap:0;display:grid}.b2QN0a_scoutHead{justify-content:space-between;align-items:flex-start;gap:10px;display:flex}.b2QN0a_scoutHead strong{font-size:12px;font-weight:620;line-height:1.45}.b2QN0a_scoutHead span{color:var(--dsw-alias-label-caption);flex:none;font-size:10px}.b2QN0a_scoutMeta{color:var(--dsw-alias-label-tertiary);margin:0;font-size:11px;line-height:1.5}.b2QN0a_scoutActivity{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);min-width:0;color:var(--dsw-alias-label-secondary);border-radius:8px;align-items:flex-start;gap:8px;margin:0;padding:8px 10px;font-size:11px;line-height:1.5;display:flex}.b2QN0a_scoutActivity span{overflow-wrap:anywhere;min-width:0}.b2QN0a_scoutActivity[data-live=true]{border:1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 12%, var(--dsw-alias-border-l1))}.b2QN0a_coverage{gap:2px;margin-top:2px;display:grid}.b2QN0a_coverage h5{color:var(--dsw-alias-label-caption);letter-spacing:.08em;text-transform:uppercase;margin:6px 0 0;font-size:10px;font-weight:620}.b2QN0a_coverageList{gap:0;margin:0;padding:0;list-style:none;display:grid}.b2QN0a_coverageItem{border-top:1px solid var(--dsw-alias-border-l1);gap:3px;padding:8px 0;display:grid}.b2QN0a_coverageItem[data-active=true]{background:color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);box-shadow:inset 2px 0 0 var(--dsw-alias-label-primary);border-radius:8px;margin-inline:-8px;padding-inline:8px}.b2QN0a_coverageHead{grid-template-columns:minmax(0,1fr);align-items:start;gap:4px;display:grid}.b2QN0a_coverageHead b{min-width:0;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;font-size:11px;font-weight:560;line-height:1.45}.b2QN0a_coverageHead span{min-width:0;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;font-size:10px}.b2QN0a_coverageItem p,.b2QN0a_coverageItem em{color:var(--dsw-alias-label-caption);margin:0;font-size:10px;font-style:normal;line-height:1.45}.b2QN0a_coverageItem em[data-tone=warning],.b2QN0a_coverageItem em[data-tone=gap]{color:var(--dsw-alias-state-warn-primary)}.b2QN0a_coverageItem[data-status=covered] .b2QN0a_coverageHead span{color:var(--dsw-alias-label-secondary)}.b2QN0a_coverageItem[data-status=partial] .b2QN0a_coverageHead span{color:var(--dsw-alias-state-warn-primary)}.b2QN0a_coverageItem[data-status=blocked] .b2QN0a_coverageHead span,.b2QN0a_coverageItem[data-status=conflicted] .b2QN0a_coverageHead span{color:var(--dsw-alias-state-error-primary)}.b2QN0a_coverageItem[data-active=true] .b2QN0a_coverageHead span{color:var(--dsw-alias-label-primary)}.b2QN0a_toolList{gap:6px;min-width:0;margin:4px 0 0;padding:0;list-style:none;display:grid}.b2QN0a_toolList li{background:var(--dsw-alias-bg-layer-2);min-width:0;color:var(--dsw-alias-label-tertiary);border-radius:6px;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:8px;padding:6px 8px;font-size:11px;line-height:1.45;display:grid}.b2QN0a_toolList li[data-status=running]{border:1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 14%, var(--dsw-alias-border-l1))}.b2QN0a_toolList b{color:var(--dsw-alias-label-secondary);letter-spacing:.02em;font-size:10px;font-weight:620}.b2QN0a_toolList span{overflow-wrap:anywhere;min-width:0}.b2QN0a_handoff{min-width:0;color:var(--dsw-alias-label-caption);margin-top:6px;font-size:10px}.b2QN0a_handoff summary{cursor:pointer}.b2QN0a_handoff pre{overflow-wrap:anywhere;white-space:pre-wrap;max-height:180px;font:inherit;margin:6px 0 0;overflow:auto}.b2QN0a_questionCard{border-top:1px solid var(--dsw-alias-border-l1);min-width:0;padding:10px 0}.b2QN0a_questionCard[data-live=true]{border-left:2px solid color-mix(in srgb, var(--dsw-alias-label-primary) 55%, transparent);margin-left:-12px;padding-left:10px}.b2QN0a_questionCard:last-child{border-bottom:1px solid var(--dsw-alias-border-l1)}.b2QN0a_questionTitle{grid-template-columns:24px minmax(0,1fr) auto;align-items:start;gap:10px;min-width:0;display:grid}.b2QN0a_questionTitle>span{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;font-size:10px}.b2QN0a_questionTitle h4{overflow-wrap:anywhere;margin:0;font-size:11px;font-weight:500;line-height:1.5}.b2QN0a_questionTitle strong{width:fit-content;max-width:100%;color:var(--dsw-alias-label-caption);font-size:10px;font-weight:500;display:block}.b2QN0a_questionTitle strong[data-status=running]{color:var(--dsw-alias-label-primary)}.b2QN0a_questionTitle strong[data-status=covered]{color:var(--dsw-alias-label-secondary)}.b2QN0a_questionTitle strong[data-status=waiting],.b2QN0a_questionTitle strong[data-status=partial]{color:var(--dsw-alias-state-warn-primary)}.b2QN0a_questionTitle strong[data-status=blocked],.b2QN0a_questionTitle strong[data-status=failed]{color:var(--dsw-alias-state-error-primary)}.b2QN0a_questionLimits{flex-wrap:wrap;gap:6px;margin:8px 0 0 40px;display:flex}.b2QN0a_questionLimits span{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);max-width:100%;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;border-radius:5px;padding:3px 8px;font-size:10px;overflow:hidden}.b2QN0a_questionLimits span[data-status=partial]{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, var(--dsw-alias-border-l1));background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-state-warn-primary)}.b2QN0a_questionLimits span[data-status=blocked],.b2QN0a_questionLimits span[data-status=conflicted]{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, var(--dsw-alias-border-l1));background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-state-error-primary)}.b2QN0a_questionCard>p{color:var(--dsw-alias-label-caption);margin:7px 0 0 40px;font-size:10px}.b2QN0a_questionCard ul{gap:7px;margin:12px 0 0 40px;padding:0;list-style:none;display:grid}.b2QN0a_questionCard li{color:var(--dsw-alias-label-tertiary);grid-template-columns:16px minmax(0,1fr);gap:7px;font-size:11px;line-height:1.55;display:grid}.b2QN0a_questionCard li>span{color:var(--dsw-alias-label-caption)}.b2QN0a_questionCard li b{color:var(--dsw-alias-label-secondary);font-weight:500}.b2QN0a_questionCard li p,.b2QN0a_questionCard li em{margin:3px 0 0;font-size:10px;font-style:normal;display:block}.b2QN0a_evidencePane{min-width:0;padding-top:6px}.b2QN0a_evidencePane>h3{margin:0 0 10px;font-size:13px}.b2QN0a_evidencePane>h3 span{color:var(--dsw-alias-label-caption);font-weight:500}.b2QN0a_evidenceEmpty{border:1px dashed var(--dsw-alias-border-l1);text-align:center;border-radius:14px;align-content:center;place-items:center;min-height:154px;padding:18px;display:grid}.b2QN0a_evidenceEmpty>span{background:var(--dsw-alias-bg-layer-2);width:34px;height:34px;color:var(--dsw-alias-label-caption);border-radius:8px;place-items:center;display:grid}.b2QN0a_evidenceEmpty p{max-width:300px;color:var(--dsw-alias-label-caption);margin:9px 0 0;font-size:11px;line-height:1.6}.b2QN0a_evidenceCard{border-top:1px solid var(--dsw-alias-border-l1);flex-direction:column;min-width:0;padding:13px 0;display:flex}.b2QN0a_evidenceCard>div{align-items:center;gap:8px;min-width:0;display:flex}.b2QN0a_evidenceCard>div span{color:var(--dsw-alias-label-caption);text-overflow:ellipsis;white-space:nowrap;font-size:10px;overflow:hidden}.b2QN0a_evidenceCard>div span[data-confidence]{flex:none;font-weight:600}.b2QN0a_evidenceCard p{color:var(--dsw-alias-label-tertiary);-webkit-line-clamp:4;overflow-wrap:anywhere;-webkit-box-orient:vertical;margin:6px 0 0;font-size:11px;line-height:1.6;display:-webkit-box;overflow:hidden}.b2QN0a_evidenceCard a{max-width:100%;color:var(--dsw-alias-label-secondary);align-items:center;gap:6px;margin-top:8px;font-size:10px;text-decoration:none;display:inline-flex;overflow:hidden}.b2QN0a_evidenceCard a span{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.b2QN0a_evidenceCard a:hover{text-decoration:underline}.b2QN0a_reportDocument{max-width:860px;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}.b2QN0a_reportPending{min-height:160px;color:var(--dsw-alias-label-caption);align-items:center;gap:10px;font-size:12px;display:flex}.b2QN0a_reportLimitations{border-top:1px solid var(--dsw-alias-border-l1);padding-top:18px}.b2QN0a_reportLimitations h4{margin:0 0 8px;font-size:12px}.b2QN0a_reportLimitations ul{color:var(--dsw-alias-label-tertiary);gap:6px;margin:0;padding-left:18px;font-size:11px;line-height:1.6;display:grid}.b2QN0a_limitationsBoard{min-width:0}.b2QN0a_investigatePane>.b2QN0a_limitationsBoard{border-top:1px solid var(--dsw-alias-border-l1);padding-top:22px}.b2QN0a_limitationsBoard h4{color:var(--dsw-alias-label-secondary);align-items:baseline;gap:8px;margin:0 0 10px;font-size:12px;font-weight:620;display:flex}.b2QN0a_limitationsBoard h4 span{color:var(--dsw-alias-label-caption);font-weight:500}.b2QN0a_limitationsEmpty{color:var(--dsw-alias-label-caption);margin:0;font-size:11px;line-height:1.55}.b2QN0a_limitationList{gap:0;margin:0;padding:0;list-style:none;display:grid}.b2QN0a_limitationItem{border-top:1px solid var(--dsw-alias-border-l1);gap:4px;padding:10px 0;display:grid}.b2QN0a_limitationHead{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.b2QN0a_limitationHead span,.b2QN0a_limitationHead b{color:var(--dsw-alias-label-caption);font-size:10px;font-weight:560;line-height:1.45}.b2QN0a_limitationItem p{color:var(--dsw-alias-state-warn-primary);overflow-wrap:anywhere;margin:0;font-size:12px;line-height:1.55}@media (width<=900px){.b2QN0a_toolbar{flex-direction:column;align-items:flex-start}.b2QN0a_toolbarActions{flex-wrap:wrap;width:100%}.b2QN0a_search{flex:1;width:auto}.b2QN0a_boardGrid,.b2QN0a_formGrid{grid-template-columns:1fr}.b2QN0a_evidencePane,.b2QN0a_scoutPane{max-height:none;position:static}.b2QN0a_metrics{grid-template-columns:1fr}.b2QN0a_metrics div+div{border-top:1px solid var(--dsw-alias-border-l1);border-left:0}.b2QN0a_evidenceGrid{grid-template-columns:1fr}}@media (width<=620px){.b2QN0a_content{padding:16px 12px 36px}.b2QN0a_toolbarActions{align-items:stretch}.b2QN0a_search{flex-basis:100%;width:100%}.b2QN0a_select{flex:1}.b2QN0a_projectGrid,.b2QN0a_contextFields{grid-template-columns:1fr}.b2QN0a_modalHeader,.b2QN0a_modalBody,.b2QN0a_modalFooter{padding-inline:16px}.b2QN0a_modalFooter{flex-direction:column;align-items:stretch}.b2QN0a_modalFooter>div{justify-content:flex-end}.b2QN0a_detailBody,.b2QN0a_workspaceHeader,.b2QN0a_progressBar{padding-inline:14px}.b2QN0a_projectHeading{text-align:left}.b2QN0a_workspaceHeader .b2QN0a_phase{display:none}}@media (prefers-reduced-motion:reduce){.b2QN0a_shell *,.b2QN0a_shell :before,.b2QN0a_shell :after{scroll-behavior:auto;transition:none;animation:none}.b2QN0a_modalBackdrop,.b2QN0a_modal,.b2QN0a_confirmBackdrop,.b2QN0a_confirmCard{animation:none}}.b2QN0a_auroraGlow{background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-alias-shadow-md), 0 0 0 1px color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, var(--dsw-alias-border-l1));-webkit-backdrop-filter:blur(16px);position:relative}.b2QN0a_auroraPulse{animation:4s ease-in-out infinite alternate b2QN0a_auroraBreath}@keyframes b2QN0a_auroraBreath{0%{box-shadow:0 0 12px -2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 20%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, var(--dsw-alias-border-l1))}to{box-shadow:0 0 24px 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 70%, var(--dsw-alias-border-l1))}}.b2QN0a_executiveCard{border-radius:var(--deepresearch-panel-radius);background:color-mix(in srgb, var(--dsw-alias-state-business-tertiary) 50%, var(--dsw-alias-bg-layer-2));border-left:3px solid var(--dsw-alias-state-business-primary);margin:16px 0 24px;padding:16px 20px;box-shadow:0 2px 10px #0000000d}.b2QN0a_executiveCard h4{color:var(--dsw-alias-state-business-primary);letter-spacing:.02em;align-items:center;gap:6px;margin:0 0 8px;font-size:13px;font-weight:650;display:flex}.b2QN0a_executiveCard p{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:1.7}.b2QN0a_takeawayList{grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:16px 0 24px;padding:0;list-style:none;display:grid}.b2QN0a_takeawayItem{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);border-radius:8px;flex-direction:column;gap:4px;padding:12px 14px;font-size:11px;line-height:1.6;transition:transform .18s,border-color .18s;display:flex}.b2QN0a_takeawayItem:hover{border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 35%, var(--dsw-alias-border-l1));transform:translateY(-1px)}.b2QN0a_exportButtonGroup{align-items:center;gap:6px;display:inline-flex}.b2QN0a_exportButton{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);min-height:30px;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:6px;align-items:center;gap:5px;padding:0 10px;font-size:11px;font-weight:500;transition:all .18s;display:inline-flex}.b2QN0a_exportButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}.b2QN0a_sourceSelector{flex-wrap:wrap;gap:8px;margin-top:6px;display:flex}.b2QN0a_sourcePill{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:16px;align-items:center;gap:6px;padding:6px 12px;font-size:11px;transition:all .18s;display:inline-flex}.b2QN0a_sourcePill:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}.b2QN0a_sourcePill[data-selected=true]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, var(--dsw-alias-bg-layer-2));border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);font-weight:600}.b2QN0a_planActionRow{justify-content:space-between;align-items:center;padding-top:10px;display:flex}";
		const tagId$1 = "@deepseek-ai/dsh-deepresearch/views.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-deepresearch";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var views_module_css_default = {
			"activeChip": "b2QN0a_activeChip",
			"auroraBreath": "b2QN0a_auroraBreath",
			"auroraGlow": "b2QN0a_auroraGlow",
			"auroraPulse": "b2QN0a_auroraPulse",
			"backButton": "b2QN0a_backButton",
			"bannerActions": "b2QN0a_bannerActions",
			"boardGrid": "b2QN0a_boardGrid",
			"boardHeading": "b2QN0a_boardHeading",
			"cardEmoji": "b2QN0a_cardEmoji",
			"cardInfo": "b2QN0a_cardInfo",
			"cardOpen": "b2QN0a_cardOpen",
			"chip": "b2QN0a_chip",
			"confirmActions": "b2QN0a_confirmActions",
			"confirmBackdrop": "b2QN0a_confirmBackdrop",
			"confirmCancel": "b2QN0a_confirmCancel",
			"confirmCard": "b2QN0a_confirmCard",
			"confirmDelete": "b2QN0a_confirmDelete",
			"confirmMark": "b2QN0a_confirmMark",
			"confirmed": "b2QN0a_confirmed",
			"content": "b2QN0a_content",
			"contextCard": "b2QN0a_contextCard",
			"contextFields": "b2QN0a_contextFields",
			"coverage": "b2QN0a_coverage",
			"coverageHead": "b2QN0a_coverageHead",
			"coverageItem": "b2QN0a_coverageItem",
			"coverageList": "b2QN0a_coverageList",
			"createCard": "b2QN0a_createCard",
			"criteriaList": "b2QN0a_criteriaList",
			"deleteButton": "b2QN0a_deleteButton",
			"deleteText": "b2QN0a_deleteText",
			"depBlock": "b2QN0a_depBlock",
			"depChip": "b2QN0a_depChip",
			"depChips": "b2QN0a_depChips",
			"depHint": "b2QN0a_depHint",
			"depLabel": "b2QN0a_depLabel",
			"detailBody": "b2QN0a_detailBody",
			"emptyState": "b2QN0a_emptyState",
			"emptyText": "b2QN0a_emptyText",
			"error": "b2QN0a_error",
			"evidenceCard": "b2QN0a_evidenceCard",
			"evidenceEmpty": "b2QN0a_evidenceEmpty",
			"evidenceGrid": "b2QN0a_evidenceGrid",
			"evidencePane": "b2QN0a_evidencePane",
			"executiveCard": "b2QN0a_executiveCard",
			"exportButton": "b2QN0a_exportButton",
			"exportButtonGroup": "b2QN0a_exportButtonGroup",
			"eyebrow": "b2QN0a_eyebrow",
			"fieldLabel": "b2QN0a_fieldLabel",
			"filters": "b2QN0a_filters",
			"formGrid": "b2QN0a_formGrid",
			"gapLine": "b2QN0a_gapLine",
			"goalBlock": "b2QN0a_goalBlock",
			"handoff": "b2QN0a_handoff",
			"headerActions": "b2QN0a_headerActions",
			"iconButton": "b2QN0a_iconButton",
			"incompleteBanner": "b2QN0a_incompleteBanner",
			"input": "b2QN0a_input",
			"investigatePane": "b2QN0a_investigatePane",
			"library": "b2QN0a_library",
			"libraryTitle": "b2QN0a_libraryTitle",
			"libraryTopBar": "b2QN0a_libraryTopBar",
			"limitationHead": "b2QN0a_limitationHead",
			"limitationItem": "b2QN0a_limitationItem",
			"limitationList": "b2QN0a_limitationList",
			"limitationsBoard": "b2QN0a_limitationsBoard",
			"limitationsEditor": "b2QN0a_limitationsEditor",
			"limitationsEmpty": "b2QN0a_limitationsEmpty",
			"metrics": "b2QN0a_metrics",
			"modal": "b2QN0a_modal",
			"modal-backdrop-in": "b2QN0a_modal-backdrop-in",
			"modal-content-in": "b2QN0a_modal-content-in",
			"modalBackdrop": "b2QN0a_modalBackdrop",
			"modalBody": "b2QN0a_modalBody",
			"modalCancelButton": "b2QN0a_modalCancelButton",
			"modalCloseButton": "b2QN0a_modalCloseButton",
			"modalDangerButton": "b2QN0a_modalDangerButton",
			"modalError": "b2QN0a_modalError",
			"modalFooter": "b2QN0a_modalFooter",
			"modalHeader": "b2QN0a_modalHeader",
			"modalHeading": "b2QN0a_modalHeading",
			"modalSubmitButton": "b2QN0a_modalSubmitButton",
			"pausedBanner": "b2QN0a_pausedBanner",
			"phase": "b2QN0a_phase",
			"planActionRow": "b2QN0a_planActionRow",
			"planDepth": "b2QN0a_planDepth",
			"planEditorLarge": "b2QN0a_planEditorLarge",
			"planEyebrow": "b2QN0a_planEyebrow",
			"planFailure": "b2QN0a_planFailure",
			"planList": "b2QN0a_planList",
			"planListLabel": "b2QN0a_planListLabel",
			"planPane": "b2QN0a_planPane",
			"planQuestion": "b2QN0a_planQuestion",
			"planQuestionTitle": "b2QN0a_planQuestionTitle",
			"planningIcon": "b2QN0a_planningIcon",
			"planningState": "b2QN0a_planningState",
			"primaryButton": "b2QN0a_primaryButton",
			"progressBar": "b2QN0a_progressBar",
			"projectCard": "b2QN0a_projectCard",
			"projectGrid": "b2QN0a_projectGrid",
			"projectHeading": "b2QN0a_projectHeading",
			"projectList": "b2QN0a_projectList",
			"projectLoading": "b2QN0a_projectLoading",
			"questionCard": "b2QN0a_questionCard",
			"questionHeader": "b2QN0a_questionHeader",
			"questionInput": "b2QN0a_questionInput",
			"questionLimits": "b2QN0a_questionLimits",
			"questionTitle": "b2QN0a_questionTitle",
			"questions": "b2QN0a_questions",
			"readyBanner": "b2QN0a_readyBanner",
			"reportDocument": "b2QN0a_reportDocument",
			"reportEditor": "b2QN0a_reportEditor",
			"reportLimitations": "b2QN0a_reportLimitations",
			"reportPane": "b2QN0a_reportPane",
			"reportPending": "b2QN0a_reportPending",
			"research-spin": "b2QN0a_research-spin",
			"runningBanner": "b2QN0a_runningBanner",
			"scoutActivity": "b2QN0a_scoutActivity",
			"scoutBody": "b2QN0a_scoutBody",
			"scoutCard": "b2QN0a_scoutCard",
			"scoutChip": "b2QN0a_scoutChip",
			"scoutEvidence": "b2QN0a_scoutEvidence",
			"scoutHead": "b2QN0a_scoutHead",
			"scoutIcon": "b2QN0a_scoutIcon",
			"scoutMeta": "b2QN0a_scoutMeta",
			"scoutMetaRow": "b2QN0a_scoutMetaRow",
			"scoutPane": "b2QN0a_scoutPane",
			"scoutStatus": "b2QN0a_scoutStatus",
			"scoutSummary": "b2QN0a_scoutSummary",
			"scoutSummaryBody": "b2QN0a_scoutSummaryBody",
			"search": "b2QN0a_search",
			"secondaryButton": "b2QN0a_secondaryButton",
			"sectionHeader": "b2QN0a_sectionHeader",
			"select": "b2QN0a_select",
			"shell": "b2QN0a_shell",
			"sourcePill": "b2QN0a_sourcePill",
			"sourceSelector": "b2QN0a_sourceSelector",
			"spinner": "b2QN0a_spinner",
			"stepper": "b2QN0a_stepper",
			"stopButton": "b2QN0a_stopButton",
			"takeawayItem": "b2QN0a_takeawayItem",
			"takeawayList": "b2QN0a_takeawayList",
			"textareaSmall": "b2QN0a_textareaSmall",
			"timeline": "b2QN0a_timeline",
			"toolList": "b2QN0a_toolList",
			"toolbar": "b2QN0a_toolbar",
			"toolbarActions": "b2QN0a_toolbarActions",
			"viewToggle": "b2QN0a_viewToggle",
			"waitingLine": "b2QN0a_waitingLine",
			"workspace": "b2QN0a_workspace",
			"workspaceHeader": "b2QN0a_workspaceHeader"
		};
		//#endregion
		//#region src/client/ResearchComposer.tsx
		/** Composer-local form state and presentation; remote creation belongs to the library hook. */
		function ResearchComposer({ busy, error, setBusy, t, onClose, onCreate, setError }) {
			const [question, setQuestion] = (0, react.useState)("");
			const [goal, setGoal] = (0, react.useState)("");
			const [constraints, setConstraints] = (0, react.useState)("");
			const [seedText, setSeedText] = (0, react.useState)("");
			const [depth, setDepth] = (0, react.useState)("standard");
			const [contextOpen, setContextOpen] = (0, react.useState)(false);
			const [selectedSources, setSelectedSources] = (0, react.useState)([
				"web",
				"academic",
				"news",
				"docs"
			]);
			const [budgetPreset, setBudgetPreset] = (0, react.useState)("balanced");
			const toggleSource = (source) => {
				setSelectedSources((current) => current.includes(source) ? current.length > 1 ? current.filter((s) => s !== source) : current : [...current, source]);
			};
			const contextCount = [
				goal,
				constraints,
				seedText
			].filter((value) => value.trim() !== "").length;
			const submit = (event) => {
				event.preventDefault();
				const trimmed = question.trim();
				if (busy || trimmed === "") return;
				setBusy(true);
				setError(null);
				const augmentedConstraints = [
					constraints.trim(),
					`[定向检索源: ${selectedSources.join(", ")}]`,
					`[预算预设: ${budgetPreset}]`
				].filter(Boolean).join("\n");
				onCreate({
					question: trimmed,
					goal: goal.trim(),
					constraints: augmentedConstraints,
					seedText: seedText.trim(),
					depth,
					questions: []
				}).catch((cause) => {
					setError(messageOf(cause));
				}).finally(() => {
					setBusy(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: views_module_css_default.modalBackdrop,
				role: "presentation",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					className: `${views_module_css_default.modal} ${views_module_css_default.auroraGlow}`,
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": "new-research-title",
					onSubmit: submit,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: views_module_css_default.modalHeader,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: views_module_css_default.modalHeading,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-hidden": "true",
									className: views_module_css_default.auroraPulse,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkle16, { size: 18 })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									id: "new-research-title",
									children: t("composer.title")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("composer.subtitle") })] })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: views_module_css_default.modalCloseButton,
								type: "button",
								"aria-label": t("composer.closeAria"),
								disabled: busy,
								onClick: onClose,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 16 })
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: views_module_css_default.modalBody,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: views_module_css_default.fieldLabel,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("composer.question"),
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: t("composer.required") })
									] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										autoFocus: true,
										className: views_module_css_default.questionInput,
										value: question,
										onChange: (event) => {
											setQuestion(event.target.value);
										},
										placeholder: t("composer.questionPlaceholder")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: views_module_css_default.contextCard,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										"aria-expanded": contextOpen,
										onClick: () => {
											setContextOpen((value) => !value);
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGoalOutline16, { size: 15 }) }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [t("composer.context"), contextCount === 0 ? "" : t("composer.contextCount", { count: contextCount })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("composer.contextHint") })] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: contextOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutline14, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { size: 14 }) })
										]
									}), contextOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: views_module_css_default.contextFields,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("composer.goal"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: views_module_css_default.input,
												value: goal,
												onChange: (event) => {
													setGoal(event.target.value);
												},
												placeholder: t("composer.goalPlaceholder")
											})] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("composer.depth"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												className: views_module_css_default.input,
												value: depth,
												onChange: (event) => {
													setDepth(event.target.value);
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "quick",
														children: t("depth.quick")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "standard",
														children: t("depth.standard")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "deep",
														children: t("depth.deep")
													})
												]
											})] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("composer.budgetPreset"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												className: views_module_css_default.input,
												value: budgetPreset,
												onChange: (event) => {
													setBudgetPreset(event.target.value);
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "conservative",
														children: t("budget.conservative")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "balanced",
														children: t("budget.balanced")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "exhaustive",
														children: t("budget.exhaustive")
													})
												]
											})] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", { children: t("composer.sources") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: views_module_css_default.sourceSelector,
												children: [
													{
														id: "web",
														label: t("sources.web")
													},
													{
														id: "academic",
														label: t("sources.academic")
													},
													{
														id: "news",
														label: t("sources.news")
													},
													{
														id: "docs",
														label: t("sources.docs")
													}
												].map((src) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: views_module_css_default.sourcePill,
													"data-selected": selectedSources.includes(src.id) || void 0,
													onClick: () => {
														toggleSource(src.id);
													},
													children: src.label
												}, src.id))
											})] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("composer.constraints"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
												className: views_module_css_default.textareaSmall,
												value: constraints,
												onChange: (event) => {
													setConstraints(event.target.value);
												},
												placeholder: t("composer.constraintsPlaceholder")
											})] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("composer.seed"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
												className: views_module_css_default.textareaSmall,
												value: seedText,
												onChange: (event) => {
													setSeedText(event.target.value);
												},
												placeholder: t("composer.seedPlaceholder")
											})] })
										]
									}) : null]
								}),
								error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: views_module_css_default.modalError,
									role: "alert",
									children: error
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: views_module_css_default.modalFooter,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("composer.footer") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: views_module_css_default.modalCancelButton,
								type: "button",
								disabled: busy,
								onClick: onClose,
								children: t("action.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: views_module_css_default.modalSubmitButton,
								type: "submit",
								disabled: busy || question.trim() === "",
								children: [busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {
									className: views_module_css_default.spinner,
									size: 14
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkle16, { size: 14 }), busy ? t("action.creating") : t("action.createPlan")]
							})] })]
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/use-research-workspace.ts
		/** Workspace drafts, progress lifecycle and remote mutation coordination. */
		function useResearchWorkspace({ project, api, t, onChange, setError }) {
			const [focus, setFocus] = (0, react.useState)(stepFor(project));
			const [goal, setGoal] = (0, react.useState)(project.goal);
			const [questions, setQuestions] = (0, react.useState)(() => editablePlan(project));
			const [busy, setBusy] = (0, react.useState)(false);
			const prevPhase = (0, react.useRef)(project.phase);
			(0, react.useEffect)(() => {
				setGoal(project.goal);
				setQuestions(editablePlan(project));
				const from = prevPhase.current;
				prevPhase.current = project.phase;
				setFocus((current) => {
					const target = stepFor(project);
					if (from !== project.phase && target === "investigate" && current === "plan") return "investigate";
					if (from !== project.phase && target === "report" && current !== "report") return "report";
					return reachableStep(project, current) ? current : target;
				});
			}, [
				project.phase,
				project.goal,
				project.id,
				project.updatedAt
			]);
			const seenUpdatedAt = (0, react.useRef)(project.updatedAt);
			seenUpdatedAt.current = project.updatedAt;
			const applyLatest = (0, react.useCallback)((latest) => {
				if (latest.id !== project.id || latest.updatedAt === seenUpdatedAt.current) return;
				onChange(latest);
			}, [onChange, project.id]);
			(0, react.useEffect)(() => {
				let active = true;
				const unsubscribe = api.subscribeProgress((latest) => {
					if (active) applyLatest(latest);
				});
				return () => {
					active = false;
					unsubscribe();
				};
			}, [api.subscribeProgress, applyLatest]);
			(0, react.useEffect)(() => {
				if (project.runState !== "running") return;
				let active = true;
				let inFlight = false;
				const sync = () => {
					if (!active || inFlight) return;
					inFlight = true;
					api.get(project.id).then((latest) => {
						if (active && latest !== null) applyLatest(latest);
					}).finally(() => {
						inFlight = false;
					});
				};
				sync();
				const timer = window.setInterval(sync, 2500);
				return () => {
					active = false;
					window.clearInterval(timer);
				};
			}, [
				api,
				applyLatest,
				project.id,
				project.runState
			]);
			const run = (0, react.useCallback)(async (operation) => {
				setBusy(true);
				setError(null);
				try {
					onChange(await operation());
				} catch (cause) {
					setError(messageOf(cause));
				} finally {
					setBusy(false);
				}
			}, [onChange, setError]);
			const planRequest = (0, react.useCallback)(() => ({
				id: project.id,
				goal: goal.trim(),
				constraints: project.constraints,
				depth: project.depth,
				questions: questions.map((question) => ({
					...question,
					text: question.text.trim(),
					criteria: question.criteria.map((item) => item.trim()).filter(Boolean)
				})).filter((question) => question.text !== "" && question.criteria.length > 0)
			}), [
				goal,
				project.constraints,
				project.depth,
				project.id,
				questions
			]);
			const savePlan = (0, react.useCallback)(() => {
				run(() => api.updatePlan(planRequest()));
			}, [
				api,
				planRequest,
				run
			]);
			const confirmAndStart = (0, react.useCallback)(async () => {
				if (busy) return;
				setBusy(true);
				setError(null);
				try {
					const saved = await api.updatePlan(planRequest());
					onChange(await api.confirmPlan(saved.id));
					setFocus("investigate");
				} catch (cause) {
					setError(messageOf(cause));
				} finally {
					setBusy(false);
				}
			}, [
				api,
				busy,
				onChange,
				planRequest,
				setError
			]);
			const running = project.runState === "running";
			const paused = project.runState === "paused";
			const canContinue = paused && [
				"planning",
				"investigating",
				"incomplete",
				"writing",
				"aborted",
				"failed"
			].includes(project.phase);
			const canWrite = project.planConfirmed && !running && [
				"ready_for_report",
				"writing",
				"done",
				"incomplete",
				"investigating"
			].includes(project.phase);
			const stopRun = (0, react.useCallback)(() => {
				run(() => api.fail(project.id, t("investigate.stopReason"), true));
			}, [
				api,
				project.id,
				run,
				t
			]);
			const resumeRun = (0, react.useCallback)(() => {
				run(() => api.resume(project.id));
			}, [
				api,
				project.id,
				run
			]);
			const rewriteReport = (0, react.useCallback)(() => {
				run(async () => {
					const next = await api.writeReport(project.id);
					setFocus("report");
					return next;
				});
			}, [
				api,
				project.id,
				run
			]);
			return {
				goal,
				setGoal,
				questions,
				setQuestions,
				busy,
				setFocus,
				activeStep: reachableStep(project, focus) ? focus : stepFor(project),
				running,
				paused,
				canContinue,
				canWrite,
				savePlan,
				confirmAndStart,
				stopRun,
				resumeRun,
				rewriteReport
			};
		}
		/** Kept at report-pane mount scope, including its existing notice timer semantics. */
		function useReportExport({ project, accepted, t }) {
			const [copyNotice, setCopyNotice] = (0, react.useState)(null);
			const handleExport = (format) => {
				if (!project.report) return;
				const content = reportExportContent(project, accepted, format);
				navigator.clipboard.writeText(content).then(() => {
					setCopyNotice(t("report.exportSuccess"));
					setTimeout(() => {
						setCopyNotice(null);
					}, 3e3);
				}).catch(() => {});
			};
			return {
				copyNotice,
				handleExport
			};
		}
		//#endregion
		//#region src/client/ResearchWorkspace.tsx
		/** Workspace presentation: plan review, investigation board and report. */
		function ResearchWorkspace({ project, api, t, onChange, onBack, onDelete, error, setError }) {
			const { goal, setGoal, questions, setQuestions, busy, setFocus, activeStep, running, paused, canContinue, canWrite, savePlan, confirmAndStart, stopRun, resumeRun, rewriteReport } = useResearchWorkspace({
				project,
				api,
				t,
				onChange,
				setError
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: views_module_css_default.workspace,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: views_module_css_default.workspaceHeader,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: views_module_css_default.backButton,
								type: "button",
								onClick: onBack,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { size: 15 }), t("workspace.back")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: views_module_css_default.projectHeading,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: views_module_css_default.eyebrow,
									children: "RESEARCH PROJECT"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: project.title })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: views_module_css_default.headerActions,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: views_module_css_default.phase,
										"data-phase": paused ? "aborted" : project.phase,
										children: phaseLabel(project, t)
									}),
									running ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: views_module_css_default.stopButton,
										type: "button",
										disabled: busy,
										onClick: stopRun,
										children: t("investigate.stop")
									}) : null,
									canContinue ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: views_module_css_default.secondaryButton,
										type: "button",
										disabled: busy,
										onClick: resumeRun,
										children: project.planConfirmed ? t("investigate.continue") : t("plan.retry")
									}) : null,
									canWrite && (project.phase === "ready_for_report" || project.phase === "writing" || project.phase === "done" || project.phase === "incomplete") ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: views_module_css_default.primaryButton,
										type: "button",
										disabled: busy,
										onClick: rewriteReport,
										children: project.report ? t("report.retry") : t("investigate.writeReport")
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: views_module_css_default.deleteText,
										type: "button",
										onClick: onDelete,
										children: t("workspace.delete")
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: views_module_css_default.progressBar,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", {
							className: views_module_css_default.stepper,
							children: [
								["plan", "stepper.plan"],
								["investigate", "stepper.investigate"],
								["report", "stepper.report"]
							].map(([id, key]) => {
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: !reachableStep(project, id),
									"data-active": activeStep === id,
									onClick: () => {
										setFocus(id);
									},
									children: t(key)
								}, id);
							})
						})
					}),
					error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: views_module_css_default.error,
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.detailBody,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"data-deepresearch-view": "",
								hidden: true
							}),
							activeStep !== "plan" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlanStep, {
								project,
								t,
								busy,
								goal,
								setGoal,
								questions,
								setQuestions,
								onSave: savePlan,
								onConfirm: () => {
									confirmAndStart();
								},
								onRetry: resumeRun
							}),
							activeStep !== "investigate" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InvestigatePane, {
								project,
								t,
								busy,
								onStop: stopRun,
								onContinue: resumeRun,
								onWrite: rewriteReport
							}),
							activeStep !== "report" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReportPane, {
								project,
								t,
								busy,
								onRewrite: rewriteReport
							})
						]
					})
				]
			});
		}
		/** Plan step: waiting shell, planner failure, or the reviewable plan itself. */
		function PlanStep({ project, t, busy, goal, setGoal, questions, setQuestions, onSave, onConfirm, onRetry }) {
			if (project.phase === "planning" && project.questions.length === 0) {
				const stopped = project.runState !== "running";
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
					className: views_module_css_default.planPane,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.planningState,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: views_module_css_default.planningIcon,
							"aria-hidden": "true",
							children: stopped ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGoalOutline16, { size: 22 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {
								className: views_module_css_default.spinner,
								size: 22
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: stopped ? t("plan.stopped") : t("phase.planning") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: stopped ? t("plan.stoppedHint") : t("plan.subtitle") }),
							stopped ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: views_module_css_default.primaryButton,
								type: "button",
								disabled: busy,
								onClick: onRetry,
								children: t("plan.retry")
							}) : null
						] })]
					})
				});
			}
			if (project.phase === "failed" && !project.planConfirmed && project.questions.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				className: views_module_css_default.planPane,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: views_module_css_default.planFailure,
					role: "alert",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("plan.failedTitle") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("plan.failedHint") }),
						project.limitations.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: item }, item))
					]
				})
			});
			const locked = project.planConfirmed || busy;
			const updateQuestion = (index, patch) => {
				setQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? {
					...item,
					...patch
				} : item));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: views_module_css_default.planPane,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.sectionHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: views_module_css_default.planEyebrow,
								children: t("plan.title")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: views_module_css_default.planQuestionTitle,
								children: project.question
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("plan.subtitle") })
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: views_module_css_default.headerActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: views_module_css_default.planDepth,
								children: `${t("composer.depth")} · ${depthLabel(project.depth, t)}`
							}), project.planConfirmed ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: views_module_css_default.confirmed,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline14, { size: 13 }), t("plan.confirmed")]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: views_module_css_default.secondaryButton,
								type: "button",
								disabled: busy,
								onClick: onSave,
								children: t("action.saveChanges")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: views_module_css_default.primaryButton,
								type: "button",
								disabled: busy || questions.length === 0,
								onClick: onConfirm,
								children: t("action.confirmStart")
							})] })]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: views_module_css_default.goalBlock,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("plan.goal") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							value: goal,
							disabled: locked,
							onChange: (event) => {
								setGoal(event.target.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.planList,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: views_module_css_default.planListLabel,
								children: t("plan.criteria")
							}),
							questions.map((question, index) => {
								const criteria = question.criteria.filter((item) => item.trim() !== "");
								const deps = question.dependsOn ?? [];
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									className: views_module_css_default.planQuestion,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: ordinal(index) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
										project.planConfirmed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: question.text }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
											value: question.text,
											disabled: busy,
											onChange: (event) => {
												updateQuestion(index, { text: event.target.value });
											}
										}),
										project.planConfirmed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
											className: views_module_css_default.criteriaList,
											children: criteria.map((item, itemIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: item }, `${index}-${itemIndex}`))
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [t("plan.criteria"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
											value: question.criteria.join("\n"),
											disabled: busy,
											onChange: (event) => {
												updateQuestion(index, { criteria: event.target.value.split("\n") });
											}
										})] }),
										deps.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: views_module_css_default.depBlock,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: views_module_css_default.depLabel,
													children: t("plan.dependsOn")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: views_module_css_default.depChips,
													children: deps.map((dep) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: views_module_css_default.depChip,
														children: t("plan.dependsOnChip", { label: formatDepLabel(dep, questions[dep]?.text ?? "") })
													}, `${index}-${dep}`))
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
													className: views_module_css_default.depHint,
													children: t("plan.dependsOnHint")
												})
											]
										}),
										!project.planConfirmed ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: views_module_css_default.planActionRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: views_module_css_default.exportButton,
												type: "button",
												disabled: busy || questions.length <= 1,
												onClick: () => {
													setQuestions((curr) => removePlanQuestion(curr, index));
												},
												children: t("plan.removeQuestion")
											})]
										}) : null
									] })]
								}, `${project.id}-${index}`);
							}),
							!project.planConfirmed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: { padding: "16px 0" },
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									className: views_module_css_default.secondaryButton,
									type: "button",
									disabled: busy,
									onClick: () => {
										setQuestions((curr) => [...curr, {
											text: "新增补充子问题",
											criteria: ["核验该子问题关联的权威事实"],
											dependsOn: []
										}]);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 14 }), t("plan.addQuestion")]
								})
							}) : null
						]
					})
				]
			});
		}
		/** Investigate step: timeline first, then questions + limitations, then evidence. */
		function InvestigatePane({ project, t, busy, onStop, onContinue, onWrite }) {
			const indexOf = (0, react.useMemo)(() => new Map(project.questions.map((question, index) => [question.id, index])), [project.questions]);
			const scouts = (0, react.useMemo)(() => boardScouts(project), [project]);
			const scoutOf = (0, react.useMemo)(() => new Map(scouts.map((scout) => [scout.questionId, scout])), [scouts]);
			const settledQuestions = project.questions.filter((item) => isSettledQuestion(item.status)).length;
			const settledScouts = scouts.filter((item) => item.status === "done" || item.status === "partial" || item.status === "blocked").length;
			const accepted = project.evidence.filter((item) => item.status !== "candidate" && item.status !== "rejected").length;
			const limitations = boardLimitations(project, t, project.phase === "investigating");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: views_module_css_default.investigatePane,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: views_module_css_default.questionHeader,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("composer.question") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: project.question }),
							project.goal === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: project.goal })
						]
					}),
					project.phase === "investigating" && project.runState === "running" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.runningBanner,
						role: "status",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {
								className: views_module_css_default.spinner,
								size: 16
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("investigate.running") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: views_module_css_default.stopButton,
								type: "button",
								disabled: busy,
								onClick: onStop,
								children: t("investigate.stop")
							})
						]
					}) : null,
					project.runState === "paused" && [
						"investigating",
						"incomplete",
						"writing",
						"aborted"
					].includes(project.phase) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.pausedBanner,
						role: "status",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGoalOutline16, { size: 15 }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("phase.aborted") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("investigate.pausedHint") })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: views_module_css_default.bannerActions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: views_module_css_default.secondaryButton,
									type: "button",
									disabled: busy,
									onClick: onContinue,
									children: t("investigate.continue")
								}), project.questions.every((item) => isSettledQuestion(item.status)) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: views_module_css_default.primaryButton,
									type: "button",
									disabled: busy,
									onClick: onWrite,
									children: t("investigate.writeReport")
								}) : null]
							})
						]
					}) : null,
					project.phase === "ready_for_report" && project.runState !== "running" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.readyBanner,
						role: "status",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline14, { size: 15 }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("investigate.readyTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("investigate.readyHint") })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: views_module_css_default.primaryButton,
								type: "button",
								disabled: busy,
								onClick: onWrite,
								children: t("investigate.writeReport")
							})
						]
					}) : null,
					project.phase === "incomplete" && project.runState !== "paused" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.incompleteBanner,
						role: "status",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGoalOutline16, { size: 15 }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("investigate.incompleteTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("investigate.incompleteHint") })] })]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.metrics,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("metric.subQuestions"),
								value: `${settledQuestions}/${project.questions.length}`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("metric.evidence"),
								value: String(accepted)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("investigate.scouts"),
								value: `${settledScouts}/${scouts.length}`
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: views_module_css_default.timeline,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: views_module_css_default.sectionHeader,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("investigate.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("investigate.subtitle") })] })
						}), scouts.map((scout) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScoutCard, {
							project,
							scout,
							indexOf,
							t
						}, scout.questionId))]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.boardGrid,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: views_module_css_default.questions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h4", {
								className: views_module_css_default.boardHeading,
								children: [
									t("investigate.questions"),
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: project.questions.length })
								]
							}), project.questions.map((question, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuestionCard, {
								project,
								question,
								index,
								indexOf,
								scout: scoutOf.get(question.id),
								t
							}, question.id))]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LimitationsBoard, {
							items: limitations,
							t,
							always: true
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: views_module_css_default.evidencePane,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h4", {
							className: views_module_css_default.boardHeading,
							children: [
								t("evidence.title"),
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: project.evidence.length })
							]
						}), project.evidence.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: views_module_css_default.evidenceEmpty,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGoalOutline16, { size: 17 }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("evidence.empty") })]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: views_module_css_default.evidenceGrid,
							children: project.evidence.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EvidenceCard, {
								evidence: item,
								t
							}, item.id))
						})]
					})
				]
			});
		}
		function QuestionCard({ project, question, index, indexOf, scout, t }) {
			const deps = resolveIndexes(question.dependsOn, indexOf);
			const waiting = resolveIndexes(scout?.waitingOn ?? [], indexOf);
			const gaps = question.gaps ?? [];
			const label = (at) => formatDepLabel(at, project.questions[at]?.text ?? "");
			const waitingOnDeps = waiting.length > 0;
			const queued = !waitingOnDeps && scout?.status === "waiting";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("article", {
				className: views_module_css_default.questionCard,
				"data-status": waitingOnDeps ? "waiting" : question.status,
				"data-live": question.status === "running" || void 0,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: views_module_css_default.questionTitle,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: ordinal(index) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: question.text }),
							deps.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: views_module_css_default.depChips,
								children: deps.map((at) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: views_module_css_default.depChip,
									children: t("plan.dependsOnChip", { label: label(at) })
								}, at))
							}),
							waiting.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: views_module_css_default.waitingLine,
								children: t("investigate.waitingOn", { list: waiting.map(label).join("、") })
							}),
							gaps.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: views_module_css_default.gapLine,
								children: `${t("investigate.gaps")}: ${gaps.join(" · ")}`
							})
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							"data-status": waitingOnDeps ? "waiting" : queued ? "pending" : question.status,
							children: waitingOnDeps ? t("investigate.waitingStatus") : queued ? t("investigate.queued") : statusLabel(question.status, t)
						})
					]
				})
			});
		}
		function ScoutCard({ project, scout, indexOf, t }) {
			const at = indexOf.get(scout.questionId);
			const question = at === void 0 ? void 0 : project.questions[at];
			const title = question?.text ?? String(scout.questionId);
			const waiting = scout.status === "waiting";
			const verifying = scout.status === "verifying" || scout.role === "evaluator";
			const live = scout.status === "running" || verifying;
			const failed = scout.status === "blocked";
			const partial = scout.status === "partial";
			const accepted = project.evidence.filter((item) => item.questionId === scout.questionId && item.status !== "candidate" && item.status !== "rejected");
			const activity = scout.activity.trim() !== "" ? scout.activity : verifying ? t("investigate.evaluating") : waiting ? scout.waitingOn.length > 0 ? t("investigate.waitingOn", { list: resolveIndexes(scout.waitingOn, indexOf).map((item) => formatDepLabel(item, project.questions[item]?.text ?? "")).join("、") }) : t("investigate.queuedHint") : live ? scout.activeCriterionText || t("investigate.running") : "";
			const scoutDraft = readableDraft(scout.scoutDraft);
			const evaluatorDraft = readableDraft(scout.evaluatorDraft);
			const criterionLabel = clipLabel(scout.activeCriterionText, 36);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: views_module_css_default.scoutCard,
				"data-status": scout.status,
				"data-role": scout.role,
				"data-live": live || void 0,
				open: live || waiting || failed || void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
					className: views_module_css_default.scoutSummary,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: views_module_css_default.scoutIcon,
							"data-status": waiting ? "waiting" : live ? "running" : failed || partial ? scout.status : "done",
							children: live ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {
								className: views_module_css_default.spinner,
								size: 14
							}) : failed || partial ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGoalOutline16, { size: 14 }) : waiting ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGoalOutline16, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline14, { size: 14 })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: views_module_css_default.scoutSummaryBody,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: title }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: views_module_css_default.scoutMetaRow,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: views_module_css_default.scoutChip,
										"data-kind": verifying ? "verify" : "role",
										children: verifying ? t("investigate.verifying") : t("investigate.scouts")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: views_module_css_default.scoutChip,
										children: t("investigate.toolsUsed", {
											used: scout.toolsUsed,
											cap: scout.toolsCap || 10
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: views_module_css_default.scoutChip,
										children: t("investigate.evidenceCount", { count: accepted.length })
									}),
									criterionLabel === "" || !live ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: views_module_css_default.scoutChip,
										"data-kind": "criterion",
										children: criterionLabel
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: views_module_css_default.scoutStatus,
							"data-live": live || void 0,
							children: scoutStatusLabel(scout, t)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { size: 14 })
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: views_module_css_default.scoutBody,
					children: [
						activity === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: views_module_css_default.scoutActivity,
							"data-live": live || void 0,
							children: [live ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {
								className: views_module_css_default.spinner,
								size: 12
							}) : waiting ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGoalOutline16, { size: 12 }) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: activity })]
						}),
						question === void 0 || question.criteria.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CriterionList, {
							criteria: question.criteria,
							scout,
							t
						}),
						(scout.tools ?? []).length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: views_module_css_default.toolList,
							children: scout.tools.map((tool, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
								"data-status": tool.status,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: toolLabel(tool.name, t) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tool.detail })]
							}, `${tool.name}-${index}`))
						}),
						accepted.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: views_module_css_default.scoutEvidence,
							children: accepted.slice(0, 8).map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EvidenceCard, {
								evidence: item,
								t
							}, item.id))
						}),
						scout.dependencySummary === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: views_module_css_default.handoff,
							open: waiting || void 0,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("investigate.dependencySummary") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: scout.dependencySummary })]
						}),
						scoutDraft === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: views_module_css_default.handoff,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("investigate.scoutDraft") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: scoutDraft })]
						}),
						evaluatorDraft === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: views_module_css_default.handoff,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("investigate.evaluatorDraft") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: evaluatorDraft })]
						}),
						scout.handoff === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
							className: views_module_css_default.handoff,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("investigate.handoff") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: scout.handoff })]
						})
					]
				})]
			});
		}
		function CriterionList({ criteria, scout, t }) {
			const live = scout?.status === "running" || scout?.status === "verifying";
			const verifying = scout?.status === "verifying" || scout?.role === "evaluator";
			const cap = Math.max(1, scout?.toolsCap || 10);
			if (criteria.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: views_module_css_default.coverage,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h5", { children: t("investigate.coverage") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: views_module_css_default.coverageList,
					children: criteria.map((criterion) => {
						const active = Boolean(live && scout !== void 0 && scout.activeCriterionId === criterion.id);
						const used = active && scout !== void 0 ? scout.toolsUsed : criterion.toolCount ?? 0;
						const atCap = used >= cap;
						const status = active && verifying ? t("investigate.verifying") : coverageLabel(criterion.status, t);
						const verification = verificationLabel(criterion.verification, t);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: views_module_css_default.coverageItem,
							"data-status": criterion.status,
							"data-active": active || void 0,
							"data-verify": criterion.verification || void 0,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: views_module_css_default.coverageHead,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: criterion.text }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										active ? `${t("investigate.activeNow")} · ` : "",
										status,
										verification === "" ? "" : ` · ${verification}`,
										` · ${t("investigate.toolsUsed", {
											used,
											cap
										})}`,
										atCap ? ` · ${t("investigate.capReached")}` : ""
									] })]
								}),
								criterion.summary === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: `${t("investigate.summary")}: ${criterion.summary}` }),
								criterion.warning === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", {
									"data-tone": "warning",
									children: `${t("investigate.warning")}: ${criterion.warning}`
								}),
								criterion.gap === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("em", {
									"data-tone": "gap",
									children: `${t("investigate.gaps")}: ${criterion.gap}`
								})
							]
						}, criterion.id);
					})
				})]
			});
		}
		function EvidenceCard({ evidence, t }) {
			const url = primaryEvidenceUrl(evidence);
			const host = sourceHostname(url);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
				className: views_module_css_default.evidenceCard,
				"data-status": evidence.status,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"data-confidence": evidence.confidence,
						children: confidenceLabel(evidence.confidence, t)
					}), host === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						title: url,
						children: host
					})] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: evidence.claim }),
					url === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
						href: url,
						target: "_blank",
						rel: "noreferrer",
						title: url,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline14, { size: 12 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: host || url })]
					})
				]
			});
		}
		function ReportPane({ project, t, busy, onRewrite }) {
			const accepted = project.evidence.filter((item) => item.status !== "candidate" && item.status !== "rejected");
			const writing = project.phase === "writing" && project.runState === "running";
			const { copyNotice, handleExport } = useReportExport({
				project,
				accepted,
				t
			});
			const markdownLabels = (0, react.useMemo)(() => ({
				code: {
					copyLabel: t("markdown.codeCopy"),
					copiedLabel: t("markdown.codeCopied")
				},
				footnotes: t("markdown.footnotes")
			}), [t]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: views_module_css_default.reportPane,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.sectionHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("report.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("report.subtitle") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: views_module_css_default.headerActions,
							children: [project.report ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: views_module_css_default.exportButtonGroup,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: views_module_css_default.exportButton,
										type: "button",
										onClick: () => {
											handleExport("md");
										},
										children: t("report.exportMarkdown")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: views_module_css_default.exportButton,
										type: "button",
										onClick: () => {
											handleExport("html");
										},
										children: t("report.exportHtml")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: views_module_css_default.exportButton,
										type: "button",
										onClick: () => {
											handleExport("mindmap");
										},
										children: t("report.exportMindmap")
									})
								]
							}) : null, project.planConfirmed && !writing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: views_module_css_default.primaryButton,
								type: "button",
								disabled: busy,
								onClick: onRewrite,
								children: project.report ? t("report.retry") : t("investigate.writeReport")
							}) : null]
						})]
					}),
					copyNotice ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.confirmed,
						style: { margin: "8px 0" },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline14, { size: 14 }), copyNotice]
					}) : null,
					project.report ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.executiveCard,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h4", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkle16, { size: 14 }), t("report.executiveSummary")] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: project.goal ? `围绕核心命题「${project.question}」，基于已穿透核验的 ${accepted.length} 项多方信源证据生成全景研报。` : project.question }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
								className: views_module_css_default.takeawayList,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
										className: views_module_css_default.takeawayItem,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "🎯 研究核心" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: project.question })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
										className: views_module_css_default.takeawayItem,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "🔍 证据覆盖" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
											accepted.length,
											" 条已核验证据链 · ",
											project.questions.length,
											" 个子领域"
										] })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
										className: views_module_css_default.takeawayItem,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "⚡ 研判置信度" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: accepted.some((a) => a.confidence === "high") ? "高 (多方独立交叉验证通过)" : "中 (基线证据充足)" })]
									})
								]
							})
						]
					}) : null,
					project.report !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("article", {
						className: `${views_module_css_default.reportDocument} ${views_module_css_default.auroraGlow}`,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
							text: project.report,
							streaming: writing,
							labels: markdownLabels
						})
					}) : writing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.reportPending,
						role: "status",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {
							className: views_module_css_default.spinner,
							size: 16
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("report.writing") })]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: views_module_css_default.reportPending,
						children: t("report.empty")
					}),
					accepted.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: views_module_css_default.evidencePane,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h4", {
							className: views_module_css_default.boardHeading,
							children: [
								t("evidence.sourcesTitle"),
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: accepted.length })
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: views_module_css_default.evidenceGrid,
							children: accepted.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EvidenceCard, {
								evidence: item,
								t
							}, item.id))
						})]
					})
				]
			});
		}
		function LimitationsBoard({ items, t, always }) {
			if (!always && items.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: views_module_css_default.limitationsBoard,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h4", { children: [t("report.limitations"), items.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: items.length })] }), items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: views_module_css_default.limitationsEmpty,
					children: t("report.limitationsEmpty")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: views_module_css_default.limitationList,
					children: items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
						className: views_module_css_default.limitationItem,
						"data-status": item.status || void 0,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: views_module_css_default.limitationHead,
							children: [item.ref === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item.ref }), item.status === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: coverageLabel(item.status, t) })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: item.text })]
					}, item.key))
				})]
			});
		}
		function Metric({ label, value }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: value })] });
		}
		//#endregion
		//#region src/types.ts
		/**
		* Construct a research project identity at its owning boundary.
		* @param value - persisted or wire identity.
		* @returns branded project identity.
		*/
		const ResearchId = (value) => value;
		//#endregion
		//#region src/client/use-research-library.ts
		/** Library state, route loading and remote mutation coordination. */
		function useResearchLibrary({ api, t, projectId, onSelectProject }) {
			const [projects, setProjects] = (0, react.useState)([]);
			const [selected, setSelected] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const [filter, setFilter] = (0, react.useState)("all");
			const [viewMode, setViewMode] = (0, react.useState)("grid");
			const [sort, setSort] = (0, react.useState)("recent");
			const [composerOpen, setComposerOpen] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [pendingDelete, setPendingDelete] = (0, react.useState)(null);
			const [deleteBusy, setDeleteBusy] = (0, react.useState)(false);
			const [projectLoading, setProjectLoading] = (0, react.useState)(false);
			const openProject = (0, react.useCallback)((project) => {
				setSelected(project === null ? null : hydrateResearchProject(project));
				onSelectProject?.(project?.id ?? null);
			}, [onSelectProject]);
			const apiRef = (0, react.useRef)(api);
			apiRef.current = api;
			const refresh = (0, react.useCallback)(async (nextQuery) => {
				setError(null);
				try {
					const next = (await apiRef.current.list(nextQuery)).map(hydrateResearchProject);
					setProjects(next);
					setSelected((current) => {
						if (current === null) return null;
						const listed = next.find((item) => item.id === current.id);
						return listed !== void 0 && listed.updatedAt > current.updatedAt ? listed : current;
					});
				} catch (cause) {
					setError(messageOf(cause));
				}
			}, []);
			(0, react.useEffect)(() => {
				if (selected !== null) return;
				const timer = window.setTimeout(() => {
					refresh(query);
				}, query === "" ? 0 : 250);
				return () => {
					window.clearTimeout(timer);
				};
			}, [
				query,
				refresh,
				selected
			]);
			(0, react.useEffect)(() => {
				if (projectId === void 0) return;
				if (projectId === null) {
					setSelected(null);
					setProjectLoading(false);
					return;
				}
				const listed = projects.find((item) => item.id === projectId);
				if (listed !== void 0) {
					setSelected((current) => current?.id === listed.id && current.updatedAt >= listed.updatedAt ? current : hydrateResearchProject(listed));
					setProjectLoading(false);
					return;
				}
				let active = true;
				setProjectLoading(true);
				apiRef.current.get(ResearchId(projectId)).then((project) => {
					if (!active) return;
					if (project === null) {
						setSelected(null);
						setError(t("empty.noMatch"));
					} else setSelected(hydrateResearchProject(project));
					setProjectLoading(false);
				}, (cause) => {
					if (active) {
						setError(messageOf(cause));
						setProjectLoading(false);
					}
				});
				return () => {
					active = false;
				};
			}, [
				projectId,
				projects,
				t
			]);
			const requestDelete = (0, react.useCallback)((target) => {
				setError(null);
				setPendingDelete(target);
			}, []);
			const confirmDelete = (0, react.useCallback)(async () => {
				if (pendingDelete === null || deleteBusy) return;
				setDeleteBusy(true);
				setError(null);
				try {
					await api.delete(pendingDelete.id);
					if (selected?.id === pendingDelete.id) openProject(null);
					setPendingDelete(null);
					await refresh(query);
				} catch (cause) {
					setError(messageOf(cause));
				} finally {
					setDeleteBusy(false);
				}
			}, [
				api,
				deleteBusy,
				openProject,
				pendingDelete,
				query,
				refresh,
				selected?.id
			]);
			const visible = (0, react.useMemo)(() => {
				const phaseMatch = (phase) => filter === "all" || filter === "planning" && ["planning", "awaiting_plan_confirm"].includes(phase) || filter === "investigating" && [
					"investigating",
					"ready_for_report",
					"writing"
				].includes(phase) || filter === "done" && ["done", "incomplete"].includes(phase);
				const filtered = projects.filter((project) => phaseMatch(project.phase));
				return sort === "title" ? filtered.toSorted((left, right) => left.title.localeCompare(right.title)) : filtered.toSorted((left, right) => right.updatedAt - left.updatedAt);
			}, [
				filter,
				projects,
				sort
			]);
			const updateSelected = (0, react.useCallback)((project) => {
				const next = hydrateResearchProject(project);
				setSelected((current) => current?.id === next.id && current.updatedAt === next.updatedAt ? current : next);
				setProjects((current) => current.map((item) => item.id === next.id ? next : item));
			}, []);
			const createProject = async (request) => {
				const project = await api.start(request);
				setComposerOpen(false);
				await refresh(query);
				openProject(project);
			};
			return {
				projects,
				selected,
				query,
				setQuery,
				filter,
				setFilter,
				viewMode,
				setViewMode,
				sort,
				setSort,
				composerOpen,
				setComposerOpen,
				busy,
				setBusy,
				error,
				setError,
				pendingDelete,
				setPendingDelete,
				deleteBusy,
				projectLoading,
				visible,
				openProject,
				refresh,
				requestDelete,
				confirmDelete,
				updateSelected,
				createProject
			};
		}
		//#endregion
		//#region src/client/ResearchView.tsx
		/** Codemini-aligned Deep Research library and its project/delete presentation. */
		/** Render the research library, reviewable plan, live investigation board, and report. */
		function ResearchView({ t, projectId, onSelectProject, onClose, ...api }) {
			const { selected, query, setQuery, filter, setFilter, viewMode, setViewMode, sort, setSort, composerOpen, setComposerOpen, busy, setBusy, error, setError, pendingDelete, setPendingDelete, deleteBusy, projectLoading, visible, openProject, requestDelete, confirmDelete, updateSelected, createProject } = useResearchLibrary({
				api,
				t,
				projectId,
				onSelectProject
			});
			if (projectId !== void 0 && projectId !== null && selected === null && projectLoading) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: views_module_css_default.shell,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: views_module_css_default.content,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.projectLoading,
						role: "status",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {
							className: views_module_css_default.spinner,
							size: 16
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("phase.planning") })]
					})
				})
			});
			if (selected !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: views_module_css_default.shell,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResearchWorkspace, {
					project: selected,
					api,
					t,
					onChange: updateSelected,
					onBack: () => {
						openProject(null);
					},
					onDelete: () => {
						requestDelete({
							id: selected.id,
							title: selected.title
						});
					},
					error,
					setError
				}), pendingDelete === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DeleteConfirmDialog, {
					pending: pendingDelete,
					busy: deleteBusy,
					t,
					onCancel: () => {
						if (!deleteBusy) setPendingDelete(null);
					},
					onConfirm: () => {
						confirmDelete();
					}
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: views_module_css_default.shell,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.content,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"data-deepresearch-view": "",
								hidden: true
							}),
							onClose === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: views_module_css_default.libraryTopBar,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									className: views_module_css_default.backButton,
									type: "button",
									"aria-label": t("library.backAria"),
									onClick: onClose,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { size: 15 }), t("library.back")]
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: views_module_css_default.toolbar,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: views_module_css_default.filters,
									"aria-label": t("library.filterAria"),
									children: [
										["all", "filter.all"],
										["planning", "filter.planning"],
										["investigating", "filter.investigating"],
										["done", "filter.done"]
									].map(([id, key]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: filter === id ? views_module_css_default.activeChip : views_module_css_default.chip,
										type: "button",
										"aria-current": filter === id ? "page" : void 0,
										onClick: () => {
											setFilter(id);
										},
										children: t(key)
									}, id))
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: views_module_css_default.toolbarActions,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: views_module_css_default.search,
											value: query,
											onChange: (event) => {
												setQuery(event.target.value);
											},
											placeholder: t("toolbar.search"),
											"aria-label": t("toolbar.searchAria")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											className: views_module_css_default.select,
											value: sort,
											onChange: (event) => {
												setSort(event.target.value);
											},
											"aria-label": t("toolbar.sortAria"),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "recent",
												children: t("toolbar.sortRecent")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "title",
												children: t("toolbar.sortTitle")
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: views_module_css_default.viewToggle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: views_module_css_default.iconButton,
												type: "button",
												"aria-label": t("toolbar.gridView"),
												"aria-pressed": viewMode === "grid",
												"data-active": viewMode === "grid",
												onClick: () => {
													setViewMode("grid");
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutline16, { size: 16 })
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: views_module_css_default.iconButton,
												type: "button",
												"aria-label": t("toolbar.listView"),
												"aria-pressed": viewMode === "list",
												"data-active": viewMode === "list",
												onClick: () => {
													setViewMode("list");
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconListPenOutline16, { size: 16 })
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											className: views_module_css_default.primaryButton,
											type: "button",
											onClick: () => {
												setError(null);
												setComposerOpen(true);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 15 }), t("action.start")]
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: views_module_css_default.library,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("header", {
										className: views_module_css_default.libraryTitle,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("library.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("library.projectCount", { count: visible.length }) })] })
									}),
									error === null || composerOpen ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: views_module_css_default.error,
										role: "alert",
										children: error
									}),
									visible.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: views_module_css_default.emptyState,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												"aria-hidden": "true",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkle16, { size: 22 })
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: query === "" ? t("empty.none") : t("empty.noMatch") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: query === "" ? t("empty.hintStart") : t("empty.hintNoMatch") }),
											query === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												className: views_module_css_default.primaryButton,
												type: "button",
												onClick: () => {
													setComposerOpen(true);
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 15 }), t("action.start")]
											}) : null
										]
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: viewMode === "grid" ? views_module_css_default.projectGrid : views_module_css_default.projectList,
										children: [viewMode === "grid" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											className: views_module_css_default.createCard,
											type: "button",
											onClick: () => {
												setComposerOpen(true);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 22 }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("action.startShort") })]
										}) : null, visible.map((project) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProjectCard, {
											project,
											list: viewMode === "list",
											t,
											onOpen: () => {
												openProject(project);
											},
											onDelete: () => {
												requestDelete({
													id: project.id,
													title: project.title
												});
											}
										}, project.id))]
									})
								]
							})
						]
					}),
					composerOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResearchComposer, {
						busy,
						error,
						setBusy,
						t,
						onClose: () => {
							if (!busy) setComposerOpen(false);
						},
						onCreate: createProject,
						setError
					}) : null,
					pendingDelete === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DeleteConfirmDialog, {
						pending: pendingDelete,
						busy: deleteBusy,
						t,
						onCancel: () => {
							if (!deleteBusy) setPendingDelete(null);
						},
						onConfirm: () => {
							confirmDelete();
						}
					})
				]
			});
		}
		function ProjectCard({ project, list, t, onOpen, onDelete }) {
			const [emoji, title] = splitEmoji(project.title);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
				className: views_module_css_default.projectCard,
				"data-list": list || void 0,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: views_module_css_default.cardOpen,
						type: "button",
						onClick: onOpen,
						"aria-label": t("card.openAria", { title: project.title })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: views_module_css_default.cardEmoji,
						children: emoji || /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkle16, { size: 25 })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: views_module_css_default.cardInfo,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: title }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: project.goal || project.question }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: views_module_css_default.phase,
								"data-phase": project.runState === "paused" ? "aborted" : project.phase,
								children: phaseLabel(project, t)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("card.evidence", {
								count: project.evidence.length,
								date: formatDate(project.updatedAt)
							}) })] })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: views_module_css_default.deleteButton,
						type: "button",
						"aria-label": t("workspace.delete"),
						onClick: (event) => {
							event.stopPropagation();
							onDelete();
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 15 })
					})
				]
			});
		}
		function DeleteConfirmDialog({ pending, busy, t, onCancel, onConfirm }) {
			const [, title] = splitEmoji(pending.title);
			const name = title || pending.title;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: views_module_css_default.confirmBackdrop,
				role: "presentation",
				onClick: () => {
					if (!busy) onCancel();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: views_module_css_default.confirmCard,
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": "delete-research-title",
					onClick: (event) => {
						event.stopPropagation();
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: views_module_css_default.confirmMark,
							"aria-hidden": "true"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							id: "delete-research-title",
							children: t("delete.title")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("delete.body", { title: name }) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: views_module_css_default.confirmActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: views_module_css_default.confirmCancel,
								type: "button",
								disabled: busy,
								onClick: onCancel,
								children: t("action.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: views_module_css_default.confirmDelete,
								type: "button",
								disabled: busy,
								onClick: onConfirm,
								children: [busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, {
									className: views_module_css_default.spinner,
									size: 14
								}) : null, t("delete.confirm")]
							})]
						})
					]
				})
			});
		}
		//#endregion
		//#region \0dsh-css:src/client/overlay.module.css.mjs
		const css = ".aJ65sq_overlay{background:var(--dsw-alias-bg-base);pointer-events:auto;flex-direction:column;min-height:0;display:flex;position:absolute;inset:0;overflow:hidden}.aJ65sq_crash{border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 24%, var(--dsw-alias-border-l1));background:var(--dsw-alias-bg-layer-1);width:min(520px,100% - 48px);box-shadow:var(--dsw-alias-shadow-md);border-radius:10px;gap:10px;margin:auto;padding:22px 24px;display:grid}.aJ65sq_crash h3{margin:0;font-size:16px;font-weight:620}.aJ65sq_crash p{color:var(--dsw-alias-label-secondary);margin:0;font-size:13px;line-height:1.55}.aJ65sq_crash code{border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 24%, var(--dsw-alias-border-l1));background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;word-break:break-word;border-radius:8px;padding:10px 12px;font-size:11px;line-height:1.45}.aJ65sq_crash button{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);cursor:pointer;border:0;border-radius:8px;justify-self:start;margin-top:4px;padding:8px 14px;font-size:12px;font-weight:600;transition:opacity .18s,background-color .18s}.aJ65sq_crash button:hover{opacity:.86}.aJ65sq_crash button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}@media (prefers-reduced-motion:reduce){.aJ65sq_crash button{transition:none}}";
		const tagId = "@deepseek-ai/dsh-deepresearch/overlay.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-deepresearch";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var overlay_module_css_default = {
			"crash": "aJ65sq_crash",
			"overlay": "aJ65sq_overlay"
		};
		//#endregion
		//#region src/client/DeepResearchOverlay.tsx
		/** Frame-wide overlay hosting the Deep Research library and workspace. */
		/** Keep render failures inside the overlay instead of abdicating the shell slot. */
		var ResearchViewCrashBoundary = class extends react.Component {
			state = { error: null };
			static getDerivedStateFromError(error) {
				return { error };
			}
			render() {
				if (this.state.error === null) return this.props.children;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: overlay_module_css_default.crash,
					role: "alert",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: this.props.t("overlay.crashTitle") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: this.props.t("overlay.crashHint") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: this.state.error.message }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => {
								this.setState({ error: null });
								this.props.onReset();
							},
							children: this.props.t("overlay.crashBack")
						})
					]
				});
			}
		};
		/** Render the research workspace when the sidebar entry opens the overlay. */
		function DeepResearchOverlay({ t, ...face }) {
			const open = (0, react.useSyncExternalStore)(face.store.subscribe, face.store.getOpen);
			const projectId = (0, react.useSyncExternalStore)(face.store.subscribe, face.store.getProjectId);
			if (!open) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: overlay_module_css_default.overlay,
				"data-deepresearch-overlay": true,
				role: "dialog",
				"aria-modal": "true",
				"aria-label": t("view.deepResearch"),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResearchViewCrashBoundary, {
					t,
					onReset: () => {
						face.store.setProjectId(null);
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResearchView, {
						t,
						...face.api,
						projectId,
						onSelectProject: (id) => {
							face.store.setProjectId(id);
						},
						onClose: () => {
							face.store.setOpen(false);
						}
					})
				})
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services: the typed Remote client, slot registry, and locale service. */
		const inject = [
			"remote",
			"slots",
			"locale"
		];
		/** Return one successful Remote value or surface the carrier failure. */
		function remoteValue(operation, result) {
			if (!result.ok) throw new Error(`${operation} failed: ${result.error.code}: ${result.error.message}`);
			return result.value;
		}
		function createApi(clientRemote, deepResearch) {
			return {
				list: async (query) => remoteValue("deepResearch.list", await deepResearch.list({ ...query === "" ? {} : { query } })).projects.map(hydrateResearchProject),
				get: async (id) => {
					const project = remoteValue("deepResearch.get", await deepResearch.get({ id }));
					return project === null ? null : hydrateResearchProject(project);
				},
				start: async (request) => hydrateResearchProject(remoteValue("deepResearch.start", await deepResearch.start(request))),
				updatePlan: async (request) => hydrateResearchProject(remoteValue("deepResearch.updatePlan", await deepResearch.updatePlan(request))),
				confirmPlan: async (id) => hydrateResearchProject(remoteValue("deepResearch.confirmPlan", await deepResearch.confirmPlan({ id }))),
				complete: async (request) => hydrateResearchProject(remoteValue("deepResearch.complete", await deepResearch.complete(request))),
				fail: async (id, reason, aborted) => hydrateResearchProject(remoteValue("deepResearch.fail", await deepResearch.fail({
					id,
					reason,
					aborted
				}))),
				resume: async (id) => hydrateResearchProject(remoteValue("deepResearch.resume", await deepResearch.resume({ id }))),
				writeReport: async (id) => hydrateResearchProject(remoteValue("deepResearch.writeReport", await deepResearch.writeReport({ id }))),
				delete: async (id) => remoteValue("deepResearch.delete", await deepResearch.delete({ id })),
				subscribeProgress: (listener) => clientRemote.$on("deepResearch/progress", (project) => {
					listener(hydrateResearchProject(project));
				})
			};
		}
		/**
		* Mount the deep-research Remote namespace and its global sidebar/overlay surfaces.
		* @param ctx - Web client root carrying Remote, slot, and locale services.
		* @returns disposer after the namespace is ready.
		*/
		async function apply(ctx) {
			const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "deepresearch: dictionaries");
			const store = createDeepResearchUiStore();
			const host = ctx;
			if (typeof host.provide === "function") host.provide("deepresearch-workbench", {
				open: () => {
					store.setOpen(true);
				},
				describe: () => ({
					product: "Deep Research Anything",
					service: "deepresearch-workbench"
				})
			});
			const view = ctx.inject(["remote.deepResearch", "slots"], (remoteCtx) => {
				const api = createApi(ctx.remote, remoteCtx.remote.deepResearch);
				const face = () => ({
					store,
					api
				});
				remoteCtx.slots.inject("shell.overlay", () => remoteCtx.slots.register({
					name: "shell.overlay",
					id: "deepresearch",
					order: 20,
					locale: NS,
					inject: face
				}, DeepResearchOverlay));
			});
			await view;
			return async () => {
				await view.dispose();
				await disposeRemote();
			};
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map