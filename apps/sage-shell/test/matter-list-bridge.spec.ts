import { afterEach, describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Batch 22 / P3 (ADR-0261 strangler): the matter list card (`#matter-list-*`, `#matter-rows-*`,
 * `#matter-count-*`) is owned by the React app. The legacy script publishes its region slice
 * through `__SAGE_APP_SET_REGION__`, exposes the generation-bound select act through
 * `__SAGE_LEGACY_ACTIONS__` (exact body, stale/refusal codes, refresh) and keeps the sidebar count
 * (a fact outside the region) updated from the filter mirrored through
 * `__SAGE_APP_SET_MATTER_LIST_FILTER__`; it must not write the card's DOM anymore.
 * Rendering is pinned in `test/product-app/matter-list.spec.tsx`.
 */

interface RegionMessage {
  readonly kind: string
  readonly [key: string]: unknown
}

interface RegionSink {
  readonly byRegion: Array<{ region: string, message: RegionMessage }>
  readonly restore: () => void
}

interface LegacyActionsShape {
  selectMatterContext?: (matterId: string, expectedContextGeneration: number) => Promise<{ kind: string, noticeKind?: string, text?: string }>
}

let sink: RegionSink | undefined
let restoreActions: (() => void) | undefined

afterEach(() => {
  sink?.restore()
  sink = undefined
  restoreActions?.()
  restoreActions = undefined
})

function installRegionSink(): void {
  const byRegion: Array<{ region: string, message: RegionMessage }> = []
  const target = globalThis as { __SAGE_APP_SET_REGION__?: unknown }
  const previous = target.__SAGE_APP_SET_REGION__
  target.__SAGE_APP_SET_REGION__ = (region: string, message: RegionMessage): void => { byRegion.push({ region, message }) }
  sink = {
    byRegion,
    restore: () => {
      if (previous === undefined) delete target.__SAGE_APP_SET_REGION__
      else target.__SAGE_APP_SET_REGION__ = previous
    },
  }
}

function lastFor(region: string): RegionMessage | undefined {
  return sink?.byRegion.filter((entry) => entry.region === region).at(-1)?.message
}

function legacyActions(): LegacyActionsShape {
  const bridge = (globalThis as unknown as { __SAGE_LEGACY_ACTIONS__?: LegacyActionsShape }).__SAGE_LEGACY_ACTIONS__
  expect(bridge, 'legacy down-bridge must be installed at boot').toBeDefined()
  return bridge!
}

const item = (over: Record<string, unknown> = {}) => ({
  itemId: 'matter:a',
  matterRef: 'matter:a',
  title: '事项 A',
  partition: 'action',
  triggers: [],
  acceptanceCandidateCount: 0,
  lifecycle: 'active',
  updatedAt: '2026-10-03T10:00:00.000Z',
  ...over,
})

const matterList = (items: unknown[]) => ({ state: 'read', code: null, items, counts: { action: 0, inProgress: 0, acceptance: 0 } })

const activeContext = (over: Record<string, unknown> = {}) => ({
  state: 'active',
  contextGeneration: 7,
  matterId: 'matter:a',
  revisionId: 'revision:a.1',
  workspaceRef: 'workspace:a',
  frameGeneration: 3,
  ...over,
})

describe('matter-list region bridge (batch 22)', () => {
  it('publishes the list slice with items and the parsed active context; leaves the card DOM untouched', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({
      activeContext: activeContext(),
      matterList: matterList([item(), item({ itemId: 'matter:b', matterRef: 'matter:b', title: '事项 B', partition: 'in-progress' })]),
    }))
    const slice = lastFor('matter-list')
    expect(slice?.kind).toBe('read')
    const slot = slice?.slot as { items: unknown[] }
    expect(slot.items).toHaveLength(2)
    expect(slice?.activeContext).toEqual({
      state: 'active', contextGeneration: 7, matterId: 'matter:a', revisionId: 'revision:a.1', workspaceRef: 'workspace:a', frameGeneration: 3,
    })
    expect(page.node('matter-rows-action').children).toHaveLength(0)
    expect(page.node('matter-list-note').textContent).toBe('')
    expect(page.node('matter-count-action').textContent).toBe('')

    const down = await bootSagePage(statePayload({}))
    expect(lastFor('matter-list')).toEqual({ kind: 'unavailable', activeContext: null })
    expect(down.node('matter-rows-action').children).toHaveLength(0)

    const coded = await bootSagePage(statePayload({ matterList: { state: 'unavailable', code: 'matter-list-locked', items: [], counts: { action: 0, inProgress: 0, acceptance: 0 } } }))
    expect(lastFor('matter-list')).toEqual({ kind: 'unavailable', code: 'matter-list-locked', activeContext: null })
    expect(coded.node('matter-rows-action').children).toHaveLength(0)
  })

  it('keeps the ticket-022 words pinned on the static first frame (and no static buttons)', () => {
    const document = renderSageDocument()
    const slice = document.slice(
      document.indexOf('class="sage-card sage-matter-list-card"'),
      document.indexOf('class="sage-card sage-draft-card"'),
    )
    expect(slice).toContain('“待我处理”逐项标注原因')
    expect(slice).toContain('“待验收”只显示计数——验收与完成语义尚未收口，本版不定义')
    expect(slice).toContain('显示归档（事实来源：本版归档记录；完成语义未收口）')
    const labels = (slice.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</g, ''))
    expect(labels).toEqual([])
    expect(document).toContain('id="sage-region-matter-list"')
  })

  it('runs the generation-bound select through the down-bridge with stale/client/route outcomes', async () => {
    const page = await bootSagePage(statePayload({
      activeContext: activeContext(),
      matterList: matterList([item()]),
    }), {
      '/.sage/context/select': { state: 'selected', contextGeneration: 8 },
    })
    const actions = legacyActions()

    // Client-side stale guard: a generation mismatch never reaches the wire.
    expect((await actions.selectMatterContext!('matter:a', 6)).noticeKind).toBe('invalid')
    expect((await actions.selectMatterContext!('matter:a', 6)).text).toContain('context-select-client-stale')
    expect(page.requests).toHaveLength(0)

    expect(await actions.selectMatterContext!('matter:a', 7)).toEqual({ kind: 'selected' })
    await page.settle()
    expect(page.requests[0]).toEqual({ path: '/.sage/context/select', body: { matterId: 'matter:a', expectedContextGeneration: 7 } })
  })

  it('maps refused and malformed route outcomes to their stable codes', async () => {
    const refused = await bootSagePage(statePayload({ activeContext: activeContext(), matterList: matterList([item()]) }), {
      '/.sage/context/select': { state: 'refused', code: 'active-context-stale' },
    })
    const refusedResult = await legacyActions().selectMatterContext!('matter:b', 7)
    expect(refusedResult.kind).toBe('notice')
    expect(refusedResult.noticeKind).toBe('refused')
    expect(refusedResult.text).toContain('active-context-stale')
    await refused.settle()
    expect(refused.requests).toHaveLength(1)

    const malformed = await bootSagePage(statePayload({ activeContext: activeContext(), matterList: matterList([item()]) }), {
      '/.sage/context/select': { code: 'invalid-context-selection', stage: 'intent' },
    })
    const malformedResult = await legacyActions().selectMatterContext!('matter:b', 7)
    expect(malformedResult.noticeKind).toBe('invalid')
    expect(malformedResult.text).toContain('invalid-context-selection')

    const unwired = await bootSagePage(statePayload({ matterList: matterList([item()]) }))
    expect(await legacyActions().selectMatterContext!('matter:a', 0)).toEqual({ kind: 'cleared' })
    expect(unwired.requests).toHaveLength(0)
  })

  it('updates the sidebar count from the mirrored filter and clears it when the list cannot read', async () => {
    const page = await bootSagePage(statePayload({
      matterList: matterList([
        item({ itemId: 'matter:a' }),
        item({ itemId: 'matter:b', title: '事项 B', updatedAt: '2026-10-03T09:00:00.000Z' }),
        item({ itemId: 'matter:old', title: '旧的', lifecycle: 'archived' }),
      ]),
    }))
    expect(page.node('nav-matter-count').hidden).toBe(false)
    expect(page.node('nav-matter-count').textContent).toBe('2')

    const filter = (globalThis as unknown as { __SAGE_APP_SET_MATTER_LIST_FILTER__?: (showAll: boolean) => void }).__SAGE_APP_SET_MATTER_LIST_FILTER__
    expect(filter, 'legacy matter-list filter up-bridge must be installed at boot').toBeDefined()
    filter!(true)
    expect(page.node('nav-matter-count').textContent).toBe('3')

    const down = await bootSagePage(statePayload({}))
    expect(down.node('nav-matter-count').hidden).toBe(true)
  })
})
