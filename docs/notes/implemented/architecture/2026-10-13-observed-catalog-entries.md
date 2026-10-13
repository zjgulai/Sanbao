---
title: 观测菜单同名条目接目录形态——OpenAI/Google/OpenRouter（ADR-0345）
doc_type: architecture
module: sage-shell
topic: observed-catalog-entries
status: stable
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# 观测菜单同名条目接目录形态（ADR-0345）

## Problem

L2 侦察结论（`drafts/analysis/analysis-qoder-provider-key-mapping-draft-20261013.md`）：观测「更多」组 17 项中，OpenAI / Google / OpenRouter 与已装 pi-ai 目录 id 同名且语义一致；其余条目目录映射多候选（Kimi×3、MiniMax×2、智谱×2、小米×4、千问×2×3、阿里云百炼无对应），且端点常量不在 Qoder 二进制内（catalog 形态由服务端目录决定）。观测菜单中这三项此前点击无响应。

## Decision

按 [ADR-0345](../../../adr/ADR-0345.md) 三项：静态同名映射 `OBSERVED_CATALOG_PROVIDERS`（OpenAI→openai、Google→google、OpenRouter→openrouter）接 ADR-0343 目录形态（仅 Key）；未映射条目保持惰性；观测入口显示观测标签、目录组入口显示目录 id，同路由共存。

## Alternatives considered

见 ADR-0345 备选表（动态同名匹配 / 顺带近似映射 / 单入口——逐条否决）。

## Consequences

- 观测「更多」组 4 项可用（+DeepSeek）；未接线 8 项的判定逐项在 L2 草稿，方法=受控网络观察（另票）。
- 复用 A2 全部机制，无新桥端点；矩阵零改动（provider.open 行已 verified）。

## Verification

真实运行（2026-10-13）：

- `tsc --noEmit` 干净。
- 渲染 spec +2（OpenRouter 观测条目→仅 Key 表单→保存路由 openrouter 与 OPENROUTER_API_KEY；Google 映射与 Kimi 惰性对照——点击不改变表单）。
- 全套件 `pnpm test`：**2225 passed（1 skip）**，246/246 文件全绿（sage-16 的在途 probe 本批间转绿）。
- 实机（staging）：**未运行**——随 sage-16 窗口后的合并批（A1/A2/A3/A4 复验 + v19）。
