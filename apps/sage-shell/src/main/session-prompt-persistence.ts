/** T05-mid step 9 (ADR-0288): the persistence step — pre-write re-verification, then one atomic
 *  append of the attempt-preparation event and the exact compatibility evaluation evidence the
 *  chain admitted.
 *
 *  Boundary discipline (application-service-boundary item 8/9):
 *  - What is written: the v1 domain `attempt-started` event (built through the domain kernel —
 *    its state machine and revision-policy checks are the sole author of the payload) plus the
 *    sealed `CompatibilityEvaluationEvidenceV1` carried by the compatibility fact. No raw
 *    subject, token, session or runtime authority snapshot touches the store. ADR-0296 adds one
 *    pre-write observation: the session fold's turn-end edge, recorded as the attempt's closure
 *    baseline (only a NEWER edge may later close it).
 *  - Where: the Sage-owned matter event store, one transaction (`appendWithCompatibilityEvidence`);
 *    `commit-unknown` answers unavailable and never proceeds to dispatch.
 *  - Re-verification (the cheap, real subset of item 9): the live context still equals the
 *    admitted request context, the identity session still matches, the frame is still ready at
 *    the same generation, the store still validates the admitted revision digest, and the live
 *    runtime epoch is still observed. Any moved fact is `stale`; a missing provider is
 *    `unavailable`. Re-running the full resolver against a fresh observation is 50–200s of work
 *    and stays with the registered host-lifecycle invalidation ticket (ADR-0284/0286).
 *
 *  The operation identity is service-issued: attemptId comes from the admitted evidence (the
 *  compatibility step minted it from the per-request service-issued requestId); operationRef and
 *  dispatchRef are that same identity re-namespaced, so every ref in the chain traces to one
 *  attempt. Replays of the same appendId answer allowed (idempotent retry); everything else
 *  fails closed.
 */
import type { ProtectedEffectAdmissionPorts } from '../appservice/protected-effect-admission.js'
import { startAttempt, type BusinessMatter } from '../domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../domain/business-matter-codec.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'
import type { CompatibilityMatrixPublicationLoad, RequirementBundleLoad } from './publication-bundle.js'
import { matrixBytesReference } from './session-prompt-evaluation-evidence.js'
import type { SessionPromptAttemptStorePort } from './session-prompt-attempt-store.js'
import { verifyAdmittedFactsStillHold, type SessionPromptReverifyReads } from './session-prompt-reverify.js'

/** The reads are the shared step-9/10 re-verification shape (single home, ADR-0289). */
export interface SessionPromptPersistenceOptions extends SessionPromptReverifyReads {
  readonly requirementBundle: RequirementBundleLoad
  readonly publication: CompatibilityMatrixPublicationLoad
  /** The full store handle; the re-verification reads use its rehydrate/digest surfaces. */
  readonly attempts: SessionPromptAttemptStorePort
  /** ADR-0296: the session fold's current turn-end edge, observed just before the attempt is
   *  recorded (`null` = observed, none exists). `undefined` = the fold was unreadable — the
   *  attempt may not be recorded without its closure baseline, so the step fails closed. */
  readonly readObservedTurnEndEdge: (matterRef: string) => Promise<string | null | undefined>
  readonly now: () => string
}

export function createSessionPromptPersistencePort(
  options: SessionPromptPersistenceOptions,
): NonNullable<ProtectedEffectAdmissionPorts['persist']> {
  const bundleOk = options.requirementBundle.ok
  const publicationOk = options.publication.ok
  return async ({ intent, context, registry, compatibility }) => {
    const bundle = options.requirementBundle
    const publication = options.publication
    if (!bundleOk || !bundle.ok || !publicationOk || !publication.ok) return { state: 'unavailable' }
    if (!registry.mappingRef.startsWith('mapping:')) return { state: 'unavailable' }

    // The evidence the compatibility step admitted; without it nothing may be written.
    const evidence = compatibility.evidence
    if (evidence === undefined || typeof evidence.evidenceDigest !== 'string') return { state: 'unavailable' }

    const table = ACTION_AUTHORITY_TABLE[intent.operation]
    if (table === undefined) return { state: 'unavailable' }
    const declaring = bundle.snapshot.entries.filter((candidate) => candidate.actionRequirements
      .some((action) => action.actionScope === table.actionScope))
    const requirement = declaring.length === 1 ? declaring[0] : undefined
    if (requirement === undefined) return { state: 'unavailable' }

    // Pre-write re-verification (item 9, cheap real subset): the shared step-9/10 helper.
    // Missing providers are unavailable; facts that moved since admission are stale.
    const reverified = verifyAdmittedFactsStillHold(options, {
      context,
      revisionDigest: evidence.revisionDigest,
    })
    if (!reverified.ok) return { state: reverified.state }

    const canonicalBytes = publication.bundle.artifacts
      .find((artifact) => artifact.matrixId === publication.matrixId)?.canonicalMatrix
    if (canonicalBytes === undefined) return { state: 'unavailable' }
    const historicalMatrix = {
      matrixId: publication.matrixId,
      ...matrixBytesReference(canonicalBytes),
      canonicalBytes,
      revocationSource: publication.revocationSource,
    }

    // ADR-0296: the closure baseline is observed BEFORE the event is authored — a turn-end edge
    // may later close this attempt only when it differs from this reading. An unreadable fold
    // cannot yield a baseline; recording the attempt anyway would leave it unadjudicable.
    const observedTurnEndEdge = await options.readObservedTurnEndEdge(context.matterRef)
    if (observedTurnEndEdge === undefined) return { state: 'unavailable' }

    // The domain kernel authors the event payload; anything it refuses stays unwritten.
    let next: BusinessMatter
    try {
      next = startAttempt(reverified.matter, {
        eventId: `attempt-started:${evidence.attemptId}`,
        occurredAt: options.now(),
        attemptId: evidence.attemptId,
        observedTurnEndEdge,
        revisionId: context.revisionRef,
        actionScopes: [table.actionScope],
        decisionIds: [],
        executionSnapshot: {
          provider: {
            identity: requirement.provider.identity,
            version: requirement.provider.version,
            digest: requirement.provider.artifactDigest,
          },
          model: {
            identity: requirement.model.identity,
            version: requirement.model.version,
            digest: requirement.model.artifactDigest,
          },
          agent: {
            identity: requirement.agent.identity,
            version: requirement.agent.version,
            digest: requirement.agent.artifactDigest,
          },
          preset: {
            identity: requirement.preset.identity,
            version: requirement.preset.version,
            digest: requirement.preset.artifactDigest,
          },
          capabilities: requirement.capabilities.map((capability) => ({
            identity: capability.identity,
            version: capability.version,
            digest: capability.artifactDigest,
          })),
        },
        compatibility: {
          outcome: 'equivalent',
          matrixId: evidence.matrixArtifact.matrixId,
          reason: evidence.reason,
        },
      })
    } catch {
      return { state: 'unavailable' }
    }

    const events = encodeBusinessMatterEvents(next).slice(reverified.matter.events.length).map((event) => ({
      matterId: event.matterId,
      eventId: event.eventId,
      eventType: event.eventType,
      eventSchemaVersion: event.eventSchemaVersion,
      occurredAt: event.occurredAt,
      payloadBytes: event.payloadBytes.slice(),
    }))
    if (events.length === 0) return { state: 'unavailable' }

    let result
    try {
      result = options.attempts.appendAttempt({
        matterId: context.matterRef,
        expectedVersion: { kind: 'exact', value: reverified.version },
        appendId: `session-prompt-attempt:${evidence.attemptId}`,
        events,
        evidence: { evidence, historicalMatrix },
      })
    } catch {
      return { state: 'unavailable' }
    }

    switch (result.kind) {
      case 'appended':
      case 'replayed':
        return {
          state: 'allowed',
          value: {
            operationRef: evidence.attemptId.replace(/^attempt:/u, 'operation:'),
            dispatchRef: evidence.attemptId.replace(/^attempt:/u, 'dispatch:'),
          },
        }
      default:
        // commit-unknown, version/idempotency conflicts, duplicate ids, blocked storage and
        // invalid requests all fail closed: nothing may proceed to dispatch without a proven
        // commit.
        return { state: 'unavailable' }
    }
  }
}
