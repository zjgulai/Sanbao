/** The single assembly point for main's /.sage/* providers (WT-02D.1): main wiring and the
 * real-window fixture probe both consume this module, so the injection logic under test is
 * the production logic. WT-02D.2A adds the authorization-path assembly: a real step-2 port
 * (intent assembly + Authority Runtime) and retry's availability probe merged over the
 * fail-closed defaults — steps 3-10 stay fail closed. */
import { randomUUID } from 'node:crypto'
import { SAGE_RUNTIME_STATUSES, type SageRuntimeStatus, type SageViewState } from '../product/contracts.js'
import type { SageMatterViewState } from '../product/view-state.js'
import { createSageFixtureViewState, parseSageFixtureStage } from '../product/view-state.js'
import { createUnavailableFirstService, PRODUCTION_FAIL_CLOSED_PORTS } from '../appservice/composition.js'
import { serviceJson } from '../appservice/errors.js'
import type { ModelConfigStatus, ServiceProviders, WorkspaceAdoptOutcome, WorkspaceListStatus, WorkspaceMutationOutcome, WorkspaceMutationRequest, FileCandidateStatus, FileReferenceOutcome, FileReferenceRecord, FileReferenceUse, ReadoutProvider, ReadoutState, DraftConversionRequest, DraftStatus, MatterLinkState, PreferencesStatus, SessionChannelStatus, SessionControlOutcome, SessionSendOutcome, QueueItemOutcome, SessionHistoryStatus, ClarificationStatus, ClarificationAnswerOutcome, SessionAnchorsStatus, SessionAnchorListOutcome, SessionAnchorLocateOutcome, SessionEditsStatus, SessionEditSaveOutcome, SessionEditResendOutcome, SessionEditVerifyOutcome, InputSelectionsStatus, InputSelectionOutcome, SessionPlanModeStatus, PlanModeSwitchReceipt, SiteTemplatesStatus, ApprovalStatus, ApprovalAnswerOutcome, ApprovalWithdrawOutcome, ModelQueueStatus, TerminalStatus, TerminalReadOutcome, FeedbackStatus, FeedbackReceiptView, SessionRunDetailOutcome, SessionRunListOutcome, SettingsLeaf, EditDraftStatus, EditDraftCreateOutcome, EditDraftUpdateOutcome, EditDraftDiffOutcome, EditDraftPrepareWritebackOutcome, EditDraftWritebackOutcome, ActionItemsStatus, ActionItemOutcome, CorrectionOutcome, ProjectsStatus, ProjectOutcome, MatterAdminStatus, MatterAdminOutcome, MatterBatchResult, MatterRenameResult, MatterGroupsStatus, MatterGroupsOutcome, RunMonitorView, RunLogOutcome, PlansStatus, PlanOutcome, PlanStepOutcome, PlanStepExecuteOutcome, AttachmentStatus, AttachmentPickOutcome, AttachmentUploadOutcome, AttachmentControlOutcome, ArtifactStatus, ArtifactObserveOutcome, ArtifactOpenOutcome, ArtifactCloseOutcome, ArtifactFullscreenOutcome, ArtifactWindowOutcome, ExternalLinkOutcome, SearchOutcome, MatterListState, SideChatsStatus, SideChatCreateOutcome, SideChatSendOutcome, SideChatReadOutcome, SideChatReturnOutcome, ToolResultsStatus, ProjectionReadCandidate, ProjectionReadRouteRunner, LocalSystemBootstrapState } from '../appservice/contracts.js'
import type { DevicePreferencesState } from '../appservice/contracts.js'
import { admitProjectionRead } from '../appservice/projection-read-admission.js'
import type { ProjectionReadOperation, ProjectionReadScope } from '../appservice/projection-read-admission.js'
import { admitLocalSystemRead } from '../appservice/local-system-admission.js'
import type { CommandPipelinePorts, SageDispatchIntent } from '../appservice/command-contracts.js'
import type { ActionConfirmationsWiring } from '../appservice/action-confirmations.js'
import type { RuntimeEffectiveObservation } from '../protocol.js'
import type { IdentityPolicyResolution } from '../security/identity-policy.js'
import type { OidcAdapter } from './oidc-adapter.js'
import type { TokenVault } from './token-vault.js'
import type { RegistrySnapshotPort, RuntimeInventoryProvider } from './runtime-inventory-provider.js'
import type { SessionPromptAttemptStorePort } from './session-prompt-attempt-store.js'
import { createSageAuthorityRuntime } from './authority-runtime.js'
import { assembleAuthorizationRequest } from './authorization-assembly.js'
import { createSessionCoreIdentityPort } from './session-core-identity.js'
import { createSessionPromptDispatchPort } from './session-prompt-dispatch.js'
import { createSessionPromptPersistencePort } from './session-prompt-persistence.js'
import { createSessionPromptPrepareRunner, type SessionPrepareRunner } from './session-prompt-prepare.js'
import { createSessionPromptPreflightPort } from './session-prompt-preflight.js'
import { createSessionPromptRegistryPort } from './session-prompt-registry.js'
import { createSessionPromptTargetPort } from './session-prompt-target.js'
import {
  createSessionPromptCompatibilityPort,
  type RuntimeInventoryObservation,
} from './session-prompt-compatibility.js'
import type { CompatibilityMatrixPublicationLoad, RequirementBundleLoad } from './publication-bundle.js'
import { loadOrganizationPolicy } from './organization-policy.js'
import type { StrictRehydratePort } from './matter-rehydrate-port.js'
import type { CallerBinding } from '../appservice/contracts.js'
import type {
  ActiveMatterContextStatus,
  ActiveMatterSelectionOutcome,
  ActiveMatterSelectionRequest,
} from '../appservice/contracts.js'
import type { ProtectedEffectAdmissionPorts } from '../appservice/protected-effect-admission.js'
import type { ActiveMatterContext } from './active-matter-context.js'
import type { FramePolicyState } from './frame-policy.js'
import { projectionReadScope } from './projection-read-scope.js'

/** WT-02D.1 fixture switch: read once from env. The fixture projection only fills the read-only
 * matter slot for local verification and can never satisfy production authority. */
export function resolveFixtureProjection(env: NodeJS.ProcessEnv): (() => SageMatterViewState) | undefined {
  if (env.SAGE_FIXTURE_PROJECTION !== '1') return undefined
  const stage = env.SAGE_FIXTURE_STAGE === undefined
    ? 'clarification'
    : parseSageFixtureStage(env.SAGE_FIXTURE_STAGE)
  return stage === undefined ? undefined : () => createSageFixtureViewState(stage)
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
  /** AUTH-02A: request-local caller and main-owned active context. Neither may be reconstructed
   * from renderer fields, draft recency, Host state, or an earlier request. */
  readonly callerBinding?: CallerBinding | null
  readonly activeMatterContext?: ActiveMatterContext
  readonly framePolicySnapshot?: () => FramePolicyState
  /** CTX-01B: the only path that may replace the active matter tuple. */
  readonly selectActiveMatter?: (request: ActiveMatterSelectionRequest) => Promise<ActiveMatterSelectionOutcome>
  /** READ-01A: authentication is not read authority. This independent provider must bind one
   * current session + matter + operation to an actor scope before any store or Host read. */
  readonly authorizeProjectionRead?: (request: {
    readonly sessionRef: string
    readonly matterId: string
    readonly operation: ProjectionReadOperation
  }) =>
    | { readonly state: 'allowed'; readonly actorScopeRef: string; readonly decisionRef: string }
    | { readonly state: 'denied' }
    | undefined
    | Promise<
      | { readonly state: 'allowed'; readonly actorScopeRef: string; readonly decisionRef: string }
      | { readonly state: 'denied' }
      | undefined
    >
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
  /** T05-mid (ADR-0282): the startup-loaded, kernel-sealed C2.2T requirement bundle. Absent
   *  keeps the target step absent exactly as before; a failed load keeps it present but
   *  unavailable-first. Wired on its own switch so the two steps stay independently observable. */
  readonly requirementBundle?: RequirementBundleLoad
  /** T05-mid step 6 (ADR-0284): the shipped matrix/revocation publication plus the main-owned
   *  observation and store-validated revision surfaces. All must exist for the real
   *  compatibility step; otherwise it stays absent (fail closed, same as before). */
  readonly compatibilityPublication?: CompatibilityMatrixPublicationLoad
  readonly runtimeInventoryObservation?: () => RuntimeInventoryObservation | undefined
  readonly revisionDigest?: (matterId: string, revisionId: string) => string | undefined
  /** T05-mid step 7 (ADR-0286): the main-owned registry provider — the same published snapshot
   *  instance the runtime inventory observed. Absent keeps the registry step absent (fail closed). */
  readonly capabilityRegistry?: RegistrySnapshotPort
  /** T05-mid step 9 (ADR-0288): the persist step's store handle over the matter event store.
   *  Absent keeps the persistence step absent (fail closed). */
  readonly sessionPromptAttempts?: SessionPromptAttemptStorePort
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
  /** T04: the creation branch's custodian (the Sage-owned authoritative store). Absent keeps the
   *  pipeline's honest "custodian not wired" denial. */
  readonly createMatter?: NonNullable<CommandPipelinePorts['createMatter']>
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
    // T04: the creation branch gets its custodian; with it absent the fail-closed default still
    // answers, so the merge cannot silently open the branch.
    ...(options.createMatter === undefined ? {} : { createMatter: options.createMatter }),
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

function fixtureProjectionReadScope(options: SageAppServiceOptions): ProjectionReadScope {
  const fixture = options.fixtureProjection?.()
  return {
    matterRef: fixture?.matter.matterId ?? 'fixture:matter',
    revisionRef: fixture?.matter.currentRevisionId ?? 'fixture:revision',
    workspaceRef: 'fixture:workspace',
    trustedWorkspaceRoot: 'fixture:workspace-root',
    sessionRef: 'fixture:session',
    actorScopeRef: 'fixture:actor',
    contextGeneration: 0,
    frameGeneration: 0,
  }
}

function matchesProjectionReadScope(
  options: SageAppServiceOptions,
  scope: ProjectionReadScope,
): 'allowed' | 'unavailable' | 'stale' {
  const binding = options.callerBinding
  const snapshot = options.activeMatterContext?.snapshot()
  const frame = options.framePolicySnapshot?.()
  const identitySession = options.vault.identitySession()
  if (
    binding === undefined
    || binding === null
    || snapshot === undefined
    || snapshot === null
    || snapshot.sessionRef === null
    || frame === undefined
    || identitySession === null
  ) return 'unavailable'
  if (!frame.ready || frame.contaminated) return 'unavailable'
  if (
    identitySession.sessionRef !== scope.sessionRef
    || snapshot.sessionRef !== scope.sessionRef
    || snapshot.matterId !== scope.matterRef
    || snapshot.revisionId !== scope.revisionRef
    || snapshot.workspaceRef !== scope.workspaceRef
    || snapshot.trustedWorkspaceRoot !== scope.trustedWorkspaceRoot
    || snapshot.actorScopeRef !== scope.actorScopeRef
    || snapshot.contextGeneration !== scope.contextGeneration
    || snapshot.frameGeneration !== scope.frameGeneration
    || frame.generation !== scope.frameGeneration
  ) return 'stale'
  return options.activeMatterContext?.match({
    contextGeneration: scope.contextGeneration,
    actorScopeRef: scope.actorScopeRef,
    matterId: scope.matterRef,
    revisionId: scope.revisionRef,
    workspaceRef: scope.workspaceRef,
    sessionRef: scope.sessionRef,
    frameGeneration: scope.frameGeneration,
  }).ok === true ? 'allowed' : 'stale'
}

/** READ-01A: one production runner owns the entire projection-read admission sequence. The only
 * bypass is the explicit state fixture used by the local window probe; it is visibly fixture-only
 * and cannot authorize any other route. */
function createProjectionReadRunner(options: SageAppServiceOptions): ProjectionReadRouteRunner {
  return async (intent, read) => {
    const correlation = options.callerBinding?.correlation ?? randomUUID()
    if (options.fixtureProjection !== undefined && intent.operation === 'state.read') {
      const scope = fixtureProjectionReadScope(options)
      try {
        const value = await projectionReadScope.run(scope, () => read(scope))
        return value instanceof Response
          ? { state: 'read', correlation, value }
          : { state: 'unavailable', code: 'projection-read-unavailable', stage: 'read', retryable: true, correlation }
      } catch {
        return { state: 'unavailable', code: 'projection-read-unavailable', stage: 'read', retryable: true, correlation }
      }
    }

    return admitProjectionRead<ProjectionReadCandidate, Response>({
      intent,
      correlation,
      ports: {
        verifyCaller: async () => {
          const binding = options.callerBinding
          return binding === undefined || binding === null
            ? { state: 'unavailable' as const }
            : { state: 'allowed' as const, value: { bindingRef: binding.correlation } }
        },
        resolveInitialContext: async ({ caller }) => {
          const binding = options.callerBinding
          if (binding === undefined || binding === null || caller.bindingRef !== binding.correlation) {
            return { state: 'denied' as const }
          }
          const snapshot = options.activeMatterContext?.snapshot()
          const identitySession = options.vault.identitySession()
          if (snapshot === undefined || snapshot === null || snapshot.sessionRef === null || identitySession === null) {
            return { state: 'unavailable' as const }
          }
          if (identitySession.sessionRef !== snapshot.sessionRef) return { state: 'stale' as const }
          return {
            state: 'allowed' as const,
            value: {
              scope: 'request' as const,
              callerBindingRef: binding.correlation,
              sessionRef: snapshot.sessionRef,
              matterRef: snapshot.matterId,
              contextGeneration: snapshot.contextGeneration,
              frameGeneration: snapshot.frameGeneration,
            },
          }
        },
        authorizeRead: async ({ operation, initialContext }) => {
          const decision = await options.authorizeProjectionRead?.({
            sessionRef: initialContext.sessionRef,
            matterId: initialContext.matterRef,
            operation,
          })
          if (decision === undefined) return { state: 'unavailable' as const }
          if (decision.state === 'denied') return { state: 'denied' as const }
          return {
            state: 'allowed' as const,
            value: { decisionRef: decision.decisionRef, actorScopeRef: decision.actorScopeRef },
          }
        },
        resolveFreshScope: async ({ initialContext, readPolicy }) => {
          const snapshot = options.activeMatterContext?.snapshot()
          const frame = options.framePolicySnapshot?.()
          if (
            snapshot === undefined
            || snapshot === null
            || snapshot.sessionRef === null
            || frame === undefined
            || !frame.ready
            || frame.contaminated
          ) return { state: 'unavailable' as const }
          if (
            snapshot.sessionRef !== initialContext.sessionRef
            || snapshot.matterId !== initialContext.matterRef
            || snapshot.contextGeneration !== initialContext.contextGeneration
            || snapshot.frameGeneration !== initialContext.frameGeneration
            || snapshot.frameGeneration !== frame.generation
            || snapshot.actorScopeRef !== readPolicy.actorScopeRef
          ) return { state: 'stale' as const }

          const currentRevision = options.matterRehydrate?.({
            matterId: snapshot.matterId,
            revisionId: snapshot.revisionId,
          })
          if (currentRevision === undefined) return { state: 'unavailable' as const }
          if ('denied' in currentRevision || !currentRevision.current) return { state: 'stale' as const }

          const links = options.matterLinks?.()
          if (links === undefined || links.state !== 'read') return { state: 'unavailable' as const }
          const defaults = links.links.filter((link) => link.matterRef === snapshot.matterId && link.isDefault)
          if (
            defaults.length !== 1
            || defaults[0]?.workspaceRef !== snapshot.workspaceRef
            || defaults[0]?.workspacePath !== snapshot.trustedWorkspaceRoot
          ) return { state: 'stale' as const }

          const readWorkspaceList = options.workspaceList
          if (readWorkspaceList === undefined) return { state: 'unavailable' as const }
          let workspaces: WorkspaceListStatus
          try {
            workspaces = await readWorkspaceList()
          } catch {
            return { state: 'unavailable' as const }
          }
          if (workspaces.state !== 'read') return { state: 'unavailable' as const }
          const matches = workspaces.entries.filter((entry) => entry.workspaceId === snapshot.workspaceRef)
          if (matches.length !== 1 || matches[0]?.path !== snapshot.trustedWorkspaceRoot) {
            return { state: 'stale' as const }
          }

          return {
            state: 'allowed' as const,
            value: {
              matterRef: snapshot.matterId,
              revisionRef: snapshot.revisionId,
              workspaceRef: snapshot.workspaceRef,
              trustedWorkspaceRoot: snapshot.trustedWorkspaceRoot,
              sessionRef: snapshot.sessionRef,
              actorScopeRef: readPolicy.actorScopeRef,
              contextGeneration: snapshot.contextGeneration,
              frameGeneration: snapshot.frameGeneration,
            },
          }
        },
        matchCandidate: async ({ candidate, scope }) => {
          // T03/A (user-authorised): the device `state` aggregate rides the same active-matter grant
          // as the rest of the read surface — the fresh scope already binds exact session, matter,
          // revision, workspace and generations, and composition only assembles main-owned
          // projections. Every other collection (search spans multiple matters and global
          // sessions) still needs its own main-owned object resolver.
          if (candidate.kind === 'collection') {
            return candidate.collection === 'state'
              ? { state: 'allowed' as const, value: { candidateRef: 'collection:state' } }
              : { state: 'unavailable' as const }
          }
          if (candidate.kind === 'active-matter') {
            return { state: 'allowed' as const, value: { candidateRef: `matter:${scope.matterRef}` } }
          }
          if (candidate.kind === 'workspace') {
            return candidate.workspaceRoot === scope.trustedWorkspaceRoot
              ? { state: 'allowed' as const, value: { candidateRef: `workspace:${scope.workspaceRef}` } }
              : { state: 'denied' as const }
          }
          if (candidate.kind === 'matter-workspace') {
            return candidate.matterRef === scope.matterRef && candidate.workspaceRoot === scope.trustedWorkspaceRoot
              ? { state: 'allowed' as const, value: { candidateRef: `matter-workspace:${scope.matterRef}:${scope.workspaceRef}` } }
              : { state: 'denied' as const }
          }
          if (candidate.resource === 'file-reference' && candidate.id !== undefined) {
            const reference = options.fileReferences?.().find((entry) => entry.referenceId === candidate.id)
            // An opaque id is only a clue. Unknown and out-of-scope records deliberately share the
            // unavailable result so the route cannot enumerate references from another matter or root.
            return reference !== undefined
              && reference.matterRef === scope.matterRef
              && reference.workspaceRoot === scope.trustedWorkspaceRoot
              ? { state: 'allowed' as const, value: { candidateRef: `file-reference:${reference.referenceId}` } }
              : { state: 'unavailable' as const }
          }
          // Artifact, current-artifact and edit-draft ids still need their own main-owned resolver.
          return { state: 'unavailable' as const }
        },
        checkPreReadFreshness: async ({ scope }) => {
          const state = matchesProjectionReadScope(options, scope)
          return state === 'allowed'
            ? { state: 'allowed' as const, value: { freshnessRef: `${scope.contextGeneration}:${scope.frameGeneration}:${scope.revisionRef}` } }
            : { state }
        },
        read: async ({ scope }) => projectionReadScope.run(scope, async () => ({
          state: 'allowed' as const,
          value: await read(scope),
        })),
        validatesReadValue: (value: unknown): value is Response => value instanceof Response,
        checkPostReadFreshness: async ({ scope }) => {
          const state = matchesProjectionReadScope(options, scope)
          return state === 'allowed'
            ? { state: 'allowed' as const, value: { freshnessRef: `${scope.contextGeneration}:${scope.frameGeneration}:${scope.revisionRef}` } }
            : { state }
        },
      },
    })
  }
}

/** T02: the device-local bootstrap read (runtime enum, auth status, requested theme/density).
 *  No matter or session authority exists here: the request-scoped caller plus a ready,
 *  uncontaminated frame with an unmoved generation are the whole admission, and a read that
 *  races an identity or frame change is discarded instead of presented. */
function createLocalSystemBootstrapRunner(options: SageAppServiceOptions): () => Promise<Response> {
  return async () => {
    const correlation = options.callerBinding?.correlation ?? randomUUID()
    const result = await admitLocalSystemRead<LocalSystemBootstrapState>({
      correlation,
      validatesReadValue: isLocalSystemBootstrapState,
      ports: {
        verifyCaller: async () => {
          const binding = options.callerBinding
          return binding === undefined || binding === null
            ? { state: 'unavailable' as const }
            : { state: 'allowed' as const, value: { bindingRef: binding.correlation } }
        },
        verifyFrame: async () => {
          const frame = options.framePolicySnapshot?.()
          return frame === undefined || !frame.ready || frame.contaminated
            ? { state: 'unavailable' as const }
            : { state: 'allowed' as const, value: { frameGeneration: frame.generation } }
        },
        read: async () => {
          const beforeStatus = options.vault.status()
          const preferences = options.preferences?.()
          if (preferences === undefined) return { state: 'unavailable' as const }
          // Identity may not flip between the two observations; a torn read stays unavailable.
          if (options.vault.status() !== beforeStatus) return { state: 'unavailable' as const }
          return {
            state: 'allowed' as const,
            value: {
              runtime: { status: options.viewState?.status ?? 'unavailable' },
              auth: { status: beforeStatus },
              display: { theme: preferences.requested.theme, density: preferences.requested.density },
            },
          }
        },
        checkPostReadFreshness: async (frameGeneration) => {
          const frame = options.framePolicySnapshot?.()
          if (frame === undefined || !frame.ready || frame.contaminated) return { state: 'unavailable' as const }
          return frame.generation === frameGeneration ? { state: 'allowed' as const } : { state: 'stale' as const }
        },
      },
    })
    return result.state === 'read'
      ? serviceJson(result.value, 200)
      : serviceJson({ code: result.code, stage: result.stage, retryable: result.retryable, correlation: result.correlation }, 200)
  }
}

/** Device-local preference read. It deliberately shares no matter/session admission: a verified
 * caller plus one ready, uncontaminated, unmoved frame may read the sealed device record while
 * signed out. Identity-status or frame-generation movement during the read discards the value. */
function createDevicePreferencesRunner(options: SageAppServiceOptions): () => Promise<Response> {
  return async () => {
    const correlation = options.callerBinding?.correlation ?? randomUUID()
    const result = await admitLocalSystemRead<DevicePreferencesState>({
      correlation,
      unavailableCode: 'device-preferences-unavailable',
      validatesReadValue: isDevicePreferencesState,
      ports: {
        verifyCaller: async () => {
          const binding = options.callerBinding
          return binding === undefined || binding === null
            ? { state: 'unavailable' as const }
            : { state: 'allowed' as const, value: { bindingRef: binding.correlation } }
        },
        verifyFrame: async () => {
          const frame = options.framePolicySnapshot?.()
          return frame === undefined || !frame.ready || frame.contaminated
            ? { state: 'unavailable' as const }
            : { state: 'allowed' as const, value: { frameGeneration: frame.generation } }
        },
        read: async () => {
          const beforeStatus = options.vault.status()
          const preferences = options.preferences?.()
          if (preferences === undefined || options.vault.status() !== beforeStatus) {
            return { state: 'unavailable' as const }
          }
          return {
            state: 'allowed' as const,
            value: {
              requested: preferences.requested,
              savedAt: preferences.savedAt,
              effectiveTheme: preferences.effectiveTheme,
            },
          }
        },
        checkPostReadFreshness: async (frameGeneration) => {
          const frame = options.framePolicySnapshot?.()
          if (frame === undefined || !frame.ready || frame.contaminated) return { state: 'unavailable' as const }
          return frame.generation === frameGeneration ? { state: 'allowed' as const } : { state: 'stale' as const }
        },
      },
    })
    return result.state === 'read'
      ? serviceJson(result.value, 200)
      : serviceJson({ code: result.code, stage: result.stage, retryable: result.retryable, correlation: result.correlation }, 200)
  }
}

/** The DTO is closed: three exact sub-objects, no name, credential, session, configuration,
 *  workspace or business field can slip through validation. */
function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  return keys.length === expected.length && keys.every((key, index) => key === expected[index])
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

function isLocalSystemBootstrapState(value: unknown): value is LocalSystemBootstrapState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (!hasExactKeys(record, ['auth', 'display', 'runtime'])) return false
  const runtime = record.runtime as { readonly status?: unknown } | null | undefined
  const auth = record.auth as { readonly status?: unknown } | null | undefined
  const display = record.display as { readonly theme?: unknown, readonly density?: unknown } | null | undefined
  return typeof runtime === 'object' && runtime !== null
    && hasExactKeys(runtime as Record<string, unknown>, ['status'])
    && SAGE_RUNTIME_STATUSES.includes(runtime.status as SageRuntimeStatus)
    && typeof auth === 'object' && auth !== null
    && hasExactKeys(auth as Record<string, unknown>, ['status'])
    && (auth.status === 'signed-in' || auth.status === 'signed-out' || auth.status === 'pending')
    && typeof display === 'object' && display !== null
    && hasExactKeys(display as Record<string, unknown>, ['density', 'theme'])
    && (display.theme === 'light' || display.theme === 'dark' || display.theme === 'system')
    && (display.density === 'comfortable' || display.density === 'compact')
}

function isDevicePreferencesState(value: unknown): value is DevicePreferencesState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (!hasExactKeys(record, ['effectiveTheme', 'requested', 'savedAt'])) return false
  const requested = record.requested
  if (requested === null || typeof requested !== 'object' || Array.isArray(requested)) return false
  const fields = requested as Record<string, unknown>
  return hasExactKeys(fields, ['contentWidth', 'density', 'fileIcons', 'fontStyle', 'iconAppearance', 'language', 'terminalTheme', 'theme'])
    && (fields.theme === 'light' || fields.theme === 'dark' || fields.theme === 'system')
    && (fields.language === 'zh' || fields.language === 'en')
    && (fields.density === 'comfortable' || fields.density === 'compact')
    && (fields.fontStyle === 'sans' || fields.fontStyle === 'serif')
    && (fields.contentWidth === 'standard' || fields.contentWidth === 'wide')
    && (fields.terminalTheme === 'follow' || fields.terminalTheme === 'manual')
    && (fields.fileIcons === 'product' || fields.fileIcons === 'material')
    && (fields.iconAppearance === 'system' || fields.iconAppearance === 'light' || fields.iconAppearance === 'dark')
    && (record.savedAt === null || isCanonicalIsoTimestamp(record.savedAt))
    && (record.effectiveTheme === null || record.effectiveTheme === 'light' || record.effectiveTheme === 'dark')
}

/** AUTH-02A/02B assemble caller/context/candidate checks for the admitted session family. Later
 * authority ports remain absent, and composition withholds dispatch, so production stays
 * unavailable-first. Every request rechecks the identity session, current revision, default link,
 * fresh workspace fold and renderer frame before the active snapshot can be reused. */
function createSessionCoreProtectedEffectPorts(
  options: SageAppServiceOptions,
): {
  readonly ports: ProtectedEffectAdmissionPorts
  readonly prepareSessionPrompt?: SessionPrepareRunner
} {
  // Shared re-verification reads for steps 9 and 10 (ADR-0288/0289): one closure set, one home.
  const reverifyReads = options.activeMatterContext === undefined
    || options.framePolicySnapshot === undefined
    || options.sessionPromptAttempts === undefined
    || options.runtimeEffective === undefined
    ? undefined
    : {
        readContext: () => {
          const snapshot = options.activeMatterContext?.snapshot()
          if (snapshot === undefined || snapshot === null || snapshot.sessionRef === null) return null
          return {
            sessionRef: snapshot.sessionRef,
            matterRef: snapshot.matterId,
            revisionRef: snapshot.revisionId,
            contextGeneration: snapshot.contextGeneration,
            frameGeneration: snapshot.frameGeneration,
          }
        },
        readIdentitySession: () => options.vault.identitySession(),
        readFrame: () => options.framePolicySnapshot?.(),
        runtimeEffective: options.runtimeEffective,
        attempts: options.sessionPromptAttempts,
      }
  // The cheap real ports are built once and shared: the dispatch step re-invokes the same
  // instances at the dispatch instant (ADR-0289) instead of running a second implementation.
  const targetPort = options.authority === undefined || options.requirementBundle === undefined
    ? undefined
    : createSessionPromptTargetPort({
        bundle: options.requirementBundle,
        now: options.authority.now,
      })
  const registryPort = options.requirementBundle === undefined
    || options.capabilityRegistry === undefined
    || options.runtimeInventoryObservation === undefined
    ? undefined
    : createSessionPromptRegistryPort({
        requirementBundle: options.requirementBundle,
        registryProvider: options.capabilityRegistry,
        runtimeObservation: options.runtimeInventoryObservation,
      })
  const preflightPort = options.requirementBundle === undefined || options.runtimeEffective === undefined
    ? undefined
    : createSessionPromptPreflightPort({
        requirementBundle: options.requirementBundle,
        runtimeEffective: options.runtimeEffective,
      })
  const verifyCallerPort: NonNullable<ProtectedEffectAdmissionPorts['verifyCaller']> = async () => {
      const binding = options.callerBinding
      return binding === undefined || binding === null
        ? { state: 'unavailable' as const }
        : { state: 'allowed' as const, value: { bindingRef: binding.correlation } }
  }
  const activeContextPort: NonNullable<ProtectedEffectAdmissionPorts['resolveActiveContext']> = async ({ caller }) => {
      const binding = options.callerBinding
      if (binding === undefined || binding === null || caller.bindingRef !== binding.correlation) {
        return { state: 'denied' as const }
      }
      const snapshot = options.activeMatterContext?.snapshot()
      if (snapshot === undefined || snapshot === null || snapshot.sessionRef === null) {
        return { state: 'unavailable' as const }
      }
      const identitySession = options.vault.identitySession()
      if (identitySession === null) return { state: 'unavailable' as const }
      // A login identity handle is not an authorization actor scope. Only the session binding is
      // comparable here; the independent policy stage must bind actorScopeRef later.
      if (identitySession.sessionRef !== snapshot.sessionRef) return { state: 'stale' as const }

      const currentRevision = options.matterRehydrate?.({
        matterId: snapshot.matterId,
        revisionId: snapshot.revisionId,
      })
      if (currentRevision === undefined) return { state: 'unavailable' as const }
      if ('denied' in currentRevision || !currentRevision.current) return { state: 'stale' as const }

      const links = options.matterLinks?.()
      if (links === undefined || links.state !== 'read') return { state: 'unavailable' as const }
      const defaults = links.links.filter((link) => link.matterRef === snapshot.matterId && link.isDefault)
      if (
        defaults.length !== 1
        || defaults[0]?.workspaceRef !== snapshot.workspaceRef
        || defaults[0]?.workspacePath !== snapshot.trustedWorkspaceRoot
      ) return { state: 'stale' as const }

      const readWorkspaceList = options.workspaceList
      if (readWorkspaceList === undefined) return { state: 'unavailable' as const }
      let workspaces: WorkspaceListStatus
      try {
        workspaces = await readWorkspaceList()
      } catch {
        return { state: 'unavailable' as const }
      }
      if (workspaces.state !== 'read') return { state: 'unavailable' as const }
      const matches = workspaces.entries.filter((entry) => entry.workspaceId === snapshot.workspaceRef)
      if (matches.length !== 1 || matches[0]?.path !== snapshot.trustedWorkspaceRoot) {
        return { state: 'stale' as const }
      }

      const frame = options.framePolicySnapshot?.()
      if (frame === undefined || !frame.ready || frame.contaminated) return { state: 'unavailable' as const }
      if (snapshot.frameGeneration !== frame.generation) return { state: 'stale' as const }
      return {
        state: 'allowed' as const,
        value: {
          scope: 'request' as const,
          callerBindingRef: binding.correlation,
          sessionRef: snapshot.sessionRef,
          matterRef: snapshot.matterId,
          revisionRef: snapshot.revisionId,
          generation: String(snapshot.contextGeneration),
        },
      }
  }
  const candidatePort: NonNullable<ProtectedEffectAdmissionPorts['matchCandidate']> = async ({ context }) => {
      const active = options.activeMatterContext
      const frame = options.framePolicySnapshot?.()
      const snapshot = active?.snapshot()
      if (active === undefined || frame === undefined || !frame.ready || frame.contaminated || snapshot === undefined || snapshot === null || snapshot.sessionRef === null) {
        return { state: 'unavailable' as const }
      }
      if (
        snapshot.frameGeneration !== frame.generation
        || String(snapshot.contextGeneration) !== context.generation
        || snapshot.sessionRef !== context.sessionRef
        || snapshot.matterId !== context.matterRef
        || snapshot.revisionId !== context.revisionRef
      ) return { state: 'stale' as const }
      const matched = active.match({
        contextGeneration: snapshot.contextGeneration,
        actorScopeRef: snapshot.actorScopeRef,
        matterId: snapshot.matterId,
        revisionId: snapshot.revisionId,
        workspaceRef: snapshot.workspaceRef,
        sessionRef: snapshot.sessionRef,
        frameGeneration: snapshot.frameGeneration,
      })
      if (!matched.ok) return { state: 'stale' as const }
      return {
        state: 'allowed' as const,
        value: { candidateRef: `active:${context.matterRef}:${context.revisionRef}:${context.generation}` },
      }
  }
  // T05 first cut: the real Identity / Policy step for registered session-family operations.
  // Without the instance authority option the step stays absent, exactly as before.
  const identityPolicyPort = options.authority === undefined
    ? undefined
    : createSessionCoreIdentityPort({ vault: options.vault, authority: options.authority })
  const sessionCorePorts = {
    verifyCaller: verifyCallerPort,
    resolveActiveContext: activeContextPort,
    matchCandidate: candidatePort,
    ...(identityPolicyPort === undefined ? {} : { resolveIdentityPolicy: identityPolicyPort }),
  }
  // T05 prepare (ADR-0290): the governed local preparation write rides these SAME front ports.
  const prepareSessionPrompt = options.callerBinding === undefined || options.callerBinding === null
    || options.authority === undefined
    || options.sessionPromptAttempts === undefined
    || options.requirementBundle === undefined
    || identityPolicyPort === undefined
    ? undefined
    : createSessionPromptPrepareRunner({
        ports: sessionCorePorts,
        attempts: options.sessionPromptAttempts,
        requirementBundle: options.requirementBundle,
        callerCorrelation: options.callerBinding.correlation,
        now: options.authority.now,
      })
  const ports: ProtectedEffectAdmissionPorts = {
    ...sessionCorePorts,
    // T05-mid: the real target step over the shipped requirement bundle (ADR-0282). The target
    // step rides the same instance clock as the identity step; without the authority switch the
    // chain already stops at identity, so the target port is wired only when both exist.
    ...(targetPort === undefined ? {} : { resolveTarget: targetPort }),
    // T05-mid step 6: the real compatibility step over the shipped matrix publication (ADR-0284).
    // Wired only when every main-owned input exists; any missing piece keeps the step absent.
    ...(options.authority === undefined
      || options.requirementBundle === undefined
      || options.compatibilityPublication === undefined
      || options.runtimeInventoryObservation === undefined
      || options.revisionDigest === undefined
      ? {}
      : {
          resolveCompatibility: createSessionPromptCompatibilityPort({
            authority: options.authority,
            requirementBundle: options.requirementBundle,
            matrixPublication: options.compatibilityPublication,
            runtimeObservation: options.runtimeInventoryObservation,
            revisionDigest: options.revisionDigest,
            now: options.authority.now,
          }),
        }),
    // T05-mid step 7: the real registry step over the shipped first-party publication (ADR-0286).
    // Wired only when every main-owned input exists; any missing piece keeps the step absent.
    ...(registryPort === undefined ? {} : { resolveRegistry: registryPort }),
    // T05-mid step 8: the real preflight step over the live runtime-effective observation of the
    // Host epoch (ADR-0287). Wired only when the bundle and the live read both exist.
    ...(preflightPort === undefined ? {} : { preflight: preflightPort }),
    // T05-mid step 9: the persistence step — pre-write re-verification plus the atomic
    // attempt + evaluation-evidence append (ADR-0288). Every main-owned input must exist.
    ...(options.authority === undefined
      || options.requirementBundle === undefined
      || options.compatibilityPublication === undefined
      || options.runtimeEffective === undefined
      || options.sessionPromptAttempts === undefined
      || reverifyReads === undefined
      ? {}
      : {
          persist: createSessionPromptPersistencePort({
            requirementBundle: options.requirementBundle,
            publication: options.compatibilityPublication,
            ...reverifyReads,
            now: options.authority.now,
          }),
        }),
    // T05-mid step 10: the dispatch step — the only place the admitted chain calls the real
    // channel (ADR-0289). Wired only when the channel port and every re-verification input exist.
    ...(reverifyReads === undefined
      || options.sessionSend === undefined
      || options.matterLinks === undefined
      || targetPort === undefined
      || registryPort === undefined
      || preflightPort === undefined
      ? {}
      : {
          dispatch: createSessionPromptDispatchPort({
            ...reverifyReads,
            sessionSend: options.sessionSend,
            resolveTarget: targetPort,
            resolveRegistry: registryPort,
            preflight: preflightPort,
            readWorkspaceRoot: (matterRef) => {
              const links = options.matterLinks?.()
              if (links === undefined || links.state !== 'read') return undefined
              const defaults = links.links.filter((link) => link.matterRef === matterRef && link.isDefault)
              return defaults.length === 1 ? defaults[0]?.workspacePath : undefined
            },
          }),
        }),
  }
  return {
    ports,
    ...(prepareSessionPrompt === undefined ? {} : { prepareSessionPrompt }),
  }
}

/** Assemble providers for one request; callers pass a fresh `viewState` per evaluation. */
export function createSageAppServiceProviders(options: SageAppServiceOptions): ServiceProviders {
  const { viewState, vault, adapter } = options
  // One assembly per request; the prepare runner shares the exact same front ports.
  const sessionCoreAssembly = createSessionCoreProtectedEffectPorts(options)
  return createUnavailableFirstService(viewState, {
    authSnapshot: () => vault.status() === 'pending'
      ? { status: 'pending' as const, displayName: null }
      : vault.snapshot(),
    activeMatterContext: (): ActiveMatterContextStatus => {
      const context = options.activeMatterContext
      if (context === undefined) return { state: 'unavailable', contextGeneration: null }
      const projection = context.projection()
      return projection === null
        ? { state: 'inactive', contextGeneration: context.contextGeneration() }
        : { state: 'active', ...projection }
    },
    ...(options.selectActiveMatter === undefined ? {} : { selectActiveMatter: options.selectActiveMatter }),
    runProjectionRead: createProjectionReadRunner(options),
    bootstrapRead: createLocalSystemBootstrapRunner(options),
    devicePreferencesRead: createDevicePreferencesRunner(options),
    protectedEffectPorts: sessionCoreAssembly.ports,
    ...(sessionCoreAssembly.prepareSessionPrompt === undefined
      ? {}
      : { prepareSessionPrompt: sessionCoreAssembly.prepareSessionPrompt }),
    protectedEffectCorrelation: () => options.callerBinding?.correlation ?? randomUUID(),
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
      const active = options.activeMatterContext
      const snapshot = active?.snapshot()
      if (active !== undefined && snapshot !== undefined && snapshot !== null) {
        active.invalidate({
          expected: {
            contextGeneration: snapshot.contextGeneration,
            actorScopeRef: snapshot.actorScopeRef,
            matterId: snapshot.matterId,
            revisionId: snapshot.revisionId,
            workspaceRef: snapshot.workspaceRef,
            sessionRef: snapshot.sessionRef,
            frameGeneration: snapshot.frameGeneration,
          },
        })
      }
      vault.signOut()
      return serviceJson({ auth: 'signed-out' }, 200)
    },
  })
}
