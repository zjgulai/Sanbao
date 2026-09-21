# DA-21 · newapp 降级文案的误归因与陈旧标志（窗口不可见 ≠ 侧边栏改版）

- 优先级：P1
- 状态：`open`
- 依赖：无（修法需先落「挂起 ≠ 失败」语义；实机验证需可见窗口）
- 估算：S
- 来源：DA-06 补读轮的活体故障现场（2026-09-21）

## Problem

`packages/surfaces/dsh-newapp-local/src/client/index.ts` 的 `watchPlacement()` 在 3 秒宽限期
（`PLACEMENT_DEADLINE_MS`）后只看一件事：`document.querySelector('[data-dsh-newapp-entry]')`
是否已存在；不存在即 `reportDegraded('entry-unavailable')`，并打日志断言
「the sidebar New Session button was not found … This shell generation may have restructured
the sidebar」。

但放置是 **rAF 驱动**的（共享层 `schedulePlace` → `requestAnimationFrame`），而**窗口不可见时
Chromium 冻结 rAF**：屏幕休眠/锁定、窗口被完全遮挡都会命中。此时放置是**被挂起而非失败**——
窗口恢复可见后入口行会自动归位。实机证据（2026-09-21，屏幕休眠 11.1 h、应用生命体征健康）：
`<html data-dsh-newapp-degraded="entry-unavailable">` 与上述日志文案齐备，而真因是 rAF 冻结；
且宽限期是一次性定时器，**窗口恢复后入口行挂上了标志也不会清除**——误归因 + 陈旧假警。

这是 P-04（症状层修复 / 错误归因）形态：一个以「可被探针读取」为设计目的的自报标志
（`packages/surfaces/dsh-newapp-local/README.md` §降级自报）在常见场景（合盖/锁屏/窗口被盖住）里说假话，
会污染所有把它当读数的验收轮（DA-06 的实机读数轮就踩到）。

## 动作

1. 语义拆分：宽限期到点时先看 `document.hidden` —— 不可见 → 重新武装（挂起，不报降级）；可见仍未放置 → 才报 `entry-unavailable`；
2. 迟到放置要能清标志：复查改成「观察到入口行即 `reportDegraded(undefined)`」，覆盖「先挂起、后可见、再归位」的完整序列；
3. 恢复可见瞬间给一档宽限（rAF 尚未跑到不算改版），避免抢跑误报；
4. TDD 扩展 `tests/sidebar-entry-stacked.spec.ts` 的降级用例：hidden 挂起不报 / 迟到归位清标志 / 真改版（可见 + 无入口）仍报。

## 验收

- 三个用例各自红绿成对（含恒真桩突变红）；
- 实机：屏幕休眠 → 唤醒后 `data-dsh-newapp-degraded` 不出现或已清除，且
  `node scripts/acceptance/singleton-count-live.mjs` 读到 `entry-newapp=1`（exit 0）。

## 注意

语义是「挂起 ≠ 失败」——别把宽限期整体拉长来掩盖问题；真改版必须仍然响亮降级
（ADR-0019 的自报机制不许变哑）。
