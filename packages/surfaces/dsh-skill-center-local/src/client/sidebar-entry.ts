/**
 * Sidebar entry injection — package-specific wiring over the shared core.
 *
 * dsh's sidebar shell exposes no slot an external plugin can register into,
 * so — following the task-board / dsh-ssh precedent of DOM-level extension —
 * the entry row is injected between the shell's New Session button and the
 * workspace browser. The DOM injection / self-healing / idempotency logic
 * lives exactly once in shared/client/sidebar-entry-core.ts (synced copy);
 * this wrapper supplies the skill-center icon, copy, CSS module, and the
 * panel toggle. The row is plain DOM (no React tree); clicking it toggles
 * the skill center panel (see SkillPanel.tsx).
 */
import { tt } from './panel-helpers.ts'
import css from './skill-panel.module.css'
import {
  mountSidebarEntry as mountSharedSidebarEntry,
  mountSidebarGroup,
} from './sidebar-entry-core.ts'

/** Stable data attribute identifying the injected entry row. */
export const ENTRY_SELECTOR = '[data-dsh-skill-center-entry]'

/** Stable attribute identifying the Workbench group row. */
export const WORKBENCH_GROUP_SELECTOR = '[data-dsh-workbench-group]'

/** Inline toolbox icon normalized to the shell's 18px navigation glyph size. */
const ICON = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.2 4.6 4.9 2.3a1.6 1.6 0 0 0-2.3 0l-.3.3a1.6 1.6 0 0 0 0 2.3l2.3 2.3a1.6 1.6 0 0 0 2.3 0l.3-.3a1.6 1.6 0 0 0 0-2.3z"/><path d="m7.9 5.3 3.4-3.4a2.3 2.3 0 0 1 3.3 0l.5.5a2.3 2.3 0 0 1 0 3.3L11.7 9a2.3 2.3 0 0 1-3.3 0l-.5-.5a2.3 2.3 0 0 1 0-3.3z"/><path d="M11.2 8.6 9.9 9.9a1.6 1.6 0 0 1-2.3 0l-2.2-2.2a1.6 1.6 0 0 1 0-2.3L6.7 4.1"/><path d="M10.6 13.4H3.8a1.4 1.4 0 0 1-1.4-1.4V5.3"/></svg>'

/**
 * Mount the Workbench collapsible group (ADR-0125 D4).
 * Idempotently creates the L1 group row and L2 container for capability entries.
 */
export function mountWorkbenchGroup(): () => void {
  return mountSidebarGroup({
    groupAttribute: 'data-dsh-workbench-group',
    groupSelector: WORKBENCH_GROUP_SELECTOR,
    containerAttribute: 'data-dsh-workbench-container',
    containerSelector: '[data-dsh-workbench-container]',
    storageKey: 'dsh-workbench:collapsed',
    label: () => tt('workbench.group.label'),
    tooltip: () => tt('workbench.group.tooltip'),
    css,
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
  })
}

/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing
 * on later React re-renders.
 * @param onClick - opens the skill center panel.
 * @param totalProvider - optional live total-skill count for the badge.
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(onClick: () => void, totalProvider?: () => number | undefined): () => void {
  const disposeGroup = mountWorkbenchGroup()
  const dispose = mountSharedSidebarEntry({
    rowAttribute: 'data-dsh-skill-center-entry',
    rowSelector: ENTRY_SELECTOR,
    // L2 plugin id: makes the row carry data-dsh-plugin + data-dsh-part="sidebar-entry".
    plugin: 'skill-center-local',
    icon: ICON,
    css,
    label: () => tt('entry.label'),
    tooltip: () => tt('entry.tooltip'),
    onToggle: onClick,
    position: 'after',
    view: 'extensions',
    // 家族清单**必须与同族的其他注入行对称**，否则注入顺序由落位竞态决定。
    // 2026-09-13 实测：本清单此前缺少岗位矩阵，而共享核心 `'after'` 的锚点是
    // 「家族里最后一个成员之后」——家族为空时退化为 `base.nextElementSibling`，
    // 于是技能中心无论谁先挂载都插到家族块**最上面**，把岗位矩阵挤到下面。
    // 补上岗位矩阵后两个挂载顺序收敛到同一结果（岗位矩阵在上）。
    // 同族的岗位矩阵清单里也**不再**包含技能中心：它据此锚定在自己该在的位置，
    // 而不是反过来把技能中心当参照。两份清单有意做成不对称，这就是顺序的声明处。
    familySelectors: [
      '[data-dsh-taskboard-entry]',
      '[data-dsh-ssh-entry]',
      '[data-dsh-role-matrix-entry]',
      '[data-dsh-skill-center-entry]',
    ],
  })

  // Live total-count badge: rendered inside the injected row, updated when
  // the provider yields a number (first list load). Missing/unavailable
  // counts simply leave the row badge-free.
  if (totalProvider !== undefined) {
    let badge: HTMLSpanElement | undefined
    const sync = (): void => {
      const total = totalProvider()
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
      dispose()
      disposeGroup()
      window.clearInterval(timer)
      badge?.remove()
    }
  }
  return () => {
    dispose()
    disposeGroup()
  }
}
