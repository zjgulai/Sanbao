/** Production transports for the OIDC login adapter (WT-02B.2B D1 main wiring):
 * a real node:http loopback server, the global fetch, and node crypto randomness.
 * Electron's shell.openExternal stays injected by the main wiring (index.ts) — this
 * module keeps the same electron-free shape as oidc-adapter so tests can load it
 * under ELECTRON_RUN_AS_NODE without a running Electron app. */
import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { OidcAdapterDeps } from './oidc-adapter.js'
import { createOidcAdapter } from './oidc-adapter.js'
import type { TokenVault } from './token-vault.js'

export interface LoopbackTransport {
  /** Bind 127.0.0.1 on the requested port (production: the fixed 3000; tests: 0 for OS assignment). */
  listen(requestedPort: number, handler: (req: IncomingMessage) => void): Promise<void>
  /** Idempotent teardown; safe to call after the one-shot server already closed itself. */
  closeListen(): Promise<void>
  /** The actually bound port (meaningful after listen resolves; 0 before). */
  readonly port: number
}

/** One-shot loopback listener: the first callback request is answered, then the server closes. */
export function createLoopbackTransport(onServer?: (server: Server) => void): LoopbackTransport {
  let server: Server | null = null
  let boundPort = 0
  return {
    async listen(requestedPort: number, handler: (req: IncomingMessage) => void): Promise<void> {
      if (server !== null && server.listening) {
        throw new Error('oidc-runtime: loopback server is already listening')
      }
      const next = createServer((req, res) => {
        handler(req)
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' })
        res.end('Sage login received. You can close this tab.')
        next.close()
      })
      server = next
      onServer?.(next)
      try {
        await new Promise<void>((resolve, reject) => {
          const onListenError = (error: Error) => { reject(error) }
          next.once('error', onListenError)
          next.listen(requestedPort, '127.0.0.1', () => {
            const address = next.address()
            boundPort = typeof address === 'object' && address !== null ? address.port : 0
            next.off('error', onListenError)
            // After listen, socket-level errors on this one-shot server are non-actionable
            // noise; keep a handler so they cannot crash the main process.
            next.on('error', () => undefined)
            resolve()
          })
        })
      } catch (error) {
        server = null
        throw error
      }
    },
    async closeListen(): Promise<void> {
      const current = server
      server = null
      if (current === null || !current.listening) return
      await new Promise<void>((resolve) => { current.close(() => resolve()) })
    },
    get port(): number { return boundPort },
  }
}

/** Task 3 Important-②: when the system browser fails to open, the loopback server must be
 * closed before the error propagates — the adapter's throw path never reaches its own
 * closeListen, and a leaked fixed port 3000 would kill every later login with EADDRINUSE. */
export function guardOpenExternalCloseListen(
  openExternal: (url: string) => Promise<void>,
  closeListen: () => Promise<void>,
): (url: string) => Promise<void> {
  return async (url: string) => {
    try {
      await openExternal(url)
    } catch (error) {
      await closeListen()
      throw error
    }
  }
}

export interface ProductionAdapterOptions {
  /** Real system-browser open — the main wiring passes Electron's shell.openExternal. */
  readonly openExternal: (url: string) => Promise<void>
  /** WT-02B.2C: identity-handle resolver (main-owned in-memory registry). */
  readonly resolveIdentity: (input: { readonly issuer: string; readonly subject: string }) => { readonly identityHandle: string }
}

/** Assemble the production deps around the kernel adapter: global fetch, real loopback
 * transport, node randomness, wall-clock seconds. Tokens only ever land in the vault. */
export function createProductionAdapter(vault: TokenVault, options: ProductionAdapterOptions) {
  const loopback = createLoopbackTransport()
  const deps: OidcAdapterDeps = {
    fetchImpl: fetch,
    openExternal: guardOpenExternalCloseListen(options.openExternal, () => loopback.closeListen()),
    now: () => Math.floor(Date.now() / 1000),
    listen: (port: number, handler: (req: IncomingMessage) => void) => loopback.listen(port, handler),
    closeListen: () => loopback.closeListen(),
    randomBytes: (n: number) => nodeRandomBytes(n),
    resolveIdentity: options.resolveIdentity,
  }
  return { adapter: createOidcAdapter(deps), loopback }
}
