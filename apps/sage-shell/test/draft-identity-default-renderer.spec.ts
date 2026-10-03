import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 004 on the shipped page (US-008).
 *
 * The responsibility default is filled from the SAME auth projection the rest of the identity
 * surface uses (main-owned; never a renderer-invented or self-reported identity); it stays
 * editable, lands in the draft only through the user's own save, and signed-out / pending /
 * nameless sessions keep the field empty with a named missing-reason instead of a placeholder.
 */

const draft = (overrides: Record<string, unknown> = {}) => ({
  draftId: 'draft-1',
  fields: { goal: '', deliverable: '', responsibility: '', projectRef: '' },
  clarification: '',
  history: [{ entryId: 'entry-1', text: '帮我把季度复盘整理成对外的交付说明', selected: false }],
  status: 'editing',
  matterRef: null,
  complete: false,
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  ...overrides,
})

const serviceBlock = (auth: { status: string, displayName: string | null }) => ({
  status: 'unavailable',
  reason: auth.status === 'signed-out' ? 'identity-unavailable' : 'authenticated',
  correlation: 'c',
  auth,
  command: null,
})

const payload = (auth: { status: string, displayName: string | null }, draftSlot: unknown) =>
  statePayload({ service: serviceBlock(auth), draft: draftSlot })

describe('the responsibility identity default (ticket 004)', () => {
  it('fills the default from the signed-in projection and keeps it editable', async () => {
    const harness = await bootSagePage(payload({ status: 'signed-in', displayName: '林一' }, { state: 'unlocked', drafts: [draft()] }))
    expect(harness.node('draft-responsibility').value).toBe('林一')
    expect(harness.node('draft-responsibility').disabled).toBe(false)
    const note = harness.node('draft-responsibility-note').textContent
    expect(note).toContain('责任默认：当前登录身份「林一」')
    expect(note).toContain('main 的登录投影')
    expect(note).toContain('可改')
    expect(note).toContain('不改变任何权限判定')
  })

  it('signed-out keeps the field empty with the missing-reason — no placeholder identity', async () => {
    const harness = await bootSagePage(payload({ status: 'signed-out', displayName: null }, { state: 'unlocked', drafts: [draft()] }))
    expect(harness.node('draft-responsibility').value).toBe('')
    const note = harness.node('draft-responsibility-note').textContent
    expect(note).toContain('未认证：责任字段没有默认值')
    expect(note).toContain('不用占位身份填充')
  })

  it('pending and nameless sessions name their own reason and still do not fabricate a default', async () => {
    const pending = await bootSagePage(payload({ status: 'pending', displayName: null }, { state: 'unlocked', drafts: [draft()] }))
    expect(pending.node('draft-responsibility').value).toBe('')
    expect(pending.node('draft-responsibility-note').textContent).toContain('登录进行中')

    const nameless = await bootSagePage(payload({ status: 'signed-in', displayName: null }, { state: 'unlocked', drafts: [draft()] }))
    expect(nameless.node('draft-responsibility').value).toBe('')
    expect(nameless.node('draft-responsibility-note').textContent).toContain('显示名未提供')
    expect(nameless.node('draft-responsibility-note').textContent).toContain('不伪造')
  })

  it('a saved value wins over the default and shows no default wording', async () => {
    const harness = await bootSagePage(payload(
      { status: 'signed-in', displayName: '林一' },
      { state: 'unlocked', drafts: [draft({ fields: { goal: '季度复盘', deliverable: '对外说明', responsibility: '李四·主责', projectRef: '' } })] },
    ))
    expect(harness.node('draft-responsibility').value).toBe('李四·主责')
    expect(harness.node('draft-responsibility-note').textContent).toBe('')
  })

  it('does not overwrite the text the user is typing, but withdraws an untouched default when auth changes', async () => {
    const harness = await bootSagePage(payload({ status: 'signed-in', displayName: '林一' }, { state: 'unlocked', drafts: [draft()] }))
    expect(harness.node('draft-responsibility').value).toBe('林一')
    harness.node('draft-responsibility').value = '王五（临时代填）'
    await harness.refresh()
    expect(harness.node('draft-responsibility').value).toBe('王五（临时代填）')

    // 身份态变化会重跑默认块：此时用户手里的未保存文本同样不被覆盖（旧默认也不得复活）。
    harness.setPayload(payload({ status: 'signed-in', displayName: '林明' }, { state: 'unlocked', drafts: [draft()] }))
    await harness.refresh()
    expect(harness.node('draft-responsibility').value).toBe('王五（临时代填）')

    const untouched = await bootSagePage(payload({ status: 'signed-in', displayName: '林一' }, { state: 'unlocked', drafts: [draft()] }))
    untouched.setPayload(payload({ status: 'signed-out', displayName: null }, { state: 'unlocked', drafts: [draft()] }))
    await untouched.refresh()
    expect(untouched.node('draft-responsibility').value).toBe('')
    expect(untouched.node('draft-responsibility-note').textContent).toContain('未认证')
  })

  it('saving records the user-confirmed text (edited default) through the ordinary save entry', async () => {
    const harness = await bootSagePage(payload({ status: 'signed-in', displayName: '林一' }, { state: 'unlocked', drafts: [draft()] }))
    harness.node('draft-responsibility').value = '王五（临时代填）'
    harness.node('draft-save').dispatch('click')
    await harness.refresh()
    const saved = harness.requests.find((request) => request.path === '/.sage/draft/update')
    expect(saved).toBeDefined()
    expect(saved?.body).toMatchObject({ draftId: 'draft-1', fields: { responsibility: '王五（临时代填）' } })
  })
})
