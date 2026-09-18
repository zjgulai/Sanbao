/**
 * Global view routing bus for DSH full-screen dashboard workspaces.
 *
 * Provides a lightweight, event-driven view switcher so the main content area
 * can switch smoothly between the native chat stream and full-screen dashboards
 * (Workbench, Applications, Extensions, Roles/Organizations) without disturbing
 * conversation states.
 */

export type DshViewType = 'chat' | 'workbench' | 'applications' | 'extensions' | 'roles'

export interface DshViewChangeEventDetail {
  view: DshViewType
  payload?: Record<string, unknown>
}

export const DSH_VIEW_CHANGE_EVENT = 'dsh:view-change'

/**
 * Navigate to a specific full-screen view or back to chat.
 */
export function navigateToView(view: DshViewType, payload?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<DshViewChangeEventDetail>(DSH_VIEW_CHANGE_EVENT, {
      detail: { view, payload },
    })
  )
}

/**
 * Subscribe to view change events.
 * Returns an unsubscribe disposer function.
 */
export function subscribeViewChange(callback: (detail: DshViewChangeEventDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<DshViewChangeEventDetail>
    if (customEvent.detail && customEvent.detail.view) {
      callback(customEvent.detail)
    }
  }
  window.addEventListener(DSH_VIEW_CHANGE_EVENT, handler)
  return () => {
    window.removeEventListener(DSH_VIEW_CHANGE_EVENT, handler)
  }
}
