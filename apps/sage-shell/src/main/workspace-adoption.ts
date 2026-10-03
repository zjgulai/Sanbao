/** Ticket 010: turn the bridge's pick + create answers into one adoption outcome.
 *
 * The sequence is fixed and short: ask the host to pick (interactive), and only when a path came
 * back ask it to adopt (write). A cancelled pick stops after the first call, so "the user closed
 * the picker" can never create anything — the second call is not merely skipped by a flag, it is
 * never made. The result is projected as three distinct states; a bridge refusal keeps its own
 * machine code so the surface can word it.
 */
import type { WorkspaceAdoptOutcome } from '../appservice/contracts.js'

/** The bridge's answer shape, as far as this module is concerned. */
export type BridgeAnswer = { readonly ok: true; readonly result: unknown } | { readonly ok: false; readonly code: string }

export type BridgeCaller = (endpoint: string, payload?: readonly unknown[]) => Promise<unknown>

function asAnswer(value: unknown): BridgeAnswer {
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === true) {
    return { ok: true, result: (value as { result?: unknown }).result }
  }
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === false
    && typeof (value as { code?: unknown }).code === 'string') {
    return { ok: false, code: (value as { code: string }).code }
  }
  // An unreadable answer is a refusal with its own code: it is never treated as a path.
  return { ok: false, code: 'bridge-answer-unrecognised' }
}

function readString(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'string' && candidate !== '' ? candidate : undefined
}

export function createWorkspaceAdoption(callBridge: BridgeCaller): () => Promise<WorkspaceAdoptOutcome> {
  return async () => {
    const picked = asAnswer(await callBridge('directory/pick', []))
    if (!picked.ok) return { state: 'refused', code: picked.code }
    const path = readString(picked.result, 'path')
    // `path: null` is the picker's own cancellation: stop here, having created nothing.
    if (path === undefined) return { state: 'cancelled' }

    const created = asAnswer(await callBridge('workspace/create', [{ path }]))
    if (!created.ok) return { state: 'refused', code: created.code }
    const workspace = (created.result as { workspace?: unknown } | null | undefined)?.workspace
    const workspaceId = readString(workspace, 'workspaceId')
    const adoptedPath = readString(workspace, 'path') ?? path
    if (workspaceId === undefined) return { state: 'refused', code: 'bridge-answer-unrecognised' }
    return { state: 'adopted', workspaceId, path: adoptedPath, title: readString(workspace, 'title') ?? adoptedPath }
  }
}
