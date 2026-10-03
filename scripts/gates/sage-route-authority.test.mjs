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
})

const check = (patch = {}) => checkSageRouteAuthority({ ...baseline, ...patch })
const expectNamedFailure = (result, needle) => {
  assert.equal(result.status, 'fail', JSON.stringify(result))
  assert.equal(result.expected, 58)
  assert.equal(result.expected, result.checked + result.skipped + result.failed)
  assert.ok(result.violations.some((violation) => violation.includes(needle)), JSON.stringify(result.violations))
}

test('current 58-route registry matches source without claiming product availability', () => {
  const result = check()
  assert.equal(result.status, 'pass', JSON.stringify(result))
  assert.deepEqual(
    { expected: result.expected, discovered: result.discovered, checked: result.checked, skipped: result.skipped, failed: result.failed },
    { expected: 58, discovered: 58, checked: 58, skipped: 0, failed: 0 },
  )
  assert.match(result.note, /13 read-only routes enter projection-read admission/)
  assert.match(result.note, /23 protected-effect bypasses remain registered as violations/)
  assert.match(result.note, /18 direct-provider bypasses/)
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

test('the explicit context selection route cannot claim compliance without its source fact', () => {
  const compositionText = baseline.compositionText.replace(
    'const select = options.selectActiveMatter',
    'const select = options.bypassActiveMatterSelection',
  )
  assert.notEqual(compositionText, baseline.compositionText)
  expectNamedFailure(check({ compositionText }), '/.sage/context/select')
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
