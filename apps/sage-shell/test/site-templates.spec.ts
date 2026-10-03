import { describe, expect, it } from 'vitest'

import { BRIDGE_ENDPOINTS } from '../src/protocol.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { createSiteTemplates } from '../src/main/site-templates.js'

/**
 * Ticket 040 (US-195/196) at the module seam.
 *
 * The acceptance lines: the catalog is read-only with name/source/version per entry; a selection
 * produces only the draft's input (the insertion happens in the renderer — this module holds no
 * writer at all); NO site-create request face exists anywhere (asserted structurally against the
 * protocol map); and an unavailable catalog is a named state with its reason — never an empty
 * list masquerading as an empty catalog, never a silent substitution.
 */

const template = (overrides: Record<string, unknown> = {}) => ({
  templateId: 'tpl-digital-particles',
  name: '数字粒子 · 企业官网',
  source: 'sage-builtin',
  version: '1',
  prompt: '请为一个企业官网生成落地页…',
  ...overrides,
})

describe('the site-templates store (ticket 040)', () => {
  it('is honestly unavailable before any catalog exists — with its reason, never an empty success', async () => {
    const store = createSiteTemplates({})
    expect(await store.read()).toEqual({ state: 'unavailable', reason: 'site-templates-provider-unavailable', entries: [] })
  })

  it('maps a readable catalog with provenance per entry, bounded, and never invents a missing prompt', async () => {
    const calls: number[] = []
    const store = createSiteTemplates({
      catalog: () => {
        calls.push(Date.now())
        return {
          entries: [
            template(),
            template({ templateId: 'tpl-orbit', name: 'Orbit · SaaS 产品官网', source: 'sage-builtin', version: '1', prompt: null }),
            template({ templateId: 'bad-missing-name', name: '' }),
            { templateId: 'bad-empty-source', name: 'x', source: '', version: 'v' },
            'not-an-entry',
          ],
        }
      },
    })
    const status = await store.read()
    expect(calls).toHaveLength(1)
    expect(status.state).toBe('read')
    expect(status.entries).toEqual([
      { templateId: 'tpl-digital-particles', name: '数字粒子 · 企业官网', source: 'sage-builtin', version: '1', prompt: '请为一个企业官网生成落地页…' },
      { templateId: 'tpl-orbit', name: 'Orbit · SaaS 产品官网', source: 'sage-builtin', version: '1', prompt: null },
    ])
  })

  it('bounds entries and prompt length; a throwing or malformed source is a named refusal', async () => {
    const wide = createSiteTemplates({
      catalog: () => ({
        entries: [
          template({ templateId: 'tpl-long', prompt: 'x'.repeat(20_000) }),
          ...Array.from({ length: 60 }, (_value, index) => template({ templateId: `tpl-${String(index)}` })),
        ],
      }),
    })
    const bounded = await wide.read()
    expect(bounded.state).toBe('read')
    expect(bounded.entries).toHaveLength(50)
    // The over-length prompt is dropped to null (lists but cannot insert) — never truncated silently.
    expect(bounded.entries[0]).toMatchObject({ templateId: 'tpl-long', prompt: null })

    const throwing = createSiteTemplates({ catalog: () => { throw new Error('boom') } })
    expect(await throwing.read()).toEqual({ state: 'unavailable', reason: 'site-templates-failed', entries: [] })
    const malformed = createSiteTemplates({ catalog: () => ({ entries: 'nope' }) })
    expect(await malformed.read()).toEqual({ state: 'unavailable', reason: 'site-templates-unreadable', entries: [] })
  })

  it('has no site-create request face at all — the protocol carries no site endpoint', () => {
    const siteEndpoints = Object.keys(BRIDGE_ENDPOINTS).filter((endpoint) => endpoint.includes('site'))
    expect(siteEndpoints).toEqual([])
  })

  it('the unwired production default answers the same honest unavailable, never a fake list', async () => {
    const service = createUnavailableFirstService(null, {})
    const body = await (await service.readState()).json() as { siteTemplates: { state: string, reason: string | null, entries: unknown[] } }
    expect(body.siteTemplates).toEqual({ state: 'unavailable', reason: 'site-templates-provider-unavailable', entries: [] })
  })
})
