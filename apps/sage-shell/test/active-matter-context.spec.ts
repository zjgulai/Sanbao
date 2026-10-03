import { describe, expect, it } from 'vitest'

import {
  createActiveMatterContext,
  type ActiveMatterContextInput,
  type ActiveMatterContextExpectation,
} from '../src/main/active-matter-context.js'

const first: ActiveMatterContextInput = {
  actorScopeRef: 'actor-scope:one',
  matterId: 'matter:one',
  revisionId: 'revision:one',
  workspaceRef: 'workspace:one',
  trustedWorkspaceRoot: '/trusted/workspace-one',
  sessionRef: 'session:one',
  frameGeneration: 41,
}

const expected = (overrides: Partial<ActiveMatterContextExpectation> = {}): ActiveMatterContextExpectation => ({
  contextGeneration: 1,
  actorScopeRef: first.actorScopeRef,
  matterId: first.matterId,
  revisionId: first.revisionId,
  workspaceRef: first.workspaceRef,
  sessionRef: first.sessionRef,
  frameGeneration: first.frameGeneration,
  ...overrides,
})

describe('main-owned active matter context', () => {
  it('activates from the empty generation with an immutable internal snapshot', () => {
    const context = createActiveMatterContext()

    expect(context.contextGeneration()).toBe(0)
    expect(context.snapshot()).toBeNull()
    expect(context.projection()).toBeNull()

    const activated = context.activate({ expectedContextGeneration: 0, next: first })
    expect(activated).toEqual({
      ok: true,
      contextGeneration: 1,
      snapshot: { ...first, contextGeneration: 1 },
    })
    expect(Object.isFrozen(activated.ok ? activated.snapshot : null)).toBe(true)
    expect(context.snapshot()).toEqual({ ...first, contextGeneration: 1 })
  })

  it('treats activation as compare-and-swap and leaves the winner untouched on refusal', () => {
    const context = createActiveMatterContext()
    expect(context.activate({ expectedContextGeneration: 7, next: first })).toEqual({
      ok: false,
      code: 'stale-context-generation',
    })
    expect(context.contextGeneration()).toBe(0)
    expect(context.snapshot()).toBeNull()

    expect(context.activate({ expectedContextGeneration: 0, next: first }).ok).toBe(true)
    expect(context.activate({ expectedContextGeneration: 1, next: { ...first, revisionId: 'revision:two' } })).toEqual({
      ok: false,
      code: 'context-already-active',
    })
    expect(context.snapshot()).toEqual({ ...first, contextGeneration: 1 })
  })

  it('names stale generation, matter, workspace and current-revision refusals', () => {
    const cases: readonly [Partial<ActiveMatterContextExpectation>, string][] = [
      [{ contextGeneration: 0 }, 'stale-context-generation'],
      [{ matterId: 'matter:other' }, 'matter-mismatch'],
      [{ workspaceRef: 'workspace:other' }, 'workspace-mismatch'],
      [{ revisionId: 'revision:stale' }, 'stale-current-revision'],
    ]

    for (const [overrides, code] of cases) {
      const context = createActiveMatterContext()
      expect(context.activate({ expectedContextGeneration: 0, next: first }).ok).toBe(true)
      expect(context.match(expected(overrides))).toEqual({ ok: false, code })
      expect(context.snapshot()).toEqual({ ...first, contextGeneration: 1 })
    }
  })

  it('replaces only the expected same matter and workspace, advancing its own generation', () => {
    const context = createActiveMatterContext()
    expect(context.activate({ expectedContextGeneration: 0, next: first }).ok).toBe(true)

    expect(context.replace({
      expected: expected(),
      next: { ...first, matterId: 'matter:other', revisionId: 'revision:two' },
    })).toEqual({ ok: false, code: 'matter-mismatch' })
    expect(context.replace({
      expected: expected(),
      next: { ...first, workspaceRef: 'workspace:other', revisionId: 'revision:two' },
    })).toEqual({ ok: false, code: 'workspace-mismatch' })
    expect(context.replace({
      expected: expected(),
      next: { ...first, trustedWorkspaceRoot: '/trusted/elsewhere', revisionId: 'revision:two' },
    })).toEqual({ ok: false, code: 'workspace-mismatch' })

    const replaced = context.replace({
      expected: expected(),
      next: { ...first, revisionId: 'revision:two', sessionRef: 'session:two' },
    })
    expect(replaced).toEqual({
      ok: true,
      contextGeneration: 2,
      snapshot: {
        ...first,
        revisionId: 'revision:two',
        sessionRef: 'session:two',
        contextGeneration: 2,
      },
    })
  })

  it('invalidates atomically so an old snapshot cannot match or reactivate', () => {
    const context = createActiveMatterContext()
    expect(context.activate({ expectedContextGeneration: 0, next: first }).ok).toBe(true)
    const oldExpectation = expected()

    expect(context.invalidate({ expected: oldExpectation })).toEqual({
      ok: true,
      contextGeneration: 2,
      snapshot: null,
    })
    expect(context.snapshot()).toBeNull()
    expect(context.projection()).toBeNull()
    expect(context.match(oldExpectation)).toEqual({ ok: false, code: 'stale-context-generation' })
    expect(context.activate({ expectedContextGeneration: 1, next: first })).toEqual({
      ok: false,
      code: 'stale-context-generation',
    })
    expect(context.activate({ expectedContextGeneration: 2, next: first })).toMatchObject({
      ok: true,
      contextGeneration: 3,
    })
  })

  it('projects only non-sensitive context and never actor, session or absolute root', () => {
    const context = createActiveMatterContext()
    expect(context.activate({ expectedContextGeneration: 0, next: first }).ok).toBe(true)

    const projection = context.projection()
    expect(projection).toEqual({
      matterId: first.matterId,
      revisionId: first.revisionId,
      workspaceRef: first.workspaceRef,
      contextGeneration: 1,
      frameGeneration: 41,
    })
    expect(Object.isFrozen(projection)).toBe(true)
    expect(projection).not.toHaveProperty('actorScopeRef')
    expect(projection).not.toHaveProperty('sessionRef')
    expect(projection).not.toHaveProperty('trustedWorkspaceRoot')
    expect(JSON.stringify(projection)).not.toContain('/trusted/')
  })

  it('keeps frame and context generations independent and checks each explicitly', () => {
    const context = createActiveMatterContext()
    expect(context.activate({ expectedContextGeneration: 0, next: first })).toMatchObject({
      ok: true,
      contextGeneration: 1,
      snapshot: { frameGeneration: 41 },
    })

    expect(context.match(expected({ frameGeneration: 40 }))).toEqual({
      ok: false,
      code: 'frame-generation-mismatch',
    })
    expect(context.replace({
      expected: expected(),
      next: { ...first, revisionId: 'revision:two', frameGeneration: 41 },
    })).toMatchObject({
      ok: true,
      contextGeneration: 2,
      snapshot: { frameGeneration: 41 },
    })

    expect(context.replace({
      expected: expected({ contextGeneration: 2, revisionId: 'revision:two' }),
      next: { ...first, revisionId: 'revision:three', frameGeneration: 99 },
    })).toMatchObject({
      ok: true,
      contextGeneration: 3,
      snapshot: { frameGeneration: 99 },
    })
  })

  it('does not let actor or session scope drift through an otherwise current expectation', () => {
    const context = createActiveMatterContext()
    expect(context.activate({ expectedContextGeneration: 0, next: first }).ok).toBe(true)
    expect(context.match(expected({ actorScopeRef: 'actor-scope:other' }))).toEqual({
      ok: false,
      code: 'actor-scope-mismatch',
    })
    expect(context.match(expected({ sessionRef: 'session:other' }))).toEqual({
      ok: false,
      code: 'session-mismatch',
    })
  })

  it('atomically selects or switches an explicitly resolved context with one generation CAS', () => {
    const context = createActiveMatterContext()
    expect(context.select({ expectedContextGeneration: 0, next: first })).toMatchObject({
      ok: true,
      contextGeneration: 1,
      snapshot: { matterId: 'matter:one', revisionId: 'revision:one' },
    })

    const second: ActiveMatterContextInput = {
      actorScopeRef: 'actor-scope:two',
      matterId: 'matter:two',
      revisionId: 'revision:two',
      workspaceRef: 'workspace:two',
      trustedWorkspaceRoot: '/trusted/workspace-two',
      sessionRef: 'session:two',
      frameGeneration: 72,
    }
    expect(context.select({ expectedContextGeneration: 0, next: second })).toEqual({
      ok: false,
      code: 'stale-context-generation',
    })
    expect(context.snapshot()).toMatchObject({ matterId: 'matter:one', contextGeneration: 1 })

    expect(context.select({ expectedContextGeneration: 1, next: second })).toEqual({
      ok: true,
      contextGeneration: 2,
      snapshot: { ...second, contextGeneration: 2 },
    })
  })
})
