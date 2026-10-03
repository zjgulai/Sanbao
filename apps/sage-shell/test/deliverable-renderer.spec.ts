import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 033 on the shipped page (US-172~176).
 *
 * The typed tool-result rows render as Sage components — masked values, refused types by name,
 * and exactly two explicit entries (link open / version preview); the web-deliverables catalog is
 * a read-only filter of the same observed cards (同源版本 + 访问限制, 已托管≠上线); and the one
 * side-preview's full-view switch moves the same document with focus restoration on exit.
 */

const cards = [
  { artifactId: 'art-html', name: 'page.html', kind: 'html', bytes: 10, version: 'v3', state: 'ready', source: 'changes-observed', observedAt: 't' },
  { artifactId: 'art-md', name: 'notes.md', kind: 'markdown', bytes: 9, version: 'v1', state: 'ready', source: 'changes-observed', observedAt: 't' },
]

const toolResults = {
  state: 'read',
  results: [
    { resultId: 'r1', tool: 'web.fetch', title: '抓取结果', at: '2026-10-03T10:00:00.000Z', state: 'read', fields: [{ kind: 'text', text: '正文第一行' }] },
    { resultId: 'r2', tool: 'web.fetch', title: '来源链接', at: 't', state: 'read', fields: [{ kind: 'link', label: '官方文档', host: 'docs.example.com', url: 'https://docs.example.com/guide' }] },
    { resultId: 'r3', tool: 'task', title: '图表输出', at: 't', state: 'read', fields: [{ kind: 'image', name: 'chart.png', artifactId: 'art-img', version: 'v7' }] },
    { resultId: 'r4', tool: 'db', title: '查询', at: 't', state: 'read', fields: [{ kind: 'key-values', entries: [{ name: 'Authorization', value: '（已脱敏）' }, { name: '状态码', value: '200' }] }] },
    { resultId: 'r5', tool: 'scene', title: '三维结果', at: 't', state: 'unsupported', declaredType: 'webgl-scene' },
  ],
}

const preview = (overrides: Record<string, unknown> = {}) => ({ state: 'ready', artifactId: 'art-html', name: 'page.html', kind: 'html', version: 'v3', expanded: false, ...overrides })

const payload = (extra: Record<string, unknown> = {}) => statePayload({
  artifacts: { state: 'read', cards, preview: preview(), ...(extra.artifacts as Record<string, unknown> ?? {}) },
  toolResults: extra.toolResults ?? toolResults,
  ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'artifacts' && key !== 'toolResults')),
})

describe('the typed tool-result rows (ticket 033)', () => {
  it('renders supported kinds locally, masks sensitive values, and refuses unsupported types by name', async () => {
    const harness = await bootSagePage(payload())
    // Nothing opens or fetches on render: the only entries are explicit buttons.
    expect(harness.requests).toEqual([])
    const rows = harness.node('tool-result-rows').children
    expect(rows).toHaveLength(5)
    expect(rows[3]?.textContent).toContain('Authorization：（已脱敏）')
    expect(rows[3]?.textContent).toContain('状态码：200')
    expect(rows[4]?.textContent).toContain('不支持的类型：webgl-scene（已明确拒绝——不用替代内容渲染）。')
    // The refusal row offers no entry at all.
    expect(rows[4]?.querySelector('[data-tool-action]')).toBeNull()
    expect(rows[4]?.querySelector('[data-artifact-action]')).toBeNull()
    expect(harness.node('tool-result-note').textContent).toContain('可交互的只有：显式链接打开与按版本预览')
  })

  it('opens the external link only on the explicit click, one exact request, and never claims more than handoff', async () => {
    const harness = await bootSagePage(payload(), {
      '/.sage/external-link': { state: 'opened', target: { scheme: 'https', host: 'docs.example.com' } },
    })
    const linkRow = harness.node('tool-result-rows').children[1]!
    const open = linkRow.querySelector('[data-tool-action="open-link"]')!
    expect(open.textContent).toContain('在系统浏览器打开（先校验）')
    harness.node('tool-result-rows').dispatch('click', { target: open })
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/external-link', body: { url: 'https://docs.example.com/guide' } }])
    expect(harness.node('tool-result-note').textContent).toContain('已交给系统浏览器打开（目标已校验：docs.example.com）')
    expect(harness.node('tool-result-note').textContent).toContain('不读取浏览器内容')

    const refused = await bootSagePage(payload(), {
      '/.sage/external-link': { state: 'refused', code: 'link-scheme-refused' },
    })
    const refusedOpen = refused.node('tool-result-rows').children[1]!.querySelector('[data-tool-action="open-link"]')!
    refused.node('tool-result-rows').dispatch('click', { target: refusedOpen })
    await refused.settle()
    expect(refused.node('tool-result-note').textContent).toContain('只允许 http/https——未打开。')
  })

  it('resolves image results to a version preview through the artifact open action', async () => {
    const harness = await bootSagePage(payload())
    const imageRow = harness.node('tool-result-rows').children[2]!
    expect(imageRow.textContent).toContain('chart.png · 版本 v7')
    const open = imageRow.querySelector('[data-artifact-action="open"]')!
    harness.node('tool-result-rows').dispatch('click', { target: open })
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/artifacts/open', body: { artifactId: 'art-img' } }])
  })

  it('keeps an unwired provider honest instead of showing an empty list as a result', async () => {
    const harness = await bootSagePage(payload({ toolResults: { state: 'unavailable', reason: 'tool-results-provider-unavailable' } }))
    expect(harness.node('tool-result-rows').children).toHaveLength(0)
    expect(harness.node('tool-result-note').textContent).toContain('未核验：这一版还没有接上工具结果来源')
    expect(harness.node('tool-result-note').textContent).toContain('不用空列表冒充结果')
  })
})

describe('the web-deliverables catalog (ticket 033)', () => {
  it('lists only web-kind cards with same-source version and access limits — 已托管≠上线, and preview is the only entry', async () => {
    const harness = await bootSagePage(payload())
    const rows = harness.node('site-rows').children
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).toContain('page.html')
    expect(rows[0]?.textContent).toContain('版本 v3')
    expect(rows[0]?.textContent).toContain('本机就绪（离线预览可用）')
    expect(rows[0]?.textContent).toContain('访问限制：仅本机离线预览（无发布/托管入口）')
    expect(harness.node('site-note').textContent).toContain('共 1 项网页型成果')
    const open = rows[0]?.querySelector('[data-artifact-action="open"]')!
    expect(open.textContent).toBe('预览（离线）')
    harness.node('site-rows').dispatch('click', { target: open })
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/artifacts/open', body: { artifactId: 'art-html' } }])

    const empty = await bootSagePage(payload({ artifacts: { cards: [] } }))
    expect(empty.node('site-rows').children).toHaveLength(0)
    expect(empty.node('site-note').textContent).toContain('本机还没有网页型成果')
  })

  it('pins the control roster: no publish/annotate verbs anywhere in the two sections', async () => {
    const document = renderSageDocument()
    const toolSlice = document.slice(document.indexOf('class="sage-card sage-tool-results-card"'), document.indexOf('class="sage-card sage-sites-card"'))
    const siteSlice = document.slice(document.indexOf('class="sage-card sage-sites-card"'), document.indexOf('class="sage-matter-layout"'))
    // Static markup carries no entries at all — every entry is a rendered row, and each row's
    // roster is pinned on the booted page below.
    expect(toolSlice).not.toContain('<button')
    expect(siteSlice).not.toContain('<button')
    // The sections' own copy states the boundaries.
    expect(siteSlice).toContain('已托管/可预览不等于网站上线')
    expect(siteSlice).toContain('本版没有发布、部署或托管入口')
    expect(toolSlice).toContain('不支持的类型明确拒绝，不用替代内容渲染')
    expect(toolSlice).toContain('没有批注入口')

    const harness = await bootSagePage(payload())
    const labelsIn = (node: unknown): string[] => {
      const out: string[] = []
      const walk = (n: { tagName: string, textContent: string, children: readonly unknown[] }): void => {
        if (n.tagName === 'button') out.push(n.textContent)
        for (const child of n.children) walk(child as typeof n)
      }
      walk(node as { tagName: string, textContent: string, children: readonly unknown[] })
      return out
    }
    const toolLabels = labelsIn(harness.node('tool-result-rows'))
    expect(toolLabels).toEqual(['在系统浏览器打开（先校验）', '打开预览（按版本）'])
    expect(labelsIn(harness.node('site-rows'))).toEqual(['预览（离线）'])
    for (const word of ['批注', '发布', '部署', '上线', '托管']) {
      expect(toolLabels.join('|') + labelsIn(harness.node('site-rows')).join('|')).not.toContain(word)
    }
  })
})

describe('the preview full-view switch (ticket 033)', () => {
  it('moves the same document: exact body, no reload, label flips, and exit restores focus', async () => {
    const harness = await bootSagePage(payload())
    const expand = harness.node('artifact-expand')
    expect(expand.hidden).toBe(false)
    expect(expand.textContent).toBe('全屏查看（离线）')
    harness.node('artifact-expand').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/artifacts/fullscreen', body: { on: true } }])

    // The projection now says expanded: the label flips and the note states the no-reload fact.
    harness.setPayload(payload({ artifacts: { preview: preview({ expanded: true }) } }))
    await harness.refresh()
    expect(harness.node('artifact-expand').textContent).toBe('退出全屏（返回侧栏）')
    expect(harness.node('artifact-preview-note').textContent).toContain('全屏查看：同一文档，未重新加载、未重读版本')

    const before = harness.node('artifact-expand').focusCount
    harness.node('artifact-expand').dispatch('click')
    await harness.settle()
    expect(harness.requests[1]).toEqual({ path: '/.sage/artifacts/fullscreen', body: { on: false } })
    // 全屏退出恢复焦点：焦点回到触发器。
    expect(harness.node('artifact-expand').focusCount).toBeGreaterThan(before)
  })

  it('hides the switch until a preview is ready', async () => {
    const harness = await bootSagePage(payload({ artifacts: { preview: { state: 'closed' } } }))
    expect(harness.node('artifact-expand').hidden).toBe(true)
    const failed = await bootSagePage(payload({ artifacts: { preview: { state: 'failed', artifactId: 'a', name: 'n', code: 'artifact-load-failed', retryable: true } } }))
    expect(failed.node('artifact-expand').hidden).toBe(true)
  })
})
