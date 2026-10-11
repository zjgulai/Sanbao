---
title: 上下文占用提示（快照投影）与 P16 复盘
doc_type: architecture
module: sage-shell
topic: context-usage
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 上下文占用提示（快照投影）与 P16 复盘

## Problem

Loop-Q R5：S10.context.usage（上下文占用提示）与 P16.review.summary（任务监控区回顾卡）。盘点：S10 的占用数值可由基座 `token-meter` 的 `ContextPressureProjection` 提供（随 `snapshot.projections` 送达；文档明言是用户参考值非计费/门禁输入），Sage fold 忽略 projections；P16 需要的任务监控区在 desktop 线不存在。

## Decision

按 [ADR-0303](../../../adr/ADR-0303.md) 实施：

1. fold 快照分支提取 `contextPressure`（整数校验、字段独立、非法即 null）；页面重放「有者优先」。
2. 契约 `SessionChannelStatus.contextUsage` + desktop 宽容解析。
3. composer 提示行「上下文 NN%」chip（两值齐备才渲染；title 附 tokens 原值）。
4. S10 迁 implementing（blocker：宿主送达性真机验证；明细/压缩不装）；**P16 保持 pending**——任务监控面不存在，登记为下一轮监控面刀（blocker 改写，不假闭）。

## Alternatives considered

见 ADR-0303 备选表（自算占用、R5 兼装监控面、圆整粒度——逐条裁决）。

## Consequences

- 占用提示上线（投影存在时）；缺席无 chip。
- 矩阵 28→29 implementing、170→169 pending；执行回流面 10/11 完成，P16 待监控面刀。

## Verification

真实运行（2026-10-11）：

- `node scripts/test.mjs run test/session-channel.spec.ts test/product-app/desktop-session.spec.tsx` → **41/41 passed**（fold：投影折叠 12000/80000、缺席/非法 null、半投影保留；renderer：chip「上下文 15%」、无投影无 chip）。
- 全量套件：1945 passed | 1 skipped。
- 矩阵：`--write`、`--check-source`、`--check`、矩阵 gate、selftest 13/13 全 PASS。
