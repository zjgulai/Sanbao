# DA-17 · 基线类清单例行体检（theme-tokens / dead-instruments / exemptions）

- 优先级：P2
- 状态：`open`
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
