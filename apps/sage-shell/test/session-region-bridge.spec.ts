import { afterEach, describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, setLinkSelection, statePayload } from './support/sage-page.js'

/**
 * Batch 24 / P3 (ADR-0261 strangler): the session card (D3 — the `#session-*`, `#model-queue-*`,
 * `#terminal-*`, `#selection-*`, `#plan-mode-*`, `#attachment-*`, `#reply-*`, `#suggestion-*`,
 * `#pending-*`, `#queue-*`, `#clarification-*`, `#approval-*`, `#anchor-*`, `#edit-*`,
 * `#history-*` nodes) is owned by the React app. The legacy script publishes one `session`
 * region slice through `__SAGE_APP_SET_REGION__`, exposes the named acts through
 * `__SAGE_LEGACY_ACTIONS__` (exact bodies, refusal/receipt sentences, refresh) and must not
 * write the card's DOM anymore. Rendering is pinned in `test/product-app/session-region.spec.tsx`.
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
  sendSession?: (text: string, mode: 'queue' | 'steer') => Promise<string | null>
  stopSession?: () => Promise<string | null>
  resumeSession?: () => Promise<string | null>
  pickAttachments?: () => Promise<string>
  uploadAttachment?: (itemId: string) => Promise<string | null>
  cancelAttachment?: (itemId: string) => Promise<void>
  editPendingItem?: (itemId: string, text: string) => Promise<void>
  removePendingItem?: (itemId: string) => Promise<void>
  editQueueItem?: (itemId: string, text: string) => Promise<string | null>
  removeQueueItem?: (itemId: string) => Promise<string | null>
  readHistory?: (beforeSeq?: number) => Promise<string | null>
  readHistoryDetail?: (runSeq: number) => Promise<void>
  readAnchors?: () => Promise<string | null>
  locateAnchor?: (runSeq: number) => Promise<{ kind: string, runSeq?: number, previewText?: string, notice?: string }>
  saveEdit?: (messageRef: string, text: string) => Promise<string | null>
  resendEdit?: (editId: string) => Promise<string | null>
  verifyEdit?: (editId: string) => Promise<string | null>
  selectInputRef?: (kind: 'skill' | 'plugin', ref: string) => Promise<string | null>
  clearInputRef?: (kind: 'skill' | 'plugin', ref: string) => Promise<void>
  submitClarification?: (requestId: string, answers: readonly { readonly questionId: string, readonly selected: readonly string[], readonly custom?: string }[]) => Promise<string | null>
  verifyClarification?: () => Promise<void>
  answerApproval?: (requestId: string, outcome: 'allowed-once' | 'rejected') => Promise<string | null>
  withdrawApproval?: (requestId: string) => Promise<string | null>
  verifyApproval?: () => Promise<void>
  verifyModelQueue?: () => Promise<string>
  replyRetry?: () => Promise<string | null>
  auditReply?: () => Promise<string>
  setPlanMode?: (active: boolean) => Promise<string | null>
  openTerminal?: (terminalId: string) => Promise<{ kind: string, text?: string, lineBegin?: number, lineEnd?: number, totalLines?: number, truncated?: boolean, notice?: string }>
}

let sink: RegionSink | undefined

afterEach(() => {
  sink?.restore()
  sink = undefined
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

const channel = (overrides: Record<string, unknown> = {}) => ({
  state: 'read', sessionId: 'session-1', execution: 'idle', lastTurnEnd: null,
  transcript: [], reconciled: false, streamBroken: false, code: null, records: 3, unapplied: 0,
  paused: false, pending: [], queue: null, reply: null, ...overrides,
})
const workspaces = {
  source: 'workspace-follow', state: 'read', reason: null,
  entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
  order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
}
const selectContext = () => setLinkSelection('receipt:42', 'ws-1')

describe('session region bridge (batch 24)', () => {
  it('publishes the read slice with every sub-slice and the derived suggestions; unavailable without a channel', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({
      sessionChannel: channel(),
      sessionHistory: { state: 'read', runs: [], nextBeforeSeq: 4, hasMore: true, detail: null },
      sessionAnchors: { state: 'read', anchors: [], located: null },
      sessionEdits: { state: 'read', records: [] },
      sessionClarifications: { state: 'read', pending: [], deferred: [], receipts: [] },
      sessionApprovals: { state: 'read', pending: [], lapsed: [], receipts: [] },
      sessionPlanMode: { state: 'read', active: false, pending: false },
      inputSelections: { state: 'read', skills: [], plugins: [], selected: [], skillsNote: null, pluginsNote: null },
      modelQueue: { state: 'read', verdict: 'idle', retries: [] },
      terminal: { state: 'read', terminals: [] },
      attachments: { items: [] },
      plans: { state: 'read', plans: [{ planId: 'plan-1', steps: [
        { stepNo: 1, title: '先跑基线', readiness: 'ready' },
        { stepNo: 2, title: '再验证', readiness: 'ready' },
        { stepNo: 3, title: '收尾', readiness: 'blocked' },
        { stepNo: 4, title: '第四条', readiness: 'ready' },
        { stepNo: 5, title: '第五条', readiness: 'ready' },
      ] }] },
      workspaces,
    }))
    await page.refresh()
    const message = lastFor('session')
    expect(message?.kind).toBe('read')
    const slot = message?.slot as Record<string, unknown>
    expect((slot.channel as Record<string, unknown>).sessionId).toBe('session-1')
    expect((slot.history as Record<string, unknown>).nextBeforeSeq).toBe(4)
    expect(slot.anchors).toMatchObject({ state: 'read' })
    expect(slot.edits).toMatchObject({ state: 'read' })
    expect(slot.clarifications).toMatchObject({ state: 'read' })
    expect(slot.approvals).toMatchObject({ state: 'read' })
    expect(slot.planMode).toMatchObject({ state: 'read' })
    expect(slot.selections).toMatchObject({ state: 'read' })
    expect(slot.modelQueue).toMatchObject({ state: 'read' })
    expect(slot.terminal).toMatchObject({ state: 'read' })
    expect(slot.attachments).toMatchObject({ items: [] })
    // 037: ready steps only, capped at three, in plan order (the planned wire derives this).
    expect(slot.suggestions).toEqual(['先跑基线', '再验证', '第四条'])

    page.setPayload(statePayload({ sessionChannel: null }))
    await page.refresh()
    expect(lastFor('session')).toEqual({ kind: 'unavailable' })

    // 037: plans absent -> suggestions unverified (null), not an empty list.
    page.setPayload(statePayload({ sessionChannel: channel() }))
    await page.refresh()
    expect((lastFor('session')?.slot as Record<string, unknown>).suggestions).toBeNull()
  })

  it('keeps the card words and control roster pinned on the static first frame, and the legacy script off its DOM', () => {
    const html = renderSageDocument()
    const start = html.indexOf('id="sage-region-session"')
    const end = html.indexOf('id="sage-region-side-chats"')
    const block = html.slice(start, end)
    for (const pin of [
      'MAIN CONVERSATION · ACK ≠ EXECUTION',
      '事项主对话',
      '回执只表示进了队列，不表示模型已开始工作',
      '模型排队（服务事实投影：排队等待 / 重试进行中 / 已恢复；与错误三态分开，不提供界面倒计时）',
      '集成终端（只读运行观察：面板内打开/关闭不影响执行；输出不进对话历史、不作产物；不接收操作输入）',
      '附件只随消息走：选择文件只产生候选（不读取、不上传）',
      '上传成功不等于模型已读取',
      '回复操作（只提供已核实动作：复制、引用、仅确定失败时重试；未知只给核对）',
      '后续建议（点击只填入输入区，不自动发送）',
      '会话内队列（只读快照 + 逐项修改；本版没有定时或循环自动化入口）。',
      '回答前不派发依赖该答案的后续步骤',
      '外部授权（等待中：未批准也未失败；撤回是具名动作；失效需重新申请）',
      '消息锚点（轮次跳转：读取只走纯历史接点——',
      '编辑与重发（',
      '历史运行（纯历史接点读取：',
      '读取锚点（最近轮次）',
      '定位到此轮消息',
      '关闭预览',
      '保存为新版本',
      '加载更早运行',
      '读取历史运行',
      '发送方式',
      '排队（本轮结束后处理）',
      '步骤边界转向（不打断当前步骤）',
      '选择文件…',
      '继续（派发待继续项）',
    ]) {
      expect(block, pin).toContain(pin)
    }
    // Reverse pin (source-level): the legacy script no longer queries any of the card's nodes.
    const source = renderSageDocument()
    for (const id of [
      '#session-id', '#session-send-state', '#session-execution', '#session-input', '#session-send',
      '#session-stop', '#session-resume', '#session-mode', '#session-note', '#session-transcript',
      '#model-queue-note', '#model-queue-rows', '#terminal-note', '#terminal-rows', '#terminal-output',
      '#selection-note', '#selection-skills', '#selection-plugins', '#selection-chips',
      '#plan-mode-bar', '#plan-mode-goal', '#plan-mode-plan', '#plan-mode-note',
      '#attachment-pick', '#attachment-note', '#attachment-items',
      '#reply-actions', '#reply-note', '#suggestion-note', '#suggestion-chips',
      '#pending-note', '#pending-rows', '#queue-note', '#queue-rows',
      '#clarification-note', '#clarification-cards', '#clarification-deferred', '#clarification-receipts',
      '#approval-note', '#approval-cards', '#approval-lapsed', '#approval-receipts',
      '#anchor-read', '#anchor-note', '#anchor-rows', '#anchor-preview-text', '#anchor-locate', '#anchor-preview-close',
      '#edit-target', '#edit-input', '#edit-save', '#edit-note', '#edit-rows',
      '#history-read', '#history-more', '#history-note', '#history-rows', '#history-detail',
    ]) {
      expect(source.includes("querySelector('" + id + "')"), id).toBe(false)
    }
  })

  it('runs the composer acts through the down-bridge with exact bodies and sentences', async () => {
    installRegionSink()
    const page = await bootSagePage(
      statePayload({
        sessionChannel: channel({ paused: true, pending: [{ itemId: 'p-1', text: '待继续', state: 'pending', note: null, editable: true }] }),
        workspaces,
      }),
      {
        '/.sage/session/send': { state: 'deferred' },
        '/.sage/session/resume': { state: 'resumed', dispatched: [{ itemId: 'p-1' }, { itemId: 'p-2' }] },
      },
    )
    const actions = legacyActions()

    // Guards first: no context -> the same guard sentence the legacy click handler used, no request.
    expect(await actions.sendSession('写点东西', 'queue')).toBe('先在上面选好事项与工作区：发送不会自动替你挑一个。')
    expect(await actions.stopSession()).toBe('先选好事项再停止。')
    expect(await actions.resumeSession()).toBe('先选好事项与工作区再继续。')
    expect(await actions.sendSession('   ', 'queue')).toBe('先写一条输入再发送（或先上传附件）。')
    expect(page.requests).toEqual([])

    selectContext()
    expect(await actions.sendSession('新输入', 'queue')).toBe('已收到，尚未执行：已存为待继续项（不会自动派发）；点「继续」才按顺序派发。')
    expect(page.requests[0]).toEqual({ path: '/.sage/session/send', body: { matterRef: 'receipt:42', workspaceRoot: '/Users/someone/project', text: '新输入' } })
    await page.settle()
    expect(await actions.sendSession('转向输入', 'steer')).toBe('已收到，尚未执行：已存为待继续项（不会自动派发）；点「继续」才按顺序派发。')
    expect(page.requests[1]).toEqual({ path: '/.sage/session/send', body: { matterRef: 'receipt:42', workspaceRoot: '/Users/someone/project', text: '转向输入', mode: 'steer' } })

    expect(await actions.stopSession()).toBeNull()
    expect(page.requests[2]).toEqual({ path: '/.sage/session/stop', body: { matterRef: 'receipt:42' } })

    expect(await actions.resumeSession()).toBe('已继续：按顺序派发 2 条待继续（受理≠执行；执行与否看会话行）。')
    expect(page.requests[3]).toEqual({ path: '/.sage/session/resume', body: { matterRef: 'receipt:42', workspaceRoot: '/Users/someone/project' } })
  })

  it('runs the pending and queue acts with exact bodies and the queue refusal sentences', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({ sessionChannel: channel(), workspaces }), {
      '/.sage/session/queue': (request: unknown) => {
        const body = request as { action: string, itemId: string }
        return body.itemId === 'q-2' ? { state: 'refused', code: 'queue-item-not-found' } : { state: 'ok' }
      },
    })
    const actions = legacyActions()

    await actions.editPendingItem('p-1', '  改过的文字  ')
    await actions.removePendingItem('p-1')
    await actions.editPendingItem('p-1', '   ')
    expect(page.requests[0]).toEqual({ path: '/.sage/session/pending', body: { action: 'edit', itemId: 'p-1', text: '改过的文字' } })
    expect(page.requests[1]).toEqual({ path: '/.sage/session/pending', body: { action: 'remove', itemId: 'p-1' } })
    expect(page.requests).toHaveLength(2)

    expect(await actions.editQueueItem('q-1', ' 新文本 ')).toBe('队列项已按新文本更新（以权威快照为准，刷新后可见）。')
    expect(page.requests[2]).toEqual({ path: '/.sage/session/queue', body: { action: 'edit', itemId: 'q-1', text: '新文本' } })
    expect(await actions.removeQueueItem('q-2')).toBe('这一项已开始处理（不在队列里了）：如实提示，不静默丢弃、不重复提交——如需补充请重新发送。')
    expect(page.requests[3]).toEqual({ path: '/.sage/session/queue', body: { action: 'remove', itemId: 'q-2' } })
    expect(await actions.editQueueItem('q-1', '   ')).toBeNull()
    expect(page.requests).toHaveLength(4)
  })

  it('runs the history and anchors acts with exact bodies, auto-detail and sentences', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({ sessionChannel: channel(), workspaces }), {
      '/.sage/session/history': { state: 'read', runs: [{ runSeq: 7, model: 'm', provider: 'p', endSeq: 9, endReason: 'completed', messages: 4 }], nextBeforeSeq: 5, hasMore: true, detail: { state: 'read', runSeq: 7 } },
      '/.sage/session/anchors': (request: unknown) => (request as { action: string }).action === 'read'
        ? { state: 'read', anchors: [], located: null }
        : { state: 'located', promptPreview: '预览文本' },
    })
    const actions = legacyActions()

    expect(await actions.readHistory()).toBeNull()
    expect(page.requests[0]).toEqual({ path: '/.sage/session/history', body: { action: 'list' } })
    await page.settle()
    // US-097: the first list read auto-expands the newest run exactly once.
    expect(page.requests[1]).toEqual({ path: '/.sage/session/history', body: { action: 'detail', runSeq: 7 } })

    await actions.readHistory(5)
    await page.settle()
    expect(page.requests[2]).toEqual({ path: '/.sage/session/history', body: { action: 'list', beforeSeq: 5 } })

    await actions.readHistoryDetail(3)
    await page.settle()
    expect(page.requests.at(-1)).toEqual({ path: '/.sage/session/history', body: { action: 'detail', runSeq: 3 } })

    expect(await actions.readAnchors()).toBeNull()
    expect(page.requests.at(-1)).toEqual({ path: '/.sage/session/anchors', body: { action: 'read' } })

    const located = await actions.locateAnchor(7)
    expect(located).toEqual({
      kind: 'located',
      runSeq: 7,
      previewText: '已定位：运行 @7——预览文本',
      notice: '已定位到运行 @7 的该轮消息（短预览；只走了纯历史读取）。',
    })
    expect(page.requests.at(-1)).toEqual({ path: '/.sage/session/anchors', body: { action: 'locate', runSeq: 7 } })
  })

  it('runs the selection, reply, plan-mode and terminal acts with exact bodies and sentences', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({
      sessionChannel: channel({ reply: { text: '上一轮回复', actions: ['copy', 'quote'], failed: false, endKind: null }, transcript: [{ role: 'user', source: 'history', text: '最近一条用户输入' }] }),
      workspaces,
    }), {
      '/.sage/session/selections': { state: 'refused', code: 'selection-skill-model-only' },
      '/.sage/session/plan-mode': { state: 'settled', family: 'applied', outcome: 'applied', code: null, view: { active: true } },
      '/.sage/session/terminal-read': { state: 'read', text: 'line1\nline2', lineBegin: 1, lineEnd: 2, totalLines: 9, truncated: true },
      '/.sage/session/send': { state: 'accepted' },
    })
    const actions = legacyActions()
    selectContext()

    expect(await actions.selectInputRef('skill', 'skill-a')).toBe('该技能仅模型可调用（本入口不可选）：未选择。')
    expect(page.requests[0]).toEqual({ path: '/.sage/session/selections', body: { action: 'select', kind: 'skill', ref: 'skill-a' } })
    await actions.clearInputRef('plugin', 'plugin-a')
    await page.settle()
    expect(page.requests[1]).toEqual({ path: '/.sage/session/selections', body: { action: 'clear', kind: 'plugin', ref: 'plugin-a' } })

    expect(await actions.replyRetry()).toBe('重试已受理（与普通发送同一入口）：受理不等于已开始执行，只看日志里有没有未结束的一轮。')
    expect(page.requests[2]).toEqual({ path: '/.sage/session/send', body: { matterRef: 'receipt:42', workspaceRoot: 'ws-1', text: '最近一条用户输入' } })
    expect(await actions.auditReply()).toBe('已重新读取会话（核对）：未触发任何重发。')

    expect(await actions.setPlanMode(true)).toBe('已切换：计划模式已生效（只出方案；其中的动作仍需执行前确认）。')
    expect(page.requests[3]).toEqual({ path: '/.sage/session/plan-mode', body: { active: true } })

    expect(await actions.verifyModelQueue()).toBe('已重新读取该排队状态（核对=只读，不会重复提交任何请求）。')

    expect(await actions.openTerminal('term-1')).toEqual({ kind: 'read', text: 'line1\nline2', lineBegin: 1, lineEnd: 2, totalLines: 9, truncated: true })
    expect(page.requests[4]).toEqual({ path: '/.sage/session/terminal-read', body: { terminalId: 'term-1' } })
  })

  it('runs the edits, clarifications and approvals acts with exact bodies and refusal sentences', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({ sessionChannel: channel(), workspaces }), {
      '/.sage/session/edits': (request: unknown) => {
        const body = request as { action: string }
        if (body.action === 'save') return { state: 'refused', code: 'edit-text-invalid' }
        if (body.action === 'resend') return { state: 'recorded', version: { submission: 'unknown' } }
        return { state: 'checked', code: 'edit-version-not-visible', version: { submission: 'accepted' } }
      },
      '/.sage/session/clarification-answer': { state: 'refused', code: 'clarification-not-pending' },
      '/.sage/session/approval-answer': { state: 'recorded', receipt: { state: 'accepted', outcome: 'allowed-once' } },
      '/.sage/session/approval-withdraw': { state: 'refused', code: 'approval-not-withdrawable' },
    })
    const actions = legacyActions()
    selectContext()

    expect(await actions.saveEdit('msg-1', '新版本正文')).toBe('新版本内容为空或过长（上限 16384 字）。')
    expect(page.requests[0]).toEqual({ path: '/.sage/session/edits', body: { action: 'save', messageRef: 'msg-1', text: '新版本正文' } })
    expect(await actions.saveEdit('', 'x')).toBe('先从下方会话记录里选一条已发消息。')
    expect(page.requests).toHaveLength(1)

    expect(await actions.resendEdit('edit-1')).toBe('重发结果未知：只给核对同一操作（不自动重试、不放回可重发队列）。')
    expect(page.requests[1]).toEqual({ path: '/.sage/session/edits', body: { action: 'resend', editId: 'edit-1', workspaceRoot: 'ws-1' } })
    expect(await actions.verifyEdit('edit-1')).toBe('已接收但尚未见该版本落史（保持等待确认，不猜测）。')
    expect(page.requests[2]).toEqual({ path: '/.sage/session/edits', body: { action: 'verify', editId: 'edit-1' } })

    expect(await actions.submitClarification('req-1', [{ questionId: 'q1', selected: ['A'] }])).toBe('该提问已不在等待中（可能已中止或已被处理）：未提交，不给重试。')
    expect(page.requests[3]).toEqual({ path: '/.sage/session/clarification-answer', body: { matterRef: 'receipt:42', requestId: 'req-1', answers: [{ questionId: 'q1', selected: ['A'] }] } })
    await actions.verifyClarification()
    await page.settle()
    expect(page.requests).toHaveLength(4)

    expect(await actions.answerApproval('req-9', 'allowed-once')).toBe('批准已提交（仅此一次）——等待生效证据；未生效前不显示为已批准。')
    expect(page.requests[4]).toEqual({ path: '/.sage/session/approval-answer', body: { matterRef: 'receipt:42', requestId: 'req-9', outcome: 'allowed-once' } })
    expect(await actions.withdrawApproval('req-9')).toBe('该等待不可撤回（请求方未提供取消能力）：未提交。')
    expect(page.requests[5]).toEqual({ path: '/.sage/session/approval-withdraw', body: { matterRef: 'receipt:42', requestId: 'req-9' } })
    expect(await actions.verifyApproval()).toBe('已重新读取该等待的状态（核对=只读，不重试同一提交）。')
    expect(page.requests).toHaveLength(6)

    expect(await actions.pickAttachments()).toBe('选择结果未读取到（没有产生候选）。')
    expect(page.requests[6]).toEqual({ path: '/.sage/attachments/pick', body: {} })
    expect(await actions.uploadAttachment('att-1')).toBeNull()
    expect(page.requests[7]).toEqual({ path: '/.sage/attachments/upload', body: { itemId: 'att-1', matterRef: 'receipt:42', workspaceRoot: '/Users/someone/project' } })
    await actions.cancelAttachment('att-1')
    await page.settle()
    expect(page.requests[8]).toEqual({ path: '/.sage/attachments/cancel', body: { itemId: 'att-1' } })
  })

  it('leaves the card DOM unwritten on the fake page (the region slice is the only product)', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({ sessionChannel: channel({ transcript: [{ role: 'user', source: 'history', text: '甲' }] }), workspaces }))
    await page.refresh()
    expect(lastFor('session')?.kind).toBe('read')
    for (const id of ['session-id', 'session-send-state', 'session-execution', 'session-note', 'reply-note', 'pending-note', 'queue-note', 'history-note', 'anchor-note', 'edit-note', 'clarification-note', 'approval-note', 'model-queue-note', 'terminal-note', 'attachment-note', 'selection-note', 'plan-mode-note', 'suggestion-note']) {
      expect(page.node(id).textContent, id).toBe('')
    }
    expect(page.node('session-transcript').children).toHaveLength(0)
    expect(page.node('history-rows').children).toHaveLength(0)
    expect(page.node('attachment-items').children).toHaveLength(0)
    expect(page.node('clarification-cards').children).toHaveLength(0)
    expect(page.node('approval-cards').children).toHaveLength(0)
  })
})
