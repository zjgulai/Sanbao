---
title: 扩展管理重构、市场壳与侧面板入口（R11 双线）
doc_type: architecture
module: sage-shell
topic: extensions-and-sidepanel
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 扩展管理重构、市场壳与侧面板入口（R11 双线）

## Problem

线 A：P04 9 行（扩展管理空态/添加菜单/市场默认页）零实现。线 B：P14.sidepanel.entry（侧面板按钮仅证可见）。

## Decision

按 [ADR-0309](../../../adr/ADR-0309.md) 实施。线 A 由并行代理装配、主线程独立复验：扩展管理升为四标签壳（计数「—」、添加两项菜单具名拒绝、连接器保留 McpForm）；市场壳（三标签/排序/类别/搜索）具名未接通、零条目。复验修正：两处「刷新」死控件改为具名拒绝 note。线 B：会话页头侧面板按钮本地开合 artifact rail。

## Alternatives considered

见 ADR-0309 备选表（假计数/假空态、渲染快照条目、死控件、静态按钮——逐条否决）。

## Consequences

- 矩阵 72→82 implementing、126→116 pending；P04 余量收窄；P14 伞行依赖解除。

## Verification

真实运行（2026-10-11，主线程复验）：

- 代理读数复核 + 修正后重跑：`./node_modules/.bin/tsc --noEmit -p .` 0；五 spec（desktop-extensions/mcp-form/session/page/session-view）→ **85/85**。
- 全量套件：**221 files / 1973 passed | 1 skipped**。
- 矩阵：`--write`、`--check-source`、`--check`、矩阵 gate、selftest 13/13 全 PASS。
