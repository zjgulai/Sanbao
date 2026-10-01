/** WT-02B.2E local Organization Policy Provider: `$SAGE_ROOT/organization-policy.json` is the
 * instance-local authority for membership / role / grant. Read-only; the file is re-read on
 * every resolve (file is truth — policy edits need no restart). Fail closed by signal:
 * unreadable/absent throws (kernel → policy-provider-unavailable), malformed or out-of-shape
 * content returns null (kernel → policy-snapshot-invalid). Zero fs import: reading arrives
 * through the injected port. */
import { createHash } from 'node:crypto'
import type { EffectClass } from '../domain/business-matter.js'
import type {
  OrganizationPolicyGrant,
  OrganizationPolicySnapshot,
  PolicyProviderRequest,
} from '../security/identity-policy.js'

export const ORGANIZATION_POLICY_SCHEMA = 'sage.organization-policy.v1' as const

const MAX_POLICY_BYTES = 256 * 1024
const DIGEST_NAMESPACE = 'urn:sage:organization-policy:sha256:'
const EFFECT_CLASSES: readonly EffectClass[] = [
  'local-read',
  'local-write',
  'external-read',
  'external-write',
  'privileged',
]
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u

const TOP_KEYS = ['schemaVersion', 'organizationId', 'policy', 'validFrom', 'expiresAt', 'membership', 'grants'] as const
const POLICY_KEYS = ['identity', 'version'] as const
const MEMBERSHIP_KEYS = ['mode', 'roleRefs'] as const
const GRANT_KEYS = ['roleRef', 'operation', 'actionScope', 'effectClass', 'requiresDecision'] as const

export interface LocalOrganizationPolicyProvider {
  readonly resolve: (request: PolicyProviderRequest) => unknown
}

export interface LocalOrganizationPolicyProviderInput {
  readonly policyPath: string
  /** Sync reader (main injects readFileSync); the kernel's provider ports are synchronous. */
  readonly readFileBytes: (absolutePath: string) => Buffer
}

/** WT-02D.2A: single-parse-path load result — the provider, the availability check and the
 * organization clue all consume this. */
export interface LoadedOrganizationPolicy {
  readonly organizationId: string
  readonly policy: { readonly identity: string; readonly version: string; readonly digest: string }
  readonly validFrom: string
  readonly expiresAt: string
  readonly roleRefs: readonly string[]
  readonly grants: readonly OrganizationPolicyGrant[]
}

export type OrganizationPolicyLoad =
  | { readonly kind: 'loaded'; readonly policy: LoadedOrganizationPolicy }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'invalid' }

interface ParsedPolicy {
  readonly schemaVersion: typeof ORGANIZATION_POLICY_SCHEMA
  readonly organizationId: string
  readonly policy: { readonly identity: string; readonly version: string }
  readonly validFrom: string
  readonly expiresAt: string
  readonly membership: { readonly mode: 'instance-operator'; readonly roleRefs: readonly string[] }
  readonly grants: readonly OrganizationPolicyGrant[]
}

// The untrusted input here is the file bytes, which reach these guards only through
// JSON.parse — an inert plain-object graph (no accessors, no proxies). Direct shape
// checks are therefore honest; the kernel's descriptor ceremony is for live objects.

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(record)
  return own.length === keys.length && keys.every((key) => own.includes(key))
}

function exactString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) return undefined
  return value
}

function exactTimestamp(value: unknown): string | undefined {
  const timestamp = exactString(value)
  if (timestamp === undefined || !ISO_UTC_TIMESTAMP.test(timestamp)) return undefined
  const milliseconds = Date.parse(timestamp)
  if (Number.isNaN(milliseconds)) return undefined
  const normalized = timestamp.includes('.') ? timestamp : timestamp.replace(/Z$/u, '.000Z')
  return new Date(milliseconds).toISOString() === normalized ? timestamp : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function parseGrant(value: unknown): OrganizationPolicyGrant | undefined {
  const record = asRecord(value)
  if (record === undefined || !exactKeys(record, GRANT_KEYS)) return undefined
  const roleRef = exactString(record.roleRef)
  const operation = exactString(record.operation)
  const actionScope = exactString(record.actionScope)
  if (
    roleRef === undefined ||
    operation === undefined ||
    actionScope === undefined ||
    typeof record.effectClass !== 'string' ||
    !EFFECT_CLASSES.includes(record.effectClass as EffectClass) ||
    typeof record.requiresDecision !== 'boolean'
  ) {
    return undefined
  }
  return {
    roleRef,
    operation,
    actionScope,
    effectClass: record.effectClass as EffectClass,
    requiresDecision: record.requiresDecision,
  }
}

function parseMembership(value: unknown): ParsedPolicy['membership'] | undefined {
  const record = asRecord(value)
  if (record === undefined || !exactKeys(record, MEMBERSHIP_KEYS)) return undefined
  if (record.mode !== 'instance-operator') return undefined
  if (!Array.isArray(record.roleRefs) || record.roleRefs.length === 0) return undefined
  const roleRefs: string[] = []
  for (const item of record.roleRefs) {
    const roleRef = exactString(item)
    if (roleRef === undefined) return undefined
    roleRefs.push(roleRef)
  }
  if (new Set(roleRefs).size !== roleRefs.length) return undefined
  return { mode: 'instance-operator', roleRefs }
}

function parsePolicy(value: unknown): ParsedPolicy | undefined {
  const record = asRecord(value)
  if (record === undefined || !exactKeys(record, TOP_KEYS)) return undefined
  if (record.schemaVersion !== ORGANIZATION_POLICY_SCHEMA) return undefined
  const organizationId = exactString(record.organizationId)
  const validFrom = exactTimestamp(record.validFrom)
  const expiresAt = exactTimestamp(record.expiresAt)
  const policy = asRecord(record.policy)
  if (policy === undefined || !exactKeys(policy, POLICY_KEYS)) return undefined
  const identity = exactString(policy.identity)
  const version = exactString(policy.version)
  const membership = parseMembership(record.membership)
  if (
    organizationId === undefined ||
    validFrom === undefined ||
    expiresAt === undefined ||
    identity === undefined ||
    version === undefined ||
    membership === undefined ||
    !Array.isArray(record.grants)
  ) {
    return undefined
  }
  const grants: OrganizationPolicyGrant[] = []
  for (const item of record.grants) {
    const grant = parseGrant(item)
    if (grant === undefined) return undefined
    grants.push(grant)
  }
  const grantKeys = grants.map((grant) => JSON.stringify([grant.roleRef, grant.operation, grant.actionScope]))
  if (new Set(grantKeys).size !== grantKeys.length) return undefined
  return {
    schemaVersion: ORGANIZATION_POLICY_SCHEMA,
    organizationId,
    policy: { identity, version },
    validFrom,
    expiresAt,
    membership,
    grants,
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortedRoleRefs(parsed: ParsedPolicy): string[] {
  return [...parsed.membership.roleRefs].sort(compare)
}

function canonicalGrants(parsed: ParsedPolicy): OrganizationPolicyGrant[] {
  return [...parsed.grants]
    .sort((a, b) =>
      compare(a.roleRef, b.roleRef) || compare(a.operation, b.operation) || compare(a.actionScope, b.actionScope))
    .map(({ roleRef, operation, actionScope, effectClass, requiresDecision }) =>
      ({ roleRef, operation, actionScope, effectClass, requiresDecision }))
}

function canonicalDigest(parsed: ParsedPolicy): string {
  // Explicit key order is the canonical form (spec §2.4); sorted lists make the digest
  // insensitive to file writing order. The author maintains identity/version; the digest
  // is computed here and cannot be forged through the file.
  const canonical = JSON.stringify({
    schemaVersion: parsed.schemaVersion,
    organizationId: parsed.organizationId,
    policy: { identity: parsed.policy.identity, version: parsed.policy.version },
    validFrom: parsed.validFrom,
    expiresAt: parsed.expiresAt,
    membership: { mode: parsed.membership.mode, roleRefs: sortedRoleRefs(parsed) },
    grants: canonicalGrants(parsed),
  })
  return DIGEST_NAMESPACE + createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex')
}

/** WT-02D.2A: the single synchronous parse path over the policy file. `unavailable` covers every
 * read failure (ENOENT included); `invalid` covers oversized / unparseable / out-of-shape
 * content. Consumers: the provider (below), the runtime's availability check and the
 * organization-clue lookup. */
export function loadOrganizationPolicy(input: LocalOrganizationPolicyProviderInput): OrganizationPolicyLoad {
  let bytes: Buffer
  try {
    bytes = input.readFileBytes(input.policyPath)
  } catch {
    return { kind: 'unavailable' }
  }
  if (bytes.byteLength > MAX_POLICY_BYTES) return { kind: 'invalid' }
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(bytes.toString('utf8'))
  } catch {
    return { kind: 'invalid' }
  }
  const parsed = parsePolicy(parsedJson)
  if (parsed === undefined) return { kind: 'invalid' }
  return {
    kind: 'loaded',
    policy: {
      organizationId: parsed.organizationId,
      policy: {
        identity: parsed.policy.identity,
        version: parsed.policy.version,
        digest: canonicalDigest(parsed),
      },
      validFrom: parsed.validFrom,
      expiresAt: parsed.expiresAt,
      roleRefs: sortedRoleRefs(parsed),
      grants: canonicalGrants(parsed),
    },
  }
}

export function createLocalOrganizationPolicyProvider(
  input: LocalOrganizationPolicyProviderInput,
): LocalOrganizationPolicyProvider {
  return Object.freeze({
    resolve(request: PolicyProviderRequest): unknown {
      const load = loadOrganizationPolicy(input)
      if (load.kind === 'unavailable') {
        // Stable message; the kernel discards it and maps the throw to policy-provider-unavailable.
        throw new Error('sage-organization-policy: policy file is unavailable')
      }
      if (load.kind === 'invalid') return null
      const { policy } = load
      const snapshot: OrganizationPolicySnapshot = {
        policy: policy.policy,
        organizationId: policy.organizationId,
        validFrom: policy.validFrom,
        expiresAt: policy.expiresAt,
        // instance-operator membership: the requesting (verified) identity holds the declared
        // roles. The file carries no identity material; the binding exists only at runtime.
        roleAssignments: policy.roleRefs.map((roleRef) => ({ identityHandle: request.identityHandle, roleRef })),
        grants: policy.grants,
      }
      return snapshot
    },
  })
}
