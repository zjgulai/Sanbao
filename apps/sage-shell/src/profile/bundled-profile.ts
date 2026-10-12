/** Installs the signed, build-time materialized profile on a packaged first run. */

import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { cp, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { writeActivePointer } from './materialize.js'
import {
  ensureSageDirectories,
  generationProfileDir,
  readActiveProfile,
  type ActiveProfile,
  type SagePaths,
} from './paths.js'
import { verifyRuntimeArtifactAttestation } from './runtime-artifact-attestation.js'

export const BUNDLED_PROFILE_TEMPLATE_MANIFEST = 'template-manifest.json'
export const BUNDLED_PROFILE_TEMPLATE_PROFILE_DIR = 'profile'

const TEMPLATE_SCHEMA = 'sage.bundled-profile-template.v1'
const GENERATION = /^[a-z0-9][a-z0-9-]{0,63}$/u
const SHA256 = /^[a-f0-9]{64}$/u
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/u

export interface BundledProfileTemplateManifest {
  readonly schemaVersion: typeof TEMPLATE_SCHEMA
  readonly generation: string
  readonly profileManifestSha256: string
  readonly runtimeArtifactAttestationSha256: string
  readonly ownedProfileDigest: string
  readonly artifactAttestationDigest: string
}

export type BundledProfileInstallResult =
  | { readonly state: 'existing'; readonly profile: ActiveProfile }
  | { readonly state: 'installed'; readonly profile: ActiveProfile }
  | { readonly state: 'upgraded'; readonly profile: ActiveProfile }

function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

function isInside(root: string, candidate: string): boolean {
  const distance = relative(root, candidate)
  return distance === '' || (distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance))
}

async function assertDirectory(path: string, label: string): Promise<void> {
  const entry = await lstat(path)
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error(`sage shell: ${label} must be a real directory`)
  }
}

export async function readTemplateManifest(templateRoot: string): Promise<BundledProfileTemplateManifest> {
  await assertDirectory(templateRoot, 'bundled profile template root')
  const path = join(templateRoot, BUNDLED_PROFILE_TEMPLATE_MANIFEST)
  const entry = await lstat(path)
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error('sage shell: bundled profile template manifest must be a regular file')
  }
  let value: unknown
  try {
    value = JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch (cause) {
    throw new Error('sage shell: bundled profile template manifest is not valid JSON', { cause })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('sage shell: bundled profile template manifest must be an object')
  }
  const record = value as Record<string, unknown>
  const expectedKeys = [
    'schemaVersion',
    'generation',
    'profileManifestSha256',
    'runtimeArtifactAttestationSha256',
    'ownedProfileDigest',
    'artifactAttestationDigest',
  ]
  const keys = Object.keys(record).sort()
  if (JSON.stringify(keys) !== JSON.stringify([...expectedKeys].sort())
    || record.schemaVersion !== TEMPLATE_SCHEMA
    || typeof record.generation !== 'string' || !GENERATION.test(record.generation)
    || typeof record.profileManifestSha256 !== 'string' || !SHA256.test(record.profileManifestSha256)
    || typeof record.runtimeArtifactAttestationSha256 !== 'string' || !SHA256.test(record.runtimeArtifactAttestationSha256)
    || typeof record.ownedProfileDigest !== 'string' || !SHA256_DIGEST.test(record.ownedProfileDigest)
    || typeof record.artifactAttestationDigest !== 'string' || !SHA256_DIGEST.test(record.artifactAttestationDigest)) {
    throw new Error('sage shell: bundled profile template manifest has an unsupported shape')
  }
  return record as unknown as BundledProfileTemplateManifest
}

function expectedEmptyDirectories(paths: SagePaths): Set<string> {
  return new Set([
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
  ].map(path => relative(paths.root, path)).filter(path => path !== ''))
}

/** Finder junk: never Sage state, never evidence of a prior Sage life (ADR-0338). Tolerated at
 *  any depth — browsing the root in Finder is not a product action. */
const TOLERATED_JUNK_NAMES = new Set(['.DS_Store'])

/** Root-level files a PRE-ADR-0335 build could leave when the boot order still let Chromium's
 *  default userData be the Sage root (Local State, singleton lock/socket/cookie,
 *  DevToolsActivePort) or its crash reporter (Crashpad). Current builds cannot produce them
 *  (ADR-0335 order), so these names are legacy compatibility: tolerated by NAME at the root
 *  only — elsewhere they stay strict, and none of them is Sage-owned state. */
const TOLERATED_ROOT_NAMES = new Set([
  'Local State',
  'DevToolsActivePort',
  'SingletonLock',
  'SingletonSocket',
  'SingletonCookie',
  'Crashpad',
])

/**
 * A missing pointer is admissible only when the owned root contains no prior Sage state or
 * partial transaction. This check is synchronous and, since ADR-0335, runs AFTER
 * `configureElectronPaths` (the boot-time reconciler precedes both and needs Electron pointed
 * away from the root before its first await). Chromium's own runtime files therefore MAY already
 * exist: the `electron/**` subtree is treated as opaque, and the ADR-0338 name lists above
 * tolerate Finder junk anywhere and the pre-0335 root-level Chromium leftovers. Everything else
 * stays strict: every other unexpected entry, any file inside the owned directories, and any
 * symlink still fails closed, because all Sage-owned state (drafts, preferences, sessions,
 * policy) lives at the root level or under harness/**.
 */
export function assertBundledProfileAdmissibleSync(paths: SagePaths): void {
  const expected = expectedEmptyDirectories(paths)
  const opaque = relative(paths.root, paths.electronDir)
  const visit = (directory: string): void => {
    const atRoot = relative(paths.root, directory) === ''
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const portable = relative(paths.root, path)
      if (portable === opaque) continue
      if (TOLERATED_JUNK_NAMES.has(entry.name)) continue
      if (atRoot && TOLERATED_ROOT_NAMES.has(entry.name)) continue
      if (!isInside(paths.root, path) || entry.isSymbolicLink() || !entry.isDirectory() || !expected.has(portable)) {
        throw new Error('sage shell: refusing bundled profile install because the Sage data root is not pristine')
      }
      visit(path)
    }
  }
  visit(paths.root)
}

async function writeVerificationPointer(path: string, manifest: BundledProfileTemplateManifest, activatedAt: string): Promise<void> {
  const handle = await open(path, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify({
      schemaVersion: 1,
      generation: manifest.generation,
      manifestSha256: manifest.profileManifestSha256,
      activatedAt,
    }, null, 2)}\n`)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/**
 * Install a signed profile template exactly once. Existing valid activations win; a malformed
 * pointer, invalid receipt, or attestation drift fails closed without replacement. Pristine
 * admission of the data root is asserted by the boot path via `assertBundledProfileAdmissibleSync`
 * (after `configureElectronPaths` and the boot reconciler, ADR-0335) — this transaction must not
 * re-check it asynchronously, because Chromium's own session files land under `electron/` while
 * these awaits yield.
 */
export async function installBundledProfileTemplate(input: {
  readonly paths: SagePaths
  readonly templateRoot: string
  readonly now?: () => string
}): Promise<BundledProfileInstallResult> {
  await ensureSageDirectories(input.paths)
  const manifest = await readTemplateManifest(input.templateRoot)
  const existing = await readActiveProfile(input.paths)
  // The activation is idempotent ONLY against the identical signed template; a differing
  // manifest is a new release of the profile and rides the upgrade path (ADR-0332).
  if (existing !== null
    && existing.generation === manifest.generation
    && existing.manifestSha256 === manifest.profileManifestSha256) {
    return { state: 'existing', profile: existing }
  }
  if (existing !== null) {
    return upgradeBundledProfile(input, manifest, existing)
  }

  const source = join(input.templateRoot, BUNDLED_PROFILE_TEMPLATE_PROFILE_DIR)
  await assertDirectory(source, 'bundled profile template profile')
  const destination = generationProfileDir(input.paths, manifest.generation)
  if (existsSync(destination)) {
    throw new Error('sage shell: refusing bundled profile install because its generation already exists')
  }

  const transaction = join(input.paths.stagingDir, `bundled-${randomUUID()}`)
  const stage = join(transaction, manifest.generation)
  const verificationPointer = join(transaction, 'verify-profile-current.json')
  let moved = false
  try {
    const activatedAt = await stageTemplateGeneration(input, manifest, transaction, stage, verificationPointer)
    await rename(stage, destination)
    moved = true
    await writeActivePointer(input.paths, {
      generation: manifest.generation,
      manifestSha256: manifest.profileManifestSha256,
      activatedAt,
    })
    const installed = await readActiveProfile(input.paths)
    if (installed === null) throw new Error('sage shell: bundled profile activation did not produce an active profile')
    return { state: 'installed', profile: installed }
  } finally {
    // Before the immutable generation moves, the transaction is disposable. After the move,
    // activation failures retain it for diagnosis exactly like materializeProfile does.
    await rm(transaction, { recursive: true, force: true })
    if (!moved) await rm(destination, { recursive: true, force: true })
  }
}

/** Stage one template generation, verify it with the real activation validators, and return the
 *  activation instant. Shared by the fresh install and the upgrade swap (ADR-0332). */
async function stageTemplateGeneration(
  input: { readonly paths: SagePaths, readonly templateRoot: string, readonly now?: () => string },
  manifest: BundledProfileTemplateManifest,
  transaction: string,
  stage: string,
  verificationPointer: string,
): Promise<string> {
  const source = join(input.templateRoot, BUNDLED_PROFILE_TEMPLATE_PROFILE_DIR)
  await mkdir(transaction, { recursive: false, mode: 0o700 })
  await cp(source, stage, { recursive: true, errorOnExist: true, verbatimSymlinks: true })
  const profileManifest = await readFile(join(stage, 'profile-manifest.json'))
  if (sha256(profileManifest) !== manifest.profileManifestSha256) {
    throw new Error('sage shell: bundled profile receipt does not match its signed template manifest')
  }
  const activatedAt = (input.now ?? (() => new Date().toISOString()))()
  if (Number.isNaN(Date.parse(activatedAt))) {
    throw new Error('sage shell: bundled profile activation clock returned an invalid timestamp')
  }
  await writeVerificationPointer(verificationPointer, manifest, activatedAt)
  const verificationPaths: SagePaths = {
    ...input.paths,
    generationsDir: transaction,
    activeProfileFile: verificationPointer,
  }
  const verifiedProfile = await readActiveProfile(verificationPaths)
  if (verifiedProfile === null
    || verifiedProfile.runtimeArtifactAttestationSha256 !== manifest.runtimeArtifactAttestationSha256) {
    throw new Error('sage shell: bundled profile receipt does not seal the expected runtime attestation')
  }
  await verifyRuntimeArtifactAttestation({
    profileDir: stage,
    generation: manifest.generation,
    ownedProfileDigest: manifest.ownedProfileDigest,
    expectedArtifactAttestationDigest: manifest.artifactAttestationDigest,
  })
  await rm(verificationPointer, { force: true })
  return activatedAt
}

/** ADR-0332: replace the active generation with a freshly verified template generation. The
 *  pointer write is the commit point; before it the old tree is restored on any failure, and a
 *  hard kill between the two renames leaves the old generation under its displaced name — the
 *  boot fails closed (old pointer, missing tree) and the retained copy is the recovery source
 *  the activation note documents. */
async function upgradeBundledProfile(
  input: { readonly paths: SagePaths, readonly templateRoot: string, readonly now?: () => string },
  manifest: BundledProfileTemplateManifest,
  existing: ActiveProfile,
): Promise<BundledProfileInstallResult> {
  const source = join(input.templateRoot, BUNDLED_PROFILE_TEMPLATE_PROFILE_DIR)
  await assertDirectory(source, 'bundled profile template profile')
  const destination = generationProfileDir(input.paths, manifest.generation)
  const sameId = existing.generation === manifest.generation
  if (!sameId && existsSync(destination)) {
    throw new Error('sage shell: refusing bundled profile upgrade because its generation already exists')
  }

  const transaction = join(input.paths.stagingDir, `bundled-${randomUUID()}`)
  const stage = join(transaction, manifest.generation)
  const verificationPointer = join(transaction, 'verify-profile-current.json')
  const displaced = join(input.paths.stagingDir, `displaced-${randomUUID()}`)
  let swapped = false
  try {
    const activatedAt = await stageTemplateGeneration(input, manifest, transaction, stage, verificationPointer)
    if (sameId) await rename(destination, displaced)
    await rename(stage, destination)
    swapped = true
    await writeActivePointer(input.paths, {
      generation: manifest.generation,
      manifestSha256: manifest.profileManifestSha256,
      activatedAt,
    })
    const activated = await readActiveProfile(input.paths)
    if (activated === null) throw new Error('sage shell: bundled profile upgrade did not produce an active profile')
    await rm(displaced, { recursive: true, force: true })
    return { state: 'upgraded', profile: activated }
  } catch (error) {
    // The pointer still names the previous activation; put its tree back exactly.
    if (swapped) {
      try {
        await rm(destination, { recursive: true, force: true })
        if (sameId) await rename(displaced, destination)
      } catch {
        // The retained displaced copy stays for the documented recovery path.
      }
    }
    throw error
  } finally {
    await rm(transaction, { recursive: true, force: true })
  }
}
