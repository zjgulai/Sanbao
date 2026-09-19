/**
 * 纵切 1：官方 hero 标题必须在**真实产物**上被插件隐藏（"同一句只出现一次"）。
 *
 * seam：真实产物 `lib/client.js` —— 经 ModuleLoader 桩载入后在 happy-dom 中执行 apply。
 * 真值：官方 CSS 文本、类名与词典字面量都从官方产物解析，不写死在测试里。
 *
 * **当前基座的产物是硬前置**：`installedConversationBundle()` 读不到就抛。
 * 2026-09-18 的故障正是「路径常量钉在上一代的 asar 布局上 → 用例整段 skip → 全绿而产品坏着」。
 */
import { afterEach, describe, expect, it } from 'vitest'

import '../lib/client.js'

import { OFFICIAL_PREVIEW_TEXT, PREVIEW_TEXT } from '../src/client/hero-title.js'
import {
  BRAND_PHRASE,
  brandMarkHtml,
  disposeInstalledPlugins,
  installOfficialStyle,
  installPlugin,
  renderHeroFixture,
  visibleTexts,
} from './helpers/hero-fixture'
import {
  HERO_SHELL_MODULE_ID,
  extractModuleCss,
  installedConversationBundle,
  officialHeroClasses,
  officialLocaleValue,
} from './official-artifacts'

const bundle = installedConversationBundle()
const classes = officialHeroClasses(bundle)
/** 官方标题文案的真值：来自产物词典，不手抄。 */
const officialHeadline = officialLocaleValue(bundle, 'hero.headline')

function setupHero(officialTitleText: string = officialHeadline) {
  installOfficialStyle(HERO_SHELL_MODULE_ID, extractModuleCss(bundle, HERO_SHELL_MODULE_ID))
  return renderHeroFixture(classes, brandMarkHtml(), officialTitleText)
}

describe('hero 品牌唯一性（真实产物 seam）', () => {
  afterEach(() => {
    // 观察器挂在 documentElement 上，清 body/head 摘不掉它：先收口插件再清 DOM。
    disposeInstalledPlugins()
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('插件生效后：官方标题被隐藏，品牌句只出现一次', () => {
    const fixture = setupHero()
    installPlugin()

    // 与版本无关的断言：用户看到的是「一句品牌句 + 一处品牌标」
    expect(visibleTexts(fixture.hero, BRAND_PHRASE)).toEqual([BRAND_PHRASE])
    expect(fixture.fishHitbox.querySelector('svg')).not.toBeNull()

    // 同一句官方文案不可见（隐藏方式：display:none + 可查的标记属性）
    expect(getComputedStyle(fixture.officialTitle).display).toBe('none')
    expect(fixture.officialTitle.getAttribute('dsh-rb-hidden')).toBe('1')
    expect(visibleTexts(fixture.hero, officialHeadline)).toEqual([])

    expect(document.documentElement.dataset.dshRootBrandAnchors).toBe('resolved')
  })

  it('官方角标文案与产物词典一致：排除表不会悄悄过期', () => {
    // 角标文案进的是「不是标题」的排除表。官方若换了那句文案，排除表就会过期——
    // 角标本身会被误当成标题候选，于是「唯一标题」不再唯一（degraded:ambiguous）。
    expect(officialLocaleValue(bundle, 'hero.preview')).toBe(OFFICIAL_PREVIEW_TEXT)
    expect(PREVIEW_TEXT).toBe('Preview')
  })

  it('hero 未挂载时不报缺陷：状态为 resolved（idle 不是 degraded）', () => {
    installOfficialStyle(HERO_SHELL_MODULE_ID, extractModuleCss(bundle, HERO_SHELL_MODULE_ID))
    installPlugin()
    // 页面里没有 hero（非空会话页面就是这样）
    expect(document.documentElement.dataset.dshRootBrandAnchors).toBe('resolved')
  })

  it('结构不唯一时不猜：两个候选叶子 → 不隐藏标题，并报 degraded:ambiguous', () => {
    const fixture = setupHero()
    // 再塞一个有文字的叶子进同一容器：此时「谁是标题」不再唯一
    const extra = document.createElement('span')
    extra.textContent = '额外的说明'
    fixture.titleGroup.appendChild(extra)

    installPlugin()

    expect(document.documentElement.dataset.dshRootBrandAnchors).toBe('degraded:ambiguous')
    expect(getComputedStyle(fixture.officialTitle).display).not.toBe('none')
    expect(getComputedStyle(extra).display).not.toBe('none')
  })

  it('官方角标被隐藏（文案原样保留）；React 换掉节点后重新隐藏；卸载后都还原', async () => {
    const fixture = setupHero()
    const plugin = installPlugin()

    // 隐藏的是节点，不是文案：文案仍是官方原文，只是不可见（官方 no-config-switch 的角标
    // 在这里被用户裁决为「不显示」，见 hero-title.ts 的节首注释）。
    expect(getComputedStyle(fixture.previewBadge).display).toBe('none')
    expect(fixture.previewBadge.textContent).toBe(OFFICIAL_PREVIEW_TEXT)
    expect(fixture.previewBadge.getAttribute('dsh-rb-hidden')).toBe('1')
    expect(getComputedStyle(fixture.officialTitle).display).toBe('none')

    // React 若把角标节点整个换掉（重渲染），新节点必须被重新隐藏。
    const replacement = document.createElement('span')
    replacement.className = fixture.previewBadge.className
    replacement.textContent = OFFICIAL_PREVIEW_TEXT
    fixture.previewBadge.replaceWith(replacement)
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(getComputedStyle(replacement).display).toBe('none')

    // 卸载后不留残余：角标与官方标题都回到官方状态（在清理 DOM 之前断言）。
    plugin.dispose()
    expect(getComputedStyle(replacement).display).not.toBe('none')
    expect(replacement.getAttribute('dsh-rb-hidden')).toBeNull()
    expect(getComputedStyle(fixture.officialTitle).display).not.toBe('none')
    expect(fixture.officialTitle.getAttribute('dsh-rb-hidden')).toBeNull()

    fixture.hero.remove()
  })

  it('结构不唯一时角标仍然隐藏：角标是被正向识别的节点，与标题唯一性无关', () => {
    const fixture = setupHero()
    const extra = document.createElement('span')
    extra.textContent = '额外的说明'
    fixture.titleGroup.appendChild(extra)

    installPlugin()

    expect(document.documentElement.dataset.dshRootBrandAnchors).toBe('degraded:ambiguous')
    expect(getComputedStyle(fixture.previewBadge).display).toBe('none')
    expect(getComputedStyle(extra).display).not.toBe('none')
  })
})
