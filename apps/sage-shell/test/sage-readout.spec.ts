import { describe, expect, it } from 'vitest'

import { classifyDiagnostics, classifyPlugins, classifyVisibility, shortenDigest } from '../src/main/sage-readout.js'
import type { RuntimeInventoryResult } from '../src/main/runtime-inventory-provider.js'

/**
 * Ticket 026, the four rear read-only families (US-129~139).
 *
 * The classifier is where "only observed facts" is enforced: an absent fact keeps its own note,
 * installation evidence and the boot observation never merge, and the diagnostics block reads the
 * pin-checked snapshot rather than anything a surface reported.
 */

const component = (identity: string, version: string, digest: string) => ({
  identity,
  version,
  artifactDigest: digest,
  contractDigest: 'c'.repeat(64),
  behaviorConfigurationDigest: 'd'.repeat(64),
})

const availableInventory = {
  kind: 'available',
  descriptor: {
    schemaVersion: 'sage.runtime-descriptor.v2',
    canonicalizationVersion: 'sage.canonical-json.v2',
    host: component('host:sage-shell-host', '5.0.0', 'a'.repeat(64)),
    harness: component('harness:@deepseek-ai/dsh', '0.2.0-rc.2', 'b'.repeat(64)),
    provider: component('provider:deepseek', '1.0.0', 'e'.repeat(64)),
    model: component('model:deepseek-chat', '3.1', 'f'.repeat(64)),
    agent: component('agent:default', '1.0.0', '0'.repeat(64)),
    preset: component('preset:standard', '1.0.0', '1'.repeat(64)),
    capabilities: [],
    protocolContractDigest: '2'.repeat(64),
    launchPolicyDigest: '3'.repeat(64),
    overlayPolicyDigest: '4'.repeat(64),
    runtimeDescriptorDigest: '5'.repeat(64),
  },
  evidence: { schemaVersion: 'sage.runtime-inventory-evidence.v2', bootId: 'sage-host:abcdef1234567890', runtimeGeneration: 2 },
} as unknown as RuntimeInventoryResult

describe('visible scope: verified facts only', () => {
  it('reports the policy organization and the matter main owner when both were read', () => {
    const visibility = classifyVisibility({
      policy: { kind: 'loaded', organizationId: 'org-north' },
      matterProjection: { matter: { responsiblePartyRoleRef: 'role:owner' } },
    })
    expect(visibility).toEqual({
      organizationRef: 'org-north',
      organizationNote: 'read',
      responsiblePartyRoleRef: 'role:owner',
      matterNote: 'read',
    })
  })

  it('marks each absence with its own note instead of inventing a scope', () => {
    const visibility = classifyVisibility({ policy: { kind: 'invalid' }, matterProjection: undefined })
    expect(visibility).toEqual({
      organizationRef: null,
      organizationNote: 'policy-unreadable',
      responsiblePartyRoleRef: null,
      matterNote: 'projection-absent',
    })
  })
})

describe('plugins: installation evidence and one boot observation stay apart', () => {
  it('lists the installed components with digest prefixes and the active observation', () => {
    const plugins = classifyPlugins(availableInventory, { kind: 'active', bootId: 'sage-host:abcdef1234567890', runtimeGeneration: 2, loaderPhase: 'active' })
    expect(plugins.state).toBe('read')
    expect(plugins.components).toHaveLength(6)
    expect(plugins.components[0]).toEqual({ identity: 'host:sage-shell-host', version: '5.0.0', artifactDigestShort: 'aaaaaaaaaaaa…' })
    expect(plugins.components.map((row) => row.identity)).toEqual([
      'host:sage-shell-host',
      'harness:@deepseek-ai/dsh',
      'provider:deepseek',
      'model:deepseek-chat',
      'agent:default',
      'preset:standard',
    ])
    expect(plugins.observation).toEqual({ loaderPhase: 'active', runtimeGeneration: 2, bootIdShort: 'sage-host:ab…' })
    // No availability conclusion can ride along: the projection has no such field.
    expect(JSON.stringify(plugins)).not.toMatch(/available|compatible|mounted|可用|兼容/u)
  })

  it('lists nothing when the observed epoch is gone or has moved (ADR-0295)', () => {
    const gone = classifyPlugins(availableInventory as never, { kind: 'unavailable' })
    expect(gone.state).toBe('unavailable')
    expect(gone.code).toBe('host-epoch-unavailable')
    expect(gone.components).toEqual([])

    const moved = classifyPlugins(availableInventory as never, {
      kind: 'active', bootId: 'sage-host:abcdef1234567890', runtimeGeneration: 3, loaderPhase: 'active',
    })
    expect(moved.state).toBe('unavailable')
    expect(moved.code).toBe('inventory-epoch-stale')
    expect(moved.components).toEqual([])
  })

  it('keeps an unread or unavailable inventory as unavailable with its code, and never as disabled', () => {
    const notRead = classifyPlugins(undefined, { kind: 'unavailable' })
    expect(notRead).toEqual({
      state: 'unavailable',
      code: 'inventory-not-read',
      components: [],
      observation: { loaderPhase: null, runtimeGeneration: null, bootIdShort: null },
    })
    const failed = classifyPlugins({ kind: 'unavailable', code: 'pmap-incomplete', reason: 'x' } as RuntimeInventoryResult, {
      kind: 'active', bootId: 'sage-host:abcdef', runtimeGeneration: 1, loaderPhase: 'active',
    })
    expect(failed.state).toBe('unavailable')
    expect(failed.code).toBe('pmap-incomplete')
    expect(failed.components).toEqual([])
    expect(JSON.stringify(failed)).not.toMatch(/disabled|stopped|已停用/u)
    // Even with no inventory, the boot observation is still reported as an observation.
    expect(failed.observation.loaderPhase).toBe('active')
  })
})

describe('diagnostics: version identity from the pin-checked snapshot', () => {
  it('reads the active snapshot, shortens digests, and carries the last command error', () => {
    const diagnostics = classifyDiagnostics({
      snapshot: {
        kind: 'active',
        harnessVersion: '0.2.0-rc.2',
        hostProtocolVersion: '5',
        activeGeneration: 'sage-dev',
        manifestSha256: 'f'.repeat(64),
        bootId: 'sage-host:x',
        runtimeGeneration: 1,
      },
      dataRoot: '/Users/someone/Library/Application Support/Sage',
      lastCommand: { code: 'policy-denied', correlation: 'c-9' },
    })
    expect(diagnostics).toEqual({
      harnessVersion: '0.2.0-rc.2',
      protocolVersion: '5',
      profileGeneration: 'sage-dev',
      manifestSha256Short: 'ffffffffffff…',
      manifestVerified: true,
      dataRoot: '/Users/someone/Library/Application Support/Sage',
      lastError: { code: 'policy-denied', correlation: 'c-9' },
    })
  })

  it('claims no version identity when there is no accepted boot, and no error when none ran', () => {
    const diagnostics = classifyDiagnostics({
      snapshot: { kind: 'unavailable' },
      dataRoot: '/sage-data',
      lastCommand: { code: null, correlation: 'c-1' },
    })
    expect(diagnostics.manifestVerified).toBe(false)
    expect(diagnostics.harnessVersion).toBeNull()
    expect(diagnostics.protocolVersion).toBeNull()
    expect(diagnostics.profileGeneration).toBeNull()
    expect(diagnostics.manifestSha256Short).toBeNull()
    expect(diagnostics.lastError).toBeNull()
    expect(diagnostics.dataRoot).toBe('/sage-data')
  })

  it('shortens only what needs shortening', () => {
    expect(shortenDigest('short')).toBe('short')
    expect(shortenDigest('a'.repeat(13))).toBe('aaaaaaaaaaaa…')
  })
})
