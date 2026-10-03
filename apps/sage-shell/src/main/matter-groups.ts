/** Ticket 049 (FW-041, US-225/226): task groups — a Sage-owned ORGANIZATION object.
 *
 * The two rules the ticket names:
 *
 * - **Named commands with their own receipts, nothing implicit.** Create / rename / remove each
 *   answer with their own receipt state and read-back; assigning membership NEVER mints a group
 *   (`group-unknown` instead), an unknown item is refused per row, and a membership batch answers
 *   row by row with no “overall success” anywhere.
 * - **Organization only.** The store writes nothing but its own member sets. No fact, no visible
 *   scope, no responsibility and no permission follows from a group change — and this module is
 *   deliberately given no port through which it could infer or consult any of them; its only dep
 *   beyond the clock and the id source is the known-item gate used to refuse unknown targets.
 */
import type {
  MatterGroupBatchView,
  MatterGroupEntry,
  MatterGroupMemberRow,
  MatterGroupRenameView,
  MatterGroupsOutcome,
  MatterGroupsStatus,
  MatterGroupTrailRecord,
} from '../appservice/contracts.js'

const MAX_NAME = 120
const MAX_TARGETS = 32
const MAX_TRAIL = 512

export interface MatterGroupsDeps {
  readonly now: () => string
  readonly nextId: () => string
  /** Whether the matter list holds this itemId. Unknown and unauthorized share one refusal
   *  code — a group refusal never enumerates. */
  readonly knownItem: (itemId: string) => boolean
}

export interface MatterGroupsStore {
  readonly list: () => MatterGroupsStatus
  /** Named create with its own receipt; member targets ride the same request, row by row. */
  readonly create: (request: { readonly name: string, readonly targets?: readonly string[] }) => MatterGroupsOutcome
  readonly rename: (request: { readonly groupId: string, readonly name: string }) => MatterGroupsOutcome
  readonly remove: (request: { readonly groupId: string }) => MatterGroupsOutcome
  /** Batch membership — per-row verdicts, never a banner; unknown group refuses, never mints. */
  readonly assign: (request: { readonly groupId: string, readonly operation: 'add' | 'remove', readonly targets: readonly string[] }) => MatterGroupsOutcome
}

function nameOf(request: { readonly name: string }): string | null {
  const name = request.name.trim()
  if (name === '' || name.length > MAX_NAME) return null
  return name
}

export function createMatterGroups(deps: MatterGroupsDeps): MatterGroupsStore {
  const groups = new Map<string, { groupId: string, name: string, memberIds: Set<string>, createdAt: string, updatedAt: string }>()
  const trail: MatterGroupTrailRecord[] = []
  let lastRename: MatterGroupRenameView | null = null
  let lastBatch: MatterGroupBatchView | null = null

  const note = (record: MatterGroupTrailRecord): void => {
    trail.push(record)
    if (trail.length > MAX_TRAIL) trail.shift()
  }

  const status = (): MatterGroupsStatus => ({
    state: 'read',
    code: null,
    groups: [...groups.values()].map((group): MatterGroupEntry => ({
      groupId: group.groupId,
      name: group.name,
      memberIds: [...group.memberIds],
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    })),
    trail: [...trail],
    rename: lastRename,
    batch: lastBatch,
  })

  /** Row-by-row membership verdicts. Membership is checked before the known-item gate so a
   *  member that vanished from the list can still be removed (its record is organization,
   *  not list truth). */
  const membershipRows = (
    request: { readonly operation: 'add' | 'remove', readonly targets: readonly string[] },
    memberIds: Set<string>,
  ): readonly MatterGroupMemberRow[] => request.targets.map((itemId): MatterGroupMemberRow => {
    if (request.operation === 'add') {
      if (memberIds.has(itemId)) return { itemId, outcome: 'unchanged', code: 'already-member' }
      if (!deps.knownItem(itemId)) return { itemId, outcome: 'refused', code: 'item-unknown' }
      memberIds.add(itemId)
      return { itemId, outcome: 'ok', code: null }
    }
    if (memberIds.has(itemId)) {
      memberIds.delete(itemId)
      return { itemId, outcome: 'ok', code: null }
    }
    if (!deps.knownItem(itemId)) return { itemId, outcome: 'refused', code: 'item-unknown' }
    return { itemId, outcome: 'unchanged', code: 'not-member' }
  })

  return {
    list: status,

    create(request) {
      const name = nameOf(request)
      if (name === null) return { state: 'refused', code: 'group-name-invalid' }
      const targets = request.targets ?? []
      if (targets.length > MAX_TARGETS) return { state: 'refused', code: 'batch-size-invalid' }
      const groupId = deps.nextId()
      const memberIds = new Set<string>()
      const rows = membershipRows({ operation: 'add', targets }, memberIds)
      const at = deps.now()
      groups.set(groupId, { groupId, name, memberIds, createdAt: at, updatedAt: at })
      // 建立是可回执的具名命令；成员入组逐项判定，未知目标逐项拒绝（不隐式产生）。
      note({ at, action: 'create', groupId, name, count: memberIds.size })
      if (rows.length > 0) {
        const okCount = rows.filter((row) => row.outcome === 'ok').length
        const unchangedCount = rows.filter((row) => row.outcome === 'unchanged').length
        lastBatch = { operation: 'add', groupId, rows, okCount, unchangedCount, refusedCount: rows.length - okCount - unchangedCount }
      }
      return { state: 'created', status: status() }
    },

    rename(request) {
      const group = groups.get(request.groupId)
      if (group === undefined) return { state: 'refused', code: 'group-unknown' }
      const name = nameOf(request)
      if (name === null) return { state: 'refused', code: 'group-name-invalid' }
      group.name = name
      group.updatedAt = deps.now()
      // 回读值才是生效值：请求字符串绝不冒充生效（US-225）。
      lastRename = { groupId: group.groupId, requested: request.name.trim(), effective: name, at: group.updatedAt }
      note({ at: group.updatedAt, action: 'rename', groupId: group.groupId, name, count: 0 })
      return { state: 'renamed', status: status() }
    },

    remove(request) {
      const group = groups.get(request.groupId)
      if (group === undefined) return { state: 'refused', code: 'group-unknown' }
      // 移除的是组织对象本身：事项事实、可见范围与责任不因移除而改变（US-226）。
      groups.delete(group.groupId)
      note({ at: deps.now(), action: 'remove', groupId: group.groupId, name: group.name, count: group.memberIds.size })
      return { state: 'removed', status: status() }
    },

    assign(request) {
      const group = groups.get(request.groupId)
      // 不隐式产生：对未知分组的操作被拒绝，绝不静默建档。
      if (group === undefined) return { state: 'refused', code: 'group-unknown' }
      if (request.targets.length === 0 || request.targets.length > MAX_TARGETS) {
        return { state: 'refused', code: 'batch-size-invalid' }
      }
      const rows = membershipRows(request, group.memberIds)
      const okCount = rows.filter((row) => row.outcome === 'ok').length
      const unchangedCount = rows.filter((row) => row.outcome === 'unchanged').length
      lastBatch = { operation: request.operation, groupId: group.groupId, rows, okCount, unchangedCount, refusedCount: rows.length - okCount - unchangedCount }
      if (okCount > 0) {
        group.updatedAt = deps.now()
        note({
          at: group.updatedAt,
          action: request.operation === 'add' ? 'add-members' : 'remove-members',
          groupId: group.groupId,
          name: group.name,
          count: okCount,
        })
      }
      return { state: 'batch', status: status() }
    },
  }
}
