/** Host-side executor for the main-originated read-only bridge (ticket 050). */

import { types as utilTypes } from 'node:util'

import { READONLY_BRIDGE_ENDPOINTS } from '../protocol.js'

export { READONLY_BRIDGE_ENDPOINTS }

/** Normalized outcome carried back to Electron over the Node IPC channel. */
export type ReadOnlyBridgeOutcome
  = { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly code: string }

export interface ReadOnlyBridgeContext {
  get(name: string): unknown
}

/** Provider shape mounted by @deepseek-ai/dsh-api-settings-controller (typert.host.js registers service `settingsController`). */
interface SettingsDescribeProvider {
  describe(): unknown
}

/**
 * Own-property entries in the exact order JSON would carry them.
 * @returns string-keyed enumerable value entries, or undefined when anything would be dropped or reinterpreted.
 */
function plainEntries(value: object): readonly [string, unknown][] | undefined {
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const entries: [string, unknown][] = []
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') return undefined
    const descriptor = descriptors[key]
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) return undefined
    entries.push([key, descriptor.value])
  }
  return entries
}

/**
 * True only for values that cross the bridge unchanged.
 * JSON would silently drop functions, symbols, bigints, `undefined`, non-enumerable and symbol-keyed
 * members, sparse holes, and turn non-finite numbers into `null` — so those are refused instead of shipped.
 */
function isPlainData(value: unknown, parents: Set<object>): boolean {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || parents.has(value) || utilTypes.isProxy(value)) return false
  parents.add(value)
  try {
    if (Array.isArray(value)) {
      // Subclassed arrays and extra index-less members would not survive as the array the consumer expects.
      if (Object.getPrototypeOf(value) !== Array.prototype) return false
      if (Object.keys(value).length !== value.length) return false
      return value.every((item) => isPlainData(item, parents))
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    const entries = plainEntries(value)
    if (entries === undefined) return false
    return entries.every(([, item]) => isPlainData(item, parents))
  } finally {
    parents.delete(value)
  }
}

/**
 * Execute one allowlisted read-only call against the booted context.
 * @param ctx - Host context that may or may not carry the requested provider.
 * @param endpoint - logical endpoint, e.g. `settings/describe`.
 * @returns the normalized outcome; a refusal never touches a provider.
 */
export async function resolveReadOnlyCall(ctx: ReadOnlyBridgeContext, endpoint: string): Promise<ReadOnlyBridgeOutcome> {
  if (!READONLY_BRIDGE_ENDPOINTS.has(endpoint)) return { ok: false, code: 'bridge-endpoint-unsupported' }
  const provider = ctx.get('settingsController') as Partial<SettingsDescribeProvider> | undefined
  if (typeof provider?.describe !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
  let value: unknown
  try {
    value = await provider.describe()
  } catch {
    return { ok: false, code: 'bridge-provider-failed' }
  }
  // A value that could not cross unchanged is a refusal, never a truncated view of the provider.
  return isPlainData(value, new Set<object>())
    ? { ok: true, result: value }
    : { ok: false, code: 'bridge-result-not-plain-data' }
}
