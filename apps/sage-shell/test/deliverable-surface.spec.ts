import { describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createArtifactPreview, buildImageDocument } from '../src/main/artifact-preview.js'
import type { ArtifactRecord } from '../src/main/artifacts.js'
import { createExternalLinks } from '../src/main/external-links.js'
import { createToolResults } from '../src/main/tool-results.js'

/**
 * Ticket 033 at the S1 routes and the S7 preview container (US-172~176).
 *
 * `/.sage/external-link` is validate-then-hand-off; `/.sage/artifacts/fullscreen` moves the SAME
 * loaded document (no reload); the tool-results slot carries kernel output; and the image viewer
 * document is script-free with CSS-only zoom (批注 入口缺位).
 */

const record = (): ArtifactRecord => ({
  artifactId: 'art-1', matterRef: 'matter:1', workspaceRoot: '/w', path: '/w/pic.png',
  name: 'pic.png', kind: 'image', version: 'v1', bytes: 10, state: 'ready', observedAt: 't',
})

function apiHarness(options: { readonly opened?: boolean } = {}) {
  const openedUrls: string[] = []
  const loads: unknown[] = []
  const expandedCalls: boolean[] = []
  const preview = createArtifactPreview({
    callBridge: async (endpoint) => endpoint === 'workspaceFiles/stat'
      ? { ok: true, result: { version: 'v1', bytes: 10 } }
      : { ok: true, result: { data: 'aGk=', bytes: 2, version: 'v1' } },
    createContainer: () => ({ load: async (input: unknown) => { loads.push(input) }, setExpanded: (on: boolean) => { expandedCalls.push(on) }, destroy: () => undefined }),
    now: () => 't',
  })
  const links = createExternalLinks({
    ...(options.opened === false ? {} : { openExternal: async (url: string) => { openedUrls.push(url) } }),
    now: () => '2026-10-03T10:00:00.000Z',
  })
  const providers = createUnavailableFirstService(null, {
    externalLinkOpen: (raw) => links.open(raw),
    artifactFullscreen: (request) => preview.setExpanded(request.on),
    toolResults: () => createToolResults({
      declarations: () => [{ resultId: 'r1', tool: 'db', title: '未知', at: 't', type: 'webgl-scene' }],
      artifactRecord: () => undefined,
    }).list(),
  })
  const post = (path: string, body: unknown) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    { callerBinding: { correlation: 'c-033' }, providers } as never,
  )
  const readState = async () => (await (await providers.readState()).json()) as Record<string, unknown>
  return { post, readState, preview, openedUrls, loads, expandedCalls }
}

describe('the external-link route (ticket 033)', () => {
  it('validates over the route: blocked schemes refuse with their own code, extras are a 400', async () => {
    const h = apiHarness()
    expect(await (await h.post('/.sage/external-link', { url: 'javascript:alert(1)' })).json())
      .toEqual({ state: 'refused', code: 'link-scheme-refused' })
    expect((await h.post('/.sage/external-link', { url: '' })).status).toBe(400)
    expect((await h.post('/.sage/external-link', { url: 'https://a.com', extra: 1 })).status).toBe(400)
    expect((await h.post('/.sage/external-link', { url: 42 })).status).toBe(400)
    expect(h.openedUrls).toEqual([])
  })

  it('hands the validated URL to the injected opener exactly once and echoes scheme + host only', async () => {
    const h = apiHarness()
    const outcome = await (await h.post('/.sage/external-link', { url: 'https://example.com/deep/link?token=abc' })).json() as Record<string, unknown>
    expect(outcome).toEqual({ state: 'opened', target: { scheme: 'https', host: 'example.com' } })
    expect(JSON.stringify(outcome)).not.toContain('token')
    expect(h.openedUrls).toEqual(['https://example.com/deep/link?token=abc'])

    const unwired = apiHarness({ opened: false })
    expect(await (await unwired.post('/.sage/external-link', { url: 'https://example.com/' })).json())
      .toEqual({ state: 'refused', code: 'external-open-unavailable' })
  })
})

describe('the fullscreen route (ticket 033)', () => {
  it('moves the same loaded document between panel and full view, and never reloads it', async () => {
    const h = apiHarness()
    // Not open yet: the layout switch refuses without pretending a preview exists.
    expect(await (await h.post('/.sage/artifacts/fullscreen', { on: true })).json())
      .toEqual({ state: 'refused', code: 'artifact-preview-not-open' })

    await h.preview.open(record())
    expect(h.loads).toHaveLength(1)
    const on = await (await h.post('/.sage/artifacts/fullscreen', { on: true })).json() as { state: string, preview: Record<string, unknown> }
    expect(on).toMatchObject({ state: 'ok', preview: { state: 'ready', artifactId: 'art-1', expanded: true } })
    const off = await (await h.post('/.sage/artifacts/fullscreen', { on: false })).json() as { preview: Record<string, unknown> }
    expect(off.preview).toMatchObject({ expanded: false })
    // Layout only: the document was loaded once — expanding and collapsing reloaded nothing.
    expect(h.loads).toHaveLength(1)
    expect(h.expandedCalls).toEqual([true, false])

    // Exact body: booleans only.
    expect((await h.post('/.sage/artifacts/fullscreen', { on: 'yes' })).status).toBe(400)
    expect((await h.post('/.sage/artifacts/fullscreen', {})).status).toBe(400)
    expect((await h.post('/.sage/artifacts/fullscreen', { on: true, extra: 1 })).status).toBe(400)
  })
})

describe('the tool-results slot and the image viewer document (ticket 033)', () => {
  it('carries kernel output through the state slot and refuses unsupported types by name', async () => {
    const h = apiHarness()
    const state = await h.readState()
    expect(state.toolResults).toMatchObject({ state: 'read' })
    const results = (state.toolResults as { results: Array<Record<string, unknown>> }).results
    expect(results[0]).toMatchObject({ state: 'unsupported', declaredType: 'webgl-scene', tool: 'db' })
  })

  it('builds the image viewer as a script-free document with CSS-only zoom and no annotation entry', () => {
    const doc = buildImageDocument({ name: 'pic.png', mime: 'image/png', data: 'aGk=', bytes: 2 })
    expect(doc).not.toContain('<script')
    expect(doc).toContain("Content-Security-Policy")
    expect(doc).toContain('缩放')
    expect(doc).toContain('id="zi100"')
    expect(doc).toContain('id="zi200"')
    expect(doc).toContain('overflow: auto')
    expect(doc).toContain('放大后用滚动平移')
    // 批注入口缺位：文案只是声明没有入口，不存在任何批注控件。
    expect(doc).toContain('本版没有批注入口')
    expect(doc).not.toContain('<button')
  })
})
