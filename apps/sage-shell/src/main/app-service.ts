/** The single assembly point for main's /.sage/* providers (WT-02D.1): main wiring and the
 * real-window fixture probe both consume this module, so the injection logic under test is
 * the production logic. WT-02D.2A adds the authorization-path assembly: a real step-2 port
 * (intent assembly + Authority Runtime) and retry's availability probe merged over the
 * fail-closed defaults — steps 3-10 stay fail closed. */
import { randomUUID } from 'node:crypto'
import type { SageViewState } from '../product/contracts.js'
import type { SageMatterViewState } from '../product/view-state.js'
import { createSageFixtureViewState } from '../product/view-state.js'
import { createUnavailableFirstService, PRODUCTION_FAIL_CLOSED_PORTS } from '../appservice/composition.js'
import { serviceJson } from '../appservice/errors.js'
import type { ServiceProviders } from '../appservice/contracts.js'
import type { CommandPipelinePorts } from '../appservice/command-contracts.js'
import type { IdentityPolicyResolution } from '../security/identity-policy.js'
import type { OidcAdapter } from './oidc-adapter.js'
import type { TokenVault } from './token-vault.js'
import type { RuntimeInventoryProvider } from './runtime-inventory-provider.js'
import { createSageAuthorityRuntime } from './authority-runtime.js'
import { assembleAuthorizationRequest } from './authorization-assembly.js'
import { loadOrganizationPolicy } from './organization-policy.js'

/** WT-02D.1 fixture switch: read once from env. The fixture projection only fills the read-only
 * matter slot for local verification and can never satisfy production authority. */
export function resolveFixtureProjection(env: NodeJS.ProcessEnv): (() => SageMatterViewState) | undefined {
  return env.SAGE_FIXTURE_PROJECTION === '1' ? createSageFixtureViewState : undefined
}

/** WT-02D.2A: the module's own stable denial for an action type that is not registered for
 * authorization (code from the kernel union, own reason text; surfaces as policy-denied). */
const INVALID_ACTION_DENIAL: IdentityPolicyResolution = Object.freeze({
  kind: 'denied' as const,
  code: 'invalid-request' as const,
  reason: 'The action type is not registered for authorization.',
})

export interface SageAppServiceOptions {
  readonly viewState: SageViewState
  readonly vault: TokenVault
  readonly adapter: OidcAdapter
  readonly fixtureProjection?: () => SageMatterViewState
  /** WT-02C.2E.2: main-owned runtime inventory provider; the seam exists ahead of its
   * C2E.2 resolver consumer and carries no behavior change for current routes. */
  readonly runtimeInventory?: Pick<RuntimeInventoryProvider, 'read'>
  /** WT-02D.2A authorization wiring; absent keeps every command port fail closed. */
  readonly authority?: {
    readonly policyPath: string
    readonly readFileBytes: (absolutePath: string) => Buffer
    readonly now: () => string
  }
}

function createAuthorizationCommandPorts(options: SageAppServiceOptions & { readonly authority: NonNullable<SageAppServiceOptions['authority']> }): CommandPipelinePorts {
  const { vault, authority } = options
  const runtime = createSageAuthorityRuntime({
    vault,
    policyPath: authority.policyPath,
    readFileBytes: authority.readFileBytes,
    now: authority.now,
  })
  const policyInput = { policyPath: authority.policyPath, readFileBytes: authority.readFileBytes }
  return {
    ...PRODUCTION_FAIL_CLOSED_PORTS,
    resolveIdentityPolicy: ({ intent }) => {
      if ('type' in intent) return undefined // defensive: retry rides the availability branch, never this port
      const session = vault.identitySession()
      const load = loadOrganizationPolicy(policyInput)
      const assembled = assembleAuthorizationRequest({
        intent,
        sessionRef: session?.sessionRef ?? null,
        organizationRef: load.kind === 'loaded' ? load.policy.organizationId : null,
      })
      if (assembled.kind === 'unavailable') return undefined
      if (assembled.kind === 'invalid') return INVALID_ACTION_DENIAL
      return runtime.resolve(assembled.request)
    },
    checkAuthorizationAvailability: () => runtime.checkAuthorizationAvailability().ok ? { ok: true } : undefined,
  }
}

/** Assemble providers for one request; callers pass a fresh `viewState` per evaluation. */
export function createSageAppServiceProviders(options: SageAppServiceOptions): ServiceProviders {
  const { viewState, vault, adapter } = options
  return createUnavailableFirstService(viewState, {
    authSnapshot: () => vault.status() === 'pending'
      ? { status: 'pending' as const, displayName: null }
      : vault.snapshot(),
    ...(options.fixtureProjection === undefined ? {} : { fixtureProjection: options.fixtureProjection }),
    ...(options.authority === undefined
      ? {}
      : { commandPorts: createAuthorizationCommandPorts({ ...options, authority: options.authority }) }),
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
