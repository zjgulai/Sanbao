/**
 * 反向守卫：**锚点声明（ui-anchors.json）与代码词汇必须互为子集**，而且这条守卫要能被证明
 * 「不一致时真的抛」——一个永远不抛的守卫等于没有守卫。
 *
 * 另加两条：解析器对合成样式表的行为，以及选择器生成规则（前缀以数字开头时不能直接 `.`）。
 */
import { describe, expect, it } from 'vitest'

import {
  ANCHOR_KEYS,
  ANCHOR_MODULES,
  ANCHOR_NAMES,
  assertManifestMatchesCode,
  classSelector,
  resolveLiveAnchors,
} from './live-selectors.js'

describe('锚点声明与代码词汇的一致性守卫', () => {
  it('清单里有代码不认识的 id → 抛（危险方向之一：声明了却没人在用）', () => {
    expect(() => assertManifestMatchesCode(['heroPreviewBadge', 'ghost'], ['heroPreviewBadge'])).toThrow(
      /代码不认识的 id ghost/,
    )
  })

  it('代码用到而清单没声明 → 抛（危险方向之二：规则存在但永远解析不到）', () => {
    expect(() => assertManifestMatchesCode([], ['heroPreviewBadge'])).toThrow(
      /清单没有声明的 id heroPreviewBadge/,
    )
  })

  it('两边相等 → 不抛', () => {
    expect(() => assertManifestMatchesCode(['a', 'b'], ['b', 'a'])).not.toThrow()
  })

  it('模块初始化时用的就是真实清单与真实词汇（本包当前只有角标一个锚）', () => {
    expect([...ANCHOR_KEYS]).toEqual(['heroPreviewBadge'])
    expect(ANCHOR_NAMES).toEqual(['heroPreviewBadge'])
    expect(ANCHOR_MODULES.map((module) => module.moduleId)).toEqual([
      '@deepseek-ai/dsh-client-ui-conversation/HeroShell.module.css',
    ])
  })
})

describe('运行时解析', () => {
  const MODULE_ID = '@deepseek-ai/dsh-client-ui-conversation/HeroShell.module.css'

  function withOfficialStyle(css: string): Document {
    document.head.innerHTML = ''
    document.documentElement.removeAttribute('data-dsh-root-brand-anchors')
    const tag = document.createElement('style')
    tag.dataset.pluginCss = MODULE_ID
    tag.textContent = css
    document.head.appendChild(tag)
    return document
  }

  it('唯一前缀 → 解析出完整类名；缺失 → 进入 missing', () => {
    const doc = withOfficialStyle('.sro9dq_previewBadge{font-size:12px}')
    expect(resolveLiveAnchors(doc)).toEqual({
      anchors: { heroPreviewBadge: 'sro9dq_previewBadge' },
      missing: [],
    })

    const empty = withOfficialStyle('.sro9dq_headline{display:flex}')
    expect(resolveLiveAnchors(empty)).toEqual({ anchors: {}, missing: ['heroPreviewBadge'] })
  })

  it('前缀不唯一 → 判为解析失败（不猜一个）', () => {
    const doc = withOfficialStyle('.aaaaaa_previewBadge{}.bbbbbb_previewBadge{}')
    expect(resolveLiveAnchors(doc).missing).toEqual(['heroPreviewBadge'])
  })

  it('选择器生成：字母开头用类选择器，数字开头用属性选择器', () => {
    expect(classSelector('sro9dq_previewBadge')).toBe('.sro9dq_previewBadge')
    expect(classSelector('1V6tra_previewBadge')).toBe('[class~="1V6tra_previewBadge"]')
  })
})
