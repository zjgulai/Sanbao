import { expect } from 'vitest'

import { renderSageDocument } from '../../src/product/renderer.js'

/**
 * A small DOM stub that runs the shipped document's own `<script>` against a scripted state
 * payload. It implements exactly the members the renderer uses (children order, `textContent`
 * clearing children, `closest` / `querySelector` by data attribute) and nothing else.
 *
 * `new Function` compiles only this repository's own rendered document; the payload travels
 * through the fetch stub, never into the compiled body.
 */

export class FakeElement {
  readonly children: FakeElement[] = []
  parent: FakeElement | null = null
  readonly dataset: Record<string, string> = {}
  readonly attributes: Record<string, string> = {}
  className = ''
  id = ''
  type = ''
  value = ''
  title = ''
  text = ''
  disabled = false
  hidden = false
  tabIndex = 0
  readonly toggles: Array<[string, boolean]> = []
  readonly classList = { toggle: (cls: string, on: boolean): void => { this.toggles.push([cls, on]) } }
  readonly listeners: Record<string, Array<(event: { target?: unknown }) => void>> = {}

  constructor(readonly tagName: string) {}

  set textContent(value: string) {
    this.children.length = 0
    this.text = value
  }

  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join('')
  }

  get childElementCount(): number {
    return this.children.length
  }

  get previousElementSibling(): FakeElement | null {
    if (this.parent === null) return null
    const index = this.parent.children.indexOf(this)
    return index <= 0 ? null : this.parent.children[index - 1] ?? null
  }

  appendChild(child: FakeElement): FakeElement {
    child.parent = this
    this.children.push(child)
    return child
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
  }

  addEventListener(type: string, handler: (event: { target?: unknown }) => void): void {
    ;(this.listeners[type] ??= []).push(handler)
  }

  dispatch(type: string, event: { target?: unknown } = {}): void {
    for (const handler of this.listeners[type] ?? []) handler(event)
  }

  /** Ticket 033: focus restoration is observable — count the calls. */
  focusCount = 0
  focus(): void {
    this.focusCount += 1
  }

  /** Only the two data-attribute selector forms this document's script uses. */
  matches(selector: string): boolean {
    const dataKey = (attribute: string): string => attribute.replace(/^data-/u, '').replace(/-([a-z])/gu, (_m, letter: string) => letter.toUpperCase())
    const bare = /^\[([a-z-]+)\]$/u.exec(selector)
    if (bare !== null) return Object.hasOwn(this.dataset, dataKey(bare[1]!))
    const valued = /^\[([a-z-]+)="([^"]*)"\]$/u.exec(selector)
    if (valued !== null) return this.dataset[dataKey(valued[1]!)] === valued[2]
    return false
  }

  descendants(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()])
  }

  querySelector(selector: string): FakeElement | null {
    return this.descendants().find((node) => node.matches(selector)) ?? null
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.descendants().filter((node) => node.matches(selector))
  }

  closest(selector: string): FakeElement | null {
    return this.matches(selector) ? this : this.parent?.closest(selector) ?? null
  }
}

/** One `select` gate: the script appends `option` children and reads `.value`. */
export interface FakeSelect extends FakeElement {
  selected: string | null
}

export function createDocumentStub(): { document: Record<string, unknown>, node: (id: string) => FakeElement } {
  const byId = new Map<string, FakeElement>()
  const node = (id: string): FakeElement => {
    const existing = byId.get(id)
    if (existing !== undefined) return existing
    const created = new FakeElement('div')
    created.id = id
    byId.set(id, created)
    return created
  }
  const document = {
    querySelector(selector: string): FakeElement {
      if (selector.startsWith('#')) return node(selector.slice(1))
      if (selector.startsWith('.')) return new FakeElement('div')
      return new FakeElement('div')
    },
    querySelectorAll(): FakeElement[] {
      return []
    },
    createElement(tagName: string): FakeElement {
      return new FakeElement(tagName)
    },
  }
  return { document, node }
}

export interface SagePageHarness {
  /** The element the script looked up by id (created on demand). */
  readonly node: (id: string) => FakeElement
  /** Every POST body the page sent, in order. */
  readonly requests: Array<{ path: string, body: unknown }>
  /** Drive the document's own poll callback, then let its microtasks settle. */
  readonly refresh: () => Promise<void>
  readonly setPayload: (next: unknown) => void
  readonly settle: () => Promise<void>
}

/** Boot the shipped document against a scripted payload and return the handles a spec asserts on.
 *  `postResponses` answers specific POST paths with their own bodies (the state payload answers
 *  everything else); the card-prepare flow needs to read its own response, not the polled state.
 *  A value may also be a function `(requestBody) => response` when one path carries several
 *  actions (e.g. `/.sage/plans` answers prepare-step and execute-step differently). */
export async function bootSagePage(initial: unknown, postResponses: Record<string, unknown> = {}): Promise<SagePageHarness> {
  let payload = initial
  const requests: Array<{ path: string, body: unknown }> = []
  const { document, node } = createDocumentStub()
  const script = renderSageDocument().match(/<script>([\s\S]*)<\/script>/u)?.[1]
  expect(script, 'embedded script must be extractable').toBeTruthy()
  const fetchStub = async (path: string, init?: { body?: string }): Promise<unknown> => {
    const parsed = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined
    if (parsed !== undefined) requests.push({ path, body: parsed })
    const answer = Object.hasOwn(postResponses, path) ? postResponses[path] : payload
    const resolved = typeof answer === 'function' ? (answer as (request: unknown) => unknown)(parsed ?? null) : answer
    return { ok: true, json: async () => resolved }
  }
  let poll: (() => void) | undefined
  const run = new Function('document', 'fetch', 'setInterval', script as string)
  run(document, fetchStub, (callback: () => void) => { poll ??= callback; return 0 })
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  await settle()
  return {
    node,
    requests,
    settle,
    refresh: async () => { poll?.(); await settle() },
    setPayload: (next: unknown) => { payload = next },
  }
}

/** The state payload shape main serves, with per-test overrides. */
export function statePayload(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    service: { status: 'unavailable', reason: 'authenticated', correlation: 'c', auth: { status: 'signed-out', displayName: null }, command: null },
    runtime: null,
    matter: null,
    capability: null,
    modelConfig: null,
    workspaceAdoption: null,
    workspaces: null,
    workspaceMutation: null,
    fileCandidates: null,
    fileReferences: [],
    fileReferenceUse: null,
    ...overrides,
  }
}
