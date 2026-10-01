/** Unavailable-first composition: no provider assembled, stable denials (spec §3.2). */
import { randomUUID } from 'node:crypto'
import type { SageViewState } from '../product/contracts.js'
import type { SageServiceState, ServiceProviders } from './contracts.js'
import { serviceJson } from './errors.js'

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
      return serviceJson({ error: 'identity-unavailable', retryable: false }, 503)
    },
  }
}
