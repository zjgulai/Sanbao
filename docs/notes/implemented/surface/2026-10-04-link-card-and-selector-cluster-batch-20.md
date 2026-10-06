# Batch 20 / P3 第五片：关联卡（D2）React 接管与选择器簇改道

- 日期：2026-10-04
- 状态：本地完成（未 commit、未 push）
- 依据：[ADR-0261](../../../adr/ADR-0261.md)（D7 strangler；P3 卡片群逐卡迁移）＋批次 18 Note 中「D2 改期到选择器簇专项批」的登记

## Problem

关联卡（D2）是选择器簇的中心：`#link-matter`/`#link-workspace` 两个 select 的值是 17 处 wire 动作的上下文来源（`currentSendContext`、文件建稿、行动项/更正/项目、方案创建/执行、退出停止、会话停止/恢复、历史默认详情、审批应答、重试发送、草案重发、澄清回答、计划模式等）。批次 18/19 已把读点全部收敛为「动作内读 `#link-matter` 的 `.value`」，但那依赖 legacy 在启动时缓存的元素引用——一旦 D2 迁 React、React 重渲替换子树，缓存引用指向被移除的静态节点，全部读取会静默冻结在空值。因此本批必须一次做干净：D2 卡迁移＋上行桥＋全读取点改道＋全部 spec 夹具重写（批次 18 笔记载明的「选择器簇专项批」）。

## Decision

1. **上行桥（新方向）**：`window.__SAGE_APP_SET_LINK_SELECTION__(matterRef, workspaceRef)`——由 legacy 在启动时安装（与 `__SAGE_LEGACY_ACTIONS__` 同段），React 关联卡在**每个派生的选择**上调用（挂载初值、用户改选、刷新后回退）。legacy 侧 `linkSelection` 变量＋`selectedMatterRef()`/`selectedWorkspaceRef()` 助手，17 处读点全部改从助手取（语义与 legacy `fillSelect` 逐字一致：上一值仍在选项里就保留，否则取首项，无选项为空串）。
2. **区域桥新槽** `link`（`{kind:'read', slot:{links, trail, matters, workspaces}}`/`unavailable`）：选项标签仍在 wire 侧构建后随槽发布（与 legacy `fillSelect` 的 label 逐字一致，含全角空格与 path 后缀）；行/留痕渲染与 note 时机（未核验/无记录/N 条）在 React。容器＝`sage-link-card` article（`#sage-region-link`＋`data-region-state`）。
3. **下行桥 +3 动作（26 总计）**：`addLink(matterRef, workspaceRef)`→notice|null（先决句「先选好事项与工作区：关联不会自动替你挑一个。」逐字保留）；`removeLink`/`setDefaultLink`→void（空值静默返回，同 legacy）。精确体 `{action:'link'|'unlink'|'set-default', matterRef, workspaceRef}` 留 wire 侧。
4. **测试重分工**：`matter-links-surface.spec.ts` 删除——行/留痕渲染与选项名册进 jsdom；三条动作精确体与先决句进新 bridge spec；其「环境不可用是提示不是静默切换」一测与关联面无关，迁入 `plan-renderer.spec.ts` 的退出/引导/环境 describe。13 个依赖 `fillSelect` 默认值的 spec ＋2 个隐式依赖（pending-surface/session-surface 靠 legacy 自动填充 select 才拿到上下文）改为显式 `setLinkSelection()`（support/sage-page.ts 新助手，断言上行桥已安装）。探针扩到八区域。

## Verification

- 红：bridge 4/4 具名红＋jsdom 模块缺失红＋13 spec 的「legacy link-selection up-bridge must be installed at boot」具名红。
- 绿：聚焦 15 文件 / 77 测；全量首跑 2 红＝**pending-surface/session-surface 两处隐式 fillSelect 依赖**（从未手动设值、靠旧默认），补显式选择后全量 `189 files / 1634 passed / 1 skipped / 0 failed`（含窗口 spec 18/18：八区域态一致）；gate quick 27/27、objects 84/84、0 skip；`npx tsc --build` 退出 0 后 bundle 301,141 字节（批 19 为 295,623）；`b20-link-1440.png`/`b20-link-660.png` 已人工回看（改选 ws-2 后点「关联」的交互链完成、行/留痕/默认徽记齐全、660 无横向溢出）；两枚内联脚本 `node --check` 语法自证通过。
- 过程修正：删块时旧调用点与新增发布调用并存过一次（自查发现即删旧）；`plan-renderer` 的 note/评论中两处「页面自己的 selects」表述更新为上行桥口径。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 各动作继续读 DOM（换用现查 querySelector） | 否决：React 拥有该 DOM，读写边界会腐烂；且这正是批次 18 登记要一次做干净的选择器簇题。 |
| 只在 React 侧存选择、legacy 完全不知情（不改读点） | 否决：17 处 wire 动作都要重签名传参，等于把上行桥拆成 17 个参数口，回改面更大。 |
| 上行桥放进 `__SAGE_LEGACY_ACTIONS__` 对象 | 否决：那是「用户显式动作」家族；选择同步是持续状态通道，独立全局名与 region 桥对称。 |
| 保留 matter-links-surface 的填充断言（fake DOM 下） | 否决：填充归 React；覆盖由 jsdom（选项名册/默认值）＋bridge（槽发布）承接。 |

## Consequences

- P3 已完成 8/13 卡（sites、tool-results、run-monitor、artifacts、side-chats、action-items、plans、link）；选择器簇闭环，后续 D0/管理/分组/草案/会话不再受 `#link-*` 读取约束。
- `renderer.ts` 6,295→6,225 行（−70），新增 `link-view.tsx`（138 行）；下行桥 26 动作、上行桥 1 通道；探针八区域。
- 余下卡片：列表（D0）、草案（D1）、会话（D3，最长）、管理（D7）、分组（D12）；随后 P4 面板与 legacy 内联脚本退役。
- 未决：本批未 commit、未 push；等用户授权后随推送前 `gate:full` 复核。
