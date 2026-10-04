/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'

/**
 * UI-DECISION-01 / P1 (ADR-0261): the React app seam must mount through the
 * real React runtime in a DOM environment — hidden, and only when the served
 * document provides #sage-app-root. Region takeovers start at P2; this spec
 * only proves the P1 mount seam itself.
 */
describe('product app mount seam (jsdom)', () => {
  it('mounts the hidden P1 marker into #sage-app-root and raises the mounted flag', async () => {
    const host = document.createElement('div')
    host.id = 'sage-app-root'
    host.hidden = true
    document.body.append(host)

    await import('../../src/product/app/main.js')

    await vi.waitFor(() => {
      expect(host.querySelector('[data-sage-app="p1-infrastructure"]')).not.toBeNull()
      expect(window.__SAGE_APP_MOUNTED__).toBe(true)
    })
    expect(host.querySelector('[data-sage-app="p1-infrastructure"]')?.getAttribute('hidden')).not.toBeNull()
    host.remove()
  })
})
