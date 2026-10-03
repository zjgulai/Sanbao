import type { ServiceProviders } from '../../src/appservice/contracts.js'
import type { ProjectionReadRouteRunner } from '../../src/appservice/contracts.js'

/**
 * Explicit test-only admission for specs whose subject is the provider/renderer behavior after
 * authority has already allowed a read. Production never imports this file. Separate route and
 * production-admission specs cover the blocked path and provider zero-call invariant.
 */
export const allowProjectionReadForTest: ProjectionReadRouteRunner = async (_intent, read) => {
  const value = await read({
    matterRef: 'matter:test',
    revisionRef: 'revision:test',
    workspaceRef: 'workspace:test',
    trustedWorkspaceRoot: '/workspace/test',
    sessionRef: 'session:test',
    actorScopeRef: 'actor:test',
    contextGeneration: 1,
    frameGeneration: 1,
  })
  return { state: 'read', correlation: 'test-projection-read', value }
}

export function withProjectionReadTestAdmission<T extends ServiceProviders>(providers: T): T {
  return { ...providers, runProjectionRead: allowProjectionReadForTest }
}
