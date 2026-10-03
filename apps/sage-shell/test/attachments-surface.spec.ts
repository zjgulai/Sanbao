import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 014 (US-071~075): the attachment block on the session card.
 *
 * The acceptance lines that live here: every stage has its own words — upload success is never
 * "the model read it"; a local refusal sentence survives the 2 s poll; the upload button sends the
 * chosen matter/workspace and nothing else; sent or historical messages show their durable refs.
 */

const item = (over: Record<string, unknown> = {}) => ({
  itemId: 'att-1',
  name: 'report.bin',
  bytes: 10,
  stage: 'candidate',
  sentBytes: null,
  code: null,
  ...over,
})

const attachments = (items: readonly unknown[]) => ({ state: 'read', items })
const channel = (over: Record<string, unknown> = {}) => ({
  state: 'read', sessionId: 'session-1', execution: 'idle', lastTurnEnd: null, transcript: [],
  reconciled: false, streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [],
  ...over,
})

describe('the attachment block (014)', () => {
  it('gives every stage its own words — and upload success never reads as model-read', async () => {
    const payload = statePayload({
      attachments: attachments([
        item({ itemId: 'a-1', name: 'pick.bin', stage: 'candidate' }),
        item({ itemId: 'a-2', name: 'up.bin', stage: 'uploading', sentBytes: 50, bytes: 100 }),
        item({ itemId: 'a-3', name: 'stored.bin', stage: 'stored' }),
        item({ itemId: 'a-4', name: 'sent.bin', stage: 'sent' }),
        item({ itemId: 'a-5', name: 'fail.bin', stage: 'failed', code: 'bridge-provider-failed' }),
        item({ itemId: 'a-6', name: 'moved.bin', stage: 'source-changed' }),
        item({ itemId: 'a-7', name: 'gone.bin', stage: 'cancelled' }),
      ]),
    })
    const harness = await bootSagePage(payload)
    const rows = harness.node('attachment-items').children
    expect(rows).toHaveLength(7)
    const textOf = (id: string) => rows.find((row) => row.dataset.attachmentId === id)?.textContent ?? ''
    expect(textOf('a-1')).toContain('候选（未上传）')
    expect(textOf('a-2')).toContain('传输中 50/100 字节')
    expect(textOf('a-3')).toContain('已上传 · 内容核验通过（将随下一条消息发送）')
    expect(textOf('a-4')).toContain('已随消息发送（关联于该会话）')
    expect(textOf('a-5')).toContain('上传失败（可重试同一封存版本）')
    expect(textOf('a-6')).toContain('源内容在选取与上传间发生变化（需重新选择）')
    expect(textOf('a-7')).toContain('已取消（不会随消息发送）')
    // The one stored item drives the note; "uploaded" is not "read" — those words never appear.
    expect(harness.node('attachment-note').textContent).toContain('1 项已上传（内容核验通过），将随下一条消息发送')
    const all = harness.node('attachment-items').textContent + harness.node('attachment-note').textContent
    for (const banned of ['已读取', '已使用', '已解析', '模型已看到']) {
      expect(all, banned).not.toContain(banned)
    }
    // Only the stages that still allow a next act carry its buttons.
    const actionsOf = (id: string) => rows.find((row) => row.dataset.attachmentId === id)?.children
      .filter((child) => child.tagName === 'button')
      .map((child) => child.textContent) ?? []
    expect(actionsOf('a-1')).toEqual(['确认上传', '移除'])
    expect(actionsOf('a-2')).toEqual(['取消上传'])
    expect(actionsOf('a-3')).toEqual(['移除'])
    expect(actionsOf('a-4')).toEqual([])
    expect(actionsOf('a-5')).toEqual(['重试上传', '移除'])
    expect(actionsOf('a-6')).toEqual([])
    expect(actionsOf('a-7')).toEqual([])
  })

  it('pick answers 已产生候选 with the refused files named, and the sentence survives the next poll', async () => {
    const payload = statePayload({
      state: 'picked',
      items: [item({ itemId: 'a-1' })],
      refused: [{ name: 'big.bin', code: 'attachment-too-large' }],
      attachments: attachments([item({ itemId: 'a-1' })]),
    })
    const harness = await bootSagePage(payload)
    harness.node('attachment-pick').dispatch('click')
    await harness.refresh()
    expect(harness.requests[0]).toEqual({ path: '/.sage/attachments/pick', body: {} })
    const note = harness.node('attachment-note').textContent
    expect(note).toContain('已产生 1 个候选（尚未上传）')
    expect(note).toContain('big.bin（attachment-too-large）')
    // The poll must not overwrite the local sentence with its own.
    harness.setPayload(statePayload({ attachments: attachments([item({ itemId: 'a-1' })]) }))
    await harness.refresh()
    expect(harness.node('attachment-note').textContent).toContain('已产生 1 个候选')
  })

  it('upload sends the chosen matter and workspace — never an invented one — and reports refusal without claiming a send', async () => {
    const payload = statePayload({
      state: 'refused',
      code: 'bridge-provider-failed',
      attachments: attachments([item({ itemId: 'a-2', stage: 'failed', code: 'bridge-provider-failed' })]),
      workspaces: { source: 'workspace-follow', state: 'read', reason: null, entries: [{ workspaceId: 'ws-1', path: '/work', title: 'work' }], order: [], archivedSessions: 0, frames: 0, unapplied: 0 },
    })
    const harness = await bootSagePage(payload)
    const clickUpload = (): unknown => {
      const row = harness.node('attachment-items').children[0]!
      const button = row.children.find((child) => child.tagName === 'button')!
      harness.node('attachment-items').dispatch('click', { target: button })
      return button
    }
    // No matter/workspace chosen yet: the act refuses locally, with nothing sent.
    clickUpload()
    await harness.settle()
    expect(harness.requests).toHaveLength(0)
    expect(harness.node('attachment-note').textContent).toContain('先在上面选好事项与工作区')

    harness.node('link-matter').value = 'receipt:1'
    harness.node('link-workspace').value = 'ws-1'
    clickUpload()
    await harness.refresh()
    expect(harness.requests[0]).toEqual({
      path: '/.sage/attachments/upload',
      body: { itemId: 'a-2', matterRef: 'receipt:1', workspaceRoot: '/work' },
    })
    expect(harness.node('attachment-note').textContent)
      .toContain('上传没有完成：bridge-provider-failed（没有变成已发送附件；可重试同一版本）。')
  })

  it('shows durable refs on transcript rows — echo and history alike, names and sizes only', async () => {
    const payload = statePayload({
      attachments: attachments([]),
      sessionChannel: channel({
        transcript: [
          { role: 'user', text: '看这个', source: 'echo', at: '2026-10-02T12:00:00.000Z', attachments: [{ attachmentId: 'sha-1', name: 'report.bin', bytes: 10 }] },
          { role: 'user', text: '旧消息', source: 'history', at: null, attachments: [{ attachmentId: 'sha-2', name: 'old.pdf', bytes: 2048 }] },
          { role: 'assistant', text: '收到', source: 'history', at: null, attachments: [] },
        ],
      }),
    })
    const harness = await bootSagePage(payload)
    const rows = harness.node('session-transcript').children
    const echo = rows.find((row) => row.dataset.sessionSource === 'echo')
    expect(echo?.textContent).toContain('附件：report.bin（10 字节 · 内容核验通过）')
    const history = rows.filter((row) => row.dataset.sessionSource === 'history')
    expect(history[0]?.textContent).toContain('附件：old.pdf（2048 字节 · 内容核验通过）')
    // Nothing renders a machine path: the chips carry name and byte count only.
    expect(echo?.textContent).not.toContain('/')
    expect(history[0]?.textContent).not.toContain('/')
  })

  it('says 未核验 for the whole block when the slot is absent, and keeps the document free of path-shaped strings', async () => {
    const harness = await bootSagePage(statePayload({ attachments: null }))
    expect(harness.node('attachment-note').textContent).toContain('未核验：这一版还没有接上附件端口。')
    const document = renderSageDocument()
    // The pick dialog is main's; the page itself names no filesystem path in its static surface.
    expect(document).not.toContain('/Users/')
  })
})
