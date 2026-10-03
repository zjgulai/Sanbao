import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload, type FakeElement } from './support/sage-page.js'

/**
 * Ticket 027 on the shipped page (US-140~145).
 *
 * The reference row opens a draft; save and diff go through their exact routes; the writeback
 * card renders from the projection (so the 2s poll cannot wipe it) and the confirm click carries
 * the projection's credential. Nothing here writes anything — the result line only ever reads
 * "已回写" when the projection carries the receipt.
 */

const workspaces = {
  source: 'workspace-follow', state: 'read', reason: null,
  entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
  order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
}

const reference = {
  referenceId: 'ref-1', workspaceRoot: '/Users/someone/project', path: 'notes/plan.md',
  absolutePath: '/Users/someone/project/notes/plan.md', version: 'v1000:12', bytes: 12,
  createdAt: '2026-10-02T12:00:00.000Z', lastUse: 'unused',
}

const draft = (overrides: Record<string, unknown> = {}) => ({
  draftId: 'draft-1',
  matterRef: 'matter:1',
  path: 'notes/plan.md',
  name: 'plan.md',
  proposedText: '一行\n二行\n',
  basedVersion: 'v1000:12',
  generatedBy: 'file-observation',
  createdAt: '2026-10-02T21:00:00.000Z',
  updatedAt: '2026-10-02T21:00:01.000Z',
  sourceCharacters: 7,
  proposedCharacters: 7,
  sourceState: 'unchanged',
  writeback: { state: 'none' },
  ...overrides,
})

const payload = (editDrafts: unknown) => statePayload({
  workspaces,
  fileReferences: [reference],
  matterLinks: { state: 'read', links: [], trail: [] },
  editDrafts,
})

const buttons = (row: FakeElement): string[] => row.querySelectorAll('[data-file-action]').map((button) => button.dataset.fileAction ?? '')

describe('opening an edit draft from a reference (US-140)', () => {
  it('posts the reference and the chosen matter, and refuses locally without a matter', async () => {
    const harness = await bootSagePage(payload({ state: 'read', drafts: [] }))
    const row = harness.node('file-references').children[0]!
    expect(buttons(row)).toEqual(['use', 'draft'])

    // No matter chosen: the local notice explains, and nothing is posted.
    const draftButton = row.querySelector('[data-file-action="draft"]')!
    harness.node('file-references').dispatch('click', { target: draftButton })
    await harness.settle()
    expect(harness.requests).toEqual([])
    expect(harness.node('edit-draft-note').textContent).toContain('选好事项')

    harness.node('link-matter').value = 'matter:1'
    harness.node('file-references').dispatch('click', { target: draftButton })
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/edit-drafts/create', body: { referenceId: 'ref-1', matterRef: 'matter:1' } }])
  })

  it('renders the shelf, the based version, the source state and the working copy', async () => {
    const harness = await bootSagePage(payload({ state: 'read', drafts: [draft()] }))
    const rows = harness.node('edit-draft-rows').children
    expect(rows).toHaveLength(1)
    expect(rows[0]?.dataset.editDraftId).toBe('draft-1')
    expect(rows[0]?.textContent).toContain('plan.md')
    expect(rows[0]?.textContent).toContain('源未变更')
    expect(harness.node('edit-draft-version').textContent).toBe('v1000:12')
    expect(harness.node('edit-draft-source-state').textContent).toContain('与所依据版本一致')
    expect(harness.node('edit-draft-proposed').value).toBe('一行\n二行\n')

    // An unavailable shelf says so instead of showing an empty one.
    const empty = await bootSagePage(payload({ state: 'unavailable', drafts: [] }))
    expect(empty.node('edit-draft-note').textContent).toContain('未核验')
  })
})

describe('save and diff (US-141)', () => {
  it('saves the typed proposal and shows the diff against the based version, surviving the poll', async () => {
    const harness = await bootSagePage(payload({ state: 'read', drafts: [draft()] }), {
      '/.sage/edit-drafts/diff': {
        state: 'read',
        diff: {
          draftId: 'draft-1', basedVersion: 'v1000:12', currentVersion: 'v1000:12', sourceChanged: false,
          addedLines: 1, removedLines: 1, truncated: false,
          lines: [{ kind: 'context', text: '一行' }, { kind: 'remove', text: '二行' }, { kind: 'add', text: '二行改了' }],
        },
      },
    })
    harness.node('edit-draft-proposed').value = '一行\n二行改了\n'
    harness.node('edit-draft-save').dispatch('click')
    await harness.settle()
    expect(harness.requests[0]).toEqual({ path: '/.sage/edit-drafts/update', body: { draftId: 'draft-1', proposedText: '一行\n二行改了\n' } })

    harness.node('edit-draft-diff').dispatch('click')
    await harness.settle()
    expect(harness.requests[1]).toEqual({ path: '/.sage/edit-drafts/diff', body: { draftId: 'draft-1' } })
    expect(harness.node('edit-draft-diff-view').hidden).toBe(false)
    expect(harness.node('edit-draft-diff-view').textContent).toContain('- 二行')
    expect(harness.node('edit-draft-diff-view').textContent).toContain('+ 二行改了')
    expect(harness.node('edit-draft-diff-note').textContent).toContain('基于版本 v1000:12')
    expect(harness.node('edit-draft-diff-note').textContent).toContain('与所依据版本一致')
    await harness.refresh()
    expect(harness.node('edit-draft-diff-view').textContent).toContain('+ 二行改了')
  })
})

describe('the writeback card and its confirm click (US-143/127)', () => {
  const prepared = draft({
    proposedText: '一行\n二行改了\n',
    proposedCharacters: 13,
    writeback: {
      state: 'prepared', confirmationId: 'cf-9', preparedAt: '2026-10-02T21:00:02.000Z',
      targetVersion: 'v1000:12', currentVersion: 'v1000:12',
      impact: { addedLines: 1, removedLines: 1, proposedCharacters: 13 },
    },
  })

  it('shows target version and impact from the projection, survives the poll, and cancels locally', async () => {
    const harness = await bootSagePage(payload({ state: 'read', drafts: [prepared] }))
    expect(harness.node('edit-draft-writeback-card').hidden).toBe(false)
    expect(harness.node('writeback-target').textContent).toContain('notes/plan.md')
    expect(harness.node('writeback-version').textContent).toBe('v1000:12')
    expect(harness.node('writeback-impact').textContent).toContain('1 行新增、1 行删除')
    expect(harness.node('writeback-cost').textContent).toContain('暂不可得')

    await harness.refresh()
    expect(harness.node('edit-draft-writeback-card').hidden).toBe(false)

    harness.node('edit-draft-writeback-cancel').dispatch('click')
    await harness.settle()
    expect(harness.node('edit-draft-writeback-card').hidden).toBe(true)
    await harness.refresh()
    expect(harness.node('edit-draft-writeback-card').hidden).toBe(true)
  })

  it('confirms with the projection credential and words the unwired port honestly — never 已回写', async () => {
    const harness = await bootSagePage(
      payload({ state: 'read', drafts: [prepared] }),
      { '/.sage/edit-drafts/writeback': { state: 'not-ready', draftId: 'draft-1', code: 'writeback-unavailable' } },
    )
    harness.node('edit-draft-writeback-now').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/edit-drafts/writeback', body: { draftId: 'draft-1', confirmationId: 'cf-9' } }])

    harness.setPayload(payload({
      state: 'read',
      drafts: [draft({ proposedText: '一行\n二行改了\n', writeback: { state: 'not-ready', code: 'writeback-unavailable' } })],
    }))
    await harness.refresh()
    const result = harness.node('edit-draft-result').textContent
    expect(result).toContain('未接线')
    expect(result).toContain('未被消耗')
    expect(result).not.toContain('已回写')
  })

  it('renders 已回写 only from a receipt, and each refusal from its code', async () => {
    const harness = await bootSagePage(payload({
      state: 'read',
      drafts: [draft({ writeback: { state: 'written', receiptRef: 'wb-7' } })],
    }))
    expect(harness.node('edit-draft-result').textContent).toContain('已回写：wb-7')
    expect(harness.node('edit-draft-result').textContent).toContain('来自回写回执')

    harness.setPayload(payload({
      state: 'read',
      drafts: [draft({ writeback: { state: 'refused', code: 'writeback-source-changed' } })],
    }))
    await harness.refresh()
    expect(harness.node('edit-draft-result').textContent).toContain('源文件相对所依据版本已变化')

    // The unknown state never reads as done either.
    harness.setPayload(payload({
      state: 'read',
      drafts: [draft({ writeback: { state: 'unknown', code: 'writeback-executor-lost' } })],
    }))
    await harness.refresh()
    expect(harness.node('edit-draft-result').textContent).toContain('未知')
    expect(harness.node('edit-draft-result').textContent).not.toContain('已回写')
  })

  it('a stale refuse during prepare lands as a local, poll-surviving notice', async () => {
    const harness = await bootSagePage(
      payload({ state: 'read', drafts: [draft({ proposedText: '改了\n' })] }),
      { '/.sage/edit-drafts/prepare-writeback': { state: 'refused', draftId: 'draft-1', code: 'writeback-source-changed' } },
    )
    harness.node('edit-draft-prepare').dispatch('click')
    await harness.settle()
    expect(harness.node('edit-draft-note').textContent).toContain('已变化')
    await harness.refresh()
    expect(harness.node('edit-draft-note').textContent).toContain('已变化')
  })
})
