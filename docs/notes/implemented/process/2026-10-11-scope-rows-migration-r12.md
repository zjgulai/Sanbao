---
title: scope 伞行核销第二批（P14）与 P06 子树读数
doc_type: process
module: sanbao-integration
topic: scope-rows-migration-p14
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# scope 伞行核销第二批（P14）与 P06 子树读数

## Problem

Loop-Q R12 线 B（矩阵治理，与线 A 代码并行、文件面零重叠）。R11 完成 `P14.sidepanel.entry` 后，P14 组三叶全部 implementing；P06 伞行（59 叶）需要在 blocker 中落「外观子树已闭环」的准确读数。

## Decision

1. **QDR.P14.scope.unexpanded 迁 implementing**：程序化复核组内 3/3 叶（preview.html / terminal.entry / sidepanel.entry）全部 implementing 后迁移；evidenceRefs = 组内叶并集；blocker 记「工作台标签/布局/侧面板点击路径未核验」。
2. **QDR.P06.scope.unexpanded 保持 pending，blocker 改写**：外观子树已闭环（9 叶：8 verified + appearance.entry implementing）；其余 50 叶（profile/general/mode/shortcuts/voice/models/… 各入口与子页）未装——组非穷举。**不拆伞行**（矩阵 206 行目录固定，拆行不可行）；子树读数落在 blocker，供后续消费。

## Alternatives considered

- 为外观子树新增伞行：否决——矩阵行数由 catalog 固定（206），不得增行。
- P06 整组迁 implementing：否决——50 叶未装，迁即假「组已核验」。

## Consequences

- 矩阵 `ui` implementing 82→83、pending 126→115 中的此项为 115（含本行）。
- 伞行余量：6 条依赖（O02/P03/P04/P06/P13…）× 36 条零叶（以矩阵为准）。

## Verification

真实运行（2026-10-11）：`--write`（源根 vendor/sanbao-prototype）、`--check-source`、`--check`、矩阵 gate、selftest 13/13 全 PASS；summary 由 deriveSummary 重算。
