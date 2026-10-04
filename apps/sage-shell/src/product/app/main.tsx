/**
 * Sage renderer React app root (ADR-0261, strangler).
 *
 * P1 brought the mount seam; P2 took over the matter workbench region; P3 (batch 16) takes over
 * the web-deliverables catalog (`#sage-region-sites`) and the typed tool-result rows
 * (`#sage-region-tool-results`). Every region renders from the bridge store, which the legacy
 * inline script feeds through `window.__SAGE_APP_SET_REGION__(region, message)` plus
 * `window.__SAGE_APP_SET_VIEW__` (active view). Explicit entries that stay on the legacy wire
 * call back through `window.__SAGE_LEGACY_ACTIONS__`. All other regions remain owned by the
 * legacy inline script until their phase (P3 rest / P4) moves them here.
 */
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import type { JSX } from 'react'

import { createAppBridgeStore } from './bridge.js'
import { MatterRegion } from './matter-view.js'
import { SitesRegion } from './sites-view.js'
import { ToolResultsRegion } from './tool-results-view.js'

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

const store = createAppBridgeStore()
window.__SAGE_APP_SET_REGION__ = (region, message) => {
  store.setRegion(region, message)
}
window.__SAGE_APP_SET_VIEW__ = (view) => {
  store.setView(view)
}

const matterHost = document.getElementById('sage-matter-region')
if (matterHost !== null) {
  createRoot(matterHost).render(<MatterRegion store={store} container={matterHost} />)
}

const sitesHost = document.getElementById('sage-region-sites')
if (sitesHost !== null) {
  createRoot(sitesHost).render(<SitesRegion store={store} container={sitesHost} />)
}

const toolResultsHost = document.getElementById('sage-region-tool-results')
if (toolResultsHost !== null) {
  createRoot(toolResultsHost).render(<ToolResultsRegion store={store} container={toolResultsHost} />)
}

const markerHost = document.getElementById('sage-app-root')
if (markerHost !== null) {
  createRoot(markerHost).render(<SageAppRoot />)
}
