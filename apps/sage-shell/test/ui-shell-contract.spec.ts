import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'

function openingTag(html: string, selector: { readonly attribute: string, readonly value: string }): string {
  const escaped = selector.value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = html.match(new RegExp(`<[^>]+${selector.attribute}="${escaped}"[^>]*>`, 'u'))
  expect(match, `${selector.attribute}=${selector.value} must exist`).not.toBeNull()
  return match![0]
}

describe('Sage shell semantic contract', () => {
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
