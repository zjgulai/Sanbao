# WT-02D.0.2 · command pipeline 内核收口（步骤 2–10 typed port 管道）

日期：2026-10-01 · 分类：architecture · 关联 ADR：[ADR-0181](../../../adr/ADR-0181.md)

## Problem

WT-02D.0.1（[ADR-0179](../../../adr/ADR-0179.md) 之后由 [ADR-0180](../../../adr/ADR-0180.md) 收口）交付了 main-owned `/.sage/*` route 骨架，但 dispatch 对任何 action 一律 503 笼统体（`{error:'identity-unavailable', retryable:false}`），无阶段、无 correlation、无可判别错误类别。ADR-0174 定义的 command 顺序步骤 2–10（identity → rehydrate → target → compatibility → registry → availability → persist → dispatch）只有文档表述，没有代码看守——步骤顺序、步骤级脱敏错误、存在性不泄漏这些约束在 0.1 里都没有机制载体（「知道」没有变成「拦住」家族）。renderer 侧 retry 的 POST 处理器是 0.1 遗留的裸 `render(await response.json())`，对 0.2 的 typed denial 形会把 `{code:'identity-unavailable', retryable:...}` 直接灌进状态机。

## Decision

本票（W02 Task 1–4 实现，本 Note 收口）以三层落地 command pipeline 内核，不接任何真实 provider：

1. **D1 完整管道骨架**：`command-contracts.ts` 定义 `SageActionIntentV2`（exact-keys parse）与九 port 合同（`CommandPipelinePorts`，port 返回 `undefined` 即 provider 不可用、fail closed）；`command-pipeline.ts` 的 `runCommand` 顺序编排步骤 2–10，任一步非成功立即返回、后续 port 零调用，denial 形统一为 `{code, stage, retryable, correlation}`。
2. **D2 接进 main dispatch**：`composition.ts` production 环境九 port 全 undefined（`PRODUCTION_FAIL_CLOSED_PORTS`），dispatch 走 `runCommand`（retry intent 穿同一管道，correlation 每次新鲜 `randomUUID()`），错误体只携带 code/stage/retryable/correlation（脱敏合同，无 stack/message/raw payload）；`route-skeleton.ts` transport 层 parse 拒绝同样映射 typed denial（`invalid-intent`@`intent`/400）。
3. **D3 内核全 intent 合同 + transport 仍只 retry**：renderer retry 两形守卫以「`payload.code` 键存在性」判别 CommandDenied 形 vs 旧扁平形——CommandDenied 形归一 `{status:'recovering', message:'Sage 正在重新检查能力运行时服务。', retryable: payload.retryable !== false}`，legacy 扁平形直通 `render(payload)`。

两个映射语义决定随内核落地并被测试咬住：strictRehydrate 的 not-found 映射 policy-denied 家族（stage 标真实步骤 rehydrate，防事项存在性泄漏）；resolveTarget 缺失映射 `compatibility-unknown` 阻断语义。三个裁定（retry guard 位置、两形判别式、not-found 存在性不泄漏）的机器可读登记见 ADR-0181 决策块 D1–D3。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 逐段渐进：0.2 先只做 identity + dispatch 两步，其余步骤留 0.3 | 否决；503 笼统体的根因是「步骤 2–10 无代码看守」，先做骨架再逐步填 port 会在过渡期持续暴露顺序可绕过与错误体不脱敏面；一次落全序内核 + 全 port fail-closed 是更小的暴露面。 |
| kernel-only：内核合同与编排先落，composition/transport 0.3 再接 | 否决；不接进 dispatch 的内核没有任何运行时读数（「写了但从没跑到」家族），production 全 port fail-closed 恰好提供了零 provider 下的真实端到端验证路径（dispatch 恒 200 + identity-unavailable@identity-policy）。 |
| transport 同步开放完整 intent（retry 之外的业务 action 直达管道） | 否决；transport 形冻结期（P0-2）renderer 只发 retry，开放完整 intent 需要同时定 renderer 发送面与 spec §6 的 202 accepted 语义，超出本票射程；transport 保持「parse 拒绝 + typed denial」最小面。 |

## Consequences

- **production dispatch 从 503 变 200 + typed body**：`{code:'identity-unavailable', stage:'identity-policy', retryable:true, correlation:<uuid>}`，两次调用 correlation 不同（新鲜性）；identity denied 后 `ports.calls === ['identity']`（调用序列断言钉死顺序不可绕过）。0.1 的 503 笼统体与 `SAGE_APP_SERVICE=off` 回退收口路径不变。
- **renderer retry 遗留消解**：两形守卫使 retry POST 的 CommandDenied 形归一为 recovering 态，legacy 扁平形行为与 0.1 一致（回归钉）；判别式为 `code` 键存在性——legacy P0-2 扁平形若未来新增 `code` 字段需同步换判别式（ADR-0181 D3 constraint 登记）。
- **步骤 5 domain 重验暂由 target/compat port 承载**：步骤 5 的 domain 级重验（spec §4 注）在 0.2 内核中暂无独立 port，语义由 resolveTarget/resolveCompatibility 阻断（`compatibility-unknown`）承载——这是显式登记的暂态，非隐藏决定；真实 domain 重验 port 随 provider 接入另票。
- **port-only 合同等待 provider**：persistPreparation / dispatchOperation 等 port-only 合同（无 0.1 对应物）已定义但 production 恒 undefined；`now` port 是 trusted clock 的注入位——内核 `runCommand` 不消费它，composition 的 production 实现只是一行占位（epoch 常量）且全仓零调用方，不参与任何判定；如实陈述为纯类型占位（终审纠正：原「composition 层使用」措辞失真），真实 trusted clock 实现随 provider 落地另票。
- **全量回归收口读数**（2026-10-01，真实数字）：sage-shell `node scripts/test.mjs run` **48 files / 453 tests 全绿**（10.48s）；`npm run typecheck` 0 error；仓根 `node scripts/gate.mjs` **25/25 通过**（quick mode）。Task 1–4 各自的 RED→GREEN 与变异验证证据见 `.superpowers/sdd/2026-10-01-wt02d02-command-pipeline/task-{1..4}-report.md`。
- 本票不接真实 provider、不开放业务 action、不建 202 accepted 路径；ADR-0174 的 unavailable-first 与 ADR-0179 的 main-owned route 边界继续成立。
