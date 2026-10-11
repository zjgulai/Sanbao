---
title: 设置叶区（十一叶机器上桌）
doc_type: architecture
module: sage-shell
topic: settings-leaf-region
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 设置叶区（十一叶机器上桌）

## Problem

设置页此前只渲染 8 个外观 select；Ticket 046 的 11 叶机器（SETTINGS_LEAF_IDS，DMG-06 起生产 live 读）未上桌，对应 11 个矩阵 entry 行 pending。

## Decision

按 [ADR-0312](../../../adr/ADR-0312.md) 实施（与 R14 侦察并行的独立线，文件面零重叠）：`settingsLeaves` 新槽（闭合解析、畸形整槽省略）+ `DesktopSettingsView`「本机设置叶」区（title/state/source/note 逐字、零写入口、槽缺省无壳）+ 11 entry 行迁 implementing。

## Alternatives considered

见 ADR-0312 备选表（自造子页导航、混排两机器、空壳假声明——逐条否决）。

## Consequences

- 3 叶真实读数 + 8 叶诚实「未核验」在生产 live 可见；矩阵 87→98 implementing、111→100 pending。

## Verification

真实运行（2026-10-11）：

- `node scripts/test.mjs run test/product-app/desktop-settings-view.spec.tsx test/desktop-client.spec.ts` → **7/7 + 31/31**（叶行逐字渲染、零写入口、槽缺省无区、畸形列表与畸形行全槽省略；client 两处 exact 形状含 `settingsLeaves: []`）。
- 全量套件：**1992 passed | 1 skipped**（新槽零外溢）。
- 矩阵：`--write`、`--check-source`、`--check`、矩阵 gate、selftest 13/13 全 PASS。
- 页面接线（page.tsx，settings 调用点传 `leaves`）已并入本批；与 R14 侦察的 page.tsx 读取冲突面为零行改动（仅 settings 调用点一行）。
