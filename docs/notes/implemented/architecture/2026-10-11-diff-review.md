---
title: 变更摘要与差异审阅
doc_type: architecture
module: sage-shell
topic: diff-review
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 变更摘要与差异审阅

## Problem

Loop-Q R4 三行（A01.changes.created / A01.diff.created / A01.diff.modified）：Sage 回合终态无变更摘要与差异审阅面。盘点基座 `tool-fs`：编辑结果把展示 diff 持久入 `tool/result.meta`（重放可复现卡片）；write 创建 meta.diffs 为空、call 侧 content 为全文。fold 此前不读 meta。

## Decision

按 [ADR-0302](../../../adr/ADR-0302.md) 实施：

1. fold：`meta.diffs` → 有界 hunk（≤4×60 行，截断补「…」）+ added/removed 行计；空 diff 集视为无事实；write 创建回退 call 侧 content；basename 规则不变。
2. 契约/解析：`fileWrites[]` 增 `added/removed/hunks`；desktop 宽容解析。
3. renderer：footer「本轮文件修改摘要：N 个文件 · +A/-R」+ 审阅按钮（与执行过程共享展开态）；逐项 +A/-R +「查看本次修改」（红 `--sage-danger` / 绿 `--sage-success` 前缀行渲染）。
4. M02.edit.expanded blocker 改写（查看本次修改入口已接线）；A01 三行迁 implementing；撤销/复制路径/文件树/右侧面板登记。

## Alternatives considered

见 ADR-0302 备选表（预览容器承载 diff、右侧独立面板、自算折叠、全路径——逐条裁决）。

## Consequences

- 变更摘要与红绿差异 durable 可复现；矩阵 25→28 implementing、173→170 pending。
- 未装入口（撤销/复制路径/文件树/右侧面板）blocker 明写。

## Verification

真实运行（2026-10-11）：

- `node scripts/test.mjs run test/session-channel.spec.ts test/product-app/desktop-session.spec.tsx` → **39/39 passed**（fold：meta hunk 提取 +2/-2、hunk 内容断言、写创建回退 +3/-0 与基名断言；renderer：摘要「1 个文件 · +2/-2」、审阅展开列表项「+2/-2」、查看本次修改红绿行）。
- 全量套件：1943 passed | 1 skipped。
- 矩阵：`--write`、`--check-source`、`--check`、矩阵 gate、selftest 13/13 全 PASS。
