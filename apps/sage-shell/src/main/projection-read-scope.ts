import { AsyncLocalStorage } from 'node:async_hooks'

import type { ProjectionReadScope } from '../appservice/projection-read-admission.js'

export interface ProjectionReadScopeStorage {
  readonly run: <T>(scope: ProjectionReadScope, callback: () => T) => T
  readonly current: () => ProjectionReadScope | undefined
}

const storage = new AsyncLocalStorage<ProjectionReadScope>()

export const projectionReadScope: ProjectionReadScopeStorage = Object.freeze({
  run<T>(scope: ProjectionReadScope, callback: () => T): T {
    const immutableScope = Object.freeze({ ...scope })
    return storage.run(immutableScope, callback)
  },
  current(): ProjectionReadScope | undefined {
    return storage.getStore()
  },
})
