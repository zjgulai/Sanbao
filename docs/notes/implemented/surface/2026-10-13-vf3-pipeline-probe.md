---
title: VF-3 验收管线试跑：对比工具 v1 标定 + 证据格式定义（P06 族先行）
doc_type: architecture
module: sage-shell
topic: vf3-pipeline-probe
status: draft
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# VF-3 验收管线试跑：对比工具 v1

对应票据：[视觉保真票](../../../plans/2026-10-12-qoder-visual-fidelity-tickets.md)（VF-3）
对应决策：[ADR-0337](../../../adr/ADR-0337.md)（VF-2 系列，本批为其验收面）

## Decision

1. **D1 工具**（`scripts/visual-fidelity/compare.mjs`，零依赖纯 node）：PNG 解码（自写 inflate 扫描线，8-bit RGB/RGBA）→ N×N 网格逐区采样 → 双维度比对：主导色通道距（16 级量化）+ 边缘密度差（水平色变率，布局指纹）。输出 `alignmentRatio`（容差：色距 ≤3 且 edgeΔ ≤0.15）与逐区明细，`--json` 供证据落盘。
2. **D2 证据格式**（tracked，每状态一行）：`{stateId, sagePng(ref), qoderPng(ref), toolOutput(json, alignmentRatio+perRegion), grid, conditions:{window,theme,scale}, reviewedBy:'self+user 回看', verdict}`——全部为仓内 tracked 路径；`countsAsVerification: true` 需人工回看记录在场。
3. **D3 标定基线**（同主题 mint-light 三组）：同页自比 = 1.000（64/64，无假阳）；不同页 = 0.969（有区分度）；近邻页 = 1.000。容差阈值（3/0.15）在真实 Sage↔Qoder 对比时再收紧标定——现在过拟合到 Qoder 自身差异无意义。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| pixelmatch 等逐像素 diff 库 | 否决：需对齐尺寸+蒙版机制，且逐像素在双端窗口尺寸不一致时噪声大；网格主导色+边缘密度对布局级验收更稳。 |
| 人工并排回看（无工具） | 部分采纳：工具出数字，人签 verdict——工具不能替代回看（票据原文）。 |

## Verification

- 工具三组标定真实运行（见 D3）。
- Sage 侧截图通路复用 DMG-06 验收产物（1440/660/320 三宽）；下一次 DMG 验收起， VF-3 证据随验收自动产出。
- 本批不闭合任何 `visualAcceptance` 行——P06 行闭合需 Sage 侧含 VF-2 的 DMG（v16+）截图 + 人工回看，留待下一版 DMG。

## Consequences

- VF-3 管线三要素（截图、对比、证据格式）全部就位；闭合节奏与 DMG 发布节奏绑定。
- 对比工具零依赖、可进 CI（但不进 `pnpm run gate` 基线——票据明文视觉门禁独立）。
