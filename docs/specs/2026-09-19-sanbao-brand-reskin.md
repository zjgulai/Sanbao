# Spec · Sanbao 全维度品牌换皮

- 日期：2026-09-19
- 状态：**已规格化，未执行**（本轮零代码改动）
- 决策依据：ADR-0131（收口与射程）、ADR-0132（色彩与排印）、ADR-0133（图形资产）、
  ADR-0134（命名射程判据）、ADR-0135（门禁改造与执行契约）、ADR-0136（名字与视觉语言解耦）、
  ADR-0137（pivot 审计与命名空间改判）
- 射程权威表：[`.scratch/sanbao-reskin/surface-map.md`](../../.scratch/sanbao-reskin/surface-map.md)
- 执行计划：[`.scratch/sanbao-reskin/plan.md`](../../.scratch/sanbao-reskin/plan.md)
- 术语：[`CONTEXT.md`](../../CONTEXT.md)

---

## 1. 问题陈述

出货产品同时挂着**三套半品牌**：对外的 `LUTE Agentic System`、侧栏品牌座上的 `路特创新 / AgenticOS`、
boot 字标语义 `ROOT`，外加**从未被品牌化过的基座残留**——`manifest.webmanifest` 至今写着
`"name": "DeepSeek Harness"` / `"short_name": "DSH"`，`dsh-agent-team-gui-local` 的用户可见文案
至今要求「请重启 DeepSeek Harness」。后者活了这么久，是因为 `brand-replay.sh` 的射程只覆盖
app bundle，改不到插件包。

品牌事实没有单一住处。主色 `#58B848` 实测命中 **33 个文件**：10 个源定义家、6 个生成物副本、
7 个测试复述、4 个校验器、3 个未跟踪本地文件，其中一处（`verify-patches-v2.sh:105`）是**补丁锚文本**，
物理上必须是字面量。这正是总账 P-07 的形状。

更严重的是**出货资产的家不在版本管理里**：`build-app-icon.sh:22` 构建时读
`~/.dsh/skills/lute-brand-icons` 产出 `icon.icns`，而该目录实测 `fatal: not a git repository`，
靠 `catalog.js.bak-pre-…-<时间戳>` 做版本控制。ADR-0022 认证它为「唯一事实之家」，
但复现构建做不到（P-01）。

视觉层面，现存的绿系人格与产品要走的定位不符。素材源仓 `github.com/lillian-maker/WorldPilot`
提供了一份**完整且已被验证过的**品牌契约——色彩阶、钛银材质、排印签名、动效节奏、
以及 102 位与本产品岗位体系**逐条同源**的数字员工形象。经比对：`workforce.json` 的 AGT-001…050
与本仓 `role-catalog.json v2.0` 职责 50/50 命中、花名 50/50 全等、四平面×八责任域结构一致。

所以这不是「抄一个陌生品牌的皮」，而是**把同一产品已经存在的两套表达收口成一套**，
顺带修掉上面三类结构性缺陷。

## 2. 方案概述

产品对外统一为 **Sanbao / 三宝**；WorldPilot 降为**视觉语言供体**（只采纳其色彩、材质、
排印、图像、动效契约，不采纳其字标与字母标）。LUTE 退为内部标识。

改名只发生在**显示面**，不发生在**寻址面**：bundle 路径、可执行文件名、`appId`、包名、目录名、
治理三元组全部不动。

射程是 **20 处出货可见面**，含代码签名身份。换皮**只改表达不改承载**：ADR-0130 的 slot 挂载、
事件通道、面板几何契约与 ADR-0128 D2 零 z-index 在换皮前后必须逐字节同形。

分六个垂直切片推进，不灰度、整体替换。

### 2.1 接缝（本规格的核心结构主张）

**本变更只新增两个接缝，其余全部骑在既有接缝上。** 这是刻意约束——每多一个新接缝，
就多一处将来会腐烂的靶面。

| # | 接缝 | 新/旧 | 位置 | 谁从它派生 | 为什么测试打在这儿 |
| --- | --- | --- | --- | --- | --- |
| S-A | **品牌名源** | 新 | 单一模块，字段 `nameLatin` / `nameZh` / `shortName` / `sloganZh` / `sloganEn` / `signingIdentity` / `bundleDisplayName` | 字标 SVG、favicon、app icon 字母、PWA `short_name`、DMG 名、卷名、签名身份、品牌座两行、`<title>`、`CFBundle*`、客户文档标题 | 改名必须收敛成「改一个源 + 重跑生成」。任何游离在生成之外的名字字面量都是缺陷 |
| S-B | **品牌 token 源 `--sanbao-*`** | 新 | 单一 CSS 变量定义文件 | `--dsw-alias-*` 覆写、`--sanbao-metal-*` 材质、`--sanbao-ux-*` 动效、各包 CSS | 色值唯一可编辑面；`theme-tokens` 门禁的 `NAMESPACE` 扩为含 `sanbao` 后，引用未定义即判红 |
| S-C | **bundle 品牌重放声明表** | 旧 | `dsh-patches/brand-replay.sh`（`ICON_PAIRS` + 显示名文件表 + wordmark 语义锚） | 装机 bundle 的图标、标题、字标、Info.plist、**以及本轮新增的 recovery/wizard/dialog 与 favicon/PWA** | 已有 R1–R6 自测覆盖漂移/写入/字节相等/幂等/尺寸拒写/空目录判缺。S05/06/07/14/19 全走这条，**不新建资产写入通道** |
| S-D | **preset `icon` 字段** | 旧 | `generate.mjs` → `preset.yml: icon` → 官方 loader → `<img src>` | 50 个 preset 的头像 | ADR-0022 已认证的官方契约；官方消费面是 `<img src>`，对 data URI 与 URL 同等对待 |
| S-E | **`verify-lossless` 分层验证** | 旧 | `scripts/role-presets/verify-lossless.mjs`（L0–L10 + M-O） | 53 产物的内容零扰动证明 | 换皮轮**唯一**能证明「只换皮、没换内容」的 oracle |
| S-F | **装机产物字节** | 旧（**最高接缝**） | `/Applications/DSH Desktop.app` ∪ 未打 tag 的 `packaging/staging/*` | `patch-anchors`、`theme-tokens-live`、`root-brand-live-anchors`、视觉基线 | 用户真正得到的东西。内部包名/CSS module 哈希怎么改，它都不动——靶心持久 |
| S-G | **gate 注册表** | 旧（元接缝） | `scripts/gate.mjs` | 所有判据 | 判据本身的家；新增判据必须同处登记 remediation |

理想验收形态：**整份规格只在 S-F（装机产物字节）上验一次**，其余接缝是它的解释链。

## 3. 用户故事

编号连续，每条可独立验证。「验在」列给出该条的判据落点。

### S0 · 品牌名源

| # | 作为…我想要… | 验在 |
| --- | --- | --- |
| US-01 | 作为维护者，我想让产品名只住在一个模块里，改它就能换掉全部对外名字 | S-A + US-02 的 diff 证明 |
| US-02 | 作为维护者，我想有一条可证伪的演练证明「改名只改一个源」：把 `nameLatin` 临时改成假名、重跑生成，`git diff` 必须**只**落在派生物上 | `git diff` 人工审 + 门禁 |
| US-03 | 作为用户，我在字标、图标、文件名上看到 `Sanbao`（拉丁），在描述语、文档标题上看到「三宝」 | S-F 逐位截图 |
| US-04 | 作为运维，DMG 文件名与卷名**不含汉字**（避免编码与机器路径风险） | `dmg-layout-doc` + `machine-path-*` |
| US-05 | 作为用户，启动屏的字标是 `Sanbao` 的矢量路径而非运行时字体渲染（无字体依赖） | `brand-replay-selftest` R3 字节相等 |
| US-06 | 作为法务，`Inter-SemiBold.ttf` 的 SIL OFL 1.1 授权文件随字标产物一起入库 | 文件存在性 + 门禁 |
| US-07 | 作为设计，本轮字母标是**显式标注的中性几何占位**，不含 W/P 语义，且在射程表记为未完成 | 射程表 T1 + 占位文件头注释 |
| US-08 | 作为用户，英文 slogan 在 `short_name`、卷名等长度受限位只降级为 `Sanbao`，不整句塞入 | S-F 截图 |

### S1 · 品牌 token 源与排印

| # | 作为…我想要… | 验在 |
| --- | --- | --- |
| US-09 | 作为用户，深色主题下界面是深海军蓝底（`#0b1521` / `#142332` / `#1b3042`）而非绿灰底 | `theme-tokens-live.mjs` 解析值 |
| US-10 | 作为用户，浅色主题下界面是纯白/冷白阶（`#ffffff` / `#f6f8fc` / `#edf2f8`） | 同上 |
| US-11 | 作为用户，强调色是钛银（暗 `#c4d0dc` / 亮 `#3d566e`），全平台唯一 | S-B + S-F |
| US-12 | 作为无障碍用户，主色对比度不低于供体契约：暗 accent on bg **11.72:1**、亮 **7.62:1**、accent 填充上文字 **10.14:1** | 计算脚本 + 实测复核 |
| US-13 | 作为无障碍用户，亮色主题下**不再存在** 2.33:1 的硬编码回退字面量 | `brand-token-single-source` 门禁 |
| US-14 | 作为用户，语义成功色是 `#8adac4`（暗）/ `#176c57`（亮），与强调色可区分 | S-F |
| US-15 | 作为用户，圆角基线是 8px，动效节奏是 160/260/520ms + `cubic-bezier(.22,1,.36,1)` | S-B 定义 + 各包 CSS |
| US-16 | 作为用户，界面出现钛银材质（`--sanbao-metal-*` 渐变）而非平面色块 | `brand-css.test.ts` 改判后的断言 |
| US-17 | 作为维护者，**装饰性彩色辉光仍被禁止**——材质渐变合法不等于放开所有阴影发光 | `brand-css.test.ts` 反例自测 |
| US-18 | 作为用户，默认 UI 字体是 Inter（基座已内置，无新增字体资产） | `theme-settings.ts` 默认值 + S-F |
| US-19 | 作为用户，元标签（计数、状态码、分类）是 mono 大写紧字距样式，区块引导语带前导短横 | 共享排印原语的单测 |
| US-20 | 作为维护者，`--sanbao-*` 的引用若未定义，`theme-tokens` 门禁立刻判红（不再静默走字面兜底） | 门禁 + 其自测 |
| US-21 | 作为维护者，同一条品牌值在 `--sanbao-*` 与 `--dsw-alias-*` 中**只有一处写字面值** | `brand-token-single-source` |
| US-22 | 作为用户，主题预设墙只剩 WorldPilot 双色道两条；`codex`/`graphite`/`midnight` 不再出现在墙上 | `presets.test.ts` |
| US-23 | 作为老用户，我此前分享/保存的 legacy 主题串**仍可解析**，只是提示迁移，不是 404 | 解析回归测试 |
| US-24 | 作为维护者，改默认字体后侧栏列轴与 264px 宽度目标**经实测复核**而非推断 | `sidebar-row-axis` 门禁读数 |

### S2 · logo 与图标资产

| # | 作为…我想要… | 验在 |
| --- | --- | --- |
| US-25 | 作为用户，启动屏是 `stacked` 形态（图上字下），且**不再有独立的文本字标段** | S-C + `brand-replay-selftest` |
| US-26 | 作为用户，**启动加载的 spin 圆环动画保留**，弧色自动跟随新主色 | ADR-0136 D6 三条断言（`animation-name=spin`、`0.8s`、弧色解析值） |
| US-27 | 作为用户，侧栏品牌座是 28×25 容器内 `contain` 等比居中的 mark + 17px 字标 | S-F 几何读数 |
| US-28 | 作为用户，菜单栏图标在 16/20/24/32 四档清晰，模板图是纯黑带 alpha | `brand-icons` IHDR + alpha 判据 |
| US-29 | 作为用户，Finder/Dock 里的 app 图标是**圆角 squircle + 透明四角**，不是硬边方块 | **新增** alpha/形状判据（旧门禁只校尺寸，会假绿） |
| US-30 | 作为维护者，squircle 由可复现脚本产出，废弃的 `LUTE_ICON_ENGINE` 分支已删除 | 脚本存在 + 构建复跑 |
| US-31 | 作为用户，浏览器 favicon 是产品自己的（随系统明暗变色），不再是基座默认 | S-C 新增重放声明 |
| US-32 | 作为用户，PWA 清单的 `name`/`short_name` 与产品显示名一致 | `brand-name-leak` 门禁 |
| US-33 | 作为维护者，入仓的出货资产逐档有 sha256，且与 `vendor/worldpilot.pin` 记录的 commit 一致；不一致即构建失败 | pin 校验脚本 |
| US-34 | 作为维护者，180M 生产源图与 85M/色道原生 PNG **不在**工作树内 | `git ls-tree` 体积断言 |
| US-35 | 作为维护者，logo 四周留白不小于一个主笔画宽度，缩放不失真、不加边框 | 资产审 + 视觉基线 |

### S3 · 头像管线

| # | 作为…我想要… | 验在 |
| --- | --- | --- |
| US-36 | 作为用户，岗位卡头像是 2.5D 数字员工形象，不再是绿色线稿徽章 | S-F |
| US-37 | 作为用户，在自研面板（岗位矩阵/能力中枢/详情）里切换明暗主题，头像**换色道**且背景协调 | 自研渲染点单测 + 截图 |
| US-38 | 作为用户，在自研面板的详情页看到 128–256 档高清图，列表页看到 32–48 档 | 尺寸选择逻辑单测 |
| US-39 | 作为用户，官方预设卡**离线也能渲染头像**（兜底 data URI，不依赖任何本地服务） | 关停 loopback 服务后实测 |
| US-40 | 作为维护者，官方卡在浅色主题下仍是深色底头像——这条**作为已知残留登记**，不声称已解决 | 射程表 R1 |
| US-41 | 作为维护者，`verify-lossless` L10 断言的是「inline data URI + MIME 与字节头一致 + 全员互异 + 与 manifest 同串」，**不再要求 SVG** | L10 实现 + 反例 |
| US-42 | 作为维护者，**不允许**用 `<svg><image href="data:image/webp;base64,…"/></svg>` 包一层骗过旧断言 | L10 的 MIME 判据 |
| US-43 | 作为维护者，头像资产的家在版本管理内，`~/.dsh/skills/lute-brand-icons` 不再是新增依赖 | `generate.mjs` 引用面 grep |
| US-44 | 作为维护者，本轮只入 AGT-001…050；AGT-051/052 与 50 个占位岗不进产品 | `live-presets` rowCount 不变 |
| US-45 | 作为维护者，换皮后 50 个 preset 的 `name`/`description`/order **逐字节未变**，只有 icon 变 | `verify-lossless` 全层 + diff |
| US-46 | 作为用户，岗位矩阵卡头像按 `border-radius: 50%` 圆形呈现，`object-fit: cover` | CSS 单测 |

### S4 · 命名与品牌位文案

| # | 作为…我想要… | 验在 |
| --- | --- | --- |
| US-47 | 作为用户，侧栏品牌座主行是 `Sanbao`、副行是「三宝出海，货通四方」 | S-A 派生 + S-F |
| US-48 | 作为用户，空会话 hero 是占位标 + 中文 slogan，**不再是那句语法不成立的 `Artificial Business Intelligence Agentic`** | `brand.test.tsx` 改判 + S-F |
| US-49 | 作为维护者，hero 文案的期望值来自名源，不在测试里复述字面量 | ADR-0135 D1 |
| US-50 | 作为用户，窗口标题、Dock 悬停名、应用菜单名统一为 `Sanbao` | S-C + plist 断言 |
| US-51 | 作为用户，恢复模式、安装向导、桌面对话框的文案是 `Sanbao`/「三宝」，且**改动在 git 里可见可回滚** | S-C 新增重放声明 + `brand-replay-selftest` |
| US-52 | 作为用户，「请重启 DeepSeek Harness」这类基座原名**全部清零** | `brand-name-leak` 门禁 |
| US-53 | 作为维护者，`brand-name-leak` 的扫描面**覆盖插件包**，不只 app bundle | 门禁扫描范围断言 |
| US-54 | 作为维护者，上述两条判据在扫描面为空时判红（「没扫到」≠「扫过且合规」） | 门禁自测 |
| US-55 | 作为用户，五个功能面板名（岗位矩阵/扩展中心/新应用/能力中枢/算法技能库）**不变**，肌肉记忆不受扰动 | `locales.ts` diff 为空 |
| US-56 | 作为用户，面板副标题里的「四平面 × 八责任域」等组织学叙述保留 | 同上 |
| US-57 | 作为维护者，改 cordis 行名的成本被规避：本轮**不改** cordis 行 `name`，故 `live-presets` 无需重采样 | `live-presets` 绿且 expected.json 未变 |

### S5 · 打包链与身份

| # | 作为…我想要… | 验在 |
| --- | --- | --- |
| US-58 | 作为用户，下载到的文件是 `Sanbao-<ver>-mac-arm64.dmg`，挂载卷名 `Sanbao <ver>` | `dmg-layout-doc` |
| US-59 | 作为用户，安装器显示为 `Sanbao Setup`，且**它终于有了图标**（现状完全无图标） | `build-setup-app.sh` 产物 + S-F |
| US-60 | 作为用户，安装收尾提示说「重启三宝」而不是「重启 DSH Desktop」 | `install.sh` 文案断言 |
| US-61 | 作为运维，签名身份是 `Sanbao Code Signing`，且 `ensure-signing-identity.sh` 能生成它 | `security find-identity` 实测 |
| US-62 | 作为运维，旧身份证书的保留与否被**显式裁决并登记**（决定老 bundle 能否复现构建） | ADR/Note 记录 |
| US-63 | 作为客户，安装卡与安装手册标题是「三宝…」，且 §2 入口表与卷内实际文件双向一致 | `dmg-layout-doc` R3/R4/R5/R6 |
| US-64 | 作为维护者，`packaging/README.md` 里的死名 `Magpie-Horch` 被清掉 | `brand-name-leak` |
| US-65 | 作为维护者，本轮没有向出货面引入任何新的机器路径 | `machine-path-baseline` 只减不增 |

### S6 · 收口

| # | 作为…我想要… | 验在 |
| --- | --- | --- |
| US-66 | 作为维护者，33 个文件的主色复述面收敛为「1 源 + 生成物 + 补丁锚」三类合法持有者，其余归零 | `brand-token-single-source` |
| US-67 | 作为维护者，补丁锚那处消不掉的字面量被**纳入校验**：锚值 ≠ 源值即判红，且报错点名两处路径 | 新增断言 + 反例 |
| US-68 | 作为维护者，测试与校验器改为 import 源做断言，不再各自复述期望值 | diff 审 + 门禁 |
| US-69 | 作为维护者，视觉基线住在受管目录、**可从仓库重建**（现状未跟踪即不可重建） | 基线重跑一致 |
| US-70 | 作为验收者，我拿到一张 **20 行**的逐位对照表，每行一张真机截图；少一行即判未验收 | 对照表行数断言 |
| US-71 | 作为维护者，`docs/pitfalls-playbook.md` 按根因新增条目：主色 10 家、出货图标形状盲区、从未品牌化面、插件包文案不在 brand-replay 射程 | `pitfalls-playbook` 门禁 |
| US-72 | 作为维护者，本轮有一篇 ADR-0015 合规的 Note，含 Problem/Decision/Alternatives/Consequences 与**真实读数** | `verify-agent-note-format` |
| US-73 | 作为发布者，S6 完成前**不出 DMG**（避免「源已改、复述未清」的中间态出货） | 发布检查清单 |

## 4. 已定决策（防翻案）

完整机读版见各 ADR 的 `## 机器可读决策`；此处只列会被人反复质疑的十条。

1. **单品牌收口**，产品即 Sanbao/三宝；不留底座名与皮名并存的中间态（ADR-0131 D1 / 0136 D1）。
2. **改名只在显示面，不在寻址面**：bundle 路径、可执行文件名、`appId`、包名、目录名、治理三元组不动（ADR-0131 D2）。
3. **签名身份纳入射程**——实测证书本机自签、无 notarization，且 TCC 与数据目录挂在 `appId` 上，故换身份成本是重跑脚本而非客户断链（ADR-0131 D3）。
4. **钛银单主色**，`#58B848` 全面退役；可供性风险 ΔE 8.7 已知并接受，不达标时**升级到材质派生交互态，不回退为另留饱和色**（ADR-0132 D1）。
5. **1 套品牌 × 明暗双色道**，取代 S4 原「15→4」清单（ADR-0132 D2）。
6. **材质渐变合法、彩色辉光仍禁**——原断言的前提「遵循 Codex 视觉基线」已被决策作废（ADR-0132 D3）。
7. **`--sanbao-*` 为源、官方别名为派生、`NAMESPACE` 扩列**；同一值不得两处都写字面量（ADR-0132 D4 / 0137 D1）。
8. **不纳入 `--kg-*` 七色板、不做知识图谱 hero**——7（供体）≠8（产品内 `FLOW-01…08`）≠12（材料仓 `mece_rule`），三套本体互斥（ADR-0132 D6 / 0133 D6）。
9. **头像双轨承载**，不扩官方 loader 补丁白名单透传 `iconLight`；官方卡浅色主题下深色底头像是**主动接受的残留**（ADR-0133 D4）。
10. **不灰度、整体替换**；分期即风险控制；回滚 = 重装上一版 DMG（ADR-0135 D7）。

## 5. 测试决策

### 5.1 打在哪

- **最高接缝优先**：能在 S-F（装机产物字节）上验的，不在包内单测验。理由：包名、CSS module 哈希、
  内部符号在 S-F 之下随便改，S-F 的读数不变——靶心持久。
- **新接缝只两个**（S-A 名源、S-B token 源）。任何「再加一个声明文件」的提议都要先回答：为什么不能并进这两个。
- **复用既有 oracle**：`brand-replay-selftest`（R1–R6）、`brand-icons-selftest`（突变测试）、
  `verify-lossless`（L0–L10 + M-O）、`patch-anchors`、`adr-agent-records-selftest`。
  本轮**新增**判据只有三条：`brand-token-single-source`、`brand-name-leak`、`brand-icons` 的 alpha/形状扩展，
  外加 ADR-0136 D6 的三条动画断言。
- **反向自测是硬要求**：每条新判据必须能举出反例并判红。写不出反例的判据视为恒绿，不予接受。

### 5.2 「完成」长什么样

三层，缺一层就是「未运行」而非「通过」：

1. **门禁**：`pnpm run gate`（提交前）与 `pnpm run gate:full`（推送前）全绿；
   `exemptions.json` 仍为 `[]`，`theme-tokens-baseline.json` 条目数不增。
2. **真机三件套**：启动 attempt=1、看门狗零告警、CPU 归零（沿用 ADR-0130 D5 既有标准）。
3. **视觉**：受管基线可重建 + **20 行逐位对照表**，每行一张真机截图。行数 < 20 即判未验收。

未跑的验收项必须写「未运行」，不得省略（AGENTS.md：不接受口头验收）。

### 5.3 明确不做的测试

- **不做**「拿产品截图像素级 diff 素材源仓官网预览图」。供体是官网不是产品，逐像素对不上是必然，
  只会造出一条恒红、最终被人手动放开的坏判据（ADR-0135 D8）。
- **不做** profile 层 skin 开关的双态测试——那等于重新引入双品牌。

## 6. 明确不做

| 类别 | 内容 | 依据 |
| --- | --- | --- |
| 功能位 | 五个面板名及其副标题、空态、错误、操作提示 | ADR-0134 D1 判据 |
| 内部面 | 包名、目录名、`luteOrigin`/`luteOwner`/`lutePublish`、`ROOT` 命名族（`dsh-root-brand-local`、`RootMark`、`HeroRootBrand`、`.dsh-rb-*`） | ADR-0131 D2、ADR-0012 |
| 不可动锚 | `/Applications/DSH Desktop.app`、`Contents/MacOS/DSH Desktop`、`appId`、`productName` | ADR-0131 D2 |
| 基座 | `--dsw-*` 定义权、`shadows-shipped-ui` slot、KaTeX 字体、**boot 页 `spin` 动画本体** | ADR-0008、ADR-0136 D6 |
| 本体轴 | `--kg-*` 七色板、知识图谱 hero | ADR-0132 D6、ADR-0133 D6 |
| 内容 | AGT-051 BoBo、AGT-052 筑程、AGT-053…102 共 50 个占位岗 | ADR-0133 D5 |
| 承载 | slot 挂载、事件通道、面板几何契约、零 z-index | ADR-0131 D5 |
| 源码 | `vendor/dsh-desktop/` 嵌套仓源码（三处文案走 bundle 重放） | ADR-0135 D3 |
| 灰度 | profile 层 skin 开关 | ADR-0135 D7 |
| 豁免 | 为换皮修改 `exemptions.json` 或 `theme-tokens-baseline.json` | ADR-0014 |
| 名字资产 | `WP` 连笔字母标、任何 `WorldPilot` 字标 | ADR-0136 D5 |

## 7. 补充说明

### 7.1 已知残留（主动接受，非遗漏）

| # | 残留 | 出处 |
| --- | --- | --- |
| R1 | 官方预设卡在浅色主题下仍是深色底头像 | ADR-0133 D4 |
| R2 | 产品内叙述（平面/责任域/岗位）与官网叙述（价值流/场景/经营链）语体落差 | ADR-0134 后果 3 |
| R3 | accent 与 muted 的 ΔE\*ab 仅 8.7 / 8.6 | ADR-0132 后果 1 |
| R4 | 本轮字标是文字版 + 中性几何占位，**不是设计过的字母标** | ADR-0136 D5 |
| R5 | `~/.dsh/skills/lute-brand-icons` 仍被 `layer-icons` 与 overseas-skills 引用 | ADR-0133 后果 6 |

### 7.2 后置待办

T1 Sanbao 图形字母标设计 · T2 退役 `lute-brand-icons` · T3 统一价值流本体（7/8/12 三套互斥）·
T4 AGT-051/052 入岗与 50 个占位配岗 · T5 官方卡浅色主题头像色道 · T6 面板文案改问答式调性。
详见射程表第六节。

### 7.3 开工前置（不可跳过）

1. **并发会话文件交集检查**：本仓当前有其它会话在同写一棵树。本计划落点横跨
   `packages/`、`scripts/gates/`、`packaging/`、`dsh-patches/`、`shared/`，交集非空则先排队。
2. **gate 基线读数**：开工前跑一次 `gate` 与 `gate:full` 并存输出。无基线时无法区分
   「我改红的」与「别人在制品红的」。
3. **worktree 不适用于本计划**：`vendor/dsh-desktop/`、`packaging/.app-cache`、
   `~/.dsh/skills/lute-brand-icons` 均不在版本管理内，worktree 拿不到，
   而 `patch-anchors` / `theme-tokens` 门禁要读真实 bundle 字节。

### 7.4 一个尚未闭合的纪律

ADR-0137 记录的教训：**改一条品牌事实必须同一次提交扫四个传染面**（ADR 正文 /
`## 机器可读决策` 块 / `docs/adr/README.md` 索引行 / 派生的 `decisions.json`），
且**不得以 `adr-agent-records` 绿作为一致性证据**——它只比对「账本 == 源」，
源自身内部矛盾时它照样绿。这条目前仍是纪律，没有门禁；要变成机制需要一条
「正文与机读块关键值不得互矛」的判据，而「关键值」无通用判据，故留作待评估。
