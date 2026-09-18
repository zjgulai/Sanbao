# 2026-09-18 · 安全运行时契约主门禁与自动化端到端验收闭环（SEC-RT-010）

- 状态：implemented（2026-09-18）
- 负责人：lute
- 对应 ADR：[ADR-0120](../../../adr/ADR-0120.md)

## Problem

在 SEC-RT 改造阶段推进至最后一项（SEC-RT-010）时，系统已完成了 SEC-RT-001 至 SEC-RT-009 以及 SEC-RT-003A 等多项核心安全加固。然而，安全契约缺乏集中治理与闭环把关机制：
1. 各安全契约的目标文件与测试文件分布在不同的包与子系统（如 `dsh-overseas-skills`、`dsh-root-brand-local`、`dsh-theme-local`、`dsh-team-hub` 等），没有全局登记册。
2. 缺乏单一入口对这 10 个安全契约进行分母守恒校验；一旦某个测试文件路径漂移或被误删，可能退化为空射程假绿（P-02 / ADR-0102）。
3. 缺少一键端到端验收工具来跨包调用真实测试文件，核对全部 36 个故障注入点。

## Decision

1. **建立全局契约登记簿**：
   在 `scripts/gates/security-contract-registry.mjs` 中定义 `SECURITY_CONTRACT_REGISTRY`，严格枚举 SEC-RT-001 ~ 009 及 003A 共 10 项契约，每项明确 targetFiles、testFiles、faultPoints 与 `releaseBlocker: true`。
2. **构建主审计门禁与自测套件**：
   在 `scripts/gates/security-contract-master.mjs` 中实现 `auditSecurityContractMasterGate`，检查必需 ID 覆盖、目标与测试文件真实存在性、故障注入点非空以及 releaseBlocker 标志。
   在 `scripts/gates/security-contract-master.test.mjs` 中提供 6 项反向突变测试（缺 ID、错 targetFile、错 testFile、无 faultPoints、releaseBlocker 为 false 等），自证能拦截所有非法输入。
3. **编写端到端验收脚本**：
   在 `scripts/acceptance/security-runtime-acceptance.mjs` 中实现自动化串联，先运行静态结构与存在性核验，再通过 `real-node.mjs` 顺序执行所有去重后的测试套件并统计 36 个 fault points 的验证结果。
4. **集成进主门禁**：
   在 `scripts/gate.mjs` 中接入 `security-contract-master` 与 `security-contract-master-selftest`。

## Alternatives considered

1. **仅在 CI 流水线中编写 shell 脚本串联各测试**：
   - 缺陷：CI 脚本无法脱机运行或本地自证，容易腐化，且不具备 ADR-0102 的分母守恒与反向突变自测机制。
2. **仅在各子包中保持各自测试，不设 Master Gate**：
   - 缺陷：若有新加入的开发者修改目录结构或改名测试文件，子包门禁无法察觉安全契约整体完整性缺失，无法履行 release blocker 的阻断职责。

## Consequences

- 10 项核心安全契约获得全局统一的事实源。
- 门禁分母严格固定为 10，任何一项漏审都会导致门禁硬失败。
- 端到端验收命令可脱机一键运行（`node scripts/acceptance/security-runtime-acceptance.mjs`）。
- 任何试图将 `releaseBlocker` 改为非 true 的行为均被反向突变机制阻断。
