import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  capabilityAdapterMappingDigest,
  capabilityOperationsProjection,
  capabilityRegistryDescriptorDigest,
  contentDigestOf,
  sha256ContentDigest,
} from '../src/main/capability-entry-derivation.js'
import {
  loadSessionPromptCapabilityRegistry,
  loadSessionPromptCompatibilityPublication,
  loadSessionPromptRequirementBundle,
} from '../src/main/publication-bundle.js'
import { capabilityFaceOf } from '../src/main/session-controls-publication.js'

/**
 * ADR-0317 stage 2: the shipped session-control publications. These cases pin the governance
 * facts of the landed v2 generation: four requirement scopes, seven registry operations with the
 * ruled effect classes, the declared == derived capability face (one forma, both consumers), and
 * the four matrix rules pairing one runtime descriptor.
 */

const APP_ROOT = join(import.meta.dirname, '..')

describe('the shipped session-control publications (ADR-0317 stage 2)', () => {
  it('carries the four scoped requirement entries with the ruled action policies', () => {
    const load = loadSessionPromptRequirementBundle()
    expect(load.ok).toBe(true)
    if (!load.ok) throw new Error(load.reason)
    const scopes = new Map(load.snapshot.entries.map((entry) => [
      entry.actionRequirements[0]?.actionScope,
      entry.actionRequirements[0],
    ]))
    expect(scopes.get('session.prompt')).toMatchObject({ effectClass: 'external-write', requiresDecision: false })
    // The approval scope takes the conservative requiresDecision (answer IS a decision; the
    // per-operation nuance stays in ACTION_AUTHORITY_TABLE).
    expect(scopes.get('session.approval')).toMatchObject({ effectClass: 'external-write', requiresDecision: true })
    expect(scopes.get('session.pending')).toMatchObject({ effectClass: 'local-write', requiresDecision: false })
    expect(scopes.get('session.queue')).toMatchObject({ effectClass: 'external-write', requiresDecision: false })
    for (const entry of load.snapshot.entries) {
      expect(entry.actionRequirements).toHaveLength(1)
      for (const action of entry.actionRequirements) expect(action.actionScope).toBe(scopes.get(action.actionScope)?.actionScope)
    }
  })

  it('carries the seven registry operations with the ruled mappings and a second approval', () => {
    const load = loadSessionPromptCapabilityRegistry()
    expect(load.ok).toBe(true)
    if (!load.ok) throw new Error(load.reason)
    const entry = load.snapshotBody.entries[0]!
    expect(entry.approvals).toHaveLength(2)
    const byId = new Map(entry.operations.map((operation) => [operation.operationId, operation]))
    expect([...byId.keys()].sort()).toEqual([
      'session.approval.answer', 'session.approval.withdraw',
      'session.pending.edit', 'session.pending.remove',
      'session.queue.edit', 'session.queue.remove',
      'session.send',
    ])
    expect(byId.get('session.approval.answer')).toMatchObject({ effectClass: 'external-write', dataBoundary: 'sage.local-only', preflight: 'read-only', revokeBehavior: 'deny-new-actions' })
    expect(byId.get('session.pending.edit')).toMatchObject({ effectClass: 'local-write', dataBoundary: 'sage.local-only' })
    expect(byId.get('session.queue.remove')).toMatchObject({ effectClass: 'external-write', dataBoundary: 'sage.model-egress' })
    expect(byId.get('session.queue.remove')?.adapter.identity).toBe('adapter:sage.session-queue')
  })

  it('keeps the declared capability face identical to the derived one across all four entries', () => {
    const requirement = loadSessionPromptRequirementBundle()
    const registry = loadSessionPromptCapabilityRegistry()
    if (!requirement.ok || !registry.ok) throw new Error('publications must load')
    const entry = registry.snapshotBody.entries[0]!
    const derived = capabilityFaceOf(entry)
    // The derivation forma itself is pinned (single-sourced for producer and admission):
    expect(derived.registryDescriptorDigest).toBe(capabilityRegistryDescriptorDigest(entry))
    expect(derived.adapterMappingDigest).toBe(capabilityAdapterMappingDigest(entry))
    expect(derived.behaviorConfigurationDigest).toBe(sha256ContentDigest(JSON.stringify({
      launchContractDigest: entry.descriptor.launchContractDigest,
      operations: capabilityOperationsProjection(entry),
    })))
    for (const requirementEntry of requirement.snapshot.entries) {
      const declared = requirementEntry.capabilities.find((capability) => capability.identity === derived.identity)
      expect(declared, requirementEntry.requirementId).toBeDefined()
      expect(declared?.adapterMappingDigest).toBe(derived.adapterMappingDigest)
      expect(declared?.behaviorConfigurationDigest).toBe(derived.behaviorConfigurationDigest)
      expect(declared?.registryDescriptorDigest).toBe(derived.registryDescriptorDigest)
    }
  })

  it('pairs all four matrix rules with the one observed runtime descriptor', () => {
    const load = loadSessionPromptCompatibilityPublication()
    expect(load.ok).toBe(true)
    if (!load.ok) throw new Error(load.reason)
    const canonical = JSON.parse(load.bundle.artifacts[0]!.canonicalMatrix) as {
      rules: readonly { readonly ruleId: string, readonly runtimeDescriptorDigest: string }[]
    }
    expect(canonical.rules).toHaveLength(4)
    const runtimeDigests = new Set(canonical.rules.map((rule) => rule.runtimeDescriptorDigest))
    expect(runtimeDigests.size).toBe(1)
    // The recorded re-observation pairs the same descriptor the next boot must observe.
    const reobs = JSON.parse(readFileSync(join(APP_ROOT, 'test', 'support', 'reobs-runtime-inventory.json'), 'utf8')) as {
      descriptor: { readonly runtimeDescriptorDigest: string }
      evidence: { readonly registrySnapshotDigest: string, readonly inventoryEvidenceDigest: string }
    }
    expect([...runtimeDigests][0]).toBe(reobs.descriptor.runtimeDescriptorDigest)
    const registry = loadSessionPromptCapabilityRegistry()
    if (!registry.ok) throw new Error('registry must load')
    expect(reobs.evidence.registrySnapshotDigest).toBe(contentDigestOf(registry.snapshotId))
    expect(reobs.evidence.inventoryEvidenceDigest.startsWith('urn:sage:inventory-evidence:')).toBe(true)
  })
})
