import { afterEach, describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, setDraftFields, statePayload } from './support/sage-page.js'

/**
 * Batch 23 / P3 (ADR-0261 strangler): the draft card (`#draft-*`, `#confirm-*`,
 * `#site-template-*`) is owned by the React app. The legacy script publishes its region slice
 * through `__SAGE_APP_SET_REGION__`, exposes the six named acts through
 * `__SAGE_LEGACY_ACTIONS__` (exact bodies, refusal text, refresh) and keeps the exit-check's
 * unsaved chain reading the field mirror pushed through `__SAGE_APP_SET_DRAFT_FIELDS__`;
 * it must not write the card's DOM anymore. Rendering is pinned in
 * `test/product-app/draft-region.spec.tsx`.
 */

interface RegionMessage {
  readonly kind: string
  readonly [key: string]: unknown
}

interface RegionSink {
  readonly byRegion: Array<{ region: string, message: RegionMessage }>
  readonly restore: () => void
}

interface LegacyActionsShape {
  sendDraft?: (rawInput: string) => Promise<string | null>
  saveDraft?: (draftId: string, fields: { goal: string, deliverable: string, responsibility: string, projectRef: string }, clarification: string, selectedEntryIds: readonly string[]) => Promise<void>
  reconcileDraft?: (draftId: string) => Promise<void>
  cancelDraftAttempt?: (draftId: string) => Promise<void>
  prepareDraftConfirm?: (draftId: string) => Promise<{ kind: string, card?: unknown, notice?: string }>
  executeDraftConvert?: (draftId: string, confirmationId: string) => Promise<{ kind: string, notice?: string }>
}

let sink: RegionSink | undefined
let restoreActions: (() => void) | undefined

afterEach(() => {
  sink?.restore()
  sink = undefined
  restoreActions?.()
  restoreActions = undefined
})

function installRegionSink(): void {
  const byRegion: Array<{ region: string, message: RegionMessage }> = []
  const target = globalThis as { __SAGE_APP_SET_REGION__?: unknown }
  const previous = target.__SAGE_APP_SET_REGION__
  target.__SAGE_APP_SET_REGION__ = (region: string, message: RegionMessage): void => { byRegion.push({ region, message }) }
  sink = {
    byRegion,
    restore: () => {
      if (previous === undefined) delete target.__SAGE_APP_SET_REGION__
      else target.__SAGE_APP_SET_REGION__ = previous
    },
  }
}

function lastFor(region: string): RegionMessage | undefined {
  return sink?.byRegion.filter((entry) => entry.region === region).at(-1)?.message
}

function legacyActions(): LegacyActionsShape {
  const bridge = (globalThis as unknown as { __SAGE_LEGACY_ACTIONS__?: LegacyActionsShape }).__SAGE_LEGACY_ACTIONS__
  expect(bridge, 'legacy down-bridge must be installed at boot').toBeDefined()
  return bridge!
}

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
const serviceBlock = (auth: { status: string, displayName: string | null }) => ({
  status: 'unavailable', reason: 'authenticated', correlation: 'c', auth, command: null,
})

describe('draft region bridge (batch 23)', () => {
  it('publishes read/locked/unavailable slices with drafts, auth and the template catalog', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({
      service: serviceBlock({ status: 'signed-in', displayName: '林一' }),
      draft: unlocked([draft()]),
      siteTemplates: { state: 'read', reason: null, entries: [{ templateId: 'tpl-1', name: '数字粒子 · 企业官网', source: 'sage-builtin', version: '1', prompt: 'p' }] },
    }))
    const slice = lastFor('draft')
    expect(slice?.kind).toBe('read')
    const slot = slice?.slot as { drafts: unknown[], auth: { status: string, displayName: string | null }, siteTemplates: { state: string, entries: unknown[] } }
    expect(slot.drafts).toHaveLength(1)
    expect(slot.auth).toEqual({ status: 'signed-in', displayName: '林一' })
    expect(slot.siteTemplates.state).toBe('read')
    expect(slot.siteTemplates.entries).toHaveLength(1)
    expect(page.node('draft-lock').textContent).toBe('')
    expect(page.node('draft-goal').value).toBe('')

    const locked = await bootSagePage(statePayload({ draft: { state: 'locked', drafts: [] } }))
    expect(lastFor('draft')?.kind).toBe('locked')

    const missing = await bootSagePage(statePayload({}))
    expect(lastFor('draft')?.kind).toBe('unavailable')
    expect(missing.node('draft-lock').textContent).toBe('')
  })

  it('keeps the ticket-002/025/040 words and control rosters pinned on the static first frame', () => {
    const document = renderSageDocument()
    const card = document.slice(document.indexOf('class="sage-card sage-draft-card"'), document.indexOf('class="sage-card sage-session-card"'))
    expect(card).toContain('登出后加密锁定、期间不读不写，不自动同步、不换机接续')
    expect(card).toContain('不会自动写入交付或责任')
    const labels = (card.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</g, ''))
    expect(labels).toEqual([
      '发送并形成草案', '保存草案', '确认建项', '核对同一请求', '取消未提交的确认',
      '确认执行', '取消确认',
    ])
    const confirmBlock = document.slice(document.indexOf('id="draft-confirmation"'), document.indexOf('id="draft-result"'))
    expect(confirmBlock).toContain('确认不等于外部效果已发生')
    expect(confirmBlock).toContain('重新确认')
    expect(confirmBlock.match(/<button/gu) ?? []).toHaveLength(2)
    expect(confirmBlock).not.toContain('审批')
    expect(document).toContain('id="sage-region-draft"')
  })

  it('runs the six draft acts through the down-bridge with exact bodies and notices', async () => {
    const page = await bootSagePage(statePayload({ draft: unlocked([draft({ complete: true })]) }), {
      '/.sage/draft/prepare-confirm': { state: 'prepared', draftId: 'draft-1', card: { confirmationId: 'cf-1' } },
      '/.sage/draft/convert': { state: 'denied', draftId: 'draft-1', code: 'confirmation-stale', stage: 'confirmation', retryable: false },
    })
    const actions = legacyActions()

    expect(await actions.sendDraft!('   ')).toBe('先写一句需求再发送。')
    expect(await actions.sendDraft!('  新的一段需求  ')).toBeNull()
    await actions.saveDraft!('draft-1', { goal: '目标 A', deliverable: '交付 B', responsibility: 'role:owner', projectRef: 'project:q3' }, '还想确认口径', ['entry-2'])
    await actions.reconcileDraft!('draft-1')
    await actions.cancelDraftAttempt!('draft-1')
    const prepared = await actions.prepareDraftConfirm!('draft-1')
    const converted = await actions.executeDraftConvert!('draft-1', 'cf-1')
    await page.settle()
    expect(page.requests[0]).toEqual({ path: '/.sage/draft/create', body: { rawInput: '新的一段需求' } })
    expect(page.requests[1]).toEqual({
      path: '/.sage/draft/update',
      body: {
        draftId: 'draft-1',
        fields: { goal: '目标 A', deliverable: '交付 B', responsibility: 'role:owner', projectRef: 'project:q3' },
        clarification: '还想确认口径',
        selectedEntryIds: ['entry-2'],
      },
    })
    expect(page.requests[2]).toEqual({ path: '/.sage/draft/reconcile', body: { draftId: 'draft-1' } })
    expect(page.requests[3]).toEqual({ path: '/.sage/draft/cancel', body: { draftId: 'draft-1' } })
    expect(page.requests[4]).toEqual({ path: '/.sage/draft/prepare-confirm', body: { draftId: 'draft-1' } })
    expect(page.requests[5]).toEqual({ path: '/.sage/draft/convert', body: { draftId: 'draft-1', confirmationId: 'cf-1' } })
    expect(prepared.kind).toBe('prepared')
    expect(converted.kind).toBe('notice')
    expect(converted.notice).toContain('失效')
    // The card never lands in this DOM: the untouched field is the sentinel (the fake DOM does
    // not parse the static `hidden` attribute).
    expect(page.node('confirm-target').textContent).toBe('')
    expect(page.node('draft-goal').value).toBe('')
  })

  it('words an unmintable card honestly through the same sentence the card shows', async () => {
    const page = await bootSagePage(statePayload({ draft: unlocked([draft({ complete: true })]) }), {
      '/.sage/draft/prepare-confirm': { state: 'refused', draftId: 'draft-1', code: 'confirmation-unavailable' },
    })
    const actions = legacyActions()
    const result = await actions.prepareDraftConfirm!('draft-1')
    expect(result.kind).toBe('notice')
    expect(result.notice).toContain('确认')
    await page.settle()
    expect(page.requests).toHaveLength(1)
  })

  it('reads the exit-check unsaved chain from the field mirror, not from the card DOM', async () => {
    const page = await bootSagePage(statePayload({
      draft: unlocked([draft({ fields: { goal: '已保存的目标', deliverable: '', responsibility: '', projectRef: '' } })]),
      sessionChannel: { state: 'read', sessionId: 's1', execution: 'idle', lastTurnEnd: null, reconciled: false, streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [], transcript: [] },
    }))
    // Nothing pushed yet: the mirror is empty while the projection holds a saved value → unsaved.
    page.node('exit-check-open').dispatch('click')
    await page.settle()
    let rows = page.node('exit-impact-rows').children.map((row) => row.textContent)
    expect(rows.join('\n')).toContain('未保存的改动（目标）')

    // Clear the mirror semantics: push values equal to the projection → no unsaved row.
    setDraftFields({ goal: '已保存的目标' })
    page.node('exit-check-open').dispatch('click')
    await page.settle()
    rows = page.node('exit-impact-rows').children.map((row) => row.textContent)
    expect(rows.join('\n')).not.toContain('未保存的改动')

    setDraftFields({ goal: '还没保存的新目标', clarification: '新的澄清' })
    page.node('exit-check-open').dispatch('click')
    await page.settle()
    rows = page.node('exit-impact-rows').children.map((row) => row.textContent)
    expect(rows.join('\n')).toContain('未保存的改动（目标、澄清）')
  })
})
