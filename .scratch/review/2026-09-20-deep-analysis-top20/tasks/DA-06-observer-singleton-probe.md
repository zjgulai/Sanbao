# DA-06 · observer 乒乓最小探针：单例计数进可执行判据

- 优先级：P0
- 状态：`local-done`（2026-09-21 补读轮：探针改版已落盘；实机绿读数待窗口可见，见结算）
- 依赖：无
- 估算：M
- 来源：docs/pitfalls-playbook.md P-52；报告 TOP20 #6

## Problem

P-52 诚实划界原文：「observer 乒乓**没有专属门禁**拦（运行时竞态无法静态判出），目前靠共享层不变量注释 + 技能内签名卡，这是缺口不是成绩。」
事故教训：三方诊断 40 小时，其中一位助手拿对了机制类别但没去数 `document.querySelectorAll('[data-dsh-workbench-container]').length`——`=== 2` 一个读数就能暴露挂载竞态；「探针代码内打点同样被饿死」导致「探针没输出」被误读成「代码没执行」。

## 动作

1. 把「关键单例元素计数」固化为**可执行探针**（旁路通道：铸 cookie + 独立 Chrome + 预启用 Debugger，见 `~/.agents/skills/dsh-desktop-diagnostics/SKILL.md`），至少覆盖 workbench 容器与已知单例 marker；
2. 探针进 `scripts/acceptance/` 家族（或技能内脚本目录），并在实况验收路径中被复用；
3. 把「单例计数」写进共享层 observer 不变量注释的读数指引（改 observer 前先数单例）。

## 验收

- 重复挂载场景下探针能报出 `count === 2`（用可控夹具制造）；
- 探针在应用正常态读数为 1 且退出码 0；
- 探针本身登记进 dead-instruments 登记簿（防退化），并有「读不到 → 明确报错而非静默」。

## 注意

运行时竞态无法静态判出是设计性边界——不要把「不可能全静态」当借口不落最小机制。

## 结算

**2026-09-21（补读轮）**。批 A 首次结算时本单按「探针已落 + 自检成对」入库，实机绿读数一栏留空；本轮补读的结果分三段：探针改版已落盘、实机读数在**故障现场**上取证、绿读数因机器状态仍不可得。

### 1. 探针改版（已落盘，`scripts/acceptance/singleton-count-live.mjs`）

- **单例清单换面**：`workbench-container` / `workbench-group` 随折叠组退役（2026-09-20）已从产品退出——运行中的 plugin bundle（`/plugins/??…&rev=03ddf764f599`，11.8 MB）里两串**各 0 次命中**（`grep -o … | wc -l` 读数）；继续数它们只会得到恒定假红。现役单例面 = 入口行族：`entry-newapp` / `entry-role-matrix`（各恰好 1）+ `entry-taskboard` / `entry-ssh` / `entry-skill-center`（各至多 1）+ `settings-shell-root`（至多 1）。
- **新增 `window-hidden` 类仪器不可用**：旧版把「rAF 冻结 → 放置挂起」误报成 `[not-mounted] 本包未装载`（见 §3 故障现场）。新版先读 `document.hidden`，不可见即 exit 2 点名「挂起而非失败、读数无效、切到可见后重跑」。
- 共享层 observer 不变量注释的读数指引同步换面（`shared/client/sidebar-entry-core.ts` + 2 副本，`node scripts/sync-shared.mjs` 26 消费方一致）。

### 2. 读数（真实输出）

自检（12 状态 / 21 断言）与恒真桩突变（两条新闸门各自红）：

```text
$ node scripts/acceptance/singleton-count-live.mjs --self-test
✓ 单例计数探针射程自检：12 个状态、21 条断言，全部按预期红/绿/typed unavailable。
exit=0

$ sed 's/if (hidden === true) {/if (false) {/' …singleton-count-live.mjs > /tmp/mut-hidden.mjs && node /tmp/mut-hidden.mjs --self-test
✗ 「窗口不可见（hidden=true）→ typed unavailable(window-hidden)」应 typed unavailable(window-hidden)，却放行（visibilityState=hidden）
exit=1

$ sed 's/if (spec.expected !== undefined && count === 0) {/if (false) {/' …singleton-count-live.mjs > /tmp/mut-notmounted.mjs && node /tmp/mut-notmounted.mjs --self-test
✗ 「必需单例数到 0（本包未装载）→ typed unavailable，不是通过」应 typed unavailable(not-mounted)，却给出了判决
exit=1
```

实机读数（应用在跑、CDP 9333 在线；**这是诚实读数但不是绿读数**）：

```text
$ node scripts/acceptance/singleton-count-live.mjs --port 9333
[exit 2 · 仪器不可用] [window-hidden] 窗口不可见（visibilityState=hidden）——屏幕休眠/锁定或窗口被完全遮挡时
Chromium 冻结 rAF，放置驱动的入口注入被挂起而非失败；此时的 0 不是「未装载」，读数一律无效。
把窗口切到可见（唤醒屏幕）后重跑。
exit=2
```

### 3. 故障现场（为什么绿读数不可得，以及它换来了什么）

机器状态（读数齐备）：`ioreg HIDIdleTime` ≈ 11.1 h（无物理输入）；`pmset -g assertions` 无 `PreventUserIdleDisplaySleep`；CDP 双渲染面 `document.hidden=true`、rAF 2.5 s 超时未跑；`[data-dsh-newapp-entry]=0` 且 `<html data-dsh-newapp-degraded="entry-unavailable">` 在场；宿主运行时活着（日志持续写入，系统未休眠）。

因果链：**屏幕休眠/锁定 → 窗口不可见 → Chromium 冻结 rAF → 共享层 `schedulePlace` 的放置被挂起 → 所有 rAF 驱动的侧边栏注入静默缺席**。应用本身健康（启动生命周期 `startup.run.completed`、SPA 渲染完整、窗口按 `main-window-state.json` 的 1376×951 建好）。

换来的三个事实：① 探针在真故障现场上完成了「错误归因 → 正确归因」的回归取证（旧 `[not-mounted]` → 新 `[window-hidden]`）；② newapp 的降级文案在此现场**误报**为「New Session 按钮找不到 / 侧边栏可能改版」，且窗口恢复可见后会自愈归位、但标志不清除 → 立 **DA-21** 工单；③ 本机旁路仪器三件套对「窗口可见性」**全部失明**——`System Events count windows` 对所有应用（含对照实验：新开的 TextEdit 窗口）恒 0、`CGWindowList`（JXA）恒空、`screencapture` 全黑；「0 windows」曾被误读为「进程没有窗口」，实际是仪器不可信（判据先证明自己看得见）。

### 4. 遗留（明确不勾）

- **实机绿读数**（验收第 2 条）待窗口可见时一条命令补齐：屏幕唤醒后 `node scripts/acceptance/singleton-count-live.mjs --port 9333`，期望 `exit=0` 且 `entry-newapp=1 / entry-role-matrix=1`。
- 清单中两个「恰好 1」的实机确认同样待绿读数轮：`entry-role-matrix` 的入口在正常态是否无条件在场（profile 已装该包、bundle 已装载是现有证据，但未见其真正落位）。
- 探针未进 `dead-instruments.json` 的既有条目关系不变（该登记簿守的是「仪器别退化」；本探针的读不到路径已在 §1 的类型化里收口）。

## 实机绿读数（2026-09-23，DA-34 会话）

`node scripts/acceptance/singleton-count-live.mjs --port 9333` → **exit=0，单例判据 6/6 过**：

- `entry-newapp=1`（期望 1）✓
- `entry-role-matrix=1`（期望 1）✓
- `entry-taskboard / entry-ssh / entry-skill-center / settings-shell-root` 各 0（条件单例未挂载，正常）✓
- 窗口可见（`document.hidden=false`）——硬前置满足。

读数环境：app 带 CDP 重启（`relaunch-dsh-cdp.sh`，09:39 启动，lifecycle healthy
15.5s），同机 load≈12（Kaspersky + 后台 gate:full 竞争）。本单验收第 2 条达成。
