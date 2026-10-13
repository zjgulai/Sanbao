---
title: 018 收口 A2——pi-ai 内置目录段的仅 Key 接入（ADR-0343）
doc_type: architecture
module: sage-shell
topic: pi-ai-catalog-provider-onboarding
status: stable
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# 018 收口 A2（ADR-0343）

## Problem

018 未闭项「pi-ai 段表单」的基线事实（按 vendor 源码逐条核验）：已装 pi-ai 目录含 41 个 provider；route key 命中已装 provider 时端点/协议/显示名/模型目录即 profile 默认值（`llm-pi-ai config.ts` 明文），仅 Key 的 `{apiKeyEnv}` 是合法完整形态且过 `assertServiceable`；`llm.listConfigurableProviders()` 以 `declared` 旗标区分目录条目与手写声明；`discoverModels` 对目录 provider 离线短路（无网络）。现状四处缺口：桥文法强制 api+baseURL+models、端口列表跳过无 baseURL 行、无目录读接缝、test 对目录路由无路可走。

## Decision

按 [ADR-0343](../../../adr/ADR-0343.md) 四项：目录读进桥（`modelConfig/providers` + `modelConfig/models`，纯读零网络、菜单懒读）；文法扩目录形态（成员资格宿主裁定，未知名具名拒 `bridge-model-catalog-unknown`）；目录路由 test 裁决 `builtin`（读活物化模型、**不做网络探测**——discoverModels 对目录 provider 的离线回答不是探测）；目录行 `catalog:true`/api/baseURL null、模型数活读、编辑仅 Key、菜单加「本机内置目录」组。

**不做的两件**（防混淆）：观测 17 项菜单条目不激活目录形态（观测语义=Qoder 网关词汇，与目录词汇不可分辨，会改写已钉复刻结构）；观测名→目录 id 的映射不猜（Kimi/智谱/MiniMax 等均二义以上，对照需独立证据）。

## Alternatives considered

见 ADR-0343 备选表（条目不激活/名字猜测映射/假绿探测/模型数固化/强制全量声明/无宿主校验——逐条否决）。

## Consequences

- 41 个目录 provider 一键接入（仅 Key）；目录路由自动入围 ADR-0340 的目录/默认/选择器面，发送路径零改动。
- 协议表 +2 read 端点；gate 面无新路由；服务消费登记（服务级）无变。
- 018 未闭项剩 D7（inventory overlayPolicyDigest）；矩阵欠项：A2 目录组与 composer 选择器同为 Sage 自建面，不新增 Sanbao 矩阵行。

## Verification

真实运行（2026-10-13）：

- `tsc --noEmit` 干净；`pnpm test` 全套件 **2206 passed（1 skip）**，244/244 文件（基线 2194 → 净增 12 例）。
- 新增/扩写 spec：host +4（目录形态保存四态：目录命中/未知名拒/手写声明名拒/空 profile 拒 + 全量声明不看目录 + 目录seam缺失拒；builtin 裁决（探测计数=0 断言）；providers 目录映射去杂；models 读三态）、端口/路由 +4（目录行活读模型与降级、providers 动作透传与不可达、builtin 记录透传与入列、路由 400 边界 + 目录形态 save 与 providers 读 200）、渲染 +4（目录组渲染与仅 Key 保存全链、目录行身份与 builtin 标签、目录行编辑留空保凭据、目录读不可用退观测菜单）。
- **实机验证（2026-10-13，v19 installed 副本，登录态 CDP）**：目录组出现（实测 43 项，含 deepseek/openai/google/openrouter）；选目录 deepseek → 仅 Key 表单（无端点字段）→ 探针凭据保存 → 行「内置目录 · 端点与模型来自已安装目录 · 模型 2 个 · 凭据 已设置」；行菜单「测试连接」→ 裁决标签「内置目录（2 个模型） · 未做网络探测」（零网络探测，不是假绿）。**发送**（真 key 回合）未跑：本会话无 `DEEPSEEK_API_KEY` 注入，如实标「待 key」。证据：同 v19 live-verify JSON。
