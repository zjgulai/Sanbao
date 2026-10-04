/**
 * The matter workbench region bridge (ADR-0261, strangler P2).
 *
 * The legacy inline client script stays the single owner of the wire interpretation: it
 * validates the `/.sage/state` envelope and publishes one of three messages through
 * `window.__SAGE_APP_SET_MATTER__`. It also publishes every view switch through
 * `window.__SAGE_APP_SET_VIEW__` so the React region can mirror the legacy drawer policy
 * (leave matter -> close; enter matter at wide width -> open). The React region renders from
 * these messages only; it never writes outside its container.
 */
import type { SageMatterViewState } from '../view-state.js'

export type MatterRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'projection', readonly projection: SageMatterViewState }

export interface MatterRegionSnapshot {
  readonly message: MatterRegionMessage
  readonly view: string
}

export interface MatterRegionStore {
  getSnapshot(): MatterRegionSnapshot
  subscribe(listener: () => void): () => void
  setMessage(message: MatterRegionMessage): void
  setView(view: string): void
}

export function createMatterRegionStore(): MatterRegionStore {
  let snapshot: MatterRegionSnapshot = { message: { kind: 'unavailable' }, view: 'matter' }
  const listeners = new Set<() => void>()
  const emit = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setMessage: (message) => {
      snapshot = { ...snapshot, message }
      emit()
    },
    setView: (view) => {
      snapshot = { ...snapshot, view }
      emit()
    },
  }
}

declare global {
  interface Window {
    /** Legacy script -> React region: the validated matter projection state. */
    __SAGE_APP_SET_MATTER__?: (message: MatterRegionMessage) => void
    /** Legacy script -> React region: the active workbench view (drawer policy input). */
    __SAGE_APP_SET_VIEW__?: (view: string) => void
  }
}
