---
title: 新建工作区表单（复用真实接入链路）
doc_type: architecture
module: sage-shell
topic: workspace-create-form
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 新建工作区表单（复用真实接入链路）

## Problem

R12 线 A：P13.create.empty / create.ready 两行（表单形状 + 就绪态）。Sage 已有真实 adopt 链路（pick+创建一体）。

## Decision

按 [ADR-0310](../../../adr/ADR-0310.md) 实施（并行代理 + 主线程最大努力复验）：表形状装配；「选择文件夹」复用 adopt 真实链路；两段式差异显式登记（创建点击仅结算草稿、请求恒 1）；草稿 state 上提抗 retry loading；图标/颜色本地占位并登记。

## Alternatives considered

见 ADR-0310 备选表（第二套路由、臆造清单、重复请求、人造延时——逐条否决）。

## Consequences

- 矩阵 83→85 implementing、115→113 pending；P13 伞行余 edit/remote/archive（pending）。

## Verification

真实运行（2026-10-11，主线程复验）：

- 代理读数复核：`./node_modules/.bin/tsc --noEmit -p .` 0；`node scripts/test.mjs run desktop-workspace-form/desktop-session/desktop-page` → **65/65**（我的复跑）。
- 全量套件：**222 files / 1980 passed | 1 skipped**。
- 矩阵：`--write`、`--check-source`、`--check`、矩阵 gate、selftest 13/13 全 PASS。
