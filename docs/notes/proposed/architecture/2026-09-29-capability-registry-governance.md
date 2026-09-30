# Capability Registry 治理记录：Sage-owned allowlist、不可变 snapshot 与生命周期分层

- 日期：2026-09-29
- 状态：`WT-02C.2D.0 revision 21` 治理合同已完成，`WT-02C.2D.1 revision 22` pure kernel 已实现并通过 hostile tests；provider、真实 entry、Adapter、插件与 UI 仍未接线，当前工作树未提交
- ADR：[ADR-0171](../../../adr/ADR-0171.md)
- 相关：[Compatibility Authority](2026-09-28-compatibility-authority.md)、[External Capability Evidence](2026-09-28-external-capability-evidence.md)、[能力装配契约](2026-09-27-capability-mounting-contract.md)

## 1. 为什么现在固定 Registry 合同

`C2C.1` 已冻结候选 descriptor 的 exact parser / canonicalization，但 `C2C.2` 仍等待 bridge-owned same-generation observation seam。与此同时，历史装配、Host ready、MCP tool registration、进程存活或 package pin 只能证明局部事实；它们不能生成 Sage 产品 allowlist。若先接插件或 Jev，会把“已挂载”误写成“已批准”，再把批准误写成兼容、授权或当前可用。

本批 `WT-02C.2D.0` 因而只固定治理边界，让 C2D.1 pure Registry kernel 可以在 C2C.2 blocked 期间独立开发；不读取真实 Sage root、不接真实 MCP、不创建 Registry entry、不启用插件、不改 v1 event schema。

## 2. Owner 与事实分层

| 事实 / 状态 | 唯一 owner | 本批结论 |
| --- | --- | --- |
| candidate / approved / disabled / revoked allowlist | Sage product/security governance | 由 Registry snapshot 记录；Host / bridge / plugin / renderer 没有写权 |
| descriptor、artifact、launch、tool-contract provenance | Electron main 的 C2C provider | 必须来自 C2C.5 verified descriptor/provider；typed URN 只是候选引用 |
| compatibility outcome / matrix | Sage Compatibility Authority / Resolver | Registry 不产生 `equivalent`，也不把 approval 变成 compatibility |
| identity / organization / operation authority | Identity / Policy Resolver | Registry 不产生当前授权，真实动作前仍需 fresh decision |
| Adapter operation mapping | Sage Capability Adapter owner | 没有真实 Adapter、effect 或 data boundary 不完整时，不能批准 |
| transport / discovery / availability | C2C / C2E / Application Service | Registry 不把 `available`、`enabled` 或 `mounted` 当作 approval |

七个词要分开写：`mounted`、`observed`、`enabled`、`approved`、`compatible`、`authorized`、`available`。其中只有 `approved` 是 Registry 生命周期状态，其他六个必须由各自事实源产生；任何一个为真都不能自动推出其他六个。

## 3. Entry 与 provenance 最低合同

Registry entry 的 stable identity 由 Sage 分配，不使用 package version、工具数量、进程 PID 或外部 server 自报名称。候选 entry 至少携带：

- `capabilityId`、entry schema version 与 descriptor version；
- candidate / verified descriptor reference，以及由 Sage security kernel 重算的 stable/full descriptor digest；
- bridge、SDK、launcher、interpreter、server-entrypoint 与 dependency closure 的 artifact / launch / tool-contract digest；
- source / owner / decision reference、effective / expiry / revoke 时间和 snapshot lineage；
- 一个或多个精确 Adapter operation mapping：operation id、adapter identity/version/digest、effect class、data boundary、输入/输出 contract digest、无副作用 preflight 语义和 revoke 行为。

只有 typed policy URN、caller-supplied digest、`ctx.tools` projection、fixture descriptor、历史 `mounted` 或 package lock 不能替代 verified provenance。`C2C.5` 未产出 verified descriptor/provider 之前，任何 real entry 只能是 candidate；当前不铸造 `adapterMappingDigest`。

## 4. 生命周期与 immutable snapshot

Registry 只接受四态：

```text
candidate ──(verified descriptor + mapping + owner approvals)──> approved
    │                                      │                       │
    ├──────────────> disabled             ├──────────────> disabled
    └──────────────> revoked               └──────────────> revoked

disabled ──(重新验证、重新批准、新 snapshot)──> approved
revoked  ──终态；只能创建新的 capabilityId / descriptor version──> new candidate
```

每次迁移都把 canonical entry set、decision refs、lineage、reason 与 effective time 固化为新的内容寻址 `snapshotId`。不允许原地改写、可变 `latest` 别名、用旧 snapshot 回填新授权，或把 revoked entry 原地 re-enable。duplicate、conflict、unknown schema、缺 descriptor provenance、缺 mapping、过期、revoked、未知 effect / data boundary 统一 fail closed。

`disabled` 只表示当前禁止新动作，不抹掉历史；`revoked` 表示该 identity / version 不得再恢复。历史 snapshot bytes 与 revoke 记录的 retention、legal hold、purge、export / restore 由后续 C3 / WT-02D 数据治理票独立确定，本票不发明持久化实现。

## 5. 与后续 tickets 的边界

| Ticket | 允许消费本票什么 | 本票不提前完成什么 |
| --- | --- | --- |
| `WT-02C.2D.1` | 四态、迁移矩阵、snapshot / digest、duplicate/conflict / fail-closed 约束 | pure kernel 只消费 caller-supplied candidate / verified descriptor reference；不接文件、网络、真实 Registry provider 或产品动作 |
| `WT-02C.2D.2` | app-bundled provider 的 owner、entry / snapshot shape 与 approval gate | 没有 C2C.5 verified descriptor 与真实 Adapter mapping 就不能落 real entry |
| `WT-02C.2C.2～.5` | 只提供 descriptor / observation / freshness 事实 | 不授予 Registry approval、compatibility 或 authorization |
| `WT-02C.3` / `WT-02D` | 读取 immutable snapshot / revoke provenance | 仍需独立决定 evaluation evidence、identity/policy、原子持久化和产品编排 |
| UI / plugin | 展示独立的 registry / compatibility / authorization / availability 投影 | 不得提交 outcome、approved、matrixId、snapshotId 或执行权限 |

首个 real capability 必须按 `candidate → verified C2C descriptor → C2D approved entry → MatrixV2 rule → Adapter mapping → WT-02D fresh authority/preflight → real operation` 顺序进入；任何 mounted / observed / enabled shortcut 都是拒绝条件。

## 7. WT-02C.2D.1 pure Registry kernel（revision 22，2026-09-29）

本批把第 4 节的治理约束落成一个无 I/O、可组合、fail-closed 的安全内核：

- `CapabilityRegistryEntryBodyV1`、`CapabilityRegistrySnapshotV1` 与 transition input 使用 exact runtime shape；拒绝未知字段、accessor、Proxy、错误 prototype、稀疏 / 扩展数组、重复 operation / approval、未知 schema 或未规范化时间。
- descriptor reference 分成 `candidate` 与 `verified` 两类。`verified` 必须带 `source: c2c5` 与 typed evidence digest；内核不验证 provider 本身，只验证调用方传入的引用形状，因此不把它提升为真实 provenance。
- snapshot 以固定 schema 重建 canonical JSON，分别以 `capability-registry-entry` 与 `capability-registry` namespace 计算 SHA-256；返回值和嵌套结构 deep-freeze，迁移从旧 snapshot 生成新的 `snapshotId` 与 `supersedesSnapshotId`，旧 snapshot 不变。
- `candidate → approved` 必须同时具备 verified descriptor、至少一个 operation mapping 与 owner approval；`disabled` 可重新审批但仍需上述门；`revoked` 是终态。duplicate、conflict、expired、missing、invalid 与 revoked 全部返回稳定 failure code，不产生等价、授权或可用性判断。
- 时间验证采用确定性的 UTC 字符串 / 闰年日历检查，不读取系统时钟；源文件不导入 `fs`、网络、进程环境、Electron 或 Host。9 组测试覆盖 canonical order、lifecycle、tamper、unknown/accessor/Proxy、mapping、expiry 与 import firewall。

该实现是 C2D.1 的 pure kernel evidence，不是生产 Registry provider。C2D.2 仍需等待 C2C.5 verified descriptor/provider、真实 Adapter mapping、owner approval source 与 app-bundled snapshot 装载边界；在此之前，测试中的 `approved` 只用于验证状态门，不能启用插件、连接 MCP 或执行真实动作。

## 8. 本批验证与结论

本批实现并验证 pure Registry kernel 与 hostile tests，同时复核 ADR、Note、Compatibility Authority、执行计划、AGENTS 必读入口、ADR 索引 / 派生账本和 Birdview 活动的一致性。没有 provider、real entry、Adapter、package、lockfile、vendor、node_modules、真实 MCP、`tools/list`、`tools/call`、插件、UI 或产品数据变更；没有暂存、提交或推送。

终验实际结果：Sage Shell `typecheck`、`build`、全量 `26 files / 333 tests`，quick gate `23/23`，strict gate `23/23`（no-skip），ADR agent records `171/171`，Birdview revision 22 `20 modules / 26 relationships / 4 events`，Birdview examples `6 modules / 5 relationships / 5 events`，Birdview skill tests `87/87`，以及 `git diff --check` 均通过。工作树保持未暂存、未提交、未推送。
