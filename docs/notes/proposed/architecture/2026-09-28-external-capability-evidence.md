# External Capability Evidence：外部 MCP 能力的稳定身份、同代合同与可失效观察

- 日期：2026-09-28
- 状态：WT-02C.2C.0 revision 18 治理合同已确认；WT-02C.2C.1 revision 19 local pure descriptor / canonicalization kernel 已在当前未提交工作树完成并通过终验；C2C-SEAM-DECISION revision 20 已决定只走 bridge-owned 受控只读 seam；WT-02C.2D.0 revision 21 已固定 Sage-owned Capability Registry 治理合同；WT-02C.2D.1 revision 22 已完成 Registry pure kernel；WT-02C.2C.5 revision 23 已完成无 I/O 的 aggregate evidence kernel / contract；WT-02C.2C.3 revision 24 已完成受控 local artifact observer；WT-02C.2C.4 revision 25 已完成无 I/O 的 bounded availability / preflight contract。production evidence provider、正式 bridge seam、真实 MCP observation、producer / policy provenance、Registry provider / real entry 与产品接线仍未实现
- ADR：[ADR-0169](../../../adr/ADR-0169.md)、[ADR-0170](../../../adr/ADR-0170.md)
- 上位边界：[Compatibility Authority](2026-09-28-compatibility-authority.md)、[Runtime Artifact Attestation](2026-09-28-runtime-artifact-attestation.md)、[Host Live Inventory](2026-09-28-host-live-inventory.md)、[Capability mounting](2026-09-27-capability-mounting-contract.md)

## Problem

Sage 当前能够证明两类局部事实：C2A 证明一次 profile materialization 中实际安装的 bytes / links，C2B 证明当前 Host child 与 active profile / receipt / C2A attestation 在一个短 freshness window 内一致。外部 MCP capability 仍有四个缺口：

1. 真正执行的 bridge、SDK、launcher、interpreter、server entrypoint 与依赖闭包没有统一 artifact subject；
2. `tools/list` 可能分页、变化或由不同 connection generation 返回，单页结果与工具数量都不是完整合同；
3. raw MCP contract、bridge 实际 projection / enforcement 与模型看到的合同可能不同；
4. process alive、transport connected、MCP ping、tool visible、历史成功与 operation availability 被混成一个“healthy”。

当前仓库把 `@deepseek-ai/dsh-mcp-client` 精确 pin 为 `0.1.5-rc.2`，seed lock 实际解析 `@modelcontextprotocol/sdk@1.30.0`。这只能说明依赖解析事实，不证明 live process 的 bytes、完整 tool contract、current connection generation 或产品审批。Jev 与历史插件因而继续保持 `mounted / runtime-observed / compatibility-unproven`，不得因为“能启动、能列工具”进入 Sage 产品调用面。

官方 MCP 2025-11-25 Tools 合同明确：`tools/list` 支持 cursor pagination；server 可声明并发送 `notifications/tools/list_changed`；tool annotations 对 client 是不可信 hints，除非 server 本身已受信。协议没有为任意业务工具提供统一无副作用 dry-run。因此 Sage 必须在自己的 authority 层建立完整、同代、可失效证据。

## Decision

### 1. Owner 与证据方向

```text
same Host + same MCP connection generation
        │
        ├─ raw artifact / launch observation
        ├─ complete paginated tools/list snapshot
        └─ lifecycle invalidation signals
        ▼
Electron-main ExternalCapabilityEvidenceProvider
        │ exact parse + classify + canonicalize + recompute
        │ C2B binding + trusted clock
        ▼
candidate descriptor + boot-scoped observation
        │
        ├─ C2D Registry：审批、allowlist、Adapter mapping、revoke
        └─ C2E RuntimeInventoryProvider：与 C2A/C2B/D 汇合
```

Host 与 MCP bridge 可以观察连接和 raw contract，但不能铸造 authority。Electron main 可以验证、重算与组合 evidence，但不能替 Capability Registry 审批，也不能替 Compatibility Authority 产生 `equivalent`。Resolver 继续是无 I/O 纯 kernel。

### 2. 两层对象

`ExternalCapabilityDescriptorV1` 的最低稳定材料：

- schema / canonicalization version；
- Sage-assigned `capabilityId` 与 exact capability version；
- transport kind 与实际 negotiated MCP protocol revision；
- verified bridge / SDK / server artifact subject；
- structured non-secret launch contract；
- normalized effective tool contract；
- bridge projection / enforcement contract；
- 重算的 descriptor digest。

`ExternalCapabilityObservationV1` 的最低实例材料：

- descriptor digest；
- C2B Host projection digest、boot ID、runtime generation 与 active profile generation；
- MCP connection generation reference；
- complete tool-list observation digest；
- 具名 transport / discovery / contract state；
- main-owned `observedAt / expiresAt`；
- 重算的 observation digest。

`capabilityId` 由 Sage 产品命名空间分配；remote `serverInfo.name`、mount `serverName`、公开 `mcp__...` 工具名、package display name 与模型文案都不能替代稳定产品 identity。

Revision 19 只接收调用方已经 materialize 的 candidate 字段，进行 exact parse、规范化、重算与封存。此时的 `negotiatedProtocolRevision` 只是 allowlist 内的 candidate 值，不证明来自真实 connection；artifact digests 只是 candidate references，不证明已扫描实际 bytes / closure。上文的 actual / verified 是 C2C.2～C2C.5 的最终完成条件，不是 C2C.1 已具备的事实。

### 3. Artifact 与 launch subject

首版 local stdio subject 覆盖实际 bridge 与 SDK、launcher / interpreter、server entrypoint、完整 runtime dependency closure、package / lock 输入、executable bit、安全 symlink topology，以及行为相关的结构化非秘密 launch / protocol / overlay policy。每项使用稳定逻辑角色，不把绝对路径写入 subject。

Revision 19 的 v1 candidate 只接受 `transportKind: local-stdio` 与 `processMode: interpreter-entrypoint`，并强制且仅允许 `bridge / sdk / launcher / interpreter / server-entrypoint` 五个 artifact role。`direct-exec` 当前不可表示并固定拒绝；未来支持它必须升级合同或形成独立决策，不能虚构 launcher / interpreter 来套现有 schema。

`argumentPolicyDigest`、`environmentPolicyDigest` 与 `protocolOverlayDigest` 目前只校验各自类型隔离 URN namespace 和 64 位 lowercase SHA-256 形状，再进入 candidate launch digest；`executablePolicyDigest` 也只是 content reference。pure kernel 没有这些 policy body，不能验证内容、存在性、issuer 或 provenance，更不能证明其中没有 secret。真实 structured non-secret policy 与 artifact provenance 由 C2C.3 / C2C.5 验证并绑定。

下列输入只能导致 unavailable，不能被“清洗后 hash”：

- 动态 `PATH` 查找、任意 shell `-c`、command substitution；
- 未分类环境插值或 raw environment；
- credential script 同时注入秘密和命令 / 路径 / 行为；
- 动态 import / plugin root 无法闭合；
- artifact、mutable state 与 secret 位于无法分离的同一根；
- token、cookie、password、API key、refresh token、credential path、home/cwd/absolute path、raw command 或它们的 hash。

远端 Streamable HTTP server 若没有受信的 immutable release identity / provenance，只能形成 contract observation，不能伪造 `serverArtifactDigest`。

### 4. 同一 connection generation 的完整分页

1. 第一页 `tools/list` 不带 cursor；
2. 后续页只回传上一页 opaque `nextCursor`，不解析、不生成、不改写；
3. 收齐全部页后才形成候选 snapshot；
4. 跨页检查 raw tool name 唯一；
5. 空 continuation cursor、重复 cursor、超页数、超工具数、超 canonical bytes 或总 deadline 均 fail closed；
6. 任一页失败不产生新 evidence；
7. cursor、页边界与 server 页顺序只属 diagnostics，不进入 stable digest；
8. Electron main 不另开第二连接冒充执行连接的合同。

工具按 raw MCP name 的 code-unit order 形成 canonical set。公开工具别名、Cordis registry 顺序或模型上下文顺序不是稳定 identity。

### 5. Normalized effective tool contract

| MCP / bridge material | 分类 |
| --- | --- |
| raw `name` | stable semantic，必含 |
| 模型实际可见的 `description` | stable semantic；absent / empty 必须有固定解释 |
| 完整 `inputSchema` | stable semantic，必含 |
| 完整 raw `outputSchema` | stable semantic；另记录 bridge 是否真实 enforce 或降级 |
| `execution.taskSupport` | stable semantic；缺省按 pinned protocol 的 effective behavior 解释 |
| candidate negotiated protocol revision | stable semantic，只允许 pinned SDK 的五个 revision；C2C.1 不观察 live negotiation |
| bridge contract identity / digest | stable semantic，绑定 projection / enforcement |
| `title / icons` | 按 pinned exact shape 校验后丢弃，不进入 normalized DTO / digest；开始消费必须升级合同版本 |
| `annotations` | 只接受 pinned known hints 的 exact shape，校验后整体丢弃；不能推导 effect / permission / idempotency |
| tool `_meta` / extension | 未经 Sage 显式登记和分类时为 unsupported；阻断 descriptor |
| list-result `_meta` | 不进 stable contract，不持久化 raw 值 |

Canonicalization 在 exact parse 后按固定 schema 重建；object key 使用 locale-independent code-unit order；除显式 set-like 字段外不重排数组；不尝试证明不同 JSON Schema 的语义等价。任何未分类结构差异保守地产生新 digest 或 unavailable。

presentation 并非“任意 JSON 后忽略”：`title` 必须是 string；`icons` 必须是 exact icon array；`annotations` 只允许 `title` 与四个 boolean hint。合法 presentation 增删改不改变 stable digest；未知 annotation 或错误类型返回 `tool-contract-invalid`，tool `_meta` / unknown top-level tool key 返回 `tool-contract-extension-unsupported`。`descriptionSource` 保留 absent 与 present-empty 的差异，虽然两者的 `modelDescription` 都可以是空字符串；`outputSchema` 固定为 absent / `not-advertised`、present supported / `enforced`、present unsupported / `fallback-unstructured` 三态，两个 present 状态均保留 raw schema；缺省 `taskSupport` 的 effective value 固定为 `forbidden`。

### 6. Lifecycle 与 availability 分职

下列事件立即失效 current observation：Host / Loader / process invalidation、active generation 或 C2A drift、MCP close / reconnect、configuration reload、`list_changed`、artifact / launch / contract drift、observation expiry、clock rollback、分页失败或超限。

恢复必须重新执行同一新 connection generation 的完整分页、exact parse、digest 与 C2B binding。bridge 可以为了会话连续性保留旧工具注册，但产品 authority 必须保持 unavailable。

禁止单一 `healthy: true`；至少分为：

- `transportState`：进程 / transport 是否存活；
- `discoveryState`：完整分页是否成功；
- `contractState`：raw / effective contract 是否可分类、可验证；
- `operationPreflightState`：当前 identity / resource / operation 是否可执行。

C2C.0 与 C2C.1 不调用真实业务工具。未来 preflight 必须由 C2D Registry + Capability Adapter 注册 exact operation 与无副作用语义，受 Identity / Policy、数据出境与 retention 边界约束，紧邻动作执行并只进入 full evidence。工具名、description、`readOnlyHint`、历史成功与 tool visibility 都不能替代。

### 7. 稳定 failure code

首批至少保留：

```text
capability-artifact-unavailable
capability-artifact-unclassifiable
launch-contract-unclassifiable
tool-list-unavailable
tool-list-incomplete
tool-list-pagination-invalid
tool-contract-invalid
tool-contract-extension-unsupported
tool-contract-changed
connection-generation-changed
capability-observation-expired
capability-observation-invalidated
```

reason 使用固定、无秘密模板；不得回显机器路径、raw command、credential、server exception 或 raw `_meta`。

### 8. Revision 18 完成边界

WT-02C.2C.0 完成只代表 ADR、Note、常驻入口、Compatibility Authority、执行计划与派生账本一致。它明确不包含 production source / test、Host snapshot seam、真实 MCP connection、`tools/list`、`tools/call`、插件启用、Jev compatibility、Capability Registry、Adapter mapping、完整 runtime inventory、Matrix evaluation、C3 evidence、v1 event、Application Service、UI、真实数据或外部动作。

后续依次拆为 `WT-02C.2C.1` pure kernel、`.2` same-generation observation seam、`.3` local artifact observer、`.4` bounded availability/preflight contract 与 `.5` main-owned aggregate provider。C2D 的纯合同 / kernel 可以在共用 candidate descriptor DTO 冻结后并行，但真实 Registry entry 不能早于 C2C verified descriptor；C2E 必须独立负责 C2A/B/C/D 汇合，WT-02D 只能消费，不能临时拼 authority。

### 9. WT-02C.2C.1 revision 19 当前结果（当前工作树未提交）

Revision 19 新增无 I/O 的 local pure kernel：五类 body / digest 使用独立 schema 与 URN namespace；caller-supplied digest 全部重算；artifact role、launch mode、pinned bridge / SDK、raw Tool base shape、description / output / task / protocol effective contract 均 exact parse。object key 与 set-like tool / component 使用 code-unit order，schema array 保序；结果 detached、deep-frozen，不修改输入。hostile Proxy、accessor、exotic prototype、cycle、unknown key、错误 digest namespace / version、raw command / env / machine path 与未登记 extension 均 fail closed，reason 不回显原始敏感输入。

production kernel 只 import `node:crypto` 与 `node:util`，不访问 Host、MCP client、filesystem、network、clock 或 global state；测试中的 independent reference encoder 不 import 或调用 production encoder，并用手写 normalized expected body 与五类固定 digest 锁定结果。当前完成边界只能称为 `C2C.1 local pure kernel complete`；它不等于 C2C complete、`ExternalCapabilityEvidence` available、MCP 已接入、Registry 已批准、插件已启用或产品可用。C2C.2～C2C.5、C2D/C2E/C3、WT-02D、UI 与插件继续 pending，下一门是需单独授权的 `C2C-SEAM-DECISION`。

### 10. C2C-SEAM-DECISION revision 20（2026-09-29，bridge-owned seam，当前未提交）

为决定 C2C.2 的 observation 入口，本次只读核对 pinned `@deepseek-ai/dsh-mcp-client@0.1.5-rc.2` 的发布包、类型声明、实现与 seed lock。核对结果是：公开包只导出 `Config`、`apply`、`inject`、`name`；`ConnectionHandle` 只暴露 `ready` / `dispose`；真实 `Client`、transport、`startConnection`、`syncTools`、完整分页、`list_changed`、reconnect 与 generation queue 均由桥内部持有。发布包没有可供 Sage 直接导入的 `src`，分页完成后只留下 `ctx.tools` 注册结果。

因此决定：**唯一实现目标是 bridge-owned 的正式受控只读 seam**。bridge 继续拥有 Client、transport、分页、notification、reconnect、close 与 registry swap；未来 seam 只在 projection 前提供结构化、只读、同代的完整 raw snapshot、opaque generation reference、protocol facts 与具名失效事件，不暴露 Client、transport、registry disposer 或执行函数句柄。若 pinned bridge 当前版本没有该接口，必须先由其源码仓或 Sage-owned 可复现 fork 正式发布新版本，再由独立 ticket 更新 specifier / lockfile；本批禁止修改 `node_modules`、vendor tarball、解析 store 或 runtime monkey patch。

`ctx.tools` hash、Sage wrapper 复用公共 `apply`、Electron main 另开第二个 `Client` 均否决：它们分别丢失 raw / pagination / projection 事实，或违反 same-generation。`WT-02C.2C.2` 在正式 seam、隔离 fake server、完整有界分页、`list_changed` / close / reconnect 失效和零 `tools/call` 证据齐备前保持 `pending / blocked`。本决策不连接真实 MCP、不启用插件、不修改 v1 event schema、UI、Registry、Application Service 或产品调用面。

### 11. WT-02C.2D.0 Registry governance revision 21（2026-09-29，当前未提交）

`C2C.1` 的 candidate descriptor 已冻结，但这不等于产品 allowlist。Revision 21 由 [ADR-0171](../../../adr/ADR-0171.md) 固定 Sage product/security governance 独占 Capability Registry 的 `candidate | approved | disabled | revoked` 四态与 immutable content-addressed snapshot；`mounted / observed / enabled / compatible / authorized / available` 是正交事实轴，不能互相抬升。

`approved` 只能绑定 C2C.5 verified descriptor/provider、artifact / launch / tool-contract provenance、精确 Adapter operation mapping、owner approval 和有效时间。typed policy URN、caller-supplied digest、fixture、package version、`ctx.tools` projection、Host ready、进程存在或历史 Jev 装配都不能产生 real `approved` 或 `adapterMappingDigest`。每次迁移必须新建 snapshot；`revoked` 为终态，恢复只能创建新的 identity / descriptor version / entry。C2D.0 只关闭 governance contract，不实现 Registry kernel/provider、真实 entry、Adapter、插件、UI、Identity / Policy、Compatibility 或产品动作；C2D.1/.2 另批。

### 12. WT-02C.2C.5 aggregate evidence kernel revision 23（2026-09-29，当前未提交）

Revision 23 将 C2C.5 的**可独立安全入口**收窄为无 I/O 的 aggregate evidence kernel，新增 `apps/sage-shell/src/security/external-capability-evidence.ts` 与对应 hostile-input / freshness 测试。内核只接受调用方已经取得的 C2B 主机投影、C2C descriptor、artifact / launch / tool evidence reference、同代 connection binding 与显式 `observedAt / expiresAt`；它 exact-parse 每层 schema、重算 evidence digest、绑定 boot / runtime / active generation、要求 transport=`connected`、discovery=`complete`、contract=`valid`，并以半开 freshness 区间 `[observedAt, expiresAt)` 做确定性校验。

这一步只证明**输入事实可以被安全聚合成一个 detached、deep-frozen、content-addressed evidence candidate**。`source: c2c5`、descriptor digest 与各类 typed evidence URN 仍是 caller-supplied references；内核没有扫描实际 bytes、读取 Host、访问 MCP / bridge、验证真实 provenance、读取系统时钟、观察分页 / reconnect / `list_changed`，也不会创建 Registry approval、Adapter mapping、availability、authorization 或产品动作。因而它不是 production `ExternalCapabilityEvidenceProvider`，不能把 fixture 或候选引用升级为 verified descriptor。

正式 C2C.5 provider 仍必须等待 C2C.2 的 bridge-owned seam、C2C.3 artifact observer 与 C2C.4 availability / preflight 合同，在 Electron main 以同一执行 connection generation、C2B projection 和受信时间源汇合后另批实现；在此之前 C2C.2～C2C.5 的生产链路与 C2D.2 real entry 继续 `pending / blocked`。

### 13. WT-02C.2C.3 local artifact observer revision 24（2026-09-29，当前未提交）

Revision 24 新增 `apps/sage-shell/src/security/external-capability-artifact-observer.ts` 与对应测试，提供一个不依赖 bridge seam 的、显式 root-scoped local artifact observation 入口。调用方必须同时给出 artifact root 与 exact static execution manifest；observer 只接受 `local-stdio + interpreter-entrypoint` 和五个封闭 logical role：`bridge`、`sdk`、`launcher`、`interpreter`、`server-entrypoint`。root 形状严格限定为 `package.json`、`pnpm-lock.yaml` 与上述五个 component directory，未知顶层条目、component 条目或 manifest 字段均拒绝。

observer 对 package / lock 与 component closure 读取实际 bytes，重算文件 SHA-256、executable bit、相对 symlink topology 与每个 component digest，并生成 pathless candidate artifact subject、execution-manifest digest、launch-evidence digest 与 artifact-evidence digest。安全边界包括：只接受绝对 artifact root、`O_NOFOLLOW` 打开文件、文件与递归目录的开前/开后 fingerprint、目录名复核、lexical + physical root containment、拒绝绝对 / 反斜杠 / 空 symlink target、拒绝特殊文件、4096 条目 / 64 MiB / 64 KiB bounded scan，以及 fixed static launch policy（disabled shell、empty environment、pinned-relative path、static literals）。manifest 的动态 shell、PATH lookup、raw environment、secret/path 混合、root expansion 与任意进程启动都不被表示或执行。

该 observer 只证明**一次受控 local artifact root 的安全读取**，不是 producer provenance 或 live runtime attestation。它不启动 interpreter、不访问 Host / MCP / bridge、不创建第二连接、不执行 `tools/list` / `tools/call`、不读取系统时钟、不启用插件、不产生 Registry approval / Adapter mapping，也不连接真实 Sage root；同 UID mutation、真实签名 / provenance、policy body 与 bridge-owned same-generation seam 仍由 C2C.2、C2C.5 provider 和 C2D.2 另批关闭；C2C.4 只提供边界合同，不提供这些事实。

### 14. WT-02C.2C.4 bounded availability / preflight contract revision 25（2026-09-29，当前未提交）

Revision 25 新增 `apps/sage-shell/src/security/external-capability-availability.ts` 与 `apps/sage-shell/test/external-capability-availability.spec.ts`，把 transport、discovery、contract 与 operation preflight 固定为四个正交状态轴。内核只接受 exact、plain、detached input，绑定 descriptor / evidence digest、同代 host / connection generation 和显式 `[observedAt, expiresAt)` freshness window；`connected + complete + valid` 才能推导 `availabilityState: available`，其余组合为 `unavailable`。

operation preflight 只允许 `not-requested`、`port-valid`、`blocked`、`expired`、`invalid` 的封闭形状。`port-valid` 可以携带 caller-supplied candidate port digest，但它不证明 Registry operation mapping、Identity / Policy、数据出境边界或真实执行；无论 availability 是否为 `available`，本合同的 `actionability` 永远固定为 `blocked`。因此本票关闭的是可复用的 availability / preflight **边界合同**，不是 operation authority 或产品可用性。

内核只 import `node:crypto` 与 `node:util`，不读取 Host、MCP、bridge、Registry、Adapter、filesystem、network、clock 或 global state，不调用真实 `tools/list` / `tools/call`，不启用插件，不修改 UI、Application Service、v1 event schema、package / lockfile，也不创建 provider。测试覆盖四轴正交性、generation drift、exact preflight shape、digest tamper、half-open freshness、hostile records、deep freeze 与 import firewall。C2C.2 formal seam、正式 C2C.5 provider、C2D.2 real entry 与产品接线仍保持 `pending / blocked`。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| Hash Harness 已注册工具 | 否决；会丢 raw contract、分页、bridge 忽略字段和 enforcement 差异。 |
| main 另开连接做 inventory | 否决；不是执行连接的同一 generation。 |
| package version / lock / server 自报作为 artifact identity | 否决；不证明实际 resolved closure 与 bytes。 |
| 只取第一页 `tools/list` | 否决；得到截断合同。 |
| `list_changed` 后保留旧 evidence | 否决；运行连续性不等于 authority freshness。 |
| 信任 annotations、工具名或 description | 否决；它们不是 Sage security policy。 |
| 调真实工具做 health probe | 否决；可能读敏感数据、出境或产生副作用。 |
| Hash 脱敏 raw command / env | 否决；不证明执行语义且仍可能泄漏。 |
| C2C 直接输出完整 inventory 或 `equivalent` | 否决；越过 C2D、C2E、Matrix 与 C3 owner。 |

## Consequences

- C2A、C2B、C2C 成为三个分职明确的事实源；“loaded / has tools”不再冒充 compatible、authorized 或 available。
- Tool contract、bridge projection、artifact 与短生命周期 observation 可以独立漂移、具名失效和重新验证。
- candidate descriptor DTO 已冻结，可供后续 C2D.0 / C2D.1 的治理合同和 pure Registry kernel 使用；真实 approved entry 必须等待 C2C.5 verified descriptor / provider，typed policy URN 不能充当 provenance。
- Fresh observation 的成本与工具数、schema bytes 和分页数相关，必须采用明确上限和总 deadline。
- 保守 canonicalization 会把部分无害重排视为 drift；首版接受这一代价，不引入 schema semantic equivalence。
- same-UID mutation、pathname TOCTOU 与恶意远端 server 仍是 residual；evidence 证明观察到的 bytes / contract，不保证 server 行为诚实。
- 当前 seed lock 与未来 live generation 是两类事实；本 Note 不把 lock 解析冒充 live artifact attestation。
- 参考：[MCP Tools 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)、[MCP TypeScript SDK Client API](https://ts.sdk.modelcontextprotocol.io/v2/api/@modelcontextprotocol/client/client/client.html)。

## 验证合同

revision 18 只验证治理一致性：ADR machine-readable block / ledger、Note 四段、链接、Birdview、精确 path set 与既有 Sage gates。

revision 19 的 C2C.1 验证仅覆盖 pure candidate kernel：independent reference encoder 与手写 expected bodies、五类 fixed goldens、hostile exact parsing、description/output/task/protocol 语义、typed digest namespace、secret/path structural exclusion、code-unit ordering、array-order preservation、deep freeze / detach 与 strict import firewall。bounded pagination、同代 snapshot、notification/reconnect invalidation、真实 artifact drift / provenance、freshness、main-owned provider composition 与零业务 `tools/call` fake-server 证据均属于 C2C.2～C2C.5，不能记到 C2C.1。

Revision 19 终验实际结果：focused external-capability spec `19/19`；相邻 compatibility / artifact-attestation / runtime-inventory suites `79/79`；Sage Shell 全量 `25 files / 324 tests`；typecheck、build、quick gate `23/23`、strict gate `23/23`（no-skip）均通过；独立 P0/P1 复审为 `0/0`。这些是当前本地未提交工作树的 pure-kernel 证据，不是 live MCP、verified artifact/policy provenance、Registry、UI、插件或产品闭环证据。

Revision 23 的验证只覆盖 aggregate kernel：descriptor / provenance / host / connection 的 exact binding、同代 generation 拒绝、digest tamper 拒绝、显式半开 freshness、invalid connection / provenance、detached deep freeze 与 production import firewall。它不覆盖 bridge seam、完整分页、真实 artifact / policy provenance、trusted clock、live MCP、Registry provider / entry、Adapter、插件或 UI；这些仍必须以各自 ticket 的真实边界单独验收。

Revision 24 的验证覆盖 local observer focused `6/6`、manifest / root / symlink / drift / limit / import-firewall 反例，以及 typecheck / build、Sage full test、quick / strict gate、diff check 与 Birdview 产物门禁。该读数只代表受控 fixture 的 local observation；不得写成真实 artifact provenance、live MCP、Registry、plugin 或产品可用证据。

Revision 25 的验证覆盖 availability / preflight focused `6/6`、四轴不变量、generation / shape / digest / freshness 反例与 production import firewall；并以 typecheck、build、Sage full test、quick / strict gate、diff check 与 Birdview 产物门禁确认范围。该读数只代表纯合同内核，不得写成真实 operation preflight、Identity / Policy、Registry、Adapter、live MCP、plugin 或产品可用证据。
