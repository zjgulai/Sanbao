# Ticket 001 差集：命令结果态进入投影，界面按三态选入口

- 状态：proposed（隔离工作树 `qoder/ui-wiring`@`4c4b127` 已实现并通过自验，未提交、未经用户验收）
- 关联：工单 `docs/tickets/001-*`（仓外设计集）、US-117~US-123、[ADR-0174](../../../adr/ADR-0174.md)、[ADR-0184](../../../adr/ADR-0184.md)
- ADR：待补编号。**不得在本工作树直接mint 0191+**：主仓已到 ADR-0193（工作树基线仍 0190），提前编号必撞号；先与 main 对齐再登记。

## Problem

命令管线已有 `CommandDenied{code,stage,retryable,correlation}`，但界面拿不到"这条命令到底怎么了"：

1. `outcome-unknown` 只在管线内部归一，`/.sage/state` 投影里没有它的位置。ViewState 的 `unknown` 属**可用性**维度（`SageAvailabilityState`），于是"结果未知"和"能力未知"在消费侧是同一个词。
2. 全量 `src/product/*.ts` 里没有任何"核对同一操作"的入口（`reconcile|核对` 零命中），只有一个由运行时 `retryable` 驱动的隐藏 `#retry`。
3. 后果不是不好看，而是会重放：管线给 `identity-unavailable` 这类**未就绪**码标了 `retryable:true`。界面若照 `retryable` 显示"重试"，就等于诱导用户对一条从未发出的动作再点一次，而对 `outcome-unknown`（`retryable:false`）又无处可查——正好违反 US-119/US-120/US-121。

## Decision

由 main 一次性完成语义分类，界面只做"码→文案"与"态→入口"的映射，不再自行判断可否重放：

- `appservice/contracts.ts` 新增 `ServiceCommandOutcome = 'not-ready' | 'unknown' | 'failed' | 'settled'` 与 `ServiceCommandStatus{correlation,outcome,code,retryable}`，挂在 `ServiceStatus.command`（未派发时为 `null`，缺席即缺席，不用零值冒充）。
- `appservice/composition.ts` 在 `dispatch()` 里记录最近一次命令的分类结果，`readState()` 原样投影。分类规则：`receiptRef|availability ⇒ settled`；`outcome-unknown ⇒ unknown`；`NOT_READY_CODES`（identity/registry/capability/persistence-unavailable、compatibility-unknown）`⇒ not-ready`；其余 `⇒ failed`。
- 投影**只带机器码**，不带任何自由文本；可读文案是 renderer 里的静态表（US-122）。
- renderer 新增 `#reconcile`（核对同一操作）与 `#command-note`；命令态存在时**覆盖**运行时给出的 `#retry` 可见性：只有 `failed && retryable` 才显示重试，`unknown` 只显示核对，`not-ready` 两者都不显示、只给缺项说明。

## Alternatives considered

- **界面自己按 `code` 字符串判断**（如 endsWith('-unavailable')）：把同一事实写两处（P-07），且码名一改界面静默失效。否。
- **命令结果只留在 POST 响应里，由 renderer 本地记住**：重载即丢，且 `/.sage/state` 与动作回执变成两个真源；"详情与列表读同一投影"的既有原则被破坏。否。
- **新增 `GET /.sage/commands/:correlation` 路由**：扩大 main 的业务路由面，而当前只有"最近一次命令"这一个真实消费需求（YAGNI）。留作后续票按需提出。
- **把未就绪也算作失败、只是文案不同**：合并三态正是 US-121 明令禁止的。否。

## Consequences

- 正向：三态在消费侧可区分且入口互斥；"未知不重放"由投影保证而非靠界面自觉；新增一条端到端 S1 测试把三类结果与三类入口绑死（变异掉分类或覆盖逻辑都会红）。
- 代价：`lastCommand` 是**进程内单槽**，只保"最近一次"，不持久、不覆盖并发多命令；真正的"按 correlation 查同一操作事实"仍待回执存储（工单 003）。文案表在 renderer 侧，新增码时必须同步补表，否则落到按态兜底句（可接受，但需在门禁/测试里继续盯着）。
- 已知未闭：本票改动不含 `pin-consistency` 与 `sage-product-boundary` 两条门禁红（前者是工作树基线落后主仓的 vendor 漂移，后者属工单 050 的结构性冲突），详见仓外 `docs/tickets/LOOP.md` §6。
