---
title: 端点表与端点正则同集——workspaceFiles 全族被自家门拒杀整桥
doc_type: architecture
module: sage-shell
topic: endpoint-gate-parity
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: human+ai
---

# 端点表与端点正则同集

## Problem

v11 走查（回合终点产物观察）实测取证：

- 出站探针：`[invalid-out] {"type":"bridge-call","endpoint":"workspaceFiles/changes","payload":[{"workspaceRoot":…}]}`；
- 随即 `[host-fail] fatal sage shell: invalid Electron IPC command`（host `isHostCommand` 拒收）→ host 自杀（`child.kill`）→ `host response pipe ended` + `host IPC disconnected` → 整桥死亡；
- 之后一切读面 `fresh-scope`/`bridge-host-not-ready`。

根因：`BRIDGE_ENDPOINT` 正则（全小写段）与端点表自相矛盾——`workspaceFiles/*` 六端点（camelCase 段）不过自家正则。回合收尾 artifact 观察走 `workspaceFiles/changes` ⇒ **每次含产物观察的回合都炸桥**。这也解释历次归因：dispatch 后 outcome-unknown（回执随桥死于 fatal）、失败/成功回合后连读面塌。ADR-0327（懒激活）与 ADR-0329（scoped 拆除）是外围误报的真实修正（各有探针证据），本条为主因。

## Decision

见 ADR-0330：正则段内允许 camelCase（段首仍小写）；`protocol.spec.ts` 增护栏——表内每端点必须过 `isHostCommand`；不改表。

## Alternatives considered

- 六端点改名小写：波及面大；否决。
- 只放宽不加护栏：教训本身要求机械守护；否决。

## Consequences

- `workspaceFiles/*` 全族（产物观察 changes 流、run-log、edit-drafts 源读、文件候选）恢复；桥不再因合法调用自杀。
- 表↔门同集成为 spec 不变量。

## 证据

- `[invalid-out] …workspaceFiles/changes…` 与 30ms 后的 `fatal sage shell: invalid Electron IPC command`（同一日志相邻行）；
- 正则×表离线枚举：37 条中 6 条不过正则（恰为 workspaceFiles 族）。
