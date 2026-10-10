/** T05-mid step 10 (ADR-0289): the dispatch step — re-verification, the cheap port re-runs, the
 *  sole channel call, and the caller-facing outcome mapping of the whole ten-step chain. */
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { admitProtectedEffect } from '../src/appservice/protected-effect-admission.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createSageAppServiceProviders } from '../src/main/app-service.js'
import { createActiveMatterContext } from '../src/main/active-matter-context.js'
import { createSessionPromptAttemptStore } from '../src/main/session-prompt-attempt-store.js'
import { createSessionPromptDispatchPort } from '../src/main/session-prompt-dispatch.js'
import { loadSessionPromptRequirementBundle } from '../src/main/publication-bundle.js'
import { createBundledCapabilityRegistryProvider } from '../src/security/capability-registry-provider.js'
import { createBusinessMatter, enterEvidence } from '../src/domain/business-matter.js'
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
const MATTER_ID = 'matter:sage.dispatch-1'
const REVISION_ID = 'revision:sage.dispatch-1'
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

const CONTEXT = {
  scope: 'request' as const,
  callerBindingRef: 'caller:session-core',
  sessionRef: 'session:active',
  matterRef: MATTER_ID,
  revisionRef: REVISION_ID,
  generation: '7',
}
const EVIDENCE = { revisionDigest: `sha256:${'d'.repeat(64)}` }

function dispatchHarness(options: {
  readonly text?: unknown
  readonly sessionSend?: unknown
  readonly readContext?: () => unknown
  readonly readWorkspaceRoot?: (matterRef: string) => string | undefined
  readonly targetRef?: string
  readonly registryRef?: string
  readonly preflightRef?: string
}) {
  const sessionSend = (options.sessionSend ?? vi.fn(async () => ({
    state: 'accepted' as const,
    sessionId: 'session:sage.e2e',
    requestId: 'channel:request-1',
    mode: 'queue' as const,
  }))) as never
  const port = createSessionPromptDispatchPort({
    sessionSend: sessionSend as never,
    resolveTarget: vi.fn(async () => ({ state: 'allowed' as const, value: { targetRef: options.targetRef ?? 'target:admitted' } })) as never,
    resolveRegistry: vi.fn(async () => ({ state: 'allowed' as const, value: { mappingRef: options.registryRef ?? 'mapping:admitted' } })) as never,
    preflight: vi.fn(async () => ({ state: 'allowed' as const, value: { preflightRef: options.preflightRef ?? 'urn:sage:preflight:v1:admitted' } })) as never,
    readWorkspaceRoot: options.readWorkspaceRoot ?? (() => '/trusted/workspace'),
    readContext: (options.readContext ?? (() => ({
      sessionRef: 'session:active',
      matterRef: MATTER_ID,
      revisionRef: REVISION_ID,
      contextGeneration: 7,
      frameGeneration: 7,
    }))) as never,
    readIdentitySession: (() => ({ sessionRef: 'session:active' })) as never,
    readFrame: (() => ({ generation: 7, ready: true, contaminated: false })) as never,
    runtimeEffective: (() => OBSERVED) as never,
    attempts: {
      strictRehydrate: () => ({ matter: {} as never, current: true, version: 3 }),
      revisionDigest: () => EVIDENCE.revisionDigest,
    } as never,
  })
  const request = {
    intent: {
      family: 'session-core',
      requestId: 'dispatch-fixture-1',
      operation: 'session.send',
      candidate: { kind: 'matter', matterRef: MATTER_ID },
      payload: { text: options.text ?? 'run', mode: 'queue' },
    },
    correlation: 'caller:session-core',
    context: CONTEXT,
    target: { targetRef: 'target:admitted' },
    compatibility: { evaluationRef: 'urn:sage:compatibility-evaluation:v1:fixture', outcome: 'equivalent', evidence: EVIDENCE },
    registry: { mappingRef: 'mapping:admitted' },
    preflight: { preflightRef: 'urn:sage:preflight:v1:admitted' },
    operationRef: 'operation:sage.dispatch-fixture-1',
    dispatchRef: 'dispatch:sage.dispatch-fixture-1',
  } as never
  return { port, sessionSend: sessionSend as unknown as ReturnType<typeof vi.fn>, request }
}

describe('the real dispatch step (ADR-0289)', () => {
  it('calls the channel only after every guard and normalizes accepted and deferred outcomes', async () => {
    const accepted = dispatchHarness({})
    expect(await accepted.port(accepted.request)).toEqual({
      state: 'receipt',
      receiptRef: 'receipt:session-send:channel:request-1',
      detail: {
        kind: 'session-send-accepted',
        sessionId: 'session:sage.e2e',
        requestId: 'channel:request-1',
        mode: 'queue',
      },
    })
    expect(accepted.sessionSend).toHaveBeenCalledTimes(1)
    expect(accepted.sessionSend).toHaveBeenCalledWith({
      matterRef: MATTER_ID,
      workspaceRoot: '/trusted/workspace',
      text: 'run',
      mode: 'queue',
    })

    const deferred = dispatchHarness({
      sessionSend: vi.fn(async () => ({ state: 'deferred' as const, itemId: 'queue-item:1' })),
    })
    expect(await deferred.port(deferred.request)).toEqual({
      state: 'receipt',
      receiptRef: 'receipt:session-send-deferred:queue-item:1',
      detail: { kind: 'session-send-deferred', itemId: 'queue-item:1' },
    })
  })

  it('normalizes a determinate channel refusal and everything uncertain honestly', async () => {
    const refused = dispatchHarness({
      sessionSend: vi.fn(async () => ({ state: 'refused' as const, code: 'session-channel-closed' })),
    })
    expect(await refused.port(refused.request)).toEqual({ state: 'refused', code: 'session-channel-closed' })

    const thrown = dispatchHarness({
      sessionSend: vi.fn(async () => { throw new Error('probe') }),
    })
    expect(await thrown.port(thrown.request)).toEqual({ state: 'outcome-unknown' })
  })

  it('answers not-dispatched before the channel when any guard or re-run drifts', async () => {
    const cases = [
      { name: 'context moved', harness: () => dispatchHarness({ readContext: () => ({ sessionRef: 'session:active', matterRef: MATTER_ID, revisionRef: REVISION_ID, contextGeneration: 8, frameGeneration: 7 }) }) },
      { name: 'target moved', harness: () => dispatchHarness({ targetRef: 'target:other' }) },
      { name: 'registry moved', harness: () => dispatchHarness({ registryRef: 'mapping:other' }) },
      { name: 'roster moved', harness: () => dispatchHarness({ preflightRef: 'urn:sage:preflight:v1:other' }) },
      { name: 'workspace unresolvable', harness: () => dispatchHarness({ readWorkspaceRoot: () => undefined }) },
      { name: 'payload invalid', harness: () => dispatchHarness({ text: '' }) },
    ]
    for (const item of cases) {
      const harness = item.harness()
      expect(await harness.port(harness.request), item.name).toEqual({ state: 'not-dispatched' })
      expect(harness.sessionSend, item.name).not.toHaveBeenCalled()
    }
  })
})

describe('the kernel passes the receipt detail and the determinate refusal through', () => {
  const persistSaw: unknown[] = []
  afterEach(() => { persistSaw.length = 0 })
  function chain(dispatch: unknown) {
    return {
      verifyCaller: async () => ({ state: 'allowed' as const, value: { bindingRef: 'caller:session-core' } }),
      resolveActiveContext: async () => ({
        state: 'allowed' as const,
        value: { ...CONTEXT, callerBindingRef: 'caller:session-core' },
      }),
      matchCandidate: async () => ({ state: 'allowed' as const, value: { candidateRef: 'matter:active' } }),
      resolveIdentityPolicy: async () => ({ state: 'allowed' as const, value: { decisionRef: 'decision:fixture', actorScopeRef: 'actor:local' } }),
      resolveTarget: async () => ({ state: 'allowed' as const, value: { targetRef: 'target:admitted' } }),
      resolveCompatibility: async () => ({
        state: 'allowed' as const,
        value: { evaluationRef: 'urn:sage:compatibility-evaluation:v1:fixture', outcome: 'equivalent' as const, evidence: EVIDENCE },
      }),
      resolveRegistry: async () => ({ state: 'allowed' as const, value: { mappingRef: 'mapping:admitted' } }),
      preflight: async () => ({ state: 'allowed' as const, value: { preflightRef: 'urn:sage:preflight:v1:admitted' } }),
      persist: async (request: { readonly compatibility: { readonly evidence?: unknown } }) => {
        persistSaw.push(request.compatibility.evidence)
        return { state: 'allowed' as const, value: { operationRef: 'operation:1', dispatchRef: 'dispatch:1' } }
      },
      dispatch,
    } as never
  }
  const call = (dispatch: unknown) => admitProtectedEffect({
    intent: {
      family: 'session-core',
      requestId: 'kernel-fixture-1',
      operation: 'session.send',
      candidate: { kind: 'matter', matterRef: MATTER_ID },
      payload: { text: 'run' },
    },
    correlation: 'caller:session-core',
    ports: chain(dispatch),
  })

  it('keeps receipt + detail, refused-by-code, not-dispatched and unknown distinct', async () => {
    expect(await call(async () => ({
      state: 'receipt',
      receiptRef: 'receipt:session-send:channel:1',
      detail: { kind: 'session-send-accepted', sessionId: 'session:sage.e2e', requestId: 'channel:1', mode: 'queue' },
    }))).toMatchObject({
      state: 'dispatched',
      receiptRef: 'receipt:session-send:channel:1',
      detail: { kind: 'session-send-accepted', sessionId: 'session:sage.e2e' },
    })

    // The admitted evidence must survive the seam (ADR-0288): the persist step writes it.
    expect(persistSaw.at(-1)).toMatchObject({ revisionDigest: EVIDENCE.revisionDigest })

    expect(await call(async () => ({ state: 'refused', code: 'session-channel-closed' })))
      .toMatchObject({ state: 'refused', code: 'session-channel-closed' })

    expect(await call(async () => ({ state: 'not-dispatched' })))
      .toMatchObject({ state: 'unavailable', code: 'protected-effect-unavailable', retryable: true, stage: 'dispatch' })

    expect(await call(async () => ({ state: 'outcome-unknown' })))
      .toMatchObject({ state: 'outcome-unknown', code: 'protected-effect-outcome-unknown' })

    // A malformed detail is the conservative unknown, never a partial receipt.
    expect(await call(async () => ({
      state: 'receipt',
      receiptRef: 'receipt:session-send:channel:1',
      detail: { kind: 'session-send-accepted', sessionId: 'session:sage.e2e' },
    }))).toMatchObject({ state: 'outcome-unknown' })
  })
})

describe('the ten-step chain answers a real send end to end', () => {
  const callerBinding = { correlation: 'caller:session-core' }

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

  it('POST /.sage/session/send answers accepted with the channel identity, and a second send stays blocked by the open attempt', async () => {
    const container = await mkdtemp(join(await realpath(tmpdir()), 'sage-dispatch-e2e-'))
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
      grants: [{
        roleRef: 'role:owner',
        operation: 'session.send',
        actionScope: 'session.prompt',
        effectClass: 'external-write',
        requiresDecision: false,
      }],
    }), 'utf8')

    // Seed the domain state the chain requires: create → revision entered with the policy.
    const seedStore = openBusinessMatterEventStore({
      sagePaths: paths,
      maxStreamEvents: 32,
      maxPayloadBytes: 64 * 1024,
      busyTimeoutMs: 75,
      clock: () => '2026-10-10T15:00:00.000Z',
    })
    cleanups.push(() => seedStore.close())
    const created = createBusinessMatter({
      matterId: MATTER_ID,
      eventId: `${MATTER_ID}:created`,
      occurredAt: '2026-10-10T10:00:00Z',
      goal: 'Dispatch the first admitted send.',
      responsibleParty: { kind: 'human', roleRef: 'role:owner' },
    })
    const withRevision = enterEvidence(created, {
      eventId: `${MATTER_ID}:revision-1`,
      occurredAt: '2026-10-10T10:01:00Z',
      revisionId: REVISION_ID,
      changeReason: 'Declare the bounded session.prompt action.',
      scope: 'One prompt send under the admitted chain.',
      permissionBoundary: 'No external mutation beyond the session channel.',
      dataDestination: 'Sage session channel.',
      evidence: [{
        evidenceId: 'evidence:dispatch-1',
        source: 'fixture:dispatch',
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
    const seedEvents = encodeBusinessMatterEvents(withRevision).map((event) => ({
      matterId: event.matterId,
      eventId: event.eventId,
      eventType: event.eventType,
      eventSchemaVersion: event.eventSchemaVersion,
      occurredAt: event.occurredAt,
      payloadBytes: event.payloadBytes.slice(),
    }))
    const seeded = seedStore.append({
      matterId: MATTER_ID,
      expectedVersion: { kind: 'not-exists' },
      appendId: 'seed:dispatch-1',
      events: seedEvents,
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

    const activeMatterContext = createActiveMatterContext()
    expect(activeMatterContext.activate({
      expectedContextGeneration: 0,
      next: {
        actorScopeRef: 'actor:local',
        matterId: MATTER_ID,
        revisionId: REVISION_ID,
        workspaceRef: 'workspace:active',
        trustedWorkspaceRoot: '/trusted/workspace',
        sessionRef: 'session:active',
        frameGeneration: 7,
      },
    }).ok).toBe(true)

    const registryLoad = JSON.parse(readFileSync(join(APP_ROOT, 'publications', 'session-prompt.capability-registry.json'), 'utf8')) as {
      snapshotId: string
    } & Record<string, unknown>
    const { snapshotId: _ignored, ...registryBody } = registryLoad
    void _ignored

    const providers = createSageAppServiceProviders({
      viewState: null,
      vault: {
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
      } as never,
      adapter: { startLogin: async () => ({ ok: false as const, code: 'probe' }) } as never,
      callerBinding,
      activeMatterContext,
      framePolicySnapshot: () => ({ generation: 7, ready: true, contaminated: false, contaminationReasons: [] }),
      matterRehydrate: (() => ({ matter: {} as never, current: true })) as never,
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
      requirementBundle: loadSessionPromptRequirementBundle(),
      compatibilityPublication: testPublication(),
      runtimeInventoryObservation: () => observation,
      capabilityRegistry: createBundledCapabilityRegistryProvider(registryBody as never),
      runtimeEffective: () => OBSERVED,
      sessionPromptAttempts: attempts,
      // ADR-0296: no prior turn end in the fixture fold.
      readObservedTurnEndEdge: async () => null,
      revisionDigest: (matterId: string, revisionId: string) => attempts.revisionDigest(matterId, revisionId),
    })

    const post = () => handleSageServiceRequest(new Request('dsh-app://app/.sage/session/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matterRef: MATTER_ID, workspaceRoot: '/renderer/path', text: 'run' }),
    }), { callerBinding, providers })

    const first = await (await post()).json()
    expect(first).toEqual({
      state: 'accepted',
      sessionId: 'session:sage.e2e',
      requestId: 'channel:request-1',
      mode: 'queue',
    })
    expect(sessionSend).toHaveBeenCalledTimes(1)

    // The attempt stays open until the turn-close flow lands (registered follow-up): a second
    // send fails closed at persist and never reaches the channel.
    const second = await (await post()).json()
    expect(second).toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(sessionSend).toHaveBeenCalledTimes(1)
  })
})
