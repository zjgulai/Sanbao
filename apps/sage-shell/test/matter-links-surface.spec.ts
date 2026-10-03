import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 011, the link surface (US-065~070).
 *
 * The card is where "添加/解除入口在事项侧、不隐式产生关联、默认只列已关联项" is visible: the three
 * controls post exactly one named action each, the rows show linked entries only, and the trail is
 * rendered read-only.
 */

const draft = (overrides: Record<string, unknown> = {}) => ({
  draftId: 'draft-1',
  fields: { goal: '季度复盘对外化', deliverable: '对外说明', responsibility: 'role:owner', projectRef: '' },
  clarification: '',
  history: [],
  status: 'converted',
  matterRef: 'receipt:1',
  complete: true,
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  ...overrides,
})

const workspaces = {
  source: 'workspace-follow', state: 'read', reason: null,
  entries: [
    { workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/a', sessionCount: 0, createdAt: 'x', updatedAt: 'x' },
    { workspaceId: 'ws-2', title: '产品资料', path: '/Users/someone/b', sessionCount: 0, createdAt: 'x', updatedAt: 'x' },
  ],
  order: ['ws-1', 'ws-2'], archivedSessions: 0, frames: 1, unapplied: 0,
}

const linkState = {
  state: 'read',
  links: [
    { matterRef: 'receipt:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/a', linkedAt: '2026-10-02T12:00:00.000Z', isDefault: true },
  ],
  trail: [
    { linkId: 'link-op-1', at: '2026-10-02T12:00:00.000Z', action: 'linked', matterRef: 'receipt:1', workspaceRef: 'ws-1', actorRef: 'session:verified' },
    { linkId: 'link-op-2', at: '2026-10-02T12:00:01.000Z', action: 'default-set', matterRef: 'receipt:1', workspaceRef: 'ws-1', actorRef: 'session:verified' },
  ],
}

const payload = (overrides: Record<string, unknown> = {}) => statePayload({
  draft: { state: 'unlocked', drafts: [draft()] },
  workspaces,
  matterLinks: linkState,
  ...overrides,
})

describe('the matter ↔ workspace card', () => {
  it('lists only linked entries, marks the default, and renders the trail read-only', async () => {
    const harness = await bootSagePage(payload())
    const rows = harness.node('link-rows').children
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).toContain('/Users/someone/a')
    expect(rows[0]?.textContent).toContain('默认执行环境')
    // An unlinked workspace is absent, not rendered as "已解除".
    expect(harness.node('link-rows').textContent).not.toContain('/Users/someone/b')

    const trail = harness.node('link-trail').children
    expect(trail).toHaveLength(2)
    expect(trail[0]?.textContent).toContain('建立关联')
    expect(trail[1]?.textContent).toContain('设为默认')
    expect(trail.every((row) => row.descendants().every((node) => node.tagName !== 'button' && node.tagName !== 'input'))).toBe(true)
    expect(harness.node('link-note').textContent).toContain('操作记录 2 条')
  })

  it('posts exactly one named action per control, with the chosen matter and workspace', async () => {
    const harness = await bootSagePage(payload())
    expect(harness.node('link-matter').children.map((option) => option.value)).toEqual(['receipt:1'])
    expect(harness.node('link-workspace').children.map((option) => option.value)).toEqual(['ws-1', 'ws-2'])

    harness.node('link-workspace').value = 'ws-2'
    harness.node('link-add').dispatch('click')
    await harness.refresh()
    expect(harness.requests[0]).toEqual({ path: '/.sage/matter/link', body: { action: 'link', matterRef: 'receipt:1', workspaceRef: 'ws-2' } })

    harness.node('link-remove').dispatch('click')
    await harness.refresh()
    expect(harness.requests[1]).toEqual({ path: '/.sage/matter/link', body: { action: 'unlink', matterRef: 'receipt:1', workspaceRef: 'ws-2' } })

    harness.node('link-default').dispatch('click')
    await harness.refresh()
    expect(harness.requests[2]).toEqual({ path: '/.sage/matter/link', body: { action: 'set-default', matterRef: 'receipt:1', workspaceRef: 'ws-2' } })
  })

  it('never invents an association: with nothing chosen the click is refused locally', async () => {
    const harness = await bootSagePage(statePayload({ matterLinks: linkState, workspaces: null, draft: { state: 'unlocked', drafts: [] } }))
    expect(harness.node('link-matter').children.map((option) => option.value)).toEqual([''])
    expect(harness.node('link-workspace').value).toBe('')
    harness.node('link-add').dispatch('click')
    await harness.refresh()
    expect(harness.requests).toEqual([])
    expect(harness.node('link-note').textContent).toContain('关联不会自动替你挑一个')
  })

  it('words an unavailable environment as a prompt, not as a silent switch', async () => {
    const harness = await bootSagePage(statePayload({
      draft: { state: 'unlocked', drafts: [draft()] },
      service: {
        status: 'unavailable', reason: 'authenticated', correlation: 'c',
        auth: { status: 'signed-in', displayName: '林一' },
        command: { correlation: 'c-9', outcome: 'not-ready', code: 'environment-unavailable', retryable: true },
      },
    }))
    const note = harness.node('command-note').textContent
    expect(note).toContain('该事项选定的默认执行环境已不可用')
    expect(note).toContain('不会自动换到别的工作区')
    expect(harness.node('retry').hidden).toBe(true)
  })

  it('says the store is unwired instead of showing an empty association list', async () => {
    const harness = await bootSagePage(statePayload({ matterLinks: { state: 'unavailable', links: [], trail: [] } }))
    expect(harness.node('link-note').textContent).toContain('未核验')
    expect(harness.node('link-rows').children).toHaveLength(0)
  })
})
