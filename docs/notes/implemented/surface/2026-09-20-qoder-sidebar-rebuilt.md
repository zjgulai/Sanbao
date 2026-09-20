# 决策记录：右栏推倒重来——卸掉市场插件，新建「活动页」插件（dsh-qoder-sidebar-local）

- 日期：2026-09-20
- 状态：implemented
- 对应 ADR：[ADR-0143](../../../adr/ADR-0143.md)（活动驱动模型与本条同源）、[ADR-0061](../../../adr/ADR-0061.md)（外部产品只在本机 profile 装配）
- 涉及包：新增 `packages/surfaces/dsh-qoder-sidebar-local`；退役（从运行时移除）`packages/surfaces/dsh-right-sidebar-local`；本机 profile 卸载 `dsh-better-sidebar@0.18.1`
- 前置记录：[2026-09-20-right-sidebar-workbench-folds](2026-09-20-right-sidebar-workbench-folds.md)（旧包的原生 docking 与折叠）

## Problem

用户看到右侧一直"不是 Qoder 的样子"，指出**右侧导航栏本身是市场装进来的一个插件**，要求：先卸掉它，再按 Qoder 当前产品的方式重做一个新插件——并且要**结合此前讲清的语义**：那是一张 **UI 模板**，新建空白会话里没有它，AI 开始调用工具、产出资源时才一栏一栏长到右边。

收口前的实际状态有三层问题：

1. **右侧有两个家**：市场包 `dsh-better-sidebar@0.18.1`（VSCode 式右栏：explorer/editor/terminal/git/browser）
   占着最右 356px，外壳（AppFrame）为它预留 `padding-inline-end: 356px`；本仓旧包
   `dsh-right-sidebar-local` 又在原生 `ui-sidebar-right` 列里放「工作台」标签——两套右栏互相挤压。
2. **旧包是个"常驻看板"**：7 个模块（待办/环境/技能与 MCP/网页/进程/产出/来源）在空白会话里也照常渲染，
   与用户描述的模型相反；它还带一页被用户否决的设置页与退役不干净的左栏入口。
3. **活动折叠读错了事件形状（真 bug）**：`foldSessionActivity` 按「负载挂在事件对象上」写
   （`event.name` / `event.callId`），而客户端事件窗口里是**信封** `{type, seq, time, data}`——
   负载在 `event.data`。源码读起来通顺、类型也对，后果是**什么都对，就是什么都不显示**。

## Decision

1. **卸载市场右栏插件** `dsh-better-sidebar`：从 profile 的 `dependencies` 与 `dsh.profile.bundles`
   摘除 + 删 `node_modules` 副本（回滚：`dsh plugin --profile desktop add dsh-better-sidebar@0.18.1`）。
   同时把 `dsh-patches/compat-chrome-slim/apply-fixes.sh` 里属于旧右栏包的面板头部锚点退役
   （新包没有那种面板头部），锚点校验重跑通过。
2. **新建插件** `packages/surfaces/dsh-qoder-sidebar-local`（`luteOrigin: self`），只做一件事：
   在原生右栏里渲染**本会话活动**。它由三块组成——
   - `session-activity.ts`：事件流 → 各栏的折叠（**从 `event.data` 读负载**；空会话 → 空数组）；
   - `sidebar-surface.ts`：原生标签类型 + 标签体登记，`inject(sessionId)` 把事件窗口递进来；
     首次展开把本页补到前台（原生 `defaultSeed` 只在全机只有一个 guide 条目时生效）；
   - `sidebar-body.tsx`：渲染各栏；**没有活动就没有任何栏**（环境信息也只在会话有活动时才出现）。
   视觉零字面色（`--dsw-*` token），折叠用 `grid-template-rows: 0fr↔1fr`。
3. **旧包退出运行时但不删源码**：同树还有并发会话的在制品，且活动模型已由新包覆盖；
   旧包从 profile 摘除后不再被加载，源码树留待单独清理。
4. **把教训钉进测试**：`test/activity-fold.test.ts` 用**真机夹具**（从活会话窗口抓下来的信封事件）
   断言折叠结果——读错负载位置时该测试立刻变红。

## Alternatives considered

- **继续修旧包**：能省一次装机，但旧包的主题是"7 个模块的常驻看板 + 设置页"，与"活动驱动的模板"
  是两个产品；改它不是改名，而是把它的里子全换掉，留着的只会是历史债。
- **自己写右栏外壳**（像 better-sidebar 那样绝对定位的面板）：要复刻列的宽度、开合、标签条、
  拖拽与全屏，且很容易再出现"两套右栏"；原生 `ui-sidebar-right` 列已经把这些做完了。
- **删除旧包源码**：会动到并发会话未提交的在制品，且删除不可逆；改为"退出运行时 + 留痕"。
- **保留 better-sidebar 只改样式**：用户明确要求卸载，且它的 356px 占位正是挤压聊天区的元凶。

## Consequences

- 正面：右侧只剩一套（原生列）；聊天区不再被 356px 占位；空会话里活动页为空、有活动时逐栏长出，
  与用户给的模型一致；旧包 121 kB 客户端 bundle 换成 29 kB。
- 代价/限制：旧包源码仍在树里（未删，待清理）；~~原生右栏列宽仍是外壳的 45% 比例、无宽度设置口~~
  **（2026-09-20 订正：这句是错的——宽度写入口存在，`setRightbar` 被 TS `private` 挡在类型面之外；
  宽度设置口已按 [ADR-0146](2026-09-20-rightbar-width-setting.md) 落地）**；
  新会话在"没有标题/没有消息"阶段外壳根本不渲染展开按钮，所以那一阶段右栏打不开
  （与"空白会话里没有这些"一致，但用户若想在新会话里提前打开右栏，得等会话有了内容）。
- 验证：`pnpm test`（4/4，含真机夹具回归）、真机 CDP 探针
  `scripts/acceptance/right-sidebar-activity-live.mjs`（全判据通过：标签条「活动」、3 栏 16 行、
  状态点颜色、折叠 94→0→94）、`pnpm run gate`（108/111，余 3 项为 skip 而非失败）。
