# 回合收口第一刀：轻终态事件解锁重复发送

- 日期：2026-10-11
- 决策：[ADR-0293](../../../adr/ADR-0293.md)
- 状态：已实施（域第 12 型事件 + cursor 边沿 + 收口 runner + 观察次序 + 门禁事实；send 前 reconcile 兜底 2026-10-11 增补，见 ADR-0293 备选表）；blocked 语义登记未闭。

## Problem

dispatch v1 不写收口 → 第二次 send 被 `active-attempt` 诚实拒绝；域既有 artifact→receipt 收口是人工评审语义，逐回合执行不可行。侦察报告提出粒度疑问；用户裁决：域扩展轻终态事件，per-send attempt 保留。

## Decision

1. `attempt-succeeded`（第 12 型）：载荷 `{attemptId}`；投影 succeeded、清 active、stage 回 `evidence`——同 revision 立即续发。
2. `lastTurnEndEdge = cursor:kind` 加法字段（修复同 kind 连续回合漏触发；`lastTurnEnd` 保持 kind 串供 UI 分支）。
3. 收口 runner：completed→轻终态；error 族→既有 `attempt-failed`(runtime)；blocked/未知保持打开；`turn-close:<attemptId>:<kind>` 幂等；fire-and-forget。
4. 收口先于 artifact 观察；门禁六突变；域侧 12 型完备性 pin 与突变夹具。

## Alternatives considered

- artifact+receipt 每回合 / per-revision 粒度 / 复合串 / blocked 强映射 / send 前 reconcile——逐条理由见 [ADR-0293](../../../adr/ADR-0293.md) 备选表。

## Consequences

- 重复发送解锁（真实库 spec 实证）：completed 收口后同 revision 可续发；失败回合入 failed-retry 仪式；blocked 诚实保持打开。
- 未闭：blocked 裁决、回合产物与轻路径并存策略、宿主生命周期失效。

## Verification

证据（2026-10-11，全部真实执行；未跑的照实写）：

- **收口 spec（真实 sqlite）**：`test/session-turn-close.spec.ts` **3/3**——completed 收口：active 清空、attempt 状态 succeeded、末事件 `attempt-succeeded`、**同 revision 立即起第二次 attempt 成功**、重复观察零追加（幂等）；error → `attempt-failed`（runtime）且状态 failed；blocked 与未知 kind 零追加且 attempt 保持 active；无活动 attempt 与未知 matter 均 no-op。
- **域侧**：rehydration spec（现 3 条历史）**12 型完备性 pin** + `attempt-succeeded` 载荷突变夹具全绿；business-matter 域测全绿。
- **全量套件**：216 文件 / 1907 通过 / 1 skip（exit 0）。
- **门禁自测**：`node --test scripts/gates/sage-route-authority.test.mjs` **49/49**（收口事实组 + 六条具名突变：边沿键回退 kind / 渠道边沿退化为 kind / blocked 收口 / 分类表漂移 / appendId 漂移 / 观察次序删除）。
- **门禁**：`pnpm run gate` 32/32（objects 319/319，exit 0）。
- 未运行：host 回合的实机观察链（边缘触发在真机验证属后续验收）；produce（不动 publications）。
