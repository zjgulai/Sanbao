---
title: Markdown 渲染接线与 streaming 行迁移
doc_type: architecture
module: sage-shell
topic: markdown-rendering
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# Markdown 渲染接线与 streaming 行迁移

## Problem

ADR-0298 D4 登记：`QDR.S01.session.streaming` 行断言「Markdown 标题／列表逐步出现」，全仓无 Markdown 渲染器（desktop 与 app 线回复均纯文本）。引入渲染库属治理级依赖新增。用户裁决：引入成熟库。

## Decision

按 [ADR-0299](../../../adr/ADR-0299.md) 实施：

1. 依赖：`react-markdown@10.1.0` + `remark-gfm@4.0.1`，`--save-exact` devDeps（bundle 经 esbuild，runtime deps 保持空）。
2. `MarkdownText`（`src/product/app/markdown.tsx`）：流式气泡与 durable 回复共用；raw HTML 不渲染；链接文本化（受控外链为登记后续）；GFM 开启。
3. desktop styles：`.reply-body` 去 pre-wrap、补 md 块级样式（标题/列表/代码/引用/表格，全部闭合 token）；用户消息保持 pre-wrap 字面。
4. 契约测试重写：`desktop-session-view.spec`「字面保留」→「用户字面 + 助手渲染」；新增 raw HTML 安全例；`desktop-session.spec` 流式例断言 h2/li 逐步渲染。
5. 矩阵：`QDR.S01.session.streaming` ui `pending→implementing`（4 条 tracked-test refs，`countsAsVerification:false`）+ blocker 登记真机边界；`--source-root vendor/sanbao-prototype --write` 重算 summary 后 `--check-source` / `--check` / 矩阵 gate / selftest 全 PASS。

## Alternatives considered

见 ADR-0299 备选表（自写子集、暂缓、rehype-raw、直通链接——逐条裁决）。

## Consequences

- 执行面 Markdown 保真上线；行迁移 19→20 implementing、179→178 pending（verified 8 不变）。
- 遗留：app 线渲染同步、链接外链化、真机流式观感/取消语义（走查）。

## Verification

真实运行（2026-10-11）：

- `node scripts/test.mjs run test/product-app/desktop-session-view.spec.tsx test/product-app/desktop-session.spec.tsx` → **2 files / 23 tests passed**（标题 h2、粗体 strong、流式 h2/li、raw `<script>` 不落 DOM、用户字面 pre-wrap 保持）。
- 全量套件：1935 passed | 1 skipped。
- 矩阵：generator `--check-source` PASS（206 rows）、矩阵 gate PASS、selftest 13/13；diff 审计仅 1 行三字段 + 派生 summary。
