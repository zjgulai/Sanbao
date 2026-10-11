---
title: R17-C 快捷键/语音壳批：结构复刻 + 真实本地搜索与弹窗壳（P06）
doc_type: architecture
module: sage-shell
topic: r17c-shortcuts-voice-batch
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: ai
---

# R17-C 快捷键/语音壳批：结构复刻 + 真实本地搜索与弹窗壳（P06）

## Problem

R17 波 C：shortcuts 5 行 + voice 7 行 + 两入口行 pending。观测齐备（QB17-01 十六命令五组、QB18-01/02 搜索两态、QB18-03 发送菜单、QB18-04 编辑弹窗；QB18-05 四组十三行、QB18-06/07/08 菜单、QB19-01/02/03 设备/弹窗/草稿）。

## Decision

按 [ADR-0319](../../../adr/ADR-0319.md) 实施：结构逐字复刻（绑定值不给伪造读数）+ 三件真实本地交互（本地搜索、编辑弹窗壳、草稿输入）+ 五菜单态只登记不渲染。偏好 store 独立成批（T13 子批 4），本波零写入。

## Alternatives considered

见 ADR-0319 备选表（渲染键帽、五菜单全渲、完整录制器、草稿直连添加——逐条否决）。

## Consequences

- 两页落地；矩阵 118→132，pending 33→19；P06 剩余：models 10（波 B 裁决前置）、9 入口（波 D）、两占位。
- 五菜单与偏好 store、录制/校验/冲突/保存：T13 子批具名。

## Verification

真实运行（2026-10-12）：

- tsc 0 错；新 spec `desktop-settings-r17c.spec.tsx` 3 例（五组十六行+本地搜索两态+清空恢复；弹窗壳开/禁用保存/取消/发送行无铅笔；语音四组十三行+弹窗+草稿输入添加恒禁用）；R17-A spec 与既有 settings 面全绿。
- 矩阵 `--write`/`--check-source` PASS（206 行；132/66/8）。
- `pnpm run gate` 退出码见提交记录。
