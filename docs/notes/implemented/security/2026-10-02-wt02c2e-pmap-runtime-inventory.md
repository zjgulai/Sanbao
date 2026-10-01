# WT-02C.2E-PMAP/E.0 · PMAP 合同与静态层 runtime inventory producers

日期：2026-10-02 · 分类：security · 关联 ADR：[ADR-0187](../../../adr/ADR-0187.md)

## Problem

C 链 `RuntimeDescriptorBodyV2` 的 **provider / model / agent / preset** 四面（PMAP）从未有受信 producer：C2B 只交付 boot 层观测（`HostLiveInventoryProjectionV1`）并明确不构造完整 `RuntimeInventoryEvidenceV2`，PMAP 面在此之前无数据源。C2E 汇合（`RuntimeDescriptorV2` 组装 + 与 C2B 合并，C2E.2）依赖四个组件的五面证据先存在且**来源诚实**——不能用 placeholder 或自报值补齐（ADR-0165 / ADR-0166 的复合证据与 stable/full 分层纪律）。

## Decision

1. **PMAP 观测矩阵合同（E.0）**：逐组件钉死五面（identity / version / artifactDigest / contractDigest / behaviorConfigurationDigest）的覆盖主体、canonical 规则与来源 provenance，全部带 dsh 包源码锚点（`dsh-agent-presets` / `dsh-settings-file` / `dsh-agent-default-model` / `dsh-agent`）；evidence 显式标注 `observationScope: 'materialized-static'`——运行态 effective 配置（env 层合并、实际 mount enablement、default preset 标记）不在静态层语义域。
2. **静态层 producers 实现**（`src/main/runtime-inventory-pmap.ts`，新文件）：main-owned、只读的 PMAP evidence 生产者。注入面 `{ harnessHome, profileDir, fs 三端口, now }`（零模块级 I/O、零 fs import 泄漏）；preset 双 root 按序扫描 + **first-root-wins per id**（dsh discovery 语义）、`agent.cordis.yml` + 存在的 `preset.yml` 进 artifact 清单 digest；settings 只读 `agent-default-model` 命名空间白名单三字段（provider / model / reasoningEffort），**绝不整档透传**；provider 由 route 解析 `@deepseek-ai/dsh-llm-<route>` 包身份与树 digest；agent 包身份 + exports canonical；所有包树 digest 强制 realpath containment（逃逸 profile → broken），symlink 不展开（安装时拓扑归 C2A）。
3. **空态语义二分**：**合法空集**（settings 文档缺失、命名空间缺失、user preset root 缺失——约定用户面不存在）产生显式 `absent` 面；**缺输入**（shipped preset root 缺失、composition 不可读、包不可解析/逃逸）产生 `broken` + 稳定原因码（C2E.2 汇合时映射 composition unavailable）。YAML 形态 settings 在零依赖纪律下**不解析**（`deps: {}` 不破）：文件按存在性进入 evidence，字段级选择如实 `absent`（reason `settings-not-statically-parsed`），字段级解析通道留后续票裁决。
4. **证据形状**：`sage.pmap-component-evidence.v1` candidate evidence（非最终 `RuntimeComponentDescriptorV2`）；provider / model / agent 各至多一条（absent 时也各出一条显式 absent），preset 每 roster 行一条；全体 deep freeze、路径零机器泄漏（source 为 `profile:` / `harness:` 相对锚点）；每行 `evidenceDigest`（canonical 覆盖除自身外全体）。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 本票一并解析 YAML settings（引依赖或手写解析器） | 否决；零运行时依赖是包纪律，手写 YAML 是长期 footgun；以稳定 reason 如实 absent，字段通道另票。 |
| 本票做运行态 effective 观测（env 层合并 / 实际 mount 求值） | 否决；需要 Host protocol 扩展（独立票），且静态层猜测 effective 值违反「不是权威不冒充」。 |
| producers 直接产出 `RuntimeComponentDescriptorV2` | 否决；组装与 C2B 合并属 C2E.2 composition，本票只输出 candidate evidence（面可为 absent/broken）。 |
| 展开 symlink / 重新 attest 安装拓扑 | 否决；安装时 attestation 归 C2A（`artifactSetDigest` 语义域），静态层重复 attest 会制造第二个家。 |
| settings 整档进 evidence 或落盘 sample「让 provider observed」 | 否决；白名单字段纪律 + 只读纪律，不伪造观测。 |

## Consequences

- **真实读数（2026-10-02）**：spec 单跑 9/9；全量 `node scripts/test.mjs run` **56 files / 551 tests 全 PASS**；`npm run typecheck` 0 error；`npx tsc` 构建通过；`npm run smoke` PASS；仓根 `node scripts/gate.mjs` **25/25 通过**。
- **变异验证三组**（T3 收口时当场复核：改源→红→还原后逐行核对）：M1 preset artifact digest 名空间互换 → 1 红；M2 first-root-wins 移除 → 1 红；M3 absent/broken 混淆 → 1 红；三组还原后 9/9。
- **真实 root 读数**（active generation `ae615ae9` + harness home 实读，零写入）：7 行——provider / model `absent`（`settings-document-absent`，本机 settings 未配置）；agent `observed`（`agent:@deepseek-ai/dsh-agent@0.1.5-rc.2` + artifact/contract digests）；4 个 system preset `observed`（cordis / minimal / ptc / standard，各带三层 digest）；user preset 零行（合法空集）。
- **边界**：`RuntimeDescriptorV2` / `RuntimeInventoryEvidenceV2` 汇合（C2E.2）、capabilities（C2D/C2C）、运行态 effective 观测与 Host protocol 扩展、default preset 标记、Registry、Matrix、UI、任何写入（harness / profile / settings）均不在本票；不读 `.credentials.yaml`；零持久化。
- **遗留登记**：①C2E.2 composition（PMAP + C2B 汇合）为下一依赖；②运行态 effective 观测（含 default preset 标记的运行时求值）需 Host protocol 扩展独立票；③YAML settings 字段级解析通道待裁决。
