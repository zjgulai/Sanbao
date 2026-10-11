---
title: R17-A 设置壳批：观测导航 + 四默认页结构复刻（P06）
doc_type: architecture
module: sage-shell
topic: r17a-settings-shell-batch
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: ai
---

# R17-A 设置壳批：观测导航 + 四默认页结构复刻（P06）

## Problem

P06 设置族 40 行 pending（矩阵最大单块）。观测证据齐备（QB7-01/QB15-01/QB15-02/QB16-01，仓内副本 `vendor/sanbao-prototype/dist/research/`）；Sage 设置面此前只有单一「外观与显示」section，无观测导航结构。

## Decision

按 [ADR-0318](../../../adr/ADR-0318.md) 实施波一：设置壳（返回应用 / 搜索设置 / 导航项；只渲染已有页面的入口）+ 四默认页结构复刻（组/行名/说明逐字；无机器行给诚实「未接线」，零伪造读数、零动作入口）+ profile 页真身份事实与真 login/logout。写路径独立成批（T13 子批），本批零写入。R17 波次登记：A（本批）→ C 快捷键+语音 12 行 → B 模型编辑器 10 行（BYO API Key 凭证面待裁决）→ D 杂项薄观测行。

## Alternatives considered

见 ADR-0318 备选表（24 入口全渲、默认面板改个人资料、显示观测默认值、本批接写路径——逐条否决）。

## Consequences

- 设置壳与四页落地；矩阵 111→118，pending 40→33；`账号与设置` 既有外观验收落点不变（默认面板=外观，本地规则）。
- 余量具名：shortcuts/voice（波 C）、models（波 B，裁决前置）、杂项入口与 24 入口全展开（scope.unexpanded）。

## Verification

真实运行（2026-10-12）：

- tsc 0 错；新 spec `desktop-settings-r17.spec.tsx` 6 例（导航落点、常规 19 行结构+未接线+零伪造控件、模式/监控组数、profile 真事实+真动作+无账户时零控制、搜索过滤+清空、返回应用回拨）；既有 `desktop-page`/`desktop-session`/`desktop-settings-view` 全绿。
- 矩阵 `--write`/`--check-source` PASS（206 行；118/80/8）。
- `pnpm run gate` 退出码见提交记录。
