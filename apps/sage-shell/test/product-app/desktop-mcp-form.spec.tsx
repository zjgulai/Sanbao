/** @vitest-environment jsdom */
/** ADR-0306: the add-custom-MCP form (O08) — every observed form-shape state is asserted here;
 *  the submission paths answer the honest T10 refusal and never persist. */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExtensionsPage } from '../../src/product/app/desktop/page.js'
import { McpForm } from '../../src/product/app/desktop/mcp-form.js'

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
const cleanups: Array<() => void> = []
afterEach(() => { cleanups.splice(0).reverse().forEach((dispose) => dispose()); vi.unstubAllGlobals() })

async function mount(node: React.ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => { root.render(node) })
  cleanups.push(() => { act(() => root.unmount()); container.remove() })
  return container
}
const control = (container: HTMLElement, label: string): HTMLButtonElement => {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(button, `control ${label}`).not.toBeNull()
  return button!
}
const click = async (node: HTMLElement) => { await act(async () => { node.click() }) }
const type = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value)
  await act(async () => { input.dispatchEvent(new Event(input instanceof HTMLTextAreaElement ? 'input' : 'input', { bubbles: true })) })
}
const selectValue = async (select: HTMLSelectElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value)
  await act(async () => { select.dispatchEvent(new Event('change', { bubbles: true })) })
}

describe('the add-custom-MCP form (ADR-0306)', () => {
  it('shows the empty form with the observed controls (O08.mcp.form.empty / transport.open)', async () => {
    const onClose = vi.fn()
    const container = await mount(createElement(McpForm, { onClose }))
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('表单')
    const name = container.querySelector<HTMLInputElement>('input[aria-label="名称"]')!
    expect(name.value).toBe('')
    expect(name.placeholder).toBe('例如 github-search')
    const transport = container.querySelector<HTMLSelectElement>('select[aria-label="传输类型"]')!
    expect(transport.value).toBe('')
    expect([...transport.options].map((option) => option.textContent)).toEqual(['传输类型', 'STDIO', 'HTTP', 'SSE'])
    expect(control(container, '取消')).not.toBeNull()
    expect(control(container, '添加 MCP')).not.toBeNull()
    expect(control(container, '关闭')).not.toBeNull()
  })

  it('switches the HTTP and SSE field sets (O08.mcp.form.http / form.sse / http.header-row)', async () => {
    const container = await mount(createElement(McpForm, { onClose: vi.fn() }))
    const transport = container.querySelector<HTMLSelectElement>('select[aria-label="传输类型"]')!
    await selectValue(transport, 'http')
    const url = container.querySelector<HTMLInputElement>('input[aria-label="服务地址"]')!
    expect(url.placeholder).toBe('https://example.com/mcp')
    expect(container.textContent).toContain('不要在 URL 中放入 token 或密码')
    const addHeader = control(container, '添加 Header')
    await click(addHeader)
    expect(container.querySelector('input[aria-label="Header 1 名称"]')).not.toBeNull()
    expect(container.querySelector('input[aria-label="Header 1 值"]')).not.toBeNull()
    expect(control(container, '移除 Header 1')).not.toBeNull()
    expect(document.activeElement).toBe(addHeader)

    await selectValue(transport, 'sse')
    expect(container.querySelector<HTMLInputElement>('input[aria-label="服务地址"]')?.placeholder).toBe('https://example.com/mcp')
    expect(container.querySelector('button[aria-label="添加 Header"]')).toBeNull()
  })

  it('shows the STDIO field set with argument and environment rows (O08.mcp.form.stdio / stdio.*)', async () => {
    const container = await mount(createElement(McpForm, { onClose: vi.fn() }))
    const transport = container.querySelector<HTMLSelectElement>('select[aria-label="传输类型"]')!
    await selectValue(transport, 'stdio')
    expect(container.querySelector<HTMLInputElement>('input[aria-label="命令"]')?.placeholder).toBe('例如 npx 或 python')
    expect(container.querySelector<HTMLInputElement>('input[aria-label="工作目录"]')?.placeholder).toBe('/absolute/path')
    expect(container.textContent).toContain('只接受绝对路径')

    const addArgument = control(container, '添加参数')
    await click(addArgument)
    const argument = container.querySelector<HTMLInputElement>('input[aria-label="参数 1"]')!
    expect(argument.placeholder).toBe('输入一个参数')
    expect(control(container, '移除参数 1')).not.toBeNull()
    expect(document.activeElement).toBe(addArgument)

    const addEnvironment = control(container, '添加变量')
    await click(addEnvironment)
    expect(container.querySelector('input[aria-label="环境变量 1 名称"]')).not.toBeNull()
    expect(container.querySelector('input[aria-label="环境变量 1 值"]')).not.toBeNull()
    expect(control(container, '移除环境变量 1')).not.toBeNull()
    expect(document.activeElement).toBe(addEnvironment)
  })

  it('shows the JSON example and the serverName preview (O08.mcp.json.default / name.preview)', async () => {
    const container = await mount(createElement(McpForm, { onClose: vi.fn() }))
    await type(container.querySelector<HTMLInputElement>('input[aria-label="名称"]')!, 'sanbao-fixture')
    expect(container.querySelector('.mcp-name-preview')?.textContent).toBe('Agent 将看到 serverName：sanbao_fixture')

    await click(control(container, 'JSON'))
    const json = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="MCP JSON"]')!
    expect(json.value).toContain('"mcpServers"')
    expect(json.value).toContain('"type": "streamable-http"')
    expect(json.value).toContain('"url": "https://example.com/mcp"')
    expect(control(container, '预览导入')).not.toBeNull()
    expect(container.querySelector('button[aria-label="添加 MCP"]')).toBeNull()
  })

  it('confirms before discarding an unsaved draft and never saves (O08.mcp.discard.open)', async () => {
    const onClose = vi.fn()
    const container = await mount(createElement(McpForm, { onClose }))
    await type(container.querySelector<HTMLInputElement>('input[aria-label="名称"]')!, 'sanbao-fixture')
    await click(control(container, '取消'))
    const dialog = container.querySelector('[role="alertdialog"]')!
    expect(dialog.textContent).toContain('放弃未保存的修改？')
    expect(dialog.textContent).toContain('不会保留')
    const keep = control(container, '继续编辑')
    expect(document.activeElement).toBe(keep)
    await click(keep)
    expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()

    await click(control(container, '取消'))
    await click(control(container, '放弃修改'))
    expect(onClose).toHaveBeenCalledTimes(1)

    // Nothing unsaved: cancel closes directly, no confirmation.
    const clean = await mount(createElement(McpForm, { onClose: vi.fn() }))
    await click(control(clean, '取消'))
    expect(clean.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('answers the honest T10 refusal from 添加 MCP and 预览导入, persisting nothing', async () => {
    const container = await mount(createElement(McpForm, { onClose: vi.fn() }))
    await click(control(container, '添加 MCP'))
    expect(container.querySelector('.mcp-notice')?.textContent).toContain('尚未接通')
    expect(container.querySelector('.mcp-notice')?.textContent).toContain('不会保存')
    await click(control(container, 'JSON'))
    await click(control(container, '预览导入'))
    expect(container.querySelector('.mcp-notice')?.textContent).toContain('不会保存或导入')
  })

  it('opens the form from the extension-management connector section', async () => {
    const container = await mount(createElement(ExtensionsPage))
    expect(container.querySelector('.extensions-page')).not.toBeNull()
    expect(container.querySelector('h1')?.textContent).toBe('扩展管理')
    // The ADR-0306 entry lives inside the connector tab (Loop-Q R11 four-tab structure).
    await click(control(container, '连接器'))
    expect(container.querySelector('[role="tab"][aria-label="连接器"]')?.getAttribute('aria-selected')).toBe('true')
    await click(control(container, '添加 MCP'))
    expect(container.querySelector('[aria-label="添加自定义 MCP"]')).not.toBeNull()
    // Discard the untouched draft closes without confirmation.
    await click(control(container, '取消'))
    expect(container.querySelector('[aria-label="添加自定义 MCP"]')).toBeNull()
  })
})
