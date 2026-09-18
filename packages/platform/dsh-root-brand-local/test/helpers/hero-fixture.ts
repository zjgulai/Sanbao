/**
 * 测试辅助：在 happy-dom 里复刻官方 hero 的**真实 DOM 结构**（2.0.10 起），
 * 并装载真实插件产物。
 *
 * 2.0.10 的 hero 结构（逐字对照产物 JSX）：
 *   div.headline
 *     span.fishHitbox            ← 品牌座位（公开 slot conversation.hero.brand.mark）
 *     span.titleGroup
 *       span                     ← **无类名**，官方标题文本
 *       span.previewBadge        ← 「预览版」
 *
 * 注意那个无类名的 span：插件正是因此不能再按类名找标题，改为「角标的兄弟」这条关系。
 * fixture 必须复刻这个「无类名」的事实——否则测的就不是真结构。
 *
 * 纯 DOM 操作，不引入 React —— 避免与 bundle 内部压缩符号发生顶层命名冲突。
 */
import { loaderEntries } from '../setup'

/** 官方 hero 的类名（真值来自官方产物，由调用方解析传入）。 */
export interface HeroClasses {
  headline: string
  titleGroup: string
  previewBadge: string
  fishHitbox: string
}

/** 插件渲染的品牌句：期望值来自用户可见需求（规格 User Story 1），不是实现里的常量。 */
export const BRAND_PHRASE = 'Artificial Business Intelligence Agentic'

/**
 * 把官方某个模块的**完整 CSS 文本**注册成官方形态的样式标签
 * （官方产物就是这么做的：`style[data-plugin-css="<包路径>/<模块>.module.css"]`）。
 */
export function installOfficialStyle(moduleId: string, css: string): void {
  const tag = document.createElement('style')
  tag.dataset.pluginCss = moduleId
  tag.textContent = css
  document.head.appendChild(tag)
}

export interface HeroFixture {
  hero: HTMLElement
  headline: HTMLElement
  titleGroup: HTMLElement
  /** 官方标题文本的承载元素（无类名）。 */
  officialTitle: HTMLElement
  previewBadge: HTMLElement
  fishHitbox: HTMLElement
}

/**
 * 复刻官方空会话 hero。插件内容（品牌标 + 品牌句）按产品真实状态放进 `fishHitbox`。
 *
 * @param officialTitleText 官方标题文案，真值来自产物词典（调用方传入，不在这里手抄）
 */
export function renderHeroFixture(
  classes: HeroClasses,
  brandMarkHtml: string,
  officialTitleText: string,
): HeroFixture {
  const root = document.createElement('div')
  root.innerHTML =
    `<div class="${classes.headline}">` +
    `<span class="${classes.fishHitbox}"></span>` +
    `<span class="${classes.titleGroup}">` +
    `<span>${officialTitleText}</span>` +
    `<span class="${classes.previewBadge}">预览版</span>` +
    `</span>` +
    `</div>`
  const hero = root.firstElementChild as HTMLElement
  const [fishHitbox, titleGroup] = [...hero.children] as HTMLElement[]
  const [officialTitle, previewBadge] = [...(titleGroup as HTMLElement).children] as HTMLElement[]
  ;(fishHitbox as HTMLElement).innerHTML = brandMarkHtml
  document.body.appendChild(hero)
  return {
    hero,
    headline: hero,
    titleGroup: titleGroup as HTMLElement,
    officialTitle: officialTitle as HTMLElement,
    previewBadge: previewBadge as HTMLElement,
    fishHitbox: fishHitbox as HTMLElement,
  }
}

/** 复刻插件在 hero 席位渲染的内容：ROOT 字标 + 品牌句。 */
export function brandMarkHtml(): string {
  return (
    '<div data-plugin="dsh-root-brand" class="dsh-rb-hero">' +
    '<svg viewBox="0 0 61 32" width="46" height="24"><rect x="6.5" y="26" width="16.5" height="5" fill="#58B848"/></svg>' +
    `<span class="dsh-rb-hero-name">${BRAND_PHRASE}</span>` +
    '</div>'
  )
}

/**
 * 用户**真正看得见**的、含该文案的文本叶子。
 *
 * 只认文本叶子（没有元素子节点）：`parent.textContent` 会把 `display:none` 的后代文本
 * 也算进来，于是「父容器可见」会让一个被隐藏的子节点看起来仍然可见——
 * 2026-09-18 就是这样把一个已经隐藏好的标题判成可见的。
 */
export function visibleTexts(root: HTMLElement, needle: string): string[] {
  const found: string[] = []
  const walk = (node: Element): void => {
    for (const child of [...node.children]) {
      if (getComputedStyle(child).display === 'none') continue
      if (child.children.length === 0) {
        if (child.textContent?.includes(needle) === true) found.push(child.textContent)
        continue
      }
      walk(child)
    }
  }
  walk(root)
  return found
}

type ApplyFn = (ctx: unknown) => void

interface PluginExports {
  apply: ApplyFn
}

/** 从 ModuleLoader 捕获的入口取出插件导出。 */
export function pluginExports(): PluginExports {
  const entry = loaderEntries().find((item) => item.id === 'dsh-root-brand')
  if (entry === undefined) throw new Error('未捕获到 dsh-root-brand 的 ModuleLoader 入口')
  return entry.factory(() => ({})) as PluginExports
}

/**
 * 装载插件：提供最小 ctx（slots 注册 + effect 生命周期），返回 dispose。
 * slot 登记在测试里不参与渲染（DOM 由 fixture 直接构造），
 * 只保证插件启动路径与产品一致。
 */
export function installPlugin(): { dispose: () => void } {
  const disposers: Array<() => void> = []
  const ctx = {
    effect: (fn: () => void | (() => void)) => {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    slots: {
      inject: (_slot: string, register: () => unknown) => register(),
      register: () => () => {},
    },
  }
  pluginExports().apply(ctx)
  return {
    dispose: () => {
      for (const dispose of disposers) dispose()
    },
  }
}
