# 换皮射程表 · Sanbao 全维度换皮（视觉语言取自 WorldPilot 素材源仓）

> 本表是 ADR-0131 D3 所指定义的**唯一权威射程清单**。每一格必须写明现状值与目标值，
> 不得只写类别名（ADR-0131 D3 约束）。判据列写「谁拦它」——新增一格必须同时给出它的判据，
> 否则等于没纳入射程。
>
> 依据的决策：ADR-0131（收口与射程）、ADR-0132（色彩与排印）、ADR-0133（图形资产）、
> ADR-0134（命名与品牌位文案）、ADR-0135（门禁改造与执行契约）、**ADR-0136（名字与视觉语言解耦）**。
>
> **产品名 = Sanbao / 三宝**（ADR-0136 D1）。WorldPilot 只是视觉语言供体，不得在任何出货可见面上
> 当产品名使用。字顺分工见 ADR-0136 D3：**拉丁 `Sanbao` 管图形与文件名，中文「三宝」管描述**。
>
> 术语见仓库根 `CONTEXT.md`。

## 读数更正记录

初版把出货可见面记为 **16 处**，那是把「tray 彩色档」与「tray 模板档」、把「安装器 app」与
「install.sh 文案」各自合并后的结果。逐落点枚举后真实值为 **20 处**。ADR-0131 D3 已同步改判。
本表以 20 为准。

## 一、射程内：20 处出货可见面

| # | 落点 | 现状值 | 目标值 | 改在哪 | 谁拦它 |
| --- | --- | --- | --- | --- | --- |
| S01 | Finder 图标 `Contents/Resources/icon.icns` | R∞T 绿系 squircle（`packaging/assets/app-icon.icns`，sha1 `2902868…`） | **重画**深底 `#0b1521` + **中性几何占位标**的 squircle（字母标另立一轮，ADR-0136 D5） | `packaging/scripts/build-app-icon.sh`（新增可复现生成器，替换废弃的 `LUTE_ICON_ENGINE` 分支）→ `packaging/assemble.sh:188-193` | `brand-icons`（新增 alpha/形状判据）、`brand-replay-selftest` R3 |
| S02 | Dock 图标 `app/build/app-icon-mac.png`、`app-icon.png` | `brand-icons/icon-1024.png` 1024×1024 | WP mark squircle 1024 | `packaging/assets/brand-icons/` + `dsh-patches/brand-replay.sh:266-275` `ICON_PAIRS` | `brand-icons`（IHDR 逐档比对，双向） |
| S03 | 菜单栏彩色图标 `tray-icon-blue{,@1.25x,@1.5x,@2x}.png` | `tray-colored-{16,20,24,32}.png` | WP `mark` PNG 各档（钛银/深钢蓝按色道） | 同上 | `brand-icons` |
| S04 | 菜单栏模板图标 `tray-iconTemplate{,@2x}.png` | `tray-template-{16,32}.png` | `png/black/` 版 mark（模板图必须纯黑带 alpha） | 同上 | `brand-icons` |
| S05 | 启动屏字标（hashed web chunk） | R∞T SVG + 文本 `"ROOT"` 两段 | 只留 `stacked` SVG（字标由**品牌名源**生成，Inter SemiBold 排 `Sanbao` 转路径），**删除文本段**；**spin 加载动画必须保留**（见第五节） | `dsh-patches/brand-payload-wordmark.txt` + `brand-replay.sh:110-140` 语义锚 | `patch-anchors`、`brand-replay-selftest` R1/R2/R4 |
| S06 | 窗口/标签标题 `<title>` | `LUTE Agentic System`（原 `DeepSeek Harness`） | `Sanbao` | `brand-replay.sh:147-155` | `patch-anchors` |
| S07 | `CFBundleName` / `CFBundleDisplayName` + 4 个 Electron Helper `.app` 名 | `LUTE Agentic System` | `Sanbao`（拉丁，ADR-0136 D3） | `brand-replay.sh:161-180,190-201`（9 个显示名文件清单在 `:44-53`） | `brand-replay-selftest`、`resource-path-reachability` |
| S08 | 侧栏品牌座 主行 + badge | `路特创新` + `AgenticOS` | `Sanbao`（拉丁，图形位）+ `三宝出海，货通四方`（中文，描述位） | `packages/platform/dsh-root-brand-local/src/client/brand.tsx:80,81,135` | `brand.test.tsx:17-18`（须改判目标串） |
| S09 | 空会话 hero mark + 叙述句 | mark 34 + `Artificial Business Intelligence Agentic` | 占位标 34 + `sloganZh`（ADR-0136 D4 取代原「AI Native 经营决策与运营执行平台」） | `brand.tsx:87-96` | `brand.test.tsx:24`、`test/helpers/hero-fixture.ts:28`、`scripts/acceptance/root-brand-live-anchors.mjs:210` |
| S10 | preset 卡头像（50 岗 `preset.yml` 的 `icon`） | 绿色描边 SVG 线稿 data URI（家：`~/.dsh/skills/lute-brand-icons`，**不在版本管理**） | 深色道 webp **兜底 data URI**；自研面改吃资产路径（双色道 × 7 档） | `scripts/role-presets/generate.mjs:561-570,1202-1233` + 新增 `brand/avatars/` 受管目录 + `vendor/worldpilot.pin` | `verify-lossless.mjs` L10（**须改判 MIME 面**）、`live-presets`（icon 不在其哈希内） |
| S11 | preset 卡光晕 | `radial-gradient(120% 90% at 12% 0%,color-mix(in srgb,#58B848 8%…` | 钛银材质版（`--metal-*` 派生，**不得留彩色辉光**） | `packaging/patches/nm/@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js.patch:7-8` + `packaging/verify-patches-v2.sh:105` | `patch-anchors`（锚文本必须与源值一致，见 ADR-0135 D2） |
| S12 | 平台色彩系统 | 暗 `#58B848` / 亮 `#347A2F`，15 预设 × 8 色卡 | `--sanbao-*` 单一源 + `--dsw-alias-*` 派生；**1 套品牌 × 明暗双色道**，codex/graphite/midnight 降 legacy | `packages/platform/dsh-theme-local/src/{client/theme-tokens.ts,client/accent-swatches.ts,client/presets.ts,theme-settings.ts}` + `shared/client/lute-tokens.ts`→`--sanbao-*` | `theme-tokens`（`NAMESPACE` 扩含 `sanbao`）、`theme-tokens-baseline-frozen`（只减不增）、`presets.test.ts`、`accent-swatches.test.ts`、`theme-tokens.test.ts` |
| S13 | 自研面板图标层 | 12 个平面/域 `layer-icons`（绿系 7 色）+ overseas-skills 4 份图标 json（约 1.4MB base64 SVG）+ `systems.json` 31 个业务系统 glyph | 描边色改钛银；`layer-icons` 两包**字节相同**不变量保留 | `packages/surfaces/dsh-algo-skills-local/src/layer-icons.ts` + `packages/capabilities/dsh-overseas-skills/lib/layer-icons.js` + 各自 `scripts/gen-layer-icons.mjs` | `layer-icons.spec.ts:41,61`、`verify-layer-icons.mjs:91`、`dsh-overseas-skills/test/layer-icons.spec.mjs:19,46` |
| S14 | 原生 recovery / setup-wizard / desktop-dialog 文案 | `LUTE Agentic System`（vendor 源码内，zh `recovery-copy.ts:294-420` + en `:151-277`） | `WorldPilot` | **不改 vendor 源码**，走 bundle 重放（ADR-0135 D3）：在 `brand-replay.sh` 新增这三份 HTML/JS 的替换声明 | `brand-replay-selftest`、`resource-path-reachability` |
| S15 | 安装器 `LUTE Setup.app` + `install.sh` 收尾文案 | `CFBundleName/DisplayName/Executable = LUTE Setup`，**且当前无图标**；`install.sh:417` 写「重启 DSH Desktop」 | `WorldPilot Setup` + 补一个 squircle 图标 + 文案改 `WorldPilot` | `packaging/scripts/build-setup-app.sh:32-38`、`packaging/installer/install.sh:417`、`packaging/installer/LUTE-Setup.swift`（文件名属内部面可留） | `dmg-layout-doc`、`sign-and-dmg.sh:163` 的 `codesign --verify` |
| S16 | DMG 文件名 + 卷名 | `DSH-Desktop-LUTE-<ver>-mac-arm64.dmg`；卷 `DSH Desktop LUTE <ver>` | `Sanbao-<ver>-mac-arm64.dmg`；卷 `Sanbao <ver>`（**文件名与卷名不得含汉字**，ADR-0136 D3） | `packaging/sign-and-dmg.sh:59,62` | `dmg-layout-doc`（R3 未列文件 / R4 幽灵条目 / R5 不可点 / R6 死链） |
| S17 | 代码签名身份 | `LUTE Code Signing`（本机自签，指纹 `BA3372A3…`，无 Developer ID / notarization） | `Sanbao Code Signing` | `packaging/assemble.sh:355`、`packaging/scripts/build-setup-app.sh:49`、`packaging/scripts/ensure-signing-identity.sh:16` | `assemble.sh:356` 与 `build-setup-app.sh:50` 的 `security find-identity` 前置断言 |
| S18 | 客户文档（**中文描述位**，用「三宝」） | `INSTALL-CARD.md:1` `# LUTE Agentic System 安装卡（客户版）`；`INSTALL-GUIDE.md` 标题与 §2 入口表；`packaging/README.md:1` 仍含死名 `Magpie-Horch` | `WorldPilot …`；入口表随 S16 同步 | `packaging/INSTALL-CARD.md`、`packaging/INSTALL-GUIDE.md`（`assemble.sh:496` 注入 `{{VERSION}}`） | `dmg-layout-doc`、`pitfalls-playbook` |
| S19 | favicon + PWA 清单（**从未品牌化**） | `.dsh-types/dsh-web-frontend/dist/favicon.svg` 官方图；`manifest.webmanifest` 仍写 `"name": "DeepSeek Harness"`、`"short_name": "DSH"`、icon `/favicon.svg` | `worldpilot-favicon.svg`（自带明暗变色）；`name=Sanbao`、`short_name=SB`、icon 接 app-icons | 新增 bundle 重放声明（现状 `brand-replay.sh` 无任何 favicon 命中，是既有射程缺口） | ADR-0135 D4 新增的泄漏判据 |
| S20 | 插件包内基座原名泄漏（中文位用「三宝」、英文位用 `Sanbao`） | `packages/surfaces/dsh-agent-team-gui-local/src/client/i18n.ts:22,24,85,87` 与 `controller.ts:230,514`：「请重启 **DeepSeek Harness**」/「Restart **DeepSeek Harness**」 | 「请重启三宝」/「Restart Sanbao」 | 该包 `src/client/{i18n.ts,controller.ts}` | ADR-0135 D4 新增的泄漏判据（`brand-replay` 只覆盖 app bundle，覆盖不到这里） |

## 二、显式射程外（不改，且必须说明为什么不改）

| 类别 | 内容 | 不改的理由 |
| --- | --- | --- |
| **功能位** | 五个面板名（岗位矩阵 / 扩展中心 / 新应用 / 能力中枢 / 算法技能库）及其副标题、空态、错误、操作提示 | ADR-0134 D1 判据：承担「让用户找到功能」的名字不是品牌表达。且素材源仓的业务学轴（7 价值流）已被 ADR-0132 D6、ADR-0133 D6 否掉 |
| **内部面** | npm 包名、目录名、`luteOrigin`/`luteOwner`/`lutePublish`、`ROOT` 命名族（`dsh-root-brand-local`、`RootMark`、`HeroRootBrand`、`.dsh-rb-*`）、`--lute-*` 之外的代码符号 | ADR-0131 D2、ADR-0012 |
| **不可动锚** | `/Applications/DSH Desktop.app` 路径、`Contents/MacOS/DSH Desktop`、`appId ai.deepseek.dsh.desktop`、`productName "DSH Desktop"` | ADR-0131 D2：TCC 授权与数据目录挂在 `appId` 与路径上 |
| **基座资产** | `--dsw-*` 的定义权（属官方主题包）、`shadows-shipped-ui` slot、KaTeX 字体、官方未替换的 `app-icon.ico` | ADR-0008 基座只 pin 不改、架构红线 §2 |
| **本体轴** | `--kg-*` 七色分类板、知识图谱 hero | ADR-0132 D6 / ADR-0133 D6：7（素材源仓）≠ 8（产品内 `FLOW-01…08`）≠ 12（材料仓 `mece_rule`） |
| **内容** | AGT-051 BoBo、AGT-052 筑程、AGT-053…102 共 50 个「待分配岗位」占位 | ADR-0133 D5：换皮轮内容面冻结 |

## 三、已知残留（主动接受，不是遗漏）

| # | 残留 | 为什么接受 |
| --- | --- | --- |
| R1 | 官方预设卡在**浅色主题**下仍显示**深色底**头像 | ADR-0133 D4：解锁双色道需扩官方 loader 补丁白名单透传 `iconLight`，那是本仓最脆的锚面（ADR-0019 的存在理由）。自研面（岗位矩阵/能力中枢/详情）已双色道 |
| R2 | 产品内叙述（平面/责任域/岗位）与官网叙述（价值流/场景/经营链）存在语体落差 | ADR-0134 后果 3：须待内容轮统一本体口径后才能消掉 |
| ~~R3~~ | ~~定位断言风险~~ **已由 ADR-0136 D4 消解** | slogan 换成愿景式口号「三宝出海，货通四方」，不再是「面向 X 客户群」的可证伪断言 |
| R4 | accent 与 muted 的 ΔE\*ab 仅 8.7（暗）/ 8.6（亮） | ADR-0132 后果 1：真机验收必须给可辨性读数；不达标走「材质派生交互态」升级路径，**不得**回退为另留饱和色 |
| R5 | `~/.dsh/skills/lute-brand-icons` 仍被 `layer-icons` 与 overseas-skills 引用 | ADR-0133 后果 6：退役它需单独一轮，本轮只停止新增依赖 |

## 四、判据改造清单（与射程表配套，缺一条就有静默出货面）

| 判据 | 现状 | 改造 | 归属切片 |
| --- | --- | --- | --- |
| `brand-icons` | 只校 IHDR 像素尺寸 vs `ICON_PAIRS` 声明，双向 | **新增 alpha/形状判据**——否则 S01 的硬边方块会静默出货 | S2 |
| `theme-tokens` | `NAMESPACE='--(?:dsw\|ds\|dsh)-'` | 扩为含 `sanbao`，**同一次提交**建 `--sanbao-*` 定义之家 | S1 |
| `theme-tokens-baseline-frozen` | 6 条只减不增 | 不得新增；存量违规必须在换皮提交内清零 | S1/S6 |
| `exemptions-frozen` | `[]` 空 | 无豁免余量，本方案不为其开口 | — |
| `patch-anchors` | 锚文本含 `#58B848` | 重切 S05/S11 锚 + **新增「锚值 == 源值」断言** | S2/S3/S6 |
| `verify-lossless` L10 | 要求 inline **SVG** data URI | 改判为「inline data URI + MIME 与字节头一致 + 全员互异 + 与 manifest 同串」；**禁止**用 SVG 包位图骗过 | S3 |
| `dmg-layout-doc` | 校 `INSTALL-GUIDE.md` §2 表 vs 卷内容 | 随 S16/S18 同步；无新判据 | S5 |
| `live-presets` | 哈希 cordis 行 `stableId\0name\0kind` | 本方案不改 cordis 行名，**不需要重采样**（S10 改 icon 也不在其哈希内） | — |
| `sidebar-row-axis` | fixture 断言 `--lute-brand` 不出现在轴规则体内 | 改默认字体会改字宽，须实测复核 `TARGET_SIDEBAR_WIDTH=264` | S1 |
| **新增** `brand-token-single-source` | 无 | 扫「出货可见面含退役主色字面量」，扫描面为空判红 | S6 |
| **新增** `brand-name-leak` | 无 | 扫「出货可见面含基座原名/退役名」，扫描面为空判红（ADR-0131 D4、ADR-0135 D4） | S4/S6 |
| `pitfalls-playbook` | 由门禁守着 | 收口后按根因各加一条（S12 多之家、S01 形状盲区、S19 从未品牌化面） | S6 |

## 五、必须保留项（不是射程，是护栏）

| # | 项 | 实体位置 | 为什么它能自动存活 | 新增护栏 |
| --- | --- | --- | --- | --- |
| K1 | **启动加载屏动画** | 基座原始 `.spinner` 为 20×20 圆环，spin 0.8s；2026-09-20 用户授权本仓仅经 bundle 重放改周期 | 保留 keyframes、进度弧与 `--dsw-alias-brand-primary` 主题引用，不改 vendor 源码 | [ADR-0136 D6](../../docs/adr/ADR-0136.md)：spin（含 CSS Modules 派生名）、`animation-duration=2s`、conic 弧色解析值等于品牌源 accent |
| K2 | 品牌样式表的运动抑制不得扩为全局 | `packages/platform/dsh-root-brand-local/src/client/brand.tsx:180-186` | 实测其作用域是 `[data-plugin="dsh-root-brand"] *`、只压 `transition` 不压 `animation`、且仅在 `prefers-reduced-motion` 下生效——**碰不到 boot spinner** | 同 K1 断言；若有人把选择器放宽，K1 的 `animation-name` 读数会变 |
| K3 | 承载层几何与 slot 契约 | `sidebar-row-axis`、ADR-0130 的 `main`/`sidebar.panellist` 挂载、ADR-0128 D2 零 z-index | 换皮只改表达不改承载（ADR-0131 D5） | 换皮前后逐字节同形；改默认字体会改字宽，须实测复核 `TARGET_SIDEBAR_WIDTH=264`（ADR-0132 后果 4） |

## 六、后置待办（本轮明确不做，但不得静默遗忘）

| # | 待办 | 为什么后置 | 触发条件 |
| --- | --- | --- | --- |
| T1 | **Sanbao 图形字母标设计**（替代 `WP` 连笔标） | 素材源仓没有任何 Sanbao 图形资产；本轮字标用 Inter SemiBold 排 `Sanbao` 转路径，字母标位用中性几何占位（ADR-0136 D5） | 字母标定稿后重跑品牌名源的生成，替换 S01–S05 的占位 |
| T2 | `~/.dsh/skills/lute-brand-icons` 退役 | 它仍被 `layer-icons` 与 overseas-skills 引用（ADR-0133 残留 R5）；本轮只停止新增依赖 | 头像与 layer-icons 全部改指受管源之后 |
| T3 | 价值流本体口径统一（7 / 8 / 12 三套互斥） | ADR-0132 D6、ADR-0133 D6 的根因；不解决就无法纳入 `--kg-*` 分类板与知识图谱 | 材料仓 `mece_rule` 与产品内 `FLOW-01…08` 对齐后 |
| T4 | AGT-051 BoBo / AGT-052 筑程 入岗；AGT-053…102 的 50 个占位配岗 | ADR-0133 D5 内容面冻结 | 内容轮 |
| T5 | 官方预设卡浅色主题下的深色底头像 | ADR-0133 D4 主动接受的残留（需扩官方 loader 补丁白名单） | 官方补丁面风险被重新评估后 |
| T6 | 功能面板副标题/空态改用问答式调性 | ADR-0134 备选方案第 2 条：文案位数量大且逐条需人审，收益是审美一致性而非正确性 | 独立一轮 |
