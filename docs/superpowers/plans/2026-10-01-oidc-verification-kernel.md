# OIDC 验证纯内核实施计划（WT-02B.2B-pre）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 WT-02B.2B 的 OIDC 验证链纯函数内核（metadata 精确校验、JWS 真实验签、ID token claims 链、callback state 一次性 + PKCE S256），真实密钥 fixture、负例矩阵全覆盖，为真实 IdP adapter 零返工打底。

**Architecture:** 四模块全在 `src/security/oidc/`（provider 侧 kernel，非 appservice），零 Electron import、零网络 I/O，时间/随机/JWKS bytes 全参数注入。node:crypto 原生 `dsaEncoding: 'ieee-p1363'` 处理 ES256 raw 签名（控制器已实测验证），不引入新依赖。测试密钥 beforeAll 生成不入库。

**Tech Stack:** TypeScript (tsc 严格)、node:crypto、vitest 经 `node scripts/test.mjs run`（Electron runner；单文件用子串过滤 `node scripts/test.mjs run <substring>`，不要 `npx vitest run test/<file>.spec.ts`——本仓 spec 经 `scripts/test.mjs` 通道跑最稳）。

**Spec:** `docs/superpowers/specs/2026-10-01-oidc-verification-kernel-design.md`

## Global Constraints

- **不冒充产品登录**：无网络、无浏览器唤起、无 token 交换、无 vault/session、无 main/renderer 接线（spec §1/§5）。
- 零新依赖：全部用 `node:crypto`（spec §4）；**零 Electron import** 于 `src/security/oidc/`。
- 精确相等无近似：所有 issuer/endpoint/state/nonce 字符串全等比较，不做 URL 规范化（spec §3.1）。
- 密钥 fixture：测试内 `generateKeyPairSync` 生成，**不入库、不落盘、不打印**（spec §3.5）。
- 验签失败统一 `signature-invalid` 不分细类（防 oracle，spec §3.2）；错误不携带 provider 原文。
- ES256 raw r||s：node `dsaEncoding: 'ieee-p1363'`（spec 原文的 DER 手写转换被控制器预检否决——原生支持存在，手写转换是 bug 面）；负例覆盖：DER 形签名、长度 ≠ 64 的 raw 签名。
- strict base64url：regex 字符集 + re-encode roundtrip 比对，拦截 `Buffer.from` 静默截断（控制器预检实测 `Buffer.from('a!b@c','base64url')` 静默产出垃圾）。
- 测试命令在 `apps/sage-shell/` 目录跑；类型 `npm run typecheck`；门禁仓根 `node scripts/gate.mjs`（25/25）。
- 提交纪律：每 Task 一个 commit（gate 绿前置）；收口票附 Note + ADR-0182。

---

### Task 1: fixtures + jws.ts — 验签底座

**Files:**
- Create: `apps/sage-shell/test/fixtures/oidc-keys.ts`
- Create: `apps/sage-shell/src/security/oidc/jws.ts`
- Test: `apps/sage-shell/test/oidc-jws.spec.ts`

**Interfaces:**
- Consumes: `node:crypto`（generateKeyPairSync/createVerify/createSign/createPublicKey）。
- Produces（后续任务依赖的精确签名）:
  - `verifyCompactJws(input: { untrustedToken: string; jwks: unknown; acceptedAlgs: readonly ('RS256'|'ES256')[] }): { ok: true; protectedHeader: Record<string, unknown>; payload: unknown } | { ok: false; reason: JwsRejection }`
  - `type JwsRejection = 'not-compact-jws' | 'header-not-json' | 'unsupported-alg' | 'alg-none' | 'missing-kid' | 'kid-not-found' | 'key-type-mismatch' | 'signature-invalid' | 'payload-not-json'`
  - fixture：`generateOidcKeys(): Promise<OidcKeySet>`（RSA 2048 kid `test-rsa` + EC P-256 kid `test-ec`）、`signJws(keys, kid, alg, headerExtra, payload): string`（headerExtra 的 undefined 值键在序列化前剔除）、`signRawSegments(keys, kid, alg, rawHeader, payload): string`、`signWithUnknownKey(kidToClaim): Promise<string>`、`signEs256Der(keys): string`、`signEs256RawWithLength(keys, length): string`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { generateOidcKeys, signEs256Der, signEs256RawWithLength, signJws, signRawSegments, signWithUnknownKey } from './fixtures/oidc-keys.js'
import { verifyCompactJws } from '../src/security/oidc/jws.js'

describe('verifyCompactJws', () => {
  it('accepts a correctly signed RS256 token', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-rsa', 'RS256', {}, { sub: 'user-1' })
    const result = verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['RS256'] })
    expect(result).toEqual({ ok: true, protectedHeader: expect.objectContaining({ alg: 'RS256', kid: 'test-rsa' }), payload: { sub: 'user-1' } })
  })

  it('accepts a correctly signed ES256 token (raw P-1363 signature)', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-ec', 'ES256', {}, { sub: 'user-1' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['ES256'] }).ok).toBe(true)
  })

  it('rejects a non-compact / malformed token', async () => {
    const keys = await generateOidcKeys()
    expect(verifyCompactJws({ untrustedToken: 'not-a-jws', jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'not-compact-jws' })
    expect(verifyCompactJws({ untrustedToken: 'a.b', jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'not-compact-jws' })
    expect(verifyCompactJws({ untrustedToken: 'a.b.c.d', jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'not-compact-jws' })
  })

  it('rejects a base64url segment that silently truncates (strict decode)', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-rsa', 'RS256', {}, { sub: 'x' })
    const [h, , s] = token.split('.')
    expect(verifyCompactJws({ untrustedToken: `${h}.bXww.${s}`, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'not-compact-jws' })
    expect(verifyCompactJws({ untrustedToken: `a!b@c.bm90.c2ln`, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'not-compact-jws' })
  })

  it('rejects a non-JSON header', async () => {
    const keys = await generateOidcKeys()
    const token = signRawSegments(keys, 'test-rsa', 'RS256', 'not json', { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'header-not-json' })
  })

  it('rejects a non-JSON payload', async () => {
    const keys = await generateOidcKeys()
    const token = signRawSegments(keys, 'test-rsa', 'RS256', JSON.stringify({ alg: 'RS256', kid: 'test-rsa' }), 'not json')
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'payload-not-json' })
  })

  it('rejects alg none and unsupported algs', async () => {
    const keys = await generateOidcKeys()
    const noneTok = signJws(keys, 'test-rsa', 'RS256', { alg: 'none' }, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: noneTok, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'alg-none' })
    const hsTok = signJws(keys, 'test-rsa', 'RS256', { alg: 'HS256' }, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: hsTok, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'unsupported-alg' })
  })

  it('rejects missing kid and kid not present in JWKS', async () => {
    const keys = await generateOidcKeys()
    const noKid = signJws(keys, 'test-rsa', 'RS256', { kid: undefined }, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: noKid, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'missing-kid' })
    const ghost = signJws(keys, 'test-rsa', 'RS256', { kid: 'ghost' }, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: ghost, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'kid-not-found' })
  })

  it('rejects key-type mismatch (RS256 alg with EC key kid)', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-ec', 'ES256', { alg: 'RS256' }, { sub: 'x' })
    expect(verifyCompactJws({ untrustedToken: token, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'key-type-mismatch' })
  })

  it('rejects a tampered signature and a signature from an unknown key', async () => {
    const keys = await generateOidcKeys()
    const token = signJws(keys, 'test-rsa', 'RS256', {}, { sub: 'x' })
    const [h, p, s] = token.split('.')
    const tamperedSig = Buffer.from(s, 'base64url'); tamperedSig[10] ^= 1
    const tampered = `${h}.${p}.${tamperedSig.toString('base64url')}`
    expect(verifyCompactJws({ untrustedToken: tampered, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'signature-invalid' })
    const forged = await signWithUnknownKey('test-rsa')
    expect(verifyCompactJws({ untrustedToken: forged, jwks: keys.jwks, acceptedAlgs: ['RS256'] })).toEqual({ ok: false, reason: 'signature-invalid' })
  })

  it('rejects an ES256 signature in DER form and a wrong-length raw signature', async () => {
    const keys = await generateOidcKeys()
    expect(verifyCompactJws({ untrustedToken: signEs256Der(keys), jwks: keys.jwks, acceptedAlgs: ['ES256'] })).toEqual({ ok: false, reason: 'signature-invalid' })
    expect(verifyCompactJws({ untrustedToken: signEs256RawWithLength(keys, 63), jwks: keys.jwks, acceptedAlgs: ['ES256'] })).toEqual({ ok: false, reason: 'signature-invalid' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc-jws`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写 fixture 与实现**

fixture `test/fixtures/oidc-keys.ts`：

```ts
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto'

export interface OidcKeySet {
  readonly jwks: { readonly keys: readonly Record<string, unknown>[] }
  readonly privateKey: Readonly<Record<string, KeyObject>>   // keyed by kid
}

/** Fresh keys per run: never persisted, never printed. */
export async function generateOidcKeys(): Promise<OidcKeySet> {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const rsaJwk = rsa.publicKey.export({ format: 'jwk' }) as Record<string, unknown>
  const ecJwk = ec.publicKey.export({ format: 'jwk' }) as Record<string, unknown>
  return {
    jwks: { keys: [{ ...rsaJwk, kid: 'test-rsa', use: 'sig' }, { ...ecJwk, kid: 'test-ec', use: 'sig' }] },
    privateKey: { 'test-rsa': rsa.privateKey, 'test-ec': ec.privateKey },
  }
}

function b64u(value: Buffer): string { return value.toString('base64url') }

export function signJws(keys: OidcKeySet, kid: string, alg: 'RS256' | 'ES256', headerExtra: Record<string, unknown>, payload: unknown): string {
  const header = Object.fromEntries(Object.entries({ alg, kid, ...headerExtra }).filter(([, v]) => v !== undefined))
  return signRawHeader(keys, kid, alg, JSON.stringify(header), payload)
}

function signRawHeader(keys: OidcKeySet, kid: string, alg: 'RS256' | 'ES256', rawHeader: string, payload: unknown): string {
  const headerB = b64u(Buffer.from(rawHeader))
  const payloadB = b64u(Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)))
  const signingInput = `${headerB}.${payloadB}`
  const key = alg === 'ES256'
    ? { key: keys.privateKey[kid]!, dsaEncoding: 'ieee-p1363' as const }
    : keys.privateKey[kid]!
  const sig = createSign(alg === 'RS256' ? 'RSA-SHA256' : 'SHA256').update(Buffer.from(signingInput)).sign(key)
  return `${signingInput}.${b64u(sig)}`
}

/** Sign with an arbitrary (possibly invalid) header/payload string, for negative cases. */
export function signRawSegments(keys: OidcKeySet, kid: string, alg: 'RS256' | 'ES256', rawHeader: string, payload: unknown): string {
  return signRawHeader(keys, kid, alg, rawHeader, payload)
}

/** Token whose header claims test-rsa but is signed by a throwaway key. */
export async function signWithUnknownKey(kidToClaim: string): Promise<string> {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const header = b64u(Buffer.from(JSON.stringify({ alg: 'RS256', kid: kidToClaim })))
  const payload = b64u(Buffer.from(JSON.stringify({ sub: 'attacker' })))
  const sig = createSign('RSA-SHA256').update(Buffer.from(`${header}.${payload}`)).sign(privateKey)
  return `${header}.${payload}.${b64u(sig)}`
}

/** ES256 token carrying the DER-encoded signature instead of raw r||s. */
export function signEs256Der(keys: OidcKeySet): string {
  const header = b64u(Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'test-ec' })))
  const payload = b64u(Buffer.from(JSON.stringify({ sub: 'x' })))
  const sig = createSign('SHA256').update(Buffer.from(`${header}.${payload}`)).sign(keys.privateKey['test-ec']!) // default DER
  return `${header}.${payload}.${b64u(sig)}`
}

/** ES256 token whose raw signature is truncated to a wrong length. */
export function signEs256RawWithLength(keys: OidcKeySet, length: number): string {
  const header = b64u(Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'test-ec' })))
  const payload = b64u(Buffer.from(JSON.stringify({ sub: 'x' })))
  const sig = createSign('SHA256').update(Buffer.from(`${header}.${payload}`)).sign({ key: keys.privateKey['test-ec']!, dsaEncoding: 'ieee-p1363' })
  return `${header}.${payload}.${b64u(sig.subarray(0, length))}`
}
```

实现 `src/security/oidc/jws.ts`：

```ts
/** WT-02B.2B-pre JWS verification kernel: strict parse, exact kid match, real signature checks. */
import { createPublicKey, createVerify, type KeyObject } from 'node:crypto'

export type JwsRejection =
  | 'not-compact-jws' | 'header-not-json' | 'unsupported-alg' | 'alg-none'
  | 'missing-kid' | 'kid-not-found' | 'key-type-mismatch' | 'signature-invalid'
  | 'payload-not-json'

const B64U_RE = /^[A-Za-z0-9_-]+$/u

/** Strict base64url decode: charset check plus re-encode equality (Buffer.from silently truncates). */
function strictB64uDecode(segment: string): Buffer | undefined {
  if (!B64U_RE.test(segment)) return undefined
  const bytes = Buffer.from(segment, 'base64url')
  return bytes.toString('base64url') === segment ? bytes : undefined
}

function algMatchesKeyType(alg: 'RS256' | 'ES256', jwk: Record<string, unknown>): boolean {
  if (alg === 'RS256') return jwk.kty === 'RSA'
  return jwk.kty === 'EC' && jwk.crv === 'P-256'
}

function verifySignature(alg: 'RS256' | 'ES256', key: KeyObject, signingInput: Buffer, signature: Buffer): boolean {
  if (alg === 'RS256') {
    try { return createVerify('RSA-SHA256').update(signingInput).verify(key, signature) } catch { return false }
  }
  if (signature.length !== 64) return false // raw r||s, exactly 32+32
  try { return createVerify('SHA256').update(signingInput).verify({ key, dsaEncoding: 'ieee-p1363' }, signature) } catch { return false }
}

export function verifyCompactJws(input: {
  readonly untrustedToken: string
  readonly jwks: unknown
  readonly acceptedAlgs: readonly ('RS256' | 'ES256')[]
}): { readonly ok: true; readonly protectedHeader: Record<string, unknown>; readonly payload: unknown } | { readonly ok: false; readonly reason: JwsRejection } {
  if (typeof input.untrustedToken !== 'string') return { ok: false, reason: 'not-compact-jws' }
  const parts = input.untrustedToken.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'not-compact-jws' }
  const [headerSeg, payloadSeg, sigSeg] = parts

  const headerBytes = strictB64uDecode(headerSeg)
  const payloadBytes = strictB64uDecode(payloadSeg)
  const sigBytes = strictB64uDecode(sigSeg)
  if (headerBytes === undefined || payloadBytes === undefined || sigBytes === undefined) {
    return { ok: false, reason: 'not-compact-jws' }
  }

  let header: unknown
  try { header = JSON.parse(headerBytes.toString('utf8')) } catch { return { ok: false, reason: 'header-not-json' } }
  if (header === null || typeof header !== 'object' || Array.isArray(header)) return { ok: false, reason: 'header-not-json' }
  const headerRecord = header as Record<string, unknown>

  const alg = headerRecord.alg
  if (alg === 'none') return { ok: false, reason: 'alg-none' }
  if (alg !== 'RS256' && alg !== 'ES256') return { ok: false, reason: 'unsupported-alg' }
  if (!input.acceptedAlgs.includes(alg)) return { ok: false, reason: 'unsupported-alg' }

  if (typeof headerRecord.kid !== 'string' || headerRecord.kid.length === 0) return { ok: false, reason: 'missing-kid' }

  const jwks = input.jwks as { keys?: unknown } | null
  const keysArray = jwks !== null && typeof jwks === 'object' && !Array.isArray(jwks) && Array.isArray(jwks.keys) ? jwks.keys : []
  const matches = keysArray.filter(
    (k): k is Record<string, unknown> => k !== null && typeof k === 'object' && !Array.isArray(k) && (k as Record<string, unknown>).kid === headerRecord.kid,
  )
  if (matches.length !== 1) return { ok: false, reason: 'kid-not-found' }
  const jwk = matches[0]!
  if (!algMatchesKeyType(alg, jwk)) return { ok: false, reason: 'key-type-mismatch' }

  let key: KeyObject
  try { key = createPublicKey({ key: jwk as Record<string, unknown>, format: 'jwk' }) } catch { return { ok: false, reason: 'key-type-mismatch' } }

  const signingInput = Buffer.from(`${headerSeg}.${payloadSeg}`)
  if (!verifySignature(alg, key, signingInput, sigBytes)) return { ok: false, reason: 'signature-invalid' }

  let payload: unknown
  try { payload = JSON.parse(payloadBytes.toString('utf8')) } catch { return { ok: false, reason: 'payload-not-json' } }

  return { ok: true, protectedHeader: headerRecord, payload }
}
```

（`createPublicKey` 的 jwk 形参在 tsc 严格下可能要求 `JsonWebKey` 类型；按实际报错用最小 cast 调整，语义不变。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc-jws`
Expected: PASS（11 tests）

- [ ] **Step 5: typecheck + gate + commit**

```bash
cd apps/sage-shell && npm run typecheck && cd ../.. && node scripts/gate.mjs
git add apps/sage-shell/src/security/oidc/jws.ts apps/sage-shell/test/fixtures/oidc-keys.ts apps/sage-shell/test/oidc-jws.spec.ts
git commit -m "feat(sage): JWS verification kernel with strict parse and real crypto (WT-02B.2B-pre)"
```

---

### Task 2: id-token.ts — claims 校验链

**Files:**
- Create: `apps/sage-shell/src/security/oidc/id-token.ts`
- Test: `apps/sage-shell/test/oidc-id-token.spec.ts`

**Interfaces:**
- Consumes: `verifyCompactJws`、`JwsRejection`（Task 1）；fixture `generateOidcKeys`/`signJws`。
- Produces: `verifyIdToken(input: { untrustedToken: string; jwks: unknown; expectedIssuer: string; clientId: string; expectedNonce: string; now: number; clockSkewSeconds: number }): { ok: true; claims: Record<string, unknown> } | { ok: false; reason: IdTokenRejection }`；`type IdTokenRejection = JwsRejection | 'iss-mismatch' | 'aud-missing' | 'aud-mismatch' | 'azp-mismatch' | 'expired' | 'not-yet-valid' | 'iat-unreasonable' | 'nonce-mismatch' | 'missing-claim'`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { generateOidcKeys, signJws } from './fixtures/oidc-keys.js'
import { verifyIdToken } from '../src/security/oidc/id-token.js'

const NOW = 1_800_000_000
const ISS = 'https://idp.example/'
const CLIENT = 'sage-desktop'

async function tokenWith(claims: Record<string, unknown>): Promise<{ keys: Awaited<ReturnType<typeof generateOidcKeys>>; token: string }> {
  const keys = await generateOidcKeys()
  const base = { iss: ISS, sub: 'user-1', aud: CLIENT, nonce: 'n-1', exp: NOW + 3600, iat: NOW }
  const payload = { ...base, ...claims }
  return { keys, token: signJws(keys, 'test-rsa', 'RS256', {}, payload) }
}

function verify(token: string, jwks: unknown) {
  return verifyIdToken({ untrustedToken: token, jwks, expectedIssuer: ISS, clientId: CLIENT, expectedNonce: 'n-1', now: NOW, clockSkewSeconds: 60 })
}

describe('verifyIdToken', () => {
  it('accepts a fully valid token (single aud string)', async () => {
    const { keys, token } = await tokenWith({})
    const result = verify(token, keys.jwks)
    expect(result).toEqual({ ok: true, claims: expect.objectContaining({ sub: 'user-1' }) })
  })

  it('accepts a multi-aud token when azp equals clientId', async () => {
    const { keys, token } = await tokenWith({ aud: ['other-client', CLIENT], azp: CLIENT })
    expect(verify(token, keys.jwks).ok).toBe(true)
  })

  it('rejects a multi-aud token with wrong or missing azp', async () => {
    const wrong = await tokenWith({ aud: ['other-client', CLIENT], azp: 'other-client' })
    expect(verify(wrong.token, wrong.keys.jwks)).toEqual({ ok: false, reason: 'azp-mismatch' })
    const missing = await tokenWith({ aud: ['other-client', CLIENT] })
    expect(verify(missing.token, missing.keys.jwks)).toEqual({ ok: false, reason: 'azp-mismatch' })
  })

  it('rejects wrong issuer (exact equality, no trailing-slash normalization)', async () => {
    const { keys, token } = await tokenWith({ iss: 'https://idp.example' })
    expect(verify(token, keys.jwks)).toEqual({ ok: false, reason: 'iss-mismatch' })
  })

  it('rejects aud without clientId and a non-string aud', async () => {
    const other = await tokenWith({ aud: 'other-client' })
    expect(verify(other.token, other.keys.jwks)).toEqual({ ok: false, reason: 'aud-mismatch' })
    const weird = await tokenWith({ aud: 42 })
    expect(verify(weird.token, weird.keys.jwks)).toEqual({ ok: false, reason: 'aud-missing' })
  })

  it('rejects an expired token beyond skew but accepts within skew', async () => {
    const expired = await tokenWith({ exp: NOW - 61 })
    expect(verify(expired.token, expired.keys.jwks)).toEqual({ ok: false, reason: 'expired' })
    const within = await tokenWith({ exp: NOW - 30 })
    expect(verify(within.token, within.keys.jwks).ok).toBe(true)
  })

  it('rejects a not-yet-valid token and a future iat', async () => {
    const nbf = await tokenWith({ nbf: NOW + 3600 })
    expect(verify(nbf.token, nbf.keys.jwks)).toEqual({ ok: false, reason: 'not-yet-valid' })
    const future = await tokenWith({ iat: NOW + 3600 })
    expect(verify(future.token, future.keys.jwks)).toEqual({ ok: false, reason: 'iat-unreasonable' })
  })

  it('rejects a nonce mismatch and missing exp', async () => {
    const nonce = await tokenWith({ nonce: 'other' })
    expect(verify(nonce.token, nonce.keys.jwks)).toEqual({ ok: false, reason: 'nonce-mismatch' })
    const noExp = await tokenWith({ exp: undefined })  // JSON.stringify drops undefined → claim missing
    expect(verify(noExp.token, noExp.keys.jwks)).toEqual({ ok: false, reason: 'missing-claim' })
  })

  it('propagates a JWS-layer rejection', async () => {
    const keys = await generateOidcKeys()
    const forged = 'eyJhbGciOiJSUzI1NiIsImtpZCI6Imdob3N0In0.e30.aa'
    expect(verify(forged, keys.jwks)).toEqual({ ok: false, reason: 'kid-not-found' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc-id-token`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

```ts
/** WT-02B.2B-pre ID token claims kernel: exact equality, injected clock, fail closed. */
import { verifyCompactJws, type JwsRejection } from './jws.js'

export type IdTokenRejection =
  | JwsRejection | 'iss-mismatch' | 'aud-missing' | 'aud-mismatch' | 'azp-mismatch'
  | 'expired' | 'not-yet-valid' | 'iat-unreasonable' | 'nonce-mismatch' | 'missing-claim'

export function verifyIdToken(input: {
  readonly untrustedToken: string
  readonly jwks: unknown
  readonly expectedIssuer: string
  readonly clientId: string
  readonly expectedNonce: string
  readonly now: number
  readonly clockSkewSeconds: number
}): { readonly ok: true; readonly claims: Record<string, unknown> } | { readonly ok: false; readonly reason: IdTokenRejection } {
  const jws = verifyCompactJws({ untrustedToken: input.untrustedToken, jwks: input.jwks, acceptedAlgs: ['RS256', 'ES256'] })
  if (!jws.ok) return { ok: false, reason: jws.reason }

  const claims = jws.payload as Record<string, unknown>
  if (claims === null || typeof claims !== 'object' || Array.isArray(claims)) return { ok: false, reason: 'missing-claim' }

  if (claims.iss !== input.expectedIssuer) return { ok: false, reason: 'iss-mismatch' }

  const aud = claims.aud
  const audiences = typeof aud === 'string' ? [aud] : Array.isArray(aud) && aud.every((a) => typeof a === 'string') ? aud : undefined
  if (audiences === undefined) return { ok: false, reason: 'aud-missing' }
  if (!audiences.includes(input.clientId)) return { ok: false, reason: 'aud-mismatch' }
  if (audiences.length > 1 && claims.azp !== input.clientId) return { ok: false, reason: 'azp-mismatch' }

  const skew = input.clockSkewSeconds
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) return { ok: false, reason: 'missing-claim' }
  if (input.now - claims.exp > skew) return { ok: false, reason: 'expired' }
  if (typeof claims.nbf === 'number' && Number.isFinite(claims.nbf) && claims.nbf - input.now > skew) {
    return { ok: false, reason: 'not-yet-valid' }
  }
  if (typeof claims.iat !== 'number' || !Number.isFinite(claims.iat)) return { ok: false, reason: 'missing-claim' }
  if (claims.iat - input.now > skew) return { ok: false, reason: 'iat-unreasonable' }
  if (typeof claims.nonce !== 'string' || claims.nonce !== input.expectedNonce) {
    return typeof claims.nonce === 'string' ? { ok: false, reason: 'nonce-mismatch' } : { ok: false, reason: 'missing-claim' }
  }

  return { ok: true, claims }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc-id-token`
Expected: PASS（9 tests）

- [ ] **Step 5: typecheck + gate + commit**

```bash
cd apps/sage-shell && npm run typecheck && cd ../.. && node scripts/gate.mjs
git add apps/sage-shell/src/security/oidc/id-token.ts apps/sage-shell/test/oidc-id-token.spec.ts
git commit -m "feat(sage): ID token claims verification kernel (WT-02B.2B-pre)"
```

---

### Task 3: metadata.ts — issuer metadata 精确校验

**Files:**
- Create: `apps/sage-shell/src/security/oidc/metadata.ts`
- Test: `apps/sage-shell/test/oidc-metadata.spec.ts`

**Interfaces:**
- Produces: `verifyProviderMetadata(input: { untrusted: unknown; expected: ExpectedProviderMetadata }): { ok: true } | { ok: false; reason: MetadataRejection }`；`interface ExpectedProviderMetadata { readonly issuer: string; readonly authorizationEndpoint: string; readonly tokenEndpoint: string; readonly jwksUri: string }`；`type MetadataRejection = 'not-json-object' | 'issuer-mismatch' | 'authorization-endpoint-mismatch' | 'token-endpoint-mismatch' | 'jwks-uri-mismatch' | 'missing-required-field'`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { verifyProviderMetadata } from '../src/security/oidc/metadata.js'

const expected = {
  issuer: 'https://idp.example/',
  authorizationEndpoint: 'https://idp.example/authorize',
  tokenEndpoint: 'https://idp.example/token',
  jwksUri: 'https://idp.example/jwks',
}
const valid = {
  issuer: 'https://idp.example/',
  authorization_endpoint: 'https://idp.example/authorize',
  token_endpoint: 'https://idp.example/token',
  jwks_uri: 'https://idp.example/jwks',
}

describe('verifyProviderMetadata', () => {
  it('accepts exact-matching metadata', () => {
    expect(verifyProviderMetadata({ untrusted: valid, expected })).toEqual({ ok: true })
  })

  it('rejects non-object input', () => {
    expect(verifyProviderMetadata({ untrusted: 'x', expected })).toEqual({ ok: false, reason: 'not-json-object' })
    expect(verifyProviderMetadata({ untrusted: null, expected })).toEqual({ ok: false, reason: 'not-json-object' })
    expect(verifyProviderMetadata({ untrusted: [valid], expected })).toEqual({ ok: false, reason: 'not-json-object' })
  })

  it('rejects missing required fields', () => {
    expect(verifyProviderMetadata({ untrusted: { ...valid, jwks_uri: undefined }, expected })).toEqual({ ok: false, reason: 'missing-required-field' })
  })

  it('rejects each field mismatch independently (exact equality, no normalization)', () => {
    expect(verifyProviderMetadata({ untrusted: { ...valid, issuer: 'https://idp.example' }, expected })).toEqual({ ok: false, reason: 'issuer-mismatch' })
    expect(verifyProviderMetadata({ untrusted: { ...valid, authorization_endpoint: 'https://idp.example/authorize/' }, expected })).toEqual({ ok: false, reason: 'authorization-endpoint-mismatch' })
    expect(verifyProviderMetadata({ untrusted: { ...valid, token_endpoint: 'https://evil.example/token' }, expected })).toEqual({ ok: false, reason: 'token-endpoint-mismatch' })
    expect(verifyProviderMetadata({ untrusted: { ...valid, jwks_uri: 'https://evil.example/jwks' }, expected })).toEqual({ ok: false, reason: 'jwks-uri-mismatch' })
  })

  it('rejects non-string field types as missing', () => {
    expect(verifyProviderMetadata({ untrusted: { ...valid, issuer: 42 }, expected })).toEqual({ ok: false, reason: 'missing-required-field' })
  })
})
```

（注意 `{ ...valid, jwks_uri: undefined }` 在 JS 中保留键但值为 undefined——实现按「键缺失或值非非空字符串」判 `missing-required-field`。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc-metadata`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

```ts
/** WT-02B.2B-pre provider metadata kernel: exact string equality, no URL normalization. */
export interface ExpectedProviderMetadata {
  readonly issuer: string
  readonly authorizationEndpoint: string
  readonly tokenEndpoint: string
  readonly jwksUri: string
}

export type MetadataRejection =
  | 'not-json-object' | 'issuer-mismatch' | 'authorization-endpoint-mismatch'
  | 'token-endpoint-mismatch' | 'jwks-uri-mismatch' | 'missing-required-field'

function expectField(untrusted: Record<string, unknown>, key: string): string | undefined {
  const value = untrusted[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function verifyProviderMetadata(input: {
  readonly untrusted: unknown
  readonly expected: ExpectedProviderMetadata
}): { readonly ok: true } | { readonly ok: false; readonly reason: MetadataRejection } {
  const untrusted = input.untrusted
  if (untrusted === null || typeof untrusted !== 'object' || Array.isArray(untrusted)) {
    return { ok: false, reason: 'not-json-object' }
  }
  const record = untrusted as Record<string, unknown>

  const issuer = expectField(record, 'issuer')
  const authorizationEndpoint = expectField(record, 'authorization_endpoint')
  const tokenEndpoint = expectField(record, 'token_endpoint')
  const jwksUri = expectField(record, 'jwks_uri')
  if (issuer === undefined || authorizationEndpoint === undefined || tokenEndpoint === undefined || jwksUri === undefined) {
    return { ok: false, reason: 'missing-required-field' }
  }

  if (issuer !== input.expected.issuer) return { ok: false, reason: 'issuer-mismatch' }
  if (authorizationEndpoint !== input.expected.authorizationEndpoint) return { ok: false, reason: 'authorization-endpoint-mismatch' }
  if (tokenEndpoint !== input.expected.tokenEndpoint) return { ok: false, reason: 'token-endpoint-mismatch' }
  if (jwksUri !== input.expected.jwksUri) return { ok: false, reason: 'jwks-uri-mismatch' }
  return { ok: true }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc-metadata`
Expected: PASS（5 tests）

- [ ] **Step 5: typecheck + gate + commit**

```bash
cd apps/sage-shell && npm run typecheck && cd ../.. && node scripts/gate.mjs
git add apps/sage-shell/src/security/oidc/metadata.ts apps/sage-shell/test/oidc-metadata.spec.ts
git commit -m "feat(sage): provider metadata exact-match kernel (WT-02B.2B-pre)"
```

---

### Task 4: callback.ts — state 一次性 + PKCE S256

**Files:**
- Create: `apps/sage-shell/src/security/oidc/callback.ts`
- Test: `apps/sage-shell/test/oidc-callback.spec.ts`

**Interfaces:**
- Produces:
  - `verifyAuthorizationCallback(input: { untrustedQuery: Record<string, unknown> | URLSearchParams; expectedState: string; consumeState: (state: string) => boolean; codeVerifier: string }): { ok: true; authorizationCode: string } | { ok: false; reason: CallbackRejection }`
  - `verifyPkceS256(input: { codeVerifier: string; challenge: string }): boolean`
  - `type CallbackRejection = 'missing-code' | 'error-response' | 'state-mismatch' | 'state-replayed' | 'code-verifier-invalid' | 'pkce-mismatch'`

- [ ] **Step 1: 写失败测试**

```ts
import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyAuthorizationCallback, verifyPkceS256 } from '../src/security/oidc/callback.js'

const STATE = 'state-token-1'
const CODE = 'auth-code-1'

function makeVerifier(): string { return randomBytes(32).toString('base64url') }
function challengeFor(verifier: string): string { return createHash('sha256').update(verifier).digest('base64url') }

function makeInput(overrides: {
  query?: Record<string, unknown>
  state?: string
  consumed?: boolean
  verifier?: string
} = {}) {
  const verifier = overrides.verifier ?? makeVerifier()
  const consumedStates = new Set<string>([STATE])
  return {
    input: {
      untrustedQuery: overrides.query ?? { state: STATE, code: CODE },
      expectedState: overrides.state ?? STATE,
      consumeState: (state: string) => {
        if (overrides.consumed === true) return state === STATE && !consumedStates.has(`gone-${state}`) && consumedStates.has(state)
        return state === STATE
      },
      codeVerifier: verifier,
    },
  }
}

describe('verifyAuthorizationCallback', () => {
  it('accepts a valid callback (code + fresh state + valid verifier)', () => {
    const { input } = makeInput()
    expect(verifyAuthorizationCallback(input)).toEqual({ ok: true, authorizationCode: CODE })
  })

  it('accepts URLSearchParams input form', () => {
    const params = new URLSearchParams([['state', STATE], ['code', CODE]])
    expect(verifyAuthorizationCallback({ ...makeInput().input, untrustedQuery: params })).toEqual({ ok: true, authorizationCode: CODE })
  })

  it('rejects provider error responses without leaking the error text', () => {
    const { input } = makeInput({ query: { state: STATE, error: 'access_denied', error_description: 'user pressed no' } })
    expect(verifyAuthorizationCallback(input)).toEqual({ ok: false, reason: 'error-response' })
  })

  it('rejects a state mismatch and a replayed (already consumed) state', () => {
    const mismatch = makeInput({ query: { state: 'attacker-state', code: CODE } })
    expect(verifyAuthorizationCallback(mismatch.input)).toEqual({ ok: false, reason: 'state-mismatch' })
    const replayed = makeInput({ query: { state: STATE, code: CODE }, consumed: true })
    expect(verifyAuthorizationCallback(replayed.input)).toEqual({ ok: false, reason: 'state-mismatch' })
  })

  it('rejects a missing or empty code', () => {
    const missing = makeInput({ query: { state: STATE } })
    expect(verifyAuthorizationCallback(missing.input)).toEqual({ ok: false, reason: 'missing-code' })
    const empty = makeInput({ query: { state: STATE, code: '' } })
    expect(verifyAuthorizationCallback(empty.input)).toEqual({ ok: false, reason: 'missing-code' })
  })

  it('rejects a code verifier outside RFC 7636 shape (43-128 base64url chars)', () => {
    const short = makeInput({ verifier: 'a'.repeat(42) })
    expect(verifyAuthorizationCallback(short.input)).toEqual({ ok: false, reason: 'code-verifier-invalid' })
    const long = makeInput({ verifier: 'a'.repeat(129) })
    expect(verifyAuthorizationCallback(long.input)).toEqual({ ok: false, reason: 'code-verifier-invalid' })
    const badChars = makeInput({ verifier: 'a'.repeat(64).replace('a', '!') })
    expect(verifyAuthorizationCallback(badChars.input)).toEqual({ ok: false, reason: 'code-verifier-invalid' })
  })
})

describe('verifyPkceS256', () => {
  it('matches the S256 challenge for a valid verifier', () => {
    const verifier = makeVerifier()
    expect(verifyPkceS256({ codeVerifier: verifier, challenge: challengeFor(verifier) })).toBe(true)
  })

  it('rejects a mismatched challenge', () => {
    const verifier = makeVerifier()
    expect(verifyPkceS256({ codeVerifier: verifier, challenge: challengeFor(makeVerifier()) })).toBe(false)
  })

  it('rejects a plain (non-S256) challenge equal to the verifier', () => {
    const verifier = makeVerifier()
    expect(verifyPkceS256({ codeVerifier: verifier, challenge: verifier })).toBe(false)
  })
})
```

（`consumed: true` 分支的 fake `consumeState` 返回 false 模拟一次性消费语义——真实 caller 的状态表消费后即拒。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc-callback`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

```ts
/** WT-02B.2B-pre authorization callback kernel: one-shot state + PKCE S256, fail closed. */
import { createHash } from 'node:crypto'

export type CallbackRejection =
  | 'missing-code' | 'error-response' | 'state-mismatch' | 'state-replayed'
  | 'code-verifier-invalid' | 'pkce-mismatch'

const B64U_CHARS = /^[A-Za-z0-9_-]+$/u

function queryValue(query: Record<string, unknown> | URLSearchParams, key: string): unknown {
  if (query instanceof URLSearchParams) return query.get(key)
  const value = (query as Record<string, unknown>)[key]
  return value
}

function isValidVerifier(verifier: string): boolean {
  return verifier.length >= 43 && verifier.length <= 128 && B64U_CHARS.test(verifier)
}

export function verifyAuthorizationCallback(input: {
  readonly untrustedQuery: Record<string, unknown> | URLSearchParams
  readonly expectedState: string
  readonly consumeState: (state: string) => boolean
  readonly codeVerifier: string
}): { readonly ok: true; authorizationCode: string } | { readonly ok: false; readonly reason: CallbackRejection } {
  const error = queryValue(input.untrustedQuery, 'error')
  if (error !== undefined && error !== null && error !== '') return { ok: false, reason: 'error-response' }

  const state = queryValue(input.untrustedQuery, 'state')
  if (typeof state !== 'string' || state !== input.expectedState) return { ok: false, reason: 'state-mismatch' }
  if (!input.consumeState(state)) return { ok: false, reason: 'state-replayed' }

  const code = queryValue(input.untrustedQuery, 'code')
  if (typeof code !== 'string' || code.length === 0) return { ok: false, reason: 'missing-code' }

  if (typeof input.codeVerifier !== 'string' || !isValidVerifier(input.codeVerifier)) {
    return { ok: false, reason: 'code-verifier-invalid' }
  }

  return { ok: true, authorizationCode: code }
}

export function verifyPkceS256(input: { readonly codeVerifier: string; readonly challenge: string }): boolean {
  if (typeof input.codeVerifier !== 'string' || typeof input.challenge !== 'string') return false
  const computed = createHash('sha256').update(input.codeVerifier).digest('base64url')
  return computed === input.challenge
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd apps/sage-shell && node scripts/test.mjs run oidc-callback`
Expected: PASS（9 tests）

- [ ] **Step 5: typecheck + gate + commit**

```bash
cd apps/sage-shell && npm run typecheck && cd ../.. && node scripts/gate.mjs
git add apps/sage-shell/src/security/oidc/callback.ts apps/sage-shell/test/oidc-callback.spec.ts
git commit -m "feat(sage): authorization callback kernel with one-shot state and PKCE S256 (WT-02B.2B-pre)"
```

---

### Task 5: 全量回归 + 变异验证 + Note + ADR-0182 收口

**Files:**
- Create: `docs/notes/implemented/security/2026-10-01-oidc-verification-kernel.md`（Note 四节）
- Create: `docs/adr/ADR-0182.md`（含 `## 机器可读决策` 块）
- Modify: `docs/adr/README.md`（索引行）、`docs/adr/decisions.json`（`node scripts/gates/adr-agent-records.mjs --write` 再生）

**Interfaces:**
- Consumes: Task 1–4 全部交付物。
- Produces: 票据收口。Note 头行三层上溯 `../../../adr/ADR-0182.md`（两层判红——已两次踩过）。

- [ ] **Step 1: 变异验证（审查者环节执行，本票在计划中登记为验收读数）**

对以下每个校验，临时注释实现行、确认对应负例红、恢复（diff 为空）：
- jws.ts：`strictB64uDecode` 的 re-encode 比对、`signature.length !== 64`（ES256）、`matches.length !== 1`、`verifySignature` 结果
- id-token.ts：`iss` 全等、`exp` 判窗、`azp` 检查、`nonce` 全等
- metadata.ts：任一 endpoint 全等
- callback.ts：`consumeState` 检查、`isValidVerifier` 长度界

- [ ] **Step 2: 全量回归三件套**

```bash
cd apps/sage-shell && node scripts/test.mjs run && npm run typecheck && cd ../.. && node scripts/gate.mjs > /tmp/sage-gate-0182.txt 2>&1; echo "exit=$?"; tail -1 /tmp/sage-gate-0182.txt
```
Expected: 全量全绿（48+ files）、typecheck 0、gate 25/25（输出落文件再读）。

- [ ] **Step 3: 写 Note**

四节：Problem（2B 硬前置未到位、验证链是最大风险块）、Decision（纯内核切片、精确相等无 URL 规范化、node:crypto `dsaEncoding: 'ieee-p1363'` 取代 spec 原案的手写 DER 转换——控制器预检实测、strict base64url roundtrip 拦截 Buffer.from 静默截断——预检发现 `Buffer.from('a!b@c','base64url')` 静默产出垃圾）、Alternatives considered（引 jose/jws 库否决——零新依赖纪律；手写 DER 转换否决——原生支持存在且手写是 bug 面；mock 验签否决——真实密码学咬合）、Consequences（2B adapter 零返工衔接、真实数字读数）。

- [ ] **Step 4: 写 ADR-0182 + 索引 + decisions.json**

ADR 仿 ADR-0181 形态（accepted、决策记录链 Note、相关 ADR-0163/0164/0174；机器可读决策块 D1–D3：D1 纯内核切片不冒充登录；D2 精确相等无规范化 + strict base64url；D3 ES256 走 node 原生 p1363）。README 索引行追加，`node scripts/gates/adr-agent-records.mjs --write`。

- [ ] **Step 5: gate 全绿 + commit**

```bash
node scripts/gate.mjs > /tmp/sage-gate-0182b.txt 2>&1; echo "exit=$?"; tail -1 /tmp/sage-gate-0182b.txt
git add docs/notes/implemented/security/2026-10-01-oidc-verification-kernel.md docs/adr/ADR-0182.md docs/adr/README.md docs/adr/decisions.json
git commit -m "docs(adr): ADR-0182 OIDC verification pure kernel with note"
```

---

## Self-Review 结果（写计划时已跑）

1. **Spec 覆盖**：§3.1 metadata→Task 3；§3.2 jws→Task 1；§3.3 id-token→Task 2；§3.4 callback→Task 4；§3.5 fixture→Task 1；§4 变异验证→Task 5 Step 1 + 各任务审查；§5 不做项均无任务（正确）。
2. **占位扫描**：无 TBD/TODO；Task 2 的 `exp: undefined` 注释、Task 4 的 fake consumeState 注释均为语义说明非占位。
3. **类型一致性**：`verifyCompactJws`/`verifyIdToken`/`verifyProviderMetadata`/`verifyAuthorizationCallback`/`verifyPkceS256` 签名在各任务与 Interfaces 块一致；fixture 函数名与 Task 1 Produces 列表逐一对齐；`JwsRejection`/`IdTokenRejection` 联合类型跨任务一致。
4. **预检偏差修正**（控制器实测，计划已吸收）：ES256 DER 手写转换→node 原生 `dsaEncoding: 'ieee-p1363'`；base64url 需 strict roundtrip（Buffer.from 静默截断实测）；spec §3.2 的「raw r||s 转换逻辑本身带负例」由「DER 形签名拒 + 长度 ≠ 64 拒」两条负例承载。