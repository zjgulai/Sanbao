/**
 * ADR-0335: boot-time reconciliation of the Sage-owned profile layout after an interrupted
 * bundled-profile transaction (the ADR-0332 kill windows — a hard kill skips every `finally`,
 * and no boot path ever repaired or collected the debris).
 *
 * Contract:
 * - Callers must have run `ensureSageDirectoriesSync` and `configureElectronPaths` first: the
 *   reconciler awaits for seconds (an adoption re-verifies a 27k-file tree), and before
 *   `configureElectronPaths` Chromium's default userData IS the Sage root, so an early await
 *   would let Chromium litter the root and self-brick the pristine admission.
 * - The plan is computed before any effect; the only actions that can throw are the two commit
 *   actions (the rollback rename and the adoption pointer write) — a failed removal of cosmetic
 *   debris must never brick a healthy root.
 * - Every state converges idempotently: a kill mid-reconcile is re-planned by the next boot, and
 *   the rollback branch deliberately does NOT roll forward — the restored tree differs from the
 *   current signed template, so the normal upgrade path re-runs the identical transaction.
 */
import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { readdirSync, lstatSync } from 'node:fs'
import { lstat, readFile, rename, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'
import {
  ACTIVE_PROFILE_FILE,
  PROFILE_MANIFEST_FILE,
  generationProfileDir,
  isProfileGenerationName,
  readActiveProfile,
  readActiveProfilePointer,
  readGenerationProfile,
  type SagePaths,
} from './paths.js'
import { readTemplateManifest, type BundledProfileTemplateManifest } from './bundled-profile.js'
import { verifyRuntimeArtifactAttestation } from './runtime-artifact-attestation.js'
import { writeActivePointer } from './materialize.js'

export type ProfileReconcileErrorCode =
  | 'active-generation-missing'
  | 'active-generation-unsafe'
  | 'displaced-ambiguous'
  | 'reconcile-commit-failed'

export class ProfileReconcileError extends Error {
  readonly code: ProfileReconcileErrorCode

  constructor(code: ProfileReconcileErrorCode, message: string, options: { readonly cause?: unknown } = {}) {
    super(message, options)
    this.name = 'ProfileReconcileError'
    this.code = code
  }
}

export interface ProfileReconcileInput {
  readonly paths: SagePaths
  /** The signed bundled template root (packaged only): orphan trees are compared against it. */
  readonly templateRoot: string
  /** Injectable activation clock, mirroring `stageTemplateGeneration` (bundled-profile.ts:206). */
  readonly now?: () => string
}

export type ProfileReconcileState = 'unchanged' | 'cleaned' | 'adopted' | 'rolled-back'

export interface ProfileReconcileResult {
  readonly state: ProfileReconcileState
  /** Root-relative paths of the entries restored or removed, in effect order. */
  readonly actions: readonly string[]
}

interface ReceiptIdentity {
  readonly generation: string
  readonly sha256: string
}

function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

/** `'dir'` for a real directory; `'missing'` for ENOENT; otherwise the obstruction kind. */
function entryKind(path: string): 'dir' | 'missing' | 'unsafe' {
  try {
    const entry = lstatSync(path)
    return !entry.isSymbolicLink() && entry.isDirectory() ? 'dir' : 'unsafe'
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing'
    throw error
  }
}

/** Cheap receipt identity for classification: regular file, parses, and carries the structural
 *  fields the full validator will re-hash anyway. Never the verification — only a filter that
 *  decides WHICH candidates get the full `readGenerationProfile` + attestation pass. */
async function readReceiptIdentity(dir: string): Promise<ReceiptIdentity | undefined> {
  try {
    const entry = await lstat(join(dir, PROFILE_MANIFEST_FILE))
    if (entry.isSymbolicLink() || !entry.isFile()) return undefined
    const bytes = await readFile(join(dir, PROFILE_MANIFEST_FILE))
    const value = JSON.parse(bytes.toString('utf8')) as { readonly schemaVersion?: unknown, readonly generation?: unknown, readonly files?: unknown }
    if (value === null || typeof value !== 'object'
      || value.schemaVersion !== 1 || typeof value.generation !== 'string' || !Array.isArray(value.files)) {
      return undefined
    }
    return { generation: value.generation, sha256: sha256(bytes) }
  } catch {
    return undefined
  }
}

/** The full in-place verification an adoption requires — the exact checks the install itself
 *  ran before renaming the tree into place (bundled-profile.ts stageTemplateGeneration). */
async function verifyAdoptable(paths: SagePaths, generation: string, manifest: BundledProfileTemplateManifest): Promise<boolean> {
  try {
    const validated = await readGenerationProfile(paths, generation, manifest.profileManifestSha256)
    if (validated.runtimeArtifactAttestationSha256 !== manifest.runtimeArtifactAttestationSha256) return false
    await verifyRuntimeArtifactAttestation({
      profileDir: validated.profileDir,
      generation,
      ownedProfileDigest: manifest.ownedProfileDigest,
      expectedArtifactAttestationDigest: manifest.artifactAttestationDigest,
    })
    return true
  } catch {
    return false
  }
}

/** Recover the activation instant of the killed transaction that produced this tree: its
 *  verify pointer survives whenever the pointer write never did (the transaction dir is removed
 *  only after the commit). Synthesizing `now` is the honest fallback — the pointer only
 *  requires a parseable instant. */
async function recoverActivatedAt(paths: SagePaths, generation: string, manifestSha256: string, now: () => string): Promise<string> {
  try {
    for (const entry of readdirSync(paths.stagingDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('bundled-')) continue
      const path = join(paths.stagingDir, entry.name, 'verify-profile-current.json')
      const stat = await lstat(path)
      if (stat.isSymbolicLink() || !stat.isFile()) continue
      const value = JSON.parse(await readFile(path, 'utf8')) as { readonly generation?: unknown, readonly manifestSha256?: unknown, readonly activatedAt?: unknown }
      if (value.generation === generation && value.manifestSha256 === manifestSha256
        && typeof value.activatedAt === 'string' && !Number.isNaN(Date.parse(value.activatedAt))) {
        return value.activatedAt
      }
    }
  } catch {
    // Fall through to the injected clock; recovery of the instant is cosmetic.
  }
  return now()
}

export async function reconcileProfileState(input: ProfileReconcileInput): Promise<ProfileReconcileResult> {
  const { paths } = input
  const now = input.now ?? (() => new Date().toISOString())
  const actions: string[] = []

  // A malformed pointer propagates untouched: not a kill state, and replacement is never silent.
  const pointer = await readActiveProfilePointer(paths)

  const stagingNames = readdirSync(paths.stagingDir).sort()

  // --- Commit action 1: rollback a displaced active generation (the deadly ADR-0332 window) ---
  let rolledBack = false
  let rolledBackConsumed: string | null = null
  if (pointer !== null && entryKind(generationProfileDir(paths, pointer.generation)) === 'missing') {
    const matches: string[] = []
    for (const name of stagingNames) {
      if (!name.startsWith('displaced-')) continue
      const dir = join(paths.stagingDir, name)
      if (entryKind(dir) !== 'dir') continue
      const identity = await readReceiptIdentity(dir)
      if (identity !== undefined && identity.generation === pointer.generation && identity.sha256 === pointer.manifestSha256) {
        matches.push(dir)
      }
    }
    if (matches.length === 0) {
      throw new ProfileReconcileError('active-generation-missing',
        `sage shell: active profile generation ${pointer.generation} is missing and no displaced copy restores it; `
        + `generation dir: ${generationProfileDir(paths, pointer.generation)}; staging: ${stagingNames.length === 0 ? '(empty)' : stagingNames.join(', ')}`)
    }
    if (matches.length > 1) {
      throw new ProfileReconcileError('displaced-ambiguous',
        `sage shell: ${matches.length} displaced copies match the active generation ${pointer.generation}; `
        + `resolve manually: ${matches.map(path => relative(paths.root, path)).join(', ')}`)
    }
    const destination = generationProfileDir(paths, pointer.generation)
    try {
      await rename(matches[0]!, destination)
    } catch (cause) {
      throw new ProfileReconcileError('reconcile-commit-failed',
        `sage shell: restoring the displaced active generation failed: ${matches[0]}`, { cause })
    }
    actions.push(relative(paths.root, matches[0]!))
    rolledBackConsumed = matches[0]!
    rolledBack = true
  }
  if (pointer !== null && entryKind(generationProfileDir(paths, pointer.generation)) === 'unsafe') {
    throw new ProfileReconcileError('active-generation-unsafe',
      `sage shell: the active profile generation is not a real directory: ${generationProfileDir(paths, pointer.generation)}`)
  }

  // --- Best-effort removals from here on: cosmetic debris never fails a boot ---
  const removeBestEffort = async (path: string): Promise<boolean> => {
    try {
      await rm(path, { recursive: true, force: true })
      actions.push(relative(paths.root, path))
      return true
    } catch {
      return false
    }
  }

  // The whole staging area is disposable scratch; the displaced copy consumed by the rollback
  // above was already renamed out and is skipped here.
  for (const name of stagingNames) {
    const path = join(paths.stagingDir, name)
    if (rolledBackConsumed !== null && path === rolledBackConsumed) continue
    await removeBestEffort(path)
  }

  // Root-level pointer temp files from a kill inside writeActivePointer (materialize.ts:324).
  const tempPrefix = `.${ACTIVE_PROFILE_FILE}.`
  for (const entry of readdirSync(paths.root, { withFileTypes: true })) {
    if (!entry.name.startsWith(tempPrefix) || !entry.name.endsWith('.tmp')) continue
    if (!entry.isFile() || entry.isSymbolicLink()) continue
    await removeBestEffort(join(paths.root, entry.name))
  }

  // --- Generation classification ---
  // A directory without a readable, self-consistent receipt is not a generation (real ones always
  // carry one); it can be neither a rollback source nor an adoption candidate, so it is debris.
  const generationNames = readdirSync(paths.generationsDir).sort()
  const viable: string[] = []
  for (const name of generationNames) {
    const dir = join(paths.generationsDir, name)
    if (entryKind(dir) !== 'dir' || !isProfileGenerationName(name)) {
      await removeBestEffort(dir)
      continue
    }
    const identity = await readReceiptIdentity(dir)
    if (identity === undefined || identity.generation !== name) {
      await removeBestEffort(dir)
      continue
    }
    viable.push(name)
  }

  const pointerGeneration = pointer?.generation ?? null
  const others = viable.filter(name => name !== pointerGeneration)
  let adoptedGeneration: string | null = null
  let consumedCandidate: string | null = null

  if (others.length > 0) {
    // The template is read lazily: a healthy boot never pays for it. If it cannot be read while
    // orphans exist, the error propagates before any removal — never classify against an unknown.
    const manifest = await readTemplateManifest(input.templateRoot)
    const candidates: string[] = []
    for (const name of others) {
      if (name !== manifest.generation) continue
      const identity = await readReceiptIdentity(join(paths.generationsDir, name))
      if (identity !== undefined && identity.generation === name && identity.sha256 === manifest.profileManifestSha256) {
        candidates.push(name)
      }
    }
    // Structural uniqueness: the receipt embeds the generation name and hashes into the signed
    // manifest, so at most one candidate exists; a second would mean two dirs with identical
    // receipt bytes, which the unique-name grammar already excludes.
    if (candidates.length > 0) {
      const candidate = candidates[0]!
      if (await verifyAdoptable(paths, candidate, manifest)) {
        try {
          await writeActivePointer(paths, {
            generation: candidate,
            manifestSha256: manifest.profileManifestSha256,
            activatedAt: await recoverActivatedAt(paths, candidate, manifest.profileManifestSha256, now),
          })
          const confirmed = await readActiveProfile(paths)
          if (confirmed === null) throw new Error('sage shell: adopted profile activation did not produce an active profile')
        } catch (cause) {
          throw new ProfileReconcileError('reconcile-commit-failed',
            `sage shell: adopting the interrupted generation ${candidate} failed`, { cause })
        }
        actions.push(`adopt:${candidate}`)
        adoptedGeneration = candidate
      } else if (await removeBestEffort(join(paths.generationsDir, candidate))) {
        // Corrupt roll-forward debris: removed so the normal upgrade path re-runs cleanly.
        consumedCandidate = candidate
      }
    }
  }

  // GC keep-1: the only non-active entries are rollback sources; keep the newest (mtime — the
  // only stamp that survives a rename) and drop the older ones. Ties keep everything.
  const activeGeneration = adoptedGeneration ?? pointerGeneration
  const stale = viable.filter(name => name !== activeGeneration && name !== consumedCandidate)
  if (stale.length > 1) {
    const stamped = stale.map(name => ({ name, mtimeMs: lstatSync(join(paths.generationsDir, name)).mtimeMs }))
    stamped.sort((left, right) => right.mtimeMs - left.mtimeMs)
    if (stamped[0]!.mtimeMs !== stamped[stamped.length - 1]!.mtimeMs) {
      for (const entry of stamped.slice(1)) {
        await removeBestEffort(join(paths.generationsDir, entry.name))
      }
    }
  }
  // A pointerless root that kept no adoptable tree must not keep any: the fresh install re-copies
  // from the signed template, and a leftover would trip its generation-already-exists refusal.
  if (pointer === null && adoptedGeneration === null) {
    for (const name of viable) {
      await removeBestEffort(join(paths.generationsDir, name))
    }
  }

  const state: ProfileReconcileState = rolledBack ? 'rolled-back' : adoptedGeneration !== null ? 'adopted' : actions.length > 0 ? 'cleaned' : 'unchanged'
  return { state, actions }
}
