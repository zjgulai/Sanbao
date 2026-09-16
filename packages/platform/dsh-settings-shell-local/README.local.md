# dsh-settings-shell（LUTE 设置页呈现层）

设置页的**呈现层**修复与分组。零改动官方包字节，装载走 profile
`dependencies`(`file:`) + `dsh.profile.bundles` 双条目（与 `dsh-ui-polish` /
`dsh-root-brand` 同一成熟路径）。

## 它修的是什么

三条问题都是**实测**出来的（2026-09-15，DSH Desktop 2.0.5 / runtime 0.1.2-rc.1，
窗口 1580×960、页面缩放 1.2）：

| 问题 | 实测根因 | 本包的做法 |
| --- | --- | --- |
| 导航点不到 | 18 项导航需 852px，面板可用 752px；官方 `nav` 无 `overflow`、`panel` 是 `overflow:hidden` → 最后两项被裁成 **1px 高**，静默不可达 | `nav` 加 `overflow-y:auto`（L1，纯 CSS） |
| 窗口不自适应 | 官方 `width:800px`，`max-width` 只保护小屏、不放大屏（面板仅占窗口 60.6%） | 宽度上限提到 960px；纵向边距 48→32px（保守档，见下） |
| 导航无分类 | `settings.section` 契约只投影 `id`/`order`/`label`，**没有 group**；shell 是单层平铺 | 按 `groups.ts` 的登记表注入分组标题（L2） |

## 分层：L1 不依赖任何服务

- **L1 样式层**（`src/client/shell.css`）：尺寸、滚动、品牌色点缀。
  纯 CSS 注入，`slots` 服务读不到也照样生效。
- **L2 分组层**（`src/client/index.tsx`）：读 `ctx.slots.entries("settings.section")`
  拿**真实注册表**，按登记表注入标题。

L2 的三条纪律：

1. **数量不一致就放弃注入** —— 注册表条数与 DOM 按钮数不等时，宁可不分组，
   也不把标题插到错误的位置。
2. **不连续就拒绝分组** —— 分组标题是「插在某条目之前」的锚点；若某组在渲染
   顺序里被别的组打断，打断点之后的同组成员会显示在**别人的标题**下。
   `planGroups` 自检连续性，不连续时报 `ungrouped:non-contiguous…` 并保持官方原样。
3. **已成立就不写 DOM** —— 观察器监听整个 `body`，写 DOM 会自激；因此同步前
   先比对期望状态，一致就一个字节都不动。

## 锚点：只用官方 DOM 的 ARIA 语义

架构红线第 7 条禁止把 CSS-module 哈希写进产品代码（官方那份是 `MI-_Aa_panel`
这类内容哈希，2.0.4→2.0.5 已经换过一次）。本包**不解析类名**，用的全是
官方渲染代码里就有的公开语义：

| 锚 | 选择器 |
| --- | --- |
| 面板 | `[role="dialog"][aria-modal="true"]`（且直接子元素含 `<nav>`） |
| 导航列 | 面板的直接 `<nav>` 子元素 |
| 导航项 | `nav` 内 `button`；当前项带 `aria-current="true"` |
| 列表容器 | 由按钮**反推**共同父元素（不写 `div:last-child` 这类结构猜法） |

ARIA 是给无障碍工具用的公开契约，上游重建不会动它；这比包路径锚还少依赖一层
「模块文件名」。`scripts/validate-build.mjs` 里有反向自测：产物中一旦出现
哈希形状的选择器即判红。

## 三态诊断

解析结果分三态，**「没量到」与「量到但不对」不混为一谈**：

| 状态 | 含义 |
| --- | --- |
| `absent` | 设置页此刻没开 —— 正常，不报警 |
| `ok` → `grouped:N` / `ungrouped:…` | 解析成功；分组结果与原因 |
| `drift:…` | 面板结构变了（**见过**面板之后才判）—— `console.warn` + 诊断属性 |

读法：`document.documentElement.dataset.dshSettingsShell`。

「见过才判漂移」是刻意的：页面上随时可能有别的 modal（onboarding、确认框），
它们没有 `<nav>` 是正常的，一律报漂移会让读数变成噪声、最终被无视。

## 分组登记表

`src/client/groups.ts` 的 `SETTINGS_GROUPS` 是**本包唯一的事实源**。
未登记的 section 落到「其他」组而**不会消失**：新装插件即使没人更新这张表，
也只是少一个标题，不会错位。

**每组的 id 必须在渲染顺序里连续**（见上文纪律 2）。当前登记（依据实测的
order 序列 `0,1,5,10,15,20,21,25,26,27,28,28,29,40,60,98,100,100`）：

| 组 | 成员 |
| --- | --- |
| 通用 | general · pocket · dsh-theme · models · plugins |
| 智能体 | agent-presets · xmanrui-dsh-im · agent-teams |
| 技能与能力 | overseas-skills · fullstack-skills · generic-skills · wanzh-hulian · algo-skills |
| 扩展 | market · noema-memory |
| 界面与个人 | my-quotes · better-sidebar · desktop |

> order 28 上挂了两个 section（`generic-skills` 与 `wanzh-hulian`），
> 所以「技能」与「扩展」的边界不能画在它们之间 —— 否则 `algo-skills`(29)
> 会落到「扩展」标题下。这正是连续性自检要拦的形状。

## 品牌色：只做点缀

品牌绿 `#58B848` 在原色状态下的对比度：深色面板（实测 `#342f30`）上 5.24:1，
但浅色面板（`#fff`）上只有 2.51:1 —— **不达标**。因此浅色模式用加深变体
`#3d8a33`（白底 4.30:1），深色模式用原色。

用法克制：当前项的**左侧指示条** + 键盘焦点环。不铺大面积底色 ——
那会同时破坏浅色可读性与 14 个第三方设置页的既有观感。

## 与第三方插件共存

`dsh-better-sidebar` 已在做同类注入：它按 `[role="dialog"] nav button` 给自己那
一行打标记。本包只插入 `<div data-dsh-ss-group>` 标题节点，**不碰任何 button**、
不改按钮的 ARIA，因此两者互不干扰。

## 修改同步（生效路径）

见 [P-15](../../../docs/pitfalls-playbook.md)：「写进磁盘」不等于「已经生效」。

```
改源码 → pnpm run build → node scripts/sync-profile.mjs --apply --loadpoint
      → 重启应用 → 看读数
```

**刷新页面不是验收动作**（打包应用里它在原理上就不是）。

**改了 `package.json` 要多一步。** 上面那条 `--loadpoint` 只同步**运行时产物**
（`lib/*.js`、`cordis.patch.yml`），**不含 `package.json`**；而 profile 的
`node_modules/<包>/package.json` 与 `vendor/` 副本本是同一个 inode —— tmp+mv 写 vendor
会把 inode 换掉，装载点那份**留在旧内容**。清单改动（`dsh.client` / `dsh.bundle` /
`exports` / `files`）必须三处都到位：

```
改 package.json
  → node scripts/sync-profile.mjs --apply --only-metadata     # 仓库 → profile/vendor
  → 用同一 tmp+mv 语义补写 <profile>/node_modules/<包>/package.json   # 装载点（应用真正读的那份）
  → 重启应用
```

`--only-metadata` 的 vendor 路径在归组重构后一度写成扁平的 `vendor/<包名>`，25 个受管包
**一个都没比到**、每次恒报 `ok … 对比 0 个包`；2026-09-15 已修，并在 CLI 与门禁两侧
都加了「比了 0 个包 ≠ 都一致」的护栏（[P-02](../../../docs/pitfalls-playbook.md)）。

一条命令给读数（**在仓库根目录**跑，重启前后都可以跑）：

```
pnpm run accept:settings-shell          # 加 --out <dir> 落一份 JSON 报告
```

退出码：`0` 已生效且达标 · `1` 已生效但判据未达标 · `2` 前置/仪器不可用（**不产出判决**）·
**`3` = 实例早于本包，需要重启才能判决**。重启前它会给出基线读数（面板 800 CSS px、
`滚动区域 无`、`导航独立滚动=false`）并退出 3 —— 那是正常读数，不是失败。

判据（**都取自无障碍几何，不依赖肉眼**）：

- **L1**：设置对话框里出现滚动区域（`AXScrollArea`），**且**对末项执行
  `AXScrollToVisible` 后**只有导轨位移、右侧内容区不动**。
  基线里两者会**一起**位移（滚的是 panel 的 `overflow:hidden`，程序滚得动、用户滚不动）。
- **L2**：面板 960 CSS px（官方 800）；左栏出现
  `通用 / 智能体 / 技能与能力 / 扩展 / 界面与个人` 五个分组标题。

**不要用「最后一项底边落在面板内」当判据**：本包生效后导航是**可滚**的，
静止时末项本来就会被裁在滚动区外 —— 那条判据在两态下都会红，射程为零。
（基线 AX 实测：`我说` 28.3 CSS px、`桌面设置`/`侧边卡片` 各 0.83 CSS px。）

## 回滚

- 完全移除：profile `package.json` 删 `dependencies` 与 `bundles` 两条目 →
  `pnpm install --no-frozen-lockfile` → 重启。
- 只回尺寸/滚动：删 `src/client/shell.css` 里对应规则段后重建同步。
- 只回分组：`installSettingsShell` 的 disposer 会移除全部注入节点并清诊断属性；
  也可以把 `SETTINGS_GROUPS` 清空（此时登记表为空 → 全部落「其他」→ 单组 → 不注入）。

## 锚点清单（升级 DSH 后复查）

| 锚点 | 复查方法 |
| --- | --- |
| `[role="dialog"][aria-modal="true"]` + 直接子 `<nav>` | 打开设置页，读 `dataset.dshSettingsShell`；`drift:` 前缀即结构已变 |
| `aria-current="true"` 标当前项 | 同上 |
| `settings.section` 契约仍只投影 `id`/`order`/`label` | 读 `@deepseek-ai/dsh-client-ui-settings` 的 `contract/slots.d.ts` |
| 第三方是否新增导航注入 | 重跑 `groups.ts` 的实测清单核对 |
