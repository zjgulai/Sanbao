# WT-02C.2E.3 · 运行态有效观测（Host protocol v5：ready 携带）+ E.2 默认标记并入（设计）

日期：2026-10-02 · 状态：**已实施（2026-10-02，ADR-0196；真机 smoke 19/19、三层 gate 25/25）**；用户三裁决已录（2026-10-02：通道=ready 携带+协议 v5〔推荐〕；观测面=defaultId+roster〔推荐〕；范围=本票一并并入 descriptor〔推荐〕） · 上游：[ADR-0168](../../adr/ADR-0168.md)（C2B 边界）、[ADR-0191](../../adr/ADR-0191.md)（E.2）、[ADR-0194](../../adr/ADR-0194.md)（PMAP.1）、[ADR-0195](../../adr/ADR-0195.md)（帧名称面）；本票登记源 = E.2 Note 遗留①（Host protocol 票）。

## 1. 目标与切片

闭合遗留①「默认 preset 运行时判定」：让 **main 观测 host 内 dsh runtime 的运行态有效配置**（默认 preset 标记），并把它并入 E.2 的 stable descriptor。切片：① 协议 v5（ready 事件携带观测）；② host 侧观测（live ctx → roster）；③ main 侧解析/存储/端口；④ E.2 并入（preset/agent behavior 文档 + 新 code + goldens 重锚）；⑤ 隔离验收 + 留痕（ADR-0196）。**不做**：行级 enablement 全矩阵（登记后续消费者）、matrix 物理重发（无制品，登记义务）、C2D/C2C、运行态 model/provider env 合并（另票）。

## 2. 决策

1. **D1 通道 = ready 携带（协议 4→5）**：host 在发送 `ready` 前从 live ctx 观测一次，把结果作为 `ready` 事件新字段 `runtimeEffective` 随事件带上；main 以 exact-keys（含嵌套深校验）解析。绑定 boot：复用现行 invalidation（`internal/status`/fatal/exit/disconnect/stop → 一并失效）。**零 renderer 可达面**（无新请求路由/无新数据面）。代价：协议版本 4→5 扫掠（§5）；旧 v4 generation fail-loud 拒配，须（在隔离根）重物化——Sage 的 app+generation 由本仓成对物化，属预期迁移。
2. **D2 观测面 = defaultId + roster**：`{kind:'observed', defaultPresetId, presets:[{id,isDefault,broken?}]}` 或 `{kind:'unavailable', reason}`；数据源 = live ctx 的 `agentPresets` service（上游 `remoteExportList()` 语义：`isDefault := id === defaultId`，`defaultId = config.selectedDefault ?? config.default`；Sage 组合 `config.default='standard'`）。**边界校验（main 复验，不信任子进程）**：id 唯一、非空、`===trim`、≤64；恰一条 `isDefault===true` 且其 id `=== defaultPresetId`（0 条 = registry 默认悬空 → invalid）；`broken` 可选、非空、≤512；presets ≤64。子进程侧先自验，非法 → `unavailable('invalid-roster')`。
3. **D3 E.2 并入**：`preset.behaviorConfigurationDigest` 的 canonical 文档从 `[ {id,trust,contractHex} ]` 改为 `{ defaultPresetId, members:[ {id,trust,contractHex} ] }`（members 保持 id/trust 排序）；`agent.behaviorConfigurationDigest` 同值（既有 roster 派生规则不变）；`preset.artifactDigest` 不动；新增第 8 个 unavailable code **`runtime-effective-unavailable`**（端口缺席/读取失败/`defaultPresetId` 不在静态 roster，reason 携 `(observation-invalid|registry-service-absent|invalid-roster|observation-failed|default-not-in-roster)` 后缀）。观测读取置于组装前最后一步（与 C2B 双快照后的最紧窗口一致；同一 store，天然同 boot）。
4. **D4 v5 是显式语义事件**：`SHELL_HOST_PROTOCOL_VERSION` 4→5 引发 HOST_VERSION=`'5.0.0'`（派生）、C2B `hostProtocolVersion` 字面量、policy 文档（`protocolVersion: 5`、`connection: 'host-protocol-5'`）、门禁常量、smoke 断言、窗口探针 fixtures 全量同步（§5）；`sage-shell-pin` 的 `SAGE_HOST_LIFECYCLE_PROTOCOL_VERSION` 同步 '5'。
5. **D5 matrix 重发登记**：stable 对（`runtimeDescriptorDigest`/`inventoryEvidenceDigest`）因默认标记并入而变更 = ADR-0165/0166 语义下的正常矩阵键事件；当前**无按稳定对键控的物理制品**（consumption 测试自洽构造 fixture matrix），重发义务登记给「真实 Matrix Authority 发布」票，本票只重锚 goldens 并更新判决记录。

## 3. 观测契约（exact）

```ts
// 随 ready 事件（协议 v5）；host 与 main 共用同一组类型与校验器
export type RuntimeEffectiveUnavailableReason =
  | 'registry-service-absent'   // 组合里没有 agentPresets service
  | 'invalid-roster'            // 读到了但违反不变量（空名册/重复 id/默认悬空）
  | 'observation-failed'        // 读取过程抛错
export interface RuntimeEffectivePresetRow {
  readonly id: string
  readonly isDefault: boolean
  readonly broken?: string      // 运行时激活失败诊断（本票仅观测，不并入 descriptor）
}
export type RuntimeEffectiveObservation =
  | { readonly kind: 'observed'; readonly defaultPresetId: string; readonly presets: readonly RuntimeEffectivePresetRow[] }
  | { readonly kind: 'unavailable'; readonly reason: RuntimeEffectiveUnavailableReason }
```

- host 侧读取（`ctx.get('agentPresets')`，**结构类型本地声明**——registry 包不在壳 devDeps，禁止引入依赖）：服务缺席 → `registry-service-absent`；`remoteExportList()` 抛错 → `observation-failed`；结果自验不过 → `invalid-roster`。
- main 侧：`isHostEvent`/专用校验器对 `runtimeEffective` 做 exact-keys 深校验（拒绝 Proxy/getter/额外键/越界字符串——沿用 `snapshotPlainDataRecord` 纪律）；ready 校验失败 = 事件非法（沿用现行 fail-loud）。
- 存储与失效（`ShellHostProcess`）：ready 时存观测；`invalidateSnapshot` 全路径（invalidated/fatal/exit/disconnect/stopped）同时清空 → `readRuntimeEffective(): unknown` 返回 `undefined`。

## 4. descriptor 并入（exact canonical）

- `presetBehaviorConfigurationDigest = sha256ContentDigest(JSON.stringify({ defaultPresetId, members: members.map(m => ({ id: m.id, trust: m.trust, contractHex: m.contractHex })) }))`；`agent.behaviorConfigurationDigest` 同值。
- E.2 读取顺序：C2B → 指针/漂移 → PMAP 完备 → policy → registry → capabilities → **运行态观测（新）** → 组装/自验。观测 unavailable 或 `defaultPresetId ∉ member ids` → `runtime-effective-unavailable`。
- 稳定对随本并入变更 → goldens 重锚（探针实算后固化）；smoke stdout 行格式不变（本机真实根仍先落在 registry 阶段）。

## 5. 协议 v5 扫掠清单（实现时逐项核对，禁止遗漏）

| 面 | 位置 |
| --- | --- |
| 版本常量与事件 | `src/protocol.ts`（version=5、ready 类型 + `runtimeEffective`、isHostEvent 深校验） |
| host 观测与发送 | `src/host/runtime-effective.ts`（新）、`src/host/index.ts`（runShellHost 观测 → controller → startHostProcess 发送） |
| main 接收/存储/端口 | `src/main/host-process.ts`（ready 解析、store、失效、`readRuntimeEffective`） |
| C2B 字面量 | `src/main/runtime-inventory.ts`（snapshot/projection `hostProtocolVersion: '5'`） |
| E.2 并入 | `src/main/runtime-inventory-provider.ts`（端口、第 8 code、behavior 文档）+ `src/main/index.ts`（接线） |
| 门禁 | `scripts/gates/sage-shell-pin.mjs`（`SAGE_HOST_LIFECYCLE_PROTOCOL_VERSION='5'`）+ 自测样本 |
| smoke/探针 | `scripts/smoke.mjs`（`protocolVersion=5` + **`runtimeEffective` 断言：observed / default=standard / 4 presets**） |
| 测试面 | host 观测单测、协议校验单测、host-process store、E.2 provider/consumption、窗口探针 fixtures、`test/support/*` 中 `'4'` 字面量 |
| 文档 | E.2 设计（§2 codes、§3 表、§4.1/§4.4）、PMAP 设计（默认标记行）、本 spec、ADR-0196 + Note |

## 6. 测试与验收

1. **观测单测**：fake ctx（缺服务/抛错/合法/名册非法 4 类）+ 校验器敌意形状（Proxy/getter/多余键/超长/重复 id/双默认）。
2. **host-process**：ready 存入；invalidated/fatal/exit 后 `readRuntimeEffective()` = undefined。
3. **E.2**：默认标记并入的逐字段断言 + `runtime-effective-unavailable` 缺项矩阵（端口失败/默认不在名册）+ goldens 重锚；consumption 真实分支按新阶段推导。
4. **隔离验收**：`tsc` 重建 → 隔离根重物化（v5）→ smoke **含 runtimeEffective 断言**（真实 runtime 上的默认标记 = 关键证据）→ 全量套件 + 三层 gate。
5. 留痕：ADR-0196 + Note（读数为证）+ spec 双修订 + 执行计划 Revision 44 + ledger。

## 7. 不做（边界）

行级 enablement 全矩阵（`definitionComposition`/`mountedCompositionRows` 级——登记给未来消费者）；selectedDefault 运行时切换的细粒度失效（沿用 boot 绑定+现行 invalidation；未来若引入壳内默认切换面须重审）；运行态 model/provider env 合并（另票）；matrix 物理重发（无制品）；C2D/C2C、UI、插件。
