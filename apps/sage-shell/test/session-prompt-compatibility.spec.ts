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
const MATRIX_ID = 'urn:sage:compatibility-matrix:sha256:304c124f0d1de11b1cdcb6431e6cadddc4d7a23588e87f0e65be25868a1158bf'
const BUNDLE_ID = 'urn:sage:compatibility-matrix-bundle:sha256:b2967eb3cf86585beebb77c932590876bc9b7acf1b9dea46b9f296c9079c041e'
const REVOCATION_SOURCE_ID = 'urn:sage:compatibility-matrix-revocation-source:sha256:9837c233d165e19c205a31c80962917102b16768475ecef3e03bd5806ae2d5a1'
const TARGET_SEMANTIC_DIGEST = 'urn:sage:target-semantic:sha256:a9a0feb0d94e9937b02145dae15cb4ba2107476039a55d48b35827d7a6488319'

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
  const entry = bundle.snapshot.entries[0]
  if (entry === undefined) throw new Error('shipped requirement bundle has no entries')
  return entry
}

/** A test-local matrix publication sealing the REAL pair but with a window covering the observed
 *  evidence instant — the shipped publication window starts 2026-10-11 by owner decision. */
function testPublication(outcome: 'equivalent' | 'requires-new-revision' = 'equivalent') {
  const matrix: CompatibilityMatrixV2 = {
    schemaVersion: 'sage.compatibility-matrix.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    semanticVersion: '2.0.0',
    targetContractVersion: 'sage.compatibility-target-semantic.v2',
    runtimeContractVersion: 'sage.runtime-descriptor.v2',
    issuer: { identity: 'authority:sage-compatibility', version: '2.0.0', digest: `sha256:${'a'.repeat(64)}` },
    validFrom: '2026-10-10T00:00:00.000Z',
    expiresAt: '2026-10-11T00:00:00.000Z',
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
  intent: { operation, requestId: 'request:fixture', candidate: { kind: 'matter', matterRef: 'matter:active' }, payload: { text: 'fixture' } },
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
      reobs.descriptor.runtimeDescriptorDigest.slice(0, -1) + '0',
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

  it('keeps the shipped publication honest before its owner window: the observed instant is not active', async () => {
    // The shipped matrix window starts 2026-10-11 (owner decision); the real observation is from
    // 2026-10-10, so the kernel answers matrix-not-active and the port collapses to unavailable —
    // exactly the designed pre-window behaviour, mirroring the requirement's own effectiveAt.
    const shipped = loadSessionPromptCompatibilityPublication()
    if (!shipped.ok) throw new Error(shipped.reason)
    const result = await port({ matrixPublication: shipped })(request('session.send'))
    expect(result).toEqual({ state: 'unavailable' })
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
