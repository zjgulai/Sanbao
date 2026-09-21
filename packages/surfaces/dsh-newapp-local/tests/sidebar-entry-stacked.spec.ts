// @vitest-environment jsdom
/**
 * Package-level wiring for the stacked sidebar entry, plus the degradation
 * self-report.
 *
 * This is deliberately **not** a copy of the shared core's geometry suite (that
 * contract is pinned once, by the core's own consumer test — duplicating it per
 * package is how a shared layer starts to look like three independent
 * implementations). What is under test here is the part that is genuinely this
 * package's: that its wrapper really reaches the core in `stacked` mode with this
 * package's identity attributes, and that a shell which does not render the
 * expected button is *reported* rather than silently unserved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEGRADED_ATTR, apply, reportDegraded } from '../src/client/index.ts'
import { ENTRY_SELECTOR, mountSidebarEntry } from '../src/client/sidebar-entry.ts'

/** Build the shell's sidebar skeleton: column > root > [logoRow, newSession, regionArea]. */
function buildShell(): { root: HTMLElement; official: HTMLButtonElement } {
  document.body.innerHTML = ''
  const column = document.createElement('div')
  column.setAttribute('data-pane', 'sidebar')
  const root = document.createElement('div')
  root.className = 'x-Wl6W_root'
  const logoRow = document.createElement('div')
  logoRow.className = 'x-Wl6W_logoRow'
  const official = document.createElement('button')
  official.type = 'button'
  official.className = 'x-Wl6W_newSession'
  // Inline so jsdom's getComputedStyle reports it; the real value comes from
  // the shell's stylesheet (`.newSession { margin: 0 2px 8px }`).
  official.style.marginBottom = '8px'
  const region = document.createElement('div')
  region.className = 'x-Wl6W_regionArea'
  root.append(logoRow, official, region)
  column.append(root)
  document.body.append(column)
  return { root, official }
}

/** Stub the official button's rendered box (jsdom measures everything as 0). */
function stubRect(el: HTMLElement, width: number, height: number): void {
  el.getBoundingClientRect = () => ({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0,
    toJSON: () => ({}),
  }) as DOMRect
}

/** A client root context that records effect callbacks so they can be disposed. */
function fakeClientContext(): { ctx: unknown; disposers: Array<() => void>; registered: unknown[] } {
  const disposers: Array<() => void> = []
  const registered: unknown[] = []
  const ctx = {
    effect: (fn: () => unknown) => {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose as () => void)
      return dispose
    },
    locale: {
      register: (ns: string, dicts: unknown) => {
        registered.push([ns, dicts])
        return () => {}
      },
    },
  }
  appliedDisposers.push(() => {
    for (const disposeEffect of disposers) disposeEffect()
  })
  return { ctx, disposers, registered }
}

/** Effects registered by the last `apply()` call, disposed after each test.
 *  The plugin installs document-level listeners and observers; leaving them
 *  attached leaks state into the next test (and keeps the runner busy). */
let appliedDisposers: Array<() => void> = []

beforeEach(() => {
  reportDegraded(undefined)
})

afterEach(() => {
  for (const disposeEffect of appliedDisposers) disposeEffect()
  appliedDisposers = []
  vi.useRealTimers()
  document.body.innerHTML = ''
  reportDegraded(undefined)
  delete (document as { hidden?: boolean }).hidden
})

/**
 * jsdom's `document.hidden` is a read-only accessor; override it per test.
 * The placement path is rAF-driven and Chromium freezes rAF while the window is
 * not visible (display asleep, window fully covered), so "hidden" must be
 * expressible in the suite.
 */
function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
}

/** Bring the document back to the foreground the way the browser does. */
function showDocument(): void {
  setHidden(false)
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('stacked entry wiring', () => {
  it('mounts the row in stacked mode with this package’s identity attributes', () => {
    const { root, official } = buildShell()
    stubRect(official, 240, 38)

    const dispose = mountSidebarEntry(() => {}, { isOpen: () => false, subscribe: () => () => {} })
    const entry = document.querySelector<HTMLButtonElement>(ENTRY_SELECTOR)

    expect(entry).not.toBeNull()
    // Placement: the stacked mode's defining property — the row is the official
    // button's immediate next sibling, not a member of the family block.
    expect(entry!.previousElementSibling).toBe(official)
    expect(entry!.parentElement).toBe(root)
    // Geometry/marker applied: official gets marker, entry takes expanded state.
    expect(official.dataset.luteNavrow).toBe('')
    expect(entry!.dataset.split).toBe('expanded')
    // Identity: L2 semantic attributes + the localized label this package owns.
    expect(entry!.getAttribute('data-dsh-plugin')).toBe('newapp-local')
    expect(entry!.getAttribute('data-dsh-part')).toBe('sidebar-entry')
    expect(entry!.textContent).toContain('新应用')

    dispose()
  })

  it('toggles the drawer on click and reflects the open state on the row', () => {
    const { official } = buildShell()
    stubRect(official, 240, 38)
    let open = false
    const listeners = new Set<() => void>()
    const onClick = vi.fn(() => {
      open = !open
      for (const listener of listeners) listener()
    })

    const dispose = mountSidebarEntry(onClick, {
      isOpen: () => open,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    })
    const entry = document.querySelector<HTMLButtonElement>(ENTRY_SELECTOR)!

    expect(entry.dataset.active).toBeUndefined()
    entry.click()
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(entry.dataset.active).toBe('true')

    dispose()
  })

  it('restores the official button’s own marker on unmount', () => {
    const { official } = buildShell()
    stubRect(official, 240, 38)

    const dispose = mountSidebarEntry(() => {}, { isOpen: () => false, subscribe: () => () => {} })
    expect(official.dataset.luteNavrow).toBe('')

    dispose()

    expect(official.dataset.luteNavrow).toBeUndefined()
    expect(document.querySelector(ENTRY_SELECTOR)).toBeNull()
  })

  it('never mounts a second row when mounted twice (idempotent)', () => {
    const { official } = buildShell()
    stubRect(official, 240, 38)

    const a = mountSidebarEntry(() => {}, { isOpen: () => false, subscribe: () => () => {} })
    const b = mountSidebarEntry(() => {}, { isOpen: () => false, subscribe: () => () => {} })

    expect(document.querySelectorAll(ENTRY_SELECTOR).length).toBe(1)
    a()
    b()
  })
})

describe('degradation self-report', () => {
  it('publishes and clears the flag on the document element', () => {
    expect(document.documentElement.dataset[DEGRADED_ATTR]).toBeUndefined()
    reportDegraded('entry-unavailable')
    expect(document.documentElement.dataset[DEGRADED_ATTR]).toBe('entry-unavailable')
    reportDegraded(undefined)
    expect(document.documentElement.dataset[DEGRADED_ATTR]).toBeUndefined()
  })

  it('is observable through the same data-* surface the rest of the family uses', () => {
    reportDegraded('entry-mount-failed')
    expect(document.documentElement.getAttribute('data-dsh-newapp-degraded')).toBe('entry-mount-failed')
  })

  // The three cases below are the 「挂起 ≠ 失败」 contract: placement is rAF-driven and
  // Chromium freezes rAF while the document is hidden, so a missing row at the
  // deadline means "suspended" whenever the document is hidden — and the flag must
  // never outlive the condition that raised it.

  it('stays silent while the document is hidden (suspended, not degraded)', async () => {
    vi.useFakeTimers()
    setHidden(true)
    const { ctx } = fakeClientContext()
    document.body.innerHTML = ''

    apply(ctx as never)
    await vi.advanceTimersByTimeAsync(4000)

    expect(document.documentElement.dataset[DEGRADED_ATTR]).toBeUndefined()
  })

  it('gives the restored visibility a grace period before judging, then reports a real restructure', async () => {
    vi.useFakeTimers()
    setHidden(true)
    const { ctx } = fakeClientContext()
    document.body.innerHTML = ''

    apply(ctx as never)
    await vi.advanceTimersByTimeAsync(4000)
    showDocument()

    // Still inside the grace period: the restored rAF has not necessarily run yet.
    await vi.advanceTimersByTimeAsync(200)
    expect(document.documentElement.dataset[DEGRADED_ATTR]).toBeUndefined()

    // Grace elapsed and the shell really did not render the expected row: shout.
    await vi.advanceTimersByTimeAsync(2000)
    expect(document.documentElement.dataset[DEGRADED_ATTR]).toBe('entry-unavailable')
  })

  it('clears a flag it already raised once a late placement lands', async () => {
    vi.useFakeTimers()
    const { ctx } = fakeClientContext()
    document.body.innerHTML = ''

    apply(ctx as never)
    await vi.advanceTimersByTimeAsync(4000)
    expect(document.documentElement.dataset[DEGRADED_ATTR]).toBe('entry-unavailable')

    // The sidebar shows up late (slow boot, or the window was restored) and the
    // row is placed — the stale report must not survive it.
    const { official } = buildShell()
    stubRect(official, 240, 38)
    await vi.advanceTimersByTimeAsync(4000)

    expect(document.querySelector(ENTRY_SELECTOR)).not.toBeNull()
    expect(document.documentElement.dataset[DEGRADED_ATTR]).toBeUndefined()
  })
})

describe('client apply failure policy', () => {
  it('registers its dictionaries and does not throw when the shell never renders', () => {
    vi.useFakeTimers()
    const { ctx, registered } = fakeClientContext()
    document.body.innerHTML = ''

    expect(() => { apply(ctx as never) }).not.toThrow()
    expect(registered).toEqual([['dsh-newapp-local', expect.objectContaining({ zh: expect.anything() })]])

    // Past the placement deadline with no sidebar at all, the plugin says so
    // instead of being silently absent.
    vi.advanceTimersByTime(4000)
    expect(document.documentElement.dataset[DEGRADED_ATTR]).toBe('entry-unavailable')
  })

  it('clears the flag when the shell does render the expected row', () => {
    vi.useFakeTimers()
    const { official } = buildShell()
    stubRect(official, 240, 38)
    const { ctx } = fakeClientContext()

    apply(ctx as never)
    reportDegraded('stale-from-an-earlier-attempt')
    vi.advanceTimersByTime(4000)

    expect(document.documentElement.dataset[DEGRADED_ATTR]).toBeUndefined()
  })

  it('disposal cancels the pending self-report', () => {
    vi.useFakeTimers()
    const { ctx, disposers } = fakeClientContext()
    document.body.innerHTML = ''

    apply(ctx as never)
    for (const disposeEffect of disposers) disposeEffect()
    vi.advanceTimersByTime(4000)

    expect(document.documentElement.dataset[DEGRADED_ATTR]).toBeUndefined()
  })
})
