import { describe, expect, it } from 'vitest'
import {
  createSageActionPreview,
  SageActionPreviewError,
} from '../src/product/action-preview.js'
import { createSageFixtureViewState } from '../src/product/view-state.js'

describe('Sage action preview contract', () => {
  it('exposes a blocked fixture preview without creating a submission', () => {
    const preview = createSageActionPreview(createSageFixtureViewState(), 'answer-clarification')

    expect(preview).toMatchObject({
      schemaVersion: 'sage.action-preview.v1',
      origin: 'sage-ui',
      projectionSource: 'fixture',
      matterId: 'matter:sage.shopify-abi.fixture',
      revisionId: 'revision:sage.shopify-abi.fixture.1',
      actionScope: 'shopify.orders.read',
      actionType: 'answer-clarification',
      authorizationState: 'unknown',
      availabilityState: 'unknown',
      compatibilityOutcome: 'unknown',
      actionability: 'blocked',
      denialReason: 'fixture-only',
      idempotency: { state: 'not-issued', key: undefined },
      submissionState: 'not-submitted',
    })
    expect(Object.isFrozen(preview)).toBe(true)
    expect(Object.isFrozen(preview.idempotency)).toBe(true)

    const serialized = JSON.stringify(preview)
    expect(serialized).not.toContain('POST')
    expect(serialized).not.toContain('fetch')
    expect(serialized).not.toContain('ActionIntent')
  })

  it('keeps capability recovery previews unbound to a revision or scope', () => {
    const preview = createSageActionPreview(createSageFixtureViewState(), 'retry-capability')

    expect(preview.revisionId).toBeUndefined()
    expect(preview.actionScope).toBeUndefined()
    expect(preview.denialReason).toBe('fixture-only')
    expect(preview.submissionState).toBe('not-submitted')
  })

  it('fails closed when the requested action is absent', () => {
    try {
      createSageActionPreview(createSageFixtureViewState(), 'approve')
      throw new Error('expected preview creation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(SageActionPreviewError)
      expect((error as SageActionPreviewError).code).toBe('unknown-action')
    }
  })
})
