import { jsx } from "react/jsx-runtime";

import {
  HeroRootBrand,
  RootMark,
  SidebarRootName,
  installBrandCss,
} from "./brand.js";
import {
  createHeadlineSuppressor,
  type HeadlineSuppressor,
  type SuppressCode,
} from "./hero-title.js";
import { classSelector, resolveLiveAnchors } from "./live-selectors.js";
import { observePreviewText } from "./official-text.js";

/** Required Cordis services: the UI slot registry. */
export const inject = ["slots"];

/**
 * Minimal slot registry shape needed by the client surface.
 */
export interface SlotsService {
  inject(slot: string, register: () => unknown): unknown;
  register(options: { name: string; priority?: number }, component: unknown): unknown;
}

export interface ClientContext {
  slots: SlotsService;
  effect(fn: () => () => void, label: string): void;
}

const ANCHORS_STATE_ATTR = "dshRootBrandAnchors";

/** 校验选择器：写进 querySelector 的类名必须是安全标识符（避免抛出并整块跳过）。 */
const SELECTOR_SAFE = /^[A-Za-z0-9_-]+$/;

/**
 * 一次同步的结论。
 *
 * `ok` / `idle` **不是**缺陷：`idle` 表示「hero 还没挂载，本次无事可做」——空会话以外的
 * 页面上角标本来就不存在。把它算成 degraded 会让读数长期发红，而长期发红的读数会被无视。
 */
type SyncCode = "ok" | "idle" | "anchor-missing" | SuppressCode;

const NON_DEGRADED: ReadonlySet<SyncCode> = new Set<SyncCode>(["ok", "idle"]);

interface SyncOutcome {
  code: SyncCode;
  detail: string;
}

/**
 * 单次同步：解析锚点 → 找到官方角标 → 改写它的文案 → 按关系隐藏官方标题。
 *
 * 任何一步失败都不抛错（只降级），保证与版本无关的样式与品牌座位先落地：
 * 品牌标识比「官方标题有没有藏住」重要得多。
 */
function syncOnce(
  doc: Document,
  suppressor: HeadlineSuppressor,
  onBadge: (badge: HTMLElement) => void,
): SyncOutcome {
  const { anchors, missing } = resolveLiveAnchors(doc);
  const className = anchors.heroPreviewBadge;
  if (className === undefined || !SELECTOR_SAFE.test(className)) {
    return {
      code: "anchor-missing",
      detail: `官方角标锚未解析（${missing.join("、") || "（清单里没有这个键）"}）——官方样式表里没有可用的类名，本次不做任何 DOM 改写`,
    };
  }

  const badge = doc.querySelector<HTMLElement>(classSelector(className));
  if (badge === null) {
    return { code: "idle", detail: "hero 未挂载（非空会话页面），本次无事可做" };
  }

  onBadge(badge);
  const outcome = suppressor.apply(badge);
  if (outcome.code !== "ok") return { code: outcome.code, detail: outcome.detail };
  return { code: "ok", detail: outcome.detail };
}

/**
 * 首次同步 + 持续重试：官方样式标签与官方 hero **都可能晚于插件启动才出现**
 * （样式按需注入、hero 在空会话渲染时才挂载），因此观察整个文档子树的新增节点，
 * 每次新增都重新解析一次。
 *
 * 只在**结论变化**时才写读数与打日志：观察器对整棵文档生效，每次节点变动都打日志会
 * 把 Console 冲成噪音，而噪音里的红色读数等于没有读数。
 *
 * disposer 要还原三样东西（卸载后不留残余）：角标文案、被隐藏的官方标题、观察器。
 */
function watchAnchors(doc: Document): () => void {
  const suppressor = createHeadlineSuppressor();
  let disposePreview: (() => void) | undefined;
  let observedBadge: HTMLElement | undefined;
  let lastKey = "";

  const sync = (): void => {
    const outcome = syncOnce(doc, suppressor, (badge) => {
      // 角标节点被 React 换掉时要跟着换观察对象：旧节点已脱离文档，挂在它上面的
      // 观察器不再起作用，新节点上的文案就永远不会被改写。
      if (observedBadge === badge) return;
      disposePreview?.();
      observedBadge = badge;
      badge.dataset.dshRbPreview = "1";
      disposePreview = observePreviewText(badge);
    });

    const key = `${outcome.code}|${outcome.detail}`;
    if (key === lastKey) return;
    lastKey = key;

    const degraded = !NON_DEGRADED.has(outcome.code);
    doc.documentElement.dataset[ANCHORS_STATE_ATTR] = degraded
      ? `degraded:${outcome.code}`
      : "resolved";
    if (degraded) console.warn(`[dsh-root-brand] ${outcome.detail}`);
    else console.info(`[dsh-root-brand] anchors resolved（${outcome.detail}）`);
  };

  sync();
  const observer = new MutationObserver(sync);
  observer.observe(doc.documentElement, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    disposePreview?.();
    observedBadge?.removeAttribute("data-dsh-rb-preview");
    suppressor.restore();
  };
}

/**
 * Override the three shipped brand seats at a lower shadowing priority than
 * the official registrations (priority 0): the slot registry elects the
 * lowest-priority entry, so the ROOT identity renders instead of the official
 * fish + wordmark, without disabling any official loader line.
 */
export function apply(ctx: ClientContext): void {
  const register = (name: string, component: unknown) =>
    ctx.slots.inject(name, () => ctx.slots.register({ name, priority: -100 }, component));

  register("sidebar.brand.mark", RootMark);
  register("sidebar.brand.name", SidebarRootName);
  register("conversation.hero.brand.mark", HeroRootBrand);

  ctx.effect(() => installBrandCss(), "dsh-root-brand: brand css");
  ctx.effect(() => watchAnchors(document), "dsh-root-brand: live anchors");
}

export { HeroRootBrand, RootMark, SidebarRootName };
