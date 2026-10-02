# WT-02C.2E.3：运行态有效观测（Host protocol v5：ready 携带）+ E.2 默认标记并入

日期：2026-10-02 · 分类：architecture · 关联 ADR：[ADR-0196](../../../adr/ADR-0196.md) · 上游：遗留①（Host protocol 票，E.2 Note 登记）

## Problem

E.2 收口时登记①：**默认 preset 运行时判定**只能在 host 内的 live dsh runtime 读取（registry `defaultId = selectedDefault ?? config.default`），main 无从静态观测；它被显式切给「Host protocol 扩展另票」。本票执行该票：以 ready 事件携带运行态观测（协议 4→5），并把默认标记并入 E.2 stable descriptor（用户三裁决：通道=ready 携带〔推荐〕、观测面=defaultId+roster〔推荐〕、范围=本票一并并入〔推荐〕）。

## Decision

1. **协议 v5（D1+D4）**：`SHELL_HOST_PROTOCOL_VERSION` 4→5；`ready` 事件新增 `runtimeEffective` 字段（host 与 main 共用同一组类型/校验器，`protocol.ts` 单一事实源）。host 在发送 ready 前从 live ctx 观测一次（`src/host/runtime-effective.ts`，结构类型读取 `ctx.get('agentPresets')`，registry 包不入壳依赖）；绑定 boot，沿用现行 invalidation；零 renderer 可达面。扫掠：C2B 字面量（`hostProtocolVersion: '5'`，含手写 canonical golden 重锚 `98b254b7…`）、sage-shell-pin（`SAGE_HOST_LIFECYCLE_PROTOCOL_VERSION='5'`）、smoke、全部 fixtures/窗口探针。
2. **观测面（D2）**：`{kind:'observed', defaultPresetId, presets:[{id,isDefault,broken?}]}` 或 `{kind:'unavailable', reason∈3}`；边界校验=唯一 id、恰一条 isDefault 且等于 defaultPresetId、长度上限、plain-data（拒 Proxy/getter/多余键）；host 自验失败 → `invalid-roster`，main 复验（不信任子进程）。
3. **E.2 并入（D3）**：`preset.behaviorConfigurationDigest` 文档改为 `{defaultPresetId, members:[{id,trust,contractHex}]}`（agent.behavior 同值）；观测读取置于组装前最后一步；`defaultPresetId ∉ 静态 roster` → fail closed；新增第 8 个 code **`runtime-effective-unavailable`**（reason 后缀 `observation-invalid|registry-service-absent|invalid-roster|observation-failed|default-not-in-roster`）。
4. **matrix（D5）**：stable 对因并入变更（`58c7d999…` / `6ec53b31…`）＝ ADR-0165/0166 的矩阵键事件；当前无按对键控的物理制品，重发义务登记给真实 Matrix Authority 发布票。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| main→host 新增观测请求路由（按需拉取） | 用户裁决否决（选 recommended 的 ready 携带）：需另立 main 侧 renderer 面堵点与 freshness 模型。 |
| Node IPC 请求/响应 | 同上否决：生命周期通道加数据面，机制成本大。 |
| 观测面仅 defaultId | 用户裁决否决：roster 携带 isDefault/broken 与 remoteExportList 同源，代价近零。 |
| descriptor 并入另票 | 用户裁决否决：本票一并并入，① 一次性收口。 |
| 行级 enablement 全矩阵（definitionComposition） | 否决（本票）：web 编辑器级库存面，登记给未来消费者。 |

## Consequences

- **真机红线（本票最重的一枚证据）**：观测器首版在真机 smoke 被判红——`observation-failed`。根因：`remoteExportList` 被**脱挂调用（`this` 丢失）**；单元测试的假 service 未用 `this` 故假绿。修复=保持 receiver（`.call(service)`），并把假 service 升级为方法式（`this.list()`）回归测试。**教训：跨边界对象的方法必须带接收者调用；假 fixture 不覆盖 `this` 就是覆盖洞**。
- **验收读数**：全新隔离根 `sage-e3-accept.qbcmtXWANV`（generation 首版 `417f326c`、修复后 `4b8e7dfb`）：materialize → smoke **19/19 PASS**——含三条新断言 `host ready carries an observed runtime-effective roster` / `marks exactly one default matching its default id (default=standard presets=[standard,ptc,minimal,cordis])` / `carries the four shipped presets`；真机 registry 直测读数 `{"kind":"observed","defaultPresetId":"standard",...}`。全量套件 **621 pass + 1 skip（63 文件）**；typecheck 0；仓根 gate **quick/full/strict 25/25**。
- **goldens**：E.2 冻结面 4 变（protocolContractDigest `77012eaf…`、harness contract `bb9a2158…`、mainObservation `eb16c883…`、稳定对 `58c7d999…`/`6ec53b31…`）+ 9 条独立未变（launch/overlay/presetContract/receipt/materialization/instanceAuthority/health/liveness/registrySnapshot）；C2B canonical golden 因 v5 重锚（`98b254b7…`）。全部为探针实算后固化（探针已撤）。
- **发现（新登记，非本票引入）**：全新根与 K 世代根（`56302c51`）**同现** `warning: 4 entries did not activate`——host 面 `llm-deepseek`（`dsh-llm-deepseek-api-key`）、`llm-deepseek-account`、`deepseek-account-platform`、`account-controller` 因**缺 peer 包**（`@deepseek-ai/dsh-llm-deepseek`、`@deepseek-ai/dsh-deepseek-account` 未进 profile node_modules；两者在 npm `0.2.0-rc.2` 存在）导入失败。影响面：官方 DeepSeek route 的运行时 provider 可能缺席（未以真实模型调用证伪/证实——隔离根无凭据）；K6 的「stderr 零告警」为按模式 grep 的读数，**不覆盖** `did not activate` 类警告（已在 K6 Note 挂更正指针）。处置登记为后续票（seed peer 闭包修复 + 运行时模型 route 功能探针）。
- **操作者要点**：协议 4→5 ⇒ **旧 v4 generation 在新壳下 fail-loud 拒配**，须（在隔离根）重跑 `SAGE_ROOT=<根> pnpm run materialize`；本机共享根的重物化照旧不在自动动作范围。回退=`git revert` 本批两枚提交（v5 与 v4 generation 成对）。
- **边界**：内核（compatibility/capability-registry）、C2B 语义、PMAP 静态层零改动（仅字面量同步/消费）；行级 enablement 全矩阵、selectedDefault 运行时切换细粒度失效、运行态 model/provider env 合并、matrix 物理重发——均显式不做（登记）。
