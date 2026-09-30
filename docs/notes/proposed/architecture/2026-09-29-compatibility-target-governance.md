# Compatibility Target 治理记录：revision-bound immutable requirement registry

- 日期：2026-09-29
- 状态：WT-02C.2T revision 26 治理合同已确认；target provider、MatrixV2 provider 与 Application Service 仍未实现
- ADR：[ADR-0172](../../../adr/ADR-0172.md)
- 上位边界：[Compatibility Authority](2026-09-28-compatibility-authority.md)、[BusinessMatter contract](../../../specs/2026-09-24-businessmatter-contract.md)、[Capability Registry 治理](2026-09-29-capability-registry-governance.md)

## Problem

Compatibility Authority 已经区分 stable target semantic digest 与一次性 full evidence，但当前 v1 领域 DTO 没有完整、可审计的机器可读 capability requirements。若让 UI、插件、Host、模型、自由文本或 action body 猜测 target，后续 MatrixV2 会把候选输入当成 authority；若直接修改 v1 event schema，则会把治理合同、历史回放和持久化迁移混成一批，扩大当前范围。

## Decision

### 1. 唯一事实家与 owner

`CompatibilityTargetProvider` 由 Sage product/security governance 拥有，未来只读 app-owned、内容寻址的 immutable requirement snapshot。renderer、插件、Host、模型和普通调用方不能提交 authoritative target；它们最多提供候选 metadata，必须由 Application Service 结合 current revision 和 provider 重新求值。

### 2. 独立 requirement schema，不改 v1 event

新合同使用独立的 `sage.compatibility-target-requirement.v1` schema、独立 canonicalization version 与 typed digest namespace。`BusinessMatter` v1 event 继续保持现状；target semantic / full evidence 的持久化、retention、legal hold、原子性与历史 replay 属于 C3 / WT-02D 另行决策。

### 3. Stable semantic 与 full evidence

稳定 semantic material 只保留可跨事项实例复用的精确安全语义：

- action scope、effect、decision requirement；
- permission / data-boundary 的结构化 policy contract；
- Provider / Model / Agent / Preset / Capability 的 Sage identity、exact version / digest、contract reference 与行为要求。

`matterId`、`revisionId`、`revisionDigest`、具体资源 / 组织 / 账户、provider provenance、effective time、expiry 与实例边界只能进入 full target evidence。full evidence 在 stable lookup 前必须绑定 current revision；实例变化不能回写 stable requirement。

### 4. Exact、fail-closed 与不可推导

要求 exact identity / version / digest / contract；SemVer range、wildcard、mutable alias、自由文本、UI selection、工具名、package display name、普通调用方 digest、未分类字段和无法证明 provenance 的引用全部拒绝。unknown、duplicate、conflict、expired、revoked 或 provider unavailable 不回退旧 target，也不产生 `equivalent`。

### 5. Immutable snapshot 与后续实现

每次 publish / revoke 都生成新的 requirement snapshot，绑定 canonical bytes、owner decision、effective / expiry / revoke、lineage 与 digest。禁止 mutable `latest`、原地编辑、按 matter / boot 动态铸造长期 stable key 或 revoked entry 原地恢复。

本批只落 ADR、Note、Compatibility Authority、执行计划和 ADR 派生索引；不实现 provider、real target、MatrixV2、UI、插件、真实 identity / MCP / Registry / Adapter，不修改 v1 event schema、package / lockfile，也不读取真实 Sage 数据根。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 修改 v1 event schema 承载完整 target | 否决；schema、retention、atomicity 与历史 replay 尚未单独决策。 |
| 从 goal / 自由文本 / action body 推导 requirements | 否决；不可审计，且会混淆产品意图与安全约束。 |
| UI / 插件 / Host 自报 target digest | 否决；不具备 authority，只能提供候选。 |
| SemVer range / wildcard / latest | 否决；会引入重叠、优先级和可变漂移，破坏 MatrixV2 exact lookup。 |
| 先接远端 target service | 延后；先冻结本地 immutable owner 边界，再单独评估签名 / bootstrap / network。 |

## Consequences

- 后续 C2T pure kernel、MatrixV2 provider 与 WT-02D Application Service 可以消费同一份 target requirement 形状。
- stable target semantic digest 不含事项实例、账户、时间或 boot；full evidence 单独绑定 current revision 与 provenance。
- 真实 target provider 仍 pending；本 Note 不证明 compatibility、availability、authorization、Registry approval 或产品动作。
- 当前 C2C.2 formal seam、C2C.5 production provider、C2D.2 real entry、C2E、C3 与 WT-02D 依赖各自真实输入，不能由本批文档提前关闭。

## 验证合同

本批验证 ADR / Note 四段结构、双向链接、ADR 派生账本、docs-link、Sage quick / strict gate、diff check 与 Birdview 活动页。源码、测试、package、lockfile、v1 event、UI、插件和真实数据均为 0。
