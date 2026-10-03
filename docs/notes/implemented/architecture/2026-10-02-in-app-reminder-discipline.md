# 023 应用内提醒：计数同源与负空间扫描

> 决策与规则见 [ADR-0222](../../../adr/ADR-0222.md)。

## Problem

FW-018：运行完成与待处理只经 022 的分区与计数在应用内呈现；不发系统通知、不申请授权、不改标题
闪烁或程序坞徽章；不建第二份"未读"；系统通知/徽章后置。取证：pin 无通知包、源码无通知使用。

## Decision

- 侧栏"经营事项"加计数 chip（`#nav-matter-count`），与列表卡计数同源 `matterList.counts`、同一渲染趟；
  read 且 action>0 才显示，0/不可读恒隐藏。
- 负空间扫描断言（reminder-discipline.spec）：src 全树禁 Notification/requestPermission/setBadge/
  flashFrame/app.dock 等；renderer 禁 document.title= 等标题面改动——未来系统通知须先改测试。
- 契约禁字段形 unread；chip 文本==卡计数文本（数字同源）。
- chip/计数随每轮投影重渲；系统通知/徽章按 US-116 后置。

## Alternatives considered

- 独立未读 store：US-115 点名——否决。
- 标题/程序坞徽章：US-114 点名——否决。
- 仅列表卡：回到应用任视图可见的要求——侧栏同源 chip 更贴题。
- 负空间只写散文：违反"知道要变成拦住"——写成扫描+变异验证。

## Consequences

- 两条验收机器断言齐（无通知 API/无独立未读）；全量 958→962；gate 25/25；电池 6/6。
- 已知未闭：真机未跑；系统通知/徽章/后台到达后置（届时区分已投递/已见）。
