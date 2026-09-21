# 2026-09-21 · newapp 降级标志的「挂起 ≠ 失败」收口（DA-21）

## Problem

DA-06 补读轮（2026-09-21）在活体故障现场读到一份**与事实相反**的读数：

```
<html data-dsh-newapp-degraded="entry-unavailable">
[newapp-local] the sidebar New Session button was not found … may have restructured the sidebar
```

而应用生命体征健康、真因是**屏幕休眠 11.1 h → 窗口不可见 → Chromium 冻结 rAF → 放置被暂停**。
`watchPlacement()` 在 3 秒宽限期后只看「入口行在不在」，不看「窗口看不看得见」；且宽限期是
一次性定时器，窗口恢复、入口行自愈归位之后**标志不会被清除**——误归因 + 陈旧假警两个缺陷叠加。

受害面是所有把该标志当读数的验收轮（DA-06 的实机读数轮即被污染）——P-04 的形态：
以「可被探针读取」为设计目的的自报标志，在合盖/锁屏/窗口被盖住这类常见场景里说假话。

## Decision

`packages/surfaces/dsh-newapp-local/src/client/index.ts` 的 `watchPlacement()` 重写为三态判定：

- **隐藏 → 暂停**：宽限期到点若 `document.hidden` 则既不报、也不重新武装（不对休眠显示器轮询）；
- **恢复可见 → 短宽限**：`visibilitychange`（监听在 `document` 上）后以 1200ms 重判，
  给 rAF 一帧的时间；
- **迟到归位 → 清标志**：报出降级后挂 `document.body` 观察者，见到入口行即
  `reportDegraded(undefined)` 并拆除全部监听；
- **可见 + 宽限过后仍无入口行 → 照旧响亮降级**（不许用拉长宽限期掩盖问题）。

## Alternatives considered

- 拉长 `PLACEMENT_DEADLINE_MS`：只推迟误报，还把真改版的发现时间一起推迟（工单明令禁止）。
- 只靠 `visibilitychange`、不挂 MutationObserver：慢启动场景下（可见之后才放置、期间无可见性变化）
  清不掉标志。
- 把判据搬进共享层：共享层知道「怎么放」，**只有消费方知道「没放上算不算失败」**（ADR-0019 口径）。

## Consequences

- **实现期被测试抓到一个真错**：第一版把 `visibilitychange` 监在 `window` 上——事件在 `document`
  派发且**不冒泡**，window 上的监听永远不会触发（用例 `gives the restored visibility a grace period…`
  直接判红）。修法 = 监在 document。
- **测试夹具的状态泄漏会挂死套件**：插件装的是 document 级监听与观察者。此前用例结束后不释放，
  遗留的观察者把状态带进下一个用例，`vitest` 跑满 CPU 而不出结果（实测 20+ 分钟 94% CPU）。
  修法 = 夹具 `afterEach` 统一执行 effects 的 disposer。
- 判据读数：`vitest run tests/sidebar-entry-stacked.spec.ts` **12/12 通过**（新增三条用例：
  hidden 不报 / 恢复给宽限再判 / 迟到归位清标志）；反向突变（把 `evaluate` 改成恒不降级）时
  「必须报」的两条用例判红——两个方向都能说「不」。
- 装载点已同步（`~/.dsh/profiles/desktop/node_modules/dsh-newapp-local`，旧副本备份在
  `/tmp/da21-loadpoint-backup/`）；门禁 quick 119/123，唯一红是并发会话的 4 处 bundle 漂移
  （本切片顺带消掉其中 1 处：newapp 的旧构建）。
- **未验收（如实）**：实机读数——需 app 带 `--remote-debugging-port=9333` 重启并在可见屏幕下复跑
  `node scripts/acceptance/singleton-count-live.mjs`（期望 `entry-newapp=1`、exit 0），与 DA-06 的
  绿读数同批欠着。
- 详见：[ADR-0153](../../../adr/ADR-0153.md)
