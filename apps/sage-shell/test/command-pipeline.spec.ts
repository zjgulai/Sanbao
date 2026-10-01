import { describe, expect, it } from 'vitest'
import { runCommand } from '../src/appservice/command-pipeline.js'
import { identityResolutionDenied } from './fixtures/command-fakes.js'
import type { CommandPipelinePorts, SageActionIntentV2 } from '../src/appservice/command-contracts.js'

const intent: SageActionIntentV2 = {
  matterId: 'm1', revisionId: 'r1', actionType: 'retry-capability',
  actionScope: 'revision', payload: {}, origin: 'renderer-action',
}

function recordingPorts(overrides: Partial<CommandPipelinePorts> = {}): CommandPipelinePorts & { calls: string[] } {
  const calls: string[] = []
  // Overrides wrap the recorder so the step is still logged; an explicitly-undefined override
  // makes the port return undefined (provider unavailable, fail-closed), instead of being
  // swallowed by `??` like the brief's original helper did.
  const step = (name: string, key: keyof CommandPipelinePorts, fallback: () => object): never => {
    const override = overrides[key] as (() => object) | undefined
    const unavailable = key in overrides && overrides[key] === undefined
    return (() => {
      calls.push(name)
      if (unavailable) return undefined
      return (override ?? fallback)()
    }) as never
  }
  return {
    calls,
    resolveIdentityPolicy: step('identity', 'resolveIdentityPolicy', () => ({ kind: 'authorized', actor: {}, authoritySnapshot: {} })),
    strictRehydrate: step('rehydrate', 'strictRehydrate', () => ({ matter: {} as never, current: true })),
    resolveTarget: step('target', 'resolveTarget', () => ({ targetRequirement: {} })),
    resolveCompatibility: step('compat', 'resolveCompatibility', () => ({ outcome: 'equivalent' as const })),
    resolveRegistry: step('registry', 'resolveRegistry', () => ({ mapping: {} as never })),
    preflightAvailability: step('preflight', 'preflightAvailability', () => ({ ok: true as const })),
    persistPreparation: step('persist', 'persistPreparation', () => ({ persisted: true as const })),
    dispatchOperation: step('dispatch', 'dispatchOperation', () => ({ receipt: { receiptRef: 'receipt-1' } })),
    now: () => '2026-10-01T00:00:00.000Z',
  }
}

describe('runCommand step mapping', () => {
  it('denies at step 2 with policy-denied when identity policy denies', () => {
    const ports = recordingPorts({ resolveIdentityPolicy: () => identityResolutionDenied('policy-not-active') })
    const result = runCommand({ intent, correlation: 'c1', ports })
    expect(result).toMatchObject({ code: 'policy-denied', stage: 'identity-policy', correlation: 'c1' })
    expect(ports.calls).toEqual(['identity'])
  })
  it('denies at step 3 with stale-revision', () => {
    const ports = recordingPorts({ strictRehydrate: () => ({ denied: 'stale-revision' as const }) })
    expect(runCommand({ intent, correlation: 'c2', ports })).toMatchObject({ code: 'stale-revision', stage: 'rehydrate', requiresNewRevision: true })
    expect(ports.calls).toEqual(['identity', 'rehydrate'])
  })
  it('denies at step 3 not-found without leaking existence', () => {
    const ports = recordingPorts({ strictRehydrate: () => ({ denied: 'not-found' as const }) })
    expect(runCommand({ intent, correlation: 'c3', ports })).toMatchObject({ code: 'policy-denied', stage: 'rehydrate' })
  })
  it('denies at step 4 target-unavailable as compatibility-unknown', () => {
    const ports = recordingPorts({ resolveTarget: () => ({ denied: 'target-unavailable' as const }) })
    expect(runCommand({ intent, correlation: 'c4', ports })).toMatchObject({ code: 'compatibility-unknown', stage: 'target' })
  })
  it('denies at step 6 compatibility unknown', () => {
    const ports = recordingPorts({ resolveCompatibility: () => ({ denied: 'unknown' as const }) })
    expect(runCommand({ intent, correlation: 'c6', ports })).toMatchObject({ code: 'compatibility-unknown', stage: 'compatibility' })
  })
  it('denies at step 6 requires-new-revision', () => {
    const ports = recordingPorts({ resolveCompatibility: () => ({ denied: 'requires-new-revision' as const }) })
    expect(runCommand({ intent, correlation: 'c7', ports })).toMatchObject({ code: 'requires-new-revision', stage: 'compatibility', requiresNewRevision: true })
  })
  it('denies at step 7 registry not-approved', () => {
    const ports = recordingPorts({ resolveRegistry: () => ({ denied: 'not-approved' as const }) })
    expect(runCommand({ intent, correlation: 'c8', ports })).toMatchObject({ code: 'registry-unavailable', stage: 'registry' })
  })
  it('denies at step 8 capability-unavailable', () => {
    const ports = recordingPorts({ preflightAvailability: () => ({ denied: 'capability-unavailable' as const }) })
    expect(runCommand({ intent, correlation: 'c9', ports })).toMatchObject({ code: 'capability-unavailable', stage: 'preflight' })
  })
  it('denies at step 9 persistence-unavailable', () => {
    const ports = recordingPorts({ persistPreparation: () => ({ denied: 'persistence-unavailable' as const }) })
    expect(runCommand({ intent, correlation: 'c10', ports })).toMatchObject({ code: 'persistence-unavailable', stage: 'persist' })
  })
  it('outcome-unknown at step 10', () => {
    const ports = recordingPorts({ dispatchOperation: () => ({ outcome: 'outcome-unknown' as const }) })
    expect(runCommand({ intent, correlation: 'c11', ports })).toMatchObject({ code: 'outcome-unknown', stage: 'dispatch', retryable: false })
  })
  it('cancelled-before-dispatch at step 10', () => {
    const ports = recordingPorts({ dispatchOperation: () => ({ denied: 'cancelled-before-dispatch' as const }) })
    expect(runCommand({ intent, correlation: 'c11b', ports })).toMatchObject({ code: 'cancelled-before-dispatch', stage: 'dispatch' })
  })
  it('accepted returns receiptRef when all ports pass', () => {
    const ports = recordingPorts()
    expect(runCommand({ intent, correlation: 'c12', ports })).toEqual({ correlation: 'c12', receiptRef: 'receipt-1' })
    expect(ports.calls).toEqual(['identity', 'rehydrate', 'target', 'compat', 'registry', 'preflight', 'persist', 'dispatch'])
  })
})

describe('runCommand ordering is not bypassable', () => {
  it('stops at the first denied step; later ports see zero calls', () => {
    const ports = recordingPorts({ resolveCompatibility: () => ({ denied: 'unknown' as const }) })
    runCommand({ intent, correlation: 'c13', ports })
    expect(ports.calls).toEqual(['identity', 'rehydrate', 'target', 'compat'])
  })
  it('retry intent without matterId is invalid-intent before any port call', () => {
    const ports = recordingPorts()
    const result = runCommand({ intent: { type: 'retry' }, correlation: 'c14', ports })
    expect(result).toMatchObject({ code: 'invalid-intent', stage: 'intent' })
    expect(ports.calls).toEqual([])
  })
})

describe('runCommand fail-closed scan', () => {
  const steps: readonly [string, keyof CommandPipelinePorts, string, string][] = [
    ['identity', 'resolveIdentityPolicy', 'identity-unavailable', 'identity-policy'],
    ['rehydrate', 'strictRehydrate', 'identity-unavailable', 'rehydrate'],
    ['target', 'resolveTarget', 'compatibility-unknown', 'target'],
    ['compat', 'resolveCompatibility', 'compatibility-unknown', 'compatibility'],
    ['registry', 'resolveRegistry', 'registry-unavailable', 'registry'],
    ['preflight', 'preflightAvailability', 'capability-unavailable', 'preflight'],
    ['persist', 'persistPreparation', 'persistence-unavailable', 'persist'],
    ['dispatch', 'dispatchOperation', 'registry-unavailable', 'dispatch'],
  ]
  for (const [label, port, code, stage] of steps) {
    it(`undefined at ${label} denies with ${code}`, () => {
      const ports = recordingPorts({ [port]: undefined as never })
      expect(runCommand({ intent, correlation: 'c-' + label, ports })).toMatchObject({ code, stage })
    })
  }
})
