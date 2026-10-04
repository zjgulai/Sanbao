# Batch 13 / UI-01B：导航六项目标与支持卡文案收口

- 日期：2026-10-04
- 状态：implemented locally, not committed
- 对应决策：[ADR-0260](../../../adr/ADR-0260.md)
- 范围：UI-01B（按用户指示视觉 CSS 层优先推进；导航 IA ＋ 面板归并 ＋ 支持卡文案）
- 相关：[Batch 12 视觉标度](2026-10-04-workbench-visual-tone-batch-12.md)、[UI 一致性合同](../../../specs/2026-09-27-sanbao-to-sage-ui-consistency-contract.md)

## Problem

UI-01A（Batch 12）已把工作台外壳收敛到运营级标度，但左侧导航仍是七项旧集合（经营事项/总览/能力/治理/个人资料/只读呈现/设置），与目标六项（经营事项、搜索、自动化、知识、能力、设置）不一致：搜索卡埋在「经营事项」支持区、知识卡埋在「只读呈现」面板；自动化没有界面入口；总览/治理/个人资料/只读呈现占据一级导航；「已接线操作面」多张支持卡仍带超长解释段落。

## Decision

与 [ADR-0260](../../../adr/ADR-0260.md) D1–D8 一致，摘要：

1. 导航收敛为固定六项：经营事项、搜索、自动化、知识、能力、设置（tab/panel 对完整保留 ARIA 互引、单一 tab stop、窄宽 accessible name）。
2. 搜索升为一级页面（原卡迁入 `panel-search`，全部 id 保留、客户端零改动）；知识升为一级页面（原卡迁入 `panel-knowledge`）。
3. 自动化以诚实未接线呈现（零控件）；被置换面板内容归并到设置（运行状态、身份、行动边界、退出/引导/环境、可见范围、插件、诊断），总览事项卡与 trace 说明条退役；能力面板不变。
4. 四张支持卡（事项列表/草案/搜索/附件）长文案压缩，fail-closed 断言逐字保留。
5. 守护升级：新增 `test/ui-navigation-contract.spec.ts`；两套 Electron 探针改为 `activeTabId` ＋ `navItemCount`/`navItemIds` 六项断言，键盘遍历改 `view-search`。

### 文件范围

- 实现：`apps/sage-shell/src/product/component-renderer.ts`（导航、面板归并、文案）、`apps/sage-shell/src/product/renderer.ts`（死 CSS 清理＋客户端 Overview 卡引用移除）
- 测试：新增 `test/ui-navigation-contract.spec.ts`；更新 `ui-shell-contract`、`ui-keyboard`、`matter-projection-renderer`、`file-reference-surface`、`readout-surface`、`settings-leaves`、`edit-draft-surface`、`plan-renderer`、`preferences`、`ui-shell-visual`、两套 probe 与两个 window spec
- 文档：ADR-0260、本 Note、ADR index、派生 `decisions.json`（260 篇 / 139 决策块 / 121 豁免）

## Verification

- **源合同 Red（实现前）**：`10 failed / 45 passed`——导航合同 6 项具名红（六项顺序、退役面板、窄宽名册、三新页面、归并 id、客户端钩子清理）＋壳合同 4 项红。
- **聚焦 Green**：导航合同＋壳合同＋键盘＋事项渲染＋三处重锚 spec `7 files / 55 tests`。
- **实现后首跑全量的抓漏（透明记录）**：4 files / 12 tests 红，全部为旧 IA 假设残留而非产品缺陷——① 探针内旧七项 `TAB_ACCESSIBLE_NAMES` 常量；② window spec 级 `axTabNames` 旧名册断言；③ 三处 spec 切片锚（edit-draft 到 `panel-governance`、plan-renderer 到 `panel-settings`、preferences 到 `settings-leaf-section`）按新面板序重锚。修复后聚焦复跑 `5 files / 42 tests` 绿。
- **最终完整 Sage Shell 套件**：`183 files / 1612 passed / 1 skipped / 0 failed`（含两套真实 Electron 窗口 spec；较批 12 新增 1 file / 6 tests；既有 1 项 skip 未被改写）。
- **截图**：`ui01b-matter / search / settings` × 1440 已人工回看——六项导航顺序正确、搜索/知识新页面排版正确、设置页归并从外观区开始正常。
- **仓根 gate**：`pnpm run gate`（quick）**27/27、objects 84/84、0 skipped / 0 failed**；`adr-agent-records` 260 篇 ADR / 139 决策块 / 121 豁免与基线一致。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 保留七项、仅改名 | 否决：与目标六项冲突。 |
| 六项但自动化留空面板 | 否决：空白会被读成加载失败；诚实未接线文案是 fail-closed 基线。 |
| 删除被置换面板内容 | 否决：丢失登录/重试/退出检查/可见范围/诊断入口；归并到设置保 id。 |
| 同批调整能力面板或引入新控件 | 否决：超出本票边界。 |
| 复制 Qoder / Sanbao CSS | 否决：外部原型只作只读证据。 |

## Consequences

- 导航与目标 IA 一致；搜索/自动化/知识成为一级入口；设置承担系统与控制台归并；所有既有 wired id 保留、零行为变更。
- 六项导航与归并结构被源合同 spec＋两套 Electron 探针钉死（回归即具名红）。
- 未决：UI-DECISION-01、真实 provider/mutation、13 adapt 状态的后续逐条迁移。
- 改动写入 `main` 工作区，未 stage、未 commit、未 push、未 merge、未发布。
