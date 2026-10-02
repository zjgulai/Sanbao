/** Live registry observation for the protocol v5 ready event (WT-02C.2E.3).
 *
 * The registry package (`@deepseek-ai/dsh-agent-preset-registry`) is not a shell
 * dependency, so the service is reached structurally: `ctx.get('agentPresets')` with
 * only the members the observation reads. The observer never throws — every failure
 * becomes an explicit `unavailable` reason, and the shared protocol validator decides
 * what may leave the process. */

import {
  isRuntimeEffectiveObservation,
  type RuntimeEffectiveObservation,
  type RuntimeEffectivePresetRow,
} from '../protocol.js'

/** Structural view of the live `agentPresets` service; only the read members. */
interface AgentPresetRegistryLike {
  readonly defaultId: string
  /** Bound reader: the service's own method must run with the service as its receiver. */
  readonly readRoster: () => Promise<unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function liveRegistry(ctx: unknown): AgentPresetRegistryLike | undefined {
  if (!isRecord(ctx)) return undefined
  const get = (ctx as { get?: unknown }).get
  if (typeof get !== 'function') return undefined
  let service: unknown
  try {
    service = (get as (this: unknown, name: string) => unknown).call(ctx, 'agentPresets')
  } catch {
    return undefined
  }
  if (!isRecord(service)) return undefined
  const defaultId = (service as { defaultId?: unknown }).defaultId
  const remoteExportList = (service as { remoteExportList?: unknown }).remoteExportList
  if (typeof defaultId !== 'string' || typeof remoteExportList !== 'function') return undefined
  // The registry method reads `this.list`/`this.defaultId`, so it must keep its receiver.
  return {
    defaultId,
    readRoster: () => (remoteExportList as (this: unknown) => Promise<unknown>).call(service),
  }
}

/** Keep only the observation's own fields; display metadata (name/description/order) is dropped. */
function normalizeRoster(raw: unknown): readonly RuntimeEffectivePresetRow[] | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.presets)) return undefined
  const rows: RuntimeEffectivePresetRow[] = []
  for (const item of raw.presets) {
    if (!isRecord(item)) return undefined
    const { id, isDefault, broken } = item
    if (typeof id !== 'string' || typeof isDefault !== 'boolean') return undefined
    if (broken !== undefined && typeof broken !== 'string') return undefined
    rows.push(Object.freeze({
      id,
      isDefault,
      ...(broken === undefined ? {} : { broken }),
    }))
  }
  return Object.freeze(rows)
}

/** Observe the runtime-effective roster from the live runtime context. */
export async function observeRuntimeEffective(ctx: unknown): Promise<RuntimeEffectiveObservation> {
  const registry = liveRegistry(ctx)
  if (registry === undefined) {
    return Object.freeze({ kind: 'unavailable', reason: 'registry-service-absent' } as const)
  }
  let raw: unknown
  try {
    raw = await registry.readRoster()
  } catch {
    return Object.freeze({ kind: 'unavailable', reason: 'observation-failed' } as const)
  }
  let rows: readonly RuntimeEffectivePresetRow[] | undefined
  try {
    rows = normalizeRoster(raw)
  } catch {
    rows = undefined
  }
  if (rows === undefined) {
    return Object.freeze({ kind: 'unavailable', reason: 'invalid-roster' } as const)
  }
  const observation: RuntimeEffectiveObservation = Object.freeze({
    kind: 'observed' as const,
    defaultPresetId: registry.defaultId,
    presets: rows,
  })
  return isRuntimeEffectiveObservation(observation)
    ? observation
    : Object.freeze({ kind: 'unavailable', reason: 'invalid-roster' } as const)
}
