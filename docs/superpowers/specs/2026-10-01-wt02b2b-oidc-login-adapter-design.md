# WT-02B.2B · 真实 OIDC 登录链路设计（Logto，切片一）

日期：2026-10-01 · 状态：设计已获用户确认（A/A/A） · 上游：[ADR-0182](../../adr/ADR-0182.md)（验证内核）、[WT-02B.2A 治理](../../notes/proposed/architecture/2026-09-28-real-identity-and-authority-data-governance.md)、ADR-0163/0164

## 1. 目标与切片

WT-02B.2B-pre 已交付 OIDC 验证纯内核（jws/id-token/metadata/callback，ADR-0182）。本票接上真实 IdP（Logto）完成**登录链路闭环**：renderer 登录按钮 → main 唤起系统浏览器（Authorization Code + PKCE S256）→ loopback HTTP 收 callback → token exchange → 内核全链验证 → token 进 main 纯内存 vault → state 反映登录态。验收 = 用户在真实浏览器登录 Logto 端到端。

**裁决（用户确认）**：
- **D1 完整登录链路 + vault**：refresh/revocation/auto-renewal/多账户留第二票（token 过期后需重新登录，测试期可接受）。
- **D2 登录进 state 合同**：`service` 加 `auth` 子对象；登录/登出走 `/.sage/login`、`/.sage/logout` 两条 route（复用 0.1 binding + 0.2 typed 响应骨架）。
- **D3 纯内存 vault**：重启重登；safeStorage 落盘违反「retention/legal hold 未确认时禁止持久化」红线，本票不做。

**真实部署参数（已探测核验；clientId 于 2026-10-01 验收期订正）**：
```
issuer:            https://dk7z03.logto.app/oidc
clientId:          cmg2ty121m1tlsd0fgiuv   # Native public client；原 lck70zxqbzr62dw39ykqh 为 Traditional Web
                                           # （confidential）应用，实测拒绝 PKCE-only token exchange（401 invalid_client）
redirect:          http://127.0.0.1:3000/callback
scopes:            openid profile offline_access
签名算法:          ES384（JWKS 唯一 key: EC P-384）— 方向 1：内核加 ES384
token auth method: none（PKCE-only public client，client_secret 绝不出场）
revocation:        存在（/oidc/token/revocation），本票不调用
```

## 2. 文件结构

```
apps/sage-shell/src/security/oidc/jws.ts        # 扩展：ES384 + seam 兑现（timingSafeEqual、四条负例转正）
apps/sage-shell/src/main/oidc-config.ts         # 新增：issuer/clientId/redirect/scopes 常量（非凭据，可入库）
apps/sage-shell/src/main/oidc-adapter.ts        # 新增：登录流程编排（main 专属，允许 import electron shell）
apps/sage-shell/src/main/token-vault.ts         # 新增：纯内存 vault
apps/sage-shell/src/appservice/contracts.ts     # 扩展：service.auth 子对象合同
apps/sage-shell/src/appservice/route-skeleton.ts # 扩展：/.sage/login、/.sage/logout 路由
apps/sage-shell/src/appservice/composition.ts   # 扩展：auth 状态进 readState
apps/sage-shell/src/main/index.ts               # 接线：adapter + vault 注入 service
apps/sage-shell/src/product/renderer.ts         # 登录按钮/登录中/显示名+登出
apps/sage-shell/test/
  oidc-jws.spec.ts（扩展 ES384）、oidc-adapter.spec.ts（新）、token-vault.spec.ts（新）
  appservice-route-skeleton.spec.ts（扩展）、appservice-composition.spec.ts（扩展）
  fixtures/oidc-keys.ts（扩展 P-384 密钥对）
```

import 边界不变：`src/security/oidc/` 零 Electron import（adapter 侧喂 bytes）；`src/appservice/` 仍受 firewall 约束——auth 合同纯数据，adapter 实例由 main 注入。

## 3. 内核扩展（jws.ts + fixtures）

- **ES384**：`acceptedAlgs` 联合加 `'ES384'`；`algMatchesKeyType` EC 分支区分 `crv === 'P-256'`（ES256）/`crv === 'P-384'`（ES384）；raw 签名长度按 crv（64 / 96）；验签 `createVerify('SHA384')` + `dsaEncoding: 'ieee-p1363'`（控制器已实测 P-384 原语可行）。
- **seam 兑现（ADR-0182 登记）**：state/nonce/challenge 比较换 `timingSafeEqual`（内核内所有全等比较点）；四条负例转正：JWKS 重复 kid、ES256-claim 配 RSA-key 反向混淆、非字符串 kid、混合类型 aud 数组。
- fixture 加 P-384 密钥对（kid `test-es384`）+ `signEs384Der`/`signEs384RawWithLength` 负例工具（复刻既有 ES256 形）。

## 4. oidc-adapter.ts（main 专属）

```ts
export interface OidcAdapterDeps {
  readonly fetchImpl: typeof fetch                 // 注入（单测 fake）
  readonly openExternal: (url: string) => Promise<void>  // shell.openExternal 注入
  readonly now: () => number
  readonly listen: (port: number, handler: (req: IncomingMessage) => void) => Promise<void>  // loopback server 注入
  readonly randomBytes: (n: number) => Buffer
}
export interface LoginOutcome { readonly ok: true; readonly displayName: string | null } | { readonly ok: false; readonly code: LoginErrorCode }
// login-superseded（2026-10-01 验收修复新增）：token 验证全过、但写回时 vault 已非 pending
// （logout 等操作取代了进行中的流）——拒绝复活已退出的 session。
export type LoginErrorCode = 'idp-unreachable' | 'callback-invalid' | 'token-verification-failed' | 'login-timeout' | 'login-in-progress' | 'login-superseded'
```

流程（`startLogin(deps, vault)`）：
1. vault 已 signed-in 或 pending → 拒绝（pending 409 语义 / signed-in 需先 logout）。
2. 生成 state（32B）、nonce（32B）、PKCE verifier（`randomBytes(48)` base64url，64 字符合法）；记入一次性表。
3. loopback server 监听 `127.0.0.1:3000/callback`（注入 listen）；5 分钟超时窗口。
4. `openExternal(authorizationEndpoint?client_id&redirect_uri&response_type=code&scope&state&nonce&code_challenge=S256(verifier)&code_challenge_method=S256)`。
5. callback 到达 → 内核 `verifyAuthorizationCallback`（state 一次性）→ 拿 code → 关 server。
6. `fetchImpl(tokenEndpoint, POST urlencoded: grant_type=authorization_code&code&redirect_uri&client_id&code_verifier)` —— 无 secret 字段。
7. `fetchImpl(discovery)` bytes → 内核 `verifyProviderMetadata`（对 oidc-config 期望值）→ `fetchImpl(jwks)` bytes → 内核 `verifyIdToken`（ES384、expectedNonce）。
8. 全链过 → vault 写入（token 本体 + 脱敏 displayName 取 `name ?? username` claim，无 sub/email）；任一步败 → vault 不写、返回 typed 错误码。写回仅在 vault 仍处 pending 时生效（`signIn` 返回是否应用，2026-10-01 验收修复）；不再 pending 时返回 `login-superseded`。

尺寸上界（ADR-0182 seam 合同）：discovery ≤64KiB、JWKS ≤256KiB、token 响应 ≤64KiB、JWKS keys ≤16——超限按 `idp-unreachable`/`token-verification-failed` fail closed。

## 5. token-vault.ts

```ts
export interface TokenVault {
  status(): 'signed-out' | 'pending' | 'signed-in'
  beginPending(): boolean   // 仅自 signed-out 进入（2026-10-01 验收修复；signed-in 须先 logout）
  signIn(session: { readonly accessToken: string; readonly idToken: string; readonly displayName: string | null }): boolean  // 仅 pending 时应用
  signOut(): void
  snapshot(): { readonly status: 'signed-out'|'signed-in'; readonly displayName: string | null }
}
```

- 纯内存（Map 字段私有）；`signOut` 置空引用；`snapshot` 只吐 status + displayName——**accessToken/idToken 没有任何读取出口**（本票无 API 调用方，唯一消费者是未来 refresh 票）。
- pending 态由 adapter `beginPending` 驱动；超时/失败回 signed-out。状态机全函数（2026-10-01 验收修复）：logout 永远获胜——完成中的登录流在非 pending 态写回被拒，不得复活已退出的 session。

## 6. state 合同与路由（contracts/route-skeleton/composition）

- `ServiceStatus` 扩展：`auth: { readonly status: 'signed-in' | 'signed-out' | 'pending'; readonly displayName: string | null }`。
- 新路由：`GET /.sage/login`（触发 adapter，返回 202 + `{auth:'pending'}` 或 typed 错误）、`POST /.sage/logout`（清 vault，返回 200 + `{auth:'signed-out'}`）——两者都先过 0.1 caller binding。
- readState 的 `service.reason`：signed-out 时维持 `identity-unavailable`（与 0.2 语义连续）；signed-in/pending 时 reason 语义升级为身份已建立（Product 面另票扩展，本票 reason 枚举先加 `'authenticated'`）。
- 错误体沿 0.2 脱敏合同：LoginErrorCode 无 provider 原文/token 片段/stack。

## 7. renderer

- signed-out：卡片显示「登录」按钮 → `fetch('/.sage/login')` → 状态转 pending（**2s state 轮询**重读，2026-10-01 验收修复为显式机制；实测登录流约 5–10s，且 Electron 43 custom-protocol fetch 不响应 `AbortController.abort()`，收敛不得依赖 click fetch 的 5s 截止或结算）。
- pending：「正在登录…」（vault pending 由 main 接线合成进 state，2026-10-01 验收修复）。
- signed-in：显示 `displayName` + 「登出」按钮 → `POST /.sage/logout`。
- state 渲染沿 0.1 两形守卫 + 0.2 retry 守卫既有模式扩展。

## 8. 测试与验收

1. 内核 ES384：正例 + DER 形拒 + 95 字节拒 + 错 key 拒；seam 转正四负例。
2. adapter 全链单测：注入 fake `fetchImpl`（discovery/JWKS/token 响应 + fixture P-384 真签 ID token）、fake `openExternal`/`listen`/clock——**密码学真实、网络假**；负例矩阵逐 LoginErrorCode（fetch 失败/超时/callback 无 code/内核验签失败/尺寸超限）。
3. loopback 集成：真实 `http.Server` 真实端口（127.0.0.1 随机高位端口）收一次 callback 后即关。
4. vault：三态转换、signOut 后 snapshot 回 signed-out、accessToken 无读取出口（类型面即合同）。
5. route/composition：login/logout 路由 + auth 子对象断言；0.1/0.2 既有断言不破（auth 子对象为新增字段）。
6. **端到端验收**：`npm run dev` → 用户在系统浏览器登录 Logto → state 显示 signed-in + displayName → logout 回 signed-out。读数截屏/日志留 Note。
7. gate 25/25、全量、typecheck、Note + ADR-0183。

## 9. 不做（边界）

- refresh token 轮换/自动续期/revocation 调用/过期检测（第二票）。
- safeStorage 落盘（治理红线）。
- 多账户切换、Organizations/roles claims 消费、identity-policy resolver assertion organization 迁移（治理文档 L47，2B 后半）。
- access token 的任何 API 调用方（vault 只存不出）。
