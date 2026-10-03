import { describe, expect, it } from 'vitest'

import { createMatterAdmin } from '../src/main/matter-admin.js'

/**
 * Ticket 029, the matter administration (US-150~154).
 *
 * The acceptance lives here as shape and verdict assertions: archive is recoverable and touches
 * nothing but its own record; batch answers row by row with no overall-success anywhere; rename
 * projects the READ-BACK value, never the request.
 */

function harness(options: { readonly known?: readonly string[], readonly rename?: (request: { readonly matterRef: string, readonly title: string }) => { readonly effectiveTitle: string } | { readonly denied: string } | undefined } = {}) {
  const known = new Set(options.known ?? ['matter:1', 'matter:2'])
  let tick = 0
  const store = createMatterAdmin({
    now: () => `2026-10-03T10:00:0${tick}.000Z`,
    knownMatter: (matterRef) => known.has(matterRef),
    ...(options.rename === undefined ? {} : { renameMatter: options.rename }),
  })
  return store
}

describe('recoverable archive (US-150/151)', () => {
  it('archives a known matter with its ground, restores it, and keeps the trail', () => {
    const admin = harness()
    const archived = admin.archive({ matterRef: 'matter:1', ground: 'completed' })
    expect(archived.state).toBe('ok')
    if (archived.state !== 'ok') return
    expect(archived.status.entries).toEqual([{ matterRef: 'matter:1', archivedAt: '2026-10-03T10:00:00.000Z', ground: 'completed' }])
    expect(archived.status.trail).toEqual([{ at: '2026-10-03T10:00:00.000Z', action: 'archive', matterRef: 'matter:1', ground: 'completed' }])
    expect(admin.isArchived('matter:1')).toBe(true)
    // Idempotent: a second archive adds no duplicate edge and no trail noise.
    const again = admin.archive({ matterRef: 'matter:1', ground: 'stopped' })
    if (again.state !== 'ok') throw new Error('expected ok')
    expect(again.status.entries).toHaveLength(1)
    expect(again.status.trail).toHaveLength(1)

    const restored = admin.restore({ matterRef: 'matter:1' })
    if (restored.state !== 'ok') throw new Error('expected ok')
    expect(restored.status.entries).toEqual([])
    expect(admin.isArchived('matter:1')).toBe(false)
    expect(restored.status.trail.at(-1)).toMatchObject({ action: 'restore', matterRef: 'matter:1', ground: null })
    // Restoring what was never archived is its own refusal.
    expect(admin.restore({ matterRef: 'matter:1' })).toMatchObject({ state: 'refused', code: 'not-archived' })
  })

  it('refuses unknown matters with the same code as unauthorized ones — no enumeration', () => {
    const admin = harness({ known: [] })
    expect(admin.archive({ matterRef: 'matter:1', ground: 'completed' })).toMatchObject({ state: 'refused', code: 'matter-unknown' })
    expect(admin.archive({ matterRef: 'matter:secret', ground: 'completed' })).toMatchObject({ state: 'refused', code: 'matter-unknown' })
    expect(admin.list().entries).toEqual([])
  })

  it('the status shape is pinned: archive state only, never hide/stop/delete vocabulary', () => {
    const admin = harness()
    admin.archive({ matterRef: 'matter:1', ground: 'stopped' })
    const status = admin.list()
    expect(Object.keys(status).sort()).toEqual(['batch', 'entries', 'rename', 'state', 'trail'])
    expect(Object.keys(status.entries[0]!).sort()).toEqual(['archivedAt', 'ground', 'matterRef'])
    const text = JSON.stringify(status)
    for (const banned of ['hidden', 'hide', 'deleted', 'delete', 'stopped-run', 'pause']) {
      expect(text, banned).not.toContain(banned)
    }
  })
})

describe('per-target batch — row by row, never an overall success (US-153)', () => {
  it('gives every target its own verdict, refusal codes included', () => {
    const admin = harness()
    const result = admin.batch({ operation: 'archive', targets: ['matter:1', 'matter:missing', 'matter:2'], ground: 'completed' })
    expect(result.state).toBe('batch')
    if (result.state !== 'batch') return
    const batch = result.status.batch
    expect(batch).toEqual({
      operation: 'archive',
      rows: [
        { matterRef: 'matter:1', outcome: 'ok', code: null },
        { matterRef: 'matter:missing', outcome: 'refused', code: 'matter-unknown' },
        { matterRef: 'matter:2', outcome: 'ok', code: null },
      ],
      okCount: 2,
      refusedCount: 1,
    })
    // The shape carries rows and counts only — no banner field to read a false overall success from.
    expect(Object.keys(batch!).sort()).toEqual(['okCount', 'operation', 'refusedCount', 'rows'])
  })

  it('refuses malformed batches as a whole, before any target is touched', () => {
    const admin = harness()
    expect(admin.batch({ operation: 'archive', targets: [], ground: 'completed' })).toMatchObject({ state: 'refused', code: 'batch-size-invalid' })
    expect(admin.batch({ operation: 'archive', targets: Array.from({ length: 33 }, (_, index) => `matter:${String(index)}`), ground: 'completed' })).toMatchObject({ state: 'refused', code: 'batch-size-invalid' })
    expect(admin.batch({ operation: 'archive', targets: ['matter:1'] })).toMatchObject({ state: 'refused', code: 'archive-ground-required' })
    expect(admin.list().entries).toEqual([])
  })

  it('a restore batch refuses each not-archived target on its own row', () => {
    const admin = harness()
    admin.archive({ matterRef: 'matter:1', ground: 'completed' })
    const result = admin.batch({ operation: 'restore', targets: ['matter:1', 'matter:2'] })
    if (result.state !== 'batch') throw new Error('expected batch')
    expect(result.status.batch?.rows).toEqual([
      { matterRef: 'matter:1', outcome: 'ok', code: null },
      { matterRef: 'matter:2', outcome: 'refused', code: 'not-archived' },
    ])
    expect(result.status.batch?.refusedCount).toBe(1)
  })
})

describe('service-adjudicated rename (US-152)', () => {
  it('projects the read-back value, never the request', () => {
    const admin = harness({ rename: () => ({ effectiveTitle: '季度复盘（服务裁决后）' }) })
    const result = admin.rename({ matterRef: 'matter:1', title: '  季度复盘  ' })
    expect(result.state).toBe('renamed')
    if (result.state !== 'renamed') return
    expect(result.status.rename).toEqual({
      matterRef: 'matter:1',
      requested: '季度复盘',
      effective: '季度复盘（服务裁决后）',
      at: '2026-10-03T10:00:00.000Z',
    })
    expect(result.status.rename?.effective).not.toBe(result.status.rename?.requested)
  })

  it('keeps an unwired or refusing port honest', () => {
    const unwired = harness()
    expect(unwired.rename({ matterRef: 'matter:1', title: 'x' })).toMatchObject({ state: 'refused', code: 'matter-rename-unavailable' })
    const denied = harness({ rename: () => ({ denied: 'rename-denied-by-policy' }) })
    expect(denied.rename({ matterRef: 'matter:1', title: 'x' })).toMatchObject({ state: 'refused', code: 'rename-denied-by-policy' })
    const invalid = harness({ rename: () => ({ effectiveTitle: 'x' }) })
    expect(invalid.rename({ matterRef: 'matter:1', title: '   ' })).toMatchObject({ state: 'refused', code: 'rename-title-invalid' })
    expect(invalid.rename({ matterRef: 'matter:1', title: 'x'.repeat(201) })).toMatchObject({ state: 'refused', code: 'rename-title-invalid' })
  })
})
