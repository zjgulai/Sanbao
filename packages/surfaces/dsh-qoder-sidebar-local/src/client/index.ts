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
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { attachRightbarWidth } from './rightbar-width-writer'
import { createRightbarPref } from './rightbar-width-pref'
import { registerRightbarWidthSettings } from './rightbar-width-settings'
import { registerSidebarSurface } from './sidebar-surface'

export const name = 'qoder-sidebar-local'
export const inject = ['slots', 'sidebarRightTabs', 'sessions']

export function apply(ctx: ClientContext): void {
  // 偏好只有一个家：设置行与落地面共用同一个句柄（同一个 localStorage 键）。
  const pref = createRightbarPref(window.localStorage)

  ctx.effect(() => registerSidebarSurface(ctx), 'qoder-sidebar-local: activity tab')
  ctx.effect(
    () => registerRightbarWidthSettings(ctx, pref),
    'qoder-sidebar-local: rightbar width setting',
  )
  ctx.effect(
    () =>
      attachRightbarWidth({
        // layout 不是本包声明的服务：裸读 `ctx.layout` 在 cordis 里会抛，
        // 所以每次用到时走文档化的 `ctx.get`，取不到就交回官方默认宽度。
        getLayout: () => lookupLayout(ctx),
        doc: document,
        win: window,
        pref,
      }),
    'qoder-sidebar-local: rightbar width writer',
  )
}

/** 可读可不可读的 layout 服务：探测式读取，不抛。 */
function lookupLayout(ctx: ClientContext): unknown {
  try {
    const get = (ctx as unknown as { get?: (name: string) => unknown }).get
    return typeof get === 'function' ? get.call(ctx, 'layout') : undefined
  } catch {
    return undefined
  }
}
