# 单例探针换面 + window-hidden：把「放置被挂起」与「未装载」分开（ADR-0148）

- 日期：2026-09-21
- ADR：[ADR-0148](../../../adr/ADR-0148.md)（D5 的补读轮）
- 工单来源：`.scratch/review/2026-09-20-deep-analysis-top20/tasks/DA-06-observer-singleton-probe.md`（补读轮）、
  `DA-21-newapp-degrade-false-positive.md`
- 复核者：本会话（lute 拍板「同意把 DA-06 补了」）

## Problem

批 A 交付的实机单例探针（`scripts/acceptance/singleton-count-live.mjs`）在补读轮里暴露两个问题：

1. **清单在数不存在的东西**：它数 `[data-dsh-workbench-container]` / `[data-dsh-workbench-group]`，
   而这两个标记随折叠组退役（2026-09-20）已从产品退出——运行中的 plugin bundle
   （`/plugins/??…&rev=03ddf764f599`，11.8 MB）里两串各 0 次命中。继续数它们，正常态也只会得到恒定假红。
2. **「读不到」的归因是错的**：屏幕休眠/锁定或窗口被完全遮挡时 Chromium 冻结 rAF，放置被
   **挂起而非失败**——旧版把这种状态的 0 报成「not-mounted 本包未装载」。这正是 P-04 形态
   （症状层归因），也正是本单要防的那类错误读数。

故障现场（2026-09-21 补读轮实机）：`HIDIdleTime` ≈ 11.1 h、`document.hidden=true`、rAF 2.5 s 超时未跑、
`[data-dsh-newapp-entry]=0` 且 `<html data-dsh-newapp-degraded="entry-unavailable">` 在场、
宿主运行时活着（日志持续写入、系统未休眠）——应用健康，只是窗口不可见。

## Decision

- **换面**：探针改数**入口行族**——`entry-newapp` / `entry-role-matrix` 各恰好 1；
  `entry-taskboard` / `entry-ssh` / `entry-skill-center` / `settings-shell-root` 各至多 1
  （族成员装不装随 profile 装配而定，重复才是 bug）。
- **新增第三类 typed unavailable `window-hidden`**：判决前先读 `document.hidden`，不可见即 exit 2
  点名「挂起而非失败、读数无效、切到可见后重跑」；可见性读数缺失/非法同样 typed 化（P-15）。
- **共享层读数指引同步换面**（`shared/client/sidebar-entry-core.ts` + 2 副本，`sync-shared --write`）；
  pitfalls-playbook P-52 的探针段与「下一版默认动作」同步更新到现状。
- **app 侧发现另立工单 DA-21**：newapp 的降级标志在同一现场把 rAF 冻结误报成「侧边栏改版」，
  且窗口恢复后不自清——不属于本单修法，登记待办。

## Alternatives considered

- **保留 workbench 标记、只加注释说明**：拒绝——假红会持续污染每一轮实机验收，注释救不了仪器。
- **`window-hidden` 时照常给判决（把 0 当 not-mounted）**：拒绝——「时钟没走被读成对象没动」的翻版
  （P-54 同族），且会把放置挂起误导成装载缺陷。
- **只改探针、不动共享层注释与 playbook**：拒绝——同一事实会出现第二、第三个家，而它们已经在说谎。

## Consequences

- 探针自检 12 状态 / 21 断言；两条新闸门（visibility / not-mounted）各有恒真桩突变判红取证。
- 实机读数在故障现场上完成「错误归因 → 正确归因」的回归：`[exit 2 · window-hidden]`（诚实读数，不是通过）。
- **绿读数仍欠**：需窗口可见（屏幕唤醒）时一条命令补齐
  （`node scripts/acceptance/singleton-count-live.mjs --port 9333`）；在那之前 DA-06 维持 `local-done`。
- 若 `entry-role-matrix` 在正常态并非无条件在场，按 DA-06 结算 §4 的方式修正清单——不许放宽判据。
