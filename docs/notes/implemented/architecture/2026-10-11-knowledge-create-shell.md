---
title: 知识/站点页壳第二批：创建弹窗与列表工具形状
doc_type: architecture
module: sage-shell
topic: knowledge-create-shell
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 知识/站点页壳第二批：创建弹窗与列表工具形状

## Problem

Loop-Q R10：第二批 6 行——创建弹窗的形状观察（0/50、范围、工作区选择、就绪禁用逻辑）与 Repo Wiki 列表工具（三态筛选、双视图）。创建/生成无 provider。

## Decision

按 [ADR-0308](../../../adr/ADR-0308.md) 实施：创建弹窗形状 + 具名拒绝的创建点击；工作区菜单/chips 用真实 workspaces 槽；列表级筛选菜单同源；Repo Wiki 三态筛选 + 卡片/列表切换 + 不渲染零指标卡。

## Alternatives considered

见 ADR-0308 备选表（零指标卡、虚构工作区名、假成功、去生成入口——逐条否决）。

## Consequences

- 6 行迁 implementing（66→72、132→126 pending）；知识族余量 2 行 + loading/wide。

## Verification

真实运行（2026-10-11）：

- `node scripts/test.mjs run test/product-app/desktop-knowledge-sites.spec.tsx` → **11/11 passed**（弹窗形状：0/50、用户范围默认+说明、创建禁用；工作区范围：提示/禁用→勾选+17/50→就绪→点击得具名拒绝；筛选菜单：两项+选择改触发文本；Repo Wiki：三态+双视图+两视图均具名 note+无「去生成」；动作守卫更新）。
- 全量套件：**220 files / 1966 passed | 1 skipped**。
- 矩阵：`--write`、`--check-source`、`--check`、矩阵 gate、selftest 13/13 全 PASS。
