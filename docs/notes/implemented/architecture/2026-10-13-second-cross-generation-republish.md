---
title: 第二次跨代重观测重发——settings 栈激活触发组件集漂移（ADR-0326 程序复用）
doc_type: architecture
module: sage-shell
topic: second-cross-generation-republish
status: stable
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# 第二次跨代重观测重发

## Problem

ADR-0339 激活 settings/config-editor/plugin-manager 三个插件（profileContext 供给）后，生产发送全域被拒：装版探针落点 `stage: compatibility`。根因：**活动组件集改变 = 运行时描述符漂移**，而 sealed 发布物（requirement/registry/matrix 三件）录制于激活前的组件集——compatibility 步按设计精确钉描述符，不匹配即 fail closed。这正是 ADR-0326 记录的可复发情形，本次为该程序第一次复用。

## Decision

复用 ADR-0326 程序（无新决策）：

1. 恢复 v1 基座（`git checkout '3d074f09^' -- apps/sage-shell/publications/`）。
2. **等价证明**（被跳过的 v1-round-trip 的外部补位）：以**上一版 fixture**（`git show HEAD:…/reobs-runtime-inventory.json`）干跑 `--refresh`，与**入库版**（HEAD）三件逐字节比对——三件全部 IDENTICAL，组合保真成立。
3. 重录制：`SAGE_ROOT=/private/tmp/sage-cred-proof node scripts/inventory-probe.mjs`（**纯 node**——在 electron RUN_AS_NODE 下 `import 'electron'` 解析为内置 API 对象，probe 的 `execPath` 会拿到对象而崩；此为本次新增的手法注记）。新 descriptor `67d2d07d…`（旧 `db60b818` 世代 + 组件集差异）。
4. `--refresh --fixture <new> --write`（发布器自带重解析、配对、能力面一致性、目标/注册准入 dry-run 全过）。
5. spec 重锚（4 个文件）：matrix/bundle/target 三组 URN 与四条控制规则 target（prompt/approval/pending/queue 各自新值，从 shipped bundle 的 canonicalMatrix 逐条读出，不猜）。
6. 重打包后真机复验：发送 `accepted` → 真实回合 `turn/end: completed`。

## Alternatives considered

- 手改 sealed 字节：跳过 kernel 校验；否决（ADR-0326 已否决）。
- 放宽 pair 匹配容忍组件集漂移：拆证据链；否决。
- 在 ADR-0339 批内“顺手”发布不记录：跨代重发是承重事件（判据全换），必须独立留痕（ADR-0015）。

## Consequences

- 出版物进入第三世代：matrixId `acae2ffe…`、bundleId `b7206236…`、prompt target `ad953721…`（approval `d42d1c2c…` / pending `19cf2142…` / queue `a0540288…`）；fixture 刷新。
- 发送恢复；且**任何后续改变活动组件集的批都必须执行本程序**（ADR-0339 已把一个组件集变更带进基线——后续批注意）。
- 已知边界（登记为新票候选）：**自定义模型路由通过 catalog/set-default 可选可用，但其模型面不在 sealed prompt 语义覆盖内——选它为默认后发送仍被 compatibility 拒**。让自定义模型真实可发需要一条受治理的运行时声明路径或发布面扩展。

## Verification

- 等价证明：旧 fixture 干跑 vs HEAD 三件 `IDENTICAL`（本记录小节 Decision.2）。
- 发布器全检查通过日志（重解析/配对/一致性/准入 dry-run/round-trip）。
- 全量 2185 passed；`gate` 32/32；真机：`set-default`（deepseek-official/deepseek-flash）→ `send accepted` → 回复 `ok`（turn/end completed）。
