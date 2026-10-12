/** Sage-owned filesystem layout and active-profile pointer validation. */

import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { lstat, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'

/** Profile name shown only inside the Sage-owned data root. */
export const PROFILE_LABEL = 'sage-shell'

/** Host runtime directory inside every materialized profile generation. */
export const HOST_DIR_NAME = 'sage-host'

/** Filename for the atomically replaced active-generation pointer. */
export const ACTIVE_PROFILE_FILE = 'profile-current.json'

/** Receipt written into every materialized generation. */
export const PROFILE_MANIFEST_FILE = 'profile-manifest.json'

// `paths.js` is copied into the minimal Host runtime without the C2A scanner.
// Keep this receipt row literal isolated here; runtime-inventory integration
// tests bind it to the producer's exported filename.
const RECEIPT_RUNTIME_ARTIFACT_ATTESTATION_FILE = 'runtime-artifact-attestation.json'

/** Instance-local patch layer merged after the shell overlay (ADR-0162); absent until an instance opts in. */
export const LOCAL_PATCH_FILE = 'cordis.local.patch.yml'

/** Instance-local Organization Policy file (WT-02B.2E); absent until an operator provisions it. */
export const ORGANIZATION_POLICY_FILE = 'organization-policy.json'

const POINTER_SCHEMA_VERSION = 1
const GENERATION_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/u

/** All filesystem locations owned by one Sage desktop identity. */
export interface SagePaths {
  readonly platform: NodeJS.Platform
  readonly home: string
  readonly root: string
  readonly electronDir: string
  readonly electronUserDataDir: string
  readonly sessionDataDir: string
  readonly logsDir: string
  readonly crashDumpsDir: string
  /** The only root the Harness child receives as `DSH_HOME`. */
  readonly harnessHome: string
  /** Harness-compatible profile parent; never points at the legacy `~/.dsh`. */
  readonly profilesDir: string
  /** Immutable materialized profile generations. */
  readonly generationsDir: string
  /** Same-filesystem staging area for a generation transaction. */
  readonly stagingDir: string
  /** Atomically replaced JSON pointer to the active generation. */
  readonly activeProfileFile: string
  /** Instance-local Organization Policy file (WT-02B.2E); the operator provisions it manually. */
  readonly organizationPolicyFile: string
  /** Device-local draft records (ticket 002, US-011): never synced, encrypted at rest. */
  readonly draftsDir: string
}

/** One validated, active materialized profile. */
export interface ActiveProfile {
  readonly generation: string
  readonly profileDir: string
  readonly manifestSha256: string
  readonly activatedAt: string
  /** Receipt-verified file SHA; absent on pre-attestation profile generations. */
  readonly runtimeArtifactAttestationSha256?: string
}

interface ActiveProfilePointer {
  readonly schemaVersion: typeof POINTER_SCHEMA_VERSION
  readonly generation: string
  readonly manifestSha256: string
  readonly activatedAt: string
}

function isInside(root: string, target: string): boolean {
  const distance = relative(root, target)
  return distance === '' || (!distance.startsWith(`..${sep}`) && distance !== '..' && !isAbsolute(distance))
}

function resolveAbsolute(label: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\u0000')) {
    throw new Error(`sage shell: ${label} must be a nonempty absolute path`)
  }
  if (!isAbsolute(value)) throw new Error(`sage shell: ${label} must be an absolute path`)
  const resolved = resolve(value)
  if (resolved === parse(resolved).root) throw new Error(`sage shell: ${label} must not be a filesystem root`)
  return resolved
}

function assertSafeRoot(root: string, legacyDshRoot: string): void {
  if (isInside(root, legacyDshRoot) || isInside(legacyDshRoot, root)) {
    throw new Error('sage shell: Sage root must not equal, contain, or live inside the legacy ~/.dsh root')
  }
}

function assertGeneration(generation: string): void {
  if (!GENERATION_NAME.test(generation)) {
    throw new Error(`sage shell: invalid profile generation ${JSON.stringify(generation)}`)
  }
}

function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

function isLiteralReceiptPath(value: string): boolean {
  return value.trim() === value && value !== '' && !value.includes('\\') && !value.includes('\u0000')
    && value.split('/').every(part => part !== '' && part !== '.' && part !== '..')
}

function assertDirectorySync(path: string): void {
  const entry = lstatSync(path)
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error(`sage shell: expected owned directory, not a symlink or file: ${path}`)
  }
}

async function assertDirectory(path: string): Promise<void> {
  const entry = await lstat(path)
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error(`sage shell: expected owned directory, not a symlink or file: ${path}`)
  }
}

async function assertRegularFile(path: string): Promise<void> {
  const entry = await lstat(path)
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error(`sage shell: expected regular file, not a symlink or directory: ${path}`)
  }
}

/**
 * Resolve the isolated Sage layout without creating or reading any directories.
 *
 * The P0 identity is deliberately macOS-shaped on every development platform:
 * production defaults to `~/Library/Application Support/Sage`, while tests can
 * supply an explicit absolute temporary root.
 */
export function resolveSagePaths(input: { home: string; root?: string; platform?: NodeJS.Platform }): SagePaths {
  const home = resolveAbsolute('home', input.home)
  const legacyDshRoot = join(home, '.dsh')
  const root = input.root === undefined
    ? join(home, 'Library', 'Application Support', 'Sage')
    : resolveAbsolute('Sage root override', input.root)
  assertSafeRoot(root, legacyDshRoot)

  const electronDir = join(root, 'electron')
  const harnessHome = join(root, 'harness')
  const profilesDir = join(harnessHome, 'profiles')
  return {
    platform: input.platform ?? process.platform,
    home,
    root,
    electronDir,
    electronUserDataDir: join(electronDir, 'user-data'),
    sessionDataDir: join(electronDir, 'session-data'),
    logsDir: join(electronDir, 'logs'),
    crashDumpsDir: join(electronDir, 'crash-dumps'),
    harnessHome,
    profilesDir,
    generationsDir: join(profilesDir, '.sage-generations'),
    stagingDir: join(profilesDir, '.sage-staging'),
    activeProfileFile: join(root, ACTIVE_PROFILE_FILE),
    organizationPolicyFile: join(root, ORGANIZATION_POLICY_FILE),
    draftsDir: join(root, 'drafts'),
  }
}

/** Whether a directory name is a legal profile generation identifier. */
export function isProfileGenerationName(name: string): boolean {
  return GENERATION_NAME.test(name)
}

/** Absolute directory for one immutable profile generation. */
export function generationProfileDir(paths: SagePaths, generation: string): string {
  assertGeneration(generation)
  return join(paths.generationsDir, generation)
}

function ownedDirectories(paths: SagePaths): readonly string[] {
  return [
    paths.root,
    paths.electronDir,
    paths.electronUserDataDir,
    paths.sessionDataDir,
    paths.logsDir,
    paths.crashDumpsDir,
    paths.harnessHome,
    paths.profilesDir,
    paths.generationsDir,
    paths.stagingDir,
    paths.draftsDir,
  ]
}

function assertSageDirectoryContainment(paths: SagePaths, directories: readonly string[]): void {
  const realRoot = realpathSync(paths.root)
  const legacyDshRoot = legacyDshRootOf(paths)
  assertSafeRoot(realRoot, legacyDshRoot)
  assertSageRootIsolatedFromLegacyDsh(paths)
  for (const directory of directories.slice(1)) {
    const realDirectory = realpathSync(directory)
    if (!isInside(realRoot, realDirectory)) {
      throw new Error(`sage shell: Sage directory escapes its root: ${directory}`)
    }
  }
}

function canonicalPathBeforeCreation(path: string): string {
  let ancestor = path
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor)
    if (parent === ancestor) throw new Error(`sage shell: no existing parent for Sage path ${path}`)
    ancestor = parent
  }
  assertDirectorySync(ancestor)
  return join(realpathSync(ancestor), relative(ancestor, path))
}

function realpathIfPresent(path: string): string | undefined {
  try {
    return realpathSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function legacyDshRootOf(paths: Pick<SagePaths, 'home'>): string {
  const physicalHome = existsSync(paths.home) ? realpathSync(paths.home) : paths.home
  return join(physicalHome, '.dsh')
}

/**
 * Reject a Sage root that overlaps either the lexical legacy root or the
 * physical target behind it. This check is read-only and safe before mkdir.
 */
export function assertSageRootIsolatedFromLegacyDsh(
  paths: Pick<SagePaths, 'home' | 'root'>,
): void {
  const sageRoot = realpathIfPresent(paths.root) ?? canonicalPathBeforeCreation(paths.root)
  const legacyDshRoot = legacyDshRootOf(paths)
  assertSafeRoot(sageRoot, legacyDshRoot)
  const physicalLegacyDshRoot = realpathIfPresent(legacyDshRoot)
  if (physicalLegacyDshRoot !== undefined) assertSafeRoot(sageRoot, physicalLegacyDshRoot)
}

/**
 * Synchronously establish the full Sage-owned directory tree before Electron
 * is ready. It is the only safe pre-ready directory primitive: it rejects a
 * root or child redirected through a symlink before callers configure paths.
 */
export function ensureSageDirectoriesSync(paths: SagePaths): void {
  const directories = ownedDirectories(paths)
  if (existsSync(paths.root)) assertDirectorySync(paths.root)
  // This preflight happens before mkdir: a symlinked parent must not redirect
  // even the first Sage root write into a legacy data tree.
  assertSafeRoot(canonicalPathBeforeCreation(paths.root), legacyDshRootOf(paths))
  assertSageRootIsolatedFromLegacyDsh(paths)
  for (const directory of directories) {
    if (existsSync(directory)) assertDirectorySync(directory)
    else {
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      assertDirectorySync(directory)
    }
  }
  assertSageDirectoryContainment(paths, directories)
}

/**
 * Create only Sage-owned root directories and reject symlink redirection.
 * This function never creates, reads, copies, or changes the legacy `~/.dsh`.
 */
export async function ensureSageDirectories(paths: SagePaths): Promise<void> {
  ensureSageDirectoriesSync(paths)
}

function parsePointer(content: string): ActiveProfilePointer {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (cause) {
    throw new Error('sage shell: active profile pointer is not valid JSON', { cause })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('sage shell: active profile pointer must be an object')
  }
  const pointer = value as Partial<ActiveProfilePointer>
  if (pointer.schemaVersion !== POINTER_SCHEMA_VERSION || typeof pointer.generation !== 'string'
    || typeof pointer.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(pointer.manifestSha256)
    || typeof pointer.activatedAt !== 'string' || Number.isNaN(Date.parse(pointer.activatedAt))) {
    throw new Error('sage shell: active profile pointer has an unsupported shape')
  }
  assertGeneration(pointer.generation)
  return pointer as ActiveProfilePointer
}

/** The parsed, shape-validated active pointer without any generation-tree check. A missing
 *  pointer means no materialized Sage profile has been activated yet; malformed pointers fail
 *  closed. Boot-time reconciliation probes pointer state through this seam, never through
 *  `readActiveProfile` (whose generation-dir ENOENT escapes as a raw error, ADR-0335). */
export async function readActiveProfilePointer(paths: SagePaths): Promise<{
  readonly generation: string
  readonly manifestSha256: string
  readonly activatedAt: string
} | null> {
  let content: string
  try {
    await assertRegularFile(paths.activeProfileFile)
    content = await readFile(paths.activeProfileFile, 'utf8')
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw cause
  }
  const pointer = parsePointer(content)
  return { generation: pointer.generation, manifestSha256: pointer.manifestSha256, activatedAt: pointer.activatedAt }
}

/**
 * Validate one generation tree in place against an expected receipt checksum: the exact
 * checks `readActiveProfile` runs after the pointer, minus the pointer. The boot-time
 * adoption path reuses this so an interrupted install is completed with the same verification
 * the install itself performed — never a second, weaker trust path (ADR-0335).
 */
export async function readGenerationProfile(
  paths: SagePaths,
  generation: string,
  manifestSha256: string,
): Promise<{ readonly profileDir: string, readonly runtimeArtifactAttestationSha256?: string }> {
  const profileDir = generationProfileDir(paths, generation)
  await assertDirectory(profileDir)
  const manifestPath = join(profileDir, PROFILE_MANIFEST_FILE)
  await assertRegularFile(manifestPath)
  const manifest = await readFile(manifestPath)
  if (sha256(manifest) !== manifestSha256) {
    throw new Error(`sage shell: active profile manifest checksum does not match pointer for ${generation}`)
  }
  let receipt: unknown
  try {
    receipt = JSON.parse(manifest.toString('utf8'))
  } catch (cause) {
    throw new Error(`sage shell: active profile receipt is not valid JSON for ${generation}`, { cause })
  }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error(`sage shell: active profile receipt must be an object for ${generation}`)
  }
  const record = receipt as { schemaVersion?: unknown; generation?: unknown; files?: unknown }
  if (record.schemaVersion !== 1 || record.generation !== generation || !Array.isArray(record.files) || record.files.length === 0) {
    throw new Error(`sage shell: active profile receipt has an unsupported shape for ${generation}`)
  }
  const seen = new Set<string>()
  let runtimeArtifactAttestationSha256: string | undefined
  for (const item of record.files) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`sage shell: active profile receipt has an invalid file row for ${generation}`)
    }
    const file = item as { path?: unknown; sha256?: unknown }
    if (typeof file.path !== 'string' || typeof file.sha256 !== 'string' || !isLiteralReceiptPath(file.path)
      || !/^[a-f0-9]{64}$/u.test(file.sha256) || seen.has(file.path)) {
      throw new Error(`sage shell: active profile receipt has an unsafe file row for ${generation}`)
    }
    seen.add(file.path)
    const path = join(profileDir, file.path)
    if (!isInside(profileDir, path)) {
      throw new Error(`sage shell: active profile receipt path escapes its generation: ${file.path}`)
    }
    await assertRegularFile(path)
    if (sha256(await readFile(path)) !== file.sha256) {
      throw new Error(`sage shell: active profile file checksum does not match receipt: ${file.path}`)
    }
    if (file.path === RECEIPT_RUNTIME_ARTIFACT_ATTESTATION_FILE) {
      runtimeArtifactAttestationSha256 = file.sha256
    }
  }
  return {
    profileDir,
    ...(runtimeArtifactAttestationSha256 === undefined ? {} : { runtimeArtifactAttestationSha256 }),
  }
}

/**
 * Read and validate the active generation pointer plus its generation tree. A missing pointer
 * means no materialized Sage profile has been activated yet; malformed pointers and drifted
 * generations fail closed.
 */
export async function readActiveProfile(paths: SagePaths): Promise<ActiveProfile | null> {
  const pointer = await readActiveProfilePointer(paths)
  if (pointer === null) return null
  const validated = await readGenerationProfile(paths, pointer.generation, pointer.manifestSha256)
  return {
    generation: pointer.generation,
    profileDir: validated.profileDir,
    manifestSha256: pointer.manifestSha256,
    activatedAt: pointer.activatedAt,
    ...(validated.runtimeArtifactAttestationSha256 === undefined ? {} : { runtimeArtifactAttestationSha256: validated.runtimeArtifactAttestationSha256 }),
  }
}

/** Reject a child process profile argument unless it is the current active generation. */
export async function assertActiveProfile(paths: SagePaths, profileDir: string): Promise<ActiveProfile> {
  const active = await readActiveProfile(paths)
  if (active === null) throw new Error('sage shell: no active Sage profile is available')
  const requested = resolveAbsolute('profile directory', profileDir)
  if (requested !== active.profileDir) {
    throw new Error('sage shell: host profile must match the active Sage generation')
  }
  return active
}
