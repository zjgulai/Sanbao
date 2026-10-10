# 首页耐用事项创建：Sage 自有权威存储成为真实托管方（T04）

- 日期：2026-10-10
- 决策：[ADR-0274](../../../adr/ADR-0274.md)
- 状态：已实施（主链前置范围内的托管接线与验收）；真实登录链（T02）与 T05/T06 按各自票据。

## Problem

T04 的验收要求「真实 createMatter custody 与 idempotency receipt 落地；新进程可读回已受理事实」，而在此之前生产里没有托管方：`runCommand` 的创建分支永远停在 `persistence-unavailable@create`（`createMatter` 端口缺席），`reconcileDraftCreation` 在 index 里是恒答 `custodian-query-unavailable` 的占位。ADR-0201 曾否决「自造本地托管」，其前提是托管被设想为一个外部服务；当 Sage 自有桌面主链确立（ADR-0161：Sage 拥有权威库、main 是唯一正常写入口、创建只接受 `not-exists`；ADR-0200：同一库已是步骤 3 的真实读 provider）后，产品内已无其他托管候选，且创建不落同一库会让 matter 列表（源自草案 receipt）与步骤 3 读永久空转，T05/T06 无限期 blocked。用户裁决：托管方落在 Sage 自有权威存储。

## Decision

1. **托管模块**：新增 main-owned `src/main/matter-custody.ts`。创建 = `not-exists` 单事务批次 append 两事件——`matter-created`（goal、responsibleParty=草案责任方文本）+ 首个 `revision-entered`（`revision:1`；scope=交付物＋可选项目＋已勾选前史；`permissionBoundary`/`dataDestination` 记为创建时未声明/本机数据根；证据=草案确认自身、状态 `insufficient`；actionPolicies 为空——在补证据/政策的新修订前不可运行）。
2. **身份与幂等**：正式身份从服务签发 correlation 派生——`matterId=matter:<correlation>`、`revisionId=revision:1`、`appendId=draft-conversion:<correlation>`；重复调用由 store 的 append 指纹幂等（`replayed`）结算；冲突类结果必须经流内证明（load 比对 creation eventId 与 goal）才可回执，否则 `{unknown:true}`。
3. **结果映射**：`appended/replayed/证明的冲突 → {receiptRef}`；`commit-unknown → {unknown:true}`（outcome-unknown，不可重试）；`storage-busy/invalid-request/断言式拒绝 → {denied:'custody-unavailable'}`；打不开/已关闭/`blocked → undefined`（provider 不可用）。
4. **reconcile**：按 correlation 派生正式 id 后 `load`——已证明 → `settled`；`not-found` → `unknown`（ADR-0211 D3「查不到仍未知」）；存储不可用 → `unknown/'custodian-query-unavailable'`。index 的占位查询退场。
5. **接线与门禁**：app-service 在 `createAuthorizationCommandPorts` 以显式 options-gated 合并 `createMatter`；index 构造 `matterCustody`（与 rehydrate 同序创建、`will-quit` 双关闭）并接线 createMatter 与 reconcileDraftCreation。route-authority 门禁新增 custody 源码事实位（index 构造与两条接线、显式合并、not-exists/appendId/派生/`commit-unknown→unknown`/不可观测查询保持 unknown、占位码不得在 index）＋六条具名突变；matrix 的 `draft/convert`、`draft/reconcile` 行 `runtimeLevel` 同步改述（合规分类与计数不变）。

## Alternatives considered

- 维持 ADR-0201 原样（等待外部服务）：产品内无该服务，主链无限期 blocked（详见 ADR-0274 备选表）。
- fixture 级「创建」验收：把替身冒充真实 custody，属本仓反复禁止的失真（P-01/P-02 家族）。
- 由 renderer 或 Host 落库：违反 ADR-0161「main 是唯一正常写入口」。
- 用草案 id 当正式 matterId：renderer 侧候选不是托管身份。
- 冲突结果直接回新回执：未证明字节同一就可能把别次/他人的提交当成本次成果。
- 创建修订标 `supported` 证据以便立即运行：草案确认不是已观察证据，是假话。

## Consequences

- 首页确认转换第一次有真实终态：成功 = 权威库中两条事件 + 草案上的 receipt；未登录/策略拒绝零写入；`unknown` 只留核对（不重复建项）。
- 创建修订带 `insufficient` 证据、不带 actionPolicies：事项在补证据/政策的新修订前不可运行——诚实起点，不是缺省。
- 步骤 3 读与创建写共享同一权威库：新进程可读回已受理事实；草案列表 receipt、会话（T05）挂载与 rehydrate 三者闭环。
- route-authority 门禁以源码事实持续锁住接线：占位查询回潮、合并降级、append 语义漂移（`not-exists`→`exact`、`commit-unknown`→回执）都会具名红。
- T04 完成不推进 206 矩阵（0 行 owner）；真实登录链、T05/T06 与 DMG-06 按各自票据验收。T04 不改视觉 / IA、依赖或 lockfile。

## Verification

证据（2026-10-10）：门禁自测 `node --test scripts/gates/sage-route-authority.test.mjs` 37/37（新增 `the home-page custodian cannot drift from its scope-bound wiring facts` 六条具名红：unwire createMatter、占位查询回潮、合并降级、`not-exists`→`exact`、`commit-unknown`→回执、不可观测查询被结算）；`apps/sage-shell` typecheck 0；聚焦 8 文件 / 98 用例通过（含新 spec `matter-custody.spec.ts` 8/8——带第二个进程读回子场景——与 `draft-convert-custody.spec.ts` 5/5——路由级转换、确认消耗/过期/输入变化拒绝、identity 拒绝零写入、reconcile settled/unknown）；全量套件 201 文件 / 1833 通过 / 1 skip（exit 0）；`pnpm run gate` 32/32（objects 313/313，0 skip，退出码 0）。未运行：实机探针（托管边界由 production assembly 级路由 spec 与跨进程子进程覆盖；真实登录链探针属 T02/T05 前置）。
