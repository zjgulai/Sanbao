---
title: scope 伞行核销迁移第一批：12 条
doc_type: process
module: sanbao-integration
topic: scope-rows-migration
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# scope 伞行核销迁移第一批：12 条

## Problem

矩阵 55 条 `*.scope.unexpanded` 伞行全部 pending。伞行不承载自身 UI——核销只能由组内具体行状态表达（侦察判据，见 [并行侦察记录](2026-10-11-scope-and-knowledge-sites-recon.md)）。

## Decision

按侦察判据迁移「组内具体行全部 implementing」的伞行，共 12 条：

| 伞行 | 组内叶计数 | 备注 |
|---|---|---|
| QDR.A01.scope.unexpanded | 3/3 | 大差异/加载状态叶未拆 |
| QDR.A02.scope.unexpanded | 1/1 | 非穷举（分组/hover/计划文件去重未观察） |
| QDR.M01.scope.unexpanded | 2/2 | 思考详情/过程分组叶未拆 |
| QDR.M02.scope.unexpanded | 2/2 | — |
| QDR.O01.scope.unexpanded | 1/1 | 键盘选择/详情/空搜索叶未拆 |
| QDR.P01.scope.unexpanded | 2/2 | 指定 Agent/搜索命中定位叶未拆 |
| QDR.P02.scope.unexpanded | 1/1 | 唯一叶证据为 candidate-untracked（.birdview）；组覆盖引 tracked desktop 搜索 spec |
| QDR.P16.scope.unexpanded | 1/1 | 固定/浮动/分组展开叶未拆 |
| QDR.S01.scope.unexpanded | 2/2 | 过程折叠/思考详情叶未拆 |
| QDR.S02.scope.unexpanded | 3/3 | SwitchMode 确认叶未拆 |
| QDR.S08.scope.unexpanded | 2/2 | 真实失败分支叶未拆 |
| QDR.S10.scope.unexpanded | 1/1 | 压缩/侧聊继承叶未拆 |

每行 evidenceRefs = 组内叶的 tracked-test 并集（`countsAsVerification:false`）；blocker 写明非穷举与未拆叶。复核：程序化复算 12 组叶状态全部 implementing（与侦察一致）。同批 O08 伞行已随 ADR-0306 迁移（此前 12/12 之列少它一条）。

保持 pending：O02（依赖 files 叶）、P03/P04/P06/P13/P14（具名依赖）；其余 36 条组内零叶。

## Alternatives considered

- 一次迁全部 19 条非零叶伞行：否决——7 条有未装叶依赖，迁移会制造假「组已核验」。
- 伞行留待「核验票」另立：否决——伞行无独立 UI，组内状态即核验读数。

## Consequences

- 矩阵 `ui` implementing 47→59、pending 151→139。伞行余量：7 条依赖 + 36 条零叶。
- P06 可在外观子树层面拆伞核销（后续批次可议）。

## Verification

真实运行（2026-10-11）：`--write`（源根 vendor/sanbao-prototype）、`--check-source`、`--check`、矩阵 gate、selftest 13/13 全 PASS；summary 由 deriveSummary 重算（引用上方读数）。
