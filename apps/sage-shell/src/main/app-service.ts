/** The single assembly point for main's /.sage/* providers (WT-02D.1): main wiring and the
 * real-window fixture probe both consume this module, so the injection logic under test is
 * the production logic. */
import { randomUUID } from 'node:crypto'
import type { SageViewState } from '../product/contracts.js'
import type { SageMatterViewState } from '../product/view-state.js'
import { createSageFixtureViewState } from '../product/view-state.js'
import { createUnavailableFirstService } from '../appservice/composition.js'
import { serviceJson } from '../appservice/errors.js'
import type { ServiceProviders } from '../appservice/contracts.js'
import type { OidcAdapter } from './oidc-adapter.js'
import type { TokenVault } from './token-vault.js'

/** WT-02D.1 fixture switch: read once from env. The fixture projection only fills the read-only
 * matter slot for local verification and can never satisfy production authority. */
export function resolveFixtureProjection(env: NodeJS.ProcessEnv): (() => SageMatterViewState) | undefined {
  return env.SAGE_FIXTURE_PROJECTION === '1' ? createSageFixtureViewState : undefined
}

export interface SageAppServiceOptions {
  readonly viewState: SageViewState
  readonly vault: TokenVault
  readonly adapter: OidcAdapter
  readonly fixtureProjection?: () => SageMatterViewState
}

/** Assemble providers for one request; callers pass a fresh `viewState` per evaluation. */
export function createSageAppServiceProviders(options: SageAppServiceOptions): ServiceProviders {
  const { viewState, vault, adapter } = options
  return createUnavailableFirstService(viewState, {
    authSnapshot: () => vault.status() === 'pending'
      ? { status: 'pending' as const, displayName: null }
      : vault.snapshot(),
    ...(options.fixtureProjection === undefined ? {} : { fixtureProjection: options.fixtureProjection }),
    login: async () => {
      const outcome = await adapter.startLogin(vault)
      return serviceJson(
        outcome.ok
          ? { auth: 'signed-in', displayName: outcome.displayName }
          : {
              code: outcome.code,
              stage: 'login',
              retryable: outcome.code !== 'login-in-progress',
              correlation: randomUUID(),
            },
        outcome.ok ? 202 : 200,
      )
    },
    logout: async () => {
      vault.signOut()
      return serviceJson({ auth: 'signed-out' }, 200)
    },
  })
}
