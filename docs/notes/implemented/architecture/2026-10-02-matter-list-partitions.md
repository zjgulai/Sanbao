# 022 事项列表：行动需求分区由 main 逐读推导

> 决策与规则见 [ADR-0221](../../../adr/ADR-0221.md)。

## Problem

FW-015：列表按"待我处理/进行中/待验收"分区、分区内按最近更新排序；分区是呈现组织非新状态存储；
归属由 Application Service 从当前 attempt、待验收 artifact、就绪 blocked|unknown、待继续输入推导，
renderer 不自判；待我处理可追触发事实、事实变化随投影；待验收首版只计数；归档/完成默认不展开可
筛选；无真实 authority 时 unavailable-first、不用 fixture 冒充。Sage 依据里没有单一"行动需求"字段。

## Decision

- `src/main/matter-list.ts` 逐读推导（无缓存）：attempt unknown/failed→待我处理（ref=correlation）、
  pending→进行中；待继续输入计数>0→待我处理（count 触发）；观察产物候选>0 且无待办→待验收；
  其余→进行中；优先级 待办>待验收>进行中；编辑中且无 attempt 的草案不列。
- 同 matterRef 合并一项（新记录标题/时间；任一草案开放 attempt 仍触发）；分区内 updatedAt 倒序、上限 50。
- 待验收只出计数+未收口句不列行；lifecycle active|archived 机制在，本版无 archived 事实来源。
- 记录 gate 不可读=整列表 unavailable+码；渲染"未核验…fixture 不当列表数据"；fixture 投影在场不造行。
- 状态槽 `matterList` 入 ViewState；无新端口/存储。

## Alternatives considered

- renderer 自判分区：US-092 禁止——视图只按字段分组。
- 存成行动需求字段：US-091 明说非状态存储——否决。
- 待验收列行：US-094 只计数——否决。
- fixture 兜底：US-096——否决。
- 编辑中草案入选：无事项身份、草案卡专属——否决。

## Consequences

- 三条验收机器断言齐（触发事实/只计数/fixture 不造行）；全量 950→958；gate 25/25。
- 已知未闭：真机未跑；archived 事实源与 per-matter readiness 快照待后续票。
