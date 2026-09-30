import { constants, type BigIntStats } from 'node:fs'
import { createHash } from 'node:crypto'
import { lstat, open, readdir, readlink, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { types as utilTypes } from 'node:util'

import {
  sealExternalCapabilityArtifactSubject,
  type ExternalCapabilityArtifactSubjectV1,
} from './external-capability.js'

export type ExternalCapabilityArtifactObserverFailureCode =
  | 'artifact-manifest-invalid'
  | 'artifact-manifest-unsupported'
  | 'artifact-launch-unsafe'
  | 'artifact-root-invalid'
  | 'artifact-entry-unsupported'
  | 'artifact-symlink-unsafe'
  | 'artifact-read-failed'
  | 'artifact-tree-changed'
  | 'artifact-observation-limit'
  | 'artifact-observation-invalid'

export type ExternalCapabilityArtifactObserverResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{
    readonly ok: false
    readonly code: ExternalCapabilityArtifactObserverFailureCode
    readonly reason: string
  }>

export type ExternalCapabilityArtifactLogicalRole =
  | 'bridge'
  | 'sdk'
  | 'launcher'
  | 'interpreter'
  | 'server-entrypoint'

export interface ExternalCapabilityExecutionComponentV1 {
  readonly logicalRole: ExternalCapabilityArtifactLogicalRole
  readonly identity: string
  readonly version: string
  readonly relativeRoot: string
}

export interface ExternalCapabilityExecutionLaunchV1 {
  readonly interpreterRoot: 'components/interpreter'
  readonly entrypointPath: string
  readonly workingDirectoryPolicy: 'artifact-root'
  readonly shellPolicy: 'disabled'
  readonly pathResolutionPolicy: 'pinned-relative'
  readonly environmentPolicy: 'empty'
  readonly argumentPolicy: 'static-literals'
}

export interface ExternalCapabilityExecutionManifestV1 {
  readonly schemaVersion: 'sage.external-capability-execution-manifest.v1'
  readonly canonicalizationVersion: 'sage.external-capability-artifact-observer-canonical-json.v1'
  readonly transportKind: 'local-stdio'
  readonly processMode: 'interpreter-entrypoint'
  readonly packagePath: 'package.json'
  readonly lockfilePath: 'pnpm-lock.yaml'
  readonly components: readonly ExternalCapabilityExecutionComponentV1[]
  readonly launch: ExternalCapabilityExecutionLaunchV1
}

export interface ExternalCapabilityArtifactFileObservationV1 {
  readonly kind: 'file'
  readonly path: string
  readonly sha256: string
  readonly executable: boolean
}

export interface ExternalCapabilityArtifactSymlinkObservationV1 {
  readonly kind: 'symlink'
  readonly path: string
  readonly target: string
}

export type ExternalCapabilityArtifactEntryObservationV1 =
  | ExternalCapabilityArtifactFileObservationV1
  | ExternalCapabilityArtifactSymlinkObservationV1

export interface ExternalCapabilityArtifactObservationV1 {
  readonly schemaVersion: 'sage.external-capability-artifact-observation.v1'
  readonly canonicalizationVersion: 'sage.external-capability-artifact-observer-canonical-json.v1'
  readonly executionManifestDigest: string
  readonly launchEvidenceDigest: string
  readonly artifactSubject: ExternalCapabilityArtifactSubjectV1
  readonly artifactEvidenceDigest: string
}

export interface ObserveExternalCapabilityArtifactInputV1 {
  readonly artifactRoot: string
  readonly manifest: unknown
}

const MANIFEST_SCHEMA_VERSION = 'sage.external-capability-execution-manifest.v1'
const OBSERVATION_SCHEMA_VERSION = 'sage.external-capability-artifact-observation.v1'
const CANONICALIZATION_VERSION = 'sage.external-capability-artifact-observer-canonical-json.v1'
const MANIFEST_DIGEST = /^urn:sage:external-capability-execution-manifest:sha256:[0-9a-f]{64}$/u
const LAUNCH_DIGEST = /^urn:sage:external-capability-launch-evidence:sha256:[0-9a-f]{64}$/u
const ARTIFACT_EVIDENCE_DIGEST = /^urn:sage:external-capability-artifact-evidence:sha256:[0-9a-f]{64}$/u
const VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/u
const IDENTITY = /^[A-Za-z0-9@][A-Za-z0-9@/._:+-]{0,127}$/u
const RELATIVE_PATH = /^[^/\\\u0000][^\\\u0000]*$/u
const ROLES: readonly ExternalCapabilityArtifactLogicalRole[] = [
  'bridge',
  'sdk',
  'launcher',
  'interpreter',
  'server-entrypoint',
]
const MAX_ENTRIES = 4096
const MAX_TOTAL_BYTES = 64 * 1024 * 1024
const READ_BUFFER_SIZE = 64 * 1024

const FAILURE_REASONS: Readonly<Record<ExternalCapabilityArtifactObserverFailureCode, string>> = {
  'artifact-manifest-invalid': 'The external capability execution manifest is invalid.',
  'artifact-manifest-unsupported': 'The external capability execution manifest is unsupported.',
  'artifact-launch-unsafe': 'The external capability launch contract is unsafe.',
  'artifact-root-invalid': 'The external capability artifact root is invalid.',
  'artifact-entry-unsupported': 'The external capability artifact contains an unsupported entry.',
  'artifact-symlink-unsafe': 'The external capability artifact contains an unsafe symlink.',
  'artifact-read-failed': 'The external capability artifact could not be read safely.',
  'artifact-tree-changed': 'The external capability artifact changed during observation.',
  'artifact-observation-limit': 'The external capability artifact exceeds observation limits.',
  'artifact-observation-invalid': 'The external capability artifact observation is invalid.',
}

interface PlainRecord {
  readonly values: Readonly<Record<string, unknown>>
  readonly keys: readonly string[]
}

interface ParsedManifest {
  readonly value: ExternalCapabilityExecutionManifestV1
}

interface FileFingerprint {
  readonly dev: string
  readonly ino: string
  readonly mode: string
  readonly size: string
  readonly mtimeNs: string
  readonly ctimeNs: string
  readonly nlink: string
}

interface FileObservation {
  readonly kind: 'file'
  readonly path: string
  readonly sha256: string
  readonly executable: boolean
}

interface SymlinkObservation {
  readonly kind: 'symlink'
  readonly path: string
  readonly target: string
}

type InternalEntry = FileObservation | SymlinkObservation

interface ScanContext {
  entries: number
  bytes: number
}

interface ComponentObservation {
  readonly component: ExternalCapabilityExecutionComponentV1
  readonly entries: readonly InternalEntry[]
  readonly artifactDigest: string
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(member => canonicalJson(member)).join(',')}]`
  if (typeof value !== 'object' || value === null) {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new TypeError('Canonical value is invalid.')
    return encoded
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort(compareCodeUnits)
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function contentDigest(value: string): string {
  return `sha256:${hash(value)}`
}

function urnDigest(namespace: string, value: string): string {
  return `urn:sage:${namespace}:sha256:${hash(value)}`
}

function inspectPlainRecord(value: unknown): PlainRecord | undefined {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)
      || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) {
      return undefined
    }
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(descriptors)
    if (keys.some(key => typeof key !== 'string')) return undefined
    const values: Record<string, unknown> = Object.create(null)
    const names: string[] = []
    for (const key of keys) {
      if (typeof key !== 'string') return undefined
      const descriptor = descriptors[key]
      if (descriptor === undefined
        || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        return undefined
      }
      values[key] = descriptor.value
      names.push(key)
    }
    return { values, keys: names }
  } catch {
    return undefined
  }
}

function exactRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Readonly<Record<string, unknown>> | undefined {
  const inspected = inspectPlainRecord(value)
  if (inspected === undefined) return undefined
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  if (requiredKeys.some(key => !inspected.keys.includes(key))
    || inspected.keys.some(key => !allowed.has(key))) return undefined
  return inspected.values
}

function exactArray(value: unknown): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Array.prototype) return undefined
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<string, PropertyDescriptor>
    const lengthDescriptor = descriptors.length
    if (lengthDescriptor === undefined || !Object.hasOwn(lengthDescriptor, 'value')
      || typeof lengthDescriptor.value !== 'number' || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0 || Reflect.ownKeys(descriptors).length !== lengthDescriptor.value + 1) {
      return undefined
    }
    const result: unknown[] = []
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[String(index)]
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        return undefined
      }
      result.push(descriptor.value)
    }
    return result
  } catch {
    return undefined
  }
}

function exactString(value: unknown, pattern: RegExp, maxLength = 512): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength
    || value.trim() !== value || !pattern.test(value)) return undefined
  return value
}

function literalRelativePath(value: unknown): string | undefined {
  const path = exactString(value, RELATIVE_PATH, 512)
  if (path === undefined || isAbsolute(path) || path === '.' || path === '..'
    || path.split('/').some(part => part === '' || part === '.' || part === '..')) return undefined
  return path
}

function parseManifest(value: unknown): ExternalCapabilityArtifactObserverResult<ParsedManifest> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'transportKind',
    'processMode',
    'packagePath',
    'lockfilePath',
    'components',
    'launch',
  ])
  if (record === undefined) return failure('artifact-manifest-invalid')
  if (record.schemaVersion !== MANIFEST_SCHEMA_VERSION
    || record.canonicalizationVersion !== CANONICALIZATION_VERSION) {
    return failure('artifact-manifest-unsupported')
  }
  if (record.transportKind !== 'local-stdio' || record.processMode !== 'interpreter-entrypoint'
    || record.packagePath !== 'package.json' || record.lockfilePath !== 'pnpm-lock.yaml') {
    return failure('artifact-manifest-unsupported')
  }
  const rawComponents = exactArray(record.components)
  if (rawComponents === undefined || rawComponents.length !== ROLES.length) {
    return failure('artifact-manifest-invalid')
  }
  const roles = new Set<string>()
  const components: ExternalCapabilityExecutionComponentV1[] = []
  for (const rawComponent of rawComponents) {
    const component = exactRecord(rawComponent, ['logicalRole', 'identity', 'version', 'relativeRoot'])
    if (component === undefined || typeof component.logicalRole !== 'string'
      || !ROLES.includes(component.logicalRole as ExternalCapabilityArtifactLogicalRole)
      || roles.has(component.logicalRole)) return failure('artifact-manifest-invalid')
    const role = component.logicalRole as ExternalCapabilityArtifactLogicalRole
    const identity = exactString(component.identity, IDENTITY, 128)
    const version = exactString(component.version, VERSION, 64)
    const relativeRoot = literalRelativePath(component.relativeRoot)
    if (identity === undefined || version === undefined || relativeRoot !== `components/${role}`) {
      return failure('artifact-manifest-invalid')
    }
    const expectedPrefix = role === 'bridge' ? '@deepseek-ai/dsh-mcp-client'
      : role === 'sdk' ? '@modelcontextprotocol/sdk'
        : role === 'launcher' ? 'launcher:'
          : role === 'interpreter' ? 'runtime:' : 'server:'
    if (role === 'bridge' || role === 'sdk') {
      if (identity !== expectedPrefix) return failure('artifact-manifest-invalid')
    } else if (!identity.startsWith(expectedPrefix)) {
      return failure('artifact-manifest-invalid')
    }
    roles.add(role)
    components.push({ logicalRole: role, identity, version, relativeRoot })
  }
  if (ROLES.some(role => !roles.has(role))) return failure('artifact-manifest-invalid')

  const launch = exactRecord(record.launch, [
    'interpreterRoot',
    'entrypointPath',
    'workingDirectoryPolicy',
    'shellPolicy',
    'pathResolutionPolicy',
    'environmentPolicy',
    'argumentPolicy',
  ])
  if (launch === undefined) return failure('artifact-launch-unsafe')
  const entrypointPath = literalRelativePath(launch.entrypointPath)
  if (launch.interpreterRoot !== 'components/interpreter'
    || entrypointPath === undefined || !entrypointPath.startsWith('components/server-entrypoint/')
    || launch.workingDirectoryPolicy !== 'artifact-root'
    || launch.shellPolicy !== 'disabled'
    || launch.pathResolutionPolicy !== 'pinned-relative'
    || launch.environmentPolicy !== 'empty'
    || launch.argumentPolicy !== 'static-literals') return failure('artifact-launch-unsafe')

  return success({
    value: {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      canonicalizationVersion: CANONICALIZATION_VERSION,
      transportKind: 'local-stdio',
      processMode: 'interpreter-entrypoint',
      packagePath: 'package.json',
      lockfilePath: 'pnpm-lock.yaml',
      components: components.sort((left, right) => compareCodeUnits(left.logicalRole, right.logicalRole)),
      launch: {
        interpreterRoot: 'components/interpreter',
        entrypointPath,
        workingDirectoryPolicy: 'artifact-root',
        shellPolicy: 'disabled',
        pathResolutionPolicy: 'pinned-relative',
        environmentPolicy: 'empty',
        argumentPolicy: 'static-literals',
      },
    },
  })
}

function success<T>(value: T): ExternalCapabilityArtifactObserverResult<T> {
  return Object.freeze({ ok: true as const, value: freezeDeep(value) })
}

function failure<T>(code: ExternalCapabilityArtifactObserverFailureCode): ExternalCapabilityArtifactObserverResult<T> {
  return Object.freeze({ ok: false as const, code, reason: FAILURE_REASONS[code] })
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor !== undefined && Object.hasOwn(descriptor, 'value')) freezeDeep(descriptor.value)
  }
  return Object.freeze(value)
}

function fingerprint(stat: BigIntStats): FileFingerprint {
  return {
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: String(stat.mode),
    size: String(stat.size),
    mtimeNs: String(stat.mtimeNs),
    ctimeNs: String(stat.ctimeNs),
    nlink: String(stat.nlink),
  }
}

function sameFingerprint(left: FileFingerprint, right: FileFingerprint): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.size === right.size && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs && left.nlink === right.nlink
}

async function directoryNames(path: string): Promise<readonly string[]> {
  const entries = await readdir(path)
  return [...entries].sort(compareCodeUnits)
}

function pathInsideRoot(root: string, candidate: string): boolean {
  const remainder = relative(root, candidate)
  return remainder !== '' && !remainder.startsWith('..') && !isAbsolute(remainder)
}

async function scanFile(path: string, portablePath: string, context: ScanContext): Promise<FileObservation> {
  const before = await lstat(path, { bigint: true })
  if (!before.isFile()) throw new ObserverError('artifact-entry-unsupported')
  const beforeFingerprint = fingerprint(before)
  const executable = (before.mode & 0o111n) !== 0n
  let handle: Awaited<ReturnType<typeof open>> | undefined
  let total = 0
  const digest = createHash('sha256')
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const opened = await handle.stat({ bigint: true })
    if (!sameFingerprint(beforeFingerprint, fingerprint(opened))) throw new ObserverError('artifact-tree-changed')
    const buffer = Buffer.allocUnsafe(READ_BUFFER_SIZE)
    let position = 0
    while (true) {
      const result = await handle.read(buffer, 0, buffer.length, position)
      if (result.bytesRead === 0) break
      total += result.bytesRead
      context.bytes += result.bytesRead
      if (total > MAX_TOTAL_BYTES || context.entries > MAX_ENTRIES) throw new ObserverError('artifact-observation-limit')
      digest.update(buffer.subarray(0, result.bytesRead))
      position += result.bytesRead
    }
    const after = await handle.stat({ bigint: true })
    const pathAfter = await lstat(path, { bigint: true })
    if (!sameFingerprint(beforeFingerprint, fingerprint(after))
      || !sameFingerprint(beforeFingerprint, fingerprint(pathAfter))) {
      throw new ObserverError('artifact-tree-changed')
    }
    context.entries += 1
    if (context.entries > MAX_ENTRIES) throw new ObserverError('artifact-observation-limit')
    return { kind: 'file', path: portablePath, sha256: `sha256:${digest.digest('hex')}`, executable }
  } finally {
    await handle?.close()
  }
}

async function scanSymlink(
  root: string,
  path: string,
  portablePath: string,
  context: ScanContext,
): Promise<SymlinkObservation> {
  const before = await lstat(path, { bigint: true })
  if (!before.isSymbolicLink()) throw new ObserverError('artifact-entry-unsupported')
  const target = await readlink(path)
  if (target === '' || target.includes('\\') || target.includes('\u0000') || isAbsolute(target)) {
    throw new ObserverError('artifact-symlink-unsafe')
  }
  const resolvedTarget = resolve(path, '..', target)
  if (!pathInsideRoot(root, resolvedTarget)) throw new ObserverError('artifact-symlink-unsafe')
  try {
    const targetRealPath = await realpath(resolvedTarget)
    const rootRealPath = await realpath(root)
    if (!pathInsideRoot(rootRealPath, targetRealPath)) throw new ObserverError('artifact-symlink-unsafe')
  } catch (cause) {
    if (cause instanceof ObserverError) throw cause
    throw new ObserverError('artifact-symlink-unsafe')
  }
  const after = await lstat(path, { bigint: true })
  const targetAfter = await readlink(path)
  if (!sameFingerprint(fingerprint(before), fingerprint(after)) || target !== targetAfter) {
    throw new ObserverError('artifact-tree-changed')
  }
  context.entries += 1
  if (context.entries > MAX_ENTRIES) throw new ObserverError('artifact-observation-limit')
  return { kind: 'symlink', path: portablePath, target }
}

async function scanDirectory(root: string, directory: string, relativeDirectory: string, context: ScanContext): Promise<readonly InternalEntry[]> {
  const beforeStat = await lstat(directory, { bigint: true })
  if (!beforeStat.isDirectory() || beforeStat.isSymbolicLink()) throw new ObserverError('artifact-entry-unsupported')
  const beforeFingerprint = fingerprint(beforeStat)
  const beforeNames = await directoryNames(directory)
  const entries: InternalEntry[] = []
  for (const name of beforeNames) {
    const path = join(directory, name)
    const portablePath = `${relativeDirectory}/${name}`
    const stat = await lstat(path, { bigint: true })
    if (stat.isDirectory()) {
      entries.push(...await scanDirectory(root, path, portablePath, context))
    } else if (stat.isFile()) {
      entries.push(await scanFile(path, portablePath, context))
    } else if (stat.isSymbolicLink()) {
      entries.push(await scanSymlink(root, path, portablePath, context))
    } else {
      throw new ObserverError('artifact-entry-unsupported')
    }
  }
  const afterStat = await lstat(directory, { bigint: true })
  const afterNames = await directoryNames(directory)
  if (!sameFingerprint(beforeFingerprint, fingerprint(afterStat))
    || beforeNames.length !== afterNames.length
    || beforeNames.some((name, index) => name !== afterNames[index])) {
    throw new ObserverError('artifact-tree-changed')
  }
  return entries.sort((left, right) => compareCodeUnits(left.path, right.path))
}

async function observeRootShape(root: string, manifest: ExternalCapabilityExecutionManifestV1): Promise<void> {
  const rootStat = await lstat(root, { bigint: true })
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new ObserverError('artifact-root-invalid')
  const rootRealPath = await realpath(root)
  if (rootRealPath === '/' || rootRealPath.length === 0) throw new ObserverError('artifact-root-invalid')
  const rootNames = await directoryNames(root)
  const expectedRootNames = ['components', manifest.packagePath, manifest.lockfilePath].sort(compareCodeUnits)
  if (rootNames.length !== expectedRootNames.length || rootNames.some((name, index) => name !== expectedRootNames[index])) {
    throw new ObserverError('artifact-root-invalid')
  }
  const componentsRoot = join(root, 'components')
  const componentNames = await directoryNames(componentsRoot)
  const expectedComponentNames = [...ROLES].sort(compareCodeUnits)
  if (componentNames.length !== expectedComponentNames.length
    || componentNames.some((name, index) => name !== expectedComponentNames[index])) {
    throw new ObserverError('artifact-root-invalid')
  }
  for (const component of manifest.components) {
    const stat = await lstat(join(root, component.relativeRoot), { bigint: true })
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ObserverError('artifact-root-invalid')
  }
}

async function scanRootFile(root: string, relativePath: string, context: ScanContext): Promise<FileObservation> {
  const path = join(root, relativePath)
  const stat = await lstat(path, { bigint: true })
  if (!stat.isFile() || stat.isSymbolicLink()) throw new ObserverError('artifact-entry-unsupported')
  return scanFile(path, relativePath, context)
}

class ObserverError extends Error {
  readonly code: ExternalCapabilityArtifactObserverFailureCode

  constructor(code: ExternalCapabilityArtifactObserverFailureCode) {
    super(code)
    this.code = code
  }
}

async function observe(input: ObserveExternalCapabilityArtifactInputV1, manifest: ExternalCapabilityExecutionManifestV1): Promise<ExternalCapabilityArtifactObservationV1> {
  if (typeof input.artifactRoot !== 'string' || input.artifactRoot.trim() !== input.artifactRoot
    || !isAbsolute(input.artifactRoot)
    || input.artifactRoot.length === 0 || input.artifactRoot.length > 4096) {
    throw new ObserverError('artifact-root-invalid')
  }
  const root = resolve(input.artifactRoot)
  await observeRootShape(root, manifest)
  const context: ScanContext = { entries: 0, bytes: 0 }
  const packageFile = await scanRootFile(root, manifest.packagePath, context)
  const lockFile = await scanRootFile(root, manifest.lockfilePath, context)
  const componentObservations: ComponentObservation[] = []
  const executableEntries: Array<Pick<FileObservation, 'path' | 'executable'>> = []
  const symlinkEntries: SymlinkObservation[] = []
  for (const component of manifest.components) {
    const entries = await scanDirectory(root, join(root, component.relativeRoot), component.relativeRoot, context)
    for (const entry of entries) {
      if (entry.kind === 'file') executableEntries.push({ path: entry.path, executable: entry.executable })
      else symlinkEntries.push(entry)
    }
    const artifactDigest = contentDigest(canonicalJson({
      logicalRole: component.logicalRole,
      identity: component.identity,
      version: component.version,
      entries,
    }))
    componentObservations.push({ component, entries, artifactDigest })
  }
  const manifestDigest = urnDigest('external-capability-execution-manifest', canonicalJson(manifest))
  if (!MANIFEST_DIGEST.test(manifestDigest)) throw new ObserverError('artifact-observation-invalid')
  const components = componentObservations.map(({ component, artifactDigest }) => ({
    logicalRole: component.logicalRole,
    identity: component.identity,
    version: component.version,
    artifactDigest,
  }))
  const dependencyClosureDigest = contentDigest(canonicalJson(components))
  const packageInputsDigest = contentDigest(canonicalJson([
    { path: packageFile.path, sha256: packageFile.sha256 },
    { path: manifestDigest, sha256: manifestDigest },
  ]))
  const lockInputsDigest = contentDigest(canonicalJson([{ path: lockFile.path, sha256: lockFile.sha256 }]))
  const executablePolicyDigest = contentDigest(canonicalJson(executableEntries.sort((left, right) => compareCodeUnits(left.path, right.path))))
  const linkTopologyDigest = contentDigest(canonicalJson(symlinkEntries.sort((left, right) => compareCodeUnits(left.path, right.path))))
  const artifactSubject = sealExternalCapabilityArtifactSubject({
    schemaVersion: 'sage.external-capability-artifact-subject.v1',
    canonicalizationVersion: 'sage.external-capability-canonical-json.v1',
    transportKind: 'local-stdio',
    components,
    dependencyClosureDigest,
    packageInputsDigest,
    lockInputsDigest,
    executablePolicyDigest,
    linkTopologyDigest,
  })
  const launchEvidenceDigest = urnDigest('external-capability-launch-evidence', canonicalJson({
    executionManifestDigest: manifestDigest,
    launch: manifest.launch,
  }))
  if (!LAUNCH_DIGEST.test(launchEvidenceDigest)) throw new ObserverError('artifact-observation-invalid')
  const body: Omit<ExternalCapabilityArtifactObservationV1, 'artifactEvidenceDigest'> = {
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    executionManifestDigest: manifestDigest,
    launchEvidenceDigest,
    artifactSubject,
  }
  const artifactEvidenceDigest = urnDigest('external-capability-artifact-evidence', canonicalJson(body))
  if (!ARTIFACT_EVIDENCE_DIGEST.test(artifactEvidenceDigest)) throw new ObserverError('artifact-observation-invalid')
  return {
    ...body,
    artifactEvidenceDigest,
  }
}

export async function observeExternalCapabilityArtifact(
  input: ObserveExternalCapabilityArtifactInputV1,
): Promise<ExternalCapabilityArtifactObserverResult<ExternalCapabilityArtifactObservationV1>> {
  const parsed = parseManifest(input.manifest)
  if (!parsed.ok) return parsed
  try {
    return success(await observe(input, parsed.value.value))
  } catch (cause) {
    if (cause instanceof ObserverError) return failure(cause.code)
    if (cause instanceof TypeError) return failure('artifact-observation-invalid')
    return failure('artifact-read-failed')
  }
}

export function canonicalizeExternalCapabilityExecutionManifest(value: unknown): string {
  const parsed = parseManifest(value)
  if (!parsed.ok) throw new TypeError(parsed.reason)
  return canonicalJson(parsed.value.value)
}

export function computeExternalCapabilityExecutionManifestDigest(value: unknown): string {
  return urnDigest('external-capability-execution-manifest', canonicalizeExternalCapabilityExecutionManifest(value))
}

export function createExternalCapabilityArtifactObserver(): Readonly<{
  readonly observe: typeof observeExternalCapabilityArtifact
  readonly canonicalizeManifest: typeof canonicalizeExternalCapabilityExecutionManifest
  readonly computeManifestDigest: typeof computeExternalCapabilityExecutionManifestDigest
}> {
  return Object.freeze({
    observe: observeExternalCapabilityArtifact,
    canonicalizeManifest: canonicalizeExternalCapabilityExecutionManifest,
    computeManifestDigest: computeExternalCapabilityExecutionManifestDigest,
  })
}
