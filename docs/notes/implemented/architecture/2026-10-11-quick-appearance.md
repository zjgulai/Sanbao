---
title: 账号菜单快捷外观子菜单
doc_type: architecture
module: sage-shell
topic: quick-appearance
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 账号菜单快捷外观子菜单

## Problem

Loop-Q R7 弹层族盘点：O 族 pending 26 行中，多数依赖 T10 治理（O08 MCP 表单）、知识/站点存储（OBS02/03）或属待核验伞行；可即时装配且数据源齐全者 = OBS04 快捷外观 5 行（menu.open + color-mode/language/font-style/content-width；theme/text-size/ui-scale 已有 N/A 裁决不动）。

## Decision

按 [ADR-0305](../../../adr/ADR-0305.md) 实施：

1. 账号菜单新增「外观」子菜单（aria-haspopup/expanded），四项 = 明暗模式/语言/字体风格/内容宽度，`select` 渲染（系统原生菜单同形）。
2. 读订阅 `DevicePreferencesController`（与设置页同权威）；变更即 `save`；不可读 → 「偏好不可读（code）」；保存中禁用。
3. 选项值取 `DEVICE_PREFERENCE_OPTIONS` 单一来源。
4. 5 行迁 implementing；三行 N/A 不动；summary 30→35 implementing、168→163 pending。

## Alternatives considered

见 ADR-0305 备选表（O08 表单刀、自绘 popper、跳设置页——逐条裁决）。

## Consequences

- 快捷外观四项上线（同权威、同选项表）；弹层族余量 = MCP 表单刀 / 存储刀 / 伞行核验刀。

## Verification

真实运行（2026-10-11）：

- `node scripts/test.mjs run test/product-app/desktop-session.spec.tsx` → **18/18 passed**（子菜单展开、四 select 存在与初值、明暗模式变更 → `save({theme:'dark'})`、不可读 controller → 诚实 note）。
- 全量套件：1947 passed | 1 skipped。
- 矩阵：`--write`、`--check-source`、`--check`、矩阵 gate、selftest 13/13 全 PASS。
