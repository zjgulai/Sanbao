---
title: Accio 专家体系逆向调研：数据模型、与 Sage 底座映射、3+50 内容源接入（ADR-0341）
doc_type: architecture
module: sage-shell
topic: expert-system-research
status: stable
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# Accio 专家体系逆向调研（ADR-0341）

对应决策：[ADR-0341](../../../adr/ADR-0341.md)。票据：[专家体系集成票](../../../plans/2026-10-13-expert-system-tickets.md)。

## Problem

用户指令：把 Accio.app 的「智能体」（0.34.4 改名「专家」）UI/UX 复刻到 Sage，Sage 语义 = Preset + 知识库组合，内容源为 AI组织变革项目 3 MGT + 50 AGT 岗位体系。需逆向调研 + 结合点讨论。

## 逆向方法与过程

- REA 6.4.0（`analyze-javascript-application`）：0.24.1 全量——8984 JS、855 模块、164 IPC（157 literal）、12 contextBridge API、45511 findings。
- asar 静态提取 + 主进程打包体字段挖掘（index.js 12MB / 0.34.4 gateway-worker.js 12MB）。
- 真机截图观察：0.24.1 智能体网格页、0.34.4 专家会话视图（用户中途更新版本，两版均采）。
- 中文文案零命中（renderer+main 全量字节搜）——文案运行时远程拉取（SaaS 型），数据模型是本地逆向可靠面。

## 逆向发现

1. **专家数据模型**：`{name, avatar, agentType, model:{provider,name,reasoningEffort,displayName}, systemPrompt, soulMd, allowedTools, mcpServers, defaultProject, runtime, agentInstanceId}`。soulMd = `# Soul`（人格）+ `# Identity`（身份）双文档 markdown（52 处引用，含 coder 默认样例全文）。
2. **agentType 内置 persona**（0.24.1 枚举）：coder/ecommerce/finance/product-manager/daily-assistant/reviewer/shopify-operator/dropshipper/main；0.34.4 另有内置专家注册表（id/version/name/description，如 `ecommerce → E-commerce Expert`）。
3. **0.34.4 语义升级**：「智能体」→「专家」+ 专家团（teamId 442 处，与账号/存储域绑定）+ 会话场景 tab（预设场景指令集）+ tone 枚举（professional/friendly/creative/concise/casual/expert）+ 动态子专家 spawn 工具（sessions_spawn + 「Create a highly specialised temporary agent…」）。
4. **知识库**：文件/文件夹上传（folderId+ownerType/teamId 直达）+ `<knowledge_base_refs>` 会话注入 + RAG（2834 处）。
5. **插件**：自由市场（plugin 4075/pluginId 1042/pluginStatus 全生命周期）——与 Sage Registry 治理模型结构性不同。

## Decision

按 [ADR-0341](../../../adr/ADR-0341.md) 六项决策实施：命名「专家」；ExpertProfile 独立概念组合 Preset；3+50 岗位为首批内置内容源（静态投影先行）；工具白名单只读 Registry；第一期=列表+创建/编辑+对话直通；零伪造（无存储面投影只读+按钮具名禁用）。

## 关键映射（Sage 全部底座已就位的部分）

| Accio | Sage | 备注 |
| --- | --- | --- |
| soulMd/systemPrompt | 3+50 的 soul.md + Role Playbook + preset-blueprint.identity | 50 套现成，design 状态 |
| model 面 | ADR-0339 model-config（并行会话刚落地） | 时机衔接 |
| allowedTools | Registry approved 只读 | ADR-0171 fail-closed |
| defaultProject | 工作区 custody | T03/T04 |
| 专家团 | L1-B 事项分组 | 后置 |
| 知识库 | T12 存储 provider | 后置（红线约束） |

## Alternatives considered

见 ADR-0341 备选表（Preset 别名、创建时申请新授权、知识库入一期、照搬自由市场、照搬文案——逐条否决）。

## Consequences

- Expert 是 Sage 第一个面向组织岗位的产品概念；AI组织变革 preset 设计资产（design_only_not_importable）获得第一个运行时消费者（投影形态）。
- 票链 EP-0..6 见集成票；EP-1 起需 tracked matrix 登记新产品面组。

## Verification

逆向证据真实运行：REA JSON（evidence_id/normalized_result.graph+semantic_graph）；asar 提取与字节级字段挖掘输出见本文；两版真机截图存会话记录（正式入仓随 EP-1）。本批为调研+决策文档，无产品代码改动。
