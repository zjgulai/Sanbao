# 设置导航有 18 项、面板只放得下 15 项：用 ARIA 语义锚注入分组，并把「不连续」做成拒绝条件

- 日期：2026-09-15
- 分类：surface（`dsh-settings-shell-local`）
- 相关：[ADR-0087](../../../adr/ADR-0087.md)、[ADR-0088](../../../adr/ADR-0088.md)、
  [ADR-0080](../../../adr/ADR-0080.md)（本轮两条发现都落在它已经划定的范围里：
  「已证伪的仪器不得再被开成判据」与「『读不到』必须与『没有』分开」）、
  [ADR-0075](../../../adr/ADR-0075.md)（判据的射程与空射程）、
  [ADR-0011](../../../adr/ADR-0011.md)、
  [ADR-0019](../../../adr/ADR-0019.md)、总账 [P-02](../../../pitfalls-playbook.md)、
  [P-04](../../../pitfalls-playbook.md)、[P-07](../../../pitfalls-playbook.md)、
  [P-08](../../../pitfalls-playbook.md)、[P-15](../../../pitfalls-playbook.md)、
  [P-25](../../../pitfalls-playbook.md)、[P-26](../../../pitfalls-playbook.md)

## Problem

用户报了三件事：设置面板窗口不自适应、背景色品牌一致性不高、侧边导航没有分类。
**三条全部先量再判**，其中两条与最初描述不一致：

1. **「不自适应」只对了一半。** 官方 CSS 是
   `width:800px; max-width:calc(100vw - 48px); height:min(800px, 100vh - 48px)` ——
   它**有**小屏保护，缺的是大屏扩张。实测窗口 1580×960、页面缩放 1.2，
   面板渲染 958×903 屏幕px = **798×752 CSS px，仅占窗口 60.6%**。
   三条独立读数互相印证缩放因子（`188×1.2=226`、`800×1.2=960`、`752×1.2=903`）。

2. **「没有分类」不是美观问题，是功能缺陷。** 实测导航 **18 项**。
   每项 40px + 4px 间距，加标题与内边距共需 **852 CSS px**，而面板可用只有 **752**。
   官方 `nav` 没有 `overflow`、`panel` 是 `overflow:hidden`，于是无障碍树读出来是：

   ```
   idx=55 y=943 h=49  Noema 记忆      ← 最后一个完整的
   idx=58 y=996 h=34  我说            ← 被裁 14px
   idx=61 y=1029 h=1  桌面设置        ← 只剩 1px
   idx=62 y=1029 h=1  侧边卡片        ← 只剩 1px
   ```

   面板底边 1030。**两个设置页完全点不到**，且不报任何错。

3. **品牌色在设置页一次都没出现。** 面板背景取 `--dsw-alias-bg-layer-2`，
   当前主题（editorial 预设）下实测 **#342f30**；导航区与内容区背景**完全相同**，
   两者之间无分隔。品牌绿 `#58B848` 只活在侧边栏 wordmark 上。
   另外官方把 `--dsw-alias-brand-primary` 定义成中性近黑 `#0f1115` —— 它不是品牌色。

分组的难处不在样式，在**契约**：`settings.section` 只投影 `id` / `order` / `label`
（`@deepseek-ai/dsh-client-ui-settings` 的 `contract/slots.d.ts`），**没有 group 字段**，
而 shell 自己「零自有文案、纯组合面」。分组在这个契约里不存在。

## Decision

新建 `packages/platform/dsh-settings-shell-local`（platform 组），分两层：

**L1 样式层**（纯 CSS 注入，不依赖任何服务）：

- `nav` 加 `overflow-y:auto` + `overscroll-behavior:contain` + 底部留白 —— 修不可达；
- 面板宽度上限 800→960px、纵向边距 48→32px（保守档，见「备选」）；
- 导航列给 4% 文字色派生背景 + 右侧 1px 分隔，与内容区拉开层次；
- 品牌色**只做点缀**：当前项左侧 3px 指示条 + 键盘焦点环。
  浅色模式用加深变体 `#3d8a33`，深色用原色 `#58B848` ——
  因为原色在白底上只有 **2.51:1**（不达 3:1），在深色面板上才是 5.24:1。

**L2 分组层**（读注册表 + 注入标题）：

- 数据源是 **`ctx.slots.entries("settings.section")`**，其契约明写
  「in registration (list: order) sequence」——顺序即渲染顺序。
  **不猜 DOM 顺序、不匹配本地化文案**；
- 锚点**全部取自官方 DOM 的 ARIA 语义**（见「备选」为何不用类名解析）；
- `groups.ts` 的 `SETTINGS_GROUPS` 是分组这件事**唯一的家**，
  未登记的 section 落「其他」组而不是消失；
- 三条拒绝条件，宁可没有分组也不错着显示：
  ① 注册表条数 ≠ DOM 按钮数 → 不注入；
  ② 某组在渲染顺序里**被别的组打断** → 不注入；
  ③ 期望状态已成立 → **一个字节都不写**（观察器监听整个 `body`，写就自激）。

三态诊断写进 `document.documentElement.dataset.dshSettingsShell`：
`absent`（没打开，正常）/ `grouped:N` / `ungrouped:原因` / `drift:原因`。
「见过面板之后才可能判 drift」是刻意的 —— 页面上随时有别的 modal，
它们没有 `<nav>` 是正常的，一律报漂移会让读数变成噪声（P-02 的教训）。

## Alternatives considered

1. **改官方包 / 替换 shell。** 基座只 pin 不改（ADR-0008），且 shell 占着
   `sidebar.settings` —— 碰它就是碰 shadows-shipped-ui 红线。否决。

2. **用项目既有的包路径锚 + 局部名负向断言**（`dsh-root-brand` 的 `live-selectors.ts`：
   从 `style[data-plugin-css="<包路径>/<模块>.module.css"]` 离线解析类名）。
   **否决，理由是可移植性**：设置 shell 的 DOM 自带完整 ARIA
   （`role=dialog` / `aria-modal` / `aria-current`），而 ARIA 是给无障碍工具用的
   **公开契约**，上游重建不会动它；包路径锚反而多依赖一层「模块文件名」。
   选语义锚还顺带避开了「同一机制写第二份实现」的分叉风险（P-07）——
   本包**不解析任何类名**，`validate-build.mjs` 里有反向自测：
   产物中一旦出现哈希形状的选择器即判红。

3. **按 `button.textContent === label` 认自己的行**（`dsh-better-sidebar` 的现行做法）。
   **否决**：文案一变就静默错位，且两个插件同名时无法区分。它之所以那样写，
   是因为第三方拿不到注册表；本包能拿到 `ctx.slots.entries`，没有这个约束。

4. **纯 CSS 伪元素做分组标题**（`nav button:nth-child(n)::before`）。
   **否决**：`nth-child` 把 18 项的当前顺序钉死，插件一增删就整张错位 ——
   这正是架构红线要拦的「依赖构建期偶然事实」。

5. **分组表按语义最优来划，不做连续性检查。**
   **这是实际踩到的坑**：order 28 上挂了两个 section
   （`generic-skills` 与 `wanzh-hulian`），若把「扩展」组的起点定在 `wanzh-hulian`，
   则 `algo-skills`(29) 会显示在**「扩展」标题之下** ——归属错位，而且看起来完全正常。
   故分组表按「每组在渲染顺序里连续」重划（`wanzh-hulian` 并入「技能与能力」），
   并把连续性做成**判据**而不是纪律。

6. **面板宽度一步放到 1120px+。** 否决：14 个非官方设置页从未为宽屏设计过，
   行长与留白都要逐个验收；本轮选保守档（上限 960px），把它留成后续独立决策。

7. **折叠（disclosure controls）替代滚动。** Apple HIG 对「内容多」的首选是
   分组 + disclosure，但折叠会让每个设置项多一步点击。本轮先做
   「可达 + 分组」，折叠留作 L3。

## Consequences

- **可达性恢复**：18 项全部可达；`nav` 有滚动，窗口再矮也只是滚动而不是静默消失。
- **分组成为登记制**：新装插件不改表也**不会消失**（落「其他」），
  但要让某个 section 进对的组，必须往 `groups.ts` 加一行 —— 这是刻意的：
  归属是产品判断，不该由启发式猜。
- **连续性从纪律变成判据**：将来若有人把某个 section 的 `order` 改到别的组中间，
  分组会**整体拒绝**并在诊断属性里写明 `non-contiguous`，而不是错着显示。
- **L1 在真引擎里被证成（本轮新增，重启前完成）**：jsdom 不做排版，因此
  「`nav` 加 `overflow-y:auto` 到底出不出滚动条」在单测里**原理上问不出来**。
  办法是拿应用包内的官方 client bundle，用正则取出 `SettingsRoot.module.css`
  全文（3019 字节、含哈希类名，不靠手工转录），按官方渲染结构搭出
  `div[role=dialog][aria-modal=true] > nav > div.navTitle + div.navList > button×18`，
  在 Chrome 153 里以 1316×800 CSS px（= 实机 1580×960 @ zoom 1.2）跑 A/B：

  | 读数 | 官方原样 | 加本包 CSS |
  |---|---|---|
  | 面板 | 800×752 | **960×768** |
  | `nav` 的 `overflow-y` | `visible` | **`auto`** |
  | `nav` scrollHeight / clientHeight | 852 / 752 | 866 / 768 |
  | 静止时完整可见的导航项 | **15 / 18** | 16 / 18 |
  | 滚到底后最后一项完整可见 | — | **是** |

  两态下按钮高度恒为 **40px**：`navList` 与 `navCell` 虽是默认
  `flex-shrink:1` 的可收缩 flex 项，但 `min-height:auto` 的内容基准被
  `box-sizing:border-box` + `height:40px` 钉住，**不会靠压扁来「假装放得下」**。
  这正是本轮唯一非真引擎不能回答的问题 —— 若它们会被压缩，`overflow-y:auto`
  将永远不出滚动条，L1 静默失效（而分组会额外加高 14px，雪上加霜）。

  同一页再装入**真实 `lib/client.js`** 驱动，得到
  `dataset.dshSettingsShell = "grouped:5"`；5 个标题
  `通用 / 智能体 / 技能与能力 / 扩展 / 界面与个人` 逐项紧贴本组第一个按钮；
  `style[data-plugin-css="dsh-settings-shell/shell.css"]` 确认注入；
  `aria-current` 未被破坏；dispose 后自有节点归零、18 个按钮完好；零 console 报错。

- **重启是唯一生效路径 —— 三条互相独立的读数**：① 应用包内的
  `dsh-client-hmr@0.1.2-rc.1` 带 2026-09-13 的 production guard，打包态下
  只推进 watch 基线就 `return`；② 渲染进程日志里那条 `/plugins/??…&rev=…`
  列出**全部已装载插件**，其中**没有** `dsh-settings-shell/client.js`；
  ③ 即便强行触发，`clientModules.rebuilt(id)` 对未知 id 直接返回 `undefined` ——
  **新包不可能在不重载 profile 的前提下进入图**（这条比 ADR-0078 记的更硬：
  它对「已存在的包」才谈得上热更）。

- **一个差点写错的判据：核对产物必须认准「应用包内那一份」。**
  本机同时存在两套 harness —— 应用包内 `app.asar.unpacked/node_modules/@deepseek-ai/*`
  （**0.1.2-rc.1**，正是 `vendor/dsh-desktop.pin` 的 `harness-runtime-source` 所指）
  与 `/opt/homebrew/lib/node_modules/@deepseek-ai/dsh`（**0.1.5-rc.2**，另一套）。
  初查读的是后者，一度准备写下「ADR-0078 描述的 production guard 并不存在」——
  而应用包里那份**有**该 guard，ADR-0078 是对的。附带收获：两版的
  dialog/nav 结构逐字相同，说明 ARIA 语义锚能穿过下一次 harness 升级。

- **实况 AX 基线（本轮新增，重启前）**：在**运行中的那个实例**上按下设置页、读无障碍
  几何，拿到重启前唯一的一手读数（窗口 1580×960 屏幕px、页面缩放 1.2）：

  | 读数 | 实况 AX px | 折算 CSS px |
  |---|---|---|
  | 面板 | 960 × 903 | 800 × 752.5 |
  | 导航容器 | 226 × 903 | 188.3 × 752.5 |
  | 导航 18 项，中位高 | 48.7 | 40.6 |
  | `Noema 记忆`（第 15 项） | 49 | 40.8 |
  | `我说`（第 16 项） | 34 | **28.3** |
  | `桌面设置` / `侧边卡片` | 1 / 1 | **0.83 / 0.83** |

  两件事：① 面板／导航容器／按钮高／导航项数四组几何与上一节的 Chrome 仿真
  **逐项吻合到 1px 以内**（800×752.5 对 800×752、752.5 对 752、40.6 对 40）——
  仿真壳的可信度由此从「我说它像」变成「它在四个独立读数上对得上」。
  ② 被裁的不止两项：`我说` 也被压掉 12px，只是没到 1px 那么显眼。

- **单位陷阱：AX 里的 960 不是我的 960。** 面板在 AX 里读作 **960 px**，而那**恰好**
  是本包的目标宽度上限 —— 直接比像素会把「官方原样」与「本包生效」读成同一个数。
  真相是缩放 1.2：官方 800 CSS px × 1.2 = 960 屏幕px，752 × 1.2 = 903。
  两个独立维度给出同一个 1.2。探针因此**不赌 zoom 常量**，而用官方从未改动过的
  常量现场校准：导航按钮恒为 40 CSS px，故 `zoom = 中位按钮高(AX) / 40`（实测 1.2）。

- **一条被基线证伪的判据（本轮最重要的一次自我纠正）。** 我最初把 L1 的验收写成
  「对最后一项执行 `AXScrollToVisible`，成功即可达」。实测：**在未改动的基线上它同样成功**
  —— 末项从 1px 变成 48px。若照此写，重启前后都会绿，这条判据的射程是**零**。
  真相是 `overflow:hidden` 在 CSS 里**仍是滚动容器**，只是**用户滚不动**；
  `AXScrollToVisible` 走的是程序滚，于是它滚的是 **panel**。
  决定性证据是「谁动了」：执行后导航首项 y 204→127，而**右侧内容区同步 214→94** ——
  两者一起位移说明滚的是 panel，不是 nav。

- **「用户滚不动」的直接读数是纹丝不动，但那台仪器本身没射程。** 用真实滚轮事件
  打在导航上（`mac.scroll`，两个方向共三次）得到**零位移**；然而同一手法打在正文区
  （确定可滚）**同样零位移** —— 滚轮事件根本没送达该进程，于是这条读数与
  「导航不可滚」**不可区分**。故它不作为判据（P-02：空射程的仪器必须自己喊出来）。
  L1 的前提仍成立，靠的是上面那条行为读数：用户滚不动 panel（`overflow:hidden`）、
  nav 又无 `overflow` —— 两条合起来才是「点不到」。
  ⚠️ **此处原先还写了一句「基线设置页里 `AXScrollArea` 一个都没有，与本包生效后应当
  出现的滚动区域构成一对可判别的读数」—— 这句已被重启后的实况读数字证伪**：
  「滚动区域」根本不随本包生效而出现（原因见下），它不是一对读数，而是一条**射程为零**
  的判据。整段已删除，并登记进 `scripts/gates/dead-instruments.json`（P-25）。

- **生效路径落成脚本**：`scripts/acceptance/settings-shell-live.mjs`
  （`pnpm run accept:settings-shell`），沿用 `scripts/acceptance/` 既有约定 ——
  仪器自检（harness／TCC／应用在跑／AX 读得到窗口／设置页数得到导航／校准常量未漂）
  任一不成立即 **exit 2 且不产出判决**；**exit 3 = 「实例早于本包，需要重启才能判决」**，
  与 `newapp-systems-live.mjs` 同义。重启前实测 `EXIT=3`，读数
  `滚动区域 无 · 导航独立滚动=false（导轨动了=true 内容区也动了=true）· 面板 800 CSS px`。
  它同时钉死装载点：仓库产物 ↔ profile vendor 副本 ↔ `node_modules` **三处 sha256 一致**
  （`585bbdb2…`），且 `dsh.profile.bundles` 已登记。

- **探针自己的错误报告路径也修过一次（P-04 的教科书形态）。** 本轮末段该 app 的
  Accessibility 子树整体不可用：`mac.ax.dump` 只回 `AXApplication` 一个节点，
  而 CG 层的窗口仍在（`window_id 26825`、1580×960、`alpha 1.0`、`on_screen true`）、
  renderer 进程仍活、无 crash 报告、AppleScript 激活亦无效。
  此时探针报的却是「**harness 未回传报告**」——把「AX 树是空的」**误报成仪器挂了**。
  根因：python 段那几处 `raise SystemExit` 是「提前收工」信号，异常逃出 `try` 之后
  **哨兵行从未打印**，调用方只看得见空 stdout。已加 `except SystemExit: pass` 与
  `except Exception` 兜底、并把 AX 节点数写进报告；同一状态下读数变成
  `仪器自检失败 ax-alive：读不到 AXWindow（AX 树只有 1 个节点；errors=settings-trigger-missing）`
  —— 正确定位到仪器本身，仍是 **exit 2 且不产出判决**。
  教训与 P-04 逐字一致：**错误报告路径自己一炸，反而把真实错误盖住**；
  而这条路径此前从未被跑过（它只在仪器坏掉时才会执行）。
- **该仪器不可用不改变本轮的判决**：AX 读不到窗口时探针不会给出任何结论，
  也不会把 exit 3 或绿色写进报告 —— 「读不出」与「读出来是零」是两个退出码（P-02）。

- **`dsh.client.inject` 的语义是「失败即降级」（读官方装载器得到，非推断）**：
  `dsh-client-modules` 的 `arriveGraphRow` 对 `row.inject` 里**解析不到的包名直接跳过**
  （`if (dependency !== void 0)`），所以它写错不会拖垮启动。正因为它**既不报错也不生效**，
  本包最初那条 `inject: ["@deepseek-ai/dsh-client-ui-slots"]`（连同同名 `peerDependencies`）
  一直没人看出是假的：**产物里一个 `require` 都没有**（`react` 出现 0 次，整包自足），
  而那个包在本机任何地方都解析不到（profile `node_modules` 没有、dsh 安装里也没有）。
  已删除，并在 `validate-build.mjs` 里把「产物里的裸模块 ↔ 清单里的 `inject`/`external`」
  绑成一条**双向判据**：产物里出现了没声明的、或声明了产物里没有的，一律判红——
  不允许「写了但从没跑到」的第三种状态。另：本包的
  `__ModuleLoader__.load({id:"dsh-settings-shell"})` 与 `dsh-ui-polish`／`dsh-root-brand`／
  `dsh-theme` 三个在用插件逐字同形，而宿主 `graphRow(id,…)` 用的就是包名 —— id 约定对得上。

- **清单改动到不了装载点，而发现这件事的是另一台假绿仪器（本轮新增）。** 删掉那条假声明后
  发现它**根本传不进运行时会读到的地方**：`sync-profile.mjs --apply --only-metadata`
  与门禁 `profile-metadata-sync` **都把 vendor 路径写成了扁平的 `vendor/<包名>`**，
  而实际布局是 `vendor/packages/<组>/<包>`。25 个受管包**一个都命中不了**，
  于是 `checkProfileMetadata` 里的 `existsSync` 把每个包都 `continue` 掉——
  门禁**永远绿**，它自己开出的 remediation 同样恒绿，两边都从未比过任何字节
  （P-02 的教科书形态：假绿比红灯贵得多，因为红灯会被处理）。归组重构之后一直是这个状态。
  已修：两处都改用归组的 repo 相对路径，两侧各加一条「**比了 0 个包 ≠ 都一致**」护栏；
  阳性对照（故意拿别的包当源）确认判红，真实读数 **0 → 24 个包**被真的比对。
  实测全量漂移恰好只有本包 1 个，故开启真比较无连带影响。

- **硬链接那一刀切在 vendor 上，装载点不会跟着走。** vendor 副本与
  `node_modules/<包>` 本是同一个 inode（`links=2`）；`applySync` 按红线用 tmp+mv 写 vendor，
  **新 inode 落在 vendor，`node_modules` 那份留在旧 inode**——于是「同步成功」与
  「运行时读得到它」再次分家。本包按同一 tmp+mv 语义单独补写了装载点，最后三处
  （仓库 / vendor / node_modules）`package.json` sha256 一致（`1d048187…`），
  `lib/client.js` 仍是 `585bbdb2…`（本次只动声明、未动产物，构建前后字节相同）。
  另：`loadPointFiles` 原本**刻意把 `package.json` 排除在断言面外**，理由是
  「pnpm 在装载点重写它（剥掉 devDependencies / scripts）」；实测本机 pnpm **并没有**重写
  （装载点那份与仓库逐字节相同，含 `scripts` 与 `devDependencies`），于是「清单漂移」
  在装载点一侧长期无人看守——那条假声明正是这样一路无阻地活在运行时会读到的文件里的。
  已补上：按**装载字段子集**（`main` / `exports` / `dsh`）对账，**不是整文件**——
  整文件比对会在 pnpm 真去剥那两个字段时误红，而这三项是 pnpm 不会动的，
  也正是「应用按什么声明加载这个包」的全部内容（[ADR-0088](../../../adr/ADR-0088.md)）。

- **仍未验证的一点（诚实划界）**：**品牌色在真实实例上的观感**（指示条与焦点环的
  实际对比度、浅色/深色两套变体在真实主题下的表现）没有客观读数，只有几何与
  文本层判据。它需要一个能看图的验收者，本轮不冒充已完成。

- **✅ 重启后的实况判决（本轮补上，P-15 生效路径的最后一段已走通）**：
  `pnpm run accept:settings-shell` **exit 0**，读数：

  | 判据 | 读数 | 判据线 |
  |---|---|---|
  | 分组标题 | **5 / 5**（扩展 技能与能力 智能体 界面与个人 通用） | = 5 |
  | 面板宽 | **960 CSS px** | ≥ 928（官方 800） |
  | 导航项数 | **18** | ≥ 10 |
  | 导航独立滚动 | `导轨动了=true 内容区也动了=false` | 两条都要 |
  | 滚到底末项 | **40.83 CSS px = 中位按钮的 1.02 倍** | ≥ 0.8 倍 |

  即：L1（可达性）与 L2（分组 + 尺寸）**都在运行中的实例上被证成**，
  而不只是「磁盘上的字节对了」。两条路径都跑过：探针自己开→关（`dialogWasOpen=false,
  pressed=true, closed=true`）与复用已开着的设置页（`dialogWasOpen=true, closed=false`，
  不替用户关）。

- **重启后才发现：把上一条「仪器不可用」归因到 Accessibility 是错的（P-04 / P-26）。**
  上一轮记下「该 app 的 Accessibility 子树整体不可用」并据此请用户重启应用 ——
  **重启后同一条读数原样复现**（AX 树仍只有 1 个节点）。真正的因果是**窗口不在前台**，
  与 Accessibility 无关。同一个进程、同一份代码实测两态：

  | 状态 | CG 层 | AX 树 |
  |---|---|---|
  | 窗口在后台 | `on_screen: false` | **1 个节点**（只剩 `AXApplication`，连 `AXWindow` 都没有） |
  | 执行 `set frontmost` 之后 | `on_screen: true` | **1323 个节点**，窗口/导航/几何读数齐全 |

  Chromium 的 Accessibility 子树是**懒建**的，且只对**屏上**的窗口建。探针此前把
  「读不到」直接替读者归因成了「子树没有内容 → 仪器坏了」，于是一个一行
  `set frontmost` 就能自愈的状态，被报成了需要人工重启的设备故障。
  已修：`ensureOnScreen()` 先自愈（拉前台 + 轮询重试 6 次）再判，自愈不成才报错，
  且只报**读数**不断言原因。⚠️ 上一轮那条「`on_screen true` 却读不到 AX」的记录与本次
  受控对照**不一致**；本次对照是同进程前后两态，故以本次为准，但两者为何不同未查清，
  如实留在这里而不是抹掉。

- **判据的射程现在被机制守着（P-25 / P-08）。** 本轮把「AX 里出现滚动区域」这条
  零射程判据从探针里**整段删掉**，而不是留着当读数 —— 留着就还会有人捡回去当判据。
  取而代之的是两条几何读数（导轨独立滚动 + 滚到底末项全高），并新增
  `gate:settings-shell-criteria-selftest`：探针自带 `--self-test`，把 5 个已知状态的
  读数喂进纯函数 `judge()` 逐条断言该红该绿，再对 `l1Ok` / `l2Ok` / `pluginLoaded`
  分别做**恒真桩突变**（突变不红即判失败）。该用例离线可跑，不需要应用在跑。
  两条已被证伪的仪器同时登记进 `scripts/gates/dead-instruments.json`（登记项 2 → 4），
  登记后门禁 `dead-instrument` 实测扫 492 个文件 / 9629 行判据面；
  另补一条 .mjs 侧的用例：`dead-instrument` 的射程不含 `.mjs`，而这两条死仪器都住在
  `.mjs` 里，故由 `gate:settings-shell-criteria-selftest` 断言它们不得被捡回探针代码行。
  顺带修掉「登记簿条数钉死为 2」的断言 —— 往登记簿**加**一条是好事，钉死条数只会训练
  下一个人无脑把数字改大（守住「没被清空」与 id 不重复即可）。
- **品牌色仍是点缀级**：设置页的"品牌感"来自指示条与焦点环，
  不来自大面积底色 —— 这是可读性与第三方页面观感的取舍，不是遗漏。
- 门禁 `catalog-fresh` 因新增受管包而红过一次，已用 `gen-catalog.mjs` 更新
  （25→26 个受管包，platform 组 7→8）；`pnpm run gate` 现 **59/59**（本轮新增
  `settings-shell-criteria-selftest`，其余为登记簿扩容后的既有项）。
