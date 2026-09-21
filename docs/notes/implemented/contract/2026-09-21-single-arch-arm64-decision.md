# 出货架构正式定为 arm64-only（ADR-0149）

- 日期：2026-09-21
- ADR：[ADR-0149](../../../adr/ADR-0149.md)
- 工单来源：`.scratch/review/2026-09-20-deep-analysis-top20/tasks/DA-11-x64-universal-gap.md`

## Problem

LUTE 2.5.0 的 CHANGELOG 把 x64 缺口单列（`fs-ext` 的 darwin-x64 prebuild 不在场；补齐需
`MACOS_UNIVERSAL_NATIVE_ENTRIES` 与 `--dir --universal` 适配，「不阻塞本版，登记下轮」）。
这条「缺口」挂着不决策：没有适用范围、没有逃生路径、没有决策文——下一个人要处理它时得把调研重做一遍
（深度分析把它列为 TOP20 #11）。需要一次用户裁决：补 universal，还是把单架构写成正式决策。

## Decision

用户拍板「**只发 arm64**」，落地为 [ADR-0149](../../../adr/ADR-0149.md) 四条决策：出货架构 arm64-only；
适用范围与边界写清（Apple Silicon 新装、Intel 不在范围、不经 Rosetta）；**逃生路径预置**（若出现 Intel
消费方：`MACOS_UNIVERSAL_NATIVE_ENTRIES` 登记 fs-ext darwin-x64 prebuild + `--dir --universal` 适配，
验证面含 Intel 启动、fs-ext 加载与**运行时物化 + 接入 SDK 的 intel 兼容性**）；不触碰签名与发布口径。
CHANGELOG Unreleased 同步一条并指向 ADR（2.5.0 的历史条目保留为历史，其「登记下轮」由本 ADR 接住）。

## Alternatives considered

- **补 universal 构建**：否（本轮）——需要 Intel 对照机且要动打包链，而当前没有 Intel 消费方把它顶到前面；
  按逃生路径把成本与验证点写清后，它可以随时重启而不是被遗忘。
- **保持「缺口」叙事、不决策**：否——缺口不排期又不决策，下一个人要重新调研一遍（P-01 的形态）。

## Consequences

- 正面：「x64 缺口」变成有适用范围、有逃生路径的决策；CHANGELOG 不再每版重述。
- 代价（保留）：Intel Mac 本轮不受支持；universal 的重启成本（M 级 + Intel 对照）已预置在 D3。
- 后续：与 DA-15 相邻项（接入 SDK 与运行时物化的 intel 兼容性）互为前提，D3 的验证面已包含后者。
