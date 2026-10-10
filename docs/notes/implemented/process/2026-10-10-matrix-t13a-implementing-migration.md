---
title: 矩阵 T13-A 记账迁移第一批
doc_type: process
module: sanbao-integration
topic: state-matrix-implementing-migration
status: stable
created: 2026-10-10
updated: 2026-10-10
owner: self
source: ai
---

# 矩阵 T13-A 记账迁移第一批：9 行 pending→implementing 与三处记账修正

## Problem

tracked 矩阵（`docs/specs/2026-09-27-sanbao-to-sage-ui-state-map.json`）的 `delivery.ui` 落后于仓库实现事实：T13 外观族 8 行与 T03 搜索 1 行的 desktop UI 已实现并接线，但矩阵仍记 `pending`；另有 4 条既有 `implementing` 行仍引用 `.birdview/` 未跟踪证据或带 `(7/7)` 计数后缀的测试路径，违反「一份事实一个家」与证据可追溯性；`docs/specs/2026-10-05-sanbao-in-sage-integration-spec.md` §7 仍写「矩阵 gate 未接入全局门禁」，与 `scripts/gate.mjs` 的实际注册状态不符。

## Decision

第一批记账迁移（零功能改动、零状态升级）：

1. **9 行 `delivery.ui.status: pending→implementing`**：
   - T13 外观族 8 行（`QDR.P06.settings.appearance.{default,color-mode.open,language.open,font-style.open,content-width.open,file-icons.open,icon-appearance.open,terminal-theme.open}`）：Sage desktop 已实现 8 项原生 select + GET/POST 权威回读，打包态 DMG-06 首存/重启验收通过。证据引用改为 tracked 路径：`apps/sage-shell/test/product-app/desktop-settings-view.spec.tsx` 与 `docs/notes/implemented/packaging/2026-10-10-dmg-chain-first-real-run.md`，`countsAsVerification:false`（保持 `implementing`，不升 `verified`）。
   - `QDR.P02.search.empty`（T03，B1 漏迁行，与候选 CSV 第 4 行一致）：补真实 blocker 文案（read-only route + 生产拒绝逐字渲染 + 零虚构命中）与 candidate 级证据引用，kind 沿用既有 `candidate-untracked` 约定。
   - 入口行 `QDR.P06.settings.appearance.entry` **不动**：其语义是「设置总入口的外观导航项」（discovery），需单独重解释后另行迁移。
2. **B4 证据换引（4 行，不升状态）**：`QDR.P01.home.workspace`、`QDR.S01.session.running`、`QDR.S08.reply.interrupted`、`QDR.S08.reply.continued` 的 `.birdview/...` 引用与 `read-policy-allowed-path.spec.ts (7/7)` 计数后缀，换成 tracked 路径 `desktop-session.spec.tsx`、`desktop-session-view.spec.tsx`、`desktop-page.spec.tsx`、去后缀的 `read-policy-allowed-path.spec.ts`。`QDR.P01.home.workspace` 的 blocker 文案同步纠偏：删去无证据支撑的「(T03/A, ADR-0268) verified」措辞，改为与 tracked 测试覆盖一致的表述。
3. **B5 文档同步**：spec §7 改为「矩阵 gate 已注册于 `scripts/gate.mjs` 的 Sage scope（`sage-sanbao-state-matrix` 与 `-selftest`），2026-10-10 起随 `pnpm run gate` 运行」。

**为什么零用户裁决即可迁移**：[Sanbao → Sage 集成票据](../../../plans/2026-10-05-sanbao-in-sage-integration-tickets.md) 允许「每次进度变化修改 tracked row、提供符合规格的证据、由派生 summary 与独立 gate 重新验证」；`implementing` 状态本身无证据强约束（`countsAsVerification:false` 即可），只有升 `verified`/`integrated` 才触发严格判据。本批严格不升 `verified`/`integrated`，不动 `applicationService`（保持 `blocked`）与其他维度，不改 `source`/`prototype`/`legacyUi00Review` 字段与任何 PIN。

## Alternatives considered

- **等 T13/T03 完成后一次性升 `verified`**：拒绝——记账必须反映当下实现事实；`pending` 与真实状态不符会让矩阵失去进度导航价值，且违反「先记账后验收」的增量节奏。
- **把这 9 行直接升 `verified`**：拒绝——`verified` 需要 `countsAsVerification:true` 的 tracked 证据并通过门禁校验；本批按票据边界只做状态纠偏，升级是下一批的独立动作。
- **保留 `.birdview/` 引用并标注 untracked**：拒绝——候选 CSV 本就是未跟踪输入（`countsAsVerification:false` 的降级证据）；既有 4 行已有 tracked 等价测试可换引，保留会长期污染可追溯性。`QDR.P02.search.empty` 保留一处 `.birdview` live-result 引用，因其只有候选级证据，kind 已如实标注 `candidate-untracked`。

## Consequences

- `summary.delivery.ui` 从 `{"implementing":4,"pending":202}` 变为 `{"implementing":13,"pending":193}`，由生成器 `--check` 与矩阵门禁的 summary-drift 判据双重校验。
- 矩阵中 `.birdview` 字符串仅剩两处：`migration.candidate.path`（生成器写入的 provenance 事实，非证据引用）与 `QDR.P02.search.empty` 的 `candidate-untracked` live-result 引用；无绝对路径、无带计数 ref。
- 后续待办：B3（blocked service 行的处理）待用户裁决；`appearance.entry` 入口语义重解释；`implementing→verified` 升级政策待裁决。
- 功能代码零改动；本批只触及 tracked JSON 的 `delivery.ui` 与 `blockers` 字段及两份文档。

## Verification

- `node scripts/gen-sage-sanbao-state-matrix.mjs --check` → `sage-sanbao-state-matrix generator check: PASS (206 rows; integrated 0)`，exit 0
- `node scripts/gates/sage-sanbao-state-matrix.mjs` → `sage-sanbao-state-matrix: PASS (206 rows; integrated 0)`，exit 0
- `pnpm run gate` → 32/32 项通过，exit 0（含 `sage-sanbao-state-matrix` 与 `-selftest`）
- 机械校验：全部 path 形态 evidence ref 均为 git-tracked（`git ls-files --error-unmatch` 逐一通过）；交付引用中无 `(N/N)` 计数后缀（B1 行从候选 CSV 第 4 行迁入时同步去掉了原文的 `desktop-search.spec.tsx (8/8)` 计数后缀，仅保留路径）；与迁移前快照 diff 确认 `source`/`prototype`/`legacyUi00Review`/`policy`/`migration` 逐字节不变，`summary` 仅按派生规则重算（4→13 implementing / 202→193 pending），其余改动仅限 `delivery.ui.status`、`delivery.ui.evidenceRefs` 与 `delivery.blockers`。

## 第二批（2026-10-10）：appearance.entry 单行迁移 pending→implementing

ADR-0283 D3 重述入口语义（账号菜单 → 外观与显示表单，无独立设置导航级）后，为 `QDR.P06.settings.appearance.entry` 补句级证据并迁 `delivery.ui.status: pending→implementing`。evidenceRefs（全部 `countsAsVerification:false`）：tracked 测试 `apps/sage-shell/test/product-app/desktop-page.spec.tsx`（账号菜单两级入口断言「账号与设置→账号与设置页→外观与显示」）与 `desktop-settings-view.spec.tsx`（8 项 select 权威渲染），live 读数 `docs/notes/implemented/packaging/evidence/2026-10-10-dmg06-v2-acceptance-result.json`（DMG-06 `sage.packaged-acceptance.v1 passed=true`，live check 经账号菜单进入设置，见 `apps/sage-shell/test/support/desktop-live-check.mjs`）。blocker 改为与 implementing 相称：入口已实现、两级交互均有 tracked 测试与打包 live 读数；hostIntegration/visualAcceptance 仍 pending。`summary.delivery.ui` 由 `deriveSummary` 原函数重算写回（5→6 implementing、193→192 pending）。验证：`node scripts/gen-sage-sanbao-state-matrix.mjs --check` → PASS (206 rows; integrated 0) exit 0；`node scripts/gates/sage-sanbao-state-matrix.mjs` → PASS (206 rows; integrated 0) exit 0；`node --test scripts/gates/sage-sanbao-state-matrix.test.mjs` → 13 tests / 13 pass / 0 fail。未闭：implementing→verified 升级政策仍待裁决。
