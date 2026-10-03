# 029 事项管理：归档、重命名与逐项批量

> 决策与规则见 [ADR-0227](../../../adr/ADR-0227.md)。

## Problem

FW-030/US-150~154：归档按 D-029（仅符合条件、退出活动列表、保留事实与回执、可恢复、不停止
执行、不解除责任、不删保留数据）；重命名经服务裁决并回读实际生效值；批量逐项返回、不静默跳过、
不整体成功；隐藏/归档/停止三事实不混用。验收三条（归档可恢复且事实回执保留；批量逐项无整体
成功；重命名回读生效值）。现状：022 的 lifecycle 槽无事实来源；停止=会话暂停（006）；
"隐藏"无此功能；正式记录归托管侧（ADR-0201），重命名裁决端口生产未接线。

## Decision

- `main/matter-admin.ts`：归档记录 {matterRef, archivedAt, ground 声明}+trail；knownMatter 同码
  防枚举；幂等；只写自己的记录。022 `archivedOf` 接活 lifecycle（默认折叠、展开有标签）。
- 重命名：`renameMatter` 端口裁决、view 分 requested/effective（只取回读值）；未接线如实
  `matter-rename-unavailable`。
- 批量：1–32、仅 archive/restore、逐行 {outcome,code}+counts（形状无整体成功）；malformed 整拒。
- 页面 D7 卡：选择集+依据（声明）+逐项结果+回读对照+trail；文案明说三事实分开、删除独立无入口、
  批量逐项为准；022 筛选标签更新为「显示归档（事实来源：本版归档记录；完成语义未收口）」。
- 路由 `/.sage/matter-admin`（archive/restore/batch/rename 命名动作）；槽 `matterAdmin`。

## Alternatives considered

- 走命令管线 S2：否决（3–10 fail-closed，非 Registry 动作）。
- 归档对象=会话 archiveSession：否决（会话归属≠事项列表退役）。
- 本地改标题：否决（真源在托管侧）。
- 批量单一成功标志：否决（US-153 点名）。

## Consequences

- 验收三条机器断言落定：归档/恢复仅动 matterAdmin+lifecycle（其余槽 byte-equal、回执保留）；
  批量逐项行与 counts、无 success 字样；rename effective=回读。
- 022 lifecycle 首次获得事实来源；筛选复选框成为真实过滤。
- 已知未闭：本运行记录（持久化后置）；rename 端口生产未接线；真机未跑。
