---
title: 收口证据域定界与 dispatch-unknown 裁决
doc_type: architecture
module: sage-shell
topic: closure-evidence-scoping
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 收口证据域定界与 dispatch-unknown 裁决

## Problem

C2 侦察确认已出货缺陷（f069e97e 起的 reconcile 兜底与 ADR-0293 observer 同洞）：收口决策使用「会话内最后一个 turn-end 边沿」，不校验该边沿晚于当前 attempt 开始。dispatch 未抵达（outcome-unknown）且用户重发时，fold 只剩 attempt 开始前的旧边沿，observer 或 reconcile 会用它把 attempt 记成 succeeded/failed——错误事实。observer 的边沿去重为纯内存，进程重启后同一旧边沿会被当新边沿重放，使 observer 路径独立触发。根因：attempt 开始时未记录边沿基线。

## Decision

1. **D1 基线入 attempt-started**：persist 步新增读端口 `readObservedTurnEndEdge(matterRef)`（index 接线到 raw `sessionChannel.read`，无 observer 副作用）；fold 不可读（`undefined`）→ 步骤 `unavailable` fail closed；基线以可选字段 `observedTurnEndEdge: string | null` 入 `attempt-started` 载荷（域输入可选仅供旧记录逐字节重放；codec `assertAttempt` 接受可选键，值须 string|null）。
2. **D2 守卫单一出口**：runner 拒绝非新边沿——`edgeIsNew = attempt !== undefined && attempt.observedTurnEndEdge !== undefined && attempt.observedTurnEndEdge !== edge`；`if (!edgeIsNew) return`。observer 传 `status.lastTurnEndEdge`；reconcile 的 Fold 加 `lastTurnEndEdge` 并透传。校验顺序：kind 白名单 → 读 matter → 边沿守卫 → review 分流。
3. **D3–D6 裁决**（证据政策/第 13 型事件/派生 requestId/分票）落 [ADR-0296](../../../adr/ADR-0296.md)，本节不复述。

## Alternatives considered

见 ADR-0296 备选表（仅 reconcile 加守卫、null 基线、dispatch 步基线、channel 回传 requestId、全链仪式——逐条否决）。

## Consequences

- 旧边沿收口新 attempt 的洞在 observer 与 reconcile 两条路径同时关闭；重启重放不再产生错误收口。
- 附代价：无基线旧记录与「日志无痕迹」attempt 诚实保持活跃，等待具名核对入口（对账票）。

## Verification

真实运行（2026-10-11）：

- 联合回归：`node scripts/test.mjs run test/session-turn-close.spec.ts test/session-send-reconcile.spec.ts test/session-prompt-persistence.spec.ts test/session-prompt-dispatch.spec.ts` → **4 files / 22 tests passed**。新增红绿测试：turn-close「refuses a stale edge or an attempt with no recorded baseline」（等值拒绝→新边沿收口→无基线拒绝）、reconcile「refuses to close on the stale edge the attempt already started with」、persistence「unreadable fold → unavailable」与基线载荷断言、assembly 门新增 `turnEndEdgeRead` 缺省不构造 case。
- 门禁自测：`node --test scripts/gates/sage-route-authority.test.mjs` → **53 tests / 53 pass / 0 fail**（新增 ADR-0296 组 + 五条具名突变：守卫删除、等值比较退化、fail-closed 删除、index 接线漂移、reconcile 边沿卸载；三条既存突变文本随源码同步）。

## 实施增补（2026-10-11）：第 13 型标记与派生 requestId

ADR-0296 D4/D5 已实施：

1. 域第 13 型 `attempt-dispatch-unknown`：`markDispatchUnknown` 仅活跃 running attempt 可标记，零状态变动；投影 `dispatchUnknown: true`；codec 校验/重放齐。
2. recorder（`session-dispatch-unknown.ts`）：读 matter → 域撰写 → 一条 `appendRevision`（appendId `attempt-unknown:<attemptId>` 幂等）；best-effort 不抛，失败即回到「未标记的活跃 attempt」保守态。
3. dispatch：`evidence.attemptId` 缺失 → not-dispatched（先于通道调用）；通道调用携带 `requestId: sessionRequestIdForAttempt(evidence.attemptId)`；捕获抛错后**先落标记再返回** outcome-unknown。
4. app-service：dispatch 门新增 `sessionPromptAttempts` / `authority` 必需；recorder 用同一 store 手柄与受信时钟。

验证（真实运行 2026-10-11）：`node scripts/test.mjs run test/business-matter.spec.ts test/session-turn-close.spec.ts test/session-prompt-dispatch.spec.ts` → **3 files / 45 tests passed**（含 unknown 标记断言、无身份 not-dispatched、13 型域守卫、D3「unknown 标记 + 陈旧边沿拒绝 + 新边沿收口」）；门禁自测 → **54 tests / 54 pass / 0 fail**（新增四条具名突变：requestId 卸载、标记卸载、派生漂移、appendId 漂移）。
