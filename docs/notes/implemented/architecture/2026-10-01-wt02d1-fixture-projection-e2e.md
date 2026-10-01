# WT-02D.1 · fixture / blocked 只读 E2E 与 route 收口

日期：2026-10-01 · 分类：architecture · 关联 ADR：[ADR-0184](../../../adr/ADR-0184.md)

## Problem

WT-02D.0.2 之后，main-owned `/.sage/*` 已具备 unavailable-first 骨架与步骤 2–10 typed 管道（[ADR-0179](../../../adr/ADR-0179.md) / [ADR-0181](../../../adr/ADR-0181.md)），但三件事未收口：① Application Service 的 **matter 投影槽**从未进入公开 shape——UI-02/03 的 `SageMatterViewState` 只被 renderer 静态模板消费，服务面没有任何 fixture/live 可判定的槽位，公开形状冻结（UI-01 前置）缺失；② 0.1 移交的 **Host 旧 `/.sage` handler 与 `SAGE_APP_SERVICE=off` 回退**仍在（`src/adapter/` 三件套服务 off 态），构成双 owner 残留——且该回退路径的实弹从未被真实验证过（0.1 验收 2 退回 spec 断言）；③ 无任何 fixture/blocked 只读 E2E 证明「fixture 与 live 同 shape、fixture 标识持续可见、production 缺 authority 仍 unavailable、无 store mutation / Adapter invoke」。

## Decision

用户三裁决（R1/R2/R3）+ 两个随票默认项，全部落地：

1. **R1 纯服务端**：本票不做 renderer 改造（payload 驱动渲染留 UI-01）；renderer 对新增 `matter` 字段零感知，两形守卫与 runtime/auth 消费不破。
2. **R2 并入删除**：Host 旧 handler 与 off 回退随票退场，main 成为 `/.sage/*` 唯一 owner（ADR-0174 第 1 条合同兑现）。删除面：`src/host/index.ts` 的 `'sage'` 分支与接线、`src/adapter/` 三文件（handler / capability-adapter / contracts）、传递性死代码 `src/product/state.ts`（唯一消费者随 adapter 退场）；`route-skeleton` 的 `shouldUseAppService(pathname, enabled)` 收敛为无开关 `isSageServicePath(pathname)`；`src/host/index.ts` 对 `/.sage` 与 `/.sage/*` 显式 `rejected`（防御纵深，绝不落到 asset 面）；`HOST_LIB_FILES` 与对拍守卫、host-entry/layout/fallback spec 同步。
3. **R3 双层 E2E**：服务级（`appservice-route-fixture.spec.ts`：真实 route 内核 + `createSageAppServiceProviders` 装配，fixture/生产两模式 + blocked 写路径）+ 真实 Electron 实弹（`sage-fixture-projection-window.spec.ts` + `support/sage-fixture-projection-probe.mjs`：真实窗口、真实协议、真实装配模块）。
4. **默认项**：fixture 进入机制 = `SAGE_FIXTURE_PROJECTION=1`（启动读一次）；`matter: SageMatterViewState | null`——fixture 模式填 `createSageFixtureViewState()`，production 稳定 `null`、**不构造 placeholder**（`matter` 必填字段不允许伪造空 matter）。
5. **单一装配点**：`src/main/app-service.ts` 抽出 `createSageAppServiceProviders`（main 每请求调用保持 viewState 新鲜；login/logout 闭包随之迁移）与 `resolveFixtureProjection(env)`——main 接线与实弹 probe 消费同一模块，「被测装配即生产装配」不再靠复制粘贴维持。
6. **门禁合同随票修订**（删面改变边界，门禁硬拦后由本票显式修订）：`sage-product-boundary` 四个退场文件由 REQUIRED 移入 RETIRED（防止回流）、`ctx.get(` 规则从「仅 adapter 目录合法」收紧为**全域禁止**（唯一合法消费者已退场）；`sage-service-consumption` 为 Sage scope 增加显式 `allowEmptyRegistry`（默认 false，legacy 保持非空纪律；两 selftest 各补负例：默认模式空登记仍判红、退场文件回流判红）；`collectConsumptionFiles` 对「index 中尚存、工作树已删」的文件优雅跳过（陈旧条目由对账闭环判红，崩溃不再冒充红——本票实测触发后修复）。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| renderer 一并改为 payload 驱动渲染（fixture→DOM 真端到端） | 否决（R1）；UI 技术选型（Wave 24 前置）未定，静态模板与模板标记继续有效，UI-01 统一消费冻结形状。 |
| 保留 off 回退到 D.2 或独立小票 | 否决（R2）；off 实弹从未被真实验证（「写了但从没跑到」），且回退通道与 ADR-0174 单 owner 合同相抵；pre-release 下 git revert 足够。 |
| 只做服务级测试 | 否决（R3）；「fixture 标识持续可见」与「零写入」需要真实窗口/协议读数，「仪器要过故障现场」。 |
| probe 内复制 main 的装配代码 | 否决；复制会漂移出第二份装配真相（一份事实只有一个家），抽 `app-service.ts` 后被测对象即生产对象。 |
| 直接清空 sage-service-consumption.json 并放宽 checker | 否决；非空纪律对 legacy scope 仍成立，改为显式按域开关（allowEmptyRegistry）并配双向负例。 |
| 删除 `src/product/state.ts` 之外的传递性死代码继续扩大清理 | 否决不扩面；本票只删由 route 收口直接造成的死面，其余不动。 |

## Consequences

- **真实读数（2026-10-01）**：sage-shell `node scripts/test.mjs run` **54 files / 533 tests 全 PASS**；`npm run typecheck` 0 error；`npm run smoke` **PASS**（Host 收口后全量冒烟通过）；仓根 `node scripts/gate.mjs` **25/25 通过**（含修订后的 sage-product-boundary / sage-service-consumption 及其 selftest）。
- **实弹 E2E 读数（真实 Electron 43.3.0，fixture 开关）**：`GET /.sage/state` 经真实协议返回 `matter.projectionSource=fixture`、`actionability=blocked`、`denialReason=fixture-only`、`service.status=unavailable`、`runtime=ready`、`auth=signed-out`；`POST /.sage/actions` 维持 typed denial（`identity-unavailable@identity-policy`）；文档 `data-projection-source="fixture"` 持续可见；指定 Sage root 快照**零条目**。**负控**：`SAGE_FIXTURE_PROBE_MUTATE=1` 写入 canary → 同一断言判红（`sageRootClean=false`、expect failures 恰为 1 条），证明零写入仪器能红。
- **行为变化（部署面）**：`SAGE_APP_SERVICE` 环境变量退场；`/.sage/*` 恒由 main 处理（off 态不存在）；Host 对 `/.sage` 一律 404；新增 `SAGE_FIXTURE_PROJECTION=1` 本地验证开关（只填 matter 槽，永不满足 production authority）。
- **公开 shape 增量**：`SageServiceState` 新增 `matter: SageMatterViewState | null`；0.2 的 service/auth/runtime 语义逐项不变（回归钉在 composition / route / renderer 三处）。
- **边界（不做）**：renderer matter/动作区渲染（UI-01）、live 投影、真实经营数据、真实 action、新 intent、插件/provider 接线、`/.sage/actions` 合同扩展；fixture 槽不计入任何生产完成证据（spec §9 D.1 关闭门原文）。
- **遗留登记**：无新增 deferred；`.superpowers/sdd` 任务报告结构未启用（本票由控制器直接实施 + 变异验证，证据如上）。
