import { afterEach, describe, expect, it } from 'vitest'

import { createSageFixtureViewState, type SageMatterViewState } from '../src/product/view-state.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * UI-DECISION-01 / P2 (ADR-0261): the BusinessMatter workbench IA (counts, trace collections,
 * stage state) is now rendered by the React region; the legacy script only validates and
 * forwards to the bridge. These specs pin the forwarded facts and the untouched-region
 * sentinel; the rendered DOM lives in `test/product-app/matter-region.spec.ts`.
 */

interface MatterBridgeMessage {
  readonly kind: string
  readonly projection?: unknown
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

let restoreSink: (() => void) | undefined

afterEach(() => {
  restoreSink?.()
  restoreSink = undefined
})

function installBridgeSink(messages: MatterBridgeMessage[]): void {
  const target = globalThis as { __SAGE_APP_SET_MATTER__?: unknown }
  const previous = target.__SAGE_APP_SET_MATTER__
  target.__SAGE_APP_SET_MATTER__ = (message: MatterBridgeMessage): void => { messages.push(message) }
  restoreSink = () => {
    if (previous === undefined) delete target.__SAGE_APP_SET_MATTER__
    else target.__SAGE_APP_SET_MATTER__ = previous
  }
}

describe('BusinessMatter read-only workbench IA', () => {
  it('forwards counts and every trace collection to the region bridge without writing the region', async () => {
    const messages: MatterBridgeMessage[] = []
    installBridgeSink(messages)
    const matter = tracedMatter()
    const page = await bootSagePage(statePayload({ matter }))

    const last = messages.at(-1)
    expect(last).toEqual({ kind: 'projection', projection: matter })
    const forwarded = last?.projection as SageMatterViewState
    expect(forwarded.matter.evidenceCount).toBe(4)
    expect(forwarded.matter.unknownCount).toBe(2)
    expect(forwarded.matter.dependencyCount).toBe(3)
    expect(forwarded.decisions.map((entry) => entry.decisionId)).toEqual(['decision:fixture.1'])
    expect(forwarded.attempts.map((entry) => entry.attemptId)).toEqual(['attempt:fixture.1'])
    expect(forwarded.artifacts.map((entry) => entry.artifactId)).toEqual(['artifact:fixture.1'])
    expect(forwarded.receipts.map((entry) => entry.receiptId)).toEqual(['receipt:fixture.1'])
    // Region sentinel: the script no longer writes any of these nodes.
    expect(page.node('matter-metric-evidence').textContent).toBe('')
    expect(page.node('matter-clarification').textContent).toBe('')
    expect(page.node('matter-decision-rows').children).toHaveLength(0)
    expect(page.node('matter-attempt-rows').children).toHaveLength(0)
    expect(page.node('matter-artifact-rows').children).toHaveLength(0)
    expect(page.node('matter-receipt-rows').children).toHaveLength(0)
    expect(page.requests).toEqual([])
  })

  it('clears prior facts at the bridge and in the sidebar context when the projection becomes malformed', async () => {
    const messages: MatterBridgeMessage[] = []
    installBridgeSink(messages)
    const page = await bootSagePage(statePayload({ matter: tracedMatter() }))

    page.setPayload(statePayload({ matter: { ...tracedMatter(), decisions: [{}] } }))
    await page.refresh()

    expect(messages.at(-1)).toEqual({ kind: 'invalid' })
    expect(page.node('matter-context-goal').textContent).toBe('当前没有可用的事项投影')
    expect(page.node('matter-context-revision').textContent).toBe('—')
    expect(page.node('matter-decision-rows').children).toHaveLength(0)
    expect(page.node('matter-attempt-rows').children).toHaveLength(0)
    expect(page.node('matter-artifact-rows').children).toHaveLength(0)
    expect(page.node('matter-receipt-rows').children).toHaveLength(0)
    expect(page.requests).toEqual([])
  })
})
