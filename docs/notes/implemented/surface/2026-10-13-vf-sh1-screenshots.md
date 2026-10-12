---
title: VF-0 扩图 SH-1 批：导航可达页 13 张（市场/知识/站点/自动化/连接/新任务/账号菜单）
doc_type: analysis
module: sage-shell
topic: vf-sh1-screenshots
status: draft
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# VF-0 扩图 SH-1 批：13 张（`assets/qoder-reference/screenshots/base-20261013-sh1/`）

对应票据：[VF 扩图与族推进计划](../../../plans/2026-10-13-vf-expansion-plan.md)（SH-1）
条件：窗口 1270×919、mint-light、2540×1838 @2x，与既有基线一致。

## 清单（13 张，全部人工抽验真实页面）

| 文件 | 覆盖矩阵状态 |
|---|---|
| `settings-extensions-default-…png` | P04.installed 默认（插件 11/技能 383/连接器 17/智能体 1 计数 tabs + 已安装列表） |
| `settings-extensions-market-…png` | P04.market 入口（设置壳内市场按钮） |
| `market-plugins-installed-…png` | P04.installed.plugins（产品壳市场全页） |
| `market-connectors-default-…png` | P04.market.connectors（连接器发现页，GitHub/PolarDB/Figma/Notion… 网格） |
| `extensions-installed-skills-…png` | P04.installed.skills（市场 96 + 本地 Skill 197 分组列表） |
| `knowledge-default-…png` | OBS02.knowledge.empty（还没有知识库 + 创建按钮） |
| `repowiki-default-…png` | OBS02.repo-wiki.list（工作区卡片网格 + 未生成徽章 + 去生成——capture 未覆盖的新状态） |
| `sites-default-…png` | OBS03.sites.empty（还没有站点 + Qoder 印章插画） |
| `sites-shared-empty-…png` | OBS03.sites.shared.empty（暂时没有分享给你的站点） |
| `automation-default-…png` | P03.list.empty（还没有自动化 + 保持设备唤醒横幅 + 模板/执行记录 tabs） |
| `settings-connections-mcp-…png` | O08 相关（连接页 SSH 空态；MCP 表单不在设置侧栏——搜「MCP」无匹配，属会话态入口） |
| `newtask-default-…png` | P13 前置（「不止于编程」品牌区 + 会话/Credits 热力图 + composer 全控件 + Qwen3.8-Flash 选择器 + 完全访问开关——capture 未覆盖） |
| `account-menu-open-…png` | 账号菜单态（设置/显示宠物/外观/更新日志/获取移动端/关于/退出登录） |

## 关键发现

1. **0.4.4 MCP 配置不在设置侧栏**（搜索无匹配）——0.3.4 capture batch11/12 的 MCP 表单入口在会话/任务工作台。O08 族 11 行的视觉证据属 SH-2 会话态批。
2. **P13 工作区创建在「新任务」页**：品牌区 + 热力图 + composer。capture 的 P13.create.empty/ready 需在此页输入触发——待 SH-2。
3. **市场页在产品壳不在设置壳**：设置壳的「扩展管理」是已安装管理；「市场」按钮跳出产品壳全页。Sage 的 extensions-market.tsx 对应产品壳面。
4. **知识/站点/自动化在产品壳侧栏**（不在设置侧栏）——与 Sage 的 page.tsx 导航一致（知识中心/站点/自动化/扩展）。
5. 技能 tab 切换失败（RadioButton AXFocus+Enter 无效、CGEvent 坐标命中偏差）——技能发现页缺失，capture（batch09/10）文字证据可暂替；重试通路：已安装页内 tab（AXCheckBox）或放大点击区域。

## SH-1 完成度 vs 计划

计划 29 张 → 实际 13 张有效（+1 重复剔除）。缺口：市场详情页（需点卡片）、技能发现页、P13.create 两态（需输入触发）、MCP（会话态）——全部并入 SH-2 或 FV 批按需补采。
