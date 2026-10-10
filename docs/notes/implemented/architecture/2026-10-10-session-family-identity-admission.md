# 会话族真实 Identity 准入（T05 第一刀）

- 日期：2026-10-10
- 决策：[ADR-0275](../../../adr/ADR-0275.md)
- 状态：已实施（会话族准入第 4 步接真；链路其余步骤与首条真实消息仍未闭）。

## Problem

T05「首条真实消息」依赖「真实 runtime/Compatibility/Registry/Adapter authority」。会话族写路由在批次二/三已迁入十步 protected-effect 准入内核，但生产只装配前三步（caller/context/candidate）——identity 之后全缺、dispatch 被 composition 没收，所有会话效果恒 `protected-effect-unavailable`。第 4 步 Identity/Policy 是当前唯一可接真的步骤（命令管线已在用的 authority runtime：vault 会话 + 实例组织策略文件），但 `ACTION_AUTHORITY_TABLE` 只有 `start-attempt`/`create-matter` 两条——会话操作连可评估请求都无法组装。

## Decision

1. **登记 `session.send`**（`role:owner` / `session.send` / `session.prompt` / `external-write` / `requiresDecision:false`）：登记=让请求可评估，不是授权；放行仍取决于组织策略中的精确 grant。聊天是事项的基线工作，不做逐条决定门。
2. **装配共核**：`assembleSessionCoreAuthorizationRequest`（按操作名查同一张表）与既有 `assembleAuthorizationRequest`（按 actionType）共用核心，表不分裂。
3. **唯一适配器 `src/main/session-core-identity.ts`**：未登记操作**在任何策略读取之前**答 `unavailable`；无会话/策略不可读 → `unavailable`；非 authorized → `denied`；authorized → 不透明 `actorScopeRef`（issuer+handle+org 的域分离哈希，对 actor 稳定）与 `decisionRef`（逐次求值绑定策略摘要/角色/操作/action policy/时刻）。raw issuer/handle/organization 不出模块。
4. **options-gated 接线**：`createSessionCoreProtectedEffectPorts` 只在 `options.authority` 存在时合并该端口；登记只做 `session.send` 一条，其余十六个操作按各自票据逐条登记。
5. **门禁**：route-authority 新增五组源码事实（gated merge、条目与 scope、未登记先于读取、非 authorized→denied、assembly+kernel resolve）＋六条具名突变；计数与分类不变。

## Alternatives considered

- 维持全部未接：第 4 步是唯一可接真的步骤，继续空置等于 T05 第一刀无处可落。
- 一次登记全部十七个操作：per-operation 策略值是判断而非机械复制；批发登记会把没想清楚的 scope/effectClass 钉进表。
- 未登记答 `denied`：把"尚未声明"说成"策略拒绝"是假话。
- 连 target/compat/registry/persist/dispatch 一并接：中段 authority 官方路径装配仍 pending，且 dispatch 当前不可达——先接就是 P-04。
- 绕过准入直连 Host：违反 WT-02D 唯一编排入口。

## Consequences

- 已登记操作（session.send）的拒答阶段由 identity-policy 前移到 target；未登记操作保持停在 identity-policy。新增可观察码是 `protected-effect-denied`（grant 缺失/会话过期）；unavailable-family 码与零 prompt 调用不变。
- 「任一 authority 缺失时 prompt provider 调用为零」第一次有真实咬合（denied 与 not-ready 具名可分）。
- `actorScopeRef` 对 actor 稳定，可作后续幂等命名空间输入；`decisionRef` 逐次求值新鲜。
- 未闭：target/compatibility/registry/preflight/persist/dispatch、其余操作登记、真实登录与真机首条消息；T05 不因本刀标记完成。

## Verification

证据（2026-10-10）：门禁自测 `node --test scripts/gates/sage-route-authority.test.mjs` 38/38（新增 `the session-family identity step cannot drift from its gated wiring and registration facts` 六条具名红：ungate 合并、`session.send` 条目缺失、scope 漂移、未登记→denied 漂移、非 authorized→unavailable 漂移、kernel resolve 被替换）；`apps/sage-shell` typecheck 0；聚焦 8 文件 / 86 用例通过；全量套件 202 文件 / 1842 通过 / 1 skip（exit 0）；`pnpm run gate` 32/32（objects 313/313，0 skip，退出码 0）。关键新证据：`session-core-identity.spec.ts` 5/5（未登记零策略读取、无会话/无策略 unavailable、无精确 grant denied、不透明且 actor 稳定/求值新鲜的事实）；`protected-session-effects.spec.ts` +4 装配级（grant 齐备全链仍在 target 停住且策略被真实读取、缺 grant 具名 denied、无 authority 选项策略零读取、未登记操作零读取）。未运行：实机探针（准入拒答由装配级路由 spec 覆盖；真实登录链与真机首条消息属后续刀）。
