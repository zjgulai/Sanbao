/**
 * 纵切 4：升级免疫与可观测性。
 *
 * - 免疫：上游把 CSS-module 前缀换成任意新哈希时，**不改一行代码**也必须命中。
 * - 可观测：锚点解析不到时必须自报（诊断属性 + 警告），不得静默退化——
 *   2026-09-18 的故障里插件其实一直在自报，只是没有任何判据在读它（现在有了：
 *   门禁 `plugin-ui-anchor-drift` 对着出货产物核锚，实况探针核 dataset）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import '../lib/client.js'

import {
  brandMarkHtml,
  disposeInstalledPlugins,
  installOfficialStyle,
  installPlugin,
  renderHeroFixture,
  visibleTexts,
  BRAND_PHRASE,
} from './helpers/hero-fixture'
import { HERO_SHELL_MODULE_ID } from './official-artifacts'

/** 上游未来版的假前缀（与两代真实前缀都不同）。 */
const FUTURE_PREFIX = 'k7Qw2Z'

/** 假上游 hero 模块 CSS：局部名与官方一致（那是我们的锚点约定），只有前缀不同。 */
const FUTURE_HERO_CSS =
  `.${FUTURE_PREFIX}_root{display:flex}` +
  `.${FUTURE_PREFIX}_headline{display:flex;font-size:26px}` +
  `.${FUTURE_PREFIX}_titleGroup{display:flex;gap:4px 7px}` +
  `.${FUTURE_PREFIX}_previewBadge{border-radius:24px}` +
  `.${FUTURE_PREFIX}_fishHitbox{display:inline-flex}`

const futureClasses = {
  headline: `${FUTURE_PREFIX}_headline`,
  titleGroup: `${FUTURE_PREFIX}_titleGroup`,
  previewBadge: `${FUTURE_PREFIX}_previewBadge`,
  fishHitbox: `${FUTURE_PREFIX}_fishHitbox`,
}

describe('升级免疫与可观测性', () => {
  afterEach(() => {
    disposeInstalledPlugins()
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('上游换成任意新前缀：同一份实现仍然命中，且状态为 resolved', () => {
    installOfficialStyle(HERO_SHELL_MODULE_ID, FUTURE_HERO_CSS)
    const fixture = renderHeroFixture(futureClasses, brandMarkHtml(), '探索未至之境')

    installPlugin()

    expect(getComputedStyle(fixture.officialTitle).display).toBe('none')
    expect(visibleTexts(fixture.hero, BRAND_PHRASE)).toEqual([BRAND_PHRASE])
    expect(getComputedStyle(fixture.previewBadge).display).toBe('none')
    expect(document.documentElement.dataset.dshRootBrandAnchors).toBe('resolved')
  })

  it('官方样式缺席时：状态 degraded:anchor-missing 且给出警告（不静默退化）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    installPlugin()

    expect(document.documentElement.dataset.dshRootBrandAnchors).toBe('degraded:anchor-missing')
    expect(warn.mock.calls.some((call) => String(call[0]).includes('heroPreviewBadge'))).toBe(true)
  })

  it('官方样式后到：观察器会重新同步并转回 resolved（不把先来后到当结论）', async () => {
    const fixture = renderHeroFixture(futureClasses, brandMarkHtml(), '探索未至之境')
    installPlugin()
    expect(document.documentElement.dataset.dshRootBrandAnchors).toBe('degraded:anchor-missing')

    installOfficialStyle(HERO_SHELL_MODULE_ID, FUTURE_HERO_CSS)
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(document.documentElement.dataset.dshRootBrandAnchors).toBe('resolved')
    expect(getComputedStyle(fixture.officialTitle).display).toBe('none')
  })
})
