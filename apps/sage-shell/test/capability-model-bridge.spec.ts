import { afterEach, describe, expect, it } from 'vitest'

import { readFileSync } from 'node:fs'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Batch 26 / P4 (ADR-0261 strangler): the capability roster card, its heading source badge and the
 * model-config card are owned by the React app. Both cards are pure read-only projections — the
 * legacy script publishes raw slices through `__SAGE_APP_SET_REGION__` and keeps no write path, no
 * affordance and no DOM ownership for them. Rendering is pinned in
 * `test/product-app/capability-model.spec.tsx`.
 */

interface RegionMessage {
  readonly kind: string
  readonly [key: string]: unknown
}

interface RegionSink {
  readonly byRegion: Array<{ region: string, message: RegionMessage }>
  readonly restore: () => void
}

let sink: RegionSink | undefined

afterEach(() => {
  sink?.restore()
  sink = undefined
})

function installRegionSink(): void {
  const byRegion: Array<{ region: string, message: RegionMessage }> = []
  const target = globalThis as { __SAGE_APP_SET_REGION__?: unknown }
  const previous = target.__SAGE_APP_SET_REGION__
  target.__SAGE_APP_SET_REGION__ = (region: string, message: RegionMessage): void => { byRegion.push({ region, message }) }
  sink = {
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

const capability = (over: Record<string, unknown> = {}) => ({
  source: 'runtime-effective', observed: true, reason: null,
  agentPresets: [
    { id: 'standard', state: 'enabled', reason: null },
    { id: 'legacy-broken', state: 'configured-not-enabled', reason: 'preset-failed-to-activate' },
  ],
  ...over,
})
const modelConfig = (over: Record<string, unknown> = {}) => ({
  state: 'read', reason: null, connectivityTest: 'untested',
  namespaces: [{ ns: 'llm', revision: 7, applies: 'live', saved: 'user', secrets: { set: 1, total: 1 } }],
  ...over,
})

describe('capability and model-config region bridge (batch 26)', () => {
  it('publishes the raw slices and leaves both card DOMs unwritten', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({ capability: capability(), modelConfig: modelConfig() }))
    await page.refresh()
    const capMessage = lastFor('capability')
    expect(capMessage?.kind).toBe('read')
    expect((capMessage?.slot as { slice: Record<string, unknown> }).slice.observed).toBe(true)
    const modelMessage = lastFor('model-config')
    expect(modelMessage?.kind).toBe('read')
    expect(((modelMessage?.slot as { slice: Record<string, unknown> }).slice.namespaces as unknown[])).toHaveLength(1)

    for (const id of ['capability-source', 'capability-note', 'model-test', 'model-note']) {
      expect(page.node(id).textContent, id).toBe('')
    }
    expect(page.node('capability-rows').children).toHaveLength(0)
    expect(page.node('model-rows').children).toHaveLength(0)

    page.setPayload(statePayload({}))
    await page.refresh()
    expect(lastFor('capability')).toEqual({ kind: 'unavailable' })
    expect(lastFor('model-config')).toEqual({ kind: 'unavailable' })
  })

  it('keeps both cards word-pinned, affordance-free and off the legacy script', () => {
    const html = renderSageDocument()
    const capabilityCard = html.slice(html.indexOf('id="sage-region-capability"'), html.indexOf('id="sage-region-model-config"'))
    for (const pin of [
      'AGENT PRESETS · READ-ONLY',
      '已配置的 Agent 运行时',
      '已配置不等于已启用，已启用也不等于可用。安装、启用、停用与撤销在本页没有入口。',
    ]) {
      expect(capabilityCard, pin).toContain(pin)
    }
    const modelCard = html.slice(html.indexOf('id="sage-region-model-config"'), html.indexOf('sage-workspace-adoption'))
    for (const pin of [
      'MODEL CONFIG · READ-ONLY',
      '模型配置',
      '只显示结构、层级与凭据是否已设置：不显示任何配置值，也无编辑入口。',
      '「已保存」与「连通性」是两回事',
    ]) {
      expect(modelCard, pin).toContain(pin)
    }
    // No affordance anywhere on either card, in the static first frame.
    expect(capabilityCard).not.toMatch(/<button|<form|<input/u)
    expect(modelCard).not.toMatch(/<button|<form|<input/u)

    // Reverse pin (source-level): the legacy script no longer queries any of the card nodes.
    for (const id of ['#capability-source', '#capability-rows', '#capability-note', '#model-rows', '#model-test', '#model-note']) {
      expect(html.includes("querySelector('" + id + "')"), id).toBe(false)
    }
    expect(html.includes('renderCapability('), 'renderCapability').toBe(false)
    expect(html.includes('renderModelConfig('), 'renderModelConfig').toBe(false)

    // The React side keeps the read-only contract: no fetch, no legacy actions, no write entries.
    const viewSource = readFileSync(new URL('../src/product/app/capability-view.tsx', import.meta.url), 'utf8')
    for (const banned of ['fetch(', '__SAGE_LEGACY_ACTIONS__', '<button', '<input', '<form']) {
      expect(viewSource.includes(banned), banned).toBe(false)
    }
  })

  it('carries the unobserved reason and the null-slice availability through the same slot', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({
      capability: { source: 'runtime-effective', observed: false, reason: 'observation-not-read', agentPresets: [] },
      modelConfig: { state: 'unavailable', reason: 'not-read', namespaces: [] },
    }))
    await page.refresh()
    expect((lastFor('capability')?.slot as { slice: Record<string, unknown> }).slice.observed).toBe(false)
    expect(((lastFor('capability')?.slot as { slice: Record<string, unknown> }).slice.reason)).toBe('observation-not-read')
    expect(((lastFor('model-config')?.slot as { slice: Record<string, unknown> }).slice.state)).toBe('unavailable')
  })
})
