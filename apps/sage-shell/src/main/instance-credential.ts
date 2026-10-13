/**
 * ADR-0334: the instance credential port over the host bridge.
 *
 * Values are write-only end to end: this module never returns, logs, caches or echoes a secret,
 * and the describe half answers only presence/source/writability for the app-owned names. The
 * host handler keeps its own name allowlist; this port mirrors it so a bad name is refused
 * before any bridge call, and both directions require an identity session (a signed-out app
 * must not accept or probe secrets).
 */
import type { CredentialEntryView, CredentialOutcome } from '../appservice/contracts.js'

export type BridgeCaller = (endpoint: string, payload?: readonly unknown[]) => Promise<unknown>

/** The names this product addresses. Mirrors the host handler's allowlist deliberately: the
 *  describe loop and the write guard must agree, and the spec pins the agreement. */
export const APP_CREDENTIAL_NAMES: readonly string[] = ['DEEPSEEK_API_KEY']

type Answer = { readonly ok: true, readonly result: unknown } | { readonly ok: false, readonly code: string }

function asAnswer(value: unknown): Answer {
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === true) {
    return { ok: true, result: (value as { result?: unknown }).result }
  }
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === false
    && typeof (value as { code?: unknown }).code === 'string') {
    return { ok: false, code: (value as { code: string }).code }
  }
  return { ok: false, code: 'bridge-answer-unrecognised' }
}

async function callBridgeAnswer(
  callBridge: BridgeCaller,
  endpoint: string,
  payload: readonly unknown[],
): Promise<Answer> {
  // A refusal arrives two ways across the seam: a resolved {ok:false, code} answer, or a
  // rejected promise carrying {code} (the host-process bridge rejects failed calls). Both are
  // the honest named cause; collapsing the rejection into a blanket failure would hide it.
  try {
    return asAnswer(await callBridge(endpoint, payload))
  } catch (error) {
    const code = error !== null && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'bridge-unreachable'
    return { ok: false, code }
  }
}

function describeEntry(name: string, raw: unknown): CredentialEntryView {
  const record = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const source = record.source === 'env' || record.source === 'file' ? record.source : null
  return {
    name,
    configured: record.configured === true,
    source: record.configured === true ? source : null,
    writable: record.writable === true,
  }
}

export function createCredentials(callBridge: BridgeCaller, identitySession: () => unknown | null) {
  return async (request: {
    readonly action: 'describe' | 'set' | 'unset'
    readonly name: string
    readonly value?: string
  }): Promise<CredentialOutcome> => {
    if (identitySession() === null) {
      return { state: 'refused', code: 'credential-identity-unavailable', retryable: true }
    }
    // Per-name authorization is the host's call (fixed set ∪ refs declared by saved model
    // routes); the route parser already enforced the POSIX ref grammar at the boundary. The
    // earlier fixed-name gate here made declared refs unreachable — caught by the 018-closeout
    // live proof (the "written but never exercised" class).
    if (request.action === 'describe') {
      // One requested name per read: the instance card asks for its fixed name, the model rows
      // ask for their declared refs. The host answers presence/source for whatever name the
      // route accepted.
      const answer = await callBridgeAnswer(callBridge, 'credentials/describe', [{ name: request.name }])
      if (!answer.ok) return { state: 'refused', code: answer.code, retryable: true }
      return { state: 'read', entries: [describeEntry(request.name, answer.result)] }
    }
    if (request.action === 'unset') {
      const answer = await callBridgeAnswer(callBridge, 'credentials/unset', [{ name: request.name }])
      if (!answer.ok) return { state: 'refused', code: answer.code, retryable: true }
      return { state: 'removed', name: request.name }
    }
    // The value never leaves this call frame: no local state, no log line, no echo.
    const answer = await callBridgeAnswer(callBridge, 'credentials/set', [{ name: request.name, value: request.value ?? '' }])
    if (!answer.ok) return { state: 'refused', code: answer.code, retryable: true }
    return { state: 'saved', name: request.name }
  }
}
