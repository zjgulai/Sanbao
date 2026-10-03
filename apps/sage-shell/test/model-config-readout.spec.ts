import { describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { renderSageDocument } from '../src/product/renderer.js'
import { classifySettingsDescribe, classifySettingsDescribeFailure } from '../src/main/settings-readout.js'

/**
 * Ticket 017 (US-043/044/047): the model-config view shows structure and state only — never a
 * value, never a secret, never a secret's key path. "已保存" and "连通性" are two separate fields,
 * and a partial failure must not read as a finished item.
 *
 * The fixture mirrors the base's own `settings/describe` schema (writable / hasDocument /
 * namespaces[{ns, schema, value, base, user, applies, secrets[{path,set}], revision}]).
 */

const describeAnswer = {
  writable: true,
  hasDocument: true,
  namespaces: [
    {
      ns: 'llm',
      schema: { model: 'string' },
      value: { model: 'deepseek-chat', apiKey: 'sk-should-never-surface', endpoint: '/Users/someone/private' },
      user: { model: 'deepseek-chat' },
      applies: 'live',
      secrets: [{ path: ['apiKey'], set: true }],
      revision: 7,
    },
    {
      ns: 'embedding',
      schema: { provider: 'string' },
      value: { provider: 'local' },
      applies: 'restart',
      secrets: [{ path: ['token'], set: false }, { path: ['token2'], set: false }],
      revision: 3,
    },
  ],
}

async function stateWith(reader: (() => unknown) | undefined) {
  const providers = createUnavailableFirstService(null, reader === undefined ? {} : { modelConfig: reader as never })
  const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/state', { method: 'GET' }), {
    providers,
    callerBinding: { correlation: 'c-017' },
  } as never)
  return await response.json() as Record<string, unknown>
}

describe('the settings read is classified into structure and state only', () => {
  it('keeps namespaces, layers, restart semantics and secret counts — and drops every value', () => {
    const status = classifySettingsDescribe(describeAnswer)
    expect(status.state).toBe('read')
    expect(status.writable).toBe(true)
    expect(status.hasDocument).toBe(true)
    expect(status.namespaces).toEqual([
      { ns: 'llm', revision: 7, applies: 'live', saved: 'user', secrets: { set: 1, total: 1 } },
      { ns: 'embedding', revision: 3, applies: 'restart', saved: 'base-only', secrets: { set: 0, total: 2 } },
    ])
    const serialized = JSON.stringify(status)
    expect(serialized).not.toContain('sk-')
    expect(serialized).not.toContain('/Users')
    expect(serialized).not.toContain('deepseek-chat')
    expect(serialized).not.toContain('apiKey')
  })

  it('refuses an unrecognisable answer instead of rendering a partial configuration', () => {
    expect(classifySettingsDescribe('nope')).toMatchObject({ state: 'unavailable', reason: 'not-plain-data' })
    expect(classifySettingsDescribe({ writable: true })).toMatchObject({ state: 'unavailable', reason: 'not-plain-data' })
    // Every required field is checked, not just the presence of the list: a coerced or missing
    // flag is as unrecognisable as a missing namespace array.
    expect(classifySettingsDescribe({ writable: 'yes', hasDocument: true, namespaces: [] }))
      .toMatchObject({ state: 'unavailable', reason: 'not-plain-data' })
    expect(classifySettingsDescribe({ writable: true, hasDocument: null, namespaces: [] }))
      .toMatchObject({ state: 'unavailable', reason: 'not-plain-data' })
    expect(classifySettingsDescribe({ writable: true, hasDocument: true, namespaces: { llm: {} } }))
      .toMatchObject({ state: 'unavailable', reason: 'not-plain-data' })
    expect(classifySettingsDescribeFailure(Object.assign(new Error('x'), { code: 'bridge-provider-failed' })))
      .toMatchObject({ state: 'unavailable', reason: 'bridge-refused' })
    expect(classifySettingsDescribeFailure(new Error('x'))).toMatchObject({ state: 'unavailable', reason: 'bridge-unavailable' })
  })

  it('keeps unread distinct from empty in the projection', async () => {
    const unread = await stateWith(undefined)
    expect(unread.modelConfig).toMatchObject({ state: 'unavailable', reason: 'not-read', namespaces: [] })
    const read = await stateWith(() => classifySettingsDescribe(describeAnswer))
    expect(read.modelConfig).toMatchObject({ state: 'read' })
    expect(JSON.stringify(read.modelConfig)).not.toContain('sk-')
  })
})

// --- served-document harness ---------------------------------------------------------------

interface StubNode {
  textContent: string
  className: string
  hidden: boolean
  disabled: boolean
  dataset: Record<string, string>
  children: StubNode[]
  addEventListener: () => void
  setAttribute: () => void
  appendChild: (child: StubNode) => void
  classList: { toggle: () => void }
}

function stubNode(): StubNode {
  const node: StubNode = {
    textContent: '',
    className: '',
    hidden: true,
    disabled: false,
    dataset: {},
    children: [],
    addEventListener: () => undefined,
    setAttribute: () => undefined,
    appendChild: (child) => { node.children.push(child) },
    classList: { toggle: () => undefined },
  }
  return node
}

async function renderState(payload: Record<string, unknown>) {
  const nodes: Record<string, StubNode> = {
    '#state-title': stubNode(), '#state-message': stubNode(), '#retry': stubNode(),
    '#reconcile': stubNode(), '#command-note': stubNode(), '#login': stubNode(),
    '#capability-source': stubNode(), '#capability-rows': stubNode(), '#capability-note': stubNode(),
    '#model-rows': stubNode(), '#model-test': stubNode(), '#model-note': stubNode(),
  }
  const document = {
    querySelector: (selector: string): StubNode => nodes[selector] ?? stubNode(),
    querySelectorAll: (): StubNode[] => [],
    createElement: (): StubNode => stubNode(),
  }
  const script = renderSageDocument().match(/<script>([\s\S]*)<\/script>/u)?.[1]
  expect(script, 'embedded script must be extractable').toBeTruthy()
  const run = new Function('document', 'fetch', 'setInterval', script as string)
  run(document, async () => ({ ok: true, json: async () => payload }), () => 0)
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  return nodes
}

describe('the model-config view keeps saving and connectivity apart', () => {
  it('renders saved state, restart semantics and credential counts as separate statements', async () => {
    const nodes = await renderState(await stateWith(() => classifySettingsDescribe(describeAnswer)))
    const rows = nodes['#model-rows']!.children
    expect(rows).toHaveLength(2)
    expect(rows[0]!.children.map((child) => child.textContent))
      .toEqual(['llm', '已保存', '立即生效', '凭据：已设置 1/1'])
    expect(rows[1]!.children.map((child) => child.textContent))
      .toEqual(['embedding', '仅默认值', '需重启', '凭据：已设置 0/2'])
    // 连通性 is its own field and denies that a save proves availability.
    expect(nodes['#model-test']!.textContent).toContain('未测试')
    expect(nodes['#model-test']!.textContent).toContain('不代表供应商已被调用过')
  })

  it('does not report a partial failure as a finished item', async () => {
    const nodes = await renderState(await stateWith(() => classifySettingsDescribe(describeAnswer)))
    expect(nodes['#model-note']!.textContent).toContain('缺凭据')
    expect(nodes['#model-note']!.textContent).toContain('不算配置完成')
  })

  it('says 未核验 with a reason and offers no editing affordance', async () => {
    const nodes = await renderState(await stateWith(undefined))
    expect(nodes['#model-note']!.textContent).toContain('未核验')
    expect(nodes['#model-rows']!.children).toHaveLength(0)
    const document = renderSageDocument()
    // End at the next card: the workspace-adoption card below is an affordance of its own.
    const card = document.slice(document.indexOf('sage-model-config'), document.indexOf('sage-workspace-adoption'))
    expect(card).not.toMatch(/<button|<form|<input/u)
  })
})
