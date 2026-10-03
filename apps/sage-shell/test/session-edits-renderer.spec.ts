import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 036 on the shipped page (US-185~187): a sent message offers [编辑]; saving makes a
 * version (the original row stays untouched in the transcript); the resend goes through the one
 * edit POST with the matter's workspace; an unknown outcome swaps the resend for 核对 only.
 */

const version = (overrides: Record<string, unknown> = {}) => ({
  version: 1, text: '改过的要求 v1', savedAt: 't', submission: 'unsent', submittedAt: null, code: null,
  ...overrides,
})

const record = (overrides: Record<string, unknown> = {}) => ({
  editId: 'edit-1',
  messageRef: 'req-original-1',
  originalText: '原来的要求',
  activeVersion: 1,
  versions: [version()],
  ...overrides,
})

const payload = (extra: Record<string, unknown> = {}) => statePayload({
  workspaces: {
    source: 'workspace-follow', state: 'read', reason: null,
    entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
    order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
  },
  matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
  draft: { state: 'unlocked', drafts: [] },
  sessionChannel: {
    state: 'read', sessionId: 'sess-1', execution: 'idle', lastTurnEnd: null,
    transcript: [{ role: 'user', text: '原来的要求', source: 'echo', at: 't', attachments: [], messageRef: 'req-original-1' }],
    reconciled: false, streamBroken: false, code: null, records: 1, unapplied: 0, paused: false, pending: [],
    queue: { state: 'read', occurrences: [] },
  },
  sessionEdits: { state: 'read', records: [record()], code: null, at: 't' },
  ...extra,
})

const setContext = (harness: Awaited<ReturnType<typeof bootSagePage>>) => {
  harness.node('link-matter').value = 'matter:1'
  harness.node('link-workspace').value = 'ws-1'
}

describe('the edit & resend block (ticket 036)', () => {
  it('clicking [编辑] only fills the local editor; saving sends exactly one save POST (US-185)', async () => {
    const harness = await bootSagePage(payload({
      sessionEdits: { state: 'read', records: [], code: null, at: null },
    }), {
      '/.sage/session/edits': { state: 'saved', record: record() },
    })
    await harness.refresh()
    const editButton = harness.node('session-transcript').querySelector('[data-edit-message="req-original-1"]')
    expect(editButton).not.toBeNull()
    harness.node('session-transcript').dispatch('click', { target: editButton })
    await harness.settle()

    // 选消息零请求；编辑器被填充。
    expect(harness.requests).toEqual([])
    expect(harness.node('edit-input').value).toBe('原来的要求')
    expect(harness.node('edit-target').textContent).toContain('req-original-1')
    expect(harness.node('edit-note').textContent).toContain('原消息保持原样')

    harness.node('edit-input').value = '改过的要求 v1'
    setContext(harness)
    harness.node('edit-save').dispatch('click', {})
    await harness.settle()
    expect(harness.requests).toEqual([
      { path: '/.sage/session/edits', body: { action: 'save', messageRef: 'req-original-1', text: '改过的要求 v1' } },
    ])
  })

  it('shows the original untouched beside the version chain, and resends through the one edit POST (US-186)', async () => {
    const harness = await bootSagePage(payload({
      sessionEdits: {
        state: 'read', code: null, at: 't',
        records: [record({ activeVersion: 2, versions: [version(), version({ version: 2, text: '再改一版 v2' })] })],
      },
    }), {
      '/.sage/session/edits': { state: 'recorded', version: version({ submission: 'accepted', submittedAt: 't' }) },
    })
    await harness.refresh()
    const row = harness.node('edit-rows').children[0]
    expect(row?.textContent).toContain('原消息（未改写）：原来的要求')
    expect(row?.textContent).toContain('v1：改过的要求 v1')
    expect(row?.textContent).toContain('v2（当前）：再改一版 v2')
    expect(row?.querySelector('[data-edit-resend="edit-1"]')?.textContent).toBe('重发 v2')

    setContext(harness)
    harness.node('edit-rows').dispatch('click', { target: row?.querySelector('[data-edit-resend="edit-1"]') })
    await harness.settle()
    expect(harness.requests).toEqual([
      { path: '/.sage/session/edits', body: { action: 'resend', editId: 'edit-1', workspaceRoot: 'ws-1' } },
    ])
    expect(harness.node('edit-note').textContent).toContain('重发已接收（等待生效确认）')
  })

  it('an unknown outcome swaps the resend for 核对 only — never a retry affordance (US-187)', async () => {
    const harness = await bootSagePage(payload({
      sessionEdits: { state: 'read', code: null, at: 't', records: [record({ versions: [version({ submission: 'unknown', submittedAt: 't', code: 'bridge-host-not-ready' })] })] },
    }), {
      '/.sage/session/edits': { state: 'checked', version: version({ submission: 'not-delivered' }), code: 'edit-not-delivered' },
    })
    await harness.refresh()
    const row = harness.node('edit-rows').children[0]
    expect(row?.textContent).toContain('结果未知（只给核对，不给重试）')
    expect(row?.querySelector('[data-edit-resend]')).toBeNull()
    const verify = row?.querySelector('[data-edit-verify="edit-1"]')
    expect(verify?.textContent).toBe('核对同一操作')

    harness.node('edit-rows').dispatch('click', { target: verify })
    await harness.settle()
    expect(harness.requests).toEqual([
      { path: '/.sage/session/edits', body: { action: 'verify', editId: 'edit-1' } },
    ])
    expect(harness.node('edit-note').textContent).toContain('核对确认未送达：可再次显式重发（不自动）')
  })

  it('saving without a selected message is refused locally with zero requests', async () => {
    const harness = await bootSagePage(payload())
    await harness.refresh()
    harness.node('edit-save').dispatch('click', {})
    await harness.settle()
    expect(harness.requests).toEqual([])
    expect(harness.node('edit-note').textContent).toContain('先从下方会话记录里选一条已发消息')
  })
})
