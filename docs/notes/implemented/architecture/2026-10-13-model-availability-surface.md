---
title: 模型可用面——实时目录、默认模型切换与 composer 选择器（ADR-0340）
doc_type: architecture
module: sage-shell
topic: model-availability-surface
status: stable
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# 模型可用面（ADR-0340）

## Problem

ADR-0339 后可保存自定义路由，但无途经在会话中使用：默认模型固定出厂值。基座接点核验：`sessionController.modelCatalog`（实时目录，自定义路由自动入围）与 `agentDefaultModel.saveSelection`（公开但盲写——基座明文归责消费者做可用性诊断）；Qoder composer 选择器为 static-only 观测（菜单从未展开）。

## Decision

按 [ADR-0340](../../../adr/ADR-0340.md) 四项：catalog 桥直读目录；default 桥**先对活目录校验**再写默认（未知项具名拒）；路由动作扩至六枚；composer 选择器懒加载 + 分组/✓/失败条 + logged-header 语义的切换文案。**组件集纪律**：settings 栈激活触发的描述符漂移按 ADR-0326 程序重发布（第二次执行，另见[配套记录](2026-10-13-second-cross-generation-republish.md)）。

## Alternatives considered

见 ADR-0340 备选表（盲写、挂载即读、会话级改选、复刻观测——逐条否决）。

关键一票：**先校验后写**——基座 saveSelection 盲写会把不可用默认写进文档并污染下一次请求；目录校验放在端口=唯一知道「现在什么可用」的位置。

## Consequences

- 目录/切换/选择器闭环；默认值持久（`agent-default-model` 行，实测）；选择器懒加载不打挂载请求。
- **实测挖出的两条承重事实**：（1）settings 栈激活=组件集变更 ⇒ sealed 三件失配 ⇒ 全部发送被 compatibility 拒——ADR-0326 程序第二次执行修复，发送恢复 `accepted`+真实回合 completed；（2）自定义模型面不在 sealed prompt 语义内——选为默认后发送仍拒（`stage: compatibility`）——「自定义模型可发」需要受治理的运行时声明路径（新票候选）。
- 后续：019 事项级改选；018 未闭项；自定义模型治理票。

## Verification

真实运行（2026-10-13）：

- 全套件 2185 通过（1 skip）；`gate` 32/32。
- spec：host +2（catalog 直读/解包、default 活目录校验四拒+override 具名）、port/route +2、选择器 6 例（懒加载标签/分组/切换回读/拒绝/不可用/关闭）。
- 真机：目录含自定义路由与 deepseek 双模型（含推理档位）；set-default 持久化（文件实证）；**重发布后发送 `accepted` → 回合 completed（回复 `ok`）**；compatibility 边界以探针 `stage=compatibility` 实证并登记。
- v18 DMG 验收记录另见 packaging note（若随批出包）。
