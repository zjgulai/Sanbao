# 步骤 3 接真存储：把"写了没跑到"的事件库接进生产路径

- 状态：implemented（隔离工作树 `qoder/ui-wiring`@`6654d75` 已实现并通过自验，未提交）
- 关联：工单 `docs/tickets/002-*`（仓外设计集，本 Note 只覆盖其"落点"第一刀）、[ADR-0200](../../../adr/ADR-0200.md)、[ADR-0174](../../../adr/ADR-0174.md)、[ADR-0190](../../../adr/ADR-0190.md)
- 说明：002 的完整验收（草案→确认→列表可见、登出加密锁定等）**尚未达成**；本刀只把写侧的第一个真实落点接上，让失败位置说真话。

## Problem

写侧一动就停在第 3 步，而且**理由说的是假的**：`strictRehydrate` 的 fail-closed 默认值返回 `undefined`，管线把它映射成 `identity-unavailable@rehydrate`（可重试）。缺的并不是身份，而是存储 provider。

更刺眼的是：仓里**已经有**一个完整的 Sage 自有 SQLite 事件库（append-only、摘要链、幂等 append、崩溃恢复，20 条进程级测试），但 `src/` 里没有任何文件 import 它——典型的 P-04。

## Decision

- 新增 `src/main/matter-rehydrate-port.ts`：`load(matterId)` → 管线 step-3 答案；**所有不确定路径 fail closed**（打不开/抛错/blocked/投影失败/已关闭 → `undefined`），`not-found` 是唯一的否定答案，且与"provider 不可用"严格区分。
- `app-service.ts` 在组装 step-2 端口时按同一形状合并这个端口；**步骤 4–10 未动**。
- 生产限额在接线处显式选定并写明理由（库刻意不给默认值）：4096 事件 / 1 MiB 载荷 / 2000 ms 忙等。
- 生命周期：首次命令惰性打开，`will-quit` 关闭。

## Alternatives considered

- 连步骤 9 一起接：否决（会造出"能写不能回"的中间态，回执语义属 002 后半）。
- 打不开时当空历史：否决（把"读不到"伪装成"没有"）。
- 把限额塞进库当默认值：否决（库的架构记录明写调用方必须显式给出）。

## Consequences

- 写侧失败位置第一次说真话：不存在的事项 → `policy-denied@rehydrate`（存在性与无权限对渲染面不可区分）；存在的事项顺利过第 3 步并停在**真正**没接的下一步（`compatibility-unknown@target`），证明后续步骤一个都没被打开。
- 新测试在**真库**上跑：空库、有流（revision 命中/不命中）、打不开、已关闭，外加两条管线级断言（阶段与码）。
- 先红读数：接线前跑本票 spec → 3 failed（打不开那条用错了路径字段；两条管线级断言拿到 `identity-unavailable` 而非期望的阶段码），修好后 5/5。
