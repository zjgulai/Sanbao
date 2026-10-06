# Batch 22 / P3 第七片：事项列表卡（D0）React 接管（含组合调整：D1 草案改期）

- 日期：2026-10-04
- 状态：本地完成（未 commit、未 push）
- 依据：[ADR-0261](../../../adr/ADR-0261.md)（D7 strangler；P3 卡片群逐卡迁移）

## Problem

事项列表卡（D0）仍由内联脚本渲染：分区行（按 main 的 `partition` 字段分组）、每行触发标签、生成代绑定的「选择事项」控件（POST `/.sage/context/select`）、计数（全部按可见集计算）、归档筛选与专用 note（含 `contextSelectionNotice` 数据集与未接线后缀）。**组合调整（沿批次 18 先例）**：原建议「D0＋D1 合批」的 D1 草案卡在侦察中被实测证伪「体量中等」——责任默认值机制（auth 投影驱动）、建项确认/结果未知/核对/取消流程、前史勾选、站点模板填入、以及与退出检查的未保存字段跨卡读取链（`unsavedDraftFields`），合计 400+ 行逻辑≈P2 事项工作台区级别；D1 改期到专属批（批量 23），本批＝D0 独做。

## Decision

1. **区域桥新槽** `matter-list`：`{kind:'read', slot:{items}}`／`{kind:'unavailable', code?}`，两态均带 legacy 解析后的 `activeContext`（null＝未接线/格式无效；inactive 仍可作选择目标）。容器＝`sage-matter-list-card` article（`#sage-region-matter-list`＋`data-region-state`）。
2. **下行桥 +1 动作（34 总计）**：`selectMatterContext(matterId, expectedContextGeneration)`→`{kind:'selected'}`／`{kind:'cleared'}`（activeContext 为 null 时的本地清空语义）／`{kind:'notice', noticeKind:'refused'|'invalid', text}`。代际/失效判定（client-stale）、精确请求体与刷新全留 wire 侧（唯一读 `lastStatePayload` 的家）。
3. **上行桥 +1 通道**：`__SAGE_APP_SET_MATTER_LIST_FILTER__(showAll)`——筛选是卡内 React 状态，但侧栏「待我处理」计数是**区域外事实**，仍由 legacy 按镜像筛选态从 `lastStatePayload` 重算（`updateMatterNavCount`，与 legacy 同式：lifecycle 过滤＋partition==='action'，不做 title 检查——与旧计数口径逐字一致）。
4. **React 拥有**：分区行/触发标签/归档徽记、勾选控件（`data-matter-context-*` 全属性集）、计数三格与空态、专用 note（未核验两档、空记录、显示全部、默认文案＋选取后缀＋`data-context-selection-note` 数据集）、本地通知的**代际绑定存活**（新一代清除）与 pending。裁决拒码不涉（无码表迁移）。
5. **测试重分工**：两枚旧驱动 spec 删除（`matter-list-surface` 4 测＋`active-matter-selection-renderer` 7 测）；新 `matter-list-bridge.spec.ts`（5：双态发布＋activeContext 解析、静态钉〔含「静态无按钮」反向钉〕、选中/陈旧/兜底码三路、refused/invalid/cleared、侧栏计数镜像与清空）＋jsdom `product-app/matter-list.spec.tsx`（6：全部渲染与交互原景重安置）；探针扩到十一区域。**联动修正两处**：批次 21 spec 中暂存的 D0 过滤器测随 D0 迁 React 转入新 jsdom spec（progress 分区同形保留）；`reminder-discipline` 的「一份事实两个视图」测改为断言侧栏＋发布槽消息同源（卡片计数由 jsdom 承接）。

## Verification

- 红：两枚旧驱动 spec 对新代码 11 具名红（全部 DOM 驱动项）。
- 绿：新聚焦 11/11；全量首跑 2 红＝上述两处联动（matter-admin-groups-bridge 暂存测＋reminder-discipline 卡片计数断言）→修正后全量 `189 files / 1636 passed / 1 skipped / 0 failed`（含窗口 spec 18/18：十一区域态一致）；gate quick 27/27、objects 84/84、0 skip；`npx tsc --build` 退出 0 后 bundle 327,608 字节（批 21 为 320,073）；`b22-list-1440.png`/`b22-list-660.png` 已人工回看（筛选展开归档、触发器两式、当前事项禁用/选择事项可用、无标识行与归档行零控件、计数 2/2/0 与显示全部文案；660 无横向溢出）。
- 过程修正：组合调整留痕（上）；批次 21 spec 的暂存测与 reminder-discipline 的联动处置（上）。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 维持 D0＋D1 合批 | 否决（侦察证伪）：D1 实测≈P2 体量（确认/未知/核对流程＋auth 默认机制＋跨卡未保存链），合批会显著抬高单批风险；D1 改期专属批。 |
| 侧栏计数改由 React 经上行桥直接写 | 否决：侧栏在区域外，写入应留其现有 owner（legacy）；镜像筛选态＋legacy 重算保持了「一条事实一个家」。 |
| 卡片计数读 payload.counts | 否决：legacy 口径按**可见集**计算（筛选影响计数）；读 counts 会改变既有行为。 |
| 本地通知按新旧直接覆盖 | 否决：保留 legacy 的代际绑定（generation 匹配才存活，新一代清除）——已由 jsdom 增测钉住。 |

## Consequences

- P3 已完成 11/13 卡（sites、tool-results、run-monitor、artifacts、side-chats、action-items、plans、link、matter-admin、matter-groups、matter-list）；`renderer.ts` 5,894→5,782 行（−112）；新增 `matter-list-view.tsx`；下行桥 34 动作、上行桥 2 通道；探针十一区域。
- 余下：D1 草案（专属批，含与退出检查的未保存字段跨卡改道）、D3 会话（最长）；随后 P4 面板与 legacy 内联脚本退役。
- 未决：本批未 commit、未 push；批次 19/20/21/22 四个改动集併存未提交。
