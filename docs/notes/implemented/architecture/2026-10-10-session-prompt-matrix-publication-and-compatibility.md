# T05-mid step 6：矩阵制品发布与真实 compatibility 步装配

- 日期：2026-10-10
- 决策：[ADR-0284](../../../adr/ADR-0284.md)
- 状态：已实施（矩阵/撤销源制品 + semantic 重建 + targetEvidence 生产者 + 真实端口与装配 + 门禁事实与突变）；D4 评估时点为显式设计裁决，待用户复核。

## Problem

第 5 步（target）已落地，第 6 步 compatibility 在 main 侧零装配。侦察确认三大缺口与一条硬约束：矩阵无任何发布件；resolve 所需的完整 `targetSemantic` 无落盘载体（只有候选线纯函数可机械重建）；`targetEvidence` 的 revisionDigest/actionIntentDigest/三类 boundary/attemptId/targetProviderProvenance 全无生产者；kernel 要求 `evaluatedAt` 落在 30 秒 inventory 证据窗内，而全量重观测在负载下 50–200 秒、不能进请求路径——评估时点必须显式裁决。

## Decision

1. **制品**：矩阵 bundle（单规则=owner 稳定对 `3da420a7… × e1c7a8b4…`，窗口 2026-10-11→2027-10-11，issuer `authority:sage-compatibility`）+ 空撤销源，内核封存落 `publications/`——`matrixId ddeea6b8…` / `bundleId 1f054011…` / `revocationSourceId 9837c233…`；ADR-0196 D5 登记的「矩阵物理重发」由此首次执行。
2. **semantic 重建**：`computeTargetSemanticFromRequirement`（候选线模块同家）；spec 钉死重建 digest == `urn:sage:target-semantic:sha256:3da420a7…`——发布与解析逐字节一致是这一设计的核心断言。
3. **targetEvidence**：全字段 main 侧确定性推导（域分隔规则见 ADR-0284 D3）；带 `targetEvidenceDigest` 封存形注入 kernel；`equivalent→allowed / requires-new-revision→denied / 其余→unavailable`。
4. **评估时点 = 证据 observedAt（D4 裁决）**：重观测不进请求路径；墙钟新鲜度由 Host 生命周期失效接线恢复（后续票）。生产可达 equivalent 的窗口 = 2026-10-11 起且 boot 观测与发布对一致。
5. **revisionDigest**：store 已校验链经 `revision-digest-reader` 暴露（并行车道实现，接口冻结）。
6. **门禁**：route-authority 兼容事实组（全输入门控、index 装载与观测/修订面、kernel 适配调用、评估时点常量、仅 requires-new-revision 可 denied、loader 内核 parse+provider 组装）+ 四条具名突变。

## Alternatives considered

- 每请求重观测 / 失鲜即封死 / 改 kernel 窗口 / 无 pin 的手工重建 / 外部 boundary provider——逐条理由见 [ADR-0284](../../../adr/ADR-0284.md) 备选表。

## Consequences

- 链真实推进到第 6 步后停在 registry/preflight/persistence；路由行为保持 unavailable-first。
- 生效窗前求值按设计 unavailable（`matrix-not-active` 与 requirement 的 `requirement-not-effective` 同构）；漂移全部落 kernel 命名码。
- D4 的时点语义待用户复核；Host 生命周期失效接线为登记后续票。

## Verification

证据（2026-10-10，全部真实执行；未跑的照实写）：

- **制品封存**：组合命令退出 0——`SEALED OK`；三 id（matrix/bundle/revocationSource）与解析往返均过内核。
- **spec**：`node scripts/test.mjs run test/session-prompt-compatibility.spec.ts` **8/8**——装载与三 id 钉子、篡改/缺失拒绝、**semantic 重建 pin==3da420a7…**（含 capabilities 非空 fail-closed 用例）、equivalent 全输入正例、requires-new-revision→denied、五条 fail-closed 负例、发布窗未到→matrix-not-active、装配探针（全输入才构造）。
- **门禁自测**：`node --test scripts/gates/sage-route-authority.test.mjs` **42/42**（index 接线后 baseline 转绿；含本刀四条新具名突变）。
- **lane 2（revisionDigest）**：`business-matter-event-store.spec.ts` **18/18**、`revision-digest-reader.spec.ts` **1/1**、typecheck exit 0；语义裁决=revision-entered 事件摘要（候选 B），篡改流抛错而非 undefined（诚实性，消费端经 kernel catch 归 unavailable）。
- **sage-shell 全量套件**：`node scripts/test.mjs` **EXIT=0（0 fail）**。
- **producer**：`npm_config_store_dir=…/store/v10 bash packaging-sage/produce-inputs.sh --replace` 退出 0——`runtime graph: 113 files`（三个 step-6 运行时模块进闭包）；**三份出版物全部落位** `staging/input/app-runtime/publications/`。环境注记：今晚 pnpm 解析切换到 11.8.0（v11 store）后，v10（历史完整）与 v11（部分）分家——produce 须带 `npm_config_store_dir` 指向 v10，直到 v11 补齐（网络大包下载此前多次 error(23) 中断）。
- **门禁**：`pnpm run gate` **32/32（exit 0）**；首跑 31/32 为 sanbao probe 的负控件高负载时序红（单跑 3/3 绿 + 复跑门禁全绿）——已登记 flake 家族，非本刀回归。
