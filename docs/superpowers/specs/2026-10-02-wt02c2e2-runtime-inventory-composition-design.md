# WT-02C.2E.2 · RuntimeInventoryProvider 组合：stable descriptor + full inventory evidence（设计）

日期：2026-10-02 · 状态：设计已由用户逐题/逐节确认（2026-10-02），spec 待评审 · 上游：[ADR-0165](../../adr/ADR-0165.md)、[ADR-0166](../../adr/ADR-0166.md)、[ADR-0167](../../adr/ADR-0167.md)、[ADR-0168](../../adr/ADR-0168.md)、[C2B 记录](../../notes/proposed/architecture/2026-09-28-host-live-inventory.md)、[C2A 记录](../../notes/proposed/architecture/2026-09-28-runtime-artifact-attestation.md)、[ADR-0187](../../adr/ADR-0187.md)（E.0）

## 1. 目标与切片

计划 Wave 22 定义：`WT-02C.2E.0/.1/.2` 先固定合同、再实现 adapters、最后由 Electron main 汇合 C2A/B/C/D、PMAP、trusted clock 与 instance authority，**同时生成 stable runtime descriptor 和 full inventory evidence**；任一必要事实缺失都 unavailable，禁止 placeholder。E.0（C2E-PMAP, ADR-0187）已交付 PMAP 合同 + 静态层 producers；本票交付 **E.2 组合**。

复核现状：V2 生产者合同（`RuntimeDescriptorBodyV2` / `RuntimeInventoryEvidenceBodyV2` 的 exact 解析、canonical、`computeRuntimeDescriptorDigestV2` / `computeInventoryEvidenceDigestV2`）已在 `compatibility.ts` 冻结并导出；C2B 主侧投影 provider 完整（双快照 + receipt-sealed C2A fresh verify + 时钟回退检测 + 30s 窗）；`receiptDigest` / `materializationInstanceDigest` / `instanceAuthorityDigest` / `mainObservationProvenanceDigest` / `healthObservationDigest` / `livenessObservationDigest` / 三个顶层 policy digest 在全仓**无生产者、无既有定义**——本票定义。registry（C2D.2A）与外部能力（C2C.5）未落地。

用户四裁决（2026-10-02）：生产 main **接线 + 恒 unavailable**（deps 到位即活）；health/liveness **本票定义最小语义**（仅 provenance 陈述，resolver 不据此放行）；观测窗口**复用 C2B 窗口**；registry **必需端口、缺席即 unavailable**（不构造空 capabilities 冒充）。

## 2. Provider 形态与顺序

新模块 `src/main/runtime-inventory-provider.ts`（main-owned；端口全注入、零模块级 I/O、内核零改动）：

```ts
export type RuntimeInventoryUnavailableCode =
  | 'host-projection-unavailable' // C2B 投影不可用（其具名 code 保留在 reason 中，不泄漏原始异常）
  | 'active-profile-unavailable'  // readActiveProfile 失败，或与投影的 generation/manifest 漂移
  | 'pmap-incomplete'             // PMAP 任一行非 observed 或按 §2.1 面表要求的字段缺失
  | 'policy-document-unavailable' // overlay/patch 文件读失败
  | 'registry-unavailable'        // registry 端口缺席或读出失败/非法
  | 'capability-invalid'          // approved 条目缺所需 descriptor 引用/格式非法
  | 'assembly-invalid'            // 自验失败（digest 绑定不符/窗口非法）——绝不输出

export interface RuntimeInventoryProvider {
  read(): Promise<
    | { readonly kind: 'available'; readonly descriptor: RuntimeDescriptorV2; readonly evidence: RuntimeInventoryEvidenceV2 }
    | { readonly kind: 'unavailable'; readonly code: RuntimeInventoryUnavailableCode; readonly reason: string }
  >
}

export function createRuntimeInventoryProvider(input: {
  readonly paths: SagePaths                                   // active profile 读取面（receipt/attestation sha）
  readonly hostProjection: HostLiveInventoryProjectionProvider // 真实：createHostLiveInventoryProjectionProvider
  readonly pmapFs: PmapFsPorts                                 // 复用 E.0 注入面
  readonly readFileBytes: (absolutePath: string) => Buffer     // overlay patch / local patch / presets package.json
  readonly registry?: RegistrySnapshotPort                     // 缺失 = 'registry-unavailable'
}): RuntimeInventoryProvider
```

**固定顺序**：C2B `read()`（unavailable → `host-projection-unavailable`，reason 带其 code）→ **`readActiveProfile(paths)`**（失败 → `active-profile-unavailable`；**与投影的 `activeGeneration`/`manifestSha256` 漂移 → `active-profile-unavailable`**——receipt/attestation sha 只能来自被投影认证过的同一 generation）→ PMAP `collectPmapEvidence`（完备性按 §2.1；roster 允许空集=合法，但 preset 包身份读失败 → `pmap-incomplete`）→ overlay 文件读取（失败 → `policy-document-unavailable`）→ registry 快照（缺席/失败 → `registry-unavailable`；条目非法 → `capability-invalid`）→ 组装 descriptor body → `computeRuntimeDescriptorDigestV2` → 组装 evidence body（窗口复用 C2B `observedAt`/`expiresAt`）→ `computeInventoryEvidenceDigestV2` → **绑定自验**（`descriptor.runtimeDescriptorDigest === compute(body)`；`evidence.runtimeDescriptorDigest === descriptor.runtimeDescriptorDigest`；窗口 `observedAt < expiresAt`；`runtimeGeneration ≥ 1`）→ deep freeze。

### 2.1 PMAP 完备性规则（按 E.0 面表，逐组件）

| 组件 | 必需面（PMAP 行内） | 组合层补充/委托 |
| --- | --- | --- |
| provider | identity / version / artifactDigest / contractDigest / behaviorConfigurationDigest 全有 | — |
| model | identity / behaviorConfigurationDigest | version / artifactDigest / contractDigest ← provider 委托（§3） |
| agent | identity / version / artifactDigest / contractDigest | behaviorConfigurationDigest ← roster 派生（§3；E.0「agent behavior 属运行态缺失」的静态最小语义） |
| preset | 每 roster 行 artifactDigest / contractDigest | `preset:set` 聚合 + 包身份另读（§3） |

任一行 `state !== 'observed'` 或上表必需面缺失 → `pmap-incomplete`。PMAP provenance 的 `observedAt` 与 evidence 窗口统一取投影的 `observedAt`（唯一受信观测瞬间；不引入第二套时钟）。

## 3. 组件映射表（v1；PMAP `urn:…:sha256:<hex>` → V2 `sha256:<hex>` 同 hex 换形，不重算）

| 组件 | identity | version | artifactDigest | contractDigest | behaviorConfigurationDigest |
| --- | --- | --- | --- | --- | --- |
| host | `host:sage-shell-host` | `4.0.0`（协议主版本 4 的**正式 SemVer 形**——'4' 不合 V2 version 文法（精确 SemVer 或 `YYYY-MM-DD`）；本票定义，协议变更即升级） | C2B `artifactSetDigest`（换形） | **protocolContractDigest**（§4.1） | **launchPolicyDigest**（§4.2） |
| harness | `harness:@deepseek-ai/dsh` | C2B `harnessVersion`（SemVer ✓） | C2B `artifactSetDigest`（委派：安装集内容摘要；host/harness 分包树粒度为登记遗留） | harnessContractDigest（§4.4） | **overlayPolicyDigest**（§4.3） |
| provider | PMAP `provider:<route>` | PMAP version | PMAP artifact（换形） | PMAP contract（换形） | PMAP behavior（换形） |
| model | PMAP `model:<p>/<m>` | **provider 委托**（权威记录口径：模型实现随 provider 包分发；委托关系即稳定语义） | provider 委托 | provider 委托 | PMAP behavior（settings 选择，换形） |
| agent | PMAP agent 行：`agent:<包名>@<版本>` 按 `<版本>`后缀确定性拆为 `agent:<包名>` | PMAP version | PMAP artifact（换形） | PMAP contract（换形） | **roster 派生**（= preset 组件 behavior 同值；E.0「agent behavior 属运行态缺失」的静态最小语义——agent 行为由可用预设组合定义，默认选择不可观测，登记 Host protocol 票） |
| preset | `preset:set`（canonical roster 聚合） | `dsh-agent-presets` 包版本（新读其 package.json；SemVer ✓） | `sha256(canonical[ {id,trust,artifactHex} 排序 ])` | presets 包 exports canonical 摘要（与 agent 行同构，`pmap-package-contract` 同款公式） | `sha256(canonical[ {id,trust,contractHex} 排序 ])`（行为配置=可用预设组合） |

**默认 preset 的运行时判定不在本票**（settings 为 YAML + 运行时可 mutate，E.0 判「不静态解析」仍成立）：descriptor 以 roster 覆盖；未来 Host protocol 票并入默认标记时 stable digest 改变属正常语义变更（重发 matrix）。`preset:set` 为 v1 复合语义（登记）。

## 4. 顶层 policy 文档与七个 provenance 字段（全部本票定义；canonical JSON 文档 + 手写 golden）

所有摘要统一 `sha256:` + 64 位小写 hex；digest 覆盖 canonical JSON.stringify（键序显式、无空格，沿用 PMAP canonical 纪律）。

1. **protocolContractDigest** = sha256(canonical `{kind:'sage.host-protocol-contract.v1', protocolVersion: SHELL_HOST_PROTOCOL_VERSION, fdPairing:[SHELL_REQUEST_PIPE_FD, SHELL_RESPONSE_PIPE_FD], frameKinds: protocol.ts 全部请求/响应帧 kind 常量集合（显式列举，golden 守）, chunkBytes: SHELL_PIPE_CHUNK_BYTES}`)（自 protocol.ts 常量取值）。
2. **launchPolicyDigest** = sha256(canonical `{kind:'sage.host-launch-policy.v1', argvPolicy:'[]', envPolicy:[DSH_LAUNCH_ENVIRONMENT_KEY 单键注入], homeBinding:'profile', loopback:'oidc-callback-only'}`)（描述 `resolveHostRuntime` 启动策略；字段语义实现时对照 runtime.ts，本票定义 canonical 文档）。
3. **overlayPolicyDigest** = sha256(canonical `{kind:'sage.shell-overlay-policy.v1', rootConfig: ROOT_CONFIG_CONTENT, overlayPatch: sha256(overlay patch 文件 bytes), localPatch: null | sha256(bytes)}`)（overlay = `<profile>/sage-host/shell.cordis.patch.yml`；**local patch 存在性与内容改变行为即必须改变本摘要**——否则同 digest 掩盖行为差异；文件缺失=null）。
4. **harnessContractDigest** = sha256(canonical `{kind:'sage.harness-boot-contract.v1', label: SHELL_LABEL, launchEnvironmentKey: DSH_LAUNCH_ENVIRONMENT_KEY, cmdline:'provided', connection:'host-protocol-4'}`)（自常量取值）。
5. **receiptDigest** = `'sha256:' + ActiveProfile.manifestSha256`（= `profile-manifest.json` 封印文件 SHA，paths.ts 已验证）。
6. **materializationInstanceDigest** = sha256(canonical `{kind:'sage.materialization-instance.v1', activeGeneration, receiptDigest, activatedAt}`)——实例级（含 generation/时间 → 只进 full evidence，ADR-0166 字段分类）。
7. **instanceAuthorityDigest** = sha256(canonical `{kind:'sage.instance-authority.v1', activeGeneration, manifestSha256, runtimeArtifactAttestationSha256, artifactSetDigest, ownedProfileDigest}`)——「本安装实例的权威身份」（前两值来自 ActiveProfile；后三值来自 C2B 投影）。
8. **mainObservationProvenanceDigest** = sha256(canonical `{kind:'sage.main-observation-provenance.v1', hostProjectionDigest: C2B projectionDigest, pmapSummary: sha256(canonical 逐行 {component,identity,state,digest} 摘要), registrySnapshotDigest}`)——「本 main 的观测序列」。
9. **healthObservationDigest**（用户裁决的最小语义）= sha256(canonical `{kind:'sage.runtime-health-observation.v1', artifactAttestationDigest, artifactSetDigest, outcome:'verified'}`)——C2A 复验结果（工件与封印一致）。**仅 provenance 陈述**：resolver 不据此放行 availability；C2C.4/C2C.5 到位后增强（登记）。
10. **livenessObservationDigest**（用户裁决的最小语义）= sha256(canonical `{kind:'sage.runtime-liveness-observation.v1', bootId, runtimeGeneration, loaderPhase:'active', observedAt, expiresAt}`)——C2B 观测时 host 存活且 epoch 稳定。
11. **registrySnapshotDigest** = `'sha256:' + <C2D 快照 snapshotId 的 hex 段>`（`urn:sage:capability-registry:sha256:<hex>` 换形；快照须经 C2D.1 kernel 的 exact 校验——实现时复用 kernel 解析器校验后再取 digest）。

## 5. capabilities 映射（自 registry 快照派生，无额外端口）

仅取 `state === 'approved'` 且 effective 的条目（**以投影 `observedAt` 为评估时刻**：`effectiveAt ≤ observedAt` 且 `observedAt < expiresAt`（expiresAt 缺省视为无界）），按 capabilityId 排序，逐条映射 `RuntimeCapabilityDescriptorV2`：

- `identity` = entry.capabilityId；`version` = entry.capabilityVersion（须精确 SemVer / calendar，违反 → `capability-invalid`）；
- `artifactDigest` = entry.descriptor.artifactSubjectDigest（换形）；`contractDigest` = entry.descriptor.toolContractDigest（换形）；
- `behaviorConfigurationDigest` = sha256(canonical `{launchContractDigest, operations: [{operationId, adapter, effectClass, dataBoundary, inputContractDigest, outputContractDigest, preflight}] 排序}`)（行为的 canonical 投影）；
- `registryDescriptorDigest` = entry.descriptor.descriptorDigest（换形）；`adapterMappingDigest` = sha256(canonical `[ {operationId, adapter:{identity,version,digest}} 排序 ]`)；
- 以上 canonical 投影为本票定义；实现时对照 C2D.1 kernel 既有 digest 函数——若已有同义摘要则复用不另造（登记实现注意项）；`verification/source` 非 `verified/c2c5` 的 approved 条目 → `capability-invalid`（真实 entry 属 C2D.2B）。

## 6. 接线（main）

`main/index.ts`：host `start()` 成功后构造 provider（真实 C2B provider + paths + 真实 `readFileBytes`；registry 端口缺席；local patch 自 `join(paths.root, LOCAL_PATCH_FILE)` 派生），**单次 `read()`** 并把稳定结果写一行 stdout（`sage shell: runtime inventory available` 或 `sage shell: runtime inventory unavailable (<code>)`；非敏感、零副作用）。seam 就绪 + 真实环境证据就地可取（当前预期 `unavailable (registry-unavailable)`）。provider 实例同时经 `createSageAppServiceProviders` options 传递（`runtimeInventory?: { read }`）供 C2E 之后消费（当前无消费者，登记）。

## 7. 文件结构

```text
apps/sage-shell/src/main/runtime-inventory-provider.ts   # 新增：组合 provider（端口注入）
apps/sage-shell/src/main/index.ts                        # 构造 + 单次 read + stdout 行 + options 传递
apps/sage-shell/src/main/app-service.ts                  # options.runtimeInventory?（透传槽）
apps/sage-shell/test/runtime-inventory-provider.spec.ts  # 新增：单元（goldens/映射/缺项矩阵/成对反例/自验）
apps/sage-shell/test/runtime-inventory-consumption.spec.ts # 新增：V2 resolver 消费（fixture matrix 以产出 stable pair 预发布）+ 真实 generation 集成
```

## 8. 测试与验收

1. **单元**：四 policy 文档 + 七个 provenance 字段的 canonical goldens（手写）；组件映射（urn→sha256 换形、model 委托、preset 聚合的排序不敏感性）；C2B 窗口复用断言。
2. **缺项矩阵**：逐端口缺席/非法 → 对应具名 code（host-projection-unavailable 带 C2B code；pmap-incomplete；policy-document-unavailable；registry-unavailable；capability-invalid）。
3. **成对反例（ADR-0166 P0 风险，生产者级）**：瞬态变化（bootId / observedAt / activeGeneration / receipt / runtimeGeneration）→ **仅** `inventoryEvidenceDigest` 变、`runtimeDescriptorDigest` 不变；语义变化（PMAP 行内容 / overlay bytes / local patch 出现 / presets roster 变化）→ **两者都变**。
4. **自验**：篡改 descriptor 任一字段后自验失败 → `assembly-invalid`（绝不输出不一致产物）；输出 deep freeze。
5. **消费测试**：把产出的 descriptor+evidence 喂入现有 V2 resolver（以产出的 `runtimeDescriptorDigest` 预发布 fixture matrix rule + fixture target）→ 得到 `equivalent`；证据 window 过期 → resolver 拒绝（freshness 生效）。
6. **真实 generation 集成**：真实 paths/文件 + 形状真实的 host 快照 stub → 走到 `registry-unavailable`（生产现状的如实读数）。
7. **变异 ≥4**：M1 descriptor 混入瞬态字段（如以 bootId 派生 host.identity）→ 成对反例红；M2 registry 缺席伪造空快照 → 缺项矩阵红；M3 overlay 摘要忽略 local patch → 行为覆盖用例红；M4 跳过绑定自验 → 自验用例红。
8. **收口**：`npm run typecheck && npm test && npx tsc && npm run smoke`；`pnpm run gate` 25/25；Note + ADR-0191 + README + ledger；feat + docs 两提交推送。**live 验收**：应用启动后 stdout 的 `runtime inventory unavailable (registry-unavailable)` 一行即真实证据（可选附 CDP 复核）。

## 9. 边界与遗留

- **不做**：C2D.2A registry provider、C2C.5 external capability provider、resolver/D.2 编排接线、matrix 发布、Host protocol 扩展、v1 任何改动、内核（compatibility.ts）零改动、C2B/PMAP 既有行为零改动。
- **登记遗留**：① 默认 preset 运行时判定（Host protocol 票）；**agent.behaviorConfigurationDigest 的静态最小语义（roster 派生）随该票并入默认选择后 stable digest 变更属正常语义变更**；② host/harness 分包 artifact 树粒度（现为安装集委派）；③ 三个 policy 文档的字段级语义与 runtime.ts / protocol.ts 常量同步由 golden 测试与评审守（语义变更必须改文档）；④ `preset:set` 复合语义；⑤ capability 映射的 canonical 投影若与未来 C2D.1 digest 函数重叠则收敛复用；⑥ health/liveness 的最小语义待 C2C.4/C2C.5 增强；⑦ `runtimeInventory` 槽在 D.2 接线前无消费者。
