# DA-17 · 基线类清单例行体检（theme-tokens / dead-instruments / exemptions）

- 优先级：P2
- 状态：`done`（2026-09-21 发布窗口体检已完成；例行检查仍按后续窗口执行）
- 依赖：无
- 估算：S
- 来源：仓库治理现状；报告 TOP20 #17

## Problem

三个「好状态」需要有人推着清、并防止回涨：
- `scripts/gates/exemptions.json = []`（零豁免——历史里程碑，新增任何一条都是治理事件）；
- `scripts/gates/dead-instruments.json` 已有 3 类已证伪仪器（pgrep / mdfind / AXScrollArea）——该登记簿只应增加**实测过**的条目；
- theme-tokens 存量基线（`scripts/gates/theme-tokens-baseline.json`）「只减不增」，但只在 `gate:full` 里跑。

## 动作

1. 每个发布窗口跑一次 `pnpm run gate:full`，读三项读数并记录（theme-tokens 存量数 / 豁免数 / 死仪器数）；
2. theme-tokens 存量条目逐次清理（每次改动顺带几条）；
3. 若出现「给豁免续期或新增」的压力：按 ADR-0014 走治理评审，不得静默。

## 验收

- 窗口记录三条读数（含日期）；
- theme-tokens 基线条目数单调下降或持平（不得回涨）；
- 豁免保持 0（或新条目带 owner/deadline 且被 `exemptions-frozen` 接受）。

## 注意

quick 模式不跑 theme-tokens；「推送前跑 gate:full」不是仪式（P-53 正是它抓到的）。

## 本窗口结算（2026-09-21）

在主树 `274e793` 运行 `pnpm run gate:full --json`，原始输出保存在本机
`/tmp/sanbao-integration-baseline.JAnx4K`。整体 exit 1（124 pass / 3 skip / 4 fail），
不能以本项通过冒充全仓通过；其中本任务的五项判据均为 pass、violations 为空。

| 判据 | 本次读数 | 与 HEAD 比对 |
| --- | --- | --- |
| theme-tokens / theme-tokens-baseline-frozen | 基线 6 条；均 pass | 原样持平，没有新增 |
| exemptions-frozen | 豁免 0 条；pass | 原样持平 |
| dead-instrument / dead-instrument-selftest | 已登记 5 类；扫 864 文件、26192 行判据面；均 pass | 登记簿原样持平 |

逐项读取三个 JSON 登记簿，并与 `git show HEAD:<路径>` 比较，三份内容均相同。
没有新增豁免、续期或伪造死仪器证据；其他失败由本批集成收口单独跟踪。
