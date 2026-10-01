import { types as utilTypes } from 'node:util'

import type {
  ActionPolicy,
  EffectClass,
  HumanRoleRef,
  VersionedIdentity,
} from '../domain/business-matter.js'

export type IdentityPolicyDenialCode =
  | 'invalid-request'
  | 'clock-unavailable'
  | 'identity-provider-unavailable'
  | 'identity-assertion-invalid'
  | 'identity-not-active'
  | 'identity-audience-mismatch'
  | 'identity-session-mismatch'
  | 'policy-provider-unavailable'
  | 'policy-snapshot-invalid'
  | 'policy-not-active'
  | 'policy-organization-mismatch'
  | 'policy-subject-denied'
  | 'policy-role-not-held'
  | 'policy-operation-denied'
  | 'policy-action-scope-denied'
  | 'policy-effect-class-denied'
  | 'policy-decision-requirement-denied'

export interface ActionAuthorizationRequest {
  readonly sessionId: string
  /** WT-02B.2D: lookup clue only — the caller's intended organization. Never authority; the policy provider must answer for exactly this organization. */
  readonly requestedOrganizationRef: string
  readonly requiredRoleRef: string
  readonly operation: string
  readonly actionPolicy: ActionPolicy
}

export interface IdentityProviderRequest {
  readonly sessionId: string
  readonly audience: string
  readonly evaluatedAt: string
}

export interface IdentityAssertion {
  readonly issuer: VersionedIdentity
  /** WT-02B.2D: the Sage-internal opaque identity handle (raw subject never indexes the kernel face). */
  readonly identityHandle: string
  readonly audience: string
  readonly sessionId: string
  readonly authenticatedAt: string
  readonly expiresAt: string
}

export interface OrganizationRoleAssignment {
  readonly identityHandle: string
  readonly roleRef: string
}

export interface OrganizationPolicyGrant {
  readonly roleRef: string
  readonly operation: string
  readonly actionScope: string
  readonly effectClass: EffectClass
  readonly requiresDecision: boolean
}

export interface OrganizationPolicySnapshot {
  readonly policy: VersionedIdentity
  readonly organizationId: string
  readonly validFrom: string
  readonly expiresAt: string
  readonly roleAssignments: readonly OrganizationRoleAssignment[]
  readonly grants: readonly OrganizationPolicyGrant[]
}

export interface PolicyProviderRequest {
  readonly requestedOrganizationRef: string
  readonly identityHandle: string
  readonly requiredRoleRef: string
  readonly operation: string
  readonly actionPolicy: ActionPolicy
  readonly evaluatedAt: string
}

export interface AuthoritySnapshot {
  readonly issuer: VersionedIdentity
  readonly identityHandle: string
  readonly audience: string
  readonly sessionId: string
  /** The policy-proven organization (honesty check binds it to the requested lookup clue). */
  readonly organizationId: string
  readonly roleRef: string
  readonly operation: string
  readonly actionPolicy: ActionPolicy
  readonly policy: VersionedIdentity
  readonly authenticatedAt: string
  readonly identityExpiresAt: string
  readonly policyValidFrom: string
  readonly policyExpiresAt: string
  readonly evaluatedAt: string
}

export interface AuthorizedIdentityPolicyResolution {
  readonly kind: 'authorized'
  readonly actor: HumanRoleRef
  readonly authoritySnapshot: AuthoritySnapshot
}

export interface DeniedIdentityPolicyResolution {
  readonly kind: 'denied'
  readonly code: IdentityPolicyDenialCode
  readonly reason: string
}

export type IdentityPolicyResolution =
  | AuthorizedIdentityPolicyResolution
  | DeniedIdentityPolicyResolution

export interface IdentityPolicyResolverPorts {
  readonly audience: string
  readonly resolveIdentity: (request: IdentityProviderRequest) => unknown
  readonly resolvePolicy: (request: PolicyProviderRequest) => unknown
  readonly now: () => unknown
}

export interface IdentityPolicyResolver {
  readonly resolve: (request: unknown) => IdentityPolicyResolution
}

const EFFECT_CLASSES: readonly EffectClass[] = [
  'local-read',
  'local-write',
  'external-read',
  'external-write',
  'privileged',
]

const DENIAL_REASONS: Readonly<Record<IdentityPolicyDenialCode, string>> = {
  'invalid-request': 'The authorization request is invalid.',
  'clock-unavailable': 'The trusted evaluation clock is unavailable.',
  'identity-provider-unavailable': 'The trusted identity provider is unavailable.',
  'identity-assertion-invalid': 'The trusted identity provider returned an invalid assertion.',
  'identity-not-active': 'The identity assertion is not active at the evaluation instant.',
  'identity-audience-mismatch': 'The identity assertion targets another audience.',
  'identity-session-mismatch': 'The identity assertion belongs to another session.',
  'policy-provider-unavailable': 'The trusted organization policy provider is unavailable.',
  'policy-snapshot-invalid': 'The trusted organization policy provider returned an invalid snapshot.',
  'policy-not-active': 'The organization policy is not active at the evaluation instant.',
  'policy-organization-mismatch': 'The organization policy does not answer for the requested organization.',
  'policy-subject-denied': 'The organization policy does not grant this subject access.',
  'policy-role-not-held': 'The organization policy does not assign the required role to this subject.',
  'policy-operation-denied': 'The organization policy does not grant the requested operation.',
  'policy-action-scope-denied': 'The organization policy does not grant the requested action scope.',
  'policy-effect-class-denied': 'The organization policy does not grant the requested effect class.',
  'policy-decision-requirement-denied': 'The organization policy does not match the declared decision requirement.',
}

const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value
  }
  for (const key of Reflect.ownKeys(value)) {
    freezeDeep(Reflect.get(value, key))
  }
  return Object.freeze(value)
}

function denied(code: IdentityPolicyDenialCode): DeniedIdentityPolicyResolution {
  return Object.freeze({
    kind: 'denied' as const,
    code,
    reason: DENIAL_REASONS[code],
  })
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  try {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      utilTypes.isProxy(value)
    ) {
      return undefined
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return undefined

    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(descriptors)
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      return undefined
    }

    const snapshot: Record<string, unknown> = Object.create(null)
    for (const key of expectedKeys) {
      const descriptor = descriptors[key]
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, 'value') ||
        descriptor.enumerable !== true
      ) {
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
    if (!Array.isArray(value) || utilTypes.isProxy(value)) return undefined
    if (Object.getPrototypeOf(value) !== Array.prototype) return undefined

    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
      PropertyKey,
      PropertyDescriptor
    >
    const lengthDescriptor = descriptors.length
    if (
      lengthDescriptor === undefined ||
      !Object.hasOwn(lengthDescriptor, 'value') ||
      typeof lengthDescriptor.value !== 'number' ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    ) {
      return undefined
    }

    const length = lengthDescriptor.value
    const keys = Reflect.ownKeys(descriptors)
    if (keys.length !== length + 1) return undefined

    const snapshot: unknown[] = []
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)]
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, 'value') ||
        descriptor.enumerable !== true
      ) {
        return undefined
      }
      snapshot.push(descriptor.value)
    }
    return snapshot
  } catch {
    return undefined
  }
}

function exactString(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    return undefined
  }
  return value
}

function exactTimestamp(value: unknown): string | undefined {
  const timestamp = exactString(value)
  if (timestamp === undefined || !ISO_UTC_TIMESTAMP.test(timestamp)) return undefined
  const milliseconds = Date.parse(timestamp)
  if (Number.isNaN(milliseconds)) return undefined
  const normalized = timestamp.includes('.')
    ? timestamp
    : timestamp.replace(/Z$/u, '.000Z')
  return new Date(milliseconds).toISOString() === normalized ? timestamp : undefined
}

function parseVersionedIdentity(value: unknown): VersionedIdentity | undefined {
  const record = exactRecord(value, ['identity', 'version', 'digest'])
  if (record === undefined) return undefined
  const identity = exactString(record.identity)
  const version = exactString(record.version)
  const digest = exactString(record.digest)
  if (identity === undefined || version === undefined || digest === undefined) {
    return undefined
  }
  return { identity, version, digest }
}

function parseActionPolicy(value: unknown): ActionPolicy | undefined {
  const record = exactRecord(value, [
    'actionScope',
    'effectClass',
    'requiresDecision',
  ])
  if (record === undefined) return undefined
  const actionScope = exactString(record.actionScope)
  if (
    actionScope === undefined ||
    typeof record.effectClass !== 'string' ||
    !EFFECT_CLASSES.includes(record.effectClass as EffectClass) ||
    typeof record.requiresDecision !== 'boolean'
  ) {
    return undefined
  }
  return {
    actionScope,
    effectClass: record.effectClass as EffectClass,
    requiresDecision: record.requiresDecision,
  }
}

function parseRequest(value: unknown): ActionAuthorizationRequest | undefined {
  const record = exactRecord(value, [
    'sessionId',
    'requestedOrganizationRef',
    'requiredRoleRef',
    'operation',
    'actionPolicy',
  ])
  if (record === undefined) return undefined
  const sessionId = exactString(record.sessionId)
  const requestedOrganizationRef = exactString(record.requestedOrganizationRef)
  const requiredRoleRef = exactString(record.requiredRoleRef)
  const operation = exactString(record.operation)
  const actionPolicy = parseActionPolicy(record.actionPolicy)
  if (
    sessionId === undefined ||
    requestedOrganizationRef === undefined ||
    requiredRoleRef === undefined ||
    operation === undefined ||
    actionPolicy === undefined
  ) {
    return undefined
  }
  return {
    sessionId,
    requestedOrganizationRef,
    requiredRoleRef,
    operation,
    actionPolicy,
  }
}

function parseIdentityAssertion(value: unknown): IdentityAssertion | undefined {
  const record = exactRecord(value, [
    'issuer',
    'identityHandle',
    'audience',
    'sessionId',
    'authenticatedAt',
    'expiresAt',
  ])
  if (record === undefined) return undefined
  const issuer = parseVersionedIdentity(record.issuer)
  const identityHandle = exactString(record.identityHandle)
  const audience = exactString(record.audience)
  const sessionId = exactString(record.sessionId)
  const authenticatedAt = exactTimestamp(record.authenticatedAt)
  const expiresAt = exactTimestamp(record.expiresAt)
  if (
    issuer === undefined ||
    identityHandle === undefined ||
    audience === undefined ||
    sessionId === undefined ||
    authenticatedAt === undefined ||
    expiresAt === undefined
  ) {
    return undefined
  }
  return {
    issuer,
    identityHandle,
    audience,
    sessionId,
    authenticatedAt,
    expiresAt,
  }
}

function parseRoleAssignment(
  value: unknown,
): OrganizationRoleAssignment | undefined {
  const record = exactRecord(value, ['identityHandle', 'roleRef'])
  if (record === undefined) return undefined
  const identityHandle = exactString(record.identityHandle)
  const roleRef = exactString(record.roleRef)
  if (identityHandle === undefined || roleRef === undefined) return undefined
  return { identityHandle, roleRef }
}

function parsePolicyGrant(value: unknown): OrganizationPolicyGrant | undefined {
  const record = exactRecord(value, [
    'roleRef',
    'operation',
    'actionScope',
    'effectClass',
    'requiresDecision',
  ])
  if (record === undefined) return undefined
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

function parsePolicySnapshot(value: unknown): OrganizationPolicySnapshot | undefined {
  const record = exactRecord(value, [
    'policy',
    'organizationId',
    'validFrom',
    'expiresAt',
    'roleAssignments',
    'grants',
  ])
  if (record === undefined) return undefined
  const policy = parseVersionedIdentity(record.policy)
  const organizationId = exactString(record.organizationId)
  const validFrom = exactTimestamp(record.validFrom)
  const expiresAt = exactTimestamp(record.expiresAt)
  const rawRoleAssignments = exactArray(record.roleAssignments)
  const rawGrants = exactArray(record.grants)
  if (
    policy === undefined ||
    organizationId === undefined ||
    validFrom === undefined ||
    expiresAt === undefined ||
    rawRoleAssignments === undefined ||
    rawGrants === undefined
  ) {
    return undefined
  }
  const roleAssignments = rawRoleAssignments.map(parseRoleAssignment)
  const grants = rawGrants.map(parsePolicyGrant)
  if (
    roleAssignments.some((assignment) => assignment === undefined) ||
    grants.some((grant) => grant === undefined)
  ) {
    return undefined
  }
  const assignmentKeys = (roleAssignments as OrganizationRoleAssignment[])
    .map((assignment) => JSON.stringify([
      assignment.identityHandle,
      assignment.roleRef,
    ]))
  if (new Set(assignmentKeys).size !== assignmentKeys.length) return undefined

  const grantKeys = (grants as OrganizationPolicyGrant[])
    .map((grant) => JSON.stringify([
      grant.roleRef,
      grant.operation,
      grant.actionScope,
    ]))
  if (new Set(grantKeys).size !== grantKeys.length) return undefined

  return {
    policy,
    organizationId,
    validFrom,
    expiresAt,
    roleAssignments: roleAssignments as OrganizationRoleAssignment[],
    grants: grants as OrganizationPolicyGrant[],
  }
}

function isActive(
  validFrom: string,
  expiresAt: string,
  evaluatedAt: string,
): boolean {
  const evaluated = Date.parse(evaluatedAt)
  return Date.parse(validFrom) <= evaluated && evaluated < Date.parse(expiresAt)
}

function authorize(
  request: ActionAuthorizationRequest,
  identity: IdentityAssertion,
  policy: OrganizationPolicySnapshot,
  evaluatedAt: string,
  audience: string,
): IdentityPolicyResolution {
  if (identity.audience !== audience) {
    return denied('identity-audience-mismatch')
  }
  if (identity.sessionId !== request.sessionId) {
    return denied('identity-session-mismatch')
  }
  if (!isActive(identity.authenticatedAt, identity.expiresAt, evaluatedAt)) {
    return denied('identity-not-active')
  }
  // WT-02B.2D: the provider must answer for exactly the requested lookup clue; anything else fails closed.
  if (policy.organizationId !== request.requestedOrganizationRef) {
    return denied('policy-organization-mismatch')
  }
  if (!isActive(policy.validFrom, policy.expiresAt, evaluatedAt)) {
    return denied('policy-not-active')
  }

  let assignments = policy.roleAssignments.filter(
    (assignment) => assignment.identityHandle === identity.identityHandle,
  )
  if (assignments.length === 0) return denied('policy-subject-denied')
  assignments = assignments.filter(
    (assignment) => assignment.roleRef === request.requiredRoleRef,
  )
  if (assignments.length === 0) return denied('policy-role-not-held')

  let candidates = policy.grants.filter(
    (grant) => grant.roleRef === request.requiredRoleRef,
  )
  candidates = candidates.filter(
    (grant) => grant.operation === request.operation,
  )
  if (candidates.length === 0) return denied('policy-operation-denied')
  candidates = candidates.filter(
    (grant) => grant.actionScope === request.actionPolicy.actionScope,
  )
  if (candidates.length === 0) return denied('policy-action-scope-denied')
  candidates = candidates.filter(
    (grant) => grant.effectClass === request.actionPolicy.effectClass,
  )
  if (candidates.length === 0) return denied('policy-effect-class-denied')
  candidates = candidates.filter(
    (grant) => grant.requiresDecision === request.actionPolicy.requiresDecision,
  )
  if (candidates.length === 0) {
    return denied('policy-decision-requirement-denied')
  }

  const selectedGrant = candidates[0]
  if (selectedGrant === undefined) return denied('policy-snapshot-invalid')

  return freezeDeep({
    kind: 'authorized' as const,
    actor: {
      kind: 'human' as const,
      roleRef: selectedGrant.roleRef,
    },
    authoritySnapshot: {
      issuer: { ...identity.issuer },
      identityHandle: identity.identityHandle,
      audience: identity.audience,
      sessionId: identity.sessionId,
      organizationId: policy.organizationId,
      roleRef: selectedGrant.roleRef,
      operation: selectedGrant.operation,
      actionPolicy: {
        actionScope: selectedGrant.actionScope,
        effectClass: selectedGrant.effectClass,
        requiresDecision: selectedGrant.requiresDecision,
      },
      policy: { ...policy.policy },
      authenticatedAt: identity.authenticatedAt,
      identityExpiresAt: identity.expiresAt,
      policyValidFrom: policy.validFrom,
      policyExpiresAt: policy.expiresAt,
      evaluatedAt,
    },
  })
}

export function createIdentityPolicyResolver(
  ports: IdentityPolicyResolverPorts,
): IdentityPolicyResolver {
  const audience = exactString(ports.audience)
  if (audience === undefined) {
    throw new TypeError('IdentityPolicyResolver requires a non-empty audience.')
  }

  return Object.freeze({
    resolve(untrustedRequest: unknown): IdentityPolicyResolution {
      const request = parseRequest(untrustedRequest)
      if (request === undefined) return denied('invalid-request')

      let evaluatedAt: string | undefined
      try {
        evaluatedAt = exactTimestamp(ports.now())
      } catch {
        return denied('clock-unavailable')
      }
      if (evaluatedAt === undefined) return denied('clock-unavailable')

      const identityRequest = freezeDeep({
        sessionId: request.sessionId,
        audience,
        evaluatedAt,
      })
      let rawIdentity: unknown
      try {
        rawIdentity = ports.resolveIdentity(identityRequest)
      } catch {
        return denied('identity-provider-unavailable')
      }
      const identity = parseIdentityAssertion(rawIdentity)
      if (identity === undefined) return denied('identity-assertion-invalid')
      if (identity.audience !== audience) {
        return denied('identity-audience-mismatch')
      }
      if (identity.sessionId !== request.sessionId) {
        return denied('identity-session-mismatch')
      }
      if (!isActive(identity.authenticatedAt, identity.expiresAt, evaluatedAt)) {
        return denied('identity-not-active')
      }

      const policyRequest = freezeDeep({
        requestedOrganizationRef: request.requestedOrganizationRef,
        identityHandle: identity.identityHandle,
        requiredRoleRef: request.requiredRoleRef,
        operation: request.operation,
        actionPolicy: { ...request.actionPolicy },
        evaluatedAt,
      })
      let rawPolicy: unknown
      try {
        rawPolicy = ports.resolvePolicy(policyRequest)
      } catch {
        return denied('policy-provider-unavailable')
      }
      const policy = parsePolicySnapshot(rawPolicy)
      if (policy === undefined) return denied('policy-snapshot-invalid')

      return authorize(request, identity, policy, evaluatedAt, audience)
    },
  })
}
