---
title: 113 条 pending 全量分级侦察（可装配/需 provider/自然条件/无落点）
doc_type: process
module: sanbao-integration
topic: pending-sweep-113
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 113 条 pending 全量分级侦察

## Problem

Loop-Q 推进至 85 implementing 后，剩余 113 pending 需要一次全量分级，避免后续批次在「需 provider」的行上空转。

## Decision

四分区只读侦察（会话与产物族 / 弹层与知识族 / 设置 51 行 / P 族余量）+ 合成。判据（写入侦察提示词）：**assemblable-now 仅在仓内已有真实机器（route/provider/spec）可消费时成立**；有机器但生产被读策略阻断者只允许壳 + 诚实不可用形；需自然条件的不得制造。

## 分级读数（按实际 pending 口径，113/113 全覆盖）

- **assemblable-now 31**：O02.files.menu + O02/O04/O12/P12/P15/S03–S07/S09/P13 伞 + P06 的 11 个叶入口（computer-control/connections/extensions/hooks/import/memory/mobile/network/pet/security/task-monitor + profile.entry/default）+ A04/A05/M03/M05 伞。
- **needs-provider 70**：知识/站点余量、市场详情/搜索/排序、设置 50 行主体（各 provider/authority 依赖已在逐行证据）。
- **needs-natural-condition 6**：M04/O06/O14/S11/S12/S13（限流、SSH、退出与会话失败等自然条件）。
- **no-landing-candidate 6**：OBS04 theme/text-size/ui-scale（ADR-0283 N/A 已裁）、P06 experiments/playground、P06 伞整体（受 50 叶牵制）。

## 建议前三批（侦察合成）

1. **R13 收口批**（在飞）：files.menu.open + O02 伞（唯一「在飞 + 关伞」双满足）。
2. **T07 会话控制批**：S03/S04/S05/S06/S07 五伞——approvals/plans/model-queue/run-monitor/pending-inputs 五台机器已在 main；壳 + 诚实不可用等待，queued/retrying/blocked 只自然验证。
3. **T09 产物与工具结果批**：A04/A05/M03/M05/P12 五伞——artifact-preview/tool-results/terminal 三台机器；窗口/全屏叶需 caller-binding 补全入批（见警示 4）。

**第四批备选**：settings 叶导航 11 行（SETTINGS_LEAF_IDS 恰 11 id，机器在 /.sage/state 生产可读）。

## 一致性警示（7 项，进对应批次前必须处理）

1. O04（matter-admin/matter-groups）判 assemblable，但矩阵两条路由为 violation/direct-provider-bypass——需补「admission 改造在批内」前提，与 S04/S09 口径对齐。
2. P15 与 S09 同骑 side-chats 机器，分类矛盾：以 S09 口径为准（admission 改造属批内）。
3. P13 伞骑 adopt/mutate，矩阵记 violation，而 ADR-0310 已把 create 落在 adopt 上并取证——扩至 mutate 叶前先裁定矩阵 violation 与 ADR-0310 谁是权威事实。
4. T09 批：`/.sage/artifacts/{window,fullscreen,close}` 仅 partial（local-main-with-partial-caller-binding）——窗口/全屏叶需补全 caller binding 才能入批。
5. 「task-monitor」三处同名面（settings 叶卡 / MonitorPage 四轴 / 观察的十四开关页）——落设置导航前先做命名消歧。
6. S05/S07/M03/M05 的 assemblable-now **仅指装配**：queued、blocked、图片解析等状态只能自然出现验证；行迁移只声明壳到位。
7. 侦察中 16 条已 implementing 行被分区重复列出（噪声），已按矩阵现状剔除；本记录仅覆盖 113 条真实 pending。

## 消费规则（2026-10-11 裁定）

警示 1/2/3 的读法按 [ADR-0315](../../../adr/ADR-0315.md) 与[裁定记录](2026-10-11-sweep-consumption-rulings.md)修订：assemblable 只指壳装配；route `currentAuthority` 是权威维度的唯一事实家；admission 收口一律独立成批（Q1/Q2）；P13 扩叶前置按 Q3 收缩。原文保留，引用时以消费规则为准。

## Verification

- 分级覆盖核验：113/113 pending 全覆盖（31+70+6+6）。
- 每条 verdict 附仓内证据指针（route 常量 / 文件路径 / spec）；明细在侦察 journal（会话内）。
- 本记录未改任何代码或矩阵行；消费方按批引用。
