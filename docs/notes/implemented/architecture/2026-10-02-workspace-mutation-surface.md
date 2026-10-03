# 012 写入半边：重命名 / 删除登记 / 排序，删除只解除登记

## Problem

工单 012 的后半段要给工作区列表接 `rename` / `delete` / `insertBefore`，验收里最硬的一条是
**「删除后目录仍在磁盘上，UI 不把两者混为一谈」**——这是本仓库最容易被写坏的一类句子：
基座 `WorkspaceRegistry.delete` 的声明原文是"delete one workspace registration while retaining its
directory and every session log"，界面若写成"已删除工作区"就与事实分家。

## Decision

- 桥加三条 `write` 端点（`workspace/rename`、`workspace/delete`、`workspace/insert-before`），
  请求对象逐字对齐基座声明，多成员即拒；拒绝码按 `isDSHRemoteError` 结构性识别后映射（ADR-0205）。
- main 侧 `workspace-mutations.ts` 只认基座自己的回执：rename 必须**同名**回、delete 必须
  `{deleted:true}`、reorder 必须是 id 串数组；否则 `bridge-answer-unrecognised`，不当结算。
- 路由 `/.sage/workspace/mutate`（仅 POST、仅 JSON、精确三型），进不了事项流水线。
- 界面：每行一个重命名输入框、一个上移（第一行禁用）、一个「移除登记」；卡片正文先讲清
  "移除登记 ≠ 删除目录"，结算句再讲一次，且**结果里不含任何可以读成"目录已删除"的词**。
- 轮询不再重建未变化的行（签名相同即跳过 DOM 重建），否则每 2 秒会清掉正在输入的名字。

## Alternatives considered

- 删除也走事项授权流水线：否决——工作区登记是工作区面上的东西，不是经营事项动作（沿 ADR-0174 边界）。
- 让界面在删除后自行从列表移除该行：否决——列表事实只有一个来源（follow 流），本地删除是第二个家（P-07）。
- 上移按钮先查一次当前顺序再发请求：否决——顺序由基座回执给出（`workspaceIds`），多查一次只多一个陈旧窗口。
- 结算句只写"已删除"：否决——与基座声明矛盾（US-064）。

## Consequences

- 删除语义现在有两道保险：投影类型里没有 path/directory 字段，界面句子里有常量半句。
- 每行三个控件的 DOM 由渲染脚本建，`#workspace-rows` 的静态按钮数不变（010 的"只有一个按钮"钉子照旧）。
- 已知未闭：重复采纳的幂等、真实 Host 上的删除实测均由基座保证/留待真机核验；本票不启动 Host。
- 账本：仓外 `docs/tickets/LOOP.md` §6 记本票读数与判据。
