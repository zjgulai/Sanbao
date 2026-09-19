/**
 * Shared sidebar entry injection core — copied from shared/client/sidebar-entry-core.ts
 *
 * This file is synced to each plugin via scripts/sync-shared.mjs. Edit the shared
 * source and re-run sync instead of editing a copy.
 *
 * For implementation details, see the original in:
 * /Users/lute/project/Magpie-Horch/shared/client/sidebar-entry-core.ts
 */

// ============================================================================
// Type Definitions (copied from shared)
// ============================================================================

export interface SidebarEntryOptions {
  rowAttribute: string
  rowSelector: string
  plugin?: string
  icon: string
  css: Record<string, string>
  label(): string
  tooltip?(): string
  onToggle(): void
  position: 'before' | 'after' | 'split' | 'stacked'
  familySelectors: readonly string[]
  view?: 'workbench' | 'applications' | 'extensions' | 'roles'
  active?: {
    subscribe(listener: () => void): () => void
    isOpen(): boolean
  }
}

export interface SidebarGroupOptions {
  groupAttribute: string
  groupSelector: string
  containerAttribute: string
  containerSelector: string
  storageKey?: string
  css: Record<string, string>
  label(): string
  tooltip?(): string
  position: 'before' | 'after' | 'stacked'
  familySelectors: readonly string[]
  memberSelectors: readonly string[]
}

// ============================================================================
// Implementation Placeholder
// ============================================================================

/**
 * Mount a sidebar entry using the shared core logic.
 * 
 * NOTE: This is a placeholder. The full implementation is in
 * shared/client/sidebar-entry-core.ts and should be imported there.
 * 
 * For now, we'll export a stub that will be replaced by the actual import
 * after the sync process is configured.
 */
export function mountSidebarEntry(options: SidebarEntryOptions): () => void {
  // TODO: Import from shared/client/sidebar-entry-core.ts
  // For P0 skeleton, this is a no-op stub
  console.warn('[dsh-right-sidebar] mountSidebarEntry: implementation pending sync from shared')
  return () => {}
}

export function mountSidebarGroup(options: SidebarGroupOptions): () => void {
  // TODO: Import from shared/client/sidebar-entry-core.ts
  console.warn('[dsh-right-sidebar] mountSidebarGroup: implementation pending sync from shared')
  return () => {}
}
