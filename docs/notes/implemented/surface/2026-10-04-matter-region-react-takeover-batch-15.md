# Batch 15 / P2：事项工作台区 React 接管（ADR-0261 strangler 第一个区域）

- 日期：2026-10-04
- 状态：本地完成（未 commit、未 push）
- 依据：[ADR-0261](../../../adr/ADR-0261.md)（D7：P1 不接管任何区域 → P2 事项工作台区）、决策包 Note 的分阶段迁移与「每区单一 owner」

## Problem

framework-free 的内联脚本（renderer.ts 手术前约 7.4k 行模板）同时拥有路由、视图切换、全部面板写入与事项工作台区的动态渲染，还包括窄宽抽屉的状态机（`setMatterTraceOpen` / `isMatterTraceDrawerMode`、Escape/Tab 围合、焦点回收、`matchMedia('(max-width: 900px)')` 与视图切换联动）。批次 12/13 已证明在这个巨型模板里做精细区域改动成本高且易留旧假设；ADR-0261 的 strangler 要求逐区把 DOM 所有权移交 React，第一步就是事项工作台区（heading + focus 卡 + trace rail）。迁移不得改变任何既有 id/ARIA/几何断言——两套真实 Electron 探针与批 10/11 的密度/主题/抽屉键盘断言都钉在这块 DOM 上。

## Decision

1. **区域边界**：`#sage-matter-region`（首个服务端渲染的 fail-closed 首帧包裹层）之内全部归 React：`.sage-section-heading`（含 `#matter-panel-source`、`#matter-trace-toggle`）、`#matter-workbench`（`#matter-current-work` focus 卡 + `#matter-trace-rail` rail）。首个服务端渲染只保留 fail-closed（`data-matter-region-state="unavailable"`）静态形态，React 挂载后整段替换；JS 不跑时仍是 fail-closed 文案。
2. **同 payload 桥接**：legacy 脚本保留 wire 解释（`isMatterProjection` 校验、envelope 判别）为唯一解释家，经 `window.__SAGE_APP_SET_MATTER__` 发布三种消息：`{kind:'projection', projection}` / `{kind:'invalid'}` / `{kind:'unavailable'}`；视图切换经 `window.__SAGE_APP_SET_VIEW__` 发布（抽屉策略输入：离开事项关闭；宽幅回到事项打开）。legacy 脚本不再 query 或写区域内的任何节点；非区域事实（`#sage-workspace` 数据属性、顶栏 pill、侧栏 CURRENT MATTER 上下文）仍由 legacy 写。
3. **抽屉状态机整体搬入 React**：open/close、宽窄策略、Escape/Tab 围合、焦点回收（开→focus 关闭键；Escape/关闭→focus 触发器）、media 断点与视图联动，逐项对齐 legacy 语义；`data-drawer-open`/`data-drawer-modal`/`role`/`aria-modal`/`aria-hidden`/`aria-expanded` 由状态渲染。
4. **同步提交语义**：真实窗口探针在 `dispatchEvent` 返回后立刻读 `data-drawer-open`/`aria-hidden`（legacy 是事件里同步写 DOM）。React 的普通 setState 提交是异步的——实测探针读到了陈旧属性（`defaultPrevented=true`、焦点已回收，但 `drawerOpen` 仍 `true`）。开/关动作一律 `flushSync` 提交，恢复 legacy 的同步可观察语义。
5. **机器可读状态**：React 在容器上维护 `data-matter-region-state`（`fixture`/`live`/`unavailable`/`invalid`）；探针把它纳入首帧等待条件（与 `workspaceProjectionSource`、`reactAppMounted` 一起），确保后续 DOM 断言读的是 React 已应用的同一投影。
6. **测试重分工**：`matter-projection-renderer.spec.ts` 与 `matter-workbench-ia.spec.ts` 改为 **bridge 合同**（fake DOM：消息序列、投影透传、区域哨兵「节点未被写」、侧栏上下文仍被写）；区域渲染与抽屉键盘契约迁到 jsdom 组件 spec `test/product-app/matter-region.spec.tsx`（per-file jsdom）；`ui-keyboard.spec.ts` 的四条抽屉测试移交给该 jsdom spec（导航与用户菜单键盘测试保留）；真实窗口探针逐项回归原文不变。

## Verification

- **红**（实施前）：bridge 合同 6/6 具名红（`expected undefined to deeply equal {kind:'projection'…}`、区域哨兵断言红）+ jsdom spec 模块缺失红（`Failed to resolve import "../../src/product/app/matter-view.js"`）+ 真实 Electron 探针红（`React matter region did not reach the expected state (null)`）。日志＝`.birdview/evidence/ui-decision-01-p2-2026-10-04/red-*.log`。
- **绿**：聚焦 27/27（bridge 8 + jsdom 7 + ui-keyboard 3 + ui-shell-contract 9）；全量 `186 files / 1615 passed / 1 skipped / 0 failed`；仓根 gate quick `27/27`、objects 84/84、0 skip。真实窗口 spec 全 18 条绿：fixture 六阶段、light/dark 主题与 A11y、双进程主题/密度恢复、760 抽屉（开→Escape 同步读、Tab 围合、关闭键焦点回收）、320 CSS px、unavailable 与 negative control。
- **过程中抓到的一类真实缺陷**：删除 refs 区块时把 `matterContext*` 四个声明一并删掉（在删除区间内），发布函数在写侧栏上下文时抛 `ReferenceError`——被 refresh 的 try/catch 吞掉，表现只是「桥无消息、侧栏为空」。bridge 合同的侧栏哨兵断言当场把它变成具名红并定位（fake DOM 直读 + 真 sink 捕获），修复后复绿。教训：模板字符串里的脚本错误语法检查抓不到（`node --check` 通过），靠的是「消息序列 + 非区域写入」双哨兵。
- **可见证据**：`p2-matter-1440.png`（fixture 全区域）、`p2-matter-660.png`（窄幅关闭态）、`p2-matter-660-drawer.png`（窄幅抽屉打开、关闭键带焦点环）三张已人工回看；独立页（真 bundle + fetch stub）`document.title` 读数为 `READY fixture`。bundle 237,037 字节（守卫上限 450k 内）。
- 首跑全量 18 红＝窗口探针 narrow `Escape` 同步读陈旧（见 Decision 4），`flushSync` 修复后全绿——红是探针按 legacy 同步语义工作，不是探针过时。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| React 只接管动态节点（按 id 写入），骨架留 legacy | 否决：混合所有权违背「单一 owner」，正是要消除的写入形态。 |
| 抽屉状态机留 legacy、React 只呈现 rail | 否决：同一区域两个 owner（rail 属性 vs 按钮状态），分裂大脑。 |
| 事件处理器里同步手写属性 + setState | 否决：绕过 React 渲染路径会与 vdom 去同步（React 认为属性没变时不再写 DOM）。 |
| 仅异步 setState（不做 flushSync） | 实测红：真实探针在事件返回后同步读属性；这会改变 legacy 可观察语义＝行为漂移。 |
| 把 `data-matter-region-state` 写进 React 子树 | 否决：机器可读状态挂在容器（root 外），用 effect 写容器属性，DOM 形状与首帧一致（无额外包裹层）。 |

## Consequences

- 第一个区域完成 React 接管；`renderer.ts` 从 7,447 行降到 7,205 行（−242），区域渲染迁入 `src/product/app/matter-view.tsx`（434 行）+ `matter-bridge.ts`（62 行）。
- 探针新增 `matterRegionState` 等待/断言与 `escapeParts` 分解诊断（仅读数，无断言依赖）。
- 守卫 spec 的 `.tsx` 边界扫描自动覆盖 `matter-view.tsx`；bundle 体积守卫保持绿。
- 未决：P3「已接线操作面」卡片群逐卡迁移；legacy 内联脚本仍拥有其余全部区域与视图/导航/顶栏/侧栏/设置等。本批未 commit、未 push。
