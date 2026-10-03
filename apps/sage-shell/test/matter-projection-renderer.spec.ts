import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { createSageFixtureViewState, type SageMatterViewState } from '../src/product/view-state.js'
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
