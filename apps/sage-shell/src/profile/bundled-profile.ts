/** Installs the signed, build-time materialized profile on a packaged first run. */

import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, lstat, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises'
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

interface BundledProfileTemplateManifest {
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

async function readTemplateManifest(templateRoot: string): Promise<BundledProfileTemplateManifest> {
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

/** A missing pointer is installable only when the owned root contains no prior state or partial transaction. */
async function assertPristineOwnedRoot(paths: SagePaths): Promise<void> {
  const expected = expectedEmptyDirectories(paths)
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const portable = relative(paths.root, path)
      if (!isInside(paths.root, path) || entry.isSymbolicLink() || !entry.isDirectory() || !expected.has(portable)) {
        throw new Error('sage shell: refusing bundled profile install because the Sage data root is not pristine')
      }
      await visit(path)
    }
  }
  await visit(paths.root)
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
 * pointer, non-pristine root, invalid receipt, or attestation drift fails closed without replacement.
 */
export async function installBundledProfileTemplate(input: {
  readonly paths: SagePaths
  readonly templateRoot: string
  readonly now?: () => string
}): Promise<BundledProfileInstallResult> {
  await ensureSageDirectories(input.paths)
  const existing = await readActiveProfile(input.paths)
  if (existing !== null) return { state: 'existing', profile: existing }
  await assertPristineOwnedRoot(input.paths)

  const manifest = await readTemplateManifest(input.templateRoot)
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
