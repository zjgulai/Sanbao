---
title: 能力中枢与工作台整合（S0–S4 五阶段）
status: approved
date: 2026-09-19
---

# 能力中枢与工作台整合（S0–S4 五阶段）

> 本文是**已批准计划**。背景：对 DSH Desktop 当前主页（侧栏/中栏/右栏/对话框）与 Qoder CN
> 的布局、组件、分类管理、颜色风格做了全维度剖析对比后形成的整合方案。
> 剖析结论（三层合成 UI、五切片能力被入口行切碎、DOM 注入对基座 keyed slot 机制的重复实现）
> 见会话记录；本文只记录决策与执行细节，不重新论证取舍。
> 各阶段行为与安装契约的权威来源是包 README 与 ADR；本文负责**方案本身**。
> 每阶段收尾按 ADR-0015 补决策 Note，本文不预先占位。

## 0. 决策记录（已确认）

| # | 决策点 | 结论 |
|---|---|---|
| D1 | 推进范围 | **全量**：S1–S4 全部执行，排序为「先建新家再拆旧入口」 |
| D2 | 侧栏能力带收敛力度 | **激进收敛**：侧栏只留模式级入口，折叠组 L2 四行迁 panellist 或命令面板；系统带（知识库/深度研究）保留 |
| D3 | 主题预设 | **收缩到 3–4 套**：codex（绿系人格）/ graphite（中性）/ midnight（深蓝）+ 1 套定夺；其余标 legacy（不进预设墙，分享串可解析但提示迁移）；派生引擎不动 |
| D4 | 模态统一 | 凡模态一律 `<dialog showModal()>`；自管层号 CSS 变量进例外清单，只减不增 |
| D5 | 借鉴边界 | 只抄 Qoder 的**机制**（命令面板/卡片市场/模式-内容-能力三层导航观），不抄其皮；一切以 DSH slot 体系兼容为前提（不碰 shadows-shipped-ui、基座只 pin 不改、锚不钉哈希） |

## 1. 核心判断（方案的为什么，一段版）

当前主页是三层合成物：基座三栏 Grid → 官方 61 slot → LUTE 二开面（官方 slot 注册 + DOM 注入 +
主题 token 派生）。能力图谱被入口行切碎：技能/工具/岗位/产品/连接五个切片各有数据源、各有搜索框、
各有卡片语法，但没有任何统一调度面；且 workbench 三面板用自造 view-router + `centerCol` DOM 挂载，
重复实现了基座 `main` keyed slot 的既有机制。Qoder 的启示是：**模式（少而稳）→ 内容（对象列表）→
能力（可搜索调度面）三层分离**，命令面板是能力图谱变成肌肉记忆的核心机制。数据层（taxonomy-v3 +
business-meta + 岗位清单）已备好，缺的只是统一调度面与统一卡片语法。

## 2. 阶段定义

```text
S0  两项 spike（并行，纯验证零产品改动）
      ├─ S0a: main keyed slot 可用性验证 ← 决定 S3 走哪条路
      └─ S0b: 能力目录统一 schema ← S2 的数据地基
S1  设计系统地基（--lute-space/radius token + 共享原语层起步）
S2  能力中枢：命令面板（Cmd+K）＋ 扩展中心升级为能力卡片市场
S3  布局收敛：workbench 迁 main keyed slot ＋ 侧栏激进收敛（一步到位）
S4  收尾：主题 15→4 ＋ 模态统一 <dialog> ＋ hero 橱窗升级
```

排序逻辑：侧栏激进收敛的前置安全条件是能力先有新家——命令面板就是那个新家。
反序会让用户在迁移期「哪都找不到入口」。

### S0 · 两项 spike

**S0a · `main` keyed slot 可用性验证**（唯一可能推翻计划的点，最先做）

- 验证内容：当前 pin（runtime 0.1.2-rc.1 + Desktop ExtendedFrame）下，通过
  `ctx.slots.inject('main', ...)` 注册新 entryKey 面板是否可用。重点三问：
  1. ExtendedFrame（desktop extended 模式重新注册 root）是否透传 `main` 的 keyed 分发
     （`renderSlot('main', {}, { entryKey })` 路径）；
  2. `sidebar.panellist` 同 id 行是否联动 active 态；
  3. 列宽收缩策略（rightbar 先缩、CENTER_MIN 400）是否对新面板生效。
- 产出：结论 Note（可用/不可用 + 证据）；可用则附最小 spike 面板；不可用则 S3 降级
  为「锚点收敛 + view-router 规范化」，其余阶段不受影响。
- **结论（2026-09-19）：可用**。静态证据链与标准注册配方见
  [docs/research/14-main-keyed-slot-spike.md](../research/14-main-keyed-slot-spike.md)；
  运行时四路径冒烟（渲染/active/列宽/卸载回落）留作 S3 迁移首面板的验收门。

**S0b · 能力目录统一 schema**

- 现状五切片各有数据源：`dsh-overseas-skills` taxonomy-v3（222 技能）、
  `dsh-wanzh-hulian` business-meta（101 MCP 工具）、岗位矩阵清单、产品卡清单、连接注册表。
- 产出：统一 `CapabilityItem` 只读聚合视图的 schema 设计。**不改各家存储**（一份事实一个家，
  ADR-0009），只加聚合查询层。S2（命令面板）、S4（hero 橱窗）、扩展中心卡片市场三处共同消费。
- **结论（2026-09-19）：schema 定稿**。五切片盘点（含批判性评审四要点）、
  `CapabilityItem` / `CapabilityAction` 判别联合、聚合层架构（新包
  `dsh-capability-hub-local` 纯 client 读组合 + mapper 契约冻结 + COMPOSED_SOURCES 声明）、
  三个开放风险见 [docs/research/15-capability-catalog-sources.md](../research/15-capability-catalog-sources.md)。
  关键架构事实：五切片已全部走 loopback HTTP 只读通道，聚合层零 host 改动起步。

### S1 · 设计系统地基（与 S0 并行可开工）

1. `--lute-space-{1..5}` / `--lute-radius-{row,card,chip}` token 家族，进现有品牌 block
   同层体系。合规依据：自建 `--lute-*` 名字不违反「只用基座真实声明名」法则（那是
   `--dsw-*` 面的纪律；品牌 block 是仓库已示范的合法字面量之家）。
2. 共享原语起步：`PanelShell`（统一 header/body/footer 面板壳）、`CapabilityCard`
   （统一卡片语法）、`EmptyState`、`SearchRow`——走 `shared/` 同步分发机制
   （复用 sidebar-entry-core 三副本纪律，`scripts/sync-shared.mjs`）。
3. 验收：token 家族登记进 theme-tokens 门禁 baseline（只减不增语义延续到 `--lute-*` 面）；
   原语以 S2 为首个消费方，不做无消费方的预设计。

### S2 · 能力中枢（第一个用户可感知交付）

1. **命令面板**：挂 `shell.overlay`（帧级、additive、点击穿透的官方座位），Cmd/Ctrl+K
   唤起，fuzzy 搜 S0b 目录一切能力——技能执行、岗位预填、产品开卡、系统打开、连接跳转。
   执行动作复用既有通道（`dsh:view-change`、`setDraft` 预填等）。
   > 2026-09-19 修订：原文列的 `dsh:skill-execute` 已删——实测全仓 + 基座**零听者**；
   > 交付通道统一为共享 `deliverPrompt`，`open-panel` 改走 `selectPanel` + 同源 key 探测
   > （[ADR-0130](../adr/ADR-0130.md) D6）。
2. **扩展中心升级**：三形态 Tab（技能包/MCP/应用扩展）统一为能力卡片市场语法
   （S1 的 CapabilityCard），空态/搜索/徽标统一。
3. 键盘导航 + ARIA 完整（全产品最高频交互，可达性一步到位）。
4. 验收：`pnpm run gate` + 真实浏览器验收（空搜索/长列表/执行失败自报三路径）；
   ADR + Note。

### S3 · 布局收敛（激进，但有安全网）

前置：S2 已上线，能力有新家。

**S3 前基线快照（2026-09-19 冒烟实测，迁移后按此做差）**：

- 启动三件套：0 recovery attempt / 0 watchdog / 渲染 CPU 0.0% / `health-commit → healthy`（9.56s）。
- 侧栏导航行（文本序）：路特创新AgenticOS · 新会话 · 新应用 · 工作台 · 扩展中心99+ ·
  岗位矩阵50 · 展开其余 31 个会话 · 深度研究 · 手机连接 · 知识库 · 设置。
- DOM 注入面计数：`data-dsh-workbench-group`=1、`data-dsh-workbench-container`=1、
  `data-lute-navrow`=1、`sidebar.footer.action` 槽=1；`style[data-lute-tokens]`=1。
- 面板功能冒烟：Cmd+K 打开 42 条（技能 10/岗位 10/产品 2/系统 10/工具 10），Esc 关闭，
  零 console 错误、零本包告警。
- **S3 的验收差**：`workbench-group`/`workbench-container` 计数归 0；「扩展中心/岗位矩阵」
  从 DOM 注入组消失、改由 `sidebar.panellist` 渲染（active 态随 `usePanelInfo` 联动）；
  面板与三件套读数不变。

**S3.1 已完成（2026-09-19，技能中心 = 模式验证）**：决策 [ADR-0130](../adr/ADR-0130.md)、
读数 [Note](../notes/implemented/surface/2026-09-19-skill-center-keyed-slot.md)。实测差：
注入行 `[data-dsh-skill-center-entry]` 1 → **0**；`sidebar.panellist` 官方行 0 → **1**
（徽标 `99+` 保留、`aria-current="page"` 官方 active 态、收起 rail 官方 36×36 且徽标让位）；
面板祖先链 `panelPage → centerCol → frame`，**零** fixed/高层号祖先（层号魔数 2147482000
与入场动画一并删除）；退出后 composer 几何逐字复位（x296 y389 w610 h52）；三件套
`runId b9df35a5` / 9420ms / healthy / 0 recovery / 0 watchdog / 渲染 CPU 0.0–0.1%；
命令面板 42 条未回归；`sidebar-row-axis` REGISTRY 3 行 → 2 行（自测 fixture 同步同形，
突变用例改指剩余注入行，射程不减）。折叠组计数仍为 1（**S3.3** 才归 0）。

S3.1 撞到、spike 未预料的两件事（后续两步照此检查）：

- **退出路径不止一条**：卡片「执行」仍广播已无听者的 `dsh:view-change`(chat)，结果是
  提示词交付了、面板还盖着中心列。迁移一个面必须把**所有**「回到会话」动作找出来改走
  `onExit`——这类路径在组件层深处以事件广播形式存在，读代码数不干净，只能实机点一遍。
- **门禁清单与它的反向自测是两份事实**：摘 REGISTRY 行而不改 fixture，红字会指向一个
  已经不存在的行（「未登记的注入行」）。两步必须同一次提交。

**S3.2 / S3.3 的已知断点**（迁移前先看）：技能中心里两处「打开工作台 / 打开应用」仍广播
`view:'applications'`，其听者是 newapp 的 `panel-mount`——newapp 一迁就断，S3.2 必须同时
改这两处与能力中枢 dispatcher 的 `open-panel`（ADR-0128 后果 #3 承诺过换成 `selectPanel`）；
岗位矩阵的 `sidebar-entry-core.ts` 副本里同样有 `view-change` 听者，S3.3 一并处置。

1. **workbench 三面板迁 `main` keyed slot**（前提 S0a 通过）：删 `centerCol`
   querySelector 挂载、删 view-router 自造事件总线（`dsh:view-change` 收敛为面板激活）、
   侧栏行改走 `sidebar.panellist`。
2. **侧栏激进收敛**：`mountSidebarGroup` 折叠组 L2 四行退出侧栏 → 任务板/SSH/扩展中心/
   岗位矩阵迁 panellist（官方 active 态联动）或命令面板；系统带保留（知识库/深度研究是
   低频模式级入口，符合三层导航观）。
3. **DOM 注入面只减不增**：mountSidebarGroup 整条退役；sidebar-entry-core 保留但射程
   收窄（新应用行去留视 S0a 结果定）。退役机制同步更新 `scripts/gates/sidebar-row-axis.mjs`
   射程声明。
4. **风险与回滚**：DOM 注入是黑屏事故（P-52）后刚根治的稳定态，拆除有回归风险——本阶段
   单独成批提交，每步保留「回到 DOM 注入」的还原点；验收除 gate 外跑重启冒烟三件套
   （重试计数 attempt=1、看门狗零告警、CPU 归零）。

### S4 · 视觉收尾

1. **主题 15→4**：保留 codex/graphite/midnight + 1 套；其余标 legacy：不进预设墙、分享串
   可解析但解析出提示迁移。派生引擎与 token 白名单不动——收缩的是暴露面不是能力。
2. **模态统一**：aria-modal + 自管 z-index（扩展中心 SkillPanel）迁 `<dialog showModal()>`；
   `--dsh-skill-center-overlay-layer` 等层号变量进例外清单（只减不增）。
3. **hero 橱窗**：能力导航行去掉 `session.blank && 有岗位预设` 双条件，扩到全切片；
   胶囊卡与命令面板共享 S0b 目录——hero 即命令面板的静态投影。

## 3. 全程红线（每阶段验收必查）

- 不碰 shadows-shipped-ui slot；基座只 pin 不改；锚不钉哈希；漂移自报降级（ADR-0019）。
- 每阶段独立过 `pnpm run gate`；S3 额外跑重启冒烟三件套（P-52 教训）。
- 非机械改动当批附 ADR + Note。预计新增 4 篇：能力中枢（S2）、布局收敛（S3）、
  主题收缩（S4）、能力目录 schema（S0b）。
- 能力目录聚合层永远只读——各切片数据源仍是各自事实的唯一家。
- 工作量感觉：S0 约 1–2 天 spike；S1/S2 各一周量级；S3 一周含回归；S4 收尾一周。
  关键路径在 S0a。

## 4. 与既有计划的关系

- `2026-09-17-appearance-revamp.md`（外观页对齐 ChatGPT.app）：独立进行，互不阻塞；
  S4 主题收缩涉及预设墙呈现，落地时需与该计划的预设卡片网格对齐（legacy 预设如何显示
  是两计划的交点，S4 开工前对一次）。
- `2026-09-18-release-convergence.md`（发布收敛）：S2 是用户可感知交付，若赶上发布窗口
  按 DMG 发布 SOP 排期，互不强制依赖。
