/** Electron shell: custom protocol, one window, host child lifecycle. */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, protocol } from 'electron'
import { defaultProfileDir } from '../profile/layout.js'
import { ShellHostProcess } from './host-process.js'
import { resolveHostRuntime } from './runtime.js'
import { routeSchemeRequest } from './route.js'

const SCHEME = 'dsh-app'

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: false,
    stream: true,
    codeCache: true,
  },
}])

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).protocol !== `${SCHEME}:`) event.preventDefault()
  })
  window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show() })
  return window
}

async function main(): Promise<void> {
  const profileDir = process.env.LUTE_SHELL_PROFILE ?? defaultProfileDir(homedir())
  const runtime = resolveHostRuntime({
    execPath: process.execPath,
    profileDir,
    dshHome: process.env.DSH_HOME ?? join(homedir(), '.dsh'),
    env: process.env,
  })
  const host = new ShellHostProcess(runtime)
  const ready = await host.start()
  process.stdout.write(`lute shell: host ready, dsh ${ready.dshVersion}\n`)

  protocol.handle(SCHEME, (request) => {
    const route = routeSchemeRequest(new URL(request.url))
    if (route.target === 'reject') return Promise.resolve(new Response(null, { status: 404 }))
    return host.fetch(request)
  })

  const window = createWindow()
  await window.loadURL(`${SCHEME}://app/index.html`)
  if (process.env.LUTE_SHELL_DEVTOOLS !== '0') window.webContents.openDevTools({ mode: 'detach' })

  // Without the guard, a second before-quit during teardown preventDefaults again and the app never exits.
  let quitting = false
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    void host.stop().finally(() => { app.exit(0) })
  })
}

void app.whenReady().then(main).catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`lute shell: ${error instanceof Error ? error.stack ?? message : message}\n`)
  dialog.showErrorBox('LUTE Shell 启动失败', message)
  app.exit(1)
})
