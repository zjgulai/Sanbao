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
import {
  MIN_RIGHTBAR_WIDTH,
  clampRightbarWidth,
  officialRightbarWidth,
} from './rightbar-width';
import type { RightbarPref } from './rightbar-width-pref';

/** 探测结论落在 documentElement 上的属性名（验收按它点名，不靠日志）。 */
export const WRITER_PROBE_ATTR = 'data-lute-rightbar-writer';

/** 拖把手后采纳结果时的容差：小于 2px 的抖动不算用户改过宽度。 */
const ADOPT_TOLERANCE = 2;
/** 官方拖拽把手的 data 锚点（AppFrame.tsx:109，不含类名哈希）。 */
const HANDLE_SELECTOR = '[data-side]';
/** 右栏列的 data 锚点（AppFrame.tsx:51）；它的父元素就是那个三列 grid。 */
const COLUMN_SELECTOR = '[data-rightbar-col]';

/** 官方宽度写入口的窄面。 */
export interface RightbarWriter {
  /** 走官方动作写入宽度；返回是否真的写成功。 */
  set(px: number): boolean;
}

/**
 * 从 layout 服务对象上探出官方宽度写入口。
 * @param layout - `ctx.get('layout')` 的返回值，形状由外壳决定。
 * @returns 可用的写入口；探不到时为 null。
 */
export function findRightbarWriter(layout: unknown): RightbarWriter | null {
  if (layout === null || typeof layout !== 'object') return null;
  for (const holder of candidates(layout as Record<string, unknown>)) {
    if (typeof holder.setRightbar !== 'function') continue;
    // 调用时才重读：外壳热替换动作集后，冻住旧函数会写进已经废弃的 store。
    return {
      set: (px: number): boolean => {
        try {
          (holder.setRightbar as (value: number) => void)(px);
          return true;
        } catch {
          return false;
        }
      },
    };
  }
  return null;
}

/**
 * 候选持有者：动作集挂在 `LayoutController` 的私有字段上，字段名属于实现细节。
 * 因此不猜字段名，而是把服务对象自身与它**一层**属性值都当候选，
 * 哪个对象上真有可调用的 `setRightbar` 就用它；一个都没有就判不可达。
 */
function candidates(layout: Record<string, unknown>): Record<string, unknown>[] {
  const list: Record<string, unknown>[] = [layout];
  for (const value of Object.values(layout)) {
    if (value !== null && typeof value === 'object') list.push(value as Record<string, unknown>);
  }
  return list;
}

export interface AttachDeps {
  /** 惰性取 layout 服务（裸读未声明服务在 cordis 里会抛，只能走 `ctx.get`）。 */
  readonly getLayout: () => unknown;
  readonly doc: Document;
  readonly win: Window;
  readonly pref: RightbarPref;
}

/** 官方写入口是否可达（验收读属性，不读日志）。 */
export type WriterVerdict = 'official' | 'unreachable';

/** 「这一次要不要写、写多少」的判定结果。 */
export type WritePlan =
  | { readonly kind: "skip"; readonly reason: "no-pref" | "clamped-to-null" | "already-applied" }
  | { readonly kind: "write"; readonly px: number };

/**
 * 落地点的核心判定：偏好存在、钳得过、且不是自己刚写过的那一值，才写。
 *
 * 「未设偏好就一个像素都不写」是这里最要紧的一条：外壳首开按视口 45% 自己算，
 * 抢先写一份就等于把一个没人点过的设置变成事实上的所有者。
 */
export function planRightbarWrite(
  stored: number | null,
  innerWidth: number,
  lastApplied: number | null,
): WritePlan {
  if (stored === null) return { kind: "skip", reason: "no-pref" };
  const clamped = clampRightbarWidth(stored, innerWidth);
  if (clamped === null) return { kind: "skip", reason: "clamped-to-null" };
  if (clamped === lastApplied) return { kind: "skip", reason: "already-applied" };
  return { kind: "write", px: clamped };
}

/**
 * 挂上宽度落地点：把偏好写进外壳的 store，并把外壳自己的改动（拖把手）采纳回偏好。
 * @param deps - layout 取用器、文档、窗口与偏好句柄。
 * @returns 卸载函数。
 */
export function attachRightbarWidth({ getLayout, doc, win, pref }: AttachDeps): () => void {
  /** 最近一次由我们写进去的宽度：用来分辨「官方自己变了」与「我们刚写的」。 */
  let lastApplied: number | null = null;
  let dragging = false;
  /** 拖拽抬手后等待外壳提交终值：只认抬手后的第一次样式变更。 */
  let awaitingDragCommit = false;
  /** frame 由外壳异步挂载，第一次 attach 时可能还没有；每次 apply 再试一次。 */
  let observing = false;

  const apply = (): void => {
    if (!observing) observing = bindObserver(doc, observer);
    const writer = findRightbarWriter(getLayout());
    doc.documentElement.setAttribute(WRITER_PROBE_ATTR, writer === null ? 'unreachable' : 'official');
    if (writer === null) return;
    const plan = planRightbarWrite(pref.read(), win.innerWidth, lastApplied);
    if (plan.kind === "write" && writer.set(plan.px)) lastApplied = plan.px;
  };

  /** 「跟随默认」：清偏好，并把外壳当前宽度显式送回官方默认值（外壳没有重置动作）。 */
  const resetToOfficial = (): void => {
    const writer = findRightbarWriter(getLayout());
    if (writer === null) return;
    const fallback = officialRightbarWidth(win.innerWidth);
    if (writer.set(fallback)) lastApplied = fallback;
  };

  const adopt = (): void => {
    const measured = measuredRightbarWidth(doc, win);
    if (measured === null) return;
    const stored = pref.read();
    if (stored !== null && Math.abs(measured - stored) <= ADOPT_TOLERANCE) return;
    if (lastApplied !== null && Math.abs(measured - lastApplied) <= ADOPT_TOLERANCE) return;
    pref.write(measured);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(HANDLE_SELECTOR) === null) return;
    dragging = true;
  };
  const onPointerUp = (): void => {
    if (!dragging) return;
    dragging = false;
    // 只在「抬手后的第一次提交」采纳。不能在抬手时直接读：把手在 pointerup 里
    // 才把最后一个 dx 提交给 store，样式要再过一次 React 渲染，抬手瞬间读到的
    // 是拖拽中的旧值。万一那次提交没动 style（宽度没变），观察器不会响——
    // 用两帧后的兜底收尾；两条路谁先到都只做一次（awaitingDragCommit 只清一次）。
    // rAF 在窗口隐藏时不跑，但拖拽本身要求窗口可见，这条兜底不会被挂死成错值。
    awaitingDragCommit = true;
    win.requestAnimationFrame(() => win.requestAnimationFrame(() => {
      if (!awaitingDragCommit) return;
      awaitingDragCommit = false;
      adopt();
    }));
  };

  // 外壳每次改宽度都会重写 frame 的内联轨道。**这里绝不能无条件采纳**（2026-09-20
  // 实机撞过）：我们自己 writer.set 之后外壳的这次重渲染同样会触发观察器，而回调里
  // 读到的计算样式可能还是旧轨道——无条件采纳会把刚写进去的偏好吃掉退回旧值
  // （P-52 mutation 收养链同型的自激回环）。所以观察器只做一件事：认领
  // 「拖拽抬手后的第一次提交」。
  const observer = new MutationObserver(() => {
    if (dragging) return;
    if (!awaitingDragCommit) return;
    awaitingDragCommit = false;
    adopt();
  });

  win.addEventListener('pointerdown', onPointerDown, true);
  win.addEventListener('pointerup', onPointerUp, true);
  win.addEventListener('resize', apply);
  const unsubscribe = pref.subscribe((px) => {
    lastApplied = null;
    if (px === null) resetToOfficial();
    else apply();
  });
  apply();

  return () => {
    observer.disconnect();
    unsubscribe();
    win.removeEventListener('pointerdown', onPointerDown, true);
    win.removeEventListener('pointerup', onPointerUp, true);
    win.removeEventListener('resize', apply);
    doc.documentElement.removeAttribute(WRITER_PROBE_ATTR);
  };
}

/**
 * 观察 frame 的 style 以采纳拖拽结果。frame 由外壳异步挂载，没找到时返回 false，
 * 由 apply 下次再试：写偏好那条路不依赖它，只有「读回外壳自己改的宽度」要等它到位。
 */
function bindObserver(doc: Document, observer: MutationObserver): boolean {
  const frame = frameOf(doc);
  if (frame === null) return false;
  observer.observe(frame, { attributes: true, attributeFilter: ['style'] });
  return true;
}

/** frame = 右栏列的父元素（三列所在的那个 grid 容器）。 */
function frameOf(doc: Document): HTMLElement | null {
  const col = doc.querySelector(COLUMN_SELECTOR);
  const parent = col?.parentElement ?? null;
  return parent instanceof HTMLElement ? parent : null;
}

/**
 * 实测右栏渲染宽度：读 frame 计算后的轨道末位（布局后一律是 px 用量值）。
 * 折叠态末轨为 0，判读不到——那不代表宽度是 0。
 */
export function measuredRightbarWidth(doc: Document, win: Window): number | null {
  const frame = frameOf(doc);
  if (frame === null) return null;
  const tracks = win.getComputedStyle(frame).gridTemplateColumns.trim().split(/\s+/);
  if (tracks.length < 3) return null;
  const last = Number.parseFloat(tracks[tracks.length - 1] ?? '');
  if (!Number.isFinite(last) || last < MIN_RIGHTBAR_WIDTH) return null;
  return Math.round(last);
}
