---
title: 产物卡右栏与受控预览接线
doc_type: architecture
module: sage-shell
topic: artifact-rail-and-preview
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 产物卡右栏与受控预览接线

## Problem

Loop-Q R2 两行（`QDR.A02.output.html`、`QDR.P14.preview.html`）：desktop 线不消费 artifacts 槽——产物卡与预览在工作面不可见。盘点确认：预览容器（main-owned 受控 WebContentsView）与全部既有路由早已存在；缺口仅在 desktop 侧消费与动作。

## Decision

按 [ADR-0300](../../../adr/ADR-0300.md) 实施：

1. client 闭合解析 `artifacts`（cards + preview 四态；malformed 槽省略）。
2. `artifact-rail` 右栏：卡片（名称/类型/大小/状态）+「更多操作」details 菜单（面板打开/独立窗口）+ preview 状态块（opening/ready/failed，含关闭预览/全屏/独立窗口开关/重试）。
3. `SAGE_PREVIEW_PANEL_WIDTH=512` 上移共享 contracts；`.session-layout.preview-open` 避让右侧面板。
4. `desktop/artifacts.ts` 五路由薄封装；动作后 `refreshNow` 后台重读。
5. 地址栏/两层标签不复刻（受控容器无导航面）——两行 implementing + blocker 登记差异与真机边界。

## Alternatives considered

见 ADR-0300 备选表（自渲染文档、照搬导航 chrome、rail 并排、foreground refresh——逐条否决）。

## Consequences

- 观察 feed → 卡片 → 受控面板全链接线；矩阵 20→22 implementing、178→176 pending。
- 真机验证（真实 HTML 产物 + 视觉）待走查。

## Verification

真实运行（2026-10-11）：

- `node scripts/test.mjs run test/product-app/desktop-session.spec.tsx test/desktop-client.spec.ts` → **43/43 passed**（rail 渲染 + 面板打开 POST 载荷断言 + 重读断言；preview ready 状态块 + 避让类 + 关闭 POST；failed 重试 + malformed 槽省略不渲染）。
- 全量套件：1938 passed | 1 skipped。
- 矩阵：`--write`（源根 vendor/sanbao-prototype）、`--check-source`、`--check`、矩阵 gate、selftest 13/13 全 PASS。
