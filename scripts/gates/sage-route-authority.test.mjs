import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkSageRouteAuthority } from './sage-route-authority.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (path) => readFileSync(join(repoRoot, path), 'utf8')
const baseline = Object.freeze({
  matrixText: read('apps/sage-shell/src/appservice/route-authority-matrix.json'),
  routeSkeletonText: read('apps/sage-shell/src/appservice/route-skeleton.ts'),
  compositionText: read('apps/sage-shell/src/appservice/composition.ts'),
  callerBindingText: read('apps/sage-shell/src/main/appservice-binding.ts'),
  mainAppServiceText: read('apps/sage-shell/src/main/app-service.ts'),
  mainIndexText: read('apps/sage-shell/src/main/index.ts'),
  matterCustodyText: read('apps/sage-shell/src/main/matter-custody.ts'),
  sessionCoreIdentityText: read('apps/sage-shell/src/main/session-core-identity.ts'),
  actionAuthorityTableText: read('apps/sage-shell/src/main/action-authority-table.ts'),
  capabilityRegistryProviderText: read('apps/sage-shell/src/security/capability-registry-provider.ts'),
  sessionPromptPublicationText: read('apps/sage-shell/src/main/session-prompt-publication.ts'),
  sessionPromptTargetText: read('apps/sage-shell/src/main/session-prompt-target.ts'),
  publicationBundleText: read('apps/sage-shell/src/main/publication-bundle.ts'),
  sessionPromptCompatibilityText: read('apps/sage-shell/src/main/session-prompt-compatibility.ts'),
  sessionPromptRegistryText: read('apps/sage-shell/src/main/session-prompt-registry.ts'),
  capabilityEntryDerivationText: read('apps/sage-shell/src/main/capability-entry-derivation.ts'),
  runtimeInventoryProviderText: read('apps/sage-shell/src/main/runtime-inventory-provider.ts'),
  sessionPromptPreflightText: read('apps/sage-shell/src/main/session-prompt-preflight.ts'),
  sessionPromptPersistenceText: read('apps/sage-shell/src/main/session-prompt-persistence.ts'),
  sessionPromptAttemptStoreText: read('apps/sage-shell/src/main/session-prompt-attempt-store.ts'),
  sessionPromptEvaluationEvidenceText: read('apps/sage-shell/src/main/session-prompt-evaluation-evidence.ts'),
  sessionPromptReverifyText: read('apps/sage-shell/src/main/session-prompt-reverify.ts'),
  sessionPromptDispatchText: read('apps/sage-shell/src/main/session-prompt-dispatch.ts'),
  protectedEffectAdmissionText: read('apps/sage-shell/src/appservice/protected-effect-admission.ts'),
  sessionPromptPrepareText: read('apps/sage-shell/src/main/session-prompt-prepare.ts'),
  activeMatterSelectionText: read('apps/sage-shell/src/main/active-matter-selection.ts'),
  sessionTurnCloseText: read('apps/sage-shell/src/main/session-turn-close.ts'),
  sessionChannelText: read('apps/sage-shell/src/main/session-channel.ts'),
  sessionSendReconcileText: read('apps/sage-shell/src/main/session-send-reconcile.ts'),
})

const check = (patch = {}) => checkSageRouteAuthority({ ...baseline, ...patch })
const cancelCompositionBlock = `async cancelAttachment(request: { readonly itemId: string }): Promise<Response> {
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
    },`
const directCancelCompositionBlock = `async cancelAttachment(request: { readonly itemId: string }): Promise<Response> {
      const cancel = options.attachmentsCancel
      const outcome: AttachmentControlOutcome = cancel === undefined
        ? { state: 'refused', code: 'attachment-store-unavailable' }
        : await cancel(request).catch((): AttachmentControlOutcome => ({ state: 'refused', code: 'attachment-cancel-failed' }))
      return serviceJson(outcome, 200)
    },`
const cancelCompositionText = baseline.compositionText.includes("'session.attachment.cancel'")
  ? baseline.compositionText
  : baseline.compositionText.replace(directCancelCompositionBlock, cancelCompositionBlock)
if (!baseline.compositionText.includes("'session.attachment.cancel'")) {
  assert.notEqual(cancelCompositionText, baseline.compositionText)
}
const cancelMatrix = JSON.parse(baseline.matrixText)
const cancelMatrixRoute = cancelMatrix.routes.find((route) => route.path === '/.sage/attachments/cancel')
cancelMatrixRoute.activeContext = 'active session is resolved server-side; itemId is an opaque clue and not authority'
cancelMatrixRoute.runCommand = { required: false, actual: false }
cancelMatrixRoute.protectedAdmission = { required: true, actual: true }
cancelMatrixRoute.currentAuthority = { status: 'compliant', mode: 'protected-effect-admission-unavailable-first' }
const cancelMatrixText = JSON.stringify(cancelMatrix)
const cancelCheck = (patch = {}) => checkSageRouteAuthority({
  ...baseline,
  matrixText: cancelMatrixText,
  compositionText: cancelCompositionText,
  ...patch,
})
const expectNamedFailure = (result, needle) => {
  assert.equal(result.status, 'fail', JSON.stringify(result))
  assert.equal(result.expected, 60)
  assert.equal(result.expected, result.checked + result.skipped + result.failed)
  assert.ok(result.violations.some((violation) => violation.includes(needle)), JSON.stringify(result.violations))
}

test('current 60-route registry matches source without claiming product availability', () => {
  const result = check()
  assert.equal(result.status, 'pass', JSON.stringify(result))
  assert.deepEqual(
    { expected: result.expected, discovered: result.discovered, checked: result.checked, skipped: result.skipped, failed: result.failed },
    { expected: 60, discovered: 60, checked: 60, skipped: 0, failed: 0 },
  )
  assert.match(result.note, /13 read-only routes enter projection-read admission/)
  assert.match(result.note, /2 local-system routes enter device-local admission/)
  assert.match(result.note, /13 protected-effect routes enter unavailable-first admission/)
  assert.match(result.note, /22 protected-effect bypasses remain registered as violations/)
  assert.match(result.note, /16 direct-provider bypasses/)
  assert.match(result.note, /file-reference is the only admitted opaque resolver/)
  assert.match(result.note, /rides the real custodian over the Sage-owned authoritative store/)
  assert.match(result.note, /evaluates the real Identity \/ Policy step for the registered session\.send/)
  assert.match(result.note, /carries the Capability Registry at its kernel-sealed published face \(C2D\.2A; first-party publication, ADR-0285\)/)
  assert.match(result.note, /The first session-prompt target publication \(T05 mid\)/)
})

test('malformed or missing matrix fails closed', () => {
  expectNamedFailure(check({ matrixText: '{' }), 'matrix JSON')
  expectNamedFailure(check({ matrixText: null }), 'matrix unavailable')
})

test('route denominator deletion and addition both fail', () => {
  expectNamedFailure(check({
    routeSkeletonText: baseline.routeSkeletonText.replace("const SAGE_RUN_LOG_PATH = '/.sage/run-log'\n", ''),
  }), 'route denominator')
  expectNamedFailure(check({
    routeSkeletonText: baseline.routeSkeletonText.replace(
      "const SAGE_RUN_LOG_PATH = '/.sage/run-log'",
      "const SAGE_RUN_LOG_PATH = '/.sage/run-log'\nconst SAGE_UNREGISTERED_PATH = '/.sage/unregistered'",
    ),
  }), 'route denominator')
})

test('path, method, provider and classification drift fail', () => {
  const matrix = JSON.parse(baseline.matrixText)
  matrix.routes.find((route) => route.path === '/.sage/run-log').path = '/.sage/run-logs'
  expectNamedFailure(check({ matrixText: JSON.stringify(matrix) }), '/.sage/run-log')

  const method = JSON.parse(baseline.matrixText)
  method.routes.find((route) => route.path === '/.sage/login').method = 'POST'
  expectNamedFailure(check({ matrixText: JSON.stringify(method) }), '/.sage/login')

  const provider = JSON.parse(baseline.matrixText)
  provider.routes.find((route) => route.path === '/.sage/search').providers = ['readState']
  expectNamedFailure(check({ matrixText: JSON.stringify(provider) }), '/.sage/search')

  const classification = JSON.parse(baseline.matrixText)
  classification.routes.find((route) => route.path === '/.sage/search').classification = 'protected-effect'
  classification.routes.find((route) => route.path === '/.sage/session/send').classification = 'read-only'
  expectNamedFailure(check({ matrixText: JSON.stringify(classification) }), '/.sage/search')
})

test('a protected route cannot claim session admission without its registered source fact', () => {
  const compositionText = baseline.compositionText.replace(
    'const admission = await admitSessionCoreProtectedEffect(',
    'const admission = await bypassProtectedEffect(',
  )
  assert.notEqual(compositionText, baseline.compositionText)
  expectNamedFailure(check({ compositionText }), '/.sage/session/send')
})

test('correction admission deletion fails by its own exact source contract', () => {
  const compositionText = baseline.compositionText.replace(
    "const admission = await admitSessionCoreProtectedEffect(\n        options,\n        'session.correction.submit',",
    "const admission = await bypassProtectedEffect(\n        options,\n        'session.correction.submit',",
  )
  assert.notEqual(compositionText, baseline.compositionText)
  expectNamedFailure(check({ compositionText }), '/.sage/corrections')
})

test('correction raw-provider fallback fails even when admission remains present', () => {
  const marker = 'async submitCorrection(request: { readonly matterRef: string, readonly workspaceRoot: string, readonly originalText: string, readonly originalAt?: string, readonly text: string }): Promise<Response> {'
  const compositionText = baseline.compositionText.replace(
    marker,
    `${marker}\n      const rawFallback = options.correctionCreate\n      await rawFallback?.(request)`,
  )
  assert.notEqual(compositionText, baseline.compositionText)
  expectNamedFailure(check({ compositionText }), '/.sage/corrections')
})

test('correction operation drift fails even when it still calls the admission helper', () => {
  const compositionText = baseline.compositionText.replace(
    "        'session.correction.submit',\n        { kind: 'matter', matterRef: request.matterRef },",
    "        'session.correction.send',\n        { kind: 'matter', matterRef: request.matterRef },",
  )
  assert.notEqual(compositionText, baseline.compositionText)
  expectNamedFailure(check({ compositionText }), '/.sage/corrections')
})

test('correction matter candidate drift and workspaceRoot authority leakage fail', () => {
  const candidateDrift = baseline.compositionText.replace(
    "'session.correction.submit',\n        { kind: 'matter', matterRef: request.matterRef },",
    "'session.correction.submit',\n        { kind: 'active-session' },",
  )
  assert.notEqual(candidateDrift, baseline.compositionText)
  expectNamedFailure(check({ compositionText: candidateDrift }), '/.sage/corrections')

  const workspaceLeak = baseline.compositionText.replace(
    '        {\n          originalText: request.originalText,',
    '        {\n          workspaceRoot: request.workspaceRoot,\n          originalText: request.originalText,',
  )
  assert.notEqual(workspaceLeak, baseline.compositionText)
  expectNamedFailure(check({ compositionText: workspaceLeak }), '/.sage/corrections')
})

test('attachment upload admission deletion fails by its own exact source contract', () => {
  const compositionText = baseline.compositionText.replace(
    "const admission = await admitSessionCoreProtectedEffect(\n        options,\n        'session.attachment.upload',",
    "const admission = await bypassProtectedEffect(\n        options,\n        'session.attachment.upload',",
  )
  assert.notEqual(compositionText, baseline.compositionText)
  expectNamedFailure(check({ compositionText }), 'uploadAttachment must call admitSessionCoreProtectedEffect')
})

test('attachment upload raw-provider fallback fails even when admission remains present', () => {
  const marker = 'async uploadAttachment(request: { readonly itemId: string, readonly matterRef: string, readonly workspaceRoot: string }): Promise<Response> {'
  const compositionText = baseline.compositionText.replace(
    marker,
    `${marker}\n      const rawFallback = options.attachmentsUpload\n      await rawFallback?.(request)`,
  )
  assert.notEqual(compositionText, baseline.compositionText)
  expectNamedFailure(check({ compositionText }), 'uploadAttachment must not retain an options.attachmentsUpload raw-provider fallback')
})

test('attachment upload operation drift fails even when it still calls the admission helper', () => {
  const compositionText = baseline.compositionText.replace(
    "        'session.attachment.upload',\n        { kind: 'matter', matterRef: request.matterRef },",
    "        'session.attachment.send',\n        { kind: 'matter', matterRef: request.matterRef },",
  )
  assert.notEqual(compositionText, baseline.compositionText)
  expectNamedFailure(check({ compositionText }), 'uploadAttachment admission operation must be session.attachment.upload')
})

test('attachment upload matter candidate drift fails', () => {
  const compositionText = baseline.compositionText.replace(
    "'session.attachment.upload',\n        { kind: 'matter', matterRef: request.matterRef },",
    "'session.attachment.upload',\n        { kind: 'active-session' },",
  )
  assert.notEqual(compositionText, baseline.compositionText)
  expectNamedFailure(check({ compositionText }), 'uploadAttachment admission candidate must be request matterRef')
})

test('attachment upload renderer workspaceRoot leakage fails', () => {
  const compositionText = baseline.compositionText.replace(
    "        'session.attachment.upload',\n        { kind: 'matter', matterRef: request.matterRef },\n        { itemId: request.itemId },",
    "        'session.attachment.upload',\n        { kind: 'matter', matterRef: request.matterRef },\n        { itemId: request.itemId, workspaceRoot: request.workspaceRoot },",
  )
  assert.notEqual(compositionText, baseline.compositionText)
  expectNamedFailure(check({ compositionText }), 'uploadAttachment must not place renderer workspaceRoot in the protected intent')
})

test('attachment upload itemId payload deletion fails', () => {
  const compositionText = baseline.compositionText.replace(
    "        'session.attachment.upload',\n        { kind: 'matter', matterRef: request.matterRef },\n        { itemId: request.itemId },",
    "        'session.attachment.upload',\n        { kind: 'matter', matterRef: request.matterRef },\n        {},",
  )
  assert.notEqual(compositionText, baseline.compositionText)
  expectNamedFailure(check({ compositionText }), 'uploadAttachment admission payload must contain only request itemId')
})

test('attachment cancel admission deletion fails by its own exact source contract', () => {
  const compositionText = cancelCompositionText.replace(
    "const admission = await admitSessionCoreProtectedEffect(\n        options,\n        'session.attachment.cancel',",
    "const admission = await bypassProtectedEffect(\n        options,\n        'session.attachment.cancel',",
  )
  assert.notEqual(compositionText, cancelCompositionText)
  expectNamedFailure(cancelCheck({ compositionText }), 'cancelAttachment must call admitSessionCoreProtectedEffect')
})

test('attachment cancel raw-provider fallback fails even when admission remains present', () => {
  const marker = 'async cancelAttachment(request: { readonly itemId: string }): Promise<Response> {'
  const compositionText = cancelCompositionText.replace(
    marker,
    `${marker}\n      const rawFallback = options.attachmentsCancel\n      await rawFallback?.(request)`,
  )
  assert.notEqual(compositionText, cancelCompositionText)
  expectNamedFailure(cancelCheck({ compositionText }), 'cancelAttachment must not retain an options.attachmentsCancel raw-provider fallback')
})

test('attachment cancel operation drift fails even when it still calls the admission helper', () => {
  const compositionText = cancelCompositionText.replace(
    "        'session.attachment.cancel',\n        { kind: 'active-session' },",
    "        'session.attachment.abort',\n        { kind: 'active-session' },",
  )
  assert.notEqual(compositionText, cancelCompositionText)
  expectNamedFailure(cancelCheck({ compositionText }), 'cancelAttachment admission operation must be session.attachment.cancel')
})

test('attachment cancel candidate drift fails', () => {
  const compositionText = cancelCompositionText.replace(
    "'session.attachment.cancel',\n        { kind: 'active-session' },",
    "'session.attachment.cancel',\n        { kind: 'matter', matterRef: request.itemId },",
  )
  assert.notEqual(compositionText, cancelCompositionText)
  expectNamedFailure(cancelCheck({ compositionText }), 'cancelAttachment admission candidate must be active-session')
})

test('attachment cancel itemId payload deletion and expansion both fail', () => {
  const exactCall = "        'session.attachment.cancel',\n        { kind: 'active-session' },\n        { itemId: request.itemId },"
  const deleted = cancelCompositionText.replace(
    exactCall,
    "        'session.attachment.cancel',\n        { kind: 'active-session' },\n        {},",
  )
  assert.notEqual(deleted, cancelCompositionText)
  expectNamedFailure(cancelCheck({ compositionText: deleted }), 'cancelAttachment admission payload must contain only request itemId')

  const expanded = cancelCompositionText.replace(
    exactCall,
    "        'session.attachment.cancel',\n        { kind: 'active-session' },\n        { itemId: request.itemId, matterRef: 'caller-claimed' },",
  )
  assert.notEqual(expanded, cancelCompositionText)
  expectNamedFailure(cancelCheck({ compositionText: expanded }), 'cancelAttachment admission payload must contain only request itemId')
})

test('attachment cancel matrix cannot claim compliance without its exact source fact', () => {
  const compositionText = cancelCompositionText.replace(
    "      const admission = await admitSessionCoreProtectedEffect(\n        options,\n        'session.attachment.cancel',\n        { kind: 'active-session' },\n        { itemId: request.itemId },\n      )",
    "      const cancel = options.attachmentsCancel\n      const admission = cancel === undefined\n        ? { state: 'unavailable' }\n        : await cancel(request)",
  )
  assert.notEqual(compositionText, cancelCompositionText)
  expectNamedFailure(cancelCheck({ compositionText }), 'cancelAttachment must call admitSessionCoreProtectedEffect')
})

test('attachment cancel matrix admission and active-context facts cannot drift', () => {
  const missingAdmission = JSON.parse(cancelMatrixText)
  delete missingAdmission.routes.find((route) => route.path === '/.sage/attachments/cancel').protectedAdmission
  expectNamedFailure(cancelCheck({ matrixText: JSON.stringify(missingAdmission) }), '/.sage/attachments/cancel')

  const falseAdmission = JSON.parse(cancelMatrixText)
  falseAdmission.routes.find((route) => route.path === '/.sage/attachments/cancel').protectedAdmission.actual = false
  expectNamedFailure(cancelCheck({ matrixText: JSON.stringify(falseAdmission) }), '/.sage/attachments/cancel')

  const contextDrift = JSON.parse(cancelMatrixText)
  contextDrift.routes.find((route) => route.path === '/.sage/attachments/cancel').activeContext = 'caller attachment itemId'
  expectNamedFailure(cancelCheck({ matrixText: JSON.stringify(contextDrift) }), '/.sage/attachments/cancel')
})

test('the explicit context selection route cannot claim compliance without its source fact', () => {
  const compositionText = baseline.compositionText.replace(
    'const select = options.selectActiveMatter',
    'const select = options.bypassActiveMatterSelection',
  )
  assert.notEqual(compositionText, baseline.compositionText)
  expectNamedFailure(check({ compositionText }), '/.sage/context/select')
})

test('a local-system route cannot claim compliance without its exact runner source fact', () => {
  const bypassedKernel = baseline.mainAppServiceText.replace(
    'admitLocalSystemRead<LocalSystemBootstrapState>({',
    'bypassLocalSystemRead<LocalSystemBootstrapState>({',
  )
  assert.notEqual(bypassedKernel, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: bypassedKernel }), '/.sage/bootstrap')

  const droppedAssembly = baseline.mainAppServiceText.replace(
    'bootstrapRead: createLocalSystemBootstrapRunner(options),',
    'bootstrapRead: droppedByAssembly(options),',
  )
  assert.notEqual(droppedAssembly, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: droppedAssembly }), '/.sage/bootstrap')

  const readyBypass = baseline.mainAppServiceText.replace(
    'return frame === undefined || !frame.ready || frame.contaminated',
    'return frame === undefined',
  )
  assert.notEqual(readyBypass, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: readyBypass }), '/.sage/bootstrap')

  const postReadyBypass = baseline.mainAppServiceText.replace(
    "if (frame === undefined || !frame.ready || frame.contaminated) return { state: 'unavailable' as const }",
    "if (frame === undefined) return { state: 'unavailable' as const }",
  )
  assert.notEqual(postReadyBypass, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: postReadyBypass }), '/.sage/bootstrap')

  const displayNameLeak = baseline.mainAppServiceText.replace(
    'auth: { status: beforeStatus },',
    'auth: { status: beforeStatus, displayName: options.vault.snapshot().displayName },',
  )
  assert.notEqual(displayNameLeak, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: displayNameLeak }), '/.sage/bootstrap')

  // Review round 1 (Important): a literal-preserving early return in front of the kernel used to
  // pass every substring check; the structural exit count now catches it.
  const earlyReturnBypass = baseline.mainAppServiceText.replace(
    'const correlation = options.callerBinding?.correlation ?? randomUUID()\n    const result = await admitLocalSystemRead<LocalSystemBootstrapState>({',
    "const correlation = options.callerBinding?.correlation ?? randomUUID()\n      if (correlation === 'shortcut') return serviceJson({ runtime: { status: 'ready' }, auth: { status: 'signed-out' }, display: { theme: 'light', density: 'compact' } }, 200)\n    const result = await admitLocalSystemRead<LocalSystemBootstrapState>({",
  )
  assert.notEqual(earlyReturnBypass, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: earlyReturnBypass }), '/.sage/bootstrap')

  const snapshotSpread = baseline.mainAppServiceText.replace(
    'auth: { status: beforeStatus },',
    'auth: { ...options.vault.snapshot(), status: beforeStatus },',
  )
  assert.notEqual(snapshotSpread, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: snapshotSpread }), '/.sage/bootstrap')
})

test('the device-preferences local-system route cannot drift from its exact read contract', () => {
  const bypassedKernel = baseline.mainAppServiceText.replace(
    'admitLocalSystemRead<DevicePreferencesState>({',
    'bypassLocalSystemRead<DevicePreferencesState>({',
  )
  assert.notEqual(bypassedKernel, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: bypassedKernel }), '/.sage/device-preferences')

  const droppedAssembly = baseline.mainAppServiceText.replace(
    'devicePreferencesRead: createDevicePreferencesRunner(options),',
    'devicePreferencesRead: droppedByAssembly(options),',
  )
  assert.notEqual(droppedAssembly, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: droppedAssembly }), '/.sage/device-preferences')

  const sharedDenial = baseline.mainAppServiceText.replace(
    "unavailableCode: 'device-preferences-unavailable',",
    "unavailableCode: 'bootstrap-unavailable',",
  )
  assert.notEqual(sharedDenial, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: sharedDenial }), '/.sage/device-preferences')

  const droppedValidator = baseline.mainAppServiceText.replace(
    'validatesReadValue: isDevicePreferencesState,',
    'validatesReadValue: () => true,',
  )
  assert.notEqual(droppedValidator, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: droppedValidator }), '/.sage/device-preferences')

  const mutationPort = baseline.mainAppServiceText.replaceAll(
    'const preferences = options.preferences?.()',
    'const preferences = await options.preferencesSave?.({})',
  )
  assert.notEqual(mutationPort, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: mutationPort }), '/.sage/device-preferences')

  const widenedDto = baseline.mainAppServiceText.replace(
    'effectiveTheme: preferences.effectiveTheme,',
    'effectiveTheme: preferences.effectiveTheme, systemDark: preferences.systemDark,',
  )
  assert.notEqual(widenedDto, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: widenedDto }), '/.sage/device-preferences')

  const looseTimestamp = baseline.mainAppServiceText.replace(
    'record.savedAt === null || isCanonicalIsoTimestamp(record.savedAt)',
    "record.savedAt === null || typeof record.savedAt === 'string'",
  )
  assert.notEqual(looseTimestamp, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: looseTimestamp }), '/.sage/device-preferences')
})

test('device-preferences method, operation and provider facts stay immutable under coordinated drift', () => {
  const providerDrift = JSON.parse(baseline.matrixText)
  providerDrift.routes.find((route) => route.path === '/.sage/device-preferences').providers = ['bootstrapRead']
  expectNamedFailure(check({ matrixText: JSON.stringify(providerDrift) }), '/.sage/device-preferences')

  const coordinatedMatrix = JSON.parse(baseline.matrixText)
  const route = coordinatedMatrix.routes.find((candidate) => candidate.path === '/.sage/device-preferences')
  route.operations = ['write']
  route.providers = ['savePreferences']
  const coordinatedSource = baseline.routeSkeletonText.replace(
    'return deps.providers.devicePreferencesRead()',
    'return deps.providers.savePreferences({})',
  )
  assert.notEqual(coordinatedSource, baseline.routeSkeletonText)
  expectNamedFailure(check({
    matrixText: JSON.stringify(coordinatedMatrix),
    routeSkeletonText: coordinatedSource,
  }), '/.sage/device-preferences')
})

test('the projection-read owner cannot drift from the authorised read-policy wiring (T03)', () => {
  const unwiredProjection = baseline.mainIndexText.replace(
    'authorizeProjectionRead: (request) => readPolicyFor().authorizeProjectionRead(request),',
    'authorizeProjectionRead: () => undefined,',
  )
  assert.notEqual(unwiredProjection, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: unwiredProjection }), 'production read-policy wiring drifted')

  const unwiredMatterRead = baseline.mainIndexText.replace(
    'authorizeMatterRead: (request) => readPolicyFor().authorizeMatterRead(request),',
    'authorizeMatterRead: () => undefined,',
  )
  assert.notEqual(unwiredMatterRead, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: unwiredMatterRead }), 'production read-policy wiring drifted')

  const droppedImport = baseline.mainIndexText.replace(
    "import { createProjectionReadPolicy, type ProjectionReadPolicy } from './projection-read-policy.js'",
    "import { createProjectionReadPolicy } from './somewhere-else.js'",
  )
  assert.notEqual(droppedImport, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: droppedImport }), 'production read-policy wiring drifted')

  const perRequestRebuild = baseline.mainIndexText.replace(
    'let readPolicy: ProjectionReadPolicy | null = null',
    'let readPolicy: ProjectionReadPolicy | null = rebuiltEveryRequest',
  )
  assert.notEqual(perRequestRebuild, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: perRequestRebuild }), 'production read-policy wiring drifted')
})

test('the device state collection cannot silently revert to unavailable or open another collection (T03/A)', () => {
  const revertedCollection = baseline.mainAppServiceText.replace(
    "return candidate.collection === 'state'",
    "return candidate.collection === 'sealed'",
  )
  assert.notEqual(revertedCollection, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: revertedCollection }), 'projection-read main assembly is missing or bypassed')

  // A permissive variant (every collection allowed) must not satisfy the registered fact.
  const widenedCollection = baseline.mainAppServiceText.replace(
    "return candidate.collection === 'state'",
    "return candidate.collection !== 'never'",
  )
  assert.notEqual(widenedCollection, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: widenedCollection }), 'projection-read main assembly is missing or bypassed')
})
test('a read route cannot claim projection admission without its route wrapper', () => {
  const routeSkeletonText = baseline.routeSkeletonText.replace(
    'return runProjectionRead(\n      deps,\n      \'state.read\'',
    'return bypassProjectionRead(\n      deps,\n      \'state.read\'',
  )
  assert.notEqual(routeSkeletonText, baseline.routeSkeletonText)
  expectNamedFailure(check({ routeSkeletonText }), '/.sage/state')
})

test('the matrix cannot omit or falsely disable read admission', () => {
  const missing = JSON.parse(baseline.matrixText)
  delete missing.routes.find((route) => route.path === '/.sage/search').projectionReadAdmission
  expectNamedFailure(check({ matrixText: JSON.stringify(missing) }), '/.sage/search')

  const disabled = JSON.parse(baseline.matrixText)
  disabled.routes.find((route) => route.path === '/.sage/run-log').projectionReadAdmission.actual = false
  expectNamedFailure(check({ matrixText: JSON.stringify(disabled) }), '/.sage/run-log')
})

test('edit-drafts/create source-read admission cannot drift from its scope-bound resolver facts', () => {
  const missing = JSON.parse(baseline.matrixText)
  delete missing.routes.find((route) => route.path === '/.sage/edit-drafts/create').sourceReadAdmission
  expectNamedFailure(check({ matrixText: JSON.stringify(missing) }), '/.sage/edit-drafts/create')

  const operationDrift = baseline.routeSkeletonText.replace(
    "        'edit-drafts.create',\n        { kind: 'opaque', resource: 'file-reference', id: create.referenceId },",
    "        'edit-drafts.open',\n        { kind: 'opaque', resource: 'file-reference', id: create.referenceId },",
  )
  assert.notEqual(operationDrift, baseline.routeSkeletonText)
  expectNamedFailure(check({ routeSkeletonText: operationDrift }), 'edit-drafts/create must use operation edit-drafts.create')

  const scopeDrift = baseline.routeSkeletonText.replace(
    'matterRef: scope.matterRef',
    'matterRef: create.referenceId',
  )
  assert.notEqual(scopeDrift, baseline.routeSkeletonText)
  expectNamedFailure(check({ routeSkeletonText: scopeDrift }), 'edit-drafts/create provider matterRef must come from the admitted scope')

  const workspaceBindingDrift = baseline.mainAppServiceText.replace(
    '&& reference.workspaceRoot === scope.trustedWorkspaceRoot',
    '',
  )
  assert.notEqual(workspaceBindingDrift, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: workspaceBindingDrift }), 'file-reference resolver must bind workspaceRoot to trusted scope')

  const parserDrift = baseline.routeSkeletonText.replace(
    "if (keys.length !== 1 || !boundedRef(record.referenceId)) return undefined",
    "if (keys.length !== 2 || !boundedRef(record.referenceId)) return undefined",
  )
  assert.notEqual(parserDrift, baseline.routeSkeletonText)
  expectNamedFailure(check({ routeSkeletonText: parserDrift }), 'edit-drafts/create parser must accept exactly one key')
})

test('the home-page custodian cannot drift from its scope-bound wiring facts', () => {
  const unwiredCreate = baseline.mainIndexText.replace(
    'createMatter: (request) => matterCustody.createMatter(request),',
    '',
  )
  assert.notEqual(unwiredCreate, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: unwiredCreate }), 'index must wire createMatter to the custody provider')

  const stubQuery = baseline.mainIndexText.replace(
    'reconcileDraftCreation: (request: { readonly draftId: string, readonly correlation: string }) => matterCustody.reconcileCreation(request),',
    "reconcileDraftCreation: () => ({ state: 'unknown' as const, code: 'custodian-query-unavailable' }),",
  )
  assert.notEqual(stubQuery, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: stubQuery }), 'the placeholder custodian query must not return to index')

  const silentMerge = baseline.mainAppServiceText.replace(
    '...(options.createMatter === undefined ? {} : { createMatter: options.createMatter }),',
    'createMatter: options.createMatter,',
  )
  assert.notEqual(silentMerge, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: silentMerge }), 'app-service must merge createMatter only when explicitly provided')

  const appendDrift = baseline.matterCustodyText.replace(
    "expectedVersion: { kind: 'not-exists' }",
    "expectedVersion: { kind: 'exact', value: 0 }",
  )
  assert.notEqual(appendDrift, baseline.matterCustodyText)
  expectNamedFailure(check({ matterCustodyText: appendDrift }), 'custody must create only non-existent streams')

  const unknownDrift = baseline.matterCustodyText.replace(
    'return { unknown: true }',
    'return { receiptRef: matterId }',
  )
  assert.notEqual(unknownDrift, baseline.matterCustodyText)
  expectNamedFailure(check({ matterCustodyText: unknownDrift }), 'commit-unknown must answer outcome-unknown, never a receipt')

  const queryDrift = baseline.matterCustodyText.replaceAll(
    "state: 'unknown', code: 'custodian-query-unavailable'",
    "state: 'settled', matterRef: matterId",
  )
  assert.notEqual(queryDrift, baseline.matterCustodyText)
  expectNamedFailure(check({ matterCustodyText: queryDrift }), 'an unobservable custodian query must stay unknown')
})

test('the session-family identity step cannot drift from its gated wiring and registration facts', () => {
  const ungated = baseline.mainAppServiceText.replace(
    [
      'const identityPolicyPort = options.authority === undefined',
      '    ? undefined',
      '    : createSessionCoreIdentityPort({ vault: options.vault, authority: options.authority })',
    ].join('\n'),
    'const identityPolicyPort = createSessionCoreIdentityPort({ vault: options.vault, authority: options.authority })',
  )
  assert.notEqual(ungated, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: ungated }), 'session-core identity step must be wired only behind the instance authority option')

  const unregistered = baseline.actionAuthorityTableText.replace("  'session.send': Object.freeze({", '')
  assert.notEqual(unregistered, baseline.actionAuthorityTableText)
  expectNamedFailure(check({ actionAuthorityTableText: unregistered }), 'session.send must be registered in the action authority table')

  const scopeDrift = baseline.actionAuthorityTableText.replace("actionScope: 'session.prompt'", "actionScope: 'session.any'")
  assert.notEqual(scopeDrift, baseline.actionAuthorityTableText)
  expectNamedFailure(check({ actionAuthorityTableText: scopeDrift }), 'session.send action scope must stay session.prompt')

  const notReadyDrift = baseline.sessionCoreIdentityText.replace(
    "if (ACTION_AUTHORITY_TABLE[intent.operation] === undefined) return { state: 'unavailable' }",
    "if (ACTION_AUTHORITY_TABLE[intent.operation] === undefined) return { state: 'denied' }",
  )
  assert.notEqual(notReadyDrift, baseline.sessionCoreIdentityText)
  expectNamedFailure(check({ sessionCoreIdentityText: notReadyDrift }), 'an unregistered session-family operation must answer not-ready before any policy read')

  const denialDrift = baseline.sessionCoreIdentityText.replace(
    "if (resolution.kind !== 'authorized') return { state: 'denied' }",
    "if (resolution.kind !== 'authorized') return { state: 'unavailable' }",
  )
  assert.notEqual(denialDrift, baseline.sessionCoreIdentityText)
  expectNamedFailure(check({ sessionCoreIdentityText: denialDrift }), 'a non-authorized resolution must map to a denial')

  const unwiredResolve = baseline.sessionCoreIdentityText.replace(
    'const resolution = runtime.resolve(assembled.request)',
    'const resolution = { kind: \'authorized\' as const }',
  )
  assert.notEqual(unwiredResolve, baseline.sessionCoreIdentityText)
  expectNamedFailure(check({ sessionCoreIdentityText: unwiredResolve }), 'the session-core assembly and kernel resolve must stay wired')
})

test('the bundled capability registry wiring cannot drift from its seal and empty-set facts', () => {
  const unwiredPort = baseline.mainIndexText.replace(
    'registry: { read: () => bundledRegistry.read() },',
    '',
  )
  assert.notEqual(unwiredPort, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: unwiredPort }), 'index must wire the bundled registry into the runtime inventory provider')

  const unwiredConstruction = baseline.mainIndexText.replace(
    'loadSessionPromptCapabilityRegistry()',
    'undefined',
  )
  assert.notEqual(unwiredConstruction, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: unwiredConstruction }), 'index must load the published registry snapshot and pass its body to the bundled factory')

  const loaderDrift = baseline.publicationBundleText.replace(
    'resealed.value.snapshotId !== snapshot.snapshotId',
    'false',
  )
  assert.notEqual(loaderDrift, baseline.publicationBundleText)
  expectNamedFailure(check({ publicationBundleText: loaderDrift }), 'the registry publication loader must kernel-parse and prove the seal round trip')

  const unsealed = baseline.capabilityRegistryProviderText.replace(
    'sealCapabilityRegistrySnapshot(snapshotBody)',
    'snapshotBody',
  )
  assert.notEqual(unsealed, baseline.capabilityRegistryProviderText)
  expectNamedFailure(check({ capabilityRegistryProviderText: unsealed }), 'the bundled registry provider must seal through the kernel')

  const openRead = baseline.capabilityRegistryProviderText.replace(
    'if (!sealed.ok) throw new Error',
    'if (sealed.ok) throw new Error',
  )
  assert.notEqual(openRead, baseline.capabilityRegistryProviderText)
  expectNamedFailure(check({ capabilityRegistryProviderText: openRead }), 'an unsealable bundled registry must fail closed on read')

  const nonEmpty = baseline.capabilityRegistryProviderText.replace(
    'entries: Object.freeze([] as CapabilityRegistryEntryBodyV1[])',
    'entries: Object.freeze([{ forged: true }] as never)',
  )
  assert.notEqual(nonEmpty, baseline.capabilityRegistryProviderText)
  expectNamedFailure(check({ capabilityRegistryProviderText: nonEmpty }), 'the bundled first snapshot must stay the empty internal set')
})

test('the first session-prompt publication cannot drift from the owner-approved content', () => {
  const statementDrift = baseline.sessionPromptPublicationText.replace(
    "statement: '实例操作员（role:owner）可发起 session.prompt。',",
    "statement: 'anyone may prompt.',",
  )
  assert.notEqual(statementDrift, baseline.sessionPromptPublicationText)
  expectNamedFailure(check({ sessionPromptPublicationText: statementDrift }), 'the permission policy statement must stay the owner-approved text')

  const identityDrift = baseline.sessionPromptPublicationText.replace(
    "requirementId: 'requirement:sage-session-prompt',",
    "requirementId: 'requirement:sage-other',",
  )
  assert.notEqual(identityDrift, baseline.sessionPromptPublicationText)
  expectNamedFailure(check({ sessionPromptPublicationText: identityDrift }), 'the first requirement identity and version must stay the approved plan')

  const actionDrift = baseline.sessionPromptPublicationText.replace(
    "Object.freeze({ actionScope: 'session.prompt', effectClass: 'external-write' as const, requiresDecision: false }),",
    "Object.freeze({ actionScope: 'session.any', effectClass: 'external-write' as const, requiresDecision: false }),",
  )
  assert.notEqual(actionDrift, baseline.sessionPromptPublicationText)
  expectNamedFailure(check({ sessionPromptPublicationText: actionDrift }), 'the first action requirement must stay the approved session.prompt tuple')

  const decisionDrift = baseline.sessionPromptPublicationText.replace(
    "decisionId: 'decision:sage-t05-first-session-prompt',",
    "decisionId: 'decision:sage-tbd',",
  )
  assert.notEqual(decisionDrift, baseline.sessionPromptPublicationText)
  expectNamedFailure(check({ sessionPromptPublicationText: decisionDrift }), 'the first publication decision must stay the owner decision')

  const unsealed = baseline.sessionPromptPublicationText.replace(
    'sealCandidateTargetRequirement(candidate, SESSION_PROMPT_PUBLICATION_DECISION)',
    'candidate',
  )
  assert.notEqual(unsealed, baseline.sessionPromptPublicationText)
  expectNamedFailure(check({ sessionPromptPublicationText: unsealed }), 'the publication must seal through the candidate line and the kernel')
})

test('the real target step cannot drift from its gated wiring or unavailable-first mapping', () => {
  const ungated = baseline.mainAppServiceText.replace(
    'options.authority === undefined || options.requirementBundle === undefined',
    'false',
  )
  assert.notEqual(ungated, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: ungated }), 'the real target step must be wired only behind the requirement-bundle option')

  const startupDrift = baseline.mainIndexText.replace(
    'const requirementBundle = loadSessionPromptRequirementBundle()',
    'const requirementBundle = undefined',
  )
  assert.notEqual(startupDrift, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: startupDrift }), 'index must load the requirement bundle once at startup')

  const denialDrift = baseline.sessionPromptTargetText.replace(
    "if (provider === undefined || snapshot === undefined) return { state: 'unavailable' }",
    "if (provider === undefined || snapshot === undefined) return { state: 'denied' }",
  )
  assert.notEqual(denialDrift, baseline.sessionPromptTargetText)
  expectNamedFailure(check({ sessionPromptTargetText: denialDrift }), 'a missing or failing target must map to unavailable, never a policy denial')

  const refDrift = baseline.sessionPromptTargetText.replace(
    '`target:${resolved.snapshotId}:${resolved.requirement.requirementDigest}`',
    "'target:any'",
  )
  assert.notEqual(refDrift, baseline.sessionPromptTargetText)
  expectNamedFailure(check({ sessionPromptTargetText: refDrift }), 'the target ref must bind the snapshot id and requirement digest')

  const unparsed = baseline.publicationBundleText.replace(
    'parseCompatibilityTargetRequirementSnapshot(',
    'JSON.parse(',
  )
  assert.notEqual(unparsed, baseline.publicationBundleText)
  expectNamedFailure(check({ publicationBundleText: unparsed }), 'the bundle loader must validate through the C2.2T kernel parse')
})

test('the real compatibility step cannot drift from its gated wiring or evaluation instant', () => {
  const ungated = baseline.mainAppServiceText.replace(
    'options.revisionDigest === undefined',
    'false',
  )
  assert.notEqual(ungated, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: ungated }), 'the compatibility step must be wired only behind all main-owned inputs')

  const nowDrift = baseline.sessionPromptCompatibilityText.replace(
    'const evaluatedAt = observation.evidence.observedAt',
    'const evaluatedAt = options.now()',
  )
  assert.notEqual(nowDrift, baseline.sessionPromptCompatibilityText)
  expectNamedFailure(check({ sessionPromptCompatibilityText: nowDrift }), 'compatibility must evaluate at the last trusted observation instant (ADR-0284)')

  const denialDrift = baseline.sessionPromptCompatibilityText.replace(
    "if (resolved.outcome === 'requires-new-revision') return { state: 'denied' }",
    "if (resolved.outcome === 'requires-new-revision') return { state: 'unavailable' }",
  )
  assert.notEqual(denialDrift, baseline.sessionPromptCompatibilityText)
  expectNamedFailure(check({ sessionPromptCompatibilityText: denialDrift }), 'only a published requires-new-revision rule may deny; everything else answers unavailable')

  const unadapted = baseline.sessionPromptCompatibilityText.replace(
    'toCompatibilityMatrixV2ProviderResult(matrix)',
    'matrix',
  )
  assert.notEqual(unadapted, baseline.sessionPromptCompatibilityText)
  expectNamedFailure(check({ sessionPromptCompatibilityText: unadapted }), 'the compatibility port must compose the exact V2 resolve input through the kernel adapters')
})

test('the real registry step cannot drift from its gated wiring, bindings or denial taxonomy', () => {
  const ungated = baseline.mainAppServiceText.replace(
    'options.capabilityRegistry === undefined',
    'false',
  )
  assert.notEqual(ungated, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: ungated }), 'the registry step must be wired only behind the bundle, the provider and the observation')

  const secondSource = baseline.mainIndexText.replace(
    'capabilityRegistry: bundledRegistry,',
    'capabilityRegistry: createBundledCapabilityRegistryProvider(),',
  )
  assert.notEqual(secondSource, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: secondSource }), 'index must hand the admission step the SAME published-snapshot provider instance')

  const reSourced = baseline.sessionPromptRegistryText.replace(
    'parseCapabilityRegistrySnapshot(sealed)',
    'createBundledCapabilityRegistryProvider(sealed)',
  )
  assert.notEqual(reSourced, baseline.sessionPromptRegistryText)
  expectNamedFailure(check({ sessionPromptRegistryText: reSourced }), 'the registry step must kernel-parse the provider bytes')

  const unbound = baseline.sessionPromptRegistryText.replace(
    'contentDigestOf(snapshot.snapshotId) !== observation.evidence.registrySnapshotDigest',
    'false',
  )
  assert.notEqual(unbound, baseline.sessionPromptRegistryText)
  expectNamedFailure(check({ sessionPromptRegistryText: unbound }), 'the registry step must bind the admitted snapshot generation (ADR-0286)')

  const denyDrift = baseline.sessionPromptRegistryText.replace(
    "if (entry.state === 'disabled' || entry.state === 'revoked') return { state: 'denied' }",
    "if (entry.state === 'candidate') return { state: 'denied' }",
  )
  assert.notEqual(denyDrift, baseline.sessionPromptRegistryText)
  expectNamedFailure(check({ sessionPromptRegistryText: denyDrift }), 'only disabled / revoked entries may deny; candidate and mismatches answer unavailable')

  const refDrift = baseline.sessionPromptRegistryText.replace(
    'mapping:${snapshot.snapshotId}:${mappingDigest}',
    'mapping:${mappingDigest}',
  )
  assert.notEqual(refDrift, baseline.sessionPromptRegistryText)
  expectNamedFailure(check({ sessionPromptRegistryText: refDrift }), 'the mapping ref must bind the sealed snapshot id and the adapter mapping digest')

  const secondForma = baseline.runtimeInventoryProviderText.replace(
    "from './capability-entry-derivation.js'",
    "from './capability-entry-derivation-local.js'",
  )
  assert.notEqual(secondForma, baseline.runtimeInventoryProviderText)
  expectNamedFailure(check({ runtimeInventoryProviderText: secondForma }), 'the derivation forma must stay single-sourced across the inventory producer and the registry step')
})

test('the real preflight step cannot drift from its gated wiring, live validation or verdict set', () => {
  const ungated = baseline.mainAppServiceText.replace(
    'options.requirementBundle === undefined || options.runtimeEffective === undefined',
    'false',
  )
  assert.notEqual(ungated, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: ungated }), 'the preflight step must be wired only behind the bundle and the live runtime read')

  const unvalidated = baseline.sessionPromptPreflightText.replace(
    'isRuntimeEffectiveObservation(live)',
    'true',
  )
  assert.notEqual(unvalidated, baseline.sessionPromptPreflightText)
  expectNamedFailure(check({ sessionPromptPreflightText: unvalidated }), 'the preflight step must validate the live runtime-effective observation')

  const observedDrift = baseline.sessionPromptPreflightText.replace(
    "if (live.kind !== 'observed') return { state: 'unavailable' }",
    "if (live.kind === 'nothing') return { state: 'unavailable' }",
  )
  assert.notEqual(observedDrift, baseline.sessionPromptPreflightText)
  expectNamedFailure(check({ sessionPromptPreflightText: observedDrift }), 'a non-observed runtime must answer unavailable, never allowed')

  const denialDrift = baseline.sessionPromptPreflightText.replace(
    "if (live.kind !== 'observed') return { state: 'unavailable' }",
    "if (live.kind !== 'observed') return { state: 'denied' }",
  )
  assert.notEqual(denialDrift, baseline.sessionPromptPreflightText)
  expectNamedFailure(check({ sessionPromptPreflightText: denialDrift }), 'the preflight step never denies and never stales; a missing runtime answers unavailable')

  const guardDrift = baseline.sessionPromptPreflightText.replace(
    "!registry.mappingRef.startsWith('mapping:')",
    'false',
  )
  assert.notEqual(guardDrift, baseline.sessionPromptPreflightText)
  expectNamedFailure(check({ sessionPromptPreflightText: guardDrift }), 'the preflight step must refuse a malformed mapping ref before reading the Host')

  const domainDrift = baseline.sessionPromptPreflightText.replace(
    "const domain = 'urn:sage:preflight:v1:'",
    "const domain = 'urn:sage:preflight:v2:'",
  )
  assert.notEqual(domainDrift, baseline.sessionPromptPreflightText)
  expectNamedFailure(check({ sessionPromptPreflightText: domainDrift }), 'the preflight ref must carry its own domain-separated namespace')
})

test('the real persistence step cannot drift from its wiring, identity, re-verification or atomic append', () => {
  const ungated = baseline.mainAppServiceText.replace(
    '|| options.sessionPromptAttempts === undefined\n      || reverifyReads === undefined',
    '|| false',
  )
  assert.notEqual(ungated, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: ungated }), 'the persistence step must be wired only behind the store handle and every main-owned input')

  // Re-introducing the pre-ADR-0288 defect: the constant caller correlation as the requestId.
  const identityDrift = baseline.compositionText.replace(
    'requestId: randomUUID(),',
    'requestId: correlation,',
  )
  assert.notEqual(identityDrift, baseline.compositionText)
  expectNamedFailure(check({ compositionText: identityDrift }), 'the operation identity must be service-issued per request, never the caller correlation')

  const evidenceDrop = baseline.sessionPromptCompatibilityText.replace(
    'evidence: built.evidence,',
    'evidence: undefined,',
  )
  assert.notEqual(evidenceDrop, baseline.sessionPromptCompatibilityText)
  expectNamedFailure(check({ sessionPromptCompatibilityText: evidenceDrop }), 'the compatibility step must seal and carry the evaluation evidence it admitted')

  const digestDrift = baseline.sessionPromptReverifyText.replace(
    'storeRevisionDigest !== admitted.revisionDigest',
    'false',
  )
  assert.notEqual(digestDrift, baseline.sessionPromptReverifyText)
  expectNamedFailure(check({ sessionPromptReverifyText: digestDrift }), 'the shared re-verification must check current revision, frame agreement and the store-validated revision digest')

  const domainBypass = baseline.sessionPromptPersistenceText.replace(
    'startAttempt(reverified.matter, {',
    'buildAttemptPayload(reverified.matter, {',
  )
  assert.notEqual(domainBypass, baseline.sessionPromptPersistenceText)
  expectNamedFailure(check({ sessionPromptPersistenceText: domainBypass }), 'the attempt event payload must be authored by the domain kernel')

  const unknownAllowed = baseline.sessionPromptPersistenceText.replace(
    "      case 'appended':",
    "      case 'commit-unknown':\n      case 'appended':",
  )
  assert.notEqual(unknownAllowed, baseline.sessionPromptPersistenceText)
  expectNamedFailure(check({ sessionPromptPersistenceText: unknownAllowed }), 'commit-unknown must fail closed, never proceed to dispatch')

  const secondWrite = baseline.sessionPromptPersistenceText.replace(
    'options.attempts.appendAttempt(',
    'options.attempts.append(',
  )
  assert.notEqual(secondWrite, baseline.sessionPromptPersistenceText)
  expectNamedFailure(check({ sessionPromptPersistenceText: secondWrite }), 'the persistence step must append through the store handle, never a second write path')
})

test('the real dispatch step cannot drift from its wiring, guard order, ref equality or outcome mapping', () => {
  const ungated = baseline.mainAppServiceText.replace(
    '|| options.matterLinks === undefined',
    '|| false',
  )
  assert.notEqual(ungated, baseline.mainAppServiceText)
  expectNamedFailure(check({ mainAppServiceText: ungated }), 'the dispatch step must be wired only behind the channel and every re-verification input')

  const evidenceDrop = baseline.protectedEffectAdmissionText.replace(
    '...(compatibilityStep.value.evidence === undefined ? {} : { evidence: compatibilityStep.value.evidence }),',
    '',
  )
  assert.notEqual(evidenceDrop, baseline.protectedEffectAdmissionText)
  expectNamedFailure(check({ protectedEffectAdmissionText: evidenceDrop }), 'the admitted evidence must survive the admission seam')

  const detailGuardDrop = baseline.protectedEffectAdmissionText.replace(
    '|| (dispatchResult.detail !== undefined && !isSessionCoreDispatchDetail(dispatchResult.detail))',
    '',
  )
  assert.notEqual(detailGuardDrop, baseline.protectedEffectAdmissionText)
  expectNamedFailure(check({ protectedEffectAdmissionText: detailGuardDrop }), 'a malformed receipt detail must be the conservative unknown')

  const refusalSwallowed = baseline.protectedEffectAdmissionText.replace(
    "dispatchResult.state === 'refused' && isRef(dispatchResult.code)",
    'false',
  )
  assert.notEqual(refusalSwallowed, baseline.protectedEffectAdmissionText)
  expectNamedFailure(check({ protectedEffectAdmissionText: refusalSwallowed }), 'a determinate channel refusal must surface with its own code')

  const notDispatchedBreak = baseline.protectedEffectAdmissionText.replace(
    "if (isRecord(dispatchResult) && dispatchResult.state === 'not-dispatched') {",
    'if (false) {',
  )
  assert.notEqual(notDispatchedBreak, baseline.protectedEffectAdmissionText)
  expectNamedFailure(check({ protectedEffectAdmissionText: notDispatchedBreak }), 'a pre-call refusal must stay retryable, never outcome-unknown')

  const detailDrop = baseline.compositionText.replace(
    "admission.detail?.kind === 'session-send-accepted'",
    'false',
  )
  assert.notEqual(detailDrop, baseline.compositionText)
  expectNamedFailure(check({ compositionText: detailDrop }), 'the route must map the receipt detail to the channel outcome')

  const refCompareDrop = baseline.sessionPromptDispatchText.replace(
    'reTarget.value.targetRef !== target.targetRef',
    'false',
  )
  assert.notEqual(refCompareDrop, baseline.sessionPromptDispatchText)
  expectNamedFailure(check({ sessionPromptDispatchText: refCompareDrop }), 'the dispatch step must re-run the cheap real ports and require ref equality')

  const closureWrite = baseline.sessionPromptDispatchText.replace(
    'options.sessionSend({',
    'startAttempt(); options.sessionSend({',
  )
  assert.notEqual(closureWrite, baseline.sessionPromptDispatchText)
  expectNamedFailure(check({ sessionPromptDispatchText: closureWrite }), 'dispatch v1 writes no domain closure events (turn-close is the registered ticket)')
})

test('the governed prepare write cannot drift from its registration, witness, order or refusal family', () => {
  const unregistered = baseline.actionAuthorityTableText.replace(
    "'session.prepare': Object.freeze({",
    "'session.prepare-x': Object.freeze({",
  )
  assert.notEqual(unregistered, baseline.actionAuthorityTableText)
  expectNamedFailure(check({ actionAuthorityTableText: unregistered }), 'session.prepare must be registered in the action authority table as a local write')

  const witnessDrift = baseline.sessionPromptPrepareText.replace(
    "{ source: 'user-input' }",
    "{ source: 'ui-reported' }",
  )
  assert.notEqual(witnessDrift, baseline.sessionPromptPrepareText)
  expectNamedFailure(check({ sessionPromptPrepareText: witnessDrift }), 'the user explicit input and selection are the prepare witnesses')

  const policyDrop = baseline.sessionPromptPrepareText.replace(
    'requirement.actionRequirements.map(',
    '[].map(',
  )
  assert.notEqual(policyDrop, baseline.sessionPromptPrepareText)
  expectNamedFailure(check({ sessionPromptPrepareText: policyDrop }), "the revision's run policies must project the requirement declaration")

  const orderBreak = baseline.sessionPromptPrepareText.replace(
    'options.ports.verifyCaller!(',
    'options.ports.matchCandidate!(',
  )
  assert.notEqual(orderBreak, baseline.sessionPromptPrepareText)
  expectNamedFailure(check({ sessionPromptPrepareText: orderBreak }), 'the prepare runner must run the front ports in their chain order')

  const familyFlat = baseline.sessionPromptPrepareText.replaceAll(
    'code: FAILURE_CODES[step.state]',
    'code: FAILURE_CODES.unavailable',
  )
  assert.notEqual(familyFlat, baseline.sessionPromptPrepareText)
  expectNamedFailure(check({ sessionPromptPrepareText: familyFlat }), 'port failures must keep their per-state protected-effect refusal family')

  const overGating = baseline.sessionPromptPrepareText.replace(
    'const decision = decideRunRevision(options, matterRef)',
    'const decision = { state: ' + "'needed'" + ' } as never',
  )
  assert.notEqual(overGating, baseline.sessionPromptPrepareText)
  expectNamedFailure(check({ sessionPromptPrepareText: overGating }), 'the prepare decision must run before the guard sequence')

  const declineSwallow = baseline.sessionPromptPrepareText.replace(
    "return { state: 'refused', code: 'session-prepare-declined' }",
    "return { state: 'not-needed' }",
  )
  assert.notEqual(declineSwallow, baseline.sessionPromptPrepareText)
  expectNamedFailure(check({ sessionPromptPrepareText: declineSwallow }), 'a domain decline must answer honestly, never as prepared')

  const scopeCreep = baseline.sessionPromptPrepareText.replace(
    "const sendTable = ACTION_AUTHORITY_TABLE['session.send']",
    "resolveCompatibility(); const sendTable = ACTION_AUTHORITY_TABLE['session.send']",
  )
  assert.notEqual(scopeCreep, baseline.sessionPromptPrepareText)
  expectNamedFailure(check({ sessionPromptPrepareText: scopeCreep }), 'a local preparation write must not reach the external-effect surfaces')

  const hookRemoval = baseline.compositionText.replace(
    'options.prepareSessionPrompt !== undefined',
    'false',
  )
  assert.notEqual(hookRemoval, baseline.compositionText)
  expectNamedFailure(check({ compositionText: hookRemoval }), 'the send route must run the prepare runner first and stop on its refusal')
})

test('the selection-time ensure cannot drift from its order, refusal, grant check or wiring', () => {
  const orderBreak = baseline.activeMatterSelectionText.replace(
    'request.ports.ensureRunnableRevision!({ matterId: candidate.matterId })',
    'request.ports.resolveCurrentRevision({ matterId: candidate.matterId })',
  )
  assert.notEqual(orderBreak, baseline.activeMatterSelectionText)
  expectNamedFailure(check({ activeMatterSelectionText: orderBreak }), 'the ensure must run after read authorization and before the current-revision read')

  const refusalSwallow = baseline.activeMatterSelectionText.replace(
    "if (ensured === undefined || ensured.state === 'refused') return refused('revision-ensure-refused')",
    "if (false) return refused('revision-ensure-refused')",
  )
  assert.notEqual(refusalSwallow, baseline.activeMatterSelectionText)
  expectNamedFailure(check({ activeMatterSelectionText: refusalSwallow }), 'an ensure refusal must stop the selection, never bind it')

  const grantBypass = baseline.sessionPromptPrepareText.replace(
    'identityPolicy({ intent, correlation: options.correlation }',
    'identityPolicy({ intent }',
  )
  assert.notEqual(grantBypass, baseline.sessionPromptPrepareText)
  expectNamedFailure(check({ sessionPromptPrepareText: grantBypass }), 'the selection ensure must re-check the prepare grant through the identity port')

  const selectionWitnessDrift = baseline.sessionPromptPrepareText.replace(
    "{ source: 'user-selection' }",
    "{ source: 'user-input' }",
  )
  assert.notEqual(selectionWitnessDrift, baseline.sessionPromptPrepareText)
  expectNamedFailure(check({ sessionPromptPrepareText: selectionWitnessDrift }), 'the user explicit input and selection are the prepare witnesses')

  const unwire = baseline.mainIndexText.replace('ensureRunnableRevision: prepareEnsure,', '')
  assert.notEqual(unwire, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: unwire }), 'index must hand the selection kernel the governed ensure')
})

test('the turn-end closure cannot drift from its edge key, taxonomy, order or idempotency', () => {
  const kindKey = baseline.mainIndexText.replace(
    'observePostTurn(matterRef, status.lastTurnEndEdge, status.lastTurnEnd)',
    'observePostTurn(matterRef, status.lastTurnEnd, status.lastTurnEnd)',
  )
  assert.notEqual(kindKey, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: kindKey }), 'the post-turn observer must key on the edge, not the bare kind')

  const edgeDrop = baseline.sessionChannelText.replace(
    'lastTurnEndEdge: `${seq}:${turnEndKind(data)}`',
    'lastTurnEndEdge: turnEndKind(data)',
  )
  assert.notEqual(edgeDrop, baseline.sessionChannelText)
  expectNamedFailure(check({ sessionChannelText: edgeDrop }), 'the session fold must expose the cursor-keyed turn-end edge')

  const blockedCloses = baseline.sessionTurnCloseText.replace(
    'if (!SUCCESS_KINDS.has(endKind) && !FAILURE_KINDS.has(endKind)) return',
    '',
  )
  assert.notEqual(blockedCloses, baseline.sessionTurnCloseText)
  expectNamedFailure(check({ sessionTurnCloseText: blockedCloses }), 'blocked and unknown kinds must leave the attempt open')

  const successAsFailure = baseline.sessionTurnCloseText.replace(
    "const SUCCESS_KINDS = new Set(['completed'])",
    "const SUCCESS_KINDS = new Set(['nothing'])",
  )
  assert.notEqual(successAsFailure, baseline.sessionTurnCloseText)
  expectNamedFailure(check({ sessionTurnCloseText: successAsFailure }), 'the closure taxonomy must keep completed light and error kinds as failures')

  const appendIdDrift = baseline.sessionTurnCloseText.replace(
    'turn-close:${attemptId}:${endKind}',
    'turn-close:${endKind}',
  )
  assert.notEqual(appendIdDrift, baseline.sessionTurnCloseText)
  expectNamedFailure(check({ sessionTurnCloseText: appendIdDrift }), 'the closure append must be idempotent per attempt and kind')

  const orderSwap = baseline.mainIndexText.replace(
    '    if (kind !== null && kind !== \'\') {\n      void sessionTurnClose({ matterRef, endKind: kind }).catch(() => undefined)\n    }',
    '',
  )
  assert.notEqual(orderSwap, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: orderSwap }), 'the turn-end closure must run before the artifact observation')
})

test('the send-path reconcile cannot drift from its order, gates or shared closure', () => {
  const unwired = baseline.compositionText.replace(
    'await options.reconcileSessionAttempt({ matterRef: request.matterRef })',
    'await Promise.resolve()',
  )
  assert.notEqual(unwired, baseline.compositionText)
  expectNamedFailure(check({ compositionText: unwired }), 'the send-path reconcile must run before the prepare runner')

  const interrupt = baseline.sessionSendReconcileText.replace(
    "if (fold.execution === 'executing') return",
    '',
  )
  assert.notEqual(interrupt, baseline.sessionSendReconcileText)
  expectNamedFailure(check({ sessionSendReconcileText: interrupt }), 'the reconcile must never interrupt a running turn')

  const reimplemented = baseline.sessionSendReconcileText.replace(
    'await options.close({ matterRef, endKind: fold.lastTurnEnd })',
    'void options.close',
  )
  assert.notEqual(reimplemented, baseline.sessionSendReconcileText)
  expectNamedFailure(check({ sessionSendReconcileText: reimplemented }), 'the reconcile must reuse the closure runner, never a second write path')

  const unwireIndex = baseline.mainIndexText.replace('close: sessionTurnClose,', '')
  assert.notEqual(unwireIndex, baseline.mainIndexText)
  expectNamedFailure(check({ mainIndexText: unwireIndex }), 'the reconcile must be an injectable option wired from the same closure runner')
})

test('main assembly and request-scoped owner cannot be replaced by a process-global current matter', () => {
  const mainAppServiceText = baseline.mainAppServiceText.replace(
    'runProjectionRead: createProjectionReadRunner(options)',
    'runProjectionRead: bypassProjectionRead(options)',
  )
  expectNamedFailure(check({ mainAppServiceText }), 'projection-read main assembly')

  const mainIndexText = baseline.mainIndexText.replace(
    'const scope = projectionReadScope.current()',
    'const scope = currentMatterRef()',
  )
  expectNamedFailure(check({ mainIndexText }), 'projection-read request owner')
})

test('an unregistered protected route claiming compliance while bypassing runCommand fails', () => {
  const matrix = JSON.parse(baseline.matrixText)
  matrix.routes.find((route) => route.path === '/.sage/matter/link').currentAuthority.status = 'compliant'
  expectNamedFailure(check({ matrixText: JSON.stringify(matrix) }), '/.sage/matter/link')
})

test('removing runCommand from dispatch fails even if the route registry still claims it', () => {
  const compositionText = baseline.compositionText.replace('const result = runCommand({\n        intent,', 'const result = options.commandPorts({\n        intent,')
  assert.notEqual(compositionText, baseline.compositionText)
  expectNamedFailure(check({ compositionText }), '/.sage/actions')
})

test('CB1 cannot be promoted beyond its source checks', () => {
  const matrix = JSON.parse(baseline.matrixText)
  matrix.callerBindings.CB1.status = 'complete'
  expectNamedFailure(check({ matrixText: JSON.stringify(matrix) }), 'CB1')

  const callerBindingText = baseline.callerBindingText.replace(
    "if (origin !== null && origin !== SAGE_APP_ORIGIN) return null",
    "if (origin !== SAGE_APP_ORIGIN) return null",
  )
  expectNamedFailure(check({ callerBindingText }), 'CB1 source')
})

test('mixed unsupported operations are immutable policy facts', () => {
  const matrix = JSON.parse(baseline.matrixText)
  matrix.routes.find((route) => route.path === '/.sage/plans').unsupportedOperations = []
  expectNamedFailure(check({ matrixText: JSON.stringify(matrix) }), '/.sage/plans')
})
