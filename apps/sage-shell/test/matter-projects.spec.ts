import { describe, expect, it } from 'vitest'

import { createMatterProjects } from '../src/main/matter-projects.js'

/**
 * Ticket 028, the project grouping (US-149, D-089).
 *
 * A project groups matters by ref and nothing else: 最多一个项目, moves keep their trail, and the
 * shape this module exposes can by construction touch no responsibility, visibility or fact.
 */

const harness = () => {
  let tick = 0
  return createMatterProjects({ now: () => `t${tick += 1}`, nextId: () => `p-${tick += 1}` })
}

describe('the project grouping (US-149)', () => {
  it('creates name-only projects and refuses malformed names', () => {
    const projects = harness()
    expect(projects.create({ name: '   ' })).toEqual({ state: 'refused', code: 'project-name-invalid' })
    expect(projects.create({ name: 'x'.repeat(101) })).toEqual({ state: 'refused', code: 'project-name-invalid' })
    const created = projects.create({ name: '  2026 增长项目  ' })
    if (created.state !== 'ok') throw new Error('expected ok')
    // The harness shares one tick between now() and nextId(): p-1 is minted first, then t2 stamps.
    expect(created.projects.projects).toEqual([
      { projectRef: 'p-1', name: '2026 增长项目', createdAt: 't2', matterRefs: [] },
    ])
  })

  it('keeps at most one project per matter; a re-assignment is a move with its trail', () => {
    const projects = harness()
    const a = projects.create({ name: 'A' })
    const b = projects.create({ name: 'B' })
    if (a.state !== 'ok' || b.state !== 'ok') throw new Error('expected ok')
    const aRef = a.projects.projects[0]!.projectRef
    const bRef = b.projects.projects[1]!.projectRef

    expect(projects.assign({ matterRef: 'matter:1', projectRef: 'p-missing' })).toEqual({ state: 'refused', code: 'project-not-found' })
    const first = projects.assign({ matterRef: 'matter:1', projectRef: aRef })
    if (first.state !== 'ok') throw new Error('expected ok')
    expect(first.projects.projects.find((entry) => entry.projectRef === aRef)?.matterRefs).toEqual(['matter:1'])
    // Assigning to the same project again is a no-op: no duplicate edge, no trail noise.
    const again = projects.assign({ matterRef: 'matter:1', projectRef: aRef })
    if (again.state !== 'ok') throw new Error('expected ok')
    expect(again.projects.trail).toHaveLength(1)

    const moved = projects.assign({ matterRef: 'matter:1', projectRef: bRef })
    if (moved.state !== 'ok') throw new Error('expected ok')
    expect(moved.projects.projects.find((entry) => entry.projectRef === aRef)?.matterRefs).toEqual([])
    expect(moved.projects.projects.find((entry) => entry.projectRef === bRef)?.matterRefs).toEqual(['matter:1'])
    expect(moved.projects.trail.at(-1)).toMatchObject({ action: 'move', matterRef: 'matter:1', fromProjectRef: aRef, toProjectRef: bRef })

    const out = projects.unassign({ matterRef: 'matter:1' })
    if (out.state !== 'ok') throw new Error('expected ok')
    expect(out.projects.projects.every((entry) => entry.matterRefs.length === 0)).toBe(true)
    expect(out.projects.trail.at(-1)).toMatchObject({ action: 'unassign', matterRef: 'matter:1', fromProjectRef: bRef, toProjectRef: null })
    // Removing what is not there is its own refusal, not a silent success.
    expect(projects.unassign({ matterRef: 'matter:1' })).toEqual({ state: 'refused', code: 'assignment-not-found' })
  })

  it('the summary references the same matter records by ref — never a copy of matter facts', () => {
    const projects = harness()
    const created = projects.create({ name: 'A' })
    if (created.state !== 'ok') throw new Error('expected ok')
    const ref = created.projects.projects[0]!.projectRef
    projects.assign({ matterRef: 'matter:1', projectRef: ref })
    const status = projects.list()
    expect(Object.keys(status.projects[0]!).sort()).toEqual(['createdAt', 'matterRefs', 'name', 'projectRef'])
    const text = JSON.stringify(status)
    for (const banned of ['responsibility', 'visibility', 'revision', 'mainResponsible', 'owner']) {
      expect(text, banned).not.toContain(banned)
    }
  })
})
