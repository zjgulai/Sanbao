/** @vitest-environment jsdom */
/** ADR-0311: the 工作区文件 context submenu (O02.files.menu.open) — real T03 candidates, local
 *  filtering, named refusals; selecting a file is not assembled and says so. */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopPage } from '../../src/product/app/desktop/page.js'
import { classifyDesktopState, type DesktopBootstrapRead, type DesktopRead } from '../../src/product/app/desktop/client.js'
import type { DevicePreferencesController } from '../../src/product/app/desktop/device-preferences.js'
import { desktopSessionPayload } from '../support/desktop-session-fixture.js'

const cleanups: Array<() => void> = []
const unavailableBootstrap = async (): Promise<DesktopBootstrapRead> => ({ kind: 'unavailable', code: null })
const unavailablePreferences = { kind: 'unavailable' as const, code: null }
const inertPreferencesController: DevicePreferencesController = {
  snapshot: () => ({ read: unavailablePreferences, saving: false, lastSave: 'idle' }),
  subscribe: () => () => undefined,
  refresh: async () => unavailablePreferences,
  save: async () => ({ outcome: 'refused', read: unavailablePreferences }),
}
const snapshot = (): DesktopRead => classifyDesktopState(desktopSessionPayload())

async function mount(readState: () => Promise<DesktopRead>): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(DesktopPage, {
      readState, readBootstrap: unavailableBootstrap, preferencesController: inertPreferencesController,
    }))
  })
  cleanups.push(() => { act(() => { root.unmount() }); container.remove() })
  return container
}
const control = (container: HTMLElement, label: string): HTMLButtonElement => {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(button, `control ${label}`).not.toBeNull()
  return button!
}
const click = async (node: HTMLElement) => { await act(async () => { node.click() }) }
const type = async (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
}
const candidates = (body: unknown) => vi.fn(async (url: string) => url === '/.sage/workspace/files/candidates'
  ? Response.json(body)
  : Response.json({ state: 'accepted', sessionId: 'session:one', requestId: 'request:one', mode: 'queue' }))
const READ_BODY = {
  state: 'read', code: null, path: '', truncated: false,
  entries: [
    { name: 'AGENTS.md', path: 'AGENTS.md' },
    { name: 'demo.html', path: 'demo.html' },
    { name: 'README.md', path: 'README.md' },
  ],
}

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(() => { cleanups.splice(0).reverse().forEach((dispose) => dispose()); vi.unstubAllGlobals() })

describe('the workspace-files context submenu (ADR-0311)', () => {
  it('opens the observed submenu with a focused search box and the real candidate rows', async () => {
    const fetcher = candidates(READ_BODY)
    vi.stubGlobal('fetch', fetcher)
    const container = await mount(async () => snapshot())
    await click(control(container, '添加上下文'))
    await click(control(container, '工作区文件'))
    // The submenu reads through the real T03 route for the active workspace root.
    const call = fetcher.mock.calls.find(([url]) => url === '/.sage/workspace/files/candidates')
    expect(call).toBeDefined()
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ workspaceRoot: '/controlled/workspace', path: '' })
    const search = container.querySelector<HTMLInputElement>('input[aria-label="搜索工作区文件"]')!
    expect(search).not.toBeNull()
    expect(document.activeElement).toBe(search)
    for (const name of ['AGENTS.md', 'demo.html', 'README.md']) {
      expect(control(container, `选择文件 ${name}`)).not.toBeNull()
    }
  })

  it('filters candidates locally and reports an honest empty result', async () => {
    vi.stubGlobal('fetch', candidates(READ_BODY))
    const container = await mount(async () => snapshot())
    await click(control(container, '添加上下文'))
    await click(control(container, '工作区文件'))
    const search = container.querySelector<HTMLInputElement>('input[aria-label="搜索工作区文件"]')!
    await type(search, 'readme')
    expect(control(container, '选择文件 README.md')).not.toBeNull()
    expect(container.querySelector('button[aria-label="选择文件 AGENTS.md"]')).toBeNull()
    await type(search, 'sanbao-fixture-no-match')
    expect(container.querySelector('[class="context-files-note"]')?.textContent).toContain('没有匹配的文件')
  })

  it('keeps file selection unassembled with a named refusal, never a silent add', async () => {
    vi.stubGlobal('fetch', candidates(READ_BODY))
    const container = await mount(async () => snapshot())
    await click(control(container, '添加上下文'))
    await click(control(container, '工作区文件'))
    await click(control(container, '选择文件 demo.html'))
    expect(container.textContent).toContain('选择文件作为上下文尚未接通')
    expect(container.textContent).toContain('未附加任何内容')
  })

  it('returns to the context root on Left with an empty query', async () => {
    vi.stubGlobal('fetch', candidates(READ_BODY))
    const container = await mount(async () => snapshot())
    await click(control(container, '添加上下文'))
    await click(control(container, '工作区文件'))
    const search = container.querySelector<HTMLInputElement>('input[aria-label="搜索工作区文件"]')!
    await act(async () => { search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })) })
    expect(container.querySelector('.context-files-menu')).toBeNull()
    // Back at the root menu, with its items still present and focus on the files item.
    expect(control(container, '目标：不可用')).not.toBeNull()
    expect(document.activeElement).toBe(control(container, '工作区文件'))
    // Second half of the observed exit: Left at the root returns to the input entry.
    await act(async () => {
      ;(document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(control(container, '添加上下文'))
  })

  it('keeps the caret semantics: Left with a non-empty query never closes the submenu', async () => {
    vi.stubGlobal('fetch', candidates(READ_BODY))
    const container = await mount(async () => snapshot())
    await click(control(container, '添加上下文'))
    await click(control(container, '工作区文件'))
    const search = container.querySelector<HTMLInputElement>('input[aria-label="搜索工作区文件"]')!
    await type(search, 'readme')
    await act(async () => { search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })) })
    expect(container.querySelector('.context-files-menu')).not.toBeNull()
    expect(container.querySelector<HTMLInputElement>('input[aria-label="搜索工作区文件"]')!.value).toBe('readme')
  })

  it('never lets a slow earlier fetch overwrite a newer open result', async () => {
    let resolveFirst: ((value: Response) => void) | null = null
    const fetcher = vi.fn(async (url: string) => {
      if (url !== '/.sage/workspace/files/candidates') return Response.json({ state: 'accepted' })
      if (resolveFirst === null) {
        return new Promise<Response>((resolve) => { resolveFirst = resolve })
      }
      return Response.json(READ_BODY)
    })
    vi.stubGlobal('fetch', fetcher)
    const container = await mount(async () => snapshot())
    await click(control(container, '添加上下文'))
    await click(control(container, '工作区文件'))          // request A (pending)
    await act(async () => {
      const search = container.querySelector<HTMLInputElement>('input[aria-label="搜索工作区文件"]')!
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))  // back to root (resets epoch)
    })
    await click(control(container, '工作区文件'))          // request B (resolves immediately)
    expect(control(container, '选择文件 AGENTS.md')).not.toBeNull()
    await act(async () => { resolveFirst?.(Response.json({ state: 'refused', code: 'file-candidates-unavailable', entries: [], truncated: false, path: '' })) })
    // The stale refusal must not replace the fresh success.
    expect(control(container, '选择文件 AGENTS.md')).not.toBeNull()
    expect(container.textContent).not.toContain('文件候选未接通')
  })

  it('resets the submenu on an outside close so reopening is fresh', async () => {
    const fetcher = candidates(READ_BODY)
    vi.stubGlobal('fetch', fetcher)
    const container = await mount(async () => snapshot())
    await click(control(container, '添加上下文'))
    await click(control(container, '工作区文件'))
    await type(container.querySelector<HTMLInputElement>('input[aria-label="搜索工作区文件"]')!, 'readme')
    const callsBefore = fetcher.mock.calls.filter(([url]) => url === '/.sage/workspace/files/candidates').length
    // Outside pointerdown closes everything.
    await act(async () => { document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) })
    expect(container.querySelector('[role="menu"]')).toBeNull()
    await click(control(container, '添加上下文'))
    // Fresh open: no stale submenu, no stale query, and a new read is issued.
    expect(container.querySelector('.context-files-menu')).toBeNull()
    await click(control(container, '工作区文件'))
    expect(container.querySelector<HTMLInputElement>('input[aria-label="搜索工作区文件"]')!.value).toBe('')
    expect(fetcher.mock.calls.filter(([url]) => url === '/.sage/workspace/files/candidates').length).toBe(callsBefore + 1)
  })

  it('shows the named not-wired note when the route refuses, with no fabricated rows', async () => {
    vi.stubGlobal('fetch', candidates({ state: 'refused', code: 'file-candidates-unavailable', entries: [], truncated: false, path: '' }))
    const container = await mount(async () => snapshot())
    await click(control(container, '添加上下文'))
    await click(control(container, '工作区文件'))
    expect(container.textContent).toContain('文件候选未接通（file-candidates-unavailable）')
    expect(container.querySelector('button[aria-label^="选择文件"]')).toBeNull()
  })

  it('keeps the legacy refusal when no workspace root is available', async () => {
    const fetcher = candidates(READ_BODY)
    vi.stubGlobal('fetch', fetcher)
    const container = await mount(async () => ({ kind: 'blocked', code: 'projection-read-unavailable' }))
    await click(control(container, '添加上下文'))
    const legacy = control(container, '工作区文件：不可用')
    await click(legacy)
    expect(container.textContent).toContain('工作区文件尚未接通')
    expect(fetcher.mock.calls.some(([url]) => url === '/.sage/workspace/files/candidates')).toBe(false)
  })
})
