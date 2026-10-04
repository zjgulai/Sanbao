/**
 * Sage renderer React app root (ADR-0261, strangler).
 *
 * P1 brought the mount seam; P2 (this revision) takes over the first region: the matter
 * workbench (`#sage-matter-region` — heading + focus card + trace rail) renders from the
 * bridge store, which the legacy inline script feeds through `window.__SAGE_APP_SET_MATTER__`
 * (validated projection) and `window.__SAGE_APP_SET_VIEW__` (active view). All other regions
 * remain owned by the legacy inline script until their phase (P3–P4) moves them here.
 */
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import type { JSX } from 'react'

import { createMatterRegionStore } from './matter-bridge.js'
import { MatterRegion } from './matter-view.js'

declare global {
  interface Window {
    /** Set once the React app root has committed; asserted by the window probe and smoke spec. */
    __SAGE_APP_MOUNTED__?: boolean
  }
}

/** Hidden marker proving the app root mounted without owning any region (P1 seam, kept). */
export function SageAppRoot(): JSX.Element {
  useEffect(() => {
    window.__SAGE_APP_MOUNTED__ = true
  }, [])
  return <div data-sage-app="p1-infrastructure" hidden />
}

const store = createMatterRegionStore()
window.__SAGE_APP_SET_MATTER__ = (message) => {
  store.setMessage(message)
}
window.__SAGE_APP_SET_VIEW__ = (view) => {
  store.setView(view)
}

const regionHost = document.getElementById('sage-matter-region')
if (regionHost !== null) {
  createRoot(regionHost).render(<MatterRegion store={store} container={regionHost} />)
}

const markerHost = document.getElementById('sage-app-root')
if (markerHost !== null) {
  createRoot(markerHost).render(<SageAppRoot />)
}
