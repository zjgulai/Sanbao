# 模型配置只读面：值不上屏，已保存与连通性各占一格

- 状态：implemented（隔离工作树 `qoder/ui-wiring`@`6654d75` 已实现并通过自验，未提交）
- 关联：工单 `docs/tickets/017-*`（仓外设计集）、US-043/044/047、[ADR-0202](../../../adr/ADR-0202.md)、[ADR-0198](../../../adr/ADR-0198.md)
- 说明：本 Note 只覆盖 017 的**只读半边**；保存配置与凭据写入未做，连通性测试属 018。

## Problem

工单 017 要三件事：保存成功与可调用在界面上是两个字段；部分失败不显示整项完成；凭据值不出现在日志或投影里。

取证发现基座 `settings/describe` 的返回结构本身就把这三件事分好了层：`namespaces[]` 每项带 `user`（用户已保存的那一层）、`value`、`applies: live|restart`、`secrets: [{path, set}]`（只有状态没有值）。难的是**不能整体透出**——`schema/value/base/user` 里可能带完整配置值甚至机器路径。

## Decision

- 新分类器 `src/main/settings-readout.ts`：只保留 `ns / revision / applies / saved(层级) / secrets{set,total}`；值、schema、base/user 内容、以及秘密的 key 路径全部丢弃。
- 形状不认识（缺 `writable/hasDocument/namespaces`、非记录）→ 整份 `unavailable + not-plain-data`，**不做部分渲染**。
- 投影自带 `connectivityTest: 'untested'`，界面按字段措辞（认不出时显示"无法核验"，不得默认成已测试）——保存过配置不代表供应商被调用过。
- 只要有一个命名空间缺凭据，汇总句就说"仍有 N 个缺凭据，缺凭据的项不算配置完成"。
- `main/index.ts` 首次生产消费只读桥：`host.callReadOnly('settings/describe')`，拒绝/不可用走同一条分类路径。

## Alternatives considered

- 透出 describe 原文：否决（值/路径上屏 + 等于内置全量编辑器）。
- 只给"已保存/未保存"两态：否决（正是要治的失真）。
- 现在补保存与凭据写入：否决（属 017 后半与 018，且需写桥与冲突核对）。

## Consequences

- 模型配置第一次有只读面，且**值一律不出主进程**；"已保存"与"连通性"两格可分别读出。
- 发现并修掉一处自查漏洞：投影带了 `connectivityTest` 而视图原先硬编码文案——等于投影字段是死的（一条事实两个家）。已改成视图读字段，并用突变钉住。
- 已知未闭：保存/凭据写入、连通性测试（018）、`applies` 重启语义的真实生效。
