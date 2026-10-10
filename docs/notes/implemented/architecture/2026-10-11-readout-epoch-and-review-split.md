---
title: 投影面 epoch 货币化与回合评审分流
doc_type: architecture
module: sage-shell
topic: readout-epoch-and-review-split
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 投影面 epoch 货币化与回合评审分流

## Problem

ADR-0294 收紧了准入链的 Host epoch 货币性，但 UI 插件投影面（sage-readout `classifyPlugins`）仍直接消费启动时观测——宿主 epoch 死亡或移动后，读面会继续列出死 epoch 的插件行。同时两个语义裁决悬空：回合收口把 completed 一律轻终态，拆掉了需要人工评审事项的 artifact/receipt 路径；T13-A 的 `implementing→verified` 升级政策自 2026-10-10 起每批挂「待裁决」。

## Decision

1. **D1 投影面复用同一货币性判据**：`classifyPlugins` 在 inventory available 分支后加两道门——观测 `observation.kind !== 'active'` → `unavailable/host-epoch-unavailable`；观测 active 但 `!isInventoryObservationCurrent(inventory.evidence, observation)` → `unavailable/inventory-epoch-stale`。`isInventoryObservationCurrent` 签名放宽为结构参数（`{kind, bootId?, runtimeGeneration?}`），一处判据、两处消费。
2. **D2 blocked = 保持打开（确认）**：blocked 回合零收口事件、attempt 保持 active；映射留 clarification 整合票。
3. **D3 评审分流**：turn-close runner 读当前 revision 的 `actionPolicies`——被尝试任一 scope 命中 `requiresDecision=true` 时，completed 回合提前返回（保持打开，走评审）；失败族仍按 `attempt-failed` 收口；默认（无 decision 需求）维持轻终态。
4. **D4 verified 政策**：五维句级证据 + 独立复核方可升 verified；`countsAsVerification` 维持 false；政策家在 [ADR-0295](../../../adr/ADR-0295.md) D4，T13-A 迁移记录只留链接。

## Alternatives considered

- 投影面仅隐藏重复行：死 epoch 的行是错误声明而非陈旧真值，否决。
- blocked 强映射为 failed：语义错位且会引入无意义的 reconfirm 仪式，否决（用户裁决）。
- blocked 本批直连 clarification 域流：需要待答卡与应答续跑完整接线，留整合票。
- 全回合一律轻终态：拆掉评审路径，否决（用户裁决）。

## Consequences

- 读面与准入链共用一条货币性判据；死 epoch 的插件行不再展示。
- 收口语义闭环：默认轻终态、评审事项留评审、失败诚实收口、blocked 保持打开。
- T13-A 升级政策定案（ADR-0295 D4），后续迁移批可直接执行。

## Verification

真实运行（2026-10-11）：

- `node scripts/test.mjs run test/sage-readout.spec.ts test/session-turn-close.spec.ts test/runtime-inventory-currency.spec.ts` → **3 files / 15 tests passed**（readout 8、turn-close 4、currency 3）。
- `node --test scripts/gates/sage-route-authority.test.mjs` → **52 tests / 52 pass / 0 fail**（新增投影 epoch 事实组 + 四条具名突变：stale 门删除、gone 门删除、review 早退删除、requiresDecision 探测退化）。
- `node scripts/gates/adr-agent-records.mjs --write` → 295 篇 ADR 入账。
