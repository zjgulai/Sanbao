---
title: CTX-01C 设备聚合读与失败信封直传——生产冷启动死锁修复
doc_type: architecture
module: sage-shell
topic: projection-read-device-aggregate
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: human+ai
---

# CTX-01C 设备聚合读与失败信封直传——生产冷启动死锁修复

## Problem

v5 打包版生产走查在步骤 5（选择事项）受阻。三个实测事实把根因钉死：

1. 装版探针（临时打入 route-skeleton 的 `console.error`）读数：`state.read` 的真实 admission 结果 `{"state":"unavailable","code":"projection-read-unavailable","stage":"initial-context"}`。
2. 死锁链：`initial-context` 要求 `activeMatterContext.snapshot()` 非空（`app-service.ts`）→ 激活唯一入口 `/.sage/context/select` 只由「选择事项」按钮触发 → 按钮只渲染于 state 载荷的 read 名册（`matter-list-view.tsx`）→ 载荷被同一道门拦住。生产冷启动无任何路径打破闭环；「重新读取」永远无效。
3. 遮掩：fixture 旁路（`SAGE_FIXTURE_PROJECTION=1`，state.read 直接跳过 admission）与 DMG-06 只查启动日志行，使生产读面从未被走到。

第二缺陷（仪器）：路由兜底信封把一切失败改写成 `stage:'read-policy'`，renderer 谓词也钉死该值——排障长期被指向错误一环。

## Decision

见 ADR-0324（D1-D5）。要点：

- 新 kernel `admitDeviceAggregateRead`：仅 `state.read`、仅 context inactive、会话域（caller + 已登录会话 + ready/uncontaminated frame），读后回响 identity/frame；fail closed 对未登录。
- 读参放宽 `ProjectionReadScope | null`；设备读传 `null`，matter 槽保持 production-null。
- route-skeleton 直传 admission 类型化失败（真 stage）；兜底只留 runner 缺席/畸形/抛错；renderer 谓词去掉 stage 钉。
- 门禁 pin（guard 原样、单 call site、kernel 步与回响）+ selftest 四突变；新 kernel spec + production 正负例。

## Alternatives considered

- 放宽 admission 链允许无 matter（改 initial-context）：污染 matter 链语义，排他性难钉；否决。
- bootstrap 路由携带名册：同一事实两个家；CAS 代际无处安放；否决。
- 维持 fixture 模式走查：走查对象必须是生产形态；fixture 旁路正是遮掩源；否决。
- 保留 stage 折叠：仪器失真（P-70 家族）；否决。

## Consequences

- 生产冷启动收敛：登录 → state 载荷（activeContext inactive + 代际）→ 名册按钮可点 → 选择流 ensure 进入工作修订。
- 走查手册步骤 5 的前置缺口（接入工作区 + 关联卡设默认）本次同提交补登。
- wire stage 恢复真实值：fixture spec / read-policy-allowed-path / 探针脚本 / route-skeleton spec 断言随升级；未登录的 state 仍 fail closed（initial-context）。
- 分母不变（19 admitted / 16 bypasses / 10 direct）；无新路由。

## 证据

- 装版探针：`[read-probe] state.read {"state":"unavailable",...,"stage":"initial-context",...}`（修正前 collapse 显示 read-policy）。
- 全套件（electron 包装）：236 文件 / 2087 passed / 1 skipped / 0 failed。
- 门禁 checker selftest：57/57（含四个 ADR-0324 突变）。
- 根状态：`harness/storages/workspace.json` workspaces 为空、`matter-links/` 不存在——走查前置确证。
