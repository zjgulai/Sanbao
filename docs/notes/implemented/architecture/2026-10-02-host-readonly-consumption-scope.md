# 050 的停点与解封：把只读基座事实的消费家钉在宿主进程，并给它配一张登记处

- 状态：implemented（隔离工作树 `qoder/ui-wiring`@`6654d75` 已实现并通过自验，未提交）
- 关联：工单 `docs/tickets/050-*`（仓外设计集）、[ADR-0198](../../../adr/ADR-0198.md)、[ADR-0174](../../../adr/ADR-0174.md)、[ADR-0179](../../../adr/ADR-0179.md)、[ADR-0184](../../../adr/ADR-0184.md)

## Problem

工单 050 的实现（Host 窄桥只读基座方法刀）在上一轮被 `gate:sage-product-boundary` 判红并因此收回存档：门禁对 `apps/sage-shell/src/**` 一律词法禁 `ctx.get(`，而这把刀要在 booted 的 Cordis 容器里读 `settingsController`。停手的原因不是做不到，而是"越界即停"——不许用放宽门禁换绿灯。

本轮把三条候选路线逐条取证后，事实与最初的判断不同：

1. **"换承载位置"免不掉门禁**：`gate:sage-service-consumption` 的 selftest 断言"Sage 扫描不得进入 `packages/`"，说明"包可以消费、壳不行"是有意设计；但组合进 profile 的插件**没有现成通道**把结果送进 Electron main——壳的 host 路由表是自建常量，`handler.ts` 只是 9 行接口，`COMPOSED_PACKAGES` 恒为空。新造通道等于写一条从没跑过的管道。
2. **`src/host/` 就是 Cordis 宿主进程**：它 import `Context` 并 `boot()` 整个 profile。对它禁 `ctx.get(` 并不能保护渲染面，只会把宿主进程变成读不了自己容器的空壳。真正要退场的是 P0-2 产品适配层，而 `composer-adapter`/`composer-view`/`streams`/`product/state.ts` 仍在 `RETIRED_FILES` 里逐条守着。
3. **仓里本来就有放行机制**：`scripts/gates/sage-service-consumption.json` 就是"新消费点随提交登记"的登记处，四向对账 + selftest 齐备；此前对本壳**空转**，因为词法禁令让登记毫无意义。

## Decision

按"缩窄射程 + 登记即许可"落地（细节见 ADR-0198 的 D1–D4）：

- `sage-product-boundary` 的 `ctx.get(` 词法禁**只跳过** `apps/sage-shell/src/host/**`；`product`/`main`/`appservice`/`profile` 照旧一律禁。
- `src/host/**` 的消费必须登记进 `sage-service-consumption.json`（本票：`host/readonly-bridge.ts → settingsController`），由该门禁的四向对账守着。
- 两条 selftest 的钉子同步改成双向，并且**不得只测绿**：边界侧新增"host 消费不再红 + main/appservice/profile 仍红"，消费侧把"0 个消费文件"改成"登记条数 == 实际消费文件数"并加"真实登记处必须在严格模式下通过"。
- 050 的实现从存档原样回贴（`git apply --3way` 自动合并 v4→v5 协议面），并按 v5 的 `ready` 事件补上 `runtimeEffective` 观测字段。

## Alternatives considered

- **把 provider 装进 `packages/` 插件、壳零改动**：否决。没有 carrier；且会把"谁读基座"拆成两个家。
- **不改门禁，改由 fixture 提供基座事实**：否决。归位不等于接线，生产仍读不到。
- **整条删掉 `ctx.get(` 检查**：否决。只跳过 `src/host/**`，其余射程与 `RETIRED_FILES`、上游 token 检查全部保留。
- **顺带把写侧动作权限也登记掉**：否决。写侧属 §7 治理面，与"读基座事实"是两件事，不夹带。

## Consequences

- 050 与读侧票（010/012/013/017/026/030/031）解封；ADR-0190 的步骤 3–10 fail-closed 与写侧动作权限登记口径均未触及。
- 放行的守卫是双面的：新增未登记的 host 消费当场判红，登记的消费被删则陈旧条目判红。
- 已知边界：登记处目前只有对账判据、没有人审批流程；若 host 侧消费膨胀，应收紧到逐端点白名单登记（本票的 `READONLY_BRIDGE_ENDPOINTS` 是该形态的最小样本）。
- 复跑读数（2026-10-02，基线 `6654d75`）：本票三文件 24/24；全量套件与 gate 读数见仓外 `docs/tickets/LOOP.md` §6 的 050 行。
