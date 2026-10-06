import { afterEach, describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload, setLinkSelection } from './support/sage-page.js'

/**
 * Batch 18 / P3 (ADR-0261 strangler): the side-chat card (`#side-chat-*`) and the action-items
 * card (`#action-item-*`, corrections and projects included) are owned by the React app. The
 * legacy script publishes their region slices through `__SAGE_APP_SET_REGION__` and exposes the
 * wire actions through `__SAGE_LEGACY_ACTIONS__` (requests, refusal text, refresh, and the
 * link-card selection reads that stay legacy); it must not write either card's DOM anymore.
 * Rendering is pinned in `test/product-app/side-chat-action-items.spec.tsx`.
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
  createSideChat?: () => Promise<string>
  readSideChat?: (sideChatId: string) => Promise<{ kind: string, transcript?: unknown[], execution?: string, notice?: string }>
  sendSideChat?: (sideChatId: string, text: string) => Promise<{ notice: string, transcript?: unknown[] | null }>
  returnSideChat?: (sideChatId: string, text: string) => Promise<string>
  createActionItem?: (title: string, note: string | null) => Promise<string | null>
  actionItemRowAction?: (actionId: string, action: 'start' | 'complete') => Promise<void>
  submitCorrection?: (original: { text: string, at: string | null } | null, text: string) => Promise<string | null>
  createProject?: (name: string) => Promise<string | null>
  assignProject?: (projectRef: string) => Promise<string | null>
  unassignProject?: () => Promise<string | null>
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

const workspaces = {
  source: 'workspace-follow', state: 'read', reason: null,
  entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
  order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
}

const sessionChannel = {
  state: 'read', sessionId: 's1', execution: 'idle', lastTurnEnd: 't-end', reconciled: false, streamBroken: false,
  code: null, records: 2, unapplied: 0, paused: false, pending: [],
  transcript: [
    { role: 'user', text: '把预算数字核对一下', at: '2026-10-03T09:00:00.000Z' },
    { role: 'assistant', text: '好的。', at: '2026-10-03T09:01:00.000Z' },
    { role: 'user', text: '再补一版对比', at: '2026-10-03T09:02:00.000Z' },
  ],
}

const sideChatsRead = {
  state: 'read',
  items: [
    { sideChatId: 'sc-1', execution: 'idle', lastTurnEnd: 't1', createdAt: '2026-10-03T09:10:00.000Z', atSeq: null },
    { sideChatId: 'sc-2', execution: 'executing', lastTurnEnd: null, createdAt: '2026-10-03T09:20:00.000Z', atSeq: 4 },
  ],
}

const actionItemsRead = {
  state: 'read',
  items: [{
    actionId: 'act-1', title: '补充渠道对比', state: 'in-progress', revision: 2,
    records: [{ recordNo: 1, at: '2026-10-03T09:30:00.000Z', basis: { revision: 2, title: '补充渠道对比', note: '登记时冻结' } }],
  }],
  corrections: [{
    correctionId: 'cor-1', text: '更正后的要求',
    original: { text: '原要求', at: '2026-10-03T08:00:00.000Z' },
    receipt: { state: 'pending-application', reason: 'queued' },
  }],
}

const projectsRead = {
  state: 'read',
  projects: [{ projectRef: 'prj-1', name: '增长专项', matterRefs: ['matter:1'] }],
}

describe('side-chat region bridge (batch 18)', () => {
  it('publishes the side-chats slice and leaves the card DOM untouched', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({ sideChats: sideChatsRead }))
    expect(lastFor('side-chats')).toEqual({ kind: 'read', slot: sideChatsRead })
    expect(page.node('side-chat-rows').children).toHaveLength(0)
    expect(page.node('side-chat-note').textContent).toBe('')

    const down = await bootSagePage(statePayload({}))
    expect(lastFor('side-chats')).toEqual({ kind: 'unavailable' })
    expect(down.node('side-chat-rows').children).toHaveLength(0)
  })

  it('keeps the ticket-024 roster pinned on the static first frame', () => {
    const document = renderSageDocument()
    const slice = document.slice(document.indexOf('class="sage-card sage-side-chat-card"'), document.indexOf('class="sage-artifact-section"'))
    const labels = (slice.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</g, ''))
    expect(labels).toEqual(['新建侧聊（派生当前主对话）', '发送到侧聊', '带回主对话（显式）', '收起'])
    expect(slice).toContain('不写入主对话流')
    expect(document).toContain('id="sage-region-side-chats"')
  })

  it('runs the four named side-chat acts through the down-bridge with exact bodies and notices', async () => {
    const page = await bootSagePage(statePayload({
      workspaces,
      sideChats: sideChatsRead,
      matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
    }), {
      '/.sage/side-chats': (request: unknown) => {
        const body = request as { action?: string } | null
        if (body?.action === 'create') return { state: 'created', item: { sideChatId: 'sc-9' } }
        if (body?.action === 'read') {
          return (body as { sideChatId?: string }).sideChatId === 'sc-9'
            ? { state: 'read', channel: { execution: 'idle', transcript: [{ role: 'user', text: '侧聊里的问题' }, { role: 'assistant', text: '侧聊里的回答' }] } }
            : { state: 'refused', code: 'side-chat-unknown' }
        }
        if (body?.action === 'send') return { state: 'accepted' }
        if (body?.action === 'return') return { state: 'accepted' }
        return { state: 'refused', code: 'side-chat-unknown' }
      },
    })
    const actions = legacyActions()

    const noContext = await actions.createSideChat!()
    expect(noContext).toContain('先在上面选好事项与工作区')
    expect(page.requests).toHaveLength(0)

    setLinkSelection('matter:1', 'ws-1')
    const created = await actions.createSideChat!()
    expect(page.requests[0]).toEqual({ path: '/.sage/side-chats', body: { action: 'create', matterRef: 'matter:1' } })
    expect(created).toBe('已派生侧聊 sc-9（子会话，独立上下文；主对话历史未改动）。')
    expect(page.node('side-chat-rows').children).toHaveLength(0)

    const read = await actions.readSideChat!('sc-9')
    expect(page.requests[1]).toEqual({ path: '/.sage/side-chats', body: { action: 'read', sideChatId: 'sc-9' } })
    expect(read.kind).toBe('read')
    expect(read.transcript).toEqual([{ role: 'user', text: '侧聊里的问题' }, { role: 'assistant', text: '侧聊里的回答' }])

    const failed = await actions.readSideChat!('sc-x')
    expect(failed.kind).toBe('failed')

    const sent = await actions.sendSideChat!('sc-9', '侧聊里的问题')
    expect(page.requests[3]).toEqual({ path: '/.sage/side-chats', body: { action: 'send', sideChatId: 'sc-9', text: '侧聊里的问题' } })
    expect(sent.notice).toBe('已发送到侧聊（受理≠执行；这条只在子会话里）。')
    expect(sent.transcript?.kind).toBe('read')
    expect(Array.isArray(sent.transcript?.transcript)).toBe(true)

    const returned = await actions.returnSideChat!('sc-9', '带回的结论')
    // The send path re-reads the child transcript, so the return request lands after it.
    expect(page.requests.at(-1)).toEqual({ path: '/.sage/side-chats', body: { action: 'return', sideChatId: 'sc-9', text: '带回的结论' } })
    expect(returned).toBe('已把这段文本作为主对话输入发出（受理≠执行；侧聊历史未改动）。')
  })

  it('keeps the side-chat preconditions honest through the down-bridge', async () => {
    const page = await bootSagePage(statePayload({ sideChats: sideChatsRead }))
    const actions = legacyActions()
    expect((await actions.sendSideChat!('sc-9', '')).notice).toContain('先打开一条侧聊并写好输入。')
    expect(await actions.returnSideChat!('sc-9', '  ')).toContain('先打开一条侧聊并写好要带回的文本。')
    expect(page.requests).toHaveLength(0)
  })
})

describe('action-items region bridge (batch 18)', () => {
  it('publishes the action-items slice with records, corrections, originals and projects; leaves the card DOM untouched', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({
      actionItems: actionItemsRead,
      projects: projectsRead,
      sessionChannel,
    }))
    const slice = lastFor('action-items')
    expect(slice?.kind).toBe('read')
    const slot = slice?.slot as { items: unknown[], corrections: unknown[], originals: unknown[], projectsState: string, projects: unknown[] }
    expect(slot.items).toBe(actionItemsRead.items)
    expect(slot.corrections).toBe(actionItemsRead.corrections)
    expect(slot.originals).toEqual([
      { text: '把预算数字核对一下', at: '2026-10-03T09:00:00.000Z' },
      { text: '再补一版对比', at: '2026-10-03T09:02:00.000Z' },
    ])
    expect(slot.projectsState).toBe('read')
    expect(slot.projects).toBe(projectsRead.projects)
    expect(page.node('action-item-rows').children).toHaveLength(0)
    expect(page.node('action-item-note').textContent).toBe('')
    expect(page.node('correction-rows').children).toHaveLength(0)
    expect(page.node('project-rows').children).toHaveLength(0)

    const down = await bootSagePage(statePayload({}))
    expect(lastFor('action-items')?.kind).toBe('unavailable')
    expect(down.node('action-item-rows').children).toHaveLength(0)
  })

  it('keeps the ticket-028 words and control roster pinned on the static first frame', () => {
    const document = renderSageDocument()
    const slice = document.slice(document.indexOf('class="sage-card sage-action-items-card"'), document.indexOf('class="sage-matter-admin-section"'))
    expect(slice).toContain('不等同交付项、待办请求、工具调用或一次运行')
    expect(slice).toContain('不改变主责、可见范围或事项事实')
    const labels = (slice.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</g, ''))
    expect(labels).toEqual([
      '新建行动项（归属所选事项）',
      '提交更正（关联原要求的新消息）',
      '新建项目',
      '把所选事项归属到该项目',
      '解除所选事项的项目归属',
    ])
    expect(document).toContain('id="sage-region-action-items"')
  })

  it('runs create/start/complete, correction, project acts through the down-bridge with exact bodies', async () => {
    const page = await bootSagePage(statePayload({
      workspaces,
      actionItems: actionItemsRead,
      projects: projectsRead,
      sessionChannel,
      matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
    }))
    const actions = legacyActions()

    expect(await actions.createActionItem!('  ', null)).toContain('先在「事项 ↔ 工作区关联」里选好事项')
    setLinkSelection('matter:1', 'ws-1')
    expect(await actions.createActionItem!('   ', null)).toContain('先写一个行动项标题（≤200 字）。')
    expect(await actions.createActionItem!('补充渠道对比', '说明文本')).toBeNull()
    await page.settle()
    expect(page.requests[0]).toEqual({ path: '/.sage/action-items', body: { action: 'create', matterRef: 'matter:1', title: '补充渠道对比', note: '说明文本' } })

    await actions.actionItemRowAction!('act-1', 'start')
    await actions.actionItemRowAction!('act-1', 'complete')
    await page.settle()
    expect(page.requests[1]).toEqual({ path: '/.sage/action-items', body: { action: 'start', actionId: 'act-1' } })
    expect(page.requests[2]).toEqual({ path: '/.sage/action-items', body: { action: 'complete', actionId: 'act-1' } })

    setLinkSelection('matter:1', 'ws-1')
    expect(await actions.submitCorrection!(null, '文本')).toContain('先选一条原要求（已发送的消息）。')
    expect(await actions.submitCorrection!({ text: '原要求', at: null }, '   ')).toContain('更正副本还是空的')
    expect(await actions.submitCorrection!({ text: '把预算数字核对一下', at: '2026-10-03T09:00:00.000Z' }, '更正后的要求')).toBeNull()
    await page.settle()
    expect(page.requests[3]).toEqual({
      path: '/.sage/corrections',
      body: { matterRef: 'matter:1', workspaceRoot: '/Users/someone/project', originalText: '把预算数字核对一下', originalAt: '2026-10-03T09:00:00.000Z', text: '更正后的要求' },
    })

    expect(await actions.createProject!('   ')).toContain('先写一个项目名（≤100 字）。')
    expect(await actions.createProject!('增长专项')).toBeNull()
    // A refresh re-fills the selects from the payload (fake DOM has no matters fixture).
    setLinkSelection('matter:1', 'ws-1')
    expect(await actions.assignProject!('none')).toContain('先新建一个项目再归属。')
    expect(await actions.assignProject!('prj-1')).toBeNull()
    setLinkSelection('matter:1', 'ws-1')
    expect(await actions.unassignProject!()).toBeNull()
    await page.settle()
    expect(page.requests[4]).toEqual({ path: '/.sage/projects', body: { action: 'create', name: '增长专项' } })
    expect(page.requests[5]).toEqual({ path: '/.sage/projects', body: { action: 'assign', matterRef: 'matter:1', projectRef: 'prj-1' } })
    expect(page.requests[6]).toEqual({ path: '/.sage/projects', body: { action: 'unassign', matterRef: 'matter:1' } })
  })
})
