/**
 * ADR-0334: the one instance credential the product writes (`DEEPSEEK_API_KEY`) — the
 * backend key the built-in model uses for every local session.
 *
 * Shape mirrors the device-preferences seam: an injectable fetcher keeps specs and the page
 * glue on the same narrow port. The read half never carries a value (the route cannot return
 * one); the write half sends the value once and only reports the named outcome — no echo,
 * no local cache, no log.
 */
import { SAGE_CREDENTIALS_PATH, SAGE_REQUEST_TIMEOUT_MS } from '../../contracts.js'

export const INSTANCE_CREDENTIAL_NAME = 'DEEPSEEK_API_KEY' as const

export type InstanceCredentialRead =
  | { readonly kind: 'loading' }
  | {
    readonly kind: 'read'
    readonly configured: boolean
    /** The layer currently supplying the value ('env' = process environment, 'file' = local
     *  credential store, other = a provider-reported fallback layer). Null while unconfigured. */
    readonly source: string | null
    readonly writable: boolean
  }
  | { readonly kind: 'unavailable', readonly code: string }

export type InstanceCredentialSaveOutcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'refused', readonly code: string }
  | { readonly kind: 'unreachable' }

export interface InstanceCredentialController {
  read(): Promise<InstanceCredentialRead>
  save(value: string): Promise<InstanceCredentialSaveOutcome>
}

type InstanceCredentialFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function postCredential(
  body: { readonly action: 'describe' | 'set', readonly name: string, readonly value?: string },
  fetcher: InstanceCredentialFetch,
): Promise<unknown | undefined> {
  return fetcher(SAGE_CREDENTIALS_PATH, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
  }).then(async (response) => {
    // A non-OK status still carries the route's named refusal when the transport delivered the
    // request (400 grammar stops). Mapping every non-OK to 'unreachable' would claim the request
    // never arrived — keep the delivered receipt, fall back to undefined only for unparseable ones.
    const receipt: unknown = await response.json().catch(() => undefined)
    if (!response.ok) {
      return isRecord(receipt) && typeof receipt.code === 'string' ? receipt : undefined
    }
    return receipt
  }).catch(() => undefined)
}

export function classifyCredentialDescribe(receipt: unknown): InstanceCredentialRead {
  if (!isRecord(receipt)) return { kind: 'unavailable', code: 'unreachable' }
  if (receipt.state !== 'read') {
    // Both the typed refusal ({state:'refused', code}) and the route's transport-level 400 body
    // ({code:'invalid-credential-request', stage}) carry a named code; either is the honest cause.
    return typeof receipt.code === 'string'
      ? { kind: 'unavailable', code: receipt.code }
      : { kind: 'unavailable', code: 'unrecognised' }
  }
  if (!Array.isArray(receipt.entries)) return { kind: 'unavailable', code: 'unrecognised' }
  const entry = receipt.entries.find(
    (candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.name === INSTANCE_CREDENTIAL_NAME,
  )
  if (entry === undefined) return { kind: 'unavailable', code: 'unrecognised' }
  return {
    kind: 'read',
    configured: entry.configured === true,
    source: typeof entry.source === 'string' ? entry.source : null,
    writable: entry.writable === true,
  }
}

export function classifyCredentialSave(receipt: unknown): InstanceCredentialSaveOutcome {
  if (!isRecord(receipt)) return { kind: 'unreachable' }
  if (receipt.state === 'saved') return { kind: 'saved' }
  if (typeof receipt.code === 'string') return { kind: 'refused', code: receipt.code }
  return { kind: 'refused', code: 'unrecognised' }
}

export function createInstanceCredentialController(
  fetcher: InstanceCredentialFetch = fetch,
): InstanceCredentialController {
  return {
    async read(): Promise<InstanceCredentialRead> {
      return classifyCredentialDescribe(await postCredential({ action: 'describe', name: INSTANCE_CREDENTIAL_NAME }, fetcher))
    },
    async save(value: string): Promise<InstanceCredentialSaveOutcome> {
      return classifyCredentialSave(await postCredential({ action: 'set', name: INSTANCE_CREDENTIAL_NAME, value }, fetcher))
    },
  }
}
