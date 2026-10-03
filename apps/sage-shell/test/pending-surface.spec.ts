import { describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 006, the pending-input surface and its three routes.
 */

const workspaces = {
  source: 'workspace-follow', state: 'read', reason: null,
  entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
  order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
}
const draft = { draftId: 'draft-1', fields: { goal: 'g', deliverable: 'd', responsibility: 'r', projectRef: '' }, clarification: '', history: [], status: 'converted', matterRef: 'receipt:42', attempt: null, complete: true, createdAt: 'x', updatedAt: 'x' }
const channel = (overrides: Record<string, unknown> = {}) => ({
  state: 'read', sessionId: 'session-1', execution: 'executing', lastTurnEnd: null,
  transcript: [], reconciled: false, streamBroken: false, code: null, records: 3, unapplied: 0,
  paused: false, pending: [], ...overrides,
})
const payload = (channelState: unknown) => statePayload({
  draft: { state: 'unlocked', drafts: [draft] },
  workspaces,
  matterLinks: { state: 'read', links: [{ matterRef: 'receipt:42', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
  sessionChannel: channelState,
})

describe('the pending-input surface', () => {
  it('marks a paused session, offers 继续, and says paused inputs are not dispatched', async () => {
    const harness = await bootSagePage(payload(channel({
      paused: true,
      pending: [{ itemId: 'p-1', text: '暂停期间写下的', state: 'pending', note: null, editable: true }],
    })))
    expect(harness.node('pending-note').textContent).toContain('已暂停')
    expect(harness.node('pending-note').textContent).toContain('不会自动送去执行')
    expect(harness.node('session-stop').disabled).toBe(true)
    expect(harness.node('session-resume').disabled).toBe(false)
    const rows = harness.node('pending-rows').children
    expect(rows).toHaveLength(1)
    expect(rows[0]?.querySelector('[data-pending-input]')?.value).toBe('暂停期间写下的')
    expect(rows[0]?.querySelector('[data-pending-input]')?.disabled).toBe(false)
  })

  it('freezes a consumed item: no edit controls, and its text stays as accepted', async () => {
    const harness = await bootSagePage(payload(channel({
      pending: [{ itemId: 'p-2', text: '已经执行的输入', state: 'consumed', note: 'consumed-by-race', editable: false }],
    })))
    const row = harness.node('pending-rows').children[0]!
    expect(row.textContent).toContain('已消费（只读）')
    expect(row.querySelectorAll('[data-pending-action]')).toEqual([])
    expect(row.querySelector('[data-pending-input]')?.disabled).toBe(true)
    expect(row.querySelector('[data-pending-input]')?.value).toBe('已经执行的输入')
  })

  it('posts stop, resume, edit and remove with exactly the declared bodies', async () => {
    const harness = await bootSagePage(payload(channel({
      paused: true,
      pending: [{ itemId: 'p-1', text: '待继续', state: 'pending', note: 'drained-at-stop', editable: true }],
    })))
    harness.node('session-stop').dispatch('click')
    await harness.refresh()
    expect(harness.requests[0]).toEqual({ path: '/.sage/session/stop', body: { matterRef: 'receipt:42' } })

    harness.node('session-resume').dispatch('click')
    await harness.refresh()
    expect(harness.requests[1]).toEqual({ path: '/.sage/session/resume', body: { matterRef: 'receipt:42', workspaceRoot: '/Users/someone/project' } })

    const row = harness.node('pending-rows').children[0]!
    const input = row.querySelector('[data-pending-input]')!
    input.value = '改过的文字'
    harness.node('pending-rows').dispatch('click', { target: row.querySelector('[data-pending-action="edit"]') })
    await harness.refresh()
    expect(harness.requests[2]).toEqual({ path: '/.sage/session/pending', body: { action: 'edit', itemId: 'p-1', text: '改过的文字' } })

    harness.node('pending-rows').dispatch('click', { target: row.querySelector('[data-pending-action="remove"]') })
    await harness.refresh()
    expect(harness.requests[3]).toEqual({ path: '/.sage/session/pending', body: { action: 'remove', itemId: 'p-1' } })
  })

  it('does not offer 继续 while running, and labels a drained item with its provenance', async () => {
    const harness = await bootSagePage(payload(channel({
      pending: [{ itemId: 'p-1', text: 'A', state: 'pending', note: 'drained-at-stop', editable: true }],
    })))
    expect(harness.node('session-resume').disabled).toBe(true)
    expect(harness.node('session-stop').disabled).toBe(false)
    expect(harness.node('pending-rows').children[0]?.textContent).toContain('停止时已收回')
  })
})

describe('the stop/resume/pending routes', () => {
  const post = (path: string, body: string, providers: ReturnType<typeof createUnavailableFirstService>) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
    { callerBinding: { correlation: 'c-006' }, providers } as never,
  )

  it('parses each body exactly and refuses anything else', async () => {
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
    expect(seen).toEqual(['stop:m', 'resume:m:/a', 'edit:p-1', 'remove:p-1'])

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
    expect(seen).toHaveLength(4)
  })

  it('answers unavailable-first when the halves are unwired', async () => {
    const unwired = createUnavailableFirstService(null, {})
    expect(await (await post('/.sage/session/stop', JSON.stringify({ matterRef: 'm' }), unwired)).json())
      .toMatchObject({ state: 'refused', code: 'session-channel-unavailable', paused: false })
    expect(await (await post('/.sage/session/pending', JSON.stringify({ action: 'remove', itemId: 'p' }), unwired)).json())
      .toEqual({ ok: false, code: 'pending-store-unavailable' })
  })
})
