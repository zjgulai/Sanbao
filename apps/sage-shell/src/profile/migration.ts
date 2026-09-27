/** Fail-closed fixture-only import harness for a later, explicitly approved legacy migration. */

import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/** A fixture root must carry this marker before the import harness will touch it. */
export const FIXTURE_IMPORT_MARKER = '.sage-fixture-import'

/** Written into the marker so a directory cannot become a fixture by accident. */
export const FIXTURE_IMPORT_MARKER_CONTENT = 'sage-fixture-import-v1\n'

/** Receipt written after every successful fixture-only import. */
export const FIXTURE_IMPORT_RECEIPT = 'fixture-import-receipt.json'

const RECEIPT_SCHEMA_VERSION = 1

/** Explicit opt-in input; production code has no caller for this P0-3A-only harness. */
export interface FixtureOnlyImportInput {
  readonly mode: 'fixture-only'
  readonly fixtureRoot: string
  readonly sourceDir: string
  readonly destinationDir: string
  /** Literal relative regular files only; globbing and directory copies are forbidden. */
  readonly allowlist: readonly string[]
}

export interface FixtureImportReceiptFile {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
}

export interface FixtureImportReceipt {
  readonly schemaVersion: typeof RECEIPT_SCHEMA_VERSION
  readonly mode: 'fixture-only'
  readonly files: readonly FixtureImportReceiptFile[]
}

function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

function isInside(root: string, target: string): boolean {
  const distance = relative(root, target)
  return distance === '' || (!distance.startsWith(`..${sep}`) && distance !== '..' && !isAbsolute(distance))
}

function resolveAbsolute(label: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\u0000') || !isAbsolute(value)) {
    throw new Error(`sage shell: ${label} must be a nonempty absolute path`)
  }
  return resolve(value)
}

function assertLiteralRelativePath(path: string): void {
  if (typeof path !== 'string' || path.trim() !== path || path === '' || path.includes('\\') || path.includes('\u0000')
    || path.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`sage shell: fixture import allowlist path is unsafe: ${JSON.stringify(path)}`)
  }
  if (path === FIXTURE_IMPORT_MARKER || path === FIXTURE_IMPORT_RECEIPT) {
    throw new Error(`sage shell: fixture import allowlist cannot include reserved file ${path}`)
  }
}

function assertAllowlist(allowlist: readonly string[]): readonly string[] {
  if (!Array.isArray(allowlist) || allowlist.length === 0) {
    throw new Error('sage shell: fixture import requires a nonempty explicit allowlist')
  }
  const seen = new Set<string>()
  for (const path of allowlist) {
    assertLiteralRelativePath(path)
    if (seen.has(path)) throw new Error(`sage shell: fixture import allowlist repeats ${path}`)
    seen.add(path)
  }
  return [...seen].sort((left, right) => left.localeCompare(right))
}

async function assertRealDirectory(path: string, label: string): Promise<string> {
  const entry = await lstat(path)
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error(`sage shell: ${label} must be a real directory, not a symlink or file: ${path}`)
  }
  return realpath(path)
}

async function fixtureRootOf(input: FixtureOnlyImportInput): Promise<string> {
  const root = resolveAbsolute('fixture root', input.fixtureRoot)
  const realRoot = await assertRealDirectory(root, 'fixture root')
  const marker = join(realRoot, FIXTURE_IMPORT_MARKER)
  let markerEntry
  try {
    markerEntry = await lstat(marker)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`sage shell: fixture root is missing the required ${FIXTURE_IMPORT_MARKER} marker`, { cause })
    }
    throw cause
  }
  if (markerEntry.isSymbolicLink() || !markerEntry.isFile() || await readFile(marker, 'utf8') !== FIXTURE_IMPORT_MARKER_CONTENT) {
    throw new Error(`sage shell: fixture root is missing the required ${FIXTURE_IMPORT_MARKER} marker`)
  }
  return realRoot
}

async function resolveSource(root: string, sourceDir: string): Promise<string> {
  const requested = resolveAbsolute('fixture import source', sourceDir)
  const source = await assertRealDirectory(requested, 'fixture import source')
  if (!isInside(root, source)) throw new Error('sage shell: fixture import source must remain inside its marker root')
  return source
}

async function resolveDestination(root: string, destinationDir: string): Promise<string> {
  const requested = resolveAbsolute('fixture import destination', destinationDir)
  try {
    await lstat(requested)
    throw new Error(`sage shell: fixture import destination already exists: ${requested}`)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
  }

  let ancestor = dirname(requested)
  for (;;) {
    try {
      const realAncestor = await assertRealDirectory(ancestor, 'fixture import destination parent')
      const destination = join(realAncestor, relative(ancestor, requested))
      if (destination === root || !isInside(root, destination)) {
        throw new Error('sage shell: fixture import destination must be a new descendant of its marker root')
      }
      return destination
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause
      const parent = dirname(ancestor)
      if (parent === ancestor) break
      ancestor = parent
    }
  }
  throw new Error('sage shell: fixture import destination has no existing parent inside its marker root')
}

async function sourceFile(root: string, source: string, relativePath: string): Promise<string> {
  const path = join(source, relativePath)
  let entry
  try {
    entry = await lstat(path)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`sage shell: fixture import source is missing a regular file: ${path}`, { cause })
    }
    throw cause
  }
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error(`sage shell: fixture import source must be a regular file: ${path}`)
  }
  const resolved = await realpath(path)
  if (!isInside(source, resolved) || !isInside(root, resolved)) {
    throw new Error(`sage shell: fixture import source file resolves outside its fixture root: ${path}`)
  }
  return path
}

async function writeReceipt(destination: string, files: readonly FixtureImportReceiptFile[]): Promise<FixtureImportReceipt> {
  const receipt: FixtureImportReceipt = {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    mode: 'fixture-only',
    files,
  }
  await writeFile(join(destination, FIXTURE_IMPORT_RECEIPT), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  return receipt
}

/**
 * Copy an explicit fixture allowlist into a fresh fixture destination and emit
 * a checksum receipt. This is deliberately not a legacy-data migration API.
 */
export async function stageFixtureOnlyImport(input: FixtureOnlyImportInput): Promise<FixtureImportReceipt> {
  if (input.mode !== 'fixture-only') throw new Error('sage shell: fixture import requires explicit fixture-only mode')
  const allowlist = assertAllowlist(input.allowlist)
  const fixtureRoot = await fixtureRootOf(input)
  const source = await resolveSource(fixtureRoot, input.sourceDir)
  const destination = await resolveDestination(fixtureRoot, input.destinationDir)
  if (isInside(source, destination) || isInside(destination, source)) {
    throw new Error('sage shell: fixture import source and destination must not overlap')
  }

  let created = false
  try {
    await mkdir(destination, { recursive: false, mode: 0o700 })
    created = true
    const files: FixtureImportReceiptFile[] = []
    for (const relativePath of allowlist) {
      const from = await sourceFile(fixtureRoot, source, relativePath)
      const to = join(destination, relativePath)
      if (!isInside(destination, to)) throw new Error(`sage shell: fixture import target escapes destination: ${relativePath}`)
      await mkdir(dirname(to), { recursive: true, mode: 0o700 })
      await copyFile(from, to)
      const copied = await lstat(to)
      if (copied.isSymbolicLink() || !copied.isFile()) {
        throw new Error(`sage shell: fixture import copied an unsafe target: ${to}`)
      }
      const sourceBytes = await readFile(from)
      const targetBytes = await readFile(to)
      if (!sourceBytes.equals(targetBytes)) throw new Error(`sage shell: fixture import checksum mismatch: ${relativePath}`)
      files.push({ path: relativePath, bytes: targetBytes.byteLength, sha256: sha256(targetBytes) })
    }
    return writeReceipt(destination, files)
  } catch (cause) {
    if (created) await rm(destination, { recursive: true, force: true })
    throw cause
  }
}

/** Re-read a fixture receipt and prove every copied file is still the recorded byte sequence. */
export async function verifyFixtureOnlyImport(input: {
  fixtureRoot: string
  destinationDir: string
}): Promise<FixtureImportReceipt> {
  const root = resolveAbsolute('fixture root', input.fixtureRoot)
  const markerInput: FixtureOnlyImportInput = {
    mode: 'fixture-only',
    fixtureRoot: root,
    sourceDir: root,
    destinationDir: input.destinationDir,
    allowlist: ['placeholder'],
  }
  const fixtureRoot = await fixtureRootOf(markerInput)
  const destination = await assertRealDirectory(resolveAbsolute('fixture import destination', input.destinationDir), 'fixture import destination')
  if (!isInside(fixtureRoot, destination)) throw new Error('sage shell: fixture import destination must remain inside its marker root')
  const receiptPath = join(destination, FIXTURE_IMPORT_RECEIPT)
  const entry = await lstat(receiptPath)
  if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('sage shell: fixture import receipt must be a regular file')
  let value: unknown
  try {
    value = JSON.parse(await readFile(receiptPath, 'utf8'))
  } catch (cause) {
    throw new Error('sage shell: fixture import receipt is not valid JSON', { cause })
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('sage shell: fixture import receipt must be an object')
  const receipt = value as Partial<FixtureImportReceipt>
  if (receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION || receipt.mode !== 'fixture-only' || !Array.isArray(receipt.files)) {
    throw new Error('sage shell: fixture import receipt has an unsupported shape')
  }
  const seen = new Set<string>()
  for (const item of receipt.files) {
    if (!item || typeof item.path !== 'string' || typeof item.bytes !== 'number' || typeof item.sha256 !== 'string') {
      throw new Error('sage shell: fixture import receipt contains an invalid file row')
    }
    assertLiteralRelativePath(item.path)
    if (seen.has(item.path)) throw new Error(`sage shell: fixture import receipt repeats ${item.path}`)
    seen.add(item.path)
    const path = join(destination, item.path)
    if (!isInside(destination, path)) throw new Error(`sage shell: fixture import receipt path escapes destination: ${item.path}`)
    const file = await lstat(path)
    if (file.isSymbolicLink() || !file.isFile()) throw new Error(`sage shell: fixture import receipt file is unsafe: ${item.path}`)
    const bytes = await readFile(path)
    if (bytes.byteLength !== item.bytes || sha256(bytes) !== item.sha256) {
      throw new Error(`sage shell: fixture import receipt checksum mismatch: ${item.path}`)
    }
  }
  return receipt as FixtureImportReceipt
}
