# WT-02B.2D · organization mapping 内核契约迁移（实施计划）

日期：2026-10-02 · 关联 spec：[2026-10-02-wt02b2d-organization-mapping-design.md](../specs/2026-10-02-wt02b2d-organization-mapping-design.md) · 上游：[2A 治理](../../notes/proposed/architecture/2026-09-28-real-identity-and-authority-data-governance.md) / [ADR-0163](../../adr/ADR-0163.md) / [ADR-0185](../../adr/ADR-0185.md)

## 任务分解（串行，红→绿→变异）

**T1 · 契约迁移（`identity-policy.ts`）**
- 请求/断言/assignment/provider request/snapshot 五处按 spec §3 迁移；`authorize()` 的组织检查改诚实性语义；denial reason 文案更新；错误码集合不变。
- 变异：handle 绑定删除 → 红；组织诚实性检查删除 → 红。

**T2 · 测试迁移（`identity-policy.spec.ts`）**
- fixture（REQUEST/IDENTITY/POLICY）与全部断言按新形态改写；`policyRequests` 断言新键。
- 新用例：policy 答非所问 → mismatch；handle 无 assignment → subject-denied；请求缺/空/未 trim requestedOrganizationRef → invalid-request。
- accessor/Proxy 用例键切到 `identityHandle` / `requestedOrganizationRef`。
- 变异：snapshot 回填旧 subject 语义 → 红。

**T3 · 全量回归与留痕**
- `npm run typecheck && npm test && npx tsc && npm run smoke`；仓根 `pnpm run gate`。
- Note（`docs/notes/implemented/security/2026-10-02-wt02b2d-organization-mapping.md`）+ ADR-0186 + `node scripts/gates/adr-agent-records.mjs --write`；spec/plan 入库。
- 提交：feat + docs 两批（推送需用户授权，按既有节奏）。

## 验证命令（收口）

```bash
cd apps/sage-shell && npm run typecheck && npm test && npx tsc && npm run smoke
cd /Users/lute/project/Sage && pnpm run gate
```

## 边界（不做）

真实 Organization Policy Provider、candidate org claims、subjectRef、refresh / revocation、持久化、state / renderer / Host 面、命令管道接线。
