import { createSign, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createOidcAdapter, extractCandidateOrgRefs, OIDC_CLIENT_ID, OIDC_ISSUER, OIDC_REDIRECT_URI } from '../src/main/oidc-adapter.js'
import type { OidcAdapterDeps } from '../src/main/oidc-adapter.js'
import { createTokenVault } from '../src/main/token-vault.js'

// Real crypto, fake network: the mock IdP signs real ES384 tokens with a real P-384 key.
const NOW = 1_800_000_000

// The adapter draws 32B state, then 32B nonce, then 48B verifier from deps.randomBytes.
// Pinning those draws to deterministic buffers lets the fake IdP and the fake callback
// echo back exactly the state/nonce the adapter generated (spec-shaped: 43/43/64 b64u chars).
const STATE = Buffer.alloc(32, 7).toString('base64url')
const NONCE = Buffer.alloc(32, 8).toString('base64url')

/** WT-02B.2E: the vault mints a per-session ref; tests pin it for deterministic assertions. */
const makeVault = () => createTokenVault({ mintSessionRef: () => 'session-ref-1' })

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
    resolveIdentity: () => ({ identityHandle: 'h-fixed' }),
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
  const vault = makeVault()
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
    // WT-02B.2E: the verified issuer and token lifetime land in the main-internal session context.
    expect(vault.identitySession()).toEqual({
      sessionRef: 'session-ref-1',
      identityHandle: 'h-fixed',
      issuer: OIDC_ISSUER,
      authenticatedAt: '2027-01-15T08:00:00.000Z',
      expiresAt: '2027-01-15T09:00:00.000Z',
    })
  })

  it('falls back to username when name claim is absent', async () => {
    const idp = await fakeIdp()
    const deps = makeDeps(idp)
    deps.setTokenResponse({ access_token: 'at', id_token: idp.idToken({ username: 'bob', sub: 'user-2' }) })
    const { result } = await driveLogin(deps)
    expect(result).toEqual({ ok: true, displayName: 'bob' })
  })

  it('mints the identity handle from the verified (issuer, subject) and stores it in the vault (WT-02B.2C)', async () => {
    const idp = await fakeIdp()
    const calls: Array<{ issuer: string; subject: string; candidateOrgRefs: readonly string[] }> = []
    const deps = makeDeps(idp, {
      resolveIdentity: (input) => { calls.push(input); return { identityHandle: 'h-verified' } },
    })
    deps.setTokenResponse({ access_token: 'at', id_token: idp.idToken({ name: 'Alice', sub: 'user-1' }) })
    const { result, vault } = await driveLogin(deps)
    expect(result).toEqual({ ok: true, displayName: 'Alice' })
    expect(calls).toEqual([{ issuer: OIDC_ISSUER, subject: 'user-1', candidateOrgRefs: [] }])
    expect(vault.identitySession()?.identityHandle).toBe('h-verified')
  })

  it('passes candidate org refs from the verified organization_data claim (WT-02B.2F)', async () => {
    const idp = await fakeIdp()
    const calls: Array<{ issuer: string; subject: string; candidateOrgRefs: readonly string[] }> = []
    const deps = makeDeps(idp, {
      resolveIdentity: (input) => { calls.push(input); return { identityHandle: 'h-verified' } },
    })
    deps.setTokenResponse({
      access_token: 'at',
      id_token: idp.idToken({
        name: 'Alice',
        sub: 'user-1',
        organization_data: [{ id: 'org-a', name: 'Org A' }, { id: 'org-b' }],
      }),
    })
    const { result } = await driveLogin(deps)
    expect(result).toEqual({ ok: true, displayName: 'Alice' })
    expect(calls).toEqual([{ issuer: OIDC_ISSUER, subject: 'user-1', candidateOrgRefs: ['org-a', 'org-b'] }])
  })

  it('never fails login on a malformed organization claim (hints are non-blocking)', async () => {
    const idp = await fakeIdp()
    const calls: Array<{ candidateOrgRefs: readonly string[] }> = []
    const deps = makeDeps(idp, {
      resolveIdentity: (input) => { calls.push(input); return { identityHandle: 'h-verified' } },
    })
    deps.setTokenResponse({
      access_token: 'at',
      id_token: idp.idToken({ name: 'Alice', sub: 'user-1', organization_data: 'not-an-array' }),
    })
    const { result } = await driveLogin(deps)
    expect(result).toEqual({ ok: true, displayName: 'Alice' })
    expect(calls).toEqual([{ issuer: OIDC_ISSUER, subject: 'user-1', candidateOrgRefs: [] }])
  })

  it('rejects a verified token without a subject id before any identity mapping', async () => {
    const idp = await fakeIdp()
    const calls: unknown[] = []
    const deps = makeDeps(idp, {
      resolveIdentity: (input) => { calls.push(input); return { identityHandle: 'h-never' } },
    })
    deps.setTokenResponse({ access_token: 'at', id_token: idp.idToken({ name: 'NoSub' }) })
    const { result, vault } = await driveLogin(deps)
    expect(result).toEqual({ ok: false, code: 'token-verification-failed' })
    expect(calls).toEqual([])
    expect(vault.identitySession()).toBeNull()
  })
})

describe('organization claim extraction (WT-02B.2F)', () => {
  it('returns no refs when the claim is absent or empty', () => {
    expect(extractCandidateOrgRefs({})).toEqual([])
    expect(extractCandidateOrgRefs({ organization_data: [] })).toEqual([])
  })

  it('extracts raw organization ids in order, deduplicated, ignoring other fields', () => {
    expect(extractCandidateOrgRefs({
      organization_data: [
        { id: 'org-a', name: 'Org A', roles: ['admin'] },
        { id: 'org-b' },
        { id: 'org-a', name: 'Dup' },
      ],
    })).toEqual(['org-a', 'org-b'])
  })

  it('drops the entire claim on any malformed shape (strict-whole, no partial trust)', () => {
    const bad: Array<Record<string, unknown>> = [
      { organization_data: 'org-a' },
      { organization_data: ['org-a'] },
      { organization_data: [null] },
      { organization_data: [{ name: 'no id' }] },
      { organization_data: [{ id: '' }] },
      { organization_data: [{ id: ' org-a ' }] },
      { organization_data: [{ id: 42 }] },
      { organization_data: [{ id: 'x'.repeat(129) }] },
      { organization_data: Array.from({ length: 65 }, (_, i) => ({ id: `org-${String(i)}` })) },
      { organization_data: [{ id: 'ok' }, { id: 'bad ' }] },
    ]
    for (const claims of bad) {
      expect(extractCandidateOrgRefs(claims), JSON.stringify(claims).slice(0, 80)).toEqual([])
    }
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
    const vault = makeVault()
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
    const vault = makeVault()
    const adapter = createOidcAdapter(deps)
    const result = await adapter.startLogin(vault)
    expect(result).toEqual({ ok: false, code: 'login-timeout' })
    expect(vault.status()).toBe('signed-out')
  })

  it('login-superseded when a logout lands while the flow is still pending', async () => {
    const idp = await fakeIdp()
    const deps = makeDeps(idp)
    deps.setTokenResponse({ access_token: 'at', id_token: idp.idToken({ name: 'Alice', sub: 'user-1' }) })
    const vault = makeVault()
    const adapter = createOidcAdapter(deps)
    const login = adapter.startLogin(vault)
    for (let i = 0; i < 200 && deps.pendingHandler === undefined; i += 1) {
      await new Promise((r) => { setTimeout(r, 1) })
    }
    vault.signOut() // the user logs out while the browser flow is still in flight
    if (deps.pendingHandler) await deps.pendingHandler()
    expect(await login).toEqual({ ok: false, code: 'login-superseded' })
    expect(vault.snapshot()).toEqual({ status: 'signed-out', displayName: null })
    expect(vault.identitySession()).toBeNull()
  })

  it('login-in-progress when a login starts while a session is already signed in', async () => {
    const idp = await fakeIdp()
    const deps = makeDeps(idp)
    const vault = makeVault()
    vault.beginPending()
    vault.signIn({
      accessToken: 'at',
      idToken: 'it',
      displayName: 'Alice',
      identityHandle: 'h-1',
      issuer: OIDC_ISSUER,
      authenticatedAt: '2027-01-15T08:00:00.000Z',
      expiresAt: '2027-01-15T09:00:00.000Z',
    })
    const result = await createOidcAdapter(deps).startLogin(vault)
    expect(result).toEqual({ ok: false, code: 'login-in-progress' })
    expect(vault.snapshot()).toEqual({ status: 'signed-in', displayName: 'Alice' })
  })
})
