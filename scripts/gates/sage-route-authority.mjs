/**
 * AUTH-01 truth checker for the main-owned `/.sage/*` route surface.
 *
 * A green result means the checked-in matrix still describes the current
 * source. It deliberately does not mean the registered authority violations
 * are safe, accepted, or exempted.
 */

const EXPECTED_ROUTES = 60
const CLASSIFICATION_COUNTS = Object.freeze({
  'read-only': 13,
  'local-preference': 5,
  'local-system': 2,
  'protected-effect': 38,
  unsupported: 2,
})

const READ_ONLY_PATHS = new Set([
  '/.sage/state',
  '/.sage/workspace/files/candidates',
  '/.sage/workspace/files/reference',
  '/.sage/workspace/files/use',
  '/.sage/session/history',
  '/.sage/session/anchors',
  '/.sage/session/terminal-read',
  '/.sage/search',
  '/.sage/artifacts/observe',
  '/.sage/artifacts/open',
  '/.sage/artifacts/retry',
  '/.sage/edit-drafts/diff',
  '/.sage/run-log',
])

const LOCAL_PREFERENCE_PATHS = new Set([
  '/.sage/session/selections',
  '/.sage/preferences',
  '/.sage/artifacts/close',
  '/.sage/artifacts/fullscreen',
  '/.sage/artifacts/window',
])

const UNSUPPORTED_PATHS = new Set([
  '/.sage/feedback',
  '/.sage/edit-drafts/writeback',
])

const LOCAL_SYSTEM_PATHS = new Set([
  '/.sage/bootstrap',
  '/.sage/device-preferences',
])

const LOCAL_SYSTEM_ROUTE_FACTS = new Map([
  ['/.sage/bootstrap', { method: 'GET', operations: ['read'], providers: ['bootstrapRead'] }],
  ['/.sage/device-preferences', { method: 'GET', operations: ['read'], providers: ['devicePreferencesRead'] }],
])

const RUN_COMMAND_PATHS = new Set([
  '/.sage/actions',
  '/.sage/draft/convert',
])

const PROTECTED_ADMISSION_PATHS = new Set([
  '/.sage/attachments/cancel',
  '/.sage/attachments/upload',
  '/.sage/session/send',
  '/.sage/session/stop',
  '/.sage/session/resume',
  '/.sage/session/pending',
  '/.sage/session/queue',
  '/.sage/session/clarification-answer',
  '/.sage/session/edits',
  '/.sage/session/plan-mode',
  '/.sage/session/approval-answer',
  '/.sage/session/approval-withdraw',
  '/.sage/corrections',
])

const EDIT_DRAFT_CREATE_PATH = '/.sage/edit-drafts/create'
const EDIT_DRAFT_CREATE_AUTHORITY = Object.freeze({
  status: 'violation',
  mode: 'protected-effect-source-read-admitted',
})

const CORRECTION_PATH = '/.sage/corrections'
const CORRECTION_ACTIVE_CONTEXT = 'request matterRef is a candidate only; renderer workspaceRoot is not authority'
const ATTACHMENT_UPLOAD_PATH = '/.sage/attachments/upload'
const ATTACHMENT_UPLOAD_ACTIVE_CONTEXT = 'request matterRef is a candidate only; itemId is an opaque clue and renderer workspaceRoot is not authority'
const ATTACHMENT_CANCEL_PATH = '/.sage/attachments/cancel'
const ATTACHMENT_CANCEL_ACTIVE_CONTEXT = 'active session is resolved server-side; itemId is an opaque clue and not authority'

const CONTEXT_SELECTION_PATHS = new Set([
  '/.sage/context/select',
])

const PREPARE_ONLY_PATHS = new Set([
  '/.sage/actions/prepare',
  '/.sage/draft/prepare-confirm',
  '/.sage/edit-drafts/prepare-writeback',
])

const AUTH_LIFECYCLE_PATHS = new Set([
  '/.sage/login',
  '/.sage/logout',
])

const MIXED_POLICY = new Map([
  ['/.sage/feedback', { policyProfile: 'mixed-read-unsupported', unsupportedOperations: ['submit'] }],
  ['/.sage/edit-drafts/writeback', { policyProfile: 'unsupported-operation', unsupportedOperations: ['writeback'] }],
  ['/.sage/matter-admin', { policyProfile: 'mixed-protected-unsupported', unsupportedOperations: ['rename'] }],
  ['/.sage/plans', { policyProfile: 'mixed-protected-prepare-unsupported', unsupportedOperations: ['execute-step'] }],
])

const CB1_CHECKS = Object.freeze([
  'exact-sage-app-url',
  'origin-if-present',
  'frame-not-contaminated',
])

const CB1_MISSING = Object.freeze([
  'origin-required',
  'frame-ready',
  'active-session',
  'read-policy',
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item !== '')
}

function sameStrings(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((item, index) => item === expected[index])
}

function unique(values) {
  return [...new Set(values)]
}

function classificationFor(path) {
  if (READ_ONLY_PATHS.has(path)) return 'read-only'
  if (LOCAL_PREFERENCE_PATHS.has(path)) return 'local-preference'
  if (LOCAL_SYSTEM_PATHS.has(path)) return 'local-system'
  if (UNSUPPORTED_PATHS.has(path)) return 'unsupported'
  return 'protected-effect'
}

function policyProfileFor(path, classification) {
  const mixed = MIXED_POLICY.get(path)
  if (mixed !== undefined) return mixed.policyProfile
  if (CONTEXT_SELECTION_PATHS.has(path)) return 'context-selection'
  if (PREPARE_ONLY_PATHS.has(path)) return 'prepare-only'
  if (AUTH_LIFECYCLE_PATHS.has(path)) return 'auth-lifecycle'
  if (classification === 'local-system') return 'local-system'
  if (classification === 'read-only') return 'projection-read'
  if (classification === 'local-preference') return 'local-preference'
  return 'business-command'
}

function authorityFor(path, classification) {
  if (classification === 'unsupported') return { status: 'unsupported', mode: 'named-unavailable' }
  if (classification === 'local-system') return { status: 'compliant', mode: 'local-system-admission-unavailable-first' }
  if (classification === 'read-only') return { status: 'compliant', mode: 'projection-read-admission-unavailable-first' }
  if (classification === 'local-preference') return { status: 'partial', mode: 'local-main-with-partial-caller-binding' }
  if (path === EDIT_DRAFT_CREATE_PATH) return EDIT_DRAFT_CREATE_AUTHORITY
  if (RUN_COMMAND_PATHS.has(path)) return { status: 'compliant', mode: 'runCommand' }
  if (PROTECTED_ADMISSION_PATHS.has(path)) return { status: 'compliant', mode: 'protected-effect-admission-unavailable-first' }
  if (CONTEXT_SELECTION_PATHS.has(path)) return { status: 'compliant', mode: 'active-context-selection-unavailable-first' }
  if (PREPARE_ONLY_PATHS.has(path)) return { status: 'violation', mode: 'prepare-only-bypass' }
  if (AUTH_LIFECYCLE_PATHS.has(path)) return { status: 'violation', mode: 'auth-special-bypass' }
  return { status: 'violation', mode: 'direct-provider-bypass' }
}

function discoverRouteConstants(text) {
  if (typeof text !== 'string') return []
  return [...text.matchAll(/^const (SAGE_[A-Z0-9_]+_PATH) = '([^']+)'\s*$/gmu)].map((match) => ({
    sourceConstant: match[1],
    path: match[2],
  }))
}

function discoverRouteBranches(text) {
  if (typeof text !== 'string') return []
  const handlerIndex = text.indexOf('export async function handleSageServiceRequest')
  if (handlerIndex < 0) return []
  const handlerText = text.slice(handlerIndex)
  const starts = [...handlerText.matchAll(/^  if \(url\.pathname === /gmu)].map((match) => match.index)
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? handlerText.length
    const source = handlerText.slice(start, end)
    const constants = unique([...source.matchAll(/url\.pathname === (SAGE_[A-Z0-9_]+_PATH)/gu)].map((match) => match[1]))
    const method = source.match(/request\.method !== '(GET|POST)'/u)?.[1] ?? null
    const providers = unique([...source.matchAll(/deps\.providers\.([A-Za-z0-9_]+)/gu)].map((match) => match[1]))
    return { constants, method, providers, projectionRead: source.includes('runProjectionRead(') }
  }).filter((branch) => branch.constants.length > 0)
}

function extractMethodBlock(text, methodName) {
  if (typeof text !== 'string') return null
  const marker = `async ${methodName}(`
  const start = text.indexOf(marker)
  if (start < 0) return null
  const nextMethod = text.indexOf('\n    async ', start + marker.length)
  const end = nextMethod < 0 ? text.length : nextMethod
  return text.slice(start, end)
}

function providerUsesRunCommand(compositionText, providers) {
  return providers.some((provider) => extractMethodBlock(compositionText, provider)?.includes('runCommand(') === true)
}

function providerUsesProtectedAdmission(compositionText, providers) {
  const helperIsBound = compositionText.includes('function admitSessionCoreProtectedEffect(')
    && compositionText.includes('return admitProtectedEffect({')
  return helperIsBound && providers.some((provider) =>
    extractMethodBlock(compositionText, provider)?.includes('admitSessionCoreProtectedEffect(') === true)
}

function correctionProtectedAdmissionViolations(compositionText) {
  const block = extractMethodBlock(compositionText, 'submitCorrection')
  if (block === null) return ['submitCorrection method is missing']

  const violations = []
  const callMarker = 'const admission = await admitSessionCoreProtectedEffect('
  const callStart = block.indexOf(callMarker)
  if (callStart < 0) {
    violations.push('submitCorrection must call admitSessionCoreProtectedEffect')
  } else {
    const callEnd = block.indexOf('\n      )', callStart)
    if (callEnd < 0) {
      violations.push('submitCorrection admission call boundary cannot be verified')
    } else {
      const call = block.slice(callStart, callEnd)
      if (!call.includes("'session.correction.submit'")) {
        violations.push('submitCorrection admission operation must be session.correction.submit')
      }
      if (!call.includes("{ kind: 'matter', matterRef: request.matterRef }")) {
        violations.push('submitCorrection admission candidate must be request matterRef')
      }
      const exactBinding = /const admission = await admitSessionCoreProtectedEffect\(\s*options,\s*'session\.correction\.submit',\s*\{ kind: 'matter', matterRef: request\.matterRef \},\s*\{/u
      if (!exactBinding.test(call)) {
        violations.push('submitCorrection admission helper, operation, and matter candidate must be one exact call')
      }
      if (/\bworkspaceRoot\b/u.test(call)) {
        violations.push('submitCorrection must not place renderer workspaceRoot in the protected intent')
      }
    }
  }
  if (block.includes('options.correctionCreate')) {
    violations.push('submitCorrection must not retain an options.correctionCreate raw-provider fallback')
  }
  if (!block.includes('protectedEffectFailureCode(admission)')) {
    violations.push('submitCorrection must derive its unavailable-first outcome from admission')
  }
  return violations
}

function attachmentUploadProtectedAdmissionViolations(compositionText) {
  const block = extractMethodBlock(compositionText, 'uploadAttachment')
  if (block === null) return ['uploadAttachment method is missing']

  const violations = []
  const callMarker = 'const admission = await admitSessionCoreProtectedEffect('
  const callStart = block.indexOf(callMarker)
  if (callStart < 0) {
    violations.push('uploadAttachment must call admitSessionCoreProtectedEffect')
  } else {
    const callEnd = block.indexOf('\n      )', callStart)
    if (callEnd < 0) {
      violations.push('uploadAttachment admission call boundary cannot be verified')
    } else {
      const call = block.slice(callStart, callEnd + '\n      )'.length)
      if (!call.includes("'session.attachment.upload'")) {
        violations.push('uploadAttachment admission operation must be session.attachment.upload')
      }
      if (!call.includes("{ kind: 'matter', matterRef: request.matterRef }")) {
        violations.push('uploadAttachment admission candidate must be request matterRef')
      }
      if (!call.includes('{ itemId: request.itemId }')) {
        violations.push('uploadAttachment admission payload must contain only request itemId')
      }
      const exactBinding = /const admission = await admitSessionCoreProtectedEffect\(\s*options,\s*'session\.attachment\.upload',\s*\{ kind: 'matter', matterRef: request\.matterRef \},\s*\{ itemId: request\.itemId \},\s*\)/u
      if (!exactBinding.test(call)) {
        violations.push('uploadAttachment admission helper, operation, matter candidate, and itemId payload must be one exact call')
      }
      if (/\bworkspaceRoot\b/u.test(call)) {
        violations.push('uploadAttachment must not place renderer workspaceRoot in the protected intent')
      }
    }
  }
  if (block.includes('options.attachmentsUpload')) {
    violations.push('uploadAttachment must not retain an options.attachmentsUpload raw-provider fallback')
  }
  if (!block.includes('protectedEffectFailureCode(admission)')) {
    violations.push('uploadAttachment must derive its unavailable-first outcome from admission')
  }
  return violations
}

function attachmentCancelProtectedAdmissionViolations(compositionText) {
  const block = extractMethodBlock(compositionText, 'cancelAttachment')
  if (block === null) return ['cancelAttachment method is missing']

  const violations = []
  const callMarker = 'const admission = await admitSessionCoreProtectedEffect('
  const callStart = block.indexOf(callMarker)
  if (callStart < 0) {
    violations.push('cancelAttachment must call admitSessionCoreProtectedEffect')
  } else {
    const callEnd = block.indexOf('\n      )', callStart)
    if (callEnd < 0) {
      violations.push('cancelAttachment admission call boundary cannot be verified')
    } else {
      const call = block.slice(callStart, callEnd + '\n      )'.length)
      if (!call.includes("'session.attachment.cancel'")) {
        violations.push('cancelAttachment admission operation must be session.attachment.cancel')
      }
      if (!call.includes("{ kind: 'active-session' }")) {
        violations.push('cancelAttachment admission candidate must be active-session')
      }
      if (!/\{\s*itemId:\s*request\.itemId\s*\}/u.test(call)) {
        violations.push('cancelAttachment admission payload must contain only request itemId')
      }
      const exactBinding = /const admission = await admitSessionCoreProtectedEffect\(\s*options,\s*'session\.attachment\.cancel',\s*\{ kind: 'active-session' \},\s*\{ itemId: request\.itemId \},\s*\)/u
      if (!exactBinding.test(call)) {
        violations.push('cancelAttachment admission helper, operation, active-session candidate, and itemId payload must be one exact call')
      }
    }
  }
  if (block.includes('options.attachmentsCancel')) {
    violations.push('cancelAttachment must not retain an options.attachmentsCancel raw-provider fallback')
  }
  if (!block.includes('protectedEffectFailureCode(admission)')) {
    violations.push('cancelAttachment must derive its unavailable-first outcome from admission')
  }
  return violations
}

function providerUsesContextSelection(compositionText, providers) {
  return providers.some((provider) =>
    provider === 'selectActiveMatter'
    && extractMethodBlock(compositionText, provider)?.includes('options.selectActiveMatter') === true)
}

function editDraftCreateSourceViolations(routeSkeletonText, mainAppServiceText) {
  const violations = []
  const routeStart = typeof routeSkeletonText === 'string'
    ? routeSkeletonText.indexOf("if (url.pathname === SAGE_EDIT_DRAFTS_CREATE_PATH)")
    : -1
  const routeEnd = routeStart < 0 ? -1 : routeSkeletonText.indexOf("if (url.pathname === SAGE_EDIT_DRAFTS_UPDATE_PATH)", routeStart)
  const routeBlock = routeStart < 0 || routeEnd < 0 ? null : routeSkeletonText.slice(routeStart, routeEnd)
  if (routeBlock === null) {
    violations.push('edit-drafts/create source-read route block is missing')
  } else {
    if (!routeBlock.includes("'edit-drafts.create'")) violations.push('edit-drafts/create must use operation edit-drafts.create')
    if (!routeBlock.includes("{ kind: 'opaque', resource: 'file-reference', id: create.referenceId }")) {
      violations.push('edit-drafts/create candidate must be the opaque file-reference id')
    }
    if (!routeBlock.includes('matterRef: scope.matterRef')) {
      violations.push('edit-drafts/create provider matterRef must come from the admitted scope')
    }
    if (!routeBlock.includes('runProjectionRead(')) violations.push('edit-drafts/create must enter projection-read admission')
    if (routeBlock.includes('parsed as { referenceId: string, matterRef: string }')) {
      violations.push('edit-drafts/create must not accept renderer matterRef')
    }
  }

  const parserStart = typeof routeSkeletonText === 'string'
    ? routeSkeletonText.indexOf('function parseEditDraftRequest(')
    : -1
  const parserEnd = parserStart < 0 ? -1 : routeSkeletonText.indexOf('\n/** Ticket 028:', parserStart)
  const parserBlock = parserStart < 0 || parserEnd < 0 ? null : routeSkeletonText.slice(parserStart, parserEnd)
  if (parserBlock === null) {
    violations.push('edit-drafts/create parser source block is missing')
  } else {
    const createStart = parserBlock.indexOf("if (pathname.endsWith('/create'))")
    const createEnd = createStart < 0 ? -1 : parserBlock.indexOf("if (pathname.endsWith('/update'))", createStart)
    const createParser = createStart < 0 || createEnd < 0 ? '' : parserBlock.slice(createStart, createEnd)
    if (!createParser.includes('keys.length !== 1')) violations.push('edit-drafts/create parser must accept exactly one key')
    if (!createParser.includes('boundedRef(record.referenceId)')) violations.push('edit-drafts/create parser must validate referenceId')
    if (createParser.includes('record.matterRef')) violations.push('edit-drafts/create parser must not read renderer matterRef')
  }

  const runnerStart = typeof mainAppServiceText === 'string'
    ? mainAppServiceText.indexOf('function createProjectionReadRunner(')
    : -1
  const runnerEnd = runnerStart < 0 ? -1 : mainAppServiceText.indexOf('\n/** T02:', runnerStart)
  const runnerBlock = runnerStart < 0 || runnerEnd < 0 ? null : mainAppServiceText.slice(runnerStart, runnerEnd)
  if (runnerBlock === null) {
    violations.push('projection-read runner source block is missing')
  } else {
    if (!runnerBlock.includes("candidate.resource === 'file-reference'")) violations.push('file-reference resolver is missing')
    if (!runnerBlock.includes('reference.matterRef === scope.matterRef')) violations.push('file-reference resolver must bind matterRef to scope')
    if (!runnerBlock.includes('reference.workspaceRoot === scope.trustedWorkspaceRoot')) {
      violations.push('file-reference resolver must bind workspaceRoot to trusted scope')
    }
    if (!runnerBlock.includes('// Artifact, current-artifact and edit-draft ids still need their own main-owned resolver.')) {
      violations.push('artifact/current-artifact/edit-draft opaque resources must remain explicitly blocked')
    }
    if (!runnerBlock.includes("candidate.collection === 'state'")) violations.push('state collection source fact is missing')
    if (!runnerBlock.includes(": { state: 'unavailable' as const }")) violations.push('unresolved collections and opaque resources must remain unavailable')
  }
  return violations
}

function matterCustodyViolations(input) {
  const violations = []
  const indexText = typeof input?.mainIndexText === 'string' ? input.mainIndexText : ''
  const appServiceText = typeof input?.mainAppServiceText === 'string' ? input.mainAppServiceText : ''
  const custodyText = typeof input?.matterCustodyText === 'string' ? input.matterCustodyText : ''
  if (indexText === '' || appServiceText === '' || custodyText === '') {
    violations.push('custody wiring source facts are unavailable')
    return violations
  }
  // The home-page creation branch gains its real custodian (T04); the honest placeholder query
  // must not come back into the composition root.
  if (!indexText.includes('const matterCustody = createMatterCustody({ sagePaths: paths })')) {
    violations.push('index must construct the custody provider from the Sage paths')
  }
  if (!indexText.includes('createMatter: (request) => matterCustody.createMatter(request)')) {
    violations.push('index must wire createMatter to the custody provider')
  }
  if (!indexText.includes('reconcileDraftCreation: (request: { readonly draftId: string, readonly correlation: string }) => matterCustody.reconcileCreation(request)')) {
    violations.push('index must wire reconcileDraftCreation to the custody query')
  }
  if (indexText.includes('custodian-query-unavailable')) {
    violations.push('the placeholder custodian query must not return to index')
  }
  if (!appServiceText.includes('...(options.createMatter === undefined ? {} : { createMatter: options.createMatter }),')) {
    violations.push('app-service must merge createMatter only when explicitly provided')
  }
  // The custodian appends the first stream only, idempotent per attempt, and a receipt exists
  // only when the store proved the commit.
  if (!custodyText.includes("expectedVersion: { kind: 'not-exists' }")) {
    violations.push('custody must create only non-existent streams')
  }
  if (!custodyText.includes('appendId: `draft-conversion:${request.correlation}`')) {
    violations.push('custody must key its append idempotency on the attempt correlation')
  }
  if (!custodyText.includes('const matterId = `matter:${request.correlation}`')) {
    violations.push('custody must derive the formal identity from the service-issued correlation')
  }
  if (!custodyText.includes("case 'commit-unknown':") || !custodyText.includes('return { unknown: true }')) {
    violations.push('commit-unknown must answer outcome-unknown, never a receipt')
  }
  if (!custodyText.includes("state: 'unknown', code: 'custodian-query-unavailable'")) {
    violations.push('an unobservable custodian query must stay unknown')
  }
  return violations
}

function sessionCoreIdentityViolations(input) {
  const violations = []
  const appServiceText = typeof input?.mainAppServiceText === 'string' ? input.mainAppServiceText : ''
  const tableText = typeof input?.actionAuthorityTableText === 'string' ? input.actionAuthorityTableText : ''
  const identityText = typeof input?.sessionCoreIdentityText === 'string' ? input.sessionCoreIdentityText : ''
  if (appServiceText === '' || tableText === '' || identityText === '') {
    violations.push('session-core identity source facts are unavailable')
    return violations
  }
  // The step is wired only behind the instance-authority option: ungating it would evaluate
  // policy for instances that never provisioned one.
  const gatedMerge = [
    'const identityPolicyPort = options.authority === undefined',
    '    ? undefined',
    '    : createSessionCoreIdentityPort({ vault: options.vault, authority: options.authority })',
  ].join('\n')
  if (!appServiceText.includes(gatedMerge)) {
    violations.push('session-core identity step must be wired only behind the instance authority option')
  }
  if (!tableText.includes("'session.send': Object.freeze({")) {
    violations.push('session.send must be registered in the action authority table')
  }
  if (!tableText.includes("actionScope: 'session.prompt'")) {
    violations.push('session.send action scope must stay session.prompt')
  }
  if (!identityText.includes('if (ACTION_AUTHORITY_TABLE[intent.operation] === undefined) return { state: \'unavailable\' }')) {
    violations.push('an unregistered session-family operation must answer not-ready before any policy read')
  }
  if (!identityText.includes("if (resolution.kind !== 'authorized') return { state: 'denied' }")) {
    violations.push('a non-authorized resolution must map to a denial')
  }
  if (!identityText.includes('const assembled = assembleSessionCoreAuthorizationRequest({')
    || !identityText.includes('const resolution = runtime.resolve(assembled.request)')) {
    violations.push('the session-core assembly and kernel resolve must stay wired')
  }
  return violations
}

function runtimeInventoryRegistryViolations(input) {
  const violations = []
  const indexText = typeof input?.mainIndexText === 'string' ? input.mainIndexText : ''
  const providerText = typeof input?.capabilityRegistryProviderText === 'string' ? input.capabilityRegistryProviderText : ''
  const bundleText = typeof input?.publicationBundleText === 'string' ? input.publicationBundleText : ''
  if (indexText === '' || providerText === '' || bundleText === '') {
    violations.push('runtime inventory registry sources are unavailable')
    return violations
  }
  // C2D.2A + ADR-0285: the bundled provider must stay wired into the inventory composition, the
  // default body stays the empty internal set, and a non-empty published snapshot only ever
  // arrives through the loader with the seal round trip proven — never as an edited constant.
  if (!indexText.includes('const capabilityRegistryPublication = loadSessionPromptCapabilityRegistry()')
    || !indexText.includes('capabilityRegistryPublication.ok ? capabilityRegistryPublication.snapshotBody : undefined')) {
    violations.push('index must load the published registry snapshot and pass its body to the bundled factory')
  }
  if (!bundleText.includes('loadSessionPromptCapabilityRegistry')
    || !bundleText.includes('parseCapabilityRegistrySnapshot(file.value)')
    || !bundleText.includes('resealed.value.snapshotId !== snapshot.snapshotId')) {
    violations.push('the registry publication loader must kernel-parse and prove the seal round trip')
  }
  if (!indexText.includes('registry: { read: () => bundledRegistry.read() },')) {
    violations.push('index must wire the bundled registry into the runtime inventory provider')
  }
  // The provider seals through the kernel and fails closed; the bundled default body stays the
  // empty internal set (non-empty entries arrive only as new published snapshots).
  if (!providerText.includes('sealCapabilityRegistrySnapshot(snapshotBody)')) {
    violations.push('the bundled registry provider must seal through the kernel')
  }
  if (!providerText.includes('if (!sealed.ok) throw new Error')) {
    violations.push('an unsealable bundled registry must fail closed on read')
  }
  if (!providerText.includes('entries: Object.freeze([] as CapabilityRegistryEntryBodyV1[])')) {
    violations.push('the bundled first snapshot must stay the empty internal set')
  }
  return violations
}

function sessionPromptPublicationViolations(input) {
  const violations = []
  const text = typeof input?.sessionPromptPublicationText === 'string' ? input.sessionPromptPublicationText : ''
  if (text === '') {
    violations.push('session-prompt publication source is unavailable')
    return violations
  }
  // The owner rulings (2026-10-10) ship verbatim; drift here changes what was approved.
  if (!text.includes("statement: '实例操作员（role:owner）可发起 session.prompt。',")) {
    violations.push('the permission policy statement must stay the owner-approved text')
  }
  if (!text.includes("statement: '消息文本可发送至用户配置的模型提供方；产物与记录留存本机 Sage 数据根。',")) {
    violations.push('the data-boundary policy statement must stay the owner-approved text')
  }
  if (!text.includes("requirementId: 'requirement:sage-session-prompt',")
    || !text.includes("requirementVersion: '1.0.0',")) {
    violations.push('the first requirement identity and version must stay the approved plan')
  }
  if (!text.includes("Object.freeze({ actionScope: 'session.prompt', effectClass: 'external-write' as const, requiresDecision: false }),")) {
    violations.push('the first action requirement must stay the approved session.prompt tuple')
  }
  if (!text.includes("decisionId: 'decision:sage-t05-first-session-prompt',")
    || !text.includes("ownerId: 'owner:sage-product',")) {
    violations.push('the first publication decision must stay the owner decision')
  }
  if (!text.includes('sealCandidateTargetRequirement(candidate, SESSION_PROMPT_PUBLICATION_DECISION)')) {
    violations.push('the publication must seal through the candidate line and the kernel')
  }
  return violations
}

function sessionPromptTargetViolations(input) {
  const violations = []
  const appServiceText = typeof input?.mainAppServiceText === 'string' ? input.mainAppServiceText : ''
  const indexText = typeof input?.mainIndexText === 'string' ? input.mainIndexText : ''
  const targetText = typeof input?.sessionPromptTargetText === 'string' ? input.sessionPromptTargetText : ''
  const bundleText = typeof input?.publicationBundleText === 'string' ? input.publicationBundleText : ''
  if (appServiceText === '' || indexText === '' || targetText === '' || bundleText === '') {
    violations.push('session-prompt target sources are unavailable')
    return violations
  }
  // T05-mid (ADR-0282): the real target step is wired only when BOTH the instance authority and
  // the startup-loaded requirement bundle exist; every provider failure collapses to unavailable.
  if (!appServiceText.includes('options.authority === undefined || options.requirementBundle === undefined')
    || !appServiceText.includes('createSessionPromptTargetPort({')
    || !appServiceText.includes('{ resolveTarget: targetPort }')) {
    violations.push('the real target step must be wired only behind the requirement-bundle option')
  }
  if (!indexText.includes('const requirementBundle = loadSessionPromptRequirementBundle()')) {
    violations.push('index must load the requirement bundle once at startup')
  }
  if (!targetText.includes('ACTION_AUTHORITY_TABLE[intent.operation]')
    || !targetText.includes('createBundledCompatibilityTargetProvider')) {
    violations.push('the target port must resolve the registered action scope through the bundled C2.2T provider')
  }
  if (!targetText.includes('declaring.length === 1')) {
    violations.push('an ambiguous published requirement must answer unavailable, never a guess')
  }
  if (!targetText.includes('target:${resolved.snapshotId}:${resolved.requirement.requirementDigest}')) {
    violations.push('the target ref must bind the snapshot id and requirement digest')
  }
  if (targetText.includes("'denied'")) {
    violations.push('a missing or failing target must map to unavailable, never a policy denial')
  }
  if (!bundleText.includes('parseCompatibilityTargetRequirementSnapshot(')) {
    violations.push('the bundle loader must validate through the C2.2T kernel parse')
  }
  return violations
}

function sessionCoreCompatibilityViolations(input) {
  const violations = []
  const appServiceText = typeof input?.mainAppServiceText === 'string' ? input.mainAppServiceText : ''
  const indexText = typeof input?.mainIndexText === 'string' ? input.mainIndexText : ''
  const compatibilityText = typeof input?.sessionPromptCompatibilityText === 'string' ? input.sessionPromptCompatibilityText : ''
  const bundleText = typeof input?.publicationBundleText === 'string' ? input.publicationBundleText : ''
  if (appServiceText === '' || indexText === '' || compatibilityText === '' || bundleText === '') {
    violations.push('session-prompt compatibility sources are unavailable')
    return violations
  }
  // T05-mid step 6 (ADR-0284): the real compatibility step is wired only when every main-owned
  // input exists (matrix publication + observation + revision digest + requirement + authority).
  if (!appServiceText.includes('resolveCompatibility: createSessionPromptCompatibilityPort({')
    || !appServiceText.includes('options.revisionDigest === undefined')
    || !appServiceText.includes('options.compatibilityPublication === undefined')
    || !appServiceText.includes('options.runtimeInventoryObservation === undefined')
    || !appServiceText.includes('options.revisionDigest === undefined')) {
    violations.push('the compatibility step must be wired only behind all main-owned inputs')
  }
  if (!indexText.includes('const compatibilityPublication = loadSessionPromptCompatibilityPublication()')
    || !indexText.includes('runtimeInventoryObservation:')
    || !indexText.includes('createRevisionDigestReader(')) {
    violations.push('index must load the matrix publication and expose the observation and revision-digest surfaces')
  }
  if (!compatibilityText.includes('resolveCompatibilityV2(')
    || !compatibilityText.includes('toCompatibilityMatrixV2ProviderResult(')
    || !compatibilityText.includes('computeTargetEvidenceDigestV2(')) {
    violations.push('the compatibility port must compose the exact V2 resolve input through the kernel adapters')
  }
  if (!compatibilityText.includes('const evaluatedAt = observation.evidence.observedAt')) {
    violations.push('compatibility must evaluate at the last trusted observation instant (ADR-0284)')
  }
  if ((compatibilityText.match(/state: 'denied'/gu) ?? []).length !== 1
    || !compatibilityText.includes("resolved.outcome === 'requires-new-revision') return { state: 'denied' }")) {
    violations.push('only a published requires-new-revision rule may deny; everything else answers unavailable')
  }
  if (!bundleText.includes('loadSessionPromptCompatibilityPublication')
    || !bundleText.includes('createBundledCompatibilityMatrixProviderV2(')) {
    violations.push('the publication loader must kernel-parse and assemble the bundled matrix provider')
  }
  return violations
}

function sessionPromptDispatchViolations(input) {
  const violations = []
  const appServiceText = typeof input?.mainAppServiceText === 'string' ? input.mainAppServiceText : ''
  const admissionText = typeof input?.protectedEffectAdmissionText === 'string' ? input.protectedEffectAdmissionText : ''
  const compositionText = typeof input?.compositionText === 'string' ? input.compositionText : ''
  const dispatchText = typeof input?.sessionPromptDispatchText === 'string' ? input.sessionPromptDispatchText : ''
  if (appServiceText === '' || admissionText === '' || compositionText === '' || dispatchText === '') {
    violations.push('session-prompt dispatch sources are unavailable')
    return violations
  }
  // T05-mid step 10 (ADR-0289): dispatch is wired only when the channel port and every
  // re-verification input exist.
  if (!appServiceText.includes('dispatch: createSessionPromptDispatchPort({')
    || !appServiceText.includes('|| options.matterLinks === undefined')) {
    violations.push('the dispatch step must be wired only behind the channel and every re-verification input')
  }
  // The admitted evidence must survive the admission seam; dropping it fails every real send
  // closed at persistence (the ADR-0288 defect the step-10 end-to-end spec caught).
  if (!admissionText.includes('...(compatibilityStep.value.evidence === undefined ? {} : { evidence: compatibilityStep.value.evidence }),')) {
    violations.push('the admitted evidence must survive the admission seam')
  }
  // The kernel keeps receipt detail, determinate refusal, pre-call refusal and the unknown apart.
  if (!admissionText.includes('|| (dispatchResult.detail !== undefined && !isSessionCoreDispatchDetail(dispatchResult.detail))')) {
    violations.push('a malformed receipt detail must be the conservative unknown')
  }
  if (!admissionText.includes("dispatchResult.state === 'refused' && isRef(dispatchResult.code)")) {
    violations.push('a determinate channel refusal must surface with its own code')
  }
  if (!admissionText.includes("if (isRecord(dispatchResult) && dispatchResult.state === 'not-dispatched') {")) {
    violations.push('a pre-call refusal must stay retryable, never outcome-unknown')
  }
  // The route maps the receipt detail to the caller-facing outcome.
  if (!compositionText.includes("admission.detail?.kind === 'session-send-accepted'")
    || !compositionText.includes("admission.detail?.kind === 'session-send-deferred'")
    || !compositionText.includes(": { state: 'refused', code: 'protected-effect-outcome-unknown' }")) {
    violations.push('the route must map the receipt detail to the channel outcome')
  }
  // The dispatch port: verify first, re-run the cheap real ports, compare refs, call last.
  if (!dispatchText.includes('verifyAdmittedFactsStillHold(options,')) {
    violations.push('the dispatch step must re-verify through the shared step-9/10 helper')
  }
  if (!dispatchText.includes('reTarget.value.targetRef !== target.targetRef')
    || !dispatchText.includes('reRegistry.value.mappingRef !== registry.mappingRef')
    || !dispatchText.includes('rePreflight.value.preflightRef !== admittedPreflight.preflightRef')) {
    violations.push('the dispatch step must re-run the cheap real ports and require ref equality')
  }
  const verifyIndex = dispatchText.indexOf('verifyAdmittedFactsStillHold')
  const callIndex = dispatchText.indexOf('options.sessionSend({')
  if (verifyIndex < 0 || callIndex < 0 || verifyIndex > callIndex) {
    violations.push('the channel call must happen only after the re-verification')
  }
  if (!dispatchText.includes('receipt:session-send:${outcome.requestId}')
    || !dispatchText.includes("return { state: 'refused', code: outcome.code }")) {
    violations.push('the channel outcomes must normalize to receipt detail or a determinate refusal')
  }
  if (dispatchText.includes('startAttempt(') || dispatchText.includes('failAttempt(') || dispatchText.includes('recordReceipt(')) {
    violations.push('dispatch v1 writes no domain closure events (turn-close is the registered ticket)')
  }
  return violations
}

function sessionPromptPrepareViolations(input) {
  const violations = []
  const appServiceText = typeof input?.mainAppServiceText === 'string' ? input.mainAppServiceText : ''
  const tableText = typeof input?.actionAuthorityTableText === 'string' ? input.actionAuthorityTableText : ''
  const storeText = typeof input?.sessionPromptAttemptStoreText === 'string' ? input.sessionPromptAttemptStoreText : ''
  const prepareText = typeof input?.sessionPromptPrepareText === 'string' ? input.sessionPromptPrepareText : ''
  const compositionText = typeof input?.compositionText === 'string' ? input.compositionText : ''
  if (appServiceText === '' || tableText === '' || storeText === '' || prepareText === '' || compositionText === '') {
    violations.push('session-prompt prepare sources are unavailable')
    return violations
  }
  // T05 prepare (ADR-0290): a registered local-write operation, over the SAME front ports.
  if (!tableText.includes("'session.prepare': Object.freeze({")
    || !tableText.includes("effectClass: 'local-write',")) {
    violations.push('session.prepare must be registered in the action authority table as a local write')
  }
  if (!appServiceText.includes('createSessionPromptPrepareRunner({')
    || !appServiceText.includes('identityPolicyPort === undefined')) {
    violations.push('the prepare runner must ride the same front ports and stay gated on them')
  }
  if (!storeText.includes('readMatter: (matterId) => {')
    || !storeText.includes('appendRevision: (request) => {')
    || !storeText.includes('return database.append({')) {
    violations.push('the prepare write must use the matter read and the plain idempotent append')
  }
  // Order and geometry of the runner: the four ports in chain order, then the write.
  const order = [
    'options.ports.verifyCaller!(',
    'options.ports.resolveActiveContext!(',
    'options.ports.matchCandidate!(',
    'options.ports.resolveIdentityPolicy!(',
  ].map((marker) => prepareText.indexOf(marker))
  if (order.some((index) => index < 0) || order.some((index, i) => i > 0 && index < order[i - 1])) {
    violations.push('the prepare runner must run the front ports in their chain order')
  }
  if (!prepareText.includes("source: 'user-input',")) {
    violations.push('the user explicit input is the prepare witness')
  }
  if (!prepareText.includes('actionPolicies: requirement.actionRequirements.map((action) => ({')) {
    violations.push("the revision's run policies must project the requirement declaration")
  }
  if (!prepareText.includes('code: FAILURE_CODES[step.state]')) {
    violations.push('port failures must keep their per-state protected-effect refusal family')
  }
  if (!prepareText.includes("'session-prepare-declined'")) {
    violations.push('a domain decline must answer honestly, never as prepared')
  }
  if (!prepareText.includes('session-prepare:${intent.requestId}')) {
    violations.push('the prepare append must be idempotent per service-issued request identity')
  }
  for (const forbidden of ['options.sessionSend', 'resolveCompatibility', 'appendWithCompatibilityEvidence', 'startAttempt(']) {
    if (prepareText.includes(forbidden)) {
      violations.push('a local preparation write must not reach the external-effect surfaces')
      break
    }
  }
  // The route orchestrates the first send through the prepare runner and honours its refusal.
  if (!compositionText.includes('options.prepareSessionPrompt !== undefined')
    || !compositionText.includes("prepared.state === 'refused'")) {
    violations.push('the send route must run the prepare runner first and stop on its refusal')
  }
  return violations
}

function sessionPromptPersistenceViolations(input) {
  const violations = []
  const appServiceText = typeof input?.mainAppServiceText === 'string' ? input.mainAppServiceText : ''
  const indexText = typeof input?.mainIndexText === 'string' ? input.mainIndexText : ''
  const compositionText = typeof input?.compositionText === 'string' ? input.compositionText : ''
  const persistText = typeof input?.sessionPromptPersistenceText === 'string' ? input.sessionPromptPersistenceText : ''
  const attemptStoreText = typeof input?.sessionPromptAttemptStoreText === 'string' ? input.sessionPromptAttemptStoreText : ''
  const evidenceBuilderText = typeof input?.sessionPromptEvaluationEvidenceText === 'string' ? input.sessionPromptEvaluationEvidenceText : ''
  const compatibilityText = typeof input?.sessionPromptCompatibilityText === 'string' ? input.sessionPromptCompatibilityText : ''
  if (appServiceText === '' || indexText === '' || compositionText === '' || persistText === ''
    || attemptStoreText === '' || evidenceBuilderText === '' || compatibilityText === '') {
    violations.push('session-prompt persistence sources are unavailable')
    return violations
  }
  // T05-mid step 9 (ADR-0288): the persistence step is wired only when every main-owned input
  // exists, over the store handle index opened under the Sage-owned paths.
  if (!appServiceText.includes('persist: createSessionPromptPersistencePort({')
    || !appServiceText.includes('|| options.sessionPromptAttempts === undefined\n      || reverifyReads === undefined')) {
    violations.push('the persistence step must be wired only behind the store handle and every main-owned input')
  }
  if (!indexText.includes('const sessionPromptAttempts = createSessionPromptAttemptStore({ sagePaths: paths })')
    || !indexText.includes('sessionPromptAttempts,')
    || !indexText.includes('sessionPromptAttempts.close()')) {
    violations.push('index must open the attempt store on the Sage-owned paths, hand it over, and close it on quit')
  }
  // The operation identity is service-issued and per-request unique; reusing the caller
  // correlation (possibly a constant binding ref) would mint one attempt identity for every
  // request of a caller — the pre-ADR-0288 defect.
  if (!compositionText.includes('requestId: randomUUID(),')
    || compositionText.includes('requestId: correlation,')) {
    violations.push('the operation identity must be service-issued per request, never the caller correlation')
  }
  // What is written is exactly the evidence the compatibility step admitted; without it nothing
  // is written. The event payload is authored by the domain kernel, and the append is atomic.
  if (!compatibilityText.includes('buildSessionPromptEvaluationEvidence({')
    || !compatibilityText.includes('evidence: built.evidence,')) {
    violations.push('the compatibility step must seal and carry the evaluation evidence it admitted')
  }
  if (!evidenceBuilderText.includes('sealCompatibilityEvaluationEvidence(body)')
    || !evidenceBuilderText.includes('matrixBytesReference(input.matrixResult.canonicalMatrix)')) {
    violations.push('the evidence builder must seal through the codec and share the canonical-matrix forma')
  }
  if (!persistText.includes('if (evidence === undefined || typeof evidence.evidenceDigest !== \'string\') return { state: \'unavailable\' }')) {
    violations.push('the persistence step must refuse without the admitted evidence')
  }
  const reverifyText = typeof input?.sessionPromptReverifyText === 'string' ? input.sessionPromptReverifyText : ''
  if (!persistText.includes('verifyAdmittedFactsStillHold(options, {')) {
    violations.push('the persistence step must re-verify through the shared step-9/10 helper')
  }
  if (!reverifyText.includes("if (!rehydrated.current) return { ok: false, state: 'stale' }")
    || !reverifyText.includes('storeRevisionDigest !== admitted.revisionDigest')
    || !reverifyText.includes('if (frame.generation !== liveContext.frameGeneration) return { ok: false, state: \'stale\' }')) {
    violations.push('the shared re-verification must check current revision, frame agreement and the store-validated revision digest')
  }
  if (!persistText.includes('startAttempt(reverified.matter, {')) {
    violations.push('the attempt event payload must be authored by the domain kernel')
  }
  if (!persistText.includes('options.attempts.appendAttempt(')
    || persistText.includes('.appendWithCompatibilityEvidence(')) {
    violations.push('the persistence step must append through the store handle, never a second write path')
  }
  if (!persistText.includes('session-prompt-attempt:${evidence.attemptId}')) {
    violations.push('the attempt append must be idempotent per service-issued attempt identity')
  }
  if (!attemptStoreText.includes('return database.appendWithCompatibilityEvidence({')) {
    violations.push('the attempt store must append event and evidence in one transaction')
  }
  if (persistText.includes("case 'commit-unknown'")) {
    violations.push('commit-unknown must fail closed, never proceed to dispatch')
  }
  return violations
}

function sessionPromptPreflightViolations(input) {
  const violations = []
  const appServiceText = typeof input?.mainAppServiceText === 'string' ? input.mainAppServiceText : ''
  const indexText = typeof input?.mainIndexText === 'string' ? input.mainIndexText : ''
  const preflightText = typeof input?.sessionPromptPreflightText === 'string' ? input.sessionPromptPreflightText : ''
  if (appServiceText === '' || indexText === '' || preflightText === '') {
    violations.push('session-prompt preflight sources are unavailable')
    return violations
  }
  // T05-mid step 8 (ADR-0287): the real preflight step is wired only when the requirement bundle
  // and the live runtime-effective read exist; the chain reads the Host only per request.
  if (!appServiceText.includes('createSessionPromptPreflightPort({')
    || !appServiceText.includes('{ preflight: preflightPort }')
    || !appServiceText.includes('options.requirementBundle === undefined || options.runtimeEffective === undefined')) {
    violations.push('the preflight step must be wired only behind the bundle and the live runtime read')
  }
  if (!indexText.includes('runtimeEffective: () => {')
    || !indexText.includes('isRuntimeEffectiveObservation(observation)')) {
    violations.push('index must expose the live runtime-effective read as a validated main-owned closure')
  }
  if (!preflightText.includes('isRuntimeEffectiveObservation(live)')) {
    violations.push('the preflight step must validate the live runtime-effective observation')
  }
  if (!preflightText.includes("if (live.kind !== 'observed') return { state: 'unavailable' }")) {
    violations.push('a non-observed runtime must answer unavailable, never allowed')
  }
  if (!preflightText.includes("!registry.mappingRef.startsWith('mapping:')")) {
    violations.push('the preflight step must refuse a malformed mapping ref before reading the Host')
  }
  if (!preflightText.includes("'urn:sage:preflight:v1:'")) {
    violations.push('the preflight ref must carry its own domain-separated namespace')
  }
  if ((preflightText.match(/state: 'denied'/gu) ?? []).length !== 0
    || (preflightText.match(/state: 'stale'/gu) ?? []).length !== 0) {
    violations.push('the preflight step never denies and never stales; a missing runtime answers unavailable')
  }
  return violations
}

function sessionPromptRegistryViolations(input) {
  const violations = []
  const appServiceText = typeof input?.mainAppServiceText === 'string' ? input.mainAppServiceText : ''
  const indexText = typeof input?.mainIndexText === 'string' ? input.mainIndexText : ''
  const registryText = typeof input?.sessionPromptRegistryText === 'string' ? input.sessionPromptRegistryText : ''
  const derivationText = typeof input?.capabilityEntryDerivationText === 'string' ? input.capabilityEntryDerivationText : ''
  const inventoryText = typeof input?.runtimeInventoryProviderText === 'string' ? input.runtimeInventoryProviderText : ''
  if (appServiceText === '' || indexText === '' || registryText === '' || derivationText === '' || inventoryText === '') {
    violations.push('session-prompt registry sources are unavailable')
    return violations
  }
  // T05-mid step 7 (ADR-0286): the real registry step is wired only when the requirement bundle,
  // the main-owned registry provider and the last trusted observation all exist.
  if (!appServiceText.includes('createSessionPromptRegistryPort({')
    || !appServiceText.includes('{ resolveRegistry: registryPort }')
    || !appServiceText.includes('options.capabilityRegistry === undefined')
    || !appServiceText.includes('options.runtimeInventoryObservation === undefined')) {
    violations.push('the registry step must be wired only behind the bundle, the provider and the observation')
  }
  if (!indexText.includes('capabilityRegistry: bundledRegistry,')) {
    violations.push('index must hand the admission step the SAME published-snapshot provider instance')
  }
  if (registryText.includes('createBundledCapabilityRegistryProvider')) {
    violations.push('the registry step must not open a second registry source')
  }
  if (!registryText.includes('parseCapabilityRegistrySnapshot(sealed)')) {
    violations.push('the registry step must kernel-parse the provider bytes')
  }
  if (!registryText.includes('contentDigestOf(snapshot.snapshotId) !== observation.evidence.registrySnapshotDigest')) {
    violations.push('the registry step must bind the admitted snapshot generation (ADR-0286)')
  }
  if (!registryText.includes("if (claiming.length !== 1) return { state: 'unavailable' }")) {
    violations.push('an ambiguous or absent operation mapping must answer unavailable, never a guess')
  }
  if ((registryText.match(/state: 'denied'/gu) ?? []).length !== 1
    || !registryText.includes("if (entry.state === 'disabled' || entry.state === 'revoked') return { state: 'denied' }")) {
    violations.push('only disabled / revoked entries may deny; candidate and mismatches answer unavailable')
  }
  if (!registryText.includes('capability.adapterMappingDigest !== mappingDigest')
    || !registryText.includes('capability.registryDescriptorDigest !== capabilityRegistryDescriptorDigest(entry)')) {
    violations.push('the registry step must cross-check the requirement declaration against the snapshot entry')
  }
  if (!registryText.includes('mapping:${snapshot.snapshotId}:${mappingDigest}')) {
    violations.push('the mapping ref must bind the sealed snapshot id and the adapter mapping digest')
  }
  if (!derivationText.includes('export function capabilityAdapterMappingDigest')
    || !derivationText.includes('export function capabilityRegistryDescriptorDigest')
    || !inventoryText.includes("from './capability-entry-derivation.js'")
    || !registryText.includes("from './capability-entry-derivation.js'")) {
    violations.push('the derivation forma must stay single-sourced across the inventory producer and the registry step')
  }
  return violations
}

function extractFunctionBlock(text, functionName) {
  if (typeof text !== 'string') return null
  const marker = `function ${functionName}(`
  const start = text.indexOf(marker)
  if (start < 0) return null
  const next = text.indexOf('\nfunction ', start + marker.length)
  const end = next < 0 ? text.length : next
  return text.slice(start, end)
}

function bootstrapLocalSystemAdmissionViolations(mainAppServiceText) {
  const violations = []
  if (!mainAppServiceText.includes("import { admitLocalSystemRead } from '../appservice/local-system-admission.js'")) {
    violations.push('the local-system runner must import the admitted kernel from appservice/local-system-admission.ts')
  }
  if (!mainAppServiceText.includes('bootstrapRead: createLocalSystemBootstrapRunner(options)')) {
    violations.push('the service assembly must forward bootstrapRead: createLocalSystemBootstrapRunner(options)')
  }
  const block = extractFunctionBlock(mainAppServiceText, 'createLocalSystemBootstrapRunner')
  if (block === null) return [...violations, 'createLocalSystemBootstrapRunner is missing from the main app-service assembly']
  if (!block.includes('admitLocalSystemRead<LocalSystemBootstrapState>({')) {
    violations.push('the local-system runner must enter admitLocalSystemRead with the closed bootstrap DTO type')
  }
  const serviceJsonCalls = [...block.matchAll(/serviceJson\(/gu)].length
  if (serviceJsonCalls !== 2) {
    violations.push('the local-system runner must answer with exactly two serviceJson exits (the kernel value or the stable denial)')
  }
  if (!block.includes('serviceJson(result.value, 200)')) {
    violations.push('the local-system success exit must be the admitted kernel value')
  }
  if (!block.includes('serviceJson({ code: result.code, stage: result.stage, retryable: result.retryable, correlation: result.correlation }, 200)')) {
    violations.push('the local-system denial exit must derive every field from the kernel result')
  }
  if (block.includes('new Response(')) {
    violations.push('the local-system runner must answer only through serviceJson')
  }
  if (block.includes('options.vault.snapshot') || block.includes('...options.vault') || block.includes('identitySession')) {
    violations.push('the local-system runner must not read the vault snapshot, identity session, or spread vault state')
  }
  if (!block.includes('options.callerBinding')) {
    violations.push('the local-system runner must derive its caller fact from the request-scoped binding')
  }
  if (!block.includes('return frame === undefined || !frame.ready || frame.contaminated')) {
    violations.push('the local-system runner must verify a ready, uncontaminated frame before the read')
  }
  if (!block.includes("if (frame === undefined || !frame.ready || frame.contaminated) return { state: 'unavailable' as const }")) {
    violations.push('the local-system runner must re-verify a ready, uncontaminated frame after the read')
  }
  if (!block.includes('frame.generation === frameGeneration')) {
    violations.push('the local-system runner must re-check the frame generation after the read')
  }
  if (!block.includes('options.vault.status() !== beforeStatus')) {
    violations.push('the local-system runner must discard a read that raced an identity change')
  }
  if (!block.includes('options.viewState?.status')) {
    violations.push('the local-system runtime status must come from the assembled view state')
  }
  if (block.includes('displayName') || /\bmatterRef\b/u.test(block) || /\bworkspaceRoot\b/u.test(block)) {
    violations.push('the local-system runner must not carry names, matter or workspace authority')
  }
  return violations
}

function devicePreferencesAdmissionViolations(mainAppServiceText) {
  const violations = []
  if (!mainAppServiceText.includes("import { admitLocalSystemRead } from '../appservice/local-system-admission.js'")) {
    violations.push('the device-preferences runner must import the admitted local-system kernel')
  }
  if (!mainAppServiceText.includes('devicePreferencesRead: createDevicePreferencesRunner(options)')) {
    violations.push('the service assembly must forward devicePreferencesRead: createDevicePreferencesRunner(options)')
  }
  const block = extractFunctionBlock(mainAppServiceText, 'createDevicePreferencesRunner')
  if (block === null) return [...violations, 'createDevicePreferencesRunner is missing from the main app-service assembly']
  if (!block.includes('admitLocalSystemRead<DevicePreferencesState>({')) {
    violations.push('the device-preferences runner must enter admitLocalSystemRead with its exact DTO type')
  }
  if (!block.includes("unavailableCode: 'device-preferences-unavailable'")) {
    violations.push('the device-preferences runner must use its route-specific unavailable code')
  }
  if (!block.includes('validatesReadValue: isDevicePreferencesState')) {
    violations.push('the device-preferences runner must validate the exact device DTO')
  }
  const serviceJsonCalls = [...block.matchAll(/serviceJson\(/gu)].length
  if (serviceJsonCalls !== 2) {
    violations.push('the device-preferences runner must answer with exactly two serviceJson exits')
  }
  if (!block.includes('serviceJson(result.value, 200)')) {
    violations.push('the device-preferences success exit must be the admitted kernel value')
  }
  if (!block.includes('serviceJson({ code: result.code, stage: result.stage, retryable: result.retryable, correlation: result.correlation }, 200)')) {
    violations.push('the device-preferences denial exit must derive every field from the kernel result')
  }
  if (block.includes('new Response(')) {
    violations.push('the device-preferences runner must answer only through serviceJson')
  }
  if (!block.includes('options.callerBinding')) {
    violations.push('the device-preferences runner must derive its caller fact from the request-scoped binding')
  }
  if (!block.includes('return frame === undefined || !frame.ready || frame.contaminated')) {
    violations.push('the device-preferences runner must verify a ready, uncontaminated frame before the read')
  }
  if (!block.includes("if (frame === undefined || !frame.ready || frame.contaminated) return { state: 'unavailable' as const }")) {
    violations.push('the device-preferences runner must re-verify a ready, uncontaminated frame after the read')
  }
  if (!block.includes('frame.generation === frameGeneration')) {
    violations.push('the device-preferences runner must re-check the frame generation after the read')
  }
  if (!block.includes('options.vault.status() !== beforeStatus')) {
    violations.push('the device-preferences runner must discard a read that raced an identity change')
  }
  if (!block.includes('const preferences = options.preferences?.()')) {
    violations.push('the device-preferences runner must read the main-owned preference projection')
  }
  for (const projection of [
    'requested: preferences.requested',
    'savedAt: preferences.savedAt',
    'effectiveTheme: preferences.effectiveTheme',
  ]) {
    if (!block.includes(projection)) violations.push(`the device-preferences DTO must project ${projection}`)
  }
  if (block.includes('options.preferencesSave') || block.includes('preferences.save(')) {
    violations.push('the device-preferences GET runner must not call a preference mutation port')
  }
  if (/\bsystemDark\b|\bapplies\b|\bdisplayName\b|\bidentitySession\b|\bmatterRef\b|\bworkspaceRoot\b/u.test(block)) {
    violations.push('the device-preferences runner must not widen its exact device-only DTO or authority')
  }
  if (!mainAppServiceText.includes("hasExactKeys(record, ['effectiveTheme', 'requested', 'savedAt'])")
    || !mainAppServiceText.includes("hasExactKeys(fields, ['contentWidth', 'density', 'fileIcons', 'fontStyle', 'iconAppearance', 'language', 'terminalTheme', 'theme'])")) {
    violations.push('the device-preferences validator must keep both DTO levels exact')
  }
  if (!mainAppServiceText.includes('record.savedAt === null || isCanonicalIsoTimestamp(record.savedAt)')) {
    violations.push('the device-preferences validator must require canonical ISO savedAt values')
  }
  return violations
}

function localSystemAdmissionViolations(path, mainAppServiceText) {
  if (path === '/.sage/bootstrap') return bootstrapLocalSystemAdmissionViolations(mainAppServiceText)
  if (path === '/.sage/device-preferences') return devicePreferencesAdmissionViolations(mainAppServiceText)
  return ['registered local-system route has no exact source contract']
}

function failAll(discovered, violations) {
  return {
    status: 'fail',
    expected: EXPECTED_ROUTES,
    discovered,
    checked: 0,
    skipped: 0,
    failed: EXPECTED_ROUTES,
    typedSkips: [],
    reason: `Sage route authority matrix drifted: ${violations.length} violation(s)`,
    note: 'Registry mismatch is a gate failure; registered authority violations are not exemptions.',
    violations,
  }
}

/**
 * @param {{matrixText: string|null, routeSkeletonText: string|null, compositionText: string|null, callerBindingText: string|null, mainAppServiceText: string|null, mainIndexText: string|null, matterCustodyText: string|null, sessionCoreIdentityText: string|null, actionAuthorityTableText: string|null, capabilityRegistryProviderText: string|null, sessionPromptPublicationText: string|null, sessionPromptTargetText: string|null, publicationBundleText: string|null, sessionPromptCompatibilityText: string|null, sessionPromptRegistryText: string|null, capabilityEntryDerivationText: string|null, runtimeInventoryProviderText: string|null, sessionPromptPreflightText: string|null, sessionPromptPersistenceText: string|null, sessionPromptAttemptStoreText: string|null, sessionPromptEvaluationEvidenceText: string|null, sessionPromptReverifyText: string|null, sessionPromptDispatchText: string|null, protectedEffectAdmissionText: string|null, sessionPromptPrepareText: string|null}} input
 */
export function checkSageRouteAuthority(input) {
  const sourceRoutes = discoverRouteConstants(input?.routeSkeletonText)
  const discovered = sourceRoutes.length
  if (typeof input?.routeSkeletonText !== 'string') {
    return failAll(0, ['route skeleton unavailable; route denominator cannot be discovered'])
  }
  if (typeof input?.compositionText !== 'string') {
    return failAll(discovered, ['composition unavailable; runCommand authority cannot be checked'])
  }
  if (typeof input?.callerBindingText !== 'string') {
    return failAll(discovered, ['caller binding unavailable; CB1 source cannot be checked'])
  }
  if (typeof input?.mainAppServiceText !== 'string') {
    return failAll(discovered, ['main app-service unavailable; projection-read assembly cannot be checked'])
  }
  if (typeof input?.mainIndexText !== 'string') {
    return failAll(discovered, ['main index unavailable; projection-read owner cannot be checked'])
  }
  if (typeof input?.matterCustodyText !== 'string') {
    return failAll(discovered, ['matter custody module unavailable; the creation-branch custodian cannot be checked'])
  }
  if (typeof input?.sessionCoreIdentityText !== 'string' || typeof input?.actionAuthorityTableText !== 'string') {
    return failAll(discovered, ['session-core identity sources unavailable; the session-family identity step cannot be checked'])
  }
  if (typeof input?.capabilityRegistryProviderText !== 'string') {
    return failAll(discovered, ['capability registry provider source unavailable; the bundled first snapshot cannot be checked'])
  }
  if (typeof input?.sessionPromptPublicationText !== 'string') {
    return failAll(discovered, ['session-prompt publication source unavailable; the first publication cannot be checked'])
  }
  if (typeof input?.sessionPromptTargetText !== 'string' || typeof input?.publicationBundleText !== 'string') {
    return failAll(discovered, ['session-prompt target sources unavailable; the shipped requirement bundle cannot be checked'])
  }
  if (typeof input?.sessionPromptCompatibilityText !== 'string') {
    return failAll(discovered, ['session-prompt compatibility source unavailable; the shipped matrix publication cannot be checked'])
  }
  if (typeof input?.sessionPromptRegistryText !== 'string'
    || typeof input?.capabilityEntryDerivationText !== 'string'
    || typeof input?.runtimeInventoryProviderText !== 'string') {
    return failAll(discovered, ['session-prompt registry sources unavailable; the real registry step cannot be checked'])
  }
  if (typeof input?.sessionPromptPreflightText !== 'string') {
    return failAll(discovered, ['session-prompt preflight source unavailable; the real preflight step cannot be checked'])
  }
  if (typeof input?.sessionPromptPersistenceText !== 'string'
    || typeof input?.sessionPromptAttemptStoreText !== 'string'
    || typeof input?.sessionPromptEvaluationEvidenceText !== 'string'
    || typeof input?.sessionPromptReverifyText !== 'string'
    || typeof input?.sessionPromptDispatchText !== 'string') {
    return failAll(discovered, ['session-prompt persistence sources unavailable; the real persistence step cannot be checked'])
  }
  if (typeof input?.sessionPromptPrepareText !== 'string') {
    return failAll(discovered, ['session-prompt prepare source unavailable; the preparation write cannot be checked'])
  }
  if (typeof input?.matrixText !== 'string') {
    return failAll(discovered, ['route authority matrix unavailable'])
  }

  let matrix
  try {
    matrix = JSON.parse(input.matrixText)
  } catch (error) {
    return failAll(discovered, [`matrix JSON is invalid: ${error instanceof Error ? error.message : String(error)}`])
  }
  if (!isRecord(matrix) || !Array.isArray(matrix.routes)) {
    return failAll(discovered, ['matrix JSON must be an object with a routes array'])
  }

  const violations = []
  const failedRoutes = new Set()
  let globalFailure = false
  const failGlobal = (message) => {
    violations.push(message)
    globalFailure = true
  }
  const failRoute = (path, message) => {
    failedRoutes.add(path)
    violations.push(`${path}: ${message}`)
  }

  if (matrix.schemaVersion !== 1) failGlobal('schemaVersion must remain 1')
  if (matrix.sourceCommit !== 'eeff8967190815c7b5018f7d11b748818d487d37') {
    failGlobal('sourceCommit must remain the audited eeff896 baseline')
  }
  const denominator = matrix.denominator
  if (!isRecord(denominator)
    || denominator.expected !== EXPECTED_ROUTES
    || denominator.sourcePath !== 'apps/sage-shell/src/appservice/route-skeleton.ts'
    || denominator.constantPattern !== '^const SAGE_.*_PATH') {
    failGlobal('matrix route denominator declaration drifted')
  }
  if (discovered !== EXPECTED_ROUTES) {
    failGlobal(`route denominator expected ${EXPECTED_ROUTES}, discovered ${discovered}`)
  }
  if (matrix.routes.length !== EXPECTED_ROUTES) {
    failGlobal(`matrix route denominator expected ${EXPECTED_ROUTES}, registered ${matrix.routes.length}`)
  }

  const sourceByConstant = new Map(sourceRoutes.map((route) => [route.sourceConstant, route]))
  const sourceByPath = new Map(sourceRoutes.map((route) => [route.path, route]))
  if (sourceByConstant.size !== sourceRoutes.length || sourceByPath.size !== sourceRoutes.length) {
    failGlobal('route denominator contains duplicate constants or paths')
  }

  const branches = discoverRouteBranches(input.routeSkeletonText)
  const branchByConstant = new Map()
  for (const branch of branches) {
    for (const sourceConstant of branch.constants) {
      if (branchByConstant.has(sourceConstant)) failGlobal(`${sourceConstant}: appears in more than one route branch`)
      branchByConstant.set(sourceConstant, branch)
    }
  }

  const registeredPaths = new Set()
  const registeredConstants = new Set()
  const classCounts = Object.fromEntries(Object.keys(CLASSIFICATION_COUNTS).map((key) => [key, 0]))

  for (const rawRoute of matrix.routes) {
    if (!isRecord(rawRoute)) {
      failGlobal('matrix contains a non-object route row')
      continue
    }
    const path = typeof rawRoute.path === 'string' ? rawRoute.path : '<missing-path>'
    if (registeredPaths.has(path)) failRoute(path, 'duplicate matrix path')
    registeredPaths.add(path)
    if (typeof rawRoute.sourceConstant !== 'string') failRoute(path, 'sourceConstant is required')
    else {
      if (registeredConstants.has(rawRoute.sourceConstant)) failRoute(path, 'duplicate sourceConstant')
      registeredConstants.add(rawRoute.sourceConstant)
    }

    const source = typeof rawRoute.sourceConstant === 'string' ? sourceByConstant.get(rawRoute.sourceConstant) : undefined
    if (source === undefined) failRoute(path, 'source constant is not declared by route-skeleton.ts')
    else if (source.path !== path) failRoute(source.path, `matrix path is ${path}`)
    if (!sourceByPath.has(path)) failRoute(path, 'path is not declared by route-skeleton.ts')

    const expectedClassification = classificationFor(path)
    if (rawRoute.classification !== expectedClassification) {
      failRoute(path, `classification must be ${expectedClassification}`)
    } else classCounts[expectedClassification] += 1

    const expectedPolicy = policyProfileFor(path, expectedClassification)
    if (rawRoute.policyProfile !== expectedPolicy) failRoute(path, `policyProfile must be ${expectedPolicy}`)
    if (!stringArray(rawRoute.operations)) failRoute(path, 'operations must be a non-empty string array')
    if (rawRoute.callerBinding !== 'CB1') failRoute(path, 'callerBinding must be CB1')
    for (const field of ['activeContext', 'persistence', 'runtimeLevel']) {
      if (typeof rawRoute[field] !== 'string' || rawRoute[field] === '') failRoute(path, `${field} must be a non-empty string`)
    }
    if (path === CORRECTION_PATH && rawRoute.activeContext !== CORRECTION_ACTIVE_CONTEXT) {
      failRoute(path, `activeContext must be ${CORRECTION_ACTIVE_CONTEXT}`)
    }
    if (path === ATTACHMENT_UPLOAD_PATH && rawRoute.activeContext !== ATTACHMENT_UPLOAD_ACTIVE_CONTEXT) {
      failRoute(path, `activeContext must be ${ATTACHMENT_UPLOAD_ACTIVE_CONTEXT}`)
    }
    if (path === ATTACHMENT_CANCEL_PATH && rawRoute.activeContext !== ATTACHMENT_CANCEL_ACTIVE_CONTEXT) {
      failRoute(path, `activeContext must be ${ATTACHMENT_CANCEL_ACTIVE_CONTEXT}`)
    }
    if (!stringArray(rawRoute.providers)) failRoute(path, 'providers must be a non-empty string array')

    const branch = typeof rawRoute.sourceConstant === 'string' ? branchByConstant.get(rawRoute.sourceConstant) : undefined
    if (branch === undefined) failRoute(path, 'route branch could not be discovered')
    else {
      if (rawRoute.method !== branch.method) failRoute(path, `method must match source ${branch.method ?? '<missing>'}`)
      if (Array.isArray(rawRoute.providers)) {
        for (const provider of rawRoute.providers) {
          if (!branch.providers.includes(provider)) failRoute(path, `provider ${provider} is not called by its source branch`)
        }
      }
    }

    const expectedRunCommand = RUN_COMMAND_PATHS.has(path)
    const expectedProtectedAdmission = PROTECTED_ADMISSION_PATHS.has(path)
    const expectedContextSelection = CONTEXT_SELECTION_PATHS.has(path)
    const expectedRunCommandRequired = expectedClassification === 'protected-effect'
      && !expectedProtectedAdmission
      && !expectedContextSelection
    if (!isRecord(rawRoute.runCommand)) failRoute(path, 'runCommand object is required')
    else {
      if (rawRoute.runCommand.required !== expectedRunCommandRequired) {
        failRoute(path, `runCommand.required must be ${expectedRunCommandRequired}`)
      }
      if (rawRoute.runCommand.actual !== expectedRunCommand) {
        failRoute(path, `runCommand.actual must be ${expectedRunCommand}`)
      }
      const sourceActual = Array.isArray(rawRoute.providers)
        && providerUsesRunCommand(input.compositionText, rawRoute.providers)
      if (sourceActual !== rawRoute.runCommand.actual) {
        failRoute(path, `runCommand source fact is ${sourceActual}, matrix says ${String(rawRoute.runCommand.actual)}`)
      }
    }
    if (expectedProtectedAdmission) {
      if (!isRecord(rawRoute.protectedAdmission)) {
        failRoute(path, 'protectedAdmission object is required')
      } else {
        if (rawRoute.protectedAdmission.required !== true) failRoute(path, 'protectedAdmission.required must be true')
        if (rawRoute.protectedAdmission.actual !== true) failRoute(path, 'protectedAdmission.actual must be true')
        const exactAdmissionViolations = path === CORRECTION_PATH
          ? correctionProtectedAdmissionViolations(input.compositionText)
          : path === ATTACHMENT_UPLOAD_PATH
            ? attachmentUploadProtectedAdmissionViolations(input.compositionText)
            : path === ATTACHMENT_CANCEL_PATH
              ? attachmentCancelProtectedAdmissionViolations(input.compositionText)
              : []
        for (const violation of exactAdmissionViolations) failRoute(path, violation)
        const sourceActual = path === CORRECTION_PATH || path === ATTACHMENT_UPLOAD_PATH || path === ATTACHMENT_CANCEL_PATH
          ? exactAdmissionViolations.length === 0
          : Array.isArray(rawRoute.providers)
            && providerUsesProtectedAdmission(input.compositionText, rawRoute.providers)
        if (sourceActual !== rawRoute.protectedAdmission.actual) {
          failRoute(path, `protectedAdmission source fact is ${sourceActual}, matrix says ${String(rawRoute.protectedAdmission.actual)}`)
        }
      }
    } else if (rawRoute.protectedAdmission !== undefined) {
      failRoute(path, 'protectedAdmission is only valid for the registered protected-effect admission slice')
    }
    if (expectedContextSelection) {
      if (!isRecord(rawRoute.contextSelection)) {
        failRoute(path, 'contextSelection object is required')
      } else {
        if (rawRoute.contextSelection.required !== true) failRoute(path, 'contextSelection.required must be true')
        if (rawRoute.contextSelection.actual !== true) failRoute(path, 'contextSelection.actual must be true')
        const sourceActual = Array.isArray(rawRoute.providers)
          && providerUsesContextSelection(input.compositionText, rawRoute.providers)
        if (sourceActual !== rawRoute.contextSelection.actual) {
          failRoute(path, `contextSelection source fact is ${sourceActual}, matrix says ${String(rawRoute.contextSelection.actual)}`)
        }
      }
    } else if (rawRoute.contextSelection !== undefined) {
      failRoute(path, 'contextSelection is only valid for the explicit context selection route')
    }
    const expectedLocalSystem = LOCAL_SYSTEM_PATHS.has(path)
    if (expectedLocalSystem) {
      const fact = LOCAL_SYSTEM_ROUTE_FACTS.get(path)
      if (fact === undefined) {
        failRoute(path, 'registered local-system route has no immutable method/operation/provider fact')
      } else {
        if (rawRoute.method !== fact.method) failRoute(path, 'local-system route method must remain GET')
        if (!sameStrings(rawRoute.operations, fact.operations)) {
          failRoute(path, 'local-system route operations must remain [read]')
        }
        if (!sameStrings(rawRoute.providers, fact.providers)) {
          failRoute(path, `local-system route providers must remain [${fact.providers.join(', ')}]`)
        }
      }
      if (!isRecord(rawRoute.localSystemAdmission)) {
        failRoute(path, 'localSystemAdmission object is required')
      } else {
        if (rawRoute.localSystemAdmission.required !== true) failRoute(path, 'localSystemAdmission.required must be true')
        if (rawRoute.localSystemAdmission.actual !== true) failRoute(path, 'localSystemAdmission.actual must be true')
        const sourceViolations = localSystemAdmissionViolations(path, input.mainAppServiceText)
        for (const violation of sourceViolations) failRoute(path, violation)
        const sourceActual = sourceViolations.length === 0
        if (sourceActual !== rawRoute.localSystemAdmission.actual) {
          failRoute(path, `localSystemAdmission source fact is ${sourceActual}, matrix says ${String(rawRoute.localSystemAdmission.actual)}`)
        }
      }
    } else if (rawRoute.localSystemAdmission !== undefined) {
      failRoute(path, 'localSystemAdmission is only valid for the registered local-system route')
    }
    const expectedProjectionRead = expectedClassification === 'read-only'
    if (expectedProjectionRead) {
      if (!isRecord(rawRoute.projectionReadAdmission)) {
        failRoute(path, 'projectionReadAdmission object is required')
      } else {
        if (rawRoute.projectionReadAdmission.required !== true) failRoute(path, 'projectionReadAdmission.required must be true')
        if (rawRoute.projectionReadAdmission.actual !== true) failRoute(path, 'projectionReadAdmission.actual must be true')
        if (branch?.projectionRead !== rawRoute.projectionReadAdmission.actual) {
          failRoute(path, `projectionReadAdmission source fact is ${String(branch?.projectionRead)}, matrix says ${String(rawRoute.projectionReadAdmission.actual)}`)
        }
      }
    } else if (rawRoute.projectionReadAdmission !== undefined) {
      failRoute(path, 'projectionReadAdmission is only valid for read-only routes')
    }

    const expectedSourceRead = path === EDIT_DRAFT_CREATE_PATH
    if (expectedSourceRead) {
      if (!isRecord(rawRoute.sourceReadAdmission)) {
        failRoute(path, 'sourceReadAdmission object is required')
      } else {
        if (rawRoute.sourceReadAdmission.required !== true) failRoute(path, 'sourceReadAdmission.required must be true')
        if (rawRoute.sourceReadAdmission.actual !== true) failRoute(path, 'sourceReadAdmission.actual must be true')
        const sourceViolations = editDraftCreateSourceViolations(input.routeSkeletonText, input.mainAppServiceText)
        for (const violation of sourceViolations) failRoute(path, violation)
        if (sourceViolations.length !== 0) failRoute(path, 'sourceReadAdmission source facts are incomplete')
      }
    } else if (rawRoute.sourceReadAdmission !== undefined) {
      failRoute(path, 'sourceReadAdmission is only valid for edit-drafts/create')
    }

    const mixed = MIXED_POLICY.get(path)
    const expectedUnsupported = mixed?.unsupportedOperations ?? []
    if (!sameStrings(rawRoute.unsupportedOperations, expectedUnsupported)) {
      failRoute(path, `unsupportedOperations must be [${expectedUnsupported.join(', ')}]`)
    }

    const expectedAuthority = authorityFor(path, expectedClassification)
    if (!isRecord(rawRoute.currentAuthority)
      || rawRoute.currentAuthority.status !== expectedAuthority.status
      || rawRoute.currentAuthority.mode !== expectedAuthority.mode) {
      failRoute(path, `currentAuthority must be ${expectedAuthority.status}/${expectedAuthority.mode}`)
    }
  }

  for (const source of sourceRoutes) {
    if (!registeredPaths.has(source.path)) failRoute(source.path, 'source route missing from matrix')
    if (!registeredConstants.has(source.sourceConstant)) failRoute(source.path, 'source constant missing from matrix')
  }

  for (const [classification, expected] of Object.entries(CLASSIFICATION_COUNTS)) {
    if (classCounts[classification] !== expected) {
      failGlobal(`${classification} classification expected ${expected}, registered ${classCounts[classification]}`)
    }
  }

  for (const branch of branches) {
    const registeredProviders = unique(matrix.routes
      .filter((route) => isRecord(route) && branch.constants.includes(route.sourceConstant))
      .flatMap((route) => Array.isArray(route.providers) ? route.providers : []))
    const missingProviders = branch.providers.filter((provider) => !registeredProviders.includes(provider))
    if (missingProviders.length > 0) {
      for (const sourceConstant of branch.constants) {
        const source = sourceByConstant.get(sourceConstant)
        failRoute(source?.path ?? sourceConstant, `source branch providers not fully registered: ${missingProviders.join(', ')}`)
      }
    }
  }

  const callerBindings = matrix.callerBindings
  const cb1 = isRecord(callerBindings) ? callerBindings.CB1 : null
  if (!isRecord(cb1)
    || cb1.status !== 'partial'
    || cb1.symbol !== 'verifySageServiceCaller'
    || !sameStrings(cb1.checks, CB1_CHECKS)
    || !sameStrings(cb1.missing, CB1_MISSING)) {
    failGlobal('CB1 must remain partial with the exact checked and missing dimensions')
  }

  const bindingSourceMatches = input.callerBindingText.includes('export function verifySageServiceCaller')
    && input.callerBindingText.includes('if (!isExactSageAppUrl(url)) return null')
    && input.callerBindingText.includes("const origin = request.headers.get('origin')")
    && input.callerBindingText.includes('if (origin !== null && origin !== SAGE_APP_ORIGIN) return null')
    && input.callerBindingText.includes('if (framePolicy.snapshot().contaminated) return null')
    && !input.callerBindingText.includes('framePolicy.snapshot().ready')
  if (!bindingSourceMatches) failGlobal('CB1 source no longer matches the registered partial checks')

  const projectionReadAssemblyMatches = input.mainAppServiceText.includes('function createProjectionReadRunner(')
    && input.mainAppServiceText.includes('return admitProjectionRead<ProjectionReadCandidate, Response>({')
    && input.mainAppServiceText.includes('runProjectionRead: createProjectionReadRunner(options)')
    // T03/A (user-authorised): the device state collection rides the active-matter grant; the
    // blanket "every collection unavailable" pin must not return, and no other collection is
    // resolved without its own main-owned object resolver.
    && input.mainAppServiceText.includes("return candidate.collection === 'state'")
    && !input.mainAppServiceText.includes("if (candidate.kind === 'collection') return { state: 'unavailable' as const }")
  if (!projectionReadAssemblyMatches) failGlobal('projection-read main assembly is missing or bypassed')

  const projectionReadOwnerMatches = input.mainIndexText.includes("import { projectionReadScope } from './projection-read-scope.js'")
    && input.mainIndexText.includes('const scope = projectionReadScope.current()')
    // T03 (authorised wiring): the read-policy ports are bound to one memoised main-owned policy —
    // selection-time matter.read grants and per-operation projection.read grants over the
    // instance-local organization policy (local-read only). The previous explicit-absent pins
    // must not return, and the per-request rebuild (which would drop the bound-scope ledger) is a drift.
    && input.mainIndexText.includes("import { createProjectionReadPolicy, type ProjectionReadPolicy } from './projection-read-policy.js'")
    && input.mainIndexText.includes('let readPolicy: ProjectionReadPolicy | null = null')
    && input.mainIndexText.includes('authorizeMatterRead: (request) => readPolicyFor().authorizeMatterRead(request)')
    && input.mainIndexText.includes('authorizeProjectionRead: (request) => readPolicyFor().authorizeProjectionRead(request)')
    && !input.mainIndexText.includes('authorizeMatterRead: () => undefined')
    && !input.mainIndexText.includes('authorizeProjectionRead: () => undefined')
    && !input.mainIndexText.includes('currentMatterRef')
    && !input.mainIndexText.includes('newest converted draft')
  if (!projectionReadOwnerMatches) failGlobal('projection-read request owner or production read-policy wiring drifted')

  const protectedBypasses = matrix.routes.filter((route) => isRecord(route)
    && route.classification === 'protected-effect'
    && isRecord(route.runCommand)
    && route.runCommand.actual === false
    && isRecord(route.currentAuthority)
    && route.currentAuthority.status === 'violation')
  if (protectedBypasses.length !== 22) {
    failGlobal(`expected 22 protected-effect bypass violations, registered ${protectedBypasses.length}`)
  }

  const directProviderBypasses = protectedBypasses.filter((route) => route.currentAuthority.mode === 'direct-provider-bypass')
  if (directProviderBypasses.length !== 16) {
    failGlobal(`expected 16 direct-provider-bypass violations, registered ${directProviderBypasses.length}`)
  }

  const admittedProtectedRoutes = matrix.routes.filter((route) => isRecord(route)
    && route.classification === 'protected-effect'
    && isRecord(route.protectedAdmission)
    && route.protectedAdmission.actual === true
    && isRecord(route.currentAuthority)
    && route.currentAuthority.status === 'compliant')
  if (admittedProtectedRoutes.length !== 13) {
    failGlobal(`expected 13 protected-effect admitted routes, registered ${admittedProtectedRoutes.length}`)
  }

  const custodyViolations = matterCustodyViolations(input)
  for (const violation of custodyViolations) failGlobal(violation)

  const identityViolations = sessionCoreIdentityViolations(input)
  for (const violation of identityViolations) failGlobal(violation)

  const registryViolations = runtimeInventoryRegistryViolations(input)
  for (const violation of registryViolations) failGlobal(violation)

  const publicationViolations = sessionPromptPublicationViolations(input)
  for (const violation of publicationViolations) failGlobal(violation)

  const targetViolations = sessionPromptTargetViolations(input)
  for (const violation of targetViolations) failGlobal(violation)

  const compatibilityViolations = sessionCoreCompatibilityViolations(input)
  for (const violation of compatibilityViolations) failGlobal(violation)

  const registryStepViolations = sessionPromptRegistryViolations(input)
  for (const violation of registryStepViolations) failGlobal(violation)

  const preflightViolations = sessionPromptPreflightViolations(input)
  for (const violation of preflightViolations) failGlobal(violation)

  const prepareViolations = sessionPromptPrepareViolations(input)
  for (const violation of prepareViolations) failGlobal(violation)

  const persistenceViolations = sessionPromptPersistenceViolations(input)
  for (const violation of persistenceViolations) failGlobal(violation)

  const dispatchViolations = sessionPromptDispatchViolations(input)
  for (const violation of dispatchViolations) failGlobal(violation)

  if (violations.length === 0) {
    return {
      status: 'pass',
      expected: EXPECTED_ROUTES,
      discovered,
      checked: EXPECTED_ROUTES,
      skipped: 0,
      failed: 0,
      typedSkips: [],
      reason: '60 Sage routes match the checked-in authority truth matrix',
      note: '13 read-only routes enter projection-read admission; projection reads evaluate the main-owned read policy (identity session + instance-local organization policy grants, local-read only) and stay unavailable without a session, grants or a bound selection; the device state collection rides the active-matter grant (T03/A), file-reference is the only admitted opaque resolver for edit-drafts/create source reads, and search plus other opaque-object reads still need their own main-owned object resolvers. 2 local-system routes enter device-local admission: bootstrap exposes only the runtime enum, auth status and requested theme/density; device-preferences exposes only the eight requested values, savedAt and observed effectiveTheme. Each remains unavailable-first without its own main-owned runner. The home-page creation branch rides the real custodian over the Sage-owned authoritative store (T04): appendId idempotent per attempt, formal identity derived from the service-issued correlation, and a receipt only from a proven commit. The session family evaluates the real Identity / Policy step for the registered session.send (T05 first cut): an unregistered operation answers not-ready before any policy read, a missing grant is a denial, and the chain now also passes the real target step over the shipped requirement bundle (T05 mid, ADR-0282) and the real compatibility step over the shipped matrix publication at the last trusted observation instant (T05 mid step 6, ADR-0284) and the real registry step (T05 mid step 7, ADR-0286) — which resolves the approved first-party capability of the operation from the same published-snapshot provider the inventory observed, binding snapshot generation, requirement declaration and approval state — the real preflight step over the live runtime-effective observation of the Host epoch (T05 mid step 8, ADR-0287) and the real persistence step — pre-write re-verification plus the atomic attempt and evaluation-evidence append over the Sage-owned store (T05 mid step 9, ADR-0288) — the real dispatch step — shared re-verification, cheap port re-runs, then the sole channel call with its own outcome detail (T05 mid step 10, ADR-0289) — and the governed first-revision prepare over the same front ports (T05 prepare, ADR-0290). The runtime inventory composition carries the Capability Registry at its kernel-sealed published face (C2D.2A; first-party publication, ADR-0285): a shipped first-party snapshot — admitted only through the kernel parse plus re-seal round trip — supersedes the bundled empty default, releasing the descriptor stage end to end. The first session-prompt target publication (T05 mid): owner-approved policy statements and plan constants compose through the candidate line into a sealed requirement over a freshly re-observed descriptor (strict exact model face), the sealed snapshot ships in the shell-owned publications tree and is kernel-parsed once at startup. 13 protected-effect routes enter unavailable-first admission; 22 protected-effect bypasses remain registered as violations, including 16 direct-provider bypasses and one protected route with an admitted source read. Gate pass is registry/source agreement, not full product availability.',
      violations: [],
    }
  }

  if (globalFailure) return failAll(discovered, violations)
  const failed = Math.max(1, Math.min(EXPECTED_ROUTES, failedRoutes.size))
  return {
    status: 'fail',
    expected: EXPECTED_ROUTES,
    discovered,
    checked: EXPECTED_ROUTES - failed,
    skipped: 0,
    failed,
    typedSkips: [],
    reason: `Sage route authority matrix drifted on ${failed} route(s)`,
    note: 'Registry mismatch is a gate failure; registered authority violations are not exemptions.',
    violations,
  }
}
