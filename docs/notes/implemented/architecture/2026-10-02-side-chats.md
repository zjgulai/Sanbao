# 024 侧聊：fork 子会话、分别投影、显式带回

> 决策与规则见 [ADR-0223](../../../adr/ADR-0223.md)。

## Problem

FW-019：侧聊以 `session.fork` 派生子会话；事项只关联主对话、侧聊为派生记录可回看；主侧分别投影，
内容不默认进主对话或对他人开放；带回主对话需显式动作、沿候选交付合同、不新造合并机制。核验项：
在途运行可否 fork、atSeq 截断位置。基座实现（:660）给出答案：截到最后一个完成轮；锚点落未完成
轮即 `session/fork-unavailable`。

## Decision

- 桥加 `session/fork`（write）；`side-chats.ts` 持久化记录（0600）、侧聊发送只针对子会话、
  fork-unavailable 原码透传。
- 主投影不含侧聊；测试断言全部 prompt/follow 的 sessionId 恒为子会话。
- 带回主对话=唯一显式动作，经 sessionChannel.send（既有合同）；侧聊历史不动；无合并控件。
- 暂停期侧聊发送拒绝；文本≤16384；记录≤16；存储损坏=unavailable。

## Alternatives considered

- 主会话内"线程"：否决（FW-019 点名 fork）。
- 自动回流/摘要：否决（US-105 只许显式）。
- 暂停期入待继续：否决（那是主对话记录）。
- 重启重 fork：否决（会造第二条子会话）。

## Consequences

- 两条验收机器断言齐；全量 962→971；gate 25/25；电池 6/6（含 023 守护复跑；首轮漏网=--specs 未含
  reminder-discipline，补正后 6/6——记：跨票守护突变必须把对应 spec 放进电池射程）。
- 已知未闭：真机未跑；侧聊附件/协作者可见范围/完整候选交付合同后置。
