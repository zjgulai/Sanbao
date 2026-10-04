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

/** The run-monitor slot reads its own members defensively; steps carry the only live axis. */
export interface RunMonitorSlotView {
  readonly state?: string
  readonly steps?: { readonly state?: string, readonly reason?: unknown } | null
}

export type RunMonitorRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'read', readonly slot: RunMonitorSlotView }

/** The wire fields the artifact card and its preview panel read. */
export interface ArtifactCardView {
  readonly artifactId?: string
  readonly name?: string
  readonly kind?: string
  readonly bytes?: number
  readonly version?: string
  readonly state?: string
}

export interface ArtifactPreviewView {
  readonly state?: string
  readonly artifactId?: string
  readonly name?: string
  readonly version?: string
  readonly expanded?: boolean
  readonly window?: boolean
  readonly code?: string
  readonly retryable?: boolean
}

export type ArtifactsRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'cards', readonly cards: readonly ArtifactCardView[], readonly preview: ArtifactPreviewView }

/** One run-log page: the display rows and the legacy-computed notice sentence. */
export interface RunLogResult {
  readonly lines: readonly { readonly no?: unknown, readonly text?: unknown }[]
  readonly append: boolean
  readonly notice: string
}

/** One derived side-chat record; fields are read defensively by the view. */
export interface SideChatItemView {
  readonly sideChatId?: string
  readonly execution?: string
  readonly lastTurnEnd?: unknown
  readonly createdAt?: unknown
  readonly atSeq?: unknown
}

export type SideChatsRegionMessage =
  | { readonly kind: 'unavailable', readonly code?: string }
  | { readonly kind: 'read', readonly slot: { readonly state?: string, readonly items?: readonly SideChatItemView[], readonly code?: string } }

export interface SideChatTranscriptResult {
  readonly kind: 'read' | 'failed'
  readonly transcript?: readonly { readonly role?: unknown, readonly text?: unknown }[]
  readonly execution?: string
  readonly notice?: string
}

export interface ActionItemView {
  readonly actionId?: string
  readonly title?: string
  readonly state?: string
  readonly revision?: unknown
  readonly records?: readonly { readonly recordNo?: unknown, readonly at?: unknown, readonly basis?: { readonly revision?: unknown, readonly title?: unknown, readonly note?: unknown } }[]
}

export interface CorrectionView {
  readonly correctionId?: string
  readonly text?: string
  readonly original?: { readonly text?: unknown, readonly at?: unknown }
  readonly receipt?: { readonly state?: string, readonly reason?: unknown, readonly code?: unknown } | null
}

export interface ProjectView {
  readonly projectRef?: string
  readonly name?: string
  readonly matterRefs?: readonly unknown[]
}

export interface ActionItemsSlotView {
  readonly items?: readonly ActionItemView[]
  readonly corrections?: readonly CorrectionView[]
  readonly originals?: readonly { readonly text?: string, readonly at?: string | null }[]
  readonly projectsState?: string
  readonly projects?: readonly ProjectView[]
}

export type ActionItemsRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'read', readonly slot: ActionItemsSlotView }

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
  runLogOpen?: (path: string) => Promise<RunLogResult>
  runLogContinue?: () => Promise<RunLogResult>
  observeArtifacts?: () => Promise<string | null>
  retryArtifactPreview?: () => Promise<unknown>
  closeArtifactPreview?: () => Promise<unknown>
  setArtifactFullscreen?: (on: boolean) => Promise<void>
  artifactWindow?: (action: 'open' | 'close') => Promise<string>
  createSideChat?: () => Promise<string>
  readSideChat?: (sideChatId: string) => Promise<SideChatTranscriptResult>
  sendSideChat?: (sideChatId: string, text: string) => Promise<{ readonly notice: string, readonly transcript: SideChatTranscriptResult | null }>
  returnSideChat?: (sideChatId: string, text: string) => Promise<string>
  createActionItem?: (title: string, note: string | null) => Promise<string | null>
  actionItemRowAction?: (actionId: string, action: 'start' | 'complete') => Promise<void>
  submitCorrection?: (original: { readonly text: string, readonly at: string | null } | null, text: string) => Promise<string | null>
  createProject?: (name: string) => Promise<string | null>
  assignProject?: (projectRef: string) => Promise<string | null>
  unassignProject?: () => Promise<string | null>
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
