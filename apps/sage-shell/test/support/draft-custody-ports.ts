/** L1-C (ADR-0323) test support: the draft-custody admission ports over the REAL dispatch port.
 *
 *  Composition-level specs build it with the same wiring the production assembly uses — the
 *  front steps allowed as stubs, the dispatch bound to the spec's store/spies, and the reconcile
 *  adapter resolving the draft's open-attempt correlation at call time (missing => the honest
 *  'no-open-attempt' unknown, never a settled guess).
 */
import type { DraftStatus } from '../../src/appservice/contracts.js'
import type { DraftCustodyAdmissionPorts } from '../../src/appservice/draft-custody-admission.js'
import { createDraftCustodyDispatchPort } from '../../src/main/draft-custody-dispatch.js'

type ReconcileAnswer =
  | { readonly state: 'settled', readonly matterRef: string }
  | { readonly state: 'failed', readonly code: string }
  | { readonly state: 'unknown', readonly code: string }

export interface DraftCustodyPortOverrides {
  readonly create?: (request: { readonly rawInput: string }) => DraftStatus | undefined
  readonly update?: (request: {
    readonly draftId: string
    readonly fields?: { readonly goal?: string, readonly deliverable?: string, readonly responsibility?: string, readonly projectRef?: string }
    readonly clarification?: string
    readonly selectedEntryIds?: readonly string[]
  }) => DraftStatus | undefined
  readonly cancel?: (request: { readonly draftId: string }) => DraftStatus | undefined
  readonly reconcileCreation?: (request: { readonly draftId: string, readonly correlation: string }) => ReconcileAnswer | undefined | Promise<ReconcileAnswer | undefined>
  readonly commitConversion?: (request: { readonly draftId: string, readonly matterRef: string }) => void
  readonly noteAttempt?: (request: { readonly draftId: string, readonly correlation: string, readonly state: 'failed' }) => void
  readonly draftList?: () => { readonly drafts: readonly { readonly draftId: string, readonly attempt: { readonly correlation?: string } | null }[] } | undefined
  readonly bindingRef?: string
}

const SESSION = 'session:draft-custody'

export function draftCustodyTestPorts(overrides: DraftCustodyPortOverrides = {}): DraftCustodyAdmissionPorts {
  const binding = overrides.bindingRef ?? 'caller:draft-custody'
  const readAttemptCorrelation = (draftId: string): string | undefined =>
    overrides.draftList?.()?.drafts.find((entry) => entry.draftId === draftId)?.attempt?.correlation
  return {
    verifyCaller: async () => ({ state: 'allowed', value: { bindingRef: binding } }),
    resolveActiveContext: async () => ({
      state: 'allowed',
      value: {
        scope: 'request',
        callerBindingRef: binding,
        sessionRef: SESSION,
        matterRef: 'matter:one',
        revisionRef: 'revision:one',
        generation: '1',
      },
    }),
    matchCandidate: async () => ({ state: 'allowed', value: { candidateRef: 'matter:one' } }),
    resolveIdentityPolicy: async () => ({ state: 'allowed', value: { decisionRef: 'decision:one', actorScopeRef: 'actor:one' } }),
    dispatch: createDraftCustodyDispatchPort({
      create: overrides.create ?? (() => undefined),
      update: overrides.update ?? (() => undefined),
      cancel: overrides.cancel ?? (() => undefined),
      reconcile: async ({ draftId }) => {
        const correlation = readAttemptCorrelation(draftId)
        if (correlation === undefined) return { state: 'unknown', code: 'no-open-attempt' }
        return overrides.reconcileCreation?.({ draftId, correlation })
      },
      commitConversion: overrides.commitConversion ?? (() => undefined),
      noteAttempt: ({ draftId, state }) => {
        const correlation = readAttemptCorrelation(draftId)
        if (correlation !== undefined) overrides.noteAttempt?.({ draftId, correlation, state })
      },
      readContext: () => ({
        sessionRef: SESSION,
        matterRef: 'matter:one',
        revisionRef: 'revision:one',
        contextGeneration: 1,
        frameGeneration: 7,
      }),
      readIdentitySession: () => ({ sessionRef: SESSION }),
      readFrame: () => ({ generation: 7, ready: true, contaminated: false }),
    }),
  }
}
