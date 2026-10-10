# Host 生命周期失效接线：观测只服务于同一活跃 epoch

- 日期：2026-10-11
- 决策：[ADR-0294](../../../adr/ADR-0294.md)
- 状态：已实施（纯函数 + 闭包守卫 + 门禁事实）；UI 投影面陈旧行为与自动重组合登记未闭。

## Problem

启动时组合一次的 runtime inventory 观测持续喂准入链；宿主 epoch 死亡/移动（runtime-invalidated → generation 自增、kind 转 unavailable）后旧观测仍在服务。三张 ADR 登记此后续票。

## Decision

1. 纯函数 `isInventoryObservationCurrent(evidence, snapshot)`：active + bootId + runtimeGeneration 逐字段相等。
2. 观测闭包在返回前读活快照调用之；不匹配即 undefined。
3. 按请求比较（不做事件订阅竞态补救）；UI 投影面与自动重组合登记未闭。

## Alternatives considered

- 事件订阅失效 / 自动重组合 / 检查进各步骤——见 [ADR-0294](../../../adr/ADR-0294.md) 备选表。

## Consequences

- 宿主 epoch 失效后准入链立即以 undefined 对待——与活 `runtimeEffective` 检查共同保证「同一 epoch 的完整事实或诚实不可用」。

## Verification

证据（2026-10-11，全部真实执行；未跑的照实写）：

- **纯函数 spec**：`test/runtime-inventory-currency.spec.ts` **3/3**——同活跃 epoch 接受；generation 移动或 boot 不同拒绝；三种 unavailable reason 一律拒绝。
- **门禁自测**：`node --test scripts/gates/sage-route-authority.test.mjs` **51/51**（新增：闭包守卫调用 pin + 三条件（kind/bootId/generation）各一条具名突变）。
- **typecheck**：0。
- **全量套件**：218 文件 / 1917 通过 / 1 skip（exit 0）。
- **门禁**：`pnpm run gate` 32/32（objects 319/319，exit 0）。
- 未运行：真机 epoch 失效演练（纯函数与守卫接线由 spec + pin 覆盖）。
