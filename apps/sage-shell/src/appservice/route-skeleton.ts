/** Pure route skeleton for the main-owned /.sage/* surface (spec §3.1). */
import type {
  DisplayPreferenceValues,
  ProjectionReadCandidate,
  ServiceDeps,
  WorkspaceMutationRequest,
} from './contracts.js'
import { parseSageActionIntentV2 } from './command-contracts.js'
import type { SageActionIntentV2, SageDispatchIntent } from './command-contracts.js'
import { MAX_SAGE_ACTION_BYTES, serviceJson } from './errors.js'
import type { ProjectionReadOperation, ProjectionReadScope } from './projection-read-admission.js'

const SAGE_STATE_PATH = '/.sage/state'
const SAGE_BOOTSTRAP_PATH = '/.sage/bootstrap'
const SAGE_DEVICE_PREFERENCES_PATH = '/.sage/device-preferences'
/** CTX-01B: the only product route allowed to select/replace the main-owned active matter. */
const SAGE_CONTEXT_SELECT_PATH = '/.sage/context/select'
const SAGE_ACTIONS_PATH = '/.sage/actions'
/** Ticket 025: mint the single pre-execution confirmation card for one exact intent. */
const SAGE_ACTIONS_PREPARE_PATH = '/.sage/actions/prepare'
const SAGE_LOGIN_PATH = '/.sage/login'
const SAGE_LOGOUT_PATH = '/.sage/logout'
/** Ticket 010: adoption is its own POST; it is not a matter action and never walks the pipeline. */
const SAGE_WORKSPACE_ADOPT_PATH = '/.sage/workspace/adopt'
/** Ticket 012 (write half): rename / delete-registration / reorder share one POST and stay out of
 *  the matter pipeline — they are workspace-surface mutations, not business actions. */
const SAGE_WORKSPACE_MUTATE_PATH = '/.sage/workspace/mutate'
/** Ticket 013: the file-reference surface, one route per verb (candidates / reference / use). */
const SAGE_FILES_CANDIDATES_PATH = '/.sage/workspace/files/candidates'
const SAGE_FILES_REFERENCE_PATH = '/.sage/workspace/files/reference'
const SAGE_FILES_USE_PATH = '/.sage/workspace/files/use'
/** Ticket 002: the draft surface — create from an input, edit, and confirm (which runs the pipeline). */
const SAGE_DRAFT_CREATE_PATH = '/.sage/draft/create'
const SAGE_DRAFT_UPDATE_PATH = '/.sage/draft/update'
const SAGE_DRAFT_CONVERT_PATH = '/.sage/draft/convert'
const SAGE_DRAFT_RECONCILE_PATH = '/.sage/draft/reconcile'
const SAGE_DRAFT_CANCEL_PATH = '/.sage/draft/cancel'
/** Ticket 025: the draft flow's single pre-execution confirmation card (main builds the intent). */
const SAGE_DRAFT_PREPARE_CONFIRM_PATH = '/.sage/draft/prepare-confirm'
/** Ticket 011: one route for the three named link operations. */
const SAGE_MATTER_LINK_PATH = '/.sage/matter/link'
/** Ticket 005: one route admitting a prompt; the answer is the base's own acknowledgement. */
const SAGE_SESSION_SEND_PATH = '/.sage/session/send'
/** Ticket 006: stop / resume / edit-or-remove a pending item. */
const SAGE_SESSION_STOP_PATH = '/.sage/session/stop'
const SAGE_SESSION_RESUME_PATH = '/.sage/session/resume'
const SAGE_SESSION_PENDING_PATH = '/.sage/session/pending'
/** Ticket 008: edit/remove one still-pending queue occurrence. */
const SAGE_SESSION_QUEUE_PATH = '/.sage/session/queue'
/** Ticket 009: cold history — list the runs / read one run's detail (pure page reads). */
const SAGE_SESSION_HISTORY_PATH = '/.sage/session/history'
/** Ticket 034: the clarification loop's one named write (the read rides the state poll). */
const SAGE_SESSION_CLARIFICATION_ANSWER_PATH = '/.sage/session/clarification-answer'
/** Ticket 035: the message anchors — read the rail / locate one run's message (pure history reads). */
const SAGE_SESSION_ANCHORS_PATH = '/.sage/session/anchors'
/** Ticket 036: the sent-message edit versions — save / resend (same send entry) / verify. */
const SAGE_SESSION_EDITS_PATH = '/.sage/session/edits'
/** Ticket 038: the input-area selectors — select / clear one per-request skill-or-plugin ref. */
const SAGE_SESSION_SELECTIONS_PATH = '/.sage/session/selections'
/** Ticket 039: the plan/goal mode — read the projection / switch it (one named request). */
const SAGE_SESSION_PLAN_MODE_PATH = '/.sage/session/plan-mode'
/** Ticket 041: the approval wait — answer one wait / withdraw one wait (two named writes). */
const SAGE_SESSION_APPROVAL_ANSWER_PATH = '/.sage/session/approval-answer'
const SAGE_SESSION_APPROVAL_WITHDRAW_PATH = '/.sage/session/approval-withdraw'
/** Ticket 043: one bounded terminal scrollback page (read-only observation). */
const SAGE_SESSION_TERMINAL_READ_PATH = '/.sage/session/terminal-read'
/** Ticket 048: the feedback entry — submit (text + structured diagnostics) / verify one receipt. */
const SAGE_FEEDBACK_PATH = '/.sage/feedback'
/** Ticket 020/047: the one write port for the eight display preferences. */
const SAGE_PREFERENCES_PATH = '/.sage/preferences'
/** Ticket 014: the attachment chain — pick (candidate only), upload the sealed version, cancel. */
const SAGE_ATTACHMENT_PICK_PATH = '/.sage/attachments/pick'
const SAGE_ATTACHMENT_UPLOAD_PATH = '/.sage/attachments/upload'
const SAGE_ATTACHMENT_CANCEL_PATH = '/.sage/attachments/cancel'
/** Ticket 021: one read-only search query (matters local + base session content). */
const SAGE_SEARCH_PATH = '/.sage/search'
/** Ticket 024: side-chat create / send / read / return-to-main. */
const SAGE_SIDE_CHAT_PATH = '/.sage/side-chats'
/** Ticket 015: artifact cards (observe) and the one side-preview (open/close/retry). */
const SAGE_ARTIFACTS_OBSERVE_PATH = '/.sage/artifacts/observe'
const SAGE_ARTIFACTS_OPEN_PATH = '/.sage/artifacts/open'
const SAGE_ARTIFACTS_CLOSE_PATH = '/.sage/artifacts/close'
const SAGE_ARTIFACTS_RETRY_PATH = '/.sage/artifacts/retry'
/** Ticket 033: the preview layout switch and the controlled external-link entry. */
const SAGE_ARTIFACTS_FULLSCREEN_PATH = '/.sage/artifacts/fullscreen'
/** Ticket 044: the separate preview window — open / close (explicit actions only). */
const SAGE_ARTIFACTS_WINDOW_PATH = '/.sage/artifacts/window'
const SAGE_EXTERNAL_LINK_PATH = '/.sage/external-link'
/** Ticket 027: the edit-draft family — one route per verb. */
const SAGE_EDIT_DRAFTS_CREATE_PATH = '/.sage/edit-drafts/create'
const SAGE_EDIT_DRAFTS_UPDATE_PATH = '/.sage/edit-drafts/update'
const SAGE_EDIT_DRAFTS_DIFF_PATH = '/.sage/edit-drafts/diff'
const SAGE_EDIT_DRAFTS_PREPARE_WRITEBACK_PATH = '/.sage/edit-drafts/prepare-writeback'
const SAGE_EDIT_DRAFTS_WRITEBACK_PATH = '/.sage/edit-drafts/writeback'
/** Ticket 028: action items (one route, named actions), the corrections, and the projects. */
const SAGE_ACTION_ITEMS_PATH = '/.sage/action-items'
const SAGE_CORRECTIONS_PATH = '/.sage/corrections'
const SAGE_PROJECTS_PATH = '/.sage/projects'
/** Ticket 029: matter administration — archive / restore / batch / rename. */
const SAGE_MATTER_ADMIN_PATH = '/.sage/matter-admin'
/** Ticket 049: Sage-owned task groups — create / rename / remove / membership batch. */
const SAGE_MATTER_GROUPS_PATH = '/.sage/matter-groups'
/** Ticket 031: one bounded read of a workspace run-log page. */
const SAGE_RUN_LOG_PATH = '/.sage/run-log'
/** Ticket 032: the plan deliverable + the two-stage step dispatch. */
const SAGE_PLANS_PATH = '/.sage/plans'

/** WT-02D.1 routing predicate: every /.sage/* pathname is terminated by the main-owned app service (single owner). */
export function isSageServicePath(pathname: string): boolean {
  return pathname.startsWith('/.sage/')
}

/** Transport-layer denials stay uncacheable, matching the P0-2 adapter's json() shape. */
function transportDenial(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { 'cache-control': 'no-store', ...headers } })
}

/** READ-01A: exact parsing stays ahead of this helper; raw providers run only inside the
 * main-owned admission callback. Missing/malformed runners fail closed through each route's
 * existing typed unavailable shape. */
async function runProjectionRead(
  deps: ServiceDeps,
  operation: ProjectionReadOperation,
  candidate: ProjectionReadCandidate,
  read: (scope: ProjectionReadScope) => Promise<Response>,
  blocked: () => Response | Promise<Response>,
): Promise<Response> {
  const runner = deps.providers.runProjectionRead
  if (runner === undefined) return blocked()
  try {
    const result = await runner({ operation, candidate }, read)
    return result.state === 'read' && result.value instanceof Response
      ? result.value
      : blocked()
  } catch {
    return blocked()
  }
}

export async function handleSageServiceRequest(request: Request, deps: ServiceDeps): Promise<Response> {
  if (deps.callerBinding === null) return transportDenial(403)

  const url = new URL(request.url)
  if (url.pathname === SAGE_STATE_PATH) {
    if (request.method !== 'GET') return transportDenial(405, { allow: 'GET' })
    return runProjectionRead(
      deps,
      'state.read',
      { kind: 'collection', collection: 'state' },
      () => deps.providers.readState(),
      () => deps.providers.readBlockedState?.() ?? serviceJson({
        code: 'projection-read-unavailable',
        stage: 'read-policy',
        retryable: true,
        correlation: deps.callerBinding?.correlation ?? 'projection-read-unavailable',
      }, 200),
    )
  }

  if (url.pathname === SAGE_BOOTSTRAP_PATH) {
    if (request.method !== 'GET') return transportDenial(405, { allow: 'GET' })
    return deps.providers.bootstrapRead()
  }

  if (url.pathname === SAGE_DEVICE_PREFERENCES_PATH) {
    if (request.method !== 'GET') return transportDenial(405, { allow: 'GET' })
    return deps.providers.devicePreferencesRead()
  }

  if (url.pathname === SAGE_CONTEXT_SELECT_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseActiveMatterSelection(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-context-selection', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    return deps.providers.selectActiveMatter(parsed)
  }

  if (url.pathname === SAGE_ACTIONS_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const declaredLength = request.headers.get('content-length')
    if (declaredLength !== null && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_SAGE_ACTION_BYTES)) {
      return transportDenial(413)
    }
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseIntent(body)
    if (parsed === undefined) return serviceJson(
      { code: 'invalid-intent', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    return deps.providers.dispatch(parsed.intent, parsed.confirmationId)
  }

  if (url.pathname === SAGE_ACTIONS_PREPARE_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const declaredLength = request.headers.get('content-length')
    if (declaredLength !== null && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_SAGE_ACTION_BYTES)) {
      return transportDenial(413)
    }
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const intent = parseConfirmableIntent(body)
    if (intent === undefined) return serviceJson(
      { code: 'invalid-intent', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    return deps.providers.prepareActionConfirmation(intent)
  }

  if (url.pathname === SAGE_LOGIN_PATH) {
    if (request.method !== 'GET') return transportDenial(405, { allow: 'GET' })
    return deps.providers.login()
  }
  if (url.pathname === SAGE_LOGOUT_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    return deps.providers.logout()
  }

  if (url.pathname === SAGE_WORKSPACE_ADOPT_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    return deps.providers.adoptWorkspace()
  }

  if (url.pathname === SAGE_WORKSPACE_MUTATE_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const mutation = parseWorkspaceMutation(body)
    if (mutation === undefined) {
      return serviceJson({ code: 'invalid-workspace-mutation', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    return deps.providers.mutateWorkspace(mutation)
  }


  

  if (url.pathname === SAGE_PREFERENCES_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parsePreferencesPatch(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-preferences-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    return deps.providers.savePreferences(parsed)
  }

  if (url.pathname === SAGE_SESSION_STOP_PATH || url.pathname === SAGE_SESSION_RESUME_PATH || url.pathname === SAGE_SESSION_PENDING_PATH || url.pathname === SAGE_SESSION_QUEUE_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseSessionControlRequest(body, url.pathname)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-session-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (url.pathname === SAGE_SESSION_STOP_PATH) return deps.providers.stopSession(parsed as { matterRef: string })
    if (url.pathname === SAGE_SESSION_RESUME_PATH) return deps.providers.resumeSession(parsed as { matterRef: string, workspaceRoot: string })
    if (url.pathname === SAGE_SESSION_QUEUE_PATH) return deps.providers.updateQueueItem(parsed as never)
    return deps.providers.updatePendingInput(parsed as never)
  }

  if (url.pathname === SAGE_SESSION_HISTORY_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseSessionHistoryRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-session-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (parsed.action === 'list') {
      return runProjectionRead(
        deps,
        'session.history.list',
        { kind: 'active-matter' },
        () => deps.providers.sessionHistoryList(parsed),
        () => serviceJson({ state: 'refused', code: 'session-history-unavailable' }, 200),
      )
    }
    return runProjectionRead(
      deps,
      'session.history.detail',
      { kind: 'active-matter' },
      () => deps.providers.sessionHistoryDetail(parsed),
      () => serviceJson({ state: 'missing', runSeq: parsed.runSeq, code: 'session-history-unavailable' }, 200),
    )
  }

  if (url.pathname === SAGE_SESSION_SELECTIONS_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseInputSelectionsRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-session-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (parsed.action === 'select') return deps.providers.inputSelectionsSelect(parsed)
    return deps.providers.inputSelectionsClear(parsed)
  }

  if (url.pathname === SAGE_SESSION_EDITS_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseSessionEditsRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-session-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (parsed.action === 'save') return deps.providers.sessionEditsSave(parsed)
    if (parsed.action === 'resend') return deps.providers.sessionEditsResend(parsed)
    return deps.providers.sessionEditsVerify(parsed)
  }

  if (url.pathname === SAGE_SESSION_ANCHORS_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseSessionAnchorsRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-session-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (parsed.action === 'read') {
      return runProjectionRead(
        deps,
        'session.anchors.read',
        { kind: 'active-matter' },
        () => deps.providers.sessionAnchorsRead(parsed),
        () => serviceJson({ state: 'unavailable', code: 'session-anchors-unavailable' }, 200),
      )
    }
    return runProjectionRead(
      deps,
      'session.anchors.locate',
      { kind: 'active-matter' },
      () => deps.providers.sessionAnchorLocate(parsed),
      () => serviceJson({ state: 'missing', runSeq: parsed.runSeq, code: 'session-anchors-unavailable' }, 200),
    )
  }

  if (url.pathname === SAGE_FEEDBACK_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseFeedbackRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-feedback-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (parsed.action === 'submit') return deps.providers.feedbackSubmit(parsed)
    return deps.providers.feedbackVerify(parsed)
  }

  if (url.pathname === SAGE_SESSION_TERMINAL_READ_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseTerminalReadRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-session-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    return runProjectionRead(
      deps,
      'session.terminal.read',
      { kind: 'active-matter' },
      () => deps.providers.terminalRead(parsed),
      () => serviceJson({ state: 'unavailable', code: 'terminals-provider-unavailable' }, 200),
    )
  }

  if (url.pathname === SAGE_SESSION_APPROVAL_ANSWER_PATH || url.pathname === SAGE_SESSION_APPROVAL_WITHDRAW_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    if (url.pathname === SAGE_SESSION_APPROVAL_ANSWER_PATH) {
      const parsedAnswer = parseApprovalAnswerRequest(body)
      if (parsedAnswer === undefined) {
        return serviceJson({ code: 'invalid-session-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
      }
      return deps.providers.sessionApprovalAnswer(parsedAnswer)
    }
    const parsedWithdraw = parseApprovalWithdrawRequest(body)
    if (parsedWithdraw === undefined) {
      return serviceJson({ code: 'invalid-session-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    return deps.providers.sessionApprovalWithdraw(parsedWithdraw)
  }

  if (url.pathname === SAGE_SESSION_PLAN_MODE_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseSessionPlanModeRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-session-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    return deps.providers.sessionPlanModeSwitch(parsed)
  }

  if (url.pathname === SAGE_SESSION_CLARIFICATION_ANSWER_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseClarificationAnswerRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-session-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    return deps.providers.sessionClarificationAnswer(parsed)
  }

  if (url.pathname === SAGE_SESSION_SEND_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseSessionSendRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-session-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    return deps.providers.sendSessionPrompt(parsed)
  }

  if (url.pathname === SAGE_ATTACHMENT_PICK_PATH || url.pathname === SAGE_ATTACHMENT_UPLOAD_PATH || url.pathname === SAGE_ATTACHMENT_CANCEL_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseAttachmentRequest(body, url.pathname)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-attachment-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (url.pathname === SAGE_ATTACHMENT_PICK_PATH) return deps.providers.pickAttachments()
    if (url.pathname === SAGE_ATTACHMENT_UPLOAD_PATH) {
      return deps.providers.uploadAttachment(parsed as { itemId: string, matterRef: string, workspaceRoot: string })
    }
    return deps.providers.cancelAttachment(parsed as { itemId: string })
  }

  if (url.pathname === SAGE_SIDE_CHAT_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseSideChatRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-side-chat-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (parsed.action === 'create') return deps.providers.createSideChat({ matterRef: parsed.matterRef })
    if (parsed.action === 'send') return deps.providers.sendSideChat({ sideChatId: parsed.sideChatId, text: parsed.text })
    if (parsed.action === 'read') return deps.providers.readSideChat({ sideChatId: parsed.sideChatId })
    return deps.providers.returnSideChat({ sideChatId: parsed.sideChatId, text: parsed.text })
  }

  if (url.pathname === SAGE_SEARCH_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseSearchRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-search-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    return runProjectionRead(
      deps,
      'search.query',
      { kind: 'collection', collection: 'search' },
      () => deps.providers.search(parsed),
      () => serviceJson({ state: 'refused', code: 'search-unavailable' }, 200),
    )
  }

  if (url.pathname === SAGE_ARTIFACTS_OBSERVE_PATH || url.pathname === SAGE_ARTIFACTS_OPEN_PATH
    || url.pathname === SAGE_ARTIFACTS_CLOSE_PATH || url.pathname === SAGE_ARTIFACTS_RETRY_PATH
    || url.pathname === SAGE_ARTIFACTS_FULLSCREEN_PATH || url.pathname === SAGE_ARTIFACTS_WINDOW_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseArtifactRequest(body, url.pathname)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-artifact-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (url.pathname === SAGE_ARTIFACTS_OBSERVE_PATH) {
      const observe = parsed as { matterRef: string, workspaceRoot: string }
      return runProjectionRead(
        deps,
        'artifacts.observe',
        { kind: 'matter-workspace', matterRef: observe.matterRef, workspaceRoot: observe.workspaceRoot },
        () => deps.providers.observeArtifacts(observe),
        () => serviceJson({ state: 'refused', code: 'artifact-store-unavailable' }, 200),
      )
    }
    if (url.pathname === SAGE_ARTIFACTS_OPEN_PATH) {
      const open = parsed as { artifactId: string }
      return runProjectionRead(
        deps,
        'artifacts.open',
        { kind: 'opaque', resource: 'artifact', id: open.artifactId },
        () => deps.providers.openArtifact(open),
        () => serviceJson({ state: 'refused', code: 'artifact-preview-unavailable' }, 200),
      )
    }
    if (url.pathname === SAGE_ARTIFACTS_CLOSE_PATH) return deps.providers.closeArtifact()
    if (url.pathname === SAGE_ARTIFACTS_FULLSCREEN_PATH) return deps.providers.fullscreenArtifact(parsed as { on: boolean })
    if (url.pathname === SAGE_ARTIFACTS_WINDOW_PATH) {
      const action = parsed as { action?: unknown }
      if (action !== null && typeof action === 'object' && action.action === 'open') return deps.providers.artifactWindowOpen()
      return deps.providers.artifactWindowClose()
    }
    return runProjectionRead(
      deps,
      'artifacts.retry',
      { kind: 'opaque', resource: 'current-artifact' },
      () => deps.providers.retryArtifact(),
      () => serviceJson({ state: 'refused', code: 'artifact-preview-unavailable' }, 200),
    )
  }

  if (url.pathname === SAGE_EXTERNAL_LINK_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseExternalLinkRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-external-link-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    return deps.providers.openExternalLink(parsed)
  }

  if (url.pathname === SAGE_EDIT_DRAFTS_CREATE_PATH || url.pathname === SAGE_EDIT_DRAFTS_UPDATE_PATH
    || url.pathname === SAGE_EDIT_DRAFTS_DIFF_PATH || url.pathname === SAGE_EDIT_DRAFTS_PREPARE_WRITEBACK_PATH
    || url.pathname === SAGE_EDIT_DRAFTS_WRITEBACK_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseEditDraftRequest(body, url.pathname)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-edit-draft-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (url.pathname === SAGE_EDIT_DRAFTS_CREATE_PATH) {
      const create = parsed as { referenceId: string }
      return runProjectionRead(
        deps,
        'edit-drafts.create',
        { kind: 'opaque', resource: 'file-reference', id: create.referenceId },
        (scope) => deps.providers.createEditDraft({ referenceId: create.referenceId, matterRef: scope.matterRef }),
        () => serviceJson({ state: 'refused', code: 'edit-draft-unavailable' }, 200),
      )
    }
    if (url.pathname === SAGE_EDIT_DRAFTS_UPDATE_PATH) return deps.providers.updateEditDraft(parsed as { draftId: string, proposedText: string })
    if (url.pathname === SAGE_EDIT_DRAFTS_DIFF_PATH) {
      const diff = parsed as { draftId: string }
      return runProjectionRead(
        deps,
        'edit-drafts.diff',
        { kind: 'opaque', resource: 'edit-draft', id: diff.draftId },
        () => deps.providers.diffEditDraft(diff),
        () => serviceJson({ state: 'refused', code: 'edit-draft-unavailable' }, 200),
      )
    }
    if (url.pathname === SAGE_EDIT_DRAFTS_PREPARE_WRITEBACK_PATH) return deps.providers.prepareEditDraftWriteback(parsed as { draftId: string })
    return deps.providers.writebackEditDraft(parsed as { draftId: string, confirmationId?: string })
  }

  if (url.pathname === SAGE_ACTION_ITEMS_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseActionItemRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-action-item-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (parsed.action === 'create') return deps.providers.createActionItem(parsed)
    if (parsed.action === 'update') return deps.providers.updateActionItem(parsed)
    if (parsed.action === 'start') return deps.providers.startActionItem(parsed)
    return deps.providers.completeActionItem(parsed)
  }

  if (url.pathname === SAGE_CORRECTIONS_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseCorrectionRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-correction-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    return deps.providers.submitCorrection(parsed)
  }

  if (url.pathname === SAGE_PROJECTS_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseProjectRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-project-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (parsed.action === 'create') return deps.providers.createProject(parsed as { name: string })
    if (parsed.action === 'assign') return deps.providers.assignProject(parsed as { matterRef: string, projectRef: string })
    return deps.providers.unassignProject(parsed as { matterRef: string })
  }

  if (url.pathname === SAGE_MATTER_ADMIN_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseMatterAdminRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-matter-admin-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (parsed.action === 'archive') return deps.providers.archiveMatter(parsed)
    if (parsed.action === 'restore') return deps.providers.restoreMatter(parsed)
    if (parsed.action === 'batch') return deps.providers.batchMatters(parsed)
    return deps.providers.renameMatter(parsed)
  }

  if (url.pathname === SAGE_MATTER_GROUPS_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseMatterGroupsRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-matter-groups-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (parsed.action === 'create') return deps.providers.createMatterGroup(parsed)
    if (parsed.action === 'rename') return deps.providers.renameMatterGroup(parsed)
    if (parsed.action === 'remove') return deps.providers.removeMatterGroup(parsed)
    return deps.providers.assignMatterGroup(parsed)
  }

  if (url.pathname === SAGE_PLANS_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parsePlanRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-plan-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (parsed.action === 'create') return deps.providers.createPlan(parsed)
    if (parsed.action === 'accept') return deps.providers.acceptPlan(parsed)
    if (parsed.action === 'prepare-step') return deps.providers.preparePlanStep(parsed)
    return deps.providers.executePlanStep(parsed)
  }

  if (url.pathname === SAGE_RUN_LOG_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseRunLogRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-run-log-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    return runProjectionRead(
      deps,
      'run-log.read',
      { kind: 'workspace', workspaceRoot: parsed.workspaceRoot },
      () => deps.providers.readRunLog(parsed),
      () => serviceJson({ state: 'refused', code: 'run-log-unavailable' }, 200),
    )
  }

  if (url.pathname === SAGE_MATTER_LINK_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseMatterLinkRequest(body)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-link-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    return deps.providers.linkWorkspace(parsed)
  }

  if (url.pathname === SAGE_DRAFT_RECONCILE_PATH || url.pathname === SAGE_DRAFT_CANCEL_PATH || url.pathname === SAGE_DRAFT_PREPARE_CONFIRM_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseDraftRequest(body, url.pathname)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-draft-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (url.pathname === SAGE_DRAFT_RECONCILE_PATH) return deps.providers.reconcileDraft(parsed as { draftId: string })
    if (url.pathname === SAGE_DRAFT_PREPARE_CONFIRM_PATH) return deps.providers.prepareDraftConfirmation(parsed as { draftId: string })
    return deps.providers.cancelDraftConfirm(parsed as { draftId: string })
  }

  if (url.pathname === SAGE_DRAFT_CREATE_PATH || url.pathname === SAGE_DRAFT_UPDATE_PATH || url.pathname === SAGE_DRAFT_CONVERT_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseDraftRequest(body, url.pathname)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-draft-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (url.pathname === SAGE_DRAFT_CREATE_PATH) return deps.providers.createDraft(parsed as { rawInput: string })
    if (url.pathname === SAGE_DRAFT_UPDATE_PATH) return deps.providers.updateDraft(parsed as never)
    return deps.providers.convertDraft(parsed as { draftId: string })
  }

  if (url.pathname === SAGE_FILES_CANDIDATES_PATH || url.pathname === SAGE_FILES_REFERENCE_PATH || url.pathname === SAGE_FILES_USE_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return transportDenial(415)
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return transportDenial(413)
    const parsed = parseFileRequest(body, url.pathname === SAGE_FILES_USE_PATH)
    if (parsed === undefined) {
      return serviceJson({ code: 'invalid-file-request', stage: 'intent', retryable: false, correlation: deps.callerBinding.correlation }, 400)
    }
    if (url.pathname === SAGE_FILES_CANDIDATES_PATH) {
      const candidate = parsed as { workspaceRoot: string, path: string }
      return runProjectionRead(
        deps,
        'workspace.files.list-candidates',
        { kind: 'workspace', workspaceRoot: candidate.workspaceRoot },
        () => deps.providers.listFileCandidates(candidate),
        () => serviceJson({ state: 'refused', code: 'file-candidates-unavailable', entries: [], truncated: false, path: '' }, 200),
      )
    }
    if (url.pathname === SAGE_FILES_REFERENCE_PATH) {
      const reference = parsed as { workspaceRoot: string, path: string }
      return runProjectionRead(
        deps,
        'workspace.files.create-reference',
        { kind: 'workspace', workspaceRoot: reference.workspaceRoot },
        () => deps.providers.createFileReference(reference),
        () => serviceJson({ state: 'refused', code: 'file-reference-unavailable', reference: null }, 200),
      )
    }
    const use = parsed as { referenceId: string }
    return runProjectionRead(
      deps,
      'workspace.files.use-reference',
      { kind: 'opaque', resource: 'file-reference', id: use.referenceId },
      () => deps.providers.useFileReference(use),
      () => serviceJson({ state: 'unknown', code: 'file-reference-unavailable', reference: null, text: null }, 200),
    )
  }

  return transportDenial(404)
}

/** CTX-01B accepts only a matter candidate and the caller's last observed CAS generation. */
function parseActiveMatterSelection(body: string): { readonly matterId: string; readonly expectedContextGeneration: number } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 2 || !keys.every((key) => key === 'matterId' || key === 'expectedContextGeneration')) return undefined
  if (typeof record.matterId !== 'string' || record.matterId.trim() !== record.matterId || record.matterId === '' || record.matterId.length > 256) return undefined
  if (typeof record.expectedContextGeneration !== 'number'
    || !Number.isSafeInteger(record.expectedContextGeneration)
    || record.expectedContextGeneration < 0) return undefined
  return {
    matterId: record.matterId,
    expectedContextGeneration: record.expectedContextGeneration,
  }
}

/** One patch of the eight display preferences: known keys, known values, nothing else. */
const PREFERENCE_VALUES: Readonly<Record<string, readonly string[]>> = {
  theme: ['light', 'dark', 'system'],
  language: ['zh', 'en'],
  density: ['comfortable', 'compact'],
  fontStyle: ['sans', 'serif'],
  contentWidth: ['standard', 'wide'],
  terminalTheme: ['follow', 'manual'],
  fileIcons: ['product', 'material'],
  iconAppearance: ['system', 'light', 'dark'],
}
function parsePreferencesPatch(body: string): Partial<DisplayPreferenceValues> | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 0 || keys.length > 8) return undefined
  for (const key of keys) {
    const allowed = PREFERENCE_VALUES[key]
    const candidate = record[key]
    if (allowed === undefined || typeof candidate !== 'string' || !allowed.includes(candidate)) return undefined
  }
  return {
    ...(record.theme === undefined ? {} : { theme: record.theme as DisplayPreferenceValues['theme'] }),
    ...(record.language === undefined ? {} : { language: record.language as DisplayPreferenceValues['language'] }),
    ...(record.density === undefined ? {} : { density: record.density as DisplayPreferenceValues['density'] }),
    ...(record.fontStyle === undefined ? {} : { fontStyle: record.fontStyle as DisplayPreferenceValues['fontStyle'] }),
    ...(record.contentWidth === undefined ? {} : { contentWidth: record.contentWidth as DisplayPreferenceValues['contentWidth'] }),
    ...(record.terminalTheme === undefined ? {} : { terminalTheme: record.terminalTheme as DisplayPreferenceValues['terminalTheme'] }),
    ...(record.fileIcons === undefined ? {} : { fileIcons: record.fileIcons as DisplayPreferenceValues['fileIcons'] }),
    ...(record.iconAppearance === undefined ? {} : { iconAppearance: record.iconAppearance as DisplayPreferenceValues['iconAppearance'] }),
  }
}

function parseSessionControlRequest(body: string, pathname: string): unknown {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const isRef = (candidate: unknown): candidate is string => typeof candidate === 'string' && candidate !== '' && candidate.length <= 256
  if (pathname.endsWith('/stop')) {
    if (keys.length !== 1 || !isRef(record.matterRef)) return undefined
    return { matterRef: record.matterRef }
  }
  if (pathname.endsWith('/resume')) {
    if (keys.length !== 2 || !isRef(record.matterRef)) return undefined
    if (typeof record.workspaceRoot !== 'string' || record.workspaceRoot === '' || record.workspaceRoot.length > 4096) return undefined
    return { matterRef: record.matterRef, workspaceRoot: record.workspaceRoot }
  }
  // pending / queue: {action: 'edit', itemId, text} | {action: 'remove', itemId}
  if (record.action === 'edit') {
    if (keys.length !== 3 || !isRef(record.itemId)) return undefined
    if (typeof record.text !== 'string' || record.text.trim() === '' || record.text.length > 16_384) return undefined
    return { action: 'edit', itemId: record.itemId, text: record.text }
  }
  if (record.action === 'remove') {
    if (keys.length !== 2 || !isRef(record.itemId)) return undefined
    return { action: 'remove', itemId: record.itemId }
  }
  return undefined
}

/** Ticket 009: `{action:'list'[, beforeSeq]}` | `{action:'detail', runSeq}` — exact members. */
function parseSessionHistoryRequest(body: string):
  | { readonly action: 'list', readonly beforeSeq?: number }
  | { readonly action: 'detail', readonly runSeq: number }
  | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const isInt = (candidate: unknown): candidate is number => typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0
  if (record.action === 'list') {
    if (keys.length !== 1 && keys.length !== 2) return undefined
    if (!keys.every((key) => ['action', 'beforeSeq'].includes(key))) return undefined
    if (record.beforeSeq !== undefined && !isInt(record.beforeSeq)) return undefined
    return { action: 'list', ...(record.beforeSeq === undefined ? {} : { beforeSeq: record.beforeSeq }) }
  }
  if (record.action === 'detail') {
    if (keys.length !== 2 || !keys.every((key) => ['action', 'runSeq'].includes(key))) return undefined
    if (!isInt(record.runSeq)) return undefined
    return { action: 'detail', runSeq: record.runSeq }
  }
  return undefined
}

/** `{action:'select', kind, ref}` / `{action:'clear', kind[, ref]}` — exactly (038). */
function parseInputSelectionsRequest(body: string):
  | { readonly action: 'select', readonly kind: 'skill' | 'plugin', readonly ref: string }
  | { readonly action: 'clear', readonly kind: 'skill' | 'plugin', readonly ref?: string }
  | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (record.kind !== 'skill' && record.kind !== 'plugin') return undefined
  if (record.action === 'select') {
    if (keys.length !== 3 || !keys.every((key) => ['action', 'kind', 'ref'].includes(key))) return undefined
    if (typeof record.ref !== 'string' || record.ref.trim() === '' || record.ref.length > 128) return undefined
    return { action: 'select', kind: record.kind, ref: record.ref }
  }
  if (record.action === 'clear') {
    if (keys.length !== 2 && keys.length !== 3) return undefined
    if (!keys.every((key) => ['action', 'kind', 'ref'].includes(key))) return undefined
    if (record.ref !== undefined && (typeof record.ref !== 'string' || record.ref.trim() === '' || record.ref.length > 128)) return undefined
    return { action: 'clear', kind: record.kind, ...(record.ref === undefined ? {} : { ref: record.ref }) }
  }
  return undefined
}

/** `{action:'save', messageRef, text}` / `{action:'resend', editId[, workspaceRoot]}` /
 *  `{action:'verify', editId}` — exactly the declared members (036). */
function parseSessionEditsRequest(body: string):
  | { readonly action: 'save', readonly messageRef: string, readonly text: string }
  | { readonly action: 'resend', readonly editId: string, readonly workspaceRoot?: string }
  | { readonly action: 'verify', readonly editId: string }
  | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (record.action === 'save') {
    if (keys.length !== 3 || !keys.every((key) => ['action', 'messageRef', 'text'].includes(key))) return undefined
    if (typeof record.messageRef !== 'string' || record.messageRef.trim() === '' || record.messageRef.length > 160) return undefined
    if (typeof record.text !== 'string' || record.text.length > 16_384) return undefined
    return { action: 'save', messageRef: record.messageRef, text: record.text }
  }
  if (record.action === 'resend') {
    if (keys.length !== 2 && keys.length !== 3) return undefined
    if (!keys.every((key) => ['action', 'editId', 'workspaceRoot'].includes(key))) return undefined
    if (typeof record.editId !== 'string' || record.editId.trim() === '' || record.editId.length > 160) return undefined
    if (record.workspaceRoot !== undefined && (typeof record.workspaceRoot !== 'string' || record.workspaceRoot.length > 4096)) return undefined
    return { action: 'resend', editId: record.editId, ...(record.workspaceRoot === undefined ? {} : { workspaceRoot: record.workspaceRoot as string }) }
  }
  if (record.action === 'verify') {
    if (keys.length !== 2 || !keys.every((key) => ['action', 'editId'].includes(key))) return undefined
    if (typeof record.editId !== 'string' || record.editId.trim() === '' || record.editId.length > 160) return undefined
    return { action: 'verify', editId: record.editId }
  }
  return undefined
}

/** `{action:'read'}` / `{action:'locate', runSeq}` — exactly the declared members (035). */
function parseSessionAnchorsRequest(body: string):
  | { readonly action: 'read' }
  | { readonly action: 'locate', readonly runSeq: number }
  | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const isInt = (candidate: unknown): candidate is number => typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0
  if (record.action === 'read') {
    if (keys.length !== 1) return undefined
    return { action: 'read' }
  }
  if (record.action === 'locate') {
    if (keys.length !== 2 || !keys.every((key) => ['action', 'runSeq'].includes(key))) return undefined
    if (!isInt(record.runSeq)) return undefined
    return { action: 'locate', runSeq: record.runSeq }
  }
  return undefined
}

/** `{action:'submit', text[, code, stage, correlation]}` / `{action:'verify', requestId}` — exactly
 *  the declared members; the payload carries NOTHING else (048). */
function parseFeedbackRequest(body: string):
  | { readonly action: 'submit', readonly text: string, readonly code?: string, readonly stage?: string, readonly correlation?: string }
  | { readonly action: 'verify', readonly requestId: string }
  | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const boundedField = (candidate: unknown): candidate is string =>
    typeof candidate === 'string' && candidate.trim() === candidate && candidate !== '' && candidate.length <= 128
  if (record.action === 'submit') {
    if (keys.length < 2 || keys.length > 5 || !keys.every((key) => ['action', 'text', 'code', 'stage', 'correlation'].includes(key))) return undefined
    if (typeof record.text !== 'string' || record.text.trim() === '' || record.text.length > 4000) return undefined
    for (const key of ['code', 'stage', 'correlation'] as const) {
      if (record[key] !== undefined && !boundedField(record[key])) return undefined
    }
    return {
      action: 'submit',
      text: record.text,
      ...(record.code === undefined ? {} : { code: record.code as string }),
      ...(record.stage === undefined ? {} : { stage: record.stage as string }),
      ...(record.correlation === undefined ? {} : { correlation: record.correlation as string }),
    }
  }
  if (record.action === 'verify') {
    if (keys.length !== 2 || !keys.every((key) => ['action', 'requestId'].includes(key))) return undefined
    if (typeof record.requestId !== 'string' || record.requestId.trim() === '' || record.requestId.length > 128) return undefined
    return { action: 'verify', requestId: record.requestId }
  }
  return undefined
}

/** `{terminalId[, offset, lines]}` — exactly the declared members (043). */
function parseTerminalReadRequest(body: string): { readonly terminalId: string, readonly offset?: number, readonly lines?: number } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length < 1 || keys.length > 3 || !keys.every((key) => ['terminalId', 'offset', 'lines'].includes(key))) return undefined
  if (typeof record.terminalId !== 'string' || record.terminalId.trim() === '' || record.terminalId.length > 128) return undefined
  for (const [key, max] of [['offset', 1_000_000], ['lines', 500]] as const) {
    const candidate = record[key]
    if (candidate === undefined) continue
    if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < (key === 'lines' ? 1 : 0) || candidate > max) return undefined
  }
  return {
    terminalId: record.terminalId,
    ...(record.offset === undefined ? {} : { offset: record.offset as number }),
    ...(record.lines === undefined ? {} : { lines: record.lines as number }),
  }
}

/** `{matterRef, requestId, outcome}` — exactly the declared members; the decision is one of the
 *  two user words (041). */
function parseApprovalAnswerRequest(body: string): { readonly matterRef: string, readonly requestId: string, readonly outcome: 'allowed-once' | 'rejected' } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 3 || !keys.every((key) => ['matterRef', 'requestId', 'outcome'].includes(key))) return undefined
  if (typeof record.matterRef !== 'string' || record.matterRef.trim() === '' || record.matterRef.length > 256) return undefined
  if (typeof record.requestId !== 'string' || record.requestId.trim() === '' || record.requestId.length > 128) return undefined
  if (record.outcome !== 'allowed-once' && record.outcome !== 'rejected') return undefined
  return { matterRef: record.matterRef, requestId: record.requestId, outcome: record.outcome }
}

/** `{matterRef, requestId}` — exactly the declared members (041). */
function parseApprovalWithdrawRequest(body: string): { readonly matterRef: string, readonly requestId: string } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 2 || !keys.every((key) => ['matterRef', 'requestId'].includes(key))) return undefined
  if (typeof record.matterRef !== 'string' || record.matterRef.trim() === '' || record.matterRef.length > 256) return undefined
  if (typeof record.requestId !== 'string' || record.requestId.trim() === '' || record.requestId.length > 128) return undefined
  return { matterRef: record.matterRef, requestId: record.requestId }
}

/** `{active}` — exactly the one declared member; the path IS the operation (039). */
function parseSessionPlanModeRequest(body: string): { readonly active: boolean } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 1 || keys[0] !== 'active') return undefined
  if (typeof record.active !== 'boolean') return undefined
  return { active: record.active }
}

/** `{matterRef, requestId, answers}` — exactly the declared members; each answer's shape is
 *  checked against the card at the store, so only the carrier is validated here (034). */
function parseClarificationAnswerRequest(body: string): { readonly matterRef: string, readonly requestId: string, readonly answers: readonly unknown[] } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 3 || !keys.every((key) => ['matterRef', 'requestId', 'answers'].includes(key))) return undefined
  if (typeof record.matterRef !== 'string' || record.matterRef.trim() === '' || record.matterRef.length > 256) return undefined
  if (typeof record.requestId !== 'string' || record.requestId.trim() === '' || record.requestId.length > 128) return undefined
  if (!Array.isArray(record.answers) || record.answers.length < 1 || record.answers.length > 8) return undefined
  // Each entry must be a plain object with at least the two declared keys; the option labels and
  // coverage are semantic and live with the card (the store and the relay both re-check).
  for (const entry of record.answers) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return undefined
    const answer = entry as Record<string, unknown>
    const answerKeys = Object.keys(answer)
    if (answerKeys.length < 2 || answerKeys.length > 3 || !answerKeys.every((key) => ['questionId', 'selected', 'custom'].includes(key))) return undefined
    if (typeof answer.questionId !== 'string' || answer.questionId.trim() === '' || answer.questionId.length > 128) return undefined
    if (!Array.isArray(answer.selected) || answer.selected.length > 16) return undefined
    if (answer.selected.some((label) => typeof label !== 'string' || label.length > 512)) return undefined
    if (answer.custom !== undefined && (typeof answer.custom !== 'string' || answer.custom.length > 4096)) return undefined
  }
  return { matterRef: record.matterRef, requestId: record.requestId, answers: record.answers }
}

/** `{matterRef, workspaceRoot, text[, mode]}` — exactly the declared members (008 adds mode). */
function parseSessionSendRequest(body: string): { readonly matterRef: string, readonly workspaceRoot: string, readonly text: string, readonly mode?: 'queue' | 'steer' } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const allowed = ['matterRef', 'workspaceRoot', 'text', 'mode']
  if (keys.length < 3 || keys.length > 4 || !keys.every((key) => allowed.includes(key))) return undefined
  if (typeof record.matterRef !== 'string' || record.matterRef === '' || record.matterRef.length > 256) return undefined
  if (typeof record.workspaceRoot !== 'string' || record.workspaceRoot === '' || record.workspaceRoot.length > 4096) return undefined
  if (typeof record.text !== 'string' || record.text.trim() === '' || record.text.length > 16_384) return undefined
  if (record.mode !== undefined && record.mode !== 'queue' && record.mode !== 'steer') return undefined
  return {
    matterRef: record.matterRef,
    workspaceRoot: record.workspaceRoot,
    text: record.text,
    ...(record.mode === undefined ? {} : { mode: record.mode }),
  }
}

/** Ticket 024: four named side-chat actions; each names exactly what it needs. */
function parseSideChatRequest(body: string):
  | { readonly action: 'create', readonly matterRef: string }
  | { readonly action: 'send' | 'read' | 'return', readonly sideChatId: string, readonly text: string }
  | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const bounded = (candidate: unknown, maxLength: number): candidate is string =>
    typeof candidate === 'string' && candidate !== '' && candidate.length <= maxLength
  if (record.action === 'create') {
    const keys = Object.keys(record)
    if (keys.length !== 2 || !bounded(record.matterRef, 256)) return undefined
    return { action: 'create', matterRef: record.matterRef }
  }
  if (record.action === 'send' || record.action === 'return') {
    const keys = Object.keys(record)
    if (keys.length !== 3 || !bounded(record.sideChatId, 256) || !bounded(record.text, 16_384)) return undefined
    return { action: record.action, sideChatId: record.sideChatId, text: record.text }
  }
  if (record.action === 'read') {
    const keys = Object.keys(record)
    if (keys.length !== 2 || !bounded(record.sideChatId, 256)) return undefined
    return { action: 'read', sideChatId: record.sideChatId, text: '' }
  }
  return undefined
}

/** Ticket 021: one bounded query string — the base's own limits apply again at the bridge. */
function parseSearchRequest(body: string): { readonly query: string } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 1 || keys[0] !== 'query') return undefined
  if (typeof record.query !== 'string') return undefined
  const query = record.query.trim()
  if (query === '' || query.length > 500 || query.includes('\u0000')) return undefined
  return { query }
}

/** Ticket 015: observe names the matter context; open names the card; close/retry take `{}`. */
function parseArtifactRequest(body: string, pathname: string): Record<string, unknown> | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const boundedRef = (candidate: unknown, maxLength: number): candidate is string =>
    typeof candidate === 'string' && candidate !== '' && candidate.length <= maxLength
  if (pathname === SAGE_ARTIFACTS_CLOSE_PATH || pathname === SAGE_ARTIFACTS_RETRY_PATH) {
    return keys.length === 0 ? {} : undefined
  }
  if (pathname === SAGE_ARTIFACTS_FULLSCREEN_PATH) {
    if (keys.length !== 1 || keys[0] !== 'on' || typeof record.on !== 'boolean') return undefined
    return { on: record.on }
  }
  if (pathname === SAGE_ARTIFACTS_WINDOW_PATH) {
    if (keys.length !== 1 || keys[0] !== 'action') return undefined
    if (record.action !== 'open' && record.action !== 'close') return undefined
    return { action: record.action }
  }
  if (pathname === SAGE_ARTIFACTS_OPEN_PATH) {
    if (keys.length !== 1 || keys[0] !== 'artifactId' || !boundedRef(record.artifactId, 256)) return undefined
    return { artifactId: record.artifactId }
  }
  if (keys.length !== 2 || !keys.every((key) => ['matterRef', 'workspaceRoot'].includes(key))) return undefined
  if (!boundedRef(record.matterRef, 256) || !boundedRef(record.workspaceRoot, 4096)) return undefined
  return { matterRef: record.matterRef, workspaceRoot: record.workspaceRoot }
}

/** Ticket 033: `{url}` — exact member, bounded length; the scheme allowlist is the module's job. */
function parseExternalLinkRequest(body: string): { readonly url: string } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 1 || keys[0] !== 'url') return undefined
  if (typeof record.url !== 'string' || record.url === '' || record.url.length > 2048) return undefined
  return { url: record.url }
}

/** Ticket 014: pick takes `{}`; upload names the item and the matter context; cancel names the item. */
function parseAttachmentRequest(body: string, pathname: string): Record<string, unknown> | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const boundedRef = (candidate: unknown, maxLength: number): candidate is string =>
    typeof candidate === 'string' && candidate !== '' && candidate.length <= maxLength
  if (pathname === SAGE_ATTACHMENT_PICK_PATH) {
    if (keys.length !== 0) return undefined
    return {}
  }
  if (pathname === SAGE_ATTACHMENT_UPLOAD_PATH) {
    if (keys.length !== 3 || !keys.every((key) => ['itemId', 'matterRef', 'workspaceRoot'].includes(key))) return undefined
    if (!boundedRef(record.itemId, 256) || !boundedRef(record.matterRef, 256) || !boundedRef(record.workspaceRoot, 4096)) return undefined
    return { itemId: record.itemId, matterRef: record.matterRef, workspaceRoot: record.workspaceRoot }
  }
  if (keys.length !== 1 || keys[0] !== 'itemId' || !boundedRef(record.itemId, 256)) return undefined
  return { itemId: record.itemId }
}

/** `{action, matterRef}` or `{action, matterRef, workspaceRef}` — exactly the declared members. */
function parseMatterLinkRequest(body: string): { readonly action: 'link' | 'unlink' | 'set-default', readonly matterRef: string, readonly workspaceRef?: string } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (!['link', 'unlink', 'set-default'].includes(record.action as string)) return undefined
  if (typeof record.matterRef !== 'string' || record.matterRef === '' || record.matterRef.length > 256) return undefined
  const action = record.action as 'link' | 'unlink' | 'set-default'
  // `clear-default` is spelled as `set-default` without a workspace: one action, one meaning.
  const expectWorkspace = action !== 'set-default' || keys.includes('workspaceRef')
  if (keys.length !== (expectWorkspace ? 3 : 2)) return undefined
  if (!keys.every((key) => ['action', 'matterRef', 'workspaceRef'].includes(key))) return undefined
  if (!expectWorkspace) return { action, matterRef: record.matterRef }
  if (typeof record.workspaceRef !== 'string' || record.workspaceRef === '' || record.workspaceRef.length > 256) return undefined
  return { action, matterRef: record.matterRef, workspaceRef: record.workspaceRef }
}

function parseDraftRequest(body: string, pathname: string): unknown {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const boundedText = (candidate: unknown, max: number): candidate is string => typeof candidate === 'string' && candidate.length <= max
  if (pathname.endsWith('/create')) {
    if (Object.keys(record).length !== 1 || !boundedText(record.rawInput, 16_384) || record.rawInput.trim() === '') return undefined
    return { rawInput: record.rawInput }
  }
  if (pathname.endsWith('/convert')) {
    // Ticket 025: the convert carries the one-time credential of the prepared card; the body is
    // still exact — `{draftId}` or `{draftId, confirmationId}`, nothing else.
    const keys = Object.keys(record)
    if (typeof record.draftId !== 'string' || record.draftId === '' || record.draftId.length > 256) return undefined
    if (keys.length === 1) return { draftId: record.draftId }
    if (keys.length === 2 && keys.includes('confirmationId')
      && typeof record.confirmationId === 'string' && record.confirmationId !== '' && record.confirmationId.length <= 256) {
      return { draftId: record.draftId, confirmationId: record.confirmationId }
    }
    return undefined
  }
  if (pathname.endsWith('/reconcile') || pathname.endsWith('/cancel') || pathname.endsWith('/prepare-confirm')) {
    if (Object.keys(record).length !== 1 || typeof record.draftId !== 'string' || record.draftId === '' || record.draftId.length > 256) return undefined
    return { draftId: record.draftId }
  }
  // update: {draftId, fields?, clarification?, selectedEntryIds?} — every member strictly typed.
  const keys = Object.keys(record)
  if (keys.length < 2 || keys.length > 4 || typeof record.draftId !== 'string' || record.draftId === '' || record.draftId.length > 256) return undefined
  if (!keys.every((key) => ['draftId', 'fields', 'clarification', 'selectedEntryIds'].includes(key))) return undefined
  if (record.fields !== undefined) {
    if (record.fields === null || typeof record.fields !== 'object' || Array.isArray(record.fields)) return undefined
    const fields = record.fields as Record<string, unknown>
    const allowed = ['goal', 'deliverable', 'responsibility', 'projectRef']
    if (Object.keys(fields).length === 0 || !Object.keys(fields).every((key) => allowed.includes(key))) return undefined
    if (!Object.values(fields).every((entry) => boundedText(entry, 4_096))) return undefined
  }
  if (record.clarification !== undefined && !boundedText(record.clarification, 16_384)) return undefined
  if (record.selectedEntryIds !== undefined) {
    if (!Array.isArray(record.selectedEntryIds) || record.selectedEntryIds.length > 128) return undefined
    if (!record.selectedEntryIds.every((entry) => typeof entry === 'string' && entry !== '' && entry.length <= 256)) return undefined
  }
  return {
    draftId: record.draftId,
    ...(record.fields === undefined ? {} : { fields: record.fields }),
    ...(record.clarification === undefined ? {} : { clarification: record.clarification }),
    ...(record.selectedEntryIds === undefined ? {} : { selectedEntryIds: record.selectedEntryIds }),
  }
}

/** `{ workspaceRoot, path }` for candidates / reference, `{ referenceId }` for use. */
function parseFileRequest(body: string, use: boolean): { readonly workspaceRoot: string, readonly path: string } | { readonly referenceId: string } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const bounded = (candidate: unknown, max: number): candidate is string => typeof candidate === 'string' && candidate !== '' && candidate.length <= max
  if (use) {
    if (Object.keys(record).length !== 1 || !bounded(record.referenceId, 256)) return undefined
    return { referenceId: record.referenceId }
  }
  const keys = Object.keys(record)
  // `path` may be '' — the workspace root itself is a valid listing target.
  if (keys.length !== 2 || !bounded(record.workspaceRoot, 4096) || typeof record.path !== 'string' || record.path.length > 4096) return undefined
  return { workspaceRoot: record.workspaceRoot, path: record.path }
}

/** Read one mutation request exactly: known kind, exact members, bounded literals — nothing else. */
function parseWorkspaceMutation(body: string): WorkspaceMutationRequest | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const isRef = (candidate: unknown): candidate is string => typeof candidate === 'string' && candidate !== '' && candidate.length <= 256
  if (record.kind === 'delete') {
    if (Object.keys(record).length !== 2 || !isRef(record.workspaceId)) return undefined
    return { kind: 'delete', workspaceId: record.workspaceId }
  }
  if (record.kind === 'rename') {
    if (Object.keys(record).length !== 3 || !isRef(record.workspaceId)) return undefined
    if (typeof record.title !== 'string' || record.title.trim() === '' || record.title !== record.title.trim() || record.title.length > 200) return undefined
    return { kind: 'rename', workspaceId: record.workspaceId, title: record.title }
  }
  if (record.kind === 'reorder') {
    if (Object.keys(record).length !== 3 || !isRef(record.workspaceId)) return undefined
    if (record.beforeWorkspaceId !== null && !isRef(record.beforeWorkspaceId)) return undefined
    if (record.beforeWorkspaceId === record.workspaceId) return undefined
    return { kind: 'reorder', workspaceId: record.workspaceId, beforeWorkspaceId: record.beforeWorkspaceId }
  }
  return undefined
}

async function readActionBodyWithinLimit(request: Request): Promise<string | undefined> {
  if (request.body === null) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > MAX_SAGE_ACTION_BYTES) return undefined
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes).toString('utf8')
}

/** WT-02D.2A: the transport retry probe or a full exact-shape business intent (0.2 parser).
 *  Ticket 025 adds the confirmed form: `{intent, confirmationId}` — the one-time credential
 *  travels beside the intent, never inside it (the intent's own shape stays exact). */
function parseIntent(body: string): { readonly intent: SageDispatchIntent, readonly confirmationId?: string } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).length === 1 && record.type === 'retry') return { intent: { type: 'retry' } }
  if (Object.keys(record).length === 2 && 'intent' in record && 'confirmationId' in record) {
    const intent = parseSageActionIntentV2(record.intent)
    if (intent === undefined) return undefined
    if (typeof record.confirmationId !== 'string' || record.confirmationId === '' || record.confirmationId.length > 256) return undefined
    return { intent, confirmationId: record.confirmationId }
  }
  const bare = parseSageActionIntentV2(value)
  return bare === undefined ? undefined : { intent: bare }
}

/** Ticket 027: exact bodies per edit-draft verb — ids bounded, the proposal's own length capped;
 *  `proposedText` may be empty (removing everything is an edit), nothing else is admitted. */
function parseEditDraftRequest(body: string, pathname: string): unknown {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const boundedRef = (candidate: unknown): candidate is string => typeof candidate === 'string' && candidate !== '' && candidate.length <= 256
  if (pathname.endsWith('/create')) {
    if (keys.length !== 1 || !boundedRef(record.referenceId)) return undefined
    return { referenceId: record.referenceId }
  }
  if (pathname.endsWith('/update')) {
    if (keys.length !== 2 || !keys.every((key) => ['draftId', 'proposedText'].includes(key))) return undefined
    if (!boundedRef(record.draftId)) return undefined
    if (typeof record.proposedText !== 'string' || record.proposedText.length > 65_536) return undefined
    return { draftId: record.draftId, proposedText: record.proposedText }
  }
  if (pathname.endsWith('/writeback')) {
    if (typeof record.draftId !== 'string' || record.draftId === '' || record.draftId.length > 256) return undefined
    if (keys.length === 1) return { draftId: record.draftId }
    if (keys.length === 2 && keys.includes('confirmationId')
      && typeof record.confirmationId === 'string' && record.confirmationId !== '' && record.confirmationId.length <= 256) {
      return { draftId: record.draftId, confirmationId: record.confirmationId }
    }
    return undefined
  }
  if (keys.length !== 1 || !boundedRef(record.draftId)) return undefined
  return { draftId: record.draftId }
}

/** Ticket 028: the action-items route — one path, named actions, exact members per action. */
function parseActionItemRequest(body: string):
  | { readonly action: 'create', readonly matterRef: string, readonly title: string, readonly note?: string }
  | { readonly action: 'update', readonly actionId: string, readonly title?: string, readonly note?: string }
  | { readonly action: 'start' | 'complete', readonly actionId: string }
  | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const boundedRef = (candidate: unknown): candidate is string => typeof candidate === 'string' && candidate !== '' && candidate.length <= 256
  if (record.action === 'create') {
    if (keys.length < 3 || keys.length > 4 || !keys.every((key) => ['action', 'matterRef', 'title', 'note'].includes(key))) return undefined
    if (!boundedRef(record.matterRef)) return undefined
    if (typeof record.title !== 'string' || record.title.trim() === '' || record.title.length > 200) return undefined
    if (record.note !== undefined && (typeof record.note !== 'string' || record.note.length > 2000)) return undefined
    return { action: 'create', matterRef: record.matterRef, title: record.title, ...(record.note === undefined ? {} : { note: record.note }) }
  }
  if (record.action === 'update') {
    if (keys.length < 2 || keys.length > 3 || !keys.every((key) => ['action', 'actionId', 'title', 'note'].includes(key))) return undefined
    if (!boundedRef(record.actionId)) return undefined
    if (record.title === undefined && record.note === undefined) return undefined
    if (record.title !== undefined && (typeof record.title !== 'string' || record.title.trim() === '' || record.title.length > 200)) return undefined
    if (record.note !== undefined && (typeof record.note !== 'string' || record.note.length > 2000)) return undefined
    return {
      action: 'update',
      actionId: record.actionId,
      ...(record.title === undefined ? {} : { title: record.title }),
      ...(record.note === undefined ? {} : { note: record.note }),
    }
  }
  if (record.action === 'start' || record.action === 'complete') {
    if (keys.length !== 2 || !keys.every((key) => ['action', 'actionId'].includes(key))) return undefined
    if (!boundedRef(record.actionId)) return undefined
    return { action: record.action, actionId: record.actionId }
  }
  return undefined
}

/** Ticket 028: the correction body — `{matterRef, workspaceRoot, originalText[, originalAt], text}`. */
function parseCorrectionRequest(body: string): { readonly matterRef: string, readonly workspaceRoot: string, readonly originalText: string, readonly originalAt?: string, readonly text: string } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length < 4 || keys.length > 5 || !keys.every((key) => ['matterRef', 'workspaceRoot', 'originalText', 'originalAt', 'text'].includes(key))) return undefined
  const boundedRef = (candidate: unknown, max: number): candidate is string => typeof candidate === 'string' && candidate !== '' && candidate.length <= max
  if (!boundedRef(record.matterRef, 256) || !boundedRef(record.workspaceRoot, 4096)) return undefined
  if (typeof record.originalText !== 'string' || record.originalText.trim() === '' || record.originalText.length > 16_384) return undefined
  if (record.originalAt !== undefined && (typeof record.originalAt !== 'string' || record.originalAt.length > 64)) return undefined
  if (typeof record.text !== 'string' || record.text.trim() === '' || record.text.length > 16_384) return undefined
  return {
    matterRef: record.matterRef,
    workspaceRoot: record.workspaceRoot,
    originalText: record.originalText,
    ...(record.originalAt === undefined ? {} : { originalAt: record.originalAt }),
    text: record.text,
  }
}

/** Ticket 028: the projects route — named actions; membership is always one matter at a time. */
function parseProjectRequest(body: string): { readonly action: 'create', readonly name: string }
  | { readonly action: 'assign', readonly matterRef: string, readonly projectRef: string }
  | { readonly action: 'unassign', readonly matterRef: string }
  | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const boundedRef = (candidate: unknown, max: number): candidate is string => typeof candidate === 'string' && candidate !== '' && candidate.length <= max
  if (record.action === 'create') {
    if (keys.length !== 2 || !keys.every((key) => ['action', 'name'].includes(key))) return undefined
    if (typeof record.name !== 'string' || record.name.trim() === '' || record.name.length > 100) return undefined
    return { action: 'create', name: record.name }
  }
  if (record.action === 'assign') {
    if (keys.length !== 3 || !keys.every((key) => ['action', 'matterRef', 'projectRef'].includes(key))) return undefined
    if (!boundedRef(record.matterRef, 256) || !boundedRef(record.projectRef, 256)) return undefined
    return { action: 'assign', matterRef: record.matterRef, projectRef: record.projectRef }
  }
  if (record.action === 'unassign') {
    if (keys.length !== 2 || !keys.every((key) => ['action', 'matterRef'].includes(key))) return undefined
    if (!boundedRef(record.matterRef, 256)) return undefined
    return { action: 'unassign', matterRef: record.matterRef }
  }
  return undefined
}

/** Ticket 029: one route, four named acts — exact members per act, nothing else. */
function parseMatterAdminRequest(body: string):
  | { readonly action: 'archive', readonly matterRef: string, readonly ground: 'completed' | 'stopped' }
  | { readonly action: 'restore', readonly matterRef: string }
  | { readonly action: 'batch', readonly operation: 'archive' | 'restore', readonly targets: readonly string[], readonly ground?: 'completed' | 'stopped' }
  | { readonly action: 'rename', readonly matterRef: string, readonly title: string }
  | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const boundedRef = (candidate: unknown): candidate is string => typeof candidate === 'string' && candidate !== '' && candidate.length <= 256
  const isGround = (candidate: unknown): candidate is 'completed' | 'stopped' => candidate === 'completed' || candidate === 'stopped'
  if (record.action === 'archive') {
    if (keys.length !== 3 || !keys.every((key) => ['action', 'matterRef', 'ground'].includes(key))) return undefined
    if (!boundedRef(record.matterRef) || !isGround(record.ground)) return undefined
    return { action: 'archive', matterRef: record.matterRef, ground: record.ground }
  }
  if (record.action === 'restore') {
    if (keys.length !== 2 || !keys.every((key) => ['action', 'matterRef'].includes(key))) return undefined
    if (!boundedRef(record.matterRef)) return undefined
    return { action: 'restore', matterRef: record.matterRef }
  }
  if (record.action === 'batch') {
    if (keys.length < 3 || keys.length > 4 || !keys.every((key) => ['action', 'operation', 'targets', 'ground'].includes(key))) return undefined
    if (record.operation !== 'archive' && record.operation !== 'restore') return undefined
    if (!Array.isArray(record.targets) || record.targets.length === 0 || record.targets.length > 32) return undefined
    if (!record.targets.every((target) => boundedRef(target))) return undefined
    if (record.operation === 'archive') {
      if (!isGround(record.ground)) return undefined
      return { action: 'batch', operation: 'archive', targets: record.targets as string[], ground: record.ground }
    }
    if (record.ground !== undefined) return undefined
    return { action: 'batch', operation: 'restore', targets: record.targets as string[] }
  }
  if (record.action === 'rename') {
    if (keys.length !== 3 || !keys.every((key) => ['action', 'matterRef', 'title'].includes(key))) return undefined
    if (!boundedRef(record.matterRef)) return undefined
    if (typeof record.title !== 'string' || record.title.trim() === '' || record.title.length > 200) return undefined
    return { action: 'rename', matterRef: record.matterRef, title: record.title }
  }
  return undefined
}

/** Ticket 049: one route, four named acts — exact members per act, nothing else. */
function parseMatterGroupsRequest(body: string):
  | { readonly action: 'create', readonly name: string, readonly targets?: readonly string[] }
  | { readonly action: 'rename', readonly groupId: string, readonly name: string }
  | { readonly action: 'remove', readonly groupId: string }
  | { readonly action: 'assign', readonly groupId: string, readonly operation: 'add' | 'remove', readonly targets: readonly string[] }
  | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const boundedId = (candidate: unknown): candidate is string => typeof candidate === 'string' && candidate !== '' && candidate.length <= 256
  const boundedName = (candidate: unknown): candidate is string => typeof candidate === 'string' && candidate.trim() !== '' && candidate.length <= 120
  const boundedTargets = (candidate: unknown): candidate is string[] =>
    Array.isArray(candidate) && candidate.length > 0 && candidate.length <= 32
    && candidate.every((target) => typeof target === 'string' && target !== '' && target.length <= 256)
  if (record.action === 'create') {
    if (keys.length < 2 || keys.length > 3 || !keys.every((key) => ['action', 'name', 'targets'].includes(key))) return undefined
    if (!boundedName(record.name)) return undefined
    if (record.targets === undefined) return { action: 'create', name: record.name }
    if (!boundedTargets(record.targets)) return undefined
    return { action: 'create', name: record.name, targets: record.targets }
  }
  if (record.action === 'rename') {
    if (keys.length !== 3 || !keys.every((key) => ['action', 'groupId', 'name'].includes(key))) return undefined
    if (!boundedId(record.groupId) || !boundedName(record.name)) return undefined
    return { action: 'rename', groupId: record.groupId, name: record.name }
  }
  if (record.action === 'remove') {
    if (keys.length !== 2 || !keys.every((key) => ['action', 'groupId'].includes(key))) return undefined
    if (!boundedId(record.groupId)) return undefined
    return { action: 'remove', groupId: record.groupId }
  }
  if (record.action === 'assign') {
    if (keys.length !== 4 || !keys.every((key) => ['action', 'groupId', 'operation', 'targets'].includes(key))) return undefined
    if (!boundedId(record.groupId)) return undefined
    if (record.operation !== 'add' && record.operation !== 'remove') return undefined
    if (!boundedTargets(record.targets)) return undefined
    return { action: 'assign', groupId: record.groupId, operation: record.operation, targets: record.targets }
  }
  return undefined
}

/** Ticket 032: one route, four named acts — exact members per act, nothing else. */
function parsePlanRequest(body: string):
  | { readonly action: 'create', readonly matterRef: string, readonly title: string, readonly steps: readonly string[] }
  | { readonly action: 'accept', readonly planId: string }
  | { readonly action: 'prepare-step', readonly planId: string, readonly stepNo: number }
  | { readonly action: 'execute-step', readonly planId: string, readonly stepNo: number, readonly confirmationId?: string }
  | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  const boundedRef = (candidate: unknown): candidate is string => typeof candidate === 'string' && candidate !== '' && candidate.length <= 256
  const isStepNo = (candidate: unknown): candidate is number => Number.isSafeInteger(candidate) && (candidate as number) >= 1 && (candidate as number) <= 12
  if (record.action === 'create') {
    if (keys.length !== 4 || !keys.every((key) => ['action', 'matterRef', 'title', 'steps'].includes(key))) return undefined
    if (!boundedRef(record.matterRef)) return undefined
    if (typeof record.title !== 'string' || record.title.trim() === '' || record.title.length > 200) return undefined
    if (!Array.isArray(record.steps) || record.steps.length === 0 || record.steps.length > 12) return undefined
    if (!record.steps.every((step) => typeof step === 'string' && step.length <= 200)) return undefined
    return { action: 'create', matterRef: record.matterRef, title: record.title, steps: record.steps as string[] }
  }
  if (record.action === 'accept') {
    if (keys.length !== 2 || !keys.every((key) => ['action', 'planId'].includes(key)) || !boundedRef(record.planId)) return undefined
    return { action: 'accept', planId: record.planId }
  }
  if (record.action === 'prepare-step') {
    if (keys.length !== 3 || !keys.every((key) => ['action', 'planId', 'stepNo'].includes(key))) return undefined
    if (!boundedRef(record.planId) || !isStepNo(record.stepNo)) return undefined
    return { action: 'prepare-step', planId: record.planId, stepNo: record.stepNo }
  }
  if (record.action === 'execute-step') {
    if (keys.length < 3 || keys.length > 4 || !keys.every((key) => ['action', 'planId', 'stepNo', 'confirmationId'].includes(key))) return undefined
    if (!boundedRef(record.planId) || !isStepNo(record.stepNo)) return undefined
    if (record.confirmationId !== undefined && (typeof record.confirmationId !== 'string' || record.confirmationId === '' || record.confirmationId.length > 256)) return undefined
    return { action: 'execute-step', planId: record.planId, stepNo: record.stepNo, ...(record.confirmationId === undefined ? {} : { confirmationId: record.confirmationId }) }
  }
  return undefined
}

/** Ticket 031: `{workspaceRoot, path[, fromLine, expectVersion, expectBytes]}` — exact members. */
function parseRunLogRequest(body: string): { readonly workspaceRoot: string, readonly path: string, readonly fromLine?: number, readonly expectVersion?: string, readonly expectBytes?: number } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length < 2 || keys.length > 5 || !keys.every((key) => ['workspaceRoot', 'path', 'fromLine', 'expectVersion', 'expectBytes'].includes(key))) return undefined
  if (typeof record.workspaceRoot !== 'string' || record.workspaceRoot === '' || record.workspaceRoot.length > 4096) return undefined
  if (typeof record.path !== 'string' || record.path.length > 4096) return undefined
  if (record.fromLine !== undefined && (!Number.isSafeInteger(record.fromLine) || (record.fromLine as number) < 1)) return undefined
  if (record.expectVersion !== undefined && (typeof record.expectVersion !== 'string' || record.expectVersion === '' || record.expectVersion.length > 256)) return undefined
  if (record.expectBytes !== undefined && (!Number.isSafeInteger(record.expectBytes) || (record.expectBytes as number) < 0)) return undefined
  return {
    workspaceRoot: record.workspaceRoot,
    path: record.path,
    ...(record.fromLine === undefined ? {} : { fromLine: record.fromLine as number }),
    ...(record.expectVersion === undefined ? {} : { expectVersion: record.expectVersion }),
    ...(record.expectBytes === undefined ? {} : { expectBytes: record.expectBytes as number }),
  }
}

/** Ticket 025: the prepare route takes the exact bare business intent; the retry probe has no
 *  external effect and nothing to confirm. */
function parseConfirmableIntent(body: string): SageActionIntentV2 | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  return parseSageActionIntentV2(value)
}
