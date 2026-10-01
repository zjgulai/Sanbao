# WT-02D.2A · 授权路径切片（实施计划）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 2E Authority Runtime 接进 command pipeline 步骤 2（intent→请求组装 + 真 port），retry 落地真实最小可用性语义，route 开放全形业务 intent；步骤 3–10 保持 fail-closed。

**Architecture:** main 侧三个新/改单元（动作表、组装内核、policy load 重构）+ runtime 可用性检查 → app-service 单一装配点组装真 port（与 fail-closed 默认合并）→ pipeline 增 retry 前置分支与新结果分支 → route/renderer 适配。内核（`security/identity-policy.ts`）零改动。

**Tech Stack:** TypeScript（strict、exactOptionalPropertyTypes、零运行时依赖）；vitest via `node scripts/test.mjs run`（apps/sage-shell 下）。

**Spec:** [docs/superpowers/specs/2026-10-02-wt02d2a-authorization-path-design.md](../specs/2026-10-02-wt02d2a-authorization-path-design.md)（executor 必须同时读 spec——表条目/失败矩阵/边界都在那里）。

## Global Constraints

- 提交节奏：票末 feat + docs 两批推送（无逐任务提交）；tsconfig 只含 `src/**`，测试不被 typecheck——调用点更新靠清单核对。
- 内核 `identity-policy.ts` 零改动；零持久化 / 零日志 / 零网络新增；不读 `.credentials.yaml`。
- `createSageAppServiceProviders` 的 3 个既有构造点（`main/index.ts`、`appservice-route-fixture.spec.ts`、窗口 probe `.mjs`）与 `dispatch()` 的无参调用点（`appservice-composition.spec.ts` 4 处、route-fixture spec）必须全数更新。
- 组装 `invalid` 拒绝为本模块自构 frozen 对象（code 取 kernel union `'invalid-request'`、自有 reason 文案）；不复制 kernel 文案映射。

---

### Task 1 · main 纯内核：动作表 + 组装内核 + load 重构

**Files:**
- Create: `apps/sage-shell/src/main/action-authority-table.ts`
- Create: `apps/sage-shell/src/main/authorization-assembly.ts`
- Modify: `apps/sage-shell/src/main/organization-policy.ts`（导出 `loadOrganizationPolicy`，provider 重写为其薄层）
- Create: `apps/sage-shell/test/authorization-assembly.spec.ts`
- Modify: `apps/sage-shell/test/organization-policy.spec.ts`（只增 load 直测；既有用例零改动）

**Interfaces（T3 消费）:**
- `ACTION_AUTHORITY_TABLE`（frozen，`Record<string, ActionAuthorityEntry>`）；v1 单条 `'start-attempt' → { requiredRoleRef: 'role:owner', operation: 'start-attempt', actionScope: 'shopify.orders.read', effectClass: 'external-read', requiresDecision: true }`
- `assembleAuthorizationRequest({ intent, sessionRef, organizationRef, table? }) → {kind:'request',request}|{kind:'unavailable'}|{kind:'invalid'}`（§2.2）
- `loadOrganizationPolicy({ policyPath, readFileBytes }) → {kind:'loaded',policy}|{kind:'unavailable'}|{kind:'invalid'}`；`LoadedOrganizationPolicy = { organizationId, policy:{identity,version,digest}, validFrom, expiresAt, roleRefs(排序后), grants(canonical 排序) }`

- [ ] **Step 1: 写 assembly spec（红）** — 表条目手写断言（值逐字段、`Object.isFrozen`、键集合仅 `['start-attempt']`）；组装矩阵：命中 → request 五键逐字段（sessionId/requiredRoleRef/operation/actionPolicy{actionScope,effectClass,requiresDecision}/requestedOrganizationRef）；未登记 actionType → `invalid`；`sessionRef:null` → `unavailable`；`organizationRef:null` → `unavailable`；`table` 注入（两条目表）→ 按注入表组装；纯函数（输入不改）。
- [ ] **Step 2: 跑 → 红** — `node scripts/test.mjs run test/authorization-assembly.spec.ts`（模块不存在）。
- [ ] **Step 3: 扩 organization-policy.spec（红）** — 增 `loadOrganizationPolicy` 直测：loaded（orgId/时效/digest 金手写沿用样本 golden/roleRefs 排序/grants canonical）；缺失或注入读错 → `unavailable`；坏 JSON / schema 违规 / 超限 → `invalid`。既有 provider 用例零改动（重构后必须原样全绿）。
- [ ] **Step 4: 跑 → 红** — `node scripts/test.mjs run test/organization-policy.spec.ts`（导出不存在）。
- [ ] **Step 5: 实现** — 动作表（含 `import type { EffectClass }`）；组装内核（type-only import `SageActionIntentV2` 自 `../appservice/command-contracts.js`、`ActionAuthorizationRequest` 自 `../security/identity-policy.js`）；`organization-policy.ts` 重构：抽 `loadOrganizationPolicy`（复用 parsePolicy/canonicalDigest/sortedRoleRefs/canonicalGrants），provider.resolve 改为：load → `unavailable` 抛错 / `invalid` null / `loaded` 构造 snapshot（绑定/排序/digest 逻辑原样搬迁）。
- [ ] **Step 6: 绿 + typecheck** — 两 spec 通过；`npm run typecheck` 0。

### Task 2 · appservice 契约与编排：retry 分支 + dispatch(intent) + route + renderer

**Files:**
- Modify: `apps/sage-shell/src/appservice/command-contracts.ts`（`CommandAvailable` / `SageDispatchIntent` / 新端口）
- Modify: `apps/sage-shell/src/appservice/command-pipeline.ts`（retry 前置分支）
- Modify: `apps/sage-shell/src/appservice/composition.ts`（export fail-closed、新端口默认、`dispatch(intent)`、`ServiceOptions.commandPorts?`）
- Modify: `apps/sage-shell/src/appservice/contracts.ts`（`ServiceProviders.dispatch` 签名）
- Modify: `apps/sage-shell/src/appservice/route-skeleton.ts`（全形 intent 解析 + 传递）
- Modify: `apps/sage-shell/src/product/renderer.ts`（retry 处理器简化）
- Modify: `apps/sage-shell/test/command-pipeline.spec.ts`（retry 两用例改写 + 序列断言）
- Modify: `apps/sage-shell/test/appservice-composition.spec.ts`（`dispatch()` → `dispatch({type:'retry'})`，共 4 处）
- Modify: `apps/sage-shell/test/appservice-route-fixture.spec.ts`（dispatch 调用更新 + 业务 intent 路由用例）

**Interfaces（T3 消费）:**
- `CommandAvailable = { correlation, availability: 'available' }`；`CommandResult = CommandDenied | CommandAccepted | CommandAvailable`
- `SageDispatchIntent = SageActionIntentV2 | { type: 'retry' }`
- 端口 `checkAuthorizationAvailability: () => { ok: true } | undefined`（默认 fail-closed `() => undefined`）
- `PRODUCTION_FAIL_CLOSED_PORTS` 导出；`createUnavailableFirstService(runtime, options)` 的 `options.commandPorts?: CommandPipelinePorts`

- [ ] **Step 1: 改 pipeline spec（红）** — c14 改写：「retry + availability ok → `{correlation, availability:'available'}`」；c15 改写：「retry + fail-closed availability → `denied('identity-unavailable' @ identity-policy, retryable)`」；**新增序列断言**：retry 的 port 调用序列 = 仅 `checkAuthorizationAvailability`（不再含 `resolveIdentityPolicy`）；recordingPorts 增 `checkAuthorizationAvailability` 记录。
- [ ] **Step 2: 跑 → 红** — `node scripts/test.mjs run test/command-pipeline.spec.ts`。
- [ ] **Step 3: 实现契约与管道** — command-contracts（三处新增）；command-pipeline：retry 前置分支（§5.2 原文）；composition：fail-closed 端口表增 `checkAuthorizationAvailability: () => undefined`、export、`dispatch(intent)`、`options.commandPorts ?? PRODUCTION_FAIL_CLOSED_PORTS`；contracts.ts 签名。
- [ ] **Step 4: route + renderer** — `parseIntent` 返回 `{type:'retry'} | SageActionIntentV2`（复用 `parseSageActionIntentV2`），成功 `deps.providers.dispatch(intent)`，失败 400 不变；renderer retry 处理器：POST → `void refresh()`（删响应体分支）。
- [ ] **Step 5: 更新两 spec 调用点** — `appservice-composition.spec.ts` 4 处无参 dispatch 补 `{type:'retry'}`（断言形状不变：默认端口下 retry → identity-unavailable @ identity-policy）；`appservice-route-fixture.spec.ts` dispatch 调用更新 + 新增：合法业务 intent（`{matterId,revisionId,actionType:'start-attempt',actionScope:'revision',payload:{},origin:'renderer-action'}`）→ 200 `identity-unavailable` @ identity-policy（默认 fail-closed）；业务意图非法形状 → 400 不变。
- [ ] **Step 6: 绿 + typecheck + 全量** — 三 spec 通过；`npm run typecheck` 0；`npm test` 全量绿。

### Task 3 · main 接线：availability + app-service 装配 + index/probe + 集成 spec

**Files:**
- Modify: `apps/sage-shell/src/main/authority-runtime.ts`（`checkAuthorizationAvailability`）
- Modify: `apps/sage-shell/src/main/app-service.ts`（`options.authority` + 端口装配）
- Modify: `apps/sage-shell/src/main/index.ts`（`readFileSync` 导入 + authority 选项）
- Modify: `apps/sage-shell/test/support/sage-fixture-projection-probe.mjs`（构造选项同步）
- Modify: `apps/sage-shell/test/authority-runtime.spec.ts`（availability 组合）
- Create: `apps/sage-shell/test/appservice-authorization.spec.ts`（main 级集成）

**Interfaces（D.2 后续 & 收口消费）:**
- `SageAuthorityRuntime.checkAuthorizationAvailability(): { ok: true } | { ok: false }`（session 存在 ∧ 会话窗口有效 ∧ policy loaded ∧ 策略窗口有效；窗口比较按 kernel `isActive` 同规则——同规则第二处拷贝，登记遗留）
- `createSageAppServiceProviders` 增 `options.authority?: { policyPath; readFileBytes; now }`；装配真 port（§6.1 原文，含 `invalid` → 自构 frozen denial）

- [ ] **Step 1: runtime spec 扩（红）** — availability 组合：未登录 false；会话过期 false（注入 now）；无 policy false；policy 过期 false；policy 坏 false；健康 true。harness 复用既有 temp 文件 + signIn。
- [ ] **Step 2: 跑 → 红** — `node scripts/test.mjs run test/authority-runtime.spec.ts`。
- [ ] **Step 3: 实现 runtime + app-service + index + probe** — runtime：内部 `isWindowActive(validFrom, expiresAt, evaluatedAt)`（`Date.parse` 比较，`evaluated < expires` 半开）；checkAuthorizationAvailability 按上；app-service：按 spec §6.1 组装（load 每次 resolve 重读；`session?.sessionRef ?? null`；`load.kind==='loaded' ? organizationId : null`）；index：authority 选项传入（`paths.organizationPolicyFile`、`readFileSync`、`() => new Date().toISOString()`）；probe：构造点增 authority（probe root 的 policy 文件路径；缺失 → retry 断言形状不变）。
- [ ] **Step 4: 集成 spec（红→绿）** — `appservice-authorization.spec.ts`：tmp root + `resolveSagePaths` + vault（mintSessionRef 注入）+ adapter stub + `createSageAppServiceProviders({ ..., authority })`，经 `handleSageServiceRequest`（fake callerBinding）断言 §8 矩阵：
  1. retry 未登录 → 200 `identity-unavailable` @ identity-policy；
  2. retry 登录+已供 policy → 200 `{correlation, availability:'available'}`；
  3. retry 登录+policy 过期（注入 now）→ `identity-unavailable`；
  4. 业务 intent 未登录 → `identity-unavailable` @ identity-policy；
  5. 业务 intent 未登记 actionType → `policy-denied` @ identity-policy；
  6. 业务 intent 已登记但 policy 无匹配 grant → `policy-denied`；
  7. 业务 intent 已登记 + grant 对齐（policy：`role:owner / start-attempt / shopify.orders.read / external-read / true`）→ **步骤 2 通过**、`identity-unavailable` @ rehydrate（retryable）——真实前进量；
  8. 登录+无 policy 文件 → `identity-unavailable`（线索缺失）；
  9. **线索跟随文件**：policy 用不同 orgId（如 `organization:alt`）+ 同 grant → 仍 authorized 步（证明 clue=`文件 orgId`，非硬编码）；
  10. 非法形状 → 400；零写入：调用后 root 内仅 policy 文件（readdir 断言）+ 文件字节不变。
- [ ] **Step 5: 绿 + typecheck + 全量** — 两 spec 通过；typecheck 0；`npm test` 全量绿；`npx tsc && npm run smoke`。

### Task 4 · 变异 + 全量回归 + 留痕 + 提交

- [ ] **Step 1: 变异 M1** — 组装对未登记动作放行（`table[intent.actionType] ?? <default entry>`）→ 集成用例 5 红（变 authorized→rehydrate/unavailable）；还原。
- [ ] **Step 2: 变异 M2** — runtime availability 漏会话时效窗口 → runtime spec 过期用例红；还原。
- [ ] **Step 3: 变异 M3** — pipeline retry 前置分支删除 → pipeline 序列/形状用例红；还原。
- [ ] **Step 4: 变异 M4** — app-service 组织线索硬编码 `'organization:sage'` → 集成用例 9 红（mismatch → policy-denied）；还原。
- [ ] **Step 5: 全量回归** — `npm run typecheck && npm test && npx tsc && npm run smoke`（apps/sage-shell）；`pnpm run gate`（仓根）25/25。
- [ ] **Step 6: （可选）Live 验收** — 应用启动 + 你点登录后，经 CDP 自 renderer `fetch('/.sage/actions')` 发 retry 与业务 intent，观察真实结论（无 policy 文件时如实 `identity-unavailable`；有 policy 且 grant 对齐时业务 intent 在 step 2 通过、在 rehydrate 如实 fail-closed）；读数记录进 Note。
- [ ] **Step 7: 留痕** — Note `docs/notes/implemented/architecture/2026-10-02-wt02d2a-authorization-path.md`（Problem/Decision/Alternatives/Consequences + 更新版操作者样例〔`start-attempt` 表条目 ↔ policy grant 对齐〕+ 真实读数 + 变异记录）；ADR-0190 + `docs/adr/README.md` 行 + `node scripts/gates/adr-agent-records.mjs --write`。
- [ ] **Step 8: 提交** — `feat(sage): authorization path wiring with intent assembly and retry availability (WT-02D.2A)` + `docs(adr): ADR-0190 WT-02D.2A with note`（含 spec/plan），`git push origin main`。

## 验证命令（收口）

```bash
cd apps/sage-shell && npm run typecheck && npm test && npx tsc && npm run smoke
cd /Users/lute/project/Sage && pnpm run gate
```

## 边界（不做）

步骤 3–10 真 port、B.3、C2D.2、C2E.1/.2、C3 其余、数据治理、idempotency / cancel / reconciliation、多 capability / 多业务域、UI 提交函数、projection read policy、`answer-clarification` 入表。
