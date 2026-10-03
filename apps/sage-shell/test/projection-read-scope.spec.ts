import { describe, expect, it } from 'vitest'

import type { ProjectionReadScope } from '../src/appservice/projection-read-admission.js'
import { projectionReadScope } from '../src/main/projection-read-scope.js'

const firstScope: ProjectionReadScope = {
  matterRef: 'matter:first',
  revisionRef: 'revision:first',
  workspaceRef: 'workspace:first',
  trustedWorkspaceRoot: '/trusted/first',
  sessionRef: 'session:first',
  actorScopeRef: 'actor:first',
  contextGeneration: 11,
  frameGeneration: 21,
}

const secondScope: ProjectionReadScope = {
  matterRef: 'matter:second',
  revisionRef: 'revision:second',
  workspaceRef: 'workspace:second',
  trustedWorkspaceRoot: '/trusted/second',
  sessionRef: 'session:second',
  actorScopeRef: 'actor:second',
  contextGeneration: 12,
  frameGeneration: 22,
}

function deferred(): { readonly promise: Promise<void>, readonly resolve: () => void } {
  let resolvePromise: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: () => resolvePromise?.(),
  }
}

describe('projectionReadScope', () => {
  it('publishes a frozen copy only inside the request callback', () => {
    expect(projectionReadScope.current()).toBeUndefined()
    const source = { ...firstScope }

    const result = projectionReadScope.run(source, () => {
      const current = projectionReadScope.current()
      expect(current).toEqual(firstScope)
      expect(current).not.toBe(source)
      expect(Object.isFrozen(current)).toBe(true)

      source.matterRef = 'matter:changed-after-run'
      expect(projectionReadScope.current()).toEqual(firstScope)
      expect(() => {
        (current as { matterRef: string }).matterRef = 'matter:forbidden'
      }).toThrow(TypeError)

      return 'completed'
    })

    expect(result).toBe('completed')
    expect(projectionReadScope.current()).toBeUndefined()
  })

  it('isolates overlapping asynchronous requests without crossing scopes', async () => {
    const firstEntered = deferred()
    const releaseFirst = deferred()

    const first = projectionReadScope.run(firstScope, async () => {
      expect(projectionReadScope.current()).toEqual(firstScope)
      firstEntered.resolve()
      await releaseFirst.promise
      expect(projectionReadScope.current()).toEqual(firstScope)
      return 'first'
    })

    await firstEntered.promise
    expect(projectionReadScope.current()).toBeUndefined()

    const second = projectionReadScope.run(secondScope, async () => {
      expect(projectionReadScope.current()).toEqual(secondScope)
      await Promise.resolve()
      expect(projectionReadScope.current()).toEqual(secondScope)
      releaseFirst.resolve()
      return 'second'
    })

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second'])
    expect(projectionReadScope.current()).toBeUndefined()
  })

  it('restores the outer scope after a nested callback throws', () => {
    projectionReadScope.run(firstScope, () => {
      expect(projectionReadScope.current()).toEqual(firstScope)
      expect(() => projectionReadScope.run(secondScope, () => {
        expect(projectionReadScope.current()).toEqual(secondScope)
        throw new Error('nested failure')
      })).toThrow('nested failure')
      expect(projectionReadScope.current()).toEqual(firstScope)
    })

    expect(projectionReadScope.current()).toBeUndefined()
  })

  it('restores an empty scope after an asynchronous callback rejects', async () => {
    await expect(projectionReadScope.run(firstScope, async () => {
      expect(projectionReadScope.current()).toEqual(firstScope)
      await Promise.resolve()
      throw new Error('async failure')
    })).rejects.toThrow('async failure')

    expect(projectionReadScope.current()).toBeUndefined()
  })
})
