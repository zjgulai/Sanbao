import { describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createWorkspaceAdoption } from '../src/main/workspace-adoption.js'
import { renderSageDocument } from '../src/product/renderer.js'

/**
 * Ticket 010, adoption chain (US-057~062). The order is the contract: pick first, create only when
 * a path came back. A cancelled pick must not reach the create call at all — "the user closed the
 * picker" can never leave a record — and every refusal keeps its own machine code.
 */

const ADOPT_PATH = 'dsh-app://app/.sage/workspace/adopt'

function recordingBridge(answers: Record<string, unknown>) {
  const calls: Array<{ endpoint: string; payload: readonly unknown[] }> = []
  const call = async (endpoint: string, payload: readonly unknown[] = []) => {
    calls.push({ endpoint, payload })
    return answers[endpoint]
  }
  return { call, calls }
}

const adoptedAnswer = { ok: true, result: { workspace: { workspaceId: 'ws-1', path: '/Users/someone/project', title: 'project', createdAt: '2026-10-02T00:00:00Z' } } }

describe('adoption asks to pick first and only then asks to create', () => {
  it('stops after a cancelled pick — no create call, nothing to record', async () => {
    const bridge = recordingBridge({ 'directory/pick': { ok: true, result: { path: null } } })
    const adopt = createWorkspaceAdoption(bridge.call)
    expect(await adopt()).toEqual({ state: 'cancelled' })
    expect(bridge.calls.map((entry) => entry.endpoint)).toEqual(['directory/pick'])
  })

  it('never creates when the pick itself was refused', async () => {
    const bridge = recordingBridge({ 'directory/pick': { ok: false, code: 'bridge-provider-unavailable' } })
    const adopt = createWorkspaceAdoption(bridge.call)
    expect(await adopt()).toEqual({ state: 'refused', code: 'bridge-provider-unavailable' })
    expect(bridge.calls.map((entry) => entry.endpoint)).toEqual(['directory/pick'])
  })

  it('adopts with the picked path and reports the workspace the custodian returned', async () => {
    const bridge = recordingBridge({
      'directory/pick': { ok: true, result: { path: '/Users/someone/project' } },
      'workspace/create': adoptedAnswer,
    })
    const adopt = createWorkspaceAdoption(bridge.call)
    expect(await adopt()).toEqual({ state: 'adopted', workspaceId: 'ws-1', path: '/Users/someone/project', title: 'project' })
    expect(bridge.calls).toEqual([
      { endpoint: 'directory/pick', payload: [] },
      { endpoint: 'workspace/create', payload: [{ path: '/Users/someone/project' }] },
    ])
  })

  it('carries a refusal code back instead of a workspace', async () => {
    const refused = recordingBridge({
      'directory/pick': { ok: true, result: { path: '/Users/someone/project' } },
      'workspace/create': { ok: false, code: 'bridge-path-invalid' },
    })
    expect(await createWorkspaceAdoption(refused.call)()).toEqual({ state: 'refused', code: 'bridge-path-invalid' })

    const shapeless = recordingBridge({
      'directory/pick': { ok: true, result: { path: '/Users/someone/project' } },
      'workspace/create': { ok: true, result: { workspace: { path: '/Users/someone/project' } } },
    })
    expect(await createWorkspaceAdoption(shapeless.call)()).toEqual({ state: 'refused', code: 'bridge-answer-unrecognised' })

    const nonsense = recordingBridge({ 'directory/pick': 'not an answer' })
    expect(await createWorkspaceAdoption(nonsense.call)()).toEqual({ state: 'refused', code: 'bridge-answer-unrecognised' })
  })
})

describe('the adoption route and its projection', () => {
  async function post(providers: unknown, method = 'POST') {
    const response = await handleSageServiceRequest(new Request(ADOPT_PATH, { method }), {
      callerBinding: { correlation: 'c-010' },
      providers,
    } as never)
    // A transport denial carries no body on purpose; only a served answer is parsed.
    const body = response.status === 200 ? await response.json() as Record<string, unknown> : null
    return { status: response.status, body }
  }

  it('answers only POST and reports an unwired custodian instead of doing nothing', async () => {
    const providers = createUnavailableFirstService(null, {})
    const wrongMethod = await post(providers, 'GET')
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.body).toBeNull()
    const denied = await post(providers)
    expect(denied.status).toBe(200)
    expect(denied.body).toEqual({ state: 'refused', code: 'workspace-adoption-unavailable' })

    const state = await handleSageServiceRequest(new Request('dsh-app://app/.sage/state', { method: 'GET' }), {
      callerBinding: { correlation: 'c-010' },
      providers,
    } as never)
    expect((await state.json() as { workspaceAdoption: unknown }).workspaceAdoption)
      .toEqual({ state: 'refused', code: 'workspace-adoption-unavailable' })
  })

  it('projects the last attempt so the surface can show what happened', async () => {
    let outcome = { state: 'cancelled' as const }
    const providers = createUnavailableFirstService(null, { adoptWorkspace: async () => outcome })
    expect((await post(providers)).body).toEqual({ state: 'cancelled' })

    const state = await handleSageServiceRequest(new Request('dsh-app://app/.sage/state', { method: 'GET' }), {
      callerBinding: { correlation: 'c-010' },
      providers,
    } as never)
    expect((await state.json() as { workspaceAdoption: unknown }).workspaceAdoption).toEqual({ state: 'cancelled' })

    outcome = { state: 'adopted' as never }
    expect((await post(providers)).body).toEqual({ state: 'adopted' })
  })

  it('turns a throwing adopt provider into a refusal rather than an unhandled route error', async () => {
    const providers = createUnavailableFirstService(null, {
      adoptWorkspace: async () => { throw new Error('boom') },
    })
    expect((await post(providers)).body).toEqual({ state: 'refused', code: 'workspace-adoption-failed' })
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
  addEventListener: (type: string, handler: () => void) => void
  setAttribute: () => void
  appendChild: (child: StubNode) => void
  classList: { toggle: () => void }
}

function stubNode(): StubNode {
  const node: StubNode = {
    textContent: '', className: '', hidden: true, disabled: false, dataset: {}, children: [],
    addEventListener: () => undefined, setAttribute: () => undefined,
    appendChild: (child) => { node.children.push(child) },
    classList: { toggle: () => undefined },
  }
  return node
}

async function renderState(workspaceAdoption: unknown) {
  const nodes: Record<string, StubNode> = {
    '#state-title': stubNode(), '#state-message': stubNode(), '#retry': stubNode(),
    '#reconcile': stubNode(), '#command-note': stubNode(), '#login': stubNode(),
    '#capability-source': stubNode(), '#capability-rows': stubNode(), '#capability-note': stubNode(),
    '#model-rows': stubNode(), '#model-test': stubNode(), '#model-note': stubNode(),
    '#adopt-workspace': stubNode(), '#workspace-note': stubNode(),
  }
  const document = {
    querySelector: (selector: string): StubNode => nodes[selector] ?? stubNode(),
    querySelectorAll: (): StubNode[] => [],
    createElement: (): StubNode => stubNode(),
  }
  const script = renderSageDocument().match(/<script>([\s\S]*)<\/script>/u)?.[1]
  expect(script, 'embedded script must be extractable').toBeTruthy()
  const run = new Function('document', 'fetch', 'setInterval', script as string)
  run(document, async () => ({ ok: true, json: async () => ({ service: { status: 'unavailable', reason: 'authenticated', correlation: 'c', auth: { status: 'signed-out', displayName: null }, command: null }, runtime: null, matter: null, capability: null, modelConfig: null, workspaceAdoption }) }), () => 0)
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  return nodes
}

describe('the adopt entry says exactly what happened', () => {
  it('names the adopted workspace, and claims nothing was recorded for a cancellation', async () => {
    const adopted = await renderState({ state: 'adopted', workspaceId: 'ws-1', path: '/Users/someone/project', title: 'project' })
    expect(adopted['#workspace-note']!.textContent).toContain('已采纳')
    expect(adopted['#workspace-note']!.textContent).toContain('/Users/someone/project')

    const cancelled = await renderState({ state: 'cancelled' })
    expect(cancelled['#workspace-note']!.textContent).toContain('已取消选择')
    expect(cancelled['#workspace-note']!.textContent).toContain('没有创建或记录')
  })

  it('words each refusal from the machine code and offers no directory-creating control', async () => {
    const refused = await renderState({ state: 'refused', code: 'bridge-path-invalid' })
    expect(refused['#workspace-note']!.textContent).toContain('不是可以采纳的绝对路径')

    const document = renderSageDocument()
    const card = document.slice(
      document.indexOf('class="sage-card sage-workspace-adoption"'),
      document.indexOf('class="sage-card sage-file-references"'),
    )
    // 首版只采纳已有目录：这张卡只有一个按钮，且它是"选择已有目录"——说明句里提到"没有新建目录的入口"
    // 是解释，不是控件，所以这里按控件清点而不是按字样搜。
    const buttons = [...card.matchAll(/<button[^>]*>([^<]*)</gu)].map((match) => match[1])
    expect(buttons).toEqual(['选择已有目录'])
  })
})
