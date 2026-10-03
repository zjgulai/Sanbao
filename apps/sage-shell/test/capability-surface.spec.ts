import { describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { renderSageDocument } from '../src/product/renderer.js'
import type { RuntimeEffectiveObservation } from '../src/protocol.js'

/**
 * Ticket 030 (US-155~158): the capability surface shows what main actually observed, keeps
 * 已配置 / 已启用 / 可用 as three separate statements, offers no install or enable entry, and never
 * turns "not wired" or "could not read" into "已停用".
 */

const observedRoster: RuntimeEffectiveObservation = {
  kind: 'observed',
  defaultPresetId: 'standard',
  presets: [
    { id: 'standard', isDefault: true },
    { id: 'cordis', isDefault: false },
    { id: 'legacy-broken', isDefault: false, broken: 'failed to import /Users/someone/secret/entry.js' },
  ],
}

async function stateWith(reader: (() => RuntimeEffectiveObservation | undefined) | undefined) {
  const providers = createUnavailableFirstService(null, reader === undefined ? {} : { runtimeEffective: reader })
  const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/state', { method: 'GET' }), {
    providers,
    callerBinding: { correlation: 'c-30' },
  } as never)
  return await response.json() as Record<string, unknown>
}

describe('capability projection is classified once by main', () => {
  it('separates configured, enabled and not-enabled rows and keeps the codes machine-only', async () => {
    const state = await stateWith(() => observedRoster)
    expect(state.capability).toEqual({
      source: 'runtime-effective',
      observed: true,
      reason: null,
      agentPresets: [
        { id: 'standard', state: 'enabled', reason: null },
        { id: 'cordis', state: 'enabled', reason: null },
        { id: 'legacy-broken', state: 'configured-not-enabled', reason: 'preset-failed-to-activate' },
      ],
      external: { state: 'not-wired', reason: 'capability-registry-unavailable' },
    })
  })

  it('never lets the base text (paths, secrets) ride along on the surface', async () => {
    const state = await stateWith(() => observedRoster)
    const serialized = JSON.stringify(state.capability)
    expect(serialized).not.toContain('/Users')
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('failed to import')
  })

  it('keeps an unread roster unverified instead of inventing rows', async () => {
    const state = await stateWith(undefined)
    expect(state.capability).toMatchObject({ observed: false, reason: 'observation-not-read', agentPresets: [] })
  })

  it('propagates the reason when the runtime cannot produce a roster', async () => {
    const state = await stateWith(() => ({ kind: 'unavailable', reason: 'registry-service-absent' }))
    expect(state.capability).toMatchObject({ observed: false, reason: 'registry-service-absent', agentPresets: [] })
  })
})

// --- served-document harness ---------------------------------------------------------------

interface StubNode {
  tagName: string
  textContent: string
  className: string
  hidden: boolean
  disabled: boolean
  tabIndex: number
  dataset: Record<string, string>
  children: StubNode[]
  addEventListener: (type: string, handler: () => void) => void
  setAttribute: () => void
  appendChild: (child: StubNode) => void
  classList: { toggle: (cls: string, on: boolean) => void }
}

function stubNode(tagName = 'div'): StubNode {
  const node: StubNode = {
    tagName,
    textContent: '',
    className: '',
    hidden: true,
    disabled: false,
    tabIndex: 0,
    dataset: {},
    children: [],
    addEventListener: () => undefined,
    setAttribute: () => undefined,
    appendChild: (child) => { node.children.push(child) },
    classList: { toggle: () => undefined },
  }
  return node
}

function createCapabilityStub() {
  const nodes: Record<string, StubNode> = {
    '#state-title': stubNode(),
    '#state-message': stubNode(),
    '#retry': stubNode(),
    '#reconcile': stubNode(),
    '#command-note': stubNode(),
    '#login': stubNode(),
    '#capability-source': stubNode(),
    '#capability-rows': stubNode('ul'),
    '#capability-note': stubNode(),
  }
  const document = {
    querySelector: (selector: string): StubNode => nodes[selector] ?? stubNode(),
    querySelectorAll: (): StubNode[] => [],
    createElement: (tag: string): StubNode => stubNode(tag),
  }
  return { document, nodes }
}

function sageScript(): string {
  const script = renderSageDocument().match(/<script>([\s\S]*)<\/script>/u)?.[1]
  expect(script, 'embedded script must be extractable from the served document').toBeTruthy()
  return script!
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Drive the document with the exact payload the S1 route produced (producer → consumer, P-56). */
async function renderState(payload: Record<string, unknown>) {
  const stub = createCapabilityStub()
  const fetchStub = async () => ({ ok: true, json: async () => payload })
  const run = new Function('document', 'fetch', 'setInterval', sageScript())
  run(stub.document, fetchStub, () => 0)
  await flush()
  return stub.nodes
}

function rowText(node: StubNode): string {
  return node.children.map((child) => child.textContent).join(' | ')
}

describe('the capability view states three facts separately and offers no write entry', () => {
  it('renders the real projected roster with configured, enabled and availability kept apart', async () => {
    const nodes = await renderState(await stateWith(() => observedRoster))
    const rows = nodes['#capability-rows']!.children
    expect(rows).toHaveLength(3)
    expect(rowText(rows[0]!)).toBe('standard | 已配置 | 已启用 | 可用性：外部能力面未接线，无法核验')
    expect(rowText(rows[2]!)).toContain('已配置')
    expect(rowText(rows[2]!)).toContain('未启用')
    expect(nodes['#capability-note']!.textContent).toBe('已配置 3 项，其中 1 项未启用。已启用不等于可用。')
    expect(nodes['#capability-source']!.textContent).toContain('运行时清单观察')
  })

  it('says 未核验 with the reason and never 已停用 when the roster could not be read', async () => {
    const nodes = await renderState(await stateWith(undefined))
    expect(nodes['#capability-rows']!.children).toHaveLength(0)
    expect(nodes['#capability-note']!.textContent).toContain('未核验')
    expect(nodes['#capability-note']!.textContent).not.toContain('已停用')
    expect(nodes['#capability-source']!.textContent).toContain('尚未读到')
  })

  it('carries the runtime’s own unavailable reason into the wording table', async () => {
    const nodes = await renderState(await stateWith(() => ({ kind: 'unavailable', reason: 'registry-service-absent' })))
    expect(nodes['#capability-note']!.textContent).toContain('没有提供目录服务')
  })

  it('offers no install, enable or revoke control on the capability view', async () => {
    const document = renderSageDocument()
    // Slice this card only: the panel also hosts the workspace-adoption card, which is an
    // affordance of its own and must not be judged by this ticket's rule.
    const panel = document.slice(
      document.indexOf('class="sage-card sage-capability-roster"'),
      document.indexOf('class="sage-card sage-model-config"'),
    )
    // The panel explains that these entries are absent — that sentence is not a control. What must
    // not exist is an actual affordance: no button, no form, no input anywhere on the view.
    expect(panel).not.toMatch(/<button|<form|<input/u)
    // 清单行由脚本建 DOM；脚本本身不得带任何写路径——每个 fetch 的目标只能是那三个已知常量或转发变量。
    const script = sageScript()
    expect(script.match(/fetch\(\s*(?!(?:path|statePath|loginPath|logoutPath)\b)/gu)).toBeNull()
  })
})
