# WT-02D.0.2 · Command Pipeline 内核设计（步骤 2–10 骨架）

日期：2026-10-01 · 状态：设计已获用户确认（A/A/A 三裁决） · 上游：ADR-0174（command 顺序）、ADR-0179（0.1 route skeleton）、[WT-02D Application Service 边界](../../notes/proposed/architecture/2026-09-30-application-service-boundary.md)

## 1. 目标与切片

WT-02D.0.1 交付了 main-owned `/.sage/*` route skeleton（binding → unavailable-first composition → kernel → transport），dispatch 恒 503。0.2 把 dispatch 的「笼统 503」升级为 **command 顺序步骤 2–10 的完整纯函数管道内核**：每步一个 typed port，缺 provider 的步骤注入 fail-closed port，真实 kernel（identity-policy / domain / compatibility 栈 / capability-registry）接进编排，renderer 从 dispatch 收到**步骤级 typed 错误类别**。

**裁决（用户确认）**：
- **D1 完整管道骨架**：步骤 2–10 一次搭齐（非逐段渐进）。每步 typed port + fail-closed；既有 kernel 真实接入编排。
- **D2 接进 main dispatch**：`POST /.sage/actions` 走管道，renderer 收步骤级 typed 响应；不 kernel-only。
- **D3 内核全 intent 合同 + transport 仍只 retry**：内核定义完整 `SageActionIntent`（matterId/revisionId/actionType/actionScope/payload/origin）；`route-skeleton` 的 `parseIntent` 仍只接受 `{"type":"retry"}`，业务 intent 400 invalid-intent（真实登录等待期最小化纪律）。管道单测直接喂完整 intent 测步骤 2–10。

## 2. 文件结构

```
apps/sage-shell/src/appservice/
  command-contracts.ts   # 新增：完整 ActionIntent + CommandPipelinePorts + 步骤级结果类型
  command-pipeline.ts    # 新增：步骤 2–10 顺序编排内核（零 Electron import，firewall 射程内）
  errors.ts              # 扩展：CommandErrorCode 枚举 → 安全响应体映射
  composition.ts         # 扩展：production 管道服务（全 port fail-closed）
  route-skeleton.ts      # 微改：dispatch 响应体类型放宽为管道结果
apps/sage-shell/src/main/index.ts   # 改：dispatch 接线走管道
apps/sage-shell/test/
  command-contracts.spec.ts   # 新增
  command-pipeline.spec.ts    # 新增：每步/顺序/fail-closed 三族
  appservice-composition.spec.ts  # 扩展：production 恒 identity-unavailable
  appservice-route-skeleton.spec.ts  # 扩展：typed dispatch 响应断言
```

import firewall（D5，0.1 遗产）射程不变、规则不变：`../security/*`、`../domain/*` 已在允许面（firewall 只禁 electron/@deepseek-ai/packages/vendor/renderer 实现路径），`command-pipeline.ts` 合法。

## 3. Command 合同（command-contracts.ts）

### 3.1 完整 ActionIntent

```ts
export interface SageActionIntentV2 {
  readonly matterId: string
  readonly revisionId: string          // 调用方看到的 revision；stale 判定用
  readonly actionType: string
  readonly actionScope: 'matter' | 'revision'   // 对齐 ActionPolicy 粒度
  readonly payload: Readonly<Record<string, string | number | boolean>>  // typed 闭集，拒嵌套对象
  readonly origin: 'renderer-retry' | 'renderer-action'   // 产品 provenance 提示，非 authority
}
export type RetryIntent = { readonly type: 'retry' }   // 既有 P0-2 形（transport 唯一入口）
```

`SageActionIntentV2` 拒收 `HumanRoleRef`、organization、grant、`AuthoritySnapshot`、compatibility outcome、`matrixId`、digest、Registry approval、execution snapshot（parse 函数按 exact keys 校验，多余键判 invalid-intent——与 0.1 `parseRetryIntent` 同构）。

### 3.2 CommandPipelinePorts（九步 typed port）

```ts
export interface CommandPipelinePorts {
  readonly resolveIdentityPolicy: (req: { readonly intent: SageActionIntentV2; readonly correlation: string }) =>
    IdentityPolicyResolution | undefined        // undefined = provider unavailable
  readonly strictRehydrate: (req: { readonly matterId: string; readonly revisionId: string }) =>
    { readonly matter: BusinessMatter; readonly current: boolean } | { readonly denied: 'not-found' | 'stale-revision' } | undefined
  readonly resolveTarget: (req: { readonly matter: BusinessMatter }) =>
    { readonly targetRequirement: unknown } | { readonly denied: 'target-unavailable' } | undefined
  readonly resolveCompatibility: (req: { readonly targetRequirement: unknown }) =>
    { readonly outcome: 'equivalent' } | { readonly denied: 'unknown' | 'requires-new-revision' } | undefined
  readonly resolveRegistry: (req: { readonly actionType: string }) =>
    { readonly mapping: CapabilityRegistryOperationMappingV1 } | { readonly denied: 'registry-unavailable' | 'not-approved' } | undefined
  readonly preflightAvailability: (req: { readonly mapping: CapabilityRegistryOperationMappingV1 }) =>
    { readonly ok: true } | { readonly denied: 'capability-unavailable' } | undefined
  readonly persistPreparation: (req: { /* service-issued operation identity + 证据引用 */ }) =>
    { readonly persisted: true } | { readonly denied: 'persistence-unavailable' } | undefined
  readonly dispatchOperation: (req: { readonly mapping: CapabilityRegistryOperationMappingV1 }) =>
    { readonly receipt: unknown } | { readonly outcome: 'outcome-unknown' } | { readonly denied: 'cancelled-before-dispatch' } | undefined
  readonly now: () => string          // trusted clock 注入位
}
```

每步返回 `undefined` 一律按该步 unavailable 处理（fail closed），绝无默认放行。

### 3.3 步骤级结果类型

```ts
export type CommandErrorCode =
  'invalid-intent' | 'identity-unavailable' | 'policy-denied' | 'stale-revision'
  | 'decision-required' | 'compatibility-unknown' | 'requires-new-revision'
  | 'registry-unavailable' | 'capability-unavailable' | 'persistence-unavailable'
  | 'cancelled-before-dispatch' | 'conflict' | 'outcome-unknown'
export interface CommandDenied { readonly code: CommandErrorCode; readonly stage: string; readonly retryable: boolean;
  readonly requiresNewRevision?: boolean; readonly requiresDecision?: boolean; readonly correlation: string }
export interface CommandAccepted { readonly correlation: string; readonly receiptRef: string }
export type CommandResult = CommandDenied | CommandAccepted
```

错误体只携带 `code/stage/retryable/requiresNewRevision/requiresDecision/correlation`（脱敏合同，无 stack/message/raw payload/matter 存在性泄漏）。

## 4. 编排内核（command-pipeline.ts）

`runCommand(input: { intent; correlation; ports }): CommandResult` 按 command 顺序硬编码步骤 2–10：

1. **步骤 2（Identity/Policy）**：`ports.resolveIdentityPolicy` 喂 `security/identity-policy` kernel 的 `IdentityPolicyResolution`；denied → `policy-denied`；undefined → `identity-unavailable`。
2. **步骤 3（strict rehydrate）**：denied `'stale-revision'` → `stale-revision`；`'not-found'` → denied 且不泄漏存在性（统一 `policy-denied` 类响应面，详见 §6）。
3. **步骤 4（target）**、**步骤 5（domain 重验，`domain/business-matter` 领域判定：`requiresDecision` 等价 decision-required）**、**步骤 6（compatibility，`unknown`/`requires-new-revision` 阻断）**、**步骤 7（registry，not-approved/unavailable）**、**步骤 8（preflight）**。
4. **步骤 9（persistPreparation）**、**步骤 10（dispatchOperation）**：port-only 合同；production 无实现 → 恒 fail-closed。
5. **顺序不可绕过**：任一步非成功立即 return，后续 port 零调用（单测以调用序列断言）；每步重新求值，不继承前序 authority（port 合同由 caller 每步重取 fresh 输入）。
6. **retry 特例**：`RetryIntent` 穿同一管道；其在步骤 3 前命中「无 matterId 可 rehydrate」即落 `invalid-intent` 类响应（retry 无 receipt 重取语义可激活的路径——production 全 port fail-closed 时 retry 与业务 intent 同在步骤 2 终止，语义「retry 只重新检查 availability」保留到 provider 齐）。

kernel 内部不 import Electron、不做 I/O；`ports` 全部由调用方注入（main 或单测）。

## 5. Production composition（composition.ts 扩展）

`createUnavailableFirstService` 的 dispatch 升级：构造 `CommandPipelinePorts` 的 production 实现——**九个 port 全部返回 `undefined`**（provider 不存在 = fail closed）。dispatch 恒在步骤 2 得 `identity-unavailable` typed 响应（HTTP 200 + `{code:'identity-unavailable', stage:'identity-policy', retryable:true, correlation}`，无 provider 期间与 0.1 的「identity-unavailable」语义连续、但带步骤级 stage/correlation）。

## 6. Transport 与错误面（route-skeleton.ts / errors.ts）

- `parseIntent` 不变（只 retry）；`MAX_SAGE_ACTION_BYTES` 不变。
- dispatch 成功路径响应：`CommandDenied` → HTTP 200 + typed body；`CommandAccepted` → HTTP 202 + `{correlation, receiptRef}`（production 不可达，单测覆盖）。denied/not-found 不泄漏 matter 存在性：`stale-revision` 与 `not-found` 对 renderer 同形（同一 code 面）。
- 错误体全量 `cache-control: no-store`（延续 fix-wave 纪律）。

## 7. main 接线（main/index.ts）

`protocol.handle` 的 `/.sage/*` on 态分支：binding 通过后，dispatch 走 `createUnavailableFirstService`（内含管道 production ports）；state 路径不变。`SAGE_APP_SERVICE=off` 回退不变。

## 8. 测试与验收

1. **command-contracts.spec**：intent parse 精确键校验（多余键/嵌套 payload/非法 scope 判 invalid）；拒收 authority 字段。
2. **command-pipeline.spec 三族**：
   - 每步单测：fake ports 让前序通过，验证该步 kernel 结果被尊重（denied 映射正确 code）；
   - 顺序不可绕过：identity denied 后，后续 port 调用序列为空（序列记录断言）；
   - fail-closed 扫描：逐个 port 返回 undefined → 对应 unavailable code。
3. **composition.spec 扩展**：production dispatch 恒 `identity-unavailable` + fresh correlation。
4. **route-skeleton.spec 扩展**：typed dispatch 响应断言；**消解 0.1 遗留「retry 路径两形解包守卫」**（renderer retry 消费路径按新 dispatch 响应体补守卫）。
5. 全量 `node scripts/test.mjs run`、typecheck 0、gate 25/25、firewall 不动（新文件自动入射程）。
6. Note + ADR-0181 随票落档（机器可读决策块 D1–D3）。

## 9. 不做（边界）

- 不接真实 provider（Identity/Policy/target/compatibility/registry/dispatch 全 fail-closed port）。
- 不开 transport 业务 intent 提交口（parseIntent 仍只 retry）。
- 步骤 9 持久化无真实 store 接线（port-only）；`Persistable AuthorityEvidence` 细化等 provider。
- 不动 0.1 的 `SAGE_APP_SERVICE` 开关、state 双字段合同、binding 二值。
- 不做 outbox / reconciliation（属 WT-02D.2）。
