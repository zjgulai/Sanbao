# DA-34 · 实机读数一次收口（DA-06 / DA-10 / DA-21 共用通道）

- 优先级：**P0**
- 状态：`open`
- 依赖：无（需要 app 带 CDP 重启且屏幕可见）
- 估算：S
- 来源：第一批三件 local-done 工单的共同欠账（DA-06/DA-10/DA-21 尾段记录）

## Problem

三个 local-done 工单都停在同一处：需要 app 带 CDP 重启且窗口可见的实机读数。欠账清单（第一批原文）：

1. **DA-06**：`singleton-count-live` 的 `entry-newapp=1`（observer 单例计数，绿读数待窗口可见）；
2. **DA-21**：唤醒后 `data-dsh-newapp-degraded` 缺席（降级标志「挂起 ≠ 失败」，`09f1c08`）；
3. **DA-10**：更新器在 app 内实际装载（检查 + 提示形态）。

这三件共用同一个会话前置（铸 cookie / CDP 通道 / 窗口可见），分三次做是三倍成本。
本批 DA-25（消融重版）与 DA-32（启动基线采样）也吃同一会话——**一次开机收五件**。

## 动作

1. 按挂死诊断纪律建旁路观测（预启用 Debugger、cookie 铸好），再重启 app（窗口可见）；
2. 一次会话顺序采集：启动时序采样（DA-32 用）→ 单例计数（DA-06）→ 唤醒降级标志（DA-21）→
   更新器装载（DA-10）→ 消融轮（DA-25，如本窗口做）；
3. 每件读数落回各自工单（本工单只记会话前置与执行记录，结论不在此复述——一份事实一个家）；
4. 三件 local-done 达成验收的，MASTER-TODO 状态改为 done。

## 验收

- 一次会话内五类读数全部采集完成，各自工单有原始读数；
- 无「重启后症状消失」类假象：读数时确认非喘息态（重试计数 attempt=1、看门狗零告警）；
- 第一批 MASTER-TODO 状态同步更新。

## 当前阻塞（2026-09-23 续跑）

实跑 `node scripts/acceptance/singleton-count-live.mjs --port 9333`：exit 2，
`[exit 2 · 仪器不可用] CDP 端口 9333 连不上（fetch failed）`。
独立 Chrome MCP 仅看到 JEV 文档页，不是 Sanbao 会话，不能替代本卡实机证据。
当前生命周期文件只有 22 行历史记录，末条时间 2026-09-21；本轮没有新启动样本。
未重启、唤醒或修改生产应用；需要用户确认可中断当前会话的重启窗口，
再按既有 relaunch-dsh-cdp.sh 执行。依赖本窗口的 DA-25/DA-32 不记通过。

## 注意

- 窗口可见是硬前置（window-hidden 闸门会拦读数，DA-06 已踩过）；
- 实机操作前保存现场（打开的会话/文档），别让生产环境为读数买单；
- 若某件读数仍拿不到：记录拿不到的**具体阻塞**（不是「待下次」），阻塞本身是要解决的对象。

## 会话执行记录（2026-09-23 窗口一）

前置：app 原未运行（最后启动 09-21 03:40 healthy），`relaunch-dsh-cdp.sh` 直接冷启动带
CDP（无退出步骤，零破坏）；GUI 就绪判据 = theme-live-gui 探针自检 exit 0。环境 load≈12
（Kaspersky + 后台 gate:full）。

| 件 | 读数 | 落账 |
| --- | --- | --- |
| 单例计数（DA-06） | exit=0，6/6：entry-newapp=1、entry-role-matrix=1、条件单例 0 | DA-06 实机绿读数段 |
| 唤醒降级标志（DA-21） | 休眠 15s→唤醒后 `data-dsh-newapp-degraded` 缺席（null） | DA-21 实机读数段 |
| 更新器装载（DA-10） | 装载达成（host 日志启动检查）；**真缺陷**：Helper execPath 解析 → 假 `current-not-lute` | DA-10 实机装载读数段 |
| 启动采样（DA-32） | 样本 1/5：15.5s healthy，host-boot 12.5s（负载窗） | DA-32 采样记录 |
| 消融轮（DA-25） | 未做——L 级矩阵需独立窗口（profile 副本 + 多轮摘包重启） | DA-25 仍 open |

非喘息态确认：单次冷启动 healthy（attempt 无关）；窗口可见（document.hidden=false）。
剩余：DA-32 样本 2-5（4 次重启，可延至 AV 安静窗）；DA-25 矩阵另行开窗。
