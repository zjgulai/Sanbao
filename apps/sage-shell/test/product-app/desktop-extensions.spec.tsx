/** @vitest-environment jsdom */
/** Loop-Q R11 line A: the extension-management page rebuild and the market shell (QDR.P04.
 *  installed.* / market.*). No extension-store or market provider exists, so the data areas show
 *  the named not-wired reasons and never the observed empty-list wording — "no provider" is not
 *  "empty list". The add menus and the ADR-0306 add-MCP entry stay structure-only and fail-closed. */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExtensionsPage } from '../../src/product/app/desktop/page.js'

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
const tab = (container: HTMLElement, label: string): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>(`[role="tablist"][aria-label="扩展类型"] [role="tab"][aria-label="${label}"]`)
  expect(found, `tab ${label}`).not.toBeNull()
  return found!
}
const statusNote = (container: HTMLElement, scope: HTMLElement = container): HTMLElement => {
  const found = scope.querySelector<HTMLElement>('[role="status"]')
  expect(found, 'status note').not.toBeNull()
  return found!
}
// The sort pair is scoped by its own tool row (the observed product gives 热门/最新 no labels).
const sortPair = (container: HTMLElement): HTMLElement => {
  const found = container.querySelector<HTMLElement>('[aria-label="市场排序"]')
  expect(found, 'sort pair').not.toBeNull()
  return found!
}

describe('the extension-management page and market shell (Loop-Q R11 line A)', () => {
  it('shows the four installed tabs with dash counts, the tool row and the named not-wired data area on every tab, never empty-list wording (installed.plugins/skills/connectors/agents.empty)', async () => {
    const container = await mount(createElement(ExtensionsPage))
    expect(container.querySelector('h1')?.textContent).toBe('扩展管理')
    expect(container.textContent).toContain('管理本机已安装的插件、技能、连接器和智能体。')
    // Tool row: market entry, local refresh, installed search.
    expect(control(container, '市场')).not.toBeNull()
    expect(control(container, '刷新已安装项')).not.toBeNull()
    const search = container.querySelector<HTMLInputElement>('input[aria-label="搜索已安装项"]')!
    expect(search.placeholder).toBe('搜索已安装项')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'sanbao-fixture')
    await act(async () => { search.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(search.value).toBe('sanbao-fixture')
    // Four tabs, 插件 selected, every count shows "—" (never 0).
    const tablist = container.querySelector('[role="tablist"][aria-label="扩展类型"]')!
    expect(tablist.querySelectorAll('[role="tab"]')).toHaveLength(4)
    for (const label of ['插件', '技能', '连接器', '智能体']) {
      expect(tab(container, label).textContent).toContain('—')
      expect(tab(container, label).textContent).not.toContain('0')
    }
    expect(tab(container, '插件').getAttribute('aria-selected')).toBe('true')
    expect(statusNote(container).textContent).toBe('扩展服务未接通（extensions-store-unavailable）')
    // Each tab keeps the same named not-wired area; counts never become numbers.
    for (const label of ['技能', '连接器', '智能体']) {
      await click(tab(container, label))
      expect(tab(container, label).getAttribute('aria-selected')).toBe('true')
      expect(statusNote(container).textContent).toBe('扩展服务未接通（extensions-store-unavailable）')
      expect(tab(container, '插件').textContent).toContain('—')
    }
    // "No provider" is never rendered as the observed store-empty wording.
    expect(container.textContent).not.toContain('暂无已安装')
    expect(container.textContent).not.toContain('从市场安装或本地上传的扩展会显示在这里')
  })

  it('keeps 智能体 without any add entry and keeps the ADR-0306 添加 MCP inside the connector tab', async () => {
    const container = await mount(createElement(ExtensionsPage))
    // 插件/技能 carry their add triggers; 连接器 carries the ADR-0306 one.
    expect(control(container, '添加插件')).not.toBeNull()
    await click(tab(container, '技能'))
    expect(control(container, '添加技能')).not.toBeNull()
    await click(tab(container, '智能体'))
    for (const label of ['添加插件', '添加技能', '添加 MCP']) {
      expect(container.querySelector(`button[aria-label="${label}"]`)).toBeNull()
    }
    expect(statusNote(container).textContent).toBe('扩展服务未接通（extensions-store-unavailable）')
    await click(tab(container, '连接器'))
    expect(control(container, '添加 MCP')).not.toBeNull()
    await click(control(container, '添加 MCP'))
    expect(container.querySelector('[aria-label="添加自定义 MCP"]')).not.toBeNull()
    await click(control(container, '取消'))
    expect(container.querySelector('[aria-label="添加自定义 MCP"]')).toBeNull()
    expect(statusNote(container).textContent).toBe('扩展服务未接通（extensions-store-unavailable）')
  })

  it('opens the plugin add menu with the two observed entries and answers the named refusal (installed.plugins.add.open)', async () => {
    const container = await mount(createElement(ExtensionsPage))
    await click(control(container, '添加插件'))
    const menu = container.querySelector('[role="menu"][aria-label="插件添加菜单"]') as HTMLElement
    expect(menu).not.toBeNull()
    const items = menu.querySelectorAll('[role="menuitem"]')
    expect(items).toHaveLength(2)
    expect(items[0]!.textContent).toContain('通过 Qoder 创建')
    expect(items[0]!.textContent).toContain('在新任务中创建个性化 Plugin，并保存在本地使用。')
    expect(items[1]!.textContent).toContain('上传 Plugin')
    expect(items[1]!.textContent).toContain('导入 Plugin ZIP，仅安装到本机。')
    await click(items[0] as HTMLElement)
    expect(statusNote(container).textContent).toBe('创建/上传尚未接通：扩展安装治理链未建立；不会创建或安装。')
  })

  it('opens the skill add menu with the observed skill wording and the same named refusal (installed.skills.add.open)', async () => {
    const container = await mount(createElement(ExtensionsPage))
    await click(tab(container, '技能'))
    await click(control(container, '添加技能'))
    const menu = container.querySelector('[role="menu"][aria-label="技能添加菜单"]') as HTMLElement
    expect(menu).not.toBeNull()
    const items = menu.querySelectorAll('[role="menuitem"]')
    expect(items).toHaveLength(2)
    expect(items[0]!.textContent).toContain('通过 Qoder 创建')
    expect(items[0]!.textContent).toContain('在新任务中创建个性化 Skill，并保存在本地使用。')
    expect(items[1]!.textContent).toContain('上传 Skill')
    expect(items[1]!.textContent).toContain('导入 ZIP 或 SKILL.md，仅安装到本机。')
    await click(items[1] as HTMLElement)
    expect(statusNote(container).textContent).toBe('创建/上传尚未接通：扩展安装治理链未建立；不会创建或安装。')
  })

  it('shows the skill market shell with sort pair, category row, search and the named not-wired data area, then returns to installed (market.skills.default)', async () => {
    const container = await mount(createElement(ExtensionsPage))
    await click(tab(container, '技能'))
    await click(control(container, '市场'))
    const market = container.querySelector('section[aria-label="扩展市场"]') as HTMLElement
    expect(market).not.toBeNull()
    expect(market.querySelector('h1')?.textContent).toBe('发现 Skills')
    expect(market.textContent).toContain('聚焦 效率提升、内容创作、官方精选。')
    // Top bar: back entry, three kind tabs, market refresh, market search.
    expect(control(market, '已安装')).not.toBeNull()
    const tabs = market.querySelector('[role="tablist"][aria-label="扩展类型"]')!
    expect(tabs.querySelectorAll('[role="tab"]')).toHaveLength(3)
    expect(market.querySelector('[role="tab"][aria-label="技能"]')?.getAttribute('aria-selected')).toBe('true')
    expect(control(market, '刷新市场')).not.toBeNull()
    const search = market.querySelector<HTMLInputElement>('input[aria-label="搜索市场"]')!
    expect(search.placeholder).toBe('搜索名称/说明/标签')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'deep-research')
    await act(async () => { search.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(search.value).toBe('deep-research')
    // Sort pair (热门 default) and the 全部 category row.
    const sorts = sortPair(market).querySelectorAll('button')
    expect([...sorts].map((button) => button.textContent)).toEqual(['热门', '最新'])
    expect(sorts[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(sorts[1]!.getAttribute('aria-pressed')).toBe('false')
    await click(sorts[1] as HTMLElement)
    expect(sorts[1]!.getAttribute('aria-pressed')).toBe('true')
    expect(sorts[0]!.getAttribute('aria-pressed')).toBe('false')
    expect(market.querySelector('[aria-label="市场类别"]')?.textContent).toContain('全部')
    expect(market.querySelector('[aria-label="市场类别"] button')?.getAttribute('aria-pressed')).toBe('true')
    // Data area: the named not-wired reason — no entries, no recommendation slots, no install
    // buttons, no fake generate entries; refresh stays local and the note is unchanged.
    expect(statusNote(container, market).textContent).toBe('市场服务未接通（market-provider-unavailable）')
    await click(control(market, '刷新市场'))
    // Refresh answers a named refusal (no provider polled); the data area keeps its own note.
    expect(market.textContent).toContain('刷新尚未接通')
    expect(market.querySelector('.extensions-empty')?.textContent).toBe('市场服务未接通（market-provider-unavailable）')
    expect(market.querySelectorAll('li')).toHaveLength(0)
    expect(market.textContent).not.toContain('去生成')
    // No install buttons for market items — the only 安装 text is the 已安装 back entry.
    expect([...market.querySelectorAll('button')].filter((button) => button.textContent?.includes('安装'))
      .map((button) => button.textContent)).toEqual(['已安装'])
    // Back to the installed view.
    await click(control(market, '已安装'))
    expect(container.querySelector('h1')?.textContent).toBe('扩展管理')
    expect(statusNote(container).textContent).toBe('扩展服务未接通（extensions-store-unavailable）')
  })

  it('switches the market between plugins and connectors with their observed headings (market.plugins.default / market.connectors.default)', async () => {
    const container = await mount(createElement(ExtensionsPage))
    await click(control(container, '市场'))
    expect(container.querySelector('h1')?.textContent).toBe('发现 Plugins')
    expect(container.textContent).toContain('聚焦 编码、数据分析、设计。')
    expect(container.querySelector('[role="tab"][aria-label="插件"]')?.getAttribute('aria-selected')).toBe('true')
    expect(statusNote(container).textContent).toBe('市场服务未接通（market-provider-unavailable）')
    await click(container.querySelector('[role="tab"][aria-label="连接器"]') as HTMLElement)
    expect(container.querySelector('h1')?.textContent).toBe('发现 Connectors')
    expect(container.textContent).toContain('聚焦 内容创作、知识研究。')
    expect(statusNote(container).textContent).toBe('市场服务未接通（market-provider-unavailable）')
    expect(container.textContent).not.toContain('暂无')
    expect([...container.querySelectorAll('button')].filter((button) => button.textContent?.includes('安装'))
      .map((button) => button.textContent)).toEqual(['已安装'])
  })
})
