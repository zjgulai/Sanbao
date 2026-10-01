/** Unavailable-first composition: no provider assembled, stable denials (spec §3.2). */
import { randomUUID } from 'node:crypto'
import type { SageViewState } from '../product/contracts.js'
import type { SageServiceState, ServiceProviders } from './contracts.js'
import { serviceJson } from './errors.js'
import { runCommand } from './command-pipeline.js'
import type { CommandPipelinePorts } from './command-contracts.js'

/** Production has no provider for any step: every port fails closed (spec §5). */
const PRODUCTION_FAIL_CLOSED_PORTS: CommandPipelinePorts = {
  resolveIdentityPolicy: () => undefined,
  strictRehydrate: () => undefined,
  resolveTarget: () => undefined,
  resolveCompatibility: () => undefined,
  resolveRegistry: () => undefined,
  preflightAvailability: () => undefined,
  persistPreparation: () => undefined,
  dispatchOperation: () => undefined,
  now: () => '1970-01-01T00:00:00.000Z',
}

export function createUnavailableFirstService(runtime: SageViewState | null): ServiceProviders {
  return {
    async readState(): Promise<Response> {
      const state: SageServiceState = {
        service: { status: 'unavailable', reason: 'identity-unavailable', correlation: randomUUID() },
        runtime,
      }
      return serviceJson(state, 200)
    },
    async dispatch(): Promise<Response> {
      const result = runCommand({
        intent: { type: 'retry' },
        correlation: randomUUID(),
        ports: PRODUCTION_FAIL_CLOSED_PORTS,
      })
      return serviceJson(result, 'code' in result && result.code === 'invalid-intent' ? 400 : 200)
    },
  }
}
