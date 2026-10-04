# UI-IA-01：BusinessMatter 只读工作台与三栏信息架构

- 日期：2026-10-03
- 状态：implemented locally, not committed
- 对应决策：[ADR-0254](../../../adr/ADR-0254.md)
- 范围：UI-IA-01

## Problem

第六批之后，Sage 已有 exact nested `matter` envelope、严格 `SageMatterViewState` 校验与多条已接线操作面，但产品首屏仍默认停在 Overview。真正的当前事项详情位于很长的操作卡片之后，页面没有把“当前事项是主对象”表达为空间结构；Overview 还用固定文案画出一条看似真实的事项脉络。

这会产生三个问题：

1. 用户先看到装饰性总览，而不是当前 `BusinessMatter` 的目标、责任、阶段与阻断事实；
2. `evidenceCount`、`unknownCount`、`dependencyCount`、澄清、决定、尝试、产物与回执虽然已在 ViewState 中，却没有形成同源的可见脉络；
3. 窄宽没有先收右侧脉络的 drawer，当前 900px 断点反而先压缩左栏，中央事项不够稳定。

Sanbao / Qoder 仍只提供交互证据与空间组织参考，不能复制产品壳、接入 runtime，或用固定 trace 把“看起来像在推进”冒充业务事实。

## Decision

### D1 · `BusinessMatter` 成为默认首屏

`经营事项` tab 与 `panel-matter` 改为初始激活，Overview 降为次级视图；脚本的 fallback 与启动视图同步指向 `matter`。左侧导航增加只读的当前事项语境，只显示目标、事项 ID、阶段和 revision，不引入第二份选择或状态 owner。

### D2 · 宽屏形成左语境、中事项、右脉络

保留 Sage 现有 sidebar + main 壳，在 `panel-matter` 顶部建立独立 `#matter-workbench`：

- 左：全局 sidebar 中的当前事项语境；
- 中：目标、事项身份、责任角色、阶段、澄清和只读下一步预览；
- 右：证据 / 未知 / 依赖计数，以及决定、执行尝试、产物、回执和阻断原因。

既有操作型接线原样保留在工作台下方的“已接线操作面”，本批不移动 route、不改 handler、不让新工作台成为并行业务 owner。

### D3 · 脉络只由 exact ViewState 驱动

右栏的计数和四组 rows 只读取已经通过严格 schema 校验的 `SageMatterViewState`。空数组显示明确空态；不得从 artifact、attempt、reply completed 或固定阶段文案合成事项 completed。Overview 的固定 trace 被移除。

`matter=null`、malformed 或读取失败会同步清空 sidebar context、中栏责任 / 计数 / 澄清、四组 trace rows 与 ActionPreview，防止上一轮 live / fixture 数据残留；fixture 来源标识继续可见，production 初始值继续 unavailable-first。

### D4 · composer 只读，drawer 只维护本地 UI 状态

`#matter-readonly-composer` 只包含说明与既有 ActionPreview cards，没有 `form`、`input`、`textarea` 或业务按钮，不新增 `ActionIntent`、POST 或真实 mutation。右栏的打开、关闭、Escape 与焦点返回只是本地 UI 状态，不调用 refresh、provider 或 bridge。

在 900px 以下先把右栏收成 drawer；到 800px 以下才压缩左栏。真实布局、遮挡、滚动与焦点顺序必须继续由构建后的 Electron / 浏览器窗口验收，Fake DOM 只证明语义、清场和键盘合同。

### D5 · framework-free 仅是本批的有界交付选择

本批复用现有 framework-free renderer，以最少改动继承 exact envelope、CSP、清场与门禁；没有 dependency、package 或 lockfile 变更。这不是永久否决 React，也不替代 UI-01 对版本、bundler、测试栈与 package 变更的独立 ADR。进入复杂可组合或可写工作台前，仍须重新完成该技术决策。

## Verification

- 测试先行：旧实现按预期出现 8 个 UI-IA-01 具名失败；实现后 focused suite 为 4 files / 17 tests passed。
- `rtk pnpm --dir apps/sage-shell typecheck` 与 `rtk pnpm --dir apps/sage-shell build` 均通过。
- 第一次 Sage Shell 全量回归出现 20 个失败：17 个来自旧轻量 DOM stub 缺少 `focus` / `createElement`，余下是 deliverable slice 的过期结束锚与仍断言 Overview 默认可见的真实窗口探针。产品侧只增加窄兼容守卫，验证侧改为量新的 Matter 默认面；相关旧桩子集 5 files / 44 tests 与更新后的窗口 / slice 子集 3 files / 11 tests 均通过。
- 最终 `rtk pnpm --dir apps/sage-shell test` 为 179 files、1522 passed、1 个既有 skipped；`rtk pnpm run test:gate` 为 215/215 passed。
- `rtk pnpm run gate` 为 27/27 gate units、84/84 objects、0 skipped、0 failed；ADR / links selftests 为 31/31 passed，`decisions.json` 由生成器得到 254 个 ADR、133 个 decision block 与 121 个历史豁免。
- 真实 production build 的 Electron 探针确认：1440px 下左语境、中事项、右脉络同屏且顺序正确，右栏保持 sticky，composer 的交互控件数为 0；760px 下右栏初始关闭、可作为 drawer 打开、Escape 关闭并把焦点送回触发器，页面无横向溢出；production-null 仍保持 unavailable-first。
- 200% zoom 首次验收发现 `scrollWidth=414`、`clientWidth=380`；修复长 revision 与 card row 的 wrapping 后为 `380/380`，且没有越界节点。1440 fixture 主视图与 760 drawer 截图均已人工回看。
- 本批没有修改 dependency、`package.json` 或 lockfile；改动留在 `main` 工作区，未提交、未推送。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 复制 Qoder / Sanbao 主界面或通过 `file:` / iframe / WebView 接入 | 否决。外部原型只作只读证据，不是 Sage 产品壳或 runtime dependency。 |
| 保留 Overview 默认页，只把现有事项卡换皮 | 否决。主对象仍埋在卡片墙之后，无法建立当前事项优先的 IA。 |
| 用固定五阶段 trace 补足空数组 | 否决。固定进度会把未知、未发生或不同语义包装成事实。 |
| 同批把既有操作面重写进新 composer | 否决。本批只重排 renderer；写路径仍必须由 Application Service / authority 契约独立演进。 |
| 立即引入 React 和新 bundler | 后置。完整工作台仍推荐 Sage-owned component renderer，但版本、bundler、测试栈与依赖变更必须另 ADR 决定。 |
| 只用 Fake DOM 声称响应式视觉已验收 | 否决。Fake DOM 不具备 viewport、computed style、遮挡、滚动或真实焦点能力。 |

## Consequences

- Sage 打开后直接呈现当前 `BusinessMatter`，空间上形成左语境、中事项、右脉络；窄宽优先把右栏收为 drawer。
- 现有 ViewState 的责任、计数、澄清与四类脉络记录第一次进入同源 DOM；null / malformed 清场覆盖新增区域。
- 新工作台没有新增业务写入口；既有已接线操作面仍在其下方，不能把“工作台只读”误写成“整个事项页没有写操作”。
- framework-free renderer 继续承担本批交付，但完整 UI-01、React 技术栈决定、双主题与更大范围视觉迁移仍未完成。
- AUTH-02E、剩余 direct-provider bypass、真实 provider 与生产执行能力不在本批完成声明内。
