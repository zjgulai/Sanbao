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
import type { ModelConfigStatus, ServiceProviders, WorkspaceAdoptOutcome, WorkspaceListStatus, WorkspaceMutationOutcome, WorkspaceMutationRequest, FileCandidateStatus, FileReferenceOutcome, FileReferenceRecord, FileReferenceUse, ReadoutProvider, ReadoutState, DraftConversionRequest, DraftStatus, MatterLinkState, PreferencesStatus, SessionChannelStatus, SessionControlOutcome, SessionSendOutcome, QueueItemOutcome, SessionHistoryStatus, ClarificationStatus, ClarificationAnswerOutcome, SessionAnchorsStatus, SessionAnchorListOutcome, SessionAnchorLocateOutcome, SessionEditsStatus, SessionEditSaveOutcome, SessionEditResendOutcome, SessionEditVerifyOutcome, InputSelectionsStatus, InputSelectionOutcome, SessionPlanModeStatus, PlanModeSwitchReceipt, SiteTemplatesStatus, ApprovalStatus, ApprovalAnswerOutcome, ApprovalWithdrawOutcome, ModelQueueStatus, TerminalStatus, TerminalReadOutcome, FeedbackStatus, FeedbackReceiptView, SessionRunDetailOutcome, SessionRunListOutcome, SettingsLeaf, EditDraftStatus, EditDraftCreateOutcome, EditDraftUpdateOutcome, EditDraftDiffOutcome, EditDraftPrepareWritebackOutcome, EditDraftWritebackOutcome, ActionItemsStatus, ActionItemOutcome, CorrectionOutcome, ProjectsStatus, ProjectOutcome, MatterAdminStatus, MatterAdminOutcome, MatterBatchResult, MatterRenameResult, MatterGroupsStatus, MatterGroupsOutcome, RunMonitorView, RunLogOutcome, PlansStatus, PlanOutcome, PlanStepOutcome, PlanStepExecuteOutcome, AttachmentStatus, AttachmentPickOutcome, AttachmentUploadOutcome, AttachmentControlOutcome, ArtifactStatus, ArtifactObserveOutcome, ArtifactOpenOutcome, ArtifactCloseOutcome, ArtifactFullscreenOutcome, ArtifactWindowOutcome, ExternalLinkOutcome, SearchOutcome, MatterListState, SideChatsStatus, SideChatCreateOutcome, SideChatSendOutcome, SideChatReadOutcome, SideChatReturnOutcome, ToolResultsStatus } from '../appservice/contracts.js'
import type { CommandPipelinePorts, SageDispatchIntent } from '../appservice/command-contracts.js'
import type { ActionConfirmationsWiring } from '../appservice/action-confirmations.js'
import type { RuntimeEffectiveObservation } from '../protocol.js'
import type { IdentityPolicyResolution } from '../security/identity-policy.js'
import type { OidcAdapter } from './oidc-adapter.js'
import type { TokenVault } from './token-vault.js'
import type { RuntimeInventoryProvider } from './runtime-inventory-provider.js'
import { createSageAuthorityRuntime } from './authority-runtime.js'
import { assembleAuthorizationRequest } from './authorization-assembly.js'
import { loadOrganizationPolicy } from './organization-policy.js'
import type { StrictRehydratePort } from './matter-rehydrate-port.js'

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
  /** Ticket 030: main-owned read of the live runtime roster (the same observation the inventory
   *  provider uses); absent keeps the capability surface at 未核验 rather than inventing rows. */
  readonly runtimeEffective?: () => RuntimeEffectiveObservation | undefined
  /** Step-3 wiring over the Sage-owned matter store; absent keeps step 3 fail closed (steps 4-10
   *  stay fail closed either way — this port only replaces "no provider" with a real read). */
  readonly matterRehydrate?: StrictRehydratePort
  /** Ticket 017: main-owned classified read of the base settings document (via the read-only
   *  bridge). Absent keeps the model view unread instead of showing an empty configuration. */
  readonly modelConfig?: () => ModelConfigStatus | Promise<ModelConfigStatus>
  /** Ticket 010: main-owned adoption (pick + create over the bridge); absent reports it unwired. */
  readonly adoptWorkspace?: () => Promise<WorkspaceAdoptOutcome>
  /** Ticket 012: main-owned folded workspace list; absent reports it unread. */
  readonly workspaceList?: () => Promise<WorkspaceListStatus>
  /** Ticket 012 (write half): main-owned workspace mutations; absent refuses with its own code. */
  readonly mutateWorkspace?: (request: WorkspaceMutationRequest) => Promise<WorkspaceMutationOutcome>
  /** Ticket 013: main-owned file candidates / references / use; absent refuses with its own code. */
  readonly listFileCandidates?: (request: { readonly workspaceRoot: string, readonly path: string }) => Promise<FileCandidateStatus>
  readonly createFileReference?: (request: { readonly workspaceRoot: string, readonly path: string }) => Promise<FileReferenceOutcome>
  readonly useFileReference?: (request: { readonly referenceId: string }) => Promise<FileReferenceUse>
  readonly fileReferences?: () => readonly FileReferenceRecord[]
  /** Ticket 026: main-owned read of the four rear read-only families; absent shows the
   *  unavailable-first fallback rather than empty rows. */
  readonly readout?: ReadoutProvider
  /** Ticket 002: the device's drafts (locked/unlocked included) and the confirm path's two halves. */
  readonly draftList?: () => DraftStatus
  readonly draftCreate?: (request: { readonly rawInput: string }) => DraftStatus | undefined
  readonly draftUpdate?: SageAppServiceOptionsDraftUpdate
  readonly draftPrepareConversion?: (request: { readonly draftId: string }) =>
    { readonly state: 'locked' | 'missing' | 'incomplete' | 'already-converted' }
    | { readonly state: 'ready', readonly request: DraftConversionRequest }
  readonly draftCommitConversion?: (request: { readonly draftId: string, readonly matterRef: string }) => void
  /** Ticket 005: the session channel read + send halves. */
  readonly sessionChannel?: () => Promise<SessionChannelStatus>
  readonly sessionSend?: (request: { readonly matterRef: string, readonly workspaceRoot: string, readonly text: string, readonly mode?: 'queue' | 'steer' }) => Promise<SessionSendOutcome>
  /** Ticket 046: the eleven leaf rows. */
  readonly settingsLeaves?: () => readonly SettingsLeaf[]
  /** Ticket 020: the device preferences read + save halves. */
  readonly preferences?: () => PreferencesStatus
  readonly preferencesSave?: (request: Partial<PreferencesStatus['requested']>) => PreferencesStatus | undefined
  /** Ticket 006: stop/resume and the pending-item edits. */
  readonly sessionStop?: (request: { readonly matterRef: string }) => Promise<SessionControlOutcome>
  readonly sessionResume?: (request: { readonly matterRef: string, readonly workspaceRoot: string }) => Promise<SessionControlOutcome>
  readonly pendingUpdate?: (request: { readonly action: 'edit', readonly itemId: string, readonly text: string } | { readonly action: 'remove', readonly itemId: string }, matterRef: string) => { readonly ok: boolean, readonly code?: string }
  readonly queueItemUpdate?: (request: { readonly action: 'edit', readonly itemId: string, readonly text: string } | { readonly action: 'remove', readonly itemId: string }) => QueueItemOutcome | Promise<QueueItemOutcome>
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
  /** Ticket 003: attempt bookkeeping and the reconcile half. */
  readonly draftBeginAttempt?: (request: { readonly draftId: string, readonly correlation: string }) => void
  readonly draftNoteAttempt?: (request: { readonly draftId: string, readonly correlation: string, readonly state: 'unknown' | 'failed' }) => void
  readonly draftCancelAttempt?: (request: { readonly draftId: string }) => DraftStatus | undefined
  readonly reconcileDraftCreation?: (request: { readonly draftId: string, readonly correlation: string }) =>
    | { readonly state: 'settled', readonly matterRef: string }
    | { readonly state: 'unknown', readonly code: string }
    | { readonly state: 'failed', readonly code: string }
  /** Ticket 011: the Sage-owned link state and its three named operations; the gate runs per dispatch. */
  readonly matterLinks?: () => MatterLinkState
  readonly matterLinkApply?: (request: { readonly action: 'link' | 'unlink' | 'set-default', readonly matterRef: string, readonly workspaceRef?: string }) => MatterLinkState | Promise<MatterLinkState> | undefined
  readonly verifyEnvironment?: (request: { readonly intent: SageDispatchIntent }) => { readonly ok: true } | { readonly ok: false, readonly code: 'environment-unavailable' } | Promise<{ readonly ok: true } | { readonly ok: false, readonly code: 'environment-unavailable' }>
  /** Ticket 025: the confirmation store + its facts home (the matter's chosen environment). */
  readonly actionConfirmations?: ActionConfirmationsWiring
  /** Ticket 027: matter edit drafts — the view and the five acts; absent keeps the family at
   *  its honest 'edit-draft-unavailable' refusal instead of pretending an empty shelf. */
  readonly editDrafts?: () => EditDraftStatus
  readonly editDraftCreate?: (request: { readonly referenceId: string, readonly matterRef: string }) => Promise<EditDraftCreateOutcome>
  readonly editDraftUpdate?: (request: { readonly draftId: string, readonly proposedText: string }) => EditDraftUpdateOutcome
  readonly editDraftDiff?: (request: { readonly draftId: string }) => Promise<EditDraftDiffOutcome>
  readonly editDraftPrepareWriteback?: (request: { readonly draftId: string }) => Promise<EditDraftPrepareWritebackOutcome>
  readonly editDraftWriteback?: (request: { readonly draftId: string, readonly confirmationId?: string }) => Promise<EditDraftWritebackOutcome>
  /** Ticket 028: action items + corrections + the project grouping; absent keeps each act at
   *  its own honest refusal rather than a fabricated empty shelf. */
  readonly actionItems?: () => ActionItemsStatus
  readonly actionItemCreate?: (request: { readonly matterRef: string, readonly title: string, readonly note?: string }) => ActionItemOutcome
  readonly actionItemUpdate?: (request: { readonly actionId: string, readonly title?: string, readonly note?: string }) => ActionItemOutcome
  readonly actionItemStart?: (request: { readonly actionId: string }) => ActionItemOutcome
  readonly actionItemComplete?: (request: { readonly actionId: string }) => ActionItemOutcome
  readonly correctionCreate?: (request: { readonly matterRef: string, readonly workspaceRoot: string, readonly originalText: string, readonly originalAt?: string, readonly text: string }) => Promise<CorrectionOutcome>
  readonly projects?: () => ProjectsStatus
  readonly projectCreate?: (request: { readonly name: string }) => ProjectOutcome
  readonly projectAssign?: (request: { readonly matterRef: string, readonly projectRef: string }) => ProjectOutcome
  readonly projectUnassign?: (request: { readonly matterRef: string }) => ProjectOutcome
  /** Ticket 029: matter administration; absent keeps each act at its own refusal. */
  readonly matterAdmin?: () => MatterAdminStatus
  readonly matterAdminArchive?: (request: { readonly matterRef: string, readonly ground: 'completed' | 'stopped' }) => MatterAdminOutcome
  readonly matterAdminRestore?: (request: { readonly matterRef: string }) => MatterAdminOutcome
  readonly matterAdminBatch?: (request: { readonly operation: 'archive' | 'restore', readonly targets: readonly string[], readonly ground?: 'completed' | 'stopped' }) => MatterBatchResult
  readonly matterAdminRename?: (request: { readonly matterRef: string, readonly title: string }) => MatterRenameResult
  /** Ticket 049: task groups — organization only (create / rename / remove / membership batch). */
  readonly matterGroups?: () => MatterGroupsStatus
  readonly matterGroupsCreate?: (request: { readonly name: string, readonly targets?: readonly string[] }) => MatterGroupsOutcome
  readonly matterGroupsRename?: (request: { readonly groupId: string, readonly name: string }) => MatterGroupsOutcome
  readonly matterGroupsRemove?: (request: { readonly groupId: string }) => MatterGroupsOutcome
  readonly matterGroupsAssign?: (request: { readonly groupId: string, readonly operation: 'add' | 'remove', readonly targets: readonly string[] }) => MatterGroupsOutcome
  /** Ticket 031: the four-axis run monitor + the bounded run-log read. */
  readonly runMonitor?: () => Promise<RunMonitorView>
  readonly runLogRead?: (request: { readonly workspaceRoot: string, readonly path: string, readonly fromLine?: number, readonly expectVersion?: string, readonly expectBytes?: number }) => Promise<RunLogOutcome>
  /** Ticket 044: the separate preview window (explicit actions only; same loaded version). */
  readonly artifactWindowOpen?: () => Promise<ArtifactWindowOutcome>
  readonly artifactWindowClose?: () => ArtifactWindowOutcome
  /** Ticket 032: the plan deliverable + its two-stage step dispatch. */
  readonly plans?: () => PlansStatus
  readonly planCreate?: (request: { readonly matterRef: string, readonly title: string, readonly steps: readonly string[] }) => PlanOutcome
  readonly planAccept?: (request: { readonly planId: string }) => PlanOutcome
  readonly planPrepareStep?: (request: { readonly planId: string, readonly stepNo: number }) => PlanStepOutcome
  readonly planExecuteStep?: (request: { readonly planId: string, readonly stepNo: number, readonly confirmationId?: string }) => Promise<PlanStepExecuteOutcome>
  /** Loop repair (ticket 033): these families' wirings were spread into main/index.ts but never
   *  mapped at this assembly point — the options object silently dropped them, so their routes
   *  answered unavailable under the real window while every function-level test passed. Declared
   *  and forwarded now, with `test/app-service-wiring.spec.ts` as the guard that fails if any
   *  wired family stops reaching the service again (知道 ⇒ 拦住). */
  readonly attachments?: () => AttachmentStatus
  readonly attachmentsPick?: () => Promise<AttachmentPickOutcome>
  readonly attachmentsUpload?: (request: { readonly itemId: string, readonly matterRef: string, readonly workspaceRoot: string }) => Promise<AttachmentUploadOutcome>
  readonly attachmentsCancel?: (request: { readonly itemId: string }) => Promise<AttachmentControlOutcome>
  readonly artifacts?: () => ArtifactStatus
  readonly artifactsObserve?: (request: { readonly matterRef: string, readonly workspaceRoot: string }) => Promise<ArtifactObserveOutcome>
  readonly artifactOpen?: (request: { readonly artifactId: string }) => Promise<ArtifactOpenOutcome>
  readonly artifactClose?: () => Promise<ArtifactCloseOutcome>
  readonly artifactRetry?: () => Promise<ArtifactOpenOutcome>
  readonly artifactFullscreen?: (request: { readonly on: boolean }) => ArtifactFullscreenOutcome
  readonly externalLinkOpen?: (raw: string) => Promise<ExternalLinkOutcome>
  readonly search?: (request: { readonly query: string }) => Promise<SearchOutcome>
  readonly matterList?: () => MatterListState
  readonly sideChats?: () => SideChatsStatus
  readonly sideChatCreate?: (request: { readonly matterRef: string }) => Promise<SideChatCreateOutcome>
  readonly sideChatSend?: (request: { readonly sideChatId: string, readonly text: string }) => Promise<SideChatSendOutcome>
  readonly sideChatRead?: (request: { readonly sideChatId: string }) => Promise<SideChatReadOutcome>
  readonly sideChatReturn?: (request: { readonly sideChatId: string, readonly text: string }) => Promise<SideChatReturnOutcome>
  /** Ticket 033: typed tool results; no production source exists yet, so index leaves it unwired. */
  readonly toolResults?: () => ToolResultsStatus
}

type SageAppServiceOptionsDraftUpdate = (request: {
  readonly draftId: string
  readonly fields?: { readonly goal?: string, readonly deliverable?: string, readonly responsibility?: string, readonly projectRef?: string }
  readonly clarification?: string
  readonly selectedEntryIds?: readonly string[]
}) => DraftStatus | undefined

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
    // Step 3 becomes a real read when a store port is wired; without it the fail-closed default
    // still answers, so the merge cannot silently open a later step.
    ...(options.matterRehydrate === undefined ? {} : { strictRehydrate: options.matterRehydrate }),
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
    ...(options.runtimeEffective === undefined ? {} : { runtimeEffective: options.runtimeEffective }),
    ...(options.modelConfig === undefined ? {} : { modelConfig: options.modelConfig }),
    ...(options.adoptWorkspace === undefined ? {} : { adoptWorkspace: options.adoptWorkspace }),
    ...(options.workspaceList === undefined ? {} : { workspaceList: options.workspaceList }),
    ...(options.mutateWorkspace === undefined ? {} : { mutateWorkspace: options.mutateWorkspace }),
    ...(options.listFileCandidates === undefined ? {} : { listFileCandidates: options.listFileCandidates }),
    ...(options.createFileReference === undefined ? {} : { createFileReference: options.createFileReference }),
    ...(options.useFileReference === undefined ? {} : { useFileReference: options.useFileReference }),
    ...(options.fileReferences === undefined ? {} : { fileReferences: options.fileReferences }),
    ...(options.readout === undefined ? {} : { readout: options.readout }),
    ...(options.draftList === undefined ? {} : { draftList: options.draftList }),
    ...(options.draftCreate === undefined ? {} : { draftCreate: options.draftCreate }),
    ...(options.draftUpdate === undefined ? {} : { draftUpdate: options.draftUpdate }),
    ...(options.draftPrepareConversion === undefined ? {} : { draftPrepareConversion: options.draftPrepareConversion }),
    ...(options.draftCommitConversion === undefined ? {} : { draftCommitConversion: options.draftCommitConversion }),
    ...(options.sessionChannel === undefined ? {} : { sessionChannel: options.sessionChannel }),
    ...(options.sessionSend === undefined ? {} : { sessionSend: options.sessionSend }),
    ...(options.settingsLeaves === undefined ? {} : { settingsLeaves: options.settingsLeaves }),
    ...(options.preferences === undefined ? {} : { preferences: options.preferences }),
    ...(options.preferencesSave === undefined ? {} : { preferencesSave: options.preferencesSave }),
    ...(options.sessionStop === undefined ? {} : { sessionStop: options.sessionStop }),
    ...(options.sessionResume === undefined ? {} : { sessionResume: options.sessionResume }),
    ...(options.pendingUpdate === undefined ? {} : { pendingUpdate: options.pendingUpdate }),
    ...(options.queueItemUpdate === undefined ? {} : { queueItemUpdate: options.queueItemUpdate }),
    ...(options.sessionHistory === undefined ? {} : { sessionHistory: options.sessionHistory }),
    ...(options.sessionHistoryList === undefined ? {} : { sessionHistoryList: options.sessionHistoryList }),
    ...(options.sessionHistoryDetail === undefined ? {} : { sessionHistoryDetail: options.sessionHistoryDetail }),
    ...(options.sessionClarifications === undefined ? {} : { sessionClarifications: options.sessionClarifications }),
    ...(options.sessionClarificationAnswer === undefined ? {} : { sessionClarificationAnswer: options.sessionClarificationAnswer }),
    ...(options.sessionAnchors === undefined ? {} : { sessionAnchors: options.sessionAnchors }),
    ...(options.sessionAnchorsRead === undefined ? {} : { sessionAnchorsRead: options.sessionAnchorsRead }),
    ...(options.sessionAnchorLocate === undefined ? {} : { sessionAnchorLocate: options.sessionAnchorLocate }),
    ...(options.sessionEdits === undefined ? {} : { sessionEdits: options.sessionEdits }),
    ...(options.sessionEditsSave === undefined ? {} : { sessionEditsSave: options.sessionEditsSave }),
    ...(options.sessionEditsResend === undefined ? {} : { sessionEditsResend: options.sessionEditsResend }),
    ...(options.sessionEditsVerify === undefined ? {} : { sessionEditsVerify: options.sessionEditsVerify }),
    ...(options.inputSelections === undefined ? {} : { inputSelections: options.inputSelections }),
    ...(options.inputSelectionsSelect === undefined ? {} : { inputSelectionsSelect: options.inputSelectionsSelect }),
    ...(options.inputSelectionsClear === undefined ? {} : { inputSelectionsClear: options.inputSelectionsClear }),
    ...(options.sessionPlanMode === undefined ? {} : { sessionPlanMode: options.sessionPlanMode }),
    ...(options.sessionPlanModeSwitch === undefined ? {} : { sessionPlanModeSwitch: options.sessionPlanModeSwitch }),
    ...(options.siteTemplates === undefined ? {} : { siteTemplates: options.siteTemplates }),
    ...(options.sessionApprovals === undefined ? {} : { sessionApprovals: options.sessionApprovals }),
    ...(options.modelQueue === undefined ? {} : { modelQueue: options.modelQueue }),
    ...(options.terminal === undefined ? {} : { terminal: options.terminal }),
    ...(options.terminalRead === undefined ? {} : { terminalRead: options.terminalRead }),
    ...(options.feedback === undefined ? {} : { feedback: options.feedback }),
    ...(options.feedbackSubmit === undefined ? {} : { feedbackSubmit: options.feedbackSubmit }),
    ...(options.feedbackVerify === undefined ? {} : { feedbackVerify: options.feedbackVerify }),
    ...(options.sessionApprovalAnswer === undefined ? {} : { sessionApprovalAnswer: options.sessionApprovalAnswer }),
    ...(options.sessionApprovalWithdraw === undefined ? {} : { sessionApprovalWithdraw: options.sessionApprovalWithdraw }),
    ...(options.draftBeginAttempt === undefined ? {} : { draftBeginAttempt: options.draftBeginAttempt }),
    ...(options.draftNoteAttempt === undefined ? {} : { draftNoteAttempt: options.draftNoteAttempt }),
    ...(options.draftCancelAttempt === undefined ? {} : { draftCancelAttempt: options.draftCancelAttempt }),
    ...(options.reconcileDraftCreation === undefined ? {} : { reconcileDraftCreation: options.reconcileDraftCreation }),
    ...(options.matterLinks === undefined ? {} : { matterLinks: options.matterLinks }),
    ...(options.matterLinkApply === undefined ? {} : { matterLinkApply: options.matterLinkApply }),
    ...(options.verifyEnvironment === undefined ? {} : { verifyEnvironment: options.verifyEnvironment }),
    ...(options.actionConfirmations === undefined ? {} : { actionConfirmations: options.actionConfirmations }),
    ...(options.editDrafts === undefined ? {} : { editDrafts: options.editDrafts }),
    ...(options.editDraftCreate === undefined ? {} : { editDraftCreate: options.editDraftCreate }),
    ...(options.editDraftUpdate === undefined ? {} : { editDraftUpdate: options.editDraftUpdate }),
    ...(options.editDraftDiff === undefined ? {} : { editDraftDiff: options.editDraftDiff }),
    ...(options.editDraftPrepareWriteback === undefined ? {} : { editDraftPrepareWriteback: options.editDraftPrepareWriteback }),
    ...(options.editDraftWriteback === undefined ? {} : { editDraftWriteback: options.editDraftWriteback }),
    ...(options.actionItems === undefined ? {} : { actionItems: options.actionItems }),
    ...(options.actionItemCreate === undefined ? {} : { actionItemCreate: options.actionItemCreate }),
    ...(options.actionItemUpdate === undefined ? {} : { actionItemUpdate: options.actionItemUpdate }),
    ...(options.actionItemStart === undefined ? {} : { actionItemStart: options.actionItemStart }),
    ...(options.actionItemComplete === undefined ? {} : { actionItemComplete: options.actionItemComplete }),
    ...(options.correctionCreate === undefined ? {} : { correctionCreate: options.correctionCreate }),
    ...(options.projects === undefined ? {} : { projects: options.projects }),
    ...(options.projectCreate === undefined ? {} : { projectCreate: options.projectCreate }),
    ...(options.projectAssign === undefined ? {} : { projectAssign: options.projectAssign }),
    ...(options.projectUnassign === undefined ? {} : { projectUnassign: options.projectUnassign }),
    ...(options.matterAdmin === undefined ? {} : { matterAdmin: options.matterAdmin }),
    ...(options.matterAdminArchive === undefined ? {} : { matterAdminArchive: options.matterAdminArchive }),
    ...(options.matterAdminRestore === undefined ? {} : { matterAdminRestore: options.matterAdminRestore }),
    ...(options.matterAdminBatch === undefined ? {} : { matterAdminBatch: options.matterAdminBatch }),
    ...(options.matterAdminRename === undefined ? {} : { matterAdminRename: options.matterAdminRename }),
    ...(options.matterGroups === undefined ? {} : { matterGroups: options.matterGroups }),
    ...(options.matterGroupsCreate === undefined ? {} : { matterGroupsCreate: options.matterGroupsCreate }),
    ...(options.matterGroupsRename === undefined ? {} : { matterGroupsRename: options.matterGroupsRename }),
    ...(options.matterGroupsRemove === undefined ? {} : { matterGroupsRemove: options.matterGroupsRemove }),
    ...(options.matterGroupsAssign === undefined ? {} : { matterGroupsAssign: options.matterGroupsAssign }),
    ...(options.runMonitor === undefined ? {} : { runMonitor: options.runMonitor }),
    ...(options.runLogRead === undefined ? {} : { runLogRead: options.runLogRead }),
    ...(options.plans === undefined ? {} : { plans: options.plans }),
    ...(options.planCreate === undefined ? {} : { planCreate: options.planCreate }),
    ...(options.planAccept === undefined ? {} : { planAccept: options.planAccept }),
    ...(options.planPrepareStep === undefined ? {} : { planPrepareStep: options.planPrepareStep }),
    ...(options.planExecuteStep === undefined ? {} : { planExecuteStep: options.planExecuteStep }),
    // Loop repair (ticket 033): the five families below were wired in index.ts but dropped here;
    // the guard spec `test/app-service-wiring.spec.ts` now fails if any of them goes missing again.
    ...(options.attachments === undefined ? {} : { attachments: options.attachments }),
    ...(options.attachmentsPick === undefined ? {} : { attachmentsPick: options.attachmentsPick }),
    ...(options.attachmentsUpload === undefined ? {} : { attachmentsUpload: options.attachmentsUpload }),
    ...(options.attachmentsCancel === undefined ? {} : { attachmentsCancel: options.attachmentsCancel }),
    ...(options.artifacts === undefined ? {} : { artifacts: options.artifacts }),
    ...(options.artifactsObserve === undefined ? {} : { artifactsObserve: options.artifactsObserve }),
    ...(options.artifactOpen === undefined ? {} : { artifactOpen: options.artifactOpen }),
    ...(options.artifactClose === undefined ? {} : { artifactClose: options.artifactClose }),
    ...(options.artifactRetry === undefined ? {} : { artifactRetry: options.artifactRetry }),
    ...(options.artifactFullscreen === undefined ? {} : { artifactFullscreen: options.artifactFullscreen }),
    ...(options.artifactWindowOpen === undefined ? {} : { artifactWindowOpen: options.artifactWindowOpen }),
    ...(options.artifactWindowClose === undefined ? {} : { artifactWindowClose: options.artifactWindowClose }),
    ...(options.externalLinkOpen === undefined ? {} : { externalLinkOpen: options.externalLinkOpen }),
    ...(options.search === undefined ? {} : { search: options.search }),
    ...(options.matterList === undefined ? {} : { matterList: options.matterList }),
    ...(options.sideChats === undefined ? {} : { sideChats: options.sideChats }),
    ...(options.sideChatCreate === undefined ? {} : { sideChatCreate: options.sideChatCreate }),
    ...(options.sideChatSend === undefined ? {} : { sideChatSend: options.sideChatSend }),
    ...(options.sideChatRead === undefined ? {} : { sideChatRead: options.sideChatRead }),
    ...(options.sideChatReturn === undefined ? {} : { sideChatReturn: options.sideChatReturn }),
    ...(options.toolResults === undefined ? {} : { toolResults: options.toolResults }),
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
