---
title: 工作区文件上下文菜单（真实 T03 候选）
doc_type: architecture
module: sage-shell
topic: files-menu
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 工作区文件上下文菜单（真实 T03 候选）

## Problem

`QDR.O02.files.menu.open`：输入区「工作区文件」菜单——搜索输入 + 文件行；Left 返回上下文根后 AX 回输入入口；未选文件；过滤语义未验证。desktop 上下文菜单此前对该项只出「不可用」；真实数据源（`/.sage/workspace/files/candidates`，T03 链）早已存在。

## Decision

按 [ADR-0311](../../../adr/ADR-0311.md) 实施：新模块 `desktop/files.ts` 消费真实 route；子菜单（搜索输入获焦 + 候选行 + 本地过滤[推断，登记] + truncated 披露 + loading 具名）；行点击具名拒绝；空查询 Left 回根、根层再 Left 关闭回输入入口；非空查询 Left 保留光标语义；无会话保留旧通知（两处既有仪器状态不变）。请求纪元守卫 + 全关闭路径统一重置。files.menu.open 迁 implementing；O02 伞行（6/6）核销。

## Alternatives considered

见 ADR-0311 备选表（无会话也装、声称服务端过滤、静默选择、页面级挂载——逐条否决）。

## Consequences

- O02 组 6/6 叶闭环；矩阵 85→87 implementing、113→111 pending。
- 选择/附加真实路径、bytes 显示、过滤语义登记 blocker；几何修复经真引擎红绿验证。

## Verification

真实运行（2026-10-11）：

- **对抗评审 workflow**（4 透镜 → 逐条反驳 → 完备性批评；13 agents）：18 原始发现 → 8 去重 → 6 确认全部修复；1 项被反驳（files.ts 畸形条目 continue——唯一生产者契约下死分支）。四项评审驱动新测试入 spec（非空查询 Left、根层 Left 关闭回入口、慢请求竞态、外击重开新鲜）。
- **CSS 几何双缺陷经 Chrome 真引擎红/绿实测**：修复前 flyout 被根菜单 overflow 裁剪（elementFromPoint 三行全 miss）/ 基类 bottom:100% 过约束致高度 143px→10px 塌缩；修复后三行全命中 / 高度 143px 稳定。（jsdom 无法见布局——此仪器为几何类缺陷的必需补充。）
- `node scripts/test.mjs run test/product-app/desktop-files-menu.spec.tsx` → **9/9**；全量套件与门禁读数见提交记录。
