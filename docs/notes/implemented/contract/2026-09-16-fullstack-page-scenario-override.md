# 2026-09-16 · AI全栈技能页：数据全对、页面全错，因为路由多给了一层视图源

关联：[ADR-0091](../../../adr/ADR-0091.md)（全栈目录的节点轴重建 —— 本次缺陷是在它落地后的运行层验收里发现的）、
[ADR-0044](../../../adr/ADR-0044.md)、[ADR-0085](../../../adr/ADR-0085.md)（归位/接线/前提可分）
同类总账条目：[P-27](../../../pitfalls-playbook.md#p-27--一条路由给出两层视图源页面按顺序静默选中错的那一层)

## Problem

`lute-cordis` → 「三无 · Agent全栈专家」改造完成后，用户重启 DSH Desktop，**AI全栈技能页依旧没有分组**。

三处读数（都来自真实命令，不是推断）：

- **宿主侧完全正确**：`curl http://127.0.0.1:43120/api/dsh-overseas-skills/fullstack-list` → HTTP 200、
  98 万字节、`groups` **14 个**、行 **138 条**、每行 `installed=true`、14 个组各自带头像，
  计数与 P5 预告逐项一致（M00:5 M01:8 M02:10 M03:17 M04:22 M05:10 M06:3 M07:11 M08:5 M09:12 M10:6 M11:4 M12:12 M13:13）。
- **同一条负载里还带了一个 `scenarios`**：`[{h-enable · H 组织与工具 · 70 项}]`。
- **客户端渲染分派 scenarios 优先于 groups**（`lib/client.js`，AI全栈页 `orgMode=false`、`q=""`）：

  ```js
  q !== "" ? 搜索扁平
  : (orgMode && !orgFailed) ? null
  : (visibleScen && visibleScen.length > 0) ? 场景视图   // ← 命中这里
  : (visible ? 分组视图 : null)                          // ← 14 组永不轮到
  ```

把**线上那份**负载（`scenarios=1`）喂进这段分派，得到的就是用户看到的画面：**1 个折叠块
「H 组织与工具 · 70 项」**，14 个分组一个都没渲染。不报错、不留空、不显示「加载中」——
缺陷的表现形式是「少了一半界面」，不是「报错」。

那个幽灵场景从哪来：`handleFullstackList` 原先写的是 `buildScenarios(CATEGORIES, SKILLS_FS)`，
拿**出海**的 8 大场景坐标去套**全栈**的行。两条线的行集互不相交（出海 223 / 全栈 138，**交集 0**），
本不该配出任何东西；能配出 1 个，是生成器 `build_preset_catalog.py` 用 `tax_map.get(名字)`
查海外分类表时**同名撞上**：138 行里 70 行撞出 `h-enable / h2-agent-skill`，另 68 行为 `null`。

**这不是本次改造引入的回归**：取 git HEAD 里的 catalog 重算，`SKILLS_FS` = 70，
`buildScenarios(CATEGORIES, SKILLS_FS)` **同样**产出 1 个非空场景。也就是说这条线自建立起
就一直走场景视图而非分组视图。此前我向用户说过「打开设置仍是旧的 8 组」——那是**推断，
不是观测**，已经作废；正确的说法是「一直是那个 70 项的折叠块」。

## Decision

**改宿主，不改渲染顺序；并且只掐掉错误那层的来源。**

`handleFullstackList` 改为不返回 `scenarios`（`scenarios: []`），与 `/generic-list` 同构。
理由：通用线早就做过同一个决定，并且在线内有明确注释（「给通用技能硬派一个『A 市场与选品』
之类的场景，等于用一个错误的坐标去满足一个不该存在的形状要求」）。全栈线缺的不是结论，
是**把结论落地的那一行**。

判据落在**路由不得提供那一层**，而不是「页面画了几组」：后者要靠读界面，前者一条命令能说「不」。

## Alternatives considered

- **改客户端分支顺序（groups 优先）**：只是把同一个错误搬到另一处——场景视图仍在，
  出海技能页靠它做四层骨架取不到时的退化，全栈页则永远拿不到那层数据。而且改的是渲染分派，
  射程覆盖三条线，风险大于收益。
- **清洗数据：把 138 行的 `scenario/subcategory` 去掉**：治的是根（错误的坐标不该存在），
  但要动 1.1MB 的 `lib/catalog.js` 与生成器，且字段在掐掉来源后已成死数据，
  属于扩大射程的"顺手清理"。不在此次提交里做，登记为残余项。
- **只加判据不改代码**：判据会红，但用户的界面是坏的。不可接受。
- **在页面上加一句"暂不可用"的提示**：那是把可修好的缺陷降级成说明书。

## Consequences

- **验收**：`node --test test/host-routes.spec.mjs` 8/8 绿（新增 2 条）；把那一行改回旧写法做
  **突变自测**，只有「不返回 scenarios」那条当场判红并点名原因，而「14 组各有行」那条**仍绿**——
  这正说明本次缺陷的要害：**数据本来就对，任何只查分组的判据永远抓不到它**。
- **页面会画什么**（把修复后处理器真实吐出的负载喂进同一段分派）：分支 = **分组视图**，
  渲染 **14 个 section**，标题计数与上面那份读数逐项一致。
- **装载点同步是这次真正让改动生效的一步**：`edit` 工具打破了 `file:` 硬链接 inode
  （仓库 `lib/index.js` 18102 字节 / 装载点仍是 16700 字节的旧产物），**重启也不会生效**——
  仓库自带的 `gate:profile-bundle-sync` 当场判红，用
  `node scripts/sync-profile.mjs --apply --loadpoint` 以 tmp+mv 语义补齐后三处 sha 一致。
- **发现一个更早发作的地雷**：pnpm 记录的是
  `dsh-overseas-skills@file:./vendor/packages/capabilities/dsh-overseas-skills → node_modules/dsh-overseas-skills`，
  即 **vendor 副本是安装源**；而它当时停在改动前的快照（catalog 847375 字节 vs 仓库 1135336）。
  任何一次 `pnpm install` 都会把 14 组与本次修复**一起抹回旧值**。已用
  `node scripts/sync-profile.mjs --apply` 同步（`--check` 复检：`ok vendor 副本与仓库源一致（对比 24 个包）`）。
- **残余项（未做）**：① 138 行的 `scenario/subcategory` 仍是撞名留下的海外坐标（死数据，
  无害但误导）；② 本轮同样未能做像素级页面验收（本会话模型不能读图、无截图工具）；
  ③ 宿主模块改动**必须重启进程**才生效，这次验收仍需一次重启。
- **门禁**：`node scripts/gate.mjs --mode quick` → **63/63，exit 0**（含 `skill-lines`：
  `test/*.spec.mjs` 11 个文件 / 74 项全通过）。
