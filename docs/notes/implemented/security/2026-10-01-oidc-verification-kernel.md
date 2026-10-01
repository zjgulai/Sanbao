# WT-02B.2B-pre · OIDC 验证纯内核收口（变异验证 + 全量回归）

日期：2026-10-01 · 分类：security · 关联 ADR：[ADR-0182](../../../adr/ADR-0182.md)

## Problem

WT-02B.2B（真实 OIDC adapter + system-browser callback + vault + session）的硬前置——真实 issuer / client / redirect / audience / scopes——尚未到位，但验证链本身是整个身份面**写松一条即失守**的最大风险块：compact JWS 解析、JWKS 选 key、RS256/ES256 验签、ID token claims（iss/aud/azp/exp/nbf/iat/nonce）、provider metadata endpoint 精确比对、authorization callback 的 state 一次性消费与 PKCE S256。按治理红线「真实登录等待期间只允许纯 kernel、fixture / blocked projection 与 inventory 开发」，这些校验若留在 2B adapter 任务里与网络 / 浏览器 / 持久化耦合交付，将无法在参数缺位期做可变异验证的收口。设计 spec（`docs/superpowers/specs/2026-10-01-oidc-verification-kernel-design.md`，切片 A）确定先落纯内核；Task 1–4（commits `7754172` / `853a5d1` / `f0bca37` / `57e8cbb`）交付了四模块，本票负责把验收做实：变异验证逐条咬住负例、全量回归、决策留痕。

## Decision

本票（W03 Task 5 收口）确认 WT-02B.2B-pre 的交付形态与两条密码学预检裁定：

1. **纯内核切片，不冒充产品登录**：`apps/sage-shell/src/security/oidc/` 四模块（`jws.ts` / `id-token.ts` / `metadata.ts` / `callback.ts`）为无 I/O 纯函数——`id-token.ts` 复用 `jws.ts` 验签底座（import `./jws.js`，`IdTokenRejection` 由 `JwsRejection` union 同源扩展），`metadata.ts` / `callback.ts` 不依赖兄弟模块；不进 composition、不接 main / renderer。密钥 fixture 在测试内 `generateOidcKeys()` 本地生成，不入库不落盘。参数到位后 2B adapter 叠在其上，内核接口零返工。
2. **精确相等 + strict base64url，无 URL 规范化**：所有 issuer / endpoint / nonce / state 比对一律字符串精确相等（`https://idp.example` ≠ `https://idp.example/`，拒绝尾部斜杠归一）；base64url 解码走 charset 检查 + **re-encode roundtrip 相等**——预检实测 `Buffer.from(str, 'base64url')` 对非规范形（如 `bXwwe`、含 `!@` 的串）静默产出垃圾字节而不抛错，roundtrip 比对是唯一拦截层。
3. **ES256 走 node 原生 `dsaEncoding: 'ieee-p1363'`**：签名与验签均由 `node:crypto` 原生承载 raw `r||s`（64 字节）与 DER 的双向语义，**否决 spec 原案的手写 DER↔raw 转换**——控制器预检实测原生支持存在，手写转换只增加 bug 面。内核仍保留显式 `signature.length !== 64` 拒绝（JWS 层自己的契约声明，见 Consequences 的存活记录）。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 引入 jose / jws 等验签库 | 否决；零新依赖纪律（npm 外部层引入需独立审批），且库的宽容解析面（如默认容忍非规范 base64url）与本内核的 strict 契约相反。 |
| ES256 手写 DER↔raw 转换（spec 原案） | 否决；node:crypto 原生 `dsaEncoding: 'ieee-p1363'` 已覆盖双向语义，手写字节级转换是纯粹的 bug 面（负例「DER 形签名拒」由 node 层抛错 + catch 承载，实测可咬）。 |
| mock 验签（只测 claims 链逻辑） | 否决；真实密码学咬合是本票验收的立足点——tampered signature、unknown key、DER 形、错误长度四类负例必须打在真 crypto 上，mock 会把「写了但从没跑到」家族直接带进身份面。 |
| 验证链与 2B adapter 一起交付 | 否决；参数缺位期无法收口，且网络 / 浏览器 / 持久化耦合会让变异验证无法隔离到单条校验。 |

## Consequences

- **变异验证读数**（2026-10-01，11 项点名校验逐条「注释实现行 → 跑对应 spec 确认红 → git 恢复，终态 diff 为空」）：**10 项红、1 项存活有据**。逐条记录见 `.superpowers/sdd/2026-10-01-oidc-verification-kernel/task-5-report.md`。存活项为 jws.ts 的 `signature.length !== 64`：node 26 对错误长度 p1363 签名自抛 `ERR_CRYPTO_OPERATION_FAILED`（"Malformed signature"，探针实测），DER 形与 63 字节负例由 crypto 层 + catch 拒绝，黑盒层面该检查不可区分——如实登记为纵深防御（防 node 未来放宽长度语义），不伪造红。kid 计数守卫（`matches.length !== 1`）的变异是崩溃式红（ghost kid 走到 `matches[0]` undefined 抛 TypeError），测试确实咬住。
- **全量回归三件套**（2026-10-01，真实数字）：sage-shell `node scripts/test.mjs run` **52 files / 488 tests 全绿**（Duration 10.07s）；`npm run typecheck` 0 error；仓根 `node scripts/gate.mjs` **25/25 通过**（quick mode，exit=0）。
- **brief 数据 bug 三处修正（计划质量反馈，如实登记）**：① Task 1 strict decode 用例的 `bXww` 是 roundtrip 合法段（解码 `m|0` 重编码相等），brief 自己的实现不可能对它返回 `not-compact-jws`，逐字照抄即红——改测试数据为 `bXwwe`（静默截断形）守住用例意图；② Task 2 forged token 的 sig 段 `aa` 非规范形（解码 `0x69`、重编码 `aQ`），strict decode 先拒到不了 `kid-not-found` 分支——换成规范形 `YWJj`；③ Task 4 fake `consumeState` 的 `consumed:true` 分支字面量恒真（`gone-` 前缀键从未写入）且断言 reason 误写 `state-mismatch`——按注释意图修正为一次性语义 + `state-replayed`。三处均为「测试侧最小修数据、实现零改动」，共同根因是「看起来合法的 base64url / 布尔字面量其实与自身语义矛盾」——后续计划里手写密码学测试数据应附 roundtrip 自检。
- **2B adapter 零返工衔接**：四模块接口（`verifyCompactJws` / `verifyIdToken` / `verifyProviderMetadata` / `verifyAuthorizationCallback` / `verifyPkceS256`）即 2B 的验证合同；2B 只需补网络取 JWKS、浏览器回调、token 交换与 session/vault，参数到位另票。**输入尺寸上界是 2B 注入层合同，不是内核职责**：内核纯函数不自守输入尺寸，2B adapter 注入层必须施加 token / JWKS bytes 与键数上限（数值由 2B 票定）。
- 本票不接真实 provider、无网络 / 浏览器 / token 交换 / session；ADR-0163/0164 的「真实身份默认最小化、fail closed」与 ADR-0174 的 unavailable-first 边界继续成立。治理文档落档不等于真实 provider、产品接线或产品验收完成。
