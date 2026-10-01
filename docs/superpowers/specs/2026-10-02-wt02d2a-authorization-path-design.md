# WT-02D.2A · 授权路径切片：intent→请求组装 + step-2 真接线 + retry 可用性语义 + route 开放（设计）

日期：2026-10-02 · 状态：设计已由用户逐题/逐节确认（2026-10-02），spec 待评审 · 上游：[ADR-0174](../../adr/ADR-0174.md)、[Application Service 边界](../../notes/proposed/architecture/2026-09-30-application-service-boundary.md)、[WT-02D.0.2 管道 spec](2026-10-01-wt02d02-command-pipeline-design.md)、[ADR-0188](../../adr/ADR-0188.md)（2E Authority Runtime）

## 1. 目标与切片

**D.2 全量不可开**——对计划 blocked 清单的当前源码复核：真实 Identity / Policy ✅（2E，未接 pipeline）；WT-02B.3 `PersistableAuthorityEvidence` ❌（无源码）；C2/C3 部分（C2 内核在，C2E.1/.2 main composition ❌；C3.2 evidence sidecar ✅ 本地）；Registry real entry ❌（C2D.2A/.2B 未做，且等 C2C.5）；trusted clock 部分；数据治理 ❌；idempotency / cancel / reconciliation ❌。

**本票 = 授权路径切片**（2E 显式遗留「intent→请求组装 + step-2 端口接线属 WT-02D.2」）：把 Authority Runtime 接进 command pipeline 步骤 2；步骤 3–10 保持 fail-closed。用户四裁决（2026-10-02）：切片 = 授权路径；retry = 真实最小可用性检查；组装映射 = 代码常量；route = 开放业务 intent。

## 2. Action 权威表与组装内核

### 2.1 Action 权威表（`src/main/action-authority-table.ts`，冻结代码常量）

v1 一条，**锚定真实域数据**（fixture revision 域内声明 `actionPolicies: [{ actionScope: 'shopify.orders.read', effectClass: 'external-read', requiresDecision: true }]`）与 2E instance-operator 语义（样例 policy 的 `role:owner`）：

```ts
export interface ActionAuthorityEntry {
  readonly requiredRoleRef: string
  readonly operation: string
  readonly actionScope: string // kernel 级 canonical action scope（≠ intent 的 matter|revision 轴）
  readonly effectClass: EffectClass
  readonly requiresDecision: boolean
}
export const ACTION_AUTHORITY_TABLE: Readonly<Record<string, ActionAuthorityEntry>> = Object.freeze({
  'start-attempt': {
    requiredRoleRef: 'role:owner',
    operation: 'start-attempt', // v1 恒等映射；条目显式，未来可解耦
    actionScope: 'shopify.orders.read',
    effectClass: 'external-read',
    requiresDecision: true,
  },
})
```

`answer-clarification` 等其余 fixture 动作**不进表**（进表即成为可被真实求值的授权面，其策略语义未定）；未登记 actionType → 组装 `invalid`（见 §2.2）。表条目与 operation/actionType 解耦形状自 v1 即显式。

### 2.2 组装内核（`src/main/authorization-assembly.ts`，纯函数）

```ts
export type AuthorizationAssembly =
  | { readonly kind: 'request'; readonly request: ActionAuthorizationRequest }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'invalid' }
export function assembleAuthorizationRequest(input: {
  readonly intent: SageActionIntentV2
  readonly sessionRef: string | null   // vault.identitySession()?.sessionRef
  readonly organizationRef: string | null // 组织线索（非权威；见 §3）
  readonly table?: Readonly<Record<string, ActionAuthorityEntry>> // 默认 ACTION_AUTHORITY_TABLE（注入供测试）
}): AuthorizationAssembly
```

- `table[intent.actionType]` 未命中 → `invalid`；`sessionRef === null` 或 `organizationRef === null` → `unavailable`；命中 → `{kind:'request', request:{ sessionId: sessionRef, requiredRoleRef, operation, actionPolicy:{ actionScope, effectClass, requiresDecision }, requestedOrganizationRef: organizationRef }}`（kernel 2D 请求五键，零增删）。
- intent 的 `actionScope`（'matter' | 'revision'）在本切片不参与组装（transport 轴；登记）。

## 3. 组织线索与 policy 装载重构（`src/main/organization-policy.ts`）

抽出单一解析路径并导出：

```ts
export interface LoadedOrganizationPolicy {
  readonly organizationId: string
  readonly policy: { identity: string; version: string; digest: string }
  readonly validFrom: string
  readonly expiresAt: string
  readonly roleRefs: readonly string[]
  readonly grants: readonly OrganizationPolicyGrant[]
}
export type OrganizationPolicyLoad =
  | { readonly kind: 'loaded'; readonly policy: LoadedOrganizationPolicy }
  | { readonly kind: 'unavailable' } // 读失败（含 ENOENT）
  | { readonly kind: 'invalid' }     // JSON/schema/超限
export function loadOrganizationPolicy(input: LocalOrganizationPolicyProviderInput): OrganizationPolicyLoad
```

- `createLocalOrganizationPolicyProvider` 重写为其上的薄层：`unavailable` → 抛错、`invalid` → `null`、`loaded` → 构造 snapshot（§2.5/§2.6 行为逐字节不变，**2E 既有测试必须全绿不改语义**）。
- **组织线索 = `loaded.organizationId`**（实例配置即组织上下文；clue 非权威，由 provider 作答诚实性检查约束）。文件缺失/坏 → 线索缺失 → 组装 `unavailable`。

## 4. Authority Runtime 增可用性检查（`src/main/authority-runtime.ts`）

```ts
// SageAuthorityRuntime 增：
readonly checkAuthorizationAvailability: () => { readonly ok: true } | { readonly ok: false }
```

- 语义（retry 的最小可用性检查）：active session 存在 ∧ 会话时效窗口有效（`authenticatedAt ≤ now < expiresAt`）∧ policy `loaded` ∧ 策略时效窗口有效。
- 时效窗口比较按 kernel `isActive` 同规则在 runtime 内实现（kernel 零改动；登记为同规则的第二处拷贝，见 §11）。
- `now` 取 runtime 注入时钟（ISO UTC）。

## 5. Pipeline：retry 分支与 `CommandResult` 扩展

### 5.1 契约（`src/appservice/command-contracts.ts`）

```ts
export interface CommandAvailable {
  readonly correlation: string
  readonly availability: 'available'
}
export type CommandResult = CommandDenied | CommandAccepted | CommandAvailable
export type SageDispatchIntent = SageActionIntentV2 | { readonly type: 'retry' }

// CommandPipelinePorts 增：
/** retry 的最小可用性检查：undefined = 不可用（fail closed）。 */
readonly checkAuthorizationAvailability: () => { readonly ok: true } | undefined
```

### 5.2 管道（`src/appservice/command-pipeline.ts`）

retry 前置分支（在步骤 2 之前）：

```ts
if (intent.type === 'retry') {
  const availability = ports.checkAuthorizationAvailability()
  if (availability === undefined) {
    return denied(correlation, 'identity-policy', 'identity-unavailable', { retryable: true })
  }
  return { correlation, availability: 'available' }
}
```

- **行为变更（既有合同退场）**：retry 不再进入 `resolveIdentityPolicy`（序列断言：retry 的 port 调用序列 = 仅 `checkAuthorizationAvailability`）；原「retry 过 identity 后被 invalid-intent 拒绝」路径**删除**（旧测试 c14 改写为新 available 形状；c15 改写为 availability fail-closed → identity-unavailable retryable，产品面形状与旧行为一致）。
- 业务 intent 步骤 2 不变：`resolveIdentityPolicy` 返回 resolution 或 undefined（undefined → identity-unavailable @ identity-policy retryable；denied → policy-denied @ identity-policy）。

### 5.3 默认端口（`src/appservice/composition.ts`）

`PRODUCTION_FAIL_CLOSED_PORTS` 增 `checkAuthorizationAvailability: () => undefined`；export `PRODUCTION_FAIL_CLOSED_PORTS`（main 侧合并用）。`dispatch` 改为：

```ts
readonly dispatch: (intent: SageDispatchIntent) => Promise<Response>
// 实现：runCommand({ intent, correlation: randomUUID(), ports: options.commandPorts ?? PRODUCTION_FAIL_CLOSED_PORTS })
// 响应：serviceJson(result, 'code' in result && result.code === 'invalid-intent' ? 400 : 200)
```

## 6. 接线（main 侧）

### 6.1 `src/main/app-service.ts`（单一装配点）

```ts
export interface SageAppServiceOptions {
  readonly viewState: SageViewState
  readonly vault: TokenVault
  readonly adapter: OidcAdapter
  readonly fixtureProjection?: () => SageMatterViewState
  /** 授权路径装配（D.2A）；缺省 = 授权端口保持 fail-closed（unavailable-first）。 */
  readonly authority?: {
    readonly policyPath: string
    readonly readFileBytes: (absolutePath: string) => Buffer
    readonly now: () => string
  }
}
```

`authority` 存在时构造 `createSageAuthorityRuntime` 并组装：

```ts
resolveIdentityPolicy: ({ intent }) => {   // 业务 intent 路径（retry 已由 §5.2 前置分支处理）
  if (intent.type === 'retry') return undefined // 防御性（正常不可达）
  const session = vault.identitySession()
  const load = loadOrganizationPolicy({ policyPath, readFileBytes })
  const assembled = assembleAuthorizationRequest({
    intent,
    sessionRef: session?.sessionRef ?? null,
    organizationRef: load.kind === 'loaded' ? load.policy.organizationId : null,
  })
  if (assembled.kind === 'unavailable') return undefined            // → identity-unavailable
  if (assembled.kind === 'invalid') return Object.freeze({          // 本模块自构的稳定拒绝
    kind: 'denied' as const,
    code: 'invalid-request' as const,                                // 取自 kernel code union
    reason: 'The action type is not registered for authorization.',  // D.2A 自有文案（不复制 kernel 映射）
  })                                                                 // → 产品面 policy-denied（§8）
  return runtime.resolve(assembled.request)
},
checkAuthorizationAvailability: () => runtime.checkAuthorizationAvailability().ok ? { ok: true } : undefined,
```

合并：`ports = { ...PRODUCTION_FAIL_CLOSED_PORTS, resolveIdentityPolicy: real, checkAuthorizationAvailability: real }`（步骤 3–10 保持 fail-closed）。

### 6.2 `src/main/index.ts` 与窗口 probe

- `main/index.ts`：`createSageAppServiceProviders` 增传 `authority: { policyPath: paths.organizationPolicyFile, readFileBytes: (p) => readFileSync(p), now: () => new Date().toISOString() }`（2E 遗留 main 接线落地；`readFileSync` 新增导入）。
- 窗口 probe（`test/support/sage-fixture-projection-probe.mjs`）：同步构造选项（其 retry 断言保持绿色：未登录 + 无 policy → `identity-unavailable` @ identity-policy，形状不变）。其余测试构造点无 `authority` → fail-closed 默认，行为不变。

## 7. Route 与 Renderer

- **`src/appservice/route-skeleton.ts`**：`parseIntent` 接受 `{type:'retry'}` 或 `parseSageActionIntentV2` 全形（复用 0.2 既有 exact parser）；成功 → `deps.providers.dispatch(intent)`；失败 → 400 invalid-intent（既有响应）。content-type / body budget 门不变。
- **`src/product/renderer.ts`**：retry 处理器简化为「POST `{type:'retry'}` → `void refresh()`」——不再解析 retry 响应体渲染（`refresh()` 为既有收敛轮询函数；网络失败仍 `render(fallback())`）。

## 8. 失败矩阵（产品面）

| 场景 | 结果 |
| --- | --- |
| retry：未登录 / 会话过期 / policy 缺失·坏·过期 | `identity-unavailable` @ identity-policy（retryable），200 |
| retry：全部健康 | `{correlation, availability:'available'}`，200 |
| 业务 intent：未登录 / 线索缺失（policy 文件不可用） | `identity-unavailable` @ identity-policy（retryable） |
| 业务 intent：actionType 未登记 | `policy-denied` @ identity-policy（组装 `invalid` → `denied('invalid-request')`；不泄漏动作存在性，登记语义） |
| 业务 intent：真实求值拒绝 | `policy-denied` @ identity-policy（真实 policy 驱动） |
| 业务 intent：步骤 2 通过 | 链在步骤 3 起如实 fail-closed（`identity-unavailable` @ rehydrate，retryable）——本票真实前进量 |
| 业务 intent：形状非法 | 400 `invalid-intent` @ intent（不变） |

## 9. 文件结构

```text
apps/sage-shell/src/main/action-authority-table.ts   # 新增：v1 动作表（冻结）
apps/sage-shell/src/main/authorization-assembly.ts    # 新增：纯组装内核
apps/sage-shell/src/main/organization-policy.ts       # 重构：导出 loadOrganizationPolicy（行为不变）
apps/sage-shell/src/main/authority-runtime.ts         # 增 checkAuthorizationAvailability
apps/sage-shell/src/main/app-service.ts               # 授权端口装配（options.authority）
apps/sage-shell/src/main/index.ts                     # 传 authority 选项
apps/sage-shell/src/appservice/command-contracts.ts   # CommandAvailable / SageDispatchIntent / 新端口
apps/sage-shell/src/appservice/command-pipeline.ts    # retry 前置分支
apps/sage-shell/src/appservice/composition.ts         # dispatch(intent) / 端口合并 / export fail-closed
apps/sage-shell/src/appservice/contracts.ts           # ServiceProviders.dispatch 签名
apps/sage-shell/src/appservice/route-skeleton.ts      # 全形 intent 解析 + 传递
apps/sage-shell/src/product/renderer.ts               # retry 处理器简化
apps/sage-shell/test/authorization-assembly.spec.ts   # 新增（含表条目断言）
apps/sage-shell/test/command-pipeline.spec.ts         # 更新 retry 两用例 + available 形状
apps/sage-shell/test/appservice-route-fixture.spec.ts # 更新 dispatch 调用 + 业务 intent 路由用例
apps/sage-shell/test/appservice-authorization.spec.ts # 新增（main 级集成，§8 矩阵）
apps/sage-shell/test/organization-policy.spec.ts      # 增 load 直测（既有用例不动）
apps/sage-shell/test/authority-runtime.spec.ts        # 增 availability 组合
apps/sage-shell/test/support/sage-fixture-projection-probe.mjs  # 构造选项同步
```

## 10. 测试与验收

1. **unit**：组装矩阵（命中 / 未登记 / 无 session / 无线索；sessionRef+组织线索传递逐字段）+ 表条目手写断言（值、冻结、仅一条）；`loadOrganizationPolicy` 三分（loaded/unavailable/invalid）；`checkAuthorizationAvailability` 组合（未登录 / 会话过期 / 无 policy / policy 过期 / policy 坏 / 健康）。
2. **pipeline**：retry 前置分支（available 形状；fail-closed → denied identity-unavailable retryable；**序列断言：retry 不再调用 resolveIdentityPolicy**）；业务 intent 步骤 2 路径不变；route 级断言 retry 的 available JSON 响应形状（含 correlation）。
3. **route**：全形业务 intent 接受并传递给 dispatch（spy）；非法形状 400 不变；retry 仍 200。
4. **main 级集成**（`appservice-authorization.spec.ts`：真 vault + 真 policy 文件（tmp）+ 真 runtime + `createSageAppServiceProviders`）：§8 矩阵逐行（含步骤 2 通过后 step-3 fail-closed 的 stage 断言；policy 无 grant → policy-denied；**线索来源断言**：请求携带的 `requestedOrganizationRef` 等于文件 `organizationId`——生产组装下线索与 policy 同源，`policy-organization-mismatch` 经生产路径不可达（诚实登记；其内核语义由 2D 用例覆盖））。零写入断言（policy 只读）。
5. **既有回归**：organization-policy / authority-runtime / route-fixture / oidc 链、窗口 probe 全绿；smoke；`pnpm run gate` 25/25。
6. **变异 ≥4**：M1 组装对未登记动作放行（提供 default entry）→ 集成红；M2 availability 漏会话时效窗口 → runtime 组合红；M3 retry 前置分支删除（回退进 resolveIdentityPolicy）→ pipeline 序列/形状红；M4 组织线索硬编码错误 org → 集成 mismatch 红。
7. **可选 live 验收**：应用登录后经 CDP `fetch('/.sage/actions')` 发业务 intent 与 retry，观察真实结论（你点登录；无 policy 时如实 identity-unavailable）。
8. 收口：Note（`docs/notes/implemented/architecture/2026-10-02-wt02d2a-authorization-path.md`，含更新后的操作者样例：`start-attempt` 表条目 ↔ policy grant 对齐）+ ADR-0190 + README + ledger；feat + docs 两提交推送。

## 11. 边界与遗留

- **不做**：步骤 3–10 真 port、B.3、C2D.2、C2E.1/.2、C3 其余、数据治理、idempotency / cancel / reconciliation、多 capability / 多业务域、UI 提交函数、projection read policy、`answer-clarification` 入表。
- **遗留登记**：① 组装 `invalid` → `policy-denied` 的语义（未来若需区分可增稳定 code，须独立裁决）；② intent `actionScope`（matter|revision）未参与组装；③ 动作表升级形态（配置文件 / Registry 融合）；④ retry 可用性检查的时效窗口规则与 kernel 同规则拷贝两处（kernel / runtime），未来收敛；⑤ 操作者样例在 Note 更新后，2E Note 历史样例保持为格式记录；⑥ `policy-organization-mismatch` 经生产组装路径不可达（线索与 policy 同源），其语义由内核层维持、待多组织语境重新启用。
