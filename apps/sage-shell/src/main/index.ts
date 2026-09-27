/** Sage Electron shell: custom protocol, one window, host child lifecycle. */

import { homedir } from 'node:os'
import { app, BrowserWindow, dialog, protocol } from 'electron'
import { ensureSageDirectoriesSync, readActiveProfile, resolveSagePaths, type SagePaths } from '../profile/paths.js'
import { ShellHostProcess } from './host-process.js'
import { resolveHostRuntime, resolveSageElectronPaths } from './runtime.js'
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

/** Configure Electron storage before its ready event can initialize Chromium defaults. */
function configureElectronPaths(paths: SagePaths): void {
  const electron = resolveSageElectronPaths(paths)
  app.setPath('userData', electron.userData)
  app.setPath('sessionData', electron.sessionData)
  app.setPath('crashDumps', electron.crashDumps)
  app.setAppLogsPath(electron.logs)
}

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

async function main(paths: SagePaths): Promise<void> {
  const activeProfile = await readActiveProfile(paths)
  if (activeProfile === null) {
    throw new Error('sage shell: no active Sage profile — run pnpm run materialize before launching')
  }
  const runtime = resolveHostRuntime({
    execPath: process.execPath,
    paths,
    activeProfile,
    env: process.env,
  })
  const host = new ShellHostProcess(runtime)
  const ready = await host.start()
  process.stdout.write(`sage shell: host ready, dsh ${ready.dshVersion}\n`)

  protocol.handle(SCHEME, (request) => {
    const route = routeSchemeRequest(new URL(request.url))
    if (route.target === 'reject') return Promise.resolve(new Response(null, { status: 404 }))
    return host.fetch(request)
  })

  const window = createWindow()
  await window.loadURL(`${SCHEME}://app/index.html`)
  if (process.env.SAGE_DEVTOOLS === '1') window.webContents.openDevTools({ mode: 'detach' })

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

async function bootstrap(): Promise<void> {
  const root = process.env.SAGE_ROOT
  const paths = resolveSagePaths({
    home: homedir(),
    platform: process.platform,
    ...(root === undefined ? {} : { root }),
  })
  // `setPath('sessionData')` has to occur before Electron's ready event. This
  // safe synchronous setup is deliberately before the first await in bootstrap().
  ensureSageDirectoriesSync(paths)
  configureElectronPaths(paths)
  await app.whenReady()
  await main(paths)
}

void bootstrap().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`sage shell: ${error instanceof Error ? error.stack ?? message : message}\n`)
  dialog.showErrorBox('Sage Shell 启动失败', message)
  app.exit(1)
})
