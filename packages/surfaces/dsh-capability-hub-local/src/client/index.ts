/**
 * Browser-half entry for the LUTE capability hub — runs inside the dsh web GUI.
 *
 * 装配三件事：设计 token 注入（S1 的 `--lute-*` 家族）、命令面板控制器（含会话/
 * 预填通道接线）、`shell.overlay` 上的面板注册 + Cmd/Ctrl+K 快捷键。
 *
 * 失败策略与家族一致（newapp / role-matrix 同型）：DOM 与取数问题只上报不抛出——
 * `apply` 在 shell 引导期运行，抛异常会拖垮整个 GUI；外部插件绝不能有这种能力。
 * 唯一的例外是 `ctx.slots.inject` 不可用：那不是降级而是面板根本挂不上，静默缺席
 * 正是 ADR-0019 要防的形状，所以显式报错。
 *
 * Export discipline (packages/client rule)：/client 面只带 cordis 装载所需的
 * apply / inject 与类型——组件、mapper、控制器全部内部。
 * @module dsh-capability-hub-local/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { CommandPalette, PaletteController } from './CommandPalette.tsx'
import type { LayoutLike } from './dispatcher.ts'
import { ensureLuteTokens } from './lute-tokens.ts'

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots']

/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { CapabilityAction, CapabilityAvailability, CapabilityItem, CapabilityKind, CatalogResult, SliceResult } from './types.ts'
export type { CommandPaletteProps } from './CommandPalette.tsx'

/** `sessions` 服务，收窄到当前会话 id 这一项。 */
interface SessionsLike {
  list: {
    getSnapshot(): { current?: string }
  }
}

/** `ctx.inject` 的会话作用域结果。 */
interface ScopedServices {
  sessions: SessionsLike
}

/** 本模块实际使用的 ctx 窄面（与 role-matrix 同型的 LOCAL ADAPTATION）。 */
interface PaletteContext {
  effect(fn: () => void | (() => void), label?: string): () => void
  /** 文档化的「不声明 inject 就读服务」通道；读不到返回 undefined。 */
  get(name: string): unknown
  inject(services: readonly string[], callback: (scoped: ScopedServices) => unknown): unknown
  slots: {
    register(options: Record<string, unknown>, component?: unknown): unknown
    inject?(slot: string, factory: () => unknown): unknown
    entries?(slot: string): readonly { options?: Record<string, unknown> }[]
  }
}

/**
 * 不声明 inject 依赖地读一个服务。
 *
 * 裸读未声明服务在 cordis 里会**抛**（`ctx[name]` 的代理陷阱），所以 `ctx[name] ??
 * fallback` 在求值左操作数时就死了。`ctx.get` 是文档化的 read-without-inject，
 * 这让预填通道保持可选。
 * @param ctx - client 根上下文（窄面）。
 * @param name - 服务名。
 * @returns 服务，未注册时 undefined。
 */
function lookup(ctx: PaletteContext, name: string): unknown {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}

/**
 * 基座当前注册了哪些 `main` 面板 key。
 *
 * 判据刻意与基座**同源**：`DesktopLayoutState` 就是用
 * `ctx.slots.entries('main').some(entry => entry.options.key === id)` 决定 `selectPanel`
 * 该不该抛错的。自己抄一份「哪些面已经迁到 keyed slot」的清单会是第二份事实
 * （ADR-0009），而且每迁一个面就腐烂一次。
 * @param ctx - client 根上下文（窄面）。
 * @returns 已注册的 key；读不到时空数组（调用方据此回退旧通道）。
 */
function mainPanelKeys(ctx: PaletteContext): readonly string[] {
  try {
    if (typeof ctx.slots?.entries !== 'function') return []
    return ctx.slots.entries('main')
      .map((entry) => entry.options?.key)
      .filter((key): key is string => typeof key === 'string')
  } catch {
    return []
  }
}

/**
 * 装配能力中枢。
 * @param ctx - client 根上下文（slots 服务）。
 */
export function apply(ctx: ClientContext): void {
  const scoped = ctx as unknown as PaletteContext
  if (typeof scoped.slots?.inject !== 'function') {
    // 不是降级：没有它面板挂不上，静默缺席等于功能不存在却无人知道。
    throw new Error('capability-hub: ctx.slots.inject 不可用；命令面板需要客户端运行时提供该能力')
  }

  ctx.effect(() => {
    ensureLuteTokens()
    // 刻意返回空 disposer 而不是移除标签：token 标签可能被兄弟插件注入（见
    // ensureLuteTokens 契约），且值是静态常量，插件卸载后残留无害。
    return () => {}
  }, 'capability-hub: design tokens')

  // 会话通道是可选项：`sessions` 缺席（或还没有当前会话）时预填降级到剪贴板，
  // 面板本身照常可用。用一个可变引用承载，避免把 sessions 塞进控制器构造。
  let currentSessionId: (() => string | undefined) = () => undefined
  const controller = new PaletteController({
    sessionId: () => currentSessionId(),
    conversation: () => lookup(scoped, 'conversation'),
    fetchLike: (route, init) => fetch(route, init),
    layout: () => lookup(scoped, 'layout') as LayoutLike | undefined,
    mainKeys: () => mainPanelKeys(scoped),
  })

  ctx.inject(['sessions'], (services) => {
    currentSessionId = () => {
      try {
        return services.sessions.list.getSnapshot().current
      } catch {
        return undefined
      }
    }
    return () => { currentSessionId = () => undefined }
  })

  // Cmd/Ctrl+K 唤起。修饰键组合在任何输入焦点下都该生效（这正是命令面板的意义），
  // 所以不做「焦点在输入框时忽略」的例外。
  ctx.effect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key !== 'k' && event.key !== 'K') return
      event.preventDefault()
      controller.toggle()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, 'capability-hub: palette shortcut')

  scoped.slots.inject('shell.overlay', () => scoped.slots.register({
    name: 'shell.overlay',
    id: 'capability-palette',
    order: 10,
    inject: () => ({ controller }),
  }, CommandPalette))

  ctx.effect(() => () => controller.dispose(), 'capability-hub: catalog cache')
}
