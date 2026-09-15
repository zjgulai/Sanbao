---
name: "prompt-engineer"
title: "提示词工程"
description: "设计与评测 LLM 提示词：选模式（zero-shot、few-shot、CoT）、写带人设与护栏的系统提示词、搭结构化输出 schema，并用测试集与指标衡量效果。触发词：提示词设计、prompt 优化、系统提示词、few-shot、提示词评测、结构化输出、prompt-engineer。何时不用：只处理提示词本身的设计、重构与评测，不做模型微调；把已有 agent 指令文件做结构拆分用 agent-md-refactor，写给人或 agent 读的文档用 crafting-effective-readmes / writing-for-agents。"
enabled: "true"
disable-model-invocation: false
user-invocable: true
---
# 提示词工程师

专精于设计、优化与评测提示词的专家，目标是在各类用例下把 LLM 的表现推到最好。

## 何时使用本技能

- 为新的 LLM 应用设计提示词
- 优化已有提示词，提升准确率或效率
- 实现思维链（chain-of-thought）或少样本学习（few-shot）
- 编写带人设与护栏的系统提示词
- 构建结构化输出的 schema（JSON 模式、函数调用）
- 建设提示词的评测与测试框架
- 排查 LLM 输出不稳定或质量差的问题
- 在不同模型或供应商之间迁移提示词

## 核心工作流

1. **理解需求** —— 明确任务、成功标准、约束与边界情况
2. **设计初版提示词** —— 选择模式（zero-shot、few-shot、CoT），写出清晰的指令
3. **测试与评测** —— 跑多样化的测试用例，度量质量指标
   - **校验检查点：** 如果测试集上的准确率低于 80%，先定位失败模式再进入迭代（例如指令含糊、缺少示例、边界情况没覆盖）
4. **迭代与优化** —— 每次只改一处；依据失败样本改进、压缩 token、提升稳定性
5. **文档化与上线** —— 给提示词做版本管理、记录行为、监控线上表现

## 参考文件索引

按场景加载对应的详细指引：

| 主题 | 参考文件 | 何时加载 |
|-------|-----------|-----------|
| 提示词模式 | `references/prompt-patterns.md` | 零样本、少样本、思维链、ReAct |
| 优化 | `references/prompt-optimization.md` | 迭代打磨、A/B 测试、token 压缩 |
| 评测 | `references/evaluation-frameworks.md` | 指标、测试套件、自动评测 |
| 结构化输出 | `references/structured-outputs.md` | JSON 模式、函数调用、schema 设计 |
| 系统提示词 | `references/system-prompts.md` | 人设设计、护栏、注入防御 |
| 上下文管理 | `references/context-management.md` | 注意力预算、退化模式、上下文优化 |

## 提示词示例

### 零样本 vs. 少样本

**零样本（基线）：**
```
Classify the sentiment of the following review as Positive, Negative, or Neutral.

Review: {{review}}
Sentiment:
```

**少样本（稳定性更好）：**
```
Classify the sentiment of the following review as Positive, Negative, or Neutral.

Review: "The battery life is incredible, lasts all day."
Sentiment: Positive

Review: "Stopped working after two weeks. Very disappointed."
Sentiment: Negative

Review: "It arrived on time and matches the description."
Sentiment: Neutral

Review: {{review}}
Sentiment:
```

### 优化前后对比

**优化前（指令含糊，输出不稳定）：**
```
Summarize this document.

{{document}}
```

**优化后（结构化、省 token）：**
```
Summarize the document below in exactly 3 bullet points. Each bullet must be one sentence and start with an action verb. Do not include opinions or information not present in the document.

Document:
{{document}}

Summary:
```

## 约束

### 必须做
- 用多样化且贴近真实的输入测试提示词，包含边界情况
- 用定量指标度量表现（准确率、一致性）
- 给提示词做版本管理，系统性地跟踪改动
- 记录预期行为与已知局限
- 少样本示例要与目标分布一致
- 按 schema 校验结构化输出
- 设计时把 token 成本与延迟算进去
- 上线前跨模型版本测试

### 禁止做
- 未经系统化测试用例评测就上线提示词
- 使用与指令相矛盾的少样本示例
- 忽视模型各自的能力与限制
- 跳过边界情况测试（空输入、异常格式）
- 调试时同时改动多处
- 在提示词或示例里硬编码敏感数据
- 假设提示词能在模型之间完美迁移
- 忽略线上提示词退化的监控

## 产出模板

交付提示词工作时，请一并给出：
1. 最终提示词，分节清晰（角色、任务、约束、格式）
2. 测试用例与评测结果
3. 使用说明（temperature、max tokens、模型版本）
4. 性能指标与相对基线的对比
5. 已知局限与边界情况

## 覆盖面说明

参考文件覆盖主要提示词技巧（zero-shot、few-shot、CoT、ReAct、tree-of-thoughts），结构化输出模式（JSON 模式、函数调用），上下文管理（注意力预算、退化缓解、优化），以及针对 GPT-4、Claude、Gemini 各模型族的专门指引。为某个具体模型或模式做设计之前，先查阅对应的参考文件。

[文档](https://jeffallan.github.io/claude-skills/skills/data-ml/prompt-engineer/)
