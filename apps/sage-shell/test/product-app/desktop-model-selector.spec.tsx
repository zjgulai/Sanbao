/** @vitest-environment jsdom */
/** ADR-0340: the composer model selector over the live catalog — documented honestly against a
 *  static-only Qoder observation: groups, current marker, failures strip, named refusals, and
 *  the explicit note about what switching does (and does not) change. */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ModelSelector } from '../../src/product/app/desktop/model-selector.js'
import {
  type ModelCatalogOutcome,
  type ModelDefaultOutcome,
  type ModelRoutesController,
} from '../../src/product/app/desktop/model-routes.js'

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

const readCatalog: ModelCatalogOutcome = {
  kind: 'read',
  catalog: {
    default: { provider: 'deepseek-official', model: 'deepseek-flash' },
    groups: [
      { id: 'deepseek-official', name: 'DeepSeek', models: [{ id: 'deepseek-flash', name: 'Flash' }, { id: 'deepseek-v4-pro' }] },
      { id: 'openai-api-deepseek-com', name: 'Custom DeepSeek', models: [{ id: 'deepseek-chat', name: 'Chat via gateway' }] },
    ],
    failures: [{ id: 'broken-gateway', name: 'Broken Gateway', message: 'connection refused' }],
  },
}

function stubController(options: {
  readonly catalog?: ModelCatalogOutcome | (() => Promise<ModelCatalogOutcome>)
  readonly setDefault?: () => Promise<ModelDefaultOutcome>
} = {}) {
  const catalogMock = vi.fn(async () => typeof options.catalog === 'function' ? await options.catalog() : options.catalog ?? readCatalog)
  const setDefaultMock = vi.fn(options.setDefault ?? (async (request: { readonly provider: string, readonly model: string }) => ({
    kind: 'set' as const,
    selection: { provider: request.provider, model: request.model },
  })))
  const controller = {
    list: async () => ({ kind: 'read' as const, routes: [], namespaceRevision: null }),
    saveRoute: async () => ({ kind: 'saved' as const }),
    removeRoute: async () => ({ kind: 'saved' as const }),
    saveCredential: async () => ({ kind: 'saved' as const }),
    testConnection: async () => ({ kind: 'refused' as const, code: 'unreachable' }),
    catalog: catalogMock,
    setDefault: setDefaultMock,
  } satisfies ModelRoutesController
  return { controller, catalogMock, setDefaultMock }
}

async function mount(controller?: ModelRoutesController) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(ModelSelector, controller === undefined ? {} : { controller })) })
  cleanups.push(() => { act(() => { root.unmount() }); container.remove() })
  await act(async () => {})
  return { container }
}

function trigger(container: HTMLElement): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>('button[aria-label="模型"]')!
}

function click(element: HTMLElement): void {
  act(() => { element.click() })
}

/** Open the menu and flush the lazy catalog read (its promise settles on a microtask). */
async function openMenu(container: HTMLElement): Promise<void> {
  click(trigger(container))
  await act(async () => {})
}

describe('ADR-0340: the composer model selector', () => {
  it('renders nothing without a controller (display-only consumers keep the composer unchanged)', async () => {
    const { container } = await mount()
    expect(container.querySelector('[data-model-selector="composer"]')).toBeNull()
  })

  it('shows the current model by display name and opens the grouped catalog', async () => {
    const { controller } = stubController()
    const { container } = await mount(controller)
    // Lazy: the label is the neutral trigger until the menu is opened once.
    expect(trigger(container).textContent).toContain('模型')
    await openMenu(container)
    expect(trigger(container).textContent).toContain('Flash')
    const menu = container.querySelector('[role="menu"][aria-label="选择模型"]')!
    const groups = menu.querySelectorAll('[role="group"]')
    expect(groups).toHaveLength(2)
    expect(groups[0]!.getAttribute('aria-label')).toBe('DeepSeek')
    const current = menu.querySelector('[role="menuitemradio"][aria-checked="true"]')!
    expect(current.textContent).toContain('Flash')
    expect(menu.textContent).toContain('Broken Gateway：connection refused')
    expect(menu.textContent).toContain('已有回合的会话保持其首次使用的模型')
  })

  it('switches the default with the exact selection and reapplies the new name', async () => {
    let current = readCatalog
    const { controller, setDefaultMock } = stubController({
      catalog: () => Promise.resolve(current),
    })
    const { container } = await mount(controller)
    await openMenu(container)
    const target = Array.from(container.querySelectorAll('[role="menuitemradio"]'))
      .find(item => item.textContent?.includes('Chat via gateway'))!
    current = {
      kind: 'read',
      catalog: { ...readCatalog.catalog, default: { provider: 'openai-api-deepseek-com', model: 'deepseek-chat' } },
    }
    await act(async () => { (target as HTMLElement).click() })
    expect(setDefaultMock).toHaveBeenCalledWith({ provider: 'openai-api-deepseek-com', model: 'deepseek-chat' })
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(trigger(container).textContent).toContain('Chat via gateway')
    expect(container.textContent).toContain('默认模型已切换为 deepseek-chat；对下一次请求生效。')
  })

  it('names a refused switch and keeps the menu open', async () => {
    const { controller, setDefaultMock } = stubController({
      setDefault: async () => ({ kind: 'refused', code: 'bridge-model-selection-unknown' }),
    })
    const { container } = await mount(controller)
    await openMenu(container)
    const target = container.querySelectorAll('[role="menuitemradio"]')[2] as HTMLElement
    await act(async () => { target.click() })
    expect(setDefaultMock).toHaveBeenCalledTimes(1)
    const menu = container.querySelector('[role="menu"]')!
    expect(menu.textContent).toContain('该模型不在可用目录中，未切换。')
  })

  it('shows 模型未知 and a named cause when the catalog is unavailable', async () => {
    const { controller } = stubController({ catalog: { kind: 'unavailable', code: 'bridge-provider-unavailable' } })
    const { container } = await mount(controller)
    await openMenu(container)
    expect(container.querySelector('[role="menu"]')!.textContent).toContain('模型目录暂不可用（bridge-provider-unavailable）')
    click(container.querySelector('.model-selector-backdrop') as HTMLElement)
    expect(trigger(container).textContent).toContain('模型未知')
  })

  it('closes on Escape and on the backdrop', async () => {
    const { controller } = stubController()
    const { container } = await mount(controller)
    click(trigger(container))
    act(() => {
      container.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('[role="menu"]')).toBeNull()
    click(trigger(container))
    click(container.querySelector('.model-selector-backdrop') as HTMLElement)
    expect(container.querySelector('[role="menu"]')).toBeNull()
  })
})
