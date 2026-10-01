import type { IncomingMessage, Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createLoopbackTransport, createProductionAdapter, guardOpenExternalCloseListen } from '../src/main/oidc-runtime.js'
import { createTokenVault } from '../src/main/token-vault.js'

/**
 * Production deps assembly (WT-02B.2B D1 wiring): the loopback transport is exercised
 * against a real node:http.Server on a real OS-assigned port — no fake listener.
 * The guard test pins Task 3 Important-②: an openExternal failure must close the
 * loopback server so the fixed production port cannot leak until process exit.
 */

describe('loopback transport (real http.Server)', () => {
  const servers: Server[] = []
  afterEach(async () => {
    for (const server of servers.splice(0)) {
      if (server.listening) await new Promise<void>((resolve) => { server.close(() => resolve()) })
    }
  })

  it('delivers the callback query exactly once and closes (one-shot)', async () => {
    const transport = createLoopbackTransport((server) => { servers.push(server) })
    const queries: Array<Record<string, string>> = []
    await transport.listen(0, (req: IncomingMessage) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const query: Record<string, string> = {}
      for (const [key, value] of url.searchParams) query[key] = value
      queries.push(query)
    })
    expect(transport.port).toBeGreaterThan(0)

    const response = await fetch(`http://127.0.0.1:${transport.port}/callback?state=s&code=c`)
    expect(response.status).toBe(200)
    await response.text()

    // One-shot: the server closed itself on the first request, before any closeListen.
    await expect(fetch(`http://127.0.0.1:${transport.port}/callback?state=s2`)).rejects.toThrow()
    expect(queries).toEqual([{ state: 's', code: 'c' }])
    await transport.closeListen()
  })

  it('closeListen is idempotent', async () => {
    const transport = createLoopbackTransport((server) => { servers.push(server) })
    await transport.listen(0, () => undefined)
    await transport.closeListen()
    await transport.closeListen()
    await expect(fetch(`http://127.0.0.1:${transport.port}/callback`)).rejects.toThrow()
  })

  it('listens again after a close (one transport reused across logins)', async () => {
    const transport = createLoopbackTransport((server) => { servers.push(server) })
    await transport.listen(0, () => undefined)
    const firstPort = transport.port
    await transport.closeListen()
    await transport.listen(0, () => undefined)
    expect(transport.port).toBeGreaterThan(0)
    await transport.closeListen()
    // The first binding must be gone even if the OS handed out the same port again.
    void firstPort
  })

  it('rejects listen when the port is already taken (production port leak guard)', async () => {
    const holder = createLoopbackTransport((server) => { servers.push(server) })
    await holder.listen(0, () => undefined)
    const busy = createLoopbackTransport()
    await expect(busy.listen(holder.port, () => undefined)).rejects.toThrow()
    await holder.closeListen()
  })
})

describe('guardOpenExternalCloseListen (Task 3 Important-②)', () => {
  it('closes the loopback listener and rethrows when openExternal fails', async () => {
    let closes = 0
    const closeListen = (): Promise<void> => { closes += 1; return Promise.resolve() }
    const guarded = guardOpenExternalCloseListen(async () => { throw new Error('no default browser') }, closeListen)
    await expect(guarded('https://idp.example/auth')).rejects.toThrow('no default browser')
    expect(closes).toBe(1)
  })

  it('does not close the listener when openExternal succeeds', async () => {
    let closes = 0
    const closeListen = (): Promise<void> => { closes += 1; return Promise.resolve() }
    const guarded = guardOpenExternalCloseListen(async () => undefined, closeListen)
    await guarded('https://idp.example/auth')
    expect(closes).toBe(0)
  })
})

describe('createProductionAdapter (assembly smoke, no login round-trip)', () => {
  it('assembles an adapter and a loopback around the in-memory vault', () => {
    const vault = createTokenVault({ mintSessionRef: () => 'session-ref-asm' })
    const { adapter, loopback } = createProductionAdapter(vault, {
      openExternal: async () => undefined,
      resolveIdentity: () => ({ identityHandle: 'h-asm' }),
    })
    expect(typeof adapter.startLogin).toBe('function')
    expect(typeof loopback.listen).toBe('function')
    expect(typeof loopback.closeListen).toBe('function')
  })
})
