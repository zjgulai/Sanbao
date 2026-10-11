---
title: 并行侦察记录：scope 伞行核验与知识/站点装配可行性
doc_type: process
module: sanbao-integration
topic: scope-rows-and-knowledge-sites-recon
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 并行侦察记录：scope 伞行核验与知识/站点装配可行性

Loop-Q R8 期间的两条只读侦察（用户指示可并行处并行）。产出供 R9 及后续批次直接消费。

## 一、scope.unexpanded 伞行核验（55 条全量）

- 伞行共 **55 条**（P 17、O 14、S 13、M 5、A 6），全部 pending 且自述「候选组范围占位，非叶状态穷举」。
- **建议迁 implementing（组内具体行全部已 implementing）— 12 条**：
  A01（3/3）、A02（1/1）、M01（2/2）、M02（2/2）、O01（1/1）、P01（2/2）、P02（1/1，唯一叶证据为 candidate-untracked，note 记录）、P16（1/1）、S01（2/2）、S02（3/3）、S08（2/2）、S10（1/1）。
- **保持 pending（有未装具体行依赖）— 7 条**：O02（依赖 `O02.files.menu.open`）、O08（R8 后 11/11 已完成，伞行已随批迁）、P03（T11 自动化未装）、P04（扩展市场 20 叶未装）、P06（设置 50 行未装；仅外观子树 9 行闭环，可按子树拆伞核销）、P13（新建工作区表单未装）、P14（依赖 `P14.sidepanel.entry`）。
- **保持 pending（组内零叶、从未展开）— 36 条**：叶未拆或依赖自然条件（SSH/Git/图片预览/权限申请/限流等），不制造条件核验。
- 判据：伞行不承载自身 UI，核销只能通过组内具体行状态表达。

## 二、知识中心（OBS02 13 行）与站点（OBS03 4 行）装配可行性

- 现状：无知识库存储 provider、无 Repo Wiki 生成 provider、无站点/发布/共享 provider；desktop 两页为占位通知；无 knowledge/sites slot 与 route。
- 关键纪律（侦察明确）：「无 provider」不能冒充「空列表」——观察空态文案（「还没有知识库」「还没有站点」）语义为「有存储、空列表」；provider 缺失时数据区必须显示「provider 未接通 + 具名 reason」，壳可还原页面结构。
- **第一批（壳 + 诚实不可用，9 行，可立即装配）**：knowledge.entry、sites.entry、knowledge.empty、sites.empty、sites.shared.empty、sites.loading（骨架+禁用，不假计时）、repo-wiki.generated.empty、repo-wiki.search.empty（无来源可搜 ≠ 无匹配）、repo-wiki.knowledge-cards.wide（纯本地布局行为）。
- **第二批（壳 + 表单/配置结构，提交具名拒绝，6 行）**：knowledge.create.open / .workspace / .ready、knowledge.workspace-filter.open、repo-wiki.default（指标位不显示 0 冒充）、repo-wiki.list。
- **第三批（repo-wiki 配置与生成，2 行）**：repo-wiki.setup、repo-wiki.knowledge-cards——「生成」为受保护 effect，须等 Repo Wiki provider + 显式授权。
- 全部 17 行的行关闭依赖 (b) 类 provider 落地 + 真实窗口验收；第一/二批只推进 ui 维与壳证据。

## 三、消费方式

- R9 建议：伞行迁移批（12 条 + O02 之 files 叶若同批装配则 13 条）+ 知识/站点第一批（9 行）并行——两线独立。
- 本记录为侦察读数；行状态以 tracked 矩阵为唯一权威。
