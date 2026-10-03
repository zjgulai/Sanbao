import { describe, expect, it } from 'vitest'

import { createWorkspaceMutations } from '../src/main/workspace-mutations.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import type { WorkspaceMutationRequest } from '../src/appservice/contracts.js'

/** A bridge whose answers are scripted per endpoint; records every call it was asked to make. */
function bridgeWith(answers: Record<string, unknown>): { call: (endpoint: string, payload?: readonly unknown[]) => Promise<unknown>, calls: [string, readonly unknown[]][] } {
  const calls: [string, readonly unknown[]][] = []
  return {
    calls,
    call: async (endpoint: string, payload: readonly unknown[] = []) => {
      calls.push([endpoint, payload])
      return answers[endpoint]
    },
  }
}

const rename = (bridge: ReturnType<typeof bridgeWith>) => createWorkspaceMutations(bridge.call)({ kind: 'rename', workspaceId: 'ws-1', title: '经营分析' })

describe('workspace mutations: answers become outcomes (ticket 012 write half)', () => {
  it('settles a rename only when the base names the same workspace back', async () => {
    const settled = bridgeWith({ 'workspace/rename': { ok: true, result: { workspace: { workspaceId: 'ws-1', title: '经营分析' } } } })
    expect(await rename(settled)).toEqual({ state: 'settled', kind: 'rename', workspaceId: 'ws-1', title: '经营分析' })
    expect(settled.calls).toEqual([['workspace/rename', [{ workspaceId: 'ws-1', title: '经营分析' }]]])

    // An answer about a different workspace is not this rename's settlement.
    const mismatched = bridgeWith({ 'workspace/rename': { ok: true, result: { workspace: { workspaceId: 'ws-9', title: '别的' } } } })
    expect(await rename(mismatched)).toMatchObject({ state: 'refused', kind: 'rename', code: 'bridge-answer-unrecognised' })
  })

  it('settles a delete only on the base’s own { deleted: true } receipt, and says nothing about a directory', async () => {
    const deleted = bridgeWith({ 'workspace/delete': { ok: true, result: { deleted: true } } })
    const outcome = await createWorkspaceMutations(deleted.call)({ kind: 'delete', workspaceId: 'ws-1' })
    expect(outcome).toEqual({ state: 'settled', kind: 'delete', workspaceId: 'ws-1' })
    // The outcome's whole vocabulary: a removal names the registration, and no field here can
    // carry "directory", "path" or "removed content" (US-064).
    expect(JSON.stringify(outcome)).not.toMatch(/director|path|file/iu)

    // `{ deleted: false }` or a missing receipt is not a settled removal.
    for (const result of [{ deleted: false }, {}, { deleted: 'true' }]) {
      const answer = bridgeWith({ 'workspace/delete': { ok: true, result } })
      expect(await createWorkspaceMutations(answer.call)({ kind: 'delete', workspaceId: 'ws-1' }), JSON.stringify(result))
        .toMatchObject({ state: 'refused', code: 'bridge-answer-unrecognised' })
    }
  })

  it('keeps the base’s order as the settlement of a reorder, and refuses a non-list', async () => {
    const ordered = bridgeWith({ 'workspace/insert-before': { ok: true, result: { workspaceIds: ['ws-2', 'ws-1'] } } })
    expect(await createWorkspaceMutations(ordered.call)({ kind: 'reorder', workspaceId: 'ws-2', beforeWorkspaceId: 'ws-1' }))
      .toEqual({ state: 'settled', kind: 'reorder', order: ['ws-2', 'ws-1'] })
    expect(ordered.calls).toEqual([['workspace/insert-before', [{ workspaceId: 'ws-2', beforeWorkspaceId: 'ws-1' }]]])

    // Appending has no anchor; the request object must not carry a null one (the base's own
    // request omits the key, and an explicit null is refused one hop earlier by the bridge).
    const appended = bridgeWith({ 'workspace/insert-before': { ok: true, result: { workspaceIds: ['ws-1', 'ws-2'] } } })
    expect(await createWorkspaceMutations(appended.call)({ kind: 'reorder', workspaceId: 'ws-2', beforeWorkspaceId: null }))
      .toMatchObject({ state: 'settled' })
    expect(appended.calls).toEqual([['workspace/insert-before', [{ workspaceId: 'ws-2' }]]])

    for (const result of [{ workspaceIds: 'ws-2' }, { workspaceIds: ['ws-2', 7] }, {}]) {
      const answer = bridgeWith({ 'workspace/insert-before': { ok: true, result } })
      expect(await createWorkspaceMutations(answer.call)({ kind: 'reorder', workspaceId: 'ws-2', beforeWorkspaceId: null }), JSON.stringify(result))
        .toMatchObject({ state: 'refused', code: 'bridge-answer-unrecognised' })
    }
  })

  it('carries the bridge’s refusal code through untouched, and never fires a second call', async () => {
    const refused = bridgeWith({ 'workspace/delete': { ok: false, code: 'bridge-workspace-unknown' } })
    expect(await createWorkspaceMutations(refused.call)({ kind: 'delete', workspaceId: 'ws-1' }))
      .toEqual({ state: 'refused', kind: 'delete', code: 'bridge-workspace-unknown' })
    expect(refused.calls).toHaveLength(1)

    // An answer that is neither shape is a refusal with its own code — never a settlement.
    const unreadable = bridgeWith({ 'workspace/rename': 'not-an-answer' })
    expect(await rename(unreadable)).toMatchObject({ state: 'refused', code: 'bridge-answer-unrecognised' })
    const thrown = createWorkspaceMutations(async () => { throw new Error('boom') })
    await expect(thrown({ kind: 'rename', workspaceId: 'ws-1', title: 'x' })).rejects.toThrow('boom')
  })
})

describe('the mutate route: /.sage/workspace/mutate', () => {
  const post = (body: string, providers: ReturnType<typeof createUnavailableFirstService>) => handleSageServiceRequest(
    new Request('dsh-app://app/.sage/workspace/mutate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { callerBinding: { correlation: 'c-012' }, providers } as never,
  )

  it('parses exactly the three kinds and refuses everything else before any provider runs', async () => {
    const seen: WorkspaceMutationRequest[] = []
    const providers = createUnavailableFirstService(null, {
      mutateWorkspace: async (request) => {
        seen.push(request)
        return { state: 'settled', kind: 'delete', workspaceId: 'ws-1' }
      },
    })

    const accepted = [
      JSON.stringify({ kind: 'delete', workspaceId: 'ws-1' }),
      JSON.stringify({ kind: 'rename', workspaceId: 'ws-1', title: '新名字' }),
      JSON.stringify({ kind: 'reorder', workspaceId: 'ws-1', beforeWorkspaceId: null }),
      JSON.stringify({ kind: 'reorder', workspaceId: 'ws-1', beforeWorkspaceId: 'ws-2' }),
    ]
    for (const body of accepted) {
      expect((await post(body, providers)).status, body).toBe(200)
    }
    expect(seen.map((request) => request.kind)).toEqual(['delete', 'rename', 'reorder', 'reorder'])

    const refused = [
      'not json',
      '[]',
      JSON.stringify({ kind: 'purge', workspaceId: 'ws-1' }),
      JSON.stringify({ kind: 'delete' }),
      JSON.stringify({ kind: 'delete', workspaceId: '' }),
      JSON.stringify({ kind: 'delete', workspaceId: 'ws-1', extra: true }),
      JSON.stringify({ kind: 'rename', workspaceId: 'ws-1', title: '  ' }),
      JSON.stringify({ kind: 'rename', workspaceId: 'ws-1', title: 'x', extra: 1 }),
      JSON.stringify({ kind: 'reorder', workspaceId: 'ws-1' }),
      JSON.stringify({ kind: 'reorder', workspaceId: 'ws-1', beforeWorkspaceId: 'ws-1' }),
      JSON.stringify({ kind: 'reorder', workspaceId: 'ws-1', beforeWorkspaceId: 7 }),
    ]
    for (const body of refused) {
      const response = await post(body, providers)
      expect(response.status, body).toBe(400)
      expect(await response.json(), body).toMatchObject({ code: 'invalid-workspace-mutation', retryable: false })
    }
    expect(seen).toHaveLength(4)
  })

  it('keeps the transport rules of its siblings: POST only, JSON only', async () => {
    const providers = createUnavailableFirstService(null, {})
    const get = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/workspace/mutate', { method: 'GET' }),
      { callerBinding: { correlation: 'c-012' }, providers } as never,
    )
    expect(get.status).toBe(405)
    expect(get.headers.get('allow')).toBe('POST')

    const wrongType = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/workspace/mutate', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }),
      { callerBinding: { correlation: 'c-012' }, providers } as never,
    )
    expect(wrongType.status).toBe(415)
  })

  it('answers a refusal with its own code when no mutation provider is assembled', async () => {
    const providers = createUnavailableFirstService(null, {})
    const response = await post(JSON.stringify({ kind: 'delete', workspaceId: 'ws-1' }), providers)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ state: 'refused', kind: 'delete', code: 'workspace-mutation-unavailable' })
  })

  it('records the last mutation in the state projection so the surface can word it', async () => {
    const providers = createUnavailableFirstService(null, {
      mutateWorkspace: async () => ({ state: 'settled', kind: 'delete', workspaceId: 'ws-1' }),
    })
    const before = await (await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/state', { method: 'GET' }),
      { callerBinding: { correlation: 'c-012' }, providers } as never,
    )).json() as { workspaceMutation: unknown }
    expect(before.workspaceMutation).toBeNull()

    await post(JSON.stringify({ kind: 'delete', workspaceId: 'ws-1' }), providers)
    const after = await (await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/state', { method: 'GET' }),
      { callerBinding: { correlation: 'c-012' }, providers } as never,
    )).json() as { workspaceMutation: unknown }
    expect(after.workspaceMutation).toEqual({ state: 'settled', kind: 'delete', workspaceId: 'ws-1' })
  })
})
