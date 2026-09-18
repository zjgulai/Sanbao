/**
 * Shared sidebar entry injection core.
 *
 * dsh's sidebar shell exposes no slot an external plugin can register into,
 * so the entry row is injected between the shell's New Session button and the
 * workspace browser. The injection self-heals: a MutationObserver watches the
 * sidebar root and re-inserts the row whenever a React re-render displaces it
 * (re-insertion happens in the same frame, before paint, so no flicker).
 *
 * The row is plain DOM (no React tree) so it can never disturb the shell's
 * reconciliation; the view it toggles is a separate root owned by the caller.
 *
 * Packages receive this file as a generated copy via scripts/sync-shared.mjs;
 * edit the shared source and re-run the sync instead of editing a copy.
 */

/** Per-package configuration for one sidebar entry row. */
export interface SidebarEntryOptions {
  /** Full attribute name identifying the injected row (idempotency key), e.g. 'data-dsh-ssh-entry'. */
  rowAttribute: string
  /** CSS selector matching the injected row, e.g. '[data-dsh-ssh-entry]'. */
  rowSelector: string
  /**
   * L2 semantic-attribute plugin id (issue #506, enum table:
   * skins/skin-center/contracts/semantic-attrs-v1.md). When set, the row also
   * outputs data-dsh-plugin="<id>" and data-dsh-part="sidebar-entry"; unset
   * leaves the row without semantic attributes.
   */
  plugin?: string
  /** Inline icon markup (matches the shell's 16px nav-icon look). */
  icon: string
  /** CSS module class names for the row and its two spans (entry / entryIcon / entryLabel). */
  css: Record<string, string>
  /** Localized row label (aria-label + visible text). */
  label(): string
  /** Optional localized tooltip (title attribute). */
  tooltip?(): string
  /** Click action (open/toggle the owning panel). */
  onToggle(): void
  /**
   * Row placement:
   *   - `'before'` — insert ahead of the sibling plugin rows (family block);
   *   - `'after'` — insert behind them;
   *   - `'split'` — sit **beside** the official New Session button, sharing
   *     its row 50/50. See {@link applySplitGeometry} for why that is done with
   *     inline styles instead of a stylesheet rule. Optional mode restored by
   *     ADR-0125 D3: no managed host uses it today, and a host adopting it must
   *     first extend the sidebar-row-axis gate to cover both band forms.
   *   - `'stacked'` — sit **directly under** the official New Session button as
   *     a second row of the same nav band. See {@link applyStackedGeometry} for
   *     what the core does (and deliberately does not do) to the official
   *     button; the row form itself comes from the package stylesheet.
   */
  position: 'before' | 'after' | 'split' | 'stacked'
  /**
   * Selectors of the sibling plugin entry rows this package orders against
   * (its own row included — the placement guard excludes a row that is
   * already inside the root). Each package passes the same list it used
   * before the consolidation so the rendered order stays stable.
   */
  familySelectors: readonly string[]
  /** Optional full-screen dashboard view id this entry corresponds to. */
  view?: 'workbench' | 'applications' | 'extensions' | 'roles'
  /** Optional active-state bridge; highlights the row while the panel is open. */
  active?: {
    subscribe(listener: () => void): () => void
    isOpen(): boolean
  }
}

/** Per-package configuration for a collapsible L1 group row and L2 container (ADR-0125 D4). */
export interface SidebarGroupOptions {
  /** Full attribute name identifying the injected group row button, e.g. 'data-dsh-workbench-group'. */
  groupAttribute: string
  /** CSS selector matching the injected group row button, e.g. '[data-dsh-workbench-group]'. */
  groupSelector: string
  /** Full attribute name identifying the L2 container element, e.g. 'data-dsh-workbench-container'. */
  containerAttribute: string
  /** CSS selector matching the L2 container, e.g. '[data-dsh-workbench-container]'. */
  containerSelector: string
  /** LocalStorage key for persisting collapsed state, e.g. 'dsh-workbench:collapsed'. */
  storageKey?: string
  /** CSS module class names for the row (entry / entryIcon / entryLabel). */
  css: Record<string, string>
  /** Localized group label (aria-label + visible text). */
  label(): string
  /** Optional localized tooltip (title attribute). */
  tooltip?(): string
  /** Placement mode relative to family/nav-band block ('before' | 'after' | 'stacked'). */
  position: 'before' | 'after' | 'stacked'
  /** Family selectors for block ordering. */
  familySelectors: readonly string[]
  /** Selectors of member entries that should be adopted into the L2 container. */
  memberSelectors: readonly string[]
}

/** Default inline chevron icon markup for collapsible groups (16x16, rotated on collapse). */
const GROUP_CHEVRON_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6.2L8 9.8l3.5-3.6" /></svg>'

/** Find the sidebar shell root element, or undefined while not yet mounted. */
function sidebarRoot(): HTMLElement | undefined {
  const column = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
  if (column === null) return undefined
  // Current shells wrap the sidebar UI: column > wrapper > root(logoRow owner).
  // Prefer the element that owns the logo row — the real sidebar UI root —
  // and fall back to the column's first child for legacy shells.
  const logoOwner = column.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement
  // `firstElementChild` is `Element | null`, NOT `| undefined`: a sidebar pane
  // that exists while momentarily empty (a full-pane teardown/rebuild between
  // frames) yields null. Every caller in this module guards on `undefined`
  // alone, so returning that null would slip past the guard and throw inside a
  // MutationObserver callback — measured, not theorised: the reconciliation
  // probe reproduces it deterministically at whole-tree teardown. Normalise to
  // undefined so the declared type is the truth the guards rely on.
  return logoOwner ?? (column.firstElementChild as HTMLElement | null) ?? undefined
}

/**
 * The New Session button is a **direct flex child of the sidebar root** on the
 * shipping shell, not a descendant of the logo row: measured against
 * @deepseek-ai/dsh-client-ui-sidebar's client bundle, the `logoRow` element's
 * children array closes (offset 14744) before the `newSession` button is
 * rendered (offset 15043). The `closest('[class*="logoRow"]')` probe below
 * therefore does not match on this generation, and placement falls back to
 * anchoring on the button itself.
 */
function newSessionButton(root: HTMLElement): HTMLButtonElement | undefined {
  const nested = root.querySelector<HTMLButtonElement>('button[class*="newSession"]')
  if (nested !== null) return nested
  for (const child of root.children) {
    if (child.tagName === 'BUTTON') return child as HTMLButtonElement
  }
  return undefined
}

/**
 * Below this rendered width the official button is the collapsed rail icon
 * (36px) rather than the full-width expanded button. Measured at runtime on
 * purpose: the collapsed state is expressed through a hashed class name and
 * through `align-self`/`width` inside the shell's own stylesheet, neither of
 * which a plugin may pin (ADR-0019). One fact, one home: both band modes
 * measure the same shell behaviour, so the limit lives here once and each
 * mode re-exports it under the name its contract test pins.
 */
const COLLAPSED_RAIL_MAX_WIDTH = 60

/** Exported for the contract test that pins the split arithmetic. */
export const SPLIT_COLLAPSED_LIMIT = COLLAPSED_RAIL_MAX_WIDTH

/** Exported for the contract test that pins the stacked-mode rail threshold. */
export const STACKED_COLLAPSED_LIMIT = COLLAPSED_RAIL_MAX_WIDTH

/**
 * Share the official New Session row 50/50 with the injected entry.
 *
 * Geometry, measured from the shell's own stylesheet rather than guessed: the
 * root is `flex-direction: column`; the official button is `flex: none`,
 * `height: 38px`, `margin: 0 2px 8px`, and expanded carries **no explicit
 * width** — it stretches to the root's content box. Two siblings in a column
 * container would stack, so the injected entry takes half the width, aligns to
 * the far edge, and is pulled back up by exactly the official button's own
 * vertical advance (height + margin-bottom). The pair then shares one visual
 * band while the container's total height is unchanged, so nothing below it
 * shifts.
 *
 * `calc(50% - 4px)` falls out of that: with the official button's 2px side
 * margins on both boxes, `2 + W + 2 + 2 + W + 2 = 100%` gives `W = 50% - 4px`.
 *
 * Inline styles are used because the shell's stylesheet contains no
 * `!important` (measured: zero occurrences in the shipped bundle), so inline
 * always wins — and writing only `style` leaves the button's node identity,
 * and therefore React's reconciliation, untouched.
 *
 * Collapsed rail: the content box is 36px wide while the icon inside is 18px,
 * so two side-by-side entries would be ~17px each and clip the icon. The entry
 * therefore stacks under the official button at the rail's own metric instead
 * of forcing the split.
 */
export function applySplitGeometry(official: HTMLButtonElement, entry: HTMLButtonElement): void {
  const rect = official.getBoundingClientRect()
  if (rect.width === 0) return // not laid out yet; the resize observer retries

  if (rect.width < COLLAPSED_RAIL_MAX_WIDTH) {
    official.style.removeProperty('width')
    entry.style.removeProperty('width')
    entry.style.removeProperty('margin-top')
    entry.style.removeProperty('align-self')
    entry.dataset.split = 'collapsed'
    return
  }

  const marginBottom = Number.parseFloat(getComputedStyle(official).marginBottom)
  const lift = rect.height + (Number.isNaN(marginBottom) ? 0 : marginBottom)
  official.style.width = 'calc(50% - 4px)'
  entry.style.width = 'calc(50% - 4px)'
  entry.style.alignSelf = 'flex-end'
  entry.style.marginTop = `-${lift}px`
  entry.dataset.split = 'expanded'
}

/**
 * Place the entry as a **stacked nav row** directly under the official New
 * Session button, and mark that button so the owning package's stylesheet may
 * restyle it into the matching row form.
 *
 * **No layout is imposed.** The shell's sidebar root is a flex column and the
 * official button carries no explicit width, so a sibling inserted immediately
 * after it stacks underneath and stretches to the same content box. The core
 * therefore writes exactly one thing — the `data-lute-navrow` marker — and the
 * package CSS keys on it (`button[class*="newSession"][data-lute-navrow]`).
 * Deleting the marker restores the shell's own appearance exactly; writing only
 * an attribute leaves the button's node identity — and React's reconciliation —
 * untouched (ADR-0019).
 *
 * Collapsed rail: the button then renders as a 36px icon, where the row form
 * has no room for a label and would clip the glyph. The entry takes the rail
 * metric instead (`data-split="collapsed"`, icon-only) and the official button
 * keeps the shell's own collapsed style — the marker is removed rather than
 * fought with, because the collapsed state lives in hashed class names a plugin
 * may not pin, and only a runtime width measurement can see it.
 */
export function applyStackedGeometry(official: HTMLButtonElement, entry: HTMLButtonElement): void {
  const rect = official.getBoundingClientRect()
  if (rect.width === 0) return // not laid out yet; the resize observer retries

  if (rect.width < COLLAPSED_RAIL_MAX_WIDTH) {
    delete official.dataset.luteNavrow
    entry.dataset.split = 'collapsed'
    return
  }

  official.dataset.luteNavrow = ''
  entry.dataset.split = 'expanded'
}

/** Build the entry row (a detached button; insert once the shell is up). */
function createEntry(options: SidebarEntryOptions): HTMLButtonElement {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.setAttribute(options.rowAttribute, '')
  if (options.plugin !== undefined) {
    entry.setAttribute('data-dsh-plugin', options.plugin)
    entry.setAttribute('data-dsh-part', 'sidebar-entry')
  }
  entry.className = options.css['entry'] ?? ''
  entry.setAttribute('aria-label', options.label())
  if (options.tooltip !== undefined) entry.setAttribute('title', options.tooltip())
  entry.innerHTML = '<span class="' + (options.css['entryIcon'] ?? '') + '">' + options.icon
    + '</span><span class="' + (options.css['entryLabel'] ?? '') + '">' + options.label() + '</span>'
  entry.addEventListener('click', options.onToggle)
  return entry
}

/**
 * The geometry a placement mode imposes on the official button's band, if any:
 * `split` shares the band 50/50 with inline styles, `stacked` marks the button
 * so the owning package's stylesheet restyles it into a second row. The family
 * modes never touch the official button.
 */
function bandGeometry(
  position: SidebarEntryOptions['position'],
): ((official: HTMLButtonElement, entry: HTMLButtonElement) => void) | undefined {
  if (position === 'split') return applySplitGeometry
  if (position === 'stacked') return applyStackedGeometry
  return undefined
}

/**
 * Insert the entry: beside the New Session button in `split` mode, directly
 * under it in `stacked` mode, otherwise into the family block between that
 * button and the browser region.
 */
function placeEntry(root: HTMLElement, entry: HTMLButtonElement, options: SidebarEntryOptions): boolean {
  const button = newSessionButton(root)
  if (button === undefined) return false
  const geometry = bandGeometry(options.position)
  if (geometry !== undefined) {
    // Must be the button's *immediate* next sibling: split lifts the entry
    // back into the button's own band with a negative top margin, stacked
    // relies on the flex column landing it there — either way, anything
    // sitting between the two breaks the band.
    if (entry.previousElementSibling !== button) button.after(entry)
    geometry(button, entry)
    return true
  }
  if (entry.parentElement !== root) {
    // Position relative to the family block (entries injected by sibling
    // plugins), never relative to transient logoRow geometry: every family
    // plugin that self-heals during a re-render then lands in the same
    // relative order, so the entries cannot swap positions regardless of
    // observer callback order or of shell wrapper changes. There is no
    // append-to-end fallback: appending at the end would randomly reorder
    // the block after a shell re-render.
    const row = button.closest('[class*="logoRow"]')
    const base = (row !== null && row.parentElement === root) ? row : button
    const family = Array.from(root.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.matches(options.familySelectors.join(', ')),
    )
    const anchor = options.position === 'before'
      ? (family.length > 0 ? family[0] : base.nextElementSibling)
      : (family.length > 0 ? family[family.length - 1]!.nextElementSibling : base.nextElementSibling)
    root.insertBefore(entry, anchor)
  }
  return true
}

/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing
 * on later React re-renders.
 * @param options - the row's attribute/icon/copy/action/ordering configuration.
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(options: SidebarEntryOptions): () => void {
  // DOM-level idempotency: whatever path mounted an entry row before this
  // call (a duplicated apply, an HMR re-injection, a stale module still
  // alive), never mount a second one. The existing row keeps working; a full
  // page reload is the ultimate reset.
  if (typeof document !== 'undefined' && document.querySelector(options.rowSelector) !== null) {
    return () => {}
  }
  const entry = createEntry(options)
  let root: HTMLElement | undefined
  let placed = false

  // Band geometry (split's widths/lift, stacked's collapsed-rail decision) is
  // a function of the root's rendered width, so it has to be re-measured when
  // the sidebar is dragged wider, collapsed, or the window resizes — none of
  // which is a childList mutation. Observing an already observed target is a
  // no-op, so tryPlace may call observe() freely.
  const geometry = bandGeometry(options.position)
  const resizeObserver = geometry !== undefined && typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
      if (root === undefined || !root.isConnected) return
      const button = newSessionButton(root)
      if (button !== undefined) geometry(button, entry)
    })
    : undefined

  const tryPlace = (): void => {
    if (root !== undefined && !root.isConnected) {
      // The shell rebuilt the sidebar pane (whole-tree teardown); the root
      // observer is gone with the old tree, so detach it and re-query from
      // scratch. The new pane is later noticed by the body-level watcher.
      rootObserver.disconnect()
      root = undefined
      placed = false
      waitObserver.observe(document.body, { childList: true, subtree: true })
    }
    if (placed) {
      // Cheap short-circuit: entry still lives in a mountable subtree.
      if (document.body.contains(entry)) return
      // Entry was torn down together with the old tree; reset and re-place.
      rootObserver.disconnect()
      root = undefined
      placed = false
      waitObserver.observe(document.body, { childList: true, subtree: true })
    }
    root ??= sidebarRoot()
    if (root === undefined) return
    placed = placeEntry(root, entry, options)
    if (placed) {
      waitObserver.disconnect()
      const button = newSessionButton(root)
      if (button !== undefined) attachButtonAction(button)
      rootObserver.observe(root, { childList: true, subtree: true })
      resizeObserver?.observe(root)
    }
  }

  // Body-level watcher retained as the "whole rebuild" fallback: when the shell
  // tears down the whole sidebar pane, the root observer is gone with it and
  // only this body observation can notice the new pane mounting. It is no
  // longer disconnected after placement; the placed-and-still-mounted case
  // short-circuits through the cheap document.body.contains(entry) check, so
  // unrelated app mutations (e.g. chat streaming) cost one contains check
  // instead of churning the full re-query.
  //
  // rAF debounce: the callback is deliberately deferred to the next animation
  // frame instead of running synchronously inside the MutationObserver microtask.
  // Without this, DSH boot triggers hundreds of React DOM mutations in rapid
  // succession; each mutation fires this callback, which calls tryPlace(), which
  // may call insertBefore/appendChild — producing more mutations and a
  // MutationObserver cascade that saturates the V8 main thread and prevents the
  // renderer from ever reporting boot health (observed as 30-second boot timeout
  // with pluginCount=0). requestAnimationFrame coalesces all mutations produced
  // within a single rendering frame into one tryPlace() call, matching the
  // scheduleLocate pattern used by dsh-better-sidebar for the same reason.
  let waitFrame: ReturnType<typeof requestAnimationFrame> | null = null
  const schedulePlace = (): void => {
    if (waitFrame !== null) return
    waitFrame = requestAnimationFrame(() => {
      waitFrame = null
      tryPlace()
    })
  }
  const waitObserver = new MutationObserver(schedulePlace)
  waitObserver.observe(document.body, { childList: true, subtree: true })

  // Self-heal: if a React re-render displaces the row, re-insert it in the
  // same frame (microtask before paint -> no visible flicker).
  const rootObserver = new MutationObserver(() => {
    if (root === undefined || !root.isConnected) {
      placed = false
      tryPlace()
      return
    }
    if (!root.contains(entry)) {
      placed = placeEntry(root, entry, options)
    } else if (geometry !== undefined) {
      // The row survived, but a re-render may have replaced the official button
      // node (taking the imposed geometry — split's inline width, stacked's
      // `data-lute-navrow` marker — with it) or changed the shell's collapsed
      // state. Re-asserting is idempotent and touches no node identity.
      const button = newSessionButton(root)
      if (button !== undefined) {
        // Only re-anchor direct children of the sidebar root. A row that a
        // workbench group folded into its container must never be pulled back
        // out here: that move triggers the group's adoptMembers, which moves
        // the row back, which triggers this observer again — an endless
        // microtask ping-pong that saturates the renderer main thread.
        if (entry.parentElement === root && entry.previousElementSibling !== button) button.after(entry)
        geometry(button, entry)
      }
    }
  })

  // Reflect the panel's open state or global view on the row (active highlight).
  // Note: assigning undefined to dataset.active materializes data-active="undefined"
  // and keeps the row permanently highlighted — delete the attribute instead.
  let unsubscribeView: (() => void) | undefined
  if (options.view !== undefined && typeof window !== 'undefined') {
    const handleViewChange = (event: Event): void => {
      const customEvent = event as CustomEvent<{ view?: string }>
      if (customEvent.detail?.view === options.view) {
        entry.dataset.active = 'true'
      } else {
        delete entry.dataset.active
      }
    }
    window.addEventListener('dsh:view-change', handleViewChange)
    unsubscribeView = () => window.removeEventListener('dsh:view-change', handleViewChange)
  }

  const unsubscribeActive = options.active === undefined ? undefined : (() => {
    const syncActive = (): void => {
      if (options.active!.isOpen()) entry.dataset.active = 'true'
      else if (options.view === undefined) delete entry.dataset.active
    }
    const unsubscribe = options.active.subscribe(syncActive)
    syncActive()
    return unsubscribe
  })()

  // Clicking the official New Session button returns to the native chat stream.
  let cleanupButtonAction: (() => void) | undefined
  const attachButtonAction = (button: HTMLButtonElement): void => {
    if (cleanupButtonAction !== undefined) return
    const onClickNewSession = (): void => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dsh:view-change', { detail: { view: 'chat' } }))
      }
    }
    button.addEventListener('click', onClickNewSession)
    cleanupButtonAction = () => button.removeEventListener('click', onClickNewSession)
  }

  tryPlace()

  return () => {
    if (waitFrame !== null) { cancelAnimationFrame(waitFrame); waitFrame = null }
    waitObserver.disconnect()
    rootObserver.disconnect()
    resizeObserver?.disconnect()
    unsubscribeActive?.()
    unsubscribeView?.()
    cleanupButtonAction?.()
    const button = root === undefined ? undefined : newSessionButton(root)
    if (button !== undefined) {
      if (options.position === 'split') button.style.removeProperty('width')
      else if (options.position === 'stacked') delete button.dataset.luteNavrow
    }
    entry.remove()
  }
}

/**
 * Mount a collapsible sidebar group (L1 row + L2 container).
 * Folds capability entries into a single group row with persisted collapse state.
 */
export function mountSidebarGroup(options: SidebarGroupOptions): () => void {
  if (typeof document !== 'undefined' && document.querySelector(options.groupSelector) !== null) {
    return () => {}
  }

  // Restore collapsed state safely from localStorage
  let collapsed = false
  if (options.storageKey !== undefined && typeof window !== 'undefined') {
    try {
      collapsed = window.localStorage.getItem(options.storageKey) === '1'
    } catch {
      collapsed = false
    }
  }

  // Create L1 group row
  const groupRow = document.createElement('button')
  groupRow.type = 'button'
  groupRow.setAttribute(options.groupAttribute, '')
  groupRow.setAttribute('data-dsh-part', 'sidebar-group')
  groupRow.className = options.css['entry'] ?? ''
  groupRow.setAttribute('aria-label', options.label())
  groupRow.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
  if (options.tooltip !== undefined) groupRow.setAttribute('title', options.tooltip())

  const iconSpan = '<span class="' + (options.css['entryIcon'] ?? '') + '" data-dsh-part="group-caret">' + GROUP_CHEVRON_ICON + '</span>'
  const labelSpan = '<span class="' + (options.css['entryLabel'] ?? '') + '">' + options.label() + '</span>'
  groupRow.innerHTML = iconSpan + labelSpan

  // Create L2 container
  const container = document.createElement('div')
  container.setAttribute(options.containerAttribute, '')
  container.setAttribute('data-dsh-part', 'sidebar-group-container')
  if (collapsed) container.style.display = 'none'

  const syncState = (): void => {
    groupRow.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
    container.style.display = collapsed ? 'none' : ''
    const caret = groupRow.querySelector<HTMLElement>('[data-dsh-part="group-caret"]')
    if (caret !== null) {
      caret.style.transform = collapsed ? 'rotate(-90deg)' : ''
      caret.style.transition = 'transform 180ms ease'
    }
    if (options.storageKey !== undefined && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(options.storageKey, collapsed ? '1' : '0')
      } catch {
        // localStorage not available
      }
    }
  }

  groupRow.addEventListener('click', () => {
    collapsed = !collapsed
    syncState()
  })
  syncState()

  // Adopt existing member rows into container.
  //
  // Only direct children of the sidebar root are ever adopted. Without that
  // precondition two containers holding the same memberSelectors would keep
  // stealing the row from each other — appendChild moves the node, the move
  // fires the other container's root observer, which adopts it back, forever.
  const adoptMembers = (root: HTMLElement): void => {
    if (options.memberSelectors.length === 0) return
    const selector = options.memberSelectors.join(', ')
    const members = Array.from(root.querySelectorAll<HTMLElement>(selector))
    for (const member of members) {
      if (member !== groupRow && member.parentElement === root) {
        container.appendChild(member)
      }
    }
  }

  let root: HTMLElement | undefined
  let placed = false
  // Set when another instance of the same group mounted first: all observers
  // are disconnected and this instance never touches the DOM again.
  let retired = false

  const retire = (): void => {
    retired = true
    groupWaitObserver.disconnect()
    rootObserver.disconnect()
    if (groupWaitFrame !== null) { cancelAnimationFrame(groupWaitFrame); groupWaitFrame = null }
  }

  const tryPlace = (): void => {
    if (retired) return
    if (root !== undefined && !root.isConnected) {
      rootObserver.disconnect()
      root = undefined
      placed = false
      groupWaitObserver.observe(document.body, { childList: true, subtree: true })
    }
    if (placed) {
      if (document.body.contains(groupRow) && document.body.contains(container)) {
        if (root !== undefined) adoptMembers(root)
        return
      }
      rootObserver.disconnect()
      root = undefined
      placed = false
      groupWaitObserver.observe(document.body, { childList: true, subtree: true })
    }
    root ??= sidebarRoot()
    if (root === undefined) return

    const button = newSessionButton(root)
    if (button === undefined) return

    if (groupRow.parentElement !== root) {
      // Singleton enforced at insertion time, not mount time: the mount-time
      // querySelector guard races when several packages mount the same group
      // before the sidebar exists — every instance passes it, and each inserts
      // its own container once the shell appears. The first instance to reach
      // a live root wins; later instances retire instead of fighting it.
      const foreign = root.querySelector(options.groupSelector)
      if (foreign !== null) {
        retire()
        return
      }
      const row = button.closest('[class*="logoRow"]')
      const base = (row !== null && row.parentElement === root) ? row : button
      const family = Array.from(root.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement && el.matches(options.familySelectors.join(', ')),
      )
      const anchor = options.position === 'before'
        ? (family.length > 0 ? family[0] : base.nextElementSibling)
        : (family.length > 0 ? family[family.length - 1]!.nextElementSibling : base.nextElementSibling)
      root.insertBefore(groupRow, anchor)
      root.insertBefore(container, groupRow.nextElementSibling)
    }

    adoptMembers(root)
    placed = true
    groupWaitObserver.disconnect()
    rootObserver.observe(root, { childList: true, subtree: true })
  }

  const rootObserver = new MutationObserver(() => {
    if (root === undefined || !root.isConnected) {
      tryPlace()
      return
    }
    rootObserver.disconnect()
    adoptMembers(root)
    if (root !== undefined && root.isConnected) {
      rootObserver.observe(root, { childList: true, subtree: true })
    }
  })

  let groupWaitFrame: ReturnType<typeof requestAnimationFrame> | null = null
  const scheduleGroupPlace = (): void => {
    if (groupWaitFrame !== null) return
    groupWaitFrame = requestAnimationFrame(() => {
      groupWaitFrame = null
      tryPlace()
    })
  }
  const groupWaitObserver = new MutationObserver(scheduleGroupPlace)
  if (typeof document !== 'undefined') {
    groupWaitObserver.observe(document.body, { childList: true, subtree: true })
  }

  tryPlace()

  return () => {
    if (groupWaitFrame !== null) { cancelAnimationFrame(groupWaitFrame); groupWaitFrame = null }
    groupWaitObserver.disconnect()
    rootObserver.disconnect()
    if (root !== undefined) {
      while (container.firstChild !== null) {
        root.appendChild(container.firstChild)
      }
    }
    groupRow.remove()
    container.remove()
  }
}

