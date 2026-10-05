# Sanbao → Sage UI 一致性合同

> 2026-10-05 展示方向更正见 [ADR-0265](../adr/ADR-0265.md)：按用户明确要求受控复用 Sanbao 复刻桌面替换默认主界面；本文“只作证据、不复用组件”和旧首页选择保留为历史，业务 authority、数据治理与分层验收约束继续适用。

- 日期：2026-09-27
- 状态：UI-00 合同冻结；WT-02C.0 revision 11 已补充 Compatibility Authority 展示与输入边界；未进入 renderer、Application Service、Capability Adapter、Host 或 GUI 实施
- 决策依据：[ADR-0159](../adr/ADR-0159.md)、[ADR-0165](../adr/ADR-0165.md)
- 领域依据：[BusinessMatter 合同](2026-09-24-businessmatter-contract.md)
- 兼容性依据：[Compatibility Authority](../notes/proposed/architecture/2026-09-28-compatibility-authority.md)
- 机器可读台账：[Sanbao → Sage 状态映射](2026-09-27-sanbao-to-sage-ui-state-map.json)

## Problem

Sanbao 原型已经提供广泛的页面、状态、触发、退出和本地 fixture，但它仍是以 Qoder 观察为输入的独立 React 原型。Sage 当前 renderer 只提供 `ready / unavailable / recovering` 与 `retry`，`BusinessMatter` 领域核也尚未接入产品。若直接复制 Sanbao 源码、按页面数量迁移或把聊天完成态映射为事项完成，会同时制造第二套导航、第二套状态权威和虚假的运行时完成证明。

本合同回答五个问题：哪些 Sanbao 状态可作为输入、Sage 的产品主对象是什么、UI 状态由谁拥有、首个闭环如何切片、什么证据才允许声称一致性适配完成。

## Decision

1. **Sanbao 是只读交互证据，不是运行时依赖。** 不整仓复制、不以 `file:`、iframe 或 WebView 接入，不把其 URL 参数、React local state、fixture 或 product/research chrome 带入 Sage 权威状态。
2. **Sage 以经营事项为产品主对象。** 工作区、聊天、项目、浏览器、文件、自动化、Agent、Plugin 和模型都是事项能力或视图，不反过来拥有事项生命周期。
3. **业务状态只有一个权威来源。** 产品可见状态从 `BusinessMatter` projection 与明确的系统能力状态组合得出；artifact、流式输出、Host `ready` 或模型回复结束均不能单独形成 `completed`。
4. **UI 只消费 `ViewState`、提交 `ActionIntent`。** 后续实现必须经 Application Service 和唯一 Capability Adapter；renderer 不直接读取 Cordis、Host 私有事件、profile、凭据、数据库或上游 DOM，也不提交 compatibility outcome、matrix、execution snapshot 或 digest。
5. **首轮不原样采用任何 Sanbao 状态。** 13 个已观察候选记为 `adapt`；两个 `static-only` 组级占位记为 `defer`；其余 191 个状态默认 `defer-unreviewed`。`adopt=0`、`reject=0`，避免把结构相似误写成语义等价，也不在未评审前删除未来价值。
6. **UI-01 推荐 Sage-owned component renderer。** 对完整工作台而言，继续扩大字符串模板不可持续；React 是与现有原型组件模型相容的推荐实现方向。但 UI-00 不选择版本、bundler、测试栈，也不授权 dependency、package 或 lockfile 变更；这些必须在 UI-01 的显示范围中重新确认并留下相应 ADR/Note。

## Alternatives considered

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 复制 Sanbao 整仓作为 Sage frontend | 否决 | 外部脏工作树会成为出货依赖，并带入研究模式、Qoder 状态编号与 fixture 权威。 |
| iframe / WebView 嵌入原型 | 否决 | 会形成第二套导航、焦点、状态和安全边界。 |
| 重新启用 DSH/Qoder 上游 UI slot | 否决 | Sage 将失去产品表面、导航和状态所有权，违反 ADR-0159。 |
| 扩大当前无框架静态 renderer | 仅保留为 P0-2 状态页 | 适合 fail-closed 运行状态，不适合 206 状态规模、复杂焦点管理和可组合工作台。 |
| 一次性迁移 206 状态 | 否决 | 页面目录不是产品优先级；多数状态尚无 Sage 领域语义或可靠视觉证据。 |
| 先做首个经营事项闭环 | 采用 | 可以用领域事实验证 UI，而不是用页面数量制造完成感。 |

## Consequences

- Sanbao 的页面结构、trigger、exit/recovery 和局部视觉证据可以进入设计与测试；它们不能直接变成 Sage 业务状态或生产完成声明。
- UI-01 可以与 WT-02A.2 的存储工作并行准备设计内核，但真实交互接线必须等待 WT-02D 的 Application Service / projection / intent 合同。
- `P0-3B` 真实旧资料导入继续独立阻断；UI 开发不得借 fixture、旧 profile 或迁移数据绕过该门。
- P0-4 资产批准门仍独立有效。Sanbao 的 `--sb-*` 值只作设计证据，Sage 的可见 token 和品牌资产必须由 Sage 自有并通过来源、权属和可见面验收。
- 真实 OIDC 等待期间，UI-01 可以并行实现明确标记为 fixture 来源的 projection，并覆盖 `unknown`、`requires-new-revision` 与 blocked actionability；fixture/live 来源、compatibility outcome、authorization、availability 和 actionability 必须保持正交。这些状态只能证明 UI 合同，不得触发真实业务 mutation、插件调用或外部副作用。
- 当前合同不是 GUI、像素、Host、模型、工具、持久化、DMG 或生产验收。

## 1. 输入基线与对抗性审计

UI-00 将 Sage 仓根的兄弟输入 `../Sanbao/repository-snapshot/apps/sanbao-prototype` 解析为当前原型源：

| 项目 | UI-00 冻结值 | 允许的结论 |
| --- | --- | --- |
| 已提交基线 | `main == origin/main == 88831255d49d9cc4e340165178a3a1843fda9434` | 可定位已提交原型版本，不证明工作树干净。 |
| Catalog | `src/catalog-data.json`，SHA-256 `9eaf593a5bdc214ec0d938951e7aaa6859111823c361a2719c736210276398d3` | 该文件本轮无 Git 差异，可作为 59/206 目录输入。 |
| 目录读数 | 59 组、206 状态；123 observed、28 entry-observed、55 static-only | 证明目录结构与来源分类，不证明 Sage 或真实 Host 已实现。 |
| 运行时原型读数 | 123 runtime scenes、83 research details；当前与 HEAD 的 123 项 `IMPLEMENTED_OBSERVATIONS` 内容一致，SHA-256 `07be5f6cc4de71bd4306e7ecebf1af924eb8dde346214b0f6b0cc2785046a581` | 证明静态 observation 白名单未随当前 `app.tsx` dirty diff 漂移，不证明浏览器行为与发布态相同。 |
| 当前工作树 | 24 个 tracked 文件有差异，`+157/-90` | 全部隔离为候选；未经逐项审阅不得迁移。 |

关键反证：

- `QDR.P13.*` 是工作区创建，不是经营事项创建；只能借用表单节奏。
- `QDR.M01.reply.completed` 的“完成”是回复自然结束，不能映射为事项 `completed`。
- `QDR.S04.scope.unexpanded` 与 `QDR.S05.scope.unexpanded` 都是 `static-only` 组级占位，退出/恢复仍待核验，不能作为已观察交互。
- Catalog 中 206 条记录的 `implemented` 均为 `false`，而 123 个 runtime scene 由 `IMPLEMENTED_OBSERVATIONS` 与 observation ID 的交集另算。Sage 不继承这个双义字段，必须把证据、原型、运行时、视觉和 Host 接线状态分开记录。
- Sanbao 默认产品面、研究审计面和 reference capture 是不同证据层；研究编号和审计 chrome 不进入 Sage 产品界面。
- 当前 dirty diff 涉及 `app.tsx`、ReviewShell、多个页面和样式，可能改变产品模式呈现；UI-00 不把这些未提交字节纳入冻结基线。

## 2. 产品设计方向

### Purpose

Sage 是面向重复经营工作的 AgenticOS 工作台。首屏必须让用户看到当前经营事项、证据充分度、待决定动作、运行活动、候选产物和人工回执，而不是先看到营销介绍或通用聊天空页。

### Audience

- 运营执行者：先看当前阻断、下一动作和产物。
- 责任人 / 审批者：先看证据、revision、action scope、风险和决定期限。
- 管理者：先看事项进度、失败原因、责任归属和可验收结果。

### Tone

`dense + calm + evidence-first + operational`。界面应安静、可扫描、适合高频工作；不使用大面积 hero、装饰性渐变、嵌套卡片堆叠或把功能说明写进页面来代替清晰控件。

### Memorable detail

持续可见的“证据 → 决定 → 动作 → 产物 → 回执”脉络栏是 Sage 的标志性交互。它必须让用户能追问每个状态的来源、批准者、执行身份、失败 attempt 和验收回执。

### Visual constraints

- 先定义 semantic roles，再选择字面颜色；品牌强调色不能替代 success/warning/danger 等状态色。
- 支持浅色、深色和系统跟随的方向，但 UI-00 不冻结未批准的 literal palette。
- 密度、间距、字号、圆角、边框、focus ring 和 motion 由 Sage 单一 token owner 提供；不得同时消费 `--sb-*` 和另一套 Sage token。
- 动效只用于解释状态转移；必须支持 `prefers-reduced-motion`。
- 桌面窄宽时先将右侧脉络栏收成可恢复抽屉，再折叠左侧导航；中央事项对象始终保持主区。

## 3. 信息架构

```text
┌──────────────┬────────────────────────────────┬─────────────────────┐
│ 左侧导航      │ 经营事项主区                    │ 证据与执行脉络栏      │
│              │                                │                     │
│ 经营事项      │ 事项身份 / revision / 责任角色   │ 证据                │
│ 搜索          │ 当前阻断或决定检查点             │ 决定与审批           │
│ 自动化        │ 活动时间线 / 输出 / 澄清          │ Tool 活动            │
│ 知识          │                                │ 产物与回执           │
│ 能力          │ Action Composer                │ 失败与重试           │
│ 设置          │                                │                     │
└──────────────┴────────────────────────────────┴─────────────────────┘
```

- **左侧导航**只负责跨对象导航，不保存业务状态。
- **主区**只呈现当前 Matter projection、可执行动作和受控输入。
- **右侧脉络栏**按事实类型分层，但保持同一时间线和身份坐标。
- **Action Composer**不是纯聊天框；根据 projection 显示补证、回答澄清、批准/拒绝、发起运行、停止、重试、接受/驳回回执等合法意图。
- Plugin、Agent、Model 和 Tool 作为能力选择与执行身份出现，不成为顶层产品主对象。

## 4. 首闭环状态处置

机器可读逐条记录见[状态映射](2026-09-27-sanbao-to-sage-ui-state-map.json)。首轮统计：

| 处置 | 数量 | 含义 |
| --- | ---: | --- |
| `adopt` | 0 | 没有任何状态在结构和领域语义上可原样采用。 |
| `adapt` | 13 | 已观察结构可参考，但必须改为经营事项语义并接真实 projection。 |
| `defer` | 193 | 2 个来源未核验的核心占位 + 191 个首闭环外未评审状态。 |
| `reject` | 0 | UI-00 不在未评审前永久丢弃候选。 |

六个首闭环族：

1. `matter-create`：创建事项、目标、责任角色和成功判据。
2. `evidence-clarification`：证据、显式未知、澄清问题和新 revision。
3. `attempt-running`：执行身份、动作范围、活动摘要、流式输出和停止。
4. `decision-approval`：精确绑定 revision/actionScope 的批准、拒绝、撤回和过期；Sanbao 来源尚不足，Sage 自主设计。
5. `artifact-receipt`：候选产物、预览、责任人接受/驳回；回复结束或 artifact 存在都不是完成。
6. `failure-retry`：失败事实、复核和新 attempt；Sanbao 队列组尚不足以定义领域合同。

每条后续迁移记录至少分开五个维度：`evidenceStatus`、`prototypeStatus`、`runtimeAvailability`、`visualAcceptance`、`hostIntegrationStatus`。任何一个维度通过都不能自动抬升其他维度；尤其不能把本地 fixture 可运行写成真实 Harness 能力或视觉通过。

## 5. ViewState 与 ActionIntent 边界

UI-00 只固定责任，不定义最终 TypeScript shape。WT-02D 必须至少表达：

### ViewState

- Matter identity、当前 revision、阶段和责任角色。
- 证据、未知、依赖和可用选项的安全投影。
- 当前/历史 attempt、经安全投影的执行身份摘要、兼容结论、稳定 denial reason code、缺失证据类别、是否需要新 revision，以及 compatibility 与 availability 的不同状态；不得暴露 secret、原始插件配置或把 Host ready 显示成 compatible。
- 待处理 decision 的 `revisionId + actionScope + status + expiry`。
- artifact 与 receipt 分离的列表和当前待验收对象。
- 能力层的 unavailable/recovering/queue/tool failure 等系统状态；不得覆盖领域状态。
- 当前合法 actions 与每个禁用动作的可解释原因。

### ActionIntent

- 创建事项、进入新证据 revision、回答澄清。
- 提交批准、拒绝或撤回决定。
- 启动/停止 attempt、复核后重试。
- 打开产物、接受或驳回回执。
- 重试能力连接，但不得把 `retry` 当成业务重试。

UI 不得提交任意领域事件、伪造 completed、直接写 projection 或通过 route/query 参数越过 decision/policy。

### Compatibility projection 与输入禁区

UI 只能读取由 WT-02D Application Service 投影的兼容性状态，不直接调用 Compatibility Resolver、Runtime Inventory Provider、Host 或插件 inventory。公开 projection 至少正交表达：

- `compatibilityOutcome`：`equivalent | requires-new-revision | unknown`。`equivalent` 只表示受信 target、inventory 与 immutable matrix 唯一精确命中，仍不表示当前登录、decision、availability 或 capability preflight 已通过；`requires-new-revision` 不允许前端修改 target 或降级继续；`unknown` 默认禁用真实 action。
- `projectionSource`：`fixture | live`。fixture 必须有持续可见的开发标记，只用于 UI 行为验证，不进入生产完成证据；它可以承载任一 compatibility outcome，不能与 `unknown` 或 blocked 互斥。
- `authorizationState`、`availabilityState` 与 `actionability / denialReason`：分别表达当前权限、当前服务健康和某个动作能否执行；不得从 compatibility outcome 反推。

renderer、插件、Host 和模型不得提交或覆盖：`outcome`、`matrixId`、`reason`、`executionSnapshot`、`targetDigest`、`inventoryDigest` 或任意“兼容 / 安全 / 只读”布尔值。Capability、Agent、Model 和 Tool 的显示顺序、选择偏好或可见性也不能反向成为 compatibility authority。

## 6. 执行顺序与 handoff

```text
UI-00 合同冻结（本文件）
  ├─ UI-01：Sage 设计内核与 component renderer（fixture / blocked projection 可并行）
  ├─ WT-02A.2：独立事件存储
  └─ WT-02C.1 / 2A～2D / 3：纯 resolver、可信 inventory、Capability Registry 与 evaluation evidence
             ↓
WT-02D：Application Service + ViewState / ActionIntent
             ↓
UI-02：经营事项首个真实垂直闭环
             ↓
UI-03：Capability/Host 事件与失败恢复
             ↓
UI-04：Electron GUI、视觉、无障碍与产品 E2E

P0-3B：全程保持独立阻断
```

### UI-01 开工前必须重新确认

- UI-00 审计时 `.birdview/architecture.json` 的 revision 11 仅为 schema-valid；现场该文件现为 revision 13，但仍带 legacy `project.id` / `mapId`，且未按 UI-01 当前源码重新审计，仍不能宣称 architecture-current。UI-01 开工前必须选择或更新 Sage-owned map，补入 `business-matter-codec.ts`、strict rehydration 与对应测试的 ownership，移除“strict rehydration 尚未创建”的陈旧问题，并明确保留或迁移历史活动关联的方式。
- 选择 React 及具体版本，或给出不采用 React 的同等可维护方案。
- 列出 renderer 构建工具、package/lockfile、CSP/asset loading 和测试环境的精确文件范围。
- 展示现有 `renderSageDocument()` 如何迁移且保留 fail-closed 状态页和 `/.sage/*` 安全合同。
- 固定 token owner、主题策略、基础组件清单和 fixture 边界。
- fixture 必须通过独立 `projectionSource` 显式标记；`compatibilityOutcome` 至少覆盖 `unknown / requires-new-revision / equivalent`，blocked 由独立 actionability / denial reason 表达，且不得从 Host ready、plugin enabled、工具数量或 package version 推导 `equivalent`。
- 先给 Birdview 文件级计划，再修改产品源码；不得沿用 UI-00 的文档授权推定代码授权。

UI-01 的最小可验证切片限定为：一个 Sage-owned 经营事项工作台、六个只读阶段 fixture（`created / evidence / clarification / running / artifact-receipt / failed-retry`）、三栏信息架构、一个 semantic token owner、零个真实业务写入。允许 tab、drawer、theme、focus、Escape 与窄宽恢复等界面级交互；创建事项、批准/拒绝、启动/停止/重试 attempt、接受/驳回 receipt 等真实 `ActionIntent` 必须等待 WT-02D 合同，不得先发明组件内部临时命令。

### WT-02D / UI-02 交接条件

- Application Service 是 command 与 projection 的唯一产品入口。
- UI fixture 与真实 projection 使用同一公开 ViewState shape，但 fixture 必须显式标记且不能进入生产完成证据。
- UI 只能提交 `ActionIntent`；target、inventory、matrix 与 resolution 分别由 ADR-0165 指定的受信 owner 生成，Application Service 只负责固定顺序编排并把受信 resolution 转换为领域 execution snapshot，任何一项都不能由 renderer 或插件提交。
- 领域失败、能力不可用、Host 生命周期和网络/模型状态保持不同错误分类。
- P0-3B、真实旧 profile 和用户数据不作为 UI 联调输入。

## 7. 验收矩阵

| 验收层 | 必须证明 | 不能替代为 |
| --- | --- | --- |
| UI-00 来源 | commit、catalog hash、59/206、sourceKind、dirty 边界、状态映射分母一致 | README 描述或历史截图 |
| 设计系统 | 单一 token owner、双主题、focus、reduced motion、窄宽恢复 | 一张漂亮截图 |
| 状态语义 | ViewState 来自 projection，合法 actions 与禁用原因一致 | URL 参数或组件 `useState` |
| 兼容性状态 | `compatibilityOutcome`、`projectionSource`、authorization、availability 与 actionability / denial reason 正交；renderer 无 authority 输入面 | Host ready、插件 enabled、工具可见、package version，或把 fixture 当 outcome |
| 领域闭环 | 创建→证据→澄清/审批→运行→产物→人工回执，失败/重试保留历史 | 模型回复结束或 artifact 存在 |
| 能力接线 | Application Service / Adapter 的成功、不可用、恢复、工具失败和取消 | Host 进程启动或 `ready` |
| 可访问性 | 键盘、焦点进入/返回、Escape、ARIA、对比度、文字缩放 | 鼠标路径可点 |
| 视觉一致性 | 固定主题、窗口、内容和字体条件的 component/page screenshot 基线及人工复核 | Sanbao 页面相似或局部像素图 |
| GUI / 产品 E2E | 隔离 Sage 数据根中的真实 Electron 路径与人工回执 | typecheck/test/build 或静态 preview |
| 发布 | 品牌、资产权属、Bundle ID、签名、公证、DMG 与迁移独立验收 | UI-00～UI-04 任一局部通过 |

## 8. UI-00 完成定义与非声明

UI-00 只有在以下项目同时成立时完成：

- Sanbao catalog 当前读数通过交互合同检查。
- 机器可读映射中的显式 ID、sourceKind、触发/退出和处置与 catalog 一致。
- 处置统计严格满足 `0 + 13 + 193 + 0 = 206`，且显式 15 + 默认 191 = 206。
- Sage 文档链接、Birdview 活动和 quick gate 在当前工作树验证。
- Git 复核证明没有修改 product/adapter/Host/domain/persistence/profile/package/lockfile 或 Sanbao 源仓。

UI-00 完成不表示 React、页面、设计 token、Application Service、Adapter、Host、SQLite、GUI、像素一致性、真实 Harness 能力、P0-3B、DMG 或生产完成。
