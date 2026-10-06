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
import { ActionItemsRegion } from './action-items-view.js'
import { DraftRegion } from './draft-view.js'
import { ArtifactRegion } from './artifact-view.js'
import { LinkRegion } from './link-view.js'
import { MatterAdminRegion } from './matter-admin-view.js'
import { MatterGroupsRegion } from './matter-groups-view.js'
import { MatterListRegion } from './matter-list-view.js'
import { MatterRegion } from './matter-view.js'
import { MonitorRegion } from './monitor-view.js'
import { PlanRegion } from './plan-view.js'
import { CapabilityRegion, CapabilitySourceBadge, ModelConfigRegion } from './capability-view.js'
import { SearchRegion } from './search-view.js'
import { SessionRegion } from './session-view.js'
import { SideChatsRegion } from './side-chats-view.js'
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

const runMonitorHost = document.getElementById('sage-region-run-monitor')
if (runMonitorHost !== null) {
  createRoot(runMonitorHost).render(<MonitorRegion store={store} container={runMonitorHost} />)
}

const artifactHost = document.getElementById('sage-region-artifacts')
if (artifactHost !== null) {
  createRoot(artifactHost).render(<ArtifactRegion store={store} container={artifactHost} />)
}

const sideChatsHost = document.getElementById('sage-region-side-chats')
if (sideChatsHost !== null) {
  createRoot(sideChatsHost).render(<SideChatsRegion store={store} container={sideChatsHost} />)
}

const actionItemsHost = document.getElementById('sage-region-action-items')
if (actionItemsHost !== null) {
  createRoot(actionItemsHost).render(<ActionItemsRegion store={store} container={actionItemsHost} />)
}

const planHost = document.getElementById('sage-region-plans')
if (planHost !== null) {
  createRoot(planHost).render(<PlanRegion store={store} container={planHost} />)
}

const linkHost = document.getElementById('sage-region-link')
if (linkHost !== null) {
  createRoot(linkHost).render(<LinkRegion store={store} container={linkHost} />)
}

const matterAdminHost = document.getElementById('sage-region-matter-admin')
if (matterAdminHost !== null) {
  createRoot(matterAdminHost).render(<MatterAdminRegion store={store} container={matterAdminHost} />)
}

const matterGroupsHost = document.getElementById('sage-region-matter-groups')
if (matterGroupsHost !== null) {
  createRoot(matterGroupsHost).render(<MatterGroupsRegion store={store} container={matterGroupsHost} />)
}

const matterListHost = document.getElementById('sage-region-matter-list')
if (matterListHost !== null) {
  createRoot(matterListHost).render(<MatterListRegion store={store} container={matterListHost} />)
}

const draftHost = document.getElementById('sage-region-draft')
if (draftHost !== null) {
  createRoot(draftHost).render(<DraftRegion store={store} container={draftHost} />)
}

const sessionHost = document.getElementById('sage-region-session')
if (sessionHost !== null) {
  createRoot(sessionHost).render(<SessionRegion store={store} container={sessionHost} />)
}

const searchHost = document.getElementById('sage-region-search')
if (searchHost !== null) {
  createRoot(searchHost).render(<SearchRegion store={store} container={searchHost} />)
}

const capabilityHost = document.getElementById('sage-region-capability')
if (capabilityHost !== null) {
  createRoot(capabilityHost).render(<CapabilityRegion store={store} container={capabilityHost} />)
}

const capabilitySourceHost = document.getElementById('sage-region-capability-source')
if (capabilitySourceHost !== null) {
  createRoot(capabilitySourceHost).render(<CapabilitySourceBadge store={store} container={capabilitySourceHost} />)
}

const modelConfigHost = document.getElementById('sage-region-model-config')
if (modelConfigHost !== null) {
  createRoot(modelConfigHost).render(<ModelConfigRegion store={store} container={modelConfigHost} />)
}

const markerHost = document.getElementById('sage-app-root')
if (markerHost !== null) {
  createRoot(markerHost).render(<SageAppRoot />)
}
