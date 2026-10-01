# WT-02B.2D · organization mapping（内核契约迁移，设计）

日期：2026-10-02 · 状态：设计已获用户确认（R1/R2/R3） · 上游：[真实身份与 Authority 数据治理](../../notes/proposed/architecture/2026-09-28-real-identity-and-authority-data-governance.md)（2A）、[Identity / Policy Resolver 架构记录](../../notes/proposed/architecture/2026-09-28-identity-policy-resolver.md)、[ADR-0163](../../adr/ADR-0163.md)、[ADR-0185](../../adr/ADR-0185.md)（identity handle）

## 1. 目标与切片

2A 治理要求：Sage-owned mapping 只产生 identity handle 与候选组织引用（不证明 membership）；**只有 Organization Policy Provider 能证明 active membership / role / grant**；raw subject 不得继续作为内核权威索引。当前 2B.1 内核仍为 test-only 过渡形态：`IdentityAssertion` 携带权威 `subjectId` + `organizationId`，内核强制 assertion 组织与 policy 组织相等。本切片完成**内核契约迁移**，让 fixture 与未来真实 provider 共用同一形态（无需二次迁移）。

## 2. 裁决（用户确认）

- **R1 纯内核迁移**：provider 保持 fixture / test-only；真实 Organization Policy Provider 形态（本地 policy 源 / 供应与授权模型）须产品侧设计，另票裁决。
- **R2 请求方线索**：组织以 `ActionAuthorizationRequest.requestedOrganizationRef` 传入（**非权威查找线索**；未来由 Application Service 从用户组织上下文注入）；provider 必须为所请求组织作答——答非所问即 `policy-organization-mismatch`（fail closed）。
- **R3 handle 迁移本次完成**：`subjectId` 从 `IdentityAssertion` / `OrganizationRoleAssignment` / `AuthoritySnapshot` 全面退出；B.2C 的 `identityHandle` 成为内核身份索引。

## 3. 契约迁移面（`src/security/identity-policy.ts`）

| 契约 | 迁移 |
| --- | --- |
| `ActionAuthorizationRequest` | 增 `requestedOrganizationRef`（exact string；缺省/空/未 trim → `invalid-request`） |
| `IdentityAssertion` | `subjectId`、`organizationId` 退场 → `identityHandle`（exact string） |
| `OrganizationRoleAssignment` | `subjectId` → `identityHandle`（membership 判定 = 快照中该 handle 的 assignment，`policy-subject-denied` 语义不变） |
| `PolicyProviderRequest` | `{organizationId, subjectId}` → `{requestedOrganizationRef, identityHandle}`（其余不变） |
| `AuthoritySnapshot` | `subjectId` → `identityHandle`；`organizationId` = **policy 已证明**的组织（因诚实性检查等于 requested ref） |
| `authorize()` | 相等检查改为 `policy.organizationId !== request.requestedOrganizationRef` → `policy-organization-mismatch`（语义：provider 答非所问）；assignment 过滤按 handle |
| 错误码 | 集合不变（无新增/删除）；`policy-organization-mismatch` 的 reason 文案改为「不为所请求组织作答」 |

`IdentityProviderRequest`（sessionId/audience/evaluatedAt）不变——未来真实 identity provider 由 main 的 active session 映射到 `vault.identityHandle()`。

## 4. 文件结构

```
apps/sage-shell/src/security/identity-policy.ts   # 迁移（唯一源码文件）
apps/sage-shell/test/identity-policy.spec.ts       # fixture/断言迁移 + 新用例
```

## 5. 测试与验收

1. **正例**：请求线索 + policy 为其作答 + handle 有 assignment → authorized；`policyRequests` 精确断言 `{requestedOrganizationRef, identityHandle, ...}`；`AuthoritySnapshot.identityHandle` 为 handle。
2. **新负例**：policy 答非所问（org ≠ requested）→ `policy-organization-mismatch`；handle 无 assignment → `policy-subject-denied`；请求缺 `requestedOrganizationRef`／空串／未 trim → `invalid-request`。
3. **迁移回归**：全部既有矩阵（audience/session/有效期/五 effect class/provenance/重复冲突/hostile 输入/accessor/Proxy/失败脱敏）逐项绿；accessor 用例的键从 `subjectId`/`organizationId` 切到新键（`identityHandle`/`requestedOrganizationRef`），证明新键同样拒绝 getter 执行。
4. 全量：`npm run test`、`npm run typecheck`、`npx tsc`、`npm run smoke`、`pnpm run gate` 全绿；变异 ≥3 组（handle 绑定删除 / 组织诚实性检查删除 / snapshot 回填 subject）。
5. 留痕：Note + ADR-0186 + `decisions.json` 再生。

## 6. 不做（边界）

真实 Organization Policy Provider 的形态与实现、candidate org claims 提取（`candidateOrganizationRefs` 仍恒空）、scoped `subjectRef`、refresh / revocation、任何持久化、state / renderer / Host 面变化、命令管道端口接线（`resolveIdentityPolicy` 生产仍 fail closed）。
