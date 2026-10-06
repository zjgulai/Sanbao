# Batch 21 / P3 第六片：事项管理卡（D7）与任务分组卡（D12）React 接管

- 日期：2026-10-04
- 状态：本地完成（未 commit、未 push）
- 依据：[ADR-0261](../../../adr/ADR-0261.md)（D7 strangler；P3 卡片群逐卡迁移）

## Problem

管理两卡（D7 `matter-admin-*`、D12 `matter-groups-*`）仍由内联脚本渲染：D7＝勾选集驱动的逐项归档/恢复批量（含依据声明 select）、服务裁决重命名的回读、逐项裁决与留痕；D12＝事项行（复选入组）＋分组行（单选改名/移除/成员批量）、四个具名命令、逐项成员批量（ok/unchanged/refused 三态与「无整体变化」话术）、改名回读与留痕。两卡的勾选集与所选分组是卡内本地状态，没有跨卡选择器依赖（批次 20 已核查），可自包含迁移。

## Decision

1. **区域桥新增两槽**：`matter-admin`（`{kind:'read', slot:{items, archived, batch, rename, trail}}`／`unavailable`）与 `matter-groups`（`{kind:'read', slot:{items, groups, batch, rename, trail}}`／`unavailable`）；两卡 article 作 root 容器（`#sage-region-matter-admin`/`#sage-region-matter-groups`＋`data-region-state`）。`items` 来自 `matterList`（两卡同源）；`archived`＝entries 的 matterRef 集，在 wire 侧归并后随槽发布。
2. **下行桥 +7 动作（33 总计）**：`archiveMatters(targets, ground)`→notice|null（先决句「先勾选要归档的事项…」逐字；ground 只在 'stopped' 时取 stopped，其余归 completed——同 legacy 语义）；`restoreMatters(targets)`→notice|null；`renameMatter(targets, title)`→notice|null（恰好一项的检查留在动作内；拒绝码经 `matterAdminRefusalText` 表；失败句逐字；成功渲染靠投影回读）；`createGroup(name, targets)`（空名先决句；targets 空时不带 targets 字段）；`renameGroup(groupId, name)`/`removeGroup(groupId)`（未选分组先决句；空名句）；`assignGroupMembers(groupId, operation, targets)`（operation 归一到 add/remove；空 targets 按 operation 两句话术）。
3. **React 拥有**：D7＝勾选集 Set、归档依据 select、三路 pending、`#matter-admin-note`（未核验/批决先决句）与 `#matter-admin-rename-note`（本地句优先、投影回读在后）的时机；D12＝事项勾选集、分组单选（pickedGroupId，天然互斥）、四路命令 pending、`#matter-groups-readback`（本地句优先、改名回读在后）的时机。**批量裁决表（拒码→文案）在 React 侧各持一份显示副本**（与 action-items 的 receiptText 先例一致）；legacy 保留管理拒码表供重命名动作使用，分组拒码表因唯一消费点（裁决行）迁走而删除。行内「改名/移除/成员批量前必须有 picked 分组」的快速拒绝在两卡组件内先短路（文案逐字），legacy 动作再做参数级防御。
4. **探针扩到十区域**：`regionFacts` 增 `matterAdmin`/`matterGroups`，期望值从同一 payload 推导；窗口 spec evidence 类型同步。
5. **测试重分工**：两枚 legacy 渲染 spec 删除——静态纪律/名册钉保留进新 bridge spec；行/裁决/回读渲染与全部交互进 jsdom；七动作精确体与先决句进 bridge spec；原 D7 spec 的「经 D0 过滤器显示归档行」一测与两卡 DOM 无关（D0 仍 legacy），连同其 fixture 原样迁入 bridge spec。

## Verification

- 红：两枚旧驱动 spec 对新代码 10 具名红（恰好为全部 DOM 驱动项；静态钉与 D0 无关项保持绿——证明 takeover 后旧驱动无处可写）。
- 绿：新聚焦 16/16（bridge 8＋jsdom 8）；全量 `189 files / 1637 passed / 1 skipped / 0 failed`（含窗口 spec 18/18：十区域态一致）；gate quick 27/27、objects 84/84、0 skip；`npx tsc --build` 退出 0 后 bundle 320,073 字节（批 20 为 301,141）；`b21-admin-groups-1440.png`、`b21-groups-1440.png`、`b21-admin-groups-660.png` 已人工回看（两卡全幅：勾选态、活动/已归档徽记、批量逐项含拒绝句、重命名回读句、分组标签、单选项、成员批量三态、双 trail；660 无横向溢出）。
- 过程修正：两渲染函数替换时首改误用了占位名（到场自查即改）；jsdom spec 初稿把先决句误当组件短路（管理卡与分组创建的先决句在 legacy 动作内——空选择也调用，修正为断言调用参数＋返回通知显示）。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 裁决拒码表留在 legacy、随槽发布预渲染文本 | 否决：批量裁决是显示用途；React 持显示副本符合 action-items 先例，wire 侧仍是动作拒码的唯一解释家。 |
| pickedGroupId 的快速拒绝完全交给 legacy 动作 | 部分采纳：动作保留参数级防御；组件先短路同文案（与旧 handler 的 pickedGroupId() 先查一致，避免一次异步往返）。 |
| 把 D0 过滤器测试随文件删除 | 否决：它是归档可见性的唯一覆盖；连同 fixture 迁入 bridge spec 保留。 |
| 两卡分两批迁移 | 否决：两卡同源（matterList）、同族（行内多选+逐项裁决），合批一次做干净。 |

## Consequences

- P3 已完成 10/13 卡（sites、tool-results、run-monitor、artifacts、side-chats、action-items、plans、link、matter-admin、matter-groups）；`renderer.ts` 6,225→5,894 行（−331）；新增 `matter-admin-view.tsx`、`matter-groups-view.tsx`；下行桥 33 动作；探针十区域。
- 余下卡片：列表（D0）、草案（D1）、会话（D3，最长）；随后 P4 面板与 legacy 内联脚本退役。
- 未决：本批未 commit、未 push；批次 19/20/21 三个改动集併存未提交。
