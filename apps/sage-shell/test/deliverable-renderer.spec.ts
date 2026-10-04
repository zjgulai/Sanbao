import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 033 remaining legacy slice (batch 16 moved the typed tool-result rows and the
 * web-deliverables catalog to their React regions — see `support-cards-bridge.spec.ts` and
 * `test/product-app/sites-tool-results.spec.tsx`): the side-preview's full-view switch still
 * belongs to the artifact card (D4), which stays legacy until its own migration batch.
 */

const preview = (overrides: Record<string, unknown> = {}) => ({ state: 'ready', artifactId: 'art-html', name: 'page.html', kind: 'html', version: 'v3', expanded: false, ...overrides })

const payload = (extra: Record<string, unknown> = {}) => statePayload({
  artifacts: { state: 'read', cards: [], preview: preview(), ...(extra.artifacts as Record<string, unknown> ?? {}) },
  ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'artifacts')),
})

describe('the preview full-view switch (ticket 033)', () => {
  it('moves the same document: exact body, no reload, label flips, and exit restores focus', async () => {
    const harness = await bootSagePage(payload())
    const expand = harness.node('artifact-expand')
    expect(expand.hidden).toBe(false)
    expect(expand.textContent).toBe('全屏查看（离线）')
    harness.node('artifact-expand').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/artifacts/fullscreen', body: { on: true } }])

    // The projection now says expanded: the label flips and the note states the no-reload fact.
    harness.setPayload(payload({ artifacts: { preview: preview({ expanded: true }) } }))
    await harness.refresh()
    expect(harness.node('artifact-expand').textContent).toBe('退出全屏（返回侧栏）')
    expect(harness.node('artifact-preview-note').textContent).toContain('全屏查看：同一文档，未重新加载、未重读版本')

    const before = harness.node('artifact-expand').focusCount
    harness.node('artifact-expand').dispatch('click')
    await harness.settle()
    expect(harness.requests[1]).toEqual({ path: '/.sage/artifacts/fullscreen', body: { on: false } })
    // 全屏退出恢复焦点：焦点回到触发器。
    expect(harness.node('artifact-expand').focusCount).toBeGreaterThan(before)
  })

  it('hides the switch until a preview is ready', async () => {
    const harness = await bootSagePage(payload({ artifacts: { preview: { state: 'closed' } } }))
    expect(harness.node('artifact-expand').hidden).toBe(true)
    const failed = await bootSagePage(payload({ artifacts: { preview: { state: 'failed', artifactId: 'a', name: 'n', code: 'artifact-load-failed', retryable: true } } }))
    expect(failed.node('artifact-expand').hidden).toBe(true)
  })
})
