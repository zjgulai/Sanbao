/** WT-02C.2E.2: main-owned composition of the full runtime inventory. It merges the C2B
 * Host live projection (one trusted observation instant), the PMAP static component
 * evidence, the active profile / instance authority, and the C2D registry snapshot into a
 * stable `RuntimeDescriptorV2` plus a full `RuntimeInventoryEvidenceV2`. Any missing fact
 * is a named unavailable result — never a placeholder — and both digests are re-derived
 * from their canonical bodies before anything is returned. */

import { createHash } from 'node:crypto'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import {
  LOCAL_PATCH_FILE,
  readActiveProfile,
  type SagePaths,
} from '../profile/paths.js'
import { overlayPath } from '../profile/layout.js'
import { ROOT_CONFIG_CONTENT, SHELL_LABEL } from '../host/composition.js'
import {
  SHELL_HOST_PROTOCOL_VERSION,
  SHELL_PIPE_CHUNK_BYTES,
  SHELL_REQUEST_FRAME_KINDS,
  SHELL_REQUEST_PIPE_FD,
  SHELL_RESPONSE_FRAME_KINDS,
  SHELL_RESPONSE_PIPE_FD,
  isRuntimeEffectiveObservation,
  type RuntimeEffectiveObservation,
} from '../protocol.js'
import {
  collectPmapEvidence,
  type PmapComponentEvidence,
  type PmapFsPorts,
} from './runtime-inventory-pmap.js'
import type {
  HostLiveInventoryProjectionProvider,
  HostLiveInventoryProjectionV1,
} from './runtime-inventory.js'
import {
  parseCapabilityRegistrySnapshot,
  type CapabilityRegistryEntryBodyV1,
  type CapabilityRegistrySnapshotV1,
} from '../security/capability-registry.js'
import {
  computeInventoryEvidenceDigestV2,
  computeRuntimeDescriptorDigestV2,
  type RuntimeCapabilityDescriptorV2,
  type RuntimeComponentDescriptorV2,
  type RuntimeDescriptorBodyV2,
  type RuntimeDescriptorV2,
  type RuntimeInventoryEvidenceBodyV2,
  type RuntimeInventoryEvidenceV2,
} from '../security/compatibility.js'

export type RuntimeInventoryUnavailableCode =
  | 'host-projection-unavailable'
  | 'active-profile-unavailable'
  | 'pmap-incomplete'
  | 'policy-document-unavailable'
  | 'registry-unavailable'
  | 'capability-invalid'
  | 'runtime-effective-unavailable'
  | 'assembly-invalid'

export interface RuntimeInventoryAvailable {
  readonly kind: 'available'
  readonly descriptor: RuntimeDescriptorV2
  readonly evidence: RuntimeInventoryEvidenceV2
}

export interface RuntimeInventoryUnavailable {
  readonly kind: 'unavailable'
  readonly code: RuntimeInventoryUnavailableCode
  readonly reason: string
}

export type RuntimeInventoryResult = RuntimeInventoryAvailable | RuntimeInventoryUnavailable

export interface RuntimeInventoryProvider {
  read(): Promise<RuntimeInventoryResult>
}

/** Raw C2D snapshot reader; the snapshot is kernel-validated before any value is used. */
export interface RegistrySnapshotPort {
  read(): unknown
}

/** Raw runtime-effective observation reader (protocol v5 ready payload; WT-02C.2E.3). */
export interface RuntimeEffectiveObservationPort {
  read(): unknown
}

export interface RuntimeInventoryProviderInput {
  /** Active profile reading surface (receipt/attestation sha) inside the Sage root. */
  readonly paths: SagePaths
  /** Trusted Host live projection; production passes createHostLiveInventoryProjectionProvider. */
  readonly hostProjection: HostLiveInventoryProjectionProvider
  /** PMAP static-layer observation ports (WT-02C.2E-PMAP). */
  readonly pmapFs: PmapFsPorts
  /** Bounded document reader for the overlay patch, the local patch, and the presets manifest. */
  readonly readFileBytes: (absolutePath: string) => Buffer
  /** Absent until the C2D.2A registry provider lands; absence is unavailable, never empty capabilities. */
  readonly registry?: RegistrySnapshotPort
  /** Live runtime-effective registry observation (protocol v5 ready payload). */
  readonly runtimeEffective: RuntimeEffectiveObservationPort
}

const HOST_IDENTITY = 'host:sage-shell-host'
/** Formal SemVer form of the shell host protocol version — derived so a protocol bump moves it (ADR-0195). */
const HOST_VERSION = `${String(SHELL_HOST_PROTOCOL_VERSION)}.0.0`
const HARNESS_IDENTITY = 'harness:@deepseek-ai/dsh'
const PRESET_SET_IDENTITY = 'preset:set'
// `dsh-agent-presets` was deleted in 0.2.0-rc.2; the registry package is its successor
// (WT-02C.2E-PMAP.1, ADR-0194).
const PRESETS_MANIFEST_RELATIVE = 'node_modules/@deepseek-ai/dsh-agent-preset-registry/package.json'

/** Explicit protocol frame vocabulary, single-sourced from protocol.ts (frozen by sage-shell-pin). */
const FRAME_KINDS = Object.freeze({
  request: SHELL_REQUEST_FRAME_KINDS,
  response: SHELL_RESPONSE_FRAME_KINDS,
})

const UNAVAILABLE_REASONS: Readonly<Record<RuntimeInventoryUnavailableCode, string>> = Object.freeze({
  'host-projection-unavailable': 'The Host live inventory projection is unavailable.',
  'active-profile-unavailable': 'The active Sage profile is unavailable or does not match the Host projection.',
  'pmap-incomplete': 'The PMAP component evidence is incomplete.',
  'policy-document-unavailable': 'A shell policy document could not be read.',
  'registry-unavailable': 'The capability registry snapshot is unavailable.',
  'capability-invalid': 'An approved capability entry violated the runtime descriptor contract.',
  'runtime-effective-unavailable': 'The live runtime-effective registry observation is unavailable.',
  'assembly-invalid': 'The runtime inventory assembly failed self-verification.',
})

function unavailable(code: RuntimeInventoryUnavailableCode, reason?: string): RuntimeInventoryUnavailable {
  return Object.freeze({
    kind: 'unavailable' as const,
    code,
    reason: reason ?? UNAVAILABLE_REASONS[code],
  })
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sha256ContentDigest(content: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

const SAGE_URN = /^urn:sage:[a-z0-9-]+:sha256:([0-9a-f]{64})$/u

/** Reshape one PMAP/registry digest URN into the V2 content-digest form without rehashing. */
function contentDigestOf(urn: string): string {
  const match = SAGE_URN.exec(urn)
  if (match === null) throw new TypeError('Invalid Sage content digest URN.')
  return `sha256:${match[1] as string}`
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor !== undefined && Object.hasOwn(descriptor, 'value')) {
      freezeDeep(descriptor.value)
    }
  }
  return Object.freeze(value)
}

// The four top-level policy documents are defined by WT-02C.2E.2; their canonical key
// order and literal values are frozen by hand-written goldens in the provider spec.

function computeProtocolContractDigest(): string {
  return sha256ContentDigest(JSON.stringify({
    kind: 'sage.host-protocol-contract.v1',
    protocolVersion: SHELL_HOST_PROTOCOL_VERSION,
    fdPairing: [SHELL_REQUEST_PIPE_FD, SHELL_RESPONSE_PIPE_FD],
    frameKinds: FRAME_KINDS,
    chunkBytes: SHELL_PIPE_CHUNK_BYTES,
  }))
}

function computeLaunchPolicyDigest(): string {
  return sha256ContentDigest(JSON.stringify({
    kind: 'sage.host-launch-policy.v1',
    argvPolicy: '[]',
    envPolicy: {
      electronRunAsNode: '1',
      dshHome: 'harness-home',
      ambientDshHome: 'dropped',
      nodeBinary: 'SAGE_NODE_BINARY ?? execPath',
      launchEnvironmentKey: DSH_LAUNCH_ENVIRONMENT_KEY,
    },
    homeBinding: 'profile',
    loopback: 'oidc-callback-only',
  }))
}

function computeOverlayPolicyDigest(overlayBytes: Buffer, localPatchBytes: Buffer | undefined): string {
  return sha256ContentDigest(JSON.stringify({
    kind: 'sage.shell-overlay-policy.v1',
    rootConfig: ROOT_CONFIG_CONTENT,
    overlayPatch: sha256ContentDigest(overlayBytes),
    localPatch: localPatchBytes === undefined ? null : sha256ContentDigest(localPatchBytes),
  }))
}

function computeHarnessContractDigest(): string {
  return sha256ContentDigest(JSON.stringify({
    kind: 'sage.harness-boot-contract.v1',
    label: SHELL_LABEL,
    launchEnvironmentKey: DSH_LAUNCH_ENVIRONMENT_KEY,
    cmdline: 'provided',
    connection: `host-protocol-${String(SHELL_HOST_PROTOCOL_VERSION)}`,
  }))
}

type PmapFace = 'identity' | 'version' | 'artifactDigest' | 'contractDigest' | 'behaviorConfigurationDigest'

const REQUIRED_FACES: Readonly<Record<'provider' | 'model' | 'agent' | 'preset', readonly PmapFace[]>> = Object.freeze({
  provider: ['identity', 'version', 'artifactDigest', 'contractDigest', 'behaviorConfigurationDigest'],
  model: ['identity', 'behaviorConfigurationDigest'],
  agent: ['identity', 'version', 'artifactDigest', 'contractDigest'],
  preset: ['identity', 'artifactDigest', 'contractDigest'],
})

function singleRow(
  rows: readonly PmapComponentEvidence[],
  component: 'provider' | 'model' | 'agent',
): PmapComponentEvidence | undefined {
  const matching = rows.filter((row) => row.component === component)
  return matching.length === 1 ? matching[0] : undefined
}

function hasFaces(row: PmapComponentEvidence, faces: readonly PmapFace[]): boolean {
  return faces.every((face) => {
    const value = row[face]
    return typeof value === 'string' && value !== ''
  })
}

function pmapRowsComplete(rows: readonly PmapComponentEvidence[]): boolean {
  if (rows.some((row) => row.state !== 'observed')) return false
  for (const component of ['provider', 'model', 'agent'] as const) {
    const row = singleRow(rows, component)
    if (row === undefined || !hasFaces(row, REQUIRED_FACES[component])) return false
  }
  return rows
    .filter((row) => row.component === 'preset')
    .every((row) => hasFaces(row, REQUIRED_FACES.preset))
}

function splitAgentIdentity(identity: string): { readonly name: string; readonly version: string } | undefined {
  if (!identity.startsWith('agent:')) return undefined
  const rest = identity.slice('agent:'.length)
  const separator = rest.lastIndexOf('@')
  if (separator <= 0 || separator === rest.length - 1) return undefined
  return { name: rest.slice(0, separator), version: rest.slice(separator + 1) }
}

function splitPresetIdentity(identity: string): { readonly id: string; readonly trust: string } | undefined {
  if (!identity.startsWith('preset:')) return undefined
  const rest = identity.slice('preset:'.length)
  const separator = rest.lastIndexOf('@')
  if (separator <= 0 || separator === rest.length - 1) return undefined
  return { id: rest.slice(0, separator), trust: rest.slice(separator + 1) }
}

interface PresetMember {
  readonly id: string
  readonly trust: string
  readonly artifactHex: string
  readonly contractHex: string
}

/** Canonical roster aggregation: sorted by id so PMAP root order cannot leak into the digest. */
function presetMembers(rows: readonly PmapComponentEvidence[]): readonly PresetMember[] {
  const members: PresetMember[] = []
  for (const row of rows) {
    if (row.component !== 'preset') continue
    if (row.identity === undefined) throw new TypeError('Preset row has no identity.')
    const parsed = splitPresetIdentity(row.identity)
    if (parsed === undefined || row.artifactDigest === undefined || row.contractDigest === undefined) {
      throw new TypeError('Preset row has an unsupported identity or digest face.')
    }
    members.push({
      id: parsed.id,
      trust: parsed.trust,
      artifactHex: contentDigestOf(row.artifactDigest).slice('sha256:'.length),
      contractHex: contentDigestOf(row.contractDigest).slice('sha256:'.length),
    })
  }
  members.sort((left, right) => compareStrings(left.id, right.id) || compareStrings(left.trust, right.trust))
  return members
}

function readPresetsManifest(
  readFileBytes: (absolutePath: string) => Buffer,
  profileDir: string,
): { readonly version: string; readonly exportsCanonical: string } | undefined {
  let bytes: Buffer
  try {
    bytes = readFileBytes(`${profileDir}/${PRESETS_MANIFEST_RELATIVE}`)
  } catch {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString('utf8'))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const record = parsed as Record<string, unknown>
  const version = record.version
  if (typeof version !== 'string' || version === '' || version !== version.trim()) return undefined
  return { version, exportsCanonical: JSON.stringify(record.exports ?? null) }
}

/** ENOENT means the optional patch is absent; any other failure keeps the policy unavailable. */
function readOptionalBytes(readFileBytes: (absolutePath: string) => Buffer, absolutePath: string): Buffer | undefined {
  try {
    return readFileBytes(absolutePath)
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw cause
  }
}

// Mirrors the V2 immutable-version grammar in compatibility.ts; the final descriptor
// parse re-checks it, so a drift here degrades to an explicit assembly failure.
const EXACT_SEMVER_V2 =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u
const EXACT_CALENDAR_VERSION_V2 = /^(\d{4})-(\d{2})-(\d{2})$/u

function isImmutableVersionV2(value: string): boolean {
  if (EXACT_SEMVER_V2.test(value)) return true
  const parts = EXACT_CALENDAR_VERSION_V2.exec(value)
  if (parts === null) return false
  const year = Number(parts[1])
  const month = Number(parts[2])
  const day = Number(parts[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function capabilityOperationsProjection(
  entry: CapabilityRegistryEntryBodyV1,
): readonly Record<string, unknown>[] {
  return [...entry.operations]
    .sort((left, right) => compareStrings(left.operationId, right.operationId))
    .map((operation) => ({
      operationId: operation.operationId,
      adapter: {
        identity: operation.adapter.identity,
        version: operation.adapter.version,
        digest: operation.adapter.digest,
      },
      effectClass: operation.effectClass,
      dataBoundary: operation.dataBoundary,
      inputContractDigest: operation.inputContractDigest,
      outputContractDigest: operation.outputContractDigest,
      preflight: operation.preflight,
    }))
}

/** Approved entries that are effective at the projection instant become V2 capabilities. */
function buildCapabilityDescriptors(
  snapshot: CapabilityRegistrySnapshotV1,
  observedAt: string,
): readonly RuntimeCapabilityDescriptorV2[] {
  const evaluated = Date.parse(observedAt)
  const entries = snapshot.entries
    .filter((entry) => entry.state === 'approved'
      && Date.parse(entry.effectiveAt) <= evaluated
      && (entry.expiresAt === undefined || evaluated < Date.parse(entry.expiresAt)))
    .sort((left, right) => compareStrings(left.capabilityId, right.capabilityId))
  return entries.map((entry) => {
    if (!isImmutableVersionV2(entry.capabilityVersion)
      || entry.descriptor.verification !== 'verified'
      || entry.descriptor.source !== 'c2c5') {
      throw new TypeError('Approved capability entry is not a verified C2C.5 descriptor.')
    }
    const operations = capabilityOperationsProjection(entry)
    return {
      identity: entry.capabilityId,
      version: entry.capabilityVersion,
      artifactDigest: contentDigestOf(entry.descriptor.artifactSubjectDigest),
      contractDigest: contentDigestOf(entry.descriptor.toolContractDigest),
      behaviorConfigurationDigest: sha256ContentDigest(JSON.stringify({
        launchContractDigest: contentDigestOf(entry.descriptor.launchContractDigest),
        operations,
      })),
      registryDescriptorDigest: contentDigestOf(entry.descriptor.descriptorDigest),
      adapterMappingDigest: sha256ContentDigest(JSON.stringify(operations.map((operation) => ({
        operationId: operation.operationId,
        adapter: operation.adapter,
      })))),
    }
  })
}

function comparePmapRows(left: PmapComponentEvidence, right: PmapComponentEvidence): number {
  const byComponent = compareStrings(left.component, right.component)
  if (byComponent !== 0) return byComponent
  const byIdentity = compareStrings(left.identity ?? '', right.identity ?? '')
  return byIdentity !== 0 ? byIdentity : compareStrings(left.provenance.source, right.provenance.source)
}

interface AssembledInventory {
  readonly descriptor: RuntimeDescriptorV2
  readonly evidence: RuntimeInventoryEvidenceV2
}

function assembleInventory(input: {
  readonly profile: { readonly generation: string; readonly manifestSha256: string; readonly activatedAt: string; readonly runtimeArtifactAttestationSha256: string }
  readonly projection: HostLiveInventoryProjectionV1
  readonly rows: readonly PmapComponentEvidence[]
  readonly presetsManifest: { readonly version: string; readonly exportsCanonical: string }
  readonly overlayBytes: Buffer
  readonly localPatchBytes: Buffer | undefined
  readonly snapshot: CapabilityRegistrySnapshotV1
  readonly capabilities: readonly RuntimeCapabilityDescriptorV2[]
  readonly defaultPresetId: string
}): AssembledInventory {
  const { profile, projection, rows, presetsManifest, snapshot, capabilities } = input

  const protocolContractDigest = computeProtocolContractDigest()
  const launchPolicyDigest = computeLaunchPolicyDigest()
  const overlayPolicyDigest = computeOverlayPolicyDigest(input.overlayBytes, input.localPatchBytes)
  const harnessContractDigest = computeHarnessContractDigest()

  const providerRow = singleRow(rows, 'provider') as PmapComponentEvidence
  const modelRow = singleRow(rows, 'model') as PmapComponentEvidence
  const agentRow = singleRow(rows, 'agent') as PmapComponentEvidence

  const providerDescriptor: RuntimeComponentDescriptorV2 = {
    identity: providerRow.identity as string,
    version: providerRow.version as string,
    artifactDigest: contentDigestOf(providerRow.artifactDigest as string),
    contractDigest: contentDigestOf(providerRow.contractDigest as string),
    behaviorConfigurationDigest: contentDigestOf(providerRow.behaviorConfigurationDigest as string),
  }
  const splitAgent = splitAgentIdentity(agentRow.identity as string)
  if (splitAgent === undefined || splitAgent.version !== agentRow.version) {
    throw new TypeError('Agent row identity does not match its version face.')
  }
  const members = presetMembers(rows)
  const presetBehaviorConfigurationDigest = sha256ContentDigest(JSON.stringify({
    defaultPresetId: input.defaultPresetId,
    members: members.map((member) => ({ id: member.id, trust: member.trust, contractHex: member.contractHex })),
  }))

  const descriptorBody: RuntimeDescriptorBodyV2 = {
    schemaVersion: 'sage.runtime-descriptor.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    host: {
      identity: HOST_IDENTITY,
      version: HOST_VERSION,
      artifactDigest: projection.artifactSetDigest,
      contractDigest: protocolContractDigest,
      behaviorConfigurationDigest: launchPolicyDigest,
    },
    harness: {
      identity: HARNESS_IDENTITY,
      version: projection.harnessVersion,
      artifactDigest: projection.artifactSetDigest,
      contractDigest: harnessContractDigest,
      behaviorConfigurationDigest: overlayPolicyDigest,
    },
    provider: providerDescriptor,
    model: {
      identity: modelRow.identity as string,
      version: providerDescriptor.version,
      artifactDigest: providerDescriptor.artifactDigest,
      contractDigest: providerDescriptor.contractDigest,
      behaviorConfigurationDigest: contentDigestOf(modelRow.behaviorConfigurationDigest as string),
    },
    agent: {
      identity: `agent:${splitAgent.name}`,
      version: agentRow.version as string,
      artifactDigest: contentDigestOf(agentRow.artifactDigest as string),
      contractDigest: contentDigestOf(agentRow.contractDigest as string),
      behaviorConfigurationDigest: presetBehaviorConfigurationDigest,
    },
    preset: {
      identity: PRESET_SET_IDENTITY,
      version: presetsManifest.version,
      artifactDigest: sha256ContentDigest(JSON.stringify(
        members.map((member) => ({ id: member.id, trust: member.trust, artifactHex: member.artifactHex })),
      )),
      contractDigest: sha256ContentDigest(presetsManifest.exportsCanonical),
      behaviorConfigurationDigest: presetBehaviorConfigurationDigest,
    },
    capabilities,
    protocolContractDigest,
    launchPolicyDigest,
    overlayPolicyDigest,
  }
  const runtimeDescriptorDigest = computeRuntimeDescriptorDigestV2(descriptorBody)
  const descriptor: RuntimeDescriptorV2 = { ...descriptorBody, runtimeDescriptorDigest }

  const receiptDigest = `sha256:${profile.manifestSha256}`
  const registrySnapshotDigest = contentDigestOf(snapshot.snapshotId)
  const pmapSummary = sha256ContentDigest(JSON.stringify(
    [...rows].sort(comparePmapRows).map((row) => ({
      component: row.component,
      identity: row.identity ?? '',
      state: row.state,
      digest: contentDigestOf(row.evidenceDigest),
    })),
  ))
  const evidenceBody: RuntimeInventoryEvidenceBodyV2 = {
    schemaVersion: 'sage.runtime-inventory-evidence.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    runtimeDescriptorDigest,
    activeGeneration: profile.generation,
    receiptDigest,
    materializationInstanceDigest: sha256ContentDigest(JSON.stringify({
      kind: 'sage.materialization-instance.v1',
      activeGeneration: profile.generation,
      receiptDigest,
      activatedAt: profile.activatedAt,
    })),
    artifactAttestationDigest: projection.artifactAttestationDigest,
    registrySnapshotDigest,
    bootId: projection.bootId,
    runtimeGeneration: projection.runtimeGeneration,
    observedAt: projection.observedAt,
    expiresAt: projection.expiresAt,
    healthObservationDigest: sha256ContentDigest(JSON.stringify({
      kind: 'sage.runtime-health-observation.v1',
      artifactAttestationDigest: projection.artifactAttestationDigest,
      artifactSetDigest: projection.artifactSetDigest,
      outcome: 'verified',
    })),
    livenessObservationDigest: sha256ContentDigest(JSON.stringify({
      kind: 'sage.runtime-liveness-observation.v1',
      bootId: projection.bootId,
      runtimeGeneration: projection.runtimeGeneration,
      loaderPhase: 'active',
      observedAt: projection.observedAt,
      expiresAt: projection.expiresAt,
    })),
    instanceAuthorityDigest: sha256ContentDigest(JSON.stringify({
      kind: 'sage.instance-authority.v1',
      activeGeneration: profile.generation,
      manifestSha256: profile.manifestSha256,
      runtimeArtifactAttestationSha256: profile.runtimeArtifactAttestationSha256,
      artifactSetDigest: projection.artifactSetDigest,
      ownedProfileDigest: projection.ownedProfileDigest,
    })),
    mainObservationProvenanceDigest: sha256ContentDigest(JSON.stringify({
      kind: 'sage.main-observation-provenance.v1',
      hostProjectionDigest: projection.projectionDigest,
      pmapSummary,
      registrySnapshotDigest,
    })),
  }
  const inventoryEvidenceDigest = computeInventoryEvidenceDigestV2(evidenceBody)
  const evidence: RuntimeInventoryEvidenceV2 = { ...evidenceBody, inventoryEvidenceDigest }

  // Binding self-verification: both digests must re-derive from their canonical bodies,
  // the evidence must bind this descriptor, and the window/epoch must be sane.
  if (computeRuntimeDescriptorDigestV2(descriptorBody) !== runtimeDescriptorDigest
    || computeInventoryEvidenceDigestV2(evidenceBody) !== inventoryEvidenceDigest
    || evidence.runtimeDescriptorDigest !== descriptor.runtimeDescriptorDigest
    || !(Date.parse(evidence.observedAt) < Date.parse(evidence.expiresAt))
    || !(evidence.runtimeGeneration >= 1)) {
    throw new TypeError('Runtime inventory failed binding self-verification.')
  }
  return { descriptor, evidence }
}

/** Create the main-owned composition reader. All I/O arrives through injected ports. */
export function createRuntimeInventoryProvider(input: RuntimeInventoryProviderInput): RuntimeInventoryProvider {
  const read = async (): Promise<RuntimeInventoryResult> => {
    // 1. One trusted Host observation; every downstream fact is bound to its instant.
    let projectionResult: Awaited<ReturnType<HostLiveInventoryProjectionProvider['read']>>
    try {
      projectionResult = await input.hostProjection.read()
    } catch {
      return unavailable('host-projection-unavailable')
    }
    if (projectionResult.kind !== 'available') {
      return unavailable(
        'host-projection-unavailable',
        `${UNAVAILABLE_REASONS['host-projection-unavailable']} (${projectionResult.code})`,
      )
    }
    const projection = projectionResult.projection

    // 2. The receipt/attestation sha may only come from the generation the projection
    //    certified; any pointer change since that observation is drift.
    let profile: Awaited<ReturnType<typeof readActiveProfile>>
    try {
      profile = await readActiveProfile(input.paths)
    } catch {
      return unavailable('active-profile-unavailable')
    }
    if (profile === null
      || profile.generation !== projection.activeGeneration
      || profile.manifestSha256 !== projection.manifestSha256
      || profile.runtimeArtifactAttestationSha256 === undefined) {
      return unavailable('active-profile-unavailable')
    }
    const activeProfile = {
      generation: profile.generation,
      manifestSha256: profile.manifestSha256,
      activatedAt: profile.activatedAt,
      runtimeArtifactAttestationSha256: profile.runtimeArtifactAttestationSha256,
    }

    // 3. PMAP static evidence, observed at the projection instant.
    let rows: readonly PmapComponentEvidence[]
    try {
      rows = await collectPmapEvidence({
        profileDir: profile.profileDir,
        fs: input.pmapFs,
        now: () => projection.observedAt,
      })
    } catch {
      return unavailable('pmap-incomplete')
    }
    if (!pmapRowsComplete(rows)) return unavailable('pmap-incomplete')
    const presetsManifest = readPresetsManifest(input.readFileBytes, profile.profileDir)
    if (presetsManifest === undefined) return unavailable('pmap-incomplete')

    // 4. Shell policy documents; only the optional local patch tolerates absence.
    let overlayBytes: Buffer
    try {
      overlayBytes = input.readFileBytes(overlayPath(profile.profileDir))
    } catch {
      return unavailable('policy-document-unavailable')
    }
    let localPatchBytes: Buffer | undefined
    try {
      localPatchBytes = readOptionalBytes(input.readFileBytes, `${input.paths.root}/${LOCAL_PATCH_FILE}`)
    } catch {
      return unavailable('policy-document-unavailable')
    }

    // 5. Registry snapshot: absent port or an unparsable snapshot is unavailable.
    if (input.registry === undefined) return unavailable('registry-unavailable')
    let rawSnapshot: unknown
    try {
      rawSnapshot = input.registry.read()
    } catch {
      return unavailable('registry-unavailable')
    }
    const parsedSnapshot = parseCapabilityRegistrySnapshot(rawSnapshot)
    if (parsedSnapshot.ok === false) {
      return unavailable('registry-unavailable', `${UNAVAILABLE_REASONS['registry-unavailable']} (${parsedSnapshot.code})`)
    }

    // 6. Approved, effective capabilities.
    let capabilities: readonly RuntimeCapabilityDescriptorV2[]
    try {
      capabilities = buildCapabilityDescriptors(parsedSnapshot.value, projection.observedAt)
    } catch {
      return unavailable('capability-invalid')
    }

    // 7. Live runtime-effective registry observation (protocol v5 ready payload); the
    //    default preset must be one of the static roster's rows or nothing is emitted.
    let rawObservation: unknown
    try {
      rawObservation = input.runtimeEffective.read()
    } catch {
      return unavailable('runtime-effective-unavailable', `${UNAVAILABLE_REASONS['runtime-effective-unavailable']} (observation-invalid)`)
    }
    if (!isRuntimeEffectiveObservation(rawObservation)) {
      return unavailable('runtime-effective-unavailable', `${UNAVAILABLE_REASONS['runtime-effective-unavailable']} (observation-invalid)`)
    }
    if (rawObservation.kind !== 'observed') {
      return unavailable('runtime-effective-unavailable', `${UNAVAILABLE_REASONS['runtime-effective-unavailable']} (${rawObservation.reason})`)
    }
    const observation: RuntimeEffectiveObservation = rawObservation
    if (!presetMembers(rows).some((member) => member.id === observation.defaultPresetId)) {
      return unavailable('runtime-effective-unavailable', `${UNAVAILABLE_REASONS['runtime-effective-unavailable']} (default-not-in-roster)`)
    }

    // 8. Assemble, derive both digests, self-verify, and freeze; never emit an
    //    inconsistent artifact.
    let assembled: AssembledInventory
    try {
      assembled = assembleInventory({
        profile: activeProfile,
        projection,
        rows,
        presetsManifest,
        overlayBytes,
        localPatchBytes,
        snapshot: parsedSnapshot.value,
        capabilities,
        defaultPresetId: observation.defaultPresetId,
      })
    } catch {
      return unavailable('assembly-invalid')
    }
    return freezeDeep({
      kind: 'available' as const,
      descriptor: assembled.descriptor,
      evidence: assembled.evidence,
    })
  }

  return Object.freeze({ read })
}
