/**
 * Produces deterministic evidence for the bytes installed into one staged Sage
 * profile. Content identity is not provenance, compatibility, availability, or
 * execution authority; those decisions remain with their dedicated owners.
 */

import { constants, type BigIntStats } from 'node:fs'
import {
  chmod,
  lstat,
  mkdtemp,
  open,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
} from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { types as utilTypes } from 'node:util'

export const RUNTIME_ARTIFACT_ATTESTATION_FILE = 'runtime-artifact-attestation.json'

const INSTALLED_ARTIFACT_SET_SCHEMA = 'sage.installed-artifact-set.v1'
const ATTESTATION_SCHEMA = 'sage.runtime-artifact-attestation.v1'
const CANONICALIZATION_VERSION = 'sage.runtime-artifact-attestation-canonical-json.v2'
const PRODUCER_CONTRACT_VERSION = 'sage.runtime-artifact-attestation-producer.v1'
const INSTALLER_METADATA_SCHEMA = 'sage.installer-metadata-set.v1'
const GENERATION = /^[a-z0-9][a-z0-9-]{0,63}$/u
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u
const INSTALLER_METADATA_PATHS = new Set([
  'node_modules/.modules.yaml',
  'node_modules/.pnpm-workspace-state-v1.json',
])

export type RuntimeArtifactAttestationErrorCode =
  | 'artifact-root-missing'
  | 'artifact-root-empty'
  | 'artifact-root-unsafe'
  | 'artifact-path-invalid'
  | 'artifact-entry-unsupported'
  | 'artifact-symlink-unsafe'
  | 'artifact-read-failed'
  | 'artifact-tree-changed'
  | 'artifact-attestation-invalid'
  | 'artifact-attestation-digest-mismatch'
  | 'artifact-set-digest-mismatch'
  | 'installer-metadata-digest-mismatch'
  | 'generation-binding-mismatch'
  | 'owned-profile-binding-mismatch'
  | 'artifact-attestation-write-failed'
  | 'artifact-normalize-failed'

export class RuntimeArtifactAttestationError extends Error {
  readonly code: RuntimeArtifactAttestationErrorCode

  constructor(code: RuntimeArtifactAttestationErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'RuntimeArtifactAttestationError'
    this.code = code
  }
}

export interface InstalledArtifactDigestRefV1 {
  readonly path: string
  readonly sha256: string
}

export interface InstalledArtifactFileV1 {
  readonly kind: 'file'
  readonly path: string
  readonly sha256: string
  readonly executable: boolean
}

export interface InstalledArtifactSymlinkV1 {
  readonly kind: 'symlink'
  readonly path: string
  readonly target: string
}

export type InstalledArtifactEntryV1 = InstalledArtifactFileV1 | InstalledArtifactSymlinkV1

export interface InstalledArtifactSetV1 {
  readonly schemaVersion: typeof INSTALLED_ARTIFACT_SET_SCHEMA
  readonly canonicalizationVersion: typeof CANONICALIZATION_VERSION
  readonly rootPackage: InstalledArtifactDigestRefV1
  readonly rootLockfile: InstalledArtifactDigestRefV1
  readonly entries: readonly InstalledArtifactEntryV1[]
}

export interface InstalledArtifactInspectionV1 {
  readonly artifactSet: InstalledArtifactSetV1
  readonly artifactSetDigest: string
  readonly installerMetadataDigest: string
}

export interface RuntimeArtifactAttestationBodyV1 {
  readonly schemaVersion: typeof ATTESTATION_SCHEMA
  readonly canonicalizationVersion: typeof CANONICALIZATION_VERSION
  readonly producerContractVersion: typeof PRODUCER_CONTRACT_VERSION
  readonly generation: string
  readonly ownedProfileDigest: string
  readonly artifactSetDigest: string
  readonly installerMetadataDigest: string
}

export interface RuntimeArtifactAttestationV1 extends RuntimeArtifactAttestationBodyV1 {
  readonly artifactAttestationDigest: string
}

interface InstallerMetadataFileV1 {
  readonly path: string
  readonly sha256: string
}

interface ScanResult {
  readonly artifactSet: InstalledArtifactSetV1
  readonly artifactSetDigest: string
  readonly installerMetadata: readonly InstallerMetadataFileV1[]
  readonly installerMetadataDigest: string
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function digestBytes(content: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || utilTypes.isProxy(value)) {
      return undefined
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return undefined
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(descriptors)
    if (keys.length !== expectedKeys.length
      || keys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))) {
      return undefined
    }
    const snapshot: Record<string, unknown> = Object.create(null)
    for (const key of expectedKeys) {
      const descriptor = descriptors[key]
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        return undefined
      }
      snapshot[key] = descriptor.value
    }
    return snapshot
  } catch {
    return undefined
  }
}

function exactArray(value: unknown): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return undefined
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>
    const lengthDescriptor = descriptors.length
    if (lengthDescriptor === undefined || !Object.hasOwn(lengthDescriptor, 'value')
      || typeof lengthDescriptor.value !== 'number' || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0) {
      return undefined
    }
    const length = lengthDescriptor.value
    if (Reflect.ownKeys(descriptors).length !== length + 1) return undefined
    const snapshot: unknown[] = []
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)]
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        return undefined
      }
      snapshot.push(descriptor.value)
    }
    return snapshot
  } catch {
    return undefined
  }
}

function isLiteralRelativePath(value: string): boolean {
  return value !== '' && value === value.trim() && !value.includes('\\') && !value.includes('\u0000')
    && !isAbsolute(value) && value.split('/').every(part => part !== '' && part !== '.' && part !== '..')
}

function parseDigestRef(value: unknown, expectedPath: string): InstalledArtifactDigestRefV1 | undefined {
  const record = exactRecord(value, ['path', 'sha256'])
  if (record === undefined || record.path !== expectedPath || typeof record.sha256 !== 'string'
    || !SHA256_DIGEST.test(record.sha256)) {
    return undefined
  }
  return { path: expectedPath, sha256: record.sha256 }
}

function parseInstalledArtifactEntry(value: unknown): InstalledArtifactEntryV1 | undefined {
  const kindRecord = exactRecord(value, ['kind', 'path', 'sha256', 'executable'])
  if (kindRecord !== undefined && kindRecord.kind === 'file'
    && typeof kindRecord.path === 'string' && kindRecord.path.startsWith('node_modules/')
    && isLiteralRelativePath(kindRecord.path)
    && typeof kindRecord.sha256 === 'string' && SHA256_DIGEST.test(kindRecord.sha256)
    && typeof kindRecord.executable === 'boolean') {
    return {
      kind: 'file',
      path: kindRecord.path,
      sha256: kindRecord.sha256,
      executable: kindRecord.executable,
    }
  }
  const linkRecord = exactRecord(value, ['kind', 'path', 'target'])
  if (linkRecord !== undefined && linkRecord.kind === 'symlink'
    && typeof linkRecord.path === 'string' && linkRecord.path.startsWith('node_modules/')
    && isLiteralRelativePath(linkRecord.path)
    && typeof linkRecord.target === 'string' && linkRecord.target !== ''
    && !linkRecord.target.includes('\\') && !linkRecord.target.includes('\u0000')
    && !isAbsolute(linkRecord.target)) {
    return { kind: 'symlink', path: linkRecord.path, target: linkRecord.target }
  }
  return undefined
}

function parseInstalledArtifactSet(value: unknown): InstalledArtifactSetV1 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'rootPackage',
    'rootLockfile',
    'entries',
  ])
  if (record === undefined || record.schemaVersion !== INSTALLED_ARTIFACT_SET_SCHEMA
    || record.canonicalizationVersion !== CANONICALIZATION_VERSION) {
    return undefined
  }
  const rootPackage = parseDigestRef(record.rootPackage, 'package.json')
  const rootLockfile = parseDigestRef(record.rootLockfile, 'pnpm-lock.yaml')
  const inputEntries = exactArray(record.entries)
  if (rootPackage === undefined || rootLockfile === undefined || inputEntries === undefined || inputEntries.length === 0) {
    return undefined
  }
  const entries: InstalledArtifactEntryV1[] = []
  const paths = new Set<string>()
  for (const valueEntry of inputEntries) {
    const entry = parseInstalledArtifactEntry(valueEntry)
    if (entry === undefined || paths.has(entry.path) || INSTALLER_METADATA_PATHS.has(entry.path)) return undefined
    paths.add(entry.path)
    entries.push(entry)
  }
  entries.sort((left, right) => compareStrings(left.path, right.path))
  return {
    schemaVersion: INSTALLED_ARTIFACT_SET_SCHEMA,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    rootPackage,
    rootLockfile,
    entries,
  }
}

/** Canonical JSON is a hash input only; it does not assert provenance. */
export function canonicalizeInstalledArtifactSet(value: InstalledArtifactSetV1): string {
  const parsed = parseInstalledArtifactSet(value)
  if (parsed === undefined) throw new TypeError('Invalid InstalledArtifactSetV1.')
  return JSON.stringify({
    schemaVersion: INSTALLED_ARTIFACT_SET_SCHEMA,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    rootPackage: { path: 'package.json', sha256: parsed.rootPackage.sha256 },
    rootLockfile: { path: 'pnpm-lock.yaml', sha256: parsed.rootLockfile.sha256 },
    entries: parsed.entries.map(entry => entry.kind === 'file'
      ? { kind: 'file' as const, path: entry.path, sha256: entry.sha256, executable: entry.executable }
      : { kind: 'symlink' as const, path: entry.path, target: entry.target }),
  })
}

/** Computes content identity only; callers must not treat it as trust or compatibility. */
export function computeInstalledArtifactSetDigest(value: InstalledArtifactSetV1): string {
  return digestBytes(canonicalizeInstalledArtifactSet(value))
}

function parseAttestationBody(value: unknown): RuntimeArtifactAttestationBodyV1 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'producerContractVersion',
    'generation',
    'ownedProfileDigest',
    'artifactSetDigest',
    'installerMetadataDigest',
  ])
  if (record === undefined || record.schemaVersion !== ATTESTATION_SCHEMA
    || record.canonicalizationVersion !== CANONICALIZATION_VERSION
    || record.producerContractVersion !== PRODUCER_CONTRACT_VERSION
    || typeof record.generation !== 'string' || !GENERATION.test(record.generation)
    || typeof record.ownedProfileDigest !== 'string' || !SHA256_DIGEST.test(record.ownedProfileDigest)
    || typeof record.artifactSetDigest !== 'string' || !SHA256_DIGEST.test(record.artifactSetDigest)
    || typeof record.installerMetadataDigest !== 'string' || !SHA256_DIGEST.test(record.installerMetadataDigest)) {
    return undefined
  }
  return {
    schemaVersion: ATTESTATION_SCHEMA,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    producerContractVersion: PRODUCER_CONTRACT_VERSION,
    generation: record.generation,
    ownedProfileDigest: record.ownedProfileDigest,
    artifactSetDigest: record.artifactSetDigest,
    installerMetadataDigest: record.installerMetadataDigest,
  }
}

function canonicalizeAttestationBody(value: RuntimeArtifactAttestationBodyV1): string {
  const parsed = parseAttestationBody(value)
  if (parsed === undefined) throw new TypeError('Invalid RuntimeArtifactAttestationBodyV1.')
  return JSON.stringify(parsed)
}

/** Computes observation identity only; it is not an authorization credential. */
export function computeRuntimeArtifactAttestationDigest(value: RuntimeArtifactAttestationBodyV1): string {
  return digestBytes(canonicalizeAttestationBody(value))
}

function parseAttestation(value: unknown): RuntimeArtifactAttestationV1 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'producerContractVersion',
    'generation',
    'ownedProfileDigest',
    'artifactSetDigest',
    'installerMetadataDigest',
    'artifactAttestationDigest',
  ])
  if (record === undefined || typeof record.artifactAttestationDigest !== 'string'
    || !SHA256_DIGEST.test(record.artifactAttestationDigest)) {
    return undefined
  }
  const body = parseAttestationBody({
    schemaVersion: record.schemaVersion,
    canonicalizationVersion: record.canonicalizationVersion,
    producerContractVersion: record.producerContractVersion,
    generation: record.generation,
    ownedProfileDigest: record.ownedProfileDigest,
    artifactSetDigest: record.artifactSetDigest,
    installerMetadataDigest: record.installerMetadataDigest,
  })
  return body === undefined ? undefined : { ...body, artifactAttestationDigest: record.artifactAttestationDigest }
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function portablePath(profileDir: string, path: string): string {
  const portable = relative(profileDir, path).split(sep).join('/')
  if (!portable.startsWith('node_modules/') || !isLiteralRelativePath(portable)) {
    throw new RuntimeArtifactAttestationError(
      'artifact-path-invalid',
      `sage shell: installed artifact path is unsafe: ${portable}`,
    )
  }
  return portable
}

function sameSnapshot(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.nlink === right.nlink && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs
}

const MH_MAGIC_64 = 0xfeedfacf
const LC_SEGMENT_64 = 0x19
/** LC_SEGMENT_64 layout: cmd(4) cmdsize(4) segname(16) vmaddr(8) vmsize(8). */
const SEGMENT_VMSIZE_OFFSET = 32

const CODESIGN_ENV = Object.freeze({ LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin:/usr/sbin:/sbin' })

/**
 * Byte offset of `__LINKEDIT`'s `vmsize` in a thin 64-bit little-endian Mach-O. `codesign
 * --remove-signature` restores every other signed byte but leaves this field at the layout
 * computed while the file WAS signed; hashing the signature-stripped image without zeroing it
 * makes the digest depend on which signature a file happens to carry. Packaging-sage's
 * signing-normalized tree digest implements the identical rule (2026-10-10 DMG chain, ADR-0281);
 * both implementations are pinned by their own tests.
 */
export function linkeditVmsizeOffset(bytes: Uint8Array): number | null {
  const view = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (view.length < 32 || view.readUInt32LE(0) !== MH_MAGIC_64) {
    throw new RuntimeArtifactAttestationError(
      'artifact-normalize-failed',
      'sage shell: Mach-O normalization requires a thin 64-bit little-endian image',
    )
  }
  const ncmds = view.readUInt32LE(16)
  let offset = 32
  for (let index = 0; index < ncmds; index += 1) {
    if (offset + 8 > view.length) {
      throw new RuntimeArtifactAttestationError('artifact-normalize-failed', 'sage shell: Mach-O load commands run past the end of the file')
    }
    const command = view.readUInt32LE(offset)
    const commandSize = view.readUInt32LE(offset + 4)
    if (commandSize < 8 || offset + commandSize > view.length) {
      throw new RuntimeArtifactAttestationError('artifact-normalize-failed', 'sage shell: Mach-O load command has an invalid size')
    }
    if (command === LC_SEGMENT_64
      && view.toString('latin1', offset + 8, offset + 24).replace(/\0+$/u, '') === '__LINKEDIT') {
      return offset + SEGMENT_VMSIZE_OFFSET
    }
    offset += commandSize
  }
  return null
}

function withoutCodeSignature(tempPath: string): void {
  const result = spawnSync('/usr/bin/codesign', ['--remove-signature', tempPath], {
    encoding: 'utf8',
    env: CODESIGN_ENV,
    timeout: 30_000,
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error !== undefined) {
    throw new RuntimeArtifactAttestationError(
      'artifact-normalize-failed',
      `sage shell: could not normalize an installed Mach-O signature: ${result.error.message}`,
      result.error,
    )
  }
  if (result.status === 0) return
  const detail = `${result.stdout}\n${result.stderr}`
  if (/code object is not signed at all/iu.test(detail)) return
  throw new RuntimeArtifactAttestationError(
    'artifact-normalize-failed',
    `sage shell: could not normalize an installed Mach-O signature: ${detail.trim() || `exit ${String(result.status)}`}`,
  )
}

async function hashRegularFile(
  path: string,
  normalizeRoot: string,
): Promise<{ readonly sha256: string; readonly executable: boolean }> {
  const before = await lstat(path, { bigint: true })
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new RuntimeArtifactAttestationError(
      'artifact-entry-unsupported',
      `sage shell: installed artifact is not a regular file: ${path}`,
    )
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined
  let normalizeHandle: Awaited<ReturnType<typeof open>> | undefined
  let normalizePath: string | undefined
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const openedBefore = await handle.stat({ bigint: true })
    if (!openedBefore.isFile() || !sameSnapshot(before, openedBefore)) {
      throw new RuntimeArtifactAttestationError(
        'artifact-tree-changed',
        `sage shell: installed artifact changed before it could be read: ${path}`,
      )
    }
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(64 * 1024)
    let probe = Buffer.alloc(0)
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, null)
      if (bytesRead === 0) break
      const chunk = buffer.subarray(0, bytesRead)
      if (normalizeHandle !== undefined) {
        await normalizeHandle.write(chunk)
        continue
      }
      if (chunk.length + probe.length < 4) {
        probe = Buffer.concat([probe, chunk])
        continue
      }
      const head = probe.length === 0 ? chunk : Buffer.concat([probe, chunk])
      if (head.readUInt32LE(0) !== MH_MAGIC_64) {
        hash.update(head)
        probe = Buffer.alloc(0)
        continue
      }
      // A thin 64-bit Mach-O: hash a private, signature-stripped copy instead of the raw bytes.
      // The packaged profile template is re-signed per build, so raw bytes can never match the
      // pre-signing attestation the template was produced with (first packaged acceptance,
      // 2026-10-10: exactly the 13 re-signed natives drifted).
      normalizePath = join(normalizeRoot, createHash('sha1').update(path).digest('hex'))
      normalizeHandle = await open(normalizePath, 'wx', 0o600)
      await normalizeHandle.write(head)
      probe = Buffer.alloc(0)
    }
    const openedAfter = await handle.stat({ bigint: true })
    const pathAfter = await lstat(path, { bigint: true })
    if (!sameSnapshot(openedBefore, openedAfter) || !sameSnapshot(openedAfter, pathAfter)) {
      throw new RuntimeArtifactAttestationError(
        'artifact-tree-changed',
        `sage shell: installed artifact changed while it was being read: ${path}`,
      )
    }
    if (normalizeHandle !== undefined) {
      await normalizeHandle.close()
      normalizeHandle = undefined
      withoutCodeSignature(normalizePath as string)
      const bytes = await readFile(normalizePath as string)
      const vmsizeOffset = linkeditVmsizeOffset(bytes)
      if (vmsizeOffset === null) {
        throw new RuntimeArtifactAttestationError(
          'artifact-normalize-failed',
          `sage shell: installed Mach-O image has no __LINKEDIT segment: ${path}`,
        )
      }
      bytes.writeBigUInt64LE(0n, vmsizeOffset)
      return {
        sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
        executable: (openedAfter.mode & 0o111n) !== 0n,
      }
    }
    if (probe.length > 0) hash.update(probe)
    return {
      sha256: `sha256:${hash.digest('hex')}`,
      executable: (openedAfter.mode & 0o111n) !== 0n,
    }
  } finally {
    await normalizeHandle?.close()
    await handle?.close()
  }
}

async function inspectSymlink(
  nodeModulesRoot: string,
  nodeModulesReal: string,
  path: string,
  artifactPath: string,
): Promise<InstalledArtifactSymlinkV1> {
  let before: BigIntStats
  let target: string
  try {
    before = await lstat(path, { bigint: true })
    target = await readlink(path)
  } catch (cause) {
    throw new RuntimeArtifactAttestationError(
      'artifact-symlink-unsafe',
      `sage shell: installed artifact symlink cannot be inspected: ${artifactPath}`,
      cause,
    )
  }
  if (!before.isSymbolicLink() || target === '' || target.includes('\\') || target.includes('\u0000') || isAbsolute(target)) {
    throw new RuntimeArtifactAttestationError(
      'artifact-symlink-unsafe',
      `sage shell: installed artifact symlink is not a safe relative link: ${artifactPath}`,
    )
  }
  const lexicalTarget = resolve(dirname(path), target)
  if (!isWithin(nodeModulesRoot, lexicalTarget)) {
    throw new RuntimeArtifactAttestationError(
      'artifact-symlink-unsafe',
      `sage shell: installed artifact symlink escapes node_modules: ${artifactPath}`,
    )
  }
  let resolvedTarget: string
  try {
    resolvedTarget = await realpath(path)
  } catch (cause) {
    throw new RuntimeArtifactAttestationError(
      'artifact-symlink-unsafe',
      `sage shell: installed artifact symlink is dangling or cyclic: ${artifactPath}`,
      cause,
    )
  }
  if (!isWithin(nodeModulesReal, resolvedTarget)) {
    throw new RuntimeArtifactAttestationError(
      'artifact-symlink-unsafe',
      `sage shell: installed artifact symlink resolves outside node_modules: ${artifactPath}`,
    )
  }
  const resolvedStat = await lstat(resolvedTarget, { bigint: true })
  const canonicalLinkPath = join(await realpath(dirname(path)), basename(path))
  if (resolvedStat.isDirectory() && isWithin(resolvedTarget, canonicalLinkPath)) {
    throw new RuntimeArtifactAttestationError(
      'artifact-symlink-unsafe',
      `sage shell: installed artifact symlink creates an ancestor cycle: ${artifactPath}`,
    )
  }
  const after = await lstat(path, { bigint: true })
  const targetAfter = await readlink(path)
  if (!after.isSymbolicLink() || !sameSnapshot(before, after) || targetAfter !== target) {
    throw new RuntimeArtifactAttestationError(
      'artifact-tree-changed',
      `sage shell: installed artifact symlink changed while it was inspected: ${artifactPath}`,
    )
  }
  return { kind: 'symlink', path: artifactPath, target }
}

async function scanOnce(profileDir: string): Promise<ScanResult> {
  const normalizeRoot = await mkdtemp(join(tmpdir(), 'sage-attestation-normalize-'))
  try {
    return await scanPaths(profileDir, normalizeRoot)
  } finally {
    await rm(normalizeRoot, { recursive: true, force: true })
  }
}

async function scanPaths(profileDir: string, normalizeRoot: string): Promise<ScanResult> {
  const rootPackagePath = join(profileDir, 'package.json')
  const rootLockfilePath = join(profileDir, 'pnpm-lock.yaml')
  const nodeModulesRoot = join(profileDir, 'node_modules')
  let rootEntry: BigIntStats
  try {
    rootEntry = await lstat(nodeModulesRoot, { bigint: true })
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new RuntimeArtifactAttestationError(
        'artifact-root-missing',
        `sage shell: installed artifact root is missing: ${nodeModulesRoot}`,
        cause,
      )
    }
    throw cause
  }
  if (rootEntry.isSymbolicLink() || !rootEntry.isDirectory()) {
    throw new RuntimeArtifactAttestationError(
      'artifact-root-unsafe',
      `sage shell: installed artifact root must be a real directory: ${nodeModulesRoot}`,
    )
  }
  const [profileReal, nodeModulesReal] = await Promise.all([realpath(profileDir), realpath(nodeModulesRoot)])
  if (!isWithin(profileReal, nodeModulesReal)) {
    throw new RuntimeArtifactAttestationError(
      'artifact-root-unsafe',
      `sage shell: installed artifact root resolves outside its profile: ${nodeModulesRoot}`,
    )
  }

  const [rootPackage, rootLockfile] = await Promise.all([
    hashRegularFile(rootPackagePath, normalizeRoot),
    hashRegularFile(rootLockfilePath, normalizeRoot),
  ])
  const entries: InstalledArtifactEntryV1[] = []
  const installerMetadata: InstallerMetadataFileV1[] = []

  const visit = async (directory: string): Promise<void> => {
    const before = await lstat(directory, { bigint: true })
    if (before.isSymbolicLink() || !before.isDirectory()) {
      throw new RuntimeArtifactAttestationError(
        'artifact-entry-unsupported',
        `sage shell: installed artifact directory changed type: ${directory}`,
      )
    }
    const namesBefore = (await readdir(directory)).sort(compareStrings)
    for (const name of namesBefore) {
      if (name === '' || name === '.' || name === '..' || name.includes('\\') || name.includes('\u0000')) {
        throw new RuntimeArtifactAttestationError(
          'artifact-path-invalid',
          `sage shell: installed artifact name is unsafe: ${JSON.stringify(name)}`,
        )
      }
      const path = join(directory, name)
      const artifactPath = portablePath(profileDir, path)
      const entry = await lstat(path, { bigint: true })
      if (entry.isDirectory()) {
        await visit(path)
      } else if (entry.isFile()) {
        const hashed = await hashRegularFile(path, normalizeRoot)
        if (INSTALLER_METADATA_PATHS.has(artifactPath)) {
          installerMetadata.push({ path: artifactPath, sha256: hashed.sha256 })
        } else {
          entries.push({
            kind: 'file',
            path: artifactPath,
            sha256: hashed.sha256,
            executable: hashed.executable,
          })
        }
      } else if (entry.isSymbolicLink()) {
        entries.push(await inspectSymlink(nodeModulesRoot, nodeModulesReal, path, artifactPath))
      } else {
        throw new RuntimeArtifactAttestationError(
          'artifact-entry-unsupported',
          `sage shell: installed artifact contains a special filesystem entry: ${artifactPath}`,
        )
      }
    }
    const namesAfter = (await readdir(directory)).sort(compareStrings)
    const after = await lstat(directory, { bigint: true })
    if (!after.isDirectory() || !sameSnapshot(before, after)
      || JSON.stringify(namesAfter) !== JSON.stringify(namesBefore)) {
      throw new RuntimeArtifactAttestationError(
        'artifact-tree-changed',
        `sage shell: installed artifact directory changed while it was inspected: ${directory}`,
      )
    }
  }

  await visit(nodeModulesRoot)
  if (entries.length === 0) {
    throw new RuntimeArtifactAttestationError(
      'artifact-root-empty',
      `sage shell: installed artifact root has no portable runtime entries: ${nodeModulesRoot}`,
    )
  }
  entries.sort((left, right) => compareStrings(left.path, right.path))
  installerMetadata.sort((left, right) => compareStrings(left.path, right.path))
  const artifactSet: InstalledArtifactSetV1 = {
    schemaVersion: INSTALLED_ARTIFACT_SET_SCHEMA,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    rootPackage: { path: 'package.json', sha256: rootPackage.sha256 },
    rootLockfile: { path: 'pnpm-lock.yaml', sha256: rootLockfile.sha256 },
    entries,
  }
  const installerMetadataCanonical = JSON.stringify({
    schemaVersion: INSTALLER_METADATA_SCHEMA,
    files: installerMetadata,
  })
  return {
    artifactSet,
    artifactSetDigest: computeInstalledArtifactSetDigest(artifactSet),
    installerMetadata,
    installerMetadataDigest: digestBytes(installerMetadataCanonical),
  }
}

function freezeArtifactSet(value: InstalledArtifactSetV1): InstalledArtifactSetV1 {
  const entries = value.entries.map(entry => Object.freeze({ ...entry }))
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    canonicalizationVersion: value.canonicalizationVersion,
    rootPackage: Object.freeze({ ...value.rootPackage }),
    rootLockfile: Object.freeze({ ...value.rootLockfile }),
    entries: Object.freeze(entries),
  })
}

async function inspectInstalledArtifactSetInternal(profileDir: string): Promise<InstalledArtifactInspectionV1> {
  const first = await scanOnce(profileDir)
  const second = await scanOnce(profileDir)
  if (canonicalizeInstalledArtifactSet(first.artifactSet) !== canonicalizeInstalledArtifactSet(second.artifactSet)
    || first.installerMetadataDigest !== second.installerMetadataDigest
    || JSON.stringify(first.installerMetadata) !== JSON.stringify(second.installerMetadata)) {
    throw new RuntimeArtifactAttestationError(
      'artifact-tree-changed',
      'sage shell: installed artifact tree changed between verification scans',
    )
  }
  return Object.freeze({
    artifactSet: freezeArtifactSet(second.artifactSet),
    artifactSetDigest: second.artifactSetDigest,
    installerMetadataDigest: second.installerMetadataDigest,
  })
}

async function inspectInstalledArtifactSetOnce(profileDir: string): Promise<InstalledArtifactInspectionV1> {
  try {
    const scanned = await scanOnce(profileDir)
    return Object.freeze({
      artifactSet: freezeArtifactSet(scanned.artifactSet),
      artifactSetDigest: scanned.artifactSetDigest,
      installerMetadataDigest: scanned.installerMetadataDigest,
    })
  } catch (cause) {
    if (cause instanceof RuntimeArtifactAttestationError) throw cause
    throw new RuntimeArtifactAttestationError(
      'artifact-read-failed',
      `sage shell: failed to inspect installed runtime artifacts in ${profileDir}`,
      cause,
    )
  }
}

/** Inspect a staged profile twice and return only deterministic content evidence. */
export async function inspectInstalledArtifactSet(profileDir: string): Promise<InstalledArtifactInspectionV1> {
  try {
    return await inspectInstalledArtifactSetInternal(profileDir)
  } catch (cause) {
    if (cause instanceof RuntimeArtifactAttestationError) throw cause
    throw new RuntimeArtifactAttestationError(
      'artifact-read-failed',
      `sage shell: failed to inspect installed runtime artifacts in ${profileDir}`,
      cause,
    )
  }
}

function freezeAttestation(value: RuntimeArtifactAttestationV1): RuntimeArtifactAttestationV1 {
  return Object.freeze({ ...value })
}

function serializedAttestation(value: RuntimeArtifactAttestationV1): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function assertInputBinding(generation: string, ownedProfileDigest: string): void {
  if (!GENERATION.test(generation)) {
    throw new RuntimeArtifactAttestationError(
      'generation-binding-mismatch',
      `sage shell: invalid artifact attestation generation: ${JSON.stringify(generation)}`,
    )
  }
  if (!SHA256_DIGEST.test(ownedProfileDigest)) {
    throw new RuntimeArtifactAttestationError(
      'owned-profile-binding-mismatch',
      'sage shell: invalid owned profile digest for artifact attestation',
    )
  }
}

/** Create the fixed 0600 attestation file inside a not-yet-active generation. */
export async function createRuntimeArtifactAttestation(input: {
  readonly profileDir: string
  readonly generation: string
  readonly ownedProfileDigest: string
}): Promise<RuntimeArtifactAttestationV1> {
  assertInputBinding(input.generation, input.ownedProfileDigest)
  // Materialization calls create and then verify before activation. Each pass
  // has per-file and per-directory stability checks; their digest comparison
  // gives the transaction two independent full-tree observations without four
  // complete scans of a large pnpm tree.
  const inspection = await inspectInstalledArtifactSetOnce(input.profileDir)
  const body: RuntimeArtifactAttestationBodyV1 = {
    schemaVersion: ATTESTATION_SCHEMA,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    producerContractVersion: PRODUCER_CONTRACT_VERSION,
    generation: input.generation,
    ownedProfileDigest: input.ownedProfileDigest,
    artifactSetDigest: inspection.artifactSetDigest,
    installerMetadataDigest: inspection.installerMetadataDigest,
  }
  const attestation = freezeAttestation({
    ...body,
    artifactAttestationDigest: computeRuntimeArtifactAttestationDigest(body),
  })
  const path = join(input.profileDir, RUNTIME_ARTIFACT_ATTESTATION_FILE)
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(path, 'wx', 0o600)
    await handle.writeFile(serializedAttestation(attestation), 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await chmod(path, 0o600)
    const entry = await lstat(path, { bigint: true })
    if (entry.isSymbolicLink() || !entry.isFile() || (entry.mode & 0o777n) !== 0o600n) {
      throw new RuntimeArtifactAttestationError(
        'artifact-attestation-write-failed',
        `sage shell: artifact attestation was not sealed as a 0600 regular file: ${path}`,
      )
    }
    return attestation
  } catch (cause) {
    if (cause instanceof RuntimeArtifactAttestationError) throw cause
    throw new RuntimeArtifactAttestationError(
      'artifact-attestation-write-failed',
      `sage shell: failed to write runtime artifact attestation: ${path}`,
      cause,
    )
  } finally {
    await handle?.close()
  }
}

/** Parse the sealed file, recompute a fresh tree observation, and fail closed on any drift. */
export async function verifyRuntimeArtifactAttestation(input: {
  readonly profileDir: string
  readonly generation: string
  readonly ownedProfileDigest: string
  readonly expectedArtifactAttestationDigest?: string
}): Promise<RuntimeArtifactAttestationV1> {
  assertInputBinding(input.generation, input.ownedProfileDigest)
  if (input.expectedArtifactAttestationDigest !== undefined
    && !SHA256_DIGEST.test(input.expectedArtifactAttestationDigest)) {
    throw new RuntimeArtifactAttestationError(
      'artifact-attestation-digest-mismatch',
      'sage shell: expected artifact attestation digest is invalid',
    )
  }
  const path = join(input.profileDir, RUNTIME_ARTIFACT_ATTESTATION_FILE)
  let raw: string
  let value: unknown
  try {
    const entry = await lstat(path, { bigint: true })
    if (entry.isSymbolicLink() || !entry.isFile() || (entry.mode & 0o777n) !== 0o600n) {
      throw new RuntimeArtifactAttestationError(
        'artifact-attestation-invalid',
        `sage shell: runtime artifact attestation must be a 0600 regular file: ${path}`,
      )
    }
    raw = await readFile(path, 'utf8')
    value = JSON.parse(raw) as unknown
  } catch (cause) {
    if (cause instanceof RuntimeArtifactAttestationError) throw cause
    throw new RuntimeArtifactAttestationError(
      'artifact-attestation-invalid',
      `sage shell: runtime artifact attestation is unreadable or invalid JSON: ${path}`,
      cause,
    )
  }
  const parsed = parseAttestation(value)
  if (parsed === undefined || raw !== serializedAttestation(parsed)) {
    throw new RuntimeArtifactAttestationError(
      'artifact-attestation-invalid',
      `sage shell: runtime artifact attestation has a non-canonical or unsupported shape: ${path}`,
    )
  }
  const {
    artifactAttestationDigest,
    ...body
  } = parsed
  if (computeRuntimeArtifactAttestationDigest(body) !== artifactAttestationDigest
    || (input.expectedArtifactAttestationDigest !== undefined
      && input.expectedArtifactAttestationDigest !== artifactAttestationDigest)) {
    throw new RuntimeArtifactAttestationError(
      'artifact-attestation-digest-mismatch',
      'sage shell: runtime artifact attestation digest does not match its canonical body',
    )
  }
  if (parsed.generation !== input.generation) {
    throw new RuntimeArtifactAttestationError(
      'generation-binding-mismatch',
      'sage shell: runtime artifact attestation belongs to a different generation',
    )
  }
  if (parsed.ownedProfileDigest !== input.ownedProfileDigest) {
    throw new RuntimeArtifactAttestationError(
      'owned-profile-binding-mismatch',
      'sage shell: runtime artifact attestation belongs to a different owned profile',
    )
  }
  const inspection = await inspectInstalledArtifactSetOnce(input.profileDir)
  if (inspection.artifactSetDigest !== parsed.artifactSetDigest) {
    throw new RuntimeArtifactAttestationError(
      'artifact-set-digest-mismatch',
      'sage shell: installed runtime artifact set no longer matches its attestation',
    )
  }
  if (inspection.installerMetadataDigest !== parsed.installerMetadataDigest) {
    throw new RuntimeArtifactAttestationError(
      'installer-metadata-digest-mismatch',
      'sage shell: installer metadata no longer matches its attestation',
    )
  }
  return freezeAttestation(parsed)
}
