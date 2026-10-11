---
title: 启动失败可见面：ready 后前显对话框 + 稳定退出
doc_type: architecture
module: sage-shell
topic: startup-failure-surface
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: ai
---

# 启动失败可见面：ready 后前显对话框 + 稳定退出

## Problem

2026-10-13 白屏取证（本机实测）：打包首启失败（根非 pristine/路径 symlink/profile 拒装）时，pre-ready 错误框可被空白窗遮挡、进程无限等待；失败只写 launcher stderr——用户只见白屏。拒装是正确行为，呈现不是。

## Decision

按 [ADR-0322](../../../adr/ADR-0322.md)：新 `src/main/startup-failure.ts` 单家收口（stack→stderr；await ready 后前显具名对话框；dismiss 后 exit(1)；never-throws）；index.ts bootstrap catch 改走模块。

## Alternatives considered

见 ADR-0322 备选表（BrowserWindow 失败窗、放宽 pristine、硬超时——逐条否决）。

## Consequences

- 打包启动失败从「白窗+隐匿日志」变为「前显具名对话框」。
- 打包内实机验证随下一次 produce（v5 链）；本批不重打 DMG。

## Verification

真实运行（2026-10-12）：

- tsc 0 错；新 spec `startup-failure.spec.ts` 2 例（顺序 log→ready→box→exit 精确断言；全依赖失败仍 exit(1)）；全量 **2067 passed | 1 skipped**。
- 打包实机（首启失败→前显对话框）：**待 v5 produce 验证**（本批不重打包）。
- `pnpm run gate` 退出码见提交记录。
