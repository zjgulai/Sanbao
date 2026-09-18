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

import { OFFICIAL_PREVIEW_TEXT, PREVIEW_TEXT } from '../src/client/official-text.js'
import {
  BRAND_PHRASE,
  brandMarkHtml,
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

  it('官方角标文案与产物词典一致：插件常量不会悄悄过期', () => {
    // 插件只把「等于官方原文」的角标改成 Preview。官方若换了那句文案，
    // 改写会静默失效（角标留在原文），所以这条一致性必须有人守着。
    expect(officialLocaleValue(bundle, 'hero.preview')).toBe(OFFICIAL_PREVIEW_TEXT)
    expect(PREVIEW_TEXT).toBe('Preview')
  })

  it('hero 未挂载时不报缺陷：状态为 resolved（idle 不是 degraded）', () => {
    installOfficialStyle(HERO_SHELL_MODULE_ID, extractModuleCss(bundle, HERO_SHELL_MODULE_ID))
    installPlugin()
    // 页面里没有 hero（非空会话页面就是这样）
    expect(document.documentElement.dataset.dshRootBrandAnchors).toBe('resolved')
  })

  it('结构不唯一时不猜：两个候选叶子 → 什么都不隐藏，并报 degraded:ambiguous', () => {
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

  it('角标显示 Preview；React 回写后仍然成立；卸载后官方标题与角标都还原', async () => {
    const fixture = setupHero()
    const plugin = installPlugin()

    expect(fixture.previewBadge.textContent).toBe('Preview')
    expect(getComputedStyle(fixture.officialTitle).display).toBe('none')

    // React 把它写回官方文案后，插件必须重新改写（同一元素、同一观测点）。
    fixture.previewBadge.textContent = OFFICIAL_PREVIEW_TEXT
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(fixture.previewBadge.textContent).toBe('Preview')

    // 卸载后不留残余：角标文案与官方标题都回到官方状态（在清理 DOM 之前断言）。
    plugin.dispose()
    expect(fixture.previewBadge.textContent).toBe(OFFICIAL_PREVIEW_TEXT)
    expect(getComputedStyle(fixture.officialTitle).display).not.toBe('none')
    expect(fixture.officialTitle.getAttribute('dsh-rb-hidden')).toBeNull()

    fixture.hero.remove()
  })
})
