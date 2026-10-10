---
title: 核对入口：attempt-status 只读查询与不确定门解封
doc_type: architecture
module: sage-shell
topic: attempt-status-reconciliation-entry
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 核对入口：attempt-status 只读查询与不确定门解封

## Problem

ADR-0296 D3 裁决「日志无请求痕迹」的卡死 attempt 保持活跃、待具名核对入口。renderer 现状（session-controller）：unknown send 后 `uncertainMatters` 纯内存封锁该 matter——**没有任何解封路径**：主链收口（observer/reconcile 凭新边沿轻收口）后 UI 无从得知，用户只能重启应用；封锁理由是纯文案，谁也答不了「上一条到底怎么了」。

## Decision

按 [ADR-0297](../../../adr/ADR-0297.md) 实施：

1. **只读路由**：`POST /.sage/session/attempt-status`（严格 `{}` 体）→ `session.attempt.status`（封闭操作表第 17 项）→ 统一 projection-read admission（candidate = active-matter；读取 owner = 请求作用域 ActiveContext）。
2. **provider（main）**：matter 事件库（活跃 attempt、`dispatchUnknown`、`observedTurnEndEdge`）+ 会话 fold（`lastTurnEndEdge`、`execution`）→ `SessionAttemptStatus`；requestId 由 `sessionRequestIdForAttempt` 派生；evidence 三态 `turn-running / turn-ended / awaiting-evidence`；**只读**。
3. **renderer**：`queryDesktopAttemptStatus()`（session.ts）+ controller 在不确定门封锁期间随后台读取悬挂触发；仅 `read + matterRef 匹配 + active === null` 解封并报告 `last.status`；重入保护；unavailable / 仍活跃维持封锁。
4. **走查手册**：19 条 grants 草案增补 `session.attempt.status` 读授权行。

## Alternatives considered

见 ADR-0297 备选表（correlation 键控、state envelope 塞入、fixture bypass、查询内自动收口、刷新即解封——逐条否决）。

## Consequences

- unknown send 的不确定门有了正式解封路径；「无痕迹」卡死诚实保持封锁（查询答「仍活跃 / 待证据」）。
- fixture 模式（无读策略）查询 unavailable——行为与今日一致；走查环境（真实策略 + 该 grant）全链可验。
- 路由注册面 60→61，read-only 族 13→14。

## Verification

真实运行（2026-10-11）：

- `node scripts/test.mjs run test/projection-read-routes.spec.ts test/product-app/desktop-session.spec.tsx` → **2 files / 44 tests passed**（新路由进入统一 admission 的 fail-closed 双例；未知锁定用例改断言「send 路径恰一次」；新增「仅在无活跃 attempt 的正面证据下解封并报告结算」用例）。
- 门禁自测：`node --test scripts/gates/sage-route-authority.test.mjs` → **55 tests / 55 pass / 0 fail**（新增 ADR-0297 事实组 + 三条具名突变：操作名卸载、派生 requestId 卸载、matter 读卸载；路由分母 61、read-only 计数 14、note 文案同步）。
- `node scripts/gates/adr-agent-records.mjs --write` 同步账本（297 篇）。
