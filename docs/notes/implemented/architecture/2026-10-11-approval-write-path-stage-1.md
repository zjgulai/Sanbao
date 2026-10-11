---
title: 审批写路径落装（B 批）· 阶段一：声明层与 kernel 六态
doc_type: architecture
module: sage-shell
topic: approval-write-path-stage-1
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 审批写路径落装（B 批）· 阶段一：声明层与 kernel 六态

## Problem

会话控制六 operation 恒 unavailable 的第一断点：`ACTION_AUTHORITY_TABLE` 未注册（identity 步对未注册操作一律 unavailable，五 port 同表过滤，dispatch 硬编码只认 session.send）。B 线设计经对抗反驳折入（推翻 6 处表述、补缺 10 项）。

## Decision

按 [ADR-0317](../../../adr/ADR-0317.md) 实施**阶段一**：表六行 + effectClass 裁定；kernel `SessionCoreDispatchDetail` 六态 + 守卫（畸形 → outcome-unknown）；表钉子扩十行。全批七阶段路线登记在 ADR D4（阶段二 publications 再封印=owner decision 需用户裁定）。

## Alternatives considered

见 ADR-0317 备选表（一次全落、composition 直连、复用 attempt 事件——逐条否决）。

## Consequences

- identity 步对六 op 真实求值：**已登录无 grant → denied**（不再 unavailable）；未登录仍 unavailable（fail closed）。
- 端到端生效待阶段二（publications 含新 scope）＋用户 policy grants；v4-final DMG 冻结于本阶段前，走查不受影响。

## 阶段二（当日落地）：publications 再封印

用户点名授权（六项 grant 清单 + first-party 自证机制）后执行：新模块 `session-controls-publication.ts` + runner `scripts/publish-session-controls.mjs`（默认 dry、`--write` 落地、代际守卫防重复扩展）。三条 permission 声明逐字采用所请文本；adapter/contract 摘要按固定 canonical 声明自算（first-party 路线，ADR-0283 D4 同构）。落地：requirement v2 `fa2b7cae…` / registry v2 `6d3434c5…` / matrix v2 `f5d8c7ce…`；re-observation fixture 同步刷新（descriptor 换面重算摘要 + evidence 自摘要重算）。runner 自检当场抓出并修复：URN 双重包装、同 scope 双 tuple、快照剥 digest 语义、descriptor/evidence 摘要重算。端到端生效待用户 policy grants（六 op 行）。

## Verification

真实运行（2026-10-11）：

- tsc 0 错；全量 **2022 passed | 1 skipped（226 文件）**（阶段二后）。
- 新增/扩展用例：kernel 六态 detail 正例逐条 carry；畸形 detail（缺 ref/空串/非串）→ outcome-unknown；表十行精确钉子 + 六行逐条映射；identity spec 六行裁定钉子。
- `pnpm run gate` 退出码见提交记录。
