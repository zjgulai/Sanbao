# 034 澄清问答闭环：宿主中继、单发回答与待继续中止

> 决策与规则见 [ADR-0234](../../../adr/ADR-0234.md)。

## Problem

FW-035/US-177~182：运行中的澄清问题成卡（问题、候选项、所属运行）；回答经一条具名写提交
所属会话，回执区分已接收/已生效/结果未知（未确认不显示"已回答"）；候选与自定义同权、答案不
写成事项字段；历史只读回看、重开不重复提交；等待中停止→待继续、不自动继续。基座事实：
提问=`ask_user_question` 工具→`user-questions/request` waterfall；官方桌面经 `ctx.remote.$on`
转发给 webview；agent id=session id；`tool/call`/`tool/result` 记录问答；cancel 中止工具信号。

## Decision

- host `user-questions-relay.ts`：纯内核（claim/list/answer/abort/dispose）＋`prepend: true`
  注册＋`provide('sageUserQuestionRelay')`；只认领带 agent 的请求，其余 `next()` 委托；
  resolve 前按声明候选项校验；abort/teardown 一律 reject。
- 桥面 `session/questions`(read)/`session/answer`(write)；**修 008 漏网**：`session/queue-edit`
  补进 allowlist＋新增 handler⊆allowlist 源头守护（扫描源文件字面量）。
- main `clarifications.ts`：pending=中继注册表；所属运行=按需一页历史里的未闭合运行；
  回执 accepted→effective 凭 `tool/result` 证据、停止中消失→aborted、无 ack→unknown；
  `verifyOnly` 由活状态派生；一题一提交（sessionId:requestId 冻结，重复点击/刷新不再发）。
- 停止→`deferred(stopped)` 待继续（不自动继续）；暂停态提交拒 `clarification-paused`（零桥调用）。
- 渲染面：活卡（候选项+自定义同权+所属运行+意图徽章）、待继续行、回执行（[核对]只重读）。
- 历史 `detail.clarifications`：`tool/call`+`tool/result` 解析，只读渲染。
- 端口名册 +1（sessionClarificationAnswer）；消费登记扩 sageUserQuestionRelay；host 库登记新文件。

## Alternatives considered

宿主推送新 IPC 方向（否：既有架构 main→host 请求/响应＋按需页读同构）；日志推导 pending
（否：waterfall 注册表才是 live 真相，日志只作生效证据）；回答直连新 host 端点（否：scoped
waterfall 需在 host 内监听且须 prepend）；停止后排队回答到继续再派发（否：cancel 已中止，
必然 not-found，如实转待继续更诚实）；旧确认跨模式沿用（否：US-181）。

## Consequences

- 机器断言：停止→待继续零自动继续；四态回执可区分且未知只给核对；重复点击/刷新恰一条写；
  重开沿历史只读（detail 只调 session/page）。
- §1.6：澄清卡两问（radio+checkbox+自定义）、待继续行、四种回执行；历史只读块；交互读数
  证明一次提交恰一条请求（radio+checkbox+自定义合批）且核对零写调用。
- 已知未闭：plan-review 专用版式、答案改写撤回后置；真实 Host 未跑（relay 胶水仅单测）。
