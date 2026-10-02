/** Main-owned, short-lived observation of the currently active Sage Host. */

import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { types as utilTypes } from 'node:util'
import {
  readActiveProfile,
  type ActiveProfile,
  type SagePaths,
} from '../profile/paths.js'
import {
  RUNTIME_ARTIFACT_ATTESTATION_FILE,
  verifyRuntimeArtifactAttestation,
} from '../profile/runtime-artifact-attestation.js'

const PROJECTION_SCHEMA = 'sage.host-live-inventory-projection.v1'
const CANONICALIZATION_VERSION = 'sage.host-live-inventory-projection-canonical-json.v1'
const GENERATION = /^[a-z0-9][a-z0-9-]{0,63}$/u
const BOOT_ID = /^sage-host:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const RAW_SHA256 = /^[0-9a-f]{64}$/u
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u
const FRESHNESS_WINDOW_MILLISECONDS = 30_000

const ACTIVE_SNAPSHOT_KEYS = [
  'kind',
  'bootId',
  'runtimeGeneration',
  'activeGeneration',
  'manifestSha256',
  'loaderPhase',
  'hostProtocolVersion',
  'harnessVersion',
] as const

const UNAVAILABLE_SNAPSHOT_KEYS = ['kind', 'bootId', 'runtimeGeneration', 'reason'] as const

const PROJECTION_BODY_KEYS = [
  'schemaVersion',
  'canonicalizationVersion',
  'bootId',
  'runtimeGeneration',
  'activeGeneration',
  'manifestSha256',
  'loaderPhase',
  'hostProtocolVersion',
  'harnessVersion',
  'ownedProfileDigest',
  'artifactSetDigest',
  'installerMetadataDigest',
  'artifactAttestationDigest',
  'observedAt',
  'expiresAt',
] as const

const ATTESTATION_KEYS = [
  'schemaVersion',
  'canonicalizationVersion',
  'producerContractVersion',
  'generation',
  'ownedProfileDigest',
  'artifactSetDigest',
  'installerMetadataDigest',
  'artifactAttestationDigest',
] as const

export interface HostLiveInventoryActiveSnapshot {
  readonly kind: 'active'
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly activeGeneration: string
  readonly manifestSha256: string
  readonly loaderPhase: 'active'
  readonly hostProtocolVersion: '5'
  readonly harnessVersion: string
}

export type HostLiveInventoryUnavailableReason =
  | 'not-ready'
  | 'invalidated'
  | 'fatal'
  | 'exit'
  | 'disconnect'
  | 'stopped'

export interface HostLiveInventoryUnavailableSnapshot {
  readonly kind: 'unavailable'
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly reason: HostLiveInventoryUnavailableReason
}

export type HostLiveInventorySnapshot =
  | HostLiveInventoryActiveSnapshot
  | HostLiveInventoryUnavailableSnapshot

/** Structural port implemented by the main-owned ShellHostProcess. */
export interface HostLiveInventorySnapshotPort {
  readSnapshot(): unknown
}

/** Trusted composition supplies a synchronous wall-clock observation. */
export interface HostLiveInventoryClockPort {
  now(): unknown
}

export interface HostLiveInventoryProjectionBodyV1 {
  readonly schemaVersion: typeof PROJECTION_SCHEMA
  readonly canonicalizationVersion: typeof CANONICALIZATION_VERSION
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly activeGeneration: string
  /** Raw lowercase SHA-256 from profile-current.json. */
  readonly manifestSha256: string
  readonly loaderPhase: 'active'
  readonly hostProtocolVersion: '5'
  readonly harnessVersion: string
  readonly ownedProfileDigest: string
  readonly artifactSetDigest: string
  readonly installerMetadataDigest: string
  readonly artifactAttestationDigest: string
  readonly observedAt: string
  /** Exclusive end of the fixed 30-second freshness interval. */
  readonly expiresAt: string
}

export interface HostLiveInventoryProjectionV1 extends HostLiveInventoryProjectionBodyV1 {
  readonly projectionDigest: string
}

export type HostLiveInventoryUnavailableCode =
  | 'host-not-active'
  | 'host-runtime-invalidated'
  | 'active-profile-unavailable'
  | 'host-profile-mismatch'
  | 'active-profile-changed'
  | 'artifact-attestation-missing'
  | 'artifact-attestation-unsealed'
  | 'artifact-attestation-invalid'
  | 'clock-unavailable'
  | 'clock-regressed'

export interface HostLiveInventoryProjectionAvailable {
  readonly kind: 'available'
  readonly projection: HostLiveInventoryProjectionV1
}

export interface HostLiveInventoryProjectionUnavailable {
  readonly kind: 'unavailable'
  readonly code: HostLiveInventoryUnavailableCode
  readonly reason: string
}

export type HostLiveInventoryProjectionResult =
  | HostLiveInventoryProjectionAvailable
  | HostLiveInventoryProjectionUnavailable

export interface HostLiveInventoryProjectionProvider {
  read(): Promise<HostLiveInventoryProjectionResult>
}

const UNAVAILABLE_REASONS: Readonly<Record<HostLiveInventoryUnavailableCode, string>> = Object.freeze({
  'host-not-active': 'The Sage Host is not active.',
  'host-runtime-invalidated': 'The active Sage Host runtime was invalidated.',
  'active-profile-unavailable': 'No verified active Sage profile is available.',
  'host-profile-mismatch': 'The Sage Host does not match the verified active profile.',
  'active-profile-changed': 'The active Sage profile changed during observation.',
  'artifact-attestation-missing': 'The active Sage profile has no sealed runtime artifact attestation.',
  'artifact-attestation-unsealed': 'The runtime artifact attestation is not sealed by the active profile receipt.',
  'artifact-attestation-invalid': 'The installed runtime artifacts do not match their sealed attestation.',
  'clock-unavailable': 'A trusted observation time is unavailable.',
  'clock-regressed': 'The trusted observation time moved backwards.',
})

function unavailable(code: HostLiveInventoryUnavailableCode): HostLiveInventoryProjectionUnavailable {
  return Object.freeze({ kind: 'unavailable', code, reason: UNAVAILABLE_REASONS[code] })
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): Readonly<Record<string, unknown>> | undefined {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || utilTypes.isProxy(value)) return undefined
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return undefined
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(descriptors)
    if (keys.length !== expectedKeys.length
      || keys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))) return undefined
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

function isNonemptyLiteral(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value === value.trim() && !value.includes('\u0000')
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function parseHostSnapshot(value: unknown): HostLiveInventorySnapshot | undefined {
  const active = exactRecord(value, ACTIVE_SNAPSHOT_KEYS)
  if (active !== undefined && active.kind === 'active'
    && typeof active.bootId === 'string' && BOOT_ID.test(active.bootId)
    && isPositiveSafeInteger(active.runtimeGeneration)
    && typeof active.activeGeneration === 'string' && GENERATION.test(active.activeGeneration)
    && typeof active.manifestSha256 === 'string' && RAW_SHA256.test(active.manifestSha256)
    && active.loaderPhase === 'active'
    && active.hostProtocolVersion === '5'
    && isNonemptyLiteral(active.harnessVersion)) {
    return Object.freeze({
      kind: 'active',
      bootId: active.bootId,
      runtimeGeneration: active.runtimeGeneration,
      activeGeneration: active.activeGeneration,
      manifestSha256: active.manifestSha256,
      loaderPhase: 'active',
      hostProtocolVersion: active.hostProtocolVersion,
      harnessVersion: active.harnessVersion,
    })
  }
  const unavailableSnapshot = exactRecord(value, UNAVAILABLE_SNAPSHOT_KEYS)
  if (unavailableSnapshot !== undefined && unavailableSnapshot.kind === 'unavailable'
    && typeof unavailableSnapshot.bootId === 'string' && BOOT_ID.test(unavailableSnapshot.bootId)
    && isPositiveSafeInteger(unavailableSnapshot.runtimeGeneration)
    && (unavailableSnapshot.reason === 'not-ready' || unavailableSnapshot.reason === 'invalidated'
      || unavailableSnapshot.reason === 'fatal' || unavailableSnapshot.reason === 'exit'
      || unavailableSnapshot.reason === 'disconnect' || unavailableSnapshot.reason === 'stopped')) {
    return Object.freeze({
      kind: 'unavailable',
      bootId: unavailableSnapshot.bootId,
      runtimeGeneration: unavailableSnapshot.runtimeGeneration,
      reason: unavailableSnapshot.reason,
    })
  }
  return undefined
}

function readSnapshot(port: HostLiveInventorySnapshotPort): HostLiveInventorySnapshot | undefined {
  try {
    return parseHostSnapshot(port.readSnapshot())
  } catch {
    return undefined
  }
}

function profileMatchesHost(profile: ActiveProfile, host: HostLiveInventoryActiveSnapshot): boolean {
  return profile.generation === host.activeGeneration && profile.manifestSha256 === host.manifestSha256
}

function profilesMatch(left: ActiveProfile, right: ActiveProfile): boolean {
  return left.generation === right.generation
    && left.profileDir === right.profileDir
    && left.manifestSha256 === right.manifestSha256
    && left.activatedAt === right.activatedAt
    && left.runtimeArtifactAttestationSha256 === right.runtimeArtifactAttestationSha256
}

function parseCanonicalTimestamp(value: unknown): { readonly text: string; readonly milliseconds: number } | undefined {
  if (typeof value !== 'string') return undefined
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds)) return undefined
  try {
    if (new Date(milliseconds).toISOString() !== value) return undefined
  } catch {
    return undefined
  }
  return { text: value, milliseconds }
}

function parseProjectionBody(value: unknown): HostLiveInventoryProjectionBodyV1 | undefined {
  const record = exactRecord(value, PROJECTION_BODY_KEYS)
  if (record === undefined || record.schemaVersion !== PROJECTION_SCHEMA
    || record.canonicalizationVersion !== CANONICALIZATION_VERSION
    || typeof record.bootId !== 'string' || !BOOT_ID.test(record.bootId)
    || !isPositiveSafeInteger(record.runtimeGeneration)
    || typeof record.activeGeneration !== 'string' || !GENERATION.test(record.activeGeneration)
    || typeof record.manifestSha256 !== 'string' || !RAW_SHA256.test(record.manifestSha256)
    || record.loaderPhase !== 'active'
    || record.hostProtocolVersion !== '5'
    || !isNonemptyLiteral(record.harnessVersion)
    || typeof record.ownedProfileDigest !== 'string' || !SHA256_DIGEST.test(record.ownedProfileDigest)
    || typeof record.artifactSetDigest !== 'string' || !SHA256_DIGEST.test(record.artifactSetDigest)
    || typeof record.installerMetadataDigest !== 'string' || !SHA256_DIGEST.test(record.installerMetadataDigest)
    || typeof record.artifactAttestationDigest !== 'string' || !SHA256_DIGEST.test(record.artifactAttestationDigest)) {
    return undefined
  }
  const observedAt = parseCanonicalTimestamp(record.observedAt)
  const expiresAt = parseCanonicalTimestamp(record.expiresAt)
  if (observedAt === undefined || expiresAt === undefined
    || expiresAt.milliseconds - observedAt.milliseconds !== FRESHNESS_WINDOW_MILLISECONDS) return undefined
  return {
    schemaVersion: PROJECTION_SCHEMA,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    bootId: record.bootId,
    runtimeGeneration: record.runtimeGeneration,
    activeGeneration: record.activeGeneration,
    manifestSha256: record.manifestSha256,
    loaderPhase: 'active',
    hostProtocolVersion: record.hostProtocolVersion,
    harnessVersion: record.harnessVersion,
    ownedProfileDigest: record.ownedProfileDigest,
    artifactSetDigest: record.artifactSetDigest,
    installerMetadataDigest: record.installerMetadataDigest,
    artifactAttestationDigest: record.artifactAttestationDigest,
    observedAt: observedAt.text,
    expiresAt: expiresAt.text,
  }
}

/** Canonical field order is part of the V1 digest contract. */
export function canonicalizeHostLiveInventoryProjection(value: HostLiveInventoryProjectionBodyV1): string {
  const parsed = parseProjectionBody(value)
  if (parsed === undefined) throw new TypeError('Invalid HostLiveInventoryProjectionBodyV1.')
  return JSON.stringify(parsed)
}

export function computeHostLiveInventoryProjectionDigest(value: HostLiveInventoryProjectionBodyV1): string {
  return `sha256:${createHash('sha256').update(canonicalizeHostLiveInventoryProjection(value)).digest('hex')}`
}

async function readSealedAttestationCandidate(profile: ActiveProfile): Promise<{
  readonly ownedProfileDigest: string
  readonly artifactAttestationDigest: string
} | undefined> {
  const receiptSha256 = profile.runtimeArtifactAttestationSha256
  if (receiptSha256 === undefined) return undefined
  const path = join(profile.profileDir, RUNTIME_ARTIFACT_ATTESTATION_FILE)
  try {
    const entry = await lstat(path, { bigint: true })
    if (entry.isSymbolicLink() || !entry.isFile() || (entry.mode & 0o777n) !== 0o600n) return undefined
    const raw = await readFile(path)
    if (createHash('sha256').update(raw).digest('hex') !== receiptSha256) return undefined
    let value: unknown
    try {
      value = JSON.parse(raw.toString('utf8')) as unknown
    } catch {
      throw new TypeError('invalid attestation candidate')
    }
    const record = exactRecord(value, ATTESTATION_KEYS)
    if (record === undefined
      || typeof record.ownedProfileDigest !== 'string' || !SHA256_DIGEST.test(record.ownedProfileDigest)
      || typeof record.artifactAttestationDigest !== 'string' || !SHA256_DIGEST.test(record.artifactAttestationDigest)) {
      throw new TypeError('invalid attestation candidate')
    }
    return {
      ownedProfileDigest: record.ownedProfileDigest,
      artifactAttestationDigest: record.artifactAttestationDigest,
    }
  } catch (cause) {
    if (cause instanceof TypeError) throw cause
    return undefined
  }
}

/**
 * Create the stateful projection reader. Its only memory is the most recent
 * accepted trusted-clock value, used to fail closed on clock regression.
 */
export function createHostLiveInventoryProjectionProvider(input: {
  readonly paths: SagePaths
  readonly host: HostLiveInventorySnapshotPort
  readonly clock: HostLiveInventoryClockPort
}): HostLiveInventoryProjectionProvider {
  let lastObservedAtMilliseconds: number | undefined

  const read = async (): Promise<HostLiveInventoryProjectionResult> => {
    const hostA = readSnapshot(input.host)
    if (hostA === undefined) return unavailable('host-runtime-invalidated')
    if (hostA.kind === 'unavailable') {
      return unavailable(hostA.reason === 'not-ready' ? 'host-not-active' : 'host-runtime-invalidated')
    }

    let profileA: ActiveProfile | null
    try {
      profileA = await readActiveProfile(input.paths)
    } catch {
      return unavailable('active-profile-unavailable')
    }
    if (profileA === null) return unavailable('active-profile-unavailable')
    if (!profileMatchesHost(profileA, hostA)) return unavailable('host-profile-mismatch')
    if (profileA.runtimeArtifactAttestationSha256 === undefined) {
      return unavailable('artifact-attestation-missing')
    }

    let candidate: Awaited<ReturnType<typeof readSealedAttestationCandidate>>
    try {
      candidate = await readSealedAttestationCandidate(profileA)
    } catch {
      return unavailable('artifact-attestation-invalid')
    }
    if (candidate === undefined) return unavailable('artifact-attestation-unsealed')

    let attestation: Awaited<ReturnType<typeof verifyRuntimeArtifactAttestation>>
    try {
      attestation = await verifyRuntimeArtifactAttestation({
        profileDir: profileA.profileDir,
        generation: profileA.generation,
        ownedProfileDigest: candidate.ownedProfileDigest,
        expectedArtifactAttestationDigest: candidate.artifactAttestationDigest,
      })
    } catch {
      return unavailable('artifact-attestation-invalid')
    }

    let profileB: ActiveProfile | null
    try {
      profileB = await readActiveProfile(input.paths)
    } catch {
      return unavailable('active-profile-changed')
    }
    if (profileB === null || !profilesMatch(profileA, profileB)) return unavailable('active-profile-changed')

    const hostB = readSnapshot(input.host)
    if (hostB === undefined || hostB.kind !== 'active') return unavailable('host-runtime-invalidated')
    if (hostB.bootId !== hostA.bootId || hostB.runtimeGeneration !== hostA.runtimeGeneration
      || hostB.loaderPhase !== hostA.loaderPhase
      || hostB.hostProtocolVersion !== hostA.hostProtocolVersion
      || hostB.harnessVersion !== hostA.harnessVersion) {
      return unavailable('host-runtime-invalidated')
    }
    if (hostB.activeGeneration !== hostA.activeGeneration || hostB.manifestSha256 !== hostA.manifestSha256
      || !profileMatchesHost(profileB, hostB)) return unavailable('active-profile-changed')

    let timestamp: ReturnType<typeof parseCanonicalTimestamp>
    try {
      timestamp = parseCanonicalTimestamp(input.clock.now())
    } catch {
      return unavailable('clock-unavailable')
    }
    if (timestamp === undefined) return unavailable('clock-unavailable')
    if (lastObservedAtMilliseconds !== undefined && timestamp.milliseconds < lastObservedAtMilliseconds) {
      return unavailable('clock-regressed')
    }
    let expiresAt: string
    try {
      expiresAt = new Date(timestamp.milliseconds + FRESHNESS_WINDOW_MILLISECONDS).toISOString()
    } catch {
      return unavailable('clock-unavailable')
    }
    const body: HostLiveInventoryProjectionBodyV1 = {
      schemaVersion: PROJECTION_SCHEMA,
      canonicalizationVersion: CANONICALIZATION_VERSION,
      bootId: hostA.bootId,
      runtimeGeneration: hostA.runtimeGeneration,
      activeGeneration: hostA.activeGeneration,
      manifestSha256: hostA.manifestSha256,
      loaderPhase: 'active',
      hostProtocolVersion: hostA.hostProtocolVersion,
      harnessVersion: hostA.harnessVersion,
      ownedProfileDigest: attestation.ownedProfileDigest,
      artifactSetDigest: attestation.artifactSetDigest,
      installerMetadataDigest: attestation.installerMetadataDigest,
      artifactAttestationDigest: attestation.artifactAttestationDigest,
      observedAt: timestamp.text,
      expiresAt,
    }
    const projection = Object.freeze({
      ...body,
      projectionDigest: computeHostLiveInventoryProjectionDigest(body),
    })
    lastObservedAtMilliseconds = timestamp.milliseconds
    return Object.freeze({ kind: 'available', projection })
  }

  return Object.freeze({ read })
}
