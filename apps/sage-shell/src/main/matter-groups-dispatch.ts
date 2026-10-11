/** L1-B (ADR-0321): the matter-groups dispatch step — the group commands over the same
 *  governance-family discipline as the admin dispatch: cheap per-op guards (not-dispatched),
 *  the live re-verification subset, then the provider call with its own receipt mapping.
 *  Membership stays row-by-row (the store's own per-target verdicts); nothing "succeeds" as a
 *  banner. No retry happens here.
 */
import type { MatterGroupsOutcome } from '../appservice/contracts.js'
import type { MatterGovernanceAdmissionPorts } from '../appservice/matter-governance-admission.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'

export interface MatterGroupsDispatchOptions {
  readonly create: (request: { readonly name: string, readonly targets?: readonly string[] }) => MatterGroupsOutcome
  readonly rename: (request: { readonly groupId: string, readonly name: string }) => MatterGroupsOutcome
  readonly remove: (request: { readonly groupId: string }) => MatterGroupsOutcome
  readonly membership: (request: {
    readonly groupId: string
    readonly operation: 'add' | 'remove'
    readonly targets: readonly string[]
  }) => MatterGroupsOutcome | Promise<MatterGroupsOutcome>
  /** Live reads for the pre-call re-verification; missing facts fail closed. */
  readonly readContext: () => {
    readonly sessionRef: string
    readonly matterRef: string
    readonly revisionRef: string
    readonly contextGeneration: number
    readonly frameGeneration: number
  } | null
  readonly readIdentitySession: () => { readonly sessionRef: string } | null
  readonly readFrame: () => { readonly generation: number, readonly ready: boolean, readonly contaminated: boolean } | undefined
}

function isRef(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096
}

const MAX_NAME = 200
const MAX_TARGETS = 100

type PreparedDispatch =
  | { readonly op: 'matter.groups.create', readonly name: string, readonly targets: readonly string[] | undefined }
  | { readonly op: 'matter.groups.rename', readonly groupId: string, readonly name: string }
  | { readonly op: 'matter.groups.remove', readonly groupId: string }
  | { readonly op: 'matter.groups.membership', readonly groupId: string, readonly operation: 'add' | 'remove', readonly targets: readonly string[] }

function prepare(operation: string, payload: Readonly<Record<string, unknown>>): PreparedDispatch | undefined {
  if (operation === 'matter.groups.create') {
    const name = payload.name
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > MAX_NAME) return undefined
    const targets = payload.targets
    if (targets !== undefined) {
      if (!Array.isArray(targets) || targets.length > MAX_TARGETS || !targets.every((target) => isRef(target))) return undefined
    }
    return { op: 'matter.groups.create', name, targets: targets as readonly string[] | undefined }
  }
  if (operation === 'matter.groups.rename') {
    const groupId = payload.groupId
    const name = payload.name
    if (!isRef(groupId) || typeof name !== 'string' || name.trim().length === 0 || name.length > MAX_NAME) return undefined
    return { op: 'matter.groups.rename', groupId, name }
  }
  if (operation === 'matter.groups.remove') {
    const groupId = payload.groupId
    if (!isRef(groupId)) return undefined
    return { op: 'matter.groups.remove', groupId }
  }
  if (operation === 'matter.groups.membership') {
    const groupId = payload.groupId
    const membershipOperation = payload.operation
    const targets = payload.targets
    if (!isRef(groupId)) return undefined
    if (membershipOperation !== 'add' && membershipOperation !== 'remove') return undefined
    if (!Array.isArray(targets) || targets.length === 0 || targets.length > MAX_TARGETS) return undefined
    if (!targets.every((target) => isRef(target))) return undefined
    return { op: 'matter.groups.membership', groupId, operation: membershipOperation, targets: targets as readonly string[] }
  }
  return undefined
}

export function createMatterGroupsDispatchPort(
  options: MatterGroupsDispatchOptions,
): NonNullable<MatterGovernanceAdmissionPorts['dispatch']> {
  return async ({ intent, context }) => {
    if (ACTION_AUTHORITY_TABLE[intent.operation] === undefined) return { state: 'not-dispatched' }

    const prepared = prepare(intent.operation, intent.payload)
    if (prepared === undefined) return { state: 'not-dispatched' }

    const live = options.readContext()
    if (live === null) return { state: 'not-dispatched' }
    if (live.sessionRef !== context.sessionRef
      || live.matterRef !== context.matterRef
      || live.revisionRef !== context.revisionRef
      || live.contextGeneration !== Number(context.generation)) {
      return { state: 'not-dispatched' }
    }
    const identitySession = options.readIdentitySession()
    if (identitySession === null || identitySession.sessionRef !== context.sessionRef) return { state: 'not-dispatched' }
    const frame = options.readFrame()
    if (frame === undefined || !frame.ready || frame.contaminated) return { state: 'not-dispatched' }
    if (frame.generation !== live.frameGeneration) return { state: 'not-dispatched' }

    try {
      if (prepared.op === 'matter.groups.create') {
        const outcome = options.create({
          name: prepared.name,
          ...(prepared.targets === undefined ? {} : { targets: prepared.targets }),
        })
        if (outcome.state === 'refused') return { state: 'refused', code: outcome.code }
        if (outcome.state !== 'created') return { state: 'outcome-unknown' }
        return {
          state: 'receipt',
          receiptRef: `receipt:matter-group-create:${prepared.name}`,
          detail: { kind: 'matter-group-created', name: prepared.name, status: outcome.status },
        }
      }
      if (prepared.op === 'matter.groups.rename') {
        const outcome = options.rename({ groupId: prepared.groupId, name: prepared.name })
        if (outcome.state === 'refused') return { state: 'refused', code: outcome.code }
        if (outcome.state !== 'renamed') return { state: 'outcome-unknown' }
        return {
          state: 'receipt',
          receiptRef: `receipt:matter-group-rename:${prepared.groupId}`,
          detail: { kind: 'matter-group-renamed', groupId: prepared.groupId, name: prepared.name, status: outcome.status },
        }
      }
      if (prepared.op === 'matter.groups.remove') {
        const outcome = options.remove({ groupId: prepared.groupId })
        if (outcome.state === 'refused') return { state: 'refused', code: outcome.code }
        if (outcome.state !== 'removed') return { state: 'outcome-unknown' }
        return {
          state: 'receipt',
          receiptRef: `receipt:matter-group-remove:${prepared.groupId}`,
          detail: { kind: 'matter-group-removed', groupId: prepared.groupId, status: outcome.status },
        }
      }
      const outcome = await options.membership({
        groupId: prepared.groupId,
        operation: prepared.operation,
        targets: prepared.targets,
      })
      if (outcome.state === 'refused') return { state: 'refused', code: outcome.code }
      if (outcome.state !== 'batch') return { state: 'outcome-unknown' }
      return {
        state: 'receipt',
        receiptRef: `receipt:matter-group-membership:${prepared.groupId}`,
        detail: { kind: 'matter-group-membership', groupId: prepared.groupId, operation: prepared.operation, status: outcome.status },
      }
    } catch {
      return { state: 'outcome-unknown' }
    }
  }
}
