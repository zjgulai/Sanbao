/** @vitest-environment jsdom */
/** ADR-0339: the wired models pane — compatible-provider recording, saving (config then
 *  credential, partial failure named), the configured list with bound test results, and the
 *  explicit connectivity test. Shell-mode behaviour (controller absent) stays pinned by the
 *  R17-B spec. */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { DesktopSettingsView } from '../../src/product/app/desktop/settings-view.js'
import {
  deriveRouteFromEndpoint,
  type ModelCatalogOutcome,
  type ModelProvidersOutcome,
  type ModelRoutesController,
  type ModelRoutesListRead,
  type ModelRouteSaveOutcome,
  type ModelRouteTestOutcome,
} from '../../src/product/app/desktop/model-routes.js'
import type { DevicePreferencesController } from '../../src/product/app/desktop/device-preferences.js'
import type { InstanceCredentialController } from '../../src/product/app/desktop/instance-credential.js'

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

const emptyRead: ModelRoutesListRead = { kind: 'read', routes: [], namespaceRevision: 1 }

function stubController(options: {
  readonly list?: ModelRoutesListRead | (() => Promise<ModelRoutesListRead>)
  readonly saveRoute?: () => Promise<ModelRouteSaveOutcome>
  readonly saveCredential?: () => Promise<ModelRouteSaveOutcome>
  readonly removeRoute?: () => Promise<ModelRouteSaveOutcome>
  readonly testConnection?: () => Promise<ModelRouteTestOutcome>
  readonly providers?: () => Promise<ModelProvidersOutcome>
  readonly catalog?: () => Promise<ModelCatalogOutcome>
} = {}) {
  const listMock = vi.fn(async () => typeof options.list === 'function' ? await options.list() : options.list ?? emptyRead)
  const saveRouteMock = vi.fn(options.saveRoute ?? (async () => ({ kind: 'saved' as const })))
  const saveCredentialMock = vi.fn(options.saveCredential ?? (async () => ({ kind: 'saved' as const })))
  const removeRouteMock = vi.fn(options.removeRoute ?? (async () => ({ kind: 'saved' as const })))
  const testConnectionMock = vi.fn(options.testConnection ?? (async () => ({ kind: 'refused' as const, code: 'unreachable' })))
  const providersMock = vi.fn(options.providers ?? (async (): Promise<ModelProvidersOutcome> => ({ kind: 'read' as const, providers: [] })))
  const catalogMock = vi.fn(options.catalog ?? (async (): Promise<ModelCatalogOutcome> => ({ kind: 'unavailable' as const, code: 'unreachable' })))
  const saveProviderModelsMock = vi.fn(async () => ({ kind: 'saved' as const }))
  const controller: ModelRoutesController = {
    list: listMock,
    saveRoute: saveRouteMock,
    saveCredential: saveCredentialMock,
    removeRoute: removeRouteMock,
    testConnection: testConnectionMock,
    providers: providersMock,
    catalog: catalogMock,
    saveProviderModels: saveProviderModelsMock,
    unsetCredential: vi.fn(async () => ({ kind: 'saved' as const })),
  }
  return { controller, listMock, saveRouteMock, saveCredentialMock, removeRouteMock, testConnectionMock, providersMock, catalogMock, saveProviderModelsMock }
}

async function mount(modelRoutes: ModelRoutesController, credential?: InstanceCredentialController) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(DesktopSettingsView, { controller: inertController, modelRoutes, ...(credential === undefined ? {} : { credential }) }))
  })
  cleanups.push(() => { act(() => { root.unmount() }); container.remove() })
  act(() => {
    const nav = Array.from(container.querySelectorAll('button')).find(item => item.textContent?.trim() === '模型')
    nav!.click()
  })
  await act(async () => {})
  return { container }
}

function button(scope: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll('button')).find(item =>
    (item.getAttribute('aria-label') ?? item.textContent?.trim()) === label)
  expect(found, `button: ${label}`).toBeDefined()
  return found!
}

function type(scope: HTMLElement, label: string, value: string): void {
  const input = scope.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function click(element: HTMLElement): void {
  act(() => { element.click() })
}

async function openCompatibleForm(container: HTMLElement): Promise<HTMLElement> {
  click(button(container, '添加模型'))
  const dialog = container.querySelector('[role="dialog"]') as HTMLElement
  click(button(dialog, '供应商'))
  const menu = dialog.querySelector('[role="listbox"], [role="menu"]') as HTMLElement
  const option = Array.from(menu.querySelectorAll('[role="option"]')).find(item => item.textContent?.includes('OpenAI Compatible'))!
  click(option as HTMLElement)
  return dialog
}

async function fillValidForm(dialog: HTMLElement): Promise<void> {
  type(dialog, '接口地址（Base URL）', 'https://api.example.com/v1')
  type(dialog, 'Model ID', 'qwen3.8-max')
  click(button(dialog, '添加 Model ID'))
  type(dialog, 'API Key', 'sk-model-routes-spec-0123456789')
}

describe('ADR-0339: the wired models pane', () => {
  it('lists saved routes with bound test states and credential presence', async () => {
    const { controller } = stubController({
      list: {
        kind: 'read',
        namespaceRevision: 7,
        routes: [
          {
            route: 'openai-api-example-com',
            api: 'openai-completions',
            baseURL: 'https://api.example.com/v1',
            apiKeyEnv: 'OPENAI_API_EXAMPLE_COM_API_KEY',
            modelCount: 2,
            credential: { name: 'OPENAI_API_EXAMPLE_COM_API_KEY', configured: true },
            test: { state: 'ok', latencyMs: 123, host: 'api.example.com', testedAt: '2026-10-13T10:00:00.000Z', current: true },
          },
          {
            route: 'anthropic-api-other-example',
            api: 'anthropic-messages',
            baseURL: 'https://api.other.example',
            modelCount: 1,
            credential: null,
            test: null,
          },
        ],
      },
    })
    const { container } = await mount(controller)
    const list = container.querySelector('[aria-label="已配置模型"]')!
    const rows = list.querySelectorAll('li')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.textContent).toContain('OpenAI Compatible · Chat Completions API')
    expect(rows[0]!.textContent).toContain('测试通过 · 123ms · api.example.com')
    expect(rows[1]!.textContent).toContain('Anthropic Compatible')
    expect(rows[1]!.textContent).toContain('已保存、未测试')
  })

  it('saves route then credential with the derived names, closes, and says 已保存、未测试', async () => {
    let listed: ModelRoutesListRead = emptyRead
    const stub = stubController({ list: () => Promise.resolve(listed) })
    const { container } = await mount(stub.controller)
    const dialog = await openCompatibleForm(container)
    const submit = button(dialog, '校验并添加模型')
    expect(submit.disabled).toBe(true)
    await fillValidForm(dialog)
    expect(button(dialog, '校验并添加模型').disabled).toBe(false)
    await act(async () => { button(dialog, '校验并添加模型').click() })
    expect(stub.saveRouteMock).toHaveBeenCalledWith({
      route: 'openai-api-example-com',
      profile: {
        api: 'openai-completions',
        baseURL: 'https://api.example.com/v1',
        apiKeyEnv: 'OPENAI_API_EXAMPLE_COM_API_KEY',
        models: [{ id: 'qwen3.8-max' }],
      },
    })
    expect(stub.saveCredentialMock).toHaveBeenCalledWith({ name: 'OPENAI_API_EXAMPLE_COM_API_KEY', value: 'sk-model-routes-spec-0123456789' })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).toContain('已保存、未测试：保存不触发供应商请求')
    expect(container.textContent).not.toContain('sk-model-routes-spec')
  })

  it('keeps the dialog and names the cause when the credential half fails — 部分失败不显示整项完成', async () => {
    const stub = stubController({ saveCredential: async () => ({ kind: 'refused', code: 'bridge-credential-value-refused' }) })
    const { container } = await mount(stub.controller)
    const dialog = await openCompatibleForm(container)
    await fillValidForm(dialog)
    await act(async () => { button(dialog, '校验并添加模型').click() })
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(dialog.textContent).toContain('配置已保存；')
    expect(dialog.textContent).toContain('凭据值不合法')
  })

  it('names a config conflict and never writes the credential on a failed save', async () => {
    const stub = stubController({ saveRoute: async () => ({ kind: 'refused', code: 'bridge-settings-conflict' }) })
    const { container } = await mount(stub.controller)
    const dialog = await openCompatibleForm(container)
    await fillValidForm(dialog)
    await act(async () => { button(dialog, '校验并添加模型').click() })
    expect(dialog.textContent).toContain('版本冲突')
    expect(stub.saveCredentialMock).not.toHaveBeenCalled()
  })

  it('tests one route explicitly and re-reads the bound result', async () => {
    let current: ModelRoutesListRead = {
      kind: 'read',
      namespaceRevision: 3,
      routes: [{
        route: 'r-one',
        api: 'openai-completions',
        baseURL: 'https://api.example.com/v1',
        modelCount: 1,
        modelIds: ['m1'],
        credential: { name: 'R_ONE_API_KEY', configured: true },
        test: null,
      }],
    }
    const stub = stubController({
      list: () => Promise.resolve(current),
      testConnection: async () => ({ kind: 'tested', test: { state: 'ok', latencyMs: 88, host: 'api.example.com', testedAt: '2026-10-13T10:00:00.000Z', current: true } }),
    })
    const { container } = await mount(stub.controller)
    expect(container.textContent).toContain('已保存、未测试')
    current = {
      kind: 'read',
      namespaceRevision: 3,
      routes: [{
        route: 'r-one',
        api: 'openai-completions',
        baseURL: 'https://api.example.com/v1',
        modelCount: 1,
        modelIds: ['m1'],
        credential: { name: 'R_ONE_API_KEY', configured: true },
        test: { state: 'ok', latencyMs: 88, host: 'api.example.com', testedAt: '2026-10-13T10:00:00.000Z', current: true },
      }],
    }
    click(button(container, 'r-one 更多操作'))
    await act(async () => { button(container, '测试连接 r-one').click() })
    expect(stub.testConnectionMock).toHaveBeenCalledWith('r-one')
    expect(container.textContent).toContain('测试通过 · 88ms · api.example.com')
  })

  it('removes a route through the list action', async () => {
    let current: ModelRoutesListRead = {
      kind: 'read',
      namespaceRevision: 3,
      routes: [{
        route: 'r-gone',
        api: 'openai-completions',
        baseURL: 'https://api.example.com/v1',
        modelCount: 1,
        modelIds: ['z1'],
        credential: null,
        test: null,
      }],
    }
    const stub = stubController({ list: () => Promise.resolve(current) })
    const { container } = await mount(stub.controller)
    current = { kind: 'read', routes: [], namespaceRevision: 4 }
    click(button(container, 'r-gone 更多操作'))
    await act(async () => { button(container, '删除 r-gone').click() })
    expect(stub.removeRouteMock).toHaveBeenCalledWith({ route: 'r-gone' })
    expect(container.textContent).toContain('暂无自定义模型')
  })

  it('A1: edits an existing route with prefilled fields and keeps the credential untouched when the key stays empty', async () => {
    const row = {
      route: 'r-edit',
      api: 'openai-completions',
      baseURL: 'https://api.edit.example/v1',
      apiKeyEnv: 'R_EDIT_API_KEY',
      modelCount: 1,
      modelIds: ['m-old'],
      credential: { name: 'R_EDIT_API_KEY', configured: true },
      test: null,
    }
    const stub = stubController({ list: { kind: 'read', namespaceRevision: 9, routes: [row] } })
    const { container } = await mount(stub.controller)
    click(button(container, 'r-edit 更多操作'))
    click(button(container, '编辑 r-edit'))
    const dialog = container.querySelector('[role="dialog"][aria-label="编辑模型"]') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.querySelector<HTMLInputElement>('input[aria-label="接口地址（Base URL）"]')!.value).toBe('https://api.edit.example/v1')
    expect(dialog.textContent).toContain('m-old')
    expect(dialog.textContent).toContain('留空则保留现有凭据')
    type(dialog, 'Model ID', 'm-new')
    click(button(dialog, '添加 Model ID'))
    await act(async () => { button(dialog, '保存修改').click() })
    expect(stub.saveRouteMock).toHaveBeenCalledWith({
      route: 'r-edit',
      profile: {
        api: 'openai-completions',
        baseURL: 'https://api.edit.example/v1',
        apiKeyEnv: 'R_EDIT_API_KEY',
        models: [{ id: 'm-old' }, { id: 'm-new' }],
      },
      expectedRevision: 9,
    })
    expect(stub.saveCredentialMock).not.toHaveBeenCalled()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).toContain('配置已保存；凭据未改动。')
  })

  it('A1: an edit with a typed key overwrites the credential once; a conflict keeps the dialog', async () => {
    const row = {
      route: 'r-key',
      api: 'anthropic-messages',
      baseURL: 'https://api.key.example',
      apiKeyEnv: 'R_KEY_API_KEY',
      modelCount: 1,
      modelIds: ['k1'],
      credential: { name: 'R_KEY_API_KEY', configured: true },
      test: null,
    }
    const stub = stubController({ list: { kind: 'read', namespaceRevision: 4, routes: [row] } })
    const { container } = await mount(stub.controller)
    click(button(container, 'r-key 更多操作'))
    click(button(container, '编辑 r-key'))
    const dialog = container.querySelector('[role="dialog"][aria-label="编辑模型"]') as HTMLElement
    type(dialog, 'API Key', 'sk-edit-overwrite-0123456789')
    await act(async () => { button(dialog, '保存修改').click() })
    expect(stub.saveCredentialMock).toHaveBeenCalledWith({ name: 'R_KEY_API_KEY', value: 'sk-edit-overwrite-0123456789' })
    expect(container.textContent).toContain('配置与凭据已保存。')

    const conflicting = stubController({
      list: { kind: 'read', namespaceRevision: 4, routes: [row] },
      saveRoute: async () => ({ kind: 'refused', code: 'bridge-settings-conflict' }),
    })
    const second = await mount(conflicting.controller)
    click(button(second.container, 'r-key 更多操作'))
    click(button(second.container, '编辑 r-key'))
    const conflictDialog = second.container.querySelector('[role="dialog"]') as HTMLElement
    await act(async () => { button(conflictDialog, '保存修改').click() })
    expect(second.container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(conflictDialog.textContent).toContain('版本冲突')
    expect(conflicting.saveCredentialMock).not.toHaveBeenCalled()
  })

  it('A1: clears a configured route credential from the row menu and names the source guard', async () => {
    const row = {
      route: 'r-clear',
      api: 'openai-completions',
      baseURL: 'https://api.clear.example/v1',
      apiKeyEnv: 'R_CLEAR_API_KEY',
      modelCount: 1,
      modelIds: ['c1'],
      credential: { name: 'R_CLEAR_API_KEY', configured: true },
      test: null,
    }
    let current = { kind: 'read' as const, namespaceRevision: 2, routes: [row] }
    const unsetMock = vi.fn(async () => ({ kind: 'saved' as const }))
    const base = stubController({ list: () => Promise.resolve(current) })
    const controller = { ...base.controller, unsetCredential: unsetMock }
    const { container } = await mount(controller)
    current = { kind: 'read', namespaceRevision: 3, routes: [{ ...row, credential: { name: 'R_CLEAR_API_KEY', configured: false } }] }
    click(button(container, 'r-clear 更多操作'))
    await act(async () => { button(container, '清除凭据 r-clear').click() })
    expect(unsetMock).toHaveBeenCalledWith({ name: 'R_CLEAR_API_KEY' })
    expect(container.textContent).toContain('已清除凭据（R_CLEAR_API_KEY）。')
    expect(container.textContent).toContain('凭据未设置')
  })

  it('ADR-0343: the provider menu lists the installed catalog and saves a key-only route', async () => {
    const stub = stubController({
      providers: async () => ({ kind: 'read', providers: [
        { provider: 'deepseek', displayName: 'deepseek', declared: false },
        { provider: 'custom-x', displayName: 'custom-x', declared: true },
      ] }),
    })
    const { container } = await mount(stub.controller)
    click(button(container, '添加模型'))
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    click(button(dialog, '供应商'))
    await act(async () => {})
    const menu = dialog.querySelector('[role="listbox"], [role="menu"]') as HTMLElement
    const group = menu.querySelector('[role="group"][aria-label="本机内置目录"]') as HTMLElement
    expect(group).not.toBeNull()
    expect(group.textContent).toContain('deepseek')
    // Hand-declared routes are not key-only offers.
    expect(group.textContent).not.toContain('custom-x')
    click(Array.from(group.querySelectorAll('[role="option"]')).find(item => item.textContent?.includes('deepseek')) as HTMLElement)
    // The key-only form asks for no endpoint and no model ids.
    expect(dialog.querySelector('input[aria-label="接口地址（Base URL）"]')).toBeNull()
    expect(dialog.querySelector('input[aria-label="Model ID"]')).toBeNull()
    type(dialog, 'API Key', 'sk-catalog-spec-0123456789')
    await act(async () => { button(dialog, '保存').click() })
    expect(stub.saveRouteMock).toHaveBeenCalledWith({ route: 'deepseek', profile: { apiKeyEnv: 'DEEPSEEK_API_KEY' } })
    expect(stub.saveCredentialMock).toHaveBeenCalledWith({ name: 'DEEPSEEK_API_KEY', value: 'sk-catalog-spec-0123456789' })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).toContain('已保存、未测试')
  })

  it('ADR-0343: a catalog row renders the directory identity and the builtin verdict label', async () => {
    const { controller } = stubController({ list: { kind: 'read', namespaceRevision: 3, routes: [{
      route: 'deepseek',
      api: null,
      baseURL: null,
      catalog: true,
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      modelCount: 2,
      modelIds: ['deepseek-flash', 'deepseek-pro'],
      credential: { name: 'DEEPSEEK_API_KEY', configured: true },
      test: { state: 'builtin', modelIds: ['deepseek-flash', 'deepseek-pro'], testedAt: '2026-10-13T10:00:00.000Z', current: true },
    }] } })
    const { container } = await mount(controller)
    const row = container.querySelector('[data-model-route="deepseek"]') as HTMLElement
    expect(row.textContent).toContain('内置目录 · 端点与模型来自已安装目录')
    expect(row.textContent).toContain('模型 2 个')
    expect(row.textContent).toContain('内置目录（2 个模型） · 未做网络探测')
  })

  it('ADR-0343: editing a catalog row keeps the key-only shape and the untouched credential', async () => {
    const row = {
      route: 'deepseek',
      api: null,
      baseURL: null,
      catalog: true,
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      modelCount: 0,
      modelIds: [],
      credential: { name: 'DEEPSEEK_API_KEY', configured: true },
      test: null,
    }
    const stub = stubController({ list: { kind: 'read', namespaceRevision: 9, routes: [row] } })
    const { container } = await mount(stub.controller)
    click(button(container, 'deepseek 更多操作'))
    click(button(container, '编辑 deepseek'))
    const dialog = container.querySelector('[role="dialog"][aria-label="编辑模型"]') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.querySelector('input[aria-label="接口地址（Base URL）"]')).toBeNull()
    expect(dialog.textContent).toContain('留空则保留现有凭据')
    await act(async () => { button(dialog, '保存修改').click() })
    expect(stub.saveRouteMock).toHaveBeenCalledWith({ route: 'deepseek', profile: { apiKeyEnv: 'DEEPSEEK_API_KEY' }, expectedRevision: 9 })
    expect(stub.saveCredentialMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('配置已保存；凭据未改动。')
  })

  it('ADR-0343: without a directory read the menu keeps the observed groups only', async () => {
    const stub = stubController({ providers: async () => ({ kind: 'unavailable', code: 'bridge-provider-unavailable' }) })
    const { container } = await mount(stub.controller)
    click(button(container, '添加模型'))
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    click(button(dialog, '供应商'))
    const menu = dialog.querySelector('[role="listbox"], [role="menu"]') as HTMLElement
    expect(menu.querySelector('[role="group"][aria-label="本机内置目录"]')).toBeNull()
    expect(menu.textContent).toContain('OpenAI Compatible')
  })

  const deepseekCatalog = async (): Promise<ModelCatalogOutcome> => ({ kind: 'read', catalog: {
    default: null,
    failures: [],
    groups: [{ id: 'deepseek-official', name: 'DeepSeek', models: [
      { id: 'deepseek-flash', name: 'DeepSeek-V41-Flash' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
    ] }],
  } })

  async function openDeepseekForm(container: HTMLElement): Promise<HTMLElement> {
    click(button(container, '添加模型'))
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    click(button(dialog, '供应商'))
    const menu = dialog.querySelector('[role="listbox"][aria-label="供应商"]') as HTMLElement
    click(button(menu, 'DeepSeek'))
    return container.querySelector('[role="dialog"]') as HTMLElement
  }

  it('ADR-0344: the DeepSeek card reads the live checklist and saves models + credential', async () => {
    const stub = stubController({ catalog: deepseekCatalog })
    const { container } = await mount(stub.controller)
    const form = await openDeepseekForm(container)
    expect(form.querySelector('[aria-label="类型"]')!.textContent).toContain('按量付费')
    // Submit is disabled before any model is checked.
    expect(button(form, '校验并添加模型').disabled).toBe(true)
    click(form.querySelector<HTMLButtonElement>('[aria-label="选择模型"]')!)
    await act(async () => {})
    const modelsMenu = form.querySelector('[role="menu"][aria-label="选择模型"]')!
    const boxes = Array.from(modelsMenu.querySelectorAll('[role="menuitemcheckbox"]'))
    expect(boxes).toHaveLength(3)
    // 预填 = 当前生效模型（全选已勾）。
    expect(boxes[0]!.getAttribute('aria-checked')).toBe('true')
    expect(modelsMenu.textContent).toContain('DeepSeek-V41-Flash')
    // 取消勾选 DeepSeek-V4-Pro，只留 flash。
    click(boxes[2] as HTMLElement)
    type(form, 'API Key', 'sk-deepseek-spec-0123456789')
    await act(async () => { button(form, '校验并添加模型').click() })
    expect(stub.saveProviderModelsMock).toHaveBeenCalledWith({ provider: 'deepseek-official', modelIds: ['deepseek-flash'] })
    expect(stub.saveCredentialMock).toHaveBeenCalledWith({ name: 'DEEPSEEK_API_KEY', value: 'sk-deepseek-spec-0123456789' })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).toContain('模型范围已保存（1 个模型）')
    expect(container.textContent).not.toContain('sk-deepseek-spec')
  })

  it('ADR-0344: an already-configured credential lets the DeepSeek save proceed without a typed key', async () => {
    const stub = stubController({ catalog: deepseekCatalog })
    const credential: InstanceCredentialController = {
      read: vi.fn(async () => ({ kind: 'read' as const, configured: true, source: 'file', writable: true })),
      save: vi.fn(async () => ({ outcome: 'saved' as const, read: { kind: 'read' as const, configured: true, source: 'file', writable: true } })),
    }
    const { container } = await mount(stub.controller, credential)
    const form = await openDeepseekForm(container)
    await act(async () => {})
    expect(form.textContent).toContain('留空则保留现有凭据')
    click(form.querySelector<HTMLButtonElement>('[aria-label="选择模型"]')!)
    await act(async () => {})
    await act(async () => { button(form, '校验并添加模型').click() })
    expect(stub.saveProviderModelsMock).toHaveBeenCalledWith({ provider: 'deepseek-official', modelIds: ['deepseek-flash', 'deepseek-v4-pro'] })
    expect(stub.saveCredentialMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('模型范围已保存（2 个模型）')
  })

  it('ADR-0344: the DeepSeek submit stays disabled with an unreadable directory or zero checked models', async () => {
    const degraded = stubController({ catalog: async () => ({ kind: 'unavailable', code: 'bridge-provider-unavailable' }) })
    const first = await mount(degraded.controller)
    const form = await openDeepseekForm(first.container)
    click(form.querySelector<HTMLButtonElement>('[aria-label="选择模型"]')!)
    await act(async () => {})
    const menu = form.querySelector('[role="menu"][aria-label="选择模型"]') as HTMLElement
    expect(menu.textContent).toContain('模型目录读取失败')
    type(form, 'API Key', 'sk-deepseek-spec-0123456789')
    expect(button(form, '校验并添加模型').disabled).toBe(true)

    const stub = stubController({ catalog: deepseekCatalog })
    const second = await mount(stub.controller)
    const form2 = await openDeepseekForm(second.container)
    click(form2.querySelector<HTMLButtonElement>('[aria-label="选择模型"]')!)
    await act(async () => {})
    const menu2 = form2.querySelector('[role="menu"][aria-label="选择模型"]') as HTMLElement
    click(Array.from(menu2.querySelectorAll('[role="menuitemcheckbox"]'))[0] as HTMLElement)
    type(form2, 'API Key', 'sk-deepseek-spec-0123456789')
    expect(button(form2, '校验并添加模型').disabled).toBe(true)
  })

  it('ADR-0345: the observed OpenRouter entry enters the key-only catalog form and saves', async () => {
    const stub = stubController()
    const { container } = await mount(stub.controller)
    click(button(container, '添加模型'))
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    click(button(dialog, '供应商'))
    const menu = dialog.querySelector('[role="listbox"][aria-label="供应商"]') as HTMLElement
    click(button(menu, 'OpenRouter'))
    const form = container.querySelector('[role="dialog"]') as HTMLElement
    // Key-only shape: the observed label shows, no endpoint field exists.
    expect(form.querySelector('[aria-label="供应商"]')!.textContent).toContain('OpenRouter')
    expect(form.querySelector('input[aria-label="接口地址（Base URL）"]')).toBeNull()
    type(form, 'API Key', 'sk-openrouter-spec-0123456789')
    await act(async () => { button(form, '保存').click() })
    expect(stub.saveRouteMock).toHaveBeenCalledWith({ route: 'openrouter', profile: { apiKeyEnv: 'OPENROUTER_API_KEY' } })
    expect(stub.saveCredentialMock).toHaveBeenCalledWith({ name: 'OPENROUTER_API_KEY', value: 'sk-openrouter-spec-0123456789' })
    expect(container.textContent).toContain('已保存、未测试')
  })

  it('ADR-0345: Google maps to the google route; unmapped observed entries stay inert', async () => {
    const stub = stubController()
    const { container } = await mount(stub.controller)
    click(button(container, '添加模型'))
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    click(button(dialog, '供应商'))
    const menu = dialog.querySelector('[role="listbox"][aria-label="供应商"]') as HTMLElement
    // Kimi's catalog mapping is ambiguous — clicking it must not change the form.
    const before = container.querySelector('[role="dialog"]')!.textContent
    click(button(menu, 'Kimi'))
    expect(container.querySelector('[role="dialog"]')!.textContent).toBe(before)
    // Google enters the key-only form with the google route.
    click(button(menu, 'Google'))
    const form = container.querySelector('[role="dialog"]') as HTMLElement
    expect(form.querySelector('[aria-label="供应商"]')!.textContent).toContain('Google')
    type(form, 'API Key', 'sk-google-spec-0123456789')
    await act(async () => { button(form, '保存').click() })
    expect(stub.saveRouteMock).toHaveBeenCalledWith({ route: 'google', profile: { apiKeyEnv: 'GOOGLE_API_KEY' } })
  })

  it('counts typed drafts as dirty: cancel asks for confirmation and 放弃更改 clears them', async () => {
    const stub = stubController()
    const { container } = await mount(stub.controller)
    const dialog = await openCompatibleForm(container)
    type(dialog, 'Model ID', 'm1')
    click(button(dialog, '取消'))
    const confirm = container.querySelector('[role="dialog"][aria-label="放弃未保存的模型配置？"]') as HTMLElement
    expect(confirm).not.toBeNull()
    click(button(confirm, '继续编辑'))
    const reopened = container.querySelector('[role="dialog"][aria-label="添加模型"]') as HTMLElement
    expect(reopened.querySelector<HTMLInputElement>('input[aria-label="Model ID"]')!.value).toBe('m1')
    click(button(reopened, '取消'))
    click(button(container.querySelector('[role="dialog"]') as HTMLElement, '放弃更改'))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})

describe('ADR-0339: route derivation', () => {
  it('derives a deterministic route and credential ref from the endpoint host', () => {
    expect(deriveRouteFromEndpoint('openai-completions', 'https://api.deepseek.com/v1'))
      .toEqual({ route: 'openai-api-deepseek-com', apiKeyEnv: 'OPENAI_API_DEEPSEEK_COM_API_KEY' })
    expect(deriveRouteFromEndpoint('anthropic-messages', 'https://api.deepseek.com/anthropic'))
      .toEqual({ route: 'anthropic-api-deepseek-com', apiKeyEnv: 'ANTHROPIC_API_DEEPSEEK_COM_API_KEY' })
    expect(deriveRouteFromEndpoint('openai-responses', 'https://Api.Example.COM:8443/v1'))
      .toEqual({ route: 'openai-api-example-com-8443', apiKeyEnv: 'OPENAI_API_EXAMPLE_COM_8443_API_KEY' })
    expect(deriveRouteFromEndpoint('openai-completions', 'not a url')).toBeUndefined()
  })
})
