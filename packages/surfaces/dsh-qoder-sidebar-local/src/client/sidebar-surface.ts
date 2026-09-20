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
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { SidebarBody } from './sidebar-body'
import { activitySource, type ActivityEventEntry, type ActivitySource } from './session-activity'
import { nativeRightbar, nativeSlots, nativeTabRegistry } from './native-rightbar'

/** 标签类型的身份：同时是标签体登记时的 key。 */
export const SIDEBAR_ID = 'dsh-qoder-sidebar-local/activity'
/** 标签类型判别符：`openTab` 用它点名。 */
export const SIDEBAR_KIND = 'qoder-activity'

/**
 * 登记本页为原生右栏的一个标签类型。
 * @param ctx - 客户端根上下文。
 * @returns 卸载函数（三个登记的复核器）。
 */
export function registerSidebarSurface(ctx: ClientContext): () => void {
  const tabs = nativeTabRegistry(ctx)
  if (tabs === undefined) {
    console.warn('[qoder-sidebar] sidebarRightTabs 服务缺失——原生右栏不在装配里，本页不登记')
    return () => {}
  }

  const disposeType = tabs.register({
    id: SIDEBAR_ID,
    kind: SIDEBAR_KIND,
    priority: 'extension',
    title: () => '活动',
    guide: [
      {
        order: 10,
        title: () => '会话活动',
        description: () => '本会话做过的事：环境、进程、技能与 MCP、产出、网页、来源',
      },
    ],
  })

  const slots = nativeSlots(ctx)
  const disposeBody = slots.inject('sidebar.right.pane.tab', () =>
    slots.register(
      {
        name: 'sidebar.right.pane.tab',
        key: SIDEBAR_ID,
        inject: (sessionId: string) => ({ hooks: { sessionActivity: sessionActivityFor(ctx, sessionId) } }),
      },
      SidebarBody as never,
    ),
  ) as () => void

  const disposeFront = bringToFrontOnFirstExpand(ctx)

  return () => {
    disposeFront()
    disposeBody()
    disposeType()
  }
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
function sessionActivityFor(ctx: ClientContext, sessionId: string): ActivitySource {
  const sessions = (ctx as unknown as { sessions?: SessionsLike }).sessions
  const binding = sessions?.binding?.(sessionId)
  if (binding?.eventSource === undefined) return EMPTY_SOURCE
  return activitySource(binding.eventSource)
}

/** `ctx.sessions` 的窄面：本包只用「按 id 取绑定」这一个读法。 */
interface SessionsLike {
  binding?(sessionId: string): {
    eventSource?: {
      getSnapshot(): { entries: readonly ActivityEventEntry[]; revision?: unknown }
      subscribe(listener: () => void): () => void
    }
  } | undefined
}

/** 会话不可用时的恒定空源（引用稳定，避免每次渲染都换快照）。 */
const EMPTY_SOURCE: ActivitySource = {
  getSnapshot: () => ({ sections: [] }),
  subscribe: () => () => {},
}

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
function bringToFrontOnFirstExpand(ctx: ClientContext): () => void {
  const right = nativeRightbar(ctx)
  if (right === undefined) return () => {}
  let done = false
  const timer = window.setInterval(() => {
    if (done) return
    let expanded = false
    try {
      expanded = right.isExpanded()
    } catch {
      return
    }
    if (!expanded) return
    done = true
    window.clearInterval(timer)
    try {
      if (right.active()?.kind !== SIDEBAR_KIND) right.openTab(SIDEBAR_KIND)
    } catch (error) {
      console.warn('[qoder-sidebar] 首次展开时打开本页失败', error)
    }
  }, 1000)
  return () => {
    done = true
    window.clearInterval(timer)
  }
}
