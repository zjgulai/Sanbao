/** WT-02D.0.1 contracts: the main-owned /.sage/* service surface. */
import type { SageViewState } from '../product/contracts.js'
import type { SageMatterViewState } from '../product/view-state.js'
import type { SageActionIntentV2, SageDispatchIntent } from './command-contracts.js'
import type { ActionConfirmationCard } from './action-confirmations.js'
import type {
  ProjectionReadAdmissionResult,
  ProjectionReadIntent,
  ProjectionReadScope,
} from './projection-read-admission.js'

export interface CallerBinding {
  readonly correlation: string
}

/** CTX-01B: the only active-context facts that may leave Electron main. Actor identity, login
 * session and trusted workspace root are deliberately absent. */
export type ActiveMatterContextStatus =
  | { readonly state: 'unavailable'; readonly contextGeneration: null }
  | { readonly state: 'inactive'; readonly contextGeneration: number }
  | {
      readonly state: 'active'
      readonly contextGeneration: number
      readonly matterId: string
      readonly revisionId: string
      readonly workspaceRef: string
      readonly frameGeneration: number
    }

export interface ActiveMatterSelectionRequest {
  /** Candidate only. Electron main independently resolves revision, access, environment and session. */
  readonly matterId: string
  /** Optimistic CAS token from the latest state projection; it is not authority. */
  readonly expectedContextGeneration: number
}

export type ActiveMatterSelectionOutcome =
  | { readonly state: 'selected'; readonly context: Extract<ActiveMatterContextStatus, { readonly state: 'active' }> }
  | {
      readonly state: 'refused'
      readonly code: 'active-context-unavailable' | 'active-context-denied' | 'active-context-stale'
      readonly retryable: boolean
    }

export type ServiceUnavailableReason = 'identity-unavailable' | 'authenticated'

/**
 * Ticket 001 (US-117~121): one command result, classified once by main so the surface can pick an
 * entry. `not-ready` is deliberately its own state: a readiness denial is not a failure and must not
 * offer 重试 even when the pipeline marks the code retryable.
 */
export type ServiceCommandOutcome = 'not-ready' | 'unknown' | 'failed' | 'settled'

export interface ServiceCommandStatus {
  readonly correlation: string
  readonly outcome: ServiceCommandOutcome
  /** Machine code only; readable wording is the surface's own table, so no path or secret can ride along. */
  readonly code: string | null
  readonly retryable: boolean
}

export interface AuthStatus {
  readonly status: 'signed-in' | 'signed-out' | 'pending'
  readonly displayName: string | null
}

/** Ticket 030 (US-155~158): capability facts classified once by main so the surface cannot merge
 *  "declared", "live-effective" and "available" into one word.
 *  An entry is `enabled` only when the live roster row carries no failure; a failed row stays
 *  `configured-not-enabled` and the base's own free text is dropped here — the surface gets a code. */
export interface CapabilityEntry {
  readonly id: string
  readonly state: 'enabled' | 'configured-not-enabled'
  readonly reason: 'preset-failed-to-activate' | null
}

export interface CapabilityStatus {
  /** Where the rows came from; the surface prints this label instead of implying a market API. */
  readonly source: 'runtime-effective'
  /** false ⇒ the roster could not be verified: the surface must say 未核验 with this reason. */
  readonly observed: boolean
  readonly reason: 'observation-not-read' | 'registry-service-absent' | 'invalid-roster' | 'observation-failed' | null
  readonly agentPresets: readonly CapabilityEntry[]
  /** External capability / market surface has no provider yet: not wired, never "disabled". */
  readonly external: { readonly state: 'not-wired'; readonly reason: 'capability-registry-unavailable' }
}

/** Ticket 017 (US-043/044/047): the model-config view. Structure and state only — never a value,
 *  never a secret, and never a secret's key path. `saved` and `connectivityTest` are deliberately
 *  two fields: saving a config never proves the provider answers. */
export interface ModelConfigNamespace {
  readonly ns: string
  readonly revision: number
  /** `live` needs no restart; `restart` does — the surface words these differently. */
  readonly applies: 'live' | 'restart'
  readonly saved: 'user' | 'base-only' | 'none'
  readonly secrets: { readonly set: number; readonly total: number }
}

export interface ModelConfigStatus {
  readonly source: 'settings-describe'
  readonly state: 'read' | 'unavailable'
  readonly reason: 'bridge-unavailable' | 'bridge-refused' | 'not-plain-data' | 'not-read' | null
  readonly writable: boolean | null
  readonly hasDocument: boolean | null
  readonly namespaces: readonly ModelConfigNamespace[]
  readonly connectivityTest: 'untested'
}

export interface ServiceStatus {
  readonly status: 'unavailable'
  readonly reason: ServiceUnavailableReason
  readonly auth: AuthStatus
  readonly correlation: string
  /** The last command this main-owned service ran for the caller, or null when nothing has been dispatched. */
  readonly command: ServiceCommandStatus | null
}

/** Ticket 010: the outcome of one adopt attempt. `cancelled` is a fact (the user closed the
 *  picker); nothing was created and nothing may be recorded for it. */
export type WorkspaceAdoptOutcome =
  | { readonly state: 'adopted'; readonly workspaceId: string; readonly path: string; readonly title: string }
  | { readonly state: 'cancelled' }
  | { readonly state: 'refused'; readonly code: string }

/** Ticket 012: the workspace list as folded from the base's `workspace/follow` stream. */
export interface WorkspaceListStatus {
  readonly source: 'workspace-follow'
  readonly state: 'read' | 'unavailable'
  readonly reason: 'not-read' | 'bridge-host-not-ready' | 'bridge-provider-unavailable' | 'bridge-provider-failed'
    | 'bridge-result-not-plain-data' | 'bridge-stream-overflow' | 'bridge-stream-closed' | 'bridge-answer-unrecognised' | null
  readonly entries: readonly { readonly workspaceId: string, readonly path: string, readonly title: string, readonly sessionCount: number, readonly createdAt: string, readonly updatedAt: string }[]
  readonly order: readonly string[]
  readonly archivedSessions: number
  /** Frames delivered by the last subscription, and how many of them did not parse. */
  readonly frames: number
  readonly unapplied: number
}

/** Ticket 012 (write half): the one mutation request the surface may ask main to run. */
export type WorkspaceMutationRequest =
  | { readonly kind: 'rename', readonly workspaceId: string, readonly title: string }
  | { readonly kind: 'delete', readonly workspaceId: string }
  | { readonly kind: 'reorder', readonly workspaceId: string, readonly beforeWorkspaceId: string | null }

/**
 * Ticket 012 (write half): the outcome of one mutation.
 * A settled delete means the *registration* is gone: the base keeps the directory and its logs,
 * and nothing here may read as "directory content removed" (US-064).
 */
export type WorkspaceMutationOutcome =
  | { readonly state: 'settled', readonly kind: 'rename', readonly workspaceId: string, readonly title: string }
  | { readonly state: 'settled', readonly kind: 'delete', readonly workspaceId: string }
  | { readonly state: 'settled', readonly kind: 'reorder', readonly order: readonly string[] }
  | { readonly state: 'refused', readonly kind: 'rename' | 'delete' | 'reorder', readonly code: string }

/** Ticket 013: one file candidate, workspace-relative — the only shape a reference may name. */
export interface FileCandidate {
  readonly name: string
  readonly path: string
  readonly bytes?: number
}

export interface FileCandidateStatus {
  readonly state: 'read' | 'refused'
  readonly code: string | null
  readonly entries: readonly FileCandidate[]
  readonly truncated: boolean
  readonly path: string
}

/** One reference record: the source plus the version token it was created at (US-077~082). */
export interface FileReferenceRecord {
  readonly referenceId: string
  readonly workspaceRoot: string
  readonly path: string
  readonly absolutePath: string
  /** Opaque freshness token as of creation; compared, never parsed, never rewritten by a later change. */
  readonly version: string
  readonly bytes?: number
  readonly createdAt: string
  readonly lastUse: 'unused' | 'live' | 'stale'
}

export type FileReferenceOutcome =
  | { readonly state: 'created', readonly code: null, readonly reference: FileReferenceRecord }
  | { readonly state: 'refused', readonly code: string, readonly reference: null }

export type FileReferenceUse =
  | { readonly state: 'live', readonly code: null, readonly reference: FileReferenceRecord, readonly text: string | null }
  | { readonly state: 'stale', readonly code: string, readonly reference: FileReferenceRecord, readonly text: null }
  | { readonly state: 'unknown', readonly code: string, readonly reference: null, readonly text: null }

/** Ticket 027 (US-140~145): one matter edit draft bound to the source version it was generated
 *  from. The view is controlled information only — the workspace root, the snapshot bytes and the
 *  proposed bytes stay in main; a draft existing never means the shared file changed. */
export interface EditDraftView {
  readonly draftId: string
  readonly matterRef: string
  /** Workspace-relative path and display name; the machine absolute path never crosses this view. */
  readonly path: string
  readonly name: string
  /** The user's working copy (freshly generated: equal to the source at the based version). The
   *  source snapshot itself stays in main — a later source change never leaks through here. */
  readonly proposedText: string
  /** The source version this draft was generated from — a later source change never rewrites it. */
  readonly basedVersion: string
  /** Controlled provenance: a file observation, never a raw tool payload. */
  readonly generatedBy: 'file-observation'
  readonly createdAt: string
  readonly updatedAt: string
  readonly sourceCharacters: number
  readonly proposedCharacters: number
  /** Freshness of the live source against `basedVersion`, as of the last check. */
  readonly sourceState: 'unchecked' | 'unchanged' | 'changed' | 'not-readable'
  readonly writeback: EditDraftWritebackState
}

/** Ticket 027 (US-143): the writeback is a named action; its confirmation binds this draft and
 *  the exact versions it was prepared against, and its outcome never reads "written" early. */
export type EditDraftWritebackState =
  | { readonly state: 'none' }
  | {
    readonly state: 'prepared'
    readonly confirmationId: string
    readonly preparedAt: string
    readonly targetVersion: string
    readonly currentVersion: string | null
    readonly impact: EditDraftImpact
  }
  | { readonly state: 'not-ready', readonly code: 'writeback-unavailable' }
  | { readonly state: 'refused', readonly code: string }
  | { readonly state: 'unknown', readonly code: string }
  | { readonly state: 'written', readonly receiptRef: string }

/** Ticket 027/US-143: what a confirmed writeback would change — line counts, no content. */
export interface EditDraftImpact {
  readonly addedLines: number
  readonly removedLines: number
  readonly proposedCharacters: number
}

export interface EditDraftStatus {
  readonly state: 'read' | 'unavailable'
  readonly drafts: readonly EditDraftView[]
}

export type EditDraftCreateOutcome =
  | { readonly state: 'created', readonly draft: EditDraftView }
  | { readonly state: 'refused', readonly code: string }

export type EditDraftUpdateOutcome =
  | { readonly state: 'updated', readonly draft: EditDraftView }
  | { readonly state: 'refused', readonly code: string }

/** One line of the version-bound diff; bounded, so a huge file cannot flood the surface. */
export interface EditDraftDiffLine {
  readonly kind: 'context' | 'add' | 'remove'
  readonly text: string
}

/** Ticket 027/US-141: the diff between the draft and the version it was based on — computed by
 *  Sage from content, never by Git, and always labelled with the versions it compared. */
export interface EditDraftDiff {
  readonly draftId: string
  readonly basedVersion: string
  readonly currentVersion: string | null
  readonly sourceChanged: boolean
  readonly addedLines: number
  readonly removedLines: number
  readonly lines: readonly EditDraftDiffLine[]
  readonly truncated: boolean
}

export type EditDraftDiffOutcome =
  | { readonly state: 'read', readonly diff: EditDraftDiff }
  | { readonly state: 'refused', readonly code: string }

/** US-143: the single pre-execution card (FW-023 shape) plus the impact preview beside it. */
export interface EditDraftWritebackCard {
  readonly confirmationId: string
  readonly preparedAt: string
  readonly target: { readonly matterRef: string, readonly draftId: string, readonly path: string }
  readonly action: 'writeback-source-file'
  readonly targetVersion: string
  readonly currentVersion: string | null
  readonly impact: EditDraftImpact
  readonly costEstimate: { readonly state: 'unavailable', readonly note: 'estimate-unavailable' }
  readonly effect: 'not-yet-happened'
}

export type EditDraftPrepareWritebackOutcome =
  | { readonly state: 'prepared', readonly draftId: string, readonly card: EditDraftWritebackCard }
  | { readonly state: 'refused', readonly draftId: string, readonly code: string }

export type EditDraftWritebackOutcome =
  | { readonly state: 'written', readonly draftId: string, readonly receiptRef: string }
  | { readonly state: 'not-ready', readonly draftId: string, readonly code: 'writeback-unavailable' }
  | { readonly state: 'refused', readonly draftId: string, readonly code: string }
  | { readonly state: 'unknown', readonly draftId: string, readonly code: string }

/** Ticket 028 (US-146~149): one execution record of a Sage-owned action item. The basis is frozen
 *  when the record opens — a later item edit never rewrites what this run was registered against. */
export interface ActionExecutionRecord {
  readonly recordNo: number
  readonly at: string
  readonly basis: { readonly revision: number, readonly title: string, readonly note: string }
}

/** Ticket 028 (US-146): an action item is work under a matter — never a delivery item, a pending
 *  request, a tool call or a run. `done` is a state change, not delivery acceptance. */
export interface ActionItemView {
  readonly actionId: string
  readonly matterRef: string
  readonly title: string
  readonly note: string
  readonly state: 'open' | 'in-progress' | 'done'
  /** Bumped by explicit edits only; records keep the revision they were registered against. */
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly records: readonly ActionExecutionRecord[]
}

/** Ticket 028 (US-148, D-057): a supplementary correction linked to the original requirement.
 *  The receipt states are read from real evidence: the send's own acknowledgement, the base
 *  queue's item state (still queued = 待应用), and its consumption reading (已生效). Receiving is
 *  never rewritten as effective, and the original message is never touched or replayed. */
export type CorrectionReceipt =
  /** 受理回执（requestId）——已接收≠已生效（D-012）。 */
  | { readonly state: 'received', readonly requestId: string }
  /** 待应用：仍在待继续/队列里，等一次安全派发（D-012 的等待位置）。 */
  | { readonly state: 'pending-application', readonly reason: 'deferred' | 'queued' | 'unobserved' }
  /** 已生效：基座队列已取走该次出现（消费读数）——不撤销既有外部效果、不重放旧动作。 */
  | { readonly state: 'effective' }
  | { readonly state: 'refused', readonly code: string }

export interface CorrectionView {
  readonly correctionId: string
  readonly matterRef: string
  /** 原要求（关联的已发送消息）——原样保留，更正绝不覆盖它。 */
  readonly original: { readonly text: string, readonly at: string | null }
  readonly text: string
  readonly submittedAt: string
  readonly receipt: CorrectionReceipt
}

export interface ActionItemsStatus {
  readonly state: 'read' | 'unavailable'
  readonly items: readonly ActionItemView[]
  readonly corrections: readonly CorrectionView[]
}

export type ActionItemOutcome =
  | { readonly state: 'ok', readonly item: ActionItemView }
  | { readonly state: 'refused', readonly code: string }

export type CorrectionOutcome =
  | { readonly state: 'created', readonly correction: CorrectionView }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 028 (US-149, D-089): a project is a pure grouping record — membership is an
 *  organizational edge, never a copy of the matter, and it changes nothing but itself. */
export interface MatterProjectView {
  readonly projectRef: string
  readonly name: string
  readonly createdAt: string
  /** The same matter records, referenced by ref — never copies of matter facts. */
  readonly matterRefs: readonly string[]
}

/** D-089: assignment changes keep their trail and the basis they were made against. */
export interface MatterProjectTrailRecord {
  readonly at: string
  readonly action: 'assign' | 'unassign' | 'move'
  readonly matterRef: string
  readonly fromProjectRef: string | null
  readonly toProjectRef: string | null
}

export interface ProjectsStatus {
  readonly state: 'read' | 'unavailable'
  readonly projects: readonly MatterProjectView[]
  readonly trail: readonly MatterProjectTrailRecord[]
}

export type ProjectOutcome =
  | { readonly state: 'ok', readonly projects: ProjectsStatus }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 032 (US-165~167/170/171): the Sage-owned plan as a deliverable, its step readiness,
 *  and the read-only guide/environment facts. Accepting a plan is its own fact — it never
 *  dispatches; a step runs only through its own confirmation card, and a step whose premises are
 *  not readable is BLOCKED (unknown is a block, never a failure and never a quiet pass). */
export interface PlanStepView {
  readonly stepNo: number
  readonly title: string
  /** ready → its card may be prepared; not-ready / unknown → blocked, nothing is dispatched. */
  readonly readiness: 'ready' | 'not-ready' | 'unknown'
  readonly readinessNote: string
}

export interface PlanView {
  readonly planId: string
  readonly matterRef: string
  readonly title: string
  readonly steps: readonly PlanStepView[]
  readonly state: 'draft' | 'accepted'
  /** Set only by the explicit accept act; acceptance dispatches nothing and approves no action. */
  readonly acceptedAt: string | null
  readonly createdAt: string
}

export type PlanStepOutcome =
  | { readonly state: 'prepared', readonly planId: string, readonly stepNo: number, readonly card: ActionConfirmationCard }
  | { readonly state: 'refused', readonly planId: string, readonly stepNo: number, readonly code: string }

export interface PlanStepRunView {
  readonly planId: string
  readonly stepNo: number
  readonly state: 'settled' | 'not-ready' | 'refused' | 'unknown'
  readonly code: string | null
  readonly at: string
}

export interface PlansStatus {
  readonly state: 'read' | 'unavailable'
  readonly plans: readonly PlanView[]
  /** The most recent step dispatch attempt, so the surface reads its state from the projection. */
  readonly lastStepRun: PlanStepRunView | null
}

export type PlanOutcome =
  | { readonly state: 'ok', readonly plans: PlansStatus, readonly planId: string }
  | { readonly state: 'refused', readonly code: string }

export type PlanStepExecuteOutcome =
  | { readonly state: 'settled', readonly plans: PlansStatus, readonly receiptRef: string }
  | { readonly state: 'not-ready', readonly plans: PlansStatus, readonly code: string }
  | { readonly state: 'refused', readonly plans: PlansStatus, readonly code: string }
  | { readonly state: 'unknown', readonly plans: PlansStatus, readonly code: string }

/** Ticket 031 (US-159~164): the per-matter run monitor. Four axes, each its own fact — there is
 *  deliberately NO synthesized "run status" anywhere in this shape. The steps axis reads the same
 *  session-channel projection the conversation card reads; budget/device/background have no
 *  provider in this release and say so per axis (never one merged unknown, and a missing number
 *  is `unknown` — never zero). */
export interface RunMonitorView {
  readonly state: 'read' | 'unavailable'
  readonly matterRef: string | null
  /** 步骤：the same open-turn evidence the session channel publishes (executing | idle). */
  readonly steps: {
    readonly state: 'running' | 'idle' | 'unavailable'
    readonly lastTurnEnd: string | null
    readonly observedRecords: number
    readonly reason: string | null
  }
  /** 预算／用量三态：预留、消耗、最终账单分开；缺少可核验来源时为 unknown，不以零代替。 */
  readonly budget: {
    readonly reserved: { readonly state: 'unknown', readonly reason: 'usage-provider-unavailable' }
    readonly consumed: { readonly state: 'unknown', readonly reason: 'usage-provider-unavailable' }
    readonly billed: { readonly state: 'unknown', readonly reason: 'usage-provider-unavailable' }
  }
  /** 设备：离线不等于运行取消、也不等于被其他设备接管（US-161）；本版无绑定读数。 */
  readonly device: { readonly state: 'unknown', readonly reason: 'device-binding-unavailable' }
  /** 后台：执行主体在 Host 侧；面板开合是本地视图状态，不影响运行（US-160）。 */
  readonly background: { readonly state: 'unknown', readonly reason: 'background-host-unavailable' }
  /** 上下文用量与压缩：本版无读数、无压缩触发入口；压缩不得泄漏私有侧聊或扩大外传（US-163）。 */
  readonly context: { readonly state: 'unknown', readonly reason: 'context-usage-unavailable', readonly compaction: 'unknown' }
}

/** Ticket 031 (US-164, S5): one bounded, cursor-based, read-only page of a workspace run log. */
export interface RunLogLine {
  readonly no: number
  /** The line as read; a line beyond the length cap is cut and marked, never silently shortened. */
  readonly text: string
}

export type RunLogOutcome =
  | {
    readonly state: 'read'
    readonly path: string
    /** The file's version at this read; the caller passes it back to continue or to detect rotation. */
    readonly version: string
    readonly fromLine: number
    readonly nextLine: number
    readonly lines: readonly RunLogLine[]
    readonly eof: boolean
    readonly truncatedLines: number
    /** Set when the caller's expected version no longer matches: the cursor is void, restart from 1. */
    readonly rotation: 'file-rotated' | null
  }
  /** Refusals carry the bridge's own code (`bridge-file-not-found` …) or the reader's own. */
  | { readonly state: 'refused', readonly code: string }

/** Ticket 029 (FW-030, US-150~154): the Sage-owned matter administration — recoverable archive,
 *  service-adjudicated rename, per-target batch. Archive retires a matter from the active list
 *  only: it never stops a run, never releases an open responsibility and never widens a read
 *  scope; the truly-destructive delete stays a separate governed flow (no entry here). */
export interface MatterArchiveEntry {
  readonly matterRef: string
  readonly archivedAt: string
  /** The declared ground the archive was accepted on; completion is declared, not verified here. */
  readonly ground: 'completed' | 'stopped'
}

export interface MatterAdminTrailRecord {
  readonly at: string
  readonly action: 'archive' | 'restore'
  readonly matterRef: string
  readonly ground: 'completed' | 'stopped' | null
}

/** The service-adjudicated rename: `effective` is the READ-BACK value, never the request. */
export interface MatterRenameView {
  readonly matterRef: string
  readonly requested: string
  readonly effective: string
  readonly at: string
}

/** One batch target's own verdict — every target gets a row; nothing is skipped silently. */
export interface MatterBatchRow {
  readonly matterRef: string
  readonly outcome: 'ok' | 'refused'
  readonly code: string | null
}

export interface MatterBatchView {
  readonly operation: 'archive' | 'restore'
  readonly rows: readonly MatterBatchRow[]
  readonly okCount: number
  readonly refusedCount: number
}

export interface MatterAdminStatus {
  readonly state: 'read' | 'unavailable'
  readonly entries: readonly MatterArchiveEntry[]
  readonly trail: readonly MatterAdminTrailRecord[]
  /** The most recent rename outcome (its `effective` is the read-back value). */
  readonly rename: MatterRenameView | null
  /** The most recent batch, row by row — an all-ok batch is still just rows, never a banner. */
  readonly batch: MatterBatchView | null
}

export type MatterAdminOutcome =
  | { readonly state: 'ok', readonly status: MatterAdminStatus }
  | { readonly state: 'refused', readonly code: string }

export type MatterRenameResult =
  | { readonly state: 'renamed', readonly status: MatterAdminStatus }
  | { readonly state: 'refused', readonly code: string }

export type MatterBatchResult =
  | { readonly state: 'batch', readonly status: MatterAdminStatus }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 049 (FW-041, US-225/226): a Sage-owned task group. Organization ONLY — create /
 *  rename / remove are named commands with their own receipts and read-backs; membership never
 *  touches a matter's facts, visible scope, responsibility or permissions. */
export interface MatterGroupEntry {
  readonly groupId: string
  readonly name: string
  readonly memberIds: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface MatterGroupTrailRecord {
  readonly at: string
  readonly action: 'create' | 'rename' | 'remove' | 'add-members' | 'remove-members'
  readonly groupId: string
  readonly name: string
  /** Members changed by this action (0 for rename; member count for create). */
  readonly count: number
}

/** One member target's own verdict — never a single “overall success” (US-225). */
export interface MatterGroupMemberRow {
  readonly itemId: string
  readonly outcome: 'ok' | 'unchanged' | 'refused'
  readonly code: 'already-member' | 'not-member' | 'item-unknown' | null
}

export interface MatterGroupBatchView {
  readonly operation: 'add' | 'remove'
  readonly groupId: string
  readonly rows: readonly MatterGroupMemberRow[]
  readonly okCount: number
  readonly unchangedCount: number
  readonly refusedCount: number
}

/** The rename's read-back: `effective` is the stored value, never the request string. */
export interface MatterGroupRenameView {
  readonly groupId: string
  readonly requested: string
  readonly effective: string
  readonly at: string
}

export interface MatterGroupsStatus {
  readonly state: 'read' | 'unavailable'
  readonly code: string | null
  readonly groups: readonly MatterGroupEntry[]
  readonly trail: readonly MatterGroupTrailRecord[]
  /** The most recent rename outcome (its `effective` is the read-back value). */
  readonly rename: MatterGroupRenameView | null
  /** The most recent membership batch, row by row — an all-ok batch is still just rows. */
  readonly batch: MatterGroupBatchView | null
}

/** Each named command answers with its own receipt state; nothing is created implicitly. */
export type MatterGroupsOutcome =
  | { readonly state: 'created', readonly status: MatterGroupsStatus }
  | { readonly state: 'renamed', readonly status: MatterGroupsStatus }
  | { readonly state: 'removed', readonly status: MatterGroupsStatus }
  | { readonly state: 'batch', readonly status: MatterGroupsStatus }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 026 (US-129/130): the visible-scope facts. Only what was read; absence keeps its note. */
export interface ReadoutVisibility {
  readonly organizationRef: string | null
  readonly organizationNote: 'read' | 'policy-unreadable'
  readonly responsiblePartyRoleRef: string | null
  readonly matterNote: 'read' | 'projection-absent'
}

/** Ticket 026 (US-134~136): one installed runtime component, as the inventory attests it. */
export interface ReadoutComponent {
  readonly identity: string
  readonly version: string
  readonly artifactDigestShort: string
}

/**
 * Ticket 026 (US-134~136): installation evidence rows plus the single boot observation.
 * `mounted` is deliberately absent: installation attestation proves bytes at activation time,
 * not a live mount, and the surface must not read one as the other (ADR-0167/0168).
 */
export interface ReadoutPlugins {
  readonly state: 'read' | 'unavailable'
  readonly code: string | null
  readonly components: readonly ReadoutComponent[]
  readonly observation: {
    readonly loaderPhase: 'active' | null
    readonly runtimeGeneration: number | null
    readonly bootIdShort: string | null
  }
}

/** Ticket 026 (US-137~139): version identity from a verifiable source, plus the data root. */
export interface ReadoutDiagnostics {
  readonly harnessVersion: string | null
  readonly protocolVersion: string | null
  readonly profileGeneration: string | null
  readonly manifestSha256Short: string | null
  /** True only for an accepted boot: the ready event matched the pinned manifest. */
  readonly manifestVerified: boolean
  readonly dataRoot: string
  readonly lastError: { readonly code: string, readonly correlation: string } | null
}

/** Ticket 026 (US-131/132): the knowledge family has no provider; its references half is the
 *  ticket-013 slot. An unwired store is said to be unwired — never "published" or "retired". */
export interface ReadoutKnowledge {
  readonly state: 'not-wired'
  readonly reason: 'knowledge-store-unavailable'
}

/** Ticket 002 (US-007/009/010): one draft as the surface sees it. `complete` is computed here so
 *  the confirm entry has exactly one source of truth. */
export interface DraftView {
  readonly draftId: string
  readonly fields: { readonly goal: string, readonly deliverable: string, readonly responsibility: string, readonly projectRef: string }
  readonly clarification: string
  readonly history: readonly { readonly entryId: string, readonly text: string, readonly selected: boolean }[]
  readonly status: 'editing' | 'converted'
  /** Set only from a custody receipt (ADR-0201); never a locally minted id. */
  readonly matterRef: string | null
  /** Ticket 003: the open creation attempt, when one exists (pending / unknown / failed). */
  readonly attempt: { readonly correlation: string, readonly at: string, readonly state: 'pending' | 'unknown' | 'failed' } | null
  readonly complete: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * Ticket 046 (US-209~219): one leaf settings page. `writeEntry` is deliberately always null in
 * this release: the read-only family has no write port at all, and the field exists so a future
 * enable/import/connect entry cannot appear without changing this contract (and its assertions).
 */
export interface SettingsLeaf {
  readonly leafId: string
  readonly title: string
  readonly state: 'read' | 'unavailable'
  /** Where the fact comes from: an observation, a configuration fact, or no provider. */
  readonly source: string
  readonly note: string
  readonly writeEntry: null
}

/** Ticket 020/047 (US-107/220): the eight persistable display preferences. */
export interface DisplayPreferenceValues {
  readonly theme: 'light' | 'dark' | 'system'
  readonly language: 'zh' | 'en'
  readonly density: 'comfortable' | 'compact'
  readonly fontStyle: 'sans' | 'serif'
  readonly contentWidth: 'standard' | 'wide'
  readonly terminalTheme: 'follow' | 'manual'
  readonly fileIcons: 'product' | 'material'
  readonly iconAppearance: 'system' | 'light' | 'dark'
}

/** The one defaults literal: the store and the unavailable-first fallback both read it. */
export const DEFAULT_DISPLAY_PREFERENCE_VALUES: DisplayPreferenceValues = {
  theme: 'system',
  language: 'zh',
  density: 'comfortable',
  fontStyle: 'sans',
  contentWidth: 'standard',
  terminalTheme: 'follow',
  fileIcons: 'product',
  iconAppearance: 'system',
}

/** Ticket 020 (US-107~113): the display preferences, one authoritative device value. */
export interface PreferencesStatus {
  readonly requested: DisplayPreferenceValues
  /** null until the first confirmed save — "已保存" never stands in for this. */
  readonly savedAt: string | null
  /** The theme in effect; null when `system` was requested but main has no observation yet. */
  readonly effectiveTheme: 'light' | 'dark' | null
  readonly systemDark: boolean | null
  readonly applies: 'live' | 'restart'
}

export type PreferencesSaveOutcome =
  | { readonly state: 'saved', readonly preferences: PreferencesStatus }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 005 (US-012/013): one transcript entry. `echo` rows are this device's own accepted
 *  prompts; `history` rows are folded from the durable log — never from a live frame.
 *  Ticket 014: attachment-bearing messages carry the durable file references they were sent with. */
export interface SessionChannelEntry {
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly source: 'echo' | 'history'
  readonly at: string | null
  /** The durable file references of this message; empty for text-only rows. */
  readonly attachments: readonly { readonly attachmentId: string, readonly name: string, readonly bytes: number }[]
  /** Ticket 036: the message's request identity (the base's `user/message.source.rpcId`) —
   *  present only when the log actually carries it; this is what an edit references. */
  readonly messageRef?: string
}

/** Ticket 037 (US-188): the reply's verified-action list, derived from the projection.
 *  `copy`/`quote` ride the reply text itself; `retry` appears ONLY on a determinate failure
 *  (`turn/end.reason.kind === 'error'`); an unknown outcome offers verification, never retry. */
export type SessionReplyAction = 'copy' | 'quote' | 'retry'

export interface SessionReplyView {
  readonly text: string | null
  /** The last turn's end kind, as the base's `turn/end.reason` object reports it. */
  readonly endKind: string | null
  readonly failed: boolean
  readonly actions: readonly SessionReplyAction[]
}

export interface SessionChannelStatus {
  /** `no-session` says nothing was ever sent for this matter; reading never creates one. */
  readonly state: 'read' | 'no-session' | 'unavailable'
  readonly sessionId: string | null
  /** Ticket 037: the last reply's action facts (see `SessionReplyView`). */
  readonly reply: SessionReplyView
  /** `executing` requires an open `turn/start` in the log — the ack alone never sets it. */
  readonly execution: 'idle' | 'executing'
  readonly lastTurnEnd: string | null
  readonly transcript: readonly SessionChannelEntry[]
  /** true when the final text was (re)read from history — the post-break reconciliation. */
  readonly reconciled: boolean
  readonly streamBroken: boolean
  readonly code: string | null
  readonly records: number
  readonly unapplied: number
  /** Ticket 006: paused says new inputs are kept as 待继续 instead of being dispatched. */
  readonly paused: boolean
  readonly pending: readonly {
    readonly itemId: string
    readonly text: string
    readonly state: 'pending' | 'dispatching' | 'submitted' | 'consumed'
    readonly note: 'drained-at-stop' | 'consumed-by-race' | null
    readonly editable: boolean
  }[]
  /** Ticket 008 (US-028): the still-pending occurrences straight from the authoritative queue
   *  snapshot — never derived from local echoes. `position` mirrors the base's placement. */
  readonly queue: {
    readonly state: 'read' | 'unavailable'
    readonly occurrences: readonly {
      readonly queueItemId: string
      readonly position: 'queued' | 'steering' | 'context'
      readonly requestId: string | null
      readonly preview: string
    }[]
  }
}

export type SessionSendOutcome =
  | { readonly state: 'accepted', readonly sessionId: string, readonly requestId: string, readonly mode: 'queue' | 'steer' }
  /** Ticket 006: paused — the text is kept as a 待继续 item and never reached the inbox. */
  | { readonly state: 'deferred', readonly itemId: string }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 008 (US-027): one queue-item mutation. `queue-item-not-found` is the consumption race's
 *  honest name — the item left the queue because the base started processing it. */
export type QueueItemOutcome = { readonly state: 'ok' } | { readonly state: 'refused', readonly code: string }

/** Ticket 009 (US-097~100): one historic run as the durable log reports it. The actual model is
 *  that run's own request-header snapshot — null when the run recorded none, never today's value. */
export interface SessionHistoryRunView {
  readonly runSeq: number
  readonly turn: number | null
  readonly provider: string | null
  readonly model: string | null
  readonly endSeq: number | null
  readonly endReason: string | null
  readonly messages: number
}

export type SessionRunListOutcome =
  | { readonly state: 'read', readonly runs: readonly SessionHistoryRunView[], readonly hasMore: boolean, readonly nextBeforeSeq: number | null }
  | { readonly state: 'no-session' }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 034/US-180: one clarification found in a run's durable log — the question with the
 *  answer the run actually recorded (or `answered:false` when the ask never settled). Read-only
 *  history: the surface may only look, never re-submit. */
export interface RunClarificationView {
  readonly question: string
  readonly selected: readonly string[]
  readonly custom: string | null
  readonly answered: boolean
}

export type SessionRunDetailOutcome =
  | {
      readonly state: 'read'
      readonly runSeq: number
      readonly provider: string | null
      readonly model: string | null
      readonly endSeq: number | null
      readonly endReason: string | null
      readonly outputPreview: string | null
      readonly outputTruncated: boolean
      readonly userTexts: readonly string[]
      /** Ticket 034: the run's clarifications, parsed from `tool/call`/`tool/result` events. */
      readonly clarifications: readonly RunClarificationView[]
    }
  /** US-100: an unreadable run stays missing — never a blank success. */
  | { readonly state: 'missing', readonly runSeq: number, readonly code: string }
  | { readonly state: 'no-session' }

/** Ticket 009: the last history read for the current matter (empty runs means never read — not
 *  "no runs" — so the surface must not present the empty list as a capability). */
export interface SessionHistoryStatus {
  readonly state: 'read' | 'unavailable'
  readonly runs: readonly SessionHistoryRunView[]
  readonly hasMore: boolean
  readonly nextBeforeSeq: number | null
  readonly detail: SessionRunDetailOutcome | null
  readonly at: string | null
}

/** Ticket 034 (US-177~182): the clarification card family.
 *  The pending list is exactly the live relay registry (a question exists while its waterfall
 *  blocks); `run` binds the card to the run that raised it; receipts are the submission's
 *  three-plus-one states — `aborted` exists for US-182 (stop mid-wait) and `unknown` never
 *  offers a retry, only verification. */
export interface ClarificationOptionView {
  readonly label: string
  readonly description: string | null
}

export interface ClarificationQuestionView {
  readonly questionId: string
  readonly question: string
  readonly header: string | null
  readonly detail: string | null
  readonly options: readonly ClarificationOptionView[]
  readonly multiSelect: boolean
  /** Presentation intent carried through verbatim (`plan-review` today); answers are unaffected. */
  readonly intentKind: string | null
  readonly approveLabel: string | null
}

export interface ClarificationRunRef {
  readonly runSeq: number
  readonly turn: number | null
}

export interface ClarificationCardView {
  readonly requestId: string
  readonly questions: readonly ClarificationQuestionView[]
  readonly run: ClarificationRunRef | null
  readonly raisedAt: string
}

/** US-182: a question that left the wait without an answer — `stopped` when the session was
 *  paused under it, `gone` when it simply ended. Shown as 待继续/已中止, never silently dropped. */
export interface ClarificationDeferredView extends ClarificationCardView {
  readonly reason: 'stopped' | 'gone'
}

export type ClarificationReceiptState = 'accepted' | 'effective' | 'aborted' | 'unknown'

export interface ClarificationReceiptView {
  readonly requestId: string
  readonly state: ClarificationReceiptState
  readonly submittedAt: string
  readonly code: string | null
  /** True for `aborted`/`unknown`: the surface offers verification for the same operation, never retry. */
  readonly verifyOnly: boolean
}

export interface ClarificationStatus {
  readonly state: 'read' | 'no-session' | 'unavailable'
  readonly pending: readonly ClarificationCardView[]
  readonly deferred: readonly ClarificationDeferredView[]
  readonly receipts: readonly ClarificationReceiptView[]
  readonly code: string | null
  readonly at: string | null
}

export type ClarificationAnswerOutcome =
  | { readonly state: 'recorded', readonly receipt: ClarificationReceiptView }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 036 (US-185~187): one edit version of a sent message.
 *  `submission` is the version's own submission state: `unsent` until the first explicit resend,
 *  `accepted` once the base admitted that version's request identity, `effective` once the log
 *  shows the message landed, `unknown` when no ack was received (verify only — never retried and
 *  never silently placed back into the resendable queue), `not-delivered` after a verification
 *  confirmed it never landed (only then may an explicit resend happen again). */
export type SessionEditSubmission = 'unsent' | 'accepted' | 'effective' | 'unknown' | 'not-delivered'

export interface SessionEditVersionView {
  readonly version: number
  readonly text: string
  readonly savedAt: string
  readonly submission: SessionEditSubmission
  readonly submittedAt: string | null
  readonly code: string | null
}

export interface SessionEditRecordView {
  readonly editId: string
  readonly messageRef: string
  /** The original message's text, captured from the channel transcript at first save and never
   *  rewritten by later versions (US-185: the original is not overwritten). */
  readonly originalText: string
  readonly activeVersion: number
  readonly versions: readonly SessionEditVersionView[]
}

export interface SessionEditsStatus {
  readonly state: 'read'
  readonly records: readonly SessionEditRecordView[]
  readonly code: string | null
  readonly at: string | null
}

export type SessionEditSaveOutcome =
  | { readonly state: 'saved', readonly record: SessionEditRecordView }
  | { readonly state: 'refused', readonly code: string }

export type SessionEditResendOutcome =
  | { readonly state: 'recorded', readonly version: SessionEditVersionView }
  | { readonly state: 'refused', readonly code: string }

export type SessionEditVerifyOutcome =
  | { readonly state: 'checked', readonly version: SessionEditVersionView, readonly code: string | null }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 038 (US-189~191): the input-area skill & plugin selectors.
 *  The lists are read-only projections of what is ACTUALLY mounted (the base's `ctx.skills`
 *  snapshot / the composed runtime inventory); a selection is a per-request reference carried
 *  with the next send — never an enablement write, never a capability claim. */
export interface InputSkillView {
  readonly name: string
  readonly description: string | null
  readonly source: string | null
  readonly provider: string | null
  readonly userInvocable: boolean
  readonly modelInvocable: boolean
}

export interface InputPluginView {
  readonly identity: string
  readonly version: string | null
  readonly digestShort: string | null
}

export interface InputSelectedView {
  readonly kind: 'skill' | 'plugin'
  readonly ref: string
}

export interface InputSelectionsStatus {
  readonly state: 'read' | 'unavailable'
  readonly skills: readonly InputSkillView[]
  /** Set when discovery was incomplete — explicitly NOT a claim that any skill is gone. */
  readonly skillsNote: string | null
  readonly plugins: readonly InputPluginView[]
  readonly pluginsNote: string | null
  readonly selected: readonly InputSelectedView[]
  readonly code: string | null
  readonly at: string | null
}

export type InputSelectionOutcome =
  | { readonly state: 'selected', readonly selected: readonly InputSelectedView[] }
  | { readonly state: 'cleared', readonly selected: readonly InputSelectedView[] }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 039 (US-192): the plan/goal collaboration mode — the service projection's cropped view.
 *  `active` is the logged (in-force) state only; `pending` says a selection awaits the next
 *  accepted pre-step. Nothing here is ever a guess: unreadable stays `unavailable` with a code,
 *  and a matter with no session reads `no-session` (reading never creates one). */
export interface SessionPlanModeStatus {
  readonly state: 'read' | 'no-session' | 'unavailable'
  readonly reason: string | null
  /** null when not read — never a manufactured default. */
  readonly active: boolean | null
  readonly pending: boolean
}

/** Ticket 039 (US-192/193): the switch receipt. `outcome` is the base's own word
 *  (`committed | queued | cancelled | noop`); `family` is the three-state reading the UI
 *  distinguishes (applied / pending / unchanged), and `view` is the fresh post-switch read of
 *  the actual mode (null when that read failed — the receipt never invents one). A refusal is
 *  a refusal: it never fabricates a settled outcome. */
export type PlanModeSwitchReceipt =
  | {
    readonly state: 'settled'
    readonly outcome: 'committed' | 'queued' | 'cancelled' | 'noop'
    readonly family: 'applied' | 'pending' | 'unchanged'
    readonly view: { readonly active: boolean, readonly pending: boolean } | null
    readonly viewCode: string | null
    readonly at: string
  }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 043 (US-203/204): the integrated terminal — READ-ONLY. The panel lists the matter's
 *  live PTY sessions (identity, type, process status; never a pid or a path) and pages the
 *  retained scrollback as a run observation. No write face exists at all: the panel's open/close
 *  is a local toggle, so a run is never cancelled by it, and terminal output can never enter the
 *  conversation history or the artifact list (structurally — this store only reads). */
export interface TerminalSessionView {
  readonly terminalId: string
  readonly name: string | null
  readonly type: string
  readonly status: { readonly kind: 'running' } | { readonly kind: 'exited', readonly exitCode: number | null, readonly signal: string | null }
}

export interface TerminalStatus {
  readonly state: 'read' | 'no-session' | 'unavailable'
  /** Named reason when unavailable — the missing-capability item, never an empty terminal. */
  readonly reason: string | null
  readonly terminals: readonly TerminalSessionView[]
}

export type TerminalReadOutcome =
  | {
    readonly state: 'read'
    readonly text: string
    readonly totalLines: number
    readonly lineBegin: number
    readonly lineEnd: number
    readonly truncated: boolean
  }
  | { readonly state: 'refused', readonly code: string }
  | { readonly state: 'unavailable', readonly code: string }

/** Ticket 048 (US-223/224): the feedback entry — the payload is exactly the user's text plus
 *  structured diagnostics (no log, no stack, no machine path, no credential is ever attached);
 *  the receipt distinguishes 已接收 from 结果未知, and an unknown is verify-only — never a resubmit. */
export type FeedbackReceiptView =
  | { readonly state: 'accepted' | 'unknown', readonly requestId: string, readonly at: string, readonly code: string | null }
  | { readonly state: 'refused' | 'unavailable' | 'not-found', readonly requestId: string | null, readonly at: string | null, readonly code: string }

export interface FeedbackStatus {
  readonly state: 'read'
  readonly receipts: readonly FeedbackReceiptView[]
}

/** Ticket 042 (US-200~202): the model-queue verdict — folded from the base's own durable retry
 *  records (`llm/retry` = retry scheduled with its service delay + failure code; `llm/retry-started`
 *  = the wait succeeded and the next attempt starts). The three states NEVER borrow error-three-state
 *  wording: waiting/retrying/ready are service facts, and a timeout is 结果未知 (verify-only), not a
 *  failure. This store is a pure read — 排队与重试不重复提交. */
export interface ModelQueueRetryView {
  readonly retryId: string
  readonly turn: number
  readonly attempt: number
  readonly maxAttempts: number | null
  /** The SERVICE's scheduled delay (ms) — displayed as a fact, never counted down by the UI. */
  readonly delayMs: number
  readonly provider: string
  readonly failureCode: string
  /** true once `llm/retry-started` shows the wait succeeded and the attempt restarted. */
  readonly started: boolean
}

export interface ModelQueueStatus {
  readonly state: 'read' | 'no-session' | 'unavailable'
  readonly verdict: 'idle' | 'waiting' | 'retrying' | 'ready' | 'unknown'
  readonly retries: readonly ModelQueueRetryView[]
  /** true when the verdict can only offer the re-read entry (timeout/unresolved — never a retry). */
  readonly verifyOnly: boolean
  readonly reason: string | null
  readonly at: string | null
}

/** Ticket 041 (US-197~199): the external-authorization wait. A pending wait exists exactly
 *  while the base's `approval/request` waterfall is blocked on the shell's relay — the card
 *  shows the requested scope (tool) and its source note, and never reads as failed or approved.
 *  A vanished wait is 失效 and needs a fresh request; it is NEVER converted into a grant. */
export interface ApprovalCardView {
  readonly requestId: string
  /** The requested scope: the tool whose operation awaits the decision. */
  readonly toolName: string
  readonly callId: string | null
  /** Why the asker is asking (the request's source note); null = asker supplied none. */
  readonly reason: string | null
  /** Whether this wait can be withdrawn (the asker supplied a cancellation signal). */
  readonly withdrawable: boolean
  readonly raisedAt: string
}

/** A wait that left the pending list with no decision: preserved, never silently dropped. */
export interface ApprovalLapsedView extends ApprovalCardView {
  readonly lapse: 'stopped' | 'gone'
}

export type ApprovalReceiptState = 'accepted' | 'effective' | 'lapsed' | 'unknown'

export interface ApprovalReceiptView {
  readonly requestId: string
  readonly state: ApprovalReceiptState
  /** The submitted decision (`allowed-once` is a one-shot grant; `withdrawn` = 撤回); null when unknown. */
  readonly outcome: 'allowed-once' | 'rejected' | 'withdrawn' | null
  readonly submittedAt: string
  readonly code: string | null
  /** true when the receipt offers verification instead of the decision buttons. */
  readonly verifyOnly: boolean
}

export interface ApprovalStatus {
  readonly state: 'read' | 'no-session' | 'unavailable'
  readonly pending: readonly ApprovalCardView[]
  readonly lapsed: readonly ApprovalLapsedView[]
  readonly receipts: readonly ApprovalReceiptView[]
  readonly code: string | null
  readonly at: string | null
}

export type ApprovalAnswerOutcome =
  | { readonly state: 'recorded', readonly receipt: ApprovalReceiptView }
  | { readonly state: 'refused', readonly code: string }

export type ApprovalWithdrawOutcome =
  | { readonly state: 'recorded', readonly receipt: ApprovalReceiptView }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 040 (US-195/196): the site starting-template catalog — read-only entries with their
 *  provenance; selecting one produces only this draft's input (a renderer-local insertion into
 *  the editable draft input). There is NO site-create request face at all, and the unavailable
 *  state is named with its reason — an empty list never impersonates an empty catalog. */
export interface SiteTemplateView {
  readonly templateId: string
  readonly name: string
  readonly source: string
  readonly version: string
  /** The prompt text this template inserts into the draft; null = lists but cannot insert. */
  readonly prompt: string | null
}

export interface SiteTemplatesStatus {
  readonly state: 'read' | 'unavailable'
  readonly reason: string | null
  readonly entries: readonly SiteTemplateView[]
}

/** Ticket 035 (US-183/184): one run's message anchor — the turn it points into, plus a short
 *  preview of that run's first user text (bounded; nothing full-length ever crosses this seam). */
export interface SessionAnchorView {
  readonly runSeq: number
  readonly turn: number | null
  readonly promptPreview: string | null
}

export type SessionAnchorListOutcome =
  | { readonly state: 'read', readonly anchors: readonly SessionAnchorView[] }
  | { readonly state: 'no-session' }
  | { readonly state: 'unavailable', readonly code: string }

/** US-184: locating a target run that cannot be read stays `missing` with its reason —
 *  the anchor rail keeps its scene instead of collapsing to a blank. */
export type SessionAnchorLocateOutcome =
  | { readonly state: 'located', readonly runSeq: number, readonly turn: number | null, readonly promptPreview: string | null }
  | { readonly state: 'missing', readonly runSeq: number, readonly code: string }
  | { readonly state: 'no-session' }

/** Ticket 035: the last anchors read + the last located target (empty anchors means never read). */
export interface SessionAnchorsStatus {
  readonly state: 'read' | 'unavailable' | 'no-session'
  readonly anchors: readonly SessionAnchorView[]
  readonly located: { readonly runSeq: number, readonly promptPreview: string | null } | null
  readonly code: string | null
  readonly at: string | null
}

/** Ticket 014 (US-071~076/083): one attachment item on its way from a picked file to a sent message.
 *  `stored` means the host's content-addressed store took the sealed bytes and the receipt's digest
 *  matched — never that a model read it; `sent` means the base accepted the prompt that carried its
 *  receipt on this session. */
export type AttachmentStage = 'candidate' | 'uploading' | 'stored' | 'sent' | 'failed' | 'source-changed' | 'cancelled'

export interface AttachmentItem {
  readonly itemId: string
  /** Display name only; the machine path never crosses this projection. */
  readonly name: string
  readonly bytes: number
  readonly stage: AttachmentStage
  /** Bytes handed to the host so far while `uploading`, else null. */
  readonly sentBytes: number | null
  /** The refusal code of a failed/source-changed item; null otherwise. */
  readonly code: string | null
}

export interface AttachmentStatus {
  readonly state: 'read' | 'unavailable'
  readonly items: readonly AttachmentItem[]
}

export type AttachmentPickOutcome =
  | { readonly state: 'picked', readonly items: readonly AttachmentItem[], readonly refused: readonly { readonly name: string, readonly code: string }[] }
  /** The dialog's own "the user cancelled" answer — a fact, not a failure. */
  | { readonly state: 'cancelled' }
  | { readonly state: 'refused', readonly code: string }

export type AttachmentUploadOutcome =
  | { readonly state: 'stored', readonly item: AttachmentItem }
  | { readonly state: 'refused', readonly code: string }

export type AttachmentControlOutcome =
  | { readonly state: 'cancelled', readonly itemId: string }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 015 (US-031~038/040/042): one artifact card. The record's version is what an open reads;
 *  `ready` means a fresh stat confirmed that exact version was readable — never that a generator
 *  re-ran, and never that the file is an accepted deliverable. */
export type ArtifactKind = 'text' | 'markdown' | 'code' | 'image' | 'html' | 'pdf' | 'csv' | 'office' | 'binary'

export type ArtifactCardState = 'ready' | 'absent' | 'unconfirmed'

export interface ArtifactCard {
  readonly artifactId: string
  /** Display name only; the machine path never crosses this projection. */
  readonly name: string
  readonly kind: ArtifactKind
  readonly bytes: number | null
  /** Opaque freshness token from the confirming stat. */
  readonly version: string
  readonly state: ArtifactCardState
  /** How this card came to exist: the observation feed's clue, stat-confirmed. */
  readonly source: 'changes-observed'
  readonly observedAt: string
}

export type ArtifactPreviewState =
  | { readonly state: 'closed' }
  | { readonly state: 'opening', readonly artifactId: string, readonly name: string }
  | { readonly state: 'ready', readonly artifactId: string, readonly name: string, readonly kind: ArtifactKind, readonly version: string, /** Ticket 033: panel vs full-view layout of the SAME loaded document; expanding never reloads. */ readonly expanded: boolean, /** Ticket 044: the separate window surface shows the SAME loaded version; closing it returns to the panel layout. */ readonly window: boolean }
  /** Failure is its own state; `retryable` re-reads the SAME version and never advances it. */
  | { readonly state: 'failed', readonly artifactId: string, readonly name: string, readonly code: string, readonly retryable: boolean }

export interface ArtifactStatus {
  readonly state: 'read' | 'unavailable'
  readonly cards: readonly ArtifactCard[]
  readonly preview: ArtifactPreviewState
}

export type ArtifactObserveOutcome =
  | { readonly state: 'observed', readonly observed: number, readonly cards: number }
  | { readonly state: 'refused', readonly code: string }

export type ArtifactOpenOutcome =
  | { readonly state: 'opened', readonly preview: ArtifactPreviewState }
  | { readonly state: 'refused', readonly code: string }

export type ArtifactCloseOutcome =
  | { readonly state: 'closed' }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 033 (US-172): the full-view layout switch for the one side-preview. It only ever moves
 *  the SAME loaded document between panel and full view — no reload, no new read. */
/** Ticket 044 (US-205): the separate preview window. It opens only on an explicit action over an
 *  already-open preview and shows the SAME prepared document as the side container (zero bridge
 *  re-reads); closing it returns to the panel layout and never touches the run. */
export type ArtifactWindowOutcome =
  | { readonly state: 'opened', readonly preview: ArtifactPreviewState }
  | { readonly state: 'closed', readonly preview: ArtifactPreviewState }
  | { readonly state: 'refused', readonly code: string }

export type ArtifactFullscreenOutcome =
  | { readonly state: 'ok', readonly preview: ArtifactPreviewState }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 033 (US-172, D-036): the one controlled external-link entry. Sage validates the target
 *  and hands it to the injected opener (system browser); the projection echoes scheme + host only
 *  — never the full URL with its query or credentials. */
export type ExternalLinkOutcome =
  | { readonly state: 'opened', readonly target: { readonly scheme: 'http' | 'https', readonly host: string } }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 033 (US-175/176, D-048): one typed tool result rendered by Sage-owned components.
 *  Views are the sanitized product of a strict declaration parser: sensitive fields arrive masked,
 *  unsupported types are refused by name, and no raw payload ever crosses this projection. */
export interface ToolResultTextField { readonly kind: 'text', readonly text: string }
export interface ToolResultKeyValuesField { readonly kind: 'key-values', readonly entries: readonly { readonly name: string, readonly value: string }[] }
export interface ToolResultTableField { readonly kind: 'table', readonly columns: readonly string[], readonly rows: readonly (readonly string[])[] }
export interface ToolResultLinkField { readonly kind: 'link', readonly label: string, readonly host: string, readonly url: string }
export interface ToolResultImageField { readonly kind: 'image', readonly name: string, readonly artifactId: string, readonly version: string }
/** A supported type whose exact content could not be admitted (bad scheme, unpermitted image
 *  ref): the row stays, the entry does not — and it is never replaced by substitute rendering. */
export interface ToolResultRefusedField { readonly kind: 'refused', readonly code: string }

export type ToolResultField =
  | ToolResultTextField
  | ToolResultKeyValuesField
  | ToolResultTableField
  | ToolResultLinkField
  | ToolResultImageField
  | ToolResultRefusedField

export interface ToolResultView {
  readonly resultId: string
  readonly tool: string
  readonly title: string
  readonly at: string
  readonly state: 'read'
  readonly fields: readonly ToolResultField[]
}

export interface ToolResultUnsupportedView {
  readonly resultId: string
  readonly tool: string
  readonly title: string
  readonly at: string
  readonly state: 'unsupported'
  /** The declared type, refused by name — shown, never approximated. */
  readonly declaredType: string
}

export type ToolResultsStatus =
  | { readonly state: 'read', readonly results: readonly (ToolResultView | ToolResultUnsupportedView)[] }
  | { readonly state: 'unavailable', readonly reason: string }

/** Ticket 021 (US-085~089): one query, two sections. Matters match locally over Sage's own
 *  records; sessions come from the base's bounded search — and the two sections never borrow each
 *  other's words: an unmounted query engine is `unavailable`, not "no hits". */
export interface SearchMatterHit {
  readonly matterRef: string
  readonly title: string
  readonly matchedField: 'goal' | 'deliverable' | 'responsibility' | 'projectRef'
}

export type SearchSessionsSection =
  | { readonly state: 'available', readonly items: readonly { readonly sessionId: string, readonly snippet: string }[], readonly hasMore: boolean }
  /** The deployment does not mount `dsh-session-query`: its own state, never an empty result. */
  | { readonly state: 'unavailable', readonly code: string }
  | { readonly state: 'failed', readonly code: string }

export type SearchOutcome =
  | { readonly state: 'read', readonly query: string, readonly matters: readonly SearchMatterHit[], readonly sessions: SearchSessionsSection }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 024 (FW-019, US-102~106): one side chat — a child session forked from the matter's main
 *  session. The child has its own context and history; the matter still binds only its main session,
 *  main and side project separately, and nothing merges without an explicit act. */
export interface SideChatRecord {
  readonly sideChatId: string
  /** The forked child session; prompts in the side chat go to THIS session only. */
  readonly sessionId: string
  /** The anchor (no anchor = the whole completed-turn prefix); kept for the record's own trace. */
  readonly atSeq: number | null
  readonly createdAt: string
  readonly execution: 'idle' | 'executing' | 'not-read'
  readonly lastTurnEnd: string | null
}

export interface SideChatsStatus {
  readonly state: 'read' | 'unavailable'
  readonly code: string | null
  readonly items: readonly SideChatRecord[]
}

export type SideChatCreateOutcome =
  | { readonly state: 'created', readonly item: SideChatRecord }
  | { readonly state: 'refused', readonly code: string }

export type SideChatSendOutcome =
  | { readonly state: 'accepted', readonly requestId: string }
  | { readonly state: 'refused', readonly code: string }

export type SideChatReadOutcome =
  | { readonly state: 'read', readonly item: SideChatRecord, readonly channel: SessionChannelStatus }
  | { readonly state: 'refused', readonly code: string }

/** US-105: the explicit carries-back act — the text goes to the MAIN session as a normal prompt. */
export type SideChatReturnOutcome =
  | { readonly state: 'accepted', readonly mainRequestId: string }
  | { readonly state: 'refused', readonly code: string }

/** Ticket 022 (FW-015, US-090~096): the matter list as action-need partitions.
 *
 * A partition is presentation organization over the same projection — no new state store, no
 * approval queue, and the renderer groups only by the `partition` field main derived: it never
 * decides membership itself. Every 待我处理 item names its triggering fact (US-093); 待验收 carries
 * a count and nothing resembling completion semantics (US-094). */
export type MatterListPartition = 'action' | 'in-progress' | 'acceptance'

/** The fact that put an item into 待我处理; `ref` points at the record to examine (US-093). */
export type MatterListTrigger =
  | { readonly kind: 'attempt-unknown', readonly ref: string }
  | { readonly kind: 'attempt-failed', readonly ref: string }
  | { readonly kind: 'pending-inputs', readonly ref: string, readonly count: number }

export interface MatterListItem {
  /** The matter reference once one exists; otherwise the draft id the matter is forming from. */
  readonly itemId: string
  readonly matterRef: string | null
  readonly title: string
  readonly partition: MatterListPartition
  /** Non-empty exactly when the partition is `action`; empty otherwise. */
  readonly triggers: readonly MatterListTrigger[]
  /** Count only — the first release defines no acceptance semantics (US-094). */
  readonly acceptanceCandidateCount: number
  /** Ticket 029 gives it its fact source: the archive store's entry for this matterRef
   *  (`archivedOf`). The lifecycle is presentation membership only — it is not the session's
   *  pause fact and not any hide preference (US-154). */
  readonly lifecycle: 'active' | 'archived'
  readonly updatedAt: string
}

export interface MatterListState {
  readonly state: 'read' | 'unavailable'
  /** unavailable-first: no store, no list — never fixture rows (US-096). */
  readonly code: string | null
  readonly items: readonly MatterListItem[]
  readonly counts: { readonly action: number, readonly inProgress: number, readonly acceptance: number }
}

/** Ticket 006: the outcome of stop/resume. `drained` went back to 待继续; `consumed` was taken by
 *  the race and is frozen as such. Ticket 007: `interrupted` means a re-pause landed mid-resume —
 *  the already-dispatched items stand, the rest stay pending, and nothing further was sent. */
export interface SessionControlOutcome {
  readonly state: 'stopped' | 'resumed' | 'interrupted' | 'refused'
  readonly paused: boolean
  readonly drained: readonly string[]
  readonly consumed: readonly string[]
  readonly dispatched?: readonly string[]
  readonly code: string | null
  /** Ticket 007: the pending-list revision the dispatch closed under (queue accounting version). */
  readonly revision?: number
}

/** Ticket 011 (US-065~070): one matter ↔ workspace association, with its named trail. */
export interface MatterLinkView {
  readonly matterRef: string
  readonly workspaceRef: string
  readonly workspacePath: string
  readonly linkedAt: string
  readonly isDefault: boolean
}

export interface MatterLinkTrailRecord {
  readonly linkId: string
  readonly at: string
  readonly action: 'linked' | 'unlinked' | 'default-set' | 'default-cleared'
  readonly matterRef: string
  readonly workspaceRef?: string
  readonly actorRef: string
}

export interface MatterLinkState {
  readonly state: 'read' | 'unavailable'
  readonly links: readonly MatterLinkView[]
  readonly trail: readonly MatterLinkTrailRecord[]
}

/** Ticket 002 (US-011): unlocked projects the device's drafts; locked says nothing about them. */
export interface DraftStatus {
  readonly state: 'unlocked' | 'locked' | 'unavailable'
  readonly drafts: readonly DraftView[]
}

/** The custody action a confirmed draft produces; built by main, never by the renderer (US-004). */
export interface DraftConversionRequest {
  readonly draftId: string
  readonly matterId: string
  readonly revisionId: string
  readonly payload: Readonly<Record<string, string>>
}

export type DraftConvertOutcome =
  | { readonly state: 'converted', readonly draftId: string, readonly matterRef: string }
  /** Ticket 003 (US-119): the creation may have taken effect; the surface offers 核对 only. */
  | { readonly state: 'unknown', readonly draftId: string, readonly correlation: string }
  | { readonly state: 'refused', readonly draftId: string | null, readonly code: string }
  /** A pipeline denial keeps the command's own stage so the surface can word it like any command. */
  | { readonly state: 'denied', readonly draftId: string, readonly code: string, readonly stage: string, readonly retryable: boolean }

/** Ticket 025 (US-124): the prepared single card, or the honest refusal while unwired. */
export type ActionConfirmationPrepareOutcome =
  | { readonly state: 'prepared', readonly card: ActionConfirmationCard }
  | { readonly state: 'refused', readonly code: 'confirmation-unavailable' }

/** Ticket 025: the draft flow's card; refusals mirror the convert gate's own states. */
export type DraftConfirmationOutcome =
  | { readonly state: 'prepared', readonly draftId: string, readonly card: ActionConfirmationCard }
  | { readonly state: 'refused', readonly draftId: string | null, readonly code: string }

/** Ticket 003: asking the same request — never a second creation — what actually happened. */
export type DraftReconcileOutcome =
  | { readonly state: 'settled', readonly draftId: string, readonly matterRef: string }
  | { readonly state: 'unknown', readonly draftId: string, readonly code: string }
  | { readonly state: 'failed', readonly draftId: string, readonly code: string }

export interface ReadoutState {
  readonly visibility: ReadoutVisibility
  readonly plugins: ReadoutPlugins
  readonly knowledge: ReadoutKnowledge
  readonly diagnostics: ReadoutDiagnostics
}

/** One main-owned read of the readout; the service's own last command rides along so the
 *  diagnostics block never needs a second home for it. */
export type ReadoutProvider = (context: { readonly lastCommand: ServiceCommandStatus | null }) => ReadoutState

export interface SageServiceState {
  readonly service: ServiceStatus
  /** Explicit selection state. Reading this field never activates or replaces a context. */
  readonly activeContext: ActiveMatterContextStatus
  /** The one matter projection slot (WT-02D.1): fixture-filled only under an explicit fixture mode; null = stable unavailable, never a placeholder. */
  readonly matter: SageMatterViewState | null
  readonly runtime: SageViewState | null
  /** Ticket 030: the live agent-preset roster as main observed it; never a market listing. */
  readonly capability: CapabilityStatus
  /** Ticket 017: the model-config view as main classified it; structure and state only. */
  readonly modelConfig: ModelConfigStatus
  /** Ticket 010: the most recent adopt attempt main observed, or null when none ran in this process. */
  readonly workspaceAdoption: WorkspaceAdoptOutcome | null
  /** Ticket 012: the workspace list folded from the follow stream. */
  readonly workspaces: WorkspaceListStatus
  /** Ticket 012 (write half): the most recent workspace mutation main ran, or null when none ran. */
  readonly workspaceMutation: WorkspaceMutationOutcome | null
  /** Ticket 013: the last candidate listing main produced, or null when none ran in this process. */
  readonly fileCandidates: FileCandidateStatus | null
  /** Ticket 013: the in-process reference records (this run only), each with its creation version. */
  readonly fileReferences: readonly FileReferenceRecord[]
  /** Ticket 013: the most recent reference use, or null when none ran. */
  readonly fileReferenceUse: FileReferenceUse | null
  /** Ticket 026: the four rear read-only families, classified once by main. */
  readonly readout: ReadoutState
  /** Ticket 002: the device-local drafts, or the locked/unavailable answer. */
  readonly draft: DraftStatus
  /** Ticket 011: the matter ↔ workspace associations and their operation trail. */
  readonly matterLinks: MatterLinkState
  /** Ticket 005: the matter's session channel — ack, execution state, and the reconciled text. */
  readonly sessionChannel: SessionChannelStatus
  /** Ticket 020: the device's display preferences (both entries read this one slot). */
  readonly preferences: PreferencesStatus
  /** Ticket 046: the eleven read-only leaf settings pages. */
  readonly settingsLeaves: readonly SettingsLeaf[]
  /** Ticket 014: this run's attachment items (candidates and records); content-addressed refs only. */
  readonly attachments: AttachmentStatus
  /** Ticket 015: artifact cards from observed file changes + the one side-preview state. */
  readonly artifacts: ArtifactStatus
  /** Ticket 022: the matter list, partitioned by action need (derived in main, never in the view). */
  readonly matterList: MatterListState
  /** Ticket 024: the current matter's side chats, as derived records (US-103). */
  readonly sideChats: SideChatsStatus
  /** Ticket 027: the matter edit drafts (controlled info only; the bytes stay in main). */
  readonly editDrafts: EditDraftStatus
  /** Ticket 028: Sage-owned action items and their linked corrections. */
  readonly actionItems: ActionItemsStatus
  /** Ticket 028: the project grouping (pure refs + trail; never matter-fact copies). */
  readonly projects: ProjectsStatus
  /** Ticket 029: the matter administration facts (archive entries, trail, last rename/batch). */
  readonly matterAdmin: MatterAdminStatus
  /** Ticket 049: the Sage-owned task groups — organization only (never a fact or scope change). */
  readonly matterGroups: MatterGroupsStatus
  /** Ticket 031: the run monitor — four axes, same session projection as the conversation card. */
  readonly runMonitor: RunMonitorView
  /** Ticket 032: the Sage-owned plans (deliverables) with their per-step readiness facts. */
  readonly plans: PlansStatus
  /** Ticket 033: typed tool results, rendered by Sage-owned components (provider unwired ⇒ unavailable). */
  readonly toolResults: ToolResultsStatus
  /** Ticket 009: the cold-history readout (same seam as the session channel; pure page reads). */
  readonly sessionHistory: SessionHistoryStatus
  /** Ticket 034: the live clarification cards + the recorded answer receipts (relay-backed). */
  readonly sessionClarifications: ClarificationStatus
  /** Ticket 035: the message anchors (turn jump points) + the last located target. */
  readonly sessionAnchors: SessionAnchorsStatus
  /** Ticket 036: the sent-message edit versions + their submission states. */
  readonly sessionEdits: SessionEditsStatus
  /** Ticket 038: the read-only skill/plugin selectors + this request's carried references. */
  readonly inputSelections: InputSelectionsStatus
  /** Ticket 039: the plan/goal mode projection (logged state + queued selection). */
  readonly sessionPlanMode: SessionPlanModeStatus
  /** Ticket 040: the read-only site starting-template catalog (selection = draft input only). */
  readonly siteTemplates: SiteTemplatesStatus
  /** Ticket 041: the external-authorization waits + their recorded decisions. */
  readonly sessionApprovals: ApprovalStatus
  /** Ticket 042: the model-queue verdict (queued / retrying / ready) from service facts. */
  readonly modelQueue: ModelQueueStatus
  /** Ticket 043: the read-only integrated-terminal surface (sessions + bounded scrollback). */
  readonly terminal: TerminalStatus
  /** Ticket 048: the recorded feedback receipts (in-memory; verify reads them, never resubmits). */
  readonly feedback: FeedbackStatus
}

/** READ-01A: renderer values remain candidates until a main-owned projection-read runner binds
 * them to one fresh request scope. Opaque ids are resolved only after policy admission. */
export type ProjectionReadCandidate =
  | { readonly kind: 'active-matter' }
  | { readonly kind: 'collection'; readonly collection: 'state' | 'search' }
  | { readonly kind: 'workspace'; readonly workspaceRoot: string }
  | { readonly kind: 'matter-workspace'; readonly matterRef: string; readonly workspaceRoot: string }
  | {
      readonly kind: 'opaque'
      readonly resource: 'file-reference' | 'artifact' | 'current-artifact' | 'edit-draft'
      readonly id?: string
    }

export type ProjectionReadRouteRunner = (
  intent: ProjectionReadIntent<ProjectionReadCandidate>,
  read: (scope: ProjectionReadScope) => Promise<Response>,
) => Promise<ProjectionReadAdmissionResult<Response>>

export interface ServiceProviders {
  /** READ-01A: every read-only product route enters this runner before invoking its raw provider. */
  readonly runProjectionRead?: ProjectionReadRouteRunner
  readonly readState: () => Promise<Response>
  /** Stable state-route denial that performs no provider, store or Host read. */
  readonly readBlockedState: () => Promise<Response>
  /** CTX-01B: explicit user selection; no GET, send or link route may call this implicitly. */
  readonly selectActiveMatter: (request: ActiveMatterSelectionRequest) => Promise<Response>
  /** Ticket 010: pick an existing directory and adopt it; never creates a directory. */
  readonly adoptWorkspace: () => Promise<Response>
  /** Ticket 012 (write half): rename / delete-registration / reorder, each over the bridge. */
  readonly mutateWorkspace: (request: WorkspaceMutationRequest) => Promise<Response>
  /** Ticket 013: list candidates inside one adopted workspace. */
  readonly listFileCandidates: (request: { readonly workspaceRoot: string, readonly path: string }) => Promise<Response>
  /** Ticket 013: create a reference from a candidate path — a stat, never a content read. */
  readonly createFileReference: (request: { readonly workspaceRoot: string, readonly path: string }) => Promise<Response>
  /** Ticket 013: use a reference — re-stat first, then (only if unchanged) read the content. */
  readonly useFileReference: (request: { readonly referenceId: string }) => Promise<Response>
  /** Ticket 002: the draft surface — one route per verb, none of them a matter action by itself. */
  readonly createDraft: (request: { readonly rawInput: string }) => Promise<Response>
  readonly updateDraft: (request: {
    readonly draftId: string
    readonly fields?: { readonly goal?: string, readonly deliverable?: string, readonly responsibility?: string, readonly projectRef?: string }
    readonly clarification?: string
    readonly selectedEntryIds?: readonly string[]
  }) => Promise<Response>
  /** Ticket 002: confirm — builds the custody action, runs the same pipeline, records the receipt.
   *  Ticket 025: once the confirmation store is wired, it also carries the one-time credential. */
  readonly convertDraft: (request: { readonly draftId: string, readonly confirmationId?: string }) => Promise<Response>
  /** Ticket 025: prepare the single pre-execution card for one exact intent / for the draft. */
  readonly prepareActionConfirmation: (intent: SageActionIntentV2) => Promise<Response>
  readonly prepareDraftConfirmation: (request: { readonly draftId: string }) => Promise<Response>
  /** Ticket 011: the named link operations — add, remove, set/clear the default environment. */
  readonly linkWorkspace: (request: { readonly action: 'link' | 'unlink' | 'set-default', readonly matterRef: string, readonly workspaceRef?: string }) => Promise<Response>
  /** Ticket 003: reconcile the open creation attempt of one draft (same request, no replay). */
  readonly reconcileDraft: (request: { readonly draftId: string }) => Promise<Response>
  /** Ticket 003 (US-006): cancel an unsubmitted confirmation; the draft content stays put. */
  readonly cancelDraftConfirm: (request: { readonly draftId: string }) => Promise<Response>
  /** Ticket 005 (US-012): admit one prompt; the answer is an acknowledgement, nothing more. */
  readonly sendSessionPrompt: (request: { readonly matterRef: string, readonly workspaceRoot: string, readonly text: string, readonly mode?: 'queue' | 'steer' }) => Promise<Response>
  /** Ticket 006: stop (cancel + drain into 待继续) and resume (dispatch in order). */
  readonly stopSession: (request: { readonly matterRef: string }) => Promise<Response>
  readonly resumeSession: (request: { readonly matterRef: string, readonly workspaceRoot: string }) => Promise<Response>
  /** Ticket 020: save one patch of the three display preferences. */
  readonly savePreferences: (request: Partial<{ readonly theme: 'light' | 'dark' | 'system', readonly language: 'zh' | 'en', readonly density: 'comfortable' | 'compact' }>) => Promise<Response>
  /** Ticket 006: edit or remove one still-pending item (a consumed one is frozen). */
  readonly updatePendingInput: (request: { readonly action: 'edit', readonly itemId: string, readonly text: string } | { readonly action: 'remove', readonly itemId: string }) => Promise<Response>
  /** Ticket 014: pick (candidate only), upload the sealed version, or cancel/remove one item. */
  readonly pickAttachments: () => Promise<Response>
  readonly uploadAttachment: (request: { readonly itemId: string, readonly matterRef: string, readonly workspaceRoot: string }) => Promise<Response>
  readonly cancelAttachment: (request: { readonly itemId: string }) => Promise<Response>
  /** Ticket 015: observe the session's file changes (clues → stat-confirmed cards), then the one
   *  side-preview's open / close / same-version retry. */
  readonly observeArtifacts: (request: { readonly matterRef: string, readonly workspaceRoot: string }) => Promise<Response>
  readonly openArtifact: (request: { readonly artifactId: string }) => Promise<Response>
  readonly closeArtifact: () => Promise<Response>
  readonly retryArtifact: () => Promise<Response>
  /** Ticket 021: one read-only query over local matters and the base's session search. */
  readonly search: (request: { readonly query: string }) => Promise<Response>
  /** Ticket 024: side-chat create / send / read, and the explicit carry-back to the main chat. */
  readonly createSideChat: (request: { readonly matterRef: string }) => Promise<Response>
  readonly sendSideChat: (request: { readonly sideChatId: string, readonly text: string }) => Promise<Response>
  readonly readSideChat: (request: { readonly sideChatId: string }) => Promise<Response>
  readonly returnSideChat: (request: { readonly sideChatId: string, readonly text: string }) => Promise<Response>
  /** Ticket 027: the edit-draft family — create / update / diff / prepare-writeback / writeback. */
  readonly createEditDraft: (request: { readonly referenceId: string, readonly matterRef: string }) => Promise<Response>
  readonly updateEditDraft: (request: { readonly draftId: string, readonly proposedText: string }) => Promise<Response>
  readonly diffEditDraft: (request: { readonly draftId: string }) => Promise<Response>
  readonly prepareEditDraftWriteback: (request: { readonly draftId: string }) => Promise<Response>
  readonly writebackEditDraft: (request: { readonly draftId: string, readonly confirmationId?: string }) => Promise<Response>
  /** Ticket 028: action items + their records + the linked corrections. */
  readonly createActionItem: (request: { readonly matterRef: string, readonly title: string, readonly note?: string }) => Promise<Response>
  readonly updateActionItem: (request: { readonly actionId: string, readonly title?: string, readonly note?: string }) => Promise<Response>
  readonly startActionItem: (request: { readonly actionId: string }) => Promise<Response>
  readonly completeActionItem: (request: { readonly actionId: string }) => Promise<Response>
  readonly submitCorrection: (request: { readonly matterRef: string, readonly workspaceRoot: string, readonly originalText: string, readonly originalAt?: string, readonly text: string }) => Promise<Response>
  /** Ticket 028: the project grouping (create / assign / unassign). */
  readonly createProject: (request: { readonly name: string }) => Promise<Response>
  readonly assignProject: (request: { readonly matterRef: string, readonly projectRef: string }) => Promise<Response>
  readonly unassignProject: (request: { readonly matterRef: string }) => Promise<Response>
  /** Ticket 029: matter administration — one archive, one restore, one batch, one rename. */
  readonly archiveMatter: (request: { readonly matterRef: string, readonly ground: 'completed' | 'stopped' }) => Promise<Response>
  readonly restoreMatter: (request: { readonly matterRef: string }) => Promise<Response>
  readonly batchMatters: (request: { readonly operation: 'archive' | 'restore', readonly targets: readonly string[], readonly ground?: 'completed' | 'stopped' }) => Promise<Response>
  readonly renameMatter: (request: { readonly matterRef: string, readonly title: string }) => Promise<Response>
  /** Ticket 049: task groups — the four named commands (organization only; no membership route
   *  may touch a matter fact, a scope or a permission). */
  readonly createMatterGroup: (request: { readonly name: string, readonly targets?: readonly string[] }) => Promise<Response>
  readonly renameMatterGroup: (request: { readonly groupId: string, readonly name: string }) => Promise<Response>
  readonly removeMatterGroup: (request: { readonly groupId: string }) => Promise<Response>
  readonly assignMatterGroup: (request: { readonly groupId: string, readonly operation: 'add' | 'remove', readonly targets: readonly string[] }) => Promise<Response>
  /** Ticket 031: one bounded read of a workspace run-log page (never conversation sync). */
  readonly readRunLog: (request: { readonly workspaceRoot: string, readonly path: string, readonly fromLine?: number, readonly expectVersion?: string, readonly expectBytes?: number }) => Promise<Response>
  /** Ticket 008: edit/remove one still-pending queue occurrence (`queue-item-not-found` honest). */
  readonly updateQueueItem: (request: { readonly action: 'edit', readonly itemId: string, readonly text: string } | { readonly action: 'remove', readonly itemId: string }) => Promise<Response>
  /** Ticket 009: cold history — the runs list and one run's on-demand detail (page reads only). */
  readonly sessionHistoryList: (request: { readonly beforeSeq?: number }) => Promise<Response>
  readonly sessionHistoryDetail: (request: { readonly runSeq: number }) => Promise<Response>
  /** Ticket 034: answer one live clarification (the read rides the state poll). */
  readonly sessionClarificationAnswer: (request: { readonly matterRef: string, readonly requestId: string, readonly answers: readonly unknown[] }) => Promise<Response>
  /** Ticket 035: read the message anchors / locate one run's message (pure history reads). */
  readonly sessionAnchorsRead: (request: { readonly action: 'read' }) => Promise<Response>
  readonly sessionAnchorLocate: (request: { readonly action: 'locate', readonly runSeq: number }) => Promise<Response>
  /** Ticket 038: select / clear one per-request skill-or-plugin reference (zero enablement writes). */
  readonly inputSelectionsSelect: (request: { readonly action: 'select', readonly kind: 'skill' | 'plugin', readonly ref: string }) => Promise<Response>
  readonly inputSelectionsClear: (request: { readonly action: 'clear', readonly kind: 'skill' | 'plugin', readonly ref?: string }) => Promise<Response>
  /** Ticket 036: save an edit version / resend it through the session entry / verify one version. */
  readonly sessionEditsSave: (request: { readonly action: 'save', readonly messageRef: string, readonly text: string }) => Promise<Response>
  readonly sessionEditsResend: (request: { readonly action: 'resend', readonly editId: string, readonly workspaceRoot?: string }) => Promise<Response>
  readonly sessionEditsVerify: (request: { readonly action: 'verify', readonly editId: string }) => Promise<Response>
  /** Ticket 039: switch the plan/goal mode (one named request; state rides the poll; no default write). */
  readonly sessionPlanModeSwitch: (request: { readonly active: boolean }) => Promise<Response>
  /** Ticket 048: submit one feedback (text + structured diagnostics only) / verify one receipt. */
  readonly feedbackSubmit: (request: { readonly action: 'submit', readonly text: string, readonly code?: string, readonly stage?: string, readonly correlation?: string }) => Promise<Response>
  readonly feedbackVerify: (request: { readonly action: 'verify', readonly requestId: string }) => Promise<Response>
  /** Ticket 043: page one terminal's bounded scrollback (read-only; a run observation). */
  readonly terminalRead: (request: { readonly terminalId: string, readonly offset?: number, readonly lines?: number }) => Promise<Response>
  /** Ticket 041: answer one live approval wait (the read rides the state poll). */
  readonly sessionApprovalAnswer: (request: { readonly matterRef: string, readonly requestId: string, readonly outcome: 'allowed-once' | 'rejected' }) => Promise<Response>
  /** Ticket 041: withdraw one live approval wait (aborts the asker's own signal). */
  readonly sessionApprovalWithdraw: (request: { readonly matterRef: string, readonly requestId: string }) => Promise<Response>
  /** Ticket 032: the plan deliverable + its two-stage step dispatch. */
  readonly createPlan: (request: { readonly matterRef: string, readonly title: string, readonly steps: readonly string[] }) => Promise<Response>
  readonly acceptPlan: (request: { readonly planId: string }) => Promise<Response>
  readonly preparePlanStep: (request: { readonly planId: string, readonly stepNo: number }) => Promise<Response>
  readonly executePlanStep: (request: { readonly planId: string, readonly stepNo: number, readonly confirmationId?: string }) => Promise<Response>
  /** Ticket 033: the controlled external-link entry (validate, then hand to the injected opener). */
  readonly openExternalLink: (request: { readonly url: string }) => Promise<Response>
  /** Ticket 033: move the SAME loaded preview between panel and full view (no reload). */
  readonly fullscreenArtifact: (request: { readonly on: boolean }) => Promise<Response>
  /** Ticket 044: open/close the separate preview window (the same loaded version, explicit only). */
  readonly artifactWindowOpen: () => Promise<Response>
  readonly artifactWindowClose: () => Promise<Response>
  /** The business dispatch; ticket 025 added the one-time credential the gate consumes. */
  readonly dispatch: (intent: SageDispatchIntent, confirmationId?: string) => Promise<Response>
  readonly login: () => Promise<Response>
  readonly logout: () => Promise<Response>
}

export interface ServiceDeps {
  readonly callerBinding: CallerBinding | null
  readonly providers: ServiceProviders
}
