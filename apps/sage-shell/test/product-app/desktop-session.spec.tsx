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
    expect(paths).toEqual(['/.sage/session/stop'])
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
    expect(fetcher).not.toHaveBeenCalled()
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
