/** Unavailable-first composition: no provider assembled, stable denials (spec §3.2). */
import { randomUUID } from 'node:crypto'
import type { SageViewState } from '../product/contracts.js'
import type { SageMatterViewState } from '../product/view-state.js'
import type { QueueItemOutcome, SessionHistoryStatus, SessionRunDetailOutcome, SessionRunListOutcome, SageServiceState, ServiceCommandOutcome, ServiceCommandStatus, ServiceProviders, CapabilityStatus, ModelConfigStatus, WorkspaceAdoptOutcome, WorkspaceListStatus, WorkspaceMutationOutcome, WorkspaceMutationRequest, FileCandidateStatus, FileReferenceOutcome, FileReferenceRecord, FileReferenceUse, ReadoutProvider, ReadoutState, DraftConversionRequest, DraftConvertOutcome, DraftReconcileOutcome, DraftStatus, DraftView, MatterLinkState, PreferencesSaveOutcome, PreferencesStatus, SessionChannelStatus, SessionControlOutcome, SessionSendOutcome, ClarificationAnswerOutcome, ClarificationStatus, SessionAnchorListOutcome, SessionAnchorLocateOutcome, SessionAnchorsStatus, SessionEditRecordView, SessionEditResendOutcome, SessionEditSaveOutcome, SessionEditsStatus, SessionEditVerifyOutcome, InputPluginView, InputSelectionOutcome, InputSelectionsStatus, SessionPlanModeStatus, PlanModeSwitchReceipt, SiteTemplatesStatus, ApprovalStatus, ApprovalAnswerOutcome, ApprovalWithdrawOutcome, ModelQueueStatus, TerminalStatus, TerminalReadOutcome, FeedbackStatus, FeedbackReceiptView, SettingsLeaf, AttachmentStatus, AttachmentPickOutcome, AttachmentUploadOutcome, AttachmentControlOutcome, ArtifactStatus, ArtifactObserveOutcome, ArtifactOpenOutcome, ArtifactCloseOutcome, ArtifactFullscreenOutcome, ExternalLinkOutcome, ToolResultsStatus, SearchOutcome, MatterListState, SideChatsStatus, SideChatCreateOutcome, SideChatSendOutcome, SideChatReadOutcome, SideChatReturnOutcome, ActionConfirmationPrepareOutcome, DraftConfirmationOutcome, EditDraftStatus, EditDraftCreateOutcome, EditDraftUpdateOutcome, EditDraftDiffOutcome, EditDraftPrepareWritebackOutcome, EditDraftWritebackOutcome, ActionItemsStatus, ActionItemOutcome, CorrectionOutcome, ProjectsStatus, ProjectOutcome, MatterAdminStatus, MatterAdminOutcome, MatterBatchResult, MatterRenameResult, MatterGroupsStatus, MatterGroupsOutcome, RunMonitorView, RunLogOutcome, PlansStatus, PlanOutcome, PlanStepOutcome, PlanStepExecuteOutcome, ArtifactWindowOutcome } from './contracts.js'
import { DEFAULT_DISPLAY_PREFERENCE_VALUES } from './contracts.js'
import type {
  ActiveMatterContextStatus,
  ActiveMatterSelectionOutcome,
  ActiveMatterSelectionRequest,
  ProjectionReadRouteRunner,
} from './contracts.js'
import type { RuntimeEffectiveObservation } from '../protocol.js'
import { serviceJson } from './errors.js'
import { runCommand } from './command-pipeline.js'
import type { CommandDenied, CommandPipelinePorts, CommandResult, SageActionIntentV2, SageDispatchIntent } from './command-contracts.js'
import type { ActionConfirmationsWiring } from './action-confirmations.js'
import { admitProtectedEffect } from './protected-effect-admission.js'
import type {
  ProtectedEffectAdmissionPorts,
  ProtectedEffectAdmissionResult,
  SessionCoreProtectedEffectCandidate,
} from './protected-effect-admission.js'

/** Production has no provider for any step: every port fails closed (spec §5).
 * Exported for the main-side authorization assembly (WT-02D.2A) to merge real step-2 ports over. */
export const PRODUCTION_FAIL_CLOSED_PORTS: CommandPipelinePorts = {
  checkAuthorizationAvailability: () => undefined,
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
  /** CTX-01B: read-only public projection of the main-owned selection kernel. */
  readonly activeMatterContext?: () => ActiveMatterContextStatus
  /** CTX-01B: explicit selection only. The route candidate is never itself authority. */
  readonly selectActiveMatter?: (request: ActiveMatterSelectionRequest) => Promise<ActiveMatterSelectionOutcome>
  /** READ-01A: route-level projection reads use one request-scoped main runner. */
  readonly runProjectionRead?: ProjectionReadRouteRunner
  /** T02: the local-system bootstrap read; assembled by main, absent keeps the stable denial. */
  readonly bootstrapRead?: () => Promise<Response>
  /** Device-local preference read; main owns admission and the exact DTO projection. */
  readonly devicePreferencesRead?: () => Promise<Response>
  /** Explicit fixture-mode matter projection (WT-02D.1): injected by main only under its fixture switch; absent keeps the slot null. */
  readonly fixtureProjection?: () => SageMatterViewState
  /** WT-02D.2A: composed command ports (real step-2 over fail-closed defaults); absent keeps every port fail-closed. */
  readonly commandPorts?: CommandPipelinePorts
  /** AUTH-02A: request-scoped session-effect checks. Dispatch is deliberately absent until the
   * remaining identity/policy, compatibility, Registry, preflight and persistence ports exist. */
  readonly protectedEffectPorts?: Omit<ProtectedEffectAdmissionPorts, 'dispatch'>
  /** The verified request binding owns this correlation when assembled by Electron main. */
  readonly protectedEffectCorrelation?: () => string
  /** Ticket 030: main-owned read of the live runtime roster; absent keeps the surface at 未核验. */
  readonly runtimeEffective?: () => RuntimeEffectiveObservation | undefined
  /** Ticket 017: main-owned classified settings read; absent keeps the model view unread. */
  readonly modelConfig?: () => ModelConfigStatus | Promise<ModelConfigStatus>
  /** Ticket 010: main-owned adoption over the bridge; absent reports the workspace custodian as unwired. */
  readonly adoptWorkspace?: () => Promise<WorkspaceAdoptOutcome>
  /** Ticket 012: main-owned read of the folded workspace list; absent reports it unread. */
  readonly workspaceList?: () => Promise<WorkspaceListStatus>
  /** Ticket 012 (write half): main-owned rename / delete-registration / reorder; absent refuses with its own code. */
  readonly mutateWorkspace?: (request: WorkspaceMutationRequest) => Promise<WorkspaceMutationOutcome>
  /** Ticket 013: main-owned candidate listing; absent refuses with its own code. */
  readonly listFileCandidates?: (request: { readonly workspaceRoot: string, readonly path: string }) => Promise<FileCandidateStatus>
  /** Ticket 013: main-owned reference creation (a stat, never a content read); absent refuses. */
  readonly createFileReference?: (request: { readonly workspaceRoot: string, readonly path: string }) => Promise<FileReferenceOutcome>
  /** Ticket 013: main-owned reference use with the version recheck; absent refuses. */
  readonly useFileReference?: (request: { readonly referenceId: string }) => Promise<FileReferenceUse>
  /** Ticket 013: the in-process reference records, read for the state projection. */
  readonly fileReferences?: () => readonly FileReferenceRecord[]
  /** Ticket 026: one main-owned read of the four rear read-only families. */
  readonly readout?: ReadoutProvider
  /** Ticket 002: the device's drafts as main projects them (locked/unlocked included). */
  readonly draftList?: () => DraftStatus
  readonly draftCreate?: (request: { readonly rawInput: string }) => DraftStatus | undefined
  readonly draftUpdate?: (request: {
    readonly draftId: string
    readonly fields?: { readonly goal?: string, readonly deliverable?: string, readonly responsibility?: string, readonly projectRef?: string }
    readonly clarification?: string
    readonly selectedEntryIds?: readonly string[]
  }) => DraftStatus | undefined
  /** Ticket 002: validate + build the custody action; a refusal never reaches the pipeline. */
  readonly draftPrepareConversion?: (request: { readonly draftId: string }) =>
    { readonly state: 'locked' | 'missing' | 'incomplete' | 'already-converted' }
    | { readonly state: 'ready', readonly request: DraftConversionRequest }
  /** Ticket 002: record the custody receipt (the only place a matterRef is written). */
  readonly draftCommitConversion?: (request: { readonly draftId: string, readonly matterRef: string }) => void
  /** Ticket 005: the session channel's two verbs — read the projection, send one prompt. */
  readonly sessionChannel?: () => Promise<SessionChannelStatus>
  readonly sessionSend?: (request: { readonly matterRef: string, readonly workspaceRoot: string, readonly text: string, readonly mode?: 'queue' | 'steer' }) => Promise<SessionSendOutcome>
  /** Ticket 014: the attachment chain — this run's items, and the pick/upload/cancel acts. */
  readonly attachments?: () => AttachmentStatus
  readonly attachmentsPick?: () => Promise<AttachmentPickOutcome>
  readonly attachmentsUpload?: (request: { readonly itemId: string, readonly matterRef: string, readonly workspaceRoot: string }) => Promise<AttachmentUploadOutcome>
  readonly attachmentsCancel?: (request: { readonly itemId: string }) => Promise<AttachmentControlOutcome>
  /** Ticket 015: artifact cards (from observed changes) and the one side-preview's acts. */
  readonly artifacts?: () => ArtifactStatus
  readonly artifactsObserve?: (request: { readonly matterRef: string, readonly workspaceRoot: string }) => Promise<ArtifactObserveOutcome>
  readonly artifactOpen?: (request: { readonly artifactId: string }) => Promise<ArtifactOpenOutcome>
  readonly artifactClose?: () => Promise<ArtifactCloseOutcome>
  readonly artifactRetry?: () => Promise<ArtifactOpenOutcome>
  /** Ticket 009: cold-history verbs + the readout slot (absent keeps honest refusals). */
  readonly sessionHistory?: () => SessionHistoryStatus
  readonly sessionHistoryList?: (request: { readonly beforeSeq?: number }) => Promise<SessionRunListOutcome>
  readonly sessionHistoryDetail?: (request: { readonly runSeq: number }) => Promise<SessionRunDetailOutcome>
  /** Ticket 034: the clarification loop — the live pending cards plus the one answer write. */
  readonly sessionClarifications?: () => Promise<ClarificationStatus>
  readonly sessionClarificationAnswer?: (request: { readonly matterRef: string, readonly requestId: string, readonly answers: readonly unknown[] }) => Promise<ClarificationAnswerOutcome>
  /** Ticket 038: the input-area selectors — read-only lists plus select/clear of carried refs. */
  readonly inputSelections?: () => Promise<InputSelectionsStatus>
  readonly inputSelectionsSelect?: (request: { readonly action: 'select', readonly kind: 'skill' | 'plugin', readonly ref: string }) => InputSelectionOutcome
  readonly inputSelectionsClear?: (request: { readonly action: 'clear', readonly kind: 'skill' | 'plugin', readonly ref?: string }) => InputSelectionOutcome
  /** Ticket 039: the plan/goal mode projection plus the one named switch (no default write). */
  readonly sessionPlanMode?: () => Promise<SessionPlanModeStatus>
  readonly sessionPlanModeSwitch?: (request: { readonly active: boolean }) => Promise<PlanModeSwitchReceipt>
  /** Ticket 040: the read-only site starting-template catalog (no write face exists at all). */
  readonly siteTemplates?: () => Promise<SiteTemplatesStatus>
  /** Ticket 041: the approval waits — the live read plus the answer/withdraw writes. */
  readonly sessionApprovals?: () => Promise<ApprovalStatus>
  /** Ticket 042: the model-queue verdict (a pure read; retries never re-submitted here). */
  readonly modelQueue?: () => Promise<ModelQueueStatus>
  /** Ticket 043: the read-only terminal (sessions + bounded scrollback; no write face exists). */
  readonly terminal?: () => Promise<TerminalStatus>
  readonly terminalRead?: (request: { readonly terminalId: string, readonly offset?: number, readonly lines?: number }) => Promise<TerminalReadOutcome>
  /** Ticket 048: the feedback receipts + the two named actions (submit / verify — never resubmit). */
  readonly feedback?: () => FeedbackStatus
  readonly feedbackSubmit?: (request: { readonly action: 'submit', readonly text: string, readonly code?: string, readonly stage?: string, readonly correlation?: string }) => Promise<FeedbackReceiptView>
  readonly feedbackVerify?: (request: { readonly action: 'verify', readonly requestId: string }) => Promise<FeedbackReceiptView>
  readonly sessionApprovalAnswer?: (request: { readonly matterRef: string, readonly requestId: string, readonly outcome: 'allowed-once' | 'rejected' }) => Promise<ApprovalAnswerOutcome>
  readonly sessionApprovalWithdraw?: (request: { readonly matterRef: string, readonly requestId: string }) => Promise<ApprovalWithdrawOutcome>
  /** Ticket 036: sent-message edit versions — save / resend through the session entry / verify. */
  readonly sessionEdits?: () => SessionEditsStatus
  readonly sessionEditsSave?: (request: { readonly action: 'save', readonly messageRef: string, readonly text: string }) => SessionEditSaveOutcome
  readonly sessionEditsResend?: (request: { readonly action: 'resend', readonly editId: string, readonly workspaceRoot?: string }) => Promise<SessionEditResendOutcome>
  readonly sessionEditsVerify?: (request: { readonly action: 'verify', readonly editId: string }) => Promise<SessionEditVerifyOutcome>
  /** Ticket 035: message anchors — the rail read plus one run's locate (pure page reads). */
  readonly sessionAnchors?: () => SessionAnchorsStatus
  readonly sessionAnchorsRead?: (request: { readonly action: 'read' }) => Promise<SessionAnchorListOutcome>
  readonly sessionAnchorLocate?: (request: { readonly action: 'locate', readonly runSeq: number }) => Promise<SessionAnchorLocateOutcome>
  /** Ticket 033: preview layout switch + the controlled external-link entry + typed tool results. */
  readonly artifactFullscreen?: (request: { readonly on: boolean }) => ArtifactFullscreenOutcome
  /** Ticket 044: the separate preview window (explicit actions only; same loaded version). */
  readonly artifactWindowOpen?: () => Promise<ArtifactWindowOutcome>
  readonly artifactWindowClose?: () => ArtifactWindowOutcome
  readonly externalLinkOpen?: (raw: string) => Promise<ExternalLinkOutcome>
  readonly toolResults?: () => ToolResultsStatus
  /** Ticket 021: the read-only search over local matters and base session content. */
  readonly search?: (request: { readonly query: string }) => Promise<SearchOutcome>
  /** Ticket 022: the action-need-partitioned matter list, derived in main on every read. */
  readonly matterList?: () => MatterListState
  /** Ticket 024: the current matter's side chats and their four acts. */
  readonly sideChats?: () => SideChatsStatus
  readonly sideChatCreate?: (request: { readonly matterRef: string }) => Promise<SideChatCreateOutcome>
  readonly sideChatSend?: (request: { readonly sideChatId: string, readonly text: string }) => Promise<SideChatSendOutcome>
  readonly sideChatRead?: (request: { readonly sideChatId: string }) => Promise<SideChatReadOutcome>
  readonly sideChatReturn?: (request: { readonly sideChatId: string, readonly text: string }) => Promise<SideChatReturnOutcome>
  /** Ticket 027: matter edit drafts over adopted-workspace files — view + five acts. */
  readonly editDrafts?: () => EditDraftStatus
  readonly editDraftCreate?: (request: { readonly referenceId: string, readonly matterRef: string }) => Promise<EditDraftCreateOutcome>
  readonly editDraftUpdate?: (request: { readonly draftId: string, readonly proposedText: string }) => EditDraftUpdateOutcome
  readonly editDraftDiff?: (request: { readonly draftId: string }) => Promise<EditDraftDiffOutcome>
  readonly editDraftPrepareWriteback?: (request: { readonly draftId: string }) => Promise<EditDraftPrepareWritebackOutcome>
  readonly editDraftWriteback?: (request: { readonly draftId: string, readonly confirmationId?: string }) => Promise<EditDraftWritebackOutcome>
  /** Ticket 028: action items, their records and the linked corrections (view + five acts). */
  readonly actionItems?: () => ActionItemsStatus
  readonly actionItemCreate?: (request: { readonly matterRef: string, readonly title: string, readonly note?: string }) => ActionItemOutcome
  readonly actionItemUpdate?: (request: { readonly actionId: string, readonly title?: string, readonly note?: string }) => ActionItemOutcome
  readonly actionItemStart?: (request: { readonly actionId: string }) => ActionItemOutcome
  readonly actionItemComplete?: (request: { readonly actionId: string }) => ActionItemOutcome
  readonly correctionCreate?: (request: { readonly matterRef: string, readonly workspaceRoot: string, readonly originalText: string, readonly originalAt?: string, readonly text: string }) => Promise<CorrectionOutcome>
  /** Ticket 028: the project grouping (create / assign / unassign); read via the same slot. */
  readonly projects?: () => ProjectsStatus
  readonly projectCreate?: (request: { readonly name: string }) => ProjectOutcome
  readonly projectAssign?: (request: { readonly matterRef: string, readonly projectRef: string }) => ProjectOutcome
  readonly projectUnassign?: (request: { readonly matterRef: string }) => ProjectOutcome
  /** Ticket 029: matter administration — archive/restore/batch/rename (view via the same slot). */
  readonly matterAdmin?: () => MatterAdminStatus
  readonly matterAdminArchive?: (request: { readonly matterRef: string, readonly ground: 'completed' | 'stopped' }) => MatterAdminOutcome
  readonly matterAdminRestore?: (request: { readonly matterRef: string }) => MatterAdminOutcome
  readonly matterAdminBatch?: (request: { readonly operation: 'archive' | 'restore', readonly targets: readonly string[], readonly ground?: 'completed' | 'stopped' }) => MatterBatchResult
  readonly matterAdminRename?: (request: { readonly matterRef: string, readonly title: string }) => MatterRenameResult
  readonly matterGroups?: () => MatterGroupsStatus
  readonly matterGroupsCreate?: (request: { readonly name: string, readonly targets?: readonly string[] }) => MatterGroupsOutcome
  readonly matterGroupsRename?: (request: { readonly groupId: string, readonly name: string }) => MatterGroupsOutcome
  readonly matterGroupsRemove?: (request: { readonly groupId: string }) => MatterGroupsOutcome
  readonly matterGroupsAssign?: (request: { readonly groupId: string, readonly operation: 'add' | 'remove', readonly targets: readonly string[] }) => MatterGroupsOutcome
  /** Ticket 031: the run monitor (four axes from the session projection) + the run-log read. */
  readonly runMonitor?: () => Promise<RunMonitorView>
  readonly runLogRead?: (request: { readonly workspaceRoot: string, readonly path: string, readonly fromLine?: number, readonly expectVersion?: string, readonly expectBytes?: number }) => Promise<RunLogOutcome>
  /** Ticket 032: the plan deliverable + the two-stage step dispatch. */
  readonly plans?: () => PlansStatus
  readonly planCreate?: (request: { readonly matterRef: string, readonly title: string, readonly steps: readonly string[] }) => PlanOutcome
  readonly planAccept?: (request: { readonly planId: string }) => PlanOutcome
  readonly planPrepareStep?: (request: { readonly planId: string, readonly stepNo: number }) => PlanStepOutcome
  readonly planExecuteStep?: (request: { readonly planId: string, readonly stepNo: number, readonly confirmationId?: string }) => Promise<PlanStepExecuteOutcome>
  /** Ticket 046: the eleven leaf rows, already classified by main. */
  readonly settingsLeaves?: () => readonly SettingsLeaf[]
  /** Ticket 020/047: the device preferences read + save halves (eight items, one record). */
  readonly preferences?: () => PreferencesStatus
  readonly preferencesSave?: (request: Partial<PreferencesStatus['requested']>) => PreferencesStatus | undefined
  /** Ticket 006: stop/resume and the pending-item edits. */
  readonly sessionStop?: (request: { readonly matterRef: string }) => Promise<SessionControlOutcome>
  readonly sessionResume?: (request: { readonly matterRef: string, readonly workspaceRoot: string }) => Promise<SessionControlOutcome>
  readonly pendingUpdate?: (request: { readonly action: 'edit', readonly itemId: string, readonly text: string } | { readonly action: 'remove', readonly itemId: string }, matterRef: string) => { readonly ok: boolean, readonly code?: string }
  /** Ticket 008: queue-item edit/remove; absent keeps an honest refusal. */
  readonly queueItemUpdate?: (request: { readonly action: 'edit', readonly itemId: string, readonly text: string } | { readonly action: 'remove', readonly itemId: string }) => QueueItemOutcome | Promise<QueueItemOutcome>
  /** Ticket 003: the two halves of the attempt bookkeeping — open/close it, and ask the custodian. */
  readonly draftBeginAttempt?: (request: { readonly draftId: string, readonly correlation: string }) => void
  readonly draftNoteAttempt?: (request: { readonly draftId: string, readonly correlation: string, readonly state: 'unknown' | 'failed' }) => void
  readonly draftCancelAttempt?: (request: { readonly draftId: string }) => DraftStatus | undefined
  /** Ask the same request what happened. Absent → the answer stays unknown (never auto-settled). */
  readonly reconcileDraftCreation?: (request: { readonly draftId: string, readonly correlation: string }) =>
    | { readonly state: 'settled', readonly matterRef: string }
    | { readonly state: 'unknown', readonly code: string }
    | { readonly state: 'failed', readonly code: string }
  /** Ticket 011: the Sage-owned link state (associations + trail + defaults), read-only here. */
  readonly matterLinks?: () => MatterLinkState
  /** The actor is main's to name (it is the side that knows which session asked). */
  readonly matterLinkApply?: (request: { readonly action: 'link' | 'unlink' | 'set-default', readonly matterRef: string, readonly workspaceRef?: string }) => MatterLinkState | Promise<MatterLinkState> | undefined
  /** Ticket 011: re-verify the matter's default environment right before a dispatch. Returning a
   *  refusal blocks that dispatch; the pipeline is not reached at all. */
  readonly verifyEnvironment?: (request: { readonly intent: SageDispatchIntent }) => { readonly ok: true } | { readonly ok: false, readonly code: 'environment-unavailable' } | Promise<{ readonly ok: true } | { readonly ok: false, readonly code: 'environment-unavailable' }>
  /** Ticket 025: the single-card pre-execution confirmation (US-124~128). Absent keeps every
   *  dispatch path at its pre-025 shape; present makes a valid, unconsumed confirmation the
   *  necessary condition for each external-effect dispatch (the retry probe is not one). */
  readonly actionConfirmations?: ActionConfirmationsWiring
}

/** The custody intent a confirmed draft produces; one home so prepare and convert fingerprint
 *  the exact same action (ticket 025). */
function conversionIntent(request: DraftConversionRequest): SageActionIntentV2 {
  return {
    matterId: request.matterId,
    revisionId: request.revisionId,
    actionType: 'create-matter',
    actionScope: 'revision',
    payload: request.payload,
    origin: 'renderer-action',
  }
}

/** Readiness denials: a missing provider, not a refused action. Their `retryable:true` means
 * "ask again once the prerequisite exists", never "fire the same action again now" (US-120/121). */
const NOT_READY_CODES: ReadonlySet<string> = new Set([
  'identity-unavailable',
  'compatibility-unknown',
  'registry-unavailable',
  'capability-unavailable',
  'persistence-unavailable',
  // Ticket 011: the matter's chosen environment is gone or unlinked. The dispatch is blocked and
  // the surface prompts — nothing slides to another workspace.
  'environment-unavailable',
])

/** Classify one pipeline result for the surface. Unknown is its own state because the shell cannot
 * tell whether the effect happened, and must offer 核对 rather than a replay. */
function commandStatus(result: CommandResult): ServiceCommandStatus {
  if ('receiptRef' in result || 'availability' in result) {
    return { correlation: result.correlation, outcome: 'settled', code: null, retryable: false }
  }
  const outcome: ServiceCommandOutcome = result.code === 'outcome-unknown'
    ? 'unknown'
    : NOT_READY_CODES.has(result.code) ? 'not-ready' : 'failed'
  return { correlation: result.correlation, outcome, code: result.code, retryable: result.retryable }
}

/** Route one session-core mutation through the asynchronous authority entry. This slice has no
 * dispatch port by construction, so even a complete pre-dispatch test harness cannot reach a raw
 * session provider through the product service. */
type SessionCoreProtectedEffectOperation =
  | 'session.send'
  | 'session.stop'
  | 'session.resume'
  | 'session.pending.edit'
  | 'session.pending.remove'
  | 'session.queue.edit'
  | 'session.queue.remove'
  | 'session.clarification.answer'
  | 'session.edits.save'
  | 'session.edits.resend'
  | 'session.edits.verify'
  | 'session.plan-mode.switch'
  | 'session.approval.answer'
  | 'session.approval.withdraw'
  | 'session.correction.submit'
  | 'session.attachment.upload'
  | 'session.attachment.cancel'

async function admitSessionCoreProtectedEffect(
  options: ServiceOptions,
  operation: SessionCoreProtectedEffectOperation,
  candidate: SessionCoreProtectedEffectCandidate,
  payload: Readonly<Record<string, unknown>>,
): Promise<ProtectedEffectAdmissionResult> {
  const correlation = options.protectedEffectCorrelation?.() ?? randomUUID()
  return admitProtectedEffect({
    intent: {
      family: 'session-core',
      requestId: correlation,
      operation,
      candidate,
      payload,
    },
    correlation,
    ports: options.protectedEffectPorts ?? {},
  })
}

function protectedEffectFailureCode(result: ProtectedEffectAdmissionResult): string {
  return result.state === 'dispatched' ? 'protected-effect-outcome-unknown' : result.code
}

/** Ticket 030: classify the main-observed roster once. A failed row keeps its own state and loses
 *  the base's free text — the surface receives a code it owns wording for (no paths or secrets). */
function capabilityStatus(observation: RuntimeEffectiveObservation | undefined): CapabilityStatus {
  const external = { state: 'not-wired' as const, reason: 'capability-registry-unavailable' as const }
  if (observation === undefined) {
    return { source: 'runtime-effective', observed: false, reason: 'observation-not-read', agentPresets: [], external }
  }
  if (observation.kind === 'unavailable') {
    return { source: 'runtime-effective', observed: false, reason: observation.reason, agentPresets: [], external }
  }
  return {
    source: 'runtime-effective',
    observed: true,
    reason: null,
    agentPresets: observation.presets.map((preset) => preset.broken === undefined
      ? { id: preset.id, state: 'enabled' as const, reason: null }
      : { id: preset.id, state: 'configured-not-enabled' as const, reason: 'preset-failed-to-activate' as const }),
    external,
  }
}

export function createUnavailableFirstService(runtime: SageViewState | null, options: ServiceOptions = {}): ServiceProviders {
  const snapshot = options.authSnapshot ?? (() => ({ status: 'signed-out' as const, displayName: null }))
  let lastCommand: ServiceCommandStatus | null = null
  let lastAdoption: WorkspaceAdoptOutcome | null = null
  let lastMutation: WorkspaceMutationOutcome | null = null
  let lastCandidates: FileCandidateStatus | null = null
  let lastReferenceUse: FileReferenceUse | null = null
  // Ticket 026: an unassembled readout says so in its own fields rather than showing empty rows.
  const fallbackReadout: ReadoutState = {
    visibility: { organizationRef: null, organizationNote: 'policy-unreadable', responsiblePartyRoleRef: null, matterNote: 'projection-absent' },
    plugins: { state: 'unavailable', code: 'inventory-not-read', components: [], observation: { loaderPhase: null, runtimeGeneration: null, bootIdShort: null } },
    knowledge: { state: 'not-wired', reason: 'knowledge-store-unavailable' },
    diagnostics: { harnessVersion: null, protocolVersion: null, profileGeneration: null, manifestSha256Short: null, manifestVerified: false, dataRoot: '', lastError: null },
  }
  return {
    ...(options.runProjectionRead === undefined ? {} : { runProjectionRead: options.runProjectionRead }),
    // T02: without the main-assembled runner the local-system route answers its stable denial —
    // never a synthesized runtime/auth/display fact.
    bootstrapRead: options.bootstrapRead ?? (async (): Promise<Response> => serviceJson({
      code: 'bootstrap-unavailable',
      stage: 'local-system',
      retryable: true,
      correlation: randomUUID(),
    }, 200)),
    devicePreferencesRead: options.devicePreferencesRead ?? (async (): Promise<Response> => serviceJson({
      code: 'device-preferences-unavailable',
      stage: 'local-system',
      retryable: true,
      correlation: randomUUID(),
    }, 200)),
    async readBlockedState(): Promise<Response> {
      return serviceJson({
        code: 'projection-read-unavailable',
        stage: 'read-policy',
        retryable: true,
        correlation: randomUUID(),
      }, 200)
    },
    async readState(): Promise<Response> {
      const snap = snapshot()
      const modelConfigRead = options.modelConfig?.()
      const modelConfig = modelConfigRead === undefined
        ? { source: 'settings-describe' as const, state: 'unavailable' as const, reason: 'not-read' as const, writable: null, hasDocument: null, namespaces: [], connectivityTest: 'untested' as const }
        : await modelConfigRead
      const state: SageServiceState = {
        service: {
          status: 'unavailable',
          // Spec §6: identity established once a session exists (signed-in) or is being established (pending).
          reason: snap.status === 'signed-out' ? 'identity-unavailable' : 'authenticated',
          auth: { status: snap.status, displayName: snap.displayName },
          correlation: randomUUID(),
          command: lastCommand,
        },
        activeContext: options.activeMatterContext?.()
          ?? { state: 'unavailable' as const, contextGeneration: null },
        matter: options.fixtureProjection?.() ?? null,
        capability: capabilityStatus(options.runtimeEffective?.()),
        modelConfig,
        workspaceAdoption: lastAdoption,
        workspaces: await (options.workspaceList?.() ?? Promise.resolve({
          source: 'workspace-follow' as const, state: 'unavailable' as const, reason: 'not-read' as const,
          entries: [], order: [], archivedSessions: 0, frames: 0, unapplied: 0,
        })),
        workspaceMutation: lastMutation,
        fileCandidates: lastCandidates,
        fileReferences: options.fileReferences?.() ?? [],
        fileReferenceUse: lastReferenceUse,
        readout: options.readout?.({ lastCommand }) ?? fallbackReadout,
        draft: options.draftList?.() ?? { state: 'unavailable' as const, drafts: [] },
        matterLinks: options.matterLinks?.() ?? { state: 'unavailable' as const, links: [], trail: [] },
        settingsLeaves: options.settingsLeaves?.() ?? [],
        preferences: options.preferences?.() ?? { requested: DEFAULT_DISPLAY_PREFERENCE_VALUES, savedAt: null, effectiveTheme: null, systemDark: null, applies: 'live' },
        attachments: options.attachments?.() ?? { state: 'unavailable' as const, items: [] },
        artifacts: options.artifacts?.() ?? { state: 'unavailable' as const, cards: [], preview: { state: 'closed' as const } },
        toolResults: options.toolResults?.() ?? { state: 'unavailable' as const, reason: 'tool-results-provider-unavailable' },
        sessionHistory: options.sessionHistory?.() ?? { state: 'unavailable' as const, runs: [], hasMore: false, nextBeforeSeq: null, detail: null, at: null },
        sessionClarifications: await (options.sessionClarifications?.() ?? Promise.resolve({ state: 'unavailable' as const, pending: [], deferred: [], receipts: [], code: null, at: null })),
        sessionAnchors: options.sessionAnchors?.() ?? { state: 'unavailable' as const, anchors: [], located: null, code: null, at: null },
        sessionEdits: options.sessionEdits?.() ?? { state: 'read' as const, records: [], code: null, at: null },
        inputSelections: await (options.inputSelections?.() ?? Promise.resolve({ state: 'unavailable' as const, skills: [], skillsNote: null, plugins: [], pluginsNote: null, selected: [], code: 'input-selections-unavailable', at: null })),
        sessionPlanMode: await (options.sessionPlanMode?.() ?? Promise.resolve({ state: 'unavailable' as const, reason: 'plan-mode-provider-unavailable', active: null, pending: false })),
        siteTemplates: await (options.siteTemplates?.() ?? Promise.resolve({ state: 'unavailable' as const, reason: 'site-templates-provider-unavailable', entries: [] })),
        sessionApprovals: await (options.sessionApprovals?.() ?? Promise.resolve({ state: 'unavailable' as const, pending: [], lapsed: [], receipts: [], code: 'approval-relay-unavailable', at: null })),
        modelQueue: await (options.modelQueue?.() ?? Promise.resolve({ state: 'unavailable' as const, verdict: 'idle' as const, retries: [], verifyOnly: false, reason: 'model-queue-provider-unavailable', at: null })),
        terminal: await (options.terminal?.() ?? Promise.resolve({ state: 'unavailable' as const, reason: 'terminals-provider-unavailable', terminals: [] })),
        feedback: options.feedback?.() ?? { state: 'read' as const, receipts: [] },
        matterList: options.matterList?.() ?? { state: 'unavailable' as const, code: 'matter-list-unavailable', items: [], counts: { action: 0, inProgress: 0, acceptance: 0 } },
        sideChats: options.sideChats?.() ?? { state: 'unavailable' as const, code: 'side-chat-unavailable', items: [] },
        editDrafts: options.editDrafts?.() ?? { state: 'unavailable' as const, drafts: [] },
        actionItems: options.actionItems?.() ?? { state: 'unavailable' as const, items: [], corrections: [] },
        projects: options.projects?.() ?? { state: 'unavailable' as const, projects: [], trail: [] },
        matterAdmin: options.matterAdmin?.() ?? { state: 'unavailable' as const, entries: [], trail: [], rename: null, batch: null },
        matterGroups: options.matterGroups?.() ?? { state: 'unavailable' as const, code: 'matter-groups-unavailable', groups: [], trail: [], rename: null, batch: null },
        runMonitor: (await options.runMonitor?.()) ?? { state: 'unavailable' as const, matterRef: null, steps: { state: 'unavailable' as const, lastTurnEnd: null, observedRecords: 0, reason: 'monitor-not-read' }, budget: { reserved: { state: 'unknown' as const, reason: 'usage-provider-unavailable' as const }, consumed: { state: 'unknown' as const, reason: 'usage-provider-unavailable' as const }, billed: { state: 'unknown' as const, reason: 'usage-provider-unavailable' as const } }, device: { state: 'unknown' as const, reason: 'device-binding-unavailable' as const }, background: { state: 'unknown' as const, reason: 'background-host-unavailable' as const }, context: { state: 'unknown' as const, reason: 'context-usage-unavailable' as const, compaction: 'unknown' as const } },
        plans: options.plans?.() ?? { state: 'unavailable' as const, plans: [], lastStepRun: null },
        sessionChannel: await (options.sessionChannel?.() ?? Promise.resolve({
          state: 'unavailable' as const, sessionId: null, execution: 'idle' as const, lastTurnEnd: null,
          reply: { text: null, endKind: null, failed: false, actions: [] },
          transcript: [], reconciled: false, streamBroken: false, code: null, records: 0, unapplied: 0,
          paused: false, pending: [],
          queue: { state: 'unavailable' as const, occurrences: [] },
        })),
        runtime,
      }
      return serviceJson(state, 200)
    },
    async selectActiveMatter(request: ActiveMatterSelectionRequest): Promise<Response> {
      const select = options.selectActiveMatter
      const outcome: ActiveMatterSelectionOutcome = select === undefined
        ? { state: 'refused', code: 'active-context-unavailable', retryable: true }
        : await select(request).catch((): ActiveMatterSelectionOutcome => ({
            state: 'refused',
            code: 'active-context-unavailable',
            retryable: true,
          }))
      return serviceJson(outcome, 200)
    },
    async adoptWorkspace(): Promise<Response> {
      const adopt = options.adoptWorkspace
      // No adoption provider is a refusal with its own code — never a silent "nothing happened".
      let outcome: WorkspaceAdoptOutcome = adopt === undefined
        ? { state: 'refused', code: 'workspace-adoption-unavailable' }
        : { state: 'refused', code: 'workspace-adoption-failed' }
      if (adopt !== undefined) {
        try {
          outcome = await adopt()
        } catch {
          outcome = { state: 'refused', code: 'workspace-adoption-failed' }
        }
      }
      lastAdoption = outcome
      return serviceJson(outcome, 200)
    },
    async mutateWorkspace(request: WorkspaceMutationRequest): Promise<Response> {
      const mutate = options.mutateWorkspace
      // No mutation provider is a refusal with its own code — never a silent "nothing happened".
      let outcome: WorkspaceMutationOutcome = { state: 'refused', kind: request.kind, code: 'workspace-mutation-unavailable' }
      if (mutate !== undefined) {
        try {
          outcome = await mutate(request)
        } catch {
          outcome = { state: 'refused', kind: request.kind, code: 'workspace-mutation-failed' }
        }
      }
      lastMutation = outcome
      return serviceJson(outcome, 200)
    },
    async listFileCandidates(request): Promise<Response> {
      const provider = options.listFileCandidates
      const outcome: FileCandidateStatus = provider === undefined
        ? { state: 'refused', code: 'file-candidates-unavailable', entries: [], truncated: false, path: '' }
        : await provider(request).catch((): FileCandidateStatus => ({ state: 'refused', code: 'file-candidates-failed', entries: [], truncated: false, path: '' }))
      lastCandidates = outcome
      return serviceJson(outcome, 200)
    },
    async createFileReference(request): Promise<Response> {
      const provider = options.createFileReference
      const outcome: FileReferenceOutcome = provider === undefined
        ? { state: 'refused', code: 'file-reference-unavailable', reference: null }
        : await provider(request).catch((): FileReferenceOutcome => ({ state: 'refused', code: 'file-reference-failed', reference: null }))
      return serviceJson(outcome, 200)
    },
    async useFileReference(request): Promise<Response> {
      const provider = options.useFileReference
      const outcome: FileReferenceUse = provider === undefined
        ? { state: 'unknown', code: 'file-reference-unavailable', reference: null, text: null }
        : await provider(request).catch((): FileReferenceUse => ({ state: 'unknown', code: 'file-reference-failed', reference: null, text: null }))
      lastReferenceUse = outcome
      return serviceJson(outcome, 200)
    },
    async createDraft(request: { readonly rawInput: string }): Promise<Response> {
      const gate = options.draftCreate?.(request)
      return serviceJson(gate ?? { state: 'unavailable' as const, drafts: [] }, 200)
    },
    async updateDraft(request): Promise<Response> {
      const gate = options.draftUpdate?.(request)
      return serviceJson(gate ?? { state: 'unavailable' as const, drafts: [] }, 200)
    },
    async convertDraft(request: { readonly draftId: string, readonly confirmationId?: string }): Promise<Response> {
      const prepare = options.draftPrepareConversion
      if (prepare === undefined) {
        return serviceJson({ state: 'refused', draftId: request.draftId, code: 'draft-unavailable' } satisfies DraftConvertOutcome, 200)
      }
      const prepared = prepare(request)
      if (prepared.state !== 'ready') {
        return serviceJson({ state: 'refused', draftId: prepared.state === 'missing' ? null : request.draftId, code: `draft-${prepared.state}` } satisfies DraftConvertOutcome, 200)
      }
      // The conversion runs the same pipeline every command runs: identity → authorization → the
      // creation branch → the custody port. Nothing here short-circuits a step (ADR-0190/0201).
      const command = conversionIntent(prepared.request)
      // Ticket 025: the single-card confirmation is this dispatch's necessary condition. Missing,
      // changed (fields included) or already-spent denies here — before an attempt is opened.
      if (options.actionConfirmations !== undefined) {
        const verdict = options.actionConfirmations.store.consume(command, request.confirmationId, options.actionConfirmations.facts(command))
        if (!verdict.ok) {
          return serviceJson({ state: 'denied', draftId: request.draftId, code: verdict.code, stage: 'confirmation', retryable: false } satisfies DraftConvertOutcome, 200)
        }
      }
      const correlation = randomUUID()
      // The attempt is opened before anything runs, so a crash between here and the answer still
      // leaves "this request exists and its result is not known" on disk (US-005).
      options.draftBeginAttempt?.({ draftId: prepared.request.draftId, correlation })
      const result = runCommand({ intent: command, correlation, ports: options.commandPorts ?? PRODUCTION_FAIL_CLOSED_PORTS })
      lastCommand = commandStatus(result)
      if ('receiptRef' in result) {
        options.draftCommitConversion?.({ draftId: prepared.request.draftId, matterRef: result.receiptRef })
        return serviceJson({ state: 'converted', draftId: prepared.request.draftId, matterRef: result.receiptRef } satisfies DraftConvertOutcome, 200)
      }
      if ('availability' in result) {
        options.draftNoteAttempt?.({ draftId: prepared.request.draftId, correlation, state: 'failed' })
        return serviceJson({ state: 'refused', draftId: prepared.request.draftId, code: 'outcome-unknown' } satisfies DraftConvertOutcome, 200)
      }
      if (result.code === 'outcome-unknown') {
        options.draftNoteAttempt?.({ draftId: prepared.request.draftId, correlation, state: 'unknown' })
        return serviceJson({ state: 'unknown', draftId: prepared.request.draftId, correlation } satisfies DraftConvertOutcome, 200)
      }
      options.draftNoteAttempt?.({ draftId: prepared.request.draftId, correlation, state: 'failed' })
      return serviceJson({ state: 'denied', draftId: prepared.request.draftId, code: result.code, stage: result.stage, retryable: result.retryable } satisfies DraftConvertOutcome, 200)
    },
    async prepareDraftConfirmation(request: { readonly draftId: string }): Promise<Response> {
      const confirmations = options.actionConfirmations
      if (confirmations === undefined) {
        return serviceJson({ state: 'refused', draftId: request.draftId, code: 'confirmation-unavailable' } satisfies DraftConfirmationOutcome, 200)
      }
      const prepare = options.draftPrepareConversion
      if (prepare === undefined) {
        return serviceJson({ state: 'refused', draftId: request.draftId, code: 'draft-unavailable' } satisfies DraftConfirmationOutcome, 200)
      }
      const prepared = prepare(request)
      if (prepared.state !== 'ready') {
        return serviceJson({ state: 'refused', draftId: prepared.state === 'missing' ? null : request.draftId, code: `draft-${prepared.state}` } satisfies DraftConfirmationOutcome, 200)
      }
      // Same builder as convertDraft: the card describes exactly the intent the convert will
      // rebuild, so a field change in between is a fingerprint change, not a silent swap.
      const command = conversionIntent(prepared.request)
      const card = confirmations.store.prepare(command, confirmations.facts(command))
      return serviceJson({ state: 'prepared', draftId: request.draftId, card } satisfies DraftConfirmationOutcome, 200)
    },
    async reconcileDraft(request: { readonly draftId: string }): Promise<Response> {
      const ask = options.reconcileDraftCreation
      const draft = options.draftList?.().drafts.find((entry) => entry.draftId === request.draftId)
      const correlation = draft?.attempt?.correlation
      if (ask === undefined || correlation === undefined) {
        // Nothing to ask or nobody to ask: the answer is unknown, and unknown never settles itself.
        return serviceJson({ state: 'unknown', draftId: request.draftId, code: ask === undefined ? 'reconcile-unavailable' : 'no-open-attempt' } satisfies DraftReconcileOutcome, 200)
      }
      const answer = await ask({ draftId: request.draftId, correlation })
      if (answer.state === 'settled') {
        options.draftCommitConversion?.({ draftId: request.draftId, matterRef: answer.matterRef })
        return serviceJson({ state: 'settled', draftId: request.draftId, matterRef: answer.matterRef } satisfies DraftReconcileOutcome, 200)
      }
      if (answer.state === 'failed') options.draftNoteAttempt?.({ draftId: request.draftId, correlation, state: 'failed' })
      return serviceJson(answer.state === 'failed'
        ? { state: 'failed', draftId: request.draftId, code: answer.code } satisfies DraftReconcileOutcome
        : { state: 'unknown', draftId: request.draftId, code: answer.code } satisfies DraftReconcileOutcome, 200)
    },
    async cancelDraftConfirm(request: { readonly draftId: string }): Promise<Response> {
      const gate = options.draftCancelAttempt?.(request)
      return serviceJson(gate ?? { state: 'unavailable' as const, drafts: [] }, 200)
    },
    async dispatch(intent: SageDispatchIntent, confirmationId?: string): Promise<Response> {
      // Ticket 011: the chosen execution environment is verified per dispatch, before anything
      // else runs. A missing default blocks this command; it never falls back to another workspace.
      const environment = await options.verifyEnvironment?.( { intent } )
      if (environment !== undefined && !environment.ok) {
        const denial: CommandDenied = {
          code: environment.code,
          stage: 'environment',
          retryable: true,
          correlation: randomUUID(),
        }
        lastCommand = commandStatus(denial)
        return serviceJson(denial, 200)
      }
      // Ticket 025: every external-effect dispatch needs its single pre-execution confirmation,
      // consumed exactly once and re-checked against fresh facts right here (US-125/126). The
      // transport retry probe has no external effect and never walks this gate.
      if (!('type' in intent) && options.actionConfirmations !== undefined) {
        const verdict = options.actionConfirmations.store.consume(intent, confirmationId, options.actionConfirmations.facts(intent))
        if (!verdict.ok) {
          const denial: CommandDenied = {
            code: verdict.code,
            stage: 'confirmation',
            retryable: false,
            correlation: randomUUID(),
          }
          lastCommand = commandStatus(denial)
          return serviceJson(denial, 200)
        }
      }
      const result = runCommand({
        intent,
        correlation: randomUUID(),
        ports: options.commandPorts ?? PRODUCTION_FAIL_CLOSED_PORTS,
      })
      lastCommand = commandStatus(result)
      return serviceJson(result, 'code' in result && result.code === 'invalid-intent' ? 400 : 200)
    },
    async prepareActionConfirmation(intent: SageActionIntentV2): Promise<Response> {
      const confirmations = options.actionConfirmations
      if (confirmations === undefined) {
        return serviceJson({ state: 'refused', code: 'confirmation-unavailable' } satisfies ActionConfirmationPrepareOutcome, 200)
      }
      const card = confirmations.store.prepare(intent, confirmations.facts(intent))
      return serviceJson({ state: 'prepared', card } satisfies ActionConfirmationPrepareOutcome, 200)
    },
    async sendSessionPrompt(request: { readonly matterRef: string, readonly workspaceRoot: string, readonly text: string, readonly mode?: 'queue' | 'steer' }): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        'session.send',
        { kind: 'matter', matterRef: request.matterRef },
        { text: request.text, ...(request.mode === undefined ? {} : { mode: request.mode }) },
      )
      const outcome: SessionSendOutcome = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
      }
      return serviceJson(outcome, 200)
    },
    async savePreferences(request): Promise<Response> {
      const save = options.preferencesSave
      const saved = save?.(request)
      if (saved === undefined) {
        return serviceJson({ state: 'refused', code: save === undefined ? 'preferences-unavailable' : 'preferences-write-failed' } satisfies PreferencesSaveOutcome, 200)
      }
      return serviceJson({ state: 'saved', preferences: saved } satisfies PreferencesSaveOutcome, 200)
    },
    async stopSession(request: { readonly matterRef: string }): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        'session.stop',
        { kind: 'matter', matterRef: request.matterRef },
        {},
      )
      const outcome: SessionControlOutcome = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
        paused: false,
        drained: [],
        consumed: [],
        dispatched: [],
      }
      return serviceJson(outcome, 200)
    },
    async resumeSession(request: { readonly matterRef: string, readonly workspaceRoot: string }): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        'session.resume',
        { kind: 'matter', matterRef: request.matterRef },
        {},
      )
      const outcome: SessionControlOutcome = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
        paused: false,
        drained: [],
        consumed: [],
        dispatched: [],
      }
      return serviceJson(outcome, 200)
    },
    async updatePendingInput(request): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        request.action === 'edit' ? 'session.pending.edit' : 'session.pending.remove',
        { kind: 'active-session' },
        request.action === 'edit'
          ? { itemId: request.itemId, text: request.text }
          : { itemId: request.itemId },
      )
      const outcome = { ok: false, code: protectedEffectFailureCode(admission) }
      return serviceJson(outcome, 200)
    },
    async sessionHistoryList(request: { readonly beforeSeq?: number }): Promise<Response> {
      const run = options.sessionHistoryList
      const outcome: SessionRunListOutcome = run === undefined
        ? { state: 'refused', code: 'session-history-unavailable' }
        : await run(request).catch((): SessionRunListOutcome => ({ state: 'refused', code: 'session-history-failed' }))
      return serviceJson(outcome, 200)
    },
    async sessionHistoryDetail(request: { readonly runSeq: number }): Promise<Response> {
      const run = options.sessionHistoryDetail
      const outcome: SessionRunDetailOutcome = run === undefined
        ? { state: 'missing', runSeq: request.runSeq, code: 'session-history-unavailable' }
        : await run(request).catch((): SessionRunDetailOutcome => ({ state: 'missing', runSeq: request.runSeq, code: 'session-history-failed' }))
      return serviceJson(outcome, 200)
    },
    async sessionClarificationAnswer(request: { readonly matterRef: string, readonly requestId: string, readonly answers: readonly unknown[] }): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        'session.clarification.answer',
        { kind: 'matter', matterRef: request.matterRef },
        { requestId: request.requestId, answers: request.answers },
      )
      const outcome: ClarificationAnswerOutcome = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
      }
      return serviceJson(outcome, 200)
    },
    async inputSelectionsSelect(request: { readonly action: 'select', readonly kind: 'skill' | 'plugin', readonly ref: string }): Promise<Response> {
      const select = options.inputSelectionsSelect
      const outcome: InputSelectionOutcome = select === undefined
        ? { state: 'refused', code: 'input-selections-unavailable' }
        : select(request)
      return serviceJson(outcome, 200)
    },
    async inputSelectionsClear(request: { readonly action: 'clear', readonly kind: 'skill' | 'plugin', readonly ref?: string }): Promise<Response> {
      const clear = options.inputSelectionsClear
      const outcome: InputSelectionOutcome = clear === undefined
        ? { state: 'refused', code: 'input-selections-unavailable' }
        : clear(request)
      return serviceJson(outcome, 200)
    },
    async feedbackSubmit(request: { readonly action: 'submit', readonly text: string, readonly code?: string, readonly stage?: string, readonly correlation?: string }): Promise<Response> {
      const submit = options.feedbackSubmit
      const outcome: FeedbackReceiptView = submit === undefined
        ? { state: 'unavailable', requestId: null, at: null, code: 'feedback-sink-unavailable' }
        : await submit(request).catch((): FeedbackReceiptView => ({ state: 'unavailable', requestId: null, at: null, code: 'feedback-submit-failed' }))
      return serviceJson(outcome, 200)
    },
    async feedbackVerify(request: { readonly action: 'verify', readonly requestId: string }): Promise<Response> {
      const verify = options.feedbackVerify
      const outcome: FeedbackReceiptView = verify === undefined
        ? { state: 'unavailable', requestId: null, at: null, code: 'feedback-sink-unavailable' }
        : await verify(request).catch((): FeedbackReceiptView => ({ state: 'not-found', requestId: null, at: null, code: 'feedback-verify-failed' }))
      return serviceJson(outcome, 200)
    },
    async terminalRead(request: { readonly terminalId: string, readonly offset?: number, readonly lines?: number }): Promise<Response> {
      const read = options.terminalRead
      const outcome: TerminalReadOutcome = read === undefined
        ? { state: 'unavailable', code: 'terminals-provider-unavailable' }
        : await read(request).catch((): TerminalReadOutcome => ({ state: 'unavailable', code: 'terminal-read-failed' }))
      return serviceJson(outcome, 200)
    },
    async sessionApprovalAnswer(request: { readonly matterRef: string, readonly requestId: string, readonly outcome: 'allowed-once' | 'rejected' }): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        'session.approval.answer',
        { kind: 'matter', matterRef: request.matterRef },
        { requestId: request.requestId, outcome: request.outcome },
      )
      const outcome: ApprovalAnswerOutcome = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
      }
      return serviceJson(outcome, 200)
    },
    async sessionApprovalWithdraw(request: { readonly matterRef: string, readonly requestId: string }): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        'session.approval.withdraw',
        { kind: 'matter', matterRef: request.matterRef },
        { requestId: request.requestId },
      )
      const outcome: ApprovalWithdrawOutcome = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
      }
      return serviceJson(outcome, 200)
    },
    async sessionPlanModeSwitch(request: { readonly active: boolean }): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        'session.plan-mode.switch',
        { kind: 'active-session' },
        { active: request.active },
      )
      const outcome: PlanModeSwitchReceipt = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
      }
      return serviceJson(outcome, 200)
    },
    async sessionEditsSave(request: { readonly action: 'save', readonly messageRef: string, readonly text: string }): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        'session.edits.save',
        { kind: 'active-session' },
        { messageRef: request.messageRef, text: request.text },
      )
      const outcome: SessionEditSaveOutcome = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
      }
      return serviceJson(outcome, 200)
    },
    async sessionEditsResend(request: { readonly action: 'resend', readonly editId: string, readonly workspaceRoot?: string }): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        'session.edits.resend',
        { kind: 'active-session' },
        { editId: request.editId },
      )
      const outcome: SessionEditResendOutcome = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
      }
      return serviceJson(outcome, 200)
    },
    async sessionEditsVerify(request: { readonly action: 'verify', readonly editId: string }): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        'session.edits.verify',
        { kind: 'active-session' },
        { editId: request.editId },
      )
      const outcome: SessionEditVerifyOutcome = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
      }
      return serviceJson(outcome, 200)
    },
    async sessionAnchorsRead(request: { readonly action: 'read' }): Promise<Response> {
      const read = options.sessionAnchorsRead
      const outcome: SessionAnchorListOutcome = read === undefined
        ? { state: 'unavailable', code: 'session-anchors-unavailable' }
        : await read(request).catch((): SessionAnchorListOutcome => ({ state: 'unavailable', code: 'session-anchors-failed' }))
      return serviceJson(outcome, 200)
    },
    async sessionAnchorLocate(request: { readonly action: 'locate', readonly runSeq: number }): Promise<Response> {
      const locate = options.sessionAnchorLocate
      const outcome: SessionAnchorLocateOutcome = locate === undefined
        ? { state: 'missing', runSeq: request.runSeq, code: 'session-anchors-unavailable' }
        : await locate(request).catch((): SessionAnchorLocateOutcome => ({ state: 'missing', runSeq: request.runSeq, code: 'session-anchors-failed' }))
      return serviceJson(outcome, 200)
    },
    async updateQueueItem(request): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        request.action === 'edit' ? 'session.queue.edit' : 'session.queue.remove',
        { kind: 'active-session' },
        request.action === 'edit'
          ? { itemId: request.itemId, text: request.text }
          : { itemId: request.itemId },
      )
      const outcome: QueueItemOutcome = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
      }
      return serviceJson(outcome, 200)
    },
    async pickAttachments(): Promise<Response> {
      const pick = options.attachmentsPick
      const outcome: AttachmentPickOutcome = pick === undefined
        ? { state: 'refused', code: 'attachment-store-unavailable' }
        : await pick().catch((): AttachmentPickOutcome => ({ state: 'refused', code: 'attachment-pick-failed' }))
      return serviceJson(outcome, 200)
    },
    async uploadAttachment(request: { readonly itemId: string, readonly matterRef: string, readonly workspaceRoot: string }): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        'session.attachment.upload',
        { kind: 'matter', matterRef: request.matterRef },
        { itemId: request.itemId },
      )
      const outcome: AttachmentUploadOutcome = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
      }
      return serviceJson(outcome, 200)
    },
    async cancelAttachment(request: { readonly itemId: string }): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        'session.attachment.cancel',
        { kind: 'active-session' },
        { itemId: request.itemId },
      )
      const outcome: AttachmentControlOutcome = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
      }
      return serviceJson(outcome, 200)
    },
    async observeArtifacts(request: { readonly matterRef: string, readonly workspaceRoot: string }): Promise<Response> {
      const observe = options.artifactsObserve
      const outcome: ArtifactObserveOutcome = observe === undefined
        ? { state: 'refused', code: 'artifact-store-unavailable' }
        : await observe(request).catch((): ArtifactObserveOutcome => ({ state: 'refused', code: 'artifact-observe-failed' }))
      return serviceJson(outcome, 200)
    },
    async openArtifact(request: { readonly artifactId: string }): Promise<Response> {
      const open = options.artifactOpen
      const outcome: ArtifactOpenOutcome = open === undefined
        ? { state: 'refused', code: 'artifact-preview-unavailable' }
        : await open(request).catch((): ArtifactOpenOutcome => ({ state: 'refused', code: 'artifact-open-failed' }))
      return serviceJson(outcome, 200)
    },
    async closeArtifact(): Promise<Response> {
      const close = options.artifactClose
      const outcome: ArtifactCloseOutcome = close === undefined
        ? { state: 'refused', code: 'artifact-preview-unavailable' }
        : await close().catch((): ArtifactCloseOutcome => ({ state: 'refused', code: 'artifact-close-failed' }))
      return serviceJson(outcome, 200)
    },
    async retryArtifact(): Promise<Response> {
      const retry = options.artifactRetry
      const outcome: ArtifactOpenOutcome = retry === undefined
        ? { state: 'refused', code: 'artifact-preview-unavailable' }
        : await retry().catch((): ArtifactOpenOutcome => ({ state: 'refused', code: 'artifact-retry-failed' }))
      return serviceJson(outcome, 200)
    },
    async fullscreenArtifact(request: { readonly on: boolean }): Promise<Response> {
      const run = options.artifactFullscreen
      const outcome: ArtifactFullscreenOutcome = run === undefined
        ? { state: 'refused', code: 'artifact-preview-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async artifactWindowOpen(): Promise<Response> {
      const open = options.artifactWindowOpen
      const outcome: ArtifactWindowOutcome = open === undefined
        ? { state: 'refused', code: 'artifact-window-unavailable' }
        : await open().catch((): ArtifactWindowOutcome => ({ state: 'refused', code: 'artifact-window-failed' }))
      return serviceJson(outcome, 200)
    },
    async artifactWindowClose(): Promise<Response> {
      const close = options.artifactWindowClose
      const outcome: ArtifactWindowOutcome = close === undefined
        ? { state: 'refused', code: 'artifact-window-unavailable' }
        : close()
      return serviceJson(outcome, 200)
    },
    async openExternalLink(request: { readonly url: string }): Promise<Response> {
      const run = options.externalLinkOpen
      const outcome: ExternalLinkOutcome = run === undefined
        ? { state: 'refused', code: 'external-open-unavailable' }
        : await run(request.url).catch((): ExternalLinkOutcome => ({ state: 'refused', code: 'external-open-failed' }))
      return serviceJson(outcome, 200)
    },
    async search(request: { readonly query: string }): Promise<Response> {
      const run = options.search
      const outcome: SearchOutcome = run === undefined
        ? { state: 'refused', code: 'search-unavailable' }
        : await run(request).catch((): SearchOutcome => ({ state: 'refused', code: 'search-failed' }))
      return serviceJson(outcome, 200)
    },
    async createSideChat(request: { readonly matterRef: string }): Promise<Response> {
      const run = options.sideChatCreate
      const outcome: SideChatCreateOutcome = run === undefined
        ? { state: 'refused', code: 'side-chat-unavailable' }
        : await run(request).catch((): SideChatCreateOutcome => ({ state: 'refused', code: 'side-chat-create-failed' }))
      return serviceJson(outcome, 200)
    },
    async sendSideChat(request: { readonly sideChatId: string, readonly text: string }): Promise<Response> {
      const run = options.sideChatSend
      const outcome: SideChatSendOutcome = run === undefined
        ? { state: 'refused', code: 'side-chat-unavailable' }
        : await run(request).catch((): SideChatSendOutcome => ({ state: 'refused', code: 'side-chat-send-failed' }))
      return serviceJson(outcome, 200)
    },
    async readSideChat(request: { readonly sideChatId: string }): Promise<Response> {
      const run = options.sideChatRead
      const outcome: SideChatReadOutcome = run === undefined
        ? { state: 'refused', code: 'side-chat-unavailable' }
        : await run(request).catch((): SideChatReadOutcome => ({ state: 'refused', code: 'side-chat-read-failed' }))
      return serviceJson(outcome, 200)
    },
    async returnSideChat(request: { readonly sideChatId: string, readonly text: string }): Promise<Response> {
      const run = options.sideChatReturn
      const outcome: SideChatReturnOutcome = run === undefined
        ? { state: 'refused', code: 'side-chat-unavailable' }
        : await run(request).catch((): SideChatReturnOutcome => ({ state: 'refused', code: 'side-chat-return-failed' }))
      return serviceJson(outcome, 200)
    },
    async createEditDraft(request: { readonly referenceId: string, readonly matterRef: string }): Promise<Response> {
      const run = options.editDraftCreate
      const outcome: EditDraftCreateOutcome = run === undefined
        ? { state: 'refused', code: 'edit-draft-unavailable' }
        : await run(request).catch((): EditDraftCreateOutcome => ({ state: 'refused', code: 'edit-draft-create-failed' }))
      return serviceJson(outcome, 200)
    },
    async updateEditDraft(request: { readonly draftId: string, readonly proposedText: string }): Promise<Response> {
      const run = options.editDraftUpdate
      const outcome: EditDraftUpdateOutcome = run === undefined
        ? { state: 'refused', code: 'edit-draft-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async diffEditDraft(request: { readonly draftId: string }): Promise<Response> {
      const run = options.editDraftDiff
      const outcome: EditDraftDiffOutcome = run === undefined
        ? { state: 'refused', code: 'edit-draft-unavailable' }
        : await run(request).catch((): EditDraftDiffOutcome => ({ state: 'refused', code: 'edit-draft-diff-failed' }))
      return serviceJson(outcome, 200)
    },
    async prepareEditDraftWriteback(request: { readonly draftId: string }): Promise<Response> {
      const run = options.editDraftPrepareWriteback
      const outcome: EditDraftPrepareWritebackOutcome = run === undefined
        ? { state: 'refused', draftId: request.draftId, code: 'edit-draft-unavailable' }
        : await run(request).catch((): EditDraftPrepareWritebackOutcome => ({ state: 'refused', draftId: request.draftId, code: 'edit-draft-prepare-failed' }))
      return serviceJson(outcome, 200)
    },
    async writebackEditDraft(request: { readonly draftId: string, readonly confirmationId?: string }): Promise<Response> {
      const run = options.editDraftWriteback
      const outcome: EditDraftWritebackOutcome = run === undefined
        ? { state: 'refused', draftId: request.draftId, code: 'edit-draft-unavailable' }
        : await run(request).catch((): EditDraftWritebackOutcome => ({ state: 'refused', draftId: request.draftId, code: 'edit-draft-writeback-failed' }))
      return serviceJson(outcome, 200)
    },
    async createActionItem(request: { readonly matterRef: string, readonly title: string, readonly note?: string }): Promise<Response> {
      const run = options.actionItemCreate
      const outcome: ActionItemOutcome = run === undefined
        ? { state: 'refused', code: 'action-items-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async updateActionItem(request: { readonly actionId: string, readonly title?: string, readonly note?: string }): Promise<Response> {
      const run = options.actionItemUpdate
      const outcome: ActionItemOutcome = run === undefined
        ? { state: 'refused', code: 'action-items-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async startActionItem(request: { readonly actionId: string }): Promise<Response> {
      const run = options.actionItemStart
      const outcome: ActionItemOutcome = run === undefined
        ? { state: 'refused', code: 'action-items-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async completeActionItem(request: { readonly actionId: string }): Promise<Response> {
      const run = options.actionItemComplete
      const outcome: ActionItemOutcome = run === undefined
        ? { state: 'refused', code: 'action-items-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async submitCorrection(request: { readonly matterRef: string, readonly workspaceRoot: string, readonly originalText: string, readonly originalAt?: string, readonly text: string }): Promise<Response> {
      const admission = await admitSessionCoreProtectedEffect(
        options,
        'session.correction.submit',
        { kind: 'matter', matterRef: request.matterRef },
        {
          originalText: request.originalText,
          ...(request.originalAt === undefined ? {} : { originalAt: request.originalAt }),
          text: request.text,
        },
      )
      const outcome: CorrectionOutcome = {
        state: 'refused',
        code: protectedEffectFailureCode(admission),
      }
      return serviceJson(outcome, 200)
    },
    async createProject(request: { readonly name: string }): Promise<Response> {
      const run = options.projectCreate
      const outcome: ProjectOutcome = run === undefined
        ? { state: 'refused', code: 'projects-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async assignProject(request: { readonly matterRef: string, readonly projectRef: string }): Promise<Response> {
      const run = options.projectAssign
      const outcome: ProjectOutcome = run === undefined
        ? { state: 'refused', code: 'projects-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async unassignProject(request: { readonly matterRef: string }): Promise<Response> {
      const run = options.projectUnassign
      const outcome: ProjectOutcome = run === undefined
        ? { state: 'refused', code: 'projects-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async archiveMatter(request: { readonly matterRef: string, readonly ground: 'completed' | 'stopped' }): Promise<Response> {
      const run = options.matterAdminArchive
      const outcome: MatterAdminOutcome = run === undefined
        ? { state: 'refused', code: 'matter-admin-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async restoreMatter(request: { readonly matterRef: string }): Promise<Response> {
      const run = options.matterAdminRestore
      const outcome: MatterAdminOutcome = run === undefined
        ? { state: 'refused', code: 'matter-admin-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async batchMatters(request: { readonly operation: 'archive' | 'restore', readonly targets: readonly string[], readonly ground?: 'completed' | 'stopped' }): Promise<Response> {
      const run = options.matterAdminBatch
      const outcome: MatterBatchResult = run === undefined
        ? { state: 'refused', code: 'matter-admin-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async renameMatter(request: { readonly matterRef: string, readonly title: string }): Promise<Response> {
      const run = options.matterAdminRename
      const outcome: MatterRenameResult = run === undefined
        ? { state: 'refused', code: 'matter-admin-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async createMatterGroup(request: { readonly name: string, readonly targets?: readonly string[] }): Promise<Response> {
      const run = options.matterGroupsCreate
      const outcome: MatterGroupsOutcome = run === undefined
        ? { state: 'refused', code: 'matter-groups-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async renameMatterGroup(request: { readonly groupId: string, readonly name: string }): Promise<Response> {
      const run = options.matterGroupsRename
      const outcome: MatterGroupsOutcome = run === undefined
        ? { state: 'refused', code: 'matter-groups-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async removeMatterGroup(request: { readonly groupId: string }): Promise<Response> {
      const run = options.matterGroupsRemove
      const outcome: MatterGroupsOutcome = run === undefined
        ? { state: 'refused', code: 'matter-groups-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async assignMatterGroup(request: { readonly groupId: string, readonly operation: 'add' | 'remove', readonly targets: readonly string[] }): Promise<Response> {
      const run = options.matterGroupsAssign
      const outcome: MatterGroupsOutcome = run === undefined
        ? { state: 'refused', code: 'matter-groups-unavailable' }
        : run(request)
      return serviceJson(outcome, 200)
    },
    async readRunLog(request: { readonly workspaceRoot: string, readonly path: string, readonly fromLine?: number, readonly expectVersion?: string, readonly expectBytes?: number }): Promise<Response> {
      const run = options.runLogRead
      const outcome: RunLogOutcome = run === undefined
        ? { state: 'refused', code: 'run-log-unavailable' }
        : await run(request).catch((): RunLogOutcome => ({ state: 'refused', code: 'run-log-read-failed' }))
      return serviceJson(outcome, 200)
    },
    async createPlan(request: { readonly matterRef: string, readonly title: string, readonly steps: readonly string[] }): Promise<Response> {
      const run = options.planCreate
      const outcome: PlanOutcome = run === undefined ? { state: 'refused', code: 'plans-unavailable' } : run(request)
      return serviceJson(outcome, 200)
    },
    async acceptPlan(request: { readonly planId: string }): Promise<Response> {
      const run = options.planAccept
      const outcome: PlanOutcome = run === undefined ? { state: 'refused', code: 'plans-unavailable' } : run(request)
      return serviceJson(outcome, 200)
    },
    async preparePlanStep(request: { readonly planId: string, readonly stepNo: number }): Promise<Response> {
      const run = options.planPrepareStep
      const outcome: PlanStepOutcome = run === undefined ? { state: 'refused', planId: request.planId, stepNo: request.stepNo, code: 'plans-unavailable' } : run(request)
      return serviceJson(outcome, 200)
    },
    async executePlanStep(request: { readonly planId: string, readonly stepNo: number, readonly confirmationId?: string }): Promise<Response> {
      const run = options.planExecuteStep
      const outcome: PlanStepExecuteOutcome = run === undefined
        ? { state: 'not-ready', plans: { state: 'unavailable', plans: [], lastStepRun: null }, code: 'plans-unavailable' }
        : await run(request).catch((): PlanStepExecuteOutcome => ({ state: 'unknown', plans: { state: 'unavailable', plans: [], lastStepRun: null }, code: 'plan-execute-failed' }))
      return serviceJson(outcome, 200)
    },
    async linkWorkspace(request): Promise<Response> {
      const apply = options.matterLinkApply
      const state = await apply?.({
        action: request.action,
        matterRef: request.matterRef,
        ...(request.workspaceRef === undefined ? {} : { workspaceRef: request.workspaceRef }),
      })
      return serviceJson(state ?? { state: 'unavailable', links: [], trail: [] }, 200)
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
