/**
 * Browser-half entry for the New App launcher — runs inside the dsh web GUI.
 *
 * Registers the drawer's locale dictionaries and mounts two DOM surfaces: the
 * sidebar entry row (sharing the official New Session band, toggling the
 * drawer) and the application-matrix drawer itself. Failure policy: DOM
 * mounting problems are logged, never thrown — the web shell fails the whole
 * boot when a plugin apply throws, and an external plugin must not take the GUI
 * down.
 *
 * Export discipline (packages/client rule): the /client surface carries what
 * cordis loading needs plus types only — all value exports stay internal.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { NewAppApi } from './api.ts'
import { createLauncher } from './launcher.ts'
import { en, zh, type NewAppKey } from './locales.ts'
import { mountPanel } from './panel-mount.tsx'
import { ENTRY_SELECTOR, mountSidebarEntry } from './sidebar-entry.ts'

/** Locale namespace this plugin owns. */
const NS = 'dsh-newapp-local'

/** Attribute the degradation self-report is published on (`<html data-…>`). */
export const DEGRADED_ATTR = 'dshNewappDegraded'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** New App launcher copy. */
    'dsh-newapp-local': NewAppKey
  }
}

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'locale']

/** Type-only surface (export discipline: no value exports beyond the plugin contract). */
export type { NewAppPanelProps } from './NewAppPanel.tsx'
export type { NewAppKey } from './locales.ts'
export type { NewAppApi } from './api.ts'

/**
 * How long the entry row may stay unplaced before the plugin calls itself
 * degraded. A shell that has not rendered its sidebar within this window will
 * not render it at all on this page load (the sidebar is part of the first
 * paint), so waiting longer only delays the report.
 */
const PLACEMENT_DEADLINE_MS = 3000

/**
 * Grace granted the moment the document returns to the foreground: placement is
 * rAF-driven, so the row may legitimately land one frame after the window is
 * visible again. Judging inside this window is exactly the false positive this
 * module exists to avoid.
 */
const VISIBLE_GRACE_MS = 1200

/**
 * Publish (or clear) the entry-degradation flag on the document element.
 *
 * This is the one piece of ADR-0019 compliance that cannot live in the shared
 * core: the core knows *how* to place a row, only the consumer knows *whether
 * not placing it is a failure*. Without this, a shell whose New Session button
 * was renamed or restructured would leave the launcher silently absent — the
 * exact silent-degradation shape the anchor rule exists to prevent. A flag on
 * `<html>` is observable from the running app and from a browser probe, which a
 * `console.warn` alone is not.
 * @param reason - the degradation reason, or undefined to clear the flag.
 */
export function reportDegraded(reason: string | undefined): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (reason === undefined) delete root.dataset[DEGRADED_ATTR]
  else root.dataset[DEGRADED_ATTR] = reason
}

/**
 * Watch for a placement that never happened, then self-report.
 *
 * **「挂起 ≠ 失败」**: placement runs through `requestAnimationFrame`, and
 * Chromium freezes rAF while the document is hidden — display asleep, window
 * fully covered. Missing row at the deadline then means *suspended*, not
 * degraded: the row lands by itself once the window is visible again. Three
 * consequences, all of them load-bearing:
 *
 *   - while hidden the deadline neither reports nor re-arms (a timer polling a
 *     sleeping display is pure noise) — becoming visible re-arms with the
 *     shorter grace, since the rAF has not necessarily run yet;
 *   - a report already published must not outlive the condition that raised it:
 *     a late placement clears the flag (otherwise every probe reads a stale
 *     false alarm — the shape recorded in P-04);
 *   - a *visible* shell that never renders the button still shouts
 *     `entry-unavailable` at full volume (ADR-0019: the self-report must not go
 *     mute).
 * @param getDisposed - whether the plugin has since been disposed.
 * @returns a cancel function.
 */
function watchPlacement(getDisposed: () => boolean): () => void {
  let timer: number | undefined
  let settled = false
  let observer: MutationObserver | undefined

  const stop = (): void => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = undefined
    observer?.disconnect()
    observer = undefined
    document.removeEventListener('visibilitychange', onVisibility)
  }

  /** The row is on the page (late or not) — nothing left to report. */
  const settle = (): void => {
    settled = true
    reportDegraded(undefined)
    stop()
  }

  const arm = (delay: number): void => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = window.setTimeout(evaluate, delay)
  }

  const evaluate = (): void => {
    if (settled || getDisposed()) return
    if (document.querySelector(ENTRY_SELECTOR) !== null) {
      settle()
      return
    }
    if (document.hidden) return
    reportDegraded('entry-unavailable')
    console.warn(
      '[newapp-local] the sidebar New Session button was not found; the launcher row was not placed.'
      + ' This shell generation may have restructured the sidebar — the plugin does not pin class hashes (ADR-0019), so it degrades instead of guessing.',
    )
    // Keep watching: the flag must not outlive a placement that lands later.
    observer = new MutationObserver(() => {
      if (document.querySelector(ENTRY_SELECTOR) !== null) settle()
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }

  function onVisibility(): void {
    if (settled || getDisposed() || document.hidden) return
    arm(VISIBLE_GRACE_MS)
  }

  // `visibilitychange` is fired at the document (it does not bubble to window),
  // so the listener has to sit there — a window listener would never fire.
  document.addEventListener('visibilitychange', onVisibility)
  arm(PLACEMENT_DEADLINE_MS)
  return stop
}

/**
 * Mount the New App surfaces.
 * @param ctx - client root context (locale service).
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    try {
      return ctx.locale.register(NS, { zh, en })
    } catch {
      return () => {}
    }
  }, 'newapp-local: dictionaries')

  const api = new NewAppApi()
  // The launcher is built over the live client context so that a card's plan is
  // answered from *current* registries (`ctx.get(service)`) rather than from a
  // list captured when the drawer opened — an entry panel registered later must
  // light its card up without a reload.
  const panel = mountPanel(api, createLauncher(ctx))
  let disposed = false

  // Failure policy (see the module doc): a DOM mounting problem is logged and
  // swallowed, never thrown. `apply` runs during the shell's boot, so a throw
  // here takes the whole GUI down — an external plugin must never be able to do
  // that. The drawer still works through the entry row when mounting succeeds;
  // when it does not, the plugin is simply inert.
  ctx.effect(() => {
    try {
      return mountSidebarEntry(() => panel.toggle(), {
        isOpen: () => panel.isOpen(),
        subscribe: (listener: () => void) => panel.subscribe(listener),
      })
    } catch (error) {
      console.warn('[newapp-local] sidebar entry mount failed', error)
      reportDegraded('entry-mount-failed')
      return () => {}
    }
  }, 'newapp-local: sidebar entry')

  ctx.effect(() => {
    const cancel = watchPlacement(() => disposed)
    return () => {
      disposed = true
      cancel()
    }
  }, 'newapp-local: placement self-report')

  ctx.effect(() => () => panel.dispose(), 'newapp-local: drawer')
}
