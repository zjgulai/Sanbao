/** Ticket 029 (FW-030, US-150~154): matter administration — recoverable archive, service-
 *  adjudicated rename, per-target batch.
 *
 * The three rules the ticket names:
 *
 * - **Archive retires from the active list and nothing else.** It never stops a run, never
 *   releases an open responsibility, never widens a read scope and never deletes a record; the
 *   state is recoverable, and the truly-destructive delete is a separate governed flow with no
 *   entry here. Archive state is neither the session's pause fact nor any hide preference.
 * - **Rename is adjudicated, and the read-back value is what counts.** The service port decides;
 *   the view carries the value read back after the change — the requested string is never
 *   projected as if it had taken effect. Production leaves the port unwired (custody owns the
 *   formal record), which answers its own not-ready code.
 * - **Batch answers row by row.** Every target gets its own verdict and nothing is skipped
 *   silently; there is no "overall success" anywhere in the shape.
 */
import type {
  MatterAdminOutcome,
  MatterAdminStatus,
  MatterAdminTrailRecord,
  MatterArchiveEntry,
  MatterBatchResult,
  MatterBatchRow,
  MatterBatchView,
  MatterRenameResult,
} from '../appservice/contracts.js'

const MAX_BATCH = 32
const MAX_TITLE = 200
const MAX_TRAIL = 512

export interface MatterAdminDeps {
  readonly now: () => string
  /** Whether the service holds any record for this matterRef. Absent and unauthorized share the
   *  same refusal code (no existence leak). */
  readonly knownMatter: (matterRef: string) => boolean
  /** The service-adjudicated rename. `undefined` (unwired) is its own not-ready answer. */
  readonly renameMatter?: (request: { readonly matterRef: string, readonly title: string }) =>
    { readonly effectiveTitle: string } | { readonly denied: string } | undefined
}

export interface MatterAdminStore {
  readonly list: () => MatterAdminStatus
  readonly isArchived: (matterRef: string) => boolean
  readonly archive: (request: { readonly matterRef: string, readonly ground: 'completed' | 'stopped' }) => MatterAdminOutcome
  readonly restore: (request: { readonly matterRef: string }) => MatterAdminOutcome
  readonly batch: (request: {
    readonly operation: 'archive' | 'restore'
    readonly targets: readonly string[]
    readonly ground?: 'completed' | 'stopped'
  }) => MatterBatchResult
  readonly rename: (request: { readonly matterRef: string, readonly title: string }) => MatterRenameResult
}

export function createMatterAdmin(deps: MatterAdminDeps): MatterAdminStore {
  const entries = new Map<string, MatterArchiveEntry>()
  const trail: MatterAdminTrailRecord[] = []
  let lastRename: MatterAdminStatus['rename'] = null
  let lastBatch: MatterBatchView | null = null

  const note = (record: MatterAdminTrailRecord): void => {
    trail.push(record)
    if (trail.length > MAX_TRAIL) trail.shift()
  }

  const status = (): MatterAdminStatus => ({
    state: 'read',
    entries: [...entries.values()],
    trail: [...trail],
    rename: lastRename,
    batch: lastBatch,
  })

  const archiveOne = (matterRef: string, ground: 'completed' | 'stopped'): { readonly ok: true } | { readonly code: string } => {
    // Absent and unauthorized answer with the same code: an archive refusal must not enumerate.
    if (!deps.knownMatter(matterRef)) return { code: 'matter-unknown' }
    if (entries.has(matterRef)) return { ok: true }
    entries.set(matterRef, { matterRef, archivedAt: deps.now(), ground })
    note({ at: deps.now(), action: 'archive', matterRef, ground })
    return { ok: true }
  }

  const restoreOne = (matterRef: string): { readonly ok: true } | { readonly code: string } => {
    if (!entries.has(matterRef)) return { code: 'not-archived' }
    entries.delete(matterRef)
    note({ at: deps.now(), action: 'restore', matterRef, ground: null })
    return { ok: true }
  }

  return {
    list: status,
    isArchived: (matterRef) => entries.has(matterRef),

    archive(request) {
      // 恢复只恢复列表呈现（D-029）；归档本身不结束运行、不解除责任、不扩大读取——这里除了
      // 自己的记录什么都不写，其他事实由读态逐槽断言保持不变。
      const outcome = archiveOne(request.matterRef, request.ground)
      if ('code' in outcome) return { state: 'refused', code: outcome.code }
      return { state: 'ok', status: status() }
    },

    restore(request) {
      const outcome = restoreOne(request.matterRef)
      if ('code' in outcome) return { state: 'refused', code: outcome.code }
      return { state: 'ok', status: status() }
    },

    batch(request) {
      if (request.targets.length === 0 || request.targets.length > MAX_BATCH) {
        return { state: 'refused', code: 'batch-size-invalid' }
      }
      if (request.operation === 'archive' && request.ground === undefined) {
        return { state: 'refused', code: 'archive-ground-required' }
      }
      const rows: MatterBatchRow[] = []
      for (const matterRef of request.targets) {
        const outcome = request.operation === 'archive'
          ? archiveOne(matterRef, request.ground as 'completed' | 'stopped')
          : restoreOne(matterRef)
        rows.push('code' in outcome
          ? { matterRef, outcome: 'refused', code: outcome.code }
          : { matterRef, outcome: 'ok', code: null })
      }
      const okCount = rows.filter((row) => row.outcome === 'ok').length
      // Row by row, with counts — never a single “all succeeded” flag (US-153).
      lastBatch = { operation: request.operation, rows, okCount, refusedCount: rows.length - okCount }
      return { state: 'batch', status: status() }
    },

    rename(request) {
      const title = request.title.trim()
      if (title === '' || title.length > MAX_TITLE) return { state: 'refused', code: 'rename-title-invalid' }
      const port = deps.renameMatter
      if (port === undefined) return { state: 'refused', code: 'matter-rename-unavailable' }
      const outcome = port({ matterRef: request.matterRef, title })
      if (outcome === undefined) return { state: 'refused', code: 'matter-rename-unavailable' }
      if ('denied' in outcome) return { state: 'refused', code: outcome.denied }
      // 裁决后的回读值才是生效值；请求字符串绝不冒充生效（US-152）。
      lastRename = {
        matterRef: request.matterRef,
        requested: title,
        effective: outcome.effectiveTitle,
        at: deps.now(),
      }
      return { state: 'renamed', status: status() }
    },
  }
}
