import { describe, expect, it } from 'vitest'

import { createSageFixtureViewState, type SageMatterViewState } from '../src/product/view-state.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

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

describe('BusinessMatter read-only workbench IA', () => {
  it('renders ViewState counts and every trace collection without synthesizing progress', async () => {
    const matter = tracedMatter()
    const page = await bootSagePage(statePayload({ matter }))

    expect(page.node('matter-metric-evidence').textContent).toBe('4')
    expect(page.node('matter-metric-unknown').textContent).toBe('2')
    expect(page.node('matter-metric-dependency').textContent).toBe('3')
    expect(page.node('matter-clarification').textContent).toContain('当前没有待回答澄清')
    expect(page.node('matter-decision-rows').textContent).toContain('decision:fixture.1')
    expect(page.node('matter-attempt-rows').textContent).toContain('attempt:fixture.1')
    expect(page.node('matter-artifact-rows').textContent).toContain('artifact:fixture.1')
    expect(page.node('matter-receipt-rows').textContent).toContain('receipt:fixture.1')
    expect(page.requests).toEqual([])
  })

  it('clears all prior trace rows and context when the projection becomes malformed', async () => {
    const page = await bootSagePage(statePayload({ matter: tracedMatter() }))

    page.setPayload(statePayload({ matter: { ...tracedMatter(), decisions: [{}] } }))
    await page.refresh()

    expect(page.node('matter-context-goal').textContent).toBe('当前没有可用的事项投影')
    expect(page.node('matter-context-revision').textContent).toBe('—')
    expect(page.node('matter-decision-rows').textContent).not.toContain('decision:fixture.1')
    expect(page.node('matter-attempt-rows').textContent).not.toContain('attempt:fixture.1')
    expect(page.node('matter-artifact-rows').textContent).not.toContain('artifact:fixture.1')
    expect(page.node('matter-receipt-rows').textContent).not.toContain('receipt:fixture.1')
    expect(page.node('matter-decision-rows').textContent).toContain('投影不可用')
    expect(page.requests).toEqual([])
  })
})
