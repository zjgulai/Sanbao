# WT-02B.2C · identity registry / identity handle（runtime-only）落地

日期：2026-10-02 · 分类：security · 关联 ADR：[ADR-0185](../../../adr/ADR-0185.md)

## Problem

2A 治理链固定：Identity Provider 只证明 `(issuer, subject)` → **Sage-owned identity registry 产生内部 identity handle + candidate org refs**（不证明 membership）；scoped `subjectRef` 必须等 Organization Policy 证明 scope 后由 identity vault 生成；**禁止对 raw subject 做无密钥 deterministic hash**；retention / legal hold 未确认前禁止持久化真实身份。WT-02B.2B 之后登录链止于「已验证 id_token → 纯内存 token vault（token + displayName）」——**identity handle 尚不存在**，2B 后半的后续（organization mapping、Policy-exclusive membership）没有可消费的内部身份引用。

## Decision

用户三裁决 R1（最小切片）/ R2（runtime-only）/ R3（仅 main 内部）+ 立项澄清，全部落地：

1. **registry 内核**（`src/main/identity-registry.ts` 新增）：`createIdentityRegistry({ randomHandle })` —— 复合键 `issuer + '\u0000' + subject` 进程内映射；命中复用、未命中以注入随机性铸 43 字符 opaque handle（生产接线 `randomBytes(32).toString('base64url')`）；条目含恒空 `candidateOrgRefs`（org claim 提取属 organization mapping 票）。零持久化、零日志、零 deterministic hash。
2. **vault 扩展**（`src/main/token-vault.ts`）：`VaultSession.identityHandle` 随 signIn 存入；新增 **main 内部** 访问器 `identityHandle(): string | null`（logout / 超驰路径即清）；`snapshot()` 逐字段不变（只吐 `{status, displayName}`，回归钉防泄漏）。**立项澄清**：R3 的「无读取出口」指外部面（renderer / Host / 事件 / 日志 / 导出）；main 内部访问器是最小必要消费面（未来 Policy / 编排 + 本票可验证性），handle 非 secret。
3. **adapter 接线**（`src/main/oidc-adapter.ts` + `src/main/oidc-runtime.ts` + `src/main/index.ts`）：`OidcAdapterDeps` 增必填注入 `resolveIdentity`；`verifyIdToken` 全链通过后 guard `iss`/`sub` 均为 string（内核只强制 `iss`；缺 `sub` 无法做身份映射）→ 缺失即 `token-verification-failed`（fail closed，不新增错误码）→ resolve → `signIn` 带 handle。login 成功 ⇒ handle 必然存在（同链内存操作）。main 组装单例 registry；runtime options 透传。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 持久化 handle 使其跨重启稳定 | 否决（R2）；持久化真实身份违反「retention / legal hold 未确认禁止持久化」红线；跨重启稳定性属 WT-02B.3。 |
| 本票一并迁移 2B.1 内核 `IdentityAssertion.subjectId` / `organizationId` → handle / candidate 语义 | 否决（R1）；org 语义与 Policy-exclusive membership 耦合，拆断会两次返工——并入 organization mapping 票。 |
| handle 进 state / auth 快照供未来 UI 消费 | 否决（R3）；当前无消费方，扩大暴露面无收益。 |
| raw `(issuer, subject)` deterministic hash 作 handle | 否决（治理红线）；删除 mapping 后仍可重算并重新关联。 |
| candidate org refs 本票即从 claims 提取 | 否决；需新 scope / claim 映射且无消费方（只是查找提示），随 organization mapping 票设计。 |

## Consequences

- **真实读数（2026-10-02）**：sage-shell `node scripts/test.mjs run` **55 files / 541 tests 全 PASS**（新增 registry 5、vault 扩展 2、adapter 2）；`npm run typecheck` 0 error；`npx tsc` 构建通过；`npm run smoke` PASS；仓根 `node scripts/gate.mjs` **25/25 通过**。
- **变异验证三组**（改源→红→还原后 diff 为空）：registry 复用删除 → 2 红；`snapshot()` 泄漏 handle → 3 红（含 2B.2B 快照回归钉）；adapter 缺 `sub` guard 删除 → 缺 sub 用例红。
- **链路面变化**：登录成功现在同时产出 identity handle（main 内存），renderer / state 零变化；logout 与超驰路径 handle 同步清除；同一进程内同一 `(issuer, subject)` 重复登录复用同一 handle。
- **边界**：kernel 接口迁移与 Policy-exclusive membership、candidate org claims、scoped `subjectRef`、refresh / revocation、任何持久化均不在本票；handle 不计入任何持久化或产品完成证据。
- **遗留登记**：无新增 deferred；organization mapping 票是下一依赖。
