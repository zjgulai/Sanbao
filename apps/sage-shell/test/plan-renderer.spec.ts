import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, setDraftFields, statePayload, type FakeElement, setLinkSelection } from './support/sage-page.js'

/**
 * Ticket 032 on the shipped page (US-165~171).
 *
 * Batch 19 / P3 (ADR-0261): the plan card moved to the React region — its bridge contract and
 * rendering are pinned in `test/plan-region-bridge.spec.ts` and
 * `test/product-app/plan-region.spec.tsx`. What stays on the legacy wire here: the exit checklist
 * composes real projection facts with the page's true unsaved edits, and the guide/environment
 * cards stay read-only with nothing to write.
 */

const workspaces = {
  source: 'workspace-follow', state: 'read', reason: null,
  entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
  order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
}

const draft = (overrides: Record<string, unknown> = {}) => ({
  draftId: 'draft-1',
  fields: { goal: '', deliverable: '', responsibility: '', projectRef: '' },
  clarification: '', history: [], status: 'editing', matterRef: null, attempt: null, complete: true,
  createdAt: 'x', updatedAt: 'x', ...overrides,
})

const payload = (plans: unknown, channel: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => statePayload({
  workspaces,
  matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
  draft: { state: 'unlocked', drafts: [draft()] },
  runtime: { status: 'ready', message: 'dsh 0.2.0-rc.2', retryable: true },
  sessionChannel: {
    state: 'read', sessionId: 'sess-1', execution: 'idle', lastTurnEnd: null, transcript: [], reconciled: false,
    streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [], ...channel,
  },
  plans,
  ...extra,
})

const setContext = (harness: Awaited<ReturnType<typeof bootSagePage>>) => {
  setLinkSelection('matter:1', 'ws-1')
}

describe('the exit checklist, guide and environment cards (ticket 032)', () => {
  it('lists real impact facts including true unsaved edits, and cancel posts nothing', async () => {
    const harness = await bootSagePage(payload(
      { state: 'read', plans: [], lastStepRun: null },
      { execution: 'executing', pending: [{ itemId: 'p-1', text: '补充要求', state: 'pending', note: null, editable: true }] },
    ))
    // A true unsaved edit: the typed goal differs from the projection.
    setDraftFields({ goal: '还没保存的新目标' })
    harness.node('exit-check-open').dispatch('click')
    await harness.settle()
    const rows = harness.node('exit-impact-rows').children.map((row) => row.textContent)
    expect(rows.join('\n')).toContain('进行中任务')
    expect(rows.join('\n')).toContain('待继续输入 1 条')
    expect(rows.join('\n')).toContain('未保存的改动（目标）')

    harness.node('exit-cancel').dispatch('click')
    await harness.settle()
    expect(harness.node('exit-dialog').hidden).toBe(true)
    expect(harness.requests).toEqual([])
  })

  it('stop requests the session stop and never claims the remote outcome is known', async () => {
    const harness = await bootSagePage(payload({ state: 'read', plans: [], lastStepRun: null }, { execution: 'executing' }))
    harness.node('exit-check-open').dispatch('click')
    await harness.settle()
    // The 011 select is re-derived by every poll; pick the matter right before the stop click.
    setContext(harness)
    harness.node('exit-stop').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/session/stop', body: { matterRef: 'matter:1' } }])
    expect(harness.node('exit-note').textContent).toContain('不能承诺撤回')
    expect(harness.node('exit-note').textContent).toContain('不等于远端效果已知')
  })

  it('the guide toggles locally with zero requests and the environment card stays read-only', async () => {
    const document = renderSageDocument()
    const slice = document.slice(document.indexOf('class="sage-card sage-exit-card"'), document.indexOf('id="settings-leaf-section"'))
    const labels = (slice.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</g, ''))
    expect(labels).toEqual(['退出 Sage…（先看影响清单）', '取消（保持后台运行）', '停止进行中的任务并标记可退出', '展开要点'])
    for (const word of ['装配', '远端执行', '接管']) expect(labels.join('|'), word).not.toContain(word)
    expect(slice).toContain('引导不替代登录与授权、不自动修改任何配置')
    expect(slice).toContain('实验不直通生产')

    const harness = await bootSagePage(payload({ state: 'read', plans: [], lastStepRun: null }))
    const guideHidden = harness.node('guide-rows').hidden
    harness.node('guide-toggle').dispatch('click')
    await harness.settle()
    expect(harness.node('guide-rows').hidden).toBe(!guideHidden)
    expect(harness.requests).toEqual([])
    expect(harness.node('env-runtime').textContent).toContain('dsh 0.2.0-rc.2')
    expect(harness.node('env-matter-ref').textContent).toContain('ws-1')
    expect(harness.node('env-fold').textContent).toContain('已读取')
  })

  // Relocated from the link card's driver spec (batch 20): it never touched the link DOM — it
  // pins the command surface's words for an unavailable default environment.
  it('words an unavailable environment as a prompt, not as a silent switch', async () => {
    const harness = await bootSagePage(statePayload({
      draft: { state: 'unlocked', drafts: [draft()] },
      service: {
        status: 'unavailable', reason: 'authenticated', correlation: 'c',
        auth: { status: 'signed-in', displayName: '林一' },
        command: { correlation: 'c-9', outcome: 'not-ready', code: 'environment-unavailable', retryable: true },
      },
    }))
    const note = harness.node('command-note').textContent
    expect(note).toContain('该事项选定的默认执行环境已不可用')
    expect(note).toContain('不会自动换到别的工作区')
    expect(harness.node('retry').hidden).toBe(true)
  })
})
