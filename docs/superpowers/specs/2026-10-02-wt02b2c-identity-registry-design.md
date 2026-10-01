# WT-02B.2C · identity registry / identity handle（runtime-only，设计）

日期：2026-10-02 · 状态：设计已获用户确认（R1/R2/R3） · 上游：[真实身份与 Authority 数据治理](../../notes/proposed/architecture/2026-09-28-real-identity-and-authority-data-governance.md)（2A，identity registry / subjectRef 分层）、[ADR-0163](../../adr/ADR-0163.md)、[ADR-0164](../../adr/ADR-0164.md)、[ADR-0183](../../adr/ADR-0183.md)（登录链）

## 1. 目标与切片

2A 治理链固定：Identity Provider 只证明 `(issuer, subject)` → **Sage-owned identity registry 产生内部 identity handle + candidate org refs（不证明 membership）**；scoped `subjectRef` 必须等 Organization Policy 证明 scope 后由 identity vault 生成（属 organization mapping 票）。当前缺口：登录链止于「已验证 id_token → 纯内存 token vault」，**identity handle 尚不存在**。

本切片（最小切片）：**identity registry 内核 + 登录接线**，runtime-only。

## 2. 裁决（用户确认）与立项澄清

- **R1 最小切片**：只做 registry 内核与登录接线；2B.1 内核 `IdentityAssertion.subjectId` / `organizationId` → handle / candidate 语义的迁移**留 organization mapping 票**（与 Policy-exclusive membership 一并做，不拆断 org 语义）。
- **R2 runtime-only**：registry 纯内存，进程内映射；同一 `(issuer, subject)` 重复登录复用同一 handle；重启重新登录生成新 handle（跨重启稳定性属 2B.3 persistence，被 retention / legal hold 红线阻塞）。
- **R3 仅 main 内部**：handle 不进 state / renderer（renderer 继续只见 displayName）。**立项澄清**：R3 的「无读取出口」指**外部面（renderer / Host / 事件 / 日志 / 导出）**——main 内部需要最小访问器 `vault.identityHandle()` 供未来 Policy / 编排消费与测试验证；它不是对外出口，且 handle 不是 secret（是 Sage 内部 opaque ref）。
- 红线保持：禁止对 raw `(issuer, subject)` 做无密钥 deterministic hash；`(issuer, subject)` 仅驻 main 内存、不落盘、不进日志。

## 3. 合同

### 3.1 identity registry 内核（`src/main/identity-registry.ts`，新增）

```ts
export interface IdentityRegistryEntry {
  readonly identityHandle: string
  /** Lookup hints only — never membership / role / grant authority（2A 治理）。本票恒空。 */
  readonly candidateOrgRefs: readonly string[]
}
export interface IdentityRegistry {
  resolve(input: { readonly issuer: string; readonly subject: string }): IdentityRegistryEntry
}
export function createIdentityRegistry(options: { readonly randomHandle: () => string }): IdentityRegistry
```

- 复合键 `issuer + '\u0000' + subject`（NUL 分隔，消歧拼接碰撞）；**随机性注入**（`randomHandle`），生产接线 `randomBytes(32).toString('base64url')`（43 字符高熵）。
- 零持久化、零日志、零网络；`candidateOrgRefs` 字段随条目形状预留（org claim 提取属 organization mapping 票）。

### 3.2 token vault 扩展（`src/main/token-vault.ts`）

- `VaultSession` 增 `readonly identityHandle: string`；`signIn` 随 session 存入。
- 新增 main 内部访问器 `identityHandle(): string | null`（signOut / 失败路径即清）。
- `snapshot()` **保持不变**（只吐 `{status, displayName}`，不泄 handle）——2B.2B 合同不破。

### 3.3 adapter 接线（`src/main/oidc-adapter.ts`）

- `OidcAdapterDeps` 增**必填** `resolveIdentity: (input: { issuer: string; subject: string }) => { identityHandle: string }`（注入式，adapter 零 registry import）。
- `verifyIdToken` 全链通过后：guard `typeof claims.sub === 'string'`（内核只强制 `iss`；缺 `sub` 的 token 不可做身份映射）与 `typeof claims.iss === 'string'`，任一缺失 → `token-verification-failed`（fail closed，不新增错误码）；随后 `resolveIdentity({ issuer, subject })` 并把 handle 带进 `vault.signIn`。
- login 成功 ⇒ handle 必然存在（resolve 为纯内存操作，随 signIn 同链完成）。

### 3.4 生产接线（`src/main/oidc-runtime.ts` + `src/main/index.ts`）

- `ProductionAdapterOptions` 增 `resolveIdentity` 透传到 deps；main 组装：`createIdentityRegistry({ randomHandle: () => randomBytes(32).toString('base64url') })` → `createProductionAdapter(vault, { openExternal, resolveIdentity })`。

## 4. 文件结构

```
apps/sage-shell/src/main/identity-registry.ts   # 新增：registry 内核（注入随机性）
apps/sage-shell/src/main/token-vault.ts         # 扩展：session.identityHandle + main 内部访问器
apps/sage-shell/src/main/oidc-adapter.ts        # 扩展：resolveIdentity 注入 + iss/sub guard
apps/sage-shell/src/main/oidc-runtime.ts        # 扩展：options 透传
apps/sage-shell/src/main/index.ts               # 接线：registry 组装
apps/sage-shell/test/identity-registry.spec.ts  # 新增
apps/sage-shell/test/token-vault.spec.ts        # 扩展
apps/sage-shell/test/oidc-adapter.spec.ts       # 扩展（makeDeps + 新用例）
apps/sage-shell/test/oidc-runtime.spec.ts       # 随必填注入更新
```

## 5. 测试与验收

1. **registry**：handle 来自注入器（顺序注入器 → 逐条对应，非 subject 派生）；同 `(issuer, subject)` 复用；同 subject 不同 issuer 不碰撞；不同 subject 唯一；`candidateOrgRefs` 恒空数组；无持久化调用（结构面）。
2. **vault**：`identityHandle()` 初始 null → signIn 后可读 → signOut 清空；**`snapshot()` 不泄 handle**（回归钉）；既有 2B.2B 断言不破。
3. **adapter**：登录链把**已验证**的 `(issuer, subject)` 传给 resolver（capture 断言）并把 handle 写入 vault；token 缺 `sub` → `token-verification-failed` 且 vault 保持 signed-out；超驰（logout 竞态）路径 handle 不残留。
4. 全量：`npm run test`、`npm run typecheck`、`npx tsc`、`npm run smoke`、`pnpm run gate` 全绿；变异验证 ≥3 组（复用破坏 / snapshot 泄 handle / adapter 不传 handle）。
5. 留痕：Note + ADR-0185 + `decisions.json` 再生。

## 6. 不做（边界）

- 2B.1 内核 `IdentityAssertion` / `AuthoritySnapshot` 接口迁移与 Policy-exclusive membership（organization mapping 票）；candidate org claims 提取（需新 scope / claim 映射，随 org 票）。
- scoped `subjectRef` 生成（必须等 Policy 证明 scope）；refresh rotation / revocation（session 生命周期独立后续）；任何持久化（retention 门）。
- state / renderer / Host 面零变化。
