# 决策记录：技能中心迁 `main` keyed slot——LUTE 面改乘官方承载的第一例

- 日期：2026-09-19
- 状态：implemented（仓库侧 + 装载点已同步 + 实机浏览器验收完成，读数见下）
- 对应 ADR：[ADR-0130](../../../adr/ADR-0130.md)（D1–D5）、[ADR-0128](../../../adr/ADR-0128.md)（D2 零 z-index）、[ADR-0125](../../../adr/ADR-0125.md)（行轴 / 折叠组）
- 涉及包：`packages/surfaces/dsh-skill-center-local`（承载方式整体替换）、`scripts/gates/sidebar-row-axis{,.test}.mjs`（清单摘行 + 自测同形）
- 归属计划：[docs/plans/2026-09-19-capability-hub.md](../../../plans/2026-09-19-capability-hub.md) S3.1
- 取证附件：[research/14 · main keyed slot spike](../../../research/14-main-keyed-slot-spike.md)

## Problem

「为什么现在动承载方式」的完整论证在 [ADR-0130 背景](../../../adr/ADR-0130.md)：DOM 注入
行 + 自管浮层这套自造承载，代价已经全部落过账（P-07 行轴漂移、注入顺序由落位竞态决定、
P-52 黑屏事故的根因就在注入/自愈这条路径上、层号魔数 2147482000），而基座本来就提供了
官方座位。

本 Note 只记**这一例怎么落的地**，以及落地时撞到的、spike 没预料到的两件事：

1. **spike 只验了「挂得上」，没验「退出路径有几条」。** 技能中心的面板里散落着多个
   「回到会话」的动作，它们原先都靠广播 `dsh:view-change`(chat) 让抽屉自己藏起来；注入
   形态一退役，那个听者就没了。迁移当天实测到的缺陷是卡片「执行」按钮：提示词交付了、
   面板却还盖在中心列上，用户看不到会话。这类路径不可能靠读代码数清（它们在 5 个组件
   层之下、以事件广播的形式存在），只能靠实机点一遍。
2. **门禁的反向自测与被测清单是两份事实。** 从 `sidebar-row-axis` 的 REGISTRY 摘掉技能
   中心之后，判红的是它的**自测**而不是判据本身：fixture 树里仍然造着那一行，于是被
   判成「未登记的注入行」，红字指向一个已经不存在的东西。清单与 fixture 必须同一次改。

## Decision

按 [ADR-0130](../../../adr/ADR-0130.md) D1–D3 执行，技能中心作为模式验证（D5）：

- **新增** `src/client/panel-slot.tsx`：两个只吃 inject face 与官方 owner props 的组件
  （`ExtensionsPanel` = 中心列整页；`ExtensionsPanelIcon` = 图标位 + 计数徽标）。
- **改写** `src/client/index.ts`：`PANEL_KEY = 'extensions'`，`main` keyed 注册 +
  `sidebar.panellist` 行注册（id 同 key、`order: 40`、label 为函数）；`onExit` =
  `layout.selectPanel(null)`，`layout` 缺席时回退 `dsh:view-change`(chat) 并出声；
  `ctx.slots.inject` 不可用时**显式 warn 后返回**（不静默缺席）。
- **改名** `.overlay`/`.drawer` → `.panelPage`，删除入场动画 keyframes、删除自管层号变量
  `--dsh-skill-center-overlay-layer`、删除「关闭」按钮（面板没有关闭语义，只有离开）。
- **删除** `panel-mount.tsx`、`sidebar-entry.ts`、`sidebar-entry-core.ts`（同步副本）、
  `tests/sidebar-entry-layout.spec.ts`，以及 CSS 里整套注入行规则（`.entry` /
  `.entryIcon` / `.entryLabel` 与它们的收起 rail 变体）；只留 `.entryBadge`（徽标是官方
  行里唯一自绘的元素）与它自己的收起 rail 让位规则。
- **修** 卡片「执行」的退出路径：`executeSkillPrompt` 改走 `onExit`（D3），并把剪贴板
  写入的拒绝从静默改成 `console.warn`——那是这条路径唯一的交付通道，而面板此刻已卸载，
  界面上没有位置能报告失败。
- **门禁**：`sidebar-row-axis.mjs` REGISTRY 摘掉技能中心行（注释写明迁往 panellist 的
  日期），`sidebar-row-axis.test.mjs` 的 fixture 同步降为两行，`box-sizing` 突变用例改
  指剩下的 `sidebar-nav` 行（突变形状不变，射程不减）。

## Alternatives considered

承载方案的取舍全部记在 [ADR-0130 备选方案](../../../adr/ADR-0130.md)（保留注入只修顺序 /
挂 `shell.overlay` / 继续用事件总线 / 注入到 panellist 的 DOM 里 / 三面同迁）。本 Note 只补
两个执行层的选项：

| 方案 | 为什么未采用 |
|---|---|
| 用 `sync-profile.mjs --apply --loadpoint` 全量同步装载点 | 同一棵树上另一个会话正在改 `dsh-newapp-local`，全量同步会把它未验收的宿主产物推进 live 装载点。改为复用该脚本自己的 `planSync`/`applySync`（tmp+mv 原子语义不变）做**按包作用域**同步，只动技能中心与能力中枢 |
| 把 `box-sizing` 突变用例随技能中心一起删掉 | 那是自测里少数几条「证明判据能说不」的用例之一，删掉等于把仪器磨钝。改指到剩下的注入行，突变形状与红字断言一字不改 |

## Consequences

**实机读数**（DSH Desktop 2.0.10，独立 Chrome + CDP，cookie 由 `browser-session` 密钥
在进程内铸造，密钥未落盘未打印；authority `127.0.0.1:43120`）：

| 项 | 迁移前基线 | 迁移后实测 |
|---|---|---|
| 侧栏注入行 `[data-dsh-skill-center-entry]` | 1 | **0** |
| `sidebar.panellist` 官方行 | 0 | **1**（label 扩展中心、含 svg、徽标 `99+`、几何 x12 y234 w256 h36） |
| 行的 active 态 | 自造（`data-active`） | **官方** `aria-current="page"`，退出后归 null |
| 面板挂载位置 | `document.body` 下的 `.overlay`/`.drawer` | `panelPage → centerCol → frame`（`elementFromPoint(600,400)` 祖先链） |
| fixed / 高层号祖先 | 有（层号 2147482000） | **0 个** |
| 面板几何 | 抽屉（右侧滑入） | x280 y0 w656 h813（吃满中心列） |
| 「关闭」按钮 | 有 | 无（只剩「← 返回会话」） |
| 三个 hub 页签 | Agent 技能包 / MCP 服务 / 应用扩展 | 不变；技能卡 81 张 |
| 退出（返回按钮 / Escape） | 隐藏抽屉 | 卸载面板 + 官方 active 态清除 + composer 回到 x296 y389 w610 h52（与进入前逐字相同） |
| 卡片「执行」 | 广播已无听者的事件，面板留在原地 | 面板卸载、composer 复位、console 零异常 |
| 收起 rail | 注入行自绘 36×36 圆 | 官方 36×36（x10 w36 h36）、徽标 `display:none`、svg 18；展开后恢复 x12 w256 h36 / svg 16 |
| 工作台折叠组 / 容器 / `data-lute-navrow` / footer action / token 标签 | 1 / 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 / 1（折叠组退役属 S3.3） |
| 命令面板（S2 成果） | 打开 42 项 | 打开 42 项（未回归） |

**启动三件套**（P-52 判据，runId `b9df35a5`）：`startup.run.completed` 9420ms、
`rendererStatus: healthy`、recovery/watchdog 事件 **0** 条、本次运行日志段里
watchdog/recovery/boot-failed **0** 行、渲染进程 CPU **0.0–0.1%**。

**仓库侧**：包内 85 个测试全绿（11 文件）；两条新用例都做了突变验证（把 `onExit()` 改回
旧广播 → `expected +0 to be 1` 红；把 `.catch(warn)` 改回 `void` → `expected '' to contain
'未能写入剪贴板'` 红）。`pnpm run gate` 95/99，唯一红项是 `profile-bundle-sync` 报
`dsh-newapp-local` 装载点字节漂移——**另一个会话的在制品**，按既定约束不动它。

**未运行 / 未覆盖**（照实登记，不当作通过）：

- 中英混排下的行标签与页签未实测（label 走 locale 函数，基座在 locale 切换时重算，但
  本轮没切语言）。
- 侧栏宽度：CDP 用的是 1440×900 的浏览器窗口，实测侧栏 280px；ADR-0125 的 264px 契约
  针对桌面 frame，两者不是同一读数面，本轮**未**验证 264 契约。

## 同轮收尾（用户拍板三条，2026-09-19 同日）

S3.1 报上去的三个残留，用户当场判定：①S3.2/S3.3 要改的 newapp 与岗位矩阵正被另一个
会话在飞，**先做自己包里的收尾**；②`dsh:skill-execute` **两处一起删**；③技能卡「执行」
**统一到共享 prefillDraft**。决策记在 [ADR-0130 D6](../../../adr/ADR-0130.md)。

做了什么：

- 交付链提为共享源：`shared/client/prefill-draft.ts` 新增 `deliverPrompt`
  （`setDraft` 优先 → 剪贴板兜底 → 两级降级都出声 → 成败如实返回，`via` 说明走了哪条）。
  它原本住在能力中枢的 dispatcher 里，技能卡成为第二个消费方即上提（ADR-0128 D5 的同一
  把尺）。`sync-shared` 23 个副本全一致（含岗位矩阵那份生成副本，**只是追加导出**，
  它自己的 `prefill.ts` 不受影响，也未重建它的产物）。
- 技能中心接线：`sessions`（当前会话 id，走 `ctx.inject`，缺席时优雅降级）+
  `conversation`（走 `ctx.get`），`runSkill` 经 inject face 下传到卡片；`dsh:skill-execute`
  与本地剪贴板代码删除；「已发送到会话！」只在真的交付成功后才出现。
- 命令面板修两处实测缺陷：`execute-skill` / `prefill-draft` 交付前先
  `selectPanel(null)`（否则面板盖着 composer，草稿写进用户看不见的地方——与 S3.1 那个
  缺陷同形，只是发生在面板里）；`open-panel` 改走「key 已注册就 `selectPanel(key)`，
  否则回退广播**并出声**」，key 判据与基座同源（`slots.entries('main')`），不抄迁移清单。

**实机读数**（重启后 runId `bc162dca` / 9707ms / healthy / 0 recovery / 0 watchdog）：

| 流 | 读数 |
|---|---|
| 技能卡「执行」（畅销款规律解码器） | 面板卸载、行 active 归 null、**composer 文本 = `使用技能 /bestseller-pattern-decoder`**（走 setDraft，不是剪贴板） |
| 命令面板选技能（扩展中心面板正打开） | 面板与 palette 双双退场、**composer 文本 = `使用技能 /scenario-driven-product-scout`** |
| 命令面板选岗位（目标面尚未迁移） | 界面不误报成功，console 出声：`open-panel 'roles'：基座没有注册这个 main 面板 key，回退 dsh:view-change 广播（该面尚未迁到 keyed slot，广播可能没有听者）` |
| 死事件 / 异常 | `skill-execute` 相关日志 **0** 条；console error / exception **0** 条 |

仓库侧：技能中心 87 测试全绿（新增 4 条：退出通道、交付失败不谎报、sessions+conversation
接线、无会话时如实报失败），能力中枢 49 全绿（execute-skill / prefill-draft / open-panel
三分支重写）。接线用例做了突变验证：把 `sessionId` 改成恒 `undefined`（接线断开的形状）
→ `expected { ok: false, … } to deeply equal { ok: true, via: 'draft' }` 红。

**仍未做**（照实登记）：

- `open-panel {view:'roles'}` 目标面（岗位矩阵）在 S3.3 迁移前**仍然打不开**——现在只是
  从「静默死点击」变成「出声的死点击」。S3.3 迁完自动闭合。
- `lookup`（不声明 inject 地读服务）现在有 **4 份**同形实现：能力中枢、newapp
  `launcher.ts`、岗位矩阵、技能中心。前两份早于本轮，第 4 份是本轮加的。该提为
  `shared/client/` 一份事实，但转换要动 newapp 与岗位矩阵（另一会话在飞），未做。
- 岗位矩阵的 `lib/` 未随共享副本重建（它不用新导出，行为不变）；下次它自己构建时自然
  带上。

**后续**：S3.2（新应用迁 keyed slot，注意技能中心里两处「打开工作台/打开应用」仍广播
`view:'applications'`，其听者是 newapp 的 `panel-mount`，newapp 一迁就断）、S3.3（岗位
矩阵迁入 panellist、折叠组与 `sidebar-entry-core.ts` 整体退役、`sidebar-row-axis` 门禁
射程归零后的处置）。
