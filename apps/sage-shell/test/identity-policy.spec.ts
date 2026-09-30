import { describe, expect, it } from 'vitest'

import {
  createIdentityPolicyResolver,
  type ActionAuthorizationRequest,
  type IdentityAssertion,
  type IdentityPolicyDenialCode,
  type IdentityPolicyResolution,
  type IdentityProviderRequest,
  type OrganizationPolicySnapshot,
  type PolicyProviderRequest,
} from '../src/security/identity-policy.js'

const NOW = '2026-09-28T12:00:00Z'

const REQUEST: ActionAuthorizationRequest = {
  sessionId: 'session:sage-desktop-001',
  requiredRoleRef: 'role:catalog-owner',
  operation: 'business-matter.start-attempt',
  actionPolicy: {
    actionScope: 'catalog.prepare-draft',
    effectClass: 'local-write',
    requiresDecision: false,
  },
}

const IDENTITY: IdentityAssertion = {
  issuer: {
    identity: 'identity-provider:sage-local',
    version: '1.0.0',
    digest: 'sha256:identity-provider-sage-local-v1',
  },
  subjectId: 'subject:operator-001',
  audience: 'sage-desktop',
  sessionId: 'session:sage-desktop-001',
  organizationId: 'organization:sage',
  authenticatedAt: '2026-09-28T11:00:00Z',
  expiresAt: '2026-09-28T13:00:00Z',
}

const POLICY: OrganizationPolicySnapshot = {
  policy: {
    identity: 'policy:sage-organization-access',
    version: '2026-09-28.1',
    digest: 'sha256:sage-organization-access-2026-09-28-1',
  },
  organizationId: 'organization:sage',
  validFrom: '2026-09-28T00:00:00Z',
  expiresAt: '2026-09-29T00:00:00Z',
  roleAssignments: [
    {
      subjectId: 'subject:operator-001',
      roleRef: 'role:catalog-owner',
    },
  ],
  grants: [
    {
      roleRef: 'role:catalog-owner',
      operation: 'business-matter.start-attempt',
      actionScope: 'catalog.prepare-draft',
      effectClass: 'local-write',
      requiresDecision: false,
    },
  ],
}

interface HarnessOverrides {
  readonly identity?: unknown
  readonly policy?: unknown
  readonly now?: string
  readonly identityFailure?: Error
  readonly policyFailure?: Error
  readonly clockFailure?: Error
}

function harness(overrides: HarnessOverrides = {}) {
  const identityRequests: IdentityProviderRequest[] = []
  const policyRequests: PolicyProviderRequest[] = []
  const resolver = createIdentityPolicyResolver({
    audience: 'sage-desktop',
    resolveIdentity(request) {
      identityRequests.push(request)
      if (overrides.identityFailure !== undefined) throw overrides.identityFailure
      return overrides.identity ?? IDENTITY
    },
    resolvePolicy(request) {
      policyRequests.push(request)
      if (overrides.policyFailure !== undefined) throw overrides.policyFailure
      return overrides.policy ?? POLICY
    },
    now() {
      if (overrides.clockFailure !== undefined) throw overrides.clockFailure
      return overrides.now ?? NOW
    },
  })

  return { resolver, identityRequests, policyRequests }
}

function expectDenied(
  resolution: IdentityPolicyResolution,
  code: IdentityPolicyDenialCode,
): void {
  expect(resolution.kind).toBe('denied')
  if (resolution.kind !== 'denied') throw new Error(`Expected denial ${code}.`)
  expect(resolution.code).toBe(code)
  expect(resolution.reason.length).toBeGreaterThan(0)
  expect(Object.isFrozen(resolution)).toBe(true)
}

describe('WT-02B.1 identity and policy resolver kernel', () => {
  it('authorizes only an exact trusted identity and policy grant, then returns canonical frozen provenance', () => {
    const { resolver, identityRequests, policyRequests } = harness()

    const resolution = resolver.resolve(REQUEST)

    expect(resolution).toEqual({
      kind: 'authorized',
      actor: {
        kind: 'human',
        roleRef: 'role:catalog-owner',
      },
      authoritySnapshot: {
        issuer: IDENTITY.issuer,
        subjectId: 'subject:operator-001',
        audience: 'sage-desktop',
        sessionId: 'session:sage-desktop-001',
        organizationId: 'organization:sage',
        roleRef: 'role:catalog-owner',
        operation: 'business-matter.start-attempt',
        actionPolicy: REQUEST.actionPolicy,
        policy: POLICY.policy,
        authenticatedAt: '2026-09-28T11:00:00Z',
        identityExpiresAt: '2026-09-28T13:00:00Z',
        policyValidFrom: '2026-09-28T00:00:00Z',
        policyExpiresAt: '2026-09-29T00:00:00Z',
        evaluatedAt: NOW,
      },
    })
    expect(identityRequests).toEqual([{
      sessionId: REQUEST.sessionId,
      audience: 'sage-desktop',
      evaluatedAt: NOW,
    }])
    expect(policyRequests).toEqual([{
      organizationId: IDENTITY.organizationId,
      subjectId: IDENTITY.subjectId,
      requiredRoleRef: REQUEST.requiredRoleRef,
      operation: REQUEST.operation,
      actionPolicy: REQUEST.actionPolicy,
      evaluatedAt: NOW,
    }])

    if (resolution.kind !== 'authorized') throw new Error('Expected authorization.')
    expect(Object.isFrozen(resolution)).toBe(true)
    expect(Object.isFrozen(resolution.actor)).toBe(true)
    expect(Object.isFrozen(resolution.authoritySnapshot)).toBe(true)
    expect(Object.isFrozen(resolution.authoritySnapshot.issuer)).toBe(true)
    expect(Object.isFrozen(resolution.authoritySnapshot.actionPolicy)).toBe(true)
    expect(Object.isFrozen(resolution.authoritySnapshot.policy)).toBe(true)
    expect(Object.isFrozen(identityRequests[0])).toBe(true)
    expect(Object.isFrozen(policyRequests[0])).toBe(true)
    expect(Object.isFrozen(policyRequests[0]?.actionPolicy)).toBe(true)
  })

  it('does not mutate trusted inputs and detaches authority provenance from later input mutation', () => {
    const request = structuredClone(REQUEST)
    const identity = structuredClone(IDENTITY)
    const policy = structuredClone(POLICY)
    const before = structuredClone({ request, identity, policy })

    const resolution = harness({ identity, policy }).resolver.resolve(request)

    expect({ request, identity, policy }).toEqual(before)
    expect(Object.isFrozen(request)).toBe(false)
    expect(Object.isFrozen(identity)).toBe(false)
    expect(Object.isFrozen(policy)).toBe(false)
    if (resolution.kind !== 'authorized') throw new Error('Expected authorization.')

    Reflect.set(request.actionPolicy, 'actionScope', 'caller:mutated')
    Reflect.set(identity.issuer, 'identity', 'identity-provider:mutated')
    Reflect.set(policy.policy, 'version', 'mutated')
    Reflect.set(policy.roleAssignments[0]!, 'roleRef', 'role:mutated')
    Reflect.set(policy.grants[0]!, 'actionScope', 'policy:mutated')

    expect(resolution.authoritySnapshot).toEqual({
      issuer: IDENTITY.issuer,
      subjectId: IDENTITY.subjectId,
      audience: IDENTITY.audience,
      sessionId: IDENTITY.sessionId,
      organizationId: IDENTITY.organizationId,
      roleRef: REQUEST.requiredRoleRef,
      operation: REQUEST.operation,
      actionPolicy: REQUEST.actionPolicy,
      policy: POLICY.policy,
      authenticatedAt: IDENTITY.authenticatedAt,
      identityExpiresAt: IDENTITY.expiresAt,
      policyValidFrom: POLICY.validFrom,
      policyExpiresAt: POLICY.expiresAt,
      evaluatedAt: NOW,
    })
  })

  it('keeps all five effect classes independent from requiresDecision', () => {
    const effectClasses = [
      'local-read',
      'local-write',
      'external-read',
      'external-write',
      'privileged',
    ] as const

    for (const effectClass of effectClasses) {
      for (const requiresDecision of [false, true] as const) {
        const actionPolicy = {
          actionScope: `scope:${effectClass}:${String(requiresDecision)}`,
          effectClass,
          requiresDecision,
        }
        const policy: OrganizationPolicySnapshot = {
          ...POLICY,
          grants: [{
            ...POLICY.grants[0]!,
            actionScope: actionPolicy.actionScope,
            effectClass,
            requiresDecision,
          }],
        }
        const resolution = harness({ policy }).resolver.resolve({
          ...REQUEST,
          actionPolicy,
        })

        expect(resolution.kind).toBe('authorized')
        if (resolution.kind !== 'authorized') throw new Error('Expected authorization.')
        expect(resolution.authoritySnapshot.actionPolicy).toEqual(actionPolicy)
      }
    }
  })

  it('does not accept actor or subject identity from the caller', () => {
    const { resolver, identityRequests, policyRequests } = harness()

    expectDenied(resolver.resolve({
      ...REQUEST,
      actor: { kind: 'human', roleRef: 'role:catalog-owner' },
    }), 'invalid-request')
    expectDenied(resolver.resolve({
      ...REQUEST,
      subjectId: IDENTITY.subjectId,
    }), 'invalid-request')
    expectDenied(resolver.resolve({
      ...REQUEST,
      actorId: IDENTITY.subjectId,
    }), 'invalid-request')
    expectDenied(resolver.resolve({
      ...REQUEST,
      organizationId: IDENTITY.organizationId,
    }), 'invalid-request')
    expect(identityRequests).toEqual([])
    expect(policyRequests).toEqual([])
  })

  it('rejects identity audience, session and validity mismatches before consulting policy', () => {
    const audience = harness({ identity: { ...IDENTITY, audience: 'another-app' } })
    expectDenied(audience.resolver.resolve(REQUEST), 'identity-audience-mismatch')
    expect(audience.policyRequests).toEqual([])

    const session = harness({ identity: { ...IDENTITY, sessionId: 'session:other' } })
    expectDenied(session.resolver.resolve(REQUEST), 'identity-session-mismatch')
    expect(session.policyRequests).toEqual([])

    expectDenied(harness({
      identity: { ...IDENTITY, authenticatedAt: '2026-09-28T12:00:01Z' },
    }).resolver.resolve(REQUEST), 'identity-not-active')
    expectDenied(harness({
      identity: { ...IDENTITY, expiresAt: NOW },
    }).resolver.resolve(REQUEST), 'identity-not-active')
  })

  it('takes organization identity only from the identity assertion and binds policy to it', () => {
    const identity = { ...IDENTITY, organizationId: 'organization:other' }
    const policy = { ...POLICY, organizationId: 'organization:other' }
    const { resolver, policyRequests } = harness({ identity, policy })

    expect(resolver.resolve(REQUEST).kind).toBe('authorized')
    expect(policyRequests[0]?.organizationId).toBe('organization:other')
  })

  it('denies every policy dimension independently and exactly', () => {
    const cases: readonly [OrganizationPolicySnapshot, IdentityPolicyDenialCode][] = [
      [{ ...POLICY, organizationId: 'organization:other' }, 'policy-organization-mismatch'],
      [{ ...POLICY, roleAssignments: [{ ...POLICY.roleAssignments[0]!, subjectId: 'subject:other' }] }, 'policy-subject-denied'],
      [{ ...POLICY, roleAssignments: [{ ...POLICY.roleAssignments[0]!, roleRef: 'role:viewer' }] }, 'policy-role-not-held'],
      [{ ...POLICY, grants: [{ ...POLICY.grants[0]!, operation: 'business-matter.record-receipt' }] }, 'policy-operation-denied'],
      [{ ...POLICY, grants: [{ ...POLICY.grants[0]!, actionScope: 'catalog.prepare' }] }, 'policy-action-scope-denied'],
      [{ ...POLICY, grants: [{ ...POLICY.grants[0]!, actionScope: 'CATALOG.PREPARE-DRAFT' }] }, 'policy-action-scope-denied'],
      [{ ...POLICY, grants: [{ ...POLICY.grants[0]!, actionScope: 'catalog.prepare-draft.extra' }] }, 'policy-action-scope-denied'],
      [{ ...POLICY, grants: [{ ...POLICY.grants[0]!, effectClass: 'external-write' }] }, 'policy-effect-class-denied'],
      [{ ...POLICY, grants: [{ ...POLICY.grants[0]!, requiresDecision: true }] }, 'policy-decision-requirement-denied'],
    ]

    for (const [policy, code] of cases) {
      expectDenied(harness({ policy }).resolver.resolve(REQUEST), code)
    }
  })

  it('requires both the identity assertion and organization policy to be active at the trusted clock instant', () => {
    expectDenied(harness({
      policy: { ...POLICY, validFrom: '2026-09-28T12:00:01Z' },
    }).resolver.resolve(REQUEST), 'policy-not-active')
    expectDenied(harness({
      policy: { ...POLICY, expiresAt: NOW },
    }).resolver.resolve(REQUEST), 'policy-not-active')
    expectDenied(harness({ now: '2026-02-31T00:00:00Z' }).resolver.resolve(REQUEST), 'clock-unavailable')
  })

  it('requires complete identity/version/digest issuer and policy provenance', () => {
    for (const key of ['identity', 'version', 'digest'] as const) {
      expectDenied(harness({
        identity: {
          ...IDENTITY,
          issuer: { ...IDENTITY.issuer, [key]: '' },
        },
      }).resolver.resolve(REQUEST), 'identity-assertion-invalid')

      expectDenied(harness({
        policy: {
          ...POLICY,
          policy: { ...POLICY.policy, [key]: '' },
        },
      }).resolver.resolve(REQUEST), 'policy-snapshot-invalid')
    }
  })

  it('rejects duplicate or conflicting role assignments and action grants', () => {
    expectDenied(harness({
      policy: {
        ...POLICY,
        roleAssignments: [
          POLICY.roleAssignments[0]!,
          { ...POLICY.roleAssignments[0]! },
        ],
      },
    }).resolver.resolve(REQUEST), 'policy-snapshot-invalid')

    expectDenied(harness({
      policy: {
        ...POLICY,
        grants: [POLICY.grants[0]!, { ...POLICY.grants[0]! }],
      },
    }).resolver.resolve(REQUEST), 'policy-snapshot-invalid')

    expectDenied(harness({
      policy: {
        ...POLICY,
        grants: [
          POLICY.grants[0]!,
          { ...POLICY.grants[0]!, effectClass: 'external-write' },
        ],
      },
    }).resolver.resolve(REQUEST), 'policy-snapshot-invalid')

    expectDenied(harness({
      policy: {
        ...POLICY,
        grants: [
          POLICY.grants[0]!,
          { ...POLICY.grants[0]!, requiresDecision: true },
        ],
      },
    }).resolver.resolve(REQUEST), 'policy-snapshot-invalid')
  })

  it('fails closed on malformed, unknown, accessor and Proxy request input without calling providers', () => {
    let nestedProxyGets = 0
    const candidates: unknown[] = [
      null,
      [],
      { ...REQUEST, unexpected: true },
      { ...REQUEST, [Symbol('unexpected')]: true },
      { ...REQUEST, actionPolicy: { ...REQUEST.actionPolicy, unexpected: true } },
      { ...REQUEST, actionPolicy: { ...REQUEST.actionPolicy, effectClass: 'network-write' } },
      {
        ...REQUEST,
        actionPolicy: new Proxy(REQUEST.actionPolicy, {
          get(target, property, receiver) {
            nestedProxyGets += 1
            return Reflect.get(target, property, receiver)
          },
        }),
      },
    ]
    const hidden = { ...REQUEST }
    Object.defineProperty(hidden, 'hidden', { value: true, enumerable: false })
    candidates.push(hidden)

    let getterCalls = 0
    const accessor = { ...REQUEST }
    Object.defineProperty(accessor, 'organizationId', {
      enumerable: true,
      get(): never {
        getterCalls += 1
        throw new Error('untrusted getter executed')
      },
    })
    candidates.push(accessor)

    let proxyGets = 0
    candidates.push(new Proxy(REQUEST, {
      get(target, property, receiver) {
        proxyGets += 1
        return Reflect.get(target, property, receiver)
      },
    }))
    const revoked = Proxy.revocable(REQUEST, {})
    revoked.revoke()
    candidates.push(revoked.proxy)

    const { resolver, identityRequests, policyRequests } = harness()
    for (const candidate of candidates) {
      expectDenied(resolver.resolve(candidate), 'invalid-request')
    }
    expect(getterCalls).toBe(0)
    expect(proxyGets).toBe(0)
    expect(nestedProxyGets).toBe(0)
    expect(identityRequests).toEqual([])
    expect(policyRequests).toEqual([])
  })

  it('fails closed on malformed or hostile provider output without invoking accessors', () => {
    expectDenied(
      harness({ identity: { ...IDENTITY, unexpected: true } }).resolver.resolve(REQUEST),
      'identity-assertion-invalid',
    )
    expectDenied(
      harness({
        identity: { ...IDENTITY, authenticatedAt: '2026-02-31T00:00:00Z' },
      }).resolver.resolve(REQUEST),
      'identity-assertion-invalid',
    )

    let identityGetterCalls = 0
    const identityAccessor = { ...IDENTITY }
    Object.defineProperty(identityAccessor, 'subjectId', {
      enumerable: true,
      get(): never {
        identityGetterCalls += 1
        throw new Error('identity getter executed')
      },
    })
    expectDenied(
      harness({ identity: identityAccessor }).resolver.resolve(REQUEST),
      'identity-assertion-invalid',
    )
    expect(identityGetterCalls).toBe(0)

    const identityProxy = Proxy.revocable(IDENTITY, {})
    identityProxy.revoke()
    expectDenied(
      harness({ identity: identityProxy.proxy }).resolver.resolve(REQUEST),
      'identity-assertion-invalid',
    )

    expectDenied(
      harness({ policy: { ...POLICY, unexpected: true } }).resolver.resolve(REQUEST),
      'policy-snapshot-invalid',
    )
    expectDenied(
      harness({
        policy: {
          ...POLICY,
          grants: [{ ...POLICY.grants[0]!, unexpected: true }],
        },
      }).resolver.resolve(REQUEST),
      'policy-snapshot-invalid',
    )

    let assignmentProxyGets = 0
    const assignmentProxy = new Proxy([...POLICY.roleAssignments], {
      get(target, property, receiver) {
        assignmentProxyGets += 1
        return Reflect.get(target, property, receiver)
      },
    })
    expectDenied(
      harness({
        policy: { ...POLICY, roleAssignments: assignmentProxy },
      }).resolver.resolve(REQUEST),
      'policy-snapshot-invalid',
    )
    expect(assignmentProxyGets).toBe(0)

    let policyGetterCalls = 0
    const policyAccessor = { ...POLICY }
    Object.defineProperty(policyAccessor, 'grants', {
      enumerable: true,
      get(): never {
        policyGetterCalls += 1
        throw new Error('policy getter executed')
      },
    })
    expectDenied(
      harness({ policy: policyAccessor }).resolver.resolve(REQUEST),
      'policy-snapshot-invalid',
    )
    expect(policyGetterCalls).toBe(0)

    const policyProxy = Proxy.revocable(POLICY, {})
    policyProxy.revoke()
    expectDenied(
      harness({ policy: policyProxy.proxy }).resolver.resolve(REQUEST),
      'policy-snapshot-invalid',
    )
  })

  it('maps provider and clock failures to stable denials without leaking thrown messages', () => {
    const identity = harness({
      identityFailure: new Error('secret identity backend detail'),
    }).resolver.resolve(REQUEST)
    expectDenied(identity, 'identity-provider-unavailable')
    expect(JSON.stringify(identity)).not.toContain('secret identity backend detail')

    const policy = harness({
      policyFailure: new Error('secret policy backend detail'),
    }).resolver.resolve(REQUEST)
    expectDenied(policy, 'policy-provider-unavailable')
    expect(JSON.stringify(policy)).not.toContain('secret policy backend detail')

    const clock = harness({
      clockFailure: new Error('secret clock detail'),
    }).resolver.resolve(REQUEST)
    expectDenied(clock, 'clock-unavailable')
    expect(JSON.stringify(clock)).not.toContain('secret clock detail')
  })
})
