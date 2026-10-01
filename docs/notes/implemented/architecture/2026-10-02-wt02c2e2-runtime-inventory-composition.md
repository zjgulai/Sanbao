# WT-02C.2E.2 · RuntimeInventoryProvider 组合：stable descriptor + full inventory evidence

日期：2026-10-02 · 分类：architecture · 关联 ADR：[ADR-0191](../../../adr/ADR-0191.md)

## Problem

Wave 22 的 `WT-02C.2E.0/.1/.2` 原计划：先固定合同、再实现 adapters、最后由 Electron main 汇合 C2A/B/C/D + PMAP + trusted clock + instance authority，**同时产出 stable runtime descriptor 与 full inventory evidence**。E.0（[ADR-0187](../../../adr/ADR-0187.md)）交付 PMAP 合同与静态 producers 后复核：V2 生产者合同（`RuntimeDescriptorBodyV2` / `RuntimeInventoryEvidenceBodyV2` 的 exact 解析与 `compute*DigestV2`）已在 `compatibility.ts` 冻结并导出；C2B 主侧投影 provider 完整（双快照 + receipt-sealed C2A fresh verify + 时钟回退检测 + 30s 窗）；但 `receiptDigest` / `materializationInstanceDigest` / `instanceAuthorityDigest` / `mainObservationProvenanceDigest` / `healthObservationDigest` / `livenessObservationDigest` 与三个顶层 policy digest 在全仓**无生产者、无既有定义**；C2D.2A registry provider 与 C2C.5 外部能力未落地。

用户四裁决（2026-10-02）：生产 main **接线 + 恒 unavailable**（deps 到位即活）；health/liveness **本票定义最小语义**（仅 provenance 陈述，resolver 不据此放行）；观测窗口**复用 C2B 窗口**；registry **必需端口、缺席即 unavailable**（不构造空 capabilities 冒充）。

## Decision

1. **组合 provider**（`src/main/runtime-inventory-provider.ts`，main-owned、端口全注入、零模块级 I/O、内核零改动）。固定顺序：C2B `read()`（unavailable → `host-projection-unavailable`，reason 带其 code）→ `readActiveProfile`（失败或与投影 `activeGeneration`/`manifestSha256` 漂移 → `active-profile-unavailable`）→ PMAP `collectPmapEvidence`（按面子表完备性；roster 允许空集；preset 包身份另读，失败 → `pmap-incomplete`）→ overlay/local patch 读取（失败 → `policy-document-unavailable`；local patch 缺失=null）→ registry 快照（缺席/读出失败/非法 → `registry-unavailable`，reason 带 kernel code）→ capability 映射（非法 → `capability-invalid`）→ 组装 descriptor body → `computeRuntimeDescriptorDigestV2` → 组装 evidence body（窗口复用 C2B `observedAt`/`expiresAt`）→ `computeInventoryEvidenceDigestV2` → **绑定自验**（两 digest 重算相符、evidence 绑定 descriptor、窗口 `observedAt < expiresAt`、`runtimeGeneration ≥ 1`）→ deep freeze。7 个具名 code；任一必要事实缺失即 unavailable，永不 placeholder。
2. **四个顶层 policy 文档本票定义并手写 golden 冻结**：protocolContract（协议 v4 常量 + 显式帧词汇 + fd 对 + chunkBytes）、launchPolicy（argv/env/home/loopback 策略；envPolicy 含 launchEnvironmentKey 单键注入）、overlayPolicy（rootConfig + overlay bytes + local patch bytes——**local patch 出现或内容变化即摘要变**）、harnessContract（SHELL_LABEL + launchEnvironmentKey + host-protocol-4）。
3. **六组件映射**：host（`4.0.0`＝协议主版本 4 的正式 SemVer 形；artifact=`artifactSetDigest`）、harness（同 artifact 委派、`harnessVersion` 作 version）、provider/model（model 三面 provider 委托；behavior 取 settings 选择）、agent（identity 按末位 `@` 确定性拆包名；behavior = preset 组件同值——roster 派生静态最小语义）、preset（`preset:set` 复合聚合，成员按 id 排序、排序不敏感；包 version/exports 另读）。PMAP `urn:…:sha256:<hex>` → `sha256:<hex>` 同 hex 换形，不重算。
4. **七个 provenance 摘要本票定义**：receipt（=`profile-manifest.json` 封印 SHA）、materializationInstance（generation+receipt+activatedAt）、instanceAuthority（安装实例权威身份：前两值 ActiveProfile、后三值投影/C2B 绑定面）、mainObservationProvenance（C2B projectionDigest + PMAP 逐行证据摘要 + registry snapshot）、health（C2A 复验结果，最小语义）、liveness（C2B 观测时 host 存活且 epoch 稳定，最小语义）、registrySnapshotDigest（C2D snapshotId 换形）。
5. **capabilities 自 registry 快照派生**（无额外端口）：approved ∧ 以投影 `observedAt` 评估 effective（`effectiveAt ≤ observedAt < expiresAt`）；version 须过 V2 文法等价断言；`verified/c2c5`；behavior/registryDescriptor/adapterMapping 三摘要按本票 canonical 投影（操作按 operationId 排序）。
6. **接线（main）**：`host.start()` 成功后构造（真 C2B provider + 真 fs 端口；registry 端口缺席＝如实缺项），单次 `read()` + 一行稳定 stdout（`sage shell: runtime inventory available` / `unavailable (<code>)`；非敏感、零副作用、不阻断启动）；provider 实例经 `createSageAppServiceProviders` options `runtimeInventory` 传递（当前无消费者，登记遗留⑦）。
7. **测试与证据**：happy path 逐字段 + 四 policy digest/七 provenance digest/稳定对 **13 个 golden 字面量**（四文档 canonical 串先经独立 node 脚本复算一致后冻结）；缺项矩阵逐 code；**成对反例**（瞬态 5 变体〔bootId/runtimeGeneration/observedAt/activatedAt/同内容第二代〕仅 full digest 变、语义 4 变体〔settings 选择/overlay bytes/local patch 出现/roster 增删〕两者都变）；敌意输入零 getter/零 trap；V2 resolver 消费（equivalent / 窗口过期拒绝 / 篡改拒绝）；真实 generation 集成；变异 M1–M4 全红还原。
8. **smoke 仪器修复**：`npm run smoke` 仍断言 Host 服务 `/.sage`（WT-02D.1 之前的旧合同）——对任何 02D.1 之后 materialize 的 generation（本机自 `bb862e74` 起 Host 拒面）必红；本票把断言对齐到现行合同（Host 对 `/.sage/*` 一律 404，main 唯一 owner per [ADR-0184](../../../adr/ADR-0184.md)），smoke 全绿，并在 D.2A Note 挂更正指针。

### 操作者/消费者要点

- 稳定 stdout 行格式：`sage shell: runtime inventory available` 或 `sage shell: runtime inventory unavailable (<code>)`（7 code 之一）；本票后生产恒 unavailable（registry 端口不存在）。
- 真实 generation 集成测试为显式 opt-in（一次全树 fresh attestation 扫描 45–200s，负载敏感）：`SAGE_REAL_GENERATION=1 node scripts/test.mjs run test/runtime-inventory-consumption.spec.ts`。
- 稳定对（`runtimeDescriptorDigest`/`inventoryEvidenceDigest`）是 matrix 规则键；本票 golden 冻结现行值，字段级语义变更须同步 golden 并重发 matrix。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| registry 缺席时构造空 capabilities 冒充 | 否决（用户裁决）；空数组会掩盖 C2D/C2C.5 缺项，等同伪造完整证据。 |
| host.version 直接用协议号 `'4'` | 否决；V2 version 文法只收精确 SemVer 或日历版本；`'4.0.0'` 为协议主版本的正式形（协议升级须同步常量与 golden）。 |
| model 三面自 model 行推导 | 否决；权威记录口径＝模型实现随 provider 包分发，委托关系即稳定语义。 |
| agent.behavior 置空/省略 | 否决；面表要求该字段；roster 派生为「agent 行为由可用预设组合定义」的静态最小语义（默认选择不可观测，登记 Host protocol 票）。 |
| overlay 摘要忽略 local patch | 否决；同 digest 会掩盖实例本地 patch 层（ADR-0162）的行为差异；M3 变异证明测试咬住。 |
| smoke 旧 `/.sage` 断言等 C 线某票再修 | 否决；仪器与现行合同矛盾时永红/永不被真实执行＝无验收；即刻对齐 ADR-0184 语义。 |
| 真实 generation 集成放默认套件 | 否决（实现层）；单次全树扫描 45–200s（负载敏感），默认套件显式 skip 并注明 opt-in 命令，不静默假绿。 |

## Consequences

- **真实读数（2026-10-02）**：`npm run typecheck` 0 error；全量 **611 tests + 1 opt-in skip（62 files）**；`npx tsc` 构建通过；`npm run smoke` PASS（修复后 16/16 行）；仓根 `pnpm run gate` **25/25**。
- **golden 冻结**：四 policy digest + 七 provenance digest + 稳定对 = 13 个字面量；四 policy canonical 串经独立脚本复算一致后冻结（防实现自洽陷阱）；goldens 被 M1/M4 变异间接证明会红。
- **变异四组**（改源→红→还原绿）：M1 `host.identity` 拼 bootId → 成对反例红（连带 happy path/goldens 红）；M2 registry 缺席伪造空快照 → 缺项矩阵红；M3 overlay 忽略 local patch → 语义反例红；M4 跳过 `compute*` 自验（预置假 digest）→ assembly-invalid 用例红。还原后双 spec 15 pass + 1 skip、零残留。
- **V2 消费**：产出对喂入 `resolveCompatibilityV2`（fixture matrix 以产出 `runtimeDescriptorDigest` 预发布）→ `equivalent`（binding 两 digest 相符、frozen）；`evaluatedAt = expiresAt` 与越窗 → `inventory-not-active`；篡改 descriptor/evidence → `runtime-descriptor-digest-mismatch` / `inventory-evidence-digest-mismatch`。
- **真实 generation 集成（本机活动 `bb862e74`；opt-in）**：C2B 投影 available；终局 code ＝ **`pmap-incomplete`**——PMAP 行读数：provider/model absent（`settings-document-absent`，真实 harness home 仅有 `profiles/` 与 `storages/`）、agent observed（`@deepseek-ai/dsh-agent@0.1.5-rc.2`）、preset ×4 observed（cordis/minimal/ptc/standard）；overlay 与 presets 包身份可读、因 PMAP 在前未到达 registry 阶段。一次全树 fresh attestation 扫描 45–200s（负载敏感）。
- **live 验收（2026-10-02，真实应用）**：stdout 于 `sage shell: host ready, dsh 0.1.5-rc.2` 后一行 **`sage shell: runtime inventory unavailable (pmap-incomplete)`**——与真实读数一致；spec §6 预期的 `registry-unavailable` 不成立的原因＝settings 文档缺失在固定顺序中更靠前（如实登记，非缺陷）。
- **边界**：C2D.2A registry provider、C2C.5 external capability provider、resolver/D.2 编排接线、matrix 发布、Host protocol 扩展、v1 任何改动、内核（`compatibility.ts` / `capability-registry.ts`）、C2B/PMAP 既有行为——一律零改动；零持久化/零日志/零网络新增。
- **遗留登记**：① 默认 preset 运行时判定（Host protocol 票；agent.behavior roster 派生随并入默认选择后 stable digest 变更属正常语义变更，需重发 matrix）；② host/harness 分包 artifact 树粒度（现为安装集委派）；③ 三个 policy 文档字段级语义与 `runtime.ts`/`protocol.ts` 常量同步靠 golden 与评审守；④ `preset:set` 复合语义；⑤ capability canonical 投影若与未来 C2D.1 digest 函数重叠则收敛复用；⑥ health/liveness 最小语义待 C2C.4/C2C.5 增强；⑦ `runtimeInventory` 槽在 D.2 接线前无消费者；⑧ registrySnapshotDigest 不重算（换形），快照变更检测依赖 C2D.2A 重发快照。
- **仪器发现（跨票）**：smoke 的 `/.sage` 断言自 WT-02D.1（Host 拒面 + main 唯一 owner，ADR-0184）起即陈旧——只有 02D.1 之前 materialize 的 generation 才能通过；D.2A Note 的「smoke PASS」对活动 generation（`bb862e74`）无法复现，本票更正仪器并给该 Note 挂更正指针。教训：**验收仪器必须与当前活动的 materialized 工件同代**（generation 是拷贝不是链接；仪器不改，测的就是旧世界）。

## Verification

本票完成的可验证结果为：spec / plan 与两枚 spec 文件入库、Note + ADR-0191 + 机器账本可再生成、smoke 与 Sage quick gate 通过，且精确差异证明内核（`compatibility.ts` / `capability-registry.ts`）、C2B `runtime-inventory.ts`、PMAP `runtime-inventory-pmap.ts`、v1、Host、profile 包既有行为零改动。任何「C2E.2 已可放行 compatibility / registry 已可用 / D.2 全量可开」的声明都必须由后续票（C2D.2A / C2C.5 / D.2 余项）另行给出证据。
