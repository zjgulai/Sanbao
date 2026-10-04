import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'

function openingTag(html: string, selector: { readonly attribute: string, readonly value: string }): string {
  const escaped = selector.value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = html.match(new RegExp(`<[^>]+${selector.attribute}="${escaped}"[^>]*>`, 'u'))
  expect(match, `${selector.attribute}=${selector.value} must exist`).not.toBeNull()
  return match![0]
}

describe('Sage shell semantic contract', () => {
  it('opens on the BusinessMatter workbench and keeps Overview secondary', () => {
    const html = renderSageDocument()
    const matterTab = openingTag(html, { attribute: 'data-view', value: 'matter' })
    const matterPanel = openingTag(html, { attribute: 'data-panel', value: 'matter' })
    const overviewTab = openingTag(html, { attribute: 'data-view', value: 'overview' })
    const overviewPanel = openingTag(html, { attribute: 'data-panel', value: 'overview' })

    expect(matterTab).toContain('is-active')
    expect(matterTab).toContain('aria-selected="true"')
    expect(matterPanel).toContain('is-visible')
    expect(matterPanel).not.toContain(' hidden')
    expect(overviewTab).not.toContain('is-active')
    expect(overviewTab).toContain('aria-selected="false"')
    expect(overviewPanel).toContain(' hidden')
    expect(html).toContain("setView('matter')")
  })

  it('ships the three spatial regions and a control-free read-only composer', () => {
    const html = renderSageDocument()

    expect(html).toContain('data-workbench-region="current-context"')
    expect(html).toContain('data-workbench-region="matter-focus"')
    expect(html).toContain('data-workbench-region="matter-trace"')
    expect(html).toContain('id="matter-trace-toggle"')
    expect(html).toContain('aria-controls="matter-trace-rail"')

    const composer = html.match(/<section[^>]+id="matter-readonly-composer"[\s\S]*?<\/section>/u)?.[0]
    expect(composer, 'read-only composer must exist').toBeTruthy()
    expect(composer).not.toMatch(/<(?:form|input|textarea|button)\b/u)
    expect(composer).toContain('只读')
  })

  it('pairs every workbench tab with its labelled panel', () => {
    const html = renderSageDocument()
    const pairs = [
      ['overview', 'view-overview', 'panel-overview'],
      ['matter', 'view-matter', 'panel-matter'],
      ['capabilities', 'view-capabilities', 'panel-capabilities'],
      ['governance', 'view-governance', 'panel-governance'],
      ['profile', 'view-profile', 'panel-profile'],
      ['readout', 'view-readout', 'panel-readout'],
      ['settings', 'view-settings', 'panel-settings'],
    ] as const

    for (const [view, tabId, panelId] of pairs) {
      const tab = openingTag(html, { attribute: 'data-view', value: view })
      const panel = openingTag(html, { attribute: 'data-panel', value: view })
      expect(tab).toContain('role="tab"')
      expect(tab).toContain(`id="${tabId}"`)
      expect(tab).toContain(`aria-controls="${panelId}"`)
      expect(panel).toContain('role="tabpanel"')
      expect(panel).toContain(`id="${panelId}"`)
      expect(panel).toContain(`aria-labelledby="${tabId}"`)
    }
  })

  it('declares the workbench navigation as a vertical tablist', () => {
    const html = renderSageDocument()
    const tablist = openingTag(html, { attribute: 'role', value: 'tablist' })

    expect(tablist).toContain('aria-orientation="vertical"')
  })

  it('ships one initial tab stop and removes the other six tabs from the tab order', () => {
    const html = renderSageDocument()
    const views = ['matter', 'overview', 'capabilities', 'governance', 'profile', 'readout', 'settings'] as const
    const tabs = views.map((view) => openingTag(html, { attribute: 'data-view', value: view }))

    expect(tabs.filter((tab) => tab.includes('tabindex="0"'))).toHaveLength(1)
    expect(tabs.filter((tab) => tab.includes('tabindex="-1"'))).toHaveLength(6)
  })

  it('keeps every tab name available when narrow-width CSS hides its visual label', () => {
    const html = renderSageDocument()
    const names = [
      ['matter', '经营事项'],
      ['overview', '总览'],
      ['capabilities', '能力'],
      ['governance', '治理'],
      ['profile', '个人资料'],
      ['readout', '只读呈现'],
      ['settings', '设置'],
    ] as const

    expect(html).toMatch(/@media\s*\(max-width:\s*800px\)[\s\S]*\.sage-nav-item\s*>\s*span:not\([^}]+display:\s*none/u)
    for (const [view, name] of names) {
      expect(openingTag(html, { attribute: 'data-view', value: view })).toContain(`aria-label="${name}"`)
    }
  })

  it('labels the wide trace rail as a complementary region before narrow modal promotion', () => {
    const html = renderSageDocument()
    const rail = openingTag(html, { attribute: 'id', value: 'matter-trace-rail' })

    expect(rail).toContain('role="complementary"')
    expect(rail).toContain('aria-labelledby="matter-trace-title"')
    expect(rail).toContain('tabindex="-1"')
  })

  it('keeps the served shell Sage-owned and excludes prototype or upstream runtime chrome', () => {
    const html = renderSageDocument()

    expect(html).toContain('<title>Sage</title>')
    expect(html).toContain('<div class="sage-brand" aria-label="Sage">')
    for (const forbidden of [
      'Qoder',
      'Sanbao',
      '__DSH_TRANSPORT__',
      'data-sanbao-composer',
      '<iframe',
      '<webview',
      'file://',
    ]) {
      expect(html).not.toContain(forbidden)
    }
  })

  it('ships visible keyboard focus and a reduced-motion override in the same document', () => {
    const html = renderSageDocument()

    expect(html).toMatch(/:where\(button, select, input, textarea\):focus-visible\s*\{[^}]*outline:/u)
    expect(html).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*animation-duration:\s*\.01ms\s*!important/u)
    expect(html).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*transition-duration:\s*\.01ms\s*!important/u)
  })
})
