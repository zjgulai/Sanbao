# 006 停止与待继续：暂停在 Sage 侧、竞态分账、冻结已接受项

> 决策与规则见 [ADR-0213](../../../adr/ADR-0213.md)。

## Problem

006 要"点停止后取消可取消工作、阻止后续输入自动进入执行，未执行输入成为可查看/编辑/移除的待继续项"。
基座 `cancel` 的注解是 "without dropping its pending inbox"——取消后队列条目仍在，可能被后续一轮消费（备注点名的
cancel keepInbox 与 kick 续跑竞态）。所以"停止后不自动执行"不能只靠取消。

## Decision

- 暂停在 Sage 侧：`stop` 先置 paused；暂停期 `send` 只存待继续项（零 `prompt`）。
- 停止＝pause → cancel → `control` 读权威队列 → 对仍属我方的 occurrence `updateQueue{remove}` 并标 `drained-at-stop`；
  快照里已消失的项 = 被竞态消费 → 冻结 `consumed-by-race`，不回可重发队列；拿不到快照如实报 code。
- `resume` 是唯一派发路径、按序派发并转 `submitted`；无绑定时由这次显式继续创建会话。
- `edit/remove` 只对 `pending` 生效（已接受项冻结，被拒编辑不改文本）；记录与草案共用 `createDeviceSealer`（0600）。
- 重开只读回状态：新通道只 read 时零桥调用。

## Alternatives considered

- 暂停期仍 prompt 等恢复放行：inbox 会被后续轮次消费，否决。
- 只 cancel 不收回：留下 kick 竞态孤儿，否决。
- 被消费项标回 pending：会二次派发已执行内容，否决。
- 恢复用新会话重发：丢历史连续性且无法分账，否决。
- 允许编辑队列内条目：属后续票的队列语义，本票冻结，否决。

## Consequences

- 三条验收各有机器断言（零 prompt、drained/consumed 分账、重启零调用、冻结不可改）。
- 密封抽取为 `createDeviceSealer` 单一实现（草案行为不变、spec 全绿）。
- 已知未闭：真机未跑；`steer`/队列内编辑（US-025/027）另票；`control` 按有界窗口读。
