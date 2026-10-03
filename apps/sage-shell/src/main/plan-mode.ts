/** Ticket 039 (US-192~194): the plan/goal mode over the base's own collaboration state.
 *
 * The rules the ticket names:
 *
 * - **The state is the service projection** (`session/plan-mode` reads the base's cropped
 *   `{active, pending}` view through `ctx.planMode`): `active` is the logged in-force state,
 *   `pending` says a selection awaits the next accepted pre-step. Nothing here re-derives it —
 *   and a matter with no session reads `no-session`, an unreadable one `unavailable`.
 * - **The switch is one named request** (`session/plan-mode-switch`): the receipt is the base's
 *   own outcome word plus its three-state family (applied / pending / unchanged). A queued
 *   selection is NOT shown as switched — the receipt carries the fresh post-switch view so the
 *   surface keeps showing the actual mode while the change is still pending.
 * - **No global default is ever written** (US-193): this store talks to exactly these two
 *   session endpoints; it never touches settings or any cross-matter record, so switching inside
 *   one matter cannot influence what a new matter starts from.
 * - **Failure is not success** (US-192/193): a missing provider, a dead session, or an
 *   unrecognised result is a named refusal — the receipt never fabricates a settled outcome.
 */
import { readFileSync } from 'node:fs'

import type { PlanModeSwitchReceipt, SessionPlanModeStatus } from '../appservice/contracts.js'
import type { BridgeCaller } from './workspace-adoption.js'

export interface PlanModeDeps {
  readonly callBridge: BridgeCaller
  readonly bindingsFile: string
  readonly now: () => string
}

export interface PlanModeStore {
  readonly read: (input: { readonly matterRef: string }) => Promise<SessionPlanModeStatus>
  readonly switch: (input: { readonly matterRef: string, readonly active: boolean }) => Promise<PlanModeSwitchReceipt>
}

const OUTCOMES = ['committed', 'queued', 'cancelled', 'noop'] as const
type PlanModeOutcome = (typeof OUTCOMES)[number]

const FAMILIES: Readonly<Record<PlanModeOutcome, 'applied' | 'pending' | 'unchanged'>> = {
  committed: 'applied',
  queued: 'pending',
  cancelled: 'unchanged',
  noop: 'unchanged',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function unwrap(value: unknown): { readonly ok: true, readonly result: unknown } | { readonly ok: false, readonly code: string } {
  if (isRecord(value) && value.ok === true) return { ok: true, result: value.result }
  if (isRecord(value) && value.ok === false && typeof value.code === 'string') return { ok: false, code: value.code }
  return { ok: false, code: 'plan-mode-unavailable' }
}

function viewOf(value: unknown): { readonly active: boolean, readonly pending: boolean } | null {
  if (!isRecord(value) || typeof value.active !== 'boolean' || typeof value.pending !== 'boolean') return null
  return { active: value.active, pending: value.pending }
}

export function createPlanMode(deps: PlanModeDeps): PlanModeStore {
  const readBindings = (): Record<string, string> => {
    try {
      const value = JSON.parse(readFileSync(deps.bindingsFile, 'utf8')) as unknown
      if (!isRecord(value)) return {}
      const out: Record<string, string> = {}
      for (const [key, entry] of Object.entries(value)) if (typeof entry === 'string' && entry !== '') out[key] = entry
      return out
    } catch {
      return {}
    }
  }

  const unavailable = (reason: string): SessionPlanModeStatus => ({ state: 'unavailable', reason, active: null, pending: false })

  const read = async (input: { readonly matterRef: string }): Promise<SessionPlanModeStatus> => {
    const sessionId = readBindings()[input.matterRef]
    if (sessionId === undefined) return { state: 'no-session', reason: null, active: null, pending: false }
    const answer = unwrap(await Promise.resolve(deps.callBridge('session/plan-mode', [{ sessionId }])).catch(() => ({ ok: false, code: 'plan-mode-unavailable' })))
    if (!answer.ok) return unavailable(answer.code)
    const view = viewOf(answer.result)
    if (view === null) return unavailable('plan-mode-unreadable')
    return { state: 'read', reason: null, active: view.active, pending: view.pending }
  }

  const switchMode = async (input: { readonly matterRef: string, readonly active: boolean }): Promise<PlanModeSwitchReceipt> => {
    const sessionId = readBindings()[input.matterRef]
    if (sessionId === undefined) return { state: 'refused', code: 'plan-mode-no-session' }
    const answer = unwrap(await Promise.resolve(deps.callBridge('session/plan-mode-switch', [{ sessionId, active: input.active }])).catch(() => ({ ok: false, code: 'plan-mode-unavailable' })))
    if (!answer.ok) return { state: 'refused', code: answer.code }
    const result = answer.result
    if (!isRecord(result)) return { state: 'refused', code: 'plan-mode-unreadable' }
    const outcome = OUTCOMES.find((candidate) => candidate === result.outcome)
    if (outcome === undefined) return { state: 'refused', code: 'plan-mode-unreadable' }
    // The fresh post-switch projection: a queued selection must keep displaying the actual mode.
    const view = await read({ matterRef: input.matterRef })
    const settled = view.state === 'read'
    return {
      state: 'settled',
      outcome,
      family: FAMILIES[outcome],
      view: settled ? { active: view.active === true, pending: view.pending } : null,
      viewCode: settled ? null : (view.reason ?? 'plan-mode-unreadable'),
      at: deps.now(),
    }
  }

  return { read, switch: switchMode }
}
