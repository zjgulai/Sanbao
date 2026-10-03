import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload, type FakeElement } from './support/sage-page.js'

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

const matterList = (items: readonly Record<string, unknown>[]) => ({
  state: 'read',
  code: null,
  items,
  counts: {
    action: items.filter((entry) => entry.partition === 'action' && entry.lifecycle !== 'archived').length,
    inProgress: items.filter((entry) => entry.partition === 'in-progress' && entry.lifecycle !== 'archived').length,
    acceptance: items.filter((entry) => entry.partition === 'acceptance' && entry.lifecycle !== 'archived').length,
  },
})

const activeContext = (over: Record<string, unknown> = {}) => ({
  state: 'active',
  contextGeneration: 7,
  matterId: 'matter:a',
  revisionId: 'revision:a.1',
  workspaceRef: 'workspace:a',
  frameGeneration: 3,
  ...over,
})

function selectionButton(row: FakeElement): FakeElement | null {
  return row.querySelector('[data-matter-context-action]')
}

function twoVisibleMatters() {
  return matterList([
    item(),
    item({
      itemId: 'matter:b',
      matterRef: 'matter:b',
      title: '事项 B',
      partition: 'in-progress',
      updatedAt: '2026-10-03T09:00:00.000Z',
    }),
  ])
}

describe('explicit active matter selection in the matter list', () => {
  it('marks the projected active matter and offers an explicit control for every other visible matter', async () => {
    const page = await bootSagePage(statePayload({
      activeContext: activeContext(),
      matterList: twoVisibleMatters(),
    }))

    const active = selectionButton(page.node('matter-rows-action').children[0]!)
    const candidate = selectionButton(page.node('matter-rows-progress').children[0]!)

    expect(active).not.toBeNull()
    expect(active?.textContent).toBe('当前事项')
    expect(active?.disabled).toBe(true)
    expect(active?.dataset).toMatchObject({
      matterContextAction: 'select',
      matterContextState: 'active',
      matterId: 'matter:a',
      contextGeneration: '7',
    })
    expect(candidate?.textContent).toBe('选择事项')
    expect(candidate?.disabled).toBe(false)
    expect(candidate?.dataset).toMatchObject({
      matterContextAction: 'select',
      matterContextState: 'selectable',
      matterId: 'matter:b',
      contextGeneration: '7',
    })
    expect(page.requests).toEqual([])
  })

  it('posts exactly one generation-bound select request and waits for refresh to declare the new active matter', async () => {
    const page = await bootSagePage(statePayload({
      activeContext: activeContext(),
      matterList: twoVisibleMatters(),
    }), {
      '/.sage/context/select': { state: 'selected', contextGeneration: 8 },
    })
    const candidate = selectionButton(page.node('matter-rows-progress').children[0]!)
    expect(candidate).not.toBeNull()

    page.node('matter-rows-progress').dispatch('click', { target: candidate })
    await page.settle()

    expect(page.requests).toEqual([{
      path: '/.sage/context/select',
      body: { matterId: 'matter:b', expectedContextGeneration: 7 },
    }])
    // The POST receipt does not mutate local truth. The unchanged GET projection still owns active.
    const refreshedCandidate = selectionButton(page.node('matter-rows-progress').children[0]!)
    expect(refreshedCandidate?.textContent).toBe('选择事项')
    expect(refreshedCandidate?.dataset.matterContextState).toBe('selectable')
  })

  it.each([
    ['refused', { state: 'refused', code: 'active-context-stale' }, 'active-context-stale'],
    ['invalid', { code: 'invalid-context-selection', stage: 'intent' }, 'invalid-context-selection'],
  ])('shows a stable %s code in the dedicated list note without manufacturing success', async (kind, outcome, code) => {
    const page = await bootSagePage(statePayload({
      activeContext: activeContext(),
      matterList: twoVisibleMatters(),
    }), {
      '/.sage/context/select': outcome,
    })
    const candidate = selectionButton(page.node('matter-rows-progress').children[0]!)

    page.node('matter-rows-progress').dispatch('click', { target: candidate })
    await page.settle()

    expect(page.node('matter-list-note').dataset.contextSelectionNote).toBe(kind)
    expect(page.node('matter-list-note').textContent).toContain(code)
    expect(selectionButton(page.node('matter-rows-action').children[0]!)?.textContent).toBe('当前事项')
    expect(selectionButton(page.node('matter-rows-progress').children[0]!)?.textContent).toBe('选择事项')
  })

  it.each([
    ['missing', undefined],
    ['malformed', { state: 'active', contextGeneration: -1, matterId: 'matter:a' }],
  ])('disables selection and says 未接线 when activeContext is %s', async (_label, context) => {
    const payload = statePayload({ matterList: twoVisibleMatters() })
    if (context !== undefined) payload.activeContext = context
    const page = await bootSagePage(payload)

    const controls = [
      selectionButton(page.node('matter-rows-action').children[0]!),
      selectionButton(page.node('matter-rows-progress').children[0]!),
    ]
    expect(controls.every((control) => control?.disabled === true)).toBe(true)
    expect(page.node('matter-list-note').dataset.contextSelectionNote).toBe('unavailable')
    expect(page.node('matter-list-note').textContent).toContain('事项选择未接线')
    expect(page.requests).toEqual([])
  })

  it('does not add a selection control to unresolved or archived rows, even when archived rows are revealed', async () => {
    const page = await bootSagePage(statePayload({
      activeContext: { state: 'inactive', contextGeneration: 4 },
      matterList: matterList([
        item({ itemId: 'draft:unknown', matterRef: null, title: '尚无事项标识' }),
        item({ itemId: 'matter:archived', matterRef: 'matter:archived', title: '已归档事项', lifecycle: 'archived' }),
      ]),
    }))

    expect(selectionButton(page.node('matter-rows-action').children[0]!)).toBeNull()
    page.node('matter-list-all').checked = true
    page.node('matter-list-all').dispatch('change')
    await page.settle()
    const archived = page.node('matter-rows-action').children.find((row) => row.dataset.matterItem === 'matter:archived')
    expect(archived).toBeDefined()
    expect(selectionButton(archived!)).toBeNull()
    expect(page.requests).toEqual([])
  })
})
