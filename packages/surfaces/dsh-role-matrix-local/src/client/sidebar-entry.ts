/**
 * Sidebar entry injection — package-specific wiring over the shared core.
 *
 * dsh's sidebar shell exposes no slot an external plugin can register into, so
 * — following the skill-center / task-board precedent of DOM-level extension —
 * the entry row is injected between the shell's New Session button and the
 * workspace browser. The DOM injection / self-healing / idempotency logic lives
 * exactly once in the shared sidebar-entry-core.ts (synced copy); this wrapper
 * supplies the role-matrix icon, copy, CSS module, and the panel toggle. The
 * row is plain DOM (no React tree) so it can never disturb the shell's
 * reconciliation; the panel it toggles is a separate React root.
 */
import { tt } from './panel-helpers.ts'
import css from './role-matrix.module.css'
import { mountSidebarEntry as mountSharedSidebarEntry } from './sidebar-entry-core.ts'

/** Stable data attribute identifying the injected entry row. */
export const ENTRY_SELECTOR = '[data-dsh-role-matrix-entry]'

/** Inline 4-quadrant grid glyph normalized to the shell's 18px navigation size. */
const ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.7" y="1.7" width="5.2" height="5.2" rx="1.3"/><rect x="9.1" y="1.7" width="5.2" height="5.2" rx="1.3"/><rect x="1.7" y="9.1" width="5.2" height="5.2" rx="1.3"/><rect x="9.1" y="9.1" width="5.2" height="5.2" rx="1.3"/></svg>'

/** Live signals the row mirrors (open state + role total). */
export interface SidebarEntrySignals {
  /** Whether the panel is currently mounted. */
  isOpen(): boolean
  /** Subscribe to open/close transitions. */
  subscribe(listener: () => void): () => void
  /** Live role count, or undefined until the first list load. */
  total(): number | undefined
}

/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing on
 * later React re-renders.
 * @param onClick - toggles the role matrix panel.
 * @param signals - open-state + role-count providers.
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(onClick: () => void, signals: SidebarEntrySignals): () => void {
  const dispose = mountSharedSidebarEntry({
    rowAttribute: 'data-dsh-role-matrix-entry',
    rowSelector: ENTRY_SELECTOR,
    // L2 plugin id: makes the row carry data-dsh-plugin + data-dsh-part="sidebar-entry".
    plugin: 'role-matrix-local',
    icon: ICON,
    css,
    label: () => tt('entry.label'),
    tooltip: () => tt('entry.tooltip'),
    onToggle: onClick,
    position: 'after',
    // 本清单**有意不含技能中心**（与技能中心那份不对称，这一对不对称就是顺序的声明处）。
    // 共享核心 `'after'` 的锚点是「家族里最后一个成员之后」，所以：
    //   · 本行把技能中心当家族成员 → 技能中心一旦在位，岗位矩阵就锚到它后面 → 被挤到下面；
    //   · 技能中心把本行当家族成员 → 它锚到本行后面 → 本行保持在上。
    // 2026-09-13 实测（AX 几何 y）：改前技能中心 233 / 岗位矩阵 271（顺序反了），
    // 改后应为岗位矩阵在上。两个挂载顺序都收敛到同一结果，不再由落位竞态决定。
    familySelectors: [
      '[data-dsh-taskboard-entry]',
      '[data-dsh-ssh-entry]',
      '[data-dsh-role-matrix-entry]',
    ],
    active: {
      subscribe: (listener: () => void) => signals.subscribe(listener),
      isOpen: () => signals.isOpen(),
    },
  })

  // Live role-count badge: rendered inside the injected row, updated when the
  // provider yields a number (first list load). Missing counts simply leave the
  // row badge-free.
  let badge: HTMLSpanElement | undefined
  const sync = (): void => {
    const total = signals.total()
    const entry = document.querySelector<HTMLButtonElement>(ENTRY_SELECTOR)
    if (entry === null) return
    if (typeof total === 'number' && total > 0) {
      if (badge === undefined || !badge.isConnected) {
        badge = document.createElement('span')
        badge.className = css['entryBadge'] ?? ''
        badge.dataset.dshPart = 'entry-badge'
        entry.appendChild(badge)
      }
      badge.textContent = total > 99 ? '99+' : String(total)
      badge.title = tt('panel.title')
    } else if (badge !== undefined) {
      badge.remove()
      badge = undefined
    }
  }
  sync()
  const timer = window.setInterval(sync, 5000)
  return () => {
    window.clearInterval(timer)
    dispose()
  }
}
