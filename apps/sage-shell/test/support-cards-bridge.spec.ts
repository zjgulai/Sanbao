import { afterEach, describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Batch 16 / P3 (ADR-0261 strangler): the web-deliverables catalog (`#site-rows`) and the typed
 * tool-result rows (`#tool-result-rows`) are owned by the React app. The legacy script publishes
 * per-region slices through `__SAGE_APP_SET_REGION__` and exposes its wire actions through
 * `__SAGE_LEGACY_ACTIONS__`; it must not write either card's DOM anymore. Rendering is pinned in
 * `test/product-app/sites-tool-results.spec.tsx`.
 */

interface RegionMessage {
  readonly kind: string
  readonly [key: string]: unknown
}

interface RegionSink {
  readonly byRegion: Array<{ region: string, message: RegionMessage }>
  readonly restore: () => void
}

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

function payload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return statePayload({
    artifacts: { state: 'read', cards },
    toolResults,
    ...extra,
  })
}

let sink: RegionSink | undefined
let restoreActions: (() => void) | undefined

afterEach(() => {
  sink?.restore()
  sink = undefined
  restoreActions?.()
  restoreActions = undefined
})

function installRegionSink(): RegionSink {
  const byRegion: Array<{ region: string, message: RegionMessage }> = []
  const target = globalThis as { __SAGE_APP_SET_REGION__?: unknown }
  const previous = target.__SAGE_APP_SET_REGION__
  target.__SAGE_APP_SET_REGION__ = (region: string, message: RegionMessage): void => { byRegion.push({ region, message }) }
  return {
    byRegion,
    restore: () => {
      if (previous === undefined) delete target.__SAGE_APP_SET_REGION__
      else target.__SAGE_APP_SET_REGION__ = previous
    },
  }
}

function lastFor(region: string): RegionMessage | undefined {
  return sink?.byRegion.filter((entry) => entry.region === region).at(-1)?.message
}

describe('support-card region bridge (batch 16)', () => {
  it('publishes the sites slice for known artifacts and unavailable otherwise, leaving the card DOM untouched', async () => {
    sink = installRegionSink()
    const known = await bootSagePage(payload())
    expect(lastFor('sites')).toEqual({ kind: 'cards', cards })
    expect(lastFor('sites')?.cards).toBe(cards)
    expect(known.node('site-rows').children).toHaveLength(0)
    expect(known.node('site-note').textContent).toBe('')

    const unknown = await bootSagePage(statePayload({ toolResults }))
    expect(lastFor('sites')).toEqual({ kind: 'unavailable' })
    expect(unknown.node('site-rows').children).toHaveLength(0)
    expect(unknown.node('site-note').textContent).toBe('')
  })

  it('publishes the tool-results slice only for a read payload and leaves the rows untouched', async () => {
    sink = installRegionSink()
    const read = await bootSagePage(payload())
    expect(lastFor('tool-results')).toEqual({ kind: 'results', results: toolResults.results })
    expect(lastFor('tool-results')?.results).toBe(toolResults.results)
    expect(read.node('tool-result-rows').children).toHaveLength(0)
    expect(read.node('tool-result-note').textContent).toBe('')

    const unwired = await bootSagePage(payload({ toolResults: { state: 'unavailable', reason: 'tool-results-provider-unavailable' } }))
    expect(lastFor('tool-results')).toEqual({ kind: 'unavailable' })
    expect(unwired.node('tool-result-rows').children).toHaveLength(0)
    expect(unwired.node('tool-result-note').textContent).toBe('')
  })

  it('keeps the ticket-033 control roster pinned on the static first frame', () => {
    const document = renderSageDocument()
    const toolSlice = document.slice(document.indexOf('class="sage-card sage-tool-results-card"'), document.indexOf('class="sage-card sage-sites-card"'))
    const siteSectionStart = document.indexOf('<section class="sage-sites-section"')
    const siteSlice = document.slice(siteSectionStart, document.indexOf('</section>', siteSectionStart) + '</section>'.length)
    expect(toolSlice).not.toContain('<button')
    expect(siteSlice).not.toContain('<button')
    expect(siteSlice).toContain('已托管/可预览不等于网站上线')
    expect(siteSlice).toContain('本版没有发布、部署或托管入口')
    expect(toolSlice).toContain('不支持的类型明确拒绝，不用替代内容渲染')
    expect(toolSlice).toContain('没有批注入口')
    expect(document).toContain('id="sage-region-sites"')
    expect(document).toContain('id="sage-region-tool-results"')
  })

  it('exposes the wire actions through the legacy down-bridge with the exact request and notice contract', async () => {
    const page = await bootSagePage(payload(), {
      '/.sage/external-link': { state: 'opened', target: { scheme: 'https', host: 'docs.example.com' } },
    })
    const bridge = globalThis as unknown as {
      __SAGE_LEGACY_ACTIONS__?: {
        openExternalLink?: (url: string) => Promise<string>
        openArtifact?: (artifactId: string) => Promise<unknown>
      }
    }
    const actions = bridge.__SAGE_LEGACY_ACTIONS__
    expect(actions, 'legacy down-bridge must be installed at boot').toBeDefined()
    expect(typeof actions?.openExternalLink).toBe('function')
    expect(typeof actions?.openArtifact).toBe('function')

    const notice = await actions!.openExternalLink!('https://docs.example.com/guide')
    await page.settle()
    expect(page.requests).toEqual([{ path: '/.sage/external-link', body: { url: 'https://docs.example.com/guide' } }])
    expect(notice).toContain('已交给系统浏览器打开（目标已校验：docs.example.com）')
    expect(notice).toContain('不读取浏览器内容')

    await actions!.openArtifact!('art-html')
    await page.settle()
    expect(page.requests).toEqual([
      { path: '/.sage/external-link', body: { url: 'https://docs.example.com/guide' } },
      { path: '/.sage/artifacts/open', body: { artifactId: 'art-html' } },
    ])
  })

  it('maps refused external links to the honest notice through the down-bridge', async () => {
    const page = await bootSagePage(payload(), {
      '/.sage/external-link': { state: 'refused', code: 'link-scheme-refused' },
    })
    const bridge = globalThis as unknown as { __SAGE_LEGACY_ACTIONS__?: { openExternalLink?: (url: string) => Promise<string> } }
    const notice = await bridge.__SAGE_LEGACY_ACTIONS__!.openExternalLink!('file:///etc/passwd')
    await page.settle()
    expect(page.requests).toEqual([{ path: '/.sage/external-link', body: { url: 'file:///etc/passwd' } }])
    expect(notice).toContain('只允许 http/https——未打开。')
  })
})
