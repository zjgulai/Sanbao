import { describe, expect, it } from 'vitest'
import { INTRO_VERSION } from '../onboarding-copy.js'
import { introDecision, isLastPage, nextPage, previousPage } from './step.js'

const scope = (overrides: Partial<Parameters<typeof introDecision>[0]['scope']> = {}) => ({
  status: 'ready' as const,
  mode: 'host' as const,
  value: {},
  ...overrides,
})

describe('intro step decision', () => {
  it('shows the carousel while the acknowledgement is missing', () => {
    expect(introDecision({ scope: scope(), seenLocally: false })).toBe('show')
  })

  it('is done once the exact intro version is acknowledged', () => {
    expect(introDecision({ scope: scope({ value: { introVersion: INTRO_VERSION } }), seenLocally: false })).toBe('done')
  })

  it('shows again when the acknowledged version is stale', () => {
    expect(introDecision({ scope: scope({ value: { introVersion: '2020-01-01.1' } }), seenLocally: false })).toBe('show')
  })

  it('waits for the settings scope instead of flashing the first page', () => {
    expect(introDecision({ scope: scope({ status: 'loading', value: undefined }), seenLocally: false })).toBe('waiting')
  })

  it('keeps a remote browser process-local through memory mode', () => {
    expect(introDecision({ scope: scope({ mode: 'memory', value: undefined }), seenLocally: true })).toBe('done')
    expect(introDecision({ scope: scope({ mode: 'memory', value: undefined }), seenLocally: false })).toBe('show')
  })
})

describe('intro paging', () => {
  it('clamps at both ends', () => {
    expect(nextPage(0, 3)).toBe(1)
    expect(nextPage(2, 3)).toBe(2)
    expect(previousPage(0, 3)).toBe(0)
    expect(previousPage(2, 3)).toBe(1)
  })

  it('knows the last page so the primary button can say 开始使用', () => {
    expect(isLastPage(1, 3)).toBe(false)
    expect(isLastPage(2, 3)).toBe(true)
  })
})
