---
title: VF-0 扩图 SH-2 批：会话态 4 张（起草/流式/完成+工具折叠/摘要卡）
doc_type: analysis
module: sage-shell
topic: vf-sh2-screenshots
status: draft
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# VF-0 扩图 SH-2 批：4 张（`assets/qoder-reference/screenshots/base-20261013-sh2/`）

对应票据：[VF 扩图与族推进计划](../../../plans/2026-10-13-vf-expansion-plan.md)（SH-2）
授权：用户 2026-10-13「2.授权」（真实任务运行，token 消耗已知）。任务：「List the files in the current directory, then say done.」模型 Qwen3.8-Flash（免费档），单回合完成，无审批卡。

## 清单

| 文件 | 状态 | 覆盖证据面 |
|---|---|---|
| `composer-focused-…png` | 输入框聚焦 | composer 聚焦态 |
| `composer-drafted-…png` | 文本已入框 | 发送前态（含模型选择器/完全访问/附件/权限下拉全控件） |
| `session-streaming-…png` | 流式中 | **思考状态文案「提炼一下…」+ 音符 loader + 停止按钮（方块）+ 右栏环境信息卡（无变更/本地/分支/提交或推送）+ 产出/来源折叠 + 任务标题进侧栏** |
| `session-toolcall-…png` | 完成 | **「执行工具 1 次」折叠条 + 回复文本 + 操作行（复制/赞/踩/分享/…）+ 右栏任务摘要卡（星标+更新于）+ 底部上下文进度条 6%** |

## 关键发现（Sage 会话族对齐点）

1. **思考状态是轮换文案 + 音符 loader**（非 spinner）——与 ADR-0337 之前观察一致；Sage 的 thinking loader 应复刻此形态。
2. **停止按钮 = 发送按钮原位变形**（↑ → ■），非独立按钮。
3. **工具调用是折叠条**「N 执行工具 M 次」+ 序号圆徽——不是展开卡片；Sage 的 turn-process 面对齐此形态。
4. **右栏环境信息卡**四行（变更/本地/分支/提交）+ 产出/来源折叠 + Quick Notes——Sage 右栏（artifact-rail）的分区参照。
5. **上下文进度条**在 composer 下方右侧（6% 绿条）——Sage 未有此件，FV-6 会话族补。
6. 无审批卡路径：完全访问模式下小任务不触发审批；审批卡证据需受限权限模式另跑（留待需要时）。

## SH-2 完成度

计划 8 张 → 实际 4 张（该任务形态不触发审批/队列/产物卡；多轮/审批/产物态留待 FV-6 会话族按需补采——以行为线测试需要的证据为准，不无限采图）。
