# 工作区列表：订阅基座的 follow 流，以基线对账

- 状态：implemented（隔离工作树 `qoder/ui-wiring`@`6654d75` 已实现并通过自验，未提交）
- 关联：工单 `docs/tickets/012-*`（仓外设计集）、US-063/064、[ADR-0204](../../../adr/ADR-0204.md)、[ADR-0203](../../../adr/ADR-0203.md)
- 说明：本 Note 覆盖列表的**读取与折叠**（baseline＋四类增量、重连对账、幽灵行防护）与只读列表面；删除/重命名/排序的用户面未做。

## Problem

012 的验收要真的订阅，而基座没有平铺的列表方法——唯一来源 `workspace/follow` 是流（`baseline` + `upsert/remove/order/archived`）。ADR-0203 的桥是请求/应答，没有推送位，于是要么加流式通道，要么把验收做成空话。

## Decision

- 新帧型 `bridge-frame{callId,seq,frame}`；端点 kind 增 `stream`，`workspace/follow` 为首例。
- 帧数上限 256，超出以 `bridge-stream-overflow` 终止；消费者提前关闭以 `bridge-stream-closed` 收口。
- `seq` 由 host 单调给出，main 丢掉 `seq <= lastSeq` 的帧——重复与乱序都不合并。
- 折叠每次从空开始：新 baseline 覆盖一切，这就是"重连对账"。
- `order` 只给已知 id 排序（未知 id 忽略）——幽灵行正是本票禁止的对象。
- 不认识的帧**计数**（`unapplied`）而不套用；`bridgeCall` 对 stream 端点直接拒绝，防止用请求/应答 API 订阅流。

## Alternatives considered

- 本地另记一份采纳记录：否决（两个家，删除/改名永远对不上）。
- 只取第一帧快照：否决（"增量不乱"没有对象）。
- 不限帧数：否决（无界通道）。
- main 自行排序：否决（消费者猜序＝把乱序伪装成有序）。

## Consequences

- 桥有了第三种形态，且流是唯一带显式上限的形态。
- **顺带修掉真实接线缺陷**：child 侧 `bridgeCall(endpoint)` 丢掉 payload，任何带参端点（如 `workspace/create`）在真实链路上必然 `bridge-payload-invalid`；已修并有两票探针覆盖。
- 只读列表面已接（三态：读到 N 条／读到 0 条／未核验＋原因），浏览器实测通过。
- 已知未闭：删除/重命名/排序入口；"删除工作区 ≠ 删除目录内容"的 UI 区分。
