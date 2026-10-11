---
title: L1-B 事项分组四 op 收口：同家族扩展与真动作入口
doc_type: architecture
module: sage-shell
topic: matter-groups-admission-batch
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: ai
---

# L1-B 事项分组四 op 收口：同家族扩展与真动作入口

## Problem

matter-groups 四 op 直连（violation）；读面在位、零动作入口。

## Decision

按 [ADR-0321](../../../adr/ADR-0321.md)：四 op 入 matter-governance 家族 + 单家族多路 dispatch + 成员逐行 + UI 建立/改名/移除真入口（成员选择态具名）。门禁翻转 20/14/15。

## Alternatives considered

见 ADR-0321 备选表（第二家族、membership UI 同批、保持直连——逐条否决）。

## Consequences

- 分组命令全链；violation 余 20（L1-C..G 五波已规划覆盖 19 条，auth-special ×2 独立设计）。

## Verification

真实运行（2026-10-12）：

- tsc 0 错；新增 groups dispatch spec 3 例 + 内核群 kind 守卫例 + 三处既有 spec 按新事实改写（groups 路由经真 dispatch 端口；wiring spec 全链前置；表钉扩十四行）；全量 **2065 passed | 1 skipped**。
- route-authority：路径集扩 matter-groups、判据 20/14/15、矩阵行翻转；selftest 56/56；`pnpm run gate` 退出码见提交记录。
