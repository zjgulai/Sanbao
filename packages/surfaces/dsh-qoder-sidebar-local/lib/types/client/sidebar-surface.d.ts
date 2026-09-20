/**
 * 把「本会话活动」装进**原生右栏**（`@deepseek-ai/dsh-client-ui-sidebar-right`）。
 *
 * 两条登记（与官方 `ui-sidebar-documentpreview` 完全同一条公开路径）：
 *   阶段一 `ctx.sidebarRightTabs.register({ id, kind, title, guide })` —— 类型静态面；
 *   阶段二 `ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id, inject }, Body)`
 *           —— 标签体，且 `inject(sessionId)` 把**本会话的事件流**递进标签体。
 *
 * `guide` 条目是外壳指南页上的一张门卡；本机指南页还有别的类型贡献的条目，
 * 所以默认页是外壳的指南，不是本包——首次展开由 {@link bringToFrontOnFirstExpand}
 * 把本页补到前台。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** 标签类型的身份：同时是标签体登记时的 key。 */
export declare const SIDEBAR_ID = "dsh-qoder-sidebar-local/activity";
/** 标签类型判别符：`openTab` 用它点名。 */
export declare const SIDEBAR_KIND = "qoder-activity";
/**
 * 登记本页为原生右栏的一个标签类型。
 * @param ctx - 客户端根上下文。
 * @returns 卸载函数（三个登记的复核器）。
 */
export declare function registerSidebarSurface(ctx: ClientContext): () => void;
