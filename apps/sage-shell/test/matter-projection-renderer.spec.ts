import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import {
  createSageFixtureViewState,
  SAGE_FIXTURE_STAGES,
  type SageFixtureStage,
  type SageMatterViewState,
} from '../src/product/view-state.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

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

  it('marks only the current stage across six consecutive states and clears it for unavailable or invalid input', async () => {
    const fixtures = SAGE_FIXTURE_STAGES.map((stage) => createSageFixtureViewState(stage))
    const allTraceIds = new Set(fixtures.flatMap((fixture) => [
      ...fixture.decisions.map((entry) => entry.decisionId),
      ...fixture.attempts.map((entry) => entry.attemptId),
      ...fixture.artifacts.map((entry) => entry.artifactId),
      ...fixture.receipts.map((entry) => entry.receiptId),
    ]))
    const page = await bootSagePage(statePayload({ matter: fixtures[0] }))

    for (const fixture of fixtures) {
      const stage = fixture.matter.stage as SageFixtureStage
      page.setPayload(statePayload({ matter: fixture }))
      await page.refresh()

      expect(page.node('matter-stage-track').dataset.currentStage).toBe(stage)
      expect(SAGE_FIXTURE_STAGES.filter((candidate) => page.node(`matter-stage-${candidate}`).dataset.stageState === 'current')).toEqual([stage])
      for (const candidate of SAGE_FIXTURE_STAGES) {
        const current = candidate === stage
        expect(page.node(`matter-stage-${candidate}`).dataset.stageState).toBe(current ? 'current' : 'idle')
        expect(page.node(`matter-stage-${candidate}`).attributes['aria-current']).toBe(current ? 'step' : 'false')
      }
      expect(page.node('matter-panel-source').textContent).toBe('fixture projection')
      expect(page.node('matter-decision-count').textContent).toBe(String(fixture.decisions.length))
      expect(page.node('matter-attempt-count').textContent).toBe(String(fixture.attempts.length))
      expect(page.node('matter-artifact-count').textContent).toBe(String(fixture.artifacts.length))
      expect(page.node('matter-receipt-count').textContent).toBe(String(fixture.receipts.length))
      const traceText = [
        page.node('matter-decision-rows').textContent,
        page.node('matter-attempt-rows').textContent,
        page.node('matter-artifact-rows').textContent,
        page.node('matter-receipt-rows').textContent,
      ].join('\n')
      const expectedTraceIds = new Set([
        ...fixture.decisions.map((entry) => entry.decisionId),
        ...fixture.attempts.map((entry) => entry.attemptId),
        ...fixture.artifacts.map((entry) => entry.artifactId),
        ...fixture.receipts.map((entry) => entry.receiptId),
      ])
      for (const traceId of allTraceIds) {
        expect(traceText.includes(traceId)).toBe(expectedTraceIds.has(traceId))
      }
      expect(page.node('matter-clarification').textContent).toBe(
        fixture.matter.pendingClarification === undefined
          ? '当前没有待回答澄清。'
          : `${fixture.matter.pendingClarification.reason} · ${fixture.matter.pendingClarification.requestedAt}`,
      )
      expect(page.node('matter-action-previews').children.map((entry) => entry.dataset.actionPreview)).toEqual(
        fixture.actions.map((entry) => entry.type),
      )
    }

    page.setPayload(statePayload({ matter: null }))
    await page.refresh()
    expect(page.node('matter-stage-track').dataset.currentStage).toBe('unavailable')
    expect(SAGE_FIXTURE_STAGES.every((stage) => page.node(`matter-stage-${stage}`).dataset.stageState === 'idle')).toBe(true)
    expect(page.node('matter-attempt-count').textContent).toBe('—')
    expect(page.node('matter-attempt-rows').textContent).not.toContain('attempt:sage.shopify-abi.fixture')
    expect(page.node('matter-clarification').textContent).toContain('投影不可用')
    expect(page.node('matter-action-previews').children).toHaveLength(0)

    const malformed = { ...createSageFixtureViewState('failed-retry'), schemaVersion: 'sage.matter-view.v0' }
    page.setPayload(statePayload({ matter: malformed }))
    await page.refresh()
    expect(page.node('matter-stage-track').dataset.currentStage).toBe('unavailable')
    expect(SAGE_FIXTURE_STAGES.every((stage) => page.node(`matter-stage-${stage}`).attributes['aria-current'] === 'false')).toBe(true)
    expect(page.node('matter-decision-count').textContent).toBe('—')
    expect(page.node('matter-attempt-rows').textContent).not.toContain('attempt:sage.shopify-abi.fixture')
    expect(page.node('matter-action-previews').children).toHaveLength(0)

    page.setPayload(statePayload({ matter: liveMatter() }))
    await page.refresh()
    expect(page.node('matter-stage-track').dataset.currentStage).toBe('running')
    expect(SAGE_FIXTURE_STAGES.filter((stage) => page.node(`matter-stage-${stage}`).dataset.stageState === 'current')).toEqual(['running'])
    expect(page.node('matter-panel-source').textContent).toBe('live projection')
    expect(page.node('matter-attempt-count').textContent).toBe('0')
    expect(page.node('matter-attempt-rows').textContent).not.toContain('attempt:sage.shopify-abi.fixture')
    expect(page.node('matter-clarification').textContent).toBe('当前没有待回答澄清。')
    expect(page.node('matter-action-previews').children.map((entry) => entry.dataset.actionPreview)).toEqual(['open-artifact'])
  })

  it('ships an unavailable initial shell instead of baking the fixture instance into production HTML', () => {
    const fixture = createSageFixtureViewState()
    const html = renderSageDocument()

    expect(html).toContain('data-matter-render-state="unavailable"')
    expect(html).not.toContain(fixture.matter.matterId)
    expect(html).not.toContain(fixture.matter.goal)
  })

  it('renders a null matter slot as stable unavailable and leaves no action surface behind', async () => {
    const page = await bootSagePage(statePayload({ matter: null }))

    expect(page.node('sage-workspace').dataset).toMatchObject({
      projectionSource: 'unavailable',
      matterRenderState: 'unavailable',
    })
    expect(page.node('matter-card-title').textContent).toBe('当前没有可用的事项投影')
    expect(page.node('matter-detail-id').textContent).toBe('—')
    expect(page.node('matter-detail-revision').textContent).toBe('—')
    expect(page.node('matter-detail-role').textContent).toBe('—')
    expect(page.node('matter-metric-evidence').textContent).toBe('—')
    expect(page.node('matter-metric-unknown').textContent).toBe('—')
    expect(page.node('matter-metric-dependency').textContent).toBe('—')
    expect(page.node('matter-clarification').textContent).toContain('投影不可用')
    expect(page.node('matter-action-previews').children).toHaveLength(0)
    expect(page.requests).toEqual([])
  })

  it('renders the exact nested fixture matter values rather than the component default', async () => {
    const fixture = createSageFixtureViewState()
    const page = await bootSagePage(statePayload({ matter: fixture }))

    expect(page.node('sage-workspace').dataset).toMatchObject({
      projectionSource: 'fixture',
      matterRenderState: 'fixture',
    })
    expect(page.node('matter-card-title').textContent).toBe(fixture.matter.goal)
    expect(page.node('matter-detail-goal').textContent).toBe(fixture.matter.goal)
    expect(page.node('matter-detail-id').textContent).toBe(fixture.matter.matterId)
    expect(page.node('matter-detail-revision').textContent).toBe(fixture.matter.currentRevisionId)
    expect(page.node('matter-detail-role').textContent).toBe(fixture.matter.responsiblePartyRoleRef)
    expect(page.node('matter-metric-evidence').textContent).toBe(String(fixture.matter.evidenceCount))
    expect(page.node('matter-metric-unknown').textContent).toBe(String(fixture.matter.unknownCount))
    expect(page.node('matter-metric-dependency').textContent).toBe(String(fixture.matter.dependencyCount))
    expect(page.node('matter-clarification').textContent).toContain(fixture.matter.pendingClarification?.reason ?? '')
    expect(page.node('matter-action-previews').children).toHaveLength(fixture.actions.length)
    expect(page.node('matter-action-previews').descendants().some((node) => node.tagName === 'button')).toBe(false)
    expect(page.requests).toEqual([])
  })

  it('renders distinct live wire values and keeps the read-only preview free of ActionIntent submission', async () => {
    const live = liveMatter()
    const page = await bootSagePage(statePayload({ matter: live }))

    expect(page.node('sage-workspace').dataset).toMatchObject({
      projectionSource: 'live',
      matterRenderState: 'live',
    })
    expect(page.node('matter-card-title').textContent).toBe('Wire 真实目标 <只作文本>')
    expect(page.node('matter-detail-goal').textContent).toBe('Wire 真实目标 <只作文本>')
    expect(page.node('matter-detail-id').textContent).toBe('matter:wire-live')
    expect(page.node('matter-detail-revision').textContent).toBe('revision:wire-live.7')
    expect(page.node('matter-detail-stage').textContent).toBe('执行中')
    expect(page.node('matter-detail-actionability').textContent).toBe('可提交')
    expect(page.node('matter-action-previews').children).toHaveLength(1)
    expect(page.node('matter-action-previews').descendants().some((node) => node.tagName === 'button')).toBe(false)
    expect(page.requests).toEqual([])
  })

  it('clears a prior live projection when the next exact envelope carries null', async () => {
    const page = await bootSagePage(statePayload({ matter: liveMatter() }))

    page.setPayload(statePayload({ matter: null }))
    await page.refresh()

    expect(page.node('sage-workspace').dataset).toMatchObject({
      projectionSource: 'unavailable',
      matterRenderState: 'unavailable',
    })
    expect(page.node('matter-card-title').textContent).toBe('当前没有可用的事项投影')
    expect(page.node('matter-detail-goal').textContent).not.toContain('Wire 真实目标')
    expect(page.node('matter-detail-id').textContent).toBe('—')
    expect(page.node('matter-detail-role').textContent).toBe('—')
    expect(page.node('matter-metric-evidence').textContent).toBe('—')
    expect(page.node('matter-clarification').textContent).not.toContain('市场信号')
    expect(page.node('matter-action-previews').children).toHaveLength(0)
  })

  it('renders the typed projection read-policy denial as unavailable and clears prior fixture facts', async () => {
    const page = await bootSagePage(statePayload({ matter: createSageFixtureViewState('failed-retry') }))

    page.setPayload({
      code: 'projection-read-unavailable',
      stage: 'read-policy',
      retryable: true,
      correlation: 'correlation:renderer-read-denial',
    })
    await page.refresh()

    expect(page.node('sage-workspace').dataset).toMatchObject({
      projectionSource: 'unavailable',
      matterRenderState: 'unavailable',
    })
    expect(page.node('matter-card-title').textContent).toBe('当前没有可用的事项投影')
    expect(page.node('matter-stage-track').dataset.currentStage).toBe('unavailable')
    expect(SAGE_FIXTURE_STAGES.every((stage) => page.node(`matter-stage-${stage}`).dataset.stageState === 'idle')).toBe(true)
    expect(page.node('matter-attempt-count').textContent).toBe('—')
    expect(page.node('matter-attempt-rows').textContent).not.toContain('attempt:sage.shopify-abi.fixture')
    expect(page.node('matter-clarification').textContent).toContain('投影不可用')
    expect(page.node('matter-action-previews').children).toHaveLength(0)
  })

  it('fails closed and clears a prior fixture when the nested matter shape is malformed', async () => {
    const fixture = createSageFixtureViewState()
    const page = await bootSagePage(statePayload({ matter: fixture }))

    page.setPayload(statePayload({ matter: { ...fixture, schemaVersion: 'sage.matter-view.v0' } }))
    await page.refresh()

    expect(page.node('sage-workspace').dataset).toMatchObject({
      projectionSource: 'unavailable',
      matterRenderState: 'invalid',
    })
    expect(page.node('matter-card-title').textContent).toBe('事项投影格式无效')
    expect(page.node('matter-detail-goal').textContent).not.toContain(fixture.matter.goal)
    expect(page.node('matter-action-previews').children).toHaveLength(0)
  })

  it('fails closed and clears a prior live projection when the envelope omits matter', async () => {
    const page = await bootSagePage(statePayload({ matter: liveMatter() }))

    const invalid = statePayload({})
    delete invalid.matter
    page.setPayload(invalid)
    await page.refresh()

    expect(page.node('sage-workspace').dataset).toMatchObject({
      projectionSource: 'unavailable',
      matterRenderState: 'invalid',
    })
    expect(page.node('matter-card-title').textContent).toBe('事项投影格式无效')
    expect(page.node('matter-detail-id').textContent).toBe('—')
    expect(page.node('matter-detail-goal').textContent).not.toContain('Wire 真实目标')
    expect(page.node('matter-action-previews').children).toHaveLength(0)
  })

  it('rejects the retired flat/off payload instead of treating it as a service-state envelope', async () => {
    const page = await bootSagePage(liveMatter())

    expect(page.node('sage-workspace').dataset).toMatchObject({
      projectionSource: 'unavailable',
      matterRenderState: 'invalid',
    })
    expect(page.node('matter-card-title').textContent).toBe('事项投影格式无效')
    expect(page.node('matter-detail-id').textContent).toBe('—')
    expect(page.node('matter-action-previews').children).toHaveLength(0)
  })
})
