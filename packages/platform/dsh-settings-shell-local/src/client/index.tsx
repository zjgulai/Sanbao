/**
 * dsh-settings-shell · 客户端半边。
 *
 * 两件事，按可靠性分层（低层失效不影响高层）：
 *   L1 样式层（shell.css，纯 CSS 注入）：面板尺寸 + **导航滚动** —— 修掉
 *      「18 项导航里最后两项被裁成 1px、完全点不到」。这一层不依赖任何服务。
 *   L2 分组层（本文件）：从 `ctx.slots.entries("settings.section")` 读**真实注册表**，
 *      按 `groups.ts` 的登记表注入分组标题。读不到注册表就只留 L1。
 *
 * 稳定性纪律：
 *   - 数量不一致时**放弃注入**（宁可没有分组，也不能把标题插错位置）。
 *   - 期望状态已成立时**不写 DOM**（MutationObserver 监听 body，写就会自激）。
 *   - 任何异常都不抛出：记 console.warn + 诊断属性，最坏表现是保持官方原样。
 */

import "../client/shell.css";

import {
  GROUP_MARKER_ATTR,
  recordShellState,
  resolveSettingsShell,
  type SettingsShellDom,
} from "./anchors.js";
import { groupLang, planGroups, type PlannedGroup } from "./groups.js";

/** 必需的 Cordis 服务（读设置 section 注册表）。 */
export const inject = ["slots"];

/** 注册表条目里我们需要的形状（只读，防御式）。 */
interface SlotEntryLike {
  readonly options?: { readonly id?: string } | undefined;
}

/** 最小 slots 服务形状：只用到 `entries`。 */
export interface SlotsService {
  entries?(key: string): readonly SlotEntryLike[];
}

export interface ClientContext {
  slots?: SlotsService | undefined;
  effect(fn: () => () => void, label: string): void;
}

/**
 * 跨次同步的记忆：是否**曾经**成功解析过设置面板。
 * 用来把「设置页没开」与「面板结构变了」分开（见 `anchors.ts`）。
 * 状态放在实例里而不是模块级，避免多个文档/多次测试互相污染。
 */
export interface ShellSyncState {
  sawShell: boolean;
}

export function createShellSyncState(): ShellSyncState {
  return { sawShell: false };
}

/** 设置页 section 的 slot 名。 */
const SECTION_SLOT = "settings.section";

/** 观察节流：一帧内合并多次 DOM 变更。 */
function scheduleFrame(run: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      run();
    });
    return;
  }
  setTimeout(run, 16);
}

/** 从 slots 注册表读 section id（顺序 = 渲染顺序，`entries` 契约保证）。 */
function readSectionIds(slots: SlotsService | undefined): readonly string[] | undefined {
  const entries = slots?.entries;
  if (typeof entries !== "function") return undefined;
  try {
    const rows = entries.call(slots, SECTION_SLOT);
    const ids: string[] = [];
    for (const row of rows) {
      const id = row?.options?.id;
      if (typeof id === "string" && id.length > 0) ids.push(id);
    }
    return ids;
  } catch {
    return undefined;
  }
}

/** 现有分组标题（只认 navList 的直接子节点，避免误删嵌套内容）。 */
function existingGroupTitles(dom: SettingsShellDom): HTMLElement[] {
  return Array.from(dom.navList.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.hasAttribute(GROUP_MARKER_ATTR),
  );
}

/** 期望状态是否已经成立：数量、组 id、文案、锚点按钮逐项一致。 */
function groupsUpToDate(dom: SettingsShellDom, planned: readonly PlannedGroup[]): boolean {
  const existing = existingGroupTitles(dom);
  if (existing.length !== planned.length) return false;
  for (let index = 0; index < planned.length; index += 1) {
    const node = existing[index];
    const plan = planned[index];
    if (node === undefined || plan === undefined) return false;
    if (node.getAttribute(GROUP_MARKER_ATTR) !== plan.group.id) return false;
    if ((node.textContent ?? "") !== plan.title) return false;
    // 标题后面紧跟的那一个节点必须是该组第一个成员按钮
    if (node.nextElementSibling !== dom.buttons[plan.startIndex]) return false;
  }
  return true;
}

/**
 * 注入分组标题。已成立则**不触碰 DOM**（返回 false），
 * 这是避免 MutationObserver 自激的关键。
 * @returns 是否发生了写入。
 */
function applyGroups(dom: SettingsShellDom, planned: readonly PlannedGroup[]): boolean {
  if (groupsUpToDate(dom, planned)) return false;

  for (const node of existingGroupTitles(dom)) node.remove();

  for (const plan of planned) {
    const anchor = dom.buttons[plan.startIndex];
    if (anchor === undefined || anchor.parentElement !== dom.navList) continue;
    const title = dom.navList.ownerDocument.createElement("div");
    title.setAttribute(GROUP_MARKER_ATTR, plan.group.id);
    title.textContent = plan.title;
    dom.navList.insertBefore(title, anchor);
  }
  return true;
}

/**
 * 单次同步：解析、校验、注入，并把状态写进诊断属性后返回。
 * 导出供用例直接驱动各分支（含失败分支 —— 只跑主路径等于没测）。
 */
export function syncShell(
  doc: Document,
  slots: SlotsService | undefined,
  state: ShellSyncState = createShellSyncState(),
): string {
  const resolution = resolveSettingsShell(doc, { sawShellBefore: state.sawShell });

  let next: string;
  if (resolution.kind === "absent") {
    // 设置页没开是正常状态，不是失败 —— 与 drift 必须分开。
    next = "absent";
  } else if (resolution.kind === "drift") {
    console.warn(`[dsh-settings-shell] settings shell drift: ${resolution.reason}`);
    next = `drift:${resolution.reason}`;
  } else {
    state.sawShell = true;
    next = groupShell(resolution.dom, slots, doc);
  }

  recordShellState(doc, next);
  return next;
}

/** 分组注入的正文（解析已成功后调用）。 */
function groupShell(
  dom: SettingsShellDom,
  slots: SlotsService | undefined,
  doc: Document,
): string {
  const sectionIds = readSectionIds(slots);

  if (sectionIds === undefined) {
    // 注册表读不到：只保留 CSS 层（尺寸与滚动仍生效），不猜 DOM 顺序。
    return "ungrouped:no-registry";
  }
  if (sectionIds.length !== dom.buttons.length) {
    // 注册表与 DOM 数量不一致：**放弃注入**，避免把标题插到错误的位置。
    console.warn(
      `[dsh-settings-shell] section count mismatch: registry=${sectionIds.length} dom=${dom.buttons.length}; grouping skipped`,
    );
    return `ungrouped:count ${sectionIds.length}!=${dom.buttons.length}`;
  }

  const plan = planGroups(sectionIds, groupLang(doc));
  if (plan.kind === "none") {
    // 不该分组（只有一个有效组）或**分组会错位**（某组被别的组打断）：
    // 清掉既有标题、保持官方原样，而不是错着显示。
    for (const node of existingGroupTitles(dom)) node.remove();
    if (!plan.reason.startsWith("single")) {
      console.warn(`[dsh-settings-shell] grouping refused: ${plan.reason}`);
    }
    return `ungrouped:${plan.reason}`;
  }

  applyGroups(dom, plan.groups);
  return `grouped:${plan.groups.length}`;
}

/** 安装观察器并做首次同步；返回 disposer。 */
export function installSettingsShell(
  doc: Document,
  slots: SlotsService | undefined,
): () => void {
  let disposed = false;
  let scheduled = false;
  const state = createShellSyncState();

  const run = (): void => {
    if (disposed) return;
    try {
      syncShell(doc, slots, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[dsh-settings-shell] sync failed: ${message}`);
      recordShellState(doc, `error:${message}`);
    }
  };

  const schedule = (): void => {
    if (disposed || scheduled) return;
    scheduled = true;
    scheduleFrame(() => {
      scheduled = false;
      run();
    });
  };

  run();

  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true });

  return () => {
    disposed = true;
    observer.disconnect();
    // 只回收自己插入的节点，不动官方结构。
    for (const node of doc.querySelectorAll(`[${GROUP_MARKER_ATTR}]`)) node.remove();
    delete doc.documentElement.dataset.dshSettingsShell;
  };
}

export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => installSettingsShell(document, ctx.slots),
    "dsh-settings-shell: nav groups",
  );
}
