import { createHash } from 'node:crypto'
import { types as utilTypes } from 'node:util'

export type ExternalCapabilityKernelFailureCode =
  | 'capability-artifact-unclassifiable'
  | 'launch-contract-unclassifiable'
  | 'bridge-contract-invalid'
  | 'tool-contract-invalid'
  | 'tool-contract-extension-unsupported'
  | 'capability-descriptor-invalid'

export type ExternalCapabilityKernelResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{
    readonly ok: false
    readonly code: ExternalCapabilityKernelFailureCode
    readonly reason: string
  }>

export type ExternalCapabilityJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ExternalCapabilityJsonValue[]
  | ExternalCapabilityJsonObject

export interface ExternalCapabilityJsonObject {
  readonly [key: string]: ExternalCapabilityJsonValue
}

export interface ExternalCapabilityArtifactComponentV1 {
  readonly logicalRole: string
  readonly identity: string
  readonly version: string
  readonly artifactDigest: string
}

export interface ExternalCapabilityArtifactSubjectBodyV1 {
  readonly schemaVersion: 'sage.external-capability-artifact-subject.v1'
  readonly canonicalizationVersion: 'sage.external-capability-canonical-json.v1'
  readonly transportKind: 'local-stdio'
  readonly components: readonly ExternalCapabilityArtifactComponentV1[]
  readonly dependencyClosureDigest: string
  readonly packageInputsDigest: string
  readonly lockInputsDigest: string
  readonly executablePolicyDigest: string
  readonly linkTopologyDigest: string
}

export interface ExternalCapabilityArtifactSubjectV1
  extends ExternalCapabilityArtifactSubjectBodyV1 {
  readonly artifactSubjectDigest: string
}

export interface ExternalCapabilityLaunchContractBodyV1 {
  readonly schemaVersion: 'sage.external-capability-launch-contract.v1'
  readonly canonicalizationVersion: 'sage.external-capability-canonical-json.v1'
  readonly transportKind: 'local-stdio'
  readonly processMode: 'interpreter-entrypoint'
  readonly argumentPolicyDigest: string
  readonly environmentPolicyDigest: string
  readonly workingDirectoryPolicy: 'artifact-root'
  readonly protocolOverlayDigest: string
}

export interface ExternalCapabilityLaunchContractV1
  extends ExternalCapabilityLaunchContractBodyV1 {
  readonly launchContractDigest: string
}

export interface ExternalCapabilityBridgeContractBodyV1 {
  readonly schemaVersion: 'sage.external-capability-bridge-contract.v1'
  readonly canonicalizationVersion: 'sage.external-capability-canonical-json.v1'
  readonly identity: string
  readonly version: string
  readonly nameProjectionContract: string
  readonly descriptionProjectionContract: string
  readonly outputSchemaEnforcementContract: string
  readonly taskExecutionContract: string
}

export interface ExternalCapabilityBridgeContractV1
  extends ExternalCapabilityBridgeContractBodyV1 {
  readonly bridgeContractDigest: string
}

export type ExternalCapabilityProtocolRevision =
  | '2025-11-25'
  | '2025-06-18'
  | '2025-03-26'
  | '2024-11-05'
  | '2024-10-07'

export type ExternalCapabilityTaskSupport =
  | 'required'
  | 'optional'
  | 'forbidden'

export interface ExternalCapabilityToolCandidateV1 {
  name: string
  description?: string
  title?: unknown
  icons?: unknown
  annotations?: unknown
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  execution?: { taskSupport?: ExternalCapabilityTaskSupport }
}

export interface ExternalCapabilityToolContractCandidateV1 {
  schemaVersion: 'sage.external-capability-tool-contract-candidate.v1'
  canonicalizationVersion: 'sage.external-capability-canonical-json.v1'
  negotiatedProtocolRevision: ExternalCapabilityProtocolRevision
  bridgeContractDigest: string
  tools: ExternalCapabilityToolCandidateV1[]
}

export type ExternalCapabilityDescriptionSource =
  | Readonly<{ readonly state: 'absent' }>
  | Readonly<{ readonly state: 'present'; readonly value: string }>

export type ExternalCapabilityOutputSchemaV1 =
  | Readonly<{
    readonly presence: 'absent'
    readonly enforcement: 'not-advertised'
  }>
  | Readonly<{
    readonly presence: 'present'
    readonly enforcement: 'enforced' | 'fallback-unstructured'
    readonly schema: ExternalCapabilityJsonObject
  }>

export interface ExternalCapabilityNormalizedToolV1 {
  readonly rawName: string
  readonly descriptionSource: ExternalCapabilityDescriptionSource
  readonly modelDescription: string
  readonly inputSchema: ExternalCapabilityJsonObject
  readonly outputSchema: ExternalCapabilityOutputSchemaV1
  readonly effectiveTaskSupport: ExternalCapabilityTaskSupport
}

export interface ExternalCapabilityToolContractBodyV1 {
  readonly schemaVersion: 'sage.external-capability-tool-contract.v1'
  readonly canonicalizationVersion: 'sage.external-capability-canonical-json.v1'
  readonly negotiatedProtocolRevision: ExternalCapabilityProtocolRevision
  readonly bridgeContractDigest: string
  readonly tools: readonly ExternalCapabilityNormalizedToolV1[]
}

export interface ExternalCapabilityToolContractV1
  extends ExternalCapabilityToolContractBodyV1 {
  readonly toolContractDigest: string
}

export interface ExternalCapabilityDescriptorBodyV1 {
  readonly schemaVersion: 'sage.external-capability-descriptor.v1'
  readonly canonicalizationVersion: 'sage.external-capability-canonical-json.v1'
  readonly capabilityId: string
  readonly capabilityVersion: string
  readonly artifactSubject: ExternalCapabilityArtifactSubjectV1
  readonly launchContract: ExternalCapabilityLaunchContractV1
  readonly bridgeContract: ExternalCapabilityBridgeContractV1
  readonly toolContract: ExternalCapabilityToolContractV1
}

export interface ExternalCapabilityDescriptorV1
  extends ExternalCapabilityDescriptorBodyV1 {
  readonly descriptorDigest: string
}

const CANONICALIZATION_VERSION = 'sage.external-capability-canonical-json.v1'
const ARTIFACT_SCHEMA_VERSION = 'sage.external-capability-artifact-subject.v1'
const LAUNCH_SCHEMA_VERSION = 'sage.external-capability-launch-contract.v1'
const BRIDGE_SCHEMA_VERSION = 'sage.external-capability-bridge-contract.v1'
const TOOL_CANDIDATE_SCHEMA_VERSION =
  'sage.external-capability-tool-contract-candidate.v1'
const TOOL_SCHEMA_VERSION = 'sage.external-capability-tool-contract.v1'
const DESCRIPTOR_SCHEMA_VERSION = 'sage.external-capability-descriptor.v1'

const ARTIFACT_DIGEST_NAMESPACE = 'external-capability-artifact'
const LAUNCH_DIGEST_NAMESPACE = 'external-capability-launch'
const BRIDGE_DIGEST_NAMESPACE = 'external-capability-bridge-contract'
const TOOL_DIGEST_NAMESPACE = 'external-capability-tool-contract'
const DESCRIPTOR_DIGEST_NAMESPACE = 'external-capability-descriptor'

const CONTENT_DIGEST = /^sha256:[0-9a-f]{64}$/u
const ARGUMENT_POLICY_DIGEST =
  /^urn:sage:external-capability-argument-policy:sha256:[0-9a-f]{64}$/u
const ENVIRONMENT_POLICY_DIGEST =
  /^urn:sage:external-capability-environment-policy:sha256:[0-9a-f]{64}$/u
const PROTOCOL_OVERLAY_DIGEST =
  /^urn:sage:external-capability-protocol-overlay:sha256:[0-9a-f]{64}$/u
const ARTIFACT_DIGEST =
  /^urn:sage:external-capability-artifact:sha256:[0-9a-f]{64}$/u
const LAUNCH_DIGEST =
  /^urn:sage:external-capability-launch:sha256:[0-9a-f]{64}$/u
const BRIDGE_DIGEST =
  /^urn:sage:external-capability-bridge-contract:sha256:[0-9a-f]{64}$/u
const TOOL_DIGEST =
  /^urn:sage:external-capability-tool-contract:sha256:[0-9a-f]{64}$/u
const DESCRIPTOR_DIGEST =
  /^urn:sage:external-capability-descriptor:sha256:[0-9a-f]{64}$/u
const COMPONENT_ROLE = /^[a-z][a-z0-9-]*$/u
const CAPABILITY_ID = /^capability:sage\.[a-z0-9][a-z0-9._-]*$/u
const TOOL_NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,127}$/u
const CALENDAR_VERSION =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u
const SEMANTIC_VERSION =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*))(?:\.(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*)))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u

const PROTOCOL_REVISIONS: readonly ExternalCapabilityProtocolRevision[] = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
]
const TASK_SUPPORT_VALUES: readonly ExternalCapabilityTaskSupport[] = [
  'required',
  'optional',
  'forbidden',
]

const PINNED_BRIDGE_IDENTITY = '@deepseek-ai/dsh-' + 'mcp-client'
const PINNED_BRIDGE_VERSION = '0.1.5-rc.2'
const PINNED_SDK_IDENTITY = '@modelcontextprotocol/sdk'
const PINNED_SDK_VERSION = '1.30.0'
const PINNED_NAME_PROJECTION = 'dsh-' + 'mcp-client-public-tool-name.v1'
const PINNED_DESCRIPTION_PROJECTION =
  'dsh-' + 'mcp-client-absent-description-to-empty.v1'
const PINNED_OUTPUT_ENFORCEMENT =
  'dsh-' + 'mcp-client-supported-output-schema.v1'
const PINNED_TASK_EXECUTION = 'dsh-' + 'mcp-client-required-task-only.v1'

const ARTIFACT_ROLES = [
  'bridge',
  'sdk',
  'launcher',
  'interpreter',
  'server-entrypoint',
] as const
type ExternalCapabilityArtifactRole = typeof ARTIFACT_ROLES[number]

const FAILURE_REASONS: Readonly<
  Record<ExternalCapabilityKernelFailureCode, string>
> = {
  'capability-artifact-unclassifiable':
    'The external capability artifact subject is invalid.',
  'launch-contract-unclassifiable':
    'The external capability launch contract is invalid.',
  'bridge-contract-invalid':
    'The external capability bridge contract is invalid.',
  'tool-contract-invalid':
    'The external capability tool contract is invalid.',
  'tool-contract-extension-unsupported':
    'The external capability tool contract contains an unsupported extension.',
  'capability-descriptor-invalid':
    'The external capability descriptor is invalid.',
}

interface PlainRecordSnapshot {
  readonly values: Readonly<Record<string, unknown>>
  readonly keys: readonly string[]
}

type ToolParseIssue = 'invalid' | 'extension'

type ToolParseResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{ readonly ok: false; readonly issue: ToolParseIssue }>

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor !== undefined && Object.hasOwn(descriptor, 'value')) {
      freezeDeep(descriptor.value)
    }
  }
  return Object.freeze(value)
}

function success<T>(value: T): ExternalCapabilityKernelResult<T> {
  return Object.freeze({ ok: true as const, value: freezeDeep(value) })
}

function failure<T>(
  code: ExternalCapabilityKernelFailureCode,
): ExternalCapabilityKernelResult<T> {
  return Object.freeze({
    ok: false as const,
    code,
    reason: FAILURE_REASONS[code],
  })
}

function inspectPlainRecord(value: unknown): PlainRecordSnapshot | undefined {
  try {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      utilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return undefined
    }

    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
      PropertyKey,
      PropertyDescriptor
    >
    const ownKeys = Reflect.ownKeys(descriptors)
    if (ownKeys.some((key) => typeof key !== 'string')) return undefined

    const values: Record<string, unknown> = Object.create(null)
    const keys: string[] = []
    for (const key of ownKeys) {
      if (typeof key !== 'string') return undefined
      const descriptor = descriptors[key]
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, 'value') ||
        descriptor.enumerable !== true
      ) {
        return undefined
      }
      keys.push(key)
      values[key] = descriptor.value
    }
    return { values, keys }
  } catch {
    return undefined
  }
}

function exactRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Readonly<Record<string, unknown>> | undefined {
  const snapshot = inspectPlainRecord(value)
  if (snapshot === undefined) return undefined
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  if (
    requiredKeys.some((key) => !snapshot.keys.includes(key)) ||
    snapshot.keys.some((key) => !allowed.has(key))
  ) {
    return undefined
  }
  return snapshot.values
}

function inspectExactArray(value: unknown): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value)) return undefined
    if (Object.getPrototypeOf(value) !== Array.prototype) return undefined

    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
      PropertyKey,
      PropertyDescriptor
    >
    const ownKeys = Reflect.ownKeys(descriptors)
    if (ownKeys.some((key) => typeof key !== 'string')) return undefined
    const lengthDescriptor = descriptors.length
    if (
      lengthDescriptor === undefined ||
      !Object.hasOwn(lengthDescriptor, 'value') ||
      typeof lengthDescriptor.value !== 'number'
    ) {
      return undefined
    }
    const length = lengthDescriptor.value
    if (!Number.isSafeInteger(length) || length < 0) return undefined

    const values: unknown[] = []
    for (let index = 0; index < length; index += 1) {
      const key = String(index)
      const descriptor = descriptors[key]
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, 'value') ||
        descriptor.enumerable !== true
      ) {
        return undefined
      }
      values.push(descriptor.value)
    }
    if (ownKeys.length !== length + 1) return undefined
    return values
  } catch {
    return undefined
  }
}

function defineDataProperty<T>(
  target: Record<string, T>,
  key: string,
  value: T,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  })
}

function detachJson(
  value: unknown,
  ancestors: Set<object> = new Set<object>(),
): ExternalCapabilityJsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && !Object.is(value, -0) ? value : undefined
  }
  if (typeof value !== 'object') return undefined

  try {
    if (utilTypes.isProxy(value)) return undefined
    if (ancestors.has(value)) return undefined
    ancestors.add(value)
    try {
      if (Array.isArray(value)) {
        const array = inspectExactArray(value)
        if (array === undefined) return undefined
        const detached: ExternalCapabilityJsonValue[] = []
        for (const member of array) {
          const parsed = detachJson(member, ancestors)
          if (parsed === undefined) return undefined
          detached.push(parsed)
        }
        return detached
      }

      const record = inspectPlainRecord(value)
      if (record === undefined) return undefined
      const detached: Record<string, ExternalCapabilityJsonValue> = {}
      for (const key of record.keys) {
        const parsed = detachJson(record.values[key], ancestors)
        if (parsed === undefined) return undefined
        defineDataProperty(detached, key, parsed)
      }
      return detached
    } finally {
      ancestors.delete(value)
    }
  } catch {
    return undefined
  }
}

function detachJsonObject(value: unknown): ExternalCapabilityJsonObject | undefined {
  const detached = detachJson(value)
  if (
    detached === undefined ||
    detached === null ||
    typeof detached !== 'object' ||
    Array.isArray(detached)
  ) {
    return undefined
  }
  return detached as ExternalCapabilityJsonObject
}

function canonicalJson(value: ExternalCapabilityJsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((member) => canonicalJson(member)).join(',')}]`
  }
  if (typeof value !== 'object' || value === null) return JSON.stringify(value)

  const record = value as ExternalCapabilityJsonObject
  return `{${Object.keys(record)
    .sort(compareCodeUnits)
    .map((key) => {
      const member = record[key]
      if (member === undefined) throw new TypeError('Canonical value is invalid.')
      return `${JSON.stringify(key)}:${canonicalJson(member)}`
    })
    .join(',')}}`
}

function digest(namespace: string, canonical: string): string {
  return `urn:sage:${namespace}:sha256:${createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex')}`
}

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.hasOwn(record, key)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isCalendarVersion(value: string): boolean {
  if (!CALENDAR_VERSION.test(value)) return false
  const [yearText, monthText, dayText] = value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1]
  return daysInMonth !== undefined && day >= 1 && day <= daysInMonth
}

function isImmutableVersion(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (isCalendarVersion(value) || SEMANTIC_VERSION.test(value))
  )
}

function isContentDigest(value: unknown): value is string {
  return typeof value === 'string' && CONTENT_DIGEST.test(value)
}

function isArtifactIdentity(
  role: ExternalCapabilityArtifactRole,
  identity: unknown,
): identity is string {
  if (!isNonEmptyString(identity)) return false
  switch (role) {
    case 'bridge':
      return identity === PINNED_BRIDGE_IDENTITY
    case 'sdk':
      return identity === PINNED_SDK_IDENTITY
    case 'launcher':
      return /^launcher:[a-z0-9][a-z0-9._-]*$/u.test(identity)
    case 'interpreter':
      return /^runtime:[a-z0-9][a-z0-9._-]*$/u.test(identity)
    case 'server-entrypoint':
      return /^server:[a-z0-9][a-z0-9._-]*$/u.test(identity)
  }
}

function pinnedComponentVersion(
  role: ExternalCapabilityArtifactRole,
  version: unknown,
): version is string {
  if (!isImmutableVersion(version)) return false
  if (role === 'bridge') return version === PINNED_BRIDGE_VERSION
  if (role === 'sdk') return version === PINNED_SDK_VERSION
  return true
}

function parseArtifactBody(
  value: unknown,
): ExternalCapabilityArtifactSubjectBodyV1 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'transportKind',
    'components',
    'dependencyClosureDigest',
    'packageInputsDigest',
    'lockInputsDigest',
    'executablePolicyDigest',
    'linkTopologyDigest',
  ])
  if (
    record === undefined ||
    record.schemaVersion !== ARTIFACT_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    record.transportKind !== 'local-stdio' ||
    !isContentDigest(record.dependencyClosureDigest) ||
    !isContentDigest(record.packageInputsDigest) ||
    !isContentDigest(record.lockInputsDigest) ||
    !isContentDigest(record.executablePolicyDigest) ||
    !isContentDigest(record.linkTopologyDigest)
  ) {
    return undefined
  }

  const rawComponents = inspectExactArray(record.components)
  if (
    rawComponents === undefined ||
    rawComponents.length !== ARTIFACT_ROLES.length
  ) {
    return undefined
  }
  const roles = new Set<string>()
  const components: ExternalCapabilityArtifactComponentV1[] = []
  for (const rawComponent of rawComponents) {
    const component = exactRecord(rawComponent, [
      'logicalRole',
      'identity',
      'version',
      'artifactDigest',
    ])
    if (
      component === undefined ||
      typeof component.logicalRole !== 'string' ||
      !COMPONENT_ROLE.test(component.logicalRole) ||
      !ARTIFACT_ROLES.includes(
        component.logicalRole as ExternalCapabilityArtifactRole,
      ) ||
      !isArtifactIdentity(
        component.logicalRole as ExternalCapabilityArtifactRole,
        component.identity,
      ) ||
      !pinnedComponentVersion(
        component.logicalRole as ExternalCapabilityArtifactRole,
        component.version,
      ) ||
      !isContentDigest(component.artifactDigest) ||
      roles.has(component.logicalRole)
    ) {
      return undefined
    }
    roles.add(component.logicalRole)
    components.push({
      logicalRole: component.logicalRole,
      identity: component.identity,
      version: component.version,
      artifactDigest: component.artifactDigest,
    })
  }
  if (ARTIFACT_ROLES.some((role) => !roles.has(role))) return undefined
  components.sort((left, right) =>
    compareCodeUnits(
      `${left.logicalRole}\0${left.identity}`,
      `${right.logicalRole}\0${right.identity}`,
    ))

  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    transportKind: 'local-stdio',
    components,
    dependencyClosureDigest: record.dependencyClosureDigest,
    packageInputsDigest: record.packageInputsDigest,
    lockInputsDigest: record.lockInputsDigest,
    executablePolicyDigest: record.executablePolicyDigest,
    linkTopologyDigest: record.linkTopologyDigest,
  }
}

function parseLaunchBody(
  value: unknown,
): ExternalCapabilityLaunchContractBodyV1 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'transportKind',
    'processMode',
    'argumentPolicyDigest',
    'environmentPolicyDigest',
    'workingDirectoryPolicy',
    'protocolOverlayDigest',
  ])
  if (
    record === undefined ||
    record.schemaVersion !== LAUNCH_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    record.transportKind !== 'local-stdio' ||
    record.processMode !== 'interpreter-entrypoint' ||
    record.workingDirectoryPolicy !== 'artifact-root' ||
    typeof record.argumentPolicyDigest !== 'string' ||
    !ARGUMENT_POLICY_DIGEST.test(record.argumentPolicyDigest) ||
    typeof record.environmentPolicyDigest !== 'string' ||
    !ENVIRONMENT_POLICY_DIGEST.test(record.environmentPolicyDigest) ||
    typeof record.protocolOverlayDigest !== 'string' ||
    !PROTOCOL_OVERLAY_DIGEST.test(record.protocolOverlayDigest)
  ) {
    return undefined
  }
  return {
    schemaVersion: LAUNCH_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    transportKind: 'local-stdio',
    processMode: 'interpreter-entrypoint',
    argumentPolicyDigest: record.argumentPolicyDigest,
    environmentPolicyDigest: record.environmentPolicyDigest,
    workingDirectoryPolicy: 'artifact-root',
    protocolOverlayDigest: record.protocolOverlayDigest,
  }
}

function parseBridgeBody(
  value: unknown,
): ExternalCapabilityBridgeContractBodyV1 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'identity',
    'version',
    'nameProjectionContract',
    'descriptionProjectionContract',
    'outputSchemaEnforcementContract',
    'taskExecutionContract',
  ])
  if (
    record === undefined ||
    record.schemaVersion !== BRIDGE_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    record.identity !== PINNED_BRIDGE_IDENTITY ||
    record.version !== PINNED_BRIDGE_VERSION ||
    record.nameProjectionContract !== PINNED_NAME_PROJECTION ||
    record.descriptionProjectionContract !== PINNED_DESCRIPTION_PROJECTION ||
    record.outputSchemaEnforcementContract !== PINNED_OUTPUT_ENFORCEMENT ||
    record.taskExecutionContract !== PINNED_TASK_EXECUTION
  ) {
    return undefined
  }
  return {
    schemaVersion: BRIDGE_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    identity: PINNED_BRIDGE_IDENTITY,
    version: PINNED_BRIDGE_VERSION,
    nameProjectionContract: PINNED_NAME_PROJECTION,
    descriptionProjectionContract: PINNED_DESCRIPTION_PROJECTION,
    outputSchemaEnforcementContract: PINNED_OUTPUT_ENFORCEMENT,
    taskExecutionContract: PINNED_TASK_EXECUTION,
  }
}

function isSchemaObject(value: ExternalCapabilityJsonValue): value is ExternalCapabilityJsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function schemaArray(value: ExternalCapabilityJsonValue | undefined):
  | readonly ExternalCapabilityJsonValue[]
  | undefined {
  return Array.isArray(value) ? value : undefined
}

function isPinnedToolSchemaBase(
  schema: ExternalCapabilityJsonObject,
): boolean {
  if (schema.type !== 'object') return false
  if (hasOwn(schema, 'properties')) {
    if (!isSchemaObject(schema.properties as ExternalCapabilityJsonValue)) {
      return false
    }
    if (!Object.values(schema.properties as ExternalCapabilityJsonObject)
      .every((value) => isSchemaObject(value))) {
      return false
    }
  }
  if (hasOwn(schema, 'required')) {
    const required = schemaArray(schema.required)
    if (required === undefined || required.some((value) => typeof value !== 'string')) {
      return false
    }
  }
  return true
}

function isPinnedIcon(value: unknown): boolean {
  const icon = exactRecord(value, ['src'], ['mimeType', 'sizes', 'theme'])
  if (icon === undefined || typeof icon.src !== 'string') return false
  if (hasOwn(icon, 'mimeType') && typeof icon.mimeType !== 'string') return false
  if (hasOwn(icon, 'theme') && icon.theme !== 'light' && icon.theme !== 'dark') {
    return false
  }
  if (hasOwn(icon, 'sizes')) {
    const sizes = inspectExactArray(icon.sizes)
    if (sizes === undefined || sizes.some((size) => typeof size !== 'string')) {
      return false
    }
  }
  return true
}

function isPinnedIcons(value: unknown): boolean {
  const icons = inspectExactArray(value)
  return icons !== undefined && icons.every((icon) => isPinnedIcon(icon))
}

function isPinnedAnnotations(value: unknown): boolean {
  const annotations = exactRecord(value, [], [
    'title',
    'readOnlyHint',
    'destructiveHint',
    'idempotentHint',
    'openWorldHint',
  ])
  if (annotations === undefined) return false
  if (hasOwn(annotations, 'title') && typeof annotations.title !== 'string') {
    return false
  }
  for (const key of [
    'readOnlyHint',
    'destructiveHint',
    'idempotentHint',
    'openWorldHint',
  ]) {
    if (hasOwn(annotations, key) && typeof annotations[key] !== 'boolean') {
      return false
    }
  }
  return true
}

function schemaValueMatchesType(
  type: string,
  value: ExternalCapabilityJsonValue,
): boolean {
  switch (type) {
    case 'object':
      return isSchemaObject(value)
    case 'array':
      return Array.isArray(value)
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'null':
      return value === null
    default:
      return false
  }
}

function isSupportedSchema(schema: ExternalCapabilityJsonObject): boolean {
  const allowedKeys = new Set([
    'type',
    'oneOf',
    'properties',
    'required',
    'additionalProperties',
    'items',
    'enum',
    'const',
    'description',
    'title',
    'default',
    'examples',
  ])
  if (Object.keys(schema).some((key) => !allowedKeys.has(key))) return false
  if (hasOwn(schema, 'description') && typeof schema.description !== 'string') {
    return false
  }
  if (hasOwn(schema, 'title') && typeof schema.title !== 'string') return false

  const hasType = hasOwn(schema, 'type')
  const hasOneOf = hasOwn(schema, 'oneOf')
  if (hasType && hasOneOf) return false

  if (hasOneOf) {
    for (const incompatible of [
      'properties',
      'required',
      'additionalProperties',
      'items',
      'enum',
      'const',
    ]) {
      if (hasOwn(schema, incompatible)) return false
    }
    const choices = schemaArray(schema.oneOf)
    if (choices === undefined || choices.length < 2) return false
    return choices.every((choice) =>
      isSchemaObject(choice) && isSupportedSchema(choice))
  }

  if (!hasType) {
    return ![
      'properties',
      'required',
      'additionalProperties',
      'items',
      'enum',
      'const',
    ].some((key) => hasOwn(schema, key))
  }

  const type = schema.type
  if (
    typeof type !== 'string' ||
    !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']
      .includes(type)
  ) {
    return false
  }

  if (type !== 'object') {
    if (
      hasOwn(schema, 'properties') ||
      hasOwn(schema, 'required') ||
      hasOwn(schema, 'additionalProperties')
    ) {
      return false
    }
  }
  if (type !== 'array' && hasOwn(schema, 'items')) return false
  if (
    (type === 'object' || type === 'array') &&
    (hasOwn(schema, 'enum') || hasOwn(schema, 'const'))
  ) {
    return false
  }

  if (type === 'object') {
    const properties = schema.properties
    if (hasOwn(schema, 'properties')) {
      if (!isSchemaObject(properties as ExternalCapabilityJsonValue)) return false
      for (const child of Object.values(properties as ExternalCapabilityJsonObject)) {
        if (!isSchemaObject(child) || !isSupportedSchema(child)) return false
      }
    }
    if (hasOwn(schema, 'required')) {
      const required = schemaArray(schema.required)
      if (
        required === undefined ||
        required.some((name) =>
          typeof name !== 'string' ||
          !isSchemaObject(properties as ExternalCapabilityJsonValue) ||
          !hasOwn(properties as ExternalCapabilityJsonObject, name))
      ) {
        return false
      }
    }
    if (
      hasOwn(schema, 'additionalProperties') &&
      typeof schema.additionalProperties !== 'boolean'
    ) {
      return false
    }
  }

  if (type === 'array' && hasOwn(schema, 'items')) {
    const items = schema.items
    if (items === undefined || !isSchemaObject(items) || !isSupportedSchema(items)) {
      return false
    }
  }

  if (hasOwn(schema, 'enum')) {
    const values = schemaArray(schema.enum)
    if (
      values === undefined ||
      values.length === 0 ||
      values.some((value) =>
        (typeof value === 'object' && value !== null) ||
        !schemaValueMatchesType(type, value))
    ) {
      return false
    }
  }
  if (hasOwn(schema, 'const')) {
    const constant = schema.const
    if (constant === undefined || !schemaValueMatchesType(type, constant)) {
      return false
    }
    if (hasOwn(schema, 'enum')) {
      const values = schemaArray(schema.enum)
      if (values === undefined || !values.some((value) => Object.is(value, constant))) {
        return false
      }
    }
  }
  return true
}

function parseToolCandidate(
  value: unknown,
): ToolParseResult<ExternalCapabilityNormalizedToolV1> {
  const snapshot = inspectPlainRecord(value)
  if (snapshot === undefined) return { ok: false, issue: 'invalid' }
  const required = ['name', 'inputSchema']
  const recognized = new Set([
    ...required,
    'description',
    'title',
    'icons',
    'annotations',
    'outputSchema',
    'execution',
  ])
  if (required.some((key) => !snapshot.keys.includes(key))) {
    return { ok: false, issue: 'invalid' }
  }
  if (snapshot.keys.some((key) => !recognized.has(key))) {
    return { ok: false, issue: 'extension' }
  }
  const record = snapshot.values
  if (typeof record.name !== 'string' || !TOOL_NAME.test(record.name)) {
    return { ok: false, issue: 'invalid' }
  }

  if (hasOwn(record, 'title') && typeof record.title !== 'string') {
    return { ok: false, issue: 'invalid' }
  }
  if (hasOwn(record, 'icons') && !isPinnedIcons(record.icons)) {
    return { ok: false, issue: 'invalid' }
  }
  if (hasOwn(record, 'annotations') && !isPinnedAnnotations(record.annotations)) {
    return { ok: false, issue: 'invalid' }
  }

  let descriptionSource: ExternalCapabilityDescriptionSource
  let modelDescription: string
  if (hasOwn(record, 'description')) {
    if (typeof record.description !== 'string') {
      return { ok: false, issue: 'invalid' }
    }
    descriptionSource = { state: 'present', value: record.description }
    modelDescription = record.description
  } else {
    descriptionSource = { state: 'absent' }
    modelDescription = ''
  }

  const inputSchema = detachJsonObject(record.inputSchema)
  if (inputSchema === undefined || !isPinnedToolSchemaBase(inputSchema)) {
    return { ok: false, issue: 'invalid' }
  }

  let outputSchema: ExternalCapabilityOutputSchemaV1
  if (!hasOwn(record, 'outputSchema')) {
    outputSchema = {
      presence: 'absent',
      enforcement: 'not-advertised',
    }
  } else {
    const schema = detachJsonObject(record.outputSchema)
    if (schema === undefined || !isPinnedToolSchemaBase(schema)) {
      return { ok: false, issue: 'invalid' }
    }
    outputSchema = {
      presence: 'present',
      enforcement: isSupportedSchema(schema)
        ? 'enforced'
        : 'fallback-unstructured',
      schema,
    }
  }

  let effectiveTaskSupport: ExternalCapabilityTaskSupport = 'forbidden'
  if (hasOwn(record, 'execution')) {
    const execution = exactRecord(record.execution, [], ['taskSupport'])
    if (execution === undefined) return { ok: false, issue: 'invalid' }
    if (hasOwn(execution, 'taskSupport')) {
      if (
        typeof execution.taskSupport !== 'string' ||
        !TASK_SUPPORT_VALUES.includes(
          execution.taskSupport as ExternalCapabilityTaskSupport,
        )
      ) {
        return { ok: false, issue: 'invalid' }
      }
      effectiveTaskSupport = execution.taskSupport as ExternalCapabilityTaskSupport
    }
  }

  return {
    ok: true,
    value: {
      rawName: record.name,
      descriptionSource,
      modelDescription,
      inputSchema,
      outputSchema,
      effectiveTaskSupport,
    },
  }
}

function parseNormalizedOutputSchema(
  value: unknown,
): ExternalCapabilityOutputSchemaV1 | undefined {
  const snapshot = inspectPlainRecord(value)
  if (snapshot === undefined) return undefined
  const record = snapshot.values
  if (record.presence === 'absent') {
    if (
      exactRecord(value, ['presence', 'enforcement']) === undefined ||
      record.enforcement !== 'not-advertised'
    ) {
      return undefined
    }
    return { presence: 'absent', enforcement: 'not-advertised' }
  }
  if (record.presence !== 'present') return undefined
  if (exactRecord(value, ['presence', 'enforcement', 'schema']) === undefined) {
    return undefined
  }
  const schema = detachJsonObject(record.schema)
  if (schema === undefined || !isPinnedToolSchemaBase(schema)) return undefined
  const enforcement = isSupportedSchema(schema)
    ? 'enforced'
    : 'fallback-unstructured'
  if (record.enforcement !== enforcement) return undefined
  return { presence: 'present', enforcement, schema }
}

function parseNormalizedTool(
  value: unknown,
): ExternalCapabilityNormalizedToolV1 | undefined {
  const record = exactRecord(value, [
    'rawName',
    'descriptionSource',
    'modelDescription',
    'inputSchema',
    'outputSchema',
    'effectiveTaskSupport',
  ])
  if (
    record === undefined ||
    typeof record.rawName !== 'string' ||
    !TOOL_NAME.test(record.rawName) ||
    typeof record.modelDescription !== 'string' ||
    typeof record.effectiveTaskSupport !== 'string' ||
    !TASK_SUPPORT_VALUES.includes(
      record.effectiveTaskSupport as ExternalCapabilityTaskSupport,
    )
  ) {
    return undefined
  }

  const description = inspectPlainRecord(record.descriptionSource)
  if (description === undefined) return undefined
  let descriptionSource: ExternalCapabilityDescriptionSource
  if (
    description.keys.length === 1 &&
    description.values.state === 'absent' &&
    record.modelDescription === ''
  ) {
    descriptionSource = { state: 'absent' }
  } else if (
    description.keys.length === 2 &&
    description.keys.includes('state') &&
    description.keys.includes('value') &&
    description.values.state === 'present' &&
    typeof description.values.value === 'string' &&
    record.modelDescription === description.values.value
  ) {
    descriptionSource = {
      state: 'present',
      value: description.values.value,
    }
  } else {
    return undefined
  }

  const inputSchema = detachJsonObject(record.inputSchema)
  if (inputSchema === undefined || !isPinnedToolSchemaBase(inputSchema)) {
    return undefined
  }
  const outputSchema = parseNormalizedOutputSchema(record.outputSchema)
  if (outputSchema === undefined) return undefined

  return {
    rawName: record.rawName,
    descriptionSource,
    modelDescription: record.modelDescription,
    inputSchema,
    outputSchema,
    effectiveTaskSupport:
      record.effectiveTaskSupport as ExternalCapabilityTaskSupport,
  }
}

function parseToolBody(
  value: unknown,
): ExternalCapabilityToolContractBodyV1 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'negotiatedProtocolRevision',
    'bridgeContractDigest',
    'tools',
  ])
  if (
    record === undefined ||
    record.schemaVersion !== TOOL_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    typeof record.negotiatedProtocolRevision !== 'string' ||
    !PROTOCOL_REVISIONS.includes(
      record.negotiatedProtocolRevision as ExternalCapabilityProtocolRevision,
    ) ||
    typeof record.bridgeContractDigest !== 'string' ||
    !BRIDGE_DIGEST.test(record.bridgeContractDigest)
  ) {
    return undefined
  }
  const rawTools = inspectExactArray(record.tools)
  if (rawTools === undefined || rawTools.length === 0) return undefined
  const tools: ExternalCapabilityNormalizedToolV1[] = []
  const names = new Set<string>()
  for (const rawTool of rawTools) {
    const tool = parseNormalizedTool(rawTool)
    if (tool === undefined || names.has(tool.rawName)) return undefined
    names.add(tool.rawName)
    tools.push(tool)
  }
  tools.sort((left, right) => compareCodeUnits(left.rawName, right.rawName))
  return {
    schemaVersion: TOOL_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    negotiatedProtocolRevision:
      record.negotiatedProtocolRevision as ExternalCapabilityProtocolRevision,
    bridgeContractDigest: record.bridgeContractDigest,
    tools,
  }
}

function parseArtifactSubject(
  value: unknown,
): ExternalCapabilityArtifactSubjectV1 | undefined {
  const record = inspectPlainRecord(value)
  if (record === undefined || !record.keys.includes('artifactSubjectDigest')) {
    return undefined
  }
  const bodyRecord: Record<string, unknown> = {}
  for (const key of record.keys) {
    if (key !== 'artifactSubjectDigest') {
      defineDataProperty(bodyRecord, key, record.values[key])
    }
  }
  const body = parseArtifactBody(bodyRecord)
  const suppliedDigest = record.values.artifactSubjectDigest
  if (
    body === undefined ||
    typeof suppliedDigest !== 'string' ||
    !ARTIFACT_DIGEST.test(suppliedDigest) ||
    suppliedDigest !== computeExternalCapabilityArtifactSubjectDigest(body)
  ) {
    return undefined
  }
  return { ...body, artifactSubjectDigest: suppliedDigest }
}

function parseLaunchContract(
  value: unknown,
): ExternalCapabilityLaunchContractV1 | undefined {
  const record = inspectPlainRecord(value)
  if (record === undefined || !record.keys.includes('launchContractDigest')) {
    return undefined
  }
  const bodyRecord: Record<string, unknown> = {}
  for (const key of record.keys) {
    if (key !== 'launchContractDigest') {
      defineDataProperty(bodyRecord, key, record.values[key])
    }
  }
  const body = parseLaunchBody(bodyRecord)
  const suppliedDigest = record.values.launchContractDigest
  if (
    body === undefined ||
    typeof suppliedDigest !== 'string' ||
    !LAUNCH_DIGEST.test(suppliedDigest) ||
    suppliedDigest !== computeExternalCapabilityLaunchContractDigest(body)
  ) {
    return undefined
  }
  return { ...body, launchContractDigest: suppliedDigest }
}

function parseBridgeContract(
  value: unknown,
): ExternalCapabilityBridgeContractV1 | undefined {
  const record = inspectPlainRecord(value)
  if (record === undefined || !record.keys.includes('bridgeContractDigest')) {
    return undefined
  }
  const bodyRecord: Record<string, unknown> = {}
  for (const key of record.keys) {
    if (key !== 'bridgeContractDigest') {
      defineDataProperty(bodyRecord, key, record.values[key])
    }
  }
  const body = parseBridgeBody(bodyRecord)
  const suppliedDigest = record.values.bridgeContractDigest
  if (
    body === undefined ||
    typeof suppliedDigest !== 'string' ||
    !BRIDGE_DIGEST.test(suppliedDigest) ||
    suppliedDigest !== computeExternalCapabilityBridgeContractDigest(body)
  ) {
    return undefined
  }
  return { ...body, bridgeContractDigest: suppliedDigest }
}

function parseToolContract(
  value: unknown,
): ExternalCapabilityToolContractV1 | undefined {
  const record = inspectPlainRecord(value)
  if (record === undefined || !record.keys.includes('toolContractDigest')) {
    return undefined
  }
  const bodyRecord: Record<string, unknown> = {}
  for (const key of record.keys) {
    if (key !== 'toolContractDigest') {
      defineDataProperty(bodyRecord, key, record.values[key])
    }
  }
  const body = parseToolBody(bodyRecord)
  const suppliedDigest = record.values.toolContractDigest
  if (
    body === undefined ||
    typeof suppliedDigest !== 'string' ||
    !TOOL_DIGEST.test(suppliedDigest) ||
    suppliedDigest !== computeExternalCapabilityToolContractDigest(body)
  ) {
    return undefined
  }
  return { ...body, toolContractDigest: suppliedDigest }
}

interface ParsedDescriptorBody {
  readonly body?: ExternalCapabilityDescriptorBodyV1
  readonly failure?: ExternalCapabilityKernelFailureCode
}

function parseDescriptorBody(value: unknown): ParsedDescriptorBody {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'capabilityId',
    'capabilityVersion',
    'artifactSubject',
    'launchContract',
    'bridgeContract',
    'toolContract',
  ])
  if (
    record === undefined ||
    record.schemaVersion !== DESCRIPTOR_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    typeof record.capabilityId !== 'string' ||
    !CAPABILITY_ID.test(record.capabilityId) ||
    !isImmutableVersion(record.capabilityVersion)
  ) {
    return { failure: 'capability-descriptor-invalid' }
  }
  const artifactSubject = parseArtifactSubject(record.artifactSubject)
  if (artifactSubject === undefined) {
    return { failure: 'capability-artifact-unclassifiable' }
  }
  const launchContract = parseLaunchContract(record.launchContract)
  if (launchContract === undefined) {
    return { failure: 'launch-contract-unclassifiable' }
  }
  const bridgeContract = parseBridgeContract(record.bridgeContract)
  if (bridgeContract === undefined) {
    return { failure: 'bridge-contract-invalid' }
  }
  const toolContract = parseToolContract(record.toolContract)
  if (toolContract === undefined) return { failure: 'tool-contract-invalid' }
  const artifactBridge = artifactSubject.components.find(
    (component) => component.logicalRole === 'bridge',
  )
  if (
    artifactSubject.transportKind !== launchContract.transportKind ||
    artifactBridge === undefined ||
    artifactBridge.identity !== bridgeContract.identity ||
    artifactBridge.version !== bridgeContract.version ||
    toolContract.bridgeContractDigest !== bridgeContract.bridgeContractDigest
  ) {
    return { failure: 'capability-descriptor-invalid' }
  }
  return {
    body: {
      schemaVersion: DESCRIPTOR_SCHEMA_VERSION,
      canonicalizationVersion: CANONICALIZATION_VERSION,
      capabilityId: record.capabilityId,
      capabilityVersion: record.capabilityVersion,
      artifactSubject,
      launchContract,
      bridgeContract,
      toolContract,
    },
  }
}

function asJsonObject(value: object): ExternalCapabilityJsonObject {
  return value as unknown as ExternalCapabilityJsonObject
}

export function canonicalizeExternalCapabilityArtifactSubject(
  value: unknown,
): string {
  const body = parseArtifactBody(value)
  if (body === undefined) {
    throw new TypeError(FAILURE_REASONS['capability-artifact-unclassifiable'])
  }
  return canonicalJson(asJsonObject(body))
}

export function computeExternalCapabilityArtifactSubjectDigest(
  value: unknown,
): string {
  return digest(
    ARTIFACT_DIGEST_NAMESPACE,
    canonicalizeExternalCapabilityArtifactSubject(value),
  )
}

export function sealExternalCapabilityArtifactSubject(
  value: unknown,
): ExternalCapabilityArtifactSubjectV1 {
  const body = parseArtifactBody(value)
  if (body === undefined) {
    throw new TypeError(FAILURE_REASONS['capability-artifact-unclassifiable'])
  }
  return freezeDeep({
    ...body,
    artifactSubjectDigest: computeExternalCapabilityArtifactSubjectDigest(body),
  })
}

export function canonicalizeExternalCapabilityLaunchContract(
  value: unknown,
): string {
  const body = parseLaunchBody(value)
  if (body === undefined) {
    throw new TypeError(FAILURE_REASONS['launch-contract-unclassifiable'])
  }
  return canonicalJson(asJsonObject(body))
}

export function computeExternalCapabilityLaunchContractDigest(
  value: unknown,
): string {
  return digest(
    LAUNCH_DIGEST_NAMESPACE,
    canonicalizeExternalCapabilityLaunchContract(value),
  )
}

export function sealExternalCapabilityLaunchContract(
  value: unknown,
): ExternalCapabilityLaunchContractV1 {
  const body = parseLaunchBody(value)
  if (body === undefined) {
    throw new TypeError(FAILURE_REASONS['launch-contract-unclassifiable'])
  }
  return freezeDeep({
    ...body,
    launchContractDigest: computeExternalCapabilityLaunchContractDigest(body),
  })
}

export function canonicalizeExternalCapabilityBridgeContract(
  value: unknown,
): string {
  const body = parseBridgeBody(value)
  if (body === undefined) {
    throw new TypeError(FAILURE_REASONS['bridge-contract-invalid'])
  }
  return canonicalJson(asJsonObject(body))
}

export function computeExternalCapabilityBridgeContractDigest(
  value: unknown,
): string {
  return digest(
    BRIDGE_DIGEST_NAMESPACE,
    canonicalizeExternalCapabilityBridgeContract(value),
  )
}

export function sealExternalCapabilityBridgeContract(
  value: unknown,
): ExternalCapabilityBridgeContractV1 {
  const body = parseBridgeBody(value)
  if (body === undefined) {
    throw new TypeError(FAILURE_REASONS['bridge-contract-invalid'])
  }
  return freezeDeep({
    ...body,
    bridgeContractDigest: computeExternalCapabilityBridgeContractDigest(body),
  })
}

export function canonicalizeExternalCapabilityToolContract(
  value: unknown,
): string {
  const body = parseToolBody(value)
  if (body === undefined) {
    throw new TypeError(FAILURE_REASONS['tool-contract-invalid'])
  }
  return canonicalJson(asJsonObject(body))
}

export function computeExternalCapabilityToolContractDigest(
  value: unknown,
): string {
  return digest(
    TOOL_DIGEST_NAMESPACE,
    canonicalizeExternalCapabilityToolContract(value),
  )
}

export function normalizeExternalCapabilityToolContract(
  value: unknown,
): ExternalCapabilityKernelResult<ExternalCapabilityToolContractV1> {
  try {
    const snapshot = inspectPlainRecord(value)
    if (snapshot === undefined) return failure('tool-contract-invalid')
    const expectedKeys = [
      'schemaVersion',
      'canonicalizationVersion',
      'negotiatedProtocolRevision',
      'bridgeContractDigest',
      'tools',
    ]
    if (expectedKeys.some((key) => !snapshot.keys.includes(key))) {
      return failure('tool-contract-invalid')
    }
    if (snapshot.keys.some((key) => !expectedKeys.includes(key))) {
      return failure('tool-contract-extension-unsupported')
    }
    const record = snapshot.values
    if (
      record.schemaVersion !== TOOL_CANDIDATE_SCHEMA_VERSION ||
      record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
      typeof record.negotiatedProtocolRevision !== 'string' ||
      !PROTOCOL_REVISIONS.includes(
        record.negotiatedProtocolRevision as ExternalCapabilityProtocolRevision,
      ) ||
      typeof record.bridgeContractDigest !== 'string' ||
      !BRIDGE_DIGEST.test(record.bridgeContractDigest)
    ) {
      return failure('tool-contract-invalid')
    }
    const rawTools = inspectExactArray(record.tools)
    if (rawTools === undefined || rawTools.length === 0) {
      return failure('tool-contract-invalid')
    }
    const names = new Set<string>()
    const tools: ExternalCapabilityNormalizedToolV1[] = []
    for (const rawTool of rawTools) {
      const parsed = parseToolCandidate(rawTool)
      if (!parsed.ok) {
        return failure(
          parsed.issue === 'extension'
            ? 'tool-contract-extension-unsupported'
            : 'tool-contract-invalid',
        )
      }
      if (names.has(parsed.value.rawName)) return failure('tool-contract-invalid')
      names.add(parsed.value.rawName)
      tools.push(parsed.value)
    }
    tools.sort((left, right) => compareCodeUnits(left.rawName, right.rawName))
    const body: ExternalCapabilityToolContractBodyV1 = {
      schemaVersion: TOOL_SCHEMA_VERSION,
      canonicalizationVersion: CANONICALIZATION_VERSION,
      negotiatedProtocolRevision:
        record.negotiatedProtocolRevision as ExternalCapabilityProtocolRevision,
      bridgeContractDigest: record.bridgeContractDigest,
      tools,
    }
    return success({
      ...body,
      toolContractDigest: computeExternalCapabilityToolContractDigest(body),
    })
  } catch {
    return failure('tool-contract-invalid')
  }
}

export function canonicalizeExternalCapabilityDescriptor(value: unknown): string {
  const parsed = parseDescriptorBody(value)
  if (parsed.body === undefined) {
    throw new TypeError(
      FAILURE_REASONS[parsed.failure ?? 'capability-descriptor-invalid'],
    )
  }
  return canonicalJson(asJsonObject(parsed.body))
}

export function computeExternalCapabilityDescriptorDigest(value: unknown): string {
  return digest(
    DESCRIPTOR_DIGEST_NAMESPACE,
    canonicalizeExternalCapabilityDescriptor(value),
  )
}

export function sealExternalCapabilityDescriptor(
  value: unknown,
): ExternalCapabilityDescriptorV1 {
  const parsed = parseDescriptorBody(value)
  if (parsed.body === undefined) {
    throw new TypeError(
      FAILURE_REASONS[parsed.failure ?? 'capability-descriptor-invalid'],
    )
  }
  return freezeDeep({
    ...parsed.body,
    descriptorDigest: computeExternalCapabilityDescriptorDigest(parsed.body),
  })
}

export function parseExternalCapabilityDescriptor(
  value: unknown,
): ExternalCapabilityKernelResult<ExternalCapabilityDescriptorV1> {
  try {
    const record = inspectPlainRecord(value)
    if (record === undefined || !record.keys.includes('descriptorDigest')) {
      return failure('capability-descriptor-invalid')
    }
    const bodyRecord: Record<string, unknown> = {}
    for (const key of record.keys) {
      if (key !== 'descriptorDigest') {
        defineDataProperty(bodyRecord, key, record.values[key])
      }
    }
    const parsed = parseDescriptorBody(bodyRecord)
    if (parsed.body === undefined) {
      return failure(parsed.failure ?? 'capability-descriptor-invalid')
    }
    const suppliedDigest = record.values.descriptorDigest
    if (
      typeof suppliedDigest !== 'string' ||
      !DESCRIPTOR_DIGEST.test(suppliedDigest) ||
      suppliedDigest !== computeExternalCapabilityDescriptorDigest(parsed.body)
    ) {
      return failure('capability-descriptor-invalid')
    }
    return success({ ...parsed.body, descriptorDigest: suppliedDigest })
  } catch {
    return failure('capability-descriptor-invalid')
  }
}
