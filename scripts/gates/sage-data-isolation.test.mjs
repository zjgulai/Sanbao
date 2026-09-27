import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkSageDataIsolation, collectSageDataIsolationFiles } from './sage-data-isolation.mjs'

const PATHS_FILE = 'apps/sage-shell/src/profile/paths.ts'
const LAYOUT_FILE = 'apps/sage-shell/src/profile/layout.ts'
const RUNTIME_FILE = 'apps/sage-shell/src/main/runtime.ts'
const MAIN_FILE = 'apps/sage-shell/src/main/index.ts'
const HOST_PROCESS_FILE = 'apps/sage-shell/src/main/host-process.ts'
const HOST_FILE = 'apps/sage-shell/src/host/index.ts'
const MATERIALIZE_SCRIPT = 'apps/sage-shell/scripts/materialize.mjs'
const PREVIEW_SCRIPT = 'apps/sage-shell/scripts/preview.mjs'
const SMOKE_SCRIPT = 'apps/sage-shell/scripts/smoke.mjs'

const source = {
  [PATHS_FILE]: `
export function resolveSagePaths(input) {
  const home = input.home
  const legacyDshRoot = join(home, '.dsh')
  const root = join(home, 'Library', 'Application Support', 'Sage')
  assertSafeRoot(root, legacyDshRoot)
  const harnessHome = join(root, 'harness')
  const profilesDir = join(harnessHome, 'profiles')
  return { root, harnessHome, profilesDir }
}
export async function ensureSageDirectories(paths) {
  const realRoot = paths.root
  const legacyDshRoot = legacyDshRootOf(paths)
  assertSafeRoot(realRoot, legacyDshRoot)
}
export function ensureSageDirectoriesSync(paths) { return paths }
function legacyDshRootOf(paths) {
  const physicalHome = paths.home
  return join(physicalHome, '.dsh')
}
assertSafeRoot(canonicalPathBeforeCreation(paths.root), legacyDshRootOf(paths))
export async function assertActiveProfile(paths, profileDir) { return { profileDir } }
throw new Error('legacy ~/.dsh root')
`,
  [LAYOUT_FILE]: `
export { HOST_DIR_NAME } from './paths.js'
export function defaultProfileDir(home) { return resolveSagePaths({ home }).profilesDir }
`,
  [RUNTIME_FILE]: `
export function resolveHostRuntime(input) {
  const env = {}
  for (const [name, value] of Object.entries(input.env)) {
    if (name.startsWith('LUTE_SHELL_')) continue
    if (name.startsWith('SAGE_')) continue
    if (name === 'DSH_HOME') continue
    env[name] = value
  }
  env.DSH_HOME = input.paths.harnessHome
  return {
    node: input.env.SAGE_NODE_BINARY ?? input.execPath,
    sageRoot: input.paths.root,
    profileDir: input.activeProfile.profileDir,
    env,
  }
}
`,
  [MAIN_FILE]: `
function configureElectronPaths(paths) {
  const electron = resolveSageElectronPaths(paths)
  app.setPath('userData', electron.userData)
  app.setPath('sessionData', electron.sessionData)
  app.setPath('crashDumps', electron.crashDumps)
  app.setAppLogsPath(electron.logs)
}
async function bootstrap() {
  const paths = resolveSagePaths({ home: homedir() })
  ensureSageDirectoriesSync(paths)
  configureElectronPaths(paths)
  await app.whenReady()
}
`,
  [HOST_PROCESS_FILE]: `
const child = spawn(this.runtime.node, [this.runtime.entry, this.runtime.sageRoot, this.runtime.profileDir], {})
`,
  [HOST_FILE]: `
export function routeRequest(pathname) {
  if (pathname.startsWith('/.dsh/')) return 'rejected'
  return 'assets'
}
export async function startHostProcess(argv) {
  const sageRoot = argv[2]
  const requestedProfileDir = argv[3]
  const paths = resolveSagePaths({ home: homedir(), root: sageRoot })
  const activeProfile = await assertActiveProfile(paths, requestedProfileDir)
  const profileDir = activeProfile.profileDir
  const controller = await runShellHost({ profileDir, overlayPatchPath, writeResponse })
  return controller
}
`,
  [MATERIALIZE_SCRIPT]: `
const root = process.env.SAGE_ROOT
const paths = resolveSagePaths({ home: homedir(), ...(root === undefined ? {} : { root }) })
await ensureSageDirectories(paths)
`,
  [PREVIEW_SCRIPT]: `
const root = process.env.SAGE_ROOT ?? resolve(shellRoot, '../..', '.sage-preview')
const paths = resolveSagePaths({ home: root, root })
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== 'DSH_HOME' && !name.startsWith('LUTE_SHELL_')),
)
const child = spawn('electron', [], {
  env: {
    ...environment,
    SAGE_ROOT: paths.root,
  },
})
`,
  [SMOKE_SCRIPT]: `
const root = process.env.SAGE_ROOT
const paths = resolveSagePaths({ home: homedir(), ...(root === undefined ? {} : { root }) })
const runtime = resolveHostRuntime({ paths, env: process.env })
const child = spawn(runtime.node, [runtime.entry, runtime.sageRoot, runtime.profileDir], {
  env: runtime.env,
})
for (const path of ['/.dsh/remote-stream']) check(path)
`,
}

function files() {
  return Object.entries(source).map(([path, text]) => ({ path, text }))
}

function withSource(path, replace) {
  return files().map((file) => file.path === path ? { ...file, text: replace(file.text) } : file)
}

function assertRejected(result, message) {
  assert.equal(result.passed, false, message)
  assert.ok(result.violations.length > 0, message)
}

test('passes the minimum Sage-only data-isolation source layout', () => {
  const result = checkSageDataIsolation({ files: files() })
  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('ignores legacy names used only in comments and diagnostic messages', () => {
  const result = checkSageDataIsolation({
    files: withSource(LAYOUT_FILE, (text) => text + "\n// lute-shell and lute-host are retired\nthrow new Error('legacy ~/.dsh and LUTE_SHELL_ are rejected')"),
  })
  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('collects source from a filesystem worktree without requiring Git tracking', () => {
  const root = mkdtempSync(join(tmpdir(), 'sage-data-isolation-'))
  try {
    const directory = join(root, 'apps', 'sage-shell', 'src', 'main')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'untracked.ts'), 'export const currentWorktreeFile = true\n')
    const collected = collectSageDataIsolationFiles(root)
    assert.deepEqual(collected.map((file) => file.path), ['apps/sage-shell/src/main/untracked.ts'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('fails closed when any isolation source file is missing', () => {
  for (const path of Object.keys(source)) {
    const result = checkSageDataIsolation({ files: files().filter((file) => file.path !== path) })
    assertRejected(result, path)
    assert.ok(result.violations.some((violation) => violation.includes(path) && violation.includes('required')), path)
  }
})

test('rejects legacy product controls and an old default .dsh root while permitting route denylists', () => {
  for (const [path, drift] of [
    [LAYOUT_FILE, "const legacy = 'lute-shell'"],
    [LAYOUT_FILE, "const legacy = 'lute-host'"],
    [RUNTIME_FILE, 'const inherited = process.env.LUTE_SHELL_PROFILE'],
    [MAIN_FILE, "const oldRoot = join(homedir(), '.dsh')"],
    [MATERIALIZE_SCRIPT, 'const inherited = process.env.LUTE_SHELL_PROFILE'],
    [MATERIALIZE_SCRIPT, "const oldRoot = join(homedir(), '.dsh')"],
    [PREVIEW_SCRIPT, "const oldRoot = join(homedir(), '.dsh')"],
    [SMOKE_SCRIPT, 'const inherited = process.env.LUTE_SHELL_PROFILE'],
    [SMOKE_SCRIPT, "const oldRoot = join(homedir(), '.dsh')"],
  ]) {
    const result = checkSageDataIsolation({ files: withSource(path, (text) => text + '\n' + drift) })
    assertRejected(result, drift)
  }
})

test('rejects inherited DSH_HOME and weakened child-environment scrubbing', () => {
  const inherited = checkSageDataIsolation({
    files: withSource(RUNTIME_FILE, (text) => text.replace('input.paths.harnessHome', 'input.env.DSH_HOME')),
  })
  assertRejected(inherited, 'inherited DSH_HOME')

  const noDshScrub = checkSageDataIsolation({
    files: withSource(RUNTIME_FILE, (text) => text.replace("name === 'DSH_HOME'", "name === 'OTHER_HOME'")),
  })
  assertRejected(noDshScrub, 'DSH_HOME scrub')

  const noNodeOverride = checkSageDataIsolation({
    files: withSource(RUNTIME_FILE, (text) => text.replace('SAGE_NODE_BINARY', 'NODE_BINARY')),
  })
  assertRejected(noNodeOverride, 'SAGE_NODE_BINARY')

  const noSageScrub = checkSageDataIsolation({
    files: withSource(RUNTIME_FILE, (text) => text.replace("name.startsWith('SAGE_')", "name.startsWith('OTHER_')")),
  })
  assertRejected(noSageScrub, 'SAGE_* scrub')

  const materializeInherited = checkSageDataIsolation({
    files: withSource(MATERIALIZE_SCRIPT, (text) => text + '\nconst inherited = process.env.DSH_HOME'),
  })
  assertRejected(materializeInherited, 'materialize inherited DSH_HOME')

  const previewInherited = checkSageDataIsolation({
    files: withSource(PREVIEW_SCRIPT, (text) => text + '\nconst inherited = process.env.DSH_HOME'),
  })
  assertRejected(previewInherited, 'preview inherited DSH_HOME')

  const previewNoScrub = checkSageDataIsolation({
    files: withSource(PREVIEW_SCRIPT, (text) => text.replace("name !== 'DSH_HOME'", "name !== 'OTHER_HOME'")),
  })
  assertRejected(previewNoScrub, 'preview DSH_HOME scrub')

  const previewNoLuteScrub = checkSageDataIsolation({
    files: withSource(PREVIEW_SCRIPT, (text) => text.replace("name.startsWith('LUTE_SHELL_')", "name.startsWith('OTHER_')")),
  })
  assertRejected(previewNoLuteScrub, 'preview LUTE_SHELL_ scrub')

  const previewSpread = checkSageDataIsolation({
    files: withSource(PREVIEW_SCRIPT, (text) => text.replace('...environment', '...process.env')),
  })
  assertRejected(previewSpread, 'preview process environment spread')

  const smokeInherited = checkSageDataIsolation({
    files: withSource(SMOKE_SCRIPT, (text) => text + '\nconst inherited = process.env.DSH_HOME'),
  })
  assertRejected(smokeInherited, 'smoke inherited DSH_HOME')
})

test('rejects host directory creation, profile-validation drift, and a profile-only child argv', () => {
  const mkdir = checkSageDataIsolation({
    files: withSource(HOST_FILE, (text) => text + '\nmkdirSync(profileDir, { recursive: true })'),
  })
  assertRejected(mkdir, 'host mkdir')

  const noValidation = checkSageDataIsolation({
    files: withSource(HOST_FILE, (text) => text.replace('await assertActiveProfile(paths, requestedProfileDir)', 'readActiveProfile(paths)')),
  })
  assertRejected(noValidation, 'active profile validation')

  const oldArgv = checkSageDataIsolation({
    files: withSource(HOST_PROCESS_FILE, (text) => text.replace('this.runtime.sageRoot, ', '')),
  })
  assertRejected(oldArgv, 'host argv')
})

test('rejects every pre-ready Electron storage configuration regression', () => {
  for (const [current, drift] of [
    ["app.setPath('userData'", "app.setPath('legacyUserData'"],
    ["app.setPath('sessionData'", "app.setPath('legacySessionData'"],
    ["app.setPath('crashDumps'", "app.setPath('legacyCrashDumps'"],
    ['app.setAppLogsPath', 'app.setLegacyLogsPath'],
  ]) {
    const result = checkSageDataIsolation({
      files: withSource(MAIN_FILE, (text) => text.replace(current, drift)),
    })
    assertRejected(result, current)
  }

  const afterReady = checkSageDataIsolation({
    files: withSource(MAIN_FILE, (text) => text.replace(
      '  ensureSageDirectoriesSync(paths)\n  configureElectronPaths(paths)\n  await app.whenReady()',
      '  await app.whenReady()\n  ensureSageDirectoriesSync(paths)\n  configureElectronPaths(paths)',
    )),
  })
  assertRejected(afterReady, 'configuration after Electron ready')

  const noSyncDirectoryPreparation = checkSageDataIsolation({
    files: withSource(MAIN_FILE, (text) => text.replace('ensureSageDirectoriesSync(paths)', 'ensureSageDirectories(paths)')),
  })
  assertRejected(noSyncDirectoryPreparation, 'synchronous directory preparation')
})

test('rejects a weakened Sage-root legacy guard', () => {
  const result = checkSageDataIsolation({
    files: withSource(PATHS_FILE, (text) => text.replace('assertSafeRoot(root, legacyDshRoot)', 'assertSafeRoot(root, ignoredRoot)')),
  })
  assertRejected(result, 'legacy root guard')

  const preCreation = checkSageDataIsolation({
    files: withSource(PATHS_FILE, (text) => text.replace(
      'assertSafeRoot(canonicalPathBeforeCreation(paths.root), legacyDshRootOf(paths))',
      'assertSafeRoot(paths.root, legacyDshRootOf(paths))',
    )),
  })
  assertRejected(preCreation, 'pre-creation legacy root guard')
})

test('fails loud on an empty source scan', () => {
  const result = checkSageDataIsolation({ files: [] })
  assertRejected(result, 'empty scan')
  assert.match(result.violations[0], /no readable source/u)
})
