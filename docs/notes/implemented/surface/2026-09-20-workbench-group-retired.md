# 决策记录：能力带折叠组「工作台 ▸」退役——条目全部平铺

- 日期：2026-09-20
- 状态：implemented
- 对应 ADR：[ADR-0125](../../../adr/ADR-0125.md)（修订节，修订其 D4）、[ADR-0079](../../../adr/ADR-0079.md)（行轴契约）、[ADR-0009](../../../adr/ADR-0009.md)（一份事实一个家）
- 涉及包：`shared/client/sidebar-entry-core.ts`（含 newapp / role-matrix / right-sidebar 三份生成副本）、`packages/surfaces/dsh-role-matrix-local`、`packages/surfaces/dsh-skill-center-local`（文案残留清理）
- 前置记录：[2026-09-18-workbench-collapsible-group](2026-09-18-workbench-collapsible-group.md)（折叠组的落地记录，本条退役它）、[2026-09-19-workbench-group-livelock-boot-blackout](2026-09-19-workbench-group-livelock-boot-blackout.md)（收养链竞态的根治记录）

## Problem

ADR-0125 D4 冻结的「工作台 ▸」折叠组（L1 组行 + L2 容器，折叠态持久化于
`dsh-workbench:collapsed`）在落地后其收纳对象逐层空心化：技能中心于 S3.1（2026-09-19）
迁到官方 `sidebar.panellist` 行、任务板与 SSH 的注入行已退役——组内实际只剩
「岗位矩阵」一条。

2026-09-20 用户在实机上看侧栏后裁决：**「左侧边栏的工作台不要再做折叠的功能了，全部铺开」**。
对单条目分组而言，折叠交互只增加一次点击与一处状态（localStorage、chevron、`aria-expanded`、
MutationObserver 收养链），没有信息价值——而那条收养链正是 2026-09-19 黑屏事故（总账 P-52）的
根因面。退役同时与 capability-hub 计划 S3「DOM 注入面只减不增」的方向一致。

## Decision

1. **`mountSidebarGroup` 抽象整条退役**：从 `shared/client/sidebar-entry-core.ts` 删除
   `mountSidebarGroup`、`SidebarGroupOptions` 与 chevron 常量；`node scripts/sync-shared.mjs --write`
   同步三份生成副本（newapp / role-matrix / right-sidebar），26 个消费方逐字节一致。
2. **role-matrix 不再挂组**：删除 `mountWorkbenchGroup()`、`WORKBENCH_GROUP_SELECTOR` 及其在
   `mountSidebarEntry` 内的挂载/卸载调用；「岗位矩阵」行仍走既有 `mountSidebarEntry`
   （`position: 'after'`）直接平铺，行样式仍是 `.entry` 黄金模板（36px 行高、`margin: 2px 0`、
   `padding: 0 10px`、`box-sizing: border-box`），行轴契约（ADR-0079）不变。
3. **文案与测试清理**：role-matrix 与 skill-center 的 `workbench.group.*` 文案删除；
   测折叠组行为的 `tests/sidebar-entry-group.spec.ts` 删除（被测机制已不存在）。
4. **`dsh-workbench:collapsed` 历史值不迁移**：键不再被读写，已写过的值留在 localStorage 无害。

## Alternatives considered

- **保留组行、只去折叠**（组行退化为静态标题）：仍要维护 L2 容器与收养机制，且静态标题行对
  单条目没有分组语义，收益为负、复杂度照旧。
- **行迁 `sidebar.panellist`**（capability-hub S3.3 的原计划）：是更彻底的收敛，但属官方槽位迁移，
  与 S3.2/S3.3 的面板迁移同批做才安全；现在做会把两类风险混进一次提交。本次只落地「退役折叠」一步。
- **保留 `mountSidebarGroup` 作为通用工具留着**：无调用者的仪器就是永远跑不到、坏了也没人发现的
  死代码（P-24 的邻居形态），且它的收养链是已知事故面——删。

## Consequences

- **DOM 注入面减小**：不再有组行/容器两个注入节点，收养 observer 链（P-52 复发面之一）随删除消失。
- **`sidebar-row-axis` 门禁射程不变**：它只登记注入**行**（role-matrix / newapp / right-sidebar 三行），
  组行从未进入其 REGISTRY；本次退役不触碰该门禁。
- **行序**：由各包 `mountSidebarEntry` 的锚定逻辑决定；`familySelectors` 里 taskboard / SSH /
  skill-center 三个已退役行的选择器残留（对不存在元素是 no-op）保留原样，待 capability-hub
  S3.2/S3.3 统一清理——本次刻意不顺手改，避免在并发会话的活跃区扩大改动面。
- **实机读数**：见下节。

## 验证读数（2026-09-20）

- `packages/surfaces/dsh-role-matrix-local`：`pnpm run typecheck` 通过；`pnpm test` 144/146——
  2 条红在 `tests/panel-layout.spec.ts` 的「css 不含 `linear-gradient`」断言，**属并发会话在制品**
  （其微质感改版给 `role-matrix.module.css` 新增了 `linear-gradient`，该 spec 正在由该会话同步改写），
  与本退役无因果；本改动相关的 `sidebar-entry-split`（8/8）、`sidebar-entry-stacked`（9/9）、
  `contract`（12/12）全绿。
- `packages/surfaces/dsh-skill-center-local`：`pnpm test` 87/87 全绿。
- `node scripts/sync-shared.mjs`：26 个消费方全部一致（校验模式）。
- 全仓残留检查：`mountSidebarGroup` / `workbench.group` / `data-dsh-workbench` 在
  `packages/ shared/ scripts/`（排除 node_modules 与构建产物）零命中。
- `pnpm run gate`（quick）：**107/111 通过**（`GATE_EXIT=1`）——唯一红项 `repo-attest-selftest`
  属并发窗口内的外部写入（多会话同写一棵树；单跑 `node --test scripts/lib/repo-attest.test.mjs`
  9/9 全绿，门禁自带说明已预告该情形）；本改动相关项全绿：`shared-sync`、`sidebar-row-axis`
  （3 注入行 / 2 列射程不变）、`adr-note-links`、`package-identity`。
- **装载点同步**：`pnpm run build`（role-matrix）→ `node scripts/sync-profile.mjs --apply --loadpoint`
  写入 1 个文件（`lib/client.js`，workbench 痕迹 12 → 0）；产物级冒烟 `tests/client-boot.spec.ts`
  4/4（module loader 下装载新 bundle）。
- **实机可见验收：已确认（2026-09-20）**——宿主在引导期对 `/plugins/…&rev=` 做快照，重启后
  用户确认左侧边栏的「工作台」组行**已消失**（重启 = `osascript quit` by `ai.deepseek.dsh.desktop`
  + `open -b`）；装载点已就位，无需再构建/同步。
