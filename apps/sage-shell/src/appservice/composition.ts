/** Unavailable-first composition: no provider assembled, stable denials (spec §3.2). */
import { randomUUID } from 'node:crypto'
import type { SageViewState } from '../product/contracts.js'
import type { SageMatterViewState } from '../product/view-state.js'
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

export interface ServiceOptions {
  readonly authSnapshot?: () => { readonly status: 'signed-out' | 'signed-in' | 'pending'; readonly displayName: string | null }
  readonly login?: () => Promise<Response>
  readonly logout?: () => Promise<Response>
  /** Explicit fixture-mode matter projection (WT-02D.1): injected by main only under its fixture switch; absent keeps the slot null. */
  readonly fixtureProjection?: () => SageMatterViewState
}

export function createUnavailableFirstService(runtime: SageViewState | null, options: ServiceOptions = {}): ServiceProviders {
  const snapshot = options.authSnapshot ?? (() => ({ status: 'signed-out' as const, displayName: null }))
  return {
    async readState(): Promise<Response> {
      const snap = snapshot()
      const state: SageServiceState = {
        service: {
          status: 'unavailable',
          // Spec §6: identity established once a session exists (signed-in) or is being established (pending).
          reason: snap.status === 'signed-out' ? 'identity-unavailable' : 'authenticated',
          auth: { status: snap.status, displayName: snap.displayName },
          correlation: randomUUID(),
        },
        matter: options.fixtureProjection?.() ?? null,
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
    async login(): Promise<Response> {
      if (options.login !== undefined) return options.login()
      return serviceJson({ auth: 'signed-out' }, 200)
    },
    async logout(): Promise<Response> {
      if (options.logout !== undefined) return options.logout()
      return serviceJson({ auth: 'signed-out' }, 200)
    },
  }
}
