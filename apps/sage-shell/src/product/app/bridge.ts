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

/** One candidate plan and its step readiness, read defensively by the plan card. */
export interface PlanStepView {
  readonly stepNo?: number
  readonly title?: string
  readonly readiness?: string
  readonly readinessNote?: string
}

export interface PlanRowView {
  readonly planId?: string
  readonly title?: string
  readonly state?: string
  readonly acceptedAt?: unknown
  readonly steps?: readonly PlanStepView[]
}

export type PlansRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'read', readonly slot: { readonly plans?: readonly PlanRowView[], readonly lastStepRun?: unknown } }

/** The prepare-step outcome: a minted card, a refusal sentence, or a quiet no-op. */
export type PlanPrepareResult =
  | { readonly kind: 'prepared', readonly card: Record<string, unknown> }
  | { readonly kind: 'notice', readonly notice: string }
  | { readonly kind: 'quiet' }

/** The execute-step outcome: the projection-carried run, a settled ack, or a refusal notice. */
export type PlanExecuteResult =
  | { readonly kind: 'run', readonly run: unknown }
  | { readonly kind: 'settled' }
  | { readonly kind: 'notice', readonly notice: string }
  | { readonly kind: 'quiet' }

/** One matter-list entry; fields are read defensively by the card. */
export interface MatterListItemView {
  readonly itemId?: unknown
  readonly matterRef?: unknown
  readonly title?: unknown
  readonly partition?: unknown
  readonly lifecycle?: unknown
  readonly updatedAt?: unknown
  readonly triggers?: readonly { readonly kind?: unknown, readonly ref?: unknown, readonly count?: unknown }[]
}

/** The projected active matter context (parsed legacy-side); absent members mean "not wired". */
export interface ActiveContextView {
  readonly state?: string
  readonly contextGeneration?: number
  readonly matterId?: string
}

export type MatterListRegionMessage =
  | { readonly kind: 'unavailable', readonly code?: string, readonly activeContext?: ActiveContextView | null }
  | { readonly kind: 'read', readonly slot: { readonly items?: readonly MatterListItemView[] }, readonly activeContext?: ActiveContextView | null }

/** One generation-bound select outcome: the refreshed projection owns the truth either way. */
export type MatterContextSelectResult =
  | { readonly kind: 'selected' }
  | { readonly kind: 'cleared' }
  | { readonly kind: 'notice', readonly noticeKind: 'refused' | 'invalid', readonly text: string }

/** The draft card's inputs; every member is read defensively by the view. */
export interface DraftFieldsView {
  readonly goal?: unknown
  readonly deliverable?: unknown
  readonly responsibility?: unknown
  readonly projectRef?: unknown
}

export interface DraftEntryView {
  readonly draftId?: unknown
  readonly fields?: DraftFieldsView
  readonly clarification?: unknown
  readonly history?: readonly { readonly entryId?: unknown, readonly text?: unknown, readonly selected?: unknown }[]
  readonly status?: unknown
  readonly matterRef?: unknown
  readonly complete?: unknown
  readonly attempt?: { readonly state?: unknown } | null
  readonly updatedAt?: unknown
}

export interface SiteTemplateEntryView {
  readonly templateId?: unknown
  readonly name?: unknown
  readonly source?: unknown
  readonly version?: unknown
  readonly prompt?: unknown
}

export interface DraftAuthView {
  readonly status?: string
  readonly displayName?: string | null
}

export interface SiteTemplatesView {
  readonly state?: string
  readonly reason?: unknown
  readonly entries?: readonly SiteTemplateEntryView[]
}

export type DraftRegionMessage =
  | { readonly kind: 'locked', readonly siteTemplates?: SiteTemplatesView }
  | { readonly kind: 'unavailable', readonly siteTemplates?: SiteTemplatesView }
  | { readonly kind: 'read', readonly slot: {
      readonly drafts?: readonly DraftEntryView[],
      readonly auth?: DraftAuthView,
      readonly siteTemplates?: SiteTemplatesView,
    } }

/** One terminal read page as the legacy wire returns it (close is a pure-local React state). */
export type SessionTerminalReadResult =
  | { readonly kind: 'read', readonly text: string, readonly lineBegin: number, readonly lineEnd: number, readonly totalLines: number, readonly truncated: boolean }
  | { readonly kind: 'notice', readonly notice: string }

/**
 * The session card (D3) region message. Every sub-slice is the raw `/.sage/state` slice the
 * legacy wire validated; React parses each defensively and derives its display words. The one
 * pre-derived member is `suggestions` (the planned wire already filters/slices it).
 */
/**
 * The capability roster card and the model-config card (P4 batch 26). Both are pure read-only
 * projections (no requests, no write entries): the region carries the raw `/.sage/state` slice
 * and React assembles the structure facts and reason sentences.
 */
export type CapabilityRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'read', readonly slot: { readonly slice?: Record<string, unknown> | null } }

export type ModelConfigRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'read', readonly slot: { readonly slice?: Record<string, unknown> | null } }

/**
 * The search card (P4 batch 25). It has no projection slice: results are the client-local outcome
 * of one explicit `/.sage/search` POST, so the region message is only a readiness fact and the
 * outcome travels back through `runSearch`.
 */
export type SearchRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'read' }

export type SessionRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'read', readonly slot: {
      readonly channel?: Record<string, unknown> | null,
      readonly history?: Record<string, unknown> | null,
      readonly anchors?: Record<string, unknown> | null,
      readonly edits?: Record<string, unknown> | null,
      readonly clarifications?: Record<string, unknown> | null,
      readonly approvals?: Record<string, unknown> | null,
      readonly planMode?: Record<string, unknown> | null,
      readonly selections?: Record<string, unknown> | null,
      readonly modelQueue?: Record<string, unknown> | null,
      readonly terminal?: Record<string, unknown> | null,
      readonly attachments?: Record<string, unknown> | null,
      readonly suggestions?: readonly string[] | null,
    } }

/** One option for the link card's two pickers (labels are built legacy-side, published as-is). */
export interface LinkOptionView {
  readonly value?: string
  readonly label?: string
}

export interface LinkRowView {
  readonly matterRef?: unknown
  readonly workspaceRef?: unknown
  readonly workspacePath?: unknown
  readonly isDefault?: unknown
}

export interface LinkTrailView {
  readonly linkId?: unknown
  readonly at?: unknown
  readonly action?: unknown
  readonly matterRef?: unknown
  readonly workspaceRef?: unknown
}

export type LinkRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'read', readonly slot: {
      readonly links?: readonly LinkRowView[],
      readonly trail?: readonly LinkTrailView[],
      readonly matters?: readonly LinkOptionView[],
      readonly workspaces?: readonly LinkOptionView[],
    } }

/** The matter-list entries both list cards render from; fields are read defensively. */
export interface MatterListView {
  readonly matterRef?: string
  readonly itemId?: string
  readonly title?: string
}

export interface MatterAdminBatchView {
  readonly operation?: string
  readonly rows?: readonly { readonly matterRef?: string, readonly outcome?: string, readonly code?: unknown }[]
  readonly okCount?: number
  readonly refusedCount?: number
}

export interface MatterRenameView {
  readonly requested?: unknown
  readonly effective?: unknown
}

export type MatterAdminRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'read', readonly slot: {
      readonly items?: readonly MatterListView[],
      readonly archived?: readonly string[],
      readonly batch?: MatterAdminBatchView | null,
      readonly rename?: MatterRenameView | null,
      readonly trail?: readonly { readonly action?: unknown, readonly matterRef?: unknown, readonly ground?: unknown, readonly at?: unknown }[],
    } }

export interface MatterGroupsBatchView {
  readonly operation?: string
  readonly rows?: readonly { readonly itemId?: string, readonly outcome?: string, readonly code?: unknown }[]
  readonly okCount?: number
  readonly unchangedCount?: number
  readonly refusedCount?: number
}

export interface MatterGroupView {
  readonly groupId?: string
  readonly name?: string
  readonly memberIds?: readonly string[]
}

export type MatterGroupsRegionMessage =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'read', readonly slot: {
      readonly items?: readonly MatterListView[],
      readonly groups?: readonly MatterGroupView[],
      readonly batch?: MatterGroupsBatchView | null,
      readonly rename?: MatterRenameView | null,
      readonly trail?: readonly { readonly action?: unknown, readonly groupId?: unknown, readonly name?: unknown, readonly count?: unknown, readonly at?: unknown }[],
    } }

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
  createPlan?: (title: string, stepsText: string) => Promise<string | null>
  acceptPlan?: (planId: string) => Promise<void>
  prepareStep?: (planId: string, stepNo: number) => Promise<PlanPrepareResult>
  executeStep?: (planId: string, stepNo: number, confirmationId: string) => Promise<PlanExecuteResult>
  addLink?: (matterRef: string, workspaceRef: string) => Promise<string | null>
  removeLink?: (matterRef: string, workspaceRef: string) => Promise<void>
  setDefaultLink?: (matterRef: string, workspaceRef: string) => Promise<void>
  archiveMatters?: (targets: readonly string[], ground: 'completed' | 'stopped') => Promise<string | null>
  restoreMatters?: (targets: readonly string[]) => Promise<string | null>
  renameMatter?: (targets: readonly string[], title: string) => Promise<string | null>
  createGroup?: (name: string, targets: readonly string[]) => Promise<string | null>
  renameGroup?: (groupId: string, name: string) => Promise<string | null>
  removeGroup?: (groupId: string) => Promise<string | null>
  assignGroupMembers?: (groupId: string, operation: 'add' | 'remove', targets: readonly string[]) => Promise<string | null>
  selectMatterContext?: (matterId: string, expectedContextGeneration: number) => Promise<MatterContextSelectResult>
  sendDraft?: (rawInput: string) => Promise<string | null>
  saveDraft?: (draftId: string, fields: { goal: string, deliverable: string, responsibility: string, projectRef: string }, clarification: string, selectedEntryIds: readonly string[]) => Promise<void>
  reconcileDraft?: (draftId: string) => Promise<void>
  cancelDraftAttempt?: (draftId: string) => Promise<void>
  prepareDraftConfirm?: (draftId: string) => Promise<{ readonly kind: 'prepared', readonly card: Record<string, unknown> } | { readonly kind: 'notice', readonly notice: string }>
  executeDraftConvert?: (draftId: string, confirmationId: string) => Promise<{ readonly kind: 'ok' } | { readonly kind: 'notice', readonly notice: string }>
  sendSession?: (text: string, mode: 'queue' | 'steer') => Promise<string | null>
  stopSession?: () => Promise<string | null>
  resumeSession?: () => Promise<string | null>
  pickAttachments?: () => Promise<string>
  uploadAttachment?: (itemId: string) => Promise<string | null>
  cancelAttachment?: (itemId: string) => Promise<void>
  editPendingItem?: (itemId: string, text: string) => Promise<void>
  removePendingItem?: (itemId: string) => Promise<void>
  editQueueItem?: (itemId: string, text: string) => Promise<string | null>
  removeQueueItem?: (itemId: string) => Promise<string | null>
  readHistory?: (beforeSeq?: number) => Promise<string | null>
  readHistoryDetail?: (runSeq: number) => Promise<void>
  readAnchors?: () => Promise<string | null>
  locateAnchor?: (runSeq: number) => Promise<{ readonly kind: 'located', readonly runSeq: number, readonly previewText: string, readonly notice: string } | { readonly kind: 'notice', readonly notice: string }>
  saveEdit?: (messageRef: string, text: string) => Promise<string | null>
  resendEdit?: (editId: string) => Promise<string | null>
  verifyEdit?: (editId: string) => Promise<string | null>
  selectInputRef?: (kind: 'skill' | 'plugin', ref: string) => Promise<string | null>
  clearInputRef?: (kind: 'skill' | 'plugin', ref: string) => Promise<void>
  submitClarification?: (requestId: string, answers: readonly { readonly questionId: string, readonly selected: readonly string[], readonly custom?: string }[]) => Promise<string | null>
  verifyClarification?: () => Promise<void>
  answerApproval?: (requestId: string, outcome: 'allowed-once' | 'rejected') => Promise<string | null>
  withdrawApproval?: (requestId: string) => Promise<string | null>
  verifyApproval?: () => Promise<void>
  verifyModelQueue?: () => Promise<string>
  replyRetry?: () => Promise<string | null>
  auditReply?: () => Promise<string>
  setPlanMode?: (active: boolean) => Promise<string | null>
  openTerminal?: (terminalId: string) => Promise<SessionTerminalReadResult>
  runSearch?: (query: string) => Promise<{ readonly kind: 'read', readonly outcome: Record<string, unknown> } | { readonly kind: 'notice', readonly notice: string }>
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
    /** React link card -> legacy script (batch 20): the picker selection every wire action reads. */
    __SAGE_APP_SET_LINK_SELECTION__?: (matterRef: string, workspaceRef: string) => void
    /** React matter list -> legacy script (batch 22): the filter mirror behind the sidebar count. */
    __SAGE_APP_SET_MATTER_LIST_FILTER__?: (showAll: boolean) => void
    /** React draft card -> legacy script (batch 23): the field mirror behind the exit-check unsaved chain. */
    __SAGE_APP_SET_DRAFT_FIELDS__?: (fields: { goal: string, deliverable: string, responsibility: string, projectRef: string, clarification: string }) => void
  }
}
