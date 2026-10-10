import { afterEach, describe, expect, it } from 'vitest'

import {
  EMPTY_INTERNAL_REGISTRY_SNAPSHOT_BODY,
  createBundledCapabilityRegistryProvider,
} from '../src/security/capability-registry-provider.js'
import {
  computeCapabilityRegistrySnapshotId,
  parseCapabilityRegistrySnapshot,
} from '../src/security/capability-registry.js'
import {
  cleanupTemporaryRoots,
  composeFixture,
  composeProvider,
} from './support/runtime-inventory-fixture.js'

/**
 * T05 mid-authorities / C2D.2A (ADR-0277): the bundled registry provider supplies the first
 * published snapshot (the internal-stage empty set) and releases the descriptor stage of the
 * runtime-inventory composition. The cases pin the sealed read, the fail-closed path, and the
 * end-to-end release through the real provider module.
 */

afterEach(() => {
  cleanupTemporaryRoots()
})

describe('the bundled capability registry provider (ADR-0277)', () => {
  it('reads the sealed empty internal snapshot, deterministically and frozen', () => {
    const provider = createBundledCapabilityRegistryProvider()

    const first = parseCapabilityRegistrySnapshot(provider.read())
    expect(first.ok, JSON.stringify(first)).toBe(true)
    if (!first.ok) return
    expect(first.value.entries).toEqual([])
    expect(first.value.snapshotId).toBe(computeCapabilityRegistrySnapshotId(EMPTY_INTERNAL_REGISTRY_SNAPSHOT_BODY))

    const second = parseCapabilityRegistrySnapshot(provider.read())
    if (!second.ok) throw new Error('expected the sealed snapshot')
    expect(second.value.snapshotId).toBe(first.value.snapshotId)
    expect(Object.isFrozen(first.value)).toBe(true)
  })

  it('fails closed on an unsealable bundled body without leaking details', () => {
    const hostile = { ...EMPTY_INTERNAL_REGISTRY_SNAPSHOT_BODY, entries: 'not-an-array' } as never
    const provider = createBundledCapabilityRegistryProvider(hostile)

    expect(() => provider.read()).toThrowError(/bundled snapshot invalid/u)
    try {
      provider.read()
    } catch (error) {
      // The message names only the stable code — no path and no payload bytes.
      expect(String((error as Error).message)).not.toContain('/')
    }
  })

  it('releases the runtime descriptor stage when attached to the inventory provider', async () => {
    const fixture = await composeFixture('bundled-registry')
    const bundled = createBundledCapabilityRegistryProvider()
    const provider = composeProvider(fixture, () => bundled.read())

    const result = await provider.read()
    expect(result.kind, result.kind === 'unavailable' ? result.code : '').toBe('available')
    if (result.kind !== 'available') return
    expect(result.descriptor.capabilities).toEqual([])

    const parsed = parseCapabilityRegistrySnapshot(bundled.read())
    if (!parsed.ok) throw new Error('expected the sealed snapshot')
    // The descriptor's full evidence binds exactly this published snapshot: the URN is reshaped
    // to the V2 content-digest form without rehashing.
    const snapshotHex = parsed.value.snapshotId.match(/^urn:sage:capability-registry:sha256:([0-9a-f]{64})$/u)?.[1]
    expect(result.evidence.registrySnapshotDigest).toBe(`sha256:${snapshotHex}`)
  })
})
