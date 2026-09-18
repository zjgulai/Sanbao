# 共享侧栏入口核心：恢复 split 并排模式为 API 可选（双态并存）

- 日期：2026-09-18
- 状态：implemented
- 对应 ADR：[ADR-0125](../../../adr/ADR-0125.md)（D3）、[ADR-0032](../../../adr/ADR-0032.md)（修订）、[ADR-0124](../../../adr/ADR-0124.md)（修订）
- 相关：ADR-0079（同列同行轴）、ADR-0019（官方 UI 改写锚禁止钉哈希）

## Problem

在 P0 启动带同轴化改造中，为实现「新会话」与「新应用」上下堆叠（`stacked` 模式），共享核心
`shared/client/sidebar-entry-core.ts` 删除了 `split` 50/50 并排模式及 `applySplitGeometry()`，
`position` 字段缩减为 `'before' | 'after' | 'stacked'` 三值。

随后的裁决（ADR-0125 D3）推翻了「彻底退役 split」的前提，定案为：
1. **split 恢复为共享核心的 API 可选模式**，使核心具备完整四态（`'before' | 'after' | 'split' | 'stacked'`）；
2. 当前受管宿主（`dsh-newapp-local`）保持现用 `stacked` 模式不变；
3. 将来任何宿主若启用 `split`，必须先将 `sidebar-row-axis` 门禁扩为支持双形态断言。

此外，P0 在删除 split 模式时，附带删除了 `dsh-newapp-local` 的 `sidebar-entry-split.spec.ts`，
导致该包的降级自报（`reportDegraded`）及 `apply` 失败策略完全丧失单测覆盖，且降级标志留有
`'split-unavailable'` 的过时命名。

## Decision

1. **共享核心恢复四态几何分发**：
   - `position` 恢复四值：`'before' | 'after' | 'split' | 'stacked'`；
   - 提取模块级 `bandGeometry(position)` 纯分发函数，收敛 `split`（`applySplitGeometry`）与 `stacked`（`applyStackedGeometry`）在挂载、重渲染自愈、容器尺寸重测等路径上的重复逻辑；
   - 统一收起状态阈值常量为单事实源 `COLLAPSED_RAIL_MAX_WIDTH = 60`，分别 re-export 为 `SPLIT_COLLAPSED_LIMIT` 与 `STACKED_COLLAPSED_LIMIT`，满足两侧契约测试的锁定需求；
   - 销毁函数（disposer）按激活模式分别清理对官方按钮的侵入（`split` 移除内联样式 `width`，`stacked` 删除 `data-lute-navrow` 标记）。

2. **多副本同步与契约测试恢复**：
   - 经 `node scripts/sync-shared.mjs --write` 同步至三个受管消费方；
   - 恢复 `packages/surfaces/dsh-role-matrix-local/tests/sidebar-entry-split.spec.ts`（HEAD 原文），与已有的 `sidebar-entry-stacked.spec.ts` 并列，分别锁定两套几何算术契约；
   - 新建 `packages/surfaces/dsh-newapp-local/tests/sidebar-entry-stacked.spec.ts`，锁定 package 级 stacked 接线，并补回因 P0 误删的降级自报与失败兜底测试；
   - 将 `dsh-newapp-local` 未挂载降级原因由 `'split-unavailable'` 修正为 `'entry-unavailable'`。

3. **文档与门禁对齐**：
   - ADR-0032 背景段落补充 ADR-0125 D3 恢复 split 为可选模式的演进事实；
   - `dsh-newapp-local/README.md` 修正测试覆盖描述；
   - `scripts/gates/sidebar-row-axis.mjs` 注释更新定案日期与 ADR-0125 溯源。

## Alternatives considered

- **A. 仅在需要使用 split 的宿主出现时再恢复代码。**
  否决：违背已冻结的 ADR-0125 D3 裁决；将已验证的几何算术留在 git 历史中会导致未来重复研发与取证成本。
- **B. 复制两份独立的 observer 与 placeEntry 分支。**
  否决：违背 ADR-0009（一份事实只有一个家），会导致自愈逻辑演进时的双重维护与漏网风险。采用 `bandGeometry` 分发函数是最小充分抽象。

## Consequences

**得到**：
- 共享注入核心完整支持四种接入形态，split 几何算术与 stacked 标记契约均由独立单测硬性锁定；
- 补齐了 `dsh-newapp-local` 丢失的降级自报单测覆盖；
- 没有任何现有出货界面的运行时行为发生倒退。

**代价与残余约束**：
- 共享核心文件增加约 40 行，包含两套几何逻辑；
- 维持 ADR-0125 D3 的硬性约束：当前无受管宿主启用 `split`；未来任何宿主若启用，必须在启用前先扩展 `sidebar-row-axis` 门禁。
