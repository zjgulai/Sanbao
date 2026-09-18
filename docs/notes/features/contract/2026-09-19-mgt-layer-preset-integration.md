# 2026-09-19 管理层（MGT）Preset 整合：决策权平面以评估载体身份进入 preset 体系

对应 ADR：[ADR-0129](../../../adr/ADR-0129.md) · 执行计划：[docs/plans/2026-09-19-mgt-preset-integration.md](../../../plans/2026-09-19-mgt-preset-integration.md) · 取证：[research/16](../../../research/16-organization-audit-53-roles.md)

## Problem

材料仓（AI组织变革，GitHub zjgulai/AI-Native-Organization）2026-09-18 新增管理层 v2：
3 个 CXO 岗位（MGT-001 持衡 CEO / MGT-002 驭浪 增长官 / MGT-003 明界 治理官），定性为
决策权平面——不与 50 岗会话、不进 Case、只读聚合、权力仅经版本化契约（MDC/GOC）生效。
需要决定：这 3 个岗位如何进入本仓的 preset 体系（50 个 agt-NNN 的既有范式），以及
整合前必须回答的存量健康问题（53 岗多维度属性与协作关系的全量审计发现了什么、怎么处置）。

三个硬约束：① DSH preset 是 Prompt 层表达，而材料侧红线要求「只能 Prompt 层表达隔离
时 MGT-003 不得进 Shadow」；② MGT-EVAL-B 已执行未通过（阶梯归属一致率 66.7%）、R0
对照臂未授权；③ 存量 50 preset 的 shared_source_hashes 覆盖 8 个共享材料文件，动任一
共享源 = 全量重生成。

## Decision

九条决策全部在 [ADR-0129](../../../adr/ADR-0129.md) 的「## 决策」与机器可读块中，
此处只记脉络：授权姿态（D1 评估载体+exclude 档）→ 命名与投影（D2 mgt-NNN + PLN-EXC）
→ 生成形态（D3 双装载分支）→ 事实落点（D4 MGT 自有归档、存量零扰动）→ 技能供给
（D5 定制 T0 子集+诚实映射）→ 账本门禁（D6）→ 审计处置（D7 有向边语义 / D8 材料侧
closure / D9 债务与文档登记）。决策过程为两轮共 8 项结构化选择 + 1 轮审计处置确认，
全部由用户逐项拍板，无一默认通过。

## Alternatives considered

见 ADR-0129「## 备选方案」：agt-051~053 顺延编号（语义污染）、立即出货（违反
pitfalls-playbook「未验证事实钉进出货面」）、材料侧归一化（schema 削足适履失真）、
独立生成脚本（双管线漂移）、协作关系进共享图（53 个全量重生成爆炸半径）、零技能供给
（偏离 standard 形态）。

## Consequences

- 存量 50 preset 字节零扰动；preset 体系进入双命名空间（agt/mgt）时代，generate.mjs
  复杂度上升是本决策 knowingly 接受的代价。
- MGT-EVAL 获得标准化载体；eval 状态入共享哈希 → 材料侧验证状态更新自动传染披露块，
  「评估载体未授权」不会腐烂成谎话。
- 出货评审被显式前置条件闸住（EVAL-A/B + R0 + 另立 ADR），材料仓 MGT-Q5 保持待决。
- 后续动作全部列入执行计划 P0~P6；两项债务（T0 租户工具挂 50 岗、数量断言彻底单一
  事实源化）登记进债务账本。
