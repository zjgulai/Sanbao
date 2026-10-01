/** WT-02D.0.2 command contracts: full ActionIntent and typed pipeline ports (spec §3). */
import type { BusinessMatter } from '../domain/business-matter.js'
import type { IdentityPolicyResolution } from '../security/identity-policy.js'
import type { CapabilityRegistryOperationMappingV1 } from '../security/capability-registry.js'

export interface SageActionIntentV2 {
  readonly matterId: string
  readonly revisionId: string
  readonly actionType: string
  readonly actionScope: 'matter' | 'revision'
  readonly payload: Readonly<Record<string, string | number | boolean>>
  readonly origin: 'renderer-retry' | 'renderer-action'
}

export type CommandErrorCode =
  | 'invalid-intent' | 'identity-unavailable' | 'policy-denied' | 'stale-revision'
  | 'decision-required' | 'compatibility-unknown' | 'requires-new-revision'
  | 'registry-unavailable' | 'capability-unavailable' | 'persistence-unavailable'
  | 'cancelled-before-dispatch' | 'conflict' | 'outcome-unknown'

export interface CommandDenied {
  readonly code: CommandErrorCode
  readonly stage: string
  readonly retryable: boolean
  readonly requiresNewRevision?: boolean
  readonly requiresDecision?: boolean
  readonly correlation: string
}

export interface CommandAccepted {
  readonly correlation: string
  readonly receiptRef: string
}

/** WT-02D.2A: retry's minimal availability result — checked, available, nothing to receipt. */
export interface CommandAvailable {
  readonly correlation: string
  readonly availability: 'available'
}

export type CommandResult = CommandDenied | CommandAccepted | CommandAvailable

/** What the route accepts: the transport retry probe or a full business intent. */
export type SageDispatchIntent = SageActionIntentV2 | { readonly type: 'retry' }

const INTENT_KEYS = ['matterId', 'revisionId', 'actionType', 'actionScope', 'payload', 'origin'] as const
const ACTION_SCOPES = ['matter', 'revision'] as const
const INTENT_ORIGINS = ['renderer-retry', 'renderer-action'] as const

function isPlainScalar(value: unknown): value is string | number | boolean {
  const t = typeof value
  return t === 'string' || t === 'number' || t === 'boolean'
}

/** Exact-keys parse; extra keys, nested payload values, and bad enums are invalid (fail closed). */
export function parseSageActionIntentV2(input: unknown): SageActionIntentV2 | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined
  const record = input as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== INTENT_KEYS.length || !INTENT_KEYS.every((k) => keys.includes(k))) return undefined
  if (!INTENT_KEYS.slice(0, 4).every((k) => typeof record[k] === 'string' && (record[k] as string).length > 0)) return undefined
  if (!ACTION_SCOPES.includes(record.actionScope as (typeof ACTION_SCOPES)[number])) return undefined
  if (!INTENT_ORIGINS.includes(record.origin as (typeof INTENT_ORIGINS)[number])) return undefined
  const payload = record.payload
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  for (const v of Object.values(payload)) if (!isPlainScalar(v)) return undefined
  return {
    matterId: record.matterId as string,
    revisionId: record.revisionId as string,
    actionType: record.actionType as string,
    actionScope: record.actionScope as SageActionIntentV2['actionScope'],
    payload: payload as Readonly<Record<string, string | number | boolean>>,
    origin: record.origin as SageActionIntentV2['origin'],
  }
}

/** Nine step ports plus a trusted clock. `undefined` means that step's provider is unavailable (fail closed). */
export interface CommandPipelinePorts {
  /** WT-02D.2A: retry's minimal availability check (active session + healthy policy). The retry
   * branch never reaches resolveIdentityPolicy; `undefined` = unavailable (fail closed). */
  readonly checkAuthorizationAvailability: () => { readonly ok: true } | undefined
  readonly resolveIdentityPolicy: (req: { readonly intent: SageDispatchIntent; readonly correlation: string }) => IdentityPolicyResolution | undefined
  readonly strictRehydrate: (req: { readonly matterId: string; readonly revisionId: string }) =>
    | { readonly matter: BusinessMatter; readonly current: boolean }
    | { readonly denied: 'not-found' | 'stale-revision' }
    | undefined
  readonly resolveTarget: (req: { readonly matter: BusinessMatter }) =>
    | { readonly targetRequirement: unknown }
    | { readonly denied: 'target-unavailable' }
    | undefined
  readonly resolveCompatibility: (req: { readonly targetRequirement: unknown }) =>
    | { readonly outcome: 'equivalent' }
    | { readonly denied: 'unknown' | 'requires-new-revision' }
    | undefined
  readonly resolveRegistry: (req: { readonly actionType: string }) =>
    | { readonly mapping: CapabilityRegistryOperationMappingV1 }
    | { readonly denied: 'registry-unavailable' | 'not-approved' }
    | undefined
  readonly preflightAvailability: (req: { readonly mapping: CapabilityRegistryOperationMappingV1 }) =>
    | { readonly ok: true }
    | { readonly denied: 'capability-unavailable' }
    | undefined
  readonly persistPreparation: (req: { readonly mapping: CapabilityRegistryOperationMappingV1; readonly correlation: string }) =>
    | { readonly persisted: true }
    | { readonly denied: 'persistence-unavailable' }
    | undefined
  readonly dispatchOperation: (req: { readonly mapping: CapabilityRegistryOperationMappingV1 }) =>
    | { readonly receipt: { readonly receiptRef: string } }
    | { readonly outcome: 'outcome-unknown' }
    | { readonly denied: 'cancelled-before-dispatch' }
    | undefined
  readonly now: () => string
}
