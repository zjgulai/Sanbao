---
title: 回合过程面（完成元信息与文件活动）
doc_type: architecture
module: sage-shell
topic: turn-process
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 回合过程面（完成元信息与文件活动）

## Problem

Loop-Q R3 三行（M01.reply.completed / M02.file.writing / M02.edit.expanded）：Sage 回合终态只有 endKind 串，无耗时/迭代/文件过程事实；通道 fold 忽略 `step/start`、`tool/call`、`tool/result` 事件。盘点基座 `ui-chat` 确认：`time` 为毫秒纪元（`turn.end.time - turn.start.time` 求耗时）、工具族名 `write/edit/apply_patch`、参数键 `file_path/path`。

## Decision

按 [ADR-0301](../../../adr/ADR-0301.md) 实施：

1. fold 累积 `turnProcess`（turn/start 重置；step/start 计数；write 族 tool/call→running、tool/result 结项；毫秒戳耗时缺则 null；basename only；上限 12）。
2. `SessionChannelStatus.turnProcess` 契约三构造 + pageFold 合并；desktop 宽容解析。
3. renderer：执行中 live 行（观察起算 ticker）+ 终态 footer（标签/耗时/步数）+ 可折叠执行过程列表；error/aborted 无耗时。
4. 三行迁 implementing；「查看本次修改」入口（A01 diff 未装配）blocker 明写。

## Alternatives considered

见 ADR-0301 备选表（SSE 增量、全路径、arrival 计时、占位入口——逐条否决）。

## Consequences

- 完成态可复现（durable）；`tool/*` 事件获得 fold 消费者，为 A01/S10 铺路。
- 矩阵 22→25 implementing、176→173 pending。

## Verification

真实运行（2026-10-11）：

- `node scripts/test.mjs run test/session-channel.spec.ts test/product-app/desktop-session.spec.tsx` → **37/37 passed**（fold 案例：耗时 7000ms/2 迭代/单工具项 1900ms/basename 断言（输出不含 `/Users/`）；失败结项与 turn/start 重置；renderer：footer「已完成 · 耗时 12s · 3 步」+「执行过程（1）」「编辑 demo.html · 完成 · 3s」+ live 行「正在写入 demo.html」）。
- 全量套件：1941 passed | 1 skipped。
- 矩阵：`--write`、`--check-source`、`--check`、矩阵 gate、selftest 13/13 全 PASS。
