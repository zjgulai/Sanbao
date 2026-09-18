/**
 * 动作分发器：`CapabilityAction` → 真实执行通道。
 *
 * 每个动作类型的通道都是既有先例的同一条，不发明新机制：
 *
 * - `execute-skill` / `prefill-draft`：共享 `deliverPrompt`（setDraft 优先、剪贴板兜底、
 *   两级降级都出声）。交付前还要**离开已选中的 keyed 面板**：面板是中心列视图，
 *   它盖着 composer——不取消选中，草稿就写进了用户看不见的地方（S3.1 实测到的缺陷形状）。
 * - `open-panel`：目标已迁到 `main` keyed slot 就走官方 `selectPanel(key)`，判据与基座
 *   同源（`slots.entries('main')` 里有没有这个 key，正是基座 `selectPanel` 自己的判据）；
 *   没迁的才回退旧 `dsh:view-change` 总线，并且**出声**——该总线的听者随各面迁移逐个
 *   消失，静默的死点击比报错难查得多。
 * - `open-system`：POST `/api/dsh-newapp/open-system`（「客户端只发 slug」的既有边界，
 *   newapp routes.ts 的 openSystem handler）。
 *
 * 曾经这里还广播 `dsh:skill-execute`：2026-09-19 实测**全仓 + 基座零听者**（技能卡的
 * 「执行」是另一处广播点），两处一起删——交付由 `deliverPrompt` 承担，事件不承载任何事实。
 * @module dsh-capability-hub-local/client/dispatcher
 */
import type { CapabilityAction, FetchLike } from './types.ts'
import { deliverPrompt } from './prefill-draft.ts'

/** 官方 layout 服务，收窄到本模块用的一项。 */
export interface LayoutLike {
  selectPanel(id: string | null): void
}

/** 分发依赖（由 apply 闭包供给；全部可探测缺失）。 */
export interface DispatcherDeps {
  /** 当前会话 id（无会话时 undefined）。 */
  sessionId(): string | undefined
  /** `conversation` 服务（经查找读到；可缺）。 */
  conversation(): unknown
  /** fetch 实现（open-system 用）。 */
  fetchLike: FetchLike
  /** 官方 `layout` 服务（经查找读到；可缺）：keyed 面板的选中/取消只能经它。 */
  layout(): LayoutLike | undefined
  /** 基座已注册的 `main` 面板 key（判据与基座 `selectPanel` 同源）。 */
  mainKeys(): readonly string[]
}

/** 分发结果。 */
export type DispatchOutcome = { ok: true } | { ok: false; reason: string }

/**
 * 回到会话：取消 keyed 面板选中，并广播旧总线。
 *
 * 旧广播此刻仍有两个听者——注入行的 `data-active`（岗位矩阵 / 新应用）与 newapp 抽屉的
 * 关闭；S3.2 / S3.3 把这两个面迁到 keyed slot 后，这条广播整体退役。
 * @param deps - 分发依赖。
 */
function backToConversation(deps: DispatcherDeps): void {
  try {
    deps.layout()?.selectPanel(null)
  } catch (error) {
    console.warn('[capability-hub] layout.selectPanel(null) 抛出：', error)
  }
  window.dispatchEvent(new CustomEvent('dsh:view-change', { detail: { view: 'chat' } }))
}

/**
 * 交付一句话，并把共享降级链的结果收敛成分发结果。
 * @param deps - 分发依赖。
 * @param text - 要交付的提示词。
 * @returns 结果；两级通道都失败时 ok=false 并给出原因。
 */
async function deliver(deps: DispatcherDeps, text: string): Promise<DispatchOutcome> {
  const outcome = await deliverPrompt({ sessionId: deps.sessionId, conversation: deps.conversation, label: 'capability-hub' }, text)
  return outcome.ok ? { ok: true } : { ok: false, reason: outcome.reason }
}

/**
 * 执行一个能力动作。
 *
 * 异步：`open-system` 要等宿主回答（未知 slug 会被拒），剪贴板写入也可能被拒——
 * 同步返回就无法如实报告这两件事的成败。
 * @param action - 要执行的动作。
 * @param deps - 分发依赖。
 * @returns 结果（永不抛出）。
 */
export async function dispatchAction(action: CapabilityAction, deps: DispatcherDeps): Promise<DispatchOutcome> {
  try {
    switch (action.type) {
      case 'execute-skill':
        backToConversation(deps)
        return await deliver(deps, action.prompt)
      case 'prefill-draft':
        backToConversation(deps)
        return await deliver(deps, action.prompt)
      case 'open-panel': {
        if (action.view === 'chat') {
          backToConversation(deps)
          return { ok: true }
        }
        const layout = deps.layout()
        if (deps.mainKeys().includes(action.view) && typeof layout?.selectPanel === 'function') {
          layout.selectPanel(action.view)
          return { ok: true }
        }
        console.warn(
          `[capability-hub] open-panel '${action.view}'：基座没有注册这个 main 面板 key，`
          + '回退 dsh:view-change 广播（该面尚未迁到 keyed slot，广播可能没有听者）',
        )
        window.dispatchEvent(new CustomEvent('dsh:view-change', { detail: { view: action.view } }))
        return { ok: true }
      }
      case 'open-system': {
        const response = await deps.fetchLike('/api/dsh-newapp/open-system', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug: action.slug }),
        })
        if (response.ok) return { ok: true }
        const body = await response.json().catch(() => undefined)
        const detail = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined
        return { ok: false, reason: typeof detail === 'string' ? detail : `HTTP ${response.status}` }
      }
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}
