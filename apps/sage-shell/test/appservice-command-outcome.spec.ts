import { describe, expect, it } from 'vitest'

import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createUnavailableFirstService, PRODUCTION_FAIL_CLOSED_PORTS } from '../src/appservice/composition.js'
import type { CommandPipelinePorts, SageActionIntentV2 } from '../src/appservice/command-contracts.js'
import { identityResolutionDenied } from './fixtures/command-fakes.js'
import { renderSageDocument } from '../src/product/renderer.js'
import { FakeElement } from './support/sage-page.js'

/**
 * Ticket 001 (US-117~123): the three command result states must reach the surface as three
 * different entry sets, and a not-ready command must never be rendered as a failure.
 *
 * The renderer cases compile only this repository's own rendered document (same seam as
 * renderer-state-parse.spec.ts); payloads arrive through the fetch stub, never into the body.
 */

const intent: SageActionIntentV2 = {
  matterId: 'm1',
  revisionId: 'r1',
  actionType: 'start-attempt',
  actionScope: 'revision',
  payload: {},
  origin: 'renderer-action',
}

const passingPorts: CommandPipelinePorts = {
  ...PRODUCTION_FAIL_CLOSED_PORTS,
  checkAuthorizationAvailability: () => ({ ok: true as const }),
  resolveIdentityPolicy: () => ({ kind: 'authorized' as const, actor: {}, authoritySnapshot: {} }),
  strictRehydrate: () => ({ matter: {} as never, current: true }),
  resolveTarget: () => ({ targetRequirement: {} }),
  resolveCompatibility: () => ({ outcome: 'equivalent' as const }),
  resolveRegistry: () => ({ mapping: {} as never }),
  preflightAvailability: () => ({ ok: true as const }),
  persistPreparation: () => ({ persisted: true as const }),
  dispatchOperation: () => ({ receipt: { receiptRef: 'receipt-1' } }),
}

function createService(commandPorts?: CommandPipelinePorts) {
  const providers = createUnavailableFirstService(null, commandPorts === undefined ? {} : { commandPorts })
  return {
    dispatch: async (body: unknown) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { callerBinding: { correlation: 'cb-1' }, providers },
    ),
    readState: async () => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/state'),
      { callerBinding: { correlation: 'cb-1' }, providers },
    ),
  }
}

interface ProjectedCommand {
  readonly correlation: string
  readonly outcome: string
  readonly code: string | null
  readonly retryable: boolean
}

interface ProjectedState {
  readonly service: { readonly command: ProjectedCommand | null }
}

async function stateOf(response: Response): Promise<ProjectedState> {
  return await response.json() as ProjectedState
}

describe('command outcome projection at the S1 route', () => {
  it('carries no command slot at all before anything is dispatched', async () => {
    const service = createService()
    const state = await stateOf(await service.readState())
    expect(state.service.command).toBeNull()
  })

  it('projects a provider-less command as not-ready, keeping the machine code and its retryable flag', async () => {
    const service = createService()
    const denial = await stateOf(await service.dispatch(intent))
    expect(denial).toMatchObject({ code: 'identity-unavailable', stage: 'identity-policy', retryable: true })

    const state = await stateOf(await service.readState())
    expect(state.service.command).toMatchObject({
      outcome: 'not-ready',
      code: 'identity-unavailable',
      retryable: true,
    })
    expect(typeof state.service.command.correlation).toBe('string')
  })

  it('projects outcome-unknown as its own state, distinct from availability unknown and from failure', async () => {
    const service = createService({ ...passingPorts, dispatchOperation: () => ({ outcome: 'outcome-unknown' as const }) })
    const denial = await stateOf(await service.dispatch(intent))
    expect(denial).toMatchObject({ code: 'outcome-unknown', stage: 'dispatch', retryable: false })

    const state = await stateOf(await service.readState())
    expect(state.service.command).toMatchObject({ outcome: 'unknown', code: 'outcome-unknown', retryable: false })
  })

  it('projects a determinate policy denial as failed, not as not-ready', async () => {
    const service = createService({
      ...passingPorts,
      resolveIdentityPolicy: () => identityResolutionDenied('policy-not-active'),
    })
    const denial = await stateOf(await service.dispatch(intent))
    expect(denial).toMatchObject({ code: 'policy-denied', retryable: false })

    const state = await stateOf(await service.readState())
    expect(state.service.command).toMatchObject({ outcome: 'failed', code: 'policy-denied', retryable: false })
  })

  it('projects an accepted command as settled with no denial code', async () => {
    const service = createService(passingPorts)
    await service.dispatch(intent)
    const state = await stateOf(await service.readState())
    expect(state.service.command).toMatchObject({ outcome: 'settled', code: null, retryable: false })
  })

  it('never lets a machine path or a secret-shaped value reach the projected slot', async () => {
    const service = createService()
    await service.dispatch(intent)
    const state = await stateOf(await service.readState())
    const text = JSON.stringify(state.service.command)
    expect(text).not.toMatch(/\//u)
    expect(text).not.toMatch(/Users|\.\.\//u)
    expect(text).not.toMatch(/sk-[A-Za-z0-9]/u)
  })
})

function stubElement(): FakeElement {
  const node = new FakeElement('div')
  node.hidden = true
  return node
}

function createCommandStub() {
  const nodes: Record<string, FakeElement> = {
    '#state-title': stubElement(),
    '#state-message': stubElement(),
    '#retry': stubElement(),
    '#reconcile': stubElement(),
    '#command-note': stubElement(),
  }
  const document = {
    querySelector: (selector: string): FakeElement => nodes[selector] ?? stubElement(),
    querySelectorAll: (): FakeElement[] => [],
    createElement: (): FakeElement => stubElement(),
  }
  return { document, nodes }
}

async function renderWith(payload: unknown) {
  const script = renderSageDocument().match(/<script>([\s\S]*)<\/script>/u)?.[1]
  expect(script, 'embedded script must be extractable from the served document').toBeTruthy()
  const { document, nodes } = createCommandStub()
  const fetchStub = async () => ({ ok: true, json: async () => payload })
  const run = new Function('document', 'fetch', 'setInterval', script as string) as (d: unknown, f: unknown, i: unknown) => void
  run(document, fetchStub, () => 0)
  await new Promise((resolve) => { setTimeout(resolve, 0) })
  await new Promise((resolve) => { setTimeout(resolve, 0) })
  return nodes
}

// The runtime dimension wants to offer 重新检查 in every case below, so a visible 重试 button
// can only come from the command classification — not from the runtime hint bleeding through.
const runtime = { status: 'unavailable', message: 'Sage 暂时未检测到能力运行时服务，可重新检查。', retryable: true }

function servicePayload(command: unknown): unknown {
  return {
    service: { status: 'unavailable', reason: 'authenticated', correlation: 'c-1', auth: { status: 'signed-in', displayName: 'Alice' }, command },
    runtime,
  }
}

describe('three states pick three different entries', () => {
  it('offers 核对 and never 重试 for a result the shell cannot confirm', async () => {
    const nodes = await renderWith(servicePayload({
      correlation: 'c-2', outcome: 'unknown', code: 'outcome-unknown', retryable: false,
    }))
    expect(nodes['#reconcile']?.hidden).toBe(false)
    expect(nodes['#retry']?.hidden).toBe(true)
    expect(nodes['#command-note']?.textContent).toContain('核对')
  })

  it('keeps a not-ready command out of failure wording even though its code is retryable', async () => {
    const nodes = await renderWith(servicePayload({
      correlation: 'c-3', outcome: 'not-ready', code: 'identity-unavailable', retryable: true,
    }))
    expect(nodes['#retry']?.hidden).toBe(true)
    expect(nodes['#reconcile']?.hidden).toBe(true)
    expect(nodes['#command-note']?.textContent).toContain('未就绪')
    expect(nodes['#command-note']?.textContent).not.toContain('失败')
  })

  it('offers 重试 for a determinate failure the pipeline marked retryable', async () => {
    const nodes = await renderWith(servicePayload({
      correlation: 'c-4', outcome: 'failed', code: 'conflict', retryable: true,
    }))
    expect(nodes['#retry']?.hidden).toBe(false)
    expect(nodes['#reconcile']?.hidden).toBe(true)
  })

  it('keeps the runtime retry hint from resurrecting a failure the pipeline marked non-retryable', async () => {
    // policy-denied is the real step-2 shape: failed + retryable:false, while the runtime
    // dimension above still advertises retryable:true. Replay cannot change the answer.
    const nodes = await renderWith(servicePayload({
      correlation: 'c-4b', outcome: 'failed', code: 'policy-denied', retryable: false,
    }))
    expect(nodes['#retry']?.hidden).toBe(true)
    expect(nodes['#reconcile']?.hidden).toBe(true)
    expect(nodes['#command-note']?.textContent).toContain('确定失败')
  })

  it('shows no command entry when nothing was dispatched or the command settled', async () => {
    // With no command of its own, the surface falls back to the runtime hint (here: 重新检查 visible).
    const before = await renderWith(servicePayload(null))
    expect(before['#reconcile']?.hidden).toBe(true)
    expect(before['#command-note']?.textContent).toBe('')
    expect(before['#retry']?.hidden).toBe(false)

    const settled = await renderWith(servicePayload({
      correlation: 'c-5', outcome: 'settled', code: null, retryable: false,
    }))
    expect(settled['#reconcile']?.hidden).toBe(true)
    expect(settled['#command-note']?.textContent).toBe('')
  })

  it('does not merge the three states into one identical surface', async () => {
    const surface = async (command: unknown) => {
      const nodes = await renderWith(servicePayload(command))
      return `${nodes['#retry']?.hidden}/${nodes['#reconcile']?.hidden}/${nodes['#command-note']?.textContent}`
    }
    const unknown = await surface({ correlation: 'c', outcome: 'unknown', code: 'outcome-unknown', retryable: false })
    const notReady = await surface({ correlation: 'c', outcome: 'not-ready', code: 'identity-unavailable', retryable: true })
    const failed = await surface({ correlation: 'c', outcome: 'failed', code: 'conflict', retryable: true })
    expect(new Set([unknown, notReady, failed]).size).toBe(3)
  })

  it('renders only the static wording table, never the code verbatim as a path or secret', async () => {
    const nodes = await renderWith(servicePayload({
      correlation: 'c-6', outcome: 'not-ready', code: 'compatibility-unknown', retryable: true,
    }))
    expect(nodes['#command-note']?.textContent).not.toMatch(/\//u)
    expect(nodes['#command-note']?.textContent).not.toMatch(/compatibility-unknown/u)
  })

  it('survives a malformed command slot without inventing an entry', async () => {
    const nodes = await renderWith(servicePayload({ outcome: 'nonsense', retryable: 'yes' }))
    expect(nodes['#reconcile']?.hidden).toBe(true)
    expect(nodes['#command-note']?.textContent).toBe('')
    // The unrecognisable slot must not silence the runtime's own hint either.
    expect(nodes['#retry']?.hidden).toBe(false)
  })
})
