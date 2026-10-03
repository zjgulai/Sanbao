/** Ticket 015: the Electron side-preview container — ADR-0178 D3 / design ADR-0001 contract.
 *
 * Embedded content never enters the privileged renderer. This container is an independent,
 * non-privileged WebContentsView:
 *
 * - its own non-persistent session, no preload, no privileged IPC channel;
 * - the only readable scheme is `sage-preview://`, served from an in-memory map that `load` fills
 *   and `destroy` clears — no network request can leave, and no local file is reachable;
 * - navigation away from the served document is denied, and window.open is denied;
 * - close destroys the view and the map (the resource-reclamation half of the contract).
 *
 * The artifact's own HTML runs offline-interactive inside this surface (scripts allowed — that is
 * the point of the separate container); everything else about it stays unreachable.
 */
import { BrowserWindow, WebContentsView, session } from 'electron'
import { randomUUID } from 'node:crypto'

import type { PreviewContainer, PreviewLoad } from './artifact-preview.js'

const PREVIEW_PARTITION = 'sage-preview'
const PREVIEW_SCHEME = 'sage-preview://'
const PREVIEW_PANEL_WIDTH = 512
const PREVIEW_PANEL_TOPBAR = 64

let protocolRegistered = false

function ensurePreviewProtocol(): void {
  if (protocolRegistered) return
  protocolRegistered = true
  const partitionSession = session.fromPartition(PREVIEW_PARTITION)
  partitionSession.protocol.handle('sage-preview', (request) => {
    const token = new URL(request.url).pathname.replace(/^\//u, '')
    const entry = served.get(token)
    if (entry === undefined) return new Response(null, { status: 404 })
    return new Response(entry.bytes, { headers: { 'content-type': entry.mime } })
  })
  // The one-way gate: anything that is not this session's own in-memory scheme is cancelled —
  // there is no network and no filesystem reach from inside the preview.
  partitionSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith(PREVIEW_SCHEME) })
  })
}

/** The in-memory documents the preview session may read; `destroy` empties it. */
const served = new Map<string, { readonly bytes: Buffer, readonly mime: string }>()

/** Ticket 044: the separate preview window — a real OS window over the SAME non-privileged
 *  contract as the side container (own partition, no preload, own window.open denial; the only
 *  readable scheme is the shared in-memory `sage-preview://` map). It opens only when the store's
 *  explicit action asks for it; destroying it releases the window and its token.
 */
export function createPreviewWindowContainer(options: { readonly window: () => BrowserWindow | null }): PreviewContainer | { readonly failed: string } {
  const parent = options.window()
  if (parent === null || parent.isDestroyed()) return { failed: 'artifact-preview-window-unavailable' }
  ensurePreviewProtocol()
  const window = new BrowserWindow({
    parent,
    width: 960,
    height: 720,
    show: true,
    webPreferences: {
      partition: PREVIEW_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      allowRunningInsecureContent: false,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(PREVIEW_SCHEME)) event.preventDefault()
  })
  let token: string | null = null
  let destroyed = false
  return {
    async load(input: PreviewLoad): Promise<void> {
      if (destroyed) throw Object.assign(new Error('预览窗口已关闭'), { code: 'artifact-window-closed' })
      if (token !== null) served.delete(token)
      token = randomUUID()
      const entry = input.kind === 'pdf'
        ? { bytes: Buffer.from(input.data, 'base64'), mime: 'application/pdf' }
        : { bytes: Buffer.from(input.body, 'utf8'), mime: 'text/html' }
      served.set(token, entry)
      await window.loadURL(`${PREVIEW_SCHEME}artifact/${token}`)
    },
    destroy(): void {
      if (destroyed) return
      destroyed = true
      if (token !== null) served.delete(token)
      token = null
      if (!window.isDestroyed()) window.destroy()
    },
  }
}

export function createPreviewContainer(options: { readonly window: () => BrowserWindow | null }): PreviewContainer | { readonly failed: string } {
  const parent = options.window()
  if (parent === null || parent.isDestroyed()) return { failed: 'artifact-preview-window-unavailable' }
  ensurePreviewProtocol()
  const view = new WebContentsView({
    webPreferences: {
      partition: PREVIEW_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      allowRunningInsecureContent: false,
    },
  })
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  view.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(PREVIEW_SCHEME)) event.preventDefault()
  })
  let expanded = false
  let panelToken: string | null = null
  const place = (): void => {
    const bounds = parent.getBounds()
    // Ticket 033 (US-172): full view is the SAME document over the whole window; exit returns to
    // the side panel. Either way the surface moves — it is never reloaded, and nothing new loads.
    view.setBounds(expanded
      ? { x: 0, y: PREVIEW_PANEL_TOPBAR, width: bounds.width, height: Math.max(200, bounds.height - PREVIEW_PANEL_TOPBAR) }
      : { x: Math.max(0, bounds.width - PREVIEW_PANEL_WIDTH), y: PREVIEW_PANEL_TOPBAR, width: PREVIEW_PANEL_WIDTH, height: Math.max(200, bounds.height - PREVIEW_PANEL_TOPBAR) })
  }
  place()
  parent.on('resize', place)
  parent.contentView.addChildView(view)
  return {
    async load(input: PreviewLoad) {
      // One document at a time for THIS surface (ticket 044: the separate window keeps its own
      // token — both load the same prepared bytes, so the served entries never diverge).
      if (panelToken !== null) served.delete(panelToken)
      panelToken = randomUUID()
      const entry = input.kind === 'pdf'
        ? { bytes: Buffer.from(input.data, 'base64'), mime: 'application/pdf' }
        : { bytes: Buffer.from(input.body, 'utf8'), mime: 'text/html' }
      served.set(panelToken, entry)
      await view.webContents.loadURL(`${PREVIEW_SCHEME}artifact/${panelToken}`)
    },
    setExpanded(on: boolean) {
      if (expanded === on) return
      expanded = on
      place()
    },
    destroy() {
      // Reclaim only this surface's document; the window's token (044) is its own to release.
      if (panelToken !== null) served.delete(panelToken)
      panelToken = null
      parent.off('resize', place)
      if (!parent.isDestroyed()) parent.contentView.removeChildView(view)
      view.webContents.close()
    },
  }
}
