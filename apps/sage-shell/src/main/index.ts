/** Sage Electron shell: custom protocol, one window, host child lifecycle. */

import { existsSync, readFileSync } from 'node:fs'
import { createProjectionReadPolicy, type ProjectionReadPolicy } from './projection-read-policy.js'
import { readdir, realpath, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, dialog, nativeTheme, protocol, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import { ensureSageDirectoriesSync, readActiveProfile, resolveSagePaths, type SagePaths } from '../profile/paths.js'
import { assertBundledProfileAdmissibleSync, installBundledProfileTemplate } from '../profile/bundled-profile.js'
import type { SageViewState } from '../product/contracts.js'
import type { DraftRecord } from './draft-store.js'
import type { DraftStatus, WorkspaceListStatus } from '../appservice/contracts.js'
import type { SageActionIntentV2, SageDispatchIntent } from '../appservice/command-contracts.js'
import { handleSageServiceRequest, isSageServicePath } from '../appservice/route-skeleton.js'
import { ShellHostProcess, type ShellHostRuntimeSnapshot } from './host-process.js'
import { isRuntimeEffectiveObservation } from '../protocol.js'
import { MATTER_STORE_BUSY_TIMEOUT_MS, MATTER_STORE_MAX_PAYLOAD_BYTES, MATTER_STORE_MAX_STREAM_EVENTS, createMatterRehydratePort } from './matter-rehydrate-port.js'
import { createSessionPromptAttemptStore } from './session-prompt-attempt-store.js'
import { createSessionTurnClose } from './session-turn-close.js'
import { createSessionSendReconcile } from './session-send-reconcile.js'
import { createSessionPromptPrepareEnsure } from './session-prompt-prepare.js'
import { createRevisionDigestReader } from './revision-digest-reader.js'
import { openBusinessMatterEventStore } from '../persistence/business-matter-event-store.js'
import { createMatterCustody } from './matter-custody.js'
import { createSessionCoreIdentityPort } from './session-core-identity.js'
import { loadSessionPromptCapabilityRegistry, loadSessionPromptCompatibilityPublication, loadSessionPromptRequirementBundle } from './publication-bundle.js'
import { createBundledCapabilityRegistryProvider } from '../security/capability-registry-provider.js'
import { classifySettingsDescribe, classifySettingsDescribeFailure } from './settings-readout.js'
import { createWorkspaceAdoption } from './workspace-adoption.js'
import { createWorkspaceMutations } from './workspace-mutations.js'
import { createFileCandidates, createFileReferences } from './workspace-files.js'
import { createDraftStore } from './draft-store.js'
import { createSessionChannel, type SessionAttachmentInput } from './session-channel.js'
import { createAttachments } from './attachments.js'
import { createArtifacts } from './artifacts.js'
import { createSearch } from './search.js'
import { createMatterList } from './matter-list.js'
import { createSideChats } from './side-chats.js'
import { createActionConfirmationStore } from '../appservice/action-confirmations.js'
import { createEditDrafts } from './edit-drafts.js'
import { createActionItems } from './action-items.js'
import { createMatterProjects } from './matter-projects.js'
import { createMatterAdmin } from './matter-admin.js'
import { createMatterGroups } from './matter-groups.js'
import { shapeRunMonitor } from './run-monitor.js'
import { createRunLogs } from './run-logs.js'
import { createPlans } from './plans.js'
import { createArtifactPreview } from './artifact-preview.js'
import { createPreviewContainer, createPreviewWindowContainer } from './preview-window.js'
import { createExternalLinks } from './external-links.js'
import { createSessionHistory } from './session-history.js'
import { createClarifications } from './clarifications.js'
import { createSessionAnchors } from './session-anchors.js'
import { createSessionEdits } from './session-edits.js'
import { createInputSelections } from './input-selections.js'
import { createPlanMode } from './plan-mode.js'
import { createSiteTemplates } from './site-templates.js'
import { createApprovals } from './approvals.js'
import { createModelQueue } from './model-queue.js'
import { createTerminal } from './terminal.js'
import { createFeedback } from './feedback.js'
import { createPendingInputs } from './pending-inputs.js'
import { createPreferences } from './preferences.js'
import type { PreferenceValues } from './preferences.js'
import { createDisplayThemeAdapter } from './display-theme.js'
import { listSettingsLeaves } from './settings-leaves.js'
import { createMatterLinkStore } from './matter-workspace-links.js'
import { classifyDiagnostics, classifyPlugins, classifyVisibility } from './sage-readout.js'
import { loadOrganizationPolicy } from './organization-policy.js'
import { readWorkspaceList } from './workspace-list.js'
import { resolveHostRuntime, resolveSageElectronPaths } from './runtime.js'
import { routeSchemeRequest } from './route.js'
import { FramePolicy } from './frame-policy.js'
import { verifySageServiceCaller } from './appservice-binding.js'
import { createSageWindow, loadTrustedUrl } from './window.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { createProductionAdapter } from './oidc-runtime.js'
import { createTokenVault } from './token-vault.js'
import { createIdentityRegistry } from './identity-registry.js'
import { createSageAppServiceProviders, resolveFixtureProjection } from './app-service.js'
import { createHostLiveInventoryProjectionProvider } from './runtime-inventory.js'
import { createRuntimeInventoryProvider, type RuntimeInventoryResult } from './runtime-inventory-provider.js'
import { createActiveMatterContext } from './active-matter-context.js'
import { selectActiveMatter as selectActiveMatterContext } from './active-matter-selection.js'
import { projectionReadScope } from './projection-read-scope.js'
import { SANBAO_SCHEME_REGISTRATION } from './sanbao-surface.js'
import { assertDesktopBundleAvailable, serveDesktopDocument } from './desktop-document.js'

const SCHEME = 'dsh-app'

// 单一调用纪律（2026-10-05 实测，ADR-0263 Note「首批战果」）：registerSchemesAsPrivileged
// 只能调用一次——第二次调用会清除此前 scheme 的 fetch 特权。dsh-app 与 sage-sanbao 必须
// 在这唯一一次调用里一起注册；回归守卫见 test/scheme-registration-single-call.spec.ts。
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: false,
    stream: true,
    codeCache: true,
  },
}, SANBAO_SCHEME_REGISTRATION])

/** Configure Electron storage before its ready event can initialize Chromium defaults. */
function configureElectronPaths(paths: SagePaths): void {
  const electron = resolveSageElectronPaths(paths)
  app.setPath('userData', electron.userData)
  app.setPath('sessionData', electron.sessionData)
  app.setPath('crashDumps', electron.crashDumps)
  app.setAppLogsPath(electron.logs)
}

/** Project the main-owned host snapshot into the renderer-facing runtime state. */
function toSageViewState(snapshot: ShellHostRuntimeSnapshot): SageViewState {
  if (snapshot.kind === 'active') {
    return { status: 'ready', message: `dsh ${snapshot.harnessVersion}`, retryable: true }
  }
  return { status: 'unavailable', message: snapshot.reason, retryable: snapshot.reason !== 'stopped' }
}

async function main(paths: SagePaths): Promise<void> {
  const activeProfile = await readActiveProfile(paths)
  if (activeProfile === null) {
    throw new Error('sage shell: no active Sage profile — run pnpm run materialize before launching')
  }
  const runtime = resolveHostRuntime({
    execPath: process.execPath,
    paths,
    activeProfile,
    env: process.env,
  })
  const host = new ShellHostProcess(runtime)
  const ready = await host.start()
  process.stdout.write(`sage shell: host ready, dsh ${ready.dshVersion}\n`)

  // Step-3 wiring: the Sage-owned matter store becomes the real rehydrate provider. It opens
  // lazily on first command, so a broken store degrades to the fail-closed denial instead of
  // blocking startup; steps 4-10 keep their fail-closed ports.
  const matterRehydrate = createMatterRehydratePort({ sagePaths: paths })
  // T04: the creation half of the same store — the custodian for home-page matter creation.
  const matterCustody = createMatterCustody({ sagePaths: paths })
  // ADR-0288: the persist step's own store handle; mirrors the rehydrate port's lazy-open shape.
  const sessionPromptAttempts = createSessionPromptAttemptStore({ sagePaths: paths })
  // ADR-0293: the turn-end closure runner — completes the attempt when the session fold reports
  // a terminal turn end, so the next send may start.
  const sessionTurnClose = createSessionTurnClose({
    attempts: sessionPromptAttempts,
    now: () => new Date().toISOString(),
  })
  // ADR-0293 (alternative C): the next send heals a stuck attempt the observer never saw.
  const sessionSendReconcile = createSessionSendReconcile({
    attempts: sessionPromptAttempts,
    readChannel: (matterRef: string) => sessionChannel.read({ matterRef }),
    close: sessionTurnClose,
  })
  app.on('will-quit', () => { matterRehydrate.close(); matterCustody.close(); sessionPromptAttempts.close(); revisionDigestStore?.close() })

  // C2D.2A (ADR-0277) + first-party publication (ADR-0285): the bundled default stays the honest
  // empty set; a shipped published snapshot (kernel-valid and re-seal-proven) supersedes it for
  // this instance. Non-empty entries only ever arrive as published snapshots, never as constants.
  const capabilityRegistryPublication = loadSessionPromptCapabilityRegistry()
  if (!capabilityRegistryPublication.ok) {
    process.stdout.write(`sage shell: capability registry publication unavailable: ${capabilityRegistryPublication.reason}\n`)
  }
  const bundledRegistry = createBundledCapabilityRegistryProvider(
    capabilityRegistryPublication.ok ? capabilityRegistryPublication.snapshotBody : undefined,
  )
  // WT-02C.2E.2: one main-owned composition read of the full runtime inventory. It never
  // blocks startup and emits exactly one stable, non-sensitive stdout line.
  let runtimeInventoryResult: RuntimeInventoryResult | undefined
  const runtimeInventory = createRuntimeInventoryProvider({
    paths,
    hostProjection: createHostLiveInventoryProjectionProvider({
      paths,
      host,
      clock: { now: () => new Date().toISOString() },
    }),
    pmapFs: {
      readFileBytes: (path) => readFile(path),
      listDirectory: async (path) => (await readdir(path, { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        isSymbolicLink: entry.isSymbolicLink(),
      })),
      realpath: (path) => realpath(path),
    },
    readFileBytes: (path) => readFileSync(path),
    runtimeEffective: { read: () => host.readRuntimeEffective() },
    registry: { read: () => bundledRegistry.read() },
  })
  void runtimeInventory.read().then((result) => {
    runtimeInventoryResult = result
    process.stdout.write(result.kind === 'available'
      ? 'sage shell: runtime inventory available\n'
      : `sage shell: runtime inventory unavailable (${result.code})\n`)
  }).catch(() => {
    process.stdout.write('sage shell: runtime inventory unavailable (assembly-invalid)\n')
  })

  // T05-mid (ADR-0282): the shipped C2.2T requirement publication, read and kernel-parsed once at
  // startup. A failed load is logged and forwarded as-is; the target step stays present but
  // unavailable-first, and no later request re-reads or repairs the bundle.
  const requirementBundle = loadSessionPromptRequirementBundle()
  if (!requirementBundle.ok) {
    process.stdout.write(`sage shell: requirement bundle unavailable: ${requirementBundle.reason}\n`)
  }

  // T05-mid step 6 (ADR-0284): the shipped matrix/revocation publication plus the main-owned
  // revision-digest surface. The reader's store opens lazily on first compatibility evaluation;
  // an unopenable store is a missing provider (undefined), never a fabricated digest.
  const compatibilityPublication = loadSessionPromptCompatibilityPublication()
  if (!compatibilityPublication.ok) {
    process.stdout.write(`sage shell: compatibility publication unavailable: ${compatibilityPublication.reason}\n`)
  }
  let revisionDigestReader: ReturnType<typeof createRevisionDigestReader> | undefined
  let revisionDigestStore: ReturnType<typeof openBusinessMatterEventStore> | undefined
  let revisionDigestOpenFailed = false
  const revisionDigestFor = (matterId: string, revisionId: string): string | undefined => {
    if (revisionDigestReader === undefined) {
      if (revisionDigestOpenFailed) return undefined
      try {
        revisionDigestStore = openBusinessMatterEventStore({
          sagePaths: paths,
          maxStreamEvents: MATTER_STORE_MAX_STREAM_EVENTS,
          maxPayloadBytes: MATTER_STORE_MAX_PAYLOAD_BYTES,
          busyTimeoutMs: MATTER_STORE_BUSY_TIMEOUT_MS,
          clock: () => new Date().toISOString(),
        })
        revisionDigestReader = createRevisionDigestReader({ store: revisionDigestStore })
      } catch {
        revisionDigestOpenFailed = true
        return undefined
      }
    }
    if (revisionDigestReader === undefined) return undefined
    return revisionDigestReader.revisionDigest(matterId, revisionId)
  }

  // CTX-01A: the active matter has one generation-bound owner in Electron main. This batch does
  // not add an activation route or infer one from the newest draft, so it starts inactive and all
  // session-core effects remain unavailable until a later approved selection owner is wired.
  const activeMatterContext = createActiveMatterContext()
  const invalidateActiveMatterContext = (): void => {
    const snapshot = activeMatterContext.snapshot()
    if (snapshot === null) return
    activeMatterContext.invalidate({
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
  const framePolicy = new FramePolicy({
    onContamination: (reason, generation) => {
      invalidateActiveMatterContext()
      process.stdout.write(`sage shell: frame policy contaminated generation ${generation}: ${reason}\n`)
    },
  })

  // WT-02D.1: the fixture switch only fills the read-only matter slot for local verification;
  // it can never satisfy production authority and is read once at startup.
  const fixtureProjection = resolveFixtureProjection(process.env)

  // Ticket 002: the device-local draft store. Signed out means locked: the product neither reads
  // nor writes a draft until the identity is established again (US-011).
  const drafts = createDraftStore({
    draftsDir: paths.draftsDir,
    now: () => new Date().toISOString(),
    nextId: () => randomUUID(),
    randomKey: () => randomBytes(32),
  })
  const signedIn = (): boolean => vault.status() === 'signed-in'
  const toDraftStatus = (gate: { readonly state: 'locked' } | { readonly state: 'ready', readonly drafts: readonly DraftRecord[] }): DraftStatus =>
    gate.state === 'locked'
      ? { state: 'locked' as const, drafts: [] }
      : {
          state: 'unlocked' as const,
          drafts: gate.drafts.map((draft) => ({
            draftId: draft.draftId,
            fields: draft.fields,
            clarification: draft.clarification,
            history: draft.history,
            status: draft.status,
            matterRef: draft.matterRef,
            attempt: draft.attempt ?? null,
            complete: draft.fields.goal.trim() !== '' && draft.fields.deliverable.trim() !== '' && draft.fields.responsibility.trim() !== '',
            createdAt: draft.createdAt,
            updatedAt: draft.updatedAt,
          })),
        }
  const draftWiring = {
    draftList: () => toDraftStatus(drafts.list(signedIn())),
    draftCreate: (request: { readonly rawInput: string }) => {
      const gate = drafts.create(request.rawInput, signedIn())
      return gate === undefined ? undefined : toDraftStatus(gate)
    },
    draftUpdate: (request: {
      readonly draftId: string
      readonly fields?: { readonly goal?: string, readonly deliverable?: string, readonly responsibility?: string, readonly projectRef?: string }
      readonly clarification?: string
      readonly selectedEntryIds?: readonly string[]
    }) => {
      const gate = drafts.update(request.draftId, {
        ...(request.fields === undefined ? {} : { fields: request.fields }),
        ...(request.clarification === undefined ? {} : { clarification: request.clarification }),
        ...(request.selectedEntryIds === undefined ? {} : { selectedEntryIds: request.selectedEntryIds }),
      }, signedIn())
      return gate === undefined ? undefined : toDraftStatus(gate)
    },
    draftPrepareConversion: (request: { readonly draftId: string }) => drafts.prepareConversion(request.draftId, signedIn()),
    draftBeginAttempt: (request: { readonly draftId: string, readonly correlation: string }) => { drafts.beginAttempt(request.draftId, request.correlation) },
    draftNoteAttempt: (request: { readonly draftId: string, readonly correlation: string, readonly state: 'unknown' | 'failed' }) => { drafts.noteAttempt(request.draftId, request.correlation, request.state) },
    draftCancelAttempt: (request: { readonly draftId: string }) => {
      const record = drafts.cancelAttempt(request.draftId)
      return record === undefined ? undefined : toDraftStatus({ state: 'ready', drafts: [record] })
    },
    // T04: reconcile asks the real custodian (the Sage-owned authoritative store) about the same
    // request. An unobserved creation stays unknown — never a settled guess.
    reconcileDraftCreation: (request: { readonly draftId: string, readonly correlation: string }) => matterCustody.reconcileCreation(request),
    draftCommitConversion: (request: { readonly draftId: string, readonly matterRef: string }) => { drafts.commitConversion(request.draftId, request.matterRef) },
  }

  // Ticket 011: Sage-owned matter ↔ workspace links. The trail is the store; the fold is the
  // current association set. Paths come from the adopted-workspace fold, never from a file read.
  const matterLinks = createMatterLinkStore({
    linksDir: join(paths.root, 'matter-links'),
    now: () => new Date().toISOString(),
    nextId: () => randomUUID(),
  })
  // Ticket 005: the session channel. Bindings persist so a restart reuses the session and never
  // re-sends; the ack the surface shows comes from the base's own prompt receipt.
  // Ticket 020: the desktop observation main owns (US-111) plus the device preference record.
  const preferences = createPreferences({
    file: join(paths.root, 'preferences', 'display.prefs'),
    now: () => new Date().toISOString(),
    randomKey: () => randomBytes(32),
  })
  const observedSystemDark = (): boolean | null => nativeTheme.shouldUseDarkColors === undefined ? null : nativeTheme.shouldUseDarkColors
  const displayTheme = createDisplayThemeAdapter(nativeTheme)
  const restoredTheme = displayTheme.apply(preferences.snapshot(observedSystemDark()).requested.theme)
  if (restoredTheme.state !== 'applied') {
    throw new Error(`sage shell: display theme unavailable (${restoredTheme.code})`)
  }
  const preferenceWiring = {
    preferences: () => preferences.snapshot(observedSystemDark()),
    preferencesSave: (request: Partial<PreferenceValues>) => {
      const saved = preferences.save(request, observedSystemDark())
      if (saved === undefined) return undefined
      const applied = displayTheme.apply(saved.requested.theme)
      if (applied.state !== 'applied') return undefined
      return preferences.snapshot(observedSystemDark())
    },
  }

  const pendingInputs = createPendingInputs({
    pendingDir: join(paths.root, 'pending-inputs'),
    now: () => new Date().toISOString(),
    nextId: () => randomUUID(),
    randomKey: () => randomBytes(32),
  })
  const sessionChannel = createSessionChannel(
    (endpoint, payload) => host.bridgeCall(endpoint, payload),
    {
      bindingsFile: join(paths.root, 'sessions', 'bindings.json'),
      now: () => new Date().toISOString(),
      nextId: () => randomUUID(),
      streamCall: (endpoint, payload, onFrame) => host.bridgeStream(endpoint, payload, onFrame),
      pending: pendingInputs,
    },
  )
  // READ-01A: reads may only obtain their matter from the current admitted request. Throwing here
  // is a second fail-closed boundary if a future route calls a raw provider outside the runner.
  const scopedMatterRef = (): string => {
    const scope = projectionReadScope.current()
    if (scope === undefined) throw new Error('projection read scope unavailable')
    return scope.matterRef
  }
  // The two local selection-preference writes are not projection reads. They still require the
  // explicitly selected ActiveContext and refuse while it is absent; they never create an empty
  // or draft-recency bucket.
  const selectedMatterRef = (): string | undefined => activeMatterContext.snapshot()?.matterId
  // Ticket 014: the attachment chain. Candidates are sealed here (digest + length); the upload
  // streams the sealed version through the bridge to the base's own `uploadStream`; every record
  // stays in this process — reopening reads the durable session log instead (US-076).
  const attachments = createAttachments({
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    pickFiles: async () => {
      const picked = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], title: '选择要上传的附件' })
      return picked.canceled ? null : picked.filePaths
    },
    ensureSession: (matterRef, workspaceRoot) => sessionChannel.ensureSession(matterRef, workspaceRoot),
    now: () => new Date().toISOString(),
    nextId: () => randomUUID(),
  })
  // Ticket 009: cold history — its own store; reads ride the session bindings file only.
  const sessionHistory = createSessionHistory({
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    bindingsFile: join(paths.root, 'sessions', 'bindings.json'),
    now: () => new Date().toISOString(),
  })
  // Ticket 034: the clarification loop — pending cards come from the host relay, answers resolve
  // its waterfall; while the 007 pause holds, nothing may be dispatched.
  const clarifications = createClarifications({
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    bindingsFile: join(paths.root, 'sessions', 'bindings.json'),
    now: () => new Date().toISOString(),
    pending: pendingInputs,
  })
  // Ticket 035: message anchors — pure history reads (no activation, no full transcript).
  const sessionAnchors = createSessionAnchors({
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    bindingsFile: join(paths.root, 'sessions', 'bindings.json'),
    now: () => new Date().toISOString(),
  })
  // Ticket 036: sent-message edit versions. Resends ride the channel's own send (the same
  // command entry); the original text comes from the channel's last transcript, never a claim.
  const sessionEdits = createSessionEdits({
    now: () => new Date().toISOString(),
    nextId: () => randomUUID(),
    transcriptOf: (matterRef: string) => sessionChannel.transcriptOf(matterRef),
    send: (input) => sessionChannel.send(input),
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    bindingsFile: join(paths.root, 'sessions', 'bindings.json'),
  })
  // Ticket 038: the input-area selectors — read-only lists plus a per-request carry. The plugin
  // rows are the SAME composed inventory projection the rear readout prints; the skills catalog
  // rides the bridge's `skills/snapshot`. A selection never writes enablement state.
  const inputSelections = createInputSelections({
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    now: () => new Date().toISOString(),
    plugins: () => {
      const snapshot = host.readSnapshot()
      const classified = classifyPlugins(runtimeInventoryResult, snapshot.kind === 'active'
        ? { kind: 'active', bootId: snapshot.bootId, runtimeGeneration: snapshot.runtimeGeneration, loaderPhase: snapshot.loaderPhase }
        : { kind: 'unavailable' })
      if (classified.state !== 'read') return { state: 'unavailable', code: classified.code ?? 'inventory-not-read' }
      return { state: 'read', rows: classified.components.map((component) => ({ identity: component.identity, version: component.version, digestShort: component.artifactDigestShort })) }
    },
  })
  const sendWithSelections = async (request: { readonly matterRef: string, readonly workspaceRoot: string, readonly text: string, readonly mode?: 'queue' | 'steer', readonly attachments?: readonly SessionAttachmentInput[] }) => {
    // Ticket 038: this request's carried skill/plugin references ride as a bounded prefix; only
    // an accepted/deferred request consumes them (a refusal keeps the selection for a retry).
    const prefix = inputSelections.carryPrefix(request.matterRef)
    const outcome = await sessionChannel.send({ ...request, text: prefix + request.text })
    if (outcome.state === 'accepted' || outcome.state === 'deferred') inputSelections.consume(request.matterRef)
    return outcome
  }
  // Ticket 039 (US-192/193): the plan/goal mode — the state is the base's own service projection
  // (`ctx.planMode` cropped view over the folded session log), the switch is one named request,
  // and nothing here writes any global default (the two session endpoints are the whole surface).
  const planMode = createPlanMode({
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    bindingsFile: join(paths.root, 'sessions', 'bindings.json'),
    now: () => new Date().toISOString(),
  })
  // Ticket 040: the site starting-template catalog is presentation-only. No catalog source
  // exists today, so production reads honestly `unavailable` — never an invented list; a future
  // source (Sage-owned) plugs into this same port, and nothing here ever creates or publishes.
  const siteTemplates = createSiteTemplates({})
  // Ticket 041 (US-197~199): the external-authorization waits — the live relay registry read plus
  // the two named writes (answer with a decision word / withdraw). Failures and lapses can never
  // read as approved; the surface is the deliverable, the base keeps dispatching blocked.
  const approvals = createApprovals({
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    bindingsFile: join(paths.root, 'sessions', 'bindings.json'),
    now: () => new Date().toISOString(),
    pending: pendingInputs,
  })
  // Ticket 042 (US-200~202): the model-queue verdict — a pure read folding the base's own durable
  // retry records; readiness flips on log transitions, never on a UI timer, and retries are the
  // base's own policy (this store submits nothing).
  const modelQueue = createModelQueue({
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    bindingsFile: join(paths.root, 'sessions', 'bindings.json'),
    now: () => new Date().toISOString(),
  })
  // Ticket 043 (US-203/204): the integrated terminal — read-only. The store only lists sessions
  // and pages bounded scrollback; open/close of the panel is renderer-local, so a run is never
  // cancelled by it and terminal output can never enter the conversation or the artifact list.
  const terminal = createTerminal({
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    bindingsFile: join(paths.root, 'sessions', 'bindings.json'),
    now: () => new Date().toISOString(),
  })
  // Ticket 048 (US-223/224): the feedback entry — user text + structured diagnostics only. No
  // destination exists today, so the sink port stays unwired and submits answer a named 缺项;
  // the store attaches nothing beyond the request itself (no log, stack, path or credential).
  const feedback = createFeedback({
    now: () => new Date().toISOString(),
    nextId: () => randomUUID(),
  })
  // Ticket 021: search is a read — local matter records plus the base's bounded session search.
  // The local side reads the same converted-draft facts the draft card shows; nothing is written.
  const search = createSearch({
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    listMatterFacts: () => {
      const gate = drafts.list(signedIn())
      if (gate.state !== 'ready') return []
      const facts = []
      for (const draft of gate.drafts) {
        if (draft.status !== 'converted' || draft.matterRef === null || draft.matterRef === '') continue
        facts.push({
          matterRef: draft.matterRef,
          goal: draft.fields.goal,
          deliverable: draft.fields.deliverable,
          responsibility: draft.fields.responsibility,
          projectRef: draft.fields.projectRef,
        })
      }
      return facts
    },
  })
  const searchWiring = {
    search: (request: { readonly query: string }) => search.search(request.query),
  }
  // Ticket 024: side chats fork the matter's main session; every side prompt goes to the CHILD
  // session only, and carrying text back rides the one main send path (explicit act only).
  const sideChats = createSideChats({
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    streamCall: (endpoint, payload, onFrame) => host.bridgeStream(endpoint, payload, onFrame),
    ensureMainSession: (matterRef) => {
      const link = matterLinks.snapshot().links.find((entry) => entry.matterRef === matterRef && entry.isDefault)
      return sessionChannel.ensureSession(matterRef, link?.workspacePath ?? '')
    },
    sendToMain: async (matterRef, text) => {
      const link = matterLinks.snapshot().links.find((entry) => entry.matterRef === matterRef && entry.isDefault)
      const outcome = await sessionChannel.send({ matterRef, workspaceRoot: link?.workspacePath ?? '', text })
      if (outcome.state === 'accepted') return { state: 'accepted' as const }
      if (outcome.state === 'deferred') return { state: 'deferred' as const }
      return { state: 'refused' as const, code: outcome.code }
    },
    isPaused: (matterRef) => pendingInputs.isPaused(matterRef),
    now: () => new Date().toISOString(),
    nextId: () => randomUUID(),
    file: join(paths.root, 'sessions', 'side-chats.json'),
  })
  const sideChatWiring = {
    sideChats: () => sideChats.list(scopedMatterRef()),
    sideChatCreate: (request: { readonly matterRef: string }) => sideChats.create(request.matterRef),
    sideChatSend: (request: { readonly sideChatId: string, readonly text: string }) => sideChats.send(request),
    sideChatRead: (request: { readonly sideChatId: string }) => sideChats.read(request),
    sideChatReturn: (request: { readonly sideChatId: string, readonly text: string }) => sideChats.returnToMain(request),
  }
  // Ticket 029: the Sage-owned matter administration — recoverable archive (a fact source for
  // the list's archived lifecycle), service-adjudicated rename (port left unwired: the formal
  // record belongs to the custody side), and per-target batches. Nothing here stops a run,
  // releases a responsibility, widens a read scope or deletes a record.
  const matterAdmin = createMatterAdmin({
    now: () => new Date().toISOString(),
    knownMatter: (matterRef) => matterList.derive().items.some((item) => item.matterRef === matterRef),
  })
  // Ticket 022: the matter list derives on every read from the stores itself — drafts, pending
  // inputs and observed artifacts — so a fact change moves the item and nothing is cached (US-093).
  const matterList = createMatterList({
    listDraftFacts: () => {
      const gate = drafts.list(signedIn())
      if (gate.state !== 'ready') return { state: 'unavailable' as const, code: gate.state === 'locked' ? 'matter-list-locked' : 'matter-list-unreadable' }
      const facts = []
      for (const draft of gate.drafts) {
        // Converted drafts are matters; drafts with an open attempt are matters still forming.
        const attempt = draft.attempt ?? null
        if (draft.status !== 'converted' && attempt === null) continue
        facts.push({
          draftId: draft.draftId,
          matterRef: draft.matterRef,
          title: draft.fields.goal,
          attempt: attempt === null ? null : { correlation: attempt.correlation, state: attempt.state },
          updatedAt: draft.updatedAt,
        })
      }
      return { state: 'ready' as const, facts }
    },
    pendingCount: (matterRef) => pendingInputs.snapshot(matterRef).items.filter((item) => item.state === 'pending').length,
    acceptanceCandidateCount: (matterRef) => artifacts.cardsFor(matterRef).length,
    archivedOf: (matterRef) => matterAdmin.isArchived(matterRef),
  })
  const matterListWiring = {
    matterList: () => matterList.derive(),
  }
  const attachmentWiring = {
    attachments: () => attachments.snapshot(scopedMatterRef()),
    attachmentsPick: () => attachments.pick(),
    attachmentsUpload: (request: { readonly itemId: string, readonly matterRef: string, readonly workspaceRoot: string }) => attachments.upload(request),
    attachmentsCancel: (request: { readonly itemId: string }) => attachments.cancel(request),
  }
  // Ticket 015: artifact cards come from the session's own observation feed, stat-confirmed; the
  // side preview is one main-owned surface, created on the first open and destroyed on close.
  let sageWindow: BrowserWindow | null = null
  const artifacts = createArtifacts({
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    streamCall: (endpoint, payload, onFrame) => host.bridgeStream(endpoint, payload, onFrame),
    now: () => new Date().toISOString(),
    nextId: () => randomUUID(),
  })
  const artifactPreview = createArtifactPreview({
    callBridge: (endpoint, payload) => host.bridgeCall(endpoint, payload),
    createContainer: () => createPreviewContainer({ window: () => sageWindow }),
    // Ticket 044: the separate window surface — same non-privileged contract, own OS window.
    createWindowContainer: () => createPreviewWindowContainer({ window: () => sageWindow }),
    now: () => new Date().toISOString(),
  })
  // One observation read per new turn-end edge (never a timer): the fold is what says a turn
  // ended, and the matter's default environment names the workspace the clues belong to.
  const lastTurnEndSeen = new Map<string, string>()
  // ADR-0293: the post-turn observer now keys on the EDGE (`cursor:kind`) so two consecutive
  // same-kind turns are both seen. A terminal edge also closes the session-family attempt
  // (light `attempt-succeeded` or the existing `attempt-failed`), before the artifact observation.
  const observePostTurn = (matterRef: string, edge: string | null, kind: string | null): void => {
    if (matterRef === '' || edge === null || edge === '') return
    if (lastTurnEndSeen.get(matterRef) === edge) return
    lastTurnEndSeen.set(matterRef, edge)
    if (kind !== null && kind !== '') {
      void sessionTurnClose({ matterRef, endKind: kind }).catch(() => undefined)
    }
    const defaultLink = matterLinks.snapshot().links.find((link) => link.matterRef === matterRef && link.isDefault)
    if (defaultLink === undefined) return
    void artifacts.observe({ matterRef, workspaceRoot: defaultLink.workspacePath }).catch(() => undefined)
  }
  const artifactWiring = {
    artifacts: () => ({ state: 'read' as const, cards: artifacts.cardsFor(scopedMatterRef()), preview: artifactPreview.state() }),
    artifactsObserve: (request: { readonly matterRef: string, readonly workspaceRoot: string }) => artifacts.observe(request),
    artifactOpen: async (request: { readonly artifactId: string }) => {
      const record = artifacts.recordFor(request.artifactId)
      if (record === undefined) return { state: 'refused' as const, code: 'artifact-unknown' }
      return artifactPreview.open(record)
    },
    artifactClose: async () => artifactPreview.close(),
    artifactRetry: () => artifactPreview.retry(),
    // Ticket 033: the layout switch moves the same loaded document — never a reload.
    artifactWindowOpen: () => artifactPreview.openWindow(),
    artifactWindowClose: () => artifactPreview.closeWindow(),
    artifactFullscreen: (request: { readonly on: boolean }) => artifactPreview.setExpanded(request.on),
  }
  // Ticket 033 (D-036): the only external-link path — validate, then the system browser; Sage
  // never fetches, probes or reads the site.
  const externalLinks = createExternalLinks({
    openExternal: (url) => shell.openExternal(url),
    now: () => new Date().toISOString(),
  })
  const externalLinkWiring = {
    externalLinkOpen: (raw: string) => externalLinks.open(raw),
  }
  const sessionWiring = {
    sessionChannel: async () => {
      const matterRef = scopedMatterRef()
      const status = await sessionChannel.read({ matterRef })
      // Ticket 015 + ADR-0293: a fresh turn-end edge closes the attempt and triggers one bounded
      // artifact observation (cards only).
      if (status.state === 'read') observePostTurn(matterRef, status.lastTurnEndEdge, status.lastTurnEnd)
      return status
    },
    // Ticket 014: the next send carries this matter's stored-but-unsent attachments; only a
    // confirmed acceptance marks them sent — the receipt was staged on this same session.
    sessionSend: async (request: { readonly matterRef: string, readonly workspaceRoot: string, readonly text: string, readonly mode?: 'queue' | 'steer' }) => {
      const stored = attachments.storedFor(request.matterRef)
      const outcome = await sendWithSelections({
        ...request,
        ...(stored.length === 0 ? {} : { attachments: stored }),
      })
      if (outcome.state === 'accepted' && stored.length > 0) {
        attachments.markSent(stored.map((attachment) => attachment.receiptId), outcome.requestId)
      }
      return outcome
    },
    sessionStop: (request: { readonly matterRef: string }) => sessionChannel.stop(request),
    sessionResume: (request: { readonly matterRef: string, readonly workspaceRoot: string }) => sessionChannel.resume(request),
    sessionHistory: () => sessionHistory.status(scopedMatterRef()),
    sessionHistoryList: (request: { readonly beforeSeq?: number }) => sessionHistory.list({ matterRef: scopedMatterRef(), ...request }),
    sessionHistoryDetail: (request: { readonly runSeq: number }) => sessionHistory.detail({ matterRef: scopedMatterRef(), runSeq: request.runSeq }),
    // Ticket 034: the live cards must reflect the same current matter the channel reads.
    sessionClarifications: () => clarifications.read({ matterRef: scopedMatterRef() }),
    sessionClarificationAnswer: (request: { readonly matterRef: string, readonly requestId: string, readonly answers: readonly unknown[] }) => clarifications.answer(request),
    sessionAnchors: () => sessionAnchors.status(scopedMatterRef()),
    sessionAnchorsRead: () => sessionAnchors.read({ matterRef: scopedMatterRef() }),
    sessionAnchorLocate: (request: { readonly action: 'locate', readonly runSeq: number }) => sessionAnchors.locate({ matterRef: scopedMatterRef(), runSeq: request.runSeq }),
    inputSelections: () => inputSelections.read({ matterRef: scopedMatterRef() }),
    inputSelectionsSelect: (request: { readonly action: 'select', readonly kind: 'skill' | 'plugin', readonly ref: string }) => {
      const matterRef = selectedMatterRef()
      return matterRef === undefined
        ? { state: 'refused' as const, code: 'input-selections-unavailable' }
        : inputSelections.select({ matterRef, kind: request.kind, ref: request.ref })
    },
    inputSelectionsClear: (request: { readonly action: 'clear', readonly kind: 'skill' | 'plugin', readonly ref?: string }) => {
      const matterRef = selectedMatterRef()
      return matterRef === undefined
        ? { state: 'refused' as const, code: 'input-selections-unavailable' }
        : inputSelections.clear({ matterRef, kind: request.kind, ...(request.ref === undefined ? {} : { ref: request.ref }) })
    },
    // Ticket 039: the plan/goal mode rides the base's own collaboration state; the switch is one
    // named request and never writes a default (the store only talks to the two session endpoints).
    sessionPlanMode: () => planMode.read({ matterRef: scopedMatterRef() }),
    siteTemplates: () => siteTemplates.read(),
    sessionApprovals: () => approvals.read({ matterRef: scopedMatterRef() }),
    sessionApprovalAnswer: (request: { readonly matterRef: string, readonly requestId: string, readonly outcome: 'allowed-once' | 'rejected' }) => approvals.answer(request),
    sessionApprovalWithdraw: (request: { readonly matterRef: string, readonly requestId: string }) => approvals.withdraw(request),
    modelQueue: () => modelQueue.read({ matterRef: scopedMatterRef() }),
    terminal: () => terminal.status({ matterRef: scopedMatterRef() }),
    feedback: () => feedback.status(),
    feedbackSubmit: (request: { readonly action: 'submit', readonly text: string, readonly code?: string, readonly stage?: string, readonly correlation?: string }) => feedback.submit(request),
    feedbackVerify: (request: { readonly action: 'verify', readonly requestId: string }) => feedback.verify(request),
    terminalRead: (request: { readonly terminalId: string, readonly offset?: number, readonly lines?: number }) => terminal.read({ matterRef: scopedMatterRef(), ...request }),
    sessionEdits: () => sessionEdits.status(scopedMatterRef()),
  }

  // One fold function serves the state projection and the link checks: the workspace facts keep
  // coming from the base's own follow stream, whether the caller is a read or a re-verification.
  let lastWorkspaceFold: WorkspaceListStatus | undefined
  const foldWorkspaces = async (): Promise<WorkspaceListStatus> => {
    const status = await readWorkspaceList((endpoint, payload, onFrame) => host.bridgeStream(endpoint, payload, onFrame))
    lastWorkspaceFold = status
    return status
  }
  // Ticket 025/027: one confirmation store per run serves both the dispatch gate and the edit
  // drafts' writeback card; the facts home both read is the matter's chosen default environment.
  const actionConfirmations = {
    store: createActionConfirmationStore({ now: () => new Date().toISOString() }),
    facts: (intent: SageActionIntentV2) => ({ environmentRef: matterLinks.defaultOf(intent.matterId) ?? null }),
  }
  const matterLinkWiring = {
    matterLinks: () => matterLinks.snapshot(),
    matterLinkApply: async (request: { readonly action: 'link' | 'unlink' | 'set-default', readonly matterRef: string, readonly workspaceRef?: string }) => {
      const actorRef = vault.status() === 'signed-in' ? 'session:verified' : 'session:anonymous'
      if (request.workspaceRef === undefined) {
        // `set-default` without a workspace clears the default; link/unlink always name one.
        if (request.action !== 'set-default') return matterLinks.snapshot()
        matterLinks.setDefault({ matterRef: request.matterRef, workspaceRef: '', actorRef })
        if (activeMatterContext.snapshot()?.matterId === request.matterRef) invalidateActiveMatterContext()
        return matterLinks.snapshot()
      }
      if (request.action === 'link') {
        // Only an actually adopted workspace may be linked: the live fold is the authority, and it
        // is a metadata read — no file content is touched (US-070).
        const status = await foldWorkspaces()
        const entry = status.state === 'read' ? status.entries.find((item) => item.workspaceId === request.workspaceRef) : undefined
        if (entry === undefined) return matterLinks.snapshot()
        matterLinks.link({ matterRef: request.matterRef, workspaceRef: request.workspaceRef, workspacePath: entry.path, actorRef })
        return matterLinks.snapshot()
      }
      if (request.action === 'unlink') {
        matterLinks.unlink({ matterRef: request.matterRef, workspaceRef: request.workspaceRef, actorRef })
        const active = activeMatterContext.snapshot()
        if (active?.matterId === request.matterRef && active.workspaceRef === request.workspaceRef) {
          invalidateActiveMatterContext()
        }
        return matterLinks.snapshot()
      }
      matterLinks.setDefault({ matterRef: request.matterRef, workspaceRef: request.workspaceRef, actorRef })
      const active = activeMatterContext.snapshot()
      if (
        active?.matterId === request.matterRef
        && matterLinks.defaultOf(request.matterRef) !== active.workspaceRef
      ) invalidateActiveMatterContext()
      return matterLinks.snapshot()
    },
    // Ticket 011: per-dispatch re-check of the chosen environment. No default → nothing to verify;
    // a default that is no longer in the live fold blocks the dispatch (never a switch).
    verifyEnvironment: async (request: { readonly intent: SageDispatchIntent }) => {
      const matterRef = 'matterId' in request.intent ? request.intent.matterId : undefined
      if (matterRef === undefined) return { ok: true as const }
      const chosen = matterLinks.defaultOf(matterRef)
      if (chosen === undefined) return { ok: true as const }
      const status = await foldWorkspaces()
      if (status.state !== 'read') return { ok: false as const, code: 'environment-unavailable' as const }
      return status.entries.some((entry) => entry.workspaceId === chosen)
        ? { ok: true as const }
        : { ok: false as const, code: 'environment-unavailable' as const }
    },
    // Ticket 025: one confirmation store per run (records are this-run only, like every other
    // in-process fact here). The facts home is the matter's chosen default environment; both
    // prepare and the per-dispatch re-check read it from the same place. A create-matter intent
    // targets `draft:<id>`, which has no links yet, so its facts read null.
    actionConfirmations,
  }

  // Ticket 013: one in-process reference store for this run; ids and timestamps stay main-owned.
  const fileReferences = createFileReferences((endpoint, payload) => host.bridgeCall(endpoint, payload), {
    now: () => new Date().toISOString(),
    nextId: () => randomUUID(),
  })
  const createFileReferenceWiring = {
    // The route body supplies only the candidate workspace/path. The admitted projection scope
    // supplies the main-owned matter binding; callers cannot choose it in the request.
    createFileReference: (request: { readonly workspaceRoot: string, readonly path: string }) => fileReferences.create({
      ...request,
      matterRef: scopedMatterRef(),
    }),
    useFileReference: fileReferences.use,
    fileReferences: fileReferences.list,
  }

  // Ticket 027: edit drafts over the same references; the writeback's one-time credential rides
  // the shared confirmation store. No executor is wired here — the base exposes reads and one
  // opaque version token and no write verb — so a confirmed writeback answers not-ready, and the
  // unconfirmed one still never reaches the source.
  const editDrafts = createEditDrafts((endpoint, payload) => host.bridgeCall(endpoint, payload), {
    now: () => new Date().toISOString(),
    nextId: () => randomUUID(),
    references: fileReferences.list,
    confirmations: actionConfirmations,
  })
  const editDraftWiring = {
    editDrafts: editDrafts.list,
    editDraftCreate: editDrafts.create,
    editDraftUpdate: editDrafts.update,
    editDraftDiff: editDrafts.diff,
    editDraftPrepareWriteback: editDrafts.prepareWriteback,
    editDraftWriteback: editDrafts.writeback,
  }

  // Ticket 028: Sage-owned action items + the linked corrections. A correction rides the session
  // channel's own send (ack ≠ effective); its receipt upgrades only on the queue's own states —
  // still queued counts as 待应用, the consumption reading is the only 已生效 evidence. Projects
  // are pure grouping records: nothing here touches responsibility, visibility or matter facts.
  const actionItems = createActionItems({
    now: () => new Date().toISOString(),
    nextId: () => randomUUID(),
    send: async (request) => {
      const outcome = await sendWithSelections({ matterRef: request.matterRef, workspaceRoot: request.workspaceRoot, text: request.text })
      if (outcome.state === 'accepted') return { state: 'accepted' as const, requestId: outcome.requestId }
      if (outcome.state === 'deferred') return { state: 'deferred' as const, itemId: outcome.itemId }
      return { state: 'refused' as const, code: outcome.code }
    },
    pendingStateOf: (matterRef, itemId) => pendingInputs.snapshot(matterRef).items.find((entry) => entry.itemId === itemId)?.state,
  })
  const matterProjects = createMatterProjects({ now: () => new Date().toISOString(), nextId: () => randomUUID() })
  // Ticket 031: the run monitor derives from the SAME session-channel projection the
  // conversation card reads (no local copy); the run log is a bounded read over the content port.
  const runLogs = createRunLogs((endpoint, payload) => host.bridgeCall(endpoint, payload))
  // Ticket 032: the plan deliverable. Readiness reads the same premise home as the 011 gate
  // (matter links + the live workspace fold); step dispatch rides the shared confirmation store
  // and has no production executor — a confirmed step answers not-ready instead of a fake run.
  const plans = createPlans({
    now: () => new Date().toISOString(),
    nextId: () => randomUUID(),
    premises: (matterRef) => {
      const environmentRef = matterLinks.defaultOf(matterRef) ?? null
      if (environmentRef === null) return { state: 'read' as const, environmentRef, environmentPresent: null, reason: null }
      const fold = lastWorkspaceFold
      if (fold === undefined) return { state: 'read' as const, environmentRef, environmentPresent: null, reason: 'workspace-fold-not-read' }
      if (fold.state !== 'read') return { state: 'unavailable' as const, environmentRef, environmentPresent: null, reason: 'workspace-fold-unreadable' }
      return { state: 'read' as const, environmentRef, environmentPresent: fold.entries.some((entry) => entry.workspaceId === environmentRef), reason: null }
    },
    confirmations: actionConfirmations,
  })
  const planWiring = {
    plans: plans.list,
    planCreate: plans.create,
    planAccept: plans.accept,
    planPrepareStep: plans.prepareStep,
    planExecuteStep: plans.executeStep,
  }
  const monitorWiring = {
    runMonitor: async () => {
      const matterRef = scopedMatterRef()
      return shapeRunMonitor(matterRef, await sessionChannel.read({ matterRef }))
    },
    runLogRead: runLogs,
  }
  const matterAdminWiring = {
    matterAdmin: matterAdmin.list,
    matterAdminArchive: matterAdmin.archive,
    matterAdminRestore: matterAdmin.restore,
    matterAdminBatch: matterAdmin.batch,
    matterAdminRename: matterAdmin.rename,
  }
  // Ticket 049: Sage-owned task groups — named create/rename/remove with their own receipts and a
  // known-item gate for membership. The store is handed no other port: organization only, so a
  // group change cannot infer a fact, a scope, a responsibility or a permission.
  const matterGroups = createMatterGroups({
    now: () => new Date().toISOString(),
    nextId: () => randomUUID(),
    knownItem: (itemId) => matterList.derive().items.some((item) => item.itemId === itemId),
  })
  const matterGroupsWiring = {
    matterGroups: matterGroups.list,
    matterGroupsCreate: matterGroups.create,
    matterGroupsRename: matterGroups.rename,
    matterGroupsRemove: matterGroups.remove,
    matterGroupsAssign: matterGroups.assign,
  }
  const actionItemWiring = {
    actionItems: actionItems.list,
    actionItemCreate: actionItems.createItem,
    actionItemUpdate: actionItems.updateItem,
    actionItemStart: actionItems.start,
    actionItemComplete: actionItems.complete,
    correctionCreate: actionItems.submitCorrection,
    projects: matterProjects.list,
    projectCreate: matterProjects.create,
    projectAssign: matterProjects.assign,
    projectUnassign: matterProjects.unassign,
  }

  // WT-02B.2B login wiring: in-memory vault plus a production adapter (real loopback,
  // real fetch, node randomness; shell.openExternal stays fail-closed on failure via
  // the runtime guard). Tokens never leave main and never persist.
  // WT-02B.2C: the identity registry mints runtime-only internal handles for verified
  // (issuer, subject); handles never persist and never reach renderer/Host/logs.
  const vault = createTokenVault({ mintSessionRef: () => randomBytes(32).toString('base64url') })
  // T05 prepare (ADR-0291): the selection-time ensure shares the front identity port factory.
  const prepareEnsure = createSessionPromptPrepareEnsure({
    identityPolicy: createSessionCoreIdentityPort({
      vault,
      authority: {
        policyPath: paths.organizationPolicyFile,
        readFileBytes: (path: string) => readFileSync(path),
        now: () => new Date().toISOString(),
      },
    }),
    attempts: sessionPromptAttempts,
    requirementBundle,
    correlation: 'caller:session-core',
    now: () => new Date().toISOString(),
  })
  // T03: one read-policy object for selection-time and projection reads. The bound-scope ledger
  // must outlive individual requests, so it is created once and memoized; `paths` is resolved
  // synchronously below before the first request can arrive.
  let readPolicy: ProjectionReadPolicy | null = null
  const readPolicyFor = (): ProjectionReadPolicy => {
    if (readPolicy === null) {
      readPolicy = createProjectionReadPolicy({
        vault,
        policyPath: paths.organizationPolicyFile,
        readFileBytes: readFileSync,
        now: () => new Date().toISOString(),
      })
    }
    return readPolicy
  }
  const identityRegistry = createIdentityRegistry({ randomHandle: () => randomBytes(32).toString('base64url') })
  const { adapter } = createProductionAdapter(vault, {
    openExternal: (url) => shell.openExternal(url),
    resolveIdentity: (input) => identityRegistry.resolve(input),
  })

  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    const route = routeSchemeRequest(url)
    if (route.target === 'reject') return Promise.resolve(new Response(null, { status: 404 }))
    if (isSageServicePath(url.pathname)) {
      const callerBinding = verifySageServiceCaller(url, request, framePolicy)
      const viewState = toSageViewState(host.readSnapshot())
      const providers = createSageAppServiceProviders({
        viewState,
        vault,
        adapter,
        callerBinding,
        activeMatterContext,
        framePolicySnapshot: () => framePolicy.snapshot(),
        // CTX-01B: the route carries only a matter id plus CAS generation. Electron main re-reads
        // every trusted fact in fixed order; the matter-read grant is evaluated by the T03
        // read policy (identity session + instance policy, local-read only).
        selectActiveMatter: async (candidate) => {
          const result = await selectActiveMatterContext({
            candidate,
            context: activeMatterContext,
            ports: {
              readActiveIdentitySession: () => {
                const session = vault.identitySession()
                return session === null ? undefined : { sessionRef: session.sessionRef }
              },
              authorizeMatterRead: (request) => readPolicyFor().authorizeMatterRead(request),
              resolveCurrentRevision: ({ matterId }) => {
                const current = matterRehydrate.resolveCurrent(matterId)
                return current === undefined || 'denied' in current
                  ? undefined
                  : { matterId, revisionId: current.currentRevisionId }
              },
              resolveDefaultWorkspace: ({ matterId }) => {
                const workspaceRef = matterLinks.defaultOf(matterId)
                return workspaceRef === undefined ? undefined : { matterId, workspaceRef }
              },
              readFreshWorkspaceFold: async () => {
                const fold = await foldWorkspaces()
                return fold.state !== 'read'
                  ? undefined
                  : {
                      state: 'read' as const,
                      entries: fold.entries.map((entry) => ({
                        workspaceId: entry.workspaceId,
                        path: entry.path,
                      })),
                    }
              },
              snapshotFramePolicy: () => framePolicy.snapshot(),
              // ADR-0291: the governed ensure runs after read authorization, before the current
              // revision read — the CAS then binds the ensured revision.
              ensureRunnableRevision: prepareEnsure,
            },
          })
          if (result.ok) {
            return { state: 'selected' as const, context: { state: 'active' as const, ...result.projection } }
          }
          if (result.code === 'stale-context-generation') {
            return { state: 'refused' as const, code: 'active-context-stale' as const, retryable: true }
          }
          if (result.code === 'read-access-denied') {
            return { state: 'refused' as const, code: 'active-context-denied' as const, retryable: false }
          }
          return { state: 'refused' as const, code: 'active-context-unavailable' as const, retryable: true }
        },
        // T03: the projection read policy is the same main-owned evaluation as selection-time
        // matter reads (identity session + instance-local policy, local-read, per-operation
        // grants); absent grants keep the read-policy step unavailable, never permissive.
        authorizeProjectionRead: (request) => readPolicyFor().authorizeProjectionRead(request),
        ...(fixtureProjection === undefined ? {} : { fixtureProjection }),
        // WT-02C.2E.2: the composed inventory provider rides the same flow until the
        // C2E.2 resolver wiring lands; nothing consumes it yet.
        runtimeInventory,
        // T05-mid (ADR-0282): the session family's target step evaluates the startup-loaded,
        // kernel-sealed requirement bundle; the object reference is stable across requests.
        requirementBundle,
        // T05-mid step 6 (ADR-0284): the shipped matrix publication and the main-owned observation
        // and revision-digest surfaces for the real compatibility step.
        compatibilityPublication,
        runtimeInventoryObservation: () => (runtimeInventoryResult?.kind === 'available'
          ? { descriptor: runtimeInventoryResult.descriptor, evidence: runtimeInventoryResult.evidence }
          : undefined),
        revisionDigest: revisionDigestFor,
        // T05-mid step 7 (ADR-0286): the registry step reads the SAME published-snapshot provider
        // instance the inventory observed — one snapshot, one home, no second source.
        capabilityRegistry: bundledRegistry,
        // T05-mid step 9 (ADR-0288): the persistence step's store handle (same Sage-owned store).
        sessionPromptAttempts,
        sessionSendReconcile,
        // Ticket 030: the capability surface reads the same main-owned roster observation the
        // inventory provider uses. The reader is typed `unknown` on purpose, so re-validate the
        // producer's own bytes here instead of trusting the caller (P-56); anything else stays 未核验.
        matterRehydrate: matterRehydrate.strictRehydrate,
        // Ticket 017: the model-config view reads the base's own settings document through the
        // read-only bridge; the bridge refuses before touching a provider when it cannot.
        // Ticket 010: pick an existing directory, then adopt it — a cancelled pick stops after
        // the first call, so nothing is created and nothing is recorded.
        adoptWorkspace: createWorkspaceAdoption((endpoint, payload) => host.bridgeCall(endpoint, payload)),
        // Ticket 012: one subscription per read; folding starts empty, so a reconnect reconciles
        // against the fresh baseline instead of merging into a stale local view.
        // One fold function serves the projection, the link checks and the index leaf: the
        // workspace facts keep coming from the base's own follow stream, never a scan.
        workspaceList: () => foldWorkspaces(),
        // Ticket 012 (write half): rename / delete-registration / reorder over the same bridge;
        // delete removes the registration only — the base keeps the directory and its sessions.
        mutateWorkspace: async (request) => {
          const outcome = await createWorkspaceMutations((endpoint, payload) => host.bridgeCall(endpoint, payload))(request)
          const active = activeMatterContext.snapshot()
          if (
            outcome.state === 'settled'
            && outcome.kind === 'delete'
            && active?.workspaceRef === outcome.workspaceId
          ) invalidateActiveMatterContext()
          return outcome
        },
        // Ticket 046: the eleven leaf rows. Sources: the host snapshot, the instance policy, and
        // the folded workspace observation — the last one never triggers a scan (D-090).
        settingsLeaves: () => {
          const snapshot = host.readSnapshot()
          const policy = loadOrganizationPolicy({ policyPath: paths.organizationPolicyFile, readFileBytes: (path) => readFileSync(path) })
          const folded = lastWorkspaceFold
          return listSettingsLeaves({
            host: { kind: snapshot.kind === 'active' ? 'active' : 'unavailable' },
            organizationRef: policy.kind === 'loaded' ? policy.policy.organizationId : null,
            workspaceCount: folded?.state === 'read' ? folded.entries.length : 0,
            workspaceFoldRead: folded?.state === 'read',
          })
        },
        // Ticket 020: the display preferences (both entries read this one slot).
        ...preferenceWiring,
        // Ticket 005: the session channel (read projection + one send verb).
        ...sessionWiring,
        // Ticket 014: this run's attachment items and the pick/upload/cancel acts.
        ...attachmentWiring,
        // Ticket 015: artifact cards and the one side-preview's acts.
        ...artifactWiring,
        // Ticket 033: the controlled external-link entry (system browser, scheme-validated).
        ...externalLinkWiring,
        // Ticket 021: the read-only search (matters local + session content).
        ...searchWiring,
        // Ticket 022: the action-need-partitioned matter list (derived per read).
        ...matterListWiring,
        // Ticket 024: the current matter's side chats (children of its main session).
        ...sideChatWiring,
        // Ticket 011: the link state and its per-dispatch environment re-check.
        ...matterLinkWiring,
        // Ticket 027: the edit-draft family (create/update/diff/prepare-writeback/writeback).
        ...editDraftWiring,
        // Ticket 028: action items + corrections + the project grouping.
        ...actionItemWiring,
        // Ticket 029: matter administration (archive/restore/batch/rename).
        ...matterAdminWiring,
        // Ticket 049: task groups (create/rename/remove/membership — organization only).
        ...matterGroupsWiring,
        // Ticket 031: the run monitor + the bounded run-log read.
        ...monitorWiring,
        // Ticket 032: the plan deliverable + the two-stage step dispatch.
        ...planWiring,
        // Ticket 013: candidates come from the base's own confined listing, a reference is one
        // stat (never a content read), and use re-stats before reading. The records live in this
        // process only; the surface words them as this-run references, never as durable ones.
        listFileCandidates: createFileCandidates((endpoint, payload) => host.bridgeCall(endpoint, payload)),
        ...createFileReferenceWiring,
        // Ticket 002: drafts live on this device; the conversion half runs the same pipeline as
        // every command (composition does the running; this half only validates and receipts).
        ...draftWiring,
        // T04: the creation branch's real custodian — appends the first stream to the Sage-owned
        // authoritative store. Absent wiring keeps the pipeline's honest not-ready denial.
        createMatter: (request) => matterCustody.createMatter(request),
        // Ticket 026: the four rear read-only families. Every fact here is one main already holds
        // (or an explicit absence); nothing is inferred and no conclusion is composed.
        readout: (context) => {
          const snapshot = host.readSnapshot()
          const policy = loadOrganizationPolicy({ policyPath: paths.organizationPolicyFile, readFileBytes: (path) => readFileSync(path) })
          return {
            visibility: classifyVisibility({
              policy: policy.kind === 'loaded'
                ? { kind: 'loaded', organizationId: policy.policy.organizationId }
                : { kind: policy.kind },
              matterProjection: fixtureProjection?.(),
            }),
            plugins: classifyPlugins(runtimeInventoryResult, snapshot.kind === 'active'
              ? { kind: 'active', bootId: snapshot.bootId, runtimeGeneration: snapshot.runtimeGeneration, loaderPhase: snapshot.loaderPhase }
              : { kind: 'unavailable' }),
            knowledge: { state: 'not-wired', reason: 'knowledge-store-unavailable' },
            diagnostics: classifyDiagnostics({
              snapshot: snapshot.kind === 'active'
                ? {
                    kind: 'active',
                    harnessVersion: snapshot.harnessVersion,
                    hostProtocolVersion: snapshot.hostProtocolVersion,
                    activeGeneration: snapshot.activeGeneration,
                    manifestSha256: snapshot.manifestSha256,
                    bootId: snapshot.bootId,
                    runtimeGeneration: snapshot.runtimeGeneration,
                  }
                : { kind: 'unavailable' },
              dataRoot: paths.root,
              lastCommand: context.lastCommand,
            }),
          }
        },
        modelConfig: () => host.bridgeCall('settings/describe')
          .then(classifySettingsDescribe, classifySettingsDescribeFailure),
        runtimeEffective: () => {
          const observation = host.readRuntimeEffective()
          return isRuntimeEffectiveObservation(observation) ? observation : undefined
        },
        // WT-02D.2A: the authorization path runs over the instance-local policy file; absent
        // or unreadable keeps every command port fail closed.
        authority: {
          policyPath: paths.organizationPolicyFile,
          readFileBytes: (path) => readFileSync(path),
          now: () => new Date().toISOString(),
        },
      })
      return handleSageServiceRequest(request, { callerBinding, providers })
    }
    return serveDesktopDocument(request) ?? host.fetch(request)
  })

  const window = createSageWindow(framePolicy)
  sageWindow = window
  await loadTrustedUrl(window, framePolicy, `${SCHEME}://app/index.html`)
  if (process.env.SAGE_DEVTOOLS === '1') window.webContents.openDevTools({ mode: 'detach' })

  // Without the guard, a second before-quit during teardown preventDefaults again and the app never exits.
  let quitting = false
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    void host.stop().finally(() => { app.exit(0) })
  })
}

async function bootstrap(): Promise<void> {
  assertDesktopBundleAvailable()
  const root = process.env.SAGE_ROOT
  const paths = resolveSagePaths({
    home: homedir(),
    platform: process.platform,
    ...(root === undefined ? {} : { root }),
  })
  // `setPath('sessionData')` has to occur before Electron's ready event. This
  // safe synchronous setup is deliberately before the first await in bootstrap().
  ensureSageDirectoriesSync(paths)
  // Pristine admission must be decided BEFORE configureElectronPaths: once Chromium knows the
  // session directory it writes its own runtime files (DevToolsActivePort, Local State) while the
  // async install transaction is still awaiting, which would fail the check nondeterministically
  // (first packaged acceptance, 2026-10-10). A valid existing pointer skips admission entirely.
  if (app.isPackaged && !existsSync(paths.activeProfileFile)) {
    assertBundledProfileAdmissibleSync(paths)
  }
  configureElectronPaths(paths)
  // A packaged first launch cannot depend on pnpm or the network. The build-time materialized,
  // app-signature-covered template is admitted only into a completely pristine Sage root; an
  // existing valid profile wins and any partial/corrupt state fails closed without replacement.
  if (app.isPackaged) {
    const profile = await installBundledProfileTemplate({
      paths,
      templateRoot: join(process.resourcesPath, 'sage-profile-template'),
    })
    process.stdout.write(`sage shell: bundled profile ${profile.state}\n`)
  }
  await app.whenReady()
  await main(paths)
}

void bootstrap().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`sage shell: ${error instanceof Error ? error.stack ?? message : message}\n`)
  dialog.showErrorBox('Sage Shell 启动失败', message)
  app.exit(1)
})
