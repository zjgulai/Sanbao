/**
 * Right sidebar entry injection — package-specific wiring over the shared core.
 *
 * Following the pattern of dsh-role-matrix-local and dsh-skill-center-local,
 * the sidebar entries are injected between the shell's New Session button and
 * the workspace browser. The DOM injection / self-healing / idempotency logic
 * lives in the shared sidebar-entry-core.ts (synced copy); this wrapper supplies
 * each module's icon, copy, CSS module, placement, and panel toggle.
 *
 * Each module is a standalone row that toggles its corresponding panel when clicked.
 * The rows use position: 'after' to stack under the official New Session button
 * and other capability entries.
 */

import { mountSidebarEntry as mountSharedSidebarEntry } from './sidebar-entry-core.ts'
import css from '../styles/right-sidebar.module.css'

// ============================================================================
// Module Icons (18px grid, normalized to shell's navigation size)
// ============================================================================

/** TODO Tasks - Checklist glyph */
const ICON_TODO = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5L7 8.5L13 2.5"/><path d="M3 12.5L7 6.5"/></svg>'

/** Environment Info - Globe/Branch glyph */
const ICON_ENV = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3"/><path d="M4.93 4.93l2.12 2.12m1.98-1.98l2.12 2.12M11.07 11.07l-2.12-2.12m-1.98 1.98l-2.12-2.12"/></svg>'

/** Skills & MCP - Lightning/Tool glyph */
const ICON_SKILLS = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2l-3 6h3l-2 6 3-6h-3z"/></svg>'

/** Web Search - Magnifying glass glyph */
const ICON_WEB = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="4.4"/><path d="M10.4 10.4L14 14"/></svg>'

/** Background Processes - Gear/Cog glyph */
const ICON_PROCS = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v2M8 11v2M3 8h2M11 8h2M4.93 4.93l1.41 1.41M9.66 9.66l1.41 1.41M4.93 11.07l1.41-1.41M9.66 6.34l1.41-1.41"/></svg>'

/** Outputs - Box/Package glyph */
const ICON_OUTPUTS = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 4.5l4.5-2.5 4.5 2.5v5l-4.5 2.5-4.5-2.5v-5z"/><path d="M8 7v5"/></svg>'

/** Sources - Book/Library glyph */
const ICON_SOURCES = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3h8v10H4z"/><path d="M4 3v10a2 2 0 002 2h6"/></svg>'

// ============================================================================
// Module Labels & Tooltips
// ============================================================================

interface ModuleConfig {
  id: string
  attribute: string
  selector: string
  icon: string
  label: () => string
  tooltip: () => string
  view?: string
}

const MODULES: ModuleConfig[] = [
  {
    id: 'todo',
    attribute: 'data-dsh-right-todo-entry',
    selector: '[data-dsh-right-todo-entry]',
    icon: ICON_TODO,
    label: () => '待办任务',
    tooltip: () => '查看和管理待办任务提醒',
    view: 'todo',
  },
  {
    id: 'env',
    attribute: 'data-dsh-right-env-entry',
    selector: '[data-dsh-right-env-entry]',
    icon: ICON_ENV,
    label: () => '环境信息',
    tooltip: () => 'Git 状态、分支对比和提交信息',
    view: 'environment',
  },
  {
    id: 'skills-mcp',
    attribute: 'data-dsh-right-skills-entry',
    selector: '[data-dsh-right-skills-entry]',
    icon: ICON_SKILLS,
    label: () => '技能和 MCP',
    tooltip: () => '管理技能和 MCP 服务',
    view: 'skills',
  },
  {
    id: 'web-search',
    attribute: 'data-dsh-right-web-entry',
    selector: '[data-dsh-right-web-entry]',
    icon: ICON_WEB,
    label: () => '网页查阅',
    tooltip: () => '浏览历史查阅记录',
    view: 'websearch',
  },
  {
    id: 'background-procs',
    attribute: 'data-dsh-right-procs-entry',
    selector: '[data-dsh-right-procs-entry]',
    icon: ICON_PROCS,
    label: () => '后台进程',
    tooltip: () => '监控后台运行进程',
    view: 'processes',
  },
  {
    id: 'outputs',
    attribute: 'data-dsh-right-outputs-entry',
    selector: '[data-dsh-right-outputs-entry]',
    icon: ICON_OUTPUTS,
    label: () => '产出',
    tooltip: () => '查看生成的文档和代码',
    view: 'outputs',
  },
  {
    id: 'sources',
    attribute: 'data-dsh-right-sources-entry',
    selector: '[data-dsh-right-sources-entry]',
    icon: ICON_SOURCES,
    label: () => '来源',
    tooltip: () => '引用素材和参考资料',
    view: 'sources',
  },
]

// ============================================================================
// Type Definitions
// ============================================================================

/** Signal interface for a single module's open state */
export interface ModuleSignal {
  isOpen(): boolean
  subscribe(listener: () => void): () => void
}

/** Signals map for all modules */
export interface SidebarSignalsMap {
  todo?: ModuleSignal
  env?: ModuleSignal
  skills?: ModuleSignal
  webSearch?: ModuleSignal
  backgroundProcs?: ModuleSignal
  outputs?: ModuleSignal
  sources?: ModuleSignal
}

// ============================================================================
// Mount Function
// ============================================================================

/**
 * Mount all sidebar entries for the right sidebar modules.
 * @param onClick - callback for opening a specific module's panel
 * @param signals - map of open-state providers for each module
 * @returns disposer removing all entries and their observers
 */
export function mountRightSidebarEntries(
  onClick: (moduleId: string) => void,
  signals: SidebarSignalsMap,
): () => void {
  const disposals: (() => void)[] = []

  for (const module of MODULES) {
    const signal = getModuleSignal(module.id, signals)
    if (!signal) continue

    const disposal = mountSharedSidebarEntry({
      rowAttribute: module.attribute,
      rowSelector: module.selector,
      plugin: `right-sidebar-${module.id}`,
      icon: module.icon,
      css,
      label: module.label,
      tooltip: module.tooltip,
      onToggle: () => onClick(module.id),
      position: 'after',
      view: module.view,
      familySelectors: MODULES.map((m) => m.selector),
      active: {
        subscribe: (listener: () => void) => signal.subscribe(listener),
        isOpen: () => signal.isOpen(),
      },
    })

    disposals.push(disposal)
  }

  return () => {
    for (const disposal of disposals) {
      disposal()
    }
  }
}

// Helper to safely get module signal
function getModuleSignal(moduleId: string, signals: SidebarSignalsMap): ModuleSignal | undefined {
  switch (moduleId) {
    case 'todo':
      return signals.todo
    case 'env':
      return signals.env
    case 'skills-mcp':
      return signals.skills
    case 'web-search':
      return signals.webSearch
    case 'background-procs':
      return signals.backgroundProcs
    case 'outputs':
      return signals.outputs
    case 'sources':
      return signals.sources
    default:
      return undefined
  }
}
