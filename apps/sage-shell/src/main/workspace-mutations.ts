/** Ticket 012 (write half): turn the bridge's rename / delete / reorder answers into outcomes.
 *
 * Three rules carry this module's half of the ticket:
 *
 * - **Delete is de-registration, and the projection says so.** The base's own `delete` "removes
 *   the registration while retaining files and Sessions", and this path reaches it through a
 *   bridge with no filesystem access at all — so an outcome can never claim a directory changed.
 * - **A refusal keeps the base's refusal as a Sage code.** `bridge-workspace-name-conflict` and
 *   friends come from the bridge's classification; the surface words them, this module never
 *   forwards the base's message (it names the title or path that was refused).
 * - **Nothing is inferred from a claim.** A rename is `settled` only when the base's answer names
 *   the same workspace back; a reorder only when its order is a list of ids.
 */
import type { WorkspaceMutationOutcome, WorkspaceMutationRequest } from '../appservice/contracts.js'
import type { BridgeCaller } from './workspace-adoption.js'

function asAnswer(value: unknown): { readonly ok: true, readonly result: unknown } | { readonly ok: false, readonly code: string } {
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === true) {
    return { ok: true, result: (value as { result?: unknown }).result }
  }
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === false
    && typeof (value as { code?: unknown }).code === 'string') {
    return { ok: false, code: (value as { code: string }).code }
  }
  return { ok: false, code: 'bridge-answer-unrecognised' }
}

function readString(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'string' && candidate !== '' ? candidate : undefined
}

export function createWorkspaceMutations(callBridge: BridgeCaller): (request: WorkspaceMutationRequest) => Promise<WorkspaceMutationOutcome> {
  return async (request) => {
    if (request.kind === 'rename') {
      const answer = asAnswer(await callBridge('workspace/rename', [{ workspaceId: request.workspaceId, title: request.title }]))
      if (!answer.ok) return { state: 'refused', kind: 'rename', code: answer.code }
      const workspace = (answer.result as { workspace?: unknown } | null | undefined)?.workspace
      // The answer must name the same workspace back: another id would be an answer about a
      // different row, and reporting it as this rename's settlement would be a false receipt.
      if (readString(workspace, 'workspaceId') !== request.workspaceId) {
        return { state: 'refused', kind: 'rename', code: 'bridge-answer-unrecognised' }
      }
      return { state: 'settled', kind: 'rename', workspaceId: request.workspaceId, title: readString(workspace, 'title') ?? request.title }
    }

    if (request.kind === 'delete') {
      const answer = asAnswer(await callBridge('workspace/delete', [{ workspaceId: request.workspaceId }]))
      if (!answer.ok) return { state: 'refused', kind: 'delete', code: answer.code }
      // The base's receipt is `{ deleted: true }`; anything else did not report a deletion.
      if ((answer.result as { deleted?: unknown } | null | undefined)?.deleted !== true) {
        return { state: 'refused', kind: 'delete', code: 'bridge-answer-unrecognised' }
      }
      return { state: 'settled', kind: 'delete', workspaceId: request.workspaceId }
    }

    const answer = asAnswer(await callBridge('workspace/insert-before', [request.beforeWorkspaceId === null
      ? { workspaceId: request.workspaceId }
      : { workspaceId: request.workspaceId, beforeWorkspaceId: request.beforeWorkspaceId }]))
    if (!answer.ok) return { state: 'refused', kind: 'reorder', code: answer.code }
    const order = (answer.result as { workspaceIds?: unknown } | null | undefined)?.workspaceIds
    if (!Array.isArray(order) || !order.every((id): id is string => typeof id === 'string' && id !== '')) {
      return { state: 'refused', kind: 'reorder', code: 'bridge-answer-unrecognised' }
    }
    return { state: 'settled', kind: 'reorder', order }
  }
}
