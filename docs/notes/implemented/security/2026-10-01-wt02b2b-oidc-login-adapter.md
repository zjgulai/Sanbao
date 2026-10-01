# WT-02B.2B · 真实 OIDC 登录链路收口（Logto，切片一）

日期：2026-10-01 · 分类：security · 关联 ADR：[ADR-0183](../../../adr/ADR-0183.md)

## Problem

WT-02B.2B-pre（[ADR-0182](../../../adr/ADR-0182.md)）交付了 fail-closed 验证纯内核，但 Sage 仍无真实登录链路：renderer 无登录面、main 不接 IdP、token 无去处。本票（commits `d9ae5b0` / `be20c4d` / `55378cb` / `a5f95fb` / `8b322f9`，BASE `10bff66`）在治理红线内（PKCE-only public client、token 只驻 main 纯内存、renderer 永不接触 token 本体）闭环登录：renderer 登录按钮 → main 唤起系统浏览器（Authorization Code + PKCE S256）→ loopback HTTP 收 callback → token exchange → 内核全链验证（ES384）→ vault 签入 → state 反映登录态。验证方式为「密码学真实、网络假」的注入式单测 + 真实 loopback server 集成；真实网络端到端验收需用户浏览器配合（见 Consequences，pending）。

## Decision

三裁决（用户确认，spec A/A/A）与四项实现裁定：

1. **D1 完整登录链路 + vault**：adapter（`src/main/oidc-adapter.ts`）编排 state/nonce/PKCE 生成 → loopback 监听 → `openExternal` → callback 一次性消费（state 一次性由 ADR-0182 kernel `verifyAuthorizationCallback` 强制）→ token exchange → discovery/JWKS/ID token 全链过内核（`verifyProviderMetadata` / `verifyIdToken`，ES384）→ vault 签入。refresh/revocation/auto-renewal/多账户留第二票（token 过期后需重新登录）。**全注入设计（密码学真实网络假）**：`OidcAdapterDeps` 注入 `fetchImpl` / `openExternal` / `listen` / `randomBytes` / `now`——单测打真 ES384 密码学 + fake 网络，adapter 零 electron import，生产 deps（`src/main/oidc-runtime.ts` 的 `createLoopbackTransport` 真实 `node:http` 一次性 server + `createProductionAdapter`）由 main 接线组装。
2. **D2 登录进 state 合同**：`ServiceStatus.auth: AuthStatus`（signed-in/signed-out/pending + displayName）；`GET /.sage/login` / `POST /.sage/logout` 两条 route 复用 0.1 binding + 0.2 typed 响应骨架；renderer 登录面（登录/退出按钮 + displayName + 「正在登录…」）。login 失败沿 0.2 脱敏合同返回 `{code, stage, retryable, correlation}`（LoginErrorCode 五值，无 provider 原文/token 片段/stack）。
3. **D3 纯内存 vault**：`createTokenVault` 闭包持 session，`snapshot()` 只吐 `{status, displayName}`——**accessToken/idToken 无任何读取出口**（类型面即合同）；`signOut()` 置空引用。safeStorage 落盘违反「retention/legal hold 未确认时禁止持久化」红线，不做。
4. **ES384（方向 1）**：真实 Logto JWKS 唯一 key 为 EC P-384，内核 `acceptedAlgs` 扩 `'ES384'`（`algMatchesKeyType` 区分 P-256/P-384，raw 签名 64/96 字节，`createVerify('SHA384')` + p1363），而非引入第二验签路径。Logto 真实参数（public client 非凭据，可入库）：issuer `https://dk7z03.logto.app/oidc`、clientId `lck70zxqbzr62dw39ykqh`、redirect `http://127.0.0.1:3000/callback`、scopes `openid profile offline_access`。
5. **尺寸上界兑现 ADR-0182 seam 合同**：adapter 注入层施加 discovery ≤64KiB、JWKS ≤256KiB、token 响应 ≤64KiB、JWKS keys ≤16——超限 fail closed（discovery/JWKS → `idp-unreachable`，token → `token-verification-failed`）；变异验证实测移除 discovery 上界判定即红。
6. **timingSafeEqual 兑现**：kernel `state`/`nonce`/PKCE challenge 比较及 `id-token.ts` 的 `iss`/`nonce` 比较换 `safeEqual`（`timingSafeEqual` + 长度前置检查），等值语义不变、既有负例全绿（含 `state-replayed` 一次性重放拒绝）。
7. **两项前序必办项闭环**：① `guardOpenExternalCloseListen`——`openExternal` 抛错先 `closeListen` 再 rethrow（防 3000 端口 EADDRINUSE 泄漏，测试断言 closes=1 + 变异验证 Mut2 红）；② `renderAuth` 补 login/logout 按钮 `disabled` 复位（失败后按钮重臂，真实嵌入 script click→refresh 链断言）。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| mock 网络 + mock 验签（只测流程编排） | 否决；真实密码学咬合是验收立足点——tampered signature / 攻击者密钥 kid 冒名 / nonce 不匹配 / DER 形负例必须打在真 crypto 上。mock 网络保留、验签真实（fake IdP 用 fixture P-384 真签 ID token）。 |
| safeStorage 持久化 session | 否决；违反「retention/legal hold 未确认时禁止持久化真实身份或敏感经营数据」治理红线（ADR-0164）。重启重登在测试期可接受。 |
| 独立 login route 进程 / 独立登录窗口 | 否决（裁决 B 形态未采用）；复用 0.1 caller binding + 0.2 typed 响应骨架，登录进既有 `/.sage/*` route 家，不另开 command owner 面。 |
| 引入 jose 等验签库承载 ES384 | 否决；沿 ADR-0182 零新依赖纪律，node:crypto 原生 p1363 已覆盖 P-384 双向语义。 |
| 内核自守输入尺寸 | 否决；ADR-0182 已裁定尺寸上界是注入层合同，内核纯函数不自守——本票在 adapter 注入层兑现（见 Decision 5）。 |

## Consequences

- **全量回归三件套**（2026-10-01，真实数字）：sage-shell `node scripts/test.mjs run` **55 files / 528 tests 全 PASS**（Duration 10.24s）；`npm run typecheck` 0 error；仓根 `node scripts/gate.mjs` **25/25 通过**（mode=quick，exit=0；含 sage-appservice-import-firewall / sage-product-boundary / docs-link-integrity）。本票新增 40 tests：oidc 全家 58（jws 17 / id-token 10 / callback 9 / metadata 5 / adapter 10 / runtime 7）＋ vault 4 ＋ route/composition/renderer auth 面扩展。
- **变异验证读数**（各任务报告，改源→红→还原后 diff 为空）：ES384 三负例红（fixture 无 P-384 即 `No key provided to sign`）；vault `beginPending` 无条件 true / `signOut` 不置空均红；adapter 移除 discovery 尺寸上界判定红、`login-timeout` 误标 `callback-invalid` 红；runtime 删 one-shot `next.close()` 红、删 guard 兜底 `closeListen` 红、删 renderAuth disabled 复位红。Task 3 Mut3（`consumeState` 重放）存活有据：adapter 层重放结构不可达（fresh random state + 一次性 callback promise），one-shot 由 kernel 强制且 `oidc-callback.spec.ts` 有 `state-replayed` 负例。
- **遗留登记（后续票候选，如实不升级）**：① pending 期 snapshot 报 signed-out——vault `snapshot()` 只看 session null 与否，main 永不回 pending，renderer pending 态仅 click 后本地承接，UX 断层（Task 5 concern 4）；② 端口 3000 冲突（EADDRINUSE）与 IdP 真不可达统一映射 `idp-unreachable`，无更细 error surface（不扩 LoginErrorCode 合同）；③ login 请求 main 侧最长 5 分钟长阻塞——renderer `fetchWithinDeadline` 5s 超时后 UI 已恢复，main promise 仍在跑（既有合同形态；触发式 login + pending receipt 轮询为改法候选）；④ Task 3 Important-①：尺寸上界在 `response.text()` 之后才检查（非流式截断），HTTPS 钉 Logto 下低险，content-length 预检为后续票候选。
- **端到端验收 pending（真实网络唯一证据）**：需用户浏览器配合，由控制器主持，见后续验收记录。本票落档不等于真实登录完成；devtools 状态读数与截屏留档由验收记录承接。ADR-0163/0164 fail closed 与 ADR-0174 unavailable-first 边界继续成立：identity handle / organization mapping / authority grant（治理文档 2B 后半）不在本票范围。
- **token 零读取出口的本票含义**：accessToken/idToken 只存不出——本票无 API 调用方，唯一消费者是未来 refresh 票；这在切片一是合同而非缺口。logto 探测参数（非凭据）入库 `src/main/oidc-config.ts`，client_secret 架构上不存在（PKCE-only public client）。
