---
title: R16 壳批：事项名册/管理读回、事项分组与侧聊（O04/P15/S09）
doc_type: architecture
module: sage-shell
topic: r16-shell-batch
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# R16 壳批：事项名册/管理读回、事项分组与侧聊（O04/P15/S09）

## Problem

R16 = sweep 剩余壳家族（O04/P15/S09，账本全无叶、三族机器已在 main、desktop 零消费、三路由 violation）。ADR-0315 已裁纯壳口径与独立 admission 批。

## Decision

按 [ADR-0316](../../../adr/ADR-0316.md) 实施（侦察三线 + 裁定采纳在前）：三槽+sideChats 闭合解析；工作区页「事项」分区（名册+管理读回+分组读回，零动作入口+具名说明行）；会话页侧聊名册（四动作具名未接通、零请求）；多窗格/后台展开面剔除记录；运行模式陈旧 outstanding 清理。**与 S03 的关键分野**：S03 路由 compliant 故直连；本批 violation 路由零接触——接通即深化 bypass。

## Alternatives considered

见 ADR-0316 备选表（接通 violation、选择态、新导航页、静态占位——逐条否决）。

## Consequences

- 工作区/会话两页获得三族读回面；矩阵 108→111。
- 余量具名：写动作+选择态（admission 批）、transcript、多窗格、后台 Agent/进程。

## Verification

真实运行（2026-10-11）：

- tsc 0 错；全量套件：**2018 passed | 1 skipped**（新增 matter-admin 2 例 + side-chats 2 例；desktop-client 精确形状断言补三槽）。
- 矩阵 `--write`/`--check-source` + 门禁 + 自测 PASS（206 行）。
- `pnpm run gate` 退出码见提交记录。
- 待真机：三族真实读数（空态/真实行）——走查手册第 18 步；本记录不升格。
