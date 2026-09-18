# 研究结论：基座 `main` keyed slot 可用性（S0a spike）

- 日期：2026-09-19
- 状态：concluded（静态证据；运行时冒烟留作 S3 迁移首步的验收门）
- 归属计划：[docs/plans/2026-09-19-capability-hub.md](../plans/2026-09-19-capability-hub.md) S0a
- 取证范围：`vendor/dsh-desktop/dsh-plugin-desktop/src/client/`、
  `vendor/dsh-desktop/deepseek-harness/packages/client/{ui-layout,ui-sidebar,ui-conversation}/`

## 结论

**可用。** 当前 pin（DSH Desktop 2.0.5 + runtime 0.1.2-rc.1，extended 模式）下，通过
`ctx.slots.inject('main', ...)` 注册新 entryKey 全局面板是被基座主动支持的一等机制：
桌面壳透传 keyed 分发、layout 服务主动维护面板集、侧栏行自动联动、列宽收缩策略帧级生效。
S3 按原计划走「workbench 三面板迁 `main` keyed slot」路线，无需降级。

## 证据链（按三问逐条）

### 问 1：ExtendedFrame 是否透传 `main` 的 keyed 分发？

**是，且 extended/advanced/compatibility 三模式全部支持。**

- extended 模式 root 注册声明 `'main': { kind: 'keyed', scope: 'root' }`
  （`dsh-plugin-desktop/src/client/extended-shell.ts:35-44`）；
- ExtendedFrame 与 AdvancedFrame 共用 `DesktopOwnedFrame`，其 `MainPanel` 直接
  `renderSlot('main', {}, { entryKey: panelId ?? 'conversation' })`
  （`AdvancedFrame.tsx:155-158`）——keyed 分发与上游 AppFrame 同构；
- compatibility 模式用上游 `ui-layout` AppFrame，同为 keyed MainPanel
  （`AppFrame.tsx:40-43`）。

### 问 2：`sidebar.panellist` 行是否联动 active 态？

**是，且行是自动派生的，无需手写 DOM。**

- ui-sidebar 在 apply 时建 `panels` snapshot store，行列表从
  `ctx.slots.entriesOfSlot('sidebar.panellist')` 的 `{id, order, label}` **自动派生并排序**
  （`ui-sidebar/src/client/index.ts:46-52`）；
- 每行 active 态由 `usePanelInfo(info => info.activePanelId === id)` 派生
  （`SidebarRoot.tsx:60`），点击走注入的 `selectPanel(id)`
  （`contract/slots.ts:124`）；
- `selectPanel` 对未注册 key 抛错（`layout-state.ts:87-95`，判据即
  `ctx.slots.entries('main')` 里有无该 key）；面板插件卸载时
  `retainMainPanels()` 自动回落对话（`layout-service.ts:17-18` +
  `layout-state.ts:98-101`）。

### 问 3：列宽收缩策略是否对新面板生效？

**是，策略在 frame 层与面板身份无关。**

`computeDesktopColumns` 统一求三列（`layout-state.ts:58-70`）：右栏先缩
（`available < RIGHTBAR_MIN` 即丢轨道）、`CENTER_MIN=400` 恒保、侧栏
clamp 264–420。该函数对任意 `activePanelId` 都走同一条路径。

### 先例（上游自己就在用这套机制）

- `ui-conversation` 以 `slots.inject('main', ...)` 注册 `conversation` 键
  （`ui-conversation/src/client/apply.ts:388-390`）；
- 上游测试明确演示「自造面板 + 侧栏行」双注册：
  `ui-sidebar/tests/panel-list.client.spec.tsx:107`
  （`register({ name: 'main', key: metadata.id }, Body)`）、
  `ui-layout/tests/apply.client.spec.ts:112`
  （`register({ name: 'main', key: panelId })`）。

## S3 的标准注册配方（从证据直接推出）

```ts
// 每个全屏工作台面板（以扩展中心为例）两注册共享同一 id：
ctx.slots.inject('main', () =>
  ctx.slots.register({ name: 'main', key: 'workbench-extensions' }, PanelComponent))
ctx.slots.inject('sidebar.panellist', () =>
  ctx.slots.register(
    { name: 'sidebar.panellist', id: 'workbench-extensions', order: 40, label: ... },
    IconRowComponent))  // ownerProps: { size, active }
```

## 约束与注意（S3 实施时遵守）

1. **`conversation` 键保留**：新键不得与之冲突；键名建议统一 `workbench-*` 前缀。
2. **必须走 `slots.inject` 而非裸 `register`**：等声明出现、随宿主塌缩重跑
   （client AGENTS.md 注册纪律第 4 条）。
3. **label 是 locale-owned**：语言切换需重注册（`sidebar.panellist` 的 label 契约）。
4. **行轴几何**：panellist 行由官方渲染，几何天然合规；退役的 DOM 注入行须同步收缩
   `scripts/gates/sidebar-row-axis.mjs` 射程声明。
5. **运行时冒烟未做**：本结论纯静态取证。S3 迁移第一个面板时，把「面板渲染 +
   active 态 + 列宽拖拽 + 卸载回落」四路径跑一次真实浏览器验收，作为该批次的门。

## 替代路线的排除

- 维持 centerCol querySelector DOM 挂载：已被本结论证伪其必要性——基座机制完整且
  附赠侧栏行/active 态/回落语义，DOM 挂载还要自养 MutationObserver 自愈
  （黑屏事故 P-52 的土壤）。
- 接管 `sidebar` 整列（single slot 替换）：能做但代价是整列自绘，违反「能力带收敛」
  的初衷，排除。
