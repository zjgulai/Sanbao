---
title: 知识/站点页壳第一批（诚实不可用而非空列表）
doc_type: architecture
module: sage-shell
topic: knowledge-sites-shell
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 知识/站点页壳第一批（诚实不可用而非空列表）

## Problem

OBS02/OBS03 两族此前为占位通知；无任何知识/站点 provider。侦察判据：无 provider 不能冒充空列表（并行侦察记录）。

## Decision

按 [ADR-0307](../../../adr/ADR-0307.md) 实施（Loop-Q R9 线二，并行代理装配、主线程独立复验）：知识中心/站点升为实页壳；数据区具名未接通（`readoutKnowledge` 宽容槽优先，fallback 常量）；搜索可输入且查询保留（复验修正代理的 readOnly 决定）；无创建/提交/生成按钮；7 行迁 implementing。

## Alternatives considered

见 ADR-0307 备选表（假空态、readOnly、假骨架、展示 fallback 空态——逐条否决）。

## Consequences

- 两页壳与诚实不可用上线；矩阵 59→66 implementing、139→132 pending。
- 余量：创建表单族 6 行、配置/生成 2 行、loading/wide 2 行（具名依赖登记于行）。

## Verification

真实运行（2026-10-11，主线程复验）：

- 代理读数复核 + 修正后重跑：`npx tsc --noEmit -p .` 0；`node scripts/test.mjs run test/product-app/desktop-knowledge-sites.spec.tsx test/product-app/desktop-page.spec.tsx test/desktop-client.spec.ts` → **77/77**。
- 全量套件：**220 files / 1962 passed | 1 skipped**。
- 矩阵：`--write`、`--check-source`、`--check`、矩阵 gate、selftest 13/13 全 PASS。
