# Batch 11：Sage display density 真实应用与重启恢复

- 日期：2026-10-04
- 状态：implemented locally, not committed
- 对应决策：[ADR-0258](../../../adr/ADR-0258.md)
- 范围：RUNTIME-03B（density-only）

## Problem

Batch 10 已把八项 display preference 密封持久化，并完成 theme 的 main → Chromium → root 应用链；但 `density=comfortable|compact` 仍只是“保存成功”的数据，没有驱动产品根状态或任何 computed geometry。设置页因此必须把 density 归在“仅保存”一侧，用户也看不到高密度桌面工作台。

同时，density 不能靠 viewport、主题或本地 toggle 猜测：权威事实必须继续来自 Application Service 返回的 `preferences.requested.density`。非法、缺失或无法读取的 projection 必须保留 `unknown`，不能把视觉 fallback 冒充为已确认的 comfortable。Sanbao / Qoder 在本批仍只提供高密度注意力组织证据，不提供 CSS、asset 或 runtime。

## Decision

### D1 · density 是独立的 geometry token 轴

`product/theme-tokens.ts` 继续作为唯一 token owner，并新增与 light/dark palette 正交的五个 density role：`nav-item-padding`、`main-padding`、`card-padding`、`row-gap`、`control-min-height`。comfortable 精确保留 Batch 10 基线；compact 只收缩这些几何值，不改变字号、行高、颜色、文案、信息层级或业务状态。

theme consumer 与 density consumer 分别按 `--sage-*`、`--sage-density-*` 做 exact namespace closure；renderer/component 不得另建 spacing palette、fallback 或 prototype namespace。

### D2 · root 只呈现权威 requested density

renderer 将 exact `preferences.requested.density` 投到 `data-sage-density="comfortable|compact"`。缺失、非法、`null` 或整个 preferences 不可用时写 `unknown` 并清除旧值；`unknown` 与缺失属性只在 CSS 中使用 comfortable 作为视觉 fallback，不回写权威事实，也不新增 `effectiveDensity`。

设置页与快捷菜单继续共享同一个保存 route。保存成功后两个 select、root fact 与 computed layout 同步；保存失败重新读取存量 projection，不能留下乐观 compact。设置文案改为“主题与密度即时生效；其余六项仅保存，尚未接入产品显示。”

### D3 · 真实窗口测五类 geometry，并证明 restart

真实 Electron probe 读取 nav、main、card、row、control 五类 computed sentinel，在 light/dark 下执行 `comfortable → compact → comfortable`，要求 compact 每项收缩、恢复值回到原基线，同时 font-size 与 line-height 逐项不变。

同一 production build 继续覆盖 1440、760 drawer、约 320 CSS px 等价 reflow、真实 keyboard/focus/Escape、AX names、reduced-motion、横向 overflow、六态 fixture、blocked ActionPreview 与零业务写入。隔离数据根的第二个 Electron 进程必须恢复 compact，并让 projection、两个 select、root 与 computed geometry 一致。

## Verification

- Token Red：新增 density contract 初次运行为 `3 failed / 6 passed`；selector 命名校正的可证伪 run 为 `1 failed / 8 passed`，精确拒绝旧的 `data-sage-density-effective`。Green 为 `9/9`。
- Preference Red：旧 renderer 为 `2 failed / 14 passed`，分别命中 root density 缺失与“其余七项”旧文案。Green 后 preference 为 `16/16`，覆盖 `compact → comfortable → malformed/null/missing/whole-null → unknown`、双入口与保存失败回退。
- 聚焦与邻接回归：theme token + preference 为 `25/25`；renderer / keyboard / workbench 邻接集合为 `43/43`；typecheck、production build 与 `git diff --check` 通过。
- 真实 Electron：完整文件 `18/18`；density 主矩阵定向 `1 passed / 17 skipped`，第二进程 compact restart 定向 `1 passed / 17 skipped`。可逆故障注入把 compact root 临时退回 comfortable 后，probe 以 exit 2 精确报告 light/dark 的 root 与十项 geometry 未收缩；临时 mutation 已删除，随后完整 18/18 复绿。
- 完整 Sage Shell：`181 files / 1600 passed / 1 skipped / 0 failed`；既有 skip 未被改写为 pass。
- 保存了 17 张真实窗口 PNG；人工复核 light/dark × comfortable/compact 1440、两套 compact 760 drawer 与 compact 约 320 CSS px 代表帧，未见主题串色、异常裁切、根级横向溢出或只读/blocked 状态被伪装成可用。
- 仓根 `pnpm run test:gate` 为 `222/222`；`pnpm run gate` 为 `27/27`，对象账 `84/84`、零 skip/failed。BirdView 为 11 modules / 15 relationships / 7 events、零 error/warning；最新 architecture/changes 两视图均无 console error 或横向 overflow，skill unit suite 为 `87/87`。全部改动仍未 stage、commit、push、merge 或发布。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| renderer 写第二份 density spacing 常量 | 否决。会产生两个事实家，token closure 无法拦截漂移。 |
| 用 viewport 自动切 compact | 否决。viewport 是响应式事实，不是用户 requested density。 |
| 为 density 增加 effective/provider observation | 否决。当前没有独立系统 density authority；requested 本身就是可应用事实。 |
| illegal/unknown 直接写 comfortable | 否决。会把视觉 fallback 冒充权威 projection。 |
| density 顺带改变字号、内容宽度或组件结构 | 否决。这些属于完整 RUNTIME-03 或 UI-DECISION-01，需另票。 |
| 复制 Qoder / Sanbao CSS | 否决。外部原型只作只读交互证据。 |
| 同批加入 React、route/provider 或真实业务 mutation | 否决。会混淆可见密度闭环与架构/授权边界。 |

## Consequences

- RUNTIME-03B 本地完成：persisted density 真实驱动 Sage root 与五类 surface geometry，保存失败、unknown 清场、双主题/双宽/reflow 与第二进程 restart 均有行为证据。
- comfortable 保持 Batch 10 基线；compact 提供更密集的桌面工作台，但不改变可见事实、focus 顺序、actionability 或 authority。
- language、font style、content width、terminal theme、file icons、icon appearance 仍只保存未应用；完整 RUNTIME-03 继续 open。
- 本批没有新增业务 ActionIntent、route、provider、Host call、authority、domain persistence、dependency、package 或 lockfile，也没有决定最终 renderer 技术栈。
- 改动已写入 `main` 工作区，但未 stage、未 commit、未 push、未 merge、未发布。
