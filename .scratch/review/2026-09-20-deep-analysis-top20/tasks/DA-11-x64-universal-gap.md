# DA-11 · x64 / universal 构建缺口补齐（或记录单架构决策）

- 优先级：P1
- 状态：`done`（2026-09-21 结算，随本批提交入库）
- 依赖：用户裁决（单架构 or universal）
- 估算：M
- 来源：CHANGELOG 2.5.0「x64 缺口单列」；报告 TOP20 #11

## Problem

2.5.0 CHANGELOG 原文：「出货架构声明 **arm64**。x64 缺口单列：`fs-ext` 的 darwin-x64 prebuild 不在场，补齐需 `MACOS_UNIVERSAL_NATIVE_ENTRIES` 与 `--dir --universal` 适配，**不阻塞本版**，登记下轮。」
即：当前出货产物只覆盖 Apple Silicon；Intel 用户（或 Rosetta 场景）不可用，且这是**已登记但未排期**的事项。

## 动作

1. 用户裁决：补 universal 构建 vs 明确「只发 arm64」为正式决策；
2. 若补：按 CHANGELOG 指出的两个变量/参数适配，重点验证 `fs-ext` 的 x64 prebuild 在场与加载；
3. 若只发 arm64：立一篇 ADR 记录单架构决策（含适用范围与逃生路径），替代默认的「缺口」叙事。

## 验收

- universal 方向：`--dir --universal` 产物在 Intel 机（或等价对照）可启动，`fs-ext` 功能可用；
- 单架构方向：ADR 入库、CHANGELOG 相应表述更新为「决策」而非「缺口」。

## 注意

接入 SDK（DA-15 相邻）与运行时物化的 intel 兼容性一并核对，别只测壳。

## 结算（2026-09-21，方向 = 只发 arm64）

- 用户裁决：**只发 arm64**，立 ADR 把「缺口」转成「决策」——`docs/adr/ADR-0149.md`（含适用范围与逃生路径），
  CHANGELOG Unreleased 同步一条并指向 ADR；2.5.0 的历史条目按惯例保留为历史（其「登记下轮」由 ADR-0149 接住）。
- 逃生路径（若出现 Intel 消费方时按此重启，不白做）：① `MACOS_UNIVERSAL_NATIVE_ENTRIES` 登记 `fs-ext` 的 darwin-x64
  prebuild；② `--dir --universal` 适配；验证面 = Intel 机启动 + `fs-ext` 加载 + **运行时物化与接入 SDK 的 intel 兼容性**
  （ticket 注意：别只测壳）。
