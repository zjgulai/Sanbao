# WT-02B.2B OIDC 登录链路实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接上真实 Logto IdP 完成 Sage 登录链路闭环：renderer 登录按钮 → main 唤起系统浏览器（Authorization Code + PKCE S256）→ loopback 收 callback → token exchange → 验证内核（新增 ES384）全链验证 → token 进纯内存 vault → state 反映登录态。

**Architecture:** 内核扩展在 `src/security/oidc/`（零 Electron import）；adapter/vault 在 `src/main/`（专属，允许 Electron）；auth 合同纯数据进 `src/appservice/`（firewall 射程内，adapter 实例由 main 注入）。全注入式设计：单测密码学真实、网络假；唯一真实网络在端到端验收（用户浏览器登录 Logto）。

**Tech Stack:** TypeScript (tsc 严格)、node:crypto、node:http（loopback）、Electron shell.openExternal、vitest 经 `node scripts/test.mjs run`（子串过滤）。

**Spec:** `docs/superpowers/specs/2026-10-01-wt02b2b-oidc-login-adapter-design.md`

## Global Constraints

- **token/session/raw claims 只存 main 内存 vault**；不进 renderer/Host/Harness/插件/日志/导出/持久化（治理红线，spec §5）。accessToken/idToken **零读取出口**（类型面即合同）。
- **无 client secret**：token exchange 只带 `grant_type/code/redirect_uri/client_id/code_verifier`（PKCE-only，spec §1）。
- `src/security/oidc/` 零 Electron import；`src/appservice/` firewall 约束不变（auth 合同纯数据）。
- 错误体脱敏：LoginErrorCode = `'idp-unreachable' | 'callback-invalid' | 'token-verification-failed' | 'login-timeout' | 'login-in-progress'`，无 provider 原文/token 片段/stack。
- 尺寸上界（spec §4）：discovery ≤64KiB、JWKS ≤256KiB、token 响应 ≤64KiB、JWKS keys ≤16——超限 fail closed。
- state/nonce/challenge 全等比较用 `timingSafeEqual`（ADR-0182 seam 兑现）。
- 真实参数（spec §1，可入库非凭据）：issuer `https://dk7z03.logto.app/oidc`、clientId `lck70zxqbzr62dw39ykqh`、redirect `http://127.0.0.1:3000/callback`、scopes `openid profile offline_access`、ES384。
- 不做（spec §9）：refresh/revocation 调用、safeStorage 落盘、多账户、identity-policy resolver 迁移、access token 消费方。
- 测试命令在 `apps/sage-shell/`：`node scripts/test.mjs run <substring>`；类型 `npm run typecheck`；门禁仓根 `node scripts/gate.mjs`（25/25）。
- 每任务一 commit（gate 绿前置）；收口票附 Note + ADR-0183。
- **已知计划数据纪律（前票三例教训）**：手写密码学测试字面量必须 roundtrip 自检（b64u 段 re-encode 相等才算合法输入）；测试字面量与断言语义矛盾时守意图最小改、报告披露。

---

### Task 1: 内核 ES384 + seam 兑现

**Files:**
- Modify: `apps/sage-shell/src/security/oidc/jws.ts`
- Modify: `apps/sage-shell/src/security/oidc/callback.ts`（timingSafeEqual）
- Modify: `apps/sage-shell/src/security/oidc/metadata.ts`（不改动逻辑，仅确认无比较点遗漏）
- Modify: `apps/sage-shell/src/security/oidc/id-token.ts`（nonce/iss 比较 timingSafeEqual）
- Modify: `apps/sage-shell/test/fixtures/oidc-keys.ts`（P-384 密钥对）
- Test: `apps/sage-shell/test/oidc-jws.spec.ts`（扩展）、`apps/sage-shell/test/oidc-id-token.spec.ts`（混合 aud 负例）

**Interfaces:**
- Consumes: 既有 `verifyCompactJws`（`'RS256' | 'ES256'` 联合、crit 检查在 alg 后）。
- Produces: `acceptedAlgs` 联合扩为 `('RS256' | 'ES256' | 'ES384')[]`（Task 5 adapter 消费）；fixture `generateOidcKeys` 增加 kid `'test-es384'`；`signEs384Der(keys)`、`signEs384RawWithLength(keys, length)` 负例工具。

- [ ] **Step 1: 写失败测试（追加到 oidc-jws.spec.ts）**

```ts
describe('ES384 support', () => {
  it('accepts a correctly signed ES384 token (raw P-1363, 96 bytes)', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-es384', 'ES384', {}, { sub: 'user-1' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['ES384'] }))
      .toEqual({ ok: true, protectedHeader: expect.objectContaining({ alg: 'ES384', kid: 'test-es384' }), payload: { sub: 'user-1' } })
  })

  it('rejects an ES384 signature in DER form and a wrong-length raw signature', async () => {
    const keys = await generateOidcKeys()
    expect(verifyCompactJws({ untrustedToken: signEs384Der(keys), jwks: keys.jwks, acceptedAlgs: ['ES384'] })).toEqual({ ok: false, reason: 'signature-invalid' })
    expect(verifyCompactJws({ untrustedToken: signEs384RawWithLength(keys, 95), jwks: keys.jwks, acceptedAlgs: ['ES384'] })).toEqual({ ok: false, reason: 'signature-invalid' })
  })

  it('rejects ES384 alg matched with a P-256 key (crv confusion)', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-ec', 'ES256', { alg: 'ES384' }, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['ES384'] })).toEqual({ ok: false, reason: 'key-type-mismatch' })
  })
})

describe('seam negative cases promoted (ADR-0182)', () => {
  it('rejects JWKS with duplicate kid entries', async () => {
    const keys = await generateOidcKeys()
    const dupJwks = { keys: [...keys.jwks.keys, { ...keys.jwks.keys[0] }] }
    const token = signJws(keys, 'test-rsa', 'RS256', {}, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: dupJwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'kid-not-found' })
  })

  it('rejects a non-string kid in the header', async () => {
    const keys = await generateOidcKeys()
    const token = signRawSegments(keys, 'test-rsa', 'RS256', JSON.stringify({ alg: 'RS256', kid: 42 }), { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'missing-kid' })
  })
})
```

（混合 aud 负例追加到 oidc-id-token.spec.ts：）

```ts
it('rejects a mixed-type aud array as aud-missing', async () => {
  const { keys, token } = await tokenWith({ aud: ['sage-desktop', 42] })
  expect(verify(token, keys.jwks)).toEqual({ ok: false, reason: 'aud-missing' })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc-jws`
Expected: 新增 4 用例 FAIL（ES384 未实现/fixture 无 test-es384/负例未拒）

- [ ] **Step 3: 写实现**

fixture `test/fixtures/oidc-keys.ts`——`generateOidcKeys` 增加 P-384：

```ts
const es384 = generateKeyPairSync('ec', { namedCurve: 'P-384' })
const es384Jwk = es384.publicKey.export({ format: 'jwk' }) as Record<string, unknown>
// jwks.keys 数组追加 { ...es384Jwk, kid: 'test-es384', use: 'sig' }
// privateKey 追加 'test-es384': es384.privateKey
```

`signJws`/`signRawHeader` 的 alg 参数类型放宽为 `'RS256' | 'ES256' | 'ES384'`，签名分支：

```ts
const key = alg === 'ES256' || alg === 'ES384'
  ? { key: keys.privateKey[kid]!, dsaEncoding: 'ieee-p1363' as const }
  : keys.privateKey[kid]!
const sig = createSign(alg === 'RS256' ? 'RSA-SHA256' : alg === 'ES384' ? 'SHA384' : 'SHA256')
  .update(Buffer.from(signingInput)).sign(key)
```

负例工具（复刻 ES256 形）：

```ts
export function signEs384Der(keys: OidcKeySet): string {
  const header = b64u(Buffer.from(JSON.stringify({ alg: 'ES384', kid: 'test-es384' })))
  const payload = b64u(Buffer.from(JSON.stringify({ sub: 'x' })))
  const sig = createSign('SHA384').update(Buffer.from(`${header}.${payload}`)).sign(keys.privateKey['test-es384']!) // DER
  return `${header}.${payload}.${b64u(sig)}`
}
export function signEs384RawWithLength(keys: OidcKeySet, length: number): string {
  const header = b64u(Buffer.from(JSON.stringify({ alg: 'ES384', kid: 'test-es384' })))
  const payload = b64u(Buffer.from(JSON.stringify({ sub: 'x' })))
  const sig = createSign('SHA384').update(Buffer.from(`${header}.${payload}`)).sign({ key: keys.privateKey['test-es384']!, dsaEncoding: 'ieee-p1363' })
  return `${header}.${payload}.${b64u(sig.subarray(0, length))}`
}
```

`jws.ts` 修改：

```ts
type EcAlg = 'ES256' | 'ES384'
// algMatchesKeyType:
if (alg === 'RS256') return jwk.kty === 'RSA'
if (alg === 'ES256') return jwk.kty === 'EC' && jwk.crv === 'P-256'
return jwk.kty === 'EC' && jwk.crv === 'P-384'
// verifySignature:
if (alg === 'ES256' || alg === 'ES384') {
  const expectedLen = alg === 'ES256' ? 64 : 96
  if (signature.length !== expectedLen) return false
  const hash = alg === 'ES256' ? 'SHA256' : 'SHA384'
  try { return createVerify(hash).update(signingInput).verify({ key, dsaEncoding: 'ieee-p1363' }, signature) } catch { return false }
}
// 55 行的 alg 收窄与 34 行 acceptedAlgs 类型同步扩为 'RS256' | 'ES256' | 'ES384'
```

`id-token.ts`：`verifyIdToken` 内部对 `verifyCompactJws` 的 `acceptedAlgs` 传 `['RS256', 'ES256', 'ES384']`；nonce/iss 的 `!==` 全等比较替换为 timingSafeEqual 封装：

```ts
import { timingSafeEqual } from 'node:crypto'
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
```

`callback.ts`：`state !== expectedState` 换 `!safeEqual(state, expectedState)`（同款封装）；`verifyPkceS256` 的 challenge 比较换 `safeEqual(computed, input.challenge)`。

- [ ] **Step 4: 跑测试确认通过（含既有全绿）**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc`
Expected: oidc 全套通过（既有 + 新增约 5 用例）；timingSafeEqual 改动不破既有断言（等值语义不变）

- [ ] **Step 5: typecheck + gate + commit**

```bash
cd apps/sage-shell && npm run typecheck && cd ../.. && node scripts/gate.mjs
git add apps/sage-shell/src/security/oidc/ apps/sage-shell/test/fixtures/oidc-keys.ts apps/sage-shell/test/oidc-jws.spec.ts apps/sage-shell/test/oidc-id-token.spec.ts
git commit -m "feat(sage): ES384 kernel support and timing-safe comparisons (WT-02B.2B D1)"
```

---

### Task 2: token-vault.ts — 纯内存 vault

**Files:**
- Create: `apps/sage-shell/src/main/token-vault.ts`
- Test: `apps/sage-shell/test/token-vault.spec.ts`

**Interfaces:**
- Produces（Task 3/5 消费）:
  - `createTokenVault(): TokenVault`
  - `interface TokenVault { status(): 'signed-out'|'pending'|'signed-in'; beginPending(): boolean; signIn(session: {readonly accessToken: string; readonly idToken: string; readonly displayName: string|null}): void; signOut(): void; snapshot(): {readonly status: 'signed-out'|'signed-in'; readonly displayName: string|null} }`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { createTokenVault } from '../src/main/token-vault.js'

describe('TokenVault', () => {
  it('starts signed-out with null displayName', () => {
    const vault = createTokenVault()
    expect(vault.status()).toBe('signed-out')
    expect(vault.snapshot()).toEqual({ status: 'signed-out', displayName: null })
  })

  it('transitions signed-out → pending → signed-in and back', () => {
    const vault = createTokenVault()
    expect(vault.beginPending()).toBe(true)
    expect(vault.status()).toBe('pending')
    vault.signIn({ accessToken: 'at', idToken: 'it', displayName: 'Alice' })
    expect(vault.snapshot()).toEqual({ status: 'signed-in', displayName: 'Alice' })
    vault.signOut()
    expect(vault.snapshot()).toEqual({ status: 'signed-out', displayName: null })
    expect(vault.status()).toBe('signed-out')
  })

  it('rejects beginPending when already pending (one login at a time)', () => {
    const vault = createTokenVault()
    expect(vault.beginPending()).toBe(true)
    expect(vault.beginPending()).toBe(false)
  })

  it('recovers to signed-out after a failed pending (explicit reset)', () => {
    const vault = createTokenVault()
    vault.beginPending()
    vault.signOut() // adapter failure path uses signOut as reset
    expect(vault.status()).toBe('signed-out')
    expect(vault.beginPending()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/sage-shell && node scripts/test.mjs run token-vault`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

```ts
/** WT-02B.2B in-memory token vault: tokens never leave main, never persist, never log. */
export interface VaultSession {
  readonly accessToken: string
  readonly idToken: string
  readonly displayName: string | null
}

export interface TokenVaultSnapshot {
  readonly status: 'signed-out' | 'signed-in'
  readonly displayName: string | null
}

export interface TokenVault {
  status(): 'signed-out' | 'pending' | 'signed-in'
  beginPending(): boolean
  signIn(session: VaultSession): void
  signOut(): void
  snapshot(): TokenVaultSnapshot
}

export function createTokenVault(): TokenVault {
  let status: 'signed-out' | 'pending' | 'signed-in' = 'signed-out'
  let session: VaultSession | null = null
  return {
    status: () => status,
    beginPending(): boolean {
      if (status === 'pending') return false
      status = 'pending'
      return true
    },
    signIn(next: VaultSession): void {
      session = next
      status = 'signed-in'
    },
    signOut(): void {
      // Drop references immediately; nothing persisted anywhere else by contract.
      session = null
      status = 'signed-out'
    },
    snapshot: () => session === null
      ? { status: 'signed-out' as const, displayName: null }
      : { status: 'signed-in' as const, displayName: session.displayName },
  }
}
```

（token 本体只在闭包 `session` 内，`snapshot` 是唯一读取出口且只吐脱敏字段——类型面即「零 token 出口」合同。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/sage-shell && node scripts/test.mjs run token-vault`
Expected: PASS（4 tests）

- [ ] **Step 5: typecheck + gate + commit**

```bash
cd apps/sage-shell && npm run typecheck && cd ../.. && node scripts/gate.mjs
git add apps/sage-shell/src/main/token-vault.ts apps/sage-shell/test/token-vault.spec.ts
git commit -m "feat(sage): in-memory token vault with zero token read surface (WT-02B.2B D3)"
```

---

### Task 3: oidc-config + oidc-adapter — 登录流程编排（全注入）

**Files:**
- Create: `apps/sage-shell/src/main/oidc-config.ts`
- Create: `apps/sage-shell/src/main/oidc-adapter.ts`
- Test: `apps/sage-shell/test/oidc-adapter.spec.ts`

**Interfaces:**
- Consumes: `verifyProviderMetadata`（metadata.ts）、`verifyIdToken`（id-token.ts）、`verifyAuthorizationCallback`（callback.ts）、`verifyPkceS256`、`createTokenVault`（Task 2）。
- Produces（Task 5 消费）:
  - `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_REDIRECT_URI`/`OIDC_SCOPES` 常量
  - `createOidcAdapter(deps: OidcAdapterDeps): OidcAdapter`
  - `interface OidcAdapter { startLogin(vault: TokenVault): Promise<LoginOutcome> }`
  - `type LoginErrorCode = 'idp-unreachable' | 'callback-invalid' | 'token-verification-failed' | 'login-timeout' | 'login-in-progress'`
  - `interface OidcAdapterDeps { readonly fetchImpl: typeof fetch; readonly openExternal: (url: string) => Promise<void>; readonly now: () => number; readonly listen: (port: number, handler: (req: import('node:http').IncomingMessage) => void) => Promise<void>; readonly closeListen: () => Promise<void>; readonly randomBytes: (n: number) => Buffer; readonly loginTimeoutMs?: number }`

- [ ] **Step 1: 写失败测试（负例矩阵逐 LoginErrorCode）**

```ts
import { createHash, createSign, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createOidcAdapter, OIDC_CLIENT_ID, OIDC_ISSUER, OIDC_REDIRECT_URI } from '../src/main/oidc-adapter.js'
import type { OidcAdapterDeps } from '../src/main/oidc-adapter.js'
import { createTokenVault } from '../src/main/token-vault.js'

// Real crypto, fake network: the mock IdP signs real ES384 tokens with a real P-384 key.
const NOW = 1_800_000_000

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
    const payload = b64u(Buffer.from(JSON.stringify({ aud: OIDC_CLIENT_ID, iss: OIDC_ISSUER, nonce: 'the-nonce', exp: NOW + 3600, iat: NOW, ...claims })))
    const sig = createSign('SHA384').update(Buffer.from(`${header}.${payload}`)).sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
    return `${header}.${payload}.${b64u(sig)}`
  }
  return { jwks: { keys: [{ ...jwk, kid, use: 'sig' }] }, discovery, idToken }
}

function makeDeps(idp: Awaited<ReturnType<typeof fakeIdp>>, overrides: Partial<OidcAdapterDeps> = {}) {
  let callbackQuery: Record<string, string> | null = { state: 'the-state', code: 'the-code' }
  let tokenResponse: object | undefined = { access_token: 'at', id_token: null as unknown as string }
  const deps: OidcAdapterDeps & { setCallback: (q: Record<string, string> | null) => void; setTokenResponse: (r: object | undefined) => void } = {
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
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
    listen: async (port, handler) => { void port; deps.pendingHandler = handler },
    closeListen: async () => undefined,
    randomBytes: ((n: number) => {
      // Deterministic, spec-shaped values: state/nonce 32B, verifier 48B→64 b64u chars
      if (n === 32) return Buffer.alloc(32, 7)
      if (n === 48) return Buffer.alloc(48, 7)
      return Buffer.alloc(n, 7)
    }) as (n: number) => Buffer,
    loginTimeoutMs: 60_000,
    ...overrides,
    pendingHandler: undefined as unknown as (req: import('node:http').IncomingMessage) => void,
    setCallback: (q) => { callbackQuery = q },
    setTokenResponse: (r) => { tokenResponse = r },
  }
  // Drive the callback with a minimal IncomingMessage stub the adapter can read the query from.
  const originalListen = deps.listen
  deps.listen = (async (port: number, handler: (req: import('node:http').IncomingMessage) => void) => {
    deps.pendingHandler = async () => {
      const query = callbackQuery ?? {}
      const url = `http://127.0.0.1:${port}/callback?` + new URLSearchParams(query).toString()
      const req = { url: url.replace(`http://127.0.0.1:${port}`, '') } as import('node:http').IncomingMessage
      handler(req)
    }
  }) as OidcAdapterDeps['listen']
  void originalListen
  return deps
}

async function driveLogin(deps: OidcAdapterDeps & { pendingHandler?: () => void | Promise<void> }) {
  const vault = createTokenVault()
  const adapter = createOidcAdapter(deps)
  const promise = adapter.startLogin(vault)
  await new Promise((r) => { setTimeout(r, 0) })
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
    deps.setCallback({ error: 'access_denied', state: 'the-state' })
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
    const payload = b64u(Buffer.from(JSON.stringify({ aud: OIDC_CLIENT_ID, iss: OIDC_ISSUER, nonce: 'the-nonce', exp: NOW + 3600, iat: NOW, name: 'Mallory' })))
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
    await first.catch(() => undefined)
    vault.signOut()
  })

  it('login-timeout when no callback arrives in the window', async () => {
    const idp = await fakeIdp()
    const deps = makeDeps(idp)
    deps.listen = async () => undefined as unknown as void  // never captures the handler → no callback fires
    const vault = createTokenVault()
    const adapter = createOidcAdapter(deps)
    const result = await adapter.startLogin(vault)
    expect(result).toEqual({ ok: false, code: 'login-timeout' })
    expect(vault.status()).toBe('signed-out')
  })
})
```

（fakeIdp 的 `randomBytes` 钉死：state/nonce 由 `Buffer.alloc(32,7)` 产 b64u `B*` 前缀串——测试里 `the-state`/`the-nonce` 是 callback/token 内嵌的字面量，与 `consumeState`/`expectedNonce` 传参一致即可：**adapter 接口把 expectedState/expectedNonce 作为返回值交给测试驱动层**，见 Step 3 的 `LoginContext` 设计——实现者若发现测试与该接口不吻合，按「守意图、最小改动、报告披露」处理并在报告中记录接口对齐方式。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc-adapter`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

`oidc-config.ts`：

```ts
/** Real Logto deployment inputs (non-secret, spec §1). Public client + PKCE only — no secret by architecture. */
export const OIDC_ISSUER = 'https://dk7z03.logto.app/oidc'
export const OIDC_CLIENT_ID = 'lck70zxqbzr62dw39ykqh'
export const OIDC_REDIRECT_URI = 'http://127.0.0.1:3000/callback'
export const OIDC_SCOPES = 'openid profile offline_access'
export const OIDC_DISCOVERY_URL = `${OIDC_ISSUER}/.well-known/openid-configuration`
export const OIDC_LOOPBACK_PORT = 3000
export const OIDC_LOGIN_TIMEOUT_MS = 5 * 60_000
```

`oidc-adapter.ts`：

```ts
/** WT-02B.2B login adapter: system-browser auth-code + PKCE, kernel-verified, in-memory only. */
import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { shell } from 'electron'
import { verifyAuthorizationCallback, verifyIdToken, verifyProviderMetadata } from '../security/oidc/index.js'
import { OIDC_CLIENT_ID, OIDC_DISCOVERY_URL, OIDC_ISSUER, OIDC_LOGIN_TIMEOUT_MS, OIDC_LOOPBACK_PORT, OIDC_REDIRECT_URI, OIDC_SCOPES } from './oidc-config.js'
import type { TokenVault } from './token-vault.js'

export type LoginErrorCode = 'idp-unreachable' | 'callback-invalid' | 'token-verification-failed' | 'login-timeout' | 'login-in-progress'
export type LoginOutcome = { readonly ok: true; readonly displayName: string | null } | { readonly ok: false; readonly code: LoginErrorCode }

export interface OidcAdapterDeps {
  readonly fetchImpl: typeof fetch
  readonly openExternal: (url: string) => Promise<void>
  readonly now: () => number
  readonly listen: (port: number, handler: (req: IncomingMessage) => void) => Promise<void>
  readonly closeListen: () => Promise<void>
  readonly randomBytes: (n: number) => Buffer
  readonly loginTimeoutMs?: number
}

const MAX_DISCOVERY_BYTES = 64 * 1024
const MAX_JWKS_BYTES = 256 * 1024
const MAX_TOKEN_RESPONSE_BYTES = 64 * 1024
const MAX_JWKS_KEYS = 16

async function fetchJsonWithLimit(fetchImpl: typeof fetch, url: string, limit: number): Promise<unknown | undefined> {
  const response = await fetchImpl(url)
  if (!response.ok) return undefined
  const text = await response.text()
  if (text.length > limit) return undefined
  try { return JSON.parse(text) } catch { return undefined }
}

export function createOidcAdapter(deps: OidcAdapterDeps) {
  const consumedStates = new Set<string>()
  return {
    async startLogin(vault: TokenVault): Promise<LoginOutcome> {
      if (!vault.beginPending()) return { ok: false, code: 'login-in-progress' }
      try {
        const state = deps.randomBytes(32).toString('base64url')
        const nonce = deps.randomBytes(32).toString('base64url')
        const verifier = deps.randomBytes(48).toString('base64url')
        const challenge = createHash('sha256').update(verifier).digest('base64url')
        consumedStates.add(state)

        const discovery = await fetchJsonWithLimit(deps.fetchImpl, OIDC_DISCOVERY_URL, MAX_DISCOVERY_BYTES)
        if (discovery === undefined) return { ok: false, code: 'idp-unreachable' }
        const metadataOk = verifyProviderMetadata({
          untrusted: discovery,
          expected: {
            issuer: OIDC_ISSUER,
            authorizationEndpoint: `${OIDC_ISSUER}/auth`,
            tokenEndpoint: `${OIDC_ISSUER}/token`,
            jwksUri: `${OIDC_ISSUER}/jwks`,
          },
        })
        if (!metadataOk.ok) return { ok: false, code: 'idp-unreachable' }

        let callbackResolve: (query: Record<string, string>) => void
        const callbackPromise = new Promise<Record<string, string> | null>((resolve) => { callbackResolve = resolve })
        const timeoutMs = deps.loginTimeoutMs ?? OIDC_LOGIN_TIMEOUT_MS
        const timer = setTimeout(() => callbackResolve(null as unknown as Record<string, string>), timeoutMs)
        timer.unref?.()

        await deps.listen(OIDC_LOOPBACK_PORT, (req: IncomingMessage) => {
          const url = new URL(req.url ?? '/callback', `http://127.0.0.1:${OIDC_LOOPBACK_PORT}`)
          const query: Record<string, string> = {}
          for (const [k, v] of url.searchParams) query[k] = v
          callbackResolve(query)
        })

        const authUrl = new URL(`${OIDC_ISSUER}/auth`)
        authUrl.searchParams.set('client_id', OIDC_CLIENT_ID)
        authUrl.searchParams.set('redirect_uri', OIDC_REDIRECT_URI)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('scope', OIDC_SCOPES)
        authUrl.searchParams.set('state', state)
        authUrl.searchParams.set('nonce', nonce)
        authUrl.searchParams.set('code_challenge', challenge)
        authUrl.searchParams.set('code_challenge_method', 'S256')
        await deps.openExternal(authUrl.toString())

        const query = await callbackPromise
        clearTimeout(timer)
        await deps.closeListen()

        const callback = verifyAuthorizationCallback({
          untrustedQuery: query ?? {},
          expectedState: state,
          consumeState: (s) => consumedStates.delete(s),
          codeVerifier: verifier,
        })
        if (!callback.ok) return { ok: false, code: query === null ? 'login-timeout' : 'callback-invalid' }

        const tokenResponse = await deps.fetchImpl(`${OIDC_ISSUER}/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: callback.authorizationCode,
            redirect_uri: OIDC_REDIRECT_URI,
            client_id: OIDC_CLIENT_ID,
            code_verifier: verifier,
          }).toString(),
        })
        if (!tokenResponse.ok) return { ok: false, code: 'token-verification-failed' }
        const tokenText = await tokenResponse.text()
        if (tokenText.length > MAX_TOKEN_RESPONSE_BYTES) return { ok: false, code: 'token-verification-failed' }
        let tokenJson: unknown
        try { tokenJson = JSON.parse(tokenText) } catch { return { ok: false, code: 'token-verification-failed' } }
        const record = tokenJson as Record<string, unknown>
        if (typeof record.id_token !== 'string') return { ok: false, code: 'token-verification-failed' }

        const jwks = await fetchJsonWithLimit(deps.fetchImpl, `${OIDC_ISSUER}/jwks`, MAX_JWKS_BYTES)
        if (jwks === undefined) return { ok: false, code: 'idp-unreachable' }
        const keys = (jwks as { keys?: unknown[] }).keys
        if (!Array.isArray(keys) || keys.length > MAX_JWKS_KEYS) return { ok: false, code: 'idp-unreachable' }

        const verified = verifyIdToken({
          untrustedToken: record.id_token,
          jwks,
          expectedIssuer: OIDC_ISSUER,
          clientId: OIDC_CLIENT_ID,
          expectedNonce: nonce,
          now: deps.now(),
          clockSkewSeconds: 60,
        })
        if (!verified.ok) return { ok: false, code: 'token-verification-failed' }

        const claims = verified.claims
        const displayName = typeof claims.name === 'string' ? claims.name
          : typeof claims.username === 'string' ? claims.username : null
        vault.signIn({ accessToken: typeof record.access_token === 'string' ? record.access_token : '', idToken: record.id_token, displayName })
        return { ok: true, displayName }
      } catch {
        return { ok: false, code: 'idp-unreachable' }
      } finally {
        if (vault.status() === 'pending') vault.signOut()
      }
    },
  }
}

export type OidcAdapter = ReturnType<typeof createOidcAdapter>
```

（实现细节授权：① `security/oidc/index.ts` barrel 若不存在则新建（四个模块 re-export）；② 生产 `listen`/`closeListen` 用 `node:http` 真实 server，`openExternal` 用 `shell.openExternal`——两者作为 main 接线时的真实 deps 由 Task 6 组装，本任务的 `createOidcAdapter` 只消费注入；③ catch-all 只兜意外异常并 fail closed，不打日志。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc-adapter`
Expected: PASS（约 10 tests，happy×2 + 负例矩阵 8）

- [ ] **Step 5: typecheck + gate + commit**

```bash
cd apps/sage-shell && npm run typecheck && cd ../.. && node scripts/gate.mjs
git add apps/sage-shell/src/main/oidc-config.ts apps/sage-shell/src/main/oidc-adapter.ts apps/sage-shell/src/security/oidc/index.ts apps/sage-shell/test/oidc-adapter.spec.ts
git commit -m "feat(sage): OIDC login adapter with injected transports and kernel verification (WT-02B.2B D1)"
```

---

### Task 4: auth 合同 + login/logout 路由 + renderer 登录面

**Files:**
- Modify: `apps/sage-shell/src/appservice/contracts.ts`
- Modify: `apps/sage-shell/src/appservice/route-skeleton.ts`
- Modify: `apps/sage-shell/src/appservice/composition.ts`
- Modify: `apps/sage-shell/src/product/renderer.ts`
- Test: `apps/sage-shell/test/appservice-route-skeleton.spec.ts`（扩展）、`apps/sage-shell/test/appservice-composition.spec.ts`（扩展）

**Interfaces:**
- Consumes: `TokenVaultSnapshot`（Task 2）；`LoginOutcome`/`LoginErrorCode`（Task 3，仅类型引用——composition 层不 import adapter 实现，auth 状态由注入的 provider 函数求值）。
- Produces:
  - `ServiceStatus` 扩展 `auth: { readonly status: 'signed-in'|'signed-out'|'pending'; readonly displayName: string | null }`
  - `ServiceProviders` 扩展 `login: () => Promise<Response>`、`logout: () => Promise<Response>`；`readState` 的 auth 子对象来自注入的 `authSnapshot: () => TokenVaultSnapshot`
  - 路由：`GET /.sage/login`、`POST /.sage/logout`

- [ ] **Step 1: 写失败测试**

route-skeleton 扩展：

```ts
describe('auth routes', () => {
  const providers = {
    readState: async () => new Response('{}'),
    dispatch: async () => new Response('{}'),
    login: async () => Response.json({ auth: 'pending' }, { status: 202, headers: { 'cache-control': 'no-store' } }),
    logout: async () => Response.json({ auth: 'signed-out' }, { status: 200, headers: { 'cache-control': 'no-store' } }),
  }

  it('GET /.sage/login routes to the login provider', async () => {
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/login'), { callerBinding: { correlation: 'c' }, providers })
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ auth: 'pending' })
  })

  it('POST /.sage/logout routes to the logout provider', async () => {
    const response = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
      { callerBinding: { correlation: 'c' }, providers })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ auth: 'signed-out' })
  })

  it('login with wrong method is rejected 405', async () => {
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), { callerBinding: { correlation: 'c' }, providers })
    expect(response.status).toBe(405)
  })
})
```

composition 扩展：

```ts
describe('auth in state', () => {
  it('readState carries the auth sub-object from the injected snapshot', async () => {
    const service = createUnavailableFirstService(null, { authSnapshot: () => ({ status: 'signed-in', displayName: 'Alice' }) })
    const body = await (await service.readState()).json() as Record<string, unknown>
    expect(body.service).toMatchObject({ auth: { status: 'signed-in', displayName: 'Alice' } })
  })

  it('default auth snapshot is signed-out (no provider injected)', async () => {
    const service = createUnavailableFirstService(null)
    const body = await (await service.readState()).json() as Record<string, unknown>
    expect(body.service).toMatchObject({ auth: { status: 'signed-out', displayName: null } })
  })

  it('login provider returns typed denial for a failing login', async () => {
    const service = createUnavailableFirstService(null, { login: async () => Response.json({ code: 'idp-unreachable', stage: 'login', retryable: true, correlation: 'x' }, { status: 200, headers: { 'cache-control': 'no-store' } }) })
    const response = await service.login()
    expect(await response.json()).toMatchObject({ code: 'idp-unreachable' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/sage-shell && node scripts/test.mjs run appservice-route`
Expected: 新增 FAIL（providers 无 login/logout、路由不存在）；`appservice-composition` 同理

- [ ] **Step 3: 写实现**

`contracts.ts`：

```ts
export interface AuthStatus {
  readonly status: 'signed-in' | 'signed-out' | 'pending'
  readonly displayName: string | null
}

export interface ServiceStatus {
  readonly status: 'unavailable'
  readonly reason: ServiceUnavailableReason
  readonly auth: AuthStatus
  readonly correlation: string
}

export interface ServiceProviders {
  readonly readState: () => Promise<Response>
  readonly dispatch: () => Promise<Response>
  readonly login: () => Promise<Response>
  readonly logout: () => Promise<Response>
}

export interface ServiceDeps {
  readonly callerBinding: CallerBinding | null
  readonly providers: ServiceProviders
}
```

`route-skeleton.ts`（新增两个路由分支，放在 actions 分支后）：

```ts
const SAGE_LOGIN_PATH = '/.sage/login'
const SAGE_LOGOUT_PATH = '/.sage/logout'

  if (url.pathname === SAGE_LOGIN_PATH) {
    if (request.method !== 'GET') return transportDenial(405, { allow: 'GET' })
    return deps.providers.login()
  }
  if (url.pathname === SAGE_LOGOUT_PATH) {
    if (request.method !== 'POST') return transportDenial(405, { allow: 'POST' })
    return deps.providers.logout()
  }
```

`composition.ts`——`createUnavailableFirstService` 加可选第二参：

```ts
export interface AuthServiceOptions {
  readonly authSnapshot?: () => { readonly status: 'signed-out' | 'signed-in'; readonly displayName: string | null }
  readonly login?: () => Promise<Response>
  readonly logout?: () => Promise<Response>
}

export function createUnavailableFirstService(runtime: SageViewState | null, auth: AuthServiceOptions = {}): ServiceProviders {
  const snapshot = auth.authSnapshot ?? (() => ({ status: 'signed-out' as const, displayName: null }))
  return {
    async readState(): Promise<Response> {
      const snap = snapshot()
      const state: SageServiceState = {
        service: { status: 'unavailable', reason: 'identity-unavailable', auth: { ...snap, status: snap.status }, correlation: randomUUID() },
        runtime,
      }
      return serviceJson(state, 200)
    },
    async dispatch(): Promise<Response> { /* 既有管道不变 */ },
    async login(): Promise<Response> {
      if (auth.login !== undefined) return auth.login()
      return serviceJson({ auth: 'signed-out' }, 200)
    },
    async logout(): Promise<Response> {
      if (auth.logout !== undefined) return auth.logout()
      return serviceJson({ auth: 'signed-out' }, 200)
    },
  }
}
```

（default login/logout 的兜底为「无 adapter 注入 = signed-out 只读」，main 接线前测试既有断言不破。）

`renderer.ts`——在 retry 按钮逻辑附近追加登录面（沿用嵌入 `<script>` 模式；**模板字符串内禁用反引号**，字符串拼接）：

```js
    const login = document.querySelector('#login');
    const logoutBtn = document.querySelector('#logout');
    const authName = document.querySelector('#auth-name');

    function renderAuth(auth) {
      if (!auth || typeof auth !== 'object') return;
      if (login) login.hidden = auth.status !== 'signed-out';
      if (logoutBtn) logoutBtn.hidden = auth.status !== 'signed-in';
      if (authName) {
        authName.textContent = auth.status === 'signed-in' && typeof auth.displayName === 'string' ? auth.displayName
          : auth.status === 'pending' ? '正在登录…' : '';
      }
    }

    if (login) {
      login.addEventListener('click', async () => {
        login.disabled = true;
        try { await fetchWithinDeadline(loginPath, { cache: 'no-store' }); } catch { /* state 轮询兜底 */ }
        queueMicrotask(() => { void refresh(); });
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        logoutBtn.disabled = true;
        try {
          await fetchWithinDeadline(logoutPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        } catch { /* refresh 兜底 */ }
        queueMicrotask(() => { void refresh(); });
      });
    }
```

`refresh()` 的 state 解析处（既有两形守卫后）追加 `renderAuth(payload.service ? payload.service.auth : undefined)`；嵌入变量区加 `const loginPath = '/.sage/login'; const logoutPath = '/.sage/logout';`；HTML 卡片区加三个元素（`#login`、`#logout`、`#auth-name`，样式沿既有 sage-action 类）。login 失败的 typed body 由 refresh 轮询拉回 signed-out 状态展示——不弹错误详情（脱敏纪律）。

- [ ] **Step 4: 跑测试确认通过（含既有不破）**

Run: `cd apps/sage-shell && node scripts/test.mjs run appservice`
Expected: 全 PASS。若 composition 既有测试因 providers 形状扩展（新必需键 login/logout）编译失败，给既有 fake providers 补 `login: async () => new Response('{}')` 两键（合同扩展属本票授权变更，同步既有断言）。

- [ ] **Step 5: typecheck + gate + commit**

```bash
cd apps/sage-shell && npm run typecheck && cd ../.. && node scripts/gate.mjs
git add apps/sage-shell/src/appservice/ apps/sage-shell/src/product/renderer.ts apps/sage-shell/test/appservice-route-skeleton.spec.ts apps/sage-shell/test/appservice-composition.spec.ts apps/sage-shell/test/renderer-state-parse.spec.ts
git commit -m "feat(sage): auth contract, login/logout routes, renderer login surface (WT-02B.2B D2)"
```

---

### Task 5: main 接线 — 真实 deps 组装

**Files:**
- Modify: `apps/sage-shell/src/main/index.ts`
- Modify: `apps/sage-shell/src/main/oidc-adapter.ts`（若生产 deps 组装器放同文件；否则新建 `oidc-runtime.ts`）
- Test: `apps/sage-shell/test/oidc-adapter.spec.ts`（扩展：生产 deps 组装器单测——loopback 用真实 http.Server 真实端口集成）

**Interfaces:**
- Consumes: `createOidcAdapter`、`createTokenVault`、`createUnavailableFirstService`（auth 选项）、`verifySageServiceCaller`、`shouldUseAppService`。
- Produces: main 的 `protocol.handle` 分支组装真实 adapter（fetchImpl=global fetch、openExternal=shell.openExternal、listen/closeListen=node:http、randomBytes=node crypto）。

- [ ] **Step 1: 写失败测试（loopback 真实集成）**

```ts
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createLoopbackTransport } from '../src/main/oidc-runtime.js'

describe('loopback transport (real http.Server)', () => {
  let servers: Server[] = []
  afterEach(async () => { for (const s of servers) await new Promise<void>((r) => s.close(() => r())) })

  it('delivers the callback query exactly once and closes', async () => {
    const transport = createLoopbackTransport(() => { servers.push(/* server registry via factory */ null as unknown as Server) })
    const { listen, closeListen, port, deliverTest } = transport
    const queries: Array<Record<string, string>> = []
    await listen(0, (req: IncomingMessage) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const q: Record<string, string> = {}
      for (const [k, v] of url.searchParams) q[k] = v
      queries.push(q)
    })
    const response = await fetch(`http://127.0.0.1:${port}/callback?state=s&code=c`)
    expect(response.status).toBeGreaterThanOrEqual(200)
    await closeListen()
    // second request after close is refused
    await expect(fetch(`http://127.0.0.1:${port}/callback?state=s2`)).rejects.toThrow()
    expect(queries).toEqual([{ state: 's', code: 'c' }])
    void deliverTest
  })
})
```

（`createLoopbackTransport` 的真实接口由实现落定：核心合同 = `listen(port, handler)` 返回实际端口（port 0 时由 OS 分配——**单测用 0，生产接线用 3000**）、一次性（首次请求后 server 关闭）、`closeListen` 幂等。测试若与接口不吻合按守意图调整并披露。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc-runtime`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

`src/main/oidc-runtime.ts`：

```ts
/** Production transports for the OIDC adapter: real http loopback, real fetch, real shell. */
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { shell } from 'electron'
import type { OidcAdapterDeps } from './oidc-adapter.js'
import { createOidcAdapter } from './oidc-adapter.js'
import type { TokenVault } from './token-vault.js'

export function createLoopbackTransport(serverRegistry?: (s: Server) => void) {
  let server: Server | null = null
  let port = 0
  return {
    async listen(requestedPort: number, handler: (req: IncomingMessage) => void): Promise<void> {
      server = createServer((req, res) => {
        handler(req)
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('Sage login received. You can close this tab.')
        server?.close()
      })
      serverRegistry?.(server)
      await new Promise<void>((resolve) => server!.listen(requestedPort, '127.0.0.1', () => {
        port = (server!.address() as { port: number }).port
        resolve()
      }))
    },
    async closeListen(): Promise<void> {
      const s = server
      server = null
      if (s !== null && s.listening) await new Promise<void>((resolve) => s.close(() => resolve()))
    },
    get port(): number { return port },
  }
}

export function createProductionAdapter(vault: TokenVault) {
  const loopback = createLoopbackTransport()
  const deps: OidcAdapterDeps = {
    fetchImpl: fetch,
    openExternal: (url) => shell.openExternal(url),
    now: () => Math.floor(Date.now() / 1000),
    listen: (port, handler) => loopback.listen(port, handler),
    closeListen: () => loopback.closeListen(),
    randomBytes: nodeRandomBytes,
  }
  return { adapter: createOidcAdapter(deps), loopback }
}
```

`main/index.ts` 接线（`protocol.handle` 的 appservice 分支升级）：

```ts
import { createTokenVault } from './token-vault.js'
import { createProductionAdapter } from './oidc-runtime.js'

// main() 内，protocol.handle 之前：
const vault = createTokenVault()
const { adapter } = createProductionAdapter(vault)
const viewState = toSageViewState(host.readSnapshot())   // 既有逻辑位置不变，每次请求现取可

// handle 分支内（替换 createUnavailableFirstService(viewState)）：
providers: createUnavailableFirstService(toSageViewState(host.readSnapshot()), {
  authSnapshot: () => vault.snapshot(),
  login: async () => {
    const outcome = await adapter.startLogin(vault)
    return serviceJson(outcome.ok ? { auth: 'signed-in', displayName: outcome.displayName } : { code: outcome.code, stage: 'login', retryable: outcome.code !== 'login-in-progress', correlation: randomUUID() }, outcome.ok ? 202 : 200)
  },
  logout: async () => { vault.signOut(); return serviceJson({ auth: 'signed-out' }, 200) },
}),
```

（`serviceJson`/`randomUUID` import 自既有 `errors.js`/`node:crypto`；typed 拒绝体沿 0.2 CommandDenied 形。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc`
Expected: oidc 全套 + loopback 集成 PASS

- [ ] **Step 5: typecheck + gate + commit**

```bash
cd apps/sage-shell && npm run typecheck && cd ../.. && node scripts/gate.mjs
git add apps/sage-shell/src/main/ apps/sage-shell/test/oidc-adapter.spec.ts
git commit -m "feat(sage): production adapter wiring with real loopback transport (WT-02B.2B D1)"
```

---

### Task 6: 端到端验收 + Note + ADR-0183 收口

**Files:**
- Create: `docs/notes/implemented/security/2026-10-01-wt02b2b-oidc-login-adapter.md`
- Create: `docs/adr/ADR-0183.md`
- Modify: `docs/adr/README.md`、`docs/adr/decisions.json`

**Interfaces:**
- Consumes: Task 1–5 全部交付物。
- Produces: 票据收口 + 端到端验收读数（唯一真实网络证据）。

- [ ] **Step 1: 全量回归三件套**

```bash
cd apps/sage-shell && node scripts/test.mjs run && npm run typecheck && cd ../.. && node scripts/gate.mjs > /tmp/sage-gate-0183.txt 2>&1; echo "exit=$?"; tail -1 /tmp/sage-gate-0183.txt
```
Expected: 全量全绿、typecheck 0、gate 25/25。

- [ ] **Step 2: 端到端验收（需用户配合，控制器主持）**

```bash
cd apps/sage-shell && npm run dev
```
验收步骤（用户操作）：
1. Sage 窗口出现，状态卡显示「登录」按钮（signed-out）。
2. 点击登录 → 系统浏览器打开 Logto 登录页（`dk7z03.logto.app`）。
3. 用测试账号登录 → 浏览器显示「Sage login received」→ Sage 窗口状态变 signed-in 并显示 displayName。
4. 点登出 → 状态回 signed-out。
5. 再次登录验证 state 一次性与重放拒绝（第二次快速点登录按钮在 pending 期应被拒）。

读数留档：启动 stdout 日志（host ready 行）、每步的 state JSON（DevTools `SAGE_DEVTOOLS=1` 下 fetch `/.sage/state`）、验收截屏路径。**任何一步失败如实登记，不修复不收口**（端到端红 = 票不完成，可另开 fix 票但必须呈报）。

- [ ] **Step 3: 写 Note + ADR-0183 + 索引 + decisions.json + commit**

Note 四节（Problem：验证内核已备但无真实登录链路；Decision：三裁决 D1–D3 + 全注入设计 + 尺寸上界 + timingSafeEqual 兑现 + ES384；Alternatives：mock 网络假验签〔否决〕、safeStorage〔违反红线〕、独立 login route〔裁决 B 否决〕；Consequences：真实数字 + 端到端读数 + 遗留〔refresh 第二票等〕）。ADR-0183 机器可读块 D1/D2/D3 各带 constraints；`node scripts/gates/adr-agent-records.mjs --write`；gate 全绿后提交。

---

## Self-Review 结果（写计划时已跑）

1. **Spec 覆盖**：§3 ES384+seam→Task 1；§5 vault→Task 2；§4 adapter+尺寸上界→Task 3；§6 合同+路由→Task 4；§7 renderer→Task 4；§2 接线→Task 5；§8 端到端→Task 6。§9 不做项无任务（正确）。
2. **占位扫描**：无 TBD/TODO；Task 3 测试的 makeDeps 有「守意图调整」授权注释、Task 5 loopback 接口「由实现落定」——均为接口对齐授权而非占位（SDD 审查环节兜底）。
3. **类型一致性**：`LoginOutcome`/`LoginErrorCode`/`OidcAdapterDeps`/`TokenVault`/`AuthStatus` 跨任务签名一致；`acceptedAlgs` 扩 `'ES384'` 在 Task 1 Produces 与 Task 3 消费一致；`createUnavailableFirstService` 第二参在 Task 4 定义、Task 5 消费一致。
4. **已知风险预登记**：Task 3 测试的 deps 组装较复杂（fake listen 双层包装）——若实现者发现驱动层与接口不吻合，授权按守意图调整并在报告披露（前票三例同模式）。
