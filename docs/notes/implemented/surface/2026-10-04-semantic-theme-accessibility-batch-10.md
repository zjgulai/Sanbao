# Batch 10：Sage semantic theme 与真实可访问性闭环

- 日期：2026-10-04
- 状态：implemented locally, not committed
- 对应决策：[ADR-0257](../../../adr/ADR-0257.md)
- 范围：UI-TOKEN-01 / RUNTIME-03A（theme-only）/ UI-A11Y-01

## Problem

UI-IA-01 与 UI-FIXTURE-01 已让 `BusinessMatter` 成为默认三栏工作台，并能用六个只读 fixture 经 production wire 驱动 DOM，但可见产品仍有三组没有闭环的缺口：

1. palette、状态色、边界、圆角、shadow 与 motion 混在 `renderer.ts`，固定 `color-scheme: dark`；`--sage-radius` 未声明，`--sage-warn` 依赖 fallback，品牌色还兼任 ready/success。小字 `--sage-faint` 的旧 canonical 对比度约为 `4.02:1`。
2. 八项 display preference 虽能密封持久化，但保存的 theme 没有驱动 Electron `nativeTheme` 或 root DOM；界面还声称“八项都即时生效”，把“写进设备”误写成“产品已应用”。
3. 静态/Fake DOM 验收会隐藏真实交互缺口：窄宽导航移除视觉文字后丢 accessible name，tablist 没有 vertical 语义，user-menu 测试把 Escape 直接投到 panel；真实 200% reflow 还暴露了工作台与 link/state rows 的横向溢出。

Sanbao / Qoder 在本批仍只提供注意力组织与状态行为证据；其 CSS、asset、runtime、iframe、WebView 与 `file:` 均不进入 Sage。

## Decision

### D1 · 只有一个 Sage semantic token owner

`product/theme-tokens.ts` 独占 light / dark 两套 literal palette，并声明 `canvas / sidebar / surface / raised / overlay / ink / muted / faint / divider / border / brand / focus / success / warning / danger / radius / shadow / spacing / motion`。renderer 只消费 `var(--sage-*)`：没有第二处 palette、fallback、`--sb-*` 或 `--sanbao-*`，也不再用展示页式渐变或带色辉光表达层级。

`brand` 与 `success / warning / danger` 是不同值；普通文字在 canonical surfaces 上至少 `4.5:1`，focus 与非文本角色至少 `3:1`。token test 同时扫描 renderer/component consumer，未声明引用、owner 外 color literal、第二处声明、fallback 或 prototype namespace 都会判红。

### D2 · theme 从持久化贯穿 main、Chromium 与 DOM

Electron main 在创建 `BrowserWindow` 前读取密封 preference record，并用 `createDisplayThemeAdapter(nativeTheme).apply(requested.theme)` 精确设置 `system | light | dark`。保存路径先持久化；写入失败时不碰 `nativeTheme`，成功后才应用新 theme并重新读取 main-owned system observation。

renderer 只把 Application Service 返回的权威 preference projection 写成：

- `data-sage-theme-requested="system|light|dark"`
- `data-sage-theme-effective="light|dark|unknown"`

`effectiveTheme=null` 精确写成 `unknown`；首帧或 unknown 只用 `prefers-color-scheme` 选择视觉 fallback，不修改属性、不铸造 effective fact。system media change 只触发重新读取 `/.sage/state`。built runtime 的 `product/theme-tokens.js` 同时进入 profile `HOST_LIB_FILES`，避免 build 绿但 materialization 丢文件。

### D3 · 本批只声明 theme 已应用

设置页精确说明：“主题即时生效；其余七项仅保存，尚未接入产品显示。”language、density、font style、content width、terminal theme、file icons 与 icon appearance 仍只持久化；完整 RUNTIME-03 保持 open。

### D4 · keyboard 与 drawer 以真实 focus 路径为准

七个一级 tab 构成 vertical tablist，初始只有 Matter `tabindex=0`，其余为 `-1`；每个 tab 都有稳定业务 accessible name，ArrowUp / ArrowDown 同步 selection、panel、roving tabindex 与 focus。

user-menu 的 trigger 与 panel 都能处理 Escape，关闭后 focus 返回 trigger。wide trace rail 是 `role=complementary`；只有 900px 以下且打开时才提升为 `role=dialog aria-modal=true`，关闭与回到 wide 时撤销 modal。当前 drawer 唯一可聚焦控件是 close button，Tab / Shift+Tab 均在该控件闭环；Escape 与 close-button 两条路径都返回 trigger。document-level Escape 只在窄宽 modal open 时生效。

### D5 · 可见验收必须量 computed behavior 与约 320 CSS px

真实 Electron probe 读取 Accessibility tree、真实 `activeElement`、computed outline、CDP emulated reduced-motion 的 computed duration、1440↔760 drawer 往返、约 320 CSS px 的 root / internal overflow allowlist，以及同一隔离数据根的第二进程 restart。

320 CSS px 下，sidebar/main/card 缩窄，section heading 转为纵向，state rows 与 link controls 允许收缩到 `min-width:0` 并占满可用宽度；这只是 reflow 修复，不是 density preference 应用。

## Verification

- Theme kernel Red：两个目标模块缺失，`2 suites failed / 0 tests`；Green 后 token/adapter 为 `13/13`，含低对比度 palette mutation、consumer 引用闭包、invalid/unavailable/throw/readback mismatch 与 main source ordering。
- A11Y Red：`2 files / 16 tests` 中 `7 failed / 9 passed`，精确命中 vertical tab、初始 roving tabindex、窄宽 names、wide complementary、modal/focus containment 与 trigger Escape；Green 后 `16/16`。
- Preference copy Red：旧文案不含 theme-only 边界；Green 后 `15/15`，并断言不再出现“八项都即时生效”或“无需重启”。
- 真实 Electron Red：root theme attributes/native/computed palette、真实 user-menu Escape、AX tab names、focus outline、reduced-motion、modal drawer 与约 320 CSS px reflow 均曾分别判红；reflow 精确点名 `#sage-workspace`、`.sage-main`、Matter panel/heading、link card 与 state rows。修复后整文件 `16/16`、exit 0。
- Probe 自检额外发现首进程 `zoomFactor=2` 会污染同 origin 的第二进程；仪器现于截图后恢复 zoom=1 与 1440 content size，restart focused 同一判据复绿，没有放宽产品断言。
- 聚焦回归为 `5 files / 44 tests passed`；production build、typecheck 与新增 runtime registration 的 `layout.spec` `6/6` 通过。
- 完整 Sage Shell suite 为 `181 files / 1593 passed / 1 skipped / 0 failed`；既有 skip 没有被改写为 pass。
- 保存像素证据的最终真实 Electron 复跑同样为 `181 files / 1593 passed / 1 skipped`，生成 40 张 PNG；人工逐张回看六态 light/dark 1440、system、760 drawer、200% 与 unavailable 代表帧，未见主题串色、异常裁切、横向溢出或 fail-closed 状态被伪装成可用。
- 仓根 `pnpm run test:gate` 为 `222/222`；`pnpm run gate` 为 `27/27`，对象账为 `84/84`、零 skip/failed；`git diff --check`、package/lockfile/vendor 与 staged-file 边界均通过。
- BirdView authoring validation 为 11 modules / 15 relationships / 7 events、零 error/warning；Batch 10 HTML 已由官方 renderer 重新生成并人工检查 architecture / changes 两个视图。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 在 renderer 保留 dark palette，再叠一组 light overrides | 否决。会产生第二个事实家，undefined token 与 fallback 仍可假绿。 |
| 复制 Qoder / Sanbao CSS 或主题资产 | 否决。外部原型只作证据，不是 Sage runtime dependency。 |
| renderer 直接根据 `matchMedia` 写 effective theme | 否决。system observation 属于 Electron main；renderer 只能重新读取权威 projection。 |
| 保存前先改 `nativeTheme` | 否决。持久化失败会留下“界面已变但回执失败”的分叉。 |
| 把八项 preference 全部标成 live | 否决。当前只有 theme 有产品应用链，其余七项仍是后续 RUNTIME-03。 |
| 继续向 panel 直接 dispatch Escape | 否决。它跳过真实 activeElement 与事件传播路径，不能证明键盘可用。 |
| 只断言根 scrollbar 或截图文件存在 | 否决。必须列出非 allowlist overflow、关键控件可见性与 computed focus/motion。 |
| 引入 React、CSS-in-JS、颜色库或截图 dependency | 否决。Batch 10 延续 ADR-0254 的 bounded renderer，不提前替 UI-DECISION-01 决定最终栈。 |

## Consequences

- Sage 有唯一、framework-neutral 的 semantic theme owner；light/dark/system 能穿过密封 preference、Electron main、Chromium media 与 root DOM，并可在真实第二进程恢复。
- 工作台在 1440、760 drawer 与约 320 CSS px 下保持语义、focus、关键控件与零根级横向溢出；reduced-motion 与 focus 由真实 computed style 证明。
- 本批没有新增业务 ActionIntent、route、provider、Host call、authority、domain persistence、dependency、package 或 lockfile，也没有改变六态 fixture 的 blocked / zero-write 边界。
- UI-TOKEN-01 与本批列明的 UI-A11Y-01 范围可关闭；RUNTIME-03 只完成 theme 子切片，完整 UI-01、真实事项 mutation、production provider/E2E 与完整 Qoder UI/UX 复刻仍未完成。
- 改动已写入 `main` 工作区，但未 stage、未 commit、未 push、未 merge、未发布。
