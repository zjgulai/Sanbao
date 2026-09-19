# Sanbao 全维度换皮 · 执行计划（视觉语言取自 WorldPilot 素材源仓）

> 决策依据：ADR-0131（收口与射程）、ADR-0132（色彩与排印）、ADR-0133（图形资产）、
> ADR-0134（命名与品牌位）、ADR-0135（门禁改造与执行契约）、**ADR-0136（名字与视觉语言解耦）**。
>
> **产品名 = Sanbao / 三宝。** 拉丁管图形与文件名，中文管描述（ADR-0136 D3）。
> 射程权威表：[`surface-map.md`](./surface-map.md)（20 处落点）。
>
> **本计划只到「怎么落」为止，不含任何代码改动。** 术语见仓库根 `CONTEXT.md`。

## 0. 前置：工作区隔离

决策 2 定的是「规划阶段写主树新增独立路径」。执行阶段需要重估，因为存在两个硬事实：

1. 当前有并发会话在同写这棵树（gate 噪声会互相归因错误）。
2. **worktree 拿不到三样东西**：`vendor/dsh-desktop/`（gitignored 嵌套仓）、
   `packaging/.app-cache/`（真实 bundle 字节，`patch-anchors` 与 `theme-tokens` 门禁要读它）、
   `~/.dsh/skills/lute-brand-icons`（现状头像与 layer-icons 的家）。

| 方案 | 能跑全 gate？ | 能做 S14（bundle 重放）？ | 结论 |
| --- | --- | --- | --- |
| 主树 + 与并发会话约定文件所有权边界 | 是 | 是 | **推荐**：换皮的落点横跨 `packages/`、`scripts/gates/`、`packaging/`、`dsh-patches/`、`shared/`，收窄范围反而更危险 |
| 新开 worktree | 否（缺 `.app-cache` → `patch-anchors`/`theme-tokens` 无法验真） | 否 | 只适合纯 `packages/` 内的切片 |
| worktree + 三处挂载/复制 | 是，但复制 `.app-cache`（数百 MB）与嵌套仓的状态同步成本极高 | 勉强 | 不划算 |

**开工前必须先做的两件事**（任一未做就不要开切片）：

- [ ] 与并发会话对齐：列出它当前在写的文件，与本计划 S1–S6 的落点求交集，交集非空则先排队。
- [ ] 建立**开工前的 gate 基线读数**：`pnpm run gate` 与 `gate:full` 各跑一次并存输出。
      并发会话噪声下，没有基线就无法区分「我改红的」与「别人在制品红的」。

## 1. 切片总览

```text
S0  品牌名源与字标生成器        ← ADR-0136 D2；改名只改这一个源
S1  品牌源与 token 地基          ← 一切的地基；做完全平台变色，logo 未动
S2  logo 与图标资产              ┐ 互不依赖
S3  头像管线                     ┘ 可并行
S4  命名与品牌位文案             ← 依赖 S1 的 token 名
S5  打包链与身份                 ← 依赖 S2 的 squircle + S4 的名字
S6  收口（复述清零 + 判据 + 总账）← 必须在最后；S6 之前不得发版
```

依赖边：`S0 → {S2, S4, S5}`，`S1 → {S2, S3, S4}`，`{S2, S4} → S5`，`S5 → S6`。
**S0 必须最先做**：S2 的字标 SVG、S04–S07 的品牌座、S16–S19 的文件名与清单全部消费它的产物；
先做 S2 就会把 `Sanbao` 硬写进 8 个 SVG 路径，等于把 ADR-0136 白做。

---

## S0 · 品牌名源与字标生成器

**目标**：让「产品叫什么」成为**一个**可改的源，而不是散在 12 个落点上的字面量。

| 步 | 动作 | 落点 |
| --- | --- | --- |
| 0.1 | 新建品牌名源，字段：`nameLatin=Sanbao`、`nameZh=三宝`、`shortName=SB`、`sloganZh=三宝出海，货通四方`、`sloganEn=Sanbao — Your AI Fleet to Global Markets`、`signingIdentity=Sanbao Code Signing`、`bundleDisplayName=Sanbao` | 新文件（唯一源） |
| 0.2 | 写字标转路径生成器：输入名源 + `Inter-SemiBold.ttf` → 输出 `stacked` / `lockup` / `mark 占位` SVG。复用素材源仓配方（`sources/trace.json` 记录了追踪参数，`approved-silhouette.png` 是轮廓中间态） | 新脚本 |
| 0.3 | 字体授权随产物入仓（`Inter-OFL-1.1.txt`，SIL OFL 1.1） | 受管目录 |
| 0.4 | **中性几何占位字母标**：不含 W/P 语义，显式标注为占位（ADR-0136 D5）。**不得**在射程表里记作已完成 | 新资产 |
| 0.5 | 所有派生物（字标 SVG、favicon、app icon 字母、`short_name`、DMG 名、卷名、签名身份、品牌座两行、`<title>`、`CFBundle*`、文档标题）改为**从名源生成**，带 generated-marker | 各落点 |
| 0.6 | 新增门禁：派生物与名源不一致即判红；名源是唯一可编辑面 | `scripts/gates/` |

**验收读数**：改一次 `nameLatin` 重跑生成，`git diff` 必须**只**出现在派生物与字标 SVG，
不得有任何一处名字字面量游离在生成之外——这条 diff 就是「改名 = 改一个源」的可证伪证明。

**为什么排最前**：这是本轮唯一能把「后置的 Sanbao 改名待办」从*重做 40%*降为*改一个源*的动作。
先做 S2 就会把名字钉进矢量路径，ADR-0136 白写。

---

## S1 · 品牌源与 token 地基

**目标**：`--sanbao-*` 成为唯一源，全平台跟皮，`#58B848` 的 10 个源定义家里除派生面外全部消失。

| 步 | 动作 | 落点 |
| --- | --- | --- |
| 1.1 | 新建 `--sanbao-*` 定义文件，逐字抄素材源仓契约：暗 `bg #0b1521`（**注意是 191 行的后覆写值，不是 64 行的 `#0c1e30`**）、`surface #142332`、`surface2 #1b3042`、`ink #eef4fa`、`muted #b0c1d1`、`line #2b4256`、`good #8adac4`、`accent #c4d0dc`、`on-accent #122337`、`radius 8px`；亮 `bg #ffffff`、`surface #f6f8fc`、`surface2 #edf2f8`、`ink #16283c`、`muted #526578`、`line #dce5ee`、`good #176c57`、`accent #3d566e`、`on-accent #ffffff`；材质 `--sanbao-metal-*` 七项双色道；动效 `--sanbao-fast 160ms`/`base 260ms`/`slow 520ms`/`ease cubic-bezier(.22,1,.36,1)` | 新文件；`shared/client/lute-tokens.ts` 的内容迁入并保留 generated 副本机制 |
| 1.2 | `theme-tokens.mjs:57` 的 `NAMESPACE` 扩为 `--(?:dsw\|ds\|dsh\|wp)-`，**与 1.1 同一次提交** | `scripts/gates/theme-tokens.mjs` |
| 1.3 | `theme-tokens.ts` 的别名覆写改指 `--sanbao-accent`：`:237` `--dsw-alias-brand-primary`、`:259-260` `--dsw-alias-state-business-*`、`:301-305` `--dsw-static-deepseek-{500,450,200}` scale | `packages/platform/dsh-theme-local/src/client/theme-tokens.ts` |
| 1.4 | `DEFAULT_THEME_STUDIO_SETTINGS` 12 个值换成素材源仓中性阶；`uiFont` 默认 `system` → `inter` | `src/theme-settings.ts:102-122` |
| 1.5 | 删 `LEGACY_EDITORIAL_SIGNATURE` 的**按十六进制字面量做解码期分支**路径，或改判为按显式签名标记 | `src/theme-settings.ts:126-131,193` |
| 1.6 | 预设墙收敛为 2 条（WorldPilot Dark / Light）；`codex`/`graphite`/`midnight` 移出预设墙但保留可解析；`accent-swatches.ts` 8 组降为 1 组 | `src/client/presets.ts`、`src/client/accent-swatches.ts` |
| 1.7 | 排印原语 `.tiny` / `.eyebrow` 提为共享；标题字距 h1 `-.055em`、h2 `-.045em` | `shared/client/`（走 sync-shared） |
| 1.8 | 改判 `brand-css.test.ts:51-57`：材质渐变合法、带色相 `box-shadow` 仍禁；测试名改判 | 该文件 + 反向自测 |
| 1.9 | 更新被取代文档：`docs/plans/2026-09-19-capability-hub.md` D3 处标注「已被 ADR-0132 D2 取代」 | 该文件 |

**验收读数**：`gate` 全绿（重点看 `theme-tokens`、`theme-tokens-baseline-frozen` 未新增条目）；
`theme-tokens.test.ts`/`accent-swatches.test.ts`/`presets.test.ts` 的 golden 全部重生成并逐条人审；
**实测复核** `sidebar-row-axis` 的列轴与 `TARGET_SIDEBAR_WIDTH=264`（字体改了字宽会变）；
真机亮/暗两色道各截一张全窗口图。

**回滚**：`git revert` 单提交即可——S1 不产出新资产文件。

---

## S2 · logo 与图标资产

| 步 | 动作 | 落点 |
| --- | --- | --- |
| 2.1 | 素材源仓入仓的是**视觉语言资产与可追溯面**（`design/generation-brief.txt`、`avatar-manifest.json`、`trace.json` 配方、字体授权），**不含** `WorldPilot` 字标 SVG 与 `WP` 字母标——那些是供体的名字资产，本产品不用 | 新增受管目录 |
| 2.2 | 新增 `vendor/worldpilot.pin`（记 commit `2e676da87999c88fbc70baae9eb5dbf72c2b757e` 或届时 HEAD）+ 入仓资产逐档 sha256 清单 + 构建时校验 | 新文件 + 校验脚本 |
| 2.3 | 写 squircle 生成器：透明底 `mark` + `#0b1521` 圆角底 → `icon.icns` + `icon-1024.png`；替换 `build-app-icon.sh` 里废弃的 `LUTE_ICON_ENGINE` 分支 | `packaging/scripts/build-app-icon.sh` |
| 2.4 | tray 彩色四档 + 模板两档换成 `mark` PNG 与 `png/black/` 版（模板图必须纯黑带 alpha） | `packaging/assets/brand-icons/` |
| 2.5 | `ICON_PAIRS`（`brand-replay.sh:266-275`）与 `brand-icons` 门禁**同一次提交**改；门禁补 **alpha/形状判据**（ADR-0135 D5）+ 反例自测 | 两处 |
| 2.6 | 启动屏：`brand-payload-wordmark.txt` 换成 **S0 生成的 `stacked` SVG**（字标 `Sanbao` 转路径 + 占位字母标），**删除文本段**；重切 `brand-replay.sh:110-140` 的 `this.wordmark=…("ROOT")` 语义锚。**spin 加载动画保留，仅周期通过 bundle 重放改为 2s**（2026-09-20 用户修订 K1），并加 ADR-0136 D6 的三条断言 | 两处 + 新断言 |
| 2.7 | 侧栏品牌座与 hero 的图形换 `mark`（28×25 `contain` / 34） | `dsh-root-brand-local/src/client/brand.tsx:31-66,87-96` |
| 2.8 | `icns` 哈希回退常量 `2902868…`（`brand-replay.sh:203-225`）必须重算，否则 `--check` 假红/假绿 | 该行 |

**验收读数**：`brand-icons` + `brand-icons-selftest` + `brand-replay-selftest`（R1–R6）全绿；
**新增形状判据的反例测试必须能红**（拿无 alpha 方块图判红）；
Finder/Dock/菜单栏/启动屏四处真机截图；`.icns` 与 `icon-1024.png` 的 `hasAlpha` 实测为 yes。

---

## S3 · 头像管线

| 步 | 动作 | 落点 |
| --- | --- | --- |
| 3.1 | 入仓 50 位（AGT-001…050）× 双色道 × 选定档 webp；`avatar-manifest.json`/`avatar-index.csv`/`workforce.json`/`design/*.prompt.txt` 作为可追溯面入仓（3.9M 文本 + 约 0.8M 图） | 新增受管目录 |
| 3.2 | `generate.mjs` 的 `ICON_MANIFEST` 从 `~/.dsh/skills/lute-brand-icons` 改指受管清单（`:92-100`、`:702-707` 的错误提示同步改） | `scripts/role-presets/generate.mjs` |
| 3.3 | `renderPresetYml()`（`:561-570`）改为输出 `data:image/webp;base64,…` 深色兜底串 | 同文件 |
| 3.4 | `verify-lossless.mjs` L10 改判：inline data URI + **MIME 与字节头一致** + 全员互异 + 与 manifest 同串。**禁止**用 SVG 包位图骗过旧断言 | `:912-945` |
| 3.5 | 自研渲染点改吃资产路径 + 主题/尺寸自适应：`RoleMatrixPanel.tsx:467-468`、`collect.ts:237-247,274,304`、能力中枢、详情面板 | 各包 |
| 3.6 | `role-matrix.module.css:519-530` 的 `object-fit: contain` 改 `cover` + `border-radius: 50%`（素材源仓 README:27 的用法） | 该文件 |
| 3.7 | 重跑 50 岗生成，逐字节确认**内容零扰动**（只 icon 字段变，`name`/`description`/order 不变） | 生成物 |
| 3.8 | 官方卡光晕（S11）随 `--sanbao-metal-*` 改，重切 `client.js.patch:7-8` 与 `verify-patches-v2.sh:105` 锚 | 两处 |

**验收读数**：`verify-lossless` 全 53 层绿且 L10 报「50/50 互异 + MIME 匹配」；
`live-presets` **不需要重采样**（icon 不在其哈希内）——若它红了说明改错了东西；
真机看岗位矩阵在亮/暗两色道下头像底色与界面协调；官方预设卡兜底串在服务未起时仍渲染。

---

## S4 · 命名与品牌位文案

| 步 | 动作 | 落点 |
| --- | --- | --- |
| 4.1 | 侧栏品牌座：`路特创新`→`Sanbao`（拉丁图形位）、`AgenticOS`→`三宝出海，货通四方`（中文描述位）——**值取自 S0 名源，不写字面量** | `brand.tsx:80,81,135` |
| 4.2 | hero：`Artificial Business Intelligence Agentic`→`sloganZh`（取自名源）；**同步改三处复述**（`brand.test.tsx:24`、`hero-fixture.ts:28`、`root-brand-live-anchors.mjs:210`） | 三处 |
| 4.3 | `<title>`、`CFBundleName`/`DisplayName`、4 个 Helper `.app` 名 → `Sanbao`（取自名源） | `brand-replay.sh:44-53,147-155,161-180,190-201` |
| 4.4 | **新增 bundle 重放声明**覆盖 recovery / setup-wizard / desktop-dialog（S14），不改 vendor 源码 | `brand-replay.sh` + 自测 |
| 4.5 | 泄漏清零：`agent-team-gui` i18n `:22,24,85,87` 与 `controller.ts:230,514` → 中文位「请重启三宝」、英文位「Restart Sanbao」 | 该包 |
| 4.6 | 泄漏清零：`favicon.svg` + `manifest.webmanifest`（`name=WorldPilot`/`short_name=WP`/icon 接 app-icons）——现状 `brand-replay.sh` 无任何 favicon 命中，是既有射程缺口 | 新增重放声明 |
| 4.7 | 写 `brand-name-leak` 判据 + 反向自测，扫描面覆盖**插件包**不只 app bundle，空扫描面判红 | `scripts/gates/` |

**验收读数**：`brand-name-leak` 绿且能举反例（把任一处改回 `DeepSeek Harness` 必须判红）；
`patch-anchors`（full 模式）绿；真机走一遍恢复模式与安装向导看到新文案。

---

## S5 · 打包链与身份

| 步 | 动作 | 落点 |
| --- | --- | --- |
| 5.1 | DMG 文件名 `Sanbao-<ver>-mac-arm64.dmg`、卷名 `Sanbao <ver>`（**不得含汉字**，ADR-0136 D3） | `sign-and-dmg.sh:59,62` |
| 5.2 | 安装器 `Sanbao Setup`（含 `CFBundleExecutable`）+ **补一个 squircle 图标**（现状 Setup.app 完全无图标） | `build-setup-app.sh:32-38` |
| 5.3 | `install.sh:417` 收尾文案「重启 DSH Desktop」→「重启三宝」（中文文案位） | `packaging/installer/install.sh` |
| 5.4 | 签名身份 `Sanbao Code Signing`（取自名源）：改 `assemble.sh:355`、`build-setup-app.sh:49`、`ensure-signing-identity.sh:16` 默认值；**裁决旧身份证书是否保留**（决定老 bundle 能否复现构建）并登记 | 三处 |
| 5.5 | 客户文档（**中文描述位用「三宝」**）：`INSTALL-CARD.md:1`、`INSTALL-GUIDE.md` 标题与 §2 入口表；顺手清 `packaging/README.md:1` 的死名 `Magpie-Horch` | 三处 |
| 5.6 | `machine-path-baseline.json`（39 条只减不增）核对：新文档/新脚本不得引入机器路径 | 该文件 |

**验收读数**：`dmg-layout-doc` 绿（R3 未列文件 / R4 幽灵条目 / R5 不可点 / R6 死链 四类都不触发）；
`codesign --verify --deep --strict` 对 Setup.app 与主 app 均绿；`security find-identity` 能列出新身份；
**完整走一次 DMG 构建 + 干净机器安装 + 首启**，给真机三件套读数。

---

## S6 · 收口

| 步 | 动作 |
| --- | --- |
| 6.1 | 33 个文件的复述面清零：6 个生成物走 sync 派生、7 个测试改 import 源、4 个校验器改读源、3 个未跟踪本地文件要么入仓要么删 |
| 6.2 | 写 `brand-token-single-source` 判据 + 反例自测 |
| 6.3 | 写「锚值 == 源值」断言（补丁锚那处消不掉的字面量） |
| 6.4 | 视觉基线从 `.dsh-root-brand-preview/visual-baseline/` 搬进受管目录，基线可从仓库重建 |
| 6.5 | 20 位逐位对照表：每格一张真机截图，行数必须等于 20，少一行即未验收 |
| 6.6 | `docs/pitfalls-playbook.md` 按根因各加一条：主色 10 家、出货图标形状盲区、从未品牌化面（favicon/PWA）、插件包文案不在 brand-replay 射程 |
| 6.7 | 按 ADR-0015 补 Note：`docs/notes/implemented/surface/2026-xx-xx-sanbao-reskin.md`，含 Problem/Decision/Alternatives/Consequences 与真实读数 |
| 6.8 | 全量 `gate:full` + 真机三件套 + 干净机器安装验收 |
| 6.9 | **改名可证伪演练**：把名源 `nameLatin` 临时改成一个假名，重跑生成，确认 `git diff` 只落在派生物上、且新名字在 20 处可见面全部生效；然后改回。这一步是 ADR-0136 D2 的唯一真实验收 |

**验收读数**：`gate:full` 全绿；`exemptions.json` 仍为 `[]`（不得为换皮开任何豁免）；
`theme-tokens-baseline-frozen` 条目数不增；逐位对照表 20/20。

---

## 2. 风险登记（按可能性 × 影响排序）

| # | 风险 | 触发条件 | 缓解 |
| --- | --- | --- | --- |
| R1 | **ΔE 8.7 导致选中态不可辨** | 密集应用里 accent 与 muted 并置 | S1 真机验收必须给可辨性读数；不达标走「材质派生交互态」升级路径，**不得**回退为另留饱和色（ADR-0132 D1） |
| R2 | **改字体把侧栏几何改红** | `inter` 与 `system` 字宽不同 | S1.9 实测复核 `sidebar-row-axis`，不推断 |
| R3 | **并发会话与本切片互相归因错误** | 同写 `packages/`、`scripts/gates/` | 开工前建 gate 基线读数 + 求文件交集（见 §0） |
| R4 | **补丁锚漂移** | S2.6 / S3.8 / S4.3 同时动锚 | 每片单独提交，`patch-anchors` full 模式逐片验 |
| R5 | **中途发版留下半皮** | S6 之前出 DMG | ADR-0135 D6 明令禁止；S6 前不得发版 |
| R6 | **`面向跨境电商与出海品牌` 与客户群不符** | 出货对象非跨境 | 射程表 R3 已登记；售卖口径需另行确认（ADR-0134 D3） |
| R7 | **旧签名身份删除后老 bundle 不可复现** | S5.4 裁决 | 保留旧身份证书直到确认无需复现 |
| R8 | **头像入仓后与素材源仓分叉** | 上游重画头像 | `vendor/worldpilot.pin` + 逐档 sha256 校验，构建时不一致即失败 |

## 3. 后置待办

见 [`surface-map.md`](./surface-map.md) 第六节 T1–T6。其中 **T1 Sanbao 图形字母标设计**
是本轮观感的主要欠账：本轮字标是文字版 + 中性几何占位，不是设计过的字母标。

## 4. 明确不做

- 不改五个功能面板名及其副标题/空态/错误/操作提示（ADR-0134 D1）
- 不改包名、目录名、`luteOrigin`/`luteOwner`/`lutePublish`、`ROOT` 命名族（ADR-0131 D2）
- 不改 bundle 路径、可执行文件名、`appId`、`productName`（ADR-0131 D2）
- 不纳入 `--kg-*` 七色分类板、不做知识图谱 hero（ADR-0132 D6、ADR-0133 D6）
- 不入 AGT-051/052 与 50 个占位岗（ADR-0133 D5）
- 不改 vendor 嵌套仓源码（ADR-0135 D3）
- 不做 profile 层 skin 开关灰度（ADR-0135 D7）
- 不为换皮修改 `exemptions.json` 或 `theme-tokens-baseline.json`（ADR-0014）
- **保留启动加载屏 `spin` 的旋转与进度逻辑**；按 [ADR-0136 D6](../../docs/adr/ADR-0136.md) 2026-09-20 修订，仅通过 bundle 重放把周期改为 2s，弧色继续经 `--dsw-alias-brand-primary` 自动跟皮，不改 vendor 源码
- 不沿用 `WP` 连笔字母标与任何 `WorldPilot` 字标（ADR-0136 D1/D5）
