---
title: 候选列举空路径翻译——'' 表根、绝对根过 base 契约
doc_type: architecture
module: sage-shell
topic: root-listing-translation
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: human+ai
---

# 候选列举空路径翻译

## Problem

步骤 12 实测：根列举（`path:''`）→ base `gateway/bad-request` → `bridge-search-query-rejected` → 面板出错；子路径正常。契约对齐：shell 守卫有意放行 '' 表根；base README 明文「An empty read or listing path is a gateway/bad-request」，其客户端以**绝对根路径**列根（输出侧 path='' 表根）。

## Decision

见 ADR-0331：`createFileCandidates` 在 shell 边界把 `''` 翻译为 `workspaceRoot`（绝对根）再上桥；其余守卫与语义不动。

## Alternatives considered

- renderer 传绝对根：泄漏 base 语法；否决。
- 改 base：外部契约，不做。
- 新端点：无谓新面。

## Consequences

- 根与子目录列举均可用（装版实测：AGENTS.md 等真实行）；spec 载荷断言锁翻译。

## 证据

- `[cand-throw] bridge-search-query-rejected`（''）；子路径 `state:'read'` 对照；
- 翻译后实测 `state:'read'` + `AGENTS.md` 候选行。
