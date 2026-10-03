import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 038 on the shipped page (US-189~191): the input-area selectors render the mounted
 * catalog read-only; selecting is one POST and produces a "carried with the next send" chip that
 * never claims 已启用; unmounted/unreadable states keep their own honest sentences.
 */

const skill = (name: string, overrides: Record<string, unknown> = {}) => ({
  name, description: null, source: 'user', provider: 'filesystem', userInvocable: true, modelInvocable: true,
  ...overrides,
})

const selection = (overrides: Record<string, unknown> = {}) => ({
  state: 'read',
  skills: [skill('alpha'), skill('beta', { userInvocable: false, modelInvocable: true }), skill('gamma', { source: 'project' })],
  skillsNote: null,
  plugins: [{ identity: 'component:harness', version: '1.0.0', digestShort: 'abc123…' }],
  pluginsNote: null,
  selected: [],
  code: null,
  at: 't',
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
    state: 'read', sessionId: 'sess-1', execution: 'idle', lastTurnEnd: 'completed',
    reply: { text: '回复', endKind: 'completed', failed: false, actions: ['copy', 'quote'] },
    transcript: [], reconciled: false, streamBroken: false, code: null, records: 0, unapplied: 0, paused: false, pending: [],
    queue: { state: 'read', occurrences: [] },
  },
  sessionClarifications: { state: 'read', pending: [], deferred: [], receipts: [], code: null, at: null },
  sessionAnchors: { state: 'read', anchors: [], located: null, code: null, at: null },
  sessionEdits: { state: 'read', records: [], code: null, at: null },
  sessionHistory: { state: 'read', runs: [], hasMore: false, nextBeforeSeq: null, detail: null, at: null },
  plans: { state: 'read', plans: [], lastStepRun: null },
  inputSelections: selection(),
  ...extra,
})

describe('the input-area selectors (ticket 038)', () => {
  it('renders the mounted catalog read-only; selecting is one POST and the chip carries for the next send only', async () => {
    const harness = await bootSagePage(payload(), {
      '/.sage/session/selections': (request: unknown) => {
        const body = request as { action?: string, kind?: string, ref?: string }
        if (body.action === 'select') {
          return { state: 'selected', selected: [{ kind: body.kind ?? 'skill', ref: body.ref ?? 'alpha' }] }
        }
        return { state: 'cleared', selected: [] }
      },
    })
    await harness.refresh()
    const skillRows = harness.node('selection-skills').children
    expect(skillRows[0]?.textContent).toContain('alpha')
    expect(skillRows[0]?.textContent).toContain('来源：user·filesystem')
    expect(skillRows[0]?.textContent).toContain('可选用（本入口）')
    // 仅模型可调用的技能：显式不可选，不说成"已失效"。
    expect(skillRows[1]?.textContent).toContain('仅模型可调用（本入口不可选）')
    expect(skillRows[1]?.querySelector('[data-selection-action="select"]')).toBeNull()
    const pluginRows = harness.node('selection-plugins').children
    expect(pluginRows[0]?.textContent).toContain('component:harness')
    expect(pluginRows[0]?.textContent).toContain('已挂载（组合内实际存在）')

    harness.node('selection-skills').dispatch('click', { target: skillRows[0]?.querySelector('[data-selection-action="select"]') })
    await harness.settle()
    expect(harness.requests).toEqual([
      { path: '/.sage/session/selections', body: { action: 'select', kind: 'skill', ref: 'alpha' } },
    ])
    // chips 仍来自投影（main 侧持有选择）：下一轮读回选中的投影。
    harness.setPayload(payload({ inputSelections: selection({ selected: [{ kind: 'skill', ref: 'alpha' }] }) }))
    await harness.refresh()
    const chips = harness.node('selection-chips').children
    expect(chips[0]?.textContent).toContain('已选：技能 alpha（随下一次发送携带）')
    // 选择不写"已启用"。
    expect(harness.node('selection-chips').textContent).not.toContain('已启用')
  })

  it('an unmounted plugin is never said to be disabled, and the plugin row says so on its own', async () => {
    const harness = await bootSagePage(payload({
      inputSelections: selection({ plugins: [], pluginsNote: '未核验：挂载清单不可读（不以空列表冒充，也不说成已停用）。' }),
    }))
    await harness.refresh()
    const rows = harness.node('selection-plugins').children
    expect(rows[0]?.textContent).toContain('未核验：挂载清单不可读')
    expect(rows[0]?.textContent).toContain('不说成已停用')
    expect(harness.node('selection-plugins').textContent).not.toContain('已停用[')
  })

  it('keeps an incomplete skills discovery honest instead of calling anything 已失效', async () => {
    const harness = await bootSagePage(payload({
      inputSelections: selection({ skillsNote: '清单不完整（发现未完成）：不得当作"已失效"，可稍后重试。' }),
    }))
    await harness.refresh()
    expect(harness.node('selection-note').textContent).toContain('不得当作"已失效"')
  })

  it('clearing a chip is one POST and drops the chip on the next projection', async () => {
    const harness = await bootSagePage(payload({
      inputSelections: selection({ selected: [{ kind: 'plugin', ref: 'component:harness' }] }),
    }), {
      '/.sage/session/selections': { state: 'cleared', selected: [] },
    })
    await harness.refresh()
    expect(harness.node('selection-chips').children[0]?.textContent).toContain('不改变启用状态，也不代表已获得能力')
    harness.node('selection-chips').dispatch('click', { target: harness.node('selection-chips').children[0]?.querySelector('[data-selection-clear]') })
    await harness.settle()
    expect(harness.requests).toEqual([
      { path: '/.sage/session/selections', body: { action: 'clear', kind: 'plugin', ref: 'component:harness' } },
    ])
  })

  it('keeps the unreadable catalog honest instead of pretending an empty list', async () => {
    const harness = await bootSagePage(payload({
      inputSelections: selection({ state: 'unavailable', skills: [], plugins: [], pluginsNote: null, code: 'skills-unavailable' }),
    }))
    await harness.refresh()
    expect(harness.node('selection-skills').children).toHaveLength(0)
    expect(harness.node('selection-note').textContent).toContain('未核验：技能清单不可读（不以空列表冒充能力）')
  })
})
