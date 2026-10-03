import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

describe('Sage shell keyboard behavior', () => {
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
})
