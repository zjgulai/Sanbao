# dsh-qoder-sidebar-local

Qoder 风格的**右栏活动页**：一个由会话活动驱动的 UI 模版。

## 是什么

右栏（原生 `ui-sidebar-right` 列）里的一个标签页——空白会话里它是**空的**，
AI 调用工具、产出资源时，一栏一栏地出现：

| 栏 | 出现时机 | 数据源 |
|---|---|---|
| 环境信息 | 工作区有未提交改动 / 领先落后远端 | 宿主半的 git 路由（会话没动过它也可能有话说） |
| 后台进程 | 起了命令（`bash` / `shell` / `job_*`） | 会话事件流 `tool/call` |
| 技能与 MCP | 调用 skill 或 MCP 工具（名字含 `__`） | 同上 |
| 产出 | 写文件（`write`/`edit`/…）或 `deliverables/presented` | 同上 |
| 网页查阅 | `web_search` / `web_fetch` | 同上 |
| 来源 | 人给了图片 / 文件 | `user/message` 的 image / file 块 |

行的状态点由 `tool/result` 回填：`running`（business 呼吸）→ `done`（success）/
`error`（error）。

## 架构

- **宿主半**（`src/index.ts`）：只有 git 状态一条 loopback 路由——渲染进程没有
  `node:child_process`，在那边 import 会让插件启动即挂。
- **客户端半**（`src/client/`）：
  - `native-rightbar.ts` —— 原生右栏的最小契约面（标签类型 / 标签体登记、`openTab`）。
  - `sidebar-surface.ts` —— 两条登记 + `inject(sessionId)` 把**本会话的事件流**递给标签体；
    首次展开时把本页补到前台。
  - `session-activity.ts` —— 事件流 → 各栏的折叠（**信封事件**：负载在 `event.data`）。
  - `sidebar-body.tsx` —— 渲染各栏与行（空会话渲染为空）。
- 视觉零字面色：颜色全部走 `--dsw-*` 主题 token（`styles/sidebar.module.css`）。

## 验收

- `pnpm test` —— 折叠的**真机夹具**回归（含「空白会话什么都不产出」）。
- 真机：`node scripts/acceptance/right-sidebar-activity-live.mjs`（仓库根）。

## 决策记录

- 活动驱动模型与原生 docking：[ADR-0143](../../../docs/adr/ADR-0143.md)
