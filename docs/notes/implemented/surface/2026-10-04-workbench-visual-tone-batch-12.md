# Batch 12 / UI-01A：工作台外壳视觉收口（dense + calm 首切片）

- 日期：2026-10-04
- 状态：implemented locally, not committed
- 对应决策：[ADR-0259](../../../adr/ADR-0259.md)
- 范围：UI-01A（UI-01 视觉收口首切片）；按用户指示视觉／CSS 层优先，由 Qoder 会话执行
- 相关：[Batch 7 工作台](../architecture/2026-10-03-business-matter-readonly-workbench-batch-7.md)、[Batch 10 theme](2026-10-04-semantic-theme-accessibility-batch-10.md)、[Batch 11 density](2026-10-04-display-density-application-batch-11.md)、[UI 一致性合同](../../../specs/2026-09-27-sanbao-to-sage-ui-consistency-contract.md)

## Problem

批次 7–11 交付了 UI-01 最小切片（三栏工作台、六态 fixture、theme/density、A11Y），但首屏仍保留展示级排版与宣传型装饰：

1. matter 面板标题与事项目标在真实窗口 computed 为 **53.6px / 41.6px**（旧构建探针实测），属于合同 tone 明确排除的"大标题"；
2. Overview 面板仍带 hero 文案区（"让经营目标，在明确边界内持续推进。"）与旋转式"经营网络"装饰卡——正是被点名的"hero 与经营网络宣传卡"；
3. 工作台主卡带一条实现说明句（"当前事项是工作台的主对象…"），属于"把功能说明写进页面代替清晰控件"；
4. `.sage-trace-list`、`.sage-matter-layout`、`.sage-matter-main` 等死 CSS 在批次 7 之后已无引用。

## Decision

与 [ADR-0259](../../../adr/ADR-0259.md) D1–D6 一致，摘要：

1. Overview 退役 hero 文案区与 `sage-network-card` 装饰卡（含 orbit CSS）；保留 RUNTIME 卡、当前事项卡与 MATTER TRACE 说明条，matter 入口链接保留。
2. 六个面板标题与事项目标改为运营级标度（1.35rem / 1.3rem，weight 620）；删除全部展示级 clamp（4.2rem / 3.35rem / 2.6rem / 2.2rem）。
3. 移除工作台主卡解释性整句；fail-closed 诚实标记（fixture 徽标、阶段轨道说明、只读 composer 说明、总览不合成进度说明）全部保留。
4. 清理死 CSS 并小幅收紧面板节奏（panel padding-top 2.25rem→1.6rem、section heading margin 1.5rem→1rem）；零行为变更。
5. 证据三层：源合同 spec + 真实 Electron computed/节点缺席断言 + 人工回看截图；对旧构建先取具名红。

### 文件范围

- 实现：`apps/sage-shell/src/product/component-renderer.ts`、`apps/sage-shell/src/product/renderer.ts`
- 测试：新增 `apps/sage-shell/test/ui-shell-visual.spec.ts`；扩展 `apps/sage-shell/test/sage-fixture-projection-window.spec.ts` 与 `apps/sage-shell/test/support/sage-fixture-projection-probe.mjs`
- 文档：本 Note、`docs/adr/ADR-0259.md`、ADR index、派生 `decisions.json`
- 明确排除：导航集、支持卡文案、行为/路由/provider/token 语义、React/dependency/package/lockfile

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 复制 Qoder / Sanbao CSS 或资产 | 否决：合同只允许语义迁移，外部 CSS 不进 Sage。 |
| 保留 hero 仅缩小字号 | 否决：合同点名去掉 hero 与装饰卡。 |
| 媒体查询条件性保留展示标题 | 否决：同一页面两套语气，不构成单一产品事实。 |
| 同批调整 nav 六项目标或支持卡长文案 | 后置：属 UI-01B / UI-DECISION-01 范围。 |
| 只用 Fake DOM / 字符串断言 | 否决：标度与节点缺席必须在真实窗口 computed 路径验证。 |

## Verification

- **源合同 Red（实现前）**：`test/ui-shell-visual.spec.ts` 首跑 `6 tests / 5 failed`，具名命中：hero/network 残留、clamp 残留、运营标度缺失、死 CSS＋解释句残留、h1 计数 6≠5（honesty 标记位按设计通过）。
- **真实窗口 Red（实现前，对旧构建直跑 probe）**：`exit 2 / passed:false`，四条具名失败：display-scale hero/network chrome 仍在、overview 仍有展示标题、section heading **53.6px**、matter goal **41.6px** 超标度。
- **源合同 Green**：`test/ui-shell-visual.spec.ts` `6/6`；聚焦邻接 `ui-shell-contract`＋`matter-projection-renderer`＋`matter-workbench-ia` 合计 `4 files / 28 tests` 全过（其中计数断言按实际 6 个面板标题修正一次并复绿）。
- **真实 Electron Green**：`sage-fixture-projection-window.spec.ts` `18/18`（含新增 `sectionHeadingFontPx ≤24`、`matterGoalFontPx ≤24`、`displayChromeNodeCount === 0`、`overviewHeadingCount === 0`）。
- **完整 Sage Shell**：`182 files / 1606 passed / 1 skipped / 0 failed`（较批 11 新增 1 file / 6 tests；既有 1 项 skip 未被改写）。
- **仓根 gate**：`pnpm run gate`（quick）**27/27、objects 84/84、0 skipped / 0 failed**；`adr-agent-records` 259 篇 ADR / 138 决策块 / 121 豁免 / 714 条与基线一致；`sage-route-authority` 58/58、`docs-link-integrity` 全绿。
- **截图**：before/after × 1440 ×（matter / overview）已保存并逐张人工回看（`Sage/.birdview/evidence/ui-visual-01-2026-10-04/`）：标题缩至运营级、hero/网络卡消失、无遮挡与溢出；fail-closed 徽标与阻断呈现完好。

## Consequences

- 首屏从"宣传型总览＋展示级标题"转为密集、安静的操作型工作台；六个面板共享同一运营级标度。
- 回归守护落地：源合同负空间扫描 + 真实 Electron computed/缺席断言；后续任何 hero/展示标题/装饰卡回归都会被具名拦截。
- 未决（后续切片）：左侧 nav 六项目标（经营事项/搜索/自动化/知识/能力/设置）、"已接线操作面"支持卡长文案收敛、UI-DECISION-01 技术栈、完整 Qoder UI/UX 状态迁移。
- 改动写入 `main` 工作区，未 stage、未 commit、未 push、未 merge、未发布。
