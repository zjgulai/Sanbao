// @vitest-environment jsdom
/**
 * Contract test for the shared sidebar-entry core's `stacked` placement.
 *
 * The core no longer imposes any layout: it places the entry as the official
 * button's immediate next sibling (the shell's sidebar root is a flex column, so
 * the row stacks naturally and stretches to the same content box) and writes one
 * marker attribute that the owning package's stylesheet keys on. What is under
 * test here is therefore *which attribute the core writes in which shell state* —
 * jsdom performs no layout, so the shell's rendered width is supplied.
 *
 * Real-browser geometry (both rows on the native nav-row axis, the launch band's
 * height and the region below it) is asserted separately by the product-level
 * probe: packages/surfaces/dsh-newapp-local/scripts/geometry-probe.mjs.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  applyStackedGeometry,
  mountSidebarEntry,
  STACKED_COLLAPSED_LIMIT,
  type SidebarEntryOptions,
} from '../src/client/sidebar-entry-core'

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

function options(overrides: Partial<SidebarEntryOptions> = {}): SidebarEntryOptions {
  return {
    rowAttribute: 'data-dsh-newapp-entry',
    rowSelector: '[data-dsh-newapp-entry]',
    icon: '<svg width="16" height="16"></svg>',
    css: { entry: 'entry', entryIcon: 'entryIcon', entryLabel: 'entryLabel' },
    label: () => '新应用',
    onToggle: () => {},
    position: 'stacked',
    familySelectors: ['[data-dsh-newapp-entry]'],
    ...overrides,
  }
}

describe('sidebar entry · stacked placement geometry', () => {
  let shell: { root: HTMLElement; official: HTMLButtonElement }
  let entry: HTMLButtonElement

  beforeEach(() => {
    shell = buildShell()
    entry = document.createElement('button')
  })

  it('marks the official button so the row stylesheet reaches it', () => {
    stubRect(shell.official, 240, 38)

    applyStackedGeometry(shell.official, entry)

    expect(shell.official.dataset.luteNavrow).toBe('')
    expect(entry.dataset.split).toBe('expanded')
  })

  it('imposes no layout on the official button (the marker is the whole contract)', () => {
    stubRect(shell.official, 240, 38)

    applyStackedGeometry(shell.official, entry)

    // The previous design wrote inline width/align-self/negative margin here and
    // had to undo each of them on unmount. Nothing is written now, so nothing
    // can be leaked: the flex column does the stacking.
    expect(shell.official.style.cssText).toBe('')
    expect(entry.style.cssText).toBe('')
  })

  it('drops the marker in the collapsed rail (36px icon button)', () => {
    stubRect(shell.official, 36, 36)

    applyStackedGeometry(shell.official, entry)

    // The rail has no room for a label and the shell already styles its own
    // collapsed button: the row stylesheet must not apply at all.
    expect(shell.official.dataset.luteNavrow).toBeUndefined()
    expect(entry.dataset.split).toBe('collapsed')
  })

  it('leaves both untouched before the shell has laid out (width 0)', () => {
    stubRect(shell.official, 0, 0)

    applyStackedGeometry(shell.official, entry)

    expect(shell.official.dataset.luteNavrow).toBeUndefined()
    expect(entry.dataset.split).toBeUndefined()
  })

  it('treats the collapsed threshold as exclusive of the expanded button', () => {
    stubRect(shell.official, STACKED_COLLAPSED_LIMIT, 36)
    applyStackedGeometry(shell.official, entry)
    expect(entry.dataset.split).toBe('expanded')

    stubRect(shell.official, STACKED_COLLAPSED_LIMIT - 1, 36)
    applyStackedGeometry(shell.official, entry)
    expect(entry.dataset.split).toBe('collapsed')
  })

  it('re-deletes the marker when a resize collapses the rail', () => {
    stubRect(shell.official, 240, 38)
    applyStackedGeometry(shell.official, entry)
    expect(shell.official.dataset.luteNavrow).toBe('')

    stubRect(shell.official, 36, 36)
    applyStackedGeometry(shell.official, entry)

    expect(shell.official.dataset.luteNavrow).toBeUndefined()
    expect(entry.dataset.split).toBe('collapsed')
  })
})

describe('sidebar entry · stacked placement wiring', () => {
  it('inserts the entry as the official button\'s immediate next sibling', () => {
    const { root, official } = buildShell()
    stubRect(official, 240, 38)

    const dispose = mountSidebarEntry(options())

    const entry = document.querySelector<HTMLButtonElement>('[data-dsh-newapp-entry]')
    expect(entry).not.toBeNull()
    // Immediate sibling matters: the row must land in the launch band itself,
    // not after the sibling plugin rows below it.
    expect(entry!.previousElementSibling).toBe(official)
    expect(entry!.parentElement).toBe(root)
    // The official button keeps its identity and gets only the marker.
    expect(root.querySelector('button[class*="newSession"]')).toBe(official)
    expect(official.dataset.luteNavrow).toBe('')

    dispose()
  })

  it('restores the shell\'s own button on unmount', () => {
    const { official } = buildShell()
    stubRect(official, 240, 38)

    const dispose = mountSidebarEntry(options())
    expect(official.dataset.luteNavrow).toBe('')

    dispose()

    expect(official.dataset.luteNavrow).toBeUndefined()
    expect(official.style.cssText).toBe('')
    expect(document.querySelector('[data-dsh-newapp-entry]')).toBeNull()
  })

  it('never mounts a second row when called twice (idempotent)', () => {
    const { official } = buildShell()
    stubRect(official, 240, 38)

    const disposeA = mountSidebarEntry(options())
    const disposeB = mountSidebarEntry(options())

    expect(document.querySelectorAll('[data-dsh-newapp-entry]').length).toBe(1)
    disposeA()
    disposeB()
  })
})
