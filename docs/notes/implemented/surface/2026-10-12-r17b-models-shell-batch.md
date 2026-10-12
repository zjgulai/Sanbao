---
title: R17-B 模型设置壳批：编辑器结构复刻，凭证面零接触（P06）
doc_type: architecture
module: sage-shell
topic: r17b-models-shell-batch
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: ai
---

# R17-B 模型设置壳批：编辑器结构复刻，凭证面零接触（P06）

## Problem

R17 波 B：models 11 行 pending。观测齐备（QB20-01..07 + 供应商菜单尾注）；原型参照 `SettingsModelsPage`。ADR-0318/0319 明文「波 B 凭证裁决前置」；v10 走查实证宿主凭据服务无 Sage 面写入路径。

## Decision

按 [ADR-0333](../../../adr/ADR-0333.md) 实施：纯壳批。编辑器结构逐字复刻（QB20-01..07）+ 真实本地交互（添加弹窗开/关、供应商菜单三组 17 项与 DeepSeek 选择、类型/模型/API 类型面板 Escape 回、放弃确认双出口初焦继续编辑）。API Key 恒空只读、校验禁用具名、endpoint/Model ID 只读占位、外链不渲染、DeepSeek 不含购买 Token Plan（QB20-04）。零写入、零 route、零凭证接触。凭证写入路径独立成批（票级）。

## Alternatives considered

见 ADR-0333 备选表（偏好 store、接通凭据写入、渲染外链、可编辑暂存——逐条否决）。

## Consequences

- models 页落地；矩阵 UI pending 66→55、implementing 132→143。
- P06 剩余：9 入口行（波 D）、scope 行、两占位。
- 后续批具名：宿主凭据写入路径（票级）→ 真校验/保存 → 已配置列表。

## Verification

真实运行（2026-10-12）：

- tsc 0 错；新 spec `desktop-settings-r17b.spec.tsx` 5 例（默认页与添加弹窗、供应商菜单 17 项与 DeepSeek 三面板、compatible 双变体只读草稿、放弃确认双出口、干净取消直返）。
- 既有 settings 面 17 例全绿（view / r17 / r17c）。
- 矩阵 `--check-source --source-root vendor/sanbao-prototype` PASS（206 行；UI 143/55/8）。
- `pnpm run gate` 退出码见提交记录。
