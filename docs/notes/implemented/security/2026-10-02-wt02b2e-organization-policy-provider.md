# WT-02B.2E · 真实 Organization Policy Provider（本地 policy 文件）+ identity 会话端口 + Authority Runtime 组装

日期：2026-10-02 · 分类：security · 关联 ADR：[ADR-0188](../../../adr/ADR-0188.md)

## Problem

WT-02B.2D 之后内核已迁移（handle 索引 + 请求方组织线索 + provider 诚实性检查），但生产链路仍缺三件：① 没有任何真实 Organization Policy 源——生产 `resolveIdentityPolicy` 恒 fail-closed；② 没有真实 identity 端口——vault 只有 `identityHandle`，缺会话引用 / issuer 出处 / 时效（内核 assertion 需要）；③ 没有 resolver 生产组装点（`createIdentityPolicyResolver` 只在测试中组装过）。两约束限定形态空间：retention matrix 未批准前禁止持久化真实身份或身份映射；identity handle 跨进程易失，持久化 handle-keyed 成员表无意义。

## Decision

用户四裁决（2026-10-02 逐题确认）：**policy 源 = 本地 JSON 文件**；**membership = instance-operator 单成员**；**范围 = provider + identity 端口 + 组装**；**供给 = 手动配置 + 文档样例**。落地：

1. **本地 policy provider**（`src/main/organization-policy.ts`）：`$SAGE_ROOT/organization-policy.json` 为实例级权威；每次 resolve 重读（文件即真相，改策略免重启）；严格 exact-shape 校验、`urn:sage:organization-policy:sha256:*` 由**排序后 canonical 语义内容**计算（version 作者维护、digest 不可伪造）；信号二分——读失败 throw（→ `policy-provider-unavailable`）/ 坏内容 null（→ `policy-snapshot-invalid`）。
2. **instance-operator 语义（精确如实）**：文件声明「本实例的操作者持有这些岗位」；resolve 时把请求方 handle 绑到声明的 roleRefs。v1 无法区分多成员——任何通过已配置 IdP 验证的登录在本实例均被视作操作者；逐主体区分需持久化身份映射（retention 门禁止）+ 跨进程稳定引用（handle 易失），留未来形态。文件零身份材料。
3. **会话契约扩展**：`VaultSession` 增 `issuer / authenticatedAt / expiresAt`（均非秘密；authenticatedAt=本地接受时刻避开 IdP 时钟偏差；expiresAt=verified id_token exp，会话授权窗 ≤ token 寿命）；`createTokenVault({ mintSessionRef })` 必填注入、signIn 被接受时铸一次；`identitySession()` **取代** 2C 的 `identityHandle()`（main 内部访问器，snapshot 零泄漏不变）；adapter signIn 携带三新字段（`deps.now()` 是秒，×1000）。
4. **Authority Runtime 组装**（`src/main/authority-runtime.ts`）：固定 audience `sage-desktop`；identity 端口从 vault 活动会话构造 assertion（issuer VersionedIdentity v1+digest；**sessionId 取活动会话 ref 不回声调用方线索**——旧 ref 内核如实 `identity-session-mismatch`）；policy 转发本地 provider。失败码全走既有内核集合，零新增。
5. **不接 dispatch**：intent→请求组装与 step-2 端口接线属 WT-02D.2；本票端到端证据在集成测试层（真 vault + 真文件 + 真内核）。

### 操作者说明（供给 = 手动配置）

- **文件在哪**：`$SAGE_ROOT/organization-policy.json`（默认 `~/Library/Application Support/Sage/organization-policy.json`；`SAGE_ROOT` override 时随其 root）。与 `cordis.local.patch.yml` 同级，不进 generation。
- **怎么填**（完整样例；未知键会被拒绝）：

```json
{
  "schemaVersion": "sage.organization-policy.v1",
  "organizationId": "organization:sage",
  "policy": { "identity": "policy:local", "version": "1" },
  "validFrom": "2026-10-01T00:00:00Z",
  "expiresAt": "2027-10-01T00:00:00Z",
  "membership": { "mode": "instance-operator", "roleRefs": ["role:owner"] },
  "grants": [
    { "roleRef": "role:owner", "operation": "business-matter.start-attempt",
      "actionScope": "catalog.prepare-draft", "effectClass": "local-write", "requiresDecision": false }
  ]
}
```

- **怎么验证**：`cd apps/sage-shell && node scripts/test.mjs run test/authority-runtime.spec.ts`（真实链路自动化证据：登录→resolve 全链与失败矩阵）。运行时验证须等 D.2 接线——当前 dispatch 不消费 resolver，产品面尚无触发点（如实）。
- **未供给时产品行为**：fail closed（`policy-provider-unavailable`），无自动生成、无默认放行。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 内置内存默认 policy（代码常量） | 否决；改授权须改代码、无版本化 artifact、无管理员面。 |
| 按主体逐一指派的多成员表 | 否决；需持久化身份材料（retention 门禁止），handle 跨进程易失绑不定。 |
| 先跳过本票做 ③ candidate org claims | 否决；D 线授权底座继续阻塞。 |
| 首启自动生成默认 owner policy | 否决；authority 凭空产生，产品语义须单独裁决。 |
| providers 直接接 dispatch（retry 语义凑一个映射） | 否决；retry 的 availability-only 语义未定义，不猜（D.2 范围）。 |

## Consequences

- **真实读数（2026-10-02）**：`npm run typecheck` 0 error；全量 **58 files / 568 tests 全 PASS**（本票新增 organization-policy 8 + authority-runtime 8，token-vault 8→9、adapter 14 含新落库断言）；`npx tsc` 构建通过；`npm run smoke` PASS；仓根 `pnpm run gate` **25/25**。
- **变异验证四组**（改源→红→还原后复核）：M1 绑定换常量 handle → 集成 3 红 + 单元 2 红；M2 canonical 去排序 → 顺序不敏感用例红；M3 identity 端口回声调用方 sessionId → 旧 ref 用例红；M4 读失败改返回 null（absent/invalid 混淆）→ 缺文件用例 1+1 红；四组还原后 8/8 + 8/8。
- **golden 沉淀**：样例文件 policy digest `urn:sage:organization-policy:sha256:7d8a2ee1…393dd` 与 issuer digest `urn:sage:issuer-identity:sha256:482be97e…f81d` 手写对拍（实现前实算，两 spec 一致命中）。
- **边界**：内核（`identity-policy.ts`）、domain、store、v1 schema 零改动；不读 `.credentials.yaml`；零持久化 / 零日志 / 零网络；`main/index.ts` 仅 vault 构造一行。
- **对小既有表面的影响**：`vault.identityHandle()`（2C 交付）合并进 `identitySession()`；受影响的构造 / 访问器调用点分布于 6 个文件（`main/index.ts`、token-vault.spec、oidc-adapter.spec、appservice-route-fixture.spec、oidc-runtime.spec、窗口 probe `.mjs`）同批更新；tsconfig 不含 test，调用点靠清单核对（终态 grep 复查零残留）。
- **遗留登记**：① intent→请求组装 + step-2 端口接线（WT-02D.2）；② candidate org claims（队列 ③）；③ refresh rotation / revocation（当前会话授权窗 ≤ id_token 寿命，过期即拒→重新登录）；④ 多成员 membership（需 retention 批准 + 管理面）；⑤ 供给自动化 / 首启脚手架；⑥ `AuthorityEvidence` 转换与持久化（WT-02B.3）。

## Verification

本票完成的可验证结果为：spec（`docs/superpowers/specs/2026-10-02-wt02b2e-organization-policy-provider-design.md`）与 plan（`docs/superpowers/plans/2026-10-02-wt02b2e-organization-policy-provider.md`）入库、Note + ADR-0188 + 机器账本可再生成、链接与 Sage quick gate 通过，且精确差异证明内核 / domain / store / v1 schema / product / Host 零改动。任何「产品面已接真实授权」的声明都必须由 WT-02D.2 的接线证据另行给出。
