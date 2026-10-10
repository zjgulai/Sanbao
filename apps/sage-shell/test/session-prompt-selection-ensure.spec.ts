/** T05 prepare · selection-time ensure (ADR-0291): the full product flow on a custody-shape
 *  matter — selection ensures the runnable revision, the CAS binds it, and the send then walks
 *  the whole ten-step chain to an accepted receipt. */
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createSageAppServiceProviders } from '../src/main/app-service.js'
import { createActiveMatterContext } from '../src/main/active-matter-context.js'
import { selectActiveMatter } from '../src/main/active-matter-selection.js'
import { createSessionPromptAttemptStore } from '../src/main/session-prompt-attempt-store.js'
import { createSessionPromptPrepareEnsure } from '../src/main/session-prompt-prepare.js'
import { createSessionCoreIdentityPort } from '../src/main/session-core-identity.js'
import { loadSessionPromptRequirementBundle } from '../src/main/publication-bundle.js'
import { createBundledCapabilityRegistryProvider } from '../src/security/capability-registry-provider.js'
import { createBusinessMatter, enterEvidence, projectBusinessMatter } from '../src/domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../src/domain/business-matter-codec.js'
import { openBusinessMatterEventStore } from '../src/persistence/business-matter-event-store.js'
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
const MATTER_ID = 'matter:sage.ensure-1'
const TARGET_SEMANTIC_DIGEST = 'urn:sage:target-semantic:sha256:a9a0feb0d94e9937b02145dae15cb4ba2107476039a55d48b35827d7a6488319'

const reobs = JSON.parse(readFileSync(join(APP_ROOT, 'test/support/reobs-runtime-inventory.json'), 'utf8')) as {
  kind: string
  descriptor: RuntimeDescriptorV2
  evidence: RuntimeInventoryEvidenceV2
}
const observation = { descriptor: reobs.descriptor, evidence: reobs.evidence }
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
      ruleId: 'rule:sage-session-prompt-v1',
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

function openStore(paths: ReturnType<typeof resolveSagePaths>) {
  const store = openBusinessMatterEventStore({
    sagePaths: paths,
    maxStreamEvents: 32,
    maxPayloadBytes: 64 * 1024,
    busyTimeoutMs: 75,
    clock: () => '2026-10-12T00:00:00.000Z',
  })
  cleanups.push(() => store.close())
  return store
}

describe('selection-time ensure completes the fresh-matter flow (ADR-0291)', () => {
  const callerBinding = { correlation: 'caller:session-core' }

  it('ensures the runnable revision at selection, binds it in the CAS, and the send reaches accepted', async () => {
    const container = await mkdtemp(join(await realpath(tmpdir()), 'sage-ensure-e2e-'))
    cleanups.push(() => rm(container, { recursive: true, force: true }))
    const root = join(container, 'Sage')
    const home = join(container, 'home')
    await mkdir(home, { mode: 0o700 })
    await mkdir(join(root, 'data', 'business-matter'), { mode: 0o700, recursive: true })
    const paths = resolveSagePaths({ home, root, platform: process.platform })
    await writeFile(paths.organizationPolicyFile, JSON.stringify({
      schemaVersion: 'sage.organization-policy.v1',
      organizationId: 'organization:sage',
      policy: { identity: 'policy:local', version: '1' },
      validFrom: '2026-10-01T00:00:00Z',
      expiresAt: '2027-10-01T00:00:00Z',
      membership: { mode: 'instance-operator', roleRefs: ['role:owner'] },
      grants: [
        { roleRef: 'role:owner', operation: 'session.prepare', actionScope: 'session.prepare', effectClass: 'local-write', requiresDecision: false },
        { roleRef: 'role:owner', operation: 'session.send', actionScope: 'session.prompt', effectClass: 'external-write', requiresDecision: false },
      ],
    }), 'utf8')

    // Seed the custody-shape matter: created + policy-less revision:1 with insufficient evidence.
    const seedStore = openStore(paths)
    const custodyMatter = enterEvidence(createBusinessMatter({
      matterId: MATTER_ID,
      eventId: `${MATTER_ID}:created`,
      occurredAt: '2026-10-10T10:00:00Z',
      goal: 'Prepare the first admitted send.',
      responsibleParty: { kind: 'human', roleRef: 'role:owner' },
    }), {
      eventId: `${MATTER_ID}:revision-1`,
      occurredAt: '2026-10-10T10:01:00Z',
      revisionId: 'revision:1',
      changeReason: '创建', scope: '创建', permissionBoundary: '创建', dataDestination: '创建',
      evidence: [{
        evidenceId: 'evidence:draft-confirmation',
        source: 'draft:d1',
        observedAt: '2026-10-10T10:00:30Z',
        status: 'insufficient',
      }],
      unknowns: [], options: [], dependencies: [], experienceRefs: [],
      actionPolicies: [],
    })
    const seeded = seedStore.append({
      matterId: MATTER_ID,
      expectedVersion: { kind: 'not-exists' },
      appendId: 'seed:ensure-1',
      events: encodeBusinessMatterEvents(custodyMatter).map((event) => ({
        matterId: event.matterId,
        eventId: event.eventId,
        eventType: event.eventType,
        eventSchemaVersion: event.eventSchemaVersion,
        occurredAt: event.occurredAt,
        payloadBytes: event.payloadBytes.slice(),
      })),
    })
    expect(seeded.kind).toBe('appended')

    const attempts = createSessionPromptAttemptStore({ sagePaths: paths })
    cleanups.push(() => attempts.close())
    const sessionSend = vi.fn(async () => ({
      state: 'accepted' as const,
      sessionId: 'session:sage.e2e',
      requestId: 'channel:request-1',
      mode: 'queue' as const,
    }))
    const vaultFixture = {
      identitySession: () => ({
        sessionRef: 'session:active',
        identityHandle: 'actor:local',
        issuer: 'https://issuer.invalid',
        authenticatedAt: '2026-10-01T00:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
      }),
      status: () => 'signed-out' as const,
      snapshot: () => ({ status: 'signed-out' as const, displayName: null }),
      signOut: () => undefined,
    }
    const requirementBundle = loadSessionPromptRequirementBundle()
    if (!requirementBundle.ok) throw new Error(requirementBundle.reason)

    const prepareEnsure = createSessionPromptPrepareEnsure({
      identityPolicy: createSessionCoreIdentityPort({
        vault: vaultFixture as never,
        authority: {
          policyPath: paths.organizationPolicyFile,
          readFileBytes: (path: string) => readFileSync(path),
          now: () => '2026-10-12T00:00:00.000Z',
        },
      }),
      attempts,
      requirementBundle,
      correlation: callerBinding.correlation,
      now: () => '2026-10-12T00:00:00.000Z',
    })

    const activeMatterContext = createActiveMatterContext()
    const selected = await selectActiveMatter({
      candidate: { matterId: MATTER_ID, expectedContextGeneration: 0 },
      context: activeMatterContext,
      ports: {
        readActiveIdentitySession: () => ({ sessionRef: 'session:active' }),
        authorizeMatterRead: () => ({ state: 'allowed', actorScopeRef: 'actor:local' }),
        resolveCurrentRevision: () => {
          const loaded = seedStore.load(MATTER_ID)
          const current = loaded.kind === 'loaded' ? projectBusinessMatter(loaded.matter).currentRevisionId : undefined
          return current === undefined ? undefined : { matterId: MATTER_ID, revisionId: current }
        },
        resolveDefaultWorkspace: () => ({ matterId: MATTER_ID, workspaceRef: 'workspace:active' }),
        readFreshWorkspaceFold: () => ({
          state: 'read',
          entries: [{ workspaceId: 'workspace:active', path: '/trusted/workspace' }],
        }),
        snapshotFramePolicy: () => ({ generation: 7, ready: true, contaminated: false }),
        ensureRunnableRevision: prepareEnsure,
      },
    })
    expect(selected.ok).toBe(true)
    if (!selected.ok) throw new Error(selected.code)
    // The CAS bound the ENSURED revision, not the policy-less birth revision.
    expect(selected.projection.revisionId).toMatch(/^revision:sage\./u)
    expect(selected.projection.revisionId).not.toBe('revision:1')

    const providers = createSageAppServiceProviders({
      viewState: null,
      vault: vaultFixture as never,
      adapter: { startLogin: async () => ({ ok: false as const, code: 'probe' }) } as never,
      callerBinding,
      activeMatterContext,
      framePolicySnapshot: () => ({ generation: 7, ready: true, contaminated: false, contaminationReasons: [] }),
      matterRehydrate: (({ matterId, revisionId }: { matterId: string, revisionId: string }) => {
        const loaded = seedStore.load(matterId)
        if (loaded.kind !== 'loaded') return undefined
        return { matter: loaded.matter, current: projectBusinessMatter(loaded.matter).currentRevisionId === revisionId }
      }) as never,
      matterLinks: () => ({
        state: 'read',
        links: [{
          matterRef: MATTER_ID,
          workspaceRef: 'workspace:active',
          workspacePath: '/trusted/workspace',
          linkedAt: '2026-10-01T00:00:00.000Z',
          isDefault: true,
        }],
        trail: [],
      }),
      workspaceList: async () => ({
        source: 'workspace-follow', state: 'read', reason: null,
        entries: [{
          workspaceId: 'workspace:active',
          path: '/trusted/workspace',
          title: 'Workspace', sessionCount: 0,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        }],
        order: ['workspace:active'], archivedSessions: 0, frames: 1, unapplied: 0,
      }),
      sessionSend,
      authority: {
        policyPath: paths.organizationPolicyFile,
        readFileBytes: (path: string) => readFileSync(path),
        now: () => '2026-10-12T00:00:00.000Z',
      },
      requirementBundle,
      compatibilityPublication: testPublication(),
      runtimeInventoryObservation: () => observation,
      capabilityRegistry: createBundledCapabilityRegistryProvider(
        (() => {
          const load = JSON.parse(readFileSync(join(APP_ROOT, 'publications', 'session-prompt.capability-registry.json'), 'utf8')) as Record<string, unknown>
          const { snapshotId: _ignored, ...body } = load
          void _ignored
          return body as never
        })(),
      ),
      runtimeEffective: () => OBSERVED,
      sessionPromptAttempts: attempts,
      revisionDigest: (matterId: string, revisionId: string) => attempts.revisionDigest(matterId, revisionId),
    })

    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/session/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matterRef: MATTER_ID, workspaceRoot: '/renderer/path', text: 'run' }),
    }), { callerBinding, providers })
    expect(await response.json()).toEqual({
      state: 'accepted',
      sessionId: 'session:sage.e2e',
      requestId: 'channel:request-1',
      mode: 'queue',
    })
    expect(sessionSend).toHaveBeenCalledTimes(1)

    // The store carries two revisions (birth + ensured) and one admitted attempt.
    const reopened = openStore(paths)
    const loaded = reopened.load(MATTER_ID)
    expect(loaded.kind).toBe('loaded')
    if (loaded.kind === 'loaded') {
      const projection = projectBusinessMatter(loaded.matter)
      expect(projection.revisions.map((revision) => revision.revisionId)).toEqual(['revision:1', selected.projection.revisionId])
      expect(projection.attempts).toHaveLength(1)
      expect(projection.currentRevisionId).toBe(selected.projection.revisionId)
    }
  })
})
