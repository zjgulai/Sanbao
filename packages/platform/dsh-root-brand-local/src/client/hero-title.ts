/**
 * 官方 hero 标题的隐藏：**按关系定位，不按类名**。
 *
 * ── 为什么不能再用类名 ──────────────────────────────────────────────────────
 *
 * 2.0.5 时代官方标题是一个有局部名的元素（`headlineText`），插件用「解析出类名 → 隐藏它」
 * 就够了。2.0.10 把那个元素去掉了：标题变成 `titleGroup` 里一个**无类名**的 span
 * （实测结构：`div.headline > span.fishHitbox + span.titleGroup > [span, span.previewBadge]`）。
 * 于是任何按名字找标题的实现都会静默失手——2026-09-18 装机实测：隐藏规则根本没生成，
 * 用户看到的是「探索未至之境」和品牌句同时出现。
 *
 * ── 本实现依赖的**唯一**关系 ────────────────────────────────────────────────
 *
 * 官方把标题与角标放在**同一个容器**里，两组文案是兄弟。所以：找到角标（它的类名是插件
 * 唯一声明的锚），它的父元素里那个「唯一的、有文字的叶子兄弟」就是标题。
 * 这条关系不含任何类名，上游换哈希、改类名都不影响它。
 *
 * ── 找不到时**不猜** ────────────────────────────────────────────────────────
 *
 * 候选为 0 或多于 1 个时，本模块**不隐藏新的东西**，只把原因报回去（调用方写进
 * `data-dsh-root-brand-anchors` 与 Console）。取舍是明确的：宁可有第二句多出来，
 * 也不隐藏一个不该隐藏的东西——后者用户看不见、也说不清，前者一眼就能发现。
 * 「会不会多出第二句」由发布前的门禁 `plugin-ui-anchor-drift` 与实况验收负责拦住，
 * 不由本模块靠猜来兜底。
 *
 * 一个边界要说清：**此前已正向识别并隐藏的元素保持隐藏**。它是在结构唯一时被识别出来的，
 * 事后出现的歧义不构成「撤销识别」的理由；此时读数会变成 `degraded:ambiguous`，
 * 让问题可见，而不是靠把界面翻回去来表达。
 */
import { OFFICIAL_PREVIEW_TEXT, PREVIEW_TEXT } from './official-text.js'

/** 被隐藏元素的标记（disposer 靠它还原；也给现场排查一个可查的痕迹）。 */
export const HIDDEN_ATTR = 'dsh-rb-hidden'

/** 插件自己的节点选择器：品牌句是插件渲染的，绝不能把自己隐藏掉。 */
const BRAND_SCOPE = '[data-plugin="dsh-root-brand"]'

/** 两种角标文案都不是标题，必须排除。 */
const BADGE_TEXTS = new Set([OFFICIAL_PREVIEW_TEXT, PREVIEW_TEXT])

/**
 * 失败码（进 `data-dsh-root-brand-anchors`，是可 grep 的机器读数）：
 *   - `ok`             隐藏成功
 *   - `badge-detached` 角标没有父元素（DOM 结构与预期不符）
 *   - `no-candidate`   角标所在容器里找不到唯一的标题叶子
 *   - `ambiguous`      候选多于一个
 */
export type SuppressCode = 'ok' | 'badge-detached' | 'no-candidate' | 'ambiguous'

export interface SuppressOutcome {
  /** 1 = 官方标题当前处于隐藏态；0 = 没隐藏任何东西。 */
  hidden: number
  code: SuppressCode
  /** 给人看的一句话（进 Console；dataset 里只放 code）。 */
  detail: string
}

export interface HeadlineSuppressor {
  /** 幂等：已隐藏时重复调用不会重复记录。 */
  apply(badge: HTMLElement): SuppressOutcome
  /** 还原全部被隐藏的元素（卸载后不留残余）。 */
  restore(): void
  /** 当前处于隐藏态的元素个数。 */
  hiddenCount(): number
}

/** 叶子元素 = 没有元素子节点、且文本非空。标题在官方结构里正是这样的节点。 */
function isTextLeaf(element: Element): boolean {
  return element.children.length === 0 && (element.textContent ?? '').trim() !== ''
}

/** 插件自己的节点（或包含插件节点的容器）不参与候选。 */
function isBrandNode(element: Element): boolean {
  return element.matches(BRAND_SCOPE) || element.querySelector(BRAND_SCOPE) !== null
}

/**
 * 建立一个标题隐藏器。状态只有一处（元素 → 它原来的 inline display），
 * disposer 据此还原，不依赖任何全局变量。
 */
export function createHeadlineSuppressor(): HeadlineSuppressor {
  const hidden = new Map<HTMLElement, string>()

  const apply = (badge: HTMLElement): SuppressOutcome => {
    // 先摘掉已经脱离文档的旧记录：React 重渲染会换掉节点，留着它们只会让
    // restore 去改一棵已经没人看的树。
    for (const element of [...hidden.keys()]) {
      if (!element.isConnected) hidden.delete(element)
    }

    const group = badge.parentElement
    if (group === null) {
      return { hidden: 0, code: 'badge-detached', detail: '官方角标没有父元素，DOM 结构与预期不符' }
    }

    const candidates = [...group.children].filter(
      (element) =>
        element !== badge &&
        !isBrandNode(element) &&
        isTextLeaf(element) &&
        !BADGE_TEXTS.has((element.textContent ?? '').trim()),
    )

    if (candidates.length === 0) {
      return {
        hidden: 0,
        code: 'no-candidate',
        detail: `官方角标所在容器（.${badge.className} 的父元素）里没有「唯一的标题叶子」——上游改了 hero 结构，本次不隐藏任何东西`,
      }
    }
    if (candidates.length > 1) {
      return {
        hidden: 0,
        code: 'ambiguous',
        detail: `官方角标所在容器里有 ${candidates.length} 个候选标题叶子——不猜，本次不隐藏任何东西`,
      }
    }

    const target = candidates[0] as HTMLElement
    if (!hidden.has(target)) {
      hidden.set(target, target.style.display)
      target.style.display = 'none'
      target.setAttribute(HIDDEN_ATTR, '1')
    }
    return { hidden: 1, code: 'ok', detail: '官方标题已隐藏' }
  }

  const restore = (): void => {
    for (const [element, previous] of hidden) {
      if (previous === '') element.style.removeProperty('display')
      else element.style.display = previous
      element.removeAttribute(HIDDEN_ATTR)
    }
    hidden.clear()
  }

  return { apply, restore, hiddenCount: () => hidden.size }
}
