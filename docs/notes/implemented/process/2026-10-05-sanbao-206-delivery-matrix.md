# Sanbao 206 状态交付矩阵与并行执行基线

- 日期：2026-10-05
- 决策：[ADR-0269](../../../adr/ADR-0269.md)
- 状态：已实施矩阵、生成器、门禁、规格与票据；功能行按各 owner ticket 继续施工

## Problem

Sanbao pin `b861d046013fb8bee9a1f3224ed0965efcf42111` 的 catalog/ledger 给出 59 组、206 状态，但这些是原型可见范围，不是 Sage 默认窗口的交付证明。现有工作同时包含 Qoder 的 T03 读策略/搜索、Codex 的设置与打包、以及大量尚未进入产品主链的状态；没有逐行事实家就会把 React 文件、Pages、截图、fixture 或 DMG 误算为前后端已经打通。

## Decision

1. 将现有 state map 升为 v2 tracked delivery matrix：每行保留 source/prototype observation，另列 Sage UI、Application Service、Host、Electron、视觉五维状态与证据。
2. 由生成器锁定 source pin 与 catalog/ledger digest，并检查 206 distinct IDs、59 groups、无缺失/外部/重复 ID；summary 完全从逐行数据派生。
3. 独立 gate 拒绝以下升格：prototype wired→Sage integrated、ignored/fixture/candidate-only evidence→verified、Application Service blocked→integrated、手改 summary、无决策的 N/A、未登记 route 的 verified Application Service。
4. 将 generator check、matrix gate 和 self-test 纳入 Sage global gate allowlist 与根 `test:gate`，不进入 legacy/release 范围。
5. 规格与 tickets 固化 T01–T14 及 DMG-INTERNAL 的 owner、依赖和验收。内部 DMG 可并行，但必须与 206 行完成率分开报告。

## Alternatives considered

- 继续使用 ignored CSV：无法随代码提交、无法由 global gate 复验，否决。
- 只写一份路线图：路线图描述意图，不能提供逐状态交付证据，否决。
- 先把已观察原型标成完成：会把外部原型运行事实跨产品升格，否决。

## Consequences

- 初始真实读数固定为 206 rows、59 groups、`integrated=0`；UI `implementing=4/pending=202`，Application Service `blocked=206`。
- 任何一行进度变化都必须改 tracked row、提供合格证据并重新运行 generator/gate；口头确认不改变计数。
- T13 设置与 DMG 工作可以先形成可用产品增量，但在五维证据闭合前不会把相关 Sanbao 状态提前标成 integrated。

## Verification

- `node scripts/gen-sage-sanbao-state-matrix.mjs --check`：PASS，206 rows，integrated 0。
- `node scripts/gates/sage-sanbao-state-matrix.mjs`：PASS，206 rows，integrated 0。
- `node --test scripts/gates/sage-sanbao-state-matrix.test.mjs scripts/gate-scope.test.mjs`：18/18 PASS。
- global gate 已登记 `sage-sanbao-state-matrix` 与 `sage-sanbao-state-matrix-selftest`；最终整仓读数与本批其他改动一起复验。
