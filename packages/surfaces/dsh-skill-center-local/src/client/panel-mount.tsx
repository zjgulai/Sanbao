/**
 * Extensions Hub (formerly Skill Center) panel mounting (browser half).
 *
 * Mounts the Extensions Hub into the main content area (center column)
 * while preserving the native sidebar intact and visible. Supports global
 * view-router switching (dsh:view-change) so that switching views or clicking
 * a chat session smoothly shows/hides the dashboard.
 */
import { createRoot, type Root } from 'react-dom/client'
import type { SkillApi } from './api.ts'
import { SkillPanel } from './SkillPanel.tsx'

/** Mounted panel controller: toggle/open/close plus the disposer. */
export interface SkillPanelMount {
  toggle: () => void
  open: () => void
  close: () => void
  isOpen: () => boolean
  subscribe: (listener: () => void) => () => void
  dispose: () => void
}

/**
 * Find the center content column of the DSH shell, or fallback to body.
 */
function findCenterHost(): HTMLElement {
  if (typeof document === 'undefined') return {} as HTMLElement
  const centerCol = document.querySelector<HTMLElement>('[class*="centerCol"]')
  if (centerCol !== null) {
    if (window.getComputedStyle(centerCol).position === 'static') {
      centerCol.style.position = 'relative'
    }
    return centerCol
  }
  return document.body
}

/**
 * Mount the Extensions Hub full-screen dashboard workspace.
 * @param api - the skill center API client.
 * @returns controller (toggle/open/close/subscribe) and the disposer.
 */
export function mountPanel(api: SkillApi): SkillPanelMount {
  let root: Root | undefined
  let container: HTMLDivElement | undefined
  const listeners = new Set<() => void>()

  const notify = (): void => { for (const listener of [...listeners]) listener() }

  const close = (): void => {
    if (root === undefined) return
    root.unmount()
    root = undefined
    container?.remove()
    container = undefined
    notify()
  }

  const open = (): void => {
    if (root !== undefined) return
    const host = findCenterHost()
    container = document.createElement('div')
    container.className = 'dsh-skill-center-root'
    container.dataset.dshSkillCenterView = ''
    container.dataset.dshPlugin = 'skill-center-local'
    container.dataset.dshPart = 'panel'
    host.appendChild(container)
    root = createRoot(container)
    root.render(
      <SkillPanel
        api={api}
        onClose={() => {
          close()
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dsh:view-change', { detail: { view: 'chat' } }))
          }
        }}
      />
    )
    notify()
  }

  const toggle = (): void => {
    if (root !== undefined) {
      close()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dsh:view-change', { detail: { view: 'chat' } }))
      }
    } else {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dsh:view-change', { detail: { view: 'extensions' } }))
      }
      open()
    }
  }

  // Subscribe to the global view change event
  let cleanupViewListener: (() => void) | undefined
  if (typeof window !== 'undefined') {
    const handleGlobalView = (e: Event): void => {
      const customEvent = e as CustomEvent<{ view?: string }>
      if (customEvent.detail?.view === 'extensions') {
        open()
      } else if (customEvent.detail?.view !== undefined && root !== undefined) {
        close()
      }
    }
    window.addEventListener('dsh:view-change', handleGlobalView)
    cleanupViewListener = () => window.removeEventListener('dsh:view-change', handleGlobalView)
  }

  return {
    toggle,
    open,
    close,
    isOpen: () => root !== undefined,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose: () => {
      cleanupViewListener?.()
      close()
      listeners.clear()
    },
  }
}
