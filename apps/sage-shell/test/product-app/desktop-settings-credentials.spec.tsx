/** @vitest-environment jsdom */
/** ADR-0334: the instance API Key card in the 模型 page. The card is real only when the
 *  controller is supplied (same narrow seam as the preferences controller); a save clears the
 *  draft and re-reads, a refusal keeps the draft and names the cause, and no state ever
 *  renders the value back. */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { DesktopSettingsView } from '../../src/product/app/desktop/settings-view.js'
import {
  INSTANCE_CREDENTIAL_NAME,
  classifyCredentialDescribe,
  classifyCredentialSave,
  createInstanceCredentialController,
  type InstanceCredentialController,
  type InstanceCredentialRead,
  type InstanceCredentialSaveOutcome,
} from '../../src/product/app/desktop/instance-credential.js'
import type { DevicePreferencesController } from '../../src/product/app/desktop/device-preferences.js'

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const cleanups: Array<() => void> = []

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

afterEach(() => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    cleanup()
    cleanup = cleanups.pop()
  }
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

const unavailablePreferences = { kind: 'unavailable' as const, code: null }
const inertController: DevicePreferencesController = {
  snapshot: () => ({ read: unavailablePreferences, saving: false, lastSave: 'idle' }),
  subscribe: () => () => undefined,
  refresh: async () => unavailablePreferences,
  save: async () => ({ outcome: 'refused', read: unavailablePreferences }),
}

const SECRET = 'sk-renderer-card-0123456789'

function stubController(options: {
  readonly read?: InstanceCredentialRead | (() => Promise<InstanceCredentialRead>)
  readonly save?: (value: string) => Promise<InstanceCredentialSaveOutcome>
}): InstanceCredentialController & { readonly saveMock: ReturnType<typeof vi.fn>, readonly readMock: ReturnType<typeof vi.fn> } {
  const readMock = vi.fn(async () => typeof options.read === 'function'
    ? await options.read()
    : options.read ?? { kind: 'read' as const, configured: false, source: null, writable: true })
  const saveMock = vi.fn(options.save ?? (async () => ({ kind: 'saved' as const })))
  return { read: readMock, save: saveMock, saveMock, readMock }
}

async function mount(credential?: InstanceCredentialController) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(DesktopSettingsView, {
      controller: inertController,
      ...(credential === undefined ? {} : { credential }),
    }))
  })
  cleanups.push(() => { act(() => { root.unmount() }); container.remove() })
  act(() => {
    const nav = Array.from(container.querySelectorAll('button')).find(item => item.textContent?.trim() === '模型')
    nav!.click()
  })
  // The card's initial describe resolves on a microtask; flush it so every assertion sees the
  // settled status instead of the loading placeholder.
  await act(async () => {})
  return { container }
}

function type(container: HTMLElement, value: string): void {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="实例 API Key 输入"]')!
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('ADR-0334: the instance API Key card', () => {
  it('renders no card when the controller is absent (shell-only consumers keep the old page)', async () => {
    const { container } = await mount()
    expect(container.querySelector('[aria-label="实例 API Key"]')).toBeNull()
  })

  it('reads the status, saves once, clears the draft, and never renders the value back', async () => {
    const controller = stubController({})
    const { container } = await mount(controller)
    const card = container.querySelector('[aria-label="实例 API Key"]')!
    expect(card.textContent).toContain('未配置：真实模型回合需要实例 API Key。')
    expect(card.textContent).toContain(INSTANCE_CREDENTIAL_NAME)

    const save = Array.from(card.querySelectorAll('button')).find(item => item.getAttribute('aria-label') === '保存实例 API Key')!
    expect((save as HTMLButtonElement).disabled).toBe(true)

    type(card as HTMLElement, SECRET)
    expect((save as HTMLButtonElement).disabled).toBe(false)
    await act(async () => { save.click() })
    expect(controller.saveMock).toHaveBeenCalledWith(SECRET)
    expect(controller.readMock).toHaveBeenCalledTimes(2)
    expect(card.textContent).toContain('已保存；值不回显。')
    expect(container.querySelector<HTMLInputElement>('input[aria-label="实例 API Key 输入"]')!.value).toBe('')
    expect(container.textContent).not.toContain(SECRET)
  })

  it('keeps the draft and names the cause when the save is refused', async () => {
    const controller = stubController({ save: async () => ({ kind: 'refused', code: 'bridge-credential-readonly-source' }) })
    const { container } = await mount(controller)
    const card = container.querySelector('[aria-label="实例 API Key"]') as HTMLElement
    type(card, SECRET)
    await act(async () => {
      Array.from(card.querySelectorAll('button')).find(item => item.getAttribute('aria-label') === '保存实例 API Key')!.click()
    })
    expect(card.textContent).toContain('当前值由启动环境变量提供（只读）')
    expect(container.querySelector<HTMLInputElement>('input[aria-label="实例 API Key 输入"]')!.value).toBe(SECRET)
  })

  it('names the identity refusal for a signed-out app', async () => {
    const controller = stubController({ read: { kind: 'unavailable', code: 'credential-identity-unavailable' } })
    const { container } = await mount(controller)
    const card = container.querySelector('[aria-label="实例 API Key"]')!
    expect(card.textContent).toContain('未登录：登录后可查看与保存。')
  })

  it('reports the env source as read-only and a file source as configured', async () => {
    const env = stubController({ read: { kind: 'read', configured: true, source: 'env', writable: false } })
    const first = await mount(env)
    expect(first.container.querySelector('[aria-label="实例 API Key"]')!.textContent).toContain('启动环境变量；只读')
    const file = stubController({ read: { kind: 'read', configured: true, source: 'file', writable: true } })
    const second = await mount(file)
    expect(second.container.querySelector('[aria-label="实例 API Key"]')!.textContent).toContain('来源：本机凭据文件')
  })

  it('names an unreachable read instead of inventing a state', async () => {
    const controller = stubController({ read: { kind: 'unavailable', code: 'unreachable' } })
    const { container } = await mount(controller)
    expect(container.querySelector('[aria-label="实例 API Key"]')!.textContent).toContain('凭据状态读取失败（unreachable）')
  })
})

describe('ADR-0334: the credential controller over the route', () => {
  it('posts the exact describe/set bodies and maps the receipts', async () => {
    const calls: Array<{ readonly url: string, readonly body: unknown }> = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) })
      const body = JSON.parse(String(init?.body)) as { readonly action: string }
      return new Response(JSON.stringify(body.action === 'describe'
        ? { state: 'read', entries: [{ name: INSTANCE_CREDENTIAL_NAME, configured: true, source: 'file', writable: true }] }
        : { state: 'saved', name: INSTANCE_CREDENTIAL_NAME }), { status: 200 })
    })
    const controller = createInstanceCredentialController(fetcher as unknown as typeof fetch)
    await expect(controller.read()).resolves.toEqual({ kind: 'read', configured: true, source: 'file', writable: true })
    await expect(controller.save(SECRET)).resolves.toEqual({ kind: 'saved' })
    expect(calls).toEqual([
      { url: '/.sage/credentials', body: { action: 'describe', name: INSTANCE_CREDENTIAL_NAME } },
      { url: '/.sage/credentials', body: { action: 'set', name: INSTANCE_CREDENTIAL_NAME, value: SECRET } },
    ])
  })

  it('classifies receipts defensively — unknown shapes become named failures, never guesses', async () => {
    expect(classifyCredentialDescribe({ state: 'refused', code: 'credential-identity-unavailable' }))
      .toEqual({ kind: 'unavailable', code: 'credential-identity-unavailable' })
    expect(classifyCredentialDescribe({ state: 'read', entries: [] })).toEqual({ kind: 'unavailable', code: 'unrecognised' })
    expect(classifyCredentialDescribe('junk')).toEqual({ kind: 'unavailable', code: 'unreachable' })
    expect(classifyCredentialSave({ state: 'refused', code: 'credentials-unavailable' }))
      .toEqual({ kind: 'refused', code: 'credentials-unavailable' })
    expect(classifyCredentialSave(null)).toEqual({ kind: 'unreachable' })
    expect(classifyCredentialSave({ state: 'weird' })).toEqual({ kind: 'refused', code: 'unrecognised' })
  })

  it('keeps a delivered 400 refusal named instead of claiming the request never arrived', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: 'invalid-credential-request', stage: 'intent' }), { status: 400 }))
    const controller = createInstanceCredentialController(fetcher as unknown as typeof fetch)
    await expect(controller.save('short')).resolves.toEqual({ kind: 'refused', code: 'invalid-credential-request' })
    const junk = createInstanceCredentialController((async () => new Response('no', { status: 500 })) as unknown as typeof fetch)
    await expect(junk.read()).resolves.toEqual({ kind: 'unavailable', code: 'unreachable' })
  })

  it('maps a transport failure to unavailable rather than a throw', async () => {
    const controller = createInstanceCredentialController((async () => { throw new Error('down') }) as unknown as typeof fetch)
    await expect(controller.read()).resolves.toEqual({ kind: 'unavailable', code: 'unreachable' })
    await expect(controller.save(SECRET)).resolves.toEqual({ kind: 'unreachable' })
  })
})
