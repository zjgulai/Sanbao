/** Sage Electron shell: custom protocol, one window, host child lifecycle. */

import { readFileSync } from 'node:fs'
import { readdir, realpath, readFile } from 'node:fs/promises'
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
import { randomBytes } from 'node:crypto'
import { createProductionAdapter } from './oidc-runtime.js'
import { createTokenVault } from './token-vault.js'
import { createIdentityRegistry } from './identity-registry.js'
import { createSageAppServiceProviders, resolveFixtureProjection } from './app-service.js'
import { createHostLiveInventoryProjectionProvider } from './runtime-inventory.js'
import { createRuntimeInventoryProvider } from './runtime-inventory-provider.js'

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

  // WT-02C.2E.2: one main-owned composition read of the full runtime inventory. It never
  // blocks startup and emits exactly one stable, non-sensitive stdout line; the registry
  // port does not exist yet, so production currently reads the stages before it.
  const runtimeInventory = createRuntimeInventoryProvider({
    paths,
    hostProjection: createHostLiveInventoryProjectionProvider({
      paths,
      host,
      clock: { now: () => new Date().toISOString() },
    }),
    pmapFs: {
      readFileBytes: (path) => readFile(path),
      listDirectory: async (path) => (await readdir(path, { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        isSymbolicLink: entry.isSymbolicLink(),
      })),
      realpath: (path) => realpath(path),
    },
    readFileBytes: (path) => readFileSync(path),
  })
  void runtimeInventory.read().then((result) => {
    process.stdout.write(result.kind === 'available'
      ? 'sage shell: runtime inventory available\n'
      : `sage shell: runtime inventory unavailable (${result.code})\n`)
  }).catch(() => {
    process.stdout.write('sage shell: runtime inventory unavailable (assembly-invalid)\n')
  })

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
  // WT-02B.2C: the identity registry mints runtime-only internal handles for verified
  // (issuer, subject); handles never persist and never reach renderer/Host/logs.
  const vault = createTokenVault({ mintSessionRef: () => randomBytes(32).toString('base64url') })
  const identityRegistry = createIdentityRegistry({ randomHandle: () => randomBytes(32).toString('base64url') })
  const { adapter } = createProductionAdapter(vault, {
    openExternal: (url) => shell.openExternal(url),
    resolveIdentity: (input) => identityRegistry.resolve(input),
  })

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
        // WT-02C.2E.2: the composed inventory provider rides the same flow until the
        // C2E.2 resolver wiring lands; nothing consumes it yet.
        runtimeInventory,
        // WT-02D.2A: the authorization path runs over the instance-local policy file; absent
        // or unreadable keeps every command port fail closed.
        authority: {
          policyPath: paths.organizationPolicyFile,
          readFileBytes: (path) => readFileSync(path),
          now: () => new Date().toISOString(),
        },
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
