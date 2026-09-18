/**
 * Sidebar entry injection — package-specific wiring over the shared core.
 *
 * The row uses `position: 'stacked'`: it sits **directly under** the official
 * New Session button as a second row of the same launch band, and the core marks
 * that button so this package's stylesheet restyles it into the matching nav row
 * (`newapp.module.css` owns both halves of the band — see its comment for the
 * evidence and the colour discipline). The DOM injection, the marker, the
 * self-healing and the idempotency all live in the shared
 * sidebar-entry-core.ts (synced copy) — this wrapper supplies only this
 * package's glyph, copy, CSS module, placement, and the drawer toggle.
 *
 * Why a second row rather than the previous 50/50 split: 「新会话」 and 「新应用」
 * are two ways to *start*, and the earlier design stated that by sharing one band
 * with two equal capsules. Measured against the reference products, the capsule
 * chrome was the outlier — none of them gives the start action button styling —
 * and doubling it also doubled a pre-existing mismatch (the official half
 * followed neutral button tokens, this half followed brand tokens). Two plain
 * nav rows sitting together in the launch band state the same relationship
 * without the chrome, and put the whole nav column on one axis.
 */
import { tt } from './panel-helpers.ts'
import css from './newapp.module.css'
import { mountSidebarEntry as mountSharedSidebarEntry } from './sidebar-entry-core.ts'

/** Stable data attribute identifying the injected entry row. */
export const ENTRY_SELECTOR = '[data-dsh-newapp-entry]'

/** Inline app-grid glyph normalized to the shell's 18px navigation size. */
const ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.8" y="1.8" width="5.4" height="5.4" rx="1.4"/><rect x="8.8" y="1.8" width="5.4" height="5.4" rx="1.4"/><rect x="1.8" y="8.8" width="5.4" height="5.4" rx="1.4"/><path d="M11.5 9.1v4.8M9.1 11.5h4.8"/></svg>'

/** Live signals the row mirrors. */
export interface SidebarEntrySignals {
  /** Whether the drawer is currently mounted. */
  isOpen(): boolean
  /** Subscribe to open/close transitions. */
  subscribe(listener: () => void): () => void
}

/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing on
 * later React re-renders.
 * @param onClick - toggles the application-matrix drawer.
 * @param signals - open-state provider.
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(onClick: () => void, signals: SidebarEntrySignals): () => void {
  return mountSharedSidebarEntry({
    rowAttribute: 'data-dsh-newapp-entry',
    rowSelector: ENTRY_SELECTOR,
    // L2 plugin id: makes the row carry data-dsh-plugin + data-dsh-part="sidebar-entry".
    plugin: 'newapp-local',
    icon: ICON,
    css,
    label: () => tt('entry.label'),
    tooltip: () => tt('entry.tooltip'),
    onToggle: onClick,
    position: 'stacked',
    view: 'applications',
    // Used by the shared core's family-block path and by the collapsed-rail
    // fallback: stacked mode places against the official button itself, but the
    // entry must still keep the same relative order as the sibling plugin rows.
    familySelectors: [
      '[data-dsh-taskboard-entry]',
      '[data-dsh-ssh-entry]',
      '[data-dsh-skill-center-entry]',
      '[data-dsh-role-matrix-entry]',
      '[data-dsh-newapp-entry]',
    ],
    active: {
      subscribe: (listener: () => void) => signals.subscribe(listener),
      isOpen: () => signals.isOpen(),
    },
  })
}
