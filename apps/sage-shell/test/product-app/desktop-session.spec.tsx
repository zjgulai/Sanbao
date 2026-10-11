/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopPage } from '../../src/product/app/desktop/page.js'
import { classifyDesktopState, type DesktopBootstrapRead, type DesktopRead } from '../../src/product/app/desktop/client.js'
import type { DevicePreferencesController } from '../../src/product/app/desktop/device-preferences.js'
import { desktopSessionPayload } from '../support/desktop-session-fixture.js'

const cleanups: Array<() => void> = []
const blocked: DesktopRead = { kind: 'blocked', code: 'projection-read-unavailable' }
const unavailableBootstrap = async (): Promise<DesktopBootstrapRead> => ({ kind: 'unavailable', code: null })
const unavailablePreferences = { kind: 'unavailable' as const, code: null }
const inertPreferencesController: DevicePreferencesController = {
  snapshot: () => ({ read: unavailablePreferences, saving: false, lastSave: 'idle' }),
  subscribe: () => () => undefined,
  refresh: async () => unavailablePreferences,
  save: async () => ({ outcome: 'refused', read: unavailablePreferences }),
}
const snapshot = () => classifyDesktopState(desktopSessionPayload())
const ack = () => Response.json({ state: 'accepted', sessionId: 'session:one', requestId: 'request:one', mode: 'queue' })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}
async function mount(
  readState: () => Promise<DesktopRead>,
  readBootstrap: () => Promise<DesktopBootstrapRead> = unavailableBootstrap,
  preferencesController: DevicePreferencesController = inertPreferencesController,
) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = async (reader: () => Promise<DesktopRead>) => {
    await act(async () => {
      root.render(createElement(DesktopPage, {
        readState: reader,
        readBootstrap,
        preferencesController,
      }))
    })
  }
  await render(readState)
  cleanups.push(() => { act(() => root.unmount()); container.remove() })
  return { container, render }
}
function write(container: HTMLElement, text: string) {
  const input = container.querySelector('textarea')!
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, text)
  act(() => { input.dispatchEvent(new Event('input', { bubbles: true })) })
  return input
}
const control = (container: HTMLElement, label: string) => {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(button, `control ${label}`).not.toBeNull()
  return button!
}
const click = async (node: HTMLElement) => { await act(async () => { node.click() }) }
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(() => { cleanups.splice(0).reverse().forEach(dispose => dispose()); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('default desktop session submission lifecycle', () => {
  it('renders the actual session and clears only the accepted submitted draft', async () => {
    const requests: unknown[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { requests.push([url, JSON.parse(String(init.body))]); return ack() })
    const read = vi.fn(async () => snapshot())
    const { container } = await mount(read)
    expect(container.querySelector('[aria-label="当前会话"]')).not.toBeNull()
    expect(container.querySelector('.reply-body')?.textContent).toContain('实际回复')
    const input = write(container, '新的问题')
    await click(control(container, '发送任务'))
    expect(requests).toEqual([['/.sage/session/send', { matterRef: 'matter:one', workspaceRoot: '/controlled/workspace', text: '新的问题', mode: 'queue' }]])
    expect(read.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(input.value).toBe('')
    expect(container.textContent).toContain('已进入收件箱')
    expect(container.querySelector('.message-scroll')?.textContent).not.toContain('新的问题')
  })

  it('does not post if the fresh read withdraws the context and keeps the draft', async () => {
    const post = vi.fn()
    vi.stubGlobal('fetch', post)
    const read = vi.fn<() => Promise<DesktopRead>>().mockResolvedValueOnce(snapshot()).mockResolvedValue(blocked)
    const { container } = await mount(read)
    const input = write(container, '仍然是我的草稿')
    await click(control(container, '发送任务'))
    expect(container.textContent).toContain('上下文已失效')
    expect(container.querySelector('.message-scroll')).toBeNull()
    expect(input.value).toBe('仍然是我的草稿')
    expect(post).not.toHaveBeenCalled()
  })

  it('coalesces repeated clicks while pending and preserves newer text on a late acknowledgement', async () => {
    const reply = deferred<Response>()
    const fetcher = vi.fn(() => reply.promise)
    vi.stubGlobal('fetch', fetcher)
    const { container } = await mount(async () => snapshot())
    const input = write(container, '提交的原文')
    await act(async () => { control(container, '发送任务').click(); control(container, '发送任务').click() })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(control(container, '发送任务').disabled).toBe(true)
    write(container, '等待时编辑的新版本')
    await act(async () => { reply.resolve(ack()) })
    expect(input.value).toBe('等待时编辑的新版本')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('locks an unknown operation across successful rereads instead of resubmitting it', async () => {
    // ADR-0297: the reconciliation read fires alongside the rereads — an unavailable answer
    // (no read policy in this fixture) keeps the gate exactly as locked as before.
    const fetcher = vi.fn(async (url: string) => url === '/.sage/session/attempt-status'
      ? Response.json({ state: 'unavailable', code: 'session-attempt-status-unavailable' })
      : Response.json({ state: 'refused', code: 'protected-effect-outcome-unknown' }))
    vi.stubGlobal('fetch', fetcher)
    const { container } = await mount(async () => snapshot())
    const input = write(container, '不能重复的请求')
    await click(control(container, '发送任务'))
    expect(container.textContent).toContain('结果未知')
    expect(control(container, '发送任务').disabled).toBe(true)
    await click(control(container, '重新读取状态'))
    await click(control(container, '发送任务'))
    expect(input.value).toBe('不能重复的请求')
    expect(fetcher.mock.calls.filter(([url]) => url === '/.sage/session/send')).toHaveLength(1)
  })

  it('settles the uncertainty gate only when the reconciliation read shows no active attempt (ADR-0297)', async () => {
    const fetcher = vi.fn(async (url: string) => url === '/.sage/session/attempt-status'
      ? Response.json({
          state: 'read', matterRef: 'matter:one', active: null,
          last: { attemptId: 'attempt:one', status: 'succeeded' },
        })
      : Response.json({ state: 'refused', code: 'protected-effect-outcome-unknown' }))
    vi.stubGlobal('fetch', fetcher)
    const { container } = await mount(async () => snapshot())
    const input = write(container, '不能重复的请求')
    await click(control(container, '发送任务'))
    // The post-action background read carries the reconciliation: no active attempt answers,
    // so the gate settles with the settlement named — and the kept draft is sendable again.
    expect(container.textContent).toContain('已核对：上一条发送已结算（成功）')
    expect(control(container, '发送任务').disabled).toBe(false)
    expect(input.value).toBe('不能重复的请求')
  })

  it('renders the live stream while the turn executes and clears it when the stream closes (ADR-0298)', async () => {
    const encoder = new TextEncoder()
    let streamBody!: ReadableStreamDefaultController<Uint8Array>
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/.sage/session/stream') {
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) { streamBody = controller },
        }), { headers: { 'content-type': 'text/event-stream' } })
      }
      return ack()
    })
    vi.stubGlobal('fetch', fetcher)
    const payload = desktopSessionPayload()
    const executing = classifyDesktopState({
      ...payload,
      sessionChannel: { ...payload.sessionChannel, execution: 'executing', lastTurnEnd: null },
    })
    const { container } = await mount(async () => executing)
    expect(fetcher.mock.calls.some(([url]) => url === '/.sage/session/stream')).toBe(true)

    // ADR-0299: a heading arriving mid-stream renders as a heading, as the observed product does.
    await act(async () => { streamBody.enqueue(encoder.encode('data: {"text":"## 半标题\\n- 一项"}\n\n')) })
    const live = container.querySelector('.streaming-message')
    expect(live?.textContent).toContain('半标题')
    expect(live?.querySelector('h2')?.textContent).toBe('半标题')
    expect(live?.querySelector('li')?.textContent).toBe('一项')

    // The stream ends at the turn end: the live text is presentation only and clears at once.
    await act(async () => { streamBody.close() })
    expect(container.querySelector('.streaming-message')).toBeNull()
  })

  it('renders the artifact rail, posts the chosen action, and re-reads (ADR-0300)', async () => {
    const fetcher = vi.fn(async () => Response.json({ state: 'opened', preview: { state: 'ready', artifactId: 'artifact:one', name: '清单.html', kind: 'html', version: 'v1', expanded: false, window: false } }))
    vi.stubGlobal('fetch', fetcher)
    const payload = desktopSessionPayload()
    const withCard = classifyDesktopState({
      ...payload,
      artifacts: { state: 'read', cards: [{ artifactId: 'artifact:one', name: '清单.html', kind: 'html', bytes: 2048, state: 'ready', source: 'changes-observed', observedAt: '2026-10-11T00:00:00Z', version: 'v1' }], preview: { state: 'closed' } },
    })
    const read = vi.fn(async () => withCard)
    const { container } = await mount(read)
    expect(container.querySelector('.artifact-rail')).not.toBeNull()
    expect(container.querySelector('.artifact-name')?.textContent).toBe('清单.html')
    const calls = read.mock.calls.length
    await click(control(container, '面板打开 清单.html'))
    const openCall = fetcher.mock.calls.find(([url]) => url === '/.sage/artifacts/open')
    expect(openCall).toBeDefined()
    expect(JSON.parse(String(openCall?.[1]?.body))).toEqual({ artifactId: 'artifact:one' })
    // The action answers through its own route; the projection is then re-read.
    expect(read.mock.calls.length).toBeGreaterThan(calls)
  })

  it('shows the open preview status with its controls and avoids the panel edge (ADR-0300)', async () => {
    const fetcher = vi.fn(async () => Response.json({ state: 'closed' }))
    vi.stubGlobal('fetch', fetcher)
    const payload = desktopSessionPayload()
    const withPreview = classifyDesktopState({
      ...payload,
      artifacts: { state: 'read', cards: [], preview: { state: 'ready', artifactId: 'artifact:one', name: '清单.html', kind: 'html', version: 'v1', expanded: false, window: false } },
    })
    const { container } = await mount(async () => withPreview)
    // Cards are empty but the preview keeps the rail alive; the layout avoids the fixed panel.
    expect(container.querySelector('.artifact-rail')).not.toBeNull()
    expect(container.querySelector('.session-layout.preview-open')).not.toBeNull()
    expect(container.querySelector('[data-artifact-preview="ready"]')?.textContent).toContain('清单.html')
    await click(control(container, '关闭预览'))
    const closeCall = fetcher.mock.calls.find(([url]) => url === '/.sage/artifacts/close')
    expect(closeCall).toBeDefined()
    expect(JSON.parse(String(closeCall?.[1]?.body))).toEqual({})
  })

  it('offers retry on a failed preview and omits a malformed artifact slot (ADR-0300)', async () => {
    const fetcher = vi.fn(async () => Response.json({ state: 'opened', preview: { state: 'ready' } }))
    vi.stubGlobal('fetch', fetcher)
    const payload = desktopSessionPayload()
    const failed = classifyDesktopState({
      ...payload,
      artifacts: { state: 'read', cards: [], preview: { state: 'failed', artifactId: 'artifact:one', name: '清单.html', code: 'artifact-version-moved', retryable: true } },
    })
    const { container } = await mount(async () => failed)
    await click(control(container, '重试打开'))
    expect(fetcher.mock.calls.some(([url]) => url === '/.sage/artifacts/retry')).toBe(true)

    // A malformed slot is omitted entirely: no rail, no crash.
    const malformed = classifyDesktopState({ ...payload, artifacts: { state: 'read', cards: [{ artifactId: 'x' }], preview: { state: 'closed' } } })
    expect('artifacts' in malformed).toBe(false)
    const second = await mount(async () => malformed)
    expect(second.container.querySelector('.artifact-rail')).toBeNull()
  })

  it('renders the settled turn process footer and the live write row (ADR-0301)', async () => {
    const payload = desktopSessionPayload()
    const settled = classifyDesktopState({
      ...payload,
      sessionChannel: {
        ...payload.sessionChannel,
        turnProcess: { durationMs: 12000, iterations: 3, fileWrites: [{ name: 'edit', file: 'demo.html', state: 'done', durationMs: 3000 }] },
      },
    })
    const { container } = await mount(async () => settled)
    const footer = container.querySelector('.turn-process')
    expect(footer?.textContent).toContain('已完成')
    expect(footer?.textContent).toContain('耗时 12s')
    expect(footer?.textContent).toContain('3 步')
    // The process list is closed until asked for (执行过程 button, shared with 审阅).
    expect(container.querySelector('.turn-process-files li')).toBeNull()
    await click(control(container, '执行过程'))
    const files = container.querySelector('.turn-process-files')
    expect(files?.textContent).toContain('编辑 demo.html · 完成 · 3s')

    // The executing window shows the running write row; the live stream subscription rides along.
    const fetcher = vi.fn(async (url: string) => url === '/.sage/session/stream'
      ? new Response(new ReadableStream<Uint8Array>({ start() { /* stays open */ } }), { headers: { 'content-type': 'text/event-stream' } })
      : ack())
    vi.stubGlobal('fetch', fetcher)
    const executing = classifyDesktopState({
      ...payload,
      sessionChannel: {
        ...payload.sessionChannel,
        execution: 'executing', lastTurnEnd: null,
        turnProcess: { durationMs: null, iterations: null, fileWrites: [{ name: 'write', file: 'demo.html', state: 'running', durationMs: null }] },
      },
    })
    const live = await mount(async () => executing)
    expect(live.container.querySelector('.process-live')?.textContent).toContain('正在写入 demo.html')
  })

  it('renders the change summary and the review diff with red/green lines (ADR-0302)', async () => {
    const payload = desktopSessionPayload()
    const settled = classifyDesktopState({
      ...payload,
      sessionChannel: {
        ...payload.sessionChannel,
        turnProcess: {
          durationMs: 8000, iterations: 2,
          fileWrites: [{
            name: 'edit', file: 'demo.html', state: 'done', durationMs: 2000,
            added: 2, removed: 2,
            hunks: [{ old: 'line-a\nline-b', new: 'line-a\nline-c' }],
          }],
        },
      },
    })
    const { container } = await mount(async () => settled)
    const summary = container.querySelector('.turn-process-summary')
    expect(summary?.textContent).toContain('本轮文件修改摘要：1 个文件 · +2/-2')

    await click(control(container, '审阅本轮修改'))
    const item = container.querySelector('.turn-process-files li')
    expect(item?.textContent).toContain('编辑 demo.html · 完成 · 2s · +2/-2')
    // 查看本次修改 (M02 entry) opens the bounded hunks with removed/added lines.
    await click(item?.querySelector('summary') as HTMLElement)
    expect(item?.querySelector('.diff-old')?.textContent).toContain('- line-b')
    expect(item?.querySelector('.diff-new')?.textContent).toContain('+ line-c')
  })

  it('shows the context-occupancy chip only when the projection carries both figures (ADR-0303)', async () => {
    const payload = desktopSessionPayload()
    const withUsage = classifyDesktopState({
      ...payload,
      sessionChannel: { ...payload.sessionChannel, contextUsage: { pressureTokens: 12000, contextWindow: 80000 } },
    })
    const { container } = await mount(async () => withUsage)
    expect(container.querySelector('.context-usage')?.textContent).toBe('上下文 15%')

    // A context without the projection renders no chip (absent, never an invented number).
    const plain = await mount(async () => snapshot())
    expect(plain.container.querySelector('.context-usage')).toBeNull()
  })

  it('renders the task monitor with the review card and honest axes (ADR-0304)', async () => {
    const payload = desktopSessionPayload()
    const withMonitor = classifyDesktopState({
      ...payload,
      sessionChannel: {
        ...payload.sessionChannel,
        turnProcess: { durationMs: 12000, endedAt: 1760000000000, iterations: 3, fileWrites: [] },
      },
    })
    const { container } = await mount(async () => withMonitor)
    await click(control(container, '运行模式'))
    expect(container.querySelector('.monitor-page')).not.toBeNull()
    expect(container.textContent).toContain('步骤：空闲')
    expect(container.textContent).toContain('预算／用量：未知（usage-provider-unavailable）')
    const card = container.querySelector('.review-card')
    expect(card?.textContent).toContain('本轮回顾')
    expect(card?.querySelector('.review-updated')?.textContent).toContain('更新于')
    expect(card?.textContent).toContain('耗时 12s')
    expect(card?.textContent).toContain('3 步')
    expect(card?.textContent).toContain('暂无观察到产出')
    expect(card?.textContent).toContain('来源读数未接通')

    // A malformed monitor degrades to the honest unavailable rows, never a crash.
    const malformed = classifyDesktopState({ ...payload, runMonitor: { state: 'read', steps: 'x' } })
    const second = await mount(async () => malformed)
    await click(control(second.container, '运行模式'))
    expect(second.container.textContent).toContain('步骤：不可读（monitor-not-read）')
    expect(second.container.textContent).toContain('设备：未知（device-binding-unavailable）')
  })

  it('opens the quick appearance submenu and saves through the shared controller (ADR-0305)', async () => {
    const saves: unknown[] = []
    const read = {
      kind: 'read' as const,
      value: {
        requested: { theme: 'light' as const, language: 'zh' as const, density: 'comfortable' as const, fontStyle: 'sans' as const, contentWidth: 'standard' as const, terminalTheme: 'follow' as const, fileIcons: 'product' as const, iconAppearance: 'system' as const },
        savedAt: null, effectiveTheme: 'light' as const,
      },
    }
    const controller: DevicePreferencesController = {
      snapshot: () => ({ read, saving: false, lastSave: 'idle' }),
      subscribe: () => () => undefined,
      refresh: async () => read,
      save: async (patch) => { saves.push(patch); return { outcome: 'saved', read } },
    }
    const { container } = await mount(async () => snapshot(), unavailableBootstrap, controller)
    await click(control(container, '账号与设置'))
    await click(control(container, '外观'))
    const appearance = container.querySelector('[aria-label="快捷外观"]')
    expect(appearance).not.toBeNull()
    for (const label of ['明暗模式', '语言', '字体风格', '内容宽度']) {
      expect(container.querySelector(`select[aria-label="${label}"]`)).not.toBeNull()
    }
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="明暗模式"]')!
    expect(select.value).toBe('light')
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'dark')
    await act(async () => { select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(saves).toEqual([{ theme: 'dark' }])

    // An unreadable controller shows the honest note instead of invented values.
    const plain = await mount(async () => snapshot())
    await click(control(plain.container, '账号与设置'))
    await click(control(plain.container, '外观'))
    expect(plain.container.querySelector('.appearance-note')?.textContent).toContain('偏好不可读')
  })

  it('navigates to the extension management page from the sidebar (ADR-0306)', async () => {
    const { container } = await mount(async () => snapshot())
    await click(control(container, '扩展'))
    expect(container.querySelector('.extensions-page')).not.toBeNull()
    expect(container.querySelector('.extensions-page h1')?.textContent).toBe('扩展管理')
    expect(container.textContent).toContain('管理本机已安装的插件、技能、连接器和智能体。')
  })

  it('renders the approval wait card and posts the real answer with honest refusals (ADR-0313 S03)', async () => {
    const fetcher = vi.fn(async (url: string) => url === '/.sage/session/approval-answer'
      ? Response.json({ state: 'refused', code: 'protected-effect-unavailable' })
      : url === '/.sage/session/approval-withdraw'
        ? Response.json({ state: 'recorded', receipt: { receiptId: 'r1', requestId: 'approval:1', outcome: 'withdrawn', at: '2026-10-11T00:00:00Z' } })
        : ack())
    vi.stubGlobal('fetch', fetcher)
    const payload = desktopSessionPayload()
    const withApprovals = classifyDesktopState({
      ...payload,
      sessionApprovals: {
        state: 'read', code: null, at: null, lapsed: [], receipts: [],
        pending: [{ requestId: 'approval:1', toolName: 'run_shell', callId: null, reason: '需要读取工作区', withdrawable: true, raisedAt: '2026-10-11T00:00:00Z' }],
      },
    })
    const { container } = await mount(async () => withApprovals)
    expect(container.querySelector('.approvals-section')?.textContent).toContain('run_shell')
    expect(container.textContent).toContain('需要读取工作区')
    await click(control(container, '允许一次 run_shell'))
    const answer = fetcher.mock.calls.find(([url]) => url === '/.sage/session/approval-answer')
    expect(JSON.parse(String(answer?.[1]?.body))).toEqual({ matterRef: 'matter:one', requestId: 'approval:1', outcome: 'allowed-once' })
    expect(container.textContent).toContain('授权应答尚未接通')
    await click(control(container, '撤回等待 run_shell'))
    const withdraw = fetcher.mock.calls.find(([url]) => url === '/.sage/session/approval-withdraw')
    expect(JSON.parse(String(withdraw?.[1]?.body))).toEqual({ matterRef: 'matter:one', requestId: 'approval:1' })
    expect(container.textContent).toContain('已撤回等待')
  })

  it('shows the model-queue card with the service facts and a verify reread (ADR-0313 S05)', async () => {
    const payload = desktopSessionPayload()
    const withQueue = classifyDesktopState({
      ...payload,
      modelQueue: {
        state: 'read', verdict: 'retrying', verifyOnly: false, reason: null, at: null,
        retries: [{ retryId: 'retry:1', turn: 1, attempt: 2, maxAttempts: 3, delayMs: 5000, provider: 'provider:local', failureCode: 'rate-limited', started: false }],
      },
    })
    const { container } = await mount(async () => withQueue)
    const card = container.querySelector('.model-queue-card')
    expect(card?.textContent).toContain('正在重试')
    expect(card?.textContent).toContain('rate-limited')
    expect(card?.textContent).toContain('服务计划 5s 后重试')

    const unknown = classifyDesktopState({
      ...payload,
      modelQueue: { state: 'read', verdict: 'unknown', retries: [], verifyOnly: true, reason: 'timeout', at: null },
    })
    const read = vi.fn(async () => unknown)
    const second = await mount(read)
    const calls = read.mock.calls.length
    await click(control(second.container, '核对排队状态'))
    expect(read.mock.calls.length).toBeGreaterThan(calls)
  })

  it('lists pending inputs and queue occurrences with edit/remove on the real routes (ADR-0313 S07)', async () => {
    const fetcher = vi.fn(async () => Response.json({ state: 'ok' }))
    vi.stubGlobal('fetch', fetcher)
    const payload = desktopSessionPayload()
    const withLists = classifyDesktopState({
      ...payload,
      sessionChannel: {
        ...payload.sessionChannel,
        pending: [{ itemId: 'pending:1', text: '补充说明', state: 'pending', note: null, editable: true }],
        queue: { state: 'read', occurrences: [{ queueItemId: 'queue:1', position: 'queued', requestId: null, preview: '排队消息' }] },
      },
    })
    const { container } = await mount(async () => withLists)
    expect(container.querySelector('[aria-label="待继续输入"]')?.textContent).toContain('补充说明')
    expect(container.querySelector('[aria-label="队列"]')?.textContent).toContain('排队消息')
    await click(control(container, '编辑项 补充说明'))
    const input = container.querySelector<HTMLInputElement>('input[aria-label="编辑 补充说明"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '改后的说明')
    await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
    await click(control(container, '保存修改'))
    const editCall = fetcher.mock.calls.find(([url]) => url === '/.sage/session/pending')
    expect(JSON.parse(String(editCall?.[1]?.body))).toEqual({ action: 'edit', itemId: 'pending:1', text: '改后的说明' })
    await click(control(container, '移除项 排队消息'))
    const removeCall = fetcher.mock.calls.find(([url]) => url === '/.sage/session/queue')
    expect(JSON.parse(String(removeCall?.[1]?.body))).toEqual({ action: 'remove', itemId: 'queue:1' })
  })

  it('renders the plans roster with blocking readiness labels (ADR-0313 S06)', async () => {
    const payload = desktopSessionPayload()
    const withPlans = classifyDesktopState({
      ...payload,
      plans: {
        state: 'read', lastStepRun: null,
        plans: [{
          planId: 'plan:1', matterRef: 'matter:one', title: '三步计划', state: 'accepted', createdAt: '2026-10-11T00:00:00Z',
          steps: [
            { stepNo: 1, title: '采集', readiness: 'ready', readinessNote: '素材已备' },
            { stepNo: 2, title: '整理', readiness: 'not-ready', readinessNote: '依赖第 1 步产物' },
            { stepNo: 3, title: '发布', readiness: 'unknown', readinessNote: '权限未核验' },
          ],
        }],
      },
    })
    const { container } = await mount(async () => withPlans)
    await click(control(container, '运行模式'))
    const roster = container.querySelector('[aria-label="计划步骤"]')
    expect(roster?.textContent).toContain('三步计划')
    expect(roster?.textContent).toContain('就绪')
    expect(roster?.textContent).toContain('未就绪（阻断——不派发）')
    expect(roster?.textContent).toContain('未知（阻断——不派发）')
    expect(roster?.textContent).toContain('依赖第 1 步产物')
  })

  it('names every control refusal and re-reads the fold even when the service refuses (ADR-0313 review)', async () => {
    const fetcher = vi.fn(async (url: string) => url === '/.sage/session/pending'
      ? Response.json({ state: 'refused', code: 'protected-effect-unavailable' })
      : url === '/.sage/session/queue'
        ? Response.json({ state: 'refused', code: 'queue-item-not-found' })
        : ack())
    vi.stubGlobal('fetch', fetcher)
    const payload = desktopSessionPayload()
    const withLists = classifyDesktopState({
      ...payload,
      sessionChannel: {
        ...payload.sessionChannel,
        pending: [{ itemId: 'pending:1', text: '补充说明', state: 'pending', note: null, editable: true }],
        queue: { state: 'read', occurrences: [{ queueItemId: 'queue:1', position: 'queued', requestId: null, preview: '排队消息' }] },
      },
    })
    const read = vi.fn(async () => withLists)
    const { container } = await mount(read)
    const reads = read.mock.calls.length
    await click(control(container, '编辑项 补充说明'))
    const input = container.querySelector<HTMLInputElement>('input[aria-label="编辑 补充说明"]')!
    // A whitespace-only save is refused locally: nothing is posted and the editor stays open.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '   ')
    await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
    await click(control(container, '保存修改'))
    expect(container.textContent).toContain('未提交（内容为空）。')
    expect(fetcher.mock.calls.some(([url]) => url === '/.sage/session/pending')).toBe(false)
    expect(container.querySelector('input[aria-label="编辑 补充说明"]')).not.toBeNull()
    // A real edit refused by the service is named, the editor stays open, and the fold is re-read.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '改后的说明')
    await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
    await click(control(container, '保存修改'))
    expect(container.textContent).toContain('会话控制尚未接通（接线完成前不会记录任何改动）。')
    expect(container.querySelector('input[aria-label="编辑 补充说明"]')).not.toBeNull()
    const readsAfterEdit = read.mock.calls.length
    expect(readsAfterEdit).toBeGreaterThan(reads)
    await click(control(container, '移除项 排队消息'))
    expect(container.textContent).toContain('这一项已开始处理（不在队列里了）——以服务快照为准。')
    expect(read.mock.calls.length).toBeGreaterThan(readsAfterEdit)
  })

  it('keeps the plans roster honest: unavailable reads are named, draft plans are counted not judged (ADR-0313 review)', async () => {
    const payload = desktopSessionPayload()
    const unavailable = classifyDesktopState({ ...payload, plans: { state: 'unavailable', lastStepRun: null, plans: [] } })
    const first = await mount(async () => unavailable)
    await click(control(first.container, '运行模式'))
    const roster = first.container.querySelector('[aria-label="计划步骤"]')
    expect(roster?.textContent).toContain('计划读取不可用——不据此断言无计划。')
    expect(roster?.textContent).not.toContain('暂无已接受计划')
    const withDrafts = classifyDesktopState({
      ...payload,
      plans: {
        state: 'read', lastStepRun: null,
        plans: [
          { planId: 'plan:accepted', matterRef: 'matter:one', title: '已接受计划', state: 'accepted', createdAt: '2026-10-11T00:00:00Z',
            steps: [{ stepNo: 1, title: '采集', readiness: 'ready', readinessNote: '素材已备' }] },
          { planId: 'plan:draft', matterRef: 'matter:one', title: '草稿计划', state: 'draft', createdAt: '2026-10-11T00:00:00Z',
            steps: [{ stepNo: 1, title: '未定步骤', readiness: 'ready', readinessNote: '不应判读' }] },
        ],
      },
    })
    const second = await mount(async () => withDrafts)
    await click(control(second.container, '运行模式'))
    const roster2 = second.container.querySelector('[aria-label="计划步骤"]')
    expect(roster2?.textContent).toContain('已接受计划')
    expect(roster2?.textContent).not.toContain('未定步骤')
    expect(roster2?.textContent).toContain('另有 1 个未接受草稿计划（不判读步骤）。')
  })

  it('echoes an indeterminate approval receipt as unknown, never as a recorded decision (ADR-0313 review)', async () => {
    const fetcher = vi.fn(async (url: string) => url === '/.sage/session/approval-answer'
      ? Response.json({ state: 'recorded', receipt: { receiptId: 'r2', requestId: 'approval:2', outcome: 'allowed-once', state: 'unknown', at: '2026-10-11T00:00:00Z' } })
      : ack())
    vi.stubGlobal('fetch', fetcher)
    const payload = desktopSessionPayload()
    const withApprovals = classifyDesktopState({
      ...payload,
      sessionApprovals: {
        state: 'read', code: null, at: null, lapsed: [], receipts: [],
        pending: [{ requestId: 'approval:2', toolName: 'run_shell', callId: null, reason: null, withdrawable: false, raisedAt: '2026-10-11T00:00:00Z' }],
      },
    })
    const { container } = await mount(async () => withApprovals)
    await click(control(container, '允许一次 run_shell'))
    expect(container.textContent).toContain('结果未知（已记录，待核对，不自动重试）。')
    expect(container.textContent).not.toContain('已提交并等待服务记录。')
  })

  it('offers queue editing only for the queued position and names an unavailable snapshot (ADR-0313 review)', async () => {
    const payload = desktopSessionPayload()
    const withMixed = classifyDesktopState({
      ...payload,
      sessionChannel: {
        ...payload.sessionChannel,
        queue: { state: 'read', occurrences: [
          { queueItemId: 'queue:1', position: 'queued', requestId: null, preview: '排队消息' },
          { queueItemId: 'queue:2', position: 'steering', requestId: null, preview: '插队消息' },
        ] },
      },
    })
    const first = await mount(async () => withMixed)
    expect(first.container.querySelector('button[aria-label="编辑项 插队消息"]')).toBeNull()
    expect(first.container.querySelector('button[aria-label="移除项 插队消息"]')).toBeNull()
    expect(first.container.textContent).toContain('已进入处理，不可修改——以服务快照为准。')
    expect(first.container.querySelector('button[aria-label="编辑项 排队消息"]')).not.toBeNull()
    const unavailableQueue = classifyDesktopState({
      ...payload,
      sessionChannel: { ...payload.sessionChannel, queue: { state: 'unavailable', occurrences: [] } },
    })
    const second = await mount(async () => unavailableQueue)
    expect(second.container.textContent).toContain('队列快照不可用——以服务恢复后为准。')
  })

  it('does not clear a new-context draft or display a previous request receipt after reader replacement', async () => {
    const pending = deferred<Response>()
    vi.stubGlobal('fetch', () => pending.promise)
    const { container, render } = await mount(async () => snapshot())
    write(container, '旧上下文文本')
    await click(control(container, '发送任务'))
    await render(async () => blocked)
    const input = write(container, '新上下文草稿')
    await act(async () => { pending.resolve(ack()) })
    expect(input.value).toBe('新上下文草稿')
    expect(container.querySelector('[data-desktop-read="blocked"]')).not.toBeNull()
    expect(container.textContent).not.toContain('已进入收件箱')
  })

  it('shows stopped/resumed state only after the follow-up projection, not from the receipt alone', async () => {
    const payload = desktopSessionPayload()
    const executing = classifyDesktopState({ ...payload, sessionChannel: { ...payload.sessionChannel, execution: 'executing', lastTurnEnd: null } })
    const paused = classifyDesktopState({ ...payload, sessionChannel: { ...payload.sessionChannel, execution: 'idle', paused: true } })
    const follow = deferred<DesktopRead>()
    const read = vi.fn<() => Promise<DesktopRead>>().mockResolvedValueOnce(executing).mockResolvedValueOnce(executing).mockReturnValueOnce(follow.promise).mockResolvedValue(paused)
    const paths: string[] = []
    vi.stubGlobal('fetch', async (url: string) => { paths.push(url); return Response.json({ state: 'stopped', paused: true, drained: [], consumed: [], code: null }) })
    const { container } = await mount(read)
    await click(control(container, '停止生成'))
    expect(container.querySelector('[data-session-state="paused"]')).toBeNull()
    await act(async () => { follow.resolve(paused) })
    expect(container.querySelector('[data-session-state="paused"]')).not.toBeNull()
    expect(control(container, '继续会话')).not.toBeNull()
    // ADR-0298: the live-stream subscription rides alongside; the command path is the assertion.
    expect(paths.filter((path) => path !== '/.sage/session/stream')).toEqual(['/.sage/session/stop'])
  })

  it('polls an executing session without creating output or reissuing a command', async () => {
    vi.useFakeTimers()
    const payload = desktopSessionPayload()
    const executing = classifyDesktopState({ ...payload, sessionChannel: { ...payload.sessionChannel, execution: 'executing', lastTurnEnd: null } })
    const read = vi.fn<() => Promise<DesktopRead>>().mockResolvedValueOnce(executing).mockResolvedValue(blocked)
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { container } = await mount(read)
    write(container, '轮询不擦的输入')
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(read).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[aria-label="当前会话"]')).toBeNull()
    expect(container.querySelector('textarea')?.value).toBe('轮询不擦的输入')
    // ADR-0298: the only permissible transport here is the live-stream subscription.
    expect(fetcher.mock.calls.filter(([url]) => url !== '/.sage/session/stream')).toEqual([])
  })

  it('keeps the rendered session and its stop control while a background poll is still in flight', async () => {
    vi.useFakeTimers()
    const payload = desktopSessionPayload()
    const executing = classifyDesktopState({ ...payload, sessionChannel: { ...payload.sessionChannel, execution: 'executing', lastTurnEnd: null } })
    const follow = deferred<DesktopRead>()
    const read = vi.fn<() => Promise<DesktopRead>>().mockResolvedValueOnce(executing).mockReturnValueOnce(follow.promise).mockResolvedValue(executing)
    vi.stubGlobal('fetch', vi.fn())
    const { container } = await mount(read)
    expect(container.querySelector('[aria-label="当前会话"]')).not.toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(read).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[aria-label="当前会话"]')).not.toBeNull()
    expect(container.querySelector('[data-session-state="executing"]')).not.toBeNull()
    expect(control(container, '停止生成')).not.toBeNull()
    await act(async () => { follow.resolve(executing) })
    expect(container.querySelector('[aria-label="当前会话"]')).not.toBeNull()
  })
})
