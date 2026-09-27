/**
 * Sage P0-3A data-isolation gate.
 *
 * This is intentionally a source gate: it watches the current worktree,
 * including untracked files, for the small set of code paths that establish
 * Sage's data root before Electron or the Host can use a legacy identity.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const SOURCE_ROOT = 'apps/sage-shell/src'
const PATHS_FILE = SOURCE_ROOT + '/profile/paths.ts'
const LAYOUT_FILE = SOURCE_ROOT + '/profile/layout.ts'
const RUNTIME_FILE = SOURCE_ROOT + '/main/runtime.ts'
const MAIN_FILE = SOURCE_ROOT + '/main/index.ts'
const HOST_PROCESS_FILE = SOURCE_ROOT + '/main/host-process.ts'
const HOST_FILE = SOURCE_ROOT + '/host/index.ts'
const SCRIPTS_ROOT = 'apps/sage-shell/scripts'
const MATERIALIZE_SCRIPT = SCRIPTS_ROOT + '/materialize.mjs'
const PREVIEW_SCRIPT = SCRIPTS_ROOT + '/preview.mjs'
const SMOKE_SCRIPT = SCRIPTS_ROOT + '/smoke.mjs'

const SCRIPT_FILES = [
  MATERIALIZE_SCRIPT,
  PREVIEW_SCRIPT,
  SMOKE_SCRIPT,
]

const REQUIRED_FILES = [
  PATHS_FILE,
  LAYOUT_FILE,
  RUNTIME_FILE,
  MAIN_FILE,
  HOST_PROCESS_FILE,
  HOST_FILE,
  ...SCRIPT_FILES,
]

function meaningfulText(text) {
  return text.replace(/\/\*[\s\S]*?\*\//gu, '').split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//')
    })
    .map((line) => line
      .replace(/\s\/\/.*$/u, '')
      .replace(/\b(?:throw\s+)?(?:new\s+)?Error\(\s*(?:'[^']*'|"[^"]*"|`[^`]*`)/gu, 'Error('))
    .join('\n')
}

function requirePattern(violations, text, pattern, message) {
  if (!pattern.test(text)) violations.push(message)
}

function afterStart(text, marker) {
  const start = text.indexOf(marker)
  return start === -1 ? '' : text.slice(start)
}

function checkPaths(paths, violations) {
  requirePattern(
    violations,
    paths,
    /const legacyDshRoot\s*=\s*join\(\s*home\s*,\s*['"]\.dsh['"]\s*\)/u,
    PATHS_FILE + ' must identify ~/.dsh only as a rejected legacy root',
  )
  requirePattern(
    violations,
    paths,
    /assertSafeRoot\(\s*root\s*,\s*legacyDshRoot\s*\)/u,
    PATHS_FILE + ' must reject a Sage root equal to, inside, or containing ~/.dsh',
  )
  requirePattern(
    violations,
    paths,
    /join\(\s*home\s*,\s*['"]Library['"]\s*,\s*['"]Application Support['"]\s*,\s*['"]Sage['"]\s*\)/u,
    PATHS_FILE + ' must default to the Sage-owned Application Support root',
  )
  requirePattern(
    violations,
    paths,
    /const harnessHome\s*=\s*join\(\s*root\s*,\s*['"]harness['"]\s*\)/u,
    PATHS_FILE + ' must resolve a Sage-owned harness home',
  )
  requirePattern(
    violations,
    paths,
    /const profilesDir\s*=\s*join\(\s*harnessHome\s*,\s*['"]profiles['"]\s*\)/u,
    PATHS_FILE + ' must resolve profiles beneath the Sage-owned harness home',
  )
  requirePattern(
    violations,
    paths,
    /export function ensureSageDirectoriesSync\s*\(/u,
    PATHS_FILE + ' must provide the synchronous pre-ready Sage directory primitive',
  )
  requirePattern(
    violations,
    paths,
    /export async function ensureSageDirectories\s*\(/u,
    PATHS_FILE + ' must own explicit Sage directory creation',
  )
  requirePattern(
    violations,
    paths,
    /export async function assertActiveProfile\s*\(/u,
    PATHS_FILE + ' must own active-profile validation',
  )
  requirePattern(
    violations,
    paths,
    /function legacyDshRootOf\s*\(\s*paths[^)]*\)[\s\S]*?return\s+join\(\s*physicalHome\s*,\s*['"]\.dsh['"]\s*\)/u,
    PATHS_FILE + ' must resolve the physical legacy ~/.dsh root before directory creation',
  )
  requirePattern(
    violations,
    paths,
    /assertSafeRoot\(\s*realRoot\s*,\s*legacyDshRoot\s*\)/u,
    PATHS_FILE + ' must reject symlinked Sage data rooted in ~/.dsh',
  )
  requirePattern(
    violations,
    paths,
    /assertSafeRoot\(\s*canonicalPathBeforeCreation\(\s*paths\.root\s*\)\s*,\s*legacyDshRootOf\(\s*paths\s*\)\s*\)/u,
    PATHS_FILE + ' must reject a legacy-root redirect before pre-ready directory creation',
  )

  const withoutAllowedLegacyRoot = paths
    .replace(/const legacyDshRoot\s*=\s*join\(\s*(?:paths\.)?home\s*,\s*['"]\.dsh['"]\s*\)\s*;?/gu, '')
    .replace(/return\s+join\(\s*physicalHome\s*,\s*['"]\.dsh['"]\s*\)\s*;?/gu, '')
    .replace(/legacy ~\/\.dsh root/gu, '')
  if (/(?:['"]\.dsh['"]|~\/\.dsh)/u.test(withoutAllowedLegacyRoot)) {
    violations.push(PATHS_FILE + ' contains a .dsh use other than its explicit legacy-root rejection')
  }
}

function checkRuntime(runtime, violations) {
  const lutePrefixScrub = /if\s*\(\s*name\.startsWith\(\s*['"]LUTE_SHELL_['"]\s*\)\s*\)\s*continue\s*;?/gu
  const scrubbedPrefixCount = [...runtime.matchAll(lutePrefixScrub)].length
  if (scrubbedPrefixCount !== 1) {
    violations.push(RUNTIME_FILE + ' must scrub exactly the legacy LUTE_SHELL_ namespace from the child environment')
  }
  if (runtime.replace(lutePrefixScrub, '').includes('LUTE_SHELL_')) {
    violations.push(RUNTIME_FILE + ' uses LUTE_SHELL_ outside the one-way legacy-environment scrubber')
  }
  requirePattern(
    violations,
    runtime,
    /for\s*\(\s*const\s*\[\s*name\s*,\s*value\s*\]\s*of\s*Object\.entries\(\s*input\.env\s*\)\s*\)/u,
    RUNTIME_FILE + ' must build a child environment from an explicit scrubbed copy',
  )
  requirePattern(
    violations,
    runtime,
    /if\s*\(\s*name\.startsWith\(\s*['"]SAGE_['"]\s*\)\s*\)\s*continue/u,
    RUNTIME_FILE + ' must not pass ambient SAGE_* controls through to the child',
  )
  requirePattern(
    violations,
    runtime,
    /if\s*\(\s*name\s*===\s*['"]DSH_HOME['"]\s*\)\s*continue/u,
    RUNTIME_FILE + ' must scrub inherited DSH_HOME before spawning the child',
  )
  requirePattern(
    violations,
    runtime,
    /env\.DSH_HOME\s*=\s*input\.paths\.harnessHome\s*;?/u,
    RUNTIME_FILE + ' must set child DSH_HOME to input.paths.harnessHome',
  )
  requirePattern(
    violations,
    runtime,
    /node\s*:\s*input\.env\.SAGE_NODE_BINARY\s*\?\?\s*input\.execPath/u,
    RUNTIME_FILE + ' must use only SAGE_NODE_BINARY as the explicit Node override',
  )
  requirePattern(
    violations,
    runtime,
    /sageRoot\s*:\s*input\.paths\.root/u,
    RUNTIME_FILE + ' must pass the resolved Sage root to the Host child',
  )
  if (/\b(?:process|input\.env)\.DSH_HOME\b/u.test(runtime) || /\bdshHome\b/u.test(runtime)) {
    violations.push(RUNTIME_FILE + ' reads or reconstructs an inherited DSH_HOME instead of using SagePaths')
  }
}

function checkElectronBootstrap(main, violations) {
  const configureStart = main.indexOf('function configureElectronPaths')
  const bootstrapStart = main.indexOf('async function bootstrap')
  const configure = configureStart === -1 || bootstrapStart === -1 ? '' : main.slice(configureStart, bootstrapStart)
  const bootstrap = afterStart(main, 'async function bootstrap')
  requirePattern(
    violations,
    configure,
    /const electron\s*=\s*resolveSageElectronPaths\(\s*paths\s*\)/u,
    MAIN_FILE + ' must derive Electron storage directories from SagePaths',
  )
  for (const [label, pattern] of [
    ['userData', /app\.setPath\(\s*['"]userData['"]\s*,\s*(?:electron\.userData|paths\.electronUserDataDir)\s*\)/u],
    ['sessionData', /app\.setPath\(\s*['"]sessionData['"]\s*,\s*(?:electron\.sessionData|paths\.sessionDataDir)\s*\)/u],
    ['crashDumps', /app\.setPath\(\s*['"]crashDumps['"]\s*,\s*(?:electron\.crashDumps|join\(\s*paths\.electronDir\s*,\s*['"]crash-dumps['"]\s*\))\s*\)/u],
    ['logs', /app\.setAppLogsPath\(\s*(?:electron\.logs|paths\.logsDir)\s*\)/u],
  ]) {
    requirePattern(violations, configure, pattern, MAIN_FILE + ' must configure Electron ' + label + ' from Sage-owned storage before ready')
  }

  const pathsPosition = bootstrap.search(/const paths\s*=\s*resolveSagePaths\s*\(/u)
  const configurePosition = bootstrap.search(/configureElectronPaths\(\s*paths\s*\)/u)
  const ensurePosition = bootstrap.search(/ensureSageDirectoriesSync\(\s*paths\s*\)/u)
  const readyPosition = bootstrap.search(/await\s+app\.whenReady\s*\(\s*\)/u)
  const firstAwait = bootstrap.search(/\bawait\b/u)
  if (pathsPosition === -1 || configurePosition === -1 || ensurePosition === -1 || readyPosition === -1
    || firstAwait === -1 || !(pathsPosition < ensurePosition && ensurePosition < configurePosition
      && configurePosition < readyPosition && ensurePosition < firstAwait && configurePosition < firstAwait)) {
    violations.push(MAIN_FILE + ' must synchronously create and configure Sage Electron paths before its first await and before app.whenReady()')
  }
}

function checkHost(host, hostProcess, violations) {
  if (/\b(?:mkdirSync|mkdir)\s*\(/u.test(host)) {
    violations.push(HOST_FILE + ' must not mkdir a Host-supplied profile directory')
  }
  const hostStart = afterStart(host, 'export async function startHostProcess')
  const sageRootPosition = hostStart.search(/const sageRoot\s*=\s*argv\[2\]/u)
  const requestedProfilePosition = hostStart.search(/const requestedProfileDir\s*=\s*argv\[3\]/u)
  const pathsPosition = hostStart.search(/resolveSagePaths\s*\(/u)
  const activePosition = hostStart.search(/await\s+assertActiveProfile\(\s*paths\s*,\s*requestedProfileDir\s*\)/u)
  const runPosition = hostStart.search(/await\s+runShellHost\s*\(/u)
  if (sageRootPosition === -1 || requestedProfilePosition === -1 || pathsPosition === -1 || activePosition === -1 || runPosition === -1
    || !(sageRootPosition < pathsPosition && requestedProfilePosition < pathsPosition && pathsPosition < activePosition && activePosition < runPosition)) {
    violations.push(HOST_FILE + ' must resolve Sage root and validate the requested active profile before runShellHost()')
  }
  requirePattern(
    violations,
    hostProcess,
    /spawn\(\s*this\.runtime\.node\s*,\s*\[\s*this\.runtime\.entry\s*,\s*this\.runtime\.sageRoot\s*,\s*this\.runtime\.profileDir\s*\]/su,
    HOST_PROCESS_FILE + ' must pass [entry, sageRoot, activeProfileDir] to the Host child',
  )
}

function checkScripts(byPath, violations) {
  const materialize = byPath.get(MATERIALIZE_SCRIPT)
  if (materialize !== undefined) {
    requirePattern(
      violations,
      materialize,
      /process\.env\.SAGE_ROOT/u,
      MATERIALIZE_SCRIPT + ' must select only an explicit SAGE_ROOT override',
    )
    requirePattern(
      violations,
      materialize,
      /resolveSagePaths\s*\(/u,
      MATERIALIZE_SCRIPT + ' must resolve its data paths through SagePaths',
    )
    if (/\bprocess\.env\.DSH_HOME\b/u.test(materialize)) {
      violations.push(MATERIALIZE_SCRIPT + ' must not inherit DSH_HOME')
    }
  }

  const preview = byPath.get(PREVIEW_SCRIPT)
  if (preview !== undefined) {
    requirePattern(
      violations,
      preview,
      /process\.env\.SAGE_ROOT/u,
      PREVIEW_SCRIPT + ' must select only an explicit SAGE_ROOT override',
    )
    requirePattern(
      violations,
      preview,
      /resolveSagePaths\s*\(/u,
      PREVIEW_SCRIPT + ' must resolve its data paths through SagePaths',
    )
    const previewDshScrub = /name\s*!==\s*['"]DSH_HOME['"]/gu
    const previewLuteScrub = /!name\.startsWith\(\s*['"]LUTE_SHELL_['"]\s*\)/gu
    if ([...preview.matchAll(previewDshScrub)].length !== 1 || preview.replace(previewDshScrub, '').includes('DSH_HOME')) {
      violations.push(PREVIEW_SCRIPT + ' must scrub DSH_HOME before spawning Electron')
    }
    if ([...preview.matchAll(previewLuteScrub)].length !== 1 || preview.replace(previewLuteScrub, '').includes('LUTE_SHELL_')) {
      violations.push(PREVIEW_SCRIPT + ' may contain LUTE_SHELL_ only in its child-environment scrubber')
    }
    if (/\.\.\.process\.env/u.test(preview)) {
      violations.push(PREVIEW_SCRIPT + ' must not spread the inherited process environment into Electron')
    }
    requirePattern(
      violations,
      preview,
      /env\s*:\s*\{[\s\S]*?\.\.\.environment[\s\S]*?SAGE_ROOT\s*:\s*paths\.root[\s\S]*?\}/u,
      PREVIEW_SCRIPT + ' must launch Electron with the scrubbed environment and resolved SAGE_ROOT',
    )
  }

  const smoke = byPath.get(SMOKE_SCRIPT)
  if (smoke !== undefined) {
    requirePattern(
      violations,
      smoke,
      /process\.env\.SAGE_ROOT/u,
      SMOKE_SCRIPT + ' must select only an explicit SAGE_ROOT override',
    )
    requirePattern(
      violations,
      smoke,
      /resolveSagePaths\s*\(/u,
      SMOKE_SCRIPT + ' must resolve its data paths through SagePaths',
    )
    requirePattern(
      violations,
      smoke,
      /resolveHostRuntime\s*\(/u,
      SMOKE_SCRIPT + ' must use the shared scrubbed Host runtime',
    )
    requirePattern(
      violations,
      smoke,
      /env\s*:\s*runtime\.env/u,
      SMOKE_SCRIPT + ' must pass only runtime.env to the Host child',
    )
    requirePattern(
      violations,
      smoke,
      /spawn\(\s*runtime\.node\s*,\s*\[\s*runtime\.entry\s*,\s*runtime\.sageRoot\s*,\s*runtime\.profileDir\s*\]/su,
      SMOKE_SCRIPT + ' must pass [entry, sageRoot, activeProfileDir] to the Host child',
    )
    if (/\bprocess\.env\.DSH_HOME\b/u.test(smoke)) {
      violations.push(SMOKE_SCRIPT + ' must not inherit DSH_HOME outside resolveHostRuntime()')
    }
  }
}

/**
 * Read the current Sage source tree, including untracked worktree files.
 * @param {string} repoRoot
 * @returns {Array<{path: string, text: string}>}
 */
export function collectSageDataIsolationFiles(repoRoot) {
  const root = join(repoRoot, SOURCE_ROOT)
  const files = existsSync(root) ? readdirSync(root, { recursive: true })
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => {
      const absolute = join(root, entry)
      return {
        path: relative(repoRoot, absolute),
        text: readFileSync(absolute, 'utf8'),
      }
    })
    : []
  for (const path of SCRIPT_FILES) {
    const absolute = join(repoRoot, path)
    if (existsSync(absolute)) files.push({ path, text: readFileSync(absolute, 'utf8') })
  }
  return files
}

/**
 * @param {{files: Array<{path: string, text: string}>}} input
 * @returns {{passed: boolean, violations: string[], note: string}}
 */
export function checkSageDataIsolation({ files }) {
  const violations = []
  if (!Array.isArray(files) || files.length === 0) {
    return {
      passed: false,
      violations: [SOURCE_ROOT + ' contains no readable source files — data-isolation scan has no object to check'],
      note: 'scanned 0 Sage source files',
    }
  }

  const byPath = new Map(files.map((file) => [file.path, meaningfulText(file.text)]))
  for (const path of REQUIRED_FILES) {
    if (!byPath.has(path)) violations.push(path + ' is required for the P0-3A Sage data-isolation boundary')
  }

  for (const [path, text] of byPath) {
    if (/\blute-(?:shell|host)\b/iu.test(text)) {
      violations.push(path + ' still contains a legacy lute-shell or lute-host control name')
    }
    if (path !== RUNTIME_FILE && path !== PREVIEW_SCRIPT && text.includes('LUTE_SHELL_')) {
      violations.push(path + ' still contains the legacy LUTE_SHELL_ control namespace')
    }
    if (path === PATHS_FILE) continue
    if (path === HOST_FILE) {
      const withoutRouteDenylist = text.replace(/pathname\.startsWith\(\s*['"]\/\.dsh\/['"]\s*\)/gu, '')
      if (/(?:['"]\.dsh['"]|['"]\/\.dsh\/['"])/u.test(withoutRouteDenylist)) {
        violations.push(HOST_FILE + ' contains a .dsh use other than its request-rejection denylist')
      }
      continue
    }
    if (path === SMOKE_SCRIPT) {
      const withoutRouteDenylist = text.replace(/['"]\/\.dsh\/remote-stream['"]/gu, '')
      if (/(?:['"]\.dsh['"]|['"]\/\.dsh(?:\/[^'"]*)?['"])/u.test(withoutRouteDenylist)) {
        violations.push(SMOKE_SCRIPT + ' contains a .dsh use other than its request-rejection denylist')
      }
      continue
    }
    if (/(?:['"]\.dsh['"]|['"]\/\.dsh\/['"])/u.test(text)) {
      violations.push(path + ' still contains the legacy .dsh root outside the one-way rejection guard')
    }
  }

  const paths = byPath.get(PATHS_FILE)
  if (paths !== undefined) checkPaths(paths, violations)
  const runtime = byPath.get(RUNTIME_FILE)
  if (runtime !== undefined) checkRuntime(runtime, violations)
  const main = byPath.get(MAIN_FILE)
  if (main !== undefined) checkElectronBootstrap(main, violations)
  const layout = byPath.get(LAYOUT_FILE)
  if (layout !== undefined && (!layout.includes('HOST_DIR_NAME') || !layout.includes('resolveSagePaths'))) {
    violations.push(LAYOUT_FILE + ' must consume Sage-owned profile and host identity constants')
  }
  const host = byPath.get(HOST_FILE)
  const hostProcess = byPath.get(HOST_PROCESS_FILE)
  if (host !== undefined && hostProcess !== undefined) checkHost(host, hostProcess, violations)
  checkScripts(byPath, violations)

  return {
    passed: violations.length === 0,
    violations,
    note: 'scanned ' + files.length + ' Sage source files from the current worktree; comments are excluded from token checks',
  }
}
