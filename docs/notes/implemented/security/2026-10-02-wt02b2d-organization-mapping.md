# WT-02B.2D · organization mapping 内核契约迁移（handle + 请求方组织线索）

日期：2026-10-02 · 分类：security · 关联 ADR：[ADR-0186](../../../adr/ADR-0186.md)

## Problem

2A 治理要求：raw subject 不得继续作为内核权威索引；组织只能由 Organization Policy Provider 独占证明，用户选择与 candidate 只是查找线索。WT-02B.1 内核（[ADR-0163](../../../adr/ADR-0163.md) 时期）仍为 test-only 过渡形态：`IdentityAssertion` 携带权威 `subjectId` + `organizationId`，内核强制 assertion 组织与 policy 组织相等（`policy-organization-mismatch` 为「断言不符」语义）；`OrganizationRoleAssignment` / `AuthoritySnapshot` 均以 raw subject 索引。WT-02B.2B 交付时该迁移被显式登记为欠账（治理文档 2B 后半），须在真实 provider 前关闭。

## Decision

用户三裁决 R1（纯内核迁移）/ R2（请求方线索）/ R3（handle 迁移本次完成），落地为五面契约迁移（错误码集合不变）：

1. **`ActionAuthorizationRequest` 增 `requestedOrganizationRef`**：非权威查找线索（exact string；缺省/空/未 trim → `invalid-request`）；未来由 Application Service 从用户组织上下文注入。
2. **`IdentityAssertion`**：`subjectId`、`organizationId` 退场 → `identityHandle`（WT-02B.2C 的 Sage 内部引用成为内核身份索引；raw subject 离开内核面）。
3. **`OrganizationRoleAssignment`**：`subjectId` → `identityHandle`；membership 判定 = 快照中该 handle 的 assignment（`policy-subject-denied` 语义不变）。
4. **`PolicyProviderRequest`**：`{organizationId, subjectId}` → `{requestedOrganizationRef, identityHandle}`；`AuthoritySnapshot`：`subjectId` → `identityHandle`，`organizationId` = policy 已证明的组织。
5. **`authorize()` 的组织检查改诚实性语义**：`policy.organizationId !== request.requestedOrganizationRef` → `policy-organization-mismatch`（provider 答非所问即 fail closed）；reason 文案同步更新。错误码集合无新增/删除——fixture 与未来真实 provider 共用同一形态，无需二次迁移。

`IdentityProviderRequest`（sessionId/audience/evaluatedAt）不变：未来真实 identity provider 由 main 的 active session 映射到 `vault.identityHandle()`（WT-02B.2C）。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 本票一并设计真实 Organization Policy Provider（本地 policy 源） | 否决（R1）；组织资源的创建 / 存储 / 授权形态是全新产品面且可能触及 retention 门，须产品侧裁决另票。 |
| 靠 assertion `candidateOrganizationRefs` 迭代解析组织 | 否决（R2）；candidates 现为空（B.2C 预留未填）会全拒，且多组织无法消歧；候选集保留给未来组织选择 UX。 |
| 保留 `subjectId` 双轨过渡 | 否决（R3）；两份身份索引会二次返工，治理要求一次迁移。 |
| 组织线索不设诚实性检查（信任 provider 自选组织） | 否决；调用方线索与 provider 作答不一致时必须 fail closed，否则 provider 可越权改换组织语境。 |

## Consequences

- **真实读数（2026-10-02）**：sage-shell `node scripts/test.mjs run` **55 files / 542 tests 全 PASS**（identity-policy 14：原 12 项全矩阵迁移 + 新增「请求方线索/答非所问」与「组织线索 exact 校验」2 项）；`npm run typecheck` 0 error；`npx tsc` 构建通过；`npm run smoke` PASS；仓根 `node scripts/gate.mjs` **25/25 通过**。
- **变异验证三组**（改源→红→还原后 diff 为空）：assignment handle 绑定删除 → 1 红；组织诚实性检查删除 → 2 红（含新用例）；`AuthoritySnapshot` 回填旧 subject 值 → 2 红。
- **行为面**：内核拒绝调用方自报 `subjectId`/`organizationId`/`identityHandle`（unknown key → `invalid-request`）；accessor/Proxy 负例键切换到新键（`identityHandle`/`requestedOrganizationRef`），新键同样零 getter 执行。
- **边界**：真实 Organization Policy Provider 形态与实现、candidate org claims 提取（`candidateOrganizationRefs` 仍恒空）、scoped `subjectRef`、refresh / revocation、任何持久化、state / renderer / Host 面、命令管道端口接线（`resolveIdentityPolicy` 生产仍 fail closed）均不在本票。
- **遗留登记**：真实 Policy Provider（本地 policy 源的产品形态）是下一依赖；snapshot 内 `organizationId` 现为「provider 为其作答的组织」。
