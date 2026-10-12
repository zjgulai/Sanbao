---
title: failed-retry 再授权——选择时 ensure 为失败修订再落工作修订
doc_type: architecture
module: sage-shell
topic: failed-retry-rearm
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: human+ai
---

# failed-retry 再授权

## Problem

v9 生产实测（真实回合失败 `MISSING_CREDENTIAL`）暴露：事项落 `failed-retry` 后**永久不可再发**。

链路：域内核 attempt 仅从 `evidence/clarification` 起步；`failed-retry` 的出口 `reconfirmRevision` 全产品零调用；选择时 ensure 的 `decideRunRevision` 因「当前修订已声明 session.prompt」返回 `not-needed` → 不落新修订 → 发送 admission 的 persist 步被域拒（`An attempt may start only from evidence or clarification`，装版探针实錘）。

## Decision

见 ADR-0328：`decideRunRevision` 在 `stage === 'failed-retry'` 时不走策略短路，返回 `needed` → 既有选择时 ensure 以用户见证落新工作修订（`enterEvidence`，域允许），changeReason 显式写「失败修订后的再次确认」；零新路由/UI。

## Alternatives considered

- 接线 `reconfirmRevision` 全套（路由+族+UI）：面大，本轮不做，留将来票。
- 自动落新修订：再授权必须带用户见证；否决。
- 放宽域守卫：拆证据链；否决。

## Consequences

- 「重新选择事项」或直接再发即再授权；死锁解除。
- spec 增量 1（failed-retry 闭环）；门禁分母不变；全套件 2090 passed。
- 域约束「事件时间单调」在 spec 以等刻时间满足（生产走真实时钟）。

## 证据

- 域拒原文（装版 persist 探针）：`BusinessMatterError: An attempt may start only from evidence or clarification.`
- v9 实测 store：`attempt-started + attempt-failed` → 再发 `session-prepare-declined`。
