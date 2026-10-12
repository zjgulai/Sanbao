---
title: 既有根 profile 事务升级——模板清单不同即换位，指针写入为提交点
doc_type: architecture
module: sage-shell
topic: profile-upgrade-transaction
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: human+ai
---

# 既有根 profile 事务升级

## Problem

既有数据根永远不升级（`existing` 短路），换 id 又拒装——宿主侧修复（ADR-0327/0329/0330 的 generation 字节）在本轮全部靠**手工 rsync + 手改指针**抵达活动根（三次）。交付通道缺失。

## Decision

见 ADR-0332：启动读模板清单（幂等 existing / 不同即升级）；staging 与 fresh 共享同一验证块（提取 `stageTemplateGeneration`）；同 id 换位（旧树 displaced 备份）、换 id 并存；`writeActivePointer` 原子写为提交点，之前失败回滚、成功后清备份；新态 `upgraded` 入日志；pristine 与残留拒绝不放松。

## Alternatives considered

- build 号提升：批内被钉死；且同 id 场景仍需换位。否决为主路径。
- 远端拉取：未验签输入；否决。
- 完全双代并存：换位方案已覆盖同 id；并存仅用于换 id。

## Consequences

- 宿主修复走正常安装抵达；手工同步退场。
- 已知边界（文档化）：kill -9 恰落在两次 rename 之间 → 启动 fail closed、displaced 副本可恢复；启动自愈列为独立后续票。
- spec：同 id 换位（幂等 + 无残留）、换 id 并存（旧树保留）两用例；既有「第二次启动」用例改为传真实模板（新语义：模板每启必读）。

## 证据

- 手工等价操作两次成功（rsync+指针改哈希）；本机根 profile 已由此路径处于 v12。
- 全套件 236 文件 2093 passed；gate 32/32。
