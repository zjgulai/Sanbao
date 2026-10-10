/** T05-mid step 7 (ADR-0286): the registry admission step over the shipped first-party
 *  publication — generation binding, declared agreement, approval state, and the adjudicated
 *  failure taxonomy (disabled / revoked are the only denial states).
 *
 *  `support/reobs-runtime-inventory.json` is the recorded output of the real re-observation probe
 *  (2026-10-10) that observed the shipped registry snapshot f2df5963…; the shipped requirement
 *  bundle is loaded through the production loader. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { createSageAppServiceProviders } from '../src/main/app-service.js'
import { createActiveMatterContext } from '../src/main/active-matter-context.js'
import { createSessionPromptRegistryPort } from '../src/main/session-prompt-registry.js'
import {
  capabilityAdapterMappingDigest,
  capabilityRegistryDescriptorDigest,
  contentDigestOf,
} from '../src/main/capability-entry-derivation.js'
import { loadSessionPromptCapabilityRegistry, loadSessionPromptRequirementBundle } from '../src/main/publication-bundle.js'
import {
  sealCapabilityRegistrySnapshot,
  type CapabilityRegistryEntryBodyV1,
} from '../src/security/capability-registry.js'
import type {
  RuntimeDescriptorV2,
  RuntimeInventoryEvidenceV2,
} from '../src/security/compatibility.js'

const SNAPSHOT_ID = 'urn:sage:capability-registry:sha256:f2df5963780c0868769343cf94147a02e49527e83f8ef49e32a277830aacb411'
const MAPPING_DIGEST = 'sha256:0b6e398d0a88bf9a82dcfd00c2753cee99b5fd5e6dca64b950f917add7087c25'

const reobs = JSON.parse(readFileSync(new URL('./support/reobs-runtime-inventory.json', import.meta.url), 'utf8')) as {
  kind: string
  descriptor: RuntimeDescriptorV2
  evidence: RuntimeInventoryEvidenceV2
}
const observation = { descriptor: reobs.descriptor, evidence: reobs.evidence }

function shippedRegistryBody() {
  const load = loadSessionPromptCapabilityRegistry()
  if (!load.ok) throw new Error(load.reason)
  expect(load.snapshotId).toBe(SNAPSHOT_ID)
  return load.snapshotBody
}

function shippedEntry(): CapabilityRegistryEntryBodyV1 {
  const entry = shippedRegistryBody().entries[0]
  if (entry === undefined) throw new Error('shipped registry has no entries')
  return entry as CapabilityRegistryEntryBodyV1
}

/** A provider over one variant snapshot; the observation is re-bound to its generation so the
 *  state under test is reached with binding (1) satisfied. */
function variantProvider(mutate: (entry: CapabilityRegistryEntryBodyV1) => CapabilityRegistryEntryBodyV1) {
  const body = shippedRegistryBody()
  const sealed = sealCapabilityRegistrySnapshot({
    ...body,
    entries: body.entries.map((entry) => mutate(entry as CapabilityRegistryEntryBodyV1)),
  })
  if (!sealed.ok) throw new Error(sealed.reason)
  const snapshot = sealed.value
  return {
    provider: { read: () => snapshot },
    observation: {
      descriptor: reobs.descriptor,
      evidence: { ...reobs.evidence, registrySnapshotDigest: contentDigestOf(snapshot.snapshotId) },
    },
  }
}

function realBundle() {
  const load = loadSessionPromptRequirementBundle()
  if (!load.ok) throw new Error(load.reason)
  return load
}

function port(options: {
  readonly requirementBundle?: ReturnType<typeof realBundle> | { ok: false, reason: string }
  readonly provider?: { read: () => unknown }
  readonly observation?: typeof observation | undefined
}) {
  return createSessionPromptRegistryPort({
    requirementBundle: (options.requirementBundle ?? realBundle()) as never,
    registryProvider: options.provider ?? { read: () => shippedRegistrySnapshot() },
    runtimeObservation: () => ('observation' in options ? options.observation : observation),
  })
}

function shippedRegistrySnapshot(): unknown {
  const body = shippedRegistryBody()
  const sealed = sealCapabilityRegistrySnapshot(body)
  if (!sealed.ok) throw new Error(sealed.reason)
  return sealed.value
}

const request = (operation: string) => ({ intent: { operation } }) as never

describe('the derivation forma is single-sourced across consumers', () => {
  it('re-derives the descriptor-pinned and requirement-declared digests from the shipped entry', () => {
    const entry = shippedEntry()
    const descriptorCapability = reobs.descriptor.capabilities?.[0]
    expect(descriptorCapability?.registryDescriptorDigest).toBe(capabilityRegistryDescriptorDigest(entry))
    expect(descriptorCapability?.adapterMappingDigest).toBe(capabilityAdapterMappingDigest(entry))
    const declared = realBundle().snapshot.entries[0]?.capabilities[0]
    expect(declared?.registryDescriptorDigest).toBe(capabilityRegistryDescriptorDigest(entry))
    expect(declared?.adapterMappingDigest).toBe(capabilityAdapterMappingDigest(entry))
    expect(declared?.adapterMappingDigest).toBe(MAPPING_DIGEST)
  })
})

describe('the real registry port', () => {
  it('resolves the shipped approved entry and binds the mapping to the sealed snapshot', async () => {
    expect(await port({})(request('session.send'))).toEqual({
      state: 'allowed',
      value: { mappingRef: `mapping:${SNAPSHOT_ID}:${MAPPING_DIGEST}` },
    })
  })

  it('answers unavailable when the admitted chain observed another snapshot generation', async () => {
    const flip = reobs.evidence.registrySnapshotDigest.slice(0, 8)
      + (reobs.evidence.registrySnapshotDigest[8] === '0' ? '1' : '0')
      + reobs.evidence.registrySnapshotDigest.slice(9)
    const drifted = { descriptor: reobs.descriptor, evidence: { ...reobs.evidence, registrySnapshotDigest: flip } }
    expect(await port({ observation: drifted })(request('session.send'))).toEqual({ state: 'unavailable' })
  })

  it('denies disabled and revoked entries and never provisions candidate ones', async () => {
    for (const state of ['disabled', 'revoked'] as const) {
      const { provider, observation: rebound } = variantProvider((entry) => ({ ...entry, state }))
      expect(await port({ provider, observation: rebound })(request('session.send'))).toEqual({ state: 'denied' })
    }
    const { provider, observation: rebound } = variantProvider((entry) => ({ ...entry, state: 'candidate' }))
    expect(await port({ provider, observation: rebound })(request('session.send'))).toEqual({ state: 'unavailable' })
  })

  it('refuses ambiguity, absent mappings and an entry outside its effectiveness window', async () => {
    const entry = shippedEntry()
    const clone = { ...entry, capabilityId: 'capability:sage.session-prompt-shadow' }
    const sealed = sealCapabilityRegistrySnapshot({
      ...shippedRegistryBody(),
      entries: [entry, clone],
    })
    if (!sealed.ok) throw new Error(sealed.reason)
    const twoClaimants = {
      provider: { read: () => sealed.value },
      observation: {
        descriptor: reobs.descriptor,
        evidence: { ...reobs.evidence, registrySnapshotDigest: contentDigestOf(sealed.value.snapshotId) },
      },
    }
    expect(await port(twoClaimants)(request('session.send'))).toEqual({ state: 'unavailable' })
    expect(await port({})(request('session.stop'))).toEqual({ state: 'unavailable' })

    const late = variantProvider((entry) => ({ ...entry, effectiveAt: '2026-10-11T00:00:00Z' }))
    expect(await port({ provider: late.provider, observation: late.observation })(request('session.send')))
      .toEqual({ state: 'unavailable' })
  })

  it('refuses when the requirement declaration disagrees with the snapshot entry', async () => {
    const bundle = realBundle()
    const entry = bundle.snapshot.entries[0]!
    const capability = entry.capabilities[0]!
    const flip = (digest: string) => digest.slice(0, 8) + (digest[8] === '0' ? '1' : '0') + digest.slice(9)
    const tampered = {
      ok: true as const,
      snapshotId: bundle.snapshotId,
      snapshot: {
        ...bundle.snapshot,
        entries: [{ ...entry, capabilities: [{ ...capability, adapterMappingDigest: flip(capability.adapterMappingDigest) }] }],
      },
    }
    expect(await port({ requirementBundle: tampered as never })(request('session.send'))).toEqual({ state: 'unavailable' })

    const noDeclarer = {
      ok: true as const,
      snapshotId: bundle.snapshotId,
      snapshot: { ...bundle.snapshot, entries: [{ ...entry, actionRequirements: [] }] },
    }
    expect(await port({ requirementBundle: noDeclarer as never })(request('session.send'))).toEqual({ state: 'unavailable' })
  })

  it('fails closed on absent inputs and a throwing provider', async () => {
    expect(await port({ requirementBundle: { ok: false, reason: 'probe' } })(request('session.send')))
      .toEqual({ state: 'unavailable' })
    expect(await port({ observation: undefined })(request('session.send'))).toEqual({ state: 'unavailable' })
    expect(await port({ provider: { read: () => { throw new Error('probe') } } })(request('session.send')))
      .toEqual({ state: 'unavailable' })
    expect(await port({ provider: { read: () => ({ bogus: true }) } })(request('session.send')))
      .toEqual({ state: 'unavailable' })
  })
})

describe('the production assembly wires the registry step on its own switch', () => {
  const vault = {
    status: () => 'signed-out' as const,
    snapshot: () => ({ status: 'signed-out' as const, displayName: null }),
    signOut: () => undefined,
    identitySession: () => ({
      sessionRef: 'session:active',
      identityHandle: 'actor:local',
      issuer: 'https://issuer.invalid',
      authenticatedAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
    }),
  }
  const adapter = { startLogin: async () => ({ ok: false as const, code: 'probe' }) }
  const callerBinding = { correlation: 'caller:session-core' }

  function assembleWith(options: {
    readonly requirementBundle?: unknown
    readonly capabilityRegistry?: { read: () => unknown }
    readonly runtimeInventoryObservation?: () => typeof observation | undefined
  }) {
    let gateRead = false
    const bundleOption = options.requirementBundle === undefined
      ? undefined
      : Object.defineProperty({ reason: 'probe' }, 'ok', {
          get() {
            gateRead = true
            return false
          },
        })
    return {
      constructed: () => gateRead,
      providers: createSageAppServiceProviders({
        viewState: null,
        vault: vault as never,
        adapter: adapter as never,
        callerBinding,
        activeMatterContext: createActiveMatterContext(),
        framePolicySnapshot: () => ({ generation: 7, ready: true, contaminated: false, contaminationReasons: [] }),
        matterRehydrate: (() => ({ matter: {} as never, current: true })) as never,
        matterLinks: () => ({ state: 'read', links: [], trail: [] }),
        workspaceList: async () => ({
          source: 'workspace-follow', state: 'read', reason: null,
          entries: [], order: [], archivedSessions: 0, frames: 0, unapplied: 0,
        }),
        sessionSend: vi.fn(async () => ({ state: 'accepted' as const, sessionId: 's', requestId: 'r', mode: 'queue' as const })),
        ...(bundleOption === undefined ? {} : { requirementBundle: bundleOption as never }),
        ...(options.capabilityRegistry === undefined ? {} : { capabilityRegistry: options.capabilityRegistry }),
        ...(options.runtimeInventoryObservation === undefined ? {} : { runtimeInventoryObservation: options.runtimeInventoryObservation }),
      }),
    }
  }

  it('constructs the registry port only when the bundle, the provider and the observation exist', () => {
    // Only the registry merge can fire here: authority / matrix publication / revision digest are
    // absent, so target and compatibility stay unwired even when the bundle is present.
    const provider = { read: () => shippedRegistrySnapshot() }
    const all = assembleWith({ requirementBundle: true, capabilityRegistry: provider, runtimeInventoryObservation: () => observation })
    expect(all.constructed()).toBe(true)

    expect(assembleWith({ requirementBundle: true, runtimeInventoryObservation: () => observation }).constructed()).toBe(false)
    expect(assembleWith({ requirementBundle: true, capabilityRegistry: provider }).constructed()).toBe(false)
    expect(assembleWith({ capabilityRegistry: provider, runtimeInventoryObservation: () => observation }).constructed()).toBe(false)
    void all.providers
  })
})
