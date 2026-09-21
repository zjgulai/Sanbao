# DA-21 · newapp 降级文案的误归因与陈旧标志（窗口不可见 ≠ 侧边栏改版）

- 优先级：P1
- 状态：`local-done`（2026-09-21 批次 E 结算：`09f1c08`；实机读数待窗口可见，见结算 §5）
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

## 结算（2026-09-21，批次 E；提交 `09f1c08`，ADR-0153）

**修法按工单注意项执行：语义是「挂起 ≠ 失败」，没有拉长宽限期；真改版仍然响亮降级。**

### 1. 语义拆分（`watchPlacement()`）

- **隐藏 → 暂停**：宽限到点若 `document.hidden` 则既不报降级、也不重新武装定时器
  （不对休眠显示器轮询），等可见性变化再判。
- **恢复可见 → 短宽限**：`visibilitychange`（监听在 **`document`**）后以 1200ms 重判，
  给 rAF 一帧的时间。**实现期被测试抓到一个真错**：第一版把监听挂在 `window` 上——
  `visibilitychange` 在 document 派发且**不冒泡**，window 上的监听永远不会触发；
  新用例 `gives the restored visibility a grace period…` 直接判红。
- **迟到归位 → 清标志**：报出降级后挂 `document.body` 观察者，见到入口行即
  `reportDegraded(undefined)` 并拆除定时器 / 观察者 / 可见性监听——标志不得比它的条件活得久。
- **可见 + 宽限过后仍无入口行 → 照旧响亮降级**（报 `entry-unavailable` + `console.warn`）。

### 2. 判据（`tests/sidebar-entry-stacked.spec.ts`）

- 三条新用例：`stays silent while the document is hidden`、`gives the restored visibility a
  grace period before judging`、`clears a flag it already raised once a late placement lands`；
  文件 **12/12 通过**（`npx vitest run tests/sidebar-entry-stacked.spec.ts`）。
- **红绿成对**：RED 用旧实现跑三条新用例 → 三条全部违背预期（stderr 三次 「restructured the
  sidebar」告警、恢复宽限用例断言失败）；GREEN 换新实现 → 12/12。
- **恒真/恒假两个方向都能说「不」**：反向突变（`evaluate` 改成恒不降级）→「grace period」与既有
  「shell never renders 要说出来」两条判红（2 failed）；正向由 hidden 用例守住。
- **顺带修掉夹具的状态泄漏（真故障）**：插件装的是 document 级监听与观察者，用例结束不释放会把
  状态带进下一个用例——实测 vitest 跑满 CPU（94%）20+ 分钟不出结果、也不退出。修法 =
  `afterEach` 统一执行 effects 的 disposer（`appliedDisposers`）。

### 3. 装配与门禁

- 重新构建 `lib/client.js`（该产物不进 git，交付面在 profile）+ 同步装载点
  `~/.dsh/profiles/desktop/node_modules/dsh-newapp-local`；旧副本备份在
  `/tmp/da21-loadpoint-backup/client.js.bak-20260921`。
- 门禁 quick **119/123**：唯一红是并发会话的 4 处 bundle 漂移（本切片顺带消掉其中 newapp 的旧构建）；
  `changed-packages` 6/6、adr 三口判据与 docs-link-integrity 全绿。

### 4. 验收对表

| 验收项 | 读数 |
| --- | --- |
| 三个用例各自红绿成对（含恒真桩突变红） | ✅ RED（旧实现 ≥3 条违背）→ GREEN 12/12；反向突变 2 红 |
| 实机：休眠 → 唤醒后 `data-dsh-newapp-degraded` 不出现或已清除 | **未读**（见下） |
| 实机：`singleton-count-live` 读到 `entry-newapp=1`（exit 0） | **未读**（同下） |

### 5. 未验收（如实，与 DA-06 同批）

两条实机读数都要求 **app 带 `--remote-debugging-port=9333` 重启且屏幕可见**（窗口不可见时
Chromium 冻结 rAF，读数本身无效——这正是本单的题面）。不能在会话内触发重启（会连带杀掉当前会话），
由用户双击 `scripts/acceptance/Restart-DSH-CDP.command` 后补跑：

```bash
node scripts/acceptance/singleton-count-live.mjs   # 期望 entry-newapp=1、exit 0
```

唤醒后还应顺带确认 `<html>` 上没有 `data-dsh-newapp-degraded`（或它已被清除）。
