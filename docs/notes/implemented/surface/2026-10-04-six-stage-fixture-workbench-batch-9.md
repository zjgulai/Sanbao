# UI-FIXTURE-01：六阶段只读 fixture 工作台

- 日期：2026-10-04
- 状态：implemented locally, not committed
- 对应决策：[ADR-0256](../../../adr/ADR-0256.md)
- 范围：UI-FIXTURE-01 / UI 接线第九批

## Problem

UI-IA-01 已把 `BusinessMatter` 设为默认首屏，并建立左语境 / 中事项 / 右脉络的只读工作台，但本地 fixture 仍只有一张 `clarification` 快照。调用方即使给出其他阶段也会落回同一状态，工作台没有当前阶段轨道，因而无法用真实 wire 重复核对创建、证据、澄清、运行、产物待回执与失败重试六种状态。

这还留下两个容易假绿的缺口：

1. 单态 fixture 不能证明同一 `sage.matter-view.v1` shape 在跨阶段重绘时会清掉上一态的澄清、决定、尝试、产物、回执和动作预览；
2. production 缺 fixture / read authority 时，`/.sage/state` 合法返回 `projection-read-unavailable / read-policy` typed denial，但真实 renderer 曾把这类 non-aggregate refusal 误标为 malformed `invalid`，把“未接线”说成“格式损坏”。

Sanbao / Qoder 在本批仍只是状态与注意力组织的证据输入；不能复制产品壳、接入 runtime，或用阶段轨道冒充真实事项已经推进。

## Decision

### D1 · 六态共享一个公开 ViewState 合同

公开冻结 exact token：`created / evidence / clarification / running / artifact-receipt / failed-retry`。`createSageFixtureViewState(stage = 'clarification')` 始终输出 `sage.matter-view.v1`、`projectionSource=fixture`、顶层与全部 actions 均为 `blocked / fixture-only`，并继续 deep-freeze 公开对象。

六态只表达以下可观察事实：

- `created`：事项已存在，但没有 revision、evidence、decision、attempt、artifact 或 receipt；
- `evidence`：有一条 revision 及 evidence / unknown / dependency；
- `clarification`：在证据事实之上有 pending clarification；
- `running`：有 approved decision 和独立 running attempt；
- `artifact-receipt`：有 succeeded attempt 与 artifact，但 receipt 为空且 conclusion 未定义；
- `failed-retry`：旧 failed attempt 与新的 retry attempt 使用不同 ID，两个失败事实都保留。

公开 shape 不包含 execution snapshot、matrix ID、digest、artifact locator、机器路径或 authority record。artifact、attempt 或回复自然结束都不能推出事项 completed。

### D2 · fixture stage 只由 main 的 exact env seam 选择

只有 `SAGE_FIXTURE_PROJECTION=1` 时，Electron main 才读取 `SAGE_FIXTURE_STAGE`。未提供 stage 时兼容既有行为，默认 `clarification`；空串、大小写别名、前后空白与未知 token 都不纠正、不猜测，直接不装配 fixture provider并 fail closed。

URL、hash、query、localStorage 与 renderer state 均没有业务 stage 选择权。真实窗口还会拒绝 query-bearing product document，并证明同页 history query 不会覆盖 env 选中的阶段。

### D3 · 阶段轨道只标当前态，所有重绘先清旧事实

当前事项卡增加固定顺序的六项只读阶段轨道。每项只有 `current` 或 `idle`：当前项使用 `aria-current=step`，其余为 `false`；不存在 `completed` 样式，也不把当前项左侧阶段渲染成已完成。

renderer 连续接收六态、`null`、malformed 与 live projection 时，会同步重算 current marker，并清掉不属于新 wire 的澄清、decision / attempt / artifact / receipt rows 与 action previews。轨道没有 input、提交按钮、`POST`、ActionIntent 或 provider 调用。

### D4 · typed unavailable 与 malformed 保持不同语义

renderer 只把 exact non-aggregate `{code:'projection-read-unavailable', stage:'read-policy', retryable:true, correlation}` 识别为正常 unavailable，并调用既有 unavailable 清场。真正 nested malformed、aggregate 缺 `matter` 或退休的 flat payload 仍按 invalid 拒绝显示；本批没有通过放宽 schema 判定换绿。

### D5 · 可见完成必须穿过真实 production wire

真实 Electron probe 逐态运行 production assembly、`/.sage/state`、公开 wire 与 renderer DOM，并核对 1440px 三栏、760px drawer / Escape / focus、200% zoom、当前阶段、trace ID、fixture badge、blocked previews、query 隔离和 Sage root 零写入。每张截图记录像素尺寸、PNG 字节数与 SHA-256；另用 canary 写入负控证明零写仪器会真实判红。

## Verification

- 合同 Red：3 个文件中 `8 failed / 4 passed`，另两套件在 collection 阶段因六态词表尚不存在而失败；非 `clarification` token 均退化为旧单态。
- renderer Red：`matter-projection-renderer` 的 10 项中 2 项失败，分别证明阶段轨道缺失、`created` 没有 current marker。
- 真实窗口 Red：六态已通过后仍为 `7 passed / 2 failed`；两项 production-null 负控发现 exact read-policy denial 被误标为 invalid。对应 Fake DOM 回归也先得到 `1 failed / 10 passed`。
- 聚焦 Green：六个合同 / renderer / UI-IA 文件合计 `67/67`；typed-denial 修复后的 renderer / UI-IA 邻接回归为 `18/18`。
- 真实 Electron Green：`1 file / 9 tests passed`。六态、unknown token、fixture switch off、1440px、760px、200% zoom、query 隔离、zero-write 与 canary 负控全部通过。
- 六态 1440px、760px drawer 与 unavailable 截图已逐张回看：仅当前阶段高亮；running 有一条 decision / running attempt；artifact-receipt 有 succeeded attempt / artifact 且 receipt 为 0；failed-retry 同时保留两个不同 ID 的 failed attempt；unavailable 无 fixture、active stage 或旧 trace 残留。
- `typecheck`、production `build` 与仓级 `git diff --check` 均通过；staged 与 package / lockfile diff 为空。
- 完整 Sage Shell suite 为 `179 files / 1564 passed / 1 skipped / 0 failed`；既有 1 项 skip 没有被本批改写为 pass。
- 根级 `test:gate` 为 `222/222`；quick gate 为 `27/27` gate units、`84/84` objects、0 skipped、0 failed；ADR 派生账本为 256 篇 ADR、135 篇有 decision block、121 篇历史豁免。
- Batch 9 BirdView architecture/activity validation 为 10 modules、13 relationships、最终事件数以 completed activity 为准，0 error、0 warning；渲染后的 changes / architecture / constraints 页面已人工复核。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 复制 Qoder / Sanbao 六张页面 | 否决。外部原型只提供语义证据，不是 Sage runtime 或产品壳。 |
| 为每个阶段定义一套不同 UI payload | 否决。会绕过同一公开 ViewState 合同，也无法证明真实 renderer 重绘。 |
| 允许 query / hash 选择 fixture | 否决。产品 URL 不拥有业务状态，且容易把截图开关带进 production。 |
| 把阶段轨道画成线性完成进度 | 否决。失败、重试、澄清与回执不是单向完成序列。 |
| artifact 出现后把 matter 设为 completed | 否决。只有独立 acceptance / receipt 事实才可能决定 conclusion。 |
| 所有非 aggregate response 都显示 unavailable | 否决。会把 malformed 或协议漂移伪装成正常未接线。 |
| 只用 Fake DOM 验收 | 否决。viewport、sticky/drawer、focus、zoom、真实协议 wire 与像素证据必须在 Electron 中验证。 |

## Consequences

- Sage 工作台现在可重复呈现六个只读事项阶段，并用同一公开 shape 显示各阶段精确事实；视觉上更接近 Qoder/Sanbao 的工作注意力结构，但不是其产品壳复制。
- 阶段轨道只表达“当前在哪里”，不表达此前全部完成；失败重试不会覆盖旧 attempt，artifact 不会冒充事项 completed。
- unknown stage、fixture switch off 和 production read-policy denial 都保持 unavailable-first；malformed 仍独立显示 invalid。
- 本批没有新增真实 mutation、ActionIntent、provider、Host bridge、持久化、dependency、package 或 lockfile，也不构成真实事项推进、production E2E 或完整 Qoder UI/UX 复刻完成。
- 改动保留在 `main` 工作区，未 stage、未 commit、未 push、未 merge、未发布。
