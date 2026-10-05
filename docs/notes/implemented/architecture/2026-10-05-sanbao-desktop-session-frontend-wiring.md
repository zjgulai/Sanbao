# Sanbao 默认桌面：会话前端接线（T05-F/T06-F）

- 日期：2026-10-05
- 决策：[ADR-0265](../../../adr/ADR-0265.md)
- 状态：已有合同的前端子片已关闭（默认主窗内的会话投影渲染与既有 send/stop/resume 消费）；真实后端、持久化、模型回复、停止/恢复与重启结果仍未验收。未提交、未推送。

## Problem

T01 让 Sanbao 复刻桌面成为默认主窗并处理真实读取拒绝，但会话区域仍是「发送尚未接通」的诚实占位。T05/T06 的真实路径被 T02–T04 的安全前提阻塞（bootstrap 读取范围等待授权、无生产会话语境）。需要一个不改变任何 admission、只消费已存在合同的独立前端子片，把原型会话结构接到真实投影与既有 send/stop/resume route 上，同时移除观察状态驱动与 canned 回复。

## Decision

按 tickets 的 T05-F/T06-F 节实施：

1. 投影有效性：`client.ts` 在既有 `GET /.sage/state` 响应上叠加严格的 `parseDesktopSession`——要求签入的 service、live matter、与 activeContext 双向匹配的 matter/revision、唯一命中的 workspace 关联、默认 matterLink 的 ref+path 一致、读态 sessionChannel；缺项不合成 session/root/authority，发送候选还需 actionability/authorization/compatibility/availability 合取。
2. 提交纪律：`session-controller.ts` 以 epoch/sequence/inFlight 守卫保证同槽不并行；提交前重读并复核 sameContext；受理只清除仍是原提交版本的草稿（revision 比对）；未知结果锁事项且不自动或手动重放；拒绝保留输入。
3. 读数刷新：发起、停止、恢复后重读权威投影；UI 状态只来自投影（回执不翻牌）；读取失败即撤回旧可操作上下文。前台读（首读/显式重读）以 loading 清面，后台读（轮询与动作前后复核）保留上一投影，避免 2 秒轮询反复卸载会话视图。
4. 视图与接线：`session-view.tsx` 渲染标题/状态/消息为纯文本（pre-wrap，无注入面）；`page.tsx` 在有会话时渲染会话视图，Composer 增补 stop/resume 与 busy/uncertain 门。

## Alternatives considered

- 直连 Host `session/create→prompt→follow`：不采用；绕过 main 的 admission 与 protected dispatch。
- 等 T02–T04 全部就绪再写前端：放弃独立可验证子片；合同的拒绝/未知分支也应在接线时固化为测试。
- 轮询与动作复核统一走 loading：会周期性卸载会话视图（滚动归零、停止/继续按钮闪现）——契约只要求「读取失败即撤回旧上下文」。

## Consequences

- 默认主窗在有会话投影时呈现真实 transcript 与执行状态；无投影时保持原首页。生产当前无会话 authority，路径表现为诚实拒绝与零 POST。
- stop/resume 回执允许携带非空对账 code（服务在队列快照不可用时仍返回确定态）；接纳为 settled，后续队列事实以投影为准。
- 会话视图自身的 320px 未实测（生产取不到会话）；替身成功只算组件/合同覆盖，不算生产消息成功。
- T02–T06 后端、T07–T13 功能族与 T14 总验收继续未完成。

## Verification

证据目录：`.birdview/evidence/sanbao-desktop-session-2026-10-05/`。

- 全量 `node scripts/test.mjs run`：190 文件 / 1703 通过 / 1 skip / 0 失败（子片聚焦 31 项：合同 11＋页面 8＋视图 12，含真实 route→production admission 零下游调用反例）。
- typecheck（`tsc --build`）exit 0；quick gate 27/27（objects 84/84，skipped=0，failed=0）。
- 负控变异：`if (mode === 'foreground')` 守卫被中和、`result.code !== null` 直判 → 两枚新测试各自具名红（exit 1），还原后复跑全绿。
- 实机（隔离根 /tmp/sage-desktop-t01-20261005，重建+materialize 后第二进程）：`desktop-live-check.mjs` exit 0——发送键与 Enter 两条触发路径以各自独家 notice 判别（点击发送→「发送尚未接通」、经上下文菜单重置 notice 后 Enter→再次「发送尚未接通」），writes=0、0 异常；拒绝读取、焦点返回、重读计数、1440/660/320 无横向回流；截图 1440/660/320 已回看。
- 独立复核（只读）：1 Important（后台刷新卸载会话视图）＋3 Minor（对账 code 过严/uncertain 恒真条件/跨 matter notice）；Important 与 code 项已修并各配测试与变异证明，其余登记留观。复核确认干净项：无合成/泄漏路径、提交守卫覆盖卸载/换读者/迟到回执、stop/resume body 与真实解析器逐字段一致、写入红线零违例。
- 旧 renderer 与 parked 批次 19–26 未动；未 commit、未 push。
