import type {
  SageActionType,
  SageDenialReasonCode,
  SageMatterViewState,
} from './view-state.js'

/** Public, renderer-facing preview schema; it is deliberately not a command or domain event. */
export const SAGE_ACTION_PREVIEW_SCHEMA = 'sage.action-preview.v1' as const

export type SagePreviewSubmissionState = 'not-submitted'
export type SagePreviewIdempotencyState = 'not-issued' | 'service-issued'

export interface SageActionPreview {
  readonly schemaVersion: typeof SAGE_ACTION_PREVIEW_SCHEMA
  readonly origin: 'sage-ui'
  readonly projectionSource: SageMatterViewState['projectionSource']
  readonly matterId: string
  readonly revisionId: string | undefined
  readonly actionScope: string | undefined
  readonly actionType: SageActionType
  readonly authorizationState: SageMatterViewState['authorizationState']
  readonly availabilityState: SageMatterViewState['availabilityState']
  readonly compatibilityOutcome: SageMatterViewState['compatibilityOutcome']
  readonly actionability: SageMatterViewState['actionability']
  readonly denialReason: SageDenialReasonCode | undefined
  readonly idempotency: {
    readonly state: SagePreviewIdempotencyState
    readonly key: string | undefined
  }
  readonly submissionState: SagePreviewSubmissionState
}

export type SageActionPreviewErrorCode = 'unknown-action' | 'missing-denial-reason'

export class SageActionPreviewError extends Error {
  readonly code: SageActionPreviewErrorCode

  constructor(code: SageActionPreviewErrorCode, message: string) {
    super(message)
    this.name = 'SageActionPreviewError'
    this.code = code
  }
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value)) {
    freezeDeep((value as Record<PropertyKey, unknown>)[key])
  }
  return Object.freeze(value)
}

/**
 * Build a read-only action preview from the already safe ViewState projection.
 * No transport, service, store, event, or idempotency issuer is consulted here.
 */
export function createSageActionPreview(
  viewState: SageMatterViewState,
  actionType: SageActionType,
): SageActionPreview {
  const action = viewState.actions.find((candidate) => candidate.type === actionType)
  if (action === undefined) {
    throw new SageActionPreviewError('unknown-action', `Sage action ${actionType} is not present in the ViewState.`)
  }
  if (action.actionability === 'blocked' && action.denialReason === undefined) {
    throw new SageActionPreviewError('missing-denial-reason', `Blocked Sage action ${actionType} has no denial reason.`)
  }

  return freezeDeep({
    schemaVersion: SAGE_ACTION_PREVIEW_SCHEMA,
    origin: 'sage-ui',
    projectionSource: viewState.projectionSource,
    matterId: viewState.matter.matterId,
    revisionId: action.revisionId,
    actionScope: action.actionScope,
    actionType: action.type,
    authorizationState: viewState.authorizationState,
    availabilityState: viewState.availabilityState,
    compatibilityOutcome: viewState.compatibilityOutcome,
    actionability: action.actionability,
    denialReason: action.denialReason,
    idempotency: {
      state: 'not-issued',
      key: undefined,
    },
    submissionState: 'not-submitted',
  })
}
