# 决策记录：左栏「扩展中心」（技能中心）入口与其中心列页面退役

- 日期：2026-09-20
- 状态：implemented
- 对应 ADR：[ADR-0125](../../../adr/ADR-0125.md)（修订节，D4 能力带条目 roster）、[ADR-0130](../../../adr/ADR-0130.md)（被退役的承载形态：`main` keyed 视图 + `sidebar.panellist` 行）、[ADR-0009](../../../adr/ADR-0009.md)（一份事实一个家）、[ADR-0015](../../../adr/ADR-0015.md)（非机械改动留痕）
- 涉及包：`packages/surfaces/dsh-skill-center-local`（`src/client/index.ts` 两个 slot 注册、`tests/client-apply.spec.tsx`）
- 前置记录：[2026-09-19-skill-center-keyed-slot](2026-09-19-skill-center-keyed-slot.md)（本条退役的那个迁移）

## Problem

2026-09-20 用户在实机上看侧栏后裁决：**「把左侧边导航栏这个技能中心的按钮和对应的页面给我删除掉」**。

这个面（包内与文档里叫「技能中心」，左栏行标签是**「扩展中心」**）在 S3.1 迁到官方
`sidebar.panellist` 行 + `main` keyed 视图（ADR-0130）后，左栏同时存在三套与其功能重叠的入口面：
本行（管理 Agent 技能 / MCP 工具 / 应用扩展）、右栏工作台的「技能和 MCP」模块（`dsh-right-sidebar-local`）、
以及设置里各自的技能面。左栏行数是用户反复收的目标（同日已先退役「工作台 ▸」折叠组），
本条按用户点名把这一面的入口与页面一起撤掉。

## Decision

1. **两个 slot 注册整条移除**：`src/client/index.ts` 里 `slots.inject('main', …)`（key=`extensions`，
   页面本体 `ExtensionsPanel`）与 `slots.inject('sidebar.panellist', …)`（id=`extensions`，入口行
   `ExtensionsPanelIcon`）同时删除；`PANEL_KEY` / `SkillApi` 装配 / `loadTotal` / `sessions` 注入 /
   `deliverPrompt` 接线等随之失去调用者，一并删除。client 半区只剩 locale 字典注册，
   `inject` 由 `['slots', 'locale']` 收窄为 `['locale']`。
2. **宿主半区与面板组件保留**：`/api/dsh-skill-explorer/*` 路由族与 `panel-slot.tsx` /
   `SkillPanel.tsx` / `prefill-draft.ts` 留在包内——没有注册点它们就不会出现在界面上，
   删除整条链（含 3 个面板 spec + 路由）是另一条独立决策，不在本次射程。
3. **测试改为守卫「不再注册」**：`tests/client-apply.spec.tsx` 的断言从「注册了 main + panellist」
   翻转为「只注册 locale、`registrations` 为空」，并保留「没有 slots 服务也不抛」的降级用例；
   原两条交付通道（`runSkill`）用例随接线删除。

## Alternatives considered

- **整个插件从 profile 卸载**（`package.json` 依赖 + bundles 两条目 + 两处副本）：爆炸半径更大，
  且用户点名的是「按钮和对应的页面」；宿主路由与面板代码留着待用（若要复用为右栏模块，是现成实现）。
- **只撤入口行、留页面**：页面失去唯一入口，且 `main` 视图仍占 key，属半死状态——不留。
- **保留 `PANEL_KEY` 导出与类型面**：无消费者的导出就是死仪器的邻居形态（P-24），删。

## Consequences

- **左栏少一行**：`sidebar.panellist` 列表由基座自动派生，行随注册消失，无残留 DOM。
- **`extensions` 视图不再存在**：`selectPanel('extensions')` 无接收者；全仓核查过没有别的包
  派发这个 view（`packages/` 内只余 `view?: … | 'extensions' | …` 的类型联合字符串，属共享核心
  副本的类型面，不是调用点）。
- **行序不受影响**：注入行的 `familySelectors` 里从未包含本行（它自 S3.1 起是官方行，无
  `data-dsh-*` 属性），role-matrix 的锚定逻辑不变。
- **面板组件成为未被引用的待用代码**：若确认不再需要，另开一条删除记录。

## 验证读数（2026-09-20）

- `packages/surfaces/dsh-skill-center-local`：`npx tsc --noEmit` 通过；`npx vitest run` **85/85 全绿**
  （11 个文件；原 87 条——两条 `runSkill` 接线用例随接线删除，一条「缺 slots 时告警」用例改为
  「没有 slots 也不抛」）。
- `pnpm run build`：client bundle 10.27 kB；`grep -c 'sidebar.panellist' lib/client.js` → **0**，
  `'extensions'` 注册痕迹 → **0**。
- **两处 profile 副本同步**：`node_modules/dsh-skill-center-local/lib/client.js` 与
  `vendor/packages/surfaces/dsh-skill-center-local/lib/client.js` 与仓库产物 sha256 前缀一致
  （`7de76b340575`，10269 字节）；`node scripts/sync-profile.mjs --check --loadpoint` → 装载点一致。
  只同步本包：同批 `dsh-theme` 也有漂移，那是并发会话的在制品，不由本条带出。
- 相关门禁：`sidebar-row-axis`（0）、`sidebar-row-axis.test.mjs`（0）、`plugin-entry-contract`（0）。
- **实机可见验收：待重启**（宿主引导期对 `/plugins/…&rev=` 做快照，需完整重启后左栏行才会消失）。
