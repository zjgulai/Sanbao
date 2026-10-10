# C2D.2A：app-bundled Capability Registry provider（内部阶段空快照首发）

- 日期：2026-10-10
- 决策：[ADR-0277](../../../adr/ADR-0277.md)
- 状态：已实施（首个已发布快照与装载/接线；非空 real entry 仍待 C2C.5/owner approval 全链）。

## Problem

运行时 descriptor 生产者在其 registry 端口缺席时整段 fail closed——「absence is unavailable, never empty capabilities」；ADR-0191 明说 **C2D.2A/C2C.5 到位即在同一 provider 内放行后续阶段**。C2D.0 治理与 C2D.1 pure kernel 已落；C2D.2 real entry 外部阻塞（需 C2C.5 verified descriptor 与真实 Adapter mapping 与 owner approval），但**装载边界与首发快照**不依赖外部输入：内部阶段没有任何外部能力被批准，空快照就是诚实的首发声明。没有它，ADR-0276 的发布重观测与 T05 中段永远没有真实 descriptor 输入。

## Decision

1. **模块** `src/security/capability-registry-provider.ts`：`EMPTY_INTERNAL_REGISTRY_SNAPSHOT_BODY`（`createdAt` 固定、`entries: []`）+ `createBundledCapabilityRegistryProvider(snapshotBody = 空集)`——`read()` 每次经 C2D.1 kernel `sealCapabilityRegistrySnapshot` 封存并返回深冻结快照；不可封存抛出只带稳定码的错误（无路径、无载荷）；构造从不抛出（坏 bundle 不崩启动）。
2. **接线** `index.ts`：构造 bundled provider 并作为 `registry` 端口交给 `createRuntimeInventoryProvider`——descriptor 生产者最后一个缺席输入。接入后，其余输入全真（Host ready＋C2A verify＋物化 profile＋PMAP＋protocol v5 观测）时按既有语义放行 stable descriptor 与 full evidence。
3. **首发能力面为空是机械声明**：与 ADR-0276 D4 一致；非空条目必须以**新的已发布快照**到达，且先走 ADR-0171 治理链（candidate → verified C2C descriptor → owner approval → MatrixV2 rule → Adapter mapping），不得编辑常量。
4. **门禁**：route-authority 门禁登记五组源码事实（index 构造、index 接线、kernel 封存、fail-closed 读取、空集常量）并附五条具名突变；route 权威矩阵与计数不变。

## Alternatives considered

- 继续等待 C2C.5/C2D.2 全链：descriptor 生产者可预见地恒 unavailable，T05 中段没有真实输入。
- 非空条目直接放常量：绕过 verified descriptor 与 owner approval，ADR-0171 明禁。
- 文件/bundle 目录装载：属发布票（多快照、撤销源、装载位置）；provider 参数已对将来装载开放。
- provider 自行解析：validation 必须走内核（不重复、不隐藏）。
- 运行时读钟生成 createdAt：snapshotId 会漂移；发布时刻必须确定性。

## Consequences

- descriptor 生产者首次具备全部输入；空 capabilities 与首发范围一致；快照以空集发布=可审计的产品事实「内部阶段无任何外部能力获批」。
- 遗留⑧（registrySnapshot 变更检测）第一次有了检测对象；机制仍待后续票。
- 未闭：C2C.2 bridge seam（外部）、C2C.5/C2D.2 real entry、真实登录与真机首条消息；T05 不因本刀标记完成。

## Verification

证据（2026-10-10）：`capability-registry-provider.spec.ts` **3/3**——封存读确定性且深冻结（snapshotId= 内核复算）、非法 body fail-closed 且消息无路径、**接入真实 provider 后 runtime inventory 组合放行 descriptor**（`available`、`capabilities: []`、evidence 的 `registrySnapshotDigest` 绑定该快照的 URN 重形）；门禁自测 `node --test scripts/gates/sage-route-authority.test.mjs` **39/39**（含新五条具名突变）；`apps/sage-shell` typecheck 0；全量套件 204 文件 / 1850 通过 / 1 skip（exit 0）；`pnpm run gate` 32/32（objects 313/313，0 skip，退出码 0）。未运行：实机探针（descriptor 放行由装置级组合覆盖；真机 boot 组合属后续收尾）。
