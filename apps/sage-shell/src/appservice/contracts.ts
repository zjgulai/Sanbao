/** WT-02D.0.1 contracts: the main-owned /.sage/* service surface. */
import type { SageViewState } from '../product/contracts.js'

export interface CallerBinding {
  readonly correlation: string
}

export type ServiceUnavailableReason = 'identity-unavailable' | 'authenticated'

export interface AuthStatus {
  readonly status: 'signed-in' | 'signed-out' | 'pending'
  readonly displayName: string | null
}

export interface ServiceStatus {
  readonly status: 'unavailable'
  readonly reason: ServiceUnavailableReason
  readonly auth: AuthStatus
  readonly correlation: string
}

export interface SageServiceState {
  readonly service: ServiceStatus
  readonly runtime: SageViewState | null
}

export interface ServiceProviders {
  readonly readState: () => Promise<Response>
  readonly dispatch: () => Promise<Response>
  readonly login: () => Promise<Response>
  readonly logout: () => Promise<Response>
}

export interface ServiceDeps {
  readonly callerBinding: CallerBinding | null
  readonly providers: ServiceProviders
}
