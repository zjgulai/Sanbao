/**
 * The region bridge (ADR-0261, strangler P2/P3).
 *
 * The legacy inline client script stays the single owner of the wire interpretation: it
 * validates the `/.sage/state` envelope and publishes per-region messages through
 * `window.__SAGE_APP_SET_REGION__(region, message)` — `matter` (P2), `sites` and `tool-results`
 * (P3). It also publishes every view switch through `window.__SAGE_APP_SET_VIEW__` so the React
 * matter region can mirror the legacy drawer policy (leave matter -> close; enter matter at wide
 * width -> open). Actions that stay on the legacy wire (artifact preview, checked external link)
 * are exposed back to the React cards through `window.__SAGE_LEGACY_ACTIONS__`: the React side
 * owns the DOM and the transient button/notice state, the legacy side owns requests, refusal
 * codes and the returned notice text.
 */
import type { SageMatterViewState } from '../view-state.js'

export type MatterRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'projection', readonly projection: SageMatterViewState }

/** The wire fields the web-deliverables catalog reads from one artifact card. */
export interface SitesCardView {
  readonly kind?: string
  readonly artifactId?: string
  readonly name?: string
  readonly version?: string
  readonly state?: string
}

export type SitesRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'cards', readonly cards: readonly SitesCardView[] }

/** One typed tool-result field; each kind reads its own optional members defensively. */
export interface ToolResultFieldView {
  readonly kind?: string
  readonly text?: string
  readonly entries?: readonly { readonly name?: unknown, readonly value?: unknown }[]
  readonly columns?: readonly unknown[]
  readonly rows?: readonly (readonly unknown[])[]
  readonly label?: string
  readonly host?: string
  readonly url?: string
  readonly name?: string
  readonly version?: string
  readonly artifactId?: string
  readonly code?: string
}

export interface ToolResultView {
  readonly resultId?: string
  readonly tool?: string
  readonly title?: string
  readonly at?: string
  readonly state?: string
  readonly declaredType?: string
  readonly fields?: readonly ToolResultFieldView[]
}

export type ToolResultsRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'results', readonly results: readonly ToolResultView[] }

export interface AppBridgeSnapshot {
  /** Last message per region key (`matter`, `sites`, `tool-results`, ...); absent = unavailable. */
  readonly regions: Readonly<Record<string, unknown>>
  readonly view: string
}

export interface AppBridgeStore {
  getSnapshot(): AppBridgeSnapshot
  subscribe(listener: () => void): () => void
  setRegion(region: string, message: unknown): void
  setView(view: string): void
}

export function createAppBridgeStore(): AppBridgeStore {
  let snapshot: AppBridgeSnapshot = { regions: {}, view: 'matter' }
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
    setRegion: (region, message) => {
      snapshot = { ...snapshot, regions: { ...snapshot.regions, [region]: message } }
      emit()
    },
    setView: (view) => {
      snapshot = { ...snapshot, view }
      emit()
    },
  }
}

/** The legacy-backed actions a React region may call for its explicit entries. */
export interface LegacyActions {
  openArtifact?: (artifactId: string) => Promise<unknown>
  openExternalLink?: (url: string) => Promise<string>
}

/** Read one region slice off the store snapshot with a typed default. */
export function regionMessage<T>(snapshot: AppBridgeSnapshot, region: string, fallback: T): T {
  const message = snapshot.regions[region]
  return message === undefined ? fallback : message as T
}

declare global {
  interface Window {
    /** Set once the React app root has committed; asserted by the window probe and smoke spec. */
    __SAGE_APP_MOUNTED__?: boolean
    /** Legacy script -> React regions: the validated slice for one region. */
    __SAGE_APP_SET_REGION__?: (region: string, message: unknown) => void
    /** Legacy script -> React regions: the active workbench view (drawer policy input). */
    __SAGE_APP_SET_VIEW__?: (view: string) => void
    /** React regions -> legacy script: explicit entries that stay on the legacy wire. */
    __SAGE_LEGACY_ACTIONS__?: LegacyActions
  }
}
