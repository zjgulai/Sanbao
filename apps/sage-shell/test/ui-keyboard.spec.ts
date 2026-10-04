import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'
import { createDocumentStub, FakeElement } from './support/sage-page.js'

const VIEWS = ['matter', 'search', 'automation', 'knowledge', 'capabilities', 'settings'] as const

async function bootNavigationPage(): Promise<{
  readonly tabs: Readonly<Record<(typeof VIEWS)[number], FakeElement>>
  readonly panels: Readonly<Record<(typeof VIEWS)[number], FakeElement>>
}> {
  const { document } = createDocumentStub()
  const tabs = Object.fromEntries(VIEWS.map((view) => {
    const tab = new FakeElement('button')
    tab.id = `view-${view}`
    tab.dataset.view = view
    return [view, tab]
  })) as Record<(typeof VIEWS)[number], FakeElement>
  const panels = Object.fromEntries(VIEWS.map((view) => {
    const panel = new FakeElement('section')
    panel.id = `panel-${view}`
    panel.dataset.panel = view
    return [view, panel]
  })) as Record<(typeof VIEWS)[number], FakeElement>
  document.querySelectorAll = (selector: string): FakeElement[] => {
    if (selector === '[data-view]') return VIEWS.map((view) => tabs[view])
    if (selector === '[data-panel]') return VIEWS.map((view) => panels[view])
    return []
  }

  const script = renderSageDocument().match(/<script>([\s\S]*)<\/script>/u)?.[1]
  expect(script, 'embedded script must be extractable').toBeTruthy()
  const fetchStub = async (): Promise<unknown> => ({
    ok: true,
    json: async () => statePayload({}),
  })
  const run = new Function('document', 'fetch', 'setInterval', script as string)
  run(document, fetchStub, () => 0)
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  return { tabs, panels }
}

describe('Sage shell keyboard behavior', () => {
  // UI-DECISION-01 / P2: the narrow trace drawer state machine moved to the React region;
  // its keyboard/focus/ARIA contract is pinned in test/product-app/matter-region.spec.tsx
  // and re-verified in real Chromium by sage-fixture-projection-probe.
  it('moves selection and focus through the vertical tablist with ArrowDown and ArrowUp', async () => {
    const page = await bootNavigationPage()
    let downPrevented = false
    let upPrevented = false

    page.tabs.matter.dispatch('keydown', {
      key: 'ArrowDown',
      preventDefault: () => { downPrevented = true },
    } as unknown as { target?: unknown })

    expect(downPrevented).toBe(true)
    expect(page.tabs.matter.tabIndex).toBe(-1)
    expect(page.tabs.matter.attributes['aria-selected']).toBe('false')
    expect(page.tabs.search.tabIndex).toBe(0)
    expect(page.tabs.search.attributes['aria-selected']).toBe('true')
    expect(page.tabs.search.focusCount).toBe(1)
    expect(page.panels.matter.hidden).toBe(true)
    expect(page.panels.search.hidden).toBe(false)

    page.tabs.search.dispatch('keydown', {
      key: 'ArrowUp',
      preventDefault: () => { upPrevented = true },
    } as unknown as { target?: unknown })

    expect(upPrevented).toBe(true)
    expect(page.tabs.matter.tabIndex).toBe(0)
    expect(page.tabs.matter.attributes['aria-selected']).toBe('true')
    expect(page.tabs.matter.focusCount).toBe(1)
    expect(page.tabs.search.tabIndex).toBe(-1)
    expect(page.tabs.search.attributes['aria-selected']).toBe('false')
  })

  it('closes the user menu on Escape, synchronizes aria-expanded, and returns focus', async () => {
    const page = await bootSagePage(statePayload({}))
    const trigger = page.node('user-menu')
    const panel = page.node('user-menu-panel')
    let prevented = false

    panel.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    trigger.dispatch('click')

    expect(panel.hidden).toBe(false)
    expect(trigger.attributes['aria-expanded']).toBe('true')

    panel.dispatch('keydown', {
      key: 'Escape',
      preventDefault: () => { prevented = true },
    } as unknown as { target?: unknown })

    expect(prevented).toBe(true)
    expect(panel.hidden).toBe(true)
    expect(trigger.attributes['aria-expanded']).toBe('false')
    expect(trigger.focusCount).toBe(1)
  })

  it('closes the user menu when Escape originates from the still-focused trigger', async () => {
    const page = await bootSagePage(statePayload({}))
    const trigger = page.node('user-menu')
    const panel = page.node('user-menu-panel')
    let prevented = false

    panel.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    trigger.dispatch('click')
    trigger.dispatch('keydown', {
      key: 'Escape',
      target: trigger,
      preventDefault: () => { prevented = true },
    } as unknown as { target?: unknown })

    expect(prevented).toBe(true)
    expect(panel.hidden).toBe(true)
    expect(trigger.attributes['aria-expanded']).toBe('false')
  })
})
