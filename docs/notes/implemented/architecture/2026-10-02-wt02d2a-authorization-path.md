# WT-02D.2A · 授权路径切片：intent→请求组装 + step-2 真接线 + retry 可用性语义 + route 开放

日期：2026-10-02 · 分类：architecture · 关联 ADR：[ADR-0190](../../../adr/ADR-0190.md)

## Problem

WT-02D.2（首个 production command path）的任务分解原本要求「真实 Identity / Policy、WT-02B.3 最小 `PersistableAuthorityEvidence`、C2/C3、Registry real entry、trusted clock、数据治理、idempotency/cancel/reconciliation 全部通过后才可开始」。对当前源码复核：真实 Identity / Policy ✅（2E 交付但**未接 pipeline**）；WT-02B.3 ❌（`persistence/` 无 AuthorityEvidence）；C2 内核已在但 C2E.1/.2 main composition ❌；Registry real entry ❌（C2D.2A/.2B 未做）；数据治理 ❌；idempotency 族 ❌。**D.2 全量不可开**；唯一可开的诚实切片是 2E 显式遗留的「intent→请求组装 + step-2 端口接线」。

## Decision

用户四裁决（2026-10-02）：切片 = 授权路径（WT-02D.2A）；retry = 真实最小可用性检查；组装映射 = 代码常量；route = 开放全形业务 intent。落地：

1. **Action 权威表**（`src/main/action-authority-table.ts`，冻结代码常量）：v1 单条 `'start-attempt' → { role:owner, start-attempt, shopify.orders.read, external-read, requiresDecision:true }`——**锚定真实域数据**（fixture revision 域内 `actionPolicies` 声明）与 2E instance-operator 角色，非凭空发明；条目形状已把 actionType 与 operation 解耦，未来升格配置 / Registry 不改消费者。未登记动作 → 组装 `invalid`（**不得进入求值**）。
2. **组装内核**（`src/main/authorization-assembly.ts`，纯函数无 I/O）：`intent + sessionRef + organizationRef(+ 注入表) → {request} | {unavailable} | {invalid}`；request 为 kernel 2D 请求五键零增删。
3. **组织线索与 policy 装载重构**（`organization-policy.ts`）：抽 `loadOrganizationPolicy → loaded/unavailable/invalid` 单一解析路径（provider 重写为其薄层，2E 行为逐字节不变、既有测试零改动）；**线索 = 文件 `organizationId`**——生产组装下线索与 policy 同源，`policy-organization-mismatch` 经该路径不可达（登记遗留；内核语义由 2D 用例维持）。
4. **retry 语义落地**（`authority-runtime.checkAuthorizationAvailability` + pipeline 前置分支）：retry = active session ∧ 会话窗口有效 ∧ policy loaded ∧ 策略窗口有效；通过 → **新结果分支 `{correlation, availability:'available'}`**（`CommandResult` 增 `CommandAvailable`）；未通过 → 既有 `identity-unavailable @ identity-policy`（retryable）。**旧「retry 过 identity 后被 invalid-intent 拒绝」路径退场**（序列断言：retry 只调用 availability 端口）。
5. **接线**：`createSageAppServiceProviders` 增 `options.authority { policyPath, readFileBytes, now }`——构造 Authority Runtime 并把真 `resolveIdentityPolicy`（组装 + 求值，`invalid` → 自构 frozen denial）与 availability 端口**合并到 fail-closed 默认端口之上**；步骤 3–10 保持 fail-closed。`main/index.ts` 与窗口 probe 同装配（单一装配点兑现）；route 接受 `retry | SageActionIntentV2` 并传递 intent；renderer retry 处理器简化为「POST → refresh()」（响应体不再消费）。
6. **失败矩阵（产品面）**：retry 未登录/过期 → `identity-unavailable`；retry 健康 → `available`；业务 intent 未登录/无线索 → `identity-unavailable`；未登记动作 / policy 无匹配 grant → `policy-denied`（真实 policy 驱动）；**步骤 2 通过后在 rehydrate 如实 fail-closed**（本票真实前进量）；形状非法 → 400 不变。

### 操作者样例更新（与 v1 动作表对齐）

表条目与 policy grant 必须**四维全等**（operation / actionScope / effectClass / requiresDecision），否则内核如实拒绝：

```json
{
  "schemaVersion": "sage.organization-policy.v1",
  "organizationId": "organization:sage",
  "policy": { "identity": "policy:local", "version": "1" },
  "validFrom": "2026-10-01T00:00:00Z",
  "expiresAt": "2027-10-01T00:00:00Z",
  "membership": { "mode": "instance-operator", "roleRefs": ["role:owner"] },
  "grants": [
    { "roleRef": "role:owner", "operation": "start-attempt",
      "actionScope": "shopify.orders.read", "effectClass": "external-read", "requiresDecision": true }
  ]
}
```

（2E Note 的 `business-matter.start-attempt / catalog.prepare-draft` 样例保持为格式记录；现行动作词汇以 `action-authority-table.ts` 为准。）

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 等 B.3/C2D.2/C3/数据治理/idempotency 全部门（D.2 全量） | 否决（用户裁决切片）；授权路径挂空、D 线停滞。 |
| 组装映射做成配置文件 | 否决（用户裁决代码常量）；v1 单动作不值得新增文件 schema + 校验面。 |
| retry 维持 fail-closed | 否决（用户裁决可用性检查）；真 port 下已登录 retry 会被误报 identity-unavailable。 |
| retry 退场（route/渲染器删除） | 否决；渲染器现用 retry 按钮服务 host-unavailable 流，退场牵连 UI。 |
| route 维持 retry-only | 否决（用户裁决开放）；真接线只在测试层验证，产品面拿不到真实求值结论。 |
| 组装对未登记动作放行 | 否决；未登记动作不得进入求值（M1 变异证明测试咬住）。 |

## Consequences

- **真实读数（2026-10-02）**：`npm run typecheck` 0 error；全量 **596 tests 全 PASS**（+3 availability、+9 集成、+2 路由、+5 组装、+4 load 直测；renderer 双形守护改写为新契约）；`npx tsc` 构建通过；仓根 `pnpm run gate` **25/25**。

> 更正（2026-10-02，[WT-02C.2E.2 Note](2026-10-02-wt02c2e2-runtime-inventory-composition.md)）：本段原记「`npm run smoke` PASS」在 E.2 复核时无法对活动 generation（`bb862e74`）复现——smoke 的 `/.sage` 断言自 WT-02D.1（Host 拒面 + main 唯一 owner，ADR-0184）起即陈旧，只有 02D.1 之前 materialize 的旧 generation 才能通过；E.2 已把 smoke 对齐到现行合同（Host 对 `/.sage/*` 一律 404）并在其 Note 记录该仪器发现。本票其余读数不受影响。
- **变异验证四组**（改源→红→还原后复核）：M1 组装放行未登记动作 → 集成红；M2 availability 漏会话窗口 → runtime 红；M3 删 retry 前置分支 → pipeline 2 红；M4 线索硬编码 `organization:sage` → 集成 2 红（含「无 policy 文件」用例）；四组还原后全绿。
- **行为面**：真实登录 + 已供 policy 下，retry 如实报 available、业务 intent 产生真实求值结论（policy-denied / 步骤 2 通过后在 rehydrate 如实报 identity-unavailable @ rehydrate）；无 policy / 未登录一律 fail closed。renderer retry 点击后统一经 state 轮询收敛。
- **Live 验收（2026-10-02，真实应用 + 真实 Logto 登录 + CDP 自 renderer 发起）**：未登录 retry → `identity-unavailable @ identity-policy`（retryable）；**已登录但未供 policy** retry 与业务 intent → 同码（policy 缺失如实）；**供 policy 后**（Note 样例，grant 与表条目四维全等）retry → **`{correlation, availability:'available'}`**（新结果分支真实生效）、业务 intent（`start-attempt`）→ **`identity-unavailable @ rehydrate`**（retryable——**步骤 2 真实求值通过**、链在 rehydrate 如实 fail-closed，本票真实前进量的现场证据）、未登记动作（`answer-clarification`）→ `policy-denied @ identity-policy`（retryable:false）、非法形状 → 400 `invalid-intent @ intent`；renderer retry 按钮点击 → 状态经轮询收敛、UI 无异常。policy 文件为本验收所供（`$SAGE_ROOT/organization-policy.json`），删除即回 fail-closed。
- **边界**：步骤 3–10 真 port、B.3、C2D.2、C2E.1/.2、C3 其余、数据治理、idempotency/cancel/reconciliation、多 capability/业务域、UI 提交函数、projection read policy、`answer-clarification` 入表——一律不做；内核（`identity-policy.ts`）零改动；零持久化 / 零日志 / 零网络新增。
- **遗留登记**：① 组装 `invalid` → 产品面 `policy-denied`（若要区分须独立裁决）；② intent 的 `actionScope`（matter\|revision）未参与组装；③ 动作表升级形态（配置文件 / Registry 融合）；④ 时效窗口同规则拷贝两处（kernel / runtime），未来收敛；⑤ `policy-organization-mismatch` 经生产组装不可达（线索与 policy 同源；多组织语境重新启用）。

## Verification

本票完成的可验证结果为：spec / plan 入库、Note + ADR-0190 + 机器账本可再生成、链接与 Sage quick gate 通过，且精确差异证明内核 / domain / store / v1 schema / Host / profile package 零改动。任何「步骤 3+ 已真实」或「产品 action 已可完成」的声明都必须由后续票（B.3 / C2D.2 / C2E.1·2 / C3 / idempotency 族）另行给出证据。
