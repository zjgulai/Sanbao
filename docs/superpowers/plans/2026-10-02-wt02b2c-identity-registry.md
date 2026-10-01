# WT-02B.2C · identity registry / identity handle（实施计划）

日期：2026-10-02 · 关联 spec：[2026-10-02-wt02b2c-identity-registry-design.md](../specs/2026-10-02-wt02b2c-identity-registry-design.md) · 上游：[2A 治理](../../notes/proposed/architecture/2026-09-28-real-identity-and-authority-data-governance.md) / [ADR-0163](../../adr/ADR-0163.md) / [ADR-0164](../../adr/ADR-0164.md) / [ADR-0183](../../adr/ADR-0183.md)

## 任务分解（串行，每任务红→绿→变异）

**T1 · registry 内核（`src/main/identity-registry.ts` + `test/identity-registry.spec.ts`）**
- `createIdentityRegistry({ randomHandle })`：复合键（NUL 分隔）进程内映射；命中复用、未命中以注入器铸新 handle；条目含空 `candidateOrgRefs`。
- 测试：注入顺序器证明 handle 来源（非 subject 派生）；复用 / 跨 issuer 不碰撞 / 唯一性；形状冻结。
- 变异：复用失效（恒铸新）→ 红；键不含 issuer → 红。

**T2 · vault 扩展（`token-vault.ts` + `token-vault.spec.ts`）**
- `VaultSession.identityHandle`；`identityHandle(): string | null` main 内部访问器；`snapshot()` 不变。
- 测试：存取清三态；snapshot 无 handle 字段（回归钉）。
- 变异：snapshot 加 handle 字段 → 红；signOut 不清 → 红。

**T3 · adapter 接线（`oidc-adapter.ts` + `oidc-runtime.ts` + `index.ts` + specs）**
- deps 增必填 `resolveIdentity`；verify 后 `iss`/`sub` string guard（缺失 → `token-verification-failed`）→ resolve → `signIn` 带 handle；runtime options 透传；main 组装 registry（`randomBytes(32)`）。
- 测试：capture 断言已验证 `(issuer, subject)` 传入 resolver；handle 落入 vault；缺 sub 拒绝且 vault signed-out；既有矩阵全绿。
- 变异：adapter 不传 handle → 红；guard 删除 → 缺 sub 用例红。

**T4 · 收口回归与留痕**
- 全量：`npm run test`、`npm run typecheck`、`npx tsc`、`npm run smoke`、`pnpm run gate`。
- Note（`docs/notes/implemented/security/2026-10-02-wt02b2c-identity-registry.md`）+ ADR-0185 + `node scripts/gates/adr-agent-records.mjs --write`；本 plan 与 spec 入库。
- 提交：feat + docs 两批；推送需用户授权。

## 验证命令（收口）

```bash
cd apps/sage-shell && npm run typecheck && npm test && npx tsc && npm run smoke
cd /Users/lute/project/Sage && pnpm run gate
```

## 边界（不做）

内核接口迁移与 Policy-exclusive membership（organization mapping 票）、candidate org claims、subjectRef、refresh / revocation、持久化、state / renderer / Host 面变化。
