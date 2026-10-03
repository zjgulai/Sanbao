import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload, type FakeElement } from './support/sage-page.js'

/**
 * Ticket 002, the draft surface (US-001~004, 007, 009~011).
 *
 * The shipped document's own `<script>` runs against the shared page harness: the confirm entry's
 * gating, the "no auto-fill" rule, the exact request bodies, and the locked state are checked where
 * they actually live.
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

const unlocked = (drafts: unknown[]) => ({ state: 'unlocked', drafts })

describe('the draft surface', () => {
  it('states the device-local rules and keeps the confirm entry disabled until the three required fields are filled', async () => {
    const harness = await bootSagePage(statePayload({ draft: unlocked([draft()]) }))
    // US-011/US-007/US-010 in the card copy itself.
    expect(harness.node('draft-lock').textContent).toContain('已解锁')
    expect(harness.node('draft-confirm').disabled).toBe(true)
    expect(harness.node('draft-confirm').textContent).toBe('确认建项')
    // US-010: the organized input never lands in the delivery/responsibility fields.
    expect(harness.node('draft-deliverable').value).toBe('')
    expect(harness.node('draft-responsibility').value).toBe('')
    expect(harness.node('draft-goal').value).toBe('')
    // The history entry is present and unselected.
    const rows = harness.node('draft-history').children
    expect(rows).toHaveLength(1)
    expect(rows[0]?.dataset.historyEntryId).toBe('entry-1')
    expect(rows[0]?.querySelector('[data-history-toggle]')?.checked).toBe(false)
  })

  it('enables the confirm entry only once the service says the draft is complete', async () => {
    const harness = await bootSagePage(statePayload({
      draft: unlocked([draft({ complete: true, fields: { goal: '季度复盘', deliverable: '对外说明', responsibility: 'role:owner', projectRef: '' } })]),
    }))
    expect(harness.node('draft-confirm').disabled).toBe(false)
    expect(harness.node('draft-goal').value).toBe('季度复盘')
    expect(harness.node('draft-responsibility').value).toBe('role:owner')
  })

  it('does not wipe a field the user is typing while the poll reports the same draft', async () => {
    const harness = await bootSagePage(statePayload({ draft: unlocked([draft()]) }))
    harness.node('draft-deliverable').value = '正在输入'
    await harness.refresh()
    expect(harness.node('draft-deliverable').value).toBe('正在输入')
  })

  it('posts the raw input on send, the typed fields on save, and asks for the confirmation card on confirm', async () => {
    const harness = await bootSagePage(statePayload({ draft: unlocked([draft({ complete: true })]) }))
    harness.node('draft-input').value = '新的一段需求'
    harness.node('draft-send').dispatch('click')
    await harness.refresh()
    expect(harness.requests[0]).toEqual({ path: '/.sage/draft/create', body: { rawInput: '新的一段需求' } })

    harness.node('draft-goal').value = '目标 A'
    harness.node('draft-deliverable').value = '交付 B'
    harness.node('draft-responsibility').value = 'role:owner'
    harness.node('draft-project').value = 'project:q3'
    harness.node('draft-clarification').value = '还想确认口径'
    harness.node('draft-save').dispatch('click')
    await harness.refresh()
    expect(harness.requests[1]).toEqual({
      path: '/.sage/draft/update',
      body: {
        draftId: 'draft-1',
        fields: { goal: '目标 A', deliverable: '交付 B', responsibility: 'role:owner', projectRef: 'project:q3' },
        clarification: '还想确认口径',
        selectedEntryIds: [],
      },
    })

    // Ticket 025: 确认建项 first opens the single pre-execution card; the convert that carries
    // the credential is the card's own 确认执行, not this click.
    harness.node('draft-confirm').dispatch('click')
    await harness.settle()
    expect(harness.requests[2]).toEqual({ path: '/.sage/draft/prepare-confirm', body: { draftId: 'draft-1' } })
  })

  it('carries only the checked history entries into the save request', async () => {
    const harness = await bootSagePage(statePayload({
      draft: unlocked([draft({ history: [
        { entryId: 'entry-1', text: '第一条前史', selected: false },
        { entryId: 'entry-2', text: '第二条前史', selected: false },
      ] })]),
    }))
    const rows = harness.node('draft-history').children
    expect(rows).toHaveLength(2)
    const toggle = rows[1]?.querySelector('[data-history-toggle]')
    if (toggle !== null && toggle !== undefined) toggle.checked = true
    harness.node('draft-save').dispatch('click')
    await harness.refresh()
    expect(harness.requests[0]?.body).toMatchObject({ selectedEntryIds: ['entry-2'] })
  })

  it('shows a converted draft as built in place, with the service receipt and no second confirm', async () => {
    const harness = await bootSagePage(statePayload({
      draft: unlocked([
        draft({ status: 'converted', matterRef: 'receipt:42', complete: true, fields: { goal: '季度复盘', deliverable: '对外说明', responsibility: 'role:owner', projectRef: '' } }),
      ]),
    }))
    expect(harness.node('draft-confirm').disabled).toBe(true)
    expect(harness.node('draft-confirm').textContent).toContain('不重复创建')
    expect(harness.node('draft-result').textContent).toContain('receipt:42')
    expect(harness.node('draft-result').textContent).toContain('来自服务回执')
    // The list carries the receipt as its only matter identity — never a locally minted id.
    const matters = harness.node('draft-matters').children
    expect(matters).toHaveLength(1)
    expect(matters[0]?.dataset.matterRef).toBe('receipt:42')
  })

  it('says locked while signed out and hides the whole editing area', async () => {
    const harness = await bootSagePage(statePayload({ draft: { state: 'locked', drafts: [] } }))
    expect(harness.node('draft-lock').textContent).toContain('已锁定')
    expect(harness.node('draft-note').textContent).toContain('重新登录并获准后才会恢复显示')
    expect(harness.node('draft-detail').hidden).toBe(true)
    expect(harness.node('draft-matters').children).toHaveLength(0)
    // The send entry is inert while locked: no button that can only fail.
    expect(harness.node('draft-send').disabled).toBe(true)
  })

  it('keeps the button inert while it is disabled, and refuses an empty send without calling the service', async () => {
    const harness = await bootSagePage(statePayload({ draft: unlocked([draft()]) }))
    harness.node('draft-confirm').dispatch('click')
    await harness.refresh()
    expect(harness.requests).toEqual([])

    harness.node('draft-input').value = '   '
    harness.node('draft-send').dispatch('click')
    await harness.refresh()
    expect(harness.requests).toEqual([])
    expect(harness.node('draft-note').textContent).toContain('先写一句需求')
  })
})

describe('the creation attempt entries (ticket 003, US-005/006/119)', () => {
  const attempt = (state: string) => ({ correlation: 'c-1', at: '2026-10-02T12:00:00.000Z', state })

  it('offers 核对 and no 重试建项 while the outcome is unknown', async () => {
    const harness = await bootSagePage(statePayload({ draft: unlocked([draft({ complete: true, attempt: attempt('unknown') })]) }))
    expect(harness.node('draft-attempt').textContent).toContain('结果未知')
    expect(harness.node('draft-attempt').textContent).toContain('不要重复建项')
    // US-119: the confirm entry is not a retry, and 核对 is the only way forward.
    expect(harness.node('draft-confirm').disabled).toBe(true)
    expect(harness.node('draft-confirm').textContent).toContain('不重复建项')
    expect(harness.node('draft-reconcile').hidden).toBe(false)
    expect(harness.node('draft-cancel').hidden).toBe(true)
    const labels = renderSageDocument().slice(renderSageDocument().indexOf('id="panel-matter"')).match(/<button[^>]*>([^<]*)</gu) ?? []
    expect(labels.some((label) => label.includes('重试建项'))).toBe(false)

    harness.node('draft-reconcile').dispatch('click')
    await harness.refresh()
    expect(harness.requests[0]).toEqual({ path: '/.sage/draft/reconcile', body: { draftId: 'draft-1' } })
  })

  it('lets a pending confirmation be waited on or cancelled, without losing content', async () => {
    const harness = await bootSagePage(statePayload({
      draft: unlocked([draft({ complete: true, attempt: attempt('pending'), clarification: '还想确认口径', fields: { goal: 'g', deliverable: 'd', responsibility: 'r', projectRef: 'p' } })]),
    }))
    expect(harness.node('draft-attempt').textContent).toContain('创建中')
    expect(harness.node('draft-attempt').textContent).toContain('草案内容不会丢')
    expect(harness.node('draft-cancel').hidden).toBe(false)
    expect(harness.node('draft-reconcile').hidden).toBe(true)
    expect(harness.node('draft-confirm').disabled).toBe(true)

    harness.node('draft-cancel').dispatch('click')
    await harness.refresh()
    expect(harness.requests[0]).toEqual({ path: '/.sage/draft/cancel', body: { draftId: 'draft-1' } })
    // The typed content is still on screen after the cancel round-trip.
    expect(harness.node('draft-goal').value).toBe('g')
    expect(harness.node('draft-clarification').value).toBe('还想确认口径')
  })

  it('lets a failed attempt be corrected and re-confirmed in place', async () => {
    const harness = await bootSagePage(statePayload({ draft: unlocked([draft({ complete: true, attempt: attempt('failed') })]) }))
    expect(harness.node('draft-attempt').textContent).toContain('确定失败')
    expect(harness.node('draft-attempt').textContent).toContain('修正后再次确认')
    // A failure is a definite "did not take effect", so the confirm entry is available again.
    expect(harness.node('draft-confirm').disabled).toBe(false)
    expect(harness.node('draft-reconcile').hidden).toBe(true)
    expect(harness.node('draft-cancel').hidden).toBe(true)
  })

  it('shows nothing about attempts when none was ever opened', async () => {
    const harness = await bootSagePage(statePayload({ draft: unlocked([draft({ complete: true })]) }))
    expect(harness.node('draft-attempt').textContent).toBe('')
    expect(harness.node('draft-reconcile').hidden).toBe(true)
    expect(harness.node('draft-cancel').hidden).toBe(true)
  })
})

describe('the pre-execution confirmation card (ticket 025, US-124~128)', () => {
  const card = {
    confirmationId: 'cf-1',
    preparedAt: '2026-10-02T21:00:00.000Z',
    target: { matterRef: 'draft:draft-1', revisionRef: 'draft-revision:1' },
    action: { type: 'create-matter', scope: 'revision' },
    resources: [{ kind: 'execution-environment', ref: null, state: 'not-selected' }],
    prerequisites: [{ name: 'execution-environment', state: 'unknown', note: 'no-environment-chosen' }],
    costEstimate: { state: 'unavailable', note: 'estimate-unavailable' },
    effect: 'not-yet-happened',
  }
  const ready = async (convertResponse?: unknown) => bootSagePage(
    statePayload({ draft: unlocked([draft({ complete: true, fields: { goal: 'g', deliverable: 'd', responsibility: 'r', projectRef: '' } })]) }),
    {
      '/.sage/draft/prepare-confirm': { state: 'prepared', draftId: 'draft-1', card },
      ...(convertResponse === undefined ? {} : { '/.sage/draft/convert': convertResponse }),
    },
  )

  it('shows the single card: object, action, scope, resources, time, prerequisites, honest cost line', async () => {
    const harness = await ready()
    harness.node('draft-confirm').dispatch('click')
    await harness.settle()
    expect(harness.requests[0]).toEqual({ path: '/.sage/draft/prepare-confirm', body: { draftId: 'draft-1' } })
    const region = harness.node('draft-confirmation')
    expect(region.hidden).toBe(false)
    expect(harness.node('confirm-target').textContent).toContain('draft:draft-1')
    expect(harness.node('confirm-action').textContent).toContain('create-matter')
    expect(harness.node('confirm-scope').textContent).toContain('本修订')
    expect(harness.node('confirm-resources').textContent).toContain('未选定')
    expect(harness.node('confirm-time').textContent).toBe('2026-10-02T21:00:00.000Z')
    expect(harness.node('confirm-prerequisites').textContent).toContain('未断言')
    expect(harness.node('confirm-cost').textContent).toContain('暂不可得')
    // US-127/128 in the card's own (static) words, and exactly two controls in the markup: one
    // confirm, one local cancel, no routing — never borrowing approval vocabulary (US-128).
    const html = renderSageDocument()
    const block = html.slice(html.indexOf('id="draft-confirmation"'), html.indexOf('id="draft-result"'))
    expect(block).toContain('确认不等于外部效果已发生')
    expect(block).toContain('重新确认')
    expect(block.match(/<button/gu) ?? []).toHaveLength(2)
    expect(block).toContain('确认执行')
    expect(block).toContain('取消确认')
    expect(block).not.toContain('审批')
    expect(block).not.toContain('approv')
  })

  it('keeps the card across the 2s poll and posts the credential once on 确认执行', async () => {
    const harness = await ready()
    harness.node('draft-confirm').dispatch('click')
    await harness.settle()
    await harness.refresh()
    expect(harness.node('draft-confirmation').hidden).toBe(false)
    harness.node('draft-confirm-execute').dispatch('click')
    await harness.settle()
    expect(harness.requests[1]).toEqual({ path: '/.sage/draft/convert', body: { draftId: 'draft-1', confirmationId: 'cf-1' } })
    expect(harness.node('draft-confirmation').hidden).toBe(true)
  })

  it('cancels the card locally without calling the service', async () => {
    const harness = await ready()
    harness.node('draft-confirm').dispatch('click')
    await harness.settle()
    harness.node('draft-confirm-cancel').dispatch('click')
    await harness.settle()
    expect(harness.node('draft-confirmation').hidden).toBe(true)
    expect(harness.requests).toHaveLength(1)
  })

  it('turns a stale confirmation into an explicit re-confirm notice that survives the poll', async () => {
    const harness = await ready({ state: 'denied', draftId: 'draft-1', code: 'confirmation-stale', stage: 'confirmation', retryable: false })
    harness.node('draft-confirm').dispatch('click')
    await harness.settle()
    harness.node('draft-confirm-execute').dispatch('click')
    await harness.settle()
    expect(harness.node('draft-confirmation').hidden).toBe(true)
    expect(harness.node('draft-note').textContent).toContain('失效')
    await harness.refresh()
    expect(harness.node('draft-note').textContent).toContain('失效')
    expect(harness.node('draft-confirm').disabled).toBe(false)
  })

  it('shows the refusal when no card can be minted, and never pretends a card exists', async () => {
    const harness = await bootSagePage(
      statePayload({ draft: unlocked([draft({ complete: true })]) }),
      { '/.sage/draft/prepare-confirm': { state: 'refused', draftId: 'draft-1', code: 'confirmation-unavailable' } },
    )
    harness.node('draft-confirm').dispatch('click')
    await harness.settle()
    expect(harness.node('draft-note').textContent).toContain('确认')
    expect(harness.node('draft-confirmation').hidden).toBe(true)
    expect(harness.requests).toHaveLength(1)
  })
})
