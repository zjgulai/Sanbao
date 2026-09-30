import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  canonicalizeExternalCapabilityAvailability,
  computeExternalCapabilityAvailabilityDigest,
  createExternalCapabilityAvailabilityKernel,
  parseExternalCapabilityAvailability,
  sealExternalCapabilityAvailability,
  verifyExternalCapabilityAvailabilityFreshness,
  type ExternalCapabilityAvailabilityBodyV1,
} from '../src/security/external-capability-availability.js'

const HOST = {
  schemaVersion: 'sage.external-capability-availability-host-binding.v1' as const,
  canonicalizationVersion: 'sage.external-capability-availability-canonical-json.v1' as const,
  projectionDigest: `sha256:${'3'.repeat(64)}`,
  bootId: 'sage-host:11111111-1111-4111-8111-111111111111',
  runtimeGeneration: 3,
  activeGeneration: 'gen-3',
}

const CONNECTION = {
  schemaVersion: 'sage.external-capability-availability-connection-binding.v1' as const,
  canonicalizationVersion: 'sage.external-capability-availability-canonical-json.v1' as const,
  connectionGeneration: 'connection:sage.shopify-read',
  bootId: HOST.bootId,
  runtimeGeneration: HOST.runtimeGeneration,
  activeGeneration: HOST.activeGeneration,
}

function fixtureBody(): ExternalCapabilityAvailabilityBodyV1 {
  return {
    schemaVersion: 'sage.external-capability-availability.v1',
    canonicalizationVersion: 'sage.external-capability-availability-canonical-json.v1',
    capabilityId: 'capability:sage.shopify-orders',
    descriptorDigest: `urn:sage:external-capability-descriptor:sha256:${'1'.repeat(64)}`,
    evidenceDigest: `urn:sage:external-capability-evidence:sha256:${'2'.repeat(64)}`,
    host: HOST,
    connection: CONNECTION,
    transportState: 'connected',
    discoveryState: 'complete',
    contractState: 'valid',
    operationPreflightState: 'not-requested',
    observedAt: '2026-09-29T03:00:00.000Z',
    expiresAt: '2026-09-29T03:00:30.000Z',
  }
}

function expectSuccess<T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: string },
): T {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`Expected success, received ${result.code}.`)
  return result.value
}

function expectFailure(
  result: { readonly ok: true } | { readonly ok: false; readonly code: string },
  code: string,
): void {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`Expected ${code}.`)
  expect(result.code).toBe(code)
}

describe('WT-02C.2C.4 external capability availability and preflight contract', () => {
  it('seals, parses and canonicalizes the four-axis record without mutating it', () => {
    const body = fixtureBody()
    const before = structuredClone(body)
    const sealed = expectSuccess(sealExternalCapabilityAvailability(body))

    expect(body).toEqual(before)
    expect(sealed.availabilityState).toBe('available')
    expect(sealed.actionability).toBe('blocked')
    expect(sealed.availabilityDigest)
      .toMatch(/^urn:sage:external-capability-availability:sha256:[0-9a-f]{64}$/u)
    expect(Object.isFrozen(sealed)).toBe(true)
    expect(Object.isFrozen(sealed.host)).toBe(true)
    expect(parseExternalCapabilityAvailability(sealed)).toEqual({ ok: true, value: sealed })
    expect(computeExternalCapabilityAvailabilityDigest(body)).toBe(sealed.availabilityDigest)
    expect(canonicalizeExternalCapabilityAvailability(body))
      .toContain('sage.external-capability-availability.v1')
  })

  it('keeps transport, discovery, contract and operation preflight orthogonal', () => {
    const body = fixtureBody()
    for (const change of [
      { transportState: 'reconnecting' as const },
      { discoveryState: 'partial' as const },
      { contractState: 'changed' as const },
    ]) {
      const result = expectSuccess(sealExternalCapabilityAvailability({ ...body, ...change }))
      expect(result.availabilityState).toBe('unavailable')
      expect(result.actionability).toBe('blocked')
    }

    const preflight = expectSuccess(sealExternalCapabilityAvailability({
      ...body,
      operationPreflightState: 'port-valid',
      operationId: 'shopify.orders.read',
      preflightPortDigest: `urn:sage:external-capability-preflight-port:sha256:${'4'.repeat(64)}`,
    }))
    expect(preflight.availabilityState).toBe('available')
    expect(preflight.actionability).toBe('blocked')
  })

  it('fails closed on generation drift, unknown fields and hostile records', () => {
    const body = fixtureBody()
    expectFailure(
      sealExternalCapabilityAvailability({
        ...body,
        host: { ...body.host, runtimeGeneration: 4 },
      }),
      'availability-generation-mismatch',
    )
    expectFailure(
      sealExternalCapabilityAvailability({
        ...body,
        connection: { ...body.connection, bootId: 'sage-host:22222222-2222-4222-8222-222222222222' },
      }),
      'availability-generation-mismatch',
    )
    expectFailure(
      sealExternalCapabilityAvailability({ ...body, secret: 'token' } as never),
      'availability-invalid',
    )
    expectFailure(sealExternalCapabilityAvailability(new Proxy(body, {})), 'availability-invalid')
    expectFailure(sealExternalCapabilityAvailability(Object.create(null)), 'availability-invalid')
  })

  it('requires an exact operation preflight shape and keeps candidate ports non-authoritative', () => {
    const body = fixtureBody()
    expectFailure(
      sealExternalCapabilityAvailability({ ...body, operationPreflightState: 'port-valid' } as never),
      'availability-preflight-invalid',
    )
    expectFailure(
      sealExternalCapabilityAvailability({
        ...body,
        operationPreflightState: 'port-valid',
        operationId: 'shopify.orders.read',
        preflightPortDigest: 'sha256:not-a-port-digest',
      } as never),
      'availability-preflight-invalid',
    )
    expectFailure(
      sealExternalCapabilityAvailability({
        ...body,
        operationId: 'shopify.orders.read',
      } as never),
      'availability-preflight-invalid',
    )
    const blocked = expectSuccess(sealExternalCapabilityAvailability({
      ...body,
      operationPreflightState: 'blocked',
      operationId: 'shopify.orders.read',
    }))
    expect(blocked.operationPreflightState).toBe('blocked')
    expect(blocked.actionability).toBe('blocked')
    expectFailure(
      sealExternalCapabilityAvailability({
        ...body,
        operationPreflightState: 'not-requested',
        operationId: 'shopify.orders.read',
      } as never),
      'availability-preflight-invalid',
    )
  })

  it('uses a half-open freshness window and rejects tampering', () => {
    const sealed = expectSuccess(sealExternalCapabilityAvailability(fixtureBody()))
    expect(verifyExternalCapabilityAvailabilityFreshness({
      availability: sealed,
      evaluatedAt: sealed.observedAt,
    }).ok).toBe(true)
    expectFailure(
      verifyExternalCapabilityAvailabilityFreshness({ availability: sealed, evaluatedAt: sealed.expiresAt }),
      'availability-expired',
    )
    expectFailure(
      verifyExternalCapabilityAvailabilityFreshness({
        availability: sealed,
        evaluatedAt: '2026-09-29T02:59:59.999Z',
      }),
      'availability-expired',
    )
    expectFailure(
      parseExternalCapabilityAvailability({
        ...sealed,
        observedAt: '2026-09-29T03:00:01.000Z',
      }),
      'availability-digest-mismatch',
    )
    expectFailure(
      parseExternalCapabilityAvailability({ ...sealed, actionability: 'allowed' } as never),
      'availability-axis-invalid',
    )
  })

  it('exposes a frozen pure kernel and keeps production imports away from I/O and clocks', () => {
    const kernel = createExternalCapabilityAvailabilityKernel()
    expect(Object.isFrozen(kernel)).toBe(true)
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/security/external-capability-availability.ts'),
      'utf8',
    )
    expect(source).not.toMatch(/from ['"]node:(fs|net|child_process|http|https)['"]/u)
    expect(source).not.toMatch(/\b(?:fetch|process|globalThis|new Date\s*\(|Date\.now\s*\()/u)
  })
})
