---
title: 矩阵 models 行验证对齐——兼容供应商闭环升 verified，DeepSeek 三分支如实保持 blocked
doc_type: process
module: sage-shell
topic: models-matrix-verification-alignment
status: stable
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# 矩阵 models 行验证对齐

## Problem

ADR-0339/0340 建成兼容供应商全链（录入→两步保存→列表→显式测试→默认切换）+ 组件集重发布修复后，tracked 矩阵 11 行 models 的存量断言已失真：8 行 blocker 仍写「凭证写入路径未接线 / 什么都不录入、不校验、不保存」，3 行 DeepSeek 分支的新真相（默认供应商凭据走实例卡、表单写入面未接线）也未登记。

## Decision

按矩阵既有先例（`QDR.P06.settings.appearance.*` 的 verified 模板）逐维迁移：

- **8 行升 verified**（entry/default/add.default/provider.open/discard.open/openai-compatible/api-type.open/anthropic-compatible）：ui（test 证据：r17b + model-routes 两 spec，涉及凭据的行加 credentials spec）、applicationService（routeRefs=POST /.sage/model-config 与 POST /.sage/credentials 按行取真 + route-matrix/live-readings 证据）、electronAcceptance（打包 staging 实测记录 + v18 验收 JSON）。hostIntegration/visualAcceptance 保持 pending（无对等证据，不冒充）。
- **3 行 DeepSeek 分支保持 blocked**，blocker 改为真相（写入面未接线；凭据走实例卡）。
- 摘要计数按行重算；行集合不动（`stateIdsSha256` 不变）。

## Alternatives considered

- 升 integrationStatus=integrated：缺口=hostIntegration/visualAcceptance 未验；否决（伪升）。
- 本地交互行（菜单/放弃）标为 blocked：与 appearance 先例（菜单行挂 pane 级数据面）不一致且语义为假；取先例。
- 新增 composer 选择器行：需要自身观测 profile；本轮不做，登记为矩阵欠项（note 别处已记）。

## Consequences

- ui verified 8→16、applicationService 8→16、electronAcceptance 8→16；blocked 198→190。
- 自定义模型全链（含新会话首发送头部实证）作为 live-readings 挂入 8 行；后续票（019/018 未闭项）不改变本批登记。

## Verification

- `node --test scripts/gates/sage-sanbao-state-matrix.test.mjs` 13/13；全套 `pnpm run gate` 32/32（提交记录）。
- 证据链：ADR-0339/0340 note（真实运行节）+ v18 验收 JSON + route 权威矩阵行（/.sage/model-config 已登记）。
