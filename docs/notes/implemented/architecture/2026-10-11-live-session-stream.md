---
title: 执行模块第一刀：活流式输出（SSE follow）
doc_type: architecture
module: sage-shell
topic: live-session-stream
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 执行模块第一刀：活流式输出（SSE follow）

## Problem

Loop-Q 第 1 轮第一行 `QDR.S01.session.streaming`（Qoder 复刻矩阵执行回流面之首）：断言 Markdown 内容逐步出现、视区随输出推进、停止按钮保持可用。Sage 现状盘点：live 帧（`assistant-stream`）被通道 fold 明确忽略；renderer 只有 durable 呈现；main↔renderer 无 push 面；全仓无 Markdown 渲染器。

## Decision

按 [ADR-0298](../../../adr/ADR-0298.md) 实施：

1. `sessionChannel.followLive`：对既有 `session/follow` 有界流显式重订阅；`chunk.index` 去重、`turn/start` 重置、首个 `turn/end`（含晚订阅 snapshot 内已含终态）或 abort 即停；批次间 250ms 呼吸防锤击。
2. `GET /.sage/session/stream`：操作名 `session.stream.follow` 入封闭表，统一 projection-read admission；SSE `ReadableStream` 在回调内构建；renderer abort → body cancel → follow abort。
3. renderer：`consumeSessionStream`（SSE 解析）+ controller executing 窗口订阅（abort 清理，live 文本仅呈现层）+ session-view「正在生成」气泡 + 视区跟随。关闭不强制 refresh，durable 由轮询照常覆盖。
4. 走查 grants 草案增补 `session.stream.follow` 授权行。
5. 行 `QDR.S01.session.streaming` **不迁移**：Markdown 渲染依赖待裁决；缺口登记（见下）。

已知缺口与观察项：

- Markdown 渲染器缺失（全仓）——影响本行与最终回复保真；依赖新增待用户裁决。
- 协议层取消语义（renderer abort → SSE body cancel）仅真机可验——进走查清单。
- 同一 execution 窗口内排队回合的联动流式（followLive 单回合返回）——真机观察后定策。

## Alternatives considered

见 ADR-0298 备选表（IPC push、轮询替身、本批引入 Markdown 库、跨回合常开——逐条裁决）。

## Consequences

- 执行模块第一块真实活流面上线；路由 62、操作 18。
- 本行仍未迁移——诚实登记缺口而非假绿。

## Verification

真实运行（2026-10-11）：

- `node scripts/test.mjs run test/session-channel.spec.ts test/product-app/desktop-session.spec.tsx` → **2 files / 31 tests passed**（followLive 四例：有序去重+turn/end 停、abort 即停、无会话零调用、晚订阅 snapshot 终态即退；renderer SSE 例：executing 窗口内出现 live 文本、流关闭即清除；两条既有轮询例随订阅同伴断言修正）。
- 门禁自测：`node --test scripts/gates/sage-route-authority.test.mjs` → **56 tests / 56 pass / 0 fail**（新增 ADR-0298 组 + 三条具名突变：操作名卸载、去重退化、turn/end 停删除；路由分母 62、read-only 15、note 文案同步）。
