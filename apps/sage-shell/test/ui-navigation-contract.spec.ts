import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'

/**
 * Batch 13 / UI-01B: the left navigation converges on the six-item target set
 * (经营事项 / 搜索 / 自动化 / 知识 / 能力 / 设置). Search, automation and knowledge open as their
 * own panels; the displaced panels' content is folded into the 设置 home without losing any
 * wired element id. The automation page stays an honest not-wired surface with zero controls.
 */
const doc = renderSageDocument()

function navOrder(): string[] {
  return [...doc.matchAll(/id="(view-[a-z-]+)"[^>]+data-view="[a-z-]+"/gu)].map((match) => match[1] ?? '')
}

describe('workbench navigation (six-item target)', () => {
  it('ships exactly the six target tabs in the fixed order', () => {
    expect(navOrder()).toEqual([
      'view-matter',
      'view-search',
      'view-automation',
      'view-knowledge',
      'view-capabilities',
      'view-settings',
    ])
  })

  it('retires the displaced top-level tabs and their panels', () => {
    for (const view of ['overview', 'governance', 'profile', 'readout']) {
      expect(doc).not.toContain(`id="view-${view}"`)
      expect(doc).not.toContain(`id="panel-${view}"`)
    }
    expect(doc).not.toContain('matter-overview')
    expect(doc).not.toContain('sage-evidence-strip')
  })

  it('keeps every tab named for narrow-width accessible names', () => {
    const names = [
      ['matter', '经营事项'],
      ['search', '搜索'],
      ['automation', '自动化'],
      ['knowledge', '知识'],
      ['capabilities', '能力'],
      ['settings', '设置'],
    ] as const
    for (const [view, name] of names) {
      const tab = doc.match(new RegExp(`id="view-${view}"[^>]*>`, 'u'))?.[0] ?? ''
      expect(tab, view).toContain(`aria-label="${name}"`)
    }
  })

  it('opens search, knowledge and the honest automation page as their own panels', () => {
    const searchPanel = doc.slice(doc.indexOf('id="panel-search"'), doc.indexOf('id="panel-automation"'))
    expect(searchPanel).toContain('id="search-input"')
    expect(searchPanel).toContain('id="search-run"')

    const automationPanel = doc.slice(doc.indexOf('id="panel-automation"'), doc.indexOf('id="panel-knowledge"'))
    expect(automationPanel).toContain('未接线')
    expect(automationPanel).toContain('没有定时、周期或事件触发的自动化入口')
    expect(automationPanel).not.toMatch(/<(?:button|input|select|textarea)\b/u)

    const knowledgePanel = doc.slice(doc.indexOf('id="panel-knowledge"'), doc.indexOf('id="panel-capabilities"'))
    expect(knowledgePanel).toContain('id="knowledge-state"')
    expect(knowledgePanel).toContain('id="knowledge-rows"')

    const matterPanel = doc.slice(doc.indexOf('id="panel-matter"'), doc.indexOf('id="panel-search"'))
    expect(matterPanel).not.toContain('id="search-input"')
  })

  it('folds the displaced surfaces into the settings home with their wired ids intact', () => {
    const settingsPanel = doc.slice(doc.indexOf('id="panel-settings"'), doc.indexOf('</main>'))
    for (const id of [
      'pref-theme',
      'profile-identity',
      'profile-logout',
      'state-title',
      'retry',
      'login',
      'exit-check-open',
      'guide-toggle',
      'env-runtime',
      'settings-leaf-grid',
      'visibility-org',
      'plugin-rows',
      'diagnostics-harness',
      'feedback-submit',
    ]) {
      expect(settingsPanel, id).toContain(`id="${id}"`)
    }
    expect(settingsPanel).toContain('行动边界')
  })

  it('removes the retired overview DOM hooks from the shipped client script', () => {
    expect(doc).not.toContain('#matter-overview')
    expect(doc).not.toContain('#matter-card-title')
  })
})
