/**
 * AUTH-01 truth checker for the main-owned `/.sage/*` route surface.
 *
 * A green result means the checked-in matrix still describes the current
 * source. It deliberately does not mean the registered authority violations
 * are safe, accepted, or exempted.
 */

const EXPECTED_ROUTES = 58
const CLASSIFICATION_COUNTS = Object.freeze({
  'read-only': 13,
  'local-preference': 5,
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
  if (UNSUPPORTED_PATHS.has(path)) return 'unsupported'
  return 'protected-effect'
}

function policyProfileFor(path, classification) {
  const mixed = MIXED_POLICY.get(path)
  if (mixed !== undefined) return mixed.policyProfile
  if (CONTEXT_SELECTION_PATHS.has(path)) return 'context-selection'
  if (PREPARE_ONLY_PATHS.has(path)) return 'prepare-only'
  if (AUTH_LIFECYCLE_PATHS.has(path)) return 'auth-lifecycle'
  if (classification === 'read-only') return 'projection-read'
  if (classification === 'local-preference') return 'local-preference'
  return 'business-command'
}

function authorityFor(path, classification) {
  if (classification === 'unsupported') return { status: 'unsupported', mode: 'named-unavailable' }
  if (classification === 'read-only') return { status: 'compliant', mode: 'projection-read-admission-unavailable-first' }
  if (classification === 'local-preference') return { status: 'partial', mode: 'local-main-with-partial-caller-binding' }
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
 * @param {{matrixText: string|null, routeSkeletonText: string|null, compositionText: string|null, callerBindingText: string|null, mainAppServiceText: string|null, mainIndexText: string|null}} input
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
  if (!projectionReadAssemblyMatches) failGlobal('projection-read main assembly is missing or bypassed')

  const projectionReadOwnerMatches = input.mainIndexText.includes("import { projectionReadScope } from './projection-read-scope.js'")
    && input.mainIndexText.includes('const scope = projectionReadScope.current()')
    && input.mainIndexText.includes('authorizeProjectionRead: () => undefined')
    && !input.mainIndexText.includes('currentMatterRef')
    && !input.mainIndexText.includes('newest converted draft')
  if (!projectionReadOwnerMatches) failGlobal('projection-read request owner or production unavailable-first policy drifted')

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
  if (directProviderBypasses.length !== 17) {
    failGlobal(`expected 17 direct-provider-bypass violations, registered ${directProviderBypasses.length}`)
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

  if (violations.length === 0) {
    return {
      status: 'pass',
      expected: EXPECTED_ROUTES,
      discovered,
      checked: EXPECTED_ROUTES,
      skipped: 0,
      failed: 0,
      typedSkips: [],
      reason: '58 Sage routes match the checked-in authority truth matrix',
      note: '13 read-only routes enter projection-read admission but remain unavailable without production matter/object read policy; state/search collections and opaque object reads remain blocked. 13 protected-effect routes enter unavailable-first admission; 22 protected-effect bypasses remain registered as violations, including 17 direct-provider bypasses. Gate pass is registry/source agreement, not full product availability.',
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
