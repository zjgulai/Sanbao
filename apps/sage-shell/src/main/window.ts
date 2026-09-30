/**
 * Production window factory for the privileged Sage renderer.
 *
 * Every privileged window is created here so the frame-prohibition invariant (ADR-0178)
 * cannot be bypassed by constructing a BrowserWindow elsewhere: explicit secure
 * webPreferences, a denied window-open surface, and the main-owned frame policy attached
 * before any navigation can happen.
 */

import { BrowserWindow, type WebContents } from 'electron'
import { FramePolicy } from './frame-policy.js'

const SCHEME = 'dsh-app'

/** The only webPreferences shape a privileged Sage window may run with. */
export const SAGE_WINDOW_WEB_PREFERENCES = Object.freeze({
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  nodeIntegrationInSubFrames: false,
  webviewTag: false,
})

function safeRead<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

function onlyCurrentMainFrame(contents: WebContents): boolean {
  if (contents.isDestroyed()) return false
  return safeRead(() => contents.mainFrame.framesInSubtree.length === 1, false)
}

/** Feed every frame- and navigation-relevant WebContents event into the policy. */
export function attachFramePolicy(contents: WebContents, policy: FramePolicy): void {
  contents.on('frame-created', (_event, details) => {
    const frame = details.frame ?? null
    const isMainFrame = frame !== null && safeRead(() => frame.parent === null && frame.top === frame, false)
    policy.onFrameCreated(isMainFrame)
  })
  contents.on('did-start-navigation', (details) => {
    policy.onNavigationStart({
      isMainFrame: details.isMainFrame,
      isSameDocument: details.isSameDocument,
      url: details.url,
    })
  })
  contents.on('will-frame-navigate', (details) => {
    const decision = policy.onNavigationWill({
      isMainFrame: details.isMainFrame,
      isSameDocument: details.isSameDocument,
      url: details.url,
    })
    if (decision.preventDefault) details.preventDefault()
  })
  contents.on('did-frame-navigate', (_event, url, _code, _text, isMainFrame) => {
    policy.onNavigationCommitted({ isMainFrame, url, singleFrameTree: onlyCurrentMainFrame(contents) })
  })
  contents.on('will-attach-webview', (event) => {
    if (policy.onWebviewAttach().preventDefault) event.preventDefault()
  })
  contents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
    if (isMainFrame) policy.onLoadFailed(true)
  })
  contents.on('render-process-gone', (_event, details) => {
    policy.onRenderProcessGone(details.reason)
  })
  contents.on('destroyed', () => {
    policy.onDestroyed()
  })
}

/** Create the one privileged Sage window with the frame policy already attached. */
export function createSageWindow(policy: FramePolicy): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 600,
    show: false,
    webPreferences: { ...SAGE_WINDOW_WEB_PREFERENCES },
  })
  const contents = window.webContents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    if (new URL(url).protocol !== `${SCHEME}:`) event.preventDefault()
  })
  attachFramePolicy(contents, policy)
  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) window.show()
  })
  return window
}

/** Navigate the privileged window through the only trusted path: a main-owned intent. */
export async function loadTrustedUrl(window: BrowserWindow, policy: FramePolicy, url: string): Promise<void> {
  policy.ownedNavigationIntent(url)
  await window.loadURL(url)
}
