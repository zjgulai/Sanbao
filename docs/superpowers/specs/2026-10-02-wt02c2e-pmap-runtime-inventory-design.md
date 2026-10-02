# WT-02C.2E-PMAP / E.0 · runtime inventory PMAP 合同与静态层 producers（设计）

日期：2026-10-02 · 状态：按推荐默认执行（用户已定向队列 3-1-2，切片细节未异议；见 §2）· **2026-10-02 修订（WT-02C.2E-PMAP.1，ADR-0194）：preset 面与 provider/model 面的源模型随内核 0.2.0-rc.2 换代为「声明行模型 + 层叠行配置」——§3/§4/§6 按修订后为准，旧目录扫描与 settings.yaml 模型已无对象（变更动因与旧文摘要见 Note 与 ADR-0194）** · 上游：[ADR-0165](../../adr/ADR-0165.md)（复合证据）、[ADR-0166](../../adr/ADR-0166.md)（stable/full 分层）、[Host live inventory](../../notes/proposed/architecture/2026-09-28-host-live-inventory.md)（C2B 边界）、[执行计划](../../plans/2026-09-24-sage-self-owned-desktop-execution-plan.md)（C2E 拆分）

## 1. 目标与切片

C 链剩余依赖：`RuntimeDescriptorBodyV2` 的 **provider / model / agent / preset** 四面（PMAP）从未有受信 producer；C2B 只给 boot 层观测且明确不构造完整 `RuntimeInventoryEvidenceV2`。本票按计划拆分的 `WT-02C.2E-PMAP` + `WT-02C.2E.0` 落地：

1. **PMAP 观测矩阵合同（E.0）**：逐组件钉死五面（identity / version / artifactDigest / contractDigest / behaviorConfigurationDigest）的覆盖主体、canonical 规则与来源 provenance（全部带 dsh 包源码锚点）；空/缺语义；静态层语义域标注。
2. **静态层 producers 实现**：main-owned、只读的 PMAP evidence 生产者——从物化 profile 与 harness root 的受信文件面观测，禁止 placeholder。
3. **不做**（后续票）：`RuntimeDescriptorV2` 组装与 `RuntimeInventoryEvidenceV2` 汇合（C2E.2）、capabilities（C2D/C2C）、运行态 effective 观测（需 Host protocol 扩展，独立票）、Registry、UI。

## 2. 按推荐执行的默认裁定（如实登记）

- **切片**：合同 + 静态层 producers 同票（用户以「3-1-2」定向队列后未对切片细节提出异议；运行态层与 composition 显式留后续票）。
- **空态语义**：区分**合法空集**（约定用户面不存在，如 `settings.yaml` 未配置、user preset root 缺失）与**缺输入**（受信源存在性/可读性破损，如 shipped preset root 缺失、composition 文件不可读、包不可解析）——前者产生显式 `absent` 面，后者产生 `broken`（composition 阶段映射 unavailable）。
- **观测通道**：静态层先行（main-owned 只读文件观测 + C2B 已提供的 boot 绑定）；**运行态 effective 配置（env 层合并、实际 mount 的 enablement 求值）不在静态层语义域**，需 Host protocol 扩展另票，本票在 evidence 的 `observationScope` 上如实标注。

## 3. PMAP 观测矩阵（源码锚点）

| 组件 | 受信来源（锚点） | 说明 |
| --- | --- | --- |
| **preset** | 合成层 patch 文件内的**声明行**：`name: '@deepseek-ai/dsh-agent-preset'` 的行，`config.id` 即 preset id。层序 = `dsh.profile.bundles` 顺序的各 bundle `dsh.bundle.patch` 文件（字符串或文件数组、按序）→ profile `cordis.patch.yml` → shell overlay `sage-host/shell.cordis.patch.yml`；`PresetTrust = 'system'(bundle 层) \| 'user'(profile/overlay 层)` | 行块文本即组成 bytes：**不引 YAML 引擎、不执行 `!!js`**，仅按缩进切行块 + 行扫 `name`/`config.id`；`config.id` 不可静态提取 → 该行 `broken`（`preset-row-unparsable`）；**同 `config.id` 重复声明 → 首条 `observed`、后续 `broken`（`preset-id-collision`，镜像 registry 的 `Duplicate agent preset` 拒绝语义）**；零声明 = 合法空 roster（E.2 已定空集合法）；bundle 目录/manifest/patch 列表/profile manifest 不可读 → preset+model 双面 `broken`（`patch-layer-unresolved`）；**运行态默认标记（registry `config.default` / `selectedDefault`）与按 row-id 的覆盖补丁不在静态面**（协议票） |
| **provider / model** | `agent-default-model` 声明行的**层叠配置**：行 `id: agent-default-model` 的 `config` 块沿同一层序浅合并（后者覆盖前者；base bundle 缺省 `provider: deepseek-official / model: deepseek-flash`）；provider 路由 → 包名用**静态校准表**（`deepseek-official → @deepseek-ai/dsh-llm-deepseek-api-key`、`deepseek-account → @deepseek-ai/dsh-llm-deepseek-account`；表外或包不可读 → `broken` `provider-package-unresolved`；新路由须随内核升级同步此表）；provenance = 最后贡献行所在层文件 | 只携带白名单字段 `{provider, model, reasoningEffort?}` 与来源层，key 引用（如 `apiKeyEnv` 等）**绝不整档透传**；config 块不可静态提取或必填字段缺失 → `broken`（`model-selection-unparsable` / `model-selection-incomplete`）；任何层都没有该行 → `broken`（`model-selection-row-missing`，缺输入）。**`settings.yaml/json` 不再是选择源**（0.2.0 一次性导入后其值落在 profile patch，被层模型自然覆盖） |
| **agent** | `@deepseek-ai/dsh-agent` 包身份（profile `node_modules` 内 `package.json` 的 name/version） | 静态层 agent 面 = agent runtime 包身份与其 contract 面；会话级 agent 行为（loop 状态）属运行态 |
| **harness / host** | 归 C2B（`HostLiveInventoryProjectionV1` 已含 harnessVersion / hostProtocolVersion / generation / artifact digests） | PMAP 不重复生产；C2E.2 汇合时取自 C2B |

**五面映射（静态层语义域 = materialized-generations + harness-home 配置面）**：

| 组件 | identity | version | artifactDigest | contractDigest | behaviorConfigurationDigest |
| --- | --- | --- | --- | --- | --- |
| preset | `preset:<config.id>@<trust>`（**每个声明行一条 evidence**；collision 的后续行为 `broken`；默认标记属运行态、本票不产出） | absent（静态层不解析行内 YAML） | 单条 `{path: <层标签>#<行 id>, sha256: 行块 bytes}` 的 canonical 清单 urn digest | 行块 bytes 的 urn digest（base64 载体，同旧式） | 同 contract 面（静态层二者同源；运行态 enablement 求值留协议票） |
| provider | `provider:<route>`（层叠配置值；absent 时不产生） | provider 包版本（route → 包名经静态校准表；表外/不可读 → broken） | provider 包在物化 tree 中的归属 digest（C2A artifactSet 覆盖面内取；缺 → broken） | provider 包 `package.json` exports 清单 canonical digest | 层叠配置 `provider` 值 + 来源层文件 |
| model | `model:<provider>/<model>`（absent 时不产生） | absent（provider-owned；不伪造） | absent（随 provider 包） | absent | 层叠配置 `model`/`reasoningEffort?` 值 canonical bytes + 来源层文件 |
| agent | `agent:<包名>@<版本>` | 包版本 | 包树逻辑路径 bytes digest（同 provider 规则） | 包 `package.json` exports 清单 canonical digest | absent（默认 preset 标记属运行态层，本票不产出） |

- 所有 digest 统一 `urn:sage:pmap-<面>:sha256:<hex>`，canonical JSON 沿用兼容层同款（键序显式、无空格）；canonical 规则逐面写死于实现（goldens 对拍）。
- **producers 输出 candidate evidence**（非最终 `RuntimeComponentDescriptorV2`）：面可为 `absent`；`broken` 携带稳定原因码。C2E.2 汇合时：任一面 absent/broken 对该组件即不可产生描述符 → composition unavailable（本票不实现汇合）。

## 4. 证据形状（producer 输出，candidate）

producer 输出为 `readonly PmapComponentEvidence[]`：provider / model / agent 各至多一条（absent 时也各出一条显式 absent），preset 每声明行一条（层内声明与顺序即产出顺序；`identity` 携带 `@<trust>`）。

```ts
interface PmapComponentEvidence {
  readonly schemaVersion: 'sage.pmap-component-evidence.v1'
  readonly component: 'provider' | 'model' | 'agent' | 'preset'
  readonly observationScope: 'materialized-static'   // 运行态 effective 不在本层
  readonly state: 'observed' | 'absent' | 'broken'
  readonly identity?: string
  readonly version?: string
  readonly artifactDigest?: string
  readonly contractDigest?: string
  readonly behaviorConfigurationDigest?: string
  readonly provenance: { readonly source: string; readonly observedAt: string; readonly bootId?: string }
  readonly reason?: string          // broken 时稳定原因码；absent 时约定原因
  readonly evidenceDigest: string   // 对上全体的 urn digest（canonical）
}
```

`provenance.observedAt` 来自显式注入的 trusted clock；`bootId` 可选绑定（来自 C2B 快照，尚未接线时留空——C2E.2 再强制）。deep freeze；无 I/O 泄漏（所有文件读取经注入 port）。

## 5. 文件结构

```
apps/sage-shell/src/main/runtime-inventory-pmap.ts   # 新增：静态层 producers（注入 fs/roots/clock）
apps/sage-shell/test/runtime-inventory-pmap.spec.ts   # 新增：fixture 根 + 真实 root 双跑 + goldens + hostile 输入
```

只读纪律：不写任何 harness/profile 文件；不读 `.credentials.yaml`；不整档透传 settings；不跟随越界 symlink（沿用 C2A/C2B 的 containment 纪律）。

## 6. 测试与验收

1. **fixture 根**（合成 bundle patch 层 + profile patch + overlay 组合）：正常观测（layered model 选择 + provider 包解析 + agent + preset 声明 roster 五面）；profile/overlay 层覆盖 base 缺省 → 后者生效；同 `config.id` 重复声明 → 首条 observed、后续 broken；行块不可静态提取 → `preset-row-unparsable`；层不可读 → preset+model 双面 `patch-layer-unresolved`；零声明 → 空 roster（合法）；hostile（行内 `!!js` 不执行、敏感 token 不出现在 evidence）。
2. **真实 root 双跑**：对真实 generation 运行，断言与实测形态一致（**4 条 system preset 声明**（standard/ptc/minimal/cordis，来自 `dsh-web-app` 的 `presets/*.patch.yml`）+ **model 观测自 base bundle 行缺省**（`deepseek-official/deepseek-flash`，`llm-deepseek-api-key` 包在位）），零写入。
3. **goldens**：canonical bytes / urn digests 手写期望值对拍；变异 ≥3（digest 面互换 / collision 首条处置破坏 / absent 与 broken 混淆）。
4. 全量：`npm run test`、`npm run typecheck`、`npx tsc`、`npm run smoke`、`pnpm run gate` 全绿；Note + ADR-0194 + ledger。

## 7. 不做（边界）

`RuntimeDescriptorV2` / `RuntimeInventoryEvidenceV2` 汇合（C2E.2）、capabilities 面（C2D/C2C）、运行态 effective 观测与 Host protocol 扩展、Registry、Matrix、UI、插件、`/` 与 settings 的任何写入、v1 event schema。
