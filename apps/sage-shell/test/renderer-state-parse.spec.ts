import { describe, expect, it } from 'vitest'
import { renderSageDocument } from '../src/product/renderer.js'

/**
 * Parse-level regression for the embedded renderer script (final-review HIGH-1).
 *
 * The seam: extract the real `<script>` source from the served document and run it
 * against a minimal DOM/fetch stub. This drives the actual shipped refresh path —
 * no duplicated parse logic that could drift from the document.
 *
 * `new Function` here compiles only this repository's own rendered document source
 * (the object under test); the payload travels through the fetch stub, never into
 * the compiled body, so no untrusted value reaches code generation.
 */

interface StubElement {
  textContent: string
  hidden: boolean
  disabled: boolean
  tabIndex: number
  dataset: Record<string, string>
  toggles: Array<[string, boolean]>
  addEventListener: (type: string, handler: () => void) => void
  setAttribute: () => void
  classList: { toggle: (cls: string, on: boolean) => void }
}

function stubElement(dataset: Record<string, string> = {}): StubElement {
  const toggles: Array<[string, boolean]> = []
  return {
    textContent: '',
    hidden: false,
    disabled: false,
    tabIndex: 0,
    dataset,
    toggles,
    addEventListener: () => undefined,
    setAttribute: () => undefined,
    classList: { toggle: (cls: string, on: boolean) => { toggles.push([cls, on]) } },
  }
}

function createDocumentStub() {
  const title = stubElement()
  const message = stubElement()
  const retry = stubElement()
  const runtimeLabel = stubElement()
  const runtimeBadge = stubElement()
  const runtimeDot = stubElement()
  const navItem = stubElement({ view: 'overview' })
  const panel = stubElement({ panel: 'overview' })
  const document = {
    querySelector(selector: string): StubElement {
      if (selector === '#state-title') return title
      if (selector === '#state-message') return message
      if (selector === '#retry') return retry
      return stubElement()
    },
    querySelectorAll(selector: string): StubElement[] {
      if (selector === '[data-runtime-label]') return [runtimeLabel]
      if (selector === '[data-runtime-badge]') return [runtimeBadge]
      if (selector === '[data-runtime-dot]') return [runtimeDot]
      if (selector === '[data-view]') return [navItem]
      if (selector === '[data-panel]') return [panel]
      return []
    },
  }
  return { document, title, message, retry, runtimeLabel, runtimeDot }
}

async function runEmbeddedScript(statePayload: unknown) {
  const html = renderSageDocument()
  const script = html.match(/<script>([\s\S]*)<\/script>/u)?.[1]
  expect(script, 'embedded script must be extractable from the served document').toBeTruthy()
  const stubs = createDocumentStub()
  const fetchStub = async () => ({ ok: true, json: async () => statePayload })
  const run = new Function('document', 'fetch', script as string) as (d: unknown, f: unknown) => void
  run(stubs.document, fetchStub)
  // The script schedules refresh() as a microtask chain behind awaited fetch/json; flush both.
  await new Promise((resolve) => { setTimeout(resolve, 0) })
  await new Promise((resolve) => { setTimeout(resolve, 0) })
  return stubs
}

describe('Sage renderer embedded state parsing', () => {
  it('renders the nested { service, runtime } appservice state via its runtime field', async () => {
    const stubs = await runEmbeddedScript({
      service: { status: 'unavailable', reason: 'identity-unavailable', correlation: 'c-1' },
      runtime: { status: 'ready', message: 'Sage 已检测到能力运行时服务。', retryable: false },
    })

    expect(stubs.title.textContent).toBe('已就绪')
    expect(stubs.message.textContent).toBe('Sage 已检测到能力运行时服务。')
    expect(stubs.runtimeLabel.textContent).toBe('已就绪')
    expect(stubs.retry.hidden).toBe(true)
    expect(stubs.runtimeDot.toggles).toContainEqual(['is-ready', true])
    expect(stubs.runtimeDot.toggles).not.toContainEqual(['is-unavailable', true])
  })

  it('keeps rendering the flat P0-2 SageViewState shape (off-state regression)', async () => {
    const stubs = await runEmbeddedScript({
      status: 'unavailable',
      message: 'Sage 暂时未检测到能力运行时服务，可重新检查。',
      retryable: true,
    })

    expect(stubs.title.textContent).toBe('暂不可用')
    expect(stubs.message.textContent).toBe('Sage 暂时未检测到能力运行时服务，可重新检查。')
    expect(stubs.runtimeLabel.textContent).toBe('暂不可用')
    expect(stubs.retry.hidden).toBe(false)
    expect(stubs.runtimeDot.toggles).toContainEqual(['is-unavailable', true])
  })

  it('falls back when the nested state carries a null runtime (unavailable runtime projection)', async () => {
    const stubs = await runEmbeddedScript({
      service: { status: 'unavailable', reason: 'identity-unavailable', correlation: 'c-2' },
      runtime: null,
    })

    expect(stubs.title.textContent).toBe('暂不可用')
    expect(stubs.message.textContent).toBe('Sage 暂时无法读取受控状态，可稍后重新检查。')
    expect(stubs.retry.hidden).toBe(false)
    expect(stubs.runtimeDot.toggles).toContainEqual(['is-unavailable', true])
  })
})

/**
 * Retry POST path (WT-02D.0.2 D2): the retry response body is either the 0.2
 * CommandDenied shape `{code, retryable, ...}` or the legacy flat P0-2 shape
 * `{status, ...}`. Both must end up rendered.
 *
 * The harness captures the retry button's real click handler, drives it against a
 * fetch stub that answers POST with the action payload, and records one snapshot
 * per render() call (taken when `retry.hidden` is written — the last of the three
 * fields render touches). The GET state payload renders a distinct `ready` state
 * so a matching snapshot can only come from the retry response itself.
 */
interface RenderSnapshot {
  title: string
  message: string
  retryHidden: boolean
}

function createRetryDocumentStub() {
  const title = stubElement()
  const message = stubElement()
  const retryHandlers: Array<() => void | Promise<void>> = []
  const retryBase = stubElement()
  const renders: RenderSnapshot[] = []
  const retry: StubElement = {
    ...retryBase,
    addEventListener: (_type: string, handler: () => void) => { retryHandlers.push(handler) },
  }
  Object.defineProperty(retry, 'hidden', {
    enumerable: true,
    configurable: true,
    get: () => retryBase.hidden,
    set: (value: boolean) => {
      retryBase.hidden = value
      renders.push({ title: title.textContent, message: message.textContent, retryHidden: value })
    },
  })
  const runtimeLabel = stubElement()
  const runtimeBadge = stubElement()
  const runtimeDot = stubElement()
  const navItem = stubElement({ view: 'overview' })
  const panel = stubElement({ panel: 'overview' })
  const document = {
    querySelector(selector: string): StubElement {
      if (selector === '#state-title') return title
      if (selector === '#state-message') return message
      if (selector === '#retry') return retry
      return stubElement()
    },
    querySelectorAll(selector: string): StubElement[] {
      if (selector === '[data-runtime-label]') return [runtimeLabel]
      if (selector === '[data-runtime-badge]') return [runtimeBadge]
      if (selector === '[data-runtime-dot]') return [runtimeDot]
      if (selector === '[data-view]') return [navItem]
      if (selector === '[data-panel]') return [panel]
      return []
    },
  }
  return { document, renders, retryHandlers }
}

async function runEmbeddedRetryScript(actionPayload: unknown) {
  const html = renderSageDocument()
  const script = html.match(/<script>([\s\S]*)<\/script>/u)?.[1]
  expect(script, 'embedded script must be extractable from the served document').toBeTruthy()
  const harness = createRetryDocumentStub()
  const statePayload = { status: 'ready', message: '运行时已就绪。', retryable: false }
  const fetchStub = async (_path: unknown, init?: { readonly method?: string }) =>
    init?.method === 'POST'
      ? { ok: true, json: async () => actionPayload }
      : { ok: true, json: async () => statePayload }
  const run = new Function('document', 'fetch', script as string) as (d: unknown, f: unknown) => void
  run(harness.document, fetchStub)
  // The script schedules refresh() as a microtask chain behind awaited fetch/json; flush both.
  await new Promise((resolve) => { setTimeout(resolve, 0) })
  await new Promise((resolve) => { setTimeout(resolve, 0) })
  const handler = harness.retryHandlers[0]
  if (handler === undefined) throw new Error('retry click handler was not registered by the embedded script')
  await handler()
  // The post-retry refresh rides the same microtask chain; flush again so its render
  // lands in the history before the caller asserts (order-independent assertions).
  await new Promise((resolve) => { setTimeout(resolve, 0) })
  await new Promise((resolve) => { setTimeout(resolve, 0) })
  return harness
}

describe('Sage renderer retry response two-shape guard', () => {
  it('normalizes the CommandDenied shape into a renderable recovering state', async () => {
    const harness = await runEmbeddedRetryScript({
      code: 'identity-unavailable',
      stage: 'identity-policy',
      retryable: true,
      correlation: 'x',
    })

    expect(harness.renders).toContainEqual({
      title: '正在恢复',
      message: 'Sage 正在重新检查能力运行时服务。',
      retryHidden: false,
    })
  })

  it('keeps rendering the legacy flat P0-2 shape unchanged (off-state regression)', async () => {
    const harness = await runEmbeddedRetryScript({
      status: 'recovering',
      message: '正在恢复连接，请稍候。',
      retryable: false,
    })

    expect(harness.renders).toContainEqual({
      title: '正在恢复',
      message: '正在恢复连接，请稍候。',
      retryHidden: true,
    })
  })
})
