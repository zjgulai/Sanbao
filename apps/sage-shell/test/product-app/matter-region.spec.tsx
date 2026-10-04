/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createSageFixtureViewState,
  type SageMatterViewState,
} from '../../src/product/view-state.js'
import { createAppBridgeStore, type AppBridgeStore } from '../../src/product/app/bridge.js'
import { MatterRegion } from '../../src/product/app/matter-view.js'

/**
 * UI-DECISION-01 / P2 (ADR-0261): the matter workbench region (heading + focus card + trace
 * rail) is owned by this React component from the bridge message alone. The window probes
 * re-assert the same DOM in real Chromium; this spec pins the mapping and the narrow-drawer
 * keyboard contract in jsdom.
 */

const originalMatchMedia = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia')
const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT

interface MediaStub {
  readonly setMatches: (next: boolean) => void
  readonly triggerChange: () => void
}

function stubMatchMedia(initial: boolean): MediaStub {
  let matches = initial
  const listeners = new Set<() => void>()
  const media = {
    get matches(): boolean { return matches },
    media: '(max-width: 900px)',
    addEventListener: (type: string, listener: () => void): void => {
      if (type === 'change') listeners.add(listener)
    },
    removeEventListener: (type: string, listener: () => void): void => {
      listeners.delete(listener)
    },
  }
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => media })
  return {
    setMatches: (next: boolean): void => { matches = next },
    triggerChange: (): void => { for (const listener of listeners) listener() },
  }
}

interface Mounted {
  readonly container: HTMLElement
  readonly store: AppBridgeStore
  readonly unmount: () => void
}

const mounted: Mounted[] = []

function mountRegion(): Mounted {
  const container = document.createElement('div')
  container.id = 'sage-matter-region'
  document.body.append(container)
  const store = createAppBridgeStore()
  const root = createRoot(container)
  act(() => { root.render(createElement(MatterRegion, { store, container })) })
  const entry: Mounted = {
    container,
    store,
    unmount: () => {
      act(() => { root.unmount() })
      container.remove()
    },
  }
  mounted.push(entry)
  return entry
}

function node(container: HTMLElement, selector: string): Element {
  const found = container.querySelector(selector)
  expect(found, selector).not.toBeNull()
  return found as Element
}

function setMessage(store: AppBridgeStore, projection: SageMatterViewState | null, kind?: 'invalid'): void {
  act(() => {
    if (kind === 'invalid') store.setRegion('matter', { kind: 'invalid' })
    else if (projection === null) store.setRegion('matter', { kind: 'unavailable' })
    else store.setRegion('matter', { kind: 'projection', projection })
  })
}

function tracedMatter(): SageMatterViewState {
  const fixture = createSageFixtureViewState()
  return {
    ...fixture,
    matter: {
      ...fixture.matter,
      stage: 'artifact-receipt',
      evidenceCount: 4,
      unknownCount: 2,
      dependencyCount: 3,
      pendingClarification: undefined,
    },
    decisions: [{
      decisionId: 'decision:fixture.1',
      revisionId: fixture.matter.currentRevisionId!,
      actionScope: 'shopify.orders.read',
      status: 'approved',
      expiresAt: '2026-10-04T00:00:00.000Z',
    }],
    attempts: [{
      attemptId: 'attempt:fixture.1',
      revisionId: fixture.matter.currentRevisionId!,
      status: 'succeeded',
      startedAt: '2026-10-03T01:00:00.000Z',
      endedAt: '2026-10-03T01:02:00.000Z',
    }],
    artifacts: [{
      artifactId: 'artifact:fixture.1',
      revisionId: fixture.matter.currentRevisionId!,
      attemptId: 'attempt:fixture.1',
      kind: 'report',
      recordedAt: '2026-10-03T01:03:00.000Z',
    }],
    receipts: [{
      receiptId: 'receipt:fixture.1',
      revisionId: fixture.matter.currentRevisionId!,
      artifactId: 'artifact:fixture.1',
      verdict: 'accepted',
      actorRoleRef: 'role:fixture-reviewer',
      recordedAt: '2026-10-03T01:04:00.000Z',
    }],
  }
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount()
  if (originalMatchMedia === undefined) Reflect.deleteProperty(globalThis, 'matchMedia')
  else Object.defineProperty(globalThis, 'matchMedia', originalMatchMedia)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

describe('matter region (React)', () => {
  it('renders the fixture projection with every workbench id, metric and trace entry', () => {
    const { container, store } = mountRegion()
    const matter = tracedMatter()
    setMessage(store, matter)

    expect(container.getAttribute('data-matter-region-state')).toBe('fixture')
    expect(node(container, '#matter-detail-goal').textContent).toBe(matter.matter.goal)
    expect(node(container, '#matter-detail-id').textContent).toBe(matter.matter.matterId)
    expect(node(container, '#matter-detail-revision').textContent).toBe(matter.matter.currentRevisionId)
    expect(node(container, '#matter-detail-role').textContent).toBe(matter.matter.responsiblePartyRoleRef)
    expect(node(container, '#matter-detail-stage').textContent).toBe('等待回执')
    expect(node(container, '#matter-metric-evidence').textContent).toBe('4')
    expect(node(container, '#matter-metric-unknown').textContent).toBe('2')
    expect(node(container, '#matter-metric-dependency').textContent).toBe('3')
    expect(node(container, '#matter-clarification').textContent).toBe('当前没有待回答澄清。')
    expect(node(container, '#matter-panel-source').textContent).toBe('fixture projection')
    expect(node(container, '#matter-action-source').textContent).toBe('不提交 · fixture')

    const track = node(container, '#matter-stage-track')
    expect(track.getAttribute('data-current-stage')).toBe('artifact-receipt')
    const currentStages = Array.from(container.querySelectorAll('[data-matter-stage]'))
      .filter((item) => item.getAttribute('data-stage-state') === 'current')
      .map((item) => item.id)
    expect(currentStages).toEqual(['matter-stage-artifact-receipt'])
    for (const item of container.querySelectorAll('[data-matter-stage]')) {
      const current = item.id === 'matter-stage-artifact-receipt'
      expect(item.getAttribute('data-stage-state')).toBe(current ? 'current' : 'idle')
      expect(item.getAttribute('aria-current')).toBe(current ? 'step' : 'false')
    }

    expect(node(container, '#matter-decision-count').textContent).toBe('1')
    expect(node(container, '#matter-attempt-count').textContent).toBe('1')
    expect(node(container, '#matter-artifact-count').textContent).toBe('1')
    expect(node(container, '#matter-receipt-count').textContent).toBe('1')
    expect(node(container, '#matter-decision-rows').textContent).toContain('decision:fixture.1')
    expect(node(container, '#matter-attempt-rows').textContent).toContain('attempt:fixture.1')
    expect(node(container, '#matter-artifact-rows').textContent).toContain('artifact:fixture.1')
    expect(node(container, '#matter-receipt-rows').textContent).toContain('receipt:fixture.1')
    expect(node(container, '#matter-decision-rows').textContent).toContain('范围 shopify.orders.read')
    expect(node(container, '#matter-receipt-rows').textContent).toContain('责任角色 role:fixture-reviewer')

    const previews = container.querySelectorAll('#matter-action-previews [data-action-preview]')
    expect(Array.from(previews).map((preview) => preview.getAttribute('data-action-preview'))).toEqual(
      matter.actions.map((action) => action.type),
    )
    for (const preview of previews) {
      expect(preview.getAttribute('data-submission-state')).toBe('not-submitted')
      expect(preview.querySelector('.sage-action-preview-state')?.classList.contains('is-blocked')).toBe(true)
    }
    expect(container.querySelectorAll('#matter-action-previews button')).toHaveLength(0)
    expect(container.querySelectorAll('#matter-readonly-composer form, #matter-readonly-composer input, #matter-readonly-composer textarea, #matter-readonly-composer button')).toHaveLength(0)
  })

  it('renders a live projection with distinct wire values and an unsubmitted preview surface', () => {
    const { container, store } = mountRegion()
    const fixture = createSageFixtureViewState()
    const live: SageMatterViewState = {
      ...fixture,
      projectionSource: 'live',
      matter: {
        ...fixture.matter,
        matterId: 'matter:wire-live',
        goal: 'Wire 真实目标 <只作文本>',
        responsiblePartyRoleRef: 'role:wire-owner',
        stage: 'running',
        pendingClarification: undefined,
        currentRevisionId: 'revision:wire-live.7',
        revisionCount: 7,
      },
      compatibilityOutcome: 'equivalent',
      authorizationState: 'authorized',
      availabilityState: 'available',
      actionability: 'allowed',
      denialReason: undefined,
      actions: [{
        type: 'open-artifact',
        revisionId: 'revision:wire-live.7',
        actionScope: 'artifact.read',
        actionability: 'allowed',
        denialReason: undefined,
      }],
    }
    setMessage(store, live)

    expect(container.getAttribute('data-matter-region-state')).toBe('live')
    expect(node(container, '#matter-detail-goal').textContent).toBe('Wire 真实目标 <只作文本>')
    expect(node(container, '#matter-detail-id').textContent).toBe('matter:wire-live')
    expect(node(container, '#matter-detail-revision').textContent).toBe('revision:wire-live.7')
    expect(node(container, '#matter-detail-stage').textContent).toBe('执行中')
    expect(node(container, '#matter-detail-actionability').textContent).toBe('可提交')
    expect(node(container, '#matter-panel-source').textContent).toBe('live projection')
    expect(container.querySelectorAll('#matter-action-previews [data-action-preview]')).toHaveLength(1)
    expect(container.querySelectorAll('#matter-action-previews button')).toHaveLength(0)
  })

  it('renders the fail-closed unavailable region and clears the prior projection', () => {
    const { container, store } = mountRegion()
    const matter = tracedMatter()
    setMessage(store, matter)
    setMessage(store, null)

    expect(container.getAttribute('data-matter-region-state')).toBe('unavailable')
    expect(node(container, '#matter-detail-goal').textContent).toBe('当前没有可用的事项投影')
    expect(node(container, '#matter-detail-id').textContent).toBe('—')
    expect(node(container, '#matter-detail-revision').textContent).toBe('—')
    expect(node(container, '#matter-detail-role').textContent).toBe('—')
    expect(node(container, '#matter-detail-stage').textContent).toBe('未读取')
    expect(node(container, '#matter-metric-evidence').textContent).toBe('—')
    expect(node(container, '#matter-metric-unknown').textContent).toBe('—')
    expect(node(container, '#matter-metric-dependency').textContent).toBe('—')
    expect(node(container, '#matter-clarification').textContent).toBe('事项投影不可用，未读取澄清状态。')
    expect(node(container, '#matter-detail-actionability').textContent).toBe('已阻断')
    expect(node(container, '#matter-detail-denial').textContent).toBe('事项投影不可用')
    expect(node(container, '#matter-stage-track').getAttribute('data-current-stage')).toBe('unavailable')
    expect(container.textContent).not.toContain('decision:fixture.1')
    expect(container.querySelectorAll('#matter-action-previews [data-action-preview]')).toHaveLength(0)
    expect(node(container, '#matter-decision-count').textContent).toBe('—')
    expect(node(container, '#matter-decision-rows').textContent).toBe('事项投影不可用，未读取决定。')
    expect(node(container, '#matter-receipt-rows').textContent).toBe('事项投影不可用，未读取回执。')
  })

  it('renders the invalid region distinctly from unavailable', () => {
    const { container, store } = mountRegion()
    setMessage(store, null, 'invalid')

    expect(container.getAttribute('data-matter-region-state')).toBe('invalid')
    expect(node(container, '#matter-detail-goal').textContent).toBe('事项投影格式无效')
    expect(node(container, '#matter-detail-stage').textContent).toBe('格式无效')
    expect(node(container, '#matter-detail-denial').textContent).toBe('事项投影格式无效')
    expect(node(container, '#matter-panel-source').textContent).toBe('projection invalid')
    expect(node(container, '#matter-action-source').textContent).toBe('不提交 · projection invalid')
  })

  it('starts the wide rail open and keeps the toggle screen-reader pairing', () => {
    const { container } = mountRegion()
    const rail = node(container, '#matter-trace-rail')
    const toggle = node(container, '#matter-trace-toggle')

    expect(toggle.getAttribute('aria-controls')).toBe('matter-trace-rail')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(rail.getAttribute('data-drawer-open')).toBe('true')
    expect(rail.getAttribute('data-drawer-modal')).toBe('false')
    expect(rail.getAttribute('role')).toBe('complementary')
    expect(rail.getAttribute('aria-modal')).toBe('false')
    expect(rail.getAttribute('aria-hidden')).toBe('false')
  })

  it('drives the narrow drawer keyboard contract: open focuses close, Escape/Tab are contained, close restores focus', () => {
    const media = stubMatchMedia(true)
    const { container } = mountRegion()
    const rail = node(container, '#matter-trace-rail')
    const toggle = node(container, '#matter-trace-toggle')
    const close = node(container, '#matter-trace-close')

    expect(rail.getAttribute('data-drawer-open')).toBe('false')
    expect(rail.getAttribute('aria-hidden')).toBe('true')
    expect(rail.getAttribute('role')).toBe('complementary')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    act(() => { (toggle as HTMLElement).click() })
    expect(rail.getAttribute('data-drawer-open')).toBe('true')
    expect(rail.getAttribute('data-drawer-modal')).toBe('true')
    expect(rail.getAttribute('role')).toBe('dialog')
    expect(rail.getAttribute('aria-modal')).toBe('true')
    expect(rail.getAttribute('aria-hidden')).toBe('false')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(close)

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    act(() => { rail.dispatchEvent(tabEvent) })
    expect(tabEvent.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(close)

    let documentEscapeSeen = 0
    const documentListener = (): void => { documentEscapeSeen += 1 }
    document.addEventListener('keydown', documentListener)
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    act(() => { rail.dispatchEvent(escapeEvent) })
    document.removeEventListener('keydown', documentListener)
    expect(escapeEvent.defaultPrevented).toBe(true)
    expect(documentEscapeSeen).toBe(0)
    expect(rail.getAttribute('data-drawer-open')).toBe('false')
    expect(rail.getAttribute('aria-hidden')).toBe('true')
    expect(document.activeElement).toBe(toggle)

    act(() => { (toggle as HTMLElement).click() })
    act(() => { (close as HTMLElement).click() })
    expect(rail.getAttribute('data-drawer-open')).toBe('false')
    expect(document.activeElement).toBe(toggle)

    act(() => { (toggle as HTMLElement).click() })
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    expect(rail.getAttribute('data-drawer-open')).toBe('false')
    expect(document.activeElement).toBe(toggle)

    media.setMatches(false)
    act(() => { (toggle as HTMLElement).click() })
    act(() => { media.triggerChange() })
    expect(rail.getAttribute('data-drawer-open')).toBe('true')
    media.setMatches(true)
    act(() => { media.triggerChange() })
    expect(rail.getAttribute('data-drawer-open')).toBe('false')
  })

  it('closes the drawer when the bridge announces leaving the matter view and reopens it on return', () => {
    const { container, store } = mountRegion()
    const rail = node(container, '#matter-trace-rail')

    expect(rail.getAttribute('data-drawer-open')).toBe('true')
    act(() => { store.setView('search') })
    expect(rail.getAttribute('data-drawer-open')).toBe('false')
    act(() => { store.setView('matter') })
    expect(rail.getAttribute('data-drawer-open')).toBe('true')
  })
})
