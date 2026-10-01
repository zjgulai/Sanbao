/** Sage Electron shell: custom protocol, one window, host child lifecycle. */

import { homedir } from 'node:os'
import { app, dialog, protocol, shell } from 'electron'
import { ensureSageDirectoriesSync, readActiveProfile, resolveSagePaths, type SagePaths } from '../profile/paths.js'
import type { SageViewState } from '../product/contracts.js'
import { handleSageServiceRequest, isSageServicePath } from '../appservice/route-skeleton.js'
import { ShellHostProcess, type ShellHostRuntimeSnapshot } from './host-process.js'
import { resolveHostRuntime, resolveSageElectronPaths } from './runtime.js'
import { routeSchemeRequest } from './route.js'
import { FramePolicy } from './frame-policy.js'
import { verifySageServiceCaller } from './appservice-binding.js'
import { createSageWindow, loadTrustedUrl } from './window.js'
import { createProductionAdapter } from './oidc-runtime.js'
import { createTokenVault } from './token-vault.js'
import { createSageAppServiceProviders, resolveFixtureProjection } from './app-service.js'

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

/** Project the main-owned host snapshot into the renderer-facing runtime state. */
function toSageViewState(snapshot: ShellHostRuntimeSnapshot): SageViewState {
  if (snapshot.kind === 'active') {
    return { status: 'ready', message: `dsh ${snapshot.harnessVersion}`, retryable: true }
  }
  return { status: 'unavailable', message: snapshot.reason, retryable: snapshot.reason !== 'stopped' }
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

  const framePolicy = new FramePolicy({
    onContamination: (reason, generation) => {
      process.stdout.write(`sage shell: frame policy contaminated generation ${generation}: ${reason}\n`)
    },
  })

  // WT-02D.1: the fixture switch only fills the read-only matter slot for local verification;
  // it can never satisfy production authority and is read once at startup.
  const fixtureProjection = resolveFixtureProjection(process.env)

  // WT-02B.2B login wiring: in-memory vault plus a production adapter (real loopback,
  // real fetch, node randomness; shell.openExternal stays fail-closed on failure via
  // the runtime guard). Tokens never leave main and never persist.
  const vault = createTokenVault()
  const { adapter } = createProductionAdapter(vault, { openExternal: (url) => shell.openExternal(url) })

  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    const route = routeSchemeRequest(url)
    if (route.target === 'reject') return Promise.resolve(new Response(null, { status: 404 }))
    if (isSageServicePath(url.pathname)) {
      const callerBinding = verifySageServiceCaller(url, request, framePolicy)
      const viewState = toSageViewState(host.readSnapshot())
      const providers = createSageAppServiceProviders({
        viewState,
        vault,
        adapter,
        ...(fixtureProjection === undefined ? {} : { fixtureProjection }),
      })
      return handleSageServiceRequest(request, { callerBinding, providers })
    }
    return host.fetch(request)
  })

  const window = createSageWindow(framePolicy)
  await loadTrustedUrl(window, framePolicy, `${SCHEME}://app/index.html`)
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
