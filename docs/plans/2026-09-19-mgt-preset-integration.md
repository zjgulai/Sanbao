---
title: 管理层（MGT）Preset 整合（P0–P6 七阶段）
status: approved
date: 2026-09-19
---

# 管理层（MGT）Preset 整合（P0–P6 七阶段）

> 本文是**已批准计划**。决策权威来源是 [ADR-0129](../adr/ADR-0129.md)（九条决策 D1~D9），
> 审计取证在 [research/16](../research/16-organization-audit-53-roles.md)，决策脉络在
> [Note](../notes/features/contract/2026-09-19-mgt-layer-preset-integration.md)。
> 本文只负责**执行细节与验收判据**，不重新论证取舍。
> 批准时约定：本文档轮次**不改任何代码**；P0~P6 的落地在用户另行开工指令后执行。

## 0. 决策记录（已确认，两轮共 11 项选择全部用户拍板）

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 授权姿态 | 评估载体 + 本机装配；shipped exclude 档；出货前置 = EVAL-A/B 通过 + R0 对照臂结论 + 另立 ADR（D1） |
| 2 | 命名空间 | mgt-001~003 独立命名空间；PLN-EXC 投影平面，order 基座 0（D2，同时关闭材料侧 MGT-Q1） |
| 3 | 生成器形态 | generate.mjs 双装载分支（D3） |
| 4 | 协作事实落点 | management-catalog 自有归档，不动共享图，存量 50 零扰动（D4） |
| 5 | 技能供给 | T0 定制子集（剔 meeting-minutes/xindaya-translator/kami）+ 16 技能名诚实映射（D5） |
| 6 | 平面与 UI | PLN-EXC 置顶渲染；role-matrix PLANE_ORDER 补 0（D2/§P3） |
| 7 | 审计深度 | 机械化全量审计 53 岗（已跑完，报告 research/16；P4 脚本正式化） |
| 8 | 材料侧 closure | 闭 MGT-Q1/Q2/Q3，留 G8/G9/Q5（D8） |
| 9 | 协作边语义 | collaborates_with 声明为有向边，门禁只校验悬空（D7，审计发现 A） |
| 10 | 审计 B~E | 全部纳入：B 债务登记 / C 数量断言最小改 / D 两轴正交说明 / E AGT-002 例外登记（D6/D9） |
| 11 | 文档产物 | ADR-0129 + Note + 本计划 + research/16（本轮已交付，代码零改动） |

## P0 材料仓决策落地（先行，生成器读它）

仓库：`/Users/lute/project/AI组织变革`（= GitHub zjgulai/AI-Native-Organization）。

1. `docs/00-project/DECISIONS.md`：登记 D-0xx 三条——MGT-Q1 关闭（MGT 命名空间 +
   preset id `mgt-NNN` + PLN-EXC 投影平面采用）、MGT-Q2 关闭（MDC/GOC 为第六类契约）、
   MGT-Q3 关闭（Action Intent 提案权维持不授予）；G8/G9/Q5 标注「保持待决，见
   Magpie-Horch ADR-0129 D8」。
2. `docs/04-organization/management/management-catalog.json`：新增 `dsh_integration` 块
   （preset_id 映射 MGT-001→mgt-001 等、plane `PLN-EXC` 显示名「决策权平面」、域显示名、
   order 基座 0 与 101/102/103、authorization_status
   `evaluation_carrier_not_shadow_authorized`、eval 状态引用含 EVAL-B 未通过时点）。
3. `DECISIONS.md` D-066：补 collaborates_with **有向边**声明（发现 A/F，D7）——
   声明方 = 协作发起方、枢纽岗被指不回指是设计意图；同条说明 collaboration-graph 是
   Case 编排图、角色间协作事实唯一住在 role-catalog。**执行期修正：声明不落 ROSTER.md
   也不落 role-catalog.json**——ROSTER.md 同为 AGT 共享源（12 来源之一），P1 硬判据
   实测编辑它即传染 50 个 cordis 的 source revision，已还原；声明的家是 D-066 本身。
4. ~~`RESPONSIBILITY-MAP.md`：补「责任域与平面两轴正交」说明~~ **P0 执行时取消**：
   核实发现 `AI-ORGANIZATION-MAP.md`「两个正交视角」一节已是该事实的家（含 AGT-050/040
   实例），新增即第二份家（ADR-0009）；research/16 §3.6 已同步勘误。
5. `AI-ORGANIZATION-MAP.md`：决策权平面视图已存在（材料侧 494af93 已写），本次仅追加
   「DSH侧投影」一段（mgt-NNN、PLN-EXC 投影性质、评估载体姿态、dsh_integration 指针）。
6. ~~`ROSTER.md`：补 MGT 独立命名空间声明~~ **P0 执行时并入 D-065**（ROSTER.md 是
   AGT 共享源，不可触碰）：命名空间事实登记在 DECISIONS.md D-065 与 management-catalog
   dsh_integration 块。
7. ~~`ROSTER.md` 备注：AGT-002 第 4 技能例外~~ **P0 执行时并入 D-066③**（同上理由）。

验收：材料仓 `git diff` 中 role-catalog / organization-graph / collaboration-graph /
ROSTER 等 AGT 共享源**零字节改动**；结构化改动限 MGT 自有文件——management-catalog.json
的 `dsh_integration` 新增块 + MGT-002/003 蓝图 `identity.mission` 对齐 catalog（P1 入口
校验逮到的材料漂移，缩写版修正为权威版）；其余全部为 .md 文档面。

## P1 生成能力（Magpie-Horch）

1. `scripts/role-presets/generate.mjs`：
   - `PLANE_BASE += { 'PLN-EXC': 0 }`；MGT order = 101/102/103。
   - presetId 派生命名空间感知：`AGT-→agt-`、`MGT-→mgt-`（修 slice(4) 撞号路径）。
   - MGT 装载分支：management-catalog（共享）+ 每岗 4 件（`04-organization/management/`
     下 roles/souls/playbooks/preset-blueprints）+ 管理层设计文档与 SHADOW-VERIFICATION
     状态段（共享，eval 状态变化必须传染重生成）。
   - `renderMgtPersona`：七段结构（身份句 / Soul 摘要含第二原则 / 决策权阶梯摘要 +
     decision_rights 与 explicitly_not_granted 逐条 / 承重机制段（003 三条、001 的 L2b
     义务）/ 协作接口与零会话声明 / 技能供给实况 / **状态披露块**（D1 五项内容））。
   - MGT 分支跳过：squad/lead 规则、产品行、flows/scenarios 实例化（catalog FLOW 引用
     归档为组合级指针）。
   - manifest：`management_layer` 溯源块（layer/owned_role_ids/decision_rights/ladder
     refs/eval 状态）；shared 快照与 AGT 隔离。
   - 数量断言从材料 role_count 派生（D6④/发现 C）：`期望 50` → `期望 ${agtCount} +
     ${mgtCount}`，并与显式常量对照。
2. `scripts/role-presets/skill-map.json`：+16 条管理技能名映射（partial 带供给与理由；
   gap 如实；authoring 约定不变）。
3. MGT T0 子集常量：剔除 `meeting-minutes`/`xindaya-translator`/`kami`，剔除理由注释
   指向 ADR-0129 D5。
4. 图标：lute-brand-icons 图标库（家在 `~/.dsh/skills/lute-brand-icons`）新增 mgt-001~003
   三枚（形制遵循 ADR-0092 头像先例；id 与 preset id 同名，ADR-0022）。

验收：`node scripts/role-presets/generate.mjs` 干跑（或写盘）产出 53 个 preset 目录；
mgt-* 三件产物齐；**agt-* 50 个的 preset.yml 与 agent.cordis.yml 字节与改前逐字节一致
（硬判据，D4）**；manifest.json 允许且仅允许 `generator_revision`/`generator_rules_revision`
两字段变化（generate.mjs 自身哈希入快照，改生成器必然传染——P1 执行时确认的机械事实），
其余字段零 diff。任何 cordis/preset.yml 字节变化都意味着 P0 越界，必须先回查材料 diff。

## P2 门禁与账本

1. `packaging/shipped-presets.json`：exclude + 3 条（mgt-001~003，why 按 D1 措辞）。
2. `scripts/gates/live-presets.expected.json`：presetCount 56、rowCount 与
   rowIdentitySha256 重算（按既有重算流程）。
3. `scripts/role-presets/verify-lossless.mjs`：L1 双覆盖（50←role-catalog、3←
   management-catalog）；L10 头像 53 枚唯一；新增 MGT 层（decision_rights 归档、状态
   披露块存在、T0 剔除三项不在 cordis、eval 状态哈希与材料一致）。
4. 重生成 53 个 preset → `verify-lossless` 全绿 → `pnpm run gate` 全绿。

验收：gate 退出码 0；verify-lossless 输出含「50 + 3」双覆盖计数；shipped 白名单演练
（select-presets 干跑）确认 mgt-* 被 exclude 吸收、装配不中止。

## P3 UI 面

1. `packages/surfaces/dsh-role-matrix-local/src/collect.ts`：`PLANE_ORDER += { 'PLN-EXC': 0 }`；
   totals 自动含 53；覆盖关系展示（如需）从 MGT manifest 反查（D4）。
2. ~~`build_preset_catalog.py` 派生目录重跑~~ **P3 执行时取消**：核实该脚本只服务 7 个
   带 `skills/` 子目录的 legacy preset 组（PRESET_IDS），脚本自身已注明 agt-NNN 不在
   射程；mgt-* 无 skills/ 子目录，派生面无涉及。抽屉与能力中枢的 preset 枚举走运行时
   agentPresets 服务 / role-matrix roster 路由，均为动态读取，无派生工件需重建。
3. 新应用抽屉（agentPresets 双通道，ADR-0061）：零代码改动，实测 mgt-* 出现且置顶。
4. 与能力中枢工作流（docs/plans/2026-09-19-capability-hub.md，S1+S2 进行中）知会对齐：
   capability catalog 按 manifest 派生即兼容，无需特殊处理。

验收：DSH 实机——岗位矩阵最上方出现「决策权平面」组（3 卡片、头像、order 置顶）；
新应用抽屉可选 mgt-001 开启会话；会话中 persona 自报身份含状态披露（问「你是谁」应
答出评估载体/未授权 Shadow）。截图留档。

## P4 审计正式化

1. 把本轮一次性审计固化为 `scripts/role-presets/audit-organization.mjs`（只报告不阻塞；
   维度 = research/16 §1 表全部八项 + MGT 侧核验）。
2. 输出落 `docs/reports/`（或 stdout JSON），报告中非对称/悬空判定按 D7 语义（悬空 =
   ERROR，非对称 = INFO 不判错）。
3. 债务登记（docs/research/10-debt-solution.md 体系）：① T0 租户工具挂 50 岗（发现 B）；
   ② 数量断言彻底单一事实源化（发现 C 的剩余部分）。

验收：脚本可重复执行、读数与 research/16 一致（材料未变时）；债务账本两条新登记。

## P5 文档收口

1. `docs/architecture.md` §3 模块地图：role-presets 条目补「双命名空间（agt/mgt）」与
   PLN-EXC 投影平面一句话 + 指向 ADR-0129。
2. ADR-0129 已就位；decisions.json 重生成（`node scripts/gates/adr-agent-records.mjs
   --write`）；docs/adr/README.md 索引行补登。
3. pitfalls-playbook 检视：本轮无新根因类型（出货面纪律已有条目覆盖 D1 场景），不新增；
   若 P2/P3 执行中踩出新根因，按纪律补录。

## P6 终验收

- `pnpm run gate` 全绿证据（含 adr-agent-records、live-presets、brand-icons、
  skill-lines、preset-config-schema）。
- DSH 实机三件套：矩阵渲染 / 抽屉开启 mgt 会话 / persona 披露自报（P3 判据）。
- 出货演练：`packaging/assemble.sh` 干跑或实跑，确认 exclude 生效、agt 面 50 不变、
  机器路径扫描零新增。
- 材料仓与本仓改动各自成提交；本仓提交信息引用 ADR-0129。

## 范围外（本期不做）

- MGT-EVAL-A/B 重跑与 R0 对照臂（材料仓验证工作流，独立于 preset 整合；出货评审的前置）。
- 50 岗 T0 租户工具剔除（债务①，另行评审——动 T0_NAMES 会全量重生成）。
- 协作边对称化（D7 已判定非缺陷，永不做）。
- MDC/GOC 的机器可读 schema 实现与 Case Control 读取（材料仓 ENFORCEMENT §3 的构件，
  属 ORG 侧未实现依赖，与本仓 preset 无关）。
- 能力中枢 S1~S4 本身的推进（并行工作流，仅知会）。
