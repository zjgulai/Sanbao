# 005 会话通道：ack≠执行、历史即最终态、重开不重发

> 决策与规则见 [ADR-0212](../../../adr/ADR-0212.md)。

## Problem

005 要打通"事项主对话发一条输入 → 基座受理并流式回传 → 界面把受理与执行分开 → 结束与历史对账"。
三条验收各自要防一个误读：把回执当开工、把半截流当最终态、把重开当重发。取证基座
`sessionController` 后发现三条判据在基座契约里都有据：`prompt` 的返回值自称"enters the target Agent inbox"；
执行边界是日志里的 `turn/start`/`turn/end`；`assistant/message` 的注解写着"derived history uses this"；`page` 是冷读。

## Decision

- 桥加 `session/create|prompt|page` 与 `session/follow`（kind：write/write/read/stream）；`prompt` 载荷 `{requestId,sessionId,mode,text}`。
- 投影两字段：`sendState`（已受理）与 `execution`（idle/executing + lastTurnEnd reason）；accepted 永不改写执行态。
- 最终文本只取 `assistant/message`；live `assistant-stream` 帧只计数。流断或本次读取无最终文本 → 自动 `page` 重读并标 `reconciled`；
  对账失败如实报 `streamBroken + code`，transcript 里不出现助手行。
- matter→session 绑定持久化（0600）；`read` 只复用与读取，无绑定回 `no-session`；发送走独立路由。

## Alternatives considered

- 回执当"开始执行"：基座注解与 US-012 反例都指向否决。
- 用 live 帧拼最终文本：帧是进程内展示，历史才是 durable 最终态，否决。
- 打开事项先 create 会话：会创建/激活会话，`no-session` 更诚实，否决。
- 重开重发上次输入：US-013 明文禁止，否决。
- 本票建长订阅：属 006 范围，否决（沿用有界窗口读）。

## Consequences

- 三条验收各有机器断言（文案反例、来源=history 的文本、prompt 调用计数）。
- 已知未闭：真机端到端未跑；工具审批/预算/取消续跑属 006；`assistant-stream` 帧暂只计数不展示。
