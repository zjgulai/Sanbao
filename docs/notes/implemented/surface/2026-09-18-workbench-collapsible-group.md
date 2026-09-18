# 决策记录：能力带折叠组「工作台 ▸」收编落地

- 日期：2026-09-18
- 状态：implemented
- 对应 ADR：[ADR-0125](../../../adr/ADR-0125.md) D4、[ADR-0079](../../../adr/ADR-0079.md)、[ADR-0009](../../../adr/ADR-0009.md)
- 涉及包：`shared/client/sidebar-entry-core.ts`、`packages/surfaces/dsh-skill-center-local`、`packages/surfaces/dsh-role-matrix-local`、`packages/surfaces/dsh-newapp-local`

## Problem

根据 ADR-0125 D4，侧边栏能力带的四个入口（任务板、SSH、扩展中心、岗位矩阵）需要收纳进「工作台 ▸」折叠组，以满足 P1 目标：
1. 侧边栏一级可见行数量收敛（≤4 行）；
2. 保持 ADR-0079 与 ADR-0125 D4 规定的行轴契约（`box-sizing: border-box; width: 100%; margin-inline: 0; padding-inline: 10px; height: 36px`），折叠组不得引入独立行高或横向破坏；
3. 折叠状态需安全持久化到 `localStorage`，支持异常捕获降级；
4. 插件卸载或重装后骨架不变形，任意一个能力包加载均可幂等挂载工作台折叠组，并将同族能力条目收进 L2 容器。

## Decision

1. **共享核心层支持折叠组抽象（`mountSidebarGroup`）**：
   - 在 `shared/client/sidebar-entry-core.ts` 中导出 `mountSidebarGroup` 与 `SidebarGroupOptions`；
   - L1 组行使用标准 entry 样式、SVG 折叠箭头（带 `180ms ease` 旋转过渡）及 `aria-expanded` 属性；
   - 折叠状态持久化于 `dsh-workbench:collapsed`，所有读写均被 `try/catch` 保护以兼容无 `localStorage` 或沙箱环境；
   - L2 容器为带有 `[data-dsh-part="sidebar-group-container"]` 的 `div`，通过 `memberSelectors` 自动收纳子条目（`data-dsh-taskboard-entry`、`data-dsh-ssh-entry`、`data-dsh-role-matrix-entry`、`data-dsh-skill-center-entry`），并在 MutationObserver 检测到 DOM 变化时自愈。
2. **多包幂等自愈**：
   - 技能中心（`dsh-skill-center-local`）与岗位矩阵（`dsh-role-matrix-local`）均通过 `mountWorkbenchGroup` 声明并挂载工作台折叠组；
   - `mountSidebarGroup` 具备首行 DOM 幂等守卫（`document.querySelector(options.groupSelector) !== null`），先到者挂载、后到者复用；卸载时释放回原始 DOM 结构。
3. **保持行轴与门禁完全绿标**：
   - 组行完全继承 `.entry` 现成样式，完全符合 `sidebar-row-axis` 门禁约束；
   - 通过 `node scripts/sync-shared.mjs --write` 将核心代码分发至各消费包，0 漂移。

## Alternatives considered

1. **将工作台折叠组做成独立插件**：
   - 增加一个独立包与构建负担，且在单个插件独立禁用时容易引入挂载竞态。
   - 否决：通过共享核心提供幂等组挂载能力，任何同族插件均可自然承载。
2. **在 CSS 中使用纯 checkbox hack 实现折叠**：
   - 无法跨渲染周期保留展开状态，且无法灵活接管动态插入的兄弟节点。
   - 否决：采用 DOM 容器收纳 + `localStorage` 显式持久化。

## Consequences

- **正面**：侧边栏能力带条目已收纳至「工作台 ▸」折叠组，完全符合 ADR-0125 D4 规划；
- **验证**：
  - 新增 `packages/surfaces/dsh-role-matrix-local/tests/sidebar-entry-group.spec.ts` 4/4 通过；
  - `dsh-skill-center-local` 全量测试 12/12 文件 84/84 通过；
  - `dsh-role-matrix-local` 全量测试 12/12 文件 126/126 通过；
  - `dsh-newapp-local` 全量测试 16/16 文件 182/182 通过；
  - 核心门禁 `sidebar-row-axis.mjs`、`sidebar-row-axis.test.mjs`（20/20）及 `sync-shared.mjs` 均 100% 通过；
  - 已通过 `sync-profile.mjs --apply --loadpoint` 与 `--apply` 将更新原子同步至 Desktop 真实装载点与 vendor 副本。
