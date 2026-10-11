---
title: T07 会话控制批（授权等待/排队/计划步骤/队列）
doc_type: architecture
module: sage-shell
topic: session-control-batch
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# T07 会话控制批（授权等待/排队/计划步骤/队列）

## Problem

R14：113 行分级榜第 2 名。S03/S05/S06/S07 四伞行对应机器（approvals/model-queue/run-monitor/plans/pending-inputs）均已在 main，桌面零消费。

## Decision

按 [ADR-0313](../../../adr/ADR-0313.md) 实施（理解 workflow 三线侦察 + 边界合成在前）：解析扩槽与面板同提交；S03 授权等待卡（真实 route + protected-effect-unavailable 专用文案）；S05 排队卡（延迟为事实）；S06 blocked 标签 + 计划 roster（只读零 action）；S07 待继续/队列列表（精确 action 体、consumed 冻结）。三条具名推迟：S04（原生卡零事实源）、approvals 写路径注册批、plans admission 批。

## Alternatives considered

见 ADR-0313 备选表（兼做两处 admission rework、steer 暴露、逐步骤详情——逐条否决）。

## Consequences

- 会话页四台机器真实读数面；矩阵 98→102 implementing（四伞行迁移）。

## Verification

真实运行（2026-10-11）：

- 新增五例后 `desktop-session.spec` + `desktop-session-view.spec` → **38/38**（授权卡真实 body 与专用拒绝文案、排队卡事实行与核对重读、待继续/队列编辑与移除的真实 body、计划 roster 阻断标签、blocked 回合标签）。
- 全量套件：**1997 passed | 1 skipped**（解析扩展零外溢）。
- 提交前对抗评审：26 审 → 8 确认（0 反驳）+ 完备性批评 3；缺陷全部修复并各配用例（拒绝具名 + 应答重读、计划不可读/草稿诚实、回执 unknown、延迟精确、队列可编辑位与快照态、display-only 无死控件）——两 spec 44/44。
- 矩阵四行迁移与门禁读数见同批提交记录。
