import { describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createMatterAdmin } from '../src/main/matter-admin.js'
import { createMatterList } from '../src/main/matter-list.js'

/**
 * Ticket 029 at the S1 routes (US-150~154), with the real 022 derivation wired to the real
 * archive store.
 *
 * The two acceptance lines are cross-store byte assertions: archive/restore move only the
 * archive slot and the list's lifecycle — every other fact (drafts, receipts, links, session,
 * projects, action items) stays byte-equal; and rename shows the service's read-back value.
 */

const DRAFT_FACTS = [{
  draftId: 'draft-1',
  matterRef: 'receipt:42',
  title: '季度复盘',
  attempt: null,
  updatedAt: 't1',
}] as const

function harness(options: { readonly wired?: boolean, readonly rename?: (request: { readonly matterRef: string, readonly title: string }) => { readonly effectiveTitle: string } | { readonly denied: string } | undefined } = {}) {
  const admin = createMatterAdmin({
    now: () => '2026-10-03T10:00:00.000Z',
    knownMatter: (matterRef) => matterRef === 'receipt:42' || matterRef === 'receipt:other',
    ...(options.rename === undefined ? {} : { renameMatter: options.rename }),
  })
  const list = createMatterList({
    listDraftFacts: () => ({ state: 'ready', facts: [...DRAFT_FACTS] }),
    pendingCount: () => 0,
    acceptanceCandidateCount: () => 0,
    archivedOf: (matterRef) => admin.isArchived(matterRef),
  })
  const providers = createUnavailableFirstService(null, options.wired === false ? {} : {
    draftList: () => ({
      state: 'unlocked',
      drafts: [{
        draftId: 'draft-1',
        fields: { goal: '季度复盘', deliverable: '对外说明', responsibility: 'role:owner', projectRef: '' },
        clarification: '', history: [], status: 'converted', matterRef: 'receipt:42', attempt: null, complete: true,
        createdAt: 't', updatedAt: 't',
      }] as never,
    }),
    matterLinks: () => ({ state: 'read', links: [], trail: [] }),
    matterList: () => list.derive(),
    matterAdmin: admin.list,
    matterAdminArchive: admin.archive,
    matterAdminRestore: admin.restore,
    matterAdminBatch: admin.batch,
    matterAdminRename: admin.rename,
  })
  const post = (path: string, body: unknown) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    { callerBinding: { correlation: 'c-029' }, providers } as never,
  )
  const readState = async () => (await (await providers.readState()).json()) as Record<string, unknown>
  return { post, readState }
}

describe('the matter-admin routes (ticket 029)', () => {
  it('archives and restores with the archive slot as the only moving fact (US-150/151 acceptance)', async () => {
    const h = harness()
    const before = await h.readState()
    expect((before.matterList as { items: Array<{ lifecycle: string }> }).items[0]?.lifecycle).toBe('active')

    const archived = await (await h.post('/.sage/matter-admin', { action: 'archive', matterRef: 'receipt:42', ground: 'completed' })).json()
    expect(archived).toMatchObject({ state: 'ok' })
    const after = await h.readState()

    // The archived matter still holds every fact and receipt — only its list membership moved.
    for (const slot of ['draft', 'matterLinks', 'readout', 'sessionChannel', 'projects', 'actionItems', 'editDrafts']) {
      expect(JSON.stringify(after[slot]), slot).toBe(JSON.stringify(before[slot]))
    }
    const draft = after.draft as { drafts: Array<{ status: string, matterRef: string | null }> }
    expect(draft.drafts[0]?.status).toBe('converted')
    expect(draft.drafts[0]?.matterRef).toBe('receipt:42')
    expect((after.matterList as { items: Array<{ lifecycle: string, matterRef: string | null }> }).items[0]).toMatchObject({ lifecycle: 'archived', matterRef: 'receipt:42' })
    // The archive never says "stopped run" or "hidden": its own slot carries only archive facts.
    const admin = after.matterAdmin as { entries: unknown, trail: unknown }
    expect(JSON.stringify(admin)).not.toContain('hidden')
    expect(JSON.stringify(admin)).not.toContain('pause')

    const restored = await (await h.post('/.sage/matter-admin', { action: 'restore', matterRef: 'receipt:42' })).json()
    expect(restored).toMatchObject({ state: 'ok' })
    const back = await h.readState()
    expect((back.matterList as { items: Array<{ lifecycle: string }> }).items[0]?.lifecycle).toBe('active')
    for (const slot of ['draft', 'matterLinks', 'readout', 'sessionChannel', 'projects', 'actionItems', 'editDrafts']) {
      expect(JSON.stringify(back[slot]), slot).toBe(JSON.stringify(before[slot]))
    }
  })

  it('a batch answers row by row over the route — refusals included, no overall success (US-153)', async () => {
    const h = harness()
    const result = await (await h.post('/.sage/matter-admin', {
      action: 'batch',
      operation: 'archive',
      targets: ['receipt:42', 'receipt:other', 'receipt:ghost'],
      ground: 'stopped',
    })).json() as { state: string, status: { batch: { rows: unknown, okCount: number, refusedCount: number } } }
    expect(result.state).toBe('batch')
    expect(result.status.batch.rows).toEqual([
      { matterRef: 'receipt:42', outcome: 'ok', code: null },
      { matterRef: 'receipt:other', outcome: 'ok', code: null },
      { matterRef: 'receipt:ghost', outcome: 'refused', code: 'matter-unknown' },
    ])
    expect(result.status.batch).toMatchObject({ okCount: 2, refusedCount: 1 })
    // The JSON has no all-ok banner: success is only ever per row.
    expect(JSON.stringify(result.status.batch)).not.toContain('success')
  })

  it('rename shows the service read-back value (US-152)', async () => {
    const h = harness({ rename: () => ({ effectiveTitle: '季度复盘·2026Q3' }) })
    const renamed = await (await h.post('/.sage/matter-admin', { action: 'rename', matterRef: 'receipt:42', title: '季度复盘' })).json() as { state: string, status: { rename: { requested: string, effective: string } } }
    expect(renamed.state).toBe('renamed')
    expect(renamed.status.rename).toEqual({ matterRef: 'receipt:42', requested: '季度复盘', effective: '季度复盘·2026Q3', at: '2026-10-03T10:00:00.000Z' })

    // Unwired: the honest not-ready answer, never a pretend rename.
    const unwired = harness()
    expect(await (await unwired.post('/.sage/matter-admin', { action: 'rename', matterRef: 'receipt:42', title: 'x' })).json())
      .toMatchObject({ state: 'refused', code: 'matter-rename-unavailable' })
  })

  it('keeps an unwired family honest and parses bodies exactly', async () => {
    const unwired = harness({ wired: false })
    expect(await (await unwired.post('/.sage/matter-admin', { action: 'archive', matterRef: 'receipt:42', ground: 'completed' })).json())
      .toMatchObject({ state: 'refused', code: 'matter-admin-unavailable' })
    expect((await unwired.readState()).matterAdmin).toEqual({ state: 'unavailable', entries: [], trail: [], rename: null, batch: null })

    const h = harness()
    const bad: unknown[] = [
      { action: 'archive', matterRef: 'receipt:42' },
      { action: 'archive', matterRef: 'receipt:42', ground: 'maybe' },
      { action: 'archive', matterRef: 'receipt:42', ground: 'completed', extra: 1 },
      { action: 'restore', matterRef: '' },
      { action: 'batch', operation: 'archive', targets: ['a'], ground: 'completed', extra: 1 },
      { action: 'batch', operation: 'delete', targets: ['a'], ground: 'completed' },
      { action: 'batch', operation: 'restore', targets: ['a'], ground: 'completed' },
      { action: 'batch', operation: 'restore', targets: [] },
      { action: 'rename', matterRef: 'receipt:42', title: '' },
      { action: 'toggle-visibility', matterRef: 'receipt:42' },
    ]
    for (const body of bad) {
      expect((await h.post('/.sage/matter-admin', body)).status, JSON.stringify(body)).toBe(400)
    }
  })
})
