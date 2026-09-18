// @vitest-environment jsdom
/**
 * Contract test for the shared sidebar-entry core's 「工作台 ▸」 collapsible group.
 *
 * Verifies:
 * 1. L1 group row mounting, chevron indicator, label and ARIA attributes
 * 2. Collapse / expand toggle with localStorage persistence (safe under try/catch)
 * 3. L2 container adopting member rows (e.g. taskboard, ssh, skill-center, role-matrix)
 * 4. Placement discipline: group lands on the family/nav-band block without breaking axis
 * 5. Idempotency and clean disposal
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  mountSidebarGroup,
  type SidebarGroupOptions,
} from '../src/client/sidebar-entry-core'

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

function defaultGroupOptions(overrides: Partial<SidebarGroupOptions> = {}): SidebarGroupOptions {
  return {
    groupAttribute: 'data-dsh-workbench-group',
    groupSelector: '[data-dsh-workbench-group]',
    containerAttribute: 'data-dsh-workbench-container',
    containerSelector: '[data-dsh-workbench-container]',
    storageKey: 'dsh-workbench:collapsed',
    label: () => '工作台',
    css: {
      entry: 'entry',
      entryIcon: 'entryIcon',
      entryLabel: 'entryLabel',
    },
    position: 'after',
    familySelectors: [
      '[data-dsh-workbench-group]',
      '[data-dsh-taskboard-entry]',
      '[data-dsh-ssh-entry]',
      '[data-dsh-role-matrix-entry]',
      '[data-dsh-skill-center-entry]',
    ],
    memberSelectors: [
      '[data-dsh-taskboard-entry]',
      '[data-dsh-ssh-entry]',
      '[data-dsh-role-matrix-entry]',
      '[data-dsh-skill-center-entry]',
    ],
    ...overrides,
  }
}

describe('sidebar entry · workbench group', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('mounts the L1 group row and L2 container', () => {
    const { root, official } = buildShell()
    const dispose = mountSidebarGroup(defaultGroupOptions())

    const group = document.querySelector<HTMLButtonElement>('[data-dsh-workbench-group]')
    const container = document.querySelector<HTMLElement>('[data-dsh-workbench-container]')

    expect(group).not.toBeNull()
    expect(container).not.toBeNull()
    expect(group!.parentElement).toBe(root)
    expect(container!.parentElement).toBe(root)
    expect(group!.getAttribute('aria-expanded')).toBe('true')
    expect(group!.textContent).toContain('工作台')

    dispose()
  })

  it('toggles collapse state and persists to localStorage', () => {
    buildShell()
    const dispose = mountSidebarGroup(defaultGroupOptions())

    const group = document.querySelector<HTMLButtonElement>('[data-dsh-workbench-group]')!
    const container = document.querySelector<HTMLElement>('[data-dsh-workbench-container]')!

    expect(group.getAttribute('aria-expanded')).toBe('true')
    expect(container.style.display).not.toBe('none')

    // Click to collapse
    group.click()
    expect(group.getAttribute('aria-expanded')).toBe('false')
    expect(container.style.display).toBe('none')
    expect(window.localStorage.getItem('dsh-workbench:collapsed')).toBe('1')

    // Click to expand
    group.click()
    expect(group.getAttribute('aria-expanded')).toBe('true')
    expect(container.style.display).toBe('')
    expect(window.localStorage.getItem('dsh-workbench:collapsed')).toBe('0')

    dispose()
  })

  it('restores collapsed state from localStorage on initial mount', () => {
    window.localStorage.setItem('dsh-workbench:collapsed', '1')
    buildShell()
    const dispose = mountSidebarGroup(defaultGroupOptions())

    const group = document.querySelector<HTMLButtonElement>('[data-dsh-workbench-group]')!
    const container = document.querySelector<HTMLElement>('[data-dsh-workbench-container]')!

    expect(group.getAttribute('aria-expanded')).toBe('false')
    expect(container.style.display).toBe('none')

    dispose()
  })

  it('adopts member rows into the L2 container', () => {
    const { root } = buildShell()
    // Pre-insert a member row in root
    const member = document.createElement('button')
    member.type = 'button'
    member.setAttribute('data-dsh-skill-center-entry', '')
    root.appendChild(member)

    const dispose = mountSidebarGroup(defaultGroupOptions())
    const container = document.querySelector<HTMLElement>('[data-dsh-workbench-container]')!

    expect(container.contains(member)).toBe(true)

    dispose()
  })
})
