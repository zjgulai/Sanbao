import { describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'

/**
 * The stop/resume/pending routes (route-level; the pending-input surface itself is covered by
 * `product-app/session-region.spec.tsx` after batch 24 moved the session card to React).
 */

describe('the stop/resume/pending routes', () => {
  const post = (path: string, body: string, providers: ReturnType<typeof createUnavailableFirstService>) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
    { callerBinding: { correlation: 'c-006' }, providers } as never,
  )

  it('parses each body exactly, blocks raw providers, and refuses anything else', async () => {
    const seen: string[] = []
    const providers = createUnavailableFirstService(null, {
      sessionStop: (request) => { seen.push(`stop:${request.matterRef}`); return Promise.resolve({ state: 'stopped', paused: true, drained: [], consumed: [], dispatched: [], code: null }) },
      sessionResume: (request) => { seen.push(`resume:${request.matterRef}:${request.workspaceRoot}`); return Promise.resolve({ state: 'resumed', paused: false, drained: [], consumed: [], dispatched: [], code: null }) },
      pendingUpdate: (request) => { seen.push(`${request.action}:${request.itemId}`); return { ok: true } },
    })
    expect((await post('/.sage/session/stop', JSON.stringify({ matterRef: 'm' }), providers)).status).toBe(200)
    expect((await post('/.sage/session/resume', JSON.stringify({ matterRef: 'm', workspaceRoot: '/a' }), providers)).status).toBe(200)
    expect((await post('/.sage/session/pending', JSON.stringify({ action: 'edit', itemId: 'p-1', text: 'x' }), providers)).status).toBe(200)
    expect((await post('/.sage/session/pending', JSON.stringify({ action: 'remove', itemId: 'p-1' }), providers)).status).toBe(200)
    expect(seen).toEqual([])

    for (const [path, body] of [
      ['/.sage/session/stop', JSON.stringify({ matterRef: '' })],
      ['/.sage/session/stop', JSON.stringify({ matterRef: 'm', extra: 1 })],
      ['/.sage/session/resume', JSON.stringify({ matterRef: 'm' })],
      ['/.sage/session/pending', JSON.stringify({ action: 'edit', itemId: 'p-1', text: '  ' })],
      ['/.sage/session/pending', JSON.stringify({ action: 'purge', itemId: 'p-1' })],
      ['/.sage/session/pending', JSON.stringify({ action: 'remove', itemId: 'p-1', force: true })],
    ] as const) {
      expect((await post(path, body, providers)).status, body).toBe(400)
    }
    expect(seen).toHaveLength(0)
  })

  it('answers unavailable-first when the halves are unwired', async () => {
    const unwired = createUnavailableFirstService(null, {})
    expect(await (await post('/.sage/session/stop', JSON.stringify({ matterRef: 'm' }), unwired)).json())
      .toMatchObject({ state: 'refused', code: 'protected-effect-unavailable', paused: false })
    expect(await (await post('/.sage/session/pending', JSON.stringify({ action: 'remove', itemId: 'p' }), unwired)).json())
      .toEqual({ ok: false, code: 'protected-effect-unavailable' })
  })
})
