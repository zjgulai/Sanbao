/** Ticket 017 (US-043/044/047): turn one `settings/describe` answer into the model-config view.
 *
 * Facts come from the base's own schema: each namespace carries `ns`, `revision`, `applies`
 * (`live` | `restart`), the layers that exist (`user` / `value`) and `secrets[{path,set}]`.
 * What the surface needs is *structure and state only* — never a value, never a secret, and never
 * the secret's key path. So this classifier reads the shape and drops every payload it sees; an
 * unreadable answer becomes `state: 'unavailable'` with a machine reason, never a guess.
 */
import { types as utilTypes } from 'node:util'

import type { ModelConfigNamespace, ModelConfigStatus } from '../appservice/contracts.js'

export type { ModelConfigNamespace, ModelConfigStatus }

const NAMESPACE_CAP = 64
const NS_MAX_LENGTH = 64
const APPLIES = ['live', 'restart'] as const

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  if (utilTypes.isProxy(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function unavailable(reason: ModelConfigStatus['reason']): ModelConfigStatus {
  return { source: 'settings-describe', state: 'unavailable', reason, writable: null, hasDocument: null, namespaces: [], connectivityTest: 'untested' }
}

function boundedName(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' && value === value.trim() && value.length <= NS_MAX_LENGTH
    && !value.includes('\u0000')
    ? value
    : undefined
}

/** Classify one bridge answer. Total: any shape at all produces a status, never a throw. */
export function classifySettingsDescribe(value: unknown): ModelConfigStatus {
  if (!isPlainRecord(value)) return unavailable('not-plain-data')
  if (typeof value.writable !== 'boolean' || typeof value.hasDocument !== 'boolean' || !Array.isArray(value.namespaces)) {
    return unavailable('not-plain-data')
  }
  const namespaces: ModelConfigNamespace[] = []
  for (const raw of value.namespaces.slice(0, NAMESPACE_CAP)) {
    if (!isPlainRecord(raw)) continue
    const ns = boundedName(raw.ns)
    if (ns === undefined || typeof raw.revision !== 'number' || !Number.isInteger(raw.revision)) continue
    const applies = APPLIES.find((candidate) => candidate === raw.applies)
    if (applies === undefined) continue
    let set = 0
    let total = 0
    if (Array.isArray(raw.secrets)) {
      for (const secret of raw.secrets) {
        if (!isPlainRecord(secret) || typeof secret.set !== 'boolean') continue
        total += 1
        if (secret.set) set += 1
      }
    }
    namespaces.push({
      ns,
      revision: raw.revision,
      applies,
      saved: raw.user !== undefined ? 'user' : raw.value !== undefined ? 'base-only' : 'none',
      secrets: { set, total },
    })
  }
  return {
    source: 'settings-describe',
    state: 'read',
    reason: null,
    writable: value.writable,
    hasDocument: value.hasDocument,
    namespaces,
    connectivityTest: 'untested',
  }
}

/** Map a bridge refusal (a typed `BridgeCallError` or anything else) onto the same shape.
 *  A refusal arrives as a class instance, so this reads `code` structurally rather than requiring
 *  a plain record — the payload of an error is never trusted, only its code. */
export function classifySettingsDescribeFailure(error: unknown): ModelConfigStatus {
  const code = typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : undefined
  return unavailable(code === undefined ? 'bridge-unavailable' : 'bridge-refused')
}
