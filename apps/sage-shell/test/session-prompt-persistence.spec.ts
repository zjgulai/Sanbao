/** T05-mid step 9 (ADR-0288): the persistence step — pre-write re-verification, the domain
 *  attempt event, and the atomic evaluation-evidence append over the Sage-owned store.
 *
 *  The happy path is a REAL end-to-end run: a domain-built matter history (create → revision
 *  entered with the session.prompt policy) is seeded into a temporary sqlite store; the evidence
 *  is built through the real codec from the real re-observation fixture and a test-local matrix
 *  publication; the port then re-verifies, authors the attempt through the domain kernel, and
 *  appends event + evidence in one transaction that is reopened and replayed afterwards. */
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSageAppServiceProviders } from '../src/main/app-service.js'
import { createActiveMatterContext } from '../src/main/active-matter-context.js'
import { createSessionPromptPersistencePort } from '../src/main/session-prompt-persistence.js'
import { createSessionPromptAttemptStore } from '../src/main/session-prompt-attempt-store.js'
import { buildSessionPromptEvaluationEvidence } from '../src/main/session-prompt-evaluation-evidence.js'
import { loadSessionPromptRequirementBundle } from '../src/main/publication-bundle.js'
import {
  createBusinessMatter,
  enterEvidence,
  projectBusinessMatter,
} from '../src/domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../src/domain/business-matter-codec.js'
import {
  openBusinessMatterEventStore,
  type BusinessMatterEventStore,
} from '../src/persistence/business-matter-event-store.js'
import {
  createBundledCompatibilityMatrixProviderV2,
  sealCompatibilityMatrixBundleV2,
  sealCompatibilityMatrixRevocationSourceV2,
} from '../src/security/compatibility-matrix-provider.js'
import {
  canonicalizeCompatibilityMatrixV2,
  computeCompatibilityMatrixIdV2,
  type CompatibilityMatrixV2,
  type RuntimeDescriptorV2,
  type RuntimeInventoryEvidenceV2,
} from '../src/security/compatibility.js'
import { resolveSagePaths } from '../src/profile/paths.js'
import type { RuntimeEffectiveObservation } from '../src/protocol.js'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const MATTER_ID = 'matter:sage.persist-1'
const REVISION_ID = 'revision:sage.persist-1'
const ATTEMPT_ID = 'attempt:sage.persist-fixture-1'
const EVALUATION_ID = 'evaluation:sage.persist-fixture-1'
const RULE_ID = 'rule:sage-session-prompt-v1'
const TARGET_SEMANTIC_DIGEST = 'urn:sage:target-semantic:sha256:a9a0feb0d94e9937b02145dae15cb4ba2107476039a55d48b35827d7a6488319'

const reobs = JSON.parse(readFileSync(join(APP_ROOT, 'test/support/reobs-runtime-inventory.json'), 'utf8')) as {
  kind: string
  descriptor: RuntimeDescriptorV2
  evidence: RuntimeInventoryEvidenceV2
}

const OBSERVED: RuntimeEffectiveObservation = {
  kind: 'observed',
  defaultPresetId: 'preset:sage-default',
  presets: [{ id: 'preset:sage-default', isDefault: true }],
}

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

/** A deterministic 64-hex placeholder for fields whose FORM the codec checks and whose truth
 *  lives in other suites (provenance/intent digests); real values here come from the fixtures. */
function hexPlaceholder(seed: string): string {
  let hash = 0xcbf29ce4
  for (const char of seed) hash = ((hash ^ char.charCodeAt(0)) * 0x01000193) >>> 0
  return hash.toString(16).padStart(8, '0').repeat(8)
}

/** A test-local matrix publication: the REAL stable pair, with a window covering the observed
 *  evidence instant (the shipped publication window starts 2026-10-11 by owner decision). */
function testPublication() {
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
      ruleId: RULE_ID,
      targetSemanticDigest: TARGET_SEMANTIC_DIGEST,
      runtimeDescriptorDigest: reobs.descriptor.runtimeDescriptorDigest,
      outcome: 'equivalent',
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
  const publication = {
    ok: true as const,
    provider: createBundledCompatibilityMatrixProviderV2(sealed.value, revocation.value),
    bundleId: sealed.value.bundleId,
    matrixId: sealed.value.artifacts[0]!.matrixId,
    revocationSourceId: revocation.value.sourceId,
    bundle: sealed.value,
    revocationSource: revocation.value,
  }
  return { publication, revocation: revocation.value }
}

async function temporaryRoot(name: string): Promise<{ root: string, home: string }> {
  const container = await mkdtemp(join(await realpath(tmpdir()), `sage-persist-${name}-`))
  const root = join(container, 'Sage')
  const home = join(container, 'home')
  await mkdir(home, { mode: 0o700 })
  await mkdir(join(root, 'data', 'business-matter'), { mode: 0o700, recursive: true })
  cleanups.push(() => rm(container, { recursive: true, force: true }))
  return { root, home }
}

function openRawStore(root: string, home: string): BusinessMatterEventStore {
  const store = openBusinessMatterEventStore({
    sagePaths: resolveSagePaths({ home, root, platform: process.platform }),
    maxStreamEvents: 32,
    maxPayloadBytes: 64 * 1024,
    busyTimeoutMs: 75,
    clock: () => '2026-10-10T15:00:00.000Z',
  })
  cleanups.push(() => store.close())
  return store
}

/** create → revision entered (the session.prompt policy declared) — the state the chain's
 *  compatibility step already requires (a store-validated revision digest). */
function matterHistory() {
  const created = createBusinessMatter({
    matterId: MATTER_ID,
    eventId: `${MATTER_ID}:created`,
    occurredAt: '2026-10-10T10:00:00Z',
    goal: 'Run the session prompt under an admitted attempt.',
    responsibleParty: { kind: 'human', roleRef: 'role:owner' },
  })
  return enterEvidence(created, {
    eventId: `${MATTER_ID}:revision-1`,
    occurredAt: '2026-10-10T10:01:00Z',
    revisionId: REVISION_ID,
    changeReason: 'Declare the bounded session.prompt action.',
    scope: 'One prompt send under the admitted chain.',
    permissionBoundary: 'No external mutation beyond the session channel.',
    dataDestination: 'Sage session channel.',
    evidence: [{
      evidenceId: 'evidence:persist-1',
      source: 'fixture:persist',
      observedAt: '2026-10-10T10:00:30Z',
      status: 'supported',
    }],
    unknowns: [],
    options: [],
    dependencies: [],
    experienceRefs: [],
    actionPolicies: [{
      actionScope: 'session.prompt',
      effectClass: 'external-write',
      requiresDecision: false,
    }],
  })
}

function seed(store: BusinessMatterEventStore): void {
  const events = encodeBusinessMatterEvents(matterHistory()).map((event) => ({
    matterId: event.matterId,
    eventId: event.eventId,
    eventType: event.eventType,
    eventSchemaVersion: event.eventSchemaVersion,
    occurredAt: event.occurredAt,
    payloadBytes: event.payloadBytes.slice(),
  }))
  const result = store.append({
    matterId: MATTER_ID,
    expectedVersion: { kind: 'not-exists' },
    appendId: 'seed:persist-1',
    events,
  })
  if (result.kind !== 'appended') throw new Error(`seed failed: ${result.kind}`)
}

/** The evidence the compatibility step would have admitted, built through the real codec. */
function buildEvidence(publication: ReturnType<typeof testPublication>, revisionDigest: string) {
  const matrixResult = publication.publication.provider.resolve({
    schemaVersion: 'sage.compatibility-matrix-provider-request.v2',
    targetSemanticDigest: TARGET_SEMANTIC_DIGEST,
    runtimeDescriptorDigest: reobs.descriptor.runtimeDescriptorDigest,
    evaluatedAt: reobs.evidence.observedAt,
    matrixId: publication.publication.matrixId,
  })
  if (matrixResult.kind !== 'available') throw new Error('test publication must resolve')

  const built = buildSessionPromptEvaluationEvidence({
    evaluationId: EVALUATION_ID,
    attemptId: ATTEMPT_ID,
    matterId: MATTER_ID,
    revisionId: REVISION_ID,
    revisionDigest,
    actionScope: 'session.prompt',
    actionIntentDigest: `sha256:${hexPlaceholder('intent')}`,
    targetSemanticDigest: TARGET_SEMANTIC_DIGEST,
    targetEvidenceDigest: `urn:sage:target-evidence:sha256:${hexPlaceholder('target-evidence')}`,
    runtimeDescriptorDigest: reobs.descriptor.runtimeDescriptorDigest,
    inventoryEvidenceDigest: reobs.evidence.inventoryEvidenceDigest,
    inventoryProviderProvenanceDigest: reobs.evidence.mainObservationProvenanceDigest,
    targetProviderProvenanceDigest: `sha256:${hexPlaceholder('target-provenance')}`,
    matrixResult,
    matchedRuleId: RULE_ID,
    matrixProviderProvenanceDigest: matrixResult.providerProvenanceDigest,
    evaluatedAt: reobs.evidence.observedAt,
    revocationSource: publication.revocation,
  })
  if (!built.ok) throw new Error(built.reason)
  return { matrixResult, evidence: built.evidence }
}

const CONTEXT = {
  scope: 'request' as const,
  callerBindingRef: 'caller:session-core',
  sessionRef: 'session:active',
  matterRef: MATTER_ID,
  revisionRef: REVISION_ID,
  generation: '7',
}

function requestWith(evidence: unknown) {
  return {
    intent: {
      family: 'session-core',
      requestId: 'persist-fixture-1',
      operation: 'session.send',
      candidate: { kind: 'matter', matterRef: MATTER_ID },
      payload: { text: 'run' },
    },
    correlation: 'caller:session-core',
    caller: { bindingRef: 'caller:session-core' },
    context: CONTEXT,
    candidateMatch: { candidateRef: 'matter:active' },
    identityPolicy: { decisionRef: 'decision:fixture', actorScopeRef: 'actor:local' },
    target: { targetRef: 'target:fixture' },
    compatibility: {
      evaluationRef: `urn:sage:compatibility-evaluation:v1:${hexPlaceholder('evaluation')}`,
      outcome: 'equivalent',
      evidence,
    },
    registry: {
      mappingRef: 'mapping:urn:sage:capability-registry:sha256:f2df5963780c0868769343cf94147a02e49527e83f8ef49e32a277830aacb411'
        + ':sha256:0b6e398d0a88bf9a82dcfd00c2753cee99b5fd5e6dca64b950f917add7087c25',
    },
    preflight: { preflightRef: 'urn:sage:preflight:v1:fixture' },
  } as never
}

function assemblePort(options: {
  readonly root: string
  readonly home: string
  readonly publication?: ReturnType<typeof testPublication>['publication']
  readonly readContext?: () => unknown
  readonly readIdentitySession?: () => unknown
  readonly readFrame?: () => unknown
  readonly runtimeEffective?: () => unknown
  readonly attempts?: ReturnType<typeof createSessionPromptAttemptStore>
}) {
  const paths = resolveSagePaths({ home: options.home, root: options.root, platform: process.platform })
  const attempts = options.attempts ?? createSessionPromptAttemptStore({ sagePaths: paths })
  cleanups.push(() => attempts.close())
  const publication = options.publication ?? testPublication().publication
  const requirementBundle = loadSessionPromptRequirementBundle()
  if (!requirementBundle.ok) throw new Error(requirementBundle.reason)
  return createSessionPromptPersistencePort({
    requirementBundle,
    publication,
    attempts,
    readContext: (options.readContext ?? (() => ({
      sessionRef: 'session:active',
      matterRef: MATTER_ID,
      revisionRef: REVISION_ID,
      contextGeneration: 7,
      frameGeneration: 7,
    }))) as never,
    readIdentitySession: (options.readIdentitySession ?? (() => ({ sessionRef: 'session:active' }))) as never,
    readFrame: (options.readFrame ?? (() => ({ generation: 7, ready: true, contaminated: false }))) as never,
    runtimeEffective: (options.runtimeEffective ?? (() => OBSERVED)) as never,
    now: () => '2026-10-10T15:00:00.000Z',
  })
}

async function seededHarness(name: string) {
  const { root, home } = await temporaryRoot(name)
  const raw = openRawStore(root, home)
  seed(raw)
  const revisionDigest = raw.readRevisionDigest(MATTER_ID, REVISION_ID)
  if (revisionDigest === undefined) throw new Error('seeded revision must have a digest')
  const publication = testPublication()
  const { evidence } = buildEvidence(publication, revisionDigest)
  return { root, home, raw, publication, evidence }
}

describe('the real persistence step (ADR-0288)', () => {
  it('re-verifies, authors the domain attempt, and appends event plus evidence in one transaction', async () => {
    const harness = await seededHarness('happy')
    const port = assemblePort({ root: harness.root, home: harness.home, publication: harness.publication.publication })
    expect(await port(requestWith(harness.evidence))).toEqual({
      state: 'allowed',
      value: {
        operationRef: 'operation:sage.persist-fixture-1',
        dispatchRef: 'dispatch:sage.persist-fixture-1',
      },
    })

    // Reopen: the attempt is in the domain stream with the requirement's execution face, and the
    // evidence is loadable and replays against its historical matrix.
    const reopened = openRawStore(harness.root, harness.home)
    const loaded = reopened.load(MATTER_ID)
    expect(loaded.kind).toBe('loaded')
    if (loaded.kind !== 'loaded') throw new Error('expected loaded')
    const projection = projectBusinessMatter(loaded.matter)
    expect(projection.attempts.map((attempt) => attempt.attemptId)).toEqual([ATTEMPT_ID])
    const requirement = loadSessionPromptRequirementBundle()
    if (!requirement.ok) throw new Error(requirement.reason)
    const declared = requirement.snapshot.entries[0]!
    expect(projection.attempts[0]?.executionSnapshot.provider.identity).toBe(declared.provider.identity)
    expect(projection.attempts[0]?.executionSnapshot.capabilities[0]?.identity).toBe('capability:sage.session-prompt')
    const evidenceRecord = reopened.compatibilityEvaluationEvidence.load(EVALUATION_ID)
    expect(evidenceRecord.kind).toBe('loaded')
    if (evidenceRecord.kind === 'loaded') {
      expect(evidenceRecord.record.strictReplay?.outcome).toBe('equivalent')
    }
  })

  it('fails closed on moved facts, missing providers and fabricated evidence without writing anything', async () => {
    const harness = await seededHarness('drift')
    const request = requestWith(harness.evidence)
    const base = { root: harness.root, home: harness.home, publication: harness.publication.publication }

    expect(await assemblePort({ ...base, readContext: () => null })(request)).toEqual({ state: 'unavailable' })
    expect(await assemblePort({ ...base, readContext: () => ({ sessionRef: 'session:active', matterRef: MATTER_ID, revisionRef: REVISION_ID, contextGeneration: 8, frameGeneration: 7 }) })(request)).toEqual({ state: 'stale' })
    expect(await assemblePort({ ...base, readContext: () => ({ sessionRef: 'session:other', matterRef: MATTER_ID, revisionRef: REVISION_ID, contextGeneration: 7, frameGeneration: 7 }) })(request)).toEqual({ state: 'stale' })
    expect(await assemblePort({ ...base, readIdentitySession: () => null })(request)).toEqual({ state: 'unavailable' })
    expect(await assemblePort({ ...base, readIdentitySession: () => ({ sessionRef: 'session:other' }) })(request)).toEqual({ state: 'stale' })
    expect(await assemblePort({ ...base, readFrame: () => ({ generation: 7, ready: false, contaminated: false }) })(request)).toEqual({ state: 'unavailable' })
    expect(await assemblePort({ ...base, readFrame: () => ({ generation: 6, ready: true, contaminated: false }) })(request)).toEqual({ state: 'stale' })
    expect(await assemblePort({ ...base, runtimeEffective: () => undefined })(request)).toEqual({ state: 'unavailable' })
    expect(await assemblePort({ ...base, runtimeEffective: () => ({ kind: 'unavailable', reason: 'registry-service-absent' }) })(request)).toEqual({ state: 'unavailable' })
    expect(await assemblePort(base)(requestWith(undefined))).toEqual({ state: 'unavailable' })
    // A fabrication: the evidence admits a different revision digest than the store validates.
    const fabricated = { ...(harness.evidence as object), revisionDigest: `sha256:${'e'.repeat(64)}` }
    expect(await assemblePort(base)(requestWith(fabricated))).toEqual({ state: 'stale' })

    // Nothing was written by any of the refusals.
    const reopened = openRawStore(harness.root, harness.home)
    const loaded = reopened.load(MATTER_ID)
    if (loaded.kind !== 'loaded') throw new Error('expected loaded')
    expect(projectBusinessMatter(loaded.matter).attempts).toHaveLength(0)
    expect(reopened.compatibilityEvaluationEvidence.load(EVALUATION_ID).kind).toBe('not-found')
  })

  it('maps every append outcome except appended/replayed to unavailable', async () => {
    const harness = await seededHarness('outcomes')
    const realAttempts = createSessionPromptAttemptStore({
      sagePaths: resolveSagePaths({ home: harness.home, root: harness.root, platform: process.platform }),
    })
    cleanups.push(() => realAttempts.close())
    for (const kind of ['commit-unknown', 'version-conflict', 'idempotency-conflict', 'duplicate-event-id', 'storage-busy', 'blocked']) {
      const attempts = Object.freeze({
        ...realAttempts,
        appendAttempt: vi.fn(() => ({ kind })) as never,
      })
      const port = assemblePort({ root: harness.root, home: harness.home, publication: harness.publication.publication, attempts: attempts as never })
      expect(await port(requestWith(harness.evidence)), kind).toEqual({ state: 'unavailable' })
      expect(attempts.appendAttempt).toHaveBeenCalledTimes(1)
    }
  })
})

describe('the production assembly wires the persistence step on its own switch', () => {
  const vault = {
    status: () => 'signed-out' as const,
    snapshot: () => ({ status: 'signed-out' as const, displayName: null }),
    signOut: () => undefined,
    identitySession: () => null,
  }
  const adapter = { startLogin: async () => ({ ok: false as const, code: 'probe' }) }
  const callerBinding = { correlation: 'caller:session-core' }

  function assembleWith(omit?: 'runtimeEffective' | 'runtimeAttempts') {
    // After ADR-0289 hoisted the shared reads, bundle-`ok` is no longer exclusive to one port.
    // The publication `ok` read is: in this probe the compatibility port is gated off (no
    // revision digest), so only the persistence port construction reads it.
    let publicationOkReads = 0
    const options: Record<string, unknown> = {
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
      authority: {
        policyPath: '/tmp/unused-policy.json',
        readFileBytes: () => Buffer.from('{}'),
        now: () => '2026-10-10T15:00:00.000Z',
      },
    }
    options.requirementBundle = { ok: false, reason: 'probe' }
    Object.defineProperty(options, 'compatibilityPublication', {
      enumerable: true,
      get() {
        return Object.defineProperty({ reason: 'probe' }, 'ok', {
          get() {
            publicationOkReads += 1
            return false
          },
        })
      },
    })
    if (omit !== 'runtimeEffective') options.runtimeEffective = () => OBSERVED
    if (omit !== 'runtimeAttempts') options.sessionPromptAttempts = { close: () => undefined }
    createSageAppServiceProviders(options as never)
    return publicationOkReads
  }

  it('constructs the persistence port only when its gate inputs exist', () => {
    expect(assembleWith()).toBe(1)
    expect(assembleWith('runtimeEffective')).toBe(0)
    expect(assembleWith('runtimeAttempts')).toBe(0)
  })
})
