/** T05-mid step 6 (ADR-0284): the shipped matrix publication, the semantic rebuild pin, the real
 *  compatibility port and the production wiring of the sixth admission step.
 *
 *  `support/reobs-runtime-inventory.json` is the recorded output of the real re-observation probe
 *  (2026-10-10, generation sage-0-1-0-build-1-arm64, descriptor e1c7a8b4… / evidence d127d8bb…) —
 *  the same bytes ADR-0280 paired the first publication against. No machine paths inside. */
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { createSageAppServiceProviders } from '../src/main/app-service.js'
import {
  SESSION_PROMPT_MATRIX_BUNDLE_REL_PATH,
  SESSION_PROMPT_MATRIX_REVOCATION_REL_PATH,
  loadSessionPromptCompatibilityPublication,
  loadSessionPromptRequirementBundle,
} from '../src/main/publication-bundle.js'
import { computeTargetSemanticFromRequirement } from '../src/main/target-requirement-candidate.js'
import { createSessionPromptCompatibilityPort } from '../src/main/session-prompt-compatibility.js'
import {
  canonicalizeCompatibilityMatrixV2,
  computeCompatibilityMatrixIdV2,
  type CompatibilityMatrixV2,
  type RuntimeDescriptorV2,
  type RuntimeInventoryEvidenceV2,
} from '../src/security/compatibility.js'
import {
  createBundledCompatibilityMatrixProviderV2,
  sealCompatibilityMatrixBundleV2,
  sealCompatibilityMatrixRevocationSourceV2,
} from '../src/security/compatibility-matrix-provider.js'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const MATRIX_ID = 'urn:sage:compatibility-matrix:sha256:418397647867d76ceb262f9b40b855857b32f16cb09796ee6f947c974494699b'
const BUNDLE_ID = 'urn:sage:compatibility-matrix-bundle:sha256:1178d1ad93e13563d86204ea8de70471c1f25c40eb3920ff82c66d8340384899'
const REVOCATION_SOURCE_ID = 'urn:sage:compatibility-matrix-revocation-source:sha256:9837c233d165e19c205a31c80962917102b16768475ecef3e03bd5806ae2d5a1'
const TARGET_SEMANTIC_DIGEST = 'urn:sage:target-semantic:sha256:429a9a34c9629ddf015a6059820a00e2e22d53120c5598159c4eb921be898e55'

const reobs = JSON.parse(readFileSync(new URL('./support/reobs-runtime-inventory.json', import.meta.url), 'utf8')) as {
  kind: string
  descriptor: RuntimeDescriptorV2
  evidence: RuntimeInventoryEvidenceV2
}
const observation = { descriptor: reobs.descriptor, evidence: reobs.evidence }
/** Inside the real evidence window of the v2 re-observation (2026-10-10T14:58:57.454Z). */
const EVALUATED_AT = '2026-10-10T08:26:30.000Z'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

function realEntry() {
  const bundle = loadSessionPromptRequirementBundle()
  if (!bundle.ok) throw new Error(bundle.reason)
  // ADR-0317 stage 2: the snapshot carries four entries; this suite means the session-prompt one.
  const entry = bundle.snapshot.entries.find((candidate) => candidate.requirementId === 'requirement:sage-session-prompt')
  if (entry === undefined) throw new Error('shipped requirement bundle has no session-prompt entry')
  return entry
}

/** A test-local matrix publication sealing the REAL pair but with a window covering the observed
 *  evidence instant — the shipped publication window starts 2026-10-11 by owner decision. */
function testPublication(
  outcome: 'equivalent' | 'requires-new-revision' = 'equivalent',
  // ADR-0326: the default window mirrors the shipped one and always COVERS the recorded
  // evidence instant; the pre-window behaviour is exercised explicitly with a late window.
  window: { readonly validFrom: string, readonly expiresAt: string } = { validFrom: '2026-10-11T00:00:00.000Z', expiresAt: '2027-10-11T00:00:00.000Z' },
) {
  const matrix: CompatibilityMatrixV2 = {
    schemaVersion: 'sage.compatibility-matrix.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    semanticVersion: '2.0.0',
    targetContractVersion: 'sage.compatibility-target-semantic.v2',
    runtimeContractVersion: 'sage.runtime-descriptor.v2',
    issuer: { identity: 'authority:sage-compatibility', version: '2.0.0', digest: `sha256:${'a'.repeat(64)}` },
    validFrom: window.validFrom,
    expiresAt: window.expiresAt,
    rules: [{
      ruleId: 'rule:sage-session-prompt-v1',
      targetSemanticDigest: TARGET_SEMANTIC_DIGEST,
      runtimeDescriptorDigest: reobs.descriptor.runtimeDescriptorDigest,
      outcome,
      reasonCode: 'owner-approved-exact-pair',
      reason: 'test window covering the observed evidence instant',
    }],
  }
  const canonicalMatrix = canonicalizeCompatibilityMatrixV2(matrix)
  const sealed = sealCompatibilityMatrixBundleV2({
    schemaVersion: 'sage.compatibility-matrix-bundle.v2',
    canonicalizationVersion: 'sage.compatibility-matrix-bundle-canonical-json.v2',
    providerProvenanceDigest: `sha256:${'b'.repeat(64)}`,
    artifacts: [{ matrixId: computeCompatibilityMatrixIdV2(canonicalMatrix), canonicalMatrix }],
  })
  if (!sealed.ok) throw new Error(sealed.reason)
  const revocation = sealCompatibilityMatrixRevocationSourceV2({
    schemaVersion: 'sage.compatibility-matrix-revocation-source.v2',
    canonicalizationVersion: 'sage.compatibility-matrix-revocation-canonical-json.v2',
    createdAt: '2026-10-10T00:00:00.000Z',
    sourceProvenanceDigest: `sha256:${'c'.repeat(64)}`,
    entries: [],
  })
  if (!revocation.ok) throw new Error(revocation.reason)
  return {
    ok: true as const,
    provider: createBundledCompatibilityMatrixProviderV2(sealed.value, revocation.value),
    bundleId: sealed.value.bundleId,
    matrixId: sealed.value.artifacts[0]!.matrixId,
    revocationSourceId: revocation.value.sourceId,
    bundle: sealed.value,
    revocationSource: revocation.value,
  }
}

let authority: { policyPath: string; readFileBytes: (path: string) => Buffer }
let policyContainer: string | undefined

beforeAll(async () => {
  const container = await mkdtemp(join(tmpdir(), 'sage-compat-policy-'))
  policyContainer = container
  const policyPath = join(container, 'organization-policy.json')
  await writeFile(policyPath, JSON.stringify({
    schemaVersion: 'sage.organization-policy.v1',
    organizationId: 'organization:sage',
    policy: { identity: 'policy:local', version: '1' },
    validFrom: '2026-10-01T00:00:00Z',
    expiresAt: '2027-10-01T00:00:00Z',
    membership: { mode: 'instance-operator', roleRefs: ['role:owner'] },
    grants: [{
      roleRef: 'role:owner',
      operation: 'session.send',
      actionScope: 'session.prompt',
      effectClass: 'external-write',
      requiresDecision: false,
    }],
  }), 'utf8')
  authority = { policyPath, readFileBytes: (path: string) => readFileSync(path) }
})

afterAll(async () => {
  if (policyContainer !== undefined) await rm(policyContainer, { recursive: true, force: true })
})

function port(options: Partial<Parameters<typeof createSessionPromptCompatibilityPort>[0]> = {}) {
  return createSessionPromptCompatibilityPort({
    authority,
    requirementBundle: loadSessionPromptRequirementBundle(),
    matrixPublication: testPublication(),
    runtimeObservation: () => observation,
    revisionDigest: () => `sha256:${'d'.repeat(64)}`,
    now: () => '2026-10-10T08:26:30.000Z',
    ...options,
  })
}

const request = (operation: string) => ({
  intent: { operation, requestId: 'request-fixture-1', candidate: { kind: 'matter', matterRef: 'matter:active' }, payload: { text: 'fixture' } },
  context: { matterRef: 'matter:active', revisionRef: 'revision:active.1' },
  identityPolicy: { actorScopeRef: 'urn:sage:actor-scope:v1:fixture', decisionRef: 'urn:sage:identity-decision:v1:fixture' },
}) as never

describe('the shipped compatibility matrix publication (ADR-0284)', () => {
  it('loads, kernel-parses and pins the published pair artifact', () => {
    const load = loadSessionPromptCompatibilityPublication()
    expect(load.ok).toBe(true)
    if (!load.ok) throw new Error(load.reason)
    expect(load.matrixId).toBe(MATRIX_ID)
    expect(load.bundleId).toBe(BUNDLE_ID)
    expect(load.revocationSourceId).toBe(REVOCATION_SOURCE_ID)
  })

  it('rejects tampered or missing publication bytes without repairing them', async () => {
    const container = await mkdtemp(join(tmpdir(), 'sage-matrix-tamper-'))
    cleanups.push(() => rm(container, { recursive: true, force: true }))
    await mkdir(join(container, 'publications'), { recursive: true })
    const bundleText = readFileSync(`${APP_ROOT}/${SESSION_PROMPT_MATRIX_BUNDLE_REL_PATH}`, 'utf8')
    const tampered = bundleText.replace(
      reobs.descriptor.runtimeDescriptorDigest,
      reobs.descriptor.runtimeDescriptorDigest.slice(0, -1) + (reobs.descriptor.runtimeDescriptorDigest.endsWith('0') ? '1' : '0'),
    )
    expect(tampered).not.toBe(bundleText)
    await writeFile(join(container, SESSION_PROMPT_MATRIX_BUNDLE_REL_PATH), tampered, 'utf8')
    await writeFile(
      join(container, SESSION_PROMPT_MATRIX_REVOCATION_REL_PATH),
      readFileSync(`${APP_ROOT}/${SESSION_PROMPT_MATRIX_REVOCATION_REL_PATH}`, 'utf8'),
      'utf8',
    )
    const load = loadSessionPromptCompatibilityPublication({ baseDir: container })
    expect(load.ok).toBe(false)
    if (load.ok) throw new Error('expected rejection')
    expect(load.reason).toContain('rejected by the kernel')

    const missing = loadSessionPromptCompatibilityPublication({ baseDir: join(container, 'nowhere') })
    expect(missing.ok).toBe(false)
    if (missing.ok) throw new Error('expected rejection')
    expect(missing.reason).toContain('unreadable')
  })
})

describe('the semantic rebuild agrees with the published pair', () => {
  it('recomputes the exact digest the shipped matrix rule pairs', () => {
    const rebuilt = computeTargetSemanticFromRequirement(realEntry(), reobs.descriptor)
    expect(rebuilt.targetSemanticDigest).toBe(TARGET_SEMANTIC_DIGEST)
  })

  it('carries the seven-key capability face into the rebuilt semantic (ADR-0285)', () => {
    const cloned = structuredClone(realEntry()) as { capabilities: unknown[] }
    const digest = `sha256:${'e'.repeat(64)}`
    cloned.capabilities = [{
      identity: 'capability:sage.fixture',
      version: '1.0.0',
      artifactDigest: digest,
      contractDigest: digest,
      behaviorConfigurationDigest: digest,
      registryDescriptorDigest: digest,
      adapterMappingDigest: digest,
    }]
    const rebuilt = computeTargetSemanticFromRequirement(cloned as never, reobs.descriptor)
    expect(rebuilt.capabilities).toEqual(cloned.capabilities)
  })
})

describe('the real compatibility port', () => {
  it('resolves the published pair to an equivalent evaluation when every input exists', async () => {
    const result = await port()(request('session.send'))
    expect(result.state).toBe('allowed')
    if (result.state !== 'allowed') throw new Error('expected allowed')
    expect(result.value.outcome).toBe('equivalent')
    expect(result.value.evaluationRef).toMatch(/^urn:sage:compatibility-evaluation:v1:[0-9a-f]{64}$/u)
  })

  it('denies a published requires-new-revision rule and fails closed on every missing input', async () => {
    const denied = await port({ matrixPublication: testPublication('requires-new-revision') })(request('session.send'))
    expect(denied).toEqual({ state: 'denied' })

    expect(await port({ runtimeObservation: () => undefined })(request('session.send')))
      .toEqual({ state: 'unavailable' })
    expect(await port({ revisionDigest: () => undefined })(request('session.send')))
      .toEqual({ state: 'unavailable' })
    expect(await port({ matrixPublication: { ok: false, reason: 'probe' } })(request('session.send')))
      .toEqual({ state: 'unavailable' })
    expect(await port({ requirementBundle: { ok: false, reason: 'probe' } })(request('session.send')))
      .toEqual({ state: 'unavailable' })
    expect(await port()(request('session.stop')))
      .toEqual({ state: 'unavailable' })
  })

  it('keeps the shipped publication honest about its owner window (ADR-0326 re-anchored)', async () => {
    // The refreshed re-observation sits INSIDE the shipped window (validFrom 2026-10-11), so the
    // shipped publication must answer with the real evaluation — and a matrix whose window opens
    // after the observed instant must stay unavailable (the kernel's window check, not a pin).
    const shipped = loadSessionPromptCompatibilityPublication()
    if (!shipped.ok) throw new Error(shipped.reason)
    const inside = await port({ matrixPublication: shipped })(request('session.send'))
    expect(inside.state).toBe('allowed')

    const lateWindow = testPublication('equivalent', { validFrom: '2099-01-01T00:00:00.000Z', expiresAt: '2099-12-31T00:00:00.000Z' })
    const before = await port({ matrixPublication: lateWindow })(request('session.send'))
    expect(before).toEqual({ state: 'unavailable' })
  })
})

describe('the production assembly wires the compatibility step on its own switches', () => {
  it('constructs the port only when every main-owned input is provided', () => {
    const probe = () => {
      let constructed = false
      const publication = Object.defineProperty({ reason: 'probe' }, 'ok', {
        get() {
          constructed = true
          return false
        },
      })
      return { publication, constructed: () => constructed }
    }
    const base = {
      viewState: null,
      vault: { status: () => 'signed-out', snapshot: () => ({ status: 'signed-out', displayName: null }), signOut: () => undefined, identitySession: () => null },
      adapter: { startLogin: async () => ({ ok: false as const, code: 'probe' }) },
      callerBinding: { correlation: 'caller:probe' },
    } as never

    const full = probe()
    createSageAppServiceProviders({
      ...(base as object),
      authority: { policyPath: '/unused', readFileBytes: () => Buffer.alloc(0), now: () => EVALUATED_AT },
      requirementBundle: { ok: false, reason: 'probe' },
      compatibilityPublication: full.publication as never,
      runtimeInventoryObservation: () => undefined,
      revisionDigest: () => undefined,
    } as never)
    expect(full.constructed()).toBe(true)

    const missingDigest = probe()
    createSageAppServiceProviders({
      ...(base as object),
      authority: { policyPath: '/unused', readFileBytes: () => Buffer.alloc(0), now: () => EVALUATED_AT },
      requirementBundle: { ok: false, reason: 'probe' },
      compatibilityPublication: missingDigest.publication as never,
      runtimeInventoryObservation: () => undefined,
    } as never)
    expect(missingDigest.constructed()).toBe(false)
  })
})
