# Compatibility Authority：目标、运行清单、不可变矩阵与产品编排边界

- 日期：2026-09-28
- 状态：WT-02C.0 revision 11 与 WT-02C.1A revision 13 治理合同已落档；WT-02C.1 revision 12、WT-02C.1B revision 14、WT-02C.2A revision 15、WT-02C.2B revision 16 核心源码已在当前未提交工作树实现，revision 17 已关闭 C2B 官方 smoke / pin 接缝并使 quick gate 回到 23/23；WT-02C.2C.0 revision 18 固定 External Capability Evidence 治理合同，WT-02C.2C.1 revision 19 local pure descriptor / canonicalization kernel 已完成并通过终验；C2C-SEAM-DECISION revision 20 已决定只走 bridge-owned 受控只读 seam；WT-02C.2D.0 revision 21 已固定 Sage-owned Capability Registry 治理合同；WT-02C.2D.1 revision 22 已实现并验证无 I/O 的 immutable Registry pure kernel；WT-02C.2C.5 revision 23 已实现无 I/O 的 aggregate evidence kernel / contract；WT-02C.2C.3 revision 24 已完成受控 local artifact observer；WT-02C.2C.4 revision 25 已完成无 I/O 的 bounded availability / preflight contract；WT-02C.2T revision 26 已落档 target requirement governance，revision 27 已完成无 I/O pure target requirement kernel 与 app-bundled provider；WT-02C.2M revision 28 已完成无 I/O app-bundled MatrixV2 provider、历史 canonical bytes 与独立 append-only revocation source；WT-02C.3.0 revision 29 已固定 `CompatibilityEvaluationEvidence` 旁路 schema、历史矩阵取证、strict replay、同事务原子性与 retention / legal-hold / purge / export / restore 治理合同；WT-02C.3.1 revision 30 已完成无 I/O pure exact codec 与 strict historical replay；WT-02C.3.2 revision 31 已完成同一 Sage-owned SQLite adapter 的 evidence sidecar persistence、原子 append、生命周期 / hold / purge / export / restore / recovery 与 fail-closed 验证。C2C.2～C2C.5 production observation/provider、实际 artifact / policy provenance、C2D.2 Registry provider / real entry、C2E 完整 inventory composition、Application Service 与真实产品接线仍未实现
- ADR：[ADR-0165](../../../adr/ADR-0165.md)、[ADR-0166](../../../adr/ADR-0166.md)、[ADR-0167](../../../adr/ADR-0167.md)、[ADR-0168](../../../adr/ADR-0168.md)、[ADR-0169](../../../adr/ADR-0169.md)、[ADR-0170](../../../adr/ADR-0170.md)、[ADR-0171](../../../adr/ADR-0171.md)、[ADR-0172](../../../adr/ADR-0172.md)、[ADR-0173](../../../adr/ADR-0173.md)
- 相关合同：[BusinessMatter](../../../specs/2026-09-24-businessmatter-contract.md)、[Sanbao → Sage UI 一致性](../../../specs/2026-09-27-sanbao-to-sage-ui-consistency-contract.md)、[能力装配](2026-09-27-capability-mounting-contract.md)、[Identity / Policy Resolver](2026-09-28-identity-policy-resolver.md)

- 当前状态补充（WT-02C.2C.2 seam contract preflight revision 32）：formal bridge-owned seam 仍未发布；本批仅新增 Sage-owned、list-only、无 I/O 的合同收集器与隔离 fake connection 测试，验证有界分页、opaque cursor、同代 generation、失效与零 `tools/call`。formal C2C.2、C2C.5 provider、C2D.2 real entry、C2E、Application Service、UI、插件和真实产品接线仍保持 `pending / blocked`。

- 当前状态补充（WT-02C.2C.2 seam-intake gate revision 33）：对 ADR-0170、`apps/sage-shell/seed/package.json` 与 seed lock 的只读复核未发现新的 bridge release / 可复现 fork 或正式 observation port；`@deepseek-ai/dsh-mcp-client` 仍精确锁定 `0.1.5-rc.2`，公共导出与 `ConnectionHandle` 能力没有变化。revision 33 只完成证据与门禁收口，不改 package、lockfile、vendor、node_modules 或源码；正式 C2C.2、C2C.5 provider、C2D.2 real entry、C2E、Application Service、UI、插件和真实产品接线继续保持 `pending / blocked`。

## Problem

当前 `BusinessMatter` 能拒绝缺字段、重复 capability 和显式 `unknown`，却只把调用方提供的 `CompatibilityDecision` 与 `ExecutionSnapshot` 当作结构化输入。它没有可信 target、inventory provider、matrix owner 或产品编排入口；因此 `{ outcome: "equivalent", matrixId: "anything", reason: "anything" }` 只要形状合法就可能通过领域门。

运行侧也没有一个组件能同时证明 capability 的来源、实际字节、配置、contract、active generation、boot/runtime generation、当前健康和产品授权。profile receipt、Host ready、Loader entry、MCP 工具注册、进程存在、package version 与单次 probe 都有价值，但它们只覆盖不同的局部事实。

真实 OIDC 和组织授权仍需部署输入。若把 compatibility 与登录工作绑成一条串行任务，新 UI 和插件契约会被无谓阻塞；若直接放宽，则 fixture、Host 或插件自报会成为新的越权面。

## 现状证据

### 领域侧

- `VersionedIdentity` 只有 `identity + version + digest`；当前领域层检查非空和 capability identity 唯一性，不验证这些值由谁产生或是否对应实际 artifact。
- `CompatibilityDecision` 只有 `outcome + matrixId + reason`；当前领域层要求 `equivalent`，但不验证 matrix 是否存在、不可变、未撤销、与 current revision 或 execution snapshot 对应。
- `startAttempt()` 仍直接接收调用方构造的 execution snapshot 和 compatibility；v1 codec / event store 能保护 shape 与历史链，却不能把不可信来源变成 authority。
- `reconfirmRevision()` 记录一次当时的 compatibility 输入，但不应被解释为后续 attempt 的永久通行证。

### 运行侧

- Host `ready` 只有 protocol 与 DSH version；Adapter `ready` 只证明 Cordis connection service 可解析。
- profile receipt 验证 materialization copy plan 中的 Sage-owned 文件，但安装后的 `node_modules`、最后覆盖的 `cordis.local.patch.yml` 和外部 MCP artifact / contract 不在完整 attestation 内。
- 2026-09-27T20:56:07Z 只读复核：active pointer 指向 generation `bee8a015-01d7-4d56-b6cf-f02cbd7d5300`，manifest SHA-256 为 `b1cef015065075601e3f89ab5b2630b0827b588ebe592f1edbd05c78a1143e3e`，`activatedAt=2026-09-27T14:47:25.595Z`；其中 `<Sage root>/harness/profiles/.sage-generations/<generation>/sage-host/profile/paths.js` 的 SHA-256 为 `8caf8b8561b7d5d70778f281db0f62df6bbb7bf2804655d1a8aef50954a17d49`，当前仓库构建 `apps/sage-shell/lib/profile/paths.js` 为 `cd9ddd44751ba3aaa0c29f8011bac79da242ba47b4420009a4a2c9aec4c08e46`。receipt 与 pointer 一致不等于 active generation 与当前 build 一致；repository、build、active generation 与 live process 必须作为不同事实处理。
- 静态合成能得到 desired entries，但 `enabled` 不等于 loaded、healthy、inventory-verified、compatible、product-authorized 或 runtime-verified。
- Jev 已有 Host 启动层的历史进程与负控证据，但当前没有可信 capability descriptor、完整 artifact/tree digest、normalized tool-contract digest 或 boot-scoped health evidence；必须保持 `mounted / runtime-observed / compatibility-unproven`。

## Decision

### 1. 四个责任与 owner

| 责任 | owner | 产生的事实 | 不拥有的责任 |
| --- | --- | --- | --- |
| `CompatibilityTargetProvider` | Sage product/security governance | 当前 matter revision 的不可变 compatibility target | 不读取插件自报 outcome，不执行 capability |
| `RuntimeInventoryProvider` | Electron main | 当前 boot 下、绑定 active generation 的 canonical runtime inventory | 不决定业务是否等价 |
| `CompatibilityMatrixProvider` | `Sage Compatibility Authority` | app-bundled、不可变、可追溯与可撤销的 matrix | 不读取 UI 选择来临时造规则 |
| `CompatibilityResolver` | 独立 security kernel | 纯、确定性的 resolution | 无文件、网络、Host、profile、插件或全局状态 I/O |
| Application Service | Sage product layer | 固定顺序编排各 authority 与 domain / adapter | 不拥有或改写 target、inventory、matrix 内容 |

### 2. Revision-bound Compatibility Target

target 至少表达：

- `matterId`、`revisionId`、canonical revision digest；
- 精确 `actionScopes`，每项含 `effectClass + requiresDecision`；
- permission boundary 与 data destination 的规范化摘要；
- Provider / Model / Agent / Preset requirements；
- 每项 required Capability 的 identity、版本 / 版本策略、artifact / contract requirement；
- target schema/canonicalization version 与 canonical target digest。

target 由受信 provider 从当前 strict-rehydrated matter/revision 与产品登记合同生成。renderer、插件、Host、模型、URL/query、action body 和既有 execution snapshot 都没有 target 输入权。任何 revision、安全相关内容或 action scope 变化都产生新 target digest。

当前 v1 revision 尚未包含完整、机器可读的 capability requirement 字段。WT-02C.1 可以用明确标记的 fixed fixture target 验证纯 kernel；WT-02D 产品接线前必须建立受信 target provider，不能从自由文本猜测。本批不修改 v1 event schema。

### 3. Main-owned Runtime Inventory

inventory 至少覆盖：

- active profile generation、receipt digest 与 materialization identity；
- Host/Harness runtime identity、version、artifact digest；
- 当前选中的 Provider、Model、Agent、Preset；
- 每项 Capability/plugin 的稳定 identity、version、artifact/tree digest、配置 digest 与 normalized contract digest；
- 影响行为的 launch / protocol / local overlay 摘要；
- boot ID、runtime generation、observation timestamp；
- inventory schema/canonicalization version 与 canonical inventory digest。

来源采用双证据：

```text
immutable artifact attestation
          +
boot-scoped live observation
          ↓
trusted runtime inventory
```

Host、Loader、plugin、MCP server 和 provider 只能给 observation 或候选 metadata。Electron main 必须把 observation 与 app-owned provenance、active generation、receipt、安装完整性和当前 boot 绑定后，才允许进入 inventory。任一 required fact 缺失、无法验证或相互冲突时，inventory 状态为 `unknown`，不得补默认值。

### 4. Immutable Compatibility Matrix

首版采用 app-bundled immutable provider，不先引入远端控制面。每份 matrix：

- 使用明确版本的 canonical bytes；
- owner/issuer 为 `Sage Compatibility Authority`；
- `matrixId = urn:sage:compatibility-matrix:sha256:<canonical-bytes-digest>`；
- 包含 schema、matrix semantic version、target/inventory contract version、规则和生命周期元数据；
- 发布后不可覆盖，修正生成新 ID；
- revocation 使用独立、追加且可追溯的记录；
- revoked matrix 不授权新 action，但历史 bytes 保留到相关事件 retention 到期；
- 插件/provider 的 compatibility claim 只能进入审阅候选，不得自行发布等价结论。

SHA-256 只证明 canonical bytes 的内容身份，不自动证明业务等价；等价关系来自已审阅 matrix 规则。SemVer、Electron app/runtime version 和 package version 都只能成为 identity 的组成事实，不能单独产生 `equivalent`。

### 5. Outcome 与失败语义

只有以下条件全部成立，resolver 才返回 `equivalent`：

1. target、inventory、matrix 均通过 exact runtime shape 与 provenance 校验；
2. target 绑定 current revision；inventory 绑定 current active generation 与 boot；
3. matrixId 重算一致、未过期、未撤销；
4. 恰好命中一条规则；
5. 全部 required identity、version、digest、contract、action scope、effect、permission 与 data-boundary 均被覆盖；
6. 没有未批准的额外 capability、重复、冲突、歧义或 provider failure。

结果只有三类：

- `equivalent`：唯一精确命中，允许继续进入独立的 identity/policy 与 BusinessMatter 门；
- `requires-new-revision`：matrix 明确知道当前 runtime 变化改变 scope、permission、destination、effect 或 capability semantics；
- `unknown`：缺失、未登记、未验证、过期、撤销、重复、冲突、多个规则命中、provider 不可用或无法取得 matrix artifact。

后两者都阻断。`reason` 用于解释，不是 authority；authority 来自已验证 input、matrix provenance 与受信 resolver。

### 6. Compatibility 不替代 Availability

compatibility 是相对稳定的 artifact/contract 语义判断；availability 是短生命周期的当前可用性。Loader active、MCP tool registered、进程存在、历史调用成功或 compatibility equivalent 都不能替代真实动作前的 fresh capability preflight。

每个外部副作用、持久写入与 privileged 边界前必须重新确认：

- identity / policy authority 仍有效；
- revision 与 target digest 未变化；
- active generation、boot/runtime generation 与 inventory digest 未变化；
- matrix 未撤销；
- capability 仍健康且能执行该精确 operation。

任一变化都终止旧 attempt 或返回具名阻断，不沿用旧 `equivalent`。

### 7. UI、插件与产品边界

产品 action boundary 不接受：

- `outcome`、`matrixId`、`reason`；
- `executionSnapshot`、`targetDigest`、`inventoryDigest`；
- 任意“兼容”“安全”“只读”的调用方布尔值。

UI 只能读取安全投影后的 compatibility status、稳定 denial reason code、缺失证据类别、是否需要新 revision 与不含 secret 的 execution identity 摘要。插件、Host 与模型只能返回候选 metadata、liveness、工具合同或受控执行结果。

继承的 DSH entries 默认是内部 runtime implementation。只有进入 Sage-owned Capability Registry allowlist、拥有稳定 descriptor/provenance 并经明确 Adapter mapping 的条目，才可成为产品 capability；mounted、enabled 或工具可见都不自动升级状态。

### 8. 唯一产品编排顺序

```text
ActionIntent（不可信）
  → Identity / Policy Resolver：授权读取当前事项
  → strict rehydrate current BusinessMatter / revision
  → CompatibilityTargetProvider
  → Identity / Policy Resolver：精确 operation + action policy 新鲜求值
  → RuntimeInventoryProvider
  → immutable matrix provider + pure resolver
  → BusinessMatter command 重验 revision / decision / attempt
  → authoritative event store
  → Capability Adapter fresh preflight / execute
  → artifact / failure / receipt
```

当前 v1 strict replay 只重放持久化的 `ExecutionSnapshot` / `CompatibilityDecision` DTO，不查询任何 matrix，也不证明当时 target、inventory、matched rule 与 outcome 的来源绑定。`matrixId` 只标识 immutable matrix bytes，不标识一次 evaluation。未来审计可以按 `matrixId` 取回历史 matrix，但必须以独立 `CompatibilityEvaluationEvidence` 绑定当时的 target digest、inventory digest、matched rule、outcome、evaluation time 与 matrix provenance；该 evidence 的 schema、retention 与 event/store 接线由 WT-02C.3 / WT-02D 另行确认。本批不得把这一未来合同写成当前 v1 已有能力，也不得使用当前 matrix 重新求值并改写旧 outcome。`reconfirmRevision()` 只说明当时该 revision 仍可被考虑；下一次 attempt 必须重新求值。

### 9. 不等待真实 OIDC 的安全并行面

可以并行：

- WT-02C.1 纯 resolver、canonical matrix ID 与 hostile fixtures；
- UI-01 的 fixture / blocked / unknown / requires-new-revision 只读 projection；
- capability descriptor、artifact attestation、inventory adapter 和 health probe 开发。

继续阻断：

- 真实业务 mutation、decision、attempt、receipt；
- 真实敏感经营数据；
- 外部 API mutation、工具调用与不可逆副作用；
- 任何用 test provider、fixture target 或 development-unsealed artifact 形成的生产允许结论。

### 10. WT-02C.1 当前实现（revision 12，当前工作树未提交）

WT-02C.1 已新增独立的 `src/security/compatibility.ts` 纯内核与 `test/compatibility.spec.ts` 对抗测试，没有修改 `BusinessMatter`、v1 event schema、codec/store、Host、profile、product、Adapter、UI、插件、package 或 lockfile。实现边界如下：

- resolver 只接收显式 `evaluatedAt`、current revision binding、fixed fixture target、fixed fixture inventory，以及已经 materialize 的 `available | unavailable` matrix provider result；不调用 provider，不读取系统时间、文件、网络、Electron、Host、profile、插件或全局状态。C1 不证明 `evaluatedAt` 或 materialized result 的调用来源可信；该 trust boundary 留给未来 composition；
- target、inventory、matrix、revocation 和全部嵌套结构使用 exact runtime shape，拒绝 unknown / symbol / non-enumerable key、accessor、Proxy、错误 prototype、稀疏数组、重复 action scope / capability identity 与无效 UTC 时间；调用方输入不被修改或冻结，内核只使用规范化副本，返回结果被冻结；
- canonicalization v1 标识为 `sage.compatibility-canonical-json.v1`：先完成 exact parse，再按固定 schema 字段顺序重建对象；action policy、capability 与 matrix rule 使用与 locale 无关的字符串顺序稳定排序，最后以 UTF-8 `JSON.stringify()` 字符串计算 SHA-256；
- target 与 inventory 的内容地址分别为 `urn:sage:compatibility-target:sha256:<64-lowercase-hex>` 和 `urn:sage:runtime-inventory:sha256:<64-lowercase-hex>`；`matrixId` 保持 `urn:sage:compatibility-matrix:sha256:<64-lowercase-hex>`，位于 provider envelope，不进入被 hash 的 matrix body；canonical matrix 使用不可变字符串，不暴露可变 `Buffer` / `Uint8Array`；
- v1 version policy 只接受合同中精确的 schema / canonicalization / matrix semantic version，不解释 SemVer range、通配符、优先级或 selector DSL，也不因“版本相同”自行生成 `equivalent`；
- resolver 对 inventory 声明的 observation window 执行 `observedAt <= evaluatedAt < expiresAt` 半开区间检查；只有同一 `(targetDigest, inventoryDigest)` 恰好命中一条 matrix rule，才返回 `equivalent` 或该规则显式声明的 `requires-new-revision`。零命中、duplicate rule ID、同 digest pair 的 conflict / ambiguity、digest 或 matrix ID 不一致、inventory / matrix 未生效或过期、matrix 已撤销、provider unavailable / malformed 均返回稳定 typed `unknown` code；输出 `reason` 是内核常量，只有 canonical bytes 重算一致后的 matrix ID 才可进入输出，不回显 caller、provider exception 或 matrix 自由文本；
- `computeCompatibilityTargetDigest()`、`computeRuntimeInventoryDigest()`、`canonicalizeCompatibilityMatrix()` 与 `computeCompatibilityMatrixId()` 是本地 fixture / artifact 构造辅助，不证明发布 provenance，也不把 TypeScript 类型或 matrix 自报 issuer 升格为 trust anchor。

本节验证的是 fixed fixture 下的纯解析、内容寻址和单规则决议。`available` result 与 `evaluatedAt` 仍需未来 composition 保证来自 app-bundled provider 与受信 clock。WT-02C.2A 已另行补齐激活前的 materialization-time artifact attestation，唯一完整事实见 [Runtime Artifact Attestation 架构记录](2026-09-28-runtime-artifact-attestation.md)；WT-02C.2B 已补齐独立的 boot-scoped Host observation，唯一完整事实见 [Host Live Inventory 架构记录](2026-09-28-host-live-inventory.md)。两者尚未与 C2C external capability、C2D Registry、可信 target / matrix provider 或产品 Application Service 组合。真实 target provider、完整 runtime inventory、Capability Registry、`CompatibilityEvaluationEvidence`、历史 retention、WT-02D Application Service、领域 DTO 转换、产品 UI / 插件接线、真实数据与外部动作仍未实现。测试中的 `equivalent`、安装时 attestation 与 Host live projection 都不能成为生产权限或产品验收证据。

当前 exact digest-pair 还存在一个明确的非生产限制：`targetDigest` 包含具体 `matterId / revisionId / revisionDigest`，`inventoryDigest` 包含具体 `bootId / runtimeGeneration / observedAt / expiresAt`。因此 bundled immutable matrix 无法预先枚举未来事项 revision 与每次 boot observation。WT-02C.1A revision 13 已由 [ADR-0166](../../../adr/ADR-0166.md) 决定以 full evidence digest 保留当次实例、以 stable semantic / descriptor digest 匹配预发布 matrix；WT-02C.1B revision 14 已在同一独立 kernel 新增 MatrixV2 / stable-full binding，revision 12 的 v1 canonical bytes、digest namespace 与 fixture 行为继续冻结为 migration evidence。C2A 已完成 materialization-time content attestation，C2B 已完成独立 boot-scoped projection；MatrixV2 在可信 provider / clock composition、C2C、C2D、C3 与 WT-02D 分别关闭前仍禁止产品接线，也禁止按事项、revision 或 boot 动态铸造 matrix。

最终本地验证：compatibility spec 12/12、相邻 security/domain 92/92、产品/Adapter/handler 11/11、产品边界 5/5、Sage Shell 全量 21 files / 242 tests、strict spec compile、typecheck、build、ADR/docs-links 31/31 与 Sage quick gate 23/23 均通过；三条只读审查最终为 P0=0、P1=0。它们仍只是当前未提交工作树证据，不是 `HEAD`、发布、产品 authority 或运行验收。

### 11. WT-02C.1A 双层 exact-digest 合同（revision 13，当前工作树未提交）

WT-02C.1A 只固化合同，不改 `compatibility.ts`、测试、v1 event schema、package、lockfile 或任何产品接线。长期匹配不再把单次实例 digest 当成 bundled matrix key，但也不删除其 provenance：

| 对象 | Stable lookup material | Full evidence material | Authority owner | 必须证明的绑定 |
| --- | --- | --- | --- | --- |
| Compatibility target | `targetSemanticDigest`：action policy / effect / decision requirement、permission / data policy 语义、完整 runtime requirements | `targetEvidenceDigest`：matter、current revision、exact instance boundary 与 target provider provenance | `CompatibilityTargetProvider` / product-security governance | full evidence 内的 descriptor 必须由 kernel 重算为同一 stable digest。 |
| Runtime inventory | `runtimeDescriptorDigest`：实际 artifact / tree、normalized contract / configuration、Registry descriptor、Adapter mapping 与行为相关 runtime facts | `inventoryEvidenceDigest`：active generation / receipt、materialization instance、boot / runtime generation、observation window、attestation 与 main observation provenance | Electron main-owned `RuntimeInventoryProvider`，消费 WT-02C.2A～2D 的受信输入 | full evidence 必须绑定同一 stable descriptor、当前 boot 与有效 observation window。 |
| Matrix rule | `targetSemanticDigest + runtimeDescriptorDigest` 唯一 exact pair | immutable matrix bytes、provider provenance、lifecycle / revocation | `Sage Compatibility Authority` | matrix 必须预发布、内容寻址、全局无 duplicate / conflict / ambiguity。 |
| Evaluation | stable pair | full pair、matter / revision / action、`matrixId`、`matchedRuleId`、outcome、evaluation time 与当时 provenance / revocation | resolver 产生；WT-02C.3 持久化；WT-02D 组合 | stable pair 不能单独授权、回放或替代 fresh preflight。 |

每个字段必须先进入以下三类之一；未分类即阻断，不能“没有写进 projection 就默认无关”：

| 分类 | 处理规则 | 典型事实 |
| --- | --- | --- |
| `semantic-key material` | 进入 versioned canonical descriptor 与 stable digest；任何行为、安全或数据政策变化都必须改变 digest。 | action policy、permission/data policy class、artifact、contract、行为配置、Registry / Adapter mapping。 |
| `full-evidence-only material` | 不影响跨实例 stable digest，但必须保留并验证；实例变化必须改变 full digest。 | matter/revision identity、active generation、receipt、boot、observation time、exact account/resource boundary。 |
| `forbidden / unresolved` | 不得进入产品 descriptor 或被默认为安全；补齐 canonical subject、owner 与 provenance 前返回 `unknown`。 | token / secret、mutable alias、机器路径、自由文本 policy、caller / plugin 自报 digest、语义不明的 materialization digest。 |

`materializationDigest` 只有在 canonical subject 明确是跨安装稳定、只由 portable artifact set 与规范化行为配置构成时，才可进入 `runtimeDescriptorDigest`；只要含路径、时间、generation、receipt 或本机实例 metadata，就只能进入 full inventory evidence。`permissionBoundaryDigest`、`dataDestinationDigest` 与 `configurationDigest` 也不得同时承担 stable policy class 和 exact instance evidence 两种含义。

MatrixV2 保持 exact single-match，不引入 selector DSL、SemVer range、wildcard、priority 或 first-match。新合同使用独立 schema / canonicalization version 与类型隔离的 digest URN；C1 v1 canonical bytes 和 fixture 结果冻结，不原地重解释。迁移期可以 dual-compute / shadow compare，但只有 v2 trusted composition 能进入产品；v2 miss、unknown version、错误 namespace 或 descriptor binding mismatch 一律 `unknown`，不 fallback 到 C1。

安全 kernel 必须从 exact-parsed、已验证的 descriptor / evidence 重算 stable 与 full digest。UI、Host、Harness、plugin、MCP server、模型、HTTP body 和普通 action handler 没有 authoritative digest 输入权；content digest 只证明内容身份，仍须由 app-owned matrix provider、main-owned observation、artifact attestation、Capability Registry 和受信发布根证明 provenance。

职责继续按 ticket 分开：WT-02C.1B 实现 MatrixV2 / resolver 迁移；C2A 已由 [ADR-0167](../../../adr/ADR-0167.md) 与对应[架构记录](2026-09-28-runtime-artifact-attestation.md)完成 materialization-time artifact attestation；C2B 已由 [ADR-0168](../../../adr/ADR-0168.md) 与对应[架构记录](2026-09-28-host-live-inventory.md)完成独立 boot-scoped Host live projection；C2C 提供外部 capability artifact / contract evidence；C2D 拥有产品 allowlist、descriptor provenance、Adapter mapping 与 revoke；C3 持久化 evaluation evidence；WT-02D 才完成 trusted provider / clock composition 和唯一产品编排。C2A/C2B 都没有修改领域 DTO、event / codec / store、Identity / Policy、product、Adapter、UI 或插件，也不替代后续 ticket。

### 12. WT-02C.1B MatrixV2 / resolver 迁移（revision 14，当前工作树未提交）

WT-02C.1B 只在 `src/security/compatibility.ts`、`test/compatibility.spec.ts` 与本 Note、BusinessMatter 合同、Sage 执行计划五个既定文件内实现或同步；没有新增 source / test 文件、dependency、package 或 lockfile，也没有修改 `BusinessMatter`、v1 event / codec / store、Identity / Policy、Host、profile、product、Adapter、UI 或插件。生产实现只在冻结的 v1 第 1124 行之后追加独立 V2；该 v1 prefix 施工前后 SHA-256 均为 `7ab49407b999668d914a78f0527770ab38cea5e74f4da71f1a710f921287c69a`。

V2 kernel 从 exact-parsed target semantic、target evidence、runtime descriptor 与 inventory evidence 分别重算 `targetSemanticDigest`、`targetEvidenceDigest`、`runtimeDescriptorDigest` 与 `inventoryEvidenceDigest`。version 字段只接受精确 SemVer（含精确 prerelease / build metadata）或有效的 `YYYY-MM-DD` calendar version；range、wildcard、branch / channel / environment alias 与无效日期均拒绝。resolver 先完成四层摘要验证，再依次验证 target / runtime stable-full cross-link、current revision、exact action declaration、inventory freshness、matrix canonical bytes / content ID / lifecycle / revocation，最后对唯一 `targetSemanticDigest + runtimeDescriptorDigest` rule 求值。unknown schema / canonicalization / namespace、非精确版本、伪造摘要、binding mismatch、duplicate / conflict / ambiguity、v2 miss 与 provider failure 均 fail closed，并且不调用或 fallback 到 v1 resolver。

revision 12 的 v1 schema、canonical bytes、digest namespace 与 golden fixtures继续冻结；V2 使用独立 schema、`sage.compatibility-canonical-json.v2` 与类型隔离的 target / evidence / runtime URN。成功或 `requires-new-revision` 的 V2 resolution 返回受审 rule 的 `reasonCode / reason`，并冻结绑定 `evaluatedAt`、exact `actionScope`、`matrixId`、`matchedRuleId`、四层重算摘要和 `matrixProviderProvenanceDigest`。该结果只是未来 WT-02C.3 evidence 的内存输入，不等于 `CompatibilityEvaluationEvidence` 已定义、持久化或进入领域事件。

本批仍只消费显式 `evaluatedAt` 与已 materialize 的 MatrixV2 provider result；测试 descriptor / evidence 仍是 fixed fixture。它不证明 trusted clock / provider provenance、安装后 attestation、live runtime inventory、Capability Registry、Application Service、产品授权、真实数据或外部动作。内容摘要证明 canonical subject 身份，不把自报 issuer、provenance digest 或 stable pair 升格为 authority。typed failure priority 固定为 exact parse → 四层 digest → target / runtime cross-link → current revision → declared action → freshness / matrix；复合畸形输入必须按该顺序返回确定 code。

有效 Red 为 `pnpm --dir apps/sage-shell test test/compatibility.spec.ts`：1 个文件、27 条测试中既有 v1 12/12 通过，新增 v2 15/15 因 V2 API 尚未实现而失败，退出码 1；没有 runner、语法或 v1 回归。Green 后由不 import / call 生产实现的独立 reference encoder 显式枚举字段、稳定排序并用 `node:crypto` 复算，10 个 V2 canonical / digest golden 逐字一致，其中 canonical MatrixV2 为 934 UTF-8 bytes。对抗复审后新增 exact-version grammar 与 parse / digest / cross-link / current / action / provider 复合失败优先级回归；最终源码验证为 v1 12/12、v2 17/17、完整 compatibility spec 29/29、相邻 security/domain 4 files / 109 tests、产品 / Adapter / handler 3 files / 11 tests、产品边界 7/7、Sage Shell 全量 21 files / 259 tests、strict spec compile、typecheck 与 build、ADR/docs-links 31/31、Sage quick gate 23/23（0 skip）及差异检查通过；最终独立复审为 P0=0、P1=0、P2=0。这些只是当前未提交工作树的 local kernel 证据，不是 `HEAD`、trusted provider、C3、WT-02D 或产品验收。

### 13. WT-02C.2B Host live inventory projection（revision 16，当前工作树未提交）

WT-02C.2B 以 protocol v4、main-owned `ShellHostProcess` snapshot 与独立 `HostLiveInventoryProjectionV1` 关闭 Host boot observation 缺口。每个 child 的 `bootId` 与 positive runtime generation 由 Electron main 创建；Host `ready` 只回报 receipt-verified generation / manifest、Loader active 与 Harness version。ready 后任一 Loader status transition，或 fatal / exit / disconnect / stop，都会让当前 snapshot 立即 unavailable，迟到 ready 与 teardown 噪声不能复活旧 epoch。

projection 固定执行 Host A → active profile A → receipt-sealed C2A attestation fresh verify → active profile B → Host B exact stability → trusted clock，并以 30 秒半开窗口产生 canonical digest。旧 generation 缺 C2A row 时仍可一般读取，但 projection 具名 unavailable 且不 backfill；profile、receipt、Host、runtime epoch、artifact tree 或 clock 漂移均 fail closed。完整 wire、stable failure code、生命周期、对抗用例和 remaining boundary 的唯一事实源是 [Host Live Inventory 架构记录](2026-09-28-host-live-inventory.md)。

同批把尚未接产品的 V2 `activeGeneration` 从 number 校准为真实 profile generation string，并要求 `runtimeGeneration` 为 positive safe integer；V1 source prefix、canonical bytes、digest namespace 与 goldens保持冻结。C2B 不填入 Registry、external capability、health/liveness 或 instance-authority placeholder，不构造完整 `RuntimeInventoryEvidenceV2`，也不调用 resolver 或修改 `main/index.ts`、v1 event schema、product、Adapter、UI、插件、package / lockfile。

本批源码联合回归为 11 files / 130 tests，Sage Shell 全量为 24 files / 305 tests，strict typecheck 与 build通过；ADR/docs tests 为 31/31，修复 Host 最小包依赖后，隔离真实 materialize → Host ready → projection → stop invalidation 链路通过。独立源码审查未发现核心 Host/projection 的 P0/P1/P2，但发现两个相邻验收 P1：官方 smoke 仍硬编码 v3 且不校验新增 ready binding，`sage-shell-pin` 仍要求 Sage lifecycle version 等于 vendor v3，故 quick gate 实际为 22/23。本批不越权修改范围外的 smoke / pin；完整证据、推荐分职和剩余边界以 [Host Live Inventory 记录](2026-09-28-host-live-inventory.md)与 Birdview activity 为准。上述本地证据不等于 `HEAD`、完整 runtime inventory、Compatibility Authority、产品授权或生产验收。

revision 17 保留上述 `22/23` 作为 revision 16 的历史 Red，只关闭两处验收接缝：官方 smoke 复用 exact Host event parser，要求 protocol v4 并核对 active generation、manifest SHA-256 与 Loader active；`sage-shell-pin` 独立要求 Sage lifecycle v4，同时继续逐值 pin upstream DSH3 v3 的六个 FD3/FD4 framing 常量。最终 pin selftest 为 `22/22`，官方隔离 smoke 通过，Sage Shell 为 `24 files / 305 tests`，strict typecheck/build 通过，ADR / docs-links 为 `31/31`，quick gate 为 `23/23` 且无 skip / failed。完整读数见 [Host Live Inventory 记录的 revision 17 验证](2026-09-28-host-live-inventory.md#verification)。当前 staged area 为空，revision 17 仍未提交、未推送；该 Green 只关闭 C2B 验收门，不补齐 C2C/C2D/C2E/C3/WT-02D。

### 14. WT-02C.2C.0 External Capability Evidence 合同（revision 18，当前工作树未提交）

revision 18 只固定外部 MCP capability 的证据合同，不修改源码、测试、v1 event schema、package / lockfile、Host/profile、security kernel、product、Adapter、UI 或插件，也不连接真实 MCP、运行 `tools/list / tools/call`、读取 live Sage root 或启用任何 capability。唯一完整事实源是 [ADR-0169](../../../adr/ADR-0169.md) 与 [External Capability Evidence 架构记录](2026-09-28-external-capability-evidence.md)。

C2C 把稳定 `ExternalCapabilityDescriptorV1` 与 boot-scoped `ExternalCapabilityObservationV1` 分开。stable descriptor 绑定 Sage-assigned capability identity、实际 bridge/SDK/server artifact closure、结构化非秘密 launch contract、actual negotiated MCP protocol 与 normalized effective tool contract；full observation 绑定 C2B projection、同一执行 MCP connection generation、完整有界分页、discovery / contract state 与 main-owned freshness。Host / bridge 可以产生 raw observation，只有 Electron main 能 exact parse、重算、绑定和失效；它仍不能替 C2D Registry 审批 capability，也不能替 Matrix / Resolver 产生 `equivalent`。

上述 actual / verified 是完整 C2C 的目标。Revision 19 只 exact-parse、规范化并封存 caller 已 materialize 的 candidate protocol revision、artifact digests 与 typed policy URNs；它不观察 live negotiation，不扫描实际 bytes / dependency closure，也不验证 policy body 或 provenance。

工具合同必须来自同一执行 connection generation 的全部 `tools/list` 页。cursor 只作为 opaque continuation 原样传回；重复/空 cursor、duplicate raw name、超页数/工具数/bytes/deadline 或任一页失败都不产生新 evidence。`notifications/tools/list_changed`、reconnect/close、Host/profile/artifact/config drift、expiry 或 clock rollback 立即让旧 observation unavailable，bridge 为会话连续性保留旧注册工具不等于旧 authority 仍有效。tool annotations、名称、描述、进程存活、连接成功、单页 list、工具数量和历史调用都不是 Sage effect / permission / compatibility authority。

后续 implementation 继续拆为 C2C.1 pure descriptor kernel、C2C.2 same-generation raw observation seam、C2C.3 local artifact observer、C2C.4 bounded availability/preflight contract 与 C2C.5 main-owned aggregate provider。Revision 19 已冻结 candidate descriptor DTO，因此另批 C2D.0 / C2D.1 可以据此推进治理合同与 pure Registry kernel；真实 C2D.2 entry 仍必须等待 C2C.5 verified descriptor/provider，不能审批当前未验证 provenance 的 typed URN candidate。另设 C2E 由 Electron main 汇合 C2A/B/C/D 形成完整 `RuntimeDescriptorV2 / RuntimeInventoryEvidenceV2`，WT-02D 只能消费该 authority，不能临时拼装。

### 15. WT-02C.2C.1 pure descriptor / canonicalization kernel（revision 19，当前工作树未提交，终验已通过）

Revision 19 只实现 local pure candidate kernel。v1 固定 `local-stdio + interpreter-entrypoint`，强制且仅允许 `bridge / sdk / launcher / interpreter / server-entrypoint` 五个 artifact role；`direct-exec` 当前拒绝，未来开放必须升级合同或另做决策。argument / environment / protocol policy 使用类型隔离 URN，但 kernel 只验证 namespace 与 digest 形状，不验证 policy body、issuer、存在性或 provenance。

raw Tool presentation 字段不是无条件忽略：`title`、`icons`、`annotations` 先按 pinned exact shape 校验，再整体丢弃且不进入 normalized bytes / digest；未知 annotation 或类型错误返回 `tool-contract-invalid`，`_meta` / unknown tool key 返回 `tool-contract-extension-unsupported`。`descriptionSource` 保留 absent 与 present-empty；`outputSchema` 固定 absent / not-advertised、present supported / enforced、present unsupported / fallback-unstructured 三态；taskSupport 缺省为 forbidden；candidate protocol 只允许 pinned SDK 的五个 revision。

kernel 使用五类独立 schema / digest namespace，重算所有 nested digest，返回 detached deep-frozen value；production import 仅 `node:crypto` 与 `node:util`。本批没有 MCP I/O、live negotiation、artifact scan、pagination、lifecycle observation、freshness、Registry、完整 inventory、Matrix outcome 或产品 authority。`C2C-SEAM-DECISION` 已在 revision 20 单独裁定为 bridge-owned 受控只读 seam；C2C.2～C2C.5、C2D/C2E/C3、WT-02D、UI 和插件仍 pending。

终验实际结果：focused `19/19`、相邻 `79/79`、Sage Shell `25 files / 324 tests`、typecheck、build、quick gate `23/23`、strict gate `23/23`（no-skip）均通过；独立 P0/P1 复审为 `0/0`。工作树仍未暂存、未提交、未推送。

### 16. C2C-SEAM-DECISION（revision 20，2026-09-29，当前工作树未提交）

只读核对 pinned `@deepseek-ai/dsh-mcp-client@0.1.5-rc.2` 后确认：公开包没有 raw `Client`、完整分页 snapshot 或 generation observation API；`ConnectionHandle` 只返回 `ready` / `dispose`，`ctx.tools` 只能看到投影后的注册结果。因此当前选择 **bridge-owned 正式受控只读 seam**，而不是 Sage wrapper 或第二条连接。

后续正式 seam 必须由 bridge 继续拥有 Client、transport、分页队列、`list_changed`、reconnect、close 与 registry swap；只在同一 generation 的 projection 前提供结构化 raw snapshot、opaque generation reference、protocol facts 与失效事件。没有正式 bridge release / 可复现 fork 与 lockfile 证据前，禁止修改 `node_modules`、vendor、解析 store 或 runtime monkey patch。`WT-02C.2C.2` 保持 `pending / blocked`，直到 fake server 能证明完整有界分页、同代绑定、失效边界与零 `tools/call`。

### 17. WT-02C.2D.0 Capability Registry 治理合同（revision 21，2026-09-29，当前工作树未提交）

Revision 21 只固定 [ADR-0171](../../../adr/ADR-0171.md) 与 [Capability Registry 治理记录](2026-09-29-capability-registry-governance.md)：Sage product/security governance 独占 `candidate | approved | disabled | revoked` 四态、descriptor provenance、Adapter operation mapping、owner approval 与 immutable content-addressed snapshot。`mounted / observed / enabled / compatible / authorized / available` 保持正交；任何一个局部事实都不能自动产生 `approved`、`equivalent` 或当前授权。

`candidate → approved` 必须等待 C2C.5 verified descriptor/provider、完整 artifact / launch / tool-contract provenance、精确 Adapter mapping、owner approval、有效时间与未撤销状态；没有真实 Adapter mapping、typed policy URN、fixture descriptor、package version、`ctx.tools` projection 或历史 Jev 装配都不能铸造 `approved` 或 `adapterMappingDigest`。每次迁移生成新的 `snapshotId`；`revoked` 是终态，恢复只能创建新的 identity / descriptor version / entry。C2D.0 不实现 Registry、provider、real entry、Adapter、插件启用、Identity / Policy、Compatibility、C3、Application Service、UI 或任何真实动作；C2D.1 pure kernel 与 C2D.2 provider 另批推进。

### 18. WT-02C.2D.1 pure Registry kernel（revision 22，2026-09-29，当前工作树未提交）

Revision 22 将 C2D.0 的 lifecycle 合同落为独立 `src/security/capability-registry.ts` pure kernel，并以 `test/capability-registry.spec.ts` 覆盖 hostile input。内核只接收 caller-supplied candidate / C2C.5 verified descriptor reference：exact parse entry、operation、approval、snapshot 与 transition，按固定 canonical JSON 计算 entry / snapshot digest，返回 deep-frozen snapshot，并以新 snapshot 表达状态迁移。`candidate → approved` 必须同时有 verified descriptor、operation mapping 和 approval；`revoked` 不可原地恢复；unknown key、accessor、Proxy、duplicate/conflict、未验证 descriptor、缺 mapping、缺 approval、过期与 digest mismatch 均 fail closed。

本批没有读取时钟、文件、网络、Electron、Host、MCP、插件或产品数据，也没有修改 v1 event schema、package / lockfile、Adapter、provider、real entry、UI 或 Application Service。测试里的 `approved` 只是内核状态门 fixture，不是生产 Registry approval、compatibility、authorization 或 availability。C2D.2 仍需等待 C2C.5 verified descriptor/provider、真实 Adapter mapping、owner approval source 与 app-bundled snapshot provider。

### 19. WT-02C.2C.5 aggregate evidence kernel（revision 23，2026-09-29，当前工作树未提交）

Revision 23 只实现 C2C.5 的无 I/O aggregate evidence kernel：`external-capability-evidence.ts` 对 caller-supplied descriptor、provenance、C2B host binding、同代 connection binding 与显式 freshness window 做 exact parse、generation binding、canonical digest、deep freeze 与 fail-closed denial。它可以把结构上完整的输入封存为 evidence candidate，并在 `[observedAt, expiresAt)` 内做确定性 freshness 判断。

这不是 production provider。typed artifact / launch / tool evidence URN、descriptor digest 与 `source: c2c5` 仍只是调用方提供的引用；内核不访问 Host、bridge、MCP、filesystem 或系统时钟，不扫描真实 bytes、不执行 `tools/list`、不监听 reconnect / `list_changed`，也不产生 `verified descriptor`、Registry approval、Adapter mapping、availability 或 authorization。C2C.2 seam、C2C.3 artifact observer、C2C.4 availability / preflight 与 Electron-main provider composition 仍保持 `pending / blocked`，C2D.2 real entry 不得消费该 candidate 冒充生产证据。

### 20. WT-02C.2C.3 local artifact observer（revision 24，2026-09-29，当前工作树未提交）

Revision 24 在 `apps/sage-shell/src/security/external-capability-artifact-observer.ts` 提供显式 artifact-root-scoped 的 local observer，并以 `test/external-capability-artifact-observer.spec.ts` 锁定边界。它只接受 exact static execution manifest，严格固定 `package.json`、`pnpm-lock.yaml` 和 `components/{bridge,sdk,launcher,interpreter,server-entrypoint}` 的 root shape；递归读取实际文件 bytes，重算 file / component digests、executable policy 与 symlink topology，输出 pathless candidate artifact subject 以及 launch / artifact evidence refs。

observer 使用 absolute root、`O_NOFOLLOW`、文件与递归目录的开前/开后 fingerprint、目录名复核、lexical + physical containment 和 bounded scan；拒绝 unknown key、动态 shell / PATH / environment、绝对或越界 symlink、特殊文件、root expansion、读取漂移和超过 4096 entries / 64 MiB 的 artifact。它不启动 interpreter、不执行 MCP、不过 bridge、不访问 Host / Registry / Adapter / UI / plugin，不提供 producer provenance、trusted clock、verified descriptor 或 product availability。故 revision 24 只关闭了一个可独立验收的 C2C.3 local observation 入口，C2C.2 formal seam、C2C.5 main-owned provider 与 C2D.2 real entry 仍 `pending / blocked`。

### 21. WT-02C.2C.4 bounded availability / preflight contract（revision 25，2026-09-29，当前工作树未提交）

Revision 25 在 `apps/sage-shell/src/security/external-capability-availability.ts` 提供纯 availability / operation-preflight 合同，并由 `test/external-capability-availability.spec.ts` 固定边界。四个状态轴分别表示 transport 是否存活、discovery 是否完整、contract 是否仍有效、以及某个具名 operation 的 preflight 形状；它们不互相抬升。只有 `connected + complete + valid` 推导 `available`，`operationPreflightState` 不参与 availability 的偷换；`actionability` 永远是 `blocked`。

该内核绑定 descriptor / evidence digest 与同代 host / connection generation，拒绝 generation drift、unknown key、Proxy / exotic record、非法 preflight 组合和 digest tamper，并使用 `[observedAt, expiresAt)` 的半开 freshness 窗口。`port-valid` 的 candidate port digest 只证明调用方提交了结构正确的候选端口，不证明 C2D Adapter operation mapping、Identity / Policy、数据出境边界、Registry approval 或真实动作。内核无 I/O、无时钟读取、无 bridge/MCP/Registry/Adapter/provider/UI/plugin 接线，因此 WT-02C.2C.4 已关闭的是可独立验收的边界合同；C2C.2 formal seam、C2C.5 production provider 与 C2D.2 real entry 继续阻断。

### 22. WT-02C.2T Compatibility Target Requirements governance（revision 26，2026-09-29，当前工作树未提交）

Revision 26 新增 [ADR-0172](../../../adr/ADR-0172.md) 与 [Compatibility Target 治理记录](2026-09-29-compatibility-target-governance.md)，关闭 target provider 的前置治理合同，不实现 provider。Sage product/security governance 独占 `CompatibilityTargetProvider` 与 immutable requirement snapshot；新合同使用独立的 `sage.compatibility-target-requirement.v1` schema，不修改 `BusinessMatter` v1 event。stable target semantic 只包含 exact action / effect / decision、permission / data-boundary 语义和 Provider / Model / Agent / Preset / Capability exact requirements；matter / revision / revision digest、具体资源 / 组织 / 账户、时间与 provenance 只进入 full target evidence。

requirements 必须 exact、可重算、可追溯：SemVer range、wildcard、mutable alias、自由文本推导、UI selection、工具名、package display name、普通调用方 digest、未分类字段或缺 provenance 均 fail closed。full target 在 stable lookup 前必须绑定 current revision；unknown、duplicate、conflict、expired、revoked 或 provider unavailable 不回退旧 target，也不产生 `equivalent`。每次 publish / revoke 都产生新的 content-addressed snapshot，禁止 `latest`、原地编辑、按 matter / boot 动态铸造 stable key 或 revoked entry 原地恢复。

本批只同步 ADR、Note、Compatibility Authority、执行计划与 ADR 派生索引；源码、测试、package / lockfile、v1 event、真实 provider、MatrixV2、Registry、Identity / Policy、UI、插件和真实数据变更均为 0。后续仍需独立实现 pure target kernel、app-bundled provider、C2C.5 production provider、C2D.2 real entry、C2E、C3 与 WT-02D。

### 23. WT-02C.2T pure target kernel / bundled provider（revision 27，2026-09-29，当前工作树未提交）

Revision 27 将 revision 26 的 immutable requirement registry 治理合同落成独立 `apps/sage-shell/src/security/compatibility-target-requirement.ts`。entry 与 snapshot 使用独立 schema / canonicalization / digest namespace；exact parser 只接受 Sage identity、精确 SemVer 或有效 calendar version、`sha256:<64 lowercase hex>` content digest、结构化 action / permission / data-boundary requirements、owner decision 与明确 lifecycle。canonicalizer 对 set-like action / policy / capability 数组做稳定排序，seal / parse 都重算 digest 并 deep-freeze；unknown key、range、wildcard、`latest`、matter / revision 字段泄漏、duplicate / malformed lifecycle、digest tamper 全部 fail closed。

`createBundledCompatibilityTargetProvider()` 只消费已经 parse / digest 验证的 app-bundled immutable snapshot，按显式 requirement ID、action scope 与 evaluatedAt 返回 active exact requirement；未生效、过期、撤销、缺失、未声明 action、非法 lookup 或 snapshot invalid 不回退、不返回 `equivalent`。内核只 import `node:crypto` / `node:util`，没有 filesystem、network、Host、MCP、clock、UI、plugin 或 global state 接线，也不把 caller 的 current revision、provider provenance 或 digest 变成 authority。

本批新增源码 1 个、定向测试 1 个；Sage Shell 全量测试结果为 30 个文件 / 354 个测试通过，后续还需执行 typecheck、build、quick / strict gate、diff 与 Birdview。revision 27 只关闭本地 target requirement kernel / bundled lookup，未关闭 C2C.2 formal seam、C2C.5 production evidence、C2D.2 real Registry entry、C2E、C3 或 WT-02D Application Service。

### 24. WT-02C.2M app-bundled MatrixV2 provider（revision 28，2026-09-29，当前工作树未提交）

Revision 28 新增 `apps/sage-shell/src/security/compatibility-matrix-provider.ts` 与 `apps/sage-shell/test/compatibility-matrix-provider.spec.ts`。bundle 只接受已经 canonicalize、content-addressed 的 MatrixV2 artifact，并把多个历史 canonical bytes 按 `matrixId` 排序、去重、deep-freeze；解析时重算 matrix ID 与 bundle ID，禁止替换同一 ID 的不同字节。provider 请求必须显式给出 `targetSemanticDigest`、`runtimeDescriptorDigest` 与 `evaluatedAt`；无 `matrixId` 时只返回唯一 active candidate，重叠返回 `matrix-ambiguous`，显式 `matrixId` 仅用于审计 / 历史回取，不绕过 stable-pair 检查。

revocation source 不嵌入 matrix artifact，而是独立参数，使用独立 schema / canonicalization / source ID、`sourceProvenanceDigest`、`createdAt` 与 `supersedesSourceId` lineage。provider 输出保留 bundle / source identity 与 revocation entries；只有显式 `toCompatibilityMatrixV2ProviderResult()` 才映射为当前 resolver 接受的最小 `CompatibilityMatrixV2ProviderResult`，避免 provenance 被隐式丢弃。provider 没有内置 fixture，也不读取文件、网络、时钟、Host、MCP、Registry、Adapter、UI 或插件。

本批验收：Sage Shell 全量测试 `31 files / 360 tests`、typecheck、diff check 已通过；仍需在 Birdview 活动中记录 build、quick / strict gate 与 render。此票只关闭 app-bundled MatrixV2 provider contract，不能表述为 trusted Matrix Authority release、真实 revocation publication、C2C.2/C2C.5 production evidence、C2D.2 real entry、C2E inventory、C3 evidence 或 WT-02D 产品接线。

### 25. WT-02C.3.0 CompatibilityEvaluationEvidence 治理合同（revision 29，2026-09-29，当前工作树未提交）

Revision 29 新增 [ADR-0173](../../../adr/ADR-0173.md)，先于 codec / persistence 固定 `CompatibilityEvaluationEvidence` 的唯一事实家。证据使用独立的 `sage.compatibility-evaluation-evidence.v1` schema 与独立 canonicalization / digest namespace，作为 `BusinessMatter` v1 event 的旁路记录；v1 event、v1 codec 与现有 hash chain 保持冻结。每份 evidence 必须绑定 `evaluationId + attemptId`、matter / revision / action、stable/full 四层 digest、`matrixId + matchedRuleId + outcome + reasonCode/reason`、`evaluatedAt`、resolver contract、当时的 target / inventory / matrix provider provenance、matrix canonical artifact reference 与独立 revocation source / lineage。raw token、claim、secret、机器绝对路径和未分类 caller / plugin 自报字段不进入 evidence。

历史 matrix 不能用当前 `latest`、当前 bundle 或当前 revocation source 代替。持久化实现必须按 immutable content-addressed artifact reference 取回当时 canonical bytes，重新验证 digest、matrix ID、bundle lineage 与 revocation source；取回失败或篡改返回 `historical-artifact-unavailable` / `evidence-corrupt`，不能用当前 provider 重新求值。strict replay 只验证封存 evidence 与历史 canonical subject，返回原始 outcome / reason / provenance，不调用当前 target、runtime、MatrixV2、Registry、Identity / Policy provider，不读取当前时间，也不产生新授权。

原子性选择 Sage main-owned SQLite transaction / adapter boundary：evidence append、attempt / decision receipt 与 compatibility gate 结果必须一起 durable commit；任一 append、校验、commit 或恢复失败都返回 `compatibility-evidence-unavailable` 并阻断 action。未来若 evidence 与 attempt 无法共享事务，必须另立 outbox / prepare-commit / compensation ADR，禁止 best-effort 补写或先执行后审计；prepare / compensation / recovery 必须幂等并留存失败事实。

retention、legal hold、purge、export、restore 作为同一治理边界，支持 `active`、`retention-expired`、`legal-hold`、`deletion-pending`、`purged` 生命周期，不预设全局 TTL。legal hold 只暂停允许的 purge；purge 覆盖 envelope、历史 matrix、revocation / provenance 索引与导出副本并生成独立 receipt，不改写 append-only event hash chain；备份未确认、hold 未解除或关联 artifact 未处理时不得报告 purge 完成。export / restore 必须携带并验证 schema、digest、lineage、hold 状态，不能静默恢复为 active。

本批是治理批，源码、测试、package / lockfile、v1 event、provider、trusted clock、store、UI、插件与真实 action 改动为 0；不读取真实数据根、不连接 MCP、不执行 `tools/list` / `tools/call`、不接 Application Service、不暂存、不提交、不推送。下一票为 `WT-02C.3.1` pure exact codec；只有 C3.1 完成后才可按本 ADR 进入 `WT-02C.3.2` persistence。

### 26. WT-02C.3.1 CompatibilityEvaluationEvidence pure exact codec（revision 30，2026-09-29，当前工作树未提交）

Revision 30 新增 `apps/sage-shell/src/security/compatibility-evaluation-evidence.ts` 与 `apps/sage-shell/test/compatibility-evaluation-evidence.spec.ts`。codec 继续使用 ADR-0173 的独立 `sage.compatibility-evaluation-evidence.v1` 旁路 schema，采用排序键 canonical JSON 与 typed SHA-256 digest，严格解析并 deep-freeze sealed evidence；字段覆盖 evaluation / attempt、matter / revision / action、stable/full digest pair、matrix / rule / outcome / reason、evaluatedAt、resolver contract、provider / revocation lineage、historical matrix artifact reference 与 lifecycle。

strict replay 只消费封存 evidence 和显式 caller-supplied historical MatrixV2 canonical bytes。它重新验证 evidence digest、canonical bytes digest、matrix ID、artifact content-address、bundle lineage、revocation source / lineage、evaluatedAt 时点的 active / revoked 状态、stable pair、唯一匹配规则、outcome 与 reason；它拒绝当前 matrix 重算、当前时间、当前 target / runtime / Registry / Identity / Policy provider，以及任何新的 action authorization。artifact 缺失或篡改、matrix / source drift、expired / revoked、rule / outcome / reason drift、`purged` 或 `deletion-pending` lifecycle 都 fail closed。

该模块仅依赖 Node 标准 `crypto` / `util` 与既有纯 compatibility canonicalizer，import firewall 证明没有 filesystem、network、Host、MCP、clock、store、provider、Application Service、UI、plugin 或 v1 event I/O。定向测试覆盖 sealed round-trip、unknown / malformed / provenance / lifecycle refusal、历史 artifact 与 revocation drift、strict replay 和 I/O firewall；C3.2 persistence、真实 provider、Application Service、UI、插件与产品 action 仍未实现。

本批未暂存、未提交、未推送；既有 dirty / untracked 基线保持不动。只有在 full test、typecheck、build、quick / strict gate、diff check 和 Birdview activity 均有实际结果后，才能称为本地 pure exact codec complete。

### 27. WT-02C.3.2 CompatibilityEvaluationEvidence persistence（revision 31，2026-09-29，当前工作树未提交）

本批把 revision 29 的旁路 evidence 合同与 revision 30 的 pure exact codec 接入既有 Sage-owned `BusinessMatterEventStore`，没有另起一套数据库，也没有修改 `BusinessMatter` v1 event schema、event digest、append receipt 或 hash chain。新增 `compatibility_evaluation_evidence` 与 `compatibility_evaluation_operation_receipts` 两张 sidecar 表，保存 canonical evidence、历史 matrix / revocation bytes、lifecycle、created / updated time 与 export / restore / transition / purge / recovery receipt；打开一个只有 v1 三张表的旧 store 时，在同一个 `BEGIN IMMEDIATE` 内以 additive migration 建立 sidecar，任何 schema / storage 异常都 fail closed。

`appendWithCompatibilityEvidence()` 是唯一同事务入口：先执行 C3.1 strict replay、matter binding 与 active lifecycle 校验，再把 BusinessMatter event、append receipt 与 evidence row 一起提交；evidence digest 冲突、重复写入、canonical bytes / historical artifact 损坏或 sidecar 写入异常都会回滚整笔事务，并返回 `compatibility-evidence-unavailable`，不会允许“attempt 已执行但 evidence 缺失”。replay append 还必须找到相同 evaluation evidence，否则同样闭锁。

maintenance port 提供 load、export、restore、lifecycle transition 与 purge。状态只允许沿 `active → retention-expired / legal-hold / deletion-pending → purged` 的受控路径移动；legal hold 下 purge 明确拒绝，operation ID 冲突拒绝，重复 operation 返回 replayed。export / restore 携带 schema、digest、历史 matrix / revocation lineage 与 `not-current-authorization` 说明；purge 只在非 hold 的 `retention-expired` / `deletion-pending` 下清空 sidecar bytes、标记 `purged` 并清理已有 export receipt，不删除或重写任何 append-only event。`deletion-pending` 仍保留可审计 metadata，加载时通过临时 active clone 验证封存 evidence / historical artifact，禁止用当前 matrix 重算。

本批新增 `apps/sage-shell/src/persistence/compatibility-evaluation-evidence-store.ts`、`apps/sage-shell/test/compatibility-evaluation-evidence-store.spec.ts` 并扩展 `apps/sage-shell/src/persistence/business-matter-event-store.ts`；没有 provider、trusted clock、Application Service、Capability Adapter、UI、插件、MCP、真实数据根或产品 action。focused persistence、Sage Shell full test `33 files / 370 tests`、typecheck、build、`test:gate`、quick gate、full strict gate 与 `git diff --check` 均须以当前 Birdview activity 的实际读数验收；当前工作树未暂存、未提交、未推送。

### 28. WT-02C.2C.2 seam contract preflight（revision 32，formal seam 仍 blocked）

本批只新增 `apps/sage-shell/src/security/external-capability-observation-contract.ts` 与 `apps/sage-shell/test/external-capability-observation-contract.spec.ts`，并同步本记录与执行计划。新增内核定义未来 bridge-owned adapter 必须实现的 list-only port：connection generation、negotiated protocol、opaque cursor 原样传递、完整 raw tools snapshot、跨页 raw name 唯一、page/tool/canonical-byte/deadline bounds，以及 `list-changed`、close、reconnect、dispose 等 invalidation 的 fail-closed 行为。返回值为 detached、deep-frozen、content-addressed candidate snapshot；错误只返回稳定 code，不泄露异常文本。

测试只使用隔离 fake connection，明确第一面不带 cursor、后续只传原 cursor、重复/空 cursor、duplicate name、各类上限、deadline、malformed page、source error 与中途 invalidation；fake port 没有 `tools/call`，断言调用数为零。生产模块仅依赖 Node 标准 `crypto` / `util`，不读 filesystem、network、clock、bridge、MCP、Host、Registry、Adapter、provider、UI 或插件；因此本批是 formal seam 的 readiness contract，不是 production observation，也不关闭 `WT-02C.2C.2` 的 pending/blocked 状态，直到正式 bridge release / 可复现 fork 与真实 fake-server seam 证据齐备。

本批当前工作树未暂存、未提交、未推送；既有 dirty / untracked 基线保持不动。最终状态以 revision 32 Birdview activity 的 focused/full test、typecheck、build、quick / strict gate、diff check 与 validate/render 实际读数为准。

### 29. WT-02C.2C.2 seam-intake gate（revision 33，formal seam 仍 blocked）

本批只做 formal bridge seam 的证据重核与门禁收口，不把 revision 32 的 Sage-owned contract preflight 误写成真实连接。复核范围固定为 ADR-0170、`apps/sage-shell/seed/package.json`、`apps/sage-shell/seed/pnpm-lock.yaml` 与现有 C2C.2 关闭条件：seed 仍精确 pin `@deepseek-ai/dsh-mcp-client@0.1.5-rc.2`，lock 仍落在同一版本线；没有发现新的 bridge 正式 release、可复现 fork、raw `Client` / transport / pagination / `list_changed` / generation observation port 或可供 Sage 绑定的正式只读 seam。

因此本批不更新 dependency specifier / lockfile，不修改 `node_modules`、vendor、解析 store 或 runtime monkey patch，不另开 MCP connection，不运行真实 `tools/list` / `tools/call`，不启用插件、不接 Registry / Adapter / UI / Application Service，也不改 v1 event schema。C2C.2 production observation 继续 `pending / blocked`；只有正式 seam、隔离 fake MCP server、完整有界分页、同代绑定、失效传播与零 `tools/call` 证据同时具备时，才能重新开启 implementation ticket。

本批只同步本记录与执行计划，并用 revision 33 Birdview 记录实际 status/index、pin/seam evidence scan、docs-link、quick / strict gate、diff check 与 validate/render 结果。没有源码、测试、package、lockfile、vendor、UI、插件或生产数据改动；当前工作树仍未暂存、未提交、未推送。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| caller 继续传 `equivalent + matrixId` | 否决；只能用于纯领域 fixture，不能进入产品入口。 |
| Host/plugin 自报 version/tool list 后放行 | 否决；缺 provenance、配置、contract、revision 语义和产品授权。 |
| SemVer/package pin 相同即等价 | 否决；版本身份不覆盖远端能力、local patch、权限和数据边界。 |
| live probe 成功即等价 | 否决；可用性不是完整 semantic compatibility。 |
| resolver 放进 `BusinessMatter` | 否决；破坏纯领域确定性和历史重放。 |
| 全局 compatibility boolean | 否决；不绑定 revision、action、runtime 或 matrix，不能审计漂移。 |
| 首版远端 matrix service | 延后；先用 bundled immutable provider 建正确边界。 |
| unknown 时允许“只读插件” | 否决；`external-read` 仍可能出境，offline 例外必须由独立 registry 批准。 |
| 继续用完整 instance digest pair | 否决；无法预发布，只能按未来事项和 boot 动态生成 matrix。 |
| 从旧 digest 截断或机械删字段 | 否决；digest 不可逆，删字段也不能证明保留全部安全语义。 |
| 使用 selector / SemVer range / wildcard | 首版否决；会引入策略语言、规则重叠、优先级与意外放宽。 |
| 只保存 stable pair | 否决；无法解释具体 revision / boot，也不能阻断跨实例 replay。 |

## Consequences

- 新 UI 与插件可以继续开发明确的状态、descriptor 和 inventory，而不用等待真实 OIDC。
- 任何开发 fixture 都必须显示为 fixture/blocked，不得进入生产完成证据。
- runtime 变化会让旧 evaluation 失效，产品必须显式处理 drift、unknown 与 requires-new-revision。
- matrix bytes、revocation、target/inventory digest 和历史 attempt 需要统一 retention 与审计可取回性。
- 当前 Jev 与继承 DSH plugins 继续隔离；没有 Capability Registry allowlist 和 Adapter mapping 前，不进入产品调用面。
- MatrixV2 可以跨 matter / revision / boot 复用经审阅的 stable pair；每次 evaluation 仍必须保留自己的 full evidence。
- semantic projection 漏掉安全字段会产生假等价；WT-02C.1B 必须用成对反例和 golden vector 证明“仅实例变化只改 full digest、语义变化同时改变 stable digest”。

## 后续 tickets 与完成门

| Ticket | 目标 | 主要验收 |
| --- | --- | --- |
| WT-02C.1 | 纯 `CompatibilityResolver`、canonical matrix ID 与 immutable provider contract | exact unknown parsing、duplicate/conflict/ambiguity、digest mismatch、expired/revoked、provider failure、deep freeze、无 I/O |
| WT-02C.1A | full evidence / stable semantic 双层合同（revision 13） | 字段分类、受信 derivation、MatrixV2 版本边界、owner 与 C3 binding 明确；源码 0 文件 |
| WT-02C.1B | MatrixV2 / stable-key resolver migration | stable / full digest 成对不变量、v1/v2 隔离、binding mismatch 与 v2 miss fail-closed、无 C1 fallback（revision 14 当前工作树已实现、未提交；实际读数见 §12） |
| WT-02C.2A | materialization 后 runtime artifact attestation（revision 15 当前工作树已实现、未提交） | 已覆盖实际安装 package / lock、`node_modules` bytes、executable bit、hardlink logical path、受限 relative symlink topology 与独立 installer metadata，并在 active pointer 切换前 fresh verify、纳入 receipt、失败回滚；边界与读数见 [C2A 唯一事实记录](2026-09-28-runtime-artifact-attestation.md) |
| WT-02C.2B | Host live inventory projection（revision 16 核心 + revision 17 门禁已完成、未提交） | 已绑定 main-owned boot/runtime epoch、active generation/receipt、C2A fresh verify、Loader lifecycle 与 30 秒 freshness；官方 smoke / pin 分职后 quick gate 23/23；完整边界见 [C2B 唯一事实记录](2026-09-28-host-live-inventory.md) |
| WT-02C.2C.0 | External Capability Evidence 治理合同（revision 18） | [ADR-0169](../../../adr/ADR-0169.md) 与[唯一事实记录](2026-09-28-external-capability-evidence.md)一致；源码 0 文件、零真实 MCP I/O、零插件启用 |
| WT-02C.2C.1 | Pure descriptor / canonicalization kernel（revision 19 当前工作树已实现、未提交） | exact parser、artifact/launch/tool-contract canonicalization、五类 digest namespace、手写 expected body + 独立 encoder/golden、hostile fixtures 与 strict import firewall；无 Host/MCP I/O，policy / artifact provenance 未验证 |
| WT-02C.2C.2 | Same-generation raw observation seam | 执行连接代的完整有界分页 snapshot、list-changed/reconnect/close 失效、隔离 fake server、零业务 `tools/call` |
| WT-02C.2C.2-preflight | Sage-owned seam contract preflight（revision 32，formal seam 仍 blocked） | list-only port、opaque cursor 原样传递、同代 generation、完整 snapshot 前置条件、page/tool/canonical-byte/deadline bounds、duplicate raw-name 与 invalidation fail-closed；隔离 fake connection、零 `tools/call`；不接 bridge/MCP、不改依赖 |
| WT-02C.2C.2-seam-intake | formal bridge seam availability gate（revision 33，仍 blocked） | 只读复核 ADR-0170、seed package/lock pin、公开导出与 C2C.2 关闭条件；未发现 formal seam / release / fork，不改依赖，不接 MCP |
| WT-02C.2C.3 | Local artifact observer（revision 24 已实现、未提交） | absolute artifact root、typed execution manifest、bridge/SDK/launcher/interpreter/server/dependency closure、bytes/executable/safe links、directory/file fingerprint 与动态 shell/PATH/secret refusal；只输出 candidate evidence |
| WT-02C.2C.4 | Bounded availability / preflight contract（revision 25 已实现、未提交） | 四轴 exact contract、generation binding、半开 freshness、稳定无秘密错误、candidate port shape 与 actionability=`blocked`；真实 operation preflight 仍等待 C2D mapping 与 Identity / Policy |
| WT-02C.2C.5 | Aggregate evidence kernel（revision 23）与后续 main-owned provider | revision 23 已完成无 I/O exact binding、同代 generation、digest、freshness 与 fail-closed kernel；正式 provider 仍需 C2B、descriptor、artifact、同代 tools snapshot 与 trusted clock，且不构造完整 runtime inventory 或 matrix outcome |
| WT-02C.2D.0 / .1 / .2 | Sage-owned Capability Registry 合同、纯 kernel 与真实 provider 分层 | `.2D.0 revision 21` 已固定 product/security owner、四态 lifecycle、immutable snapshot、descriptor provenance、Adapter operation mapping、enable/disable/revoke；`.1 revision 22` pure kernel 已通过 hostile tests；`.2` provider / real entry 仍 pending，真实 entry 必须引用 C2C verified descriptor |
| WT-02C.2T | Compatibility Target Requirements（revision 27 kernel / bundled provider 已实现） | revision 26 治理合同已落成独立无 I/O requirement / snapshot parser、canonicalizer、typed digest、immutable snapshot 与 app-bundled exact action lookup；真实 current-revision provenance / Application Service 仍 pending，不改 v1 event |
| WT-02C.2M | app-bundled MatrixV2 provider（revision 28） | 历史 canonical matrix bytes、独立 append-only revocation source、bundle/source content ID、stable-pair lookup、显式历史回取、deep freeze、typed unavailable 与 resolver adapter；无 fixture promotion、无 I/O、不改 v1 event |
| WT-02C.2E | Electron-main RuntimeInventoryProvider composition | 汇合 C2A/B/C/D 与 Provider/Model/Agent/Preset、trusted clock、instance authority；任一缺项 unavailable，禁止 WT-02D 临时拼 authority |
| WT-02C.3.0 | `CompatibilityEvaluationEvidence` 治理合同（revision 29） | 独立旁路 schema、stable/full pair、matter/revision/action、matrix/rule/outcome/provenance/revocation、历史 artifact reference、strict replay、同事务原子性、retention/legal-hold/purge/export/restore；源码 0 文件 |
| WT-02C.3.1 | `CompatibilityEvaluationEvidence` pure exact codec（revision 30 已实现、未提交） | canonical bytes / digest、sealed round-trip、历史 artifact / revocation 校验和 strict replay；不得调用当前 matrix 重算；typecheck / build / full tests / quick / strict gate / diff / Birdview 需有实际读数 |
| WT-02C.3.2 | `CompatibilityEvaluationEvidence` persistence（revision 31 已实现、未提交） | 同一 Sage-owned SQLite adapter 的 sidecar schema；同事务 append / failure closure；retention、legal hold、purge、export、restore、operation-id recovery；不改 v1 event，不接 provider / Application Service / UI / 插件 |
| WT-02D.0 | Application Service ports、顺序与 import boundary | renderer/Host/plugin 不可直接导入 domain command、security kernel 或 store |
| WT-02D.1 | 无真实数据、无副作用的只读 fixture E2E | UI 与真实 projection 共用公开 shape；fixture 明示且不能触发真实 action |
| UI-01 | Sage-owned component renderer | 可以并行展示 fixture/blocked 状态；不自造执行命令 |

WT-02C.1A 只有在 ADR-0165/0166、Note、BusinessMatter 合同、执行计划、AGENTS 必读入口与 ADR 派生账本一致，并通过 ADR/docs link、quick gate、diff 和 Birdview 检查后，才可称为“full evidence / stable semantic 分层合同完成”。它不能被表述为 MatrixV2、ResolverV2、Registry、可信 runtime inventory、插件兼容、产品授权或产品调用链已经实现。

WT-02C.1B 只有在 v1/v2 isolation、stable/full paired invariants、negative binding cases、typecheck、build、full tests、quick gate、diff 与 Birdview 均以实际结果通过后，才可称为“local MatrixV2 kernel migration complete”。它仍不能被表述为 trusted matrix release、runtime inventory、Capability Registry、C3 evidence persistence、Application Service 或产品 compatibility authority 已完成。

WT-02C.2M revision 28 只有在 bundle/source parser、历史回取、重叠 / 缺失 / 篡改 / hostile 输入、独立 revocation lineage、resolver adapter、typecheck、build、full tests、quick / strict gate、diff 与 Birdview 均以实际结果通过后，才可称为“local app-bundled MatrixV2 provider contract complete”。它仍不能被表述为 trusted Matrix Authority 发布、真实 revocation source、production runtime inventory、Registry entry、C3 evidence 或产品授权。

WT-02C.3.0 revision 29 只有在 ADR-0173、Compatibility Authority 本节、执行计划、ADR README / 派生账本与 Birdview activity 一致，并明确记录 v1 event 冻结、独立 evidence schema、历史 matrix artifact reference、strict replay 不重求值、同事务 fail-closed、retention / legal-hold / purge / export / restore 边界后，才可称为“CompatibilityEvaluationEvidence governance complete”。它仍不能被表述为 codec、持久化、历史数据、可信 provider、Application Service、UI、插件或产品闭环已经实现。

WT-02C.3.2 revision 31 只有在同一 adapter 的 sidecar schema、append 与 BusinessMatter 事务原子性、失败闭锁、lifecycle / legal-hold / purge / export / restore / operation-id recovery、typecheck、build、full tests、quick / strict gate、diff 与 Birdview 均以实际结果通过后，才可称为“CompatibilityEvaluationEvidence persistence complete”。它仍不能被表述为真实 provider、trusted clock、Application Service、UI、插件、MCP、真实数据或产品 compatibility authority 已接入。
