/** Materializes an immutable Sage profile generation, then atomically activates it. */

import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { copyFile, cp, lstat, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import {
  ACTIVE_PROFILE_FILE,
  PROFILE_MANIFEST_FILE,
  ensureSageDirectories,
  generationProfileDir,
  readActiveProfile,
  type SagePaths,
} from './paths.js'
import { composeProfileManifest, hostEntryPath, overlayPath, planMaterialize, type CopyPlan, type ProfileManifest } from './layout.js'

const PROFILE_MANIFEST_SCHEMA_VERSION = 1
const GENERATION_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/u

/** One materialized profile ready to be handed to the host child process. */
export interface MaterializedProfile {
  readonly generation: string
  readonly profileDir: string
  readonly hostEntry: string
  readonly overlay: string
  readonly manifestSha256: string
  readonly installed: true
}

/** Inputs accepted by the transaction; there is intentionally no arbitrary final profile path. */
export interface MaterializeProfileInput {
  readonly seedDir: string
  readonly shellRoot: string
  readonly paths: SagePaths
  /** Repository root composed package paths are relative to; defaults to `repoRootOf(shellRoot)`. */
  readonly repoRoot?: string
  readonly install?: (profileDir: string) => Promise<void>
  /** Deterministic fixture name only; omitted in production for a UUID generation. */
  readonly generation?: string
}

interface ProfileReceiptFile {
  readonly path: string
  readonly sha256: string
}

interface ProfileReceipt {
  readonly schemaVersion: typeof PROFILE_MANIFEST_SCHEMA_VERSION
  readonly generation: string
  readonly files: readonly ProfileReceiptFile[]
}

function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

function isLiteralRelativePath(value: string): boolean {
  return value.trim() === value && value !== '' && !value.includes('\\') && !value.includes('\u0000')
    && value.split('/').every(part => part !== '' && part !== '.' && part !== '..')
}

function assertComposedArtifacts(manifestPath: string, plan: CopyPlan): void {
  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (cause) {
    throw new Error(`sage shell: invalid composed package manifest ${manifestPath}: expected readable JSON`, { cause })
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || !('files' in manifest) || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error(`sage shell: invalid composed package manifest ${manifestPath}: files must be a nonempty array of literal relative file paths`)
  }
  const packageDir = dirname(manifestPath)
  const realPackageDir = realpathSync(packageDir)
  for (const file of manifest.files) {
    if (typeof file !== 'string' || !isLiteralRelativePath(file) || /[:*?\[\]{}()!\u0000-\u001f\u007f]/u.test(file)) {
      throw new Error(`sage shell: unsupported composed package files entry ${JSON.stringify(file)} in ${manifestPath}: expected a literal relative file path without patterns or traversal`)
    }
    const path = join(packageDir, file)
    if (!existsSync(path)) {
      throw new Error(`sage shell: missing composed package file ${path} — run pnpm run build in the owning package (${packageDir})`)
    }
    if (!statSync(path).isFile()) {
      throw new Error(`sage shell: unsupported composed package artifact ${path}: expected a regular file; directory expansion is not supported`)
    }
    if (!realpathSync(path).startsWith(`${realPackageDir}${sep}`)) {
      throw new Error(`sage shell: unsafe composed package artifact ${path}: resolves outside its package`)
    }
    if (!plan.entries.some(entry => entry.kind === 'composed-package'
      && (entry.from === path || (entry.recursive === true && path.startsWith(`${entry.from}${sep}`))))) {
      throw new Error(`sage shell: unsupported composed package artifact ${path}: not covered by the copy plan`)
    }
  }
}

function assertPlan(plan: CopyPlan): void {
  for (const entry of plan.entries) {
    if (existsSync(entry.from)) {
      if (entry.recursive === true && readdirSync(entry.from).length === 0) {
        throw new Error(`sage shell: composed package directory ${entry.from} is empty — run pnpm run build in the owning package`)
      }
      continue
    }
    if (entry.kind === 'seed') throw new Error(`sage shell: missing seed file ${entry.from}`)
    if (entry.kind === 'composed-package') {
      throw new Error(`sage shell: missing composed package file ${entry.from} — run pnpm run build in the owning package`)
    }
    throw new Error(`sage shell: built host runtime is missing ${entry.from} — run pnpm run build in apps/sage-shell`)
  }
  // A nonempty lib can still lack artifacts promised by its manifest.
  for (const entry of plan.entries) {
    if (entry.kind === 'composed-package' && basename(entry.from) === 'package.json') {
      assertComposedArtifacts(entry.from, plan)
    }
  }
}

function assertRegularFile(path: string): void {
  const entry = lstatSync(path)
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error(`sage shell: materialized profile contains a non-regular file at ${path}`)
  }
}

function assertTreeContainsNoSymlink(path: string): void {
  const entry = lstatSync(path)
  if (entry.isSymbolicLink()) throw new Error(`sage shell: materialized profile contains a symlink at ${path}`)
  if (entry.isFile()) return
  if (!entry.isDirectory()) throw new Error(`sage shell: materialized profile contains an unsupported entry at ${path}`)
  for (const child of readdirSync(path)) assertTreeContainsNoSymlink(join(path, child))
}

function assertMaterializedPlan(plan: CopyPlan): void {
  for (const entry of plan.entries) {
    if (entry.recursive === true) assertTreeContainsNoSymlink(entry.to)
    else assertRegularFile(entry.to)
  }
}

function assertGeneration(generation: string): void {
  if (!GENERATION_NAME.test(generation)) {
    throw new Error(`sage shell: invalid profile generation ${JSON.stringify(generation)}`)
  }
}

function assertWithin(root: string, target: string): void {
  const path = relative(root, target)
  if (path === '' || path === '..' || path.startsWith(`..${sep}`)) {
    throw new Error(`sage shell: transaction path escapes its Sage directory: ${target}`)
  }
}

/** Rewrite the copied profile manifest so it carries the composed packages. */
async function composeManifest(profileDir: string): Promise<void> {
  const path = join(profileDir, 'package.json')
  const manifest = JSON.parse(await readFile(path, 'utf8')) as ProfileManifest
  await writeFile(path, `${JSON.stringify(composeProfileManifest(manifest), null, 2)}\n`, { mode: 0o600 })
}

function plannedProfileFiles(plan: CopyPlan, profileDir: string): readonly string[] {
  const files = new Set<string>()
  for (const entry of plan.entries) {
    if (entry.recursive === true) {
      const visit = (path: string): void => {
        const entryStat = lstatSync(path)
        if (entryStat.isSymbolicLink()) throw new Error(`sage shell: materialized profile contains a symlink at ${path}`)
        if (entryStat.isFile()) {
          files.add(path)
          return
        }
        if (!entryStat.isDirectory()) throw new Error(`sage shell: materialized profile contains an unsupported entry at ${path}`)
        for (const child of readdirSync(path)) visit(join(path, child))
      }
      visit(entry.to)
    } else {
      files.add(entry.to)
    }
  }
  return [...files].sort((left, right) => relative(profileDir, left).localeCompare(relative(profileDir, right)))
}

async function snapshotOwnedFiles(profileDir: string, plan: CopyPlan): Promise<readonly ProfileReceiptFile[]> {
  return Promise.all(plannedProfileFiles(plan, profileDir).map(async (path) => {
    assertRegularFile(path)
    const relativePath = relative(profileDir, path)
    if (!isLiteralRelativePath(relativePath)) throw new Error(`sage shell: unsafe profile receipt path ${path}`)
    return { path: relativePath, sha256: sha256(await readFile(path)) }
  }))
}

async function assertOwnedFilesMatch(profileDir: string, files: readonly ProfileReceiptFile[]): Promise<void> {
  for (const file of files) {
    const path = join(profileDir, file.path)
    assertRegularFile(path)
    if (sha256(await readFile(path)) !== file.sha256) {
      throw new Error(`sage shell: materialized profile changed an owned file during install: ${file.path}`)
    }
  }
}

async function writeProfileReceipt(profileDir: string, generation: string, files: readonly ProfileReceiptFile[]): Promise<string> {
  const receipt: ProfileReceipt = {
    schemaVersion: PROFILE_MANIFEST_SCHEMA_VERSION,
    generation,
    files,
  }
  const receiptPath = join(profileDir, PROFILE_MANIFEST_FILE)
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 })
  assertRegularFile(receiptPath)
  return sha256(await readFile(receiptPath))
}

async function validateProfileReceipt(
  profileDir: string,
  generation: string,
  plan: CopyPlan,
  expectedFiles: readonly ProfileReceiptFile[],
): Promise<string> {
  assertMaterializedPlan(plan)
  const packagePath = join(profileDir, 'package.json')
  assertRegularFile(packagePath)
  let packageManifest: unknown
  try {
    packageManifest = JSON.parse(await readFile(packagePath, 'utf8'))
  } catch (cause) {
    throw new Error(`sage shell: materialized profile manifest is not valid JSON: ${packagePath}`, { cause })
  }
  if (!packageManifest || typeof packageManifest !== 'object' || Array.isArray(packageManifest)) {
    throw new Error(`sage shell: materialized profile manifest must be an object: ${packagePath}`)
  }
  const dsh = (packageManifest as { dsh?: unknown }).dsh
  if (!dsh || typeof dsh !== 'object' || Array.isArray(dsh)) {
    throw new Error(`sage shell: materialized profile manifest has no dsh configuration: ${packagePath}`)
  }
  const profile = (dsh as { profile?: unknown }).profile
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)
    || !Array.isArray((profile as { bundles?: unknown }).bundles)) {
    throw new Error(`sage shell: materialized profile manifest has no dsh.profile.bundles array: ${packagePath}`)
  }

  const entry = hostEntryPath(profileDir)
  const overlay = overlayPath(profileDir)
  assertRegularFile(entry)
  assertRegularFile(overlay)

  const receiptPath = join(profileDir, PROFILE_MANIFEST_FILE)
  assertRegularFile(receiptPath)
  let receiptValue: unknown
  try {
    receiptValue = JSON.parse(await readFile(receiptPath, 'utf8'))
  } catch (cause) {
    throw new Error(`sage shell: profile receipt is not valid JSON: ${receiptPath}`, { cause })
  }
  if (!receiptValue || typeof receiptValue !== 'object' || Array.isArray(receiptValue)) {
    throw new Error(`sage shell: profile receipt must be an object: ${receiptPath}`)
  }
  const receipt = receiptValue as Partial<ProfileReceipt>
  if (receipt.schemaVersion !== PROFILE_MANIFEST_SCHEMA_VERSION || receipt.generation !== generation || !Array.isArray(receipt.files)) {
    throw new Error(`sage shell: profile receipt has an unsupported shape: ${receiptPath}`)
  }
  if (receipt.files.length !== expectedFiles.length) throw new Error(`sage shell: profile receipt file count is incomplete: ${receiptPath}`)
  for (const [index, expected] of expectedFiles.entries()) {
    const item = receipt.files[index]
    if (!item || typeof item.path !== 'string' || typeof item.sha256 !== 'string'
      || item.path !== expected.path || !/^[a-f0-9]{64}$/u.test(item.sha256)
      || item.sha256 !== expected.sha256) {
      throw new Error(`sage shell: profile receipt does not validate ${expected.path}`)
    }
  }
  await assertOwnedFilesMatch(profileDir, expectedFiles)
  return sha256(await readFile(receiptPath))
}

async function copyPlan(plan: CopyPlan): Promise<void> {
  for (const entry of plan.entries) {
    await mkdir(dirname(entry.to), { recursive: true, mode: 0o700 })
    if (entry.recursive === true) await cp(entry.from, entry.to, { recursive: true, errorOnExist: true })
    else await copyFile(entry.from, entry.to)
  }
}

async function pointerExists(path: string): Promise<boolean> {
  try {
    const entry = await lstat(path)
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`sage shell: active profile pointer must be a regular file: ${path}`)
    }
    return true
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw cause
  }
}

async function writeActivePointer(paths: SagePaths, input: {
  generation: string
  manifestSha256: string
  activatedAt: string
}): Promise<void> {
  await pointerExists(paths.activeProfileFile)
  const temporary = join(paths.root, `.${ACTIVE_PROFILE_FILE}.${randomUUID()}.tmp`)
  assertWithin(paths.root, temporary)
  const pointer = {
    schemaVersion: 1,
    generation: input.generation,
    manifestSha256: input.manifestSha256,
    activatedAt: input.activatedAt,
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(`${JSON.stringify(pointer, null, 2)}\n`)
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporary, paths.activeProfileFile)
  } finally {
    await handle?.close()
    await rm(temporary, { force: true })
  }
}

/** Install profile dependencies with pnpm inside a stage, never an active generation. */
export function defaultInstall(profileDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['install', '--dir', profileDir, '--frozen-lockfile'], {
      cwd: profileDir,
      // stdout 直通终端：数分钟的 install 必须可观测，「在干活」与「卡住」不得同形。
      stdio: ['ignore', 'inherit', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.once('error', (error) => {
      reject(new Error(`sage shell: pnpm install failed to start: ${error.message}`))
    })
    child.once('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`sage shell: pnpm install failed with ${String(code)}: ${stderr.trim()}`))
    })
  })
}

/**
 * Build a new generation in staging and switch the active pointer only after
 * copied files, profile manifest, host entry, and receipt hashes all validate.
 * A failure leaves the prior active pointer untouched.
 */
export async function materializeProfile(input: MaterializeProfileInput): Promise<MaterializedProfile> {
  const generation = input.generation ?? randomUUID()
  assertGeneration(generation)
  await ensureSageDirectories(input.paths)
  // Fail closed rather than replacing a corrupt previous activation pointer.
  await readActiveProfile(input.paths)

  const destination = generationProfileDir(input.paths, generation)
  if (existsSync(destination)) {
    throw new Error(`sage shell: profile generation already exists: ${generation}`)
  }
  const stage = join(input.paths.stagingDir, `${generation}-${randomUUID()}`)
  assertWithin(input.paths.stagingDir, stage)
  let moved = false
  try {
    await mkdir(stage, { recursive: false, mode: 0o700 })
    const plan = planMaterialize({
      seedDir: input.seedDir,
      shellRoot: input.shellRoot,
      profileDir: stage,
      ...(input.repoRoot === undefined ? {} : { repoRoot: input.repoRoot }),
    })
    assertPlan(plan)
    await copyPlan(plan)
    await composeManifest(stage)
    const expectedFiles = await snapshotOwnedFiles(stage, plan)
    await (input.install ?? defaultInstall)(stage)
    await assertOwnedFilesMatch(stage, expectedFiles)
    const manifestSha256 = await writeProfileReceipt(stage, generation, expectedFiles)
    const verifiedManifestSha256 = await validateProfileReceipt(stage, generation, plan, expectedFiles)
    if (manifestSha256 !== verifiedManifestSha256) {
      throw new Error('sage shell: profile receipt changed during validation')
    }

    // The destination is an immutable UUID generation. Existing names reject
    // before this rename; no active generation is overwritten in place.
    if (existsSync(destination)) throw new Error(`sage shell: profile generation already exists: ${generation}`)
    await rename(stage, destination)
    moved = true
    const activatedAt = new Date().toISOString()
    await writeActivePointer(input.paths, { generation, manifestSha256, activatedAt })
    return {
      generation,
      profileDir: destination,
      hostEntry: hostEntryPath(destination),
      overlay: overlayPath(destination),
      manifestSha256,
      installed: true,
    }
  } finally {
    // A stage is disposable; an already-moved generation is intentionally
    // retained if pointer activation fails so a previous active profile stays recoverable.
    if (!moved) await rm(stage, { recursive: true, force: true })
  }
}
