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

async function withNarrowViewport<T>(run: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia')
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: true,
      addEventListener: () => undefined,
    }),
  })
  try {
    return await run()
  } finally {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, 'matchMedia')
    else Object.defineProperty(globalThis, 'matchMedia', descriptor)
  }
}

describe('Sage shell keyboard behavior', () => {
  it('closes the narrow trace drawer on Escape and restores focus to its trigger', async () => {
    const page = await bootSagePage(statePayload({}))
    const trigger = page.node('matter-trace-toggle')
    const rail = page.node('matter-trace-rail')
    let prevented = false

    trigger.dispatch('click')

    expect(trigger.attributes['aria-expanded']).toBe('true')
    expect(rail.dataset.drawerOpen).toBe('true')
    expect(rail.attributes['aria-hidden']).toBe('false')

    rail.dispatch('keydown', {
      key: 'Escape',
      preventDefault: () => { prevented = true },
    } as unknown as { target?: unknown })

    expect(prevented).toBe(true)
    expect(trigger.attributes['aria-expanded']).toBe('false')
    expect(rail.dataset.drawerOpen).toBe('false')
    expect(rail.attributes['aria-hidden']).toBe('true')
    expect(trigger.focusCount).toBe(1)
    expect(page.requests).toEqual([])
  })

  it('closes the narrow trace drawer from its close button and restores trigger focus', async () => {
    const page = await bootSagePage(statePayload({}))
    const trigger = page.node('matter-trace-toggle')
    const rail = page.node('matter-trace-rail')
    const close = page.node('matter-trace-close')

    trigger.dispatch('click')
    close.dispatch('click')

    expect(trigger.attributes['aria-expanded']).toBe('false')
    expect(rail.dataset.drawerOpen).toBe('false')
    expect(rail.attributes['aria-hidden']).toBe('true')
    expect(trigger.focusCount).toBe(1)
    expect(page.requests).toEqual([])
  })

  it('contains Tab focus inside the open single-control trace dialog', async () => {
    await withNarrowViewport(async () => {
      const page = await bootSagePage(statePayload({}))
      const trigger = page.node('matter-trace-toggle')
      const rail = page.node('matter-trace-rail')
      const close = page.node('matter-trace-close')
      let prevented = false

      trigger.dispatch('click')
      expect(close.focusCount).toBe(1)

      rail.dispatch('keydown', {
        key: 'Tab',
        target: close,
        preventDefault: () => { prevented = true },
      } as unknown as { target?: unknown })

      expect(prevented).toBe(true)
      expect(close.focusCount).toBe(2)

      let reversePrevented = false
      rail.dispatch('keydown', {
        key: 'Tab',
        shiftKey: true,
        target: close,
        preventDefault: () => { reversePrevented = true },
      } as unknown as { target?: unknown })

      expect(reversePrevented).toBe(true)
      expect(close.focusCount).toBe(3)
    })
  })

  it('marks the trace rail modal only while it is opened as a narrow drawer', async () => {
    await withNarrowViewport(async () => {
      const page = await bootSagePage(statePayload({}))
      const trigger = page.node('matter-trace-toggle')
      const rail = page.node('matter-trace-rail')

      expect(rail.attributes['aria-modal']).toBe('false')
      trigger.dispatch('click')
      expect(rail.attributes.role).toBe('dialog')
      expect(rail.attributes['aria-modal']).toBe('true')
      page.node('matter-trace-close').dispatch('click')
      expect(rail.attributes['aria-modal']).toBe('false')
    })
  })

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
