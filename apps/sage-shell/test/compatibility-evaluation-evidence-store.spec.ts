import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createBusinessMatter, enterEvidence } from '../src/domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../src/domain/business-matter-codec.js'
import {
  BUSINESS_MATTER_STORE_FILENAME,
  openBusinessMatterEventStore,
  type AppendRequest,
  type BusinessMatterEventStore,
} from '../src/persistence/business-matter-event-store.js'
import {
  sealCompatibilityMatrixRevocationSourceV2,
  type CompatibilityMatrixRevocationSourceBodyV2,
} from '../src/security/compatibility-matrix-provider.js'
import {
  canonicalizeCompatibilityMatrixV2,
  computeCompatibilityMatrixIdV2,
  type CompatibilityMatrixV2,
} from '../src/security/compatibility.js'
import {
  sealCompatibilityEvaluationEvidence,
  type CompatibilityEvaluationEvidenceBodyV1,
  type CompatibilityEvaluationHistoricalMatrixV1,
} from '../src/security/compatibility-evaluation-evidence.js'
import { resolveSagePaths } from '../src/profile/paths.js'

const CONTENT_DIGEST = `sha256:${'1'.repeat(64)}`
const TARGET_SEMANTIC_DIGEST = `urn:sage:target-semantic:sha256:${'2'.repeat(64)}`
const TARGET_EVIDENCE_DIGEST = `urn:sage:target-evidence:sha256:${'3'.repeat(64)}`
const RUNTIME_DESCRIPTOR_DIGEST = `urn:sage:runtime-descriptor:sha256:${'4'.repeat(64)}`
const INVENTORY_EVIDENCE_DIGEST = `urn:sage:inventory-evidence:sha256:${'5'.repeat(64)}`
const RECORDED_AT = '2026-09-29T04:00:00Z'

const cleanups: Array<() => void | Promise<void>> = []

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function artifactReference(canonicalMatrix: string): string {
  return `urn:sage:compatibility-matrix-artifact:sha256:${sha256(canonicalMatrix)}`
}

function lineageDigest(sourceId: string, supersedesSourceId: string | null): string {
  return `sha256:${sha256(JSON.stringify({ sourceId, supersedesSourceId }))}`
}

function fixtureMatrix(): { readonly canonicalMatrix: string; readonly matrixId: string } {
  const matrix: CompatibilityMatrixV2 = {
    schemaVersion: 'sage.compatibility-matrix.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    semanticVersion: '2.0.0',
    targetContractVersion: 'sage.compatibility-target-semantic.v2',
    runtimeContractVersion: 'sage.runtime-descriptor.v2',
    issuer: {
      identity: 'authority:sage-compatibility',
      version: '1.0.0',
      digest: CONTENT_DIGEST,
    },
    validFrom: '2026-09-29T00:00:00.000Z',
    expiresAt: '2026-09-30T00:00:00.000Z',
    rules: [{
      ruleId: 'rule:sage.shopify.orders.read',
      targetSemanticDigest: TARGET_SEMANTIC_DIGEST,
      runtimeDescriptorDigest: RUNTIME_DESCRIPTOR_DIGEST,
      outcome: 'equivalent',
      reasonCode: 'exact-match',
      reason: 'The approved Shopify read target matches the recorded runtime.',
    }],
  }
  const canonicalMatrix = canonicalizeCompatibilityMatrixV2(matrix)
  return { canonicalMatrix, matrixId: computeCompatibilityMatrixIdV2(canonicalMatrix) }
}

function fixtureRevocationSource() {
  const body: CompatibilityMatrixRevocationSourceBodyV2 = {
    schemaVersion: 'sage.compatibility-matrix-revocation-source.v2',
    canonicalizationVersion: 'sage.compatibility-matrix-revocation-canonical-json.v2',
    createdAt: '2026-09-29T00:00:00.000Z',
    sourceProvenanceDigest: CONTENT_DIGEST,
    entries: [],
  }
  const result = sealCompatibilityMatrixRevocationSourceV2(body)
  if (!result.ok) throw new Error(`Fixture revocation source failed: ${result.code}`)
  return result.value
}

function fixtureBody(matterId: string, suffix: string): CompatibilityEvaluationEvidenceBodyV1 {
  const { canonicalMatrix, matrixId } = fixtureMatrix()
  const source = fixtureRevocationSource()
  return {
    schemaVersion: 'sage.compatibility-evaluation-evidence.v1',
    canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1',
    evaluationId: `evaluation:sage.persistence-${suffix}`,
    attemptId: `attempt:sage.persistence-${suffix}`,
    matterId,
    revisionId: `revision:sage.persistence-${suffix}`,
    revisionDigest: CONTENT_DIGEST,
    actionScope: 'shopify.orders.read',
    actionIntentDigest: CONTENT_DIGEST,
    targetSemanticDigest: TARGET_SEMANTIC_DIGEST,
    targetEvidenceDigest: TARGET_EVIDENCE_DIGEST,
    runtimeDescriptorDigest: RUNTIME_DESCRIPTOR_DIGEST,
    inventoryEvidenceDigest: INVENTORY_EVIDENCE_DIGEST,
    matrixArtifact: {
      schemaVersion: 'sage.compatibility-evaluation-matrix-artifact-reference.v1',
      canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1',
      matrixId,
      canonicalBytesDigest: `sha256:${sha256(canonicalMatrix)}`,
      artifactReference: artifactReference(canonicalMatrix),
    },
    matchedRuleId: 'rule:sage.shopify.orders.read',
    outcome: 'equivalent',
    reasonCode: 'exact-match',
    reason: 'The approved Shopify read target matches the recorded runtime.',
    evaluatedAt: '2026-09-29T03:00:00.000Z',
    resolverContractVersion: 'sage.compatibility-canonical-json.v2',
    providerProvenance: {
      schemaVersion: 'sage.compatibility-evaluation-provider-provenance.v1',
      canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1',
      targetProviderProvenanceDigest: CONTENT_DIGEST,
      inventoryProviderProvenanceDigest: CONTENT_DIGEST,
      matrixProviderProvenanceDigest: CONTENT_DIGEST,
    },
    revocationSource: {
      schemaVersion: 'sage.compatibility-evaluation-revocation-source-reference.v1',
      canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1',
      sourceId: source.sourceId,
      sourceProvenanceDigest: source.sourceProvenanceDigest,
      sourceLineageDigest: lineageDigest(source.sourceId, null),
    },
    lifecycleState: 'active',
  }
}

function fixtureHistoricalMatrix(): CompatibilityEvaluationHistoricalMatrixV1 {
  const { canonicalMatrix, matrixId } = fixtureMatrix()
  return {
    matrixId,
    canonicalBytesDigest: `sha256:${sha256(canonicalMatrix)}`,
    artifactReference: artifactReference(canonicalMatrix),
    canonicalBytes: canonicalMatrix,
    revocationSource: fixtureRevocationSource(),
  }
}

function sealedFixture(matterId: string, suffix: string) {
  const result = sealCompatibilityEvaluationEvidence(fixtureBody(matterId, suffix))
  if (!result.ok) throw new Error(`Fixture evidence failed: ${result.code}`)
  return result.value
}

function matterFor(matterId: string) {
  return createBusinessMatter({
    matterId,
    eventId: `${matterId}:created`,
    occurredAt: '2026-09-29T01:00:00Z',
    goal: 'Persist an auditable compatibility evaluation.',
    responsibleParty: { kind: 'human', roleRef: 'role:owner' },
  })
}

function appendRequest(
  matter: ReturnType<typeof matterFor>,
  appendId: string,
  expectedVersion: number | null,
  startIndex = 0,
): AppendRequest {
  const events = encodeBusinessMatterEvents(matter).slice(startIndex).map((event) => ({
    matterId: event.matterId,
    eventId: event.eventId,
    eventType: event.eventType,
    eventSchemaVersion: event.eventSchemaVersion,
    occurredAt: event.occurredAt,
    payloadBytes: event.payloadBytes.slice(),
  }))
  return {
    matterId: matter.events[0]!.matterId,
    expectedVersion: expectedVersion === null
      ? { kind: 'not-exists' }
      : { kind: 'exact', value: expectedVersion },
    appendId,
    events,
  }
}

async function temporaryRoot(name: string): Promise<{ readonly databasePath: string; readonly root: string; readonly home: string }> {
  const container = await mkdtemp(join(await realpath(tmpdir()), `sage-c3-persistence-${name}-`))
  const root = join(container, 'Sage')
  const home = join(container, 'home')
  await mkdir(home, { mode: 0o700 })
  await mkdir(join(root, 'data', 'business-matter'), { mode: 0o700, recursive: true })
  cleanups.push(() => rm(container, { recursive: true, force: true }))
  return {
    databasePath: join(root, 'data', 'business-matter', BUSINESS_MATTER_STORE_FILENAME),
    root,
    home,
  }
}

function openStore(root: string, home: string, clock = () => RECORDED_AT): BusinessMatterEventStore {
  const store = openBusinessMatterEventStore({
    sagePaths: resolveSagePaths({ home, root, platform: process.platform }),
    maxStreamEvents: 32,
    maxPayloadBytes: 64 * 1024,
    busyTimeoutMs: 75,
    clock,
  })
  cleanups.push(() => store.close())
  return store
}

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

describe('WT-02C.3.2 CompatibilityEvaluationEvidence persistence', () => {
  it('appends evidence with the BusinessMatter event in one transaction and reopens it', async () => {
    const paths = await temporaryRoot('atomic')
    const matterId = 'matter:sage.persistence-atomic'
    const matter = matterFor(matterId)
    const evidence = sealedFixture(matterId, 'atomic')
    const store = openStore(paths.root, paths.home)

    expect(store.appendWithCompatibilityEvidence(
      appendRequest(matter, 'append:sage.persistence-atomic', null),
      { evidence, historicalMatrix: fixtureHistoricalMatrix() },
    )).toEqual({ kind: 'appended', firstVersion: 1, lastVersion: 1 })
    expect(store.compatibilityEvaluationEvidence.load(evidence.evaluationId).kind).toBe('loaded')
    store.close()

    const reopened = openStore(paths.root, paths.home)
    const loaded = reopened.compatibilityEvaluationEvidence.load(evidence.evaluationId)
    expect(loaded.kind).toBe('loaded')
    if (loaded.kind === 'loaded') {
      expect(loaded.record.evidence.evidenceDigest).toBe(evidence.evidenceDigest)
      expect(loaded.record.strictReplay?.outcome).toBe('equivalent')
    }
  })

  it('rolls back the attempt append when the evidence append cannot be accepted', async () => {
    const paths = await temporaryRoot('rollback')
    const matterId = 'matter:sage.persistence-rollback'
    const firstMatter = matterFor(matterId)
    const secondMatter = enterEvidence(firstMatter, {
      eventId: `${matterId}:evidence`,
      occurredAt: '2026-09-29T01:01:00Z',
      revisionId: 'revision:sage.persistence-rollback',
      changeReason: 'Add a bounded evidence revision.',
      scope: 'Read-only test scope.',
      permissionBoundary: 'No external mutation.',
      dataDestination: 'Temporary test database.',
      evidence: [{
        evidenceId: 'evidence:rollback',
        source: 'fixture:rollback',
        observedAt: '2026-09-29T01:00:30Z',
        status: 'supported',
      }],
      unknowns: [],
      options: [],
      dependencies: [],
      experienceRefs: [],
      actionPolicies: [{
        actionScope: 'shopify.orders.read',
        effectClass: 'external-read',
        requiresDecision: false,
      }],
    })
    const evidence = sealedFixture(matterId, 'rollback')
    const store = openStore(paths.root, paths.home)
    expect(store.appendWithCompatibilityEvidence(
      appendRequest(firstMatter, 'append:sage.persistence-rollback-1', null),
      { evidence, historicalMatrix: fixtureHistoricalMatrix() },
    ).kind).toBe('appended')

    const rejected = store.appendWithCompatibilityEvidence(
      appendRequest(secondMatter, 'append:sage.persistence-rollback-2', 1, 1),
      { evidence, historicalMatrix: fixtureHistoricalMatrix() },
    )
    expect(rejected).toEqual({ kind: 'blocked', reason: 'compatibility-evidence-unavailable' })
    expect(store.load(matterId)).toMatchObject({ kind: 'loaded', version: 1 })
    const database = new DatabaseSync(paths.databasePath)
    try {
      expect(database.prepare('SELECT COUNT(*) AS count FROM business_matter_events').get()).toEqual({ count: 1 })
      expect(database.prepare('SELECT COUNT(*) AS count FROM compatibility_evaluation_evidence').get()).toEqual({ count: 1 })
    } finally {
      database.close()
    }
  })

  it('keeps export/restore content-addressed and purges bytes only after hold is released', async () => {
    const sourcePaths = await temporaryRoot('export-source')
    const matterId = 'matter:sage.persistence-export'
    const matter = matterFor(matterId)
    const evidence = sealedFixture(matterId, 'export')
    const source = openStore(sourcePaths.root, sourcePaths.home)
    expect(source.appendWithCompatibilityEvidence(
      appendRequest(matter, 'append:sage.persistence-export', null),
      { evidence, historicalMatrix: fixtureHistoricalMatrix() },
    ).kind).toBe('appended')

    const exported = source.compatibilityEvaluationEvidence.exportEvidence({
      evaluationId: evidence.evaluationId,
      operationId: 'operation:sage.export-1',
    })
    expect(exported.kind).toBe('completed')
    if (exported.kind !== 'completed') throw new Error('Expected export to complete.')

    const restoredPaths = await temporaryRoot('export-restore')
    const restoredStore = openStore(restoredPaths.root, restoredPaths.home)
    expect(restoredStore.compatibilityEvaluationEvidence.restoreEvidence({
      bundle: exported.value,
      operationId: 'operation:sage.restore-1',
    })).toMatchObject({ kind: 'completed' })
    expect(restoredStore.compatibilityEvaluationEvidence.load(evidence.evaluationId).kind).toBe('loaded')

    expect(source.compatibilityEvaluationEvidence.transitionLifecycle({
      evaluationId: evidence.evaluationId,
      operationId: 'operation:sage.expire-1',
      lifecycleState: 'retention-expired',
    })).toMatchObject({ kind: 'completed' })
    expect(source.compatibilityEvaluationEvidence.transitionLifecycle({
      evaluationId: evidence.evaluationId,
      operationId: 'operation:sage-hold-1',
      lifecycleState: 'legal-hold',
    })).toMatchObject({ kind: 'completed' })
    expect(source.compatibilityEvaluationEvidence.purgeEvidence({
      evaluationId: evidence.evaluationId,
      operationId: 'operation:sage.purge-blocked',
    })).toEqual({ kind: 'blocked', code: 'compatibility-evidence-legal-hold' })
    expect(source.compatibilityEvaluationEvidence.transitionLifecycle({
      evaluationId: evidence.evaluationId,
      operationId: 'operation:sage.release-hold-1',
      lifecycleState: 'deletion-pending',
    })).toMatchObject({ kind: 'completed' })
    expect(source.compatibilityEvaluationEvidence.purgeEvidence({
      evaluationId: evidence.evaluationId,
      operationId: 'operation:sage.purge-1',
    })).toEqual({
      kind: 'completed',
      value: {
        evaluationId: evidence.evaluationId,
        operationId: 'operation:sage.purge-1',
        previousState: 'deletion-pending',
        lifecycleState: 'purged',
        purgedBytes: true,
      },
    })
    expect(source.compatibilityEvaluationEvidence.load(evidence.evaluationId)).toEqual({
      kind: 'blocked',
      reason: 'purged',
    })

    const database = new DatabaseSync(sourcePaths.databasePath)
    try {
      const row = database.prepare(`
        SELECT evidence_bytes, matrix_bytes, revocation_source_bytes
        FROM compatibility_evaluation_evidence
        WHERE evaluation_id = ?
      `).get(evidence.evaluationId) as Record<string, unknown>
      expect(row).toEqual({ evidence_bytes: '', matrix_bytes: '', revocation_source_bytes: '' })
      const exportReceipt = database.prepare(`
        SELECT receipt_bytes
        FROM compatibility_evaluation_operation_receipts
        WHERE operation_id = ?
      `).get('operation:sage.export-1') as { readonly receipt_bytes: string }
      expect(exportReceipt.receipt_bytes).not.toContain('canonicalBytes')
    } finally {
      database.close()
    }
  })
})
