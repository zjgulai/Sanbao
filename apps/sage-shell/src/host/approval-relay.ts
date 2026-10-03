/** Ticket 041 (US-197~199): the host-side answerer relay for `approval/request`.
 *
 * The base raises an approval question through the scoped `approval/request` waterfall;
 * `ApprovalService.request()` blocks until an answerer returns one closed outcome
 * (`allowed-once | rejected | cancelled | unavailable`), then logs the durable audit pair
 * (`approval/asked` … `approval/decided`). In the official desktop that answerer is the
 * connected webview's permission card; in Sage the Shell IS the client, so the host process
 * registers its own listener and relays each question to Electron main:
 *
 *   request() ──waterfall──▶ this relay ──registered（session/approvals 可读）──▶ main UI
 *                              ▲                                                 │
 *                              └──── resolve（session/approve / …withdraw）◀──────┘
 *
 * Deliberate properties:
 *
 * - **Claim or delegate.** Only a request carrying an agent (its id IS the session id — the base
 *   declares agent/session as one id) can be routed to a matter, so only those are claimed; every
 *   other request falls through with `next()` and keeps whatever answerer the profile composes.
 * - **Registration order matters at runtime**: a profile-composed answerer may register before
 *   this module, so the listener is installed with `prepend: true` to make the Shell's relay run
 *   first; a queued-but-never-consumed remote dispatch would otherwise swallow the question.
 * - **The only answers are the two user decisions.** A grant is `allowed-once` — the base's
 *   one-shot vocabulary; the relay NEVER manufactures a grant and never resolves with anything
 *   but the two decision words. `unavailable` stays the service's fail-closed outcome for a
 *   missing/throwing answerer, and an aborted wait becomes `cancelled` — never an approval.
 * - **Withdrawal is the closed `cancelled` outcome** (US-198): the service's own vocabulary
 *   accepts `cancelled` from an answerer exactly like an abort would, so a wait is withdrawn by
 *   resolving it `cancelled` — the base then logs the decision pair and the tool stays undespatched.
 *   Every claimed wait is withdrawable through this relay; an asker-side abort is also observed
 *   and settles the same entry.
 */

/** One live pending approval, as main may read it. Plain data only. */
export interface RelayApprovalRecord {
  readonly requestId: string
  readonly sessionId: string
  /** The tool whose operation awaits the decision (the requested scope). */
  readonly toolName: string
  /** The exact tool call being decided, when the asker had one. */
  readonly callId: string | null
  /** The asker's explanation of why it is asking (the request's source note). */
  readonly reason: string | null
  /** Whether this wait can be withdrawn — true for every wait this relay holds. */
  readonly withdrawable: boolean
  readonly raisedAt: string
}

export type RelayApprovalAnswerOutcome = { readonly ok: true } | { readonly ok: false, readonly code: string }

export interface ApprovalRelay {
  /** Claim one request for the shell UI; `undefined` means "not ours — delegate to `next()`". */
  claim(request: { readonly agent?: { readonly id?: unknown }, readonly toolName?: unknown, readonly callId?: unknown, readonly reason?: unknown, readonly signal?: AbortSignal }): Promise<string> | undefined
  /** Live pending approvals for one session id (agent id = session id). */
  list(sessionId: string): { readonly pending: readonly RelayApprovalRecord[] }
  /** Resolve one pending waterfall with a user decision — exactly `allowed-once` or `rejected`. */
  answer(requestId: string, outcome: unknown): RelayApprovalAnswerOutcome
  /** Withdraw one pending wait by resolving the closed `cancelled` outcome (never a grant). */
  withdraw(requestId: string): RelayApprovalAnswerOutcome
  /** Settle every pending waterfall as `cancelled` (host teardown); late answers answer not-found. */
  dispose(): void
}

export interface ApprovalRelayDeps {
  readonly now: () => string
  readonly mintId: () => string
}

const MAX_ID_CHARS = 128
const MAX_TOOL_CHARS = 256
const MAX_REASON_CHARS = 4096
/** The only two outcomes a user decision may carry; `allowed-once` is the base's sole grant. */
const DECISIONS = ['allowed-once', 'rejected'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > max) return undefined
  return trimmed
}

export function createApprovalRelay(deps: ApprovalRelayDeps): ApprovalRelay {
  interface Entry {
    readonly requestId: string
    readonly sessionId: string
    readonly toolName: string
    readonly callId: string | null
    readonly reason: string | null
    readonly withdrawable: boolean
    readonly raisedAt: string
    readonly resolve: (outcome: string) => void
    readonly signal?: AbortSignal
    readonly onAbort?: () => void
  }
  const entries = new Map<string, Entry>()

  const settle = (entry: Entry): void => {
    entries.delete(entry.requestId)
    if (entry.signal !== undefined && entry.onAbort !== undefined) entry.signal.removeEventListener('abort', entry.onAbort)
  }

  return {
    claim(request) {
      const agentId = isRecord(request) && isRecord(request.agent) ? boundedText(request.agent.id, MAX_ID_CHARS) : undefined
      if (agentId === undefined) return undefined
      const toolName = boundedText(request.toolName, MAX_TOOL_CHARS)
      if (toolName === undefined) return undefined
      const callId = request.callId === undefined ? null : (boundedText(request.callId, MAX_ID_CHARS) ?? null)
      const reason = request.reason === undefined ? null : (boundedText(request.reason, MAX_REASON_CHARS) ?? null)
      const requestId = deps.mintId()
      let resolve!: (outcome: string) => void
      const promise = new Promise<string>((res) => {
        resolve = res
      })
      const entry: Entry = {
        requestId,
        sessionId: agentId,
        toolName,
        callId,
        reason,
        withdrawable: true,
        raisedAt: deps.now(),
        resolve,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      }
      if (request.signal !== undefined) {
        const onAbort = (): void => {
          // The service's own race settles `cancelled` when the signal aborts; resolving here too
          // keeps this promise settled (a late resolution is discarded by the already-closed race).
          settle(entry)
          resolve('cancelled')
        }
        ;(entry as { onAbort?: () => void }).onAbort = onAbort
        request.signal.addEventListener('abort', onAbort, { once: true })
        if (request.signal.aborted) {
          settle(entry)
          resolve('cancelled')
          return promise
        }
      }
      entries.set(requestId, entry)
      return promise
    },

    list(sessionId) {
      const pending: RelayApprovalRecord[] = []
      for (const entry of entries.values()) {
        if (entry.sessionId !== sessionId) continue
        pending.push({
          requestId: entry.requestId,
          sessionId: entry.sessionId,
          toolName: entry.toolName,
          callId: entry.callId,
          reason: entry.reason,
          withdrawable: entry.withdrawable,
          raisedAt: entry.raisedAt,
        })
      }
      return { pending }
    },

    answer(requestId, outcome) {
      const entry = entries.get(requestId)
      if (entry === undefined) return { ok: false, code: 'approval-not-found' }
      const decision = DECISIONS.find((candidate) => candidate === outcome)
      // The closed decision vocabulary: anything else (including 'allowed-once'-lookalikes) is
      // refused here, so no rogue value can ride the waterfall out of this relay.
      if (decision === undefined) return { ok: false, code: 'approval-outcome-invalid' }
      settle(entry)
      entry.resolve(decision)
      return { ok: true }
    },

    withdraw(requestId) {
      const entry = entries.get(requestId)
      if (entry === undefined) return { ok: false, code: 'approval-not-found' }
      settle(entry)
      // `cancelled` is part of the base's closed outcome vocabulary; resolving it withdraws the
      // wait (the tool remains undespatched) and a late answer can no longer reach the asker.
      entry.resolve('cancelled') // withdraw
      return { ok: true }
    },

    dispose() {
      for (const entry of [...entries.values()]) {
        settle(entry)
        // Teardown is fail-closed: a pending wait becomes `cancelled`, never a grant.
        entry.resolve('cancelled')
      }
    },
  }
}

/** The Cordis surface the installer needs; kept structural so this module stays importable without the base. */
export interface RelayHostContext {
  readonly provide: (name: string, value: unknown) => unknown
}

/** Where the relay is reachable for the bridge (`bridge-endpoints.ts` reads it via `ctx.get`). */
export const APPROVAL_RELAY_SERVICE = 'sageApprovalRelay'

type RelayListener = (request: unknown, next: () => Promise<string>) => Promise<string>

/**
 * Install the relay as the shell's answerer. `prepend` matters: a profile-composed remote
 * answerer may already be registered, and a waterfall listener earlier in the chain could
 * swallow the question into a stream no client consumes.
 */
export function installApprovalRelay(ctx: RelayHostContext, relay: ApprovalRelay): void {
  ctx.provide(APPROVAL_RELAY_SERVICE, relay)
  const host = ctx as unknown as { on(name: string, listener: RelayListener, options?: { prepend?: boolean }): unknown }
  host.on('approval/request', (request, next) => {
    const claimed = relay.claim(request as Parameters<ApprovalRelay['claim']>[0])
    return claimed === undefined ? next() : claimed
  }, { prepend: true })
}
