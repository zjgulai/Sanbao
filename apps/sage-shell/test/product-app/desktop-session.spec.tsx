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
async function mount(readState: () => Promise<DesktopRead>, readBootstrap: () => Promise<DesktopBootstrapRead> = unavailableBootstrap) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = async (reader: () => Promise<DesktopRead>) => {
    await act(async () => {
      root.render(createElement(DesktopPage, {
        readState: reader,
        readBootstrap,
        preferencesController: inertPreferencesController,
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
    const files = container.querySelector('.turn-process-files')
    expect(files?.querySelector('summary')?.textContent).toBe('执行过程（1）')
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
