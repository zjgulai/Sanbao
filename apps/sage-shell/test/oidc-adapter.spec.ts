import { createSign, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createOidcAdapter, OIDC_CLIENT_ID, OIDC_ISSUER, OIDC_REDIRECT_URI } from '../src/main/oidc-adapter.js'
import type { OidcAdapterDeps } from '../src/main/oidc-adapter.js'
import { createTokenVault } from '../src/main/token-vault.js'

// Real crypto, fake network: the mock IdP signs real ES384 tokens with a real P-384 key.
const NOW = 1_800_000_000

// The adapter draws 32B state, then 32B nonce, then 48B verifier from deps.randomBytes.
// Pinning those draws to deterministic buffers lets the fake IdP and the fake callback
// echo back exactly the state/nonce the adapter generated (spec-shaped: 43/43/64 b64u chars).
const STATE = Buffer.alloc(32, 7).toString('base64url')
const NONCE = Buffer.alloc(32, 8).toString('base64url')

async function fakeIdp() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-384' })
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>
  const kid = 'mock-es384'
  const discovery = {
    issuer: OIDC_ISSUER,
    authorization_endpoint: `${OIDC_ISSUER}/auth`,
    token_endpoint: `${OIDC_ISSUER}/token`,
    jwks_uri: `${OIDC_ISSUER}/jwks`,
  }
  const b64u = (b: Buffer) => b.toString('base64url')
  function idToken(claims: Record<string, unknown>): string {
    const header = b64u(Buffer.from(JSON.stringify({ alg: 'ES384', kid })))
    const payload = b64u(Buffer.from(JSON.stringify({ aud: OIDC_CLIENT_ID, iss: OIDC_ISSUER, nonce: NONCE, exp: NOW + 3600, iat: NOW, ...claims })))
    const sig = createSign('SHA384').update(Buffer.from(`${header}.${payload}`)).sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
    return `${header}.${payload}.${b64u(sig)}`
  }
  return { jwks: { keys: [{ ...jwk, kid, use: 'sig' }] }, discovery, idToken }
}

interface DrivableDeps extends OidcAdapterDeps {
  pendingHandler?: () => void | Promise<void>
  setCallback: (q: Record<string, string> | null) => void
  setTokenResponse: (r: object | undefined) => void
}

function makeDeps(idp: Awaited<ReturnType<typeof fakeIdp>>, overrides: Partial<OidcAdapterDeps> = {}): DrivableDeps {
  let callbackQuery: Record<string, string> | null = { state: STATE, code: 'the-code' }
  let tokenResponse: object | undefined = { access_token: 'at', id_token: null as unknown as string }
  let drawn = 0
  const deps: DrivableDeps = {
    fetchImpl: (async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('.well-known/openid-configuration')) return Response.json(idp.discovery)
      if (u.includes('/jwks')) return Response.json(idp.jwks)
      if (u.includes('/token')) {
        if (tokenResponse === undefined) return new Response('server error', { status: 500 })
        return Response.json(tokenResponse)
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch,
    openExternal: async () => undefined,
    now: () => NOW,
    listen: async () => undefined,
    closeListen: async () => undefined,
    randomBytes: ((n: number) => {
      // Deterministic, spec-shaped draws: state 32B→fill 7, nonce 32B→fill 8, verifier 48B→64 b64u chars
      if (n === 32) {
        drawn += 1
        return Buffer.alloc(32, drawn === 1 ? 7 : 8)
      }
      if (n === 48) return Buffer.alloc(48, 9)
      return Buffer.alloc(n, 7)
    }) as (n: number) => Buffer,
    loginTimeoutMs: 60_000,
    ...overrides,
    setCallback: (q) => { callbackQuery = q },
    setTokenResponse: (r) => { tokenResponse = r },
    // Replaced below with the drivable wrapper; kept undefined first for type shape.
    pendingHandler: undefined,
  }
  // Drive the callback with a minimal IncomingMessage stub the adapter can read the query from.
  deps.listen = (async (port: number, handler: (req: import('node:http').IncomingMessage) => void) => {
    deps.pendingHandler = async () => {
      const query = callbackQuery ?? {}
      const url = `http://127.0.0.1:${port}/callback?` + new URLSearchParams(query).toString()
      const req = { url: url.replace(`http://127.0.0.1:${port}`, '') } as import('node:http').IncomingMessage
      handler(req)
    }
  }) as OidcAdapterDeps['listen']
  return deps
}

/** Wait (bounded) until the adapter has installed its callback handler, then drive it. */
async function driveLogin(deps: DrivableDeps) {
  const vault = createTokenVault()
  const adapter = createOidcAdapter(deps)
  const promise = adapter.startLogin(vault)
  for (let i = 0; i < 200 && deps.pendingHandler === undefined; i += 1) {
    await new Promise((r) => { setTimeout(r, 1) })
  }
  if (deps.pendingHandler) await deps.pendingHandler()
  return { result: await promise, vault }
}

describe('oidc-adapter happy path', () => {
  it('signs in end-to-end with real ES384 crypto and fake network', async () => {
    const idp = await fakeIdp()
    const deps = makeDeps(idp)
    deps.setTokenResponse({ access_token: 'at', id_token: idp.idToken({ name: 'Alice', sub: 'user-1' }) })
    const { result, vault } = await driveLogin(deps)
    expect(result).toEqual({ ok: true, displayName: 'Alice' })
    expect(vault.snapshot()).toEqual({ status: 'signed-in', displayName: 'Alice' })
  })

  it('falls back to username when name claim is absent', async () => {
    const idp = await fakeIdp()
    const deps = makeDeps(idp)
    deps.setTokenResponse({ access_token: 'at', id_token: idp.idToken({ username: 'bob', sub: 'user-2' }) })
    const { result } = await driveLogin(deps)
    expect(result).toEqual({ ok: true, displayName: 'bob' })
  })
})

describe('oidc-adapter error matrix (one negative per LoginErrorCode)', () => {
  it('idp-unreachable when discovery fetch fails', async () => {
    const idp = await fakeIdp()
    const deps = makeDeps(idp, { fetchImpl: (async () => { throw new Error('network down') }) as typeof fetch })
    const { result, vault } = await driveLogin(deps)
    expect(result).toEqual({ ok: false, code: 'idp-unreachable' })
    expect(vault.status()).toBe('signed-out')
  })

  it('idp-unreachable when discovery exceeds the size bound', async () => {
    const idp = await fakeIdp()
    const huge = { ...idp.discovery, padding: 'x'.repeat(65 * 1024) }
    const deps = makeDeps(idp, { fetchImpl: (async () => Response.json(huge)) as typeof fetch })
    const { result } = await driveLogin(deps)
    expect(result).toEqual({ ok: false, code: 'idp-unreachable' })
  })

  it('callback-invalid when the callback carries an error param', async () => {
    const idp = await fakeIdp()
    const deps = makeDeps(idp)
    deps.setCallback({ error: 'access_denied', state: STATE })
    const { result, vault } = await driveLogin(deps)
    expect(result).toEqual({ ok: false, code: 'callback-invalid' })
    expect(vault.status()).toBe('signed-out')
  })

  it('callback-invalid on state mismatch', async () => {
    const idp = await fakeIdp()
    const deps = makeDeps(idp)
    deps.setCallback({ state: 'attacker', code: 'c' })
    const { result } = await driveLogin(deps)
    expect(result).toEqual({ ok: false, code: 'callback-invalid' })
  })

  it('token-verification-failed when the ID token is signed by an unknown key', async () => {
    const idp = await fakeIdp()
    const { privateKey: attackerKey } = generateKeyPairSync('ec', { namedCurve: 'P-384' })
    const b64u = (b: Buffer) => b.toString('base64url')
    const header = b64u(Buffer.from(JSON.stringify({ alg: 'ES384', kid: 'mock-es384' })))
    const payload = b64u(Buffer.from(JSON.stringify({ aud: OIDC_CLIENT_ID, iss: OIDC_ISSUER, nonce: NONCE, exp: NOW + 3600, iat: NOW, name: 'Mallory' })))
    const sig = createSign('SHA384').update(Buffer.from(`${header}.${payload}`)).sign({ key: attackerKey, dsaEncoding: 'ieee-p1363' })
    const deps = makeDeps(idp)
    deps.setTokenResponse({ access_token: 'at', id_token: `${header}.${payload}.${b64u(sig)}` })
    const { result, vault } = await driveLogin(deps)
    expect(result).toEqual({ ok: false, code: 'token-verification-failed' })
    expect(vault.status()).toBe('signed-out')
  })

  it('token-verification-failed when the nonce does not match', async () => {
    const idp = await fakeIdp()
    const deps = makeDeps(idp)
    deps.setTokenResponse({ access_token: 'at', id_token: idp.idToken({ nonce: 'other-nonce', name: 'Eve' }) })
    const { result } = await driveLogin(deps)
    expect(result).toEqual({ ok: false, code: 'token-verification-failed' })
  })

  it('login-in-progress when a second login starts during pending', async () => {
    const idp = await fakeIdp()
    const deps = makeDeps(idp)
    const vault = createTokenVault()
    const adapter = createOidcAdapter(deps)
    const first = adapter.startLogin(vault)
    const second = await adapter.startLogin(vault)
    expect(second).toEqual({ ok: false, code: 'login-in-progress' })
    // Let the first login run to completion (callback driven, default token response has no id_token).
    for (let i = 0; i < 200 && deps.pendingHandler === undefined; i += 1) {
      await new Promise((r) => { setTimeout(r, 1) })
    }
    if (deps.pendingHandler) await deps.pendingHandler()
    await first
    vault.signOut()
  })

  it('login-timeout when no callback arrives in the window', async () => {
    const idp = await fakeIdp()
    const deps = makeDeps(idp)
    deps.listen = async () => undefined as unknown as void // never captures the handler → no callback fires
    deps.loginTimeoutMs = 30 // short window so the test observes the timeout promptly
    const vault = createTokenVault()
    const adapter = createOidcAdapter(deps)
    const result = await adapter.startLogin(vault)
    expect(result).toEqual({ ok: false, code: 'login-timeout' })
    expect(vault.status()).toBe('signed-out')
  })
})
