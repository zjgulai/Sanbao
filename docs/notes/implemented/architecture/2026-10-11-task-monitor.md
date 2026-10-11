---
title: 任务监控页与回顾卡（P16 收口）
doc_type: architecture
module: sage-shell
topic: task-monitor
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 任务监控页与回顾卡（P16 收口）

## Problem

ADR-0303 登记：P16.review.summary 需要 desktop 任务监控面。盘点：runMonitor 已在 state 信封（steps 轴 + 四未知轴）；desktop 的「运行模式」页是占位通知；回顾卡「更新时间」缺权威时间源（fold 有 turn/end 毫秒戳但视图未上位）。

## Decision

按 [ADR-0304](../../../adr/ADR-0304.md) 实施：

1. 运行模式页 = `MonitorPage`（替换占位）：步骤轴 + 预算/设备/后台/上下文四未知轴逐行如实。
2. 回顾卡：`turnProcess.endedAt` 上位（fold → 契约 → 解析），卡内「更新于 {本地时间}」用日志戳；展开入口复用 `TurnProcessFooter`；产出 = observed artifacts / 诚实空态；来源 = 未接通；更多操作最小（返回任务输入）。
3. `DesktopRunMonitor` 宽容解析（非法轴退化、整体畸形省略）。
4. P16 迁 implementing；执行回流面 11/11 完成。

## Alternatives considered

见 ADR-0304 备选表（卡塞会话页、本地时钟、零代替 unknown、假动作——逐条否决）。

## Consequences

- 占位「运行模式」退场；矩阵 29→30 implementing、169→168 pending。
- Loop-Q 执行回流面（session 页 11 行）全部完成迁移。

## Verification

真实运行（2026-10-11）：

- `node scripts/test.mjs run test/product-app/desktop-session.spec.tsx test/desktop-client.spec.ts` → **48/48 passed**（监控页：步骤/四轴文案、回顾卡「更新于」/耗时/步数/产出来源空态；畸形 monitor 退化「步骤：不可读（monitor-not-read）」与设备轴 fallback；client 槽形状含 monitor）。
- 全量套件：1946 passed | 1 skipped。
- 矩阵：`--write`、`--check-source`、`--check`、矩阵 gate、selftest 13/13 全 PASS。
