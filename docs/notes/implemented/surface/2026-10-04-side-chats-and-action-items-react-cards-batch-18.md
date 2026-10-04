# Batch 18 / P3 第三片：侧聊卡与行动项卡 React 接管（关联卡改期）

- 日期：2026-10-04
- 状态：本地完成（未 commit、未 push）
- 依据：[ADR-0261](../../../adr/ADR-0261.md)（D7 strangler；P3 卡片群逐卡迁移）

## Problem

侧聊卡（D5：派生/回看/发送/带回四个具名动作，read 后回填子会话 transcript）与行动项卡（D6：行动项行与执行记录、更正块（原要求候选来自会话 transcript 的 user 条目、选中即回填更正副本）、项目块）仍由内联脚本渲染。原建议的「关联卡＋行动项卡」组合在侦察中否决了关联卡：`#link-matter`/`#link-workspace` 的 `.value` 被 18+ 处 legacy 读取点依赖（`currentSendContext`、`selectedAdminTargets` 及会话/方案/管理/分组各动作），单迁 D2 会连锁改道全部读取点并需要 legacy→React 上行桥——那是「选择器簇专项批」的题，不宜夹带。D5 与 D6 自包含（D6 的 linkMatter 读取留在 legacy 动作内即可），构成第三片。

## Decision

1. **区域桥新增两槽**：`side-chats`（`{kind:'read', slot}`/`{kind:'unavailable', code?}`）与 `action-items`（`{kind:'read', slot:{items, corrections, originals, projectsState, projects}}`/`unavailable`）；两卡 `article` 作 React root 容器（`#sage-region-side-chats`/`#sage-region-action-items`＋`data-region-state`）。原要求候选的抽取（会话 transcript 中已发送 user 条目）仍在 legacy 完成随槽发布。
2. **下行桥 +10 动作**：`createSideChat()`（经 `currentSendContext` 读关联卡选择）；`readSideChat(id)`→`{kind:'read', transcript, execution}`/`{kind:'failed', notice}`；`sendSideChat(id,text)`→`{notice, transcript|null}`（accepted 后按旧语义重读回填）；`returnSideChat(id,text)`→notice；`createActionItem(title, note)`→notice|null（linkMatter 读取在动作内）；`actionItemRowAction(id, action)`；`submitCorrection(original, text)`→notice|null（React 把所选原要求作参数传入）；`createProject(name)`/`assignProject(projectRef)`/`unassignProject()`→notice|null（项目选择由 React 传入）。预conditions（含 trim 语义）保留在动作内。
3. **React 拥有**：DOM、侧聊视图打开/当前 id/transcript/输入、行动项 current 项（默认最后一条，行点击切换）、更正选择（默认最后一条原要求、40 字截断+省略号、选中回填副本）、项目选择、全部 pending 与 notice 时机（三个独立 notice 槽 + 视图态固化规则与 legacy 一致）。
4. **探针扩到六区域**：`regionFacts` 增 `sideChats`/`actionItems`，期望值从同一 payload 推导（state==='read'→`read` 否则 `unavailable`）。
5. **测试重分工**：删除 2 个 legacy 渲染 spec（action-item-renderer、side-chat-surface），覆盖重安置为 `test/side-chat-action-items-bridge.spec.ts`（7）＋`test/product-app/side-chat-action-items.spec.tsx`（7）。

## Verification

- 红：bridge 7/7 具名红＋jsdom 模块缺失红＋真实探针红（`side-chats region state is null, expected unavailable`、`action-items region state is null, expected unavailable`）。
- 绿：聚焦 14/14；窗口头条绿（六区域态两侧一致）；全量 `1627 passed / 1 skipped / 0 failed`；gate quick 27/27、objects 84/84、0 skip；bundle 283,722 字节（守卫上限内）；`b18-cards-1440.png` 已人工回看（D5 两条记录与 tag/派生文本；D6 行动项行/执行记录/更正回执「待应用（在队列中…）」/项目汇总）。
- 过程修正（仪器类为主）：缺省 mock 对任意 id 都回 read（测试假绿）→ 按 id 分流；对象返回值误用 `.toContain` → 断言 `.notice`；send 后重读使 return 请求索引后移 → 改用 `requests.at(-1)`；**假 DOM 中每次 refresh 的 `fillSelect` 会把 `#link-matter` 值重填为空**（payload 无 matters 夹具）→ 在每次读上下文的动作前重设选择值；React 受控输入须用原型 setter（`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set`）再派发事件，直接 `.value=` 会被 value tracker 视为未变化；40 字截断夹具本身不足 40 字 → 换长文本；`complete` 按钮选择器命中第一行 → 指名第二行。另一实例：heredoc 多行块替换再次静默不匹配 → 改行级替换/Edit 工具、逐条断言 count==1。
- **gate 首跑红并修复（并发缺陷）**：`sage-shell-quality` 红——两枚窗口 spec 文件在并行 worker 中各自调用 `build-renderer.mjs`，脚本固定 `.tmp` 文件名导致 rename 竞争（一个 rename 成功后另一个 ENOENT 抛错）。修复：临时文件名加 `pid+时间戳` 唯一化（内容相同、rename 原子）；两枚窗口 spec 并行复跑 19/19 绿、gate 27/27 绿。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 本批含关联卡（原建议） | 否决（本批内改期）：`#link-matter/#link-workspace` 有 18+ legacy 读取点，需选择器簇专项批（上行桥＋全读取点改道）一次做干净。 |
| 侧聊游标/当前 id 等视图态继续留 legacy | 否决：这些是纯视图态（无 wire 语义），React 持有更干净；legacy 只收参数。 |
| 更正/项目的「所选」值由 legacy 从 DOM 读 | 否决：选择控件归 React 后 legacy 读不到；以参数传入、条件句仍留 legacy。 |
| 保留 2 个 legacy 渲染 spec | 否决：区域 DOM 归 React 后无可驱动对象；覆盖由 bridge/jsdom/探针三层承接。 |

## Consequences

- P3 已完成 6/13 卡（sites、tool-results、run-monitor、artifacts、side-chats、action-items）；`renderer.ts` 6,833→6,475 行（−358），新增 `side-chats-view.tsx`、`action-items-view.tsx`。
- 下行桥现覆盖 19 个动作；余下卡片：列表（D0）、草案（D1）、会话（D3，最长）、关联（D2，建议与 D0/D7/D12 合成选择器簇专项批）、管理（D7）、分组（D12）、方案（D9）。
- 未决：P4 其余面板与 legacy 内联脚本退役；本批未 commit、未 push。
