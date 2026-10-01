# WT-02B.2E · 真实 Organization Policy Provider + identity 会话端口 + Authority Runtime 组装（实施计划）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付本地 policy 文件 provider + vault 会话语境扩展 + 生产 Authority Runtime 组装，让 Identity / Policy resolver 从纯内核变为可真实 resolve（端到端证据在集成测试层）。

**Architecture:** 三个新增/扩展单元经既有内核组装：`organization-policy.ts`（纯内核 provider，注入读取、每次 resolve 重读文件、signal 二分）→ `authority-runtime.ts`（identity 会话端口从 vault 构造 assertion + provider 转发 + `createIdentityPolicyResolver` 组装）→ 内核（零改动）。vault 扩展会话语境五字段（均非秘密），adapter 在 signIn 时携带。

**Tech Stack:** TypeScript（strict、exactOptionalPropertyTypes、零运行时依赖 `deps: {}`）；vitest via `node scripts/test.mjs run`（apps/sage-shell 下）。

**Spec:** [docs/superpowers/specs/2026-10-02-wt02b2e-organization-policy-provider-design.md](../specs/2026-10-02-wt02b2e-organization-policy-provider-design.md)（executor 必须同时读 spec——schema 表、digest canonical 规范、失败码矩阵、边界都在那里）。

## Global Constraints

- 零运行时依赖（`deps: {}` 不破）；provider / runtime 零 fs import（I/O 全经注入端口）；同步端口（内核端口是同步的：throw → unavailable / 返回非解析值 → invalid）。
- 零持久化 / 零日志 / 零网络 / 不读 `.credentials.yaml`；不修改内核（`src/security/identity-policy.ts` 零改动）、domain、store、v1 event schema。
- 不接 dispatch / command pipeline（intent→请求组装属 D.2）；`main/index.ts` 只改 vault 构造。
- 提交节奏：仓内既有节奏 = 票末 feat + docs 两批推送（用户已确认），**无逐任务提交**。
- 测试只经 `node scripts/test.mjs run [spec]` 运行（cwd=apps/sage-shell）；tsconfig 只含 `src/**`，**测试文件不被 typecheck**——调用点更新靠纪律不靠编译器（T1 步骤 6 的清单必须全改）。

---

### Task 1 · 会话契约扩展（vault + adapter + 全部调用点，原子契约变更）

**Files:**
- Modify: `apps/sage-shell/src/main/token-vault.ts`
- Modify: `apps/sage-shell/src/main/oidc-adapter.ts:145`
- Modify: `apps/sage-shell/src/main/index.ts:81`
- Modify: `apps/sage-shell/test/token-vault.spec.ts`（全文重写 harness）
- Modify: `apps/sage-shell/test/oidc-adapter.spec.ts`（L92/L206/L225/L236/L252 构造器、L130/L143/L246 访问器、L254 payload）
- Modify: `apps/sage-shell/test/appservice-route-fixture.spec.ts:17`（构造器）

**Interfaces（T3 消费）:**
- `createTokenVault(options: { readonly mintSessionRef: () => string }): TokenVault`
- `VaultIdentitySession = { sessionRef, identityHandle, issuer, authenticatedAt, expiresAt }`（全 string）；`TokenVault.identitySession(): VaultIdentitySession | null`（**取代** `identityHandle()`）
- `VaultSession` 增必填 `issuer: string`、`authenticatedAt: string`、`expiresAt: string`

**关键事实（已实测）:**
- adapter `deps.now()` 是**秒**（production `oidc-runtime.ts:98` = `Math.floor(Date.now() / 1000)`）→ `authenticatedAt = new Date(deps.now() * 1000).toISOString()`；`expiresAt = new Date(claims.exp * 1000).toISOString()`（`claims.exp` 已被 `verifyIdToken` 保证为有限 number）。
- adapter fixture：`NOW = 1_800_000_000`、`exp = NOW + 3600` → `authenticatedAt === '2027-01-15T08:00:00.000Z'`、`expiresAt === '2027-01-15T09:00:00.000Z'`。
- `sessionRef`：随机、非 bearer、非秘密；**signIn 被接受时**经 `mintSessionRef` 铸一次（新 signIn → 新 ref；`beginPending`/被拒 signIn 不铸）。
- `authenticatedAt` = 本地接受时刻（不用 token `iat`——避开 IdP 时钟偏差造成假 `identity-not-active`）。

- [ ] **Step 1: 更新 token-vault.spec.ts（红）** — harness `function makeVault() { let n = 0; return createTokenVault({ mintSessionRef: () => \`session-ref-${++n}\` }) }`；8 个既有用例改用它；改 `identityHandle()` 用例为 `identitySession()`（signed-out null / signIn 后五字段逐项 / signOut null）；新增：重新 signIn（signOut 后再登录）→ 新 `sessionRef`；被拒 signIn（非 pending）不耗 ref（计数器不变）；`snapshot()` 键集 `['displayName','status']` 不变。
- [ ] **Step 2: 跑 → 红** — `node scripts/test.mjs run test/token-vault.spec.ts`（模块无 `identitySession`/构造器签名不匹配 → 失败）。
- [ ] **Step 3: 更新 oidc-adapter.spec.ts（红）** — `driveLogin` 与五个内联 `createTokenVault()` 补 `mintSessionRef`（如 `() => 'session-ref-1'`）；L130 `vault.identityHandle()` → `vault.identitySession()?.identityHandle`；L143/L246 → `expect(vault.identitySession()).toBeNull()`；happy-path 用例新增落库断言：`issuer === OIDC_ISSUER`、`authenticatedAt === '2027-01-15T08:00:00.000Z'`、`expiresAt === '2027-01-15T09:00:00.000Z'`；L254 的 `signIn` payload 补全五字段（`identityHandle: 'h-1', issuer: OIDC_ISSUER, authenticatedAt: '2027-01-15T08:00:00.000Z', expiresAt: '2027-01-15T09:00:00.000Z'`）。
- [ ] **Step 4: 跑 → 红** — `node scripts/test.mjs run test/oidc-adapter.spec.ts`。
- [ ] **Step 5: 实现 token-vault.ts + oidc-adapter.ts** — vault：`VaultSession` 三新字段、`VaultIdentitySession`、构造器 `mintSessionRef`、`signIn` 接受分支内 `session = { ...next, sessionRef: options.mintSessionRef() }`（内部持有）、`identitySession()` 返回五字段或 null、删除 `identityHandle()`；adapter L145 signIn 调用补 `issuer: claims.iss, authenticatedAt: ..., expiresAt: ...`。
- [ ] **Step 6: 全调用点清单核对** — `grep -rn "createTokenVault(" src test` 与 `grep -rn "identityHandle()" src test` 输出为空或全部已改；`src/main/index.ts` 改 `createTokenVault({ mintSessionRef: () => randomBytes(32).toString('base64url') })`（`randomBytes` 已在该文件导入）；`appservice-route-fixture.spec.ts` 构造器补选项。
- [ ] **Step 7: 绿 + typecheck** — 三 spec 连跑通过；`npm run typecheck` 0 error；`npm test` 全量绿。

### Task 2 · organization-policy provider 内核

**Files:**
- Create: `apps/sage-shell/src/main/organization-policy.ts`
- Create: `apps/sage-shell/test/organization-policy.spec.ts`

**Interfaces（T3 消费）:**
- `ORGANIZATION_POLICY_SCHEMA = 'sage.organization-policy.v1'`
- `createLocalOrganizationPolicyProvider(input: { policyPath: string; readFileBytes: (absolutePath: string) => Buffer }): { resolve: (request: PolicyProviderRequest) => unknown }`（`PolicyProviderRequest` 从 `../security/identity-policy.js` **type-only** import）
- 信号：读失败（含 ENOENT）→ **throw**；超限（`MAX_POLICY_BYTES = 256 * 1024`）/ JSON 坏 / schema 违规 → **`null`**；合法 → snapshot 对象（spec §2.6）。
- digest 名空间 `urn:sage:organization-policy:sha256:*`；canonical = spec §2.4（roleRefs 排序、grants 按 roleRef→operation→actionScope 排序、键序显式）。
- **golden 字面量（本计划实算，对应 spec §2.2 样例文件）**：`urn:sage:organization-policy:sha256:7d8a2ee170f40af191eb3b1908ef97663b24afb579734c91dd12153d390393dd`

- [ ] **Step 1: 写 test/organization-policy.spec.ts（红）** — 7 组用例（真 tmp 目录 + 真 `readFileSync` 注入）：
  1. 合法文件 → snapshot：`roleAssignments` 绑请求方 handle（handle-A 与 handle-B 各绑各自）；grants 规范化排序；`policy.digest` === golden 字面量；organizationId/时效原文；
  2. 顺序不敏感：roleRefs 两项交换 + grants 两项交换 → digest 相同；
  3. 缺失（无文件）/ 不可读（注入抛错）→ throw；
  4. 坏 JSON / 超 256KiB → null；
  5. schema 违规逐项 → null：未知顶层与嵌套键、schemaVersion 错、空串与未 trim、坏时间戳（`2026-02-31T00:00:00Z`）、mode 非 `instance-operator`、roleRefs 空 / 重复 / 非 string、grants 非对象 / effectClass 非枚举 / requiresDecision 非 boolean / 三元组重复；
  6. 新鲜度：改写文件（version → '2'）→ 下一次 resolve 新 digest（无缓存）；
  7. 只读：注入 spy 断言 `readFileBytes` 只收到 `policyPath` 一个路径。
- [ ] **Step 2: 跑 → 红** — `node scripts/test.mjs run test/organization-policy.spec.ts`（模块不存在）。
- [ ] **Step 3: 实现 organization-policy.ts** — exact-record 守卫（own-property descriptor、无 accessor/Proxy）、`exactString` / `exactTimestamp`（ISO UTC 往返一致）、`EFFECT_CLASSES` 本地冻结元组（本仓模式）、canonical + `sha256hex`（`node:crypto`）、绑定、snapshot 构造、signal 二分；零 fs import。
- [ ] **Step 4: 跑 → 绿 + typecheck** — spec 单跑通过；`npm run typecheck` 0 error。

### Task 3 · Authority Runtime 组装 + paths 字段

**Files:**
- Create: `apps/sage-shell/src/main/authority-runtime.ts`
- Create: `apps/sage-shell/test/authority-runtime.spec.ts`（集成）
- Modify: `apps/sage-shell/src/profile/paths.ts`（增 `ORGANIZATION_POLICY_FILE = 'organization-policy.json'` 常量 + `SagePaths.organizationPolicyFile` 字段，`join(root, ...)` 同 `activeProfileFile` 模式）
- Modify: `apps/sage-shell/test/profile-paths.spec.ts`（仿 L42 增一行 `expect(paths.organizationPolicyFile).toBe(join(paths.root, ORGANIZATION_POLICY_FILE))`）

**Interfaces（D.2 消费）:**
- `SAGE_DESKTOP_AUDIENCE = 'sage-desktop'`
- `createSageAuthorityRuntime(input: { vault: TokenVault; policyPath: string; readFileBytes: (absolutePath: string) => Buffer; now: () => string }): { resolve: (request: unknown) => IdentityPolicyResolution }`
- identity 端口 assertion：`issuer = { identity: session.issuer, version: '1', digest: 'urn:sage:issuer-identity:sha256:' + sha256hex(session.issuer) }`；`sessionId = session.sessionRef`（**不回声调用方线索**）；无会话 → throw；`resolvePolicy` 直接转发 provider。

- [ ] **Step 1: paths.ts + profile-paths.spec.ts** — 增常量与字段 + 断言行；跑该 spec 绿。
- [ ] **Step 2: 写 test/authority-runtime.spec.ts（红）** — 集成：真 vault（`mintSessionRef` 注入）+ 真 tmp 目录文件 + 真内核；`resolveSagePaths({ home: tmpHome, root: tmpRoot })` 取 `paths.organizationPolicyFile` 放置 policy；8 组用例：
  1. 未登录 → `identity-provider-unavailable`；
  2. 登录 → resolve（五字段请求）→ authorized：snapshot 逐字段（issuer 三字段、identityHandle、organizationId=文件、roleRef、operation、actionPolicy、policy.digest=golden、validFrom/expiresAt、authenticatedAt/identityExpiresAt、evaluatedAt=注入 now）且 deep freeze；
  3. 组织线索 ≠ 文件 → `policy-organization-mismatch`；
  4. 重新 signIn 后用旧 ref → `identity-session-mismatch`；
  5. 注入 now ≥ expiresAt → `identity-not-active`；
  6. 文件缺失（登录态）→ `policy-provider-unavailable`；
  7. signOut → `identity-provider-unavailable`；文件热改 → 新 digest 生效；
  8. 只读：`readFileBytes` spy 只收到 `policyPath`；`vault.snapshot()` 键集不变（零泄漏）。
- [ ] **Step 3: 跑 → 红** — `node scripts/test.mjs run test/authority-runtime.spec.ts`（模块不存在）。
- [ ] **Step 4: 实现 authority-runtime.ts** — 组装内核；identity 端口从 vault 构造 assertion；`now` 直通；零 fs import（转发注入）。
- [ ] **Step 5: 跑 → 绿 + typecheck + 全量** — spec 通过；`npm run typecheck` 0；`npm test` 全量绿。

### Task 4 · 变异验证 + 全量回归 + 留痕 + 提交

- [ ] **Step 1: 变异 M1** — provider `roleAssignments` 绑定换常量（`identityHandle: 'handle:mutated'`）→ 集成 authorized 用例红；还原后绿。
- [ ] **Step 2: 变异 M2** — canonical 去排序（grants/roleRefs 不 sort）→ 顺序不敏感用例红；还原后绿。
- [ ] **Step 3: 变异 M3** — identity 端口 `sessionId: request.sessionId`（回声线索）→ 旧 ref 用例红；还原后绿。
- [ ] **Step 4: 变异 M4** — provider 读失败改返回 null（absent/invalid 混淆）→ 缺文件用例红；还原后绿。
- [ ] **Step 5: 全量回归** — `npm run typecheck && npm test && npx tsc && npm run smoke`（apps/sage-shell）；`pnpm run gate`（仓根）25/25。
- [ ] **Step 6: 留痕** — Note `docs/notes/implemented/security/2026-10-02-wt02b2e-organization-policy-provider.md`（Problem/Decision/Alternatives/Consequences + 内嵌完整样例 + 操作者说明"文件在哪/怎么填/怎么验证" + 真实读数 + 变异记录）；ADR-0188 + `docs/adr/README.md` 行 + `node scripts/gates/adr-agent-records.mjs --write`。
- [ ] **Step 7: 提交** — `feat(sage): local organization policy provider and authority runtime (WT-02B.2E)` + `docs(adr): ADR-0188 WT-02B.2E with note`（含 spec/plan），`git push origin main`。

## 验证命令（收口）

```bash
cd apps/sage-shell && npm run typecheck && npm test && npx tsc && npm run smoke
cd /Users/lute/project/Sage && pnpm run gate
```

## 边界（不做）

intent→请求组装与 step-2 端口接线（D.2）；candidate org claims（③）；refresh rotation / revocation；多成员 membership、管理 UI、供给自动化；`AuthorityEvidence` 持久化（B.3）；offline 例外；不修改内核 / domain / store / v1 schema。
