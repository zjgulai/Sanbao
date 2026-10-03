import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 044 on the shipped page (US-205): the separate-window entry appears ONLY alongside an
 * already-open preview (no card render, no boot, no panel open creates a window); one explicit
 * click is one named request bound to the same loaded version; closing returns to the side
 * container without changing the artifact record — and the wording never claims a reload or a
 * regenerated document.
 */

const cards = [
  { artifactId: 'art-html', name: 'page.html', kind: 'html', bytes: 10, version: 'v3', state: 'ready', source: 'changes-observed', observedAt: 't' },
]

const preview = (overrides: Record<string, unknown> = {}) => ({ state: 'ready', artifactId: 'art-html', name: 'page.html', kind: 'html', version: 'v3', expanded: false, window: false, ...overrides })

const payload = (previewState: Record<string, unknown> = preview()) => statePayload({
  artifacts: { state: 'read', cards, preview: previewState },
})

describe('the separate preview window entry (ticket 044)', () => {
  it('appears only with an open preview; the card render and panel open never touch the window route', async () => {
    const closed = await bootSagePage(payload({ state: 'closed' }), {
      '/.sage/artifacts/open': { state: 'opened', preview: preview() },
    })
    await closed.refresh()
    expect(closed.node('artifact-window').hidden).toBe(true)
    // The panel open request carries no window action; the window stays untouched.
    closed.node('artifact-cards').dispatch('click', { target: closed.node('artifact-cards').children[0]?.querySelector('[data-artifact-action="open"]') })
    await closed.settle()
    expect(closed.requests.map((request) => request.path)).toEqual(['/.sage/artifacts/open'])
  })

  it('offers the explicit entry once ready, opens with one named request, and closes back to the panel layout', async () => {
    const harness = await bootSagePage(payload(), {
      '/.sage/artifacts/window': (body: unknown) => (
        (body as { action?: string }).action === 'open'
          ? { state: 'opened', preview: preview({ window: true }) }
          : { state: 'closed', preview: preview({ window: false }) }
      ),
    })
    await harness.refresh()
    const button = harness.node('artifact-window')
    expect(button.hidden).toBe(false)
    expect(button.textContent).toBe('在独立窗口打开（同一版本）')
    expect(button.dataset.windowOpen).toBe('false')
    // 显式动作前不创建窗口：opening the entrance performs no request at all until the click.
    expect(harness.requests).toEqual([])

    button.dispatch('click', { target: button })
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/artifacts/window', body: { action: 'open' } }])
    expect(harness.node('artifact-note').textContent).toContain('已在独立窗口打开（同一版本引用；未重读、未重跑生成）。')
    expect(harness.node('artifact-note').textContent).not.toContain('已重新加载')

    harness.setPayload(payload(preview({ window: true })))
    await harness.refresh()
    expect(harness.node('artifact-window').textContent).toBe('关闭独立窗口')
    expect(harness.node('artifact-window').dataset.windowOpen).toBe('true')
    // The projection sentence (no local notice in the way) carries the same-version wording.
    const fresh = await bootSagePage(payload(preview({ window: true })))
    await fresh.refresh()
    expect(fresh.node('artifact-preview-note').textContent).toContain('独立窗口已打开：同一文档、同一版本引用；关闭独立窗口不改产物记录')

    harness.node('artifact-window').dispatch('click', { target: harness.node('artifact-window') })
    await harness.settle()
    expect(harness.requests).toEqual([
      { path: '/.sage/artifacts/window', body: { action: 'open' } },
      { path: '/.sage/artifacts/window', body: { action: 'close' } },
    ])
    expect(harness.node('artifact-note').textContent).toContain('已关闭独立窗口（回到侧栏容器；未改产物记录，运行不受影响）。')
  })

  it('an unwired window surface says so by name instead of pretending a window', async () => {
    const harness = await bootSagePage(payload(), {
      '/.sage/artifacts/window': { state: 'refused', code: 'artifact-window-unavailable' },
    })
    await harness.refresh()
    harness.node('artifact-window').dispatch('click', { target: harness.node('artifact-window') })
    await harness.settle()
    expect(harness.node('artifact-note').textContent).toContain('独立窗口未接线（本机不提供窗口能力）：未打开。')
  })
})
