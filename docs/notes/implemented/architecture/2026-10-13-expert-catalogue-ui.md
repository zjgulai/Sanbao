---
title: EP-1 专家列表 UI 与资源面——接管收口（ADR-0346）
doc_type: architecture
module: sage-shell
topic: expert-catalogue-ui
status: stable
created: 2026-10-13
updated: 2026-10-13
owner: self
source: human+ai
---

# EP-1 专家列表 UI 与资源面（ADR-0346）

## Problem

EP-0 投影（3 MGT + 50 AGT）已在仓，缺「专家」页与头像资源面（53 图，同源、CSP 不变、零文件系统路径面）。实现由并行会话（restore-expert-directory）完成于工作区；该会话上下文超图像限额（每请求 400），无法继续收口——按用户指示由本会话接管：核验、留痕、总门、提交。

## Decision

按 [ADR-0346](../../../adr/ADR-0346.md) 四项：专家页 design-only 目录（网格/计数 tabs/搜索/空态/虚线卡，创建与对话具名禁用）；53 头像 build 期封入 `SAGE_EXPERT_AVATARS` 静态表、main 按封存白名单伺服（GET/HEAD、nosniff、CSP 不变、路径遍历全 404）；投影由 `renderer-assets.mjs` 生成并构建期校验（stale/缺图/symlink 拒）；矩阵登记归独立「catalog 扩展批」（票原话），本批如实不登记。

## Alternatives considered

见 ADR-0346 备选表（运行时文件系统读 / data URL 内联 / 先接真实创建 / 本批内登记——逐条否决）。

## Consequences

- 「专家」页进入导航；EP-2（ExpertProfile 存储面）为下一票；「catalog 扩展批」登记 Sage 原生面为独立批。
- 资源面新增可复用模式：渲染资产=构建期封存 + 白名单伺服。

## Verification

真实运行（2026-10-13，本会话核验）：

- `tsc --noEmit` 干净。
- 全套件 `pnpm test`：**2225 passed（1 skip）**，246/246 文件全绿——含本批新 spec：
  - `desktop-experts.spec.tsx`：3+50 卡片与同源头像、筛选不创建运行态、搜索+筛选+空态恢复、创建/对话禁用具名。
  - `expert-assets.spec.ts`：53 同源头像与 design-only 投影构建、stale generated 拒（不改写）、缺图具名拒。
  - `desktop-experts-window.spec.ts`（独立默认桌面 Electron probe，无 Host/登录/模型）：头像全解码、真实输入导航、320px reflow、未创建专家/会话。
  - `desktop-entry.spec.ts` +43：53 头像逐一伺服断言（字节相等、HEAD、405、CSP 不变、遍历/编码变异 404、`/.sage/*` 不截获）。
- 总门（`pnpm run gate`，quick，2026-10-13）：**32/32 通过（exit 0）**——quality leg typecheck→build→test 全过（lib 生成含本批头像封存构建）；route-authority 64/64；matrix 206/206；台账 346 篇。
- 实机（staging）：随合并窗口批补录（A1–A4 同步）。
