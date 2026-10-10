/** ADR-0294: the boot observation is served to the chain only while the Host epoch still
 *  matches — a dead or moved epoch answers `undefined` (fail closed), never a stale fact. */
import { describe, expect, it } from 'vitest'

import { isInventoryObservationCurrent } from '../src/main/runtime-inventory-currency.js'
import type { ShellHostRuntimeSnapshot } from '../src/main/host-process.js'

const ACTIVE: ShellHostRuntimeSnapshot = {
  kind: 'active',
  bootId: 'sage-host:fixture',
  runtimeGeneration: 1,
  activeGeneration: 'sage-0-1-0-build-1-arm64',
  manifestSha256: 'a'.repeat(64),
  loaderPhase: 'active',
  hostProtocolVersion: '5.0.0',
  harnessVersion: '0.2.0-rc.2',
}
const EVIDENCE = { bootId: 'sage-host:fixture', runtimeGeneration: 1 }

describe('inventory observation currency (ADR-0294)', () => {
  it('accepts the observation while the same active epoch stands', () => {
    expect(isInventoryObservationCurrent(EVIDENCE, ACTIVE)).toBe(true)
  })

  it('refuses a moved generation or a different boot on an otherwise active snapshot', () => {
    expect(isInventoryObservationCurrent(EVIDENCE, { ...ACTIVE, runtimeGeneration: 2 })).toBe(false)
    expect(isInventoryObservationCurrent(EVIDENCE, { ...ACTIVE, bootId: 'sage-host:other' })).toBe(false)
  })

  it('refuses every non-active snapshot, whatever the ids say', () => {
    for (const reason of ['invalidated', 'stopped', 'not-ready'] as const) {
      expect(isInventoryObservationCurrent(EVIDENCE, {
        kind: 'unavailable',
        bootId: 'sage-host:fixture',
        runtimeGeneration: 1,
        reason,
      })).toBe(false)
    }
  })
})
