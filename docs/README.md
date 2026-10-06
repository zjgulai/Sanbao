# Sage 文档索引

本目录沉淀 Sage 当前产品主线，以及仍需作为 provenance / compatibility 保留的历史 DSH 二开决策。旧发布线、旧插件与历史证据不等于当前 Sage 已交付能力。

本页是**人工入口**，不是事实源：分层规则见根 [AGENTS.md](../AGENTS.md)，门禁契约见 [architecture.md](architecture.md) 第 0 节。

## 文档脊柱（改代码前先读）

| 层 | 位置 | 说明 |
| --- | --- | --- |
| 常驻规则 | [../AGENTS.md](../AGENTS.md) | 每会话必读的结论与归属地，每条链接其详细文档 |
| 有序地图 | [architecture.md](architecture.md) | 仓库构成、门禁契约、基座事实、红线、模块地图 |
| 决策时间线 | [adr/](adr/) | ADR-NNNN 编号时间线（决定**是什么**），索引见目录内 README |
| 决策理由 | [notes/](notes/) | `{lifecycle}/{class}/yyyy-mm-dd-topic.md`（为什么改、放弃了什么），非机械改动必须附一篇 |
| 本机活动仓基线 | [notes/implemented/process/2026-09-27-local-active-repository-baseline.md](notes/implemented/process/2026-09-27-local-active-repository-baseline.md) | BASE-01～05 的恢复边界、动态仓根规则、legacy 隔离与回退方式；后续任务开工前必读 |

## 故障排查（优先看）

| 文档 | 说明 |
| --- | --- |
| [dsh-desktop-white-screen-playbook.md](dsh-desktop-white-screen-playbook.md) | **DSH Desktop 白屏排查手册**：速查卡（主区白屏 / 整窗白屏二分）+ 三类白屏实战案例（root 槽竞态 ×2、HMR 热更 ×1）+ 二次开发红线清单 + 修复工具箱（RootOutlet 兜底 / runtime-guards G1/G2）。二次开发遇到白屏先查这里（唯一 home，`_doc-notes/` 下的旧副本已移除）。 |
| [pitfalls-playbook.md](pitfalls-playbook.md) | **复发故障总账**（开工前先读）：按**根因**而非日期组织的复发故障清单——每条写「症状 / 根因类 / 已落地机制 / 下一版默认动作」，机制一律点名到具体的门禁名或脚本。结构由门禁 `pitfalls-playbook` 守着（四条规则 + 恒真桩突变的反向自测），所以它不会腐烂成一份说谎的清单。 |

## 架构与流程

| 文档 | 说明 |
| --- | --- |
| [architecture.md](architecture.md) | 平台架构与维护/生效语义（含万物互联与出海技能当前产品形态，2026-09-09 对齐） |
| [plans/2026-09-24-sage-self-owned-desktop-execution-plan.md](plans/2026-09-24-sage-self-owned-desktop-execution-plan.md) | Sage 自有桌面端的阶段边界与验收出口；accepted 不等于全部已实现 |
| [plans/2026-10-05-sanbao-in-sage-integration-tickets.md](plans/2026-10-05-sanbao-in-sage-integration-tickets.md) | **当前任务入口**：T01–T14 与 DMG-INTERNAL 的范围 / 依赖 / 验收；进度只读 [tracked 矩阵](specs/2026-09-27-sanbao-to-sage-ui-state-map.json) 逐行事实，票据文字不承载状态 |
| [notes/implemented/process/2026-10-06-portable-cleanup-and-handoff.md](notes/implemented/process/2026-10-06-portable-cleanup-and-handoff.md) | **异机交接与清理记录**：保全 / 收纳 / 删除边界、恢复步骤与下一台电脑 Codex 的续作清单（[ADR-0272](adr/ADR-0272.md)） |
| [design-loop/](design-loop/README.md) | 设计回路输入快照（工单 / 规格 / 判者）；历史读数不得冒充现行验收，判者在 `scripts/design-loop/` |
| [upgrade-2.0.5-window-plan.md](upgrade-2.0.5-window-plan.md) | **升级窗口执行方案**（基座升级时整窗执行；含品牌/主题/导航的锚点处置现状与窗口复验清单） |
| [release-process.md](release-process.md) | 版本发布 SOP |
| [sop/profile-loadpoint-refill.md](sop/profile-loadpoint-refill.md) | 装载点缺件检查、原子补件、哈希复核及隔离演练读数 |
| [sop/production-machine-readout.md](sop/production-machine-readout.md) | 生产机现场只读取证操作卡（零写入脚本 + 人工脱敏复核 + 弃案边界） |
| [../packaging/INSTALL-GUIDE.md](../packaging/INSTALL-GUIDE.md) | **客户安装手册（用户版）**：逐步操作 / 授权两项 / 失败对照表 / 卸载回退；随 DMG 分发，是客户侧安装事实的唯一 home（速查卡：[../packaging/INSTALL-CARD.md](../packaging/INSTALL-CARD.md)） |
| [plans/2026-09-13-auto-update-route.md](plans/2026-09-13-auto-update-route.md) | **自动更新路线（待 Developer ID）**：换身份的代价（TCC 再重授一次）、公证链、feed 与信任链、灰度/回滚、以及「现在就能做且不白做」的两步 |
| [adr/](adr/) | 架构决策记录（ADR-NNNN，模板与索引见目录内 README） |

## 子产品文档入口

| 文档 | 说明 |
| --- | --- |
| [../packages/capabilities/dsh-wanzh-hulian/docs/README.md](../packages/capabilities/dsh-wanzh-hulian/docs/README.md) | 万物互联产品形态总览（四板块/4 MCP/认证机制/技能同步） |
| [../packages/capabilities/dsh-wanzh-hulian/docs/mcp-connections-2026-09-08.md](../packages/capabilities/dsh-wanzh-hulian/docs/mcp-connections-2026-09-08.md) | **最新**：业务化清单 / Shopify 客户端凭据 / Apify 接入（决策+验收+待办） |
| [../packages/capabilities/dsh-overseas-skills/docs/maintenance-sop.md](../packages/capabilities/dsh-overseas-skills/docs/maintenance-sop.md) | 出海技能维护 SOP（脱手手册） |
| [../packages/capabilities/dsh-overseas-skills/docs/recent-changes-2026-09-08.md](../packages/capabilities/dsh-overseas-skills/docs/recent-changes-2026-09-08.md) | 出海近期变更与坑位（分类 v3/硬链接/图标防抹） |
| [../packages/capabilities/dsh-overseas-skills/docs/skill-taxonomy-v2.md](../packages/capabilities/dsh-overseas-skills/docs/skill-taxonomy-v2.md) | 技能分类总表（v3 终审稿：8 大场景/28 细分/222 条） |

## 计划与报告

图谱中的 `tested_by` 是近似关系索引，不是覆盖率或执行成功证据；同口径测试文件与
图节点/边对账见 [DA-30](../.scratch/review/2026-09-22-arch-health-top20/tasks/DA-30-tested-by-reconciliation.md)。

| 文档 | 说明 |
| --- | --- |
| [deep-analysis-2026-09-20.html](deep-analysis-2026-09-20.html) | **全仓深度分析指引**（2026-09-20，快照 `ef17b22`）：知识图谱（3930 节点）交叉核验治理文档，含开发指引（加功能/改架构/优化/重构）与 TOP20 必做事项；配套工单轮在 [.scratch/review/2026-09-20-deep-analysis-top20/](../.scratch/review/2026-09-20-deep-analysis-top20/README.md) |
| [skillopt-optimization-plan.md](skillopt-optimization-plan.md) | SkillOpt 优化计划 |
| [skillopt-optimization-report.md](skillopt-optimization-report.md) | SkillOpt 优化报告 |
| [skillopt-skill-optimizer-merge-plan.md](skillopt-skill-optimizer-merge-plan.md) | SkillOpt 合并计划 |
| [skill-contract-plan.md](skill-contract-plan.md) | 技能契约计划 |
