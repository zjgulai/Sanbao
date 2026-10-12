---
title: VF-0 阶段报告：Qoder 0.4.4 静态提取完成（可行性探针 + 语义 token 映射 + 几何面）
doc_type: analysis
module: sage-shell
topic: vf0-qoder-static-extraction
status: draft
created: 2026-10-12
updated: 2026-10-12
owner: self
source: ai
---

# VF-0 阶段报告：Qoder 0.4.4 静态提取完成

对应票据：[视觉保真票](../../../plans/2026-10-12-qoder-visual-fidelity-tickets.md)（VF-0）

## 已完成

1. **可行性探针**（`tmp/outputs/vf0-feasibility-probe-20261012.md`）：主题值是静态 CSS，无 JS 运行时注入（535 个 renderer JS 中 `setProperty` 对 token 的调用 = 0）。VF-0 走静态提取主路径。
2. **主题模型澄清**（本轮关键发现）：Qoder 的主题是 **per-theme 完整变量组**，不是 light/dark 二元：
   - 默认主题 = **forest**（JS 证据：`resolveThemeMode` 中 `auto→forest-dark`、light 模式强制 `dark→forest-light`；`"forest"` 为默认值）。
   - light 侧真源 = `:root:not([data-theme])` 默认组（157 变量）；dark 侧真源 = `html[data-theme=forest-dark]`（200 变量）。
   - `:root[data-theme=dark]` 只有 5 个图表彩色 token——**不是界面主题**。
   - 用户可选主题：light / dark / auto / bee / parchment / mint / forest（默认）。
   - 初版提取把 forest 系值误判为 light 值（Tailwind 预设区先匹配），已修正并记录来源选择器。
3. **语义 token 映射**（20 类，`drafts/analysis/qoder-re/qoder-044-semantic-class-map-draft-20261012.json`）：Tailwind 语义工具类（`bg-base` / `text-secondary` / `text-on-primary`…，JS 内出现次数 20–732）→ 哈希 var → 双主题字面值。抽样：

   | 语义 | light | dark(forest-dark) |
   |---|---|---|
   | `bg-base` 画布 | `#fff` | `#0e0e0e` |
   | `bg-container` 容器 | `#fff` | `#111110` |
   | `bg-elevated` 浮起 | `#f9f9f9` | `#22221f` |
   | `text` 正文 | `#141414` | `#eeeeeb` |
   | `text-secondary` | `#636261` | `#b4b4ac` |
   | `primary` 强调 | `#4b6f5a` | `#5cb870` |
   | `text-on-primary` | `#fdfdfd` | `#080807` |
   | `success` | `#579b6e` | `#73cd94` |
   | `warning` | `#efb041` | `#faad14` |
   | `info` | `#3b81e9` | `#0b83f1` |

4. **几何面**（`drafts/analysis/qoder-re/qoder-044-geometry-draft-20261012.json`）：radius xs–xl（.125–.75rem）、字号 xs–2xl（.75–1.5rem）、间距单位 `.25rem`、表面阴影与按钮阴影实值。
5. **全主题原始变量组**（`drafts/analysis/qoder-re/qoder-044-all-theme-vars-draft-20261012.json`）：11 个主题块的 `--q*` 全量备份。

## 关键结构性发现（影响 VF-1 设计）

- **Sage `theme-tokens.ts` 的语义名单必须扩**：Qoder 的界面语义是「4 级文字阶梯（text/secondary/tertiary/quaternary）+ 4 级边框阶梯 + base/container/elevated/highlight/layout 五级背景 + primary 系四件（主色/背景/边框/on-色）」。Sage 现有 19 token 归并不下这套层次。VF-1 的映射决策点在这里。
- **Qoder 是浅色界面 + 哈希工具类混合**：语义层在 Tailwind 类名里，不在 var 名里。Sage 复刻应取「语义类 → 值」这层，不照搬哈希命名。
- dark 值基本是字面量（少量 `color-mix` 派生集中在图表色），映射成本低。

## 未完成（VF-0 剩余）

1. **真机截图基线**：Qoder 正在运行（用户会话中），截图需用户在场配合；条件记录（窗口/主题/缩放）随图入库 `assets/qoder-reference/screenshots/`。
2. **token 级真机抽验**：CDP `getComputedStyle` 互证（每 token 2–3 个）。
3. **组件级几何实测**（按钮/弹窗/输入的实际 padding/高度——工具类粒度已有，组件组合需真机量）。

## 明确不做

- 不把提取 JSON 提升为正式资产（drafts 状态；VF-1 映射决策后随批转正）。
- 不动 Sage 任何样式（VF-1/2 射程）。
