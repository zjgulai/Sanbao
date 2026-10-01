# WT-02B.2B-pre · OIDC 验证纯内核设计

日期：2026-10-01 · 状态：设计已获用户确认（切片 A） · 上游：[WT-02B.2A 治理](../../notes/proposed/architecture/2026-09-28-real-identity-and-authority-data-governance.md)、[ADR-0163](../../adr/ADR-0163.md)、[ADR-0164](../../adr/ADR-0164.md)

## 1. 目标与定位

WT-02B.2B（真实 OIDC adapter + system-browser callback + vault + session）的硬前置——真实 issuer/client/redirect/audience/scopes——尚未到位（用户有真实 IdP，测试环境参数待提供）。按治理红线「真实登录等待期间只允许纯 kernel、fixture/blocked projection 与 inventory 开发」，本票交付 2B 的**验证逻辑纯内核**：把 fail-closed 校验链（任何一条写松，整个身份面失守的最大风险块）做成可测、可变异验证的纯函数层。参数到位后，2B adapter（网络/浏览器/持久化）叠在其上，内核零返工。

**本票不冒充产品登录**：无网络请求、无浏览器唤起、无 token 交换、无 session/vault、无 main/renderer 接线。密钥 fixture 在测试内本地生成（beforeAll），不入库不落盘。

## 2. 文件结构

```
apps/sage-shell/src/security/oidc/
  metadata.ts      # issuer metadata 精确校验（RFC 8414 形状）
  jws.ts           # compact JWS 解析 + JWKS kid 选 key + RS256/ES256 真实验签
  id-token.ts      # ID token claims 校验链（iss/aud/exp/nbf/iat/nonce）
  callback.ts      # authorization callback 校验（state 一次性 + PKCE S256）
apps/sage-shell/test/
  oidc-metadata.spec.ts
  oidc-jws.spec.ts
  oidc-id-token.spec.ts
  oidc-callback.spec.ts
  fixtures/oidc-keys.ts   # beforeAll 生成 RSA/EC 密钥对 + 真签真验工具
```

归属 `src/security/oidc/`（provider 侧内核，非 `appservice/` 编排层）。与既有 security kernel 同款纪律：**零 Electron import、零网络 I/O、时间/随机/JWKS bytes 全部参数注入**。

## 3. 模块合同

### 3.1 metadata.ts

```ts
export interface ExpectedProviderMetadata {
  readonly issuer: string                        // 精确 URL（含尾斜杠语义按 OIDC Core：字符串全等）
  readonly authorizationEndpoint: string         // 精确 URL
  readonly tokenEndpoint: string
  readonly jwksUri: string
}
export type MetadataRejection =
  | 'not-json-object' | 'issuer-mismatch' | 'authorization-endpoint-mismatch'
  | 'token-endpoint-mismatch' | 'jwks-uri-mismatch' | 'missing-required-field'
export function verifyProviderMetadata(input: {
  readonly untrusted: unknown                    // caller 已取得的 metadata JSON（bytes 由 adapter 层取）
  readonly expected: ExpectedProviderMetadata
}): { readonly ok: true } | { readonly ok: false; readonly reason: MetadataRejection }
```

**精确相等，无近似**：全部字段字符串全等比较；`untrusted` 非 JSON 可达对象、缺任一必填字段、或任一字段与期望不等 → 拒绝。URL 不做规范化/去斜杠（规范化是引入近似匹配的最大漏洞面）。

### 3.2 jws.ts

```ts
export type JwsRejection =
  | 'not-compact-jws' | 'header-not-json' | 'unsupported-alg' | 'alg-none'
  | 'missing-kid' | 'kid-not-found' | 'key-type-mismatch' | 'signature-invalid'
  | 'payload-not-json'
export function verifyCompactJws(input: {
  readonly untrustedToken: string
  readonly jwks: unknown                         // caller 注入的 JWKS JSON
  readonly acceptedAlgs: readonly ('RS256' | 'ES256')[]
}): { readonly ok: true; readonly protectedHeader: Record<string, unknown>; readonly payload: unknown } | { readonly ok: false; readonly reason: JwsRejection }
```

- compact JWS 三段（base64url header.payload.signature）逐段校验；
- header 必须含 `alg` ∈ acceptedAlgs（`none` 显式拒绝）、`kid` 字符串；
- JWKS `keys[]` 按 `kid` **精确匹配**取唯一 key（未命中/多命中均拒绝）；JWK `kty` 与 alg 匹配（RSA↔RS256、EC↔ES256 且 `crv` P-256）；
- RS256：`node:crypto` `createVerify('RSA-SHA256')` + JWK 转 `KeyObject` 真实验签；ES256：`createVerify('SHA256')` + DER 签名（JWS 用 raw r||s，需转换——转换逻辑本身带负例测试）；
- 验签失败 = `signature-invalid`，不区分细类（防 oracle）。

### 3.3 id-token.ts

```ts
export type IdTokenClaimRejection =
  | 'jws-rejected' | 'iss-mismatch' | 'aud-missing' | 'aud-mismatch' | 'azp-mismatch'
  | 'expired' | 'not-yet-valid' | 'iat-unreasonable' | 'nonce-mismatch' | 'missing-claim'
export function verifyIdToken(input: {
  readonly untrustedToken: string
  readonly jwks: unknown
  readonly expectedIssuer: string
  readonly clientId: string
  readonly expectedNonce: string
  readonly now: number                          // 注入 epoch 秒
  readonly clockSkewSeconds: number             // 显式常量建议 60
}): { readonly ok: true; readonly claims: Record<string, unknown> } | { readonly ok: false; readonly reason: IdTokenClaimRejection }
```

claims 校验链：`iss` 精确全等；`aud` 含 `clientId`（数组或单字符串两形都接受；多 aud 时 `azp` 必须精确等于 clientId）；`exp`/`nbf` 按 now±skew 判窗；`iat` 不得晚于 now+skew（未来签发拒绝）；`nonce` 精确全等。**claims 不透传 raw subject**——成功结果只返回校验通过的 claims 对象给 caller（adapter 层自约束不持久化；本票不产生任何持久化路径）。

### 3.4 callback.ts

```ts
export type CallbackRejection =
  | 'missing-code' | 'error-response' | 'state-mismatch' | 'state-replayed'
  | 'code-verifier-invalid' | 'pkce-mismatch'
export function verifyAuthorizationCallback(input: {
  readonly untrustedQuery: Record<string, unknown> | URLSearchParams  // 两种注入形态
  readonly expectedState: string
  readonly consumeState: (state: string) => boolean  // caller 持有一次性状态表；返回 false = 已消费/不存在
  readonly codeVerifier: string                    // Sage 侧保存的 verifier（43~128 字符 RFC 7636）
}): { readonly ok: true; readonly authorizationCode: string } | { readonly ok: false; readonly reason: CallbackRejection }
```

- `error` 参数存在 → `error-response`（不透传 error 描述，防泄漏）；
- `state` 精确全等 + `consumeState` 必须返回 true（重放即拒）；
- `code` 必须为非空字符串；
- PKCE：本票只验 **verifier 形状合法**（43–128 字符、base64url 字符集）——S256 challenge 与 verifier 的比对发生在 token endpoint 响应验证（属 2B adapter 持有 challenge；内核提供 `verifyPkceS256(verifier, challenge)` 纯函数：`base64url(sha256(verifier)) === challenge`）。

### 3.5 fixtures/oidc-keys.ts（测试侧）

`beforeAll` 用 `generateKeyPairSync('rsa', {modulusLength: 2048})` + `('ec', {namedCurve: 'P-256'})` 生成密钥对；`signToken(privateKey, header, payload)` 产真实 compact JWS；JWK 从公钥导出。**密钥每次测试运行新生成，不入库、不落盘、不打印。**

## 4. 测试与验收

1. 每模块 RED→GREEN（TDD）。
2. **负例矩阵**：每条 rejection 原因至少一条真实负例（错 issuer/过期/错 key 签名/state 重放/nonce 不符/alg=none/kid 指错 key/ES256 raw-vs-DER 边界/多 aud 无 azp……）。
3. **变异验证**：审查阶段逐条注释校验行，确认对应负例红（继承 0.2 审查方法）。
4. 全量 `node scripts/test.mjs run`、typecheck 0、gate 25/25。
5. Note + ADR-0182 落档（决策：纯内核切片、精确匹配无近似、node:crypto 无新依赖、不冒充登录）。

## 5. 不做（边界）

- 无网络获取（metadata/JWKS bytes 全由 caller 注入）——HTTP/缓存/刷新属 2B adapter。
- 无系统浏览器唤起、无 loopback HTTP server、无 token 交换请求。
- 无 vault / session / refresh / revocation（B 切片或 2B）。
- 无 main/renderer 接线、不改 0.1/0.2 appservice 面。
- 不产 PKCE challenge（用 seed 既有 `pkce-challenge` 包属 adapter 侧；内核只验 verifier/challenge）。
- 不接 identity-policy resolver（assertion organization 迁移属 2B，治理文档 L47 明确）。

## 6. 与 2B 的衔接（登记）

参数到位后 2B adapter = `shell.openExternal`（授权 URL）+ loopback HTTP（收 callback）+ fetch（metadata/JWKS bytes）+ 喂本内核 + vault。内核签名已按注入式设计，adapter 只实现注入源，不改内核。
