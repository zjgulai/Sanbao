/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppBridgeStore, type AppBridgeStore } from '../../src/product/app/bridge.js'
import { SessionRegion } from '../../src/product/app/session-view.js'

/**
 * Batch 24 / P3 (ADR-0261): the session card (D3 — facts, model queue, terminal, composer,
 * selections, plan mode, attachments, transcript, reply actions, suggestions and the lower
 * blocks) renders from the region bridge only; its acts call the legacy down-bridge. Wire
 * semantics stay in the legacy script (test/session-region-bridge.spec.ts).
 */

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const originalActions = Object.getOwnPropertyDescriptor(globalThis, '__SAGE_LEGACY_ACTIONS__')

const channel = (overrides: Record<string, unknown> = {}) => ({
  state: 'read', sessionId: 'session-1', execution: 'idle', lastTurnEnd: null,
  transcript: [], reconciled: false, streamBroken: false, code: null, records: 3, unapplied: 0,
  paused: false, pending: [], queue: null, reply: null,
  ...overrides,
})

const readSlot = (overrides: Record<string, unknown> = {}) => ({
  kind: 'read',
  slot: { channel: channel(), ...overrides },
})

const unavailable = () => ({ kind: 'unavailable' })

interface Mounted {
  readonly container: HTMLElement
  readonly store: AppBridgeStore
  readonly unmount: () => void
}

const mounted: Mounted[] = []

function mountRegion(): Mounted {
  const container = document.createElement('div')
  container.id = 'sage-region-session'
  document.body.append(container)
  const store = createAppBridgeStore()
  const root = createRoot(container)
  act(() => { root.render(createElement(SessionRegion, { store, container })) })
  const entry: Mounted = {
    container,
    store,
    unmount: () => {
      act(() => { root.unmount() })
      container.remove()
    },
  }
  mounted.push(entry)
  return entry
}

function node(container: HTMLElement, selector: string): Element {
  const found = container.querySelector(selector)
  expect(found, selector).not.toBeNull()
  return found as Element
}

function setRegion(store: AppBridgeStore, region: string, message: unknown): void {
  act(() => { store.setRegion(region, message) })
}

function setNativeValue(element: Element, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
  act(() => {
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

function click(element: Element): void {
  act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

const actions = {
  sendSession: vi.fn(async (_text: string, _mode: string) => null as string | null),
  stopSession: vi.fn(async () => null as string | null),
  resumeSession: vi.fn(async () => null as string | null),
  pickAttachments: vi.fn(async () => '已取消选择：没有产生任何候选。'),
  uploadAttachment: vi.fn(async (_itemId: string) => null as string | null),
  cancelAttachment: vi.fn(async (_itemId: string) => undefined),
  editPendingItem: vi.fn(async (_itemId: string, _text: string) => undefined),
  removePendingItem: vi.fn(async (_itemId: string) => undefined),
  editQueueItem: vi.fn(async (_itemId: string, _text: string) => '队列项已按新文本更新（以权威快照为准，刷新后可见）。' as string | null),
  removeQueueItem: vi.fn(async (_itemId: string) => '队列项已移除登记（若已开始处理则改不动——以快照为准）。' as string | null),
  readHistory: vi.fn(async (_beforeSeq?: number) => null as string | null),
  readHistoryDetail: vi.fn(async (_runSeq: number) => undefined),
  readAnchors: vi.fn(async () => null as string | null),
  locateAnchor: vi.fn(async (runSeq: number) => ({ kind: 'located', runSeq, previewText: '已定位：运行 @' + String(runSeq) + '——预览', notice: '已定位到运行 @' + String(runSeq) + ' 的该轮消息（短预览；只走了纯历史读取）。' }) as { kind: string, runSeq?: number, previewText?: string, notice?: string }),
  saveEdit: vi.fn(async (_messageRef: string, _text: string) => null as string | null),
  resendEdit: vi.fn(async (_editId: string) => '重发已接收（等待生效确认）：与普通发送同一入口。' as string | null),
  verifyEdit: vi.fn(async (_editId: string) => '已生效：该版本已落史。' as string | null),
  selectInputRef: vi.fn(async (_kind: string, _ref: string) => null as string | null),
  clearInputRef: vi.fn(async (_kind: string, _ref: string) => undefined),
  submitClarification: vi.fn(async (_requestId: string, _answers: unknown) => null as string | null),
  verifyClarification: vi.fn(async () => undefined),
  answerApproval: vi.fn(async (_requestId: string, _outcome: string) => '批准已提交（仅此一次）——等待生效证据；未生效前不显示为已批准。' as string | null),
  withdrawApproval: vi.fn(async (_requestId: string) => '撤回已提交——等待不会兑现为执行条件（这不是失败，也不是批准）。' as string | null),
  verifyApproval: vi.fn(async () => '已重新读取该等待的状态（核对=只读，不重试同一提交）。'),
  verifyModelQueue: vi.fn(async () => '已重新读取该排队状态（核对=只读，不会重复提交任何请求）。'),
  replyRetry: vi.fn(async () => '重试已受理（与普通发送同一入口）：受理不等于已开始执行，只看日志里有没有未结束的一轮。' as string | null),
  auditReply: vi.fn(async () => '已重新读取会话（核对）：未触发任何重发。'),
  setPlanMode: vi.fn(async (_active: boolean) => '已切换：计划模式已生效（只出方案；其中的动作仍需执行前确认）。' as string | null),
  openTerminal: vi.fn(async (_terminalId: string) => ({ kind: 'read', text: '第一行\n第二行', lineBegin: 1, lineEnd: 2, totalLines: 9, truncated: false }) as { kind: string, text?: string, lineBegin?: number, lineEnd?: number, totalLines?: number, truncated?: boolean, notice?: string }),
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', { configurable: true, value: { ...actions } })
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount()
  vi.clearAllMocks()
  if (originalActions === undefined) Reflect.deleteProperty(globalThis, '__SAGE_LEGACY_ACTIONS__')
  else Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', originalActions)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

describe('session facts, transport and the composer (React region)', () => {
  it('reads the session facts from the channel: id, echo count, execution and the no-session words', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({
      channel: channel({ transcript: [{ role: 'user', source: 'echo', text: '甲' }, { role: 'assistant', source: 'echo', text: '乙' }], execution: 'executing' }),
    }))
    expect(node(container, '#session-id').textContent).toBe('session-1')
    expect(node(container, '#session-send-state').textContent).toBe('已受理 · 2 条（进入队列；执行与否看下一行）')
    expect(node(container, '#session-execution').textContent).toBe('执行中（日志里有一轮未结束）')
    expect(node(container, '#session-id').getAttribute('data-session-fact')).toBeNull()

    setRegion(store, 'session', readSlot({ channel: channel({ state: 'no-session', sessionId: null }) }))
    expect(node(container, '#session-id').textContent).toBe('还没有会话（发送后才会创建）')
    expect(node(container, '#session-note').textContent).toBe('还没有为这个事项建立会话；发出第一条输入时才会创建。')
    expect(node(container, '#session-send-state').textContent).toBe('尚未发送')
    expect(node(container, '#session-execution').textContent).toBe('空闲（没有未结束的一轮）')
  })

  it('names the broken stream and the reconciled read-back without inventing success', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ channel: channel({ streamBroken: true, code: 'stream-reset' }) }))
    expect(node(container, '#session-note').textContent).toBe('流已断开：stream-reset（最终文本以历史对账为准）')
    setRegion(store, 'session', readSlot({ channel: channel({ reconciled: true }) }))
    expect(node(container, '#session-note').textContent).toBe('已按历史对账：下面助手这一段是从会话历史读回的最终文本。')
    setRegion(store, 'session', unavailable())
    expect(node(container, '#session-note').textContent).toBe('未核验：这一版还没有接上会话通道。')
    expect(container.getAttribute('data-region-state')).toBe('unavailable')
  })

  it('renders the transcript with role/source tags, attachment chips and the edit entry only for identified user rows', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({
      channel: channel({ transcript: [
        { role: 'user', source: 'history', text: '历史里的我', messageRef: 'req-1' },
        { role: 'user', source: 'echo', text: '刚回显的我' },
        { role: 'assistant', source: 'history', text: '历史里的助手', attachments: [{ attachmentId: 'att-9', name: '报告.pdf', bytes: 1200 }] },
      ] }),
    }))
    const rows = node(container, '#session-transcript').children
    expect(rows).toHaveLength(3)
    expect(rows[0]?.querySelector('.sage-roster-tag')?.textContent).toBe('我 · 历史')
    expect(rows[1]?.querySelector('.sage-roster-tag')?.textContent).toBe('我（本机回显）')
    expect(rows[2]?.querySelector('.sage-roster-tag')?.textContent).toBe('助手 · 历史')
    expect(rows[2]?.querySelector('[data-session-attachment="att-9"]')?.textContent).toBe('附件：报告.pdf（1200 字节 · 内容核验通过）')
    expect(rows[0]?.querySelector('[data-edit-message="req-1"]')).not.toBeNull()
    expect(rows[1]?.querySelector('[data-edit-message]')).toBeNull()
    // 036: picking a transcript row fills the local editor (zero bridge calls).
    click(rows[0]!.querySelector('button')!)
    expect(actions.saveEdit).not.toHaveBeenCalled()
    expect(node(container, '#edit-target').textContent).toBe('消息 req-1（原消息不变）')
    expect((node(container, '#edit-input') as HTMLTextAreaElement).value).toBe('历史里的我')
    expect(node(container, '#edit-note').textContent).toContain('正在编辑这条消息')
  })

  it('sends with the selected mode, keeps guards local, and shows the deferred receipt sentence', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot())
    const input = node(container, '#session-input') as HTMLTextAreaElement
    const sendButton = node(container, '#session-send')

    // US: an empty send never calls the service — the same guard sentence shows locally.
    click(sendButton)
    expect(actions.sendSession).not.toHaveBeenCalled()
    expect(node(container, '#session-note').textContent).toBe('先写一条输入再发送（或先上传附件）。')

    setNativeValue(input, '写点新东西')
    setNativeValue(node(container, '#session-mode'), 'steer')
    await act(async () => { click(sendButton) })
    expect(actions.sendSession).toHaveBeenCalledWith('写点新东西', 'steer')
    // A successful send keeps the input (legacy parity) and returns to the derived note.
    expect((node(container, '#session-input') as HTMLTextAreaElement).value).toBe('写点新东西')
    expect(node(container, '#session-note').textContent).toBe('')

    actions.sendSession.mockResolvedValueOnce('已收到，尚未执行：已存为待继续项（不会自动派发）；点「继续」才按顺序派发。')
    await act(async () => { click(sendButton) })
    expect(node(container, '#session-note').textContent).toBe('已收到，尚未执行：已存为待继续项（不会自动派发）；点「继续」才按顺序派发。')
  })

  it('gates stop and resume on the paused projection and surfaces their returned sentences', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ channel: channel({ paused: false }) }))
    expect((node(container, '#session-stop') as HTMLButtonElement).disabled).toBe(false)
    expect((node(container, '#session-resume') as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { click(node(container, '#session-stop')) })
    expect(actions.stopSession).toHaveBeenCalledTimes(1)

    setRegion(store, 'session', readSlot({ channel: channel({ paused: true }) }))
    expect((node(container, '#session-stop') as HTMLButtonElement).disabled).toBe(true)
    expect((node(container, '#session-resume') as HTMLButtonElement).disabled).toBe(false)
    actions.resumeSession.mockResolvedValueOnce('先选好事项与工作区再继续。')
    await act(async () => { click(node(container, '#session-resume')) })
    expect(actions.resumeSession).toHaveBeenCalledTimes(1)
    expect(node(container, '#session-note').textContent).toBe('先选好事项与工作区再继续。')
  })
})

describe('model queue and terminal (React region)', () => {
  it('words the waiting/retrying/ready states from the service facts, never a UI countdown', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({
      modelQueue: { state: 'read', verdict: 'waiting', retries: [{ retryId: 'r-1', attempt: 2, maxAttempts: 5, delayMs: 4000, failureCode: 'rate-limited', provider: 'p', started: false }] },
    }))
    expect(node(container, '#model-queue-note').textContent).toBe('排队等待恢复（第 2/5 次，全部为服务事实）：服务端安排 4000 ms 后继续，原因 rate-limited——就绪只看日志事实，不用界面倒计时。')
    const row = node(container, '#model-queue-rows').children[0]
    expect(row?.textContent).toContain('第 2/5 次 · 服务端延迟 4000 ms')
    expect(row?.textContent).toContain('提供方：p · 原因：rate-limited')

    setRegion(store, 'session', readSlot({
      modelQueue: { state: 'read', verdict: 'retrying', retries: [{ retryId: 'r-1', attempt: 1, maxAttempts: null, delayMs: 1000, failureCode: 'x', provider: 'p', started: true }] },
    }))
    expect(node(container, '#model-queue-note').textContent).toBe('重试进行中（第 1 次 尝试已开始）：等待本轮进展；这不是失败，也不是需要重复提交。')
    setRegion(store, 'session', readSlot({
      modelQueue: { state: 'read', verdict: 'ready', retries: [] },
    }))
    expect(node(container, '#model-queue-note').textContent).toBe('已恢复（就绪）：重试等待成功后本轮已有输出（服务事实：llm/retry-started + 消息）——无需重复提交。')
  })

  it('offers 核对 only for the unknown verdict, and the act re-reads with zero writes', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ modelQueue: { state: 'read', verdict: 'unknown', retries: [] } }))
    expect(node(container, '#model-queue-note').textContent).toBe('结果未知：该等待所在轮次已结束且未见恢复证据——只给核对（重新读取），不给重试。')
    const verify = node(container, '#model-queue-rows').querySelector('[data-model-queue-verify="last"]')
    expect(verify).not.toBeNull()
    await act(async () => { click(verify!) })
    expect(actions.verifyModelQueue).toHaveBeenCalledTimes(1)
    expect(node(container, '#model-queue-note').textContent).toBe('已重新读取该排队状态（核对=只读，不会重复提交任何请求）。')

    // The verify sentence is a legacy local notice: it survives the poll (the derived sentence
    // stays suppressed until the next verify), and the verify entry disappears with the verdict.
    setRegion(store, 'session', readSlot({ modelQueue: { state: 'read', verdict: 'idle', retries: [] } }))
    expect(node(container, '#model-queue-rows').querySelector('[data-model-queue-verify]')).toBeNull()
    expect(node(container, '#model-queue-note').textContent).toBe('已重新读取该排队状态（核对=只读，不会重复提交任何请求）。')
    const fresh = mountRegion()
    setRegion(fresh.store, 'session', readSlot({ modelQueue: { state: 'read', verdict: 'idle', retries: [] } }))
    expect(node(fresh.container, '#model-queue-note').textContent).toBe('当前没有进行中的模型排队或重试。')
  })

  it('keeps the unreadable and no-session readings explicit', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ modelQueue: { state: 'unavailable', reason: 'model-queue-provider-unavailable' } }))
    expect(node(container, '#model-queue-note').textContent).toBe('未核验：模型排队读取端口未接线（model-queue-provider-unavailable）；不以空状态冒充。')
    setRegion(store, 'session', readSlot({ modelQueue: { state: 'no-session' } }))
    expect(node(container, '#model-queue-note').textContent).toBe('还没有会话：没有模型排队或重试可读（读取不会创建会话）。')
  })

  it('lists terminals read-only and opens a bounded output page on click; close stays local', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({
      terminal: { state: 'read', terminals: [
        { terminalId: 't-1', name: '构建终端', type: 'shell', status: { kind: 'exited', exitCode: 0, signal: null } },
        { terminalId: 't-2', name: '', type: 'task', status: { kind: 'running' } },
      ] },
    }))
    expect(node(container, '#terminal-note').textContent).toBe('终端 2 项（只读运行观察；打开/关闭面板不影响执行）。')
    const rows = node(container, '#terminal-rows').children
    expect(rows[0]?.textContent).toContain('构建终端 · shell')
    expect(rows[0]?.textContent).toContain('已退出（exitCode 0）')
    expect(rows[1]?.textContent).toContain('t-2 · task')
    expect(rows[1]?.textContent).toContain('运行中')

    await act(async () => { click(rows[0]!.querySelector('[data-terminal-open]')!) })
    expect(actions.openTerminal).toHaveBeenCalledWith('t-1')
    const output = node(container, '#terminal-output')
    expect(output.hasAttribute('hidden')).toBe(false)
    expect(output.textContent).toBe('第一行\n第二行')
    expect(node(container, '#terminal-output-note').textContent).toBe('只读运行观察（第 1–2 行 / 共 9 行）——不进对话历史、不作交付产物，也不接收操作输入。')
    expect(rows[0]!.querySelector('[data-terminal-open]')?.textContent).toBe('关闭输出')

    // Close is a pure-local switch: zero requests and an explicit local sentence.
    await act(async () => { click(node(container, '#terminal-rows').children[0]!.querySelector('[data-terminal-open]')!) })
    expect(actions.openTerminal).toHaveBeenCalledTimes(1)
    expect(node(container, '#terminal-output').hasAttribute('hidden')).toBe(true)
    expect(node(container, '#terminal-output-note').textContent).toBe('已关闭输出面板（纯本地；运行不受影响）。')
  })

  it('words a refused terminal read and never fakes a blank success', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ terminal: { state: 'read', terminals: [{ terminalId: 't-1', name: 'x', type: 'shell', status: { kind: 'running' } }] } }))
    actions.openTerminal.mockResolvedValueOnce({ kind: 'notice', notice: '该终端不在当前清单内（不是"已失效"）：未打开输出。' })
    await act(async () => { click(node(container, '#terminal-rows').querySelector('[data-terminal-open]')!) })
    expect(node(container, '#terminal-output').hasAttribute('hidden')).toBe(true)
    expect(node(container, '#terminal-output-note').textContent).toBe('该终端不在当前清单内（不是"已失效"）：未打开输出。')
  })
})

describe('selections, plan mode and attachments (React region)', () => {
  it('renders the read-only skill/plugin rosters and pushes select/clear through the bridge', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({
      selections: { state: 'read', skillsNote: null, pluginsNote: null,
        skills: [
          { name: 'qoder-search', source: 'builtin', provider: 'sage', userInvocable: true },
          { name: 'model-only', source: 'builtin', provider: null, userInvocable: false },
        ],
        plugins: [{ identity: 'plugin-a', version: '1.2.0' }],
        selected: [{ kind: 'skill', ref: 'qoder-search' }, { kind: 'plugin', ref: 'plugin-a' }],
      },
    }))
    expect(node(container, '#selection-note').textContent).toBe('引用只随下一次发送携带；本次请求受理后自动清空（不改变任何启用状态）。')
    const skills = node(container, '#selection-skills').children
    expect(skills[0]?.textContent).toContain('来源：builtin·sage')
    expect(skills[0]?.textContent).toContain('可选用（本入口）')
    expect(skills[1]?.querySelector('button')?.hasAttribute('disabled')).toBe(true)
    expect(skills[1]?.textContent).toContain('仅模型可调用（本入口不可选）')
    expect(node(container, '#selection-plugins').children[0]?.textContent).toContain('已挂载（组合内实际存在）·v1.2.0')
    expect(node(container, '#selection-chips').children).toHaveLength(2)
    expect(node(container, '#selection-chips').children[0]?.textContent).toContain('已选：技能 qoder-search（随下一次发送携带）')

    await act(async () => { click(skills[0]!.querySelector('[data-selection-action="select"]')!) })
    expect(actions.selectInputRef).toHaveBeenCalledWith('skill', 'qoder-search')
    await act(async () => { click(node(container, '#selection-chips').querySelector('[data-selection-clear="qoder-search"]')!) })
    expect(actions.clearInputRef).toHaveBeenCalledWith('skill', 'qoder-search')

    actions.selectInputRef.mockResolvedValueOnce('该技能不在当前挂载清单里（不是"已失效"）：未选择。')
    await act(async () => { click(node(container, '#selection-skills').children[0]!.querySelector('[data-selection-action="select"]')!) })
    expect(node(container, '#selection-note').textContent).toBe('该技能不在当前挂载清单里（不是"已失效"）：未选择。')
  })

  it('keeps the unreadable skills note and the plugins note single-row', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ selections: { state: 'unavailable' } }))
    expect(node(container, '#selection-note').textContent).toBe('未核验：技能清单不可读（不以空列表冒充能力）；挂载行见下。')
    setRegion(store, 'session', readSlot({ selections: { state: 'read', skills: [], plugins: [], selected: [], skillsNote: null, pluginsNote: '插件组合未接线：不以空列表冒充。' } }))
    expect(node(container, '#selection-plugins').children).toHaveLength(1)
    expect(node(container, '#selection-plugins').textContent).toBe('插件组合未接线：不以空列表冒充。')
  })

  it('marks the active plan-mode target and switches through one named request', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ planMode: { state: 'read', active: false, pending: false } }))
    const goal = node(container, '#plan-mode-goal')
    const plan = node(container, '#plan-mode-plan')
    expect(goal.getAttribute('data-plan-mode-state')).toBe('active')
    expect(goal.textContent).toBe('目标模式（当前）')
    expect(plan.getAttribute('data-plan-mode-state')).toBe('idle')
    expect(node(container, '#plan-mode-note').textContent).toBe('当前：目标模式。')

    await act(async () => { click(plan) })
    expect(actions.setPlanMode).toHaveBeenCalledWith(true)
    expect(node(container, '#plan-mode-note').textContent).toBe('已切换：计划模式已生效（只出方案；其中的动作仍需执行前确认）。')

    // The switch receipt is a local notice that survives the poll; the button marks follow the new projection.
    setRegion(store, 'session', readSlot({ planMode: { state: 'read', active: false, pending: true } }))
    // The effective mode keeps its （当前） mark; the pending switch only marks the target button.
    expect(node(container, '#plan-mode-goal').getAttribute('data-plan-mode-state')).toBe('active')
    expect(node(container, '#plan-mode-goal').textContent).toBe('目标模式（当前）')
    expect(node(container, '#plan-mode-plan').getAttribute('data-plan-mode-state')).toBe('pending-target')
    expect(node(container, '#plan-mode-plan').textContent).toBe('计划模式（下一步生效）')
    expect(node(container, '#plan-mode-note').textContent).toBe('已切换：计划模式已生效（只出方案；其中的动作仍需执行前确认）。')

    const fresh = mountRegion()
    setRegion(fresh.store, 'session', readSlot({ planMode: { state: 'read', active: false, pending: true } }))
    expect(node(fresh.container, '#plan-mode-note').textContent).toBe('切换已登记：将在下一步生效；当前实际为目标模式。')
    // In plan mode with a pending switch back to goal, the marks mirror the same rule.
    const planMode = mountRegion()
    setRegion(planMode.store, 'session', readSlot({ planMode: { state: 'read', active: true, pending: true } }))
    expect(node(planMode.container, '#plan-mode-plan').getAttribute('data-plan-mode-state')).toBe('active')
    expect(node(planMode.container, '#plan-mode-plan').textContent).toBe('计划模式（当前）')
    expect(node(planMode.container, '#plan-mode-goal').getAttribute('data-plan-mode-state')).toBe('pending-target')
    expect(node(planMode.container, '#plan-mode-goal').textContent).toBe('目标模式（下一步生效）')
  })

  it('disables the mode buttons while the projection is unread and words the unavailable reason', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ planMode: { state: 'unavailable', reason: 'plan-mode-unavailable' } }))
    expect((node(container, '#plan-mode-goal') as HTMLButtonElement).disabled).toBe(true)
    expect(node(container, '#plan-mode-goal').getAttribute('data-plan-mode-state')).toBe('unavailable')
    expect(node(container, '#plan-mode-note').textContent).toBe('未核验：模式状态未接线（plan-mode-unavailable）；不以默认值冒充。')
    setRegion(store, 'session', readSlot({ planMode: { state: 'no-session' } }))
    expect(node(container, '#plan-mode-note').textContent).toBe('还没有会话：没有可切换的模式状态（读取不会创建会话）。')
  })

  it('lists attachment stages with their action rosters and the stored-count sentence', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({
      attachments: { items: [
        { itemId: 'att-1', name: 'a.pdf', bytes: 10, stage: 'candidate' },
        { itemId: 'att-2', name: 'b.pdf', bytes: 20, stage: 'uploading', sentBytes: 5 },
        { itemId: 'att-3', name: 'c.pdf', bytes: 30, stage: 'stored' },
        { itemId: 'att-4', name: 'd.pdf', bytes: 40, stage: 'failed' },
        { itemId: 'att-5', name: 'e.pdf', bytes: 50, stage: 'sent' },
        { itemId: 'att-6', name: 'f.pdf', bytes: 60, stage: 'source-changed' },
      ] },
    }))
    expect(node(container, '#attachment-note').textContent).toBe('1 项已上传（内容核验通过），将随下一条消息发送；发送与否以会话受理回执为准。')
    const rows = node(container, '#attachment-items').children
    expect(rows[0]?.textContent).toContain('候选（未上传）')
    expect(rows[0]?.querySelectorAll('[data-attachment-action]')).toHaveLength(2)
    expect(rows[1]?.textContent).toContain('传输中 5/20 字节')
    expect(rows[1]?.querySelector('[data-attachment-action="cancel"]')?.textContent).toBe('取消上传')
    expect(rows[2]?.textContent).toContain('已上传 · 内容核验通过（将随下一条消息发送）')
    expect(rows[3]?.querySelector('[data-attachment-action="upload"]')?.textContent).toBe('重试上传')
    expect(rows[4]?.querySelectorAll('[data-attachment-action]')).toHaveLength(0)
    expect(rows[5]?.textContent).toContain('源内容在选取与上传间发生变化（需重新选择）')
  })

  it('picks, uploads and cancels through the bridge with the returned sentences', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ attachments: { items: [
      { itemId: 'att-1', name: 'a.pdf', bytes: 10, stage: 'candidate' },
    ] } }))
    await act(async () => { click(node(container, '#attachment-pick')) })
    expect(actions.pickAttachments).toHaveBeenCalledTimes(1)
    expect(node(container, '#attachment-note').textContent).toBe('已取消选择：没有产生任何候选。')

    await act(async () => { click(node(container, '#attachment-items').querySelector('[data-attachment-action="upload"]')!) })
    expect(actions.uploadAttachment).toHaveBeenCalledWith('att-1')
    actions.uploadAttachment.mockResolvedValueOnce('上传没有完成：attachment-too-large（没有变成已发送附件；可重试同一版本）。')
    await act(async () => { click(node(container, '#attachment-items').querySelector('[data-attachment-action="upload"]')!) })
    expect(node(container, '#attachment-note').textContent).toBe('上传没有完成：attachment-too-large（没有变成已发送附件；可重试同一版本）。')

    await act(async () => { click(node(container, '#attachment-items').querySelector('[data-attachment-action="cancel"]')!) })
    expect(actions.cancelAttachment).toHaveBeenCalledWith('att-1')
  })

  it('words the missing attachments port instead of showing an empty list', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ attachments: null }))
    expect(node(container, '#attachment-note').textContent).toBe('未核验：这一版还没有接上附件端口。')
  })
})

describe('reply actions and suggestions (React region)', () => {
  it('offers only the verified actions, hides retry under uncertainty, and offers 核对 instead', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ channel: channel({ reply: { text: '回复正文', actions: ['copy', 'quote', 'retry'], failed: true, endKind: 'error' } }) }))
    const buttons = node(container, '#reply-actions').querySelectorAll('[data-reply-action]')
    expect(Array.from(buttons).map((button) => button.getAttribute('data-reply-action'))).toEqual(['copy', 'quote', 'retry'])
    expect(node(container, '#reply-note').textContent).toBe('上一轮以确定失败结束（error）：只提供已核实动作——复制、引用、重试。')

    setRegion(store, 'session', readSlot({ channel: channel({ streamBroken: true, reply: { text: '回复正文', actions: ['copy', 'quote', 'retry'], failed: false, endKind: null } }) }))
    expect(node(container, '#reply-actions').querySelectorAll('[data-reply-action="retry"]')).toHaveLength(0)
    expect(node(container, '#reply-actions').querySelector('[data-reply-audit="true"]')).not.toBeNull()
    expect(node(container, '#reply-note').textContent).toBe('会话流已断：状态未知——只给核对入口，不给重试。')
  })

  it('copies with an honest clipboard sentence, quotes into the input, and audits with a re-read', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ channel: channel({ reply: { text: '要复制的回复', actions: ['copy', 'quote', 'retry'], failed: true, endKind: 'error' } }) }))
    await act(async () => { click(node(container, '#reply-actions').querySelector('[data-reply-action="copy"]')!) })
    expect(writeText).toHaveBeenCalledWith('要复制的回复')
    expect(node(container, '#reply-note').textContent).toBe('已复制回复文本（本机剪贴板；未走任何后端）。')

    click(node(container, '#reply-actions').querySelector('[data-reply-action="quote"]')!)
    expect((node(container, '#session-input') as HTMLTextAreaElement).value).toBe('> 要复制的回复\n')
    expect(node(container, '#reply-note').textContent).toBe('引用已填入输入区（未发送）：可编辑后再显式发送。')

    await act(async () => { click(node(container, '#reply-actions').querySelector('[data-reply-action="retry"]')!) })
    expect(actions.replyRetry).toHaveBeenCalledTimes(1)
    expect(node(container, '#reply-note').textContent).toBe('重试已受理（与普通发送同一入口）：受理不等于已开始执行，只看日志里有没有未结束的一轮。')

    setRegion(store, 'session', readSlot({ channel: channel({ streamBroken: true, reply: { text: '正文', actions: ['copy'], failed: false, endKind: null } }) }))
    await act(async () => { click(node(container, '#reply-actions').querySelector('[data-reply-audit="true"]')!) })
    expect(actions.auditReply).toHaveBeenCalledTimes(1)
    expect(node(container, '#reply-note').textContent).toBe('已重新读取会话（核对）：未触发任何重发。')
  })

  it('says 还没有可操作的回复 when no reply text is readable', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ channel: channel({ reply: { text: null, actions: [], failed: false, endKind: null } }) }))
    expect(node(container, '#reply-note').textContent).toBe('还没有可操作的回复（读到回复文本后才会出现操作）。')
    expect(node(container, '#reply-actions').children).toHaveLength(0)
  })

  it('fills the input from a suggestion chip without sending (zero bridge calls)', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ suggestions: ['先跑基线'] }))
    expect(node(container, '#suggestion-note').textContent).toBe('共 1 条后续建议（点击只填入输入区）。')
    click(node(container, '#suggestion-chips').querySelector('[data-suggestion-text="先跑基线"]')!)
    expect((node(container, '#session-input') as HTMLTextAreaElement).value).toBe('先跑基线')
    expect(node(container, '#suggestion-note').textContent).toBe('建议已填入输入区（未发送）：可编辑后再显式发送。')
    expect(actions.sendSession).not.toHaveBeenCalled()
  })

  it('keeps the unverified suggestion reading when the plan projection is unwired', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ suggestions: null }))
    expect(node(container, '#suggestion-note').textContent).toBe('后续建议未核验：方案投影未接线（不以固定文案冒充建议）。')
    setRegion(store, 'session', readSlot({ suggestions: [] }))
    expect(node(container, '#suggestion-note').textContent).toBe('当前没有可用的后续建议（建议来自方案投影中可推进的步骤）。')
  })
})

describe('pending and queue (React region)', () => {
  it('marks a paused session, offers 继续, and freezes consumed items read-only', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ channel: channel({
      paused: true,
      pending: [
        { itemId: 'p-1', text: '暂停期间写下的', state: 'pending', note: null, editable: true },
        { itemId: 'p-2', text: '已经执行的输入', state: 'consumed', note: 'consumed-by-race', editable: false },
      ],
    }) }))
    expect(node(container, '#pending-note').textContent).toBe('已暂停：新输入只会存成待继续项，不会自动送去执行；点「继续」才按顺序派发。')
    const rows = node(container, '#pending-rows').children
    expect((rows[0]?.querySelector('[data-pending-input]') as HTMLInputElement).value).toBe('暂停期间写下的')
    expect(rows[0]?.querySelectorAll('[data-pending-action]')).toHaveLength(2)
    expect(rows[1]?.textContent).toContain('已消费（只读）')
    expect(rows[1]?.querySelectorAll('[data-pending-action]')).toHaveLength(0)
    expect((rows[1]?.querySelector('[data-pending-input]') as HTMLInputElement).disabled).toBe(true)
  })

  it('labels a drained item with its provenance while running', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ channel: channel({ pending: [{ itemId: 'p-1', text: 'A', state: 'pending', note: 'drained-at-stop', editable: true }] }) }))
    expect(node(container, '#pending-rows').children[0]?.textContent).toContain('待继续（停止时已收回）')
    expect(node(container, '#pending-note').textContent).toBe('未暂停；下列待继续项要等一次显式「继续」才会派发。')
    expect((node(container, '#session-resume') as HTMLButtonElement).disabled).toBe(true)
  })

  it('edits and removes a pending item through the bridge with the typed text', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ channel: channel({ pending: [{ itemId: 'p-1', text: '原文', state: 'pending', note: null, editable: true }] }) }))
    const row = node(container, '#pending-rows').children[0]!
    setNativeValue(row.querySelector('[data-pending-input]')!, '改过的文字')
    await act(async () => { click(row.querySelector('[data-pending-action="edit"]')!) })
    expect(actions.editPendingItem).toHaveBeenCalledWith('p-1', '改过的文字')
    await act(async () => { click(row.querySelector('[data-pending-action="remove"]')!) })
    expect(actions.removePendingItem).toHaveBeenCalledWith('p-1')
  })

  it('renders the queue snapshot with per-item edits and consumes refusals honestly', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ channel: channel({ queue: { state: 'read', occurrences: [
      { queueItemId: 'q-1', position: 'steering', preview: '转向这条' },
      { queueItemId: 'q-2', position: 'queued', preview: '排队这条' },
    ] } }) }))
    expect(node(container, '#queue-note').textContent).toBe('来自基座权威队列快照（2 项；steer 只在步骤边界消费）。本版没有定时或循环自动化入口。')
    const rows = node(container, '#queue-rows').children
    expect(rows[0]?.textContent).toContain('步骤边界（steer）')
    expect(rows[1]?.textContent).toContain('排队中（本轮结束后处理）')
    setNativeValue(rows[1]!.querySelector('[data-queue-input]')!, '改过的排队文本')
    await act(async () => { click(rows[1]!.querySelector('[data-queue-action="edit"]')!) })
    expect(actions.editQueueItem).toHaveBeenCalledWith('q-2', '改过的排队文本')
    expect(node(container, '#queue-note').textContent).toBe('队列项已按新文本更新（以权威快照为准，刷新后可见）。')
    await act(async () => { click(node(container, '#queue-rows').children[0]!.querySelector('[data-queue-action="remove"]')!) })
    expect(actions.removeQueueItem).toHaveBeenCalledWith('q-1')
    expect(node(container, '#queue-note').textContent).toBe('队列项已移除登记（若已开始处理则改不动——以快照为准）。')
  })

  it('keeps the paused queue collapsed and words the missing snapshot', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ channel: channel({ paused: true, queue: { state: 'read', occurrences: [{ queueItemId: 'q-1', position: 'queued', preview: 'x' }] } }) }))
    expect(node(container, '#queue-rows').children).toHaveLength(0)
    expect(node(container, '#queue-note').textContent).toBe('已暂停：队列面板只显示待继续（见上）；恢复后才按顺序派发。本版没有定时或循环自动化入口。')
    setRegion(store, 'session', readSlot({ channel: channel({ queue: null }) }))
    expect(node(container, '#queue-note').textContent).toBe('未核验：这一版没有读到队列快照（不以空列表冒充）。本版没有定时或循环自动化入口。')
  })

  it('rebuilds the pending/queue drafts on every projection message (legacy reset parity)', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ channel: channel({ pending: [{ itemId: 'p-1', text: '原文', state: 'pending', note: null, editable: true }] }) }))
    const input = node(container, '#pending-rows').querySelector('[data-pending-input]')!
    setNativeValue(input, '打到一半')
    expect((input as HTMLInputElement).value).toBe('打到一半')
    setRegion(store, 'session', readSlot({ channel: channel({ pending: [{ itemId: 'p-1', text: '原文', state: 'pending', note: null, editable: true }] }) }))
    expect((node(container, '#pending-rows').querySelector('[data-pending-input]') as HTMLInputElement).value).toBe('原文')
  })
})

describe('clarifications and approvals (React region)', () => {
  const clarifyCard = {
    requestId: 'req-1', run: { runSeq: 4 },
    questions: [{ questionId: 'q1', question: '选哪个方案？', header: '范围', options: [{ label: 'A', description: '稳' }, { label: 'B', description: null }], multiSelect: false }],
  }

  it('renders the live clarification cards and submits the typed answers through the bridge', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ clarifications: { state: 'read', pending: [clarifyCard], deferred: [], receipts: [] } }))
    expect(node(container, '#clarification-note').textContent).toBe('共 1 个待回答的澄清提问（回答前不派发依赖该答案的后续步骤）。')
    const card = node(container, '#clarification-cards').children[0]!
    expect(card.textContent).toContain('所属运行 @4')
    expect(card.textContent).toContain('问：选哪个方案？')
    expect(card.textContent).toContain('（范围）')

    const optionA = card.querySelector('[data-clarification-option="q1"]')!
    act(() => { (optionA as HTMLInputElement).click() })
    setNativeValue(card.querySelector('[data-clarification-custom="q1"]')!, '补充口径')
    await act(async () => { click(card.querySelector('[data-clarification-submit="req-1"]')!) })
    expect(actions.submitClarification).toHaveBeenCalledWith('req-1', [{ questionId: 'q1', selected: ['A'], custom: '补充口径' }])

    actions.submitClarification.mockResolvedValueOnce('该提问已不在等待中（可能已中止或已被处理）：未提交，不给重试。')
    await act(async () => { click(node(container, '#clarification-cards').querySelector('[data-clarification-submit="req-1"]')!) })
    expect(node(container, '#clarification-note').textContent).toBe('该提问已不在等待中（可能已中止或已被处理）：未提交，不给重试。')
  })

  it('renders the plan-review preview and keeps the deferral/receipt readings explicit', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ clarifications: { state: 'read',
      pending: [{ requestId: 'req-2', run: null, questions: [{ questionId: 'q9', question: '接受方案？', intentKind: 'plan-review', approveLabel: '接受', detail: '方案正文预览', options: [] }] }],
      deferred: [{ questions: [{ question: '旧提问' }], reason: 'stopped' }, { questions: [{ question: '另一个' }], reason: 'ended' }],
      receipts: [{ requestId: 'req-3', state: 'unknown', code: 'x', verifyOnly: true }],
    } }))
    expect(node(container, '#clarification-cards').textContent).toContain('确认意图：plan-review（通过=接受）')
    expect(node(container, '#clarification-cards').querySelector('[data-plan-review-preview="q9"]')?.textContent).toBe('方案正文预览')
    expect(node(container, '#clarification-cards').textContent).toContain('接受方案不等于执行其中动作')
    const deferred = node(container, '#clarification-deferred').children
    expect(deferred[0]?.textContent).toContain('停止已中止该提问（未回答）；继续会话后可按需重新发起。')
    expect(deferred[1]?.textContent).toContain('该提问已结束（未从本工作面提交回答）。')
    expect(node(container, '#clarification-receipts').textContent).toContain('结果未知：请核对同一操作（不给重试）（x）')
    await act(async () => { click(node(container, '#clarification-receipts').querySelector('[data-clarification-verify="req-3"]')!) })
    expect(actions.verifyClarification).toHaveBeenCalledTimes(1)
  })

  it('words the unreadable clarification port', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ clarifications: { state: 'unavailable' } }))
    expect(node(container, '#clarification-note').textContent).toBe('未核验：澄清读取端口未接线（不以空列表冒充能力）。')
    setRegion(store, 'session', readSlot({ clarifications: { state: 'read', pending: [], deferred: [], receipts: [] } }))
    expect(node(container, '#clarification-note').textContent).toBe('当前没有待回答的澄清提问（提问只在运行中由模型发出）。')
  })

  it('renders the approval waits with their three acts and answers through the bridge', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ approvals: { state: 'read', pending: [
      { requestId: 'req-1', toolName: 'shell.exec', reason: '需要跑构建', callId: 'call-1', withdrawable: true },
      { requestId: 'req-2', toolName: 'net.fetch', reason: '', withdrawable: false },
    ], lapsed: [{ requestId: 'req-9', toolName: 'fs.write', lapse: 'stopped' }], receipts: [] } }))
    expect(node(container, '#approval-note').textContent).toBe('等待授权 2 项：未批准前依赖动作保持阻断（等待≠失败，也≠已批准）。')
    const cards = node(container, '#approval-cards').children
    expect(cards[0]?.textContent).toContain('等待授权：shell.exec')
    expect(cards[0]?.textContent).toContain('调用：call-1')
    expect(cards[1]?.textContent).toContain('不可撤回（请求方未提供取消能力）')
    expect(node(container, '#approval-lapsed').textContent).toContain('已失效：fs.write（会话已停止）——需重新申请；旧等待不会自动兑现为执行条件。')

    await act(async () => { click(cards[0]!.querySelector('[data-approval-answer="allowed-once"]')!) })
    expect(actions.answerApproval).toHaveBeenCalledWith('req-1', 'allowed-once')
    expect(node(container, '#approval-note').textContent).toBe('批准已提交（仅此一次）——等待生效证据；未生效前不显示为已批准。')
    await act(async () => { click(node(container, '#approval-cards').children[0]!.querySelector('[data-approval-withdraw="req-1"]')!) })
    expect(actions.withdrawApproval).toHaveBeenCalledWith('req-1')
  })

  it('renders approval receipts with the verify-only re-read and the unreadable port sentence', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ approvals: { state: 'read', pending: [], lapsed: [], receipts: [
      { requestId: 'r-1', state: 'accepted', outcome: 'allowed-once' },
      { requestId: 'r-2', state: 'effective', outcome: 'rejected' },
      { requestId: 'r-3', state: 'lapsed', code: 'approval-lapsed' },
      { requestId: 'r-4', state: 'unknown', outcome: null },
    ] } }))
    const receipts = node(container, '#approval-receipts').children
    expect(receipts[0]?.textContent).toContain('批准已提交（仅此一次）：等待生效证据——未生效前不显示为已批准。')
    expect(receipts[1]?.textContent).toContain('已拒绝（有日志证据）。')
    expect(receipts[2]?.textContent).toContain('已失效：approval-lapsed——需重新申请；不代表已批准。')
    expect(receipts[3]?.textContent).toContain('结果未知：只给核对，不自动重试；未确认前不显示为已批准。')
    await act(async () => { click(receipts[3]!.querySelector('[data-approval-verify="r-4"]')!) })
    expect(actions.verifyApproval).toHaveBeenCalledTimes(1)
    expect(node(container, '#approval-note').textContent).toBe('已重新读取该等待的状态（核对=只读，不重试同一提交）。')

    const fresh = mountRegion()
    setRegion(fresh.store, 'session', readSlot({ approvals: { state: 'unavailable', code: 'approval-relay-unavailable' } }))
    expect(node(fresh.container, '#approval-note').textContent).toBe('未核验：授权等待端口未接线（approval-relay-unavailable）；不以空列表冒充。')
  })
})

describe('anchors, edits and history (React region)', () => {
  const anchor = (runSeq: number, turn: number | null, preview: string) => ({ runSeq, turn, promptPreview: preview })

  it('reads anchors, previews locally and locates with one named read', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ anchors: { state: 'read', anchors: [anchor(7, 2, '预览文本'), anchor(6, null, '')], located: null } }))
    expect(node(container, '#anchor-note').textContent).toBe('共 2 个轮次锚点（按时间倒序；点击先看短预览，再显式定位）。')
    const rows = node(container, '#anchor-rows').children
    expect(rows[0]?.textContent).toContain('运行 @7·第 2 轮')
    expect(rows[0]?.textContent).toContain('预览：预览文本')
    expect(rows[1]?.textContent).toContain('（该轮没有用户文本预览）')

    click(rows[0]!.querySelector('[data-anchor-preview="7"]')!)
    const preview = node(container, '#anchor-preview')
    expect(preview.hasAttribute('hidden')).toBe(false)
    expect(node(container, '#anchor-preview-text').textContent).toBe('运行 @7·第 2 轮：预览文本')
    expect(node(container, '#anchor-note').textContent).toBe('锚点短预览（运行 @7）：有界短预览，未载入整段正文；点「定位到此轮消息」再显式定位。')

    await act(async () => { click(node(container, '#anchor-locate')) })
    expect(actions.locateAnchor).toHaveBeenCalledWith(7)
    expect(node(container, '#anchor-preview-text').textContent).toBe('已定位：运行 @7——预览')
    expect(node(container, '#anchor-note').textContent).toBe('已定位到运行 @7 的该轮消息（短预览；只走了纯历史读取）。')

    click(node(container, '#anchor-preview-close'))
    expect(node(container, '#anchor-preview').hasAttribute('hidden')).toBe(true)
  })

  it('keeps the located marker and the unreadable-port readings', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ anchors: { state: 'read', anchors: [anchor(7, 1, 'x')], located: { runSeq: 7 } } }))
    expect(node(container, '#anchor-rows').children[0]?.getAttribute('data-anchor-located')).toBe('true')
    setRegion(store, 'session', readSlot({ anchors: { state: 'unavailable' } }))
    expect(node(container, '#anchor-note').textContent).toBe('未核验：锚点读取端口未接线（不以空列表冒充能力）。')
    await act(async () => { click(node(container, '#anchor-read')) })
    expect(actions.readAnchors).toHaveBeenCalledTimes(1)
    actions.readAnchors.mockResolvedValueOnce('锚点读取失败（anchor-read-refused）：未核验，不以空列表冒充。')
    await act(async () => { click(node(container, '#anchor-read')) })
    expect(node(container, '#anchor-note').textContent).toBe('锚点读取失败（anchor-read-refused）：未核验，不以空列表冒充。')
  })

  it('saves, resends and verifies edits through the bridge with exact local targets', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({
      channel: channel({ transcript: [{ role: 'user', source: 'history', text: '原消息', messageRef: 'req-1' }] }),
      edits: { state: 'read', records: [{
        editId: 'edit-1234567890-abcdefg', messageRef: 'req-1', originalText: '原消息',
        activeVersion: 2,
        versions: [
          { version: 1, text: 'v1 文本', submission: 'effective' },
          { version: 2, text: 'v2 文本', submission: 'unknown' },
        ],
      }] },
    }))
    expect(node(container, '#edit-note').textContent).toBe('共 1 份编辑稿（原消息保持原样；重发只走高版本链、同一发送入口）。')
    const record = node(container, '#edit-rows').children[0]!
    expect(record.textContent).toContain('编辑稿 edit-1234567890-abcdef')
    expect(record.querySelector('[data-edit-original="req-1"]')?.textContent).toBe('原消息（未改写）：原消息')
    expect(record.querySelector('[data-edit-version="1"]')?.textContent).toContain('v1：v1 文本')
    expect(record.querySelector('[data-edit-version="1"]')?.textContent).toContain('已生效（已落史）')
    // Active version unknown -> verify only, never a resend.
    expect(record.querySelector('[data-edit-verify]')).not.toBeNull()
    expect(record.querySelector('[data-edit-resend]')).toBeNull()
    await act(async () => { click(record.querySelector('[data-edit-verify="edit-1234567890-abcdefg"]')!) })
    expect(actions.verifyEdit).toHaveBeenCalledWith('edit-1234567890-abcdefg')
    expect(node(container, '#edit-note').textContent).toBe('已生效：该版本已落史。')

    // Save with a target via the transcript edit entry.
    click(node(container, '#session-transcript').querySelector('[data-edit-message="req-1"]')!)
    setNativeValue(node(container, '#edit-input'), '新版本正文')
    await act(async () => { click(node(container, '#edit-save')) })
    expect(actions.saveEdit).toHaveBeenCalledWith('req-1', '新版本正文')
  })

  it('refuses a save without a chosen message locally', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ edits: { state: 'read', records: [] } }))
    await act(async () => { click(node(container, '#edit-save')) })
    expect(actions.saveEdit).not.toHaveBeenCalled()
    expect(node(container, '#edit-note').textContent).toBe('先从下方会话记录里选一条已发消息。')
  })

  it('offers a resend for a failed/unsent active version and words the missing port', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ edits: { state: 'read', records: [{
      editId: 'edit-2', messageRef: 'req-2', originalText: '原文', activeVersion: 1,
      versions: [{ version: 1, text: 'v1', submission: 'not-delivered' }],
    }] } }))
    const record = node(container, '#edit-rows').children[0]!
    expect(record.querySelector('[data-edit-resend]')?.textContent).toBe('重发 v1')
    await act(async () => { click(record.querySelector('[data-edit-resend="edit-2"]')!) })
    expect(actions.resendEdit).toHaveBeenCalledWith('edit-2')
    expect(node(container, '#edit-note').textContent).toBe('重发已接收（等待生效确认）：与普通发送同一入口。')

    const fresh = mountRegion()
    setRegion(fresh.store, 'session', readSlot({ edits: null }))
    expect(node(fresh.container, '#edit-note').textContent).toBe('未核验：编辑记录端口未接线（不以空列表冒充能力）。')
  })

  it('reads the history runs, passes the paging cursor, and renders the run detail honestly', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ history: { state: 'read',
      runs: [
        { runSeq: 7, model: 'gpt-x', provider: 'openai', endSeq: null, endReason: null, messages: 4 },
        { runSeq: 6, model: null, provider: null, endSeq: 9, endReason: 'completed', messages: 2 },
      ],
      nextBeforeSeq: 5, hasMore: true,
      detail: { state: 'read', runSeq: 7, model: 'gpt-x', provider: 'openai', userTexts: ['第一条输入', '第二条输入'], outputPreview: '输出预览', outputTruncated: true,
        clarifications: [{ question: '选哪个？', selected: ['A'], custom: '补充', answered: true }, { question: '没答的', selected: [], custom: null, answered: false }] },
    } }))
    expect(node(container, '#history-note').textContent).toBe('共 2 次运行（按时间倒序；默认展开最近一次的输出与产物卡；更早的运行按页加载）。')
    const rows = node(container, '#history-rows').children
    expect(rows[0]?.textContent).toContain('运行 @7')
    expect(rows[0]?.textContent).toContain('当时模型 openai/gpt-x')
    expect(rows[0]?.textContent).toContain('进行中（未结束）')
    expect(rows[1]?.textContent).toContain('未记录请求头模型')
    expect(rows[1]?.textContent).toContain('已结束（completed）')

    const detail = node(container, '#history-detail')
    expect(detail.hasAttribute('hidden')).toBe(false)
    expect(node(container, '#history-detail-model').textContent).toBe('当时实际模型（本运行请求头快照）：openai/gpt-x——与本事项当前选择分开显示（当前默认见模型卡）。')
    expect(node(container, '#history-detail-note').textContent).toBe('运行 @7：2 条用户输入；输出为有界预览（有截断）。')
    expect(node(container, '#history-detail-users').children).toHaveLength(2)
    expect(node(container, '#history-detail-output').textContent).toBe('输出预览')
    const clarifications = node(container, '#history-detail-clarifications').children
    expect(clarifications[0]?.textContent).toBe('问：选哪个？ —— 回答：A；自定义：补充')
    expect(clarifications[1]?.textContent).toBe('问：没答的 —— 未回答（提问中止或仍在等待）')

    const more = node(container, '#history-more') as HTMLButtonElement
    expect(more.hidden).toBe(false)
    await act(async () => { click(more) })
    expect(actions.readHistory).toHaveBeenCalledWith(5)
    await act(async () => { click(node(container, '#history-rows').querySelector('[data-history-action="detail"]')!) })
    expect(actions.readHistoryDetail).toHaveBeenCalledWith(7)
  })

  it('words the missing run detail and hides the detail block without a read', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'session', readSlot({ history: { state: 'read', runs: [], nextBeforeSeq: null, hasMore: false, detail: { state: 'missing', code: 'run-unreadable', runSeq: 3 } } }))
    expect(node(container, '#history-note').textContent).toBe('还没有读取历史运行：点「读取历史运行」走纯历史接点（打开历史不会激活执行）。')
    expect((node(container, '#history-more') as HTMLButtonElement).hidden).toBe(true)
    expect(node(container, '#history-detail').hasAttribute('hidden')).toBe(false)
    expect(node(container, '#history-detail-model').textContent).toBe('')
    expect(node(container, '#history-detail-note').textContent).toBe('这一运行的详情不可读（run-unreadable）：保持缺失（不显示空白成功）。')
    setRegion(store, 'session', readSlot({ history: { state: 'unavailable' } }))
    expect(node(container, '#history-detail').hasAttribute('hidden')).toBe(true)
    expect(node(container, '#history-note').textContent).toBe('未核验：历史读取端口未接线（不以空列表冒充能力）。')
  })
})
