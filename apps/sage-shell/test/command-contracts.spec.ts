import { describe, expect, it } from 'vitest'
import { parseSageActionIntentV2 } from '../src/appservice/command-contracts.js'

const validIntent = {
  matterId: 'matter-1', revisionId: 'rev-1', actionType: 'retry-capability',
  actionScope: 'revision', payload: { note: 'n' }, origin: 'renderer-retry',
}

describe('parseSageActionIntentV2', () => {
  it('accepts an exact valid intent', () => {
    expect(parseSageActionIntentV2(validIntent)).toEqual(validIntent)
  })
  it('rejects missing or non-string keys', () => {
    expect(parseSageActionIntentV2({ ...validIntent, matterId: 1 })).toBeUndefined()
    expect(parseSageActionIntentV2({ ...validIntent, origin: undefined })).toBeUndefined()
  })
  it('rejects extra keys and non-object input', () => {
    expect(parseSageActionIntentV2({ ...validIntent, extra: 1 })).toBeUndefined()
    expect(parseSageActionIntentV2(null)).toBeUndefined()
    expect(parseSageActionIntentV2('x')).toBeUndefined()
  })
  it('rejects nested payload values and bad scope/origin', () => {
    expect(parseSageActionIntentV2({ ...validIntent, payload: { nested: { deep: 1 } } })).toBeUndefined()
    expect(parseSageActionIntentV2({ ...validIntent, payload: { a: [1] } })).toBeUndefined()
    expect(parseSageActionIntentV2({ ...validIntent, actionScope: 'bogus' })).toBeUndefined()
    expect(parseSageActionIntentV2({ ...validIntent, origin: 'bogus' })).toBeUndefined()
  })
  it('rejects authority-shaped fields as extra keys', () => {
    expect(parseSageActionIntentV2({ ...validIntent, matrixId: 'm1' })).toBeUndefined()
    expect(parseSageActionIntentV2({ ...validIntent, AuthoritySnapshot: {} })).toBeUndefined()
  })
})
