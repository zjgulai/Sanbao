import { afterEach, describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import {
  createSageFixtureViewState,
  SAGE_FIXTURE_STAGES,
  type SageMatterViewState,
} from '../src/product/view-state.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * UI-DECISION-01 / P2 (ADR-0261, strangler): the matter workbench region (heading + focus card
 * + trace rail) is owned by the React app. The legacy inline script must NOT write that region
 * anymore — it validates the wire and hands the result to the `__SAGE_APP_SET_MATTER__` bridge,
 * which the React app subscribes to. These specs pin the wire → bridge contract and the
 * "region nodes stay untouched" sentinel; the rendered region DOM itself is covered by the
 * jsdom component spec (`test/product-app/matter-region.spec.ts`) and the real Electron probes.
 */

interface MatterBridgeMessage {
  readonly kind: string
  readonly projection?: unknown
}

interface BridgeSink {
  readonly messages: MatterBridgeMessage[]
  readonly restore: () => void
}

function installBridgeSink(): BridgeSink {
  const messages: MatterBridgeMessage[] = []
  const target = globalThis as { __SAGE_APP_SET_REGION__?: unknown }
  const previous = target.__SAGE_APP_SET_REGION__
  target.__SAGE_APP_SET_REGION__ = (region: string, message: MatterBridgeMessage): void => {
    if (region === 'matter') messages.push(message)
  }
  return {
    messages,
    restore: () => {
      if (previous === undefined) delete target.__SAGE_APP_SET_REGION__
      else target.__SAGE_APP_SET_REGION__ = previous
    },
  }
}

function liveMatter(): SageMatterViewState {
  const fixture = createSageFixtureViewState()
  return {
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
}

let sink: BridgeSink | undefined

afterEach(() => {
  sink?.restore()
  sink = undefined
})

/** The P2 sentinel: the script must never write these region nodes again. */
function expectRegionUntouched(page: Awaited<ReturnType<typeof bootSagePage>>): void {
  expect(page.node('matter-detail-goal').textContent).toBe('')
  expect(page.node('matter-detail-id').textContent).toBe('')
  expect(page.node('matter-stage-track').dataset.currentStage).toBeUndefined()
  expect(page.node('matter-metric-evidence').textContent).toBe('')
  expect(page.node('matter-decision-rows').children).toHaveLength(0)
  expect(page.node('matter-action-previews').children).toHaveLength(0)
  expect(page.node('matter-trace-toggle').attributes['aria-expanded']).toBeUndefined()
  expect(page.node('matter-trace-rail').dataset.drawerOpen).toBeUndefined()
  expect(Object.keys(page.node('matter-trace-toggle').listeners)).toHaveLength(0)
}

describe('matter projection renderer wire', () => {
  it('ships one six-stage rail without inventing completed stages or a write control', () => {
    const html = renderSageDocument()

    expect(html).toContain('id="matter-stage-track"')
    expect(html).toContain('data-current-stage="unavailable"')
    expect(html.match(/data-matter-stage="/gu)).toHaveLength(6)
    expect(html).not.toContain('aria-current="step"')
    for (const stage of SAGE_FIXTURE_STAGES) {
      expect(html).toContain(`id="matter-stage-${stage}"`)
      expect(html).toContain(`data-matter-stage="${stage}"`)
    }
    expect(html).not.toContain('data-stage-state="completed"')
    expect(html).not.toContain('data-stage-action')
  })

  it('ships the fail-closed matter region wrapper the React app takes over at runtime', () => {
    const html = renderSageDocument()

    expect(html).toContain('id="sage-matter-region"')
    expect(html).toContain('data-matter-region-state="unavailable"')
    expect(html.match(/id="sage-matter-region"/gu)).toHaveLength(1)
    expect(html.indexOf('id="sage-matter-region"')).toBeLessThan(html.indexOf('class="sage-section-heading"'))
    expect(html.indexOf('class="sage-section-heading"')).toBeLessThan(html.indexOf('id="matter-workbench"'))
  })

  it('ships an unavailable initial shell instead of baking the fixture instance into production HTML', () => {
    const fixture = createSageFixtureViewState()
    const html = renderSageDocument()

    expect(html).not.toContain(fixture.matter.matterId)
    expect(html).not.toContain(fixture.matter.goal)
  })

  it('hands the validated fixture projection to the bridge and leaves the region DOM untouched', async () => {
    sink = installBridgeSink()
    const fixture = createSageFixtureViewState()
    const page = await bootSagePage(statePayload({ matter: fixture }))

    expect(sink.messages.at(-1)).toEqual({ kind: 'projection', projection: fixture })
    expect(sink.messages.at(-1)?.projection).toBe(fixture)
    // Non-region facts stay with the legacy script (sidebar context + status pill).
    expect(page.node('matter-context-goal').textContent).toBe(fixture.matter.goal)
    expect(page.node('matter-context-id').textContent).toBe(fixture.matter.matterId)
    expect(page.node('matter-projection-pill').textContent).toBe('fixture projection · 不执行外部动作')
    expectRegionUntouched(page)

    page.setPayload(statePayload({ matter: null }))
    await page.refresh()
    expect(sink.messages.at(-1)).toEqual({ kind: 'unavailable' })
    expect(page.node('matter-context-goal').textContent).toBe('当前没有可用的事项投影')
    expectRegionUntouched(page)

    page.setPayload(statePayload({ matter: { ...fixture, schemaVersion: 'sage.matter-view.v0' } }))
    await page.refresh()
    expect(sink.messages.at(-1)).toEqual({ kind: 'invalid' })
    expectRegionUntouched(page)

    page.setPayload(statePayload({ matter: liveMatter() }))
    await page.refresh()
    const last = sink.messages.at(-1)
    expect(last?.kind).toBe('projection')
    expect((last?.projection as SageMatterViewState).projectionSource).toBe('live')
    expect(page.node('matter-projection-pill').textContent).toBe('live projection · 不执行外部动作')
    expectRegionUntouched(page)
  })

  it('maps the typed read-policy denial and a missing matter slot to the unavailable kind', async () => {
    sink = installBridgeSink()
    const page = await bootSagePage(statePayload({ matter: createSageFixtureViewState('failed-retry') }))

    page.setPayload({
      code: 'projection-read-unavailable',
      stage: 'read-policy',
      retryable: true,
      correlation: 'correlation:renderer-read-denial',
    })
    await page.refresh()
    expect(sink.messages.at(-1)).toEqual({ kind: 'unavailable' })
    expectRegionUntouched(page)

    const invalid = statePayload({ matter: liveMatter() })
    delete invalid.matter
    page.setPayload(invalid)
    await page.refresh()
    expect(sink.messages.at(-1)).toEqual({ kind: 'invalid' })
    expectRegionUntouched(page)
  })

  it('rejects the retired flat/off payload instead of treating it as a service-state envelope', async () => {
    sink = installBridgeSink()
    const page = await bootSagePage(liveMatter())

    expect(sink.messages.at(-1)).toEqual({ kind: 'invalid' })
    expect(page.node('matter-context-goal').textContent).toBe('当前没有可用的事项投影')
    expectRegionUntouched(page)
  })
})
