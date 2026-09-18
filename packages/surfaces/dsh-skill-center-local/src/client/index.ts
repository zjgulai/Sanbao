/**
 * Browser-half entry for the skill center plugin — runs inside the dsh web GUI.
 *
 * S3 起承载方式换成基座官方机制：扩展中心是 `main` keyed slot 的中心列视图
 * （key=`extensions`），侧栏行是 `sidebar.panellist` 的官方导航行（id 同 key，
 * 点击由官方行壳调 `selectPanel`，active 态随 `usePanelInfo` 联动）。
 * 此前的 centerCol DOM 挂载与自造 `dsh:view-change` 显隐监听整体退役。
 *
 * Export discipline (packages/client rule): the /client surface carries what
 * cordis loading needs plus types only — all value exports stay internal.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { SkillApi } from './api.ts'
import { en, zh, type SkillExplorerKey } from './locales.ts'
import { tt } from './panel-helpers.ts'
import { ExtensionsPanel, ExtensionsPanelIcon } from './panel-slot.tsx'
import { deliverPrompt, type PromptDelivery } from './prefill-draft.ts'

/** Locale namespace this plugin owns. */
const NS = 'dsh-skill-center-local'

/** `main` keyed slot 的键，与 `sidebar.panellist` 的行 id 同值（官方联动契约）。 */
export const PANEL_KEY = 'extensions'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** skill center surface copy. */
    'dsh-skill-center-local': SkillExplorerKey
  }
}

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'locale']

/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { SkillPanelProps } from './SkillPanel.tsx'
export type { SkillExplorerKey } from './locales.ts'
export type { SkillApi } from './api.ts'

/** 本插件用到的 ctx 窄面（与 capability-hub 同型的 LOCAL ADAPTATION）。 */
interface SkillCenterContext {
  get(name: string): unknown
  inject(services: readonly string[], callback: (scoped: { sessions: SessionsLike }) => unknown): unknown
  slots: {
    register(options: Record<string, unknown>, component?: unknown): unknown
    inject?(slot: string, factory: () => unknown): unknown
  }
}

/** `sessions` 服务，收窄到当前会话 id 这一项。 */
interface SessionsLike {
  list: {
    getSnapshot(): { current?: string }
  }
}

/**
 * 不声明 inject 依赖地读一个服务。
 *
 * 裸读未声明服务在 cordis 里会**抛**（`ctx[name]` 的代理陷阱），所以 `ctx[name] ??
 * fallback` 在求值左操作数时就死了。`ctx.get` 是文档化的 read-without-inject，
 * 这让预填通道保持可选——`conversation` 缺席时交付降级到剪贴板，面板照常可用。
 * @param ctx - client 根上下文（窄面）。
 * @param name - 服务名。
 * @returns 服务，未注册时 undefined。
 */
function lookup(ctx: SkillCenterContext, name: string): unknown {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}

/**
 * Mount the skill center surfaces as official slots.
 * @param ctx - client root context (locale + slots services).
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch {
      return () => {}
    }
  }, 'skill-center-local: dictionaries')

  const scoped = ctx as unknown as SkillCenterContext
  if (typeof scoped.slots?.inject !== 'function') {
    // 没有 slot 机制就没有本插件的存在意义；静默缺席正是 ADR-0019 要防的形状。
    console.warn('[skill-center-local] ctx.slots.inject 不可用——扩展中心不注册（本 shell 无 slot 机制）')
    return
  }

  const api = new SkillApi()

  /** 行徽标的总数：取一次，失败留空（徽标缺席好过错误数字）。 */
  const loadTotal = async (): Promise<number | undefined> => {
    try {
      const payload = await api.list()
      let count = 0
      for (const group of payload.groups) count += group.skills.length
      return count
    } catch {
      return undefined
    }
  }

  /** 离开视图：优先官方 layout 服务，回退旧事件总线（其余包仍在听它）。 */
  const onExit = (): void => {
    const layout = lookup(scoped, 'layout') as { selectPanel?: (id: string | null) => void } | undefined
    if (typeof layout?.selectPanel === 'function') {
      layout.selectPanel(null)
      return
    }
    window.dispatchEvent(new CustomEvent('dsh:view-change', { detail: { view: 'chat' } }))
  }

  // 会话通道是可选项：`sessions` 缺席（或还没有当前会话）时交付降级到剪贴板，
  // 面板本身照常可用。用一个可变引用承载，避免把 sessions 塞进面板 props。
  let currentSessionId: () => string | undefined = () => undefined
  if (typeof scoped.inject === 'function') {
    scoped.inject(['sessions'], (services) => {
      currentSessionId = () => {
        try {
          return services.sessions.list.getSnapshot().current
        } catch {
          return undefined
        }
      }
      return () => { currentSessionId = () => undefined }
    })
  }

  /**
   * 技能卡「执行」的交付通道：共享 `deliverPrompt`（setDraft 优先、剪贴板兜底、
   * 两级降级都出声）。与命令面板同一条实现——此前这里是剪贴板独走，同一件事两个家。
   */
  const runSkill = (prompt: string): Promise<PromptDelivery> =>
    deliverPrompt({ sessionId: () => currentSessionId(), conversation: () => lookup(scoped, 'conversation'), label: 'skill-center-local' }, prompt)

  scoped.slots.inject('main', () => scoped.slots.register({
    name: 'main',
    key: PANEL_KEY,
    inject: () => ({ api, onExit, runSkill }),
  }, ExtensionsPanel))

  scoped.slots.inject('sidebar.panellist', () => scoped.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_KEY,
    order: 40,
    label: () => tt('entry.label'),
    inject: () => ({ loadTotal }),
  }, ExtensionsPanelIcon))
}
