# WT-02C.2E-PMAP / E.0 · runtime inventory PMAP 合同与静态层 producers（设计）

日期：2026-10-02 · 状态：按推荐默认执行（用户已定向队列 3-1-2，切片细节未异议；见 §2） · 上游：[ADR-0165](../../adr/ADR-0165.md)（复合证据）、[ADR-0166](../../adr/ADR-0166.md)（stable/full 分层）、[Host live inventory](../../notes/proposed/architecture/2026-09-28-host-live-inventory.md)（C2B 边界）、[执行计划](../../plans/2026-09-24-sage-self-owned-desktop-execution-plan.md)（C2E 拆分）

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
| **preset** | `@deepseek-ai/dsh-agent-presets`：`COMPOSITION_FILE = 'agent.cordis.yml'`；`USER_PRESET_DIR = '.agent-presets'`（harness home 下）；`SHIPPED_PRESET_ROOT`（包内 `presets/`，trust=system）；`PresetTrust = 'system' \| 'user'`；目录名即 preset id；`preset.yml` 为可选元数据 | 两 root 按序扫描、**first-root-wins per id**；`agent.cordis.yml` 存在性/可读性破损 → 该行 `broken`（对应 dsh discovery 语义）；静态层**不解析 YAML**（版本面恒 absent，文件 bytes 进 digest）且**不做** `!!js` 求值。**默认 preset 标记属运行态**（settings 名空间 `agent-presets.default` 层叠于 bundle config 之上，`dsh-agent-presets` lib 锚点），本票不产出该标记、不伪造 |
| **provider / model** | `@deepseek-ai/dsh-settings-file`：默认 `<harness home>/settings.yaml`（`.yaml/.yml/.json`，扩展名定格式；热加载语义——文件即真相）；`@deepseek-ai/dsh-agent-default-model`：命名空间 `agent-default-model`，`AgentDefaultModelSettings { provider, model, reasoningEffort? }` | 只读该命名空间的该三字段；**absent 的含义 = 用户设置面未配置**（settings 文档缺失或命名空间缺失均属合法 abs），effective 默认选择（bundle config 层）属运行态层；文档存在但解析失败 = broken（缺输入）。**secret 边界：settings 按约定只含引用与选择值（如 `apiKeyEnv` 风格的引用），producer 只携带白名单字段进入 evidence，绝不整档透传** |
| **agent** | `@deepseek-ai/dsh-agent` 包身份（profile `node_modules` 内 `package.json` 的 name/version） | 静态层 agent 面 = agent runtime 包身份与其 contract 面；会话级 agent 行为（loop 状态）属运行态 |
| **harness / host** | 归 C2B（`HostLiveInventoryProjectionV1` 已含 harnessVersion / hostProtocolVersion / generation / artifact digests） | PMAP 不重复生产；C2E.2 汇合时取自 C2B |

**五面映射（静态层语义域 = materialized-generations + harness-home 配置面）**：

| 组件 | identity | version | artifactDigest | contractDigest | behaviorConfigurationDigest |
| --- | --- | --- | --- | --- | --- |
| preset | `preset:<id>@<trust>`（**每个 roster 行一条 evidence**；default 标记属运行态、本票不产出） | absent（静态层不解析 `preset.yml`） | 目录内组成文件（`agent.cordis.yml` + 存在的 `preset.yml`）canonical 清单 bytes 的 urn digest | `agent.cordis.yml` 原文 bytes 的 urn digest | 同 contract 面（静态层二者同源；运行态 enablement 求值留协议票） |
| provider | `provider:<route>`（settings 值；absent 时不产生） | provider 包版本（route → 包名解析；不可解析 → broken） | provider 包在物化 tree 中的归属 digest（C2A artifactSet 覆盖面内取；缺 → broken） | provider 包 `package.json` exports 清单 canonical digest | settings `agent-default-model.provider` 值 + 来源锚点 |
| model | `model:<provider>/<model>`（absent 时不产生） | absent（provider-owned；不伪造） | absent（随 provider 包） | absent | settings 中 `model`/`reasoningEffort` 值 canonical bytes |
| agent | `agent:<包名>@<版本>` | 包版本 | 包树逻辑路径 bytes digest（同 provider 规则） | 包 `package.json` exports 清单 canonical digest | absent（默认 preset 标记属运行态层，本票不产出） |

- 所有 digest 统一 `urn:sage:pmap-<面>:sha256:<hex>`，canonical JSON 沿用兼容层同款（键序显式、无空格）；canonical 规则逐面写死于实现（goldens 对拍）。
- **producers 输出 candidate evidence**（非最终 `RuntimeComponentDescriptorV2`）：面可为 `absent`；`broken` 携带稳定原因码。C2E.2 汇合时：任一面 absent/broken 对该组件即不可产生描述符 → composition unavailable（本票不实现汇合）。

## 4. 证据形状（producer 输出，candidate）

producer 输出为 `readonly PmapComponentEvidence[]`：provider / model / agent 各至多一条（absent 时也各出一条显式 absent），preset 每 roster 行一条（shipped 与 user 分列，`identity` 携带 `@<trust>`）。

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

1. **fixture 根**（合成 shipped/user/settings 组合）：正常观测（preset roster + 默认 preset + provider/model/agent 五面）；user root 缺失 → 合法 absent 面；settings 缺失 → provider/model absent；shipped root 缺失/`agent.cordis.yml` 破损/包不可解析 → broken + 稳定原因码。first-root-wins 与 trust 标注逐项断言。
2. **真实 root 双跑**：对当前真实 generation + harness root 运行，断言与实测形态一致（4 个 shipped presets、无 user presets、无 settings.yaml → 对应 absent 读数），零写入。
3. **goldens**：canonical bytes / urn digests 手写期望值对拍；变异 ≥3（digest 面互换 / first-root-wins 破坏 / absent 与 broken 混淆）。
4. 全量：`npm run test`、`npm run typecheck`、`npx tsc`、`npm run smoke`、`pnpm run gate` 全绿；Note + ADR-0187 + ledger。

## 7. 不做（边界）

`RuntimeDescriptorV2` / `RuntimeInventoryEvidenceV2` 汇合（C2E.2）、capabilities 面（C2D/C2C）、运行态 effective 观测与 Host protocol 扩展、Registry、Matrix、UI、插件、`/` 与 settings 的任何写入、v1 event schema。
