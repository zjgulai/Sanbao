/**
 * Browser-half entry for dsh-qoder-sidebar-local.
 *
 * 三个面：
 *   1. **原生右栏里的「活动」页**（`ui-sidebar-right` 的标签类型 + 标签体）——
 *      它不是常驻看板，渲染的是**本会话实际做过什么**（见 `session-activity.ts`），
 *      空白会话里它就是空的。
 *   2. 设置页的「右侧栏宽度」偏好行（`settings.general.item` 座位）。
 *   3. 宽度落地面：把那一行的值走官方 `setRightbar` 写进外壳布局（见 `rightbar-width-writer.ts`）。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export declare const name = "qoder-sidebar-local";
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
