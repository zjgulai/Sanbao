import { describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { renderSageDocument } from '../src/product/renderer.js'

/**
 * Ticket 045 (US-206~208): the user menu and the profile page must read one identity projection
 * owned by Electron main — never a second copy, never a renderer-side claim, and never a name the
 * shell keeps after the identity stops being verifiable.
 *
 * Seams: S1 (`/.sage/state` projection) and the served document's own script (same harness as
 * appservice-command-outcome.spec.ts). No ctx.get and no new ports: the value is the one main
 * already injects through `authSnapshot`.
 */

function stateWith(auth: { status: string; displayName: string | null }): Promise<Record<string, unknown>> {
  const providers = createUnavailableFirstService(null, {
    authSnapshot: () => ({ status: auth.status as 'signed-in', displayName: auth.displayName }),
  })
  const request = new Request('dsh-app://app/.sage/state', { method: 'GET' })
  return handleSageServiceRequest(request, {
    providers,
    callerBinding: { correlation: 'c-45' },
  } as never).then((response) => response.json() as Promise<Record<string, unknown>>)
}

function serviceBlock(payload: Record<string, unknown>): Record<string, unknown> {
  return (payload.service ?? {}) as Record<string, unknown>
}

describe('identity projection is single-sourced from main', () => {
  it('projects the main snapshot verbatim for signed-in, pending and signed-out', async () => {
    expect(serviceBlock(await stateWith({ status: 'signed-in', displayName: 'Alice' })).auth)
      .toEqual({ status: 'signed-in', displayName: 'Alice' })
    expect(serviceBlock(await stateWith({ status: 'pending', displayName: null })).auth)
      .toEqual({ status: 'pending', displayName: null })
    expect(serviceBlock(await stateWith({ status: 'signed-out', displayName: null })).auth)
      .toEqual({ status: 'signed-out', displayName: null })
  })
})

// --- served-document harness ---------------------------------------------------------------

interface StubElement {
  textContent: string
  hidden: boolean
  disabled: boolean
  tabIndex: number
  dataset: Record<string, string>
  addEventListener: (type: string, handler: () => void) => void
  setAttribute: () => void
  classList: { toggle: (cls: string, on: boolean) => void }
}

function stubElement(): StubElement {
  return {
    textContent: '',
    hidden: true,
    disabled: false,
    tabIndex: 0,
    dataset: {},
    addEventListener: () => undefined,
    setAttribute: () => undefined,
    classList: { toggle: () => undefined },
  }
}

/**
 * Nodes are registered two ways: by selector for `querySelector`, and by the `data-*` family they
 * belong to for `querySelectorAll`. Identity labels and logout entries are the families this
 * ticket is about — one projected value must reach every member of a family.
 */
function createIdentityStub() {
  const identityLabels = [stubElement(), stubElement(), stubElement()]
  const logoutEntries = [stubElement(), stubElement(), stubElement()]
  const nodes: Record<string, StubElement> = {
    '#state-title': stubElement(),
    '#state-message': stubElement(),
    '#retry': stubElement(),
    '#reconcile': stubElement(),
    '#command-note': stubElement(),
    '#login': stubElement(),
    '#logout': logoutEntries[0]!,
    '#auth-name': identityLabels[0]!,
    '#user-menu-identity': identityLabels[1]!,
    '#profile-identity': identityLabels[2]!,
    '#profile-status-note': stubElement(),
    '#user-menu-logout': logoutEntries[1]!,
    '#profile-logout': logoutEntries[2]!,
  }
  const document = {
    querySelector: (selector: string): StubElement => nodes[selector] ?? stubElement(),
    querySelectorAll: (selector: string): StubElement[] => {
      if (selector === '[data-identity-label]') return identityLabels
      if (selector === '[data-logout-entry]') return logoutEntries
      return []
    },
  }
  return { document, nodes, identityLabels, logoutEntries }
}

function sageScript(): string {
  const script = renderSageDocument().match(/<script>([\s\S]*)<\/script>/u)?.[1]
  expect(script, 'embedded script must be extractable from the served document').toBeTruthy()
  return script!
}

interface Harness {
  readonly stub: ReturnType<typeof createIdentityStub>
  /** Run the document's own poll callback once: the same path a 2s convergence tick takes. */
  readonly tick: () => Promise<void>
}

async function mount(authSource: () => { status: string; displayName: string | null }): Promise<Harness> {
  const stub = createIdentityStub()
  let scheduled: (() => void) | undefined
  const fetchStub = async () => {
    const auth = authSource()
    return {
      ok: true,
      json: async () => ({
        service: {
          status: 'unavailable',
          reason: auth.status === 'signed-out' ? 'identity-unavailable' : 'authenticated',
          correlation: 'c-45',
          auth,
          command: null,
        },
        runtime: { status: 'ready', message: '运行时已就绪。', retryable: false },
      }),
    }
  }
  const run = new Function('document', 'fetch', 'setInterval', sageScript())
  run(stub.document, fetchStub, (callback: () => void) => {
    scheduled = callback
    return 0
  })
  await flush()
  const tick = async () => {
    scheduled?.()
    await flush()
  }
  return { stub, tick }
}

/** refresh() awaits several microtasks (fetch, json, then render); macrotask hops drain them all. */
async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

const settle = flush

describe('user menu and profile page share one identity value', () => {
  it('shows the same signed-in name in both entries', async () => {
    const { stub } = await mount(() => ({ status: 'signed-in', displayName: 'Alice' }))
    expect(stub.nodes['#user-menu-identity']?.textContent).toBe('Alice')
    expect(stub.nodes['#profile-identity']?.textContent).toBe('Alice')
  })

  it('moves every identity entry together on the next projection, leaving no stale copy', async () => {
    let name: string | null = 'Alice'
    const { stub, tick } = await mount(() => ({ status: 'signed-in', displayName: name }))
    expect(stub.identityLabels.map((node) => node.textContent)).toEqual(['Alice', 'Alice', 'Alice'])
    name = 'Bob'
    await tick()
    expect(stub.identityLabels.map((node) => node.textContent)).toEqual(['Bob', 'Bob', 'Bob'])
  })

  it('offers 退出登录 from every entry only while the identity is signed-in', async () => {
    const signedIn = await mount(() => ({ status: 'signed-in', displayName: 'Alice' }))
    expect(signedIn.stub.logoutEntries.map((node) => node.hidden)).toEqual([false, false, false])
    const pending = await mount(() => ({ status: 'pending', displayName: null }))
    expect(pending.stub.logoutEntries.every((node) => node.hidden)).toBe(true)
  })

  it('shows 未就绪 with a reason instead of a placeholder name while identity is unverified', async () => {
    const { stub } = await mount(() => ({ status: 'pending', displayName: null }))
    for (const id of ['#user-menu-identity', '#profile-identity']) {
      expect(stub.nodes[id]?.textContent).toContain('未就绪')
      expect(stub.nodes[id]?.textContent).not.toBe('—')
      expect(stub.nodes[id]?.textContent).not.toBe('undefined')
      expect(stub.nodes[id]?.textContent).not.toBe('null')
    }
    expect(stub.nodes['#profile-status-note']?.textContent).toContain('未就绪')
    expect(stub.nodes['#profile-status-note']?.textContent).toContain('登录流程')
  })

  it('drops the previously shown name once the identity is signed-out', async () => {
    let auth = { status: 'signed-in', displayName: 'Alice' }
    const { stub, tick } = await mount(() => auth)
    expect(stub.nodes['#profile-identity']?.textContent).toBe('Alice')
    auth = { status: 'signed-out', displayName: null }
    await tick()
    const texts = Object.values(stub.nodes).map((node) => node.textContent)
    expect(texts.some((text) => text.includes('Alice'))).toBe(false)
    for (const label of stub.identityLabels) {
      expect(label.textContent).toContain('未就绪')
    }
  })

  it('keeps the signed-out surface honest about why nothing is shown', async () => {
    const { stub } = await mount(() => ({ status: 'signed-out', displayName: null }))
    await settle()
    expect(stub.nodes['#profile-status-note']?.textContent).toContain('未就绪')
    expect(stub.nodes['#login']?.hidden).toBe(false)
  })

  it('never lets the renderer hold its own identity source', () => {
    const script = sageScript()
    expect(script).not.toMatch(/localStorage|sessionStorage|document\.cookie/u)
    // A literal name in the script would be the shell self-reporting an identity.
    expect(script).not.toMatch(/displayName\s*[:=]\s*['"]/u)
  })
})
